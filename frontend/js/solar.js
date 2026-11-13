// A stylised, procedural Solar System: Sun, eight planets, the Moon, Saturn's rings and the asteroid belt.
// Sizes and distances are compressed so everything stays visible (NOT to scale). Orbital periods are the real ones.
import { THREE, NOISE, PLANET_VERT, ATMO_VERT, ATMO_FRAG, glowTexture, makePlanet } from "./space3d.js";

/** id, display radius, display orbit radius, real orbital period (days), spin (rad/s, decorative), axial tilt (rad), facts key */
export const BODIES = [
  { id: "mercury", r: 0.28, a: 4.2, days: 87.97, spin: 0.25, tilt: 0.0, kind: "rock" },
  { id: "venus", r: 0.48, a: 5.9, days: 224.7, spin: -0.05, tilt: 3.09, kind: "venus" },
  { id: "earth", r: 0.5, a: 7.6, days: 365.25, spin: 0.55, tilt: 0.41, kind: "earth" },
  { id: "mars", r: 0.34, a: 9.6, days: 686.98, spin: 0.52, tilt: 0.44, kind: "mars" },
  { id: "jupiter", r: 2.1, a: 17.5, days: 4332.6, spin: 1.3, tilt: 0.05, kind: "jupiter" },
  { id: "saturn", r: 1.8, a: 24.5, days: 10759, spin: 1.2, tilt: 0.47, kind: "saturn", rings: true },
  { id: "uranus", r: 1.15, a: 34, days: 30688, spin: -0.8, tilt: 1.71, kind: "uranus" },
  { id: "neptune", r: 1.12, a: 43, days: 60182, spin: 0.85, tilt: 0.49, kind: "neptune" },
];
export const SUN_R = 2.6;

const GAS_FRAG = /* glsl */ `
uniform vec3 uSun; uniform float uTime;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uRim;
uniform float uNoise; uniform float uFreq; uniform float uWarp; uniform float uCrater; uniform float uStorm; uniform float uMix;
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
${NOISE}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float n = fbm(vObj * uNoise + 7.0);
  float n2 = fbm(vObj * vec3(1.5, 5.0, 1.5) * uNoise + 2.0);
  float band = 0.5 + 0.5 * sin(vObj.y * uFreq + n2 * uWarp * 4.0 + n * uWarp);
  vec3 col = mix(uA, uB, band);
  col = mix(col, uC, smoothstep(-0.1, 0.5, n) * uMix);
  if (uCrater > 0.0) {
    float c = fbm(vObj * 11.0 + 3.0); float c2 = fbm(vObj * 26.0);
    col *= 1.0 - uCrater * smoothstep(0.17, 0.0, abs(c)) * 0.8;
    col *= 0.82 + 0.36 * c2;
  }
  if (uStorm > 0.0) {
    vec3 sp = normalize(vec3(0.82, -0.3, 0.48));
    float d = length((vObj - sp) * vec3(1.0, 1.9, 1.0));
    col = mix(col, vec3(0.78, 0.33, 0.2), smoothstep(0.22, 0.06, d) * uStorm);
  }
  float ndl = dot(N, uSun); float diff = max(ndl, 0.0);
  vec3 lit = col * (0.11 + diff * 1.12);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  lit += uRim * rim * (0.05 + diff * 0.55);
  gl_FragColor = vec4(lit, 1.0);
}`;

const SUN_FRAG = /* glsl */ `
uniform float uTime; varying vec3 vObj; varying vec3 vN; varying vec3 vW;
${NOISE}
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
  float n = fbm(vObj * 4.0 + vec3(uTime * 0.05, 0.0, uTime * 0.03));
  float g = fbm(vObj * 14.0 - vec3(0.0, uTime * 0.08, 0.0));
  float mu = max(dot(N, V), 0.0);
  vec3 col = mix(vec3(1.0, 0.36, 0.04), vec3(1.0, 0.86, 0.42), smoothstep(-0.3, 0.45, n + g * 0.4));
  col *= 0.5 + 0.7 * pow(mu, 0.6);
  col += vec3(1.0, 0.8, 0.45) * pow(1.0 - mu, 3.0) * 0.25;
  gl_FragColor = vec4(col * 1.35, 1.0);
}`;

