#!/usr/bin/env python3
"""Parse a pasted TM game list, classify ids, and summarize recent ended games."""

from __future__ import annotations

import argparse
import concurrent.futures
import importlib.util
import json
import statistics
import re
import sys
import time
import urllib.request
from collections import Counter
from pathlib import Path


def load_build_summary():
    entrypoint = Path(__file__).resolve().parents[1] / "tools" / "advisor" / "postgame-summary.py"
    spec = importlib.util.spec_from_file_location("tm_postgame_summary_tool", entrypoint)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load postgame summary module: {entrypoint}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.build_summary


BUILD_SUMMARY = load_build_summary()


GAME_ID_RE = re.compile(r"game\?id=(g[a-f0-9]+)")


def fetch_json(url: str):
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.load(response)


def read_source_text(path: str | None) -> str:
    if path:
        return Path(path).read_text(encoding="utf-8")
    return sys.stdin.read()


def extract_game_ids(text: str) -> list[str]:
    return list(dict.fromkeys(GAME_ID_RE.findall(text)))


def classify_games(game_ids: list[str], base_url: str) -> list[dict]:
    rows = []
    for idx, game_id in enumerate(game_ids, start=1):
        try:
            data = fetch_json(f"{base_url.rstrip('/')}/api/game?id={game_id}")
            rows.append({
                "id": game_id,
                "phase": data.get("phase"),
                "players": len(data.get("players", [])),
            })
        except Exception as exc:
            rows.append({
                "id": game_id,
                "phase": "error",
                "error": str(exc),
            })
        if idx % 25 == 0:
            time.sleep(0.3)
    return rows


def write_active_ids(path: str, base_url: str, active_rows: list[dict]) -> None:
    lines = [
        "# Explicit TM game ids to watch",
        f"# Source: {base_url}",
        f"# Updated: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "",
    ]
    lines.extend(row["id"] for row in active_rows)
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")


def summarize_recent_ended(ended_rows: list[dict], base_url: str, limit: int) -> list[dict]:
    summaries = []
    for row in ended_rows[:limit]:
        try:
            summary = BUILD_SUMMARY(row["id"], base_url, log_path=None)
            players = summary["players"]
            winner = players[0] if players else None
            runner_up = players[1] if len(players) > 1 else None
            summaries.append({
                "id": row["id"],
                "winner": winner["name"] if winner else None,
                "corp": winner["corp"] if winner else None,
                "vp": winner["vp"]["total"] if winner else None,
                "margin": (winner["vp"]["total"] - runner_up["vp"]["total"]) if winner and runner_up else None,
                "players": len(players),
            })
        except Exception as exc:
            summaries.append({
                "id": row["id"],
                "error": str(exc),
            })
    return summaries


def summarize_single_ended(row: dict, base_url: str) -> dict:
    summary = BUILD_SUMMARY(row["id"], base_url, log_path=None)
    players = summary.get("players", [])
    winner = players[0] if players else None
    runner_up = players[1] if len(players) > 1 else None
    margin = (winner["vp"]["total"] - runner_up["vp"]["total"]) if winner and runner_up else 0
    vp = winner["vp"] if winner else {}
    board_vp = (vp.get("greenery", 0) + vp.get("city", 0)) if winner else None
    award_vp = (vp.get("awards", 0) + vp.get("milestones", 0)) if winner else None
    positive_sources = {
        "tr": vp.get("tr", 0) if winner else 0,
        "cards": vp.get("cards", 0) if winner else 0,
        "board": board_vp or 0,
        "awards": award_vp or 0,
    }
    primary_source = None
    if winner:
        best_value = max(positive_sources.values())
        leaders = sorted(name for name, value in positive_sources.items() if value == best_value)
        primary_source = leaders[0] if len(leaders) == 1 else "mixed"
    return {
        "id": row["id"],
        "players_count": len(players),
        "players": players,
        "winner": winner["name"] if winner else None,
        "corp": winner["corp"] if winner else None,
        "winner_vp": winner["vp"]["total"] if winner else None,
        "margin": margin,
        "winner_tr": winner["tr"] if winner else None,
        "winner_card_vp": winner["vp"]["cards"] if winner else None,
        "winner_mc_prod": winner["mc_prod"] if winner else None,
        "winner_board_vp": board_vp,
        "winner_award_vp": award_vp,
        "winner_primary_source": primary_source,
    }


