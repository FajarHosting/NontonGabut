import os
import json
import time
import uuid
import hashlib
import hmac
import html
import requests

from flask import Flask, request, jsonify

import gspread
from google.oauth2.service_account import Credentials


# ============================================================
# CONFIG
# ============================================================

app = Flask(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()
TELEGRAM_THREAD_ID = os.getenv("TELEGRAM_THREAD_ID", "").strip()

SEKALIPAY_API_KEY = os.getenv("SEKALIPAY_API_KEY", "").strip()
SEKALIPAY_BASE_URL = os.getenv(
    "SEKALIPAY_BASE_URL",
    "https://sekalipay.com/api/v1"
).rstrip("/")

ADMIN_ID = os.getenv("ADMIN_ID", "").strip()

WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "").strip()

GOOGLE_SHEET_ID = os.getenv("GOOGLE_SHEET_ID", "").strip()
GOOGLE_SERVICE_ACCOUNT_JSON = os.getenv(
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    ""
).strip()

DASHBOARD_IMG = os.getenv(
    "DASHBOARD_IMG",
    "https://i.ibb.co/230mW4Xf/img-5578497211.jpg"
)

MIN_TOPUP = 500

HEADERS = {
    "X-APIKEY": SEKALIPAY_API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}


# ============================================================
# BASIC HELPERS
# ============================================================

def esc(value):
    return html.escape(str(value or ""))


def rupiah(value):
    try:
        value = int(float(value))
    except Exception:
        value = 0

    return "Rp {:,.0f}".format(value).replace(",", ".")


def safe_int(value, default=0):
    try:
        return int(float(value))
    except Exception:
        return default


def generate_ref(prefix="TRX"):
    return (
        f"{prefix}-"
        f"{int(time.time())}-"
        f"{uuid.uuid4().hex[:8].upper()}"
    )


def is_admin(user_id):
    return str(user_id) == str(ADMIN_ID)


# ============================================================
# GOOGLE SHEETS
# ============================================================

_gc = None
_sheet = None


def get_sheet():
    global _gc, _sheet

    if _sheet is not None:
        return _sheet

    if not GOOGLE_SHEET_ID:
        raise RuntimeError("GOOGLE_SHEET_ID belum diisi.")

    if not GOOGLE_SERVICE_ACCOUNT_JSON:
        raise RuntimeError(
            "GOOGLE_SERVICE_ACCOUNT_JSON belum diisi."
        )

    credentials_data = json.loads(
        GOOGLE_SERVICE_ACCOUNT_JSON
    )

    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]

    credentials = Credentials.from_service_account_info(
        credentials_data,
        scopes=scopes
    )

    _gc = gspread.authorize(credentials)

    spreadsheet = _gc.open_by_key(
        GOOGLE_SHEET_ID
    )

    _sheet = spreadsheet

    return _sheet


def get_worksheet(name):
    spreadsheet = get_sheet()

    try:
        return spreadsheet.worksheet(name)

    except gspread.WorksheetNotFound:
        ws = spreadsheet.add_worksheet(
            title=name,
            rows=1000,
            cols=20
        )

        return ws


# ============================================================
# SHEET INITIALIZATION
# ============================================================

SHEET_HEADERS = {
    "users": [
        "user_id",
        "name",
        "saldo",
        "created_at",
        "updated_at"
    ],

    "pending_topup": [
        "ref",
        "user_id",
        "invoice",
        "amount",
        "channel",
        "channel_name",
        "fee",
        "total",
        "status",
        "payment_url",
        "qr_link",
        "expires_at",
        "created_at",
        "updated_at"
    ],

    "transactions": [
        "ref",
        "user_id",
        "invoice",
        "item_id",
        "product",
        "variant",
        "target",
        "amount",
        "status",
        "created_at",
        "updated_at"
    ],

    "webhook_logs": [
        "event",
        "ref_id",
        "invoice",
        "status",
        "processed_at"
    ]
}


def initialize_sheets():
    for name, headers in SHEET_HEADERS.items():
        ws = get_worksheet(name)

        values = ws.get_all_values()

        if not values:
            ws.append_row(headers)


# ============================================================
# GENERIC SHEET HELPERS
# ============================================================

def get_all_records(sheet_name):
    ws = get_worksheet(sheet_name)

    return ws.get_all_records()


def find_record(sheet_name, column, value):
    ws = get_worksheet(sheet_name)

    records = ws.get_all_records()

    for index, row in enumerate(records, start=2):

        if str(row.get(column, "")) == str(value):
            return index, row

    return None, None


def append_record(sheet_name, row):
    ws = get_worksheet(sheet_name)

    headers = SHEET_HEADERS[sheet_name]

    ws.append_row(
        [
            row.get(header, "")
            for header in headers
        ],
        value_input_option="USER_ENTERED"
    )


def update_record(sheet_name, row_number, row):
    ws = get_worksheet(sheet_name)

    headers = SHEET_HEADERS[sheet_name]

    ws.update(
        f"A{row_number}:{chr(64 + len(headers))}{row_number}",
        [[
            row.get(header, "")
            for header in headers
        ]],
        value_input_option="USER_ENTERED"
    )


