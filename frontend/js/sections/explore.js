// Solar System explorer: fly to any planet, read its facts, and look around in 3D, on a phone VR viewer or a WebXR headset.
import { h, reduced } from "../dom.js";
import { t, n } from "../i18n.js";
import { begin } from "./common.js";

// NASA planetary fact sheet values, rounded. diam km; au mean distance from the Sun; year in days; day in hours (rotation); g relative to Earth; temp mean C.
const FACTS = {
  sun: { diam: 1391400, day: 609.1, g: 28.0, temp: 5500, tempNote: "surface" },
  mercury: { diam: 4879, au: 0.387, mkm: 57.9, year: 87.97, day: 1407.6, g: 0.38, temp: 167 },
  venus: { diam: 12104, au: 0.723, mkm: 108.2, year: 224.7, day: 5832.5, g: 0.9, temp: 464, retro: true },
  earth: { diam: 12742, au: 1.0, mkm: 149.6, year: 365.25, day: 23.93, g: 1.0, temp: 15 },
  moon: { diam: 3474, fromEarthKm: 384400, year: 27.32, day: 655.7, g: 0.165 },
  mars: { diam: 6779, au: 1.524, mkm: 227.9, year: 686.98, day: 24.62, g: 0.38, temp: -65 },
  jupiter: { diam: 139820, au: 5.204, mkm: 778.5, year: 4332.6, day: 9.93, g: 2.53, temp: -110 },
  saturn: { diam: 116460, au: 9.583, mkm: 1432, year: 10759, day: 10.66, g: 1.07, temp: -140 },
  uranus: { diam: 50724, au: 19.19, mkm: 2867, year: 30688, day: 17.24, g: 0.89, temp: -195, retro: true },
  neptune: { diam: 49244, au: 30.07, mkm: 4515, year: 60182, day: 16.11, g: 1.14, temp: -200 },
};
const ORDER = ["system", "sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune"];
const RADIUS = { sun: 2.6, moon: 0.14 };

let X = null; // live explorer, disposed on re-render

function fmtDur(days) { return days >= 730 ? `${n(days / 365.25, 1)} ${t("explore.u.years")}` : `${n(days >= 100 ? Math.round(days) : days, days >= 100 ? 0 : 1)} ${t("explore.u.days")}`; }
function fmtDay(hours) { return hours > 48 ? `${n(hours / 24, 1)} ${t("explore.u.days")}` : `${n(hours, 1)} ${t("explore.u.hours")}`; }
const fmtInt = (x) => n(Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));

