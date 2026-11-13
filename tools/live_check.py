"""Live NASA check. Run this ON A MACHINE WITH INTERNET (the build sandbox could not reach NASA):

    python tools/live_check.py            # uses NASA_API_KEY if set, else DEMO_KEY

It calls every API in the hub once with its default parameters, straight through the real hub code (same allowlist, parsers and
limits as the website), and prints live / cached / unavailable for each with the reason. Exit code 0 only if all ten are live.
Nothing is written except the hub's normal cache folder (a temp dir here)."""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from vigilsite import mission, nasa_hub  # noqa: E402


def main() -> int:
    hub = nasa_hub.Hub(offline=False, api_key=os.environ.get("NASA_API_KEY", ""), cache_dir=Path(tempfile.mkdtemp()), bundled=lambda: [])
    bad = 0
    for aid in sorted(nasa_hub.REGISTRY):
        try:
            r = hub.fetch(aid, {})
        except nasa_hub.HubError as e:
            print(f"{aid:12} ERROR  {e}"); bad += 1; continue
        ok = r["status"] == "live"
        bad += 0 if ok else 1
        first = (r["items"][0]["title"] if r.get("items") else "")[:60]
        print(f"{aid:12} {r['status']:11} total={r.get('total')}  {r.get('message') or ''}  {first}")
        print(f"{'':12} {r['source_url']}")
    link = mission.mars_link(hub.fetch("horizons", {"body": "mars", "days": "3"}))
    print(f"\nMars link: status={link['status']} one-way={link['one_way_min']} min on {link['as_of']}  (computed estimate for comparison: "
          f"{mission.computed_earth_mars()['one_way_min']} min)")
    print("\nALL LIVE" if not bad else f"\n{bad} API(s) not live: send me this output and the parser or address will be fixed.")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
