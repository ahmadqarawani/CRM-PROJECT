"""Publish change signals to every connected browser through Postgres NOTIFY.

Call publish() inside the service's transaction: Postgres delivers NOTIFY only on COMMIT and
drops it on ROLLBACK, so no client ever hears about data that was not saved. Events carry ids
only; the browser refetches from the REST API (the single source of truth)."""

import json

from django.db import connection

CHANNEL = "crm_events"


class Event:
    NOTIFICATION_CREATED = "notification.created"
    REQUEST_CHANGED = "request.changed"
    ACTIVITY_CREATED = "activity.created"
    DOCUMENT_CREATED = "document.created"
    TASK_CHANGED = "task.changed"
    CLIENT_CHANGED = "client.changed"
    RESYNC = "resync"


def publish(event: str, *, user_id: int | None = None, **data) -> None:
    payload = json.dumps({"event": event, "user_id": user_id, "data": data}, default=str)
    with connection.cursor() as cur:
        cur.execute("SELECT pg_notify(%s, %s)", [CHANNEL, payload])
