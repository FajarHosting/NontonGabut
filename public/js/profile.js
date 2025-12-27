async function getJSON(u) {
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw j;
  return j;
}
async function postJSON(u, body) {
  const r = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw j;
  return j;
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function logout() {
  await postJSON("/api/auth/logout", {});
  location.href = "/login";
}

const msg = document.getElementById("msg");
const av = document.getElementById("av");
const avfb = document.getElementById("avfb");
const url = document.getElementById("url");
const info = document.getElementById("info");
const meta = document.getElementById("meta");
const payBox = document.getElementById("payBox");
const txBox = document.getElementById("txBox");

/* ===== COPY BUTTON (data-copy="...") ===== */
async function copyTextToClipboard(text) {
  const t = String(text ?? "");
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      document.body.removeChild(ta);
      return false;
    }
  }
}
function showCopyToast(text) {
  let el = document.getElementById("copyToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "copyToast";
    el.style.cssText =
      "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);" +
      "background:rgba(0,0,0,.75);color:#fff;padding:10px 12px;border-radius:12px;" +
      "font-weight:900;font-size:12px;z-index:9999;max-width:92vw;text-align:center;" +
      "backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.16)";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.display = "block";
  clearTimeout(window.__copyToastTimer);
  window.__copyToastTimer = setTimeout(() => (el.style.display = "none"), 1100);
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copy]");
  if (!b) return;
  const val = b.getAttribute("data-copy") || "";
  const ok = await copyTextToClipboard(val);
  showCopyToast(ok ? "Copied" : "Gagal copy");
});
/* ===== END COPY ===== */

async function compressImageToDataUrl(file, maxW = 1280, maxBytes = 950000) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });

  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);

  let q = 0.78;
  let out = canvas.toDataURL("image/jpeg", q);
  while (out.length > maxBytes && q > 0.35) {
    q -= 0.08;
    out = canvas.toDataURL("image/jpeg", q);
  }
  return out;
}

function renderUser(u) {
  info.textContent = `${u.username} • ${u.premiumActive ? "Premium Active" : "Free"}`;
  meta.textContent =
    (u.premiumUntil ? `Premium until: ${new Date(u.premiumUntil).toLocaleString("id-ID")} • ` : "") +
    `Free limit: ${u.freeEpisodesLimit} episode • Joined: ${new Date(u.createdAt).toLocaleDateString("id-ID")}`;

  url.value = u.avatarUrl || "";

  if (u.avatarUrl) {
    av.src = u.avatarUrl;
    av.style.display = "block";
    avfb.style.display = "none";
  } else {
    av.style.display = "none";
    avfb.style.display = "flex";
  }
}

function txRowHTML(t) {
  const bukti = t.proofDataUrl
    ? `<a href="${esc(t.proofDataUrl)}" target="_blank" rel="noopener">Lihat</a>`
    : (t.proofUrl ? `<a href="${esc(t.proofUrl)}" target="_blank" rel="noopener">Lihat</a>` : `<span class="small">-</span>`);

  const action = String(t.status) === "PENDING"
    ? `
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <button class="primary" onclick="pickProof('${esc(t._id)}')" style="padding:10px 12px;">Upload Bukti</button>
        <span class="small" id="proofMsg_${esc(t._id)}"></span>
        <input id="proofFile_${esc(t._id)}" type="file" accept="image/*" style="display:none" onchange="onProofFile('${esc(t._id)}', this)">
      </div>
    `
    : `<span class="small">-</span>`;

  return `
    <tr>
      <td>${new Date(t.createdAt).toLocaleString("id-ID")}</td>
      <td>${esc(t.plan)}</td>
      <td>${esc(t.method)}</td>
      <td>${esc(t.status)}</td>
      <td>${bukti}</td>
      <td>${action}</td>
    </tr>
  `;
}

