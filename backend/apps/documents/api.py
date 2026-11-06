from urllib.parse import quote

from django.conf import settings
from django.http import FileResponse, HttpResponse
from django.utils.http import content_disposition_header
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter as P
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from apps.contacts.models import Contact
from apps.core.serializers import AccessMixin, ArchiveFieldMixin, UserRefSerializer, fk
from apps.core.views import BaseViewSet
from apps.deals.models import Deal, Quote
from apps.properties.models import Property

from .models import Document
from .services import upload_document


class DocumentSerializer(AccessMixin, ArchiveFieldMixin, serializers.ModelSerializer):
    access_resource = "documents"
    file = serializers.FileField(write_only=True)
    contact_id = fk(Contact, "contact")
    deal_id = fk(Deal, "deal")
    property_id = fk(Property, "property")
    quote_id = fk(Quote, "quote")
    uploaded_by = UserRefSerializer(read_only=True, allow_null=True)
    url = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = ["id", "access", "file", "url", "original_name", "content_type", "size_bytes", "category", "contact_id",
                  "deal_id", "property_id", "quote_id", "uploaded_by", "is_archived", "created_at"]
        read_only_fields = ["original_name", "content_type", "size_bytes", "created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data.update(contact_id=instance.contact_id, deal_id=instance.deal_id, property_id=instance.property_id,
                    quote_id=instance.quote_id)
        return data

    def get_url(self, obj) -> str:
        return f"/api/v1/documents/{obj.pk}/file/"

    def get_fields(self):
        fields = super().get_fields()
        if self.instance is not None:
            for name in ("file", "contact_id", "deal_id", "property_id", "quote_id"):
                fields[name].read_only = True
        return fields

    def create(self, data):
        return upload_document(upload=data["file"], by=self.context["request"].user,
                               category=data.get("category", Document.Category.OTHER), contact=data.get("contact"),
                               deal=data.get("deal"), prop=data.get("property"), quote=data.get("quote"))

    def update(self, instance, data):
        return super().update(instance, self.apply_archive(instance, data))


@extend_schema_view(list=extend_schema(parameters=[
    P("contact", int), P("deal", int), P("property", int), P("quote", int), P("category", str), P("archived", bool),
]))
class DocumentViewSet(BaseViewSet):
    serializer_class = DocumentSerializer
    resource = "documents"
    # archiving a file counts as removing it
    action_permissions = {"create": "documents.upload", "update": "documents.delete", "partial_update": "documents.delete",
                          "file": None}
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = Document.objects.select_related("uploaded_by")
        if self.action == "list":
            qs = self.archived_filter(qs)
            for f in ("contact", "deal", "property", "quote"):
                if v := self.request.query_params.get(f):
                    qs = qs.filter(**{f"{f}_id": v})
            if v := self.request.query_params.get("category"):
                qs = qs.filter(category=v.upper())
        return qs

    def perform_destroy(self, instance):
        instance.file.delete(save=False)
        instance.delete()

    @extend_schema(responses={(200, "application/octet-stream"): OpenApiTypes.BINARY})
    @action(detail=True, methods=["get"])
    def file(self, request, pk=None):
        """Auth checked here; bytes sent by nginx (X-Accel-Redirect) in production."""
        doc = self.get_object()
        if settings.SERVE_FILES_WITH_X_ACCEL:
            response = HttpResponse(content_type=doc.content_type)
            response["X-Accel-Redirect"] = quote(settings.X_ACCEL_PREFIX + doc.file.name)
        else:
            response = FileResponse(doc.file.open("rb"), content_type=doc.content_type)
        response["Content-Disposition"] = content_disposition_header(as_attachment=False, filename=doc.original_name)
        response["X-Content-Type-Options"] = "nosniff"
        response["X-Frame-Options"] = "SAMEORIGIN"  # previewed in the app's <iframe>
        response["Content-Security-Policy"] = "frame-ancestors 'self'"
        return response
