#!/usr/bin/env python3
"""Targeted regressions for Arctic Algae late-ocean dead-window handling."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.advisor import AdvisorBot  # noqa: E402
from tm_advisor.draft_play_advisor import draft_buy_advice  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402


def build_state(*, oceans: int, temperature: int = -12) -> GameState:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 20,
        "megaCreditProduction": 5,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 20,
        "cardsInHandNbr": 1,
        "tableau": [],
        "tags": {},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "cardsInHand": [{"name": "Arctic Algae", "calculatedCost": 12, "tags": ["Plant"]}],
        "game": {
            "generation": 5,
            "phase": "action",
            "oxygenLevel": 5,
            "temperature": temperature,
            "oceans": oceans,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [],
            "spaces": [],
            "gameOptions": {"expansions": {"prelude": True}},
        },
    })


def build_research_state(*, oceans: int, temperature: int = -12) -> GameState:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 24,
        "megaCreditProduction": 8,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 28,
        "cardsInHandNbr": 6,
        "tableau": [],
        "tags": {},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Teractor"}],
        "cardsInHand": [],
        "dealtProjectCards": [
            {"name": "Arctic Algae", "calculatedCost": 12, "tags": ["Plant"]},
            {"name": "Lichen", "calculatedCost": 7, "tags": ["Plant"]},
            {"name": "Research", "calculatedCost": 11, "tags": ["Science"]},
        ],
        "game": {
            "generation": 5,
            "phase": "research",
            "oxygenLevel": 5,
            "temperature": temperature,
            "oceans": oceans,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [],
            "spaces": [],
            "gameOptions": {"expansions": {"prelude": True}},
        },
    })


def build_ocean_research_state(*, oceans: int) -> GameState:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 28,
        "megaCreditProduction": 8,
        "steelProduction": 2,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 2,
        "heatProduction": 0,
        "terraformRating": 28,
        "cardsInHandNbr": 6,
        "tableau": [],
        "tags": {},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Interplanetary Cinematics"}],
        "cardsInHand": [],
        "dealtProjectCards": [
            {"name": "Neptunian Power Consultants", "calculatedCost": 14, "tags": ["Power"]},
            {"name": "Research", "calculatedCost": 11, "tags": ["Science"]},
        ],
        "game": {
            "generation": 4,
            "phase": "research",
            "oxygenLevel": 5,
            "temperature": -14,
            "oceans": oceans,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [],
            "spaces": [],
            "gameOptions": {"expansions": {"prelude": True}},
        },
    })


def main() -> int:
    bot = AdvisorBot("test", snapshot_mode=True)
    info = bot.db.get_info("Arctic Algae") or {}

    early_state = build_state(oceans=2)
    late_state = build_state(oceans=8)

    early_score = bot.synergy.adjusted_score(
        "Arctic Algae",
        info.get("tags", []) or [],
        "",
        5,
        {},
        early_state,
        context="play",
    )
    late_score = bot.synergy.adjusted_score(
        "Arctic Algae",
        info.get("tags", []) or [],
        "",
        5,
        {},
        late_state,
        context="play",
    )

    assert early_score > late_score, (early_score, late_score)
    assert late_score <= 55, late_score

    draft_state = build_research_state(oceans=8)
    advice = draft_buy_advice(
        draft_state.dealt_project_cards,
        draft_state,
        bot.synergy,
        bot.req_checker,
    )
    buy_names = {entry["name"] for entry in advice["buy_list"]}
    assert "Arctic Algae" not in buy_names, advice
    algae_skip = next(entry for entry in advice["skip_list"] if entry["name"] == "Arctic Algae")
    assert algae_skip["skip_reason"] == "остался 1 океан", algae_skip

    npc_info = bot.db.get_info("Neptunian Power Consultants") or {}
    early_npc_state = build_state(oceans=2)
    late_npc_state = build_state(oceans=8)
    early_npc_score = bot.synergy.adjusted_score(
        "Neptunian Power Consultants",
        npc_info.get("tags", []) or [],
        "",
        5,
        {},
        early_npc_state,
        context="play",
    )
    late_npc_score = bot.synergy.adjusted_score(
        "Neptunian Power Consultants",
        npc_info.get("tags", []) or [],
        "",
        5,
        {},
        late_npc_state,
        context="play",
    )
    assert early_npc_score > late_npc_score, (early_npc_score, late_npc_score)

    npc_draft_state = build_ocean_research_state(oceans=8)
    npc_advice = draft_buy_advice(
        npc_draft_state.dealt_project_cards,
        npc_draft_state,
        bot.synergy,
        bot.req_checker,
    )
    npc_buy_names = {entry["name"] for entry in npc_advice["buy_list"]}
    assert "Neptunian Power Consultants" not in npc_buy_names, npc_advice
    npc_skip = next(
        entry for entry in npc_advice["skip_list"]
        if entry["name"] == "Neptunian Power Consultants"
    )
    assert npc_skip["skip_reason"] == "уже 4+ океанов", npc_skip

    print(f"arctic algae regressions: early={early_score} late={late_score}")
    print(f"npc regressions: early={early_npc_score} late={late_npc_score}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
