import smtplib

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db import transaction
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status, viewsets
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.access.models import Role, UserAccess
from apps.access.permissions import Perm
from apps.access.registry import DEFAULT_ROLE
from apps.access.services import perms_for, role_of
from apps.core.models import SiteSettings
from apps.core.serializers import UserRefSerializer

ADMIN_KEYS = ("admin.users", "admin.roles", "admin.settings", "admin.handover")


class MeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    name = serializers.CharField()
    role = serializers.DictField(allow_null=True)
    permissions = serializers.DictField(help_text='key -> "none" | "own" | "all", or true / false')
    is_admin = serializers.BooleanField(help_text="may open the settings area")


def me_payload(user) -> dict:
    role = role_of(user)
    perms = perms_for(user)
    return {
        "id": user.pk,
        "username": user.get_username(),
        "name": user.get_full_name() or user.get_username(),
        "role": {"id": role.pk, "slug": role.slug, "name": role.name} if role else None,
        "permissions": perms,
        "is_admin": any(perms[k] for k in ADMIN_KEYS),
    }


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False)


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfView(APIView):
    """Call once on app start (and after login/logout): sets the csrftoken cookie."""

    permission_classes = [AllowAny]

    @extend_schema(responses={204: None})
    def get(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


# DRF views are csrf-exempt and SessionAuthentication only checks CSRF for logged-in users,
# so an anonymous login would get no CSRF check at all (login CSRF). Force it.
@method_decorator(csrf_protect, name="post")
class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "login"
    throttle_classes = [ScopedRateThrottle]

    @extend_schema(request=LoginSerializer, responses=MeSerializer)
    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = authenticate(request, **data.validated_data)
        if user is None:
            raise serializers.ValidationError({"non_field_errors": ["اسم المستخدم أو كلمة السر غلط"]})
        login(request, user)  # rotates the session key and the CSRF token
        return Response(me_payload(user))


class LogoutView(APIView):
    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    @extend_schema(responses=MeSerializer)
    def get(self, request):
        return Response(me_payload(request.user))


class UserListView(ListAPIView):
    """Active users, for assignee pickers."""

    serializer_class = UserRefSerializer
    pagination_class = None

    def get_queryset(self):
        return get_user_model().objects.filter(is_active=True).order_by("first_name", "username")


# ---------- admin area: roles ----------
class RoleSerializer(serializers.ModelSerializer):
    members = serializers.IntegerField(source="members.count", read_only=True)

    class Meta:
        model = Role
        fields = ["id", "slug", "name", "description", "permissions", "is_system", "order", "members"]
        read_only_fields = ["is_system"]

    def validate_slug(self, value):
        if self.instance and self.instance.is_system and value != self.instance.slug:
            raise serializers.ValidationError("ما بينفع تغيّر معرّف دور أساسي")
        return value

    def validate(self, data):
        # never lock everyone out: the admin role keeps role management
        if (self.instance and self.instance.slug == "admin" and "permissions" in data
                and not data["permissions"].get("admin.roles")):
            raise serializers.ValidationError({"permissions": ["دور مدير النظام لازم يضل يقدر يدير الأدوار"]})
        return data


class PermissionCatalogSerializer(serializers.Serializer):
    key = serializers.CharField()
    group = serializers.CharField()
    label = serializers.CharField()
    kind = serializers.ChoiceField(choices=["scope", "bool"])


class RoleViewSet(viewsets.ModelViewSet):
    """Roles and their permission matrix. Built-in roles can be edited but not deleted; a role in use can't be."""

    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated, Perm("admin.roles")]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return Role.objects.prefetch_related("members")

    def perform_destroy(self, instance):
        if instance.is_system:
            raise serializers.ValidationError({"non_field_errors": ["الأدوار الأساسية ما بتنحذف، بس بتتعدّل"]})
        if instance.members.exists():
            raise serializers.ValidationError({"non_field_errors": ["في مستخدمين على هالدور — انقلهم لدور تاني أول"]})
        instance.delete()


