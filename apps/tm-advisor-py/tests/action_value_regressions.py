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


def main() -> int:
    bot = AdvisorBot("test", snapshot_mode=True)

    energy_eff = bot.effect_parser.get("Energy Market")
    assert energy_eff is not None
    assert energy_eff.production_change == {}, energy_eff.production_change
    assert energy_eff.gains_resources == {}, energy_eff.gains_resources
    assert len(energy_eff.actions) == 2, energy_eff.actions

    floyd_eff = bot.effect_parser.get("Floyd Continuum")
    assert floyd_eff is not None
    assert floyd_eff.draws_cards == 0, floyd_eff.draws_cards
    assert floyd_eff.actions == [
        {"cost": "free", "effect": "gain 3 MC per completed terraforming parameter"}
    ], floyd_eff.actions

    power_infra_eff = bot.effect_parser.get("Power Infrastructure")
    assert power_infra_eff is not None
    assert power_infra_eff.actions == [
        {"cost": "any energy", "effect": "gain that many MC"}
    ], power_infra_eff.actions

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
    assert sflu_eff.resource_type == "Science", sflu_eff.resource_type
    assert sflu_eff.vp_per == {"amount": 0, "per": "special"}, sflu_eff.vp_per
    assert sflu_eff.actions == [{"cost": "1 MC", "effect": "identify 1 underground resource; if microbe add 1 science resource here", "conditional": True}], sflu_eff.actions
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
    assert ore_processor_eff.actions == [{"cost": "4 energy", "effect": "gain 1 titanium and increase oxygen 1 step"}], ore_processor_eff.actions
    assert steelworks_eff.actions == [{"cost": "4 energy", "effect": "gain 2 steel and increase oxygen 1 step"}], steelworks_eff.actions
    assert ironworks_eff.actions == [{"cost": "4 energy", "effect": "gain 1 steel and raise oxygen 1 step"}], ironworks_eff.actions
    assert meltworks_eff.actions == [{"cost": "5 heat", "effect": "gain 3 steel"}], meltworks_eff.actions
    assert "Titan Floating Launch-pad" in FREE_TRADE_CARDS
    assert "Titan Floating Launch-Pad" not in FREE_TRADE_CARDS

    false_vp_projection = "\n".join(_vp_projection(build_non_vp_resource_currency_state()))
    assert "actions" not in false_vp_projection, false_vp_projection

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
    venusian_animals_eff = bot.effect_parser.get("Venusian Animals")
    thiolava_eff = bot.effect_parser.get("Thiolava Vents")
    martian_repository_eff = bot.effect_parser.get("Martian Repository")
    research_hub_eff = bot.effect_parser.get("Research & Development Hub")
    anthozoa_eff = bot.effect_parser.get("Anthozoa")
    birds_mid_eff = bot.effect_parser.get("Birds")
    ants_mid_eff = bot.effect_parser.get("Ants")
    assert decomposers_eff is not None
    assert venusian_animals_eff is not None
    assert thiolava_eff is not None
    assert martian_repository_eff is not None
    assert research_hub_eff is not None
    assert anthozoa_eff is not None
    assert birds_mid_eff is not None
    assert ants_mid_eff is not None
    assert decomposers_eff.actions == [], decomposers_eff.actions
    assert venusian_animals_eff.actions == [], venusian_animals_eff.actions
    assert venusian_animals_eff.adds_resources == [], venusian_animals_eff.adds_resources
    assert decomposers_eff.triggers, decomposers_eff.triggers
    assert venusian_animals_eff.triggers, venusian_animals_eff.triggers
    assert thiolava_eff.triggers, thiolava_eff.triggers
    assert martian_repository_eff.vp_per == {"amount": 1, "per": "3 resources"}, martian_repository_eff.vp_per
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
    venusian_animals_value = rich_value("Venusian Animals")
    thiolava_value = rich_value("Thiolava Vents")
    martian_repository_value = rich_value("Martian Repository")
    research_hub_value = rich_value("Research & Development Hub")
    birds_value = rich_value("Birds")
    ants_value = rich_value("Ants")
    assert decomposers_no_shell < 2.5, decomposers_no_shell
    assert decomposers_shell > decomposers_no_shell + 1.5, (decomposers_no_shell, decomposers_shell)
    assert venusian_animals_value < 4.0, venusian_animals_value
    assert thiolava_value > 8.5, thiolava_value
    assert martian_repository_value == 0, martian_repository_value
    assert research_hub_value == 0, research_hub_value
    assert ants_value < birds_value, (ants_value, birds_value)

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
