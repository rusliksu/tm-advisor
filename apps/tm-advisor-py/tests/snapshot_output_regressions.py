#!/usr/bin/env python3
"""Snapshot output regressions for canonical tm-advisor-py entrypoint."""

from __future__ import annotations

import copy
import importlib.util
import json
import tempfile
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import advisor_snapshot  # noqa: E402
import watch_live_game  # noqa: E402


def advisor_db():
    return advisor_snapshot._get_runtime_bundle()[0]


def load_postgame_summary_module():
    path = ROOT / "tools" / "advisor" / "postgame-summary.py"
    spec = importlib.util.spec_from_file_location("postgame_summary_regression", path)
    assert spec is not None and spec.loader is not None, path
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_raw_state() -> dict:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 24,
        "steel": 0,
        "titanium": 0,
        "plants": 0,
        "energy": 3,
        "heat": 0,
        "megaCreditProduction": 6,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 1,
        "heatProduction": 0,
        "terraformRating": 24,
        "cardsInHandNbr": 2,
        "tableau": [
            {"name": "Teractor"},
            {"name": "Development Center"},
        ],
        "tags": {
            "earth": 1,
            "science": 1,
        },
    }
    opp = {
        "color": "blue",
        "name": "opp",
        "megaCredits": 18,
        "terraformRating": 22,
        "cardsInHandNbr": 3,
        "tableau": [{"name": "Helion"}],
        "tags": {},
    }
    return {
        "thisPlayer": me,
        "players": [me, opp],
        "pickedCorporationCard": [{"name": "Teractor"}],
        "cardsInHand": [
            {"name": "Sponsors", "calculatedCost": 6, "tags": ["Earth"]},
            {"name": "Birds", "calculatedCost": 10, "tags": ["Animal"]},
        ],
        "waitingFor": {
            "type": "card",
            "buttonLabel": "Research",
            "cards": [
                {"name": "Media Group", "calculatedCost": 6, "tags": ["Earth"]},
                {"name": "Comet", "calculatedCost": 21, "tags": ["Event", "Space"]},
            ],
        },
        "game": {
            "generation": 2,
            "phase": "research",
            "oxygenLevel": 0,
            "temperature": -24,
            "oceans": 1,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [],
            "gameOptions": {
                "expansions": {
                    "prelude": True,
                    "ceos": True,
                    "colonies": False,
                },
            },
        },
    }


def build_raw_state_with_claimable_milestone() -> dict:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 20,
        "steel": 0,
        "titanium": 0,
        "plants": 0,
        "energy": 0,
        "heat": 0,
        "megaCreditProduction": 6,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 24,
        "cardsInHandNbr": 1,
        "tableau": [{"name": "Immigrant City"}],
        "tags": {"building": 8},
    }
    opp = {
        "color": "blue",
        "name": "opp",
        "megaCredits": 18,
        "terraformRating": 22,
        "cardsInHandNbr": 2,
        "tableau": [],
        "tags": {},
    }
    return {
        "thisPlayer": me,
        "players": [me, opp],
        "pickedCorporationCard": [{"name": "CrediCor"}],
        "cardsInHand": [
            {"name": "Sponsors", "calculatedCost": 6, "tags": ["Earth"]},
        ],
        "game": {
            "generation": 4,
            "phase": "action",
            "oxygenLevel": 2,
            "temperature": -20,
            "oceans": 2,
            "venusScaleLevel": 0,
            "milestones": [
                {
                    "name": "Builder",
                    "scores": [
                        {"color": "red", "score": 8, "claimable": True},
                        {"color": "blue", "score": 6, "claimable": False},
                    ],
                }
            ],
            "awards": [],
            "gameOptions": {
                "expansions": {
                    "prelude": True,
                    "ceos": True,
                    "colonies": False,
                },
            },
        },
    }


