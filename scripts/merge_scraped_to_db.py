#!/usr/bin/env python3
"""Merge scraped herokuapp games into game_results table on VPS.
Schema: game_id, seed_game_id, players, generations, game_options, scores (JSON text)
"""

import json
import sqlite3
import sys
import os

DB_PATH = "/home/openclaw/terraforming-mars/db/game.db"


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/new_scraped_games.json"
    with open(path) as f:
        games = json.load(f)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Get existing game IDs
    existing = set(r[0] for r in cur.execute("SELECT game_id FROM game_results").fetchall())
    print(f"Existing: {len(existing)} games in DB")

    added = 0
    for g in games:
        gid = g["game_id"]
        if gid in existing:
            continue

        # Build scores JSON matching server format
        scores = []
        for p in g.get("players", []):
            scores.append({
                "corporation": p.get("corp", "?"),
                "playerScore": p.get("vp", 0),
                "playerName": p.get("name", "?"),
                "playerColor": "",  # not available from spectator API
            })

        # Build game_options
        game_options = json.dumps({
            "boardName": g.get("map", ""),
            "source": "herokuapp",
        })

        try:
            cur.execute("""INSERT INTO game_results
                (game_id, seed_game_id, players, generations, game_options, scores)
                VALUES (?, ?, ?, ?, ?, ?)""",
                (gid, "", g.get("playerCount", 0), g.get("generation", 0),
                 game_options, json.dumps(scores, ensure_ascii=False)))
            added += 1
        except Exception as e:
            print(f"  Error {gid}: {e}")

    conn.commit()
    total = cur.execute("SELECT COUNT(*) FROM game_results").fetchone()[0]
    conn.close()
    print(f"Added {added} games. Total in DB: {total}")


if __name__ == '__main__':
    main()
