import { getDb } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { readJson } from "../_lib/body.js";

const PLANS = { WEEK: 7, MONTH: 30, YEAR: 365 };

export default async function handler(req, res) {
  try {
    await requireAdmin(req);
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const { targetEmail, plan } = await readJson(req);
    const email = String(targetEmail || "").trim().toLowerCase();
    const days = PLANS[String(plan || "").toUpperCase()];

    if (!email || !days) return res.status(400).json({ ok: false, error: "targetEmail/plan required" });

    const db = await getDb();
    const user = await db.collection("users").findOne({ email });
    if (!user) return res.status(404).json({ ok: false, error: "User belum registrasi" });

    const until = Date.now() + days * 24 * 60 * 60 * 1000;

    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { isSubscribed: true, subUntil: until }, $currentDate: { updatedAt: true } }
    );

    return res.json({ ok: true, until });
  } catch (err) {
    const code = String(err?.message || err);
    return res.status(code === "NOT_ADMIN" ? 403 : 500).json({ ok: false, error: code });
  }
}