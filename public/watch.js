import { API_BASE } from "./config.js";

const episodesEl = document.getElementById("episodes");
const playerPanel = document.getElementById("playerPanel");
const video = document.getElementById("video");
const epTitle = document.getElementById("epTitle");
const statusEl = document.getElementById("status");
const gateInfo = document.getElementById("gateInfo");

const avatar = document.getElementById("avatar");
const btnLogout = document.getElementById("btnLogout");

function getToken(){ return localStorage.getItem("token") || ""; }
function logout(){ localStorage.removeItem("token"); window.location.href="./login.html"; }

btnLogout.addEventListener("click", logout);

function seriesId(){
  const u = new URL(window.location.href);
  return u.searchParams.get("series") || "";
}

async function api(path){
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { "Authorization": `Bearer ${getToken()}` }
  });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}

function esc(s){
  return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

async function guard(){
  try {
    const me = await api("/api/me");
    avatar.textContent = (me.user.email || "U").slice(0,1).toUpperCase();
  } catch { logout(); }
}

async function load(){
  const sid = seriesId();
  if (!sid) { episodesEl.innerHTML = `<div class="muted">Series tidak valid.</div>`; return; }

  episodesEl.innerHTML = `<div class="muted">Memuat...</div>`;

  const data = await api(`/api/public/episodes?seriesId=${encodeURIComponent(sid)}`);
  if (!data.ok) throw new Error(data.error || "Gagal load episode");

  gateInfo.textContent = data.subscribed
    ? "Akses: Berlangganan (semua episode terbuka)"
    : `Akses: Free (maksimal episode ${data.freeLimit})`;

  const items = data.items || [];
  if (!items.length) { episodesEl.innerHTML = `<div class="muted">Belum ada episode.</div>`; return; }

  episodesEl.innerHTML = items.map(ep => `
    <button class="epItem ${ep.locked ? "locked" : ""}" data-id="${esc(ep.id)}">
      <div class="epLeft">
        <div class="epNum">${ep.episodeNumber}</div>
        <div>
          <div style="font-weight:900;">${esc(ep.title || ("Episode " + ep.episodeNumber))}</div>
          <div class="muted small">${ep.locked ? "Terkunci" : "Bisa ditonton"}</div>
        </div>
      </div>
      <div style="font-weight:900;">${ep.locked ? "🔒" : "▶"}</div>
    </button>
  `).join("");

  const byId = new Map(items.map(x => [x.id, x]));
  episodesEl.querySelectorAll(".epItem").forEach(btn => {
    btn.addEventListener("click", () => {
      const ep = byId.get(btn.getAttribute("data-id"));
      if (!ep) return;

      if (ep.locked) {
        alert("Episode terkunci. Silakan berlangganan untuk lanjut.");
        window.location.href = "./profile.html#subscribe";
        return;
      }

      playerPanel.style.display = "";
      epTitle.textContent = ep.title || ("Episode " + ep.episodeNumber);
      statusEl.textContent = data.subscribed ? "SUBSCRIBER" : "FREE";
      video.src = ep.videoUrl || "";
      video.load();
      window.scrollTo({ top: playerPanel.offsetTop - 10, behavior: "smooth" });
    });
  });
}

await guard();
await load();