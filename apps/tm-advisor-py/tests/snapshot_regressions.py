"""Regression checks for advisor snapshot ranking fields."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
ENTRYPOINT_DIR = ROOT / "apps" / "tm-advisor-py" / "entrypoints"
if str(ENTRYPOINT_DIR) not in sys.path:
    sys.path.insert(0, str(ENTRYPOINT_DIR))


def load_snapshot_module():
    entrypoint = ENTRYPOINT_DIR / "advisor_snapshot.py"
    spec = importlib.util.spec_from_file_location("advisor_snapshot_test", entrypoint)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def main() -> None:
    snapshot = load_snapshot_module()
    hand = [
        {"name": "Symbiotic Fungus", "effective_score": 69},
        {"name": "Aquifer Pumping", "effective_score": 39},
    ]
    play_advice = [
        {
            "name": "Symbiotic Fungus",
            "action": "PLAY",
            "reason": "endgame low immediate value — after VP/TR plays",
            "play_value_now": 0.8,
            "priority": 7,
        },
        {
            "name": "Aquifer Pumping",
            "action": "PLAY",
            "reason": "endgame VP push",
            "play_value_now": 20.4,
            "priority": 3,
        },
    ]

    enriched = snapshot._merge_play_advice(hand, play_advice)
    assert [card["name"] for card in enriched] == ["Aquifer Pumping", "Symbiotic Fungus"], enriched
    assert enriched[0]["advisor_score"] > enriched[1]["advisor_score"], enriched
    assert enriched[1]["play_value_now"] == 0.8, enriched[1]
    assert "low immediate value" in enriched[1]["play_reason"], enriched[1]

    fallback = snapshot._merge_play_advice([
        {"name": "A", "effective_score": 50},
        {"name": "B", "effective_score": 70},
    ], [])
    assert [card["name"] for card in fallback] == ["B", "A"], fallback

    print("advisor snapshot regression checks: OK")


if __name__ == "__main__":
    main()