def build_raw_state_with_fundable_award() -> dict:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 20,
        "steel": 0,
        "titanium": 0,
        "plants": 0,
        "energy": 0,
        "heat": 0,
        "megaCreditProduction": 8,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 26,
        "cardsInHandNbr": 1,
        "tableau": [{"name": "Teractor"}],
        "tags": {"earth": 1},
    }
    opp = {
        "color": "blue",
        "name": "opp",
        "megaCredits": 9,
        "terraformRating": 22,
        "cardsInHandNbr": 1,
        "tableau": [],
        "tags": {},
    }
    return {
        "thisPlayer": me,
        "players": [me, opp],
        "pickedCorporationCard": [{"name": "Teractor"}],
        "cardsInHand": [
            {"name": "Sponsors", "calculatedCost": 6, "tags": ["Earth"]},
        ],
        "game": {
            "generation": 7,
            "phase": "action",
            "oxygenLevel": 4,
            "temperature": -18,
            "oceans": 4,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [
                {
                    "name": "Banker",
                    "scores": [
                        {"color": "red", "score": 10},
                        {"color": "blue", "score": 8},
                    ],
                }
            ],
            "gameOptions": {
                "expansions": {
                    "prelude": True,
                    "ceos": True,
                    "colonies": False,
                },
            },
        },
    }


def build_raw_state_with_endgame_action_alerts() -> dict:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 21,
        "steel": 0,
        "titanium": 0,
        "plants": 0,
        "energy": 1,
        "heat": 0,
        "megaCreditProduction": 10,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 0,
        "heatProduction": 0,
        "terraformRating": 35,
        "cardsInHandNbr": 1,
        "tableau": [
            {"name": "Celestic"},
            {"name": "Development Center"},
            {"name": "Restricted Area"},
            {"name": "Birds", "resources": 1},
            {"name": "Viron"},
            {"name": "Local Shading", "resources": 4},
        ],
        "tags": {},
    }
    return {
        "thisPlayer": me,
        "players": [me],
        "pickedCorporationCard": [{"name": "Celestic"}],
        "cardsInHand": [
            {"name": "Aerosport Tournament", "calculatedCost": 5, "tags": []},
        ],
        "game": {
            "generation": 9,
            "phase": "action",
            "oxygenLevel": 14,
            "temperature": 8,
            "oceans": 9,
            "venusScaleLevel": 20,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "turmoil": {
                "ruling": "Unity",
                "dominant": "Scientists",
                "parties": [],
            },
            "gameOptions": {
                "expansions": {
                    "prelude": True,
                    "ceos": True,
                    "colonies": True,
                    "turmoil": True,
                    "venusNext": True,
                },
            },
        },
    }


def build_action_card_prompt_raw_state() -> dict:
    raw = copy.deepcopy(build_raw_state())
    raw["game"]["phase"] = "action"
    raw["waitingFor"] = {
        "type": "card",
        "buttonLabel": "Buy",
        "cards": [
            {"name": "Recession", "calculatedCost": 6, "tags": ["Event"]},
        ],
    }
    return raw


def build_server_calculated_cost_raw_state() -> dict:
    raw = copy.deepcopy(build_raw_state())
    raw["game"]["phase"] = "action"
    raw.pop("waitingFor", None)
    raw["thisPlayer"]["megaCredits"] = 1
    raw["thisPlayer"]["tableau"] = [
        {"name": "Teractor"},
        {"name": "Earth Office"},
    ]
    raw["thisPlayer"]["tags"] = {"earth": 2}
    raw["cardsInHand"] = [
        {"name": "Topsoil Contract", "calculatedCost": 2, "tags": ["Microbe", "Earth"]},
    ]
    return raw


def build_closed_max_req_draft_raw_state() -> dict:
    raw = copy.deepcopy(build_raw_state())
    raw["game"]["generation"] = 8
    raw["game"]["phase"] = "research"
    raw["game"]["oxygenLevel"] = 6
    raw["thisPlayer"]["megaCredits"] = 30
    raw["cardsInHand"] = []
    raw["waitingFor"] = {
        "type": "card",
        "buttonLabel": "Research",
        "cards": [
            {"name": "Colonizer Training Camp", "calculatedCost": 8, "tags": ["Jovian", "Building"]},
        ],
    }
    return raw


def build_psychrophiles_payment_raw_state() -> dict:
    raw = copy.deepcopy(build_raw_state())
    raw["game"]["generation"] = 11
    raw["game"]["phase"] = "action"
    raw["game"]["oxygenLevel"] = 14
    raw["game"]["temperature"] = 8
    raw["game"]["oceans"] = 9
    raw.pop("waitingFor", None)
    raw["thisPlayer"]["megaCredits"] = 7
    raw["thisPlayer"]["tableau"] = [
        {"name": "Celestic"},
        {"name": "Psychrophiles", "resources": 4},
    ]
    raw["thisPlayer"]["tags"] = {"microbe": 1}
    raw["cardsInHand"] = [
        {"name": "Kelp Farming", "calculatedCost": 15, "tags": ["Plant"]},
    ]
    return raw


