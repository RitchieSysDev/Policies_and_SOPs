from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("sop_management", "0002_document_owner_choices")]

    operations = [
        migrations.AddField(
            model_name="documentversion",
            name="approval_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="documentversion",
            name="approver_designation",
            field=models.CharField(blank=True, max_length=200),
        ),
    ]