export async function render(el) {
  if (X) { X.dispose(); X = null; }
  const { wrap, signal } = begin(el, "explore");

  const canvas = h("canvas", { class: "xp-canvas", tabindex: "0", role: "img", "aria-label": t("explore.aria") });
  const labels = h("div", { class: "xp-labels", "aria-hidden": "false" });
  const hud = h("div", { class: "xp-hud", "aria-live": "polite" });
  const hint = h("p", { class: "xp-hint" }, t("explore.hint_drag"));
  const exitBtn = h("button", { class: "xp-exit", type: "button", hidden: true }, t("explore.exit"));
  const fallback = h("div", { class: "orb-fallback", hidden: true }, h("p", null, t("explore.no_webgl")));
  const view = h("div", { class: "xp-view" }, canvas, labels, hud, hint, exitBtn, fallback);

  // ----- side panel (facts)
  const info = { name: h("h3"), type: h("p", { class: "xp-type" }), blurb: h("p", { class: "xp-blurb" }), facts: h("dl", { class: "xp-facts" }), crew: h("p", { class: "xp-crew" }) };
  const side = h("aside", { class: "panel pad xp-side", "aria-live": "polite" }, info.name, info.type, info.blurb, info.facts, info.crew);

  // ----- selection chips
  const chips = h("div", { class: "xp-chips", role: "group", "aria-label": t("explore.pick") }, ORDER.map((id) =>
    h("button", { type: "button", class: "xp-chip", dataset: { id }, "aria-pressed": "false", onclick: () => pick(id) }, t(`explore.bodies.${id}.name`))));

  // ----- controls
  const speed = h("input", { type: "range", id: "xp-speed", min: 0, max: 3.4, step: 0.01, value: 1.1 });
  const speedOut = h("output");
  const tgl = (key, on, fn) => h("button", { type: "button", class: "xp-tog", "aria-pressed": String(on), onclick: (e) => { const v = e.currentTarget.getAttribute("aria-pressed") !== "true"; e.currentTarget.setAttribute("aria-pressed", String(v)); fn(v); } }, t(key));
  const bZoomIn = h("button", { type: "button", class: "mini", "aria-label": t("explore.zoom_in") }, "+");
  const bZoomOut = h("button", { type: "button", class: "mini", "aria-label": t("explore.zoom_out") }, "−");
  const bReset = h("button", { type: "button", class: "mini" }, t("explore.reset"));
  const bFull = h("button", { type: "button", class: "btn ghost small" }, t("explore.full"));
  const bLook = h("button", { type: "button", class: "btn ghost small" }, t("explore.look"));
  const bCard = h("button", { type: "button", class: "btn ghost small" }, t("explore.cardboard"));
  const bVR = h("button", { type: "button", class: "btn primary small", disabled: true }, t("explore.vr"));
  const vrNote = h("p", { class: "hint xp-vrnote" }, t("explore.vr_checking"));
  const bar = h("div", { class: "xp-bar panel pad" },
    h("div", { class: "xp-row" },
      tgl("explore.orbits", true, (v) => X && X.solar.setOrbitsVisible(v)), tgl("explore.labels", true, (v) => { labels.hidden = !v; }),
      h("span", { class: "xp-zoom" }, bZoomOut, bZoomIn), bReset),
    h("div", { class: "field xp-speed" }, h("label", { class: "lbl", for: "xp-speed" }, t("explore.speed"), speedOut), speed),
    h("div", { class: "xp-modes" }, h("div", { class: "lbl" }, t("explore.modes")), h("div", { class: "xp-modebtns" }, bLook, bCard, bFull, bVR), vrNote));

  wrap.append(h("div", { class: "xp" }, h("div", { class: "xp-main" }, view, chips, bar), side),
    h("p", { class: "hint xp-note" }, t("explore.note")));

  // ----- panel text
  function paint(id) {
    const f = FACTS[id] || {}, k = `explore.bodies.${id}`;
    info.name.textContent = t(`${k}.name`); info.type.textContent = t(`${k}.type`);
    info.blurb.textContent = t(`${k}.blurb`);
    const rows = [];
    if (f.diam) rows.push(["diam", `${fmtInt(f.diam)} ${t("explore.u.km")}`]);
    if (f.mkm) rows.push(["dist", `${n(f.mkm, f.mkm < 100 ? 1 : f.mkm < 1000 ? 1 : 0)} ${t("explore.u.mkm")} (${n(f.au, 2)} ${t("explore.u.au")})`]);
    if (f.fromEarthKm) rows.push(["dist_earth", `${fmtInt(f.fromEarthKm)} ${t("explore.u.km")}`]);
    if (f.year) rows.push([id === "moon" ? "orbit_earth" : "year", fmtDur(f.year)]);
    if (f.day) rows.push(["day", fmtDay(f.day) + (f.retro ? ` ${t("explore.retro")}` : "")]);
    if (f.g) rows.push(["gravity", `${n(f.g, f.g < 1 ? 2 : 1)} ${t("explore.u.g")}`]);
    if (f.temp != null) rows.push([f.tempNote ? "temp_surface" : "temp", `${n(f.temp)} ${t("explore.u.c")}`]);
    info.facts.replaceChildren(...rows.flatMap(([a, b]) => [h("dt", null, t(`explore.f.${a}`)), h("dd", null, b)]));
    info.crew.replaceChildren(h("b", null, t("explore.crew_label")), " ", t(`${k}.crew`));
    chips.querySelectorAll(".xp-chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.id === id)));
  }

  let sel = "system";
  function pick(id) { sel = id; paint(id); if (X) X.select(id); }
  paint(sel);
  const updSpeed = () => { const dps = Math.pow(10, +speed.value); speedOut.textContent = t("explore.speed_out", { d: n(dps >= 10 ? Math.round(dps) : dps.toFixed(1)), y: n(Math.round(365.25 / dps)) }); if (X) X.dps = dps; };
  speed.addEventListener("input", updSpeed); updSpeed();
  signal.addEventListener("abort", () => { /* disposed on the next render */ });

  // ----- 3D (loaded on the side so the page never depends on it)
  let sp, sol, xr;
  try { [sp, sol, xr] = await Promise.all([import("../space3d.js"), import("../solar.js"), import("../xr.js")]); } catch (e) { fallback.hidden = false; chips.hidden = true; bar.hidden = true; return; }
  if (!sp.webglOK()) { fallback.hidden = false; return; }
  const { THREE } = sp;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }); } catch (e) { fallback.hidden = false; return; }
  const mobile = window.matchMedia("(max-width: 760px)").matches || window.matchMedia("(pointer: coarse)").matches;
  renderer.setClearColor(0x02030a, 1); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 2500);
  const solar = sol.createSolar({ mobile }); scene.add(solar.root);
  const stars = sp.makeStars(mobile ? 1400 : 3200, 400, 1200, 1.2); scene.add(stars);
  const neb = sp.makeNebula(); neb.scale.setScalar(7); neb.position.z = -300; scene.add(neb);
  const stereo = xr.createStereo(renderer); const gyro = xr.createGyro();

  // camera state
  const cur = { focus: new THREE.Vector3(), dist: 80 }; const goal = { dist: 80 };
  const V = { yaw: 0.7, pitch: 0.42, zoom: 1, lookYaw: 0, lookPitch: 0 };
  let mode = "orbit"; // orbit | look | cardboard | xr
  let tNow = 0, last = performance.now(), running = false, raf = 0, visible = true, idleAt = 0, dragging = false, ctl = !window.matchMedia("(pointer: coarse)").matches;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), eye = new THREE.Vector3(), base = new THREE.Quaternion(), look = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, "YXZ"), m4 = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
  const still = reduced();

  function focusPos(id, out) {
    if (id === "system") return out.set(0, 0, 0);
    if (id === "moon") return solar.moonHolder.getWorldPosition(out);
    return solar.worldPos(id, out);
  }
  const radiusOf = (id) => (id === "system" ? 0 : RADIUS[id] || solar.radius(id));
  function aspectK() { return Math.min(1.8, Math.max(1, 1.25 / camera.aspect)); }
  function setGoal() { goal.dist = (sel === "system" ? 78 * aspectK() : Math.max(radiusOf(sel) * (sel === "sun" ? 5.2 : 5.4), 1.2) * (sel === "saturn" ? 1.7 : 1)) * V.zoom; }
  setGoal();
  focusPos("system", cur.focus); cur.dist = goal.dist;

  // labels (HTML pills; they are real buttons so keyboard and touch users can pick a body too)
  const lab = {};
  ORDER.filter((i) => i !== "system").forEach((id) => { lab[id] = h("button", { type: "button", class: "xp-lab", tabindex: "-1", onclick: () => pick(id) }, t(`explore.bodies.${id}.name`)); labels.append(lab[id]); });
  const P = new THREE.Vector3();
  function placeLabels() {
    const w = renderer.domElement.clientWidth, hh = renderer.domElement.clientHeight;
    const stereoOn = mode === "cardboard" || mode === "xr";
    labels.classList.toggle("off", stereoOn);
    if (stereoOn) return;
    ORDER.forEach((id) => {
      const e = lab[id]; if (!e) return;
      focusPos(id, P); P.y += radiusOf(id) * 1.15 + 0.15; P.project(camera);
      const on = P.z < 1 && Math.abs(P.x) < 1.05 && Math.abs(P.y) < 1.05;
      e.style.opacity = on ? (id === sel ? "1" : "0.78") : "0"; e.style.pointerEvents = on ? "auto" : "none";
      e.classList.toggle("sel", id === sel);
      e.style.transform = `translate(${((P.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-P.y * 0.5 + 0.5) * hh).toFixed(1)}px) translate(-50%, -100%)`;
    });
  }

  function size() {
    const w = Math.max(2, canvas.clientWidth), hh = Math.max(2, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix();
    stars.material.uniforms.uScale.value = (hh / 700) * renderer.getPixelRatio();
    setGoal(); if (!running) draw(performance.now());
  }

  function updateCamera(dt) {
    const k = still ? 1 : 1 - Math.exp(-dt * 3.2);
    focusPos(sel, tmp);
    if (mode === "orbit") {
      cur.focus.lerp(tmp, k); cur.dist += (goal.dist - cur.dist) * k;
      if (!dragging && !still && performance.now() - idleAt > 2500) V.yaw += dt * 0.05;
      const cp = Math.cos(V.pitch);
      camera.position.set(cur.focus.x + Math.sin(V.yaw) * cp * cur.dist, cur.focus.y + Math.sin(V.pitch) * cur.dist, cur.focus.z + Math.cos(V.yaw) * cp * cur.dist);
      camera.lookAt(cur.focus);
    } else if (mode === "look" || mode === "cardboard") {
      // hover above the sunlit side of the selected body and look around
      const r = radiusOf(sel) || 2.6; cur.focus.copy(tmp);
      if (sel === "sun" || sel === "system") eye.set(tmp.x, tmp.y + 0.6, tmp.z + 9);
      else eye.copy(tmp).addScaledVector(tmp2.copy(tmp).negate().normalize(), Math.max(r * 3.6, 1.1)).y += r * 0.7;
      camera.position.lerp(eye, still ? 1 : k);
      m4.lookAt(camera.position, tmp, up); base.setFromRotationMatrix(m4);
      if (gyro.on && gyro.live) look.copy(gyro.rel); else { eul.set(V.lookPitch, V.lookYaw, 0); look.setFromEuler(eul); }
      camera.quaternion.copy(base).multiply(look);
    }
  }

  function draw(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    if (!still) tNow += dt; else tNow = 22;
    solar.update(tNow, X ? X.dps : 12, dt); solar.root.updateMatrixWorld(true);
    stars.material.uniforms.uTime.value = tNow;
    if (mode !== "xr") {
      updateCamera(dt); camera.updateMatrixWorld();
      if (mode === "cardboard") stereo.render(scene, camera); else renderer.render(scene, camera);
      placeLabels();
    }
  }
  function loop(now) { if (!running) return; draw(now); raf = requestAnimationFrame(loop); }
  function play() { if (running || !visible || document.hidden || mode === "xr") return; if (still) { draw(performance.now()); return; } running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
  function pause() { running = false; cancelAnimationFrame(raf); }
  const ro = new ResizeObserver(size); ro.observe(canvas);
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? play() : pause(); }, { rootMargin: "120px" }); io.observe(canvas);
  const onVis = () => (document.hidden ? pause() : play()); document.addEventListener("visibilitychange", onVis);

  // ----- pointer / keyboard / wheel
  const ptrs = new Map(); let pinch = 0;
  canvas.style.touchAction = ctl ? "none" : "pan-y";
  canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragging = true; idleAt = performance.now(); view.classList.add("grab"); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
  canvas.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; idleAt = performance.now();
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoom(pinch / d); pinch = d; return; }
    if (mode === "orbit") { V.yaw -= dx * 0.006; V.pitch = Math.max(-1.35, Math.min(1.45, V.pitch + dy * 0.005)); }
    else if (!gyro.on) { V.lookYaw += dx * 0.004; V.lookPitch = Math.max(-1.4, Math.min(1.4, V.lookPitch + dy * 0.004)); }
    if (!running) draw(performance.now());
  });
  const endp = (e) => { ptrs.delete(e.pointerId); pinch = 0; if (!ptrs.size) { dragging = false; view.classList.remove("grab"); } };
  canvas.addEventListener("pointerup", endp); canvas.addEventListener("pointercancel", endp);
  function zoom(f) { V.zoom = Math.max(0.2, Math.min(5, V.zoom * f)); setGoal(); if (!running) draw(performance.now()); }
  canvas.addEventListener("wheel", (e) => { if (!(ctl || e.ctrlKey)) return; e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  canvas.addEventListener("keydown", (e) => {
    const m = { ArrowLeft: () => (V.yaw += 0.12), ArrowRight: () => (V.yaw -= 0.12), ArrowUp: () => (V.pitch = Math.min(1.45, V.pitch + 0.08)), ArrowDown: () => (V.pitch = Math.max(-1.35, V.pitch - 0.08)), "+": () => zoom(0.85), "=": () => zoom(0.85), "-": () => zoom(1.18) }[e.key];
    if (!m) return; e.preventDefault(); m(); idleAt = performance.now(); if (!running) draw(performance.now());
  });
  bZoomIn.addEventListener("click", () => zoom(0.8)); bZoomOut.addEventListener("click", () => zoom(1.25));
  bReset.addEventListener("click", () => { V.yaw = 0.7; V.pitch = 0.42; V.zoom = 1; V.lookYaw = V.lookPitch = 0; gyro.recalibrate(); pick("system"); });
  if (!ctl) { // phones: page scroll stays the default; one switch hands the touch to the scene
    const sw = h("button", { type: "button", class: "xp-touch" }, t("explore.touch_on"));
    sw.addEventListener("click", () => { ctl = !ctl; canvas.style.touchAction = ctl ? "none" : "pan-y"; sw.textContent = ctl ? t("explore.touch_off") : t("explore.touch_on"); sw.setAttribute("aria-pressed", String(ctl)); });
    view.append(sw);
  }

  // ----- immersive modes
  const setHint = (k) => { hint.textContent = t(k); };
  function full(on) {
    view.classList.toggle("xp-full", on); document.body.classList.toggle("xp-lock", on); exitBtn.hidden = !on;
    if (on) { try { view.requestFullscreen && view.requestFullscreen({ navigationUI: "hide" }).catch(() => {}); } catch (e) { /* pseudo-fullscreen still applies */ } }
    else if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* ignore */ } }
    setTimeout(size, 60);
  }
  function setMode(m) {
    const prev = mode; mode = m;
    view.dataset.mode = m;
    if (prev === "cardboard" && m !== "cardboard") { try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) { /* ignore */ } }
    if (m === "orbit") { gyro.stop(); setHint("explore.hint_drag"); if (view.classList.contains("xp-full")) full(false); }
    if (!running) draw(performance.now());
  }
  async function startLook(stereoOn) {
    const ok = await xr.gyroPermission();
    V.lookYaw = V.lookPitch = 0;
    if (ok) { gyro.start(); setTimeout(() => { setHint(gyro.live ? "explore.hint_gyro" : "explore.hint_look"); }, 900); } else setHint("explore.hint_look");
    setMode(stereoOn ? "cardboard" : "look"); full(true);
    if (stereoOn) { setHint("explore.hint_cardboard"); try { screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape").catch(() => {}); } catch (e) { /* not supported */ } }
    setTimeout(() => { if (gyro.live) setHint(stereoOn ? "explore.hint_cardboard" : "explore.hint_gyro"); }, 1000);
  }
  bLook.addEventListener("click", () => startLook(false));
  bCard.addEventListener("click", () => startLook(true));
  bFull.addEventListener("click", () => { setMode("orbit"); full(!view.classList.contains("xp-full")); });
  exitBtn.addEventListener("click", () => { setMode("orbit"); full(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && view.classList.contains("xp-full")) { setMode("orbit"); full(false); } }, { signal });
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && view.classList.contains("xp-full") && mode === "orbit") full(false); });
  canvas.addEventListener("dblclick", () => { if (mode === "cardboard") { setMode("orbit"); full(false); } });

  // WebXR headset
  let xrSession = null, xrLabel = null; const xrIdx = { i: 4 };
  function makeNameSprite(text) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 128; const g = c.getContext("2d");
    g.fillStyle = "rgba(6,10,30,.78)"; g.strokeStyle = "rgba(255,179,71,.9)"; g.lineWidth = 6; const r = 40; g.beginPath(); g.roundRect ? g.roundRect(6, 6, 500, 116, r) : g.rect(6, 6, 500, 116); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.font = "700 58px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 256, 68);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); s.scale.set(4, 1, 1); s.renderOrder = 9; return s;
  }
  function xrSelect(id) {
    sel = id; paint(id);
    if (xrLabel) { solar.root.remove(xrLabel); xrLabel.material.map.dispose(); xrLabel.material.dispose(); }
    xrLabel = makeNameSprite(t(`explore.bodies.${id}.name`)); solar.root.add(xrLabel);
  }
  function localPos(id, out) {
    if (id === "system" || id === "sun") return out.set(0, 0, 0);
    if (id === "moon") return out.copy(solar.bodies.earth.pos).add(solar.moonHolder.position);
    return out.copy(solar.bodies[id].pos);
  }
  function xrFrame(time) {
    const dt = Math.min(0.1, (time - last) / 1000); last = time; tNow += dt;
    solar.update(tNow, X.dps, dt);
    const S = 0.1; solar.root.scale.setScalar(S);
    const local = localPos(sel, tmp);
    const anchor = sel === "system" ? new THREE.Vector3(0, 1.1, -3.2) : new THREE.Vector3(0, 1.35, -1.5);
    solar.root.position.copy(anchor).addScaledVector(local, -S);
    if (xrLabel) { xrLabel.position.copy(local).add(new THREE.Vector3(0, (radiusOf(sel) || 2.6) * 1.5 + 0.8, 0)); xrLabel.scale.set(0.5 / S, 0.125 / S, 1); }
    renderer.render(scene, camera);
  }
  async function startXR() {
    try {
      vrNote.textContent = t("explore.vr_starting"); pause();
      xrSession = await xr.enterXR(renderer, endXR);
      mode = "xr"; view.dataset.mode = "xr"; camera.far = 3000; camera.updateProjectionMatrix(); stars.material.uniforms.uScale.value = 1.4;
      [0, 1].forEach((i) => { const c = renderer.xr.getController(i); scene.add(c); c.addEventListener("selectstart", () => { const idx = (ORDER.indexOf(sel) + 1) % ORDER.length; xrSelect(ORDER[idx]); }); });
      xrSelect(sel); last = performance.now(); renderer.setAnimationLoop(xrFrame); vrNote.textContent = t("explore.vr_hint");
    } catch (e) { vrNote.textContent = t("explore.vr_failed", { msg: String((e && e.message) || e).slice(0, 120) }); mode = "orbit"; renderer.xr.enabled = false; play(); }
  }
  function endXR() {
    renderer.setAnimationLoop(null); solar.root.scale.setScalar(1); solar.root.position.set(0, 0, 0);
    if (xrLabel) { solar.root.remove(xrLabel); xrLabel = null; }
    mode = "orbit"; view.dataset.mode = "orbit"; xrSession = null; camera.far = 2500; camera.updateProjectionMatrix(); size(); vrNote.textContent = t("explore.vr_ready"); play();
  }
  bVR.addEventListener("click", startXR);
  xr.xrSupported().then((ok) => { bVR.disabled = !ok; vrNote.textContent = ok ? t("explore.vr_ready") : t("explore.vr_none"); });

  X = {
    solar, dps: Math.pow(10, +speed.value),
    select(id) { sel = id; V.zoom = 1; setGoal(); if (mode === "orbit") idleAt = performance.now(); hud.textContent = t(`explore.bodies.${id}.name`); if (!running) draw(performance.now()); },
    dispose() {
      pause(); io.disconnect(); ro.disconnect(); document.removeEventListener("visibilitychange", onVis); gyro.stop(); stereo.dispose();
      try { if (xrSession) xrSession.end(); } catch (e) { /* ignore */ }
      document.body.classList.remove("xp-lock"); solar.dispose();
      try { renderer.forceContextLoss(); } catch (e) { /* ignore */ } renderer.dispose();
    },
  };
  hud.textContent = t("explore.bodies.system.name");
  X.dps = Math.pow(10, +speed.value);
  size(); draw(performance.now()); play();
  if (window.__universe) window.__universe.holdWhenCovered(view);
}
