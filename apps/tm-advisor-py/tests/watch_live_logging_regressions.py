from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
WATCH_LIVE_GAME = REPO_ROOT / "scripts" / "watch_live_game.py"
ENTRYPOINTS_DIR = REPO_ROOT / "apps" / "tm-advisor-py" / "entrypoints"


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


def assert_production_ok_prompt_is_not_actionable() -> None:
    watch = load_watch_live_game()
    snap = {
        "game": {"generation": 7, "phase": "production", "live_phase": "production"},
        "me": {"name": "tester"},
        "live": {
            "color": "red",
            "hand_count": 2,
            "cards_in_hand": ["A", "B"],
            "waiting_type": "amount",
            "waiting_label": "OK",
        },
        "hand": [{"name": "A", "effective_score": 60}, {"name": "B", "effective_score": 55}],
        "hand_advice": [],
        "current_draft": [],
        "summary": {"best_move": None, "lines": []},
        "alerts": [],
    }

    diagnostics = watch.build_advisor_diagnostics(snap)
    assert watch.is_actionable_state(snap) is False, snap
    assert not any(item["code"] == "missing_best_move" for item in diagnostics), diagnostics

    event = watch.build_advisor_check_event(
        "g-test",
        {"generation": 7, "phase": "production", "activePlayer": "red"},
        ["p-red"],
        {"p-red": snap},
        "periodic",
        300.0,
    )
    player = event["players"][0]
    assert player["actionable"] is False, player
    assert player["best_move"] is None, player
    assert player["summary_lines"] == [], player
    assert player["top_play"] == [], player


def assert_resolve_prompt_does_not_require_hand_advice() -> None:
    watch = load_watch_live_game()
    snap = {
        "game": {"generation": 9, "phase": "late", "live_phase": "action"},
        "me": {"name": "tester"},
        "live": {
            "color": "red",
            "hand_count": 23,
            "cards_in_hand": ["A", "B"],
            "waiting_type": "or",
            "waiting_label": "Take action",
        },
        "hand": [{"name": "A", "effective_score": 60}, {"name": "B", "effective_score": 55}],
        "hand_advice": [],
        "current_draft": [],
        "summary": {"best_move": "Resolve current prompt: Select one option Save", "lines": []},
        "alerts": [],
    }

    diagnostics = watch.build_advisor_diagnostics(snap)
    assert not any(item["code"] == "missing_hand_advice" for item in diagnostics), diagnostics


def assert_advisor_check_filters_unavailable_project_plays() -> None:
    watch = load_watch_live_game()
    snap = build_snap()
    snap["game"] = {"live_phase": "action"}
    snap["live"] = {
        "color": "red",
        "hand_count": 2,
        "cards_in_hand": ["Playable A", "Playable B"],
        "waiting_type": "or",
        "waiting_label": "Take action",
    }
    snap["summary"] = {"best_move": "PLAY Playable B - UI-valid play", "lines": []}
    snap["action_validation"] = {
        "saw_project_selector": True,
        "playable_project_cards": ["Playable B"],
    }

    event = watch.build_advisor_check_event(
        "g-test",
        {"generation": 7, "phase": "action", "activePlayer": "red"},
        ["p-red"],
        {"p-red": snap},
        "periodic",
        300.0,
    )
    player = event["players"][0]
    assert [entry["name"] for entry in player["top_play"]] == ["Playable B"], player
    assert any(item["code"] == "play_not_available_in_ui" for item in player["diagnostics"]), player
    assert not any(item["code"] == "best_move_value_gap" for item in player["diagnostics"]), player


def assert_non_play_best_move_skips_play_value_gap() -> None:
    watch = load_watch_live_game()
    snap = build_snap()
    snap["game"] = {"live_phase": "action"}
    snap["live"] = {
        "color": "red",
        "hand_count": 2,
        "cards_in_hand": ["Playable A", "Playable B"],
        "waiting_type": "or",
        "waiting_label": "Take action",
    }
    snap["summary"] = {"best_move": "FUND A. Zoologist! (14 MC, HIGH)", "lines": []}
    snap["hand_advice"][1]["play_value_now"] = 10
    snap["hand_advice"][2]["play_value_now"] = 60

    diagnostics = watch.build_advisor_diagnostics(snap)
    codes = [item["code"] for item in diagnostics]
    assert "best_move_value_gap" not in codes, diagnostics
    assert "nonpositive_recommended_play" not in codes, diagnostics


