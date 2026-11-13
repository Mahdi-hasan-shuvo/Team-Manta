"""Mission-theatre models for the website: the simulated crew (Team MANTA), the "with / without the software" comparison,
and the Earth-Mars link numbers. Everything calls the REAL detector through `sim.mission_at`; nothing is re-implemented in JavaScript.

All crew data is SIMULATED (names and photos are the team's, every vital is invented).
"""
from __future__ import annotations

import math
from datetime import date, datetime, timezone
from functools import lru_cache
from typing import Dict, List, Optional

from .compute.detect import SIGNALS
from . import sim

STATUS_CODE = {"learning": 0, "normal": 1, "watch": 2, "alert": 3}
FAR_OWLT_MIN = 22.29      # Mars one-way light time at its farthest in the NTRS 20160011483 slides
NEAR_OWLT_MIN = 3.04
N_DAYS = 600
# NASA JSC Behavioral Health & Performance: a Private Psychological Conference with every ISS crew member every two weeks
# (NTRS 20170003866, B. Beven, 2017). Used as the default "next scheduled health review"; it is Earth-side ISS practice, so it stays adjustable.
REVIEW_DAYS_DEFAULT = 14
AU_KM, C_KM_S = 149597870.7, 299792.458

# Approximate Keplerian elements of the Earth-Moon barycentre and Mars (E.M. Standish, JPL, "Keplerian Elements for Approximate
# Positions of the Major Planets", valid 1800-2050): value at J2000 and rate per Julian century.
#   a [AU], e, I [deg], L [deg], long.peri [deg], long.node [deg]
_ELEMENTS = {
    "earth": ((1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0), (0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0)),
    "mars": ((1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891), (0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343)),
}


