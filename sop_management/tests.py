from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from django.urls import reverse

from .content import sanitize_document_html
from .forms import DocumentForm, DocumentVersionForm
from .models import Document, DocumentVersion
from .services import approve_version, save_version_edit


class DocumentVersionLifecycleTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="governance",
            first_name="Clinical",
            last_name="Approver",
        )
        self.document = Document.objects.create(
            document_code="GHC-SOP-001",
            county="Kajiado",
            sub_county="Kajiado South",
            owner="Patient Safety (PS)",
        )

    def make_version(self, *, number, status, active, approved_by=""):
        return DocumentVersion.objects.create(
            document=self.document,
            title=f"Safe care v{number}",
            body="<p>Approved content</p>",
            effective_date=date(2026, 1, 1),
            review_date=date(2027, 1, 1),
            version_number=Decimal(number),
            status=status,
            is_active=active,
            approved_by=approved_by,
            created_by=self.user,
        )

    def test_owner_field_has_grouped_committee_and_department_choices(self):
        choices = DocumentForm().fields["owner"].choices
        self.assertEqual(choices[0][0], "Committees")
        self.assertEqual(choices[1][0], "Departments")
        self.assertIn("Patient Safety (PS)", dict(choices[0][1]))
        self.assertIn("Nursing", dict(choices[1][1]))

    def test_existing_owner_is_available_when_editing_document(self):
        self.document.owner = "Clinical Governance Board"
        self.document.save()
        choices = DocumentForm(instance=self.document).fields["owner"].choices
        self.assertIn("Clinical Governance Board", dict(choices[-1][1]))

    def test_approving_draft_archives_previous_active_version(self):
        previous = self.make_version(
            number="1.0",
            status=DocumentVersion.Status.APPROVED,
            active=True,
            approved_by="Previous approver",
        )
        draft = self.make_version(
            number="1.1",
            status=DocumentVersion.Status.DRAFT,
            active=False,
        )

        approve_version(
            document_id=self.document.pk,
            version_id=draft.pk,
            user=self.user,
            approver_designation="Clinical Director",
        )

        previous.refresh_from_db()
        draft.refresh_from_db()
        self.assertEqual(previous.status, DocumentVersion.Status.ARCHIVED)
        self.assertFalse(previous.is_active)
        self.assertEqual(draft.status, DocumentVersion.Status.APPROVED)
        self.assertTrue(draft.is_active)
        self.assertEqual(draft.approved_by, "Clinical Approver")
        self.assertEqual(draft.approver_designation, "Clinical Director")
        self.assertEqual(draft.approval_date, timezone.localdate())

    def test_editing_approved_version_creates_a_new_draft(self):
        approved = self.make_version(
            number="1.0",
            status=DocumentVersion.Status.APPROVED,
            active=True,
            approved_by="Existing approver",
        )
        form = DocumentVersionForm(
            data={
                "title": "Safe care revised",
                "body": "<h2>Revised content</h2>",
                "effective_date": "2026-02-01",
                "review_date": "2027-02-01",
            },
            instance=approved,
        )
        self.assertTrue(form.is_valid(), form.errors)

        draft = save_version_edit(
            document_id=self.document.pk,
            version_id=approved.pk,
            form=form,
            user=self.user,
        )

        approved.refresh_from_db()
        self.assertNotEqual(draft.pk, approved.pk)
        self.assertEqual(draft.version_number, Decimal("1.1"))
        self.assertEqual(draft.status, DocumentVersion.Status.DRAFT)
        self.assertFalse(draft.is_active)
        self.assertEqual(approved.title, "Safe care v1.0")
        self.assertTrue(approved.is_active)

    def test_only_drafts_can_be_approved(self):
        archived = self.make_version(
            number="1.0",
            status=DocumentVersion.Status.ARCHIVED,
            active=False,
            approved_by="Previous approver",
        )
        with self.assertRaises(ValidationError):
            approve_version(
                document_id=self.document.pk,
                version_id=archived.pk,
                user=self.user,
                approver_designation="Clinical Director",
            )

    def test_approval_requires_approver_designation(self):
        draft = self.make_version(
            number="1.0",
            status=DocumentVersion.Status.DRAFT,
            active=False,
        )
        with self.assertRaises(ValidationError):
            approve_version(
                document_id=self.document.pk,
                version_id=draft.pk,
                user=self.user,
                approver_designation="",
            )

    def test_rich_text_sanitizer_removes_scripts_and_event_handlers(self):
        safe_html = sanitize_document_html(
            '<p onclick="alert(1)" style="color:#17365D">'
            "Policy text<script>alert(2)</script></p>"
        )
        self.assertNotIn("onclick", safe_html)
        self.assertNotIn("<script", safe_html)
        self.assertIn("Policy text", safe_html)


class DocumentWebsiteAccessTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="reader",
        )

    def test_anonymous_user_can_browse_document_list(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "GLOCAL HEALTHCARE CENTRE OF EXCELLENCE")
        self.assertNotContains(response, "Sign in")
        self.assertNotContains(response, "Sign out")

    def test_app_sign_in_routes_are_removed(self):
        self.assertEqual(self.client.get("/accounts/login/").status_code, 404)
        self.assertEqual(self.client.get("/accounts/logout/").status_code, 404)

    def test_anonymous_user_can_view_approved_document_and_pdf(self):
        document = Document.objects.create(
            document_code="GHC-POL-002",
            county="Kajiado",
            sub_county="Kajiado South",
            owner="Quality Assurance (QA)",
        )
        DocumentVersion.objects.create(
            document=document,
            title="Safe patient care",
            body="<h2>Policy</h2><p>Use approved clinical procedures.</p>",
            approved_by="Clinical Approver",
            approver_designation="Clinical Director",
            approval_date=date(2026, 1, 1),
            effective_date=date(2026, 1, 1),
            review_date=date(2027, 1, 1),
            version_number=Decimal("1.0"),
            status=DocumentVersion.Status.APPROVED,
            is_active=True,
            created_by=self.user,
        )

        detail_response = self.client.get(
            reverse("sop_management:document_detail", args=(document.pk,))
        )
        response = self.client.get(
            reverse("sop_management:document_pdf", args=(document.pk,))
        )
        list_response = self.client.get(reverse("sop_management:document_list"))

        self.assertEqual(detail_response.status_code, 200)
        self.assertContains(detail_response, "Safe patient care")
        self.assertContains(detail_response, "Clinical Approver")
        self.assertContains(detail_response, "Clinical Director")
        self.assertContains(detail_response, "01 Jan 2026")
        self.assertContains(list_response, "GHC-POL-002")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF-"))

    def test_anonymous_user_cannot_view_unapproved_document(self):
        document = Document.objects.create(
            document_code="GHC-DRAFT-003",
            county="Kajiado",
            sub_county="Kajiado South",
            owner="Admin",
        )
        DocumentVersion.objects.create(
            document=document,
            title="Unapproved draft",
            body="<p>Not yet approved</p>",
            effective_date=date(2026, 1, 1),
            review_date=date(2027, 1, 1),
            version_number=Decimal("1.0"),
            status=DocumentVersion.Status.DRAFT,
            is_active=False,
            created_by=self.user,
        )
        detail_response = self.client.get(
            reverse("sop_management:document_detail", args=(document.pk,))
        )
        list_response = self.client.get(reverse("sop_management:document_list"))

        self.assertEqual(detail_response.status_code, 404)
        self.assertNotContains(list_response, "GHC-DRAFT-003")

    def test_write_workflow_still_requires_staff_authentication(self):
        response = self.client.get(reverse("sop_management:document_create"))
        self.assertRedirects(
            response,
            f"/admin/login/?next={reverse('sop_management:document_create')}",
            fetch_redirect_response=False,
        )
