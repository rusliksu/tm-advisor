#!/usr/bin/env python3
"""
TM Watcher — автономный наблюдатель за чужой игрой.
Логгирует + анализирует решения игроков.

Использование:
    python scripts/tm_watcher.py <player_id>
    python scripts/tm_watcher.py <player_id> --interval 30

Вывод: цветной ANSI-лог в терминал + JSONL файл в data/game_logs/
"""

import sys
import os
import json
import time
import signal
import re
import argparse
from datetime import datetime

import requests
from colorama import init, Fore, Style

init()

BASE_URL = "https://terraforming-mars.herokuapp.com"
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
LOG_DIR = os.path.join(DATA_DIR, "game_logs")


class CardDatabase:
    def __init__(self):
        eval_path = os.path.join(DATA_DIR, "evaluations.json")
        self.cards = {}
        if os.path.exists(eval_path):
            with open(eval_path, "r", encoding="utf-8") as f:
                self.cards = json.load(f)
        self._norm = {re.sub(r"[^a-z0-9]", "", k.lower()): k for k in self.cards}

    def get(self, name):
        if name in self.cards:
            return self.cards[name]
        norm = re.sub(r"[^a-z0-9]", "", name.lower())
        key = self._norm.get(norm)
        return self.cards.get(key) if key else None

    def score(self, name):
        c = self.get(name)
        return c["score"] if c else None

    def tier(self, name):
        c = self.get(name)
        return c["tier"] if c else "?"


def tier_color(tier):
    return {"S": Fore.RED + Style.BRIGHT, "A": Fore.YELLOW + Style.BRIGHT,
            "B": Fore.YELLOW, "C": Fore.GREEN, "D": Fore.WHITE + Style.DIM,
            "F": Fore.WHITE + Style.DIM, "?": Fore.CYAN}.get(tier, "")


