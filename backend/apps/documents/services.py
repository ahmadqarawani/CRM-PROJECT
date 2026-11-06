from pathlib import PurePosixPath

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from PIL import Image, UnidentifiedImageError

from apps.realtime.events import Event, publish

from .models import Document

ALLOWED = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
           ".webp": "image/webp"}
IMAGE_FORMATS = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}


def validate_upload(upload) -> str:
    """Trusted content type from the real bytes, not the browser's claim."""
    ext = PurePosixPath(upload.name).suffix.lower()
    if ext not in ALLOWED:
        raise ValidationError({"file": ["نوع الملف مش مسموح (PDF أو صور بس)"]})
    if upload.size > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise ValidationError({"file": [f"الملف أكبر من {settings.MAX_UPLOAD_MB}MB"]})
    upload.seek(0)
    if ext == ".pdf":
        if upload.read(5) != b"%PDF-":
            raise ValidationError({"file": ["الملف مش PDF حقيقي"]})
    else:
        try:
            with Image.open(upload) as img:
                fmt = img.format
                img.verify()
        except (UnidentifiedImageError, OSError, SyntaxError):
            raise ValidationError({"file": ["الصورة تالفة أو مش صورة"]}) from None
        if fmt != IMAGE_FORMATS[ext]:
            raise ValidationError({"file": ["امتداد الصورة ما بيطابق محتواها"]})
    upload.seek(0)
    return ALLOWED[ext]


def resolve_contact(*, contact=None, deal=None, prop=None):
    """The owning contact comes from the deal/property when given; they must agree."""
    owners = {o for o in (deal and deal.contact_id, prop and prop.owner_id, contact and contact.pk) if o}
    if deal and prop and deal.property_id == prop.pk:
        owners.discard(prop.owner_id)
        owners.add(deal.contact_id)
    if len(owners) > 1:
        raise ValidationError({"non_field_errors": ["العميل والطلب والعقار لازم يكونوا مترابطين"]})
    if not owners:
        raise ValidationError({"contact_id": ["حدد عميل أو طلب أو عقار"]})
    return owners.pop()


@transaction.atomic
def upload_document(*, upload, by, category, contact=None, deal=None, prop=None, quote=None) -> Document:
    content_type = validate_upload(upload)
    deal = deal or (quote.deal if quote else None)
    contact_id = resolve_contact(contact=contact, deal=deal, prop=prop)
    doc = Document(original_name=PurePosixPath(upload.name).name[:255], content_type=content_type,
                   size_bytes=upload.size, category=category, contact_id=contact_id, deal=deal, property=prop,
                   quote=quote, uploaded_by=by)
    doc.file.save(upload.name, upload, save=False)
    try:
        doc.save()
    except Exception:
        doc.file.delete(save=False)
        raise
    publish(Event.DOCUMENT_CREATED, id=doc.pk, client_id=contact_id)
    return doc
