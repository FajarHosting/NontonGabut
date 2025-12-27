const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    plan: { type: String, enum: ["premium_3b", "premium_12b"], required: true },
    amountIDR: { type: Number, required: true },
    method: { type: String, enum: ["qris", "dana", "seabank"], required: true },
    status: { type: String, enum: ["PENDING", "PAID", "REJECTED"], default: "PENDING" },
    note: { type: String, default: "" },

    // Bukti transfer (opsional): foto (dataURL kompres) / link.
    proofDataUrl: { type: String, default: "" },
    proofUrl: { type: String, default: "" },
    proofFileName: { type: String, default: "" },
    proofMime: { type: String, default: "" },
    proofUploadedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Serverless warm reuse (Vercel): hindari OverwriteModelError
module.exports = mongoose.models.Transaction || mongoose.model("Transaction", TransactionSchema);