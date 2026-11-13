"""NASA hub: no real network. `_http_get` is replaced, so these tests check parsing, validation, caching, fallback, masking."""
import json
import urllib.error
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from vigilsite import nasa_hub
from vigilsite.app import create_app

ROOT = Path(__file__).resolve().parents[1]
BUNDLED = [
    {"kind": "OSDR", "id": "OSD-569", "title": "Whole blood from Inspiration4", "summary": "blood RNA", "url": "https://osdr.nasa.gov/x", "organism": "Homo sapiens", "release_date": "2024-05-14"},
    {"kind": "NTRS", "id": "NTRS-1", "title": "Neuro-ocular syndrome", "summary": "eye", "url": "https://ntrs.nasa.gov/citations/1"},
]


def make(offline=False, tmp=None, key="DEMO_KEY"):
    return nasa_hub.Hub(offline, key, tmp, lambda: BUNDLED)


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def boom(url, timeout=9.0):
        raise urllib.error.URLError("blocked in tests")
    monkeypatch.setattr(nasa_hub, "_http_get", boom)


def fake(monkeypatch, payload, seen=None):
    def get(url, timeout=9.0):
        if seen is not None:
            seen.append(url)
        return payload
    monkeypatch.setattr(nasa_hub, "_http_get", get)


def test_catalog_lists_all_apis():
    cat = nasa_hub.catalog(False, True)
    ids = {a["id"] for a in cat["apis"]}
    assert ids == {"osdr_search", "osdr_meta", "ntrs", "donki", "eonet", "cmr", "power", "images", "horizons", "dsn"}
    assert all(a["host"] in nasa_hub.ALLOWED_HOSTS for a in cat["apis"])
    assert cat["key"] == "demo"
    assert "pattern" not in json.dumps(cat)


@pytest.mark.parametrize("aid,raw", [
    ("power", {"lat": "99"}), ("power", {"lon": "abc"}), ("power", {"lat": "nan"}), ("donki", {"type": "DROP"}),
    ("donki", {"days": "31"}), ("osdr_meta", {"accession": "../etc"}), ("ntrs", {"size": "0"}), ("nope", {}),
])
def test_bad_parameters_are_rejected(aid, raw):
    with pytest.raises(nasa_hub.HubError):
        nasa_hub.validate(aid, raw)


def test_term_is_sanitised():
    p = nasa_hub.validate("ntrs", {"term": "mars <script>&x=1;"})
    assert "<" not in p["term"] and "&" not in p["term"] and ";" not in p["term"]


def test_defaults_fill_in():
    assert nasa_hub.validate("eonet", {})["category"] == "wildfires"


def test_osdr_search_parser_and_live_status(monkeypatch):
    fake(monkeypatch, {"hits": {"total": {"value": 5}, "hits": [{"_id": "OSD-569", "_source": {"Study Title": "T", "Accession": "OSD-569", "organism": ["Homo sapiens"], "Study Public Release Date": "2024-05-14"}}]}})
    r = make().fetch("osdr_search", {})
    assert r["status"] == "live" and r["total"] == 5 and r["items"][0]["url"].endswith("OSD-569") and r["items"][0]["tag"] == "Homo sapiens"
    assert r["fetched_at"]


def test_donki_parser_and_key_never_leaks(monkeypatch):
    seen = []
    fake(monkeypatch, [{"sepID": "x", "eventTime": "2026-01-02T00:00Z", "link": "https://example.invalid/", "instruments": [{"displayName": "GOES"}]}], seen)
    r = make(key="SECRETKEY123").fetch("donki", {"type": "SEP"})
    assert "SECRETKEY123" not in seen[0]                   # the current CCMC address needs no key, so none is sent
    assert "SECRETKEY123" not in json.dumps(r)             # and it never reaches the browser
    assert r["items"][0]["tag"] == "SEP"


def test_donki_legacy_address_keeps_key_server_side(monkeypatch):
    seen = []
    def get(url, timeout=9.0):
        seen.append(url)
        if url.startswith("https://ccmc."):
            raise urllib.error.HTTPError(url, 503, "down", {}, None)
        return [{"sepID": "x", "eventTime": "2026-01-02T00:00Z", "link": "https://example.invalid/", "instruments": [{"displayName": "GOES"}]}]
    monkeypatch.setattr(nasa_hub, "_http_get", get)
    r = make(key="SECRETKEY123").fetch("donki", {"type": "SEP"})
    assert "SECRETKEY123" in seen[1] and "SECRETKEY123" not in json.dumps(r) and "api_key=***" in r["source_url"]


