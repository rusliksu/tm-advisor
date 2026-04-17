"""Prelude scorer — converts parsed behavior into MC-equivalent value.

Addresses weak prelude signal in synergy.adjusted_score: base COTD score
is grounded in commentary, not MC math. Preludes vary ~5-25 MC immediate
value; a 20 MC swing is a Tier-tier jump (B→D).

Reads structured behavior from data/all-card-behaviors.json (production,
stock, global param steps, drawCard). Tags pulled from db.get_info (tags
field from all_cards.json). Final score blends 40% COTD baseline +
60% MC-grounded score.

Does NOT handle ongoing effects (Suitable Infrastructure, Project Eden,
Research Network) — those fall back to COTD-only via the blend. Does
NOT re-score Double Down / Merger (depend on corp/prelude pair
context). Manual overrides dict for edge cases.
"""

from __future__ import annotations

import json
import os
from .shared_data import resolve_data_path


_PROD_TO_MC = {
    "megacredits": 5.5, "steel": 8.0, "titanium": 12.5,
    "plants": 8.0, "energy": 7.5, "heat": 4.0,
}
_STOCK_TO_MC = {
    "megacredits": 1.0, "steel": 2.0, "titanium": 3.0,
    "plants": 2.0, "energy": 2.0, "heat": 1.0,
}
_TAG_MC = {
    "earth": 2.5, "jovian": 4.0, "science": 4.0, "venus": 2.5,
    "space": 1.5, "building": 1.5, "plant": 2.0, "microbe": 1.5,
    "animal": 1.5, "power": 1.5, "city": 1.0, "mars": 1.0, "wild": 4.0,
}
_TR_VALUE = 7.0
_CARD_DRAW_MC = 3.5
_NO_TAG_PENALTY = -3.0

_CORP_TAG_MUL = {
    "Aridor":       {"earth": 4.0, "jovian": 5.0, "venus": 4.0, "plant": 3.0, "microbe": 3.0},
    "Point Luna":   {"earth": 4.5},
    "Saturn Systems": {"jovian": 5.5},
    "Morning Star Inc": {"venus": 4.5},
    "Teractor":     {"earth": 3.5},
    "Tharsis Republic": {"city": 3.5},
    "Credicor":     {},
}

_CORP_PROD_MUL = {
    "Helion": {"heat": 8.0},
    "Manutech": {},
}

# Preludes with ongoing / context-dependent effects not captured by behavior.
# Value here = additional MC on top of whatever behavior scorer produces.
_OVERRIDES = {
    "Great Aquifer": 14.0,          # 2 oceans + 2 TR (placed tile bonuses)
    "Ecology Experts": 12.0,        # unlock req + plant tag value + trigger
    "Experimental Forest": 16.0,    # greenery placement + 2 cards
    "Research Network": 11.0,       # unlimited wild cards effect
    "Suitable Infrastructure": 10.0,  # ongoing +1 MC per prod bump
    "Project Eden": 12.0,           # action card, steel + draw
    "Polar Industries": 7.0,        # ocean step + heat prod
    "Orbital Construction Yard": 8.0,  # titanium + orbital tag value
}


class PreludeScorer:
    """MC-aware prelude evaluator, blends with existing COTD base score."""

    def __init__(self, db):
        self.db = db
        self._behaviors = self._load_behaviors()

    @staticmethod
    def _load_behaviors() -> dict:
        path = resolve_data_path("all-card-behaviors.json")
        if not os.path.exists(path):
            return {}
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def is_prelude(self, name: str) -> bool:
        info = self.db.get_info(name) if self.db else None
        if not info:
            return False
        return str(info.get("type", "")).lower() == "prelude"

    def immediate_value(self, name: str, corp_name: str = "") -> tuple[float, str]:
        """Return (MC-value, short reason) for this prelude."""
        entry = self._behaviors.get(name, {}) or {}
        beh = entry.get("behavior") or {}
        info = self.db.get_info(name) if self.db else None
        tags = [t.lower() for t in (info.get("tags") or [])] if info else []
        prod_mul = _CORP_PROD_MUL.get(corp_name, {})

        total = 0.0
        parts: list[str] = []

        for res, amt in (beh.get("production") or {}).items():
            base_mc = prod_mul.get(res, _PROD_TO_MC.get(res, 0))
            v = base_mc * amt
            total += v
            if v:
                parts.append(f"{amt:+d}{res[:3]}p={v:.0f}")

        for res, amt in (beh.get("stock") or {}).items():
            v = _STOCK_TO_MC.get(res, 0) * amt
            total += v
            if v:
                parts.append(f"{amt:+d}{res[:3]}={v:.0f}")

        glob = beh.get("global") or {}
        tr_steps = sum(int(v or 0) for v in glob.values())
        if tr_steps:
            v = tr_steps * _TR_VALUE
            total += v
            parts.append(f"+{tr_steps}globalTR={v:.0f}")

        if beh.get("tr"):
            v = float(beh["tr"]) * _TR_VALUE
            total += v
            parts.append(f"+{beh['tr']}TR={v:.0f}")

        draws = beh.get("drawCard") or 0
        if isinstance(draws, dict):
            draws = draws.get("count", 0)
        if draws:
            v = float(draws) * _CARD_DRAW_MC
            total += v
            parts.append(f"+{draws}card={v:.1f}")

        if beh.get("greenery"):
            total += 14.0
            parts.append("greenery=14")
        if beh.get("city"):
            total += 9.0
            parts.append("city=9")

        tag_mul = _CORP_TAG_MUL.get(corp_name, {})
        tag_total = 0.0
        for tag in tags:
            tag_total += tag_mul.get(tag, _TAG_MC.get(tag, 1.0))
        if tags:
            total += tag_total
            if tag_total:
                parts.append(f"tags={tag_total:.0f}")
        else:
            total += _NO_TAG_PENALTY
            parts.append(f"no-tag={_NO_TAG_PENALTY}")

        override = _OVERRIDES.get(name, 0)
        if override:
            total += override
            parts.append(f"ovr={override:+.0f}")

        return total, " ".join(parts)

    def score(self, name: str, corp_name: str = "") -> int:
        """Blend COTD base (70%) with MC-grounded score (30%). Int 0-100.

        Blend weight favors COTD because synergy.adjusted_score already
        applies corp-specific bonuses (Splice/IC/Aridor branches at
        synergy.py:615+) that expect the COTD score as a baseline.
        Overriding too aggressively breaks those branches.
        """
        base = self.db.get_score(name) if self.db else 50
        mc, _ = self.immediate_value(name, corp_name)
        score_from_mc = 50.0 + (mc - 10.0) * 1.6
        score_from_mc = max(20.0, min(95.0, score_from_mc))
        blended = round(0.7 * base + 0.3 * score_from_mc)
        return max(0, min(100, blended))
