from django import template
from django.utils.safestring import mark_safe

from sop_management.content import sanitize_document_html

register = template.Library()


@register.filter
def safe_document_html(value):
    return mark_safe(sanitize_document_html(value))
