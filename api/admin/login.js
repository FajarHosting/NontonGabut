import { checkAdminPassword, signAdminToken } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { password } = req.body || {};
  if (!checkAdminPassword(password)) {
    return res.status(401).json({ error: "Password admin salah" });
  }

  const token = signAdminToken();
  res.status(200).json({ token });
}