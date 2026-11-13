import { S, t } from "./i18n.js";
import { once } from "./api.js";
import { drawTrace } from "./trace.js";
import { reduced } from "./dom.js";

let data = null, raf = 0, st = { p: 0, t0: 0, paused: false, done: false, reach: 0 };
const el = {};

const SEG1 = 4200, HOLD = 1100, SEG2 = 2600;
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

function shape() {
  const idx = data.alerts.length ? data.alerts[0].day - data.first_day : -1;
  return {
    v: data.v, mu: data.mu, sd: data.sd, first_day: data.first_day,
    alerts: idx >= 0 ? [{ idx, main: true }] : [],
  };
}

function frame(now) {
  const d = shape();
  const a = d.alerts[0] ? d.alerts[0].idx / (d.v.length - 1) : 0.6;
  const el_ = now - st.t0;
  let p, callAlpha = 0, pulse = 1;
  if (el_ < SEG1) p = ease(el_ / SEG1) * a;
  else if (el_ < SEG1 + HOLD) { p = a; const k = (el_ - SEG1) / HOLD; callAlpha = Math.min(1, k * 2.2); pulse = (k * 1.6) % 1; }
  else if (el_ < SEG1 + HOLD + SEG2) { p = a + ease((el_ - SEG1 - HOLD) / SEG2) * (1 - a); callAlpha = 1; }
  else { p = 1; callAlpha = 1; st.done = true; }
  st.p = p;
  paint(p, callAlpha, pulse);
  if (!st.done && !st.paused) raf = requestAnimationFrame(frame);
}

function paint(p, callAlpha, pulse) {
  if (!data) return;
  const d = shape();
  const day = data.alerts[0] ? data.alerts[0].day : 0;
  drawTrace(el.canvas, d, {
    mode: "hero", progress: p, callAlpha, pulse,
    labels: { reading: t("hero.trace.reading") + " (ms)", baseline: t("hero.trace.baseline"), fires: t("hero.trace.fires", { day }), nodiag: t("hero.trace.nodiag") },
  });
}

export function replay() {
  cancelAnimationFrame(raf);
  st = { p: 0, t0: performance.now(), paused: false, done: false };
  el.pause.setAttribute("aria-pressed", "false"); el.pause.textContent = t("hero.trace.pause");
  if (reduced()) { st.done = true; paint(1, 1, 1); return; }
  raf = requestAnimationFrame(frame);
}

export function repaint() { if (data) paint(st.done ? 1 : st.p, st.done ? 1 : 1, 1); }

export async function renderHero() {
  el.canvas = document.getElementById("hero-canvas");
  el.pause = document.getElementById("trace-pause");
  const rep = document.getElementById("trace-replay");
  document.getElementById("hero-title").textContent = t("hero.title");
  document.getElementById("hero-tagline").textContent = t("hero.tagline");
  document.getElementById("hero-sub").textContent = t("hero.sub");
  document.getElementById("cta1").textContent = t("hero.cta_primary");
  document.getElementById("cta2").textContent = t("hero.cta_secondary");
  const chips = document.getElementById("hero-chips"); chips.textContent = "";
  t("hero.chips").forEach((c) => { const li = document.createElement("li"); li.className = "chip"; li.textContent = c; chips.append(li); });
  document.getElementById("trace-caption").textContent = t("hero.trace.caption");
  rep.textContent = t("hero.trace.replay");
  el.pause.textContent = st.paused ? t("hero.trace.play") : t("hero.trace.pause");
  if (!rep._wired) {
    rep._wired = true;
    rep.addEventListener("click", replay);
    el.pause.addEventListener("click", () => {
      if (st.done) return;
      st.paused = !st.paused;
      el.pause.setAttribute("aria-pressed", String(st.paused));
      el.pause.textContent = st.paused ? t("hero.trace.play") : t("hero.trace.pause");
      if (st.paused) { st.elapsed = performance.now() - st.t0; cancelAnimationFrame(raf); }
      else { st.t0 = performance.now() - (st.elapsed || 0); raf = requestAnimationFrame(frame); }
    });
    window.addEventListener("resize", () => repaint());
  }
  try {
    data = await once("/api/hero");
  } catch (e) { return; }
  const day = data.alerts[0] ? data.alerts[0].day : 0;
  el.canvas.setAttribute("aria-label", t("hero.trace.aria", { day }));
  if (st.t0 === 0 && !st.done) replay(); else repaint();
}

