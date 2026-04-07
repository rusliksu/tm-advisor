"""Advisor Backtest — evaluate advisor accuracy on historical games.

For each finished game, analyzes player tableaus and checks:
1. D-tier card count — did player play trash?
2. Strategy coherence — was tableau focused?
3. Hand bloat signal — did player have too many cards?
4. Correlation: advisor metrics vs final VP/placement

Usage:
    python -m tm_advisor.backtest [--min-games 5] [--player NAME]
"""

from __future__ import annotations

import argparse
import json

from .database import CardDatabase
from .shared_data import resolve_data_path
from .synergy import detect_strategies


def load_games(db_path=None):
    if db_path is None:
        db_path = str(resolve_data_path("game_logs", "games_db.json"))
    with open(db_path, encoding="utf-8") as f:
        return json.load(f)["games"]


def analyze_player_tableau(player, db, player_count=3):
    """Analyze a player's tableau from a finished game."""
    tableau = player.get("tableau", [])
    if not tableau:
        return None

    scores = []
    d_tier = []
    s_a_tier = []
    tags = {}

    for card_name in tableau:
        ev = db.get(card_name)
        if not ev:
            continue
        score = ev.get("score", 0)
        tier = ev.get("tier", "?")
        scores.append(score)
        if score < 50:
            d_tier.append(card_name)
        elif score >= 80:
            s_a_tier.append(card_name)

        # Collect tags
        info = db.get_info(card_name)
        if info:
            for t in info.get("tags", []):
                tags[t] = tags.get(t, 0) + 1

    if not scores:
        return None

    avg_score = sum(scores) / len(scores)
    d_pct = len(d_tier) / len(tableau) * 100 if tableau else 0

    # Strategy coherence
    strats = detect_strategies(tags)
    top_strat = strats[0] if strats else ("none", 0.0)
    coherence = top_strat[1]
    # Also count how many strategies detected (focused = 1-2, unfocused = 0 or 3+)
    n_strats = len(strats)

    return {
        "name": player["name"],
        "total_vp": player.get("total_vp", 0),
        "tr": player.get("tr", 0),
        "winner": player.get("winner", False),
        "cards_played": len(tableau),
        "cards_total": player.get("cards_total", len(tableau)),
        "avg_score": round(avg_score, 1),
        "d_tier_count": len(d_tier),
        "d_tier_pct": round(d_pct, 1),
        "d_tier_cards": d_tier,
        "s_a_count": len(s_a_tier),
        "top_strategy": top_strat[0],
        "coherence": round(coherence, 2),
        "n_strategies": n_strats,
    }


def run_backtest(games, db, min_cards=10, player_filter=None):
    """Run backtest on all games, return per-player results."""
    results = []

    for gid, game in games.items():
        pc = game.get("player_count", len(game["players"]))
        gen = game.get("generation", 0)
        board = game.get("board", "?")

        players_sorted = sorted(game["players"],
                                key=lambda p: p.get("total_vp", 0), reverse=True)

        for place, player in enumerate(players_sorted, 1):
            if player_filter and player_filter.lower() not in player["name"].lower():
                continue

            analysis = analyze_player_tableau(player, db, pc)
            if not analysis or analysis["cards_played"] < min_cards:
                continue

            analysis["place"] = place
            analysis["game_id"] = gid
            analysis["generation"] = gen
            analysis["player_count"] = pc
            analysis["board"] = board
            results.append(analysis)

    return results


