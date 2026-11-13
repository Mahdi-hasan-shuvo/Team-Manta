// Canvas line chart shared by the hero and the playground.
// d = { v, mu, sd, first_day, alerts:[{idx, main}], injected? }
import { css } from "./dom.js";

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/); const lines = []; let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function drawTrace(canvas, d, o = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  const W = Math.max(40, r.width), H = Math.max(40, r.height);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const C = { ice: css("--ice", canvas), lamp: css("--lamp", canvas), band: css("--band", canvas), bandline: css("--bandline", canvas), dim: css("--dim", canvas),
              faint: css("--faint", canvas), text: css("--text", canvas), line: css("--line", canvas), danger: css("--danger", canvas), panel: css("--panel", canvas), bg: css("--bg", canvas) };
  const fam = css("--font-body", canvas);
  const hero = o.mode === "hero";
  const pad = { l: o.axis ? 52 : 6, r: 12, t: hero ? (W < 560 ? 150 : 100) : 16, b: o.axis ? 30 : 18 };
  const n = d.v.length;
  const xAt = (i) => pad.l + (i * (W - pad.l - pad.r)) / (n - 1);

  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    lo = Math.min(lo, d.v[i]); hi = Math.max(hi, d.v[i]);
    if (d.mu[i] != null) { lo = Math.min(lo, d.mu[i] - 2.4 * d.sd[i]); hi = Math.max(hi, d.mu[i] + 2.4 * d.sd[i]); }
  }
  const span = hi - lo || 1; lo -= span * 0.04; hi += span * 0.04;
  const yAt = (v) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  canvas._layout = { xAt, yAt, pad, n, W, H };

  // grid + axes
  ctx.font = `500 12px ${fam}`; ctx.textBaseline = "middle";
  if (o.axis) {
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.fillStyle = C.faint; ctx.textAlign = "right";
    for (let k = 0; k <= 4; k++) {
      const v = lo + ((hi - lo) * k) / 4, y = yAt(v);
      ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillText(o.fmt ? o.fmt(v) : v.toFixed(1), pad.l - 8, y);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const step = n > 90 ? 20 : 10;
    for (let i = 0; i < n; i += step) ctx.fillText(String((d.first_day || 0) + i), xAt(i), H - pad.b + 8);
  }

  const f = Math.max(0, Math.min(1, o.progress == null ? 1 : o.progress)) * (n - 1);
  const last = Math.floor(f);

  // injected change strips
  if (d.injected) {
    ctx.fillStyle = C.lamp; ctx.globalAlpha = 0.14;
    const half = (xAt(1) - xAt(0)) / 2;
    d.injected.forEach((on, i) => { if (on && i <= f + 0.5) ctx.fillRect(xAt(i) - half, pad.t, half * 2, H - pad.t - pad.b); });
    ctx.globalAlpha = 1;
  }

  // baseline band
  ctx.beginPath(); let started = false;
  for (let i = 0; i <= last; i++) { if (d.mu[i] == null) continue; const x = xAt(i), y = yAt(d.mu[i] + 2 * d.sd[i]); started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; }
  for (let i = last; i >= 0; i--) { if (d.mu[i] == null) continue; ctx.lineTo(xAt(i), yAt(d.mu[i] - 2 * d.sd[i])); }
  ctx.closePath(); ctx.fillStyle = C.band; ctx.fill();
  ctx.strokeStyle = C.bandline; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.setLineDash([5, 5]); ctx.beginPath(); started = false;
  for (let i = 0; i <= last; i++) { if (d.mu[i] == null) continue; const x = xAt(i), y = yAt(d.mu[i]); started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; }
  ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;

  // alert verticals
  (d.alerts || []).forEach((a) => {
    if (a.idx > f) return;
    const x = xAt(a.idx);
    if (a.main) {
      ctx.strokeStyle = C.lamp; ctx.lineWidth = 1.5; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(x, pad.t - (hero ? 6 : 0)); ctx.lineTo(x, H - pad.b); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.fillStyle = C.faint; ctx.beginPath(); ctx.moveTo(x, H - pad.b); ctx.lineTo(x - 5, H - pad.b + 8); ctx.lineTo(x + 5, H - pad.b + 8); ctx.closePath(); ctx.fill();
    }
  });

  // value line
  ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = C.ice; ctx.lineWidth = hero ? 2.6 : 2;
  ctx.beginPath(); ctx.moveTo(xAt(0), yAt(d.v[0]));
  for (let i = 1; i <= last; i++) ctx.lineTo(xAt(i), yAt(d.v[i]));
  let hx = xAt(last), hy = yAt(d.v[last]);
  if (last < n - 1 && f > last) {
    const fr = f - last; hx = xAt(last) + (xAt(last + 1) - xAt(last)) * fr; hy = yAt(d.v[last]) + (yAt(d.v[last + 1]) - yAt(d.v[last])) * fr;
    ctx.lineTo(hx, hy);
  }
  ctx.stroke();
  if (!hero) { ctx.fillStyle = C.ice; for (let i = 0; i <= last; i += 1) { ctx.beginPath(); ctx.arc(xAt(i), yAt(d.v[i]), 1.6, 0, 6.3); ctx.fill(); } }

  // head glow while drawing
  if (o.progress != null && o.progress < 1) {
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 16); g.addColorStop(0, C.ice); g.addColorStop(1, "transparent");
    ctx.globalAlpha = 0.55; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, 16, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = C.ice; ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, 6.3); ctx.fill();
  }

  // alert rings
  (d.alerts || []).forEach((a) => {
    if (!a.main || a.idx > f) return;
    const x = xAt(a.idx), y = yAt(d.v[a.idx]);
    ctx.fillStyle = C.lamp; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 6.3); ctx.fill();
    ctx.strokeStyle = C.lamp; ctx.lineWidth = 2;
    const pulse = o.pulse == null ? 1 : o.pulse;
    ctx.globalAlpha = Math.max(0, 1 - pulse); ctx.beginPath(); ctx.arc(x, y, 9 + pulse * 22, 0, 6.3); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.3); ctx.globalAlpha = 0.7; ctx.stroke(); ctx.globalAlpha = 1;
  });

  // hero legend + callout
  if (hero) {
    ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.font = `500 ${W < 560 ? 12 : 13}px ${fam}`;
    ctx.strokeStyle = C.ice; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(pad.l + 2, 16); ctx.lineTo(pad.l + 26, 16); ctx.stroke();
    ctx.fillStyle = C.dim; ctx.fillText(o.labels.reading, pad.l + 34, 16);
    ctx.fillStyle = C.band; ctx.fillRect(pad.l + 2, 36, 24, 11); ctx.strokeStyle = C.bandline; ctx.lineWidth = 1; ctx.strokeRect(pad.l + 2.5, 36.5, 23, 10);
    ctx.fillStyle = C.dim; ctx.fillText(o.labels.baseline, pad.l + 34, 42);
    const a = (d.alerts || []).find((q) => q.main);
    if (a && f >= a.idx && o.callAlpha > 0) {
      const x = xAt(a.idx); const bw = Math.min(W < 560 ? W - 24 : 340, W * 0.8);
      ctx.font = `700 ${W < 560 ? 14 : 16}px ${fam}`;
      const lines = wrap(ctx, o.labels.fires, bw - 24); const lh = W < 560 ? 19 : 22;
      const bh = lines.length * lh + 36; let bx = x + 16; if (bx + bw > W - 6) bx = Math.max(6, x - 16 - bw);
      if (W < 560) bx = Math.max(6, Math.min(W - bw - 6, x - bw / 2));
      const by = W < 560 ? 60 : 6;
      ctx.globalAlpha = o.callAlpha;
      ctx.fillStyle = C.panel; ctx.strokeStyle = C.lamp; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.text; ctx.textBaseline = "top"; ctx.font = `700 ${W < 560 ? 14 : 16}px ${fam}`;
      lines.forEach((ln, i) => ctx.fillText(ln, bx + 12, by + 10 + i * lh));
      ctx.fillStyle = C.dim; ctx.font = `500 13px ${fam}`; ctx.fillText(o.labels.nodiag, bx + 12, by + 12 + lines.length * lh);
      ctx.globalAlpha = 1;
    }
  }

  // hover crosshair
  if (o.hover != null && o.hover >= 0 && o.hover < n) {
    const x = xAt(o.hover), y = yAt(d.v[o.hover]);
    ctx.strokeStyle = C.dim; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, H - pad.b); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = C.bg; ctx.strokeStyle = C.ice; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.3); ctx.fill(); ctx.stroke();
  }
}
