import { api } from "./api.js";

const $ = (id)=>document.getElementById(id);
const msg = (t)=> $("msg").textContent = t;

$("btnLogin").onclick = async ()=>{
  msg("Memproses login...");
  try {
    await api("/api/auth/login", { method:"POST", body:{
      email: $("email").value,
      password: $("password").value
    }});
    const me = await api("/api/me");
    location.href = me.user.role === "admin" ? "/admin.html" : "/index.html";
  } catch (e) {
    msg("Gagal: " + e.message);
  }
};

$("btnRegister").onclick = async ()=>{
  msg("Memproses registrasi...");
  try {
    await api("/api/auth/register", { method:"POST", body:{
      email: $("email").value,
      password: $("password").value,
      displayName: $("displayName").value
    }});
    msg("Registrasi berhasil. Silakan login.");
  } catch (e) {
    msg("Gagal: " + e.message);
  }
};

$("btnReset").onclick = ()=>{
  $("email").value = "";
  $("password").value = "";
  $("displayName").value = "";
  msg("");
};