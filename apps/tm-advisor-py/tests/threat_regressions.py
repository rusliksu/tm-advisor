#!/usr/bin/env python3
"""Threat adjuster regression tests - opponent reactive card scoring."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.threat import OpponentReactiveAdjuster  # noqa: E402, will fail until impl
from tm_advisor.database import CardDatabase  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402
from tm_advisor.shared_data import resolve_data_path  # noqa: E402


def build_state_with_opp(
    opp_plant_prod=0,
    opp_animal_prod=0,
    opp_tableau=None,
    opp2_animal_prod=0,
    opp2_tableau=None,
    opp_plants=0,
    opp_steel=0,
    opp_titanium=0,
    opp_mc=20,
    player_count=3,
    funded_awards=None,
    claimed_milestones=None,
    oceans=0,
    oxygen=0,
    temp=-30,
    venus=0,
):
    """Construct minimal GameState with opponents for testing threat adjuster.

    Args:
        opp_plant_prod: plant production of first opponent
        opp_animal_prod: animal production of first opponent
        opp_tableau: list of card names in first opponent's tableau (empty list if None)
        player_count: 2 or 3
        funded_awards: dict {award_name: color} for funded awards
        claimed_milestones: dict {milestone_name: color} for claimed milestones
        oceans, oxygen, temp, venus: global parameters

    Returns:
        GameState with minimal setup
    """
    if opp_tableau is None:
        opp_tableau = []
    if opp2_tableau is None:
        opp2_tableau = []

    players = [{"color": "red", "name": "me"}]
    extra_colors = ["blue", "green", "yellow", "black"]

    for idx in range(max(0, player_count - 1)):
        color = extra_colors[idx]
        if idx == 0:
            plant_p, animal_p, tableau = opp_plant_prod, opp_animal_prod, opp_tableau
        elif idx == 1:
            plant_p, animal_p, tableau = 0, opp2_animal_prod, opp2_tableau
        else:
            plant_p, animal_p, tableau = 0, 0, []
        opp_data = {
            "color": color,
            "name": f"opp{idx + 1}",
            "megaCredits": opp_mc if idx == 0 else 20,
            "megaCreditProduction": 2,
            "steel": opp_steel if idx == 0 else 0,
            "titanium": opp_titanium if idx == 0 else 0,
            "plants": opp_plants if idx == 0 else 0,
            "steelProduction": 0,
            "titaniumProduction": 0,
            "plantProduction": plant_p,
            "energyProduction": 0,
            "heatProduction": 0,
            "animalProduction": animal_p,
            "tableau": [{"name": n} for n in tableau],
            "tags": {},
            "cardsInHandNbr": 3,
        }
        players.append(opp_data)

    # Build awards
    awards_list = []
    if funded_awards:
        for award_name, funded_by in funded_awards.items():
            awards_list.append({
                "name": award_name,
                "playerName": funded_by,
                "scores": []
            })

    # Build milestones
    milestones_list = []
    if claimed_milestones:
        for milestone_name, claimed_by in claimed_milestones.items():
            milestones_list.append({
                "name": milestone_name,
                "playerName": claimed_by,
                "scores": []
            })

    return GameState({
        "thisPlayer": {
            "color": "red",
            "name": "me",
            "megaCredits": 21,
            "megaCreditProduction": 1,
            "steelProduction": 0,
            "titaniumProduction": 0,
            "plantProduction": 0,
            "energyProduction": 0,
            "heatProduction": 0,
            "cardsInHandNbr": 0,
            "tableau": [],
            "tags": {},
        },
        "players": players,
        "game": {
            "generation": 1,
            "phase": "action",
            "oxygenLevel": oxygen,
            "temperature": temp,
            "oceans": oceans,
            "venusScaleLevel": venus,
            "milestones": milestones_list,
            "awards": awards_list,
            "colonies": [],
            "spaces": [],
            "gameOptions": {
                "expansions": {
                    "colonies": True,
                    "prelude": True,
                    "ceos": False,
                }
            },
        },
    })


# Global test counters
PASSED = 0
FAILED = []


def run(name: str, fn) -> None:
    """Run a single test and track results."""
    global PASSED, FAILED
    try:
        fn()
        PASSED += 1
        print(f"✓ {name}")
    except AssertionError as e:
        FAILED.append((name, str(e)))
        print(f"✗ {name}: {e}")
    except Exception as e:
        FAILED.append((name, f"ERROR {type(e).__name__}: {e}"))
        print(f"! {name}: ERROR {type(e).__name__}: {e}")


def test_birds_3p_opp_plantprod_5_bonus():
    """Birds in 3P with opp having high plant_prod → +5 bonus."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_plant_prod=5, player_count=3)

    score, reason = adj.adjust(76, "Birds", state)

    assert score >= 81, f"expected score>=81, got {score}"
    assert "plant_prod" in reason.lower() or "plant" in reason.lower(), \
        f"reason missing 'plant_prod': {reason!r}"


