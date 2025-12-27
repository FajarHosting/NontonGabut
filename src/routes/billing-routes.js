const router = require("express").Router();
const Transaction = require("../models/Transaction");
const requireLogin = require("../middleware/requireLogin");

const PAYMENT_ASSETS = {
  qris: {
    title: "QRIS",
    imageUrl:
      "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?q=80&w=600&auto=format&fit=crop",
    text: "Scan QRIS, lalu upload bukti transaksi di Profile."
  },
  dana: {
    title: "DANA",
    imageUrl:
      "https://images.unsplash.com/photo-1556742393-d75f468bfcb0?q=80&w=600&auto=format&fit=crop",
    text: "Transfer via DANA, lalu upload bukti transaksi di Profile."
  },
  seabank: {
    title: "SeaBank",
    imageUrl:
      "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?q=80&w=600&auto=format&fit=crop",
    text: "Transfer via SeaBank, lalu upload bukti transaksi di Profile."
  }
};

const AMOUNT = {
  premium_30d: 15000,
  premium_90d: 40000
};

function isValidHttpUrl(s) {
  try {
    const u = new URL(String(s));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

router.post("/create", requireLogin, async (req, res) => {
  const { plan, method } = req.body || {};
  if (!AMOUNT[plan]) return res.status(400).json({ error: "Plan tidak valid." });
  if (!PAYMENT_ASSETS[method]) return res.status(400).json({ error: "Metode pembayaran tidak valid." });

  const tx = await Transaction.create({
    userId: req.user._id,
    plan,
    method,
    amountIDR: AMOUNT[plan],
    status: "PENDING"
  });

  res.json({ ok: true, txId: tx._id, payment: PAYMENT_ASSETS[method] });
});

// user upload / kirim bukti transaksi
// NOTE: untuk Vercel + MongoDB, cara paling stabil adalah simpan sebagai DataURL kecil (hasil kompres di browser)
router.post("/proof", requireLogin, async (req, res) => {
  const { txId, proofDataUrl, proofUrl, proofFileName } = req.body || {};
  if (!txId) return res.status(400).json({ error: "txId wajib." });

  const tx = await Transaction.findById(txId);
  if (!tx) return res.status(404).json({ error: "Transaksi tidak ditemukan." });
  if (String(tx.userId) !== String(req.user._id)) return res.status(403).json({ error: "Tidak punya akses transaksi ini." });
  if (tx.status !== "PENDING") return res.status(400).json({ error: "Hanya transaksi PENDING yang bisa upload bukti." });

  const d = String(proofDataUrl || "");
  const u = String(proofUrl || "").trim();

  const hasData = d.startsWith("data:image/");
  const hasUrl = u.length ? isValidHttpUrl(u) : false;

  if (!hasData && !hasUrl) {
    return res.status(400).json({ error: "Bukti wajib: upload gambar atau isi link bukti." });
  }

  if (hasData) {
    // batas aman: ~1MB
    const b64 = d.split(",")[1] || "";
    const approxBytes = Math.floor((b64.length * 3) / 4);
    if (approxBytes > 1_050_000) {
      return res.status(400).json({ error: "Ukuran bukti terlalu besar. Kompres gambarnya dulu (≤ ~1MB)." });
    }
    tx.proofDataUrl = d;
  }

  if (hasUrl) tx.proofUrl = u;
  tx.proofFileName = String(proofFileName || "");
  tx.proofUploadedAt = new Date();

  await tx.save();
  res.json({ ok: true });
});

module.exports = router;