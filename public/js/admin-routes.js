// Add episode (append) to existing content
router.post("/content/add-episode", async (req, res) => {
  try {
    const contentId = String(req.body.contentId || "").trim();
    const episode = req.body.episode || {};

    const epNum = Number(episode.episodeNumber);
    const videoUrl = String(episode.videoUrl || "").trim();

    if (!contentId || !epNum || epNum < 1 || !videoUrl) {
      return res.status(400).json({ error: "BAD_INPUT" });
    }

    const item = await Content.findById(contentId);
    if (!item) return res.status(404).json({ error: "NOT_FOUND" });

    const exists = (item.episodes || []).some(e => Number(e.episodeNumber) === epNum);
    if (exists) return res.status(409).json({ error: "DUP_EP" });

    item.episodes = item.episodes || [];
    item.episodes.push({
      episodeNumber: epNum,
      title: String(episode.title || ""),
      videoUrl,
      thumbUrl: String(episode.thumbUrl || "")
    });

    // sort by episodeNumber
    item.episodes.sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber));

    await item.save();
    return res.json({ ok: true, episodesCount: item.episodes.length });
  } catch (e) {
    return res.status(500).json({ error: "SERVER_ERROR", message: String(e.message || e) });
  }
});