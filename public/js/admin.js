async function getJSON(u) {
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw j;
  return j;
}
async function postJSON(u, body) {
  const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw j;
  return j;
}

const title = document.getElementById("title");
const type = document.getElementById("type");
const coverUrl = document.getElementById("coverUrl");
const genres = document.getElementById("genres");
const synopsis = document.getElementById("synopsis");

const contentId = document.getElementById("contentId");
const epNum = document.getElementById("epNum");
const epTitle = document.getElementById("epTitle");
const videoUrl = document.getElementById("videoUrl");
const thumbUrl = document.getElementById("thumbUrl");

const msg1 = document.getElementById("msg1");
const msg2 = document.getElementById("msg2");
const msg3 = document.getElementById("msg3");

const txTable = document.getElementById("txTable");

const uname = document.getElementById("uname");
const days = document.getElementById("days");

async function logout() {
  await postJSON("/api/auth/logout", {});
  location.href = "/login";
}

async function guardAdmin() {
  const me = await getJSON("/api/auth/me");
  if (!me.user) return (location.href = "/login");
  if (!me.user.isAdmin) return (location.href = "/app");
}

async function loadContents() {
  const data = await getJSON("/api/admin/contents");
  contentId.innerHTML = (data.items || [])
    .map((c) => `<option value="${c._id}">${c.title} (${c.type}) • eps:${c.episodesCount}</option>`)
    .join("");
}

async function addContent() {
  msg1.textContent = "";
  try {
    await postJSON("/api/admin/content", {
      title: title.value,
      type: type.value,
      coverUrl: coverUrl.value,
      genres: genres.value,
      synopsis: synopsis.value
    });
    msg1.textContent = "Film ditambahkan.";
    await loadContents();
  } catch (e) {
    msg1.textContent = e.error || "Gagal menambah film.";
  }
}

async function addEpisode() {
  msg2.textContent = "";
  try {
    await postJSON("/api/admin/content/add-episode", {
      contentId: contentId.value,
      episode: {
        episodeNumber: Number(epNum.value),
        videoUrl: videoUrl.value,
        title: epTitle.value,
        thumbUrl: thumbUrl.value
      }
    });
    msg2.textContent = "Episode ditambahkan.";
    await loadContents();
  } catch (e) {
    msg2.textContent = e.error || "Gagal menambah episode.";
  }
}

async function loadTx() {
  const statusSel = document.getElementById("txStatus");
  const statusVal = statusSel ? String(statusSel.value || "PENDING") : "PENDING";

  const data = await getJSON(`/api/admin/transactions?status=${encodeURIComponent(statusVal)}`);
  const items = data.items || [];

  if (!items.length) {
    txTable.innerHTML = `<div class="small">Tidak ada transaksi.</div>`;
    return;
  }

  txTable.innerHTML = `
    <table>
      <tr>
        <th>Tanggal</th>
        <th>User</th>
        <th>Plan</th>
        <th>Method</th>
        <th>Status</th>
        <th>Bukti</th>
        <th>Action</th>
      </tr>
      ${items
        .map((t) => {
          const uname = (t.userId && t.userId.username) ? t.userId.username : (t.userId || "-");
          const bukti = t.proofDataUrl
            ? `<a href="${t.proofDataUrl}" target="_blank" rel="noopener">Lihat</a>`
            : (t.proofUrl ? `<a href="${t.proofUrl}" target="_blank" rel="noopener">Lihat</a>` : `<span class="small">-</span>`);
          const action =
            String(t.status) === "PENDING"
              ? `<button class="primary" onclick="markPaid('${t._id}')">Mark PAID</button>`
              : `<span class="small">-</span>`;
          return `
            <tr>
              <td>${new Date(t.createdAt).toLocaleString("id-ID")}</td>
              <td>${uname}</td>
              <td>${t.plan}</td>
              <td>${t.method}</td>
              <td>${t.status}</td>
              <td>${bukti}</td>
              <td>${action}</td>
            </tr>
          `;
        })
        .join("")}
    </table>
  `;
}

async function markPaid(txId) {
  await postJSON("/api/admin/transaction/mark-paid", { txId });
  await loadTx();
  alert("PAID + premium granted.");
}

async function grant() {
  msg3.textContent = "";
  try {
    await postJSON("/api/admin/user/grant-premium", { username: uname.value, days: Number(days.value) });
    msg3.textContent = "Premium diberikan.";
  } catch (e) {
    msg3.textContent = e.error || "Gagal grant.";
  }
}

(async function init() {
  await guardAdmin();
  const txStatus = document.getElementById("txStatus");
  if (txStatus) txStatus.onchange = loadTx;

  await loadContents();
  await loadTx();
})();

// expose untuk onclick html
window.logout = logout;
window.addContent = addContent;
window.addEpisode = addEpisode;
window.loadTx = loadTx;
window.markPaid = markPaid;
window.grant = grant;