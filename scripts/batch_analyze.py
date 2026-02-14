#!/usr/bin/env python3
"""Пакетный анализ игр TM — сбор статистики, корректировка тир-листов, профили игроков."""

import os
import sys
import json
import time
from datetime import datetime
from collections import defaultdict

# Add scripts dir to path for tm_game_analyzer
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tm_game_analyzer import resolve_game, load_db, save_db

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
RESULTS_DIR = os.path.join(DATA_DIR, "batch_analysis")

# All game IDs from the Discord channel (Feb 12-14, 2026)
GAME_IDS = [
    "gb0604f1398ce", "g9e665d95a83a", "g7bc2e0c6e951", "g90a513ef8d76",
    "g428f79e8acd3", "g3b21637fba70", "g8d2f0b695478", "g4308c9572fda",
    "g6810e357d996", "gd773bf1215a7", "g9c13ba849218", "g72a172346cf2",
    "gcb6be8c6095c", "g9d8e1f1b2285", "gd011f2c250d2", "g484b7571bac7",
    "ge312e3f36f56", "gcbdc0abc3310", "g1e3fecb80a61", "g636e0250a350",
    "g5b543db7308", "g57ffc242a07c", "gac868825dab6", "gec199b04a194",
    "g652cb884031a", "g4f97ef6ee184", "g77a742028ec8", "g1fe6993caf3",
    "g6f5c482b42fd", "ga3f6eab8cc3f", "gfe10d9f88dd7", "g4e3a5d71089",
    "g9c811a8ed239", "ge4e29ef883b3", "gab99aa2ace91", "g607cd721321a",
    "ged04d0a13aa7", "g84d49796503c", "ga7c927b89aaa", "g192cf8d726b2",
    "gab6d2bc27703", "ga19c7965d80a", "g1227efd2ef5c", "g1e039528d5c9",
    "g6c8c04e1fed", "gb11ec48ac782", "gd8133846e350", "g5df33cb8f9bf",
    "g20bb2344ed0d", "g41634516201c",
]

CHECKPOINT_FILE = os.path.join(RESULTS_DIR, "checkpoint.json")


def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"fetched_games": {}, "failed": []}


def save_checkpoint(cp):
    os.makedirs(RESULTS_DIR, exist_ok=True)
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(cp, f, indent=2, ensure_ascii=False)


def fetch_all_games():
    """Fetch all games, saving checkpoint after each batch."""
    cp = load_checkpoint()
    db = load_db()
    total = len(GAME_IDS)

    for i, gid in enumerate(GAME_IDS):
        if gid in cp["fetched_games"]:
            print(f"  [{i+1}/{total}] {gid} — уже есть (skip)")
            continue

        print(f"  [{i+1}/{total}] {gid} — загружаю...", end=" ", flush=True)
        try:
            record = resolve_game(gid)
            if record and record.get("phase") == "end":
                cp["fetched_games"][gid] = record
                # Also save to games_db
                if gid not in db["games"]:
                    db["games"][gid] = record
                winner = next((p for p in record["players"] if p.get("winner")), None)
                w_name = winner["name"] if winner else "?"
                gen = record.get("generation", "?")
                print(f"OK (Gen {gen}, winner: {w_name})")
            elif record:
                print(f"NOT ENDED (phase={record.get('phase')})")
                cp["failed"].append({"id": gid, "reason": f"phase={record.get('phase')}"})
            else:
                print("FAILED (None)")
                cp["failed"].append({"id": gid, "reason": "resolve returned None"})
        except Exception as e:
            print(f"ERROR: {e}")
            cp["failed"].append({"id": gid, "reason": str(e)})

        # Save checkpoint every 5 games
        if (i + 1) % 5 == 0:
            save_checkpoint(cp)
            save_db(db)
            print(f"  💾 Checkpoint saved ({len(cp['fetched_games'])} games)")

        time.sleep(1.5)  # rate limit

    save_checkpoint(cp)
    save_db(db)
    print(f"\n✅ Fetched {len(cp['fetched_games'])}/{total} games "
          f"({len(cp['failed'])} failed)")
    return cp["fetched_games"]


