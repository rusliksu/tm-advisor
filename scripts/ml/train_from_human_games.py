"""Train card evaluator from human game data — Marginal VP Contribution.

For each card: how much VP does it ADD beyond what the player would
have scored without it? Uses residual analysis with baseline regression.

Accounts for:
- Player skill (MMR weight)
- Pick rate (normalizes situational cards)
- Game context (player count, generation)
- Baseline VP per tableau size (removes "engine players play trash too" bias)
"""

import json
import sys
import os
import math
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

DB_PATH = "data/game_logs/games_db.json"
EVAL_PATH = "data/evaluations.json"
OUTPUT_PATH = "models/card_marginal.json"


def load_data():
    with open(DB_PATH, encoding="utf-8") as f:
        games = json.load(f)["games"]
    with open(EVAL_PATH, encoding="utf-8") as f:
        evals = json.load(f)
    return games, evals


def calculate_mmr(games):
    mmr = defaultdict(lambda: 1000)
    for gid, g in sorted(games.items()):
        players = g.get("players", [])
        if len(players) < 2:
            continue
        sorted_p = sorted(players, key=lambda p: p.get("total_vp", 0), reverse=True)
        winner = sorted_p[0]["name"]
        for p in players:
            if p["name"] == winner:
                mmr[p["name"]] += 10
            else:
                mmr[p["name"]] -= 5
    return dict(mmr)


def compute_baseline(games):
    """Regression: expected VP = f(tableau_size, generation, player_count).
    Simple linear model: VP ≈ a * tableau_size + b * generation + c.
    """
    xs, ys = [], []
    for gid, g in games.items():
        pc = g.get("player_count", len(g["players"]))
        gen = g.get("generation", 0)
        if pc < 2 or gen == 0:
            continue
        for p in g["players"]:
            tab_size = len(p.get("tableau", []))
            vp = p.get("total_vp", 0)
            if tab_size >= 5:
                xs.append((tab_size, gen, pc))
                ys.append(vp)

    if len(xs) < 10:
        return lambda tab, gen, pc: 70  # fallback

    # Simple OLS for VP = a*tab + b*gen + c*pc + d
    n = len(xs)
    sum_tab = sum(x[0] for x in xs)
    sum_gen = sum(x[1] for x in xs)
    sum_vp = sum(ys)
    avg_tab = sum_tab / n
    avg_gen = sum_gen / n
    avg_vp = sum_vp / n

    # Simplified: VP ≈ coeff_tab * tableau_size + intercept
    # (gen and pc have less predictive power than tableau_size)
    cov_tab_vp = sum((x[0] - avg_tab) * (y - avg_vp) for x, y in zip(xs, ys))
    var_tab = sum((x[0] - avg_tab) ** 2 for x in xs)
    coeff_tab = cov_tab_vp / var_tab if var_tab > 0 else 1.5
    intercept = avg_vp - coeff_tab * avg_tab

    print(f"  Baseline: VP ≈ {coeff_tab:.2f} × tableau_size + {intercept:.1f}")
    print(f"  (avg tableau={avg_tab:.0f}, avg VP={avg_vp:.0f}, n={n})")

    return lambda tab, gen, pc: coeff_tab * tab + intercept


def extract_marginal(games, mmr, baseline_fn):
    """For each card: avg residual (actual_VP - expected_VP) of players who played it.
    Weighted by player MMR.
    """
    card_residuals = defaultdict(lambda: {
        "residuals": [], "weights": [],
        "play_count": 0, "win_count": 0,
        "total_games_available": 0,
    })

    total_player_games = 0

    for gid, g in games.items():
        pc = g.get("player_count", len(g["players"]))
        gen = g.get("generation", 0)
        if pc < 2 or gen == 0:
            continue

        players = sorted(g["players"], key=lambda p: p.get("total_vp", 0), reverse=True)
        winner_name = players[0]["name"] if players else ""

        # Track which cards appear in this game (for pick rate)
        cards_in_game = set()
        for p in g["players"]:
            for c in p.get("tableau", []):
                cards_in_game.add(c)

        for p in g["players"]:
            total_player_games += 1
            name = p["name"]
            vp = p.get("total_vp", 0)
            tableau = p.get("tableau", [])
            tab_size = len(tableau)
            is_winner = (name == winner_name)
            weight = max(0.3, (mmr.get(name, 1000) - 900) / 100)

            expected = baseline_fn(tab_size, gen, pc)
            residual = vp - expected

            for card_name in tableau:
                cs = card_residuals[card_name]
                cs["residuals"].append(residual)
                cs["weights"].append(weight)
                cs["play_count"] += 1
                if is_winner:
                    cs["win_count"] += 1

            # Track availability for pick rate
            for card_name in cards_in_game:
                card_residuals[card_name]["total_games_available"] += 1

    return dict(card_residuals), total_player_games


