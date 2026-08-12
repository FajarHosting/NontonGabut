# Sekalipay Telegram Gateway — Vercel Serverless

Versi ini tidak memakai `app.run()` dan tidak memakai Telegram polling.
Telegram mengirim update ke:

`POST /api/telegram`

Sekalipay mengirim webhook ke:

`POST /api/sekalipay`

Data user, session, topup, transaksi, dan log webhook disimpan di Google Sheets.

## Struktur

- `api/index.py` — server Flask/serverless utama
- `vercel.json` — routing Vercel
- `requirements.txt` — dependency
- `.env.example` — contoh Environment Variables

## Deploy

1. Push semua file ke GitHub.
2. Import repository ke Vercel.
3. Di Vercel buka **Project Settings → Environment Variables**.
4. Masukkan semua variable dari `.env.example`.
5. Jangan upload `.env` ke GitHub.
6. Deploy ulang setelah Environment Variables tersimpan.

## Google Sheets

Buat satu spreadsheet lalu share spreadsheet tersebut ke `client_email`
dari Google Service Account sebagai Editor.

`GOOGLE_SHEET_ID` boleh berupa ID spreadsheet atau URL spreadsheet.
`GOOGLE_SERVICE_ACCOUNT_JSON` harus JSON service account lengkap, bukan hanya
`{"type":"service_account"}`.

## Aktifkan Telegram webhook

Setelah deploy, buka:

`https://DOMAIN-KAMU.vercel.app/api/setup?key=SETUP_KEY`

Endpoint tersebut akan:
- membuat sheet yang diperlukan jika belum ada
- memasang Telegram webhook
- menggunakan `TELEGRAM_WEBHOOK_SECRET` jika diisi

Cek webhook:

`https://DOMAIN-KAMU.vercel.app/api/webhook-info?key=SETUP_KEY`

## Sekalipay webhook

Set URL webhook Sekalipay ke:

`https://DOMAIN-KAMU.vercel.app/api/sekalipay`

Signature divalidasi memakai `SEKALIPAY_WEBHOOK_SECRET`.

## Panel admin

Tidak memakai HTTP Basic Auth, jadi tidak akan muncul popup browser
"Nama pengguna dan sandi".

Akses:

`https://DOMAIN-KAMU.vercel.app/panel?key=ADMIN_PANEL_KEY`

## Catatan penting

Vercel bukan VPS yang menjalankan proses Python terus-menerus. Pada arsitektur
ini Vercel menjalankan fungsi Python ketika ada request/webhook. Karena bot
menggunakan webhook, tidak perlu VPS dan tidak perlu `run_polling()`.

Untuk trafik besar, Google Sheets bisa menjadi bottleneck karena setiap request
membaca/menulis spreadsheet. Untuk penggunaan kecil/menengah model ini cocok
sebagai pengganti VPS sederhana.
