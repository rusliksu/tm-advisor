#!/usr/bin/env python3
"""Discover active games on a TM server and watch them in one process.

Usage:
    python scripts/watch_live_server.py --server-id <id>

Reads active games from api/games?serverId=... and keeps an embedded watcher
session per game id. This avoids spawning one Python process per live game.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

from watch_live_game import start_game_session, poll_game_session


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
LOG_DIR = os.path.join(REPO_ROOT, "data", "game_logs")
FOCUS_GAMES_PATH = os.path.join(REPO_ROOT, "data", "watch_focus_games.txt")


def fetch_json(url: str):
    with urllib.request.urlopen(url) as response:
        return json.load(response)


def append_log(path: str, payload: dict) -> None:
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False) + "\n")


def prune_old_logs(retention_days: int) -> list[str]:
    if retention_days <= 0:
        return []

    threshold = time.time() - retention_days * 86400
    removed: list[str] = []
    for path in Path(LOG_DIR).glob("watch_live_*"):
        try:
            if path.stat().st_mtime < threshold:
                path.unlink()
                removed.append(path.name)
        except FileNotFoundError:
            continue
    return removed


def load_focus_games(path: str = FOCUS_GAMES_PATH) -> set[str]:
    focus_games: set[str] = set()
    focus_path = Path(path)
    if not focus_path.exists():
        return focus_games

    for raw_line in focus_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("g"):
            focus_games.add(line)
    return focus_games


def compute_poll_interval(session: dict, args, focus_games: set[str]) -> float:
    if session["game_id"] in focus_games:
        return args.focus_interval

    phase = (session.get("prev_game") or {}).get("phase") or ""
    polls_without_change = int(session.get("polls_without_change", 0))
    if phase in {"initialDrafting", "research", "drafting", "action", "prelude"}:
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
    parser.add_argument("--server-url", default="https://tm.knightbyte.win")
    parser.add_argument("--server-id", default=os.environ.get("SERVER_ID", ""))
    parser.add_argument("--discover-interval", type=float, default=30.0)
    parser.add_argument("--watch-interval", type=float, default=10.0)
    parser.add_argument("--retention-days", type=int, default=14)
    parser.add_argument("--focus-interval", type=float, default=8.0)
    parser.add_argument("--hot-interval", type=float, default=15.0)
    parser.add_argument("--normal-interval", type=float, default=25.0)
    parser.add_argument("--cold-interval", type=float, default=35.0)
    parser.add_argument("--idle-interval", type=float, default=60.0)
    parser.add_argument("--stale-polls", type=int, default=3)
    parser.add_argument("--max-new-games-per-discovery", type=int, default=20)
    parser.add_argument("--restart-cooldown-seconds", type=float, default=180.0)
    args = parser.parse_args()

    if not args.server_id:
        raise SystemExit("server id is required: pass --server-id or set SERVER_ID")

    server_url = args.server_url.rstrip("/")
    os.environ["TM_BASE_URL"] = server_url
    os.makedirs(LOG_DIR, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    manager_log = os.path.join(LOG_DIR, f"watch_live_server_{stamp}.jsonl")
    sessions: dict[str, dict] = {}
    next_discovery_at = 0.0
    current_ids: set[str] = set()
    last_heartbeat_at = 0.0
    focus_games: set[str] = set()
    suppressed_games: dict[str, str] = {}
    restart_cooldowns: dict[str, float] = {}

    while True:
        now = time.time()

        if now >= next_discovery_at:
            focus_games = load_focus_games()
            removed_logs = prune_old_logs(args.retention_days)
            if removed_logs:
                append_log(manager_log, {
                    "type": "pruned_logs",
                    "ts": datetime.now().isoformat(timespec="seconds"),
                    "files": removed_logs[:20],
                    "count": len(removed_logs),
                })
            try:
                params = urllib.parse.urlencode({"serverId": args.server_id})
                games = fetch_json(f"{server_url}/api/games?{params}")
                current_ids = {entry["gameId"] for entry in games}
            except Exception as exc:
                append_log(manager_log, {
                    "type": "discovery_error",
                    "ts": datetime.now().isoformat(timespec="seconds"),
                    "error": str(exc),
                })
                next_discovery_at = now + args.discover_interval
                time.sleep(1.0)
                continue

            for game_id in list(suppressed_games):
                if game_id not in current_ids:
                    del suppressed_games[game_id]
            for game_id, expires_at in list(restart_cooldowns.items()):
                if game_id not in current_ids or expires_at <= now:
                    del restart_cooldowns[game_id]

            new_game_ids = sorted(
                [
                    game_id
                    for game_id in current_ids
                    if game_id not in sessions
                    and game_id not in suppressed_games
                    and game_id not in restart_cooldowns
                ],
                key=lambda game_id: (game_id not in focus_games, game_id),
            )
            deferred_count = max(0, len(new_game_ids) - args.max_new_games_per_discovery)
            if deferred_count:
                append_log(manager_log, {
                    "type": "watch_start_deferred",
                    "ts": datetime.now().isoformat(timespec="seconds"),
                    "deferred_count": deferred_count,
                    "max_new_games_per_discovery": args.max_new_games_per_discovery,
                })

            for game_id in new_game_ids[:args.max_new_games_per_discovery]:
                if game_id in sessions:
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
                        "mode": "embedded",
                        "reason": "phase_end",
                        "log_path": session["log_path"],
                    })
                    continue
                session["polls_without_change"] = 0
                session["next_poll_at"] = now + compute_poll_interval(session, args, focus_games)
                sessions[game_id] = session
                append_log(manager_log, {
                    "type": "watch_started",
                    "ts": datetime.now().isoformat(timespec="seconds"),
                    "game_id": game_id,
                    "mode": "embedded",
                    "log_path": session["log_path"],
                    "focus": game_id in focus_games,
                    "next_poll_in": session["next_poll_at"] - now,
                })

            for game_id in sorted(set(sessions) - current_ids):
                session = sessions.pop(game_id)
                append_log(manager_log, {
                    "type": "watch_removed",
                    "ts": datetime.now().isoformat(timespec="seconds"),
                    "game_id": game_id,
                    "mode": "embedded",
                    "log_path": session["log_path"],
                })

            next_discovery_at = now + args.discover_interval

        for game_id in list(sessions):
            session = sessions.get(game_id)
            if session is None or now < session.get("next_poll_at", 0):
                continue
            try:
                active = poll_game_session(session)
            except Exception as exc:
                append_log(manager_log, {
                    "type": "watch_poll_failed",
                    "ts": datetime.now().isoformat(timespec="seconds"),
                    "game_id": game_id,
                    "error": str(exc),
                })
                active = {"active": False, "changed": False, "status": "poll_failed"}
            if active["active"]:
                if active["changed"]:
                    session["polls_without_change"] = 0
                    session["last_change_at"] = now
                else:
                    session["polls_without_change"] = int(session.get("polls_without_change", 0)) + 1
                session["next_poll_at"] = now + compute_poll_interval(session, args, focus_games)
                continue
            ended = sessions.pop(game_id, None)
            if active.get("status") == "ended":
                suppressed_games[game_id] = "ended"
            elif active.get("status") in {"unavailable", "poll_failed"}:
                restart_cooldowns[game_id] = now + args.restart_cooldown_seconds
            append_log(manager_log, {
                "type": "watch_stopped",
                "ts": datetime.now().isoformat(timespec="seconds"),
                "game_id": game_id,
                "mode": "embedded",
                "log_path": ended["log_path"] if ended else None,
                "status": active.get("status"),
            })

        if now - last_heartbeat_at >= args.discover_interval:
            append_log(manager_log, {
                "type": "heartbeat",
                "ts": datetime.now().isoformat(timespec="seconds"),
                "active_games": sorted(current_ids),
                "running_watchers": sorted(sessions),
                "watch_count": len(sessions),
                "mode": "embedded",
                "focus_games": sorted(focus_games),
                "suppressed_games": dict(sorted(suppressed_games.items())),
                "restart_cooldowns": {
                    game_id: round(expires_at - now, 1)
                    for game_id, expires_at in sorted(restart_cooldowns.items())
                    if expires_at > now
                },
                "intervals": {
                    "focus": args.focus_interval,
                    "hot": args.hot_interval,
                    "normal": args.normal_interval,
                    "cold": args.cold_interval,
                    "idle": args.idle_interval,
                },
            })
            last_heartbeat_at = now

        time.sleep(1.0)


if __name__ == "__main__":
    main()