# ============================================================
# USER DATABASE
# ============================================================

def get_user(user_id):
    _, row = find_record(
        "users",
        "user_id",
        user_id
    )

    return row


def ensure_user(user):
    user_id = str(user["id"])

    existing = get_user(user_id)

    now = int(time.time())

    if existing:
        return existing

    row = {
        "user_id": user_id,
        "name": user.get("first_name") or "User",
        "saldo": 0,
        "created_at": now,
        "updated_at": now
    }

    append_record(
        "users",
        row
    )

    return row


def get_balance(user_id):
    user = get_user(user_id)

    if not user:
        return 0

    return safe_int(
        user.get("saldo", 0)
    )


def set_balance(user_id, new_balance):
    row_number, row = find_record(
        "users",
        "user_id",
        user_id
    )

    if not row:
        return False

    new_balance = safe_int(
        new_balance
    )

    if new_balance < 0:
        return False

    row["saldo"] = new_balance
    row["updated_at"] = int(time.time())

    update_record(
        "users",
        row_number,
        row
    )

    return True


def add_balance(user_id, amount):
    current = get_balance(user_id)

    return set_balance(
        user_id,
        current + safe_int(amount)
    )


def deduct_balance(user_id, amount):
    current = get_balance(user_id)
    amount = safe_int(amount)

    if current < amount:
        return False

    return set_balance(
        user_id,
        current - amount
    )


# ============================================================
# TELEGRAM API
# ============================================================

def telegram(method, payload=None):
    url = (
        f"https://api.telegram.org/"
        f"bot{TELEGRAM_BOT_TOKEN}/{method}"
    )

    response = requests.post(
        url,
        json=payload or {},
        timeout=20
    )

    try:
        return response.json()
    except Exception:
        return {
            "ok": False,
            "description": response.text
        }


def send_message(
    chat_id,
    text,
    reply_markup=None,
    thread_id=None
):
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"
    }

    if reply_markup:
        payload["reply_markup"] = reply_markup

    if thread_id:
        payload["message_thread_id"] = int(thread_id)

    return telegram(
        "sendMessage",
        payload
    )


def edit_message(
    chat_id,
    message_id,
    text,
    reply_markup=None
):
    payload = {
        "chat_id": chat_id,
        "message_id": message_id,
        "text": text,
        "parse_mode": "HTML"
    }

    if reply_markup:
        payload["reply_markup"] = reply_markup

    return telegram(
        "editMessageText",
        payload
    )


def answer_callback(callback_id, text=None):
    payload = {
        "callback_query_id": callback_id
    }

    if text:
        payload["text"] = text

    return telegram(
        "answerCallbackQuery",
        payload
    )


# ============================================================
# SEKALIPAY API
# ============================================================

def sekalipay_get(endpoint):
    return requests.get(
        f"{SEKALIPAY_BASE_URL}{endpoint}",
        headers=HEADERS,
        timeout=20
    )


def sekalipay_post(endpoint, payload):
    return requests.post(
        f"{SEKALIPAY_BASE_URL}{endpoint}",
        json=payload,
        headers=HEADERS,
        timeout=60
    )


# ============================================================
# TELEGRAM KEYBOARDS
# ============================================================

def main_keyboard():
    return {
        "inline_keyboard": [

            [
                {
                    "text": "📦 Daftar Produk",
                    "callback_data": "catalog"
                },
                {
                    "text": "💰 Isi Saldo",
                    "callback_data": "topup"
                }
            ],

            [
                {
                    "text": "📊 Mutasi",
                    "callback_data": "mutasi"
                },
                {
                    "text": "🔍 Cek Status",
                    "callback_data": "status"
                }
            ],

            [
                {
                    "text": "📞 Admin",
                    "url": f"tg://user?id={ADMIN_ID}"
                }
            ]
        ]
    }


def back_keyboard():
    return {
        "inline_keyboard": [
            [
                {
                    "text": "🏠 Menu Utama",
                    "callback_data": "home"
                }
            ]
        ]
    }


# ============================================================
# HOME
# ============================================================

def show_home(chat_id, user):
    user_id = str(user["id"])

    ensure_user(user)

    balance = get_balance(user_id)

    text = (
        "✨ <b>SEKALIPAY PREMIUM STORE</b> ✨\n"
        "━━━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 <b>User:</b> {esc(user.get('first_name'))}\n"
        f"🆔 <b>ID:</b> <code>{user_id}</code>\n"
        f"💳 <b>Saldo:</b> {rupiah(balance)}\n"
        "━━━━━━━━━━━━━━━━━━━━━━\n"
        "Silakan pilih menu:"
    )

    return send_message(
        chat_id,
        text,
        main_keyboard()
    )


# ============================================================
# CATALOG
# ============================================================

