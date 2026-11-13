"""Server-side demos for the website. All of them call the REAL detector code
(`compute/detect.py`) - the website never re-implements the science in JavaScript.

Everything here is SIMULATED data from the same noise model as the console.
"""
from __future__ import annotations

import hashlib
import json
import threading
from functools import lru_cache
from pathlib import Path
from typing import Dict, List

from .compute.detect import SIGNALS, Config, StreamDetector, _worse, zscore
from .compute.fixture import PARAMS, make_rows_events
from .compute.guard import rule_text
from .engine import Mission, load_fixture

DATA = Path(__file__).resolve().parent / "data"

# Mars one-way light time presets (minutes) quoted from NASA DTN slides (NTRS 20160011483).
OWLT_PRESETS = [
    {"id": "mars_near", "owlt_min": 3.04},
    {"id": "mars_mean", "owlt_min": 12.51},
    {"id": "mars_far", "owlt_min": 22.29},
]

OUTBOX_ALLOWED_TOP = {"day", "ts", "crew"}
OUTBOX_ALLOWED_CREW = {"id", "status"}
OUTBOX_STATUS = {"learning", "normal", "watch", "alert"}

_lock = threading.Lock()


def validate_outbox_payload(p: dict) -> dict:
    """Same rule as the console's outbox: only allow-listed fields may leave."""
    problems: List[str] = []
    if not isinstance(p, dict):
        return {"accepted": False, "problems": ["payload must be an object"]}
    extra = sorted(set(p) - OUTBOX_ALLOWED_TOP)
    if extra:
        problems.append("top-level fields not allowed: " + ", ".join(extra))
    if not isinstance(p.get("crew"), list):
        problems.append("`crew` must be a list")
    else:
        for i, c in enumerate(p["crew"]):
            if not isinstance(c, dict):
                problems.append(f"crew[{i}] must be an object")
                continue
            bad = sorted(set(c) - OUTBOX_ALLOWED_CREW)
            missing = sorted(OUTBOX_ALLOWED_CREW - set(c))
            if bad:
                problems.append(f"crew[{i}] fields not allowed: " + ", ".join(bad))
            if missing:
                problems.append(f"crew[{i}] missing: " + ", ".join(missing))
            if "status" in c and c["status"] not in OUTBOX_STATUS:
                problems.append(f"crew[{i}].status must be one of {sorted(OUTBOX_STATUS)}")
    return {"accepted": not problems, "problems": problems}


# --------------------------------------------------------------------- mission
@lru_cache(maxsize=1)
def _fixture() -> dict:
    return load_fixture(DATA / "crew.json")


@lru_cache(maxsize=24)
def _mission_at(day: int) -> Mission:
    m = Mission(_fixture(), explain=lambda a: {"text": rule_text(a), "source": "rule_text"})
    m.reset_to(day)
    return m


def mission_at(day: int) -> Mission:
    with _lock:
        return _mission_at(day)


# ------------------------------------------------------------------------ hero
@lru_cache(maxsize=1)
def hero_trace() -> dict:
    """Real detector output for the commander's HRV around the planted event."""
    lo, hi = 205, 292
    m = mission_at(hi)
    cs = m.crew["niloy"]
    rec = cs.records[lo:hi + 1]
    alerts = [a for a in cs.alerts if lo <= a["day"] <= hi and "hrv" in a["signals"]]
    planted = [ev for ev in cs.meta["planted"] if lo <= min(ev["days"]) <= hi]
    meta = SIGNALS["hrv"]
    return {
        "simulated": True,
        "crew": {"id": "niloy", "callsign": "Niloy", "title": "Commander"},
        "signal": {"id": "hrv", **meta},
        "first_day": lo,
        "v": [r["v"]["hrv"] for r in rec],
        "mu": [r["mu"]["hrv"] for r in rec],
        "sd": [r["sd"]["hrv"] for r in rec],
        "w": [r["w"]["hrv"] for r in rec],
        "alerts": [{"day": a["day"], "rule": a["rule"], "signals": a["signals"],
                    "text": a["explanation"]} for a in alerts],
        "planted": [{"days": ev["days"], "signals": ev["signals"]} for ev in planted],
    }


# ------------------------------------------------------------------ playground
def playground(signal: str, shift_sd: float, duration: int, mode: str, seed: int,
               onset: int = 70, n: int = 120) -> dict:
    """Run the real StreamDetector on a fresh simulated person with a drift injected
    into ONE signal (in its 'worse' direction), in units of that signal's own SD."""
    base = make_rows_events(seed, [], n)
    mu0, sd0 = PARAMS[signal]
    sign = 1.0 if SIGNALS[signal]["direction"] == "high" else -1.0
    injected = [False] * n
    for i in range(duration):
        d = onset + i
        if d >= n:
            break
        frac = 1.0 if mode == "step" else (i + 1) / duration
        base[d][signal] = round(base[d][signal] + sign * shift_sd * sd0 * frac, 3)
        injected[d] = True

    cfg = Config()
    det = StreamDetector(cfg)
    v, mu, sd, w = [], [], [], []
    alerts: List[dict] = []
    for d, row in enumerate(base):
        z = zscore(det.hist[signal], det.excl[signal], row[signal], signal, cfg)
        v.append(row[signal])
        if z is None:
            mu.append(None); sd.append(None); w.append(None)
        else:
            mu.append(round(z["baseline_mean"], 4)); sd.append(round(z["baseline_sd"], 4))
            w.append(round(_worse(z["z"], SIGNALS[signal]["direction"]), 3))
        for a in det.update(row):
            ad = a.to_dict()
            ad["text"] = rule_text(ad)
            alerts.append(ad)

    end = onset + duration
    hits = [a for a in alerts if onset <= a["day"] <= end + 1 and signal in a["signals"]]
    first = min((a["day"] for a in hits), default=None)
    chance = [a for a in alerts if a not in hits]
    return {
        "simulated": True,
        "signal": {"id": signal, **SIGNALS[signal]},
        "days": n, "onset": onset, "duration": duration, "mode": mode,
        "shift_sd": shift_sd, "seed": seed,
        "v": v, "mu": mu, "sd": sd, "w": w, "injected": injected,
        "alerts": [{"day": a["day"], "rule": a["rule"], "signals": a["signals"], "details": a["details"],
                    "text": a["text"]} for a in alerts],
        "summary": {
            "detected": bool(hits),
            "first_alert_day": first,
            "delay_days": (first - onset) if first is not None else None,
            "chance_alerts": len(chance),
        },
    }


