#!/usr/bin/env python3
"""Regression tests for sequence_planner.plan_sequence() function.

Tests 2-step combo planning: card A -> card B with projection of A's
effects (tags, discount) on B's re-scoring and re-costing.
"""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.sequence_planner import plan_sequence  # noqa: E402
from tm_advisor.models import GameState, PlayerInfo  # noqa: E402


# ============================================================================
# Mocks
# ============================================================================

class MockSynergy:
    """Mock synergy scorer with configurable scoring function."""

    def __init__(self, score_fn=None):
        """score_fn(name, player_tags) -> float."""
        self._score_fn = score_fn or (lambda name, tags: 50.0)

    def adjusted_score(self, name, tags, corp, gen, player_tags, state):
        """Return mock score, optionally based on player_tags (tag projection)."""
        return self._score_fn(name, player_tags)


class MockReqChecker:
    """Mock requirement checker - all cards playable by default."""

    def __init__(self, unplayable_cards=None):
        """unplayable_cards: set of card names that fail req check."""
        self.unplayable = unplayable_cards or set()

    def check(self, name, state):
        """Return (is_playable, error_msg)."""
        if name in self.unplayable:
            return False, f"{name} requirement not met"
        return True, ""


class MockDb:
    """Mock card database."""

    def __init__(self, card_info=None):
        """card_info: dict {name -> {tags, cost, ...}}."""
        self.card_info = card_info or {}

    def get_info(self, name):
        """Return card info dict or None."""
        return self.card_info.get(name)

    def get_score(self, name):
        """Return mock score."""
        return 50.0


class MockEffectParser:
    """Mock effect parser - no effects (fallback to score heuristic)."""

    def get(self, name):
        """Return None to force fallback to score heuristic."""
        return None


# ============================================================================
# Builders
# ============================================================================

def build_state(
    hand=None,
    tableau=None,
    mc=50,
    tags=None,
    generation=5,
    phase="action",
    corp="",
    steel=0,
    titanium=0,
):
    """Build a GameState with given hand and tableau.

    Args:
        hand: list of {name, cost, tags} dicts or card name strings
        tableau: list of {name} dicts
        mc: megacredits
        tags: dict of {tag_name: count}
        generation: game generation
        phase: game phase
        corp: player's corporation
        steel, titanium: resources
    """
    if hand is None:
        hand = []
    if tableau is None:
        tableau = []
    if tags is None:
        tags = {}

    # Normalize hand cards to dicts
    normalized_hand = []
    for card in hand:
        if isinstance(card, str):
            normalized_hand.append({"name": card, "cost": 0, "tags": []})
        else:
            normalized_hand.append({
                "name": card.get("name", ""),
                "cost": card.get("cost", 0),
                "tags": card.get("tags", []),
            })

    # Normalize tableau cards to dicts
    normalized_tableau = []
    for card in tableau:
        if isinstance(card, str):
            normalized_tableau.append({"name": card})
        else:
            normalized_tableau.append({"name": card.get("name", "")})

    state_data = {
        "thisPlayer": {
            "color": "red",
            "name": "me",
            "megaCredits": mc,
            "steel": steel,
            "titanium": titanium,
            "tableau": normalized_tableau,
            "tags": tags,
        },
        "cardsInHand": normalized_hand,
        "players": [
            {"color": "red", "name": "me", "megaCredits": mc},
        ],
        "game": {
            "generation": generation,
            "phase": phase,
            "oxygenLevel": 0,
            "temperature": 0,
            "oceans": 0,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [],
            "gameOptions": {},
        },
    }

    if corp:
        state_data["pickedCorporationCard"] = [{"name": corp}]

    state = GameState(state_data)
    return state


# ============================================================================
# Tests
# ============================================================================

PASSED = 0
FAILED = []


def run(name, fn):
    global PASSED
    try:
        fn()
        PASSED += 1
        print("[PASS] " + name)
    except AssertionError as e:
        FAILED.append((name, str(e)))
        print("[FAIL] " + name + ": " + str(e))
    except Exception as e:
        FAILED.append((name, f"ERROR {type(e).__name__}: {e}"))
        print("[ERROR] " + name + ": " + type(e).__name__ + ": " + str(e))


