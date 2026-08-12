import os
import json
import html
import hashlib
import secrets
from functools import wraps

import requests
import gspread

from flask import Flask, request, jsonify, Response
from google.oauth2.service_account import Credentials


app = Flask(__name__)


# ============================================================
# CONFIG
# SEMUA RAHASIA DIAMBIL DARI VERCEL ENVIRONMENT VARIABLES
# ============================================================

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
SEKALIPAY_API_KEY = os.getenv("SEKALIPAY_API_KEY", "").strip()

WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "").strip()

ADMIN_ID = os.getenv("ADMIN_ID", "").strip()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()

GOOGLE_SHEET_ID = os.getenv("GOOGLE_SHEET_ID", "").strip()
GOOGLE_SERVICE_ACCOUNT_JSON = os.getenv(
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    ""
).strip()

BASE_URL = "https://sekalipay.com/api/v1"


# ============================================================
# GOOGLE SHEETS
# ============================================================

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]


def get_sheet():

    if not GOOGLE_SERVICE_ACCOUNT_JSON:
        raise RuntimeError(
            "GOOGLE_SERVICE_ACCOUNT_JSON belum diatur"
        )

    if not GOOGLE_SHEET_ID:
        raise RuntimeError(
            "GOOGLE_SHEET_ID belum diatur"
        )

    info = json.loads(
        GOOGLE_SERVICE_ACCOUNT_JSON
    )

    credentials = Credentials.from_service_account_info(
        info,
        scopes=SCOPES
    )

    client = gspread.authorize(credentials)

    spreadsheet = client.open_by_key(
        GOOGLE_SHEET_ID
    )

    return spreadsheet


def get_worksheet(name):

    spreadsheet = get_sheet()

    try:
        return spreadsheet.worksheet(name)

    except gspread.WorksheetNotFound:

        worksheet = spreadsheet.add_worksheet(
            title=name,
            rows=1000,
            cols=20
        )

        return worksheet


# ============================================================
# INIT DATABASE
# ============================================================

def init_database():

    sheets = {

        "users": [
            "telegram_id",
            "name",
            "saldo",
            "created_at"
        ],

        "transactions": [
            "ref_id",
            "telegram_id",
            "invoice",
            "product",
            "variant",
            "target",
            "amount",
            "status",
            "created_at"
        ],

        "topups": [
            "ref_id",
            "telegram_id",
            "invoice",
            "amount",
            "fee",
            "total",
            "channel",
            "status",
            "created_at"
        ]

    }

    for name, headers in sheets.items():

        ws = get_worksheet(name)

        if not ws.get_all_values():

            ws.append_row(headers)


# ============================================================
# UTILITY
# ============================================================

def esc(value):

    return html.escape(
        str(value or "")
    )


def rupiah(value):

    try:
        value = int(
            float(value)
        )
    except Exception:
        value = 0

    return (
        "Rp {:,.0f}".format(value)
        .replace(",", ".")
    )


def safe_int(value):

    try:
        return int(float(value))
    except Exception:
        return 0


def generate_ref(prefix):

    return (
        f"{prefix}-"
        f"{secrets.token_hex(5).upper()}"
    )


# ============================================================
# TELEGRAM
# ============================================================

def telegram(method, payload):

    if not BOT_TOKEN:
        raise RuntimeError(
            "TELEGRAM_BOT_TOKEN belum diatur"
        )

    url = (
        f"https://api.telegram.org/"
        f"bot{BOT_TOKEN}/{method}"
    )

    response = requests.post(
        url,
        json=payload,
        timeout=20
    )

    return response


def send_message(
    chat_id,
    text,
    reply_markup=None
):

    payload = {

        "chat_id": chat_id,

        "text": text,

        "parse_mode": "HTML"

    }

    if reply_markup:

        payload[
            "reply_markup"
        ] = reply_markup

    return telegram(
        "sendMessage",
        payload
    )


# ============================================================
# USERS
# ============================================================

def find_user(telegram_id):

    ws = get_worksheet("users")

    values = ws.get_all_records()

    for index, user in enumerate(values, start=2):

        if str(
            user.get("telegram_id")
        ) == str(telegram_id):

            return index, user

    return None, None


def create_user(
    telegram_id,
    name
):

    ws = get_worksheet("users")

    ws.append_row([

        str(telegram_id),

        name,

        0,

        str(
            __import__("time").time()
        )

    ])


def get_balance(telegram_id):

    _, user = find_user(
        telegram_id
    )

    if not user:
        return 0

    return safe_int(
        user.get("saldo", 0)
    )