def show_catalog(chat_id):
    try:
        response = sekalipay_get(
            "/item?per_page=all"
        )

        if response.status_code != 200:
            raise RuntimeError(
                f"HTTP {response.status_code}"
            )

        result = response.json()

        categories = result.get(
            "data",
            []
        )

        if not categories:
            send_message(
                chat_id,
                "❌ Produk tidak ditemukan.",
                back_keyboard()
            )
            return

        buttons = []

        for category in categories:

            name = category.get(
                "name",
                "Kategori"
            )

            # Data category disimpan ke callback secara
            # sederhana; untuk implementasi production
            # sebaiknya cache katalog di Sheets/Redis.
            category_id = category.get(
                "id"
            )

            if category_id:
                buttons.append([
                    {
                        "text": f"📁 {name}",
                        "callback_data": (
                            f"cat:{category_id}"
                        )
                    }
                ])

        buttons.append([
            {
                "text": "🏠 Menu Utama",
                "callback_data": "home"
            }
        ])

        send_message(
            chat_id,
            "📦 <b>DAFTAR PRODUK</b>\n\n"
            "Pilih kategori:",
            {
                "inline_keyboard": buttons
            }
        )

    except Exception as e:
        print("CATALOG ERROR:", repr(e))

        send_message(
            chat_id,
            "❌ Gagal mengambil katalog.",
            back_keyboard()
        )


# ============================================================
# TOPUP CHANNELS
# ============================================================

def get_channel_code(channel):
    return (
        channel.get("service")
        or channel.get("code")
    )


def channel_minimum(channel):
    return max(
        MIN_TOPUP,
        safe_int(
            channel.get(
                "minimum",
                channel.get(
                    "min_amount",
                    MIN_TOPUP
                )
            ),
            MIN_TOPUP
        )
    )


def channel_maximum(channel):
    value = safe_int(
        channel.get(
            "maximum",
            channel.get(
                "max_amount",
                0
            )
        ),
        0
    )

    return value if value > 0 else None


def show_topup(chat_id):
    try:
        response = sekalipay_get(
            "/balance/channels"
        )

        if response.status_code != 200:
            raise RuntimeError(
                f"HTTP {response.status_code}"
            )

        result = response.json()

        channels = result.get(
            "data",
            []
        )

        buttons = []

        for channel in channels:

            status = str(
                channel.get(
                    "status",
                    ""
                )
            ).lower()

            if status == "off":
                continue

            code = get_channel_code(channel)

            if not code:
                continue

            name = (
                channel.get("name")
                or code
            )

            minimum = channel_minimum(
                channel
            )

            buttons.append([
                {
                    "text": (
                        f"💳 {name} "
                        f"(min {rupiah(minimum)})"
                    ),
                    "callback_data": (
                        f"topch:{code}"
                    )
                }
            ])

        buttons.append([
            {
                "text": "🏠 Menu Utama",
                "callback_data": "home"
            }
        ])

        send_message(
            chat_id,
            "💰 <b>ISI SALDO</b>\n\n"
            "Pilih metode pembayaran:",
            {
                "inline_keyboard": buttons
            }
        )

    except Exception as e:
        print("TOPUP CHANNEL ERROR:", repr(e))

        send_message(
            chat_id,
            "❌ Gagal mengambil metode pembayaran.",
            back_keyboard()
        )


# ============================================================
# PENDING TOPUP
# ============================================================

def save_pending_topup(data):
    append_record(
        "pending_topup",
        data
    )


def get_pending_topup(ref):
    return find_record(
        "pending_topup",
        "ref",
        ref
    )


def mark_topup(ref, status):
    row_number, row = get_pending_topup(ref)

    if not row:
        return False

    row["status"] = status
    row["updated_at"] = int(time.time())

    update_record(
        "pending_topup",
        row_number,
        row
    )

    return True


# ============================================================
# CREATE TOPUP
# ============================================================

