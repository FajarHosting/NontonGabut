import json
import os
import re
import time
from typing import Any

import requests


SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"
OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"

TAB = os.getenv("GOOGLE_SHEET_TAB", "Users")
META_TAB = os.getenv("GOOGLE_META_TAB", "Meta")


def _sheet_id() -> str:
    value = (
        os.getenv("GOOGLE_SHEET_ID")
        or os.getenv("GOOGLE_SHEET_URL")
        or ""
    ).strip()

    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", value)
    if match:
        return match.group(1)

    if re.fullmatch(r"[a-zA-Z0-9_-]+", value):
        return value

    raise RuntimeError(
        "GOOGLE_SHEET_ID/GOOGLE_SHEET_URL belum diatur atau link Google Sheets tidak valid."
    )


def _access_token() -> str:
    refresh_token = os.getenv("GOOGLE_REFRESH_TOKEN", "").strip()
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()

    if not refresh_token or not client_id or not client_secret:
        raise RuntimeError(
            "Google Sheets membutuhkan GOOGLE_CLIENT_ID, "
            "GOOGLE_CLIENT_SECRET, dan GOOGLE_REFRESH_TOKEN. "
            "Link spreadsheet saja tidak cukup untuk menulis data."
        )

    response = requests.post(
        OAUTH_TOKEN_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=15,
    )
    response.raise_for_status()
    data = response.json()

    token = data.get("access_token")
    if not token:
        raise RuntimeError(f"Gagal mendapatkan Google access token: {data}")

    return token


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_access_token()}",
        "Content-Type": "application/json",
    }


def _request(method: str, url: str, **kwargs):
    response = requests.request(
        method,
        url,
        headers=_headers(),
        timeout=20,
        **kwargs,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"Google Sheets API HTTP {response.status_code}: {response.text[:1000]}"
        )
    return response


def _metadata():
    sid = _sheet_id()
    return _request("GET", f"{SHEETS_API}/{sid}").json()


def _ensure_tabs():
    metadata = _metadata()
    titles = {
        s["properties"]["title"]
        for s in metadata.get("sheets", [])
    }

    missing = [x for x in (TAB, META_TAB) if x not in titles]
    if not missing:
        return

    requests_payload = [
        {"addSheet": {"properties": {"title": name}}}
        for name in missing
    ]

    sid = _sheet_id()
    _request(
        "POST",
        f"{SHEETS_API}/{sid}:batchUpdate",
        json={"requests": requests_payload},
    )


def _range(tab: str, cell_range: str) -> str:
    # Google accepts single quotes around tab names with spaces.
    return f"'{tab}'!{cell_range}"


def _get_values(tab: str, cell_range: str):
    sid = _sheet_id()
    encoded_range = requests.utils.quote(
        _range(tab, cell_range),
        safe="!$:'",
    )
    response = _request(
        "GET",
        f"{SHEETS_API}/{sid}/values/{encoded_range}",
    )
    return response.json().get("values", [])


def _write_values(tab: str, start_cell: str, values):
    sid = _sheet_id()
    encoded_range = requests.utils.quote(
        _range(tab, start_cell),
        safe="!$:'",
    )
    _request(
        "PUT",
        f"{SHEETS_API}/{sid}/values/{encoded_range}",
        params={"valueInputOption": "RAW"},
        json={
            "range": _range(tab, start_cell),
            "majorDimension": "ROWS",
            "values": values,
        },
    )


def _append_values(tab: str, values):
    sid = _sheet_id()
    encoded_range = requests.utils.quote(
        _range(tab, "A:A"),
        safe="!$:'",
    )
    _request(
        "POST",
        f"{SHEETS_API}/{sid}/values/{encoded_range}:append",
        params={
            "valueInputOption": "RAW",
            "insertDataOption": "INSERT_ROWS",
        },
        json={
            "majorDimension": "ROWS",
            "values": values,
        },
    )


def _ensure_headers():
    _ensure_tabs()

    rows = _get_values(TAB, "A1:G")
    if not rows:
        _write_values(
            TAB,
            "A1",
            [[
                "user_id",
                "name",
                "saldo",
                "pending_topup_json",
                "state_json",
                "updated_at",
                "version",
            ]],
        )

    meta = _get_values(META_TAB, "A1:B")
    if not meta:
        _write_values(
            META_TAB,
            "A1",
            [["key", "value"], ["telegram_offset", "0"]],
        )


def _rows_to_db(rows) -> dict:
    db = {}

    if not rows:
        return db

    for row in rows[1:]:
        if not row:
            continue

        uid = str(row[0]).strip() if len(row) > 0 else ""
        if not uid:
            continue

        name = row[1] if len(row) > 1 else "User"

        try:
            saldo = int(float(row[2])) if len(row) > 2 and row[2] else 0
        except Exception:
            saldo = 0

        pending = {}
        if len(row) > 3 and row[3]:
            try:
                pending = json.loads(row[3])
            except Exception:
                pending = {}

        state = {}
        if len(row) > 4 and row[4]:
            try:
                state = json.loads(row[4])
            except Exception:
                state = {}

        db[uid] = {
            "name": name or "User",
            "saldo": saldo,
            "pending_topup": pending,
            "state": state,
        }

    return db


def get_db() -> dict:
    _ensure_headers()
    return _rows_to_db(_get_values(TAB, "A1:G"))


def save_db(data: dict):
    """
    Writes the complete small user table back to Sheets.
    This intentionally favors correctness over complexity.
    For a large user base, migrate to a real database.
    """
    _ensure_headers()

    rows = [[
        "user_id",
        "name",
        "saldo",
        "pending_topup_json",
        "state_json",
        "updated_at",
        "version",
    ]]

    now = str(int(time.time()))

    for uid, info in data.items():
        rows.append([
            str(uid),
            str(info.get("name", "User")),
            str(int(info.get("saldo", 0))),
            json.dumps(
                info.get("pending_topup", {}),
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            json.dumps(
                info.get("state", {}),
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            now,
            "1",
        ])

    # Clear old rows by writing an empty string matrix is not sufficient.
    # Use clear first, then rewrite.
    sid = _sheet_id()
    encoded = requests.utils.quote(
        _range(TAB, "A2:G"),
        safe="!$:'",
    )
    _request(
        "POST",
        f"{SHEETS_API}/{sid}/values/{encoded}:clear",
        json={},
    )

    if len(rows) > 1:
        _write_values(TAB, "A1", rows)
    else:
        _write_values(TAB, "A1", [rows[0]])


def _get_meta() -> dict:
    _ensure_headers()
    rows = _get_values(META_TAB, "A1:B")
    result = {}
    for row in rows[1:]:
        if len(row) >= 2:
            result[str(row[0])] = str(row[1])
    return result


def get_poll_offset() -> int:
    meta = _get_meta()
    try:
        return int(meta.get("telegram_offset", "0"))
    except Exception:
        return 0


def set_poll_offset(offset: int):
    _ensure_headers()
    rows = _get_values(META_TAB, "A1:B")

    for idx, row in enumerate(rows[1:], start=2):
        if row and row[0] == "telegram_offset":
            _write_values(
                META_TAB,
                f"B{idx}",
                [[str(int(offset))]],
            )
            return

    _append_values(
        META_TAB,
        [["telegram_offset", str(int(offset))]],
    )