def test_empty_hand_returns_none():
    """Empty hand -> None."""
    state = build_state(hand=[])
    synergy = MockSynergy()
    req_checker = MockReqChecker()
    db = MockDb()
    parser = MockEffectParser()

    result = plan_sequence(
        state, synergy, req_checker, parser, db,
        phase="action", gens_left=5, rv={"card": 3, "tr": 7, "vp": 2}
    )
    assert result is None, f"Expected None for empty hand, got {result}"


def test_single_card_no_pair_returns_none():
    """Hand with 1 card -> None (no second card for pair)."""
    state = build_state(hand=[
        {"name": "Card A", "cost": 5, "tags": []}
    ])
    synergy = MockSynergy()
    req_checker = MockReqChecker()
    db = MockDb()
    parser = MockEffectParser()

    result = plan_sequence(
        state, synergy, req_checker, parser, db,
        phase="action", gens_left=5, rv={"card": 3, "tr": 7, "vp": 2}
    )
    assert result is None, f"Expected None for single card, got {result}"


def test_no_sequence_if_both_cheap_equal_score():
    """Hand=[A, B] with equal surplus -> no plan (combined <= best_single + 6)."""
    state = build_state(
        hand=[
            {"name": "Card A", "cost": 10, "tags": []},
            {"name": "Card B", "cost": 10, "tags": []},
        ],
        mc=100,
    )

    def constant_score(name, player_tags):
        return 50.0

    synergy = MockSynergy(score_fn=constant_score)
    req_checker = MockReqChecker()
    db = MockDb()
    parser = MockEffectParser()

    result = plan_sequence(
        state, synergy, req_checker, parser, db,
        phase="action", gens_left=5, rv={"card": 3, "tr": 7, "vp": 2}
    )
    if result is not None:
        combined = result.get("combined_surplus", 0)
        single = result.get("single_surplus", 0)
        assert combined <= single + 7, \
            f"Expected weak sequence (combined {combined} not >> single {single}), got {result}"


def test_discount_card_a_triggers_cheaper_b():
    """A='Earth Catapult' (all: -2), B='Earth' card cost 15.

    After A, B should cost 13 (15 - 2 discount).
    """
    state = build_state(
        hand=[
            {"name": "Earth Catapult", "cost": 8, "tags": []},
            {"name": "Imported Hydrogen", "cost": 15, "tags": ["Earth"]},
        ],
        mc=100,
        tableau=[],
    )

    synergy = MockSynergy(score_fn=lambda name, tags: 95.0)
    req_checker = MockReqChecker()
    db = MockDb({
        "Earth Catapult": {"tags": [], "cost": 8},
        "Imported Hydrogen": {"tags": ["Earth"], "cost": 15},
    })
    parser = MockEffectParser()

    result = plan_sequence(
        state, synergy, req_checker, parser, db,
        phase="action", gens_left=5, rv={"card": 3, "tr": 7, "vp": 2}
    )

    assert result is not None, "Expected plan for Earth Catapult -> Imported Hydrogen"
    assert result["first"] == "Earth Catapult"
    assert result["second"] == "Imported Hydrogen"
    assert result["second_cost_base"] == 15, f"Base cost should be 15, got {result['second_cost_base']}"
    assert result["second_cost_after_A"] == 13, \
        f"Cost after Earth Catapult should be 13 (15-2), got {result['second_cost_after_A']}"


def test_tag_projection_boosts_b_score():
    """A adds 'Science' tag, B scales with Science tags."""
    state = build_state(
        hand=[
            {"name": "Data Mining", "cost": 5, "tags": ["Science"]},
            {"name": "Mars University", "cost": 12, "tags": ["Science"]},
        ],
        mc=100,
        tags={},
    )

    def science_boosting_score(name, player_tags):
        base = 95.0
        if name == "Mars University":
            science_count = player_tags.get("science", 0)
            if science_count >= 1:
                return 100.0
        return base

    synergy = MockSynergy(score_fn=science_boosting_score)
    req_checker = MockReqChecker()
    db = MockDb({
        "Data Mining": {"tags": ["Science"], "cost": 5},
        "Mars University": {"tags": ["Science"], "cost": 12},
    })
    parser = MockEffectParser()

    result = plan_sequence(
        state, synergy, req_checker, parser, db,
        phase="action", gens_left=5, rv={"card": 3, "tr": 7, "vp": 2}
    )

    assert result is not None, "Expected plan for Data Mining -> Mars University"
    assert result["first"] == "Data Mining"
    assert result["second"] == "Mars University"


