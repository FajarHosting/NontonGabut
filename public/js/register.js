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

async function reg() {
  msg.textContent = "";
  try {
    await api("/api/auth/register", { username: u.value, password: p.value });
    location.href = "/app";
  } catch (e) {
    msg.textContent = e.error || "Register gagal";
  }
}