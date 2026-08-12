
import os
import json
import html
import hashlib
import secrets
import time
import re
from functools import wraps
from urllib.parse import urlparse

import requests
import gspread
from flask import Flask, request, jsonify, Response
from google.oauth2.service_account import Credentials


app = Flask(__name__)

# ============================================================
# CONFIG
# Semua secret/config dibaca dari Vercel Environment Variables.
# ============================================================

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
ADMIN_ID = (os.getenv("TELEGRAM_ADMIN_ID") or os.getenv("ADMIN_ID") or "").strip()
CHAT_ID = (os.getenv("TELEGRAM_CHAT_ID") or "").strip()
THREAD_ID = (os.getenv("TELEGRAM_THREAD_ID") or "").strip()

SEKALIPAY_API_KEY = os.getenv("SEKALIPAY_API_KEY", "").strip()
SEKALIPAY_BASE_URL = (
    os.getenv("SEKALIPAY_BASE_URL")
    or "https://sekalipay.com/api/v1"
).strip().rstrip("/")
SEKALIPAY_WEBHOOK_SECRET = (
    os.getenv("SEKALIPAY_WEBHOOK_SECRET")
    or os.getenv("WEBHOOK_SECRET")
    or ""
).strip()

TELEGRAM_WEBHOOK_SECRET = (
    os.getenv("TELEGRAM_WEBHOOK_SECRET")
    or os.getenv("WEBHOOK_SECRET")
    or ""
).strip()

SETUP_KEY = os.getenv("SETUP_KEY", "").strip()
ADMIN_PANEL_KEY = os.getenv("ADMIN_PANEL_KEY", "").strip()

GOOGLE_SHEET_ID = os.getenv("GOOGLE_SHEET_ID", "").strip()
GOOGLE_SERVICE_ACCOUNT_JSON = os.getenv(
    "GOOGLE_SERVICE_ACCOUNT_JSON", ""
).strip()

MIN_TOPUP = max(1, int(os.getenv("MIN_TOPUP", "500") or "500"))

DASHBOARD_IMG = os.getenv(
    "DASHBOARD_IMG",
    "https://i.ibb.co/230mW4Xf/img-5578497211.jpg"
).strip()

PREFERRED_TOPUP_TYPES = {"qris"}
PREFERRED_TOPUP_NAMES = {"qris"}

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

HEADERS = {
    "X-APIKEY": SEKALIPAY_API_KEY,
    "Accept": "application/json",
    "Content-Type": "application/json",
}

SHEETS = {
    "users": ["telegram_id", "name", "saldo", "created_at"],
    "sessions": ["telegram_id", "step", "data_json", "updated_at"],
    "transactions": [
        "ref_id", "telegram_id", "invoice", "product", "variant",
        "target", "amount", "status", "created_at"
    ],
    "topups": [
        "ref_id", "telegram_id", "invoice", "amount", "fee",
        "total", "channel", "status", "created_at"
    ],
    "webhook_events": ["event_key", "event", "created_at"],
}


# ============================================================
# UTILS
# ============================================================

def esc(value):
    return html.escape(str(value if value is not None else ""))


def rupiah(value):
    try:
        n = int(float(value))
    except Exception:
        n = 0
    return "Rp {:,.0f}".format(n).replace(",", ".")


def safe_int(value, default=0):
    try:
        return int(float(value))
    except Exception:
        return default


def now():
    return str(int(time.time()))


def generate_ref(prefix="TRX"):
    return f"{prefix}-{secrets.token_hex(5).upper()}"


def sensor_data(value):
    value = str(value or "-")
    if value == "-" or len(value) <= 6:
        return value
    return value[:4] + "***" + value[-4:]


def extract_sheet_id(value):
    value = (value or "").strip()
    if "/spreadsheets/d/" in value:
        m = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", value)
        if m:
            return m.group(1)
    return value


GOOGLE_SHEET_ID = extract_sheet_id(GOOGLE_SHEET_ID)


# ============================================================
# GOOGLE SHEETS
# ============================================================

def get_spreadsheet():
    if not GOOGLE_SERVICE_ACCOUNT_JSON:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON belum diatur")
    if not GOOGLE_SHEET_ID:
        raise RuntimeError("GOOGLE_SHEET_ID belum diatur")

    info = json.loads(GOOGLE_SERVICE_ACCOUNT_JSON)
    creds = Credentials.from_service_account_info(info, scopes=SCOPES)
    client = gspread.authorize(creds)
    return client.open_by_key(GOOGLE_SHEET_ID)


def get_ws(name):
    ss = get_spreadsheet()
    try:
        return ss.worksheet(name)
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title=name, rows=2000, cols=30)
        headers = SHEETS[name]
        ws.append_row(headers)
        return ws


def init_database():
    # Dipanggil hanya dari setup, supaya request Telegram tidak selalu
    # membuat/mengubah struktur sheet.
    for name, headers in SHEETS.items():
        ws = get_ws(name)
        if not ws.get_all_values():
            ws.append_row(headers)


def records(name):
    return get_ws(name).get_all_records()


