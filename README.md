# BGI CRM

نظام إدارة العملاء والطلبات والعقارات لـ **BGI Real Estate**.

- `backend/`: Django 5 + DRF + PostgreSQL (الـ API، والـ validation، والتذكيرات، والـ SSE)
- `frontend/`: React 19 + Vite + Tailwind (SPA)
- `ARCHITECTURE.md`: المعمارية والقرارات ونتائج الاختبار
- `data-import/`: نموذج البيانات (`DATA_MODEL.md`). ملفات الشيت (`customers.csv`، `realestates.csv`) وتقرير الاستيراد بيضلوا هون محلياً، وما بيطلعوا على git

## التشغيل المحلي

```bash
# 1) backend
cd backend
cp .env.example .env            # وعدّل القيم (DJANGO_DEBUG=1 للتطوير)
uv sync
uv run python manage.py migrate
uv run python manage.py createcachetable
uv run python manage.py bootstrap_team    # ahmad, tarek, rand, ameer (بعدين: manage.py changepassword ahmad)
uv run python manage.py import_sheets --leads <csv> --properties <csv>   # dry run، وبعدين --commit
uv run granian --interface asginl --host 127.0.0.1 --port 8000 config.asgi:application

# بدون uv (pip + venv): نفس النسخ بالضبط من uv.lock
python3 -m venv venv && . venv/bin/activate
pip install -r requirements.txt      # وبعدين python manage.py ... بدل uv run python manage.py ...

# 2) frontend (بدو Node 22، لأن Vite 8 ما بيشتغل على 18) (بتاب تاني)
cd frontend
npm install
npm run dev                      # http://localhost:5173  (بيعمل proxy لـ /api على 8000)
```

## أوامر مفيدة

| الأمر | شو بيعمل |
|---|---|
| `uv run pytest` | اختبارات الـ backend |
| `uv export --format requirements-txt --no-dev --no-emit-project -o requirements.txt` | تحديث `requirements.txt` بعد أي تغيير بالـ dependencies (من `backend/`) |
| `uv run python scripts/e2e_sse.py` | e2e للـ SSE على Granian |
| `uv run python manage.py spectacular --file schema.yml` | OpenAPI schema |
| `npx -p openapi-typescript@7 -p typescript@5 openapi-typescript ../backend/schema.yml -o src/api/schema.d.ts` | توليد الـ types للفرونت (من `frontend/`) |
| `npm run build` | build الفرونت لـ `frontend/dist/` (ملفات static) |

## المجدولات (cron)

```
*/5 * * * *   cd backend && uv run python manage.py notify_tick
```

## ملاحظة للـ Windows
خلّي `PYTHONUTF8=1` بالبيئة، لأن الـ console الافتراضي ما بيطبع العربي بأوامر `manage.py shell`.
