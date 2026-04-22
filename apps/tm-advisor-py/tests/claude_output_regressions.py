#!/usr/bin/env python3
"""Regression checks for Claude markdown advisor output."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.claude_output import ClaudeOutput, _is_action_phase  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402


class FakeDb:
    def get(self, _name):
        return {}

    def get_info(self, _name):
        return {}

    def get_ceo(self, _name):
        return None


class FakeSynergy:
    combo = None

    def adjusted_score(self, *_args, **_kwargs):
        return 70


def build_state(phase: str) -> GameState:
    return GameState({
        "thisPlayer": {
            "color": "red",
            "name": "me",
            "megaCredits": 60,
            "terraformRating": 30,
            "cardsInHandNbr": 0,
            "tableau": [],
            "tags": {},
        },
        "players": [
            {"color": "red", "name": "me", "cardsInHandNbr": 0},
        ],
        "cardsInHand": [],
        "game": {
            "generation": 7,
            "phase": phase,
            "oxygenLevel": 6,
            "temperature": -12,
            "oceans": 5,
            "venusScaleLevel": 18,
            "milestones": [],
            "awards": [],
            "colonies": [
                {"name": "Europa", "isActive": True, "trackPosition": 4, "colonies": []},
            ],
            "spaces": [],
            "gameOptions": {"expansions": {"colonies": True, "venus": True}},
        },
    })


def main() -> None:
    assert _is_action_phase("action")
    assert _is_action_phase("")
    assert not _is_action_phase("solar")
    assert not _is_action_phase("research")

    out = ClaudeOutput(FakeDb(), FakeSynergy()).format(build_state("solar"))

    assert "## Колонии" in out, out
    assert "## Рекомендации" not in out, out
    assert "## Стандартные проекты" not in out, out
    assert "## Торговля (анализ)" not in out, out
    assert "**Рекомендация:**" not in out, out
    assert "### Поселение" not in out, out

    print("advisor claude output regression checks: OK")


if __name__ == "__main__":
    main()