def find_record(name, key, value):
    ws = get_ws(name)
    vals = ws.get_all_records()
    for idx, row in enumerate(vals, start=2):
        if str(row.get(key, "")) == str(value):
            return idx, row
    return None, None


# ============================================================
# USER + SESSION
# ============================================================

def ensure_user(telegram_id, name="User"):
    idx, user = find_record("users", "telegram_id", telegram_id)
    if user:
        if str(user.get("name", "")) != str(name or "User"):
            try:
                ws = get_ws("users")
                col = ws.row_values(1).index("name") + 1
                ws.update_cell(idx, col, name or "User")
            except Exception:
                pass
        return user

    get_ws("users").append_row([
        str(telegram_id),
        name or "User",
        0,
        now(),
    ])
    return {
        "telegram_id": str(telegram_id),
        "name": name or "User",
        "saldo": 0,
        "created_at": now(),
    }


def get_balance(telegram_id):
    _, user = find_record("users", "telegram_id", telegram_id)
    return safe_int(user.get("saldo", 0)) if user else 0


def set_balance(telegram_id, amount):
    idx, user = find_record("users", "telegram_id", telegram_id)
    if not user:
        return False
    ws = get_ws("users")
    col = ws.row_values(1).index("saldo") + 1
    ws.update_cell(idx, col, max(0, int(amount)))
    return True


def add_balance(telegram_id, amount):
    return set_balance(
        telegram_id,
        get_balance(telegram_id) + int(amount)
    )


def get_session(telegram_id):
    _, row = find_record("sessions", "telegram_id", telegram_id)
    if not row:
        return {"step": "", "data": {}}
    try:
        data = json.loads(row.get("data_json") or "{}")
    except Exception:
        data = {}
    return {"step": row.get("step", ""), "data": data}


def set_session(telegram_id, step="", data=None):
    data = data or {}
    idx, _ = find_record("sessions", "telegram_id", telegram_id)
    ws = get_ws("sessions")
    values = [str(telegram_id), step, json.dumps(data, ensure_ascii=False), now()]
    if idx:
        ws.update(f"A{idx}:D{idx}", [values])
    else:
        ws.append_row(values)


def clear_session(telegram_id):
    set_session(telegram_id, "", {})


# ============================================================
# TELEGRAM
# ============================================================

def tg(method, payload):
    if not BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN belum diatur")
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"
    return requests.post(url, json=payload, timeout=25)


def send_message(chat_id, text, reply_markup=None, thread_id=None):
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    if thread_id:
        payload["message_thread_id"] = int(thread_id)
    return tg("sendMessage", payload)


def send_admin(text):
    if ADMIN_ID:
        return send_message(ADMIN_ID, text)
    return None


def send_group(text):
    if not CHAT_ID:
        return None
    return send_message(
        CHAT_ID,
        text,
        thread_id=THREAD_ID or None,
    )


def answer_callback(callback_id, text=None, alert=False):
    payload = {"callback_query_id": callback_id}
    if text:
        payload["text"] = text
    if alert:
        payload["show_alert"] = True
    return tg("answerCallbackQuery", payload)


# ============================================================
# SEKALIPAY
# ============================================================

def api_get(endpoint, timeout=20):
    return requests.get(
        f"{SEKALIPAY_BASE_URL}{endpoint}",
        headers=HEADERS,
        timeout=timeout,
    )


def api_post(endpoint, payload, timeout=40):
    return requests.post(
        f"{SEKALIPAY_BASE_URL}{endpoint}",
        json=payload,
        headers=HEADERS,
        timeout=timeout,
    )


def channel_code(channel):
    return channel.get("service") or channel.get("code") or ""


def channel_name(channel):
    return str(channel.get("name") or channel_code(channel) or "Payment")


def is_qris(channel):
    typ = str(channel.get("type") or "").lower()
    name = channel_name(channel).lower()
    code = str(channel_code(channel)).lower()
    return typ in PREFERRED_TOPUP_TYPES or "qris" in name or "qris" in code


def channel_min(channel):
    v = channel.get("minimum")
    if v is None:
        v = channel.get("min_amount")
    return max(MIN_TOPUP, safe_int(v, MIN_TOPUP))


def channel_max(channel):
    v = channel.get("maximum")
    if v is None:
        v = channel.get("max_amount")
    n = safe_int(v, 0)
    return n if n > 0 else None


def channel_fee(channel, amount):
    flat = safe_int(channel.get("fee_flat", 0))
    try:
        pct = float(channel.get("fee_percentage", 0))
    except Exception:
        pct = 0
    if flat == 0 and pct == 0 and channel.get("fee") is not None:
        flat = safe_int(channel.get("fee"), 0)
    return flat + int(round(amount * pct / 100))


def get_channels():
    r = api_get("/balance/channels")
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
    return (r.json().get("data") or [])


# ============================================================
# DUPLICATE WEBHOOK PROTECTION
# ============================================================

def webhook_seen(event_key):
    if not event_key:
        return False
    _, row = find_record("webhook_events", "event_key", event_key)
    return bool(row)


def mark_webhook(event_key, event):
    if event_key:
        get_ws("webhook_events").append_row([event_key, event, now()])


# ============================================================
# MENUS
# ============================================================