def analyze_cards(games: dict) -> dict:
    """Analyze card performance across all games."""
    card_stats = defaultdict(lambda: {
        "played": 0, "wins": 0, "total_vp": 0, "vp_counts": [],
        "corps_played_with": [], "games": [],
    })

    for gid, game in games.items():
        for player in game.get("players", []):
            is_winner = player.get("winner", False)
            corp = player.get("tableau", ["???"])[0] if player.get("tableau") else "???"
            tableau = player.get("tableau", [])
            card_vp = player.get("card_vp", {})

            for card_name in tableau:
                cs = card_stats[card_name]
                cs["played"] += 1
                if is_winner:
                    cs["wins"] += 1
                vp = card_vp.get(card_name, 0)
                cs["total_vp"] += vp
                cs["vp_counts"].append(vp)
                cs["corps_played_with"].append(corp)
                cs["games"].append(gid)

    # Calculate derived stats
    for name, cs in card_stats.items():
        cs["avg_vp"] = round(cs["total_vp"] / cs["played"], 2) if cs["played"] > 0 else 0
        cs["win_rate"] = round(cs["wins"] / cs["played"] * 100, 1) if cs["played"] > 0 else 0
        # Don't serialize all game IDs
        cs["game_count"] = len(cs["games"])
        del cs["games"]
        # Top corps
        corp_counts = defaultdict(int)
        for c in cs["corps_played_with"]:
            corp_counts[c] += 1
        cs["top_corps"] = sorted(corp_counts.items(), key=lambda x: x[1], reverse=True)[:3]
        del cs["corps_played_with"]

    return dict(card_stats)


def analyze_players(games: dict) -> dict:
    """Analyze player performance and style."""
    player_stats = defaultdict(lambda: {
        "games": 0, "wins": 0, "total_vp": 0, "corps_used": [],
        "avg_gen": 0, "gen_sum": 0,
        "avg_tableau_size": 0, "tableau_sizes": [],
        "vp_breakdowns": [], "tag_totals": defaultdict(int),
        "favorite_cards": defaultdict(int),
    })

    for gid, game in games.items():
        gen = game.get("generation", 0)
        for player in game.get("players", []):
            name = player.get("name", "???")
            ps = player_stats[name]
            ps["games"] += 1
            ps["gen_sum"] += gen
            if player.get("winner"):
                ps["wins"] += 1
            total_vp = player.get("total_vp", 0)
            ps["total_vp"] += total_vp

            corp = player.get("tableau", ["???"])[0] if player.get("tableau") else "???"
            ps["corps_used"].append(corp)

            tableau = player.get("tableau", [])
            ps["tableau_sizes"].append(len(tableau))
            for card in tableau:
                ps["favorite_cards"][card] += 1

            # Tags
            tags = player.get("tags", {})
            for tag, count in tags.items():
                ps["tag_totals"][tag] += count

            # VP breakdown
            vp_bd = player.get("vp_breakdown", {})
            if vp_bd:
                ps["vp_breakdowns"].append(vp_bd)

    # Calculate derived stats
    result = {}
    for name, ps in player_stats.items():
        g = ps["games"]
        if g == 0:
            continue

        # Corp usage
        corp_counts = defaultdict(int)
        for c in ps["corps_used"]:
            corp_counts[c] += 1
        top_corps = sorted(corp_counts.items(), key=lambda x: x[1], reverse=True)

        # Avg VP breakdown
        avg_bd = {}
        if ps["vp_breakdowns"]:
            for key in ps["vp_breakdowns"][0]:
                vals = [bd.get(key, 0) for bd in ps["vp_breakdowns"]]
                avg_bd[key] = round(sum(vals) / len(vals), 1)

        # Favorite cards (played 2+ times)
        fav_cards = sorted(
            [(card, cnt) for card, cnt in ps["favorite_cards"].items() if cnt >= 2],
            key=lambda x: x[1], reverse=True
        )[:10]

        # Avg tags
        avg_tags = {tag: round(total / g, 1) for tag, total in ps["tag_totals"].items()}
        top_tags = sorted(avg_tags.items(), key=lambda x: x[1], reverse=True)[:5]

        # Style detection
        style = detect_style(avg_bd, avg_tags, top_corps, ps["tableau_sizes"])

        result[name] = {
            "games": g,
            "wins": ps["wins"],
            "win_rate": round(ps["wins"] / g * 100, 1),
            "avg_vp": round(ps["total_vp"] / g, 1),
            "avg_gen": round(ps["gen_sum"] / g, 1),
            "avg_tableau_size": round(sum(ps["tableau_sizes"]) / g, 1),
            "top_corps": top_corps[:5],
            "avg_vp_breakdown": avg_bd,
            "top_tags": top_tags,
            "favorite_cards": fav_cards,
            "style": style,
        }

    return result


