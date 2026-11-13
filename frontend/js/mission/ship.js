// View 5: a cut-away of the crew ship. Where the sensors, the computer and the software sit, and how the data moves.
import { h } from "../dom.js";
import { t, n } from "../i18n.js";
import { glowSprite, polyLine } from "./shared.js";

const IDS = ["wear", "cabin", "core", "console", "outbox", "earth"];
const MOD3 = {
  wear: { p: [-3.7, 0.5, 0], s: [1.5, 0.7, 0.9] }, cabin: { p: [-3.7, -0.55, 0], s: [1.5, 0.7, 0.9] }, core: { p: [-0.8, 0, 0], s: [1.7, 1.5, 1.0] },
  console: { p: [1.9, 0.6, 0], s: [1.3, 0.7, 0.9] }, outbox: { p: [1.9, -0.6, 0], s: [1.3, 0.7, 0.9] }, earth: { p: [8.4, 1.9, 0], s: [1.6, 1.6, 1.6] },
};
const FLOWS = [
  { from: "wear", to: "core", kind: "raw", pts: [[-2.95, 0.5], [-1.95, 0.5], [-1.65, 0.2]], speed: 0.35 },
  { from: "cabin", to: "core", kind: "raw", pts: [[-2.95, -0.55], [-1.95, -0.55], [-1.65, -0.2]], speed: 0.3 },
  { from: "core", to: "console", kind: "view", pts: [[0.05, 0.25], [1.0, 0.6], [1.25, 0.6]], speed: 0.4 },
  { from: "core", to: "outbox", kind: "status", pts: [[0.05, -0.25], [1.0, -0.6], [1.25, -0.6]], speed: 0.4 },
  { from: "outbox", to: "earth", kind: "status", pts: [[2.55, -0.6], [3.4, -0.6], [3.6, 1.2], [3.6, 2.05], [7.55, 1.9]], speed: 0.11 },
];
const STATUS_HEX = { built: 0x5ee6a8, plan: 0xffb347, concept: 0xa6b0ff };
const STATUS_CSS = { built: "#5ee6a8", plan: "#ffb347", concept: "#a6b0ff" };
const KIND_RGB = { raw: "255,179,71", view: "94,230,168", status: "127,227,245" };

