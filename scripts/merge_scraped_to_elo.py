#!/usr/bin/env python3
"""Merge scraped herokuapp games into VPS Elo database (game_results table).
Run on VPS: python3 merge_scraped_to_elo.py /tmp/new_scraped_games.json
"""

import json
import sqlite3
import sys
import os

DB_PATH = "/home/openclaw/terraforming-mars/db/game.db"
ELO_FILE = "/home/openclaw/terraforming-mars/elo/scraped_games.json"


def merge_to_elo_json(new_games_path):
    """Merge new games into elo/scraped_games.json (deduped by game_id)."""
    existing = []
    if os.path.exists(ELO_FILE):
        with open(ELO_FILE) as f:
            existing = json.load(f)

    existing_ids = {g["game_id"] for g in existing}

    with open(new_games_path) as f:
        new_games = json.load(f)

    added = 0
    for g in new_games:
        if g["game_id"] not in existing_ids:
            existing.append(g)
            existing_ids.add(g["game_id"])
            added += 1

    with open(ELO_FILE, 'w') as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    print(f"Elo JSON: added {added} new games. Total: {len(existing)}")


def merge_to_db(new_games_path):
    """Insert game results into SQLite game_results table."""
    if not os.path.exists(DB_PATH):
        print(f"DB not found: {DB_PATH}")
        return

    with open(new_games_path) as f:
        new_games = json.load(f)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Check table exists
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='game_results'")
    if not cur.fetchone():
        # Create table
        cur.execute("""CREATE TABLE IF NOT EXISTS game_results (
            game_id TEXT,
            player_name TEXT,
            corporation TEXT,
            vp INTEGER,
            tr INTEGER,
            place INTEGER,
            generation INTEGER,
            player_count INTEGER,
            map TEXT,
            source TEXT DEFAULT 'herokuapp',
            PRIMARY KEY (game_id, player_name)
        )""")
        print("Created game_results table")

    added = 0
    skipped = 0
    for g in new_games:
        for p in g.get("players", []):
            try:
                cur.execute("""INSERT OR IGNORE INTO game_results
                    (game_id, player_name, corporation, vp, tr, place, generation, player_count, map, source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (g["game_id"], p["name"], p.get("corp", "?"),
                     p.get("vp", 0), p.get("tr", 0), p.get("place", 0),
                     g.get("generation", 0), g.get("playerCount", 0),
                     g.get("map", ""), "herokuapp"))
                if cur.rowcount > 0:
                    added += 1
                else:
                    skipped += 1
            except Exception as e:
                print(f"  Error inserting {g['game_id']}/{p['name']}: {e}")
                skipped += 1

    conn.commit()
    total = cur.execute("SELECT COUNT(*) FROM game_results").fetchone()[0]
    games = cur.execute("SELECT COUNT(DISTINCT game_id) FROM game_results").fetchone()[0]
    conn.close()
    print(f"DB: added {added} rows, skipped {skipped} dupes. Total: {total} rows, {games} games")


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/new_scraped_games.json"
    merge_to_elo_json(path)
    merge_to_db(path)
