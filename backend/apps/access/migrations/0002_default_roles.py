from django.db import migrations


def forwards(apps, schema_editor):
    from apps.access.seed import assign_existing_users, seed_roles

    seed_roles(apps)
    assign_existing_users(apps)


class Migration(migrations.Migration):
    dependencies = [
        ("access", "0001_initial"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