def assert_watch_fetch_json_retries_transient_errors():
    calls = []
    sleeps = []
    original_urlopen = watch_live_game.urllib.request.urlopen
    original_sleep = watch_live_game.time.sleep

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b'{"ok": true}'

    def fake_urlopen(url, timeout=None):
        calls.append((url, timeout))
        if len(calls) == 1:
            raise watch_live_game.urllib.error.URLError("reset")
        return FakeResponse()

    try:
        watch_live_game.urllib.request.urlopen = fake_urlopen
        watch_live_game.time.sleep = lambda seconds: sleeps.append(seconds)
        assert watch_live_game.fetch_json("https://example.invalid/game", retries=2) == {"ok": True}
        assert len(calls) == 2, calls
        assert sleeps, sleeps
    finally:
        watch_live_game.urllib.request.urlopen = original_urlopen
        watch_live_game.time.sleep = original_sleep


def assert_watch_monitor_survives_poll_errors():
    original_start = watch_live_game.start_game_session
    original_poll = watch_live_game.poll_game_session
    original_sleep = watch_live_game.time.sleep

    with tempfile.NamedTemporaryFile("w+", encoding="utf-8", delete=False) as fh:
        log_path = Path(fh.name)

    calls = []

    def fake_poll(_session):
        calls.append("poll")
        if len(calls) == 1:
            raise watch_live_game.urllib.error.URLError("reset")
        return {"active": False}

    try:
        watch_live_game.start_game_session = lambda _game_id, _base_url: {"log_path": str(log_path)}
        watch_live_game.poll_game_session = fake_poll
        watch_live_game.time.sleep = lambda _seconds: None
        assert watch_live_game.monitor_game("g-test", 0, "https://example.invalid") == str(log_path)
        lines = log_path.read_text(encoding="utf-8").splitlines()
        assert any('"type": "poll_error"' in line for line in lines), lines
        assert len(calls) == 2, calls
    finally:
        watch_live_game.start_game_session = original_start
        watch_live_game.poll_game_session = original_poll
        watch_live_game.time.sleep = original_sleep
        try:
            log_path.unlink()
        except FileNotFoundError:
            pass


