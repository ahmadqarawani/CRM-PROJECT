"""Password reset & change.

Forgot password: the user gives their username or email; if the account exists and has an email, a one-time link is
mailed (Django's token generator: valid PASSWORD_RESET_TIMEOUT, dead as soon as the password changes). The answer is
the same whether or not the account exists, so the form can't be used to find out who has an account.
No email? An admin creates the same link from Settings → Users, or on the server: `manage.py password_link <user>`.
"""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.utils.decorators import method_decorator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import csrf_protect
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.mail import send_mail_dynamic
from apps.core.models import SiteSettings

logger = logging.getLogger(__name__)
User = get_user_model()

BAD_LINK = "الرابط منتهي أو مستعمل قبل. اطلب رابط جديد."


def reset_link(user, base_url: str | None = None) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f"{(base_url or settings.APP_URL).rstrip('/')}/reset-password?uid={uid}&token={token}"


def link_hours() -> int:
    return settings.PASSWORD_RESET_TIMEOUT // 3600


def user_from_link(uid: str, token: str):
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(uid)), is_active=True)
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        return None
    return user if default_token_generator.check_token(user, token) else None


def check_new_password(password: str, user, field: str = "password"):
    try:
        validate_password(password, user)
    except DjangoValidationError as e:
        raise serializers.ValidationError({field: list(e.messages)}) from None


def app_base(request) -> str:
    """The address the user is on (the SPA and the API share one origin: Vite proxy in dev, nginx in production)."""
    return request.build_absolute_uri("/").rstrip("/")


class ResetRequestSerializer(serializers.Serializer):
    login = serializers.CharField(help_text="username or email")


@method_decorator(csrf_protect, name="post")
class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "password_reset"
    throttle_classes = [ScopedRateThrottle]

    @extend_schema(request=ResetRequestSerializer, responses=inline_serializer(
        "PasswordResetRequested", {"email_enabled": serializers.BooleanField()}))
    def post(self, request):
        data = ResetRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        login = data.validated_data["login"].strip()
        user = User.objects.filter(Q(username__iexact=login) | Q(email__iexact=login), is_active=True).first()
        if user and user.email:
            hours = link_hours()
            body = (f"مرحبا {user.get_full_name() or user.get_username()}،\n\n"
                    f"حدا طلب إعادة تعيين كلمة السر لحسابك ({user.get_username()}) بنظام BGI CRM.\n"
                    f"افتح هالرابط لتحط كلمة سر جديدة (بيشتغل مرة وحدة، ولمدة {hours} ساعة):\n\n"
                    f"{reset_link(user, app_base(request))}\n\n"
                    "إذا ما طلبت هالشي، تجاهل هالإيميل وكلمة السر بتضل متل ما هي.")
            send_mail_dynamic(subject="إعادة تعيين كلمة السر — BGI CRM", body=body, to=[user.email], fail_silently=True)
        elif user:
            logger.info("password reset asked for %s, who has no email", user.get_username())
        # same answer either way: the form must not reveal which accounts exist
        return Response({"email_enabled": SiteSettings.load().email_enabled})


class LinkSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()


@method_decorator(csrf_protect, name="post")
class PasswordResetCheckView(APIView):
    """Before showing the form: is the link still good, and for which account?"""

    permission_classes = [AllowAny]

    @extend_schema(request=LinkSerializer, responses=inline_serializer("PasswordResetLink", {
        "username": serializers.CharField(), "name": serializers.CharField()}))
    def post(self, request):
        data = LinkSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = user_from_link(data.validated_data["uid"], data.validated_data["token"])
        if user is None:
            raise serializers.ValidationError({"token": [BAD_LINK]})
        return Response({"username": user.get_username(), "name": user.get_full_name() or user.get_username()})


class ResetConfirmSerializer(LinkSerializer):
    password = serializers.CharField(trim_whitespace=False)


@method_decorator(csrf_protect, name="post")
class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "password_reset"
    throttle_classes = [ScopedRateThrottle]

    @extend_schema(request=ResetConfirmSerializer, responses={204: None})
    def post(self, request):
        data = ResetConfirmSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = user_from_link(data.validated_data["uid"], data.validated_data["token"])
        if user is None:
            raise serializers.ValidationError({"token": [BAD_LINK]})
        check_new_password(data.validated_data["password"], user)
        user.set_password(data.validated_data["password"])
        user.save(update_fields=["password"])  # changes the hash → this link (and older ones) stop working
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)


class PasswordChangeView(APIView):
    """A logged-in user changes their own password (needs the current one); they stay logged in."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=PasswordChangeSerializer, responses={204: None})
    def post(self, request):
        data = PasswordChangeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(data.validated_data["current_password"]):
            raise serializers.ValidationError({"current_password": ["كلمة السر الحالية غلط"]})
        check_new_password(data.validated_data["new_password"], user, "new_password")
        user.set_password(data.validated_data["new_password"])
        user.save(update_fields=["password"])
        update_session_auth_hash(request, user)  # keep this session; other devices get logged out
        return Response(status=status.HTTP_204_NO_CONTENT)
