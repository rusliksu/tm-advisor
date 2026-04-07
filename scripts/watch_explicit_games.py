#!/usr/bin/env python3
"""Watch an explicit list of TM game ids on a given server."""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime
from pathlib import Path

from watch_live_game import start_game_session, poll_game_session
from watch_live_server import append_log, prune_old_logs


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
LOG_DIR = os.path.join(REPO_ROOT, "data", "game_logs")
DEFAULT_GAMES_FILE = os.path.join(REPO_ROOT, "data", "watch_explicit_games.txt")


def load_game_ids(path: str) -> list[str]:
    game_ids: list[str] = []
    file_path = Path(path)
    if not file_path.exists():
        return game_ids
    for raw_line in file_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("g") and line not in game_ids:
            game_ids.append(line)
    return game_ids


def compute_poll_interval(session: dict, args) -> float:
    phase = (session.get("prev_game") or {}).get("phase") or ""
    polls_without_change = int(session.get("polls_without_change", 0))
    if phase in {"initialDrafting", "research", "drafting", "action", "prelude", "preludes"}:
        interval = args.hot_interval
    elif phase in {"solar", "production"}:
        interval = args.cold_interval
    else:
        interval = args.normal_interval
    if polls_without_change >= args.stale_polls:
        interval = max(interval, args.idle_interval)
    return interval


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server-url", required=True)
    parser.add_argument("--game-ids-file", default=DEFAULT_GAMES_FILE)
    parser.add_argument("--refresh-interval", type=float, default=60.0)
    parser.add_argument("--retention-days", type=int, default=14)
    parser.add_argument("--hot-interval", type=float, default=12.0)
    parser.add_argument("--normal-interval", type=float, default=20.0)
    parser.add_argument("--cold-interval", type=float, default=30.0)
    parser.add_argument("--idle-interval", type=float, default=60.0)
    parser.add_argument("--stale-polls", type=int, default=3)
    parser.add_argument("--restart-cooldown-seconds", type=float, default=180.0)
    args = parser.parse_args()

    server_url = args.server_url.rstrip("/")
    os.environ["TM_BASE_URL"] = server_url
    os.makedirs(LOG_DIR, exist_ok=True)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    manager_log = os.path.join(LOG_DIR, f"watch_explicit_games_{stamp}.jsonl")
    sessions: dict[str, dict] = {}
    suppressed_games: dict[str, str] = {}
    restart_cooldowns: dict[str, float] = {}
    next_refresh_at = 0.0
    target_ids: list[str] = []
    last_heartbeat_at = 0.0

    while True:
        now = time.time()

        if now >= next_refresh_at:
            removed_logs = prune_old_logs(args.retention_days)
            if removed_logs:
                append_log(manager_log, {
                    "type": "pruned_logs",
                    "ts": datetime.now().isoformat(timespec="seconds"),
                    "files": removed_logs[:20],
                    "count": len(removed_logs),
                })

            target_ids = load_game_ids(args.game_ids_file)

            for game_id in list(restart_cooldowns):
                if restart_cooldowns[game_id] <= now or game_id not in target_ids:
                    del restart_cooldowns[game_id]
            for game_id in list(suppressed_games):
                if game_id not in target_ids:
                    del suppressed_games[game_id]

            for game_id in list(sessions):
                if game_id not in target_ids:
                    sessions.pop(game_id, None)
                    append_log(manager_log, {
                        "type": "watch_removed",
                        "ts": datetime.now().isoformat(timespec="seconds"),
                        "game_id": game_id,
                        "reason": "not_in_target_list",
                    })

            for game_id in target_ids:
                if game_id in sessions or game_id in suppressed_games or game_id in restart_cooldowns:
                    continue
                try:
                    session = start_game_session(game_id, server_url)
                except Exception as exc:
                    append_log(manager_log, {
                        "type": "watch_start_failed",
                        "ts": datetime.now().isoformat(timespec="seconds"),
                        "game_id": game_id,
                        "error": str(exc),
                    })
                    restart_cooldowns[game_id] = now + args.restart_cooldown_seconds
                    continue

                if (session.get("prev_game") or {}).get("phase") == "end":
                    suppressed_games[game_id] = "ended"
                    append_log(manager_log, {
                        "type": "watch_skipped",
                        "ts": datetime.now().isoformat(timespec="seconds"),
                        "game_id": game_id,
                        "reason": "phase_end",
                        "log_path": session["log_path"],
                    })
                    continue

                session["polls_without_change"] = 0
                session["next_poll_at"] = now + compute_poll_interval(session, args)
                sessions[game_id] = session
                append_log(manager_log, {
                    "type": "watch_started",
                    "ts": datetime.now().isoformat(timespec="seconds"),
                    "game_id": game_id,
                    "log_path": session["log_path"],
                    "next_poll_in": session["next_poll_at"] - now,
                })

            next_refresh_at = now + args.refresh_interval

        for game_id, session in list(sessions.items()):
            if session.get("next_poll_at", 0.0) > now:
                continue
            result = poll_game_session(session)
            if not result.get("active"):
                sessions.pop(game_id, None)
                if result.get("status") == "ended":
                    suppressed_games[game_id] = "ended"
                elif result.get("status") in {"unavailable", "error"}:
                    restart_cooldowns[game_id] = now + args.restart_cooldown_seconds
                append_log(manager_log, {
                    "type": "watch_stopped",
                    "ts": datetime.now().isoformat(timespec="seconds"),
                    "game_id": game_id,
                    "reason": result.get("status"),
                })
                continue

            if result.get("changed"):
                session["polls_without_change"] = 0
            else:
                session["polls_without_change"] = int(session.get("polls_without_change", 0)) + 1
            session["next_poll_at"] = now + compute_poll_interval(session, args)

        if now - last_heartbeat_at >= 60.0:
            append_log(manager_log, {
                "type": "heartbeat",
                "ts": datetime.now().isoformat(timespec="seconds"),
                "server_url": server_url,
                "target_ids": target_ids,
                "watching": sorted(sessions.keys()),
                "suppressed_games": dict(sorted(suppressed_games.items())),
                "restart_cooldowns": {k: round(v - now, 1) for k, v in sorted(restart_cooldowns.items())},
            })
            last_heartbeat_at = now

        time.sleep(1.0)


if __name__ == "__main__":
    main()
