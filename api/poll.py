import asyncio
import os

from bot import poll_once


def _authorized(request):
    secret = os.getenv("CRON_SECRET", "").strip()
    if not secret:
        return False

    auth = request.headers.get("authorization", "")
    if auth == f"Bearer {secret}":
        return True

    # Also allow ?key=... for easy browser testing.
    return request.args.get("key") == secret


def handler(request):
    if request.method != "GET":
        return {
            "ok": False,
            "error": "GET only",
        }, 405

    if not _authorized(request):
        return {
            "ok": False,
            "error": "Unauthorized",
        }, 401

    try:
        result = asyncio.run(poll_once())
        return result, 200
    except Exception as exc:
        print("POLL ERROR:", repr(exc))
        return {
            "ok": False,
            "error": str(exc),
        }, 500
