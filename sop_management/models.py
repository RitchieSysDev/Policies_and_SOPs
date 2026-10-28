from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from .content import sanitize_document_html


OWNER_CHOICES = (
    (
        "Committees",
        (
            ("Infection Prevention and Control (IPC)", "Infection Prevention and Control (IPC)"),
            ("Maternal and Paediatric Death Surveillance Response (MPDSR)", "Maternal and Paediatric Death Surveillance Response (MPDSR)"),
            ("Medicines and Therapeutic Committee (MTC)", "Medicines and Therapeutic Committee (MTC)"),
            ("Patient Safety (PS)", "Patient Safety (PS)"),
            ("Quality Assurance (QA)", "Quality Assurance (QA)"),
        ),
    ),
    (
        "Departments",
        (
            ("Admin", "Admin"),
            ("Clinical Office", "Clinical Office"),
            ("Nursing", "Nursing"),
            ("Laboratory", "Laboratory"),
            ("Pharmacy", "Pharmacy"),
            ("Support", "Support"),
        ),
    ),
)


class Committee(models.Model):
    name = models.CharField(max_length=200, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)
        verbose_name_plural = "committees"

    def __str__(self):
        return self.name


class Document(models.Model):
    document_code = models.CharField(max_length=50, unique=True)
    facility_level = models.CharField(max_length=50, default="Level 3B")
    county = models.CharField(max_length=100)
    sub_county = models.CharField(max_length=100)
    owner = models.CharField(
        "Owner (Committee or Department)",
        max_length=200,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("document_code",)

    def __str__(self):
        return self.document_code

    def save(self, *args, **kwargs):
        if self.pk:
            original_code = (
                type(self).objects.filter(pk=self.pk)
                .values_list("document_code", flat=True)
                .first()
            )
            if original_code is not None and original_code != self.document_code:
                raise ValidationError({"document_code": "Document code is immutable."})
        return super().save(*args, **kwargs)


class DocumentVersion(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        APPROVED = "APPROVED", "Approved"
        ARCHIVED = "ARCHIVED", "Archived"

    document = models.ForeignKey(
        Document,
        on_delete=models.PROTECT,
        related_name="versions",
    )
    title = models.CharField(max_length=255)
    body = models.TextField()
    approved_by = models.CharField(max_length=200, blank=True)
    approver_designation = models.CharField(max_length=200, blank=True)
    approval_date = models.DateField(null=True, blank=True)
    effective_date = models.DateField()
    review_date = models.DateField()
    version_number = models.DecimalField(max_digits=5, decimal_places=1)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    is_active = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sop_versions_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("document_id", "-version_number")
        constraints = [
            models.UniqueConstraint(
                fields=("document", "version_number"),
                name="sop_unique_document_version",
            ),
            models.CheckConstraint(
                condition=Q(review_date__gte=models.F("effective_date")),
                name="sop_review_on_or_after_effective",
            ),
        ]

    def __str__(self):
        return f"{self.document.document_code} v{self.version_number}"

    def clean(self):
        super().clean()
        if self.is_active and self.status != self.Status.APPROVED:
            raise ValidationError(
                {"is_active": "Only an approved version can be active."}
            )
        if self.status == self.Status.APPROVED and not self.approved_by:
            raise ValidationError(
                {"approved_by": "An approver is required for approved versions."}
            )
        if self.review_date and self.effective_date:
            if self.review_date < self.effective_date:
                raise ValidationError(
                    {"review_date": "Review date cannot precede the effective date."}
                )

    def save(self, *args, **kwargs):
        self.body = sanitize_document_html(self.body)
        return super().save(*args, **kwargs)


def next_version_number(document_id):
    latest = (
        DocumentVersion.objects.filter(document_id=document_id)
        .order_by("-version_number")
        .values_list("version_number", flat=True)
        .first()
    )
    return Decimal("1.0") if latest is None else latest + Decimal("0.1")
