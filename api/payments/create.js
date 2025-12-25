import { getDb } from "../_lib/db.js";
import { requireUser } from "../_lib/auth.js";
import { readJson } from "../_lib/body.js";

const PLANS = {
  WEEK: { days: 7, label: "1 Minggu" },
  MONTH: { days: 30, label: "1 Bulan" },
  YEAR: { days: 365, label: "1 Tahun" }
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const user = await requireUser(req);
    const { plan, method, proofUrl, note } = await readJson(req);

    const p = String(plan || "").toUpperCase();
    const m = String(method || "").toUpperCase();
    const proof = String(proofUrl || "").trim();

    if (!PLANS[p]) return res.status(400).json({ ok: false, error: "Plan invalid" });
    if (!["DANA", "QRIS", "SEABANK"].includes(m)) return res.status(400).json({ ok: false, error: "Metode invalid" });
    if (!proof) return res.status(400).json({ ok: false, error: "proofUrl wajib diisi (link bukti bayar)" });

    const db = await getDb();
    const doc = {
      uid: user._id,
      email: user.email,
      plan: p,
      method: m,
      proofUrl: proof,
      note: String(note || "").trim(),
      status: "pending",
      createdAt: Date.now()
    };

    const r = await db.collection("payments").insertOne(doc);
    return res.json({ ok: true, id: r.insertedId.toString() });
  } catch (err) {
    return res.status(401).json({ ok: false, error: String(err?.message || err) });
  }
}
