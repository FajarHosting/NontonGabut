const express = require("express");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { attachUser, requireLogin } = require("../middleware/auth");

const router = express.Router();
router.use(attachUser);

const PRICES = {
  premium_30d: 25000,
  premium_90d: 60000
};

const PAYMENT_ASSETS = {
  qris: {
    title: "QRIS",
    imageUrl: "https://img1.pixhost.to/images/11120/673863920_deomedia.jpg&text=QRIS+IMAGE+PLACEHOLDER",
    text: "Scan QRIS di atas (placeholder)."
  },
  dana: {
    title: "DANA",
    imageUrl: "https://img1.pixhost.to/images/11182/674949547_deomedia.jpg&text=DANA+QR+PLACEHOLDER",
    text: "DANA: 085179732934 (placeholder)."
  },
  seabank: {
    title: "SeaBank",
    imageUrl: "https://dummyimage.com/800x800/111a33/ffffff.png&text=SEABANK+PLACEHOLDER",
    text: "SeaBank: 901341746638 (placeholder)."
  }
};

router.get("/plans", (_req, res) => {
  res.json({
    plans: [
      { id: "premium_30d", label: "Premium 30 hari", price: PRICES.premium_30d },
      { id: "premium_90d", label: "Premium 90 hari", price: PRICES.premium_90d }
    ]
  });
});

router.post("/create", requireLogin, async (req, res) => {
  const plan = String(req.body.plan || "");
  const method = String(req.body.method || "");

  if (!PRICES[plan]) return res.status(400).json({ error: "BAD_PLAN" });
  if (!PAYMENT_ASSETS[method]) return res.status(400).json({ error: "BAD_METHOD" });

  const tx = await Transaction.create({
    userId: req.user._id,
    plan,
    amountIDR: PRICES[plan],
    method,
    status: "PENDING"
  });

  res.json({ ok: true, txId: tx._id, payment: PAYMENT_ASSETS[method] });
});

router.get("/my-transactions", requireLogin, async (req, res) => {
  const items = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

module.exports = router;