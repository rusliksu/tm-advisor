from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "tools" / "advisor" / "backfill-db-decisions.py"


def load_backfill():
    spec = importlib.util.spec_from_file_location("backfill_db_decisions", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def game_snapshot(played_cards: list[str], actions: list[str]) -> dict:
    return {
        "id": "g-test",
        "phase": "action",
        "generation": 4,
        "temperature": -14,
        "oxygenLevel": 6,
        "venusScaleLevel": 12,
        "board": {"spaces": []},
        "gameOptions": {"expansions": {}},
        "players": [
            {
                "id": "p-red",
                "name": "Human",
                "color": "red",
                "megaCredits": 20,
                "megaCreditProduction": 8,
                "terraformRating": 34,
                "cardsInHand": ["Playable A", "Playable B"],
                "playedCards": [{"name": name} for name in played_cards],
                "actionsThisGeneration": actions,
                "draftedCards": [],
                "dealtProjectCards": [],
                "dealtCorporationCards": [],
                "dealtPreludeCards": [],
                "preludeCardsInHand": [],
            }
        ],
    }


def fake_snapshot_from_raw(raw: dict) -> dict:
    return {
        "game": {
            "generation": raw["game"]["generation"],
            "phase": "mid",
            "live_phase": raw["game"]["phase"],
            "temperature": raw["game"]["temperature"],
            "oxygen": raw["game"]["oxygenLevel"],
            "oceans": raw["game"].get("oceans", 0),
            "venus": raw["game"]["venusScaleLevel"],
        },
        "me": {
            "name": raw["thisPlayer"]["name"],
            "corp": "Test Corp",
            "tr": raw["thisPlayer"]["terraformRating"],
            "mc": raw["thisPlayer"]["megaCredits"],
            "production": {"mc": raw["thisPlayer"]["megaCreditProduction"]},
        },
        "hand": [
            {"name": "Playable A", "effective_score": 70},
            {"name": "Playable B", "effective_score": 64},
        ],
        "hand_advice": [
            {"name": "Playable A", "action": "PLAY", "play_value_now": 20, "reason": "best"},
            {"name": "Playable B", "action": "PLAY", "play_value_now": 12, "reason": "fallback"},
        ],
        "current_draft": [],
        "alerts": [],
        "summary": {"best_move": "PLAY Playable A - best", "lines": []},
    }


def test_action_transition_writes_decision_and_real_action() -> None:
    backfill = load_backfill()
    rows = [
        {"save_id": 1, "game": game_snapshot(["Test Corp"], [])},
        {"save_id": 2, "game": game_snapshot(["Test Corp", "Playable B"], ["Playable B"])},
    ]

    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "db_backfill_g-test.jsonl"
        summary = backfill.write_game_backfill(rows, out, snapshot_fn=fake_snapshot_from_raw)
        events = [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines()]

    assert summary["transitions"] == 1, summary
    types = [event["type"] for event in events]
    assert types[0] == "session_start", types
    assert "decision_observed" in types, types
    assert "card_played" in types, types
    assert "actions_taken" in types, types
    real_actions = [event for event in events if event["type"] == "real_action_observed"]
    assert {event["action_type"] for event in real_actions} == {"card_played", "actions_taken"}, real_actions
    decision = next(event for event in events if event["type"] == "decision_observed")
    played = next(event for event in events if event["type"] == "card_played")
    assert played["decision_id"] == decision["decision_id"], (decision, played)
    assert played["prev_recommended_play"] == "Playable A", played
    assert played["prev_play_rank"] == 2, played


def test_build_raw_player_view_infers_draft_pack() -> None:
    backfill = load_backfill()
    game = game_snapshot([], [])
    game["phase"] = "drafting"
    player = game["players"][0]
    player["draftHand"] = ["Draft A", "Draft B"]
    raw = backfill.build_raw_player_view(game, player)

    assert raw["waitingFor"]["type"] == "card", raw["waitingFor"]
    assert [card["name"] for card in raw["waitingFor"]["cards"]] == ["Draft A", "Draft B"], raw["waitingFor"]
    assert raw["thisPlayer"]["tableau"] == [], raw["thisPlayer"]
    assert raw["thisPlayer"]["cardsInHandNbr"] == 2, raw["thisPlayer"]


if __name__ == "__main__":
    test_action_transition_writes_decision_and_real_action()
    test_build_raw_player_view_infers_draft_pack()
    print("backfill-db-decisions tests: OK")
