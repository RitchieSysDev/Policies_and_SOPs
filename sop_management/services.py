from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .models import Document, DocumentVersion, next_version_number


@transaction.atomic
def create_version_draft(*, document_id, form, user):
    document = Document.objects.select_for_update().get(pk=document_id)
    version = form.save(commit=False)
    version.document = document
    version.version_number = next_version_number(document.pk)
    version.created_by = user
    version.status = DocumentVersion.Status.DRAFT
    version.is_active = False
    version.approved_by = ""
    version.save()
    return version


@transaction.atomic
def save_version_edit(*, document_id, version_id, form, user):
    document = Document.objects.select_for_update().get(pk=document_id)
    source = (
        DocumentVersion.objects.select_for_update()
        .get(pk=version_id, document=document)
    )

    if source.status == DocumentVersion.Status.ARCHIVED:
        raise ValidationError("Archived versions cannot be edited.")

    edited_version = form.save(commit=False)
    if source.status == DocumentVersion.Status.APPROVED:
        version = DocumentVersion(
            document=document,
            version_number=next_version_number(document.pk),
            created_by=user,
            title=edited_version.title,
            body=edited_version.body,
            effective_date=edited_version.effective_date,
            review_date=edited_version.review_date,
        )
    else:
        version = source
        version.title = edited_version.title
        version.body = edited_version.body
        version.effective_date = edited_version.effective_date
        version.review_date = edited_version.review_date
    version.document = document
    version.version_number = (
        next_version_number(document.pk)
        if source.status == DocumentVersion.Status.APPROVED
        else source.version_number
    )
    version.created_by = user
    version.status = DocumentVersion.Status.DRAFT
    version.is_active = False
    version.approved_by = ""
    version.save()
    return version


@transaction.atomic
def approve_version(*, document_id, version_id, user):
    document = Document.objects.select_for_update().get(pk=document_id)
    version = (
        DocumentVersion.objects.select_for_update()
        .get(pk=version_id, document=document)
    )
    if version.status != DocumentVersion.Status.DRAFT:
        raise ValidationError("Only draft versions can be approved.")
    if version.review_date < version.effective_date:
        raise ValidationError("Review date cannot precede the effective date.")

    DocumentVersion.objects.filter(
        document=document,
        is_active=True,
    ).exclude(pk=version.pk).update(
        is_active=False,
        status=DocumentVersion.Status.ARCHIVED,
        updated_at=timezone.now(),
    )
    version.status = DocumentVersion.Status.APPROVED
    version.is_active = True
    version.approved_by = user.get_full_name().strip() or user.get_username()
    version.full_clean()
    version.save(
        update_fields=(
            "status",
            "is_active",
            "approved_by",
            "body",
            "updated_at",
        )
    )
    return version