def main_keyboard():
    return {
        "inline_keyboard": [
            [
                {"text": "📦 Produk", "callback_data": "products"},
                {"text": "💰 Saldo", "callback_data": "balance"},
            ],
            [
                {"text": "💳 Deposit", "callback_data": "deposit"},
                {"text": "📊 Mutasi", "callback_data": "mutation"},
            ],
            [
                {"text": "🔍 Cek Status", "callback_data": "status"},
            ],
        ]
    }


def send_dashboard(chat_id, telegram_id, name):
    balance = get_balance(telegram_id)
    text = (
        "✨ <b>SEKALIPAY PREMIUM STORE</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 <b>{esc(name)}</b> (<code>{esc(telegram_id)}</code>)\n"
        f"💰 <b>Saldo:</b> {rupiah(balance)}\n"
        "━━━━━━━━━━━━━━━━━━━━━━\n"
        "Silakan pilih menu:"
    )
    return send_message(chat_id, text, main_keyboard())


# ============================================================
# TELEGRAM MESSAGE HANDLERS
# ============================================================

def handle_start(message):
    user = message.get("from") or {}
    chat_id = message.get("chat", {}).get("id")
    uid = str(user.get("id"))
    name = user.get("first_name") or "User"
    ensure_user(uid, name)
    clear_session(uid)
    send_dashboard(chat_id, uid, name)


