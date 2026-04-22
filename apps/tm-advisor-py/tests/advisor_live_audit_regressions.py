#!/usr/bin/env python3
"""Regression checks for live advisor audit rules."""

from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
AUDIT = ROOT / "scripts" / "advisor_live_audit.py"


def load_audit_module():
    spec = importlib.util.spec_from_file_location("advisor_live_audit_test", AUDIT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def checks(issues: list[dict]) -> list[str]:
    return [item["check"] for item in issues]


def main() -> None:
    audit = load_audit_module()

    assert audit.extract_identifier("https://terraforming-mars.herokuapp.com/game?id=gabc123") == (
        "gabc123",
        "https://terraforming-mars.herokuapp.com",
    )
    assert audit.extract_identifier("pabc123") == ("pabc123", None)
    assert audit.should_suppress_action_advice("solar")
    assert audit.should_suppress_action_advice("research")
    assert audit.should_suppress_action_advice("end")
    assert not audit.should_suppress_action_advice("action")

    noisy_solar = {
        "game": {"live_phase": "solar", "generation": 7},
        "me": {"name": "me"},
        "alerts": ["play a card"],
        "trade": {"hint": "Флот занят (1/1 trades)"},
        "play_advice": [{"name": "Trees", "action": "PLAY"}],
    }
    solar_issues = audit.audit_snapshot_payload("me", noisy_solar)
    assert "phase-gating" in checks(solar_issues), solar_issues
    assert "trade-noise" in checks(solar_issues), solar_issues

    clean_research = {
        "game": {"live_phase": "research", "generation": 3},
        "me": {"name": "me"},
        "alerts": [],
        "current_draft": [{"name": "Comet"}],
    }
    assert audit.audit_snapshot_payload("me", clean_research) == []

    conflict_snapshot = {
        "game": {"live_phase": "action", "generation": 8},
        "me": {"name": "me"},
        "alerts": [
            "⚠️ Ecological Zone В РУКЕ gen 5! ИГРАЙ СЕЙЧАС или ПРОДАЙ",
            "🎯 Play Herbivores EARLY: trigger-карта",
            "🌿 PLAY Greenhouses NOW: последний gen, max городов на карте!",
            "⚠️ GHG Producing Bacteria без Extreme-Cold Fungus. Рассмотри продажу.",
            "💰 Income: MC 0+TR 22",
        ],
        "play_advice": [
            {"name": "Ecological Zone", "action": "HOLD", "priority": 6},
            {"name": "Herbivores", "action": "SELL", "priority": 9},
            {"name": "Greenhouses", "action": "SELL", "priority": 9},
            {"name": "GHG Producing Bacteria", "action": "PLAY", "priority": 3},
        ],
    }
    conflict_issues = audit.audit_snapshot_payload("me", conflict_snapshot)
    conflict_messages = "\n".join(item["message"] for item in conflict_issues)
    assert checks(conflict_issues).count("alert-play-conflict") == 4, conflict_issues
    assert "Ecological Zone" in conflict_messages, conflict_messages
    assert "Herbivores" in conflict_messages, conflict_messages
    assert "Greenhouses" in conflict_messages, conflict_messages
    assert "GHG Producing Bacteria" in conflict_messages, conflict_messages

    clean_action = {
        "game": {"live_phase": "action", "generation": 8},
        "me": {"name": "me"},
        "alerts": ["💰 Income: MC 0+TR 22"],
        "play_advice": [{"name": "GHG Producing Bacteria", "action": "PLAY", "priority": 3}],
    }
    assert audit.audit_snapshot_payload("me", clean_action) == []

    claude_issues = audit.audit_claude_output(
        "me",
        "solar",
        "# TM Game Snapshot\n\n## Колонии\n\n## Рекомендации\n\n### Поселение (17 MC SP)",
    )
    assert checks(claude_issues).count("claude-phase-gating") == 2, claude_issues
    assert audit.audit_claude_output("me", "solar", "# TM Game Snapshot\n\n## Колонии\n\n## Стратегия") == []
    assert audit.audit_claude_output("me", "action", "## Рекомендации\n\n## Стандартные проекты") == []

    print("advisor live audit regression checks: OK")


if __name__ == "__main__":
    main()