export function create(ctx) {
  const layer = ctx.layer;
  const S = { sel: "core" };
  const mods = IDS.map((id, i) => ({ id, i }));
  const list = h("div", { class: "mod-list", role: "group", "aria-label": t("mission.ship.pick") }, mods.map((m) => h("button", { type: "button", class: "mod-btn", dataset: { id: m.id }, onclick: () => select(m.id) },
    h("i", { class: "dot" }), h("span", null, t(`mission.ship.modules.${m.i}.name`)))));
  const detail = h("div", { class: "mod-detail", "aria-live": "polite" });
  const side = h("div", { class: "panel pad orb-side" }, h("div", { class: "lbl" }, t("mission.ship.pick")), list, detail);

  const L = (k) => t(`mission.ship.labels.${k}`);
  function paint() {
    const m = mods.find((x) => x.id === S.sel), key = `mission.ship.modules.${m.i}`, st = t(`${key}.status`);
    list.querySelectorAll(".mod-btn").forEach((b, i) => { b.setAttribute("aria-pressed", String(b.dataset.id === S.sel)); b.firstChild.style.background = STATUS_CSS[t(`mission.ship.modules.${i}.status`)]; });
    const row = (label, val, code) => h("div", { class: "mrow" }, h("span", { class: "lbl" }, label), code ? h("code", null, val) : h("p", null, val));
    detail.replaceChildren(h("h3", null, t(`${key}.name`)),
      h("span", { class: "mstat", style: `--c:${STATUS_CSS[st]}` }, t(`mission.ship.status.${st}`)),
      row(L("zone"), t(`${key}.zone`)), row(L("what"), t(`${key}.what`)), row(L("hardware"), t(`${key}.hardware`)), row(L("software"), t(`${key}.software`)),
      row(L("file"), t(`${key}.file`), true), row(L("note"), t(`${key}.note`)));
    ctx.redraw();
  }
  function select(id) { S.sel = id; paint(); }

  // ---- full-width explanation under the 3D view
  const zone = (id) => t(`mission.ship.modules.${IDS.indexOf(id)}.zone`);
  const flowItems = FLOWS.map((f, i) => h("li", null, h("b", null, t(`mission.ship.flow.${i}.label`)), h("span", null, `${zone(f.from)} → ${zone(f.to)}`)));
  const below = h("div", { class: "panel pad ship-below" },
    h("div", { class: "ship-cols" },
      h("div", null, h("h4", null, t("mission.ship.flow_title")), h("ul", { class: "flow-list" }, flowItems),
        h("div", { class: "legend" }, ["built", "plan", "concept"].map((k) => h("span", null, h("i", { style: `background:${STATUS_CSS[k]}` }), t(`mission.ship.status.${k}`))))),
      h("div", null, h("h4", null, t("mission.ship.how_title")), h("ol", { class: "how-list" }, [0, 1, 2, 3, 4, 5, 6].map((i) => h("li", null, h("b", null, t(`mission.ship.how.${i}.name`)), " ", t(`mission.ship.how.${i}.text`)))))),
    h("p", { class: "orb-take" }, h("b", null, t("mission.ship.added_title")), " ", t("mission.ship.added")));

  // ---------------------------------------------------------------- 3D
  let root, boxes = {}, packets = [], lines = [], tagEls = {}, flowTag;
  function build3d() {
    const { THREE, sp, st } = ctx;
    root = new THREE.Group(); root.visible = false; st.scene.add(root);
    // hull, ribs, engine
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 9.8, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x6c7df0, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
    hull.rotation.z = Math.PI / 2; hull.position.x = -0.3; root.add(hull);
    for (let x = -5.2; x <= 4.6; x += 1.4) { const r = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.014, 6, 64), new THREE.MeshBasicMaterial({ color: 0x4a5ed0, transparent: true, opacity: 0.55 })); r.rotation.y = Math.PI / 2; r.position.x = x; root.add(r); }
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 0.6, 24), new THREE.MeshStandardMaterial({ color: 0x39436f, metalness: 0.5, roughness: 0.5 })); eng.rotation.z = Math.PI / 2; eng.position.x = -5.5; root.add(eng);
    // modules
    IDS.forEach((id, i) => {
      tagEls[id] = ctx.tag(t(`mission.ship.modules.${i}.zone`), "modtag", { layer });
      if (id === "earth") return;
      const m = MOD3[id], col = STATUS_HEX[t(`mission.ship.modules.${i}.status`)];
      const g = new THREE.Group(); g.position.set(...m.p);
      const mat = new THREE.MeshStandardMaterial({ color: 0x1a2350, metalness: 0.4, roughness: 0.5, emissive: col, emissiveIntensity: 0.2, transparent: true, opacity: 0.92 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(...m.s), mat); box.userData.id = id; g.add(box);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: col })); g.add(edges);
      if (id === "core") [0.32, -0.32].forEach((y) => { const slab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.34, 0.5), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 })); slab.position.set(0, y, 0.2); g.add(slab); });
      root.add(g); boxes[id] = { g, mat, edges, box };
    });
    // dish on a mast outside the hull
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x9aa5d8 })); mast.position.set(3.6, 1.95, 0); root.add(mast);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: 0xf2f4fb, metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide })); dish.position.set(3.6, 2.3, 0); dish.rotation.z = -Math.PI / 2.8; root.add(dish);
    // data flow lines and packets
    FLOWS.forEach((f) => {
      const pts = f.pts.map(([x, y]) => new THREE.Vector3(x, y, 0.1)); const ln = polyLine(THREE, pts, 0x7fe3f5, 0.35, true); root.add(ln); lines.push(ln);
      const seg = []; let total = 0; for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); seg.push(d); total += d; }
      const at = (s) => { let d = s * total; for (let i = 0; i < seg.length; i++) { if (d <= seg[i]) return pts[i].clone().lerp(pts[i + 1], d / seg[i]); d -= seg[i]; } return pts[pts.length - 1].clone(); };
      for (let k = 0; k < 3; k++) { const sprite = glowSprite(THREE, sp, KIND_RGB[f.kind], 0.3); root.add(sprite); packets.push({ sprite, at, speed: f.speed, off: k / 3, f }); }
    });
    flowTag = ctx.tag(t("mission.ship.flow.4.label"), "dist", { layer });
  }

  const RC = { rc: null };
  function pick(ndc) {
    const { THREE, st } = ctx; RC.rc = RC.rc || new THREE.Raycaster(); RC.rc.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), st.camera);
    const targets = Object.values(boxes).map((b) => b.box).concat(ctx.earth.userData.body ? [ctx.earth.userData.body] : []);
    const hit = RC.rc.intersectObjects(targets, false)[0]; if (!hit) return;
    select(hit.object === ctx.earth.userData.body ? "earth" : hit.object.userData.id);
  }

  function frame(T) {
    const { st, THREE } = ctx; const { earth, mars, ship } = ctx;
    earth.visible = true; mars.visible = false; ship.visible = false;
    earth.position.set(...MOD3.earth.p); earth.scale.setScalar(0.8); earth.userData.mat.uniforms.uTime.value = T; earth.userData.body.rotation.y = T * 0.08;
    Object.entries(boxes).forEach(([id, b]) => { const on = id === S.sel; b.mat.emissiveIntensity = on ? 0.85 + 0.15 * Math.sin(T * 4) : 0.2; b.g.scale.setScalar(on ? 1.06 : 1); b.edges.material.opacity = 1; });
    packets.forEach((p) => { const s = (T * p.speed + p.off) % 1; p.sprite.position.copy(p.at(s)); const rel = p.f.from === S.sel || p.f.to === S.sel; p.sprite.material.opacity = rel ? 1 : 0.55; p.sprite.scale.setScalar(rel ? 0.36 : 0.26); });
    const cam = st.camera, asp = Math.max(0.45, cam.aspect || 1), half = Math.tan((cam.fov * Math.PI) / 360);
    Object.assign(ctx.goal, { tx: 1.5, ty: 0.5, tz: 0, R: Math.max(8, 16.2 / (2 * half * asp)), yaw: -0.16, pitch: 0.12 });
    Object.entries(tagEls).forEach(([id, el]) => { const m = MOD3[id]; ctx.place({ x: m.p[0], y: m.p[1] + m.s[1] / 2 + 0.05, z: 0 }, el, 0.12); el.classList.toggle("on", id === S.sel); });
    ctx.place({ x: 5.6, y: 2.0, z: 0 }, flowTag, 0, "below");
  }

  return {
    id: "ship", side, below, build3d, frame, pick,
    enter() { root && (root.visible = true); paint(); },
    leave() { root && (root.visible = false); ctx.earth && ctx.earth.scale.setScalar(1); },
    repaint() { paint(); },
  };
}
