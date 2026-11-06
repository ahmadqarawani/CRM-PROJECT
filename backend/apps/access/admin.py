from django.contrib import admin

from .models import Role, UserAccess


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "is_system", "order"]


@admin.register(UserAccess)
class UserAccessAdmin(admin.ModelAdmin):
    list_display = ["user", "role"]
    list_select_related = ["user", "role"]
