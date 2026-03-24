"""Train card evaluator from human game data (games_db.json).

Uses 250+ real human games with full tableau and VP breakdown.
Weighted by player MMR — strong players' card choices matter more.

Output: models/card_values.json — per-card VP contribution estimates.
"""

import json
import sys
import os
from collections import defaultdict
from pathlib import Path

# Add project root
sys.path.insert(0, str(Path(__file__).parent.parent))

DB_PATH = "data/game_logs/games_db.json"
EVAL_PATH = "data/evaluations.json"
OUTPUT_PATH = "models/card_values.json"


def load_data():
    with open(DB_PATH, encoding="utf-8") as f:
        games = json.load(f)["games"]
    with open(EVAL_PATH, encoding="utf-8") as f:
        evals = json.load(f)
    return games, evals


def calculate_mmr(games):
    """Simple Elo from game results."""
    mmr = defaultdict(lambda: 1000)
    for gid, g in sorted(games.items()):
        players = g.get("players", [])
        if len(players) < 2:
            continue
        sorted_p = sorted(players, key=lambda p: p.get("total_vp", 0), reverse=True)
        winner = sorted_p[0]["name"]
        for p in players:
            name = p["name"]
            if name == winner:
                mmr[name] += 10
            else:
                mmr[name] -= 5
    return dict(mmr)


def extract_card_stats(games, mmr):
    """For each card: avg VP of players who played it, weighted by MMR."""
    card_stats = defaultdict(lambda: {
        "play_count": 0, "win_count": 0,
        "total_vp": 0, "weighted_vp": 0, "total_weight": 0,
        "total_cards_vp": 0,
        "player_vps": [], "contexts": [],
    })

    for gid, g in games.items():
        pc = g.get("player_count", len(g["players"]))
        gen = g.get("generation", 0)
        if pc < 2 or gen == 0:
            continue

        players = sorted(g["players"], key=lambda p: p.get("total_vp", 0), reverse=True)
        winner_vp = players[0].get("total_vp", 0) if players else 0

        for place, p in enumerate(players, 1):
            name = p["name"]
            vp = p.get("total_vp", 0)
            tableau = p.get("tableau", [])
            cards_vp = p.get("vp_breakdown", {}).get("cards", 0)
            weight = max(0.5, (mmr.get(name, 1000) - 900) / 100)  # MMR 1000 = weight 1.0
            is_winner = (place == 1)

            # VP per card (rough approximation)
            vp_per_card = vp / max(1, len(tableau))

            for card_name in tableau:
                cs = card_stats[card_name]
                cs["play_count"] += 1
                if is_winner:
                    cs["win_count"] += 1
                cs["total_vp"] += vp
                cs["weighted_vp"] += vp * weight
                cs["total_weight"] += weight
                cs["player_vps"].append(vp)
                cs["contexts"].append({
                    "pc": pc, "gen": gen, "place": place,
                    "total_vp": vp, "cards_vp": cards_vp,
                    "tableau_size": len(tableau),
                })

    return dict(card_stats)


def compute_card_values(card_stats, evals, min_plays=3):
    """Compute adjusted card values from game data."""
    results = {}

    for card_name, cs in card_stats.items():
        if cs["play_count"] < min_plays:
            continue

        avg_vp = cs["total_vp"] / cs["play_count"]
        weighted_avg = cs["weighted_vp"] / cs["total_weight"] if cs["total_weight"] > 0 else avg_vp
        win_rate = cs["win_count"] / cs["play_count"]

        # Current evaluation score
        current = evals.get(card_name, {})
        current_score = current.get("score", 50)
        current_tier = current.get("tier", "?")

        # ML score: blend of weighted VP and win rate
        # Normalize: avg human VP ~96, so card at avg = 50 score
        # Above avg = higher score, below = lower
        ml_score = round(max(0, min(100, (weighted_avg / 96) * 50 + win_rate * 30 + 10)))

        # Delta from current evaluation
        delta = ml_score - current_score

        results[card_name] = {
            "card": card_name,
            "plays": cs["play_count"],
            "wins": cs["win_count"],
            "win_rate": round(win_rate, 3),
            "avg_vp": round(avg_vp, 1),
            "weighted_avg_vp": round(weighted_avg, 1),
            "ml_score": ml_score,
            "current_score": current_score,
            "current_tier": current_tier,
            "delta": delta,
        }

    return results


def main():
    print("Loading data...")
    games, evals = load_data()
    print(f"  {len(games)} games, {len(evals)} card evaluations")

    print("Calculating MMR...")
    mmr = calculate_mmr(games)
    top_players = sorted(mmr.items(), key=lambda x: -x[1])[:10]
    print(f"  Top MMR: {', '.join(f'{n}({m})' for n, m in top_players)}")

    print("Extracting card stats...")
    card_stats = extract_card_stats(games, mmr)
    print(f"  {len(card_stats)} unique cards played")

    print("Computing card values...")
    values = compute_card_values(card_stats, evals, min_plays=5)
    print(f"  {len(values)} cards with 5+ plays")

    # Save
    os.makedirs("models", exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(values, f, indent=2, ensure_ascii=False)
    print(f"Saved to {OUTPUT_PATH}")

    # Report: biggest deltas (underrated/overrated)
    sorted_delta = sorted(values.values(), key=lambda x: x["delta"])

    print("\n" + "=" * 60)
    print("MOST OVERRATED (current score >> game performance):")
    print(f"{'Card':35s} {'Cur':>4s} {'ML':>4s} {'Δ':>4s} {'WR':>5s} {'Plays':>5s}")
    for v in sorted_delta[:10]:
        print(f"{v['card']:35s} {v['current_score']:>4d} {v['ml_score']:>4d} {v['delta']:>+4d} {v['win_rate']:>5.0%} {v['plays']:>5d}")

    print("\nMOST UNDERRATED (current score << game performance):")
    for v in sorted_delta[-10:]:
        print(f"{v['card']:35s} {v['current_score']:>4d} {v['ml_score']:>4d} {v['delta']:>+4d} {v['win_rate']:>5.0%} {v['plays']:>5d}")

    print("\n" + "=" * 60)
    print("CORP PERFORMANCE:")
    corps = [(v["card"], v) for v in values.values() if v["plays"] >= 5 and any(
        v["card"] == c for c in ["CrediCor", "Point Luna", "Inventrix", "Teractor",
        "Ecoline", "Helion", "Poseidon", "Aridor", "Arklight", "Splice",
        "Tharsis Republic", "Phobolog", "Saturn Systems", "Valley Trust",
        "Morning Star Inc.", "Viron", "Robinson Industries", "Manutech"]
    )]
    for name, v in sorted(corps, key=lambda x: -x[1]["weighted_avg_vp"]):
        print(f"  {name:25s} avg={v['weighted_avg_vp']:>5.1f} WR={v['win_rate']:>4.0%} plays={v['plays']:>3d} ML={v['ml_score']:>3d} cur={v['current_score']:>3d}")


if __name__ == "__main__":
    main()
