import { h } from "../dom.js";
import { t } from "../i18n.js";
import { begin } from "./common.js";

export function render(el) {
  const { wrap } = begin(el, "limits");
  const col = (title, items) => h("div", null, h("h3", null, title), h("ul", null, items.map((i) => h("li", null, i))));
  wrap.append(h("div", { class: "lim" }, col(t("limits.is_title"), t("limits.is")), col(t("limits.isnt_title"), t("limits.isnt")), col(t("limits.todo_title"), t("limits.todo"))));
}
