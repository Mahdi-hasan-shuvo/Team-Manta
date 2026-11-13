import { S, t, loadContent } from "./i18n.js";
import { renderHero, repaint as repaintHero } from "./hero.js";
import { reduced } from "./dom.js";
import { initFx, reveal } from "./fx.js";
import * as challenge from "./sections/challenge.js";
import * as problems from "./sections/problems.js";
import * as detector from "./sections/detector.js";
import * as playground from "./sections/playground.js";
import * as architecture from "./sections/architecture.js";
import * as privacy from "./sections/privacy.js";
import * as link from "./sections/link.js";
import * as orbit from "./sections/orbit.js";
import * as updates from "./sections/updates.js";
import * as explore from "./sections/explore.js";
import * as hub from "./sections/hub.js";
import * as video from "./sections/video.js";
import * as nasa from "./sections/nasa.js";
import * as consoleSec from "./sections/console.js";
import * as hardware from "./sections/hardware.js";
import * as tech from "./sections/tech.js";
import * as limits from "./sections/limits.js";
import * as team from "./sections/team.js";

const SECTIONS = [
  ["challenge", challenge], ["problems", problems], ["explore", explore], ["orbit", orbit], ["updates", updates], ["detector", detector], ["playground", playground], ["architecture", architecture],
  ["privacy", privacy], ["link", link], ["hub", hub], ["video", video], ["nasa", nasa], ["console", consoleSec], ["hardware", hardware], ["build", tech], ["limits", limits], ["team", team],
];
const NAV = ["problems", "explore", "orbit", "updates", "detector", "architecture", "privacy", "link", "hub", "video", "nasa", "console", "hardware", "build", "limits", "team"];
const $ = (id) => document.getElementById(id);

function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

function renderChrome() {
  document.title = t("meta.title");
  document.querySelector('meta[name="description"]').setAttribute("content", t("meta.description"));
  $("skip").textContent = t("ui.skip");
  const links = $("links"); links.textContent = "";
  NAV.forEach((id) => {
    const a = document.createElement("a"); a.href = `#${id === "detector" ? "detector" : id}`; a.textContent = t(`ui.nav.${id}`); a.dataset.id = id;
    a.addEventListener("click", () => closeMenu()); links.append(a);
  });
  $("lang-btn").textContent = t("ui.lang_switch"); $("lang-btn").setAttribute("aria-label", t("ui.lang_switch_label"));
  $("lang-btn").setAttribute("lang", S.lang === "bn" ? "en" : "bn");
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  $("theme-btn").setAttribute("aria-label", dark ? t("ui.theme.to_light") : t("ui.theme.to_dark")); $("theme-btn").setAttribute("aria-pressed", String(!dark));
  $("theme-ico").setAttribute("d", dark ? "M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" : "M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z");
  $("theme-ico").setAttribute("fill", dark ? "none" : "currentColor"); $("theme-ico").setAttribute("stroke", dark ? "currentColor" : "none"); $("theme-ico").setAttribute("stroke-width", "2"); $("theme-ico").setAttribute("stroke-linecap", "round");
  $("menu-btn").setAttribute("aria-label", t("ui.menu"));
  $("foot-line").textContent = t("footer.line");
  $("to-top").textContent = t("ui.back_to_top");
}

async function renderAll() {
  renderChrome();
  renderHero();
  for (const [id, mod] of SECTIONS) {
    const el = $(id);
    try { await mod.render(el); } catch (e) { console.error(id, e); }
  }
  spy();
  reveal();
  document.dispatchEvent(new Event("av:lang"));
  if (universe) setTimeout(() => universe.measure(), 600);
}

async function setLang(lang, first) {
  try { S.c = await loadContent(lang); } catch (e) { showError(); return; }
  S.lang = lang; document.documentElement.lang = lang; store("av.lang", lang);
  $("load-err").hidden = true;
  const y = window.scrollY;
  await renderAll();
  if (!first) window.scrollTo(0, y);
}
function showError() {
  const b = $("load-err"); b.hidden = false;
  $("load-err-msg").textContent = "Could not reach the site backend. Start it with python run.py and reload. / ?????? ?????????? ????? ?????? ???????";
  $("load-retry").textContent = "Retry / ???? ??????"; $("load-retry").onclick = () => setLang(document.documentElement.lang || "en", true);
}

// nav: mobile menu + scroll spy
function closeMenu() { $("links").classList.remove("open"); $("menu-btn").setAttribute("aria-expanded", "false"); }
let io;
function spy() {
  if (io) io.disconnect();
  const map = { playground: "detector" };
  io = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      const id = map[e.target.id] || e.target.id;
      document.querySelectorAll("#links a").forEach((a) => a.setAttribute("aria-current", String(a.dataset.id === id)));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  NAV.concat(["playground"]).forEach((id) => { const s = $(id); if (s) io.observe(s); });
}

$("lang-btn").addEventListener("click", () => setLang(S.lang === "bn" ? "en" : "bn"));
$("theme-btn").addEventListener("click", () => {
  const d = document.documentElement; const next = d.getAttribute("data-theme") === "dark" ? "light" : "dark";
  d.setAttribute("data-theme", next); store("av.theme", next); renderChrome(); repaintHero(); window.dispatchEvent(new Event("resize"));
});
$("menu-btn").addEventListener("click", () => {
  const open = !$("links").classList.contains("open");
  $("links").classList.toggle("open", open); $("menu-btn").setAttribute("aria-expanded", String(open));
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

initFx();
// The universe (fixed WebGL background) loads on the side: if WebGL or the module fails, the page still works.
let universe = null;
function paintJourney(zone, p) {
  const box = $("journey"); if (!box) return;
  if (zone) { box.dataset.zone = zone; }
  const z = box.dataset.zone || "galaxy";
  $("j-zone").textContent = t(`journey.${z}.t`); $("j-sub").textContent = t(`journey.${z}.s`);
  box.hidden = !document.documentElement.classList.contains("has-3d");
  if (typeof p === "number") $("j-fill").style.transform = `scaleX(${p.toFixed(3)})`;
}
window.addEventListener("scroll", () => { const b = $("journey"); if (b && !b.hidden) { const d = Math.max(1, document.documentElement.scrollHeight - window.innerHeight); $("j-fill").style.transform = `scaleX(${Math.min(1, window.scrollY / d).toFixed(3)})`; } }, { passive: true });
document.addEventListener("av:lang", () => paintJourney());
import("./universe.js").then((m) => { universe = m.initUniverse($("universe"), { onZone: (z, p) => paintJourney(z, p) }); if (universe) window.__universe = universe; paintJourney(); })
  .catch((e) => { console.warn("3D universe unavailable", e); document.documentElement.classList.add("no-3d"); });
setLang(document.documentElement.lang === "bn" ? "bn" : "en", true);
