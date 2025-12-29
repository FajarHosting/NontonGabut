const express = require("express");
const router = express.Router();

const ExternalCache = require("../models/ExternalCache");

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

function getToken() {
  const token = process.env.TMDB_READ_TOKEN || process.env.TMDB_READ_ACCESS_TOKEN || "";
  if (!token) throw new Error("TMDB_READ_TOKEN missing");
  return token;
}

function tmdbHeaders() {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${getToken()}`
  };
}

async function cacheGet(key) {
  const doc = await ExternalCache.findOne({ key }).lean();
  if (!doc) return null;
  if (doc.expiresAt && doc.expiresAt.getTime() <= Date.now()) return null;
  return doc.payload;
}

async function cacheSet(key, payload, ttlSeconds) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await ExternalCache.updateOne(
    { key },
    { $set: { key, payload, expiresAt } },
    { upsert: true }
  );
}

async function tmdbGet(path, params = {}) {
  const u = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  const r = await fetch(u.toString(), { headers: tmdbHeaders() });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j };
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarityScore(a, b) {
  const A = normalizeText(a).split(" ").filter(Boolean);
  const B = normalizeText(b).split(" ").filter(Boolean);
  if (!A.length || !B.length) return 0;
  const setA = new Set(A);
  const setB = new Set(B);
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  const union = new Set([...setA, ...setB]).size;
  return union ? inter / union : 0;
}

function pickBestResult(queryTitle, results) {
  const q = String(queryTitle || "").trim();
  let best = null;
  let bestScore = -1;
  for (const r of results || []) {
    if (r.media_type !== "tv" && r.media_type !== "movie") continue;
    const t = r.media_type === "tv" ? r.name : r.title;
    const s = similarityScore(q, t);
    const posterBias = r.poster_path ? 0.05 : 0;
    const score = s + posterBias;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (!best) {
    best = (results || []).find(x => x && (x.media_type === "tv" || x.media_type === "movie")) || null;
    bestScore = best ? 0 : -1;
  }
  return { best, bestScore };
}

// --- PUBLIC ENDPOINTS (dipanggil dari frontend) ---

router.get("/tmdb/regions", async (_req, res) => {
  try {
    const cacheKey = `tmdb:regions`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json({ ok: true, regions: cached, cached: true });

    const out = await tmdbGet("/watch/providers/regions");
    if (!out.ok) return res.status(out.status).json({ error: "TMDB_ERROR", detail: out.data });

    const regions = (out.data.results || []).map(r => ({ iso_3166_1: r.iso_3166_1, english_name: r.english_name }));
    await cacheSet(cacheKey, regions, 7 * 24 * 60 * 60);
    return res.json({ ok: true, regions, cached: false });
  } catch (e) {
    return res.status(500).json({ error: "SERVER_ERROR", detail: String(e.message || e) });
  }
});

router.get("/tmdb/search", async (req, res) => {
  try {
    const query = String(req.query.query || "").trim();
    const page = Number(req.query.page || 1);
    const region = String(req.query.region || process.env.TMDB_DEFAULT_REGION || "US").toUpperCase();
    if (!query) return res.status(400).json({ error: "QUERY_REQUIRED" });

    const cacheKey = `tmdb:search:${region}:${page}:${normalizeText(query)}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json({ ok: true, ...cached, cached: true });

    const out = await tmdbGet("/search/multi", {
      query,
      page,
      include_adult: "false",
      region
    });
    if (!out.ok) return res.status(out.status).json({ error: "TMDB_ERROR", detail: out.data });

    const results = (out.data.results || [])
      .filter(x => x && (x.media_type === "tv" || x.media_type === "movie"))
      .map(x => ({
        mediaType: x.media_type,
        tmdbId: x.id,
        title: x.media_type === "tv" ? x.name : x.title,
        originalTitle: x.media_type === "tv" ? x.original_name : x.original_title,
        overview: x.overview || "",
        year: (x.media_type === "tv" ? (x.first_air_date || "").slice(0,4) : (x.release_date || "").slice(0,4)) || "",
        posterUrl: x.poster_path ? `${TMDB_IMAGE_BASE}/w500${x.poster_path}` : "",
        backdropUrl: x.backdrop_path ? `${TMDB_IMAGE_BASE}/w780${x.backdrop_path}` : ""
      }));

    const payload = { results, page: out.data.page, totalPages: out.data.total_pages };
    await cacheSet(cacheKey, payload, 24 * 60 * 60);
    return res.json({ ok: true, ...payload, cached: false });
  } catch (e) {
    return res.status(500).json({ error: "SERVER_ERROR", detail: String(e.message || e) });
  }
});

router.get("/tmdb/providers", async (req, res) => {
  try {
    const mediaType = String(req.query.mediaType || "").trim(); // tv|movie
    const tmdbId = String(req.query.tmdbId || "").trim();
    const region = String(req.query.region || process.env.TMDB_DEFAULT_REGION || "US").toUpperCase();

    if (!tmdbId || (mediaType !== "tv" && mediaType !== "movie")) {
      return res.status(400).json({ error: "BAD_INPUT" });
    }

    const cacheKey = `tmdb:providers:${mediaType}:${tmdbId}:${region}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json({ ok: true, ...cached, cached: true });

    const out = await tmdbGet(`/${mediaType}/${tmdbId}/watch/providers`);
    if (!out.ok) return res.status(out.status).json({ error: "TMDB_ERROR", detail: out.data });

    const byRegion = (out.data.results || {})[region] || null;
    const normalized = {
      region,
      link: byRegion?.link || "",
      providers: {
        flatrate: byRegion?.flatrate || [],
        rent: byRegion?.rent || [],
        buy: byRegion?.buy || []
      }
    };

    await cacheSet(cacheKey, normalized, 6 * 60 * 60);
    return res.json({ ok: true, ...normalized, cached: false });
  } catch (e) {
    return res.status(500).json({ error: "SERVER_ERROR", detail: String(e.message || e) });
  }
});

// --- INTERNAL HELPER (dipakai admin-routes) ---

async function autoMatchTmdb(title) {
  const query = String(title || "").trim();
  if (!query) return null;

  const out = await tmdbGet("/search/multi", {
    query,
    page: 1,
    include_adult: "false",
    region: process.env.TMDB_DEFAULT_REGION || "US"
  });
  if (!out.ok) return null;

  const { best } = pickBestResult(query, out.data.results || []);
  if (!best) return null;

  const mediaType = best.media_type;
  const tmdbId = best.id;

  const detail = await tmdbGet(`/${mediaType}/${tmdbId}`, { language: "en-US" });
  if (!detail.ok) {
    return {
      mediaType,
      id: tmdbId,
      title: mediaType === "tv" ? best.name : best.title,
      overview: best.overview || "",
      poster_path: best.poster_path || "",
      genres: []
    };
  }

  return {
    mediaType,
    id: tmdbId,
    title: detail.data.name || detail.data.title || (mediaType === "tv" ? best.name : best.title),
    overview: detail.data.overview || "",
    poster_path: detail.data.poster_path || best.poster_path || "",
    genres: Array.isArray(detail.data.genres) ? detail.data.genres.map(g => String(g.name || "").trim().toLowerCase()).filter(Boolean) : []
  };
}

module.exports = { router, autoMatchTmdb, TMDB_IMAGE_BASE };