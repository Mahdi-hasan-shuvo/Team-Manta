// NASA health-related API hub. The server calls NASA (allowlisted hosts) only when you press Fetch; every answer says
// whether it is live, cached, or unavailable.
import { h, fill } from "../dom.js";
import { t, n, digits } from "../i18n.js";
import { getJSON, once } from "../api.js";
import { begin, errBox } from "./common.js";

let current = "osdr_search";
const results = new Map();

function badge(status) { return h("span", { class: `hub-st ${status}` }, t(`hub.status.${status}`)); }
function msgFor(res) {
  if (!res.message) return "";
  if (res.message.startsWith("http_")) return t("hub.msg.http", { code: res.message.slice(5) });
  return t(`hub.msg.${res.message}`);
}

export async function render(el) {
  const { wrap } = begin(el, "hub");
  const holder = h("div", null, h("div", { class: "skeleton" }));
  wrap.append(holder);
  let cat;
  try { cat = await once("/api/hub"); } catch (e) { fill(holder, errBox(e.message, () => render(el))); return; }
  const defs = Object.fromEntries(cat.apis.map((a) => [a.id, a]));

  const grid = h("div", { class: "hub-grid", role: "list" });
  const panel = h("div", { class: "panel pad hub-panel", "aria-live": "polite" });
  const checkOut = h("div", { class: "hub-check" });

  cat.apis.forEach((a) => {
    const card = h("button", { type: "button", class: "hub-card tilt", role: "listitem", "aria-pressed": String(a.id === current), dataset: { id: a.id }, onclick: () => { current = a.id; paintCards(); paintPanel(); } },
      h("span", { class: `hub-cat c-${a.category}` }, t(`hub.cat.${a.category}`)),
      h("b", null, t(`hub.apis.${a.id}.name`)),
      h("span", { class: "hub-what" }, t(`hub.apis.${a.id}.what`)),
      h("span", { class: "hub-host" }, a.host, a.needs_key ? h("i", null, ` · ${t("hub.key")}`) : null));
    grid.append(card);
  });
  const paintCards = () => grid.querySelectorAll(".hub-card").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.id === current)));

  function field(a, p) {
    const id = `hub-${a.id}-${p.name}`;
    let input;
    if (p.type === "enum") {
      input = h("select", { id, name: p.name }, p.choices.map((c) => h("option", { value: c, selected: c === p.default }, t(`hub.choices.${p.name}.${c}`))));
    } else if (p.type === "int" || p.type === "num") {
      input = h("input", { id, name: p.name, type: "number", min: p.min, max: p.max, step: p.type === "int" ? 1 : 0.01, value: p.default, inputmode: "decimal" });
    } else {
      input = h("input", { id, name: p.name, type: "text", maxlength: p.max, value: p.default, autocomplete: "off", spellcheck: "false" });
    }
    return h("div", { class: "field" }, h("label", { class: "lbl", for: id }, t(`hub.p.${p.name}`)), input);
  }

  function paintPanel() {
    const a = defs[current];
    const form = h("form", { class: "hub-form", novalidate: true }, a.params.map((p) => field(a, p)),
      h("button", { class: "btn primary small", type: "submit" }, t("hub.fetch")));
    const out = h("div", { class: "hub-out" });
    const shown = results.get(current);
    if (shown) paintResult(out, shown); else out.append(h("p", { class: "hint" }, t("hub.not_yet")));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = new URLSearchParams(); new FormData(form).forEach((v, k) => q.set(k, String(v)));
      fill(out, h("p", { class: "hint" }, t("hub.fetching")));
      try {
        const res = await getJSON(`/api/hub/${current}?${q}`); results.set(current, res); paintResult(out, res);
      } catch (err) { fill(out, h("p", { class: "hub-err" }, `${t("hub.error")} ${err.message}`)); }
    });
    fill(panel,
      h("div", { class: "hub-head" }, h("h3", null, t(`hub.apis.${a.id}.name`)), h("a", { class: "hub-docs", href: a.docs, target: "_blank", rel: "noopener noreferrer" }, t("hub.docs"))),
      h("p", { class: "hub-why" }, h("b", null, t("hub.why")), " ", t(`hub.apis.${a.id}.why`)),
      form, out,
      a.needs_key ? h("p", { class: "hint" }, cat.key === "demo" ? t("hub.key_demo") : t("hub.key_custom")) : null);
  }

  function paintResult(out, res) {
    const head = h("div", { class: "hub-meta" }, badge(res.status),
      res.fetched_at ? h("span", null, `${t("hub.fetched")} ${digits(res.fetched_at.replace("T", " ").replace("+00:00", " UTC"))}`) : null,
      res.cached_from ? h("span", null, `${t("hub.cached_from")}: ${t(`hub.cf.${res.cached_from === "bundled records" ? "bundled" : "last"}`)}`) : null,
      res.total != null ? h("span", null, t("hub.total", { n: res.total })) : null);
    const why = msgFor(res);
    const list = h("ul", { class: "hub-list" }, res.items.map((it) => h("li", null,
      h("div", { class: "hub-it" },
        it.url ? h("a", { href: it.url, target: "_blank", rel: "noopener noreferrer" }, it.title) : h("span", { class: "hub-t" }, it.title),
        it.tag ? h("em", null, it.tag) : null),
      it.subtitle ? h("p", null, it.subtitle) : null,
      it.date ? h("time", null, digits(it.date)) : null)));
    fill(out, head, why ? h("p", { class: `hub-why-fail ${res.status}` }, why) : null,
      res.items.length ? list : h("p", { class: "hint" }, t("hub.no_items")),
      res.source_url ? h("p", { class: "hub-src" }, h("span", null, `${t("hub.source")}: `), h("code", null, res.source_url)) : null);
  }

  // check everything once, one request at a time (the shared DEMO_KEY allows only a few calls per hour)
  const bCheck = h("button", { class: "btn ghost small", type: "button" }, t("hub.check_all", { n: cat.apis.length }));
  bCheck.addEventListener("click", async () => {
    bCheck.disabled = true;
    const rows = h("tbody"); fill(checkOut, h("table", { class: "dtable hub-table" }, h("thead", null, h("tr", null, ["api", "status", "items", "ms"].map((k) => h("th", { scope: "col" }, t(`hub.col.${k}`))))), rows));
    for (const a of cat.apis) {
      const tr = h("tr", null, h("td", null, t(`hub.apis.${a.id}.name`)), h("td", null, t("hub.fetching")), h("td", null, "…"), h("td", null, "…")); rows.append(tr);
      const t0 = performance.now();
      try {
        const res = await getJSON(`/api/hub/${a.id}`); results.set(a.id, res);
        tr.replaceChildren(h("td", null, t(`hub.apis.${a.id}.name`)), h("td", null, badge(res.status), res.message ? h("small", null, ` ${msgFor(res)}`) : null), h("td", null, n(res.items.length)), h("td", null, n(Math.round(performance.now() - t0))));
      } catch (e) { tr.replaceChildren(h("td", null, t(`hub.apis.${a.id}.name`)), h("td", { colspan: 3 }, e.message)); }
    }
    bCheck.disabled = false; paintPanel();
  });

  const plat = h("div", null, h("h3", null, t("hub.platforms.title")), h("p", { class: "hint" }, t("hub.platforms.intro")),
    h("div", { class: "plat-grid" }, (cat.platforms || []).map((p) => h("div", { class: "plat" },
      h("h3", null, t(`hub.platforms.items.${p.id}.name`)), h("p", null, t(`hub.platforms.items.${p.id}.what`)),
      h("a", { href: p.url, target: "_blank", rel: "noopener noreferrer" }, p.url.replace("https://", "")),
      h("span", { class: "hint" }, `${t("hub.platforms.used")}:`), h("ul", null, p.apis.filter((id) => defs[id]).map((id) => h("li", null, t(`hub.apis.${id}.name`))))))));

  fill(holder,
    h("p", { class: `hub-banner${cat.offline ? " off" : ""}` }, cat.offline ? t("hub.banner_off") : t("hub.banner")),
    plat, grid, panel,
    h("div", { class: "hub-tools" }, bCheck, h("span", { class: "hint" }, t("hub.check_note"))), checkOut,
    h("p", { class: "hint hub-honest" }, t("hub.honest")));
  paintPanel();
}
