import { h, fill } from "../dom.js";
import { t } from "../i18n.js";
import { begin } from "./common.js";

let tab = "console";

export function render(el) {
  const { wrap } = begin(el, "tech");
  wrap.append(h("div", { class: "tc" },
    h("div", null, h("h3", null, t("tech.stack_title")),
      h("dl", { class: "kv" }, t("tech.stack").map((s) => h("div", null, h("dt", null, s.k), h("dd", null, s.v))))),
    h("div", null, h("h3", null, t("tech.pipeline_title")), h("ol", { class: "pipe" }, t("tech.pipeline").map((p) => h("li", null, p))))));

  const body = h("ul", { class: "eps" });
  const seg = h("div", { class: "seg", role: "group" },
    [["console", "tech.endpoints_title"], ["site", "tech.site_endpoints_title"]].map(([k, key]) => h("button", {
      type: "button", dataset: { k }, "aria-pressed": String(k === tab), onclick: () => { tab = k; draw(); } }, t(key))));
  function draw() {
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === tab)));
    const items = t(tab === "console" ? "tech.endpoints" : "tech.site_endpoints");
    fill(body, ...items.map((e) => h("li", null, h("span", { class: `m ${e.m}` }, e.m), h("code", null, e.p), h("span", null, e.d))));
  }
  wrap.append(h("div", { class: "api" }, h("div", { class: "api-head" }, seg), body),
    h("div", { class: "tree" }, h("h3", null, t("tech.tree_title")), h("pre", { tabindex: "0" }, t("tech.tree"))));
  draw();
}
