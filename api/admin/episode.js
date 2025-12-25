import { getDb } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { readJson } from "../_lib/body.js";

export default async function handler(req, res) {
  try {
    await requireAdmin(req);

    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const { seriesId, episodeNumber, title, videoUrl, lockAfterFree } = await readJson(req);
    const sid = String(seriesId || "").trim();
    const num = Number(episodeNumber || 0);
    const url = String(videoUrl || "").trim();

    if (!sid || !num || !url) return res.status(400).json({ ok: false, error: "seriesId/episodeNumber/videoUrl required" });

    const db = await getDb();
    await db.collection("episodes").updateOne(
      { seriesId: sid, episodeNumber: num },
      {
        $set: {
          seriesId: sid,
          episodeNumber: num,
          title: String(title || `Episode ${num}`).trim(),
          videoUrl: url,
          lockAfterFree: lockAfterFree !== false, // default true
          updatedAt: Date.now()
        },
        $setOnInsert: { createdAt: Date.now(), manualLocked: false }
      },
      { upsert: true }
    );

    return res.json({ ok: true });
  } catch (err) {
    const code = String(err?.message || err);
    return res.status(code === "NOT_ADMIN" ? 403 : 500).json({ ok: false, error: code });
  }
}