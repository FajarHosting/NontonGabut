const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const { attachUser, requireLogin } = require("../middleware/auth");

router.use(attachUser);

router.get("/", requireLogin, async (req, res) => {
  const u = await User.findById(req.user._id).lean();
  const tx = await Transaction.find({ userId: u._id }).sort({ createdAt: -1 }).limit(50).lean();

  res.json({
    user: {
      username: u.username,
      avatarUrl: u.avatarUrl || "",
      isAdmin: u.isAdmin,
      premiumUntil: u.premiumUntil,
      premiumActive: u.premiumUntil && new Date(u.premiumUntil).getTime() > Date.now(),
      freeEpisodesLimit: u.freeEpisodesLimit,
      unlockedCount: (u.unlockedEpisodes || []).length,
      createdAt: u.createdAt
    },
    transactions: tx
  });
});

router.post("/avatar", requireLogin, async (req, res) => {
  const url = String(req.body.avatarUrl || "").trim();
  if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: "BAD_URL" });

  await User.updateOne({ _id: req.user._id }, { avatarUrl: url });
  res.json({ ok: true, avatarUrl: url });
});

module.exports = router;