#!/usr/bin/env python3
"""TM Analyze — анализ JSONL логов партий Terraforming Mars."""

import json
import sys
import os
from collections import Counter, defaultdict
from pathlib import Path


def load_game(path):
    """Load all events from a JSONL file."""
    events = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    return events


def analyze_game(events):
    """Extract key stats from a single game's events."""
    info = {
        "file": None,
        "game_id": None,
        "players": [],
        "winner": None,
        "scores": {},
        "vp_breakdown": {},
        "generations": 0,
        "corps": {},
        "cards_played": defaultdict(list),
        "milestones": [],
        "awards": [],
        "global_changes": [],
        "finished": False,
    }

    # Track all cards played per player to deduce corps
    all_tableau = defaultdict(list)

    for e in events:
        t = e.get("type")

        if t == "game_start":
            info["game_id"] = e.get("game_id")
            for p in e.get("players", []):
                info["players"].append(p["name"])

        elif t == "corp_selected":
            player = e.get("player")
            card = e.get("card")
            if player and card:
                info["corps"][player] = card

        elif t in ("player_init", "generation_snapshot"):
            player = e.get("player")
            corp = e.get("corp", "")
            if player and corp and player not in info["corps"]:
                info["corps"][player] = corp
            gen = e.get("gen", e.get("generation", 0))
            if gen > info["generations"]:
                info["generations"] = gen

        elif t == "card_played":
            player = e.get("player")
            card = e.get("card")
            if player and card:
                info["cards_played"][player].append(card)

        elif t == "milestone_claimed":
            info["milestones"].append({
                "name": e.get("milestone"),
                "player": e.get("player"),
            })

        elif t == "award_funded":
            info["awards"].append({
                "name": e.get("award"),
                "player": e.get("player"),
            })

        elif t == "global_change":
            info["global_changes"].append(e)

        elif t == "game_over":
            info["finished"] = True
            gen = e.get("gen", e.get("generation", 0))
            if gen > info["generations"]:
                info["generations"] = gen
            scores = e.get("final_scores", [])
            best = None
            for s in scores:
                name = s["player"]
                vp = s["vp"]
                info["scores"][name] = vp
                info["vp_breakdown"][name] = s.get("vp_breakdown", {})
                # Tableau from game_over — first card not in cards_played is likely corp
                tableau = s.get("tableau", [])
                if name not in info["corps"] and tableau:
                    played = set(info["cards_played"].get(name, []))
                    for card in tableau:
                        if card not in played:
                            info["corps"][name] = card
                            break
                if best is None or vp > best[1]:
                    best = (name, vp)
            if best:
                info["winner"] = best[0]

    return info


def print_game_summary(info, idx=None):
    """Print summary for a single game."""
    prefix = f"Game {idx}" if idx else "Game"
    gid = info["game_id"] or "?"
    status = "FINISHED" if info["finished"] else "INCOMPLETE"
    print(f"\n{'='*60}")
    print(f"{prefix}: {gid} | Gen {info['generations']} | {status}")

    if info["winner"]:
        print(f"Winner: {info['winner']}")

    for p in info["players"]:
        corp = info["corps"].get(p, "?")
        vp = info["scores"].get(p, "?")
        cards = len(info["cards_played"].get(p, []))
        vb = info["vp_breakdown"].get(p, {})
        vp_str = ""
        if vb:
            vp_str = f" (TR:{vb.get('tr',0)} M:{vb.get('milestones',0)} A:{vb.get('awards',0)} G:{vb.get('greenery',0)} Ci:{vb.get('city',0)} Cards:{vb.get('cards',0)})"
        print(f"  {p}: {corp} — {vp} VP{vp_str} [{cards} cards played]")

    if info["milestones"]:
        ms = ", ".join(f"{m['name']}({m['player']})" for m in info["milestones"])
        print(f"  Milestones: {ms}")
    if info["awards"]:
        aw = ", ".join(f"{a['name']}({a['player']})" for a in info["awards"])
        print(f"  Awards: {aw}")


