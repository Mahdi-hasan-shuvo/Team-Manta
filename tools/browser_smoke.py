"""Cross-browser smoke test for the Mission 3D page. Run it where the browser exists (your own computer, ideally with a real GPU):

    pip install playwright && python -m playwright install chromium firefox webkit
    python run.py --port 8080            # in another terminal
    python tools/browser_smoke.py --browser firefox --base http://127.0.0.1:8080
    python tools/browser_smoke.py --browser webkit            # WebKit is the engine behind Safari
    python tools/browser_smoke.py --browser chromium --gpu    # real GPU instead of software WebGL

It opens the page (English), checks that WebGL started, clicks through the five Mission 3D tabs, and reports console errors, failed
or external requests. Screenshots go to ./smoke_<browser>/. Exit code 0 = clean."""
import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

TABS = ["journey", "delay", "crew", "compare", "ship"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--browser", default="chromium", choices=["chromium", "firefox", "webkit"])
    ap.add_argument("--base", default="http://127.0.0.1:8080")
    ap.add_argument("--gpu", action="store_true", help="chromium only: do not force software WebGL")
    a = ap.parse_args()
    out = Path(f"smoke_{a.browser}"); out.mkdir(exist_ok=True)
    errs, bad, ext = [], [], []
    with sync_playwright() as p:
        args = []
        if a.browser == "chromium" and not a.gpu:
            args = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"]
        b = getattr(p, a.browser).launch(args=args)
        pg = b.new_page(viewport={"width": 1280, "height": 900})
        pg.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
        pg.on("response", lambda r: bad.append(f"{r.status} {r.url}") if r.status >= 400 else None)
        pg.on("request", lambda r: ext.append(r.url) if not r.url.startswith(a.base) and not r.url.startswith(("data:", "blob:")) else None)
        pg.goto(a.base + "/", wait_until="domcontentloaded")
        pg.wait_for_selector("#orbit .mtabs", timeout=60000)
        pg.evaluate("document.getElementById('orbit').scrollIntoView()")
        pg.wait_for_timeout(3000)
        gl = pg.evaluate("() => { const c = document.querySelector('#orbit canvas'); return !!c && !!(c.getContext('webgl2') || c.getContext('webgl')); }")
        print("WebGL context on the Mission 3D canvas:", "yes" if gl else "NO (the page should show its fallback text)")
        for t in TABS:
            pg.click(f"#mt-{t}"); pg.wait_for_timeout(2500)
            pg.query_selector("#orbit").screenshot(path=str(out / f"{t}.png"))
        b.close()
    print("ERRORS  ", errs); print("BAD     ", bad); print("EXTERNAL", ext)
    return 0 if gl and not (errs or bad or ext) else 1


if __name__ == "__main__":
    sys.exit(main())
