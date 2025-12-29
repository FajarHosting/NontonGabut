function qs(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

async function getJSON(u) {
  const r = await fetch(u);
  const j = await r.json();
  if (!r.ok) throw j;
  return j;
}
async function postJSON(u, body) {
  const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw j;
  return j;
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function extractDriveId(url) {
  try {
    const u = new URL(String(url));
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (m && m[1]) return m[1];
    const id = u.searchParams.get("id");
    if (id) return id;
  } catch {}
  const mm = String(url || "").match(/\/file\/d\/([^/]+)/);
  return mm && mm[1] ? mm[1] : null;
}
function driveDirectUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
function drivePreviewUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

function openFrame(url) {
  window.open(String(url), "_blank", "noopener");
}
function fsFrame() {
  const el = document.getElementById("playerVideo") || document.getElementById("playerIframe");
  if (!el) return;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
}

function renderPlayer(url) {
  const raw = String(url || "").trim();
  const driveId = extractDriveId(raw);

  if (driveId) {
    const direct = driveDirectUrl(driveId);
    const preview = drivePreviewUrl(driveId);
    return `
      <div class="playerFrame">
        <video id="playerVideo" controls playsinline preload="metadata"
          src="${esc(direct)}" data-fallback="${esc(preview)}"></video>
        <div class="frameActions" id="frameActions" style="display:none">
          <button class="miniBtn" onclick="openFrame('${esc(preview)}')">Open</button>
          <button class="miniBtn" onclick="fsFrame()">Full</button>
        </div>
      </div>
    `;
  }

  const isVideo = /\.(mp4|webm|m3u8)(\?|$)/i.test(raw);
  if (isVideo) {
    return `
      <div class="playerFrame">
        <video id="playerVideo" controls playsinline preload="metadata" src="${esc(raw)}"></video>
        <div class="frameActions" id="frameActions" style="display:none">
          <button class="miniBtn" onclick="openFrame('${esc(raw)}')">Open</button>
          <button class="miniBtn" onclick="fsFrame()">Full</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="playerFrame">
      <iframe id="playerIframe" src="${esc(raw)}"
        allow="autoplay; fullscreen; picture-in-picture"
        allowfullscreen></iframe>
      <div class="frameActions" id="frameActions">
        <button class="miniBtn" onclick="openFrame('${esc(raw)}')">Open</button>
        <button class="miniBtn" onclick="fsFrame()">Full</button>
      </div>
    </div>
  `;
}

function setupPlayerFallback() {
  const v = document.getElementById("playerVideo");
  if (!v) return;

  const fb = v.getAttribute("data-fallback");
  v.addEventListener("error", () => {
    if (!fb) return;
    const playerBox = document.getElementById("playerBox");
    if (!playerBox) return;
    playerBox.innerHTML = `
      <div class="playerFrame">
        <iframe id="playerIframe" src="${esc(fb)}"
          allow="autoplay; fullscreen; picture-in-picture"
          allowfullscreen></iframe>
        <div class="frameActions" id="frameActions">
          <button class="miniBtn" onclick="openFrame('${esc(fb)}')">Open</button>
          <button class="miniBtn" onclick="fsFrame()">Full</button>
        </div>
      </div>
    `;
  });
}

function epBtnHTML(id, ep, active) {
  return `<button class="epBtn ${active ? "active" : ""}" onclick="location.href='/watch?id=${id}&ep=${ep}'">EP ${ep}</button>`;
}

// --- TMDb Providers (Platform Resmi) ---
const TMDB_LOGO_BASE = "https://image.tmdb.org/t/p/w45";

function providerPill(p) {
  const logo = p.logo_path ? `<img src="${TMDB_LOGO_BASE}${p.logo_path}" alt="" loading="lazy">` : "";
  const name = esc(p.provider_name || "");
  return `<div class="pill">${logo}<span>${name}</span></div>`;
}

function renderProvidersBox(data) {
  const box = document.getElementById("providersBox");
  if (!box) return;

  const link = data.link ? `<a href="${esc(data.link)}" target="_blank" rel="noopener">Buka daftar platform untuk region ini</a>` : "";

  const sections = [];
  const cats = [
    { key: "flatrate", title: "Streaming" },
    { key: "rent", title: "Sewa" },
    { key: "buy", title: "Beli" }
  ];
  for (const c of cats) {
    const arr = (data.providers && data.providers[c.key]) ? data.providers[c.key] : [];
    if (!arr.length) continue;
    sections.push(
      `<div class="provSection">
        <div class="provTitle">${c.title}</div>
        <div class="provWrap">${arr.map(providerPill).join("")}</div>
      </div>`
    );
  }

  if (!sections.length) {
    box.innerHTML = `<div class="small">Belum ada data platform resmi untuk region ini. ${link ? `<div style="margin-top:6px">${link}</div>` : ""}</div>`;
    return;
  }

  box.innerHTML = `${link ? `<div class="small">${link}</div>` : ""}${sections.join("")}`;
}

async function loadRegions() {
  const sel = document.getElementById("regionSel");
  if (!sel) return;

  const fallback = [
    { iso_3166_1: "ID", english_name: "Indonesia" },
    { iso_3166_1: "US", english_name: "United States" },
    { iso_3166_1: "GB", english_name: "United Kingdom" },
    { iso_3166_1: "JP", english_name: "Japan" },
    { iso_3166_1: "KR", english_name: "South Korea" },
    { iso_3166_1: "SG", english_name: "Singapore" },
    { iso_3166_1: "MY", english_name: "Malaysia" },
    { iso_3166_1: "TH", english_name: "Thailand" },
    { iso_3166_1: "AU", english_name: "Australia" },
    { iso_3166_1: "CA", english_name: "Canada" }
  ];

  let regions = fallback;
  try {
    const r = await getJSON("/api/ext/tmdb/regions");
    if (r && Array.isArray(r.regions) && r.regions.length) regions = r.regions;
  } catch {}

  const pinned = ["ID", "US", "GB", "JP", "KR"];
  regions = regions
    .filter(x => x && x.iso_3166_1 && x.english_name)
    .sort((a, b) => {
      const ai = pinned.indexOf(a.iso_3166_1);
      const bi = pinned.indexOf(b.iso_3166_1);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return String(a.english_name).localeCompare(String(b.english_name));
    });

  sel.innerHTML = regions
    .map(r => `<option value="${esc(r.iso_3166_1)}">${esc(r.iso_3166_1)} — ${esc(r.english_name)}</option>`)
    .join("");

  const saved = localStorage.getItem("region") || "";
  sel.value = saved && regions.some(x => x.iso_3166_1 === saved) ? saved : (regions.some(x => x.iso_3166_1 === "ID") ? "ID" : "US");

  sel.onchange = () => {
    localStorage.setItem("region", sel.value);
    reloadProviders();
  };
}

async function loadProviders() {
  const box = document.getElementById("providersBox");
  const panel = document.getElementById("providerPanel");
  if (!box || !panel) return;

  const tmdb = (_item && _item.tmdb) ? _item.tmdb : null;
  if (!tmdb || !tmdb.id || !tmdb.mediaType) {
    box.innerHTML = `<div class="small">Belum ada mapping TMDb untuk konten ini. Admin perlu menambah konten via judul (auto TMDb) atau update konten.</div>`;
    return;
  }

  if (_lockedProviders) {
    box.innerHTML = `<div class="small">Konten ini terkunci. Unlock via iklan atau premium untuk melihat platform resmi.</div>`;
    return;
  }

  const sel = document.getElementById("regionSel");
  const region = sel ? String(sel.value || "US") : "US";
  box.textContent = "Memuat…";
  try {
    const data = await getJSON(`/api/ext/tmdb/providers?mediaType=${encodeURIComponent(tmdb.mediaType)}&tmdbId=${encodeURIComponent(tmdb.id)}&region=${encodeURIComponent(region)}`);
    renderProvidersBox(data);
  } catch (e) {
    box.innerHTML = `<div class="small">Gagal ambil data platform resmi. ${(e && e.error) ? esc(e.error) : ""}</div>`;
  }
}

function reloadProviders() {
  loadProviders();
}

let _id;
let _ep;
let _item;
let _lockedProviders = false;

async function nextEp() {
  const eps = (_item.episodes || []).map(e => Number(e.episodeNumber)).sort((a,b)=>a-b);
  const idx = eps.indexOf(_ep);
  if (idx >= 0 && idx < eps.length - 1) location.href = `/watch?id=${_id}&ep=${eps[idx + 1]}`;
}

async function unlockAd() {
  await postJSON("/api/watch/unlock-ad", { contentId: _id, episode: _ep });
  location.reload();
}

async function goPremium() {
  location.href = "/profile";
}

async function main() {
  const id = qs("id");
  const ep = Number(qs("ep") || 1);
  _id = id;
  _ep = ep;

  const title = document.getElementById("title");
  const playerBox = document.getElementById("playerBox");
  const actions = document.getElementById("actions");
  const status = document.getElementById("status");
  const eps = document.getElementById("eps");
  const providerPanel = document.getElementById("providerPanel");

  if (!id) {
    title.textContent = "Content tidak ditemukan";
    return;
  }

  const me = await getJSON("/api/auth/me");
  if (!me.user) {
    location.href = "/login";
    return;
  }

  const detail = await getJSON("/api/content/" + id);
  const item = detail.item;
  _item = item;
  title.textContent = item.title;

  await loadRegions();

  const epsList = (item.episodes || []).map(e => Number(e.episodeNumber)).sort((a,b)=>a-b);
  eps.innerHTML = epsList.map(n => epBtnHTML(id, n, n === ep)).join("");

  if (!epsList.length) {
    const epPanel = eps && eps.closest ? eps.closest(".panel") : null;
    if (epPanel) epPanel.style.display = "none";
  }

  const current = (item.episodes || []).find(e => Number(e.episodeNumber) === ep);

  try {
    const can = await getJSON(`/api/watch/can-watch?contentId=${encodeURIComponent(id)}&episode=${ep}`);
    status.textContent = `Akses: ${can.mode}`;

    _lockedProviders = false;

    if (current && current.videoUrl) {
      playerBox.innerHTML = renderPlayer(current.videoUrl);
      setupPlayerFallback();
    } else {
      playerBox.innerHTML = `<div style="padding:14px" class="small">Video belum ditambahkan untuk konten ini. Silakan gunakan panel <b>Tonton di Platform Resmi</b> di bawah.</div>`;
    }

    postJSON("/api/watch/log", { contentId: id, episode: ep }).catch(()=>{});

    actions.innerHTML = `<button class="btn btnPrimary" onclick="nextEp()">Episode berikutnya</button>`;
  } catch (e) {
    status.textContent = `Akses: LOCKED`;

    _lockedProviders = true;

    if (current && current.videoUrl) {
      playerBox.innerHTML = renderPlayer(current.videoUrl);
      setupPlayerFallback();
    } else {
      playerBox.innerHTML = `<div style="padding:14px" class="small">Konten terkunci. Unlock via iklan atau premium untuk melanjutkan.</div>`;
    }

    actions.innerHTML = `
      <button class="btn btnPrimary" onclick="unlockAd()">Unlock via Iklan</button>
      <button class="btn" onclick="goPremium()">Join Premium</button>
    `;
  }

  if (providerPanel) providerPanel.style.display = "block";
  await loadProviders();
}

window.nextEp = nextEp;
window.unlockAd = unlockAd;
window.goPremium = goPremium;
window.openFrame = openFrame;
window.fsFrame = fsFrame;
window.reloadProviders = reloadProviders;

main();