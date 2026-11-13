"""Settings. The site is local. The only outbound calls are the NASA API hub requests the visitor asks for (set VIGIL_OFFLINE=1 to disable them)."""
from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

PKG = Path(__file__).resolve().parent
ROOT = PKG.parents[1]


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


@dataclass
class Settings:
    frontend_dir: Path = field(default_factory=lambda: Path(_env("SITE_FRONTEND", str(ROOT / "frontend"))))
    content_dir: Path = field(default_factory=lambda: PKG / "content")
    data_dir: Path = field(default_factory=lambda: PKG / "data")
    rate_per_minute: int = int(_env("SITE_RATE_PER_MIN", "90"))
    offline: bool = field(default_factory=lambda: _env("VIGIL_OFFLINE", "0").lower() in ("1", "true", "yes"))
    nasa_api_key: str = field(default_factory=lambda: _env("NASA_API_KEY", "DEMO_KEY"))
    hub_cache_dir: Path = field(default_factory=lambda: Path(_env("VIGIL_CACHE_DIR", str(Path(tempfile.gettempdir()) / "astra-vigil-hub"))))
