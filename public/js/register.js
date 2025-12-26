async function api(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw data;
  return data;
}

function showErr(msg) {
  const box = document.getElementById("errBox");
  box.style.display = "block";
  box.textContent = msg;
}

document.getElementById("regForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const btn = document.getElementById("btnReg");
  btn.disabled = true;

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const password2 = document.getElementById("password2").value;

  if (password !== password2) {
    showErr("Konfirmasi password tidak sama.");
    btn.disabled = false;
    return;
  }

  try {
    await api("/api/auth/register", { username, password });
    window.location.href = "/app";
  } catch (err) {
    const map = {
      USERNAME_TOO_SHORT: "Username minimal 3 karakter.",
      PASSWORD_TOO_SHORT: "Password minimal 6 karakter.",
      USERNAME_TAKEN: "Username sudah dipakai.",
      RATE_LIMITED: "Terlalu banyak percobaan. Coba lagi beberapa saat."
    };
    showErr(map[err.error] || "Registrasi gagal. Coba ulang.");
  } finally {
    btn.disabled = false;
  }
});