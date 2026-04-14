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


def is_opening_hand_context(state) -> bool:
    if not state:
        return False

    phase = getattr(state, "phase", "") or ""
    if phase in ("initial_drafting", "corporationsDrafting"):
        return True

    generation = getattr(state, "generation", 1) or 1
    if generation > 1:
        return False

    return any((
        getattr(state, "dealt_corps", None),
        getattr(state, "dealt_preludes", None),
        getattr(state, "dealt_project_cards", None),
        getattr(state, "drafted_cards", None),
    ))


SPLICE_OPENING_PLACERS = {
    "Symbiotic Fungus",
    "Extreme-Cold Fungus",
    "Imported Nitrogen",
    "Controlled Bloom",
    "Cyanobacteria",
    "Bactoviral Research",
    "Nobel Labs",
    "Ecology Research",
}


def _visible_opening_card_names(state, attrs: tuple[str, ...]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    if not state:
        return names

    for attr in attrs:
        cards = getattr(state, attr, None)
        if not cards:
            continue
        for card in cards:
            name = card.get("name", "") if isinstance(card, dict) else str(card)
            if not name or name in seen:
                continue
            seen.add(name)
            names.append(name)
    return names


def _visible_colony_names(state, active_only: bool = False) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    if not state:
        return names

    raw_cols = getattr(state, "raw", {}).get("game", {}).get("colonies", [])
    for col in raw_cols:
        name = col.get("name", "") if isinstance(col, dict) else ""
        if not name:
            continue
        if active_only and col.get("isActive", True) is False:
            continue
        if name in seen:
            continue
        seen.add(name)
        names.append(name)
    return names


def _has_bio_tag_card(card_names: list[str], db, skip_name: str = "") -> int:
    count = 0
    for name in card_names:
        if not name or name == skip_name:
            continue
        info = db.get_info(name) if db else None
        tags = info.get("tags", []) if info else []
        if any(tag in ("Plant", "Animal", "Microbe") for tag in tags):
            count += 1
    return count


def _count_visible_tag_support(card_names: list[str], db, target_tag: str, skip_name: str = "") -> int:
    count = 0
    wild_tag = "Wild"
    for name in card_names:
        if not name or name == skip_name:
            continue
        info = db.get_info(name) if db else None
        tags = info.get("tags", []) if info else []
        if target_tag in tags or wild_tag in tags:
            count += 1
    return count


def _is_event_card(card_info: dict | None) -> bool:
    if not card_info:
        return False
    return str(card_info.get("type", "")).lower() == "event"


def _places_special_tile(card_info: dict | None) -> bool:
    if not card_info:
        return False
    desc = str(card_info.get("description", "")).lower()
    return (
        "place this tile" in desc
        or "place this special tile" in desc
        or "place a special tile" in desc
    )


def _places_colony(card_info: dict | None) -> bool:
    if not card_info:
        return False
    desc = str(card_info.get("description", "")).lower()
    return "place a colony" in desc


def _immediate_draw_count(card_info: dict | None) -> int:
    if not card_info:
        return 0
    desc = str(card_info.get("description", "")).lower()
    if "draw a card" in desc:
        return 1
    word_counts = {
        "one": 1,
        "two": 2,
        "three": 3,
        "four": 4,
        "five": 5,
    }
    for word, count in word_counts.items():
        if f"draw {word} cards" in desc:
            return count
    m = re.search(r"draw\s+(\d+)\s+cards?", desc)
    if m:
        return int(m.group(1))
    return 0


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

    def _astra_replay_target_scores(self, corp_name: str, generation: int,
                                    player_tags: dict[str, int], state) -> list[tuple[str, int]]:
        if not state or not getattr(state, "me", None) or not getattr(state.me, "tableau", None):
            return []

        scores: list[tuple[str, int]] = []
        for tableau_card in state.me.tableau:
            name = tableau_card.get("name", "") if isinstance(tableau_card, dict) else str(tableau_card)
            if not name:
                continue
            info = self.db.get_info(name)
            if not _is_event_card(info) or _places_special_tile(info):
                continue
            score = self.adjusted_score(
                name,
                info.get("tags", []) or [],
                corp_name,
                generation,
                player_tags,
                state,
                context="tableau",
            )
            scores.append((name, score))

        scores.sort(key=lambda item: item[1], reverse=True)
        return scores

    def adjusted_score(self, card_name: str, card_tags: list[str],
                       corp_name: str, generation: int,
                       player_tags: dict[str, int],
                       state=None, context: str = "draft") -> int:
        """Score a card with context awareness.
        context is kept for caller compatibility.
        Zone-specific drift is intentionally avoided: the same visible state
        should yield the same score for option/hand/tableau.
        """
        base = self.db.get_score(card_name)
        bonus = 0
        card_info = self.db.get_info(card_name)
        if (not card_tags) and card_info:
            card_tags = card_info.get("tags", []) or []

        if is_opening_hand_context(state):
            bonus += self.db.get_opening_hand_bias(card_name)

            opening_projects = _visible_opening_card_names(
                state, ("drafted_cards", "dealt_project_cards", "cards_in_hand"))
            opening_preludes = set(_visible_opening_card_names(
                state, ("dealt_preludes", "prelude_cards_in_hand")))
            opening_ceos = set(_visible_opening_card_names(
                state, ("dealt_ceos",)))
            visible_colonies = set(_visible_colony_names(state))
            player_count = 1 + len(getattr(state, "opponents", []) or [])
            visible_support_cards = _visible_opening_card_names(
                state,
                ("drafted_cards", "dealt_project_cards", "cards_in_hand", "dealt_preludes", "prelude_cards_in_hand", "dealt_ceos"),
            )

            if corp_name == "Interplanetary Cinematics":
                if card_name == "Media Group":
                    bonus += 2
                if card_name == "Optimal Aerobraking":
                    bonus += 3
                    if "Triton" in visible_colonies:
                        bonus += 1
                    if "Experimental Forest" in opening_preludes:
                        bonus += 1
                    if "Clarke" in opening_ceos:
                        bonus += 1
                    if "Media Group" in opening_projects:
                        bonus += 1

            if card_name in ("Decomposers", "Urban Decomposers"):
                opener_microbe_placers = sum(
                    1 for name in opening_projects
                    if name != card_name and name in SPLICE_OPENING_PLACERS
                )
                bio_support = _has_bio_tag_card(opening_projects, self.db, skip_name=card_name)
                has_enceladus = "Enceladus" in visible_colonies

                if corp_name == "Splice":
                    bonus -= 3  # generic Splice support should not overrate Decomposers by itself
                if has_enceladus:
                    bonus += 2
                if opener_microbe_placers > 0:
                    bonus += min(2, opener_microbe_placers)
                if corp_name == "Splice" and not has_enceladus and opener_microbe_placers == 0 and bio_support <= 1:
                    bonus -= 2

            if corp_name == "Splice":
                if card_name == "Vermin":
                    bonus += 2
                if "Microbe" in card_tags and "Enceladus" in visible_colonies:
                    bonus += 1

            if card_name == "Venusian Insects":
                if "Enceladus" in visible_colonies:
                    bonus += 4
                if getattr(state, "is_wgt", False) and player_count >= 4:
                    bonus += 3

            if card_name == "Insects":
                plant_support = _count_visible_tag_support(
                    visible_support_cards, self.db, "Plant", skip_name=card_name
                )
                oxygen_gap = max(0, 6 - getattr(state, "oxygen", 0))
                if corp_name == "EcoLine":
                    bonus += 2
                if plant_support == 0:
                    bonus -= 18
                elif plant_support == 1:
                    bonus -= 10
                elif plant_support >= 3:
                    bonus += min(5, (plant_support - 2) * 2)
                if oxygen_gap >= 6:
                    bonus -= 5
                elif oxygen_gap >= 5:
                    bonus -= 4
                elif oxygen_gap >= 4:
                    bonus -= 3

            if card_name == "Birds":
                oxygen_gap = max(0, 13 - getattr(state, "oxygen", 0))
                if oxygen_gap >= 11:
                    bonus -= 10
                elif oxygen_gap >= 9:
                    bonus -= 8
                elif oxygen_gap >= 7:
                    bonus -= 6
                elif oxygen_gap >= 5:
                    bonus -= 3

            if card_name == "Harvest":
                harvest_rush_cards = {
                    "Arctic Algae", "Kelp Farming", "Nitrogen-Rich Asteroid",
                    "Bushes", "Trees", "Grass", "Farming", "Nitrophilic Moss",
                    "Imported Hydrogen", "Imported Nitrogen", "Ecological Zone",
                }
                rush_hits = len(set(opening_projects) & harvest_rush_cards)
                if corp_name == "EcoLine":
                    rush_hits += 1
                if generation <= 2:
                    if rush_hits >= 3:
                        bonus += 2
                    elif rush_hits <= 1:
                        bonus -= 4

            if card_name == "Soil Studies":
                engine_colonies = {"Luna", "Pluto", "Triton", "Ceres"}
                plant_support = _count_visible_tag_support(
                    visible_support_cards, self.db, "Plant", skip_name=card_name
                )
                venus_support = _count_visible_tag_support(
                    visible_support_cards, self.db, "Venus", skip_name=card_name
                )
                colony_support = 0
                for support_name in visible_support_cards:
                    if not support_name or support_name == card_name:
                        continue
                    support_info = self.db.get_info(support_name) if self.db else None
                    if _places_colony(support_info):
                        colony_support += 1
                support_hits = plant_support + venus_support + colony_support
                engine_hits = len(visible_colonies & engine_colonies)

                if support_hits == 0:
                    bonus -= 4
                elif support_hits == 1:
                    bonus -= 2
                elif support_hits >= 3:
                    bonus += min(3, support_hits - 2)

                if engine_hits >= 3 and support_hits <= 2:
                    bonus -= 4
                elif engine_hits >= 2 and support_hits <= 1:
                    bonus -= 3

                if "Neptunian Power Consultants" in visible_support_cards and support_hits <= 2:
                    bonus -= 1
            if card_name == "Established Methods":
                premium_colonies = {
                    "Luna", "Pluto", "Titan", "Ganymede", "Europa", "Ceres",
                }
                colony_hits = len(visible_colonies & premium_colonies)
                if colony_hits >= 2:
                    bonus += 3
                elif colony_hits == 1:
                    bonus += 1
                if corp_name == "Poseidon":
                    bonus += 2
                if corp_name == "Thorgate":
                    bonus += 2
                if corp_name == "CrediCor":
                    bonus += 2
                if "Sagitta Frontier Services" in opening_ceos:
                    bonus += 1

            if card_name == "Great Aquifer":
                ocean_payoffs = {
                    "Arctic Algae", "Kelp Farming", "Lakefront Resorts", "Aquifer Pumping",
                }
                engine_colonies = {"Luna", "Pluto", "Triton", "Ceres"}
                ocean_hits = len(set(opening_projects) & ocean_payoffs)
                engine_hits = len(visible_colonies & engine_colonies)
                has_npc = "Neptunian Power Consultants" in visible_support_cards

                if ocean_hits > 0:
                    bonus += min(4, ocean_hits * 2)
                if corp_name == "EcoLine":
                    bonus += 2
                if corp_name == "Tharsis Republic":
                    bonus += 1

                if engine_hits >= 4:
                    bonus -= 6
                elif engine_hits >= 3:
                    bonus -= 5
                elif engine_hits >= 2:
                    bonus -= 3
                elif engine_hits == 1:
                    bonus -= 1
                if has_npc:
                    bonus -= 4
                    if "Europa" in visible_colonies:
                        bonus -= 1
                    if context == "draft":
                        bonus += 1  # denial value partly offsets the anti-synergy

            if card_name == "Strategic Base Planning":
                premium_colonies = {"Pluto", "Luna", "Triton"}
                good_colonies = {"Ceres", "Ganymede"}
                weak_colonies = {"Europa"}
                premium_hits = len(visible_colonies & premium_colonies)
                good_hits = len(visible_colonies & good_colonies)
                weak_hits = len(visible_colonies & weak_colonies)

                if premium_hits >= 2:
                    bonus += 4
                elif premium_hits == 1:
                    bonus += 3
                if good_hits > 0:
                    bonus += min(2, good_hits)
                if weak_hits > 0 and premium_hits == 0 and good_hits == 0:
                    bonus -= 1
                if corp_name == "Tharsis Republic":
                    bonus += 3
                if corp_name == "Cheung Shing MARS":
                    bonus += 1

            if card_name == "Suitable Infrastructure":
                cheap_prod_bumps = {
                    "Acquired Company", "Mining Area", "Mining Rights", "Power Generation",
                    "Peroxide Power", "Business Empire", "Mohole Area",
                }
                prod_bump_hits = 0
                cheap_prod_hits = 0
                for project_name in opening_projects:
                    eff = self.combo.parser.get(project_name) if self.combo and hasattr(self.combo, 'parser') else None
                    prod_steps = 0
                    if eff and getattr(eff, "production_change", None):
                        prod_steps = sum(
                            value for value in eff.production_change.values()
                            if isinstance(value, (int, float)) and value > 0
                        )
                    if prod_steps <= 0:
                        continue
                    prod_bump_hits += 1
                    if project_name in cheap_prod_bumps:
                        cheap_prod_hits += 1

                if prod_bump_hits >= 3:
                    bonus += 4
                elif prod_bump_hits == 2:
                    bonus += 3
                elif prod_bump_hits == 1:
                    bonus += 1

                if cheap_prod_hits >= 2:
                    bonus += 2
                elif cheap_prod_hits == 1:
                    bonus += 1

                if corp_name == "Robinson Industries":
                    bonus += 3
                elif corp_name == "Manutech":
                    bonus += 2

                if "Ceres" in visible_colonies:
                    bonus += 1

            if card_name == "Heat Trappers":
                if corp_name == "Thorgate":
                    bonus += 4
                if corp_name == "Cheung Shing MARS":
                    bonus += 3
                if "Neptunian Power Consultants" in visible_support_cards:
                    bonus -= 2

            if card_name == "Sky Docks":
                earth_support = _count_visible_tag_support(
                    visible_support_cards, self.db, "Earth", skip_name=card_name
                )
                earth_shell = earth_support
                if corp_name in ("Point Luna", "Teractor"):
                    earth_shell += 1

                if earth_shell <= 0:
                    bonus -= 4
                elif earth_shell == 1:
                    bonus -= 2

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
        if card_data:
            r = card_data.get("reasoning", "").lower()
            desc = str(card_info.get("description", "")).lower() if card_info else ""
            card_text = r + " " + desc
            eff = self.combo.parser.get(card_name) if self.combo and hasattr(self.combo, 'parser') else None
            positive_prod_steps = 0
            if eff and getattr(eff, "production_change", None):
                positive_prod_steps = sum(
                    value for value in eff.production_change.values()
                    if isinstance(value, (int, float)) and value > 0
                )

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
                    prod_scale = 2.5
                    prod_cap_hi = 8
                    prod_adj = round((gens_left - 5) * prod_scale)
                    prod_adj = max(-15, min(prod_cap_hi, prod_adj))
                    if prod_adj > 0:
                        if positive_prod_steps and positive_prod_steps <= 2:
                            prod_adj = min(prod_adj, 6)
                        elif card_info and card_info.get("cost", 0) <= 6:
                            prod_adj = min(prod_adj, 7)
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

            # VP-action snowball: cards with vp_per resource + an explicit
            # way to keep feeding themselves. Implicit parser filler actions
            # (hasAction + resourceType) are too optimistic for this bonus.
            is_vp_action = False
            is_paid_vp_action = False
            if eff:
                if eff and eff.vp_per and "resource" in str(eff.vp_per.get("per", "")):
                    explicit_self_feeders = []
                    paid_self_feeders = []
                    for action in eff.actions:
                        effect_text = str(action.get("effect", "")).lower()
                        cost_text = str(action.get("cost", "")).lower()
                        if "add" not in effect_text or "to this card" not in effect_text:
                            continue
                        if action.get("implicit"):
                            continue
                        if cost_text == "free":
                            explicit_self_feeders.append(action)
                        else:
                            paid_self_feeders.append(action)

                    trigger_self_feeder = any(
                        "add" in str(trigger.get("effect", "")).lower()
                        and "to this card" in str(trigger.get("effect", "")).lower()
                        for trigger in eff.triggers
                    )

                    if explicit_self_feeders or trigger_self_feeder:
                        is_vp_action = True
                    elif paid_self_feeders:
                        is_paid_vp_action = True

            is_vp = any(kw in card_text for kw in ["vp", "victory point", "1 vp"])
            is_action = "action" in card_text

            if is_vp_action:
                vp_action_adj = round(min(gens_left - 1, 5) * 1.5)
                bonus += max(0, min(8, vp_action_adj))
            elif is_paid_vp_action:
                paid_vp_action_adj = round(min(gens_left - 1, 4) * 0.75)
                bonus += max(0, min(3, paid_vp_action_adj))
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
            claimed_count = sum(1 for m in state.milestones if m.get("claimed_by"))
            phase_for_ma = (
                "endgame" if gens_left <= 1 else
                "late" if gens_left <= 3 else
                "mid" if gens_left <= 6 else
                "early"
            )

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

                    if threshold and my_val >= 0:
                        gap = threshold - my_val
                        if gap <= 0:
                            continue
                        contrib = max(1, len(matching))
                        after_gap = gap - contrib
                        if after_gap <= 0:
                            bonus += 6 if claimed_count < 2 else 5
                        elif gap <= 2:
                            bonus += 4 if phase_for_ma in ("late", "endgame") else 3
                        elif gap <= 4 and phase_for_ma != "early":
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

                if matching and my_color:
                    contrib = max(1, len(matching))
                    my_val = aw.get("scores", {}).get(my_color, 0)
                    opp_best = max((v for c, v in aw.get("scores", {}).items() if c != my_color), default=0)
                    is_funded = aw.get("funded_by") is not None
                    if is_funded:
                        gap_to_lead = opp_best - my_val
                        if gap_to_lead > 0:
                            if contrib > gap_to_lead:
                                bonus += 4
                            elif contrib == gap_to_lead:
                                bonus += 3
                            elif gap_to_lead - contrib == 1:
                                bonus += 2
                        else:
                            lead = my_val - opp_best
                            if lead <= 1:
                                bonus += 2
                            elif lead <= 3 and contrib >= 2:
                                bonus += 1
                    else:
                        if gens_left <= 3:
                            if my_val >= opp_best:
                                bonus += 2 if phase_for_ma == "endgame" else 1
                            elif (opp_best - my_val) <= 1:
                                bonus += 1

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
        if corp_name == "Pristar" and card_info:
            desc = str(card_info.get("description", "")).lower()
            terraforms = any(kw in desc for kw in [
                "raise temperature",
                "raise oxygen",
                "raise venus",
                "place ocean",
                "place an ocean",
                "terraform rating",
                "gain 1 tr",
                "gain 2 tr",
                "gain 3 tr",
            ])
            if terraforms:
                bonus -= 3
            else:
                pristar_bonus = 0
                if "production" in desc and ("increase" in desc or "raise" in desc):
                    pristar_bonus += 2
                if "draw" in desc and "card" in desc:
                    pristar_bonus += 1
                if re.search(r"\b\d+\s*vp\b", desc) or "victory point" in desc:
                    pristar_bonus += 2
                bonus += min(pristar_bonus, 4)
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

        # === Dual-purpose card bonus ===
        # Cards that do multiple things in one action are more efficient
        if card_info:
            purposes = 0
            desc = str(card_info.get("description", "")).lower()
            if any(kw in desc for kw in ["production", "prod"]): purposes += 1
            if any(kw in desc for kw in ["raise", "temperature", "oxygen", "ocean", "venus"]): purposes += 1
            if card_info.get("victoryPoints"): purposes += 1
            if any(kw in desc for kw in ["city", "greenery"]): purposes += 1
            if purposes >= 2:
                bonus += (purposes - 1) * 2  # +2 per extra purpose

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

        # === Expert overrides: specific card adjustments ===
        gens_left_override = _estimate_remaining_gens(state) if state else max(1, 9 - generation)

        # Ongoing engine cards lose future trigger value sharply in late game.
        # Keep this aligned with analysis.py alerts that already say "play now or sell".
        ONGOING_EFFECT_CARDS = {
            "Viral Enhancers",
            "Decomposers",
            "Ecological Zone",
            "Mars University",
            "Olympus Conference",
            "Spin-off Department",
            "Media Group",
            "Pets",
            "Immigrant City",
            "Rover Construction",
            "Arctic Algae",
            "Optimal Aerobraking",
        }
        if card_name in ONGOING_EFFECT_CARDS and gens_left_override <= 3:
            late_engine_penalty = {3: 12, 2: 16, 1: 20}.get(gens_left_override, 0)
            bonus -= late_engine_penalty

        # Greenhouses: late game monster — 8-10 plants from ALL cities incl. space cities
        if card_name == "Greenhouses" and gens_left_override <= 3:
            bonus += 10  # expert feedback: one of the strongest last-gen plays

        # Optimal Aerobraking: space event trigger value underrated
        if card_name == "Optimal Aerobraking":
            bonus += 3  # expert+backtest: trigger value not fully captured in base score

        # Colony placement cards contain a lot of future value in repeated
        # colony bonuses, future trades, and extra fleet usage. In the final
        # 1-2 gens keep only a moderate part of that upside.
        if _places_colony(card_info) and gens_left_override <= 2:
            desc_lower = str(card_info.get("description", "")).lower()
            colony_late_penalty = {2: 4, 1: 8}.get(gens_left_override, 0)
            if "already have a colony" in desc_lower or "already have a colony tile" in desc_lower:
                colony_late_penalty += {2: 2, 1: 4}.get(gens_left_override, 0)
            if "trade fleet" in desc_lower:
                colony_late_penalty += {2: 2, 1: 4}.get(gens_left_override, 0)
            if "draw 2 cards" in desc_lower:
                colony_late_penalty -= {2: 1, 1: 2}.get(gens_left_override, 0)
            bonus -= max(0, colony_late_penalty)

        # Pure immediate card draw is much weaker in the final 1-2 gens.
        # Keep tag/shell bonuses, but trim the future-value component.
        draw_count = _immediate_draw_count(card_info)
        if draw_count and gens_left_override <= 2:
            desc_lower = str(card_info.get("description", "")).lower()
            has_other_immediate_board_value = any(kw in desc_lower for kw in (
                "production", "raise temperature", "raise oxygen", "raise venus",
                "place ocean", "place a city", "place a greenery", "place this tile",
                "place a colony", "gain 1 tr", "gain 2 tr", "gain 3 tr",
                "victory point", "1 vp", "2 vp", "3 vp",
            ))
            draw_late_penalty = draw_count * {2: 2, 1: 4}.get(gens_left_override, 0)
            if has_other_immediate_board_value:
                draw_late_penalty = max(0, draw_late_penalty - 2)
            bonus -= min(draw_late_penalty, 8)

        # Astra Mechanica: base score already assumes decent event value.
        # Only adjust from visible replay targets on tableau; do not speculate on future draws.
        if card_name == "Astra Mechanica":
            replay_targets = self._astra_replay_target_scores(
                corp_name, generation, player_tags, state)
            top_scores = [score for _, score in replay_targets[:2]]
            if not top_scores:
                bonus -= 12
            elif len(top_scores) == 1:
                top = top_scores[0]
                if top < 60:
                    bonus -= 10
                elif top < 75:
                    bonus -= 7
                else:
                    bonus -= 4
            else:
                avg_top = sum(top_scores) / len(top_scores)
                if avg_top < 58:
                    bonus -= 9
                elif avg_top < 68:
                    bonus -= 6
                elif avg_top < 78:
                    bonus -= 3

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

        # Diminishing returns: many small bonuses shouldn't inflate mediocre cards.
        # Negative bonuses (penalties) apply at full strength — mistakes are costly.
        # Positive bonuses are dampened: first ±8 at 100%, next 8 at 60%, rest at 30%.
        # This prevents a C-55 card from reaching B-70 via accumulated +1/+2 bonuses
        # while still allowing genuinely strong synergies to push scores up.
        if bonus > 0:
            tier1 = min(bonus, 8)                          # first 8 points: full
            tier2 = min(max(bonus - 8, 0), 8) * 0.6        # next 8: 60%
            tier3 = max(bonus - 16, 0) * 0.3                # rest: 30%
            effective_bonus = tier1 + tier2 + tier3
        else:
            effective_bonus = bonus  # penalties at full strength

        return max(0, min(100, base + round(effective_bonus)))
