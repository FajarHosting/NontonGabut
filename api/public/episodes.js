import { getDb } from "../_lib/db.js";
import { requireUser } from "../_lib/auth.js";

const FREE_LIMIT = 10;

export default async function handler(req, res) {
  try {
    const user = await requireUser(req);

    const seriesId = String(req.query.seriesId || "").trim();
    if (!seriesId) return res.status(400).json({ ok: false, error: "seriesId required" });

    const db = await getDb();
    const eps = await db.collection("episodes")
      .find({ seriesId })
      .sort({ episodeNumber: 1 })
      .toArray();

    const subscribed = !!user.isSubscribed;

    const items = eps.map(ep => {
      const manualLocked = !!ep.manualLocked;
      const lockAfterFree = ep.lockAfterFree !== false; // default true
      const lockedByFree = (!subscribed) && lockAfterFree && (Number(ep.episodeNumber) > FREE_LIMIT);
      const locked = manualLocked || lockedByFree;

      return {
        id: ep._id.toString(),
        seriesId: ep.seriesId,
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        locked,
        // videoUrl hanya dikirim kalau allowed
        videoUrl: locked ? "" : (ep.videoUrl || "")
      };
    });

    return res.json({ ok: true, subscribed, freeLimit: FREE_LIMIT, items });
  } catch (err) {
    return res.status(401).json({ ok: false, error: String(err?.message || err) });
  }
}