"""SynergyEngine — adjusted scoring с учётом корпораций, тегов, timing, tableau."""

import re

from .constants import CORP_TAG_SYNERGIES, TABLEAU_DISCOUNT_CARDS, TABLEAU_SYNERGIES
from .analysis import _estimate_remaining_gens


# ── Milestone / Award definitions ──────────────────────────────────────
# Milestone: what tags/resources/conditions help claim it
# Format: {milestone_name: {"tags": [...], "resource": ..., "condition": ..., "threshold": N}}
MILESTONE_REQS = {
    # --- Tharsis ---
    "Terraformer": {"condition": "tr", "threshold": 35},
    "Mayor": {"condition": "cities", "threshold": 3},
    "Gardener": {"condition": "greeneries", "threshold": 3},
    "Builder": {"tags": ["Building"], "threshold": 8},
    "Planner": {"condition": "cards_in_hand", "threshold": 16},
    # --- Hellas ---
    "Diversifier": {"condition": "unique_tags", "threshold": 8},
    "Tactician": {"condition": "req_cards", "threshold": 5},
    "Polar Explorer": {"condition": "tiles_on_bottom_row"},
    "Energizer": {"resource": "energy_prod", "threshold": 6},
    "Rim Settler": {"tags": ["Jovian"], "threshold": 3},
    # --- Elysium ---
    "Generalist": {"condition": "all_prod_1"},
    "Specialist": {"condition": "max_prod_10"},
    "Ecologist": {"condition": "bio_tags", "threshold": 4},  # Plant+Microbe+Animal
    "Tycoon": {"condition": "green_blue_cards", "threshold": 15},
    "Legend": {"tags": ["Event"], "threshold": 5},
    # --- Common/Fan ---
    "Hoverlord": {"condition": "floaters", "threshold": 7},
    "Capitalist": {"condition": "mc_prod"},
    "Smith": {"resource": "steel_prod", "threshold": 5},  # or ti_prod
    "Tradesman": {"condition": "colonies", "threshold": 3},
    "Spacefarer": {"tags": ["Space"], "threshold": 6},
    "Terra Pioneer": {"tags": ["Mars"], "threshold": 5},
    "T. Collector": {"condition": "unique_tags"},
    "V. Electrician": {"resource": "energy_prod", "threshold": 4},
    "Tropicalist": {"condition": "tiles_tropics"},
    "Minimalist": {"condition": "min_cards_hand"},
    "Land Specialist": {"condition": "special_tiles"},
    "Colonizer": {"condition": "colonies", "threshold": 3},
    "Firestarter": {"resource": "heat_prod", "threshold": 5},
}

# Award: what tags/resources score points
# Format: {award_name: {"tags": [...], "resource": ..., "condition": ...}}
AWARD_SCORING = {
    "Landlord": {"condition": "tiles"},
    "Banker": {"resource": "mc_prod"},
    "Scientist": {"tags": ["Science"]},
    "Thermalist": {"resource": "heat"},
    "Miner": {"resource": "steel_titanium"},
    "Space Baron": {"tags": ["Space"]},
    "Excentric": {"condition": "resources_on_cards"},
    "Celebrity": {"condition": "expensive_cards"},
    "Desert Settler": {"condition": "desert_tiles"},
    "Estate Dealer": {"condition": "tiles_adj_ocean"},
    "Contractor": {"tags": ["Building"]},
    "Venuphile": {"tags": ["Venus"]},
    "Cultivator": {"condition": "greeneries"},
    "Magnate": {"condition": "green_cards"},
    "Industrialist": {"resource": "steel_energy"},
    "Benefactor": {"condition": "tr"},
    "Incorporator": {"condition": "played_cards"},
    "Tourist": {"condition": "cities"},
    "Urbanist": {"condition": "city_points"},
    "Warmonger": {"condition": "attacks"},
    "Biologist": {"condition": "bio_tags"},
    "Voyager": {"tags": ["Jovian"]},
    "Forecaster": {"condition": "event_cards"},
    "Cosmic Settler": {"condition": "colonies"},
    "Edgedancer": {"condition": "tiles_no_ocean"},
    "Curator": {"condition": "unique_tags"},
    "Zoologist": {"tags": ["Animal"]},
    "Botanist": {"condition": "plant_prod_or_plants"},
    "A. Engineer": {"condition": "tile_count"},
    "A. Manufacturer": {"condition": "building_tags"},
    "Visionary": {"condition": "cards_in_hand"},
    "Blacksmith": {"resource": "steel_prod"},
    "Naturalist": {"condition": "bio_tags"},
}

