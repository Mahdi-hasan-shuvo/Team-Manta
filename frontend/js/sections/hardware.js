import { h } from "../dom.js";
import { t } from "../i18n.js";
import { begin } from "./common.js";

const dl = (items) => h("dl", null, items.map((i) => h("div", null, h("dt", null, i.name), h("dd", null, i.role))));

export function render(el) {
  const { wrap } = begin(el, "hardware");
  wrap.append(h("div", { class: "hw" },
    h("div", { class: "panel pad" }, h("h3", null, t("hardware.prototype.title")), dl(t("hardware.prototype.items"))),
    h("div", { class: "panel pad flight" }, h("h3", null, t("hardware.flight.title")), dl(t("hardware.flight.items")))),
    h("div", { class: "prec" }, h("h4", null, t("hardware.precedents_title")), h("ul", null, t("hardware.precedents").map((p) => h("li", null, p))),
      h("p", { class: "note" }, t("hardware.note"))));
}
