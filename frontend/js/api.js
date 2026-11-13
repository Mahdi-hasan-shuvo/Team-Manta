const cache = new Map();
async function req(path, opt) {
  const r = await fetch(path, opt);
  if (!r.ok) {
    let msg = r.status + "";
    try { msg = (await r.json()).detail || msg; } catch (e) { /* ignore */ }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return r.json();
}
export const getJSON = (p) => req(p);
export const postJSON = (p, body) => req(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
/** GET once per page load. */
export function once(p) {
  if (!cache.has(p)) cache.set(p, req(p).catch((e) => { cache.delete(p); throw e; }));
  return cache.get(p);
}
