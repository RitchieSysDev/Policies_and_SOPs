from django import forms
from tinymce.widgets import TinyMCE

from .models import OWNER_CHOICES, Document, DocumentVersion


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
            "body{counter-reset:heading1}"
            "h1{counter-increment:heading1;counter-reset:heading2 heading3 heading4 heading5}"
            "h1:before{content:counter(heading1) '.0 '}"
            "h2{counter-increment:heading2;counter-reset:heading3 heading4 heading5}"
            "h2:before{content:counter(heading1) '.' counter(heading2) '. '}"
            "h3{counter-increment:heading3;counter-reset:heading4 heading5}"
            "h3:before{content:counter(heading1) '.' counter(heading2) '.' counter(heading3) '. '}"
            "h4{counter-increment:heading4;counter-reset:heading5}"
            "h4:before{content:counter(heading1) '.' counter(heading2) '.' counter(heading3) '.' counter(heading4) '. '}"
            "h5{counter-increment:heading5}"
            "h5:before{content:counter(heading1) '.' counter(heading2) '.' counter(heading3) '.' counter(heading4) '.' counter(heading5) '. '}"
        "p{line-height:1.5;margin:0 0 1em}"
    ),
}


class DocumentForm(forms.ModelForm):
    owner = forms.ChoiceField(
        label="Owner (Committee or Department)",
        choices=OWNER_CHOICES,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        owner = getattr(self.instance, "owner", "")
        valid_owners = {
            value
            for _, options in OWNER_CHOICES
            for value, _ in options
        }
        if owner and owner not in valid_owners:
            self.fields["owner"].choices = [
                *self.fields["owner"].choices,
                ("Existing owner (legacy)", ((owner, owner),)),
            ]

    class Meta:
        model = Document
        fields = (
            "document_code",
            "facility_level",
            "county",
            "sub_county",
            "owner",
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
