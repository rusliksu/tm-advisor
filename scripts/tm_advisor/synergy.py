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


class SynergyEngine:
    def __init__(self, db, combo_detector=None):
        self.db = db
        self.combo = combo_detector

    def adjusted_score(self, card_name: str, card_tags: list[str],
                       corp_name: str, generation: int,
                       player_tags: dict[str, int],
                       state=None) -> int:
        base = self.db.get_score(card_name)
        bonus = 0

        # Corp tag synergies
        corp_syn = CORP_TAG_SYNERGIES.get(corp_name, {})
        for tag in card_tags:
            bonus += corp_syn.get(tag, 0)

        # No-tag penalty / Sagitta bonus
        if not card_tags:
            if "sagitta" in corp_name.lower():
                bonus += 5  # Sagitta loves no-tag
            else:
                bonus -= 3  # no tags = no corp synergies, no milestone/award help

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
            "Science": 2 if player_tags.get("Science", 0) >= 2 else 0,
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
        # Point Luna: +1 card draw (~3 MC) per Earth → already in CORP_TAG_SYNERGIES as +5
        # Splice: +2 MC per Microbe played by ANYONE → extra value in 3P
        if corp_name == "Splice" and "Microbe" in card_tags:
            bonus += 2  # opponent Microbe plays also trigger Splice
        # Lakefront: +1 MC per ocean placed adjacently → ocean cards more valuable
        if corp_name in ("Lakefront Resorts", "Lakefront") and card_info:
            desc = str(card_info.get("description", "")).lower()
            if "ocean" in desc:
                bonus += 2

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
