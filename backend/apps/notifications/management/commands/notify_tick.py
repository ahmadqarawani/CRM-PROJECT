from django.core.management.base import BaseCommand

from apps.notifications.services import tick


class Command(BaseCommand):
    help = "Run every 5 minutes: due reminders, morning digest, end-of-day overdue bundle (idempotent)."

    def handle(self, *args, **opts):
        self.stdout.write(f"notify_tick: {tick()}")
