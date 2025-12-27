const express = require("express");
const router = express.Router();

const Content = require("../models/Content");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { attachUser, requireAdmin } = require("../middleware/auth");

router.use(attachUser);
router.use(requireAdmin);

// list konten untuk dropdown admin
router.get("/contents", async (_req, res) => {
  const items = await Content.find({}).sort({ createdAt: -1 }).limit(200).lean();
  res.json({
    items: items.map((x) => ({
      _id: x._id,
      title: x.title,
      type: x.type,
      coverUrl: x.coverUrl || "",
      episodeCount: (x.episodes || []).length
    }))
  });
});

// tambah film baru
router.post("/content", async (req, res) => {
  const title = String(req.body.title || "").trim();
  const type = String(req.body.type || "").trim();
  const coverUrl = String(req.body.coverUrl || "").trim();
  const synopsis = String(req.body.synopsis || "");
  const genres = String(req.body.genres || "")
    .split(",")
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);

  if (!title || !type || !coverUrl) return res.status(400).json({ error: "BAD_INPUT" });

  const item = await Content.create({ title, type, coverUrl, synopsis, genres, episodes: [] });
  res.json({ ok: true, item });
});

// append episode tanpa bikin film baru
router.post("/content/add-episode", async (req, res) => {
  const contentId = String(req.body.contentId || "").trim();
  const ep = req.body.episode || {};
  const episodeNumber = Number(ep.episodeNumber);
  const videoUrl = String(ep.videoUrl || "").trim();
  const title = String(ep.title || "");
  const thumbUrl = String(ep.thumbUrl || "");

  if (!contentId || !episodeNumber || episodeNumber < 1 || !videoUrl) {
    return res.status(400).json({ error: "BAD_INPUT" });
  }

  const item = await Content.findById(contentId);
  if (!item) return res.status(404).json({ error: "NOT_FOUND" });

  const dup = item.episodes.some((e) => Number(e.episodeNumber) === episodeNumber);
  if (dup) return res.status(409).json({ error: "DUP_EP" });

  item.episodes.push({ episodeNumber, title, videoUrl, thumbUrl });
  item.episodes.sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber));
  await item.save();

  res.json({ ok: true, episodesCount: item.episodes.length });
});

// pending tx list
router.get("/transactions", async (req, res) => {
  const status = String(req.query.status || "PENDING");
  const items = await Transaction.find({ status }).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ items });
});

// mark paid -> grant premium sesuai plan
router.post("/transaction/mark-paid", async (req, res) => {
  const txId = String(req.body.txId || "").trim();
  if (!txId) return res.status(400).json({ error: "BAD_INPUT" });

  const tx = await Transaction.findById(txId);
  if (!tx) return res.status(404).json({ error: "NOT_FOUND" });

  tx.status = "PAID";
  await tx.save();

  const user = await User.findById(tx.userId);
  if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

  const days = tx.plan === "premium_90d" ? 90 : 30;
  const base = user.premiumUntil && user.premiumUntil.getTime() > Date.now() ? user.premiumUntil : new Date();
  user.premiumUntil = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  await user.save();

  res.json({ ok: true });
});

// manual grant premium
router.post("/user/grant-premium", async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const days = Number(req.body.days || 30);
  if (!username || days < 1) return res.status(400).json({ error: "BAD_INPUT" });

  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: "NOT_FOUND" });

  const base = user.premiumUntil && user.premiumUntil.getTime() > Date.now() ? user.premiumUntil : new Date();
  user.premiumUntil = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  await user.save();

  res.json({ ok: true });
});

module.exports = router;