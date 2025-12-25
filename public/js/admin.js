import { api } from "./api.js";
import { requireAdmin } from "./guard.js";

const $ = (id)=>document.getElementById(id);
const msg = (id, t)=>$(id).textContent=t;

$("btnLogout").onclick = async ()=>{
  await api("/api/auth/logout", { method:"POST" });
  location.href="/login.html";
};

function payRow(p){
  return `
    <div class="item">
      <div>
        <div style="font-weight:900">${p.email}</div>
        <div class="small">Plan: ${p.plan} • Method: ${p.method} • Status: ${p.status}</div>
        <div class="small">Proof: <a href="${p.proofUrl}" target="_blank" rel="noopener">buka bukti</a></div>
      </div>
      <div class="row">
        <button class="btn" data-approve="${p._id}">Approve</button>
        <button class="btn danger" data-reject="${p._id}">Reject</button>
      </div>
    </div>
  `;
}

function seriesRow(s){
  return `
    <div class="item">
      <div>
        <div style="font-weight:950">${s.title}</div>
        <div class="small">${(s.type||"").toUpperCase()} • ID: <b>${s._id}</b></div>
      </div>
      <div class="badge">${(s.genres||[]).slice(0,3).join(", ")}</div>
    </div>
  `;
}

async function reload(){
  const p = await api("/api/admin/payments");
  $("payList").innerHTML = p.items.map(payRow).join("") || `<div class="small">Tidak ada pending.</div>`;

  const s = await api("/api/series");
  $("seriesList").innerHTML = (s.items || []).map(seriesRow).join("") || `<div class="small">Belum ada series.</div>`;
}

(async ()=>{
  await requireAdmin();

  $("btnAddSeries").onclick = async ()=>{
    msg("msg1", "Menyimpan...");
    try{
      const genres = $("sGenres").value.split(",").map(x=>x.trim()).filter(Boolean);
      await api("/api/admin/series", { method:"POST", body:{
        title: $("sTitle").value,
        type: $("sType").value,
        genres,
        posterUrl: $("sPoster").value,
        freeLimit: Number($("sFreeLimit").value || 10)
      }});
      msg("msg1","OK. Series tersimpan.");
      await reload();
    }catch(e){
      msg("msg1","Gagal: " + e.message);
    }
  };

  $("btnAddEp").onclick = async ()=>{
    msg("msg2", "Menyimpan...");
    try{
      await api("/api/admin/episode", { method:"POST", body:{
        seriesId: $("eSeriesId").value,
        number: Number($("eNumber").value),
        title: $("eTitle").value,
        videoUrl: $("eVideo").value,
        thumbUrl: $("eThumb").value
      }});
      msg("msg2","OK. Episode tersimpan.");
    }catch(e){
      msg("msg2","Gagal: " + e.message);
    }
  };

  $("btnGive").onclick = async ()=>{
    msg("msg3","Memproses...");
    try{
      await api("/api/admin/sub/give", { method:"POST", body:{
        email: $("gEmail").value,
        plan: $("gPlan").value
      }});
      msg("msg3","OK. Subscription diberikan.");
    }catch(e){
      msg("msg3","Gagal: " + e.message);
    }
  };

  $("payList").addEventListener("click", async (e)=>{
    const a = e.target.closest("[data-approve]");
    const r = e.target.closest("[data-reject]");
    if (a){
      const id = a.getAttribute("data-approve");
      await api("/api/admin/payments/approve", { method:"POST", body:{ paymentId:id }});
      await reload();
    }
    if (r){
      const id = r.getAttribute("data-reject");
      await api("/api/admin/payments/reject", { method:"POST", body:{ paymentId:id }});
      await reload();
    }
  });

  await reload();
})();