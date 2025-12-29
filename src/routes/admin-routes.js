const express = require("express");
const router = express.Router();

const Content = require("../models/Content");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { attachUser, requireAdmin } = require("../middleware/auth");
const { autoMatchTmdb, TMDB_IMAGE_BASE } = require("./tmdb-routes");

router.use(attachUser);
router.use(requireAdmin);

router.get("/contents", async (_req, res) => {
  const items = await Content.find({}).sort({ createdAt: -1 }).limit(200).lean();
  res.json({
    items: items.map((x) => ({
      _id: x._id,
      title: x.title,
      type: x.type,
      episodesCount: (x.episodes || []).length
    }))
  });
});

router.post("/content", async (req, res) => {
  const title = String(req.body.title || "").trim();
  const type = String(req.body.type || "").trim();
  let coverUrl = String(req.body.coverUrl || "").trim();
  const synopsis = String(req.body.synopsis || "");
  const genres = String(req.body.genres || "")
    .split(",")
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);

  if (!title || !type) return res.status(400).json({ error: "BAD_INPUT" });

  let tmdb = { mediaType: "", id: 0 };
  let auto = null;
  try {
    if (process.env.TMDB_READ_TOKEN || process.env.TMDB_READ_ACCESS_TOKEN) {
      auto = await autoMatchTmdb(title);
      if (auto && auto.id && auto.mediaType) {
        tmdb = { mediaType: auto.mediaType, id: auto.id };
        if (!coverUrl && auto.poster_path) {
          coverUrl = `${TMDB_IMAGE_BASE}/w500${auto.poster_path}`;
        }
      }
    }
  } catch {
    // auto-match gagal: tetap lanjut create konten
  }

  const item = await Content.create({
    title,
    type,
    coverUrl: coverUrl || "",
    synopsis: synopsis || (auto && auto.overview ? auto.overview : ""),
    genres: genres.length ? genres : (auto && Array.isArray(auto.genres) ? auto.genres : []),
    tmdb,
    episodes: []
  });

  res.json({ ok: true, _id: item._id, tmdb, autoTitle: auto ? auto.title : "" });
});

router.post("/content/add-episode", async (req, res) => {
  const contentId = String(req.body.contentId || "").trim();
  const ep = req.body.episode || {};

  const episodeNumber = Number(ep.episodeNumber || 0);
  const videoUrl = String(ep.videoUrl || "").trim();
  const title = String(ep.title || "").trim();
  const thumbUrl = String(ep.thumbUrl || "").trim();

  if (!contentId || !episodeNumber || !videoUrl) return res.status(400).json({ error: "BAD_INPUT" });

  const item = await Content.findById(contentId);
  if (!item) return res.status(404).json({ error: "NOT_FOUND" });

  const exists = (item.episodes || []).some((e) => Number(e.episodeNumber) === episodeNumber);
  if (exists) return res.status(400).json({ error: "EP_EXISTS" });

  item.episodes.push({ episodeNumber, videoUrl, title, thumbUrl });
  item.episodes.sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber));
  await item.save();

  res.json({ ok: true });
});

router.get("/transactions", async (req, res) => {
  const status = String(req.query.status || "PENDING").toUpperCase();
  const q = status === "ALL" ? {} : { status };

  const items = await Transaction.find(q)
    .sort({ createdAt: -1 })
    .limit(300)
    .populate("userId", "username avatarUrl")
    .lean();

  res.json({ items });
});

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