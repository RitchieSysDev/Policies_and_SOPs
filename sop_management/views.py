import logging
from io import BytesIO
from urllib.parse import quote

from django.contrib.auth.decorators import login_required, permission_required
from django.core.exceptions import PermissionDenied, ValidationError
from django.db.models import Prefetch
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_POST
from xhtml2pdf import pisa

from .forms import DocumentForm, DocumentVersionForm
from .models import Document, DocumentVersion
from .services import approve_version, create_version_draft, save_version_edit

logger = logging.getLogger(__name__)


@never_cache
def document_list(request):
    active_versions = DocumentVersion.objects.filter(
        is_active=True,
        status=DocumentVersion.Status.APPROVED,
    )
    documents = Document.objects.prefetch_related(
        Prefetch("versions", queryset=active_versions, to_attr="active_versions")
    )
    if not request.user.is_authenticated:
        documents = documents.filter(
            versions__is_active=True,
            versions__status=DocumentVersion.Status.APPROVED,
        ).distinct()
    return render(request, "sop_management/document_list.html", {"documents": documents})


@never_cache
def document_detail(request, pk):
    document = get_object_or_404(
        Document.objects,
        pk=pk,
    )
    version = document.versions.filter(
        status=DocumentVersion.Status.APPROVED,
        is_active=True,
    ).first()
    can_manage = request.user.is_authenticated and request.user.has_perm(
        "sop_management.change_documentversion"
    )
    if version is None and not can_manage:
        raise Http404("No approved version is available for public viewing.")
    version_history = document.versions.all()
    if not can_manage:
        version_history = version_history.exclude(
            status=DocumentVersion.Status.DRAFT
        )
    return render(
        request,
        "sop_management/document_detail.html",
        {
            "document": document,
            "version": version,
            "version_history": version_history,
        },
    )


@login_required
@permission_required("sop_management.add_document", raise_exception=True)
@permission_required("sop_management.add_documentversion", raise_exception=True)
@permission_required("sop_management.change_documentversion", raise_exception=True)
@never_cache
def document_create(request):
    form = DocumentForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        document = form.save()
        return redirect("sop_management:version_create", document_id=document.pk)
    return render(
        request,
        "sop_management/form.html",
        {"form": form, "page_title": "Register a document"},
    )


@login_required
@permission_required("sop_management.add_documentversion", raise_exception=True)
@permission_required("sop_management.change_documentversion", raise_exception=True)
@never_cache
def version_create(request, document_id):
    document = get_object_or_404(Document, pk=document_id)
    form = DocumentVersionForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        version = create_version_draft(
            document_id=document.pk,
            form=form,
            user=request.user,
        )
        return redirect(
            "sop_management:version_edit",
            document_id=document.pk,
            version_id=version.pk,
        )
    return render(
        request,
        "sop_management/form.html",
        {"form": form, "page_title": f"Create draft — {document.document_code}"},
    )


@login_required
@permission_required("sop_management.change_documentversion", raise_exception=True)
@never_cache
def version_edit(request, document_id, version_id):
    document = get_object_or_404(Document, pk=document_id)
    source = get_object_or_404(
        DocumentVersion,
        pk=version_id,
        document=document,
    )
    if source.status == DocumentVersion.Status.ARCHIVED:
        raise PermissionDenied("Archived versions cannot be edited.")

    form = DocumentVersionForm(request.POST or None, instance=source)
    if request.method == "POST" and form.is_valid():
        try:
            version = save_version_edit(
                document_id=document.pk,
                version_id=source.pk,
                form=form,
                user=request.user,
            )
        except ValidationError as exc:
            form.add_error(None, exc)
            return render(
                request,
                "sop_management/form.html",
                {
                    "form": form,
                    "page_title": "Version changed while you were editing",
                    "version": source,
                },
                status=409,
            )
        return redirect(
            "sop_management:version_detail",
            document_id=document.pk,
            version_id=version.pk,
        )
    return render(
        request,
        "sop_management/form.html",
        {
            "form": form,
            "page_title": (
                f"Revise approved version — {source}"
                if source.status == DocumentVersion.Status.APPROVED
                else f"Edit draft — {source}"
            ),
            "version": source,
        },
    )


@never_cache
def version_detail(request, document_id, version_id):
    document = get_object_or_404(Document, pk=document_id)
    version = get_object_or_404(
        DocumentVersion,
        pk=version_id,
        document=document,
    )
    can_manage = request.user.is_authenticated and request.user.has_perm(
        "sop_management.change_documentversion"
    )
    if version.status == DocumentVersion.Status.DRAFT and not can_manage:
        raise PermissionDenied
    return render(
        request,
        "sop_management/document_detail.html",
        {
            "document": document,
            "version": version,
            "version_history": (
                document.versions.all()
                if can_manage
                else document.versions.exclude(status=DocumentVersion.Status.DRAFT)
            ),
            "is_version_preview": True,
        },
    )


@login_required
@permission_required("sop_management.change_documentversion", raise_exception=True)
@never_cache
@require_POST
def version_approve(request, document_id, version_id):
    try:
        approve_version(
            document_id=document_id,
            version_id=version_id,
            user=request.user,
            approver_designation=request.POST.get("approver_designation", ""),
        )
    except ValidationError as exc:
        return HttpResponse("; ".join(exc.messages), status=400)
    return redirect("sop_management:document_detail", pk=document_id)


@never_cache
def document_pdf(request, pk):
    document = get_object_or_404(
        Document.objects,
        pk=pk,
    )
    version = document.versions.filter(
        status=DocumentVersion.Status.APPROVED,
        is_active=True,
    ).first()
    if version is None:
        return HttpResponse("No approved active version is available.", status=404)

    html = render(
        request,
        "sop_management/document_detail.html",
        {"document": document, "version": version, "pdf_mode": True},
    ).content.decode("utf-8")
    pdf_buffer = BytesIO()
    pdf_result = pisa.CreatePDF(
        src=html,
        dest=pdf_buffer,
        encoding="utf-8",
    )
    if pdf_result.err:
        logger.error(
            "PDF rendering failed for document %s: %s",
            document.document_code,
            pdf_result.log,
        )
        return HttpResponse("The PDF could not be rendered.", status=500)

    response = HttpResponse(pdf_buffer.getvalue(), content_type="application/pdf")
    filename = quote(
        f"{document.document_code}-v{version.version_number}.pdf",
        safe="",
    )
    response["Content-Disposition"] = f"inline; filename*=UTF-8''{filename}"
    response["X-Content-Type-Options"] = "nosniff"
    return response
