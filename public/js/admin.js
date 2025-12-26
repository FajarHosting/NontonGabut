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
function fmtIDR(n){
  const x = Number(n||0);
  return "Rp " + x.toLocaleString("id-ID");
}

/* ---------- Tabs ---------- */
function initTabs(){
  const tabs = Array.from(document.querySelectorAll(".tab"));
  const panels = Array.from(document.querySelectorAll(".panel"));
  function show(id){
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === id));
    panels.forEach(p => p.classList.toggle("show", p.id === id));
  }
  tabs.forEach(t => t.addEventListener("click", () => show(t.dataset.tab)));
}

/* ---------- Auth ---------- */
async function loadMe(){
  const { user } = await getJSON("/api/auth/me");
  if (!user) { window.location.href = "/login"; return; }
  if (!user.isAdmin) { alert("Akses admin ditolak."); window.location.href = "/app"; return; }
  const me = document.getElementById("me");
  if (me) me.textContent = `${user.username} • Admin • ${user.premiumActive ? "Premium Active" : "Free"}`;
}

/* ---------- Stats/KPI ---------- */
async function loadStats(){
  const s = await getJSON("/api/admin/stats");
  const kpis = document.getElementById("kpis");
  if (!kpis) return;

  const cells = kpis.querySelectorAll(".kpi .val");
  if (cells.length >= 4){
    cells[0].textContent = String(s.userCount ?? "—");
    cells[1].textContent = String(s.contentCount ?? "—");
    cells[2].textContent = String(s.paidTxCount ?? "—");
    cells[3].textContent = fmtIDR(s.revenueIDR ?? 0);
  }
}

/* ---------- Transactions ---------- */
function txCard(tx){
  const who = tx.userId && tx.userId.username ? tx.userId.username : "-";
  const created = tx.createdAt ? new Date(tx.createdAt).toLocaleString("id-ID") : "-";

  const status = String(tx.status || "");
  const tagClass =
    status === "PAID" ? "tag ok" :
    status === "REJECTED" ? "tag bad" :
    "tag warn";

  return `
    <div class="item">
      <div class="itemTop">
        <div>
          <div class="itemTitle">${esc(who)} • ${esc(tx.plan)} • ${esc(fmtIDR(tx.amountIDR))}</div>
          <div class="muted">Metode: ${esc(tx.method)} • ${esc(created)} • TX: <code>${esc(tx._id)}</code></div>
        </div>
        <span class="${tagClass}">${esc(status)}</span>
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="btn" onclick="window.markTx('${esc(tx._id)}','PAID')">Mark PAID</button>
        <button class="ghost" onclick="window.markTx('${esc(tx._id)}','REJECTED')">Reject</button>
      </div>
    </div>
  `;
}

async function loadTx(){
  const { items } = await getJSON("/api/admin/transactions");
  const box = document.getElementById("txList");
  if (!box) return;

  if (!items || !items.length) {
    box.innerHTML = `<div class="muted" style="margin-top:10px;">Belum ada transaksi.</div>`;
    return;
  }
  box.innerHTML = items.map(txCard).join("");
}

window.markTx = async (txId, status) => {
  if (!confirm(`Ubah status transaksi menjadi ${status}?`)) return;
  await postJSON("/api/admin/transactions/mark", { txId, status });
  await loadStats();
  await loadTx();
};

/* ---------- Gift Premium ---------- */
function initGift(){
  const btn = document.getElementById("btnGift");
  if (!btn) return;

  btn.addEventListener("click", async ()=>{
    const u = (document.getElementById("giftUser")?.value || "").trim();
    const days = Number(document.getElementById("giftDays")?.value || 30);
    const msg = document.getElementById("giftMsg");
    if (msg) msg.textContent = "Processing...";

    try{
      const r = await postJSON("/api/admin/users/give-premium", { username: u, days });
      if (msg) msg.textContent = `Sukses. Premium until: ${new Date(r.premiumUntil).toLocaleString("id-ID")}`;
    } catch(e){
      if (msg) msg.textContent = "Gagal. Pastikan username benar dan days 1-365.";
    }
  });
}

