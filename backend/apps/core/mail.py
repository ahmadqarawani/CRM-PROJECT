"""Outgoing email configured at runtime from the admin area (e.g. Gmail + app password)."""

import logging

from django.core.mail import EmailMultiAlternatives
from django.core.mail.backends.smtp import EmailBackend

from .models import SiteSettings

logger = logging.getLogger(__name__)


def send_mail_dynamic(*, subject: str, body: str, to: list[str], html: str | None = None, fail_silently: bool = False) -> bool:
    """Plain text always (some clients show only that); `html` adds a formatted version."""
    s = SiteSettings.load()
    if not s.email_enabled or not s.smtp_username or not s.smtp_password:
        if not fail_silently:
            raise RuntimeError("الإيميل مش مفعّل أو ناقص إعدادات")
        return False
    # SMTP details live in the database, not in settings.MAILERS, so the backend is built here; the
    # alias marks it as a named mailer (Django 6.1 deprecates alias-less backends and get_connection()).
    backend = EmailBackend(
        alias="site-settings", host=s.smtp_host, port=s.smtp_port, username=s.smtp_username,
        password=s.smtp_password, use_tls=s.smtp_use_tls, timeout=15, fail_silently=fail_silently,
    )
    try:
        msg = EmailMultiAlternatives(subject, body, s.from_email or s.smtp_username, to)
        if html:
            msg.attach_alternative(html, "text/html")
        return bool(backend.send_messages([msg]))
    except Exception:
        logger.exception("sending email failed")
        if not fail_silently:
            raise
        return False
