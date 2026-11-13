import { h } from "../dom.js";
import { t } from "../i18n.js";
import { begin } from "./common.js";

export function render(el) {
  const { wrap } = begin(el, null);
  wrap.append(h("div", { class: "ch" },
    h("header", { class: "sec-head" }, h("h2", null, t("challenge.title")), h("p", null, t("challenge.body"))),
    h("ul", { class: "asks" }, t("challenge.asks").map((a) => h("li", null, h("b", null, a.k), h("span", null, a.v))))));
}
