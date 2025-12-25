import { getDb } from "../../lib/mongo.js";
import { verifyAdminToken } from "../../lib/auth.js";
import { ObjectId } from "mongodb";

function requireAdmin(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("NO_TOKEN");
  verifyAdminToken(token);
}

export default async function handler(req, res) {
  try {
    requireAdmin(req);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = await getDb();
  const col = db.collection("videos");

  if (req.method === "POST") {
    const {
      title,
      type,
      genre,
      episode,
      description,
      thumbUrl,
      videoUrl,
      isActive = true
    } = req.body || {};

    if (!title || !type || !genre) {
      return res.status(400).json({ error: "title/type/genre wajib" });
    }
    if (!["anime", "donghua", "drakor"].includes(type)) {
      return res.status(400).json({ error: "type invalid" });
    }

    const now = new Date();
    const doc = {
      title: String(title),
      type,
      genre: String(genre),
      episode: episode ? String(episode) : null,
      description: description ? String(description) : "",
      thumbUrl: thumbUrl ? String(thumbUrl) : "",
      videoUrl: videoUrl ? String(videoUrl) : "",
      isActive: !!isActive,
      createdAt: now,
      updatedAt: now
    };

    const r = await col.insertOne(doc);
    return res.status(200).json({ ok: true, id: String(r.insertedId) });
  }

  if (req.method === "PUT") {
    const { id, patch } = req.body || {};
    if (!id || !patch) return res.status(400).json({ error: "id + patch wajib" });

    const now = new Date();
    const cleanPatch = { ...patch, updatedAt: now };
    delete cleanPatch._id;

    await col.updateOne({ _id: new ObjectId(id) }, { $set: cleanPatch });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id wajib" });

    await col.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isActive: false, updatedAt: new Date() } }
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}