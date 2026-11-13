import { h, reduced, fill } from "../dom.js";
import { t, n } from "../i18n.js";
import { getJSON, postJSON } from "../api.js";
import { begin } from "./common.js";

const L = { preset: "mars_mean", accel: 60, model: null };
const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs, ...kids) => { const e = document.createElementNS(NS, tag); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); kids.forEach((k) => e.append(k)); return e; };
const OWLT = { mars_near: 3.04, mars_mean: 12.51, mars_far: 22.29 };
const SAMPLE = '{\n  "day": 251,\n  "ts": 0,\n  "crew": [\n    { "id": "niloy", "status": "alert" }\n  ]\n}';
let payload = SAMPLE;

export function render(el) {
  const { wrap, signal } = begin(el, "link", { simulated: true });
  let packets = [], raf = 0, queued = 0;

  const presets = h("div", { class: "seg", role: "group" }, Object.keys(OWLT).map((k) => h("button", {
    type: "button", dataset: { k }, "aria-pressed": String(L.preset === k), onclick: () => { L.preset = k; presets.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === k))); refresh(); },
  }, t(`link.presets.${k}`))));
  const accel = h("input", { type: "range", id: "lk-accel", min: 1, max: 600, step: 1, value: L.accel, oninput: (e) => { L.accel = +e.target.value; refresh(); } });
  const out = { owlt: h("b"), accel: h("output"), oneway: h("b"), rt: h("b") };
  const sendBtn = h("button", { class: "btn primary", type: "button", onclick: send }, t("link.send"));
  const stages = h("div", { class: "stages" }, ["queued", "in_flight", "delivered"].map((s) => h("span", { class: "badge", dataset: { s, on: "false" } }, t(`link.${s}`))));

  const sky = svgEl("svg", { class: "sky", viewBox: "0 0 800 230", role: "img", "aria-label": `${t("link.ship")} → ${t("link.earth")}` });
  sky.append(svgEl("line", { class: "rail", x1: 170, y1: 115, x2: 630, y2: 115 }));
  const ship = svgEl("g", null,
    svgEl("rect", { x: 40, y: 80, width: 130, height: 70, rx: 12, fill: "var(--panel2)", stroke: "var(--line2)" }),
    svgEl("path", { d: "M52 118h24l10-22 14 40 10-26h20", fill: "none", stroke: "var(--lamp)", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  const earth = svgEl("g", null,
    svgEl("circle", { cx: 700, cy: 115, r: 62, fill: "var(--panel2)", stroke: "var(--line2)" }),
    svgEl("path", { d: "M660 100c14-18 34-14 44-4 12 12 30 8 34 20-10 8-22 4-30 14-10 12-30 14-42 4-10-8-14-20-6-34z", fill: "var(--ice)", opacity: ".45" }));
  const boxLbl = svgEl("text", { x: 105, y: 178, "text-anchor": "middle", class: "t-strong" }); boxLbl.textContent = t("link.ship");
  const earthLbl = svgEl("text", { x: 700, y: 200, "text-anchor": "middle", class: "t-strong" }); earthLbl.textContent = t("link.earth");
  const outLbl = svgEl("text", { x: 105, y: 202, "text-anchor": "middle" });
  const timer = svgEl("text", { x: 400, y: 92, "text-anchor": "middle" });
  const layer = svgEl("g");
  sky.append(ship, earth, boxLbl, earthLbl, outLbl, timer, layer);

  const left = h("div", { class: "panel pad" },
    h("div", { class: "lbl" }, t("link.distance")), presets,
    h("div", { class: "field" }, h("label", { for: "lk-accel", class: "lbl" }, t("link.accel"), out.accel), accel),
    h("div", { class: "stat" }, h("span", null, t("link.owlt")), out.owlt),
    h("div", { class: "stat" }, h("span", null, t("link.one_way_demo")), out.oneway),
    h("div", { class: "stat" }, h("span", null, t("link.round_trip_real")), out.rt),
    h("p", { class: "hint" }, t("link.note")));
  const right = h("div", { class: "panel pad" }, sky, h("div", null, sendBtn), stages);
  wrap.append(h("div", { class: "lk" }, left, right));

  // payload check
  const ta = h("textarea", { id: "lk-payload", spellcheck: "false", "aria-label": t("link.check_title") }); ta.value = payload;
  ta.addEventListener("input", () => { payload = ta.value; });
  const verdict = h("div", { class: "verdict-box", hidden: true, "aria-live": "polite" });
  wrap.append(h("div", { class: "check" },
    h("div", null, h("h3", null, t("link.check_title")), h("p", null, t("link.check_intro"))),
    h("div", null, ta, h("div", null, h("button", { class: "btn ghost small", type: "button", onclick: check }, t("link.check_btn"))), verdict)));
  async function check() {
    try {
      const r = await postJSON("/api/link/check", ta.value);
      verdict.hidden = false; verdict.className = `verdict-box ${r.accepted ? "ok" : "bad"}`;
      fill(verdict, h("b", null, r.accepted ? t("link.accepted") : t("link.rejected")), r.accepted ? null : h("ul", null, r.problems.map((p) => h("li", null, p))));
    } catch (e) { verdict.hidden = false; verdict.className = "verdict-box bad"; verdict.textContent = e.message; }
  }

  async function refresh() {
    out.accel.textContent = `×${n(L.accel)}`;
    try { L.model = await getJSON(`/api/link?owlt_min=${OWLT[L.preset]}&accel=${L.accel}`); } catch (e) { return; }
    out.owlt.textContent = `${n(L.model.owlt_min, 2)} ${t("link.min")}`;
    out.oneway.textContent = `${n(L.model.one_way_s, 1)} ${t("link.seconds")}`;
    out.rt.textContent = `${n(L.model.real_round_trip_min, 1)} ${t("link.min")}`;
  }
  function setStage(s) { stages.querySelectorAll(".badge").forEach((b) => b.dataset.on = String(b.dataset.s === s)); }

  function send() {
    if (!L.model) return;
    const now = performance.now();
    queued += 1; outLbl.textContent = `${t("link.outbox")}: ${n(queued)}`; setStage("queued");
    const dur = reduced() ? 400 : Math.max(500, L.model.one_way_s * 1000);
    packets.push({ t0: now + 600, dur });
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    fill(layer);
    let flying = null;
    packets = packets.filter((p) => {
      if (now < p.t0) return true;
      const k = (now - p.t0) / p.dur;
      if (k >= 1) { queued = Math.max(0, queued - 1); outLbl.textContent = queued ? `${t("link.outbox")}: ${n(queued)}` : ""; if (!packets.some((q) => q !== p && now < q.t0 + q.dur)) setStage("delivered"); return false; }
      if (!p.out) { p.out = true; queued = Math.max(0, queued - 1); outLbl.textContent = queued ? `${t("link.outbox")}: ${n(queued)}` : ""; setStage("in_flight"); }
      const x = 170 + 460 * k;
      layer.append(svgEl("circle", { class: "pkt-ring", cx: x, cy: 115, r: 8 + 6 * Math.sin(k * 20) * 0.5 + 6 }), svgEl("circle", { class: "pkt", cx: x, cy: 115, r: 7 }));
      flying = p; return true;
    });
    if (flying) timer.textContent = t("link.arrives_in", { s: n(((1 - (now - flying.t0) / flying.dur) * flying.dur) / 1000, 1) }); else timer.textContent = "";
    if (packets.length) raf = requestAnimationFrame(tick); else { raf = 0; }
  }
  signal.addEventListener("abort", () => cancelAnimationFrame(raf));
  refresh();
}
