#!/usr/bin/env python3
"""
TM Discord Bot — собирает ссылки на игры из Discord и анализирует их.

Установка:
    pip install discord.py

Запуск:
    python scripts/tm_discord_bot.py

Токен берётся из:
    1. Переменная окружения TM_DISCORD_TOKEN
    2. Файл .env в корне проекта (TM_DISCORD_TOKEN=...)
    3. Файл data/discord_token.txt

Команды бота:
    !tm add <game_id/url>     — добавить игру вручную
    !tm show <game_id>        — показать отчёт по игре
    !tm stats                 — агрегатная статистика
    !tm list                  — список всех игр
    !tm last                  — последняя добавленная игра
    !tm offers [card]         — "when option" статистика

Автоматически ловит ссылки вида:
    https://terraforming-mars.herokuapp.com/game?id=...
"""

import os
import re
import sys
import asyncio
import logging
from datetime import datetime

import discord
from discord.ext import commands

# Add parent dir to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tm_game_analyzer import (
    resolve_game, load_db, save_db, load_evaluations,
    aggregate_card_stats, aggregate_by_type, get_card_types,
    aggregate_player_stats, find_player, tier_color,
    load_offers_log, aggregate_offer_stats,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("tm-bot")

# ─── Config ─────────────────────────────────────────────────────────────

PROJECT_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

GAME_URL_PATTERN = re.compile(
    r"terraforming-mars\.herokuapp\.com/(?:game|player)\?id=([a-z0-9]+)",
    re.IGNORECASE,
)

TIER_EMOJI = {"S": "🔴", "A": "🟠", "B": "🟡", "C": "🟢", "D": "⚪", "F": "⬛"}


