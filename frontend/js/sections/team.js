import { h } from "../dom.js";
import { t } from "../i18n.js";
import { begin } from "./common.js";

const PHOTO_SIZES = [[782, 768], [768, 921], [768, 1024], [768, 1070], [768, 1024], [768, 772]];

export function render(el) {
  const { wrap } = begin(el, null);
  const members = t("team.members");
  wrap.append(
    h("header", { class: "team-intro" },
      h("p", { class: "team-kicker" }, "TEAM MANTA"),
      h("h2", null, t("team.title")),
      h("p", { class: "team-tagline" }, t("team.tagline")),
      h("p", { class: "team-description" }, t("team.intro")),
      h("div", { class: "team-meta" },
        h("p", null, t("team.challenge")),
        h("p", null, t("team.category")))),
    h("div", { class: "team-grid", role: "list", "aria-label": t("team.title") },
      members.map((member, index) => h("article", { class: "team-card", role: "listitem" },
        h("div", { class: "team-card-frame" },
          h("figure", { class: "team-card-photo" },
            h("img", { src: member.image, alt: member.alt, width: PHOTO_SIZES[index][0], height: PHOTO_SIZES[index][1], loading: "lazy", decoding: "async" }),
            h("span", { class: "team-card-number", "aria-hidden": "true" }, String(index + 1).padStart(2, "0"))),
          h("div", { class: "team-card-copy" },
            h("h3", null, member.name),
            h("p", null, member.role)))))),
  h("figure", { class: "team-photo" },
    h("div", { class: "team-photo-frame" },
      h("img", {
        src: "/img/team-manta.png",
        alt: t("team.photo_alt"),
        width: "1152",
        height: "768",
        loading: "lazy",
        decoding: "async",
      })),
    h("figcaption", null, t("team.photo_caption"))));
}
