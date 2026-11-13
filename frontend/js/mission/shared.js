// Helpers shared by the Mission 3D scenes. No network, no state: just small pure functions and a procedural station model.
import { n } from "../i18n.js";

export const C_KM_S = 299792.458;
export const FAR_OWLT = 22.29;          // Mars one-way light time at its farthest (NASA DTN slides, NTRS 20160011483)
export const STATUS_NAMES = ["learning", "normal", "watch", "alert"];
export const STATUS_HEX = [0x8a96c8, 0x5ee6a8, 0xffb347, 0xff8272];
export const STATUS_CSS = ["#8a96c8", "#5ee6a8", "#ffb347", "#ff8272"];

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
export const lerp = (a, b, k) => a + (b - a) * k;

/** Real minutes to mm:ss (Bengali digits on the Bangla page). */
export function clockText(min) {
  const s = Math.max(0, Math.round(min * 60));
  return `${n(String(Math.floor(s / 60)).padStart(2, "0"))}:${n(String(s % 60).padStart(2, "0"))}`;
}

/** Minutes to a short human string: "22 min", "5 h", "7 d". `u` holds the three unit words. */
export function spanText(min, u) {
  if (min < 120) return `${n(Math.round(min * 10) / 10)} ${u.min}`;
  if (min < 2880) return `${n(Math.round(min / 6) / 10)} ${u.h}`;
  return `${n(Math.round(min / 144) / 10)} ${u.d}`;
}

/** Illustrative distance from Earth for the journey slider: u in [0,1] -> one-way light minutes (farthest case at u = 1). */
export const journeyLight = (u) => FAR_OWLT * Math.pow(clamp(u, 0, 1), 2.2);
export const lightToMkm = (min) => (min * 60 * C_KM_S) / 1e6;

/** A small procedural space station: central modules, a long truss, four solar wings and radiators. */
export function makeStation(THREE) {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xe6eaf6, metalness: 0.55, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x39436f, metalness: 0.5, roughness: 0.5 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x16337f, metalness: 0.7, roughness: 0.25, emissive: 0x0a1c55, emissiveIntensity: 0.6 });
  const rad = new THREE.MeshStandardMaterial({ color: 0xf4f6fc, metalness: 0.2, roughness: 0.6 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.62, 16), hull, 0, 0, 0, 0, 0, Math.PI / 2);          // main module
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 16), hull, 0.06, 0, 0.17, Math.PI / 2, 0, 0);     // side module
  add(new THREE.SphereGeometry(0.085, 16, 12), hull, 0.34, 0, 0);                                    // node
  add(new THREE.BoxGeometry(0.03, 0.03, 1.5), dark, -0.08, 0.0, 0);                                  // truss
  [-1, 1].forEach((s) => {
    [0.6, 0.28].forEach((z) => {
      add(new THREE.BoxGeometry(0.34, 0.012, 0.12), panel, -0.08 - 0.19, 0.0, s * z);
      add(new THREE.BoxGeometry(0.34, 0.012, 0.12), panel, -0.08 + 0.19, 0.0, s * z);
    });
    add(new THREE.BoxGeometry(0.02, 0.2, 0.1), rad, 0.2, 0.12, s * 0.22);
  });
  const beacon = add(new THREE.SphereGeometry(0.018, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }), 0.38, 0.09, 0);
  g.userData.beacon = beacon;
  return g;
}

/** A soft circular glow sprite (a marker or a halo). */
export function glowSprite(THREE, sp, color = "255,179,71", size = 0.5) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sp.glowTexture([[0, `rgba(${color},1)`], [0.3, `rgba(${color},.4)`], [1, "rgba(0,0,0,0)"]]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

export function polyLine(THREE, pts, color, opacity = 0.5, dashed = false) {
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = dashed ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.2, gapSize: 0.14 }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const l = new THREE.Line(geo, mat); if (dashed) l.computeLineDistances();
  return l;
}
