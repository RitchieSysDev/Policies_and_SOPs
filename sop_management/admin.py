from django.contrib import admin

from .forms import DocumentForm
from .models import Committee, Document, DocumentVersion


@admin.register(Committee)
class CommitteeAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


class DocumentVersionInline(admin.TabularInline):
    model = DocumentVersion
    extra = 0
    can_delete = False
    readonly_fields = tuple(field.name for field in DocumentVersion._meta.fields)

    def has_add_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    form = DocumentForm
    list_display = (
        "document_code",
        "facility_level",
        "county",
        "sub_county",
        "owner",
    )
    search_fields = ("document_code", "county", "sub_county", "owner")
    list_filter = ("facility_level", "county", "owner")
    inlines = (DocumentVersionInline,)

    def get_readonly_fields(self, request, obj=None):
        return ("document_code",) if obj else ()


@admin.register(DocumentVersion)
class DocumentVersionAdmin(admin.ModelAdmin):
    list_display = (
        "document",
        "version_number",
        "title",
        "status",
        "is_active",
        "effective_date",
        "review_date",
    )
    list_filter = ("status", "is_active", "effective_date")
    search_fields = (
        "document__document_code",
        "title",
        "approved_by",
        "approver_designation",
    )
    readonly_fields = tuple(field.name for field in DocumentVersion._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
