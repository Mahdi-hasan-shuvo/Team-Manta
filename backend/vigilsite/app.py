"""FastAPI app for the Astra Vigil 2.0 showcase website.

Serves the static frontend and a small JSON API. The API calls the real detector
(`compute/detect.py`) for every demo. No CDN, no tracking. The only outbound calls are the NASA API hub
requests a visitor asks for, made by the server to an allowlist of NASA hosts (VIGIL_OFFLINE=1 turns them off).
"""
from __future__ import annotations

import json
import time
from collections import defaultdict, deque
from functools import lru_cache
from typing import Any, Deque, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__, mission, nasa_hub, sim
from .compute.detect import SIGNALS
from .config import Settings

LANGS = ("en", "bn")

CSP = ("default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
       "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; "
       "form-action 'self'; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'")


class PlaygroundIn(BaseModel):
    signal: Literal["hr", "hrv", "spo2", "sleep_h", "core_temp", "exercise_min"] = "hrv"
    shift_sd: float = Field(3.0, ge=0.0, le=6.0)
    duration: int = Field(2, ge=1, le=30)
    mode: Literal["step", "ramp"] = "step"
    seed: int = Field(7, ge=0, le=99999)


class AuditEntry(BaseModel):
    i: int = Field(ge=0, le=50)
    ts: str = Field(max_length=40)
    actor: str = Field(max_length=40)
    action: str = Field(max_length=60)
    detail: str = Field(max_length=400)
    prev_hash: str = Field(max_length=64)
    hash: str = Field(max_length=64)


class AuditIn(BaseModel):
    entries: List[AuditEntry] = Field(min_length=1, max_length=20)


