#!/usr/bin/env python
"""Import historical games from games_db.json into Elo system.

Outputs a JSON file compatible with TM_ELO storage format that can be
imported via the extension popup or loaded directly.

Usage: python scripts/import_elo_from_games_db.py
"""

import json
import os
import sys

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
DEFAULT_ELO = 1500
BASE_K = 32

# Player name aliases — map alternative names to canonical name
PLAYER_ALIASES = {
    "gydro": "GydRo",
    "руслан": "GydRo",
    "ruslan": "GydRo",
    # Add more aliases here as needed
}


def resolve_name(name):
    """Resolve player name through aliases to canonical form."""
    key = name.strip().lower()
    canonical = PLAYER_ALIASES.get(key)
    if canonical:
        return canonical.strip().lower(), canonical
    return key, name


def get_k(elo):
    if elo < 1400: return BASE_K * 1.2
    if elo < 1600: return BASE_K
    if elo < 1800: return BASE_K * 0.8
    if elo < 2000: return BASE_K * 0.6
    return BASE_K * 0.4


def expected_score(my_elo, opp_elo):
    return 1 / (1 + 10 ** ((opp_elo - my_elo) / 400))


def calculate_ffa(players, elo_db):
    n = len(players)
    if n < 2:
        return []

    results = []
    for i, p in enumerate(players):
        name, display = resolve_name(p["name"])
        my_elo = elo_db.get(name, {}).get("elo", DEFAULT_ELO)
        k = get_k(my_elo)

        total_expected = 0
        total_actual = 0
        for j, opp in enumerate(players):
            if i == j:
                continue
            opp_name, _ = resolve_name(opp["name"])
            opp_elo = elo_db.get(opp_name, {}).get("elo", DEFAULT_ELO)
            total_expected += expected_score(my_elo, opp_elo)
            if p["place"] < opp["place"]:
                total_actual += 1.0
            elif p["place"] == opp["place"]:
                total_actual += 0.5

        scaled_k = k / (n - 1) * 1.5
        delta = round(scaled_k * (total_actual - total_expected))
        results.append({
            "name": name,
            "displayName": resolve_name(p["name"])[1],
            "oldElo": my_elo,
            "newElo": my_elo + delta,
            "delta": delta,
            "place": p["place"],
            "corp": p.get("corp", ""),
            "vp": p.get("vp", 0),
        })
    return results


def calculate_ffa_vp_margin(players, elo_db):
    """Alternative: Elo based on VP margin (difference from winner)."""
    n = len(players)
    if n < 2:
        return []

    max_vp = max(p.get("vp", 0) or p.get("tr", 0) for p in players)
    results = []
    for i, p in enumerate(players):
        name, display = resolve_name(p["name"])
        my_elo = elo_db.get(name, {}).get("elo_vp", DEFAULT_ELO)
        k = get_k(my_elo)

        my_vp = p.get("vp", 0) or p.get("tr", 0)
        total_expected = 0
        total_actual = 0
        for j, opp in enumerate(players):
            if i == j:
                continue
            opp_name, _ = resolve_name(opp["name"])
            opp_elo = elo_db.get(opp_name, {}).get("elo_vp", DEFAULT_ELO)
            total_expected += expected_score(my_elo, opp_elo)
            opp_vp = opp.get("vp", 0) or opp.get("tr", 0)
            if my_vp > opp_vp:
                # Scale actual by margin (bigger margin = more "won")
                margin = min((my_vp - opp_vp) / 20.0, 1.0)  # cap at 20 VP diff
                total_actual += 0.5 + margin * 0.5
            elif my_vp == opp_vp:
                total_actual += 0.5
            else:
                margin = min((opp_vp - my_vp) / 20.0, 1.0)
                total_actual += 0.5 - margin * 0.5

        scaled_k = k / (n - 1) * 1.5
        delta = round(scaled_k * (total_actual - total_expected))
        results.append({
            "name": name,
            "displayName": resolve_name(p["name"])[1],
            "oldElo": my_elo,
            "newElo": my_elo + delta,
            "delta": delta,
            "place": p["place"],
            "corp": p.get("corp", ""),
            "vp": my_vp,
        })
    return results


