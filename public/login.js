// public/login.js
import { firebaseConfig } from "/firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const msgEl = document.getElementById("msg");

const loginEmailBtn = document.getElementById("loginEmailBtn");
const registerBtn = document.getElementById("registerBtn");
const googleBtn = document.getElementById("googleBtn");

function setMsg(text, ok = false) {
  msgEl.textContent = text || "";
  msgEl.className = ok ? "hint ok" : "hint";
}

function goNext() {
  // balik ke index setelah login sukses
  window.location.href = "/index.html";
}

onAuthStateChanged(auth, (user) => {
  if (user) goNext();
});

loginEmailBtn.addEventListener("click", async () => {
  setMsg("Memproses login...");
  try {
    await signInWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value);
    setMsg("Login berhasil.", true);
    goNext();
  } catch (e) {
    setMsg("Login gagal: " + (e?.message || String(e)));
  }
});

registerBtn.addEventListener("click", async () => {
  setMsg("Memproses registrasi...");
  try {
    await createUserWithEmailAndPassword(auth, emailEl.value.trim(), passEl.value);
    setMsg("Registrasi berhasil. Anda sudah login.", true);
    goNext();
  } catch (e) {
    setMsg("Registrasi gagal: " + (e?.message || String(e)));
  }
});

googleBtn.addEventListener("click", async () => {
  setMsg("Membuka Google login...");
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    setMsg("Login Google berhasil.", true);
    goNext();
  } catch (e) {
    setMsg("Login Google gagal: " + (e?.message || String(e)));
  }
});