#!/usr/bin/env python3
"""deck_analyzer.py — анализ оставшейся колоды в живой партии TM.

Вычитает из полного пула карт все известные (рука + tableau всех игроков),
показывает распределение по тирам, ключевые карты, вероятности и синергии.

Использование:
  python deck_analyzer.py <player_id> [--base-url URL]
  python deck_analyzer.py <player_id> --search "Birds,Fish,Insects"
  python deck_analyzer.py <player_id> --claude   # markdown output
  python deck_analyzer.py --json state.json      # from saved state
"""

import argparse
import json
import math
import os
import sys
from collections import Counter
from typing import Optional

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), "data")

# ── Expansion mapping: API key → all_cards.json "module" values ──
EXPANSION_TO_MODULES = {
    "corpera": ["corpera"],
    "promo": ["promo"],
    "venus": ["venus"],
    "colonies": ["colonies"],
    "prelude": ["prelude"],
    "prelude2": ["prelude2"],
    "turmoil": ["turmoil"],
    "community": ["community"],
    "ares": ["ares"],
    "moon": ["moon"],
    "pathfinders": ["pathfinders"],
    "ceo": ["ceo"],
    "starwars": ["starwars"],
    "underworld": ["underworld"],
}

PROJECT_TYPES = {"active", "automated", "event"}

# Non-project card types (corps, preludes, CEOs, etc.)
NON_PROJECT_TYPES = {"corporation", "prelude", "ceo"}

# Known special tableau cards that aren't project cards
SPECIAL_CARDS = {"Merger", "Self-Replicating Robots"}


def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_evaluations():
    path = os.path.join(DATA_DIR, "evaluations.json")
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ── 1. Build card pool filtered by enabled expansions ──

def build_card_pool(all_cards, expansions, banned=None, included=None):
    """Return dict {name: card_info} of project cards available in this game."""
    banned = set(banned or [])
    included = set(included or [])

    # Determine enabled modules
    enabled_modules = {"base"}  # base always included
    for exp_key, modules in EXPANSION_TO_MODULES.items():
        if expansions.get(exp_key, False):
            enabled_modules.update(modules)

    pool = {}
    for card in all_cards:
        name = card.get("name", "")
        card_type = card.get("type", "").lower()
        module = card.get("module", "base")

        # Only project cards
        if card_type not in PROJECT_TYPES:
            continue

        # Check expansion
        if module not in enabled_modules:
            continue

        # Check compatibility (some cards require specific expansions)
        compat = card.get("compatibility", [])
        if compat:
            # Card requires at least one of the listed expansions
            if not any(c.lower() in enabled_modules for c in compat):
                continue

        # Banned/included
        if name in banned:
            continue

        pool[name] = card

    # Add explicitly included cards
    for card in all_cards:
        name = card.get("name", "")
        if name in included and name not in pool:
            card_type = card.get("type", "").lower()
            if card_type in PROJECT_TYPES:
                pool[name] = card

    return pool


# ── 2. Identify known cards from game state ──

def build_non_project_names(all_cards, ceo_cards=None):
    """Build set of names that are NOT project cards (corps, preludes, CEOs)."""
    names = set(SPECIAL_CARDS)
    for card in all_cards:
        card_type = card.get("type", "").lower()
        if card_type in NON_PROJECT_TYPES:
            names.add(card.get("name", ""))
    if ceo_cards:
        for card in ceo_cards:
            names.add(card.get("name", ""))
    return names


def identify_known_cards(state, non_project_names):
    """Extract all known project card names from game state."""
    known = set()

    # Our hand
    for card in state.get("cardsInHand", []):
        name = card.get("name", "") if isinstance(card, dict) else card
        if name and name not in non_project_names:
            known.add(name)

    # All players' tableaux
    for player in state.get("players", []):
        for card in player.get("tableau", []):
            name = card.get("name", "") if isinstance(card, dict) else card
            if name and name not in non_project_names:
                known.add(name)

    return known


# ── 3. Compute deck statistics ──

