import { h, fill } from "../dom.js";
import { t } from "../i18n.js";
import { begin } from "./common.js";

let sel = "delay";

export function render(el) {
  const { wrap } = begin(el, "problems");
  const items = t("problems.items");
  const detail = h("div", { class: "panel pad pm-detail", role: "tabpanel", "aria-live": "polite" });
  const list = h("div", { class: "pm-list", role: "tablist", "aria-label": t("problems.pick") });

  function show(id, animate) {
    sel = id;
    const it = items.find((x) => x.id === id);
    list.querySelectorAll(".pm-btn").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.id === id)));
    fill(detail, 
      h("span", { class: `badge ${it.status}` }, t(`problems.status.${it.status}`)),
      h("p", { class: "short" }, it.short),
      h("div", { class: "pm-blocks" },
        h("div", null, h("div", { class: "lbl" }, t("problems.labels.how")), h("p", null, it.how)),
        h("div", null, h("div", { class: "lbl" }, t("problems.labels.limit")), h("p", null, it.limit)),
        h("div", null, h("div", { class: "lbl" }, t("problems.labels.where")), h("code", null, it.where))));
    detail.setAttribute("aria-labelledby", `pm-${id}`);
    if (animate) { detail.classList.remove("swap"); void detail.offsetWidth; detail.classList.add("swap"); }
  }

  items.forEach((it) => list.append(h("button", {
    class: "pm-btn", type: "button", role: "tab", id: `pm-${it.id}`, dataset: { id: it.id }, "aria-selected": "false",
    onclick: () => show(it.id, true),
    onkeydown: (e) => {
      const i = items.findIndex((x) => x.id === sel);
      const nx = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
      if (nx) { e.preventDefault(); const j = (i + nx + items.length) % items.length; show(items[j].id, true); list.children[j].focus(); }
    },
  }, h("b", null, it.name), h("span", { class: `badge ${it.status}` }, t(`problems.status.${it.status}`)))));

  wrap.append(h("div", { class: "pm" }, list, detail));
  show(sel, false);
}