def test_birds_3p_opp_plantprod_0_penalty():
    """Birds in 3P with all opps having low plant_prod → -5 penalty (take-that)."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_plant_prod=0, player_count=3)

    score, reason = adj.adjust(76, "Birds", state)

    assert score == 71, f"expected score==71, got {score}"
    assert "3p" in reason.lower() or "take" in reason.lower(), \
        f"reason missing context about 3P penalty: {reason!r}"


def test_birds_2p_opp_plantprod_5_bonus():
    """Birds in 2P with opp having plant_prod=5 → +5 bonus."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_plant_prod=5, player_count=2)

    score, reason = adj.adjust(76, "Birds", state)

    assert score == 81, f"expected score==81, got {score}"


def test_birds_2p_opp_plantprod_0_no_change():
    """Birds in 2P with opp having plant_prod=0 → no change."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_plant_prod=0, player_count=2)

    score, reason = adj.adjust(76, "Birds", state)

    assert score == 76, f"expected score==76, got {score}"
    assert reason == "", f"reason should be empty for no-op case, got {reason!r}"


def test_decomposers_opp_has_bio_tags_bonus():
    """Decomposers with opp having 3+ bio-tag cards → +3 bonus."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(
        opp_tableau=["Birds", "Ecological Zone", "Grass"],
        player_count=3
    )

    score, reason = adj.adjust(70, "Decomposers", state)

    assert score == 73, f"expected score==73, got {score}"
    assert "tag" in reason.lower() or "bio" in reason.lower(), \
        f"reason missing context about tags: {reason!r}"


def test_decomposers_opp_empty_no_change():
    """Decomposers with empty opp tableau → no change."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_tableau=[], player_count=3)

    score, reason = adj.adjust(70, "Decomposers", state)

    assert score == 70, f"expected score==70, got {score}"
    assert reason == "", f"reason should be empty, got {reason!r}"


def test_decomposers_opp_has_one_bio_tag_no_bonus():
    """Decomposers with opp having only 1 bio-tag card → no bonus."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_tableau=["Birds"], player_count=3)

    score, reason = adj.adjust(70, "Decomposers", state)

    assert score == 70, f"expected score==70, got {score}"


def test_vermin_opp_has_animal_producer_bonus():
    """Vermin with opp having animal-producer card → +4 bonus."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_tableau=["Birds"], player_count=3)

    score, reason = adj.adjust(72, "Vermin", state)

    assert score == 76, f"expected score==76, got {score}"
    assert "animal" in reason.lower(), f"reason missing 'animal': {reason!r}"


def test_vermin_opp_has_animal_prod_bonus():
    """Vermin with opp having animal_prod > 0 → +4 bonus."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_animal_prod=2, player_count=3)

    score, reason = adj.adjust(72, "Vermin", state)

    assert score == 76, f"expected score==76, got {score}"