def detect_style(avg_bd: dict, avg_tags: dict, top_corps, tableau_sizes) -> str:
    """Detect player's style based on their stats."""
    traits = []

    if not avg_bd:
        return "недостаточно данных"

    # VP source analysis
    tr_pct = avg_bd.get("tr", 0) / max(avg_bd.get("tr", 0) + avg_bd.get("cards", 0) + avg_bd.get("greenery", 0), 1)
    card_pct = avg_bd.get("cards", 0) / max(avg_bd.get("tr", 0) + avg_bd.get("cards", 0) + avg_bd.get("greenery", 0), 1)

    if tr_pct > 0.45:
        traits.append("TR-focused")
    if card_pct > 0.35:
        traits.append("Card VP engine")
    if avg_bd.get("greenery", 0) >= 4:
        traits.append("Greenery builder")
    if avg_bd.get("city", 0) >= 3:
        traits.append("City builder")
    if avg_bd.get("milestones", 0) >= 3:
        traits.append("Milestone hunter")
    if avg_bd.get("awards", 0) >= 3:
        traits.append("Award hunter")

    # Tableau size
    avg_tab = sum(tableau_sizes) / len(tableau_sizes) if tableau_sizes else 0
    if avg_tab >= 20:
        traits.append("Heavy builder")
    elif avg_tab <= 12:
        traits.append("Lean player")

    # Tag preferences
    science = avg_tags.get("science", 0)
    space = avg_tags.get("space", 0)
    building = avg_tags.get("building", 0)
    venus = avg_tags.get("venus", 0)

    if science >= 4:
        traits.append("Science lover")
    if space >= 5:
        traits.append("Space focus")
    if venus >= 3:
        traits.append("Venus specialist")

    return ", ".join(traits) if traits else "Balanced"


# Cards whose popularity may be inflated by optional game settings
OPTIONAL_AUTO_INCLUDE = {"Merger"}


def find_tier_corrections(card_stats: dict, eval_path: str) -> list:
    """Compare card performance vs current evaluations."""
    if not os.path.exists(eval_path):
        return []

    with open(eval_path, "r", encoding="utf-8") as f:
        evals = json.load(f)

    corrections = []

    for card_name, cs in card_stats.items():
        if cs["played"] < 2:
            continue  # not enough data

        ev = evals.get(card_name)
        if not ev:
            continue

        current_score = ev.get("score", 50)
        current_tier = ev.get("tier", "?")

        # Signals for underrated
        signals_up = []
        signals_down = []

        # High win rate + good VP → underrated
        # Average win rate for 3P is ~33%
        if cs["win_rate"] > 50 and cs["played"] >= 3:
            signals_up.append(f"win_rate={cs['win_rate']}%")
        elif cs["win_rate"] < 20 and cs["played"] >= 3:
            signals_down.append(f"win_rate={cs['win_rate']}%")

        # avg_vp NOT used as signal: VP-accumulator cards (Birds, Fish) naturally
        # have high VP — that's expected, not a sign of being underrated.
        # Engine/event/prelude cards have 0 VP — also expected, not overrated.

        # High play count → popular card
        if cs["played"] >= 8:
            note = " ⚙️" if card_name in OPTIONAL_AUTO_INCLUDE else ""
            signals_up.append(f"popular (played {cs['played']}x){note}")

        if signals_up and current_score < 75:
            suggested = min(current_score + 8, 95)
            corrections.append({
                "card": card_name,
                "direction": "UP",
                "current_score": current_score,
                "current_tier": current_tier,
                "suggested_score": suggested,
                "signals": signals_up,
                "played": cs["played"],
                "win_rate": cs["win_rate"],
                "avg_vp": cs["avg_vp"],
            })
        elif signals_down and current_score > 50:
            suggested = max(current_score - 8, 20)
            corrections.append({
                "card": card_name,
                "direction": "DOWN",
                "current_score": current_score,
                "current_tier": current_tier,
                "suggested_score": suggested,
                "signals": signals_down,
                "played": cs["played"],
                "win_rate": cs["win_rate"],
                "avg_vp": cs["avg_vp"],
            })

    corrections.sort(key=lambda x: abs(x["suggested_score"] - x["current_score"]), reverse=True)
    return corrections


