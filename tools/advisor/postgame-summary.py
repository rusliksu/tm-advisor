#!/usr/bin/env python3
"""Summarize a finished live game from TM APIs and local watch JSONL logs."""

from __future__ import annotations

import argparse
import json
import statistics
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LOG_DIR = ROOT / "data" / "game_logs"
DEFAULT_BASE_URL = "https://tm.knightbyte.win"
OFFTOP_RANK = 8


def fetch_json(url: str):
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.load(response)


def fetch_player_view(base_url: str, player_id: str) -> dict:
    raw = fetch_json(f"{base_url.rstrip('/')}/api/player?id={player_id}")
    return raw.get("playerView", raw)


def find_latest_log(game_id: str) -> Path | None:
    matches = sorted(LOG_DIR.glob(f"watch_live_{game_id}_*.jsonl"))
    return matches[-1] if matches else None


def corp_name_from_tableau(tableau: list[dict]) -> str:
    if not tableau:
        return "unknown"
    first = tableau[0]
    if isinstance(first, dict) and first.get("name"):
        return first["name"]
    return "unknown"


def parse_log(log_path: Path | None) -> dict:
    result = {
        "session_start": None,
        "initial_snapshots": {},
        "card_played": defaultdict(list),
        "advisor_miss": defaultdict(list),
        "game_states": [],
    }
    if log_path is None or not log_path.exists():
        return result

    with log_path.open(encoding="utf-8") as fh:
        for line in fh:
            event = json.loads(line)
            etype = event.get("type")
            if etype == "session_start":
                result["session_start"] = event
            elif etype == "initial_snapshot":
                result["initial_snapshots"][event["player_id"]] = event
            elif etype == "card_played":
                result["card_played"][event["player_id"]].append(event)
            elif etype == "advisor_miss":
                result["advisor_miss"][event["player_id"]].append(event)
            elif etype == "game_state":
                result["game_states"].append(event)
    return result


def summarize_offtop(events: list[dict]) -> dict:
    ranked = [e for e in events if isinstance(e.get("prev_hand_rank"), int)]
    off_top = [e for e in ranked if e["prev_hand_rank"] >= OFFTOP_RANK]
    avg_rank = round(statistics.mean(e["prev_hand_rank"] for e in ranked), 1) if ranked else None
    return {
        "plays_logged": len(events),
        "ranked_plays": len(ranked),
        "avg_rank": avg_rank,
        "off_top_count": len(off_top),
        "top_off_top": sorted(
            (
                {
                    "card": e.get("card") or e.get("last_card_played"),
                    "rank": e.get("prev_hand_rank"),
                    "score": e.get("prev_hand_score"),
                }
                for e in off_top
            ),
            key=lambda row: (-row["rank"], -(row["score"] or 0), row["card"] or ""),
        )[:5],
    }


def summarize_misses(events: list[dict]) -> dict:
    by_severity = Counter(e.get("severity", "unknown") for e in events)
    top = sorted(
        (
            {
                "card": e.get("card"),
                "chosen_rank": e.get("chosen_rank"),
                "score_gap": e.get("score_gap"),
                "best_card": e.get("best_card"),
                "severity": e.get("severity"),
            }
            for e in events
        ),
        key=lambda row: (-(row["score_gap"] or 0), -(row["chosen_rank"] or 0), row["card"] or ""),
    )[:5]
    return {
        "count": len(events),
        "by_severity": dict(sorted(by_severity.items())),
        "top": top,
    }