def test_vermin_opp_no_animal_card_no_change():
    """Vermin with opp having no animal sources → no change."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(
        opp_tableau=["Lunar Beam", "Capital"],
        opp_animal_prod=0,
        player_count=3
    )

    score, reason = adj.adjust(72, "Vermin", state)

    assert score == 72, f"expected score==72, got {score}"
    assert reason == "", f"reason should be empty, got {reason!r}"


def test_unknown_card_passthrough():
    """Unknown card name → passthrough (base_score, empty reason)."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(player_count=3)

    score, reason = adj.adjust(50, "Ironworks", state)

    # Should passthrough unchanged (Ironworks is not a threat card)
    assert score == 50, f"expected score==50, got {score}"
    assert reason == "", f"reason should be empty for unknown card, got {reason!r}"


def test_clamp_plus10_max():
    """Verify delta clamped to max +10."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)

    # Create a state that would trigger multiple bonuses if they stacked
    state = build_state_with_opp(
        opp_plant_prod=5,
        opp_animal_prod=2,
        opp_tableau=["Birds", "Ecological Zone", "Grass"],
        player_count=3
    )

    # Test with a card that might have large bonuses (synthetic scenario)
    # Using base=70, if multiple bonuses apply, clamp to +10
    score, reason = adj.adjust(70, "Birds", state)

    assert score <= 80, f"expected score clamped to max 80, got {score}"


def test_clamp_minus10_max():
    """Verify delta clamped to min -10."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)

    # Create a state with all weaknesses for 3P take-that
    state = build_state_with_opp(
        opp_plant_prod=0,
        player_count=3
    )

    score, reason = adj.adjust(76, "Birds", state)

    assert score >= 66, f"expected score clamped to min 66, got {score}"


def test_reason_format():
    """Reason must contain card name, delta sign, and brief cause."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_plant_prod=5, player_count=3)

    score, reason = adj.adjust(76, "Birds", state)

    # Reason should contain card name and some indicator of adjustment
    assert "birds" in reason.lower(), f"reason should mention card name: {reason!r}"
    assert "+" in reason or "-" in reason or len(reason) == 0, \
        f"reason should indicate delta direction: {reason!r}"

    # For non-empty reason, should have some explanation
    if reason:
        assert len(reason) >= 10, f"reason too short for meaningful message: {reason!r}"


def test_empty_opponents_list():
    """State with no opponents (1v0) → no adjustments."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(player_count=1)

    score, reason = adj.adjust(76, "Birds", state)

    assert score == 76, f"expected score==76, got {score}"
    assert reason == "", f"reason should be empty with no opponents, got {reason!r}"


def test_multiple_opps_first_has_threat():
    """Birds in 3P, first opp has plant_prod >= 4 → +5 bonus."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)

    # First opp has plant_prod=5, second has 0
    # Builder only sets first opponent's prod, so second is always 0
    state = build_state_with_opp(opp_plant_prod=5, player_count=3)

    score, reason = adj.adjust(76, "Birds", state)

    assert score >= 81, f"expected score>=81, got {score}"


def test_asteroid_opp_has_plants_bonus():
    """Asteroid in 3P, opp with 5 plants → +3 attack bonus."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_plants=5, player_count=3)
    score, reason = adj.adjust(60, "Asteroid", state)
    assert score == 63, f"expected 63 (+3), got {score} / {reason!r}"
    assert "plants" in reason.lower() or "5" in reason


def test_asteroid_no_target_3p_waste():
    """Asteroid in 3P with all opps at 0 plants → -5 (fuels third player)."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_plants=0, player_count=3)
    score, reason = adj.adjust(60, "Asteroid", state)
    assert score == 55, f"expected 55 (-5), got {score} / {reason!r}"


def test_big_asteroid_shares_handler():
    """Big Asteroid uses same plant-attack logic."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_plants=4, player_count=3)
    score, _ = adj.adjust(60, "Big Asteroid", state)
    assert score == 63


