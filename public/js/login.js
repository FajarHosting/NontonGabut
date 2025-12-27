async function api(url, data) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const j = await r.json();
  if (!r.ok) throw j;
  return j;
}

async function login() {
  msg.textContent = "";
  try {
    await api("/api/auth/login", { username: u.value, password: p.value });
    location.href = "/app";
  } catch (e) {
    msg.textContent = e.error || "Login gagal";
  }
}