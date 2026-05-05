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
from tm_advisor.card_parser import CardEffectParser  # noqa: E402
from tm_advisor.combo import ComboDetector  # noqa: E402
from tm_advisor.database import CardDatabase  # noqa: E402
from tm_advisor.draft_play_advisor import (  # noqa: E402
    _estimate_req_gap,
    mc_allocation_advice,
    play_hold_advice,
)
from tm_advisor.models import GameState  # noqa: E402
from tm_advisor.requirements import RequirementsChecker  # noqa: E402
from tm_advisor.shared_data import resolve_data_path  # noqa: E402
from tm_advisor.synergy import SynergyEngine  # noqa: E402


def advisor_components():
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    parser = CardEffectParser(db)
    combo = ComboDetector(parser, db)
    synergy = SynergyEngine(db, combo)
    req_checker = RequirementsChecker(str(resolve_data_path("all_cards.json")))
    return db, parser, synergy, req_checker


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


def build_blue_action_state(used_actions: list[str]) -> GameState:
    me = {
        "color": "orange",
        "name": "me",
        "megaCredits": 2,
        "megaCreditProduction": 7,
        "energy": 2,
        "energyProduction": 4,
        "heat": 2,
        "heatProduction": 2,
        "cardsInHandNbr": 0,
        "actionsThisGeneration": used_actions,
        "tableau": [
            {"name": "Morning Star Inc.", "resources": 0, "isDisabled": False},
            {"name": "Floating Trade Hub", "resources": 7, "isDisabled": False},
            {"name": "Maxwell Base", "resources": 0, "isDisabled": False},
        ],
        "tags": {"venus": 5, "space": 2, "city": 1},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me, {"color": "blue", "name": "opp", "cardsInHandNbr": 4}],
        "cardsInHand": [],
        "game": {
            "generation": 5,
            "phase": "action",
            "oxygenLevel": 3,
            "temperature": -30,
            "oceans": 3,
            "venusScaleLevel": 8,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "spaces": [],
            "gameOptions": {"expansions": {"prelude": True, "venus": True, "colonies": True}},
        },
    })


def assert_used_blue_actions_are_not_recommended_again() -> None:
    _, _, synergy, req_checker = advisor_components()

    fresh_actions = mc_allocation_advice(
        build_blue_action_state([]), synergy, req_checker
    )["allocations"]
    assert any("Floating Trade Hub" in row.get("action", "") for row in fresh_actions), fresh_actions

    used_actions = mc_allocation_advice(
        build_blue_action_state(["Floating Trade Hub"]), synergy, req_checker
    )["allocations"]
    assert all("Floating Trade Hub" not in row.get("action", "") for row in used_actions), used_actions


def build_titan_shuttles_unlock_state() -> GameState:
    hand = [
        {"name": "Space Port Colony", "calculatedCost": 27},
        {"name": "Vesta Shipyard", "calculatedCost": 15},
    ]
    me = {
        "color": "emerald",
        "name": "me",
        "megaCredits": 10,
        "megaCreditProduction": -2,
        "titanium": 0,
        "titaniumProduction": 2,
        "titaniumValue": 3,
        "cardsInHandNbr": len(hand),
        "coloniesCount": 1,
        "actionsThisGeneration": ["Restricted Area", "Dirigibles"],
        "tableau": [
            {"name": "Spire", "resources": 3, "isDisabled": False},
            {"name": "Titan Shuttles", "resources": 10, "isDisabled": False},
        ],
        "tags": {"space": 5, "jovian": 2, "science": 6},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me, {"color": "blue", "name": "opp", "cardsInHandNbr": 4}],
        "cardsInHand": hand,
        "game": {
            "generation": 6,
            "phase": "action",
            "oxygenLevel": 3,
            "temperature": -24,
            "oceans": 3,
            "venusScaleLevel": 8,
            "milestones": [],
            "awards": [],
            "colonies": [{"name": "Titan", "isActive": True, "trackPosition": 5, "colonies": ["emerald"]}],
            "spaces": [],
            "gameOptions": {"expansions": {"prelude": True, "venus": True, "colonies": True}},
        },
    })


def assert_titan_shuttles_cashout_unlocks_space_play() -> None:
    _, _, synergy, req_checker = advisor_components()

    allocations = mc_allocation_advice(
        build_titan_shuttles_unlock_state(), synergy, req_checker
    )["allocations"]
    sequence = [
        row for row in allocations
        if row.get("sequence") == "titan_shuttles_cashout"
    ]
    assert sequence, allocations
    assert sequence[0]["target_card"] == "Space Port Colony", sequence
    assert sequence[0]["priority"] == 1, sequence


