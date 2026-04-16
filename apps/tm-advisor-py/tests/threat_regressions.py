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
            "megaCredits": 20,
            "megaCreditProduction": 2,
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
