RUNTIME FIX

Replace:
- api/index.py
- api/poll.py
- requirements.txt
- vercel.json

Why:
Vercel was finding api.index:app but `app` was a plain Python function.
The current Python runtime expects the exported `app` to be a WSGI or ASGI application.
This patch wraps the existing poll handler in Flask (WSGI).

Keep:
- bot.py
- sheets_db.py
- GitHub Actions workflow

Environment variables remain in Vercel. Do not commit secrets.

Test:
GET /api without CRON_SECRET should return 401.
GET /api/poll with Authorization: Bearer <CRON_SECRET> should execute one polling batch.