class Limiter:
    """Tiny in-memory per-client limiter so the CPU-heavy demos cannot be hammered."""

    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self.hits: Dict[str, Deque[float]] = defaultdict(deque)

    def ok(self, key: str) -> bool:
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= self.per_minute:
            return False
        q.append(now)
        return True


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    st = settings or Settings()
    app = FastAPI(title="Astra Vigil 2.0 site", version=__version__,
                  docs_url=None, redoc_url=None, openapi_url=None)  # Swagger UI loads from a CDN
    limiter = Limiter(st.rate_per_minute)

    @lru_cache(maxsize=4)
    def load_content(lang: str) -> dict:
        with open(st.content_dir / f"{lang}.json", encoding="utf-8") as f:
            return json.load(f)

    @lru_cache(maxsize=1)
    def load_nasa() -> dict:
        with open(st.data_dir / "evidence_cache.json", encoding="utf-8") as f:
            raw = json.load(f)
        recs = []
        for r in raw["records"]:
            kind = ("osdr" if r["id"].startswith("OSD-") else
                    "ntrs" if r["id"].startswith("NTRS-") else "paper")
            recs.append({**r, "kind": kind})
        used: Dict[str, List[dict]] = {}
        for key, items in raw["mappings"].items():
            for it in items:
                used.setdefault(it["id"], []).append({"signal_direction": key, "relevance": it["relevance"]})
        for r in recs:
            r["used_for"] = used.get(r["id"], [])
        return {"meta": raw["meta"], "records": recs, "mappings": raw["mappings"]}

    @lru_cache(maxsize=1)
    def load_videos() -> dict:
        with open(st.data_dir / "videos.json", encoding="utf-8") as f:
            return json.load(f)

    @lru_cache(maxsize=1)
    def load_datasets() -> dict:
        """One flat, exportable list of every dataset and source the project touches."""
        nasa = load_nasa()
        with open(st.data_dir / "datasets_extra.json", encoding="utf-8") as f:
            extra = json.load(f)
        items: List[dict] = []
        for r in nasa["records"]:
            kind = r["kind"]
            provider = {"osdr": "NASA OSDR", "ntrs": "NASA NTRS"}.get(kind, "Journal / PubMed Central")
            items.append({
                "id": r["id"], "kind": kind, "title": r["title"], "provider": provider,
                "date": r.get("release_date") or r.get("date") or "",
                "mission": r.get("mission", ""), "organism": r.get("organism", ""),
                "status": "cached offline" if kind != "paper" else "citation (open link to confirm)",
                "url": r.get("url", ""), "summary": r.get("summary", ""),
                "used_for": [f"{u['signal_direction']} ({u['relevance']})" for u in r["used_for"]],
            })
        for r in extra["items"]:
            items.append({"mission": "", "organism": "", **r})
        counts: Dict[str, int] = {}
        for it in items:
            counts[it["kind"]] = counts.get(it["kind"], 0) + 1
        return {"meta": {"retrieved": nasa["meta"]["retrieved"], "note": nasa["meta"]["description"]},
                "counts": {"total": len(items), **counts}, "items": items}

    @lru_cache(maxsize=1)
    def load_validation() -> dict:
        with open(st.data_dir / "validation.json", encoding="utf-8") as f:
            return json.load(f)

    hub = nasa_hub.Hub(st.offline, st.nasa_api_key, st.hub_cache_dir, lambda: load_nasa()["records"])

    @app.middleware("http")
    async def headers(request: Request, call_next):
        if request.url.path.startswith("/api/") and request.url.path not in ("/api/health", "/api/content/en", "/api/content/bn"):
            ip = request.client.host if request.client else "?"
            if not limiter.ok(ip):
                return JSONResponse({"detail": "Too many requests. Wait a minute and try again."},
                                    status_code=429, headers={"Retry-After": "30"})
        resp = await call_next(request)
        resp.headers["Content-Security-Policy"] = CSP
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Permissions-Policy"] = ("camera=(), microphone=(), geolocation=(), autoplay=(self \"https://www.youtube-nocookie.com\"), "
                                              "accelerometer=(self), gyroscope=(self), "
                                              "magnetometer=(self), fullscreen=(self), xr-spatial-tracking=(self)")
        if request.url.path.startswith("/api/"):
            resp.headers.setdefault("Cache-Control", "no-store")
        return resp

    # ------------------------------------------------------------------ API
    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True, "version": __version__, "simulated": True, "langs": list(LANGS)}

    @app.get("/api/content/{lang}")
    def content(lang: str) -> JSONResponse:
        if lang not in LANGS:
            raise HTTPException(404, "Unknown language. Use en or bn.")
        return JSONResponse(load_content(lang), headers={"Cache-Control": "no-cache"})

    @app.get("/api/signals")
    def signals() -> dict:
        return {"signals": [{"id": k, **v} for k, v in SIGNALS.items()]}

    @app.get("/api/hero")
    def hero() -> dict:
        return sim.hero_trace()

    @app.post("/api/playground")
    def playground(body: PlaygroundIn) -> dict:
        return sim.playground(body.signal, body.shift_sd, body.duration, body.mode, body.seed)

    @app.get("/api/validation")
    def validation() -> dict:
        return load_validation()

    @app.get("/api/nasa")
    def nasa() -> dict:
        return load_nasa()

    @app.get("/api/datasets")
    def datasets() -> dict:
        return load_datasets()

    @app.get("/api/hub")
    def hub_catalog() -> dict:
        return nasa_hub.catalog(st.offline, st.nasa_api_key == "DEMO_KEY")

    @app.get("/api/hub/{api_id}")
    def hub_fetch(api_id: str, request: Request) -> dict:
        try:
            return hub.fetch(api_id, dict(request.query_params))
        except nasa_hub.HubError as e:
            raise HTTPException(status_code=422, detail=str(e))

    @app.get("/api/videos")
    def videos() -> dict:
        return load_videos()

    @app.get("/api/privacy")
    def privacy(role: Literal["crew", "medical", "commander", "ground"] = "crew",
                day: int = 251, consent: bool = True, owlt_min: float = 12.51) -> dict:
        if not 20 <= day <= 599:
            raise HTTPException(422, "day must be between 20 and 599")
        if not 0 < owlt_min <= 45:
            raise HTTPException(422, "owlt_min must be between 0 and 45")
        return sim.privacy_view(role, day, consent, owlt_min)

    @app.get("/api/link")
    def link(owlt_min: float = 12.51, accel: float = 60.0) -> dict:
        if not 0 < owlt_min <= 45:
            raise HTTPException(422, "owlt_min must be between 0 and 45")
        if not 1 <= accel <= 600:
            raise HTTPException(422, "accel must be between 1 and 600")
        return sim.link_model(owlt_min, accel)

    @app.post("/api/link/check")
    async def link_check(request: Request) -> dict:
        raw = await request.body()
        if len(raw) > 4000:
            raise HTTPException(413, "Payload too large for this demo (4 kB max).")
        try:
            payload = json.loads(raw or b"null")
        except ValueError:
            return {"accepted": False, "problems": ["not valid JSON"]}
        return sim.validate_outbox_payload(payload)

    @app.get("/api/mars-link")
    def mars_link() -> dict:
        """Real Earth-Mars light time from NASA/JPL Horizons (server-side call; falls back to the fixed NASA DTN range)."""
        try:
            res = hub.fetch("horizons", {"body": "mars", "days": "3"})
        except nasa_hub.HubError:
            res = None
        return mission.mars_link(res)

    @app.get("/api/crew/timeline")
    def crew_timeline() -> dict:
        return mission.crew_timeline()

    @app.get("/api/crew/day")
    def crew_day(day: int = 251, own: Optional[str] = None) -> dict:
        if not 0 <= day <= 599:
            raise HTTPException(422, "day must be between 0 and 599")
        if own is not None and own not in {c["id"] for c in mission.crew_timeline()["crew"]}:
            raise HTTPException(422, "unknown crew id")
        return mission.crew_day(day, own)

    @app.get("/api/compare")
    def compare(owlt_min: float = 22.29, review_days: int = mission.REVIEW_DAYS_DEFAULT, crew: str = "niloy") -> dict:
        if not 0 < owlt_min <= 45:
            raise HTTPException(422, "owlt_min must be between 0 and 45")
        if not 1 <= review_days <= 30:
            raise HTTPException(422, "review_days must be between 1 and 30")
        if crew != "niloy":
            raise HTTPException(422, "only the planted event of niloy is scored in this demo")
        return mission.compare(owlt_min, review_days, crew)

    @app.get("/api/audit/demo")
    def audit_demo() -> dict:
        return {"entries": sim.audit_demo()}

    @app.post("/api/audit/verify")
    def audit_verify(body: AuditIn) -> dict:
        return sim.audit_verify([e.model_dump() for e in body.entries])

    # ------------------------------------------------------------- frontend
    index = st.frontend_dir / "index.html"

    @app.get("/")
    def root() -> FileResponse:
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    app.mount("/", StaticFiles(directory=st.frontend_dir), name="frontend")
    return app
