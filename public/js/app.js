import { api } from "./api.js";
import { requireLogin } from "./guard.js";

const grid = document.getElementById("grid");
const subPill = document.getElementById("subPill");

function card(s){
  const g = (s.genres || []).slice(0,4).map(x=>`<span class="tag">${x}</span>`).join("");
  const poster = s.posterUrl ? `<img src="${s.posterUrl}" alt="poster">` : "";
  return `
    <a class="card" href="/watch.html?id=${s._id}">
      <div class="poster">${poster}</div>
      <div class="meta">
        <div class="title">${s.title}</div>
        <div class="sub">${(s.type||"").toUpperCase()} • Free ${s.freeLimit ?? 10} episode</div>
        <div class="tagrow">${g}</div>
      </div>
    </a>
  `;
}

async function load(){
  const q = document.getElementById("q").value.trim();
  const type = document.getElementById("type").value.trim();
  const genre = document.getElementById("genre").value.trim();

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (type) params.set("type", type);
  if (genre) params.set("genre", genre);

  const d = await api("/api/series?" + params.toString());
  grid.innerHTML = d.items.map(card).join("") || `<div class="panel">Belum ada film/series. Admin bisa tambah dari halaman Admin.</div>`;
}

document.getElementById("btnSearch").onclick = load;
document.getElementById("btnReset").onclick = ()=>{
  document.getElementById("q").value="";
  document.getElementById("type").value="";
  document.getElementById("genre").value="";
  load();
};

document.getElementById("btnLogout").onclick = async ()=>{
  await api("/api/auth/logout", { method:"POST" });
  location.href = "/login.html";
};

(async ()=>{
  const user = await requireLogin();
  if (!user) return;
  subPill.textContent = user.isSubscribed ? "Subscribed" : "Free user";
  await load();
})();