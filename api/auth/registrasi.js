import bcrypt from "bcryptjs";
import { getDb } from "../_lib/db.js";
import { readJson } from "../_lib/body.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const { email, password, displayName } = await readJson(req);
    const e = String(email || "").trim().toLowerCase();
    const p = String(password || "");

    if (!e || p.length < 6) return res.status(400).json({ ok: false, error: "Email valid dan password min 6" });

    const db = await getDb();
    const users = db.collection("users");

    const exists = await users.findOne({ email: e });
    if (exists) return res.status(400).json({ ok: false, error: "Email sudah terdaftar" });

    const hash = await bcrypt.hash(p, 10);
    await users.insertOne({
      email: e,
      passwordHash: hash,
      displayName: String(displayName || e.split("@")[0]).trim(),
      isSubscribed: false,
      subUntil: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}