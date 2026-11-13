import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from vigilsite.app import create_app
from vigilsite import sim

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def c():
    return TestClient(create_app())


def test_health_and_index(c):
    assert c.get("/api/health").json()["ok"] is True
    r = c.get("/")
    assert r.status_code == 200 and "Astra Vigil" in r.text
    assert "default-src 'self'" in r.headers["content-security-policy"]
    for path in (
        "/img/team-manta.png", "/img/team-niloy.png", "/img/team-tusar.png",
        "/img/team-taiyab.png", "/img/team-dhiraj.png", "/img/team-mahdi.png",
        "/img/team-puja.png",
    ):
        photo = c.get(path)
        assert photo.status_code == 200 and photo.headers["content-type"] == "image/png"


@pytest.mark.parametrize("lang", ["en", "bn"])
def test_content(c, lang):
    d = c.get(f"/api/content/{lang}").json()
    assert d["hero"]["title"] == "Astra Vigil 2.0"
    assert d["team"]["title"] and len(d["team"]["members"]) == 6
    assert d["video"]["fallback"] and d["video"]["retry"]


def test_unknown_language(c):
    assert c.get("/api/content/fr").status_code == 404


def test_hero_is_real_detector_output(c):
    d = c.get("/api/hero").json()
    assert d["simulated"] is True and len(d["v"]) == len(d["mu"]) == len(d["w"])
    assert d["alerts"][0]["day"] == 251 and d["alerts"][0]["signals"] == ["hrv"]
    i = 251 - d["first_day"]
    assert d["w"][i] >= 2.0 and d["w"][i - 1] >= 2.0   # two consecutive days beyond 2 SD


def test_playground_detects_large_step_and_not_zero(c):
    big = c.post("/api/playground", json={"signal": "hrv", "shift_sd": 4, "duration": 3, "mode": "step", "seed": 7}).json()
    assert big["summary"]["detected"] and big["summary"]["delay_days"] <= 1
    none = c.post("/api/playground", json={"signal": "hrv", "shift_sd": 0, "duration": 3, "mode": "step", "seed": 7}).json()
    assert not none["summary"]["detected"]


def test_playground_is_deterministic(c):
    body = {"signal": "spo2", "shift_sd": 3, "duration": 4, "mode": "step", "seed": 99}
    assert c.post("/api/playground", json=body).json() == c.post("/api/playground", json=body).json()


def test_playground_ramp_is_slower_than_step(c):
    step = c.post("/api/playground", json={"signal": "hr", "shift_sd": 3, "duration": 20, "mode": "step", "seed": 5}).json()["summary"]
    ramp = c.post("/api/playground", json={"signal": "hr", "shift_sd": 3, "duration": 20, "mode": "ramp", "seed": 5}).json()["summary"]
    assert step["detected"]
    assert (not ramp["detected"]) or ramp["delay_days"] > step["delay_days"]


@pytest.mark.parametrize("body", [
    {"signal": "bogus"}, {"signal": "hr", "shift_sd": 7}, {"signal": "hr", "shift_sd": -1},
    {"signal": "hr", "duration": 0}, {"signal": "hr", "duration": 31}, {"signal": "hr", "seed": -1},
    {"signal": "hr", "mode": "jump"}])
def test_playground_validation(c, body):
    assert c.post("/api/playground", json=body).status_code == 422


def test_privacy_tiers_hide_raw_values(c):
    crew = c.get("/api/privacy", params={"role": "crew"}).json()
    assert "values" in crew["data"]
    med = c.get("/api/privacy", params={"role": "medical", "consent": True}).json()
    assert "values" not in json.dumps(med["data"]) and "current" not in json.dumps(med["data"])
    denied = c.get("/api/privacy", params={"role": "medical", "consent": False}).json()
    assert denied["denied"] and denied["data"] is None
    for role in ("commander", "ground"):
        raw = json.dumps(c.get("/api/privacy", params={"role": role}).json()["data"])
        assert "hrv" not in raw and "baseline" not in raw
    ground = c.get("/api/privacy", params={"role": "ground"}).json()
    assert ground["outbox_check"]["accepted"]


def test_privacy_bad_input(c):
    assert c.get("/api/privacy", params={"role": "admin"}).status_code == 422
    assert c.get("/api/privacy", params={"day": 5}).status_code == 422
    assert c.get("/api/privacy", params={"owlt_min": 0}).status_code == 422


def test_link_model(c):
    d = c.get("/api/link", params={"owlt_min": 22.29, "accel": 60}).json()
    assert d["one_way_s"] == pytest.approx(22.29) and d["round_trip_s"] == pytest.approx(44.58)
    assert c.get("/api/link", params={"accel": 0}).status_code == 422


