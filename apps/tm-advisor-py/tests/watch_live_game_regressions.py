"""Regression checks for live game watcher offer detection."""

from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
WATCHER = ROOT / "scripts" / "watch_live_game.py"


def load_watcher_module():
    spec = importlib.util.spec_from_file_location("watch_live_game_test", WATCHER)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def main() -> None:
    watcher = load_watcher_module()

    stale_draft_state = {
        "current_pack": [],
        "drafted_cards": ["Moss"],
        "dealt_project_cards": ["Harvest", "Aquifer Pumping"],
        "waiting_type": None,
        "waiting_label": None,
    }
    assert watcher.research_offer_cards(stale_draft_state, "drafting") == []

    current_pack_state = {
        "current_pack": ["Comet", "Trees"],
        "drafted_cards": ["Moss"],
        "dealt_project_cards": ["Harvest"],
        "waiting_type": "card",
        "waiting_label": "Keep",
    }
    assert watcher.research_offer_cards(current_pack_state, "drafting") == ["Comet", "Trees"]

    active_research_state = {
        "current_pack": [],
        "drafted_cards": ["Moss"],
        "dealt_project_cards": ["Harvest", "Aquifer Pumping"],
        "waiting_type": "and",
        "waiting_label": "",
    }
    assert watcher.research_offer_cards(active_research_state, "research") == [
        "Harvest",
        "Aquifer Pumping",
    ]

    inactive_research_state = {
        "current_pack": [],
        "drafted_cards": ["Moss"],
        "dealt_project_cards": ["Harvest", "Aquifer Pumping"],
        "waiting_type": None,
        "waiting_label": None,
    }
    assert watcher.research_offer_cards(inactive_research_state, "research") == []

    print("watch live game regression checks: OK")


if __name__ == "__main__":
    main()
