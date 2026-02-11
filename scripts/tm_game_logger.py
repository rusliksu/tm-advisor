#!/usr/bin/env python3
"""
TM Game Logger — записывает ход игры для последующего анализа.

Использование:
    python scripts/tm_game_logger.py <player_id>
    python scripts/tm_game_logger.py <player_id> --interval 15

Лог сохраняется в data/game_logs/<game_id>.jsonl
Каждая строка — JSON-событие (snapshot, card_played, milestone, award, game_end).
"""

import sys
import os
import json
import time
import signal
import argparse
from datetime import datetime

import requests
from colorama import init, Fore, Style

init()

BASE_URL = "https://terraforming-mars.herokuapp.com"
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "game_logs")


class GameLogger:
    def __init__(self, player_id: str, interval: float = 30.0):
        self.player_id = player_id
        self.interval = interval
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "TM-Logger/1.0"
        self.running = True
        self.log_file = None
        self.event_count = 0

        # Tracking state for diffs
        self.prev_tableaux: dict[str, list[str]] = {}  # color -> [card_names]
        self.prev_milestones: set[str] = set()  # claimed milestone names
        self.prev_awards: set[str] = set()  # funded award names
        self.prev_gen = 0
        self.prev_phase = ""
        self.game_id = None

    def run(self):
        signal.signal(signal.SIGINT, self._shutdown)

        print(f"\n{Fore.CYAN}TM Game Logger v1.0{Style.RESET_ALL}")
        print(f"  Player ID: {self.player_id[:12]}...")
        print(f"  Интервал: {self.interval} сек")

        # Initial connection
        try:
            data = self._fetch()
        except Exception as e:
            print(f"  {Fore.RED}Ошибка подключения: {e}{Style.RESET_ALL}")
            return

        # Extract game ID
        game = data.get("game", {})
        self.game_id = game.get("id", "unknown")

        # Setup log file
        os.makedirs(LOG_DIR, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_path = os.path.join(LOG_DIR, f"{self.game_id}_{ts}.jsonl")
        self.log_file = open(log_path, "a", encoding="utf-8")

        print(f"  Game ID: {self.game_id}")
        print(f"  Лог: {log_path}")
        print(f"  {Fore.GREEN}Запись началась. Ctrl+C для остановки.{Style.RESET_ALL}\n")

        # Log initial full snapshot
        self._log_snapshot(data, full=True)
        self._update_tracking(data)

        # Main loop
        while self.running:
            time.sleep(self.interval)
            try:
                data = self._fetch()
            except requests.ConnectionError:
                self._print(f"{Fore.YELLOW}Потеряно соединение, жду...{Style.RESET_ALL}")
                time.sleep(10)
                continue
            except requests.HTTPError as e:
                if e.response and e.response.status_code == 404:
                    self._print(f"{Fore.RED}Игра не найдена (удалена/завершена).{Style.RESET_ALL}")
                    break
                self._print(f"{Fore.YELLOW}HTTP ошибка: {e}{Style.RESET_ALL}")
                time.sleep(10)
                continue

            # Detect changes and log events
            self._process_diff(data)
            self._update_tracking(data)

            # Check game end
            phase = data.get("game", {}).get("phase", "")
            if phase == "end" or phase == "abandon":
                self._log_game_end(data)
                self._print(f"{Fore.GREEN}Игра завершена! Лог сохранён.{Style.RESET_ALL}")
                break

        if self.log_file:
            self.log_file.close()

    def _fetch(self) -> dict:
        time.sleep(1)  # rate limit
        resp = self.session.get(
            f"{BASE_URL}/api/player", params={"id": self.player_id}, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _log_event(self, event: dict):
        event["ts"] = datetime.now().isoformat()
        self.log_file.write(json.dumps(event, ensure_ascii=False) + "\n")
        self.log_file.flush()
        self.event_count += 1

    def _log_snapshot(self, data: dict, full: bool = False):
        """Log game state snapshot."""
        game = data.get("game", {})
        this_player = data.get("thisPlayer", data)
        players = data.get("players", [])

        snapshot = {
            "type": "snapshot",
            "full": full,
            "gen": game.get("generation", 0),
            "phase": game.get("phase", ""),
            "global": {
                "oxygen": game.get("oxygenLevel", 0),
                "temperature": game.get("temperature", -30),
                "oceans": game.get("oceans", 0),
                "venus": game.get("venusScaleLevel", 0),
            },
            "players": [],
        }

        for p in players:
            tableau = p.get("tableau", [])
            card_names = [c["name"] for c in tableau if isinstance(c, dict)]
            p_data = {
                "name": p.get("name", "?"),
                "color": p.get("color", "?"),
                "corp": card_names[0] if card_names else "???",
                "tr": p.get("terraformRating", 0),
                "mc": p.get("megaCredits", 0),
                "mc_prod": p.get("megaCreditProduction", 0),
                "steel": p.get("steel", 0),
                "steel_prod": p.get("steelProduction", 0),
                "titanium": p.get("titanium", 0),
                "ti_prod": p.get("titaniumProduction", 0),
                "plants": p.get("plants", 0),
                "plant_prod": p.get("plantProduction", 0),
                "energy": p.get("energy", 0),
                "energy_prod": p.get("energyProduction", 0),
                "heat": p.get("heat", 0),
                "heat_prod": p.get("heatProduction", 0),
                "tags": p.get("tags", {}),
                "cards_in_hand": p.get("cardsInHandNbr", 0),
                "cities": p.get("citiesCount", 0),
                "colonies": p.get("coloniesCount", 0),
                "tableau": card_names,
                "vp": p.get("victoryPointsBreakdown", {}),
            }
            snapshot["players"].append(p_data)

        # My cards in hand (only visible for own player)
        hand = data.get("cardsInHand", [])
        snapshot["my_hand"] = [
            c["name"] if isinstance(c, dict) else c for c in hand
        ]

        # Milestones & Awards
        snapshot["milestones"] = [
            {"name": m.get("name"), "claimed_by": m.get("playerName")}
            for m in game.get("milestones", [])
        ]
        snapshot["awards"] = [
            {"name": a.get("name"), "funded_by": a.get("playerName")}
            for a in game.get("awards", [])
        ]

        # Colonies
        snapshot["colonies"] = [
            {
                "name": c.get("name"),
                "settlers": c.get("colonies", []),
                "track": c.get("trackPosition", 0),
            }
            for c in game.get("colonies", []) if c.get("isActive", True)
        ]

        if full:
            # Include game options and map on first snapshot
            opts = game.get("gameOptions", {})
            snapshot["game_options"] = {
                "board": opts.get("boardName", "?"),
                "expansions": opts.get("expansions", {}),
                "wgt": opts.get("solarPhaseOption", False),
                "players_count": len(players),
            }
            snapshot["spaces"] = game.get("spaces", [])

        self._log_event(snapshot)
        gen = game.get("generation", "?")
        phase = game.get("phase", "?")
        self._print(f"📸 Gen {gen} ({phase}) — snapshot #{self.event_count}")

    def _process_diff(self, data: dict):
        """Detect changes since last snapshot and log events."""
        game = data.get("game", {})
        gen = game.get("generation", 0)
        phase = game.get("phase", "")
        players = data.get("players", [])

        # New generation?
        if gen != self.prev_gen:
            self._log_event({
                "type": "new_generation",
                "gen": gen,
                "prev_gen": self.prev_gen,
            })
            self._print(f"🔄 Поколение {gen}")
            self.prev_gen = gen
            # Full snapshot each generation
            self._log_snapshot(data, full=False)

        # Phase change?
        if phase != self.prev_phase:
            self._log_event({
                "type": "phase_change",
                "gen": gen,
                "phase": phase,
                "prev_phase": self.prev_phase,
            })
            self.prev_phase = phase

        # New cards played?
        for p in players:
            color = p.get("color", "?")
            name = p.get("name", "?")
            tableau = p.get("tableau", [])
            current_cards = [c["name"] for c in tableau if isinstance(c, dict)]
            prev_cards = self.prev_tableaux.get(color, [])

            new_cards = [c for c in current_cards if c not in prev_cards]
            for card in new_cards:
                self._log_event({
                    "type": "card_played",
                    "gen": gen,
                    "player": name,
                    "color": color,
                    "card": card,
                })
                self._print(f"  🃏 {name} сыграл: {card}")

        # New milestones?
        for m in game.get("milestones", []):
            mname = m.get("name", "")
            claimed = m.get("playerName")
            if claimed and mname not in self.prev_milestones:
                self._log_event({
                    "type": "milestone_claimed",
                    "gen": gen,
                    "milestone": mname,
                    "player": claimed,
                })
                self._print(f"  🏆 {claimed} заявил milestone: {mname}")

        # New awards?
        for a in game.get("awards", []):
            aname = a.get("name", "")
            funded = a.get("playerName")
            if funded and aname not in self.prev_awards:
                self._log_event({
                    "type": "award_funded",
                    "gen": gen,
                    "award": aname,
                    "player": funded,
                })
                self._print(f"  💰 {funded} оплатил award: {aname}")

    def _update_tracking(self, data: dict):
        """Update tracking state for next diff."""
        game = data.get("game", {})
        players = data.get("players", [])

        self.prev_gen = game.get("generation", 0)
        self.prev_phase = game.get("phase", "")

        for p in players:
            color = p.get("color", "?")
            tableau = p.get("tableau", [])
            self.prev_tableaux[color] = [
                c["name"] for c in tableau if isinstance(c, dict)
            ]

        self.prev_milestones = {
            m.get("name") for m in game.get("milestones", [])
            if m.get("playerName")
        }
        self.prev_awards = {
            a.get("name") for a in game.get("awards", [])
            if a.get("playerName")
        }

    def _log_game_end(self, data: dict):
        """Log final game state and scores."""
        game = data.get("game", {})
        players = data.get("players", [])

        scores = []
        for p in players:
            tableau = p.get("tableau", [])
            card_names = [c["name"] for c in tableau if isinstance(c, dict)]
            scores.append({
                "name": p.get("name", "?"),
                "color": p.get("color", "?"),
                "corp": card_names[0] if card_names else "???",
                "tr": p.get("terraformRating", 0),
                "vp_breakdown": p.get("victoryPointsBreakdown", {}),
                "total_cards": len(card_names),
                "tags": p.get("tags", {}),
            })

        # Sort by TR (approximate — real VP might differ)
        scores.sort(key=lambda x: x["tr"], reverse=True)

        self._log_event({
            "type": "game_end",
            "gen": game.get("generation", 0),
            "scores": scores,
            "winner": scores[0]["name"] if scores else "?",
        })

        # Final full snapshot
        self._log_snapshot(data, full=True)

        # Print summary
        print(f"\n{Fore.GREEN}{'═' * 50}")
        print(f"  ИГРА ЗАВЕРШЕНА — Gen {game.get('generation', '?')}")
        print(f"{'═' * 50}{Style.RESET_ALL}")
        for i, s in enumerate(scores):
            medal = "🥇🥈🥉"[i] if i < 3 else "  "
            vp = s.get("vp_breakdown", {})
            total_vp = vp.get("total", s["tr"])
            print(f"  {medal} {s['name']} ({s['corp']}) — {total_vp} VP (TR:{s['tr']})")
        print(f"\n  Записано {self.event_count} событий")

    @staticmethod
    def _print(msg: str):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"  [{ts}] {msg}")

    def _shutdown(self, sig, frame):
        print(f"\n{Fore.YELLOW}  Остановка логгера...{Style.RESET_ALL}")
        self.running = False
        if self.log_file:
            self.log_file.close()
        sys.exit(0)


def main():
    parser = argparse.ArgumentParser(description="TM Game Logger")
    parser.add_argument("player_id", help="Player ID из URL игры")
    parser.add_argument("--interval", type=float, default=30.0,
                        help="Интервал опроса в секундах (default: 30)")
    args = parser.parse_args()

    logger = GameLogger(args.player_id, interval=args.interval)
    logger.run()


if __name__ == "__main__":
    main()