def create_topup(user_id, channel, amount, chat_id):
    try:

        response = sekalipay_get(
            "/balance/channels"
        )

        if response.status_code != 200:
            raise RuntimeError(
                "Gagal mengambil channel."
            )

        channels = response.json().get(
            "data",
            []
        )

        selected = None

        for c in channels:

            if str(
                get_channel_code(c)
            ) == str(channel):

                selected = c
                break

        if not selected:
            send_message(
                chat_id,
                "❌ Channel pembayaran sudah tidak tersedia.",
                back_keyboard()
            )
            return

        minimum = channel_minimum(
            selected
        )

        maximum = channel_maximum(
            selected
        )

        if amount < minimum:
            send_message(
                chat_id,
                f"⚠️ Minimum deposit "
                f"<b>{rupiah(minimum)}</b>.",
                back_keyboard()
            )
            return

        if maximum and amount > maximum:
            send_message(
                chat_id,
                f"⚠️ Maximum deposit "
                f"<b>{rupiah(maximum)}</b>.",
                back_keyboard()
            )
            return

        ref = generate_ref("TUP")

        payload = {
            "amount": amount,
            "channel": channel,
            "code": channel,
            "ref_id": ref
        }

        send_message(
            chat_id,
            "⏳ Membuat invoice deposit..."
        )

        response = sekalipay_post(
            "/balance",
            payload
        )

        try:
            result = response.json()
        except Exception:
            result = {}

        if response.status_code not in (200, 201):

            message = result.get(
                "message",
                f"HTTP {response.status_code}"
            )

            send_message(
                chat_id,
                "❌ <b>Deposit ditolak.</b>\n\n"
                f"<code>{esc(message)}</code>",
                back_keyboard()
            )

            return

        data = result.get(
            "data",
            {}
        )

        invoice = (
            data.get("invoice")
            or ref
        )

        payment_url = (
            data.get("payment_url")
            or data.get("payment_link")
        )

        qr_link = (
            data.get("qr_link")
            or data.get("qr_url")
        )

        api_amount = safe_int(
            data.get(
                "amount",
                amount
            ),
            amount
        )

        fee = safe_int(
            data.get(
                "fees",
                data.get("fee", 0)
            )
        )

        total = safe_int(
            data.get(
                "total",
                api_amount + fee
            )
        )

        if not payment_url and not qr_link:
            send_message(
                chat_id,
                "❌ Server tidak memberikan payment URL/QR.",
                back_keyboard()
            )
            return

        save_pending_topup({

            "ref": ref,

            "user_id": str(user_id),

            "invoice": invoice,

            "amount": api_amount,

            "channel": channel,

            "channel_name": (
                selected.get(
                    "name",
                    channel
                )
            ),

            "fee": fee,

            "total": total,

            "status": "pending",

            "payment_url": payment_url or "",

            "qr_link": qr_link or "",

            "expires_at": data.get(
                "expires_at",
                ""
            ),

            "created_at": int(
                time.time()
            ),

            "updated_at": int(
                time.time()
            )
        })

        buttons = []

        if payment_url:
            buttons.append([
                {
                    "text": "💳 BAYAR SEKARANG",
                    "url": payment_url
                }
            ])

        if qr_link:
            buttons.append([
                {
                    "text": "📱 LIHAT QRIS",
                    "url": qr_link
                }
            ])

        buttons.append([
            {
                "text": "🔄 CEK PEMBAYARAN",
                "callback_data": (
                    f"checktop:{ref}"
                )
            }
        ])

        buttons.append([
            {
                "text": "🏠 MENU UTAMA",
                "callback_data": "home"
            }
        ])

        text = (
            "✅ <b>INVOICE DEPOSIT</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🧾 Invoice: <code>{esc(invoice)}</code>\n"
            f"🔖 Ref: <code>{esc(ref)}</code>\n"
            f"💰 Saldo masuk: <b>{rupiah(api_amount)}</b>\n"
            f"💸 Fee: <b>{rupiah(fee)}</b>\n"
            f"💵 Total bayar: <b>{rupiah(total)}</b>\n\n"
            "Bayar invoice lalu tekan "
            "<b>CEK PEMBAYARAN</b>."
        )

        send_message(
            chat_id,
            text,
            {
                "inline_keyboard": buttons
            }
        )

    except Exception as e:

        print(
            "CREATE TOPUP ERROR:",
            repr(e)
        )

        send_message(
            chat_id,
            "❌ Terjadi error saat membuat invoice.",
            back_keyboard()
        )


# ============================================================
# CHECK TOPUP
# ============================================================

def process_topup_status(ref):
    _, pending = get_pending_topup(ref)

    if not pending:
        return {
            "ok": False,
            "message": "Invoice tidak ditemukan."
        }

    if pending.get("status") == "paid":
        return {
            "ok": True,
            "already": True,
            "user_id": pending.get("user_id"),
            "amount": safe_int(
                pending.get("amount")
            )
        }

    response = sekalipay_get(
        f"/trx/{ref}"
    )

    if response.status_code != 200:
        return {
            "ok": False,
            "message": (
                f"HTTP {response.status_code}"
            )
        }

    result = response.json()

    data = result.get(
        "data",
        {}
    )

    status = str(
        data.get(
            "status",
            ""
        )
    ).lower()

    success_status = {
        "sukses",
        "success",
        "paid",
        "berhasil",
        "settlement",
        "lunas",
        "completed",
        "ok"
    }

    failed_status = {
        "cancelled",
        "canceled",
        "expired",
        "failed",
        "refunded"
    }

    if status in success_status:

        # ====================================================
        # IDEMPOTENCY
        #
        # Cari ulang row sebelum tambah saldo.
        # Kalau status sudah paid, jangan tambah lagi.
        # ====================================================

        _, latest = get_pending_topup(ref)

        if not latest:
            return {
                "ok": False,
                "message": "Pending invoice hilang."
            }

        if latest.get("status") == "paid":
            return {
                "ok": True,
                "already": True,
                "user_id": latest.get("user_id"),
                "amount": safe_int(
                    latest.get("amount")
                )
            }

        user_id = str(
            latest.get("user_id")
        )

        amount = safe_int(
            latest.get("amount")
        )

        # Tandai paid terlebih dahulu.
        # Kalau request retry masuk, status paid
        # mencegah credit kedua.
        mark_topup(
            ref,
            "paid"
        )

        added = add_balance(
            user_id,
            amount
        )

        if not added:
            return {
                "ok": False,
                "message": (
                    "Invoice paid tetapi gagal "
                    "menambahkan saldo."
                )
            }

        return {
            "ok": True,
            "already": False,
            "user_id": user_id,
            "amount": amount
        }

    if status in failed_status:

        mark_topup(
            ref,
            status
        )

        return {
            "ok": False,
            "failed": True,
            "status": status
        }

    return {
        "ok": True,
        "pending": True,
        "status": status or "pending"
    }


