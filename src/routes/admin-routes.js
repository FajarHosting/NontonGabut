const express = require("express");
const router = express.Router();

const Content = require("../models/Content");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { attachUser, requireAdmin } = require("../middleware/auth");

router.use(attachUser);
router.use(requireAdmin);

function normalizeProvider(p) {
  const s = String(p || "").trim().toLowerCase();
  return s === "vimeo" ? "vimeo" : "url";
}
function cleanVimeoId(id) {
  const v = String(id || "").trim();
  if (!v) return "";
  if (!/^[0-9]+$/.test(v)) return "__INVALID__";
  return v;
}

// list konten untuk dropdown admin
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

  const item = await Content.create({
    title,
    type,
    coverUrl,
    synopsis,
    genres,
    episodes: []
  });

  res.json({ ok: true, _id: item._id });
});

// tambah episode ke film yang sudah ada (tanpa bikin film baru)
router.post("/content/add-episode", async (req, res) => {
  const contentId = String(req.body.contentId || "").trim();
  const ep = req.body.episode || {};

  const episodeNumber = Number(ep.episodeNumber || 0);
  const title = String(ep.title || "").trim();
  const thumbUrl = String(ep.thumbUrl || "").trim();

  const videoProvider = normalizeProvider(ep.videoProvider);
  const vimeoId = cleanVimeoId(ep.vimeoId);
  const videoUrl = String(ep.videoUrl || "").trim();

  if (!contentId || !episodeNumber) return res.status(400).json({ error: "BAD_INPUT" });

  if (videoProvider === "vimeo") {
    if (!vimeoId || vimeoId === "__INVALID__") return res.status(400).json({ error: "BAD_VIMEO_ID" });
  } else {
    if (!videoUrl) return res.status(400).json({ error: "BAD_INPUT" });
  }

  const item = await Content.findById(contentId);
  if (!item) return res.status(404).json({ error: "NOT_FOUND" });

  // prevent duplicate EP number
  const exists = (item.episodes || []).some((e) => Number(e.episodeNumber) === episodeNumber);
  if (exists) return res.status(400).json({ error: "EP_EXISTS" });

  item.episodes.push({
    episodeNumber,
    title,
    thumbUrl,
    videoProvider,
    vimeoId: videoProvider === "vimeo" ? vimeoId : "",
    videoUrl: videoProvider === "url" ? videoUrl : ""
  });

  // sort by episodeNumber
  item.episodes.sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber));
  await item.save();

  res.json({ ok: true });
});

// update episode (admin set Vimeo ID / ganti URL / ganti judul/thumb)
router.post("/content/update-episode", async (req, res) => {
  const contentId = String(req.body.contentId || "").trim();
  const episodeNumber = Number(req.body.episodeNumber || 0);

  const title = String(req.body.title || "").trim();
  const thumbUrl = String(req.body.thumbUrl || "").trim();

  const videoProvider = normalizeProvider(req.body.videoProvider);
  const vimeoId = cleanVimeoId(req.body.vimeoId);
  const videoUrl = String(req.body.videoUrl || "").trim();

  if (!contentId || !episodeNumber) return res.status(400).json({ error: "BAD_INPUT" });

  if (videoProvider === "vimeo") {
    if (!vimeoId || vimeoId === "__INVALID__") return res.status(400).json({ error: "BAD_VIMEO_ID" });
  } else {
    if (!videoUrl) return res.status(400).json({ error: "BAD_INPUT" });
  }

  const item = await Content.findById(contentId);
  if (!item) return res.status(404).json({ error: "NOT_FOUND" });

  const idx = (item.episodes || []).findIndex((e) => Number(e.episodeNumber) === episodeNumber);
  if (idx < 0) return res.status(404).json({ error: "EPISODE_NOT_FOUND" });

  const old = item.episodes[idx];
  old.title = title || old.title || "";
  old.thumbUrl = thumbUrl || old.thumbUrl || "";
  old.videoProvider = videoProvider;
  old.vimeoId = videoProvider === "vimeo" ? vimeoId : "";
  old.videoUrl = videoProvider === "url" ? videoUrl : "";

  item.episodes.sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber));
  await item.save();

  res.json({ ok: true });
});

// transaksi (pending/paid/rejected). query: ?status=PENDING|PAID|REJECTED|ALL
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