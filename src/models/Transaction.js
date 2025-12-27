const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    plan: { type: String, enum: ["premium_30d", "premium_90d"], required: true },
    amountIDR: { type: Number, required: true },
    method: { type: String, enum: ["qris", "dana", "seabank"], required: true },
    status: { type: String, enum: ["PENDING", "PAID", "REJECTED"], default: "PENDING" },

    // Bukti transaksi (opsional). Disarankan: kompres di browser → simpan DataURL kecil.
    proofDataUrl: { type: String, default: "" }, // contoh: data:image/jpeg;base64,...
    proofUrl: { type: String, default: "" },     // contoh: https://drive.google.com/...
    proofFileName: { type: String, default: "" },
    proofUploadedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", TransactionSchema);