const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { attachUser } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();
router.use(attachUser);

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

router.post(
  "/register",
  rateLimit({ keyPrefix: "reg", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");

    if (username.length < 3) return res.status(400).json({ error: "USERNAME_TOO_SHORT" });
    if (password.length < 6) return res.status(400).json({ error: "PASSWORD_TOO_SHORT" });

    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ error: "USERNAME_TAKEN" });

    const passwordHash = await bcrypt.hash(password, 12);

    // Admin bootstrap: if match .env, create as admin
    const isAdmin =
      username === String(process.env.ADMIN_USERNAME || "").trim().toLowerCase() &&
      password === String(process.env.ADMIN_PASSWORD || "");

    const user = await User.create({ username, passwordHash, isAdmin });
    req.session.userId = user._id.toString();
    return res.json({ ok: true, user: { username: user.username, isAdmin: user.isAdmin } });
  }
);

router.post(
  "/login",
  rateLimit({ keyPrefix: "login", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");

    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    req.session.userId = user._id.toString();
    return res.json({ ok: true, user: { username: user.username, isAdmin: user.isAdmin } });
  }
);

router.post("/logout", async (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/me", async (req, res) => {
  if (!req.user) return res.json({ user: null });
  return res.json({
    user: {
      username: req.user.username,
      isAdmin: req.user.isAdmin,
      premiumUntil: req.user.premiumUntil,
      premiumActive: req.user.isPremiumActive()
    }
  });
});

module.exports = router;