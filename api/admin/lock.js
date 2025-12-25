import { getDb } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { readJson } from "../_lib/body.js";

export default async function handler(req, res) {
  try {
    await requireAdmin(req);
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const { seriesId, episodeNumber, locked } = await readJson(req);
    const sid = String(seriesId || "").trim();
    const num = Number(episodeNumber || 0);

    if (!sid || !num) return res.status(400).json({ ok: false, error: "seriesId/episodeNumber required" });

    const db = await getDb();
    await db.collection("episodes").updateOne(
      { seriesId: sid, episodeNumber: num },
      { $set: { manualLocked: !!locked, updatedAt: Date.now() } }
    );

    return res.json({ ok: true });
  } catch (err) {
    const code = String(err?.message || err);
    return res.status(code === "NOT_ADMIN" ? 403 : 500).json({ ok: false, error: code });
  }
}