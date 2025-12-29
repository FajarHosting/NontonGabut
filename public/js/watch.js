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
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw j;
  return j;
}

function esc(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeProvider(p) {
  const s = String(p || "").trim().toLowerCase();
  return s === "vimeo" ? "vimeo" : "url";
}

function getEmbedUrl(ep) {
  if (!ep) return "";
  const provider = normalizeProvider(ep.videoProvider);
  const vimeoId = String(ep.vimeoId || "").trim();

  // support legacy: kalau admin cuma isi videoUrl dengan player.vimeo.com
  const url = String(ep.videoUrl || "").trim();

  if (provider === "vimeo" || vimeoId) {
    if (!/^[0-9]+$/.test(vimeoId)) return "";
    return `https://player.vimeo.com/video/${encodeURIComponent(vimeoId)}`;
  }

  return url;
}

function renderPlayer(embedUrl) {
  if (!embedUrl) {
    return `
      <div style="padding:18px">
        <div style="font-weight:900;margin-bottom:6px">Player tidak tersedia</div>
        <div class="small">Admin belum mengatur sumber video untuk episode ini.</div>
      </div>
    `;
  }

  return `
    <div class="playerFrame">
      <iframe id="playerIframe" src="${esc(embedUrl)}"
        allow="autoplay; fullscreen; picture-in-picture"
        allowfullscreen></iframe>
      <div class="frameActions" id="frameActions">
        <button class="miniBtn" onclick="openFrame('${esc(embedUrl)}')">Open</button>
        <button class="miniBtn" onclick="fsFrame()">Full</button>
      </div>
    </div>
  `;
}

function renderLocked() {
  return `
    <div style="padding:18px">
      <div style="font-weight:900;margin-bottom:6px">Episode Terkunci</div>
      <div class="small">
        Silakan unlock via iklan atau join premium untuk menonton episode ini.
      </div>
    </div>
  `;
}

function openFrame(url) {
  window.open(url, "_blank", "noopener");
}
function fsFrame() {
  const f = document.getElementById("playerIframe");
  if (!f) return;
  if (f.requestFullscreen) f.requestFullscreen().catch(()=>{});
}

let _content = null;

async function main() {
  const id = qs("id");
  const ep = Number(qs("ep") || 1);

  const titleEl = document.getElementById("title");
  const status = document.getElementById("status");
  const playerBox = document.getElementById("playerBox");
  const meta = document.getElementById("meta");
  const eps = document.getElementById("eps");
  const actions = document.getElementById("actions");

  if (!id) {
    titleEl.textContent = "Konten tidak ditemukan";
    status.textContent = "Akses: -";
    playerBox.innerHTML = renderLocked();
    return;
  }

  const { item } = await getJSON(`/api/content/${encodeURIComponent(id)}`);
  _content = item;

  titleEl.textContent = item.title;
  if (meta) meta.textContent = `${item.type} • ${item.genres && item.genres.length ? item.genres.join(", ") : "-"}`;

  // render episode list
  const episodes = (item.episodes || []).slice().sort((a,b)=>Number(a.episodeNumber)-Number(b.episodeNumber));
  eps.innerHTML = episodes
    .map((x) => {
      const n = Number(x.episodeNumber);
      const active = n === ep ? " epBtnActive" : "";
      return `<a class="epBtn${active}" href="/watch?id=${encodeURIComponent(id)}&ep=${n}">EP ${n}</a>`;
    })
    .join("");

  // episode current
  const current = episodes.find((e) => Number(e.episodeNumber) === ep) || episodes[0];
  if (!current) {
    status.textContent = "Akses: -";
    playerBox.innerHTML = renderLocked();
    actions.innerHTML = `<button class="btn" onclick="location.href='/app'">Kembali</button>`;
    return;
  }

  const embedUrl = getEmbedUrl(current);

  // cek akses
  try {
    const can = await getJSON(`/api/watch/can-watch?contentId=${encodeURIComponent(id)}&episode=${ep}`);
    status.textContent = `Akses: ${can.mode}`;

    playerBox.innerHTML = renderPlayer(embedUrl);

    // log history
    postJSON("/api/watch/log", { contentId: id, episode: ep }).catch(()=>{});

    actions.innerHTML = `
      <button class="btn btnPrimary" onclick="nextEp()">Episode berikutnya</button>
    `;
  } catch (e) {
    status.textContent = `Akses: LOCKED`;
    playerBox.innerHTML = renderLocked();

    actions.innerHTML = `
      <button class="btn btnPrimary" onclick="unlockAd()">Unlock via Iklan</button>
      <button class="btn" onclick="goPremium()">Join Premium</button>
    `;
  }
}

async function nextEp() {
  const id = qs("id");
  const ep = Number(qs("ep") || 1);
  if (!_content) return;

  const episodes = (_content.episodes || []).slice().sort((a,b)=>Number(a.episodeNumber)-Number(b.episodeNumber));
  const idx = episodes.findIndex((e) => Number(e.episodeNumber) === ep);
  const next = episodes[idx + 1];
  if (!next) return alert("Sudah episode terakhir.");
  location.href = `/watch?id=${encodeURIComponent(id)}&ep=${Number(next.episodeNumber)}`;
}

async function unlockAd() {
  const id = qs("id");
  const ep = Number(qs("ep") || 1);
  try {
    await postJSON("/api/watch/unlock-ad", { contentId: id, episode: ep });
    location.reload();
  } catch (e) {
    alert(e && e.error ? e.error : "Gagal unlock.");
  }
}

function goPremium() {
  location.href = "/billing";
}

window.nextEp = nextEp;
window.unlockAd = unlockAd;
window.goPremium = goPremium;
window.openFrame = openFrame;
window.fsFrame = fsFrame;

main();