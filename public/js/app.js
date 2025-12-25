import { api } from "./api.js";

const listEl = document.getElementById("film-list");
const catEl = document.getElementById("category-filter");
const genreEl = document.getElementById("genre-filter");
const searchEl = document.getElementById("search");

let films = [];

async function loadFilms() {
  const res = await api("/api/films");
  films = res.data;
  render();
}

function render() {
  let filtered = films;

  const cat = catEl.value;
  const genre = genreEl.value;
  const q = searchEl.value.toLowerCase();

  if (cat !== "all") filtered = filtered.filter(f => f.category === cat);
  if (genre !== "all") filtered = filtered.filter(f => f.genre === genre);
  if (q) filtered = filtered.filter(f => f.title.toLowerCase().includes(q));

  listEl.innerHTML = filtered.map(f => `
    <div class="film-card">
      <img src="${f.thumbnail}">
      <h3>${f.title}</h3>
      <p>${f.category} • ${f.genre}</p>
      <a href="/watch.html?id=${f._id}">Tonton</a>
    </div>
  `).join("");
}

catEl.onchange = render;
genreEl.onchange = render;
searchEl.oninput = render;

loadFilms();