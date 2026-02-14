"""SpyMode — полный обзор всех игроков (multi-ID)."""

import os
import sys
import time
import signal

import requests
from colorama import Fore, Style

from .constants import DATA_DIR, TIER_COLORS, COLOR_MAP
from .models import GameState
from .client import TMClient
from .database import CardDatabase
from .card_parser import CardEffectParser
from .combo import ComboDetector
from .synergy import SynergyEngine
from .requirements import RequirementsChecker
from .display import AdvisorDisplay
from .analysis import (
    _estimate_vp, _detect_strategy, _estimate_remaining_gens,
    _score_to_tier, _safe_title, _parse_wf_card,
)


class SpyMode:
    """Режим полного обзора: видит руки, драфт и стратегию ВСЕХ игроков."""

    def __init__(self, player_ids: list[str]):
        self.player_ids = player_ids
        self.client = TMClient()
        eval_path = os.path.join(DATA_DIR, "evaluations.json")
        self.db = CardDatabase(eval_path)
        self.effect_parser = CardEffectParser(self.db)
        self.combo_detector = ComboDetector(self.effect_parser, self.db)
        self.synergy = SynergyEngine(self.db, self.combo_detector)
        self.req_checker = RequirementsChecker(os.path.join(DATA_DIR, "all_cards.json"))
        self.display = AdvisorDisplay()
        self.running = True
        self._last_key = None

    def run(self):
        signal.signal(signal.SIGINT, self._shutdown)
        print(f"\n{Fore.CYAN}TM Advisor — SPY MODE{Style.RESET_ALL}")
        print(f"  {len(self.player_ids)} player IDs loaded")
        print(f"  База: {len(self.db.cards)} карт │ Ctrl+C для выхода\n")

        self._show_all()

        while self.running:
            try:
                # Poll first player's game for changes
                first_state = self._fetch_state(self.player_ids[0])
                if not first_state:
                    time.sleep(3)
                    continue
                key = (first_state.game_age, first_state.undo_count,
                       first_state.phase, first_state.generation)
                if key != self._last_key:
                    self._show_all()
                else:
                    self.display.waiting(
                        f"Ждём... Gen {first_state.generation} │ {first_state.phase}")
                time.sleep(0.5)
            except requests.ConnectionError:
                time.sleep(5)
            except requests.HTTPError as e:
                if e.response and e.response.status_code == 404:
                    print(f"\n{Fore.RED}Игра завершена.{Style.RESET_ALL}")
                    break
                time.sleep(5)

    def _fetch_state(self, pid: str) -> GameState | None:
        try:
            data = self.client.get_player_state(pid)
            return GameState(data)
        except Exception:
            return None

    def _show_all(self):
        """Fetch all players and show comprehensive analysis."""
        states: list[GameState] = []
        for pid in self.player_ids:
            st = self._fetch_state(pid)
            if st:
                states.append(st)

        if not states:
            self.display.error("Не удалось загрузить ни одного игрока")
            return

        ref = states[0]  # reference for global params
        self._last_key = (ref.game_age, ref.undo_count, ref.phase, ref.generation)

        self.display.clear()

        # Header
        line = "═" * 72
        mods = []
        if ref.has_colonies: mods.append("Col")
        if ref.has_turmoil: mods.append("Turm")
        if ref.has_venus: mods.append("Ven")
        if ref.is_wgt: mods.append("WGT")
        mod_str = "+".join(mods) if mods else "base"

        print(f"\n{Fore.CYAN}{line}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}  SPY MODE — Gen {ref.generation} ({ref.phase})"
              f"  [{ref.board_name}] {mod_str}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}  O₂:{ref.oxygen}% T:{ref.temperature}°C"
              f" Oceans:{ref.oceans}/9"
              f"{f' Venus:{ref.venus}%' if ref.has_venus else ''}"
              f" │ Deck:{ref.deck_size}"
              f" │ ~{_estimate_remaining_gens(ref)} gens left{Style.RESET_ALL}")
        print(f"{Fore.CYAN}{line}{Style.RESET_ALL}")

        # Turmoil
        if ref.has_turmoil and ref.turmoil:
            self.display.turmoil_table(ref)

        # Each player (FULL)
        for i, st in enumerate(states):
            me = st.me
            pc = COLOR_MAP.get(me.color, "")
            label = f"  Игрок {i + 1}" if i > 0 else "  ★ МОЙ ИГРОК"

            vp = _estimate_vp(st)
            print(f"\n{pc}{'━' * 68}{Style.RESET_ALL}")
            print(f"  {pc}{Style.BRIGHT}{label}: {me.name} ({me.corp}){Style.RESET_ALL}"
                  f"  TR:{me.tr} │ VP:~{vp['total']}")

            # Resources
            print(f"  {Fore.YELLOW}MC:{me.mc}(+{me.mc_prod})"
                  f"  St:{me.steel}(+{me.steel_prod}) val={me.steel_value}"
                  f"  Ti:{me.titanium}(+{me.ti_prod}) val={me.ti_value}{Style.RESET_ALL}")
            print(f"  {Fore.GREEN}Pl:{me.plants}(+{me.plant_prod})"
                  f"  En:{me.energy}(+{me.energy_prod})"
                  f"  Heat:{me.heat}(+{me.heat_prod}){Style.RESET_ALL}")

            # Tags
            tags_str = ", ".join(f"{t}:{n}" for t, n in me.tags.items() if n > 0)
            if tags_str:
                print(f"  Tags: {tags_str}")

            # Strategy
            strategy = _detect_strategy(me)
            if strategy:
                print(f"  {Fore.YELLOW}⚡ Стратегия: {strategy}{Style.RESET_ALL}")

            # Influence (Turmoil)
            if ref.has_turmoil:
                print(f"  Influence: {me.influence}")

            # TABLEAU (played cards with scores)
            if me.tableau:
                print(f"\n  {Style.BRIGHT}Tableau ({len(me.tableau)} карт):{Style.RESET_ALL}")
                for c in me.tableau:
                    name = c["name"]
                    score = self.db.get_score(name)
                    tier = self.db.get_tier(name)
                    tc = TIER_COLORS.get(tier, "")
                    res_str = f" ({c['resources']} res)" if c.get("resources") else ""
                    if score:
                        print(f"    {tc}{tier}-{score:2d}{Style.RESET_ALL} {name}{res_str}")
                    else:
                        print(f"    {'?':>4s} {name}{res_str}")

            # HAND (cards in hand — only visible from this player's perspective)
            if st.cards_in_hand:
                print(f"\n  {Style.BRIGHT}Рука ({len(st.cards_in_hand)} карт):{Style.RESET_ALL}")
                rated = []
                for card in st.cards_in_hand:
                    name = card["name"]
                    card_tags = card.get("tags", [])
                    score = self.synergy.adjusted_score(
                        name, card_tags, me.corp, ref.generation, me.tags, st)
                    tier = _score_to_tier(score)
                    cost = card.get("cost", 0)
                    req_ok, req_reason = self.req_checker.check(name, st)
                    rated.append((tier, score, name, cost, req_ok, req_reason))
                rated.sort(key=lambda x: x[1], reverse=True)
                for tier, score, name, cost, req_ok, req_reason in rated:
                    tc = TIER_COLORS.get(tier, "")
                    afford = "✓" if cost <= me.mc else "✗"
                    req_mark = f" ⛔{req_reason}" if not req_ok else ""
                    # Show card description for unknown cards
                    desc_hint = ""
                    if score == 50 and tier == "?":
                        desc = self.db.get_desc(name)
                        if desc:
                            desc_hint = f"\n      {Fore.WHITE}{Style.DIM}{desc[:70]}{Style.RESET_ALL}"
                    print(f"    {tc}{tier}-{score:2d}{Style.RESET_ALL}"
                          f" {name:<30s} {afford}{cost:3d} MC{req_mark}{desc_hint}")

            # DRAFT / DEALT (if in initial selection or draft phase)
            if st.dealt_corps:
                print(f"\n  {Style.BRIGHT}Dealt Corps:{Style.RESET_ALL}")
                for c in st.dealt_corps:
                    s = self.db.get_score(c["name"])
                    t = self.db.get_tier(c["name"])
                    tc = TIER_COLORS.get(t, "")
                    print(f"    {tc}{t}-{s or '?'}{Style.RESET_ALL} {c['name']}")

            if st.dealt_preludes:
                print(f"\n  {Style.BRIGHT}Dealt Preludes:{Style.RESET_ALL}")
                for c in st.dealt_preludes:
                    s = self.db.get_score(c["name"])
                    t = self.db.get_tier(c["name"])
                    tc = TIER_COLORS.get(t, "")
                    print(f"    {tc}{t}-{s or '?'}{Style.RESET_ALL} {c['name']}")

            if st.dealt_ceos:
                print(f"\n  {Style.BRIGHT}Dealt CEOs:{Style.RESET_ALL}")
                for c in st.dealt_ceos:
                    name = c["name"]
                    ceo = self.db.get_ceo(name)
                    action = ""
                    if ceo:
                        at = ceo.get("actionType", "")
                        short = (ceo.get("opgAction") or ceo.get("ongoingEffect") or "")[:60]
                        action = f" [{at}] {short}"
                    print(f"    {Fore.MAGENTA}{name}{Style.RESET_ALL}{action}")

            # WaitingFor
            wf = st.waiting_for
            if wf:
                wf_type = wf.get("type", "")
                title = _safe_title(wf)
                print(f"\n  {Fore.CYAN}Ждёт: {title} ({wf_type}){Style.RESET_ALL}")

                # Cards in waitingFor (draft picks etc)
                wf_cards = []
                for c in wf.get("cards", []):
                    wf_cards.append(_parse_wf_card(c))
                for opt in wf.get("options", []):
                    for c in opt.get("cards", []):
                        wf_cards.append(_parse_wf_card(c))
                if wf_cards:
                    print(f"  {Style.BRIGHT}Карты на выбор:{Style.RESET_ALL}")
                    for card in wf_cards:
                        name = card["name"]
                        s = self.synergy.adjusted_score(
                            name, card.get("tags", []), me.corp,
                            ref.generation, me.tags, st)
                        t = _score_to_tier(s)
                        tc = TIER_COLORS.get(t, "")
                        print(f"    {tc}{t}-{s:2d}{Style.RESET_ALL} {name}")

        # Milestones & Awards (from ref state)
        self.display.milestones_table(ref)
        self.display.awards_table(ref)
        if ref.has_colonies:
            self.display.colonies_table(ref)

        print()

    def _shutdown(self, sig, frame):
        print(f"\n{Fore.YELLOW}Выход...{Style.RESET_ALL}")
        self.running = False
        sys.exit(0)
