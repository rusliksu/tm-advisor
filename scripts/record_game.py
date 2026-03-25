#!/usr/bin/env python3
"""
Рекордер партий TM — полирует spectator API и сохраняет снапшоты для ML.

Usage:
    python scripts/record_game.py GAME_ID [--interval 30] [--server https://...]
    python scripts/record_game.py GAME_ID1 GAME_ID2 ...

Каждое изменение состояния сохраняется в data/recordings/GAME_ID.jsonl
"""

import argparse
import hashlib
import json
import os
import sys
import threading
import time
from datetime import datetime, timezone

import requests

DEFAULT_SERVER = "https://terraforming-mars.herokuapp.com"
DEFAULT_INTERVAL = 30
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "recordings")

# ── API helpers ──────────────────────────────────────────────────────────────


class TMSpectatorClient:
    """HTTP client for TM spectator API with retries and rate limiting."""

    def __init__(self, server: str = DEFAULT_SERVER, timeout: int = 15):
        self.server = server.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "TM-Recorder/1.0"
        self._last_request = 0.0

    def _rate_limit(self):
        elapsed = time.time() - self._last_request
        if elapsed < 1.0:
            time.sleep(1.0 - elapsed)
        self._last_request = time.time()

    def _get(self, endpoint: str, params: dict, retries: int = 3) -> dict | None:
        for attempt in range(retries):
            try:
                self._rate_limit()
                resp = self.session.get(
                    f"{self.server}{endpoint}",
                    params=params,
                    timeout=self.timeout,
                )
                if resp.status_code == 200:
                    return resp.json()
                if resp.status_code in (404, 400):
                    return None  # not found — no point retrying
            except (requests.ConnectionError, requests.Timeout, requests.ReadTimeout) as e:
                wait = 2 ** attempt
                _log(f"  connection error ({e.__class__.__name__}), retry in {wait}s...")
                time.sleep(wait)
            except Exception as e:
                _log(f"  unexpected error: {e}")
                return None
        return None

    def get_spectator_id(self, game_id: str) -> str | None:
        """Fetch spectator ID from /api/game."""
        data = self._get("/api/game", {"id": game_id})
        if data:
            return data.get("spectatorId")
        return None

    def get_spectator_state(self, spectator_id: str) -> dict | None:
        """Fetch full spectator state."""
        return self._get("/api/spectator", {"id": spectator_id})


# ── State extraction ─────────────────────────────────────────────────────────


def _extract_tags(player: dict) -> dict[str, int]:
    """Count tags from tableau cards."""
    counts: dict[str, int] = {}
    for card in player.get("tableau", []):
        for tag in card.get("tags", []):
            tag_lower = tag.lower() if isinstance(tag, str) else str(tag).lower()
            counts[tag_lower] = counts.get(tag_lower, 0) + 1
    return counts


def _extract_player(player: dict) -> dict:
    """Extract player snapshot from spectator API player object."""
    tableau_cards = []
    for card in player.get("tableau", []):
        entry = card.get("name", "?") if isinstance(card, dict) else str(card)
        tableau_cards.append(entry)

    return {
        "name": player.get("name", "?"),
        "color": player.get("color", "?"),
        "tr": player.get("terraformRating", 0),
        "mc": player.get("megaCredits", 0),
        "mc_prod": player.get("megaCreditProduction", 0),
        "steel": player.get("steel", 0),
        "steel_prod": player.get("steelProduction", 0),
        "ti": player.get("titanium", 0),
        "ti_prod": player.get("titaniumProduction", 0),
        "plants": player.get("plants", 0),
        "plant_prod": player.get("plantProduction", 0),
        "energy": player.get("energy", 0),
        "energy_prod": player.get("energyProduction", 0),
        "heat": player.get("heat", 0),
        "heat_prod": player.get("heatProduction", 0),
        "hand_size": player.get("cardsInHandNbr", 0),
        "tableau_size": len(player.get("tableau", [])),
        "tableau": tableau_cards,
        "tags": _extract_tags(player),
        "colonies": player.get("coloniesCount", 0),
        "is_active": player.get("isActive", False),
    }