def test_other_parsers(monkeypatch):
    cases = {
        "ntrs": {"results": [{"id": 7, "title": "A", "abstract": "b", "subjectCategories": ["Life Sciences"], "created": "2020-01-01T00:00:00"}], "stats": {"total": 1}},
        "eonet": {"events": [{"title": "Fire", "categories": [{"title": "Wildfires"}], "geometry": [{"date": "2026-02-01T00:00:00Z"}], "link": "https://eonet.gsfc.nasa.gov/x"}]},
        "cmr": {"feed": {"entry": [{"id": "C123-ABC", "title": "TEMPO", "summary": "s", "time_start": "2023-01-01T00:00:00Z", "data_center": "ASDC"}]}},
        "power": {"properties": {"parameter": {"T2M": {"20260101": 20.5, "20260102": -999}, "RH2M": {"20260101": 55.2, "20260102": -999}}}},
        "images": {"collection": {"metadata": {"total_hits": 3}, "items": [{"data": [{"nasa_id": "a b", "title": "Img", "description": "d", "date_created": "2020-01-01T00:00:00Z", "media_type": "image"}]}]}},
        "osdr_meta": {"OSD-569": {"metadata": {"study title": "X", "organism": ["Homo sapiens"]}}},
    }
    for aid, payload in cases.items():
        fake(monkeypatch, payload)
        r = make().fetch(aid, {})
        assert r["status"] == "live" and len(r["items"]) >= 1, aid
        assert all(i["url"] == "" or i["url"].startswith("https://") for i in r["items"]), aid
    fake(monkeypatch, cases["power"])
    assert len(make().fetch("power", {})["items"]) == 1       # the -999 fill row is dropped


def test_memory_cache_hits_once(monkeypatch):
    seen = []
    fake(monkeypatch, {"events": []}, seen)
    h = make()
    h.fetch("eonet", {}); r = h.fetch("eonet", {})
    assert len(seen) == 1 and r["from_memory"] is True


def test_disk_cache_is_used_when_network_fails(monkeypatch, tmp_path):
    fake(monkeypatch, {"events": [{"title": "Fire", "categories": [], "geometry": []}]})
    make(tmp=tmp_path).fetch("eonet", {})
    monkeypatch.setattr(nasa_hub, "_http_get", lambda url, timeout=9.0: (_ for _ in ()).throw(urllib.error.URLError("down")))
    r = make(tmp=tmp_path).fetch("eonet", {})                 # fresh Hub: empty memory, so the disk copy answers
    assert r["status"] == "cached" and r["cached_from"] == "last live fetch" and r["message"] == "unreachable" and r["items"]


def test_bundled_fallback_and_unavailable():
    r = make().fetch("osdr_search", {"term": "blood"})
    assert r["status"] == "cached" and r["cached_from"] == "bundled records" and r["items"][0]["title"].startswith("Whole blood")
    r = make().fetch("donki", {})
    assert r["status"] == "unavailable" and r["items"] == [] and r["message"] == "unreachable"


def test_offline_mode_never_calls_network(monkeypatch):
    called = []
    monkeypatch.setattr(nasa_hub, "_http_get", lambda *a, **k: called.append(1))
    r = make(offline=True).fetch("osdr_search", {})
    assert not called and r["message"] == "offline_mode" and r["status"] == "cached"


@pytest.mark.parametrize("code,why", [(429, "rate_limited"), (403, "bad_key"), (500, "http_500")])
def test_http_errors_are_named(monkeypatch, code, why):
    def get(url, timeout=9.0):
        raise urllib.error.HTTPError(url, code, "x", {}, None)
    monkeypatch.setattr(nasa_hub, "_http_get", get)
    assert make().fetch("donki", {})["message"] == why


def test_garbage_payload_does_not_crash(monkeypatch):
    fake(monkeypatch, "not what we expected")
    assert make().fetch("ntrs", {})["status"] in ("cached", "unavailable")


def test_http_get_refuses_other_hosts_and_http():
    from importlib import reload
    real = reload(nasa_hub)._http_get
    for bad in ("https://example.com/x", "http://osdr.nasa.gov/x", "https://osdr.nasa.gov.evil.com/x", "file:///etc/passwd"):
        with pytest.raises(ValueError):
            real(bad)


