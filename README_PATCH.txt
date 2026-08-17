PATCH VERCEL

Replace/create these files in the root of your GitHub repository:

api/index.py
api/poll.py
vercel.json

Keep bot.py and sheets_db.py from the full bot package.

Important:
- Do NOT add Flask.
- Do NOT add while True.
- Do NOT use Telegram webhook.
- Vercel endpoint: /api
- GitHub Actions should call /api with Authorization: Bearer CRON_SECRET.
- Keep Telegram token, Sekalipay API key, Google OAuth credentials and CRON_SECRET in Vercel Environment Variables.
