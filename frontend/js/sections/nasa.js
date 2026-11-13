import { h, fill, debounce } from "../dom.js";
import { t, n, digits } from "../i18n.js";
import { once } from "../api.js";
import { begin, errBox } from "./common.js";

const view = { kind: "all", q: "", sort: "id", open: new Set() };
const KINDS = ["all", "osdr", "ntrs", "paper", "other"];

const csvCell = (v) => {
  let s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // keep spreadsheets from running a cell as a formula
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function download(name, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h("a", { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function render(el) {
  const { wrap } = begin(el, "nasa");
  wrap.append(h("div", { class: "svc" }, t("nasa.services").map((s) => h("div", null,
    h("b", null, s.name), h("p", null, s.use), h("small", null, s.status)))));
  const holder = h("div", null, h("div", { class: "skeleton" }));
  wrap.append(holder);
  let data;
  try { data = await once("/api/datasets"); } catch (e) { fill(holder, errBox(e.message, () => render(el))); return; }

  const stats = h("div", { class: "ds-stats" }, [["total", data.counts.total], ["osdr", data.counts.osdr], ["ntrs", data.counts.ntrs], ["paper", data.counts.paper], ["other", data.counts.other]].map(([k, v]) =>
    h("button", { type: "button", class: "ds-stat tilt", dataset: { k }, onclick: () => { view.kind = k === "total" ? "all" : k; draw(); } },
      h("b", null, n(v || 0)), h("span", null, t(`nasa.stat.${k}`)))));
  const search = h("input", { type: "search", id: "ds-q", class: "ds-q", placeholder: t("nasa.search_ph"), "aria-label": t("nasa.search"), value: view.q, autocomplete: "off" });
  const seg = h("div", { class: "seg", role: "group", "aria-label": t("nasa.filter") }, KINDS.map((k) => h("button", {
    type: "button", dataset: { k }, onclick: () => { view.kind = k; draw(); },
  }, t(`nasa.filters.${k}`))));
  const sort = h("select", { id: "ds-sort", "aria-label": t("nasa.sort") }, ["id", "date", "kind"].map((k) => h("option", { value: k, selected: view.sort === k }, t(`nasa.sorts.${k}`))));
  sort.addEventListener("change", () => { view.sort = sort.value; draw(); });
  const count = h("small", { "aria-live": "polite" });
  const body = h("tbody");
  const table = h("table", { class: "dtable" },
    h("caption", { class: "sr" }, t("nasa.records_title")),
    h("thead", null, h("tr", null, ["id", "title", "type", "date", "status", "link"].map((k) => h("th", { scope: "col" }, t(`nasa.cols.${k}`))))), body);
  const empty = h("p", { class: "ds-empty", hidden: true }, t("nasa.none"));

  const rows = () => {
    const q = view.q.trim().toLowerCase();
    const list = data.items.filter((r) => (view.kind === "all" || r.kind === view.kind)
      && (!q || `${r.id} ${r.title} ${r.mission} ${r.provider} ${r.summary} ${r.organism}`.toLowerCase().includes(q)));
    const key = { id: (r) => r.id, date: (r) => r.date || "", kind: (r) => r.kind + r.id }[view.sort];
    list.sort((a, b) => (view.sort === "date" ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b))));
    return list;
  };

  function detail(r) {
    const uses = r.used_for && r.used_for.length ? h("div", { class: "meta" }, r.used_for.map((u) => h("span", { class: u.includes("direct") ? "direct" : "" }, usedLabel(u)))) : null;
    return h("div", { class: "ds-detail" },
      r.summary ? h("p", null, r.summary) : null,
      h("dl", null,
        r.provider ? h("div", null, h("dt", null, t("nasa.cols.provider")), h("dd", null, r.provider)) : null,
        r.mission ? h("div", null, h("dt", null, t("nasa.cols.mission")), h("dd", null, r.mission)) : null,
        r.organism ? h("div", null, h("dt", null, t("nasa.cols.organism")), h("dd", null, r.organism)) : null),
      uses ? h("div", null, h("div", { class: "lbl" }, t("nasa.used_for")), uses) : null);
  }
  function usedLabel(u) {
    const m = /^([a-z_]+):(high|low) \((direct|adjacent)\)$/.exec(u);
    if (!m) return u;
    return `${t(`nasa.signal_names.${m[1]}`)} · ${t(`nasa.dir.${m[2]}`)} · ${t(`nasa.relevance.${m[3]}`).split(":")[0]}`;
  }

  function draw() {
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === view.kind)));
    stats.querySelectorAll(".ds-stat").forEach((b) => b.setAttribute("aria-pressed", String((view.kind === "all" && b.dataset.k === "total") || b.dataset.k === view.kind)));
    const list = rows();
    count.textContent = t("nasa.count", { n: list.length });
    empty.hidden = list.length > 0;
    fill(body, list.flatMap((r) => {
      const open = view.open.has(r.id);
      const tr = h("tr", { class: `ds-row k-${r.kind}` },
        h("td", { class: "c-id" }, h("span", { class: "id" }, r.id)),
        h("td", { class: "c-ti" }, h("button", { type: "button", class: "ds-tog", "aria-expanded": String(open), onclick: () => { open ? view.open.delete(r.id) : view.open.add(r.id); draw(); } }, r.title)),
        h("td", { class: "c-ty" }, h("span", { class: `kind ${r.kind}` }, t(`nasa.kinds.${r.kind}`))),
        h("td", { class: "c-dt" }, digits(r.date || "–")),
        h("td", { class: "c-st" }, r.status),
        h("td", { class: "c-ln" }, r.url ? h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer", "aria-label": `${t("nasa.open")}: ${r.id}` }, t("nasa.open")) : h("span", null, "–")));
      const out = [tr];
      if (open) out.push(h("tr", { class: "ds-more" }, h("td", { colspan: 6 }, detail(r))));
      return out;
    }));
  }
  search.addEventListener("input", debounce(() => { view.q = search.value; draw(); }, 120));

  const exportCsv = () => {
    const cols = ["id", "kind", "title", "provider", "date", "mission", "organism", "status", "url", "used_for", "summary"];
    download("astra-vigil-datasets.csv", "text/csv;charset=utf-8", "﻿" + [cols.join(",")].concat(rows().map((r) => cols.map((c) => csvCell(r[c])).join(","))).join("\r\n"));
  };
  const exportJson = () => download("astra-vigil-datasets.json", "application/json", JSON.stringify({ meta: data.meta, items: rows() }, null, 2));

  fill(holder,
    h("div", { class: "rec-head" }, h("div", null, h("h3", null, t("nasa.records_title")),
      h("small", null, t("nasa.retrieved", { date: digits(data.meta.retrieved) }))),
      h("div", { class: "ds-dl" }, h("button", { class: "btn ghost small", type: "button", onclick: exportCsv }, t("nasa.dl_csv")), h("button", { class: "btn ghost small", type: "button", onclick: exportJson }, t("nasa.dl_json")))),
    stats,
    h("div", { class: "ds-tools" }, h("label", { class: "ds-find", for: "ds-q" }, h("span", { class: "sr" }, t("nasa.search")), search), seg,
      h("label", { class: "ds-sort", for: "ds-sort" }, h("span", null, t("nasa.sort")), sort), count),
    h("div", { class: "ds-scroll" }, table), empty,
    h("div", { class: "nasa-notes" },
      h("div", null, h("h4", null, t("nasa.how_title")), h("p", null, t("nasa.how")), h("p", { class: "hint" }, t("nasa.relevance.direct") + " / " + t("nasa.relevance.adjacent"))),
      h("div", null, h("p", null, t("nasa.gap")))));
  draw();
}
