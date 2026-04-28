#!/usr/bin/env python3
"""Summarize a finished live game from TM APIs and local watch JSONL logs."""

from __future__ import annotations

import argparse
import json
import re
import statistics
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LOG_DIR = ROOT / "data" / "game_logs"
DEFAULT_BASE_URL = "https://tm.knightbyte.win"
OFFTOP_RANK = 8
AUTO_WATCH_LOG_RE = re.compile(r"^watch_(?P<game>g[^_]+)_(?P<player>.+)_\d{8}_\d{6}\.jsonl$")


def fetch_json(url: str):
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.load(response)


def fetch_player_view(base_url: str, player_id: str) -> dict:
    raw = fetch_json(f"{base_url.rstrip('/')}/api/player?id={player_id}")
    return raw.get("playerView", raw)


def find_game_logs(game_id: str) -> list[Path]:
    """Return all watch logs for a game.

    A live watcher can be restarted near game end, producing a tiny end-only log.
    Postgame summaries should aggregate the whole run instead of picking that
    last file and losing all card/advisor events.
    """
    matches = list(LOG_DIR.glob(f"watch_live_{game_id}_*.jsonl"))
    matches.extend((LOG_DIR / "auto_watch").glob(f"watch_{game_id}_*.jsonl"))
    return sorted(matches)


def find_latest_log(game_id: str) -> Path | None:
    matches = find_game_logs(game_id)
    return matches[-1] if matches else None


def corp_name_from_tableau(tableau: list[dict]) -> str:
    if not tableau:
        return "unknown"
    first = tableau[0]
    if isinstance(first, dict) and first.get("name"):
        return first["name"]
    return "unknown"


def _event_key(event: dict) -> tuple | None:
    etype = event.get("type")
    if etype == "card_played":
        return (
            etype,
            event.get("player_id"),
            event.get("card"),
            event.get("last_card_played"),
            event.get("prev_hand_rank"),
            event.get("prev_hand_score"),
        )
    if etype == "advisor_miss":
        return (
            etype,
            event.get("player_id"),
            event.get("card"),
            event.get("best_card"),
            event.get("chosen_rank"),
            event.get("score_gap"),
            event.get("score_kind"),
        )
    if etype == "advisor_check":
        return (
            etype,
            event.get("game_id"),
            event.get("ts"),
            event.get("reason"),
        )
    return None


def _auto_watch_player(log_path: Path | None) -> str | None:
    if not log_path:
        return None
    match = AUTO_WATCH_LOG_RE.match(log_path.name)
    return match.group("player") if match else None


def _normalize_log_event(event: dict, log_path: Path | None) -> dict:
    if event.get("type") or not event.get("ev"):
        return event
    normalized = dict(event)
    normalized["type"] = normalized.get("ev")
    player = _auto_watch_player(log_path)
    if player:
        normalized.setdefault("player", player)
        normalized.setdefault("player_id", f"auto_watch:{player}")
    return normalized


def _events_for_player(log_data: dict, bucket: str, player_id: str, player_name: str) -> list[dict]:
    direct = log_data[bucket].get(player_id, [])
    if direct:
        return direct
    return log_data[bucket].get(f"auto_watch:{player_name}", [])


def parse_log(log_paths: Path | list[Path] | None) -> dict:
    result = {
        "session_start": None,
        "initial_snapshots": {},
        "card_played": defaultdict(list),
        "advisor_miss": defaultdict(list),
        "advisor_check": defaultdict(list),
        "game_states": [],
        "log_paths": [],
    }
    if log_paths is None:
        return result

    if isinstance(log_paths, Path):
        paths = [log_paths]
    else:
        paths = list(log_paths)

    seen_events: set[tuple] = set()
    for log_path in paths:
        if log_path is None or not log_path.exists():
            continue
        result["log_paths"].append(str(log_path))
        with log_path.open(encoding="utf-8") as fh:
            for line in fh:
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                event = _normalize_log_event(event, log_path)
                key = _event_key(event)
                if key is not None:
                    if key in seen_events:
                        continue
                    seen_events.add(key)
                etype = event.get("type")
                if etype == "session_start" and result["session_start"] is None:
                    result["session_start"] = event
                elif etype == "initial_snapshot":
                    result["initial_snapshots"].setdefault(event["player_id"], event)
                elif etype == "card_played":
                    result["card_played"][event["player_id"]].append(event)
                elif etype == "advisor_miss":
                    result["advisor_miss"][event["player_id"]].append(event)
                elif etype == "advisor_check":
                    for player_row in event.get("players", []) or []:
                        player_id = player_row.get("player_id")
                        if not player_id:
                            continue
                        result["advisor_check"][player_id].append({
                            "ts": event.get("ts"),
                            "reason": event.get("reason"),
                            "phase": event.get("phase"),
                            "active_player": event.get("active_player"),
                            **player_row,
                        })
                elif etype == "game_state":
                    result["game_states"].append(event)
    return result


