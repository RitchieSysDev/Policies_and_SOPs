import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Committee",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=200, unique=True)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={
                "ordering": ("name",),
                "verbose_name_plural": "committees",
            },
        ),
        migrations.CreateModel(
            name="Document",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("document_code", models.CharField(max_length=50, unique=True)),
                ("facility_level", models.CharField(default="Level 3B", max_length=50)),
                ("county", models.CharField(max_length=100)),
                ("sub_county", models.CharField(max_length=100)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "document_owner_committee",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="documents",
                        to="sop_management.committee",
                    ),
                ),
            ],
            options={"ordering": ("document_code",)},
        ),
        migrations.CreateModel(
            name="DocumentVersion",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("title", models.CharField(max_length=255)),
                ("body", models.TextField()),
                ("approved_by", models.CharField(blank=True, max_length=200)),
                ("effective_date", models.DateField()),
                ("review_date", models.DateField()),
                ("version_number", models.DecimalField(decimal_places=1, max_digits=5)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("DRAFT", "Draft"),
                            ("APPROVED", "Approved"),
                            ("ARCHIVED", "Archived"),
                        ],
                        default="DRAFT",
                        max_length=10,
                    ),
                ),
                ("is_active", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="sop_versions_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "document",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="versions",
                        to="sop_management.document",
                    ),
                ),
            ],
            options={
                "ordering": ("document_id", "-version_number"),
            },
        ),
        migrations.AddConstraint(
            model_name="documentversion",
            constraint=models.UniqueConstraint(
                fields=("document", "version_number"),
                name="sop_unique_document_version",
            ),
        ),
        migrations.AddConstraint(
            model_name="documentversion",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    review_date__gte=models.F("effective_date"),
                ),
                name="sop_review_on_or_after_effective",
            ),
        ),
    ]