def compute_deck_stats(pool, known, deck_size, discard_size, opp_hand_counts):
    """Compute remaining unknown cards and probabilities."""
    unknown_names = set(pool.keys()) - known
    total_unknown = len(unknown_names)

    # Where unknown cards live
    total_hidden = deck_size + discard_size + sum(opp_hand_counts)

    # Sanity check
    delta = total_unknown - total_hidden
    warning = None
    if abs(delta) > 5:
        warning = (
            f"Count mismatch: {total_unknown} unknown cards vs "
            f"{total_hidden} hidden locations (deck {deck_size} + "
            f"discard {discard_size} + opp hands {sum(opp_hand_counts)}). "
            f"Delta: {delta}"
        )

    # Probability any specific unknown card is in the deck
    p_in_deck = deck_size / total_hidden if total_hidden > 0 else 0

    return {
        "pool_size": len(pool),
        "known_count": len(known),
        "unknown_count": total_unknown,
        "unknown_names": unknown_names,
        "deck_size": deck_size,
        "discard_size": discard_size,
        "opp_hand_counts": opp_hand_counts,
        "total_hidden": total_hidden,
        "p_in_deck": p_in_deck,
        "warning": warning,
    }


def p_at_least_one(target_count, deck_size, draw_count):
    """Hypergeometric: P(draw at least 1 of `target_count` cards from deck of `deck_size` in `draw_count` draws)."""
    if target_count <= 0 or deck_size <= 0 or draw_count <= 0:
        return 0.0
    # P(none) = C(deck-target, draw) / C(deck, draw)
    p_none = 1.0
    for i in range(min(draw_count, deck_size)):
        p_none *= max(0, (deck_size - target_count - i)) / (deck_size - i)
    return 1.0 - max(0.0, p_none)


# ── 4. Analysis ──

def analyze_remaining(unknown_names, pool, evaluations, player_tags=None, player_corps=None, player_tableau=None):
    """Analyze unknown cards: tier distribution, tags, synergies."""

    # Tier distribution
    tier_counts = Counter()
    tier_cards = {"S": [], "A": [], "B": [], "C": [], "D": [], "F": [], "?": []}

    for name in sorted(unknown_names):
        ev = evaluations.get(name, {})
        tier = ev.get("tier", "?")
        score = ev.get("score", 50)
        tier_counts[tier] += 1
        tier_cards[tier].append((name, score))

    # Sort each tier by score desc
    for t in tier_cards:
        tier_cards[t].sort(key=lambda x: -x[1])

    # Tag distribution
    tag_counts = Counter()
    for name in unknown_names:
        card = pool.get(name, {})
        for tag in card.get("tags", []):
            tag_counts[tag.lower()] += 1

    # Synergy analysis (if player info provided)
    synergy_cards = []
    if player_corps and player_tableau:
        my_context = set()
        if player_corps:
            my_context.update(c if isinstance(c, str) else c for c in player_corps)
        if player_tableau:
            my_context.update(player_tableau)

        for name in unknown_names:
            ev = evaluations.get(name, {})
            score = ev.get("score", 50)
            synergies = ev.get("synergies", [])
            # Count how many of our cards appear in this card's synergy list
            matches = [s for s in synergies if s in my_context]
            # Also check if card tags match our corp synergies
            if matches:
                synergy_cards.append((name, score, matches))

        synergy_cards.sort(key=lambda x: -x[1])

    return {
        "tier_counts": tier_counts,
        "tier_cards": tier_cards,
        "tag_counts": tag_counts,
        "synergy_cards": synergy_cards[:20],
    }


# ── 5. Search specific cards ──

def search_cards(card_names, unknown_names, pool, evaluations, p_in_deck):
    """Check if specific cards are still available."""
    results = []
    for name in card_names:
        name = name.strip()
        # Fuzzy match
        match = None
        for pool_name in pool:
            if pool_name.lower() == name.lower():
                match = pool_name
                break
        if not match:
            for pool_name in pool:
                if name.lower() in pool_name.lower():
                    match = pool_name
                    break

        if match:
            ev = evaluations.get(match, {})
            in_unknown = match in unknown_names
            results.append({
                "name": match,
                "score": ev.get("score", "?"),
                "tier": ev.get("tier", "?"),
                "available": in_unknown,
                "p_in_deck": p_in_deck if in_unknown else 0,
                "status": "unknown (possibly in deck)" if in_unknown else "KNOWN (played/in hand)",
            })
        else:
            results.append({
                "name": name,
                "score": "?",
                "tier": "?",
                "available": None,
                "p_in_deck": 0,
                "status": "not in card pool",
            })
    return results


# ── 6. Formatting ──

TIER_COLORS = {"S": "\033[91m", "A": "\033[93m", "B": "\033[33m", "C": "\033[32m", "D": "\033[36m", "F": "\033[90m", "?": "\033[90m"}
RESET = "\033[0m"


