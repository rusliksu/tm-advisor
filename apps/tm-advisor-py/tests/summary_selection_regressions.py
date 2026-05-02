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
    non_action_prompt_summary = advisor_snapshot._build_summary_block(
        {
            "game": {"phase": "late", "generation": 7},
            "trade": {},
            "alerts": [],
            "current_prompt": "Resolve current prompt: Select player to remove up to ${0} plants",
        },
        [
            {
                "name": "Venus Allies",
                "action": "PLAY",
                "reason": "strong card",
                "play_value_now": 30.0,
                "priority": 2,
            },
        ],
        {"allocations": []},
        draft_plan=None,
        draft_card_advice=None,
    )
    assert non_action_prompt_summary["best_move"].startswith("Resolve current prompt:"), non_action_prompt_summary

    assert advisor_snapshot._should_build_action_plan(
        types.SimpleNamespace(
            phase="action",
            waiting_for={
                "type": "or",
                "title": {"message": "Select player to remove up to ${0} plants"},
            },
        )
    ) is False

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

    energy_trade_line = advisor_snapshot._format_allocation_summary_line({
        "action": "Trade Luna",
        "cost": 0,
        "cost_desc": "3 energy",
        "value_mc": 9.0,
        "priority": 3,
        "type": "trade",
    })
    assert "3 energy" in energy_trade_line, energy_trade_line
    assert "0.9 MC" not in energy_trade_line, energy_trade_line

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

    reds_card_allocation_summary = advisor_snapshot._build_summary_block(
        {
            "game": {"phase": "late", "generation": 7},
            "trade": {},
            "alerts": ["🔥 Heat 9 — НЕ трать без плана, Reds tax +3 MC"],
        },
        [
            {
                "name": "Imported Hydrogen",
                "action": "PLAY",
                "reason": "strong terraforming card",
                "play_value_now": 22.6,
                "priority": 3,
            },
        ],
        {
            "allocations": [
                {
                    "action": "Play Imported Hydrogen",
                    "cost": 4,
                    "value_mc": 30,
                    "priority": 2,
                    "type": "card",
                },
                {
                    "action": "Play Project Inspection",
                    "cost": 0,
                    "value_mc": 10,
                    "priority": 3,
                    "type": "card",
                },
                {
                    "action": "Temperature (heat) ⛔Reds: +3 MC tax",
                    "cost": 3,
                    "value_mc": 8,
                    "priority": 7,
                    "type": "conversion",
                },
            ],
        },
        draft_plan=None,
        draft_card_advice=None,
    )
    assert reds_card_allocation_summary["best_move"].startswith("Play Imported Hydrogen"), reds_card_allocation_summary
    assert "Temperature" not in reds_card_allocation_summary["best_move"], reds_card_allocation_summary

    budget_card_allocation_summary = advisor_snapshot._build_summary_block(
        {
            "game": {"phase": "late", "generation": 7},
            "trade": {},
            "alerts": [],
        },
        [
            {
                "name": "Giant Ice Asteroid",
                "action": "PLAY",
                "reason": "strong terraforming card",
                "play_value_now": 25.9,
                "priority": 3,
            },
        ],
        {
            "allocations": [
                {
                    "action": "Play Virus",
                    "cost": 1,
                    "value_mc": 12,
                    "priority": 2,
                    "type": "card",
                },
                {
                    "action": "Play Comet",
                    "cost": 0,
                    "value_mc": 28,
                    "priority": 4,
                    "type": "card",
                },
                {
                    "action": "Play Giant Ice Asteroid ❌нет MC",
                    "cost": 21,
                    "value_mc": 43,
                    "priority": 2,
                    "type": "card",
                },
            ],
        },
        draft_plan=None,
        draft_card_advice=None,
    )
    assert budget_card_allocation_summary["best_move"].startswith("Play Virus"), budget_card_allocation_summary
    assert "Giant Ice Asteroid" not in budget_card_allocation_summary["best_move"], budget_card_allocation_summary

    finish_now_summary = advisor_snapshot._build_summary_block(
        {
            "game": {
                "phase": "endgame",
                "generation": 9,
                "temperature": 6,
                "oxygen": 14,
                "oceans": 9,
            },
            "trade": {},
            "alerts": [],
        },
        [
            {
                "name": "Interstellar Colony Ship",
                "action": "PLAY",
                "reason": "4 VP dump",
                "play_value_now": 31.0,
                "priority": 1,
            },
        ],
        {
            "allocations": [
                {
                    "action": "Play Interstellar Colony Ship",
                    "cost": 24,
                    "value_mc": 31,
                    "priority": 1,
                    "type": "card",
                },
                {
                    "action": "Temperature (heat)",
                    "cost": 0,
                    "value_mc": 7,
                    "priority": 3,
                    "type": "conversion",
                },
            ],
        },
        draft_plan=None,
        draft_card_advice=None,
    )
    assert finish_now_summary["best_move"].startswith("🔥 Temperature"), finish_now_summary
    assert "Interstellar Colony Ship" not in finish_now_summary["best_move"], finish_now_summary

    city_not_finish_summary = advisor_snapshot._build_summary_block(
        {
            "game": {
                "phase": "endgame",
                "generation": 9,
                "temperature": 4,
                "oxygen": 14,
                "oceans": 9,
            },
            "trade": {},
            "alerts": [],
        },
        [
            {
                "name": "Interstellar Colony Ship",
                "action": "PLAY",
                "reason": "4 VP dump",
                "play_value_now": 31.0,
                "priority": 1,
            },
        ],
        {
            "allocations": [
                {
                    "action": "Play City",
                    "cost": 21,
                    "value_mc": 24,
                    "priority": 1,
                    "type": "standard_project",
                },
                {
                    "action": "Play Interstellar Colony Ship",
                    "cost": 24,
                    "value_mc": 31,
                    "priority": 2,
                    "type": "card",
                },
            ],
        },
        draft_plan=None,
        draft_card_advice=None,
    )
    assert not city_not_finish_summary["best_move"].startswith("🏁"), city_not_finish_summary

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

    high_value_late_ordered_play_summary = advisor_snapshot._build_summary_block(
        result,
        [
            {
                "name": "Rego Plastics",
                "action": "PLAY",
                "reason": "ranked earlier but low immediate value",
                "play_value_now": 1.0,
                "priority": 2,
            },
            {
                "name": "Giant Space Mirror",
                "action": "PLAY",
                "reason": "huge production swing",
                "play_value_now": 72.0,
                "priority": 3,
            },
        ],
        {
            "allocations": [
                {
                    "action": "Fund Industrialist (MEDIUM, лид +2)",
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
    assert high_value_late_ordered_play_summary["best_move"].startswith("PLAY Giant Space Mirror"), high_value_late_ordered_play_summary

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

    safe_mid_milestone_summary = advisor_snapshot._build_summary_block(
        {
            "game": {"phase": "mid", "generation": 4},
            "trade": {},
            "alerts": ["🏆 ЗАЯВИ Pioneer! (8 MC = 5 VP)"],
        },
        [
            {
                "name": "Research Colony",
                "action": "PLAY",
                "reason": "colony + cards",
                "play_value_now": 24.0,
                "priority": 2,
            },
        ],
        {
            "allocations": [
                {
                    "action": "Claim Pioneer",
                    "cost": 8,
                    "value_mc": 8,
                    "priority": 1,
                    "type": "milestone",
                },
            ],
        },
        draft_plan=None,
        draft_card_advice=None,
    )
    assert safe_mid_milestone_summary["best_move"].startswith("PLAY Research Colony"), safe_mid_milestone_summary

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

    ui_limited_play_summary = advisor_snapshot._build_summary_block(
        {
            "game": {"phase": "late", "live_phase": "action", "generation": 9},
            "trade": {},
            "alerts": [],
            "action_validation": {
                "saw_project_selector": True,
                "playable_project_cards": ["Sister Planet Support"],
            },
        },
        [
            {
                "name": "Venusian Animals",
                "action": "PLAY",
                "reason": "strong but not in current UI project-card selector",
                "play_value_now": 30.0,
                "priority": 1,
            },
            {
                "name": "Sister Planet Support",
                "action": "PLAY",
                "reason": "currently playable in UI",
                "play_value_now": 12.0,
                "priority": 2,
            },
        ],
        {
            "allocations": [
                {
                    "action": "Play Venusian Animals",
                    "cost": 14,
                    "value_mc": 30,
                    "priority": 1,
                    "type": "card",
                },
                {
                    "action": "Play Sister Planet Support",
                    "cost": 3,
                    "value_mc": 12,
                    "priority": 2,
                    "type": "card",
                },
            ],
        },
        draft_plan=None,
        draft_card_advice=None,
    )
    assert "Sister Planet Support" in ui_limited_play_summary["best_move"], ui_limited_play_summary
    assert not any("Venusian Animals" in line for line in ui_limited_play_summary["lines"]), ui_limited_play_summary
    assert ui_limited_play_summary["validation"]["rejected_summary_play_cards"] == ["Venusian Animals"], ui_limited_play_summary

    print("advisor summary selection regressions: OK")


if __name__ == "__main__":
    main()
