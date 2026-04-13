"""Event stream emitter — JSONL events for Claude Code Monitor integration.

Каждое событие печатается одной строкой в stdout и немедленно flush'ится,
чтобы Claude Code Monitor получил его как отдельное уведомление.

Набор событий:
- turn_start        — waitingFor стал не-None в обычной фазе (твой ход)
- draft             — turn_start в draft-фазе, с картами для пика
- turn_end          — waitingFor исчез (ход ушёл к оппонентам)
- phase_change      — смена фазы игры (drafting/research/action/end)
- gen_change        — новое поколение
- milestone_threat  — оппонент получил claimable=true для незаклеймленной milestone
- game_end          — игра завершена

Приватность: события НЕ содержат скрытую информацию оппонентов
(их руки, драфт-пики, скрытые корпорации). Только публичные данные
(tableau, milestones, TR, production — всё видно в UI игры).
"""

import json
import sys

from .analysis import _safe_title


class EventEmitter:
    """Детектирует значимые переходы state и печатает JSONL-события."""

    def __init__(self, card_db=None):
        self._db = card_db  # CardDatabase для базовых оценок карт в событиях
        self._prev_wf_sig = None
        self._prev_phase = None
        self._prev_gen = None
        self._emitted_end = False
        # (milestone_name, color) для дедупа milestone_threat
        self._emitted_claimables: set = set()
        # Трекинг изменений карт для detailed logs
        self._prev_drafted_names: set = set()
        self._prev_tableau_names: set = set()
        self._prev_hand_names: set = set()
        self._first_state = True  # пропускаем diff при первом state
        # Трекинг claimed/funded status для emission
        self._prev_milestone_claimed: dict = {}  # name → claimed_by
        self._prev_award_funded: dict = {}  # name → funded_by

    def _card_eval(self, name: str) -> dict:
        """Базовая оценка карты из evaluations.json. Без контекстных бонусов.

        Формат компактный: null score/tier пропускаются чтобы JSON не раздувался
        (Monitor truncate'ит события на ~500 chars).
        """
        if not self._db:
            return {"name": name}
        data = self._db.get(name)
        if not data:
            return {"name": name}
        result = {"name": name}
        score = data.get("score")
        tier = data.get("tier")
        if score is not None:
            result["score"] = score
        if tier is not None:
            result["tier"] = tier
        return result

    def emit(self, event: dict) -> None:
        """Печатает одно JSON-событие в stdout с немедленным flush."""
        sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
        sys.stdout.flush()

    def on_state(self, state) -> None:
        """Проанализировать state, эмитить события на значимых переходах."""
        wf = state.waiting_for or {}
        wf_sig = (wf.get("type", ""), _safe_title(wf)) if wf else None
        phase = state.phase
        gen = state.generation
        me_color = state.me.color

        # Phase change (идёт до turn_start чтобы Claude мог перенастроиться)
        if self._prev_phase is not None and self._prev_phase != phase:
            self.emit({
                "ev": "phase_change",
                "from": self._prev_phase,
                "to": phase,
                "gen": gen,
            })

        # Generation change
        if self._prev_gen is not None and self._prev_gen != gen:
            self.emit({
                "ev": "gen_change",
                "from": self._prev_gen,
                "to": gen,
            })

        # Turn start / draft
        if wf and self._prev_wf_sig != wf_sig:
            me = state.me
            common = {
                "gen": gen,
                "phase": phase,
                "wf_type": wf.get("type", ""),
                "title": _safe_title(wf),
                "mc": me.mc,
                "tr": me.tr,
                "hand_size": len(state.cards_in_hand or []),
            }
            if phase == "drafting":
                # В draft hand не нужен — нужны только cards из пула.
                event = {"ev": "draft", **common}
                cards = self._extract_draft_cards(wf)
                if cards:
                    event["cards"] = [self._card_eval(n) for n in cards] if self._db else cards
            else:
                # В turn_start hand критичен для совета какую карту играть.
                if state.cards_in_hand and self._db:
                    common["hand"] = [self._card_eval(c["name"]) for c in state.cards_in_hand]
                event = {"ev": "turn_start", **common}
            self.emit(event)

        # Turn end
        if self._prev_wf_sig is not None and not wf:
            self.emit({
                "ev": "turn_end",
                "gen": gen,
                "phase": phase,
            })

        # Milestone threats — оппонент стал claimable для незаклеймленной milestone
        self._check_milestone_threats(state, me_color, gen)

        # Milestone/Award claim tracking — detect when someone claims/funds
        self._check_milestone_award_claims(state, gen)

        # Track card changes (diff hand/drafted/tableau for detailed event logs)
        self._check_card_changes(state, gen, phase)

        self._prev_wf_sig = wf_sig
        self._prev_phase = phase
        self._prev_gen = gen

    def on_game_end(self, state) -> None:
        """Эмитить финальное событие. Идемпотентно — второй вызов игнорируется."""
        if self._emitted_end:
            return
        self._emitted_end = True
        me = state.me
        self.emit({
            "ev": "game_end",
            "gen": state.generation,
            "mc": me.mc,
            "tr": me.tr,
        })

    def _check_card_changes(self, state, gen: int, phase: str) -> None:
        """Детектить изменения в drafted_cards, tableau, cards_in_hand и эмитить события.

        Типы событий:
        - draft_pick   — карта добавлена в drafted_cards (во время drafting phase)
        - card_played  — карта появилась в tableau (action phase)
        - card_bought  — карта появилась в hand во время research phase
        - card_drawn   — карта появилась в hand в action phase через card effect

        ВАЖНО: phase transitions происходят between on_state calls. Когда research
        заканчивается и начинается action, карты купленные в research появятся
        только когда phase уже = 'action'. Поэтому мы также смотрим на prev_phase
        чтобы правильно классифицировать research buys.
        """
        drafted_names = {c["name"] for c in (state.drafted_cards or [])}
        tableau_names = {c["name"] for c in (state.me.tableau or [])}
        hand_names = {c["name"] for c in (state.cards_in_hand or [])}
        prev_phase = self._prev_phase  # сохранено от прошлого on_state, ещё не обновлено

        if self._first_state:
            # При первом state — просто сохраняем baseline без эмиссии
            self._prev_drafted_names = drafted_names
            self._prev_tableau_names = tableau_names
            self._prev_hand_names = hand_names
            self._first_state = False
            return

        # Tableau growth → card_played (definitive, owner-visible)
        new_in_tableau = tableau_names - self._prev_tableau_names
        for name in new_in_tableau:
            self.emit({
                "ev": "card_played",
                "card": name,
                "gen": gen,
                "phase": phase,
            })

        # Drafted cards growth → draft_pick (during drafting phase или при переходе)
        if phase == "drafting" or prev_phase == "drafting":
            new_drafted = drafted_names - self._prev_drafted_names
            for name in new_drafted:
                self.emit({
                    "ev": "draft_pick",
                    "card": name,
                    "gen": gen,
                })

        # Hand growth during OR right after research → card_bought
        # (prev_phase == research catches the transition from research to action,
        # where bought cards appear in hand AFTER phase already flipped to 'action')
        new_in_hand = hand_names - self._prev_hand_names - new_in_tableau
        if phase == "research" or prev_phase == "research":
            for name in new_in_hand:
                self.emit({
                    "ev": "card_bought",
                    "card": name,
                    "gen": gen,
                })
        elif phase not in ("drafting", "research") and prev_phase not in ("drafting", "research"):
            # Hand growth в action phase (не transition from research)
            # → card_drawn через card effect (HTL keep, Invention Contest, colony, etc.)
            for name in new_in_hand:
                self.emit({
                    "ev": "card_drawn",
                    "card": name,
                    "gen": gen,
                    "phase": phase,
                })

        # Hand shrink без tableau growth → card_discarded
        # (Hygiea colony effect, Sell Patent, Invention Contest discard, forced discard)
        discarded = self._prev_hand_names - hand_names - new_in_tableau
        for name in discarded:
            self.emit({
                "ev": "card_discarded",
                "card": name,
                "gen": gen,
                "phase": phase,
            })

        self._prev_drafted_names = drafted_names
        self._prev_tableau_names = tableau_names
        self._prev_hand_names = hand_names

    def _check_milestone_threats(self, state, me_color: str, gen: int) -> None:
        """Эмитить milestone_threat когда оппонент получил claimable=true."""
        for m in state.milestones:
            if m.get("claimed_by"):
                continue  # уже заклеймлена — не угроза
            name = m.get("name", "?")
            for color, data in m.get("scores", {}).items():
                if color == me_color:
                    continue  # сам игрок — не угроза
                if not data.get("claimable"):
                    continue
                key = (name, color)
                if key in self._emitted_claimables:
                    continue
                self._emitted_claimables.add(key)
                self.emit({
                    "ev": "milestone_threat",
                    "milestone": name,
                    "player_color": color,
                    "score": data.get("score", 0),
                    "gen": gen,
                })

    def _check_milestone_award_claims(self, state, gen: int) -> None:
        """Эмитить milestone_claimed / award_funded когда кто-то их забирает.

        Критично для Claude — без этого советчик продолжает рекомендовать
        claim milestone после того как оппонент его забрал (stale state).

        При первом state baseline собирается без эмиссии — иначе Monitor
        получит шквал событий для уже-заклеймленных milestones.
        """
        first_run = not self._prev_milestone_claimed and not self._prev_award_funded

        # Milestones
        for m in state.milestones:
            name = m.get("name", "?")
            claimed_by = m.get("claimed_by")
            prev = self._prev_milestone_claimed.get(name)
            if not first_run and claimed_by and claimed_by != prev:
                self.emit({
                    "ev": "milestone_claimed",
                    "milestone": name,
                    "by": claimed_by,
                    "gen": gen,
                })
            self._prev_milestone_claimed[name] = claimed_by

        # Awards
        for a in state.awards:
            name = a.get("name", "?")
            funded_by = a.get("funded_by")
            prev = self._prev_award_funded.get(name)
            if not first_run and funded_by and funded_by != prev:
                self.emit({
                    "ev": "award_funded",
                    "award": name,
                    "by": funded_by,
                    "gen": gen,
                })
            self._prev_award_funded[name] = funded_by

    @staticmethod
    def _extract_draft_cards(wf: dict) -> list:
        """Извлечь имена карт из waitingFor в draft-фазе."""
        def _names(card_list):
            out = []
            for c in card_list:
                if isinstance(c, dict):
                    out.append(c.get("name", "?"))
                else:
                    out.append(str(c))
            return out

        cards = wf.get("cards", [])
        if cards:
            return _names(cards)
        for opt in wf.get("options", []):
            inner = opt.get("cards", [])
            if inner:
                return _names(inner)
        return []
