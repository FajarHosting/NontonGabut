# Sekalipay Telegram Bot — GitHub + Vercel, tanpa VPS & tanpa Telegram webhook

Versi ini mempertahankan handler bisnis dari `otp.py`, tetapi mengganti:

- `app.run_polling()` -> endpoint Vercel `/api/poll`
- `users.json` -> Google Sheets
- polling otomatis -> GitHub Actions setiap 5 menit
- tidak memakai Telegram webhook
- tidak membutuhkan device/VPS yang hidup 24/7

## Penting

Google Sheets **tidak bisa ditulis hanya dengan link spreadsheet**.
Untuk operasi tulis, Google API membutuhkan OAuth. Versi ini sengaja **tidak memakai service-account JSON**.

Environment yang diperlukan:

- `TELEGRAM_BOT_TOKEN`
- `SEKALIPAY_API_KEY`
- `GOOGLE_SHEET_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `CRON_SECRET`

## Struktur

```text
.
├── api/
│   └── poll.py
├── bot.py
├── sheets_db.py
├── requirements.txt
├── vercel.json
├── .env.example
└── .github/
    └── workflows/
        └── poll.yml
```

## Deployment

1. Upload semua file ke GitHub.
2. Import repository tersebut ke Vercel.
3. Masukkan environment variables di Vercel.
4. Deploy.
5. Di GitHub repository, buka Settings -> Secrets and variables -> Actions.
6. Buat:
   - `VERCEL_POLL_URL` = `https://DOMAIN-VERCEL/api/poll`
   - `CRON_SECRET` = nilai yang sama dengan environment Vercel.
7. Aktifkan GitHub Actions.
8. Jalankan workflow `Telegram Bot Poller` sekali secara manual untuk tes.

## Google Sheets

Buat spreadsheet dan biarkan tab `Users` dan `Meta` dibuat otomatis oleh aplikasi.
Akun Google yang dipakai OAuth harus punya akses edit ke spreadsheet tersebut.

Tab `Users` memakai kolom:

`user_id | name | saldo | pending_topup_json | state_json | updated_at | version`

Tab `Meta` menyimpan offset Telegram.

## Catatan realtime

Karena user meminta TANPA webhook, Telegram update diambil memakai `getUpdates`.
GitHub Actions adalah scheduler yang memanggil endpoint Vercel.

GitHub menjadwalkan workflow paling cepat setiap 5 menit, sehingga bot ini bukan realtime per detik.
Untuk respons benar-benar instan, Telegram webhook adalah arsitektur yang lebih tepat.
