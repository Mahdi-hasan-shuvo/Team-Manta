"""Launcher:  python run.py [--host 127.0.0.1] [--port 8080] [--open]"""
import argparse
import sys
import threading
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))

import uvicorn  # noqa: E402

from vigilsite.app import create_app  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="Astra Vigil 2.0 showcase website (Team MANTA)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8081)
    ap.add_argument("--open", action="store_true", help="open the browser")
    a = ap.parse_args()
    url = f"http://{a.host}:{a.port}"
    print(f"\n  Astra Vigil 2.0 website  ->  {url}\n  Ctrl+C to stop.\n")
    if a.open:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    uvicorn.run(create_app(), host=a.host, port=a.port, log_level="warning")


if __name__ == "__main__":
    main()
