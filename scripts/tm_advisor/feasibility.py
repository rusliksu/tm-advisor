"""Feasibility filter — caps card score when requirement cannot be satisfied
before the game ends.

Addresses the "bot repeats one card 17+ times" bug identified on shadow logs:
Magnetic Shield with TR gap, Maxwell Base with unplayable param req, etc.
req_checker.adjust_score only reduces score; this layer drops infeasible cards
out of top-3 via a hard -40 delta.

Applied inside synergy.adjusted_score after threat adjustment, so ALL call-sites
get the feasibility filter automatically.
"""

from __future__ import annotations

import re

from .analysis import _estimate_remaining_gens


_HARD = -40
_SOFT = -10

_RE_TAG = re.compile(r"(\d+)\s*([a-zA-Zа-яА-Я]+)\s*tag", re.IGNORECASE)
_RE_HAVE = re.compile(r"есть\s*(\d+)", re.IGNORECASE)
_RE_TEMP = re.compile(r"(-?\d+)\s*°c", re.IGNORECASE)
_RE_OXYGEN = re.compile(r"(\d+)\s*%?\s*(?:o₂|oxygen|o2)", re.IGNORECASE)
_RE_OCEAN = re.compile(r"(\d+)\s*ocean", re.IGNORECASE)
_RE_VENUS = re.compile(r"(\d+)\s*%?\s*venus", re.IGNORECASE)
_RE_TR = re.compile(r"(?:tr|рейтинг)\s*(\d+)", re.IGNORECASE)
# "Нужно своё plant-prod ≥ 2 (есть 0)" — own prod floor
_RE_OWN_PROD = re.compile(
    r"сво[её]\s+([a-zа-я]+)[\-_\s]?prod\s*(?:≥|>=)\s*(\d+)",
    re.IGNORECASE,
)
# "Ни у кого нет plant-prod ≥ 2 (макс 1)" — any-player prod floor (e.g. Hackers)
_RE_ANY_PROD = re.compile(
    r"ни\s+у\s+кого\s+нет\s+([a-zа-я]+)[\-_\s]?prod\s*(?:≥|>=)\s*(\d+)",
    re.IGNORECASE,
)

_PROD_ATTR = {
    "plant": "plant_prod",
    "energy": "energy_prod",
    "megacredits": "mc_prod",
    "mc": "mc_prod",
    "heat": "heat_prod",
    "steel": "steel_prod",
    "titanium": "ti_prod",
    "ti": "ti_prod",
}


def _is_max_req(text: str) -> bool:
    """Reversed requirement (card needs parameter at MOST N): skip feasibility."""
    low = text.lower()
    return "max" in low or "\u043c\u0430\u043a\u0441" in low


