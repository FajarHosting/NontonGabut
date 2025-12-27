const express = require("express");
const Content = require("../models/Content");
const User = require("../models/User");
const { attachUser, requireLogin } = require("../middleware/auth");

const router = express.Router();
router.use(attachUser);

// cek boleh nonton episode
router.get("/can-watch", requireLogin, async (req, res) => {
  const contentId = String(req.query.contentId || "").trim();
  const episode = Number(req.query.episode || 1);

  const content = await Content.findById(contentId).lean();
  if (!content) return res.status(404).json({ error: "CONTENT_NOT_FOUND" });

  const epExists = (content.episodes || []).some((e) => Number(e.episodeNumber) === episode);
  if (!epExists) return res.status(404).json({ error: "EPISODE_NOT_FOUND" });

  const user = await User.findById(req.user._id);

  if (user.isPremiumActive()) return res.json({ ok: true, mode: "PREMIUM" });
  if (episode <= user.freeEpisodesLimit) return res.json({ ok: true, mode: "FREE" });

  const unlocked = (user.unlockedEpisodes || []).some(
    (u) => String(u.contentId) === String(contentId) && Number(u.episode) === episode
  );

  if (unlocked) return res.json({ ok: true, mode: "AD_UNLOCKED" });
  return res.status(403).json({ error: "LOCKED", mode: "LOCKED" });
});

// unlock via "iklan"
router.post("/unlock-ad", requireLogin, async (req, res) => {
  const contentId = String(req.body.contentId || "").trim();
  const episode = Number(req.body.episode || 1);

  if (!contentId || !episode) return res.status(400).json({ error: "BAD_INPUT" });

  const content = await Content.findById(contentId).lean();
  if (!content) return res.status(404).json({ error: "CONTENT_NOT_FOUND" });

  const epExists = (content.episodes || []).some((e) => Number(e.episodeNumber) === episode);
  if (!epExists) return res.status(404).json({ error: "EPISODE_NOT_FOUND" });

  const user = await User.findById(req.user._id);
  if (user.isPremiumActive()) return res.json({ ok: true, mode: "PREMIUM" });

  if (episode <= user.freeEpisodesLimit) return res.json({ ok: true, mode: "FREE" });

  const exists = user.unlockedEpisodes.some(
    (u) => String(u.contentId) === String(contentId) && Number(u.episode) === episode
  );
  if (!exists) {
    user.unlockedEpisodes.push({ contentId, episode, unlockedAt: new Date() });
    await user.save();
  }

  return res.json({ ok: true, mode: "AD_UNLOCKED" });
});

// log history (dipanggil dari watch page)
router.post("/log", requireLogin, async (req, res) => {
  const contentId = String(req.body.contentId || "").trim();
  const episode = Number(req.body.episode || 1);

  const content = await Content.findById(contentId).lean();
  if (!content) return res.status(404).json({ error: "CONTENT_NOT_FOUND" });

  const user = await User.findById(req.user._id);

  const entry = {
    contentId,
    title: content.title,
    coverUrl: content.coverUrl || "",
    episode,
    watchedAt: new Date()
  };

  // hapus duplikat contentId biar yang terbaru di atas
  user.watchHistory = (user.watchHistory || []).filter((h) => String(h.contentId) !== String(contentId));
  user.watchHistory.unshift(entry);

  // batas 50 item
  user.watchHistory = user.watchHistory.slice(0, 50);
  await user.save();

  res.json({ ok: true });
});

router.get("/history", requireLogin, async (req, res) => {
  const user = await User.findById(req.user._id).lean();
  res.json({ items: user.watchHistory || [] });
});

module.exports = router;