def format_terminal(stats, analysis, search_results=None, generation=1):
    lines = []
    lines.append(f"\n{'='*55}")
    lines.append(f"  DECK ANALYZER — Gen {generation}")
    lines.append(f"{'='*55}")

    # Counts
    lines.append(f"\n📊 Card Pool")
    lines.append(f"  Pool: {stats['pool_size']} project cards")
    lines.append(f"  Known: {stats['known_count']} (hand + tableaux)")
    lines.append(f"  Unknown: {stats['unknown_count']}")
    lines.append(f"  └─ Deck: {stats['deck_size']} │ Discard: {stats['discard_size']} │ Opp hands: {sum(stats['opp_hand_counts'])}")
    lines.append(f"  P(specific card in deck): {stats['p_in_deck']*100:.1f}%")

    if stats["warning"]:
        lines.append(f"  ⚠️  {stats['warning']}")

    # Tier distribution
    lines.append(f"\n📈 Tier Distribution (unknown)")
    total_unk = stats["unknown_count"] or 1
    for tier in ["S", "A", "B", "C", "D", "F"]:
        count = analysis["tier_counts"].get(tier, 0)
        pct = count / total_unk * 100
        bar = "█" * int(pct / 2)
        color = TIER_COLORS.get(tier, "")
        lines.append(f"  {color}{tier}: {count:3d} ({pct:4.1f}%) {bar}{RESET}")

    # Draft outlook
    deck_size = stats["deck_size"]
    draw = 4  # standard draft
    for label, tiers in [("S+A", ["S", "A"]), ("B+", ["S", "A", "B"])]:
        target = sum(analysis["tier_counts"].get(t, 0) for t in tiers)
        # Estimate how many are in deck
        target_in_deck = int(target * stats["p_in_deck"])
        p = p_at_least_one(target_in_deck, deck_size, draw) * 100
        lines.append(f"  P(≥1 {label} in next draft of {draw}): ~{p:.0f}%")

    # Key cards (S/A tier)
    lines.append(f"\n⭐ Key Cards Still Available (S/A tier)")
    for tier in ["S", "A"]:
        for name, score in analysis["tier_cards"].get(tier, []):
            lines.append(f"  [{tier}] {name} ({score})")

    # Synergy cards
    if analysis["synergy_cards"]:
        lines.append(f"\n🔗 Best Synergies With Your Setup")
        for name, score, matches in analysis["synergy_cards"][:10]:
            ev = f"({score})"
            lines.append(f"  {name} {ev} — synergies: {', '.join(matches)}")

    # Tag distribution
    lines.append(f"\n🏷️  Tag Distribution (unknown)")
    tag_line = " │ ".join(f"{tag}: {count}" for tag, count in
                          sorted(analysis["tag_counts"].items(), key=lambda x: -x[1])[:10])
    lines.append(f"  {tag_line}")

    # Search results
    if search_results:
        lines.append(f"\n🔍 Search Results")
        for r in search_results:
            status = "✅ in pool" if r["available"] else ("❌ played/in hand" if r["available"] is False else "❓ not in pool")
            p = f" ({r['p_in_deck']*100:.0f}% in deck)" if r["available"] else ""
            lines.append(f"  {r['name']} — {r['tier']}/{r['score']} — {status}{p}")

    lines.append("")
    return "\n".join(lines)


def format_markdown(stats, analysis, search_results=None, generation=1):
    lines = []
    lines.append(f"## Deck Analysis — Gen {generation}\n")

    lines.append(f"| Metric | Value |")
    lines.append(f"|--------|-------|")
    lines.append(f"| Pool | {stats['pool_size']} project cards |")
    lines.append(f"| Known | {stats['known_count']} |")
    lines.append(f"| Unknown | {stats['unknown_count']} |")
    lines.append(f"| Deck | {stats['deck_size']} |")
    lines.append(f"| Discard | {stats['discard_size']} |")
    lines.append(f"| Opp hands | {sum(stats['opp_hand_counts'])} |")
    lines.append(f"| P(card in deck) | {stats['p_in_deck']*100:.1f}% |\n")

    lines.append(f"**Tier distribution (unknown):**\n")
    lines.append(f"| Tier | Count | % |")
    lines.append(f"|------|-------|---|")
    total_unk = stats["unknown_count"] or 1
    for tier in ["S", "A", "B", "C", "D", "F"]:
        count = analysis["tier_counts"].get(tier, 0)
        pct = count / total_unk * 100
        lines.append(f"| {tier} | {count} | {pct:.1f}% |")

    lines.append(f"\n**Key cards (S/A):**\n")
    for tier in ["S", "A"]:
        for name, score in analysis["tier_cards"].get(tier, []):
            lines.append(f"- [{tier}] {name} ({score})")

    if analysis["synergy_cards"]:
        lines.append(f"\n**Synergies:**\n")
        for name, score, matches in analysis["synergy_cards"][:10]:
            lines.append(f"- {name} ({score}) — {', '.join(matches)}")

    if search_results:
        lines.append(f"\n**Search:**\n")
        for r in search_results:
            status = "available" if r["available"] else ("played" if r["available"] is False else "not in pool")
            lines.append(f"- {r['name']}: {r['tier']}/{r['score']} — {status}")

    return "\n".join(lines)


