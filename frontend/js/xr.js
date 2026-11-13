// Immersive helpers: WebXR headset sessions, phone gyroscope, and a Cardboard-style split-screen with lens correction.
import { THREE } from "./space3d.js";

export async function xrSupported() {
  try { return !!(navigator.xr && (await navigator.xr.isSessionSupported("immersive-vr"))); } catch (e) { return false; }
}

/** Start a WebXR immersive-vr session on this renderer. Resolves with the session; rejects with the browser's error. */
export async function enterXR(renderer, onEnd) {
  const session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor"] });
  renderer.xr.enabled = true;
  try { renderer.xr.setReferenceSpaceType("local-floor"); } catch (e) { /* falls back to local */ }
  await renderer.xr.setSession(session);
  session.addEventListener("end", () => { renderer.xr.enabled = false; onEnd && onEnd(); }, { once: true });
  return session;
}

/** iOS needs an explicit permission prompt from a user gesture; other browsers just work. */
export async function gyroPermission() {
  const D = window.DeviceOrientationEvent;
  if (!D) return false;
  if (typeof D.requestPermission === "function") { try { return (await D.requestPermission()) === "granted"; } catch (e) { return false; } }
  return true;
}

/** Device orientation -> quaternion (three.js DeviceOrientationControls maths), relative to the pose at start. */
export function createGyro() {
  const zee = new THREE.Vector3(0, 0, 1), euler = new THREE.Euler(), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), q0 = new THREE.Quaternion();
  const raw = new THREE.Quaternion(), zero = new THREE.Quaternion(), inv = new THREE.Quaternion(), rel = new THREE.Quaternion();
  const g = { rel, live: false, calibrated: false, on: false };
  const onOri = (e) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const orient = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * (Math.PI / 180);
    euler.set(e.beta * (Math.PI / 180), e.alpha * (Math.PI / 180), -e.gamma * (Math.PI / 180), "YXZ");
    raw.setFromEuler(euler); raw.multiply(q1); raw.multiply(q0.setFromAxisAngle(zee, -orient));
    if (!g.calibrated) { zero.copy(raw); inv.copy(zero).invert(); g.calibrated = true; }
    rel.copy(inv).multiply(raw); g.live = true;
  };
  g.start = () => { g.on = true; g.calibrated = false; g.live = false; window.addEventListener("deviceorientation", onOri); };
  g.stop = () => { g.on = false; window.removeEventListener("deviceorientation", onOri); };
  g.recalibrate = () => { g.calibrated = false; };
  return g;
}

const DIST_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DIST_FRAG = /* glsl */ `
uniform sampler2D tMap; uniform float uK1; uniform float uK2; varying vec2 vUv;
void main(){
  vec2 c = vUv * 2.0 - 1.0; float r2 = dot(c, c);
  vec2 s = c * (1.0 + uK1 * r2 + uK2 * r2 * r2) * 0.72;   // barrel pre-distortion cancels a lens's pincushion; the 0.72 keeps the picture in frame
  vec2 uv = s * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  gl_FragColor = texture2D(tMap, uv);
}`;

/** Side-by-side stereo with barrel distortion, for a phone in a Cardboard-style viewer. */
export function createStereo(renderer, { ipd = 0.064, k1 = 0.34, k2 = 0.2 } = {}) {
  let rt = null, rw = 0, rh = 0;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: DIST_VERT, fragmentShader: DIST_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tMap: { value: null }, uK1: { value: k1 }, uK2: { value: k2 } } }));
  const qs = new THREE.Scene(); qs.add(quad);
  const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const eye = new THREE.Vector3();
  const size = new THREE.Vector2();
  return {
    ipd,
    render(scene, camera, unit = 1) {
      renderer.getSize(size);
      const W = size.x, H = size.y, half = Math.floor(W / 2);
      if (!rt || rw !== half || rh !== H) {
        if (rt) rt.dispose();
        rt = new THREE.WebGLRenderTarget(Math.max(2, Math.round(half * renderer.getPixelRatio())), Math.max(2, Math.round(H * renderer.getPixelRatio())), { samples: 4, colorSpace: THREE.SRGBColorSpace });
        rw = half; rh = H;
      }
      const a = camera.aspect; camera.aspect = half / H; camera.updateProjectionMatrix();
      renderer.setScissorTest(true);
      [-1, 1].forEach((side) => {
        eye.set(side * ipd * 0.5 * unit, 0, 0); camera.translateX(eye.x);
        renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(null);
        camera.translateX(-eye.x);
        const x = side < 0 ? 0 : half;
        renderer.setViewport(x, 0, half, H); renderer.setScissor(x, 0, half, H);
        quad.material.uniforms.tMap.value = rt.texture; renderer.render(qs, qc);
      });
      renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
      camera.aspect = a; camera.updateProjectionMatrix();
    },
    dispose() { if (rt) rt.dispose(); quad.geometry.dispose(); quad.material.dispose(); },
  };
}
