#!/usr/bin/env python3
"""Regressions for action parsing/value leakage into play advice."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.advisor import AdvisorBot  # noqa: E402
from tm_advisor.analysis import _generate_alerts, _vp_projection, is_game_end_triggered  # noqa: E402
from tm_advisor.constants import FREE_TRADE_CARDS  # noqa: E402
from tm_advisor.draft_play_advisor import (  # noqa: E402
    _estimate_action_value,
    _estimate_card_value_rich,
    _value_from_effects,
    mc_allocation_advice,
    play_hold_advice,
)
from tm_advisor.economy import resource_values  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402


def build_state() -> GameState:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 24,
        "steel": 0,
        "titanium": 8,
        "plants": 1,
        "energy": 0,
        "heat": 3,
        "megaCreditProduction": 5,
        "steelProduction": 0,
        "titaniumProduction": 4,
        "plantProduction": 1,
        "energyProduction": 3,
        "heatProduction": 3,
        "terraformRating": 18,
        "cardsInHandNbr": 2,
        "tableau": [
            {"name": "Asteroid Mining"},
            {"name": "Import of Advanced GHG"},
        ],
        "tags": {
            "space": 3,
            "power": 1,
            "jovian": 2,
            "event": 3,
        },
    }
    opp1 = {
        "color": "blue",
        "name": "opp1",
        "megaCredits": 10,
        "terraformRating": 20,
        "cardsInHandNbr": 0,
        "tableau": [],
        "tags": {},
    }
    opp2 = {
        "color": "green",
        "name": "opp2",
        "megaCredits": 20,
        "terraformRating": 20,
        "cardsInHandNbr": 0,
        "tableau": [],
        "tags": {},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me, opp1, opp2],
        "pickedCorporationCard": [{"name": "Saturn Systems"}],
        "cardsInHand": [
            {"name": "Energy Market", "calculatedCost": 3, "tags": ["Power"]},
            {"name": "Venus Trade Hub", "calculatedCost": 12, "tags": ["Venus", "Space"]},
        ],
        "game": {
            "generation": 3,
            "phase": "action",
            "oxygenLevel": 1,
            "temperature": -30,
            "oceans": 0,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [],
            "colonies": [
                {"name": "Luna", "isActive": True, "trackPosition": 3, "colonies": []},
                {"name": "Ceres", "isActive": True, "trackPosition": 2, "colonies": []},
            ],
            "gameOptions": {
                "expansions": {
                    "prelude": True,
                    "colonies": True,
                    "venusNext": True,
                },
            },
        },
    })


def build_topsoil_state(*, colonies=None, tableau=None, corp="Teractor", hand=None) -> GameState:
    colonies = colonies or []
    tableau = tableau or []
    hand = hand or [{"name": "Topsoil Contract", "calculatedCost": 8, "tags": ["Microbe", "Earth"]}]
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 25,
        "steel": 0,
        "titanium": 0,
        "plants": 0,
        "energy": 0,
        "heat": 0,
        "megaCreditProduction": 5,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 20,
        "cardsInHandNbr": len(hand),
        "tableau": tableau,
        "tags": {},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": corp}],
        "cardsInHand": hand,
        "game": {
            "generation": 4,
            "phase": "action",
            "oxygenLevel": 2,
            "temperature": -20,
            "oceans": 2,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [],
            "colonies": [
                {"name": name, "isActive": True, "trackPosition": 2, "colonies": []}
                for name in colonies
            ],
            "gameOptions": {"expansions": {"prelude": True, "colonies": True}},
        },
    })


def build_olympus_state(*, generation=5, hand=None) -> GameState:
    hand = hand or [
        {"name": "Olympus Conference", "calculatedCost": 10, "tags": ["Science", "Earth", "Building"]},
        {"name": "Restricted Area", "calculatedCost": 11, "tags": ["Science"]},
        {"name": "Io Sulphur Research", "calculatedCost": 17, "tags": ["Science", "Jovian"]},
        {"name": "Adapted Lichen", "calculatedCost": 9, "tags": ["Plant"]},
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
        "megaCreditProduction": 8,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 20,
        "cardsInHandNbr": len(hand),
        "tableau": [
            {"name": "Saturn Systems"},
            {"name": "Asteroid Mining"},
        ],
        "tags": {
            "science": 1,
            "space": 2,
            "jovian": 1,
        },
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Saturn Systems"}],
        "cardsInHand": hand,
        "game": {
            "generation": generation,
            "phase": "action",
            "oxygenLevel": 2,
            "temperature": -24,
            "oceans": 3,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "gameOptions": {"expansions": {"prelude": True, "colonies": True}},
        },
    })


def build_standard_technology_state(*, generation=6, hand=None) -> GameState:
    hand = hand or [
        {"name": "Standard Technology", "calculatedCost": 6, "tags": ["Science"]},
    ]
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 25,
        "steel": 0,
        "titanium": 0,
        "plants": 0,
        "energy": 3,
        "heat": 8,
        "megaCreditProduction": 10,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 1,
        "energyProduction": 2,
        "heatProduction": 2,
        "terraformRating": 20,
        "cardsInHandNbr": len(hand),
        "tableau": [{"name": "Saturn Systems"}],
        "tags": {"science": 1, "space": 2},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Saturn Systems"}],
        "cardsInHand": hand,
        "game": {
            "generation": generation,
            "phase": "action",
            "oxygenLevel": 3,
            "temperature": -18,
            "oceans": 3,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [],
            "colonies": [
                {"name": "Luna", "isActive": True, "trackPosition": 4, "colonies": []},
                {"name": "Callisto", "isActive": True, "trackPosition": 3, "colonies": []},
            ],
            "gameOptions": {"expansions": {"prelude": True, "colonies": True}},
        },
    })


def build_budget_sequence_state(*, generation=7, hand=None) -> GameState:
    hand = hand or [
        {"name": "Nuclear Zone", "calculatedCost": 10, "tags": ["Earth"]},
        {"name": "Io Sulphur Research", "calculatedCost": 17, "tags": ["Science", "Jovian"]},
        {"name": "Mohole Area", "calculatedCost": 20, "tags": ["Building"]},
        {"name": "Aerosport Tournament", "calculatedCost": 7, "tags": []},
    ]
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 37,
        "steel": 0,
        "titanium": 0,
        "plants": 0,
        "energy": 0,
        "heat": 0,
        "megaCreditProduction": 20,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 26,
        "cardsInHandNbr": len(hand),
        "tableau": [
            {"name": "Saturn Systems"},
            {"name": "Olympus Conference"},
        ],
        "tags": {
            "science": 5,
            "space": 8,
            "jovian": 3,
            "building": 3,
            "earth": 2,
        },
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Saturn Systems"}],
        "cardsInHand": hand,
        "game": {
            "generation": generation,
            "phase": "action",
            "oxygenLevel": 4,
            "temperature": -20,
            "oceans": 4,
            "venusScaleLevel": 16,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "gameOptions": {"expansions": {"prelude": True, "colonies": True, "venusNext": True}},
        },
    })


def build_reds_tax_space_event_state() -> GameState:
    hand = [
        {"name": "Giant Ice Asteroid", "calculatedCost": 36, "tags": ["Space", "Event"]},
        {"name": "Comet", "calculatedCost": 21, "tags": ["Space", "Event"]},
    ]
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 9,
        "steel": 0,
        "titanium": 9,
        "plants": 0,
        "energy": 0,
        "heat": 8,
        "megaCreditProduction": 12,
        "steelProduction": 0,
        "titaniumProduction": 2,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 22,
        "cardsInHandNbr": len(hand),
        "tableau": [
            {"name": "Celestic"},
        ],
        "tags": {
            "space": 4,
            "event": 1,
        },
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Celestic"}],
        "cardsInHand": hand,
        "game": {
            "generation": 7,
            "phase": "action",
            "oxygenLevel": 5,
            "temperature": -14,
            "oceans": 5,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "turmoil": {
                "ruling": "Reds",
                "dominant": "Mars First",
                "politicalAgendas": {
                    "reds": {
                        "policyId": "rp01",
                    },
                },
                "parties": [],
                "lobby": [],
                "policyActionUsers": [],
            },
            "gameOptions": {
                "expansions": {"prelude": True, "turmoil": True},
            },
        },
    })


def build_floater_gate_state(*, floater_cards=None) -> GameState:
    floater_cards = floater_cards or []
    tableau = [{"name": name, "resources": resources} for name, resources in floater_cards]
    hand = [
        {"name": "Airliners", "calculatedCost": 11, "tags": []},
        {"name": "Aerosport Tournament", "calculatedCost": 7, "tags": []},
        {"name": "Air Raid", "calculatedCost": 0, "tags": []},
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
        "megaCreditProduction": 10,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 24,
        "cardsInHandNbr": len(hand),
        "tableau": tableau,
        "tags": {"venus": 2},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Celestic"}],
        "cardsInHand": hand,
        "game": {
            "generation": 7,
            "phase": "action",
            "oxygenLevel": 5,
            "temperature": -16,
            "oceans": 4,
            "venusScaleLevel": 12,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "gameOptions": {"expansions": {"prelude": True, "colonies": True, "venusNext": True}},
        },
    })


def build_endgame_empty_tag_state() -> GameState:
    hand = [
        {"name": "Mohole Area", "calculatedCost": 20, "tags": []},
        {"name": "Strip Mine", "calculatedCost": 25, "tags": []},
        {"name": "Artificial Lake", "calculatedCost": 15, "tags": []},
    ]
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 40,
        "steel": 0,
        "titanium": 0,
        "plants": 0,
        "energy": 0,
        "heat": 0,
        "megaCreditProduction": 14,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 30,
        "cardsInHandNbr": len(hand),
        "tableau": [],
        "tags": {},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Credicor"}],
        "cardsInHand": hand,
        "game": {
            "generation": 8,
            "phase": "action",
            "oxygenLevel": 13,
            "temperature": 6,
            "oceans": 8,
            "venusScaleLevel": 26,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "gameOptions": {"expansions": {"prelude": True, "colonies": True, "venusNext": True}},
        },
    })


def build_endgame_floater_req_state(*, floaters=0) -> GameState:
    hand = [
        {"name": "Aerosport Tournament", "calculatedCost": 5, "tags": []},
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
        "megaCreditProduction": 12,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 32,
        "cardsInHandNbr": len(hand),
        "tableau": [{"name": "Local Shading", "resources": floaters}],
        "tags": {"venus": 2},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Celestic"}],
        "cardsInHand": hand,
        "game": {
            "generation": 9,
            "phase": "action",
            "oxygenLevel": 14,
            "temperature": 8,
            "oceans": 9,
            "venusScaleLevel": 18,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "gameOptions": {"expansions": {"prelude": True, "colonies": True, "venusNext": True}},
        },
    })


def build_endgame_steel_budget_state() -> GameState:
    hand = [
        {"name": "Cutting Edge Technology", "calculatedCost": 12, "tags": ["Science"]},
        {"name": "Venus Shuttles", "calculatedCost": 9, "tags": ["Venus"]},
        {"name": "Tectonic Stress Power", "calculatedCost": 18},
    ]
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 19,
        "steel": 8,
        "titanium": 0,
        "plants": 0,
        "energy": 0,
        "heat": 0,
        "megaCreditProduction": 7,
        "steelProduction": 1,
        "titaniumProduction": 1,
        "plantProduction": 4,
        "energyProduction": 10,
        "heatProduction": 5,
        "terraformRating": 27,
        "cardsInHandNbr": len(hand),
        "tableau": [{"name": "Septem Tribus"}],
        "tags": {
            "science": 1,
            "wild": 1,
            "power": 3,
            "building": 3,
            "earth": 4,
        },
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Septem Tribus"}],
        "cardsInHand": hand,
        "game": {
            "generation": 7,
            "phase": "action",
            "oxygenLevel": 9,
            "temperature": -12,
            "oceans": 8,
            "venusScaleLevel": 2,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "gameOptions": {"expansions": {"prelude": True, "venusNext": True}},
        },
    })


def build_last_gen_discounted_tectonic_state() -> GameState:
    hand = [
        {"name": "Tectonic Stress Power", "calculatedCost": 16},
    ]
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 30,
        "steel": 5,
        "titanium": 0,
        "plants": 0,
        "energy": 3,
        "heat": 11,
        "megaCreditProduction": 7,
        "steelProduction": 1,
        "titaniumProduction": 1,
        "plantProduction": 7,
        "energyProduction": 9,
        "heatProduction": 5,
        "terraformRating": 34,
        "cardsInHandNbr": len(hand),
        "tableau": [{"name": "Septem Tribus"}, {"name": "Cutting Edge Technology"}],
        "tags": {
            "science": 2,
            "wild": 1,
            "power": 3,
            "building": 5,
        },
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Septem Tribus"}],
        "cardsInHand": hand,
        "game": {
            "generation": 8,
            "phase": "action",
            "oxygenLevel": 12,
            "temperature": 2,
            "oceans": 9,
            "venusScaleLevel": 2,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "gameOptions": {"expansions": {"prelude": True, "venusNext": True}},
        },
    })


def build_endgame_immediate_low_score_city_state() -> GameState:
    hand = [
        {"name": "Underground City", "calculatedCost": 13, "tags": ["City", "Building"]},
        {"name": "Venus Shuttles", "calculatedCost": 6, "tags": ["Venus"]},
        {"name": "Symbiotic Fungus", "calculatedCost": 0, "tags": ["Microbe"]},
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
        "tableau": [{"name": "Cheung Shing MARS"}, {"name": "Imported Nutrients"}],
        "tags": {
            "building": 20,
            "space": 5,
            "science": 8,
            "power": 6,
            "earth": 5,
            "jovian": 2,
            "plant": 1,
            "microbe": 2,
            "animal": 2,
            "city": 2,
            "event": 9,
        },
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


def build_end_triggered_noise_state() -> GameState:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 9,
        "steel": 0,
        "titanium": 0,
        "plants": 7,
        "energy": 3,
        "heat": 3,
        "megaCreditProduction": 6,
        "steelProduction": 1,
        "titaniumProduction": 1,
        "plantProduction": 7,
        "energyProduction": 8,
        "heatProduction": 5,
        "terraformRating": 39,
        "cardsInHandNbr": 0,
        "tableau": [{"name": "Small Animals", "resources": 3}],
        "tags": {"animal": 1},
    }
    opp = {
        "color": "blue",
        "name": "opp",
        "megaCredits": 45,
        "terraformRating": 35,
        "cardsInHandNbr": 0,
        "tableau": [],
        "tags": {},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me, opp],
        "pickedCorporationCard": [{"name": "Septem Tribus"}],
        "cardsInHand": [],
        "game": {
            "generation": 8,
            "phase": "action",
            "oxygenLevel": 14,
            "temperature": 8,
            "oceans": 9,
            "venusScaleLevel": 8,
            "milestones": [],
            "awards": [
                {"name": "Industrialist", "playerName": "opp", "scores": []},
                {"name": "Magnate", "playerName": "opp", "scores": []},
                {
                    "name": "Benefactor",
                    "scores": [
                        {"color": "red", "score": 11},
                        {"color": "blue", "score": 7},
                    ],
                },
            ],
            "colonies": [],
            "turmoil": {
                "ruling": "Mars First",
                "dominant": "Reds",
                "coming": "Dry Deserts",
                "distant": "Riots",
                "parties": [],
                "lobby": [],
                "policyActionUsers": [],
            },
            "gameOptions": {
                "expansions": {"prelude": True, "turmoil": True},
            },
        },
    })


def build_non_vp_resource_currency_state() -> GameState:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 0,
        "steel": 0,
        "titanium": 0,
        "plants": 0,
        "energy": 0,
        "heat": 0,
        "megaCreditProduction": 0,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 20,
        "cardsInHandNbr": 0,
        "tableau": [
            {"name": "Atmo Collectors", "resources": 5},
            {"name": "GHG Producing Bacteria", "resources": 5},
            {"name": "Nitrite Reducing Bacteria", "resources": 5},
            {"name": "Sulphur-Eating Bacteria", "resources": 5},
        ],
        "tags": {},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Teractor"}],
        "cardsInHand": [],
        "game": {
            "generation": 4,
            "phase": "action",
            "oxygenLevel": 5,
            "temperature": -10,
            "oceans": 3,
            "venusScaleLevel": 12,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "gameOptions": {"expansions": {"prelude": True, "venusNext": True, "colonies": True}},
        },
    })


def build_colony_card_value_state() -> GameState:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 60,
        "steel": 0,
        "titanium": 8,
        "titaniumValue": 4,
        "plants": 1,
        "energy": 3,
        "heat": 0,
        "megaCreditProduction": 9,
        "steelProduction": 0,
        "titaniumProduction": 2,
        "plantProduction": 0,
        "energyProduction": 3,
        "heatProduction": 0,
        "terraformRating": 24,
        "cardsInHandNbr": 2,
        "coloniesCount": 1,
        "fleetSize": 1,
        "tradesThisGeneration": 0,
        "tableau": [{"name": "PhoboLog"}],
        "tags": {"space": 2, "science": 1},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "PhoboLog"}],
        "cardsInHand": [
            {"name": "Research Colony", "calculatedCost": 20, "tags": ["Space", "Science"]},
            {"name": "Space Port Colony", "calculatedCost": 27, "tags": ["Space"]},
        ],
        "game": {
            "generation": 4,
            "phase": "action",
            "oxygenLevel": 3,
            "temperature": -20,
            "oceans": 2,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [],
            "colonies": [
                {"name": "Luna", "isActive": True, "trackPosition": 4, "colonies": []},
                {"name": "Europa", "isActive": True, "trackPosition": 3, "colonies": []},
                {"name": "Triton", "isActive": True, "trackPosition": 2, "colonies": []},
            ],
            "gameOptions": {
                "expansions": {"prelude": True, "colonies": True},
            },
        },
    })


def build_crash_site_requirement_state(*, actions_by_color=None) -> GameState:
    actions_by_color = actions_by_color or {}
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 20,
        "steel": 0,
        "titanium": 0,
        "plants": 0,
        "energy": 0,
        "heat": 0,
        "megaCreditProduction": 5,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 20,
        "cardsInHandNbr": 1,
        "tableau": [{"name": "Teractor"}],
        "tags": {},
        "actionsThisGeneration": actions_by_color.get("red", []),
    }
    opp = {
        "color": "blue",
        "name": "opp",
        "megaCredits": 20,
        "terraformRating": 20,
        "cardsInHandNbr": 0,
        "tableau": [],
        "tags": {},
        "actionsThisGeneration": actions_by_color.get("blue", []),
    }
    return GameState({
        "thisPlayer": me,
        "players": [me, opp],
        "pickedCorporationCard": [{"name": "Teractor"}],
        "cardsInHand": [
            {"name": "Crash Site Cleanup", "calculatedCost": 4, "tags": []},
        ],
        "game": {
            "generation": 4,
            "phase": "action",
            "oxygenLevel": 4,
            "temperature": -18,
            "oceans": 3,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "gameOptions": {"expansions": {"prelude": True}},
        },
    })


def build_safe_milestone_spend_state() -> GameState:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 25,
        "steel": 0,
        "titanium": 0,
        "plants": 0,
        "energy": 3,
        "heat": 0,
        "megaCreditProduction": 9,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 3,
        "heatProduction": 0,
        "terraformRating": 24,
        "cardsInHandNbr": 1,
        "coloniesCount": 1,
        "fleetSize": 1,
        "tradesThisGeneration": 0,
        "tableau": [{"name": "Teractor"}],
        "tags": {"space": 1, "science": 1},
    }
    opp = {
        "color": "blue",
        "name": "opp",
        "megaCredits": 20,
        "terraformRating": 20,
        "cardsInHandNbr": 0,
        "coloniesCount": 1,
        "tableau": [],
        "tags": {},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me, opp],
        "pickedCorporationCard": [{"name": "Teractor"}],
        "cardsInHand": [
            {"name": "Research Colony", "calculatedCost": 20, "tags": ["Space", "Science"]},
        ],
        "game": {
            "generation": 4,
            "phase": "action",
            "oxygenLevel": 3,
            "temperature": -20,
            "oceans": 2,
            "venusScaleLevel": 0,
            "milestones": [
                {
                    "name": "Pioneer",
                    "scores": [
                        {"color": "red", "score": 3, "claimable": True},
                        {"color": "blue", "score": 1, "claimable": False},
                    ],
                }
            ],
            "awards": [],
            "colonies": [
                {"name": "Luna", "isActive": True, "trackPosition": 4, "colonies": []},
                {"name": "Triton", "isActive": True, "trackPosition": 3, "colonies": []},
            ],
            "gameOptions": {
                "expansions": {"prelude": True, "colonies": True},
            },
        },
    })


def main() -> int:
    bot = AdvisorBot("test", snapshot_mode=True)

    energy_eff = bot.effect_parser.get("Energy Market")
    assert energy_eff is not None
    assert energy_eff.production_change == {}, energy_eff.production_change
    assert energy_eff.gains_resources == {}, energy_eff.gains_resources
    assert len(energy_eff.actions) == 2, energy_eff.actions
    lunar_exports_eff = bot.effect_parser.get("Lunar Exports")
    assert lunar_exports_eff is not None
    assert lunar_exports_eff.production_change == {"mc": 5}, lunar_exports_eff.production_change
    pets_eff = bot.effect_parser.get("Pets")
    assert pets_eff is not None
    pets_value = _value_from_effects(
        pets_eff,
        14,
        resource_values(14),
        "early",
        card_name="Pets",
        card_tags=["Earth", "Animal"],
        db=bot.db,
    )
    assert pets_value > 3.5, pets_value

    floyd_eff = bot.effect_parser.get("Floyd Continuum")
    assert floyd_eff is not None
    assert floyd_eff.draws_cards == 0, floyd_eff.draws_cards
    assert floyd_eff.actions == [
        {"cost": "free", "effect": "gain 3 MC per completed terraforming parameter"}
    ], floyd_eff.actions
    ender_eff = bot.effect_parser.get("Ender")
    assert ender_eff is not None
    assert ender_eff.draws_cards == 0, ender_eff.draws_cards
    assert ender_eff.actions == [], ender_eff.actions
    tate_eff = bot.effect_parser.get("Tate")
    assert tate_eff is not None
    assert tate_eff.draws_cards == 0, tate_eff.draws_cards
    assert tate_eff.actions == [], tate_eff.actions
    sponsored_eff = bot.effect_parser.get("Sponsored Academies")
    assert sponsored_eff is not None
    assert sponsored_eff.draws_cards == 3, sponsored_eff.draws_cards
    assert sponsored_eff.discards_cards == 1, sponsored_eff.discards_cards
    assert sponsored_eff.opponents_draw_cards == 1, sponsored_eff.opponents_draw_cards
    sponsored_rv = resource_values(6)
    sponsored_wide_hand = _value_from_effects(
        sponsored_eff,
        6,
        sponsored_rv,
        "mid",
        card_name="Sponsored Academies",
        hand_cards=[
            {"name": "Sponsored Academies"},
            {"name": "low-value A"},
            {"name": "low-value B"},
            {"name": "low-value C"},
            {"name": "low-value D"},
        ],
    )
    sponsored_tight_hand = _value_from_effects(
        sponsored_eff,
        6,
        sponsored_rv,
        "mid",
        card_name="Sponsored Academies",
        hand_cards=[{"name": "Sponsored Academies"}, {"name": "only other card"}],
    )
    assert round(sponsored_wide_hand, 2) == round(3 * sponsored_rv["card"] - 1.0 + sponsored_rv["vp"], 2), sponsored_wide_hand
    assert round(sponsored_tight_hand, 2) == round(3 * sponsored_rv["card"] - 2.5 + sponsored_rv["vp"], 2), sponsored_tight_hand
    assert sponsored_wide_hand > 2 * sponsored_rv["card"], sponsored_wide_hand
    assert sponsored_tight_hand < sponsored_wide_hand, (sponsored_tight_hand, sponsored_wide_hand)
    spire_eff = bot.effect_parser.get("Spire")
    assert spire_eff is not None
    assert spire_eff.draws_cards == 4, spire_eff.draws_cards
    assert spire_eff.discards_cards == 3, spire_eff.discards_cards
    assert spire_eff.discard_after_draw is True, spire_eff.discard_after_draw
    spire_value = _value_from_effects(
        spire_eff,
        6,
        sponsored_rv,
        "mid",
        card_name="Spire",
    )
    assert round(spire_value, 2) == round(sponsored_rv["card"] + 3 * 0.75, 2), spire_value
    assert spire_value < 4 * sponsored_rv["card"], spire_value
    nanotech_eff = bot.effect_parser.get("Nanotech Industries")
    assert nanotech_eff is not None
    assert nanotech_eff.resource_holds is True, nanotech_eff.resource_holds
    assert nanotech_eff.resource_type == "Science", nanotech_eff.resource_type
    assert nanotech_eff.draws_cards == 3, nanotech_eff.draws_cards
    assert nanotech_eff.discards_cards == 1, nanotech_eff.discards_cards
    assert nanotech_eff.discard_after_draw is True, nanotech_eff.discard_after_draw
    assert nanotech_eff.vp_per == {"amount": 1, "per": "2 resources"}, nanotech_eff.vp_per
    assert nanotech_eff.actions == [
        {"cost": "free", "effect": "add 1 science resource to any eligible card"}
    ], nanotech_eff.actions
    assert {"type": "Science", "amount": 1, "target": "any", "per_tag": None} in nanotech_eff.adds_resources, nanotech_eff.adds_resources
    nanotech_value = _value_from_effects(
        nanotech_eff,
        6,
        sponsored_rv,
        "mid",
        card_name="Nanotech Industries",
    )
    assert nanotech_value > 2 * sponsored_rv["card"], nanotech_value
    assert nanotech_value < 30, nanotech_value
    nanotech_action_cost, nanotech_action_value = _estimate_action_value(
        "free",
        "add 1 science resource to any eligible card",
        type("NanotechMe", (), {"mc": 0, "energy": 0, "plants": 0, "heat": 0})(),
        sponsored_rv,
        6,
        source_eff=nanotech_eff,
    )
    assert nanotech_action_cost == 0, nanotech_action_cost
    assert round(nanotech_action_value, 2) == round(sponsored_rv["vp"] / 2, 2), nanotech_action_value
    floater_urbanism_eff = bot.effect_parser.get("Floater-Urbanism")
    assert floater_urbanism_eff is not None
    assert floater_urbanism_eff.resource_type == "Venusian Habitat", floater_urbanism_eff.resource_type
    assert floater_urbanism_eff.vp_per == {"amount": 1, "per": "resource"}, floater_urbanism_eff.vp_per
    assert floater_urbanism_eff.actions == [
        {
            "cost": "1 floater from any card",
            "effect": "add 1 Venusian Habitat to this card",
            "conditional": True,
        }
    ], floater_urbanism_eff.actions
    assert {"type": "Venusian Habitat", "amount": 1, "target": "this", "per_tag": None} in floater_urbanism_eff.adds_resources, floater_urbanism_eff.adds_resources
    floater_urbanism_value = _value_from_effects(
        floater_urbanism_eff,
        6,
        sponsored_rv,
        "mid",
        card_name="Floater-Urbanism",
    )
    assert floater_urbanism_value == 0, floater_urbanism_value

    power_infra_eff = bot.effect_parser.get("Power Infrastructure")
    assert power_infra_eff is not None
    assert power_infra_eff.actions == [
        {"cost": "any energy", "effect": "gain that many MC"}
    ], power_infra_eff.actions
    assert bot.effect_parser.get("AI Central").actions == [
        {"cost": "free", "effect": "draw 2 cards"}
    ], bot.effect_parser.get("AI Central").actions
    assert bot.effect_parser.get("Business Network").actions == [
        {"cost": "free", "effect": "look at the top card and either buy it or discard it"}
    ], bot.effect_parser.get("Business Network").actions
    assert bot.effect_parser.get("Inventors' Guild").actions == [
        {"cost": "free", "effect": "look at the top card and either buy it or discard it"}
    ], bot.effect_parser.get("Inventors' Guild").actions
    assert bot.effect_parser.get("Space Elevator").actions == [
        {"cost": "1 steel", "effect": "gain 5 MC"}
    ], bot.effect_parser.get("Space Elevator").actions
    assert bot.effect_parser.get("Sub-Crust Measurements").actions == [
        {"cost": "free", "effect": "draw 1 card"}
    ], bot.effect_parser.get("Sub-Crust Measurements").actions
    assert bot.effect_parser.get("Red Ships").actions == [
        {"cost": "free", "effect": "gain 1 MC per ocean-adjacent city or special tile"}
    ], bot.effect_parser.get("Red Ships").actions
    soil_eff = bot.effect_parser.get("Soil Studies")
    assert soil_eff is not None
    assert "greenery" not in soil_eff.placement, soil_eff.placement
    assert bot.db.get_generated_effect("Soil Studies").get("c") == 13, bot.db.get_generated_effect("Soil Studies")
    assert bot.effect_parser.get("Symbiotic Fungus").actions == [
        {"cost": "free", "effect": "add 1 microbe to another card"}
    ], bot.effect_parser.get("Symbiotic Fungus").actions
    assert not bot.effect_parser.get("Symbiotic Fungus").resource_holds, bot.effect_parser.get("Symbiotic Fungus").resource_holds
    assert {"type": "Microbe", "amount": 1, "target": "another", "per_tag": None} in bot.effect_parser.get("Symbiotic Fungus").adds_resources, bot.effect_parser.get("Symbiotic Fungus").adds_resources
    assert bot.effect_parser.get("Extreme-Cold Fungus").actions == [
        {"cost": "free", "effect": "gain 1 plant", "choice_group": "or"},
        {"cost": "free", "effect": "add 2 microbes to another card", "choice_group": "or"},
    ], bot.effect_parser.get("Extreme-Cold Fungus").actions
    assert not bot.effect_parser.get("Extreme-Cold Fungus").resource_holds, bot.effect_parser.get("Extreme-Cold Fungus").resource_holds
    assert {"type": "Microbe", "amount": 2, "target": "another", "per_tag": None} in bot.effect_parser.get("Extreme-Cold Fungus").adds_resources, bot.effect_parser.get("Extreme-Cold Fungus").adds_resources
    assert bot.effect_parser.get("Industrial Center").actions == [
        {"cost": "7 MC", "effect": "increase steel production 1 step"}
    ], bot.effect_parser.get("Industrial Center").actions
    assert bot.effect_parser.get("Industrial Center:ares").actions == [
        {"cost": "7 MC", "effect": "increase steel production 1 step"}
    ], bot.effect_parser.get("Industrial Center:ares").actions
    assert bot.effect_parser.get("Restricted Area:ares").actions == [
        {"cost": "2 MC", "effect": "draw 1 card"}
    ], bot.effect_parser.get("Restricted Area:ares").actions

    stormcraft_eff = bot.effect_parser.get("Stormcraft Incorporated")
    robinson_eff = bot.effect_parser.get("Robinson Industries")
    factorum_eff = bot.effect_parser.get("Factorum")
    unmi_eff = bot.effect_parser.get("United Nations Mars Initiative")
    tycho_eff = bot.effect_parser.get("Tycho Magnetics")
    kuiper_eff = bot.effect_parser.get("Kuiper Cooperative")
    palladin_eff = bot.effect_parser.get("Palladin Shipping")
    assert stormcraft_eff is not None
    assert robinson_eff is not None
    assert factorum_eff is not None
    assert unmi_eff is not None
    assert tycho_eff is not None
    assert kuiper_eff is not None
    assert palladin_eff is not None
    assert stormcraft_eff.production_change == {}, stormcraft_eff.production_change
    assert robinson_eff.production_change == {}, robinson_eff.production_change
    assert {"cost": "3 MC", "effect": "draw 1 building card"} in factorum_eff.actions, factorum_eff.actions
    assert {"cost": "3 MC", "effect": "raise TR 1 step if TR was raised this generation", "conditional": True} in unmi_eff.actions, unmi_eff.actions
    assert tycho_eff.actions == [{"cost": "any energy", "effect": "draw that many cards and keep 1"}], tycho_eff.actions
    assert {"cost": "free", "effect": "add 1 asteroid here per space tag", "conditional": True} in kuiper_eff.actions, kuiper_eff.actions
    assert {"cost": "2 titanium", "effect": "raise temperature 1 step", "conditional": True} in palladin_eff.actions, palladin_eff.actions
    septem_eff = bot.effect_parser.get("Septem Tribus")
    robots_eff = bot.effect_parser.get("Self-replicating Robots")
    orbital_eff = bot.effect_parser.get("Orbital Cleanup")
    mohole_lake_eff = bot.effect_parser.get("Mohole Lake")
    saturn_surfing_eff = bot.effect_parser.get("Saturn Surfing")
    mars_nomads_eff = bot.effect_parser.get("Mars Nomads")
    teslaract_eff = bot.effect_parser.get("Teslaract")
    hospitals_eff = bot.effect_parser.get("Hospitals")
    maxwell_eff = bot.effect_parser.get("Maxwell Base")
    geologist_eff = bot.effect_parser.get("Geologist Team")
    venus_shuttles_eff = bot.effect_parser.get("Venus Shuttles")
    breeding_farms_eff = bot.effect_parser.get("BreedingFarms")
    martian_culture_eff = bot.effect_parser.get("MartianCulture")
    nobel_labs_eff = bot.effect_parser.get("NobelLabs")
    venera_base_eff = bot.effect_parser.get("VeneraBase")
    imported_nitrogen_eff = bot.effect_parser.get("Imported Nitrogen")
    large_convoy_eff = bot.effect_parser.get("Large Convoy")
    nitrogen_from_titan_eff = bot.effect_parser.get("Nitrogen from Titan")
    air_scrapping_eff = bot.effect_parser.get("Air-Scrapping Expedition")
    space_relay_eff = bot.effect_parser.get("SpaceRelay")
    terraforming_robots_eff = bot.effect_parser.get("TerraformingRobots")
    terraforming_control_eff = bot.effect_parser.get("TerraformingControlStation")
    high_temp_superconductors_eff = bot.effect_parser.get("HighTempSuperconductors")
    bioengineering_eff = bot.effect_parser.get("Bioengineering Enclosure")
    cloud_vortex_eff = bot.effect_parser.get("Cloud Vortex Outpost")
    applied_science_eff = bot.effect_parser.get("Applied Science")
    board_eff = bot.effect_parser.get("Board of Directors")
    aeron_eff = bot.effect_parser.get("Aeron Genomics")
    demetron_eff = bot.effect_parser.get("Demetron Labs")
    darkside_syndicate_eff = bot.effect_parser.get("The Darkside of The Moon Syndicate")
    sfl_eff = bot.effect_parser.get("Search For Life")
    sflu_eff = bot.effect_parser.get("Search for Life Underground")
    assert septem_eff is not None
    assert robots_eff is not None
    assert orbital_eff is not None
    assert mohole_lake_eff is not None
    assert saturn_surfing_eff is not None
    assert mars_nomads_eff is not None
    assert teslaract_eff is not None
    assert hospitals_eff is not None
    assert maxwell_eff is not None
    assert geologist_eff is not None
    assert venus_shuttles_eff is not None
    assert breeding_farms_eff is not None
    assert martian_culture_eff is not None
    assert nobel_labs_eff is not None
    assert venera_base_eff is not None
    assert imported_nitrogen_eff is not None
    assert large_convoy_eff is not None
    assert nitrogen_from_titan_eff is not None
    assert air_scrapping_eff is not None
    assert space_relay_eff is not None
    assert terraforming_robots_eff is not None
    assert terraforming_control_eff is not None
    assert high_temp_superconductors_eff is not None
    assert bioengineering_eff is not None
    assert cloud_vortex_eff is not None
    assert applied_science_eff is not None
    assert board_eff is not None
    assert aeron_eff is not None
    assert demetron_eff is not None
    assert darkside_syndicate_eff is not None
    assert sfl_eff is not None
    assert sflu_eff is not None
    assert septem_eff.actions == [{"cost": "free", "effect": "wild tag counts as any tag for this action", "conditional": True}], septem_eff.actions
    assert {"cost": "free", "effect": "link a Space or Building card from hand with 2 resources", "conditional": True} in robots_eff.actions, robots_eff.actions
    assert orbital_eff.actions == [{"cost": "free", "effect": "gain 1 MC per science tag"}], orbital_eff.actions
    assert "space tags x 2" not in str(orbital_eff.actions), orbital_eff.actions
    assert mohole_lake_eff.actions == [{"cost": "free", "effect": "add 1 microbe or animal to another card", "conditional": True}], mohole_lake_eff.actions
    assert saturn_surfing_eff.resource_type == "Floater", saturn_surfing_eff.resource_type
    assert saturn_surfing_eff.actions == [{"cost": "1 floater", "effect": "gain 1 MC per floater here max 5", "conditional": True}], saturn_surfing_eff.actions
    assert mars_nomads_eff.actions == [{"cost": "free", "effect": "move Nomads and collect placement bonus", "conditional": True}], mars_nomads_eff.actions
    assert teslaract_eff.actions == [{"cost": "1 energy production", "effect": "increase plant production 1 step", "conditional": True}], teslaract_eff.actions
    assert hospitals_eff.resource_type == "Disease", hospitals_eff.resource_type
    assert hospitals_eff.actions == [{"cost": "1 disease", "effect": "gain 1 MC per city in play", "conditional": True}], hospitals_eff.actions
    assert maxwell_eff.actions == [{"cost": "free", "effect": "add 1 resource to another Venus card", "conditional": True}], maxwell_eff.actions
    assert geologist_eff.actions == [{"cost": "free", "effect": "identify 1 underground resource", "conditional": True}], geologist_eff.actions
    assert venus_shuttles_eff.actions == [{"cost": "dynamic Venus tag discount", "effect": "raise venus 1 step", "conditional": True}], venus_shuttles_eff.actions
    assert breeding_farms_eff.actions == [{"cost": "1 plant", "effect": "add 1 animal to any card"}], breeding_farms_eff.actions
    assert martian_culture_eff.actions == [{"cost": "free", "effect": "add 1 data to any card"}], martian_culture_eff.actions
    assert nobel_labs_eff.actions == [{"cost": "free", "effect": "add 2 microbes or 2 data or 2 floaters to any card"}], nobel_labs_eff.actions
    assert venera_base_eff.actions == [{"cost": "free", "effect": "add 1 floater to any Venus card"}], venera_base_eff.actions
    mid_rv = resource_values(5)
    for one_shot_eff, one_shot_name in (
        (imported_nitrogen_eff, "Imported Nitrogen"),
        (large_convoy_eff, "Large Convoy"),
        (nitrogen_from_titan_eff, "Nitrogen from Titan"),
        (air_scrapping_eff, "Air-Scrapping Expedition"),
    ):
        value_gen_5 = _value_from_effects(one_shot_eff, 5, mid_rv, "mid", card_name=one_shot_name, db=bot.db)
        value_gen_1 = _value_from_effects(one_shot_eff, 1, mid_rv, "mid", card_name=one_shot_name, db=bot.db)
        assert round(value_gen_5, 2) == round(value_gen_1, 2), (one_shot_name, value_gen_5, value_gen_1)
    assert _value_from_effects(imported_nitrogen_eff, 5, mid_rv, "mid", card_name="Imported Nitrogen", db=bot.db) < 30
    assert _value_from_effects(air_scrapping_eff, 5, mid_rv, "mid", card_name="Air-Scrapping Expedition", db=bot.db) < 20
    pathfinder_trigger_hand = [
        {"name": "Mars Direct", "tags": ["MARS"]},
        {"name": "Venus First", "tags": ["VENUS"]},
        {"name": "Io Mining Industries", "tags": ["JOVIAN"]},
        {"name": "Power Plant", "tags": ["POWER"]},
    ]
    assert space_relay_eff.triggers == [{"on": "you play a card with a jovian tag", "effect": "draw a card", "self": True}], space_relay_eff.triggers
    assert terraforming_robots_eff.triggers == [{"on": "play a mars tag", "effect": "add 1 specialized robot on this card", "self": False}], terraforming_robots_eff.triggers
    assert terraforming_control_eff.triggers == [{"on": "play a venus or mars tag", "effect": "pay 2 m€ less", "self": False}], terraforming_control_eff.triggers
    assert high_temp_superconductors_eff.triggers == [{"on": "playing a power card, the standard project power plant, or the kelvinist ruling policy action", "effect": "pay 3m€ less", "self": False}], high_temp_superconductors_eff.triggers
    assert high_temp_superconductors_eff.discount == {"Power": 3}, high_temp_superconductors_eff.discount
    assert _value_from_effects(space_relay_eff, 6, resource_values(6), "mid", card_name="SpaceRelay", card_tags=["SPACE", "JOVIAN"], hand_cards=pathfinder_trigger_hand, db=bot.db) > 8
    assert _value_from_effects(terraforming_robots_eff, 6, resource_values(6), "mid", card_name="TerraformingRobots", hand_cards=pathfinder_trigger_hand, db=bot.db) > 2
    assert _value_from_effects(terraforming_control_eff, 6, resource_values(6), "mid", card_name="TerraformingControlStation", hand_cards=pathfinder_trigger_hand, db=bot.db) > 17
    assert _value_from_effects(high_temp_superconductors_eff, 6, resource_values(6), "mid", card_name="HighTempSuperconductors", hand_cards=pathfinder_trigger_hand, db=bot.db) > 24
    assert bioengineering_eff.actions == [{"cost": "1 animal", "effect": "add 1 animal to another card", "conditional": True}], bioengineering_eff.actions
    assert bioengineering_eff.adds_resources == [{"type": "Animal", "amount": 2, "target": "this", "per_tag": None}], bioengineering_eff.adds_resources
    assert cloud_vortex_eff.actions == [{"cost": "1 floater", "effect": "add 1 floater to another card", "conditional": True}], cloud_vortex_eff.actions
    assert not cloud_vortex_eff.adds_resources, cloud_vortex_eff.adds_resources
    assert {"cost": "1 science", "effect": "gain 1 standard resource", "conditional": True} in applied_science_eff.actions, applied_science_eff.actions
    assert {"cost": "1 science", "effect": "add 1 resource to any card with a resource", "conditional": True} in applied_science_eff.actions, applied_science_eff.actions
    assert not applied_science_eff.adds_resources, applied_science_eff.adds_resources
    assert board_eff.actions == [{"cost": "free", "effect": "draw 1 prelude; discard it or pay 12 MC and 1 director to play it", "conditional": True}], board_eff.actions
    assert aeron_eff.actions == [{"cost": "claimed underground token(s)", "effect": "add up to 2 animals to any card", "conditional": True}], aeron_eff.actions
    assert not aeron_eff.adds_resources, aeron_eff.adds_resources
    assert demetron_eff.actions == [{"cost": "3 data", "effect": "identify 3 underground resources and claim 1", "conditional": True}], demetron_eff.actions
    assert not demetron_eff.adds_resources, demetron_eff.adds_resources
    assert {"cost": "1 titanium", "effect": "add 1 syndicate fleet to this card"} in darkside_syndicate_eff.actions, darkside_syndicate_eff.actions
    assert {"cost": "1 syndicate fleet", "effect": "steal 2 MC from each opponent", "conditional": True} in darkside_syndicate_eff.actions, darkside_syndicate_eff.actions
    assert sfl_eff.resource_type == "Science", sfl_eff.resource_type
    assert sfl_eff.vp_per == {}, sfl_eff.vp_per
    assert sfl_eff.actions == [{"cost": "1 MC", "effect": "reveal top card; if microbe add 1 science resource here", "conditional": True}], sfl_eff.actions
    assert not sfl_eff.adds_resources, sfl_eff.adds_resources
    assert sflu_eff.resource_type == "Science", sflu_eff.resource_type
    assert sflu_eff.vp_per == {}, sflu_eff.vp_per
    assert sflu_eff.actions == [{"cost": "1 MC", "effect": "identify 1 underground resource; if microbe add 1 science resource here", "conditional": True}], sflu_eff.actions
    assert not sflu_eff.adds_resources, sflu_eff.adds_resources
    chemical_eff = bot.effect_parser.get("Chemical Factory")
    theft_eff = bot.effect_parser.get("Corporate Theft")
    deep_foundations_eff = bot.effect_parser.get("Deep Foundations")
    monopoly_eff = bot.effect_parser.get("Monopoly")
    privateers_eff = bot.effect_parser.get("Space Privateers")
    stem_eff = bot.effect_parser.get("Stem Field Subsidies")
    titan_manufacturing_eff = bot.effect_parser.get("Titan Manufacturing Colony")
    shelters_eff = bot.effect_parser.get("Underground Shelters")
    voltaic_eff = bot.effect_parser.get("Voltaic Metallurgy")
    assert chemical_eff is not None
    assert theft_eff is not None
    assert deep_foundations_eff is not None
    assert monopoly_eff is not None
    assert privateers_eff is not None
    assert stem_eff is not None
    assert titan_manufacturing_eff is not None
    assert shelters_eff is not None
    assert voltaic_eff is not None
    assert chemical_eff.actions == [{"cost": "1 plant", "effect": "excavate 1 underground resource", "conditional": True}], chemical_eff.actions
    assert theft_eff.actions == [{"cost": "5 MC", "effect": "steal any 1 resource from another player", "conditional": True}], theft_eff.actions
    assert deep_foundations_eff.actions == [{"cost": "20 MC", "effect": "excavate a valid city space if possible and place a city", "conditional": True}], deep_foundations_eff.actions
    assert monopoly_eff.actions == [{"cost": "1 corruption", "effect": "increase any production 1 step", "conditional": True}], monopoly_eff.actions
    assert privateers_eff.resource_type == "Fighter", privateers_eff.resource_type
    assert privateers_eff.actions == [{"cost": "free", "effect": "steal up to 1 MC per fighter here from each other player", "conditional": True}], privateers_eff.actions
    assert stem_eff.resource_type == "Data", stem_eff.resource_type
    assert stem_eff.actions == [{"cost": "2 data", "effect": "identify 3 underground resources and claim 1", "conditional": True}], stem_eff.actions
    assert titan_manufacturing_eff.resource_type == "Tool", titan_manufacturing_eff.resource_type
    assert titan_manufacturing_eff.actions == [{"cost": "1 tool", "effect": "excavate 1 underground resource", "conditional": True}], titan_manufacturing_eff.actions
    assert shelters_eff.actions == [{"cost": "free", "effect": "place a cube on one claimed underground resource token", "conditional": True}], shelters_eff.actions
    assert voltaic_eff.actions == [{"cost": "any steel", "effect": "gain that many titanium max power tags", "conditional": True}], voltaic_eff.actions

    venus_eff = bot.effect_parser.get("Venus Trade Hub")
    assert venus_eff is not None
    assert venus_eff.gains_resources == {}, venus_eff.gains_resources
    assert any("trade" in trig.get("on", "") for trig in venus_eff.triggers), venus_eff.triggers

    standard_eff = bot.effect_parser.get("Standard Technology")
    assert standard_eff is not None
    assert any("standard project" in trig.get("on", "") for trig in standard_eff.triggers), standard_eff.triggers

    phobos_eff = bot.effect_parser.get("Phobos Space Haven")
    assert phobos_eff is not None
    assert phobos_eff.production_change == {"titanium": 1}, phobos_eff.production_change

    dirigibles_eff = bot.effect_parser.get("Dirigibles")
    atmo_eff = bot.effect_parser.get("Atmo Collectors")
    sulphur_eff = bot.effect_parser.get("Sulphur-Eating Bacteria")
    launchpad_eff = bot.effect_parser.get("Titan Floating Launch-pad")
    air_scrapping_eff = bot.effect_parser.get("Titan Air-scrapping")
    jet_stream_eff = bot.effect_parser.get("Jet Stream Microscrappers")
    extractor_eff = bot.effect_parser.get("Extractor Balloons")
    stratopolis_eff = bot.effect_parser.get("Stratopolis")
    rotator_eff = bot.effect_parser.get("Rotator Impacts")
    economic_espionage_eff = bot.effect_parser.get("Economic Espionage")
    water_splitting_eff = bot.effect_parser.get("Water Splitting Plant")
    venus_magnetizer_eff = bot.effect_parser.get("Venus Magnetizer")
    caretaker_eff = bot.effect_parser.get("Caretaker Contract")
    equatorial_eff = bot.effect_parser.get("Equatorial Magnetizer")
    project_workshop_eff = bot.effect_parser.get("Project Workshop")
    bio_printing_eff = bot.effect_parser.get("Bio Printing Facility")
    ore_processor_eff = bot.effect_parser.get("Ore Processor")
    steelworks_eff = bot.effect_parser.get("Steelworks")
    ironworks_eff = bot.effect_parser.get("Ironworks")
    meltworks_eff = bot.effect_parser.get("Meltworks")
    st_joseph_eff = bot.effect_parser.get("St. Joseph of Cupertino Mission")
    viron_eff = bot.effect_parser.get("Viron")
    martian_media_eff = bot.effect_parser.get("Martian Media Center")
    grey_market_eff = bot.effect_parser.get("Grey Market Exploitation")
    microgravimetry_eff = bot.effect_parser.get("Microgravimetry")
    personal_spacecruiser_eff = bot.effect_parser.get("Personal Spacecruiser")
    earthquake_eff = bot.effect_parser.get("Earthquake Machine")
    martian_express_eff = bot.effect_parser.get("Martian Express")
    exploitation_venus_eff = bot.effect_parser.get("Exploitation Of Venus")
    underworld_standard_tech_eff = bot.effect_parser.get("Standard Technology:u")
    arborist_eff = bot.effect_parser.get("Arborist Collective")
    voltagon_eff = bot.effect_parser.get("Voltagon")
    anthozoa_eff = bot.effect_parser.get("Anthozoa")
    investigative_eff = bot.effect_parser.get("Investigative Journalism")
    refugee_camps_eff = bot.effect_parser.get("Refugee Camps")
    assert dirigibles_eff is not None
    assert atmo_eff is not None
    assert sulphur_eff is not None
    assert launchpad_eff is not None
    assert air_scrapping_eff is not None
    assert jet_stream_eff is not None
    assert extractor_eff is not None
    assert stratopolis_eff is not None
    assert rotator_eff is not None
    assert economic_espionage_eff is not None
    assert water_splitting_eff is not None
    assert venus_magnetizer_eff is not None
    assert caretaker_eff is not None
    assert equatorial_eff is not None
    assert project_workshop_eff is not None
    assert bio_printing_eff is not None
    assert st_joseph_eff is not None
    assert viron_eff is not None
    assert martian_media_eff is not None
    assert grey_market_eff is not None
    assert microgravimetry_eff is not None
    assert personal_spacecruiser_eff is not None
    assert earthquake_eff is not None
    assert martian_express_eff is not None
    assert exploitation_venus_eff is not None
    assert underworld_standard_tech_eff is not None
    assert arborist_eff is not None
    assert voltagon_eff is not None
    assert anthozoa_eff is not None
    assert investigative_eff is not None
    assert refugee_camps_eff is not None
    assert ore_processor_eff is not None
    assert steelworks_eff is not None
    assert ironworks_eff is not None
    assert meltworks_eff is not None
    assert dirigibles_eff.actions == [{"cost": "free", "effect": "add 1 floater to any card"}], dirigibles_eff.actions
    assert {"cost": "1 floater", "effect": "gain 2 titanium / 3 energy / 4 heat"} in atmo_eff.actions, atmo_eff.actions
    assert {"cost": "1+ microbes", "effect": "gain 3 MC per microbe spent"} in sulphur_eff.actions, sulphur_eff.actions
    assert {"cost": "1 floater", "effect": "trade for free"} in launchpad_eff.actions, launchpad_eff.actions
    assert {"cost": "2 floaters", "effect": "raise TR 1 step"} in air_scrapping_eff.actions, air_scrapping_eff.actions
    assert {"cost": "2 floaters", "effect": "raise venus 1 step"} in jet_stream_eff.actions, jet_stream_eff.actions
    assert {"cost": "2 floaters", "effect": "raise venus 1 step"} in extractor_eff.actions, extractor_eff.actions
    assert stratopolis_eff.actions == [{"cost": "free", "effect": "add 2 floaters to any Venus card"}], stratopolis_eff.actions
    assert {"type": "Floater", "amount": 2, "target": "any", "per_tag": None, "tag_constraint": "Venus"} in stratopolis_eff.adds_resources, stratopolis_eff.adds_resources
    assert not any(add["target"] == "this" and add["type"] == "Floater" for add in stratopolis_eff.adds_resources), stratopolis_eff.adds_resources
    assert {"cost": "6 MC", "effect": "add 1 asteroid to this card"} in rotator_eff.actions, rotator_eff.actions
    assert {"cost": "1 asteroid", "effect": "raise venus 1 step"} in rotator_eff.actions, rotator_eff.actions
    assert economic_espionage_eff.actions == [{"cost": "2 MC", "effect": "add 1 data to any card"}], economic_espionage_eff.actions
    assert water_splitting_eff.actions == [{"cost": "3 energy", "effect": "raise oxygen 1 step"}], water_splitting_eff.actions
    assert venus_magnetizer_eff.actions == [{"cost": "1 energy production", "effect": "raise venus 1 step"}], venus_magnetizer_eff.actions
    assert caretaker_eff.actions == [{"cost": "8 heat", "effect": "raise TR 1 step"}], caretaker_eff.actions
    assert equatorial_eff.actions == [{"cost": "1 energy production", "effect": "raise TR 1 step"}], equatorial_eff.actions
    assert equatorial_eff.production_change == {}, equatorial_eff.production_change
    assert equatorial_eff.tr_gain == 0, equatorial_eff.tr_gain
    assert project_workshop_eff.actions == [
        {"cost": "3 MC", "effect": "draw 1 blue card", "choice_group": "or"},
        {
            "cost": "played blue card",
            "effect": "convert VP on discarded blue card to TR and draw 2 cards",
            "choice_group": "or",
            "conditional": True,
        },
    ], project_workshop_eff.actions
    assert bio_printing_eff.actions == [
        {"cost": "2 energy", "effect": "gain 2 plants", "choice_group": "or"},
        {
            "cost": "2 energy",
            "effect": "add 1 animal to another card",
            "choice_group": "or",
            "conditional": True,
        },
    ], bio_printing_eff.actions
    assert st_joseph_eff.resource_type != "Fighter", st_joseph_eff.resource_type
    assert st_joseph_eff.vp_per == {}, st_joseph_eff.vp_per
    assert st_joseph_eff.actions == [
        {
            "cost": "5 MC (steel may be used)",
            "effect": "build 1 Cathedral in a city; city owner may pay 2 MC to draw 1 card",
            "conditional": True,
        },
    ], st_joseph_eff.actions
    assert viron_eff.actions == [
        {
            "cost": "used blue card action",
            "effect": "use a blue card action that has already been used this generation",
            "conditional": True,
        },
    ], viron_eff.actions
    assert martian_media_eff.actions == [{"cost": "3 MC", "effect": "add 1 delegate to any party", "conditional": True}], martian_media_eff.actions
    assert grey_market_eff.actions == [
        {"cost": "1 MC", "effect": "gain 1 standard resource", "conditional": True},
        {"cost": "1 corruption", "effect": "gain 3 of the same standard resource", "conditional": True},
    ], grey_market_eff.actions
    assert microgravimetry_eff.actions == [
        {"cost": "2 energy", "effect": "identify 3 underground resources and claim 1", "conditional": True},
    ], microgravimetry_eff.actions
    assert personal_spacecruiser_eff.actions == [
        {"cost": "1 energy", "effect": "gain 2 MC for each corruption resource you have", "conditional": True},
    ], personal_spacecruiser_eff.actions
    assert earthquake_eff.actions == [{"cost": "1 energy", "effect": "excavate 1 underground resource", "conditional": True}], earthquake_eff.actions
    assert martian_express_eff.resource_type == "Ware", martian_express_eff.resource_type
    assert martian_express_eff.actions == [
        {"cost": "all ware resources", "effect": "gain 1 MC per ware removed", "conditional": True},
    ], martian_express_eff.actions
    assert exploitation_venus_eff.actions == [{"cost": "1 corruption", "effect": "raise venus 1 step", "conditional": True}], exploitation_venus_eff.actions
    assert underworld_standard_tech_eff.actions == [
        {
            "cost": "used standard project",
            "effect": "repeat a standard project already used this generation with cost reduced by 8 MC",
            "conditional": True,
        },
    ], underworld_standard_tech_eff.actions
    assert arborist_eff.resource_type == "Activist", arborist_eff.resource_type
    assert arborist_eff.triggers == [
        {
            "on": "play an event card with base cost 14 or less",
            "effect": "add an activist resource to this card",
            "self": True,
        },
    ], arborist_eff.triggers
    assert arborist_eff.actions == [
        {
            "cost": "2 activists",
            "effect": "increase plant production 1 step and gain 2 plants",
            "conditional": True,
        },
    ], arborist_eff.actions
    assert voltagon_eff.actions == [{"cost": "8 energy", "effect": "raise oxygen or venus 1 step"}], voltagon_eff.actions
    assert anthozoa_eff.actions == [{"cost": "1 plant", "effect": "add 1 animal to this card"}], anthozoa_eff.actions
    assert {"type": "Animal", "amount": 1, "target": "this", "per_tag": None} in anthozoa_eff.adds_resources, anthozoa_eff.adds_resources
    assert investigative_eff.resource_type == "Journalism", investigative_eff.resource_type
    assert investigative_eff.actions == [
        {
            "cost": "5 MC and 1 corruption from another player",
            "effect": "add 1 journalism resource to this card",
            "conditional": True,
        },
    ], investigative_eff.actions
    assert {"type": "Journalism", "amount": 1, "target": "this", "per_tag": None} in investigative_eff.adds_resources, investigative_eff.adds_resources
    assert refugee_camps_eff.actions == [{"cost": "1 MC production", "effect": "add 1 camp resource to this card"}], refugee_camps_eff.actions
    assert {"type": "Camp", "amount": 1, "target": "this", "per_tag": None} in refugee_camps_eff.adds_resources, refugee_camps_eff.adds_resources
    assert ore_processor_eff.actions == [{"cost": "4 energy", "effect": "gain 1 titanium and increase oxygen 1 step"}], ore_processor_eff.actions
    assert steelworks_eff.actions == [{"cost": "4 energy", "effect": "gain 2 steel and increase oxygen 1 step"}], steelworks_eff.actions
    assert ironworks_eff.actions == [{"cost": "4 energy", "effect": "gain 1 steel and raise oxygen 1 step"}], ironworks_eff.actions
    assert meltworks_eff.actions == [{"cost": "5 heat", "effect": "gain 3 steel"}], meltworks_eff.actions
    assert "Titan Floating Launch-pad" in FREE_TRADE_CARDS
    assert "Titan Floating Launch-Pad" not in FREE_TRADE_CARDS

    false_vp_projection = "\n".join(_vp_projection(build_non_vp_resource_currency_state()))
    assert "actions" not in false_vp_projection, false_vp_projection
    assert "Symbiotic Fungus" not in false_vp_projection, false_vp_projection

    action_me = type("ActionMe", (), {"mc": 31, "energy": 2, "plants": 2, "heat": 12, "steel": 5, "titanium": 9})()
    endgame_rv = resource_values(1)
    development_eff = bot.effect_parser.get("Development Center")
    restricted_eff = bot.effect_parser.get("Restricted Area")
    birds_eff = bot.effect_parser.get("Birds")
    extremophiles_eff = bot.effect_parser.get("Extremophiles")
    local_shading_eff = bot.effect_parser.get("Local Shading")
    assert development_eff is not None
    assert restricted_eff is not None
    assert birds_eff is not None
    assert extremophiles_eff is not None
    assert local_shading_eff is not None
    assert _estimate_action_value("1 energy", "draw 1 card", action_me, endgame_rv, 1, source_eff=development_eff) == (0, 0)
    assert _estimate_action_value("2 MC", "draw 1 card", action_me, endgame_rv, 1, source_eff=restricted_eff) == (2, 0)
    birds_cost, birds_value = _estimate_action_value(
        "free", "add 1 animal to this card", action_me, endgame_rv, 1, source_eff=birds_eff
    )
    assert birds_cost == 0 and birds_value >= 7.0, (birds_cost, birds_value)
    ext_cost, ext_value = _estimate_action_value(
        "free", "add 1 microbe to this card", action_me, endgame_rv, 1, source_eff=extremophiles_eff
    )
    assert ext_cost == 0 and 2.0 <= ext_value <= 2.5, (ext_cost, ext_value)
    shading_cost, shading_value = _estimate_action_value(
        "free", "add 1 floater to this card", action_me, endgame_rv, 1, source_eff=local_shading_eff
    )
    assert shading_cost == 0 and shading_value <= 1.0, (shading_cost, shading_value)
    look_cost, look_value = _estimate_action_value(
        "free",
        "look at the top card and either buy it or discard it",
        action_me,
        resource_values(5),
        5,
        source_eff=bot.effect_parser.get("Business Network"),
    )
    assert look_cost == 0 and 0 < look_value < resource_values(5)["card"], (look_cost, look_value)
    red_ships_cost, red_ships_value = _estimate_action_value(
        "free",
        "gain 1 MC per ocean-adjacent city or special tile",
        action_me,
        resource_values(5),
        5,
        source_eff=bot.effect_parser.get("Red Ships"),
    )
    assert red_ships_cost == 0 and red_ships_value > 1.0, (red_ships_cost, red_ships_value)
    assert _estimate_card_value_rich(
        "Red Ships",
        75,
        2,
        [],
        "draft",
        5,
        resource_values(5),
        effect_parser=bot.effect_parser,
        db=bot.db,
        me=action_me,
    ) > 4.0
    action_rich_me = type("ActionRichMe", (), {"mc": 31, "energy": 4, "energy_prod": 2, "plants": 2, "heat": 12, "steel": 5, "titanium": 9})()
    assert _estimate_action_value(
        "3 energy", "raise oxygen 1 step", action_rich_me, endgame_rv, 1, source_eff=water_splitting_eff
    )[1] > 0
    assert _estimate_action_value(
        "1 energy production", "raise venus 1 step", action_rich_me, endgame_rv, 1, source_eff=venus_magnetizer_eff
    )[1] > 0
    assert _estimate_action_value(
        "8 heat", "raise TR 1 step", action_rich_me, endgame_rv, 1, source_eff=caretaker_eff
    )[1] > 0
    assert _estimate_action_value(
        "1 energy production", "raise TR 1 step", action_rich_me, endgame_rv, 1, source_eff=equatorial_eff
    )[1] > 0
    assert _estimate_action_value(
        "played blue card",
        "convert VP on discarded blue card to TR and draw 2 cards",
        action_rich_me,
        endgame_rv,
        4,
        source_eff=project_workshop_eff,
        action=project_workshop_eff.actions[1],
    ) == (0, 0)
    assert _estimate_action_value(
        "2 energy",
        "add 1 animal to another card",
        action_rich_me,
        endgame_rv,
        4,
        source_eff=bio_printing_eff,
        action=bio_printing_eff.actions[1],
    ) == (0, 0)

    decomposers_eff = bot.effect_parser.get("Decomposers")
    eco_zone_eff = bot.effect_parser.get("Ecological Zone")
    eco_zone_ares_eff = bot.effect_parser.get("Ecological Zone:ares")
    arklight_eff = bot.effect_parser.get("Arklight")
    pristar_eff = bot.effect_parser.get("Pristar")
    neptunian_eff = bot.effect_parser.get("Neptunian Power Consultants")
    venusian_animals_eff = bot.effect_parser.get("Venusian Animals")
    thiolava_eff = bot.effect_parser.get("Thiolava Vents")
    martian_repository_eff = bot.effect_parser.get("Martian Repository")
    solarpedia_eff = bot.effect_parser.get("Solarpedia")
    pollinators_eff = bot.effect_parser.get("Pollinators")
    pets_eff = bot.effect_parser.get("Pets")
    research_hub_eff = bot.effect_parser.get("Research & Development Hub")
    anthozoa_eff = bot.effect_parser.get("Anthozoa")
    birds_mid_eff = bot.effect_parser.get("Birds")
    ants_mid_eff = bot.effect_parser.get("Ants")
    assert decomposers_eff is not None
    assert eco_zone_eff is not None
    assert eco_zone_ares_eff is not None
    assert arklight_eff is not None
    assert pristar_eff is not None
    assert neptunian_eff is not None
    assert venusian_animals_eff is not None
    assert thiolava_eff is not None
    assert martian_repository_eff is not None
    assert solarpedia_eff is not None
    assert pollinators_eff is not None
    assert pets_eff is not None
    assert research_hub_eff is not None
    assert anthozoa_eff is not None
    assert birds_mid_eff is not None
    assert ants_mid_eff is not None
    assert decomposers_eff.actions == [], decomposers_eff.actions
    assert venusian_animals_eff.actions == [], venusian_animals_eff.actions
    assert venusian_animals_eff.adds_resources == [], venusian_animals_eff.adds_resources
    assert decomposers_eff.triggers, decomposers_eff.triggers
    assert eco_zone_eff.triggers == [{"on": "play an animal or plant tag", "effect": "add an animal to this card", "self": True}], eco_zone_eff.triggers
    assert eco_zone_ares_eff.triggers == [{"on": "play an animal or plant tag", "effect": "add an animal to this card", "self": True}], eco_zone_ares_eff.triggers
    assert arklight_eff.triggers == [{"on": "play an animal or plant tag", "effect": "add 1 animal to this card", "self": True}], arklight_eff.triggers
    assert pristar_eff.triggers == [{"on": "production phase if you did not get TR this generation", "effect": "add one preservation resource here and gain 6 M€", "self": False}], pristar_eff.triggers
    assert neptunian_eff.triggers == [{"on": "any ocean is placed", "effect": "you may pay 5 M€ to raise energy production 1 step and add 1 hydroelectric resource to this card", "self": False}], neptunian_eff.triggers
    assert venusian_animals_eff.triggers, venusian_animals_eff.triggers
    assert thiolava_eff.triggers, thiolava_eff.triggers
    assert martian_repository_eff.vp_per == {"amount": 1, "per": "3 resources"}, martian_repository_eff.vp_per
    assert solarpedia_eff.resource_type == "Data", solarpedia_eff.resource_type
    assert solarpedia_eff.vp_per == {"amount": 1, "per": "6 resources"}, solarpedia_eff.vp_per
    assert solarpedia_eff.actions == [{"cost": "free", "effect": "add 2 data to any card"}], solarpedia_eff.actions
    assert solarpedia_eff.adds_resources == [{"type": "Data", "amount": 2, "target": "any", "per_tag": None}], solarpedia_eff.adds_resources
    assert pollinators_eff.resource_type == "Animal", pollinators_eff.resource_type
    assert pollinators_eff.vp_per == {"amount": 1, "per": "resource"}, pollinators_eff.vp_per
    assert pollinators_eff.adds_resources == [{"type": "Animal", "amount": 1, "target": "this", "per_tag": None}], pollinators_eff.adds_resources
    assert pets_eff.adds_resources == [{"type": "Animal", "amount": 1, "target": "this", "per_tag": None}], pets_eff.adds_resources
    assert anthozoa_eff.vp_per == {"amount": 1, "per": "2 resources"}, anthozoa_eff.vp_per

    mid_rv = resource_values(6)

    def rich_value(card_name, hand=None):
        info = bot.db.get_info(card_name) or {}
        return _estimate_card_value_rich(
            card_name,
            bot.db.get_score(card_name),
            info.get("cost", 0) or 0,
            info.get("tags", []) or [],
            "early",
            6,
            mid_rv,
            bot.effect_parser,
            bot.db,
            hand_cards=hand or [],
        )

    decomposers_no_shell = rich_value("Decomposers")
    decomposers_shell = rich_value(
        "Decomposers",
        hand=[
            {"name": "Pets", "tags": ["Earth", "Animal"]},
            {"name": "Kelp Farming", "tags": ["Plant"]},
            {"name": "Tardigrades", "tags": ["Microbe"]},
        ],
    )
    eco_zone_no_shell = rich_value("Ecological Zone")
    eco_zone_shell = rich_value(
        "Ecological Zone",
        hand=[
            {"name": "Kelp Farming", "tags": ["Plant"]},
            {"name": "Pets", "tags": ["Earth", "Animal"]},
        ],
    )
    arklight_no_shell = rich_value("Arklight")
    arklight_shell = rich_value(
        "Arklight",
        hand=[
            {"name": "Kelp Farming", "tags": ["Plant"]},
            {"name": "Pets", "tags": ["Earth", "Animal"]},
        ],
    )
    pets_value = rich_value("Pets")
    pollinators_value = rich_value("Pollinators")
    venusian_animals_value = rich_value("Venusian Animals")
    thiolava_value = rich_value("Thiolava Vents")
    martian_repository_value = rich_value("Martian Repository")
    research_hub_value = rich_value("Research & Development Hub")
    birds_value = rich_value("Birds")
    ants_value = rich_value("Ants")
    assert decomposers_no_shell < 2.5, decomposers_no_shell
    assert decomposers_shell > decomposers_no_shell + 1.5, (decomposers_no_shell, decomposers_shell)
    assert eco_zone_shell > eco_zone_no_shell + 1.5, (eco_zone_no_shell, eco_zone_shell)
    assert arklight_shell > arklight_no_shell + 1.5, (arklight_no_shell, arklight_shell)
    assert pets_value > 0, pets_value
    assert pollinators_value > 0, pollinators_value
    assert rich_value("Birds") < birds_value + 0.01, rich_value("Birds")
    assert venusian_animals_value < 4.0, venusian_animals_value
    assert thiolava_value > 8.5, thiolava_value
    assert martian_repository_value == 0, martian_repository_value
    assert research_hub_value == 0, research_hub_value
    assert ants_value < birds_value, (ants_value, birds_value)

    colony_state = build_colony_card_value_state()
    colony_rv = resource_values(8)
    research_colony_value = _estimate_card_value_rich(
        "Research Colony",
        90,
        20,
        ["Space", "Science"],
        "mid",
        8,
        colony_rv,
        bot.effect_parser,
        bot.db,
        corp_name=colony_state.me.corp,
        me=colony_state.me,
        hand_cards=colony_state.cards_in_hand,
    )
    space_port_colony_value = _estimate_card_value_rich(
        "Space Port Colony",
        88,
        27,
        ["Space"],
        "mid",
        8,
        colony_rv,
        bot.effect_parser,
        bot.db,
        corp_name=colony_state.me.corp,
        me=colony_state.me,
        hand_cards=colony_state.cards_in_hand,
    )
    assert research_colony_value >= 20, research_colony_value
    assert space_port_colony_value >= 24, space_port_colony_value
    colony_advice = {
        row["name"]: row
        for row in play_hold_advice(
            colony_state.cards_in_hand, colony_state, bot.synergy, bot.req_checker
        )
    }
    assert colony_advice["Research Colony"]["play_value_now"] >= 20, colony_advice["Research Colony"]
    assert colony_advice["Space Port Colony"]["play_value_now"] >= 24, colony_advice["Space Port Colony"]

    crash_site_without_attack = build_crash_site_requirement_state()
    req_ok, req_reason = bot.req_checker.check("Crash Site Cleanup", crash_site_without_attack)
    assert req_ok is False, req_reason
    adjusted, adjusted_ok, adjusted_reason = bot.req_checker.adjust_score(
        63,
        "Crash Site Cleanup",
        crash_site_without_attack,
    )
    assert adjusted_ok is False, adjusted_reason
    assert adjusted < 55, (adjusted, adjusted_reason)
    crash_site_after_attack = build_crash_site_requirement_state(
        actions_by_color={"blue": ["Comet"]}
    )
    req_ok, req_reason = bot.req_checker.check("Crash Site Cleanup", crash_site_after_attack)
    assert req_ok is True, req_reason

    safe_milestone_state = build_safe_milestone_spend_state()
    safe_milestone_advice = {
        row["name"]: row
        for row in play_hold_advice(
            safe_milestone_state.cards_in_hand,
            safe_milestone_state,
            bot.synergy,
            bot.req_checker,
        )
    }
    research_with_safe_milestone = safe_milestone_advice["Research Colony"]
    assert research_with_safe_milestone["action"] == "PLAY", research_with_safe_milestone
    assert "milestone" not in research_with_safe_milestone["reason"], research_with_safe_milestone
    safe_milestone_alloc = mc_allocation_advice(
        safe_milestone_state, bot.synergy, bot.req_checker
    )
    pioneer_alloc = next(
        a for a in safe_milestone_alloc["allocations"]
        if a["action"].startswith("Claim Pioneer")
    )
    assert pioneer_alloc["priority"] == 3, pioneer_alloc
    assert "⚠" not in pioneer_alloc["action"], pioneer_alloc

    state = build_state()
    advice = {
        row["name"]: row
        for row in play_hold_advice(
            state.cards_in_hand, state, bot.synergy, bot.req_checker
        )
    }
    assert advice["Energy Market"]["play_value_now"] < 15, advice["Energy Market"]

    no_shell = build_topsoil_state(corp="Saturn Systems")
    info = bot.db.get_info("Topsoil Contract") or {}
    no_shell_score = bot.synergy.adjusted_score(
        "Topsoil Contract",
        info.get("tags", []) or [],
        no_shell.me.corp,
        no_shell.generation,
        no_shell.me.tags,
        no_shell,
        context="play",
    )
    assert no_shell_score == 64, no_shell_score

    enceladus_shell = build_topsoil_state(corp="Saturn Systems", colonies=["Enceladus"])
    enceladus_score = bot.synergy.adjusted_score(
        "Topsoil Contract",
        info.get("tags", []) or [],
        enceladus_shell.me.corp,
        enceladus_shell.generation,
        enceladus_shell.me.tags,
        enceladus_shell,
        context="play",
    )
    assert enceladus_score == 70, enceladus_score

    spent_one_shot = build_topsoil_state(
        corp="Saturn Systems",
        tableau=[{"name": "Aerobraked Ammonia Asteroid"}],
    )
    spent_one_shot_score = bot.synergy.adjusted_score(
        "Topsoil Contract",
        info.get("tags", []) or [],
        spent_one_shot.me.corp,
        spent_one_shot.generation,
        spent_one_shot.me.tags,
        spent_one_shot,
        context="play",
    )
    assert spent_one_shot_score == 64, spent_one_shot_score

    olympus_mid = build_olympus_state(generation=5)
    olympus_advice = {
        row["name"]: row
        for row in play_hold_advice(
            olympus_mid.cards_in_hand, olympus_mid, bot.synergy, bot.req_checker
        )
    }
    assert olympus_advice["Olympus Conference"]["play_value_now"] >= 5.5, olympus_advice["Olympus Conference"]

    standard_state = build_standard_technology_state()
    standard_advice = {
        row["name"]: row
        for row in play_hold_advice(
            standard_state.cards_in_hand, standard_state, bot.synergy, bot.req_checker
        )
    }
    assert standard_advice["Standard Technology"]["play_value_now"] >= 8.0, standard_advice["Standard Technology"]

    budget_state = build_budget_sequence_state()
    budget_rows = play_hold_advice(
        budget_state.cards_in_hand, budget_state, bot.synergy, bot.req_checker
    )
    budget_advice = {row["name"]: row for row in budget_rows}
    assert budget_advice["Mohole Area"]["action"] == "PLAY", budget_advice
    assert budget_advice["Io Sulphur Research"]["action"] == "PLAY", budget_advice
    assert budget_advice["Nuclear Zone"]["action"] == "HOLD", budget_advice
    assert budget_rows[0]["name"] == "Mohole Area", budget_rows

    reds_tax_state = build_reds_tax_space_event_state()
    reds_tax_advice = {
        row["name"]: row
        for row in play_hold_advice(
            reds_tax_state.cards_in_hand, reds_tax_state, bot.synergy, bot.req_checker
        )
    }
    assert reds_tax_advice["Giant Ice Asteroid"]["action"] == "HOLD", reds_tax_advice["Giant Ice Asteroid"]
    assert "Reds tax" in reds_tax_advice["Giant Ice Asteroid"]["reason"], reds_tax_advice["Giant Ice Asteroid"]
    reds_tax_allocations = mc_allocation_advice(
        reds_tax_state, bot.synergy, bot.req_checker
    )["allocations"]
    gia_alloc = next(
        (a for a in reds_tax_allocations if a["action"].startswith("Play Giant Ice Asteroid")),
        None,
    )
    assert gia_alloc is None or "❌нет MC" in gia_alloc["action"], reds_tax_allocations
    heat_alloc = next(
        (a for a in reds_tax_allocations if a["action"].startswith("Temperature (heat)")),
        None,
    )
    assert heat_alloc is not None, reds_tax_allocations
    assert heat_alloc["cost"] == 3, heat_alloc
    assert "Reds" in heat_alloc["action"], heat_alloc

    no_floater_state = build_floater_gate_state(floater_cards=[])
    no_floater_advice = {
        row["name"]: row
        for row in play_hold_advice(
            no_floater_state.cards_in_hand, no_floater_state, bot.synergy, bot.req_checker
        )
    }
    assert no_floater_advice["Airliners"]["action"] == "HOLD", no_floater_advice
    assert "req через ~3 gen" in no_floater_advice["Airliners"]["reason"], no_floater_advice["Airliners"]
    assert no_floater_advice["Air Raid"]["action"] != "PLAY", no_floater_advice
    assert "floater" in no_floater_advice["Air Raid"]["reason"], no_floater_advice["Air Raid"]

    enough_floaters_state = build_floater_gate_state(
        floater_cards=[("Local Shading", 3), ("Aerial Mappers", 2)]
    )
    enough_floaters_advice = {
        row["name"]: row
        for row in play_hold_advice(
            enough_floaters_state.cards_in_hand, enough_floaters_state, bot.synergy, bot.req_checker
        )
    }
    assert enough_floaters_advice["Airliners"]["action"] == "PLAY", enough_floaters_advice
    assert enough_floaters_advice["Aerosport Tournament"]["action"] == "PLAY", enough_floaters_advice

    empty_tag_endgame_state = build_endgame_empty_tag_state()
    empty_tag_endgame_advice = {
        row["name"]: row
        for row in play_hold_advice(
            empty_tag_endgame_state.cards_in_hand, empty_tag_endgame_state, bot.synergy, bot.req_checker
        )
    }
    assert empty_tag_endgame_advice["Mohole Area"]["action"] == "SELL", empty_tag_endgame_advice
    assert "production" in empty_tag_endgame_advice["Mohole Area"]["reason"], empty_tag_endgame_advice["Mohole Area"]
    assert "production" not in empty_tag_endgame_advice["Strip Mine"]["reason"], empty_tag_endgame_advice["Strip Mine"]
    assert empty_tag_endgame_advice["Artificial Lake"]["action"] == "PLAY", empty_tag_endgame_advice["Artificial Lake"]

    dead_floater_req_state = build_endgame_floater_req_state(floaters=0)
    dead_floater_req_advice = {
        row["name"]: row
        for row in play_hold_advice(
            dead_floater_req_state.cards_in_hand, dead_floater_req_state, bot.synergy, bot.req_checker
        )
    }
    assert dead_floater_req_advice["Aerosport Tournament"]["action"] == "SELL", dead_floater_req_advice
    assert "req не успеет" in dead_floater_req_advice["Aerosport Tournament"]["reason"], dead_floater_req_advice["Aerosport Tournament"]

    near_floater_req_state = build_endgame_floater_req_state(floaters=4)
    near_floater_req_advice = {
        row["name"]: row
        for row in play_hold_advice(
            near_floater_req_state.cards_in_hand, near_floater_req_state, bot.synergy, bot.req_checker
        )
    }
    assert near_floater_req_advice["Aerosport Tournament"]["action"] == "HOLD", near_floater_req_advice
    assert "req скоро" in near_floater_req_advice["Aerosport Tournament"]["reason"], near_floater_req_advice["Aerosport Tournament"]

    steel_budget_state = build_endgame_steel_budget_state()
    steel_budget_advice = {
        row["name"]: row
        for row in play_hold_advice(
            steel_budget_state.cards_in_hand, steel_budget_state, bot.synergy, bot.req_checker
        )
    }
    assert steel_budget_advice["Tectonic Stress Power"]["action"] == "PLAY", steel_budget_advice
    assert "steel" in steel_budget_advice["Tectonic Stress Power"]["reason"], steel_budget_advice["Tectonic Stress Power"]
    assert steel_budget_advice["Cutting Edge Technology"]["action"] == "HOLD", steel_budget_advice["Cutting Edge Technology"]
    assert "net value below cost" in steel_budget_advice["Cutting Edge Technology"]["reason"], steel_budget_advice["Cutting Edge Technology"]
    assert "play ASAP" not in steel_budget_advice["Cutting Edge Technology"]["reason"], steel_budget_advice["Cutting Edge Technology"]
    assert "combo:" not in steel_budget_advice["Cutting Edge Technology"]["reason"], steel_budget_advice["Cutting Edge Technology"]
    assert "play_before" not in steel_budget_advice["Cutting Edge Technology"], steel_budget_advice["Cutting Edge Technology"]
    assert steel_budget_advice["Venus Shuttles"]["action"] == "HOLD", steel_budget_advice["Venus Shuttles"]
    assert "net value below cost" in steel_budget_advice["Venus Shuttles"]["reason"], steel_budget_advice["Venus Shuttles"]

    steel_budget_alloc = mc_allocation_advice(
        steel_budget_state, bot.synergy, bot.req_checker
    )
    allocs = steel_budget_alloc["allocations"]
    tectonic_alloc = next(
        (a for a in allocs if a["action"].startswith("Play Tectonic Stress Power")),
        None,
    )
    assert tectonic_alloc is not None, allocs
    assert tectonic_alloc["cost"] <= 2, tectonic_alloc
    assert all(not a["action"].startswith("Play Venus Shuttles") for a in allocs), allocs
    assert all(not a["action"].startswith("Play Cutting Edge Technology") for a in allocs), allocs

    last_gen_tectonic_state = build_last_gen_discounted_tectonic_state()
    last_gen_tectonic_advice = {
        row["name"]: row
        for row in play_hold_advice(
            last_gen_tectonic_state.cards_in_hand, last_gen_tectonic_state, bot.synergy, bot.req_checker
        )
    }
    tectonic_last = last_gen_tectonic_advice["Tectonic Stress Power"]
    assert tectonic_last["action"] == "PLAY", tectonic_last
    assert "steel" in tectonic_last["reason"], tectonic_last
    assert "income" not in tectonic_last["reason"], tectonic_last

    low_score_city_state = build_endgame_immediate_low_score_city_state()
    low_score_city_advice = {
        row["name"]: row
        for row in play_hold_advice(
            low_score_city_state.cards_in_hand, low_score_city_state, bot.synergy, bot.req_checker
        )
    }
    underground_city = low_score_city_advice["Underground City"]
    assert underground_city["action"] == "PLAY", underground_city
    assert underground_city["play_value_now"] > 13, underground_city
    venus_shuttles = low_score_city_advice["Venus Shuttles"]
    assert venus_shuttles["action"] == "SELL", venus_shuttles
    assert "no immediate VP" in venus_shuttles["reason"], venus_shuttles
    symbiotic_fungus = low_score_city_advice["Symbiotic Fungus"]
    assert symbiotic_fungus["action"] == "SELL", symbiotic_fungus
    assert "no immediate VP" in symbiotic_fungus["reason"], symbiotic_fungus
    low_score_city_alloc = mc_allocation_advice(
        low_score_city_state, bot.synergy, bot.req_checker
    )
    assert any(
        a["action"].startswith("Play Underground City")
        for a in low_score_city_alloc["allocations"]
    ), low_score_city_alloc["allocations"]
    assert all(
        not (
            a.get("type") == "sell"
            and "Underground City" in a.get("action", "")
        )
        for a in low_score_city_alloc["allocations"]
    ), low_score_city_alloc["allocations"]
    assert all(
        not a["action"].startswith("Play Venus Shuttles")
        for a in low_score_city_alloc["allocations"]
    ), low_score_city_alloc["allocations"]
    assert all(
        not a["action"].startswith("Play Symbiotic Fungus")
        for a in low_score_city_alloc["allocations"]
    ), low_score_city_alloc["allocations"]
    combos = bot.synergy.combo.analyze_tableau_combos(
        ["Imported Nutrients"],
        ["Symbiotic Fungus"],
        low_score_city_state.me.tags,
    )
    assert all(c.get("type") != "resource_target" for c in combos), combos

    end_triggered_state = build_end_triggered_noise_state()
    assert is_game_end_triggered(end_triggered_state)
    final_alloc = mc_allocation_advice(end_triggered_state, bot.synergy, bot.req_checker)
    final_warning_text = "\n".join(final_alloc["warnings"])
    assert "Plants:" not in final_warning_text, final_warning_text
    assert "Global Event next gen" not in final_warning_text, final_warning_text
    assert "Dry Deserts" not in final_warning_text, final_warning_text

    final_alert_text = "\n".join(_generate_alerts(end_triggered_state, bot.effect_parser))
    assert "ФОНДИРУЙ через" not in final_alert_text, final_alert_text
    assert "Событие (след. gen)" not in final_alert_text, final_alert_text
    assert "станут ruling" not in final_alert_text, final_alert_text
    assert "Dry Deserts" not in final_alert_text, final_alert_text

    print("action value regressions: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