# ── Entry point ──

def fetch_state(player_id, base_url):
    """Fetch game state from API."""
    import requests
    url = f"{base_url}/api/player"
    resp = requests.get(url, params={"id": player_id}, timeout=10)
    resp.raise_for_status()
    return resp.json()


def run_analysis(state, search_terms=None, claude_mode=False):
    """Run full analysis on a game state dict. Returns formatted string."""
    all_cards = load_json("all_cards.json")
    ceo_cards = load_json("ceo_cards.json")
    evaluations = load_evaluations()

    game = state.get("game", state)  # support both nested and flat
    expansions = game.get("gameOptions", {}).get("expansions", {})
    banned = game.get("gameOptions", {}).get("bannedCards", [])
    included = game.get("gameOptions", {}).get("includedCards", [])
    generation = game.get("generation", 1)
    deck_size = game.get("deckSize", 0)
    discard_size = game.get("discardPileSize", 0)

    # Build pool
    pool = build_card_pool(all_cards, expansions, banned, included)

    # Build non-project names set
    non_project_names = build_non_project_names(all_cards, ceo_cards)

    # Identify known cards
    known = identify_known_cards(state, non_project_names)

    # Opponent hand counts
    players = state.get("players", [])
    my_id = state.get("id", "")
    opp_hand_counts = []
    my_player = None
    for p in players:
        if p.get("color") == state.get("thisPlayer", {}).get("color", ""):
            my_player = p
            continue
        # Find "me" by checking cardsInHand presence
        opp_hand_counts.append(p.get("cardsInHandNbr", 0))

    # If we couldn't distinguish, use all but first as opponents
    if not opp_hand_counts:
        cards_in_hand = state.get("cardsInHand", [])
        for p in players:
            if p.get("cardsInHandNbr", 0) != len(cards_in_hand) or my_player:
                opp_hand_counts.append(p.get("cardsInHandNbr", 0))
            else:
                my_player = p

    # Stats
    stats = compute_deck_stats(pool, known, deck_size, discard_size, opp_hand_counts)

    # Player context for synergy
    player_corps = []
    player_tableau_names = set()
    player_tags = {}
    if my_player:
        for card in my_player.get("tableau", []):
            name = card.get("name", "") if isinstance(card, dict) else card
            player_corps.append(name)
            player_tableau_names.add(name)
        player_tags = my_player.get("tags", {})

    # Analysis
    analysis = analyze_remaining(
        stats["unknown_names"], pool, evaluations,
        player_tags, player_corps, player_tableau_names,
    )

    # Search
    search_results = None
    if search_terms:
        search_results = search_cards(
            search_terms.split(","), stats["unknown_names"],
            pool, evaluations, stats["p_in_deck"],
        )

    # Format
    if claude_mode:
        return format_markdown(stats, analysis, search_results, generation)
    else:
        return format_terminal(stats, analysis, search_results, generation)


def main():
    parser = argparse.ArgumentParser(description="TM Deck Analyzer")
    parser.add_argument("player_id", nargs="?", help="Player ID (pXXX)")
    parser.add_argument("--base-url", default="https://tm.knightbyte.win", help="Server URL")
    parser.add_argument("--json", dest="json_file", help="Load state from JSON file")
    parser.add_argument("--search", help="Search for specific cards (comma-separated)")
    parser.add_argument("--claude", action="store_true", help="Markdown output for Claude")
    args = parser.parse_args()

    if args.json_file:
        with open(args.json_file, "r", encoding="utf-8") as f:
            state = json.load(f)
    elif args.player_id:
        state = fetch_state(args.player_id, args.base_url)
    else:
        parser.error("Provide player_id or --json file")

    output = run_analysis(state, args.search, args.claude)
    print(output)


if __name__ == "__main__":
    main()
