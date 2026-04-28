"""AdvisorBot — основной бот-советник для Terraforming Mars."""

import os
import sys
import re
import json
import time
import signal
from itertools import combinations
from types import SimpleNamespace

import requests
from .colorama_compat import Fore, Style

from .constants import (
    POLL_INTERVAL, STANDARD_PROJECTS, TIER_COLORS,
    TABLEAU_DISCOUNT_CARDS,
)
from .models import GameState
from .client import TMClient
from .database import CardDatabase
from .card_parser import CardEffectParser
from .combo import ComboDetector
from .synergy import SynergyEngine, is_opening_hand_context
from .requirements import RequirementsChecker
from .threat import OpponentReactiveAdjuster
from .feasibility import FeasibilityAdjuster
from .prelude_scorer import PreludeScorer
from .display import AdvisorDisplay
from .claude_output import ClaudeOutput
from .economy import sp_efficiency, game_phase, check_energy_sinks
from .analysis import (
    _estimate_remaining_gens, _generate_alerts, _estimate_vp,
    _detect_strategy, strategy_advice, _should_pass, _score_to_tier,
    _safe_title, _extract_wf_card_names, _parse_wf_card,
    _rush_calculator, _vp_projection, _card_play_impact,
    _build_action_chains, _forecast_requirements, _trade_optimizer,
    _mc_flow_projection, summarize_action_card,
)
from .draft_play_advisor import (draft_buy_advice, play_hold_advice,
                                  mc_allocation_advice, _effective_cost,
                                  _collect_tableau_discounts)
from .game_logger import GameLogger, DraftTracker, AllPlayerDraftTracker
from .event_stream import EventEmitter
from .shared_data import resolve_data_path