def summarize_ended_full(
    ended_rows: list[dict],
    base_url: str,
    limit: int | None = None,
    workers: int = 6,
) -> dict:
    corp_wins = Counter()
    corp_appearances = Counter()
    player_wins = Counter()
    player_appearances = Counter()
    player_corp_wins = Counter()
    primary_sources = Counter()
    margins: list[int] = []
    winner_vps: list[int] = []
    winner_trs: list[int] = []
    winner_card_vps: list[int] = []
    winner_board_vps: list[int] = []
    winner_award_vps: list[int] = []
    winner_mc_prod: list[int] = []
    rows = []
    errors = []
    by_players_count: dict[int, dict] = {}

    targets = ended_rows if limit is None else ended_rows[:limit]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        future_map = {
            pool.submit(summarize_single_ended, row, base_url): row["id"]
            for row in targets
        }
        for idx, future in enumerate(concurrent.futures.as_completed(future_map), start=1):
            game_id = future_map[future]
            try:
                record = future.result()
                rows.append(record)

                for player in record["players"]:
                    corp_appearances[player["corp"]] += 1
                    player_appearances[player["name"]] += 1
                if record["winner"] is not None:
                    corp_wins[record["corp"]] += 1
                    player_wins[record["winner"]] += 1
                    player_corp_wins[f"{record['winner']} / {record['corp']}"] += 1
                    winner_vps.append(record["winner_vp"])
                    winner_trs.append(record["winner_tr"])
                    winner_card_vps.append(record["winner_card_vp"])
                    winner_board_vps.append(record["winner_board_vp"])
                    winner_award_vps.append(record["winner_award_vp"])
                    winner_mc_prod.append(record["winner_mc_prod"])
                    primary_sources[record["winner_primary_source"]] += 1
                margins.append(record["margin"])

                bucket = by_players_count.setdefault(record["players_count"], {
                    "corp_wins": Counter(),
                    "corp_appearances": Counter(),
                    "primary_sources": Counter(),
                    "margins": [],
                    "winner_vps": [],
                    "winner_trs": [],
                    "winner_card_vps": [],
                    "winner_board_vps": [],
                    "winner_award_vps": [],
                    "winner_mc_prod": [],
                })
                for player in record["players"]:
                    bucket["corp_appearances"][player["corp"]] += 1
                if record["winner"] is not None:
                    bucket["corp_wins"][record["corp"]] += 1
                    bucket["primary_sources"][record["winner_primary_source"]] += 1
                    bucket["winner_vps"].append(record["winner_vp"])
                    bucket["winner_trs"].append(record["winner_tr"])
                    bucket["winner_card_vps"].append(record["winner_card_vp"])
                    bucket["winner_board_vps"].append(record["winner_board_vp"])
                    bucket["winner_award_vps"].append(record["winner_award_vp"])
                    bucket["winner_mc_prod"].append(record["winner_mc_prod"])
                bucket["margins"].append(record["margin"])
            except Exception as exc:
                errors.append({
                    "id": game_id,
                    "error": str(exc),
                })
            if idx % 20 == 0:
                time.sleep(0.1)

    def corp_rows():
        result = []
        for corp, wins in corp_wins.most_common():
            appearances = corp_appearances.get(corp, wins)
            result.append({
                "corp": corp,
                "wins": wins,
                "appearances": appearances,
                "winrate": round(wins / appearances, 3) if appearances else None,
            })
        return result

    def corp_rows_from(corp_wins_counter: Counter, corp_appearances_counter: Counter):
        result = []
        for corp, wins in corp_wins_counter.most_common():
            appearances = corp_appearances_counter.get(corp, wins)
            result.append({
                "corp": corp,
                "wins": wins,
                "appearances": appearances,
                "winrate": round(wins / appearances, 3) if appearances else None,
            })
        return result

    def player_rows(counter: Counter):
        result = []
        for key, wins in counter.most_common():
            appearances = player_appearances.get(key.split(" / ")[0], wins)
            result.append({
                "name": key,
                "wins": wins,
                "appearances": appearances,
                "winrate": round(wins / appearances, 3) if appearances else None,
            })
        return result

    rows_by_margin_desc = sorted(rows, key=lambda item: (-item["margin"], -(item["winner_vp"] or 0), item["id"]))
    rows_by_margin_close = sorted(rows, key=lambda item: (abs(item["margin"]), -(item["winner_vp"] or 0), item["id"]))
    rows_by_vp = sorted(rows, key=lambda item: (-(item["winner_vp"] or 0), -item["margin"], item["id"]))

    player_count_splits = {}
    for players_count, bucket in sorted(by_players_count.items()):
        player_count_splits[str(players_count)] = {
            "games": len(bucket["margins"]),
            "average_margin": round(statistics.mean(bucket["margins"]), 2) if bucket["margins"] else None,
            "median_margin": statistics.median(bucket["margins"]) if bucket["margins"] else None,
            "average_winner_vp": round(statistics.mean(bucket["winner_vps"]), 2) if bucket["winner_vps"] else None,
            "average_winner_tr": round(statistics.mean(bucket["winner_trs"]), 2) if bucket["winner_trs"] else None,
            "average_winner_card_vp": round(statistics.mean(bucket["winner_card_vps"]), 2) if bucket["winner_card_vps"] else None,
            "average_winner_board_vp": round(statistics.mean(bucket["winner_board_vps"]), 2) if bucket["winner_board_vps"] else None,
            "average_winner_award_vp": round(statistics.mean(bucket["winner_award_vps"]), 2) if bucket["winner_award_vps"] else None,
            "average_winner_mc_prod": round(statistics.mean(bucket["winner_mc_prod"]), 2) if bucket["winner_mc_prod"] else None,
            "primary_sources": dict(bucket["primary_sources"].most_common()),
            "top_winner_corps": corp_rows_from(bucket["corp_wins"], bucket["corp_appearances"])[:10],
        }

    return {
        "games": len(rows),
        "errors": errors,
        "average_margin": round(statistics.mean(margins), 2) if margins else None,
        "median_margin": statistics.median(margins) if margins else None,
        "average_winner_vp": round(statistics.mean(winner_vps), 2) if winner_vps else None,
        "average_winner_tr": round(statistics.mean(winner_trs), 2) if winner_trs else None,
        "average_winner_card_vp": round(statistics.mean(winner_card_vps), 2) if winner_card_vps else None,
        "average_winner_board_vp": round(statistics.mean(winner_board_vps), 2) if winner_board_vps else None,
        "average_winner_award_vp": round(statistics.mean(winner_award_vps), 2) if winner_award_vps else None,
        "average_winner_mc_prod": round(statistics.mean(winner_mc_prod), 2) if winner_mc_prod else None,
        "primary_sources": dict(primary_sources.most_common()),
        "player_count_splits": player_count_splits,
        "top_winner_corps": corp_rows()[:12],
        "top_winners": player_rows(player_wins)[:12],
        "top_winner_players_by_corp": player_rows(player_corp_wins)[:12],
        "biggest_blowouts": rows_by_margin_desc[:10],
        "closest_games": rows_by_margin_close[:10],
        "highest_winning_vp": rows_by_vp[:10],
    }


