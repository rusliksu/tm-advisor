#!/usr/bin/env python3
"""Regression checks for advisor requirements handling."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.models import GameState  # noqa: E402
from tm_advisor.requirements import RequirementsChecker  # noqa: E402
from tm_advisor.shared_data import resolve_data_path  # noqa: E402


def build_tag_state(tags: dict[str, int], *, tableau: list[dict] | None = None) -> GameState:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 30,
        "energyProduction": 7,
        "terraformRating": 20,
        "tableau": tableau or [],
        "tags": tags,
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "cardsInHand": [],
        "game": {
            "generation": 5,
            "phase": "action",
            "oxygenLevel": 3,
            "temperature": -28,
            "oceans": 5,
            "venusScaleLevel": 2,
            "milestones": [],
            "awards": [],
            "spaces": [],
            "gameOptions": {"expansions": {"colonies": True, "prelude": True}},
        },
    })


def main() -> None:
    checker = RequirementsChecker(str(resolve_data_path("all_cards.json")))

    tectonic_wild_ok, tectonic_wild_reason = checker.check(
        "Tectonic Stress Power",
        build_tag_state({"science": 1, "wild": 1}),
    )
    assert tectonic_wild_ok, tectonic_wild_reason
    assert tectonic_wild_reason == "", tectonic_wild_reason

    tectonic_no_wild_ok, tectonic_no_wild_reason = checker.check(
        "Tectonic Stress Power",
        build_tag_state({"science": 1}),
    )
    assert not tectonic_no_wild_ok, tectonic_no_wild_reason
    assert "2 science tag" in tectonic_no_wild_reason, tectonic_no_wild_reason

    fusion_xavier_ok, fusion_xavier_reason = checker.check(
        "Fusion Power",
        build_tag_state({}, tableau=[{"name": "Xavier", "isDisabled": False}]),
    )
    assert fusion_xavier_ok, fusion_xavier_reason
    assert fusion_xavier_reason == "", fusion_xavier_reason

    fusion_no_xavier_ok, fusion_no_xavier_reason = checker.check(
        "Fusion Power",
        build_tag_state({}),
    )
    assert not fusion_no_xavier_ok, fusion_no_xavier_reason
    assert "power tag" in fusion_no_xavier_reason, fusion_no_xavier_reason

    fusion_disabled_xavier_ok, fusion_disabled_xavier_reason = checker.check(
        "Fusion Power",
        build_tag_state({}, tableau=[{"name": "Xavier", "isDisabled": True}]),
    )
    assert not fusion_disabled_xavier_ok, fusion_disabled_xavier_reason
    assert "power tag" in fusion_disabled_xavier_reason, fusion_disabled_xavier_reason

    print("advisor requirements regression checks: OK")


if __name__ == "__main__":
    main()
