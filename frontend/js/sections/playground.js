import { h, debounce, fill } from "../dom.js";
import { t, n } from "../i18n.js";
import { postJSON } from "../api.js";
import { drawTrace } from "../trace.js";
import { begin, alertLine, unitOf } from "./common.js";

const P = { signal: "hrv", shift_sd: 3, duration: 2, mode: "step", seed: 7 };
let last = null, seq = 0;
const SIGS = ["hrv", "hr", "spo2", "sleep_h", "core_temp", "exercise_min"];

export function render(el) {
  const { wrap, signal } = begin(el, "playground", { simulated: true });
  const canvas = h("canvas", { role: "img", "aria-label": t("playground.aria") });
  const tip = h("div", { class: "tip", hidden: true });
  const result = h("div", { class: "result", "aria-live": "polite" });
  const out = { shift: h("output"), days: h("output"), seed: h("output") };

  const sel = h("select", { id: "pg-signal", onchange: (e) => { P.signal = e.target.value; run(); } },
    SIGS.map((s) => h("option", { value: s, selected: s === P.signal }, t(`nasa.signal_names.${s}`))));
  const shift = h("input", { type: "range", id: "pg-shift", min: 0, max: 6, step: 0.5, value: P.shift_sd, oninput: (e) => { P.shift_sd = +e.target.value; sync(); run(); } });
  const days = h("input", { type: "range", id: "pg-days", min: 1, max: 30, step: 1, value: P.duration, oninput: (e) => { P.duration = +e.target.value; sync(); run(); } });
  const seg = h("div", { class: "seg", role: "group" }, ["step", "ramp"].map((m) => h("button", {
    type: "button", "aria-pressed": String(P.mode === m), dataset: { m }, onclick: () => { P.mode = m; seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === m))); run(); },
  }, t(`playground.${m}`))));
  const person = h("button", { class: "btn ghost small", type: "button", onclick: () => { P.seed = Math.floor(Math.random() * 9000) + 1; sync(); run(); } }, t("playground.random"));

  function sync() { out.shift.textContent = `${n(P.shift_sd, 1)} ${t("playground.size_unit")}`; out.days.textContent = n(P.duration); out.seed.textContent = n(P.seed); }

  const ctrls = h("div", { class: "panel pad ctrls" },
    h("div", { class: "field" }, h("label", { for: "pg-signal" }, t("playground.signal")), sel),
    h("div", { class: "field" }, h("label", { for: "pg-shift" }, t("playground.size"), out.shift), shift),
    h("div", { class: "field" }, h("label", { for: "pg-days" }, t("playground.days"), out.days), days),
    h("div", { class: "field" }, h("div", { class: "fl" }, t("playground.shape")), seg, h("p", { class: "hint" }, t("playground.shape_hint"))),
    h("div", { class: "field" }, h("div", { class: "fl" }, t("playground.person"), out.seed), person));
  const legend = h("div", { class: "legend" },
    h("span", null, h("i", { class: "l-v" }), t("playground.series")), h("span", null, h("i", { class: "l-b" }), t("playground.baseline")),
    h("span", null, h("i", { class: "l-i" }), t("playground.injected")), h("span", null, h("i", { class: "l-a" }), t("playground.alert")));
  wrap.append(h("div", { class: "pg", id: "pg" }, ctrls,
    h("div", null, h("div", { class: "panel pad" }, h("div", { class: "chart-box" }, canvas, tip), legend), result)));
  sync();

  let hover = null;
  function dataFor(r) {
    return { v: r.v, mu: r.mu, sd: r.sd, first_day: 0, injected: r.injected,
      alerts: r.alerts.map((a) => ({ idx: a.day, main: a.signals.includes(r.signal.id) })) };
  }
  function paint() {
    if (!last) return;
    drawTrace(canvas, dataFor(last), { axis: true, hover, fmt: (v) => n(v, last.signal.id === "spo2" || last.signal.id === "core_temp" ? 1 : 0) });
  }
  function showResult(r) {
    const s = r.summary, ramp = r.mode === "ramp";
    const main = s.detected
      ? h("div", { class: "main ok" }, t(s.delay_days === 0 ? "playground.caught_same" : "playground.caught", { day: s.first_alert_day, delay: s.delay_days }))
      : h("div", { class: "main miss" }, t("playground.missed"));
    const list = r.alerts.length
      ? h("ul", { class: "alert-list" }, r.alerts.map((a) => h("li", null, h("b", null, `${t("playground.alert")} · ${n(a.day)}: `), alertLine(a))))
      : h("p", { class: "sub" }, t("playground.none"));
    fill(result, main,
      ramp && (!s.detected || s.delay_days >= 5) ? h("p", { class: "sub" }, t("playground.ramp_note")) : null,
      h("p", { class: "sub" }, t("playground.chance", { n: s.chance_alerts })),
      h("div", { class: "lbl" }, t("playground.alerts_title")), list);
  }

  const run = debounce(async () => {
    const mine = ++seq;
    try {
      const r = await postJSON("/api/playground", P);
      if (mine !== seq) return;
      last = r; paint(); showResult(r);
    } catch (e) { fill(result, h("p", { class: "sub" }, `${t("ui.error")} (${e.message})`)); }
  }, 140);

  canvas.addEventListener("pointermove", (e) => {
    if (!last || !canvas._layout) return;
    const L = canvas._layout, rect = canvas.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left - L.pad.l) / (L.W - L.pad.l - L.pad.r)) * (L.n - 1));
    if (i < 0 || i >= L.n) { hover = null; tip.hidden = true; paint(); return; }
    hover = i; paint();
    const w = last.w[i];
    tip.hidden = false; tip.style.left = L.xAt(i) + "px"; tip.style.top = L.yAt(last.v[i]) + "px";
    tip.textContent = `${n(i)}: ${n(last.v[i], 1)} ${unitOf(last.signal.id)}${w == null ? "" : ` · ${n(w, 1)} SD`}`;
  }, { signal });
  canvas.addEventListener("pointerleave", () => { hover = null; tip.hidden = true; paint(); }, { signal });
  window.addEventListener("resize", paint, { signal });

  if (last) { paint(); showResult(last); } else run();
  // Re-run once the section scrolls into view so the first paint has the right size.
  if (last === null) new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { paint(); o.disconnect(); } }).observe(canvas);
}
export function repaintPlayground() { document.querySelector("#playground canvas") && window.dispatchEvent(new Event("resize")); }
