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

const title = document.getElementById("title");
const type = document.getElementById("type");
const coverUrl = document.getElementById("coverUrl");
const synopsis = document.getElementById("synopsis");
const genres = document.getElementById("genres");

const contentId = document.getElementById("contentId");
const dramaboxBookId = document.getElementById("dramaboxBookId");
const epNum = document.getElementById("epNum");
const epTitle = document.getElementById("epTitle");
const videoProvider = document.getElementById("videoProvider");
const vimeoId = document.getElementById("vimeoId");
const videoUrl = document.getElementById("videoUrl");
const thumbUrl = document.getElementById("thumbUrl");

const msg1 = document.getElementById("msg1");
const msg2 = document.getElementById("msg2");
const msg3 = document.getElementById("msg3");
const msgDramabox = document.getElementById("msgDramabox");

const txTable = document.getElementById("txTable");
const txStatus = document.getElementById("txStatus");

const uname = document.getElementById("uname");
const days = document.getElementById("days");

function setMsg(el, text, ok) {
  el.textContent = text || "";
  el.style.color = ok ? "rgba(110,231,255,.95)" : "rgba(255,180,180,.95)";
}

function normalizeProvider(p) {
  const s = String(p || "").trim().toLowerCase();
  return s === "vimeo" ? "vimeo" : "url";
}

function toggleProviderUI() {
  const p = normalizeProvider(videoProvider.value);
  if (p === "vimeo") {
    vimeoId.style.display = "";
    videoUrl.style.display = "none";
    videoUrl.value = "";
  } else {
    vimeoId.style.display = "none";
    vimeoId.value = "";
    videoUrl.style.display = "";
  }
}

videoProvider?.addEventListener("change", toggleProviderUI);