class AdvisorBot:
    def __init__(self, player_id: str, claude_mode: bool = False,
                 snapshot_mode: bool = False, output_file: str = None,
                 events_mode: bool = False):
        self.player_id = player_id
        self.claude_mode = claude_mode
        self.snapshot_mode = snapshot_mode
        self.output_file = output_file
        self.events_mode = events_mode
        self._event_emitter = None  # инициализируется после загрузки db
        self.client = TMClient()
        eval_path = str(resolve_data_path("evaluations.json"))
        if not os.path.exists(eval_path):
            print(f"Файл не найден: {eval_path}")
            sys.exit(1)
        self.db = CardDatabase(eval_path)
        if events_mode:
            self._event_emitter = EventEmitter(card_db=self.db)
        self.effect_parser = CardEffectParser(self.db)
        self.combo_detector = ComboDetector(self.effect_parser, self.db)
        self.threat = OpponentReactiveAdjuster(self.db)
        self.req_checker = RequirementsChecker(str(resolve_data_path("all_cards.json")))
        self.feasibility = FeasibilityAdjuster(self.req_checker, self.db)
        self.prelude_scorer = PreludeScorer(self.db)
        self.synergy = SynergyEngine(
            self.db, self.combo_detector,
            threat_adjuster=self.threat,
            feasibility_adjuster=self.feasibility,
            prelude_scorer=self.prelude_scorer,
        )
        self.display = AdvisorDisplay()
        self.claude_out = ClaudeOutput(self.db, self.synergy, self.req_checker)
        self.running = True
        self._last_state_key = None

        # Draft tracking
        self._draft_tracker = DraftTracker()
        self._all_draft_tracker = AllPlayerDraftTracker(db=self.db)

        # Game logging (with enrichment refs for card_played events)
        offer_log_path = str(resolve_data_path("game_logs", "offers_log.jsonl"))
        game_log_path = str(resolve_data_path("game_logs"))
        self._logger = GameLogger(
            game_log_path, offer_log_path,
            effect_parser=self.effect_parser,
            combo_detector=self.combo_detector,
            db=self.db,
        )

        # Last pay info for _get_note → _advise_action bridge
        self._last_pay_info: dict = {}

    def _write_file(self, content: str):
        """Перезаписать output file свежим состоянием."""
        if not self.output_file:
            return
        with open(self.output_file, "w", encoding="utf-8") as f:
            f.write(content)

    def _write_state(self, state):
        """Записать claude-формат состояния в файл (если --file задан)."""
        if not self.output_file:
            return
        self._write_file(self.claude_out.format(state))

    def run(self):
        signal.signal(signal.SIGINT, self._shutdown)

        if not self.claude_mode and not self.events_mode:
            print(f"\n{Fore.CYAN}TM Advisor v2.0{Style.RESET_ALL}")
            print(f"  Player ID: {self.player_id[:8]}...")
            print(f"  База: {len(self.db.cards)} оценённых карт")
            print(f"  Режим: {'Claude Code' if self.claude_mode else 'Терминал'}")
            if self.output_file:
                print(f"  Файл: {self.output_file} (автообновление)")
            print(f"  Ctrl+C для выхода\n")

        try:
            state_data = self.client.get_player_state(self.player_id)
        except requests.HTTPError as e:
            self.display.error(f"Не удалось подключиться: {e}")
            return
        except requests.ConnectionError:
            self.display.error("Нет подключения к серверу.")
            return

        state = GameState(state_data)

        # Init game session logging
        self._logger.init_game_session(state)
        self._logger.diff_and_log_state(state)
        self._all_draft_tracker.on_state(state)

        # Snapshot mode — один раз и выход
        if self.snapshot_mode:
            if state.phase == "end":
                out = self.claude_out.format_postgame(state)
            else:
                out = self.claude_out.format(state)
            if self.output_file:
                self._write_file(out)
            print(out)
            return

        if self.events_mode:
            self._event_emitter.on_state(state)
            self._last_state_key = self._state_key(state)
        else:
            self._show_advice(state)
            self._write_state(state)

        # Polling loop
        while self.running:
            try:
                result = self.client.poll_waiting_for(
                    self.player_id, state.game_age, state.undo_count)
                status = result.get("result", "WAIT")

                if status in ("GO", "REFRESH"):
                    state_data = self.client.get_player_state(self.player_id)
                    state = GameState(state_data)
                    if self._state_key(state) != self._last_state_key:
                        # Check phase change for draft_chain logging
                        prev_phase = getattr(self, '_prev_phase', None)
                        if prev_phase and prev_phase != state.phase:
                            self._draft_tracker.on_phase_change(
                                state.phase, state.generation, self._logger)
                        self._prev_phase = state.phase

                        self._logger.diff_and_log_state(state)
                        self._all_draft_tracker.on_state(state)
                        if self.events_mode:
                            self._event_emitter.on_state(state)
                            self._last_state_key = self._state_key(state)
                        else:
                            self._show_advice(state)
                            self._write_state(state)

                    # Detect game end
                    if state.phase == "end" and not self._logger.game_ended:
                        self._all_draft_tracker.save(self._logger)
                        self._logger.log_game_end(state)
                        self._auto_add_game()
                        if self.events_mode:
                            self._event_emitter.on_game_end(state)
                            break
                        if self.claude_mode:
                            out = self.claude_out.format_postgame(state)
                            if self.output_file:
                                self._write_file(out)
                            print(out)
                        else:
                            self._show_postgame_report(state)
                else:
                    # WAIT — периодически обновляем state
                    if not hasattr(self, '_wait_counter'):
                        self._wait_counter = 0
                    self._wait_counter += 1
                    is_drafting = "drafting" in (state.phase or "")
                    refresh_interval = 2 if is_drafting else 6
                    if self._wait_counter >= refresh_interval:
                        self._wait_counter = 0
                        try:
                            state_data = self.client.get_player_state(self.player_id)
                            state = GameState(state_data)
                            if self._state_key(state) != self._last_state_key:
                                self._logger.diff_and_log_state(state)
                                self._all_draft_tracker.on_state(state)
                                if self.events_mode:
                                    self._event_emitter.on_state(state)
                                    self._last_state_key = self._state_key(state)
                                else:
                                    self._show_advice(state)
                                    self._write_state(state)
                        except Exception:
                            pass
                    if not self.claude_mode and not self.events_mode:
                        self.display.waiting(
                            f"Ждём ход... Gen {state.generation} │ "
                            f"GameAge {state.game_age}")

                time.sleep(POLL_INTERVAL)

            except requests.Timeout:
                continue
            except requests.ConnectionError:
                self.display.error("Потеряно соединение, переподключение...")
                time.sleep(5)
            except requests.HTTPError as e:
                if e.response and e.response.status_code == 404:
                    if not self._logger.game_ended:
                        try:
                            self._logger.log_game_end(state)
                        except Exception:
                            pass
                    self.display.error("Игра не найдена или завершена.")
                    break
                self.display.error(f"HTTP ошибка: {e}")
                time.sleep(5)

    @staticmethod
    def _state_key(state: GameState):
        """Ключ для дедупликации — меняется при любом изменении game state.

        Включает opp tableau size, milestones claimed_by и awards funded_by
        чтобы инвалидировать кэш даже когда opp совершает действие без
        изменения своего TR/MC/hand (напр., claim milestone или fund award).
        """
        wf = state.waiting_for
        wf_sig = (wf.get("type", ""), _safe_title(wf)) if wf else ("", "")
        wf_cards = ""
        if wf:
            wf_cards = _extract_wf_card_names(wf)
        opp_sig = tuple(
            (o.tr, o.mc, o.cards_in_hand_n, len(getattr(o, "tableau", []) or []))
            for o in state.opponents
        )
        hand_sig = tuple(c["name"] for c in state.cards_in_hand) if state.cards_in_hand else ()
        milestones_sig = tuple(
            (m.get("name", ""), m.get("claimed_by") or "")
            for m in (getattr(state, "milestones", None) or [])
        )
        awards_sig = tuple(
            (a.get("name", ""), a.get("funded_by") or "")
            for a in (getattr(state, "awards", None) or [])
        )
        return (state.game_age, state.undo_count,
                state.me.actions_this_gen, state.me.mc, state.me.tr,
                state.oxygen, state.temperature, state.oceans,
                wf_sig, wf_cards, opp_sig, hand_sig,
                milestones_sig, awards_sig)

    @staticmethod
    def _owner_view(state, owner):
        view = SimpleNamespace(**state.__dict__)
        players = [state.me] + list(state.opponents)
        view.me = owner
        view.opponents = [p for p in players if p is not owner]
        return view

    def _tableau_live_score(self, state, owner, name: str):
        info = self.db.get_info(name) or {}
        score = self.synergy.adjusted_score(
            name,
            info.get("tags", []) or [],
            owner.corp,
            state.generation,
            dict(owner.tags),
            self._owner_view(state, owner),
            context="tableau",
        )
        return score, _score_to_tier(score)

    def _show_advice(self, state: GameState):
        self._last_state_key = self._state_key(state)

        # Claude mode — markdown
        if self.claude_mode:
            print("\n" + self.claude_out.format(state))
            return

        # ANSI mode
        wf = state.waiting_for
        if not wf:
            self.display.clear()
            self.display.header(state, "Ожидание")
            self.display.info("Нет активного решения. Ждём...")
            self.display.resources_bar(state)
            hand = state.cards_in_hand
            if hand:
                me = state.me
                self.display.section("Карты в руке:")
                rated = self._rate_cards(hand, state.corp_name, state.generation, state.tags, state)
                for t, s, n, nt, req_ok, req_reason in rated:
                    cd = next((c for c in hand if c["name"] == n), {})
                    cost = cd.get("cost", 0)
                    if not req_ok:
                        mark = f"⛔ {req_reason}"
                    elif cost <= me.mc:
                        mark = f"✓ {cost} MC"
                    else:
                        mark = f"✗ {cost} MC"
                    self.display.card_row(t, s, n, f"[{mark}] {nt}", adjusted=True)
            self._show_game_context(state)
            print()
            return

        wf_type = wf.get("type", "")
        title = _safe_title(wf).lower()

        if wf_type == "or":
            options = wf.get("options", [])
            inner_types = [opt.get("type", "") for opt in options]
            if "initialCards" in inner_types:
                self._advise_initial(state, wf)
            elif state.phase == "drafting":
                self._advise_draft(state, wf)
            elif state.phase == "research":
                self._advise_buy(state, wf)
            elif "projectCard" in inner_types:
                self._advise_play(state, wf)
            elif "take your next action" in title or state.phase == "action":
                self._advise_action(state, wf)
            else:
                self._advise_or(state, wf)
        elif wf_type == "initialCards":
            self._advise_initial(state, wf)
        elif wf_type == "card":
            if "draft" in title or "drafting" in state.phase:
                self._advise_draft(state, wf)
            else:
                self._advise_buy(state, wf)
        elif wf_type == "projectCard":
            self._advise_play(state, wf)
        else:
            self._advise_generic(state, wf)

    # ── Начальный выбор ──

    def _advise_initial(self, state: GameState, wf: dict):
        self.display.clear()
        self.display.header(state, "Начальный выбор")

        corps = state.dealt_corps or self._extract_cards_from_wf(wf, "corporationCard")
        if corps:
            self._logger.log_offer("initial_corp", [c["name"] for c in corps], state)
            self.display.section("Корпорации")
            rated = self._rate_cards(corps, "", state.generation, {})
            for t, s, n, nt, *_ in rated:
                info = self.db.get_info(n)
                mc = info.get("startingMegaCredits", 0) if info else 0
                mc_str = f" [{mc} MC]" if mc else ""
                self.display.card_row(t, s, n, f"{nt}{mc_str}")

        preludes = state.dealt_preludes or self._extract_cards_from_wf(wf, "preludeCard")
        if preludes:
            self._logger.log_offer("initial_prelude", [c["name"] for c in preludes], state)
            self.display.section("Прелюдии")
            rated = self._rate_cards(preludes, "", state.generation, {})
            for t, s, n, nt, *_ in rated:
                self.display.card_row(t, s, n, nt)

        # Combo analysis: corp + prelude synergies
        best_corp = ""
        if corps and preludes and len(preludes) >= 2:
            best_corp = self._show_initial_combos(corps, preludes, state)
        elif corps:
            ranked_corps = self._rank_initial_corp_options(corps, preludes or [], state)
            if ranked_corps:
                best_corp = ranked_corps[0]["corp_name"]
                best_total = ranked_corps[0]["total"]
                self.display.recommendation(f"Лучшая: {best_corp} (shell {best_total})")

        # CEO cards
        ceos = state.dealt_ceos or self._extract_cards_from_wf(wf, "ceo")
        if ceos:
            self._logger.log_offer("initial_ceo", [c["name"] for c in ceos], state)
            self.display.section("CEO карты")
            rated_ceos = self._rate_ceo_cards(ceos, state)
            for t, s, name, note in rated_ceos:
                self.display.card_row(t, s, name, note)
            if rated_ceos:
                self.display.recommendation(
                    f"Лучший CEO: {rated_ceos[0][2]} ({rated_ceos[0][0]}-{rated_ceos[0][1]})")

        project_cards = state.dealt_project_cards or self._extract_cards_from_wf(wf, "card")
        if project_cards:
            self._logger.log_offer("initial_project", [c["name"] for c in project_cards], state)
            corp_hint = f" (синергия с {best_corp})" if best_corp else ""
            self.display.section(f"Проектные карты{corp_hint}")
            rated = self._rate_cards(project_cards, best_corp, state.generation, {}, state)
            for t, s, n, nt, req_ok, req_reason in rated:
                buy = "БЕРИ" if s >= 65 else "МОЖЕТ" if s >= 50 else "СКИП"
                req_mark = f" ⛔{req_reason}" if not req_ok else ""
                self.display.card_row(t, s, n, f"[{buy}] {nt}{req_mark}")
        print()

    def _score_initial_project_shell(self, corp_name, project_cards, state):
        if not project_cards:
            return 0, []

        deltas = []
        for card in project_cards:
            name = card["name"]
            tags = card.get("tags", [])
            neutral = self.synergy.adjusted_score(name, tags, "", 1, {}, state, context="draft")
            adj = self.synergy.adjusted_score(name, tags, corp_name, 1, {}, state, context="draft")
            delta = adj - neutral
            if delta != 0:
                deltas.append((name, delta))

        deltas.sort(key=lambda item: item[1], reverse=True)
        positive = [item for item in deltas if item[1] > 0]
        if not positive:
            return 0, []

        weights = (1.0, 0.6, 0.35)
        bonus = 0.0
        details = []
        for idx, (name, delta) in enumerate(positive[:3]):
            contrib = round(delta * weights[idx], 1)
            bonus += contrib
            details.append((name, contrib, delta))

        return round(max(-6, min(16, bonus))), details

    def _rank_initial_corp_options(self, corps, preludes, state):
        project_cards = (state.drafted_cards or state.dealt_project_cards or
                         state.cards_in_hand or [])
        rankings = []

        for corp in corps:
            corp_name = corp["name"]
            corp_score = self.db.get_score(corp_name)
            info = self.db.get_info(corp_name)
            start_mc = info.get("startingMegaCredits", 0) if info else 0
            project_bonus, project_details = self._score_initial_project_shell(
                corp_name, project_cards, state)

            if preludes and len(preludes) >= 2:
                p_scores = {}
                for p in preludes:
                    p_name = p["name"]
                    p_tags = p.get("tags", [])
                    adj = self.synergy.adjusted_score(
                        p_name, p_tags, corp_name, 1, {}, state, context="draft")
                    base = self.db.get_score(p_name)
                    p_scores[p_name] = (adj, adj - base)

                for p1, p2 in combinations(preludes, 2):
                    n1, n2 = p1["name"], p2["name"]
                    s1, b1 = p_scores[n1]
                    s2, b2 = p_scores[n2]
                    total = corp_score + s1 + s2 + project_bonus
                    syn = b1 + b2 + project_bonus
                    rankings.append({
                        "total": total,
                        "synergy": syn,
                        "corp_name": corp_name,
                        "corp_score": corp_score,
                        "preludes": [(n1, s1), (n2, s2)],
                        "start_mc": start_mc,
                        "project_bonus": project_bonus,
                        "project_details": project_details,
                    })
                continue

            if preludes:
                best_prelude = None
                best_prelude_syn = 0
                for p in preludes:
                    p_name = p["name"]
                    p_tags = p.get("tags", [])
                    adj = self.synergy.adjusted_score(
                        p_name, p_tags, corp_name, 1, {}, state, context="draft")
                    base = self.db.get_score(p_name)
                    syn = adj - base
                    if not best_prelude or adj > best_prelude[1]:
                        best_prelude = (p_name, adj)
                        best_prelude_syn = syn

                total = corp_score + (best_prelude[1] if best_prelude else 0) + project_bonus
                rankings.append({
                    "total": total,
                    "synergy": best_prelude_syn + project_bonus,
                    "corp_name": corp_name,
                    "corp_score": corp_score,
                    "preludes": [best_prelude] if best_prelude else [],
                    "start_mc": start_mc,
                    "project_bonus": project_bonus,
                    "project_details": project_details,
                })
                continue

            rankings.append({
                "total": corp_score + project_bonus,
                "synergy": project_bonus,
                "corp_name": corp_name,
                "corp_score": corp_score,
                "preludes": [],
                "start_mc": start_mc,
                "project_bonus": project_bonus,
                "project_details": project_details,
            })

        rankings.sort(key=lambda item: item["total"], reverse=True)
        return rankings

    def _show_initial_combos(self, corps, preludes, state):
        """Analyze corp+prelude combinations and return best corp name."""
        combos = self._rank_initial_corp_options(corps, preludes, state)

        self.display.section("Лучшие стартовые комбо")
        for i, combo in enumerate(combos[:3]):
            star = "★" if i == 0 else "●"
            cn = combo["corp_name"]
            cs = combo["corp_score"]
            ct = _score_to_tier(cs)
            color = Fore.GREEN + Style.BRIGHT if i == 0 else Fore.WHITE
            prelude_parts = []
            for pname, pscore in combo["preludes"]:
                prelude_parts.append(f"{pname} ({_score_to_tier(pscore)}-{pscore})")
            combo_line = f"  {color}{star} {cn} ({ct}-{cs})"
            if prelude_parts:
                combo_line += " + " + " + ".join(prelude_parts)
            print(f"{combo_line}{Style.RESET_ALL}")

            extras = []
            if combo["project_bonus"] > 0:
                extras.append(f"project shell +{combo['project_bonus']}")
            syn_str = ""
            if combo["synergy"] > 0:
                syn_str = f"  {Fore.GREEN}synergy +{combo['synergy']}{Style.RESET_ALL}"
            print(f"    Σ {combo['total']}  │  Start: {combo['start_mc']} MC"
                  + (f"  │  {', '.join(extras)}" if extras else "") + syn_str)
            if combo["project_details"]:
                shell_desc = ", ".join(
                    f"{name} +{contrib:g}" for name, contrib, _ in combo["project_details"][:3]
                )
                print(f"    draft shell: {shell_desc}")

        if combos:
            best = combos[0]
            self.display.recommendation(
                f"КОМБО: {best['corp_name']}" +
                (f" + {' + '.join(name for name, _ in best['preludes'])}" if best["preludes"] else ""))
            return best["corp_name"]
        return ""

    # ── Драфт ──

    def _advise_draft(self, state: GameState, wf: dict):
        self.display.clear()
        self.display.header(state, "Драфт")
        self.display.resources_bar(state)

        cards = self._extract_cards_list(wf)
        if cards:
            current_names = [c["name"] for c in cards]

            # Detect card type from DB info
            draft_type = "project"
            sample_info = self.db.get_info(cards[0]["name"])
            if sample_info:
                ctype = sample_info.get("type", "")
                if ctype == "corporation":
                    draft_type = "corporation"
                elif ctype == "prelude":
                    draft_type = "prelude"

            # Log draft offer (enriched with score/tier)
            cards_enriched = []
            for cn in current_names:
                card_data = {"name": cn}
                sc = self.db.get_score(cn)
                if sc:
                    card_data["score"] = sc
                    card_data["tier"] = self.db.get_tier(cn)
                cards_enriched.append(card_data)
            self._logger.log_offer(
                f"draft_{draft_type}", current_names, state,
                extra={"cards_detail": cards_enriched})

            # Draft memory: detect what was taken from previous offer
            self._draft_tracker.on_offer(
                state.generation, current_names, self._logger, state, db=self.db)

            # ── Corporation draft ──
            if draft_type == "corporation":
                merger_note = f"  {Fore.CYAN}🤝 Merger: выбираешь 2 корпорации!{Style.RESET_ALL}" if state.is_merger else ""
                if merger_note:
                    print(merger_note)
                self.display.section("Выбери корпорацию:")
                rated = self._rate_cards(cards, "", state.generation, {}, state)
                for t, s, n, nt, *_ in rated:
                    info = self.db.get_info(n)
                    mc = info.get("startingMegaCredits", 0) if info else 0
                    tags = info.get("tags", []) if info else []
                    desc = info.get("description", "") if info else ""
                    mc_str = f" [{mc} MC]" if mc else ""
                    tag_str = f" {','.join(tags)}" if tags else ""
                    short_desc = desc[:60] + "..." if len(desc) > 63 else desc
                    self.display.card_row(t, s, n, f"{mc_str}{tag_str}")
                    if short_desc:
                        print(f"          {Fore.WHITE}{Style.DIM}{short_desc}{Style.RESET_ALL}")

                best = rated[0] if rated else None
                if best:
                    self.display.recommendation(f"Бери: {best[2]} ({best[0]}-{best[1]})")

            # ── Prelude draft ──
            elif draft_type == "prelude":
                corp_hint = ""
                if state.corp_name and state.corp_name != "???":
                    corp_hint = f" (с {state.corp_name})"
                self.display.section(f"Выбери прелюдию{corp_hint}:")
                rated = self._rate_cards(cards, state.corp_name, state.generation, state.tags, state)
                for t, s, n, nt, *_ in rated:
                    info = self.db.get_info(n)
                    tags = info.get("tags", []) if info else []
                    desc = info.get("description", "") if info else ""
                    tag_str = f" {','.join(tags)}" if tags else ""
                    short_desc = desc[:60] + "..." if len(desc) > 63 else desc
                    self.display.card_row(t, s, n, f"{tag_str} {nt}")
                    if short_desc:
                        print(f"          {Fore.WHITE}{Style.DIM}{short_desc}{Style.RESET_ALL}")

                    if state.corp_name and state.corp_name != "???":
                        base_score = self.db.get_score(n)
                        if s > base_score + 3:
                            print(f"          {Fore.GREEN}↑ synergy +{s - base_score} с {state.corp_name}{Style.RESET_ALL}")

                best = rated[0] if rated else None
                if best:
                    self.display.recommendation(f"Бери: {best[2]} ({best[0]}-{best[1]})")

            # ── Project card draft ──
            else:
                gens_left = _estimate_remaining_gens(state)
                phase = game_phase(gens_left, state.generation)
                if phase == "endgame":
                    print(f"  {Fore.RED}⚠️ Финал ({gens_left} gen)! Бери ТОЛЬКО VP/TR. Production бесполезна.{Style.RESET_ALL}")
                elif phase == "late":
                    print(f"  {Fore.YELLOW}Поздняя фаза ({gens_left} gen left): VP > Production. Дорогие engine — скип.{Style.RESET_ALL}")
                elif phase == "early":
                    print(f"  {Fore.GREEN}Engine фаза: Production и дискаунты максимально ценны!{Style.RESET_ALL}")

                self.display.section("Выбери одну карту:")
                rated = self._rate_cards(cards, state.corp_name, state.generation, state.tags, state)
                for t, s, n, nt, req_ok, req_reason in rated:
                    req_mark = f" ⛔{req_reason}" if not req_ok else ""
                    card_info = self.db.get_info(n)
                    cost = card_info.get("cost", 0) if card_info else 0
                    cost_str = f" [{cost}MC]" if cost > 0 else ""
                    self.display.card_row(t, s, n, f"{nt}{cost_str}{req_mark}", adjusted=True)
                self._show_combos(state, cards)

                best_playable = next((r for r in rated if r[4]), None)
                if best_playable:
                    self.display.recommendation(f"Бери: {best_playable[2]} ({best_playable[0]}-{best_playable[1]})")

            # Show draft memory — what we passed to opponents
            passed_strong = self._draft_tracker.get_passed_strong(state.generation, self.db)
            if passed_strong:
                print(f"  {Fore.YELLOW}⚠️ Передано соседу: {', '.join(passed_strong)}{Style.RESET_ALL}")

        self._show_game_context(state)
        print()

    # ── Покупка ──

    def _advise_buy(self, state: GameState, wf: dict):
        self.display.clear()
        self.display.header(state, "Покупка карт")
        self.display.resources_bar(state)

        gens_left = _estimate_remaining_gens(state)
        phase = game_phase(gens_left, state.generation)
        me = state.me

        cards = self._extract_cards_list(wf)
        if cards:
            self._logger.log_offer("buy", [c["name"] for c in cards], state)

            # Draft buy analysis
            advice = draft_buy_advice(cards, state, self.synergy, self.req_checker)
            hand_size = advice["hand_size"]
            gens_play = advice["gens_to_play_all"]

            # MC pressure header
            pressure_icon = {"comfortable": "🟢", "tight": "🟡", "critical": "🔴"}.get(
                advice["mc_pressure"], "⚪")
            print(f"  {pressure_icon} MC: {me.mc} → после покупки "
                  f"{advice['buy_count']} карт: {advice['mc_after_buy']} MC "
                  f"({advice['mc_pressure']})")
            print(f"  Рука: {hand_size} карт (~{gens_play} gen чтобы сыграть все) "
                  f"[{advice['hand_saturation']}]")

            self.display.section(f"Карты (3 MC каждая):")

            # Show buy list
            buy_names = {c["name"] for c in advice["buy_list"]}
            rated = self._rate_cards(cards, state.corp_name, state.generation, state.tags, state)
            for t, s, n, nt, req_ok, req_reason in rated:
                cd = next((c for c in cards if c["name"] == n), {})
                play_cost = cd.get("cost", 0)

                if n in buy_names:
                    entry = next(b for b in advice["buy_list"] if b["name"] == n)
                    buy = f"БЕРИ — {entry['buy_reason']}"
                    if entry.get("playability_gens", 0) > 0:
                        buy += f" (req ~{entry['playability_gens']} gen)"
                else:
                    entry = next((s_ for s_ in advice["skip_list"] if s_["name"] == n), None)
                    reason = entry["skip_reason"] if entry else f"score {s}"
                    buy = f"СКИП — {reason}"

                self.display.card_row(t, s, n, f"[{buy}] {nt} [{play_cost}MC]", adjusted=True)

            self._show_combos(state, cards)

            # Recommendation
            if advice["buy_count"] > 0:
                buy_names_str = ", ".join(b["name"] for b in advice["buy_list"])
                self.display.recommendation(advice["hint"])
                print(f"    → {buy_names_str}")
            else:
                self.display.recommendation(advice["hint"])

        self._show_game_context(state)
        print()

    # ── Действие ──

    def _advise_action(self, state: GameState, wf: dict):
        self.display.clear()
        self.display.header(state, "Действие")
        self.display.resources_bar(state)

        hand = state.cards_in_hand
        gens_left = _estimate_remaining_gens(state)
        phase = game_phase(gens_left, state.generation)
        me = state.me
        rated = None

        if hand:
            self.display.section("Карты в руке:")
            rated = self._rate_cards(hand, state.corp_name, state.generation, state.tags, state)
            tab_discs = _collect_tableau_discounts(me.tableau)
            for t, s, n, nt, req_ok, req_reason in rated:
                cd = next((c for c in hand if c["name"] == n), {})
                cost = cd.get("cost", 0)
                card_tags = cd.get("tags", [])
                # Use effective cost with discounts + steel/ti
                eff, pay_hint_str = _effective_cost(
                    cost, card_tags, me, tableau_discounts=tab_discs)
                if not req_ok:
                    mark = f"⛔ {req_reason}"
                elif eff <= me.mc:
                    ph = f" ({pay_hint_str})" if pay_hint_str else ""
                    mark = f"✓ {eff} MC{ph}" if eff != cost else f"✓ {cost} MC"
                else:
                    mark = f"✗ {eff} MC eff" if eff != cost else f"✗ {cost} MC"
                self.display.card_row(t, s, n, f"[{mark}] {nt}", adjusted=True)

        # === Play/Hold Analysis ===
        ph_advice = None
        if hand:
            ph_advice = play_hold_advice(hand, state, self.synergy, self.req_checker)
            play_cards = [a for a in ph_advice if a["action"] == "PLAY"]
            hold_cards = [a for a in ph_advice if a["action"] == "HOLD"]
            sell_cards = [a for a in ph_advice if a["action"] == "SELL"]

            if play_cards or hold_cards or sell_cards:
                self.display.section("▶ Play/Hold анализ:")
                for a in ph_advice:
                    icon = {"PLAY": "▶", "HOLD": "▷", "SELL": "📤"}.get(a["action"], "?")
                    color = {"PLAY": Fore.GREEN, "HOLD": Fore.YELLOW, "SELL": Fore.RED}.get(
                        a["action"], Fore.WHITE)
                    print(f"    {icon} {color}{a['action']} {a['name']}: "
                          f"{a['reason']}{Style.RESET_ALL}")
                    # Show combo play order hints
                    for pb in a.get("play_before", []):
                        print(f"      {Fore.CYAN}🔗 {pb}{Style.RESET_ALL}")

        # === MC Allocation ===
        alloc = mc_allocation_advice(state, self.synergy, self.req_checker)
        if alloc["allocations"]:
            self.display.section(f"💰 MC Allocation (бюджет: {alloc['budget']} MC):")
            mc_running = alloc["budget"]
            for i, a in enumerate(alloc["allocations"][:8], 1):
                cost_str = f"{a['cost']} MC" if a["cost"] > 0 else "free"
                val_str = f"~{a['value_mc']} MC value"
                if a["cost"] <= mc_running:
                    mc_running -= a["cost"]
                    print(f"    {i}. {a['action']} ({cost_str}, {val_str})")
                else:
                    print(f"    {i}. {Fore.RED}{a['action']} ({cost_str}, {val_str}) — нет MC{Style.RESET_ALL}")
            if alloc["mc_reserve"] > 0:
                print(f"    Резерв: {alloc['mc_reserve']} MC ({alloc['reserve_reason']})")
            for w in alloc.get("warnings", []):
                print(f"    {Fore.YELLOW}⚠️ {w}{Style.RESET_ALL}")
            ng = alloc.get("next_gen")
            if ng:
                print(f"    {Fore.CYAN}📅 Next gen: income {ng['income']} MC, "
                      f"projected ~{ng['projected_mc']} MC "
                      f"({ng['phase_next']}){Style.RESET_ALL}")

        # === Action Priority ===
        priority = []
        reds_now = (state.turmoil and "Reds" in str(state.turmoil.get("ruling", "")))
        reds_policy_id = ""
        if state.turmoil:
            reds_policy_id = (state.turmoil.get("policy_ids") or {}).get("Reds", "")
        # 1. Milestones (highest priority — 5 VP for 8 MC)
        claimed_n = sum(1 for m in state.milestones if m.get("claimed_by"))
        if claimed_n < 3 and me.mc >= 8:
            for m in state.milestones:
                if m["claimed_by"]:
                    continue
                ms = m["scores"].get(me.color, {})
                if isinstance(ms, dict) and ms.get("claimable"):
                    priority.append(f"🏆 ЗАЯВИ {m['name']}! (8 MC = 5 VP, ROI лучше любой карты)")
                    break
        # 2. Heat → temp (free TR)
        if me.heat >= 8 and state.temperature < 8 and not reds_now:
            priority.append(f"🔥 Heat→Temp ({me.heat} heat, +1 TR бесплатно)")
        # 3. Plants → greenery (free TR + VP)
        if me.plants >= 8:
            if not reds_now:
                priority.append(f"🌿 Plants→Greenery ({me.plants} plants, +1 TR +1 VP)")
            elif reds_policy_id == "rp01":
                priority.append(f"🌿 Plants→Greenery ({me.plants} plants, +1 TR +1 VP, Reds tax +3 MC)")
            else:
                priority.append(f"🌿 Plants→Greenery ({me.plants} plants, Reds ruling: проверь policy)")
        # 4. Colony trade (if profitable)
        if state.colonies_data and (me.energy >= 3 or me.mc >= 9):
            from .colony_advisor import analyze_trade_options
            tr = analyze_trade_options(state)
            if tr["trades"] and tr["trades"][0]["net_profit"] > 5:
                best = tr["trades"][0]
                priority.append(f"🚀 Trade {best['name']} (+{best['net_profit']} MC net)")
        if priority:
            self.display.section("▶ ПРИОРИТЕТ (до карт):")
            for p in priority:
                print(f"    {p}")

        # === Combo Detection ===
        self._show_combos(state, hand)

        self._show_or_options(wf)

        # === Generation Plan ===
        self._show_gen_plan(state, hand, gens_left, phase,
                            rated_cache=rated if hand else None)

        self._show_game_context(state)

        # === Умная рекомендация с "не играй" логикой ===
        if hand and rated:
            playable = []
            for t, s, n, _, req_ok, _ in rated:
                cd = next((c for c in hand if c["name"] == n), {})
                cost = cd.get("cost", 0)
                if req_ok and cost <= me.mc:
                    playable.append((t, s, n, cost))

            dont_play_reasons = _should_pass(state, playable, gens_left, phase)

            if dont_play_reasons:
                for reason in dont_play_reasons:
                    print(f"  {Fore.MAGENTA}{Style.BRIGHT}💡 {reason}{Style.RESET_ALL}")

            # Use play/hold advice for smarter recommendation
            if ph_advice:
                best_play = next((a for a in ph_advice if a["action"] == "PLAY"), None)
                if best_play and not dont_play_reasons:
                    self.display.recommendation(
                        f"Сыграй: {best_play['name']} ({best_play['reason']})")
                    self._maybe_show_sequence_plan(state, phase, gens_left)
                elif best_play and dont_play_reasons:
                    self.display.recommendation(
                        f"Можно: {best_play['name']}, но рассмотри PASS")
                elif not playable or (playable and playable[0][1] < 55):
                    self._recommend_non_card_action(gens_left, me, hand)
            elif playable and playable[0][1] >= 60 and not dont_play_reasons:
                self.display.recommendation(
                    f"Сыграй: {playable[0][2]} ({playable[0][0]}-{playable[0][1]})")
            elif playable and playable[0][1] >= 60 and dont_play_reasons:
                self.display.recommendation(
                    f"Можно: {playable[0][2]} ({playable[0][0]}-{playable[0][1]}), "
                    f"но рассмотри PASS")
            elif not playable or playable[0][1] < 55:
                self._recommend_non_card_action(gens_left, me, hand)
        print()

    def _maybe_show_sequence_plan(self, state, phase, gens_left):
        """If a 2-card sequence beats the single best pick, surface the plan."""
        try:
            from .sequence_planner import plan_sequence
            from .economy import resource_values
        except Exception:
            return
        try:
            rv = resource_values(gens_left)
            plan = plan_sequence(
                state, self.synergy, self.req_checker,
                self.effect_parser, self.db, phase, gens_left, rv,
            )
        except Exception:
            return
        if not plan:
            return
        print(f"  {Fore.CYAN}{plan['reason']}{Style.RESET_ALL}")

    def _recommend_non_card_action(self, gens_left, me, hand):
        """Recommend SP, sell patents, or pass when no good card to play."""
        _e_sinks = check_energy_sinks(me, has_colonies=bool(getattr(self, '_has_colonies', False)))
        sp_list = sp_efficiency(gens_left, me.tableau if me else None, has_energy_sinks=_e_sinks)
        best_sp = next(
            ((n, r, g) for n, r, g in sp_list
             if STANDARD_PROJECTS[n]["cost"] <= me.mc and r >= 0.45), None)
        if best_sp:
            self.display.recommendation(
                f"SP: {best_sp[0]} ({STANDARD_PROJECTS[best_sp[0]]['cost']} MC)")
        elif hand and len(hand) > 3:
            self.display.recommendation("SELL PATENTS — продай слабые карты за MC")
        else:
            self.display.recommendation("PASS — пропусти ход")

    # ── Combo Detection Display ──

    def _show_combos(self, state: GameState, hand: list[dict]):
        """Показать обнаруженные комбо между tableau и рукой."""
        if not self.combo_detector:
            return
        tableau_names = [c["name"] for c in state.me.tableau]
        hand_names = [c["name"] for c in hand] if hand else []
        if not tableau_names and not hand_names:
            return

        combo_tags = dict(state.tags)
        combo_tags["_colony_count"] = state.me.colonies
        combos = self.combo_detector.analyze_tableau_combos(
            tableau_names, hand_names, combo_tags
        )
        if not combos:
            return

        interesting = [c for c in combos if c["value_bonus"] > 0 or c["type"] == "active_engine"]
        if not interesting:
            return

        self.display.section("🔗 Синергии:")
        shown = 0
        for combo in interesting[:6]:
            ct = combo["type"]
            desc = combo["description"]
            val = combo["value_bonus"]

            if ct == "active_engine":
                icon = "⚙️"
                color = Fore.CYAN
            elif ct in ("resource_target", "resource_adder", "scaling_placement"):
                icon = "🎯"
                color = Fore.GREEN
            elif ct == "tag_scaling":
                icon = "📈"
                color = Fore.YELLOW
            elif ct == "trigger":
                icon = "⚡"
                color = Fore.MAGENTA
            elif ct == "discount":
                icon = "💰"
                color = Fore.BLUE
            else:
                icon = "🔗"
                color = Fore.WHITE

            bonus_str = f" [+{val}]" if val > 0 else ""
            print(f"    {icon} {color}{desc}{bonus_str}{Style.RESET_ALL}")
            shown += 1

        if len(interesting) > 6:
            print(f"    {Fore.WHITE}{Style.DIM}...и ещё {len(interesting) - 6} синергий{Style.RESET_ALL}")

    # ── Generation Plan ──

    def _show_gen_plan(self, state, hand, gens_left, phase, rated_cache=None):
        """Составить и показать план действий на текущий generation.
        Uses mc_allocation_advice for optimized MC distribution."""
        me = state.me
        mc = me.mc

        # Get optimized MC allocation
        alloc = mc_allocation_advice(state, self.synergy, self.req_checker)

        plan_steps = []
        mc_budget = mc

        # Build plan from allocation advice (milestones, awards, trades, cards)
        for a in alloc["allocations"]:
            atype = a["type"]
            cost = a["cost"]
            if cost > mc_budget and cost > 0:
                plan_steps.append(
                    (9, f"❌ {a['action']} ({cost} MC) — нет MC", 0))
                continue

            if atype == "milestone":
                plan_steps.append((1, f"🏆 {a['action']} ({cost} MC = 5 VP)", cost))
                mc_budget -= cost
            elif atype == "award":
                plan_steps.append((2, f"💰 {a['action']} ({cost} MC)", cost))
                mc_budget -= cost
            elif atype == "trade":
                plan_steps.append((3, f"🚀 {a['action']} ({cost} MC, ~{a['value_mc']} MC value)", cost))
                mc_budget -= cost
            elif atype == "conversion":
                plan_steps.append((3, f"♻️ {a['action']} (~{a['value_mc']} MC value)", 0))
            elif atype == "card":
                name = a["action"].replace("Play ", "")
                if cost <= mc_budget:
                    plan_steps.append(
                        (a["priority"], f"▶ {a['action']} ({cost} MC, ~{a['value_mc']} MC value)", cost))
                    mc_budget -= cost
                else:
                    plan_steps.append(
                        (9, f"❌ {a['action']} ({cost} MC) — нет MC ({mc_budget} осталось)", 0))

        # Blue card actions (not in allocation — always free)
        action_cards = []
        for c in me.tableau:
            name = c.get("name", "")
            if c.get("isDisabled"):
                continue
            action_summary = summarize_action_card(name, self.effect_parser)
            if action_summary:
                action_cards.append(f"🔵 {name}: {action_summary}")

        if action_cards:
            for ac in action_cards[:4]:
                plan_steps.append((3, ac, 0))

        # Standard projects (fallback if MC left)
        _e_sinks = check_energy_sinks(state.me, has_colonies=state.has_colonies)
        sp_list = sp_efficiency(gens_left, state.me.tableau if state.me else None,
                                has_energy_sinks=_e_sinks)
        for sp_name, ratio, gives in sp_list:
            sp_cost = STANDARD_PROJECTS[sp_name]["cost"]
            if sp_cost <= mc_budget and ratio >= 0.5 and len(plan_steps) < 12:
                plan_steps.append(
                    (7, f"🔨 SP: {sp_name} ({sp_cost} MC) → {gives}", sp_cost))

        # Sell patents (weak cards)
        if hand and rated_cache:
            weak = [(n, s) for _, s, n, _, _, _ in rated_cache if s < 45]
            if weak:
                names = ", ".join(n for n, _ in weak[:3])
                plan_steps.append(
                    (8, f"📤 Продай patents: {names} (+{len(weak)} MC)", 0))

        # Display plan
        if plan_steps:
            plan_steps.sort(key=lambda x: x[0])
            self.display.section(f"📋 План на Gen {state.generation} (MC: {mc}→~{mc_budget}):")
            for priority, step, cost in plan_steps[:10]:
                cost_str = f" [{cost} MC]" if cost > 0 else ""
                print(f"    {step}{cost_str}")

    # ── Розыгрыш ──

    def _advise_play(self, state: GameState, wf: dict):
        self._advise_action(state, wf)

    # ── Or / Generic ──

    def _advise_or(self, state: GameState, wf: dict):
        self.display.clear()
        self.display.header(state, "Выбор")
        self.display.resources_bar(state)
        self._show_or_options(wf)
        self._show_game_context(state)
        print()

    def _advise_generic(self, state: GameState, wf: dict):
        self.display.clear()
        self.display.header(state, wf.get("type", "???"))
        self.display.resources_bar(state)
        title = _safe_title(wf)
        if title:
            self.display.section(title)
        self._show_or_options(wf)
        self._show_game_context(state)
        print()

    # ── Game context (milestones, awards, colonies, opponents) ──

    def _show_game_context(self, state: GameState):
        """Показать стратегию, алерты, milestones, awards, colonies, opponents, SP."""
        tips = strategy_advice(state)
        if tips:
            self.display.section("📊 Стратегия:")
            for tip in tips:
                print(f"  {Fore.CYAN}{tip}{Style.RESET_ALL}")

        alerts = _generate_alerts(state, self.effect_parser)
        if alerts:
            self.display.section("⚡ Рекомендации:")
            for alert in alerts:
                print(f"  {Fore.YELLOW}{Style.BRIGHT}{alert}{Style.RESET_ALL}")

        gens_left = _estimate_remaining_gens(state)
        _e_sinks = check_energy_sinks(state.me, has_colonies=state.has_colonies)
        sp_list = sp_efficiency(gens_left, state.me.tableau if state.me else None,
                                has_energy_sinks=_e_sinks)
        affordable_sps = [(n, r, g) for n, r, g in sp_list
                          if STANDARD_PROJECTS[n]["cost"] <= state.mc and r >= 0.45]
        if affordable_sps:
            self.display.section("🔨 Стандартные проекты:")
            for name, ratio, gives in affordable_sps[:4]:
                cost = STANDARD_PROJECTS[name]["cost"]
                eff = "отлично" if ratio >= 0.6 else "ок" if ratio >= 0.5 else "слабо"
                print(f"    {name:<18s} {cost:2d} MC → {gives:<30s} [{eff}]")

        hand = state.cards_in_hand
        if hand:
            chains = _build_action_chains(self.db, self.req_checker, hand, state)
            if chains:
                self.display.section("🔗 Цепочки:")
                for ch in chains:
                    print(f"    {Fore.CYAN}{ch}{Style.RESET_ALL}")

        if state.cards_in_hand:
            req_hints = _forecast_requirements(state, self.req_checker, state.cards_in_hand)
            if req_hints:
                self.display.section("⏳ Прогноз requirements:")
                for h in req_hints[:5]:
                    print(f"    {h}")

        if state.has_colonies:
            from .colony_advisor import format_trade_hints, format_settlement_hints
            trade_hints = format_trade_hints(state)
            if trade_hints:
                self.display.section("🚀 Торговля:")
                for h in trade_hints:
                    print(f"  {Fore.CYAN}{h}{Style.RESET_ALL}")
            settlement_hints = format_settlement_hints(state)
            if settlement_hints:
                self.display.section("🏠 Поселение:")
                for h in settlement_hints:
                    print(f"  {Fore.WHITE}{h}{Style.RESET_ALL}")

        mc_hints = _mc_flow_projection(state)
        if mc_hints:
            for h in mc_hints:
                print(f"  {Fore.WHITE}{Style.DIM}{h}{Style.RESET_ALL}")

        rush_hints = _rush_calculator(state)
        if rush_hints:
            self.display.section("🏁 Закрытие параметров:")
            for h in rush_hints:
                print(f"  {Fore.YELLOW}{h}{Style.RESET_ALL}")

        vp_proj = _vp_projection(state)
        if vp_proj:
            self.display.section("📊 Прогноз VP:")
            for h in vp_proj:
                print(f"  {Fore.WHITE}{h}{Style.RESET_ALL}")

        if state.has_ceos:
            self._show_ceo_opg_advice(state)

        if state.has_pathfinders:
            self._show_planetary_tracks(state)

        self.display.milestones_table(state)
        self.display.awards_table(state)
        if state.has_turmoil:
            self.display.turmoil_table(state)
        if state.has_colonies:
            self.display.colonies_table(state)
        self.display.map_table(state)
        self.display.opponents_table(state)

    def _show_ceo_opg_advice(self, state: GameState):
        """Show timing advice for CEO's once-per-game action."""
        ceo_name = None
        for card in state.me.tableau:
            name = card.get("name", "")
            if self.db.is_ceo(name):
                ceo_name = name
                break
        if not ceo_name:
            return

        ceo = self.db.get_ceo(ceo_name)
        if not ceo or not ceo.get("opgAction"):
            return

        gen = state.generation
        gens_left = _estimate_remaining_gens(state)

        advice = self._ceo_timing_advice(ceo_name, ceo, state, gen, gens_left)
        if advice:
            self.display.section(f"👤 CEO {ceo_name}:")
            for line in advice:
                print(f"    {Fore.MAGENTA}{line}{Style.RESET_ALL}")

    @staticmethod
    def _ceo_timing_advice(name: str, ceo: dict, state: GameState,
                           gen: int, gens_left: int) -> list[str]:
        """Generate timing advice for specific CEO OPG action."""
        opg = ceo.get("opgAction", "")
        lines = []

        if name == "Bjorn":
            steal_per = gen + 2
            lines.append(f"OPG: steal {steal_per} MC/player (gen {gen})")
            if gens_left <= 2:
                lines.append(f"ИСПОЛЬЗУЙ СЕЙЧАС! Последние gens, max value = {steal_per} MC × opponents")
            elif gen >= 5:
                lines.append(f"Хороший момент: {steal_per} MC с каждого богаче тебя")
            else:
                lines.append(f"Подожди — на gen {gen+2} будет {gen+4} MC/player")

        elif name == "Duncan":
            vp = max(0, 7 - gen)
            mc = 4 * gen
            lines.append(f"OPG сейчас: {vp} VP + {mc} MC (gen {gen})")
            if gen <= 2:
                lines.append(f"РАНО для MC! VP={vp} хорош, но MC мало")
            elif gen == 3:
                lines.append(f"Баланс: {vp} VP + {mc} MC — хороший момент")
            elif gens_left <= 2:
                lines.append(f"ИСПОЛЬЗУЙ! MC = {mc}, VP уже 0")
            else:
                next_vp = max(0, 7 - gen - 1)
                next_mc = 4 * (gen + 1)
                lines.append(f"Следующий gen: {next_vp} VP + {next_mc} MC")

        elif name == "Floyd":
            discount = 13 + 2 * gen
            lines.append(f"OPG: -{discount} MC на карту (gen {gen})")
            if gens_left <= 1:
                lines.append("ПОСЛЕДНИЙ ШАНС! Используй на самую дорогую карту в руке")
            elif discount >= 25:
                lines.append("Отличный дискаунт! Сыграй самую дорогую карту")
            else:
                lines.append(f"Подожди — на gen {gen+1} будет -{discount+2} MC")

        elif name == "Ender":
            max_swap = 2 * gen
            lines.append(f"OPG: обменяй до {max_swap} карт (gen {gen})")
            if gens_left <= 2:
                lines.append("ИСПОЛЬЗУЙ! Сбрось ненужные, найди VP-карты")
            elif max_swap >= 8:
                lines.append("Хороший масштаб для рефреша руки")

        elif name == "Karen":
            lines.append(f"OPG: выбери из {gen} прелюдий (gen {gen})")
            if gen >= 4:
                lines.append("Хороший выбор! Но прелюдии слабее поздно")
            elif gen <= 2:
                lines.append("Мало выбора, но прелюдия ценнее рано")
            if gens_left <= 2:
                lines.append("ИСПОЛЬЗУЙ СЕЙЧАС — потом будет поздно для прелюдий!")

        elif name == "Ryu":
            swaps = gen + 2
            lines.append(f"OPG: переставь до {swaps} production (gen {gen})")
            if gens_left <= 2:
                lines.append("Поздно для production swap! Используй если есть heat→MC")
            elif gen >= 3 and gen <= 5:
                lines.append("Хороший момент — ещё будут gen-ы для новой production")

        elif name == "Ulrich":
            oceans = state.oceans
            mc_now = 4 * oceans if oceans < 9 else 15
            lines.append(f"OPG: {mc_now} MC ({oceans} океанов × 4)")
            if oceans >= 7:
                lines.append(f"ИСПОЛЬЗУЙ! {mc_now} MC — отличная сумма")
            elif oceans >= 9:
                lines.append(f"Все океаны → только 15 MC (cap)")
            else:
                lines.append(f"Подожди — при 9 океанах будет 36 MC")

        elif name == "Clarke":
            plant_p = state.me.plant_prod
            heat_p = state.me.heat_prod
            lines.append(f"OPG: {plant_p+5} plants + {heat_p+5} heat + prod (gen {gen})")
            if gens_left <= 2:
                lines.append("Production поздно, но ресурсы полезны!")
            elif plant_p >= 3 or heat_p >= 3:
                lines.append("Хорошее production → большой burst ресурсов")

        elif name == "HAL9000":
            me = state.me
            prods = {"MC": me.mc_prod, "Steel": me.steel_prod, "Ti": me.ti_prod,
                     "Plant": me.plant_prod, "Energy": me.energy_prod, "Heat": me.heat_prod}
            active = sum(1 for v in prods.values() if v > 0)
            lines.append(f"OPG: -1 каждая prod ({active} активных), +4 каждого ресурса")
            if gens_left <= 1:
                lines.append("ИСПОЛЬЗУЙ! Production уже не нужна, ресурсы — да")
            elif gens_left <= 2:
                lines.append("Хороший момент — sacrifice prod для burst")

        elif name == "Stefan":
            hand_size = len(state.cards_in_hand)
            lines.append(f"OPG: продай карты по 3 MC ({hand_size} в руке = {hand_size*3} MC)")
            if gens_left <= 1 and hand_size >= 3:
                lines.append(f"ИСПОЛЬЗУЙ! Сбрось ненужное за {hand_size*3} MC")

        elif name == "Jansson":
            tiles = sum(1 for s in state.spaces
                        if s.get("color") == state.me.color and s.get("tileType") is not None)
            lines.append(f"OPG: бонусы под твоими {tiles} тайлами повторно")
            if tiles >= 5:
                lines.append("Много тайлов — хороший момент!")
            elif gens_left <= 2:
                lines.append("Финал близко, используй пока можешь")

        if not lines:
            short = opg.replace("Once per game, ", "")[:80]
            lines.append(f"OPG: {short}")
            if gens_left <= 1:
                lines.append("ИСПОЛЬЗУЙ! Последний шанс!")
            elif "generation number" in opg.lower():
                lines.append(f"Скейлится с gen ({gen}) — позже = сильнее")

        return lines

    def _show_planetary_tracks(self, state: GameState):
        """Show Pathfinders planetary track progress."""
        tracks = self.db.planetary_tracks
        if not tracks:
            return

        TRACK_ICONS = {
            "venus": "♀", "earth": "🌍", "mars": "♂",
            "jovian": "♃", "moon": "☽",
        }

        rows = []
        for track_name, track_data in tracks.items():
            if track_name == "venus" and not state.has_venus:
                continue
            if track_name == "moon" and not state.has_moon:
                continue

            my_tags = state.me.tags.get(track_name, 0)
            max_pos = track_data.get("maxPosition", 0)

            if state.planetary_tracks and track_name in state.planetary_tracks:
                position = state.planetary_tracks[track_name]
            else:
                total_tags = my_tags
                for opp in state.opponents:
                    total_tags += opp.tags.get(track_name, 0)
                position = min(total_tags, max_pos)

            icon = TRACK_ICONS.get(track_name, "")

            bonuses = track_data.get("bonuses", [])
            next_bonus = None
            for b in bonuses:
                if b["position"] > position:
                    next_bonus = b
                    break

            if next_bonus:
                tags_needed = next_bonus["position"] - position
                rising = ", ".join(next_bonus.get("risingPlayer", []))
                everyone = ", ".join(next_bonus.get("everyone", []))
                bonus_str = f"@{next_bonus['position']}: rise={rising} all={everyone} ({tags_needed} tags away)"
            else:
                bonus_str = "MAX"

            rows.append(f"  {icon} {track_name.capitalize():<7s} [{position:2d}/{max_pos}] "
                        f"my={my_tags} │ {bonus_str}")

        if rows:
            self.display.section("🛤️ Планетарные треки:")
            for r in rows:
                print(f"  {Fore.CYAN}{r}{Style.RESET_ALL}")

    def _show_or_options(self, wf: dict):
        options = wf.get("options", [])
        if not options:
            return
        self.display.section("Доступные действия:")
        for i, opt in enumerate(options, 1):
            label = opt.get("buttonLabel") or _safe_title(opt) or opt.get("type", "?")
            if not isinstance(label, str):
                label = str(label)
            print(f"    {i}. {label}")

    # ── CEO оценка ──

    def _rate_ceo_cards(self, ceos: list[dict], state: GameState) -> list[tuple]:
        """Rate CEO cards. Returns [(tier, score, name, note)]."""
        results = []
        for card in ceos:
            name = card["name"]
            ev = self.db.get(name)
            if ev:
                score = ev["score"]
            else:
                score = self._estimate_ceo_score(name, state)
            tier = _score_to_tier(score)
            note = self._get_ceo_note(name)
            results.append((tier, score, name, note))
        results.sort(key=lambda x: x[1], reverse=True)
        return results

    def _estimate_ceo_score(self, name: str, state: GameState) -> int:
        """Heuristic CEO score based on action type and compatibility."""
        ceo = self.db.get_ceo(name)
        if not ceo:
            return 50

        score = 60

        if ceo.get("actionType") == "OPG + Ongoing":
            score += 10

        compat = ceo.get("compatibility")
        if compat:
            compat_map = {
                "moon": state.has_moon,
                "colonies": state.has_colonies,
                "venus": state.has_venus,
                "turmoil": state.has_turmoil,
                "ares": "ares" in state.board_name.lower(),
                "pathfinders": state.has_pathfinders,
            }
            if not compat_map.get(compat, True):
                score -= 25

        opg = (ceo.get("opgAction") or "").lower()
        if "draw" in opg and "card" in opg:
            score += 5
        if "gain" in opg and "m€" in opg:
            score += 3
        if "production" in opg:
            score += 4
        if "tr" in opg:
            score += 3
        if "steal" in opg:
            score -= 3
        if "opponent" in opg and ("lose" in opg or "decrease" in opg):
            score -= 3

        return max(20, min(95, score))

    def _get_ceo_note(self, name: str) -> str:
        """Get a concise note for CEO card display."""
        ceo = self.db.get_ceo(name)
        if not ceo:
            return "нет данных"
        parts = []
        opg = ceo.get("opgAction", "")
        ongoing = ceo.get("ongoingEffect", "")
        compat = ceo.get("compatibility")
        if compat:
            parts.append(f"[{compat.upper()}]")
        if ceo.get("actionType") == "OPG + Ongoing":
            parts.append("OPG+Ong")
        else:
            parts.append("OPG")
        if opg:
            short = opg.replace("Once per game, ", "").replace("Once per game ", "")
            parts.append(short[:55])
        return " │ ".join(parts)

    # ── Утилиты ──

    def _rate_cards(self, cards, corp_name, generation, tags, state=None):
        """Returns [(tier, score, name, note, req_ok, req_reason)]"""
        hand_tag_providers: dict[str, list[str]] = {}
        all_hand = list(cards) + (state.cards_in_hand or [] if state else [])
        for c in all_hand:
            cname = c["name"] if isinstance(c, dict) else str(c)
            cinfo = self.db.get_info(cname)
            if cinfo:
                for t in cinfo.get("tags", []):
                    hand_tag_providers.setdefault(t.lower(), []).append(cname)

        results = []
        for card in cards:
            name = card["name"]
            card_tags = card.get("tags", [])
            if corp_name:
                score = self.synergy.adjusted_score(name, card_tags, corp_name, generation, tags, state)
            else:
                score = self.db.get_score(name)
                if is_opening_hand_context(state):
                    score += self.db.get_opening_hand_bias(name)
            tier = _score_to_tier(score)
            card_cost = card.get("cost", 0)
            note = self._get_note(name, state=state, card_cost=card_cost)
            if state:
                score, req_ok, req_reason = self.req_checker.adjust_score(score, name, state)
                _, threat_reason = self.threat.compute_delta(name, state)
                if threat_reason:
                    req_reason = f"{req_reason} │ {threat_reason}" if req_reason else threat_reason
                _, feas_reason = self.feasibility.compute_delta(name, state)
                if feas_reason:
                    req_reason = f"{req_reason} │ {feas_reason}" if req_reason else feas_reason
                tier = _score_to_tier(score)
            else:
                req_ok, req_reason = True, ""

            # Unlock chain
            if not req_ok and req_reason:
                m = re.match(r"Нужно (\d+) (\w+) tag \(есть (\d+)\)", req_reason)
                if m:
                    need, tag_name, have = int(m.group(1)), m.group(2).lower(), int(m.group(3))
                    gap = need - have
                    providers = [p for p in hand_tag_providers.get(tag_name, []) if p != name]
                    if len(providers) >= gap:
                        chain_cards = providers[:gap]
                        req_reason += f" → сыграй сначала: {', '.join(chain_cards)}"

            results.append((tier, score, name, note, req_ok, req_reason))
        results.sort(key=lambda x: x[1], reverse=True)
        return results

    @staticmethod
    def _compose_note_desc(note: str, desc: str, max_len: int = 280, desc_first: bool = False) -> str:
        note = str(note or "").strip()
        desc = str(desc or "").strip()
        if note and desc:
            if desc.lower() in note.lower():
                return note[:max_len]
            merged = f"Описание: {desc} │ {note}" if desc_first else f"{note} │ Описание: {desc}"
            return merged if len(merged) <= max_len else merged[: max_len - 3].rstrip() + "..."
        if desc:
            only_desc = f"Описание: {desc}"
            return only_desc if len(only_desc) <= max_len else only_desc[: max_len - 3].rstrip() + "..."
        return note

    def _get_note(self, name, state=None, card_cost=0):
        """Build card note with effects, effective cost, and ROI."""
        desc = self.db.get_advisor_description(name, max_len=150)
        desc_first = self.db.prefer_description_first(name)
        localized_note = self.db.get_advisor_note(name, locale="ru", max_len=110)
        if localized_note:
            return self._compose_note_desc(localized_note, desc, max_len=280, desc_first=desc_first)

        info = self.db.get_info(name)
        if not info:
            return "нет данных"

        desc_raw = info.get("description", "")
        desc = desc_raw if isinstance(desc_raw, str) else str(
            desc_raw.get("text", desc_raw.get("message", ""))) if isinstance(desc_raw, dict) else str(desc_raw)
        desc_lower = desc.lower()
        tags = info.get("tags", [])
        vp_raw = info.get("victoryPoints", "")
        has_action = info.get("hasAction", False)
        cost = card_cost if card_cost is not None else (info.get("cost") or 0)

        parts = []
        total_value = 0

        gens_left = _estimate_remaining_gens(state) if state else 3

        PROD_VAL = {"megacredit": 1.0, "m€": 1.0, "mc": 1.0, "steel": 1.6, "titanium": 2.5,
                    "plant": 1.6, "energy": 2.0, "heat": 0.8}
        PROD_SHORT = {"megacredit": "MC", "m€": "MC", "mc": "MC", "steel": "stl",
                      "titanium": "ti", "plant": "pla", "energy": "ene", "heat": "hea"}

        for m in re.finditer(r'(?:increase|raise)\s+your\s+([\w€]+)\s+production\s+(\d+)\s+step', desc, re.IGNORECASE):
            res, amt = m.group(1).lower(), int(m.group(2))
            prod_v = PROD_VAL.get(res, 1.0)
            mc_value = round(amt * prod_v * gens_left)
            short = PROD_SHORT.get(res, res[:3])
            parts.append(f"+{amt} {short}-prod (~{mc_value})")
            total_value += mc_value

        sm = re.search(r'(?:increase|raise)\s+your\s+([\w€]+)\s+production\s+(\d+)\s+step\s+for\s+each\s+(\w+)\s+tag',
                       desc, re.IGNORECASE)
        if sm:
            res, amt_per, scaling_tag = sm.group(1).lower(), int(sm.group(2)), sm.group(3).lower()
            prod_v = PROD_VAL.get(res, 1.0)
            tag_count = (state.tags.get(scaling_tag, 0) if state and hasattr(state, 'tags') else 0)
            if scaling_tag in [t.lower() for t in tags]:
                tag_count += 1
            mc_value = round(amt_per * tag_count * prod_v * gens_left)
            short = PROD_SHORT.get(res, res[:3])
            parts = [p for p in parts if short + "-prod" not in p]
            parts.append(f"+{amt_per}×{tag_count}{scaling_tag[:3]}->{short}-prod (~{mc_value})")
            total_value = max(0, total_value + mc_value)

        for m in re.finditer(r'decrease\s+(?:your|any)\s+([\w€]+)\s+production\s+(\d+)\s+step', desc, re.IGNORECASE):
            res, amt = m.group(1).lower(), int(m.group(2))
            prod_v = PROD_VAL.get(res, 1.0)
            mc_value = round(amt * prod_v * gens_left)
            short = PROD_SHORT.get(res, res[:3])
            parts.append(f"-{amt} {short}-prod")
            total_value -= mc_value

        si = re.search(r'gain\s+(\d+)\s+(\w+)\s+for\s+each\s+(city|greenery|ocean|space|building|science)', desc, re.IGNORECASE)
        if si:
            amt_per, res, scaling = int(si.group(1)), si.group(2).lower(), si.group(3).lower()
            count = 0
            if state and hasattr(state, 'me'):
                if scaling == "city":
                    count = sum(1 for s in (state.spaces or []) if s.get("tileType") == 2)
                elif scaling == "space":
                    count = state.tags.get("space", 0) if hasattr(state, 'tags') else 0
            res_val = {"plant": 2, "steel": 2, "titanium": 3, "heat": 1}.get(res, 1)
            total_gain = amt_per * count * res_val
            parts.append(f"+{amt_per}×{count}{scaling[:4]}={amt_per * count} {res} (~{total_gain})")
            total_value += total_gain

        # TR (parameter raises)
        tr_gained = 0
        for pattern, param_name, is_closed in [
            (r'raise\s+(?:the\s+)?temperature\s+(\d+)', "temp", state and state.temperature >= 8),
            (r'raise\s+(?:the\s+)?oxygen\s+(\d+)', "O₂", state and state.oxygen >= 14),
            (r'raise\s+venus\s+(\d+)', "Venus", state and state.venus >= 30),
        ]:
            tm = re.search(pattern, desc, re.IGNORECASE)
            if tm:
                amt = int(tm.group(1))
                if is_closed:
                    parts.append(f"+{amt} {param_name} (ЗАКРЫТ!)")
                else:
                    parts.append(f"+{amt} {param_name}")
                    tr_gained += amt
                    total_value += amt * 7

        for tr_pat in [r'raise\s+(?:your\s+)?(?:terraform(?:ing)?\s+rating|TR)\s+(\d+)',
                       r'gain\s+(\d+)\s+TR', r'gain\s+(\d+)\s+terraform']:
            tm = re.search(tr_pat, desc, re.IGNORECASE)
            if tm:
                amt = int(tm.group(1))
                if f"+{amt} TR" not in " ".join(parts):
                    parts.append(f"+{amt} TR")
                    tr_gained += amt
                    total_value += amt * 7
                break

        if re.search(r'place\s+(?:\d+\s+|an?\s+)?ocean', desc_lower):
            oc = len(re.findall(r'place\s+(?:\d+\s+)?ocean', desc_lower))
            closed = state and state.oceans >= 9
            if closed:
                parts.append(f"+{oc} ocean (ЗАКРЫТ!)")
            else:
                parts.append(f"+{oc} ocean")
                tr_gained += oc
                total_value += oc * 7

        if re.search(r'place\s+(?:a\s+|1\s+)?(?:greenery|forest)', desc_lower):
            parts.append("+greenery")
            total_value += 12
        if re.search(r'place\s+(?:a\s+|1\s+)?city', desc_lower):
            parts.append("+city")
            total_value += 8

        # Immediate resources
        for m in re.finditer(r'gain\s+(\d+)\s+([\w€]+)', desc, re.IGNORECASE):
            amt, res = int(m.group(1)), m.group(2).lower()
            if res in ('step', 'steps', 'tile', 'tiles', 'tag', 'tags', 'tr', 'terraform'):
                continue
            res_val = {"steel": 2, "titanium": 3, "plant": 2, "heat": 1,
                       "m€": 1, "megacredit": 1, "megacredits": 1, "mc": 1}.get(res, 1)
            short = {"m€": "MC", "megacredit": "MC", "megacredits": "MC"}.get(res, res[:5])
            total_value += amt * res_val
            parts.append(f"+{amt} {short}")

        # Scaling resource placement
        sr = re.search(r'add\s+(\d+)\s+(\w+)\s+(?:to\s+\w+\s+)?for\s+each\s+(\w+)\s+tag', desc, re.IGNORECASE)
        if sr:
            amt_per, res_type, scaling_tag = int(sr.group(1)), sr.group(2).lower(), sr.group(3).lower()
            tag_count = state.tags.get(scaling_tag, 0) if state and hasattr(state, 'tags') else 0
            if scaling_tag in [t.lower() for t in tags]:
                tag_count += 1
            total_res = amt_per * tag_count
            res_val = {"microbe": 1.5, "floater": 1.5, "animal": 3, "science": 2}.get(res_type, 1)
            mc_value = round(total_res * res_val)
            parts.append(f"+{amt_per}×{tag_count}{scaling_tag[:3]}={total_res} {res_type} (~{mc_value})")
            total_value += mc_value

        # Cards
        dm = re.search(r'draw\s+(\d+)\s+card', desc_lower)
        if dm:
            n_cards = int(dm.group(1))
            parts.append(f"+{n_cards} cards")
            total_value += n_cards * 3

        # VP
        vp_mc_value = max(1.0, min(8.0, 8.0 - gens_left * 0.7))
        if vp_raw:
            vp_str = str(vp_raw)
            parts.append(f"VP:{vp_str}")
            vm = re.match(r'^(\d+)$', vp_str)
            if vm:
                total_value += int(vm.group(1)) * vp_mc_value

        # Action
        if has_action:
            parts.append("⚡action")
            total_value += gens_left * 3

        # Effective cost with discounts
        eff_cost = cost
        pay_notes = []
        if state and hasattr(state, 'me'):
            me = state.me
            is_building = "Building" in tags
            is_space = "Space" in tags

            for tc in me.tableau:
                disc = TABLEAU_DISCOUNT_CARDS.get(tc.get("name", ""), {})
                for tag in tags:
                    if tag in disc:
                        eff_cost -= disc[tag]
                        pay_notes.append(f"-{disc[tag]} {tc.get('name', '')}")
                if "all" in disc and tags:
                    eff_cost -= disc["all"]
            eff_cost = max(0, eff_cost)

            if is_building and me.steel > 0:
                steel_cover = min(me.steel * me.steel_value, eff_cost)
                if steel_cover > 0:
                    pay_notes.append(f"steel={steel_cover}")
            if is_space and me.titanium > 0:
                ti_cover = min(me.titanium * me.ti_value, eff_cost)
                if ti_cover > 0:
                    pay_notes.append(f"ti={ti_cover}")

        # Build note
        effect_str = ", ".join(parts) if parts else desc[:45]

        if eff_cost > 0 and total_value > 0:
            roi = total_value / eff_cost
            if roi >= 1.5:
                roi_str = f" ~{total_value}v/{eff_cost}c ✓"
            elif roi >= 1.0:
                roi_str = f" ~{total_value}v/{eff_cost}c"
            else:
                roi_str = f" ~{total_value}v/{eff_cost}c ✗"
        elif eff_cost == 0 and total_value > 0:
            roi_str = " FREE✓"
        else:
            roi_str = ""

        self._last_pay_info = {
            "eff_cost": eff_cost, "pay_notes": pay_notes,
            "total_value": total_value, "raw_cost": cost,
        }
        return self._compose_note_desc(f"{effect_str}{roi_str}", desc, max_len=280, desc_first=desc_first)

    def _extract_cards_list(self, wf):
        cards = wf.get("cards", [])
        if cards:
            return [_parse_wf_card(c) for c in cards]
        for opt in wf.get("options", []):
            cards = opt.get("cards", [])
            if cards:
                return [_parse_wf_card(c) for c in cards]
        return []

    def _extract_cards_from_wf(self, wf, card_type):
        cards = wf.get("cards", [])
        if cards:
            return [_parse_wf_card(c) for c in cards]
        for opt in wf.get("options", []):
            if card_type in opt.get("type", ""):
                cards = opt.get("cards", [])
                if cards:
                    return [_parse_wf_card(c) for c in cards]
        return []

    # ── Postgame report ──

    def _show_postgame_report(self, state: GameState):
        """Выводит post-game разбор в терминал."""
        all_players = [state.me] + state.opponents
        vp_data = {}
        for p in all_players:
            bd = p.raw.get("victoryPointsBreakdown", {})
            vp_data[p.name] = {
                "total": bd.get("total", 0),
                "tr": bd.get("terraformRating", p.tr),
                "cards": bd.get("victoryPoints", 0),
                "greenery": bd.get("greenery", 0),
                "city": bd.get("city", 0),
                "milestones": bd.get("milestones", 0),
                "awards": bd.get("awards", 0),
                "details_cards": {d["cardName"]: d["victoryPoint"]
                                  for d in bd.get("detailsCards", [])},
            }

        ranked = sorted(all_players,
                        key=lambda p: (vp_data[p.name]["total"], p.mc),
                        reverse=True)
        winner = ranked[0]

        W = self.display.W
        line = "═" * W
        print(f"\n{Fore.CYAN}{line}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}  POST-GAME REPORT — Gen {state.generation}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}{line}{Style.RESET_ALL}")

        top_vp = vp_data[ranked[0].name]["total"]
        tied = [p for p in ranked if vp_data[p.name]["total"] == top_vp]
        is_tie = len(tied) > 1

        # Scoreboard
        self.display.section("── Scoreboard ──")
        if is_tie:
            print(f"  {Fore.YELLOW}⚡ НИЧЬЯ {top_vp} VP! "
                  f"Tiebreaker по MC: {winner.name} ({winner.mc} MC){Style.RESET_ALL}")
        for i, p in enumerate(ranked):
            v = vp_data[p.name]
            marker = f"{Fore.YELLOW}★{Style.RESET_ALL}" if p == winner else " "
            name_col = f"{Fore.WHITE}{Style.BRIGHT}{p.name}{Style.RESET_ALL}" if p == winner else p.name
            corp_str = f" ({p.corp})" if p.corp != "???" else ""
            mc_str = f" [{p.mc} MC]" if is_tie and vp_data[p.name]["total"] == top_vp else ""
            print(f"  {marker} {name_col:<20s}{corp_str}{mc_str}")
            print(f"      {v['total']:3d} VP  "
                  f"(TR:{v['tr']}  Cards:{v['cards']}  "
                  f"Green:{v['greenery']}  City:{v['city']}  "
                  f"MS:{v['milestones']}  AW:{v['awards']})")

        # My best cards
        my_vp = vp_data[state.me.name]
        card_vps = my_vp["details_cards"]
        if card_vps:
            self.display.section("── Мои лучшие карты ──")
            sorted_cards = sorted(card_vps.items(), key=lambda x: x[1], reverse=True)
            for name, vp_val in sorted_cards:
                if vp_val <= 0:
                    continue
                score, tier = self._tableau_live_score(state, state.me, name)
                res_str = ""
                for tc in state.me.tableau:
                    if tc["name"] == name and tc.get("resources", 0) > 0:
                        res_str = f" ({tc['resources']} res)"
                        break
                tc_color = TIER_COLORS.get(tier, "")
                print(f"    +{vp_val} VP  {name:<30s}{res_str}"
                      f"  {tc_color}[{tier}-{score}]{Style.RESET_ALL}")

        # Вклад карт
        self.display.section("── Вклад карт ──")
        for tc in state.me.tableau:
            name = tc["name"]
            card_info = self.db.get_info(name) or {}
            cost = card_info.get("cost", 0)
            vp_val = card_vps.get(name, 0)
            score, tier = self._tableau_live_score(state, state.me, name)
            res = tc.get("resources", 0)
            tc_color = TIER_COLORS.get(tier, "")

            note = self._get_note(name, state=state, card_cost=cost)
            note_clean = re.sub(r'\s*~\d+v/\d+c\s*[✓✗]?', '', note)
            note_clean = re.sub(r'\s*FREE✓', '', note_clean)
            note_clean = note_clean.strip().strip(',').strip()

            parts = []
            if vp_val > 0:
                parts.append(f"+{vp_val} VP")
            elif vp_val < 0:
                parts.append(f"{vp_val} VP")
            if note_clean and note_clean != "нет данных":
                note_clean = re.sub(r',?\s*VP:\S+', '', note_clean).strip().strip(',').strip()
                if note_clean:
                    parts.append(note_clean)

            card_tags = card_info.get("tags", [])
            if card_tags and isinstance(card_tags, list):
                parts.append(f"[{','.join(t[:3] for t in card_tags)}]")

            contrib_str = " │ ".join(parts) if parts else "???"
            res_str = f" ({res}res)" if res else ""

            card_type = card_info.get("type", "")
            if cost > 0 or card_type not in ("corporation", "prelude", "ceo"):
                print(f"    {tc_color}{tier}-{score:2d}{Style.RESET_ALL}"
                      f"  {name:<30s}{res_str}  ({cost} MC) → {contrib_str}")

        # Статистика
        self.display.section("── Статистика ──")
        tableau_size = len(state.me.tableau)
        total_cards_vp = my_vp["cards"]
        vp_per_card = total_cards_vp / tableau_size if tableau_size > 0 else 0
        print(f"    Сыграно карт: {tableau_size} │ "
              f"VP от карт: {total_cards_vp} │ "
              f"VP/card: {vp_per_card:.2f}")
        print(f"    Greenery: {my_vp['greenery']} VP │ "
              f"Cities: {my_vp['city']} VP │ "
              f"TR: {my_vp['tr']}")
        print(f"    Milestones: {my_vp['milestones']} VP │ "
              f"Awards: {my_vp['awards']} VP │ "
              f"Total: {my_vp['total']} VP")

        # Milestones & Awards
        ms_parts = []
        for m in state.milestones:
            if m.get("claimed_by"):
                ms_parts.append(f"★ {m['name']} ({m['claimed_by']})")
        aw_parts = []
        for aw in state.awards:
            if aw.get("funded_by"):
                aw_parts.append(f"★ {aw['name']} (funded: {aw['funded_by']})")

        if ms_parts or aw_parts:
            self.display.section("── Milestones & Awards ──")
            if ms_parts:
                print(f"    MS: {' │ '.join(ms_parts)}")
            if aw_parts:
                print(f"    AW: {' │ '.join(aw_parts)}")

        # Оценка vs реальность
        overrated = []
        underrated = []
        for tc in state.me.tableau:
            name = tc["name"]
            score, tier = self._tableau_live_score(state, state.me, name)
            vp_val = card_vps.get(name, 0)
            card_info = self.db.get_info(name) or {}
            card_data = self.db.get(name) or {}
            cost = card_info.get("cost", 0)
            reasoning = (card_data.get("reasoning", "") + " " +
                         str(card_info.get("description", ""))).lower()
            has_indirect_value = any(kw in reasoning for kw in [
                "prod", "tr", "ocean", "temp", "oxygen", "venus", "terraform",
                "rebate", "discount", "action", "draw", "card"])
            if score >= 70 and vp_val == 0 and cost > 8 and not has_indirect_value:
                overrated.append((name, score, tier, cost))
            elif score <= 55 and vp_val >= 3:
                underrated.append((name, score, tier, vp_val))

        if overrated or underrated:
            self.display.section("── Оценка vs реальность ──")
            for name, score, tier, cost in overrated:
                tc_color = TIER_COLORS.get(tier, "")
                print(f"    {Fore.RED}▼{Style.RESET_ALL} {name} "
                      f"{tc_color}[{tier}-{score}]{Style.RESET_ALL} "
                      f"— 0 VP при cost {cost} MC (переоценена?)")
            for name, score, tier, vp_val in underrated:
                tc_color = TIER_COLORS.get(tier, "")
                print(f"    {Fore.GREEN}▲{Style.RESET_ALL} {name} "
                      f"{tc_color}[{tier}-{score}]{Style.RESET_ALL} "
                      f"— {vp_val} VP (недооценена?)")

        # Все игроки: tableau + VP breakdown
        self.display.section("── Все игроки: анализ карт ──")
        for p in ranked:
            v = vp_data[p.name]
            is_me = p.name == state.me.name
            marker = "🔴" if is_me else "  "
            print(f"\n  {marker} {Style.BRIGHT}{p.name}{Style.RESET_ALL}"
                  f" ({p.corp}) — {v['total']} VP")

            p_card_vps = v["details_cards"]
            p_tableau = p.raw.get("tableau", []) or []
            tableau_entries = []
            for tc in p_tableau:
                tc_name = tc if isinstance(tc, str) else tc.get("name", "?")
                card_vp = p_card_vps.get(tc_name, 0)
                score, tier = self._tableau_live_score(state, p, tc_name)
                card_info = self.db.get_info(tc_name)
                cost = card_info.get("cost", 0) if card_info else 0
                res = 0
                if isinstance(tc, dict):
                    res = tc.get("resources", 0)
                tableau_entries.append((tc_name, tier, score, cost, card_vp, res))

            tableau_entries.sort(key=lambda x: (-x[4], -x[2]))
            for tc_name, tier, score, cost, card_vp, res in tableau_entries:
                tc_color = TIER_COLORS.get(tier, "")
                vp_str = f"+{card_vp} VP" if card_vp > 0 else f" {card_vp} VP" if card_vp < 0 else "     "
                res_str = f" ({res}res)" if res else ""
                print(f"      {vp_str}  {tc_color}{tier}-{score:2d}{Style.RESET_ALL}"
                      f"  {tc_name}{res_str}")

            played_count = len(tableau_entries)
            total_card_vp = sum(e[4] for e in tableau_entries)
            avg_score = sum(e[2] for e in tableau_entries) / played_count if played_count else 0
            print(f"      ─── {played_count} карт │ "
                  f"VP от карт: {total_card_vp} │ "
                  f"Avg score: {avg_score:.0f}")

        # Timeline: карты по генерациям (из логов)
        detail_log = self._logger.detail_log_path
        if detail_log and os.path.exists(detail_log):
            self.display.section("── Timeline: карты по генерациям ──")
            try:
                with open(detail_log, "r", encoding="utf-8") as f:
                    events = [json.loads(line) for line in f if line.strip()]
                gen_plays: dict[int, dict[str, list[str]]] = {}
                for ev in events:
                    if ev.get("type") == "state_diff":
                        data = ev.get("data", {})
                        gen = data.get("gen", 0)
                        for player_name, pc in data.get("player_changes", {}).items():
                            played = pc.get("played", [])
                            if played:
                                gen_plays.setdefault(gen, {}).setdefault(player_name, []).extend(played)
                for gen in sorted(gen_plays.keys()):
                    print(f"    Gen {gen}:")
                    for player_name, cards in gen_plays[gen].items():
                        cards_str = ", ".join(cards)
                        print(f"      {player_name}: {cards_str}")
            except Exception:
                pass

        print(f"\n{'─' * W}\n")

    def _auto_add_game(self):
        """Автоматически добавляет завершённую игру в games_db."""
        try:
            from tm_game_analyzer import resolve_game, load_db, save_db
            record = resolve_game(self.player_id)
            if not record:
                return
            if record.get("phase") != "end":
                return
            db = load_db()
            game_id = record["game_id"]
            if game_id in db["games"]:
                return
            db["games"][game_id] = record
            save_db(db)
            winner = next((p for p in record["players"] if p.get("winner")), None)
            w_name = winner["name"] if winner else "?"
            w_vp = winner["total_vp"] if winner else 0
            print(f"\n  {Fore.GREEN}✓ Игра {game_id} автоматически сохранена в БД "
                  f"(Gen {record['generation']}, Winner: {w_name} {w_vp}VP){Style.RESET_ALL}")
        except Exception as e:
            print(f"\n  {Fore.YELLOW}⚠ Auto-add не удался: {e}{Style.RESET_ALL}")

    def _shutdown(self, sig, frame):
        print(f"\n\n{Fore.YELLOW}Выход...{Style.RESET_ALL}\n")
        self.running = False
        sys.exit(0)
