// View 1: the journey from the space station, past Earth, to Mars, with the five problems met along the way.
import { h, reduced } from "../dom.js";
import { t, n } from "../i18n.js";
import { clamp, smooth, lerp, journeyLight, lightToMkm, makeStation, glowSprite, polyLine } from "./shared.js";

const DAYS = 259;               // Hohmann (minimum-energy) transfer time, computed: mission.hohmann_days() = 258.9 d; the route itself is still schematic
const D = 15;                   // scene distance Earth -> Mars
const STAGE_U = [0, 0.25, 0.5, 0.8, 1];
const N_PTS = 160;

export function create(ctx) {
  const S = { day: 0, playing: false, stage: 0, last: 0 };
  const slider = h("input", { type: "range", id: "mj-day", min: 0, max: DAYS, step: 1, value: 0, "aria-describedby": "mj-note" });
  const out = { day: h("output"), dist: h("b"), light: h("b") };
  const btnPlay = h("button", { class: "btn primary", type: "button" }, t("mission.common.play"));
  const card = h("div", { class: "stage-card", "aria-live": "polite" });
  const list = h("ol", { class: "stage-list" }, STAGE_U.map((u, i) => h("li", null,
    h("button", { type: "button", class: "stage-btn", dataset: { i }, onclick: () => goStage(i) },
      h("span", { class: "num" }, n(i + 1)), h("span", null, t(`mission.journey.stages.${i}.problem`))))));
  const side = h("div", { class: "panel pad orb-side" },
    h("div", { class: "field" }, h("label", { for: "mj-day", class: "lbl" }, t("mission.journey.slider"), out.day), slider),
    h("div", { class: "orb-btns row" }, btnPlay),
    h("div", { class: "stat" }, h("span", null, t("mission.journey.dist")), out.dist),
    h("div", { class: "stat" }, h("span", null, t("mission.journey.light")), out.light),
    list, card,
    h("p", { class: "hint", id: "mj-note" }, t("mission.journey.route_note")));

  const stageOf = (u) => { let k = 0; STAGE_U.forEach((su, i) => { if (u >= su - 1e-6) k = i; }); return k; };
  const lightText = (u) => {
    if (u <= 0) return `${n(0.0013, 4)} ${t("mission.common.s")}`;
    const m = journeyLight(u);
    return m < 1 ? `${n(m * 60, 0)} ${t("mission.common.s")}` : `${n(m, 1)} ${t("mission.common.min")}`;
  };
  function paintNums() {
    const u = S.day / DAYS, d = Math.round(S.day);
    out.day.textContent = t("mission.common.day", { d });
    out.dist.textContent = u <= 0 ? t("mission.journey.iss_alt") : `${n(lightToMkm(journeyLight(u)), 0)} ${t("mission.journey.million_km")}`;
    out.light.textContent = lightText(u);
    if (+slider.value !== d) slider.value = String(d);
  }
  function paintStage() {
    list.querySelectorAll(".stage-btn").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.i === S.stage)));
    const k = `mission.journey.stages.${S.stage}`;
    card.replaceChildren(h("b", { class: "place" }, t(`${k}.place`)), h("span", { class: "light" }, t(`${k}.light`)),
      h("h3", null, `${n(S.stage + 1)}. ${t(`${k}.problem`)}`), h("p", null, t(`${k}.text`)));
  }
  function paintBtn() { btnPlay.textContent = S.playing ? t("mission.common.pause") : (S.day >= DAYS ? t("mission.common.restart") : t("mission.common.play")); }
  function paint() { S.stage = stageOf(S.day / DAYS); paintNums(); paintStage(); paintBtn(); ctx.redraw(); }
  function goStage(i) { S.day = Math.round(STAGE_U[i] * DAYS); S.playing = false; paint(); }
  slider.addEventListener("input", () => { S.day = +slider.value; S.playing = false; paint(); });
  btnPlay.addEventListener("click", () => {
    if (S.playing) { S.playing = false; paint(); return; }
    if (S.day >= DAYS) S.day = 0;
    S.playing = !reduced(); if (reduced()) S.day = Math.min(DAYS, S.day + 30);
    paint();
  });

  // ---------------------------------------------------------------- 3D
  let root, P, route, done, link, station, markers = [], mTags = [], lblEarth, lblMars, lblIss, lblShip;
  const tagEls = () => {
    lblEarth = ctx.tag(t("mission.journey.labels.earth"), "earth"); lblMars = ctx.tag(t("mission.journey.labels.mars"), "mars");
    lblIss = ctx.tag(t("mission.journey.labels.iss"), ""); lblShip = ctx.tag(t("mission.journey.labels.ship"), "ship");
    STAGE_U.forEach((u, i) => { const b = ctx.tag(n(i + 1), "mk", { button: true, label: t(`mission.journey.stages.${i}.problem`), onclick: () => goStage(i) }); mTags.push(b); });
  };
  tagEls();

  function build3d() {
    const { THREE, sp, st } = ctx;
    root = new THREE.Group(); root.visible = false; st.scene.add(root);
    P = (u) => new THREE.Vector3(lerp(1.7, D - 1.1, u), 0.5 * Math.sin(Math.PI * u), -3.4 * Math.sin(Math.PI * u));
    const pts = []; for (let i = 0; i <= N_PTS; i++) pts.push(P(i / N_PTS));
    route = polyLine(THREE, pts, 0xffb347, 0.22); done = polyLine(THREE, pts, 0xffd08a, 0.95); done.geometry.setDrawRange(0, 2);
    root.add(route, done);
    const ring = sp.ellipse(1.45, 1.45, 100, 0x7fe3f5, 0.3); ring.rotation.x = 0.35; root.add(ring);
    station = makeStation(THREE); station.scale.setScalar(0.62); root.add(station);
    const mars = ctx.mars; mars.userData.orbit = sp.ellipse(1.1, 1.1, 90, 0xffb347, 0.18); root.add(mars.userData.orbit);
    markers = STAGE_U.map((u) => { const g = glowSprite(THREE, sp, "255,179,71", 0.6); g.position.copy(P(u)); root.add(g); return g; });
    link = polyLine(THREE, [new THREE.Vector3(), new THREE.Vector3(1, 0, 0)], 0x7fe3f5, 0.4, true); root.add(link);
  }

  function frame(T) {
    const { THREE, st } = ctx; const dt = Math.min(0.1, T - S.last); S.last = T;
    if (S.playing) {
      S.day = Math.min(DAYS, S.day + dt * 10.5);
      const stg = stageOf(S.day / DAYS);
      if (S.day >= DAYS) { S.playing = false; paintBtn(); }
      if (stg !== S.stage) { S.stage = stg; paintStage(); }
      paintNums();
    }
    const u = S.day / DAYS;
    const { earth, mars, ship } = ctx;
    earth.visible = mars.visible = ship.visible = true;
    earth.position.set(0, 0, 0); mars.position.set(D, 0, 0);
    earth.userData.mat.uniforms.uTime.value = T; mars.userData.mat.uniforms.uTime.value = T;
    earth.userData.body.rotation.y = T * 0.08; mars.userData.body.rotation.y = T * 0.05;
    mars.userData.orbit.position.copy(mars.position); mars.userData.orbit.rotation.y = T * 0.1;
    // the station circles Earth the whole time; the ship leaves it at the start of the route
    const a = T * 0.7, sPos = new THREE.Vector3(Math.cos(a) * 1.45, 0, Math.sin(a) * 1.45).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.35);
    station.position.copy(sPos); station.rotation.y = -a + Math.PI / 2; station.userData.beacon.visible = Math.sin(T * 5) > 0;
    const k = smooth(0, 0.05, u);
    const route0 = P(u), ahead = P(Math.min(1, u + 0.02)), behind = P(Math.max(0, u - 0.02));
    ship.position.lerpVectors(sPos.clone().add(new THREE.Vector3(0.25, 0.12, 0)), route0, k);
    const tan = ahead.clone().sub(behind);
    ship.rotation.set(0, Math.atan2(-tan.z, tan.x), Math.sin(T * 0.6) * 0.04);
    ship.scale.setScalar(0.5);
    ship.userData.glow.material.opacity = 0.5 + 0.4 * Math.sin(T * 3.2);
    done.geometry.setDrawRange(0, Math.max(2, Math.round(u * N_PTS) + 1));
    const lp = link.geometry.attributes.position; lp.setXYZ(0, ship.position.x, ship.position.y, ship.position.z); lp.setXYZ(1, 0.95, 0, 0); lp.needsUpdate = true; link.computeLineDistances();
    markers.forEach((m, i) => { const act = i === S.stage; m.scale.setScalar(act ? 0.85 + 0.15 * Math.sin(T * 4) : 0.5); m.material.opacity = act ? 1 : 0.7; });
    // camera: the whole route in view
    const cam = st.camera, asp = Math.max(0.45, cam.aspect || 1), half = Math.tan((cam.fov * Math.PI) / 360);
    Object.assign(ctx.goal, { tx: D / 2, ty: 0, tz: -1.3, R: Math.max(9, (D + 5.5) / (2 * half * asp)), yaw: 0, pitch: 0.62 });
    ctx.place(earth.position, lblEarth, -1.05, "below"); ctx.place(mars.position, lblMars, 0.95); ctx.place(station.position, lblIss, 0.45); ctx.place(ship.position, lblShip, -0.3, "below");
    markers.forEach((m, i) => { ctx.place(m.position, mTags[i], 0.1, "center"); mTags[i].classList.toggle("on", i === S.stage); });
  }

  return {
    id: "journey", side, build3d, frame,
    enter() { root && (root.visible = true); paint(); },
    leave() { root && (root.visible = false); S.playing = false; },
    repaint() { paint(); },
  };
}
