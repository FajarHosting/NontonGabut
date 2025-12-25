import { API_BASE } from "./config.js";

const grid = document.getElementById("grid");
const avatar = document.getElementById("avatar");
const adminLink = document.getElementById("adminLink");
const btnLogout = document.getElementById("btnLogout");

const typeEl = document.getElementById("type");
const genreEl = document.getElementById("genre");
const qEl = document.getElementById("q");
const btnSearch = document.getElementById("btnSearch");

function getToken(){ return localStorage.getItem("token") || ""; }
function logout(){ localStorage.removeItem("token"); window.location.href="./login.html"; }

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

btnLogout.addEventListener("click", logout);

async function guard(){
  try {
    const me = await api("/api/me");
    const initial = (me.user.email || "U").slice(0,1).toUpperCase();
    avatar.textContent = initial;

    // admin link tampil jika email admin (backend akan blok kalau bukan admin)
    // UI hint saja: jika admin, endpoint admin/series GET akan sukses.
    try {
      await fetch(`${API_BASE}/api/admin/series`, { headers: { Authorization: `Bearer ${getToken()}` } });
      adminLink.style.display = "";
    } catch { adminLink.style.display = "none"; }
  } catch {
    logout();
  }
}

async function load(){
  grid.innerHTML = `<div class="muted">Memuat...</div>`;
  const params = new URLSearchParams();
  if (typeEl.value) params.set("type", typeEl.value);
  if (genreEl.value.trim()) params.set("genre", genreEl.value.trim());
  if (qEl.value.trim()) params.set("q", qEl.value.trim());

  const data = await fetch(`${API_BASE}/api/public/series?${params.toString()}`).then(r=>r.json());
  if (!data.ok) throw new Error(data.error || "Gagal load series");
  const items = data.items || [];

  if (!items.length) {
    grid.innerHTML = `<div class="muted">Tidak ada series.</div>`;
    return;
  }

  grid.innerHTML = items.map(s => `
    <article class="card">
      <div class="thumb">
        ${s.thumbUrl ? `<img src="${esc(s.thumbUrl)}" alt="">` : `<div class="thumbFallback">No Image</div>`}
      </div>
      <div class="cardBody">
        <div class="badgeRow">
          <span class="badge">${esc((s.type||"").toUpperCase())}</span>
          <span class="badge">${esc(s.genre||"-")}</span>
        </div>
        <div style="font-weight:900;">${esc(s.title)}</div>
        <div class="muted small">${esc(s.description||"")}</div>
        <a class="btn primary" href="./watch.html?series=${encodeURIComponent(s.id)}">Buka Episode</a>
      </div>
    </article>
  `).join("");
}

btnSearch.addEventListener("click", () => load());

await guard();
await load();