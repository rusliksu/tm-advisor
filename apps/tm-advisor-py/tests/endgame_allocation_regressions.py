#!/usr/bin/env python3
"""Regression checks for last-generation play/sell allocation."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.card_parser import CardEffectParser  # noqa: E402
from tm_advisor.combo import ComboDetector  # noqa: E402
from tm_advisor.database import CardDatabase  # noqa: E402
from tm_advisor.draft_play_advisor import mc_allocation_advice, play_hold_advice  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402
from tm_advisor.requirements import RequirementsChecker  # noqa: E402
from tm_advisor.shared_data import resolve_data_path  # noqa: E402
from tm_advisor.synergy import SynergyEngine  # noqa: E402


def build_endgame_state() -> GameState:
    hand = [
        {"name": "Underground City", "calculatedCost": 13, "tags": ["City", "Building"]},
        {"name": "Venus Shuttles", "calculatedCost": 6, "tags": ["Venus"]},
    ]
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 76,
        "steel": 0,
        "titanium": 0,
        "plants": 0,
        "energy": 0,
        "heat": 0,
        "megaCreditProduction": 19,
        "steelProduction": 1,
        "titaniumProduction": 0,
        "plantProduction": 2,
        "energyProduction": 7,
        "heatProduction": 3,
        "terraformRating": 42,
        "cardsInHandNbr": len(hand),
        "tableau": [{"name": "Cheung Shing MARS"}],
        "tags": {"building": 4, "city": 1},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Cheung Shing MARS"}],
        "cardsInHand": hand,
        "game": {
            "generation": 9,
            "phase": "action",
            "oxygenLevel": 13,
            "temperature": 6,
            "oceans": 8,
            "venusScaleLevel": 30,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "gameOptions": {"expansions": {"prelude": True, "venusNext": True, "colonies": True}},
        },
    })


def main() -> None:
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    parser = CardEffectParser(db)
    combo = ComboDetector(parser, db)
    synergy = SynergyEngine(db, combo)
    req_checker = RequirementsChecker(str(resolve_data_path("all_cards.json")))
    state = build_endgame_state()

    advice = {
        row["name"]: row
        for row in play_hold_advice(state.cards_in_hand, state, synergy, req_checker)
    }
    assert advice["Underground City"]["action"] == "PLAY", advice["Underground City"]
    assert advice["Underground City"]["play_value_now"] > 13, advice["Underground City"]
    assert advice["Venus Shuttles"]["action"] == "SELL", advice["Venus Shuttles"]
    assert "no immediate VP" in advice["Venus Shuttles"]["reason"], advice["Venus Shuttles"]

    allocation = mc_allocation_advice(state, synergy, req_checker)["allocations"]
    assert any(a["action"].startswith("Play Underground City") for a in allocation), allocation
    assert all(
        not (a.get("type") == "sell" and "Underground City" in a.get("action", ""))
        for a in allocation
    ), allocation
    assert all(
        not a.get("action", "").startswith("Play Venus Shuttles")
        for a in allocation
    ), allocation

    print("advisor endgame allocation regression checks: OK")


if __name__ == "__main__":
    main()
