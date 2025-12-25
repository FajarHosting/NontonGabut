// public/auth.js (MODULE)
// Anda wajib buat Firebase project + enable Authentication: Google + Email/Password

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// GANTI ini dari Firebase Console > Project settings > General > Your apps
const firebaseConfig = {
  apiKey: "ISI_API_KEY",
  authDomain: "ISI_AUTH_DOMAIN",
  projectId: "ISI_PROJECT_ID",
  appId: "ISI_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const googleBtn = document.getElementById("googleBtn");
const googleMsg = document.getElementById("googleMsg");

const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const loginEmailBtn = document.getElementById("loginEmailBtn");
const registerBtn = document.getElementById("registerBtn");
const emailMsg = document.getElementById("emailMsg");

function goHome() {
  // setelah login → kembali ke index
  window.location.href = "/index.html";
}

onAuthStateChanged(auth, (user) => {
  if (user) goHome();
});

googleBtn?.addEventListener("click", async () => {
  googleMsg.textContent = "Memproses...";
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    googleMsg.textContent = "Login sukses.";
    goHome();
  } catch (e) {
    googleMsg.textContent = "Gagal login Google: " + (e?.message || String(e));
  }
});

loginEmailBtn?.addEventListener("click", async () => {
  emailMsg.textContent = "Memproses...";
  try {
    await signInWithEmailAndPassword(auth, emailEl.value.trim(), passwordEl.value);
    emailMsg.textContent = "Login sukses.";
    goHome();
  } catch (e) {
    emailMsg.textContent = "Login gagal: " + (e?.message || String(e));
  }
});

registerBtn?.addEventListener("click", async () => {
  emailMsg.textContent = "Memproses registrasi...";
  try {
    await createUserWithEmailAndPassword(auth, emailEl.value.trim(), passwordEl.value);
    emailMsg.textContent = "Registrasi sukses. Anda sudah login.";
    goHome();
  } catch (e) {
    emailMsg.textContent = "Registrasi gagal: " + (e?.message || String(e));
  }
});