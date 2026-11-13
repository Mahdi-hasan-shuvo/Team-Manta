# Astra Vigil 2.0 - showcase website (Team MANTA)

A bilingual (English / বাংলা), animated showcase site for **Astra Vigil 2.0**, our
NASA Space Apps Challenge 2026 entry (*Health Monitoring Software for Astronauts*).
It has a real backend: every demo on the page calls the same deterministic detector
the console uses. **All data is simulated. Not a medical device. Not endorsed by NASA.**

## Run it

```bash
./start.sh            # Linux / macOS  (creates .venv, installs, opens the browser)
start.bat             # Windows
# or by hand:
pip install -r requirements.txt
python run.py --open  # http://127.0.0.1:8080
```

Needs Python 3.10+. No internet is needed to browse the site: fonts, images, scripts and Three.js are bundled,
and the page makes no outbound requests until you press play on a video (checked in a headless browser).
Two things use the internet, both only on request:
- **Videos**: the YouTube player loads only after you click "Load video from YouTube" (`youtube-nocookie.com`), then starts muted for browser autoplay compatibility; unmute with the player controls.
- **NASA APIs** section: the *server* (never the browser) calls NASA when you press Fetch. Without internet, or with
  `VIGIL_OFFLINE=1`, every answer is labelled *cached* (bundled OSDR / NTRS records) or *unavailable*.

Environment variables: `NASA_API_KEY` (free key from api.nasa.gov; default `DEMO_KEY`, which has a low shared limit and is
needed only for DONKI), `VIGIL_OFFLINE=1` (never call NASA), `VIGIL_CACHE_DIR` (where the last good answer is kept).

The 3D views need WebGL; without it the page falls back to the 2D layout.

### The 3D universe, Solar System explorer and VR