def test_outbox_allow_list(c):
    ok = {"day": 1, "ts": 0, "crew": [{"id": "a", "status": "normal"}]}
    assert c.post("/api/link/check", content=json.dumps(ok)).json()["accepted"]
    for bad in ({"day": 1, "crew": [{"id": "a", "status": "normal", "hr": 90}]},
                {"day": 1, "crew": [{"id": "a", "status": "sick"}]},
                {"day": 1, "extra": 1, "crew": []}, {"day": 1}, []):
        assert not c.post("/api/link/check", content=json.dumps(bad)).json()["accepted"]
    assert not c.post("/api/link/check", content="not json").json()["accepted"]
    assert c.post("/api/link/check", content="x" * 5000).status_code == 413


def test_audit_chain_detects_tampering(c):
    chain = c.get("/api/audit/demo").json()["entries"]
    assert c.post("/api/audit/verify", json={"entries": chain}).json()["valid"]
    chain[2]["action"] = "alert_dismissed"
    r = c.post("/api/audit/verify", json={"entries": chain}).json()
    assert not r["valid"] and r["broken_at"] == 2
    chain = c.get("/api/audit/demo").json()["entries"]
    del chain[1]
    assert not c.post("/api/audit/verify", json={"entries": chain}).json()["valid"]


def test_nasa_catalogue(c):
    d = c.get("/api/nasa").json()
    kinds = [r["kind"] for r in d["records"]]
    assert kinds.count("osdr") == 9 and kinds.count("ntrs") >= 9 and len(d["records"]) == 22
    assert all(r["url"].startswith("https://") for r in d["records"])
    assert d["meta"]["retrieved"]


def test_validation_numbers_are_sane(c):
    v = c.get("/api/validation").json()
    assert v["simulated"] and v["false_alarms"]["runs"] >= 100
    assert v["single_event"]["detection_rate_pct"] > 90 and v["multi_event"]["detection_rate_pct"] > 90
    assert 0 < v["false_alarms"]["all_per_1000_days"] < 60


def test_rate_limit():
    from vigilsite.config import Settings
    s = Settings(); s.rate_per_minute = 5
    cl = TestClient(create_app(s))
    codes = [cl.get("/api/signals").status_code for _ in range(8)]
    assert 429 in codes and codes[0] == 200


def test_static_assets_and_no_cdn():
    html = (ROOT / "frontend" / "index.html").read_text()
    assert "http://" not in html and "https://" not in html
    for f in (ROOT / "frontend").rglob("*"):
        if f.suffix in (".js", ".css", ".html"):
            txt = f.read_text()
            assert "cdn." not in txt and "googleapis" not in txt and "unpkg" not in txt, f


def test_link_model_reports_distance(c):
    d = c.get("/api/link", params={"owlt_min": 12.51, "accel": 60}).json()
    assert d["distance_mkm"] == pytest.approx(12.51 * 60 * 299792.458 / 1e6, abs=0.1)
    near = c.get("/api/link", params={"owlt_min": 3.04}).json()["distance_mkm"]
    far = c.get("/api/link", params={"owlt_min": 22.29}).json()["distance_mkm"]
    assert 50 < near < 60 and 395 < far < 410          # Mars closest and farthest, in million km


def test_dataset_list(c):
    d = c.get("/api/datasets").json()
    items = d["items"]
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)) == d["counts"]["total"] == 25
    assert d["counts"]["osdr"] == 9 and d["counts"]["other"] == 3
    for it in items:
        assert it["title"] and it["kind"] in {"osdr", "ntrs", "paper", "other"} and it["status"]
        assert it["url"] == "" or it["url"].startswith("https://")
    by = {i["id"]: i for i in items}
    assert by["OSD-575"]["used_for"] and by["SIM-CREW-600"]["status"] == "simulated"
    assert by["DONKI"]["status"].startswith("planned")        # honest: the cache is empty


def test_videos_are_well_formed(c):
    d = c.get("/api/videos").json()
    assert len(d["items"]) == 2 and d["meta"]["verified"]
    for v in d["items"]:
        assert len(v["id"]) == 11 and v["title"] and v["channel"] and v["channel_url"].startswith("https://www.youtube.com/@")
        assert v["topic"] in {"hrp", "link"}


def test_video_player_autoplays_muted_inline():
    source = (ROOT / "frontend" / "js" / "sections" / "video.js").read_text(encoding="utf-8")
    assert "autoplay=1&mute=1&playsinline=1" in source


def test_csp_only_allows_the_youtube_player(c):
    csp = c.get("/").headers["content-security-policy"]
    assert "frame-src https://www.youtube-nocookie.com;" in csp
    assert "script-src 'self'" in csp and "unsafe-eval" not in csp and "unsafe-inline" not in csp
    assert "connect-src 'self'" in csp and "frame-ancestors 'none'" in csp
    permissions = c.get("/").headers["permissions-policy"]
    assert 'autoplay=(self "https://www.youtube-nocookie.com")' in permissions


def test_three_is_bundled_not_linked(c):
    r = c.get("/vendor/three.module.min.js")
    assert r.status_code == 200 and b"three.js authors" in r.content.lower() or b"Three.js Authors" in r.content
    html = c.get("/").text
    assert "http://" not in html and "https://" not in html.replace("https://www.youtube", "")
