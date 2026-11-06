import hashlib
from contextlib import contextmanager

from django.db import connection


def _key(name: str) -> int:
    return int.from_bytes(hashlib.blake2b(name.encode(), digest_size=8).digest(), "big", signed=True)


@contextmanager
def advisory_lock(name: str):
    """Non-blocking, cluster-wide mutex for periodic commands. Yields True if acquired.
    Session-level lock, released explicitly (and by Postgres if the process dies)."""
    key = _key(name)
    with connection.cursor() as cur:
        cur.execute("SELECT pg_try_advisory_lock(%s)", [key])
        acquired = cur.fetchone()[0]
    try:
        yield acquired
    finally:
        if acquired:
            with connection.cursor() as cur:
                cur.execute("SELECT pg_advisory_unlock(%s)", [key])