The whole page sits on one fixed 3D canvas. As you scroll the camera flies from the Milky Way, into the Sun's
neighbourhood, through the Solar System, to Earth and then Mars. The **Solar system** section is a full explorer
(Sun, eight planets, the Moon, Saturn's rings, the asteroid belt): pick a body, change the time speed, read NASA
fact-sheet numbers. Ways to look around:

| Mode | Works on | Needs |
|---|---|---|
| Drag / pinch / buttons / arrow keys | PC and phone | WebGL |
| Look around (gyroscope) | phones and tablets | motion sensors (iOS asks permission) |
| Phone VR (Cardboard-style split screen) | phone in a Cardboard-type viewer | landscape, a viewer with lenses |
| Headset VR (WebXR) | Quest browser, other WebXR headsets | HTTPS or `localhost`, a headset |
| Full screen | PC and phone | none |

Sizes and distances are compressed so everything fits. Textures are generated in code (no NASA imagery).
The light theme turns the 3D background off for a plain, high-contrast page.

## What is on the page

| Section | Backend call | What it shows |
|---|---|---|
| Hero | `GET /api/hero` | Real detector output for the simulated commander's HRV, over the 3D Milky Way |
| Problems | content | Five problems: what is built, what is not, where in the code |
| Detector | `GET /api/validation`, `/api/signals` | The 7 steps and the Monte Carlo numbers |
| Playground | `POST /api/playground` | Inject a change into a simulated person; the Python detector decides |
| Architecture | content | Sense / Vigil Core / Act, every box selectable |
| Privacy | `GET /api/privacy`, `/api/audit/demo`, `POST /api/audit/verify` | Four roles, consent, hash-chained audit with a tamper test |
| Earth link | `GET /api/link`, `POST /api/link/check` | Light-time delay model, outbox schema check |
| Solar system | none | Full Solar System explorer with gyroscope, Cardboard and WebXR modes |
| Mission 3D | `GET /api/link`, `/api/mars-link`, `/api/crew/timeline`, `/api/crew/day`, `/api/compare` | One Three.js stage, five views: **Journey** (space station to Mars with the five problems), **44 minutes** (Mars to Earth about 22 min, answer back about 22 min, clock to about 44; optional live JPL Horizons value), **Crew** (the six Team MANTA members, simulated vitals, tier-0 own view), **With / without** (same planted change, real detector vs. no software), **Inside the ship** (sensors, computer, outbox, dish, data flow; each module marked built / bench plan / flight concept) |
| What changed | content | Version history, before / now table, what is still not proven |
| NASA APIs | `GET /api/hub`, `/api/hub/{id}` | 10 NASA APIs via the server, grouped under NASA Open Data / API Portal / Earthdata / JPL: OSDR (2), NTRS, DONKI (+ fallback address), EONET, CMR, POWER, NASA Image Library, **JPL Horizons** (Earth-Mars light time), **Deep Space Network Now**; each answer is *live*, *cached* or *unavailable* |
| Videos | `GET /api/videos` | 2 background videos, click-to-load YouTube player (no request before the click) |
| Datasets | `GET /api/datasets`, `/api/nasa` | 25 listed datasets and sources (22 cached OSDR / NTRS / paper records plus 3 other), search, filter, sort, CSV / JSON export |
| Console, Hardware, Technical, Limits, Team | content | Screenshots, hardware plan, API list, honesty list |

### Mission 3D notes

- Code: `frontend/js/sections/orbit.js` (shell: tabs, shared stage, camera) and `frontend/js/mission/*.js` (one file per view).
  Server models: `backend/vigilsite/mission.py` (crew timeline, with / without comparison, Mars link).
- The crew is the six Team MANTA members (`backend/vigilsite/data/crew.json`, thumbnails in `frontend/img/crew/`).
  Names and photos are real, every vital is simulated. The site and the console both spell "Tushar" and "Mahadi" (pinned by a test); the internal ids and photo files keep the old slugs `tusar` and `mahdi` so nothing breaks.
- The with / without lane uses the real detector on the simulated Niloy HRV event (alert one day after onset). The review interval
  defaults to **14 days**, NASA's ISS Private Psychological Conference interval (NTRS 20170003866). That a change is noticed only
  at the next review, and that a Mars crew keeps the same interval, are still assumptions; the page says so and the slider changes it.
- The journey is drawn as 259 days, the computed Hohmann transfer time (`mission.hohmann_days()`, pinned by a test). The route shape is
  schematic and the distances use the farthest-case light time from NTRS 20160011483, so it is not a flight plan.
- 22 min / 44 min are Mars at its farthest. "Today" comes from JPL Horizons when reachable (fetched on open), else a labelled computed estimate.

## Layout

```
run.py  start.sh  start.bat  requirements.txt
backend/vigilsite/
  app.py            FastAPI app, security headers, rate limit, static files
  nasa_hub.py       NASA API proxy: host allowlist, validation, cache, fallback
  sim.py            hero trace, playground, privacy views, link model, audit chain
  engine.py         mission replay (same as the console)
  compute/          detect.py (rules S and M), guard.py, fixture.py
  content/en.json   all page text, English
  content/bn.json   all page text, Bangla (same structure, tested)
  data/             evidence_cache.json (NASA), crew.json (simulated), validation.json
frontend/           index.html, css/site.css, js/ (ES modules), fonts/, img/
tools/montecarlo.py reproduces the numbers in validation.json
tests/              API, hardening and EN/BN parity tests
```

## Edit the text, add teammates

All visible text lives in `backend/vigilsite/content/en.json` and `bn.json`. The two files must keep
the same shape; `pytest` fails if a key, a list length or a `{placeholder}` differs.
Add teammates under `team.members` in both files.
The Bangla text was written for this project and should be read by a native speaker before you publish.

## Reproduce the numbers

```bash
python tools/montecarlo.py --runs 400 --out backend/vigilsite/data/validation.json
```

The published run (400 runs, seed 5000): chance alerts 18.3 (Rule S) and 5.7 (Rule M) per 1000 crew-days;
a 2-day, 3.5 SD HRV drop caught in 99.8% of runs, on average 1 day after onset; a 3-day, 3.5 SD shift in
three signals caught in 98.0% of runs, on the day it appears. That is this detector on Gaussian noise.
It says nothing yet about real astronauts. Slow drifts are the known weak spot: try **Ramp** in the playground.

## Tests

```bash
pytest -q
```

## Design notes

- Palette: night ink, ice-blue data, one amber "watch lamp" for alerts; a chart-paper light theme.
- Type: Bricolage Grotesque (headings), Instrument Sans (body), Noto Sans Bengali (Bangla). All SIL OFL, bundled.
- The hero is the memorable element: the real detector's trace drawing itself until Rule S fires.
  Everything else stays quiet. Motion respects `prefers-reduced-motion`.
- 3D: Three.js r160 (MIT, `frontend/vendor/`) with procedural shaders. No downloaded textures, no NASA imagery;
  planets are drawn in code, not to scale. 3D pauses off-screen and shows a still frame with reduced motion.
- Security: strict Content-Security-Policy (no inline script or style; the only allowed frame source is
  `youtube-nocookie.com`), input validation with limits on every endpoint, a small per-client rate limit,
  no cookies, no tracking, no outbound calls from the page until a video is played. The Permissions-Policy allows
  motion sensors and WebXR for this site only (camera, microphone and location stay off). NASA calls are made by the server
  to an allowlist of NASA hosts (https, no cross-host redirects, 2 MB cap, 9 s timeout); the API key is never sent to the browser.

## Not verified

- The NASA calls (JPL Horizons, Deep Space Network Now, DONKI) are tested with mocks only; the build sandbox cannot reach NASA.
  What was checked against public documentation instead: the Horizons base URL, quoting and CSV format (ssd-api.jpl.nasa.gov/doc/horizons.html);
  the DSN Now XML shape (station / dish / target with `rtlt`, `downlegRange`, read from the live file at eyes.nasa.gov/dsn/data/dsn.xml);
  and DONKI's move to `ccmc.gsfc.nasa.gov/DONKI-API/get/` on 30 Sep 2026 (reported by a third-party package; the hub now tries CCMC first and
  the old api.nasa.gov address second). The first real press of Fetch on a networked machine is still the true test.
