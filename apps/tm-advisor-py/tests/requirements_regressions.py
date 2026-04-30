#!/usr/bin/env python3
"""Targeted regressions for requirement-based score adjustment."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.models import GameState  # noqa: E402
from tm_advisor.requirements import RequirementsChecker  # noqa: E402
from tm_advisor.shared_data import resolve_data_path  # noqa: E402


def build_state(*, generation: int, temperature: int, oceans: int = 4) -> GameState:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 20,
        "megaCreditProduction": 2,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 22,
        "cardsInHandNbr": 1,
        "tableau": [],
        "tags": {},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "cardsInHand": [{"name": "Psychrophiles", "calculatedCost": 2, "tags": ["Microbe"]}],
        "game": {
            "generation": generation,
            "phase": "action",
            "oxygenLevel": 6,
            "temperature": temperature,
            "oceans": oceans,
            "venusScaleLevel": 8,
            "milestones": [],
            "awards": [],
            "spaces": [],
            "gameOptions": {"expansions": {"prelude": True}},
        },
    })


def build_floater_state(*, floater_cards: list[tuple[str, int]], plants: int = 0) -> GameState:
    tableau = [{"name": name, "resources": resources} for name, resources in floater_cards]
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 20,
        "plants": plants,
        "megaCreditProduction": 8,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 25,
        "cardsInHandNbr": 2,
        "tableau": tableau,
        "tags": {"venus": 2},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "cardsInHand": [
            {"name": "Airliners", "calculatedCost": 11, "tags": []},
            {"name": "Aerosport Tournament", "calculatedCost": 7, "tags": []},
        ],
        "game": {
            "generation": 7,
            "phase": "action",
            "oxygenLevel": 4,
            "temperature": -18,
            "oceans": 4,
            "venusScaleLevel": 12,
            "milestones": [],
            "awards": [],
            "spaces": [],
            "gameOptions": {"expansions": {"prelude": True, "venusNext": True}},
        },
    })


def build_tag_state(tags: dict[str, int], *, tableau: list[dict] | None = None) -> GameState:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 30,
        "megaCreditProduction": 6,
        "steelProduction": 1,
        "titaniumProduction": 1,
        "plantProduction": 0,
        "energyProduction": 7,
        "heatProduction": 4,
        "terraformRating": 20,
        "cardsInHandNbr": 1,
        "tableau": tableau or [],
        "tags": tags,
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "cardsInHand": [{"name": "Tectonic Stress Power", "calculatedCost": 18, "tags": ["Power", "Building"]}],
        "game": {
            "generation": 5,
            "phase": "action",
            "oxygenLevel": 3,
            "temperature": -28,
            "oceans": 5,
            "venusScaleLevel": 2,
            "milestones": [],
            "awards": [],
            "spaces": [],
            "gameOptions": {"expansions": {"prelude": True, "colonies": True}},
        },
    })


def build_microbe_spend_state(microbes: int) -> GameState:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 20,
        "megaCreditProduction": 2,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 22,
        "cardsInHandNbr": 1,
        "tableau": [{"name": "Decomposers", "resources": microbes}],
        "tags": {"microbe": 1},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me],
        "cardsInHand": [{"name": "Soil Enrichment", "calculatedCost": 6, "tags": ["Microbe", "Plant"]}],
        "game": {
            "generation": 5,
            "phase": "action",
            "oxygenLevel": 3,
            "temperature": -24,
            "oceans": 7,
            "venusScaleLevel": 2,
            "milestones": [],
            "awards": [],
            "spaces": [],
            "gameOptions": {"expansions": {"prelude": True}},
        },
    })


def build_city_requirement_state(*, my_cities: int, opp_cities: int) -> GameState:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 20,
        "megaCreditProduction": 2,
        "terraformRating": 22,
        "citiesCount": my_cities,
        "coloniesCount": 1,
        "cardsInHandNbr": 1,
        "tableau": [],
        "tags": {},
    }
    opp = {
        "color": "blue",
        "name": "opp",
        "citiesCount": opp_cities,
        "coloniesCount": 0,
        "cardsInHandNbr": 1,
        "tableau": [],
        "tags": {},
    }
    return GameState({
        "thisPlayer": me,
        "players": [me, opp],
        "game": {
            "generation": 7,
            "phase": "action",
            "oxygenLevel": 14,
            "temperature": 8,
            "oceans": 9,
            "venusScaleLevel": 18,
            "milestones": [],
            "awards": [],
            "spaces": [],
            "gameOptions": {"expansions": {"prelude": True, "colonies": True}},
        },
    })


def main() -> int:
    checker = RequirementsChecker(str(resolve_data_path("all_cards.json")))

    adjusted_closed, req_ok_closed, reason_closed = checker.adjust_score(
        76, "Psychrophiles", build_state(generation=6, temperature=-14)
    )
    assert not req_ok_closed, (adjusted_closed, reason_closed)
    assert "Макс -20°C" in reason_closed, reason_closed
    assert adjusted_closed == 54, adjusted_closed

    adjusted_open, req_ok_open, reason_open = checker.adjust_score(
        76, "Psychrophiles", build_state(generation=6, temperature=-20)
    )
    assert req_ok_open, (adjusted_open, reason_open)
    assert reason_open == "", reason_open
    assert adjusted_open == 76, adjusted_open

    algae_closed, algae_ok_closed, algae_reason_closed = checker.adjust_score(
        81, "Arctic Algae", build_state(generation=4, temperature=-10)
    )
    assert not algae_ok_closed, (algae_closed, algae_reason_closed)
    assert "Макс -12°C" in algae_reason_closed, algae_reason_closed
    assert algae_closed == 54, algae_closed

    algae_open, algae_ok_open, algae_reason_open = checker.adjust_score(
        81, "Arctic Algae", build_state(generation=2, temperature=-12)
    )
    assert algae_ok_open, (algae_open, algae_reason_open)
    assert algae_reason_open == "", algae_reason_open
    assert algae_open == 81, algae_open

    algae_far, algae_ok_far, algae_reason_far = checker.adjust_score(
        81, "Algae", build_state(generation=2, temperature=-20, oceans=0)
    )
    assert not algae_ok_far, (algae_far, algae_reason_far)
    assert "5 ocean" in algae_reason_far, algae_reason_far
    assert algae_far == 73, algae_far

    trees_far, trees_ok_far, trees_reason_far = checker.adjust_score(
        75, "Trees", build_state(generation=1, temperature=-30)
    )
    assert not trees_ok_far, (trees_far, trees_reason_far)
    assert "Нужно -4°C" in trees_reason_far, trees_reason_far
    assert trees_far == 61, trees_far

    low_floaters = build_floater_state(floater_cards=[("Local Shading", 2)])
    airliners_low_ok, airliners_low_reason = checker.check("Airliners", low_floaters)
    assert not airliners_low_ok, airliners_low_reason
    assert "Нужно 3 floaters" in airliners_low_reason, airliners_low_reason

    exact_airliners = build_floater_state(floater_cards=[("Local Shading", 3)])
    airliners_ok, airliners_reason = checker.check("Airliners", exact_airliners)
    assert airliners_ok, airliners_reason
    assert airliners_reason == "", airliners_reason

    exact_aerosport = build_floater_state(
        floater_cards=[("Local Shading", 3), ("Aerial Mappers", 2)]
    )
    aerosport_ok, aerosport_reason = checker.check("Aerosport Tournament", exact_aerosport)
    assert aerosport_ok, aerosport_reason
    assert aerosport_reason == "", aerosport_reason

    no_floaters = build_floater_state(floater_cards=[], plants=0)
    air_raid_ok, air_raid_reason = checker.check("Air Raid", no_floaters)
    assert not air_raid_ok, air_raid_reason
    assert "потерять 1 floater" in air_raid_reason, air_raid_reason

    birds_ok, birds_reason = checker.check("Stratospheric Birds", no_floaters)
    assert not birds_ok, birds_reason
    assert "потратить 1 floater" in birds_reason, birds_reason

    moss_low_plants = build_floater_state(floater_cards=[], plants=1)
    moss_ok, moss_reason = checker.check("Nitrophilic Moss", moss_low_plants)
    assert not moss_ok, moss_reason
    assert "потерять 2 plants" in moss_reason, moss_reason

    moss_enough_plants = build_floater_state(floater_cards=[], plants=3)
    moss_ok2, moss_reason2 = checker.check("Nitrophilic Moss", moss_enough_plants)
    assert moss_ok2, moss_reason2
    assert moss_reason2 == "", moss_reason2

    tectonic_wild_ok, tectonic_wild_reason = checker.check(
        "Tectonic Stress Power", build_tag_state({"science": 1, "wild": 1})
    )
    assert tectonic_wild_ok, tectonic_wild_reason
    assert tectonic_wild_reason == "", tectonic_wild_reason

    tectonic_no_wild_ok, tectonic_no_wild_reason = checker.check(
        "Tectonic Stress Power", build_tag_state({"science": 1})
    )
    assert not tectonic_no_wild_ok, tectonic_no_wild_reason
    assert "Нужно 2 science tag (есть 1)" in tectonic_no_wild_reason, tectonic_no_wild_reason

    fusion_xavier_ok, fusion_xavier_reason = checker.check(
        "Fusion Power", build_tag_state({}, tableau=[{"name": "Xavier", "isDisabled": False}])
    )
    assert fusion_xavier_ok, fusion_xavier_reason
    assert fusion_xavier_reason == "", fusion_xavier_reason

    fusion_no_xavier_ok, fusion_no_xavier_reason = checker.check(
        "Fusion Power", build_tag_state({})
    )
    assert not fusion_no_xavier_ok, fusion_no_xavier_reason
    assert "Нужно 2 power tag (есть 0)" in fusion_no_xavier_reason, fusion_no_xavier_reason

    fusion_spent_xavier_ok, fusion_spent_xavier_reason = checker.check(
        "Fusion Power", build_tag_state({}, tableau=[{"name": "Xavier", "isDisabled": True}])
    )
    assert not fusion_spent_xavier_ok, fusion_spent_xavier_reason
    assert "Нужно 2 power tag (есть 0)" in fusion_spent_xavier_reason, fusion_spent_xavier_reason

    omnicourt_one_wild_ok, omnicourt_one_wild_reason = checker.check(
        "Omnicourt", build_tag_state({"earth": 4, "wild": 1})
    )
    assert not omnicourt_one_wild_ok, omnicourt_one_wild_reason
    assert "jovian tag" in omnicourt_one_wild_reason, omnicourt_one_wild_reason

    omnicourt_enough_wild_ok, omnicourt_enough_wild_reason = checker.check(
        "Omnicourt", build_tag_state({"earth": 4, "venus": 1, "wild": 1})
    )
    assert omnicourt_enough_wild_ok, omnicourt_enough_wild_reason
    assert omnicourt_enough_wild_reason == "", omnicourt_enough_wild_reason

    soil_no_microbe_ok, soil_no_microbe_reason = checker.check(
        "Soil Enrichment", build_microbe_spend_state(0)
    )
    assert not soil_no_microbe_ok, soil_no_microbe_reason
    assert "потратить 1 microbe" in soil_no_microbe_reason, soil_no_microbe_reason

    soil_microbe_ok, soil_microbe_reason = checker.check(
        "Soil Enrichment", build_microbe_spend_state(1)
    )
    assert soil_microbe_ok, soil_microbe_reason
    assert soil_microbe_reason == "", soil_microbe_reason

    rad_suits_ok, rad_suits_reason = checker.check(
        "Rad-Suits", build_city_requirement_state(my_cities=1, opp_cities=2)
    )
    assert rad_suits_ok, rad_suits_reason
    assert rad_suits_reason == "", rad_suits_reason

    city_parks_ok, city_parks_reason = checker.check(
        "City Parks", build_city_requirement_state(my_cities=1, opp_cities=4)
    )
    assert not city_parks_ok, city_parks_reason
    assert "Нужно 3 city (есть 1)" in city_parks_reason, city_parks_reason

    print("requirements regressions: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