def _extract_vp_breakdown(player: dict) -> dict | None:
    """Extract VP breakdown if available."""
    vpb = player.get("victoryPointsBreakdown")
    if not vpb:
        return None
    return {
        "total": vpb.get("total", 0),
        "tr": vpb.get("terraformRating", 0),
        "milestones": vpb.get("milestones", 0),
        "awards": vpb.get("awards", 0),
        "greenery": vpb.get("greenery", 0),
        "city": vpb.get("city", 0),
        "cards": vpb.get("victoryPoints", 0),
    }


def build_snapshot(game_id: str, data: dict, event: str = "state_change") -> dict:
    """Build a JSONL-ready snapshot from raw spectator data."""
    game = data.get("game", {})
    players_raw = data.get("players", [])

    players = [_extract_player(p) for p in players_raw]
    phase = game.get("phase", "unknown")

    final_vp = None
    if phase in ("end", "ended", "aftergame"):
        event = "game_end"
        vps = []
        for p in players_raw:
            vp = _extract_vp_breakdown(p)
            if vp:
                vps.append({"name": p.get("name", "?"), **vp})
        if vps:
            final_vp = vps

    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "game_id": game_id,
        "generation": game.get("generation", 0),
        "temperature": game.get("temperature", -30),
        "oxygen": game.get("oxygenLevel", 0),
        "oceans": game.get("oceans", 0),
        "venus": game.get("venusScaleLevel", 0),
        "step": game.get("step", 0),
        "players": players,
        "phase": phase,
        "event": event,
        "final_vp": final_vp,
    }


# ── Duplicate detection ──────────────────────────────────────────────────────


def _state_hash(snapshot: dict) -> str:
    """Hash the game-relevant fields to detect duplicates.

    Ignores ts and event — only cares about actual game state.
    """
    key_parts = {
        "gen": snapshot["generation"],
        "temp": snapshot["temperature"],
        "o2": snapshot["oxygen"],
        "oc": snapshot["oceans"],
        "venus": snapshot["venus"],
        "step": snapshot.get("step", 0),
        "phase": snapshot["phase"],
        "players": [
            {
                "tr": p["tr"], "mc": p["mc"], "mc_prod": p["mc_prod"],
                "steel": p["steel"], "steel_prod": p["steel_prod"],
                "ti": p["ti"], "ti_prod": p["ti_prod"],
                "plants": p["plants"], "plant_prod": p["plant_prod"],
                "energy": p["energy"], "energy_prod": p["energy_prod"],
                "heat": p["heat"], "heat_prod": p["heat_prod"],
                "hand_size": p["hand_size"], "tableau_size": p["tableau_size"],
                "colonies": p["colonies"], "is_active": p["is_active"],
            }
            for p in snapshot["players"]
        ],
    }
    raw = json.dumps(key_parts, sort_keys=True)
    return hashlib.md5(raw.encode()).hexdigest()


def _detect_event(prev: dict | None, curr: dict) -> str:
    """Determine event type from state diff."""
    if prev is None:
        return "state_change"
    if curr["phase"] in ("end", "ended", "aftergame"):
        return "game_end"
    if curr["generation"] > prev["generation"]:
        return "gen_start"
    return "state_change"


# ── Recorder ─────────────────────────────────────────────────────────────────


