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


def assert_hand_check_event_contains_all_players() -> None:
    watch = load_watch_live_game()
    player_states = {
        "p1": {
            "me": {"name": "Ruslan", "corp": "Robinson Industries"},
            "live": {
                "color": "red",
                "is_active": True,
                "tr": 20,
                "mc": 12,
                "hand_count": 2,
                "cards_in_hand": ["Strip Mine", "Impactor Swarm"],
                "current_pack": ["Strip Mine", "Impactor Swarm"],
                "drafted_cards": ["Spin-off Department"],
                "waiting_type": "card",
                "waiting_label": "Keep",
            },
            "hand": [
                {"name": "Strip Mine", "effective_score": 82},
                {"name": "Impactor Swarm", "effective_score": 61},
            ],
            "hand_advice": [
                {
                    "name": "Strip Mine",
                    "action": "PLAY",
                    "play_value_now": 44,
                    "reason": "strong production",
                },
            ],
        },
        "p2": {
            "me": {"name": "Ilya", "corp": "unknown"},
            "live": {
                "color": "pink",
                "is_active": False,
                "tr": 20,
                "mc": 0,
                "hand_count": 0,
                "cards_in_hand": [],
            },
        },
        "p3": {
            "me": {"name": "Gold", "corp": "unknown"},
            "live": {
                "color": "gold",
                "is_active": False,
                "tr": 20,
                "mc": 0,
                "hand_count": 1,
                "cards_in_hand": ["GHG Factories"],
            },
            "hand": [{"name": "GHG Factories", "effective_score": 70}],
        },
    }

    event = watch.build_hand_check_event(
        "g-test",
        {"generation": 1, "phase": "initial_drafting", "activePlayer": "red"},
        ["p1", "p2", "p3"],
        player_states,
        "periodic",
        300,
    )

    assert event["type"] == "hand_check", event
    assert event["player_count"] == 3, event
    assert [player["player"] for player in event["players"]] == ["Ruslan", "Ilya", "Gold"], event
    first = event["players"][0]
    assert first["hand_count"] == 2, first
    assert first["cards_in_hand"][0]["name"] == "Strip Mine", first
    assert first["cards_in_hand"][0]["score"] == 82, first
    assert first["cards_in_hand"][0]["play_value_now"] == 44, first
    assert first["current_pack"] == ["Strip Mine", "Impactor Swarm"], first


def assert_advisor_check_event_contains_diagnostics() -> None:
    watch = load_watch_live_game()
    player_states = {
        "p1": {
            "me": {"name": "Ruslan", "corp": "Robinson Industries"},
            "live": {
                "color": "red",
                "hand_count": 2,
                "cards_in_hand": ["Playable A", "Playable B"],
                "waiting_type": "or",
                "waiting_label": "Take action",
            },
            "game": {"live_phase": "action"},
            "summary": {"best_move": "PLAY Missing Card - stale summary"},
            "hand": [
                {"name": "Playable A", "effective_score": 65},
                {"name": "Playable B", "effective_score": 60},
            ],
            "hand_advice": [
                {
                    "name": "Playable A",
                    "action": "PLAY",
                    "play_value_now": 35,
                    "reason": "highest play value",
                },
                {
                    "name": "Playable B",
                    "action": "PLAY",
                    "play_value_now": 15,
                    "reason": "fallback",
                },
            ],
            "alerts": [],
        },
        "p2": {
            "me": {"name": "Ilya", "corp": "unknown"},
            "live": {"color": "pink", "hand_count": 1, "cards_in_hand": ["Unknown"]},
            "game": {"live_phase": "action"},
            "summary": {},
            "hand": [{"name": "Unknown"}],
            "hand_advice": [],
            "snapshot_error": "boom",
        },
    }

    event = watch.build_advisor_check_event(
        "g-test",
        {"generation": 3, "phase": "action", "activePlayer": "red"},
        ["p1", "p2"],
        player_states,
        "periodic",
        300,
    )

    assert event["type"] == "advisor_check", event
    assert event["player_count"] == 2, event
    assert event["diagnostic_count"] >= 2, event
    assert event["max_severity"] == "error", event
    first = event["players"][0]
    assert first["top_play"][0]["name"] == "Playable A", first
    assert any(item["code"] == "best_move_card_not_in_hand" for item in first["diagnostics"]), first
    second = event["players"][1]
    assert second["snapshot_ok"] is False, second
    assert any(item["code"] == "snapshot_error" for item in second["diagnostics"]), second


def assert_draft_pack_detection_ignores_action_card_prompts() -> None:
    watch = load_watch_live_game()

    assert watch.is_draft_pack_snapshot({
        "game": {"live_phase": "drafting"},
        "live": {
            "current_pack": ["A", "B"],
            "waiting_type": "card",
            "waiting_label": "Keep",
        },
        "current_draft": [{"name": "A"}, {"name": "B"}],
    })
    assert watch.is_draft_pack_snapshot({
        "game": {"live_phase": "research"},
        "live": {
            "current_pack": ["A", "B"],
            "waiting_type": "card",
            "waiting_label": "Buy",
        },
        "current_draft": [{"name": "A"}, {"name": "B"}],
    })
    assert not watch.is_draft_pack_snapshot({
        "game": {"live_phase": "action"},
        "live": {
            "current_pack": ["A", "B"],
            "waiting_type": "card",
            "waiting_label": "Buy",
        },
        "current_draft": [],
    })
    assert not watch.is_draft_pack_snapshot({
        "game": {"live_phase": "action"},
        "live": {
            "current_pack": ["A", "B"],
            "waiting_type": "card",
            "waiting_label": "Add resource",
        },
        "current_draft": [],
    })


def main() -> int:
    watch = load_watch_live_game()
    prev_snap = build_snap()
    curr_snap = {"me": {"name": "tester"}}

    assert_hand_check_event_contains_all_players()
    assert_advisor_check_event_contains_diagnostics()
    assert_draft_pack_detection_ignores_action_card_prompts()

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
