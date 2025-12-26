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

async function loadMe(){
  const { user } = await getJSON("/api/auth/me");
  if (!user) { window.location.href = "/login"; return; }
  if (!user.isAdmin) { alert("Akses admin ditolak."); window.location.href = "/app"; return; }
  document.getElementById("me").textContent =
    `${user.username} • Admin • ${user.premiumActive ? "Premium Active" : "Free"}`;
}

async function loadStats(){
  const s = await getJSON("/api/admin/stats");
  document.getElementById("stats").innerHTML = `
    <div class="txRow">
      <div>
        <div style="font-weight:950;">User</div>
        <div class="muted">${esc(s.userCount)}</div>
      </div>
      <span class="tag">COUNT</span>
    </div>

    <div class="txRow" style="margin-top:10px;">
      <div>
        <div style="font-weight:950;">Konten</div>
        <div class="muted">${esc(s.contentCount)}</div>
      </div>
      <span class="tag">COUNT</span>
    </div>

    <div class="txRow" style="margin-top:10px;">
      <div>
        <div style="font-weight:950;">Transaksi PAID</div>
        <div class="muted">${esc(s.paidTxCount)}</div>
      </div>
      <span class="tag">PAID</span>
    </div>

    <div class="txRow" style="margin-top:10px;">
      <div>
        <div style="font-weight:950;">Revenue (Profit)</div>
        <div class="muted">${esc(fmtIDR(s.revenueIDR))}</div>
      </div>
      <span class="tag">IDR</span>
    </div>
  `;
}

function txCard(tx){
  const who = tx.userId && tx.userId.username ? tx.userId.username : "-";
  const created = tx.createdAt ? new Date(tx.createdAt).toLocaleString("id-ID") : "-";
  return `
    <div class="mini">
      <div class="txRow">
        <div>
          <div style="font-weight:950;">${esc(who)} • ${esc(tx.plan)} • ${esc(fmtIDR(tx.amountIDR))}</div>
          <div class="muted">Metode: ${esc(tx.method)} • ${esc(created)} • TX: ${esc(tx._id)}</div>
        </div>
        <span class="tag">${esc(tx.status)}</span>
      </div>

      <div class="row" style="margin-top:10px;">
        <button onclick="window.markTx('${esc(tx._id)}','PAID')">Mark PAID</button>
        <button class="ghost" onclick="window.markTx('${esc(tx._id)}','REJECTED')">Reject</button>
      </div>
    </div>
  `;
}

async function loadTx(){
  const { items } = await getJSON("/api/admin/transactions");
  const box = document.getElementById("txList");
  if (!items.length) {
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

document.getElementById("btnGift").addEventListener("click", async ()=>{
  const u = document.getElementById("giftUser").value.trim();
  const days = Number(document.getElementById("giftDays").value || 30);
  const msg = document.getElementById("giftMsg");
  msg.textContent = "Processing...";
  try{
    const r = await postJSON("/api/admin/users/give-premium", { username: u, days });
    msg.textContent = `Sukses. Premium until: ${new Date(r.premiumUntil).toLocaleString("id-ID")}`;
  } catch(e){
    msg.textContent = "Gagal. Pastikan username benar dan days 1-365.";
  }
});

document.getElementById("btnUpsert").addEventListener("click", async ()=>{
  const btn = document.getElementById("btnUpsert");
  const msg = document.getElementById("upsertMsg");
  btn.disabled = true;
  msg.textContent = "Saving...";

  const type = document.getElementById("type").value;
  const title = document.getElementById("title").value.trim();
  const coverUrl = document.getElementById("coverUrl").value.trim();
  const genres = document.getElementById("genres").value.trim();
  const synopsis = document.getElementById("synopsis").value.trim();
  const episodesText = document.getElementById("episodes").value.trim();

  let episodes = [];
  try{
    episodes = episodesText ? JSON.parse(episodesText) : [];
    if (!Array.isArray(episodes)) throw new Error("episodes not array");
  } catch {
    msg.textContent = "Episodes JSON tidak valid.";
    btn.disabled = false;
    return;
  }

  try{
    const r = await postJSON("/api/admin/content/upsert", {
      type, title, coverUrl, genres, synopsis, episodes
    });
    msg.textContent = `Sukses. Content ID: ${r.item._id}`;
  } catch(e){
    msg.textContent = "Gagal menyimpan. Periksa field wajib dan URL episode.";
  } finally{
    btn.disabled = false;
  }
});

document.getElementById("btnLogout").addEventListener("click", async ()=>{
  await postJSON("/api/auth/logout");
  window.location.href = "/login";
});

(async ()=>{
  await loadMe();
  await loadStats();
  await loadTx();
})();