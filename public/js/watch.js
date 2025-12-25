import { api, qs } from "./api.js";
import { requireLogin } from "./guard.js";

const id = qs("id");
const title = document.getElementById("title");
const meta = document.getElementById("meta");
const list = document.getElementById("list");
const video = document.getElementById("video");
const hint = document.getElementById("hint");

function row(ep){
  const locked = ep.locked;
  return `
  <div class="item ${locked ? "locked":""}">
    <div>
      <div style="font-weight:900">EP ${ep.number} • ${ep.title}</div>
      <div class="small">${locked ? "Terkunci — butuh langganan" : "Siap diputar"}</div>
    </div>
    <div class="row">
      ${locked ? `<span class="badge no">Locked</span>` : `<span class="badge ok">Open</span>`}
      <button class="btn ghost" data-play="${ep._id}" ${locked ? "disabled":""}>Play</button>
    </div>
  </div>`;
}

(async ()=>{
  const user = await requireLogin();
  if (!user) return;

  const d = await api(`/api/series/${id}/episodes`);
  title.textContent = d.series.title;
  meta.textContent = `${(d.series.type||"").toUpperCase()} • Free sampai EP ${d.series.freeLimit || 10}`;
  list.innerHTML = d.episodes.map(row).join("");

  // autoplay first open episode
  const first = d.episodes.find(x => !x.locked);
  if (first) {
    video.src = first.videoUrl;
    hint.textContent = user.isSubscribed ? "Kamu sudah subscribed: semua episode terbuka." : "Mode free: hanya episode awal yang terbuka.";
  } else {
    hint.textContent = "Tidak ada episode yang bisa diputar.";
  }

  list.addEventListener("click", (e)=>{
    const btn = e.target.closest("[data-play]");
    if (!btn) return;
    const epId = btn.getAttribute("data-play");
    const ep = d.episodes.find(x => String(x._id) === String(epId));
    if (!ep || ep.locked) return;
    video.src = ep.videoUrl;
    video.play();
  });
})();