# ============================================================
# ORDER / PRODUCT
# ============================================================

def get_product_variant(variant_id):
    response = sekalipay_get(
        "/item?per_page=all"
    )

    if response.status_code != 200:
        return None

    categories = response.json().get(
        "data",
        []
    )

    for category in categories:

        for product in category.get(
            "products",
            []
        ):

            for variant in product.get(
                "variants",
                []
            ):

                if str(
                    variant.get("id")
                ) == str(variant_id):

                    return {
                        "product": product.get(
                            "name",
                            "Produk"
                        ),
                        "variant": variant.get(
                            "name",
                            "Variant"
                        ),
                        "id": variant.get(
                            "id"
                        ),
                        "price": safe_int(
                            variant.get(
                                "price"
                            )
                        ),
                        "stock": variant.get(
                            "stock"
                        ),
                        "process": variant.get(
                            "order_process",
                            ""
                        )
                    }

    return None


def create_order(
    user_id,
    variant_id,
    target,
    chat_id
):

    product = get_product_variant(
        variant_id
    )

    if not product:
        send_message(
            chat_id,
            "❌ Produk tidak ditemukan.",
            back_keyboard()
        )
        return

    price = product["price"]

    if get_balance(user_id) < price:

        send_message(
            chat_id,
            "❌ Saldo tidak cukup.\n\n"
            f"Harga: <b>{rupiah(price)}</b>\n"
            f"Saldo: <b>{rupiah(get_balance(user_id))}</b>",
            back_keyboard()
        )

        return

    ref = generate_ref("TRX")

    process = str(
        product.get(
            "process",
            ""
        )
    ).lower()

    if process == "smm":

        note = json.dumps(
            {
                "target": target,
                "opt_smm": ["@username"],
                "comment_smm": ""
            },
            ensure_ascii=False
        )

    else:
        note = target

    payload = {
        "ref_id": ref,
        "carts": [
            {
                "item_id": int(variant_id),
                "quantity": 1,
                "note": note
            }
        ]
    }

    send_message(
        chat_id,
        "⏳ <b>MEMPROSES ORDER...</b>"
    )

    try:

        response = sekalipay_post(
            "/trx",
            payload
        )

        result = response.json()

    except Exception as e:

        print(
            "ORDER API ERROR:",
            repr(e)
        )

        send_message(
            chat_id,
            "❌ Gagal terhubung ke Sekalipay.",
            back_keyboard()
        )

        return

    if result.get("message") != "OK":

        send_message(
            chat_id,
            "❌ <b>TRANSAKSI GAGAL</b>\n\n"
            f"<code>{esc(result.get('message', 'Unknown error'))}</code>\n\n"
            "Saldo tidak dipotong.",
            back_keyboard()
        )

        return

    # ========================================================
    # SERVER MENYATAKAN ORDER BERHASIL
    # ========================================================

    if not deduct_balance(
        user_id,
        price
    ):

        # Kondisi abnormal: order provider sukses,
        # tetapi saldo lokal gagal dipotong.
        print(
            "CRITICAL BALANCE ERROR",
            user_id,
            ref
        )

        send_message(
            chat_id,
            "⚠️ <b>ORDER BERHASIL DI SERVER</b>\n\n"
            f"Invoice: <code>{ref}</code>\n"
            "Saldo lokal gagal dipotong. "
            "Admin perlu melakukan pengecekan.",
            back_keyboard()
        )

        notify_admin(
            "🚨 <b>CRITICAL BALANCE ERROR</b>\n\n"
            f"User: <code>{user_id}</code>\n"
            f"Invoice: <code>{ref}</code>\n"
            f"Produk: {esc(product['product'])}\n"
            f"Harga: {rupiah(price)}"
        )

        return

    data = result.get(
        "data",
        {}
    )

    invoice = data.get(
        "invoice",
        ref
    )

    delivery = "📦 Pesanan sedang diproses."

    items = data.get(
        "items",
        []
    )

    if items:

        license_value = items[0].get(
            "product_license"
        )

        if license_value:

            delivery = (
                "🔑 <b>LICENSE:</b>\n"
                f"<code>{esc(license_value)}</code>"
            )

    notify_admin(
        "🛒 <b>ORDER BERHASIL</b>\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"👤 User: <code>{user_id}</code>\n"
        f"🧾 Invoice: <code>{esc(invoice)}</code>\n"
        f"📦 Produk: {esc(product['product'])}\n"
        f"🔹 Variant: {esc(product['variant'])}\n"
        f"🎯 Target: <code>{esc(target)}</code>\n"
        f"💰 Harga: {rupiah(price)}"
    )

    send_message(
        chat_id,
        "🚀 <b>TRANSAKSI SUKSES!</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"🧾 Invoice: <code>{esc(invoice)}</code>\n"
        f"📦 Produk: {esc(product['product'])}\n"
        f"🔹 Variant: {esc(product['variant'])}\n"
        f"💰 Terpotong: <b>{rupiah(price)}</b>\n\n"
        f"{delivery}",
        back_keyboard()
    )


# ============================================================
# ADMIN
# ============================================================

def notify_admin(text):
    if not ADMIN_ID:
        return

    send_message(
        ADMIN_ID,
        text
    )


