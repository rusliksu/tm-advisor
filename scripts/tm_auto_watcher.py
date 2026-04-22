#!/usr/bin/env python3
"""Auto-watcher: monitors all active games on TM server.

Polls /api/games every 60s, discovers new games, spawns a background
advisor (--events mode) for each. Draft history is recorded via
AllPlayerDraftTracker. Logs to game_logs/.

Designed to run as a systemd service on VPS.

Usage:
    python3 scripts/tm_auto_watcher.py
    python3 scripts/tm_auto_watcher.py --interval 30
"""

from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# Add parent dir to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.tm_advisor.client import TMClient
from scripts.tm_advisor.constants import BASE_URL

LOG_DIR = Path(__file__).resolve().parent.parent / "data" / "game_logs" / "auto_watch"
LOG_DIR.mkdir(parents=True, exist_ok=True)
ADVISOR_ENTRYPOINT = Path(__file__).resolve().parent.parent / "apps" / "tm-advisor-py" / "entrypoints" / "tm_advisor.py"
RUNTIME_DB_CANDIDATES = [
    Path("/home/openclaw/tm-runtime/prod/shared/db/game.db"),
    Path("/home/openclaw/terraforming-mars/db/game.db"),
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "watcher.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("auto-watcher")


class GameWatcher:
    """Manages a single game's advisor process."""

    def __init__(self, game_id: str, player_ids: list[str], player_names: dict[str, str]):
        self.game_id = game_id
        self.player_ids = player_ids
        self.player_names = player_names  # {pid: name}
        self.processes: dict[str, subprocess.Popen] = {}
        self.log_paths: dict[str, Path] = {}
        self.started_at = datetime.now()

    def start(self):
        """Start advisor processes for all players (draft tracking)."""
        # Use first player for main advisor (it sees all players' draftedCards)
        pid = self.player_ids[0]
        name = self.player_names.get(pid, "unknown")
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_path = LOG_DIR / f"watch_{self.game_id}_{name}_{ts}.jsonl"
        self.log_paths[pid] = log_path

        cmd = build_advisor_cmd(pid)

        log.info(f"Starting advisor for {name} ({pid[:12]}) in {self.game_id}")

        with open(log_path, "w", encoding="utf-8") as f:
            proc = subprocess.Popen(
                cmd,
                stdout=f,
                stderr=subprocess.PIPE,
                cwd=str(Path(__file__).resolve().parent.parent),
            )
            self.processes[pid] = proc

    def is_alive(self) -> bool:
        """Check if any advisor process is still running."""
        for proc in self.processes.values():
            if proc.poll() is None:
                return True
        return False

    def stop(self):
        """Stop all advisor processes."""
        for proc in self.processes.values():
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
        log.info(f"Stopped watchers for {self.game_id}")

    def extract_drafts(self):
        """Run draft extraction after game ends."""
        try:
            from scripts.extract_draft_history import (
                query_db_local, extract_drafts, enrich_with_scores,
                load_evaluations, reconstruct_packs,
            )
            db_path = next((path for path in RUNTIME_DB_CANDIDATES if path.exists()), None)
            if db_path is None:
                joined = ", ".join(str(path) for path in RUNTIME_DB_CANDIDATES)
                log.warning(f"game.db not found in any known location: {joined}")
                return

            rows = query_db_local(str(db_path), self.game_id)
            if not rows:
                log.warning(f"No draft saves for {self.game_id}")
                return

            drafts = extract_drafts(rows)
            player_count = len(drafts["players"])
            drafts["pick_order"] = reconstruct_packs(drafts["pick_order"], player_count)

            evals = load_evaluations()
            if evals:
                enrich_with_scores(drafts, evals)

            draft_path = LOG_DIR / f"drafts_{self.game_id}.json"
            with open(draft_path, "w", encoding="utf-8") as f:
                json.dump({
                    "game_id": self.game_id,
                    "extracted_at": datetime.now().isoformat(),
                    "players": drafts["players"],
                    "pick_order": drafts["pick_order"],
                }, f, ensure_ascii=False, indent=2)
            log.info(f"Draft history saved: {draft_path}")

        except Exception as e:
            log.error(f"Draft extraction failed for {self.game_id}: {e}")


def build_advisor_cmd(player_id: str) -> list[str]:
    if ADVISOR_ENTRYPOINT.exists():
        return [sys.executable, str(ADVISOR_ENTRYPOINT), player_id, "--events"]
    return [sys.executable, "-m", "scripts.tm_advisor.main", player_id, "--events"]


class AutoWatcher:
    """Main watcher loop: discovers games, manages watchers."""

    def __init__(self, poll_interval: int = 60, server_id: str = ""):
        self.client = TMClient()
        self.poll_interval = poll_interval
        self.server_id = server_id.strip()
        self.active_watchers: dict[str, GameWatcher] = {}
        self.finished_games: set[str] = set()
        self.running = True
        self._missing_server_id_logged = False
        self._unauthorized_server_id_logged = False

    def _discover_active_games(self) -> list[dict]:
        """Get list of active (non-finished) games from the server."""
        try:
            if not self.server_id:
                if not self._missing_server_id_logged:
                    log.warning("SERVER_ID is not configured; skipping /api/games discovery to avoid unauthorized polling")
                    self._missing_server_id_logged = True
                return []
            url = f"{self.client._base_url}/api/games"
            resp = self.client.session.get(url, params={"serverId": self.server_id}, timeout=10)
            if resp.status_code == 403:
                if not self._unauthorized_server_id_logged:
                    log.error("Configured SERVER_ID is not authorized for /api/games; skipping discovery until restart")
                    self._unauthorized_server_id_logged = True
                return []
            if resp.status_code != 200:
                return []
            data = resp.json()
            # Filter: only running games with 2+ players
            games = []
            for g in data:
                if isinstance(g, dict):
                    gid = g.get("gameId") or g.get("id", "")
                    participants = g.get("participantIds")
                    players = g.get("players", g.get("playerCount", 0))
                    phase = g.get("phase", "")
                    if isinstance(participants, list):
                        participant_count = sum(
                            1 for participant in participants
                            if isinstance(participant, str) and participant.startswith("p")
                        )
                    elif isinstance(players, list):
                        participant_count = len(players)
                    elif isinstance(players, int):
                        participant_count = players
                    else:
                        participant_count = 0
                    if gid and phase != "end" and participant_count >= 2:
                        games.append(g)
                elif isinstance(g, str):
                    # Just game IDs
                    games.append({"gameId": g})
            return games
        except Exception as e:
            log.error(f"Game discovery failed: {e}")
            return []

    def _resolve_players(self, game_id: str) -> tuple[list[str], dict[str, str]]:
        """Get player IDs and names for a game."""
        try:
            info = self.client.get_game_info(game_id)
            if not info or "players" not in info:
                return [], {}
            pids = []
            names = {}
            for p in info["players"]:
                pid = p.get("id", "")
                name = p.get("name", "?")
                if pid:
                    pids.append(pid)
                    names[pid] = name
            return pids, names
        except Exception as e:
            log.error(f"Player resolution failed for {game_id}: {e}")
            return [], {}

    def _check_finished(self):
        """Check if any watched games have finished."""
        to_remove = []
        for gid, watcher in self.active_watchers.items():
            if not watcher.is_alive():
                log.info(f"Game {gid} finished (advisor exited)")
                watcher.extract_drafts()
                self.finished_games.add(gid)
                to_remove.append(gid)

        for gid in to_remove:
            del self.active_watchers[gid]

    def run(self):
        """Main poll loop."""
        log.info(f"Auto-watcher started. Server: {self.client._base_url}")
        log.info(f"Admin server ID configured: {'yes' if self.server_id else 'no'}")
        log.info(f"Poll interval: {self.poll_interval}s. Log dir: {LOG_DIR}")

        def handle_signal(sig, frame):
            log.info("Shutting down...")
            self.running = False
            for watcher in self.active_watchers.values():
                watcher.stop()

        signal.signal(signal.SIGTERM, handle_signal)
        signal.signal(signal.SIGINT, handle_signal)

        while self.running:
            try:
                # Check finished games
                self._check_finished()

                # Discover new games
                games = self._discover_active_games()
                for g in games:
                    gid = g.get("gameId") or g.get("id", "")
                    if not gid or gid in self.active_watchers or gid in self.finished_games:
                        continue

                    # New game! Resolve players and start watching
                    time.sleep(1)
                    pids, names = self._resolve_players(gid)
                    if not pids:
                        continue

                    player_str = ", ".join(f"{names[p]}" for p in pids)
                    log.info(f"New game: {gid} — {player_str}")

                    watcher = GameWatcher(gid, pids, names)
                    watcher.start()
                    self.active_watchers[gid] = watcher

                status = f"Active: {len(self.active_watchers)}, Finished: {len(self.finished_games)}"
                log.debug(status)

            except Exception as e:
                log.error(f"Poll error: {e}")

            time.sleep(self.poll_interval)

        log.info("Auto-watcher stopped")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="TM Auto-Watcher")
    parser.add_argument("--interval", type=int, default=60,
                        help="Poll interval in seconds (default: 60)")
    parser.add_argument("--server-id", default=os.environ.get("SERVER_ID", ""),
                        help="Admin serverId for protected /api/games discovery")
    args = parser.parse_args()

    watcher = AutoWatcher(poll_interval=args.interval, server_id=args.server_id)
    watcher.run()


if __name__ == "__main__":
    main()
