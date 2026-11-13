// Small motion layer: 3D card tilt, scroll reveal and the scroll progress line.
import { reduced } from "./dom.js";

let wired = false, io = null;

export function initFx() {
  if (wired) return; wired = true;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  let hot = null;
  const rest = (el) => { if (!el) return; el.classList.remove("hot"); el.style.transform = ""; };
  document.addEventListener("pointermove", (e) => {
    if (!fine.matches || reduced()) return;
    const el = e.target.closest ? e.target.closest(".tilt") : null;
    if (hot && hot !== el) { rest(hot); hot = null; }
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    el.classList.add("hot"); hot = el;
    el.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`); el.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
    el.style.transform = `perspective(900px) rotateX(${((0.5 - py) * 7).toFixed(2)}deg) rotateY(${((px - 0.5) * 9).toFixed(2)}deg) translateZ(0)`;
  }, { passive: true });
  document.addEventListener("pointerleave", () => { rest(hot); hot = null; }, true);

  const bar = document.getElementById("progress");
  let tick = false;
  const upd = () => {
    tick = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.setProperty("--p", max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : "0");
  };
  window.addEventListener("scroll", () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
  upd();
}

/** Called after every (re)render: make each block of each section fade and tilt in as it enters the view. */
export function reveal() {
  if (io) io.disconnect();
  if (reduced() || !("IntersectionObserver" in window)) return;
  io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
  document.querySelectorAll(".sec > .wrap > *").forEach((b) => {
    const r = b.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.92 && r.bottom > 0) return;   // already on screen: leave it alone
    b.classList.add("rv"); io.observe(b);
  });
}