async function loadContents() {
  const r = await getJSON("/api/admin/contents");
  contentId.innerHTML = (r.items || [])
    .map((x) => {
      const bid = String(x.dramaboxBookId || "").replace(/"/g, "&quot;");
      return `<option value="${x._id}" data-bookid="${bid}">${x.title} (${x.type}) - ${x.episodesCount} eps</option>`;
    })
    .join("");

  // preload bookId untuk konten terpilih
  const opt = contentId.options[contentId.selectedIndex];
  if (dramaboxBookId && opt) dramaboxBookId.value = opt.getAttribute("data-bookid") || "";
}

contentId?.addEventListener("change", () => {
  const opt = contentId.options[contentId.selectedIndex];
  if (dramaboxBookId && opt) dramaboxBookId.value = opt.getAttribute("data-bookid") || "";
  setMsg(msgDramabox, "", true);
});

async function saveDramaboxBookId() {
  try {
    setMsg(msgDramabox, "Menyimpan BookId...", true);
    await postJSON("/api/admin/content/set-dramabox", {
      contentId: contentId.value,
      bookId: String(dramaboxBookId.value || "").trim()
    });
    setMsg(msgDramabox, "OK. BookId tersimpan di konten.", true);
  } catch (e) {
    setMsg(msgDramabox, `Gagal: ${e && e.error ? e.error : "ERROR"}`, false);
  }
}

async function syncDramaboxEpisodes() {
  try {
    setMsg(msgDramabox, "Sync episode (metadata) dari Dramabox...", true);
    const r = await postJSON("/api/admin/content/sync-dramabox", {
      contentId: contentId.value,
      bookId: String(dramaboxBookId.value || "").trim()
    });
    setMsg(
      msgDramabox,
      `OK. Sync selesai. Total: ${r.total} eps (baru: ${r.created}, update: ${r.updated}).`,
      true
    );
    await loadContents();
  } catch (e) {
    const code = e && e.error ? e.error : "ERROR";
    setMsg(msgDramabox, `Gagal: ${code}`, false);
  }
}

async function addContent() {
  try {
    setMsg(msg1, "Memproses...", true);
    const body = {
      title: title.value,
      type: type.value,
      coverUrl: coverUrl.value,
      synopsis: synopsis.value,
      genres: genres.value
    };
    const r = await postJSON("/api/admin/content", body);
    setMsg(msg1, "OK. Konten berhasil ditambahkan.", true);
    await loadContents();
    if (r && r._id) contentId.value = r._id;
  } catch (e) {
    setMsg(msg1, `Gagal: ${e && e.error ? e.error : "ERROR"}`, false);
  }
}

async function addEpisode() {
  try {
    setMsg(msg2, "Memproses...", true);

    const p = normalizeProvider(videoProvider.value);
    const ep = {
      episodeNumber: Number(epNum.value || 0),
      title: epTitle.value || "",
      thumbUrl: thumbUrl.value || "",
      videoProvider: p
    };

    if (p === "vimeo") {
      ep.vimeoId = String(vimeoId.value || "").trim();
    } else {
      ep.videoUrl = String(videoUrl.value || "").trim();
    }

    await postJSON("/api/admin/content/add-episode", { contentId: contentId.value, episode: ep });

    setMsg(msg2, "OK. Episode berhasil ditambahkan.", true);
    epNum.value = "";
    epTitle.value = "";
    vimeoId.value = "";
    videoUrl.value = "";
    thumbUrl.value = "";
  } catch (e) {
    const code = e && e.error ? e.error : "ERROR";
    let hint = "";
    if (code === "EP_EXISTS") hint = " (Episode sudah ada. Pakai tombol Update Episode.)";
    if (code === "BAD_VIMEO_ID") hint = " (Vimeo ID harus angka, contoh: 1149982593)";
    setMsg(msg2, `Gagal: ${code}${hint}`, false);
  }
}

async function updateEpisode() {
  try {
    setMsg(msg2, "Memproses update...", true);

    const p = normalizeProvider(videoProvider.value);
    const body = {
      contentId: contentId.value,
      episodeNumber: Number(epNum.value || 0),
      title: epTitle.value || "",
      thumbUrl: thumbUrl.value || "",
      videoProvider: p
    };

    if (p === "vimeo") {
      body.vimeoId = String(vimeoId.value || "").trim();
    } else {
      body.videoUrl = String(videoUrl.value || "").trim();
    }

    await postJSON("/api/admin/content/update-episode", body);

    setMsg(msg2, "OK. Episode berhasil di-update.", true);
  } catch (e) {
    const code = e && e.error ? e.error : "ERROR";
    let hint = "";
    if (code === "BAD_VIMEO_ID") hint = " (Vimeo ID harus angka, contoh: 1149982593)";
    setMsg(msg2, `Gagal: ${code}${hint}`, false);
  }
}

async function loadTransactions() {
  try {
    const status = (txStatus && txStatus.value) ? txStatus.value : "PENDING";
    const r = await getJSON(`/api/admin/transactions?status=${encodeURIComponent(status)}`);
    const items = r.items || [];
    if (!items.length) {
      txTable.innerHTML = `<div class="small">Tidak ada transaksi.</div>`;
      return;
    }

    txTable.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="text-align:left;opacity:.9">
            <th style="padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">Waktu</th>
            <th style="padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">User</th>
            <th style="padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">Plan</th>
            <th style="padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">Bukti</th>
            <th style="padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">Status</th>
            <th style="padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((t) => {
              const uname = (t.userId && t.userId.username) ? t.userId.username : (t.userId || "-");
              const bukti = t.proofDataUrl
                ? `<a href="${t.proofDataUrl}" target="_blank" rel="noopener">Lihat</a>`
                : (t.proofUrl ? `<a href="${t.proofUrl}" target="_blank" rel="noopener">Lihat</a>` : `<span style="opacity:.65">-</span>`);
              const action =
                String(t.status) === "PENDING"
                  ? `<button class="primary" onclick="markPaid('${t._id}')">Mark PAID</button>`
                  : `<span style="opacity:.65">-</span>`;
              return `
                <tr>
                  <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${new Date(t.createdAt).toLocaleString("id-ID")}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${uname}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${t.plan || "-"}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${bukti}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${t.status}</td>
                  <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${action}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  } catch {
    txTable.innerHTML = `<div class="small">Gagal memuat transaksi.</div>`;
  }
}

async function markPaid(txId) {
  try {
    await postJSON("/api/admin/transaction/mark-paid", { txId });
    await loadTransactions();
  } catch (e) {
    alert(`Gagal: ${e && e.error ? e.error : "ERROR"}`);
  }
}

async function grant() {
  try {
    setMsg(msg3, "Memproses...", true);
    await postJSON("/api/admin/user/grant-premium", { username: uname.value, days: Number(days.value || 30) });
    setMsg(msg3, "OK. Premium diberikan.", true);
  } catch (e) {
    setMsg(msg3, `Gagal: ${e && e.error ? e.error : "ERROR"}`, false);
  }
}

window.addContent = addContent;
window.addEpisode = addEpisode;
window.updateEpisode = updateEpisode;
window.markPaid = markPaid;
window.grant = grant;
window.saveDramaboxBookId = saveDramaboxBookId;
window.syncDramaboxEpisodes = syncDramaboxEpisodes;

(async function init() {
  await loadContents();
  toggleProviderUI();
  await loadTransactions();
  txStatus?.addEventListener("change", loadTransactions);
})();