const mongoose = require("mongoose");

// Cache sederhana untuk response API eksternal (mis. TMDb)
// Supaya hemat rate limit dan lebih stabil.
const ExternalCacheSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

// TTL index: dokumen akan otomatis terhapus saat expiresAt lewat.
ExternalCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("ExternalCache", ExternalCacheSchema);