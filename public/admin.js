import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// WAJIB samakan dengan auth.js
const firebaseConfig = {
  apiKey: "ISI_API_KEY",
  authDomain: "ISI_AUTH_DOMAIN",
  projectId: "ISI_PROJECT_ID",
  appId: "ISI_APP_ID"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);

const logoutUserBtn = document.getElementById("logoutUserBtn");
logoutUserBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "/login.html";
});

// Guard: admin page wajib login dulu
let userReady = false;
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }
  userReady = true;
});

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const pw = document.getElementById("pw");
const loginMsg = document.getElementById("loginMsg");

const uploadBtn = document.getElementById("uploadBtn");
const uploadMsg = document.getElementById("uploadMsg");
const videoFile = document.getElementById("videoFile");
const videoUrl = document.getElementById("videoUrl");

const saveBtn = document.getElementById("saveBtn");
const saveMsg = document.getElementById("saveMsg");

const reloadList = document.getElementById("reloadList");
const list = document.getElementById("list");

const titleEl = document.getElementById("title");
const typeEl = document.getElementById("type");
const genreEl = document.getElementById("genre");
const episodeEl = document.getElementById("episode");
const thumbEl = document.getElementById("thumbUrl");
const descEl = document.getElementById("description");

function getToken() {
  return localStorage.getItem("admin_token") || "";
}
function setToken(t) {
  if (!t) localStorage.removeItem("admin_token");
  else localStorage.setItem("admin_token", t);
}

async function loginAdmin() {
  if (!userReady) {
    loginMsg.textContent = "Anda belum login user. Redirect...";
    window.location.href = "/login.html";
    return;
  }

  loginMsg.textContent = "Memproses login admin...";
  const r = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: pw.value })
  });

  const data = await r.json();
  if (!r.ok) {
    loginMsg.textContent = data.error || "Login admin gagal";
    return;
  }
  setToken(data.token);
  loginMsg.textContent = "Login admin berhasil.";
  await loadList();
}

function logoutAdmin() {
  setToken("");
  loginMsg.textContent = "Logout admin.";
}

async function requestBlobToken(filename, contentType) {
  const r = await fetch("/api/admin/blob-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getToken()}`
    },
    body: JSON.stringify({ filename, contentType })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Gagal ambil token upload");
  return data;
}

// Upload video via direct-to-storage
async function uploadVideo() {
  uploadMsg.textContent = "";
  if (!getToken()) {
    uploadMsg.textContent = "Login admin dulu (password admin).";
    return;
  }
  const f = videoFile.files?.[0];
  if (!f) {
    uploadMsg.textContent = "Pilih file video dulu.";
    return;
  }

  uploadMsg.textContent = "Meminta token upload...";
  const token = await requestBlobToken(f.name, f.type);

  uploadMsg.textContent = "Mengunggah ke storage...";
  const putRes = await fetch(token.url, {
    method: "PUT",
    headers: {
      "Content-Type": f.type,
      "Authorization": `Bearer ${token.token}`
    },
    body: f
  });

  if (!putRes.ok) {
    uploadMsg.textContent = "Upload gagal.";
    return;
  }

  const location = putRes.headers.get("Location");
  if (!location) {
    uploadMsg.textContent = "Upload sukses, tetapi URL tidak terbaca.";
    return;
  }

  videoUrl.value = location;
  uploadMsg.textContent = "Upload selesai.";
}

async function saveToDb() {
  saveMsg.textContent = "";
  if (!getToken()) {
    saveMsg.textContent = "Login admin dulu.";
    return;
  }
  if (!titleEl.value.trim()) {
    saveMsg.textContent = "Judul wajib.";
    return;
  }

  const payload = {
    title: titleEl.value.trim(),
    type: typeEl.value,
    genre: genreEl.value,
    episode: episodeEl.value.trim(),
    description: descEl.value.trim(),
    thumbUrl: thumbEl.value.trim(),   // foto via link
    videoUrl: videoUrl.value.trim(),  // url blob
    isActive: true
  };

  saveMsg.textContent = "Menyimpan...";
  const r = await fetch("/api/admin/videos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getToken()}`
    },
    body: JSON.stringify(payload)
  });
  const data = await r.json();
  if (!r.ok) {
    saveMsg.textContent = data.error || "Gagal simpan";
    return;
  }
  saveMsg.textContent = `Sukses. ID: ${data.id}`;
  await loadList();
}

async function loadList() {
  list.innerHTML = `<div class="muted">Memuat...</div>`;
  const r = await fetch("/api/public/videos?limit=200");
  const data = await r.json();
  const items = data.items || [];
  if (!items.length) {
    list.innerHTML = `<div class="muted">Kosong.</div>`;
    return;
  }

  list.innerHTML = items.map((x) => `
    <div class="listItem">
      <div>
        <strong>${escapeHtml(x.title)}</strong>
        <div class="muted">${(x.type || "").toUpperCase()} • ${escapeHtml(x.genre || "-")} ${x.episode ? "• Ep " + escapeHtml(x.episode) : ""}</div>
      </div>
      <div class="actions">
        <button data-disable="${x.id}">Nonaktifkan</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-disable]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-disable");
      await disableItem(id);
      await loadList();
    });
  });
}

async function disableItem(id) {
  if (!getToken()) return alert("Login admin dulu.");
  await fetch("/api/admin/videos", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getToken()}`
    },
    body: JSON.stringify({ id })
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

loginBtn.addEventListener("click", loginAdmin);
logoutBtn.addEventListener("click", logoutAdmin);
uploadBtn.addEventListener("click", uploadVideo);
saveBtn.addEventListener("click", saveToDb);
reloadList.addEventListener("click", loadList);

loadList().catch(() => {});