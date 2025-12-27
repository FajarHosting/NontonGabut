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
  // ini yang bikin kontrol video muncul di HP (tanpa desktop mode)
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

  // Google Drive: pakai <video controls> agar kontrol muncul di HP
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

  // URL direct video
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

  // selain itu -> iframe + tombol overlay (Open/Full)
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

let _id;
let _ep;
let _item;

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

  // episodes bar
  const epsList = (item.episodes || []).map(e => Number(e.episodeNumber)).sort((a,b)=>a-b);
  eps.innerHTML = epsList.map(n => epBtnHTML(id, n, n === ep)).join("");

  const current = (item.episodes || []).find(e => Number(e.episodeNumber) === ep);
  if (!current) {
    status.textContent = "Episode tidak ditemukan.";
    playerBox.innerHTML = "";
    actions.innerHTML = "";
    return;
  }

  // access check
  try {
    const can = await getJSON(`/api/watch/can-watch?contentId=${encodeURIComponent(id)}&episode=${ep}`);
    status.textContent = `Akses: ${can.mode}`;

    playerBox.innerHTML = renderPlayer(current.videoUrl);
    setupPlayerFallback();

    // log history
    postJSON("/api/watch/log", { contentId: id, episode: ep }).catch(()=>{});

    actions.innerHTML = `
      <button class="btn btnPrimary" onclick="nextEp()">Episode berikutnya</button>
    `;
  } catch (e) {
    status.textContent = `Akses: LOCKED`;
    playerBox.innerHTML = renderPlayer(current.videoUrl);
    setupPlayerFallback();

    actions.innerHTML = `
      <button class="btn btnPrimary" onclick="unlockAd()">Unlock via Iklan</button>
      <button class="btn" onclick="goPremium()">Join Premium</button>
    `;
  }
}

window.nextEp = nextEp;
window.unlockAd = unlockAd;
window.goPremium = goPremium;
window.openFrame = openFrame;
window.fsFrame = fsFrame;

main();