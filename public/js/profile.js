import { api } from "./api.js";
import { requireLogin } from "./guard.js";

const $ = (id)=>document.getElementById(id);
const msg = (t)=>$("msg").textContent=t;
const msg2 = (t)=>$("msg2").textContent=t;

$("btnLogout").onclick = async ()=>{
  await api("/api/auth/logout", { method:"POST" });
  location.href="/login.html";
};

(async ()=>{
  const u = await requireLogin();
  if (!u) return;

  $("nm").textContent = u.displayName || "User";
  $("em").textContent = u.email;

  $("displayName").value = u.displayName || "";
  $("avatarUrl").value = u.avatarUrl || "";

  if (u.avatarUrl) $("av").innerHTML = `<img src="${u.avatarUrl}" alt="avatar">`;
  else $("av").textContent = (u.displayName || u.email || "U")[0].toUpperCase();

  $("status").className = "badge " + (u.isSubscribed ? "ok":"no");
  $("status").textContent = u.isSubscribed ? "Subscribed" : "Free";

  if (u.role === "admin") {
    $("adminLink").style.display = "";
    $("btnGotoAdmin").style.display = "";
  }

  $("btnSave").onclick = async ()=>{
    msg("Menyimpan...");
    try {
      await api("/api/profile", { method:"PATCH", body:{
        displayName: $("displayName").value,
        avatarUrl: $("avatarUrl").value
      }});
      msg("Profil tersimpan. Refresh halaman untuk lihat update.");
    } catch(e){
      msg("Gagal: " + e.message);
    }
  };

  $("btnReq").onclick = async ()=>{
    msg2("Mengirim request...");
    try {
      await api("/api/subscribe/request", { method:"POST", body:{
        plan: $("plan").value,
        method: $("method").value,
        proofUrl: $("proofUrl").value
      }});
      msg2("Request terkirim. Tunggu admin approve.");
    } catch(e){
      msg2("Gagal: " + e.message);
    }
  };
})();