def main():
    db_path = os.path.join(DATA_DIR, "game_logs", "games_db.json")
    with open(db_path, "r", encoding="utf-8") as f:
        db = json.load(f)

    games = db.get("games", {})
    print(f"Total games in DB: {len(games)}")

    elo_data = {"players": {}, "games": []}
    elo_vp_data = {}  # separate Elo for VP-margin mode

    processed = 0
    skipped = 0

    for gid, game in sorted(games.items()):
        raw_players = game.get("players", [])
        if len(raw_players) < 2:
            skipped += 1
            continue

        # Determine places: winner = 1st, rest sorted by TR descending
        winner_names = {p["name"] for p in raw_players if p.get("winner")}
        non_winners = [p for p in raw_players if not p.get("winner")]
        non_winners.sort(key=lambda p: p.get("tr", 0), reverse=True)

        players = []
        place = 1
        for p in raw_players:
            if p.get("winner"):
                players.append({
                    "name": p["name"],
                    "place": 1,
                    "corp": p.get("tableau", [""])[0] if p.get("tableau") else "",
                    "vp": p.get("vpBreakdown", {}).get("total", 0) or p.get("tr", 0),
                    "tr": p.get("tr", 0),
                })

        place = 2
        for p in non_winners:
            players.append({
                "name": p["name"],
                "place": place,
                "corp": p.get("tableau", [""])[0] if p.get("tableau") else "",
                "vp": p.get("vpBreakdown", {}).get("total", 0) or p.get("tr", 0),
                "tr": p.get("tr", 0),
            })
            place += 1

        if not players or not any(p["place"] == 1 for p in players):
            skipped += 1
            continue

        # Place-based Elo
        results = calculate_ffa(players, elo_data["players"])
        # VP-margin Elo
        results_vp = calculate_ffa_vp_margin(players, elo_data["players"])

        for r in results:
            key = r["name"]
            if key not in elo_data["players"]:
                elo_data["players"][key] = {
                    "elo": DEFAULT_ELO, "elo_vp": DEFAULT_ELO,
                    "displayName": r["displayName"],
                    "games": 0, "wins": 0, "top3": 0,
                    "totalVP": 0, "corps": {},
                }
            player = elo_data["players"][key]
            player["elo"] = r["newElo"]
            player["displayName"] = r["displayName"]
            player["games"] += 1
            if r["place"] == 1:
                player["wins"] += 1
            if r["place"] <= 3:
                player["top3"] += 1
            player["totalVP"] += r.get("vp", 0)
            if r["corp"]:
                player["corps"][r["corp"]] = player["corps"].get(r["corp"], 0) + 1

        # Update VP-margin Elo
        for r in results_vp:
            key = r["name"]
            if key in elo_data["players"]:
                elo_data["players"][key]["elo_vp"] = r["newElo"]

        elo_data["games"].append({
            "_key": gid,
            "date": game.get("date", ""),
            "server": "knightbyte",
            "map": game.get("map", ""),
            "generation": game.get("generation", 0),
            "playerCount": len(players),
            "results": [{
                "name": r["name"], "displayName": r["displayName"],
                "place": r["place"], "delta": r["delta"],
                "oldElo": r["oldElo"], "newElo": r["newElo"],
                "corp": r["corp"],
            } for r in results],
        })
        processed += 1

    print(f"Processed: {processed}, Skipped: {skipped}")
    print(f"Players: {len(elo_data['players'])}")

    # Print leaderboard
    leaderboard = sorted(elo_data["players"].items(),
                         key=lambda x: x[1]["elo"], reverse=True)
    print(f"\n{'#':>3} {'Name':<20} {'Elo':>5} {'EloVP':>6} {'Games':>5} {'Wins':>4} {'Win%':>5} {'AvgVP':>5} {'Fav Corp':<20}")
    print("-" * 85)
    for i, (key, p) in enumerate(leaderboard[:30]):
        fav = max(p["corps"].items(), key=lambda x: x[1])[0] if p["corps"] else "-"
        win_pct = round(p["wins"] / p["games"] * 100) if p["games"] > 0 else 0
        avg_vp = round(p["totalVP"] / p["games"]) if p["games"] > 0 else 0
        print(f"{i+1:>3} {p['displayName']:<20} {p['elo']:>5} {p.get('elo_vp', 1500):>6} {p['games']:>5} {p['wins']:>4} {win_pct:>4}% {avg_vp:>5} {fav:<20}")

    # Save
    out_path = os.path.join(DATA_DIR, "elo_import.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(elo_data, f, ensure_ascii=False, indent=2)
    print(f"\nSaved to {out_path}")


if __name__ == "__main__":
    main()
