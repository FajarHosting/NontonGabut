import { api } from "./api.js";

export async function requireLogin() {
  try {
    const me = await api("/api/me");
    return me.user;
  } catch {
    location.href = "/login.html";
    return null;
  }
}

export async function requireAdmin() {
  const u = await requireLogin();
  if (!u || u.role !== "admin") location.href = "/index.html";
  return u;
}