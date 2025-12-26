const express = require("express");
const Content = require("../models/Content");
const { attachUser } = require("../middleware/auth");

const router = express.Router();
router.use(attachUser);

// List + search + filter
router.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const type = String(req.query.type || "").trim();
  const genre = String(req.query.genre || "").trim();

  const filter = {};
  if (type) filter.type = type;
  if (genre) filter.genres = genre;
  if (q) filter.title = { $regex: q, $options: "i" };

  const items = await Content.find(filter)
    .sort({ updatedAt: -1 })
    .select("type title synopsis genres coverUrl episodes")
    .lean();

  // return only episode counts
  const shaped = items.map((x) => ({
    _id: x._id,
    type: x.type,
    title: x.title,
    synopsis: x.synopsis,
    genres: x.genres,
    coverUrl: x.coverUrl,
    episodeCount: (x.episodes || []).length
  }));

  res.json({ items: shaped });
});

// Detail
router.get("/:id", async (req, res) => {
  const item = await Content.findById(req.params.id).lean();
  if (!item) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ item });
});

module.exports = router;