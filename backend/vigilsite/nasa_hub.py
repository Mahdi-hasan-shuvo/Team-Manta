"""NASA health-related API hub.

The browser never talks to NASA. The backend does, and only on request:
  * a fixed allowlist of NASA hosts, https only, no cross-host redirects, small size cap, short timeout;
  * every parameter is validated against a spec (type, range, choices) before a URL is built;
  * the NASA api.nasa.gov key comes from NASA_API_KEY (default DEMO_KEY) and is never sent to the browser;
  * results are normalised to one small shape, cached in memory, and the last good copy is kept on disk so a
    later offline demo can still show it (clearly labelled "cached");
  * when a host cannot be reached the answer says so. Nothing is invented.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

ALLOWED_HOSTS = {
    "osdr.nasa.gov", "visualization.osdr.nasa.gov", "ntrs.nasa.gov", "api.nasa.gov",
    "eonet.gsfc.nasa.gov", "cmr.earthdata.nasa.gov", "power.larc.nasa.gov", "images-api.nasa.gov",
    "ssd.jpl.nasa.gov",           # JPL Horizons: real Earth-Mars distance and light time
    "eyes.nasa.gov",              # Deep Space Network "DSN Now" live feed: round-trip light time of real spacecraft
    "ccmc.gsfc.nasa.gov",         # DONKI's current address (no key, since 30 Sep 2026); api.nasa.gov/DONKI is the fallback
}
MAX_BYTES = 2_000_000
TIMEOUT_S = 9.0
TTL_S = 600
UA = "AstraVigil-showcase/2.0 (NASA Space Apps Challenge 2026 educational project)"

DONKI_TYPES = ["notifications", "FLR", "SEP", "GST", "CME", "IPS", "RBE", "HSS", "MPC"]
HORIZONS_BODIES = {"mars": "499", "venus": "299", "jupiter": "599", "moon": "301", "mercury": "199"}
C_KM_S = 299792.458
AU_KM = 149597870.7
MARS_SPACECRAFT = {"MRO", "MVN", "MAVEN", "ODY", "MSL", "M20", "MEX", "TGO", "EMM", "MOM", "TIANWEN-1", "MARS"}
_MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
EONET_CATEGORIES = ["wildfires", "volcanoes", "dustHaze", "severeStorms", "floods", "drought", "tempExtremes", "landslides"]
TERM_OK = re.compile(r"[^\w\s\-.,'+]", re.UNICODE)


class HubError(Exception):
    """A problem with the request itself (bad parameter). Mapped to HTTP 422."""


# ---------------------------------------------------------------- parameter specs
def _p_str(name: str, default: str, maxlen: int = 80) -> dict:
    return {"name": name, "type": "text", "default": default, "max": maxlen}


def _p_int(name: str, default: int, lo: int, hi: int) -> dict:
    return {"name": name, "type": "int", "default": default, "min": lo, "max": hi}


def _p_num(name: str, default: float, lo: float, hi: float) -> dict:
    return {"name": name, "type": "num", "default": default, "min": lo, "max": hi}


def _p_enum(name: str, default: str, choices: List[str]) -> dict:
    return {"name": name, "type": "enum", "default": default, "choices": choices}


# ---------------------------------------------------------------- parsers (raw JSON -> items)
def _clip(s: Any, n: int = 200) -> str:
    s = "" if s is None else str(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def _item(title: Any, subtitle: Any = "", when: Any = "", url: str = "", tag: Any = "") -> dict:
    return {"title": _clip(title, 220), "subtitle": _clip(subtitle, 260), "date": _clip(when, 40), "url": url if url.startswith("https://") else "", "tag": _clip(tag, 60)}


def _total(v: Any) -> Optional[int]:
    if isinstance(v, dict):
        v = v.get("value")
    return v if isinstance(v, int) else None


def parse_osdr_search(d: dict, _p: dict) -> dict:
    hits = (d.get("hits") or {})
    out = []
    for h in (hits.get("hits") or []):
        s = h.get("_source") or {}
        acc = s.get("Accession") or h.get("_id") or ""
        org = s.get("organism")
        org = ", ".join(org) if isinstance(org, list) else org
        mission = (s.get("Mission") or {}).get("Name") if isinstance(s.get("Mission"), dict) else s.get("Mission")
        out.append(_item(s.get("Study Title") or acc, f"{acc} · {s.get('Flight Program') or mission or 'OSDR study'}",
                         s.get("Study Public Release Date") or "", f"https://osdr.nasa.gov/bio/repo/data/studies/{acc}" if re.fullmatch(r"OSD-\d{1,5}", str(acc)) else "", org or ""))
    return {"total": _total(hits.get("total")), "items": out}


def parse_osdr_meta(d: dict, p: dict) -> dict:
    node = d.get(p["accession"]) if isinstance(d.get(p["accession"]), dict) else d
    meta = node.get("metadata") if isinstance(node, dict) and isinstance(node.get("metadata"), dict) else (node if isinstance(node, dict) else {})
    keys = ["study title", "study description", "organism", "material type", "mission", "flight program", "project title",
            "study factor name", "study assay measurement type", "study assay technology type", "study public release date"]
    out = []
    for k in keys:
        v = meta.get(k)
        if v in (None, "", [], {}):
            continue
        v = ", ".join(map(str, v)) if isinstance(v, list) else v
        out.append(_item(k.capitalize(), v, "", f"https://osdr.nasa.gov/bio/repo/data/studies/{p['accession']}", ""))
    return {"total": len(out), "items": out}


def parse_ntrs(d: dict, _p: dict) -> dict:
    out = []
    for r in (d.get("results") or []):
        cats = r.get("subjectCategories") or []
        pub = ""
        pubs = r.get("publications") or []
        if pubs and isinstance(pubs[0], dict):
            pub = pubs[0].get("publicationDate") or ""
        out.append(_item(r.get("title"), r.get("abstract") or "", (pub or r.get("created") or "")[:10], f"https://ntrs.nasa.gov/citations/{r.get('id')}" if r.get("id") else "", cats[0] if cats else ""))
    return {"total": _total((d.get("stats") or {}).get("total")), "items": out}


def parse_donki(d: Any, p: dict) -> dict:
    if not isinstance(d, list):
        return {"total": 0, "items": []}
    t = p["type"]
    out = []
    for e in d:
        if not isinstance(e, dict):
            continue
        link = e.get("link") or e.get("messageURL") or ""
        if t == "notifications":
            body = (e.get("messageBody") or "").replace("##", " ")
            out.append(_item(f"{e.get('messageType', 'Notification')} {e.get('messageID', '')}", body, e.get("messageIssueTime"), link, e.get("messageType")))
        elif t == "FLR":
            out.append(_item(f"Solar flare {e.get('classType', '')}", f"{e.get('flrID', '')} · region {e.get('activeRegionNum') or '?'} · {e.get('sourceLocation') or ''}", e.get("peakTime") or e.get("beginTime"), link, e.get("classType")))
        elif t == "SEP":
            inst = ", ".join(i.get("displayName", "") for i in (e.get("instruments") or []) if isinstance(i, dict))
            out.append(_item("Solar energetic particle event", f"{e.get('sepID', '')} · {inst}", e.get("eventTime"), link, "SEP"))
        elif t == "GST":
            kps = [k.get("kpIndex") for k in (e.get("allKpIndex") or []) if isinstance(k, dict) and isinstance(k.get("kpIndex"), (int, float))]
            out.append(_item(f"Geomagnetic storm, peak Kp {max(kps) if kps else '?'}", e.get("gstID", ""), e.get("startTime"), link, "GST"))
        elif t == "CME":
            out.append(_item("Coronal mass ejection", f"{e.get('activityID', '')} · {e.get('sourceLocation') or ''} · {e.get('note') or ''}", e.get("startTime"), link, "CME"))
        else:
            key = next((k for k in e if k.lower().endswith("id")), "")
            out.append(_item(f"{t} event", f"{e.get(key, '')} {e.get('location') or ''}".strip(), e.get("eventTime") or e.get("startTime"), link, t))
    out.sort(key=lambda i: i["date"], reverse=True)
    return {"total": len(out), "items": out[:40]}


def parse_eonet(d: dict, _p: dict) -> dict:
    out = []
    for e in (d.get("events") or []):
        cats = ", ".join(c.get("title", "") for c in (e.get("categories") or []) if isinstance(c, dict))
        geo = (e.get("geometry") or [])
        when = geo[-1].get("date", "") if geo and isinstance(geo[-1], dict) else ""
        src = (e.get("sources") or [{}])[0].get("url") if e.get("sources") else ""
        out.append(_item(e.get("title"), cats, when[:10], e.get("link") or src or "", "open" if not e.get("closed") else "closed"))
    return {"total": len(out), "items": out}


def parse_cmr(d: dict, _p: dict) -> dict:
    out = []
    for e in ((d.get("feed") or {}).get("entry") or []):
        cid = e.get("id", "")
        out.append(_item(e.get("title"), e.get("summary"), (e.get("time_start") or "")[:10], f"https://cmr.earthdata.nasa.gov/search/concepts/{cid}.html" if re.fullmatch(r"C\d+-[A-Z0-9_]+", cid) else "", e.get("data_center")))
    return {"total": None, "items": out}


def parse_power(d: dict, p: dict) -> dict:
    par = ((d.get("properties") or {}).get("parameter") or {})
    t2m, rh = par.get("T2M") or {}, par.get("RH2M") or {}
    out = []
    for day in sorted(set(t2m) | set(rh), reverse=True):
        a, b = t2m.get(day), rh.get(day)
        if (a is None or a <= -900) and (b is None or b <= -900):
            continue
        txt = []
        if a is not None and a > -900:
            txt.append(f"{a:.1f} °C")
        if b is not None and b > -900:
            txt.append(f"{b:.0f} % RH")
        out.append(_item(" · ".join(txt), f"lat {p['lat']:.2f}, lon {p['lon']:.2f}", f"{day[:4]}-{day[4:6]}-{day[6:8]}", "https://power.larc.nasa.gov/", "2 m air"))
    return {"total": len(out), "items": out}


def parse_images(d: dict, _p: dict) -> dict:
    out = []
    col = d.get("collection") or {}
    for it in (col.get("items") or []):
        data = (it.get("data") or [{}])[0]
        nid = data.get("nasa_id") or ""
        out.append(_item(data.get("title"), data.get("description"), (data.get("date_created") or "")[:10], f"https://images.nasa.gov/details/{urllib.parse.quote(nid)}" if nid else "", data.get("media_type")))
    return {"total": _total((col.get("metadata") or {}).get("total_hits")), "items": out}


def _hz_date(cell: str) -> str:
    """'2026-Nov-13 00:00' -> '2026-11-13'. Anything else is returned as given."""
    m = re.match(r"\s*(\d{4})-([A-Za-z]{3})-(\d{2})", cell or "")
    if not m or m.group(2).title() not in _MONTHS:
        return (cell or "").strip()
    return f"{m.group(1)}-{_MONTHS[m.group(2).title()]:02d}-{m.group(3)}"


def parse_horizons(d: Any, p: dict) -> dict:
    """JPL Horizons observer table (CSV, quantities 20 and 21): range in AU, range-rate in km/s, one-way light time in minutes.
    The columns that follow the date can carry empty marker cells, so the numbers are read from the right-hand end of each row."""
    text = d.get("result") if isinstance(d, dict) else None
    if not isinstance(text, str) or "$$SOE" not in text or "$$EOE" not in text:
        raise ValueError("no ephemeris in the response")
    block = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    series, items = [], []
    for line in block.splitlines():
        cells = [c.strip() for c in line.split(",")]
        if len(cells) < 4:
            continue
        nums = []
        for c in cells[1:]:
            try:
                nums.append(float(c))
            except ValueError:
                pass
        if len(nums) < 2:
            continue
        au = nums[-3] if len(nums) >= 3 else nums[-2]
        lt = nums[-1] if len(nums) >= 3 else au * AU_KM / C_KM_S / 60.0
        if not (0 < au < 100) or not (0 < lt < 1000):
            continue
        row = {"date": _hz_date(cells[0]), "au": round(au, 6), "km": round(au * AU_KM), "one_way_min": round(lt, 3), "round_trip_min": round(2 * lt, 3)}
        series.append(row)
        items.append(_item(f"{p['body'].title()}: {row['one_way_min']:.2f} min one way ({row['round_trip_min']:.2f} min round trip)",
                           f"{au:.4f} AU = {row['km'] / 1e6:.1f} million km from Earth's centre", row["date"],
                           "https://ssd.jpl.nasa.gov/horizons/app.html", "light time"))
    if not series:
        raise ValueError("ephemeris was empty")
    return {"total": len(series), "items": items, "series": series}


def parse_dsn(root: Any, _p: dict) -> dict:
    """DSN Now feed: every <target> a dish is tracking carries range (km) and round-trip light time (s); -1 means unknown."""
    seen: Dict[str, dict] = {}
    for dish in root.iter("dish"):
        for tg in dish.iter("target"):
            name = (tg.get("name") or "").strip()
            try:
                rtlt = float(tg.get("rtlt", "-1"))
                rng = float(tg.get("downlegRange", "-1"))
            except ValueError:
                continue
            if not name or rtlt <= 0 or rng <= 0 or name in seen:
                continue
            seen[name] = {"name": name[:24], "dish": (dish.get("name") or "")[:12], "distance_km": round(rng), "rtlt_s": round(rtlt, 1),
                          "rtlt_min": round(rtlt / 60.0, 3), "mars": name.upper() in MARS_SPACECRAFT}
    rows = sorted(seen.values(), key=lambda r: (not r["mars"], r["distance_km"]))[:40]
    items = [_item(f"{r['name']}: round trip {r['rtlt_min']:.2f} min", f"{r['distance_km'] / 1e6:.2f} million km · dish {r['dish']}", "", "https://eyes.nasa.gov/apps/dsn-now/dsn.html", "Mars" if r["mars"] else "")
             for r in rows]
    return {"total": len(rows), "items": items, "series": rows}


# ---------------------------------------------------------------- registry
def _today() -> date:
    return datetime.now(timezone.utc).date()


def _build_osdr_search(p: dict, key: str) -> str:
    return "https://osdr.nasa.gov/osdr/data/search?" + urllib.parse.urlencode({"term": p["term"], "from": 0, "size": p["size"]})


def _build_osdr_meta(p: dict, key: str) -> str:
    return f"https://visualization.osdr.nasa.gov/biodata/api/v2/dataset/{p['accession']}/"


def _build_ntrs(p: dict, key: str) -> str:
    return "https://ntrs.nasa.gov/api/citations/search?" + urllib.parse.urlencode({"q": p["term"], "page.size": p["size"], "page.from": 0})


def _build_donki_legacy(p: dict, key: str) -> str:
    """Old api.nasa.gov/DONKI address. Public reports (Oct 2026) say it now answers 301 to the CCMC notice, so it is only the fallback."""
    end = _today(); start = end - timedelta(days=p["days"])
    q = {"startDate": start.isoformat(), "endDate": end.isoformat(), "api_key": key}
    if p["type"] == "notifications":
        q["type"] = "all"
    return f"https://api.nasa.gov/DONKI/{p['type']}?" + urllib.parse.urlencode(q)


def _build_eonet(p: dict, key: str) -> str:
    return "https://eonet.gsfc.nasa.gov/api/v3/events?" + urllib.parse.urlencode({"status": "open", "limit": p["size"], "category": p["category"]})


def _build_cmr(p: dict, key: str) -> str:
    return "https://cmr.earthdata.nasa.gov/search/collections.json?" + urllib.parse.urlencode({"keyword": p["term"], "page_size": p["size"]})


def _build_power(p: dict, key: str) -> str:
    end = _today() - timedelta(days=3); start = end - timedelta(days=p["days"] - 1)
    return "https://power.larc.nasa.gov/api/temporal/daily/point?" + urllib.parse.urlencode({
        "parameters": "T2M,RH2M", "community": "SB", "longitude": f"{p['lon']:.4f}", "latitude": f"{p['lat']:.4f}",
        "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d"), "format": "JSON"})


def _build_images(p: dict, key: str) -> str:
    return "https://images-api.nasa.gov/search?" + urllib.parse.urlencode({"q": p["term"], "media_type": "image,video", "page_size": p["size"]})


def _build_donki(p: dict, key: str) -> str:
    """DONKI's current, keyless address: CCMC says the API is served at ccmc.gsfc.nasa.gov/DONKI-API/get/ since 30 Sep 2026. Same event names and parameters."""
    end = _today(); start = end - timedelta(days=p["days"])
    q = {"startDate": start.isoformat(), "endDate": end.isoformat()}
    if p["type"] == "notifications":
        q["type"] = "all"
    return f"https://ccmc.gsfc.nasa.gov/DONKI-API/get/{p['type']}?" + urllib.parse.urlencode(q)


