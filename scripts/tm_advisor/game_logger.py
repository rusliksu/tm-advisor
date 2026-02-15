"""GameLogger — логирование событий игры в JSONL."""

import os
import re
import json
from datetime import datetime


class GameLogger:
    """Logging engine для AdvisorBot: offers, state diffs, game events."""

    def __init__(self, game_log_path: str, offer_log_path: str,
                 effect_parser=None, combo_detector=None, db=None):
        self._game_log_path = game_log_path
        self._offer_log_path = offer_log_path
        self._effect_parser = effect_parser
        self._combo_detector = combo_detector
        self._db = db
        self._game_session_id: str | None = None
        self._offers_logged: set = set()
        self._game_ended = False
        self._prev_state_snapshot: dict | None = None
        self._detail_log_path: str | None = None
        self._player_log_paths: dict[str, str] = {}

    @property
    def game_session_id(self) -> str | None:
        return self._game_session_id

    @property
    def game_ended(self) -> bool:
        return self._game_ended

    @game_ended.setter
    def game_ended(self, value: bool):
        self._game_ended = value

    @property
    def detail_log_path(self) -> str | None:
        return self._detail_log_path

    def init_game_session(self, state):
        """Инициализирует game session ID и per-game лог при первом подключении."""
        player_names = sorted([state.me.name] + [o.name for o in state.opponents])
        self._game_session_id = f"g{state.game_age}_{state.me.name}"
        os.makedirs(self._game_log_path, exist_ok=True)

        # Per-game detail log
        safe_id = re.sub(r'[^\w\-]', '_', self._game_session_id)
        ts_str = datetime.now().strftime('%Y%m%d_%H%M%S')
        self._detail_log_path = os.path.join(
            self._game_log_path, f"game_{safe_id}_{ts_str}.jsonl")

        # Per-player log paths
        self._player_log_paths = {}
        for p in [state.me] + state.opponents:
            safe_name = re.sub(r'[^\w\-]', '_', p.name)
            self._player_log_paths[p.name] = os.path.join(
                self._game_log_path, f"player_{safe_name}_{safe_id}_{ts_str}.jsonl")

        # Log game start
        game_start_data = {
            "players": player_names,
            "player_count": 1 + len(state.opponents),
            "board": state.board_name,
            "wgt": state.is_wgt,
            "draft": state.is_draft,
            "colonies": state.has_colonies,
            "turmoil": state.has_turmoil,
            "venus": state.has_venus,
            "pathfinders": state.has_pathfinders,
            "ceos": state.has_ceos,
        }
        self.log_game_event("game_start", game_start_data)
        # Write game start to each player log
        for pname in self._player_log_paths:
            self.log_player_event(pname, "game_start", game_start_data)

    def log_offer(self, phase: str, card_names: list[str], state, extra: dict = None):
        """Логирует предложение карт в JSONL (offers_log)."""
        if not card_names or not self._game_session_id:
            return
        dedup_key = (state.generation, phase, tuple(sorted(card_names)))
        if dedup_key in self._offers_logged:
            return
        self._offers_logged.add(dedup_key)

        entry = {
            "ts": datetime.now().isoformat(),
            "game_id": self._game_session_id,
            "player": state.me.name,
            "phase": phase,
            "gen": state.generation,
            "cards": card_names,
            "player_count": 1 + len(state.opponents),
        }
        if extra:
            entry.update(extra)

        os.makedirs(os.path.dirname(self._offer_log_path), exist_ok=True)
        with open(self._offer_log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def log_player_event(self, player_name: str, event_type: str, data: dict):
        """Логирует событие в per-player лог."""
        log_path = self._player_log_paths.get(player_name)
        if not log_path:
            return
        entry = {
            "ts": datetime.now().isoformat(),
            "game_id": self._game_session_id,
            "player": player_name,
            "event": event_type,
        }
        entry.update(data)
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def log_game_event(self, event_type: str, data: dict):
        """Логирует детальное событие в per-game лог."""
        if not self._game_session_id:
            return
        entry = {
            "ts": datetime.now().isoformat(),
            "game_id": self._game_session_id,
            "event": event_type,
        }
        entry.update(data)

        log_path = self._detail_log_path
        if not log_path:
            return
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def snapshot_state(self, state) -> dict:
        """Снимок состояния игры для диффа."""
        players = {}
        for p in [state.me] + state.opponents:
            players[p.name] = {
                "corp": p.corp,
                "tr": p.tr,
                "mc": p.mc,
                "steel": p.raw.get("steel", 0),
                "titanium": p.raw.get("titanium", 0),
                "plants": p.raw.get("plants", 0),
                "energy": p.raw.get("energy", 0),
                "heat": p.raw.get("heat", 0),
                "cards": p.raw.get("handSize", p.raw.get("cardsInHandNbr", 0)),
                "actions": p.raw.get("actionsThisGeneration", []),
                "tags": dict(p.tags) if hasattr(p, 'tags') and isinstance(p.tags, dict) else {},
                "tableau": [c if isinstance(c, str) else c.get("name", "?")
                            for c in (p.raw.get("tableau", []) or [])],
            }
        return {
            "gen": state.generation,
            "oxygen": state.oxygen,
            "temperature": state.temperature,
            "oceans": state.oceans,
            "venus": state.venus,
            "phase": state.phase,
            "players": players,
        }

    def _enrich_card_played(self, card_name: str, player_name: str,
                             prev_player: dict, curr_player: dict,
                             prev_snap: dict, curr_snap: dict,
                             state) -> dict:
        """Создаёт обогащённый card_played event с эффектами и синергиями."""
        event = {
            "gen": curr_snap.get("gen"),
            "phase": curr_snap.get("phase"),
            "player": player_name,
            "card": card_name,
        }

        # Card info from database
        if self._db:
            info = self._db.get_info(card_name)
            if info:
                event["cost"] = info.get("cost", 0)
                event["tags"] = info.get("tags", [])
            event["tier"] = self._db.get_tier(card_name)
            score = self._db.get_score(card_name)
            if score:
                event["score"] = score

        # Parsed effects from CardEffectParser
        if self._effect_parser:
            eff = self._effect_parser.get(card_name)
            if eff:
                effects = {}
                if eff.tr_gain:
                    effects["tr_gain"] = eff.tr_gain
                if eff.production_change:
                    effects["production"] = eff.production_change
                if eff.gains_resources:
                    effects["immediate"] = eff.gains_resources
                if eff.placement:
                    effects["placement"] = eff.placement
                if eff.draws_cards:
                    effects["cards_drawn"] = eff.draws_cards
                if eff.attacks:
                    effects["attacks"] = eff.attacks
                if eff.vp_per:
                    effects["vp"] = eff.vp_per
                if effects:
                    event["effects"] = effects

        # Synergies triggered by this card in existing tableau
        if self._combo_detector and self._effect_parser:
            prev_tableau = prev_player.get("tableau", [])
            triggered = self._find_triggered_synergies(card_name, prev_tableau)
            if triggered:
                event["synergies_triggered"] = triggered

        # State delta (actual resource/param changes)
        delta = {}
        for res in ("tr", "mc", "steel", "titanium", "plants", "energy", "heat"):
            old_val = prev_player.get(res, 0)
            new_val = curr_player.get(res, 0)
            if old_val != new_val:
                delta[res] = [old_val, new_val]
        # Global params
        for param in ("oxygen", "temperature", "venus"):
            old_val = prev_snap.get(param, 0)
            new_val = curr_snap.get(param, 0)
            if old_val != new_val:
                delta[param] = [old_val, new_val]
        if delta:
            event["state_delta"] = delta

        return event

    def _find_triggered_synergies(self, card_name: str, tableau: list[str]) -> list[str]:
        """Определяет какие карты в tableau срабатывают при розыгрыше card_name."""
        triggered = []
        eff = self._effect_parser.get(card_name)
        if not eff:
            return triggered

        card_info = self._db.get_info(card_name) if self._db else {}
        card_tags = [t.lower() for t in (card_info.get("tags", []) if card_info else [])]

        for tname in tableau:
            teff = self._effect_parser.get(tname)
            if not teff:
                continue

            # Check triggers (e.g. "when you play an Earth tag")
            for trig in teff.triggers:
                trigger_on = trig.get("on", "").lower()
                for tag in card_tags:
                    if "play" in trigger_on and tag in trigger_on:
                        effect_text = trig.get("effect", "?")
                        if len(effect_text) > 60:
                            effect_text = effect_text[:57] + "..."
                        triggered.append(f"{tname} → {effect_text}")
                        break

            # Check resource adders that target this card's resource type
            if eff.resource_holds and eff.resource_type:
                for add in teff.adds_resources:
                    if add.get("target") in ("any", "another"):
                        raw_type = add.get("type", "")
                        if eff.resource_type.lower() in raw_type.lower():
                            triggered.append(f"{tname} → can add {raw_type} here")

            # Check if this card adds to existing targets
            for add in eff.adds_resources:
                if add.get("target") in ("any", "another"):
                    if teff.resource_holds and teff.resource_type:
                        raw_type = add.get("type", "")
                        if teff.resource_type.lower() in raw_type.lower():
                            triggered.append(f"{card_name} → feeds {tname}")

        return triggered

    def diff_and_log_state(self, state):
        """Сравнивает текущий стейт с предыдущим и логирует изменения."""
        snap = self.snapshot_state(state)
        prev = self._prev_state_snapshot
        self._prev_state_snapshot = snap

        if prev is None:
            self.log_game_event("state_snapshot", snap)
            # Write initial state to per-player logs
            for pname, pdata in snap.get("players", {}).items():
                self.log_player_event(pname, "initial_state", {
                    "gen": snap.get("gen"), "phase": snap.get("phase"), **pdata,
                })
            return

        changes = {}

        # Global parameter changes
        for param in ("oxygen", "temperature", "oceans", "venus", "gen"):
            if snap.get(param) != prev.get(param):
                changes[param] = {"from": prev.get(param), "to": snap.get(param)}

        # Phase change
        if snap.get("phase") != prev.get("phase"):
            changes["phase"] = {"from": prev.get("phase"), "to": snap.get("phase")}

        # Per-player changes
        player_changes = {}
        for name, psnap in snap["players"].items():
            pprev = prev.get("players", {}).get(name, {})
            pc = {}
            # New cards in tableau (played)
            prev_tableau = set(pprev.get("tableau", []))
            curr_tableau = set(psnap.get("tableau", []))
            new_played = curr_tableau - prev_tableau
            if new_played:
                pc["played"] = list(new_played)

                # Enhanced: emit card_played event for each new card
                for card in new_played:
                    try:
                        card_event = self._enrich_card_played(
                            card, name, pprev, psnap, prev, snap, state)
                        self.log_game_event("card_played", card_event)
                        self.log_player_event(name, "card_played", card_event)
                    except Exception:
                        pass  # Don't break logging on enrichment errors

            # TR change
            if psnap.get("tr", 0) != pprev.get("tr", 0):
                pc["tr"] = {"from": pprev.get("tr"), "to": psnap.get("tr")}
            # Resource changes
            for res in ("mc", "steel", "titanium", "plants", "energy", "heat"):
                if psnap.get(res, 0) != pprev.get(res, 0):
                    pc[res] = {"from": pprev.get(res, 0), "to": psnap.get(res, 0)}
            # Hand size change
            if psnap.get("cards", 0) != pprev.get("cards", 0):
                pc["hand_size"] = {"from": pprev.get("cards", 0), "to": psnap.get("cards", 0)}
            if pc:
                player_changes[name] = pc

        if changes or player_changes:
            event = {"gen": state.generation, "phase": state.phase}
            if changes:
                event["global_changes"] = changes
            if player_changes:
                event["player_changes"] = player_changes
            self.log_game_event("state_diff", event)

            # Per-player logs: write each player's changes to their own file
            for pname, pc in player_changes.items():
                player_event = {"gen": state.generation, "phase": state.phase}
                if changes:
                    player_event["global_changes"] = changes
                player_event["changes"] = pc
                self.log_player_event(pname, "action", player_event)

    def log_game_end(self, state):
        """Логирует конец игры."""
        if self._game_ended:
            return
        self._game_ended = True

        # Tableau extraction
        def get_tableau(p):
            raw_tab = p.raw.get("tableau", []) or []
            return [c if isinstance(c, str) else c.get("name", "?") for c in raw_tab]

        all_players = [state.me] + state.opponents
        # Winner
        best = max(all_players,
                   key=lambda p: p.raw.get("victoryPointsBreakdown", {}).get("total", 0))

        # Offers log entry
        entry = {
            "ts": datetime.now().isoformat(),
            "game_id": self._game_session_id,
            "player": state.me.name,
            "phase": "game_end",
            "gen": state.generation,
            "corp": state.me.corp,
            "tableau": get_tableau(state.me),
            "vp": state.me.raw.get("victoryPointsBreakdown", {}).get("total", 0),
            "winner": best.name,
            "player_count": 1 + len(state.opponents),
        }
        os.makedirs(os.path.dirname(self._offer_log_path), exist_ok=True)
        with open(self._offer_log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

        # Detailed game end log
        players_summary = {}
        for p in all_players:
            vp_bd = p.raw.get("victoryPointsBreakdown", {})
            players_summary[p.name] = {
                "corp": p.corp,
                "vp_total": vp_bd.get("total", 0),
                "vp_breakdown": vp_bd,
                "tr": p.tr,
                "tableau": get_tableau(p),
                "tags": dict(p.tags) if hasattr(p, 'tags') and isinstance(p.tags, dict) else {},
            }
        self.log_game_event("game_end", {
            "gen": state.generation,
            "winner": best.name,
            "players": players_summary,
        })

        # Per-player game end logs
        for p in all_players:
            vp_bd = p.raw.get("victoryPointsBreakdown", {})
            self.log_player_event(p.name, "game_end", {
                "gen": state.generation,
                "winner": best.name,
                "corp": p.corp,
                "tr": p.tr,
                "vp_total": vp_bd.get("total", 0),
                "vp_breakdown": vp_bd,
                "tableau": get_tableau(p),
                "tags": dict(p.tags) if hasattr(p, 'tags') and isinstance(p.tags, dict) else {},
            })


class DraftTracker:
    """Трекер драфт-цепочки: что взяли, что передали."""

    def __init__(self):
        self._draft_memory: list[dict] = []
        self._last_draft_cards: list[str] = []
        self._current_gen_picks: list[dict] = []

    @property
    def draft_memory(self) -> list[dict]:
        return self._draft_memory

    @property
    def last_draft_cards(self) -> list[str]:
        return self._last_draft_cards

    @last_draft_cards.setter
    def last_draft_cards(self, value: list[str]):
        self._last_draft_cards = value

    def on_offer(self, generation: int, current_names: list[str],
                 logger: GameLogger, state, db=None) -> dict | None:
        """Обрабатывает новый драфт-пак. Возвращает pick info если обнаружен пик."""
        pick_info = None

        if self._last_draft_cards:
            prev_set = set(self._last_draft_cards)
            curr_set = set(current_names)
            if prev_set != curr_set:
                kept = prev_set - curr_set
                if len(kept) == 1:
                    kept_name = kept.pop()
                    passed = [n for n in self._last_draft_cards if n != kept_name]
                    mem = {
                        "gen": generation,
                        "kept": kept_name,
                        "passed": passed,
                    }
                    self._draft_memory.append(mem)

                    # Enriched pick with score/tier
                    pick_entry = {
                        "pack": len(self._current_gen_picks) + 1,
                        "picked": kept_name,
                        "passed": passed,
                    }
                    if db:
                        sc = db.get_score(kept_name)
                        if sc:
                            pick_entry["picked_score"] = sc
                            pick_entry["picked_tier"] = db.get_tier(kept_name)
                        passed_scores = []
                        for p in passed:
                            ps = db.get_score(p)
                            if ps:
                                passed_scores.append({"name": p, "score": ps, "tier": db.get_tier(p)})
                        if passed_scores:
                            pick_entry["passed_detail"] = passed_scores

                    self._current_gen_picks.append(pick_entry)
                    logger.log_offer("draft_pick", [kept_name], state,
                                     extra={"passed": passed,
                                            "picked_score": pick_entry.get("picked_score"),
                                            "picked_tier": pick_entry.get("picked_tier")})
                    pick_info = mem

        self._last_draft_cards = current_names
        return pick_info

    def on_phase_change(self, new_phase: str, generation: int, logger: GameLogger):
        """При выходе из draft записывает полный draft_chain."""
        if self._current_gen_picks and "draft" not in new_phase:
            # Last pick: the final card is auto-kept
            if self._last_draft_cards and len(self._last_draft_cards) == 1:
                self._current_gen_picks.append({
                    "pack": len(self._current_gen_picks) + 1,
                    "picked": self._last_draft_cards[0],
                })

            logger.log_game_event("draft_chain", {
                "gen": generation,
                "picks": self._current_gen_picks,
            })
            self._current_gen_picks = []
            self._last_draft_cards = []

    def get_passed_strong(self, generation: int, db) -> list[str]:
        """Возвращает сильные карты, переданные соседу в текущем gen."""
        passed_strong = []
        for mem in self._draft_memory:
            if mem["gen"] == generation:
                for p in mem["passed"]:
                    sc = db.get_score(p)
                    if sc >= 65:
                        passed_strong.append(f"{p}({sc})")
        return passed_strong
