// Runs before first paint: restore theme and language so the page never flashes the wrong one.
(function () {
  var d = document.documentElement;
  var theme = null, lang = null;
  try { theme = localStorage.getItem("av.theme"); lang = localStorage.getItem("av.lang"); } catch (e) {}
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  if (lang !== "en" && lang !== "bn") {
    lang = (navigator.language || "en").toLowerCase().indexOf("bn") === 0 ? "bn" : "en";
  }
  d.setAttribute("data-theme", theme);
  d.setAttribute("lang", lang);
})();