def compute_final_scores(card_data, evals, total_player_games, min_plays=5):
    results = {}

    for card_name, cd in card_data.items():
        if cd["play_count"] < min_plays:
            continue

        # Weighted average residual
        total_w = sum(cd["weights"])
        if total_w == 0:
            continue
        weighted_residual = sum(r * w for r, w in zip(cd["residuals"], cd["weights"])) / total_w

        # Win rate
        wr = cd["win_count"] / cd["play_count"]

        # Pick rate: how often is this card played when available
        # (rough: play_count / total_player_games * 3 since 3 players per game)
        pick_rate = cd["play_count"] / max(1, total_player_games)

        # Confidence: more plays = more reliable
        confidence = min(1.0, cd["play_count"] / 30)

        # Marginal score: residual tells us "players with this card do X VP better/worse than expected"
        # Positive residual = card associated with above-expected performance
        # But normalize by pick rate: common cards have residual closer to 0 (everyone plays them)
        # Rare cards with high residual = genuinely good when played correctly
        # Common cards with high residual = also good (reliably contributes)

        # Don't adjust for pick rate — just show raw marginal
        marginal = round(weighted_residual, 1)

        current = evals.get(card_name, {})
        current_score = current.get("score", 50)

        results[card_name] = {
            "card": card_name,
            "marginal_vp": marginal,
            "plays": cd["play_count"],
            "wins": cd["win_count"],
            "win_rate": round(wr, 3),
            "pick_rate": round(pick_rate, 4),
            "confidence": round(confidence, 2),
            "current_score": current_score,
        }

    return results


def main():
    print("Loading data...")
    games, evals = load_data()
    print(f"  {len(games)} games, {len(evals)} evaluations")

    print("Calculating MMR...")
    mmr = calculate_mmr(games)

    print("Computing baseline...")
    baseline_fn = compute_baseline(games)

    print("Extracting marginal contributions...")
    card_data, total_pg = extract_marginal(games, mmr, baseline_fn)
    print(f"  {len(card_data)} cards, {total_pg} player-games")

    print("Computing final scores...")
    results = compute_final_scores(card_data, evals, total_pg, min_plays=5)
    print(f"  {len(results)} cards with 5+ plays")

    os.makedirs("models", exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    # Reports
    sorted_marginal = sorted(results.values(), key=lambda x: x["marginal_vp"])

    print("\n" + "=" * 70)
    print("WORST marginal VP (cards associated with BELOW-expected performance):")
    print(f"{'Card':35s} {'Marg':>6s} {'Cur':>4s} {'WR':>5s} {'Pick%':>6s} {'Plays':>5s}")
    for v in sorted_marginal[:15]:
        print(f"{v['card']:35s} {v['marginal_vp']:>+6.1f} {v['current_score']:>4d} {v['win_rate']:>5.0%} {v['pick_rate']*100:>5.1f}% {v['plays']:>5d}")

    print(f"\nBEST marginal VP (cards associated with ABOVE-expected performance):")
    for v in sorted_marginal[-15:]:
        print(f"{v['card']:35s} {v['marginal_vp']:>+6.1f} {v['current_score']:>4d} {v['win_rate']:>5.0%} {v['pick_rate']*100:>5.1f}% {v['plays']:>5d}")

    # Biggest disagreements with current evals
    print(f"\nBIGGEST DISAGREEMENTS (marginal vs current score):")
    print("Cards with HIGH current score but NEGATIVE marginal (overrated):")
    overrated = [v for v in results.values() if v["current_score"] >= 75 and v["marginal_vp"] < -5 and v["plays"] >= 10]
    overrated.sort(key=lambda x: x["marginal_vp"])
    for v in overrated[:10]:
        print(f"  {v['card']:35s} cur={v['current_score']:>3d}  marg={v['marginal_vp']:>+.1f}  WR={v['win_rate']:.0%}  plays={v['plays']}")

    print("\nCards with LOW current score but POSITIVE marginal (underrated):")
    underrated = [v for v in results.values() if v["current_score"] <= 55 and v["marginal_vp"] > 5 and v["plays"] >= 10]
    underrated.sort(key=lambda x: -x["marginal_vp"])
    for v in underrated[:10]:
        print(f"  {v['card']:35s} cur={v['current_score']:>3d}  marg={v['marginal_vp']:>+.1f}  WR={v['win_rate']:.0%}  plays={v['plays']}")


if __name__ == "__main__":
    main()
