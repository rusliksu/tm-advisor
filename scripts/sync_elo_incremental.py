#!/usr/bin/env python3
"""Incrementally sync Elo from TM game.db into elo-data.json/data.json.

Behavior:
- If Elo file is empty/missing, seed it with only the last N finished games (default 1).
- On subsequent runs, append only finished games not already present in Elo.
- Rebuild player ratings from stored games after each sync.

Usage on VPS:
  python3 /home/openclaw/repos/tm-tierlist/scripts/sync_elo_incremental.py
  python3 /home/openclaw/repos/tm-tierlist/scripts/sync_elo_incremental.py --seed-last 3
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

DB_PATH = Path("/home/openclaw/terraforming-mars/db/game.db")
ELO_DIR = Path("/home/openclaw/terraforming-mars/elo")
ELO_PRIMARY = ELO_DIR / "elo-data.json"
ELO_MIRROR = ELO_DIR / "data.json"

DEFAULT_ELO = 1500
BASE_K = 32

TEST_NAMES = {"testa", "testb", "testc", "test", "bot"}
PLAYER_ALIASES = {
    "gydro": "GydRo",
    "руслан": "GydRo",
    "ruslan": "GydRo",
    "genuinegold": "Илья",
    "илья": "Илья",
    "лёха": "Алексей",
    "леха": "Алексей",
    "алексей": "Алексей",
    "тимур": "Тимур",
    "олеся": "Олеся",
    "антистресс": "Антистресс",
    "рав": "Рав",
    "равиль": "Рав",
}


def normalize_name(name: str) -> Tuple[str, str]:
    stripped = (name or "").strip()
    canonical = PLAYER_ALIASES.get(stripped.lower(), stripped)
    return canonical.lower(), canonical


def get_k(elo: float) -> float:
    if elo < 1400:
        return BASE_K * 1.2
    if elo < 1600:
        return BASE_K
    if elo < 1800:
        return BASE_K * 0.8
    if elo < 2000:
        return BASE_K * 0.6
    return BASE_K * 0.4


def expected_score(my_elo: float, opp_elo: float) -> float:
    return 1 / (1 + 10 ** ((opp_elo - my_elo) / 400))


def is_bot_game(scores: List[dict]) -> bool:
    names = [(s.get("playerName") or "").strip() for s in scores]
    if names and all(len(name) <= 2 for name in names):
        return True
    return any(name.lower() in TEST_NAMES for name in names if name)


def load_elo() -> dict:
    for path in (ELO_PRIMARY, ELO_MIRROR):
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
    return {"players": {}, "games": []}


def save_elo(data: dict) -> None:
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    ELO_PRIMARY.write_text(payload, encoding="utf-8")
    ELO_MIRROR.write_text(payload, encoding="utf-8")


def fetch_finished_games() -> List[dict]:
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()
    cur.execute(
        """
        SELECT gr.game_id,
               gr.generations,
               gr.scores,
               COALESCE(cg.completed_time, 0) AS completed_time,
               json_extract(gr.game_options, '$.boardName') AS board_name
        FROM game_results gr
        JOIN completed_game cg ON gr.game_id = cg.game_id
        ORDER BY COALESCE(cg.completed_time, 0), gr.game_id
        """
    )
    rows = cur.fetchall()
    conn.close()

    games: List[dict] = []
    for gid, generations, scores_json, completed_time, board_name in rows:
        scores = json.loads(scores_json)
        if len(scores) < 2 or is_bot_game(scores):
            continue

        named_scores = [s for s in scores if (s.get("playerName") or "").strip()]
        if len(named_scores) < 2:
            continue

        named_scores.sort(key=lambda s: s.get("playerScore", 0), reverse=True)
        players = []
        for i, score in enumerate(named_scores):
            vp = score.get("playerScore", 0)
            place = i + 1
            if i > 0 and vp == named_scores[i - 1].get("playerScore", 0):
                place = players[-1]["place"]
            _, display_name = normalize_name(score.get("playerName", "?"))
            players.append(
                {
                    "name": display_name,
                    "place": place,
                    "vp": vp,
                    "corp": score.get("corporation", "") or "",
                }
            )

        games.append(
            {
                "_key": gid,
                "date": datetime.fromtimestamp(completed_time or 0, tz=timezone.utc).isoformat() if completed_time else "",
                "server": "knightbyte",
                "map": board_name or "",
                "generation": generations or 0,
                "playerCount": len(players),
                "completedTime": completed_time or 0,
                "players": players,
            }
        )
    return games


def rebuild_ratings(games: List[dict]) -> Dict[str, dict]:
    players: Dict[str, dict] = {}

    for game in games:
        entries = game.get("results") or []
        if len(entries) < 2:
            continue

        # Placement Elo
        for i, entry in enumerate(entries):
            key = entry["name"]
            current = players.setdefault(
                key,
                {
                    "displayName": entry["displayName"],
                    "elo": DEFAULT_ELO,
                    "elo_vp": DEFAULT_ELO,
                    "games": 0,
                    "wins": 0,
                    "top3": 0,
                    "totalVP": 0,
                    "corps": {},
                },
            )
            my_elo = current["elo"]
            total_expected = 0.0
            total_actual = 0.0
            for j, opp in enumerate(entries):
                if i == j:
                    continue
                opp_elo = players.setdefault(
                    opp["name"],
                    {
                        "displayName": opp["displayName"],
                        "elo": DEFAULT_ELO,
                        "elo_vp": DEFAULT_ELO,
                        "games": 0,
                        "wins": 0,
                        "top3": 0,
                        "totalVP": 0,
                        "corps": {},
                    },
                )["elo"]
                total_expected += expected_score(my_elo, opp_elo)
                if entry["place"] < opp["place"]:
                    total_actual += 1.0
                elif entry["place"] == opp["place"]:
                    total_actual += 0.5
            scaled_k = get_k(my_elo) / (len(entries) - 1) * 1.5
            entry["oldElo"] = my_elo
            entry["newElo"] = round(my_elo + scaled_k * (total_actual - total_expected))
            entry["delta"] = entry["newElo"] - entry["oldElo"]

        # VP Elo
        for i, entry in enumerate(entries):
            current = players[entry["name"]]
            my_elo = current["elo_vp"]
            my_vp = entry.get("vp", 0)
            total_expected = 0.0
            total_actual = 0.0
            for j, opp in enumerate(entries):
                if i == j:
                    continue
                opp_elo = players[opp["name"]]["elo_vp"]
                total_expected += expected_score(my_elo, opp_elo)
                opp_vp = opp.get("vp", 0)
                if my_vp > opp_vp:
                    margin = min((my_vp - opp_vp) / 20.0, 1.0)
                    total_actual += 0.5 + margin * 0.5
                elif my_vp == opp_vp:
                    total_actual += 0.5
                else:
                    margin = min((opp_vp - my_vp) / 20.0, 1.0)
                    total_actual += 0.5 - margin * 0.5
            scaled_k = get_k(my_elo) / (len(entries) - 1) * 1.5
            current["elo_vp"] = round(my_elo + scaled_k * (total_actual - total_expected))

        for entry in entries:
            current = players[entry["name"]]
            current["displayName"] = entry["displayName"]
            current["elo"] = entry["newElo"]
            current["games"] += 1
            # Placement scoring: 1st=1, 2nd=0.5, last=0
            num_players = len(entries)
            if entry["place"] == 1:
                current["wins"] += 1
            elif entry["place"] < num_players:
                current["wins"] += 0.5
            if entry["place"] <= 3:
                current["top3"] += 1
            current["totalVP"] += entry.get("vp", 0)
            corp = entry.get("corp") or ""
            if corp:
                current["corps"][corp] = current["corps"].get(corp, 0) + 1

    return players


def game_to_record(game: dict) -> dict:
    results = []
    for player in game["players"]:
        key, display = normalize_name(player["name"])
        results.append(
            {
                "name": key,
                "displayName": display,
                "place": player["place"],
                "vp": player.get("vp", 0),
                "corp": player.get("corp", ""),
                "oldElo": 0,
                "newElo": 0,
                "delta": 0,
            }
        )
    return {
        "_key": game["_key"],
        "date": game.get("date", ""),
        "server": game.get("server", "knightbyte"),
        "map": game.get("map", ""),
        "generation": game.get("generation", 0),
        "playerCount": game.get("playerCount", len(results)),
        "completedTime": game.get("completedTime", 0),
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed-last", type=int, default=1)
    args = parser.parse_args()

    elo = load_elo()
    existing_keys = {g.get("_key") for g in elo.get("games", [])}
    db_games = fetch_finished_games()

    if not elo.get("games"):
        candidates = db_games[-max(1, args.seed_last):]
    else:
        latest_completed = max((g.get("completedTime", 0) or 0) for g in elo.get("games", []))
        candidates = [
            game
            for game in db_games
            if game["_key"] not in existing_keys and (game.get("completedTime", 0) or 0) > latest_completed
        ]

    added = 0
    for game in candidates:
        if game["_key"] in existing_keys:
            continue
        elo.setdefault("games", []).append(game_to_record(game))
        existing_keys.add(game["_key"])
        added += 1

    elo["players"] = rebuild_ratings(elo.get("games", []))
    save_elo(elo)

    print(f"existing_games={len(existing_keys) - added}")
    print(f"added_games={added}")
    print(f"total_games={len(elo.get('games', []))}")
    print(f"total_players={len(elo.get('players', {}))}")


if __name__ == "__main__":
    main()
