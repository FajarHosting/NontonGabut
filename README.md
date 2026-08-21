# Sekalipay Telegram Bot — Vercel + Google Sheets

## Struktur

- `app.py` — Flask entrypoint Vercel.
- `bot.py` — seluruh handler Telegram, katalog, topup, order, saldo, dan polling.
- `sheets_db.py` — penyimpanan user/state/offset di Google Sheets via OAuth refresh token.
- `poll.py` — endpoint aman untuk menjalankan satu batch `getUpdates`.
- `.github/workflows/poll.yml` — pemicu polling setiap 5 menit dari GitHub Actions.
- `vercel.json` — hanya mengatur max duration; tidak memakai Vercel Cron.

## Kenapa tidak Vercel Cron?

Polling Telegram membutuhkan frekuensi lebih sering daripada cron harian. Pada Hobby, Vercel Cron dibatasi sehingga workflow GitHub Actions dipakai sebagai scheduler eksternal.

## Environment Variables Vercel

```text
TELEGRAM_BOT_TOKEN=...
SEKALIPAY_API_KEY=...
CRON_SECRET=...
GOOGLE_SHEET_ID=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_SHEET_TAB=Users
GOOGLE_META_TAB=Meta
MIN_TOPUP=500
DASHBOARD_IMG=https://...
```

`GOOGLE_SHEET_URL` boleh dipakai sebagai pengganti `GOOGLE_SHEET_ID`.

## GitHub Actions Secrets

Tambahkan:

```text
VERCEL_POLL_URL=https://<domain-vercel-kamu>/api/poll
CRON_SECRET=<nilai-yang-sama-dengan-Vercel>
```

Workflow bisa dijalankan manual dari tab **Actions** untuk test pertama.

## Test setelah deploy

1. Buka `/` → harus mendapat JSON `ok: true`.
2. Buka `/health` → harus menunjukkan konfigurasi Telegram/Sekalipay/Sheets.
3. Jalankan workflow **Poll Telegram Bot** secara manual.
4. Cek response `/api/poll`.
5. Kirim `/start` ke bot Telegram.

Jangan commit `.env` atau secret ke GitHub.


## Vercel deployment

This project intentionally uses `api/index.py` as the Vercel Flask entrypoint. Python dependencies are installed from `requirements.txt`; there is no `pyproject.toml` so Vercel does not invoke uv project locking. The entrypoint imports the Flask object from the root `app.py`.
