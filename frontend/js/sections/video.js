import { h, fill } from "../dom.js";
import { S, t, digits } from "../i18n.js";
import { once } from "../api.js";
import { begin, errBox } from "./common.js";

let current = 0;

export async function render(el) {
  const { wrap } = begin(el, "video");
  const holder = h("div", null, h("div", { class: "skeleton" }));
  wrap.append(holder);
  let data;
  try { data = await once("/api/videos"); } catch (e) { fill(holder, errBox(e.message, () => render(el))); return; }
  const items = data.items;
  const why = (it) => t(`video.why.${it.topic}`);

  const stage = h("div", { class: "vid-stage tilt" });
  const fallback = h("div", { class: "vid-fallback" });
  const player = h("div", { class: "vid-player" }, stage, fallback);
  const info = h("div", { class: "vid-info" });
  const list = h("ul", { class: "vid-list", role: "list" });

  function poster(it) {
    const play = h("button", { class: "vid-play", type: "button", "aria-label": t("video.play", { title: it.title }) },
      h("span", { class: "vid-ring", "aria-hidden": "true" }, h("i", { class: "tri" })),
      h("span", { class: "vid-cta" }, t("video.load")));
    play.addEventListener("click", () => load(it));
    return h("div", { class: "vid-poster" },
      h("div", { class: "vid-stars", "aria-hidden": "true" }), h("div", { class: "vid-planet", "aria-hidden": "true" }),
      h("div", { class: "vid-cap" }, h("b", null, it.title), h("span", null, `${t("video.by")} ${it.channel}`)),
      play, h("p", { class: "vid-priv" }, t("video.privacy")));
  }
  function load(it) {
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(it.id)}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&hl=${S.lang}&cc_lang_pref=${S.lang}`;
    const frame = h("iframe", {
      src, title: it.title, loading: "lazy", allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
      referrerpolicy: "strict-origin-when-cross-origin",
    });
    fill(stage, h("div", { class: "vid-frame" }, frame));
    fill(fallback,
      h("span", null, t("video.fallback")),
      h("button", { class: "btn ghost small", type: "button", onclick: () => load(it) }, t("video.retry")),
      h("a", { class: "btn ghost small", href: `https://www.youtube.com/watch?v=${encodeURIComponent(it.id)}`, target: "_blank", rel: "noopener noreferrer" }, t("video.open")));
    stage.classList.remove("tilt"); stage.style.transform = "";
  }
  function show(i) {
    current = i; const it = items[i];
    stage.classList.add("tilt");
    fill(stage, poster(it));
    fill(fallback);
    fill(info,
      h("h3", null, it.title),
      h("p", { class: "vid-meta" }, `${t("video.by")} `, h("a", { href: it.channel_url, target: "_blank", rel: "noopener noreferrer" }, it.channel)),
      h("p", { class: "vid-why" }, why(it)),
      h("a", { class: "btn ghost small", href: `https://www.youtube.com/watch?v=${encodeURIComponent(it.id)}`, target: "_blank", rel: "noopener noreferrer" }, t("video.open")));
    list.querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
  }
  items.forEach((it, i) => list.append(h("li", null, h("button", { type: "button", "aria-pressed": "false", onclick: () => show(i) },
    h("span", { class: "vn" }, digits(String(i + 1).padStart(2, "0"))),
    h("span", { class: "vt" }, h("b", null, it.title), h("small", null, it.channel))))));

  fill(holder, h("div", { class: "vid" }, h("div", { class: "vid-main" }, player, info), list),
    h("p", { class: "vid-note" }, t("video.note", { date: digits(data.meta.verified) })));
  show(Math.min(current, items.length - 1));
}
