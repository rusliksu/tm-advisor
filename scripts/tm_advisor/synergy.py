"""SynergyEngine — adjusted scoring с учётом корпораций, тегов, timing, tableau."""

import re

from .constants import CORP_TAG_SYNERGIES, TABLEAU_DISCOUNT_CARDS, TABLEAU_SYNERGIES
from .analysis import _estimate_remaining_gens


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

        # Sagitta bonus for no-tag cards
        if "sagitta" in corp_name.lower() and not card_tags:
            bonus += 5

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
                prod_adj = round((gens_left - 5) * 2.5)
                prod_adj = max(-15, min(8, prod_adj))
                bonus += prod_adj

            # VP cards: inverse — better when fewer gens left
            is_vp = any(kw in card_text for kw in ["vp", "victory point", "1 vp"])
            if is_vp and not is_prod:
                vp_adj = round((5 - gens_left) * 1.6)
                vp_adj = max(-5, min(8, vp_adj))
                bonus += vp_adj

            # Action cards: need time to activate multiple times
            is_action = "action" in card_text and not is_prod and not is_vp
            if is_action:
                action_adj = round((gens_left - 4) * 1.2)
                action_adj = max(-6, min(5, action_adj))
                bonus += action_adj

        # Tag synergies based on existing tags
        if "Jovian" in card_tags:
            bonus += 2
        if "Science" in card_tags and player_tags.get("Science", 0) >= 2:
            bonus += 2
        if "Earth" in card_tags and player_tags.get("Earth", 0) >= 3:
            bonus += 2
        if "Event" in card_tags and player_tags.get("Event", 0) >= 3:
            bonus += 2

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
                if card_data:
                    r = card_data.get("reasoning", "").lower()
                    if "tr" in r and ("raise" in r or "terraform" in r or "ocean" in r or "temp" in r):
                        bonus -= 3

        # Tableau discount awareness
        if state and hasattr(state, 'me') and state.me.tableau:
            for tc in state.me.tableau:
                disc = TABLEAU_DISCOUNT_CARDS.get(tc["name"], {})
                for tag in card_tags:
                    if tag in disc:
                        bonus += min(disc[tag], 3)
                if "all" in disc and card_tags:
                    bonus += min(disc["all"], 2)

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

        # === Closed parameter penalty ===
        if state and card_info:
            desc_lower = str(card_info.get("description", "")).lower()
            wasted_tr = 0

            if state.temperature >= 8:
                tm = re.search(r'raise\s+(?:the\s+)?temperature\s+(\d+)\s+step', desc_lower)
                if tm:
                    wasted_tr += int(tm.group(1))
                elif "raise temperature" in desc_lower or "raise the temperature" in desc_lower:
                    wasted_tr += 1

            if state.oxygen >= 14:
                om = re.search(r'raise\s+(?:the\s+)?oxygen\s+(\d+)\s+step', desc_lower)
                if om:
                    wasted_tr += int(om.group(1))
                elif "raise oxygen" in desc_lower:
                    wasted_tr += 1

            if state.oceans >= 9:
                oc_count = len(re.findall(r'place\s+(?:\d+\s+)?ocean', desc_lower))
                if oc_count:
                    wasted_tr += oc_count

            if state.venus >= 30:
                vm = re.search(r'raise\s+venus\s+(\d+)\s+step', desc_lower)
                if vm:
                    wasted_tr += int(vm.group(1))
                elif "raise venus" in desc_lower:
                    wasted_tr += 1

            if wasted_tr > 0:
                penalty = wasted_tr * 7
                bonus -= penalty

        return max(0, min(100, base + bonus))