# ============================================================
# CALLBACK ROUTER
# ============================================================

def handle_callback(update):
    callback = update.get(
        "callback_query",
        {}
    )

    callback_id = callback.get(
        "id"
    )

    data = callback.get(
        "data",
        ""
    )

    message = callback.get(
        "message",
        {}
    )

    chat_id = message.get(
        "chat",
        {}
    ).get(
        "id"
    )

    user = callback.get(
        "from",
        {}
    )

    user_id = str(
        user.get("id")
    )

    ensure_user(user)

    answer_callback(
        callback_id
    )

    if data == "home":

        show_home(
            chat_id,
            user
        )
        return

    if data == "catalog":

        show_catalog(
            chat_id
        )
        return

    if data == "topup":

        show_topup(
            chat_id
        )
        return

    if data.startswith("topch:"):

        channel = data.split(
            ":",
            1
        )[1]

        send_message(
            chat_id,
            "💵 <b>MASUKKAN NOMINAL DEPOSIT</b>\n\n"
            "Kirim angka saja.\n"
            "Contoh: <code>10000</code>"
        )

        # Simpan state sementara di Sheet.
        # Untuk implementasi full production,
        # gunakan sheet session.
        save_session(
            user_id,
            {
                "step": "topup_amount",
                "channel": channel
            }
        )

        return

    if data.startswith("checktop:"):

        ref = data.split(
            ":",
            1
        )[1]

        result = process_topup_status(
            ref
        )

        if result.get("ok") and not result.get("pending"):

            if result.get("already"):
                send_message(
                    chat_id,
                    "ℹ️ Invoice ini sudah diproses sebelumnya.",
                    back_keyboard()
                )
                return

            amount = result.get(
                "amount",
                0
            )

            send_message(
                chat_id,
                "✅ <b>PEMBAYARAN BERHASIL</b>\n\n"
                f"Saldo bertambah "
                f"<b>{rupiah(amount)}</b>.\n\n"
                f"Saldo sekarang: "
                f"<b>{rupiah(get_balance(user_id))}</b>",
                back_keyboard()
            )

            return

        if result.get("failed"):

            send_message(
                chat_id,
                "❌ Pembayaran tidak berhasil.",
                back_keyboard()
            )

            return

        send_message(
            chat_id,
            "⏳ Pembayaran belum terdeteksi.\n"
            f"Status: <b>{esc(result.get('status', 'PENDING'))}</b>",
            back_keyboard()
        )

        return

    if data == "mutasi":

        pending = [
            x for x in get_all_records(
                "pending_topup"
            )
            if str(x.get("user_id")) == user_id
            and str(x.get("status")) == "pending"
        ]

        text = (
            "📊 <b>MUTASI</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            f"💳 Saldo: <b>{rupiah(get_balance(user_id))}</b>\n\n"
            "🧾 <b>Deposit Pending:</b>\n"
        )

        if not pending:

            text += "Tidak ada deposit pending."

        else:

            for row in pending:

                text += (
                    f"▪️ <code>{esc(row.get('ref'))}</code> "
                    f"- {rupiah(row.get('amount'))}\n"
                )

        send_message(
            chat_id,
            text,
            back_keyboard()
        )

        return

    if data == "status":

        save_session(
            user_id,
            {
                "step": "status"
            }
        )

        send_message(
            chat_id,
            "🔍 Kirim <b>Invoice ID</b> yang ingin dicek.",
            back_keyboard()
        )

        return


# ============================================================
# SESSION SHEET
# ============================================================

SESSION_HEADERS = [
    "user_id",
    "step",
    "data",
    "updated_at"
]


def get_session_sheet():
    ws = get_worksheet(
        "sessions"
    )

    if not ws.get_all_values():
        ws.append_row(
            SESSION_HEADERS
        )

    return ws


def get_session(user_id):
    ws = get_session_sheet()

    records = ws.get_all_records()

    for index, row in enumerate(
        records,
        start=2
    ):

        if str(
            row.get("user_id")
        ) == str(user_id):

            return index, row

    return None, None


def save_session(user_id, data):
    ws = get_session_sheet()

    row_number, old = get_session(
        user_id
    )

    row = {
        "user_id": str(user_id),
        "step": data.get(
            "step",
            ""
        ),
        "data": json.dumps(
            data,
            ensure_ascii=False
        ),
        "updated_at": int(time.time())
    }

    values = [
        row["user_id"],
        row["step"],
        row["data"],
        row["updated_at"]
    ]

    if row_number:

        ws.update(
            f"A{row_number}:D{row_number}",
            [values]
        )

    else:

        ws.append_row(
            values
        )


def clear_session(user_id):
    row_number, row = get_session(
        user_id
    )

    if not row_number:
        return

    get_session_sheet().delete_rows(
        row_number
    )


# ============================================================
# TEXT MESSAGE
# ============================================================