def summarize_offtop(events: list[dict]) -> dict:
    ranked = []
    stale_filtered = []
    for event in events:
        if not _best_move_is_card_play(event):
            stale_filtered.append(event)
            continue
        if isinstance(event.get("prev_play_rank"), int):
            ranked.append({
                "event": event,
                "rank": event["prev_play_rank"],
                "score": event.get("prev_play_score"),
                "source": "play",
            })
            continue
        if isinstance(event.get("prev_hand_rank"), int):
            ranked.append({
                "event": event,
                "rank": event["prev_hand_rank"],
                "score": event.get("prev_hand_score"),
                "source": "legacy_hand",
            })

    off_top = [row for row in ranked if row["rank"] >= OFFTOP_RANK]
    avg_rank = round(statistics.mean(row["rank"] for row in ranked), 1) if ranked else None
    source_counts = Counter(row["source"] for row in ranked)
    return {
        "plays_logged": len(events),
        "ranked_plays": len(ranked),
        "avg_rank": avg_rank,
        "off_top_count": len(off_top),
        "rank_source_counts": dict(sorted(source_counts.items())),
        "stale_filtered_count": len(stale_filtered),
        "top_off_top": sorted(
            (
                {
                    "card": row["event"].get("card") or row["event"].get("last_card_played"),
                    "rank": row["rank"],
                    "score": row["score"],
                    "source": row["source"],
                }
                for row in off_top
            ),
            key=lambda row: (-row["rank"], -(row["score"] or 0), row["card"] or ""),
        )[:5],
    }


def _miss_play_key(event: dict) -> tuple:
    return (event.get("player_id"), event.get("card"), event.get("ts"))


def _best_option_action(miss: dict, played_event: dict | None) -> str | None:
    if not played_event:
        return None
    top_options = (
        played_event.get("decision_context", {}).get("top_options")
        if isinstance(played_event.get("decision_context"), dict)
        else None
    ) or []
    for option in top_options:
        if option.get("name") == miss.get("best_card"):
            return option.get("action")
    return None


def _best_move_is_card_play(played_event: dict | None) -> bool:
    if not played_event:
        return True
    decision_context = played_event.get("decision_context")
    if not isinstance(decision_context, dict):
        return True
    best_move = decision_context.get("best_move") or ""
    return not best_move or str(best_move).startswith("PLAY ")


def _best_move_play_card(played_event: dict | None) -> str | None:
    if not played_event:
        return None
    decision_context = played_event.get("decision_context")
    if not isinstance(decision_context, dict):
        return None
    best_move = str(decision_context.get("best_move") or "").strip()
    if not best_move.startswith("PLAY "):
        return None
    remainder = best_move.removeprefix("PLAY ").strip()
    if not remainder:
        return None
    for separator in (" — ", " | ", " - "):
        if separator in remainder:
            return remainder.split(separator, 1)[0].strip() or None
    return remainder


def filter_stale_advisor_misses(
    events: list[dict],
    played_events: list[dict] | None = None,
) -> tuple[list[dict], list[dict]]:
    """Drop legacy miss events where the logged best option was not playable.

    Older live-watch logs ranked raw hand scores and could emit advisor_miss
    against HOLD cards. New watcher logs include score_kind=play_value_now, so
    this compatibility filter only applies to legacy events missing score_kind.
    """
    played_by_key = {
        _miss_play_key(event): event
        for event in (played_events or [])
        if event.get("type") == "card_played"
    }
    kept = []
    stale = []
    for event in events:
        if event.get("score_kind"):
            kept.append(event)
            continue
        played_event = played_by_key.get(_miss_play_key(event))
        if not _best_move_is_card_play(played_event):
            stale.append(event)
            continue
        best_move_card = _best_move_play_card(played_event)
        if best_move_card and event.get("best_card") and event.get("best_card") != best_move_card:
            stale.append(event)
            continue
        action = _best_option_action(event, played_event)
        if action and action != "PLAY":
            stale.append(event)
            continue
        kept.append(event)
    return kept, stale


def summarize_misses(events: list[dict], played_events: list[dict] | None = None) -> dict:
    filtered_events, stale_events = filter_stale_advisor_misses(events, played_events)
    by_severity = Counter(e.get("severity", "unknown") for e in filtered_events)
    top = sorted(
        (
            {
                "card": e.get("card"),
                "chosen_rank": e.get("chosen_rank"),
                "score_gap": e.get("score_gap"),
                "best_card": e.get("best_card"),
                "severity": e.get("severity"),
            }
            for e in filtered_events
        ),
        key=lambda row: (-(row["score_gap"] or 0), -(row["chosen_rank"] or 0), row["card"] or ""),
    )[:5]
    return {
        "count": len(filtered_events),
        "raw_count": len(events),
        "stale_filtered_count": len(stale_events),
        "by_severity": dict(sorted(by_severity.items())),
        "top": top,
    }