const RING_VERT = /* glsl */ `
varying vec3 vP; varying vec3 vW;
void main(){ vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const RING_FRAG = /* glsl */ `
uniform float uIn; uniform float uOut; uniform vec3 uSun; uniform vec3 uCenter; uniform float uR;
varying vec3 vP; varying vec3 vW;
float h1(float x){ return fract(sin(x * 91.345) * 47453.5453); }
void main(){
  float r = length(vP.xy);
  float k = (r - uIn) / (uOut - uIn);
  if (k < 0.0 || k > 1.0) discard;
  float b = 0.0; float f = 18.0;
  for (int i = 0; i < 4; i++) { float c = floor(k * f); b += h1(c + float(i) * 7.0) / (float(i) + 1.0); f *= 2.1; }
  b /= 1.9;
  float gap = smoothstep(0.0, 0.03, abs(k - 0.62)) * (0.25 + 0.75 * smoothstep(0.0, 0.05, abs(k - 0.62)));
  float a = (0.16 + b * 0.8) * gap * smoothstep(0.0, 0.05, k) * smoothstep(1.0, 0.92, k);
  vec3 col = mix(vec3(0.62, 0.55, 0.43), vec3(0.93, 0.87, 0.74), b);
  // the planet's shadow falls across the rings on the night side
  vec3 toSun = normalize(uSun); vec3 rel = vW - uCenter;
  float t = dot(rel, toSun); float perp = length(rel - toSun * t);
  float shadow = (t < 0.0) ? smoothstep(uR * 0.92, uR * 1.08, perp) : 1.0;
  gl_FragColor = vec4(col * (0.35 + 0.85 * shadow), a * (0.45 + 0.55 * shadow));
}`;

const PARAMS = {
  rock: { A: [0.36, 0.34, 0.32], B: [0.58, 0.55, 0.5], C: [0.28, 0.26, 0.25], rim: [0.6, 0.6, 0.65], noise: 2.4, freq: 0.0, warp: 0.0, crater: 1.0, storm: 0, mix: 0.6 },
  venus: { A: [0.78, 0.6, 0.34], B: [0.93, 0.82, 0.58], C: [0.7, 0.5, 0.28], rim: [1.0, 0.8, 0.45], noise: 2.0, freq: 9.0, warp: 1.6, crater: 0, storm: 0, mix: 0.4 },
  jupiter: { A: [0.55, 0.38, 0.24], B: [0.9, 0.82, 0.68], C: [0.7, 0.45, 0.3], rim: [0.9, 0.75, 0.55], noise: 2.2, freq: 26.0, warp: 1.1, crater: 0, storm: 1.0, mix: 0.45 },
  saturn: { A: [0.72, 0.62, 0.42], B: [0.95, 0.88, 0.68], C: [0.82, 0.72, 0.5], rim: [1.0, 0.9, 0.6], noise: 2.0, freq: 20.0, warp: 0.6, crater: 0, storm: 0, mix: 0.3 },
  uranus: { A: [0.52, 0.82, 0.86], B: [0.66, 0.9, 0.92], C: [0.5, 0.78, 0.84], rim: [0.5, 0.9, 1.0], noise: 1.6, freq: 8.0, warp: 0.3, crater: 0, storm: 0, mix: 0.2 },
  neptune: { A: [0.12, 0.25, 0.7], B: [0.3, 0.5, 0.95], C: [0.1, 0.18, 0.55], rim: [0.3, 0.55, 1.0], noise: 2.1, freq: 14.0, warp: 1.0, crater: 0, storm: 0, mix: 0.5 },
  moon: { A: [0.45, 0.45, 0.46], B: [0.7, 0.7, 0.7], C: [0.32, 0.32, 0.33], rim: [0.5, 0.5, 0.55], noise: 2.6, freq: 0.0, warp: 0.0, crater: 1.0, storm: 0, mix: 0.7 },
};

function gasPlanet(kind, radius, seg) {
  const p = PARAMS[kind];
  const mat = new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT, fragmentShader: GAS_FRAG,
    uniforms: {
      uSun: { value: new THREE.Vector3(1, 0, 0) }, uTime: { value: 0 },
      uA: { value: new THREE.Color(...p.A) }, uB: { value: new THREE.Color(...p.B) }, uC: { value: new THREE.Color(...p.C) }, uRim: { value: new THREE.Color(...p.rim) },
      uNoise: { value: p.noise }, uFreq: { value: p.freq }, uWarp: { value: p.warp }, uCrater: { value: p.crater }, uStorm: { value: p.storm }, uMix: { value: p.mix },
    },
  });
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, seg, Math.round(seg * 0.68)), mat); grp.add(body);
  if (kind !== "rock" && kind !== "moon") {
    const c = new THREE.Color(...p.rim);
    grp.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.05, 40, 28), new THREE.ShaderMaterial({ vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: c }, uPower: { value: 4.0 }, uK: { value: 0.68 } } })));
  }
  grp.userData = { mat, body, radius };
  return grp;
}

function ringMesh(radius) {
  const inner = radius * 1.28, outer = radius * 2.35;
  const mat = new THREE.ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uIn: { value: inner }, uOut: { value: outer }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uCenter: { value: new THREE.Vector3() }, uR: { value: radius } } });
  const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128, 1), mat);
  m.rotation.x = -Math.PI / 2; // lie in the equatorial plane of the (tilted) parent group
  return m;
}

function orbitLine(a, segs = 192, color = 0x7488ff, op = 0.22) {
  const pts = []; for (let i = 0; i <= segs; i++) { const t = (i / segs) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * a, 0, Math.sin(t) * a)); }
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }));
}

function dotTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const x = c.getContext("2d"), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.55, "rgba(255,255,255,.9)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function belt(count) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const th = Math.random() * Math.PI * 2, r = 11.6 + Math.random() * 3.2 + (Math.random() - 0.5) * 1.2;
    pos[i * 3] = Math.cos(th) * r; pos[i * 3 + 1] = (Math.random() - 0.5) * 0.55; pos[i * 3 + 2] = Math.sin(th) * r;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xb9aea0, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, alphaTest: 0.02, map: dotTexture() }));
  pts.frustumCulled = false;
  return pts;
}

/** @param {{mobile?: boolean, orbits?: boolean}} o */
export function createSolar({ mobile = false } = {}) {
  const seg = mobile ? 40 : 72;
  const root = new THREE.Group();
  const sunDir0 = new THREE.Vector3(1, 0, 0);
  // Sun
  const sunMat = new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: SUN_FRAG, uniforms: { uTime: { value: 0 } } });
  const sun = new THREE.Group();
  const sunBody = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 48), sunMat); sun.add(sunBody);
  const glowA = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, "rgba(255,230,160,.95)"], [0.2, "rgba(255,180,80,.45)"], [0.5, "rgba(255,120,40,.12)"], [1, "rgba(0,0,0,0)"]]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glowA.scale.set(SUN_R * 6.5, SUN_R * 6.5, 1); sun.add(glowA);
  const glowB = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, "rgba(255,200,120,.35)"], [0.4, "rgba(255,140,60,.09)"], [1, "rgba(0,0,0,0)"]]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glowB.scale.set(SUN_R * 14, SUN_R * 14, 1); sun.add(glowB);
  root.add(sun);

  const bodies = {};
  const orbits = new THREE.Group(); root.add(orbits);
  BODIES.forEach((b, i) => {
    const holder = new THREE.Group();   // moves along the orbit
    const tilt = new THREE.Group();     // axial tilt
    let planet;
    if (b.kind === "earth" || b.kind === "mars") planet = makePlanet(b.kind, b.r, sunDir0);
    else planet = gasPlanet(b.kind, b.r, seg);
    tilt.rotation.z = b.tilt; tilt.add(planet);
    if (b.rings) { const rg = ringMesh(b.r); tilt.add(rg); bodies._rings = rg; }
    holder.add(tilt); root.add(holder);
    orbits.add(orbitLine(b.a, 192, 0x7488ff, 0.2 - i * 0.012));
    bodies[b.id] = { ...b, holder, tilt, planet, phase0: ((i * 2.399) % (Math.PI * 2)), pos: new THREE.Vector3() };
  });
  // the Moon
  const moon = gasPlanet("moon", 0.14, 32); const moonHolder = new THREE.Group(); moonHolder.add(moon); bodies.earth.holder.add(moonHolder);
  const moonOrbit = orbitLine(1.05, 64, 0x9aa4c8, 0.3); bodies.earth.holder.add(moonOrbit);
  const asteroids = belt(mobile ? 1400 : 3600); root.add(asteroids);

  const sunWorld = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const api = {
    root, bodies, sun, sunMat, moon, moonHolder, asteroids, orbits,
    /** @param {number} t seconds  @param {number} dayPerSec simulated days per real second */
    update(t, dayPerSec, dt = 0) {
      const days = t * dayPerSec;
      sunMat.uniforms.uTime.value = t;
      sunBody.rotation.y = t * 0.03;
      BODIES.forEach((b) => {
        const o = bodies[b.id];
        const ang = o.phase0 + (days / b.days) * Math.PI * 2;
        o.holder.position.set(Math.cos(ang) * b.a, 0, Math.sin(ang) * b.a);
        o.pos.copy(o.holder.position);
        const u = o.planet.userData.mat.uniforms; if (u.uTime) u.uTime.value = t;
        o.planet.userData.body.rotation.y += b.spin * dt;
        // sun direction in the planet's frame (the root is never rotated)
        tmp.copy(o.holder.position).negate().normalize();
        if (u.uSun) u.uSun.value.copy(tmp);
      });
      const sr = bodies._rings;
      if (sr) {
        root.updateWorldMatrix(true, false);
        const sat = bodies.saturn, u = sr.material.uniforms;
        u.uSun.value.copy(sat.holder.position).negate().normalize();
        u.uCenter.value.copy(sat.holder.position).applyMatrix4(root.matrixWorld);
        u.uR.value = sat.r * root.scale.x;
      }
      const ea = bodies.earth; const ma = (days / 27.32) * Math.PI * 2;
      moonHolder.position.set(Math.cos(ma) * 1.05, Math.sin(ma * 0.2) * 0.05, Math.sin(ma) * 1.05);
      const mu = moon.userData.mat.uniforms; tmp.copy(ea.holder.position).add(moonHolder.position).negate().normalize(); mu.uSun.value.copy(tmp);
      moon.userData.body.rotation.y = -ma;
      return sunWorld;
    },
    setOrbitsVisible(v) { orbits.visible = v; moonOrbit.visible = v; },
    worldPos(id, out = new THREE.Vector3()) { if (id === "sun") return out.set(0, 0, 0).applyMatrix4(root.matrixWorld); return out.copy(bodies[id].pos).applyMatrix4(root.matrixWorld); },
    radius(id) { return id === "sun" ? SUN_R : bodies[id].r; },
    dispose() { root.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) (Array.isArray(x.material) ? x.material : [x.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); }); },
  };
  return api;
}
