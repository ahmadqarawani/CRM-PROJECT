"""End-to-end check of the realtime path on a real ASGI server (Granian), against the dev DB.

    uv run python scripts/e2e_sse.py

1. starts Granian (ASGI, 2 workers, so events must cross processes)
2. logs two users in through the real CSRF/session flow
3. opens an SSE stream per user
4. changes a request through the API     -> both users get request.changed
5. runs `manage.py scan_overdue` (another OS process) -> only the targeted user gets notification.created
6. waits for a heartbeat ping
"""

import asyncio
import os
import subprocess
import sys
import time
from datetime import timedelta
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8765"
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


def setup_data():
    import django

    django.setup()
    from django.contrib.auth import get_user_model
    from django.utils import timezone

    from apps.clients.models import Client
    from apps.pipeline import services
    from apps.pipeline.models import Request
    from apps.tasks.models import Notification

    User = get_user_model()
    Notification.objects.all().delete()
    users = {}
    for name, staff in (("e2e_a", True), ("e2e_b", False)):
        u, _ = User.objects.get_or_create(username=name, defaults={"is_staff": staff})
        u.is_staff = staff
        u.set_password("e2e-pass-123")
        u.save()
        users[name] = u
    client, _ = Client.objects.get_or_create(name="E2E client")
    req = services.create_request(by=users["e2e_a"], client=client, title="e2e request")
    Request.objects.filter(pk=req.pk).update(next_follow_up_at=timezone.now() - timedelta(hours=1))
    return req.pk


async def login(username):
    c = httpx.AsyncClient(base_url=BASE, timeout=10)
    await c.get("/api/v1/auth/csrf/")
    r = await c.post("/api/v1/auth/login/", json={"username": username, "password": "e2e-pass-123"},
                     headers={"X-CSRFToken": c.cookies["csrftoken"], "Referer": BASE + "/"})
    assert r.status_code == 200, r.text
    return c


async def collect(client, name, sink, ready):
    async with client.stream("GET", "/api/v1/events/", timeout=None) as r:
        assert r.status_code == 200, r.status_code
        assert r.headers["content-type"].startswith("text/event-stream")
        ready.set()
        event = None
        async for line in r.aiter_lines():
            if line.startswith(": ping"):
                sink.append((name, "ping"))
            elif line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: ") and event:
                sink.append((name, event))
                event = None


async def main():
    req_id = await asyncio.to_thread(setup_data)
    server = subprocess.Popen(
        [sys.executable, "-m", "granian", "--interface", "asginl", "--host", "127.0.0.1", "--port", "8765",
         "--workers", "2", "--log-level", "warning", "config.asgi:application"],
        cwd=ROOT,
    )
    try:
        for _ in range(50):
            try:
                httpx.get(BASE + "/api/v1/auth/csrf/")
                break
            except httpx.ConnectError:
                time.sleep(0.2)
        a, b = await login("e2e_a"), await login("e2e_b")
        events: list = []
        ready_a, ready_b = asyncio.Event(), asyncio.Event()
        tasks = [asyncio.create_task(collect(a, "a", events, ready_a)),
                 asyncio.create_task(collect(b, "b", events, ready_b))]
        await asyncio.wait_for(asyncio.gather(ready_a.wait(), ready_b.wait()), 10)
        await asyncio.sleep(1.5)  # listeners connect lazily on first subscriber

        r = await a.patch(f"/api/v1/requests/{req_id}/", json={"priority": "HIGH"},
                          headers={"X-CSRFToken": a.cookies["csrftoken"], "Referer": BASE + "/"})
        assert r.status_code == 200, r.text
        await asyncio.sleep(1.5)
        assert ("a", "request.changed") in events and ("b", "request.changed") in events, events
        print("OK request.changed reached both users:", events)

        events.clear()
        out = subprocess.run([sys.executable, "manage.py", "scan_overdue"], cwd=ROOT, capture_output=True,
                             text=True, check=True).stdout.strip()
        print("   ", out)
        await asyncio.sleep(1.5)
        got = [e for e in events if e[1] == "notification.created"]
        assert got == [("a", "notification.created")], events  # unassigned -> admin e2e_a only
        print("OK notification.created only for the admin (cross-process NOTIFY):", got)

        events.clear()
        print("   waiting for heartbeat (~20s)...")
        await asyncio.sleep(22)
        assert ("a", "ping") in events and ("b", "ping") in events, events
        print("OK heartbeat pings received")

        r = await httpx.AsyncClient(base_url=BASE).get("/api/v1/events/")
        assert r.status_code == 401
        print("OK anonymous stream -> 401")
        for t in tasks:
            t.cancel()
        await a.aclose()
        await b.aclose()
        print("ALL SSE E2E CHECKS PASSED")
    finally:
        server.terminate()
        server.wait(10)


if __name__ == "__main__":
    try:
        asyncio.run(main())
        code = 0
    except AssertionError as exc:
        print("FAILED:", exc)
        code = 1
    sys.stdout.flush()
    os._exit(code)  # the Django DB pool keeps non-daemon threads alive
