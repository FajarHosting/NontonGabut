async function getJSON(u) {
  const r = await fetch(u);
  const j = await r.json();
  if (!r.ok) throw j;
  return j;
}
async function postJSON(u, body) {
  const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw j;
  return j;
}

async function logout() {
  await postJSON("/api/auth/logout", {});
  location.href = "/login";
}

async function load() {
  const data = await getJSON("/api/profile");
  info.textContent = data.user.username;
  meta.innerHTML = `
    Status: <b>${data.user.premiumActive ? "Premium" : "Free"}</b><br>
    Premium Until: ${data.user.premiumUntil ? new Date(data.user.premiumUntil).toLocaleString() : "-"}<br>
    Unlocked: ${data.user.unlockedCount}/${data.user.freeEpisodesLimit}
  `;

  if (data.user.avatarUrl) {
    av.src = data.user.avatarUrl;
    av.style.display = "block";
    avfb.style.display = "none";
  }

  // tx table
  if (!data.transactions.length) {
    txBox.innerHTML = `<div class="small">Belum ada transaksi.</div>`;
    return;
  }

  txBox.innerHTML = `
    <table>
      <tr>
        <th>Tanggal</th><th>Plan</th><th>Metode</th><th>Nominal</th><th>Status</th><th>Bukti</th><th>Aksi</th>
      </tr>
      ${data.transactions.map((t) => {
        const nominal = (t.amountIDR || 0).toLocaleString("id-ID");
        const hasProof = (t.proofDataUrl && t.proofDataUrl.startsWith("data:image")) || (t.proofUrl && t.proofUrl.startsWith("http"));
        const proofThumb = t.proofDataUrl || t.proofUrl || "";
        const statusPill = `<span class="pill">${t.status}</span>`;

        return `
          <tr>
            <td>${new Date(t.createdAt).toLocaleString()}</td>
            <td>${t.plan}</td>
            <td>${t.method}</td>
            <td>Rp ${nominal}</td>
            <td>${statusPill}</td>
            <td>
              ${hasProof ? `<img class="thumb" src="${escapeHtml(proofThumb)}" alt="bukti">` : `<span class="small">-</span>`}
            </td>
            <td>
              <div class="txActions">
                ${hasProof ? `<button onclick="openProof('${t._id}')">Lihat</button>` : ``}
                ${t.status === "PENDING" ? `<button class="btn primary" onclick="openUpload('${t._id}')">Upload Bukti</button>` : ``}
              </div>
            </td>
          </tr>
        `;
      }).join("")}
    </table>
  `;
}

async function saveAvatar() {
  msg.textContent = "";
  try {
    await postJSON("/api/profile/avatar", { avatarUrl: url.value });
    msg.textContent = "Logo tersimpan.";
    await load();
  } catch (e) {
    msg.textContent = e.error || "URL tidak valid.";
  }
}

async function createTx() {
  payBox.innerHTML = "";
  try {
    const out = await postJSON("/api/billing/create", { plan: plan.value, method: method.value });
    payBox.innerHTML = `
      <div class="card" style="border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:12px">
        <div style="font-weight:900">${out.payment.title}</div>
        <div class="small">TX ID: ${out.txId}</div>
        <div style="margin-top:10px">
          <img src="${out.payment.imageUrl}" style="width:220px;max-width:100%;border-radius:14px;border:1px solid rgba(255,255,255,.12)">
        </div>
        <div class="small" style="margin-top:10px">${out.payment.text}</div>
        <div style="margin-top:10px" class="row">
          <button class="btn primary" onclick="openUpload('${out.txId}')">Upload Bukti Sekarang</button>
          <button class="btn" onclick="navigator.clipboard?.writeText('${out.txId}')">Copy TX ID</button>
        </div>
      </div>
    `;
    await load();
  } catch (e) {
    payBox.innerHTML = `<div class="small">Gagal membuat transaksi: ${e.error || "error"}</div>`;
  }
}

// ===== Bukti transaksi (modal) =====
function closeProof(evt) {
  if (evt && evt.target && evt.target.id !== "proofModal") return;
  proofModal.style.display = "none";
  proofBody.innerHTML = "-";
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function openProof(txId) {
  const data = await getJSON("/api/profile");
  const tx = (data.transactions || []).find((x) => String(x._id) === String(txId));
  if (!tx) return;
  const src = tx.proofDataUrl || tx.proofUrl || "";
  proofBody.innerHTML = src
    ? `
      <div class="small" style="margin-bottom:8px">TX ID: <b>${escapeHtml(txId)}</b></div>
      <img src="${escapeHtml(src)}" alt="bukti">
      ${tx.proofUrl ? `<div style="margin-top:8px"><a class="link" href="${escapeHtml(tx.proofUrl)}" target="_blank" rel="noopener">Buka link bukti</a></div>` : ""}
    `
    : `<div class="small">Belum ada bukti.</div>`;
  proofModal.style.display = "flex";
}

async function openUpload(txId) {
  proofBody.innerHTML = `
    <div class="small" style="margin-bottom:10px">Upload bukti transaksi untuk TX ID: <b>${escapeHtml(txId)}</b></div>
    <div class="card" style="padding:12px">
      <div class="small" style="margin-bottom:8px">Opsi A (disarankan): pilih gambar (akan dikompres otomatis).</div>
      <input id="pfFile" type="file" accept="image/*">
      <div class="small" style="margin:10px 0 8px">Opsi B: tempel link bukti (Google Drive/host gambar).</div>
      <input id="pfUrl" placeholder="https://...">
      <div class="row" style="margin-top:10px">
        <button class="btn primary" id="pfSubmit">Kirim Bukti</button>
        <button class="btn" onclick="closeProof()">Batal</button>
      </div>
      <div class="small" id="pfMsg" style="margin-top:10px"></div>
    </div>
  `;
  proofModal.style.display = "flex";

  pfSubmit.onclick = async () => {
    pfMsg.textContent = "";
    try {
      const file = pfFile.files && pfFile.files[0];
      let proofDataUrl = "";
      if (file) {
        proofDataUrl = await compressImageToDataUrl(file, 900, 0.78, 950 * 1024);
      }
      const url = String(pfUrl.value || "").trim();
      await postJSON("/api/billing/proof", {
        txId,
        proofDataUrl,
        proofUrl: url,
        proofFileName: file ? file.name : ""
      });
      pfMsg.textContent = "Bukti terkirim. Menunggu admin verifikasi.";
      await load();
      setTimeout(() => closeProof(), 600);
    } catch (e) {
      pfMsg.textContent = e.error || "Gagal upload bukti.";
    }
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("READ_FAIL"));
    fr.readAsDataURL(file);
  });
}

async function compressImageToDataUrl(file, maxW, quality, maxBytes) {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("IMG_FAIL"));
    im.src = dataUrl;
  });

  const ratio = img.width > maxW ? maxW / img.width : 1;
  const w = Math.max(1, Math.floor(img.width * ratio));
  const h = Math.max(1, Math.floor(img.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  // iterative quality down until under maxBytes
  let q = quality;
  let out = canvas.toDataURL("image/jpeg", q);
  for (let i = 0; i < 6; i++) {
    const b64 = out.split(",")[1] || "";
    const bytes = Math.floor((b64.length * 3) / 4);
    if (bytes <= maxBytes) return out;
    q = Math.max(0.4, q - 0.1);
    out = canvas.toDataURL("image/jpeg", q);
  }
  return out;
}

load();