# Tag → which milestones/awards it helps
def _tag_to_milestone_awards():
    """Build reverse lookup: tag → list of milestone/award names that care about it."""
    tag_map = {}
    for name, req in {**MILESTONE_REQS, **AWARD_SCORING}.items():
        for tag in req.get("tags", []):
            tag_map.setdefault(tag, []).append(name)
    return tag_map

_TAG_MA_MAP = _tag_to_milestone_awards()


# ── Strategy Detection ──────────────────────────────────────────────────

# Strategy archetypes: what signals indicate each strategy
STRATEGY_PROFILES = {
    "plant_engine": {
        "tags": {"Plant": 3},
        "prod": {"plants": 5},
        "keywords": ["greenery", "plant prod", "plant-prod"],
        "boost_tags": ["Plant", "Microbe"],
        "boost_keywords": ["plant", "greenery", "forest"],
        "description": "Plant→Greenery VP engine",
    },
    "space_colony": {
        "tags": {"Space": 5, "Jovian": 2},
        "prod": {"titanium": 3},
        "keywords": ["colony", "trade", "fleet"],
        "boost_tags": ["Space", "Jovian", "Earth"],
        "boost_keywords": ["colony", "trade", "jovian", "titanium"],
        "description": "Space/Colony/Jovian engine",
    },
    "venus_engine": {
        "tags": {"Venus": 4},
        "prod": {},
        "keywords": ["venus", "floater", "raise venus"],
        "boost_tags": ["Venus"],
        "boost_keywords": ["venus", "floater", "raise venus"],
        "description": "Venus/Floater engine",
    },
    "heat_rush": {
        "prod": {"heat": 6},
        "tags": {"Power": 3},
        "keywords": ["heat", "temperature", "raise temp"],
        "boost_tags": ["Power"],
        "boost_keywords": ["heat", "temperature", "energy"],
        "description": "Heat→Temperature TR rush",
    },
    "city_builder": {
        "tags": {"Building": 6, "City": 3},
        "prod": {"steel": 3},
        "keywords": ["city", "steel", "building"],
        "boost_tags": ["Building", "City"],
        "boost_keywords": ["city", "steel", "building", "urban"],
        "description": "City/Building/Steel engine",
    },
    "science_draw": {
        "tags": {"Science": 4},
        "prod": {},
        "keywords": ["draw", "card", "research", "science"],
        "boost_tags": ["Science"],
        "boost_keywords": ["draw", "card", "look at", "research", "science"],
        "description": "Science/Card-draw engine",
    },
    "earth_economy": {
        "tags": {"Earth": 3},
        "prod": {},
        "keywords": ["earth", "luna", "colony", "trade", "sky docks"],
        "boost_tags": ["Earth", "Space"],
        "boost_keywords": ["earth", "luna", "colony", "trade"],
        "description": "Earth tag economy (Point Luna/Teractor draw+discount)",
    },
    "animal_vp": {
        "tags": {"Animal": 2},
        "prod": {},
        "keywords": ["animal", "1 vp per", "vp per resource"],
        "boost_tags": ["Animal", "Microbe"],
        "boost_keywords": ["animal", "vp per", "add.*animal"],
        "description": "Animal VP accumulator",
    },
}


# Corp → strategy mapping: corps that define a strategy direction
CORP_STRATEGY_BOOST = {
    "Aridor": "space_colony", "Poseidon": "space_colony", "Polyphemos": "space_colony",
    "EcoLine": "plant_engine", "Arklight": "animal_vp",
    "Morning Star Inc.": "venus_engine", "Morning Star Inc": "venus_engine",
    "Celestic": "venus_engine", "Aphrodite": "venus_engine",
    "Helion": "heat_rush", "Stormcraft Incorporated": "venus_engine",
    "Point Luna": "earth_economy", "Teractor": "earth_economy",
    "Crescent Research": "science_draw", "Crescent Research Association": "science_draw",
    "Splice": "animal_vp",  # microbe → triggers → often animal builds
    "Mining Guild": "city_builder", "Philares": "city_builder",
    "Robinson Industries": None,  # flexible, no default strategy
    "Inventrix": None,
}


