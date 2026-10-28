import django.db.models.deletion
from django.db import migrations, models


def copy_owner_names(apps, schema_editor):
    Document = apps.get_model("sop_management", "Document")
    database = schema_editor.connection.alias
    for document in Document.objects.using(database).select_related(
        "document_owner_committee"
    ).iterator():
        document.owner = document.document_owner_committee.name
        document.save(using=database, update_fields=("owner",))


def restore_committee_links(apps, schema_editor):
    Document = apps.get_model("sop_management", "Document")
    Committee = apps.get_model("sop_management", "Committee")
    database = schema_editor.connection.alias
    for document in Document.objects.using(database).iterator():
        committee, _ = Committee.objects.using(database).get_or_create(
            name=document.owner
        )
        document.document_owner_committee_id = committee.pk
        document.save(
            using=database,
            update_fields=("document_owner_committee",),
        )


class Migration(migrations.Migration):
    dependencies = [("sop_management", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="document",
            name="owner",
            field=models.CharField(max_length=200, null=True),
        ),
        migrations.RunPython(copy_owner_names, restore_committee_links),
        migrations.AlterField(
            model_name="document",
            name="document_owner_committee",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="documents",
                to="sop_management.committee",
            ),
        ),
        migrations.RemoveField(
            model_name="document",
            name="document_owner_committee",
        ),
        migrations.AlterField(
            model_name="document",
            name="owner",
            field=models.CharField(
                "Owner (Committee or Department)",
                max_length=200,
            ),
        ),
    ]