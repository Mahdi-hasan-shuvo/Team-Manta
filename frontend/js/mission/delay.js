// View 2: a question from Mars and its answer, about 22 minutes each way, 44 minutes in total.
import { h, reduced } from "../dom.js";
import { t, n } from "../i18n.js";
import { getJSON } from "../api.js";
import { clamp, clockText, FAR_OWLT, lightToMkm } from "./shared.js";

const PRESETS = { far: FAR_OWLT, mean: 12.51, near: 3.04 };
const DEMO_SECONDS = 16;        // the whole round trip plays in this many real seconds
const dFor = (o) => 3.4 + o * 0.62;

export function create(ctx) {
  const S = { owlt: FAR_OWLT, t: 0, playing: false, today: null, last: 0, D: dFor(FAR_OWLT), key: "far" };

  // ---- overlay clock (inside the 3D view)
  const clockBig = h("span", { class: "big" }, "00:00"), clockSub = h("span", { class: "sub" }, t("mission.delay.clock_real"));
  const clock = ctx.overlay(h("div", { class: "clock", "aria-hidden": "true" }, clockBig, clockSub));
  const lblEarth = ctx.tag(t("link.earth"), "earth"), lblShip = ctx.tag(t("link.ship"), "ship"), lblMars = ctx.tag(t("orbit.mars"), "mars"), lblDist = ctx.tag("", "dist");

  // ---- side panel
  const presetBtns = {};
  const seg = h("div", { class: "seg grid2", role: "group", "aria-label": t("mission.delay.owlt") }, ["far", "mean", "near"].map((k) =>
    (presetBtns[k] = h("button", { type: "button", onclick: () => choose(k, PRESETS[k]) }, t(`mission.delay.preset_${k}`)))));
  presetBtns.today = h("button", { type: "button", disabled: true, onclick: () => S.today && choose("today", S.today.one_way_min) }, t("mission.delay.preset_today"));
  seg.append(presetBtns.today);
  const slider = h("input", { type: "range", id: "md-clock", min: 0, max: 100, step: 0.01, value: 0, "aria-describedby": "md-phase" });
  const out = { clock: h("output"), owlt: h("b"), rt: h("b"), km: h("b") };
  const btnPlay = h("button", { class: "btn primary", type: "button" }, t("mission.common.play"));
  const btnRestart = h("button", { class: "btn ghost small", type: "button" }, t("mission.common.restart"));
  const legs = ["out", "back", "total"].map((k) => { const fill = h("i"); const val = h("b"); return { k, fill, val, row: h("div", { class: `leg ${k}` }, h("span", null, t(`mission.delay.legs.${k}`)), val, h("span", { class: "bar" }, fill)) }; });
  const phase = h("p", { class: "phase", id: "md-phase", "aria-live": "polite" });
  const decide = h("p", { class: "orb-take" });
  const note = h("p", { class: "hint" });

  // ---- today's value from NASA/JPL Horizons, fetched by our server only when asked
  const liveStatus = h("span", { class: "st" }), liveBody = h("div", { class: "live-body" });
  const btnLive = h("button", { class: "btn ghost small", type: "button" }, t("mission.delay.live.ask"));
  const srcNote = h("p", { class: "hint" }, t("mission.delay.live.source"));
  const live = h("div", { class: "live panel2" }, h("div", { class: "live-head" }, h("b", null, t("mission.delay.live.title")), liveStatus), liveBody,
    h("p", { class: "hint" }, t("mission.delay.live.range", { near: n(PRESETS.near, 2), far: n(PRESETS.far, 2) })), btnLive,
    srcNote);

  const side = h("div", { class: "panel pad orb-side" },
    h("div", { class: "lbl" }, t("mission.delay.owlt")), seg,
    h("div", { class: "field" }, h("label", { for: "md-clock", class: "lbl" }, t("mission.delay.clock"), out.clock), slider),
    h("div", { class: "orb-btns row" }, btnPlay, btnRestart),
    ...legs.map((l) => l.row),
    h("div", { class: "stat" }, h("span", null, t("mission.delay.owlt")), out.owlt),
    h("div", { class: "stat" }, h("span", null, t("mission.delay.rt")), out.rt),
    h("div", { class: "stat" }, h("span", null, t("orbit.real_km")), out.km),
    phase, decide, note, live);

  const total = () => S.owlt * 2;
  function paint() {
    const T = total(), tt = clamp(S.t, 0, T), l1 = clamp(tt / S.owlt, 0, 1), l2 = clamp((tt - S.owlt) / S.owlt, 0, 1);
    clockBig.textContent = clockText(tt);
    out.clock.textContent = `${clockText(tt)} / ${clockText(T)}`;
    out.owlt.textContent = `${n(S.owlt, 2)} ${t("mission.common.min")}`; out.rt.textContent = `${n(T, 1)} ${t("mission.common.min")}`;
    out.km.textContent = `${n(lightToMkm(S.owlt), 1)} ${t("orbit.million_km")}`;
    legs[0].fill.style.width = `${l1 * 100}%`; legs[1].fill.style.width = `${l2 * 100}%`; legs[2].fill.style.width = `${(tt / T) * 100}%`;
    legs[0].val.textContent = clockText(l1 * S.owlt); legs[1].val.textContent = clockText(l2 * S.owlt); legs[2].val.textContent = clockText(tt);
    phase.textContent = tt <= 0 ? t("mission.delay.phase_idle") : tt < S.owlt ? t("mission.delay.phase_out") : tt < T - 1e-6 ? t("mission.delay.phase_back") : t("mission.delay.phase_done", { rt: n(T, 1) });
    decide.textContent = t("mission.delay.decide", { rt: n(T, 1) });
    note.textContent = t("mission.delay.demo_note", { x: n(Math.round(T * 60 / DEMO_SECONDS)) });
    slider.max = String(T); if (Math.abs(+slider.value - tt) > 0.005) slider.value = String(tt);
    lblDist.textContent = `${n(lightToMkm(S.owlt), 0)} ${t("orbit.million_km")}`;
    btnPlay.textContent = S.playing ? t("mission.common.pause") : t("mission.common.play");
    Object.entries(presetBtns).forEach(([k, b]) => b.setAttribute("aria-pressed", String(k === S.key)));
    ctx.redraw();
  }
  function choose(key, owlt) { S.key = key; S.owlt = Math.round(owlt * 100) / 100; S.t = 0; S.playing = false; paint(); }
  slider.addEventListener("input", () => { S.t = +slider.value; S.playing = false; paint(); });
  btnPlay.addEventListener("click", () => {
    if (S.playing) { S.playing = false; paint(); return; }
    if (S.t >= total() - 1e-6) S.t = 0;
    if (reduced()) { S.t = total(); } else S.playing = true;
    paint();
  });
  btnRestart.addEventListener("click", () => { S.t = 0; S.playing = false; paint(); });

  btnLive.addEventListener("click", async () => {
    btnLive.disabled = true; liveBody.textContent = t("mission.common.loading");
    try {
      const r = await getJSON("/api/mars-link");
      liveStatus.className = `st ${r.status === "live" ? "normal" : r.status === "cached" || r.status === "computed" ? "watch" : "alert"}`; liveStatus.textContent = t(`mission.delay.live.status.${r.status}`);
      srcNote.textContent = t(r.status === "computed" ? "mission.delay.live.source_computed" : "mission.delay.live.source");
      if (r.one_way_min != null) {
        S.today = r;
        presetBtns.today.disabled = false; presetBtns.today.textContent = `${t(r.status === "computed" ? "mission.delay.preset_today_computed" : "mission.delay.preset_today")} · ${n(r.one_way_min, 1)} ${t("mission.common.min")}`;
        liveBody.replaceChildren(
          h("div", { class: "stat" }, h("span", null, t("mission.delay.live.as_of", { date: r.as_of })), h("b", null, `${n(r.one_way_min, 2)} ${t("mission.common.min")}`)),
          h("div", { class: "stat" }, h("span", null, t("mission.delay.rt")), h("b", null, `${n(r.round_trip_min, 2)} ${t("mission.common.min")}`)),
          h("div", { class: "stat" }, h("span", null, t("mission.delay.live.distance")), h("b", null, `${n(r.distance_au, 3)} ${t("mission.delay.live.au")} · ${n(r.distance_mkm, 1)} ${t("orbit.million_km")}`)),
          ...(r.status === "computed" ? [h("p", { class: "hint" }, t("mission.delay.live.computed_note"))] : []));
      } else liveBody.replaceChildren(h("p", { class: "hint" }, t("mission.delay.live.unavailable")));
    } catch (e) {
      liveStatus.className = "st alert"; liveStatus.textContent = t("mission.delay.live.status.unavailable");
      liveBody.replaceChildren(h("p", { class: "hint" }, `${t("mission.common.error")} ${e.message}`));
    } finally { btnLive.disabled = false; }
  });
  btnLive.click();                 // fetch today's value once on open: the server answers live, cached or computed, never blank

  // ---------------------------------------------------------------- 3D
  let root, line, flashE, flashS;
  function build3d() {
    const { THREE, st } = ctx;
    root = new THREE.Group(); root.visible = false; st.scene.add(root);
    line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), new THREE.LineDashedMaterial({ color: 0x7fe3f5, transparent: true, opacity: 0.4, dashSize: 0.22, gapSize: 0.16 }));
    const mk = () => new THREE.Mesh(new THREE.RingGeometry(0.98, 1.02, 64), new THREE.MeshBasicMaterial({ color: 0x7fe3f5, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    flashE = mk(); flashS = mk(); flashS.material.color.set(0xffb347);
    root.add(line, flashE, flashS);
  }
  const EP = { x: 0.95, y: 0, z: 0 };
  function frame(T) {
    const { THREE, st } = ctx; const dt = Math.min(0.1, T - S.last); S.last = T;
    if (S.playing) { S.t = Math.min(total(), S.t + dt * (total() / DEMO_SECONDS)); if (S.t >= total()) S.playing = false; paint(); }
    const { earth, mars, ship, pool } = ctx;
    earth.visible = mars.visible = ship.visible = true;
    const goal = dFor(S.owlt); S.D += (goal - S.D) * (st.still ? 1 : 0.08);
    earth.position.set(0, 0, 0); mars.position.set(S.D, 0, 0);
    earth.userData.mat.uniforms.uTime.value = T; mars.userData.mat.uniforms.uTime.value = T;
    earth.userData.body.rotation.y = T * 0.08; mars.userData.body.rotation.y = T * 0.05;
    ship.position.set(S.D - 1.5, 0.42 + Math.sin(T * 0.7) * 0.04, 0.55); ship.scale.setScalar(0.62);
    ship.rotation.set(0.05, Math.PI * 0.08 + Math.sin(T * 0.25) * 0.2, Math.sin(T * 0.5) * 0.05);
    ship.userData.glow.material.opacity = 0.5 + 0.4 * Math.sin(T * 3.2);
    const lp = line.geometry.attributes.position; lp.setXYZ(0, ship.position.x, ship.position.y, ship.position.z); lp.setXYZ(1, EP.x, EP.y, EP.z); lp.needsUpdate = true; line.computeLineDistances();
    // the two packets: status out, answer back
    const tt = clamp(S.t, 0, total()), l1 = tt / S.owlt, l2 = (tt - S.owlt) / S.owlt;
    const out = pool[0], back = pool[1];
    out.visible = tt > 0 && tt < S.owlt; back.visible = tt > S.owlt && tt < total();
    const A = new THREE.Vector3(EP.x, EP.y, EP.z);
    if (out.visible) { out.position.lerpVectors(ship.position, A, l1); out.children[0].material.color.set(0xffd08a); out.userData.ring.material.color.set(0xffb347); }
    if (back.visible) { back.position.lerpVectors(A, ship.position, l2); back.children[0].material.color.set(0xbff4ff); back.userData.ring.material.color.set(0x7fe3f5); }
    [out, back].forEach((p) => { if (p.visible) { p.userData.ring.quaternion.copy(st.camera.quaternion); p.userData.ring.scale.setScalar(1 + ((T * 1.2) % 1) * 2); p.userData.ring.material.opacity = 0.6 * (1 - ((T * 1.2) % 1)); } });
    const secPer = total() / DEMO_SECONDS;      // real minutes per demo second
    const fe = (tt - S.owlt) / secPer, fs = (tt - total()) / secPer;
    flashE.visible = fe >= 0 && fe < 1.2 && tt > 0; flashS.visible = fs >= 0 && fs < 1.2 && tt >= total() - 1e-6;
    if (flashE.visible) { flashE.scale.setScalar(1 + fe * 1.6); flashE.material.opacity = 0.7 * (1 - fe / 1.2); flashE.position.copy(earth.position); flashE.quaternion.copy(st.camera.quaternion); }
    if (flashS.visible) { flashS.scale.setScalar(0.3 + fs * 0.9); flashS.material.opacity = 0.7 * (1 - fs / 1.2); flashS.position.copy(ship.position); flashS.quaternion.copy(st.camera.quaternion); }
    // camera
    const cam = st.camera, asp = Math.max(0.45, cam.aspect || 1), half = Math.tan((cam.fov * Math.PI) / 360);
    Object.assign(ctx.goal, { tx: goal / 2, ty: 0, tz: 0, R: Math.max(7.5, (goal + 5.2) / (2 * half * asp)), yaw: 0, pitch: 0.32 });
    ctx.place(earth.position, lblEarth, 1.25); ctx.place(mars.position, lblMars, 1.55); ctx.place(ship.position, lblShip, 0.5);
    ctx.place({ x: S.D / 2, y: 0.05, z: 0 }, lblDist, 0, "below");
  }

  return {
    id: "delay", side, build3d, frame,
    enter() { root && (root.visible = true); ctx.pool.forEach((p) => { p.visible = false; }); paint(); },
    leave() { root && (root.visible = false); S.playing = false; ctx.pool.forEach((p) => { p.visible = false; }); },
    repaint() { paint(); },
  };
}