def test_sabotage_rich_opp_bonus():
    """Sabotage against opp with 10 MC → +4."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_mc=12, player_count=3)
    score, reason = adj.adjust(55, "Sabotage", state)
    assert score == 59, f"expected 59 (+4), got {score} / {reason!r}"


def test_sabotage_3p_waste_poor_opp():
    """Sabotage in 3P when all opps poor (no resources) → -5.

    Builder's default opp2 has MC=20, so test uses 2P to isolate opp1.
    The 3P waste rule still triggers via player_count arg.
    """
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    # 2P setup but patched to report player_count=3 through a single rich-free opp
    state = build_state_with_opp(opp_mc=2, player_count=2)
    # Manually inflate player_count by appending a duplicate poor opp view
    from copy import copy
    poor_opp = copy(state.opponents[0])
    state.opponents = list(state.opponents) + [poor_opp]
    score, _ = adj.adjust(55, "Sabotage", state)
    assert score == 50


def test_virus_opp_with_plant_prod():
    """Virus against opp with plant_prod=3 (signal=6) → +3."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_plant_prod=3, player_count=3)
    score, reason = adj.adjust(70, "Virus", state)
    assert score == 73, f"expected 73 (+3), got {score} / {reason!r}"


def test_ants_opp_has_microbes_bonus():
    """Ants: opp holds 3 microbes on Decomposers → +3."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(
        opp_tableau=[],
        player_count=3,
    )
    # Inject resource count manually on opp tableau
    state.opponents[0].tableau = [{"name": "Decomposers", "resources": 3}]
    score, reason = adj.adjust(60, "Ants", state)
    assert score == 63, f"expected 63, got {score} / {reason!r}"


def test_herbivores_plant_prod_target_bonus():
    """Herbivores: opp plant_prod=4 → +3."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_plant_prod=4, player_count=3)
    score, _ = adj.adjust(65, "Herbivores", state)
    assert score == 68


def test_herbivores_no_target_3p_waste():
    """Herbivores in 3P with no plant-prod targets → -4."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_plant_prod=0, player_count=3)
    score, _ = adj.adjust(65, "Herbivores", state)
    assert score == 61


def test_small_animals_shares_plant_prod_handler():
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_plant_prod=4, player_count=3)
    score, _ = adj.adjust(55, "Small Animals", state)
    assert score == 58


def test_predators_opp_has_animals_bonus():
    """Predators: opp holds 3 animals on Birds → +4."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_tableau=[], player_count=3)
    state.opponents[0].tableau = [{"name": "Birds", "resources": 3}]
    score, reason = adj.adjust(65, "Predators", state)
    assert score == 69, f"expected 69, got {score} / {reason!r}"


def test_hired_raiders_alias_to_sabotage():
    """Hired Raiders shares _sabotage handler — +4 when opp rich."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(opp_mc=10, player_count=3)
    score, _ = adj.adjust(55, "Hired Raiders", state)
    assert score == 59


def test_lava_flows_no_spots():
    """Lava Flows: all 4 volcanic spots taken → -10."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    spaces = [
        {"id": "Tharsis Tholus", "tile": {"tileType": "mine"}},
        {"id": "Ascraeus Mons", "tile": {"tileType": "mine"}},
        {"id": "Pavonis Mons", "tile": {"tileType": "mine"}},
        {"id": "Arsia Mons", "tile": {"tileType": "mine"}},
    ]
    from tm_advisor.models import GameState
    state = GameState({
        "thisPlayer": {"color": "red", "megaCredits": 30, "tableau": [], "tags": {}},
        "players": [{"color": "red", "megaCredits": 30, "tableau": [], "tags": {}}],
        "game": {
            "generation": 4, "phase": "action",
            "oxygenLevel": 5, "temperature": -20, "oceans": 2,
            "venusScaleLevel": 5,
            "milestones": [], "awards": [], "colonies": [],
            "spaces": spaces,
            "gameOptions": {"expansions": {"colonies": True}},
        },
    })
    score, _ = adj.adjust(55, "Lava Flows", state)
    assert score == 45