def assert_snapshot_downgrades_unavailable_project_plays() -> None:
    entrypoint = REPO_ROOT / "apps" / "tm-advisor-py" / "entrypoints" / "advisor_snapshot.py"
    if str(ENTRYPOINTS_DIR) not in sys.path:
        sys.path.insert(0, str(ENTRYPOINTS_DIR))
    spec = importlib.util.spec_from_file_location("advisor_snapshot", entrypoint)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)

    result = {
        "game": {"phase": "late", "live_phase": "action", "generation": 9},
        "trade": {},
        "alerts": [],
        "action_validation": {
            "saw_project_selector": True,
            "playable_project_cards": ["Playable B"],
        },
    }
    hand_advice = [
        {
            "name": "Playable A",
            "action": "PLAY",
            "reason": "strong but absent from selector",
            "play_value_now": 35,
        },
        {
            "name": "Playable B",
            "action": "PLAY",
            "reason": "visible in selector",
            "play_value_now": 15,
        },
    ]

    public = module._public_hand_advice(result, hand_advice)
    assert public[0]["name"] == "Playable A", public
    assert public[0]["action"] == "HOLD", public
    assert public[0]["ui_unavailable"] is True, public
    assert public[1]["action"] == "PLAY", public


def assert_parse_game_identifier_accepts_lobby_url() -> None:
    watch = load_watch_live_game()

    game_id, base_url = watch.parse_game_identifier(
        "https://terraforming-mars.herokuapp.com/game?id=g2b0c1551b63c",
        "https://tm.knightbyte.win",
    )

    assert game_id == "g2b0c1551b63c"
    assert base_url == "https://terraforming-mars.herokuapp.com"
    assert watch.parse_game_identifier("g-test", "https://tm.knightbyte.win/") == (
        "g-test",
        "https://tm.knightbyte.win",
    )


def assert_build_player_state_uses_raw_replay_snapshot() -> None:
    watch = load_watch_live_game()
    raw_view = {
        "id": "p-red",
        "thisPlayer": {
            "id": "p-red",
            "name": "Human",
            "color": "red",
            "isActive": True,
            "cardsInHandNbr": 1,
            "terraformRating": 22,
            "megacredits": 15,
            "megacreditProduction": 4,
            "tableau": [{"name": "Test Corp"}],
            "actionsThisGeneration": [],
        },
        "cardsInHand": [{"name": "Playable A"}],
        "draftedCards": [],
    }
    calls = {"raw": 0, "id": 0}

    def fake_snapshot_from_raw(raw: dict) -> dict:
        calls["raw"] += 1
        assert raw is raw_view
        return {
            "game": {"generation": 3, "phase": "mid", "live_phase": "action"},
            "me": {"name": "Human", "corp": "Test Corp"},
            "hand": [{"name": "Playable A", "effective_score": 70}],
            "hand_advice": [],
            "summary": {"best_move": "PLAY Playable A"},
            "alerts": [],
        }

    def fake_snapshot(_player_id: str) -> dict:
        calls["id"] += 1
        raise AssertionError("build_player_state should reuse the fetched raw view")

    fake_snapshot.snapshot_from_raw = fake_snapshot_from_raw
    original_fetch_player_view = watch.fetch_player_view
    try:
        watch.fetch_player_view = lambda _base_url, _player_id: raw_view
        state = watch.build_player_state("p-red", fake_snapshot, "https://example.test/")
    finally:
        watch.fetch_player_view = original_fetch_player_view

    assert calls == {"raw": 1, "id": 0}, calls
    replay = state["replay_snapshot"]
    assert replay["format"] == "tm-player-view-v1", replay
    assert replay["base_url"] == "https://example.test", replay
    assert replay["player_id"] == "p-red", replay
    assert replay["raw_player_view"] is raw_view, replay
    assert state["live"]["cards_in_hand"] == ["Playable A"], state["live"]


def assert_decision_top_options_uses_colony_prompt() -> None:
    watch = load_watch_live_game()
    snap = {
        "game": {"generation": 1, "phase": "early", "live_phase": "action"},
        "live": {"waiting_type": "colony", "waiting_label": "Build"},
        "colony_prompt": {
            "options": [
                {"name": "Ceres", "rank": 1, "score": 31.0, "action": "COLONY", "reason": "+3 steel"},
                {"name": "Io", "rank": 2, "score": 14.0, "action": "COLONY", "reason": "+2 heat-prod"},
            ],
        },
        "hand": [{"name": "Distractor", "effective_score": 99}],
    }

    options = watch.decision_top_options(snap)
    assert [option["name"] for option in options] == ["Ceres", "Io"], options
    assert options[0]["action"] == "COLONY", options
    assert options[0]["reason"] == "+3 steel", options