def _build_horizons(p: dict, key: str) -> str:
    start = _today(); stop = start + timedelta(days=p["days"])
    q = {"format": "json", "COMMAND": f"'{HORIZONS_BODIES[p['body']]}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'OBSERVER'",
         "CENTER": "'500@399'", "START_TIME": f"'{start.isoformat()}'", "STOP_TIME": f"'{stop.isoformat()}'", "STEP_SIZE": "'1 d'",
         "QUANTITIES": "'20,21'", "CSV_FORMAT": "'YES'"}
    return "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q)


def _build_dsn(p: dict, key: str) -> str:
    return "https://eyes.nasa.gov/dsn/data/dsn.xml"


REGISTRY: Dict[str, dict] = {
    "osdr_search": {"category": "biology", "host": "osdr.nasa.gov", "key": False, "docs": "https://www.nasa.gov/osdr-api",
                    "params": [_p_str("term", "astronaut blood"), _p_int("size", 8, 1, 20)], "build": _build_osdr_search, "parse": parse_osdr_search, "cache_kind": "OSDR"},
    "osdr_meta": {"category": "biology", "host": "visualization.osdr.nasa.gov", "key": False, "docs": "https://visualization.osdr.nasa.gov/biodata/api/",
                  "params": [{"name": "accession", "type": "text", "default": "OSD-569", "max": 10, "pattern": r"OSD-\d{1,5}"}], "build": _build_osdr_meta, "parse": parse_osdr_meta, "cache_kind": "OSDR"},
    "ntrs": {"category": "literature", "host": "ntrs.nasa.gov", "key": False, "docs": "https://ntrs.nasa.gov/api/openapi/",
             "params": [_p_str("term", "spaceflight associated neuro-ocular syndrome"), _p_int("size", 8, 1, 20)], "build": _build_ntrs, "parse": parse_ntrs, "cache_kind": "NTRS"},
    "donki": {"category": "radiation", "host": "ccmc.gsfc.nasa.gov", "key": False, "docs": "https://ccmc.gsfc.nasa.gov/tools/DONKI/",
              "params": [_p_enum("type", "SEP", DONKI_TYPES), _p_int("days", 30, 1, 30)], "build": _build_donki, "alts": [_build_donki_legacy], "parse": parse_donki},
    "eonet": {"category": "earth", "host": "eonet.gsfc.nasa.gov", "key": False, "docs": "https://eonet.gsfc.nasa.gov/docs/v3",
              "params": [_p_enum("category", "wildfires", EONET_CATEGORIES), _p_int("size", 10, 1, 25)], "build": _build_eonet, "parse": parse_eonet},
    "cmr": {"category": "earth", "host": "cmr.earthdata.nasa.gov", "key": False, "docs": "https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html",
            "params": [_p_str("term", "TEMPO nitrogen dioxide air quality"), _p_int("size", 8, 1, 20)], "build": _build_cmr, "parse": parse_cmr},
    "power": {"category": "earth", "host": "power.larc.nasa.gov", "key": False, "docs": "https://power.larc.nasa.gov/docs/",
              "params": [_p_num("lat", 29.55, -90, 90), _p_num("lon", -95.09, -180, 180), _p_int("days", 7, 3, 31)], "build": _build_power, "parse": parse_power},
    "horizons": {"category": "link", "host": "ssd.jpl.nasa.gov", "key": False, "docs": "https://ssd-api.jpl.nasa.gov/doc/horizons.html",
                 "params": [_p_enum("body", "mars", list(HORIZONS_BODIES)), _p_int("days", 3, 1, 30)], "build": _build_horizons, "parse": parse_horizons},
    "dsn": {"category": "link", "host": "eyes.nasa.gov", "key": False, "docs": "https://eyes.nasa.gov/apps/dsn-now/dsn.html", "xml": True,
            "params": [], "build": _build_dsn, "parse": parse_dsn},
    "images": {"category": "media", "host": "images-api.nasa.gov", "key": False, "docs": "https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf",
               "params": [_p_str("term", "astronaut health exercise"), _p_int("size", 8, 1, 20)], "build": _build_images, "parse": parse_images},
}


