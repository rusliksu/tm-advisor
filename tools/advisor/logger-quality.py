#!/usr/bin/env python3
"""Offline quality report for TM advisor watch logs."""

from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _load_postgame_summary():
    path = ROOT / "tools" / "advisor" / "postgame-summary.py"
    spec = importlib.util.spec_from_file_location("postgame_summary", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


POSTGAME = _load_postgame_summary()


def _player_name(player_id: str, log_data: dict) -> str:
    for bucket in ("card_played", "advisor_miss"):
        for event in log_data.get(bucket, {}).get(player_id, []):
            if event.get("player"):
                return event["player"]
    initial = log_data.get("initial_snapshots", {}).get(player_id, {})
    return initial.get("player") or player_id


def build_quality_report(game_id: str, log_paths: list[Path] | None = None) -> dict:
    paths = log_paths if log_paths is not None else POSTGAME.find_game_logs(game_id)
    log_data = POSTGAME.parse_log(paths)

    event_counts = Counter()
    total_entries = 0
    for path in paths:
        if not path.exists():
            continue
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                if not line.strip():
                    continue
                total_entries += 1
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    event_counts["invalid_json"] += 1
                    continue
                event_counts[event.get("type", "unknown")] += 1

    player_ids = set(log_data.get("initial_snapshots", {}).keys())
    player_ids.update(log_data.get("card_played", {}).keys())
    player_ids.update(log_data.get("advisor_miss", {}).keys())

    players = []
    totals = Counter()
    for player_id in sorted(player_ids, key=lambda pid: _player_name(pid, log_data)):
        played = log_data["card_played"].get(player_id, [])
        raw_misses = log_data["advisor_miss"].get(player_id, [])
        offtop = POSTGAME.summarize_offtop(played)
        misses = POSTGAME.summarize_misses(raw_misses, played)
        sources = offtop.get("rank_source_counts", {})

        row = {
            "player_id": player_id,
            "player": _player_name(player_id, log_data),
            "card_played": len(played),
            "trusted_play_ranked": sources.get("play", 0),
            "legacy_hand_ranked": sources.get("legacy_hand", 0),
            "offtop": offtop["off_top_count"],
            "offtop_stale_filtered": offtop["stale_filtered_count"],
            "advisor_miss_raw": misses["raw_count"],
            "advisor_miss_trusted": misses["count"],
            "advisor_miss_stale_filtered": misses["stale_filtered_count"],
        }
        row["trusted_play_rank_rate"] = (
            round(row["trusted_play_ranked"] / row["card_played"], 3)
            if row["card_played"]
            else None
        )
        row["advisor_miss_stale_rate"] = (
            round(row["advisor_miss_stale_filtered"] / row["advisor_miss_raw"], 3)
            if row["advisor_miss_raw"]
            else None
        )
        players.append(row)

        for key in (
            "card_played",
            "trusted_play_ranked",
            "legacy_hand_ranked",
            "offtop",
            "offtop_stale_filtered",
            "advisor_miss_raw",
            "advisor_miss_trusted",
            "advisor_miss_stale_filtered",
        ):
            totals[key] += row[key]

    return {
        "game_id": game_id,
        "log_paths": [str(path) for path in paths],
        "total_entries": total_entries,
        "event_counts": dict(sorted(event_counts.items())),
        "players": players,
        "totals": dict(totals),
    }


def print_text(report: dict) -> None:
    totals = report["totals"]
    print(
        f"Logger quality {report['game_id']} | "
        f"logs={len(report['log_paths'])} | entries={report['total_entries']}"
    )
    print(
        "Totals: "
        f"plays {totals.get('card_played', 0)}, "
        f"trusted play-rank {totals.get('trusted_play_ranked', 0)}, "
        f"legacy hand-rank {totals.get('legacy_hand_ranked', 0)}, "
        f"off-top {totals.get('offtop', 0)}, "
        f"off-top stale {totals.get('offtop_stale_filtered', 0)}, "
        f"advisor_miss trusted/raw "
        f"{totals.get('advisor_miss_trusted', 0)}/{totals.get('advisor_miss_raw', 0)}, "
        f"miss stale {totals.get('advisor_miss_stale_filtered', 0)}"
    )
    print()
    print("Event counts:")
    for key, count in report["event_counts"].items():
        print(f"- {key}: {count}")
    print()
    print("Players:")
    for row in report["players"]:
        print(
            f"- {row['player']}: plays {row['card_played']}, "
            f"trusted-rank {row['trusted_play_ranked']}, "
            f"legacy-rank {row['legacy_hand_ranked']}, "
            f"off-top {row['offtop']} stale {row['offtop_stale_filtered']}, "
            f"advisor_miss {row['advisor_miss_trusted']}/{row['advisor_miss_raw']} "
            f"stale {row['advisor_miss_stale_filtered']}"
        )
    print()
    if totals.get("trusted_play_ranked", 0) == 0 and totals.get("card_played", 0) > 0:
        print("Conclusion: old logs do not contain trusted prev_play_rank; use them for coverage/debug only, not scoring calibration.")
    elif totals.get("trusted_play_ranked", 0) < totals.get("card_played", 0):
        print("Conclusion: mixed log quality; calibrate only rows with trusted play-rank.")
    else:
        print("Conclusion: play-rank coverage is trusted for scoring calibration.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("game_id")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    report = build_quality_report(args.game_id)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_text(report)


if __name__ == "__main__":
    main()
