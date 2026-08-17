from flask import Flask, jsonify, request

from poll import handler as poll_handler

app = Flask(__name__)


@app.get("/")
def home():
    return jsonify({
        "ok": True,
        "service": "Sekalipay Telegram Bot",
        "status": "online",
        "poll_endpoint": "/api/poll",
    })


@app.get("/api")
def api_root():
    return jsonify({
        "ok": True,
        "service": "Sekalipay Telegram Bot",
        "status": "online",
    })


@app.get("/health")
def health():
    import os
    return jsonify({
        "ok": True,
        "telegram_configured": bool(os.getenv("TELEGRAM_BOT_TOKEN", "").strip()),
        "sekalipay_configured": bool(os.getenv("SEKALIPAY_API_KEY", "").strip()),
        "google_sheets_configured": bool(
            (os.getenv("GOOGLE_SHEET_ID") or os.getenv("GOOGLE_SHEET_URL") or "").strip()
        ),
    })


@app.get("/api/poll")
def api_poll():
    return poll_handler(request)
