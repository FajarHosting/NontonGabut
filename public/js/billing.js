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
  document.getElementById("me").textContent =
    `${user.username} • ${user.premiumActive ? "Premium Active" : "Free"}`
    + (user.premiumUntil ? ` • until ${new Date(user.premiumUntil).toLocaleString("id-ID")}` : "");
  if (user.isAdmin) document.getElementById("adminLink").style.display = "inline";
}

async function loadPlans(){
  const data = await getJSON("/api/billing/plans");
  const planSel = document.getElementById("plan");
  const methodSel = document.getElementById("method");

  planSel.innerHTML = data.plans.map(p =>
    `<option value="${esc(p.code)}">${esc(p.label)} • ${esc(fmtIDR(p.amountIDR))}</option>`
  ).join("");

  methodSel.innerHTML = data.methods.map(m =>
    `<option value="${esc(m)}">${esc(m.toUpperCase())}</option>`
  ).join("");
}

async function loadTx(){
  const { items } = await getJSON("/api/billing/my-transactions");
  const box = document.getElementById("txList");
  if (!items.length) {
    box.innerHTML = `<div class="muted" style="margin-top:10px;">Belum ada transaksi.</div>`;
    return;
  }
  box.innerHTML = items.map(tx => {
    const statusTag = `<span class="tag">${esc(tx.status)}</span>`;
    return `
      <div class="txItem">
        <div>
          <div style="font-weight:900;">${esc(tx.plan)} • ${esc(fmtIDR(tx.amountIDR))}</div>
          <div class="muted">Metode: ${esc(tx.method)} • ${new Date(tx.createdAt).toLocaleString("id-ID")}</div>
        </div>
        ${statusTag}
      </div>
    `;
  }).join("");
}

document.getElementById("btnCheckout").addEventListener("click", async ()=>{
  const btn = document.getElementById("btnCheckout");
  btn.disabled = true;

  const plan = document.getElementById("plan").value;
  const method = document.getElementById("method").value;

  try{
    const { payment, txId } = await postJSON("/api/billing/checkout", { plan, method });
    const payInfo = document.getElementById("payInfo");
    const payImg = document.getElementById("payImg");

    payImg.style.display = "none";
    payImg.src = "";

    let html = `<div><b>TX ID:</b> ${esc(txId)}</div>`;
    html += `<div style="margin-top:6px;"><b>${esc(payment.title)}</b></div>`;
    html += `<div style="margin-top:6px;">${esc(payment.instructions)}</div>`;
    if (payment.text) html += `<div style="margin-top:6px;"><code>${esc(payment.text)}</code></div>`;
    payInfo.innerHTML = html;

    if (payment.imageUrl) {
      payImg.src = payment.imageUrl;
      payImg.style.display = "block";
    }

    await loadTx();
  } catch(e){
    alert("Checkout gagal.");
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
  await loadPlans();
  await loadTx();
})();