#!/usr/bin/env python3
"""
TM Game Analyzer — сбор и агрегатный анализ завершённых игр.

Использование:
    # Добавить игру по game ID
    python scripts/tm_game_analyzer.py add ga1e613289700

    # Добавить игру по player ID
    python scripts/tm_game_analyzer.py add p92781069b748

    # Показать статистику по всем играм
    python scripts/tm_game_analyzer.py stats

    # Сравнить наши оценки с реальными данными
    python scripts/tm_game_analyzer.py compare

    # Показать детали конкретной игры
    python scripts/tm_game_analyzer.py show ga1e613289700

    # Карты, требующие пересмотра оценки
    python scripts/tm_game_analyzer.py review

Данные сохраняются в data/game_logs/games_db.json
"""

import sys
import os
import json
import time
import argparse
from datetime import datetime
from collections import defaultdict

import requests
from colorama import init, Fore, Back, Style

init()

BASE_URL = "https://terraforming-mars.herokuapp.com"
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
GAMES_DB = os.path.join(DATA_DIR, "game_logs", "games_db.json")
EVALS_PATH = os.path.join(DATA_DIR, "evaluations.json")
ALL_CARDS_PATH = os.path.join(DATA_DIR, "all_cards.json")
CEO_CARDS_PATH = os.path.join(DATA_DIR, "ceo_cards.json")
PATHFINDER_CARDS_PATH = os.path.join(DATA_DIR, "pathfinder_cards.json")


# ─── Database ───────────────────────────────────────────────────────────

def load_db() -> dict:
    """Load games database."""
    if os.path.exists(GAMES_DB):
        with open(GAMES_DB, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"games": {}, "meta": {"created": datetime.now().isoformat(), "version": 1}}


def save_db(db: dict):
    """Save games database."""
    os.makedirs(os.path.dirname(GAMES_DB), exist_ok=True)
    db["meta"]["updated"] = datetime.now().isoformat()
    with open(GAMES_DB, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)


def load_card_types() -> dict:
    """Load card type classification from all_cards.json + ceo + pathfinder."""
    types = {}  # name -> type (corporation, prelude, project, ceo)
    for path in [ALL_CARDS_PATH, PATHFINDER_CARDS_PATH]:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                for card in json.load(f):
                    types[card["name"]] = card.get("type", "project")
    if os.path.exists(CEO_CARDS_PATH):
        with open(CEO_CARDS_PATH, "r", encoding="utf-8") as f:
            for card in json.load(f):
                types[card["name"]] = "ceo"
    return types


# Global card type lookup (lazy loaded)
_card_types: dict | None = None


def get_card_types() -> dict:
    global _card_types
    if _card_types is None:
        _card_types = load_card_types()
    return _card_types