def set_balance(
    telegram_id,
    amount
):

    index, user = find_user(
        telegram_id
    )

    if not user:
        return False

    ws = get_worksheet("users")

    headers = ws.row_values(1)

    saldo_col = (
        headers.index("saldo") + 1
    )

    ws.update_cell(
        index,
        saldo_col,
        amount
    )

    return True


def add_balance(
    telegram_id,
    amount
):

    current = get_balance(
        telegram_id
    )

    return set_balance(
        telegram_id,
        current + amount
    )


# ============================================================
# ADMIN AUTH
# ============================================================

def admin_required(fn):

    @wraps(fn)
    def wrapper(*args, **kwargs):

        auth = request.authorization

        if not auth:

            return Response(
                "Authentication required",
                401,
                {
                    "WWW-Authenticate":
                    'Basic realm="Admin Panel"'
                }
            )

        username = auth.username
        password = auth.password

        if (
            username != "admin"
            or not secrets.compare_digest(
                password or "",
                ADMIN_PASSWORD
            )
        ):

            return Response(
                "Unauthorized",
                401,
                {
                    "WWW-Authenticate":
                    'Basic realm="Admin Panel"'
                }
            )

        return fn(
            *args,
            **kwargs
        )

    return wrapper


# ============================================================
# HOME / HEALTH
# ============================================================

@app.route("/", methods=["GET"])
def home():

    return jsonify({

        "service":
        "Sekalipay Telegram Gateway",

        "status":
        "online",

        "telegram":
        bool(BOT_TOKEN),

        "sekalipay":
        bool(SEKALIPAY_API_KEY),

        "database":
        bool(GOOGLE_SHEET_ID)

    })


# ============================================================
# TELEGRAM WEBHOOK
# ============================================================

@app.route(
    "/api/telegram",
    methods=["POST"]
)
def telegram_webhook():

    # Telegram secret token
    telegram_secret = request.headers.get(
        "X-Telegram-Bot-Api-Secret-Token",
        ""
    )

    if WEBHOOK_SECRET:

        if not secrets.compare_digest(
            telegram_secret,
            WEBHOOK_SECRET
        ):

            return jsonify({
                "error": "Unauthorized"
            }), 401


    update = request.get_json(
        silent=True
    ) or {}


    # ========================================================
    # MESSAGE
    # ========================================================

    message = update.get(
        "message"
    )

    if message:

        user = message.get(
            "from",
            {}
        )

        chat_id = message.get(
            "chat",
            {}
        ).get(
            "id"
        )

        text = message.get(
            "text",
            ""
        ).strip()

        telegram_id = str(
            user.get("id")
        )

        name = (
            user.get("first_name")
            or "User"
        )


        # REGISTER USER

        _, existing = find_user(
            telegram_id
        )

        if not existing:

            create_user(
                telegram_id,
                name
            )


        # /start

        if text == "/start":

            balance = get_balance(
                telegram_id
            )

            keyboard = {

                "inline_keyboard": [

                    [

                        {
                            "text":
                            "📦 Produk",

                            "callback_data":
                            "products"

                        },

                        {
                            "text":
                            "💰 Saldo",

                            "callback_data":
                            "balance"

                        }

                    ],

                    [

                        {
                            "text":
                            "💳 Deposit",

                            "callback_data":
                            "deposit"

                        },

                        {
                            "text":
                            "📊 Mutasi",

                            "callback_data":
                            "mutation"

                        }

                    ],

                    [

                        {
                            "text":
                            "🔍 Cek Status",

                            "callback_data":
                            "status"

                        }

                    ]

                ]

            }

            send_message(

                chat_id,

                "✨ <b>SEKALIPAY PREMIUM STORE</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n\n"

                f"👤 <b>{esc(name)}</b>\n"

                f"💰 Saldo: "
                f"<b>{rupiah(balance)}</b>\n\n"

                "Silakan pilih menu:",

                keyboard

            )

            return jsonify({
                "ok": True
            })


    # ========================================================
    # CALLBACK
    # ========================================================

    callback = update.get(
        "callback_query"
    )

    if callback:

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

        telegram_id = str(
            callback.get(
                "from",
                {}
            ).get(
                "id"
            )
        )


        telegram(
            "answerCallbackQuery",
            {
                "callback_query_id":
                callback_id
            }
        )


        if data == "balance":

            balance = get_balance(
                telegram_id
            )

            send_message(

                chat_id,

                "💰 <b>SALDO AKUN</b>\n\n"

                f"Saldo kamu:\n"
                f"<b>{rupiah(balance)}</b>"

            )


        elif data == "deposit":

            send_message(

                chat_id,

                "💳 <b>ISI SALDO</b>\n\n"

                "Kirim nominal deposit.\n\n"

                "Contoh:\n"
                "<code>10000</code>"

            )


        elif data == "products":

            try:

                headers = {

                    "X-APIKEY":
                    SEKALIPAY_API_KEY,

                    "Accept":
                    "application/json"

                }

                response = requests.get(

                    f"{BASE_URL}/item"
                    "?per_page=all",

                    headers=headers,

                    timeout=20

                )

                result = response.json()

                categories = (
                    result.get(
                        "data"
                    ) or []
                )

                if not categories:

                    send_message(
                        chat_id,
                        "❌ Produk tidak ditemukan."
                    )

                else:

                    text = (
                        "📦 <b>KATALOG PRODUK</b>\n"
                        "━━━━━━━━━━━━━━━━━━━━\n\n"
                    )

                    for category in categories:

                        text += (
                            f"📁 <b>"
                            f"{esc(category.get('name'))}"
                            f"</b>\n"
                        )

                        for product in (
                            category.get(
                                "products"
                            ) or []
                        ):

                            for variant in (
                                product.get(
                                    "variants"
                                ) or []
                            ):

                                text += (

                                    f"• "
                                    f"{esc(product.get('name'))}"
                                    f" — "
                                    f"{esc(variant.get('name'))}"
                                    f"\n"

                                    f"  💰 "
                                    f"{rupiah(variant.get('price'))}\n"

                                )

                    send_message(
                        chat_id,
                        text
                    )

            except Exception as e:

                print(
                    "PRODUCT ERROR:",
                    repr(e)
                )

                send_message(
                    chat_id,
                    "❌ Gagal mengambil produk."
                )


        elif data == "mutation":

            _, user = find_user(
                telegram_id
            )

            balance = get_balance(
                telegram_id
            )

            send_message(

                chat_id,

                "📊 <b>MUTASI</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n\n"

                f"💰 Saldo:\n"
                f"<b>{rupiah(balance)}</b>\n\n"

                "Detail transaksi tersimpan di "
                "database panel."

            )


        elif data == "status":

            send_message(

                chat_id,

                "🔍 <b>CEK STATUS</b>\n\n"

                "Kirim ID invoice transaksi kamu.\n\n"

                "Contoh:\n"
                "<code>TRX-ABC123</code>"

            )


    return jsonify({
        "ok": True
    })