def get_token() -> str:
    """Load bot token from env, .env file, or token file."""
    # 1. Environment variable
    token = os.environ.get("TM_DISCORD_TOKEN")
    if token:
        return token

    # 2. .env file
    env_path = os.path.join(PROJECT_ROOT, ".env")
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if line.startswith("TM_DISCORD_TOKEN="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")

    # 3. Token file
    token_path = os.path.join(PROJECT_ROOT, "data", "discord_token.txt")
    if os.path.exists(token_path):
        with open(token_path, "r") as f:
            return f.read().strip()

    return ""


# ─── Formatting ─────────────────────────────────────────────────────────

def format_game_short(record: dict) -> str:
    """Format a game record as a short Discord message."""
    game_id = record["game_id"]
    gen = record["generation"]
    board = record["board"]
    pc = record["player_count"]

    lines = [f"**{game_id}** — Gen {gen} | {pc}P | {board}"]

    for p in record["players"]:
        marker = "👑" if p.get("winner") else "  "
        name = p["name"]
        vp = p["total_vp"]
        tr = p["tr"]
        cards = p["tableau_size"]
        lines.append(f"{marker} **{name}** — {vp} VP (TR {tr}, {cards} cards)")

    return "\n".join(lines)


def format_game_detail(record: dict, evals: dict) -> str:
    """Format a detailed game report for Discord."""
    lines = []
    game_id = record["game_id"]
    gen = record["generation"]
    board = record["board"]
    exps = ", ".join(k for k, v in record.get("expansions", {}).items() if v)

    lines.append(f"## 🎮 Игра: {game_id}")
    lines.append(f"Gen {gen} | {record['player_count']}P | {board}")
    lines.append(f"Допы: {exps}")
    lines.append("")

    for p in record["players"]:
        marker = "👑 **WINNER**" if p.get("winner") else ""
        lines.append(f"### {p['name']} ({p['color']}) — {p['total_vp']} VP {marker}")

        vp = p["vp_breakdown"]
        lines.append(f"TR: {vp['tr']} | Cards: {vp['cards']} | Greenery: {vp['greenery']} | City: {vp['city']} | MS: {vp['milestones']} | AW: {vp['awards']}")

        # Top VP cards
        if p["card_vp"]:
            top = sorted(p["card_vp"].items(), key=lambda x: -x[1])[:8]
            card_lines = []
            for cname, cvp in top:
                if cvp <= 0:
                    continue
                ev = evals.get(cname, {})
                tier = ev.get("tier", "?")
                score = ev.get("score", "?")
                emoji = TIER_EMOJI.get(tier, "")
                card_lines.append(f"`{cvp:>+3d}` {cname} {emoji}{tier}-{score}")
            if card_lines:
                lines.append("Top VP: " + " | ".join(card_lines[:5]))

        # Card resources
        card_res = p.get("card_resources", {})
        if card_res:
            res_items = sorted(card_res.items(), key=lambda x: -x[1])[:5]
            res_str = ", ".join(f"{name} ({count})" for name, count in res_items)
            lines.append(f"Resources: {res_str}")

        lines.append("")

    # Map summary
    map_tiles = record.get("map_tiles", {})
    if map_tiles:
        by_player = map_tiles.get("by_player", {})
        map_parts = []
        for color, types in by_player.items():
            if color == "neutral":
                continue
            g = types.get("greenery", 0)
            c = types.get("city", 0)
            map_parts.append(f"{color}: {g}G/{c}C")
        if map_parts:
            lines.append(f"🗺️ Map: {' | '.join(map_parts)}")

    # Milestones & Awards
    milestones = record.get("milestones", [])
    claimed = [m for m in milestones if "claimed_by" in m]
    if claimed:
        lines.append("🏅 MS: " + ", ".join(m["name"] + " (" + m["claimed_by"] + ")" for m in claimed))

    awards = record.get("awards", [])
    funded = [a for a in awards if "funded_by" in a]
    if funded:
        lines.append("🏆 AW: " + ", ".join(a["name"] + " (" + a["funded_by"] + ")" for a in funded))

    return "\n".join(lines)


def format_stats(games: list, evals: dict) -> str:
    """Format aggregate statistics for Discord."""
    lines = []
    lines.append(f"## 📊 Статистика — {len(games)} игр")

    total_players = sum(g["player_count"] for g in games)
    avg_gen = sum(g["generation"] for g in games) / len(games)
    lines.append(f"Игроков: {total_players} | Ср. поколений: {avg_gen:.1f}")

    card_stats = aggregate_card_stats(games, evals)

    # Top played
    sorted_cards = sorted(card_stats.items(), key=lambda x: -x[1]["played"])[:15]
    lines.append("")
    lines.append("**Топ-15 карт:**")
    lines.append("```")
    lines.append(f"{'Карта':32s} {'#':>3s} {'Win%':>5s} {'VP':>5s} {'Tier':>4s}")
    for name, st in sorted_cards:
        ev = evals.get(name, {})
        tier = ev.get("tier", "?")
        score = ev.get("score", "?")
        win_pct = st["wins"] / st["played"] * 100 if st["played"] > 0 else 0
        avg_vp = st["total_vp"] / st["played"] if st["played"] > 0 else 0
        lines.append(f"{name:32s} {st['played']:>3d} {win_pct:>4.0f}% {avg_vp:>+4.1f} {tier}-{score}")
    lines.append("```")

    # Corps
    corp_stats = aggregate_by_type(games, evals, "corporation")
    if corp_stats:
        sorted_corps = sorted(corp_stats.items(), key=lambda x: -x[1]["played"])[:10]
        lines.append("")
        lines.append("**Корпорации:**")
        lines.append("```")
        for name, st in sorted_corps:
            ev = evals.get(name, {})
            score = ev.get("score", "?")
            win_pct = st["wins"] / st["played"] * 100 if st["played"] > 0 else 0
            lines.append(f"{name:28s} {st['played']:>2d}x {win_pct:>4.0f}% avg {st['total_vp']//st['played']:>3d}VP [{score}]")
        lines.append("```")

    return "\n".join(lines)


# ─── Bot ────────────────────────────────────────────────────────────────

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!tm ", intents=intents)

# Lock for DB writes
db_lock = asyncio.Lock()


async def add_game_async(game_id: str) -> dict | None:
    """Add a game to the database (async wrapper)."""
    loop = asyncio.get_event_loop()
    record = await loop.run_in_executor(None, resolve_game, game_id)
    if not record:
        return None

    async with db_lock:
        db = await loop.run_in_executor(None, load_db)
        actual_id = record["game_id"]
        if actual_id in db["games"]:
            return record  # Already exists, return existing
        db["games"][actual_id] = record
        await loop.run_in_executor(None, save_db, db)

    return record


@bot.event
async def on_ready():
    log.info(f"Bot connected as {bot.user} (id: {bot.user.id})")
    log.info(f"Servers: {[g.name for g in bot.guilds]}")


@bot.event
async def on_message(message: discord.Message):
    # Don't respond to self
    if message.author == bot.user:
        return

    # Check for game URLs in message
    matches = GAME_URL_PATTERN.findall(message.content)
    if matches:
        for game_id in matches:
            # Add prefix if missing
            if not game_id.startswith(("g", "p", "s")):
                continue

            log.info(f"Found game link: {game_id} from {message.author}")

            try:
                async with message.channel.typing():
                    record = await add_game_async(game_id)

                if record:
                    text = format_game_short(record)
                    await message.reply(f"✅ Игра добавлена!\n{text}", mention_author=False)
                else:
                    await message.add_reaction("❌")
            except Exception as e:
                log.error(f"Error adding game {game_id}: {e}")
                await message.add_reaction("⚠️")

    # Process commands
    await bot.process_commands(message)


@bot.command(name="add")
async def cmd_add(ctx: commands.Context, identifier: str):
    """Добавить игру вручную: !tm add <game_id или URL>"""
    # Extract game ID from URL if needed
    match = GAME_URL_PATTERN.search(identifier)
    game_id = match.group(1) if match else identifier

    async with ctx.typing():
        record = await add_game_async(game_id)

    if record:
        evals = load_evaluations()
        text = format_game_detail(record, evals)
        # Discord message limit is 2000 chars
        if len(text) > 1900:
            text = text[:1900] + "\n..."
        await ctx.reply(text, mention_author=False)
    else:
        await ctx.reply(f"❌ Не удалось загрузить игру `{game_id}`", mention_author=False)


@bot.command(name="show")
async def cmd_show(ctx: commands.Context, game_id: str):
    """Показать детали игры: !tm show <game_id>"""
    db = load_db()
    evals = load_evaluations()

    # Try exact match or partial
    if game_id not in db["games"]:
        matches = [k for k in db["games"] if game_id in k]
        if len(matches) == 1:
            game_id = matches[0]
        else:
            await ctx.reply(f"❌ Игра `{game_id}` не найдена (всего {len(db['games'])} игр)", mention_author=False)
            return

    record = db["games"][game_id]
    text = format_game_detail(record, evals)
    if len(text) > 1900:
        text = text[:1900] + "\n..."
    await ctx.reply(text, mention_author=False)


@bot.command(name="stats")
async def cmd_stats(ctx: commands.Context):
    """Агрегатная статистика: !tm stats"""
    db = load_db()
    evals = load_evaluations()
    games = list(db["games"].values())

    if not games:
        await ctx.reply("❌ База пуста", mention_author=False)
        return

    text = format_stats(games, evals)
    if len(text) > 1900:
        text = text[:1900] + "\n..."
    await ctx.reply(text, mention_author=False)


@bot.command(name="list")
async def cmd_list(ctx: commands.Context):
    """Список игр: !tm list"""
    db = load_db()
    games = db.get("games", {})

    if not games:
        await ctx.reply("❌ База пуста", mention_author=False)
        return

    lines = [f"**📋 {len(games)} игр в базе:**", "```"]
    for gid, g in sorted(games.items(), key=lambda x: x[1].get("fetched_at", ""), reverse=True):
        winner = next((p for p in g["players"] if p.get("winner")), {})
        lines.append(f"{gid[:16]:16s} G{g['generation']:>2d} {g['player_count']}P {winner.get('name', '?'):12s} {winner.get('total_vp', 0):>3d}VP")
    lines.append("```")

    text = "\n".join(lines)
    if len(text) > 1900:
        text = text[:1900] + "\n...```"
    await ctx.reply(text, mention_author=False)


@bot.command(name="last")
async def cmd_last(ctx: commands.Context):
    """Последняя добавленная игра: !tm last"""
    db = load_db()
    games = db.get("games", {})

    if not games:
        await ctx.reply("❌ База пуста", mention_author=False)
        return

    # Get most recently fetched
    last_id = max(games, key=lambda k: games[k].get("fetched_at", ""))
    record = games[last_id]
    evals = load_evaluations()
    text = format_game_detail(record, evals)
    if len(text) > 1900:
        text = text[:1900] + "\n..."
    await ctx.reply(text, mention_author=False)


@bot.command(name="card")
async def cmd_card(ctx: commands.Context, *, card_name: str):
    """Статистика карты: !tm card <название>"""
    db = load_db()
    evals = load_evaluations()
    games = list(db["games"].values())

    if not games:
        await ctx.reply("❌ База пуста", mention_author=False)
        return

    # Find card (case-insensitive partial match)
    card_stats = aggregate_card_stats(games, evals)
    name_lower = card_name.lower()
    matches = [(k, v) for k, v in card_stats.items() if name_lower in k.lower()]

    if not matches:
        await ctx.reply(f"❌ Карта `{card_name}` не найдена в игровых данных", mention_author=False)
        return

    lines = []
    for name, st in sorted(matches, key=lambda x: -x[1]["played"])[:5]:
        ev = evals.get(name, {})
        tier = ev.get("tier", "?")
        score = ev.get("score", "?")
        emoji = TIER_EMOJI.get(tier, "")
        win_pct = st["wins"] / st["played"] * 100 if st["played"] > 0 else 0
        avg_vp = st["total_vp"] / st["played"] if st["played"] > 0 else 0

        lines.append(f"**{name}** {emoji} {tier}-{score}")
        lines.append(f"Played: {st['played']} | Win: {win_pct:.0f}% | Avg VP: {avg_vp:+.1f}")

        # Show which games
        game_appearances = []
        for g in games:
            for p in g["players"]:
                if name in p["tableau"]:
                    marker = "👑" if p.get("winner") else ""
                    cvp = p.get("card_vp", {}).get(name, 0)
                    game_appearances.append(f"{p['name']}{marker} ({cvp:+d}VP)")
        if game_appearances:
            lines.append("Games: " + ", ".join(game_appearances[:8]))
        lines.append("")

    text = "\n".join(lines)
    if len(text) > 1900:
        text = text[:1900] + "\n..."
    await ctx.reply(text, mention_author=False)


@bot.command(name="players")
async def cmd_players(ctx: commands.Context):
    """Таблица всех игроков: !tm players"""
    db = load_db()
    games = list(db["games"].values())

    if not games:
        await ctx.reply("❌ База пуста", mention_author=False)
        return

    pstats = aggregate_player_stats(games)
    min_games = 3
    filtered = [(n, s) for n, s in pstats.items() if s["games"] >= min_games]
    filtered.sort(key=lambda x: -x[1]["wins"] / max(x[1]["games"], 1))

    lines = [f"## 👥 Игроки (мин. {min_games} игр) — {len(games)} игр в базе", "```"]
    lines.append(f"{'Имя':18s} {'#':>3s} {'W':>3s} {'Win%':>5s} {'VP':>4s} {'TR':>4s}")
    lines.append("─" * 42)

    for name, st in filtered:
        g = st["games"]
        win_pct = st["wins"] / g * 100
        avg_vp = st["total_vp"] / g
        avg_tr = st["total_tr"] / g
        lines.append(f"{name:18s} {g:>3d} {st['wins']:>3d} {win_pct:>4.0f}% {avg_vp:>4.0f} {avg_tr:>4.0f}")

    lines.append("```")

    if not filtered:
        lines = [f"❌ Нет игроков с {min_games}+ играми"]

    text = "\n".join(lines)
    if len(text) > 1900:
        text = text[:1900] + "\n...```"
    await ctx.reply(text, mention_author=False)


@bot.command(name="player")
async def cmd_player(ctx: commands.Context, *, player_name: str):
    """Статистика игрока: !tm player <name>"""
    db = load_db()
    evals = load_evaluations()
    games = list(db["games"].values())

    if not games:
        await ctx.reply("❌ База пуста", mention_author=False)
        return

    pstats = aggregate_player_stats(games)
    matches = find_player(pstats, player_name)

    if not matches:
        names = ", ".join(sorted(pstats.keys()))
        await ctx.reply(f"❌ Игрок `{player_name}` не найден.\nДоступные: {names[:500]}", mention_author=False)
        return

    if len(matches) > 1:
        names = ", ".join(n for n, _ in matches)
        await ctx.reply(f"Найдено несколько: {names}. Уточните имя.", mention_author=False)
        return

    name, st = matches[0]
    g = st["games"]
    win_pct = st["wins"] / g * 100
    avg_vp = st["total_vp"] / g
    avg_tr = st["total_tr"] / g
    avg_cards = st["total_cards"] / g
    avg_gen = sum(st["generations"]) / g if st["generations"] else 0

    lines = [f"## 🎮 {name} — {g} игр"]
    lines.append(f"**Побед:** {st['wins']} ({win_pct:.0f}%) | **Avg VP:** {avg_vp:.0f} | **Avg TR:** {avg_tr:.0f} | **Avg Cards:** {avg_cards:.0f}")

    # Game sizes
    sizes = ", ".join(f"{k}={v}" for k, v in sorted(st["game_sizes"].items()))
    lines.append(f"Формат: {sizes} | Avg Gen: {avg_gen:.1f}")

    # Corps
    if st["corps"]:
        lines.append("")
        lines.append("**Корпорации:**")
        corp_lines = []
        for corp, count in st["corps"].most_common(8):
            wins = st["corp_wins"].get(corp, 0)
            wr = wins / count * 100
            ev = evals.get(corp, {})
            tier = ev.get("tier", "?")
            emoji = TIER_EMOJI.get(tier, "")
            corp_lines.append(f"{corp} ({count}x, {wins}W {wr:.0f}%) {emoji}")
        lines.append(", ".join(corp_lines[:4]))
        if len(corp_lines) > 4:
            lines.append(", ".join(corp_lines[4:8]))

    # Opponents
    if st["opponents"]:
        lines.append("")
        lines.append("**Против:**")
        opp_list = sorted(st["opponents"].items(), key=lambda x: -x[1]["games"])
        opp_strs = []
        for oname, odata in opp_list[:6]:
            w = odata["wins"]
            l = odata["losses"]
            og = odata["games"]
            wr = w / og * 100 if og > 0 else 0
            opp_strs.append(f"vs {oname}: {w}W-{l}L ({wr:.0f}%)")
        lines.append(" | ".join(opp_strs[:3]))
        if len(opp_strs) > 3:
            lines.append(" | ".join(opp_strs[3:6]))

    # Top VP cards
    if st["top_vp_cards"]:
        lines.append("")
        lines.append("**Топ VP карты:**")
        sorted_cards = sorted(st["top_vp_cards"].items(), key=lambda x: -(sum(x[1]) / len(x[1])))
        card_strs = []
        for card, vps in sorted_cards[:6]:
            avg = sum(vps) / len(vps)
            ev = evals.get(card, {})
            tier = ev.get("tier", "?")
            emoji = TIER_EMOJI.get(tier, "")
            card_strs.append(f"{card}: avg {avg:.1f}VP ({len(vps)}x) {emoji}")
        lines.append("\n".join(card_strs[:3]))
        if len(card_strs) > 3:
            lines.append("\n".join(card_strs[3:6]))

    text = "\n".join(lines)
    if len(text) > 1900:
        text = text[:1900] + "\n..."
    await ctx.reply(text, mention_author=False)


@bot.command(name="offers")
async def cmd_offers(ctx: commands.Context, *, card_name: str = ""):
    """'When option' статистика: !tm offers [card_name]"""
    entries = load_offers_log()
    if not entries:
        await ctx.reply("❌ Нет данных offers. Нужно сыграть игры через advisor.", mention_author=False)
        return

    offer_stats = aggregate_offer_stats(entries)
    evals = load_evaluations()
    db = load_db()
    games = list(db["games"].values())
    card_played_stats = aggregate_card_stats(games, evals) if games else {}

    session_ids = set(e.get("game_id") for e in entries)
    game_ends = [e for e in entries if e.get("phase") == "game_end"]

    if card_name:
        # Search for specific card
        card_name_lower = card_name.lower()
        matches = [(n, s) for n, s in offer_stats.items() if card_name_lower in n.lower()]
        if not matches:
            await ctx.reply(f"❌ Карта `{card_name}` не найдена в offers log.", mention_author=False)
            return

        lines = [f"## 📊 When Option — `{card_name}` ({len(session_ids)} сессий)"]
        for name, st in sorted(matches, key=lambda x: -x[1]["sessions_offered"])[:5]:
            pick_pct = st["picked"] / st["offered"] * 100 if st["offered"] > 0 else 0
            win_offer = st["sessions_won"] / st["sessions_offered"] * 100 if st["sessions_offered"] > 0 else 0
            win_pick = st["sessions_won_picked"] / st["sessions_picked"] * 100 if st["sessions_picked"] > 0 else 0
            played_st = card_played_stats.get(name, {})
            win_played = played_st["wins"] / played_st["played"] * 100 if played_st.get("played", 0) > 0 else None

            ev = evals.get(name, {})
            score = ev.get("score", "?")
            tier = ev.get("tier", "?")
            emoji = TIER_EMOJI.get(tier, "")

            lines.append(f"\n**{name}** {emoji} Score: {score}")
            lines.append(f"Offered: {st['sessions_offered']} | Picked: {st['picked']} ({pick_pct:.0f}%)")
            lines.append(f"Win when offered: {win_offer:.0f}% | Win when picked: {win_pick:.0f}%")
            if win_played is not None:
                delta = win_offer - win_played
                bias = "📈 selection bias" if delta < -15 else ""
                lines.append(f"Win when played: {win_played:.0f}% (Δ={delta:+.0f}%) {bias}")
    else:
        # Top overview
        lines = [f"## 📊 When Option — {len(session_ids)} сессий, {len(game_ends)} завершённых"]

        # Top pick rate (min 3 sessions)
        eligible = {n: s for n, s in offer_stats.items() if s["sessions_offered"] >= 3}
        if eligible:
            lines.append("\n**Топ pick rate:**")
            by_pick = sorted(eligible.items(),
                             key=lambda x: -(x[1]["picked"] / x[1]["offered"]) if x[1]["offered"] > 0 else 0)
            for name, st in by_pick[:8]:
                pick_pct = st["picked"] / st["offered"] * 100 if st["offered"] > 0 else 0
                ev = evals.get(name, {})
                tier = ev.get("tier", "?")
                emoji = TIER_EMOJI.get(tier, "")
                lines.append(f"{emoji} {name}: {pick_pct:.0f}% ({st['picked']}/{st['offered']})")

            lines.append("\n**Самые скипаемые:**")
            for name, st in by_pick[-5:]:
                pick_pct = st["picked"] / st["offered"] * 100 if st["offered"] > 0 else 0
                ev = evals.get(name, {})
                tier = ev.get("tier", "?")
                emoji = TIER_EMOJI.get(tier, "")
                lines.append(f"{emoji} {name}: {pick_pct:.0f}% ({st['picked']}/{st['offered']})")

    text = "\n".join(lines)
    if len(text) > 1900:
        text = text[:1900] + "\n..."
    await ctx.reply(text, mention_author=False)


# ─── Main ───────────────────────────────────────────────────────────────

def main():
    token = get_token()
    if not token:
        print("❌ Токен не найден!")
        print()
        print("Укажи токен одним из способов:")
        print("  1. TM_DISCORD_TOKEN=... в переменных окружения")
        print("  2. TM_DISCORD_TOKEN=... в файле .env")
        print("  3. Токен в файле data/discord_token.txt")
        print()
        print("Как получить токен:")
        print("  1. https://discord.com/developers/applications")
        print("  2. New Application → Bot → Reset Token → Copy")
        print("  3. Включи Message Content Intent в Bot settings")
        print("  4. Invite: OAuth2 → URL Generator → bot → Send Messages + Read Messages")
        sys.exit(1)

    log.info("Starting TM Discord Bot...")
    bot.run(token)


if __name__ == "__main__":
    main()
