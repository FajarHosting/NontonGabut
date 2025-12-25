// public/auth.js (MODULE)
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

// ID elemen harus ada di login.html Anda
const googleBtn = document.getElementById("googleBtn");
const googleMsg = document.getElementById("googleMsg");

const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const loginEmailBtn = document.getElementById("loginEmailBtn");
const registerBtn = document.getElementById("registerBtn");
const emailMsg = document.getElementById("emailMsg");

function goHome() {
  window.location.href = "/index.html";
}

onAuthStateChanged(auth, (user) => {
  if (user) goHome();
});

googleBtn?.addEventListener("click", async () => {
  if (googleMsg) googleMsg.textContent = "Memproses...";
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    if (googleMsg) googleMsg.textContent = "Login sukses.";
    goHome();
  } catch (e) {
    if (googleMsg) googleMsg.textContent = "Gagal login Google: " + (e?.message || String(e));
  }
});

loginEmailBtn?.addEventListener("click", async () => {
  if (emailMsg) emailMsg.textContent = "Memproses...";
  try {
    await signInWithEmailAndPassword(auth, emailEl.value.trim(), passwordEl.value);
    if (emailMsg) emailMsg.textContent = "Login sukses.";
    goHome();
  } catch (e) {
    if (emailMsg) emailMsg.textContent = "Login gagal: " + (e?.message || String(e));
  }
});

registerBtn?.addEventListener("click", async () => {
  if (emailMsg) emailMsg.textContent = "Memproses registrasi...";
  try {
    await createUserWithEmailAndPassword(auth, emailEl.value.trim(), passwordEl.value);
    if (emailMsg) emailMsg.textContent = "Registrasi sukses. Anda sudah login.";
    goHome();
  } catch (e) {
    if (emailMsg) emailMsg.textContent = "Registrasi gagal: " + (e?.message || String(e));
  }
});