const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, index: true, required: true, trim: true },
    passwordHash: { type: String, required: true },

    isAdmin: { type: Boolean, default: false },

    // Premium
    premiumUntil: { type: Date, default: null },

    // Free episode policy (per account)
    freeEpisodesLimit: { type: Number, default: 10 },

    // Track unlocks via "watch ad" (episode-level unlock)
    unlockedEpisodes: [
      {
        contentId: { type: mongoose.Schema.Types.ObjectId, ref: "Content" },
        episode: Number,
        unlockedAt: Date
      }
    ]
  },
  { timestamps: true }
);

UserSchema.methods.isPremiumActive = function () {
  return this.premiumUntil && this.premiumUntil.getTime() > Date.now();
};

module.exports = mongoose.model("User", UserSchema);