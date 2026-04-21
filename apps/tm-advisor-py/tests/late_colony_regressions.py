#!/usr/bin/env python3
"""Regression checks for late-game colony placement card decay."""

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
from tm_advisor.colony_advisor import analyze_trade_options, colony_trade_value_at  # noqa: E402
from tm_advisor.draft_play_advisor import play_hold_advice  # noqa: E402
from tm_advisor.economy import resource_values  # noqa: E402
from tm_advisor.requirements import RequirementsChecker  # noqa: E402


def build_state(*, generation: int, temperature: int, oxygen: int, oceans: int) -> GameState:
    return GameState({
        "thisPlayer": {
            "color": "red",
            "name": "me",
            "megaCredits": 40,
            "megaCreditProduction": 12,
            "steelProduction": 2,
            "titaniumProduction": 4,
            "energyProduction": 4,
            "cardsInHandNbr": 6,
            "coloniesCount": 2,
            "tableau": [
                {"name": "Morning Star Inc."},
                {"name": "Venus Waystation"},
                {"name": "Mars University"},
                {"name": "Olympus Conference"},
            ],
            "tags": {
                "science": 8,
                "earth": 4,
                "venus": 12,
                "space": 3,
                "event": 4,
            },
        },
        "players": [
            {"color": "red", "name": "me", "cardsInHandNbr": 6, "coloniesCount": 2},
            {"color": "blue", "name": "opp", "cardsInHandNbr": 5, "coloniesCount": 2},
            {"color": "green", "name": "opp2", "cardsInHandNbr": 5, "coloniesCount": 1},
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
            "colonies": [
                {"name": "Europa", "isActive": True, "trackPosition": 5, "colonies": ["red", "blue"]},
                {"name": "Luna", "isActive": True, "trackPosition": 2, "colonies": ["red", "green"]},
                {"name": "Titan", "isActive": True, "trackPosition": 2, "colonies": []},
            ],
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
    req_checker = RequirementsChecker()

    early = build_state(generation=3, temperature=-20, oxygen=3, oceans=2)
    late = build_state(generation=10, temperature=4, oxygen=12, oceans=9)

    trading_early = adjusted_score(engine, db, early, "Trading Colony")
    trading_late = adjusted_score(engine, db, late, "Trading Colony")
    assert trading_late <= trading_early - 6, (trading_early, trading_late)

    research_early = adjusted_score(engine, db, early, "Research Colony")
    research_late = adjusted_score(engine, db, late, "Research Colony")
    assert research_late <= research_early - 8, (research_early, research_late)
    assert research_late <= 86, research_late

    ship_early = adjusted_score(engine, db, early, "Interplanetary Colony Ship")
    ship_late = adjusted_score(engine, db, late, "Interplanetary Colony Ship")
    assert ship_late <= ship_early - 6, (ship_early, ship_late)

    port_early = adjusted_score(engine, db, early, "Space Port Colony")
    port_late = adjusted_score(engine, db, late, "Space Port Colony")
    assert port_late <= port_early - 4, (port_early, port_late)
    assert port_late <= 86, port_late

    rv = resource_values(1)
    europa_track_5 = colony_trade_value_at("Europa", 5, 0, rv, 1)
    assert europa_track_5["resource"] == "plant-prod", europa_track_5
    assert europa_track_5["raw_amount"] == 1, europa_track_5
    assert europa_track_5["trade_mc"] == round(rv["plant_prod"], 1), europa_track_5
    assert europa_track_5["trade_mc"] < rv["ocean"], europa_track_5

    maxed_oceans = build_state(generation=7, temperature=8, oxygen=14, oceans=9)
    maxed_oceans.me.mc = 20
    maxed_oceans.me.fleet_size = 2
    maxed_oceans.me.trades_this_gen = 1
    trade = analyze_trade_options(maxed_oceans)
    europa = next(t for t in trade["trades"] if t["name"] == "Europa")
    assert europa["resource"] == "plant-prod", europa
    assert europa["net_profit"] < 0, europa
    assert "Europa" not in (trade.get("best_hint") or ""), trade

    full_fleet = build_state(generation=7, temperature=8, oxygen=14, oceans=9)
    full_fleet.me.mc = 7
    full_fleet.me.energy = 5
    full_fleet.me.fleet_size = 1
    full_fleet.me.trades_this_gen = 1
    advice = play_hold_advice(
        [{"name": "Project Inspection", "calculatedCost": 0}],
        full_fleet,
        engine,
        req_checker,
    )
    assert not any("trade выгоднее" in (entry.get("reason") or "") for entry in advice), advice

    print("advisor late-colony regression checks: OK")


if __name__ == "__main__":
    main()
