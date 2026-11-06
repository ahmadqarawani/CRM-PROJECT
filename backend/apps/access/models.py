from django.conf import settings
from django.db import models

from .registry import normalize


class Role(models.Model):
    """A named set of permissions (see registry.PERMISSIONS). Built-in roles can be edited, not deleted."""

    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=300, blank=True)
    permissions = models.JSONField(default=dict)
    is_system = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=50)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        self.permissions = normalize(self.permissions)
        super().save(*args, **kwargs)


class UserAccess(models.Model):
    """Which role a user has (one role per user, like HubSpot/Pipedrive)."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="access")
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="members")

    def __str__(self):
        return f"{self.user} → {self.role}"
