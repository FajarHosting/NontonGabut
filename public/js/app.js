import { api } from "./api.js";
import { requireLogin } from "./guard.js";

const elList = document.getElementById("film-list");
const elCount = document.getElementById("count");
const elCat = document.getElementById("cat");
const elGenre = document.getElementById("genre");
const elQ = document.getElementById("q");
const btnSearch = document.getElementById("btnSearch");
const btnReset = document.getElementById("btnReset");
const btnLogout = document.getElementById("btnLogout");
const subBadge = document.getElementById("subBadge");

let ALL = [];

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  }[m]));
}

function buildFilters(series) {
  const cats = uniq(series.map(s => s.category));
  const genres = uniq(series.flatMap(s => Array.isArray(s.genres) ? s.genres : []));

  // reset options (keep first placeholder)
  elCat.length = 1;
  elGenre.length = 1;

  for (const c of cats) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    elCat.appendChild(opt);
  }
  for (const g of genres) {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    elGenre.appendChild(opt);
  }
}

function matches(item, q, cat, genre) {
  if (cat && item.category !== cat) return false;

  if (genre) {
    const gs = Array.isArray(item.genres) ? item.genres : [];
    if (!gs.includes(genre)) return false;
  }

  if (q) {
    const hay = `${item.title ?? ""} ${item.description ?? ""}`.toLowerCase();
    if (!hay.includes(q.toLowerCase())) return false;
  }
  return true;
}

function render(list) {
  elCount.textContent = String(list.length);

  elList.innerHTML = list.map(s => {
    const title = esc(s.title || "Untitled");
    const cat = esc(s.category || "-");
    const genres = esc((Array.isArray(s.genres) ? s.genres.join(", ") : ""));
    const thumb = s.coverUrl || "";

    return `
      <a class="film-card" href="/watch.html?id=${encodeURIComponent(s._id)}">
        <div class="thumb">
          ${thumb
            ? `<img src="${esc(thumb)}" alt="${title}" loading="lazy" />`
            : `<div class="thumb-fallback">${title.slice(0, 1).toUpperCase()}</div>`
          }
        </div>
        <div class="meta">
          <div class="title">${title}</div>
          <div class="subtitle">${cat}${genres ? ` • ${genres}` : ""}</div>
        </div>
      </a>
    `;
  }).join("");
}

function apply() {
  const q = elQ.value.trim();
  const cat = elCat.value;
  const genre = elGenre.value;
  render(ALL.filter(s => matches(s, q, cat, genre)));
}

async function boot() {
  // Halaman home ini wajib login
  const me = await requireLogin();

  // badge status subscribe
  if (me?.isSubscribed) {
    subBadge.textContent = "Subscribed";
    subBadge.classList.add("ok");
  } else {
    subBadge.textContent = "Free (maks 10 episode)";
    subBadge.classList.add("warn");
  }

  // load series
  const data = await api("/api/series");
  ALL = Array.isArray(data?.series) ? data.series : [];

  buildFilters(ALL);
  apply();
}

btnSearch?.addEventListener("click", apply);
btnReset?.addEventListener("click", () => {
  elCat.value = "";
  elGenre.value = "";
  elQ.value = "";
  apply();
});
elCat?.addEventListener("change", apply);
elGenre?.addEventListener("change", apply);
elQ?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") apply();
});

btnLogout?.addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST" }); } catch {}
  location.href = "/login.html";
});

boot().catch((e) => {
  console.error(e);
  // fallback: kalau ada error aneh, lempar ke login
  location.href = "/login.html";
});