def handle_text(message):
    user = message.get("from") or {}
    chat_id = message.get("chat", {}).get("id")
    uid = str(user.get("id"))
    text = str(message.get("text") or "").strip()
    name = user.get("first_name") or "User"

    ensure_user(uid, name)
    session = get_session(uid)
    step = session["step"]
    data = session["data"]

    if text.startswith("/start"):
        handle_start(message)
        return

    if text.startswith("/id"):
        send_message(chat_id, f"🆔 Telegram ID: <code>{esc(uid)}</code>")
        return

    if not step:
        send_message(chat_id, "Gunakan /start untuk membuka menu.")
        return

    if step == "TOPUP_AMOUNT":
        if not text.isdigit():
            send_message(chat_id, "⚠️ Nominal harus angka. Contoh: <code>10000</code>")
            return

        amount = int(text)
        if amount < MIN_TOPUP:
            send_message(chat_id, f"⚠️ Minimal input bot {rupiah(MIN_TOPUP)}.")
            return

        channel_code_value = str(data.get("channel") or "")
        try:
            channels = get_channels()
            channel = next(
                (c for c in channels if str(channel_code(c)) == channel_code_value),
                None,
            )
            if not channel:
                raise RuntimeError("Channel pembayaran sudah tidak tersedia.")

            minimum = channel_min(channel)
            maximum = channel_max(channel)
            if amount < minimum:
                send_message(
                    chat_id,
                    f"⚠️ Minimal {esc(channel_name(channel))}: <b>{rupiah(minimum)}</b>"
                )
                return
            if maximum and amount > maximum:
                send_message(
                    chat_id,
                    f"⚠️ Maximum {esc(channel_name(channel))}: <b>{rupiah(maximum)}</b>"
                )
                return

            fee = channel_fee(channel, amount)
            ref = generate_ref("TUP")
            payload = {
                "amount": amount,
                "channel": channel_code_value,
                "code": channel_code_value,
                "ref_id": ref,
            }

            load = send_message(
                chat_id,
                "⏳ <b>MEMBUAT INVOICE DEPOSIT...</b>"
            )

            response = api_post("/balance", payload)
            try:
                result = response.json()
            except Exception:
                result = {"message": response.text}

            if response.status_code not in (200, 201):
                msg = result.get("message") or f"HTTP {response.status_code}"
                if load.ok:
                    tg("editMessageText", {
                        "chat_id": chat_id,
                        "message_id": load.json().get("result", {}).get("message_id"),
                        "text": f"❌ <b>DEPOSIT DITOLAK</b>\n\n<code>{esc(msg)}</code>",
                        "parse_mode": "HTML",
                    })
                clear_session(uid)
                return

            d = result.get("data") or {}
            payment_url = d.get("payment_url") or d.get("payment_link")
            qr_link = d.get("qr_link") or d.get("qr_url")
            invoice = d.get("invoice") or ref
            api_amount = safe_int(d.get("amount"), amount)
            api_fee = safe_int(d.get("fees", d.get("fee")), fee)
            api_total = safe_int(d.get("total"), api_amount + api_fee)
            expires = d.get("expires_at") or ""

            if not payment_url and not qr_link:
                msg = result.get("message") or "Server tidak mengembalikan payment URL/QR."
                if load.ok:
                    tg("editMessageText", {
                        "chat_id": chat_id,
                        "message_id": load.json().get("result", {}).get("message_id"),
                        "text": f"❌ <b>INVOICE GAGAL</b>\n\n<code>{esc(msg)}</code>",
                        "parse_mode": "HTML",
                    })
                clear_session(uid)
                return

            get_ws("topups").append_row([
                ref, uid, invoice, api_amount, api_fee, api_total,
                channel_code_value, "pending", now()
            ])

            buttons = []
            if payment_url:
                buttons.append([{"text": "💳 BAYAR SEKARANG", "url": payment_url}])
            if qr_link:
                buttons.append([{"text": "📱 LIHAT QRIS", "url": qr_link}])
            buttons.append([{"text": "🔄 CEK PEMBAYARAN", "callback_data": f"checktopup:{ref}"}])
            buttons.append([{"text": "🏠 MENU UTAMA", "callback_data": "home"}])

            msg = (
                "✅ <b>INVOICE DEPOSIT DIBUAT</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━━\n"
                f"🧾 Invoice: <code>{esc(invoice)}</code>\n"
                f"💰 Saldo masuk: <b>{rupiah(api_amount)}</b>\n"
                f"💸 Fee: <b>{rupiah(api_fee)}</b>\n"
                f"💵 Total bayar: <b>{rupiah(api_total)}</b>\n"
            )
            if expires:
                msg += f"⏰ Expired: <b>{esc(expires)}</b>\n"
            msg += (
                "\nBayar invoice lalu tekan <b>CEK PEMBAYARAN</b>.\n"
                "Saldo hanya ditambahkan setelah status provider terkonfirmasi."
            )

            if load.ok:
                tg("editMessageText", {
                    "chat_id": chat_id,
                    "message_id": load.json().get("result", {}).get("message_id"),
                    "text": msg,
                    "parse_mode": "HTML",
                    "reply_markup": {"inline_keyboard": buttons},
                })
            clear_session(uid)

        except Exception as e:
            print("TOPUP ERROR:", repr(e))
            send_message(chat_id, "❌ Gagal membuat invoice deposit. Coba lagi.")
            clear_session(uid)
        return

    if step == "TARGET":
        vid = str(data.get("vid") or "")
        price = safe_int(data.get("price"))
        product = data.get("product") or "Produk"
        variant = data.get("variant") or "Variant"
        proc = str(data.get("proc") or "")

        if not vid:
            send_message(chat_id, "❌ Sesi order sudah expired. Buka katalog lagi.")
            clear_session(uid)
            return

        if get_balance(uid) < price:
            send_message(chat_id, "❌ Saldo tidak cukup. Silakan deposit dulu.")
            clear_session(uid)
            return

        target = text
        note = target
        if proc.lower() == "smm":
            note = json.dumps({
                "target": target,
                "opt_smm": ["@username"],
                "comment_smm": ""
            }, ensure_ascii=False)

        ref = generate_ref("TRX")
        payload = {
            "ref_id": ref,
            "carts": [{
                "item_id": safe_int(vid),
                "quantity": 1,
                "note": note,
            }],
        }

        load = send_message(chat_id, "⏳ <b>MEMPROSES ORDER...</b>", None)
        try:
            response = api_post("/trx", payload, timeout=60)
            try:
                result = response.json()
            except Exception:
                result = {"message": response.text}

            if result.get("message") != "OK":
                msg = result.get("message") or f"HTTP {response.status_code}"
                if load.ok:
                    tg("editMessageText", {
                        "chat_id": chat_id,
                        "message_id": load.json().get("result", {}).get("message_id"),
                        "text": (
                            "❌ <b>TRANSAKSI GAGAL</b>\n\n"
                            f"<code>{esc(msg)}</code>\n\n"
                            "Saldo tidak dipotong."
                        ),
                        "parse_mode": "HTML",
                    })
                clear_session(uid)
                return

            # Potong saldo setelah provider menyatakan order OK.
            if get_balance(uid) < price or not add_balance(uid, -price):
                # Jangan membuat order kedua. Admin diberi peringatan jika
                # saldo lokal gagal dipotong setelah provider sukses.
                send_admin(
                    "🚨 <b>PERINGATAN SALDO</b>\n"
                    f"Order provider OK tetapi saldo lokal gagal dipotong.\n"
                    f"User: <code>{esc(uid)}</code>\n"
                    f"Ref: <code>{esc(ref)}</code>"
                )
                text_out = (
                    "⚠️ <b>ORDER PROVIDER BERHASIL</b>\n\n"
                    f"Invoice: <code>{esc(ref)}</code>\n"
                    "Saldo lokal gagal dipotong otomatis. Admin sudah diberi tahu."
                )
            else:
                d = result.get("data") or {}
                invoice = d.get("invoice") or ref
                delivery = "📦 Pesanan sedang diproses."

                items = d.get("items") or []
                if items and items[0].get("product_license"):
                    delivery = (
                        "🔑 <b>LICENSE:</b>\n"
                        f"<code>{esc(items[0].get('product_license'))}</code>"
                    )

                h2h = result.get("h2h_results") or []
                if h2h and h2h[0].get("sn"):
                    delivery = (
                        "📲 <b>SN / HASIL:</b>\n"
                        f"<code>{esc(h2h[0].get('sn'))}</code>"
                    )

                get_ws("transactions").append_row([
                    ref, uid, invoice, product, variant, target,
                    price, "submitted", now()
                ])

                text_out = (
                    "🚀 <b>TRANSAKSI SUKSES</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━━\n"
                    f"🧾 Invoice: <code>{esc(invoice)}</code>\n"
                    f"📦 Produk: {esc(product)}\n"
                    f"🔹 Variant: {esc(variant)}\n"
                    f"💰 Terpotong: <b>{rupiah(price)}</b>\n\n"
                    f"{delivery}"
                )

            if load.ok:
                tg("editMessageText", {
                    "chat_id": chat_id,
                    "message_id": load.json().get("result", {}).get("message_id"),
                    "text": text_out,
                    "parse_mode": "HTML",
                    "reply_markup": main_keyboard(),
                })
        except Exception as e:
            print("ORDER ERROR:", repr(e))
            send_message(chat_id, "❌ Gagal terhubung ke Sekalipay. Order belum dipotong.")
        clear_session(uid)
        return

    if step == "STATUS":
        invoice = text
        try:
            r = api_get(f"/trx/{invoice}")
            result = r.json()
            d = result.get("data") or {}
            status = str(d.get("status") or "TIDAK DITEMUKAN")
            send_message(
                chat_id,
                "🔍 <b>HASIL CEK STATUS</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━━\n"
                f"🧾 Invoice: <code>{esc(invoice)}</code>\n"
                f"🚦 Status: <b>{esc(status.upper())}</b>"
            )
        except Exception:
            send_message(chat_id, "❌ Gagal mengecek status.")
        clear_session(uid)
        return


