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

# Cards whose resources (animals) are lost to opp Predators/Virus
_ANIMAL_ACCUMULATORS = {
    "Birds", "Fish", "Livestock", "Penguins", "Small Animals",
    "Herbivores", "Predators",
    # Ecological Zone holds animals but also microbes; treat conservatively
    "Ecological Zone",
}

# Cards storing microbes, vulnerable to opp Ants
_MICROBE_ACCUMULATORS = {
    "Decomposers", "Tardigrades", "Extremophiles",
    "GHG Producing Bacteria", "Nitrite Reducing Bacteria",
    "Sulphur-Eating Bacteria", "Regolith Eaters", "Psychrophiles",
    "ArchaeBacteria",
}

# Attack cards on opp tableau that pose ghost threats
_OPP_ANIMAL_ATTACKERS = {"Predators", "Small Animals", "Herbivores"}
_OPP_MICROBE_ATTACKERS = {"Ants"}
_OPP_RESOURCE_STEALERS = {"Hired Raiders", "Sabotage"}

# Cards that must place a settler on a Colony tile; value falls when most
# active colonies already have 3 settlers.
_TRADE_TRIGGERS = {
    "Trade Envoys", "L1 Trade Terminal",
    "Cryo-Sleep", "Rim Freighters",
}

_FLEET_ADDERS = {
    "Sky Docks", "Space Port", "Space Port Colony",
}

_COLONY_BUILDERS = {
    "Mining Colony", "Trading Colony", "Pioneer Settlement",
    "Research Colony", "Ice Moon Colony", "Minority Refuge",
    "Space Port Colony", "Titan Shipyards",
    "Early Colonization",  # prelude
}


