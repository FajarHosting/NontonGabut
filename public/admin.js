import { API_BASE } from "./config.js";

const avatar = document.getElementById("avatar");
const btnLogout = document.getElementById("btnLogout");
const guard = document.getElementById("guard");

const sTitle = document.getElementById("sTitle");
const sType = document.getElementById("sType");
const sGenre = document.getElementById("sGenre");
const sThumb = document.getElementById("sThumb");
const sDesc = document.getElementById("sDesc");
const btnCreateSeries = document.getElementById("btnCreateSeries");
const seriesMsg = document.getElementById("seriesMsg");

const btnReloadSeries = document.getElementById("btnReloadSeries");
const seriesList = document.getElementById("seriesList");

const eSeriesId = document.getElementById("eSeriesId");
const eNum = document.getElementById("eNum");
const eTitle = document.getElementById("eTitle");
const eVideo = document.getElementById("eVideo");
const eLockAfterFree = document.getElementById("eLockAfterFree");
const btnSaveEp = document.getElementById("btnSaveEp");
const epMsg = document.getElementById("epMsg");

const lSeriesId = document.getElementById("lSeriesId");
const lNum = document.getElementById("lNum");
const btnLock = document.getElementById("btnLock");
const btnUnlock = document.getElementById("btnUnlock");
const lockMsg = document.getElementById("lockMsg");

const gEmail = document.getElementById("gEmail");
const gPlan = document.getElementById("gPlan");
const btnGrant = document.getElementById("btnGrant");
const grantMsg = document.getElementById("grantMsg");

const btnReloadPay = document.getElementById("btnReloadPay");
const payList = document.getElementById("payList");

function getToken(){ return localStorage.getItem("token") || ""; }
function logout(){ localStorage.removeItem("token"); window.location.href="./login.html"; }
btnLogout.addEventListener("click", logout);

function setHint(el, t, ok=false){
  el.textContent = t || "";
  el.className = ok ? "hint ok" : "hint";
}