def assert_decision_top_options_uses_card_prompt() -> None:
    watch = load_watch_live_game()
    snap = {
        "game": {"generation": 4, "phase": "mid", "live_phase": "action"},
        "live": {"waiting_type": "card", "waiting_label": "Reveal"},
        "decision": {
            "kind": "reveal_cards",
            "options": [
                {
                    "name": "Reveal all 3 cards",
                    "rank": 1,
                    "score": 3,
                    "action": "REVEAL_ALL",
                    "reason": "Public Plans pays +3 MC",
                    "cards": ["A", "B", "C"],
                },
                {
                    "name": "Reveal no cards",
                    "rank": 2,
                    "score": 0,
                    "action": "REVEAL_NONE",
                    "reason": "hide hand",
                    "cards": [],
                },
            ],
        },
        "hand": [{"name": "Distractor", "effective_score": 99}],
    }

    options = watch.decision_top_options(snap)
    assert [option["name"] for option in options] == ["Reveal all 3 cards", "Reveal no cards"], options
    assert options[0]["action"] == "REVEAL_ALL", options
    assert options[0]["cards"] == ["A", "B", "C"], options


def assert_decision_observed_deduplicates_and_links_real_action() -> None:
    watch = load_watch_live_game()
    snap = build_snap()
    snap["game"] = {
        "generation": 4,
        "phase": "action",
        "live_phase": "action",
        "activePlayer": "red",
    }
    snap["live"] = {
        "color": "red",
        "hand_count": 3,
        "cards_in_hand": ["Hold Monster", "Playable A", "Playable B"],
        "waiting_type": "or",
        "waiting_label": "Take action",
        "actions_this_generation": ["Draw card"],
        "tableau": ["Research"],
        "last_card_played": "Research",
    }
    snap["replay_snapshot"] = {
        "format": "tm-player-view-v1",
        "player_id": "p-red",
        "raw_player_view": {"id": "p-red"},
    }

    with tempfile.TemporaryDirectory() as tmp:
        log_path = Path(tmp) / "watch.jsonl"
        session = {
            "game_id": "g-test",
            "started_at": "20260504_010203",
            "log_path": str(log_path),
            "pending_decisions": {},
            "last_decision_signature_by_pid": {},
            "decision_counter": 0,
        }

        decision_id = watch.maybe_append_decision_observed(session, "p-red", snap, "test")
        assert decision_id == "g-test:20260504_010203:d1:p-red", decision_id
        assert session["pending_decisions"]["p-red"] == decision_id
        assert watch.maybe_append_decision_observed(session, "p-red", snap, "repeat") == decision_id

        watch.append_real_action_observed(
            str(log_path),
            "g-test",
            "p-red",
            snap,
            "card_played",
            {"card": "Playable A"},
            decision_id=decision_id,
            prev_snap=snap,
        )

        rows = [json.loads(line) for line in log_path.read_text(encoding="utf-8").splitlines()]
        assert [row["type"] for row in rows] == ["decision_observed", "real_action_observed"], rows
        decision = rows[0]
        assert decision["decision_id"] == decision_id, decision
        assert decision["best_move"].startswith("PLAY Playable A"), decision
        assert [entry["name"] for entry in decision["top_options"][:2]] == ["Playable A", "Playable B"], decision
        assert decision["replay_snapshot"]["raw_player_view"]["id"] == "p-red", decision
        action = rows[1]
        assert action["decision_id"] == decision_id, action
        assert action["action_type"] == "card_played", action
        assert action["action"]["card"] == "Playable A", action


def main() -> int:
    watch = load_watch_live_game()
    prev_snap = build_snap()
    curr_snap = {"me": {"name": "tester"}}

    assert_hand_check_event_contains_all_players()
    assert_advisor_check_event_contains_diagnostics()
    assert_draft_pack_detection_ignores_action_card_prompts()
    assert_production_ok_prompt_is_not_actionable()
    assert_resolve_prompt_does_not_require_hand_advice()
    assert_advisor_check_filters_unavailable_project_plays()
    assert_non_play_best_move_skips_play_value_gap()
    assert_snapshot_downgrades_unavailable_project_plays()
    assert_parse_game_identifier_accepts_lobby_url()
    assert_build_player_state_uses_raw_replay_snapshot()
    assert_decision_top_options_uses_colony_prompt()
    assert_decision_top_options_uses_card_prompt()
    assert_decision_observed_deduplicates_and_links_real_action()

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

    title_case_snap = build_snap()
    title_case_snap["summary"]["best_move"] = "Play Playable A - highest play value"
    assert watch.recommended_play_card_name(title_case_snap) == "Playable A"
    title_case_miss = watch.build_advisor_miss(
        title_case_snap, curr_snap, "p-test", "Playable B", same_poll_card_count=2)
    assert title_case_miss is not None
    assert title_case_miss["confidence"] == "low", title_case_miss
    assert title_case_miss["same_poll_card_count"] == 2, title_case_miss
    assert "multi_card_poll" in title_case_miss["reason"], title_case_miss

    no_best_move_snap = build_snap()
    no_best_move_snap["summary"] = {"best_move": None}
    assert watch.build_advisor_miss(no_best_move_snap, curr_snap, "p-test", "Playable B") is None
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
