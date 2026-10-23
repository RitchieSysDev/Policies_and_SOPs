# GHC-E SOP and Policy Management

This is a reusable Django app package (`sop_management`) for controlled SOP and
policy documents. It uses Django's configured `default` database connection;
it does not create a second database, keep HMIS connection credentials, or
change the host project's database settings.

This workspace also includes a small runnable host project in `ghce_sop/` and
`manage.py`. It defaults to a local SQLite database for evaluation and can use
the host HMIS database by setting the Django `DJANGO_DB_*` environment
variables. Never use the local SQLite default for production.

The repository also includes a separate static GitHub Pages version:
`index.html`, `styles.css`, `app.js`, and `documents.json`. Static hosting does
not run Django, connect to the HMIS database, or provide server-side editing.
The Pages catalogue is public and only approved active records in
`documents.json` are published. It also provides a local browser editor for
creating, editing, and approving draft records. Local edits are saved only in
that browser's `localStorage`; the editor is not shared, authenticated, or
suitable for confidential records. Use its **Export approved documents**
button, review the downloaded `documents.json`, and commit the approved
catalogue to GitHub to publish updates for everyone.
The browser editor provides heading levels, font family and size, text color,
alignment, paragraph indentation, and line spacing; imported and edited body
HTML is sanitized against the static site's allow-list before it is saved.

## Application layout

- `models.py` defines committees, document identity, and versioned content.
- `forms.py` configures TinyMCE and the document editing forms.
- `services.py` owns atomic draft creation, revision, and approval transitions.
- `views.py` and `urls.py` provide the permission-checked HTML and PDF endpoints.
- `templates/sop_management/` contains the branded DTL screens and document-control
  print layout.
- `content.py` and `templatetags/sop_content.py` enforce HTML sanitization at
  storage and display time.
- `migrations/` creates the app-owned relational tables in the existing HMIS
  database.

## GitHub Pages static version

The static site can be deployed from this repository with the included
`.github/workflows/pages.yml` workflow. Push to `main` or `master`, then in
GitHub open **Settings → Pages** and select **GitHub Actions** as the build and
deployment source. The deployed address appears in that Pages settings view
and in the workflow deployment result.

To publish approved material, edit `documents.json` in a reviewed commit. Its
top level is a JSON array; each record needs the fields in
`documents.schema.json`. For example:

```json
[
  {
    "document_code": "GHC-SOP-001",
    "title": "Approved document title",
    "facility_level": "Level 3B",
    "county": "Kajiado",
    "sub_county": "Kajiado South",
    "owner_committee": "Clinical Governance Committee",
    "version_number": "1.0",
    "effective_date": "2026-01-01",
    "review_date": "2027-01-01",
    "approved_by": "Authorized approver",
    "status": "APPROVED",
    "is_active": true,
    "body_html": "<h2>Purpose</h2><p>Published approved content.</p>",
    "history": []
  }
]
```

Replace example values with content that has passed the facility's approval and
privacy review; the sample above is illustrative and is not a clinical policy.
The site filters out records that are not approved, active, and structurally
valid, and sanitizes supported rich text before rendering. Static Pages cannot
enforce per-user permissions or hide repository files: publish no drafts,
patient information, credentials, or internal-only documents. The browser
editor is intended for local demonstrations and preparing a reviewed export.
Use the Django app and HMIS deployment for secure, shared staff editing and
approval workflows.

## Integration

1. Create a virtual environment and install the app dependencies:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements-sop.txt
   ```

   Then run local demo setup and the server:

   ```powershell
   python manage.py migrate
   python manage.py createsuperuser
   python manage.py runserver
   ```

   Open `http://127.0.0.1:8000/` to browse approved documents without a public
   sign-in. Staff manage drafts and approvals through Django admin at
   `http://127.0.0.1:8000/admin/`; those write operations remain permission
   protected.
2. For production, install any required database driver for the HMIS engine
   and configure `DJANGO_DB_ENGINE`, `DJANGO_DB_NAME`, `DJANGO_DB_USER`,
   `DJANGO_DB_PASSWORD`, `DJANGO_DB_HOST`, and `DJANGO_DB_PORT` through the
   deployment environment or secret manager. See `.env.example` for variable
   names. Do not put production credentials in source control.
3. Add `"tinymce"` and `"sop_management.apps.SopManagementConfig"` to
   `INSTALLED_APPS`.
4. Include the app URL configuration in the project's root URLconf:

   ```python
   from django.urls import include, path

   urlpatterns = [
       path("tinymce/", include("tinymce.urls")),
       path("policies/", include("sop_management.urls")),
   ]
   ```

5. Confirm the HMIS database engine supports the supplied migrations and arrange
   a backup/change window with the database owner. Run
   `python manage.py migrate sop_management` against the existing configured
   database. No existing HMIS tables are altered.
6. Configure static-file handling, HTTPS, and `ALLOWED_HOSTS` as usual. Public
   visitors can read currently approved documents and their non-draft version
   history. Editing, document registration, and approval remain restricted to
   authenticated clinical governance staff with the relevant `add_document`,
   `add_documentversion`, and `change_documentversion` permissions.
7. Add committee records through Django admin or a controlled data migration.

The rich-text editor and PDF renderer should be validated in the target
deployment environment. Build the local Tailwind bundle with
`npm ci` and `npm run build:css`, then run Django's static collection step. The
templates include the facility branding and a print-specific A4 stylesheet;
PDF output uses embedded print styles and does not load remote assets.

## Data and lifecycle

- `Document` stores global identity and facility ownership metadata.
- `DocumentVersion` stores immutable history and rich-text content separately.
- Initial versions start at `1.0`; subsequent drafts increment by `0.1`.
- Editing an approved version creates a new draft, leaving the approved
  historical row untouched. Approval serializes on the document row, activates
  the draft, and archives the previous active version in one transaction.
- Rich text is sanitized both on model save and at the rendering boundary.
  HTML tags and style properties are allow-listed; images and arbitrary
  embedded content are not permitted.

The Django migration is intended to create app-owned tables in the configured
HMIS database. Review table naming, migration policy, backup/restore, and any
database-router rules with the HMIS DBA before deployment.