/* ---------- Content Upsert ---------- */
function initUpsert(){
  const btn = document.getElementById("btnUpsert");
  if (!btn) return;

  btn.addEventListener("click", async ()=>{
    const msg = document.getElementById("upsertMsg");
    btn.disabled = true;
    if (msg) msg.textContent = "Saving...";

    const type = document.getElementById("type")?.value;
    const title = (document.getElementById("title")?.value || "").trim();
    const coverUrl = (document.getElementById("coverUrl")?.value || "").trim();
    const genres = (document.getElementById("genres")?.value || "").trim();
    const synopsis = (document.getElementById("synopsis")?.value || "").trim();
    const episodesText = (document.getElementById("episodes")?.value || "").trim();

    let episodes = [];
    try{
      episodes = episodesText ? JSON.parse(episodesText) : [];
      if (!Array.isArray(episodes)) throw new Error("episodes not array");
    } catch {
      if (msg) msg.textContent = "Episodes JSON tidak valid.";
      btn.disabled = false;
      return;
    }

    try{
      const r = await postJSON("/api/admin/content/upsert", {
        type, title, coverUrl, genres, synopsis, episodes
      });
      if (msg) msg.textContent = `Sukses. Content ID: ${r.item._id}`;
      await loadStats();
    } catch(e){
      if (msg) msg.textContent = "Gagal menyimpan. Periksa field wajib dan URL episode.";
    } finally{
      btn.disabled = false;
    }
  });
}

/* ---------- Episode Append (NEW) ---------- */
async function loadContentsToPicker(){
  const type = document.getElementById("pickType")?.value || "anime";
  const sel = document.getElementById("pickContent");
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading...</option>`;

  // Pakai endpoint /api/content yang kamu sudah punya (dipakai katalog)
  // limit dibuat besar tapi tetap wajar.
  const data = await getJSON(`/api/content?type=${encodeURIComponent(type)}&q=&genre=&page=1&limit=200`);

  const items = data.items || [];
  if (!items.length) {
    sel.innerHTML = `<option value="">(belum ada konten)</option>`;
    return;
  }

  sel.innerHTML =
    `<option value="">— pilih konten —</option>` +
    items.map(it => `<option value="${esc(it._id)}">${esc(it.title)}</option>`).join("");
}

function initEpisodeAppend(){
  const pickType = document.getElementById("pickType");
  const btnReload = document.getElementById("btnReloadPicker");
  const btnAdd = document.getElementById("btnAddEpisode");

  if (pickType) pickType.addEventListener("change", loadContentsToPicker);
  if (btnReload) btnReload.addEventListener("click", loadContentsToPicker);

  if (!btnAdd) return;

  btnAdd.addEventListener("click", async ()=>{
    const msg = document.getElementById("addEpMsg");
    if (msg) msg.textContent = "Processing...";
    btnAdd.disabled = true;

    const contentId = document.getElementById("pickContent")?.value || "";
    const episodeNumber = Number(document.getElementById("epNumber")?.value || 0);
    const title = (document.getElementById("epTitle")?.value || "").trim();
    const videoUrl = (document.getElementById("epVideoUrl")?.value || "").trim();
    const thumbUrl = (document.getElementById("epThumbUrl")?.value || "").trim();

    if (!contentId) {
      if (msg) msg.textContent = "Pilih konten dulu.";
      btnAdd.disabled = false;
      return;
    }
    if (!episodeNumber || episodeNumber < 1) {
      if (msg) msg.textContent = "Episode number wajib (>=1).";
      btnAdd.disabled = false;
      return;
    }
    if (!videoUrl) {
      if (msg) msg.textContent = "Video URL wajib.";
      btnAdd.disabled = false;
      return;
    }

    try{
      await postJSON("/api/admin/content/add-episode", {
        contentId,
        episode: { episodeNumber, title, videoUrl, thumbUrl }
      });

      if (msg) msg.textContent = `Sukses tambah episode ${episodeNumber}.`;
      const epTitle = document.getElementById("epTitle");
      const epVideoUrl = document.getElementById("epVideoUrl");
      const epThumbUrl = document.getElementById("epThumbUrl");
      const epNumber = document.getElementById("epNumber");
      if (epTitle) epTitle.value = "";
      if (epVideoUrl) epVideoUrl.value = "";
      if (epThumbUrl) epThumbUrl.value = "";
      if (epNumber) epNumber.value = "";

    } catch(e){
      const map = {
        BAD_INPUT: "Input tidak valid.",
        NOT_FOUND: "Konten tidak ditemukan.",
        DUP_EP: "Episode number sudah ada."
      };
      if (msg) msg.textContent = map[e.error] || "Gagal menambah episode.";
    } finally{
      btnAdd.disabled = false;
    }
  });
}

/* ---------- Logout ---------- */
function initLogout(){
  const btn = document.getElementById("btnLogout");
  if (!btn) return;

  btn.addEventListener("click", async ()=>{
    await postJSON("/api/auth/logout");
    window.location.href = "/login";
  });
}

/* ---------- Boot ---------- */
(async ()=>{
  initTabs();
  initGift();
  initUpsert();
  initEpisodeAppend();
  initLogout();

  await loadMe();
  await loadStats();
  await loadTx();
  await loadContentsToPicker();
})();