def test_redirect_handler_blocks_foreign_hosts():
    h = nasa_hub._SameHost()
    with pytest.raises(urllib.error.URLError):
        h.redirect_request(None, None, 302, "Found", {}, "https://evil.example/x")
    with pytest.raises(urllib.error.URLError):
        h.redirect_request(None, None, 302, "Found", {}, "http://osdr.nasa.gov/x")


def test_mask():
    assert nasa_hub.mask("https://api.nasa.gov/x?a=1&api_key=ABC&b=2") == "https://api.nasa.gov/x?a=1&api_key=***&b=2"


def test_endpoints(monkeypatch, tmp_path):
    monkeypatch.setenv("VIGIL_OFFLINE", "1"); monkeypatch.setenv("VIGIL_CACHE_DIR", str(tmp_path))
    c = TestClient(create_app())
    cat = c.get("/api/hub").json()
    assert cat["offline"] is True and len(cat["apis"]) == 10
    r = c.get("/api/hub/ntrs")
    assert r.status_code == 200 and r.json()["status"] in ("cached", "unavailable")
    assert c.get("/api/hub/power?lat=500").status_code == 422
    assert c.get("/api/hub/unknown").status_code == 422


def test_permissions_policy_and_vendor_bundle():
    c = TestClient(create_app())
    pp = c.get("/").headers["permissions-policy"]
    for feat in ("gyroscope", "accelerometer", "xr-spatial-tracking"):
        assert f"{feat}=(self)" in pp
    for feat in ("camera", "microphone", "geolocation"):
        assert f"{feat}=()" in pp
    assert c.get("/vendor/three.module.min.js").status_code == 200
    for js in ("universe", "galaxy", "solar", "xr"):
        assert c.get(f"/js/{js}.js").status_code == 200


# ---------------------------------------------------------------- v3.2: Horizons, DSN Now, DONKI fallback, platforms
HORIZONS_JSON = {"signature": {"source": "NASA/JPL Horizons API", "version": "1.2"}, "result": (
    "*******\nEphemeris / API_USER\n$$SOE\n"
    "2026-Nov-13 00:00, , ,  1.18304862, -12.3456789,   9.84291,\n"
    "2026-Nov-14 00:00, *, ,  1.18913145, -12.2101211,   9.89322,\n"
    "$$EOE\n*******\n")}

DSN_XML = (b'<?xml version="1.0"?><dsn><station name="gdscc" friendlyName="Goldstone"><dish name="DSS14">'
           b'<target name="MRO" id="1" uplegRange="206000000" downlegRange="205900000" rtlt="1372.5"/>'
           b'<target name="VGR1" id="2" uplegRange="-1" downlegRange="2.5e10" rtlt="167000"/></dish>'
           b'<dish name="DSS24"><target name="LOST" id="3" uplegRange="-1" downlegRange="-1" rtlt="-1"/>'
           b'<target name="MRO" id="1" downlegRange="1" rtlt="1"/></dish></station></dsn>')


def test_horizons_url_and_parse(monkeypatch):
    seen = []
    fake(monkeypatch, HORIZONS_JSON, seen)
    r = make(offline=False).fetch("horizons", {"body": "mars", "days": "2"})
    assert r["status"] == "live" and r["total"] == 2
    u = seen[0]
    assert u.startswith("https://ssd.jpl.nasa.gov/api/horizons.api?") and "COMMAND=%27499%27" in u and "QUANTITIES=%2720%2C21%27" in u and "500%40399" in u
    first = r["series"][0]
    assert first["date"] == "2026-11-13" and first["one_way_min"] == 9.843 and first["round_trip_min"] == 19.686 and first["au"] == 1.183049
    assert abs(first["km"] / 299792.458 / 60 - first["one_way_min"]) < 0.01      # the AU figure and the light-time figure agree
    assert "api_key" not in u


@pytest.mark.parametrize("payload", [{"result": "no table here"}, {"result": "$$SOE\n$$EOE"}, [], {"result": "$$SOE\nx,y\n$$EOE"}])
def test_horizons_bad_payload_is_reported_not_raised(monkeypatch, payload):
    fake(monkeypatch, payload)
    assert make().fetch("horizons", {})["status"] == "unavailable"


