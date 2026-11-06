"""Create the team accounts once. Passwords: set each one with `manage.py changepassword <user>`.
For local development only, TEAM_DEV_PASSWORD (in .env) sets a shared password.
Roles can be changed later from Settings → Users; this only sets them for new accounts."""

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.access.models import Role, UserAccess
from apps.access.seed import seed_roles

TEAM = [
    # username, display name, role
    ("ahmad", "Ahmad", "admin"),
    ("tarek", "M.Tarek", "admin"),
    ("rand", "Rand", "agent"),
    ("ameer", "Ameer", "agent"),
]


class Command(BaseCommand):
    help = "Create the BGI team users (idempotent)."

    def handle(self, *args, **opts):
        seed_roles()
        User = get_user_model()
        dev_password = os.environ.get("TEAM_DEV_PASSWORD")
        for username, name, role in TEAM:
            user, created = User.objects.get_or_create(username=username, defaults={"first_name": name})
            user.first_name = name
            if created or dev_password:
                if dev_password:
                    user.set_password(dev_password)
                else:
                    user.set_unusable_password()
            user.save()
            UserAccess.objects.get_or_create(user=user, defaults={"role": Role.objects.get(slug=role)})
            self.stdout.write(f"{'created' if created else 'updated'}: {username} ({user.access.role.name})")
