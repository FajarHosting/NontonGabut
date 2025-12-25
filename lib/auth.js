// lib/auth.js
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!JWT_SECRET) throw new Error("JWT_SECRET belum diset");
if (!ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD belum diset");

export function signAdminToken() {
  return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyAdminToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function timingSafeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function checkAdminPassword(pw) {
  return timingSafeEqual(String(pw || ""), String(ADMIN_PASSWORD));
}