def _build_state_with_spaces(free_steel_ti: int, taken: int = 0):
    """Build state with N free land+steel/ti spaces and `taken` occupied ones."""
    spaces = []
    for i in range(free_steel_ti):
        spaces.append({"id": f"s{i:02d}", "bonus": [2, 3],
                       "tile": None, "spaceType": "land"})
    for i in range(taken):
        spaces.append({"id": f"t{i:02d}", "bonus": [2],
                       "tile": {"tileType": "mine"}, "spaceType": "land"})
    # Add a few no-bonus filler
    spaces.append({"id": "f00", "bonus": [], "tile": None, "spaceType": "land"})
    return GameState({
        "thisPlayer": {"color": "red", "megaCredits": 30, "tableau": [], "tags": {}},
        "players": [{"color": "red", "megaCredits": 30, "tableau": [], "tags": {}}],
        "game": {
            "generation": 4, "phase": "action",
            "oxygenLevel": 0, "temperature": -20, "oceans": 3,
            "venusScaleLevel": 0,
            "milestones": [], "awards": [], "colonies": [],
            "spaces": spaces,
            "gameOptions": {"expansions": {"colonies": True}},
        },
    })


def test_mining_rights_plenty_of_spots():
    """Mining Rights with 6+ free steel/ti spots → no penalty."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = _build_state_with_spaces(free_steel_ti=7)
    score, _ = adj.adjust(60, "Mining Rights", state)
    assert score == 60


def test_mining_rights_scarce_spots():
    """Mining Rights with only 2 free spots → -3 penalty."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = _build_state_with_spaces(free_steel_ti=2, taken=5)
    score, reason = adj.adjust(60, "Mining Rights", state)
    assert score == 57, f"expected 57 (-3), got {score} / {reason!r}"


def test_mining_rights_no_spots():
    """Mining Rights with 0 free spots → -10."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = _build_state_with_spaces(free_steel_ti=0, taken=7)
    score, _ = adj.adjust(60, "Mining Rights", state)
    assert score == 50


def test_mining_area_harder_threshold():
    """Mining Area penalizes at 3 spots (stricter than Rights)."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = _build_state_with_spaces(free_steel_ti=3)
    score, _ = adj.adjust(60, "Mining Area", state)
    assert score == 56, f"expected 56 (-4), got {score}"


def test_to_int_handles_string():
    """_to_int converts string ints; returns 0 on garbage/None."""
    assert OpponentReactiveAdjuster._to_int("3") == 3
    assert OpponentReactiveAdjuster._to_int("foo") == 0
    assert OpponentReactiveAdjuster._to_int(None) == 0
    assert OpponentReactiveAdjuster._to_int(5) == 5


def test_card_name_fallback_to_cardname_key():
    """_card_name reads 'name' first, falls back to 'cardName', passes through str."""
    assert OpponentReactiveAdjuster._card_name({"name": "Birds"}) == "Birds"
    assert OpponentReactiveAdjuster._card_name({"cardName": "Birds"}) == "Birds"
    assert OpponentReactiveAdjuster._card_name("Birds") == "Birds"
    assert OpponentReactiveAdjuster._card_name(None) is None
    assert OpponentReactiveAdjuster._card_name({}) is None


def test_vermin_opp2_has_higher_animal_prod():
    """Vermin scans ALL opps: second opp with higher animal_prod wins."""
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    adj = OpponentReactiveAdjuster(db)
    state = build_state_with_opp(
        opp_animal_prod=1,
        opp2_animal_prod=5,
        player_count=3,
    )

    score, reason = adj.adjust(72, "Vermin", state)

    assert score == 76, f"expected score==76, got {score}"
    assert "animal_prod=5" in reason, f"expected max opp animal_prod=5 in reason: {reason!r}"


if __name__ == "__main__":
    # Discover and run all test_* functions
    test_functions = [
        name for name in dir()
        if name.startswith("test_") and callable(globals()[name])
    ]

    for test_name in sorted(test_functions):
        run(test_name, globals()[test_name])

    print(f"\n{PASSED} passed, {len(FAILED)} failed")
    if FAILED:
        print("\nFailures:")
        for name, error in FAILED:
            print(f"  {name}: {error}")

    sys.exit(0 if not FAILED else 1)