def build_endgame_blue_action_play_state() -> GameState:
    hand = [
        {"name": "Power Infrastructure", "cost": 4, "tags": ["Power", "Building"]},
        {"name": "Venus Magnetizer", "cost": 7, "tags": ["Venus"]},
    ]
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 20,
        "megaCreditProduction": 20,
        "energy": 6,
        "energyProduction": 6,
        "cardsInHandNbr": len(hand),
        "tableau": [{"name": "Manutech", "resources": 0, "isDisabled": False}],
        "tags": {"venus": 4, "building": 3, "power": 2},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "cardsInHand": hand,
        "game": {
            "generation": 8,
            "phase": "action",
            "oxygenLevel": 14,
            "temperature": 8,
            "oceans": 9,
            "venusScaleLevel": 24,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "spaces": [],
            "gameOptions": {"expansions": {"venus": True, "colonies": True}},
        },
    })


def assert_endgame_blue_action_play_value_is_not_zeroed() -> None:
    _, parser, synergy, req_checker = advisor_components()

    restricted = parser.get("Restricted Area")
    assert restricted and "special" in restricted.placement, restricted.placement if restricted else None

    weather = parser.get("Weather Balloons")
    assert weather and any(
        "per city" in act.get("effect", "").lower()
        for act in weather.actions
    ), weather.actions if weather else None

    state = build_endgame_blue_action_play_state()
    rows = play_hold_advice(state.cards_in_hand, state, synergy, req_checker)
    by_name = {row["name"]: row for row in rows}
    assert by_name["Power Infrastructure"]["action"] == "PLAY", by_name["Power Infrastructure"]
    assert by_name["Power Infrastructure"]["play_value_now"] >= 5, by_name["Power Infrastructure"]
    assert by_name["Venus Magnetizer"]["action"] == "PLAY", by_name["Venus Magnetizer"]
    assert by_name["Venus Magnetizer"]["play_value_now"] >= 7, by_name["Venus Magnetizer"]


def build_existing_blue_action_value_state(card_name: str) -> GameState:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 0,
        "megaCreditProduction": 20,
        "energy": 6 if card_name == "Power Infrastructure" else 0,
        "energyProduction": 3,
        "cardsInHandNbr": 0,
        "actionsThisGeneration": [],
        "tableau": [
            {"name": "Manutech", "resources": 0, "isDisabled": False},
            {"name": card_name, "resources": 0, "isDisabled": False},
        ],
        "tags": {"venus": 4, "building": 3, "power": 2},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "cardsInHand": [],
        "game": {
            "generation": 8,
            "phase": "action",
            "oxygenLevel": 14,
            "temperature": 8,
            "oceans": 9,
            "venusScaleLevel": 24,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "spaces": [],
            "gameOptions": {"expansions": {"venus": True, "colonies": True}},
        },
    })


def assert_existing_blue_actions_have_immediate_value() -> None:
    _, _, synergy, req_checker = advisor_components()

    power_allocations = mc_allocation_advice(
        build_existing_blue_action_value_state("Power Infrastructure"),
        synergy, req_checker,
    )["allocations"]
    power_rows = [
        row for row in power_allocations
        if "Power Infrastructure" in row.get("action", "")
    ]
    assert power_rows, power_allocations
    assert power_rows[0]["value_mc"] >= 5, power_rows

    venus_allocations = mc_allocation_advice(
        build_existing_blue_action_value_state("Venus Magnetizer"),
        synergy, req_checker,
    )["allocations"]
    venus_rows = [
        row for row in venus_allocations
        if "Venus Magnetizer" in row.get("action", "")
    ]
    assert venus_rows, venus_allocations
    assert venus_rows[0]["value_mc"] >= 7, venus_rows


def main() -> None:
    assert_no_wrong_cross_card_leaks()
    assert_value_trade_alert_suppresses_track_only_trade_first()
    assert_track_only_trade_first_survives_without_value_trade()
    assert_max_requirement_is_not_treated_as_soon()
    assert_used_blue_actions_are_not_recommended_again()
    assert_titan_shuttles_cashout_unlocks_space_play()
    assert_endgame_blue_action_play_value_is_not_zeroed()
    assert_existing_blue_actions_have_immediate_value()
    print("advisor action-ordering regression checks: OK")


if __name__ == "__main__":
    main()
