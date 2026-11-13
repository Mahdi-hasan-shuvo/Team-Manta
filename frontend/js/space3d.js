// Procedural 3D space scenes (Three.js r160, bundled in /vendor, no CDN, no texture downloads).
// Earth, Mars, the stars, the spacecraft and the signal pulses are all generated in code.
import * as THREE from "/vendor/three.module.min.js";

export { THREE };

export const NOISE = /* glsl */ `
vec3 hash3(vec3 p){
  p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gnoise(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  return mix(mix(mix(dot(hash3(i+vec3(0,0,0)),f-vec3(0,0,0)), dot(hash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                 mix(dot(hash3(i+vec3(0,1,0)),f-vec3(0,1,0)), dot(hash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
             mix(mix(dot(hash3(i+vec3(0,0,1)),f-vec3(0,0,1)), dot(hash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                 mix(dot(hash3(i+vec3(0,1,1)),f-vec3(0,1,1)), dot(hash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);
}
float fbm(vec3 p){ float a = .5, s = 0.; for(int i=0;i<5;i++){ s += a*gnoise(p); p *= 2.03; a *= .5; } return s; }
`;

export const PLANET_VERT = /* glsl */ `
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
void main(){
  vObj = normalize(position);
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const EARTH_FRAG = /* glsl */ `
uniform vec3 uSun; uniform float uTime;
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
${NOISE}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float h = fbm(vObj * 2.3 + 3.0);
  float land = smoothstep(0.015, 0.05, h);
  vec3 deep = vec3(0.008, 0.04, 0.16);
  vec3 shallow = vec3(0.03, 0.26, 0.52);
  vec3 ocean = mix(deep, shallow, smoothstep(-0.28, 0.0, h));
  vec3 lowland = mix(vec3(0.07, 0.28, 0.09), vec3(0.42, 0.40, 0.17), smoothstep(0.04, 0.2, h));
  vec3 landc = mix(lowland, vec3(0.5, 0.45, 0.4), smoothstep(0.22, 0.38, h));
  float lat = abs(vObj.y);
  vec3 col = mix(ocean, landc, land);
  col = mix(col, vec3(0.92, 0.95, 1.0), smoothstep(0.84, 0.93, lat + h * 0.08));
  float cl = fbm(vObj * 3.6 + vec3(uTime * 0.018, 0.0, uTime * 0.01));
  cl = smoothstep(0.02, 0.33, cl);
  col = mix(col, vec3(1.0), cl * 0.78);
  float ndl = dot(N, uSun);
  float diff = max(ndl, 0.0);
  float night = 1.0 - smoothstep(-0.06, 0.16, ndl);
  vec3 lit = col * (0.035 + diff * 1.15);
  float city = smoothstep(0.62, 0.8, fbm(vObj * 16.0) + 0.55) * land * night * (1.0 - cl);
  lit += vec3(1.0, 0.72, 0.32) * city * 0.85;
  vec3 Hh = normalize(uSun + V);
  lit += vec3(0.8, 0.9, 1.0) * pow(max(dot(N, Hh), 0.0), 70.0) * (1.0 - land) * (1.0 - cl) * 0.55;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  lit += vec3(0.25, 0.55, 1.0) * rim * (0.12 + diff * 0.5);
  gl_FragColor = vec4(lit, 1.0);
}`;

const MARS_FRAG = /* glsl */ `
uniform vec3 uSun; uniform float uTime;
varying vec3 vObj; varying vec3 vN; varying vec3 vW;
${NOISE}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float h = fbm(vObj * 2.6 + 11.0);
  float h2 = fbm(vObj * 9.0);
  vec3 col = mix(vec3(0.42, 0.16, 0.08), vec3(0.8, 0.43, 0.22), smoothstep(-0.25, 0.3, h));
  col = mix(col, vec3(0.22, 0.09, 0.06), smoothstep(0.08, 0.3, -h) * 0.85);
  col *= 0.82 + 0.34 * h2;
  col *= 1.0 - smoothstep(0.03, 0.0, abs(h2)) * 0.25;
  float lat = abs(vObj.y);
  col = mix(col, vec3(0.95, 0.93, 0.9), smoothstep(0.87, 0.94, lat + h * 0.05));
  float ndl = dot(N, uSun);
  float diff = max(ndl, 0.0);
  vec3 lit = col * (0.03 + diff * 1.1);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  lit += vec3(1.0, 0.5, 0.25) * rim * (0.05 + diff * 0.35);
  gl_FragColor = vec4(lit, 1.0);
}`;

export const ATMO_VERT = /* glsl */ `
varying vec3 vNv;
void main(){ vNv = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export const ATMO_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uPower; uniform float uK;
varying vec3 vNv;
void main(){
  float i = pow(max(uK - dot(vNv, vec3(0.0, 0.0, 1.0)), 0.0), uPower);
  gl_FragColor = vec4(uColor, 1.0) * i;
}`;

const STAR_VERT = /* glsl */ `
attribute float aSize; attribute float aPhase; attribute vec3 aColor;
uniform float uTime; uniform float uScale;
varying vec3 vC; varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale * (260.0 / -mv.z);
  vC = aColor;
  vA = 0.72 + 0.28 * sin(uTime * (0.8 + aPhase) + aPhase * 40.0);
}`;
const STAR_FRAG = /* glsl */ `
varying vec3 vC; varying float vA;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a;
  gl_FragColor = vec4(vC * (0.6 + a), a * vA);
}`;

export function glowTexture(stops) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch (e) { return false; }
}

export function makeStars(count, rMin, rMax, scale = 1) {
  const pos = new Float32Array(count * 3), size = new Float32Array(count), ph = new Float32Array(count), col = new Float32Array(count * 3);
  const tints = [[1, 1, 1], [0.7, 0.85, 1], [1, 0.86, 0.6], [0.8, 0.8, 1]];
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin), s = Math.sqrt(1 - u * u);
    pos[i * 3] = r * s * Math.cos(th); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * s * Math.sin(th);
    size[i] = 0.5 + Math.pow(Math.random(), 4) * 3.2; ph[i] = Math.random();
    const tc = tints[(Math.random() * tints.length) | 0]; col.set(tc, i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1)); g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: scale } } });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false;
  return pts;
}

export function makeNebula() {
  const grp = new THREE.Group();
  const defs = [
    { c: [[0, "rgba(120,90,255,.55)"], [0.5, "rgba(70,60,200,.18)"], [1, "rgba(0,0,0,0)"]], p: [-40, 22, -90], s: 120 },
    { c: [[0, "rgba(40,190,210,.40)"], [0.55, "rgba(30,110,170,.12)"], [1, "rgba(0,0,0,0)"]], p: [48, -18, -100], s: 130 },
    { c: [[0, "rgba(255,150,70,.22)"], [0.6, "rgba(180,70,40,.07)"], [1, "rgba(0,0,0,0)"]], p: [8, 38, -110], s: 90 },
  ];
  defs.forEach((d) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(d.c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    sp.position.set(...d.p); sp.scale.set(d.s, d.s, 1); grp.add(sp);
  });
  return grp;
}

export function makePlanet(kind, radius, sunDir) {
  const frag = kind === "earth" ? EARTH_FRAG : MARS_FRAG;
  const mat = new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: frag, uniforms: { uSun: { value: sunDir.clone().normalize() }, uTime: { value: 0 } } });
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), mat);
  grp.add(body);
  const atmoColor = kind === "earth" ? new THREE.Color(0.28, 0.55, 1.0) : new THREE.Color(1.0, 0.5, 0.28);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(radius * (kind === "earth" ? 1.07 : 1.045), 64, 48),
    new THREE.ShaderMaterial({ vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: atmoColor }, uPower: { value: kind === "earth" ? 3.4 : 4.2 }, uK: { value: kind === "earth" ? 0.74 : 0.7 } } }));
  grp.add(atmo);
  grp.userData = { mat, body, radius };
  return grp;
}

export function makeSun(sunDir, dist = 120) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, "rgba(255,250,230,1)"], [0.08, "rgba(255,225,160,.9)"], [0.25, "rgba(255,170,70,.28)"], [1, "rgba(0,0,0,0)"]]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sp.position.copy(sunDir.clone().normalize().multiplyScalar(dist)); sp.scale.set(46, 46, 1);
  return sp;
}

export function makeShip(lampColor = 0xffb347) {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xdfe5f4, metalness: 0.65, roughness: 0.32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a3358, metalness: 0.5, roughness: 0.5 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x14307a, metalness: 0.7, roughness: 0.25, emissive: 0x0a1c55, emissiveIntensity: 0.55 });
  const lamp = new THREE.MeshBasicMaterial({ color: lampColor });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.52, 28), hull); body.rotation.z = Math.PI / 2; g.add(body);
  [-0.2, 0, 0.2].forEach((x) => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.113, 0.01, 8, 28), dark); r.rotation.y = Math.PI / 2; r.position.x = x; g.add(r); });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.16, 28), hull); nose.rotation.z = -Math.PI / 2; nose.position.x = 0.34; g.add(nose);
  const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.08, 20), dark); eng.rotation.z = Math.PI / 2; eng.position.x = -0.3; g.add(eng);
  [-1, 1].forEach((s) => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 8), dark); arm.position.set(0, 0, s * 0.2); arm.rotation.x = Math.PI / 2; g.add(arm);
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.006, 0.14), panel); p.position.set(0, 0, s * (0.37 + i * 0.145)); g.add(p);
    }
  });
  const dishArm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 8), dark); dishArm.position.set(-0.05, 0.16, 0); g.add(dishArm);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshStandardMaterial({ color: 0xf2f4fb, metalness: 0.5, roughness: 0.35, side: THREE.DoubleSide }));
  dish.position.set(-0.05, 0.23, 0); dish.rotation.z = Math.PI / 2.4; dish.rotation.y = Math.PI; g.add(dish);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), lamp); beacon.position.set(0.1, 0.12, 0); g.add(beacon);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, "rgba(255,190,90,1)"], [0.3, "rgba(255,160,60,.35)"], [1, "rgba(0,0,0,0)"]]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.copy(beacon.position); glow.scale.set(0.34, 0.34, 1); g.add(glow);
  g.userData = { beacon, glow };
  return g;
}

/** A travelling status packet: a bright core, a soft glow and expanding rings. */
export function makePulse() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffd08a }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, "rgba(255,205,130,1)"], [0.25, "rgba(255,160,60,.45)"], [1, "rgba(0,0,0,0)"]]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(0.7, 0.7, 1);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.1, 40), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(core, glow, ring); g.userData = { ring, glow };
  return g;
}

export function ellipse(a, b, segs = 160, color = 0x6c7df0, opacity = 0.35) {
  const pts = []; for (let i = 0; i <= segs; i++) { const t = (i / segs) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * a, 0, Math.sin(t) * b)); }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

/** Renderer + resize + visibility + frame loop in one place. */
export function createStage(canvas, { fov = 40, near = 0.1, far = 400, maxDpr = 2, alpha = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, alpha ? 0 : 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, near, far);
  const st = { renderer, scene, camera, onFrame: null, visible: true, running: false, raf: 0, t0: performance.now(), dpr: Math.min(window.devicePixelRatio || 1, maxDpr), w: 0, h: 0, still: false, starMats: [] };

  function size() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(2, Math.round(r.width)), h = Math.max(2, Math.round(r.height));
    if (w === st.w && h === st.h) return;
    st.w = w; st.h = h;
    renderer.setPixelRatio(st.dpr); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    st.starMats.forEach((m) => { m.uniforms.uScale.value = (h / 700) * st.dpr; });
    if (!st.running) draw();
  }
  function draw(now = performance.now()) {
    const t = (now - st.t0) / 1000;
    st.starMats.forEach((m) => { m.uniforms.uTime.value = t; });
    if (st.onFrame) st.onFrame(t);
    renderer.render(scene, camera);
  }
  function loop(now) { if (!st.running) return; draw(now); st.raf = requestAnimationFrame(loop); }
  function play() { if (st.running || st.still || !st.visible || document.hidden) return; st.running = true; st.raf = requestAnimationFrame(loop); }
  function pause() { st.running = false; cancelAnimationFrame(st.raf); }

  const ro = new ResizeObserver(size); ro.observe(canvas);
  const io = new IntersectionObserver((es) => { st.visible = es[0].isIntersecting; if (st.visible) { size(); play(); } else pause(); }, { rootMargin: "80px" });
  io.observe(canvas);
  const vis = () => (document.hidden ? pause() : play());
  document.addEventListener("visibilitychange", vis);

  st.size = size; st.draw = draw; st.play = play; st.pause = pause;
  st.addStars = (pts) => { st.starMats.push(pts.material); scene.add(pts); };
  st.dispose = () => {
    pause(); ro.disconnect(); io.disconnect(); document.removeEventListener("visibilitychange", vis);
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); } });
    renderer.dispose();
  };
  size();
  return st;
}