def assert_watch_advisor_miss_uses_play_advice():
    prev_snap = {
        "me": {"name": "ipauls"},
        "game": {},
        "live": {},
        "alerts": [],
        "summary": {},
        "hand": [
            {
                "name": "Atmoscoop",
                "effective_score": 77,
                "play_action": "HOLD",
                "play_reason": "req: missing science tag",
            },
            {
                "name": "Media Archives",
                "effective_score": 73,
                "play_action": "PLAY",
                "play_reason": "good card, 1 gen left",
            },
            {
                "name": "Earth Elevator",
                "effective_score": 57,
                "play_action": "PLAY",
                "play_reason": "endgame VP push",
            },
        ],
        "hand_advice": [
            {
                "name": "Earth Elevator",
                "action": "PLAY",
                "reason": "endgame VP push",
                "play_value_now": 28.8,
                "priority": 3,
            },
            {
                "name": "Media Archives",
                "action": "PLAY",
                "reason": "good card, 1 gen left",
                "play_value_now": 10.0,
                "priority": 4,
            },
            {
                "name": "Atmoscoop",
                "action": "HOLD",
                "reason": "req: missing science tag",
                "play_value_now": 0,
                "hold_value": 12.0,
                "priority": 6,
            },
        ],
    }
    curr_snap = {"me": {"name": "ipauls"}}

    context = watch_live_game.build_decision_context(prev_snap)
    assert context["top_options"][0]["name"] == "Earth Elevator", context
    assert context["top_options"][0]["action"] == "PLAY", context
    assert context["top_options"][0]["play_value_now"] == 28.8, context

    assert watch_live_game.build_advisor_miss(prev_snap, curr_snap, "p1", "Earth Elevator") is None

    miss = watch_live_game.build_advisor_miss(prev_snap, curr_snap, "p1", "Media Archives")
    assert miss is not None, miss
    assert miss["best_card"] == "Earth Elevator", miss
    assert miss["score_kind"] == "play_value_now", miss
    assert miss["score_gap"] == 18.8, miss
    assert all(choice["action"] == "PLAY" for choice in miss["top_choices"]), miss

    ordered_play_snap = {
        "me": {"name": "wdkymyms"},
        "game": {},
        "live": {},
        "alerts": [],
        "summary": {
            "best_move": "PLAY Ganymede Colony — strong card, play ASAP | value 34.6 | prio 1"
        },
        "hand": [
            {"name": "Imported Nitrogen", "effective_score": 95},
            {"name": "Deimos Down:promo", "effective_score": 89},
            {"name": "Ganymede Colony", "effective_score": 86},
            {"name": "Cloud Tourism", "effective_score": 58},
        ],
        "hand_advice": [
            {
                "name": "Imported Nitrogen",
                "action": "PLAY",
                "reason": "strong card",
                "play_value_now": 19.4,
            },
            {
                "name": "Deimos Down:promo",
                "action": "HOLD",
                "reason": "sequence",
                "play_value_now": 0,
            },
            {
                "name": "Ganymede Colony",
                "action": "PLAY",
                "reason": "top ordered play",
                "play_value_now": 34.6,
            },
            {
                "name": "Cloud Tourism",
                "action": "PLAY",
                "reason": "low value",
                "play_value_now": 1.0,
            },
        ],
    }
    ordered_miss = watch_live_game.build_advisor_miss(
        ordered_play_snap,
        curr_snap,
        "p1",
        "Cloud Tourism",
    )
    assert ordered_miss is not None, ordered_miss
    assert ordered_miss["best_card"] == "Ganymede Colony", ordered_miss
    assert ordered_miss["top_choices"][0]["name"] == "Ganymede Colony", ordered_miss

    non_card_priority_snap = copy.deepcopy(prev_snap)
    non_card_priority_snap["summary"] = {"best_move": "💰 ФОНДИРУЙ Investor! (8 MC, HIGH)"}
    assert (
        watch_live_game.build_advisor_miss(
            non_card_priority_snap,
            curr_snap,
            "p1",
            "Media Archives",
        )
        is None
    )


