"""Create the built-in roles (idempotent; never overwrites edits an admin made)."""

from .registry import DEFAULT_ROLES, normalize


def seed_roles(apps=None):
    if apps is None:
        from .models import Role
    else:
        Role = apps.get_model("access", "Role")
    for slug, spec in DEFAULT_ROLES.items():
        Role.objects.get_or_create(slug=slug, defaults={
            "name": spec["name"], "description": spec["description"], "order": spec["order"], "is_system": True,
            "permissions": normalize(spec["permissions"]),
        })


def assign_existing_users(apps):
    """Map the old switches: superuser → admin, admin area or delete right → manager, everyone else → agent."""
    User = apps.get_model("auth", "User")
    Role = apps.get_model("access", "Role")
    UserAccess = apps.get_model("access", "UserAccess")
    roles = {r.slug: r for r in Role.objects.all()}
    for user in User.objects.all():
        if UserAccess.objects.filter(user=user).exists():
            continue
        can_delete = user.user_permissions.filter(codename="delete_records").exists()
        slug = "admin" if user.is_superuser else "manager" if (user.is_staff or can_delete) else "agent"
        UserAccess.objects.create(user=user, role=roles[slug])
