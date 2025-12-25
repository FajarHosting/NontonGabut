import { API_BASE } from "./config.js";

const avatar = document.getElementById("avatar");
const btnLogout = document.getElementById("btnLogout");
const emailEl = document.getElementById("email");
const subStatus = document.getElementById("subStatus");

const danaNo = document.getElementById("danaNo");
const seaNo = document.getElementById("seaNo");
const qrisImg = document.getElementById("qrisImg");

const planEl = document.getElementById("plan");
const methodEl = document.getElementById("method");
const proofUrlEl = document.getElementById("proofUrl");
const noteEl = document.getElementById("note");
const btnSubmit = document.getElementById("btnSubmit");
const msgEl = document.getElementById("msg");

function getToken(){ return localStorage.getItem("token") || ""; }
function logout(){ localStorage.removeItem("token"); window.location.href="./login.html"; }
btnLogout.addEventListener("click", logout);

function setMsg(t, ok=false){
  msgEl.textContent = t || "";
  msgEl.className = ok ? "hint ok" : "hint";
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

async function loadMe(){
  try {
    const me = await api("/api/me");
    avatar.textContent = (me.user.email || "U").slice(0,1).toUpperCase();
    emailEl.textContent = me.user.email;

    if (me.user.isSubscribed) {
      const until = me.user.subUntil ? new Date(me.user.subUntil).toLocaleString() : "-";
      subStatus.innerHTML = `Status: <b style="color:var(--ok);">Berlangganan Aktif</b> (sampai ${until})`;
    } else {
      subStatus.innerHTML = `Status: <b style="color:var(--danger);">Free</b> (max 10 episode)`;
    }
  } catch {
    logout();
  }
}

// tampilkan info payment dari env backend (opsional). kalau belum diset, tetap tampil "-".
async function loadPaymentInfo(){
  try {
    const r = await fetch(`${API_BASE}/api/public/payment-info`).then(x=>x.json());
    if (r.ok) {
      danaNo.textContent = r.dana || "-";
      seaNo.textContent = r.seabank || "-";
      qrisImg.src = r.qrisImage || "https://via.placeholder.com/600x600?text=QRIS";
    } else {
      qrisImg.src = "https://via.placeholder.com/600x600?text=QRIS";
    }
  } catch {
    qrisImg.src = "https://via.placeholder.com/600x600?text=QRIS";
  }
}

btnSubmit.addEventListener("click", async () => {
  setMsg("Mengirim request...");
  try {
    await api("/api/payments/create", {
      method: "POST",
      body: {
        plan: planEl.value,
        method: methodEl.value,
        proofUrl: proofUrlEl.value.trim(),
        note: noteEl.value.trim()
      }
    });
    setMsg("Request terkirim. Tunggu admin approve.", true);
    proofUrlEl.value = "";
    noteEl.value = "";
  } catch (e) {
    setMsg("Gagal: " + (e?.message || String(e)));
  }
});

await loadMe();
await loadPaymentInfo();