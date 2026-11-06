"""Outgoing email configured at runtime from the admin area (e.g. Gmail + app password)."""

import logging

from django.core.mail import EmailMessage, get_connection

from .models import SiteSettings

logger = logging.getLogger(__name__)


def send_mail_dynamic(*, subject: str, body: str, to: list[str], fail_silently: bool = False) -> bool:
    s = SiteSettings.load()
    if not s.email_enabled or not s.smtp_username or not s.smtp_password:
        if not fail_silently:
            raise RuntimeError("الإيميل مش مفعّل أو ناقص إعدادات")
        return False
    connection = get_connection(
        backend="django.core.mail.backends.smtp.EmailBackend",
        host=s.smtp_host, port=s.smtp_port, username=s.smtp_username, password=s.smtp_password,
        use_tls=s.smtp_use_tls, timeout=15, fail_silently=fail_silently,
    )
    try:
        sent = EmailMessage(subject, body, s.from_email or s.smtp_username, to, connection=connection).send()
        return bool(sent)
    except Exception:
        logger.exception("sending email failed")
        if not fail_silently:
            raise
        return False
