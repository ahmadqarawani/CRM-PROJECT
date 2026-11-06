from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter as P
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.views import flag

from .models import Notification, NotificationPreference

MESSAGES = {
    "ACTIVITY_DUE": "عندك {what} بعد أقل من ساعة",
    "ASSIGNED": "انسندلك: {what}",
    "ACTIVITY_OVERDUE": "{text}",
    "DIGEST": "{text}",
    "NO_NEXT_STEP": "طلب بلا خطوة جاية: {what}",
    "DEAL_STUCK": "طلب واقف بمرحلته: {what}",
}


class NotificationSerializer(serializers.ModelSerializer):
    message = serializers.SerializerMethodField()
    deal_id = serializers.IntegerField(read_only=True, allow_null=True)
    activity_id = serializers.IntegerField(read_only=True, allow_null=True)
    is_read = serializers.BooleanField()

    class Meta:
        model = Notification
        fields = ["id", "kind", "message", "deal_id", "activity_id", "is_read", "created_at"]
        read_only_fields = ["kind", "created_at"]

    def get_message(self, obj) -> str:
        what = ""
        if obj.activity:
            what = obj.activity.subject or obj.activity.get_type_display()
            if obj.activity.contact_id:
                what += f" — {obj.activity.contact.display_name}"
        elif obj.deal:
            what = obj.deal.title or obj.deal.contact.display_name
        return MESSAGES.get(obj.kind, "{text}").format(what=what, text=obj.text)

    def update(self, instance, data):
        if (is_read := data.get("is_read")) is not None:
            instance.read_at = (instance.read_at or timezone.now()) if is_read else None
            instance.save(update_fields=["read_at"])
        return instance


@extend_schema_view(list=extend_schema(parameters=[P("unread", bool)]))
class NotificationViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    http_method_names = ["get", "patch", "post", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Notification.objects.none()
        qs = Notification.objects.filter(user=self.request.user).select_related(
            "activity__contact", "deal__contact")
        if self.action == "list" and flag(self.request, "unread"):
            qs = qs.filter(read_at__isnull=True)
        return qs

    @extend_schema(request=None, responses={204: None})
    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)


class PreferenceSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(Notification.Kind.choices)
    muted = serializers.BooleanField()


class PreferenceViewSet(viewsets.ViewSet):
    """Each user mutes the kinds they don't want."""

    @extend_schema(responses=PreferenceSerializer(many=True))
    def list(self, request):
        muted = set(NotificationPreference.objects.filter(user=request.user, muted=True).values_list("kind", flat=True))
        return Response([{"kind": k, "label": label, "muted": k in muted} for k, label in Notification.Kind.choices])

    @extend_schema(request=PreferenceSerializer, responses=PreferenceSerializer)
    def create(self, request):
        s = PreferenceSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        NotificationPreference.objects.update_or_create(user=request.user, kind=s.validated_data["kind"],
                                                        defaults={"muted": s.validated_data["muted"]})
        return Response(s.validated_data)
