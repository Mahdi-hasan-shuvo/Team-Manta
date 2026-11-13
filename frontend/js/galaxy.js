// A procedural barred-spiral galaxy (Milky Way style). Pure code: no textures, no downloads.
// Scale: the disc radius is GALAXY_R units; the Sun sits about 26,000 light-years (roughly 0.52 of the way) from the centre.
import { THREE, glowTexture } from "./space3d.js";

export const GALAXY_R = 60;
export const SUN_ORBIT_R = 31; // 26,000 ly of a ~50,000 ly radius, drawn in scene units

const VERT = /* glsl */ `
attribute float aSize; attribute vec3 aColor; attribute float aSeed;
uniform float uTime; uniform float uScale; uniform float uOpacity; uniform float uMaxPt;
varying vec3 vC; varying float vA;
void main(){
  vec3 p = position;
  float r = length(p.xz);
  float w = uTime * 0.045 / (0.35 + r * 0.045);     // differential rotation: the core turns faster than the rim
  float cs = cos(w), sn = sin(w);
  p.xz = vec2(p.x * cs - p.z * sn, p.x * sn + p.z * cs);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = aSize * uScale * (150.0 / max(0.5, -mv.z));
  gl_PointSize = clamp(sz, 0.0, uMaxPt);
  vC = aColor;
  vA = uOpacity * (0.78 + 0.22 * sin(uTime * (0.5 + aSeed) + aSeed * 60.0));
}`;
const FRAG = /* glsl */ `
varying vec3 vC; varying float vA;
void main(){
  vec2 q = gl_PointCoord - 0.5; float d = length(q);
  float a = smoothstep(0.5, 0.0, d); a *= a;
  gl_FragColor = vec4(vC * (0.5 + a), a * vA);
}`;

function gauss() { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

function layer(count, kind) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count), seed = new Float32Array(count);
  const arms = 4, twist = 0.115;
  for (let i = 0; i < count; i++) {
    let x, y, z, c, s;
    if (kind === "bulge" || (kind === "disc" && i < count * 0.16)) {
      // central bulge and bar: flattened ellipsoid, stretched along one axis
      const r = Math.abs(gauss()) * 5.2, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const bx = r * Math.sin(ph) * Math.cos(th) * 1.7, by = r * Math.cos(ph) * 0.55, bz = r * Math.sin(ph) * Math.sin(th) * 0.8;
      const rot = 0.5; x = bx * Math.cos(rot) - bz * Math.sin(rot); z = bx * Math.sin(rot) + bz * Math.cos(rot); y = by;
      c = [1.0, 0.78 + Math.random() * 0.1, 0.46 + Math.random() * 0.15]; s = 0.8 + Math.random() * 1.2;
    } else {
      const u = Math.random();
      const r = 3 + Math.pow(u, 0.72) * (GALAXY_R - 3);
      const arm = (Math.random() * arms) | 0;
      const major = arm % 2 === 0;
      const spread = (0.16 + r * 0.0065) * (major ? 1 : 1.45);
      const th = (arm * Math.PI * 2) / arms + r * twist + gauss() * spread;
      x = Math.cos(th) * r; z = Math.sin(th) * r;
      y = gauss() * (0.55 + 1.4 * Math.exp(-r / 14)) * (kind === "haze" ? 1.8 : 1);
      const k = Math.min(1, r / GALAXY_R);
      c = [1.0 - 0.45 * k, 0.8 - 0.1 * k + 0.1 * k * k, 0.55 + 0.45 * k];                // warm inside, blue-white outside
      if (Math.random() < 0.035) c = [1.0, 0.42, 0.66];                                    // star-forming regions
      if (!major) { c[0] *= 0.82; c[1] *= 0.86; }
      s = 0.55 + Math.pow(Math.random(), 5) * 3.0;
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const dim = kind === "haze" ? 0.13 : 1;
    col[i * 3] = c[0] * dim; col[i * 3 + 1] = c[1] * dim; col[i * 3 + 2] = c[2] * dim;
    size[i] = kind === "haze" ? s * 4.5 : s * 1.1; seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1)); g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uOpacity: { value: 1 }, uMaxPt: { value: kind === "haze" ? 90 : 22 } } });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false;
  return pts;
}

/** @param {{mobile?: boolean}} o */
export function createGalaxy({ mobile = false } = {}) {
  const grp = new THREE.Group();
  const layers = [layer(mobile ? 26000 : 78000, "disc"), layer(mobile ? 3000 : 9000, "haze"), layer(mobile ? 2500 : 7000, "bulge")];
  layers.forEach((l) => grp.add(l));
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, "rgba(255,236,190,.95)"], [0.12, "rgba(255,200,120,.55)"], [0.4, "rgba(255,140,80,.14)"], [1, "rgba(0,0,0,0)"]]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
  core.scale.set(34, 34, 1); grp.add(core);
  // "You are here" marker at the Sun's galactic address
  const marker = new THREE.Group();
  const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, "rgba(255,255,255,1)"], [0.2, "rgba(255,200,110,.8)"], [1, "rgba(255,160,60,0)"]]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  dot.scale.set(2.6, 2.6, 1);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.62, 64), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = Math.PI / 2;
  marker.add(dot, ring); marker.position.set(SUN_ORBIT_R, 0, 0); grp.add(marker);
  const all = () => [...layers.map((l) => l.material), core.material, dot.material, ring.material];
  return {
    group: grp, marker, layers,
    setTime(t) { layers.forEach((l) => { l.material.uniforms.uTime.value = t; }); ring.scale.setScalar(1 + ((t * 0.5) % 1) * 1.6); ring.material.opacity = 0.8 * (1 - ((t * 0.5) % 1)); },
    setScale(s) { layers.forEach((l) => { l.material.uniforms.uScale.value = s; }); },
    setOpacity(o) {
      layers.forEach((l) => { l.material.uniforms.uOpacity.value = o; });
      core.material.opacity = 0.9 * o; dot.material.opacity = o; grp.visible = o > 0.003;
    },
    dispose() { grp.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); all().forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); },
  };
}
