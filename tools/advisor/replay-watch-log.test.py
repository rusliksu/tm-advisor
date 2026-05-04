from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "tools" / "advisor" / "replay-watch-log.py"


def load_replay():
    spec = importlib.util.spec_from_file_location("replay_watch_log", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def fake_snapshot_from_raw(raw: dict) -> dict:
    assert raw["id"] == "p-red"
    return {
        "game": {
            "generation": 5,
            "phase": "mid",
            "live_phase": "action",
            "temperature": -10,
            "oxygen": 6,
            "oceans": 5,
            "venus": 10,
        },
        "me": {
            "name": "Human",
            "corp": "Test Corp",
            "tr": 31,
            "mc": 8,
            "steel": 0,
            "titanium": 6,
            "plants": 4,
            "energy": 2,
            "heat": 0,
            "production": {"mc": 9},
        },
        "live": {
            "color": "red",
            "hand_count": 2,
            "waiting_type": "or",
            "waiting_label": "Take action",
        },
        "summary": {
            "best_move": "PLAY Research Colony - fresh replay",
            "lines": ["PLAY Research Colony - fresh replay"],
        },
        "hand": [
            {"name": "Research Colony", "effective_score": 87},
            {"name": "Corona Extractor", "effective_score": 80},
        ],
        "hand_advice": [
            {
                "name": "Research Colony",
                "action": "PLAY",
                "play_value_now": 42,
                "reason": "colony + draw first",
            },
            {
                "name": "Corona Extractor",
                "action": "PLAY",
                "play_value_now": 18,
                "reason": "extra energy is marginal",
            },
        ],
        "alerts": [],
    }


def test_replays_decision_and_refreshes_linked_play() -> None:
    replay = load_replay()
    events = [
        {
            "type": "decision_observed",
            "game_id": "g-test",
            "decision_id": "d1",
            "player_id": "p-red",
            "best_move": "PLAY Corona Extractor - stale",
            "top_options": [{"name": "Corona Extractor", "rank": 1, "score": 50}],
            "decision_context": {"top_options": [{"name": "Corona Extractor", "rank": 1, "score": 50}]},
            "replay_snapshot": {"raw_player_view": {"id": "p-red"}},
        },
        {
            "type": "card_played",
            "game_id": "g-test",
            "decision_id": "d1",
            "player_id": "p-red",
            "player": "Human",
            "card": "Research Colony",
            "prev_play_rank": 4,
            "prev_play_score": 9,
            "prev_recommended_play": "Corona Extractor",
            "decision_context": {"top_options": [{"name": "Corona Extractor", "rank": 1, "score": 50}]},
        },
        {
            "type": "advisor_miss",
            "game_id": "g-test",
            "decision_id": "d1",
            "player_id": "p-red",
            "player": "Human",
            "card": "Research Colony",
            "best_card": "Corona Extractor",
            "score_gap": 33,
        },
    ]

    updated, summary = replay.replay_events(events, snapshot_fn=fake_snapshot_from_raw)

    assert summary["decisions_replayed"] == 1, summary
    assert summary["linked_events_refreshed"] == 1, summary
    assert summary["old_misses_dropped"] == 1, summary
    assert [event["type"] for event in updated] == ["decision_observed", "card_played"], updated

    decision = updated[0]
    assert decision["best_move"] == "PLAY Research Colony - fresh replay", decision
    assert decision["top_options"][0]["name"] == "Research Colony", decision
    assert decision["top_options"][0]["play_value_now"] == 42, decision

    played = updated[1]
    assert played["prev_recommended_play"] == "Research Colony", played
    assert played["prev_play_rank"] == 1, played
    assert played["prev_play_score"] == 42, played
    assert played["decision_context"]["top_options"][0]["name"] == "Research Colony", played


def test_cli_writes_replayed_file() -> None:
    replay = load_replay()
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "watch_live_g-test.jsonl"
        src.write_text(json.dumps({"type": "session_start"}) + "\n", encoding="utf-8")
        events = replay.parse_jsonl(src)
        out = Path(tmp) / "out.jsonl"
        replay.write_jsonl(out, events)
        assert json.loads(out.read_text(encoding="utf-8").splitlines()[0])["type"] == "session_start"


if __name__ == "__main__":
    test_replays_decision_and_refreshes_linked_play()
    test_cli_writes_replayed_file()
    print("replay-watch-log tests: OK")
