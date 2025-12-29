const mongoose = require("mongoose");

const EpisodeSchema = new mongoose.Schema(
  {
    episodeNumber: { type: Number, required: true },
    title: { type: String, default: "" },

    // Backward-compatible:
    // - If videoProvider === "url": use videoUrl (mp4/drive/embed/iframe src)
    // - If videoProvider === "vimeo": use vimeoId (numeric id) and ignore videoUrl
    videoProvider: { type: String, enum: ["url", "vimeo"], default: "url" },
    videoUrl: { type: String, default: "" },
    vimeoId: { type: String, default: "" },

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