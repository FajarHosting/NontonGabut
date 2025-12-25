import { getDb } from "../_lib/db.js";

export default async function handler(req, res) {
  try {
    const db = await getDb();

    const type = String(req.query.type || "").trim();
    const genre = String(req.query.genre || "").trim();
    const q = String(req.query.q || "").trim();

    const filter = {};
    if (type) filter.type = type;
    if (genre) filter.genre = genre;
    if (q) filter.title = { $regex: q, $options: "i" };

    const items = await db.collection("series")
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(300)
      .toArray();

    return res.json({
      ok: true,
      items: items.map(s => ({
        id: s._id.toString(),
        title: s.title,
        type: s.type,
        genre: s.genre,
        thumbUrl: s.thumbUrl || "",
        description: s.description || ""
      }))
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}