"""One LISTEN connection per process, fanned out to every open SSE stream in that process.

The LISTEN loop runs in a daemon thread on a plain (sync) psycopg connection and hands each
message to the event loop with call_soon_threadsafe. That keeps it independent of the event-loop
type: psycopg's async mode refuses Windows' ProactorEventLoop, which uvicorn uses there."""

import asyncio
import json
import logging
import threading
import time

import psycopg
from django.conf import settings

from .events import CHANNEL, Event

logger = logging.getLogger(__name__)
QUEUE_SIZE = 100


def _conninfo() -> str:
    db = settings.DATABASES["default"]
    return psycopg.conninfo.make_conninfo(
        dbname=db["NAME"], user=db["USER"], password=db["PASSWORD"] or None,
        host=db["HOST"] or None, port=db["PORT"] or None,
    )


class Hub:
    def __init__(self):
        self.subscribers: set[asyncio.Queue] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

    def subscribe(self) -> asyncio.Queue:
        self._loop = asyncio.get_running_loop()
        with self._lock:
            if self._thread is None or not self._thread.is_alive():
                self._thread = threading.Thread(target=self._listen, name="realtime-listen", daemon=True)
                self._thread.start()
        queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_SIZE)
        self.subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self.subscribers.discard(queue)

    def is_subscribed(self, queue: asyncio.Queue) -> bool:
        return queue in self.subscribers

    # --- listener thread ---
    def _listen(self) -> None:
        backoff = 1
        while True:
            try:
                with psycopg.connect(_conninfo(), autocommit=True) as conn:
                    conn.execute(f"LISTEN {CHANNEL}")
                    backoff = 1
                    # anything published while we were not listening is lost -> clients refetch
                    self._dispatch({"event": Event.RESYNC})
                    # timeout lets the loop notice a dead connection instead of blocking forever
                    while True:
                        for note in conn.notifies(timeout=30):
                            try:
                                self._dispatch(json.loads(note.payload))
                            except ValueError:
                                logger.warning("bad realtime payload: %r", note.payload[:200])
                        conn.execute("SELECT 1")  # liveness probe between waits
            except Exception:
                logger.exception("realtime listener dropped; retrying in %ss", backoff)
                time.sleep(backoff)
                backoff = min(backoff * 2, 30)

    def _dispatch(self, message: dict) -> None:
        loop = self._loop
        if loop is not None and not loop.is_closed():
            loop.call_soon_threadsafe(self._broadcast, message)

    # --- event-loop side ---
    def _broadcast(self, message: dict) -> None:
        for queue in list(self.subscribers):
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                # stuck client: drop it; its stream ends, the browser reconnects and resyncs
                self.subscribers.discard(queue)


hub = Hub()
