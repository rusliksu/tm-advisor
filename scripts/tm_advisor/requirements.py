"""RequirementsChecker — проверка requirements карт против game state."""

import json
import os
import re


class RequirementsChecker:
    """Загружает requirements из all_cards.json и проверяет против game state."""

    def __init__(self, all_cards_path: str):
        self.reqs: dict[str, str] = {}  # name -> raw requirement string
        self._norm_reqs: dict[str, str] = {}
        if os.path.exists(all_cards_path):
            with open(all_cards_path, "r", encoding="utf-8") as f:
                cards = json.load(f)
            for c in cards:
                name = c.get("name", "")
                req = c.get("requirements", "")
                if req:
                    self.reqs[name] = str(req)
                    self._norm_reqs[re.sub(r"[^a-z0-9]", "", name.lower())] = str(req)

    def get_req(self, name: str) -> str:
        if name in self.reqs:
            return self.reqs[name]
        norm = re.sub(r"[^a-z0-9]", "", name.lower())
        return self._norm_reqs.get(norm, "")

    def check(self, name: str, state) -> tuple[bool, str]:
        """Проверить requirement карты. Returns (playable, reason).
        Учитывает Inventrix (-2 к global requirements)."""
        req = self.get_req(name)
        if not req:
            return True, ""

        r = req.strip()

        # Inventrix / Special Design: requirement offset for global params
        req_offset = 0
        corp = getattr(state, 'corp_name', '') or ''
        if isinstance(corp, str) and 'inventrix' in corp.lower():
            req_offset = 2
        # Merger mode: check both corps
        me = getattr(state, 'me', None)
        if me and hasattr(me, 'tableau'):
            for c in me.tableau:
                cname = c.get('name', '') if isinstance(c, dict) else str(c)
                if 'inventrix' in cname.lower():
                    req_offset = 2
                    break

        # Dict-type requirements (stored as string repr of dict)
        if r.startswith("{"):
            return self._check_dict_req(r)

        # Compound requirements: conditions separated by " / "
        if " / " in r:
            return self._check_compound(r, state, req_offset)

        return self._check_single(r, state, req_offset)

    def _check_compound(self, req: str, state, req_offset: int = 0) -> tuple[bool, str]:
        """Check compound requirements like '1 Plant tag / 1 Animal tag'."""
        parts = req.split(" / ")
        for part in parts:
            ok, reason = self._check_single(part.strip(), state, req_offset)
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

    def _check_single(self, r: str, state, req_offset: int = 0) -> tuple[bool, str]:
        """Check a single requirement condition. req_offset = Inventrix bonus (2)."""
        I = re.IGNORECASE
        inv = " [Inventrix -2]" if req_offset else ""

        # --- Temperature max (check before min to avoid false match) ---
        m = re.match(r"max (-?\d+)\s*°C", r, I)
        if m:
            limit = int(m.group(1)) + req_offset * 2  # each step = 2°C
            if state.temperature > limit:
                return False, f"Макс {limit}°C (сейчас {state.temperature}°C){inv}"
            return True, ""

        # --- Temperature min ---
        m = re.match(r"(-?\d+)\s*°C", r)
        if m:
            need = int(m.group(1)) - req_offset * 2  # Inventrix: -4°C offset
            if state.temperature < need:
                return False, f"Нужно {need}°C (сейчас {state.temperature}°C){inv}"
            return True, ""

        # --- Oxygen max ---
        m = re.match(r"max (\d+)% oxygen", r, I)
        if m:
            limit = int(m.group(1)) + req_offset
            if state.oxygen > limit:
                return False, f"Макс {limit}% O₂ (сейчас {state.oxygen}%){inv}"
            return True, ""

        # --- Oxygen min ---
        m = re.match(r"(\d+)% oxygen", r, I)
        if m:
            need = int(m.group(1)) - req_offset
            if state.oxygen < need:
                return False, f"Нужно {need}% O₂ (сейчас {state.oxygen}%){inv}"
            return True, ""

        # --- Venus max ---
        m = re.match(r"max (\d+)% venus", r, I)
        if m:
            limit = int(m.group(1)) + req_offset * 2  # Venus steps = 2%
            if state.venus > limit:
                return False, f"Макс {limit}% Venus (сейчас {state.venus}%){inv}"
            return True, ""

        # --- Venus min (%) ---
        m = re.match(r"(\d+)% venus", r, I)
        if m:
            need = int(m.group(1)) - req_offset * 2  # Inventrix: -4% offset
            if state.venus < need:
                return False, f"Нужно {need}% Venus (сейчас {state.venus}%){inv}"
            return True, ""

        # --- Oceans max ---
        m = re.match(r"max (\d+) oceans?", r, I)
        if m:
            limit = int(m.group(1)) + req_offset
            if state.oceans > limit:
                return False, f"Макс {limit} ocean (сейчас {state.oceans}){inv}"
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
