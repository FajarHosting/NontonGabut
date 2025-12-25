import { requireUser } from "./_lib/auth.js";

export default async function handler(req, res) {
  try {
    const user = await requireUser(req);
    return res.json({
      ok: true,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        isSubscribed: !!user.isSubscribed,
        subUntil: user.subUntil
      }
    });
  } catch (err) {
    return res.status(401).json({ ok: false, error: String(err?.message || err) });
  }
}