# ============================================================
# CALLBACKS
# ============================================================

def show_products(chat_id, uid):
    r = api_get("/item?per_page=all")
    result = r.json()
    categories = result.get("data") or []
    if not categories:
        send_message(chat_id, "❌ Produk tidak ditemukan.")
        return

    buttons = []
    catalog = []

    for cat in categories:
        for product in cat.get("products") or []:
            for variant in product.get("variants") or []:
                stock = variant.get("stock")
                ready = True if stock is None else safe_int(stock) > 0
                catalog.append({
                    "id": variant.get("id"),
                    "product": product.get("name") or "Produk",
                    "variant": variant.get("name") or "Variant",
                    "price": safe_int(variant.get("price")),
                    "proc": variant.get("order_process") or "",
                    "ready": ready,
                })

    # Telegram callback_data dibatasi panjangnya, jadi simpan katalog di
    # session Google Sheets dan callback hanya membawa index.
    set_session(uid, "CATALOG", {"items": catalog, "page": 0})
    for i, item in enumerate(catalog[:8]):
        icon = "🟢" if item["ready"] else "🔴"
        label = f"{icon} {item['product']} / {item['variant']} • {rupiah(item['price'])}"
        buttons.append([{
            "text": label[:60],
            "callback_data": f"buy:{i}"
        }])

    if len(catalog) > 8:
        buttons.append([{"text": "➡️ Produk berikutnya", "callback_data": "catalog:1"}])

    buttons.append([{"text": "🏠 Menu Utama", "callback_data": "home"}])
    send_message(
        chat_id,
        "📦 <b>KATALOG PRODUK</b>\nPilih produk:",
        {"inline_keyboard": buttons}
    )


def show_catalog_page(chat_id, uid, page):
    session = get_session(uid)
    items = session["data"].get("items") or []
    if not items:
        show_products(chat_id, uid)
        return

    page = max(0, int(page))
    start = page * 8
    current = items[start:start + 8]
    buttons = []

    for i, item in enumerate(current, start=start):
        icon = "🟢" if item["ready"] else "🔴"
        buttons.append([{
            "text": f"{icon} {item['product']} / {item['variant']} • {rupiah(item['price'])}"[:60],
            "callback_data": f"buy:{i}"
        }])

    nav = []
    if page > 0:
        nav.append({"text": "⬅️", "callback_data": f"catalog:{page-1}"})
    if start + 8 < len(items):
        nav.append({"text": "➡️", "callback_data": f"catalog:{page+1}"})
    if nav:
        buttons.append(nav)
    buttons.append([{"text": "🏠 Menu Utama", "callback_data": "home"}])

    set_session(uid, "CATALOG", {"items": items, "page": page})
    send_message(
        chat_id,
        f"📦 <b>KATALOG</b> • halaman {page + 1}",
        {"inline_keyboard": buttons}
    )


