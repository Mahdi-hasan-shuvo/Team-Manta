// Tiny element builder. Text goes in as text nodes, never as HTML.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "style") String(v).split(";").forEach((d) => { const i = d.indexOf(":"); if (i > 0) el.style.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim()); }); // CSSOM, so the strict style-src CSP allows it
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export function debounce(fn, ms) { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; }
export function css(name, el) { return getComputedStyle(el || document.documentElement).getPropertyValue(name).trim(); }

/** Replace children, flattening arrays and skipping null/false (replaceChildren would print "null"). */
export function fill(el, ...kids) { el.replaceChildren(); add(el, kids); return el; }
