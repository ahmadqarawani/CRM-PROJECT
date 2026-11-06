import asyncio
import json

from django.http import HttpResponse, StreamingHttpResponse

from .hub import hub

HEARTBEAT_SECONDS = 20  # below nginx proxy_read_timeout (60s default) and Cloudflare idle limits


def _frame(message: dict) -> str:
    return f"event: {message['event']}\ndata: {json.dumps(message.get('data') or {})}\n\n"


async def event_stream(request):
    """GET /api/v1/events/ -> text/event-stream. Plain async Django view (DRF has no async views)."""
    user = await request.auser()
    if not user.is_authenticated:
        return HttpResponse(status=401, headers={"WWW-Authenticate": "Session"})

    queue = hub.subscribe()

    async def stream():
        try:
            yield "retry: 5000\n\n"
            while hub.is_subscribed(queue):
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_SECONDS)
                except TimeoutError:
                    yield ": ping\n\n"
                    continue
                if message.get("user_id") not in (None, user.pk):
                    continue
                yield _frame(message)
        finally:  # client went away (CancelledError) or was dropped as too slow
            hub.unsubscribe(queue)

    response = StreamingHttpResponse(stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
