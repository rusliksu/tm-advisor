"""AdvisorDisplay — ANSI-терминальный форматтер."""

import os

from colorama import Fore, Style

from .constants import (
    TIER_COLORS, COLOR_MAP, PARTY_POLICIES, GLOBAL_EVENTS,
    COLONY_TRADE_DATA, STANDARD_PROJECTS,
)
from .analysis import _estimate_vp, _detect_strategy
from .map_advisor import _analyze_map


class AdvisorDisplay:
    try:
        W = max(64, os.get_terminal_size().columns)
    except OSError:
        W = 64

    @staticmethod
    def clear():
        os.system("cls" if os.name == "nt" else "clear")

    def header(self, state, title: str = ""):
        line = "═" * self.W
        mods = []
        if state.has_colonies: mods.append("Col")
        if state.has_turmoil: mods.append("Turm")
        if state.has_venus: mods.append("Ven")
        if state.is_wgt: mods.append("WGT")
        if state.has_pathfinders: mods.append("Path")
        if state.has_ceos: mods.append("CEO")
        if state.is_merger: mods.append("Merger")
        mod_str = " │ " + "+".join(mods) if mods else ""

        print(f"\n{Fore.CYAN}{line}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}  TM Advisor v2 — Gen {state.generation}"
              f"{f' ({title})' if title else ''}"
              f"  [{state.board_name}]{mod_str}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}  Corp: {state.corp_name} │ MC: {state.mc}"
              f" │ TR: {state.tr}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}  O₂: {state.oxygen}% │ T: {state.temperature}°C"
              f" │ Oceans: {state.oceans}/9"
              f"{f' │ Venus: {state.venus}%' if state.has_venus else ''}"
              f" │ Deck: {state.deck_size}{Style.RESET_ALL}")
        id_parts = []
        if state.game_id:
            id_parts.append(f"Game: {state.game_id}")
        for p in [state.me] + state.opponents:
            pid = state.player_ids.get(p.color, "")
            if pid:
                id_parts.append(f"{p.name}: {pid[:12]}")
        if id_parts:
            print(f"{Fore.CYAN}{Style.DIM}  {' │ '.join(id_parts)}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}{line}{Style.RESET_ALL}")

    def card_row(self, tier: str, score: int, name: str,
                 note: str = "", adjusted: bool = False):
        color = TIER_COLORS.get(tier, "")
        adj = "★" if adjusted else " "
        prefix_len = 2 + 1 + 2 + 3 + 2 + 28 + 1 + 1 + 3  # = 43
        note_w = max(40, self.W - prefix_len)
        first = note[:note_w]
        rest = note[note_w:]
        print(f"  {color}{tier}{Style.RESET_ALL}"
              f"  {color}{score:3d}{Style.RESET_ALL}"
              f"  {name:<28s} {adj} │ {first}")
        if rest:
            pad = " " * prefix_len
            while rest:
                chunk = rest[:note_w]
                rest = rest[note_w:]
                print(f"{pad}{chunk}")

    def separator(self):
        print(f"  {'─' * (self.W - 4)}")

    def section(self, title: str):
        print(f"\n  {Fore.WHITE}{Style.BRIGHT}{title}{Style.RESET_ALL}\n")

    def recommendation(self, text: str):
        print(f"\n  {Fore.GREEN}{Style.BRIGHT}→ {text}{Style.RESET_ALL}")

    def info(self, text: str):
        print(f"  {Fore.CYAN}{text}{Style.RESET_ALL}")

    def waiting(self, text: str):
        print(f"\r  {Fore.WHITE}{Style.DIM}⏳ {text}{Style.RESET_ALL}", end="", flush=True)

    def error(self, text: str):
        print(f"  {Fore.RED}✗ {text}{Style.RESET_ALL}")

    def resources_bar(self, state):
        me = state.me
        print(f"\n  {Fore.YELLOW}MC:{me.mc}(+{me.mc_prod})"
              f"  Steel:{me.steel}(+{me.steel_prod})"
              f"  Ti:{me.titanium}(+{me.ti_prod}){Style.RESET_ALL}")
        print(f"  {Fore.GREEN}Plants:{me.plants}(+{me.plant_prod})"
              f"  Energy:{me.energy}(+{me.energy_prod})"
              f"  Heat:{me.heat}(+{me.heat_prod}){Style.RESET_ALL}")

    def opponents_table(self, state):
        if not state.opponents:
            return
        my_vp = _estimate_vp(state)
        my_total = my_vp["total"]
        self.section(f"Мой VP estimate: ~{my_total}"
                     f" (TR:{my_vp['tr']} Gr:{my_vp['greenery']} Ci:{my_vp['city']}"
                     f" Cards:{my_vp['cards']} M:{my_vp['milestones']} A:{my_vp['awards']})")
        print()
        self.section("Оппоненты")
        for opp in state.opponents:
            c = COLOR_MAP.get(opp.color, "")
            strategy = _detect_strategy(opp)
            opp_vp = _estimate_vp(state, opp)
            opp_total = opp_vp["total"]
            diff = my_total - opp_total
            diff_str = f"{Fore.GREEN}+{diff}{Style.RESET_ALL}" if diff > 0 else f"{Fore.RED}{diff}{Style.RESET_ALL}"
            print(f"  {c}{opp.name}{Style.RESET_ALL} ({opp.corp})"
                  f"  TR:{opp.tr}  VP:~{opp_total} [{diff_str}]"
                  f"  MC:{opp.mc}(+{opp.mc_prod})"
                  f"  Cards:{opp.cards_in_hand_n}")
            if strategy:
                print(f"    {Fore.YELLOW}⚡ {strategy}{Style.RESET_ALL}")

    def milestones_table(self, state):
        if not state.milestones:
            return
        self.section("Milestones")
        my_color = state.me.color
        claimed_count = sum(1 for m in state.milestones if m.get("claimed_by"))
        slots_left = 3 - claimed_count

        cn = state.color_names
        for m in state.milestones:
            if m["claimed_by"]:
                claimer = m["claimed_by"]
                claimer_name = cn.get(claimer, claimer)
                cc = COLOR_MAP.get(claimer, "")
                print(f"  ✓ {m['name']} — {cc}{claimer_name}{Style.RESET_ALL}")
            else:
                my_score = m["scores"].get(my_color, {})
                score_val = my_score.get("score", 0) if isinstance(my_score, dict) else 0
                claimable = my_score.get("claimable", False) if isinstance(my_score, dict) else False
                threshold = my_score.get("threshold", 0) if isinstance(my_score, dict) else 0

                all_scores = {}
                opp_claimable = []
                for color, info in m["scores"].items():
                    s = info["score"] if isinstance(info, dict) else info
                    all_scores[color] = s
                    if color != my_color and isinstance(info, dict) and info.get("claimable"):
                        opp_claimable.append(cn.get(color, color))

                my_val = all_scores.get(my_color, 0)

                if threshold > 0:
                    progress = min(1.0, my_val / threshold)
                    bar_len = 8
                    filled = int(progress * bar_len)
                    bar = "█" * filled + "░" * (bar_len - filled)
                    progress_str = f" [{bar}] {my_val}/{threshold}"
                else:
                    progress_str = f" ({my_val})"

                if claimable:
                    mark = f"{Fore.GREEN}{Style.BRIGHT}◆ ЗАЯВЛЯЙ! (8 MC = 5 VP){Style.RESET_ALL}"
                    if opp_claimable:
                        mark += f" {Fore.RED}⚠️ {', '.join(opp_claimable)} тоже может!{Style.RESET_ALL}"
                elif slots_left <= 0:
                    mark = f"{Fore.RED}ЗАКРЫТО{Style.RESET_ALL}"
                else:
                    if threshold > 0 and my_val >= threshold - 1:
                        mark = f"{Fore.YELLOW}ПОЧТИ!{Style.RESET_ALL}"
                    elif opp_claimable:
                        mark = f"{Fore.RED}⚠️ {', '.join(opp_claimable)} может заявить!{Style.RESET_ALL}"
                    else:
                        mark = ""

                scores_parts = []
                for color, val in all_scores.items():
                    c = COLOR_MAP.get(color, "")
                    pname = cn.get(color, color)[:6]
                    bold = Style.BRIGHT if color == my_color else ""
                    scores_parts.append(f"{c}{bold}{pname}:{val}{Style.RESET_ALL}")
                scores_str = " ".join(scores_parts)

                print(f"  {'◆' if claimable else '○'} {m['name']}{progress_str}: {scores_str}  {mark}")

        if slots_left > 0:
            print(f"  {Fore.CYAN}Осталось слотов: {slots_left}/3 │ Стоимость: 8 MC = 5 VP (ROI: 0.63 VP/MC){Style.RESET_ALL}")

    def awards_table(self, state):
        if not state.awards:
            return
        self.section("Awards")
        my_color = state.me.color
        funded_count = sum(1 for a in state.awards if a.get("funded_by"))
        award_costs = [8, 14, 20]
        next_cost = award_costs[min(funded_count, 2)] if funded_count < 3 else 0

        cn = state.color_names
        for a in state.awards:
            funded = a.get("funded_by")
            scores_parts = []
            my_val = 0
            max_val = 0
            second_val = 0
            for color, val in a["scores"].items():
                c = COLOR_MAP.get(color, "")
                pname = cn.get(color, color)[:6]
                bold = Style.BRIGHT if color == my_color else ""
                scores_parts.append(f"{c}{bold}{pname}:{val}{Style.RESET_ALL}")
                if color == my_color:
                    my_val = val
                if val > max_val:
                    second_val = max_val
                    max_val = val
                elif val > second_val:
                    second_val = val

            i_am_first = my_val == max_val and my_val > 0
            i_am_second = not i_am_first and my_val == second_val and my_val > 0
            scores_str = " ".join(scores_parts)

            if funded:
                funder_name = cn.get(funded, funded)
                fc = COLOR_MAP.get(funded, "")
                if i_am_first:
                    vp_str = f" {Fore.GREEN}→ 5 VP (1st){Style.RESET_ALL}"
                elif i_am_second:
                    vp_str = f" {Fore.YELLOW}→ 2 VP (2nd){Style.RESET_ALL}"
                else:
                    vp_str = f" {Fore.RED}→ 0 VP{Style.RESET_ALL}"
                print(f"  $ {a['name']}: {scores_str}{vp_str}  [funded: {fc}{funder_name}{Style.RESET_ALL}]")
            else:
                if funded_count >= 3:
                    print(f"  ✗ {a['name']}: {scores_str}  {Fore.RED}ЗАКРЫТО{Style.RESET_ALL}")
                else:
                    if i_am_first:
                        lead = my_val - second_val
                        safety = f"лид +{lead}" if lead > 0 else "НИЧЬЯ — рискованно"
                        roi_str = f"{Fore.GREEN}→ 5 VP за {next_cost} MC ({safety}){Style.RESET_ALL}"
                    elif i_am_second:
                        gap = max_val - my_val
                        roi_str = f"{Fore.YELLOW}→ 2 VP за {next_cost} MC (отстаёшь на {gap}){Style.RESET_ALL}"
                    else:
                        roi_str = f"{Fore.RED}→ 0 VP (не лидер){Style.RESET_ALL}"
                    print(f"  ○ {a['name']}: {scores_str}  {roi_str}")

        if funded_count < 3:
            print(f"  {Fore.CYAN}След. award стоит: {next_cost} MC │ Слотов: {3 - funded_count}/3{Style.RESET_ALL}")

    def map_table(self, state):
        """Display map placement recommendations."""
        info = _analyze_map(state)
        if not info:
            return
        self.section(f"Карта (cities:{info['my_cities']} green:{info['my_greeneries']} oceans:{info['total_oceans']}/9)")
        best_city = info.get("best_city", [])
        best_green = info.get("best_greenery", [])

        if best_city:
            top = best_city[0]
            others = ", ".join(f"#{s[0]}" for s in best_city[1:3])
            print(f"  🏙 City: #{top[0]} ({top[3]}pt) {top[4]}"
                  f"{f'  also: {others}' if others else ''}")
        if best_green:
            top = best_green[0]
            others = ", ".join(f"#{s[0]}" for s in best_green[1:3])
            print(f"  🌿 Green: #{top[0]} ({top[3]}pt) {top[4]}"
                  f"{f'  also: {others}' if others else ''}")

    def turmoil_table(self, state):
        """Display Turmoil state."""
        if not state.turmoil:
            return
        t = state.turmoil
        self.section("Turmoil")

        cn = state.color_names
        ruling = t["ruling"] or "?"
        dominant = t["dominant"] or "?"
        chairman_color = t["chairman"] or "?"
        chairman_name = cn.get(chairman_color, chairman_color)
        cc = COLOR_MAP.get(chairman_color, "")
        policy = PARTY_POLICIES.get(ruling, {})
        icon = policy.get("icon", "")
        policy_text = policy.get("policy", "")
        ruling_is_reds = "Reds" in str(ruling)

        clr = Fore.RED + Style.BRIGHT if ruling_is_reds else Fore.GREEN
        print(f"  {icon} Ruling: {clr}{ruling}{Style.RESET_ALL}"
              f" │ Dominant: {dominant} │ Chairman: {cc}{chairman_name}{Style.RESET_ALL}")
        if policy_text:
            print(f"    Policy: {policy_text}")

        if ruling_is_reds:
            print(f"  {Fore.RED}{Style.BRIGHT}  ⚠️ REDS RULING: -1 TR за каждый подъём параметра!{Style.RESET_ALL}")

        my_influence = state.me.influence
        is_chairman = chairman_color == state.me.color
        print(f"  Мой influence: {my_influence}"
              f"{'  (chairman)' if is_chairman else ''}")

        print()
        for label, event_name in [("Сейчас", t["current"]), ("Следующий", t["coming"]), ("Далёкий", t["distant"])]:
            if event_name:
                ev = GLOBAL_EVENTS.get(event_name, {})
                desc = ev.get("desc", "?")
                good = ev.get("good", True)
                clr = Fore.GREEN if good else Fore.RED
                print(f"  {label}: {clr}{event_name}{Style.RESET_ALL}")
                print(f"    {desc}")

        my_color = state.me.color
        my_in_lobby = my_color in t.get("lobby", [])
        parties_with_me = []
        for pname, pdata in t["parties"].items():
            my_dels = pdata["delegates"].get(my_color, 0)
            if my_dels > 0:
                parties_with_me.append(f"{pname}:{my_dels}")
        if parties_with_me or my_in_lobby:
            lobby_str = " │ Lobby: ✓" if my_in_lobby else " │ Lobby: ✗"
            print(f"\n  Мои делегаты: {', '.join(parties_with_me) if parties_with_me else 'нет'}{lobby_str}")

    def colonies_table(self, state):
        if not state.colonies_data:
            return
        self.section("Колонии")
        cn = state.color_names
        my_color = state.me.color
        for col in state.colonies_data:
            settlers = col["settlers"]
            my_count = settlers.count(my_color)
            slots = 3 - len(settlers)
            settler_parts = []
            for sc in settlers:
                c = COLOR_MAP.get(sc, "")
                sname = cn.get(sc, sc)[:5]
                settler_parts.append(f"{c}{sname}{Style.RESET_ALL}")
            settler_str = ",".join(settler_parts) if settler_parts else "пусто"
            cdata = COLONY_TRADE_DATA.get(col["name"])
            trade_val = ""
            if cdata:
                track = cdata["track"]
                pos = min(col["track"], len(track) - 1)
                trade_val = f"  trade={track[pos]} {cdata['resource']}"
            my_marker = f"  {Fore.GREEN}← ты{Style.RESET_ALL}" if my_count > 0 else ""
            print(f"  {col['name']}: track={col['track']}{trade_val}"
                  f"  [{settler_str}]"
                  f"  (слотов: {slots}){my_marker}")
