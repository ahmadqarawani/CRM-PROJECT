"""Create the team accounts once. Passwords: set each one with `manage.py changepassword <user>`.
For local development only, TEAM_DEV_PASSWORD (in .env) sets a shared password."""

import os

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.management.base import BaseCommand

TEAM = [
    # username, display name, admin area, can hard-delete
    ("ahmad", "Ahmad", True, True),
    ("tarek", "M.Tarek", True, True),
    ("rand", "Rand", False, False),
    ("ameer", "Ameer", False, False),
]


class Command(BaseCommand):
    help = "Create the BGI team users (idempotent)."

    def handle(self, *args, **opts):
        User = get_user_model()
        perm = Permission.objects.get(codename="delete_records", content_type__app_label="core")
        dev_password = os.environ.get("TEAM_DEV_PASSWORD")
        for username, name, admin, can_delete in TEAM:
            user, created = User.objects.get_or_create(username=username, defaults={"first_name": name})
            user.first_name, user.is_staff = name, admin
            user.is_superuser = username == "tarek" or username == "ahmad"
            if created or dev_password:
                if dev_password:
                    user.set_password(dev_password)
                else:
                    user.set_unusable_password()
            user.save()
            if can_delete:
                user.user_permissions.add(perm)
            self.stdout.write(f"{'created' if created else 'updated'}: {username}")
