// public/app.js
import { firebaseConfig } from "/firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);

const logoutBtn = document.getElementById("logoutBtn");

const grid = document.getElementById("grid");
const player = document.getElementById("player");
const videoEl = document.getElementById("videoEl");
const playerTitle = document.getElementById("playerTitle");
const playerMeta = document.getElementById("playerMeta");
const playerDesc = document.getElementById("playerDesc");

const typeTabs = document.getElementById("typeTabs");
const genreSelect = document.getElementById("genreSelect");
const searchInput = document.getElementById("searchInput");
const refreshBtn = document.getElementById("refreshBtn");
const closePlayer = document.getElementById("closePlayer");

let state = { type: "", genre: "", q: "" };
let started = false;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }
  if (!started) {
    started = true;
    load();
  }
});

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "/login.html";
});

function qs(params) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") u.set(k, v);
  });
  return u.toString();
}

async function load() {
  grid.innerHTML = `<div class="muted">Memuat...</div>`;
  const url = `/api/public/videos?${qs({ type: state.type, genre: state.genre, q: state.q })}`;
  const r = await fetch(url);
  const data = await r.json();

  const items = data.items || [];
  if (!items.length) {
    grid.innerHTML = `<div class="muted">Tidak ada data.</div>`;
    return;
  }

  grid.innerHTML = items.map((x) => cardHtml(x)).join("");
  grid.querySelectorAll("[data-watch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = btn.getAttribute("data-json");
      const item = JSON.parse(raw);
      openPlayer(item);
    });
  });
}

function cardHtml(x) {
  const safeJson = JSON.stringify(x).replace(/"/g, "&quot;");
  const thumb = x.thumbUrl ? x.thumbUrl : "";
  return `
    <article class="card">
      <div class="thumb">
        ${thumb ? `<img src="${thumb}" alt="" />` : `<div class="thumbFallback">No Image</div>`}
      </div>
      <div class="cardBody">
        <div class="badgeRow">
          <span class="badge">${(x.type || "").toUpperCase()}</span>
          <span class="badge outline">${x.genre || "-"}</span>
          ${x.episode ? `<span class="badge outline">Ep ${x.episode}</span>` : ""}
        </div>
        <h3 class="title">${escapeHtml(x.title)}</h3>
        <p class="muted clamp2">${escapeHtml(x.description || "")}</p>
        <button class="btn primary" data-watch="1" data-json="${safeJson}" ${x.videoUrl ? "" : "disabled"}>
          ${x.videoUrl ? "Tonton" : "Video belum tersedia"}
        </button>
      </div>
    </article>
  `;
}

function openPlayer(x) {
  player.classList.remove("hidden");
  playerTitle.textContent = x.title;
  playerMeta.textContent = `${(x.type || "").toUpperCase()} • ${x.genre || "-"}${x.episode ? " • Ep " + x.episode : ""}`;
  playerDesc.textContent = x.description || "";
  videoEl.src = x.videoUrl || "";
  videoEl.load();
  window.scrollTo({ top: player.offsetTop - 10, behavior: "smooth" });
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

typeTabs.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-type]");
  if (!btn) return;
  typeTabs.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.type = btn.dataset.type || "";
  load();
});

genreSelect.addEventListener("change", () => {
  state.genre = genreSelect.value || "";
  load();
});

searchInput.addEventListener("input", () => {
  state.q = searchInput.value || "";
});

refreshBtn.addEventListener("click", load);

closePlayer.addEventListener("click", () => {
  player.classList.add("hidden");
  videoEl.pause();
  videoEl.src = "";
});