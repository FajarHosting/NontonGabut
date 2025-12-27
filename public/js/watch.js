function qs(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

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

function renderPlayer(url) {
  const isMp4 = /\.mp4(\?|$)/i.test(url);
  if (isMp4) {
    return `<video controls playsinline src="${url}"></video>`;
  }
  return `<iframe src="${url}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
}

function epBtnHTML(id, ep, active) {
  return `<button class="epBtn ${active ? "active" : ""}" onclick="location.href='/watch?id=${id}&ep=${ep}'">EP ${ep}</button>`;
}

async function main() {
  const id = qs("id");
  const ep = Number(qs("ep") || 1);
  if (!id) {
    title.textContent = "Content tidak ditemukan";
    return;
  }

  const me = await getJSON("/api/auth/me");
  if (!me.user) {
    location.href = "/login";
    return;
  }

  const detail = await getJSON("/api/content/" + id);
  const item = detail.item;
  title.textContent = item.title;

  // episodes bar
  const epsList = (item.episodes || []).map(e => Number(e.episodeNumber)).sort((a,b)=>a-b);
  eps.innerHTML = epsList.map(n => epBtnHTML(id, n, n === ep)).join("");

  // find current ep video url
  const current = (item.episodes || []).find(e => Number(e.episodeNumber) === ep);
  if (!current) {
    status.textContent = "Episode tidak ditemukan.";
    playerBox.innerHTML = "";
    actions.innerHTML = "";
    return;
  }

  // access check
  try {
    const can = await getJSON(`/api/watch/can-watch?contentId=${encodeURIComponent(id)}&episode=${ep}`);
    status.textContent = `Akses: ${can.mode}`;
    playerBox.innerHTML = renderPlayer(current.videoUrl);

    actions.innerHTML = `
      <button class="btn btnPrimary" onclick="nextEp()">Episode berikutnya</button>
      <button class="btn" onclick="location.href='/profile'">Profile</button>
    `;

    // log history
    await postJSON("/api/watch/log", { contentId: id, episode: ep });
  } catch (e) {
    status.textContent = "Episode terkunci. Unlock via iklan atau premium.";
    playerBox.innerHTML = `<div style="padding:16px" class="small">Konten terkunci.</div>`;

    actions.innerHTML = `
      <button class="btn btnPrimary" onclick="unlockAd(${JSON.stringify(id)}, ${ep})">Tonton Iklan (Unlock)</button>
      <button class="btn" onclick="location.href='/profile'">Join Premium</button>
    `;
  }
}

async function unlockAd(contentId, episode) {
  alert("Simulasi iklan 5 detik…");
  setTimeout(async () => {
    try {
      await postJSON("/api/watch/unlock-ad", { contentId, episode });
      location.reload();
    } catch (e) {
      alert(e.error || "Gagal unlock");
    }
  }, 5000);
}

function nextEp(){
  const u = new URL(location.href);
  const ep = Number(u.searchParams.get("ep") || 1);
  u.searchParams.set("ep", String(ep + 1));
  location.href = u.toString();
}

main();