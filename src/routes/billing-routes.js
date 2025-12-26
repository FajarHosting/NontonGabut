const express = require("express");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { attachUser, requireLogin } = require("../middleware/auth");

const router = express.Router();
router.use(attachUser);

// Price table (editable)
const PRICES = {
  premium_30d: 25000,
  premium_90d: 60000
};

router.get("/plans", (_req, res) => {
  res.json({
    plans: [
      { code: "premium_30d", label: "Premium 30 Hari", amountIDR: PRICES.premium_30d },
      { code: "premium_90d", label: "Premium 90 Hari", amountIDR: PRICES.premium_90d }
    ],
    methods: ["qris", "dana", "seabank"]
  });
});

// Create checkout (mock)
router.post("/checkout", requireLogin, async (req, res) => {
  const plan = String(req.body.plan || "");
  const method = String(req.body.method || "");
  if (!PRICES[plan]) return res.status(400).json({ error: "INVALID_PLAN" });
  if (!["qris", "dana", "seabank"].includes(method)) return res.status(400).json({ error: "INVALID_METHOD" });

  const tx = await Transaction.create({
    userId: req.user._id,
    plan,
    amountIDR: PRICES[plan],
    method,
    status: "PENDING"
  });

  // Payment UI assets (placeholder links) — ganti dengan aset legal Anda sendiri
  const paymentAssets = {
    qris: {
      title: "QRIS",
      instructions: "Scan QRIS (contoh placeholder). Setelah bayar, tunggu admin verifikasi.",
      imageUrl: "https://img1.pixhost.to/images/11120/673863920_deomedia.jpg"
    },
    dana: {
      title: "DANA",
      instructions: "Transfer ke nomor DANA (placeholder). Setelah bayar, tunggu admin verifikasi.",
      text: "DANA: 085179732934 (placeholder)"
    },
    seabank: {
      title: "SeaBank",
      instructions: "Transfer SeaBank (placeholder). Setelah bayar, tunggu admin verifikasi.",
      text: "SeaBank VA/No Rek: 901341746638 (placeholder)"
    }
  };

  res.json({ ok: true, txId: tx._id, payment: paymentAssets[method] });
});

router.get("/my-transactions", requireLogin, async (req, res) => {
  const items = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

// When admin marks PAID, premium will be granted via admin route.

module.exports = router;