def test_horizons_body_is_an_allowlist():
    with pytest.raises(nasa_hub.HubError):
        nasa_hub.validate("horizons", {"body": "'; DROP"})
    assert nasa_hub.validate("horizons", {"body": "venus"})["body"] == "venus"


def test_dsn_xml_parse_marks_mars_and_skips_unknown(monkeypatch):
    import xml.etree.ElementTree as ET
    monkeypatch.setattr(nasa_hub, "_http_get_xml", lambda url, timeout=9.0: ET.fromstring(DSN_XML))
    r = make().fetch("dsn", {})
    names = [x["name"] for x in r["series"]]
    assert r["status"] == "live" and names == ["MRO", "VGR1"]               # Mars craft first, unknown (-1) dropped, duplicate MRO kept once
    assert r["series"][0]["mars"] is True and r["series"][0]["rtlt_min"] == 22.875


def test_xml_getter_refuses_entities_and_foreign_hosts(monkeypatch):
    class R:
        def __init__(self, b): self.b = b
        def read(self, n): return self.b[:n]
        def __enter__(self): return self
        def __exit__(self, *a): return False
    class O:
        def __init__(self, b): self.b = b
        def open(self, req, timeout=0): return R(self.b)
    bomb = b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><x>&a;</x>'
    monkeypatch.setattr(nasa_hub.urllib.request, "build_opener", lambda *h: O(bomb))
    with pytest.raises(ValueError):
        nasa_hub._http_get_xml("https://eyes.nasa.gov/dsn/data/dsn.xml")
    with pytest.raises(ValueError):
        nasa_hub._http_get_xml("https://evil.example/x.xml")
    with pytest.raises(ValueError):
        nasa_hub._http_get_xml("http://eyes.nasa.gov/dsn/data/dsn.xml")


def test_donki_uses_ccmc_first_and_old_address_as_fallback(monkeypatch):
    seen = []
    def get(url, timeout=9.0):
        seen.append(url)
        if url.startswith("https://ccmc."):
            raise urllib.error.HTTPError(url, 503, "down", {}, None)
        return [{"flrID": "2026-10-08T15:29:00-FLR-001", "classType": "M6.7", "peakTime": "2026-10-08T15:29Z", "link": "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/FLR/1/-1"}]
    monkeypatch.setattr(nasa_hub, "_http_get", get)
    r = make().fetch("donki", {"type": "FLR", "days": "5"})
    assert r["status"] == "live" and r["items"][0]["tag"] == "M6.7"
    assert seen[0].startswith("https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR?") and "api_key" not in seen[0]
    assert seen[1].startswith("https://api.nasa.gov/DONKI/FLR") and "api_key=" in seen[1]
    assert r["source_url"].startswith("https://api.nasa.gov/")


def test_new_hosts_and_platform_map():
    for h in ("ssd.jpl.nasa.gov", "eyes.nasa.gov", "ccmc.gsfc.nasa.gov"):
        assert h in nasa_hub.ALLOWED_HOSTS
    cat = nasa_hub.catalog(False, True)
    assert [p["id"] for p in cat["platforms"]] == ["open_data", "api_portal", "earthdata", "jpl"]
    used = [a for p in cat["platforms"] for a in p["apis"]]
    assert sorted(used) == sorted(nasa_hub.REGISTRY)                     # every API belongs to exactly one NASA platform
    assert all(p["url"].startswith("https://") and p["url"].split("/")[2].endswith("nasa.gov") for p in cat["platforms"])


def test_mars_link_endpoint_merges_live_and_falls_back(monkeypatch, tmp_path):
    monkeypatch.setenv("VIGIL_CACHE_DIR", str(tmp_path))
    fake(monkeypatch, HORIZONS_JSON)
    c = TestClient(create_app())
    r = c.get("/api/mars-link").json()
    assert r["status"] == "live" and r["one_way_min"] == 9.843 and r["round_trip_min"] == 19.686 and r["distance_mkm"] == 177.0
    assert r["range_min"] == {"near": 3.04, "far": 22.29} and r["far_round_trip_min"] == 44.58
    monkeypatch.setenv("VIGIL_OFFLINE", "1"); monkeypatch.setenv("VIGIL_CACHE_DIR", str(tmp_path / "empty"))
    off = TestClient(create_app()).get("/api/mars-link").json()
    assert off["status"] == "computed" and off["one_way_min"] > 0 and off["far_round_trip_min"] == 44.58   # the page still has numbers, labelled as an estimate
