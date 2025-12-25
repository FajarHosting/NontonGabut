import { ObjectId } from "mongodb";
import { getDb } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { readJson } from "../_lib/body.js";

const PLANS = { WEEK: 7, MONTH: 30, YEAR: 365 };

export default async function handler(req, res) {
  try {
    await requireAdmin(req);
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const { paymentId, action } = await readJson(req);
    const act = String(action || "approve").toLowerCase();
    if (!paymentId) return res.status(400).json({ ok: false, error: "paymentId required" });

    const db = await getDb();
    const payments = db.collection("payments");
    const users = db.collection("users");

    const p = await payments.findOne({ _id: new ObjectId(paymentId) });
    if (!p) return res.status(404).json({ ok: false, error: "Payment not found" });
    if (p.status !== "pending") return res.status(400).json({ ok: false, error: "Payment already processed" });

    if (act === "reject") {
      await payments.updateOne({ _id: p._id }, { $set: { status: "rejected", processedAt: Date.now() } });
      return res.json({ ok: true });
    }

    const days = PLANS[String(p.plan || "").toUpperCase()];
    if (!days) return res.status(400).json({ ok: false, error: "Plan invalid in payment" });

    const until = Date.now() + days * 24 * 60 * 60 * 1000;

    await users.updateOne(
      { _id: p.uid },
      { $set: { isSubscribed: true, subUntil: until }, $currentDate: { updatedAt: true } }
    );

    await payments.updateOne({ _id: p._id }, { $set: { status: "approved", processedAt: Date.now(), subUntil: until } });

    return res.json({ ok: true, until });
  } catch (err) {
    const code = String(err?.message || err);
    return res.status(code === "NOT_ADMIN" ? 403 : 500).json({ ok: false, error: code });
  }
}