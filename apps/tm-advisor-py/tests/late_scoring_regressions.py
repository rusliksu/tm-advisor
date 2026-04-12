#!/usr/bin/env python3
"""Regression checks for late-game advisor scoring decay."""

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
            "megaCredits": 20,
            "megaCreditProduction": 8,
            "steelProduction": 1,
            "titaniumProduction": 2,
            "cardsInHandNbr": 5,
            "tableau": [
                {"name": "Mars University"},
                {"name": "Venus Waystation"},
                {"name": "Media Group"},
            ],
            "tags": {
                "science": 6,
                "earth": 4,
                "venus": 3,
                "event": 2,
                "building": 3,
            },
        },
        "players": [
            {"color": "red", "name": "me", "cardsInHandNbr": 5},
            {"color": "blue", "name": "opp", "cardsInHandNbr": 5},
            {"color": "green", "name": "opp2", "cardsInHandNbr": 5},
        ],
        "game": {
            "generation": generation,
            "phase": "action",
            "oxygenLevel": oxygen,
            "temperature": temperature,
            "oceans": oceans,
            "venusScaleLevel": 18,
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

    early = build_state(generation=2, temperature=-24, oxygen=2, oceans=1)
    late = build_state(generation=8, temperature=-4, oxygen=9, oceans=6)

    olympus_early = adjusted_score(engine, db, early, "Olympus Conference")
    olympus_late = adjusted_score(engine, db, late, "Olympus Conference")
    assert olympus_late <= olympus_early - 4, (olympus_early, olympus_late)

    aerobraking_early = adjusted_score(engine, db, early, "Optimal Aerobraking")
    aerobraking_late = adjusted_score(engine, db, late, "Optimal Aerobraking")
    assert aerobraking_late <= aerobraking_early - 4, (aerobraking_early, aerobraking_late)

    print("advisor late-scoring regression checks: OK")


if __name__ == "__main__":
    main()
