import { h, clear } from "../dom.js";
import { t } from "../i18n.js";

/** Reset a section and return {wrap, ac}: ac aborts listeners from the previous render. */
export function begin(el, key, opts = {}) {
  if (el._ac) el._ac.abort();
  el._ac = new AbortController();
  clear(el);
  el.className = "sec";
  const wrap = h("div", { class: "wrap" });
  if (key) {
    wrap.append(h("header", { class: "sec-head" },
      h("h2", null, t(`${key}.title`)),
      opts.intro === false ? null : h("p", null, opts.introText || t(`${key}.intro`)),
      opts.simulated ? h("span", { class: "sim-tag" }, t("ui.simulated")) : null));
  }
  el.append(wrap);
  return { wrap, ac: el._ac, signal: el._ac.signal };
}

export function statusEl(st) { return h("span", { class: `st ${st}` }, t(`ui.status.${st}`)); }

export function errBox(msg, retry) {
  return h("div", { class: "panel pad" }, h("p", null, t("ui.error")), h("p", { class: "hint" }, msg),
    retry ? h("button", { class: "btn ghost small", type: "button", onclick: retry }, t("ui.retry")) : null);
}

import { n } from "../i18n.js";
const UNITS = { hr: "bpm", hrv: "ms", spo2: "%", sleep_h: "h", core_temp: "°C", exercise_min: "min" };
export const unitOf = (sig) => UNITS[sig] || "";

/** Localised one-line explanation built from the alert's numbers (same facts as the server's template). */
export function alertLine(a) {
  const rule = a.rule === "multi_signal_deviation" ? "Rule M" : "Rule S";
  const body = a.details.map((d) => t("ui.alert_line", {
    signal: t(`nasa.signal_names.${d.signal}`), sd: n(Math.abs(d.z), 1), dir: t(d.z < 0 ? "ui.dir_below" : "ui.dir_above"),
    win: d.window_days, cur: n(d.current, 1), unit: unitOf(d.signal), mean: n(d.baseline_mean, 1), bsd: n(d.baseline_sd, 1),
  })).join(" ");
  return `${body} ${t("ui.rule_fired", { rule })}`;
}