# The four public NASA platforms the team was pointed to, and which of our APIs come from each (no special Space Apps key is needed).
PLATFORMS = [
    {"id": "open_data", "url": "https://data.nasa.gov", "apis": ["osdr_search", "osdr_meta", "ntrs"]},
    {"id": "api_portal", "url": "https://api.nasa.gov", "apis": ["donki", "images"]},
    {"id": "earthdata", "url": "https://earthdata.nasa.gov", "apis": ["cmr", "power", "eonet"]},
    {"id": "jpl", "url": "https://www.jpl.nasa.gov", "apis": ["horizons", "dsn"]},
]


def catalog(offline: bool, key_is_demo: bool) -> dict:
    apis = []
    for aid, r in REGISTRY.items():
        apis.append({"id": aid, "category": r["category"], "host": r["host"], "needs_key": r["key"], "docs": r["docs"],
                     "params": [{k: v for k, v in p.items() if k != "pattern"} for p in r["params"]]})
    return {"offline": offline, "key": "demo" if key_is_demo else "custom", "apis": apis, "platforms": PLATFORMS,
            "note": "Requests go from this server to NASA, only when you press Fetch. The browser never contacts NASA."}


def validate(aid: str, raw: Dict[str, str]) -> dict:
    spec = REGISTRY.get(aid)
    if not spec:
        raise HubError("unknown api")
    out: Dict[str, Any] = {}
    for p in spec["params"]:
        v = raw.get(p["name"])
        if v is None or v == "":
            out[p["name"]] = p["default"]; continue
        t = p["type"]
        try:
            if t == "int":
                x = int(v)
            elif t == "num":
                x = float(v)
                if x != x or x in (float("inf"), float("-inf")):
                    raise ValueError
            elif t == "enum":
                if v not in p["choices"]:
                    raise ValueError
                x = v
            else:
                x = TERM_OK.sub("", str(v)).strip()[: p["max"]]
                if not x:
                    x = p["default"]
                if p.get("pattern") and not re.fullmatch(p["pattern"], x):
                    raise ValueError
        except ValueError:
            raise HubError(f"bad value for {p['name']}")
        if t in ("int", "num") and not (p["min"] <= x <= p["max"]):
            raise HubError(f"{p['name']} must be between {p['min']} and {p['max']}")
        out[p["name"]] = x
    return out