def handle_callback(callback):
    callback_id = callback.get("id")
    data = callback.get("data") or ""
    msg = callback.get("message") or {}
    chat_id = msg.get("chat", {}).get("id")
    user = callback.get("from") or {}
    uid = str(user.get("id"))
    name = user.get("first_name") or "User"

    ensure_user(uid, name)
    answer_callback(callback_id)

    if data == "home":
        clear_session(uid)
        send_dashboard(chat_id, uid, name)
        return

    if data == "balance":
        send_message(chat_id, f"💰 <b>SALDO</b>\n\n<b>{rupiah(get_balance(uid))}</b>")
        return

    if data == "products":
        try:
            show_products(chat_id, uid)
        except Exception as e:
            print("PRODUCT ERROR:", repr(e))
            send_message(chat_id, "❌ Gagal mengambil katalog.")
        return

    if data.startswith("catalog:"):
        try:
            show_catalog_page(chat_id, uid, safe_int(data.split(":", 1)[1]))
        except Exception as e:
            print("CATALOG ERROR:", repr(e))
            send_message(chat_id, "❌ Gagal membuka katalog.")
        return

    if data.startswith("buy:"):
        try:
            idx = safe_int(data.split(":", 1)[1], -1)
            session = get_session(uid)
            items = session["data"].get("items") or []
            if idx < 0 or idx >= len(items):
                send_message(chat_id, "⚠️ Data produk expired. Buka katalog lagi.")
                return
            item = items[idx]
            if not item["ready"]:
                send_message(chat_id, "❌ Stok produk sedang habis.")
                return
            price = safe_int(item["price"])
            if get_balance(uid) < price:
                send_message(chat_id, f"❌ Saldo tidak cukup.\nHarga: {rupiah(price)}\nSaldo: {rupiah(get_balance(uid))}")
                return
            set_session(uid, "TARGET", {
                "vid": str(item["id"]),
                "price": price,
                "product": item["product"],
                "variant": item["variant"],
                "proc": item["proc"],
            })
            send_message(
                chat_id,
                "🛒 <b>DETAIL ORDER</b>\n"
                f"📦 {esc(item['product'])}\n"
                f"🔹 {esc(item['variant'])}\n"
                f"💰 {rupiah(price)}\n\n"
                "Kirim <b>target</b> sekarang."
            )
        except Exception as e:
            print("BUY ERROR:", repr(e))
            send_message(chat_id, "❌ Gagal memilih produk.")
        return

    if data == "deposit":
        try:
            channels = [c for c in get_channels() if str(c.get("status", "")).lower() != "off" and channel_code(c)]
            channels.sort(key=lambda c: (not is_qris(c), channel_name(c).lower()))
            buttons = []
            for c in channels:
                minimum = channel_min(c)
                label = f"📱 {channel_name(c)} • min {rupiah(minimum)}"
                buttons.append([{
                    "text": label[:60],
                    "callback_data": f"channel:{channel_code(c)}"
                }])
            buttons.append([{"text": "🏠 Menu Utama", "callback_data": "home"}])
            send_message(
                chat_id,
                f"💳 <b>ISI SALDO</b>\n\nMinimum bot: <b>{rupiah(MIN_TOPUP)}</b>\nPilih metode:",
                {"inline_keyboard": buttons}
            )
        except Exception as e:
            print("CHANNEL ERROR:", repr(e))
            send_message(chat_id, "❌ Gagal mengambil metode deposit.")
        return

    if data.startswith("channel:"):
        code = data.split(":", 1)[1]
        set_session(uid, "TOPUP_AMOUNT", {"channel": code})
        send_message(chat_id, "💵 Kirim nominal deposit.\nContoh: <code>10000</code>")
        return

    if data.startswith("checktopup:"):
        ref = data.split(":", 1)[1]
        check_topup(chat_id, uid, ref)
        return

    if data == "mutation":
        rows = records("topups")
        mine = [x for x in rows if str(x.get("telegram_id")) == uid][-10:]
        text = f"📊 <b>MUTASI</b>\nSaldo: <b>{rupiah(get_balance(uid))}</b>\n\n"
        if mine:
            for x in reversed(mine):
                text += (
                    f"• <code>{esc(x.get('invoice') or x.get('ref_id'))}</code> "
                    f"{rupiah(x.get('amount'))} — {esc(x.get('status'))}\n"
                )
        else:
            text += "Belum ada mutasi deposit."
        send_message(chat_id, text)
        return

    if data == "status":
        set_session(uid, "STATUS", {})
        send_message(chat_id, "🔍 Kirim ID invoice transaksi yang ingin dicek.")
        return


def check_topup(chat_id, uid, ref):
    rows = records("topups")
    row = next(
        (x for x in rows if str(x.get("ref_id")) == str(ref) and str(x.get("telegram_id")) == uid),
        None,
    )
    if not row:
        send_message(chat_id, "⚠️ Invoice deposit tidak ditemukan.")
        return

    try:
        r = api_get(f"/trx/{ref}")
        result = r.json()
        d = result.get("data") or {}
        status = str(d.get("status") or "").lower()

        success = {
            "sukses", "success", "paid", "berhasil",
            "settlement", "lunas", "completed", "ok"
        }
        failed = {"canceled", "cancelled", "expired", "failed", "refunded"}

        if status in success:
            # Idempotency: hanya topup yang masih pending yang boleh menambah saldo.
            if str(row.get("status")).lower() == "pending":
                amount = safe_int(row.get("amount"))
                add_balance(uid, amount)
                idx, _ = find_record("topups", "ref_id", ref)
                if idx:
                    ws = get_ws("topups")
                    col = ws.row_values(1).index("status") + 1
                    ws.update_cell(idx, col, "paid")
                send_message(
                    chat_id,
                    f"✅ <b>DEPOSIT BERHASIL</b>\n\n"
                    f"Invoice: <code>{esc(ref)}</code>\n"
                    f"Saldo bertambah: <b>{rupiah(amount)}</b>\n"
                    f"Saldo sekarang: <b>{rupiah(get_balance(uid))}</b>"
                )
                send_admin(
                    f"💰 <b>TOPUP BERHASIL</b>\n"
                    f"User: <code>{esc(uid)}</code>\n"
                    f"Invoice: <code>{esc(ref)}</code>\n"
                    f"Nominal: <b>{rupiah(amount)}</b>"
                )
            else:
                send_message(chat_id, "ℹ️ Deposit ini sudah diproses sebelumnya.")
        elif status in failed:
            idx, _ = find_record("topups", "ref_id", ref)
            if idx:
                ws = get_ws("topups")
                col = ws.row_values(1).index("status") + 1
                ws.update_cell(idx, col, status)
            send_message(chat_id, f"❌ Deposit tidak berhasil.\nStatus: <b>{esc(status.upper())}</b>")
        else:
            send_message(chat_id, f"⏳ Pembayaran belum terdeteksi.\nStatus API: <b>{esc(status.upper() or 'PENDING')}</b>")
    except Exception as e:
        print("CHECK TOPUP ERROR:", repr(e))
        send_message(chat_id, "❌ Gagal mengecek pembayaran.")


