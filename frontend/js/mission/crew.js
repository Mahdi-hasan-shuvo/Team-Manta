// View 3: the six simulated crew members, their coarse status over 600 days, and what only one person may see (tier 0).
import { h } from "../dom.js";
import { t, n } from "../i18n.js";
import { getJSON, once } from "../api.js";
import { clamp, STATUS_NAMES, STATUS_HEX, STATUS_CSS } from "./shared.js";

const SIGNAL_ORDER = ["hr", "hrv", "spo2", "sleep_h", "core_temp", "exercise_min"];
const debounce = (fn, ms) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; };

export function create(ctx) {
  const layer = ctx.layer;
  const S = { day: 251, own: null, tl: null, dayData: null, last: 0 };
  const slider = h("input", { type: "range", id: "mc-day", min: 0, max: 599, step: 1, value: S.day });
  const out = h("output");
  const list = h("div", { class: "crew-list", role: "group", "aria-label": t("mission.crew.pick") });
  const view = h("div", { class: "crew-view", "aria-live": "polite" });
  const side = h("div", { class: "panel pad orb-side" },
    h("div", { class: "field" }, h("label", { for: "mc-day", class: "lbl" }, t("mission.crew.slider"), out), slider),
    list, view, h("p", { class: "hint" }, t("mission.crew.note")));

  // ---- timeline ribbon (under the 3D view)
  const canvas = h("canvas", { class: "ribbon-cv", "aria-hidden": "true" });
  const cursor = h("div", { class: "ribbon-cursor" });
  const names = h("div", { class: "ribbon-names" });
  const legend = h("div", { class: "legend ribbon-legend" }, STATUS_NAMES.map((s, i) => h("span", null, h("i", { style: `background:${STATUS_CSS[i]}` }), t(`mission.crew.status.${s}`))));
  const below = h("div", { class: "panel pad ribbon" }, h("div", { class: "ribbon-body" }, names, h("div", { class: "ribbon-cv-wrap" }, canvas, cursor)), legend);

  const code = (i) => (S.tl ? S.tl.crew[i].status[S.day] : 0);
  const crewList = () => (S.tl ? S.tl.crew : []);

  function drawRibbon() {
    if (!S.tl) return;
    const cw = canvas.clientWidth || 600, rows = S.tl.crew.length, rh = 14, gap = 4, dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round((rows * (rh + gap)) * dpr); canvas.style.height = `${rows * (rh + gap)}px`;
    const c = canvas.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = cw / S.tl.days;
    S.tl.crew.forEach((m, r) => {
      const y = r * (rh + gap);
      m.status.forEach((s, d) => { c.fillStyle = STATUS_CSS[s]; c.globalAlpha = s === 1 ? 0.55 : s === 0 ? 0.35 : 1; c.fillRect(d * cell, y, Math.ceil(cell) + 0.5, rh); });
      c.globalAlpha = 1; c.fillStyle = "#ffffff";
      m.planted.forEach((ev) => { const x = Math.min(...ev.days) * cell; c.beginPath(); c.moveTo(x, y + rh); c.lineTo(x + 4, y + rh + 3); c.lineTo(x - 4, y + rh + 3); c.closePath(); c.fill(); });
    });
    moveCursor();
  }
  const moveCursor = () => { cursor.style.left = `${((S.day + 0.5) / (S.tl ? S.tl.days : 600)) * 100}%`; };
  const dayFromEvent = (e) => { const r = canvas.getBoundingClientRect(); return clamp(Math.round(((e.clientX - r.left) / r.width) * (S.tl.days - 1)), 0, S.tl.days - 1); };
  let dragging = false;
  canvas.parentElement.addEventListener("pointerdown", (e) => { if (!S.tl) return; dragging = true; canvas.parentElement.setPointerCapture(e.pointerId); setDay(dayFromEvent(e)); });
  canvas.parentElement.addEventListener("pointermove", (e) => { if (dragging) setDay(dayFromEvent(e)); });
  canvas.parentElement.addEventListener("pointerup", () => { dragging = false; });
  new ResizeObserver(() => drawRibbon()).observe(canvas.parentElement);

  // ---- crew buttons + the view panel
  function buildList() {
    list.replaceChildren(...crewList().map((m, i) => {
      const chip = h("span", { class: "st" });
      const b = h("button", { type: "button", class: "crew-btn", dataset: { id: m.id }, onclick: () => select(S.own === m.id ? null : m.id) },
        h("img", { src: `/img/crew/${m.id}.webp`, alt: "", width: 40, height: 40, loading: "lazy" }),
        h("span", { class: "who" }, h("b", null, m.callsign), h("small", null, t(`mission.crew.titles.${m.title}`) )), chip);
      b._chip = chip; return b;
    }));
    names.replaceChildren(...crewList().map((m) => h("span", null, m.callsign)));
  }
  function paintList() {
    [...list.children].forEach((b, i) => {
      const s = STATUS_NAMES[code(i)]; b._chip.className = `st ${s}`; b._chip.textContent = t(`mission.crew.status.${s}`);
      b.setAttribute("aria-pressed", String(b.dataset.id === S.own));
    });
  }
  function paintView() {
    const nodes = [];
    if (!S.own) { nodes.push(h("b", null, t("mission.crew.view_status"))); view.replaceChildren(...nodes); return; }
    const m = crewList().find((c) => c.id === S.own);
    nodes.push(h("div", { class: "own-head" }, h("img", { src: `/img/crew/${m.id}.webp`, alt: t("mission.crew.photo_alt", { name: m.callsign }), width: 56, height: 56 }),
      h("div", null, h("b", null, t("mission.crew.view_own", { name: m.callsign })), h("small", null, t(`mission.crew.titles.${m.title}`)))));
    const d = S.dayData && S.dayData.day === S.day ? S.dayData.crew.find((c) => c.id === S.own) : null;
    if (d && d.tier0) {
      const flagged = new Set(d.tier0.alert_signals);
      nodes.push(h("table", { class: "tier0" }, h("thead", null, h("tr", null, h("th", null, t("mission.crew.signals_label")), h("th", null, t("mission.crew.value")), h("th", null, t("mission.crew.worse")))),
        h("tbody", null, SIGNAL_ORDER.map((s) => h("tr", { class: flagged.has(s) ? "flag" : "" }, h("td", null, t(`mission.crew.signals.${s}`)),
          h("td", null, `${n(d.tier0.values[s], s === "core_temp" ? 2 : 1)} ${t(`mission.crew.units.${s}`)}`), h("td", null, n(d.tier0.worse_sd[s], 1)))))));
      if (d.alert_today) nodes.push(h("p", { class: "alert-line" }, `${t("mission.crew.alert_today")}: ${[...flagged].map((s) => t(`mission.crew.signals.${s}`)).join(", ")}`));
    } else nodes.push(h("p", { class: "hint" }, t("mission.common.loading")));
    const ev = m.planted.length
      ? m.planted.map((e) => `${t("mission.common.day", { d: `${n(Math.min(...e.days))}–${n(Math.max(...e.days))}` })}: ${e.signals.map((s) => t(`mission.crew.signals.${s}`)).join(", ")}`)
      : [];
    nodes.push(h("div", { class: "planted" }, h("b", null, ev.length ? t("mission.crew.planted") : t("mission.crew.none_planted")), ev.length ? h("ul", null, ev.map((x) => h("li", null, x))) : null));
    nodes.push(h("button", { class: "btn ghost small", type: "button", onclick: () => select(null) }, t("mission.crew.back")));
    view.replaceChildren(...nodes);
  }
  const loadDay = debounce(async () => {
    if (!S.own) return;
    const want = S.day;
    try { S.dayData = await getJSON(`/api/crew/day?day=${want}&own=${encodeURIComponent(S.own)}`); } catch (e) { S.dayData = null; view.replaceChildren(h("p", null, `${t("mission.common.error")} ${e.message}`)); return; }
    if (want === S.day) paintView();
  }, 140);
  function select(id) { S.own = id; S.dayData = null; paintAll(); if (id) loadDay(); }
  function setDay(d) { S.day = d; paintAll(); loadDay(); }
  function paintAll() { out.textContent = t("mission.common.day", { d: S.day }); slider.value = String(S.day); paintList(); paintView(); moveCursor(); ctx.redraw(); }
  slider.addEventListener("input", () => setDay(+slider.value));

  let loading = false;
  function load() {
    if (S.tl || loading) return; loading = true; view.replaceChildren(h("p", { class: "hint" }, t("mission.common.loading")));
    once("/api/crew/timeline").then((tl) => { S.tl = tl; buildList(); drawRibbon(); paintAll(); build3dPods(); })
      .catch((e) => { loading = false; view.replaceChildren(h("p", null, `${t("mission.common.error")} ${e.message}`)); });
  }

  // ---------------------------------------------------------------- 3D
  let root, pods = [], core, built3d = false;
  const lblCore = ctx.tag("Vigil Core", "ship");
  const podTags = [];
  function build3dPods() {
    if (!root || !S.tl || pods.length) return;
    const { THREE, sp } = ctx;
    const loader = new THREE.TextureLoader();
    S.tl.crew.forEach((m, i) => {
      const g = new THREE.Group(); const a = (i / S.tl.crew.length) * Math.PI * 2 + Math.PI / 6;
      g.position.set(Math.cos(a) * 2.8, 0, Math.sin(a) * 2.8);
      const mat = new THREE.MeshBasicMaterial({ color: 0x8a96c8 });
      loader.load(`/img/crew/${m.id}.webp`, (tx) => { tx.colorSpace = THREE.SRGBColorSpace; mat.map = tx; mat.color.set(0xffffff); mat.needsUpdate = true; ctx.redraw(); });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.52, 48), mat); disc.userData.id = m.id;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.65, 56), new THREE.MeshBasicMaterial({ color: 0x5ee6a8, side: THREE.DoubleSide, transparent: true }));
      const halo = (() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sp.glowTexture([[0, "rgba(255,130,114,.9)"], [0.4, "rgba(255,130,114,.25)"], [1, "rgba(0,0,0,0)"]]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(2.1, 2.1, 1); s.position.z = -0.02; return s; })();
      g.add(halo, disc, ring); root.add(g);
      const spoke = new THREE.Line(new THREE.BufferGeometry().setFromPoints([g.position.clone().multiplyScalar(0.86), g.position.clone().multiplyScalar(0.2)]), new THREE.LineBasicMaterial({ color: 0x5ee6a8, transparent: true, opacity: 0.5 }));
      root.add(spoke);
      podTags.push(ctx.tag(m.callsign, "crewtag", { layer }));
      pods.push({ g, disc, ring, halo, spoke, id: m.id });
    });
  }
  function build3d() {
    const { THREE, sp, st } = ctx;
    root = new THREE.Group(); root.visible = false; st.scene.add(root);
    const habitat = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.025, 8, 120), new THREE.MeshBasicMaterial({ color: 0x6c7df0, transparent: true, opacity: 0.45 })); habitat.rotation.x = Math.PI / 2; root.add(habitat);
    core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: 0x7fe3f5, wireframe: true, transparent: true, opacity: 0.8 })); root.add(core);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: sp.glowTexture([[0, "rgba(127,227,245,.9)"], [0.35, "rgba(127,227,245,.25)"], [1, "rgba(0,0,0,0)"]]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); gl.scale.set(1.8, 1.8, 1); root.add(gl);
    build3dPods();
    built3d = true;
  }
  const RC = { rc: null };
  function pick(ndc) {
    const { THREE, st } = ctx; if (!pods.length) return;
    RC.rc = RC.rc || new THREE.Raycaster(); RC.rc.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), st.camera);
    const hit = RC.rc.intersectObjects(pods.map((p) => p.disc), false)[0];
    if (hit) select(S.own === hit.object.userData.id ? null : hit.object.userData.id);
  }
  function frame(T) {
    const { st } = ctx; const { earth, mars, ship } = ctx;
    earth.visible = mars.visible = ship.visible = false;
    core.rotation.y = T * 0.4; core.rotation.x = T * 0.2;
    pods.forEach((p, i) => {
      const s = code(i), hex = STATUS_HEX[s], sel = S.own === p.id;
      p.g.quaternion.copy(st.camera.quaternion);
      p.ring.material.color.setHex(hex); p.spoke.material.color.setHex(hex);
      p.halo.visible = s >= 2; p.halo.material.opacity = s === 3 ? 0.55 + 0.4 * Math.sin(T * 6) : 0.3;
      const k = sel ? 1.22 : 1; p.g.scale.setScalar(k + (s === 3 ? 0.04 * Math.sin(T * 6) : 0));
      p.spoke.material.opacity = sel ? 1 : 0.5;
      ctx.place(p.g.position, podTags[i], 0.95); podTags[i].classList.toggle("on", sel);
    });
    const cam = st.camera, asp = Math.max(0.45, cam.aspect || 1), half = Math.tan((cam.fov * Math.PI) / 360);
    Object.assign(ctx.goal, { tx: 0, ty: 0, tz: 0, R: Math.max(7, 7.2 / (2 * half * Math.min(asp, 1.6)) + 2.2), yaw: 0.2, pitch: 0.55 });
    ctx.place({ x: 0, y: 0, z: 0 }, lblCore, 0.85);
  }

  return {
    id: "crew", side, below, build3d, frame, pick,
    enter() { root && (root.visible = true); load(); built3d && build3dPods(); paintAll(); requestAnimationFrame(drawRibbon); },
    leave() { root && (root.visible = false); },
    repaint() { if (S.tl) { buildList(); drawRibbon(); } paintAll(); },
  };
}
