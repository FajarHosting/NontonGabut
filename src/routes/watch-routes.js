const express = require("express");
const Content = require("../models/Content");
const User = require("../models/User");
const { attachUser, requireLogin } = require("../middleware/auth");

const router = express.Router();
router.use(attachUser);

// Policy:
// - If user premium: all episodes unlocked
// - Else: episode 1..10 free
// - Else: must unlock by "watch ad" per episode (store unlockedEpisodes)
router.get("/can-watch", requireLogin, async (req, res) => {
  const contentId = String(req.query.contentId || "");
  const episode = Number(req.query.episode || 1);

  const content = await Content.findById(contentId).lean();
  if (!content) return res.status(404).json({ error: "NOT_FOUND" });

  const ep = (content.episodes || []).find((e) => e.episodeNumber === episode);
  if (!ep) return res.status(404).json({ error: "EPISODE_NOT_FOUND" });

  const user = await User.findById(req.user._id);

  if (user.isPremiumActive()) {
    return res.json({ allowed: true, reason: "PREMIUM", videoUrl: ep.videoUrl, title: content.title });
  }

  if (episode <= user.freeEpisodesLimit) {
    return res.json({ allowed: true, reason: "FREE", videoUrl: ep.videoUrl, title: content.title });
  }

  const unlocked = (user.unlockedEpisodes || []).some(
    (u) => String(u.contentId) === String(content._id) && u.episode === episode
  );

  if (unlocked) {
    return res.json({ allowed: true, reason: "AD_UNLOCKED", videoUrl: ep.videoUrl, title: content.title });
  }

  return res.json({ allowed: false, reason: "LOCKED" });
});

// Mark unlocked after ad simulation
router.post("/unlock-by-ad", requireLogin, async (req, res) => {
  const contentId = String(req.body.contentId || "");
  const episode = Number(req.body.episode || 1);

  const content = await Content.findById(contentId).lean();
  if (!content) return res.status(404).json({ error: "NOT_FOUND" });

  const epExists = (content.episodes || []).some((e) => e.episodeNumber === episode);
  if (!epExists) return res.status(404).json({ error: "EPISODE_NOT_FOUND" });

  const user = await User.findById(req.user._id);

  if (user.isPremiumActive()) return res.json({ ok: true, already: "PREMIUM" });
  if (episode <= user.freeEpisodesLimit) return res.json({ ok: true, already: "FREE" });

  const exists = (user.unlockedEpisodes || []).some(
    (u) => String(u.contentId) === String(contentId) && u.episode === episode
  );
  if (!exists) {
    user.unlockedEpisodes.push({ contentId, episode, unlockedAt: new Date() });
    await user.save();
  }
  res.json({ ok: true });
});

module.exports = router;