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

async function loadMovies() {
  const data = await getJSON("/api/admin/movies");
  moviePick.innerHTML = data.items
    .map((m) => `<option value="${m._id}">${m.title} (${m.type}) • ep:${m.episodesCount}</option>`)
    .join("");
}

async function createMovie() {
  msgMovie.textContent = "";
  try {
    await postJSON("/api/admin/movies", {
      title: title.value,
      type: type.value,
      coverUrl: coverUrl.value,
      genres: genres.value,
      synopsis: synopsis.value
    });
    msgMovie.textContent = "Film berhasil ditambahkan.";
    title.value = coverUrl.value = genres.value = synopsis.value = "";
    await loadMovies();
  } catch (e) {
    msgMovie.textContent = e.error || "Error";
  }
}

async function addEpisode() {
  msgEp.textContent = "";
  try {
    await postJSON("/api/admin/episodes", {
      movieId: moviePick.value,
      epNo: epNo.value,
      videoUrl: epUrl.value,
      title: epTitle.value,
      thumbUrl: epThumb.value
    });
    msgEp.textContent = "Episode berhasil ditambahkan.";
    epNo.value = epUrl.value = epTitle.value = epThumb.value = "";
    await loadMovies();
  } catch (e) {
    msgEp.textContent = e.error || "Error";
  }
}

async function markPaid(txId) {
  if (!confirm("Mark PAID dan grant premium?")) return;
  try {
    await postJSON("/api/admin/mark-paid", { txId });
    await loadTx();
    await loadUsers();
  } catch (e) {
    alert(e.error || "Error");
  }
}

async function grantPremium() {
  msgGrant.textContent = "";
  try {
    const out = await postJSON("/api/admin/grant", { username: grantUser.value, days: grantDays.value });
    msgGrant.textContent = `OK. premiumUntil: ${new Date(out.premiumUntil).toLocaleString()}`;
    await loadUsers();
  } catch (e) {
    msgGrant.textContent = e.error || "Error";
  }
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ===== Proof modal =====
function closeProof(evt) {
  if (evt && evt.target && evt.target.id !== "proofModal") return;
  proofModal.style.display = "none";
  proofBody.innerHTML = "";
}

async function openProof(txId) {
  const data = await getJSON("/api/admin/transactions?status=PENDING");
  const tx = (data.items || []).find((x) => String(x._id) === String(txId));
  if (!tx) return;

  const src = tx.proofDataUrl || tx.proofUrl || "";
  proofBody.innerHTML = src
    ? `
      <div class="small" style="margin-bottom:8px">TX ID: <b>${escapeHtml(txId)}</b></div>
      <div class="small" style="margin-bottom:10px">User: <b>${escapeHtml(tx.user?.username || tx.userId || "-")}</b></div>
      <img src="${escapeHtml(src)}" alt="bukti">
      ${tx.proofUrl ? `<div style="margin-top:10px"><a class="link" href="${escapeHtml(tx.proofUrl)}" target="_blank" rel="noopener">Buka link bukti</a></div>` : ""}
    `
    : `<div class="small">Belum ada bukti.</div>`;
  proofModal.style.display = "flex";
}

// ===== Tables =====
async function loadTx() {
  const data = await getJSON("/api/admin/transactions?status=PENDING");
  if (!data.items.length) {
    txTable.innerHTML = `<div class="small">Tidak ada transaksi pending.</div>`;
    return;
  }
  txTable.innerHTML = `
    <table>
      <tr>
        <th>TX ID</th>
        <th>User</th>
        <th>Plan</th>
        <th>Method</th>
        <th>Nominal</th>
        <th>Bukti</th>
        <th>Action</th>
      </tr>
      ${data.items
        .map(
          (t) => `
        <tr>
          <td>${t._id}</td>
          <td>
            <div style="font-weight:900">${escapeHtml(t.user?.username || "-")}</div>
            <div class="small">${escapeHtml(t.userId || "")}</div>
          </td>
          <td>${t.plan}</td>
          <td>${t.method}</td>
          <td>Rp ${(t.amountIDR || 0).toLocaleString("id-ID")}</td>
          <td>
            ${
              (t.proofDataUrl || t.proofUrl)
                ? `<img class="thumb" src="${escapeHtml(t.proofDataUrl || t.proofUrl)}" alt="bukti">`
                : `<span class="small">-</span>`
            }
            ${(t.proofDataUrl || t.proofUrl) ? `<div style="margin-top:6px"><a class="link" href="#" onclick="openProof('${t._id}');return false;">Lihat</a></div>` : ``}
          </td>
          <td><button class="btn primary" onclick="markPaid('${t._id}')">Mark PAID</button></td>
        </tr>
      `
        )
        .join("")}
    </table>
  `;
}

async function loadUsers() {
  const data = await getJSON("/api/admin/users?limit=200");
  if (!data.items.length) {
    userTable.innerHTML = `<div class="small">Belum ada user.</div>`;
    return;
  }
  userTable.innerHTML = `
    <table>
      <tr>
        <th>Username</th>
        <th>Status</th>
        <th>Premium Until</th>
        <th>Unlocked</th>
        <th>Created</th>
      </tr>
      ${data.items
        .map((u) => {
          const st = u.premiumActive ? `<span class="tag">Premium</span>` : `<span class="tag">Free</span>`;
          return `
            <tr>
              <td>
                <div style="display:flex;gap:10px;align-items:center">
                  ${
                    u.avatarUrl
                      ? `<img class="thumb" src="${escapeHtml(u.avatarUrl)}" alt="av">`
                      : `<div class="thumb" style="display:grid;place-items:center;color:rgba(255,255,255,.55)">-</div>`
                  }
                  <div>
                    <div style="font-weight:900">${escapeHtml(u.username)}</div>
                    <div class="small">${escapeHtml(u._id || "")}</div>
                  </div>
                </div>
              </td>
              <td>${st}</td>
              <td class="small">${u.premiumUntil ? new Date(u.premiumUntil).toLocaleString() : "-"}</td>
              <td class="small">${(u.unlockedCount || 0)}/${u.freeEpisodesLimit || 10}</td>
              <td class="small">${u.createdAt ? new Date(u.createdAt).toLocaleString() : "-"}</td>
            </tr>
          `;
        })
        .join("")}
    </table>
  `;
}

loadMovies();
loadTx();
loadUsers();