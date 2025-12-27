const express = require("express");
const Transaction = require("../models/Transaction");
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
    imageUrl: "https://i.imgur.com/5b1HcQh.png",
    text: "Scan QRIS untuk membayar. Setelah transfer, upload bukti di riwayat transaksi (PENDING)."
  },
  dana: {
    title: "DANA",
    imageUrl: "https://i.imgur.com/6c4vJzJ.png",
    text: "Transfer via DANA. Setelah transfer, upload bukti di riwayat transaksi (PENDING)."
  },
  seabank: {
    title: "SeaBank",
    imageUrl: "https://i.imgur.com/0b8d7d4.png",
    text: "Transfer via SeaBank. Setelah transfer, upload bukti di riwayat transaksi (PENDING)."
  }
};

// list plan untuk UI (kalau dipakai)
router.get("/plans", requireLogin, async (_req, res) => {
  res.json({
    plans: [
      { code: "premium_30d", label: "Premium 30 Hari", price: PRICES.premium_30d },
      { code: "premium_90d", label: "Premium 90 Hari", price: PRICES.premium_90d }
    ],
    methods: ["qris", "dana", "seabank"]
  });
});

// buat transaksi pembayaran
router.post("/create", requireLogin, async (req, res) => {
  const plan = String(req.body.plan || "").trim();
  const method = String(req.body.method || "").trim();

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

// riwayat transaksi user
router.get("/my-transactions", requireLogin, async (req, res) => {
  const items = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

function isValidHttpUrl(s) {
  try {
    const u = new URL(String(s));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// upload bukti transfer (foto kompres/dataURL atau link)
router.post("/proof", requireLogin, async (req, res) => {
  const txId = String(req.body.txId || "").trim();
  const proofDataUrl = String(req.body.proofDataUrl || "");
  const proofUrl = String(req.body.proofUrl || "").trim();
  const proofFileName = String(req.body.proofFileName || "").trim();
  const proofMime = String(req.body.proofMime || "").trim();

  if (!txId) return res.status(400).json({ error: "BAD_INPUT" });

  const tx = await Transaction.findById(txId);
  if (!tx) return res.status(404).json({ error: "NOT_FOUND" });
  if (String(tx.userId) !== String(req.user._id)) return res.status(403).json({ error: "FORBIDDEN" });
  if (tx.status !== "PENDING") return res.status(400).json({ error: "ONLY_PENDING" });

  const hasData = proofDataUrl && proofDataUrl.startsWith("data:image/");
  const hasUrl = proofUrl && isValidHttpUrl(proofUrl);

  if (!hasData && !hasUrl) return res.status(400).json({ error: "PROOF_REQUIRED" });

  if (hasData) {
    // hard limit ~1MB supaya aman di serverless
    const b64 = String(proofDataUrl).split(",")[1] || "";
    const approxBytes = Math.floor((b64.length * 3) / 4);
    if (approxBytes > 1050000) return res.status(400).json({ error: "PROOF_TOO_LARGE" });

    tx.proofDataUrl = proofDataUrl;
    tx.proofFileName = proofFileName;
    tx.proofMime = proofMime;
  }

  if (hasUrl) {
    tx.proofUrl = proofUrl;
  }

  tx.proofUploadedAt = new Date();
  await tx.save();

  res.json({ ok: true });
});

module.exports = router;