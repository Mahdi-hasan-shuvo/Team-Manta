// Language state, text lookup and number formatting (Bengali digits on the Bangla page).
export const S = { lang: "en", c: null, store: {} };

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export function digits(str) {
  return S.lang === "bn" ? String(str).replace(/[0-9]/g, (d) => BN_DIGITS[+d]) : String(str);
}
export function n(x, dp) {
  if (x == null || Number.isNaN(x)) return "–";
  const s = typeof dp === "number" ? Number(x).toFixed(dp) : String(x);
  return digits(s);
}
export function get(path, root = S.c) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), root);
}
export function t(path, vars) {
  let v = get(path);
  if (v == null) return `[${path}]`;
  if (typeof v === "string" && vars) {
    v = v.replace(/\{([a-z_]+)\}/g, (m, k) => (k in vars ? (typeof vars[k] === "number" ? n(vars[k]) : vars[k]) : m));
  }
  return v;
}
export async function loadContent(lang) {
  if (!S.store[lang]) {
    const r = await fetch(`/api/content/${lang}`);
    if (!r.ok) throw new Error("content " + r.status);
    S.store[lang] = await r.json();
  }
  return S.store[lang];
}
