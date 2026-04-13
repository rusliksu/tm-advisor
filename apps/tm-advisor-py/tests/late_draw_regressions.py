#!/usr/bin/env python3
"""Regression checks for late-game immediate draw card decay."""

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


def build_state(*, generation: int, temperature: int, oxygen: int, oceans: int) -> GameState:
    return GameState({
        "thisPlayer": {
            "color": "red",
            "name": "me",
            "megaCredits": 40,
            "megaCreditProduction": 14,
            "steelProduction": 2,
            "titaniumProduction": 4,
            "energyProduction": 4,
            "cardsInHandNbr": 6,
            "tableau": [
                {"name": "Morning Star Inc."},
                {"name": "Mars University"},
                {"name": "Olympus Conference"},
                {"name": "Media Group"},
                {"name": "Venus Waystation"},
            ],
            "tags": {
                "science": 10,
                "earth": 5,
                "venus": 17,
                "space": 3,
                "event": 4,
            },
        },
        "players": [
            {"color": "red", "name": "me", "cardsInHandNbr": 6},
            {"color": "blue", "name": "opp", "cardsInHandNbr": 4},
            {"color": "green", "name": "opp2", "cardsInHandNbr": 4},
        ],
        "game": {
            "generation": generation,
            "phase": "action",
            "oxygenLevel": oxygen,
            "temperature": temperature,
            "oceans": oceans,
            "venusScaleLevel": 20,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "spaces": [],
            "gameOptions": {"expansions": {"venus": True, "colonies": True}},
        },
    })


def adjusted_score(engine: SynergyEngine, db: CardDatabase, state: GameState, name: str) -> int:
    info = db.get_info(name) or {}
    return engine.adjusted_score(
        name,
        info.get("tags", []) or [],
        state.me.corp,
        state.generation,
        dict(state.me.tags),
        state,
    )


def main() -> None:
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    parser = CardEffectParser(db)
    combo = ComboDetector(parser, db)
    engine = SynergyEngine(db, combo)

    early = build_state(generation=3, temperature=-20, oxygen=3, oceans=2)
    late = build_state(generation=10, temperature=6, oxygen=14, oceans=9)

    tech_early = adjusted_score(engine, db, early, "Technology Demonstration")
    tech_late = adjusted_score(engine, db, late, "Technology Demonstration")
    assert tech_late <= tech_early - 6, (tech_early, tech_late)

    print("advisor late-draw regression checks: OK")


if __name__ == "__main__":
    main()
