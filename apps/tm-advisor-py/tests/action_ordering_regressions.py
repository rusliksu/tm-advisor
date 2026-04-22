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
from tm_advisor.analysis import _dedupe_alerts  # noqa: E402
from tm_advisor.draft_play_advisor import _estimate_req_gap  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402


def build_state(hand_names: list[str]) -> GameState:
    cards = [{"name": name, "calculatedCost": 0, "tags": []} for name in hand_names]
    return GameState({
        "thisPlayer": {
            "color": "red",
            "name": "me",
            "megaCredits": 40,
            "megaCreditProduction": 10,
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
            "temperature": -10,
            "oceans": 4,
            "venusScaleLevel": 18,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "spaces": [],
            "gameOptions": {"expansions": {}},
        },
    })


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


def assert_value_trade_alert_suppresses_track_only_trade_first() -> None:
    alerts = _dedupe_alerts([
        "🚀 Trade Miranda (+11.1 MC net, 1 Animals) [energy]",
        "⚡ Trade FIRST: Callisto (contested — opponents haven't passed)",
        "🔥 TR из 11 heat (+1 temp, +1 TR)",
    ])

    assert "🚀 Trade Miranda (+11.1 MC net, 1 Animals) [energy]" in alerts, alerts
    assert all("Trade FIRST: Callisto" not in alert for alert in alerts), alerts
    assert "🔥 TR из 11 heat (+1 temp, +1 TR)" in alerts, alerts

    build_then_trade_alerts = _dedupe_alerts([
        "🚀 Сначала Callisto, потом trade: track 5→6, 3 energy (+6.5 MC темпа) [9.0 MC]",
        "⚡ Trade FIRST: Callisto (contested — opponents haven't passed)",
    ])
    assert build_then_trade_alerts == [
        "🚀 Сначала Callisto, потом trade: track 5→6, 3 energy (+6.5 MC темпа) [9.0 MC]",
    ], build_then_trade_alerts


def assert_track_only_trade_first_survives_without_value_trade() -> None:
    alerts = _dedupe_alerts([
        "⚡ Trade FIRST: Callisto (contested — opponents haven't passed)",
    ])

    assert alerts == ["⚡ Trade FIRST: Callisto (contested — opponents haven't passed)"], alerts


def assert_max_requirement_is_not_treated_as_soon() -> None:
    state = build_state(["Static Harvesting"])

    assert _estimate_req_gap("Макс 3 ocean (сейчас 4)", state, 6) == 7
    assert _estimate_req_gap("Max 3 ocean (сейчас 4)", state, 6) == 7


def main() -> None:
    assert_no_wrong_cross_card_leaks()
    assert_value_trade_alert_suppresses_track_only_trade_first()
    assert_track_only_trade_first_survives_without_value_trade()
    assert_max_requirement_is_not_treated_as_soon()
    print("advisor action-ordering regression checks: OK")


if __name__ == "__main__":
    main()
