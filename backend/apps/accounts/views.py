import smtplib

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status, viewsets
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.models import SiteSettings
from apps.core.serializers import UserRefSerializer
from apps.core.views import IsAdmin, can_delete


class MeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    name = serializers.CharField()
    is_admin = serializers.BooleanField()
    can_delete = serializers.BooleanField()


def me_payload(user) -> dict:
    return {
        "id": user.pk,
        "username": user.get_username(),
        "name": user.get_full_name() or user.get_username(),
        "is_admin": user.is_staff,
        "can_delete": can_delete(user),
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


# ---------- admin area: users ----------
class UserAdminSerializer(serializers.ModelSerializer):
    """Everyone has the same rights, plus two switches the admin sets: admin area, and hard delete."""

    name = serializers.CharField(source="first_name", required=False, allow_blank=True)
    is_admin = serializers.BooleanField(source="is_staff", required=False)
    can_delete = serializers.SerializerMethodField()
    can_delete_input = serializers.BooleanField(write_only=True, required=False)
    password = serializers.CharField(write_only=True, required=False, min_length=8, trim_whitespace=False)

    class Meta:
        model = get_user_model()
        fields = ["id", "username", "name", "email", "is_active", "is_admin", "can_delete", "can_delete_input",
                  "password", "last_login"]
        read_only_fields = ["last_login"]

    def get_can_delete(self, obj) -> bool:
        return can_delete(obj)

    def _apply(self, user, data):
        from django.contrib.auth.models import Permission

        flag = data.pop("can_delete_input", None)
        password = data.pop("password", None)
        for k, v in data.items():
            setattr(user, k, v)
        if password:
            from django.contrib.auth.password_validation import validate_password

            validate_password(password, user)
            user.set_password(password)
        user.save()
        if flag is not None:
            perm = Permission.objects.get(codename="delete_records", content_type__app_label="core")
            (user.user_permissions.add if flag else user.user_permissions.remove)(perm)
        return user

    def create(self, data):
        if not data.get("password"):
            raise serializers.ValidationError({"password": ["كلمة السر مطلوبة"]})
        return self._apply(get_user_model()(), data)

    def update(self, instance, data):
        return self._apply(instance, data)


class UserAdminViewSet(viewsets.ModelViewSet):
    serializer_class = UserAdminSerializer
    permission_classes = [IsAdmin]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]  # deactivate, never delete users

    def get_queryset(self):
        return get_user_model().objects.order_by("first_name", "username")


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
    permission_classes = [IsAdmin]

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
    permission_classes = [IsAdmin]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        from apps.core.mail import send_mail_dynamic

        to = request.user.email or SiteSettings.load().smtp_username
        try:
            send_mail_dynamic(subject="تجربة إيميل — BGI CRM", body="الإيميل شغّال ✓", to=[to])
        except (OSError, RuntimeError, smtplib.SMTPException) as exc:  # show SMTP errors to the admin
            raise serializers.ValidationError({"non_field_errors": [f"فشل الإرسال: {exc}"]}) from None
        return Response(status=status.HTTP_204_NO_CONTENT)
