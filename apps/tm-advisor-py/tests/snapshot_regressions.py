"""Regression checks for advisor snapshot ranking fields."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
ENTRYPOINT_DIR = ROOT / "apps" / "tm-advisor-py" / "entrypoints"
if str(ENTRYPOINT_DIR) not in sys.path:
    sys.path.insert(0, str(ENTRYPOINT_DIR))


def load_snapshot_module():
    entrypoint = ENTRYPOINT_DIR / "advisor_snapshot.py"
    spec = importlib.util.spec_from_file_location("advisor_snapshot_test", entrypoint)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def main() -> None:
    snapshot = load_snapshot_module()
    hand = [
        {"name": "Symbiotic Fungus", "effective_score": 69},
        {"name": "Aquifer Pumping", "effective_score": 39},
    ]
    play_advice = [
        {
            "name": "Symbiotic Fungus",
            "action": "PLAY",
            "reason": "endgame low immediate value — after VP/TR plays",
            "play_value_now": 0.8,
            "priority": 7,
        },
        {
            "name": "Aquifer Pumping",
            "action": "PLAY",
            "reason": "endgame VP push",
            "play_value_now": 20.4,
            "priority": 3,
        },
    ]

    enriched = snapshot._merge_play_advice(hand, play_advice)
    assert [card["name"] for card in enriched] == ["Aquifer Pumping", "Symbiotic Fungus"], enriched
    assert enriched[0]["advisor_score"] > enriched[1]["advisor_score"], enriched
    assert enriched[1]["play_value_now"] == 0.8, enriched[1]
    assert "low immediate value" in enriched[1]["play_reason"], enriched[1]

    fallback = snapshot._merge_play_advice([
        {"name": "A", "effective_score": 50},
        {"name": "B", "effective_score": 70},
    ], [])
    assert [card["name"] for card in fallback] == ["B", "A"], fallback

    class FakeDb:
        def get_info(self, name):
            return {"cost": 4} if name == "Harvest" else {}

    assert snapshot._is_action_phase("action")
    assert not snapshot._is_action_phase("drafting")
    assert snapshot._should_emit_action_advice("action")
    assert not snapshot._should_emit_action_advice("research")
    assert not snapshot._should_emit_action_advice("drafting")
    assert not snapshot._should_emit_action_advice("end")
    assert snapshot._snapshot_card_cost(
        {"cost": 0}, FakeDb(), "Harvest", action_phase=False) == 4
    assert snapshot._snapshot_card_cost(
        {"cost": 0}, FakeDb(), "Harvest", action_phase=True) == 0
    assert snapshot._snapshot_trade_payload({"trades": [], "best_hint": "Флот занят (1/1 trades)"}) is None
    assert snapshot._snapshot_trade_payload({"trades": [], "best_hint": "Нет ресурсов для торговли"}) is None
    assert snapshot._snapshot_trade_payload({"trades": [], "best_hint": "Trade невыгоден в этом gen"}) is None
    assert snapshot._snapshot_trade_payload({
        "trades": [],
        "best_hint": "Сначала Callisto: +3 energy → trade сейчас",
    }) == {"best": None, "hint": "Сначала Callisto: +3 energy → trade сейчас"}
    assert snapshot._snapshot_trade_payload({
        "trades": [{"name": "Ceres", "net_profit": 2.0}],
        "best_hint": "Trade Ceres (+2.0 MC net, 4 Steel)",
    })["best"]["name"] == "Ceres"
    filtered_alerts = snapshot._filter_alerts_against_play_advice(
        [
            "📊 Miranda Resort: VP scaling — играй после Earth тегов",
            "⏳ Noctis City — обычно late city",
            "⚠️ Ecological Zone В РУКЕ gen 5! Ongoing эффект теряет value каждый gen. ИГРАЙ СЕЙЧАС или ПРОДАЙ",
            "🎯 Play Herbivores EARLY: trigger-карта, каждый ход оппонентов = бонус",
            "⚠️ GHG Producing Bacteria без Extreme-Cold Fungus = медленный action (2 хода на 1 TR/O₂). Рассмотри продажу.",
            "💰 Income: MC 0+TR 22",
        ],
        [
            {"name": "Miranda Resort", "action": "PLAY", "priority": 1},
            {"name": "GHG Producing Bacteria", "action": "PLAY", "priority": 3},
            {"name": "Noctis City", "action": "HOLD", "priority": 6},
            {"name": "Ecological Zone", "action": "HOLD", "priority": 6},
            {"name": "Herbivores", "action": "SELL", "priority": 9},
        ],
    )
    assert filtered_alerts == ["⏳ Noctis City — обычно late city", "💰 Income: MC 0+TR 22"], filtered_alerts

    class FakeClient:
        def get_player_state(self, _player_id):
            if _player_id == "p-research":
                return {
                    "thisPlayer": {
                        "color": "red",
                        "name": "me",
                        "megaCredits": 30,
                        "terraformRating": 25,
                        "cardsInHandNbr": 1,
                        "tableau": [{"name": "Cheung Shing MARS"}],
                        "tags": {},
                    },
                    "players": [
                        {"color": "red", "name": "me", "cardsInHandNbr": 1},
                        {"color": "blue", "name": "opp", "cardsInHandNbr": 4},
                    ],
                    "cardsInHand": [{"name": "Ecological Zone", "calculatedCost": 12}],
                    "waitingFor": {
                        "type": "card",
                        "cards": [
                            {"name": "Mining Rights", "cost": 9, "tags": ["Building"]},
                            {"name": "Aquifer Pumping", "cost": 18, "tags": ["Building"]},
                        ],
                    },
                    "game": {
                        "generation": 4,
                        "phase": "research",
                        "oxygenLevel": 3,
                        "temperature": -22,
                        "oceans": 3,
                        "venusScaleLevel": 4,
                        "milestones": [],
                        "awards": [],
                        "colonies": [{"name": "Callisto", "isActive": True, "trackPosition": 3, "colonies": []}],
                        "spaces": [],
                        "gameOptions": {"expansions": {"colonies": True}},
                    },
                }
            return {
                "thisPlayer": {
                    "color": "red",
                    "name": "me",
                    "megaCredits": 30,
                    "terraformRating": 42,
                    "cardsInHandNbr": 1,
                    "tableau": [{"name": "Cheung Shing MARS"}],
                    "tags": {},
                },
                "players": [
                    {"color": "red", "name": "me", "cardsInHandNbr": 1},
                    {"color": "blue", "name": "opp", "cardsInHandNbr": 4},
                ],
                "cardsInHand": [{"name": "Jovian Embassy", "calculatedCost": 14}],
                "game": {
                    "generation": 10,
                    "phase": "end",
                    "oxygenLevel": 14,
                    "temperature": 8,
                    "oceans": 9,
                    "venusScaleLevel": 30,
                    "milestones": [],
                    "awards": [],
                    "colonies": [{"name": "Callisto", "isActive": True, "trackPosition": 5, "colonies": []}],
                    "spaces": [],
                    "gameOptions": {"expansions": {"colonies": True}},
                },
            }

    original_client = snapshot.TMClient
    snapshot.TMClient = FakeClient
    try:
        terminal = snapshot.snapshot("p-end")
        research = snapshot.snapshot("p-research")
    finally:
        snapshot.TMClient = original_client

    assert terminal["game"]["live_phase"] == "end", terminal["game"]
    assert terminal["alerts"] == [], terminal["alerts"]
    assert terminal["opponent_intents"] == [], terminal["opponent_intents"]
    assert "play_advice" not in terminal, terminal.get("play_advice")
    assert "trade" not in terminal, terminal.get("trade")
    assert terminal["vp_estimates"], terminal
    assert research["game"]["live_phase"] == "research", research["game"]
    assert research["current_draft"], research
    assert research["alerts"] == [], research["alerts"]
    assert research["opponent_intents"] == [], research["opponent_intents"]
    assert "play_advice" not in research, research.get("play_advice")
    assert "trade" not in research, research.get("trade")
    assert "colony_advice" not in research, research.get("colony_advice")

    print("advisor snapshot regression checks: OK")


if __name__ == "__main__":
    main()
