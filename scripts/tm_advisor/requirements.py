"""RequirementsChecker — проверка requirements карт против game state."""

import os
import re

from .shared_data import load_json_file, resolve_data_path


_COUNT_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
}

_RESOURCE_ALIASES = {
    "plant": ("plants", "plant", "plants"),
    "plants": ("plants", "plant", "plants"),
    "floater": ("floater", "floater", "floaters"),
    "floaters": ("floater", "floater", "floaters"),
    "animal": ("animal", "animal", "animals"),
    "animals": ("animal", "animal", "animals"),
    "microbe": ("microbe", "microbe", "microbes"),
    "microbes": ("microbe", "microbe", "microbes"),
    "science": ("science", "science", "science"),
    "sciences": ("science", "science", "science"),
    "heat": ("heat", "heat", "heat"),
    "energy": ("energy", "energy", "energy"),
    "steel": ("steel", "steel", "steel"),
    "titanium": ("titanium", "titanium", "titanium"),
}


class RequirementsChecker:
    """Загружает requirements из all_cards.json и проверяет против game state."""

    def __init__(self, all_cards_path: str | None = None):
        self.reqs: dict[str, str] = {}  # name -> raw requirement string
        self._norm_reqs: dict[str, str] = {}
        self.descriptions: dict[str, str] = {}
        self._norm_descs: dict[str, str] = {}
        self.resource_types: dict[str, str] = {}
        self._norm_resource_types: dict[str, str] = {}
        if all_cards_path is None:
            all_cards_path = str(resolve_data_path("all_cards.json"))
        if os.path.exists(all_cards_path):
            cards = load_json_file(all_cards_path)
            for c in cards:
                name = c.get("name", "")
                norm = re.sub(r"[^a-z0-9]", "", name.lower())
                desc = str(c.get("description", "") or "")
                self.descriptions[name] = desc
                self._norm_descs[norm] = desc
                req = c.get("requirements", "")
                if req:
                    self.reqs[name] = str(req)
                    self._norm_reqs[norm] = str(req)
                resource_type = str(c.get("resourceType", "") or "")
                if resource_type:
                    self.resource_types[name] = resource_type
                    self._norm_resource_types[norm] = resource_type

    def get_req(self, name: str) -> str:
        if name in self.reqs:
            return self.reqs[name]
        norm = re.sub(r"[^a-z0-9]", "", name.lower())
        return self._norm_reqs.get(norm, "")

    def get_description(self, name: str) -> str:
        if name in self.descriptions:
            return self.descriptions[name]
        norm = re.sub(r"[^a-z0-9]", "", name.lower())
        return self._norm_descs.get(norm, "")

    def get_resource_type(self, name: str) -> str:
        if name in self.resource_types:
            return self.resource_types[name]
        norm = re.sub(r"[^a-z0-9]", "", name.lower())
        return self._norm_resource_types.get(norm, "")

    @staticmethod
    def _get_requirement_offsets(state) -> tuple[int, int]:
        """Return (global_req_offset, venus_req_offset) from corp effects."""
        req_offset = 0
        venus_req_offset = 0

        corp_candidates: list[str] = []
        corp = getattr(state, "corp_name", "") or ""
        if isinstance(corp, str) and corp:
            corp_candidates.append(corp)

        me = getattr(state, "me", None)
        if me and hasattr(me, "tableau"):
            for c in me.tableau:
                cname = c.get("name", "") if isinstance(c, dict) else str(c)
                if cname:
                    corp_candidates.append(cname)

        for cname in corp_candidates:
            cname_l = cname.lower()
            if "inventrix" in cname_l:
                req_offset = max(req_offset, 2)
            if "morning star inc" in cname_l:
                venus_req_offset = max(venus_req_offset, 2)

        return req_offset, venus_req_offset

    def check(self, name: str, state) -> tuple[bool, str]:
        """Проверить requirement карты. Returns (playable, reason).
        Учитывает Inventrix и Morning Star Inc. для global requirements."""
        req = self.get_req(name)
        placement_ok, placement_reason = self._check_placement(name, state)
        resource_cost_ok, resource_cost_reason = self._check_description_resource_cost(name, state)

        if not req:
            if not resource_cost_ok:
                return False, resource_cost_reason
            return (placement_ok, placement_reason) if not placement_ok else (True, "")

        r = req.strip()

        req_offset, venus_req_offset = self._get_requirement_offsets(state)

        # Dict-type requirements (stored as string repr of dict)
        if r.startswith("{"):
            ok, reason = self._check_dict_req(r, state)
            if not ok:
                return ok, reason
            if not resource_cost_ok:
                return False, resource_cost_reason
            return (placement_ok, placement_reason) if not placement_ok else (ok, reason if reason != f"Req: {r}" else "")

        # Compound requirements: conditions separated by " / "
        if " / " in r:
            ok, reason = self._check_compound(r, state, req_offset, venus_req_offset, name)
            if not ok:
                return ok, reason
            if not resource_cost_ok:
                return False, resource_cost_reason
            return (placement_ok, placement_reason) if not placement_ok else (ok, "")

        ok, reason = self._check_single(r, state, req_offset, venus_req_offset, name)
        if not ok:
            return ok, reason
        if not resource_cost_ok:
            return False, resource_cost_reason
        return (placement_ok, placement_reason) if not placement_ok else (ok, "")

    def _check_compound(
        self,
        req: str,
        state,
        req_offset: int = 0,
        venus_req_offset: int = 0,
        card_name: str = "",
    ) -> tuple[bool, str]:
        """Check compound requirements like '1 Plant tag / 1 Animal tag'."""
        parts = req.split(" / ")
        for _part, ok, reason in self._compound_part_statuses(parts, state, req_offset, venus_req_offset, card_name):
            if not ok:
                return False, reason
        return True, ""

    @staticmethod
    def _parse_tag_req_part(part: str) -> tuple[int, str] | None:
        m = re.match(r"(\d+)\s+([\w]+)\s+tags?", part.strip(), re.IGNORECASE)
        if not m:
            return None
        return int(m.group(1)), m.group(2).lower()

    def _compound_part_statuses(
        self,
        parts: list[str],
        state,
        req_offset: int = 0,
        venus_req_offset: int = 0,
        card_name: str = "",
    ) -> list[tuple[str, bool, str]]:
        """Evaluate compound requirements while spending each wild tag at most once."""
        tags = state.tags if hasattr(state, "tags") else {}
        wild_left = int((tags or {}).get("wild", 0) or 0)
        statuses: list[tuple[str, bool, str]] = []

        for raw_part in parts:
            part = raw_part.strip()
            tag_req = self._parse_tag_req_part(part)
            if not tag_req:
                statuses.append((part, *self._check_single(part, state, req_offset, venus_req_offset, card_name)))
                continue

            need, tag_name = tag_req
            exact = int((tags or {}).get(tag_name, 0) or 0)
            if exact >= need:
                statuses.append((part, True, ""))
                continue
            if tag_name == "wild":
                statuses.append((part, False, f"Нужно {need} {tag_name} tag (есть {exact})"))
                continue

            deficit = need - exact
            if wild_left >= deficit:
                wild_left -= deficit
                statuses.append((part, True, ""))
                continue

            have = exact + wild_left
            wild_left = 0
            statuses.append((part, False, f"Нужно {need} {tag_name} tag (есть {have})"))

        return statuses

    def _check_dict_req(self, req: str, state) -> tuple[bool, str]:
        """Handle dict-type requirements like {'floaters': 3}."""
        if "floaters" in req:
            m = re.search(r"'floaters':\s*(\d+)", req)
            if m:
                need = int(m.group(1))
                have = self._count_tableau_resource_type(state, "floater")
                if have < need:
                    return False, f"Нужно {need} floaters (сейчас {have})"
                return True, ""
        if "plantsRemoved" in req:
            if self._plants_removed_this_generation(state):
                return True, "Req: растения удалены в этом gen"
            return False, "Нужно, чтобы в этом поколении удалили растения другого игрока"
        if "resourceTypes" in req:
            m = re.search(r"'resourceTypes':\s*(\d+)", req)
            if m:
                return True, f"Req: {m.group(1)} типов ресурсов"
        return True, f"Req: {req}"

    def _count_tableau_resource_type(self, state, resource_type: str) -> int:
        me = getattr(state, "me", None)
        tableau = getattr(me, "tableau", None) or []
        want = str(resource_type or "").lower()
        total = 0
        for card in tableau:
            if not isinstance(card, dict):
                continue
            name = card.get("name", "")
            if self.get_resource_type(name).lower() != want:
                continue
            total += int(card.get("resources", 0) or 0)
        return total

    def _plants_removed_this_generation(self, state) -> bool:
        for action_name in self._iter_actions_this_generation(state):
            action_l = action_name.lower()
            if self._text_removes_opponent_plants(action_l):
                return True
            desc_l = self.get_description(action_name).lower()
            if desc_l and self._text_removes_opponent_plants(desc_l):
                return True
        return False

    @staticmethod
    def _iter_actions_this_generation(state):
        raw = getattr(state, "raw", {}) or {}
        players = []
        seen_colors = set()

        if isinstance(raw, dict):
            this_player = raw.get("thisPlayer")
            if isinstance(this_player, dict):
                players.append(this_player)
                color = this_player.get("color")
                if color:
                    seen_colors.add(color)
            for player in raw.get("players", []) or []:
                if not isinstance(player, dict):
                    continue
                color = player.get("color")
                if color and color in seen_colors:
                    continue
                if color:
                    seen_colors.add(color)
                players.append(player)

        for player in players:
            actions = (
                player.get("actionsThisGeneration")
                or player.get("actionsTakenThisGeneration")
                or []
            )
            if not isinstance(actions, list):
                continue
            for action in actions:
                if isinstance(action, str):
                    name = action.strip()
                elif isinstance(action, dict):
                    name = str(
                        action.get("name")
                        or action.get("cardName")
                        or action.get("card")
                        or action.get("action")
                        or ""
                    ).strip()
                else:
                    name = str(action or "").strip()
                if name:
                    yield name

    @staticmethod
    def _text_removes_opponent_plants(text_l: str) -> bool:
        if "plant" not in text_l or "remove" not in text_l:
            return False
        opponent_markers = (
            "another player",
            "any player",
            "opponent",
            "from a player",
            "from any",
        )
        return any(marker in text_l for marker in opponent_markers)

    @staticmethod
    def _parse_count_token(token: str) -> int:
        raw = str(token or "").strip().lower()
        if raw.isdigit():
            return int(raw)
        return _COUNT_WORDS.get(raw, 0)

    @staticmethod
    def _normalize_resource_name(raw: str) -> tuple[str, str, str]:
        key = re.sub(r"[^a-z]", "", str(raw or "").lower())
        return _RESOURCE_ALIASES.get(key, ("", "", ""))

    @staticmethod
    def _count_requirement_tags(tags: dict, tag_name: str) -> int:
        """Count tags for a requirement; wild tags satisfy any non-wild tag req."""
        tag_key = str(tag_name or "").lower()
        counts = tags or {}
        total = int(counts.get(tag_key, 0) or 0)
        if tag_key != "wild":
            total += int(counts.get("wild", 0) or 0)
        return total

    @staticmethod
    def _count_cities_in_play(state) -> int:
        raw = getattr(state, "raw", {}) or {}
        players = raw.get("players", []) if isinstance(raw, dict) else []
        total = 0
        for player in players:
            if isinstance(player, dict):
                total += int(player.get("citiesCount", 0) or 0)
        if total > 0:
            return total

        spaces = getattr(state, "spaces", []) or []
        return sum(1 for space in spaces if isinstance(space, dict) and space.get("tileType") == 0)

    def _city_requirement_uses_all_cities(self, card_name: str) -> bool:
        desc = self.get_description(card_name).lower()
        if "you have" in desc or "you own" in desc:
            return False
        return (
            "cities in play" in desc
            or "city tiles in play" in desc
            or "any " in desc and "cit" in desc
            or "city tiles on mars" in desc
            or "city in play" in desc
        )

    def _resource_amount_available(self, state, resource_key: str) -> int:
        me = getattr(state, "me", None)
        if not me:
            return 0
        if resource_key == "plants":
            return int(getattr(me, "plants", 0) or 0)
        if resource_key == "heat":
            return int(getattr(me, "heat", 0) or 0)
        if resource_key == "energy":
            return int(getattr(me, "energy", 0) or 0)
        if resource_key == "steel":
            return int(getattr(me, "steel", 0) or 0)
        if resource_key == "titanium":
            return int(getattr(me, "titanium", 0) or 0)
        return self._count_tableau_resource_type(state, resource_key)

    def _check_description_resource_cost(self, name: str, state) -> tuple[bool, str]:
        desc = self.get_description(name)
        if not desc:
            return True, ""
        first_sentence = desc.split(".", 1)[0].lower()
        if "action:" in first_sentence:
            return True, ""

        spend_matches = list(re.finditer(
            r"\b(lose|spend)\s+(\d+|one|two|three|four|five|six)\s+([a-z-]+)",
            first_sentence,
        ))
        if "requires" not in first_sentence and not spend_matches:
            return True, ""

        for match in spend_matches:
            verb = match.group(1)
            amount = self._parse_count_token(match.group(2))
            resource_key, resource_singular, resource_plural = self._normalize_resource_name(match.group(3))
            if amount <= 0 or not resource_key:
                continue
            have = self._resource_amount_available(state, resource_key)
            if have >= amount:
                continue
            verb_ru = "потерять" if verb == "lose" else "потратить"
            resource_label = resource_singular if amount == 1 else resource_plural
            return False, f"Нужно {verb_ru} {amount} {resource_label} (сейчас {have})"

        return True, ""

    def _check_placement(self, name: str, state) -> tuple[bool, str]:
        desc = self.get_description(name).lower()
        if not desc or not hasattr(state, "spaces"):
            return True, ""

        if "adjacent to a city tile" in desc:
            if not self._has_empty_space_adjacent_to_city(state):
                return False, "Нет свободной клетки рядом с city tile для размещения"

        if "next to no other tile" in desc:
            if not self._has_isolated_empty_space(state):
                return False, "Нет свободной isolated клетки для special tile"

        return True, ""

    def adjust_score(self, score: int, name: str, state) -> tuple[int, bool, str]:
        req_ok, req_reason = self.check(name, state)
        if req_ok:
            prod_ok, prod_reason = self.check_prod_decrease(name, state)
            if not prod_ok:
                req_ok = False
                req_reason = prod_reason

        if not req_reason:
            return score, req_ok, req_reason

        req = self.get_req(name)
        parts = [p.strip() for p in req.split(" / ") if p.strip()] if req else []
        if not parts and req_reason:
            parts = [req_reason]

        delta = 0
        unmet_parts = 0
        closed_window = False
        part_statuses = None
        if parts:
            req_offset, venus_req_offset = self._get_requirement_offsets(state)
            part_statuses = self._compound_part_statuses(parts, state, req_offset, venus_req_offset, name)
        for part in parts:
            if part_statuses is not None:
                part_ok = next((ok for p, ok, _reason in part_statuses if p == part), True)
            else:
                req_offset, venus_req_offset = self._get_requirement_offsets(state)
                part_ok, _ = self._check_single(part, state, req_offset, venus_req_offset, name)
            if not part_ok:
                unmet_parts += 1
                if self._is_closed_window_part(part.lower(), state):
                    closed_window = True
            delta += self._score_delta_for_part(part.lower(), state, part_ok)

        if "city tile" in req_reason.lower():
            delta -= 14
        if "isolated" in req_reason.lower():
            delta -= 10
        if "plantsremoved" in (req or "").lower() and not req_ok:
            delta -= 12
        if unmet_parts >= 2:
            delta -= unmet_parts * 2

        adjusted = max(0, score + delta)
        if closed_window and adjusted > 54:
            adjusted = 54

        return adjusted, req_ok, req_reason

    def _score_delta_for_part(self, req_l: str, state, req_ok: bool) -> int:
        delta = 0
        gen = getattr(state, "generation", 1) or 1
        late_req_penalty = 4 if gen >= 8 else 2 if gen >= 5 else 0

        max_tm = re.search(r'max\s+(-?\d+)\s*°c', req_l)
        if max_tm and not req_ok:
            temp_limit = int(max_tm.group(1))
            over_temp = max(0, state.temperature - temp_limit)
            over_steps = (over_temp + 1) // 2 if over_temp > 0 else 0
            if over_steps >= 4:
                delta -= 20 + late_req_penalty
            elif over_steps >= 2:
                delta -= 16 + late_req_penalty
            elif over_steps >= 1:
                delta -= 12 + late_req_penalty

        tm = re.search(r'(-?\d+)\s*°c', req_l)
        if tm and 'max' not in req_l:
            temp_need = int(tm.group(1))
            gap_steps = (temp_need - state.temperature) // 2
            if req_ok:
                delta += 5 if temp_need >= -6 else 3 if temp_need >= -14 else 0
            elif gap_steps > 8:
                delta -= 14 + late_req_penalty
            elif gap_steps > 5:
                delta -= 10 + late_req_penalty
            elif gap_steps > 2:
                delta -= 5 + (1 if gen >= 6 else 0)
            else:
                delta -= 2

        max_om = re.search(r'max\s+(\d+)%\s*oxygen', req_l)
        if max_om and not req_ok:
            oxy_limit = int(max_om.group(1))
            oxy_over = max(0, state.oxygen - oxy_limit)
            if oxy_over >= 5:
                delta -= 18 + late_req_penalty
            elif oxy_over >= 2:
                delta -= 14 + late_req_penalty
            elif oxy_over >= 1:
                delta -= 10 + late_req_penalty

        om = re.search(r'(\d+)%\s*oxygen', req_l)
        if om and 'max' not in req_l:
            oxy_need = int(om.group(1))
            oxy_gap = oxy_need - state.oxygen
            if req_ok:
                delta += 5 if oxy_need >= 7 else 3 if oxy_need >= 4 else 0
            elif oxy_gap > 6:
                delta -= 12 + late_req_penalty
            elif oxy_gap > 3:
                delta -= 7 + late_req_penalty
            elif oxy_gap > 1:
                delta -= 4 + (1 if gen >= 6 else 0)
            else:
                delta -= 2

        ttm = re.search(r'(\d+)\s+(\w+)\s+tags?', req_l)
        if ttm:
            tag_need = int(ttm.group(1))
            tag_name = ttm.group(2).lower()
            have_t = self._count_requirement_tags(state.tags or {}, tag_name)
            tag_gap = tag_need - have_t
            if req_ok:
                delta += 5 if tag_need >= 3 else 3 if tag_need >= 2 else 0
            elif tag_gap >= 4:
                delta -= 14 + late_req_penalty
            elif tag_gap == 3:
                delta -= 10 + late_req_penalty
            elif tag_gap == 2:
                delta -= 8 + (1 if gen >= 5 else 0)
            elif tag_gap > 0:
                delta -= 4 if tag_need == 1 else 6

        max_vm = re.search(r'max\s+(\d+)%\s*venus', req_l)
        if max_vm and not req_ok:
            v_limit = int(max_vm.group(1))
            v_over = max(0, state.venus - v_limit)
            v_over_steps = (v_over + 1) // 2 if v_over > 0 else 0
            if v_over_steps >= 4:
                delta -= 18 + late_req_penalty
            elif v_over_steps >= 2:
                delta -= 14 + late_req_penalty
            elif v_over_steps >= 1:
                delta -= 10 + late_req_penalty

        vm = re.search(r'(\d+)%\s*venus', req_l)
        if vm and 'max' not in req_l:
            v_need = int(vm.group(1))
            v_gap = (v_need - state.venus) // 2
            if req_ok:
                delta += 4
            elif v_gap > 5:
                delta -= 12 + late_req_penalty
            elif v_gap > 2:
                delta -= 7 + late_req_penalty
            elif v_gap > 0:
                delta -= 4

        max_ocm = re.search(r'max\s+(\d+)\s+oceans?', req_l)
        if max_ocm and not req_ok:
            oc_limit = int(max_ocm.group(1))
            oc_over = max(0, state.oceans - oc_limit)
            if oc_over >= 3:
                delta -= 16 + late_req_penalty
            elif oc_over >= 2:
                delta -= 12 + late_req_penalty
            elif oc_over >= 1:
                delta -= 8 + late_req_penalty

        ocm = re.search(r'(\d+)\s+oceans?', req_l)
        if ocm and 'max' not in req_l:
            oc_need = int(ocm.group(1))
            oc_gap = oc_need - state.oceans
            if req_ok:
                delta += 3 if oc_need <= 3 else 1 if oc_need <= 5 else 0
            elif oc_gap >= 5:
                delta -= 8 + late_req_penalty
            elif oc_gap >= 3:
                delta -= 5 + late_req_penalty
            elif oc_gap > 0:
                delta -= 2

        return delta

    def _is_closed_window_part(self, req_l: str, state) -> bool:
        max_tm = re.search(r'max\s+(-?\d+)\s*°c', req_l)
        if max_tm and state.temperature > int(max_tm.group(1)):
            return True

        max_om = re.search(r'max\s+(\d+)%\s*oxygen', req_l)
        if max_om and state.oxygen > int(max_om.group(1)):
            return True

        max_vm = re.search(r'max\s+(\d+)%\s*venus', req_l)
        if max_vm and state.venus > int(max_vm.group(1)):
            return True

        max_ocm = re.search(r'max\s+(\d+)\s+oceans?', req_l)
        if max_ocm and state.oceans > int(max_ocm.group(1)):
            return True

        return False

    def _check_single(
        self,
        r: str,
        state,
        req_offset: int = 0,
        venus_req_offset: int = 0,
        card_name: str = "",
    ) -> tuple[bool, str]:
        """Check a single requirement condition. req_offset = Inventrix bonus, venus_req_offset = Morning Star bonus."""
        I = re.IGNORECASE
        global_note = " [Inventrix -2]" if req_offset else ""
        venus_note = ""
        if req_offset and venus_req_offset:
            venus_note = " [Inventrix/Morning Star]"
        elif venus_req_offset:
            venus_note = " [Morning Star -2]"
        elif req_offset:
            venus_note = global_note

        # --- Temperature max (check before min to avoid false match) ---
        m = re.match(r"max (-?\d+)\s*°C", r, I)
        if m:
            limit = int(m.group(1)) + req_offset * 2  # each step = 2°C
            if state.temperature > limit:
                return False, f"Макс {limit}°C (сейчас {state.temperature}°C){global_note}"
            return True, ""

        # --- Temperature min ---
        m = re.match(r"(-?\d+)\s*°C", r)
        if m:
            need = int(m.group(1)) - req_offset * 2  # Inventrix: -4°C offset
            if state.temperature < need:
                return False, f"Нужно {need}°C (сейчас {state.temperature}°C){global_note}"
            return True, ""

        # --- Oxygen max ---
        m = re.match(r"max (\d+)% oxygen", r, I)
        if m:
            limit = int(m.group(1)) + req_offset
            if state.oxygen > limit:
                return False, f"Макс {limit}% O₂ (сейчас {state.oxygen}%){global_note}"
            return True, ""

        # --- Oxygen min ---
        m = re.match(r"(\d+)% oxygen", r, I)
        if m:
            need = int(m.group(1)) - req_offset
            if state.oxygen < need:
                return False, f"Нужно {need}% O₂ (сейчас {state.oxygen}%){global_note}"
            return True, ""

        # --- Venus max ---
        m = re.match(r"max (\d+)% venus", r, I)
        if m:
            limit = int(m.group(1)) + venus_req_offset * 2  # Venus steps = 2%
            if state.venus > limit:
                return False, f"Макс {limit}% Venus (сейчас {state.venus}%){venus_note}"
            return True, ""

        # --- Venus min (%) ---
        m = re.match(r"(\d+)% venus", r, I)
        if m:
            need = int(m.group(1)) - venus_req_offset * 2
            if state.venus < need:
                return False, f"Нужно {need}% Venus (сейчас {state.venus}%){venus_note}"
            return True, ""

        # --- Oceans max ---
        m = re.match(r"max (\d+) oceans?", r, I)
        if m:
            limit = int(m.group(1)) + req_offset
            if state.oceans > limit:
                return False, f"Макс {limit} ocean (сейчас {state.oceans}){global_note}"
            return True, ""

        # --- Oceans min ---
        m = re.match(r"(\d+) oceans?", r, I)
        if m:
            need = int(m.group(1))
            if state.oceans < need:
                return False, f"Нужно {need} ocean (сейчас {state.oceans})"
            return True, ""

        # --- TR ---
        m = re.match(r"tr\s+(\d+)", r, I)
        if m:
            need = int(m.group(1))
            if state.tr < need:
                return False, f"Нужно TR {need} (сейчас {state.tr})"
            return True, ""

        # --- Tag requirement: "N TagName tag(s)" ---
        m = re.match(r"(\d+)\s+([\w]+)\s+tags?", r, I)
        if m:
            need = int(m.group(1))
            tag_name = m.group(2).lower()
            tags = state.tags if hasattr(state, 'tags') else {}
            have = self._count_requirement_tags(tags, tag_name)
            if have < need:
                return False, f"Нужно {need} {tag_name} tag (есть {have})"
            return True, ""

        # --- Cities ---
        m = re.match(r"(\d+) cit(?:y|ies)", r, I)
        if m:
            need = int(m.group(1))
            uses_all_cities = self._city_requirement_uses_all_cities(card_name)
            have = self._count_cities_in_play(state) if uses_all_cities else (state.me.cities if hasattr(state, 'me') else 0)
            if have < need:
                scope = " in play" if uses_all_cities else ""
                return False, f"Нужно {need} city{scope} (есть {have})"
            return True, ""

        # --- Colonies ---
        m = re.match(r"(\d+) colonies", r, I)
        if m:
            need = int(m.group(1))
            have = state.me.colonies if hasattr(state, 'me') else 0
            if have < need:
                return False, f"Нужно {need} colony (есть {have})"
            return True, ""

        # --- Greeneries ---
        m = re.match(r"(\d+) greeneries", r, I)
        if m:
            need = int(m.group(1))
            have = self._count_greeneries(state)
            if have < need:
                return False, f"Нужно {need} greenery (есть {have})"
            return True, ""

        # --- Production (оппонент должен иметь) ---
        if r.lower() == "production":
            return True, "Req: production оппонента"

        # --- Turmoil: Party ruling ---
        m = re.match(r"(\w+) ruling", r, I)
        if m:
            has_turmoil = getattr(state, 'has_turmoil', True)
            if not has_turmoil:
                return False, f"Нет Turmoil в игре ({m.group(1).title()} ruling)"
            return True, f"Turmoil: {m.group(1).title()} ruling"

        # --- Chairman ---
        if "chairman" in r.lower():
            has_turmoil = getattr(state, 'has_turmoil', True)
            if not has_turmoil:
                return False, "Нет Turmoil в игре (Chairman)"
            return True, "Turmoil: Chairman"

        # --- Party leader ---
        if "party leader" in r.lower():
            has_turmoil = getattr(state, 'has_turmoil', True)
            if not has_turmoil:
                return False, f"Нет Turmoil в игре ({r})"
            return True, f"Turmoil: {r}"

        # --- Fallback ---
        return True, f"Req: {r}"

    @staticmethod
    def _count_greeneries(state) -> int:
        """Count player's greeneries from map spaces."""
        if not hasattr(state, 'spaces'):
            return 0
        my_color = state.me.color if hasattr(state, 'me') else ""
        count = 0
        for s in state.spaces:
            if s.get("tileType") == 0 and s.get("color") == my_color:
                count += 1
        return count

    @staticmethod
    def _neighbors(x: int, y: int) -> list[tuple[int, int]]:
        if y % 2 == 0:
            deltas = [(-1, -1), (0, -1), (-1, 0), (1, 0), (-1, 1), (0, 1)]
        else:
            deltas = [(0, -1), (1, -1), (-1, 0), (1, 0), (0, 1), (1, 1)]
        return [(x + dx, y + dy) for dx, dy in deltas]

    def _has_empty_space_adjacent_to_city(self, state) -> bool:
        by_pos = {}
        for s in state.spaces:
            x, y = s.get("x", -1), s.get("y", -1)
            if x >= 0 and y >= 0:
                by_pos[(x, y)] = s

        for s in by_pos.values():
            if s.get("tileType") != 2:
                continue
            for nx, ny in self._neighbors(s["x"], s["y"]):
                ns = by_pos.get((nx, ny))
                if not ns:
                    continue
                if ns.get("tileType") is not None:
                    continue
                if ns.get("spaceType") in ("ocean", "colony"):
                    continue
                return True
        return False

    def _has_isolated_empty_space(self, state) -> bool:
        occupied = {(s.get("x"), s.get("y")) for s in state.spaces if s.get("tileType") is not None}
        for s in state.spaces:
            if s.get("spaceType") != "land":
                continue
            if s.get("tileType") is not None:
                continue
            x, y = s.get("x", -1), s.get("y", -1)
            if x < 0 or y < 0:
                continue
            if all((nx, ny) not in occupied for nx, ny in self._neighbors(x, y)):
                return True
        return False

    def check_prod_decrease(self, card_name: str, state) -> tuple[bool, str]:
        """Check if mandatory production decrease can be performed."""
        PROD_DECREASE = {
            "Fish": ("plant", 1, "any"),
            "Birds": ("plant", 2, "any"),
            "Biomass Combustors": ("plant", 1, "any"),
            "Energy Tapping": ("energy", 1, "any"),
            "Hackers": ("megaCredits", 2, "any"),
            "Livestock": ("plant", 1, "self"),
            "Moss": ("plant", 1, "self"),
        }
        if card_name not in PROD_DECREASE:
            return True, ""

        res, amount, target = PROD_DECREASE[card_name]

        prod_map = {
            "plant": "plant_prod",
            "energy": "energy_prod",
            "megaCredits": "mc_prod",
            "heat": "heat_prod",
            "steel": "steel_prod",
            "titanium": "ti_prod",
        }
        attr = prod_map.get(res, "")
        if not attr:
            return True, ""

        if target == "self":
            my_prod = getattr(state.me, attr, 0)
            if my_prod < amount:
                return False, f"Нужно своё {res}-prod ≥ {amount} (есть {my_prod})"
        else:
            # Any player (including self)
            all_players = [state.me] + state.opponents
            has_enough = any(getattr(p, attr, 0) >= amount for p in all_players)
            if not has_enough:
                total_max = max(getattr(p, attr, 0) for p in all_players)
                return False, f"Ни у кого нет {res}-prod ≥ {amount} (макс {total_max})"

        return True, ""
