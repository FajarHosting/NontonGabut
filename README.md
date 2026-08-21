# Sekalipay Telegram Bot — Vercel Webhook + Google Sheets

Versi ini memakai **Telegram Webhook**, bukan `getUpdates` polling. Telegram akan mengirim setiap `/start`, pesan, dan callback button langsung ke `POST /api/telegram`. Telegram memang menyediakan dua mode yang saling eksklusif: `getUpdates` atau webhook; untuk Vercel serverless, webhook adalah pilihan yang tepat.

## Struktur

- `api/index.py` — entrypoint Flask untuk Vercel.
- `app.py` — route webhook Telegram, setup webhook, health check, dan endpoint Sekalipay.
- `bot.py` — katalog produk, saldo, topup, order, dan handler Telegram.
- `sheets_db.py` — penyimpanan user/state di Google Sheets.
- `requirements.txt` — dependency Python.
- `vercel.json` — konfigurasi function Vercel.

## Environment Variables

Wajib:

```text
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
SETUP_KEY=...
SEKALIPAY_API_KEY=...
GOOGLE_SHEET_ID=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

Opsional:

```text
PUBLIC_BASE_URL=https://nama-project.vercel.app
GOOGLE_SHEET_TAB=Users
GOOGLE_META_TAB=Meta
MIN_TOPUP=500
DASHBOARD_IMG=https://...
```

Jangan commit `.env`.

## Deploy

1. Hapus `pyproject.toml` lama jika isinya tidak memiliki `[project]`. Dependency project ini cukup memakai `requirements.txt`.
2. Push seluruh file ke GitHub.
3. Import repository ke Vercel.
4. Masukkan Environment Variables di Vercel.
5. Deploy ulang.
6. Buka `/api/setup?key=SETUP_KEY`.
7. Buka `/api/webhook-info?key=SETUP_KEY` dan pastikan `url` menunjuk ke `/api/telegram`.
8. Kirim `/start` ke bot.

## URL webhook

Telegram webhook: `https://DOMAIN.vercel.app/api/telegram`

Sekalipay webhook: `https://DOMAIN.vercel.app/api/sekalipay`

## Catatan jualan produk digital

Alur yang dipertahankan dari bot:

1. User daftar.
2. User top up saldo melalui channel pembayaran Sekalipay.
3. Bot mengecek status pembayaran.
4. User memilih produk/variant.
5. Bot melakukan transaksi melalui API Sekalipay menggunakan `SEKALIPAY_API_KEY`.
6. Webhook Sekalipay menangani status order dan item/license.
7. Data user, saldo, state, dan transaksi disimpan di Google Sheets sesuai kode yang tersedia.

Vercel tidak menjalankan proses Python terus-menerus; function dipanggil ketika ada HTTP request.