# ---------------------------------------------------------------------- privacy
ROLES = ("crew", "medical", "commander", "ground")


def privacy_view(role: str, day: int, consent: bool, owlt_min: float) -> dict:
    """What each role may see at the same moment of the mission (Niloy is the subject)."""
    m = mission_at(day)
    cid = "niloy"
    status = m.status_now()
    base = {"role": role, "day": day, "simulated": True,
            "subject": m.crew[cid].meta["callsign"]}
    if role == "crew":
        rec = m.crew[cid].records[-1]
        return {**base, "tier": 0, "can_see": "raw values, baselines and the full explanation",
                "data": {"values": {s: rec["v"][s] for s in SIGNALS},
                         "worse_sd": {s: rec["w"][s] for s in SIGNALS},
                         "status": status[cid],
                         "alerts_today": [{"day": a["day"], "rule": a["rule"], "signals": a["signals"], "details": a["details"]}
                                         for a in m.crew[cid].alerts if a["day"] == day]}}
    if role == "medical":
        if not consent:
            return {**base, "tier": 1, "can_see": "nothing - no consent from this crew member",
                    "data": None, "denied": True}
        return {**base, "tier": 1, "can_see": "trend direction per signal, no raw values",
                "data": m.trend_summary(cid)}
    if role == "commander":
        return {**base, "tier": 2, "can_see": "coarse status only, for everyone",
                "data": {"crew": [{"id": c["id"], "callsign": c["callsign"], "status": c["status"]}
                                  for c in m.crew_public()]}}
    if role == "ground":
        payload = {"day": day, "ts": 0, "crew": [{"id": k, "status": v} for k, v in status.items()]}
        return {**base, "tier": 2, "can_see": "coarse status only, after the light-time delay",
                "arrives_in_min": round(owlt_min, 2), "data": payload,
                "outbox_check": validate_outbox_payload(payload)}
    raise ValueError("unknown role")


# ------------------------------------------------------------------------- link
def link_model(owlt_min: float, accel: float) -> dict:
    one_way_s = owlt_min * 60.0 / accel
    return {
        "owlt_min": round(owlt_min, 2), "accel": accel,
        "one_way_s": round(one_way_s, 2), "round_trip_s": round(2 * one_way_s, 2),
        "real_round_trip_min": round(2 * owlt_min, 2),
        "distance_mkm": round(owlt_min * 60.0 * 299792.458 / 1e6, 1),
        "presets": OWLT_PRESETS,
        "note": "Demo time = real light time / acceleration. Real Mars one-way light time is about 3 to 22 minutes.",
    }


# ------------------------------------------------------------------------ audit
def _h(prev: str, ts: str, actor: str, action: str, detail: str) -> str:
    return hashlib.sha256(f"{prev}|{ts}|{actor}|{action}|{detail}".encode()).hexdigest()


_AUDIT_SEED = [
    ("niloy", "login", {"role": "crew"}),
    ("niloy", "consent_granted", {"grantee": "medical"}),
    ("system", "alert_raised", {"crew": "niloy", "rule": "hrv_below_personal_baseline"}),
    ("dhiraj", "trend_viewed", {"crew": "niloy"}),
    ("system", "outbox_queued", {"day": 251}),
    ("system", "outbox_delivered", {"day": 251}),
]


def audit_demo() -> List[dict]:
    chain, prev = [], "GENESIS"
    for i, (actor, action, detail) in enumerate(_AUDIT_SEED):
        ts = f"2026-01-01T00:{i:02d}:00Z"
        d = json.dumps(detail, sort_keys=True, separators=(",", ":"))
        h = _h(prev, ts, actor, action, d)
        chain.append({"i": i, "ts": ts, "actor": actor, "action": action, "detail": d,
                      "prev_hash": prev, "hash": h})
        prev = h
    return chain


def audit_verify(entries: List[dict]) -> dict:
    prev = "GENESIS"
    for i, e in enumerate(entries):
        if e["prev_hash"] != prev or _h(prev, e["ts"], e["actor"], e["action"], e["detail"]) != e["hash"]:
            return {"valid": False, "broken_at": i, "entries": len(entries)}
        prev = e["hash"]
    return {"valid": True, "broken_at": None, "entries": len(entries)}
