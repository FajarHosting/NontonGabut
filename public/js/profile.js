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
  } else {
    txBox.innerHTML = `
      <table>
        <tr><th>Tanggal</th><th>Plan</th><th>Metode</th><th>Status</th></tr>
        ${data.transactions.map(t => `
          <tr>
            <td>${new Date(t.createdAt).toLocaleString()}</td>
            <td>${t.plan}</td>
            <td>${t.method}</td>
            <td>${t.status}</td>
          </tr>
        `).join("")}
      </table>
    `;
  }
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
      </div>
    `;
    await load();
  } catch (e) {
    payBox.innerHTML = `<div class="small">Gagal membuat transaksi: ${e.error || "error"}</div>`;
  }
}

load();