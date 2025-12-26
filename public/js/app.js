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

async function loadMe(){
  const { user } = await getJSON("/api/auth/me");
  if (!user) {
    window.location.href = "/login";
    return;
  }
  const me = document.getElementById("me");
  me.textContent = `${user.username} • ${user.premiumActive ? "Premium Active" : "Free (10 eps) + Ad Unlock"}`;
  if (user.isAdmin) document.getElementById("adminLink").style.display = "inline";
}

function cardHTML(it){
  const cover = it.coverUrl ? `<img src="${esc(it.coverUrl)}" alt="cover" style="width:100%;height:100%;object-fit:cover;display:block;">`
                            : `<div style="font-weight:900;">${esc(it.title)}</div>`;
  const chips = (it.genres||[]).slice(0,4).map(g=>`<span class="chip">${esc(g)}</span>`).join("");
  return `
    <div class="card">
      <div class="cover">${cover}</div>
      <div class="meta">
        <div class="title">${esc(it.title)}</div>
        <div class="sub">${esc(it.type)} • ${it.episodeCount} episode</div>
        <div class="chips">${chips}</div>
        <div class="sub">${esc((it.synopsis||"").slice(0,120))}${(it.synopsis||"").length>120?"...":""}</div>
      </div>
      <div class="actions">
        <button onclick="openDetail('${it._id}')">Lihat Episode</button>
        <button class="ghost" onclick="openWatch('${it._id}', 1)">Play Eps 1</button>
      </div>
    </div>
  `;
}

window.openWatch = (contentId, episode) => {
  window.location.href = `/watch?contentId=${encodeURIComponent(contentId)}&episode=${encodeURIComponent(episode)}`;
};

window.openDetail = async (id) => {
  const { item } = await getJSON(`/api/content/${id}`);
  const eps = (item.episodes||[]).map(e => `Eps ${e.episodeNumber}`).slice(0,10).join(", ");
  alert(`${item.title}\nTotal episode: ${(item.episodes||[]).length}\nContoh episode: ${eps}\n\nKlik OK untuk buka Watch Eps 1.`);
  openWatch(id, 1);
};

async function loadList(){
  const q = document.getElementById("q").value.trim();
  const type = document.getElementById("type").value;
  const genre = document.getElementById("genre").value.trim();

  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (type) qs.set("type", type);
  if (genre) qs.set("genre", genre);

  const { items } = await getJSON(`/api/content?${qs.toString()}`);
  const grid = document.getElementById("grid");
  grid.innerHTML = items.map(cardHTML).join("");
}

document.getElementById("btnLogout").addEventListener("click", async ()=>{
  await postJSON("/api/auth/logout");
  window.location.href = "/login";
});

["q","type","genre"].forEach(id=>{
  const el = document.getElementById(id);
  el.addEventListener("input", () => { clearTimeout(window.__t); window.__t=setTimeout(loadList, 250); });
  el.addEventListener("change", loadList);
});

(async ()=>{
  await loadMe();
  await loadList();
})();