class PermissionCatalogView(APIView):
    """Every permission (key, group, label, kind) — what the roles editor draws as rows."""

    permission_classes = [IsAuthenticated, Perm("admin.roles")]

    @extend_schema(responses=PermissionCatalogSerializer(many=True))
    def get(self, request):
        from apps.access.registry import PERMISSIONS

        return Response([{"key": k, "group": g, "label": label, "kind": kind}
                         for k, (g, label, kind) in PERMISSIONS.items()])


# ---------- admin area: users ----------
class UserAdminSerializer(serializers.ModelSerializer):
    """Users get a role (what they may do); "active" switches the account off without deleting it."""

    name = serializers.CharField(source="first_name", required=False, allow_blank=True)
    role = serializers.SerializerMethodField()
    role_id = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all(), write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False, min_length=8, trim_whitespace=False)

    class Meta:
        model = get_user_model()
        fields = ["id", "username", "name", "email", "is_active", "is_superuser", "role", "role_id", "password",
                  "last_login"]
        read_only_fields = ["last_login", "is_superuser"]

    def get_role(self, obj) -> dict | None:
        role = role_of(obj)
        return {"id": role.pk, "slug": role.slug, "name": role.name} if role else None

    @transaction.atomic
    def _apply(self, user, data):
        role = data.pop("role_id", None)
        password = data.pop("password", None)
        me = self.context["request"].user
        if user.pk == me.pk and data.get("is_active") is False:
            raise serializers.ValidationError({"is_active": ["ما بتقدر توقّف حسابك"]})
        for k, v in data.items():
            setattr(user, k, v)
        if password:
            from django.contrib.auth.password_validation import validate_password

            validate_password(password, user)
            user.set_password(password)
        user.save()
        if role is None and not hasattr(user, "access"):
            role = Role.objects.filter(slug=DEFAULT_ROLE).first()
        if role is not None:
            if user.pk == me.pk and not role.permissions.get("admin.roles") and not me.is_superuser:
                raise serializers.ValidationError({"role_id": ["ما بتقدر تشيل عن حالك إدارة الأدوار"]})
            UserAccess.objects.update_or_create(user=user, defaults={"role": role})
        return user

    def create(self, data):
        if not data.get("password"):
            raise serializers.ValidationError({"password": ["كلمة السر مطلوبة"]})
        return self._apply(get_user_model()(), data)

    def update(self, instance, data):
        return self._apply(instance, data)


class UserAdminViewSet(viewsets.ModelViewSet):
    serializer_class = UserAdminSerializer
    permission_classes = [IsAuthenticated, Perm("admin.users")]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]  # deactivate, never delete users

    def get_queryset(self):
        return get_user_model().objects.select_related("access__role").order_by("first_name", "username")


# ---------- admin area: system settings ----------
class SiteSettingsSerializer(serializers.ModelSerializer):
    smtp_password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)
    smtp_password_set = serializers.SerializerMethodField()

    class Meta:
        model = SiteSettings
        exclude = ["id"]

    def get_smtp_password_set(self, obj) -> bool:
        return bool(obj.smtp_password)

    def update(self, instance, data):
        if data.get("smtp_password", None) == "":
            data.pop("smtp_password")  # blank = keep the stored one
        return super().update(instance, data)


class SiteSettingsView(APIView):
    permission_classes = [IsAuthenticated, Perm("admin.settings")]

    @extend_schema(responses=SiteSettingsSerializer)
    def get(self, request):
        return Response(SiteSettingsSerializer(SiteSettings.load()).data)

    @extend_schema(request=SiteSettingsSerializer, responses=SiteSettingsSerializer)
    def patch(self, request):
        s = SiteSettingsSerializer(SiteSettings.load(), data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)


class TestEmailView(APIView):
    permission_classes = [IsAuthenticated, Perm("admin.settings")]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        from apps.core.mail import send_mail_dynamic

        to = request.user.email or SiteSettings.load().smtp_username
        try:
            send_mail_dynamic(subject="تجربة إيميل — BGI CRM", body="الإيميل شغّال ✓", to=[to])
        except (OSError, RuntimeError, smtplib.SMTPException) as exc:  # show SMTP errors to the admin
            raise serializers.ValidationError({"non_field_errors": [f"فشل الإرسال: {exc}"]}) from None
        return Response(status=status.HTTP_204_NO_CONTENT)
