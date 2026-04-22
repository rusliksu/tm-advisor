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


def build_calculated_cost_state() -> GameState:
    hand = [
        {"name": "Underground City", "calculatedCost": 13, "tags": ["City", "Building"]},
        {"name": "Corona Extractor", "calculatedCost": 3, "tags": ["Space", "Power"]},
        {"name": "Hackers", "calculatedCost": 0, "tags": []},
    ]
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 12,
        "steel": 0,
        "titanium": 0,
        "plants": 0,
        "energy": 0,
        "heat": 0,
        "megaCreditProduction": 19,
        "steelProduction": 7,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 7,
        "heatProduction": 3,
        "terraformRating": 42,
        "cardsInHandNbr": len(hand),
        "tableau": [
            {"name": "Cheung Shing MARS"},
            {"name": "Earth Catapult"},
        ],
        "tags": {"building": 8, "science": 4, "power": 4, "city": 1},
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


def build_soil_studies_state() -> GameState:
    hand = [
        {"name": "Soil Studies", "calculatedCost": 8, "tags": []},
    ]
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 12,
        "steel": 0,
        "titanium": 0,
        "plants": 1,
        "energy": 0,
        "heat": 0,
        "megaCreditProduction": 19,
        "steelProduction": 1,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 7,
        "heatProduction": 3,
        "terraformRating": 42,
        "cardsInHandNbr": len(hand),
        "coloniesCount": 3,
        "tableau": [{"name": "Cheung Shing MARS"}],
        "tags": {"venus": 1, "plant": 1, "microbe": 2},
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
            "temperature": -4,
            "oceans": 8,
            "venusScaleLevel": 30,
            "milestones": [],
            "awards": [],
            "colonies": [{"name": "Luna"}, {"name": "Ceres"}, {"name": "Triton"}],
            "gameOptions": {"expansions": {"prelude": True, "venusNext": True, "colonies": True}},
        },
    })


def build_endgame_value_order_state() -> GameState:
    hand = [
        {"name": "Symbiotic Fungus", "calculatedCost": 0, "tags": ["Microbe"]},
        {"name": "Aquifer Pumping", "calculatedCost": 13, "tags": ["Building"]},
    ]
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 30,
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
        "tableau": [
            {"name": "Cheung Shing MARS"},
            {"name": "Decomposers", "resources": 2},
        ],
        "tags": {"microbe": 2, "building": 6},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Cheung Shing MARS"}],
        "cardsInHand": hand,
        "game": {
            "generation": 10,
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

    calculated_cost_state = build_calculated_cost_state()
    calculated_advice = {
        row["name"]: row
        for row in play_hold_advice(
            calculated_cost_state.cards_in_hand,
            calculated_cost_state,
            synergy,
            req_checker,
        )
    }
    underground = calculated_advice["Underground City"]
    assert underground["action"] == "HOLD", underground
    assert "13 MC eff > 12" in underground["reason"], underground
    assert "-2 discount" not in underground["reason"], underground
    hackers = calculated_advice["Hackers"]
    assert hackers["action"] == "SELL", hackers

    calculated_alloc = mc_allocation_advice(
        calculated_cost_state, synergy, req_checker)["allocations"]
    assert all(
        not a.get("action", "").startswith("Play Corona Extractor")
        for a in calculated_alloc
    ), calculated_alloc
    assert all(
        not a.get("action", "").startswith("Play Hackers")
        for a in calculated_alloc
    ), calculated_alloc

    soil_eff = parser.get("Soil Studies")
    assert soil_eff is not None
    assert soil_eff.gains_resources.get("plant", 0) == 0, soil_eff.gains_resources
    assert soil_eff.scaled_gains_resources == [{
        "resource": "plant",
        "amount": 1,
        "scales": [
            {"kind": "tag", "name": "venus"},
            {"kind": "tag", "name": "plant"},
            {"kind": "colony"},
        ],
    }], soil_eff.scaled_gains_resources
    greenhouses_eff = parser.get("Greenhouses")
    assert greenhouses_eff is not None
    assert greenhouses_eff.gains_resources.get("plant", 0) == 1, greenhouses_eff.gains_resources
    assert greenhouses_eff.scaled_gains_resources == [], greenhouses_eff.scaled_gains_resources

    soil_state = build_soil_studies_state()
    soil_advice = {
        row["name"]: row
        for row in play_hold_advice(soil_state.cards_in_hand, soil_state, synergy, req_checker)
    }
    soil = soil_advice["Soil Studies"]
    assert soil["action"] == "SELL", soil
    assert "value 2.5 < cost 8" in soil["reason"], soil
    assert soil["play_value_now"] >= 2.5, soil

    soil_alloc = mc_allocation_advice(soil_state, synergy, req_checker)["allocations"]
    assert all(
        not a["action"].startswith("Play Soil Studies")
        for a in soil_alloc
    ), soil_alloc

    value_order_state = build_endgame_value_order_state()
    value_order_advice = {
        row["name"]: row
        for row in play_hold_advice(
            value_order_state.cards_in_hand, value_order_state, synergy, req_checker)
    }
    symbiotic = value_order_advice["Symbiotic Fungus"]
    aquifer = value_order_advice["Aquifer Pumping"]
    assert symbiotic["action"] == "PLAY", symbiotic
    assert symbiotic["play_value_now"] < 2, symbiotic
    assert "low immediate value" in symbiotic["reason"], symbiotic
    assert aquifer["play_value_now"] > 10, aquifer
    assert aquifer["priority"] < symbiotic["priority"], (aquifer, symbiotic)

    value_order_alloc = mc_allocation_advice(
        value_order_state, synergy, req_checker)["allocations"]
    play_names = [
        a["action"].replace("Play ", "")
        for a in value_order_alloc
        if a.get("type") == "card" and a.get("action", "").startswith("Play ")
    ]
    assert play_names.index("Aquifer Pumping") < play_names.index("Symbiotic Fungus"), value_order_alloc

    print("advisor endgame allocation regression checks: OK")


if __name__ == "__main__":
    main()
