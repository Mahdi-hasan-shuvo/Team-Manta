// The whole page is one journey: scroll from the Milky Way, through the Sun's neighbourhood, into the Solar System,
// then down to Earth and Mars. One fixed WebGL canvas sits behind the page. Procedural, bundled, no downloads.
import { THREE, webglOK, makeStars } from "./space3d.js";
import { createGalaxy, SUN_ORBIT_R } from "./galaxy.js";
import { createSolar } from "./solar.js";
import { reduced } from "./dom.js";

const ZONES = [[0, "galaxy"], [0.12, "arm"], [0.31, "system"], [0.6, "inner"], [0.79, "earth"], [0.93, "mars"]];
const DAY_PER_SEC = 4; // simulated days per real second (background only)

let U = null;

function cr(p0, p1, p2, p3, t, out) { // Catmull-Rom on Vector3
  const t2 = t * t, t3 = t2 * t;
  out.x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  out.z = 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
  return out;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function initUniverse(canvas, { onZone } = {}) {
  if (U || !canvas) return null;
  const html = document.documentElement;
  if (!webglOK()) { html.classList.add("no-3d"); return null; }
  const mobile = window.matchMedia("(max-width: 760px)").matches || window.matchMedia("(pointer: coarse)").matches;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: false, powerPreference: "high-performance" }); } catch (e) { html.classList.add("no-3d"); return null; }
  renderer.setClearColor(0x02030a, 1); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 1600);
  const still = reduced();

  const stars = makeStars(mobile ? 1200 : 3200, 400, 900, 1.2); scene.add(stars);
  const galaxy = createGalaxy({ mobile }); galaxy.group.position.set(-SUN_ORBIT_R, 0, 0); galaxy.group.rotation.z = 0.0; scene.add(galaxy.group);
  const solar = createSolar({ mobile }); scene.add(solar.root);

  const C = new THREE.Vector3(-SUN_ORBIT_R, 0, 0);
  const E = new THREE.Vector3(), M = new THREE.Vector3();
  const KP = Array.from({ length: 7 }, () => new THREE.Vector3()), KT = Array.from({ length: 7 }, () => new THREE.Vector3());
  const P = new THREE.Vector3(), T = new THREE.Vector3(), tmp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  const st = { w: 0, h: 0, dpr: Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2), target: 0, p: 0, running: false, raf: 0, last: 0, mx: 0, my: 0, tmx: 0, tmy: 0, zone: "", t: 0, vel: 0, enabled: true, paused: false, slow: 0, frames: 0, acc: 0 };

  function size() {
    const w = Math.max(2, canvas.clientWidth), h = Math.max(2, canvas.clientHeight);
    if (w === st.w && h === st.h) return;
    st.w = w; st.h = h; renderer.setPixelRatio(st.dpr); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const sc = (h / 700) * st.dpr; stars.material.uniforms.uScale.value = sc; galaxy.setScale(sc);
    if (!st.running) frame(performance.now(), true);
  }

  function keyframes() {
    const asp = camera.aspect, ka = Math.min(1.9, Math.max(1, 1.2 / asp)), wide = asp > 1.2;
    KP[0].set(C.x + 8 * ka, 66 * ka, 104 * ka); KT[0].set(C.x - (wide ? 30 : 0), -16, 0);
    KP[1].set(7, 3.2, 11); KT[1].set(C.x, 0, -5);
    KP[2].set(0, 20 * ka, 60 * ka); KT[2].set(0, 0, 0);
    KP[3].set(0, 38 * ka, 52 * ka); KT[3].set(0, 0, 0);
    KP[4].set(-12 * ka, 8.5 * ka, 19 * ka); KT[4].set(0, 0, 0);
    solar.worldPos("earth", E); solar.worldPos("mars", M);
    KP[5].set(E.x + 2.8 * ka, E.y + 1.1, E.z + 4.4 * ka); KT[5].set(E.x - (wide ? 1.7 : 0), E.y - 0.1, E.z);
    KP[6].set(M.x + 2.0 * ka, M.y + 0.8, M.z + 3.1 * ka); KT[6].set(M.x - (wide ? 1.2 : 0), M.y, M.z);
  }

  function frame(now, force = false) {
    const dt = Math.min(0.1, Math.max(0, (now - st.last) / 1000)); st.last = now;
    if (!still) st.t += dt; else st.t = 22;
    const t = st.t;
    // eased scroll position: the camera glides, it does not snap
    const k = still ? 1 : 1 - Math.exp(-dt * 4.2);
    const prev = st.p; st.p += (st.target - st.p) * k; if (Math.abs(st.target - st.p) < 1e-5) st.p = st.target;
    st.vel += ((Math.abs(st.p - prev) / Math.max(dt, 0.001)) - st.vel) * 0.12;
    const p = st.p;
    // crossfade: the galaxy dissolves while the Solar System grows into view
    const gal = 1 - smooth(0.1, 0.3, p), sys = smooth(0.06, 0.3, p);
    galaxy.setOpacity(gal); galaxy.setTime(t);
    solar.root.visible = sys > 0.002; solar.root.scale.setScalar(0.012 + 0.988 * sys);
    solar.setOrbitsVisible(sys > 0.6);
    solar.update(t, DAY_PER_SEC, dt);
    solar.root.updateMatrixWorld(true);
    keyframes();
    const n = KP.length - 1, f = Math.min(n - 1e-6, Math.max(0, p * n)), i = Math.floor(f), u = f - i;
    const ix = (a) => Math.max(0, Math.min(n, a));
    cr(KP[ix(i - 1)], KP[i], KP[ix(i + 1)], KP[ix(i + 2)], u, P);
    cr(KT[ix(i - 1)], KT[i], KT[ix(i + 1)], KT[ix(i + 2)], u, T);
    st.mx += (st.tmx - st.mx) * 0.04; st.my += (st.tmy - st.my) * 0.04;
    const sway = still ? 0 : Math.sin(t * 0.11) * 0.012;
    P.x += st.mx * (p < 0.3 ? 3.2 : 0.5) + sway * 40; P.y += -st.my * (p < 0.3 ? 2.2 : 0.35);
    camera.position.copy(P); camera.lookAt(T);
    camera.fov = 50 + Math.min(9, st.vel * 90); camera.updateProjectionMatrix();
    stars.material.uniforms.uTime.value = t;
    const z = ZONES.reduce((a, [at, id]) => (p >= at ? id : a), "galaxy");
    if (z !== st.zone) { st.zone = z; onZone && onZone(z, p); }
    renderer.render(scene, camera);
    // adaptive quality: if frames are slow, lower the pixel ratio once or twice
    if (!force && !still) {
      st.acc += dt; st.frames++;
      if (st.frames >= 90) { const avg = st.acc / st.frames; st.acc = 0; st.frames = 0; if (avg > 0.034 && st.dpr > 1) { st.dpr = Math.max(1, st.dpr - 0.5); st.w = 0; size(); } }
    }
  }
  function loop(now) { if (!st.running) return; frame(now); st.raf = requestAnimationFrame(loop); }
  function play() { if (st.running || st.paused || !st.enabled || document.hidden) return; st.running = true; st.last = performance.now(); if (still) { frame(performance.now(), true); st.running = false; return; } st.raf = requestAnimationFrame(loop); }
  function pause() { st.running = false; cancelAnimationFrame(st.raf); }

  let docH = 1;
  function measure() { docH = Math.max(1, document.documentElement.scrollHeight - window.innerHeight); readScroll(); }
  function readScroll() { st.target = Math.min(1, Math.max(0, window.scrollY / docH)); if (still || !st.running) { st.p = st.target; if (!st.running) requestAnimationFrame((n) => frame(n, true)); } }
  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("resize", () => { measure(); size(); }, { passive: true });
  new ResizeObserver(() => { size(); }).observe(canvas);
  new ResizeObserver(() => measure()).observe(document.body);
  window.addEventListener("pointermove", (e) => { st.tmx = (e.clientX / window.innerWidth - 0.5) * 2; st.tmy = (e.clientY / window.innerHeight - 0.5) * 2; }, { passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : play()));
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); pause(); html.classList.add("no-3d"); });

  // light theme and the full-screen explorer do not need the background running
  const sync = () => { st.enabled = html.getAttribute("data-theme") !== "light"; html.classList.toggle("light-plain", !st.enabled); st.enabled ? play() : pause(); };
  new MutationObserver(sync).observe(html, { attributes: true, attributeFilter: ["data-theme"] });
  st.enabled = html.getAttribute("data-theme") !== "light"; html.classList.toggle("light-plain", !st.enabled);

  size(); measure(); st.p = st.target; frame(performance.now(), true);
  html.classList.add("has-3d");
  play();
  setTimeout(measure, 1500); setTimeout(measure, 4000);

  U = {
    scene, camera, renderer, solar, galaxy, state: st, measure, play, pause,
    holdWhenCovered(el) {
      if (U.io) U.io.disconnect();
      if (!el) return;
      U.io = new IntersectionObserver((es) => { st.paused = es[0].intersectionRatio > 0.55; st.paused ? pause() : play(); }, { threshold: [0, 0.55, 1] });
      U.io.observe(el);
    },
  };
  return U;
}