def load_evaluations() -> dict:
    """Load card evaluations."""
    if not os.path.exists(EVALS_PATH):
        return {}
    with open(EVALS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    evals = {}
    if isinstance(data, dict):
        # Dict format: name -> {score, tier, ...}
        for name, card in data.items():
            if isinstance(card, dict):
                if "name" not in card:
                    card["name"] = name
                evals[name] = card
    elif isinstance(data, list):
        # List format: [{name, score, tier, ...}, ...]
        for card in data:
            if isinstance(card, dict):
                name = card.get("name", "")
                evals[name] = card
    return evals


# ─── API ────────────────────────────────────────────────────────────────

def fetch_json(url: str) -> dict | None:
    """Fetch JSON from URL with error handling."""
    try:
        r = requests.get(url, timeout=15)
        if r.status_code == 200 and r.text.strip():
            return r.json()
        return None
    except Exception as e:
        print(f"  {Fore.RED}Ошибка: {e}{Style.RESET_ALL}")
        return None


def fetch_game_by_id(game_id: str) -> dict | None:
    """Fetch game overview by game ID."""
    return fetch_json(f"{BASE_URL}/api/game?id={game_id}")


def fetch_player(player_id: str) -> dict | None:
    """Fetch full player view."""
    return fetch_json(f"{BASE_URL}/api/player?id={player_id}")


def resolve_game(identifier: str) -> dict | None:
    """
    Resolve a game/player/spectator ID to full game data.
    Returns parsed game record or None.
    """
    known_game_id = None

    # Try as player ID first (most data)
    if identifier.startswith("p"):
        data = fetch_player(identifier)
        if data:
            return parse_player_view(data, game_id_override=known_game_id)

    # Try as game ID
    if identifier.startswith("g"):
        known_game_id = identifier
        game_info = fetch_game_by_id(identifier)
        if game_info and game_info.get("players"):
            # Fetch via first player ID for full data
            first_player = game_info["players"][0]["id"]
            time.sleep(1)
            data = fetch_player(first_player)
            if data:
                return parse_player_view(data, game_id_override=known_game_id)

    # Try as spectator ID
    if identifier.startswith("s"):
        data = fetch_player(identifier)
        if data:
            return parse_player_view(data, game_id_override=known_game_id)

    # Generic try - game ID
    known_game_id = identifier
    game_info = fetch_game_by_id(identifier)
    if game_info and game_info.get("players"):
        first_player = game_info["players"][0]["id"]
        time.sleep(1)
        data = fetch_player(first_player)
        if data:
            return parse_player_view(data, game_id_override=known_game_id)

    return None


# ─── Parsing ────────────────────────────────────────────────────────────

def parse_player_view(data: dict, game_id_override: str = None) -> dict:
    """Parse PlayerViewModel into structured game record."""
    game = data.get("game", {})
    options = game.get("gameOptions", {})
    expansions = options.get("expansions", {})

    # Parse all players
    players = []
    for p in data.get("players", []):
        player = parse_player(p)
        players.append(player)

    # Sort by total VP descending
    players.sort(key=lambda x: x["total_vp"], reverse=True)

    # Mark winner
    if players:
        players[0]["winner"] = True

    # Globals per generation
    gpg = game.get("globalsPerGeneration", [])

    # Parse map tiles
    map_tiles = parse_map(game.get("spaces", []))

    # Turmoil state
    turmoil = game.get("turmoil")

    # Pathfinder tracks
    pathfinders = game.get("pathfinders")

    record = {
        "game_id": game_id_override or game.get("id") or data.get("runId") or game.get("spectatorId", "unknown"),
        "generation": game.get("generation", 0),
        "phase": game.get("phase", ""),
        "player_count": len(players),
        "players": players,
        "board": options.get("boardName", "unknown"),
        "expansions": {k: v for k, v in expansions.items() if v},
        "options": {
            "draft": options.get("draftVariant", False),
            "wgt": options.get("solarPhaseOption", False),
            "two_corps": options.get("twoCorpsVariant", False),
            "prelude_draft": options.get("preludeDraftVariant", False),
            "ceo_draft": options.get("ceosDraftVariant", False),
        },
        "globals_final": {
            "temperature": game.get("temperature", 0),
            "oxygen": game.get("oxygenLevel", 0),
            "oceans": game.get("oceans", 0),
            "venus": game.get("venusScaleLevel", 0),
        },
        "globals_per_gen": gpg,
        "milestones": parse_milestones(game.get("milestones", [])),
        "awards": parse_awards(game.get("awards", [])),
        "map_tiles": map_tiles,
        "pathfinders": pathfinders,
        "fetched_at": datetime.now().isoformat(),
    }

    return record


def parse_player(p: dict) -> dict:
    """Parse a single player entry."""
    vp = p.get("victoryPointsBreakdown", {})
    tableau = p.get("tableau", [])

    # Extract corps, preludes, CEO, merger from tableau
    corps = []
    preludes = []
    ceo = None
    merger = False
    project_cards = []

    for c in tableau:
        name = c.get("name", "")
        calc_cost = c.get("calculatedCost", 0)

        # Heuristic: corps have calculatedCost=0 and no resources tracking in typical sense
        # We'll classify based on known patterns
        if name == "Merger":
            merger = True
            continue

        # Check card type by name patterns and properties
        card_entry = {
            "name": name,
            "resources": c.get("resources", 0),
        }
        project_cards.append(card_entry)

    # VP from cards detail
    card_vp = {}
    for detail in vp.get("detailsCards", []):
        card_vp[detail["cardName"]] = detail["victoryPoint"]

    # Card resources (for resource-holding cards like animals, microbes, floaters, etc.)
    card_resources = {}
    for c in tableau:
        res = c.get("resources", 0)
        if res and res > 0:
            card_resources[c.get("name", "")] = res

    # Tags (dict: tag_name -> count)
    tags = p.get("tags", {})
    if isinstance(tags, list):
        tag_counts = defaultdict(int)
        for t in tags:
            if isinstance(t, dict):
                tag_counts[t.get("tag", "")] += t.get("count", 0)
            elif isinstance(t, str):
                tag_counts[t] += 1
        tag_counts = dict(tag_counts)
    elif isinstance(tags, dict):
        tag_counts = tags
    else:
        tag_counts = {}

    return {
        "name": p.get("name", "?"),
        "color": p.get("color", "?"),
        "winner": False,
        "tableau": [c.get("name", "") for c in tableau],
        "tableau_size": len(tableau),
        "card_vp": card_vp,
        "card_resources": card_resources,
        "tr": vp.get("terraformRating", p.get("terraformRating", 0)),
        "total_vp": vp.get("total", 0),
        "vp_breakdown": {
            "tr": vp.get("terraformRating", 0),
            "milestones": vp.get("milestones", 0),
            "awards": vp.get("awards", 0),
            "greenery": vp.get("greenery", 0),
            "city": vp.get("city", 0),
            "cards": vp.get("victoryPoints", 0),
            "planetary_tracks": vp.get("planetaryTracks", 0),
            "escape_velocity": vp.get("escapeVelocity", 0),
            "negative": vp.get("negativeVP", 0),
        },
        "milestone_details": vp.get("detailsMilestones", []),
        "award_details": vp.get("detailsAwards", []),
        "production": {
            "mc": p.get("megaCreditProduction", 0),
            "steel": p.get("steelProduction", 0),
            "titanium": p.get("titaniumProduction", 0),
            "plants": p.get("plantProduction", 0),
            "energy": p.get("energyProduction", 0),
            "heat": p.get("heatProduction", 0),
        },
        "resources": {
            "mc": p.get("megaCredits", 0),
            "steel": p.get("steel", 0),
            "titanium": p.get("titanium", 0),
            "plants": p.get("plants", 0),
            "energy": p.get("energy", 0),
            "heat": p.get("heat", 0),
        },
        "tags": dict(tag_counts),
        "actions_total": p.get("actionsTakenThisGame", 0),
        "timer": p.get("timer", {}),
    }


TILE_NAMES = {
    0: "greenery", 1: "ocean", 2: "city", 3: "capital", 4: "commercial_district",
    5: "ecological_zone", 6: "nuclear_zone", 7: "industrial_center", 8: "lava_flows",
    9: "mining_area", 10: "mining_rights", 11: "natural_preserve", 12: "restricted_area",
    13: "mohole_area", 14: "research_outpost", 15: "dawn_city",
    43: "new_holland",  # Pathfinder tiles have higher IDs
}


def parse_map(spaces: list) -> dict:
    """Parse map spaces into tile placement summary."""
    tiles_by_color = defaultdict(lambda: defaultdict(int))  # color -> {type -> count}
    all_tiles = []

    for s in spaces:
        tile_type = s.get("tileType")
        if tile_type is None:
            continue
        color = s.get("color", "neutral")
        tile_name = TILE_NAMES.get(tile_type, f"tile_{tile_type}")
        x, y = s.get("x", -1), s.get("y", -1)

        tiles_by_color[color][tile_name] += 1
        all_tiles.append({
            "type": tile_name,
            "color": color,
            "x": x,
            "y": y,
        })

    # Count per player
    summary = {}
    for color, types in tiles_by_color.items():
        summary[color] = dict(types)

    return {
        "tiles": all_tiles,
        "by_player": summary,
        "total_tiles": len(all_tiles),
    }


def parse_milestones(milestones: list) -> list:
    """Parse milestone data."""
    result = []
    for m in milestones:
        entry = {"name": m.get("name", "")}
        if "playerName" in m:
            entry["claimed_by"] = m["playerName"]
            entry["color"] = m.get("color", "")
        result.append(entry)
    return result


def parse_awards(awards: list) -> list:
    """Parse award data."""
    result = []
    for a in awards:
        entry = {
            "name": a.get("name", ""),
            "scores": a.get("scores", []),
        }
        if "playerName" in a:
            entry["funded_by"] = a["playerName"]
            entry["color"] = a.get("color", "")
        result.append(entry)
    return result


# ─── Commands ───────────────────────────────────────────────────────────

def cmd_add(args):
    """Add a game to the database."""
    db = load_db()

    for identifier in args.ids:
        print(f"\n{Fore.CYAN}Загрузка: {identifier}...{Style.RESET_ALL}")

        record = resolve_game(identifier)
        if not record:
            print(f"  {Fore.RED}Не удалось загрузить игру{Style.RESET_ALL}")
            continue

        game_id = record["game_id"]

        if game_id in db["games"] and not args.force:
            print(f"  {Fore.YELLOW}Игра {game_id} уже в базе (--force для перезаписи){Style.RESET_ALL}")
            continue

        if record["phase"] != "end":
            print(f"  {Fore.YELLOW}Игра ещё не завершена (phase: {record['phase']}){Style.RESET_ALL}")
            if not args.force:
                continue

        db["games"][game_id] = record

        winner = next((p for p in record["players"] if p["winner"]), None)
        print(f"  {Fore.GREEN}Добавлена: {game_id}{Style.RESET_ALL}")
        print(f"  Gen {record['generation']} | {record['player_count']}P | Board: {record['board']}")
        if winner:
            print(f"  Победитель: {winner['name']} ({winner['total_vp']} VP)")
        for p in record["players"]:
            marker = f"{Fore.GREEN}★{Style.RESET_ALL}" if p["winner"] else " "
            print(f"    {marker} {p['name']:20s} {p['total_vp']:>3d} VP | TR {p['tr']} | {p['tableau_size']} cards")

        time.sleep(1.5)  # Rate limit

    save_db(db)
    print(f"\n{Fore.GREEN}База: {len(db['games'])} игр{Style.RESET_ALL}")


def cmd_show(args):
    """Show details for a specific game."""
    db = load_db()
    evals = load_evaluations()

    game_id = args.game_id
    if game_id not in db["games"]:
        # Try partial match
        matches = [k for k in db["games"] if game_id in k]
        if len(matches) == 1:
            game_id = matches[0]
        else:
            print(f"{Fore.RED}Игра {game_id} не найдена в базе{Style.RESET_ALL}")
            return

    record = db["games"][game_id]
    print_game_report(record, evals)


def cmd_stats(args):
    """Show aggregate statistics."""
    db = load_db()
    evals = load_evaluations()
    games = list(db["games"].values())

    if not games:
        print(f"{Fore.YELLOW}База пуста. Добавьте игры: tm_game_analyzer.py add <id>{Style.RESET_ALL}")
        return

    print(f"\n{Fore.CYAN}{'═' * 60}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}  TM Game Analyzer — {len(games)} игр{Style.RESET_ALL}")
    print(f"{Fore.CYAN}{'═' * 60}{Style.RESET_ALL}")

    # General stats
    total_players = sum(g["player_count"] for g in games)
    avg_gen = sum(g["generation"] for g in games) / len(games)
    print(f"\n  Игроков: {total_players} | Ср. поколений: {avg_gen:.1f}")

    # Board distribution
    boards = defaultdict(int)
    for g in games:
        boards[g["board"]] += 1
    print(f"  Карты: {', '.join(f'{b} ({c})' for b, c in sorted(boards.items(), key=lambda x: -x[1]))}")

    # Card statistics
    card_stats = aggregate_card_stats(games, evals)

    # Most played cards
    print(f"\n{Fore.YELLOW}  Топ-20 самых играемых карт:{Style.RESET_ALL}")
    print(f"  {'Карта':35s} {'Played':>6s} {'Win%':>5s} {'AvgVP':>6s} {'Score':>5s} {'Tier':>4s}")
    print(f"  {'─' * 65}")

    sorted_by_played = sorted(card_stats.items(), key=lambda x: -x[1]["played"])
    for name, st in sorted_by_played[:20]:
        ev = evals.get(name, {})
        score = ev.get("score", "—")
        tier = ev.get("tier", "—")
        win_pct = (st["wins"] / st["played"] * 100) if st["played"] > 0 else 0
        avg_vp = st["total_vp"] / st["played"] if st["played"] > 0 else 0
        color = tier_color(tier)
        print(f"  {name:35s} {st['played']:>6d} {win_pct:>4.0f}% {avg_vp:>+5.1f} {str(score):>5s} {color}{tier:>4s}{Style.RESET_ALL}")

    # Highest win rate (min 2 games)
    min_games = max(2, len(games) // 3)
    frequent = {k: v for k, v in card_stats.items() if v["played"] >= min_games}

    if frequent:
        print(f"\n{Fore.GREEN}  Карты с лучшим win% (мин. {min_games} игр):{Style.RESET_ALL}")
        print(f"  {'Карта':35s} {'Played':>6s} {'Win%':>5s} {'AvgVP':>6s} {'Score':>5s}")
        print(f"  {'─' * 60}")
        sorted_by_wr = sorted(frequent.items(), key=lambda x: -(x[1]["wins"] / x[1]["played"]))
        for name, st in sorted_by_wr[:15]:
            ev = evals.get(name, {})
            score = ev.get("score", "—")
            win_pct = st["wins"] / st["played"] * 100
            avg_vp = st["total_vp"] / st["played"]
            print(f"  {name:35s} {st['played']:>6d} {win_pct:>4.0f}% {avg_vp:>+5.1f} {str(score):>5s}")

    # Stats by card type
    for type_name, type_label in [("corporation", "Корпорации"), ("prelude", "Прелюдии"), ("ceo", "CEO")]:
        type_stats = aggregate_by_type(games, evals, type_name)
        if type_stats:
            print(f"\n{Fore.CYAN}  {type_label}:{Style.RESET_ALL}")
            print(f"  {'Название':30s} {'Played':>6s} {'Win%':>5s} {'AvgVP':>6s} {'Score':>5s}")
            print(f"  {'─' * 55}")
            for name, st in sorted(type_stats.items(), key=lambda x: -x[1]["played"]):
                ev = evals.get(name, {})
                score = ev.get("score", "—")
                win_pct = st["wins"] / st["played"] * 100 if st["played"] > 0 else 0
                avg_vp = st["total_vp"] / st["played"] if st["played"] > 0 else 0
                print(f"  {name:30s} {st['played']:>6d} {win_pct:>4.0f}% {avg_vp:>5.0f} {str(score):>5s}")


def cmd_compare(args):
    """Compare evaluations vs actual game performance."""
    db = load_db()
    evals = load_evaluations()
    games = list(db["games"].values())

    if not games:
        print(f"{Fore.YELLOW}База пуста.{Style.RESET_ALL}")
        return

    card_stats = aggregate_card_stats(games, evals)
    min_games = max(2, len(games) // 3)
    frequent = {k: v for k, v in card_stats.items() if v["played"] >= min_games}

    if not frequent:
        print(f"{Fore.YELLOW}Недостаточно данных (нужно больше игр){Style.RESET_ALL}")
        return

    print(f"\n{Fore.CYAN}{'═' * 70}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}  Сравнение оценок vs реальные данные ({len(games)} игр, мин. {min_games} появлений){Style.RESET_ALL}")
    print(f"{Fore.CYAN}{'═' * 70}{Style.RESET_ALL}")

    # Calculate "actual performance score"
    comparisons = []
    for name, st in frequent.items():
        ev = evals.get(name, {})
        if not ev or "score" not in ev:
            continue
        our_score = ev["score"]
        win_pct = st["wins"] / st["played"] * 100
        avg_vp = st["total_vp"] / st["played"]

        # Simple performance metric: combination of win rate and VP contribution
        # Normalize: average win rate in 3P = 33.3%, avg VP per card is small
        perf = win_pct * 0.6 + min(avg_vp * 3, 30) * 0.4  # rough composite

        comparisons.append({
            "name": name,
            "our_score": our_score,
            "our_tier": ev.get("tier", "?"),
            "win_pct": win_pct,
            "avg_vp": avg_vp,
            "played": st["played"],
            "perf": perf,
            "delta": perf - our_score * 0.7,  # rough comparison
        })

    # Sort by biggest positive delta (underrated)
    comparisons.sort(key=lambda x: -x["delta"])

    print(f"\n{Fore.GREEN}  Возможно НЕДООЦЕНЕНЫ (играют лучше оценки):{Style.RESET_ALL}")
    print(f"  {'Карта':30s} {'Score':>5s} {'Tier':>4s} {'Win%':>5s} {'AvgVP':>6s} {'Played':>6s}")
    print(f"  {'─' * 60}")
    shown = 0
    for c in comparisons:
        if c["delta"] > 5 and shown < 15:
            color = tier_color(c["our_tier"])
            print(f"  {c['name']:30s} {c['our_score']:>5d} {color}{c['our_tier']:>4s}{Style.RESET_ALL} {c['win_pct']:>4.0f}% {c['avg_vp']:>+5.1f} {c['played']:>6d}  {Fore.GREEN}↑{Style.RESET_ALL}")
            shown += 1

    # Sort by biggest negative delta (overrated)
    comparisons.sort(key=lambda x: x["delta"])

    print(f"\n{Fore.RED}  Возможно ПЕРЕОЦЕНЕНЫ (играют хуже оценки):{Style.RESET_ALL}")
    print(f"  {'Карта':30s} {'Score':>5s} {'Tier':>4s} {'Win%':>5s} {'AvgVP':>6s} {'Played':>6s}")
    print(f"  {'─' * 60}")
    shown = 0
    for c in comparisons:
        if c["delta"] < -5 and shown < 15:
            color = tier_color(c["our_tier"])
            print(f"  {c['name']:30s} {c['our_score']:>5d} {color}{c['our_tier']:>4s}{Style.RESET_ALL} {c['win_pct']:>4.0f}% {c['avg_vp']:>+5.1f} {c['played']:>6d}  {Fore.RED}↓{Style.RESET_ALL}")
            shown += 1


def cmd_review(args):
    """Show cards that need evaluation review based on game data."""
    db = load_db()
    evals = load_evaluations()
    games = list(db["games"].values())

    if not games:
        print(f"{Fore.YELLOW}База пуста.{Style.RESET_ALL}")
        return

    card_stats = aggregate_card_stats(games, evals)
    min_games = max(2, len(games) // 3)

    print(f"\n{Fore.CYAN}{'═' * 70}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}  Карты для ревью оценок ({len(games)} игр){Style.RESET_ALL}")
    print(f"{Fore.CYAN}{'═' * 70}{Style.RESET_ALL}")

    reviews = []
    for name, st in card_stats.items():
        if st["played"] < min_games:
            continue
        ev = evals.get(name, {})
        if not ev or "score" not in ev:
            continue

        our_score = ev["score"]
        our_tier = ev.get("tier", "?")
        win_pct = st["wins"] / st["played"] * 100
        avg_vp = st["total_vp"] / st["played"]
        avg_vp_in_wins = st["vp_in_wins"] / st["wins"] if st["wins"] > 0 else 0

        # Flag conditions for review
        flags = []

        # High score but low win rate
        if our_score >= 75 and win_pct < 25:
            flags.append(f"Score {our_score} но win% только {win_pct:.0f}%")

        # Low score but high win rate
        if our_score <= 60 and win_pct > 50:
            flags.append(f"Score {our_score} но win% = {win_pct:.0f}%")

        # High VP earner despite low score
        if our_score <= 60 and avg_vp > 3:
            flags.append(f"Score {our_score} но avg VP = {avg_vp:+.1f}")

        # Card VP much higher in winning games
        if st["wins"] > 0 and avg_vp_in_wins > avg_vp * 1.5 and avg_vp_in_wins > 3:
            flags.append(f"VP в победах ({avg_vp_in_wins:.1f}) >> средний ({avg_vp:.1f})")

        if flags:
            reviews.append({
                "name": name,
                "score": our_score,
                "tier": our_tier,
                "win_pct": win_pct,
                "avg_vp": avg_vp,
                "played": st["played"],
                "flags": flags,
            })

    reviews.sort(key=lambda x: len(x["flags"]), reverse=True)

    if not reviews:
        print(f"\n  {Fore.GREEN}Все оценки consistent с игровыми данными!{Style.RESET_ALL}")
        return

    for r in reviews[:20]:
        color = tier_color(r["tier"])
        print(f"\n  {r['name']} — {color}{r['tier']}-{r['score']}{Style.RESET_ALL} (played {r['played']}x, win {r['win_pct']:.0f}%, avg VP {r['avg_vp']:+.1f})")
        for flag in r["flags"]:
            print(f"    {Fore.YELLOW}⚠ {flag}{Style.RESET_ALL}")


def cmd_list(args):
    """List all games in database."""
    db = load_db()

    if not db["games"]:
        print(f"{Fore.YELLOW}База пуста.{Style.RESET_ALL}")
        return

    print(f"\n{Fore.CYAN}  {'ID':20s} {'Gen':>3s} {'P':>1s} {'Board':20s} {'Winner':20s} {'VP':>4s} {'Дата'}{Style.RESET_ALL}")
    print(f"  {'─' * 80}")

    for gid, g in sorted(db["games"].items(), key=lambda x: x[1].get("fetched_at", "")):
        winner = next((p for p in g["players"] if p.get("winner")), {})
        fetched = g.get("fetched_at", "")[:10]
        print(f"  {gid:20s} {g['generation']:>3d} {g['player_count']:>1d} {g['board']:20s} {winner.get('name', '?'):20s} {winner.get('total_vp', 0):>4d} {fetched}")

    print(f"\n  Всего: {len(db['games'])} игр")


# ─── Aggregation ────────────────────────────────────────────────────────

def aggregate_card_stats(games: list, evals: dict) -> dict:
    """Aggregate card statistics across all games."""
    stats = defaultdict(lambda: {
        "played": 0, "wins": 0, "total_vp": 0, "vp_in_wins": 0,
        "vp_list": [], "win_vp_list": [],
    })

    for game in games:
        for player in game["players"]:
            is_winner = player.get("winner", False)
            for card_name in player["tableau"]:
                st = stats[card_name]
                st["played"] += 1
                if is_winner:
                    st["wins"] += 1

                # VP from this card
                card_vp = player.get("card_vp", {}).get(card_name, 0)
                st["total_vp"] += card_vp
                st["vp_list"].append(card_vp)
                if is_winner:
                    st["vp_in_wins"] += card_vp
                    st["win_vp_list"].append(card_vp)

    return dict(stats)


def aggregate_by_type(games: list, evals: dict, card_type: str) -> dict:
    """Aggregate statistics for a specific card type (corporation, prelude, ceo, etc.)."""
    stats = defaultdict(lambda: {"played": 0, "wins": 0, "total_vp": 0})
    types = get_card_types()

    for game in games:
        for player in game["players"]:
            is_winner = player.get("winner", False)
            for card_name in player["tableau"]:
                if types.get(card_name) == card_type:
                    st = stats[card_name]
                    st["played"] += 1
                    if is_winner:
                        st["wins"] += 1
                    st["total_vp"] += player["total_vp"]

    return dict(stats)


def aggregate_corp_stats(games: list, evals: dict) -> dict:
    """Aggregate corporation statistics."""
    return aggregate_by_type(games, evals, "corporation")


# ─── Display ────────────────────────────────────────────────────────────

def tier_color(tier: str) -> str:
    """Color for tier letter."""
    return {
        "S": Fore.RED,
        "A": Fore.YELLOW,
        "B": Fore.GREEN,
        "C": Fore.CYAN,
        "D": Fore.WHITE,
        "F": Fore.LIGHTBLACK_EX,
    }.get(tier, "")


def print_game_report(record: dict, evals: dict):
    """Print a formatted game report."""
    print(f"\n{Fore.CYAN}{'═' * 60}{Style.RESET_ALL}")
    print(f"{Fore.CYAN}  Игра: {record['game_id']}{Style.RESET_ALL}")
    print(f"  Gen {record['generation']} | {record['player_count']}P | {record['board']}")
    exps = ", ".join(k for k, v in record.get("expansions", {}).items() if v)
    print(f"  Допы: {exps}")
    print(f"{Fore.CYAN}{'═' * 60}{Style.RESET_ALL}")

    for p in record["players"]:
        marker = f"{Fore.GREEN}★ WINNER{Style.RESET_ALL}" if p["winner"] else ""
        print(f"\n  {Fore.YELLOW}{p['name']}{Style.RESET_ALL} ({p['color']}) — {p['total_vp']} VP {marker}")

        vp = p["vp_breakdown"]
        print(f"    TR: {vp['tr']} | Cards: {vp['cards']} | Greenery: {vp['greenery']} | City: {vp['city']}")
        print(f"    Milestones: {vp['milestones']} | Awards: {vp['awards']} | Neg: {vp['negative']}")

        # Top VP cards
        if p["card_vp"]:
            top_cards = sorted(p["card_vp"].items(), key=lambda x: -x[1])[:10]
            if top_cards:
                print(f"    Топ VP карты:")
                for cname, cvp in top_cards:
                    if cvp <= 0:
                        continue
                    ev = evals.get(cname, {})
                    score = ev.get("score", "—")
                    tier = ev.get("tier", "—")
                    color = tier_color(tier)
                    print(f"      {cvp:>+3d} VP  {cname:30s} {color}[{tier}-{score}]{Style.RESET_ALL}")

        # Card resources
        card_res = p.get("card_resources", {})
        if card_res:
            print(f"    Ресурсы на картах:")
            for cname, count in sorted(card_res.items(), key=lambda x: -x[1]):
                print(f"      {count:>3d}  {cname}")

        # Production
        prod = p["production"]
        print(f"    Prod: MC={prod['mc']} St={prod['steel']} Ti={prod['titanium']} Pl={prod['plants']} En={prod['energy']} He={prod['heat']}")

        # Leftover resources
        res = p.get("resources", {})
        leftover = res.get("mc", 0) + res.get("steel", 0) * 2 + res.get("titanium", 0) * 3
        if leftover > 20:
            print(f"    {Fore.YELLOW}Остаток ресурсов: MC={res['mc']} St={res['steel']} Ti={res['titanium']} (~{leftover} MC){Style.RESET_ALL}")

    # Globals
    gl = record["globals_final"]
    print(f"\n  Finals: Temp={gl['temperature']}°C O₂={gl['oxygen']}% Oceans={gl['oceans']} Venus={gl['venus']}%")

    # Map summary
    map_tiles = record.get("map_tiles", {})
    if map_tiles:
        by_player = map_tiles.get("by_player", {})
        print(f"\n  {Fore.CYAN}Карта ({map_tiles.get('total_tiles', 0)} тайлов):{Style.RESET_ALL}")
        for color, types in by_player.items():
            g_count = types.get("greenery", 0)
            c_count = types.get("city", 0)
            o_count = types.get("ocean", 0)
            special = {k: v for k, v in types.items() if k not in ("greenery", "city", "ocean")}
            special_str = f" + {special}" if special else ""
            print(f"    {color:8s}: {g_count} greenery, {c_count} city, {o_count} ocean{special_str}")

    # Milestones & Awards
    milestones = record.get("milestones", [])
    claimed = [m for m in milestones if "claimed_by" in m]
    if claimed:
        ms_strs = [m["name"] + " (" + m["claimed_by"] + ")" for m in claimed]
        print(f"\n  Milestones: {', '.join(ms_strs)}")

    awards = record.get("awards", [])
    funded = [a for a in awards if "funded_by" in a]
    if funded:
        aw_strs = [a["name"] + " (" + a["funded_by"] + ")" for a in funded]
        print(f"  Awards: {', '.join(aw_strs)}")


# ─── Main ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="TM Game Analyzer")
    sub = parser.add_subparsers(dest="command")

    # add
    p_add = sub.add_parser("add", help="Добавить игру(ы)")
    p_add.add_argument("ids", nargs="+", help="Game/Player/Spectator IDs")
    p_add.add_argument("--force", "-f", action="store_true", help="Перезаписать существующие")

    # show
    p_show = sub.add_parser("show", help="Показать детали игры")
    p_show.add_argument("game_id", help="Game ID")

    # list
    sub.add_parser("list", help="Список всех игр")

    # stats
    sub.add_parser("stats", help="Агрегатная статистика")

    # compare
    sub.add_parser("compare", help="Сравнить оценки vs реальность")

    # review
    sub.add_parser("review", help="Карты для ревью оценок")

    args = parser.parse_args()

    if args.command == "add":
        cmd_add(args)
    elif args.command == "show":
        cmd_show(args)
    elif args.command == "list":
        cmd_list(args)
    elif args.command == "stats":
        cmd_stats(args)
    elif args.command == "compare":
        cmd_compare(args)
    elif args.command == "review":
        cmd_review(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