def generate_report(games, card_stats, player_stats, corrections):
    """Generate markdown report."""
    lines = []
    lines.append(f"# Batch Analysis Report — {len(games)} games")
    lines.append(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"**Period:** Feb 12-14, 2026")
    lines.append("")

    # Summary
    total_players = set()
    total_gens = []
    for g in games.values():
        total_gens.append(g.get("generation", 0))
        for p in g.get("players", []):
            total_players.add(p.get("name", "?"))

    lines.append(f"## Summary")
    lines.append(f"- Games analyzed: **{len(games)}**")
    lines.append(f"- Unique players: **{len(total_players)}**")
    lines.append(f"- Avg game length: **{sum(total_gens)/len(total_gens):.1f} gens**")
    lines.append("")

    # Top Players
    lines.append("## Player Rankings")
    lines.append("")
    ranked = sorted(player_stats.items(),
                    key=lambda x: (x[1]["win_rate"], x[1]["avg_vp"]), reverse=True)

    lines.append("| Player | Games | Wins | Win% | Avg VP | Avg Gen | Style |")
    lines.append("|--------|-------|------|------|--------|---------|-------|")
    for name, ps in ranked:
        if ps["games"] < 2:
            continue
        lines.append(f"| {name} | {ps['games']} | {ps['wins']} | "
                      f"{ps['win_rate']}% | {ps['avg_vp']} | "
                      f"{ps['avg_gen']} | {ps['style']} |")
    lines.append("")

    # Player Profiles (detailed, for top players)
    lines.append("## Player Profiles")
    lines.append("")
    for name, ps in ranked:
        if ps["games"] < 2:
            continue
        lines.append(f"### {name}")
        lines.append(f"- **Games:** {ps['games']} │ **Wins:** {ps['wins']} ({ps['win_rate']}%)")
        lines.append(f"- **Avg VP:** {ps['avg_vp']} │ **Avg Tableau:** {ps['avg_tableau_size']} cards")
        lines.append(f"- **Style:** {ps['style']}")

        corps = ", ".join(f"{c}({n})" for c, n in ps["top_corps"][:3])
        lines.append(f"- **Corps:** {corps}")

        if ps["avg_vp_breakdown"]:
            bd = ps["avg_vp_breakdown"]
            lines.append(f"- **VP sources:** TR:{bd.get('tr',0)} Cards:{bd.get('cards',0)} "
                          f"Green:{bd.get('greenery',0)} City:{bd.get('city',0)} "
                          f"MS:{bd.get('milestones',0)} AW:{bd.get('awards',0)}")

        tags = ", ".join(f"{t}:{v}" for t, v in ps["top_tags"][:5])
        lines.append(f"- **Top tags/game:** {tags}")

        if ps["favorite_cards"]:
            fav = ", ".join(f"{c}({n}x)" for c, n in ps["favorite_cards"][:5])
            lines.append(f"- **Favorite cards:** {fav}")
        lines.append("")

    # Tier List Corrections
    lines.append("## Tier List Corrections")
    lines.append("")
    lines.append("> **Caveat:** Win rate по картам зависит от уровня игрока.")
    lines.append("> Карта с высоким WR может быть просто любимой у сильных игроков.")
    lines.append("> Engine/production карты (0 card VP) не помечаются как overrated.")
    lines.append("")
    if corrections:
        up = [c for c in corrections if c["direction"] == "UP"]
        down = [c for c in corrections if c["direction"] == "DOWN"]

        if up:
            lines.append("### Underrated (should go UP)")
            lines.append("| Card | Current | Suggested | Played | Win% | Avg VP | Signals |")
            lines.append("|------|---------|-----------|--------|------|--------|---------|")
            for c in up[:15]:
                signals = ", ".join(c["signals"])
                lines.append(f"| {c['card']} | {c['current_tier']}-{c['current_score']} | "
                              f"{c['suggested_score']} | {c['played']} | "
                              f"{c['win_rate']}% | {c['avg_vp']} | {signals} |")
            lines.append("")

        if down:
            lines.append("### Overrated (should go DOWN)")
            lines.append("| Card | Current | Suggested | Played | Win% | Avg VP | Signals |")
            lines.append("|------|---------|-----------|--------|------|--------|---------|")
            for c in down[:15]:
                signals = ", ".join(c["signals"])
                lines.append(f"| {c['card']} | {c['current_tier']}-{c['current_score']} | "
                              f"{c['suggested_score']} | {c['played']} | "
                              f"{c['win_rate']}% | {c['avg_vp']} | {signals} |")
            lines.append("")
    else:
        lines.append("Нет значимых корректировок (мало данных или оценки совпадают).")
        lines.append("")

    # Most played cards
    lines.append("## Most Played Cards")
    lines.append("")
    top_played = sorted(card_stats.items(), key=lambda x: x[1]["played"], reverse=True)[:30]
    lines.append("| Card | Played | Win% | Avg VP | Top Corps |")
    lines.append("|------|--------|------|--------|-----------|")
    for name, cs in top_played:
        corps = ", ".join(f"{c}" for c, n in cs["top_corps"][:2])
        note = " ⚙️*" if name in OPTIONAL_AUTO_INCLUDE else ""
        lines.append(f"| {name}{note} | {cs['played']} | {cs['win_rate']}% | "
                      f"{cs['avg_vp']} | {corps} |")
    if any(name in OPTIONAL_AUTO_INCLUDE for name, _ in top_played):
        lines.append("")
        lines.append("*⚙️ — популярность может быть завышена (опция авто-включения в настройках игры)*")
    lines.append("")

    # Best VP cards
    lines.append("## Best VP Cards (avg VP >= 3, played 2+)")
    lines.append("")
    best_vp = sorted(
        [(n, cs) for n, cs in card_stats.items() if cs["avg_vp"] >= 3 and cs["played"] >= 2],
        key=lambda x: x[1]["avg_vp"], reverse=True
    )[:20]
    if best_vp:
        lines.append("| Card | Played | Avg VP | Win% |")
        lines.append("|------|--------|--------|------|")
        for name, cs in best_vp:
            lines.append(f"| {name} | {cs['played']} | {cs['avg_vp']} | {cs['win_rate']}% |")
    lines.append("")

    return "\n".join(lines)


