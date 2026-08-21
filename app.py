import asyncio
import os
import secrets

import requests
from flask import Flask, jsonify, request

from bot import build_application, process_single_update
from sheets_db import get_db

app = Flask(__name__)


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def _base_url() -> str:
    public = _env("PUBLIC_BASE_URL").rstrip("/")
    if public:
        return public
    return f"https://{_env('VERCEL_URL')}" if _env("VERCEL_URL") else request.host_url.rstrip("/")


def _telegram(method: str, payload=None):
    token = _env("TELEGRAM_BOT_TOKEN")
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN belum diatur di Vercel.")
    response = requests.post(
        f"https://api.telegram.org/bot{token}/{method}",
        json=payload or {},
        timeout=15,
    )
    try:
        data = response.json()
    except Exception:
        data = {"ok": False, "raw": response.text}
    if response.status_code >= 400 or not data.get("ok"):
        raise RuntimeError(f"Telegram {method} gagal: {data}")
    return data


@app.get("/")
def home():
    return jsonify({
        "ok": True,
        "service": "Sekalipay Telegram Bot",
        "status": "online",
        "mode": "telegram-webhook",
        "webhook_endpoint": "/api/telegram",
        "sekalipay_webhook": "/api/sekalipay",
    })


@app.get("/api")
def api_root():
    return home()


@app.get("/health")
@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "telegram_configured": bool(_env("TELEGRAM_BOT_TOKEN")),
        "sekalipay_configured": bool(_env("SEKALIPAY_API_KEY")),
        "google_sheets_configured": bool(
            _env("GOOGLE_SHEET_ID") or _env("GOOGLE_SHEET_URL")
        ),
        "mode": "telegram-webhook",
    })


@app.post("/api/telegram")
def telegram_webhook():
    expected = _env("TELEGRAM_WEBHOOK_SECRET")
    received = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if expected and not secrets.compare_digest(received, expected):
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    update = request.get_json(silent=True)
    if not isinstance(update, dict):
        return jsonify({"ok": False, "error": "Invalid JSON"}), 400

    application = None
    try:
        application = build_application()
        asyncio.run(_handle_update(application, update))
        return jsonify({"ok": True})
    except Exception as exc:
        print("TELEGRAM WEBHOOK ERROR:", repr(exc))
        # Return non-2xx so Telegram can retry a failed update.
        return jsonify({"ok": False, "error": str(exc)}), 500


async def _handle_update(application, update: dict):
    await application.initialize()
    try:
        await process_single_update(application, update)
    finally:
        await application.shutdown()


@app.get("/api/setup")
def setup_webhook():
    setup_key = _env("SETUP_KEY")
    supplied = request.headers.get("X-Setup-Key", "") or request.args.get("key", "")
    if not setup_key or not secrets.compare_digest(supplied, setup_key):
        return jsonify({"ok": False, "error": "Unauthorized"}), 401

    get_db()

    webhook_url = f"{_base_url()}/api/telegram"
    payload = {
        "url": webhook_url,
        "drop_pending_updates": False,
        "allowed_updates": ["message", "callback_query"],
    }

    secret = _env("TELEGRAM_WEBHOOK_SECRET")
    if secret:
        payload["secret_token"] = secret

    result = _telegram("setWebhook", payload)
    return jsonify({
        "ok": True,
        "webhook_url": webhook_url,
        "telegram": result,
    })


@app.get("/api/webhook-info")
def webhook_info():
    setup_key = _env("SETUP_KEY")
    supplied = request.headers.get("X-Setup-Key", "") or request.args.get("key", "")
    if not setup_key or not secrets.compare_digest(supplied, setup_key):
        return jsonify({"ok": False, "error": "Unauthorized"}), 401
    return jsonify(_telegram("getWebhookInfo"))


@app.get("/api/poll")
def poll_disabled():
    return jsonify({
        "ok": False,
        "error": "Polling disabled. This deployment uses Telegram webhook mode.",
        "webhook_endpoint": "/api/telegram",
    }), 410