def detect_strategies(player_tags: dict[str, int], state=None) -> list[tuple[str, float]]:
    """Detect active strategies with confidence 0.0-1.0.
    Returns list of (strategy_name, confidence) sorted by confidence desc."""
    results = []

    # Corp-based strategy boost
    corp_strat = None
    if state and state.me and state.me.tableau:
        for c in state.me.tableau[:4]:  # corps are first in tableau
            cname = c["name"] if isinstance(c, dict) else str(c)
            if cname in CORP_STRATEGY_BOOST:
                corp_strat = CORP_STRATEGY_BOOST[cname]
                break

    for strat_name, profile in STRATEGY_PROFILES.items():
        score = 0.0
        checks = 0

        # Corp boost: if corp matches this strategy, add 0.5 free
        if corp_strat == strat_name:
            score += 0.5
            checks += 1

        # Tag match
        tag_hits = 0
        tag_checks = 0
        for tag, threshold in profile.get("tags", {}).items():
            checks += 1
            tag_checks += 1
            count = player_tags.get(tag, 0)
            if count >= threshold:
                score += 1.0
                tag_hits += 1
            elif count >= max(2, threshold // 2):  # min 2 tags to count as half-hit
                score += 0.5

        # Production match
        if state and state.me and profile.get("prod"):
            for res, threshold in profile["prod"].items():
                checks += 1
                val = getattr(state.me, f"{res}_prod", 0)
                if val >= threshold:
                    score += 1.0
                elif val >= threshold // 2:
                    score += 0.5

        # Tableau keyword match
        if state and state.me and state.me.tableau:
            tableau_text = " ".join(
                c["name"].lower() if isinstance(c, dict) else str(c).lower()
                for c in state.me.tableau
            )
            kw_hits = sum(1 for kw in profile.get("keywords", []) if kw in tableau_text)
            if kw_hits >= 2:
                checks += 1
                score += 1.0
            elif kw_hits >= 1:
                checks += 1
                score += 0.5

        # Board state checks (colonies for space_colony, cities for city_builder)
        if state and state.me:
            if strat_name == "space_colony":
                colonies = getattr(state.me, 'colonies_count', 0) or getattr(state.me, 'coloniesCount', 0) or 0
                if colonies >= 2:
                    checks += 1
                    score += 1.0
                elif colonies >= 1:
                    checks += 1
                    score += 0.5
            elif strat_name == "city_builder":
                cities = getattr(state.me, 'cities_count', 0) or getattr(state.me, 'citiesCount', 0) or 0
                if cities >= 2:
                    checks += 1
                    score += 1.0
                elif cities >= 1:
                    checks += 1
                    score += 0.5

        if checks > 0:
            confidence = min(1.0, score / checks)
            # Without state, require at least 1 full tag hit to count
            if not state and tag_hits == 0:
                continue
            if confidence >= 0.4:
                results.append((strat_name, confidence))

    results.sort(key=lambda x: -x[1])
    return results


class SynergyEngine:
    def __init__(self, db, combo_detector=None):
        self.db = db
        self.combo = combo_detector

    def adjusted_score(self, card_name: str, card_tags: list[str],
                       corp_name: str, generation: int,
                       player_tags: dict[str, int],
                       state=None, context: str = "draft") -> int:
        """Score a card with context awareness.
        context: "draft" (buying decision), "play" (play/hold decision), "tableau" (already played)
        """
        base = self.db.get_score(card_name)
        bonus = 0

        # Context: draft hand-size penalty
        # Tempo 10-12 normal, engine 20-25 normal, up to 40 possible
        if context == "draft" and state and state.me:
            hand = getattr(state.me, 'cards_in_hand_n', 0) or len(state.cards_in_hand or [])
            if hand >= 25:
                bonus -= 3  # very heavy hand, buying more = dilution
            elif hand >= 20:
                bonus -= 1

        # Context: play — boost affordable cards, penalize unaffordable ones
        # Expensive cards often have better MC/value ratio, no bias against cost itself
        if context == "play" and state and state.me:
            card_info = self.db.get_info(card_name)
            card_cost = card_info.get("cost", 0) if card_info else 0
            mc = state.me.mc
            # Affordable bonus: can play right now = tempo
            if card_cost <= mc * 0.5:
                bonus += 2  # cheap relative to MC = easy play
            elif card_cost > mc:
                bonus -= 3  # can't afford = not playable this gen

        # Corp tag synergies
        corp_syn = CORP_TAG_SYNERGIES.get(corp_name, {})
        for tag in card_tags:
            bonus += corp_syn.get(tag, 0)

        # 2P take-that bonus: base scores penalized for 3P (-5 to -10).
        # In 2P no "third player benefits free" problem, so take-that is stronger.
        TAKE_THAT_CARDS = {
            # Production steal — direct exchange, much better in 2P
            "Hackers": 12,           # D-48 → C-60. Steal 2 MC-prod.
            "Energy Tapping": 5,     # C-63 → C-68.
            "Biomass Combustors": 8, # D-48 → C-56. -1 plant-prod opp.
            "Great Escarpment Consortium": 5,  # C-55 → C-60.
            "Power Supply Consortium": 5,      # C-59 → C-64.
            # Direct resource steal/destroy
            "Hired Raiders": 4,      # C-58 → C-62.
            "Flooding": 5,           # C-64 → C-69.
            "Sabotage": 6,           # D-54 → C-60.
            "Air Raid": 6,           # D-38 → D-44. Still weak but less bad.
            "Law Suit": 5,           # D-52 → C-57.
            # Plant destroy (opponent has exactly 1 target in 2P)
            "Virus": 3,             # B-76 → B-79. Already strong.
            "Impactor Swarm": 5,    # D-40 → D-45. Heat bonus + plant kill.
            # Birds/Fish — plant-prod attack is bonus, not core value. Small adjust.
            "Birds": 2,             # B-78 → B-80. Attack is free bonus.
            "Fish": 2,              # B-77 → B-79.
            # Resource steal actions — ongoing, stronger in 2P
            "Predators": 3,         # B-71 → B-74.
            "Ants": 3,              # C-63 → C-66.
            # Asteroids with plant destroy — already costed for TR, small bonus
            "Aerobraked Ammonia Asteroid": 4,  # D-40 → D-44.
        }
        # Cards that scale with opponent COUNT (better in 4-5P, worse in 2P)
        # Base scores calibrated for 3P (2 opponents). Adjust for other counts.
        # Per-extra-opponent bonus (or penalty if fewer opponents).
        OPPONENT_SCALING_CARDS = {
            # Per-opponent-tag MC/VP — direct linear scaling
            "Toll Station": 4,           # 1 MC per opp Space tag.
            "Galilean Waystation": 4,    # 1 MC per opp Jovian tag.
            "Space Hotels": 3,           # 1 MC per opp Earth tag.
            "Miranda Resort": 3,         # 1 VP per opp Earth tag.
            # Trigger on opponent actions — more opponents = more triggers
            "Pets": 3,                   # +1 animal per opp city.
            # Immigrant City: scaling matters only for early play (trigger effect).
            # Late play = just a cheap city for VP, no scaling. Omitted.
            "Rover Construction": 2,     # +2 MC per city placed (any player).
            "Decomposers": 2,            # +1 microbe per animal/plant/microbe tag (own+opp).
            "Ecological Zone": 2,        # +1 animal per green tag played (own+opp in Colonies).
            "Herbivores": 2,             # +1 animal per greenery placed (any player).
            # MC from board state — more players = more tiles
            "Martian Rails": 2,          # 1 MC per city on Mars.
            "Industrial Center": 2,      # adjacent to city (more cities).
            "Greenhouses": 2,            # plant per city on Mars.
        }
        # NOTE: Viral Enhancers, Mars University trigger on OWN tags only — no scaling.
        # NOTE: Decomposers/Eco Zone trigger on "any player" in Colonies rules.

        # Take-that cards — WORSE in 4-5P (help N-2 players free)
        TAKE_THAT_4P_PENALTY = {
            "Hackers": -4,
            "Energy Tapping": -3,
            "Biomass Combustors": -4,
            "Great Escarpment Consortium": -3,
            "Power Supply Consortium": -3,
            "Hired Raiders": -2,
            "Flooding": -2,
            "Sabotage": -2,
            "Birds": -2,              # -2 plant-prod helps 3 others in 5P
            "Fish": -2,
        }

        if state and hasattr(state, 'opponents'):
            player_count = 1 + len(state.opponents)

            # 2P: take-that bonus + opponent-scaling penalty
            if player_count == 2:
                if card_name in TAKE_THAT_CARDS:
                    bonus += TAKE_THAT_CARDS[card_name]
                if card_name in OPPONENT_SCALING_CARDS:
                    bonus -= OPPONENT_SCALING_CARDS[card_name]  # half the opponents = half the value

            # 4P: opponent scaling bonus + take-that penalty
            if player_count == 4:
                if card_name in OPPONENT_SCALING_CARDS:
                    bonus += OPPONENT_SCALING_CARDS[card_name]
                if card_name in TAKE_THAT_4P_PENALTY:
                    bonus += TAKE_THAT_4P_PENALTY[card_name]

            # 5P: even stronger scaling, even worse take-that
            if player_count >= 5:
                if card_name in OPPONENT_SCALING_CARDS:
                    bonus += OPPONENT_SCALING_CARDS[card_name] * 2
                if card_name in TAKE_THAT_4P_PENALTY:
                    bonus += int(TAKE_THAT_4P_PENALTY[card_name] * 1.5)

        # No-tag: Sagitta bonus only, no penalty (no-tag cards compensate with good effects)
        if not card_tags:
            if "sagitta" in corp_name.lower():
                bonus += 5  # Sagitta loves no-tag
            # No penalty: no-tag cards have 0 tag value, not negative.
            # They often have strong effects to compensate for missing synergies.

        # Timing: smooth scaling based on gens_left
        gens_left = _estimate_remaining_gens(state) if state else max(1, 9 - generation)
        card_data = self.db.get(card_name)
        card_info = self.db.get_info(card_name)
        if card_data:
            r = card_data.get("reasoning", "").lower()
            desc = str(card_info.get("description", "")).lower() if card_info else ""
            card_text = r + " " + desc

            # Production cards: value scales linearly with gens_left
            is_prod = any(kw in card_text for kw in [
                "prod", "production", "mc-prod", "steel-prod", "ti-prod",
                "plant-prod", "energy-prod", "heat-prod"])
            if is_prod:
                if gens_left <= 1:
                    # Last gen: production is worthless, only VP/TR matter
                    # Crush production-only cards (keep VP component if any)
                    is_also_vp = any(kw in card_text for kw in ["vp", "victory point"])
                    bonus -= 25 if not is_also_vp else 15
                else:
                    prod_adj = round((gens_left - 5) * 3.5)
                    prod_adj = max(-15, min(12, prod_adj))
                    bonus += prod_adj

            # Energy cost discount in late game:
            # Cards that sacrifice energy prod (Capital -2, Underground City -2, etc.)
            # are overpenalized because energy_prod valued at 7.5 MC (gen 1 value).
            # Late game: energy → heat → worthless if temp maxed. Cost ≈ 0-2 MC, not 7.5.
            has_energy_cost = any(kw in desc for kw in [
                "decrease your energy production",
                "energy production 1 step",  # decrease implied
                "energy production 2 step",
            ]) if desc else False
            # Also check for explicit -energy in reasoning
            if not has_energy_cost and "energy" in card_text and ("decrease" in card_text or "lose" in card_text or "-energy" in card_text):
                has_energy_cost = True

            if has_energy_cost and gens_left <= 4:
                # Check if player has energy sinks (Power Infrastructure, Supercapacitors, etc.)
                has_sinks = False
                if state and state.me and state.me.tableau:
                    sink_cards = {"Power Infrastructure", "Supercapacitors", "Meltworks",
                                  "Electro Catapult", "Steelworks", "Energy Market"}
                    tab_names = {c["name"] if isinstance(c, dict) else str(c) for c in state.me.tableau}
                    has_sinks = bool(tab_names & sink_cards)

                if not has_sinks:
                    # Energy cost is cheap late game (no sinks = energy → heat → nothing)
                    energy_discount = min(4, 5 - gens_left)  # gen4: +1, gen3: +2, gen2: +3, gen1: +4
                    bonus += energy_discount

            # VP-action snowball: cards with vp_per resource + action/trigger
            # (e.g. Venusian Animals: action +1 animal, 1 VP/animal)
            # These are BETTER early — each remaining gen = ~1 more VP
            is_vp_action = False
            if self.combo and hasattr(self.combo, 'parser'):
                eff = self.combo.parser.get(card_name)
                if eff and eff.vp_per and "resource" in str(eff.vp_per.get("per", "")):
                    if eff.actions or eff.triggers:
                        is_vp_action = True

            is_vp = any(kw in card_text for kw in ["vp", "victory point", "1 vp"])
            is_action = "action" in card_text

            if is_vp_action:
                vp_action_adj = round(min(gens_left - 1, 5) * 1.5)
                bonus += max(0, min(8, vp_action_adj))
            elif is_vp and not is_prod:
                vp_adj = round((5 - gens_left) * 1.6)
                bonus += max(-5, min(8, vp_adj))
            elif is_action and not is_prod and not is_vp:
                action_adj = round((gens_left - 4) * 1.2)
                bonus += max(-6, min(5, action_adj))

        # Tag synergies based on existing tags (each tag evaluated independently)
        tag_bonuses = {
            "Jovian": 2,  # always valuable (rare, VP multipliers)
            "Science": 1 if player_tags.get("Science", 0) >= 2 else 0,  # 1-3 MC, cheaper than Jovian
            "Earth": 2 if player_tags.get("Earth", 0) >= 3 else 0,
            "Event": 2 if player_tags.get("Event", 0) >= 3 else 0,
            "Venus": 1 if player_tags.get("Venus", 0) >= 2 else 0,
            "Space": 1 if player_tags.get("Space", 0) >= 4 else 0,
            "Building": 1 if player_tags.get("Building", 0) >= 5 else 0,
            "Plant": 1 if player_tags.get("Plant", 0) >= 2 else 0,
            "Microbe": 1 if player_tags.get("Microbe", 0) >= 1 else 0,
            "Animal": 1 if player_tags.get("Animal", 0) >= 1 else 0,
        }
        for tag in card_tags:
            bonus += tag_bonuses.get(tag, 0)

        # === Milestone / Award contribution bonus ===
        if state and card_tags:
            my_color = state.me.color if state.me else None

            # Check milestones: if unclaimed and we're close, boost tags that help
            for ms in state.milestones:
                if ms.get("claimed_by"):
                    continue  # already claimed, skip
                ms_name = ms.get("name", "")
                ms_def = MILESTONE_REQS.get(ms_name)
                if not ms_def:
                    continue

                # Check if this card's tags help with the milestone
                ms_tags = ms_def.get("tags", [])
                matching = [t for t in card_tags if t in ms_tags]
                if not matching:
                    # Bio-tag milestones (Ecologist): Plant+Microbe+Animal
                    if ms_def.get("condition") == "bio_tags":
                        matching = [t for t in card_tags if t in ("Plant", "Microbe", "Animal")]
                    # Unique tags (Diversifier, T. Collector)
                    elif ms_def.get("condition") == "unique_tags":
                        existing = set(t for t, c in player_tags.items() if c > 0)
                        matching = [t for t in card_tags if t not in existing]

                if matching and my_color:
                    my_score = ms.get("scores", {}).get(my_color, {})
                    my_val = my_score.get("score", 0) if isinstance(my_score, dict) else my_score
                    threshold = ms_def.get("threshold", 0)

                    if threshold and my_val > 0:
                        gap = threshold - my_val
                        if gap <= 2:  # 1-2 away from claiming
                            bonus += 5
                        elif gap <= 4:  # 3-4 away
                            bonus += 2

            # Check awards: if funded (or likely), boost tags that score points
            for aw in state.awards:
                aw_name = aw.get("name", "")
                aw_def = AWARD_SCORING.get(aw_name)
                if not aw_def:
                    continue

                aw_tags = aw_def.get("tags", [])
                matching = [t for t in card_tags if t in aw_tags]

                # Bio-tag awards (Biologist, Naturalist, Zoologist)
                if not matching and aw_def.get("condition") == "bio_tags":
                    matching = [t for t in card_tags if t in ("Plant", "Microbe", "Animal")]

                if matching:
                    is_funded = aw.get("funded_by") is not None
                    if is_funded:
                        bonus += 3  # funded award, each matching tag = direct VP
                    else:
                        bonus += 1  # unfunded but might be funded later

        # Turmoil ruling bonus
        if state and state.turmoil:
            ruling = state.turmoil.get("ruling", "")
            if ruling == "Scientists" and "Science" in card_tags:
                bonus += 2
            elif ruling == "Unity" and any(t in card_tags for t in ("Venus", "Earth", "Jovian")):
                bonus += 2
            elif ruling == "Greens" and any(t in card_tags for t in ("Plant", "Microbe", "Animal")):
                bonus += 2
            elif ruling == "Reds":
                # Check both reasoning and card description for TR-raising
                texts = []
                if card_data:
                    texts.append(card_data.get("reasoning", "").lower())
                if card_info:
                    texts.append(str(card_info.get("description", "")).lower())
                combined = " ".join(texts)
                if any(kw in combined for kw in [
                    "raise temperature", "raise oxygen", "raise venus",
                    "place ocean", "place an ocean", "terraform rating",
                    "increase your terraform", "tr.", "1 tr", "2 tr", "3 tr"
                ]):
                    bonus -= 6  # 1 TR lost ≈ 7 MC, heavy penalty

        # Tableau discount stacking + corp discount awareness
        if state and hasattr(state, 'me') and state.me.tableau:
            total_discount = 0  # accumulate all discounts for this card
            for tc in state.me.tableau:
                tc_name = tc["name"] if isinstance(tc, dict) else str(tc)
                disc = TABLEAU_DISCOUNT_CARDS.get(tc_name, {})
                for tag in card_tags:
                    if tag in disc:
                        total_discount += disc[tag]
                if "all" in disc and card_tags:
                    total_discount += disc["all"]

            # Corp discounts (Teractor -3 Earth, Thorgate -3 Power, MSI -2 Venus)
            from .constants import CORP_DISCOUNTS
            corp_disc = CORP_DISCOUNTS.get(corp_name, {})
            for tag in card_tags:
                if tag in corp_disc:
                    total_discount += corp_disc[tag]

            # Discount = MC saved = score bonus (but cap at 5 to stay adjustment-sized)
            bonus += min(total_discount, 5)

        # Corp ability bonuses: recurring income per tag played
        # These are ON TOP of CORP_TAG_SYNERGIES (which gives static +N per tag)
        if corp_name == "Splice" and "Microbe" in card_tags:
            bonus += 2  # opponent Microbe plays also trigger Splice in 3P
        if corp_name in ("Lakefront Resorts", "Lakefront") and card_info:
            desc = str(card_info.get("description", "")).lower()
            if "ocean" in desc:
                bonus += 2
        # MSI: no Venus requirements → Venus cards playable gen 1
        if corp_name in ("Morning Star Inc.", "Morning Star Inc") and "Venus" in card_tags:
            bonus += 2  # Venus cards always playable = tempo advantage
        # Helion: heat = MC → heat-producing cards much more valuable
        # Normal: heat_prod ≈ 4 MC. Helion: heat_prod ≈ MC_prod ≈ 5-6 MC. Delta +2 per step.
        if corp_name == "Helion" and card_info:
            desc = str(card_info.get("description", "")).lower()
            # Count heat production steps
            heat_steps = 0
            hm = re.search(r'(?:increase|raise).*heat production (\d+)', desc)
            if hm:
                heat_steps = int(hm.group(1))
            elif "heat production" in desc and "decrease" not in desc:
                heat_steps = 1
            if heat_steps:
                bonus += min(heat_steps * 2, 5)  # +2 per step, cap 5
        # Manutech: MC = production increase → production cards trigger MC gain
        if corp_name == "Manutech" and card_info:
            desc = str(card_info.get("description", "")).lower()
            if "production" in desc and "increase" in desc:
                bonus += 2  # Manutech gets MC equal to prod increase
        # Arklight: +1 animal/plant per animal/plant tag → animal/plant tags extra valuable
        if corp_name == "Arklight" and any(t in card_tags for t in ("Animal", "Plant")):
            bonus += 2  # free resource placement per tag

        # Tableau-aware synergy bonus (known good combos)
        if card_name in TABLEAU_SYNERGIES and state and hasattr(state, 'me') and state.me.tableau:
            tableau_names_set = {c["name"] if isinstance(c, dict) else str(c) for c in state.me.tableau}
            for pattern, syn_bonus, reason in TABLEAU_SYNERGIES[card_name]:
                if pattern.startswith("has:"):
                    target_card = pattern[4:]
                    if target_card in tableau_names_set:
                        bonus += syn_bonus
                elif pattern.startswith("tag:"):
                    m = re.match(r'tag:(\w+)>=(\d+)', pattern)
                    if m:
                        tag_name, threshold = m.group(1), int(m.group(2))
                        if player_tags.get(tag_name, 0) >= threshold:
                            bonus += syn_bonus

        # Reverse: check if any tableau card benefits from this card's presence
        if state and hasattr(state, 'me') and state.me.tableau:
            tableau_names_set = {c["name"] if isinstance(c, dict) else str(c) for c in state.me.tableau}
            for tname in tableau_names_set:
                if tname in TABLEAU_SYNERGIES:
                    for pattern, syn_bonus, reason in TABLEAU_SYNERGIES[tname]:
                        if pattern.startswith("has:") and pattern[4:] == card_name:
                            bonus += syn_bonus // 2

        # === Pathfinders: planetary tag bonus ===
        if state and hasattr(state, 'has_pathfinders') and state.has_pathfinders:
            PLANETARY_TAGS = {"Venus", "Earth", "Mars", "Jovian", "Moon"}
            planetary_count = sum(1 for t in card_tags if t.capitalize() in PLANETARY_TAGS
                                 or t.upper() in PLANETARY_TAGS or t in PLANETARY_TAGS)
            if planetary_count > 0:
                track_bonus = planetary_count * 2
                tracks = self.db.planetary_tracks
                if tracks:
                    for tag in card_tags:
                        tag_lower = tag.lower()
                        track = tracks.get(tag_lower)
                        if not track:
                            continue
                        api_tracks = getattr(state, 'planetary_tracks', {})
                        if api_tracks and tag_lower in api_tracks:
                            est_position = api_tracks[tag_lower]
                        else:
                            est_position = player_tags.get(tag_lower, 0) * 2
                        bonuses = track.get("bonuses", [])
                        for b in bonuses:
                            tags_to_bonus = b["position"] - est_position
                            if 0 < tags_to_bonus <= 2:
                                track_bonus += 2
                                break
                bonus += track_bonus

        # === ComboDetector: tableau synergy bonus ===
        if self.combo and state and hasattr(state, 'me') and state.me.tableau:
            tableau_names = [c["name"] for c in state.me.tableau]
            combo_bonus = self.combo.get_hand_synergy_bonus(card_name, tableau_names, player_tags)
            bonus += combo_bonus

        # === Strategy Coherence Bonus ===
        # Detect player's active strategy and boost cards that fit
        if state and card_tags:
            strategies = detect_strategies(player_tags, state)
            card_text_lower = ""
            if card_info:
                card_text_lower = str(card_info.get("description", "")).lower()

            coherence_bonus = 0
            for strat_name, confidence in strategies[:2]:  # top 2 strategies only
                profile = STRATEGY_PROFILES[strat_name]

                # Tag match: card has tags that fit the strategy
                tag_match = any(t in profile.get("boost_tags", []) for t in card_tags)

                # Keyword match: card description matches strategy keywords
                kw_match = any(kw in card_text_lower for kw in profile.get("boost_keywords", []))

                if tag_match or kw_match:
                    # Bonus scales with confidence (0.4-1.0 → +1 to +3)
                    coherence_bonus += round(confidence * 3)

            # Anti-coherence: card with 0 matching tags/keywords for ANY active strategy
            if strategies and coherence_bonus == 0 and len(card_tags) > 0:
                # Card doesn't fit any detected strategy — mild penalty
                coherence_bonus -= 1

            bonus += min(coherence_bonus, 4)  # cap

        # === Card draw engine bonus: triggers that draw cards are better early ===
        if self.combo and hasattr(self.combo, 'parser') and state:
            eff = self.combo.parser.get(card_name)
            if eff and eff.triggers:
                for trig in eff.triggers:
                    eff_text = trig.get("effect", "").lower()
                    if any(kw in eff_text for kw in ("draw", "card", "look at")):
                        gens_left_draw = _estimate_remaining_gens(state) if state else max(1, 9 - generation)
                        draw_bonus = round(min(gens_left_draw - 2, 4) * 1.2)
                        bonus += max(0, min(5, draw_bonus))
                        break

        # === Closed / near-closed parameter penalty ===
        if state and card_info:
            desc_lower = str(card_info.get("description", "")).lower()
            wasted_tr = 0
            near_closed_tr = 0  # TR steps that might be wasted (param almost full)

            # Temperature: max 8, near-closed at 6+
            temp_steps = 0
            tm = re.search(r'raise\s+(?:the\s+)?temperature\s+(\d+)\s+step', desc_lower)
            if tm:
                temp_steps = int(tm.group(1))
            elif "raise temperature" in desc_lower or "raise the temperature" in desc_lower:
                temp_steps = 1
            if temp_steps:
                if state.temperature >= 8:
                    wasted_tr += temp_steps
                elif state.temperature >= 4:  # 2 steps left or fewer
                    overshoot = max(0, temp_steps - (8 - state.temperature) // 2)
                    wasted_tr += overshoot
                    if overshoot < temp_steps:
                        near_closed_tr += temp_steps - overshoot

            # Oxygen: max 14, near-closed at 12+
            o2_steps = 0
            om = re.search(r'raise\s+(?:the\s+)?oxygen\s+(\d+)\s+step', desc_lower)
            if om:
                o2_steps = int(om.group(1))
            elif "raise oxygen" in desc_lower:
                o2_steps = 1
            if o2_steps:
                if state.oxygen >= 14:
                    wasted_tr += o2_steps
                elif state.oxygen >= 12:
                    overshoot = max(0, o2_steps - (14 - state.oxygen))
                    wasted_tr += overshoot
                    if overshoot < o2_steps:
                        near_closed_tr += o2_steps - overshoot

            # Oceans: max 9, near-closed at 8+
            oc_count = len(re.findall(r'place\s+(?:\d+\s+)?ocean', desc_lower))
            if oc_count:
                if state.oceans >= 9:
                    wasted_tr += oc_count
                elif state.oceans >= 8:
                    overshoot = max(0, oc_count - (9 - state.oceans))
                    wasted_tr += overshoot

            # Venus: max 30, near-closed at 26+
            v_steps = 0
            vm = re.search(r'raise\s+venus\s+(\d+)\s+step', desc_lower)
            if vm:
                v_steps = int(vm.group(1))
            elif "raise venus" in desc_lower:
                v_steps = 1
            if v_steps:
                if state.venus >= 30:
                    wasted_tr += v_steps
                elif state.venus >= 26:
                    overshoot = max(0, v_steps - (30 - state.venus) // 2)
                    wasted_tr += overshoot
                    if overshoot < v_steps:
                        near_closed_tr += v_steps - overshoot

            if wasted_tr > 0:
                bonus -= wasted_tr * 7
            if near_closed_tr > 0:
                bonus -= near_closed_tr * 2  # mild penalty for near-closed

        return max(0, min(100, base + bonus))
