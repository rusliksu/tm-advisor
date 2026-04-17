#!/usr/bin/env python3
"""Award capture regression tests."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.award_capture import urgent_award_actions  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402


def build_state(
    awards=None,
    my_color="red",
    my_mc=30,
    opp_mc_list=(40, 25),
    generation=8,
):
    if awards is None:
        awards = []
    players = [{"color": my_color, "name": "me", "megaCredits": my_mc}]
    for idx, mc in enumerate(opp_mc_list):
        players.append({
            "color": ("blue", "green", "yellow", "black")[idx],
            "name": f"opp{idx + 1}",
            "megaCredits": mc,
        })
    return GameState({
        "thisPlayer": {
            "color": my_color, "name": "me", "megaCredits": my_mc,
            "tableau": [], "tags": {},
        },
        "players": players,
        "game": {
            "generation": generation,
            "phase": "action",
            "oxygenLevel": 10, "temperature": 0, "oceans": 5,
            "venusScaleLevel": 10,
            "milestones": [],
            "awards": awards,
            "colonies": [], "spaces": [],
            "gameOptions": {"expansions": {"colonies": True}},
        },
    })


def _award(name, funded_by=None, scores=None):
    """Build a raw award dict in API format.

    GameState._parse_awards expects scores as list of {color, score}, and
    funded_by via playerName field.
    """
    raw = {"name": name}
    if funded_by:
        raw["playerName"] = funded_by
    scores_list = []
    for color, val in (scores or {}).items():
        scores_list.append({"color": color, "score": val})
    raw["scores"] = scores_list
    return raw


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


def test_no_awards_empty():
    state = build_state(awards=[])
    assert urgent_award_actions(state) == []


def test_all_three_funded_empty():
    awards = [
        _award("Cultivator", funded_by="me"),
        _award("Celebrity", funded_by="opp1"),
        _award("Constructor", funded_by="opp2"),
    ]
    state = build_state(awards=awards)
    assert urgent_award_actions(state) == []


def test_critical_last_slot_leader_opp_can_fund():
    """Gydro Constructor case: 2 funded, 1 slot left, I lead +2, opp has 45 MC >= 20."""
    awards = [
        _award("Cultivator", funded_by="me"),
        _award("Celebrity", funded_by="opp1"),
        _award("Constructor", scores={"red": 7, "blue": 5, "green": 4}),
    ]
    state = build_state(
        awards=awards, my_color="red", my_mc=30,
        opp_mc_list=(45, 19), generation=8,
    )
    out = urgent_award_actions(state)
    assert len(out) == 1, f"expected 1 action, got {len(out)}: {out}"
    rec = out[0]
    assert rec["urgency"] == "CRITICAL", f"expected CRITICAL, got {rec['urgency']}"
    assert rec["award_name"] == "Constructor"
    assert rec["cost"] == 20
    assert rec["lead"] == 2


def test_no_urgency_when_opp_cannot_fund():
    awards = [
        _award("Cultivator", funded_by="me"),
        _award("Celebrity", funded_by="opp1"),
        _award("Constructor", scores={"red": 7, "blue": 5}),
    ]
    state = build_state(
        awards=awards, my_color="red", my_mc=30,
        opp_mc_list=(5, 3), generation=8,
    )
    out = urgent_award_actions(state)
    if out:
        assert out[0]["urgency"] != "CRITICAL"


def test_not_leader_skip():
    awards = [
        _award("Cultivator", funded_by="me"),
        _award("Celebrity", funded_by="opp1"),
        _award("Constructor", scores={"red": 4, "blue": 7, "green": 5}),
    ]
    state = build_state(
        awards=awards, my_color="red", opp_mc_list=(45, 30), generation=8,
    )
    out = urgent_award_actions(state)
    for rec in out:
        assert rec["my_rank"] != 3, f"should skip rank 3: {rec}"


def test_sorting_critical_first():
    awards = [
        _award("A", scores={"red": 7, "blue": 5}),       # lead 2
        _award("B", scores={"red": 5, "blue": 4}),       # lead 1
    ]
    state = build_state(awards=awards, opp_mc_list=(40,), generation=8)
    out = urgent_award_actions(state)
    # Urgency is sorted first (CRITICAL < HIGH < MEDIUM); then lead within same urgency.
    if len(out) >= 2:
        pri = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}
        assert pri[out[0]["urgency"]] <= pri[out[1]["urgency"]], \
            f"urgency order broken: {out[0]['urgency']} vs {out[1]['urgency']}"


def test_medium_safe_lead():
    awards = [
        _award("Cultivator", funded_by="me"),
        _award("Celebrity", scores={"red": 8, "blue": 3}),
    ]
    state = build_state(awards=awards, opp_mc_list=(25,), generation=7)
    out = urgent_award_actions(state)
    assert len(out) >= 1
    assert out[0]["urgency"] in ("MEDIUM", "HIGH", "CRITICAL")


def test_tied_for_first_still_candidate():
    awards = [
        _award("Cultivator", funded_by="me"),
        _award("Celebrity", funded_by="opp1"),
        _award("Constructor", scores={"red": 5, "blue": 5, "green": 2}),
    ]
    state = build_state(awards=awards, opp_mc_list=(40, 5), generation=8)
    out = urgent_award_actions(state)
    assert len(out) == 1
    assert out[0]["my_rank"] == 1
    assert out[0]["lead"] == 0


def test_high_urgency_thin_lead_late_game():
    awards = [
        _award("A", scores={"red": 7, "blue": 6}),
    ]
    state = build_state(awards=awards, opp_mc_list=(40,), generation=8)
    out = urgent_award_actions(state)
    assert len(out) >= 1
    assert out[0]["urgency"] in ("HIGH", "CRITICAL")


def test_early_game_no_urgency():
    awards = [
        _award("A", scores={"red": 2, "blue": 1}),
    ]
    state = build_state(awards=awards, opp_mc_list=(40,), generation=2)
    out = urgent_award_actions(state)
    # Early game, thin lead → no HIGH, but MEDIUM only at lead >= 2 (we have lead 1)
    if out:
        assert out[0]["urgency"] != "CRITICAL"


if __name__ == "__main__":
    names = [n for n in dir() if n.startswith("test_") and callable(globals()[n])]
    for n in sorted(names):
        run(n, globals()[n])
    print(f"\n{PASSED} passed, {len(FAILED)} failed")
    if FAILED:
        for n, e in FAILED:
            print(f"  {n}: {e}")
    sys.exit(0 if not FAILED else 1)
