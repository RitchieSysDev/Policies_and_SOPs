import bleach
from bleach.css_sanitizer import CSSSanitizer


ALLOWED_TAGS = set(bleach.sanitizer.ALLOWED_TAGS).union(
    {
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "p",
        "br",
        "hr",
        "span",
        "div",
        "u",
        "s",
        "sub",
        "sup",
        "table",
        "thead",
        "tbody",
        "tfoot",
        "tr",
        "th",
        "td",
        "ul",
        "ol",
        "li",
    }
)

ALLOWED_ATTRIBUTES = {
    "*": ["style"],
    "a": ["href", "title", "style"],
    "th": ["colspan", "rowspan", "style"],
    "td": ["colspan", "rowspan", "style"],
}

ALLOWED_PROTOCOLS = {"http", "https", "mailto"}

CSS_SANITIZER = CSSSanitizer(
    allowed_css_properties={
        "color",
        "font-family",
        "font-size",
        "font-weight",
        "font-style",
        "text-decoration",
        "text-align",
        "text-indent",
        "line-height",
        "margin-left",
    }
)


def sanitize_document_html(value: str) -> str:
    return bleach.clean(
        value or "",
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        css_sanitizer=CSS_SANITIZER,
        strip=True,
    )
