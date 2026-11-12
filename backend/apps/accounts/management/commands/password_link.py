"""Print a one-time link to set a new password — when nobody can log in and email isn't set up.

    manage.py password_link Ahmad
    manage.py password_link Ahmad --base https://crm.example.com
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.password import link_hours, reset_link


class Command(BaseCommand):
    help = "Print a one-time password-reset link for a user."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("--base", default=None, help=f"app address (default APP_URL = {settings.APP_URL})")

    def handle(self, *args, username, base, **opts):
        User = get_user_model()
        user = User.objects.filter(username__iexact=username, is_active=True).first()
        if user is None:
            names = ", ".join(User.objects.filter(is_active=True).values_list("username", flat=True))
            raise CommandError(f"no active user '{username}'. Users: {names}")
        self.stdout.write(f"Open this link to set a new password for {user.get_username()} "
                          f"(works once, for {link_hours()} hours):\n")
        self.stdout.write(reset_link(user, base))
