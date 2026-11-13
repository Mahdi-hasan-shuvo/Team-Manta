// View 4: the same simulated change, with and without the software. Numbers come from /api/compare (the real detector).
import { h, reduced } from "../dom.js";
import { t, n, get } from "../i18n.js";
import { getJSON } from "../api.js";
import { clamp, spanText, polyLine, FAR_OWLT } from "./shared.js";

const PRESETS = { far: FAR_OWLT, mean: 12.51, near: 3.04 };
const XLEN = 10, DEMO_SECONDS = 14, Y_WITH = 1.8, Y_WITHOUT = -1.8;
const debounce = (fn, ms) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; };

export function create(ctx) {
  const layer = ctx.layer;
  const S = { data: null, owlt: FAR_OWLT, key: "far", review: 14, p: 0, playing: false, last: 0, err: null };
  const intro = h("p", { class: "cmp-intro" });
  const unitsW = () => ({ min: t("mission.common.min"), h: t("mission.common.h"), d: t("mission.common.d") });

  const rv = h("input", { type: "range", id: "mx-review", min: 1, max: 30, step: 1, value: S.review });
  const rvOut = h("output");
  const seg = h("div", { class: "seg grid2", role: "group", "aria-label": t("mission.compare.owlt") }, Object.keys(PRESETS).map((k) =>
    h("button", { type: "button", dataset: { k }, onclick: () => { S.key = k; S.owlt = PRESETS[k]; S.p = 0; S.playing = false; refetch(); paintSeg(); } }, t(`mission.delay.preset_${k}`))));
  const scrub = h("input", { type: "range", id: "mx-scrub", min: 0, max: 1000, step: 1, value: 0, "aria-label": t("mission.compare.time_axis") });
  const btnPlay = h("button", { class: "btn primary", type: "button" }, t("mission.common.play"));
  const btnRestart = h("button", { class: "btn ghost small", type: "button" }, t("mission.common.restart"));
  const stats = h("div", { class: "cmp-stats" });
  const lanes = h("div", { class: "cmp-lanes" });
  const tiny = h("p", { class: "hint" });
  const assump = h("div", { class: "cmp-assump" });
  const side = h("div", { class: "panel pad orb-side" }, intro,
    h("div", { class: "field" }, h("label", { for: "mx-review", class: "lbl" }, t("mission.compare.review"), rvOut), rv),
    h("div", { class: "lbl" }, t("mission.compare.owlt")), seg,
    h("div", { class: "field" }, h("label", { for: "mx-scrub", class: "lbl" }, t("mission.compare.time_axis")), scrub),
    h("div", { class: "orb-btns row" }, btnPlay, btnRestart), stats, tiny);
  const below = h("div", { class: "panel pad cmp-below" }, lanes, assump);

  const Tend = () => (S.data ? (S.data.without.first_guidance_min / 1440) * 1.08 : 8);     // days on the axis
  const nodesOf = (lane) => lane.events.reduce((o, e) => { o[e.id] = e.t_min / 1440; return o; }, {});

  function paintSeg() { seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === S.key))); }
  function paint() {
    rvOut.textContent = `${n(S.review)} ${t("mission.compare.review_unit")}`;
    const d = S.data;
    if (S.err) { stats.replaceChildren(h("p", null, `${t("mission.common.error")} ${S.err}`)); return; }
    if (!d) { stats.replaceChildren(h("p", { class: "hint" }, t("mission.common.loading"))); return; }
    const u = unitsW();
    const sig = t(`mission.crew.signals.${d.event.signals[0]}`), nm = d.crew.charAt(0).toUpperCase() + d.crew.slice(1);
    intro.textContent = t("mission.compare.intro", { name: nm, signal: sig });
    const dd = d.detector.delay_days;
    stats.replaceChildren(
      h("div", { class: "stat" }, h("span", null, t("mission.compare.stats.detector")), h("b", null, t(dd === 1 ? "mission.compare.stats.after" : "mission.compare.stats.after_many", { d: dd }))),
      h("div", { class: "stat" }, h("span", null, t("mission.compare.stats.rule")), h("b", null, get(`mission.compare.rule_names.${d.detector.rule}`) || d.detector.rule)),
      h("div", { class: "stat good" }, h("span", null, t("mission.compare.stats.gained")), h("b", { class: "nw" }, t("mission.compare.stats.gained_v", { d: n(d.days_gained, 1) }))),
      h("div", { class: "stat" }, h("span", null, `${t("mission.compare.lane_with")}: ${t("mission.compare.stats.first")}`), h("b", { class: "nw" }, spanText(d.with.first_guidance_min, u))),
      h("div", { class: "stat" }, h("span", null, `${t("mission.compare.lane_without")}: ${t("mission.compare.stats.first")}`), h("b", { class: "nw" }, spanText(d.without.first_guidance_min, u))));
    tiny.textContent = t("mission.compare.tiny", { rt: n(d.round_trip_min, 1) });
    lanes.replaceChildren(...["with", "without"].map((k) => h("div", { class: `lane-tbl ${k}` }, h("h4", null, t(`mission.compare.lane_${k}`)),
      h("ul", null, d[k].events.map((e, i, arr) => (i > 0 && e.t_min === arr[i - 1].t_min && e.id === "sent") ? null : h("li", null,
        h("span", null, t(`mission.compare.events.${e.id}`)), h("b", null, e.t_min === 0 ? `0 ${u.min}` : `+${spanText(e.t_min, u)}`)))))));
    assump.replaceChildren(h("h4", null, t("mission.compare.assump_title")), h("ul", null, [0, 1, 2].map((i) => h("li", null, t(`mission.compare.assump.${i}`)))), h("p", { class: "caveat" }, t("mission.compare.caveat")));
    scrub.value = String(Math.round(S.p * 1000));
    btnPlay.textContent = S.playing ? t("mission.common.pause") : t("mission.common.play");
    ctx.redraw();
    rebuild3d();
  }
  const refetch = debounce(async () => {
    S.err = null;
    try { S.data = await getJSON(`/api/compare?owlt_min=${S.owlt}&review_days=${S.review}`); } catch (e) { S.err = e.message; }
    paint();
  }, 120);
  rv.addEventListener("input", () => { S.review = +rv.value; S.p = 0; rvOut.textContent = `${n(S.review)} ${t("mission.compare.review_unit")}`; refetch(); });
  scrub.addEventListener("input", () => { S.p = +scrub.value / 1000; S.playing = false; btnPlay.textContent = t("mission.common.play"); ctx.redraw(); });
  btnPlay.addEventListener("click", () => { if (S.playing) { S.playing = false; } else { if (S.p >= 1) S.p = 0; if (reduced()) S.p = 1; else S.playing = true; } paint(); });
  btnRestart.addEventListener("click", () => { S.p = 0; S.playing = false; paint(); });

  // ---------------------------------------------------------------- 3D
  let root, dyn, avatars = [], nodes = [];
  const lblWith = ctx.tag("", "lane"), lblWithout = ctx.tag("", "lane warn");
  const lblOnset = ctx.tag("", "mk-lbl"), lblAlert = ctx.tag("", "ship"), lblNoticed = ctx.tag("", "warn"), lblSchem = ctx.tag("", "dist");
  let axisTags = [];
  const X = (day) => -XLEN / 2 + (day / Tend()) * XLEN;
  const driftY = (day, onset, act) => (day <= onset ? 0 : day < act ? Math.min(1, (day - onset) / 1.4) : Math.max(0, 1 - (day - act) / 1.6) * Math.min(1, (act - onset) / 1.4));

  function build3d() { const { THREE, st } = ctx; root = new THREE.Group(); root.visible = false; st.scene.add(root); dyn = new THREE.Group(); root.add(dyn); rebuild3d(); }
  function rebuild3d() {
    if (!root || !S.data) return;
    const { THREE } = ctx, d = S.data;
    while (dyn.children.length) { const c = dyn.children.pop(); c.geometry && c.geometry.dispose(); c.material && c.material.dispose && c.material.dispose(); }
    nodes = []; avatars = [];
    const lane = (k, y, col) => {
      const ev = nodesOf(d[k]), act = k === "with" ? ev.alert_on_board : ev.noticed_at_review;
      const track = new THREE.Mesh(new THREE.BoxGeometry(XLEN, 0.035, 0.035), new THREE.MeshBasicMaterial({ color: 0x3a4888 })); track.position.set(0, y, 0); dyn.add(track);
      const tk = []; for (let day = 0; day <= Tend(); day++) tk.push(new THREE.Vector3(X(day), y - 0.12, 0), new THREE.Vector3(X(day), y + 0.12, 0));
      const ticks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tk), new THREE.LineBasicMaterial({ color: 0x5a69b0, transparent: true, opacity: 0.7 })); dyn.add(ticks);
      const pts = []; for (let i = 0; i <= 160; i++) { const day = (i / 160) * Tend(); pts.push(new THREE.Vector3(X(day), y + 0.2 + 0.9 * driftY(day, ev.onset, act), 0)); }
      dyn.add(polyLine(THREE, pts, col, 0.95));
      const node = (day, c, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35 })); m.position.set(X(day), y, 0.02); m.userData.day = day; dyn.add(m); nodes.push(m); return m; };
      node(ev.onset, 0xffffff, 0.1); node(act, k === "with" ? 0x5ee6a8 : 0xff8272, 0.13); node(ev.sent, 0x7fe3f5, 0.05); node(ev.earth_has_it, 0x7fe3f5, 0.05); node(ev.answer_back, 0xffb347, 0.07);
      const av = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), new THREE.MeshBasicMaterial({ color: 0x5ee6a8 })); av.userData = { k, onset: ev.onset, act, answer: ev.answer_back }; dyn.add(av); avatars.push(av);
      return ev;
    };
    lane("with", Y_WITH, 0x5ee6a8); lane("without", Y_WITHOUT, 0xffb347);
    lblWith.textContent = t("mission.compare.lane_with"); lblWithout.textContent = t("mission.compare.lane_without");
    lblOnset.textContent = t("mission.compare.events.onset"); lblAlert.textContent = t("mission.compare.events.alert_on_board"); lblNoticed.textContent = t("mission.compare.events.noticed_at_review");
    lblSchem.textContent = t("mission.compare.schematic");
    axisTags.forEach((e) => e.remove()); axisTags = [];
    for (let day = 0; day <= Tend(); day += 2) axisTags.push(Object.assign(ctx.tag(`${n(day)} ${t("mission.common.d")}`, "axis", { layer }), { _day: day }));
  }

  function frame(T) {
    const { THREE, st } = ctx; const dt = Math.min(0.1, T - S.last); S.last = T;
    const { earth, mars, ship } = ctx; earth.visible = mars.visible = ship.visible = false;
    if (S.playing) { S.p = Math.min(1, S.p + dt / DEMO_SECONDS); if (S.p >= 1) { S.playing = false; btnPlay.textContent = t("mission.common.play"); } scrub.value = String(Math.round(S.p * 1000)); }
    const cur = S.p * Tend();
    nodes.forEach((m) => { m.material.opacity = cur >= m.userData.day - 1e-9 ? 1 : 0.3; });
    avatars.forEach((a) => {
      const y = a.userData.k === "with" ? Y_WITH : Y_WITHOUT, { onset, act, answer } = a.userData;
      a.position.set(X(cur), y, 0.04);
      a.material.color.setHex(cur < onset ? 0x5ee6a8 : cur < act ? 0xffb347 : cur < answer ? 0xff8272 : 0x5ee6a8);
      a.scale.setScalar(1 + (cur >= onset && cur < act ? 0.18 * Math.sin(T * 7) : 0));
    });
    const cam = st.camera, asp = Math.max(0.45, cam.aspect || 1), half = Math.tan((cam.fov * Math.PI) / 360);
    Object.assign(ctx.goal, { tx: 0, ty: 0, tz: 0, R: Math.max(7, (XLEN + 3.2) / (2 * half * asp)), yaw: 0.12, pitch: 0.2 });
    if (S.data) {
      const w = nodesOf(S.data.with), wo = nodesOf(S.data.without);
      ctx.place({ x: -XLEN / 2, y: Y_WITH + 1.4, z: 0 }, lblWith, 0, "left"); ctx.place({ x: -XLEN / 2, y: Y_WITHOUT + 1.25, z: 0 }, lblWithout, 0, "left");
      ctx.place({ x: X(0), y: 0.75, z: 0 }, lblOnset, 0, "center"); ctx.place({ x: X(w.alert_on_board), y: Y_WITH - 0.2, z: 0 }, lblAlert, 0, "below");
      ctx.place({ x: X(wo.noticed_at_review), y: Y_WITHOUT - 0.2, z: 0 }, lblNoticed, 0, "below");
      ctx.place({ x: XLEN / 2, y: 0, z: 0 }, lblSchem, 0, "right");
      axisTags.forEach((a) => ctx.place({ x: X(a._day), y: Y_WITHOUT - 0.95, z: 0 }, a, 0, "center"));
    }
  }

  return {
    id: "compare", side, below, build3d, frame,
    enter() { root && (root.visible = true); paintSeg(); if (!S.data && !S.err) refetch(); else paint(); },
    leave() { root && (root.visible = false); S.playing = false; },
    repaint() { paintSeg(); paint(); },
  };
}