def print_series_summary(games):
    """Print aggregated stats across multiple games."""
    n = len(games)
    finished = [g for g in games if g["finished"]]
    nf = len(finished)

    print(f"\n{'='*60}")
    print(f"SERIES SUMMARY: {n} games ({nf} finished)")
    print(f"{'='*60}")

    if not finished:
        print("No finished games to analyze.")
        return

    # Win rates
    all_players = set()
    wins = Counter()
    total_vp = defaultdict(list)
    total_cards = defaultdict(list)
    corp_usage = Counter()
    corp_wins = Counter()
    card_freq = Counter()
    milestone_freq = Counter()
    award_freq = Counter()
    gen_lengths = []

    for g in finished:
        for p in g["players"]:
            all_players.add(p)
        if g["winner"]:
            wins[g["winner"]] += 1
        for p, vp in g["scores"].items():
            total_vp[p].append(vp)
        for p, cards in g["cards_played"].items():
            total_cards[p].append(len(cards))
            for c in cards:
                card_freq[c] += 1
        for p, corp in g["corps"].items():
            corp_usage[corp] += 1
            if p == g["winner"]:
                corp_wins[corp] += 1
        for m in g["milestones"]:
            milestone_freq[m["name"]] += 1
        for a in g["awards"]:
            award_freq[a["name"]] += 1
        gen_lengths.append(g["generations"])

    # Player stats
    print(f"\nAvg game length: {sum(gen_lengths)/len(gen_lengths):.1f} generations")
    print(f"Gen range: {min(gen_lengths)}-{max(gen_lengths)}")

    print(f"\n--- Player Stats ---")
    print(f"{'Player':<10} {'Wins':>5} {'WR%':>6} {'Avg VP':>7} {'Avg Cards':>10}")
    for p in sorted(all_players):
        w = wins.get(p, 0)
        wr = w / nf * 100
        avg_vp = sum(total_vp[p]) / len(total_vp[p]) if total_vp[p] else 0
        avg_c = sum(total_cards[p]) / len(total_cards[p]) if total_cards[p] else 0
        print(f"{p:<10} {w:>5} {wr:>5.1f}% {avg_vp:>7.1f} {avg_c:>10.1f}")

    # Corp stats
    if corp_usage:
        print(f"\n--- Corporation Stats ---")
        print(f"{'Corporation':<30} {'Played':>6} {'Wins':>5} {'WR%':>6}")
        for corp, count in corp_usage.most_common():
            cw = corp_wins.get(corp, 0)
            wr = cw / count * 100 if count else 0
            print(f"{corp:<30} {count:>6} {cw:>5} {wr:>5.1f}%")

    # Top cards
    if card_freq:
        print(f"\n--- Most Played Cards (top 15) ---")
        for card, count in card_freq.most_common(15):
            print(f"  {card}: {count}x")

    # Milestones & Awards
    if milestone_freq:
        print(f"\n--- Milestones ---")
        for m, count in milestone_freq.most_common():
            print(f"  {m}: {count}x")
    if award_freq:
        print(f"\n--- Awards ---")
        for a, count in award_freq.most_common():
            print(f"  {a}: {count}x")

    # VP breakdown averages
    print(f"\n--- Avg VP Breakdown (winners) ---")
    winner_vb = defaultdict(list)
    for g in finished:
        w = g["winner"]
        if w and w in g["vp_breakdown"]:
            vb = g["vp_breakdown"][w]
            for k, v in vb.items():
                winner_vb[k].append(v)
    if winner_vb:
        for k in ["tr", "milestones", "awards", "greenery", "city", "cards"]:
            vals = winner_vb.get(k, [])
            if vals:
                print(f"  {k}: {sum(vals)/len(vals):.1f}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="TM Analyze — analyze JSONL game logs")
    parser.add_argument("paths", nargs="+", help="JSONL files or directories")
    parser.add_argument("--summary-only", action="store_true", help="Only show series summary")
    args = parser.parse_args()

    # Collect all JSONL files
    files = []
    for p in args.paths:
        path = Path(p)
        if path.is_dir():
            files.extend(sorted(path.glob("*.jsonl")))
        elif path.is_file() and path.suffix == ".jsonl":
            files.append(path)
        else:
            print(f"Skipping: {p}", file=sys.stderr)

    if not files:
        print("No JSONL files found.", file=sys.stderr)
        sys.exit(1)

    games = []
    for f in files:
        events = load_game(f)
        if not events:
            continue
        info = analyze_game(events)
        info["file"] = str(f)
        games.append(info)

    if not games:
        print("No valid games found.", file=sys.stderr)
        sys.exit(1)

    # Individual game summaries
    if not args.summary_only:
        for i, g in enumerate(games, 1):
            print_game_summary(g, i)

    # Series summary (if multiple games)
    if len(games) > 1 or args.summary_only:
        print_series_summary(games)


if __name__ == "__main__":
    main()