def _helio(body: str, T: float) -> tuple:
    (a0, e0, i0, l0, w0, o0), (da, de, di, dl, dw, do) = _ELEMENTS[body]
    a, e, i, L, w, om = a0 + da * T, e0 + de * T, i0 + di * T, l0 + dl * T, w0 + dw * T, o0 + do * T
    M = math.radians(((L - w) + 180.0) % 360.0 - 180.0)
    E = M
    for _ in range(12):                                   # Kepler's equation, Newton steps
        E -= (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
    xp, yp = a * (math.cos(E) - e), a * math.sqrt(1 - e * e) * math.sin(E)
    w_arg, om_r, i_r = math.radians(w - om), math.radians(om), math.radians(i)
    cw, sw, co, so, ci, si = math.cos(w_arg), math.sin(w_arg), math.cos(om_r), math.sin(om_r), math.cos(i_r), math.sin(i_r)
    return ((cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
            (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
            (sw * si) * xp + (cw * si) * yp)


def computed_earth_mars(day: Optional[date] = None) -> dict:
    """Earth-Mars distance and one-way light time computed here, offline, from approximate orbital elements.
    This is an ESTIMATE (a few hundredths of an AU, about +-0.3 min), not a NASA live value; it only keeps the page honest when JPL Horizons is unreachable."""
    day = day or datetime.now(timezone.utc).date()
    jd = day.toordinal() + 1721424.5 + 0.5               # noon UT of that calendar day
    T = (jd - 2451545.0) / 36525.0
    e, m = _helio("earth", T), _helio("mars", T)
    au = math.dist(e, m)
    one_way = au * AU_KM / C_KM_S / 60.0
    return {"date": day.isoformat(), "au": round(au, 4), "km": round(au * AU_KM), "one_way_min": round(one_way, 2), "round_trip_min": round(2 * one_way, 2)}


@lru_cache(maxsize=1)
def _fixture_meta() -> Dict[str, dict]:
    return {c["id"]: {"id": c["id"], "callsign": c["callsign"], "title": c["title"], "photo": c.get("photo", ""),
                      "planted": c.get("planted", [])} for c in sim._fixture()["crew"]}


@lru_cache(maxsize=1)
def crew_timeline() -> dict:
    """Coarse status of every crew member for every mission day, plus the days an alert fired. One call lets the page scrub the whole mission."""
    m = sim.mission_at(N_DAYS - 1)
    meta = _fixture_meta()
    crew = []
    for cid, cs in m.crew.items():
        crew.append({**{k: meta[cid][k] for k in ("id", "callsign", "title", "photo")},
                     "status": [STATUS_CODE[s] for s in cs.status],
                     "alert_days": sorted({a["day"] for a in cs.alerts}),
                     "planted": [{"days": ev["days"], "signals": ev["signals"]} for ev in meta[cid]["planted"]]})
    return {"simulated": True, "days": N_DAYS, "codes": {v: k for k, v in STATUS_CODE.items()}, "crew": crew,
            "note": "SIMULATED crew. Names and photos are Team MANTA; every vital is invented. Status only (tier 2)."}


def crew_day(day: int, own: Optional[str] = None) -> dict:
    """One mission day. Everybody gets coarse status (what the commander and ground may see). `own` adds the tier-0 numbers of ONE person,
    i.e. what that crew member sees about themselves. Nobody else's raw numbers are ever included."""
    m = sim.mission_at(day)
    meta = _fixture_meta()
    status = m.status_now()
    out: List[dict] = []
    for cid, cs in m.crew.items():
        row = {**{k: meta[cid][k] for k in ("id", "callsign", "title", "photo")}, "status": status[cid],
               "alert_today": any(a["day"] == day for a in cs.alerts)}
        if own == cid and cs.records:
            rec = cs.records[-1]
            row["tier0"] = {"values": {s: rec["v"][s] for s in SIGNALS}, "worse_sd": {s: rec["w"][s] for s in SIGNALS},
                            "alert_signals": sorted({s for a in cs.alerts if a["day"] == day for s in a["signals"]})}
        out.append(row)
    return {"simulated": True, "day": day, "crew": out, "view": "tier0-own" if own else "tier2-status"}


# ------------------------------------------------------------ with / without the software
@lru_cache(maxsize=16)
def _first_event(crew_id: str, index: int) -> dict:
    ev = _fixture_meta()[crew_id]["planted"][index]
    onset = min(ev["days"])
    m = sim.mission_at(min(N_DAYS - 1, onset + 30))
    cs = m.crew[crew_id]
    hit = [a for a in cs.alerts if a["ground_truth"]["planted"] and a["ground_truth"]["onset_day"] == onset]
    return {"onset": onset, "signals": ev["signals"], "sd": ev["sd"],
            "alert_day": min((a["day"] for a in hit), default=None),
            "rule": hit[0]["rule"] if hit else None}


def compare(owlt_min: float = FAR_OWLT_MIN, review_days: int = REVIEW_DAYS_DEFAULT, crew_id: str = "niloy", index: int = 0) -> dict:
    """The same simulated event, two ways.

    WITH the software: the real detector raises the alert on board; the crew acts at once and only a coarse status goes to Earth.
    WITHOUT it: nobody is watching the trend, so the change is noticed at the next scheduled health review (an ASSUMPTION, `review_days`),
    and only then does a message start its trip to Earth. In both cases an answer from Earth needs 2 x one-way light time.
    """
    ev = _first_event(crew_id, index)
    if ev["alert_day"] is None:
        raise ValueError("the detector did not catch this event")
    day_min = 1440.0
    onset_t = 0.0
    sw_detect = (ev["alert_day"] - ev["onset"]) * day_min
    no_detect = review_days * day_min
    rt = 2 * owlt_min

    def lane(detect_t: float, label: str, noticed: str) -> dict:
        return {"id": label, "events": [
            {"id": "onset", "t_min": onset_t},
            {"id": noticed, "t_min": round(detect_t, 2)},
            {"id": "sent", "t_min": round(detect_t, 2)},
            {"id": "earth_has_it", "t_min": round(detect_t + owlt_min, 2)},
            {"id": "answer_back", "t_min": round(detect_t + rt, 2)}],
            "noticed_day": round(detect_t / day_min, 3), "first_guidance_min": round(detect_t + rt, 2)}

    with_sw, without = lane(sw_detect, "with", "alert_on_board"), lane(no_detect, "without", "noticed_at_review")
    return {
        "simulated": True, "crew": crew_id, "event": {"onset_day": ev["onset"], "signals": ev["signals"], "shift_sd": ev["sd"]},
        "owlt_min": round(owlt_min, 2), "round_trip_min": round(rt, 2), "review_days": review_days,
        "with": with_sw, "without": without,
        "detector": {"alert_day": ev["alert_day"], "delay_days": ev["alert_day"] - ev["onset"], "rule": ev["rule"]},
        "days_gained": round((no_detect - sw_detect) / day_min, 2),
        "assumptions": ["review_days is the next scheduled health review. The default (14 days) is NASA's ISS Private Psychological Conference interval (NTRS 20170003866); that the change is only noticed then, and that a Mars crew would use the same interval, are assumptions of this scenario.",
                        "With the software the alert is raised on board, so the crew does not wait for Earth; Earth still gets a coarse status.",
                        "Light times are the Mars one-way values from NASA DTN slides (NTRS 20160011483) unless a live JPL Horizons value is shown."],
    }


# ------------------------------------------------------------------ Earth - Mars link
def mars_link(hub_result: Optional[dict]) -> dict:
    """Merge a (live / cached / unavailable) JPL Horizons answer with the fixed NASA DTN range so the page always has numbers to show."""
    base = {"range_min": {"near": NEAR_OWLT_MIN, "far": FAR_OWLT_MIN}, "far_round_trip_min": round(2 * FAR_OWLT_MIN, 2),
            "source": "NASA/JPL Horizons", "status": "unavailable", "as_of": None, "one_way_min": None, "round_trip_min": None,
            "distance_au": None, "distance_mkm": None, "message": ""}
    comp = computed_earth_mars()
    estimate = {**base, "status": "computed", "as_of": comp["date"], "one_way_min": comp["one_way_min"], "round_trip_min": comp["round_trip_min"],
                "distance_au": comp["au"], "distance_mkm": round(comp["km"] / 1e6, 1), "source": "Computed here from approximate orbital elements (estimate, not NASA live data)"}
    if not hub_result:
        return estimate
    series = hub_result.get("series") or []
    st = hub_result.get("status", "unavailable")
    if st in ("live", "cached") and series:
        r = series[0]
        return {**base, "status": st, "as_of": r["date"], "one_way_min": r["one_way_min"], "round_trip_min": r["round_trip_min"],
                "distance_au": r["au"], "distance_mkm": round(r["km"] / 1e6, 1), "fetched_at": hub_result.get("fetched_at"),
                "message": hub_result.get("message", "")}
    return {**estimate, "message": hub_result.get("message", "")}


def hohmann_days(r_dep: float = 1.0, r_arr: float = 1.52371034) -> float:
    """Transfer time of a minimum-energy (Hohmann) Earth-Mars orbit: half the period of the ellipse with a = (r1 + r2) / 2, in days."""
    a = (r_dep + r_arr) / 2.0
    return 0.5 * a ** 1.5 * 365.25636           # Kepler III: period in years = a^1.5 (a in AU)