def handle_text(update):
    message = update.get(
        "message",
        {}
    )

    chat = message.get(
        "chat",
        {}
    )

    chat_id = chat.get(
        "id"
    )

    user = message.get(
        "from",
        {}
    )

    user_id = str(
        user.get("id")
    )

    text = str(
        message.get(
            "text",
            ""
        )
    ).strip()

    ensure_user(user)

    row_number, session = get_session(
        user_id
    )

    if not session:

        return

    try:
        session_data = json.loads(
            session.get(
                "data",
                "{}"
            )
        )
    except Exception:
        session_data = {}

    step = session_data.get(
        "step"
    )

    # ========================================================
    # TOPUP AMOUNT
    # ========================================================

    if step == "topup_amount":

        if not text.isdigit():

            send_message(
                chat_id,
                "⚠️ Nominal harus berupa angka."
            )
            return

        amount = int(text)

        if amount < MIN_TOPUP:

            send_message(
                chat_id,
                f"⚠️ Minimum "
                f"<b>{rupiah(MIN_TOPUP)}</b>."
            )
            return

        channel = session_data.get(
            "channel"
        )

        clear_session(
            user_id
        )

        create_topup(
            user_id,
            channel,
            amount,
            chat_id
        )

        return

    # ========================================================
    # CHECK STATUS
    # ========================================================

    if step == "status":

        clear_session(
            user_id
        )

        try:

            response = sekalipay_get(
                f"/trx/{text}"
            )

            if response.status_code != 200:
                raise RuntimeError()

            result = response.json()

            data = result.get(
                "data",
                {}
            )

            status = data.get(
                "status",
                "NOT FOUND"
            )

            send_message(
                chat_id,
                "🔍 <b>STATUS TRANSAKSI</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━━\n"
                f"🧾 Invoice: <code>{esc(text)}</code>\n"
                f"🚦 Status: <b>{esc(str(status).upper())}</b>",
                back_keyboard()
            )

        except Exception:

            send_message(
                chat_id,
                "❌ Gagal mengecek status.",
                back_keyboard()
            )

        return


# ============================================================
# TELEGRAM UPDATE
# ============================================================

def handle_telegram_update(update):
    if "callback_query" in update:

        handle_callback(
            update
        )

        return

    if "message" in update:

        message = update["message"]

        text = str(
            message.get(
                "text",
                ""
            )
        ).strip()

        user = message.get(
            "from",
            {}
        )

        if text.startswith("/start"):

            show_home(
                message["chat"]["id"],
                user
            )

            return

        if text.startswith("/admin"):

            if is_admin(
                user.get("id")
            ):

                notify_admin(
                    "👑 Admin aktif."
                )

            return

        handle_text(
            update
        )


# ============================================================
# SEKALIPAY WEBHOOK SIGNATURE
# ============================================================

def verify_sekalipay_signature(
    payload,
    received_signature
):

    if not WEBHOOK_SECRET:
        return False

    event = payload.get(
        "event",
        ""
    )

    data = payload.get(
        "data",
        {}
    )

    if event == "order.item.sent":

        status = "item.sent"

    elif event == "webhook.test":

        status = "test"

    else:

        status = data.get(
            "status"
        )

    ref_id = data.get(
        "ref_id",
        ""
    )

    invoice = data.get(
        "invoice",
        ""
    )

    status = "" if status is None else str(status)

    raw = (
        f"{ref_id}:"
        f"{invoice}:"
        f"{status}:"
        f"{WEBHOOK_SECRET}"
    )

    expected = hashlib.sha256(
        raw.encode()
    ).hexdigest()

    return hmac.compare_digest(
        expected,
        str(received_signature or "")
    )


# ============================================================
# WEBHOOK IDEMPOTENCY
# ============================================================

def webhook_already_processed(
    event,
    ref_id,
    invoice,
    status
):

    records = get_all_records(
        "webhook_logs"
    )

    for row in records:

        if (
            str(row.get("event")) == str(event)
            and str(row.get("ref_id")) == str(ref_id)
            and str(row.get("invoice")) == str(invoice)
            and str(row.get("status")) == str(status)
        ):

            return True

    return False


def log_webhook(
    event,
    ref_id,
    invoice,
    status
):

    append_record(
        "webhook_logs",
        {
            "event": event,
            "ref_id": ref_id,
            "invoice": invoice,
            "status": status,
            "processed_at": int(time.time())
        }
    )


# ============================================================
# SEKALIPAY WEBHOOK
# ============================================================

