import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { getDb } from "./db.js";

export function signToken(payload) {
  if (!process.env.JWT_SECRET) throw new Error("Missing JWT_SECRET");
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });
}

export function getAdminEmailSet() {
  const s = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);
  return new Set(s);
}

export async function requireUser(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) throw new Error("NO_TOKEN");
  if (!process.env.JWT_SECRET) throw new Error("Missing JWT_SECRET");

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new Error("BAD_TOKEN");
  }

  // IMPORTANT: decoded.id harus string ObjectId
  const idStr = String(decoded.id || "");
  if (!ObjectId.isValid(idStr)) throw new Error("BAD_USER_ID");

  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: new ObjectId(idStr) });
  if (!user) throw new Error("USER_NOT_FOUND");

  // auto-off subscription kalau lewat waktu
  if (user.subUntil && Date.now() > user.subUntil) {
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { isSubscribed: false, subUntil: null }, $currentDate: { updatedAt: true } }
    );
    user.isSubscribed = false;
    user.subUntil = null;
  }

  return user;
}

export async function requireAdmin(req) {
  const user = await requireUser(req);
  const admins = getAdminEmailSet();
  if (!admins.has(String(user.email || "").toLowerCase())) throw new Error("NOT_ADMIN");
  return user;
}