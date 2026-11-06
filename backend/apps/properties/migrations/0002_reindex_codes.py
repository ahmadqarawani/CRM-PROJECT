from django.db import migrations


def reindex(apps, schema_editor):
    """Properties created before the fix were indexed without their code (P-0012): rebuild their search text."""
    from apps.core.text import normalize_ar

    Property = apps.get_model("properties", "Property")
    for p in Property.objects.select_related("location"):
        text = normalize_ar(" ".join(filter(None, [p.code, p.legacy_code, p.address, p.location.name if p.location_id else ""])))
        if text != p.search_text:
            Property.objects.filter(pk=p.pk).update(search_text=text)


class Migration(migrations.Migration):
    dependencies = [("properties", "0001_initial")]
    operations = [migrations.RunPython(reindex, migrations.RunPython.noop)]