def handle_sekalipay_webhook(payload):
    event = payload.get(
        "event",
        ""
    )

    data = payload.get(
        "data",
        {}
    )

    ref_id = data.get(
        "ref_id",
        ""
    )

    invoice = data.get(
        "invoice",
        ""
    )

    status = data.get(
        "status",
        ""
    )

    signature = (
        request.headers.get(
            "X-Webhook-Signature"
        )
        or request.headers.get(
            "X-Signature"
        )
        or request.headers.get(
            "Signature"
        )
        or ""
    )

    if not verify_sekalipay_signature(
        payload,
        signature
    ):

        return (
            jsonify({
                "error": "Invalid signature"
            }),
            401
        )

    # ========================================================
    # DUPLICATE WEBHOOK
    # ========================================================

    if webhook_already_processed(
        event,
        ref_id,
        invoice,
        status
    ):

        return jsonify({
            "status": "already_processed"
        }), 200

    # ========================================================
    # ORDER COMPLETED
    # ========================================================

    if event == "order.completed":

        amount = safe_int(
            data.get(
                "amount",
                0
            )
        )

        items = data.get(
            "items",
            []
        )

        if items:

            item = items[0]

            product = item.get(
                "product_name",
                "Produk"
            )

            variant = item.get(
                "variant_name",
                ""
            )

            target = item.get(
                "target",
                "-"
            )

        else:

            product = "Produk"
            variant = ""
            target = "-"

        pay_code = str(
            data.get(
                "payment_code",
                ""
            )
        ).upper()

        message = (
            "🎉 <b>PESANAN BERHASIL (PAID)</b> 🎉\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"🧾 <b>Invoice:</b> "
            f"<code>{esc(invoice)}</code>\n"
            f"🛒 <b>Produk:</b> {esc(product)}\n"
            f"📦 <b>Variant:</b> {esc(variant)}\n"
            f"🎯 <b>Target:</b> "
            f"<code>{esc(target)}</code>\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"💰 <b>Total:</b> {rupiah(amount)}\n"
            f"💳 <b>Metode:</b> {esc(pay_code)}\n"
            "✅ <i>Berhasil diproses otomatis</i>"
        )

        send_message(
            TELEGRAM_CHAT_ID,
            message,
            thread_id=TELEGRAM_THREAD_ID
        )

    # ========================================================
    # ITEM SENT
    # ========================================================

    elif event == "order.item.sent":

        item = data.get(
            "item",
            {}
        )

        product = item.get(
            "product_name",
            "Produk"
        )

        variant = item.get(
            "variant_name",
            ""
        )

        licenses = item.get(
            "licenses",
            []
        )

        license_text = "\n".join(
            [
                f"🔑 <code>{esc(x.get('product_license'))}</code>"
                for x in licenses
            ]
        )

        message = (
            "📦 <b>ITEM / LISENSI TERKIRIM</b>\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"🧾 Invoice: <code>{esc(invoice)}</code>\n"
            f"🛒 Produk: {esc(product)}\n"
            f"📦 Variant: {esc(variant)}\n\n"
            f"{license_text or '-'}"
        )

        send_message(
            TELEGRAM_CHAT_ID,
            message,
            thread_id=TELEGRAM_THREAD_ID
        )

    # ========================================================
    # CANCELED
    # ========================================================

    elif event == "order.canceled":

        message = (
            "❌ <b>PESANAN DIBATALKAN</b>\n"
            "━━━━━━━━━━━━━━━━━━\n"
            f"🧾 Invoice: <code>{esc(invoice)}</code>\n"
            "⚠️ Pesanan dibatalkan oleh sistem."
        )

        send_message(
            TELEGRAM_CHAT_ID,
            message,
            thread_id=TELEGRAM_THREAD_ID
        )

    # ========================================================
    # TEST
    # ========================================================

    elif event == "webhook.test":

        send_message(
            TELEGRAM_CHAT_ID,
            "🔔 <b>Test Webhook Berhasil!</b>",
            thread_id=TELEGRAM_THREAD_ID
        )

    log_webhook(
        event,
        ref_id,
        invoice,
        status
    )

    return jsonify({
        "status": "ok"
    }), 200


# ============================================================
# HEALTH CHECK
# ============================================================

@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "status": "online",
        "service": "Sekalipay Telegram Gateway"
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok"
    })


# ============================================================
# TELEGRAM WEBHOOK
# ============================================================

@app.route(
    "/webhook/telegram",
    methods=["POST"]
)
def telegram_webhook():

    try:

        update = request.get_json(
            silent=True
        ) or {}

        handle_telegram_update(
            update
        )

        return jsonify({
            "ok": True
        })

    except Exception as e:

        print(
            "TELEGRAM WEBHOOK ERROR:",
            repr(e)
        )

        return jsonify({
            "ok": False
        }), 500


# ============================================================
# SEKALIPAY WEBHOOK
# ============================================================

@app.route(
    "/webhook/sekalipay",
    methods=["POST"]
)
def sekalipay_webhook():

    try:

        payload = request.get_json(
            silent=True
        ) or {}

        return handle_sekalipay_webhook(
            payload
        )

    except Exception as e:

        print(
            "SEKALIPAY WEBHOOK ERROR:",
            repr(e)
        )

        return jsonify({
            "error": "server_error"
        }), 500


# ============================================================
# ADMIN TEST
# ============================================================

@app.route(
    "/admin/test",
    methods=["GET"]
)
def admin_test():

    key = request.args.get(
        "key",
        ""
    )

    admin_secret = os.getenv(
        "ADMIN_SECRET",
        ""
    )

    if not admin_secret:
        return jsonify({
            "error": "ADMIN_SECRET not configured"
        }), 500

    if not hmac.compare_digest(
        key,
        admin_secret
    ):
        return jsonify({
            "error": "Unauthorized"
        }), 401

    notify_admin(
        "✅ <b>Gateway test berhasil.</b>"
    )

    return jsonify({
        "status": "ok"
    })


# ============================================================
# VERCEL ENTRYPOINT
# ============================================================

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(
            os.getenv(
                "PORT",
                "5000"
            )
        )
    )