def summarize_player(player_view: dict, log_data: dict) -> dict:
    me = player_view["thisPlayer"]
    vp = me.get("victoryPointsBreakdown", {})
    details_cards = sorted(
        (
            {
                "card": row.get("cardName"),
                "vp": row.get("victoryPoint", 0),
            }
            for row in vp.get("detailsCards", [])
        ),
        key=lambda row: (-abs(row["vp"]), row["card"] or ""),
    )
    gp_steps = me.get("globalParameterSteps", {}) or {}
    player_id = me["id"]
    initial = log_data["initial_snapshots"].get(player_id, {})
    off_top = summarize_offtop(log_data["card_played"].get(player_id, []))
    misses = summarize_misses(log_data["advisor_miss"].get(player_id, []))

    return {
        "id": player_id,
        "name": me.get("name") or player_id,
        "corp": corp_name_from_tableau(me.get("tableau") or []),
        "tr": me.get("terraformRating", 0),
        "mc_prod": me.get("megacreditProduction", 0),
        "cards_in_hand": me.get("cardsInHandNbr", 0),
        "tableau_count": len(me.get("tableau") or []),
        "vp": {
            "total": vp.get("total", 0),
            "tr": vp.get("terraformRating", 0),
            "milestones": vp.get("milestones", 0),
            "awards": vp.get("awards", 0),
            "greenery": vp.get("greenery", 0),
            "city": vp.get("city", 0),
            "cards": vp.get("victoryPoints", 0),
            "negative": vp.get("negativeVP", 0),
        },
        "global_steps": gp_steps,
        "global_steps_total": sum(v for v in gp_steps.values() if isinstance(v, int)),
        "top_vp_cards": [row for row in details_cards if row["vp"] > 0][:5],
        "negative_vp_cards": [row for row in details_cards if row["vp"] < 0],
        "initial_alerts": initial.get("alerts", []),
        "initial_top_hand": initial.get("top_hand", []),
        "off_top": off_top,
        "advisor_miss": misses,
    }


def pick_relevant_alert(alerts: list[str]) -> str | None:
    if not alerts:
        return None
    preferred_markers = ("🎯", "ЗАКРЫВАЙ ИГРУ", "VP", "карт в руке", "толстый VP shell")
    for marker in preferred_markers:
        for alert in alerts:
            if marker in alert:
                return alert
    return alerts[0]


def build_takeaways(players: list[dict]) -> list[str]:
    if not players:
        return []
    winner = players[0]
    runner_up = players[1] if len(players) > 1 else None
    takeaways: list[str] = []

    if runner_up is not None:
        margin = winner["vp"]["total"] - runner_up["vp"]["total"]
        takeaways.append(
            f"Победитель {winner['name']} ({winner['corp']}) взял {winner['vp']['total']} VP и выиграл {margin:+d}."
        )

    if winner["vp"]["cards"] >= 30:
        takeaways.append(
            f"Главный источник победы у лидера был на столе: {winner['vp']['cards']} VP картами."
        )

    winner_name = winner["name"]
    old_alerts = []
    for player in players[1:]:
        for alert in player["initial_alerts"]:
            if winner_name in alert and "карт в руке" in alert:
                old_alerts.append(alert)
    if old_alerts and winner["vp"]["cards"] >= 30:
        takeaways.append(
            "В live-alerts фокус был на размере руки лидера, а не на уже собранном VP shell на столе."
        )
        takeaways.append(
            "Правка по итогам игры: усиливать opponent visible-VP alerts в late game, а не спешить с base-score rewrite."
        )

    if winner["off_top"]["off_top_count"] >= 4:
        takeaways.append(
            "У победителя было много off-top plays против advisor; по одной игре это слабый сигнал для base-score rewrite."
        )
        takeaways.append(
            "Следующий источник данных для калибровки: копить advisor_miss и off-top summaries по нескольким играм, а не по одной."
        )

    overengine = [
        p for p in players[1:]
        if p["mc_prod"] >= 25 and p["vp"]["total"] <= winner["vp"]["total"] - 20
    ]
    for player in overengine[:2]:
        takeaways.append(
            f"{player['name']} похоже переинвестировал в engine: MC-prod {player['mc_prod']}, итог {player['vp']['total']} VP."
        )

    return takeaways


