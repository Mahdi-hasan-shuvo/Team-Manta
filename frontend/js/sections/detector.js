import { h, fill } from "../dom.js";
import { t, n } from "../i18n.js";
import { once } from "../api.js";
import { begin } from "./common.js";

export async function render(el) {
  const { wrap, signal } = begin(el, "detector");
  const steps = h("ol", { class: "steps" }, t("detector.steps").map((s) => h("li", null, h("h3", null, s.title), h("p", null, s.body))));
  const val = h("aside", { class: "panel pad val" }, h("div", { class: "skeleton" }));
  wrap.append(h("div", { class: "det" }, steps, val));

  // Scroll-linked rail: it fills as each step passes the reading line.
  const lis = [...steps.children];
  const upd = () => {
    const line = window.innerHeight * 0.62; let fill = 0;
    lis.forEach((li) => {
      const r = li.getBoundingClientRect();
      const on = r.top < line; li.classList.toggle("on", on);
      if (on) fill = Math.max(fill, Math.min(r.bottom, line) - steps.getBoundingClientRect().top - 8);
    });
    steps.style.setProperty("--fill", Math.max(0, fill) + "px");
  };
  window.addEventListener("scroll", upd, { passive: true, signal }); window.addEventListener("resize", upd, { signal }); upd();

  // Signals row
  let sigs = [];
  try { sigs = (await once("/api/signals")).signals; } catch (e) { /* shown below */ }
  wrap.append(h("div", { class: "sigs" }, h("h3", null, t("detector.signals_title")),
    h("div", { class: "sig-grid" }, sigs.map((s) => h("div", { class: "sig" },
      h("b", null, t(`nasa.signal_names.${s.id}`)),
      h("span", null, h("span", { class: "arrow", "aria-hidden": "true" }, s.direction === "high" ? "▲" : "▼"), t(`detector.worse.${s.direction}`), " · ", s.unit))))));

  try {
    const v = await once("/api/validation");
    const vt = t("detector.validation");
    const runs = v.false_alarms.runs;
    const val_ = {
      fa_single: [v.false_alarms.single_per_1000_days, 30, true, 1], fa_multi: [v.false_alarms.multi_per_1000_days, 30, true, 1],
      det_single: [v.single_event.detection_rate_pct, 100, false, 1, "%"], det_multi: [v.multi_event.detection_rate_pct, 100, false, 1, "%"],
      delay_single: [v.single_event.mean_delay_days, 0, null, 1], delay_multi: [v.multi_event.mean_delay_days, 0, null, 1],
    };
    fill(val, 
      h("h3", null, vt.title),
      h("p", { class: "intro" }, t("detector.validation.intro", { runs })),
      vt.rows.map((r) => {
        const [x, max, warn, dp, suf] = val_[r.id];
        const row = h("div", { class: "vrow" },
          h("div", { class: "t" }, h("span", null, r.label), h("b", null, n(x, dp) + (suf || ""))),
          h("div", { class: "u" }, r.unit),
          max ? h("div", { class: `bar${warn ? " warn" : ""}` }, h("i")) : null);
        if (max) requestAnimationFrame(() => setTimeout(() => row.querySelector("i").style.setProperty("--w", Math.min(100, (x / max) * 100) + "%"), 80));
        return row;
      }),
      h("p", { class: "caveat" }, vt.caveat));
  } catch (e) { fill(val, h("p", null, t("ui.error"))); }
}
