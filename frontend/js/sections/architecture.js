import { h, fill } from "../dom.js";
import { t } from "../i18n.js";
import { begin } from "./common.js";

let sel = "detector";

export function render(el) {
  const { wrap } = begin(el, "architecture");
  const layers = t("architecture.layers");
  const detail = h("div", { class: "detail", "aria-live": "polite" });
  const nodes = {};

  function show(id, animate) {
    sel = id;
    let found = null;
    layers.forEach((l) => l.nodes.forEach((nd) => { if (nd.id === id) found = { l, nd }; }));
    Object.entries(nodes).forEach(([k, b]) => b.setAttribute("aria-pressed", String(k === id)));
    if (!found) return;
    fill(detail, 
      h("div", null, h("h4", null, `${found.l.name} / ${found.nd.name}`), h("p", null, found.nd.detail)),
      h("code", { class: "file", title: t("architecture.open_file") }, found.nd.file));
    if (animate) { detail.classList.remove("swap"); void detail.offsetWidth; detail.classList.add("swap"); }
  }

  const arrow = () => h("div", { class: "flow", "aria-hidden": "true" }, h("i"), h("i"));
  const cols = [];
  layers.forEach((l, i) => {
    if (i) cols.push(arrow());
    cols.push(h("div", { class: `layer ${l.id}` }, h("h3", null, l.name), h("p", { class: "bl" }, l.blurb),
      h("ul", null, l.nodes.map((nd) => {
        const b = h("button", { class: "node", type: "button", "aria-pressed": "false", onclick: () => show(nd.id, true) },
          h("b", null, nd.name), h("span", null, nd.short));
        nodes[nd.id] = b; return h("li", null, b);
      }))));
  });
  wrap.append(h("div", { class: "arch" }, cols), detail, h("p", { class: "transport" }, t("architecture.transport")));
  show(sel, false);
}
