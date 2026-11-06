from functools import lru_cache

from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class UserRefSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "name"]

    def get_name(self, obj) -> str:
        return obj.get_full_name() or obj.get_username()


@lru_cache(maxsize=None)
def _ref_class(model, fields: tuple):
    return type(f"{model.__name__}RefSerializer", (serializers.ModelSerializer,),
                {"Meta": type("Meta", (), {"model": model, "fields": list(fields)})})


def ref(model, fields=("id", "name")):
    """Read-only nested summary ({id, name}); one class per model -> stable OpenAPI names."""
    return _ref_class(model, tuple(fields))


def fk(model, source, queryset=None, **kw):
    """Write side of a relation: `<name>_id`."""
    kw.setdefault("required", False)
    kw.setdefault("allow_null", True)
    return serializers.PrimaryKeyRelatedField(source=source, queryset=queryset or model.objects.all(),
                                              write_only=True, **kw)


class ArchiveFieldMixin(serializers.Serializer):
    # writable `is_archived`; serializers map it to archived_at
    is_archived = serializers.BooleanField(required=False)

    def apply_archive(self, instance, validated_data):
        from django.utils import timezone

        archived = validated_data.pop("is_archived", None)
        if archived is not None and archived != instance.is_archived:
            instance.archived_at = timezone.now() if archived else None
        return validated_data
