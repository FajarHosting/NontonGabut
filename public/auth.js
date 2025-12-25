import { API_BASE } from "./config.js";

const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const msgEl = document.getElementById("msg");
const btnLogin = document.getElementById("btnLogin");
const btnRegister = document.getElementById("btnRegister");

function setMsg(t, ok=false){
  msgEl.textContent = t || "";
  msgEl.className = ok ? "hint ok" : "hint";
}

function saveToken(token){
  localStorage.setItem("token", token);
}

function getToken(){
  return localStorage.getItem("token") || "";
}

async function api(path, { method="GET", body } = {}){
  const token = getToken();
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type":"application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}

// auto redirect kalau token masih valid
(async () => {
  const t = getToken();
  if (!t) return;
  try {
    await api("/api/me");
    window.location.href = "./index.html";
  } catch { /* ignore */ }
})();

btnRegister.addEventListener("click", async () => {
  setMsg("Memproses registrasi...");
  try {
    await api("/api/auth/register", {
      method: "POST",
      body: { email: emailEl.value.trim(), password: passEl.value }
    });
    setMsg("Registrasi berhasil. Silakan login.", true);
  } catch (e) {
    setMsg("Registrasi gagal: " + (e?.message || String(e)));
  }
});

btnLogin.addEventListener("click", async () => {
  setMsg("Memproses login...");
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: { email: emailEl.value.trim(), password: passEl.value }
    });
    saveToken(data.token);
    setMsg("Login berhasil.", true);
    window.location.href = "./index.html";
  } catch (e) {
    setMsg("Login gagal: " + (e?.message || String(e)));
  }
});