#!/usr/bin/env python3
"""Regression checks for Astra Mechanica target handling and score consistency."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.database import CardDatabase  # noqa: E402
from tm_advisor.card_parser import CardEffectParser  # noqa: E402
from tm_advisor.combo import ComboDetector  # noqa: E402
from tm_advisor.synergy import SynergyEngine  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402
from tm_advisor.shared_data import resolve_data_path  # noqa: E402


def build_live_like_state(event_names: list[str]) -> GameState:
    tableau = [
        {"name": "Morning Star Inc."},
        {"name": "Mars University"},
        {"name": "Olympus Conference"},
        {"name": "Venus Waystation"},
    ]
    tableau.extend({"name": name} for name in event_names)

    return GameState({
        "thisPlayer": {
            "color": "red",
            "name": "me",
            "megaCredits": 20,
            "megaCreditProduction": 14,
            "steelProduction": 2,
            "titaniumProduction": 4,
            "cardsInHandNbr": 6,
            "tableau": tableau,
            "tags": {
                "science": 10,
                "earth": 5,
                "venus": 17,
                "event": 4,
                "building": 9,
                "space": 3,
                "microbe": 5,
                "animal": 1,
            },
        },
        "players": [
            {"color": "red", "name": "me", "cardsInHandNbr": 6},
            {"color": "blue", "name": "opp", "cardsInHandNbr": 4},
            {"color": "green", "name": "opp2", "cardsInHandNbr": 4},
        ],
        "game": {
            "generation": 9,
            "phase": "action",
            "oxygenLevel": 10,
            "temperature": 4,
            "oceans": 9,
            "venusScaleLevel": 20,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "spaces": [],
            "gameOptions": {"expansions": {"venus": True, "colonies": True}},
        },
    })


def build_opening_state() -> GameState:
    return GameState({
        "thisPlayer": {
            "color": "red",
            "name": "me",
            "megaCredits": 21,
            "cardsInHandNbr": 0,
            "tableau": [],
            "tags": {},
        },
        "players": [
            {"color": "red", "name": "me"},
            {"color": "blue", "name": "opp"},
            {"color": "green", "name": "opp2"},
        ],
        "dealtCorporationCards": [
            {"name": "Interplanetary Cinematics"},
            {"name": "Splice"},
        ],
        "dealtPreludeCards": [
            {"name": "Experimental Forest"},
            {"name": "Applied Science"},
        ],
        "dealtCeoCards": [{"name": "Clarke"}],
        "draftedCards": [
            {"name": "Optimal Aerobraking"},
            {"name": "Media Group"},
        ],
        "game": {
            "generation": 1,
            "phase": "initial_drafting",
            "oxygenLevel": 0,
            "temperature": -30,
            "oceans": 0,
            "venusScaleLevel": 0,
            "colonies": [
                {"name": "Triton", "isActive": True, "trackPosition": 1, "colonies": []},
            ],
            "gameOptions": {
                "expansions": {
                    "colonies": True,
                    "prelude": True,
                    "ceos": True,
                },
            },
        },
    })


def score(engine: SynergyEngine, db: CardDatabase, state: GameState, name: str, *, context: str) -> int:
    info = db.get_info(name) or {}
    return engine.adjusted_score(
        name,
        info.get("tags", []) or [],
        state.me.corp,
        state.generation,
        dict(state.me.tags),
        state,
        context=context,
    )


def main() -> None:
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    parser = CardEffectParser(db)
    combo = ComboDetector(parser, db)
    engine = SynergyEngine(db, combo)

    no_targets = build_live_like_state([])
    deimos_only = build_live_like_state(["Deimos Down:promo"])
    sabotage_only = build_live_like_state(["Sabotage"])
    mixed = build_live_like_state(["Sabotage", "Technology Demonstration"])
    mixed_with_deimos = build_live_like_state(
        ["Sabotage", "Technology Demonstration", "Deimos Down:promo"])

    no_targets_score = score(engine, db, no_targets, "Astra Mechanica", context="draft")
    deimos_only_score = score(engine, db, deimos_only, "Astra Mechanica", context="draft")
    sabotage_only_score = score(engine, db, sabotage_only, "Astra Mechanica", context="draft")
    mixed_score = score(engine, db, mixed, "Astra Mechanica", context="draft")
    mixed_with_deimos_score = score(engine, db, mixed_with_deimos, "Astra Mechanica", context="draft")

    assert deimos_only_score == no_targets_score, (deimos_only_score, no_targets_score)
    assert sabotage_only_score > no_targets_score, (sabotage_only_score, no_targets_score)
    assert mixed_score > sabotage_only_score, (mixed_score, sabotage_only_score)
    assert mixed_with_deimos_score == mixed_score, (mixed_with_deimos_score, mixed_score)

    for context in ("draft", "play", "tableau"):
        assert score(engine, db, mixed, "Astra Mechanica", context=context) == mixed_score

    opening = build_opening_state()
    opening_draft = score(engine, db, opening, "Optimal Aerobraking", context="draft")
    opening_play = score(engine, db, opening, "Optimal Aerobraking", context="play")
    assert opening_draft == opening_play, (opening_draft, opening_play)

    print("advisor astra/consistency regression checks: OK")


if __name__ == "__main__":
    main()