def build_summary(game_id: str, base_url: str, log_path: Path | None) -> dict:
    game_meta = fetch_json(f"{base_url.rstrip('/')}/api/game?id={game_id}")
    players_min = game_meta.get("players", [])
    log_data = parse_log(log_path)
    player_views = [fetch_player_view(base_url, row["id"]) for row in players_min]
    players = [summarize_player(view, log_data) for view in player_views]
    players.sort(key=lambda row: (-row["vp"]["total"], row["name"]))

    return {
        "game": {
            "id": game_id,
            "phase": game_meta.get("phase"),
            "active_player": game_meta.get("activePlayer"),
            "spectator_id": game_meta.get("spectatorId"),
            "log_path": str(log_path) if log_path else None,
            "players_count": len(players),
            "options": game_meta.get("gameOptions", {}),
        },
        "players": players,
        "takeaways": build_takeaways(players),
    }


def format_cards(rows: list[dict], limit: int = 3) -> str:
    if not rows:
        return "-"
    return ", ".join(f"{row['card']} {row['vp']}" for row in rows[:limit])


def format_offtop(rows: list[dict], limit: int = 3) -> str:
    if not rows:
        return "-"
    return ", ".join(
        f"{row['card']} r{row['rank']} s{row['score']}"
        for row in rows[:limit]
    )


def print_text(summary: dict) -> None:
    game = summary["game"]
    players = summary["players"]
    winner = players[0] if players else None
    runner_up = players[1] if len(players) > 1 else None
    margin = winner["vp"]["total"] - runner_up["vp"]["total"] if winner and runner_up else 0

    print(f"Game {game['id']} | phase={game['phase']} | log={game['log_path'] or '-'}")
    if winner and runner_up:
        print(f"Winner: {winner['name']} / {winner['corp']} with {winner['vp']['total']} VP ({margin:+d} vs {runner_up['name']})")
    print()

    for player in players:
        vp = player["vp"]
        print(
            f"{player['name']} / {player['corp']}: {vp['total']} VP = "
            f"TR {vp['tr']} + milestones {vp['milestones']} + awards {vp['awards']} + "
            f"greenery {vp['greenery']} + city {vp['city']} + cards {vp['cards']}"
        )
        print(
            f"  Tempo: steps {player['global_steps_total']} ({player['global_steps']}) | "
            f"MC-prod {player['mc_prod']} | hand {player['cards_in_hand']} | tableau {player['tableau_count']}"
        )
        print(f"  Top VP cards: {format_cards(player['top_vp_cards'])}")
        if player["negative_vp_cards"]:
            print(f"  Negative VP: {format_cards(player['negative_vp_cards'])}")
        print(
            f"  Advisor log: plays {player['off_top']['plays_logged']}, "
            f"avg prior rank {player['off_top']['avg_rank']}, "
            f"off-top {player['off_top']['off_top_count']}, "
            f"advisor_miss {player['advisor_miss']['count']}"
        )
        if player["off_top"]["top_off_top"]:
            print(f"  Biggest off-top: {format_offtop(player['off_top']['top_off_top'])}")
        if player["advisor_miss"]["top"]:
            top = player["advisor_miss"]["top"][0]
            print(
                "  Biggest advisor miss: "
                f"{top['card']} vs {top['best_card']} "
                f"(rank {top['chosen_rank']}, gap {top['score_gap']}, {top['severity']})"
            )
        alert = pick_relevant_alert(player["initial_alerts"])
        if alert:
            print(f"  Initial alerts sample: {alert}")
        print()

    if summary["takeaways"]:
        print("Takeaways:")
        for item in summary["takeaways"]:
            print(f"- {item}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("game_id", help="TM game id, e.g. g593456f379dd")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--log-path", type=Path, default=None)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    log_path = args.log_path or find_latest_log(args.game_id)
    summary = build_summary(args.game_id, args.base_url, log_path)
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return
    print_text(summary)


if __name__ == "__main__":
    main()