def summarize_unconverted_play_recommendations(
    checks: list[dict],
    played_events: list[dict],
    min_count: int = 2,
    min_score: float = 12.0,
) -> list[dict]:
    played_names = {
        event.get("card") or event.get("last_card_played")
        for event in played_events
    }
    played_names.discard(None)

    by_card: dict[str, dict] = {}
    for check in checks:
        for row in check.get("top_play") or []:
            if row.get("action") and row.get("action") != "PLAY":
                continue
            name = row.get("name")
            if not name or name in played_names:
                continue
            score = row.get("play_value_now", row.get("score"))
            if not isinstance(score, (int, float)) or score < min_score:
                continue
            bucket = by_card.setdefault(name, {
                "card": name,
                "count": 0,
                "first_ts": check.get("ts"),
                "last_ts": check.get("ts"),
                "max_score": score,
                "last_reason": row.get("reason"),
            })
            bucket["count"] += 1
            bucket["last_ts"] = check.get("ts")
            bucket["max_score"] = max(bucket["max_score"], score)
            bucket["last_reason"] = row.get("reason") or bucket.get("last_reason")

    return sorted(
        (row for row in by_card.values() if row["count"] >= min_count),
        key=lambda row: (-row["count"], -row["max_score"], row["card"]),
    )[:5]


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
    player_name = me.get("name") or player_id
    initial = log_data["initial_snapshots"].get(player_id, {})
    played_events = _events_for_player(log_data, "card_played", player_id, player_name)
    off_top = summarize_offtop(played_events)
    misses = summarize_misses(_events_for_player(log_data, "advisor_miss", player_id, player_name), played_events)
    unconverted = summarize_unconverted_play_recommendations(
        log_data["advisor_check"].get(player_id, []),
        played_events,
    )

    return {
        "id": player_id,
        "name": player_name,
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
        "unconverted_play_recommendations": unconverted,
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


def build_summary(game_id: str, base_url: str, log_paths: Path | list[Path] | None) -> dict:
    game_meta = fetch_json(f"{base_url.rstrip('/')}/api/game?id={game_id}")
    players_min = game_meta.get("players", [])
    log_data = parse_log(log_paths)
    player_views = [fetch_player_view(base_url, row["id"]) for row in players_min]
    players = [summarize_player(view, log_data) for view in player_views]
    players.sort(key=lambda row: (-row["vp"]["total"], row["name"]))
    parsed_log_paths = log_data.get("log_paths", [])

    return {
        "game": {
            "id": game_id,
            "phase": game_meta.get("phase"),
            "active_player": game_meta.get("activePlayer"),
            "spectator_id": game_meta.get("spectatorId"),
            "log_path": parsed_log_paths[-1] if parsed_log_paths else None,
            "log_paths": parsed_log_paths,
            "advisor_log_available": bool(parsed_log_paths),
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
    parts = []
    for row in rows[:limit]:
        source = row.get("source")
        source_part = f" {source}" if source and source != "play" else ""
        parts.append(f"{row['card']} r{row['rank']} s{row['score']}{source_part}")
    return ", ".join(parts)


def format_unconverted(rows: list[dict], limit: int = 3) -> str:
    if not rows:
        return "-"
    parts = []
    for row in rows[:limit]:
        parts.append(
            f"{row['card']} x{row['count']} max {round(row['max_score'], 1)}"
        )
    return ", ".join(parts)


def print_text(summary: dict) -> None:
    game = summary["game"]
    players = summary["players"]
    winner = players[0] if players else None
    runner_up = players[1] if len(players) > 1 else None
    margin = winner["vp"]["total"] - runner_up["vp"]["total"] if winner and runner_up else 0

    log_paths = game.get("log_paths") or []
    log_text = f"{len(log_paths)} logs, latest={game['log_path']}" if log_paths else "-"
    print(f"Game {game['id']} | phase={game['phase']} | log={log_text}")
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
        stale_misses = player["advisor_miss"].get("stale_filtered_count", 0)
        stale_text = f" (filtered stale {stale_misses})" if stale_misses else ""
        stale_offtop = player["off_top"].get("stale_filtered_count", 0)
        source_counts = player["off_top"].get("rank_source_counts") or {}
        legacy_count = source_counts.get("legacy_hand", 0)
        detail_parts = []
        if legacy_count:
            detail_parts.append(f"legacy {legacy_count}")
        if stale_offtop:
            detail_parts.append(f"filtered stale {stale_offtop}")
        stale_offtop_text = f" ({'; '.join(detail_parts)})" if detail_parts else ""
        avg_rank = player["off_top"]["avg_rank"]
        avg_rank_text = avg_rank if avg_rank is not None else "-"
        if not game.get("advisor_log_available"):
            print("  Advisor log: unavailable (no watch log found)")
        else:
            print(
                f"  Advisor log: plays {player['off_top']['plays_logged']}, "
                f"avg prior rank {avg_rank_text}, "
                f"off-top {player['off_top']['off_top_count']}{stale_offtop_text}, "
                f"advisor_miss {player['advisor_miss']['count']}{stale_text}"
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
            if player.get("unconverted_play_recommendations"):
                print(
                    "  Unconverted advisor plays: "
                    f"{format_unconverted(player['unconverted_play_recommendations'])}"
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

    log_paths = [args.log_path] if args.log_path else find_game_logs(args.game_id)
    summary = build_summary(args.game_id, args.base_url, log_paths)
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return
    print_text(summary)


if __name__ == "__main__":
    main()
