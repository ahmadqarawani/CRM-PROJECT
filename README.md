# BGI CRM

نظام إدارة العملاء والطلبات والشقق لـ **BGI Real Estate**.

- `backend/`: Django 5 + DRF + PostgreSQL (الـ API، والـ validation، والتذكيرات، والـ SSE)
- `frontend/`: React 19 + Vite + Tailwind (SPA)
- `ARCHITECTURE.md`: المعمارية والقرارات ونتائج الاختبار
- `design/`: بحث التصميم وعيّنة الألوان

## التشغيل المحلي

```bash
# 1) backend
cd backend
cp .env.example .env            # وعدّل القيم (DJANGO_DEBUG=1 للتطوير)
uv sync
uv run python manage.py migrate
uv run python manage.py createcachetable
DEMO_PASSWORD=... uv run python manage.py seed_demo     # اختياري: بيانات تجريبية (admin / samer)
uv run granian --interface asginl --host 127.0.0.1 --port 8000 config.asgi:application

# 2) frontend (بتاب تاني)
cd frontend
npm install
npm run dev                      # http://localhost:5173  (بيعمل proxy لـ /api على 8000)
```

## أوامر مفيدة

| الأمر | شو بيعمل |
|---|---|
| `uv run pytest` | 62 اختبار للـ backend |
| `uv run python scripts/e2e_sse.py` | e2e للـ SSE على Granian |
| `uv run python manage.py spectacular --file schema.yml` | OpenAPI schema |
| `npx -p openapi-typescript@7 -p typescript@5 openapi-typescript ../backend/schema.yml -o src/api/schema.d.ts` | توليد الـ types للفرونت (من `frontend/`) |
| `npm run build` | build الفرونت لـ `frontend/dist/` (ملفات static) |

## المجدولات (cron)

```
*/5 * * * *   cd backend && uv run python manage.py scan_overdue
30 2 * * *    cd backend && uv run python manage.py cleanup
```

## ملاحظة للـ Windows
خلّي `PYTHONUTF8=1` بالبيئة، لأن الـ console الافتراضي ما بيطبع العربي بأوامر `manage.py shell`.
