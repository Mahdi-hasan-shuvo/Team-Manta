"""Mission theatre: the six-person simulated crew, the with/without-software comparison, privacy of the crew endpoints."""
import pytest
from fastapi.testclient import TestClient

from vigilsite import mission
from vigilsite.app import create_app

TEAM = ["niloy", "puja", "dhiraj", "tusar", "taiyab", "mahdi"]


@pytest.fixture(scope="module")
def client():
    return TestClient(create_app())


def test_crew_is_the_team_with_photos_and_600_days():
    t = mission.crew_timeline()
    assert [m["id"] for m in t["crew"]] == TEAM and t["simulated"] is True and t["days"] == 600
    assert all(len(m["status"]) == 600 and set(m["status"]) <= {0, 1, 2, 3} for m in t["crew"])
    assert all(m["photo"] == f"/img/team-{m['id']}.png" for m in t["crew"])
    assert "invented" in t["note"]


def test_the_demo_beat_is_caught_one_day_after_onset():
    t = {m["id"]: m for m in mission.crew_timeline()["crew"]}
    assert 251 in t["niloy"]["alert_days"]                       # HRV drop planted at 250-251
    assert 181 in t["puja"]["alert_days"] or 180 in t["puja"]["alert_days"]
    assert t["niloy"]["status"][251] == 3                        # status 'alert'


def test_crew_day_gives_status_to_all_but_numbers_only_to_the_owner():
    d = mission.crew_day(251)
    assert d["view"] == "tier2-status" and all("tier0" not in c for c in d["crew"])
    own = mission.crew_day(251, own="niloy")
    assert own["view"] == "tier0-own"
    assert [c["id"] for c in own["crew"] if "tier0" in c] == ["niloy"]
    t0 = next(c for c in own["crew"] if c["id"] == "niloy")["tier0"]
    assert set(t0["values"]) == {"hr", "hrv", "spo2", "sleep_h", "core_temp", "exercise_min"} and "hrv" in t0["alert_signals"]


def test_compare_default_uses_22_minutes_each_way_and_the_real_detector():
    c = mission.compare()
    assert c["owlt_min"] == 22.29 and c["round_trip_min"] == 44.58
    assert c["detector"] == {"alert_day": 251, "delay_days": 1, "rule": "hrv_below_personal_baseline"}
    w, wo = c["with"], c["without"]
    ev = {e["id"]: e["t_min"] for e in w["events"]}
    assert ev["alert_on_board"] == 1440 and ev["earth_has_it"] - ev["sent"] == pytest.approx(22.29) and ev["answer_back"] - ev["sent"] == pytest.approx(44.58)
    assert {e["id"]: e["t_min"] for e in wo["events"]}["noticed_at_review"] == 14 * 1440
    assert c["days_gained"] == 13.0 and c["review_days"] == 14 and wo["first_guidance_min"] > w["first_guidance_min"]
    assert any("assumption" in a.lower() for a in c["assumptions"])


def test_compare_responds_to_distance_and_review_interval():
    near = mission.compare(3.04, 3)
    assert near["round_trip_min"] == 6.08 and near["days_gained"] == 2.0
    assert mission.compare(22.29, 7)["days_gained"] == 6.0


def test_mars_link_merge_rules():
    none = mission.mars_link(None)
    assert none["status"] == "computed" and none["far_round_trip_min"] == 44.58 and none["one_way_min"] > 0   # never blank: a labelled estimate
    live = mission.mars_link({"status": "live", "series": [{"date": "2026-11-13", "au": 1.0, "km": 149597871, "one_way_min": 8.317, "round_trip_min": 16.634}]})
    assert live["one_way_min"] == 8.317 and live["distance_mkm"] == 149.6
    down = mission.mars_link({"status": "unavailable", "message": "unreachable", "series": []})
    assert down["status"] == "computed" and down["message"] == "unreachable" and "not NASA live" in down["source"]


def test_computed_earth_mars_matches_known_geometry():
    from datetime import date
    opp = mission.computed_earth_mars(date(2025, 1, 16))      # opposition: Mars about 0.64 AU away
    assert abs(opp["au"] - 0.642) < 0.02
    far = mission.computed_earth_mars(date(2034, 8, 21))      # near the farthest conjunction: the NASA DTN figure is 22.29 min
    assert abs(far["one_way_min"] - mission.FAR_OWLT_MIN) < 0.6
    near = mission.computed_earth_mars(date(2035, 9, 10))      # the closest approaches reach about 3 minutes
    assert abs(near["one_way_min"] - mission.NEAR_OWLT_MIN) < 0.6
    assert mission.computed_earth_mars()["one_way_min"] < mission.FAR_OWLT_MIN + 1


def test_endpoints_validate_input(client):
    assert client.get("/api/crew/timeline").json()["crew"][0]["id"] == "niloy"
    assert client.get("/api/crew/day?day=251").status_code == 200
    assert client.get("/api/crew/day?day=900").status_code == 422
    assert client.get("/api/crew/day?day=10&own=../x").status_code == 422
    assert client.get("/api/compare").json()["round_trip_min"] == 44.58
    for q in ("owlt_min=0", "owlt_min=99", "review_days=0", "review_days=31", "crew=puja"):
        assert client.get(f"/api/compare?{q}").status_code == 422, q


def test_mission_theatre_assets_are_served():
    from fastapi.testclient import TestClient
    from vigilsite.app import create_app
    c = TestClient(create_app())
    for f in ("journey", "delay", "crew", "compare", "ship", "shared"):
        assert c.get(f"/js/mission/{f}.js").status_code == 200
    assert c.get("/js/sections/updates.js").status_code == 200
    for cid in ("niloy", "puja", "dhiraj", "tusar", "taiyab", "mahdi"):
        r = c.get(f"/img/crew/{cid}.webp")
        assert r.status_code == 200 and len(r.content) < 20000


def test_journey_length_is_the_computed_hohmann_time():
    import re, pathlib
    days = mission.hohmann_days()
    assert 258 < days < 260
    js = (pathlib.Path(__file__).resolve().parents[1] / "frontend/js/mission/journey.js").read_text(encoding="utf-8")
    assert int(re.search(r"const DAYS = (\d+);", js).group(1)) == round(days)
