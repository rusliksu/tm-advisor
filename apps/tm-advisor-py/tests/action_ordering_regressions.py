#!/usr/bin/env python3
"""Regression checks for advisor action ordering hints."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.action_ordering import get_action_advice  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402


def build_state(
    hand_names: list[str],
    *,
    heat: int = 0,
    temperature: int = -10,
    turmoil: dict | None = None,
) -> GameState:
    cards = [{"name": name, "calculatedCost": 0, "tags": []} for name in hand_names]
    state = GameState({
        "thisPlayer": {
            "color": "red",
            "name": "me",
            "megaCredits": 40,
            "megaCreditProduction": 10,
            "heat": heat,
            "heatProduction": 3,
            "cardsInHandNbr": len(cards),
            "tableau": [{"name": "Helion", "resources": 0, "isDisabled": False}],
            "tags": {},
        },
        "players": [
            {"color": "red", "name": "me", "cardsInHandNbr": len(cards)},
            {"color": "blue", "name": "opp", "cardsInHandNbr": 10},
        ],
        "cardsInHand": cards,
        "game": {
            "generation": 8,
            "phase": "action",
            "oxygenLevel": 6,
            "temperature": temperature,
            "oceans": 4,
            "venusScaleLevel": 18,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "spaces": [],
            "gameOptions": {"expansions": {}},
        },
    })
    if turmoil is not None:
        state.turmoil = turmoil
    return state


def assert_no_wrong_cross_card_leaks() -> None:
    state = build_state(["Insulation", "Noctis City", "Greenhouses"])
    advice = get_action_advice(state)

    insulation_lines = [line for line in advice if "Insulation" in line]
    assert insulation_lines, "expected Insulation-specific timing advice"
    assert all("max городов" not in line for line in insulation_lines), insulation_lines
    assert all("plant" not in line.lower() for line in insulation_lines), insulation_lines
    assert any("HOLD" in line for line in insulation_lines), insulation_lines

    noctis_lines = [line for line in advice if "Noctis City" in line]
    assert noctis_lines, "expected Noctis City timing advice"
    assert all("plant" not in line.lower() for line in noctis_lines), noctis_lines
    assert all("PLAY Noctis City NOW" not in line for line in noctis_lines), noctis_lines

    greenhouses_lines = [line for line in advice if "Greenhouses" in line]
    assert greenhouses_lines, "expected Greenhouses timing advice"
    assert any("plant" in line.lower() for line in greenhouses_lines), greenhouses_lines


def assert_reds_heat_timing_does_not_conflict() -> None:
    state = build_state(
        [],
        heat=9,
        temperature=-10,
        turmoil={"ruling": "Scientists", "dominant": "Reds", "policy_ids": {"Reds": "rp01"}},
    )
    advice = get_action_advice(state)

    assert any("Reds" in line and ("налог" in line or "tax" in line) for line in advice), advice
    assert not any("Heat→temp" in line and "затягивай" in line for line in advice), advice


def main() -> None:
    assert_no_wrong_cross_card_leaks()
    assert_reds_heat_timing_does_not_conflict()
    print("advisor action-ordering regression checks: OK")


if __name__ == "__main__":
    main()
