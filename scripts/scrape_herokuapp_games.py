#!/usr/bin/env python3
"""Scrape completed games from herokuapp by game ID.
Fetches game state via spectator API and extracts VP scores.

Usage: python scrape_herokuapp_games.py game_ids.txt
       python scrape_herokuapp_games.py  (uses embedded list)
"""

import json
import sys
import time
import requests

BASE_URL = "https://terraforming-mars.herokuapp.com"
OUTPUT = "/home/openclaw/terraforming-mars/elo/scraped_games.json"
DELAY = 1.5  # seconds between requests

# Embedded game IDs from Discord
GAME_IDS = """
gdfebed759d41 g60c0faac8cd2 ga260fff0917a g6d8c914c3187 g525a57912af0
g12107aede573 gebaeb352f79f g41921dd31d78 g8c8112f60a8d g66f87e314cb3
gee886b077efe gda3d8ead12cb ga3e3585fc186 gf611508d74e2 ge8fbc7b2d401
g658425747231 g39ea93fcd31c gf8df020eab73 g814af06131d6 g8ad578ec5356
gf925e29bcef0 g3dace2feda77 g56e71a1a2e4c g35400104b2df g6cded44c9e17
g9a428d48059f gdb423612ba7 g854fbb67478b gc87b0417ea7b g700bce498f2b
g2954c5ddd9ce g2246332e2738 ge1ae9143ccc0 g9316a385f876 g592e603241d6
g550875d1c45d g630e0da4e4e3 g1c3e7690ecd gac3a75150b65 gcb585dc423af
g13708e3fbded g100f4ba9d891 g8497d3266ba1 g4c3ba73f0afc g95de4ba46605
g28f89d441928 g4f1c0481e8c5 gc0b83ca0e4c6 g4a05cf3df1e g90390aa7ea08
g78f68d19d6f5 g8da27b03834d g910387d56602 g1322c66d3500 g6149068f0c3a
g346e82786ae6 gaace10727cff g1f770f098470 g5d87b8148fdd ge11222c271c7
g999d91355d10 g568db2496fd0 gd102bbce5ae2 ga190a6164c13 g983feaf3d78b
g384ef7635d4b g92d912f8a39e gb3317c15db02 g50a13cba1d3 gdada6feb5393
gbdaa97995cb0 ga2f86bebc5d1 g80113f3d58ca g37753c990794 g694bfc0d66cb
geb8205c44c3 ged04f2f84ed2 g71663b51f48d ga225e27b2f40 g878e043c2783
g73f6f6727e57 gd083bb4ca068 gd148d0153674 g65fa954df3c5 g411db0e7df19
ga3017724eca5 g77a36a12d4df g2b3e9681b44f ga1e426383a13 g20d347adf8c8
g1a8944ae60ad gd9fd7959db08 g657747489c80 gd634a93fa10 gb3313c8baaa5
gabeb7c3e7ce8 g23f2ea2d4137 g752cd97e7ebb gd39195d644de g384b78300c85
g7ac3661a3db6 gc48d5f5a5aae gc88be76cb30b gfdf2564f4039 gdd7917cb6c63
g748ce4a6ee51 ge06fffa1546a g68255a107a4a g78eb03e3c456
g654b404023f7 gd13f05d38337 gc2e7e50ee343 g5b78d77f8a7e gc65c60bea6ac
g531ef9c7aeb6 ge503130a1ee0 g652775885d0c gdaf4beac43 g5d98afb2a5eb
gb941837b851c g8bacbedef981 g82a884421867 g1f1ec1f4228e gec58f03cd965
ged136538e7d3 g840a580dc19a g6afe02c93e8f g2e478a9a4b82 g970f7871bfe1
gdc6fcc7182cd g6796f43c2754 g4824355ec05 g7d446aa1df62 g69a49adbe73a
gabcde23abc1 g1c24f5525a5e gee829b30e415 g517f9c7dc9 g61b526306ee2
gb33a3afa41c4 g10d1cbdbbae1 ge972d6159be3 g10470fd47b2b g417b2a089d98
gb5942dbe0821 ga37a70498bc7 gf7e949e7eb6a g1721a11cebc8 g9828ddcd8a89
g7a77e6d37c11 g16fb8f3a2733 ga2d9b07bded5 gc1338f4fc054 ga9b002465b41
gbb9378228e4f g13c70994387f gccc33649c137 g97c07ee1ea58 g2dbded7e1b73
g991aa6c497b6 g74012363c70e gf9e9a2ed90ae gbe682df41424 gb3641eef5e2f
gf47198d40ac g8befb5af3cd7 gf04e5d3d3116 g1fd6b899dcc2 g73b947c8a600
g5ed2ab92bb75 g783f236c8f19 gb1aac3ded53b gcc9c6b3b34cd gf30764721d79
""".split()


def fetch_game(game_id):
    """Fetch game data: /api/game for spectatorId, then /api/spectator for VP."""
    try:
        # Step 1: get spectator ID from /api/game (not /api/games!)
        resp = requests.get(f"{BASE_URL}/api/game", params={"id": game_id}, timeout=10)
        if resp.status_code != 200:
            return None
        data = resp.json()

        # Check if game is finished
        if data.get("phase") not in ("end", "ended", "aftergame"):
            return None

        spectator_id = data.get("spectatorId")
        if not spectator_id:
            return None

        # Step 2: get full player data from spectator view
        time.sleep(0.5)
        resp2 = requests.get(f"{BASE_URL}/api/spectator",
                             params={"id": spectator_id}, timeout=10)
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
    """Extract player names, VP, corps from spectator data."""
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
            return None  # skip games without VP breakdown

        corp = "?"
        tableau = p.get("tableau", [])
        if tableau:
            first = tableau[0]
            corp = first.get("name", "?") if isinstance(first, dict) else str(first)

        # VP breakdown by category
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

    # Sort by VP, assign places
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
    game_ids = GAME_IDS
    if len(sys.argv) > 1 and sys.argv[1] != '--embedded':
        with open(sys.argv[1]) as f:
            game_ids = [line.strip() for line in f if line.strip().startswith('g')]

    print(f"Scraping {len(game_ids)} games...")
    scraped = []
    skipped = 0
    errors = 0

    for i, gid in enumerate(game_ids):
        if i > 0 and i % 10 == 0:
            print(f"  {i}/{len(game_ids)} scraped, {len(scraped)} valid, {skipped} skipped, {errors} errors")

        try:
            data = fetch_game(gid)
            if data:
                result = extract_scores(data)
                if result:
                    result["game_id"] = gid
                    scraped.append(result)
                else:
                    skipped += 1
            else:
                skipped += 1
        except Exception as e:
            errors += 1
            print(f"  ERROR {gid}: {e}")

        time.sleep(DELAY)

    print(f"\nDone: {len(scraped)} games scraped, {skipped} skipped, {errors} errors")

    # Save
    with open(OUTPUT, 'w') as f:
        json.dump(scraped, f, ensure_ascii=False, indent=2)
    print(f"Saved to {OUTPUT}")

    # Preview
    for g in scraped[:5]:
        players = ", ".join(f"{p['name']}:{p['vp']}" for p in g['players'])
        print(f"  {g['game_id']}: gen{g['generation']} {players}")


if __name__ == '__main__':
    main()
