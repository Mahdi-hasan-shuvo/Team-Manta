"""English and Bangla files must have the same shape, the same placeholders,
and must not make claims this project refuses to make."""
import json
import re
from pathlib import Path

import pytest

C = Path(__file__).resolve().parents[1] / "backend" / "vigilsite" / "content"
EN = json.loads((C / "en.json").read_text(encoding="utf-8"))
BN = json.loads((C / "bn.json").read_text(encoding="utf-8"))
PH = re.compile(r"\{[a-z_]+\}")
BN_RANGE = re.compile(r"[ঀ-৿]")


def walk(a, b, path=""):
    """Yield (path, a_leaf, b_leaf) and assert identical structure."""
    if isinstance(a, dict):
        assert isinstance(b, dict), path
        assert set(a) == set(b), f"{path}: keys differ {set(a) ^ set(b)}"
        for k in a:
            yield from walk(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list):
        assert isinstance(b, list) and len(a) == len(b), f"{path}: list length differs"
        for i, (x, y) in enumerate(zip(a, b)):
            yield from walk(x, y, f"{path}[{i}]")
    else:
        assert type(a) is type(b), path
        yield path, a, b


LEAVES = list(walk(EN, BN))
# Values that are identical in both languages on purpose (names, code, paths, urls).
SAME_OK = re.compile(r"^(https?://|/|[A-Za-z0-9_./ ,()+\-]*$)")


def test_same_structure():
    assert len(LEAVES) > 300


@pytest.mark.parametrize("path,a,b", [l for l in LEAVES if isinstance(l[1], str)])
def test_placeholders_match(path, a, b):
    assert sorted(PH.findall(a)) == sorted(PH.findall(b)), path


def test_bangla_text_is_bangla():
    prose = [(p, b) for p, a, b in LEAVES
             if isinstance(b, str) and len(a) > 60 and not p.endswith((".tree", ".file")) and ".url" not in p]
    bad = [p for p, b in prose if not BN_RANGE.search(b)]
    assert not bad, f"untranslated: {bad}"


def test_no_forbidden_claims():
    blob = json.dumps(EN).lower() + json.dumps(BN).lower()
    for phrase in ["100%", "72-hour", "72 hour", "flight-ready", "guarantee", "cures", "predicts emergencies"]:
        assert phrase not in blob, phrase


def test_every_problem_has_all_fields():
    for doc in (EN, BN):
        ids = [p["id"] for p in doc["problems"]["items"]]
        assert ids == ["delay", "detect", "team", "privacy", "crisis"]
        for p in doc["problems"]["items"]:
            assert p["status"] in ("core", "stretch")
            assert all(p[k] for k in ("name", "short", "how", "limit", "where"))


def test_new_sections_exist_in_both_languages():
    for doc in (EN, BN):
        assert doc["team"]["challenge"] and doc["team"]["category"]
        assert doc["team"]["photo_alt"] and doc["team"]["photo_caption"]
        assert len(doc["team"]["members"]) == 6
        assert [member["name"] for member in doc["team"]["members"]] == [
            "Niloy Bhattacharjee", "Tusar Ray", "MD. Taiyab Ur Rahman",
            "Dhiraj Dhar Dip", "Mahadi Hasan Shuvo", "Puja Mondal",
        ]
        assert all(member["image"].startswith("/img/team-") and member["alt"] for member in doc["team"]["members"])
        assert "intermediate" not in doc["team"]["challenge"].lower()
        for key in ("orbit", "video"):
            assert key in doc and doc[key]["title"]
        assert set(doc["video"]["why"]) == {"hrp", "link"}
        assert set(doc["ui"]["nav"]) >= {"orbit", "video", "nasa"}
        assert set(doc["nasa"]["kinds"]) == {"osdr", "ntrs", "paper", "other"}
        assert set(doc["nasa"]["filters"]) == {"all", "osdr", "ntrs", "paper", "other"}


def test_universe_explorer_hub_content_parity():
    for doc in (EN, BN):
        for key in ("journey", "explore", "hub"):
            assert key in doc
        assert {"system", "sun", "mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune"} <= set(doc["explore"]["bodies"])
        assert set(doc["hub"]["apis"]) == {"osdr_search", "osdr_meta", "ntrs", "donki", "eonet", "cmr", "power", "images", "horizons", "dsn"}
        assert set(doc["hub"]["status"]) == {"live", "cached", "unavailable"}
        assert {"explore", "hub"} <= set(doc["ui"]["nav"])