function renderTx(list) {
  if (!list || !list.length) {
    txBox.innerHTML = `<div class="small">Belum ada transaksi.</div>`;
    return;
  }

  txBox.innerHTML = `
    <table>
      <tr>
        <th>Tanggal</th>
        <th>Plan</th>
        <th>Metode</th>
        <th>Status</th>
        <th>Bukti</th>
        <th>Aksi</th>
      </tr>
      ${list.map(txRowHTML).join("")}
    </table>
    <div class="small" style="margin-top:10px;opacity:.95">
      Tips: setelah kamu <b>Buat Pembayaran</b> dan transfer, upload bukti di transaksi <b>PENDING</b>.
    </div>
  `;
}

window.pickProof = function (txId) {
  const el = document.getElementById(`proofFile_${txId}`);
  if (el) el.click();
};

window.onProofFile = async function (txId, input) {
  const m = document.getElementById(`proofMsg_${txId}`);
  m.textContent = "Kompres...";
  const f = input.files && input.files[0];
  if (!f) {
    m.textContent = "";
    return;
  }

  try {
    const dataUrl = await compressImageToDataUrl(f);
    m.textContent = "Mengirim...";
    await postJSON("/api/billing/proof", {
      txId,
      proofDataUrl: dataUrl,
      proofFileName: f.name,
      proofMime: f.type || "image/jpeg"
    });
    m.textContent = "Terkirim.";
    await load();
  } catch (e) {
    m.textContent = e?.error || "Gagal.";
  } finally {
    input.value = "";
  }
};

async function saveAvatar() {
  msg.textContent = "";
  try {
    await postJSON("/api/profile/avatar", { avatarUrl: url.value });
    msg.textContent = "Logo profil disimpan.";
    await load();
  } catch (e) {
    msg.textContent = e.error || "Gagal simpan logo.";
  }
}

window.saveAvatar = saveAvatar;
window.logout = logout;

window.createTx = async function () {
  payBox.innerHTML = "";
  try {
    const plan = document.getElementById("plan").value;
    const method = document.getElementById("method").value;

    const out = await postJSON("/api/billing/create", { plan, method });

    const copyFields = (out.payment && out.payment.copyFields) ? out.payment.copyFields : [];
    const fieldsHTML = copyFields
      .filter(f => String(f.value || "").trim())
      .map(f => `
        <div style="margin-top:10px">
          <div class="small" style="opacity:.9">${esc(f.label)}</div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:6px">
            <code style="padding:6px 10px;border-radius:12px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12)">${esc(f.value)}</code>
            <button class="primary" style="padding:9px 12px" data-copy="${esc(f.value)}">Copy</button>
          </div>
        </div>
      `)
      .join("");

    payBox.innerHTML = `
      <div style="border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:12px">
        <div style="font-weight:900">${esc(out.payment.title)}</div>

        <div class="small" style="margin-top:6px">
          TX ID: <code>${esc(out.txId)}</code>
          <button class="primary" style="padding:9px 12px;margin-left:8px" data-copy="${esc(out.txId)}">Copy TX</button>
        </div>

        ${fieldsHTML}

        <div style="margin-top:10px">
          <img src="${esc(out.payment.imageUrl)}" style="width:220px;max-width:100%;border-radius:14px;border:1px solid rgba(255,255,255,.12)">
        </div>

        <div class="small" style="margin-top:10px">${esc(out.payment.text)}</div>
        <div class="small" style="margin-top:10px">
          Setelah transfer, upload bukti di <b>Riwayat Transaksi</b> (status PENDING).
        </div>
      </div>
    `;
    await load();
  } catch (e) {
    const code = e && e.error ? e.error : "error";
    if (code === "PAYMENT_ACCOUNT_NOT_SET") {
      payBox.innerHTML = `<div class="small">Nomor pembayaran belum diset di ENV (DANA_NUMBER / SEABANK_ACCOUNT).</div>`;
      return;
    }
    payBox.innerHTML = `<div class="small">Gagal membuat transaksi: ${esc(code)}</div>`;
  }
};

async function load() {
  const data = await getJSON("/api/profile");
  renderUser(data.user);
  renderTx(data.transactions || []);
}

load();