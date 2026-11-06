"""One generic CRUD per lookup list: everyone reads, admins edit (admin area)."""

from django.db.models import ProtectedError
from rest_framework import permissions, serializers, viewsets

from apps.core.views import IsAdminOrReadOnly, flag

from . import models as m

LISTS = {
    "sources": (m.Source, ["opens_whatsapp"]),
    "lost-reasons": (m.LostReason, ["applies_to"]),
    "locations": (m.Location, []),
    "property-types": (m.PropertyType, ["has_rooms"]),
    "finish-levels": (m.FinishLevel, []),
    "service-types": (m.ServiceType, []),
    "ownership-types": (m.OwnershipType, []),
    "features": (m.Feature, []),
    "tags": (m.Tag, ["color"]),
}


def _make(slug, model, extra):
    ser = type(f"{model.__name__}Serializer", (serializers.ModelSerializer,), {
        "Meta": type("Meta", (), {"model": model, "fields": ["id", "name", "order", "is_active", *extra]}),
    })

    class ViewSet(viewsets.ModelViewSet):
        serializer_class = ser
        permission_classes = [permissions.IsAuthenticated, IsAdminOrReadOnly]
        pagination_class = None
        http_method_names = ["get", "post", "patch", "delete", "head", "options"]

        def get_queryset(self):
            qs = model.objects.all()
            if self.action == "list" and not flag(self.request, "include_inactive"):
                qs = qs.filter(is_active=True)
            return qs

        def perform_destroy(self, instance):
            try:
                instance.delete()
            except ProtectedError:
                raise  # -> 409 by the exception handler; deactivate instead

    ViewSet.__name__ = f"{model.__name__}ViewSet"
    return ViewSet


VIEWSETS = {slug: _make(slug, model, extra) for slug, (model, extra) in LISTS.items()}
