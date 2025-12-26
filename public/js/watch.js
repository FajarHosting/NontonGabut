async function getJSON(url) {
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw data;
  return data;
}
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw data;
  return data;
}
function esc(s){ return String(s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }

const qs = new URLSearchParams(location.search);
let contentId = qs.get("contentId") || "";
let episode = Number(qs.get("episode") || 1);

let ME = null;
let ITEM = null;

function showModal(show){
  document.getElementById("modalBackdrop").style.display = show ? "flex" : "none";
}

async function loadMe(){
  const { user } = await getJSON("/api/auth/me");
  if (!user) { window.location.href = "/login"; return; }
  ME = user;
  if (user.isAdmin) document.getElementById("adminLink").style.display = "inline";
}

function setHeader(){
  document.getElementById("hdrTitle").textContent = ITEM ? ITEM.title : "Watch";
  document.getElementById("hdrSub").textContent =
    (ME ? ME.username : "") +
    " • " +
    (ME && ME.premiumActive ? "Premium Active" : "Free (10 eps) + Ad Unlock");
}

function setNowPlaying(){
  document.getElementById("nowPlaying").textContent =
    `${ITEM.title} • Episode ${episode}`;
}

function isLikelyEmbedUrl(url){
  const u = String(url||"");
  return u.includes("youtube.com/embed") || u.includes("player.vimeo.com") || u.includes("embed");
}

function setPlayerUrl(videoUrl){
  const playerArea = document.getElementById("playerArea");
  const v = document.getElementById("video");

  // Simple heuristic: iframe for embed-like URLs, video tag for direct URLs
  if (isLikelyEmbedUrl(videoUrl)) {
    playerArea.innerHTML =
      `<iframe src="${esc(videoUrl)}" style="height:420px" allow="autoplay; fullscreen" loading="lazy"></iframe>`;
  } else {
    // restore video element if replaced
    if (!document.getElementById("video")) {
      playerArea.innerHTML = `<video id="video" controls playsinline></video>`;
    }
    const vv = document.getElementById("video");
    vv.src = videoUrl;
    vv.load();
  }
}

async function canWatch(){
  const data = await getJSON(`/api/watch/can-watch?contentId=${encodeURIComponent(contentId)}&episode=${encodeURIComponent(episode)}`);
  if (data.allowed) {
    showModal(false);
    setPlayerUrl(data.videoUrl);
    document.getElementById("policyInfo").textContent = `Akses: ${data.reason}`;
  } else {
    document.getElementById("policyInfo").textContent = "Akses: LOCKED";
    showModal(true);
  }
}

function renderEpisodes(){
  const list = document.getElementById("epsList");
  const eps = (ITEM.episodes || []).slice().sort((a,b)=>a.episodeNumber-b.episodeNumber);

  list.innerHTML = eps.map(e => {
    const n = e.episodeNumber;
    const active = n === episode;
    const tag = active ? `<span class="tag ok">NOW</span>` : `<span class="tag">OPEN</span>`;
    return `
      <div class="epsBtn" onclick="window.goEp(${n})" style="${active ? "border-color: rgba(110,231,255,.45)" : ""}">
        <div>
          <div style="font-weight:900;">Eps ${n}</div>
          <div class="muted">${esc(e.title || "")}</div>
        </div>
        ${tag}
      </div>
    `;
  }).join("");
}

window.goEp = (n) => {
  const nextUrl = `/watch?contentId=${encodeURIComponent(contentId)}&episode=${encodeURIComponent(n)}`;
  window.location.href = nextUrl;
};

async function loadItem(){
  const { item } = await getJSON(`/api/content/${encodeURIComponent(contentId)}`);
  ITEM = item;
}

let adTimer = null;

async function runAdUnlock(){
  const btn = document.getElementById("btnAd");
  btn.disabled = true;

  const bar = document.getElementById("bar");
  const txt = document.getElementById("adText");

  let t = 0;
  const total = 8;

  bar.style.width = "0%";
  txt.textContent = "Iklan berjalan...";

  if (adTimer) clearInterval(adTimer);
  adTimer = setInterval(() => {
    t += 1;
    bar.style.width = `${Math.round((t/total)*100)}%`;
    txt.textContent = `Menunggu ${Math.max(0, total - t)} detik...`;
    if (t >= total) {
      clearInterval(adTimer);
      txt.textContent = "Selesai. Unlocking...";
      (async ()=>{
        try{
          await postJSON("/api/watch/unlock-by-ad", { contentId, episode });
          await canWatch();
        } finally {
          btn.disabled = false;
          txt.textContent = "Selesai.";
        }
      })();
    }
  }, 1000);
}

document.getElementById("btnAd").addEventListener("click", runAdUnlock);
document.getElementById("btnPremium").addEventListener("click", ()=> window.location.href = "/billing");
document.getElementById("btnClose").addEventListener("click", ()=> showModal(false));
document.getElementById("btnLogout").addEventListener("click", async ()=>{
  await postJSON("/api/auth/logout");
  window.location.href = "/login";
});

(async ()=>{
  if (!contentId) { window.location.href = "/app"; return; }
  await loadMe();
  await loadItem();
  setHeader();
  renderEpisodes();
  setNowPlaying();
  await canWatch();
})();