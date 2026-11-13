"""Simulated vitals fixtures. ALWAYS labelled simulated. Seeded = reproducible.

600 rows per crew member (one mission-day summary each; the console replays
them at a configurable rows-per-second rate).

`make_rows(seed=7)` is the challenge-brief fixture: single-signal HRV event at
index 250-251 and a multi-signal event at 400-402. `make_rows_events` plants
arbitrary ground-truth events so the console can measure its own detection delay.
"""
from __future__ import annotations

import json
from typing import Dict, Iterable, List, Optional

import numpy as np

from .detect import SIGNALS

N_ROWS = 600
PLANT_A = (250, 251)
PLANT_B = (400, 401, 402)

PARAMS = {  # mean, sd  (illustrative values, NOT real astronaut data)
    "hr": (62.0, 2.5), "hrv": (55.0, 6.0), "spo2": (97.5, 0.6),
    "sleep_h": (7.0, 0.5), "core_temp": (36.8, 0.12), "exercise_min": (120.0, 15.0),
}
PHI = 0.3  # mild day-to-day autocorrelation

# Simulated crew = the six members of Team MANTA (names and photos are the team's own; every vital is INVENTED).
# The first two events of Niloy are the challenge-brief beats (HRV drop at 250-251, three-signal shift at 400-402).
CREW: List[dict] = [
    {"id": "niloy", "callsign": "Niloy", "title": "Commander", "seed": 7, "photo": "/img/team-niloy.png",
     "events": [
         {"days": list(PLANT_A), "signals": ["hrv"], "sd": 3.5},
         {"days": list(PLANT_B), "signals": ["hrv", "hr", "sleep_h"], "sd": 3.5}]},
    {"id": "puja", "callsign": "Puja", "title": "Flight Engineer", "seed": 11, "photo": "/img/team-puja.png",
     "events": [
         {"days": [180, 181], "signals": ["core_temp"], "sd": 3.5},
         {"days": [470, 471, 472], "signals": ["sleep_h", "exercise_min"], "sd": 3.5}]},
    {"id": "dhiraj", "callsign": "Dhiraj", "title": "Medical Officer", "seed": 23, "photo": "/img/team-dhiraj.png",
     "events": [{"days": [320, 321], "signals": ["spo2"], "sd": 3.5}]},
    {"id": "tusar", "callsign": "Tushar", "title": "Mission Scientist", "seed": 31, "photo": "/img/team-tusar.png",
     "events": []},
    {"id": "taiyab", "callsign": "Taiyab", "title": "Pilot", "seed": 41, "photo": "/img/team-taiyab.png",
     "events": [{"days": [350, 351], "signals": ["hr"], "sd": 3.5}]},
    {"id": "mahdi", "callsign": "Mahadi", "title": "Payload Specialist", "seed": 53, "photo": "/img/team-mahdi.png",
     "events": []},
]


def _ar1(rng: np.random.Generator, n: int) -> np.ndarray:
    e = rng.normal(0, 1, n)
    x = np.zeros(n)
    x[0] = e[0]
    for t in range(1, n):
        x[t] = PHI * x[t - 1] + np.sqrt(1 - PHI ** 2) * e[t]  # unit marginal variance
    return x


def make_rows(seed: int = 7, plant: bool = True, n: int = N_ROWS,
              plant_sd: float = 3.5) -> List[Dict]:
    rng = np.random.default_rng(seed)
    cols = {s: mu + sd * _ar1(rng, n) for s, (mu, sd) in PARAMS.items()}
    if plant:
        k = plant_sd
        for i in PLANT_A:
            cols["hrv"][i] = PARAMS["hrv"][0] - k * PARAMS["hrv"][1]
        for i in PLANT_B:
            cols["hrv"][i] = PARAMS["hrv"][0] - k * PARAMS["hrv"][1]
            cols["hr"][i] = PARAMS["hr"][0] + k * PARAMS["hr"][1]
            cols["sleep_h"][i] = PARAMS["sleep_h"][0] - k * PARAMS["sleep_h"][1]
    return _to_rows(cols, n)


def make_rows_events(seed: int, events: Optional[Iterable[dict]] = None,
                     n: int = N_ROWS) -> List[Dict]:
    """Same noise model, but plant `events` = [{days, signals, sd}] in the 'worse'
    direction of each signal (exact ground truth, known only because simulated)."""
    rng = np.random.default_rng(seed)
    cols = {s: mu + sd * _ar1(rng, n) for s, (mu, sd) in PARAMS.items()}
    for ev in events or []:
        for d in ev["days"]:
            for s in ev["signals"]:
                mu, sd = PARAMS[s]
                sign = 1.0 if SIGNALS[s]["direction"] == "high" else -1.0
                cols[s][d] = mu + sign * ev["sd"] * sd
    return _to_rows(cols, n)


def _to_rows(cols: Dict[str, np.ndarray], n: int) -> List[Dict]:
    rows = []
    for t in range(n):
        r = {"day": t, "simulated": True}
        for s in PARAMS:
            r[s] = round(float(cols[s][t]), 3)
        rows.append(r)
    return rows


def write_fixture(path: str, seed: int = 7) -> None:
    """The single-person challenge-brief fixture (600 rows, planted anomalies)."""
    payload = {"meta": {"simulated": True, "rows": N_ROWS,
                        "row_means": "one mission-day summary; replay 1 row/sec",
                        "planted": {"single_hrv": list(PLANT_A), "multi": list(PLANT_B)},
                        "seed": seed},
               "rows": make_rows(seed)}
    with open(path, "w") as f:
        json.dump(payload, f)


def write_crew_fixture(path: str) -> None:
    """Six-person simulated crew (the team) with known planted events (ground truth)."""
    crew = []
    for c in CREW:
        crew.append({"id": c["id"], "callsign": c["callsign"], "title": c["title"], "photo": c.get("photo", ""),
                     "seed": c["seed"], "planted": c["events"],
                     "rows": make_rows_events(c["seed"], c["events"])})
    payload = {"meta": {"simulated": True, "rows_per_crew": N_ROWS,
                        "note": "SIMULATED crew: names and photos are Team MANTA, every vital is invented. Not astronaut data.",
                        "row_means": "one mission-day summary per row"},
               "crew": crew}
    with open(path, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