class OpponentReactiveAdjuster:
    """Layer over adjusted_score that reacts to opponent state."""

    def __init__(self, db=None):
        self.db = db
        self._bio_cards = self._build_bio_set(db)
        self._animal_sources = self._build_animal_source_set(db)
        self._behaviors = self._load_behaviors()

    @staticmethod
    def _load_behaviors() -> dict:
        import json
        import os
        from .shared_data import resolve_data_path
        path = resolve_data_path("all-card-behaviors.json")
        if not os.path.exists(path):
            return {}
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

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
        t_delta, t_reason = self._turmoil_delta(card_name, state)
        raw_delta += t_delta
        if t_reason and not raw_reason:
            raw_reason = t_reason
        elif t_reason:
            raw_reason = f"{raw_reason}; {t_reason}"
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

    _RULING_TAG_BONUS = {
        "Scientists": ("science", 2),
        "Greens": ("plant", 2),
        "Mars First": ("building", 2),
        "Kelvinists": ("power", 2),
    }
    _UNITY_TAGS = {"space", "venus", "jovian"}

    def _turmoil_delta(self, card_name: str, state) -> tuple[int, str]:
        """Ruling-party bonuses/penalty + soft forecast for the dominant party
        (which becomes ruling next generation)."""
        turmoil = getattr(state, "turmoil", None)
        if not turmoil or not isinstance(turmoil, dict):
            return 0, ""
        ruling = turmoil.get("ruling")
        dominant = turmoil.get("dominant")
        info = self.db.get_info(card_name) if self.db else None

        total = 0
        reasons: list[str] = []

        cur_delta, cur_reason = self._party_effect(card_name, ruling, info, full=True)
        if cur_delta:
            total += cur_delta
            reasons.append(cur_reason)

        # Dominant != ruling → half-effect forecast
        if dominant and dominant != ruling:
            fc_delta, fc_reason = self._party_effect(card_name, dominant, info, full=False)
            if fc_delta:
                total += fc_delta
                reasons.append(f"forecast: {fc_reason}")

        if total == 0:
            return 0, ""
        return total, "; ".join(reasons)

    def _party_effect(self, card_name: str, party: str, info, *, full: bool) -> tuple[int, str]:
        """Compute delta for a party effect. full=False halves the magnitude
        (rounded toward zero)."""
        if not party:
            return 0, ""
        if party == "Reds":
            raises = self._count_global_raises(card_name)
            if raises <= 0:
                return 0, ""
            base = 3 * raises
            val = base if full else base // 2
            if val <= 0:
                return 0, ""
            penalty = -min(10, val)
            tag = "Reds ruling" if full else "Reds dominant"
            return penalty, f"{tag}: {raises} global raise(s)"
        if not info:
            return 0, ""
        tags = [str(t).lower() for t in (info.get("tags") or [])]
        if not tags:
            return 0, ""
        if party == "Unity":
            if any(t in self._UNITY_TAGS for t in tags):
                bonus = 2 if full else 1
                return bonus, f"Unity {'ruling' if full else 'dominant'}: space/venus/jovian"
            return 0, ""
        cfg = self._RULING_TAG_BONUS.get(party)
        if cfg:
            need_tag, bonus = cfg
            if need_tag in tags:
                val = bonus if full else max(1, bonus // 2)
                return val, f"{party} {'ruling' if full else 'dominant'}: {need_tag}"
        return 0, ""

    def _count_global_raises(self, card_name: str) -> int:
        """How many 'Reds-taxed' raise-events does this card trigger?

        Counts: TR increments, global param steps (temp/oxygen/venus),
        placing an ocean, placing a greenery (greenery raises oxygen),
        placing a city adjacent to ocean (not counted — conditional).
        """
        entry = self._behaviors.get(card_name, {}) or {}
        beh = entry.get("behavior") or {}
        total = 0
        if beh.get("tr"):
            total += self._to_int(beh.get("tr"))
        glob = beh.get("global") or {}
        for v in glob.values():
            total += self._to_int(v)
        if beh.get("ocean"):
            total += self._to_int(beh.get("ocean"))
        if beh.get("greenery"):
            total += 1  # greenery raises oxygen 1 step
        return max(0, total)

    def _dispatch(self, card_name: str, state) -> tuple[int, str]:
        handler = {
            "Birds": self._birds,
            "Decomposers": self._decomposers,
            "Vermin": self._vermin,
            "Asteroid": self._plant_attack,
            "Big Asteroid": self._plant_attack,
            "Comet": self._plant_attack,
            "Sabotage": self._sabotage,
            "Hired Raiders": self._sabotage,
            "Virus": self._virus,
            "Mining Rights": self._mining_rights,
            "Mining Area": self._mining_area,
            "Ants": self._ants,
            "Herbivores": self._plant_prod_attack,
            "Small Animals": self._plant_prod_attack,
            "Predators": self._predators,
            "Lava Flows": self._lava_flows,
            "Protected Habitats": self._protected_habitats,
            "Mining Colony": self._colony_builder,
            "Trading Colony": self._colony_builder,
            "Pioneer Settlement": self._colony_builder,
            "Research Colony": self._colony_builder,
            "Ice Moon Colony": self._colony_builder,
            "Minority Refuge": self._colony_builder,
            "Space Port Colony": self._colony_builder,
            "Titan Shipyards": self._colony_builder,
            "Early Colonization": self._colony_builder,
            "Trade Envoys": self._trade_trigger,
            "L1 Trade Terminal": self._trade_trigger,
            "Cryo-Sleep": self._trade_trigger,
            "Rim Freighters": self._trade_trigger,
            "Sky Docks": self._fleet_adder,
            "Space Port": self._fleet_adder,
            "Space Port Colony": self._fleet_adder_and_colony,
        }.get(card_name)
        if handler is not None:
            base = handler(state)
            # stack ghost-threat for dual-role cards (Birds/Decomposers are
            # both opp-reactive and accumulators)
            ghost = self._ghost_threat(card_name, state)
            return base[0] + ghost[0], ghost[1] or base[1]
        return self._ghost_threat(card_name, state)

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

    def _plant_attack(self, state) -> tuple[int, str]:
        """Asteroid/Big Asteroid/Comet: remove plants from any player."""
        opps = getattr(state, "opponents", []) or []
        if not opps:
            return 0, ""
        player_count = 1 + len(opps)
        max_plants = 0
        for opp in opps:
            raw_plants = self._to_int(getattr(opp, "plants", 0))
            max_plants = max(max_plants, raw_plants)
        if max_plants >= 3:
            return 3, f"opp plants={max_plants} (attack target)"
        if player_count >= 3 and max_plants == 0:
            return -5, "3P take-that: no target, feeds third"
        return 0, ""

    def _sabotage(self, state) -> tuple[int, str]:
        """Sabotage: remove up to 3 ti, 4 steel, or 7 MC from any player."""
        opps = getattr(state, "opponents", []) or []
        if not opps:
            return 0, ""
        player_count = 1 + len(opps)
        max_value = 0
        for opp in opps:
            raw = getattr(opp, "raw", None) or {}
            ti = self._to_int(getattr(opp, "titanium", 0))
            steel = self._to_int(getattr(opp, "steel", 0))
            mc = self._to_int(getattr(opp, "mc", 0))
            max_value = max(max_value, ti * 3, steel * 2, mc)
        if max_value >= 7:
            return 4, f"opp resources worth {max_value} MC+"
        if player_count >= 3 and max_value < 3:
            return -5, "3P take-that waste (no rich opp)"
        return 0, ""

    def _virus(self, state) -> tuple[int, str]:
        """Virus: remove 2 animals OR reduce plant-prod 2 from any player."""
        opps = getattr(state, "opponents", []) or []
        if not opps:
            return 0, ""
        best_signal = 0
        for opp in opps:
            animals = 0
            raw = getattr(opp, "raw", None) or {}
            if isinstance(raw, dict):
                # Animals live on tableau cards (Birds/Pets resources), не agg resource
                for card in getattr(opp, "tableau", []) or []:
                    if isinstance(card, dict):
                        animals += self._to_int(card.get("resources", 0))
            plant_prod = self._to_int(getattr(opp, "plant_prod", 0))
            signal = max(animals, plant_prod * 2)
            best_signal = max(best_signal, signal)
        if best_signal >= 4:
            return 3, f"opp animals/plant-prod signal {best_signal}"
        return 0, ""


    _LAVA_SPOT_NAMES = {"tharsis tholus", "ascraeus mons", "pavonis mons", "arsia mons"}

    def _opp_has_any(self, state, names: set[str]) -> str | None:
        for opp in getattr(state, "opponents", []) or []:
            for card in getattr(opp, "tableau", []) or []:
                if not isinstance(card, dict):
                    continue
                cname = card.get("name")
                if cname in names:
                    return cname
        return None

    def _ghost_threat(self, card_name: str, state) -> tuple[int, str]:
        """Penalty for my accumulator cards when opp already has an attacker
        on the table. The threat isn't active yet, but opp can strike."""
        if card_name in _ANIMAL_ACCUMULATORS:
            hit = self._opp_has_any(state, _OPP_ANIMAL_ATTACKERS)
            if hit:
                return -3, f"opp has {hit} in tableau (animals at risk)"
        if card_name in _MICROBE_ACCUMULATORS:
            hit = self._opp_has_any(state, _OPP_MICROBE_ATTACKERS)
            if hit:
                return -2, f"opp has {hit} in tableau (microbes at risk)"
        return 0, ""

    def _trade_trigger(self, state) -> tuple[int, str]:
        """Trade-trigger cards need a trade action to fire. If the player's
        fleet is already saturated this generation, the trigger will have to
        wait — small penalty."""
        me = getattr(state, "me", None)
        if me is None:
            return 0, ""
        trades_done = self._to_int(getattr(me, "trades_this_gen", 0))
        fleet_size = max(1, self._to_int(getattr(me, "fleet_size", 1)))
        remaining = fleet_size - trades_done
        if remaining <= 0:
            return -3, f"fleet saturated ({trades_done}/{fleet_size})"
        return 0, ""

    def _fleet_adder(self, state) -> tuple[int, str]:
        """Extra fleet cards gain value when the existing fleet is fully booked."""
        me = getattr(state, "me", None)
        if me is None:
            return 0, ""
        trades_done = self._to_int(getattr(me, "trades_this_gen", 0))
        fleet_size = max(1, self._to_int(getattr(me, "fleet_size", 1)))
        if trades_done >= fleet_size and fleet_size >= 1:
            return 3, f"fleet saturated — extra ship helps"
        return 0, ""

    def _fleet_adder_and_colony(self, state) -> tuple[int, str]:
        """Space Port Colony: fleet adder + colony builder. Stack both effects."""
        fleet_delta, fleet_reason = self._fleet_adder(state)
        colony_delta, colony_reason = self._colony_builder(state)
        total = fleet_delta + colony_delta
        reason = fleet_reason or colony_reason
        return total, reason

    def _colony_builder(self, state) -> tuple[int, str]:
        """Colony-builder cards require an empty settler slot on some colony.
        When most active colonies are saturated (3/3), value drops sharply."""
        colonies = getattr(state, "colonies_data", None)
        if colonies is None:
            colonies = [c for c in (getattr(state, "game", {}) or {}).get("colonies", [])
                        if c.get("isActive", True)]
        if not colonies:
            return 0, ""
        active = len(colonies)

        def _settler_list(c):
            if not isinstance(c, dict):
                return []
            return c.get("settlers") or c.get("colonies") or []

        saturated = sum(1 for c in colonies if len(_settler_list(c)) >= 3)
        if active == 0:
            return 0, ""
        free = active - saturated
        if free == 0:
            return -10, "all active colonies saturated (3 settlers)"
        if free == 1:
            return -4, f"only 1 open colony slot left ({saturated}/{active} saturated)"
        if saturated * 2 >= active:
            return -2, f"{saturated}/{active} colonies saturated"
        return 0, ""

    def _protected_habitats(self, state) -> tuple[int, str]:
        """Protected Habitats defensive value rises when opp has attackers."""
        attackers = (
            _OPP_ANIMAL_ATTACKERS | _OPP_MICROBE_ATTACKERS | _OPP_RESOURCE_STEALERS
        )
        hit = self._opp_has_any(state, attackers)
        if hit:
            return 4, f"opp threat {hit}: defense worth more"
        return 0, ""

    def _ants(self, state) -> tuple[int, str]:
        """Ants: action eats opponent microbes. Good when opps stockpile microbes."""
        opps = getattr(state, "opponents", []) or []
        if not opps:
            return 0, ""
        max_microbes = 0
        for opp in opps:
            for card in getattr(opp, "tableau", []) or []:
                if not isinstance(card, dict):
                    continue
                if card.get("name") in self._bio_cards:
                    max_microbes = max(max_microbes, self._to_int(card.get("resources", 0)))
        if max_microbes >= 2:
            return 3, f"opp microbes={max_microbes} (eat target)"
        return 0, ""

    def _plant_prod_attack(self, state) -> tuple[int, str]:
        """Herbivores / Small Animals: reduce any plant-prod, scale with greenery."""
        opps = getattr(state, "opponents", []) or []
        if not opps:
            return 0, ""
        player_count = 1 + len(opps)
        max_plant_prod = 0
        for opp in opps:
            max_plant_prod = max(max_plant_prod, self._to_int(getattr(opp, "plant_prod", 0)))
        if max_plant_prod >= 3:
            return 3, f"opp plant_prod={max_plant_prod} (target)"
        if player_count >= 3 and max_plant_prod == 0:
            return -4, "3P take-that waste (no plant-prod target)"
        return 0, ""

    def _predators(self, state) -> tuple[int, str]:
        """Predators: action eats opponent animals. Good vs animal engines."""
        opps = getattr(state, "opponents", []) or []
        if not opps:
            return 0, ""
        max_animals = 0
        for opp in opps:
            for card in getattr(opp, "tableau", []) or []:
                if not isinstance(card, dict):
                    continue
                if card.get("name") in self._animal_sources:
                    max_animals = max(max_animals, self._to_int(card.get("resources", 0)))
        if max_animals >= 2:
            return 4, f"opp animals={max_animals} (prey)"
        return 0, ""

    def _lava_flows(self, state) -> tuple[int, str]:
        """Lava Flows places tile on one of 4 named volcanic spots."""
        spaces = getattr(state, "spaces", None)
        if spaces is None:
            spaces = (getattr(state, "game", {}) or {}).get("spaces") or []
        if not isinstance(spaces, list):
            return 0, ""
        free = 0
        for s in spaces:
            if not isinstance(s, dict):
                continue
            name = str(s.get("id") or s.get("name") or "").lower()
            if not any(k in name for k in self._LAVA_SPOT_NAMES):
                continue
            if s.get("tile") is None:
                free += 1
        if free == 0:
            return -10, "no volcanic spot left"
        if free <= 2:
            return -3, f"only {free} volcanic spots remain"
        return 0, ""

    @staticmethod
    def _free_mining_spaces(state) -> int:
        """Count land spaces with steel(2) or titanium(3) bonus, not yet tiled."""
        spaces = getattr(state, "spaces", None)
        if spaces is None:
            spaces = (getattr(state, "game", {}) or {}).get("spaces") or []
        if not isinstance(spaces, list):
            return 99
        count = 0
        for s in spaces:
            if not isinstance(s, dict):
                continue
            if s.get("tile") is not None:
                continue
            if s.get("spaceType") != "land":
                continue
            bonus = s.get("bonus") or []
            if any(b in (2, 3) for b in bonus):
                count += 1
        return count

    def _mining_rights(self, state) -> tuple[int, str]:
        """Mining Rights: place on free steel/ti bonus space.
        If only 0-2 spots left, opps may grab them first."""
        free = self._free_mining_spaces(state)
        if free >= 5:
            return 0, ""
        if free == 0:
            return -10, "no free steel/ti space left"
        if free <= 2:
            return -3, f"only {free} steel/ti spots remain"
        return 0, ""

    def _mining_area(self, state) -> tuple[int, str]:
        """Mining Area: steel/ti space adjacent to own tile.
        More restrictive than Mining Rights; penalize harder when spots scarce."""
        free = self._free_mining_spaces(state)
        if free >= 6:
            return 0, ""
        if free == 0:
            return -10, "no free steel/ti space left"
        if free <= 3:
            return -4, f"only {free} steel/ti spots remain (adj required)"
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
