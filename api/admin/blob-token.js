import { verifyAdminToken } from "../../lib/auth.js";
import { generateUploadToken } from "@vercel/blob/client";

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

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { filename, contentType } = req.body || {};
  if (!filename) return res.status(400).json({ error: "filename wajib" });

  const token = await generateUploadToken({
    pathname: `videos/${Date.now()}-${String(filename).replace(/\s+/g, "_")}`,
    contentType: contentType || "video/mp4"
  });

  res.status(200).json(token);
}