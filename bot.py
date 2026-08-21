import os
import requests
import time
import json
import html
import asyncio
import uuid

from dotenv import load_dotenv

from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InputMediaPhoto
)

from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    CallbackQueryHandler,
    DictPersistence,
    filters
)

from telegram.error import BadRequest


# ======================================================
# KONFIGURASI
# ======================================================

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
API_KEY = str(os.getenv("SEKALIPAY_API_KEY") or "").strip()

BASE_URL = "https://sekalipay.com/api/v1"

ADMIN_ID = "5578497211"

DASHBOARD_IMG = "https://i.ibb.co/230mW4Xf/img-5578497211.jpg"

USER_DB = "users.json"

LIMIT_PAGE = 8

# ======================================================
# DEPOSIT
# ======================================================

# Bot mengizinkan input mulai Rp500.
# Tetapi nominal final tetap tunduk pada minimum channel
# yang dikembalikan Sekalipay.
MIN_TOPUP = 500

# QRIS diprioritaskan.
# Jika QRIS tidak tersedia, bot akan menampilkan channel
# lain yang aktif.
PREFERRED_TOPUP_TYPES = [
    "qris"
]

PREFERRED_TOPUP_NAMES = [
    "qris"
]


HEADERS = {
    "X-APIKEY": API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}


# ======================================================
# DATABASE USER - GOOGLE SHEETS
# ======================================================

from sheets_db import (
    get_db,
    save_db,
)


def ensure_user(user):
    """Create/normalize a user record in Google Sheets."""
    db = get_db()
    uid = str(user.id)
    info = db.get(uid)
    changed = False

    if not isinstance(info, dict):
        info = {}
        db[uid] = info
        changed = True

    name = user.first_name or "User"
    if info.get("name") != name:
        info["name"] = name
        changed = True

    if "saldo" not in info:
        info["saldo"] = 0
        changed = True

    if not isinstance(info.get("pending_topup"), dict):
        info["pending_topup"] = {}
        changed = True

    if not isinstance(info.get("state"), dict):
        info["state"] = {}
        changed = True

    if changed:
        save_db(db)

    return db


def get_user_saldo(user_id):
    db = get_db()
    info = db.get(str(user_id), {})
    return safe_int(info.get("saldo", 0))


def update_user_saldo(user_id, amount):
    """Change a user's balance and persist it. Returns False on invalid balance."""
    db = get_db()
    uid = str(user_id)
    if uid not in db:
        return False

    current = safe_int(db[uid].get("saldo", 0))
    delta = safe_int(amount)
    new_balance = current + delta
    if new_balance < 0:
        return False

    db[uid]["saldo"] = new_balance
    save_db(db)
    return True


def _persistence_from_db():
    """Load Telegram user_data from Sheets for this short-lived invocation."""
    db = get_db()
    user_data = {}
    for uid, info in db.items():
        try:
            key = int(uid)
        except (TypeError, ValueError):
            continue
        state = info.get("state", {}) if isinstance(info, dict) else {}
        if isinstance(state, dict):
            user_data[key] = state

    return DictPersistence(
        user_data_json=json.dumps(user_data, ensure_ascii=False),
        update_interval=0,
    )

# ======================================================
# HELPER
# ======================================================

def esc(text):

    if text is None:

        return ""

    return html.escape(
        str(text)
    )


def rupiah(value):

    try:

        value = int(
            float(value)
        )

    except Exception:

        value = 0

    return "Rp {:,.0f}".format(
        value
    ).replace(
        ",",
        "."
    )


def generate_ref(prefix="TRX"):

    return (
        f"{prefix}-"
        f"{int(time.time())}-"
        f"{uuid.uuid4().hex[:6].upper()}"
    )


def safe_int(value, default=0):

    try:

        return int(
            float(value)
        )

    except Exception:

        return default


async def api_get(
    endpoint,
    timeout=15
):

    url = f"{BASE_URL}{endpoint}"

    return await asyncio.to_thread(
        requests.get,
        url,
        headers=HEADERS,
        timeout=timeout
    )


async def api_post(
    endpoint,
    payload,
    timeout=30
):

    url = f"{BASE_URL}{endpoint}"

    return await asyncio.to_thread(
        requests.post,
        url,
        json=payload,
        headers=HEADERS,
        timeout=timeout
    )


# ======================================================
# SEKALIPAY BALANCE ADMIN
# ======================================================

async def get_balance():

    try:

        response = await api_get(
            "/balance",
            timeout=10
        )

        if response.status_code != 200:

            return 0

        result = response.json()

        return result.get(
            "data",
            {}
        ).get(
            "balance",
            0
        )

    except Exception:

        return 0


# ======================================================
# TOPUP HELPERS
# ======================================================

def channel_type(channel):

    return str(
        channel.get(
            "type",
            ""
        )
    ).strip().lower()


def channel_name(channel):

    return str(
        channel.get(
            "name",
            ""
        )
    ).strip()


def channel_code(channel):

    # Dokumentasi Sekalipay menggunakan "service"
    # sebagai code untuk POST /balance.
    return (
        channel.get("service")
        or channel.get("code")
    )


def is_qris_channel(channel):

    ctype = channel_type(channel)

    name = channel_name(
        channel
    ).lower()

    code = str(
        channel_code(channel)
        or ""
    ).lower()

    return (
        ctype in PREFERRED_TOPUP_TYPES
        or any(
            x in name
            for x in PREFERRED_TOPUP_NAMES
        )
        or "qris" in code
    )


def get_channel_minimum(channel):

    # API terbaru menyediakan minimum.
    # Kalau tidak ada, fallback ke MIN_TOPUP.
    api_min = channel.get(
        "minimum"
    )

    if api_min is None:

        api_min = channel.get(
            "min_amount"
        )

    if api_min is None:

        return MIN_TOPUP

    value = safe_int(
        api_min,
        MIN_TOPUP
    )

    return max(
        MIN_TOPUP,
        value
    )


def get_channel_maximum(channel):

    api_max = channel.get(
        "maximum"
    )

    if api_max is None:

        api_max = channel.get(
            "max_amount"
        )

    if api_max is None:

        return None

    value = safe_int(
        api_max,
        0
    )

    return value if value > 0 else None


def get_channel_fee(channel, amount):

    flat = safe_int(
        channel.get(
            "fee_flat",
            0
        )
    )

    percentage = channel.get(
        "fee_percentage",
        0
    )

    try:

        percentage = float(
            percentage
        )

    except Exception:

        percentage = 0

    percent_fee = int(
        round(
            amount
            * percentage
            / 100
        )
    )

    # Support format lama kalau API mengembalikan "fee".
    if (
        flat == 0
        and percentage == 0
        and channel.get("fee") is not None
    ):

        flat = safe_int(
            channel.get("fee"),
            0
        )

    return flat + percent_fee