class Watcher:
    def __init__(self, player_id, interval=30.0):
        self.player_id = player_id
        self.interval = interval
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "TM-Watcher/1.0"
        self.db = CardDatabase()
        self.running = True

        # Tracking
        self.prev_tableaux: dict[str, list[str]] = {}
        self.prev_milestones: set[str] = set()
        self.prev_awards: set[str] = set()
        self.prev_gen = 0
        self.prev_phase = ""
        self.log_file = None
        self.game_started = False

    def run(self):
        signal.signal(signal.SIGINT, self._shutdown)
        self._print_header("TM Watcher v1.0")
        print(f"  Player ID: {self.player_id[:12]}...")
        print(f"  База: {len(self.db.cards)} карт с оценками")
        print(f"  Интервал: {self.interval}s │ Ctrl+C для выхода\n")

        # Initial fetch
        try:
            data = self._fetch()
        except Exception as e:
            self._log(f"{Fore.RED}Ошибка: {e}{Style.RESET_ALL}")
            return

        game = data.get("game", {})
        game_id = game.get("id", "unknown")
        os.makedirs(LOG_DIR, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_path = os.path.join(LOG_DIR, f"watch_{game_id}_{ts}.jsonl")
        self.log_file = open(log_path, "a", encoding="utf-8")

        players = data.get("players", [])
        board = game.get("gameOptions", {}).get("boardName", "?")
        expansions = game.get("gameOptions", {}).get("expansions", {})
        mods = [k for k, v in expansions.items() if v and k not in ("corpera", "promo")]

        self._log(f"Game: {game_id} │ Board: {board} │ Mods: {', '.join(mods)}")
        self._log(f"Players: {', '.join(p.get('name', '?') for p in players)}")
        self._log("")

        self._update_tracking(data)
        self._analyze_state(data, initial=True)

        while self.running:
            time.sleep(self.interval)
            try:
                data = self._fetch()
            except requests.ConnectionError:
                time.sleep(10)
                continue
            except requests.HTTPError as e:
                if e.response and e.response.status_code == 404:
                    self._log(f"{Fore.RED}Игра завершена или удалена.{Style.RESET_ALL}")
                    break
                time.sleep(10)
                continue

            game = data.get("game", {})
            gen = game.get("generation", 0)
            phase = game.get("phase", "")

            # Detect events
            changes = self._detect_changes(data)

            if changes:
                self._update_tracking(data)

            # Game end
            if phase in ("end", "abandon"):
                self._analyze_game_end(data)
                break

        if self.log_file:
            self.log_file.close()

    def _fetch(self):
        time.sleep(1)
        resp = self.session.get(
            f"{BASE_URL}/api/player", params={"id": self.player_id}, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _detect_changes(self, data) -> bool:
        game = data.get("game", {})
        gen = game.get("generation", 0)
        phase = game.get("phase", "")
        players = data.get("players", [])
        changed = False

        # New generation
        if gen != self.prev_gen:
            self._log("")
            self._print_header(f"═══ Поколение {gen} ({phase}) ═══")
            self._analyze_state(data)
            self.prev_gen = gen
            self.prev_phase = phase
            changed = True

        # Phase change
        if phase != self.prev_phase and gen == self.prev_gen:
            self._log(f"  Phase: {self.prev_phase} → {phase}")
            self.prev_phase = phase
            changed = True

        # New cards played
        for p in players:
            color = p.get("color", "?")
            name = p.get("name", "?")
            tableau = p.get("tableau", [])
            current = [c["name"] for c in tableau if isinstance(c, dict)]
            prev = self.prev_tableaux.get(color, [])

            new_cards = [c for c in current if c not in prev]
            for card in new_cards:
                self._analyze_card_played(name, color, card, gen)
                changed = True

        # Milestones
        for m in game.get("milestones", []):
            mname = m.get("name", "")
            claimed = m.get("playerName")
            if claimed and mname not in self.prev_milestones:
                self._log(f"  {Fore.GREEN}🏆 {claimed} заявил milestone: {mname} (+5 VP){Style.RESET_ALL}")
                self._json_event({"type": "milestone", "gen": gen, "player": claimed, "milestone": mname})
                changed = True

        # Awards
        for a in game.get("awards", []):
            aname = a.get("name", "")
            funded = a.get("playerName")
            if funded and aname not in self.prev_awards:
                self._log(f"  {Fore.YELLOW}💰 {funded} оплатил award: {aname}{Style.RESET_ALL}")
                self._json_event({"type": "award", "gen": gen, "player": funded, "award": aname})
                changed = True

        return changed

    def _analyze_card_played(self, player, color, card, gen):
        """Анализ сыгранной карты с оценкой."""
        score = self.db.score(card)
        tier = self.db.tier(card)
        tc = tier_color(tier)

        if score is not None:
            verdict = ""
            if score >= 90:
                verdict = "MUST-PICK"
            elif score >= 80:
                verdict = "отлично"
            elif score >= 70:
                verdict = "хорошо"
            elif score >= 55:
                verdict = "ок"
            elif score >= 35:
                verdict = "слабо"
            else:
                verdict = "TRAP"

            self._log(f"  🃏 {player}: {tc}{card} [{tier}-{score}]{Style.RESET_ALL} — {verdict}")

            # Detailed comment for interesting cards
            card_data = self.db.get(card)
            if card_data and score >= 80:
                economy = card_data.get("economy", "")
                if economy:
                    self._log(f"     {Fore.CYAN}↳ {economy[:80]}{Style.RESET_ALL}")
            elif card_data and score <= 40:
                economy = card_data.get("economy", "")
                if economy:
                    self._log(f"     {Fore.RED}↳ {economy[:80]}{Style.RESET_ALL}")
        else:
            self._log(f"  🃏 {player}: {card} [нет оценки]")

        self._json_event({
            "type": "card_played", "gen": gen, "player": player,
            "color": color, "card": card, "score": score, "tier": tier,
        })

    def _analyze_state(self, data, initial=False):
        """Выводит краткий обзор состояния всех игроков."""
        game = data.get("game", {})
        players = data.get("players", [])
        gen = game.get("generation", 0)

        o2 = game.get("oxygenLevel", 0)
        temp = game.get("temperature", -30)
        oceans = game.get("oceans", 0)
        venus = game.get("venusScaleLevel", 0)

        self._log(f"  Global: O₂={o2}% T={temp}°C Oceans={oceans}/9 Venus={venus}%")
        self._log("")

        for p in players:
            name = p.get("name", "?")
            color = p.get("color", "?")
            tableau = p.get("tableau", [])
            corp = tableau[0]["name"] if tableau and isinstance(tableau[0], dict) else "???"
            tr = p.get("terraformRating", 20)
            mc = p.get("megaCredits", 0)
            mc_prod = p.get("megaCreditProduction", 0)
            cards = p.get("cardsInHandNbr", 0)
            tags = p.get("tags", {})
            tag_str = ", ".join(f"{t}:{n}" for t, n in tags.items() if n > 0)

            COLOR_MAP = {"red": Fore.RED, "green": Fore.GREEN, "blue": Fore.BLUE,
                         "yellow": Fore.YELLOW, "orange": Fore.RED + Style.BRIGHT,
                         "purple": Fore.MAGENTA, "black": Fore.WHITE + Style.DIM}
            pc = COLOR_MAP.get(color, "")

            self._log(f"  {pc}{name}{Style.RESET_ALL} ({corp}) TR:{tr} MC:{mc}(+{mc_prod}) Cards:{cards}")
            if tag_str and not initial:
                self._log(f"    Tags: {tag_str}")

            # Production summary
            if not initial:
                prods = []
                mc_p = p.get("megaCreditProduction", 0)
                steel_p = p.get("steelProduction", 0)
                ti_p = p.get("titaniumProduction", 0)
                plant_p = p.get("plantProduction", 0)
                energy_p = p.get("energyProduction", 0)
                heat_p = p.get("heatProduction", 0)
                if mc_p: prods.append(f"MC+{mc_p}")
                if steel_p: prods.append(f"St+{steel_p}")
                if ti_p: prods.append(f"Ti+{ti_p}")
                if plant_p: prods.append(f"Pl+{plant_p}")
                if energy_p: prods.append(f"En+{energy_p}")
                if heat_p: prods.append(f"He+{heat_p}")
                prod_str = " ".join(prods) if prods else "нет prod"

                played_count = len(tableau) - 1 if len(tableau) > 1 else 0
                self._log(f"    Prod: {prod_str} │ Played: {played_count} cards")

        self._log("")
        self._json_event({
            "type": "state", "gen": gen,
            "global": {"o2": o2, "temp": temp, "oceans": oceans, "venus": venus},
            "players": [{
                "name": p.get("name"), "corp": (p.get("tableau", [{}])[0].get("name", "???")
                                                 if p.get("tableau") and isinstance(p["tableau"][0], dict)
                                                 else "???"),
                "tr": p.get("terraformRating", 0),
                "mc": p.get("megaCredits", 0),
                "mc_prod": p.get("megaCreditProduction", 0),
            } for p in players]
        })

    def _analyze_game_end(self, data):
        """Финальный анализ."""
        game = data.get("game", {})
        players = data.get("players", [])
        gen = game.get("generation", 0)

        self._log("")
        self._print_header(f"═══ ИГРА ЗАВЕРШЕНА — Gen {gen} ═══")

        results = []
        for p in players:
            vp = p.get("victoryPointsBreakdown", {})
            tableau = p.get("tableau", [])
            corp = tableau[0]["name"] if tableau and isinstance(tableau[0], dict) else "???"
            total = vp.get("total", p.get("terraformRating", 0))
            results.append({
                "name": p.get("name", "?"),
                "corp": corp,
                "total": total,
                "tr": vp.get("terraformRating", 0),
                "milestones": vp.get("milestones", 0),
                "awards": vp.get("awards", 0),
                "greenery": vp.get("greenery", 0),
                "city": vp.get("city", 0),
                "cards": vp.get("victoryPoints", 0),
                "tableau": [c["name"] for c in tableau if isinstance(c, dict)],
            })

        results.sort(key=lambda x: x["total"], reverse=True)
        medals = ["🥇", "🥈", "🥉"]

        for i, r in enumerate(results):
            medal = medals[i] if i < 3 else "  "
            self._log(f"  {medal} {r['name']} ({r['corp']}) — {r['total']} VP")
            self._log(f"     TR:{r['tr']} M:{r['milestones']} A:{r['awards']}"
                      f" Gr:{r['greenery']} Ci:{r['city']} Cards:{r['cards']}")

            # Analyze tableau
            played = r["tableau"][1:]  # skip corp
            scores = [(c, self.db.score(c)) for c in played]
            scored = [(c, s) for c, s in scores if s]
            traps = [c for c, s in scored if s <= 40]
            stars = [c for c, s in scored if s >= 85]

            self._log(f"     Played {len(played)} cards ({len(scored)} rated)")
            if stars:
                self._log(f"     {Fore.GREEN}Stars: {', '.join(stars)}{Style.RESET_ALL}")
            if traps:
                self._log(f"     {Fore.RED}Traps: {', '.join(traps)}{Style.RESET_ALL}")
            self._log("")

        # Winner analysis
        winner = results[0]
        loser = results[-1]
        gap = winner["total"] - loser["total"]
        self._log(f"  Gap: {gap} VP. Winner edge: ", end="")
        edges = []
        if winner["milestones"] > loser["milestones"]:
            edges.append(f"milestones +{winner['milestones'] - loser['milestones']}")
        if winner["awards"] > loser["awards"]:
            edges.append(f"awards +{winner['awards'] - loser['awards']}")
        if winner["tr"] > loser["tr"]:
            edges.append(f"TR +{winner['tr'] - loser['tr']}")
        if winner["cards"] > loser["cards"]:
            edges.append(f"card VP +{winner['cards'] - loser['cards']}")
        self._log(", ".join(edges) if edges else "unclear")

        self._json_event({
            "type": "game_end", "gen": gen,
            "results": [{
                "name": r["name"], "corp": r["corp"], "total": r["total"],
                "tr": r["tr"], "milestones": r["milestones"], "awards": r["awards"],
            } for r in results]
        })

    def _update_tracking(self, data):
        game = data.get("game", {})
        players = data.get("players", [])
        self.prev_gen = game.get("generation", 0)
        self.prev_phase = game.get("phase", "")
        for p in players:
            color = p.get("color", "?")
            tableau = p.get("tableau", [])
            self.prev_tableaux[color] = [c["name"] for c in tableau if isinstance(c, dict)]
        self.prev_milestones = {m.get("name") for m in game.get("milestones", []) if m.get("playerName")}
        self.prev_awards = {a.get("name") for a in game.get("awards", []) if a.get("playerName")}

    def _log(self, msg, end="\n"):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] {msg}", end=end, flush=True)

    def _print_header(self, text):
        print(f"\n{Fore.CYAN}{Style.BRIGHT}{text}{Style.RESET_ALL}")

    def _json_event(self, event):
        if self.log_file:
            event["ts"] = datetime.now().isoformat()
            self.log_file.write(json.dumps(event, ensure_ascii=False) + "\n")
            self.log_file.flush()

    def _shutdown(self, sig, frame):
        print(f"\n{Fore.YELLOW}Остановка...{Style.RESET_ALL}")
        self.running = False
        if self.log_file:
            self.log_file.close()
        sys.exit(0)


def main():
    parser = argparse.ArgumentParser(description="TM Watcher — наблюдатель за игрой")
    parser.add_argument("player_id", help="Player ID любого игрока в партии")
    parser.add_argument("--interval", type=float, default=30.0,
                        help="Интервал опроса (default: 30s)")
    args = parser.parse_args()
    Watcher(args.player_id, args.interval).run()


if __name__ == "__main__":
    main()
