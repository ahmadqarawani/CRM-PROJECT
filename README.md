# BGI CRM

نظام إدارة العملاء والطلبات والعقارات لـ **BGI Real Estate**.

- `backend/`: Django 5 + DRF + PostgreSQL (الـ API، والـ validation، والتذكيرات، والـ SSE)
- `frontend/`: React 19 + Vite + Tailwind (SPA)
- `ARCHITECTURE.md`: المعمارية والقرارات ونتائج الاختبار
- `data-import/`: نموذج البيانات (`DATA_MODEL.md`). ملفات الشيت (`customers.csv`، `realestates.csv`) وتقرير الاستيراد بيضلوا هون محلياً، وما بيطلعوا على git

## التشغيل المحلي

المتطلبات: **Python 3.12** (نفس نسخة Ubuntu 24)، و **Node 22 أو أحدث** (Vite 8 ما بيشتغل على 18)، و PostgreSQL.

```bash
# 1) backend
cd backend
python3.12 -m venv .venv
. .venv/bin/activate                       # Windows: .venv\Scripts\activate
python -m pip install -r requirements-dev.txt   # للإنتاج: requirements.txt بس
cp .env.example .env                       # وعدّل القيم (DJANGO_DEBUG=1 للتطوير)
python manage.py migrate
python manage.py createcachetable
python manage.py bootstrap_team            # ahmad, tarek, rand, ameer
python manage.py import_sheets --leads <csv> --properties <csv>   # dry run، وبعدين --commit
granian --interface asginl --host 127.0.0.1 --port 8000 config.asgi:application

# 2) frontend (بتاب تاني)
cd frontend
npm ci
npm run dev                                # http://localhost:5173 (بيعمل proxy لـ /api على 8000)
```

## أوامر مفيدة (من `backend/` والـ venv مفعّلة)

| الأمر | شو بيعمل |
|---|---|
| `pytest` | اختبارات الـ backend |
| `ruff check .` | lint |
| `python manage.py spectacular --file schema.yml` | OpenAPI schema |
| `python manage.py password_link <user>` | رابط لمرة وحدة لتعيين كلمة سر (إذا ما حدا بيقدر يفوت) |
| `npx -p openapi-typescript@7 -p typescript@5 openapi-typescript ../backend/schema.yml -o src/api/schema.d.ts` | توليد الـ types للفرونت (من `frontend/`) |
| `npm run build` | build الفرونت لـ `frontend/dist/` (ملفات static) |

**تحديث الـ dependencies:** نزّل أحدث نسخة من الحزم الأساسية (المكتوبة براس `requirements.txt`) بـ venv جديدة، شغّل `pytest`، وبعدين `pip freeze` لـ `requirements.txt`. أدوات التطوير بتروح على `requirements-dev.txt`.

## المجدولات (cron)

```
*/5 * * * *   cd backend && .venv/bin/python manage.py notify_tick
```

## ملاحظة للـ Windows
خلّي `PYTHONUTF8=1` بالبيئة، لأن الـ console الافتراضي ما بيطبع العربي بأوامر `manage.py shell`.