def sort_topup_channels(channels):

    qris = []
    others = []

    for channel in channels:

        status = str(
            channel.get(
                "status",
                ""
            )
        ).lower()

        if status == "off":

            continue

        if not channel_code(channel):

            continue

        if is_qris_channel(channel):

            qris.append(channel)

        else:

            others.append(channel)

    return qris + others


def find_pending_topup(
    db,
    uid,
    ref
):

    return (
        db.get(
            uid,
            {}
        )
        .get(
            "pending_topup",
            {}
        )
        .get(
            ref
        )
    )


# ======================================================
# DASHBOARD
# ======================================================

async def start(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    user = update.effective_user

    db = get_db()

    uid = str(user.id)

    if uid not in db:

        text = (
            "👋 <b>Halo, Selamat Datang!</b>\n\n"
            "Untuk menggunakan layanan bot ini dan mulai "
            "bertransaksi, silakan daftarkan akun kamu terlebih dahulu "
            "dengan menekan tombol di bawah."
        )

        kb = [
            [
                InlineKeyboardButton(
                    "📝 Daftar Akun Sekarang",
                    callback_data="btn_register"
                )
            ]
        ]

        markup = InlineKeyboardMarkup(
            kb
        )

        try:

            if update.message:

                await update.message.reply_photo(
                    photo=DASHBOARD_IMG,
                    caption=text,
                    parse_mode="HTML",
                    reply_markup=markup
                )

            else:

                message = (
                    update.callback_query.message
                )

                if message.photo:

                    await message.edit_media(
                        media=InputMediaPhoto(
                            DASHBOARD_IMG,
                            caption=text,
                            parse_mode="HTML"
                        ),
                        reply_markup=markup
                    )

                else:

                    await message.delete()

                    await message.chat.send_photo(
                        photo=DASHBOARD_IMG,
                        caption=text,
                        parse_mode="HTML",
                        reply_markup=markup
                    )

        except BadRequest as e:

            if "Message is not modified" not in str(e):

                print(
                    "START ERROR:",
                    e
                )

        return


    total_users = len(db)

    user_saldo = get_user_saldo(
        user.id
    )

    user_saldo_f = rupiah(
        user_saldo
    )

    context.user_data.clear()

    name = esc(
        db[uid].get(
            "name",
            user.first_name or "User"
        )
    )

    text = (
        "✨ <b>SEKALIPAY PREMIUM STORE</b> ✨\n"
        "━━━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 <b>User:</b> {name} "
        f"(<code>{uid}</code>)\n"
        f"💳 <b>Saldo Kamu:</b> {user_saldo_f}\n"
    )

    if str(user.id) == str(ADMIN_ID):

        sys_saldo = await get_balance()

        text += (
            f"⚙️ <b>Saldo Sistem:</b> "
            f"{rupiah(sys_saldo)}\n"
        )

    text += (
        f"👥 <b>Total Pengguna:</b> "
        f"{total_users} Orang\n"
        "━━━━━━━━━━━━━━━━━━━━━━\n"
        "Silahkan pilih menu:"
    )

    kb = [

        [
            InlineKeyboardButton(
                "📦 Daftar Produk",
                callback_data="m_cat"
            ),

            InlineKeyboardButton(
                "🛒 Order Manual",
                callback_data="m_trx"
            )
        ],

        [
            InlineKeyboardButton(
                "💰 Isi Saldo",
                callback_data="m_topup"
            ),

            InlineKeyboardButton(
                "📊 Mutasi",
                callback_data="m_mutasi"
            )
        ],

        [
            InlineKeyboardButton(
                "🔍 Cek Status",
                callback_data="m_status"
            ),

            InlineKeyboardButton(
                "📞 Admin",
                url=f"tg://user?id={ADMIN_ID}"
            )
        ],

        [
            InlineKeyboardButton(
                "💬 Join Grup",
                url="https://t.me/seller_premium_byFajar"
            ),

            InlineKeyboardButton(
                "📢 Join Channel",
                url="https://t.me/seller_premium1"
            )
        ]

    ]

    markup = InlineKeyboardMarkup(
        kb
    )

    try:

        if update.message:

            await update.message.reply_photo(
                photo=DASHBOARD_IMG,
                caption=text,
                parse_mode="HTML",
                reply_markup=markup
            )

        else:

            message = (
                update.callback_query.message
            )

            if message.photo:

                await message.edit_media(
                    media=InputMediaPhoto(
                        DASHBOARD_IMG,
                        caption=text,
                        parse_mode="HTML"
                    ),
                    reply_markup=markup
                )

            else:

                await message.delete()

                await message.chat.send_photo(
                    photo=DASHBOARD_IMG,
                    caption=text,
                    parse_mode="HTML",
                    reply_markup=markup
                )

    except BadRequest as e:

        if "Message is not modified" not in str(e):

            print(
                "DASHBOARD ERROR:",
                e
            )


# ======================================================
# KATALOG
# ======================================================

async def show_category(
    query,
    context,
    category_index,
    page=0
):

    cats = context.user_data.get(
        "temp_cats"
    ) or []

    if not cats:

        await query.answer(
            "⚠️ Data katalog sudah expired. Silakan buka Daftar Produk lagi.",
            show_alert=True
        )

        return

    if (
        category_index < 0
        or category_index >= len(cats)
    ):

        await query.answer(
            "❌ Kategori tidak ditemukan.",
            show_alert=True
        )

        return

    cat = cats[
        category_index
    ]

    variants = []

    for product in cat.get(
        "products"
    ) or []:

        product_name = product.get(
            "name",
            "Produk"
        )

        for variant in product.get(
            "variants"
        ) or []:

            stock = variant.get(
                "stock"
            )

            if stock is None:

                is_ready = True

            else:

                try:

                    is_ready = (
                        int(stock) > 0
                    )

                except Exception:

                    is_ready = True

            variants.append({

                "p": product_name,

                "n": variant.get(
                    "name",
                    "Variant"
                ),

                "id": variant.get(
                    "id"
                ),

                "price": variant.get(
                    "price",
                    0
                ),

                "proc": variant.get(
                    "order_process",
                    ""
                ),

                "ready": is_ready

            })

    start_i = (
        page * LIMIT_PAGE
    )

    end_i = (
        start_i + LIMIT_PAGE
    )

    curr_items = variants[
        start_i:end_i
    ]

    context.user_data[
        "catalog_variants"
    ] = variants

    context.user_data[
        "catalog_category"
    ] = category_index

    context.user_data[
        "catalog_page"
    ] = page

    text = (
        f"📋 <b>KATEGORI: "
        f"{esc(cat.get('name', 'Unknown'))}</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━━\n\n"
    )

    kb = []

    if not curr_items:

        text += (
            "❌ Tidak ada produk pada halaman ini."
        )

    else:

        for local_index, item in enumerate(
            curr_items
        ):

            global_index = (
                start_i
                + local_index
            )

            product_name = esc(
                item["p"]
            )

            variant_name = esc(
                item["n"]
            )

            price = rupiah(
                item["price"]
            )

            if item["ready"]:

                icon = "🟢"
                status = "READY"

            else:

                icon = "🔴"
                status = "STOK HABIS"

            text += (
                f"<b>#{global_index + 1}</b> "
                f"{icon} <b>{product_name}</b>\n"
                f"   └─ {variant_name}\n"
                f"   💰 <b>{price}</b> "
                f"• {status}\n\n"
            )

            if item["ready"]:

                kb.append([

                    InlineKeyboardButton(
                        f"🛒 PILIH #{global_index + 1}",
                        callback_data=(
                            f"buy_{item['id']}"
                        )
                    )

                ])

            else:

                kb.append([

                    InlineKeyboardButton(
                        f"❌ #{global_index + 1} STOK HABIS",
                        callback_data="stok_kosong"
                    )

                ])

    nav = []

    if page > 0:

        nav.append(
            InlineKeyboardButton(
                "⬅️ Sebelumnya",
                callback_data=(
                    f"vcat_"
                    f"{category_index}_"
                    f"{page - 1}"
                )
            )
        )

    if end_i < len(variants):

        nav.append(
            InlineKeyboardButton(
                "Selanjutnya ➡️",
                callback_data=(
                    f"vcat_"
                    f"{category_index}_"
                    f"{page + 1}"
                )
            )
        )

    if nav:

        kb.append(nav)

    kb.append([

        InlineKeyboardButton(
            "📂 Kembali ke Kategori",
            callback_data="m_cat"
        )

    ])

    kb.append([

        InlineKeyboardButton(
            "🏠 Menu Utama",
            callback_data="back"
        )

    ])

    markup = InlineKeyboardMarkup(
        kb
    )

    try:

        await query.message.edit_text(
            text,
            parse_mode="HTML",
            reply_markup=markup
        )

    except BadRequest as e:

        if "Message is not modified" not in str(e):

            print(
                "CATEGORY ERROR:",
                e
            )


# ======================================================
# CALLBACK HANDLER
# ======================================================

async def handle_callback(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    query = update.callback_query

    data = query.data

    user = update.effective_user

    uid = str(user.id)

    ensure_user(user)


    # ==================================================
    # REGISTER
    # ==================================================

    if data == "btn_register":

        db = get_db()

        db[uid] = {

            "name": user.first_name or "User",

            "saldo": 0,

            "pending_topup": {}

        }

        save_db(db)

        await query.answer(
            "✅ Pendaftaran Berhasil!",
            show_alert=True
        )

        await start(
            update,
            context
        )

        return


    # ==================================================
    # BACK
    # ==================================================

    if data == "back":

        await query.answer()

        await start(
            update,
            context
        )

        return


    # ==================================================
    # MUTASI
    # ==================================================

    if data == "m_mutasi":

        await query.answer()

        db = get_db()

        pending = db.get(
            uid,
            {}
        ).get(
            "pending_topup",
            {}
        )

        teks = (

            "📊 <b>MUTASI & TAGIHAN KAMU</b>\n"

            "━━━━━━━━━━━━━━━━━━━━━━\n"

            f"💳 <b>Saldo Aktif:</b> "
            f"{rupiah(get_user_saldo(uid))}\n\n"

            "🧾 <b>Tagihan Deposit Tertunda:</b>\n"

        )

        if pending:

            for ref, info in pending.items():

                # Support format lama:
                # ref: amount
                if isinstance(
                    info,
                    dict
                ):

                    amt = safe_int(
                        info.get(
                            "amount",
                            0
                        )
                    )

                    channel_name_value = (
                        info.get(
                            "channel_name",
                            "-"
                        )
                    )

                else:

                    amt = safe_int(
                        info
                    )

                    channel_name_value = "-"

                teks += (

                    f"▪️ <code>{esc(ref)}</code> "
                    f"- <b>{rupiah(amt)}</b>\n"

                    f"   └─ {esc(channel_name_value)}\n"

                )

            teks += (

                "\n<i>Gunakan invoice masing-masing "
                "untuk mengecek pembayaran.</i>"

            )

        else:

            teks += (
                "<i>Tidak ada tagihan tertunda saat ini.</i>"
            )

        kb = [

            [

                InlineKeyboardButton(
                    "🏠 Menu Utama",
                    callback_data="back"
                )

            ]

        ]

        try:

            await query.message.edit_text(
                teks,
                parse_mode="HTML",
                reply_markup=InlineKeyboardMarkup(kb)
            )

        except BadRequest as e:

            if "Message is not modified" not in str(e):

                print(
                    "MUTASI ERROR:",
                    e
                )

        return


    # ==================================================
    # CEK STATUS
    # ==================================================

    if data == "m_status":

        await query.answer()

        context.user_data.update({
            "step": "W_STATUS"
        })

        await query.message.reply_text(

            "🔍 <b>CEK STATUS TRANSAKSI</b>\n\n"

            "Masukkan <b>ID Invoice</b> transaksi "
            "yang ingin kamu cek.\n\n"

            "Contoh:\n"
            "<code>TRX-123456</code>",

            parse_mode="HTML"

        )

        return


    # ==================================================
    # ORDER MANUAL
    # ==================================================

    if data == "m_trx":

        await query.answer(
            "🛒 Fitur Order Manual sedang dalam pengembangan.",
            show_alert=True
        )

        return


    # ==================================================
    # DAFTAR KATEGORI
    # ==================================================

    if data == "m_cat":

        await query.answer()

        try:

            response = await api_get(
                "/item?per_page=all",
                timeout=20
            )

            if response.status_code != 200:

                raise Exception(
                    f"HTTP {response.status_code}"
                )

            result = response.json()

            cats = result.get(
                "data",
                []
            )

            if not cats:

                await query.message.reply_text(
                    "❌ Kategori produk tidak ditemukan."
                )

                return

            context.user_data[
                "temp_cats"
            ] = cats

            text = (
                "📂 <b>PILIH KATEGORI PRODUK</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━━\n\n"
                "Pilih kategori yang ingin kamu lihat:"
            )

            kb = []

            row = []

            for index, category in enumerate(
                cats
            ):

                name = category.get(
                    "name",
                    "Unknown"
                )

                row.append(

                    InlineKeyboardButton(
                        f"📁 {name}",
                        callback_data=(
                            f"vcat_{index}_0"
                        )
                    )

                )

                if len(row) == 2:

                    kb.append(row)

                    row = []

            if row:

                kb.append(row)

            kb.append([

                InlineKeyboardButton(
                    "🏠 Menu Utama",
                    callback_data="back"
                )

            ])

            await query.message.reply_text(

                text,

                parse_mode="HTML",

                reply_markup=InlineKeyboardMarkup(
                    kb
                )

            )

        except Exception as e:

            print(
                "CATEGORY API ERROR:",
                repr(e)
            )

            await query.message.reply_text(
                "❌ Gagal mengambil daftar kategori."
            )

        return


    # ==================================================
    # PAGINATION KATEGORI
    # ==================================================

    if data.startswith("vcat_"):

        await query.answer()

        try:

            _, idx, page = data.split("_")

            idx = int(idx)

            page = int(page)

            await show_category(
                query,
                context,
                idx,
                page
            )

        except Exception as e:

            print(
                "VCAT ERROR:",
                repr(e)
            )

            await query.message.reply_text(
                "❌ Gagal membuka katalog."
            )

        return


    # ==================================================
    # STOK KOSONG
    # ==================================================

    if data == "stok_kosong":

        await query.answer(
            "⚠️ Maaf, stok sedang habis!",
            show_alert=True
        )

        return


    # ==================================================
    # BUY PRODUCT
    # ==================================================

    if data.startswith("buy_"):

        try:

            vid = data.split(
                "_",
                1
            )[1]

            variants = context.user_data.get(
                "catalog_variants",
                []
            )

            selected = None

            for item in variants:

                if str(
                    item.get("id")
                ) == str(vid):

                    selected = item

                    break

            if not selected:

                await query.answer(

                    "⚠️ Data produk sudah expired. "
                    "Silakan buka katalog lagi.",

                    show_alert=True

                )

                return

            price = int(
                float(
                    selected.get(
                        "price",
                        0
                    )
                )
            )

            proc = str(
                selected.get(
                    "proc",
                    ""
                )
            )

            if not selected.get(
                "ready",
                True
            ):

                await query.answer(
                    "❌ Produk sedang habis.",
                    show_alert=True
                )

                return

            user_saldo = get_user_saldo(
                user.id
            )

            if user_saldo < price:

                await query.answer(

                    "❌ Saldo kamu tidak cukup! "
                    "Silakan isi saldo dulu.",

                    show_alert=True

                )

                return

            context.user_data.update({

                "step": "W_TARGET",

                "vid": str(vid),

                "proc": proc,

                "price": price,

                "product_name": selected.get(
                    "p",
                    "Produk"
                ),

                "variant_name": selected.get(
                    "n",
                    "Variant"
                )

            })

            await query.answer()

            await query.message.reply_text(

                "🛒 <b>DETAIL ORDER</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━━\n"

                f"📦 <b>Produk:</b> "
                f"{esc(selected.get('p'))}\n"

                f"🔹 <b>Variant:</b> "
                f"{esc(selected.get('n'))}\n"

                f"💰 <b>Harga:</b> "
                f"{rupiah(price)}\n\n"

                "📝 <b>MASUKKAN TARGET:</b>\n"

                "Contoh:\n"
                "<code>@username</code>\n"
                "atau\n"
                "<code>https://instagram.com/username</code>",

                parse_mode="HTML"

            )

        except Exception as e:

            print(
                "BUY ERROR:",
                repr(e)
            )

            await query.answer(
                "❌ Gagal memilih produk.",
                show_alert=True
            )

        return


    # ==================================================
    # TOPUP MENU
    # ==================================================

    if data == "m_topup":

        await query.answer()

        try:

            response = await api_get(
                "/balance/channels",
                timeout=15
            )

            if response.status_code != 200:

                raise Exception(
                    f"HTTP {response.status_code}"
                )

            result = response.json()

            channels = (
                result.get(
                    "data"
                ) or []
            )

            channels = sort_topup_channels(
                channels
            )

            if not channels:

                await query.message.reply_text(
                    "❌ Tidak ada metode deposit aktif."
                )

                return

            # ==================================================
            # QRIS DI DEPAN
            # ==================================================

            kb = []

            qris_channels = [
                c for c in channels
                if is_qris_channel(c)
            ]

            other_channels = [
                c for c in channels
                if not is_qris_channel(c)
            ]

            # QRIS dibuat tombol sendiri supaya gampang dipilih.
            for channel in qris_channels:

                code = channel_code(
                    channel
                )

                name = channel_name(
                    channel
                ) or "QRIS"

                minimum = get_channel_minimum(
                    channel
                )

                maximum = get_channel_maximum(
                    channel
                )

                label = (
                    f"📱 {name}"
                    f" • min {rupiah(minimum)}"
                )

                if maximum:

                    label += (
                        f" • max {rupiah(maximum)}"
                    )

                kb.append([

                    InlineKeyboardButton(
                        label,
                        callback_data=(
                            f"tup_{code}"
                        )
                    )

                ])

            # Channel lain tetap tersedia.
            row = []

            for channel in other_channels:

                name = channel_name(
                    channel
                ) or "Payment"

                code = channel_code(
                    channel
                )

                name_lower = name.lower()

                if any(
                    x in name_lower
                    for x in [
                        "bca",
                        "bri",
                        "bni",
                        "mandiri",
                        "bank",
                        "va"
                    ]
                ):

                    icon = "🏦"

                elif any(
                    x in name_lower
                    for x in [
                        "gopay",
                        "ovo",
                        "linkaja",
                        "dana"
                    ]
                ):

                    icon = "👛"

                else:

                    icon = "💳"

                minimum = get_channel_minimum(
                    channel
                )

                row.append(

                    InlineKeyboardButton(
                        f"{icon} {name} "
                        f"(min {rupiah(minimum)})",
                        callback_data=(
                            f"tup_{code}"
                        )
                    )

                )

                if len(row) == 2:

                    kb.append(row)

                    row = []

            if row:

                kb.append(row)

            kb.append([

                InlineKeyboardButton(
                    "🏠 Menu Utama",
                    callback_data="back"
                )

            ])

            await query.message.reply_text(

                "💰 <b>ISI SALDO</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━━\n\n"

                f"Minimum bot: <b>{rupiah(MIN_TOPUP)}</b>\n"

                "⚠️ Minimum sebenarnya mengikuti "
                "limit channel dari server.\n\n"

                "📱 <b>QRIS diprioritaskan</b> "
                "jika tersedia.",

                parse_mode="HTML",

                reply_markup=InlineKeyboardMarkup(
                    kb
                )

            )

        except Exception as e:

            print(
                "TOPUP CHANNEL ERROR:",
                repr(e)
            )

            await query.message.reply_text(
                "❌ Gagal mengambil metode topup."
            )

        return


    # ==================================================
    # PILIH CHANNEL TOPUP
    # ==================================================

    if data.startswith("tup_"):

        await query.answer()

        channel = data.split(
            "_",
            1
        )[1]

        # Simpan kode saja.
        # Detail minimum/maximum akan diambil ulang
        # saat user memasukkan nominal supaya tidak
        # bergantung pada data lama.
        context.user_data.update({

            "step": "W_TUP_AMT",

            "ch": channel

        })

        # Ambil detail channel untuk tampilan limit.
        minimum = MIN_TOPUP
        maximum = None
        channel_display = channel

        try:

            response = await api_get(
                "/balance/channels",
                timeout=15
            )

            if response.status_code == 200:

                result = response.json()

                channels = (
                    result.get(
                        "data"
                    ) or []
                )

                for c in channels:

                    if str(
                        channel_code(c)
                    ) == str(channel):

                        minimum = get_channel_minimum(
                            c
                        )

                        maximum = get_channel_maximum(
                            c
                        )

                        channel_display = (
                            channel_name(c)
                            or channel
                        )

                        break

        except Exception:

            pass

        limit_text = (
            f"Minimum: <b>{rupiah(minimum)}</b>"
        )

        if maximum:

            limit_text += (
                f"\nMaximum: <b>{rupiah(maximum)}</b>"
            )

        await query.message.reply_text(

            "💵 <b>MASUKKAN NOMINAL ISI SALDO</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n\n"

            f"💳 Metode: <b>{esc(channel_display)}</b>\n"
            f"{limit_text}\n\n"

            "Masukkan angka saja.\n\n"

            "Contoh:\n"
            "<code>500</code>\n"
            "atau\n"
            "<code>10000</code>",

            parse_mode="HTML"

        )

        return


    # ==================================================
    # BATALKAN DEPOSIT
    # ==================================================

    if data.startswith("canceltup_"):

        ref = data.split(
            "_",
            1
        )[1]

        db = get_db()

        user_db = db.get(
            uid,
            {}
        )

        pending = user_db.get(
            "pending_topup",
            {}
        )

        if ref not in pending:

            await query.answer(

                "⚠️ Deposit sudah tidak ada "
                "di daftar pending.",

                show_alert=True

            )

            return

        # ==================================================
        # PENTING
        #
        # API yang tersedia pada integrasi ini tidak
        # menyediakan endpoint cancel khusus deposit.
        #
        # Jadi pembatalan di bot berarti:
        # - hapus invoice dari pending lokal
        # - saldo tidak pernah ditambahkan
        #
        # Jika invoice provider sudah dibayar setelah
        # pembatalan, JANGAN otomatis menambahkan saldo.
        # Admin perlu menangani kasus tersebut.
        # ==================================================

        del pending[ref]

        save_db(db)

        await query.answer(
            "✅ Deposit dibatalkan dari bot.",
            show_alert=True
        )

        try:

            await query.message.edit_text(

                "🚫 <b>DEPOSIT DIBATALKAN</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━━\n\n"

                f"🧾 Invoice: <code>{esc(ref)}</code>\n\n"

                "Invoice sudah dihapus dari daftar "
                "deposit pending.\n\n"

                "⚠️ Jika pembayaran ternyata sudah "
                "berhasil sebelum pembatalan, hubungi "
                "admin untuk pengecekan.",

                parse_mode="HTML",

                reply_markup=InlineKeyboardMarkup([

                    [

                        InlineKeyboardButton(
                            "🏠 MENU UTAMA",
                            callback_data="back"
                        )

                    ]

                ])

            )

        except BadRequest:

            pass

        return


    # ==================================================
    # CEK PEMBAYARAN TOPUP
    # ==================================================

    if data.startswith("cektup_"):

        ref = data.split(
            "_",
            1
        )[1]

        db = get_db()

        user_data = db.get(
            uid,
            {}
        )

        pending = user_data.get(
            "pending_topup",
            {}
        )

        if ref not in pending:

            await query.answer(

                "⚠️ Invoice tidak ditemukan "
                "atau sudah diproses.",

                show_alert=True

            )

            return

        info = pending[ref]

        # Support data pending versi lama.
        if isinstance(
            info,
            dict
        ):

            nominal = safe_int(
                info.get(
                    "amount",
                    0
                )
            )

        else:

            nominal = safe_int(
                info
            )

        if nominal <= 0:

            await query.answer(
                "❌ Data nominal deposit rusak.",
                show_alert=True
            )

            return

        try:

            response = await api_get(
                f"/trx/{ref}",
                timeout=15
            )

            if response.status_code != 200:

                await query.answer(

                    f"⚠️ Server mengembalikan HTTP "
                    f"{response.status_code}.",

                    show_alert=True

                )

                return

            result = response.json()

            data_res = result.get(
                "data"
            ) or {}

            status_api = str(
                data_res.get(
                    "status",
                    ""
                )
            ).lower()

            success_status = [

                "sukses",
                "success",
                "paid",
                "berhasil",
                "settlement",
                "lunas",
                "completed",
                "ok"

            ]

            canceled_status = [

                "canceled",
                "cancelled",
                "expired",
                "failed",
                "refunded"

            ]

            if status_api in success_status:

                # ==================================================
                # CEK LAGI SEBELUM TAMBAH SALDO
                # ==================================================

                db = get_db()

                current_pending = db.get(
                    uid,
                    {}
                ).get(
                    "pending_topup",
                    {}
                )

                if ref not in current_pending:

                    await query.answer(

                        "⚠️ Invoice sudah diproses.",

                        show_alert=True

                    )

                    return

                db[uid]["saldo"] = (

                    db[uid].get(
                        "saldo",
                        0
                    )
                    + nominal

                )

                del db[uid][
                    "pending_topup"
                ][ref]

                save_db(db)

                await query.answer(

                    f"✅ Pembayaran {rupiah(nominal)} berhasil!\n"
                    "Saldo kamu bertambah.",

                    show_alert=True

                )

                await start(
                    update,
                    context
                )

            elif status_api in canceled_status:

                # Status provider sudah final gagal/cancel.
                db = get_db()

                current_pending = db.get(
                    uid,
                    {}
                ).get(
                    "pending_topup",
                    {}
                )

                if ref in current_pending:

                    del db[uid][
                        "pending_topup"
                    ][ref]

                    save_db(db)

                await query.answer(

                    f"❌ Deposit tidak berhasil.\n"
                    f"Status: {status_api.upper()}",

                    show_alert=True

                )

                try:

                    await query.message.edit_text(

                        "❌ <b>DEPOSIT TIDAK BERHASIL</b>\n"
                        "━━━━━━━━━━━━━━━━━━━━━━\n\n"

                        f"🧾 Invoice: "
                        f"<code>{esc(ref)}</code>\n"

                        f"💰 Nominal: "
                        f"<b>{rupiah(nominal)}</b>\n"

                        f"🚦 Status: "
                        f"<b>{esc(status_api.upper())}</b>\n\n"

                        "Saldo tidak ditambahkan.",

                        parse_mode="HTML",

                        reply_markup=InlineKeyboardMarkup([

                            [

                                InlineKeyboardButton(
                                    "💰 DEPOSIT LAGI",
                                    callback_data="m_topup"
                                )

                            ],

                            [

                                InlineKeyboardButton(
                                    "🏠 MENU UTAMA",
                                    callback_data="back"
                                )

                            ]

                        ])

                    )

                except BadRequest:

                    pass

            else:

                pesan = (

                    status_api.upper()
                    if status_api
                    else "PENDING"

                )

                await query.answer(

                    f"⏳ Pembayaran belum terdeteksi.\n"
                    f"Status API: {pesan}",

                    show_alert=True

                )

        except Exception as e:

            print(
                "CHECK TOPUP ERROR:",
                repr(e)
            )

            await query.answer(

                "❌ Gagal terhubung ke server pengecekan.",

                show_alert=True

            )

        return


# ======================================================
# TEXT HANDLER
# ======================================================

async def handle_text(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    if (
        not update.message
        or not update.message.text
    ):

        return

    txt = update.message.text.strip()

    step = context.user_data.get(
        "step"
    )

    user = update.effective_user

    uid = str(user.id)

    if not step:

        return


    # ==================================================
    # CEK STATUS TRANSAKSI
    # ==================================================

    if step == "W_STATUS":

        load = await update.message.reply_text(
            "⏳ Mengecek status di server..."
        )

        try:

            response = await api_get(
                f"/trx/{txt}",
                timeout=15
            )

            result = response.json()

            data_res = result.get(
                "data"
            ) or {}

            status = data_res.get(
                "status",
                "TIDAK DITEMUKAN"
            )

            status_lower = str(
                status
            ).lower()

            pesan = (

                "🔍 <b>HASIL CEK STATUS</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━━\n\n"

                f"🧾 <b>Invoice:</b> "
                f"<code>{esc(txt)}</code>\n"

                f"🚦 <b>Status:</b> "
                f"<b>{esc(str(status).upper())}</b>\n"

            )

            if status_lower in [
                "sukses",
                "success",
                "paid",
                "berhasil",
                "completed",
                "settlement"
            ]:

                pesan += (
                    "\n✅ Transaksi telah berhasil diproses!"
                )

            elif status_lower == "pending":

                pesan += (
                    "\n⏳ Transaksi sedang dalam antrean proses."
                )

            await load.edit_text(
                pesan,
                parse_mode="HTML"
            )

        except Exception as e:

            print(
                "STATUS ERROR:",
                repr(e)
            )

            await load.edit_text(

                "❌ Gagal mengecek status.\n"
                "Pastikan ID Invoice benar."

            )

        context.user_data.clear()

        return


    # ==================================================
    # TOPUP NOMINAL
    # ==================================================

    if step == "W_TUP_AMT":

        if not txt.isdigit():

            await update.message.reply_text(

                "⚠️ Nominal harus berupa angka.\n"
                "Contoh: <code>500</code>",

                parse_mode="HTML"

            )

            return

        amount = int(txt)

        if amount < MIN_TOPUP:

            await update.message.reply_text(

                f"⚠️ Minimal input bot "
                f"{rupiah(MIN_TOPUP)}.",

                parse_mode="HTML"

            )

            return

        channel = context.user_data.get(
            "ch"
        )

        if not channel:

            await update.message.reply_text(
                "❌ Metode pembayaran tidak ditemukan."
            )

            context.user_data.clear()

            return


        # ==================================================
        # AMBIL LIMIT CHANNEL TERBARU
        # ==================================================

        channel_info = None

        try:

            response = await api_get(
                "/balance/channels",
                timeout=15
            )

            if response.status_code == 200:

                result = response.json()

                channels = (
                    result.get(
                        "data"
                    ) or []
                )

                for c in channels:

                    if str(
                        channel_code(c)
                    ) == str(channel):

                        channel_info = c

                        break

        except Exception as e:

            print(
                "TOPUP CHANNEL REFRESH ERROR:",
                repr(e)
            )


        if not channel_info:

            await update.message.reply_text(

                "❌ Channel pembayaran sudah tidak "
                "tersedia atau API gagal mengambil "
                "detail channel.",

                parse_mode="HTML"

            )

            context.user_data.clear()

            return


        # Jangan percaya minimum dari client.
        channel_minimum = get_channel_minimum(
            channel_info
        )

        channel_maximum = get_channel_maximum(
            channel_info
        )

        if amount < channel_minimum:

            await update.message.reply_text(

                "⚠️ <b>Nominal terlalu kecil.</b>\n\n"

                f"Minimal channel "
                f"<b>{esc(channel_name(channel_info))}</b>: "
                f"<b>{rupiah(channel_minimum)}</b>\n\n"

                "Kalau API key kamu memang mengizinkan "
                "Rp500, nominal Rp500 akan bisa digunakan.",

                parse_mode="HTML"

            )

            return


        if (
            channel_maximum
            and amount > channel_maximum
        ):

            await update.message.reply_text(

                "⚠️ <b>Nominal terlalu besar.</b>\n\n"

                f"Maximum channel "
                f"<b>{esc(channel_name(channel_info))}</b>: "
                f"<b>{rupiah(channel_maximum)}</b>",

                parse_mode="HTML"

            )

            return


        # ==================================================
        # HITUNG ESTIMASI FEE
        # ==================================================

        estimated_fee = get_channel_fee(
            channel_info,
            amount
        )

        estimated_total = (
            amount
            + estimated_fee
        )


        # ==================================================
        # REF
        # ==================================================

        # Deterministic ref per Telegram update prevents duplicate invoices
        # if Telegram retries the same webhook delivery.
        ref = f"TUP-TG-{update.update_id}"


        # ==================================================
        # PAYLOAD
        #
        # Dokumentasi /v1/balance memakai amount + channel.
        # "code" ditambahkan juga untuk kompatibilitas dengan
        # format yang sebelumnya lu gunakan.
        # ==================================================

        payload = {

            "amount": amount,

            "channel": channel,

            "code": channel,

            "ref_id": ref

        }


        load = await update.message.reply_text(

            "⏳ <b>MEMBUAT INVOICE DEPOSIT...</b>\n\n"

            f"💳 Metode: "
            f"<b>{esc(channel_name(channel_info))}</b>\n"

            f"💰 Nominal saldo: "
            f"<b>{rupiah(amount)}</b>\n"

            f"💸 Estimasi fee: "
            f"<b>{rupiah(estimated_fee)}</b>\n"

            f"🧾 Estimasi total bayar: "
            f"<b>{rupiah(estimated_total)}</b>",

            parse_mode="HTML"

        )


        # ==================================================
        # CREATE DEPOSIT
        # ==================================================

        try:

            response = await api_post(
                "/balance",
                payload,
                timeout=30
            )

            try:

                result = response.json()

            except Exception:

                result = {
                    "message": response.text
                }


            if response.status_code not in [
                200,
                201
            ]:

                message = result.get(
                    "message",
                    f"HTTP {response.status_code}"
                )

                await load.edit_text(

                    "❌ <b>DEPOSIT DITOLAK SERVER</b>\n\n"

                    f"<code>{esc(message)}</code>\n\n"

                    "Nominal tidak diproses dan saldo "
                    "belum berubah.",

                    parse_mode="HTML"

                )

                context.user_data.clear()

                return


            data_res = result.get(
                "data"
            ) or {}


            payment_url = (
                data_res.get(
                    "payment_url"
                )
                or data_res.get(
                    "payment_link"
                )
            )

            qr_link = (
                data_res.get(
                    "qr_link"
                )
                or data_res.get(
                    "qr_url"
                )
            )

            invoice = (
                data_res.get(
                    "invoice"
                )
                or ref
            )

            api_amount = safe_int(
                data_res.get(
                    "amount",
                    amount
                ),
                amount
            )

            api_fee = safe_int(
                data_res.get(
                    "fees",
                    data_res.get(
                        "fee",
                        estimated_fee
                    )
                ),
                estimated_fee
            )

            api_total = safe_int(
                data_res.get(
                    "total",
                    api_amount + api_fee
                ),
                api_amount + api_fee
            )

            expires_at = data_res.get(
                "expires_at"
            )


            # ==================================================
            # HARUS ADA PAYMENT LINK ATAU QR
            # ==================================================

            if payment_url or qr_link:

                db = get_db()

                if uid not in db:

                    ensure_user(
                        user
                    )

                    db = get_db()

                if (
                    "pending_topup"
                    not in db[uid]
                ):

                    db[uid][
                        "pending_topup"
                    ] = {}


                # ==================================================
                # SIMPAN DETAIL, BUKAN CUMA NOMINAL
                # ==================================================

                db[uid][
                    "pending_topup"
                ][ref] = {

                    "amount": api_amount,

                    "channel": channel,

                    "channel_name": (
                        channel_name(
                            channel_info
                        )
                    ),

                    "invoice": invoice,

                    "fee": api_fee,

                    "total": api_total,

                    "payment_url": payment_url,

                    "qr_link": qr_link,

                    "expires_at": expires_at,

                    "created_at": int(
                        time.time()
                    )

                }

                save_db(db)


                kb = []


                if payment_url:

                    kb.append([

                        InlineKeyboardButton(
                            "💳 BAYAR SEKARANG",
                            url=payment_url
                        )

                    ])


                if qr_link:

                    kb.append([

                        InlineKeyboardButton(
                            "📱 LIHAT QRIS",
                            url=qr_link
                        )

                    ])


                kb.append([

                    InlineKeyboardButton(
                        "🔄 CEK PEMBAYARAN",
                        callback_data=(
                            f"cektup_{ref}"
                        )
                    )

                ])


                kb.append([

                    InlineKeyboardButton(
                        "🚫 BATALKAN DEPOSIT",
                        callback_data=(
                            f"canceltup_{ref}"
                        )
                    )

                ])


                kb.append([

                    InlineKeyboardButton(
                        "🏠 MENU UTAMA",
                        callback_data="back"
                    )

                ])


                expiry_text = ""

                if expires_at:

                    expiry_text = (
                        f"\n⏰ <b>Expired:</b> "
                        f"{esc(expires_at)}\n"
                    )


                qr_text = ""

                if qr_link:

                    qr_text = (
                        "\n📱 QRIS tersedia "
                        "di tombol <b>LIHAT QRIS</b>.\n"
                    )


                await load.edit_text(

                    "✅ <b>INVOICE DEPOSIT DIBUAT</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━━\n\n"

                    f"🧾 <b>Invoice:</b> "
                    f"<code>{esc(invoice)}</code>\n"

                    f"🔖 <b>Ref:</b> "
                    f"<code>{esc(ref)}</code>\n"

                    f"💳 <b>Metode:</b> "
                    f"{esc(channel_name(channel_info))}\n"

                    f"💰 <b>Saldo masuk:</b> "
                    f"{rupiah(api_amount)}\n"

                    f"💸 <b>Fee:</b> "
                    f"{rupiah(api_fee)}\n"

                    f"💵 <b>Total bayar:</b> "
                    f"<b>{rupiah(api_total)}</b>\n"

                    f"{expiry_text}"

                    f"{qr_text}\n"

                    "1️⃣ Bayar invoice\n"
                    "2️⃣ Tunggu pembayaran berhasil\n"
                    "3️⃣ Klik <b>CEK PEMBAYARAN</b>\n\n"

                    "Saldo hanya ditambahkan setelah "
                    "status pembayaran dikonfirmasi dari server.",

                    parse_mode="HTML",

                    reply_markup=InlineKeyboardMarkup(
                        kb
                    )

                )

            else:

                message = result.get(
                    "message",
                    "Server tidak mengembalikan payment URL / QR."
                )

                await load.edit_text(

                    "❌ <b>INVOICE TIDAK DAPAT DIBUAT</b>\n\n"

                    f"<code>{esc(message)}</code>\n\n"

                    "Tidak ada saldo yang ditambahkan.",

                    parse_mode="HTML"

                )

        except Exception as e:

            print(
                "TOPUP ERROR:",
                repr(e)
            )

            await load.edit_text(

                "❌ Terjadi kesalahan saat "
                "membuat invoice.\n\n"

                "Tidak ada saldo yang ditambahkan. "
                "Silakan coba lagi.",

                parse_mode="HTML"

            )

        context.user_data.clear()

        return


    # ==================================================
    # TARGET ORDER
    # ==================================================

    if step == "W_TARGET":

        vid = context.user_data.get(
            "vid"
        )

        if not vid:

            await update.message.reply_text(
                "❌ Data order sudah expired."
            )

            context.user_data.clear()

            return

        proc = context.user_data.get(
            "proc",
            ""
        )

        price = int(
            context.user_data.get(
                "price",
                0
            )
        )

        product_name = context.user_data.get(
            "product_name",
            "Produk"
        )

        variant_name = context.user_data.get(
            "variant_name",
            "Variant"
        )

        current_balance = get_user_saldo(
            user.id
        )

        if current_balance < price:

            await update.message.reply_text(

                "❌ <b>Saldo Tidak Cukup</b>\n\n"

                f"Harga: <b>{rupiah(price)}</b>\n"
                f"Saldo: <b>{rupiah(current_balance)}</b>\n\n"

                "Silakan isi saldo terlebih dahulu.",

                parse_mode="HTML"

            )

            context.user_data.clear()

            return

        target = txt

        if str(proc).lower() == "smm":

            note = json.dumps(

                {

                    "target": target,

                    "opt_smm": [
                        "@username"
                    ],

                    "comment_smm": ""

                },

                ensure_ascii=False

            )

        else:

            note = target

        # Deterministic ref per Telegram update prevents duplicate orders
        # if Telegram retries the same webhook delivery.
        ref = f"TRX-TG-{update.update_id}"

        payload = {

            "ref_id": ref,

            "carts": [

                {

                    "item_id": int(vid),

                    "quantity": 1,

                    "note": note

                }

            ]

        }

        load = await update.message.reply_text(

            "⏳ <b>MEMPROSES ORDER...</b>\n\n"

            f"📦 {esc(product_name)}\n"
            f"🔹 {esc(variant_name)}\n"
            f"💰 {rupiah(price)}",

            parse_mode="HTML"

        )

        try:

            response = await api_post(
                "/trx",
                payload,
                timeout=60
            )

            result = response.json()

        except Exception as e:

            print(
                "TRX API ERROR:",
                repr(e)
            )

            await load.edit_text(

                "❌ <b>GAGAL TERHUBUNG KE SERVER</b>\n\n"

                "Transaksi belum dipotong.\n"
                "Silakan coba lagi.",

                parse_mode="HTML"

            )

            context.user_data.clear()

            return

        if (
            result.get("message")
            == "OK"
        ):

            deducted = update_user_saldo(
                user.id,
                -price
            )

            if not deducted:

                print(
                    "CRITICAL: API SUCCESS BUT SALDO DEDUCT FAILED",
                    user.id,
                    ref
                )

                await load.edit_text(

                    "⚠️ <b>TRANSAKSI BERHASIL DI SERVER</b>\n\n"

                    f"Invoice: <code>{ref}</code>\n"

                    "Namun sistem gagal memproses "
                    "pemotongan saldo secara lokal.\n\n"

                    "Segera cek transaksi dari menu "
                    "<b>Cek Status</b>.",

                    parse_mode="HTML"

                )

                context.user_data.clear()

                return

            d = result.get(
                "data",
                {}
            )

            delivery = (
                "📦 <b>Pesanan sedang diproses.</b>"
            )

            items = d.get(
                "items",
                []
            )

            if items:

                item = items[0]

                product_license = item.get(
                    "product_license"
                )

                if product_license:

                    delivery = (

                        "🔑 <b>AKUN / LICENSE:</b>\n"

                        f"<code>{esc(product_license)}</code>"

                    )

            h2h_results = result.get(
                "h2h_results"
            )

            if h2h_results:

                first_result = h2h_results[0]

                sn = first_result.get(
                    "sn"
                )

                if sn:

                    delivery = (

                        "📲 <b>SN / HASIL H2H:</b>\n"

                        f"<code>{esc(sn)}</code>"

                    )

            invoice = d.get(
                "invoice",
                ref
            )

            invoice_url = (

                d.get("invoice_url")

                or d.get("payment_url")

                or f"https://sekalipay.com/invoice/{invoice}"

            )

            kb_trx = InlineKeyboardMarkup([

                [

                    InlineKeyboardButton(
                        "🛍️ AMBIL BARANG",
                        url=invoice_url
                    )

                ],

                [

                    InlineKeyboardButton(
                        "🔍 CEK STATUS",
                        callback_data="m_status"
                    )

                ],

                [

                    InlineKeyboardButton(
                        "🏠 MENU UTAMA",
                        callback_data="back"
                    )

                ]

            ])

            await load.edit_text(

                "🚀 <b>TRANSAKSI SUKSES!</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━━\n\n"

                f"🧾 <b>Invoice:</b> "
                f"<code>{esc(invoice)}</code>\n"

                f"📦 <b>Produk:</b> "
                f"{esc(product_name)}\n"

                f"🔹 <b>Variant:</b> "
                f"{esc(variant_name)}\n"

                f"💰 <b>Terpotong:</b> "
                f"{rupiah(price)}\n\n"

                f"{delivery}",

                parse_mode="HTML",

                reply_markup=kb_trx

            )

        else:

            message = result.get(
                "message",
                "Transaksi gagal."
            )

            await load.edit_text(

                "❌ <b>TRANSAKSI GAGAL</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━━\n\n"

                f"📦 {esc(product_name)}\n"
                f"💰 {rupiah(price)}\n\n"

                f"⚠️ <code>{esc(message)}</code>\n\n"

                "💰 Saldo kamu <b>tidak dipotong</b>.",

                parse_mode="HTML"

            )

        context.user_data.clear()

        return


# ======================================================
# ERROR HANDLER
# ======================================================

async def error_handler(
    update,
    context
):

    print(
        "BOT ERROR:",
        repr(context.error)
    )


# ======================================================
# VERCEL / POLLING APP
# ======================================================

def build_application():
    if not BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN belum diatur.")
    if not API_KEY:
        raise RuntimeError("SEKALIPAY_API_KEY belum diatur.")

    persistence = _persistence_from_db()

    app = (
        Application
        .builder()
        .token(BOT_TOKEN)
        .persistence(persistence)
        .concurrent_updates(False)
        .build()
    )

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(
        MessageHandler(
            filters.TEXT & ~filters.COMMAND,
            handle_text
        )
    )
    app.add_error_handler(error_handler)
    return app


def _update_user_id(update_dict):
    msg = (
        update_dict.get("message")
        or update_dict.get("edited_message")
        or update_dict.get("channel_post")
        or update_dict.get("edited_channel_post")
    )
    if msg and msg.get("from"):
        return int(msg["from"]["id"])

    cb = update_dict.get("callback_query")
    if cb and cb.get("from"):
        return int(cb["from"]["id"])

    inline = update_dict.get("inline_query")
    if inline and inline.get("from"):
        return int(inline["from"]["id"])

    chosen = update_dict.get("chosen_inline_result")
    if chosen and chosen.get("from"):
        return int(chosen["from"]["id"])

    return None


async def process_single_update(app, update_dict):
    from telegram import Update as TgUpdate

    uid = _update_user_id(update_dict)
    update = TgUpdate.de_json(update_dict, app.bot)
    await app.process_update(update)

    if uid is not None:
        db = get_db()
        uid_key = str(uid)
        if uid_key in db:
            state = dict(app.user_data.get(uid, {}))
            db[uid_key]["state"] = state
            save_db(db)



def main():
    raise RuntimeError(
        "Bot ini dirancang untuk Vercel webhook. "
        "Gunakan endpoint /api/telegram, bukan run_polling()."
    )


if __name__ == "__main__":
    main()

# ======================================================
# START
# ======================================================

if __name__ == "__main__":

    main()