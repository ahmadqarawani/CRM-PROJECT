from django.db import migrations


def seed(apps, schema_editor):
    from apps.catalog.seed import run

    run(apps)


class Migration(migrations.Migration):
    dependencies = [("catalog", "0001_initial"), ("deals", "0001_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
