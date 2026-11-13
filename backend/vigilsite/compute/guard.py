"""Explanation layer helpers: deterministic rule text + diagnostic-language guard.

The guard is a safety net, not a proof. The real protection is architectural:
the explainer only ever receives the alert object + cached study metadata.
"""
from __future__ import annotations
import re
from .detect import SIGNALS

BLOCKED = re.compile(
    r"\b(diagnos\w*|you have|suffer\w* from|disease|disorder|syndrome|"
    r"depress\w*|infection|prescrib\w*|treat\w*|medicat\w*|therapy|"
    r"\d+\s?mg|you should take|cure\w*|this means you)\b", re.IGNORECASE)


def violates(text: str) -> bool:
    return bool(BLOCKED.search(text))


def rule_text(alert: dict) -> str:
    """Pure template - works with the LLM turned off (the 'cut' fallback)."""
    parts = []
    for d in alert["details"]:
        meta = SIGNALS[d["signal"]]
        way = "below" if d["z"] < 0 else "above"
        parts.append(
            f"{meta['label']} is {abs(d['z']):.1f} SD {way} this crew member's own "
            f"{d['window_days']}-day baseline (current {d['current']:.1f} {meta['unit']}, "
            f"baseline {d['baseline_mean']:.1f} +/- {d['baseline_sd']:.1f}).")
    return (" ".join(parts) + f" Rule fired: {alert['rule']}. No diagnosis is made.")


def safe_explanation(candidate: str, alert: dict) -> str:
    """If the LLM text contains diagnostic/treatment language, discard it and
    fall back to the deterministic rule text."""
    return rule_text(alert) if violates(candidate) else candidate