class FeasibilityAdjuster:
    """Down-scores cards whose requirements cannot be met before end of game."""

    def __init__(self, req_checker, db=None):
        self.req_checker = req_checker
        self.db = db

    def compute_delta(self, card_name: str, state) -> tuple[int, str]:
        if self.req_checker is None:
            return 0, ""
        try:
            req_ok, req_reason = self.req_checker.check(card_name, state)
        except Exception:
            return 0, ""
        if req_ok or not req_reason:
            return 0, ""

        gens_left = max(1, _estimate_remaining_gens(state))
        delta, raw_reason = self._classify(req_reason, state, gens_left)
        if delta == 0:
            return 0, ""
        if delta < _HARD:
            delta = _HARD
        pretty = f"\u26d4 {card_name} {delta}: {raw_reason}"
        return delta, pretty

    def adjust(self, base_score: int, card_name: str, state) -> tuple[int, str]:
        delta, reason = self.compute_delta(card_name, state)
        return base_score + delta, reason

    def _classify(self, req_reason: str, state, gens_left: int) -> tuple[int, str]:
        text = req_reason

        m = _RE_TEMP.search(text)
        if m and not _is_max_req(text):
            need = int(m.group(1))
            gap_steps = (need - state.temperature) // 2
            if gap_steps > 0:
                heat_prod = getattr(state.me, "heat_prod", 0) or 0
                pace = 1 + max(0, heat_prod // 2)
                gens_needed = max(1, (gap_steps + pace - 1) // pace)
                if gens_needed > gens_left:
                    return _HARD, f"temp {need}°C, need {gens_needed} gens, only {gens_left} left"
                if gens_needed == gens_left:
                    return _SOFT, f"temp {need}°C borderline"
                return 0, ""

        m = _RE_OXYGEN.search(text)
        if m and not _is_max_req(text):
            need = int(m.group(1))
            gap = need - state.oxygen
            if gap > 0:
                gens_needed = max(1, gap)
                if gens_needed > gens_left:
                    return _HARD, f"oxygen {need}%, need {gens_needed} gens"
                if gens_needed == gens_left:
                    return _SOFT, f"oxygen {need}% borderline"
                return 0, ""

        m = _RE_OCEAN.search(text)
        if m:
            need = int(m.group(1))
            gap = need - state.oceans
            if gap > 0:
                gens_needed = max(1, (gap + 1) // 2)
                if gens_needed > gens_left:
                    return _HARD, f"oceans {need}, need {gens_needed} gens"
                if gens_needed == gens_left:
                    return _SOFT, "oceans borderline"
                return 0, ""

        m = _RE_VENUS.search(text)
        if m and not _is_max_req(text):
            need = int(m.group(1))
            gap = need - state.venus
            if gap > 0:
                gens_needed = max(1, (gap + 1) // 2)
                if gens_needed > gens_left:
                    return _HARD, f"venus {need}%, need {gens_needed} gens"
                if gens_needed == gens_left:
                    return _SOFT, "venus borderline"
                return 0, ""

        m = _RE_TR.search(text)
        if m:
            need = int(m.group(1))
            tr_gap = need - getattr(state.me, "tr", 20)
            if tr_gap > 0:
                gens_needed = max(1, (tr_gap + 1) // 2)
                if gens_needed > gens_left:
                    return _HARD, f"TR {need}, need {gens_needed} gens"
                if gens_needed == gens_left:
                    return _SOFT, f"TR {need} borderline"
                return 0, ""

        # Own production floor: "Нужно своё plant-prod ≥ 2 (есть 0)"
        m = _RE_OWN_PROD.search(text)
        if m:
            res_raw = m.group(1).lower()
            need = int(m.group(2))
            attr = _PROD_ATTR.get(res_raw)
            if attr is not None:
                have = getattr(state.me, attr, 0) or 0
                gap = need - have
                if gap > 0:
                    if gens_left <= 2:
                        return _HARD, f"own {res_raw}-prod gap {gap}, {gens_left} gens left"
                    if gens_left <= 3:
                        return _SOFT, f"own {res_raw}-prod gap {gap}, {gens_left} gens left"
                    # early/mid: assume producible
                    return 0, ""

        # Any-player prod floor: "Ни у кого нет heat-prod ≥ 3 (макс 1)"
        m = _RE_ANY_PROD.search(text)
        if m:
            res_raw = m.group(1).lower()
            need = int(m.group(2))
            attr = _PROD_ATTR.get(res_raw)
            if attr is not None:
                my_prod = getattr(state.me, attr, 0) or 0
                opps = getattr(state, "opponents", None) or []
                opp_max = max(
                    ((getattr(o, attr, 0) or 0) for o in opps),
                    default=0,
                )
                max_prod = max(my_prod, opp_max)
                gap = need - max_prod
                if gap > 0:
                    if gens_left <= 2:
                        return _HARD, f"{res_raw}-prod nowhere ≥ {need} (max {max_prod})"
                    if gens_left <= 4 and gap >= 2:
                        return _SOFT, f"{res_raw}-prod gap {gap} across table"
                    return 0, ""

        m = _RE_TAG.search(text)
        if m:
            need = int(m.group(1))
            tag_name = m.group(2).lower()
            have_m = _RE_HAVE.search(text)
            have = int(have_m.group(1)) if have_m else 0
            gap = need - have
            if gap <= 0:
                return 0, ""
            providers = self._count_hand_tag_providers(state, tag_name)
            if providers >= gap:
                return 0, ""
            if gens_left >= 5:
                return 0, ""
            if gens_left <= 3:
                return _HARD, f"{tag_name} tag gap {gap}, {gens_left} gens left, hand providers {providers}"
            return _SOFT, f"{tag_name} tag gap {gap}, hand providers {providers}"

        return 0, ""

    def _count_hand_tag_providers(self, state, tag_name: str) -> int:
        hand = getattr(state, "cards_in_hand", None) or []
        my_mc = getattr(getattr(state, "me", None), "mc", 0) or 0
        count = 0
        for card in hand:
            name = card.get("name") if isinstance(card, dict) else card
            if not name:
                continue
            tags = []
            cost = 0
            if isinstance(card, dict):
                tags = [str(t).lower() for t in (card.get("tags") or [])]
                cost = card.get("cost", 0) or 0
            if self.db is not None and hasattr(self.db, "get_info"):
                info = self.db.get_info(name)
                if info:
                    info_tags = [str(t).lower() for t in (info.get("tags") or [])]
                    if info_tags:
                        tags = info_tags
                    info_cost = info.get("cost")
                    if isinstance(info_cost, int):
                        cost = info_cost
            if not tags and self.db is None:
                tags = [tag_name]
            if cost > my_mc and self.db is not None:
                continue
            if tag_name in tags:
                count += 1
        return count
