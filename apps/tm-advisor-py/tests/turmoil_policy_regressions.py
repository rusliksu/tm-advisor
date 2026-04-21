#!/usr/bin/env python3
"""Regressions for Turmoil policyId handling in advisor allocations."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
ENTRYPOINTS_DIR = ROOT / "apps" / "tm-advisor-py" / "entrypoints"
SCRIPTS_DIR = ROOT / "scripts"
if str(ENTRYPOINTS_DIR) not in sys.path:
    sys.path.insert(0, str(ENTRYPOINTS_DIR))
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))


from tm_advisor.draft_play_advisor import mc_allocation_advice  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402


spec = importlib.util.spec_from_file_location(
    "tm_advisor_snapshot_entrypoint",
    ENTRYPOINTS_DIR / "advisor_snapshot.py",
)
assert spec is not None and spec.loader is not None
advisor_snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(advisor_snapshot)


def build_state(ruling: str, policy_ids: dict[str, str], *, mc: int = 40, heat: int = 0) -> GameState:
    agenda_keys = {
        "Mars First": "marsFirst",
        "Scientists": "scientists",
        "Unity": "unity",
        "Greens": "greens",
        "Reds": "reds",
        "Kelvinists": "kelvinists",
    }
    political_agendas = {
        agenda_keys[party]: {"bonusId": "", "policyId": policy_id}
        for party, policy_id in policy_ids.items()
    }
    return GameState({
        "thisPlayer": {
            "color": "red",
            "name": "me",
            "megaCredits": mc,
            "heat": heat,
            "terraformRating": 22,
            "tableau": [{"name": "CrediCor", "resources": 0, "isDisabled": False}],
            "tags": {},
        },
        "players": [
            {"color": "red", "name": "me", "terraformRating": 22, "cardsInHandNbr": 0, "tableau": []},
            {"color": "blue", "name": "opp", "terraformRating": 20, "cardsInHandNbr": 0, "tableau": []},
        ],
        "cardsInHand": [],
        "game": {
            "generation": 2,
            "phase": "action",
            "oxygenLevel": 0,
            "temperature": -20,
            "oceans": 0,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "spaces": [],
            "gameOptions": {"expansions": {"turmoil": True}},
            "turmoil": {
                "ruling": ruling,
                "dominant": ruling,
                "parties": [
                    {"name": ruling, "delegates": [{"color": "red", "number": 1}]},
                ],
                "lobby": [],
                "politicalAgendas": political_agendas,
                "policyActionUsers": [
                    {"color": "red", "turmoilPolicyActionUsed": False},
                ],
            },
        },
    })


def assert_passive_policy_not_actionable() -> None:
    state = build_state("Mars First", {"Mars First": "mp01"})
    plan = mc_allocation_advice(state)
    actions = [entry["action"] for entry in plan["allocations"]]
    assert not any("Policy: Mars First" in action for action in actions), actions
    assert state.turmoil["policy_ids"]["Mars First"] == "mp01"


def assert_active_policy_is_actionable() -> None:
    state = build_state("Scientists", {"Scientists": "sp01"}, mc=12)
    plan = mc_allocation_advice(state)
    policy_entries = [
        entry for entry in plan["allocations"]
        if entry.get("type") == "turmoil" and entry.get("policy_id") == "sp01"
    ]
    assert policy_entries, plan["allocations"]
    assert "draw 3 cards" in policy_entries[0]["action"], policy_entries[0]


def assert_live_passive_policy_fixture_prefers_real_card() -> None:
    fixture_path = Path(__file__).with_name("fixtures") / "live_turmoil_policy_snapshot.json"
    raw = json.loads(fixture_path.read_text(encoding="utf-8"))
    snapshot = advisor_snapshot.snapshot_from_raw(raw)

    allocations = snapshot.get("allocation", {}).get("allocations", [])
    assert not any(
        entry.get("policy_id") == "mp01" or "Policy: Mars First" in entry.get("action", "")
        for entry in allocations
    ), allocations

    best_move = snapshot.get("summary", {}).get("best_move", "")
    assert best_move.startswith("PLAY Ceres Spaceport"), snapshot.get("summary")


def main() -> None:
    assert_passive_policy_not_actionable()
    assert_active_policy_is_actionable()
    assert_live_passive_policy_fixture_prefers_real_card()
    print("advisor turmoil policy regressions: OK")


if __name__ == "__main__":
    main()
