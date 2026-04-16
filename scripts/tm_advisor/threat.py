"""Opponent-reactive score adjuster — adds ±delta to base card score
based on opponent tableau/production/awards/milestones state.

USES ONLY publicly visible data:
- opp.tableau (played cards — public)
- opp.plant_prod (visible)
- opp.raw['animalProduction'] (visible)
- state.game.milestones / state.game.awards (public)
NEVER reads opp.cards_in_hand content or any private data.

Thresholds (rationale in CLAUDE.md):
- Birds: opp plant_prod >= 4 → attack is worthwhile (≥ 20 MC over game).
- Birds 3P take-that: penalty when no-one has plant_prod >= 2 (attack wasted).
- Decomposers: opp bio-tag cards >= 3 → each future bio-tag gives a microbe.
- Vermin: any opp animal source → scaling payoff from their growth.
"""

from __future__ import annotations

_CLAMP = 10


class OpponentReactiveAdjuster:
    """Layer over adjusted_score that reacts to opponent state."""

    def __init__(self, db=None):
        self.db = db
        self._bio_cards = self._build_bio_set(db)
        self._animal_sources = self._build_animal_source_set(db)

    @staticmethod
    def _build_bio_set(db) -> set[str]:
        if db is None or not hasattr(db, "card_info"):
            return set()
        out = set()
        targets = {"microbe", "animal", "plant"}
        for name, info in db.card_info.items():
            tags = info.get("tags") or []
            if any((t or "").lower() in targets for t in tags):
                out.add(name)
        return out

    @staticmethod
    def _build_animal_source_set(db) -> set[str]:
        if db is None or not hasattr(db, "card_info"):
            return set()
        out = set()
        for name, info in db.card_info.items():
            if (info.get("resourceType") or "").lower() == "animal":
                out.add(name)
        return out

    def compute_delta(self, card_name: str, state) -> tuple[int, str]:
        """Return (clamped_delta, reason_or_empty) for the card vs opponents."""
        raw_delta, raw_reason = self._dispatch(card_name, state)
        if raw_delta > _CLAMP:
            raw_delta = _CLAMP
        elif raw_delta < -_CLAMP:
            raw_delta = -_CLAMP
        if raw_delta == 0:
            return 0, ""
        sign = "+" if raw_delta > 0 else ""
        pretty = f"\u26a0\ufe0f {card_name} {sign}{raw_delta}: {raw_reason}"
        return raw_delta, pretty

    def adjust(self, base_score: int, card_name: str, state) -> tuple[int, str]:
        delta, reason = self.compute_delta(card_name, state)
        if delta == 0:
            return base_score, ""
        return base_score + delta, reason

    def _dispatch(self, card_name: str, state) -> tuple[int, str]:
        handler = {
            "Birds": self._birds,
            "Decomposers": self._decomposers,
            "Vermin": self._vermin,
        }.get(card_name)
        if handler is None:
            return 0, ""
        return handler(state)

    @staticmethod
    def _card_name(entry) -> str | None:
        if isinstance(entry, dict):
            return entry.get("name") or entry.get("cardName")
        if isinstance(entry, str):
            return entry
        return None

    @staticmethod
    def _to_int(value) -> int:
        if value is None:
            return 0
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    def _birds(self, state) -> tuple[int, str]:
        opps = getattr(state, "opponents", []) or []
        if not opps:
            return 0, ""
        player_count = 1 + len(opps)
        max_plant = 0
        for opp in opps:
            max_plant = max(max_plant, self._to_int(getattr(opp, "plant_prod", 0)))
        if max_plant >= 4:
            return 5, f"opp plant_prod={max_plant}"
        if player_count >= 3 and max_plant < 2:
            return -5, "3P take-that waste"
        return 0, ""

    def _decomposers(self, state) -> tuple[int, str]:
        opps = getattr(state, "opponents", []) or []
        bio = 0
        for opp in opps:
            for entry in getattr(opp, "tableau", []) or []:
                name = self._card_name(entry)
                if name and name in self._bio_cards:
                    bio += 1
        if bio >= 3:
            return 3, f"opp bio tags={bio}"
        return 0, ""

    def _vermin(self, state) -> tuple[int, str]:
        opps = getattr(state, "opponents", []) or []
        best_prod = 0
        best_source = None
        for opp in opps:
            raw = getattr(opp, "raw", None) or {}
            if isinstance(raw, dict):
                prod = self._to_int(raw.get("animalProduction", 0))
                if prod > best_prod:
                    best_prod = prod
            for entry in getattr(opp, "tableau", []) or []:
                name = self._card_name(entry)
                if name and name in self._animal_sources and best_source is None:
                    best_source = name
        if best_prod > 0:
            return 4, f"opp animal_prod={best_prod}"
        if best_source is not None:
            return 4, f"opp has animal source {best_source}"
        return 0, ""
