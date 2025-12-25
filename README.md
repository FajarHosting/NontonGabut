- Frontend: folder /public (bisa GitHub Pages)
- Backend: folder /api (Vercel Serverless)

Jika frontend di GitHub Pages:
- edit public/config.js -> API_BASE = "https://YOUR-VERCEL.vercel.app"

Jika frontend di Vercel:
- API_BASE = "" (default)

Admin:
- set env ADMIN_EMAILS berisi email admin.