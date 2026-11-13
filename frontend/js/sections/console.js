import { h } from "../dom.js";
import { t } from "../i18n.js";
import { begin } from "./common.js";

let sel = 0;

export function render(el) {
  const { wrap } = begin(el, "console", { simulated: true });
  const shots = t("console.shots");
  const img = h("img", { loading: "lazy", decoding: "async", width: 1600, height: 1000 });
  const cap = h("figcaption");
  const thumbs = h("div", { class: "thumbs" });
  function show(i) {
    sel = i; const s = shots[i];
    img.src = s.src; img.alt = s.alt; cap.textContent = s.caption;
    thumbs.querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
  }
  shots.forEach((s, i) => thumbs.append(h("button", { class: "thumb", type: "button", "aria-label": s.caption, "aria-pressed": "false", onclick: () => show(i) },
    h("img", { src: s.src, alt: "", loading: "lazy", width: 400, height: 250 }))));
  wrap.append(h("div", { class: "shots" }, h("figure", { class: "shot-main" }, img, cap), thumbs));
  show(sel);
}
