#!/usr/bin/env python3
"""Regression checks for opponent intent prediction."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.models import GameState  # noqa: E402
from tm_advisor.opponent_intent import analyze_opponent_intents, format_opponent_intent_warnings  # noqa: E402


def build_state(*, opponent=None, game=None) -> GameState:
    opponent = opponent or {}
    game = game or {}
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 16,
        "terraformRating": 35,
        "tableau": [],
        "tags": {},
    }
    opp = {
        "color": "blue",
        "name": "opp",
        "megaCredits": 12,
        "terraformRating": 34,
        "plants": 0,
        "plantProduction": 0,
        "heat": 0,
        "energy": 0,
        "tradesThisGeneration": 0,
        "fleetSize": 1,
        "actionsTakenThisRound": 1,
        "actionsThisGeneration": [],
        "tableau": [],
        "tags": {},
    }
    opp.update(opponent)
    game_data = {
        "generation": 8,
        "phase": "action",
        "oxygenLevel": 10,
        "temperature": 0,
        "oceans": 7,
        "venusScaleLevel": 18,
        "milestones": [],
        "awards": [],
        "colonies": [],
        "gameOptions": {"expansions": {"colonies": True}},
    }
    game_data.update(game)
    return GameState({
        "thisPlayer": me,
        "players": [me, opp],
        "cardsInHand": [],
        "game": game_data,
    })


def main() -> None:
    rush_state = build_state(opponent={
        "actionsThisGeneration": [
            {"title": "Standard Project Asteroid", "description": "raise temperature"},
        ],
    })
    rush_intents = analyze_opponent_intents(rush_state)
    assert any(i["intent"] == "terraforming_tempo" for i in rush_intents), rush_intents
    rush_warnings = format_opponent_intent_warnings(rush_state)
    assert any("rush pressure" in w for w in rush_warnings), rush_warnings

    conversion_state = build_state(opponent={
        "plants": 8,
        "heat": 9,
        "energy": 3,
    }, game={
        "colonies": [
            {"name": "Luna", "isActive": True, "trackPosition": 5, "colonies": []},
        ],
    })
    conversion_intents = analyze_opponent_intents(conversion_state)
    kinds = {i["intent"] for i in conversion_intents}
    assert {"greenery", "temperature", "trade"}.issubset(kinds), conversion_intents

    milestone_state = build_state(opponent={"megaCredits": 8}, game={
        "milestones": [{
            "name": "Builder",
            "scores": [
                {"color": "red", "score": 7, "claimable": False},
                {"color": "blue", "score": 8, "claimable": True},
            ],
        }],
    })
    milestone_intents = analyze_opponent_intents(milestone_state)
    assert milestone_intents[0]["intent"] == "milestone", milestone_intents
    assert "Builder" in milestone_intents[0]["reason"], milestone_intents

    print("advisor opponent intent regression checks: OK")


if __name__ == "__main__":
    main()
