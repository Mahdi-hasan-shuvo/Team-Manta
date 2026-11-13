// "What changed": version history, a before / now table, and what is still not proven.
import { h } from "../dom.js";
import { t } from "../i18n.js";
import { begin } from "./common.js";

export function render(el) {
  const { wrap } = begin(el, "updates");
  const vers = t("updates.versions"), rows = t("updates.rows"), honest = t("updates.honest");
  wrap.append(
    h("h3", { class: "upd-h" }, t("updates.versions_title")),
    h("div", { class: "upd-vers" }, vers.map((v, i) => h("article", { class: `upd-v${i === vers.length - 1 ? " now" : ""}` },
      h("span", { class: "v" }, v.v), h("h3", null, v.name), h("ul", null, v.items.map((x) => h("li", null, x)))))),
    h("h3", { class: "upd-h" }, t("updates.table_title")),
    h("div", { class: "panel pad", style: "overflow-x:auto" }, h("table", { class: "upd-table" },
      h("thead", null, h("tr", null, ["what", "before", "now"].map((k) => h("th", { scope: "col" }, t(`updates.cols.${k}`))))),
      h("tbody", null, rows.map((r) => h("tr", null, h("td", null, r.what), h("td", null, r.before), h("td", null, r.now)))))),
    h("div", { class: "upd-honest" }, h("h3", { class: "upd-h" }, t("updates.honest_title")), h("ul", { class: "prec" }, honest.map((x) => h("li", null, x)))));
}
