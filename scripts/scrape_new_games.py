#!/usr/bin/env python3
"""Scrape new games from Discord and append to scraped_games.json"""

import json
import os
import time
import requests

BASE_URL = "https://terraforming-mars.herokuapp.com"
OUTPUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'scraped_games.json')
DELAY = 1.5

NEW_GAME_IDS = [
    "ga4915cfc66a2", "g71606cf5a69c", "g29f11590ce54", "g7cad08155c8d",
    "gb124110d6766", "gcc5e465bd6ba", "gd97a1ca9abfb", "gd3152986d2a0",
    "g56e15fc41eee", "g13e06769edaa", "ga96ffc2bf3e5", "gfeb14fb1075",
    "g685ae4b393c0",
]


def fetch_game(game_id):
    try:
        resp = requests.get(f"{BASE_URL}/api/game", params={"id": game_id}, timeout=10)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if data.get("phase") not in ("end", "ended", "aftergame"):
            return None
        spectator_id = data.get("spectatorId")
        if not spectator_id:
            return None
        time.sleep(0.5)
        resp2 = requests.get(f"{BASE_URL}/api/spectator", params={"id": spectator_id}, timeout=10)
        if resp2.status_code == 200:
            result = resp2.json()
            result["_game_meta"] = {
                "id": game_id,
                "phase": data.get("phase"),
                "gameOptions": data.get("gameOptions", {}),
            }
            return result
    except Exception as e:
        print(f"  fetch error {game_id}: {e}")
    return None


def extract_scores(game_data):
    if not game_data:
        return None
    players_raw = game_data.get("players", [])
    if not players_raw:
        return None
    results = []
    for p in players_raw:
        name = p.get("name", "?")
        vp = 0
        vpb = p.get("victoryPointsBreakdown", {})
        if vpb:
            vp = vpb.get("total", 0)
        if not vp:
            return None
        corp = "?"
        tableau = p.get("tableau", [])
        if tableau:
            first = tableau[0]
            corp = first.get("name", "?") if isinstance(first, dict) else str(first)
        breakdown = {}
        if vpb:
            breakdown = {
                "tr": vpb.get("terraformRating", 0),
                "milestones": vpb.get("milestones", 0),
                "awards": vpb.get("awards", 0),
                "greenery": vpb.get("greenery", 0),
                "city": vpb.get("city", 0),
                "cards": vpb.get("victoryPoints", 0),
            }
        results.append({
            "name": name,
            "vp": vp,
            "corp": corp,
            "tr": p.get("terraformRating", 0),
            "vpBreakdown": breakdown,
        })
    if len(results) < 2:
        return None
    results.sort(key=lambda r: r["vp"], reverse=True)
    for i, r in enumerate(results):
        r["place"] = i + 1
        if i > 0 and r["vp"] == results[i-1]["vp"]:
            r["place"] = results[i-1]["place"]
    meta = game_data.get("_game_meta", {})
    gen = game_data.get("game", {}).get("generation", 0)
    opts = meta.get("gameOptions", {})
    return {
        "game_id": meta.get("id", ""),
        "generation": gen,
        "map": opts.get("boardName", ""),
        "playerCount": len(results),
        "players": results,
    }


def main():
    # Load existing
    existing = []
    existing_ids = set()
    if os.path.exists(OUTPUT):
        with open(OUTPUT) as f:
            existing = json.load(f)
        existing_ids = {g["game_id"] for g in existing}

    new_ids = [gid for gid in NEW_GAME_IDS if gid not in existing_ids]
    if not new_ids:
        print("All games already in DB, nothing to scrape")
        return

    print(f"Scraping {len(new_ids)} new games (skipping {len(NEW_GAME_IDS) - len(new_ids)} dupes)...")
    scraped = 0
    for i, gid in enumerate(new_ids):
        data = fetch_game(gid)
        if data:
            result = extract_scores(data)
            if result:
                result["game_id"] = gid
                existing.append(result)
                scraped += 1
                players = ", ".join(f"{p['name']}:{p['vp']}" for p in result['players'])
                print(f"  [{i+1}/{len(new_ids)}] {gid}: gen{result['generation']} {players}")
            else:
                print(f"  [{i+1}/{len(new_ids)}] {gid}: no VP data (game in progress?)")
        else:
            print(f"  [{i+1}/{len(new_ids)}] {gid}: not found or not finished")
        time.sleep(DELAY)

    with open(OUTPUT, 'w') as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)
    print(f"\nDone: {scraped} new games added. Total: {len(existing)} games in {OUTPUT}")


if __name__ == '__main__':
    main()
