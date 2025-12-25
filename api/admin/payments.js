import { getDb } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req, res) {
  try {
    await requireAdmin(req);
    const db = await getDb();

    const items = await db.collection("payments")
      .find({ status: "pending" })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    return res.json({
      ok: true,
      items: items.map(p => ({
        id: p._id.toString(),
        email: p.email,
        plan: p.plan,
        method: p.method,
        proofUrl: p.proofUrl,
        note: p.note || "",
        createdAt: p.createdAt
      }))
    });
  } catch (err) {
    const code = String(err?.message || err);
    return res.status(code === "NOT_ADMIN" ? 403 : 500).json({ ok: false, error: code });
  }
}