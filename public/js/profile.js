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
      Admin akan lihat bukti + username kamu di panel admin, lalu set <b>PAID</b>.
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

    payBox.innerHTML = `
      <div style="border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:12px">
        <div style="font-weight:900">${esc(out.payment.title)}</div>
        <div class="small">TX ID: <code>${esc(out.txId)}</code></div>
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
    payBox.innerHTML = `<div class="small">Gagal membuat transaksi: ${esc(e.error || "error")}</div>`;
  }
};

async function load() {
  const data = await getJSON("/api/profile");
  renderUser(data.user);
  renderTx(data.transactions || []);
}

load();