// "Mission 3D": one 3D stage, five views. The shell owns the canvas, the camera and the tabs; each view lives in js/mission/.
import { h, reduced } from "../dom.js";
import { t } from "../i18n.js";
import { begin } from "./common.js";
import * as journey from "../mission/journey.js";
import * as delay from "../mission/delay.js";
import * as crew from "../mission/crew.js";
import * as compare from "../mission/compare.js";
import * as ship from "../mission/ship.js";

const VIEWS = { journey, delay, crew, compare, ship };
const TABS = Object.keys(VIEWS);
let disposeStage = null;
let lastTab = "journey";

const ANCHOR = { top: "-50%, -100%", center: "-50%, -50%", below: "-50%, 25%", left: "0%, -100%", right: "-100%, -50%" };

export async function render(el) {
  if (disposeStage) { disposeStage(); disposeStage = null; }
  const { wrap, signal } = begin(el, "orbit", { simulated: true });

  const canvas = h("canvas", { class: "orb-canvas", tabindex: "0", role: "img", "aria-label": t("orbit.aria") });
  const hint = h("p", { class: "orb-hint" }, t("mission.common.drag"));
  const btnReset = h("button", { class: "btn ghost small orb-reset", type: "button" }, t("orbit.reset"));
  const loading3d = h("p", { class: "orb-loading" }, t("mission.common.loading_3d"));
  const fallback = h("div", { class: "orb-fallback", hidden: true }, h("p", null, t("mission.common.no_webgl")));
  const view = h("div", { class: "orb-view" }, canvas, hint, btnReset, loading3d, fallback);
  const sideBox = h("div", { class: "orb-sidebox" });
  const belowBox = h("div", { class: "orb-belowbox" });
  const tabs = h("div", { class: "seg mtabs", role: "tablist", "aria-label": t("mission.tabs_label") }, TABS.map((id) =>
    h("button", { type: "button", role: "tab", id: `mt-${id}`, "aria-controls": "mt-panel", dataset: { id }, onclick: () => setTab(id) }, t(`mission.tabs.${id}`))));
  const panel = h("div", { class: "orb", id: "mt-panel", role: "tabpanel" }, view, sideBox);
  wrap.append(tabs, panel, belowBox);

  // ---- context handed to every view
  const V = { project: null };
  const ctx = {
    THREE: null, sp: null, st: null, view, canvas, layer: null, earth: null, mars: null, ship: null, pool: [],
    goal: { tx: 0, ty: 0, tz: 0, R: 12, yaw: 0, pitch: 0.4 }, cur: { tx: 0, ty: 0, tz: 0, R: 12, yaw: 0, pitch: 0.4 },
    state: { yaw: 0, pitch: 0 },
    redraw() { const st = ctx.st; if (!st) return; if (st.still) st.draw(); else st.play(); },
    tag(text, cls = "", opt = {}) {
      const el = opt.button ? h("button", { type: "button", class: `tag3d ${cls}`, "aria-label": opt.label || text, onclick: opt.onclick }, text) : h("span", { class: `tag3d ${cls}` }, text);
      (opt.layer || ctx.layer).append(el); return el;
    },
    overlay(el) { ctx.layer.append(el); return el; },
    place(pos, el, dy = 0, anchor = "top") {
      const st = ctx.st; if (!st || !V.project) return;
      V.project.set(pos.x, pos.y + dy, pos.z).project(st.camera);
      const x = (V.project.x * 0.5 + 0.5) * st.w, y = (-V.project.y * 0.5 + 0.5) * st.h;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${ANCHOR[anchor] || ANCHOR.top})`;
      el.style.opacity = V.project.z < 1 ? "1" : "0";
    },
  };

  // ---- build every view's DOM (3D parts are built lazily, once the stage exists)
  const scenes = {};
  TABS.forEach((id) => {
    ctx.layer = h("div", { class: "tags3d", hidden: true }); view.append(ctx.layer);
    scenes[id] = VIEWS[id].create(ctx); scenes[id].layer = ctx.layer; scenes[id].built = false;
  });
  let active = null;

  function setTab(id, focus = false) {
    if (!scenes[id]) return;
    if (active) { scenes[active].leave(); scenes[active].layer.hidden = true; }
    active = lastTab = id;
    ctx.state.yaw = 0; ctx.state.pitch = 0;
    if (ctx.st) {
      [ctx.earth, ctx.mars, ctx.ship].forEach((o) => { o.visible = false; }); ctx.pool.forEach((p) => { p.visible = false; });
      if (!scenes[id].built) { scenes[id].built = true; try { scenes[id].build3d(); } catch (e) { console.warn("3D view failed", id, e); } }
    }
    const sc = scenes[id];
    sc.layer.hidden = false;
    sideBox.replaceChildren(sc.side); belowBox.replaceChildren(...(sc.below ? [sc.below] : []));
    tabs.querySelectorAll("button").forEach((b) => { const on = b.dataset.id === id; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    panel.setAttribute("aria-labelledby", `mt-${id}`);
    sc.enter();
    if (ctx.st) { ctx.redraw(); if (ctx.st.still) { Object.assign(ctx.cur, ctx.goal); ctx.st.draw(); } }
  }
  tabs.addEventListener("keydown", (e) => {
    const i = TABS.indexOf(active); const k = { ArrowLeft: -1, ArrowRight: 1, Home: -i, End: TABS.length - 1 - i }[e.key];
    if (k == null) return; e.preventDefault(); setTab(TABS[(i + k + TABS.length) % TABS.length], true);
  });
  setTab(lastTab);

  // ---- 3D
  let sp;
  try { sp = await import("../space3d.js"); } catch (e) { sp = null; }
  loading3d.hidden = true;
  if (!sp || !sp.webglOK()) { fallback.hidden = false; view.classList.add("no-webgl"); return; }
  const { THREE } = sp;
  let st;
  try { st = sp.createStage(canvas, { fov: 36 }); } catch (e) { fallback.hidden = false; view.classList.add("no-webgl"); return; }
  Object.assign(ctx, { THREE, sp, st }); V.project = new THREE.Vector3();

  const sun = new THREE.Vector3(-0.7, 0.28, 0.65).normalize();
  st.addStars(sp.makeStars(1600, 70, 150));
  st.scene.add(sp.makeNebula());
  st.scene.add(sp.makeSun(new THREE.Vector3(-1.2, 0.45, -0.7), 140));
  st.scene.add(new THREE.AmbientLight(0x8fa4ff, 0.5));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.3); key.position.copy(sun).multiplyScalar(20); st.scene.add(key);
  ctx.earth = sp.makePlanet("earth", 0.95, sun); ctx.earth.rotation.z = 0.41;
  ctx.mars = sp.makePlanet("mars", 0.52, sun);
  ctx.ship = sp.makeShip(); ctx.ship.scale.setScalar(0.62);
  ctx.pool = [0, 1, 2, 3].map(() => { const p = sp.makePulse(); p.visible = false; return p; });
  st.scene.add(ctx.earth, ctx.mars, ctx.ship, ...ctx.pool);
  [ctx.earth, ctx.mars, ctx.ship].forEach((o) => { o.visible = false; });

  // pointer / keyboard rotation, plus click-to-pick for the views that offer it
  let drag = null, idle = 0, down = null;
  canvas.style.touchAction = "pan-y";
  const clampPitch = (p) => Math.max(-0.5, Math.min(1.2, p));
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; down = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); view.classList.add("grab"); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    ctx.state.yaw += (e.clientX - drag.x) * 0.006; ctx.state.pitch = clampPitch(ctx.state.pitch + (e.clientY - drag.y) * 0.004);
    drag = { x: e.clientX, y: e.clientY }; idle = performance.now(); if (st.still) st.draw();
  });
  const end = (e) => {
    if (down && e && e.type === "pointerup" && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && scenes[active].pick) {
      const r = canvas.getBoundingClientRect(); scenes[active].pick({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }); ctx.redraw();
    }
    drag = null; down = null; view.classList.remove("grab");
  };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("keydown", (e) => {
    const k = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key];
    if (!k) return; e.preventDefault(); ctx.state.yaw += k[0]; ctx.state.pitch = clampPitch(ctx.state.pitch + k[1]); idle = performance.now(); if (st.still) st.draw();
  });
  btnReset.addEventListener("click", () => { ctx.state.yaw = 0; ctx.state.pitch = 0; idle = 0; ctx.redraw(); });

  st.onFrame = (T) => {
    const sc = scenes[active]; if (!sc) return;
    // camera first (using the goal the view set last frame), then the view moves its objects and places its labels
    const aim = (f) => {
      const g = ctx.goal, c = ctx.cur;
      for (const k of ["tx", "ty", "tz", "R", "yaw", "pitch"]) c[k] += (g[k] - c[k]) * f;
      const auto = st.still || drag || performance.now() - idle < 4000 ? 0 : Math.sin(T * 0.09) * 0.26;
      const yaw = c.yaw + ctx.state.yaw + auto, pit = clampPitch(c.pitch + ctx.state.pitch);
      st.camera.position.set(c.tx + Math.sin(yaw) * Math.cos(pit) * c.R, c.ty + Math.sin(pit) * c.R, c.tz + Math.cos(yaw) * Math.cos(pit) * c.R);
      st.camera.lookAt(c.tx, c.ty, c.tz); st.camera.updateMatrixWorld();
    };
    aim(st.still ? 1 : 0.07); sc.frame(T);
    if (st.still && Math.abs(ctx.goal.R - ctx.cur.R) > 1e-3) { aim(1); sc.frame(T); }   // still mode has no next frame: settle now
  };
  st.still = reduced();
  scenes[active].built = true;
  try { scenes[active].build3d(); } catch (e) { console.warn("3D view failed", active, e); }
  scenes[active].enter();
  st.size(); st.draw(); Object.assign(ctx.cur, ctx.goal); st.draw(); st.play();
  disposeStage = () => { try { st.renderer.forceContextLoss(); } catch (e) { /* ignore */ } st.dispose(); };
  signal.addEventListener("abort", () => { /* the next render disposes the stage */ });
}
