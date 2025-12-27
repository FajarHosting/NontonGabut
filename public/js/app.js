async function getJSON(u) {
  const r = await fetch(u);
  const j = await r.json();
  if (!r.ok) throw j;
  return j;
}
async function postJSON(u, body) {
  const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw j;
  return j;
}

async function logout() {
  await postJSON("/api/auth/logout", {});
  location.href = "/login";
}

function cardHTML(c) {
  const safeCover = c.coverUrl || "https://dummyimage.com/600x800/111a33/ffffff.png&text=NO+COVER";
  return `
    <div class="miniCard" onclick="location.href='/watch?id=${c._id}&ep=1'">
      <img src="${safeCover}">
      <div class="t">${c.title}</div>
    </div>
  `;
}

function setActive(tab) {
  ["Home","Search","History","Account"].forEach((t)=>{
    document.getElementById("sec"+t).classList.remove("active");
    document.getElementById("nav"+t).classList.remove("active");
  });
  document.getElementById("sec"+tab).classList.add("active");
  document.getElementById("nav"+tab).classList.add("active");
}

async function go(tab) {
  setActive(tab);
  if (tab === "History") await loadHistory();
  if (tab === "Account") await loadAccount();
}

async function loadMe() {
  const me = await getJSON("/api/auth/me");
  if (!me.user) {
    location.href = "/login";
    return null;
  }
  userLine.textContent = `${me.user.username} • ${me.user.premiumActive ? "Premium" : "Free (10 eps) + Ad Unlock"}`;

  if (me.user.avatarUrl) {
    avatarImg.src = me.user.avatarUrl;
    avatarImg.style.display = "block";
    avatarFallback.style.display = "none";
    avatarImg.onerror = () => {
      avatarImg.style.display = "none";
      avatarFallback.style.display = "flex";
    };
  }
  return me.user;
}

async function loadHome() {
  const data = await getJSON("/api/content?limit=80");
  slider.innerHTML = data.items.slice(0, 12).map(cardHTML).join("");
  gridAll.innerHTML = data.items.map(cardHTML).join("");
}

async function doSearch() {
  const params = new URLSearchParams();
  if (q.value.trim()) params.set("q", q.value.trim());
  if (type.value) params.set("type", type.value);
  if (genre.value.trim()) params.set("genre", genre.value.trim().toLowerCase());
  params.set("limit", "80");

  const data = await getJSON("/api/content?" + params.toString());
  gridSearch.innerHTML = data.items.map(cardHTML).join("") || `<div class="small">Tidak ada hasil.</div>`;
}

async function loadHistory() {
  try {
    const data = await getJSON("/api/watch/history");
    if (!data.items.length) {
      hist.innerHTML = `<div class="small">Belum ada history nonton.</div>`;
      return;
    }
    hist.innerHTML = data.items.map(h => `
      <div class="histItem" onclick="location.href='/watch?id=${h.contentId}&ep=${h.episode || 1}'">
        <img src="${h.coverUrl || "https://dummyimage.com/600x800/111a33/ffffff.png&text=NO+COVER"}">
        <div>
          <div style="font-weight:900">${h.title || "Untitled"}</div>
          <div class="small">Episode ${h.episode || 1} • ${new Date(h.watchedAt).toLocaleString()}</div>
        </div>
      </div>
    `).join("");
  } catch {
    hist.innerHTML = `<div class="small">Login dulu untuk melihat history.</div>`;
  }
}

async function loadAccount() {
  try {
    const me = await getJSON("/api/auth/me");
    if (!me.user) {
      accInfo.textContent = "Belum login.";
      return;
    }
    accInfo.innerHTML = `
      <b>${me.user.username}</b><br>
      Status: ${me.user.premiumActive ? "Premium" : "Free"}<br>
      Free limit: ${me.user.freeEpisodesLimit} episode
      ${me.user.isAdmin ? "<br><span class='small'>Admin: aktif (akses /admin)</span>" : ""}
    `;
  } catch {
    accInfo.textContent = "Belum login.";
  }
}

(async function init() {
  await loadMe();
  await loadHome();
})();