# ---------------------------------------------------------------- network
class _SameHost(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        host = urllib.parse.urlparse(newurl)
        if host.scheme != "https" or host.hostname not in ALLOWED_HOSTS:
            raise urllib.error.URLError("redirect to a host that is not allowed")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _http_get(url: str, timeout: float = TIMEOUT_S) -> Any:
    """GET a JSON document from an allowlisted NASA host. Raises URLError / HTTPError / ValueError."""
    u = urllib.parse.urlparse(url)
    if u.scheme != "https" or u.hostname not in ALLOWED_HOSTS:
        raise ValueError("host not allowed")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    opener = urllib.request.build_opener(_SameHost)
    with opener.open(req, timeout=timeout) as r:
        raw = r.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("response too large")
    return json.loads(raw.decode("utf-8"))


def _http_get_xml(url: str, timeout: float = TIMEOUT_S) -> Any:
    """GET an XML document from an allowlisted NASA host and return its root element.
    Documents that declare a DTD or entities are refused (entity-expansion attacks); size is capped like the JSON getter."""
    u = urllib.parse.urlparse(url)
    if u.scheme != "https" or u.hostname not in ALLOWED_HOSTS:
        raise ValueError("host not allowed")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/xml, text/xml"})
    opener = urllib.request.build_opener(_SameHost)
    with opener.open(req, timeout=timeout) as r:
        raw = r.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("response too large")
    low = raw[:4096].lower()
    if b"<!doctype" in low or b"<!entity" in raw.lower():
        raise ValueError("DTD or entities not accepted")
    return ET.fromstring(raw)


def mask(url: str) -> str:
    return re.sub(r"(api_key=)[^&]+", r"\1***", url)


class Hub:
    def __init__(self, offline: bool, api_key: str, cache_dir: Optional[Path], bundled: Callable[[], List[dict]]):
        self.offline = offline
        self.api_key = api_key or "DEMO_KEY"
        self.cache_dir = cache_dir
        self.bundled = bundled
        self.mem: Dict[str, tuple] = {}

    # -- cache helpers
    def _ck(self, aid: str, p: dict) -> str:
        return hashlib.sha1((aid + json.dumps(p, sort_keys=True)).encode()).hexdigest()[:16]

    def _disk_get(self, ck: str) -> Optional[dict]:
        if not self.cache_dir:
            return None
        try:
            return json.loads((self.cache_dir / f"{ck}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def _disk_put(self, ck: str, res: dict) -> None:
        if not self.cache_dir:
            return
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            (self.cache_dir / f"{ck}.json").write_text(json.dumps(res), encoding="utf-8")
        except OSError:
            pass

    def _bundled_search(self, spec: dict, p: dict) -> Optional[dict]:
        kind = spec.get("cache_kind")
        if not kind:
            return None
        words = [w for w in re.findall(r"\w+", (p.get("term") or p.get("accession") or "").lower()) if len(w) > 2]
        recs = [r for r in self.bundled() if str(r.get("kind", "")).upper() == kind]
        scored = []
        for r in recs:
            hay = (r.get("title", "") + " " + r.get("summary", "") + " " + r.get("id", "")).lower()
            sc = sum(1 for w in words if w in hay)
            scored.append((sc, r))
        scored.sort(key=lambda x: -x[0])
        pick = [r for sc, r in scored if sc > 0][: p.get("size", 8)] or [r for _sc, r in scored][: p.get("size", 8)]
        if not pick:
            return None
        items = [_item(r.get("title"), f"{r.get('id', '')} · {r.get('mission') or r.get('organism') or ''}", r.get("release_date") or r.get("date") or "", r.get("url", ""), r.get("organism", "")) for r in pick]
        return {"total": len(items), "items": items}

    # -- main entry
    def fetch(self, aid: str, raw: Dict[str, str]) -> dict:
        p = validate(aid, raw)
        spec = REGISTRY[aid]
        ck = self._ck(aid, p)
        now = time.time()
        base = {"api": aid, "params": p, "host": spec["host"], "fetched_at": None, "total": None, "items": [], "source_url": "", "message": ""}
        hit = self.mem.get(ck)
        if hit and now - hit[0] < TTL_S:
            return {**hit[1], "from_memory": True}
        url = spec["build"](p, self.api_key)
        base["source_url"] = mask(url)
        if not self.offline:
            urls = [url] + [alt(p, self.api_key) for alt in spec.get("alts", [])]
            getter = _http_get_xml if spec.get("xml") else _http_get
            why = "unreachable"
            for u in urls:
                try:
                    data = getter(u)
                    parsed = spec["parse"](data, p)
                    res = {**base, "source_url": mask(u), "status": "live", "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), **parsed}
                    self.mem[ck] = (now, res); self._disk_put(ck, res)
                    return res
                except urllib.error.HTTPError as e:
                    why = "rate_limited" if e.code == 429 else ("bad_key" if e.code in (401, 403) else f"http_{e.code}")
                except (urllib.error.URLError, TimeoutError, OSError):
                    why = "unreachable"
                except Exception:  # malformed JSON/XML, odd payloads, protocol errors: report, never crash
                    why = "unexpected_response"
        else:
            why = "offline_mode"
        last = self._disk_get(ck)
        if last and last.get("items"):
            return {**last, "status": "cached", "message": why, "cached_from": "last live fetch"}
        b = self._bundled_search(spec, p)
        if b:
            return {**base, "status": "cached", "message": why, "cached_from": "bundled records", "total": b["total"], "items": b["items"]}
        return {**base, "status": "unavailable", "message": why}
