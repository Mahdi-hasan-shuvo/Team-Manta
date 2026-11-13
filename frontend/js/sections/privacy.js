import { h, fill } from "../dom.js";
import { t, n } from "../i18n.js";
import { getJSON, once, postJSON } from "../api.js";
import { begin, statusEl, alertLine, unitOf } from "./common.js";

const V = { role: "crew", consent: true, day: 251 };
const ROLES = ["crew", "medical", "commander", "ground"];
let chainOriginal = null, chain = null, edited = false, verdict = null;

export function render(el) {
  const { wrap, signal } = begin(el, "privacy", { simulated: true });
  const tabs = h("div", { class: "seg", role: "tablist" }, ROLES.map((r) => h("button", {
    type: "button", role: "tab", dataset: { r }, "aria-selected": String(V.role === r),
    onclick: () => { V.role = r; load(); },
  }, t(`privacy.roles.${r}`))));
  const side = h("div", { class: "pv-side" });
  const main = h("div", { class: "panel pad pv-main", "aria-live": "polite" }, h("div", { class: "skeleton" }));
  wrap.append(tabs, h("div", { class: "pv" }, side, main));

  async function load() {
    tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.r === V.role)));
    let r;
    try { r = await getJSON(`/api/privacy?role=${V.role}&day=${V.day}&consent=${V.consent}&owlt_min=12.51`); }
    catch (e) { fill(main, h("p", null, `${t("ui.error")} (${e.message})`)); return; }
    paint(r);
  }

  function paint(r) {
    fill(side, 
      h("div", { class: "tier" }, t("privacy.tier", { n: r.tier })),
      h("h3", null, t(`privacy.roles.${r.role}`)),
      h("p", null, t(`privacy.can_see.${r.role}`)),
      h("p", { class: "hint" }, t("privacy.subject", { day: V.day })),
      r.role === "medical" ? h("div", { class: "sw" }, h("label", null,
        h("input", { type: "checkbox", checked: V.consent, onchange: (e) => { V.consent = e.target.checked; load(); } }),
        h("span", null, t("privacy.consent")))) : null);
    main.classList.remove("swap"); void main.offsetWidth; main.classList.add("swap");
    if (r.denied) { fill(main, h("div", { class: "denied" }, h("b", null, "403"), h("p", null, t("privacy.denied")))); return; }
    if (r.role === "crew") {
      const d = r.data;
      fill(main, 
        h("table", null, h("thead", null, h("tr", null, h("th", null, t("privacy.values")), h("th", null, ""), h("th", null, t("privacy.worse_sd")))),
          h("tbody", null, Object.keys(d.values).map((s) => {
            const w = d.worse_sd[s];
            return h("tr", null, h("td", null, t(`nasa.signal_names.${s}`)), h("td", { class: "num" }, `${n(d.values[s], 1)} ${unitOf(s)}`),
              h("td", { class: `num worse ${w >= 2.5 ? "hi" : w >= 2 ? "mid" : ""}` }, w == null ? "–" : n(w, 1)));
          }))),
        h("p", null, h("span", { class: "lbl" }, t("privacy.status")), " ", statusEl(d.status)),
        h("div", { class: "say" }, d.alerts_today.length ? d.alerts_today.map((a) => h("p", null, alertLine(a))) : t("privacy.no_alert")));
    } else if (r.role === "medical") {
      const rows = Object.entries(r.data.signals);
      const map = { "drifting toward worse": "worse", "drifting toward better": "better", "steady": "steady", "learning baseline": "learning" };
      fill(main, h("div", { class: "lbl" }, t("privacy.trend")),
        h("table", null, h("tbody", null, rows.map(([s, v]) => h("tr", null, h("td", null, t(`nasa.signal_names.${s}`)),
          h("td", { class: `worse ${map[v.trend] === "worse" ? "hi" : ""}` }, t(`privacy.trend.${map[v.trend] || "steady"}`)))))));
    } else {
      const list = r.role === "commander" ? r.data.crew.map((c) => [c.callsign, c.status]) : r.data.crew.map((c) => [c.id, c.status]);
      fill(main, h("div", { class: "lbl" }, t("privacy.crew_status")),
        h("table", null, h("tbody", null, list.map(([name, st]) => h("tr", null, h("td", null, name), h("td", null, statusEl(st)))))),
        r.role === "ground" ? [h("p", { class: "say" }, t("privacy.arrives", { min: r.arrives_in_min }), " ", r.outbox_check.accepted ? t("privacy.outbox_ok") : ""),
          h("div", { class: "lbl" }, t("privacy.payload")), h("pre", { class: "pre" }, JSON.stringify(r.data, null, 1))] : null);
    }
  }
  load();
  renderAudit(wrap, signal);
}

async function renderAudit(wrap, signal) {
  const a = t("privacy.audit");
  const list = h("div", { class: "chain" });
  const verdictEl = h("span", { class: "verdict", "aria-live": "polite" });
  const edit = h("button", { class: "btn ghost small", type: "button" }, a.edit);
  const verify = h("button", { class: "btn primary small", type: "button" }, a.verify);
  const reset = h("button", { class: "btn ghost small", type: "button" }, a.reset);
  wrap.append(h("div", { class: "audit" }, h("h3", null, a.title), h("p", null, a.body), list,
    h("div", { class: "chain-ctl" }, edit, verify, reset, verdictEl)));

  if (!chainOriginal) { try { chainOriginal = (await once("/api/audit/demo")).entries; } catch (e) { list.textContent = t("ui.error"); return; } chain = JSON.parse(JSON.stringify(chainOriginal)); }
  function draw(broken) {
    fill(list, ...chain.map((e, i) => h("div", { class: `blk${broken === i ? " bad" : ""}${broken != null && i > broken ? " after" : ""}${edited && i === 2 ? " edited" : ""}` },
      h("span", { class: "h" }, n(i + 1)), h("span", null, e.actor), h("span", { class: "act" }, e.action), h("span", { class: "h", title: e.hash }, e.hash.slice(0, 20) + "…"))));
  }
  edit.addEventListener("click", () => { chain[2] = { ...chainOriginal[2], action: "alert_dismissed" }; edited = true; verdict = null; verdictEl.textContent = ""; draw(null); });
  reset.addEventListener("click", () => { chain = JSON.parse(JSON.stringify(chainOriginal)); edited = false; verdictEl.textContent = ""; draw(null); });
  verify.addEventListener("click", async () => {
    try {
      const r = await postJSON("/api/audit/verify", { entries: chain });
      verdictEl.className = `verdict ${r.valid ? "ok" : "bad"}`;
      verdictEl.textContent = r.valid ? t("privacy.audit.valid", { n: r.entries }) : t("privacy.audit.broken", { i: r.broken_at + 1 });
      draw(r.valid ? null : r.broken_at);
    } catch (e) { verdictEl.textContent = e.message; }
  });
  draw(null);
}