# ============================================================
# TELEGRAM WEBHOOK ENDPOINT
# ============================================================

@app.route("/api/telegram", methods=["POST"])
def telegram_webhook():
    secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if TELEGRAM_WEBHOOK_SECRET and not secrets.compare_digest(secret, TELEGRAM_WEBHOOK_SECRET):
        return jsonify({"error": "Unauthorized"}), 401

    update = request.get_json(silent=True) or {}
    try:
        if update.get("message"):
            handle_text(update["message"])
        elif update.get("callback_query"):
            handle_callback(update["callback_query"])
        return jsonify({"ok": True})
    except Exception as e:
        print("TELEGRAM UPDATE ERROR:", repr(e))
        # Telegram webhook sebaiknya tetap mendapat 200 untuk error internal,
        # agar satu update rusak tidak terus-menerus diulang.
        return jsonify({"ok": True})


# ============================================================
# SEKALIPAY WEBHOOK
# ============================================================

@app.route("/api/sekalipay", methods=["POST"])
def sekalipay_webhook():
    payload = request.get_json(silent=True) or {}
    event = payload.get("event", "")
    data = payload.get("data") or {}

    received = (
        request.headers.get("X-Webhook-Signature")
        or request.headers.get("X-Signature")
        or request.headers.get("Signature")
        or ""
    )

    if event == "order.item.sent":
        status_for_sig = "item.sent"
    elif event == "webhook.test":
        status_for_sig = "test"
    else:
        status_for_sig = data.get("status") or ""

    ref_id = data.get("ref_id") or ""
    invoice = data.get("invoice") or ""
    raw = f"{ref_id}:{invoice}:{status_for_sig}:{SEKALIPAY_WEBHOOK_SECRET}"
    expected = hashlib.sha256(raw.encode()).hexdigest()

    if SEKALIPAY_WEBHOOK_SECRET and not secrets.compare_digest(expected, received):
        return jsonify({"error": "Invalid signature"}), 401

    # Idempotency key. Invoice/ref/event is enough for this integration.
    event_key = f"{event}:{ref_id}:{invoice}:{status_for_sig}"
    if webhook_seen(event_key):
        return jsonify({"status": "ok", "duplicate": True})

    mark_webhook(event_key, event)

    if event == "order.completed":
        amount = safe_int(data.get("amount"))
        items = data.get("items") or []
        product = items[0].get("product_name", "Produk") if items else "Produk"
        variant = items[0].get("variant_name", "") if items else ""
        target = items[0].get("target", "-") if items else "-"

        get_ws("transactions").append_row([
            ref_id,
            data.get("user_id", ""),
            invoice,
            product,
            variant,
            target,
            amount,
            "completed",
            now(),
        ])

        message = (
            "🎉 <b>PESANAN BERHASIL (PAID)</b>\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"🧾 Invoice: <code>{esc(sensor_data(invoice))}</code>\n"
            f"🛒 Produk: {esc(product)}\n"
            f"📦 Variant: {esc(variant)}\n"
            f"🎯 Target: <code>{esc(sensor_data(target))}</code>\n"
            f"💰 Total: <b>{rupiah(amount)}</b>"
        )
        send_admin(message)
        send_group(message)

    elif event == "order.item.sent":
        item = data.get("item") or {}
        licenses = item.get("licenses") or []
        license_text = "\n".join(
            f"🔑 <code>{esc(x.get('product_license'))}</code>"
            for x in licenses
        )
        message = (
            "📦 <b>ITEM / LISENSI TERKIRIM</b>\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"🧾 Invoice: <code>{esc(sensor_data(invoice))}</code>\n"
            f"🔑 <b>License:</b>\n{license_text or '-'}"
        )
        send_admin(message)
        send_group(message)

    elif event == "order.canceled":
        message = (
            "❌ <b>ORDER DIBATALKAN</b>\n"
            f"🧾 Invoice: <code>{esc(sensor_data(invoice))}</code>"
        )
        send_admin(message)
        send_group(message)

    elif event == "webhook.test":
        send_admin("🔔 <b>Test Webhook Sekalipay berhasil.</b>")
        send_group("🔔 <b>Test Webhook Sekalipay berhasil.</b>")

    return jsonify({"status": "ok"})


# ============================================================
# WEBHOOK SETUP
# ============================================================