# ============================================================
# SEKALIPAY WEBHOOK
# ============================================================

@app.route(
    "/api/sekalipay",
    methods=["POST"]
)
def sekalipay_webhook():

    payload = request.get_json(
        silent=True
    ) or {}

    event = payload.get(
        "event",
        ""
    )

    data = payload.get(
        "data",
        {}
    )


    # ========================================================
    # SIGNATURE
    # ========================================================

    received_signature = (

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


    if event == "order.item.sent":

        status_for_sig = "item.sent"

    elif event == "webhook.test":

        status_for_sig = "test"

    else:

        status_for_sig = data.get(
            "status"
        )


    ref_id = data.get(
        "ref_id"
    ) or ""

    invoice = data.get(
        "invoice"
    ) or ""

    status_for_sig = (
        status_for_sig or ""
    )


    string_to_hash = (

        f"{ref_id}:"
        f"{invoice}:"
        f"{status_for_sig}:"
        f"{WEBHOOK_SECRET}"

    )


    expected_signature = hashlib.sha256(

        string_to_hash.encode()

    ).hexdigest()


    if WEBHOOK_SECRET:

        if not secrets.compare_digest(
            expected_signature,
            received_signature
        ):

            return jsonify({
                "error":
                "Invalid signature"
            }), 401


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

        items = (
            data.get(
                "items"
            ) or []
        )

        product = ""
        variant = ""
        target = ""

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


        ws = get_worksheet(
            "transactions"
        )

        ws.append_row([

            ref_id,

            data.get(
                "user_id",
                ""
            ),

            invoice,

            product,

            variant,

            target,

            amount,

            "completed",

            str(
                __import__("time").time()
            )

        ])


        message = (

            "🎉 <b>PESANAN BERHASIL</b>\n"
            "━━━━━━━━━━━━━━━━━━━━\n\n"

            f"🧾 Invoice: "
            f"<code>{esc(invoice)}</code>\n"

            f"🛒 Produk: "
            f"<b>{esc(product)}</b>\n"

            f"📦 Variant: "
            f"{esc(variant)}\n"

            f"💰 Total: "
            f"<b>{rupiah(amount)}</b>"

        )

        if ADMIN_ID:

            send_message(
                ADMIN_ID,
                message
            )


    # ========================================================
    # ITEM SENT
    # ========================================================

    elif event == "order.item.sent":

        item = data.get(
            "item",
            {}
        )

        licenses = item.get(
            "licenses",
            []
        )

        license_text = "\n".join(

            "<code>"
            + esc(
                x.get(
                    "product_license"
                )
            )
            + "</code>"

            for x in licenses

        )

        if ADMIN_ID:

            send_message(

                ADMIN_ID,

                "📦 <b>ITEM TERKIRIM</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n\n"

                f"🧾 Invoice: "
                f"<code>{esc(invoice)}</code>\n\n"

                f"🔑 <b>License:</b>\n"
                f"{license_text or '-'}"

            )


    # ========================================================
    # CANCELED
    # ========================================================

    elif event == "order.canceled":

        if ADMIN_ID:

            send_message(

                ADMIN_ID,

                "❌ <b>ORDER DIBATALKAN</b>\n\n"

                f"Invoice: "
                f"<code>{esc(invoice)}</code>"

            )


    return jsonify({
        "status": "ok"
    })


# ============================================================
# ADMIN PANEL
# ============================================================

@app.route(
    "/panel",
    methods=["GET"]
)
@admin_required
def panel():

    users_ws = get_worksheet(
        "users"
    )

    trx_ws = get_worksheet(
        "transactions"
    )

    topup_ws = get_worksheet(
        "topups"
    )

    users = users_ws.get_all_records()
    transactions = trx_ws.get_all_records()
    topups = topup_ws.get_all_records()


    total_balance = sum(

        safe_int(
            x.get(
                "saldo",
                0
            )
        )

        for x in users

    )


    html_page = f"""
<!DOCTYPE html>

<html>

<head>

<meta name="viewport"
content="width=device-width, initial-scale=1">

<title>Sekalipay Panel</title>

<style>

body {{
    font-family: Arial, sans-serif;
    background:#111;
    color:#eee;
    margin:0;
    padding:20px;
}}

.container {{
    max-width:1100px;
    margin:auto;
}}

.card {{
    background:#1c1c1c;
    border-radius:14px;
    padding:20px;
    margin-bottom:15px;
}}

.grid {{
    display:grid;
    grid-template-columns:
    repeat(auto-fit,minmax(180px,1fr));
    gap:15px;
}}

.number {{
    font-size:28px;
    font-weight:bold;
}}

table {{
    width:100%;
    border-collapse:collapse;
}}

th,td {{
    padding:10px;
    border-bottom:1px solid #333;
    text-align:left;
}}

.small {{
    color:#aaa;
    font-size:13px;
}}

</style>

</head>

<body>

<div class="container">

<h1>⚡ Sekalipay Panel</h1>

<p class="small">
Serverless • Vercel • Google Sheets
</p>

<div class="grid">

<div class="card">

<div>Total User</div>

<div class="number">
{len(users)}
</div>

</div>

<div class="card">

<div>Total Transaksi</div>

<div class="number">
{len(transactions)}
</div>

</div>

<div class="card">

<div>Total Topup</div>

<div class="number">
{len(topups)}
</div>

</div>

<div class="card">

<div>Total Saldo User</div>

<div class="number">
{rupiah(total_balance)}
</div>

</div>

</div>


<div class="card">

<h2>👥 User</h2>

<table>

<tr>
<th>ID</th>
<th>Nama</th>
<th>Saldo</th>
</tr>
"""

    for user in users[-50:]:

        html_page += f"""

<tr>

<td>{esc(user.get("telegram_id"))}</td>

<td>{esc(user.get("name"))}</td>

<td>
{rupiah(user.get("saldo", 0))}
</td>

</tr>

"""


    html_page += """

</table>

</div>


<div class="card">

<h2>📦 Transaksi Terakhir</h2>

<table>

<tr>
<th>Invoice</th>
<th>Produk</th>
<th>Amount</th>
<th>Status</th>
</tr>
"""


    for trx in transactions[-50:]:

        html_page += f"""

<tr>

<td>{esc(trx.get("invoice"))}</td>

<td>{esc(trx.get("product"))}</td>

<td>{rupiah(trx.get("amount"))}</td>

<td>{esc(trx.get("status"))}</td>

</tr>

"""


    html_page += """

</table>

</div>

</div>

</body>

</html>
"""


    return Response(
        html_page,
        mimetype="text/html"
    )


# ============================================================
# HEALTH
# ============================================================

@app.route(
    "/api/health",
    methods=["GET"]
)
def health():

    return jsonify({

        "status":
        "online",

        "telegram":
        bool(BOT_TOKEN),

        "sekalipay":
        bool(SEKALIPAY_API_KEY),

        "google_sheets":
        bool(GOOGLE_SHEET_ID)

    })


# ============================================================
# VERCEL ENTRY
# ============================================================

# Jangan gunakan app.run()
#
# Vercel yang akan menjalankan Flask application.