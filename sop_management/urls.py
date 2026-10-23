from django.urls import path

from . import views

app_name = "sop_management"

urlpatterns = [
    path("", views.document_list, name="document_list"),
    path("documents/new/", views.document_create, name="document_create"),
    path("documents/<int:pk>/", views.document_detail, name="document_detail"),
    path("documents/<int:pk>/pdf/", views.document_pdf, name="document_pdf"),
    path(
        "documents/<int:document_id>/versions/new/",
        views.version_create,
        name="version_create",
    ),
    path(
        "documents/<int:document_id>/versions/<int:version_id>/",
        views.version_detail,
        name="version_detail",
    ),
    path(
        "documents/<int:document_id>/versions/<int:version_id>/edit/",
        views.version_edit,
        name="version_edit",
    ),
    path(
        "documents/<int:document_id>/versions/<int:version_id>/approve/",
        views.version_approve,
        name="version_approve",
    ),
]