@app.route("/api/setup", methods=["GET", "POST"])
def setup():
    supplied = request.headers.get("X-Setup-Key", "") or request.args.get("key", "")
    if not SETUP_KEY or not secrets.compare_digest(supplied, SETUP_KEY):
        return jsonify({"error": "Unauthorized"}), 401

    init_database()

    base = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")
    if not base:
        base = request.host_url.rstrip("/")

    webhook_url = f"{base}/api/telegram"
    payload = {"url": webhook_url}
    if TELEGRAM_WEBHOOK_SECRET:
        payload["secret_token"] = TELEGRAM_WEBHOOK_SECRET
    payload["drop_pending_updates"] = False

    r = tg("setWebhook", payload)
    try:
        result = r.json()
    except Exception:
        result = {"raw": r.text}

    return jsonify({
        "ok": r.ok,
        "webhook_url": webhook_url,
        "telegram": result,
        "database": "initialized",
    })


@app.route("/api/webhook-info", methods=["GET"])
def webhook_info():
    supplied = request.headers.get("X-Setup-Key", "") or request.args.get("key", "")
    if not SETUP_KEY or not secrets.compare_digest(supplied, SETUP_KEY):
        return jsonify({"error": "Unauthorized"}), 401
    r = tg("getWebhookInfo", {})
    return jsonify(r.json())


# ============================================================
# PANEL
# Tidak memakai HTTP Basic Auth, jadi browser tidak memunculkan
# popup "nama pengguna dan sandi". Akses memakai ADMIN_PANEL_KEY.
# ============================================================

def panel_authorized():
    supplied = request.headers.get("X-Admin-Key", "") or request.args.get("key", "")
    return bool(ADMIN_PANEL_KEY) and secrets.compare_digest(supplied, ADMIN_PANEL_KEY)


@app.route("/panel", methods=["GET"])
def panel():
    if not panel_authorized():
        return Response(
            "Panel aktif. Akses dengan /panel?key=ADMIN_PANEL_KEY",
            status=401,
            mimetype="text/plain",
        )

    users = records("users")
    transactions = records("transactions")
    topups = records("topups")
    total_balance = sum(safe_int(x.get("saldo")) for x in users)

    rows_users = "".join(
        f"<tr><td>{esc(x.get('telegram_id'))}</td>"
        f"<td>{esc(x.get('name'))}</td>"
        f"<td>{rupiah(x.get('saldo'))}</td></tr>"
        for x in users[-50:]
    )
    rows_trx = "".join(
        f"<tr><td>{esc(x.get('invoice'))}</td>"
        f"<td>{esc(x.get('product'))}</td>"
        f"<td>{rupiah(x.get('amount'))}</td>"
        f"<td>{esc(x.get('status'))}</td></tr>"
        for x in transactions[-50:]
    )

    page = f"""<!doctype html>
<html lang="id">
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sekalipay Gateway Panel</title>
<style>
body{{font-family:system-ui;background:#0f1115;color:#eee;margin:0;padding:18px}}
.wrap{{max-width:1100px;margin:auto}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}}
.card{{background:#181b21;border:1px solid #292e38;border-radius:14px;padding:16px;margin-bottom:14px}}
.n{{font-size:26px;font-weight:800;margin-top:6px}}
.small{{color:#9ca3af;font-size:13px}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
th,td{{padding:9px;border-bottom:1px solid #292e38;text-align:left}}
code{{color:#b9f6ca}}
</style>
</head>
<body><div class="wrap">
<h1>⚡ Sekalipay Telegram Gateway</h1>
<p class="small">Vercel Serverless • Telegram Webhook • Google Sheets</p>
<div class="grid">
<div class="card">Users<div class="n">{len(users)}</div></div>
<div class="card">Transaksi<div class="n">{len(transactions)}</div></div>
<div class="card">Topup<div class="n">{len(topups)}</div></div>
<div class="card">Total Saldo<div class="n">{rupiah(total_balance)}</div></div>
</div>
<div class="card"><h2>👥 User terakhir</h2>
<table><tr><th>ID</th><th>Nama</th><th>Saldo</th></tr>{rows_users}</table></div>
<div class="card"><h2>📦 Transaksi terakhir</h2>
<table><tr><th>Invoice</th><th>Produk</th><th>Amount</th><th>Status</th></tr>{rows_trx}</table></div>
</div></body></html>"""
    return Response(page, mimetype="text/html")


# ============================================================
# HEALTH / HOME
# ============================================================

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "service": "Sekalipay Telegram Gateway",
        "status": "online",
        "mode": "Vercel Serverless Webhook",
        "telegram": bool(BOT_TOKEN),
        "sekalipay": bool(SEKALIPAY_API_KEY),
        "google_sheets": bool(GOOGLE_SHEET_ID),
        "webhook_endpoint": "/api/telegram",
        "sekalipay_webhook": "/api/sekalipay",
    })


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "online",
        "telegram": bool(BOT_TOKEN),
        "sekalipay": bool(SEKALIPAY_API_KEY),
        "google_sheets": bool(GOOGLE_SHEET_ID),
    })


# Vercel imports this Flask app. Jangan pakai app.run().
