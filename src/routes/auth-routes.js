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

    if (!username || username.length < 3 || password.length < 4) {
      return res.status(400).json({ error: "BAD_INPUT" });
    }

    const adminU = normalizeUsername(process.env.ADMIN_USERNAME || "");
    if (adminU && username === adminU) {
      return res.status(403).json({ error: "RESERVED_USERNAME" });
    }

    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ error: "USERNAME_TAKEN" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, passwordHash });

    req.session.userId = user._id;
    return res.json({ ok: true });
  }
);

router.post(
  "/login",
  rateLimit({ keyPrefix: "login", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");
    if (!username || !password) return res.status(400).json({ error: "BAD_INPUT" });

    const adminU = normalizeUsername(process.env.ADMIN_USERNAME || "");
    const adminP = String(process.env.ADMIN_PASSWORD || "");

    // Admin login via env (auto-create admin user if not exist)
    if (adminU && adminP && username === adminU && password === adminP) {
      let admin = await User.findOne({ username: adminU });
      if (!admin) {
        const passwordHash = await bcrypt.hash(adminP, 10);
        admin = await User.create({ username: adminU, passwordHash, isAdmin: true });
      } else if (!admin.isAdmin) {
        admin.isAdmin = true;
        await admin.save();
      }
      req.session.userId = admin._id;
      return res.json({ ok: true, admin: true });
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    req.session.userId = user._id;
    return res.json({ ok: true });
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
      avatarUrl: req.user.avatarUrl || "",
      premiumUntil: req.user.premiumUntil,
      premiumActive: req.user.isPremiumActive(),
      freeEpisodesLimit: req.user.freeEpisodesLimit
    }
  });
});

module.exports = router;