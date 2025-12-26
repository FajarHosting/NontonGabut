const mongoose = require("mongoose");

const EpisodeSchema = new mongoose.Schema(
  {
    episodeNumber: { type: Number, required: true },
    title: { type: String, default: "" },
    // URL video legal (milik sendiri / berlisensi)
    videoUrl: { type: String, required: true },
    // thumbnail optional per episode
    thumbUrl: { type: String, default: "" }
  },
  { _id: false }
);

const ContentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["anime", "donghua", "drakor", "dracin"], required: true },
    title: { type: String, required: true, index: true },
    synopsis: { type: String, default: "" },
    genres: { type: [String], default: [], index: true },
    coverUrl: { type: String, default: "" },
    episodes: { type: [EpisodeSchema], default: [] }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Content", ContentSchema);