def print_report(results):
    """Print backtest summary report."""
    if not results:
        print("No results.")
        return

    # Overall correlation: avg_score vs placement
    winners = [r for r in results if r["winner"]]
    losers = [r for r in results if not r["winner"]]

    print(f"\n{'='*70}")
    print(f"  ADVISOR BACKTEST — {len(results)} player-games analyzed")
    print(f"{'='*70}\n")

    # Winners vs Losers comparison
    def avg(lst, key):
        vals = [r[key] for r in lst if r[key] is not None]
        return sum(vals) / len(vals) if vals else 0

    print(f"{'Metric':<25s} {'Winners':>10s} {'Losers':>10s} {'Delta':>10s}")
    print(f"{'-'*55}")
    for key, label in [
        ("avg_score", "Avg card score"),
        ("d_tier_pct", "D-tier %"),
        ("d_tier_count", "D-tier cards"),
        ("s_a_count", "S/A-tier cards"),
        ("coherence", "Strategy coherence"),
        ("cards_played", "Cards played"),
    ]:
        w = avg(winners, key)
        l = avg(losers, key)
        d = w - l
        print(f"{label:<25s} {w:>10.1f} {l:>10.1f} {d:>+10.1f}")

    # D-tier impact
    print(f"\n{'─'*55}")
    print("D-tier impact on placement:")
    for d_count in range(0, 8):
        matching = [r for r in results if r["d_tier_count"] == d_count]
        if len(matching) < 3:
            continue
        avg_place = sum(r["place"] for r in matching) / len(matching)
        win_rate = sum(1 for r in matching if r["winner"]) / len(matching) * 100
        print(f"  {d_count} D-tier cards: avg place {avg_place:.1f}, "
              f"win rate {win_rate:.0f}% ({len(matching)} games)")

    # Coherence impact
    print(f"\n{'─'*55}")
    print("Strategy focus impact:")
    for bucket_name, fn in [
        ("No strategy (0)", lambda r: r["n_strategies"] == 0),
        ("Focused (1)", lambda r: r["n_strategies"] == 1),
        ("Dual (2)", lambda r: r["n_strategies"] == 2),
        ("Scattered (3+)", lambda r: r["n_strategies"] >= 3),
    ]:
        matching = [r for r in results if fn(r)]
        if len(matching) < 5:
            continue
        avg_place = sum(r["place"] for r in matching) / len(matching)
        win_rate = sum(1 for r in matching if r["winner"]) / len(matching) * 100
        avg_vp = sum(r["total_vp"] for r in matching) / len(matching)
        print(f"  {bucket_name:20s}: avg place {avg_place:.1f}, "
              f"win rate {win_rate:.0f}%, avg VP {avg_vp:.0f} ({len(matching)} games)")

    # Top offenders: most D-tier cards
    print(f"\n{'─'*55}")
    print("Worst tableau quality (most D-tier):")
    worst = sorted(results, key=lambda r: -r["d_tier_pct"])[:10]
    for r in worst:
        print(f"  {r['name']:15s} {r['d_tier_pct']:>5.1f}% D-tier "
              f"({r['d_tier_count']}/{r['cards_played']}) "
              f"→ #{r['place']} {r['total_vp']}VP | {r['d_tier_cards'][:3]}")

    # Best tableau quality
    print(f"\n{'─'*55}")
    print("Best tableau quality (highest avg score, 20+ cards):")
    best = sorted([r for r in results if r["cards_played"] >= 20],
                  key=lambda r: -r["avg_score"])[:10]
    for r in best:
        print(f"  {r['name']:15s} avg={r['avg_score']:.1f} "
              f"S/A={r['s_a_count']} D={r['d_tier_count']} "
              f"→ #{r['place']} {r['total_vp']}VP")

    # Per-player summary (if enough games)
    print(f"\n{'─'*55}")
    print("Per-player advisor metrics (5+ games):")
    from collections import defaultdict
    player_stats = defaultdict(list)
    for r in results:
        player_stats[r["name"]].append(r)

    player_summary = []
    for name, games in player_stats.items():
        if len(games) < 5:
            continue
        player_summary.append({
            "name": name,
            "games": len(games),
            "avg_score": sum(g["avg_score"] for g in games) / len(games),
            "avg_d_pct": sum(g["d_tier_pct"] for g in games) / len(games),
            "avg_coherence": sum(g["coherence"] for g in games) / len(games),
            "win_rate": sum(1 for g in games if g["winner"]) / len(games) * 100,
            "avg_place": sum(g["place"] for g in games) / len(games),
        })

    player_summary.sort(key=lambda x: x["avg_score"], reverse=True)
    print(f"\n{'Name':<15s} {'Games':>5s} {'AvgScore':>9s} {'D%':>6s} {'Coher':>6s} {'WR%':>5s} {'Place':>6s}")
    for ps in player_summary:
        print(f"{ps['name']:<15s} {ps['games']:>5d} {ps['avg_score']:>9.1f} "
              f"{ps['avg_d_pct']:>5.1f}% {ps['avg_coherence']:>6.2f} "
              f"{ps['win_rate']:>4.0f}% {ps['avg_place']:>6.1f}")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Advisor Backtest")
    parser.add_argument("--player", type=str, help="Filter by player name")
    parser.add_argument("--min-cards", type=int, default=10, help="Min cards for analysis")
    args = parser.parse_args(argv)

    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    games = load_games()
    results = run_backtest(games, db, min_cards=args.min_cards, player_filter=args.player)
    print_report(results)


if __name__ == "__main__":
    main()