def assert_postgame_summary_aggregates_restarted_logs():
    module = load_postgame_summary_module()

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        first_log = tmp_dir / "watch_live_g-test_001.jsonl"
        last_log = tmp_dir / "watch_live_g-test_002.jsonl"
        played_event = {
            "type": "card_played",
            "player_id": "p1",
            "card": "Kelp Farming",
            "last_card_played": "Kelp Farming",
            "prev_hand_rank": 3,
            "prev_hand_score": 91,
            "decision_context": {
                "top_options": [
                    {
                        "name": "Earth Elevator",
                        "rank": 1,
                        "score": 99,
                        "action": "HOLD",
                        "reason": "legacy raw-hand ranking false positive",
                    },
                    {
                        "name": "Kelp Farming",
                        "rank": 2,
                        "score": 91,
                        "action": "PLAY",
                        "reason": "playable endgame VP",
                    },
                ]
            },
        }
        miss_event = {
            "type": "advisor_miss",
            "player_id": "p1",
            "card": "Kelp Farming",
            "best_card": "Earth Elevator",
            "chosen_rank": 2,
            "score_gap": 18.8,
        }
        non_card_priority_played_event = {
            "type": "card_played",
            "player_id": "p1",
            "card": "Media Archives",
            "last_card_played": "Media Archives",
            "prev_hand_rank": 3,
            "prev_hand_score": 80,
            "decision_context": {
                "best_move": "💰 ФОНДИРУЙ Investor! (8 MC, HIGH)",
                "top_options": [
                    {
                        "name": "Virus",
                        "rank": 1,
                        "score": 90,
                        "action": "PLAY",
                        "reason": "strong card",
                    }
                ],
            },
        }
        non_card_priority_miss_event = {
            "type": "advisor_miss",
            "player_id": "p1",
            "card": "Media Archives",
            "best_card": "Virus",
            "chosen_rank": 3,
            "score_gap": 10,
        }
        mismatched_best_played_event = {
            "type": "card_played",
            "player_id": "p1",
            "card": "Cloud Tourism",
            "last_card_played": "Cloud Tourism",
            "prev_hand_rank": 12,
            "prev_hand_score": 58,
            "decision_context": {
                "best_move": "PLAY Ganymede Colony — strong card, play ASAP",
                "top_options": [
                    {
                        "name": "Imported Nitrogen",
                        "rank": 1,
                        "score": 95,
                        "action": "PLAY",
                        "reason": "legacy raw leader",
                    },
                    {
                        "name": "Ganymede Colony",
                        "rank": 3,
                        "score": 86,
                        "action": "PLAY",
                        "reason": "top ordered play",
                    },
                ],
            },
        }
        mismatched_best_miss_event = {
            "type": "advisor_miss",
            "player_id": "p1",
            "card": "Cloud Tourism",
            "best_card": "Imported Nitrogen",
            "chosen_rank": 12,
            "score_gap": 37,
        }
        play_ranked_event = {
            "type": "card_played",
            "player_id": "p1",
            "card": "Media Archives",
            "last_card_played": "Media Archives",
            "prev_hand_rank": 14,
            "prev_hand_score": 44,
            "prev_play_rank": 2,
            "prev_play_score": 4.5,
            "decision_context": {
                "best_move": "PLAY Ganymede Colony — strong card, play ASAP",
            },
        }

        first_events = [
            {"type": "session_start", "game_id": "g-test", "session": "early"},
            {"type": "initial_snapshot", "player_id": "p1", "player": "early"},
            played_event,
            miss_event,
            non_card_priority_played_event,
            non_card_priority_miss_event,
            mismatched_best_played_event,
            mismatched_best_miss_event,
            play_ranked_event,
        ]
        last_events = [
            {"type": "session_start", "game_id": "g-test", "session": "end-only"},
            {"type": "initial_snapshot", "player_id": "p1", "player": "late"},
            miss_event,
            {"type": "game_end", "game_id": "g-test"},
        ]
        first_log.write_text(
            "".join(json.dumps(event) + "\n" for event in first_events),
            encoding="utf-8",
        )
        last_log.write_text(
            "".join(json.dumps(event) + "\n" for event in last_events),
            encoding="utf-8",
        )

        parsed = module.parse_log([first_log, last_log])
        assert parsed["session_start"]["session"] == "early", parsed["session_start"]
        assert parsed["initial_snapshots"]["p1"]["player"] == "early", parsed["initial_snapshots"]
        assert parsed["log_paths"] == [str(first_log), str(last_log)], parsed["log_paths"]
        assert len(parsed["card_played"]["p1"]) == 4, parsed["card_played"]
        assert parsed["card_played"]["p1"][0]["card"] == "Kelp Farming", parsed["card_played"]
        assert len(parsed["advisor_miss"]["p1"]) == 3, parsed["advisor_miss"]
        assert parsed["advisor_miss"]["p1"][0]["best_card"] == "Earth Elevator", parsed["advisor_miss"]
        miss_summary = module.summarize_misses(
            parsed["advisor_miss"]["p1"],
            parsed["card_played"]["p1"],
        )
        assert miss_summary["raw_count"] == 3, miss_summary
        assert miss_summary["count"] == 0, miss_summary
        assert miss_summary["stale_filtered_count"] == 3, miss_summary
        offtop_summary = module.summarize_offtop(parsed["card_played"]["p1"])
        assert offtop_summary["ranked_plays"] == 3, offtop_summary
        assert offtop_summary["rank_source_counts"] == {"legacy_hand": 2, "play": 1}, offtop_summary
        assert offtop_summary["off_top_count"] == 1, offtop_summary
        assert offtop_summary["stale_filtered_count"] == 1, offtop_summary
        assert offtop_summary["top_off_top"][0]["card"] == "Cloud Tourism", offtop_summary
        assert offtop_summary["top_off_top"][0]["source"] == "legacy_hand", offtop_summary
        assert all(row["card"] != "Media Archives" for row in offtop_summary["top_off_top"]), offtop_summary


