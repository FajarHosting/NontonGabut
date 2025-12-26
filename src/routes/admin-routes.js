const express = require("express");
const Content = require("../models/Content");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { attachUser, requireLogin, requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(attachUser);

// Admin gate
router.use(requireLogin, requireAdmin);

// Add/Update content
router.post("/content/upsert", async (req, res) => {
  const payload = req.body || {};
  const {
    id,
    type,
    title,
    synopsis,
    genres,
    coverUrl,
    episodes
  } = payload;

  if (!["anime", "donghua", "drakor", "dracin"].includes(type)) {
    return res.status(400).json({ error: "INVALID_TYPE" });
  }
  if (!String(title || "").trim()) return res.status(400).json({ error: "TITLE_REQUIRED" });

  const normGenres = Array.isArray(genres)
    ? genres.map((g) => String(g).trim()).filter(Boolean)
    : String(genres || "")
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);

  const normEpisodes = Array.isArray(episodes)
    ? episodes
        .map((e) => ({
          episodeNumber: Number(e.episodeNumber),
          title: String(e.title || ""),
          videoUrl: String(e.videoUrl || ""),
          thumbUrl: String(e.thumbUrl || "")
        }))
        .filter((e) => e.episodeNumber && e.videoUrl)
        .sort((a, b) => a.episodeNumber - b.episodeNumber)
    : [];

  const doc = await Content.findOneAndUpdate(
    { _id: id || undefined },
    {
      type,
      title: String(title).trim(),
      synopsis: String(synopsis || ""),
      genres: normGenres,
      coverUrl: String(coverUrl || ""),
      episodes: normEpisodes
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({ ok: true, item: doc });
});

router.get("/stats", async (_req, res) => {
  const [userCount, contentCount, txs] = await Promise.all([
    User.countDocuments(),
    Content.countDocuments(),
    Transaction.find({ status: "PAID" }).lean()
  ]);

  const revenue = txs.reduce((a, t) => a + (t.amountIDR || 0), 0);
  res.json({ userCount, contentCount, paidTxCount: txs.length, revenueIDR: revenue });
});

router.get("/transactions", async (_req, res) => {
  const items = await Transaction.find().sort({ createdAt: -1 }).populate("userId", "username").lean();
  res.json({ items });
});

// Verify transaction & grant premium
router.post("/transactions/mark", async (req, res) => {
  const txId = String(req.body.txId || "");
  const status = String(req.body.status || "");
  if (!["PAID", "REJECTED"].includes(status)) return res.status(400).json({ error: "INVALID_STATUS" });

  const tx = await Transaction.findById(txId);
  if (!tx) return res.status(404).json({ error: "NOT_FOUND" });

  tx.status = status;
  await tx.save();

  if (status === "PAID") {
    const user = await User.findById(tx.userId);
    const addDays = tx.plan === "premium_90d" ? 90 : 30;

    const base = user.premiumUntil && user.premiumUntil.getTime() > Date.now()
      ? user.premiumUntil
      : new Date();

    const next = new Date(base.getTime() + addDays * 24 * 60 * 60 * 1000);
    user.premiumUntil = next;
    await user.save();
  }

  res.json({ ok: true });
});

// Give premium manually (gift)
router.post("/users/give-premium", async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const days = Number(req.body.days || 30);
  if (!username) return res.status(400).json({ error: "USERNAME_REQUIRED" });
  if (!days || days < 1 || days > 365) return res.status(400).json({ error: "INVALID_DAYS" });

  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

  const base = user.premiumUntil && user.premiumUntil.getTime() > Date.now()
    ? user.premiumUntil
    : new Date();

  user.premiumUntil = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  await user.save();

  res.json({ ok: true, premiumUntil: user.premiumUntil });
});

module.exports = router;