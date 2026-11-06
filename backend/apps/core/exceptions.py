"""One error shape for the whole API:
    {"type": "validation_error", "errors": {"field": ["msg"]}}
    {"type": "<kind>", "detail": "msg"}
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import ProtectedError
from rest_framework import exceptions as exc
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

TYPES = {
    400: "validation_error",
    401: "not_authenticated",
    403: "permission_denied",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "too_large",
    415: "unsupported_media_type",
    429: "throttled",
}


def _django_errors(error: DjangoValidationError):
    if hasattr(error, "error_dict"):
        return error.message_dict
    return {"non_field_errors": error.messages}


def exception_handler(error, context):
    if isinstance(error, DjangoValidationError):  # raised by services
        error = exc.ValidationError(detail=_django_errors(error))
    elif isinstance(error, ProtectedError):
        return Response({"type": "conflict", "detail": "العنصر مستعمل وما بينفع ينحذف"}, status=409)

    response = drf_exception_handler(error, context)
    if response is None:
        return None

    body = {"type": TYPES.get(response.status_code, "error")}
    if isinstance(error, exc.ValidationError):
        data = response.data
        body["errors"] = data if isinstance(data, dict) else {"non_field_errors": data}
    else:
        data = response.data
        body["detail"] = data.get("detail") if isinstance(data, dict) else data
    response.data = body
    return response
