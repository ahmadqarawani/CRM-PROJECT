from django.db import models


class ArchiveQuerySet(models.QuerySet):
    def active(self):
        return self.filter(archived_at__isnull=True)

    def archived(self):
        return self.filter(archived_at__isnull=False)


class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Archivable(models.Model):
    archived_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = ArchiveQuerySet.as_manager()

    class Meta:
        abstract = True

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None


class SiteSettings(models.Model):
    """Singleton edited from the admin area: outgoing email (e.g. Gmail + app password) and
    notification timing. Read at send time, so changes apply without a restart."""

    email_enabled = models.BooleanField(default=False)
    smtp_host = models.CharField(max_length=200, default="smtp.gmail.com")
    smtp_port = models.PositiveIntegerField(default=587)
    smtp_use_tls = models.BooleanField(default=True)
    smtp_username = models.CharField(max_length=200, blank=True)
    smtp_password = models.CharField(max_length=200, blank=True)  # Gmail app password; never returned by the API
    from_email = models.CharField(max_length=200, blank=True)
    digest_hour = models.PositiveSmallIntegerField(default=10)
    quiet_start_hour = models.PositiveSmallIntegerField(default=21)
    quiet_end_hour = models.PositiveSmallIntegerField(default=9)
    weekly_report_recipients = models.TextField(blank=True)  # comma-separated emails
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        permissions = [("delete_records", "يقدر يحذف السجلات نهائياً")]

    @classmethod
    def load(cls) -> "SiteSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