class GameRecorder:
    """Records a single game to JSONL file."""

    def __init__(self, game_id: str, client: TMSpectatorClient, output_dir: str = DATA_DIR):
        self.game_id = game_id
        self.client = client
        self.output_dir = output_dir
        self.spectator_id: str | None = None
        self._prev_hash: str | None = None
        self._prev_snapshot: dict | None = None
        self._snapshots_saved = 0
        self._finished = False

    @property
    def finished(self) -> bool:
        return self._finished

    @property
    def output_path(self) -> str:
        return os.path.join(self.output_dir, f"{self.game_id}.jsonl")

    def init(self) -> bool:
        """Resolve spectator ID. Returns True on success."""
        _log(f"[{self.game_id}] resolving spectator ID...")
        sid = self.client.get_spectator_id(self.game_id)
        if not sid:
            _log(f"[{self.game_id}] ERROR: no spectator ID found")
            return False
        self.spectator_id = sid
        _log(f"[{self.game_id}] spectator: {sid}")
        os.makedirs(self.output_dir, exist_ok=True)

        # Resume: load previous hash if file exists
        if os.path.exists(self.output_path):
            try:
                with open(self.output_path, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                if lines:
                    last = json.loads(lines[-1])
                    self._prev_hash = _state_hash(last)
                    self._prev_snapshot = last
                    self._snapshots_saved = len(lines)
                    _log(f"[{self.game_id}] resuming, {self._snapshots_saved} snapshots already saved")
                    if last.get("event") == "game_end":
                        _log(f"[{self.game_id}] game already finished in recording")
                        self._finished = True
                        return True
            except Exception:
                pass  # start fresh

        return True

    def poll_once(self) -> bool:
        """Poll spectator API once. Returns True if new state saved, False otherwise."""
        if self._finished:
            return False
        if not self.spectator_id:
            return False

        data = self.client.get_spectator_state(self.spectator_id)
        if data is None:
            return False

        snapshot = build_snapshot(self.game_id, data)
        event = _detect_event(self._prev_snapshot, snapshot)
        snapshot["event"] = event

        h = _state_hash(snapshot)
        if h == self._prev_hash:
            return False  # duplicate

        # Save
        with open(self.output_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(snapshot, ensure_ascii=False) + "\n")

        self._prev_hash = h
        self._prev_snapshot = snapshot
        self._snapshots_saved += 1

        gen = snapshot["generation"]
        phase = snapshot["phase"]
        players_info = ", ".join(
            f"{p['name']}:TR{p['tr']}" for p in snapshot["players"]
        )
        _log(f"[{self.game_id}] #{self._snapshots_saved} gen{gen} {event} ({phase}) | {players_info}")

        if event == "game_end":
            self._finished = True
            if snapshot.get("final_vp"):
                vp_str = ", ".join(
                    f"{v['name']}:{v['total']}VP" for v in snapshot["final_vp"]
                )
                _log(f"[{self.game_id}] GAME OVER: {vp_str}")
            else:
                _log(f"[{self.game_id}] GAME OVER (no VP breakdown)")

        return True


# ── Multi-game runner ────────────────────────────────────────────────────────


def record_games(
    game_ids: list[str],
    server: str = DEFAULT_SERVER,
    interval: int = DEFAULT_INTERVAL,
):
    """Record one or more games. Blocks until all games finish or Ctrl+C."""
    client = TMSpectatorClient(server=server)
    recorders: list[GameRecorder] = []

    for gid in game_ids:
        rec = GameRecorder(gid, client)
        if rec.init():
            if not rec.finished:
                recorders.append(rec)
            else:
                _log(f"[{gid}] skipped (already finished)")
        else:
            _log(f"[{gid}] skipped (init failed)")

    if not recorders:
        _log("No active games to record.")
        return

    _log(f"Recording {len(recorders)} game(s), polling every {interval}s. Ctrl+C to stop.")

    try:
        while recorders:
            for rec in recorders:
                rec.poll_once()

            # Remove finished
            still_active = [r for r in recorders if not r.finished]
            if len(still_active) < len(recorders):
                finished = len(recorders) - len(still_active)
                _log(f"{finished} game(s) finished, {len(still_active)} still active")
                recorders = still_active

            if not recorders:
                break

            time.sleep(interval)

    except KeyboardInterrupt:
        _log("\nStopped by user.")
        for rec in recorders:
            _log(f"[{rec.game_id}] saved {rec._snapshots_saved} snapshots → {rec.output_path}")


# ── Logging ──────────────────────────────────────────────────────────────────


def _log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ── CLI ──────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Record TM games via spectator API for ML training.",
    )
    parser.add_argument(
        "game_ids",
        nargs="+",
        help="One or more game IDs (e.g. g7b9ca008fb0e)",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=DEFAULT_INTERVAL,
        help=f"Poll interval in seconds (default: {DEFAULT_INTERVAL})",
    )
    parser.add_argument(
        "--server",
        default=DEFAULT_SERVER,
        help=f"Server URL (default: {DEFAULT_SERVER})",
    )
    args = parser.parse_args()

    record_games(args.game_ids, server=args.server, interval=args.interval)


if __name__ == "__main__":
    main()
