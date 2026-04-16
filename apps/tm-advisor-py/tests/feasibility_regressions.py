#!/usr/bin/env python3
"""Feasibility adjuster regression tests - requirement satisfaction analysis."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.feasibility import FeasibilityAdjuster  # noqa: E402, will fail until impl
from tm_advisor.models import GameState  # noqa: E402


class MockReqChecker:
    """Mock requirements checker for testing."""

    def __init__(self, req_ok: bool, req_reason: str, req: str = ""):
        self._ok = req_ok
        self._reason = req_reason
        self._req = req

    def check(self, name: str, state) -> tuple[bool, str]:
        """Mock check implementation."""
        return self._ok, self._reason

    def get_req(self, name: str) -> str:
        """Mock get_req implementation."""
        return self._req


def build_state_with_req(
    my_mc: int = 30,
    my_tags: dict | None = None,
    my_cards_in_hand: list | None = None,
    generation: int = 8,
    temperature: int = -8,
    oxygen: int = 10,
    oceans: int = 5,
    venus: int = 10,
    tr: int = 20,
    card_name: str = "Test Card",
    req_reason: str = "",
):
    """Construct minimal GameState with requirements for testing feasibility adjuster.

    Args:
        my_mc: player's megaCredits
        my_tags: dict of {tag_name: count}
        my_cards_in_hand: list of card names in hand
        generation: current generation
        temperature: Mars temperature
        oxygen: oxygen level
        oceans: ocean count
        venus: Venus scale level
        tr: player's TR
        card_name: card being tested (for context)
        req_reason: requirement reason text (e.g., "Нужно 3 science tag")

    Returns:
        GameState with minimal setup
    """
    if my_tags is None:
        my_tags = {}
    if my_cards_in_hand is None:
        my_cards_in_hand = []

    cards_in_hand_list = [
        {
            "name": card,
            "tags": [],
            "cost": 3,
        }
        for card in my_cards_in_hand
    ]

    return GameState({
        "thisPlayer": {
            "color": "red",
            "name": "me",
            "megaCredits": my_mc,
            "megaCreditProduction": 1,
            "steelProduction": 0,
            "titaniumProduction": 0,
            "plantProduction": 0,
            "energyProduction": 0,
            "heatProduction": 0,
            "cardsInHandNbr": len(my_cards_in_hand),
            "tableau": [],
            "tags": my_tags,
            "terraformRating": tr,
        },
        "players": [
            {
                "color": "red",
                "name": "me",
                "megaCredits": my_mc,
                "megaCreditProduction": 1,
                "steelProduction": 0,
                "titaniumProduction": 0,
                "plantProduction": 0,
                "energyProduction": 0,
                "heatProduction": 0,
                "cardsInHandNbr": len(my_cards_in_hand),
                "tableau": [],
                "tags": my_tags,
                "terraformRating": tr,
            }
        ],
        "cardsInHand": cards_in_hand_list,
        "game": {
            "generation": generation,
            "phase": "action",
            "oxygenLevel": oxygen,
            "temperature": temperature,
            "oceans": oceans,
            "venusScaleLevel": venus,
            "milestones": [],
            "awards": [],
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


# Test 1: tag req infeasible late game
def test_tag_req_infeasible_late_game():
    """Tag req infeasible late game: need 3 science, have 1, no providers, gen 8 → delta == -40."""
    req_checker = MockReqChecker(
        req_ok=False,
        req_reason="Нужно 3 science tag (есть 1)",
        req="3 science tags"
    )
    adjuster = FeasibilityAdjuster(req_checker, None)
    state = build_state_with_req(
        my_tags={"science": 1},
        my_cards_in_hand=[],
        generation=8,
    )

    delta, reason = adjuster.compute_delta("Test Card", state)

    assert delta == -40, f"expected delta==-40, got {delta}; reason: {reason!r}"
    assert "tag" in reason.lower() or "science" in reason.lower(), \
        f"reason should mention tag: {reason!r}"


# Test 2: tag req with hand providers feasible
def test_tag_req_with_hand_providers_feasible():
    """Tag req with providers in hand: need 3 science, have 1, hand has 2 science cards, gen 8 → delta == 0."""
    req_checker = MockReqChecker(
        req_ok=False,
        req_reason="Нужно 3 science tag (есть 1)",
        req="3 science tags"
    )
    adjuster = FeasibilityAdjuster(req_checker, None)
    state = build_state_with_req(
        my_mc=50,
        my_tags={"science": 1},
        my_cards_in_hand=["Scientific Discovery", "Research Card"],
        generation=8,
    )

    delta, reason = adjuster.compute_delta("Test Card", state)

    # With providers in hand, should be feasible (delta == 0)
    assert delta == 0, f"expected delta==0 with hand providers, got {delta}; reason: {reason!r}"


# Test 3: param req temp infeasible
def test_param_req_temp_infeasible():
    """Temperature param req infeasible: need 0°C, sow -18°C (gap 9 steps), gens_left=2 → delta == -40."""
    req_checker = MockReqChecker(
        req_ok=False,
        req_reason="Нужно 0°C (сейчас -18°C)",
        req="0°C"
    )
    adjuster = FeasibilityAdjuster(req_checker, None)
    state = build_state_with_req(
        generation=8,
        temperature=-18,
    )

    delta, reason = adjuster.compute_delta("Magnetic Shield", state)

    assert delta == -40, f"expected delta==-40 for infeasible temp, got {delta}; reason: {reason!r}"
    assert "temp" in reason.lower() or "°" in reason.lower(), \
        f"reason should mention temperature: {reason!r}"


# Test 4: param req oxygen borderline
def test_param_req_oxygen_borderline():
    """Oxygen borderline: gap==gens_left. Need 10% O₂, have 8%, 2 gens left → delta == -10."""
    req_checker = MockReqChecker(
        req_ok=False,
        req_reason="Нужно 10% O₂ (сейчас 8%)",
        req="10% oxygen"
    )
    adjuster = FeasibilityAdjuster(req_checker, None)
    # Craft state so _estimate_remaining_gens returns ~2
    state = build_state_with_req(
        generation=7,
        temperature=0,
        oxygen=8,
        oceans=9,
        venus=30,
    )

    delta, reason = adjuster.compute_delta("Test Card", state)

    assert delta == -10, f"expected delta==-10 for borderline req, got {delta}; reason: {reason!r}"
    assert "oxygen" in reason.lower() or "o₂" in reason.lower(), \
        f"reason should mention oxygen: {reason!r}"


# Test 5: req ok no delta
def test_req_ok_no_delta():
    """Req OK: req_ok=True → delta == 0."""
    req_checker = MockReqChecker(
        req_ok=True,
        req_reason="",
        req=""
    )
    adjuster = FeasibilityAdjuster(req_checker, None)
    state = build_state_with_req(generation=5)

    delta, reason = adjuster.compute_delta("Test Card", state)

    assert delta == 0, f"expected delta==0 when req_ok, got {delta}"
    assert reason == "", f"reason should be empty when req_ok, got {reason!r}"


# Test 6: early game no hard penalty
def test_early_game_no_hard_penalty():
    """Early game: gen 2, infeasible tag req → delta >= -10 (not -40)."""
    req_checker = MockReqChecker(
        req_ok=False,
        req_reason="Нужно 3 science tag (есть 0)",
        req="3 science tags"
    )
    adjuster = FeasibilityAdjuster(req_checker, None)
    state = build_state_with_req(
        my_tags={},
        my_cards_in_hand=[],
        generation=2,
    )

    delta, reason = adjuster.compute_delta("Test Card", state)

    assert delta >= -10, f"expected delta >= -10 for early game, got {delta}"
    assert delta > -40, f"delta should not be -40 in early game, got {delta}"


# Test 7: TR req infeasible
def test_tr_req_infeasible():
    """TR req infeasible: need TR 30, have TR=14, gens_left=2 → delta == -40."""
    req_checker = MockReqChecker(
        req_ok=False,
        req_reason="Нужно TR 30 (сейчас 14)",
        req="TR 30"
    )
    adjuster = FeasibilityAdjuster(req_checker, None)
    state = build_state_with_req(
        generation=8,
        tr=14,
    )

    delta, reason = adjuster.compute_delta("Test Card", state)

    assert delta == -40, f"expected delta==-40 for infeasible TR, got {delta}; reason: {reason!r}"
    assert "tr" in reason.lower(), f"reason should mention TR: {reason!r}"


# Test 8: unknown req format passthrough
def test_unknown_req_format_passthrough():
    """Unknown req format: non-standard reason text → delta == 0 (safe fallback)."""
    req_checker = MockReqChecker(
        req_ok=False,
        req_reason="Some weird custom requirement",
        req="weird_req"
    )
    adjuster = FeasibilityAdjuster(req_checker, None)
    state = build_state_with_req(generation=5)

    delta, reason = adjuster.compute_delta("Test Card", state)

    # Unknown format → fallback to 0 (safe)
    assert delta == 0, f"expected delta==0 for unknown format, got {delta}; reason: {reason!r}"


# Test 9: clamp at minus 40
def test_clamp_at_minus_40():
    """Verify max negative delta clamps at -40, not lower."""
    req_checker = MockReqChecker(
        req_ok=False,
        req_reason="Multiple major failures",
        req="20 science tags / 0°C"
    )
    adjuster = FeasibilityAdjuster(req_checker, None)
    state = build_state_with_req(
        my_tags={},
        generation=8,
        temperature=-30,
    )

    delta, reason = adjuster.compute_delta("Test Card", state)

    assert delta >= -40, f"delta should not go below -40, got {delta}"
    assert delta <= 0, f"delta should be non-positive, got {delta}"


# Test 10: adjust wrapper function
def test_adjust_wrapper_function():
    """Adjust wrapper: returns (base_score + delta, reason)."""
    req_checker = MockReqChecker(
        req_ok=False,
        req_reason="Нужно 3 science tag (есть 0)",
        req="3 science tags"
    )
    adjuster = FeasibilityAdjuster(req_checker, None)
    state = build_state_with_req(
        my_tags={},
        generation=8,
    )

    base_score = 70
    adjusted_score, reason = adjuster.adjust(base_score, "Test Card", state)

    # adjusted_score should be base_score + delta
    delta, _ = adjuster.compute_delta("Test Card", state)
    expected_score = base_score + delta

    assert adjusted_score == expected_score, \
        f"expected adjusted_score={expected_score}, got {adjusted_score}"
    assert isinstance(reason, str), f"reason should be string, got {type(reason)}"


def test_reversed_req_max_temp_not_infeasible():
    """Card with 'Макс -12°C' req (Arctic Algae-style) — reversed req should NOT trigger hard penalty."""
    req_checker = MockReqChecker(
        req_ok=False,
        req_reason="Макс -12°C (сейчас -8°C)",
        req="max -12°C"
    )
    adjuster = FeasibilityAdjuster(req_checker, None)
    state = build_state_with_req(generation=5, temperature=-8)

    delta, reason = adjuster.compute_delta("Arctic Algae", state)
    assert delta == 0, f"reversed temp req must not trigger feasibility penalty, got {delta} / {reason!r}"


def test_reversed_req_max_oxygen_not_infeasible():
    """Card with 'Макс 5% O₂' req (Venus-early-style) — reversed req should NOT trigger hard penalty."""
    req_checker = MockReqChecker(
        req_ok=False,
        req_reason="Макс 5% O₂ (сейчас 10%)",
        req="max 5% oxygen"
    )
    adjuster = FeasibilityAdjuster(req_checker, None)
    state = build_state_with_req(generation=8, oxygen=10)

    delta, reason = adjuster.compute_delta("Early Venus Card", state)
    assert delta == 0, f"reversed O₂ req must not trigger feasibility penalty, got {delta} / {reason!r}"


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
