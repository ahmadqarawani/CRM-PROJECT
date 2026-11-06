from django.contrib.auth import authenticate, get_user_model, login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.serializers import UserRefSerializer


class MeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    name = serializers.CharField()
    is_admin = serializers.BooleanField()


def me_payload(user) -> dict:
    return {
        "id": user.pk,
        "username": user.get_username(),
        "name": user.get_full_name() or user.get_username(),
        "is_admin": user.is_staff,
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
