const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    plan: { type: String, enum: ["premium_30d", "premium_90d"], required: true },
    amountIDR: { type: Number, required: true },
    method: { type: String, enum: ["qris", "dana", "seabank"], required: true },
    status: { type: String, enum: ["PENDING", "PAID", "REJECTED"], default: "PENDING" },
    note: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", TransactionSchema);