async function api(path, { method="GET", body } = {}){
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type":"application/json",
      "Authorization": `Bearer ${getToken()}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}

function esc(s){
  return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

async function guardAdmin(){
  try {
    const me = await api("/api/me");
    avatar.textContent = (me.user.email || "A").slice(0,1).toUpperCase();
    await api("/api/admin/series");
    guard.textContent = "Akses admin OK.";
  } catch (e) {
    guard.textContent = "Akses ditolak: " + (e?.message || String(e));
    throw e;
  }
}

async function loadSeries(){
  seriesList.innerHTML = `<div class="muted">Memuat...</div>`;
  try {
    const data = await api("/api/admin/series");
    const items = data.items || [];
    if (!items.length) { seriesList.innerHTML = `<div class="muted">Belum ada series.</div>`; return; }

    seriesList.innerHTML = items.map(s => `
      <div class="listItem">
        <div>
          <div><b>${esc(s.title)}</b> • ${esc((s.type||"").toUpperCase())} • ${esc(s.genre||"-")}</div>
          <div class="muted small">ID: <code>${esc(s.id)}</code></div>
        </div>
        <div class="actions">
          <button class="btn small" data-pick="${esc(s.id)}">Pakai ID</button>
        </div>
      </div>
    `).join("");

    seriesList.querySelectorAll("[data-pick]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-pick");
        eSeriesId.value = id;
        lSeriesId.value = id;
        setHint(seriesMsg, `Series ID dipilih: ${id}`, true);
      });
    });
  } catch (e) {
    seriesList.innerHTML = `<div class="hint">Gagal: ${esc(e?.message || String(e))}</div>`;
  }
}

btnReloadSeries.addEventListener("click", loadSeries);

btnCreateSeries.addEventListener("click", async () => {
  setHint(seriesMsg, "Menyimpan...");
  try {
    const data = await api("/api/admin/series", {
      method: "POST",
      body: {
        title: sTitle.value.trim(),
        type: sType.value,
        genre: sGenre.value.trim(),
        thumbUrl: sThumb.value.trim(),
        description: sDesc.value.trim()
      }
    });
    setHint(seriesMsg, `Series tersimpan. ID: ${data.id}`, true);
    sTitle.value=""; sGenre.value=""; sThumb.value=""; sDesc.value="";
    await loadSeries();
  } catch (e) {
    setHint(seriesMsg, "Gagal: " + (e?.message || String(e)));
  }
});

btnSaveEp.addEventListener("click", async () => {
  setHint(epMsg, "Menyimpan episode...");
  try {
    await api("/api/admin/episode", {
      method: "POST",
      body: {
        seriesId: eSeriesId.value.trim(),
        episodeNumber: Number(eNum.value || 0),
        title: eTitle.value.trim(),
        videoUrl: eVideo.value.trim(),
        lockAfterFree: !!eLockAfterFree.checked
      }
    });
    setHint(epMsg, "Episode tersimpan.", true);
    eNum.value=""; eTitle.value=""; eVideo.value="";
  } catch (e) {
    setHint(epMsg, "Gagal: " + (e?.message || String(e)));
  }
});

btnLock.addEventListener("click", async () => {
  setHint(lockMsg, "Mengunci...");
  try {
    await api("/api/admin/lock", {
      method: "POST",
      body: { seriesId: lSeriesId.value.trim(), episodeNumber: Number(lNum.value||0), locked: true }
    });
    setHint(lockMsg, "Episode terkunci (manual).", true);
  } catch (e) { setHint(lockMsg, "Gagal: " + (e?.message || String(e))); }
});

btnUnlock.addEventListener("click", async () => {
  setHint(lockMsg, "Membuka...");
  try {
    await api("/api/admin/lock", {
      method: "POST",
      body: { seriesId: lSeriesId.value.trim(), episodeNumber: Number(lNum.value||0), locked: false }
    });
    setHint(lockMsg, "Episode dibuka (manual).", true);
  } catch (e) { setHint(lockMsg, "Gagal: " + (e?.message || String(e))); }
});

btnGrant.addEventListener("click", async () => {
  setHint(grantMsg, "Memproses...");
  try {
    const data = await api("/api/admin/grant", {
      method: "POST",
      body: { targetEmail: gEmail.value.trim(), plan: gPlan.value }
    });
    setHint(grantMsg, `Berhasil. Aktif sampai: ${new Date(data.until).toLocaleString()}`, true);
    gEmail.value = "";
  } catch (e) {
    setHint(grantMsg, "Gagal: " + (e?.message || String(e)));
  }
});

async function loadPayments(){
  payList.innerHTML = `<div class="muted">Memuat...</div>`;
  try {
    const data = await api("/api/admin/payments");
    const items = data.items || [];
    if (!items.length) { payList.innerHTML = `<div class="muted">Tidak ada pending.</div>`; return; }

    payList.innerHTML = items.map(p => `
      <div class="listItem">
        <div>
          <div><b>${esc(p.email)}</b> • ${esc(p.plan)} • ${esc(p.method)}</div>
          <div class="muted small">Bukti: <a href="${esc(p.proofUrl)}" target="_blank">Buka</a></div>
          ${p.note ? `<div class="muted small">Catatan: ${esc(p.note)}</div>` : ``}
        </div>
        <div class="actions">
          <button class="btn small primary" data-approve="${esc(p.id)}">Approve</button>
          <button class="btn small" data-reject="${esc(p.id)}">Reject</button>
        </div>
      </div>
    `).join("");

    payList.querySelectorAll("[data-approve]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-approve");
        await api("/api/admin/approve", { method:"POST", body:{ paymentId:id, action:"approve" } });
        await loadPayments();
      });
    });

    payList.querySelectorAll("[data-reject]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-reject");
        await api("/api/admin/approve", { method:"POST", body:{ paymentId:id, action:"reject" } });
        await loadPayments();
      });
    });
  } catch (e) {
    payList.innerHTML = `<div class="hint">Gagal: ${esc(e?.message || String(e))}</div>`;
  }
}

btnReloadPay.addEventListener("click", loadPayments);

await guardAdmin();
await loadSeries();
await loadPayments();