def main():
    print("=" * 60)
    print("  TM Batch Analyzer — 50 games from Discord")
    print("=" * 60)

    # Step 1: Fetch all games
    print("\n📥 Step 1: Fetching games...")
    games = fetch_all_games()

    if not games:
        print("❌ No games fetched!")
        return

    # Step 2: Analyze cards
    print(f"\n📊 Step 2: Analyzing {len(games)} games...")
    card_stats = analyze_cards(games)
    print(f"  Cards seen: {len(card_stats)}")

    # Step 3: Analyze players
    player_stats = analyze_players(games)
    print(f"  Players: {len(player_stats)}")

    # Step 4: Find tier corrections
    eval_path = os.path.join(DATA_DIR, "evaluations.json")
    corrections = find_tier_corrections(card_stats, eval_path)
    print(f"  Tier corrections: {len(corrections)}")

    # Step 5: Generate report
    print("\n📝 Step 5: Generating report...")
    report = generate_report(games, card_stats, player_stats, corrections)

    report_path = os.path.join(RESULTS_DIR, "batch_report.md")
    os.makedirs(RESULTS_DIR, exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)

    # Also save raw stats
    stats_path = os.path.join(RESULTS_DIR, "card_stats.json")
    with open(stats_path, "w", encoding="utf-8") as f:
        json.dump(card_stats, f, indent=2, ensure_ascii=False)

    players_path = os.path.join(RESULTS_DIR, "player_stats.json")
    with open(players_path, "w", encoding="utf-8") as f:
        json.dump(player_stats, f, indent=2, ensure_ascii=False, default=list)

    print(f"\n✅ Done!")
    print(f"  Report: {report_path}")
    print(f"  Card stats: {stats_path}")
    print(f"  Player stats: {players_path}")


if __name__ == "__main__":
    main()
