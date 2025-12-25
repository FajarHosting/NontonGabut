import bcrypt from "bcryptjs";
import { getDb } from "../_lib/db.js";
import { readJson } from "../_lib/body.js";
import { signToken } from "../_lib/auth.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    if (!process.env.MONGODB_URI || !process.env.MONGODB_DB) {
      return res.status(500).json({ ok: false, error: "Missing MongoDB env" });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ ok: false, error: "Missing JWT_SECRET env" });
    }

    const { email, password } = await readJson(req);
    const e = String(email || "").trim().toLowerCase();
    const p = String(password || "");

    const db = await getDb();
    const user = await db.collection("users").findOne({ email: e });
    if (!user) return res.status(400).json({ ok: false, error: "Email / password salah" });

    const ok = await bcrypt.compare(p, user.passwordHash || "");
    if (!ok) return res.status(400).json({ ok: false, error: "Email / password salah" });

    // IMPORTANT: _id dibuat string
    const token = signToken({ id: user._id.toString(), email: user.email });

    return res.json({
      ok: true,
      token,
      user: {
        email: user.email,
        displayName: user.displayName,
        isSubscribed: !!user.isSubscribed,
        subUntil: user.subUntil
      }
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}