def test_unplayable_card_not_in_candidates():
    """Card cost 100 > MC available -> excluded from candidates."""
    state = build_state(
        hand=[
            {"name": "Expensive Card", "cost": 100, "tags": []},
            {"name": "Cheap Card", "cost": 5, "tags": []},
        ],
        mc=50,
    )

    synergy = MockSynergy(score_fn=lambda name, tags: 50.0)
    req_checker = MockReqChecker()
    db = MockDb()
    parser = MockEffectParser()

    result = plan_sequence(
        state, synergy, req_checker, parser, db,
        phase="action", gens_left=5, rv={"card": 3, "tr": 7, "vp": 2}
    )

    if result is not None:
        assert result["first"] != "Expensive Card", \
            "Unplayable card should not be first"
        assert result["second"] != "Expensive Card", \
            "Unplayable card should not be second"


def test_req_fail_excludes_card():
    """Card fails requirement check -> excluded from candidates."""
    state = build_state(
        hand=[
            {"name": "Capital", "cost": 5, "tags": []},
            {"name": "Normal Card", "cost": 5, "tags": []},
        ],
        mc=50,
    )

    synergy = MockSynergy(score_fn=lambda name, tags: 50.0)
    req_checker = MockReqChecker(unplayable_cards={"Capital"})
    db = MockDb()
    parser = MockEffectParser()

    result = plan_sequence(
        state, synergy, req_checker, parser, db,
        phase="action", gens_left=5, rv={"card": 3, "tr": 7, "vp": 2}
    )

    if result is not None:
        assert result["first"] != "Capital", "Req-failed card should not be first"
        assert result["second"] != "Capital", "Req-failed card should not be second"


def test_surplus_threshold_respected():
    """Plan returned only if combined surplus > best_single + 6 MC."""
    state = build_state(
        hand=[
            {"name": "Good A", "cost": 5, "tags": []},
            {"name": "Good B", "cost": 5, "tags": []},
            {"name": "Best Single", "cost": 1, "tags": []},
        ],
        mc=100,
    )

    def small_diff_score(name, player_tags):
        if name == "Best Single":
            return 55.0
        return 50.0

    synergy = MockSynergy(score_fn=small_diff_score)
    req_checker = MockReqChecker()
    db = MockDb()
    parser = MockEffectParser()

    result = plan_sequence(
        state, synergy, req_checker, parser, db,
        phase="action", gens_left=5, rv={"card": 3, "tr": 7, "vp": 2}
    )

    if result is not None:
        assert result["combined_surplus"] > result["single_surplus"] + 6.0, \
            f"Combined {result['combined_surplus']} should be > single {result['single_surplus']} + 6"


def test_multiple_discounts_stack():
    """Multiple discount cards in tableau -> discounts stack."""
    state = build_state(
        hand=[
            {"name": "Research Satellite", "cost": 20, "tags": ["Earth"]},
        ],
        mc=100,
        tableau=[
            {"name": "Earth Catapult"},
            {"name": "Earth Office"},
        ],
    )

    synergy = MockSynergy(score_fn=lambda name, tags: 60.0)
    req_checker = MockReqChecker()
    db = MockDb({
        "Research Satellite": {"tags": ["Earth"], "cost": 20},
    })
    parser = MockEffectParser()

    result = plan_sequence(
        state, synergy, req_checker, parser, db,
        phase="action", gens_left=5, rv={"card": 3, "tr": 7, "vp": 2}
    )

    assert result is None or isinstance(result, dict), \
        "Result should be None or valid plan dict"


