import { getDb } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { readJson } from "../_lib/body.js";

export default async function handler(req, res) {
  try {
    await requireAdmin(req);
    const db = await getDb();

    if (req.method === "GET") {
      const items = await db.collection("series").find({}).sort({ createdAt: -1 }).limit(300).toArray();
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
    }

    if (req.method === "POST") {
      const { title, type, genre, thumbUrl, description } = await readJson(req);
      if (!title || !type || !genre) return res.status(400).json({ ok: false, error: "title/type/genre required" });

      const doc = {
        title: String(title).trim(),
        type: String(type).trim(),   // anime|donghua|drakor
        genre: String(genre).trim(),
        thumbUrl: String(thumbUrl || "").trim(),
        description: String(description || "").trim(),
        createdAt: Date.now()
      };

      const r = await db.collection("series").insertOne(doc);
      return res.json({ ok: true, id: r.insertedId.toString() });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    const code = String(err?.message || err);
    return res.status(code === "NOT_ADMIN" ? 403 : 500).json({ ok: false, error: code });
  }
}