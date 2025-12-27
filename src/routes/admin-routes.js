const router = require("express").Router();
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const requireAdmin = require("../middleware/requireAdmin");

router.use(requireAdmin);

// list tx (pending/paid/rejected) + username + bukti
router.get("/transactions", async (req, res) => {
  const status = String(req.query.status || "PENDING");
  const items = await Transaction.find({ status })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("userId", "username avatarUrl premiumUntil premiumActive")
    .lean();

  const mapped = items.map((t) => {
    const u = t.userId && typeof t.userId === "object" ? t.userId : null;
    return {
      ...t,
      user: u
        ? {
            _id: String(u._id),
            username: u.username,
            avatarUrl: u.avatarUrl || "",
            premiumActive: !!u.premiumActive,
            premiumUntil: u.premiumUntil || null
          }
        : { _id: String(t.userId), username: "", avatarUrl: "" },
      userId: u ? String(u._id) : String(t.userId)
    };
  });

  res.json({ items: mapped });
});

// daftar user ringkas buat admin
router.get("/users", async (req, res) => {
  const limit = Math.min(300, Math.max(10, parseInt(req.query.limit || "200", 10)));
  const items = await User.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("username avatarUrl premiumActive premiumUntil unlockedCount freeEpisodesLimit createdAt")
    .lean();
  res.json({ items });
});

// mark paid -> grant premium
router.post("/mark-paid", async (req, res) => {
  const { txId } = req.body || {};
  const tx = await Transaction.findById(txId);
  if (!tx) return res.status(404).json({ error: "TX not found" });
  if (tx.status !== "PENDING") return res.status(400).json({ error: "Not pending" });

  tx.status = "PAID";
  await tx.save();

  const user = await User.findById(tx.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const addDays = tx.plan === "premium_90d" ? 90 : 30;
  const now = new Date();
  const base = user.premiumUntil && user.premiumUntil > now ? user.premiumUntil : now;
  const until = new Date(base.getTime() + addDays * 24 * 60 * 60 * 1000);

  user.premiumActive = true;
  user.premiumUntil = until;
  await user.save();

  res.json({ ok: true, premiumUntil: until });
});

// manual grant
router.post("/grant", async (req, res) => {
  const { username, days } = req.body || {};
  const d = Math.max(1, Math.min(365, parseInt(days || 30)));
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: "User not found" });

  const now = new Date();
  const base = user.premiumUntil && user.premiumUntil > now ? user.premiumUntil : now;
  const until = new Date(base.getTime() + d * 24 * 60 * 60 * 1000);

  user.premiumActive = true;
  user.premiumUntil = until;
  await user.save();

  res.json({ ok: true, premiumUntil: until });
});

module.exports = router;