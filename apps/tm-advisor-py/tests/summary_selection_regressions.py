#!/usr/bin/env python3
"""Regressions for snapshot summary best-move selection."""

from __future__ import annotations

import sys
import types
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
ENTRYPOINTS_DIR = ROOT / "apps" / "tm-advisor-py" / "entrypoints"
SCRIPTS_DIR = ROOT / "scripts"
if str(ENTRYPOINTS_DIR) not in sys.path:
    sys.path.insert(0, str(ENTRYPOINTS_DIR))
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))


if "colorama" not in sys.modules:
    class _Dummy:
        def __getattr__(self, name):
            return ""

    colorama = types.ModuleType("colorama")
    colorama.init = lambda *args, **kwargs: None
    colorama.Fore = _Dummy()
    colorama.Style = _Dummy()
    colorama.Back = _Dummy()
    sys.modules["colorama"] = colorama



spec = importlib.util.spec_from_file_location(
    "tm_advisor_snapshot_entrypoint",
    ENTRYPOINTS_DIR / "advisor_snapshot.py",
)
assert spec is not None and spec.loader is not None
advisor_snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(advisor_snapshot)


def main():
    result = {
        "game": {"phase": "early", "generation": 2},
        "trade": {"hint": "Trade Europa (+16 MC net)"},
        "alerts": [],
    }
    hand_advice = [
        {
            "name": "Lunar Beam",
            "action": "PLAY",
            "reason": "strong production swing",
            "play_value_now": 46.8,
            "priority": 3,
        },
        {
            "name": "Soil Enrichment",
            "action": "PLAY",
            "reason": "decent value",
            "play_value_now": 5.0,
            "priority": 4,
        },
    ]
    allocation_plan = {
        "allocations": [
            {
                "action": "🔵 Martian Zoo: add 1 animal to this card [stall]",
                "cost": 0,
                "value_mc": 1,
                "priority": 4,
                "type": "action",
            },
            {
                "action": "Trade Europa",
                "cost": 9,
                "value_mc": 16.0,
                "priority": 3,
                "type": "trade",
            },
        ],
    }

    summary = advisor_snapshot._build_summary_block(
        result,
        hand_advice,
        allocation_plan,
        draft_plan=None,
        draft_card_advice=None,
    )

    assert summary["best_move"].startswith("PLAY Lunar Beam"), summary
    assert "Martian Zoo" not in summary["best_move"], summary

    low_value_stall_summary = advisor_snapshot._build_summary_block(
        result,
        [
            {
                "name": "Jovian Embassy",
                "action": "PLAY",
                "reason": "good card, 5 gen left",
                "play_value_now": 11.6,
                "priority": 2,
            },
        ],
        {
            "allocations": [
                {
                    "action": "🔵 Nitrite Reducing Bacteria: add 1 microbe to this card [stall]",
                    "cost": 0,
                    "value_mc": 2,
                    "priority": 4,
                    "type": "action",
                },
            ],
        },
        draft_plan=None,
        draft_card_advice=None,
    )
    assert low_value_stall_summary["best_move"].startswith("PLAY Jovian Embassy"), low_value_stall_summary

    early_award_summary = advisor_snapshot._build_summary_block(
        result,
        [
            {
                "name": "Luna Metropolis",
                "action": "PLAY",
                "reason": "strong card, play ASAP",
                "play_value_now": 30.6,
                "priority": 2,
            },
            {
                "name": "Heavy Taxation",
                "action": "PLAY",
                "reason": "strong card, play ASAP",
                "play_value_now": 29.0,
                "priority": 2,
            },
        ],
        {
            "allocations": [
                {
                    "action": "Fund Visionary (MEDIUM, лид +2)",
                    "cost": 8,
                    "value_mc": 3,
                    "priority": 2,
                    "type": "award",
                    "urgency": "MEDIUM",
                },
            ],
        },
        draft_plan=None,
        draft_card_advice=None,
    )
    assert early_award_summary["best_move"].startswith("PLAY Luna Metropolis"), early_award_summary

    early_milestone_summary = advisor_snapshot._build_summary_block(
        result,
        [
            {
                "name": "Venera Base",
                "action": "PLAY",
                "reason": "strong card, play ASAP",
                "play_value_now": 61.6,
                "priority": 1,
            },
        ],
        {
            "allocations": [
                {
                    "action": "Claim Economizer",
                    "cost": 8,
                    "value_mc": 5,
                    "priority": 1,
                    "type": "milestone",
                },
            ],
        },
        draft_plan=None,
        draft_card_advice=None,
    )
    assert early_milestone_summary["best_move"].startswith("PLAY Venera Base"), early_milestone_summary

    mid_milestone_alert_summary = advisor_snapshot._build_summary_block(
        {
            "game": {"phase": "mid", "generation": 4},
            "trade": {},
            "alerts": ["🏆 ЗАЯВИ Economizer! (8 MC = 5 VP)"],
        },
        [
            {
                "name": "Venera Base",
                "action": "PLAY",
                "reason": "strong card, play ASAP",
                "play_value_now": 39.6,
                "priority": 1,
            },
        ],
        {"allocations": []},
        draft_plan=None,
        draft_card_advice=None,
    )
    assert mid_milestone_alert_summary["best_move"].startswith("PLAY Venera Base"), mid_milestone_alert_summary

    turmoil_summary = advisor_snapshot._build_summary_block(
        result,
        [
            {
                "name": "Aerial Mappers",
                "action": "PLAY",
                "reason": "good card, 10 gen left",
                "play_value_now": 38.8,
                "priority": 3,
            },
        ],
        {
            "allocations": [
                {
                    "action": "🏛️ Delegate → Kelvinists: push to dominant",
                    "cost": 5,
                    "value_mc": 8,
                    "priority": 4,
                    "type": "turmoil",
                },
            ],
        },
        draft_plan=None,
        draft_card_advice=None,
    )
    assert turmoil_summary["best_move"].startswith("PLAY Aerial Mappers"), turmoil_summary

    milestone_summary = advisor_snapshot._build_summary_block(
        result,
        hand_advice,
        {
            "allocations": [
                {
                    "action": "Claim Builder",
                    "cost": 8,
                    "value_mc": 15,
                    "priority": 1,
                    "type": "milestone",
                },
            ],
        },
        draft_plan=None,
        draft_card_advice=None,
    )
    assert milestone_summary["best_move"].startswith("🏆 ЗАЯВИ Builder!"), milestone_summary

    award_summary = advisor_snapshot._build_summary_block(
        result,
        [
            {
                "name": "Sponsors",
                "action": "PLAY",
                "reason": "good card, 7 gen left",
                "play_value_now": 12.0,
                "priority": 3,
            },
        ],
        {
            "allocations": [
                {
                    "action": "Fund Banker (MEDIUM, лид +2)",
                    "cost": 8,
                    "value_mc": 7,
                    "priority": 2,
                    "type": "award",
                    "urgency": "MEDIUM",
                },
            ],
        },
        draft_plan=None,
        draft_card_advice=None,
    )
    assert award_summary["best_move"].startswith("💰 ФОНДИРУЙ Banker!"), award_summary
    print("advisor summary selection regressions: OK")


if __name__ == "__main__":
    main()