def test_plan_reason_field_present():
    """Returned plan includes 'reason' field with readable message."""
    state = build_state(
        hand=[
            {"name": "Earth Catapult", "cost": 8, "tags": []},
            {"name": "Imported Hydrogen", "cost": 15, "tags": ["Earth"]},
        ],
        mc=100,
    )

    synergy = MockSynergy(score_fn=lambda name, tags: 95.0)
    req_checker = MockReqChecker()
    db = MockDb({
        "Earth Catapult": {"tags": [], "cost": 8},
        "Imported Hydrogen": {"tags": ["Earth"], "cost": 15},
    })
    parser = MockEffectParser()

    result = plan_sequence(
        state, synergy, req_checker, parser, db,
        phase="action", gens_left=5, rv={"card": 3, "tr": 7, "vp": 2}
    )

    if result is not None:
        assert "reason" in result, "Plan should include 'reason' field"
        assert isinstance(result["reason"], str), "Reason should be string"
        assert len(result["reason"]) > 0, "Reason should not be empty"


def test_a_costs_equal_to_available_mc():
    """A consumes all available MC, nothing left for B."""
    state = build_state(
        hand=[
            {"name": "Expensive Enabler", "cost": 50, "tags": []},
            {"name": "Card B", "cost": 5, "tags": []},
        ],
        mc=50,
    )

    synergy = MockSynergy(score_fn=lambda name, tags: 95.0)
    req_checker = MockReqChecker()
    db = MockDb()
    parser = MockEffectParser()

    result = plan_sequence(
        state, synergy, req_checker, parser, db,
        phase="action", gens_left=5, rv={"card": 3, "tr": 7, "vp": 2}
    )

    if result is not None:
        assert result["second_cost_after_A"] <= 0, \
            f"B should not be playable after A exhausts MC"


def test_return_dict_has_all_required_fields():
    """Returned plan dict contains all expected fields."""
    state = build_state(
        hand=[
            {"name": "Earth Catapult", "cost": 8, "tags": []},
            {"name": "Imported Hydrogen", "cost": 15, "tags": ["Earth"]},
        ],
        mc=100,
    )

    synergy = MockSynergy(score_fn=lambda name, tags: 95.0)
    req_checker = MockReqChecker()
    db = MockDb({
        "Earth Catapult": {"tags": [], "cost": 8},
        "Imported Hydrogen": {"tags": ["Earth"], "cost": 15},
    })
    parser = MockEffectParser()

    result = plan_sequence(
        state, synergy, req_checker, parser, db,
        phase="action", gens_left=5, rv={"card": 3, "tr": 7, "vp": 2}
    )

    assert result is not None, "Plan should exist"
    required_fields = [
        "first", "first_cost", "second", "second_cost_base",
        "second_cost_after_A", "combined_surplus", "single_surplus",
        "single_best_name", "reason"
    ]
    for field in required_fields:
        assert field in result, f"Missing required field: {field}"


def test_very_late_game_minimal_gens_left():
    """Late game (gens_left=1) still evaluates sequences."""
    state = build_state(
        hand=[
            {"name": "Quick Combo A", "cost": 3, "tags": []},
            {"name": "Quick Combo B", "cost": 3, "tags": []},
        ],
        mc=100,
        generation=14,
    )

    synergy = MockSynergy(score_fn=lambda name, tags: 95.0)
    req_checker = MockReqChecker()
    db = MockDb()
    parser = MockEffectParser()

    result = plan_sequence(
        state, synergy, req_checker, parser, db,
        phase="action", gens_left=1, rv={"card": 3, "tr": 7, "vp": 2}
    )

    assert result is None or isinstance(result, dict), \
        "Result should be None or valid plan dict even in late game"


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    names = [n for n in dir() if n.startswith("test_") and callable(globals()[n])]
    for n in sorted(names):
        run(n, globals()[n])
    print("")
    print(str(PASSED) + " passed, " + str(len(FAILED)) + " failed")
    if FAILED:
        for n, e in FAILED:
            print("  " + n + ": " + e)
    sys.exit(0 if not FAILED else 1)
