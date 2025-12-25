import { getDb } from "../../lib/mongo.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { type, genre, q, isActive = "true", limit = "60" } = req.query;

  const db = await getDb();
  const col = db.collection("videos");

  const filter = {};
  if (type && ["anime", "donghua", "drakor"].includes(type)) filter.type = type;
  if (genre) filter.genre = genre;
  if (isActive === "true") filter.isActive = true;

  if (q && String(q).trim()) {
    filter.$or = [
      { title: { $regex: String(q).trim(), $options: "i" } },
      { description: { $regex: String(q).trim(), $options: "i" } }
    ];
  }

  const items = await col
    .find(filter)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(Math.min(parseInt(limit, 10) || 60, 200))
    .toArray();

  res.status(200).json({
    items: items.map((x) => ({
      id: String(x._id),
      title: x.title,
      type: x.type,
      genre: x.genre,
      episode: x.episode || null,
      description: x.description || "",
      thumbUrl: x.thumbUrl || "",
      videoUrl: x.videoUrl || "",
      isActive: !!x.isActive,
      updatedAt: x.updatedAt || x.createdAt
    }))
  });
}