def main():
    db = advisor_db()
    bundle_a = advisor_snapshot._get_runtime_bundle()
    bundle_b = advisor_snapshot._get_runtime_bundle()
    assert bundle_a is bundle_b

    snap = advisor_snapshot.snapshot_from_raw(build_raw_state())

    hand_rows = {card["name"]: card for card in snap["hand"]}
    sponsors_desc = db.get_advisor_description("Sponsors", max_len=180, locale="ru")
    assert hand_rows["Sponsors"]["play_action"] == "PLAY", hand_rows["Sponsors"]
    assert hand_rows["Sponsors"]["play_reason"], hand_rows["Sponsors"]
    assert hand_rows["Sponsors"]["description"] == sponsors_desc, hand_rows["Sponsors"]
    assert "Описание:" in hand_rows["Sponsors"]["note"], hand_rows["Sponsors"]
    assert sponsors_desc in hand_rows["Sponsors"]["note"], hand_rows["Sponsors"]
    assert hand_rows["Birds"]["play_action"] in {"HOLD", "SELL"}, hand_rows["Birds"]
    assert "req" in hand_rows["Birds"]["play_reason"], hand_rows["Birds"]
    assert hand_rows["Birds"]["description_first"] is True, hand_rows["Birds"]
    assert hand_rows["Birds"]["note"].startswith("Описание:"), hand_rows["Birds"]
    assert "13%" in hand_rows["Birds"]["note"], hand_rows["Birds"]

    hand_advice = {row["name"]: row for row in snap["hand_advice"]}
    assert hand_advice["Sponsors"]["action"] == hand_rows["Sponsors"]["play_action"], hand_advice
    assert hand_advice["Birds"]["reason"] == hand_rows["Birds"]["play_reason"], hand_advice
    assert hand_advice["Birds"]["description_first"] is True, hand_advice["Birds"]

    draft_rows = {card["name"]: card for card in snap["current_draft"]}
    media_group_desc = db.get_advisor_description("Media Group", max_len=180, locale="ru")
    assert draft_rows["Media Group"]["draft_action"] in {"BUY", "SKIP"}, draft_rows["Media Group"]
    assert draft_rows["Media Group"]["draft_reason"], draft_rows["Media Group"]
    assert draft_rows["Media Group"]["description"] == media_group_desc, draft_rows["Media Group"]
    assert draft_rows["Comet"]["draft_action"] in {"BUY", "SKIP"}, draft_rows["Comet"]

    draft_advice = snap["draft_advice"]
    assert isinstance(draft_advice.get("buy_count"), int), draft_advice
    card_advice = {row["name"]: row for row in draft_advice["card_advice"]}
    assert card_advice["Media Group"]["action"] == draft_rows["Media Group"]["draft_action"], card_advice
    assert card_advice["Comet"]["reason"] == draft_rows["Comet"]["draft_reason"], card_advice

    assert any(
        "Development Center: 1 energy → draw 1 card" in alert
        for alert in snap["alerts"]
    ), snap["alerts"]

    summary = snap["summary"]
    assert summary["best_move"], summary
    assert any("Sponsors" in line for line in summary["hand"]), summary
    assert any("Описание:" in line for line in summary["hand"]), summary
    assert any(sponsors_desc in line for line in summary["hand"]), summary
    birds_line = next(line for line in summary["hand"] if "Birds" in line)
    assert "Описание:" in birds_line, birds_line
    assert "13%" in birds_line, birds_line
    assert birds_line.index("Описание:") < birds_line.index("req"), birds_line
    assert any("Media Group" in line for line in summary["draft"]), summary
    assert any("Описание:" in line for line in summary["draft"]), summary
    assert any(media_group_desc in line for line in summary["draft"]), summary
    assert summary["lines"], summary

    rendered = advisor_snapshot.format_snapshot_summary(snap)
    assert "# Snapshot — me / Gen 2 / early" in rendered, rendered
    assert "Best move:" in rendered, rendered
    assert "Draft:" in rendered and "Media Group" in rendered, rendered
    assert "Описание:" in rendered, rendered
    assert media_group_desc in rendered, rendered
    assert "Hand:" in rendered and "Sponsors" in rendered, rendered
    assert sponsors_desc in rendered, rendered
    assert "Alerts:" in rendered and "Development Center: 1 energy → draw 1 card" in rendered, rendered

    decision_context = watch_live_game.build_decision_context(snap)
    assert decision_context["best_move"] == summary["best_move"], decision_context
    assert decision_context["summary_lines"], decision_context
    assert_watch_fetch_json_retries_transient_errors()
    assert_watch_monitor_survives_poll_errors()
    assert_watch_advisor_miss_uses_play_advice()
    assert_postgame_summary_aggregates_restarted_logs()

    action_prompt_snap = advisor_snapshot.snapshot_from_raw(build_action_card_prompt_raw_state())
    assert "current_draft" not in action_prompt_snap, action_prompt_snap.get("current_draft")
    assert not action_prompt_snap["summary"]["best_move"].startswith("Draft:"), action_prompt_snap["summary"]

    calculated_cost_snap = advisor_snapshot.snapshot_from_raw(build_server_calculated_cost_raw_state())
    calculated_cost_advice = {row["name"]: row for row in calculated_cost_snap["hand_advice"]}
    assert calculated_cost_advice["Topsoil Contract"]["action"] == "HOLD", calculated_cost_advice
    assert "2 MC eff > 1" in calculated_cost_advice["Topsoil Contract"]["reason"], calculated_cost_advice

    closed_req_snap = advisor_snapshot.snapshot_from_raw(build_closed_max_req_draft_raw_state())
    closed_req_advice = {row["name"]: row for row in closed_req_snap["draft_advice"]["card_advice"]}
    assert closed_req_advice["Colonizer Training Camp"]["action"] == "SKIP", closed_req_advice
    assert "окно закрыто" in closed_req_advice["Colonizer Training Camp"]["reason"], closed_req_advice

    psychrophiles_snap = advisor_snapshot.snapshot_from_raw(build_psychrophiles_payment_raw_state())
    psychrophiles_advice = {row["name"]: row for row in psychrophiles_snap["hand_advice"]}
    kelp_advice = psychrophiles_advice["Kelp Farming"]
    assert "нет MC" not in kelp_advice["reason"], kelp_advice
    assert "Psychrophiles microbes=8 MC" in kelp_advice["reason"], kelp_advice

    milestone_snap = advisor_snapshot.snapshot_from_raw(build_raw_state_with_claimable_milestone())
    milestone_summary = milestone_snap["summary"]
    assert milestone_summary["best_move"].startswith("🏆 ЗАЯВИ Builder!"), milestone_summary
    assert any("Sponsors" in line for line in milestone_summary["hand"]), milestone_summary

    award_snap = advisor_snapshot.snapshot_from_raw(build_raw_state_with_fundable_award())
    award_summary = award_snap["summary"]
    assert award_snap["allocation"]["allocations"][0]["type"] == "award", award_snap["allocation"]
    assert award_summary["best_move"].startswith("💰 ФОНДИРУЙ Banker!"), award_summary
    rendered_award = advisor_snapshot.format_snapshot_summary(award_snap)
    assert "Best move: 💰 ФОНДИРУЙ Banker!" in rendered_award, rendered_award

    endgame_alert_snap = advisor_snapshot.snapshot_from_raw(build_raw_state_with_endgame_action_alerts())
    action_alert = next(alert for alert in endgame_alert_snap["alerts"] if "🔵 Actions" in alert)
    assert "Development Center: 1 energy → draw 1 card" not in action_alert, action_alert
    assert "Restricted Area: 2 MC → draw 1 card" not in action_alert, action_alert
    assert "Birds: add 1 animal to this card" in action_alert, action_alert
    assert "Viron: reuse action card" in action_alert, action_alert
    assert "Local Shading: add 1 floater to this card" in action_alert, action_alert
    assert not any("🏛️ Dominant: Scientists" in alert for alert in endgame_alert_snap["alerts"]), endgame_alert_snap["alerts"]
    assert not any("станут ruling" in alert for alert in endgame_alert_snap["alerts"]), endgame_alert_snap["alerts"]

    completed_raw = copy.deepcopy(build_raw_state_with_endgame_action_alerts())
    completed_raw["game"]["phase"] = "end"
    completed_snap = advisor_snapshot.snapshot_from_raw(completed_raw)
    assert completed_snap["game"]["live_phase"] == "end", completed_snap["game"]
    assert completed_snap["hand_advice"] == [], completed_snap["hand_advice"]
    assert "allocation" not in completed_snap, completed_snap.get("allocation")
    assert completed_snap["alerts"] == [], completed_snap["alerts"]
    assert not completed_snap["summary"].get("best_move"), completed_snap["summary"]
    assert "Best move:" not in advisor_snapshot.format_snapshot_summary(completed_snap)

    print("advisor snapshot output regression checks: OK")


if __name__ == "__main__":
    main()
