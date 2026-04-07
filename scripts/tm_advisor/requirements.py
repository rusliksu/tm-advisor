"""RequirementsChecker — проверка requirements карт против game state."""

import json
import os
import re

from .shared_data import resolve_data_path


class RequirementsChecker:
    """Загружает requirements из all_cards.json и проверяет против game state."""

    def __init__(self, all_cards_path: str | None = None):
        self.reqs: dict[str, str] = {}  # name -> raw requirement string
        self._norm_reqs: dict[str, str] = {}
        self.descriptions: dict[str, str] = {}
        self._norm_descs: dict[str, str] = {}
        if all_cards_path is None:
            all_cards_path = str(resolve_data_path("all_cards.json"))
        if os.path.exists(all_cards_path):
            with open(all_cards_path, "r", encoding="utf-8") as f:
                cards = json.load(f)
            for c in cards:
                name = c.get("name", "")
                desc = str(c.get("description", "") or "")
                self.descriptions[name] = desc
                self._norm_descs[re.sub(r"[^a-z0-9]", "", name.lower())] = desc
                req = c.get("requirements", "")
                if req:
                    self.reqs[name] = str(req)
                    self._norm_reqs[re.sub(r"[^a-z0-9]", "", name.lower())] = str(req)

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

        if not req:
            return (placement_ok, placement_reason) if not placement_ok else (True, "")

        r = req.strip()

        req_offset, venus_req_offset = self._get_requirement_offsets(state)

        # Dict-type requirements (stored as string repr of dict)
        if r.startswith("{"):
            ok, reason = self._check_dict_req(r)
            if not ok:
                return ok, reason
            return (placement_ok, placement_reason) if not placement_ok else (ok, reason if reason != f"Req: {r}" else "")

        # Compound requirements: conditions separated by " / "
        if " / " in r:
            ok, reason = self._check_compound(r, state, req_offset, venus_req_offset)
            if not ok:
                return ok, reason
            return (placement_ok, placement_reason) if not placement_ok else (ok, "")

        ok, reason = self._check_single(r, state, req_offset, venus_req_offset)
        if not ok:
            return ok, reason
        return (placement_ok, placement_reason) if not placement_ok else (ok, "")

    def _check_compound(self, req: str, state, req_offset: int = 0, venus_req_offset: int = 0) -> tuple[bool, str]:
        """Check compound requirements like '1 Plant tag / 1 Animal tag'."""
        parts = req.split(" / ")
        for part in parts:
            ok, reason = self._check_single(part.strip(), state, req_offset, venus_req_offset)
            if not ok:
                return False, reason
        return True, ""

    @staticmethod
    def _check_dict_req(req: str) -> tuple[bool, str]:
        """Handle dict-type requirements like {'floaters': 3}."""
        if "floaters" in req:
            m = re.search(r"'floaters':\s*(\d+)", req)
            if m:
                return True, f"Req: {m.group(1)} floaters на карте"
        if "plantsRemoved" in req:
            return True, "Req: растения удалены в этом gen"
        if "resourceTypes" in req:
            m = re.search(r"'resourceTypes':\s*(\d+)", req)
            if m:
                return True, f"Req: {m.group(1)} типов ресурсов"
        return True, f"Req: {req}"

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
        for part in parts:
            req_offset, venus_req_offset = self._get_requirement_offsets(state)
            part_ok, _ = self._check_single(part, state, req_offset, venus_req_offset)
            if not part_ok:
                unmet_parts += 1
            delta += self._score_delta_for_part(part.lower(), state, part_ok)

        if "city tile" in req_reason.lower():
            delta -= 14
        if "isolated" in req_reason.lower():
            delta -= 10
        if unmet_parts >= 2:
            delta -= unmet_parts * 2

        return max(0, score + delta), req_ok, req_reason

    def _score_delta_for_part(self, req_l: str, state, req_ok: bool) -> int:
        delta = 0
        gen = getattr(state, "generation", 1) or 1
        late_req_penalty = 4 if gen >= 8 else 2 if gen >= 5 else 0

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
            have_t = (state.tags or {}).get(tag_name, 0)
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

        ocm = re.search(r'(\d+)\s+oceans?', req_l)
        if ocm and 'max' not in req_l and req_ok:
            oc_need = int(ocm.group(1))
            delta += 3 if oc_need <= 3 else 1 if oc_need <= 5 else 0

        return delta

    def _check_single(self, r: str, state, req_offset: int = 0, venus_req_offset: int = 0) -> tuple[bool, str]:
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
            have = tags.get(tag_name, 0)
            if have < need:
                return False, f"Нужно {need} {tag_name} tag (есть {have})"
            return True, ""

        # --- Cities ---
        m = re.match(r"(\d+) cit(?:y|ies)", r, I)
        if m:
            need = int(m.group(1))
            have = state.me.cities if hasattr(state, 'me') else 0
            if have < need:
                return False, f"Нужно {need} city (есть {have})"
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
