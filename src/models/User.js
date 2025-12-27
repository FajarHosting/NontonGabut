const mongoose = require("mongoose");

const UnlockedSchema = new mongoose.Schema(
  {
    contentId: { type: mongoose.Schema.Types.ObjectId, ref: "Content" },
    episode: { type: Number, required: true },
    unlockedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const HistorySchema = new mongoose.Schema(
  {
    contentId: { type: mongoose.Schema.Types.ObjectId, ref: "Content" },
    title: { type: String, default: "" },
    coverUrl: { type: String, default: "" },
    episode: { type: Number, default: 1 },
    watchedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, index: true, required: true, trim: true },
    passwordHash: { type: String, required: true },

    isAdmin: { type: Boolean, default: false },

    avatarUrl: { type: String, default: "" },

    premiumUntil: { type: Date, default: null },

    freeEpisodesLimit: { type: Number, default: 10 },

    unlockedEpisodes: { type: [UnlockedSchema], default: [] },

    watchHistory: { type: [HistorySchema], default: [] }
  },
  { timestamps: true }
);

UserSchema.methods.isPremiumActive = function () {
  return this.premiumUntil && this.premiumUntil.getTime() > Date.now();
};

module.exports = mongoose.model("User", UserSchema);