- "Today's" Mars light time: live from Horizons, else the last cached live answer, else a value **computed on the server** from approximate
  orbital elements (Standish, JPL; checked against the 2025 opposition, and the 2034/2035 extremes), labelled "computed, estimate".
  The 22.29 / 44.58 min figures are Mars at its farthest and are labelled as such.
- The review interval default (14 days) is sourced from NASA JSC BHP (NTRS 20170003866) for the ISS; applying it to a Mars crew is an assumption.
- The journey is a schematic route drawn over the computed 259-day Hohmann transfer time, not a mission trajectory.
- HawkScan (DAST) was not run: no StackHawk API key and no `hawk` install in the build session. `stackhawk.yml` is ready:
  put your app id in it, `export HAWK_API_KEY=...`, start the site, run `hawk scan stackhawk.yml`.
- The Mission 3D views were driven in headless Chromium (English and Bangla, reduced and normal motion), with no console errors,
  no external requests and the strict CSP intact. Not tried on a real GPU, Safari or Firefox.
- The YouTube player was not played in the build sandbox (no internet there). The three video IDs were checked
  through YouTube's oEmbed (title and channel only). Check them once with internet before the final submission.
- The 3D views were checked in headless Chromium with software WebGL, not on a real GPU.
- Tested in Chromium only (desktop and a 390 px phone width). Not run in Safari or Firefox (browser downloads were blocked). Instead the
  JavaScript was syntax-checked with esbuild for Firefox 90, Safari 15/16 and Chrome 90 targets and the CSS with lightningcss for
  Safari 14 / Firefox 90, and `structuredClone` (Safari 15.4+) was removed. That is a static check, not a run.
- The NASA API hub was **not** tested against the real NASA servers (the build sandbox could not reach them). Parsers,
  validation, caching, fallback and key masking are tested with mocked responses only; NASA's response formats can change.
  Run `python tools/live_check.py` once on a machine with internet: it exercises all ten APIs through the real hub and prints
  live / cached / unavailable with the reason. DEMO_KEY is rate limited.
- For Firefox, Safari (WebKit) and a real GPU run `python tools/browser_smoke.py --browser firefox|webkit|chromium [--gpu]` on your computer.
- WebXR (headset), gyroscope and Cardboard modes were not tried on real hardware. The Cardboard split screen was
  rendered in headless Chromium; lens distortion values are a generic guess, not calibrated for any viewer.
- Scroll performance was checked only with software WebGL; on weak phones the page lowers particle counts and resolution automatically.
- The DONKI cache is empty; OSDR and NTRS records were retrieved on 2026-10-20.
- Hardware plan and the two cited precedents (HPE Spaceborne Computer-2, NASA DTN) are not tested or independently verified.

## Licence

Code: Apache-2.0 (`LICENSE`). Fonts: SIL OFL 1.1 (`frontend/fonts/LICENSE-*`). Three.js: MIT (`frontend/vendor/three.LICENSE`).
NASA data remains NASA's. Crew, callsigns and telemetry are fictional.
