from django import forms
from tinymce.widgets import TinyMCE

from .models import Document, DocumentVersion


TINYMCE_CONFIG = {
    "height": 650,
    "menubar": "edit view insert format tools table",
    "plugins": "lists link table",
    "toolbar": (
        "undo redo | blocks | fontfamily fontsize | forecolor backcolor | "
        "bold italic underline | alignleft aligncenter alignright alignjustify | "
        "outdent indent | bullist numlist | table link | removeformat"
    ),
    "block_formats": (
        "Paragraph=p; Heading 1=h1; Heading 2=h2; Heading 3=h3; "
        "Heading 4=h4; Heading 5=h5"
    ),
    "font_family_formats": (
        "Arial=arial,helvetica,sans-serif;"
        "Georgia=georgia,palatino,serif;"
        "Times New Roman='times new roman',times,serif;"
        "Verdana=verdana,geneva,sans-serif"
    ),
    "font_size_formats": "8pt 9pt 10pt 11pt 12pt 14pt 16pt 18pt 24pt 36pt",
    "color_map": [
        "000000", "Black",
        "17365D", "GHC-E Navy",
        "00A6C7", "GHC-E Cyan",
        "5B9BD5", "Light Blue",
        "FFFFFF", "White",
        "C00000", "Red",
        "548235", "Green",
    ],
    "style_formats": [
        {"title": "Paragraph", "format": "p"},
        {
            "title": "Indented paragraph",
            "block": "p",
            "styles": {"text-indent": "2em"},
        },
        {
            "title": "Spaced paragraph",
            "block": "p",
            "styles": {"line-height": "1.5"},
        },
    ],
    "valid_elements": (
        "p[style],br,hr,h1[style],h2[style],h3[style],h4[style],h5[style],"
        "span[style],div[style],strong/b,em/i,u,s,sub,sup,"
        "ul,ol,li,table[style],thead,tbody,tfoot,tr,"
        "th[colspan|rowspan|style],td[colspan|rowspan|style],"
        "a[href|title|target|rel|style]"
    ),
    "link_default_target": "_blank",
    "content_style": (
        "body{font-family:Arial,sans-serif;color:#17365D}"
        "p{line-height:1.5;margin:0 0 1em}"
    ),
}


class DocumentForm(forms.ModelForm):
    class Meta:
        model = Document
        fields = (
            "document_code",
            "facility_level",
            "county",
            "sub_county",
            "document_owner_committee",
        )


class DocumentVersionForm(forms.ModelForm):
    body = forms.CharField(
        widget=TinyMCE(
            attrs={"cols": 80, "rows": 30},
            mce_attrs=TINYMCE_CONFIG,
        )
    )

    class Meta:
        model = DocumentVersion
        fields = ("title", "body", "effective_date", "review_date")
        widgets = {
            "effective_date": forms.DateInput(attrs={"type": "date"}),
            "review_date": forms.DateInput(attrs={"type": "date"}),
        }
