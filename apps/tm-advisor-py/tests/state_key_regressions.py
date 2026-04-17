#!/usr/bin/env python3
"""_state_key regression tests — cache invalidation on opp-only actions."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.advisor import AdvisorBot  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402


def _build(milestones=None, awards=None, opp_tableau=None):
    return GameState({
        "thisPlayer": {
            "color": "red", "name": "me",
            "megaCredits": 30, "megaCreditProduction": 2,
            "steelProduction": 0, "titaniumProduction": 0,
            "plantProduction": 0, "energyProduction": 0,
            "heatProduction": 0, "tableau": [], "tags": {},
            "terraformRating": 25,
        },
        "players": [
            {"color": "red", "name": "me",
             "megaCredits": 30, "megaCreditProduction": 2,
             "terraformRating": 25, "tableau": [], "tags": {},
             "cardsInHandNbr": 3},
            {"color": "blue", "name": "opp1",
             "megaCredits": 20, "megaCreditProduction": 1,
             "terraformRating": 20, "tags": {},
             "tableau": [{"name": n} for n in (opp_tableau or [])],
             "cardsInHandNbr": 2},
        ],
        "game": {
            "generation": 4, "phase": "action",
            "oxygenLevel": 5, "temperature": -12, "oceans": 3,
            "venusScaleLevel": 5,
            "milestones": milestones or [],
            "awards": awards or [],
            "colonies": [], "spaces": [],
            "gameOptions": {"expansions": {"colonies": True}},
            "gameAge": 42,
        },
    })


PASSED = 0
FAILED: list = []


def run(name, fn):
    global PASSED
    try:
        fn()
        PASSED += 1
        print(f"\u2713 {name}")
    except AssertionError as e:
        FAILED.append((name, str(e)))
        print(f"\u2717 {name}: {e}")
    except Exception as e:
        FAILED.append((name, f"ERROR {type(e).__name__}: {e}"))
        print(f"! {name}: ERROR {type(e).__name__}: {e}")


def test_milestone_claim_invalidates_key():
    """opp claims milestone without TR/MC delta → state_key must change."""
    before = _build(milestones=[{"name": "Gardener", "playerName": None}])
    after = _build(milestones=[{"name": "Gardener", "playerName": "opp1"}])
    k_before = AdvisorBot._state_key(before)
    k_after = AdvisorBot._state_key(after)
    assert k_before != k_after, "key must change when milestone claimed_by appears"


def test_award_fund_invalidates_key():
    """opp funds award → state_key must change."""
    before = _build(awards=[{"name": "Banker", "playerName": None, "scores": []}])
    after = _build(awards=[{"name": "Banker", "playerName": "opp1", "scores": []}])
    k_before = AdvisorBot._state_key(before)
    k_after = AdvisorBot._state_key(after)
    assert k_before != k_after


def test_opp_plays_card_invalidates_key():
    """opp plays a card (tableau grows) → state_key must change."""
    before = _build(opp_tableau=["Birds"])
    after = _build(opp_tableau=["Birds", "Ecological Zone"])
    k_before = AdvisorBot._state_key(before)
    k_after = AdvisorBot._state_key(after)
    assert k_before != k_after


def test_same_state_same_key():
    """Identical states produce identical keys."""
    a = _build(opp_tableau=["Birds"],
               milestones=[{"name": "Gardener", "playerName": "me"}],
               awards=[{"name": "Banker", "playerName": "opp1", "scores": []}])
    b = _build(opp_tableau=["Birds"],
               milestones=[{"name": "Gardener", "playerName": "me"}],
               awards=[{"name": "Banker", "playerName": "opp1", "scores": []}])
    assert AdvisorBot._state_key(a) == AdvisorBot._state_key(b)


if __name__ == "__main__":
    names = [n for n in dir() if n.startswith("test_") and callable(globals()[n])]
    for n in sorted(names):
        run(n, globals()[n])
    print(f"\n{PASSED} passed, {len(FAILED)} failed")
    for n, e in FAILED:
        print(f"  {n}: {e}")
    sys.exit(0 if not FAILED else 1)
