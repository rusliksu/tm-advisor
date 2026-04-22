from __future__ import annotations

import importlib.util
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
WATCH_LIVE_GAME = REPO_ROOT / "scripts" / "watch_live_game.py"


def load_watch_live_game():
    spec = importlib.util.spec_from_file_location("watch_live_game", WATCH_LIVE_GAME)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def build_snap() -> dict:
    return {
        "game": {},
        "me": {"name": "tester"},
        "live": {},
        "summary": {"best_move": "PLAY Playable A - highest play value"},
        "hand": [
            {"name": "Hold Monster", "score": 99},
            {"name": "Playable A", "score": 65},
            {"name": "Playable B", "score": 60},
        ],
        "hand_advice": [
            {
                "name": "Hold Monster",
                "action": "HOLD",
                "play_value_now": 0,
                "hold_value": 99,
                "reason": "requirement soon",
            },
            {
                "name": "Playable B",
                "action": "PLAY",
                "play_value_now": 15,
                "hold_value": 60,
                "reason": "acceptable fallback",
            },
            {
                "name": "Playable A",
                "action": "PLAY",
                "play_value_now": 35,
                "hold_value": 65,
                "reason": "highest play value",
            },
        ],
    }


def main() -> int:
    watch = load_watch_live_game()
    prev_snap = build_snap()
    curr_snap = {"me": {"name": "tester"}}

    play_entries = watch.ranked_advisor_play_entries(prev_snap)
    assert [entry["name"] for entry in play_entries] == ["Playable A", "Playable B"], play_entries
    assert play_entries[0]["score"] == 35
    assert play_entries[0]["play_value_now"] == 35

    context = watch.build_decision_context(prev_snap)
    top_names = [entry["name"] for entry in context["top_options"]]
    assert top_names == ["Playable A", "Playable B"], context["top_options"]

    miss = watch.build_advisor_miss(prev_snap, curr_snap, "p-test", "Playable B")
    assert miss is not None
    assert miss["score_kind"] == "play_value_now", miss
    assert miss["chosen_rank"] == 2, miss
    assert miss["best_card"] == "Playable A", miss
    assert [entry["name"] for entry in miss["top_choices"]] == ["Playable A", "Playable B"], miss
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
