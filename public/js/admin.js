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

async function guardAdmin() {
  const me = await getJSON("/api/auth/me");
  if (!me.user) location.href = "/login";
  if (!me.user.isAdmin) location.href = "/app";
}

async function loadContents() {
  const data = await getJSON("/api/admin/contents");
  contentId.innerHTML = data.items.map(i => `<option value="${i._id}">${i.title} (${i.type}) • ep:${i.episodeCount}</option>`).join("");
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
  const data = await getJSON("/api/admin/transactions?status=PENDING");
  if (!data.items.length) {
    txTable.innerHTML = `<div class="small">Tidak ada transaksi pending.</div>`;
    return;
  }
  txTable.innerHTML = `
    <table>
      <tr><th>TX ID</th><th>User</th><th>Plan</th><th>Method</th><th>Action</th></tr>
      ${data.items.map(t => `
        <tr>
          <td>${t._id}</td>
          <td>${t.userId}</td>
          <td>${t.plan}</td>
          <td>${t.method}</td>
          <td><button class="primary" onclick="markPaid('${t._id}')">Mark PAID</button></td>
        </tr>
      `).join("")}
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
  await loadContents();
  await loadTx();
})();