def print_text(
    rows: list[dict],
    base_url: str,
    active_file: str | None,
    recent_ended: list[dict],
    ended_aggregate: dict | None,
) -> None:
    phase_counts = Counter(row["phase"] for row in rows)
    active = [row for row in rows if row["phase"] not in {"end", "error"}]
    ended = [row for row in rows if row["phase"] == "end"]
    errors = [row for row in rows if row["phase"] == "error"]

    print(f"Source: {base_url}")
    print(
        f"Games: total {len(rows)} | active {len(active)} | ended {len(ended)} | errors {len(errors)} | "
        f"phases {dict(phase_counts)}"
    )
    if active_file:
        print(f"Active ids file: {active_file}")
    print()

    print("Active games:")
    for row in active:
        print(f"- {row['id']} | phase={row['phase']} | players={row.get('players', '?')}")
    if not active:
        print("- none")
    print()

    print("Recent ended sample:")
    for row in recent_ended:
        if row.get("error"):
            print(f"- {row['id']} | error={row['error']}")
            continue
        print(
            f"- {row['id']} | winner {row['winner']} / {row['corp']} | "
            f"VP {row['vp']} | margin {row['margin']:+d} | players={row['players']}"
        )

    if not ended_aggregate:
        return

    print()
    print("Ended aggregate:")
    print(
        f"- analyzed {ended_aggregate['games']} ended games | avg winner VP {ended_aggregate['average_winner_vp']} | "
        f"avg margin {ended_aggregate['average_margin']} | median margin {ended_aggregate['median_margin']}"
    )
    print(
        f"- avg winner TR {ended_aggregate['average_winner_tr']} | "
        f"avg winner card VP {ended_aggregate['average_winner_card_vp']} | "
        f"avg winner board VP {ended_aggregate['average_winner_board_vp']} | "
        f"avg winner awards+milestones VP {ended_aggregate['average_winner_award_vp']} | "
        f"avg winner MC prod {ended_aggregate['average_winner_mc_prod']}"
    )
    if ended_aggregate["errors"]:
        print(f"- aggregate errors: {len(ended_aggregate['errors'])}")

    print(f"- primary winner sources: {ended_aggregate['primary_sources']}")

    print()
    print("Top winner corps:")
    for row in ended_aggregate["top_winner_corps"]:
        print(
            f"- {row['corp']}: wins {row['wins']} / appearances {row['appearances']} "
            f"({row['winrate']:.1%})"
        )

    print()
    print("Top winners:")
    for row in ended_aggregate["top_winners"]:
        print(
            f"- {row['name']}: wins {row['wins']} / appearances {row['appearances']} "
            f"({row['winrate']:.1%})"
        )

    print()
    print("Biggest blowouts:")
    for row in ended_aggregate["biggest_blowouts"][:5]:
        print(
            f"- {row['id']} | {row['winner']} / {row['corp']} | "
            f"VP {row['winner_vp']} | margin {row['margin']:+d}"
        )

    print()
    print("Closest games:")
    for row in ended_aggregate["closest_games"][:5]:
        print(
            f"- {row['id']} | {row['winner']} / {row['corp']} | "
            f"VP {row['winner_vp']} | margin {row['margin']:+d}"
        )

    print()
    print("By player count:")
    for players_count, split in ended_aggregate["player_count_splits"].items():
        print(
            f"- {players_count}p: games {split['games']} | avg VP {split['average_winner_vp']} | "
            f"avg margin {split['average_margin']} | avg TR {split['average_winner_tr']} | "
            f"cards {split['average_winner_card_vp']} | board {split['average_winner_board_vp']} | "
            f"awards {split['average_winner_award_vp']} | mc prod {split['average_winner_mc_prod']} | "
            f"primary {split['primary_sources']}"
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-file")
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--write-active-file")
    parser.add_argument("--summarize-ended-limit", type=int, default=8)
    parser.add_argument("--aggregate-ended", action="store_true")
    parser.add_argument("--aggregate-ended-limit", type=int, default=0)
    parser.add_argument("--aggregate-workers", type=int, default=6)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    text = read_source_text(args.source_file)
    game_ids = extract_game_ids(text)
    rows = classify_games(game_ids, args.base_url)
    active = [row for row in rows if row["phase"] not in {"end", "error"}]
    ended = [row for row in rows if row["phase"] == "end"]

    if args.write_active_file:
        write_active_ids(args.write_active_file, args.base_url, active)

    recent_ended = summarize_recent_ended(ended, args.base_url, args.summarize_ended_limit)
    ended_aggregate = None
    if args.aggregate_ended:
        agg_limit = args.aggregate_ended_limit if args.aggregate_ended_limit > 0 else None
        ended_aggregate = summarize_ended_full(ended, args.base_url, agg_limit, args.aggregate_workers)

    if args.json:
        print(json.dumps({
            "base_url": args.base_url,
            "rows": rows,
            "recent_ended": recent_ended,
            "ended_aggregate": ended_aggregate,
            "active_file": args.write_active_file,
        }, ensure_ascii=False, indent=2))
        return

    print_text(rows, args.base_url, args.write_active_file, recent_ended, ended_aggregate)


if __name__ == "__main__":
    main()
