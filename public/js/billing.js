async function getJSON(url) {
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw j;
  return j;
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok) throw j;
  return j;
}

async function logout() {
  await postJSON("/api/auth/logout", {});
  location.href = "/login";
}

// Kalau kamu pakai halaman /billing, script ini bisa:
// 1) cek login
// 2) tampilkan plan list (optional)
// 3) arahkan user untuk bayar via Profile
(async function initBilling() {
  try {
    const me = await getJSON("/api/auth/me");
    if (!me.user) {
      location.href = "/login";
      return;
    }

    // kalau halaman billing kamu punya elemen-elemen ini, dia isi.
    // kalau tidak ada, dia tetap aman (tidak crash).
    const el = (id) => document.getElementById(id);

    const userEl = el("billingUser");
    if (userEl) {
      userEl.textContent = `${me.user.username} • ${me.user.premiumActive ? "Premium" : "Free"}`;
    }

    const plansEl = el("plans");
    if (plansEl) {
      const plans = await getJSON("/api/billing/plans");
      plansEl.innerHTML = (plans.plans || [])
        .map(p => `<div style="padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:14px;margin-bottom:10px">
          <div style="font-weight:900">${p.label}</div>
          <div style="opacity:.8;font-size:12px">Rp ${p.price.toLocaleString("id-ID")}</div>
        </div>`)
        .join("");
    }

    const goProfileBtn = el("goProfileBtn");
    if (goProfileBtn) {
      goProfileBtn.onclick = () => (location.href = "/profile");
    }

    const logoutBtn = el("logoutBtn");
    if (logoutBtn) {
      logoutBtn.onclick = logout;
    }

  } catch (e) {
    // kalau error, jangan bikin blank/crash
    console.warn("billing init error:", e);
  }
})();