export async function api(path, { method="GET", body=null } = {}) {
  const opt = { method, headers: { "Content-Type": "application/json" }, credentials: "include" };
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch(path, opt);
  const d = await r.json().catch(()=> ({}));
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}

export function qs(k){ return new URLSearchParams(location.search).get(k) || ""; }