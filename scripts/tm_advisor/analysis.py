"""Утилиты анализа: стратегия, алерты, VP-оценки, прогнозы, цепочки действий."""

import json
import math
import os
import re

from .constants import TILE_GREENERY, TILE_CITY, TILE_OCEAN, TABLEAU_DISCOUNT_CARDS, TABLEAU_REBATES, GLOBAL_EVENTS, PARTY_STRATEGY, GLOBAL_EVENT_ADVICE, COLONY_TIERS, party_policy_info
from .economy import resource_values, game_phase
from .map_advisor import _get_neighbors
from .shared_data import load_generated_extension_object


_CARD_VP_MAP = None
_DRAW_VELOCITY_TABLEAU = {
    "AI Central",
    "Business Network",
    "Development Center",
    "Inventors' Guild",
    "Mars University",
    "Olympus Conference",
    "Research",
    "Research Outpost",
    "Restricted Area",
}
_DRAW_VELOCITY_TARGETS = (
    "Research",
    "Mars University",
    "AI Central",
    "Development Center",
)


def _load_card_vp_map() -> dict:
    """Load shared card VP metadata from the canonical-generated extension bundle."""
    global _CARD_VP_MAP
    if _CARD_VP_MAP is not None:
        return _CARD_VP_MAP

    try:
        _CARD_VP_MAP = load_generated_extension_object("card_vp.js", "TM_CARD_VP")
    except Exception:
        _CARD_VP_MAP = {}
    return _CARD_VP_MAP


def _compact_action_summary(cost: str, effect: str) -> str:
    cost_text = str(cost or "").strip()
    effect_text = str(effect or "").strip()
    if not effect_text:
        return ""
    if not cost_text or cost_text.lower() == "free":
        return effect_text
    return f"{cost_text} → {effect_text}"


def summarize_action_card(name: str, effect_parser=None) -> str | None:
    if name == "Viron":
        return "reuse action card"
    if effect_parser is None:
        return None

    eff = effect_parser.get(name)
    if not eff:
        return None

    summaries: list[str] = []
    for action in eff.actions:
        summary = _compact_action_summary(action.get("cost", ""), action.get("effect", ""))
        if summary and summary not in summaries:
            summaries.append(summary)
        if len(summaries) >= 2:
            break

    if summaries:
        return " / ".join(summaries)

    if eff.resource_holds and eff.resource_type and eff.vp_per and "resource" in str(eff.vp_per.get("per", "")):
        return f"stores {eff.resource_type.lower()} for VP"

    return None


def _normalize_action_resource_name(raw: str) -> str:
    key = re.sub(r"[^a-z]", "", str(raw or "").lower())
    aliases = {
        "floater": "floater",
        "floaters": "floater",
        "animal": "animal",
        "animals": "animal",
        "microbe": "microbe",
        "microbes": "microbe",
        "science": "science",
        "sciences": "science",
        "fighter": "fighter",
        "fighters": "fighter",
        "data": "data",
        "resource": "resource",
    }
    return aliases.get(key, "")


def _count_tableau_resource_type(state, effect_parser, resource_key: str) -> int:
    db = getattr(effect_parser, "db", None) if effect_parser else None
    me = getattr(state, "me", None)
    if not db or not me or not resource_key:
        return 0

    total = 0
    for card in me.tableau or []:
        if not isinstance(card, dict):
            continue
        name = card.get("name", "")
        info = db.get_info(name) or {}
        raw_type = info.get("resourceType", "")
        if _normalize_action_resource_name(raw_type) != resource_key:
            continue
        total += int(card.get("resources", 0) or 0)
    return total


def _extract_hand_resource_requirement(card_name: str, resource_key: str, effect_parser=None) -> int | None:
    db = getattr(effect_parser, "db", None) if effect_parser else None
    if not db or not card_name or not resource_key:
        return None

    info = db.get_info(card_name) or {}
    req_text = str(info.get("requirements", "") or "")
    desc_text = str(info.get("description", "") or "")
    patterns = [
        rf"'{resource_key}s?':\s*(\d+)",
        rf"requires(?: that you have)?\s+(\d+)\s+{resource_key}s?\b",
    ]
    for text in (req_text.lower(), desc_text.lower()):
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return int(match.group(1))
    return None


def _action_unlocks_hand_requirement(state, effect_parser, resource_key: str, add_amount: int) -> bool:
    if not resource_key or add_amount <= 0:
        return False
    have = _count_tableau_resource_type(state, effect_parser, resource_key)
    for card in getattr(state, "cards_in_hand", []) or []:
        if not isinstance(card, dict):
            continue
        need = _extract_hand_resource_requirement(card.get("name", ""), resource_key, effect_parser)
        if need is None:
            continue
        if have < need <= have + add_amount:
            return True
    return False


def _is_action_alert_relevant(name: str, state, effect_parser=None, gens_left: int = 99) -> bool:
    if gens_left > 1 or effect_parser is None:
        return True
    if name == "Viron":
        return True

    eff = effect_parser.get(name)
    if not eff or not eff.actions:
        return True

    resource_vp_card = (
        bool(eff.resource_holds)
        and bool(eff.vp_per)
        and "resource" in str(eff.vp_per.get("per", "")).lower()
    )

    for action in eff.actions:
        effect = str(action.get("effect", "") or "").lower()
        if not effect:
            continue

        if "draw" in effect and "card" in effect:
            continue

        if ("gain" in effect and ("mc" in effect or "m€" in effect or "megacredit" in effect)
                or re.search(r"\b\d+\s*(?:mc|m€|megacredit)\b", effect)):
            return True

        if "vp" in effect or "victory" in effect:
            return True

        if "raise" in effect and any(token in effect for token in ("temperature", "oxygen", "terraform", "tr", "venus")):
            return True

        add_match = re.search(
            r"add\s+(\d+)\s+(animal|microbe|floater|science|fighter|data|resource)",
            effect,
        )
        if add_match:
            add_amount = int(add_match.group(1))
            resource_key = _normalize_action_resource_name(add_match.group(2))
            if resource_vp_card:
                return True
            if _action_unlocks_hand_requirement(state, effect_parser, resource_key, add_amount):
                return True

    return False


def _player_tag_count(player, tag: str) -> int:
    tags = getattr(player, "tags", {}) or {}
    return tags.get(tag, 0)


def _dominant_party_tip(dominant: str, state) -> str:
    ps = PARTY_STRATEGY.get(dominant)
    if not ps:
        return ""

    gens_left = _estimate_remaining_gens(state)
    phase = game_phase(gens_left, state.generation)
    me = state.me
    policy = party_policy_info(state.turmoil, dominant)
    policy_text = policy.get("policy", "")
    policy_suffix = f" Policy: {policy_text}." if policy_text else ""

    if dominant == "Scientists":
        if phase == "endgame" or gens_left <= 1:
            sci_tags = _player_tag_count(me, "science")
            if policy.get("policy_id") == "sp01" and sci_tags > 0:
                return (
                    f"Science ruling всё ещё платит MC за теги ({sci_tags} science), "
                    "но policy draw 3 уже почти мертва в endgame"
                )
            return f"Science ruling по тегам ещё может платить MC.{policy_suffix}"
        if policy.get("policy_id") == "sp01" and (phase == "late" or gens_left <= 2):
            return "Science ruling ещё нормальна, но policy draw 3 уже заметно слабее, чем в mid-game"

    if dominant == "Kelvinists" and state.temperature >= 8 and policy.get("policy_id") == "kp03":
        return "Ruling по heat-prod ещё даёт MC, но policy 6 heat → temp мертва после max temp"

    if dominant == "Greens" and policy.get("policy_id") == "gp04" and (phase == "endgame" or gens_left <= 1):
        return "Bio ruling по тегам ещё даёт MC, но policy на 2 plants уже почти не важна в endgame"

    if dominant == "Unity" and policy.get("policy_id") == "up04" and (phase == "endgame" or gens_left <= 1):
        return "Широкий ruling-бонус по Venus/Earth/Jovian ещё ок; policy discount важна только под реальный последний play"

    if dominant == "Mars First" and policy.get("policy_id") == "mp04" and (phase == "endgame" or gens_left <= 1):
        return "Building ruling ещё даёт MC, но policy draw Building почти мертва в endgame"

    return ps.get("ruling_tip", "") + policy_suffix


def _engine_draw_alert(state) -> str | None:
    """Human-facing warning when engine shell outgrows card velocity."""
    if not state or not getattr(state, "me", None):
        return None

    me = state.me
    generation = getattr(state, "generation", 1) or 1
    if generation > 4:
        return None

    tableau = me.tableau or []
    tableau_names = {c.get("name", "") if isinstance(c, dict) else str(c) for c in tableau}
    hand_cards = [card for card in (state.cards_in_hand or []) if isinstance(card, dict)]
    hand_names = {card.get("name", "") for card in hand_cards}
    discount_shell = sum(1 for name in tableau_names if name in TABLEAU_DISCOUNT_CARDS)
    if me.corp in ("Cheung Shing MARS", "Teractor", "Thorgate", "Point Luna"):
        discount_shell += 1

    prod_weight = (
        max(0, getattr(me, "mc_prod", 0))
        + 1.2 * max(0, getattr(me, "steel_prod", 0))
        + 1.5 * max(0, getattr(me, "ti_prod", 0))
        + 1.0 * max(0, getattr(me, "plant_prod", 0))
        + 1.0 * max(0, getattr(me, "energy_prod", 0))
        + 0.5 * max(0, getattr(me, "heat_prod", 0))
    )
    if prod_weight >= 10:
        prod_shell = 3
    elif prod_weight >= 7:
        prod_shell = 2
    elif prod_weight >= 4:
        prod_shell = 1
    else:
        prod_shell = 0

    future_discount_shell = sum(1 for name in hand_names if name in TABLEAU_DISCOUNT_CARDS)
    future_prod_shell = 0
    for card in hand_cards:
        desc = card.get("description", "")
        if isinstance(desc, dict):
            desc = desc.get("text", "")
        desc_lower = str(desc).lower()
        if "increase your" in desc_lower and "production" in desc_lower:
            future_prod_shell += 1

    draw_shell = sum(1 for name in tableau_names if name in _DRAW_VELOCITY_TABLEAU)
    visible_draw_support = [name for name in _DRAW_VELOCITY_TARGETS if name in hand_names]
    engine_shell = discount_shell + prod_shell + min(2, future_discount_shell) + min(1, future_prod_shell)
    hand_size = len(state.cards_in_hand or []) or getattr(me, "cards_in_hand_n", 0)
    visible_colonies = {
        c.get("name", "")
        for c in (state.colonies_data or [])
        if isinstance(c, dict) and c.get("active")
    }
    premium_engine_hits = len(visible_colonies & {"Luna", "Pluto", "Triton", "Ceres"})

    urgency = engine_shell + min(2, premium_engine_hits) - draw_shell * 2 - len(visible_draw_support) * 2 - max(0, generation - 2)
    if hand_size >= 10:
        urgency -= 1
    if hand_size >= 14:
        urgency -= 1

    if engine_shell < 3 or draw_shell > 0 or visible_draw_support or urgency < 3:
        return None

    target_text = " / ".join(_DRAW_VELOCITY_TARGETS)
    if hand_size >= 10:
        return (
            f"🧠 Движок уже есть, добора мало: скидки/prod собраны, рука пока {hand_size} карт. "
            f"Не panic, но с таким income добор/selection ({target_text}) "
            f"конвертируется лучше, чем ещё один узкий discount."
        )
    return (
        f"🧠 Движок уже есть, добора мало: дальше ценнее velocity "
        f"({target_text}), чем ещё один discount/prod кусок."
    )


def _estimate_card_vp_from_tableau(state, player) -> tuple[int, dict]:
    """Estimate card VP from visible tableau using shared card_vp metadata."""
    card_vp_map = _load_card_vp_map()
    if not player.tableau or not card_vp_map:
        return 0, {}

    total = 0
    details = {}
    total_cities = sum(1 for s in state.spaces if s.get("tileType") == TILE_CITY)
    total_colonies = sum((p.raw.get("coloniesCount", 0) or 0) for p in [state.me] + state.opponents)

    for card in player.tableau:
        name = card.get("name", "")
        if not name:
            continue
        vp_rule = card_vp_map.get(name)
        if not vp_rule:
            continue

        vp_value = 0
        rule_type = vp_rule.get("type")
        if rule_type == "static":
            vp_value = int(vp_rule.get("vp", 0) or 0)
        elif rule_type == "per_tag":
            per = max(1, int(vp_rule.get("per", 1) or 1))
            vp_value = _player_tag_count(player, vp_rule.get("tag", "")) // per
        elif rule_type == "per_resource":
            per = max(1, int(vp_rule.get("per", 1) or 1))
            vp_value = (card.get("resources", 0) or 0) // per
        elif rule_type == "per_city":
            per = max(1, int(vp_rule.get("per", 1) or 1))
            vp_value = total_cities // per
        elif rule_type == "per_colony":
            per = max(1, int(vp_rule.get("per", 1) or 1))
            vp_value = total_colonies // per

        if vp_value > 0:
            details[name] = vp_value
            total += vp_value

    return total, details

# === Corp-specific strategy tips (shown gen 1-2) ===
CORP_TIPS = {
    "EcoLine": "🌿 EcoLine: 7 plants = greenery (не 8). Plant prod = priority #1. Greens ruling = +4 MC per greenery.",
    "Helion": "☀️ Helion: Heat→temp > heat as MC. Temp raises = 7 MC each. Только платишь heat когда temp maxed или need exact MC.",
    "Point Luna": "🌙 Point Luna: Draw card per Earth tag. Earth Office = must-buy. GODMODE with card draw + discount.",
    "Teractor": "💰 Teractor: -3 MC per Earth tag. Earth cards = priority. 60 MC start = biggest in game.",
    "Arklight": "🐾 Arklight: +1 animal/plant per matching tag played. Animal VP cards = priority (Birds, Fish, Livestock).",
    "CrediCor": "💎 CrediCor: -4 MC on cards cost 20+. Buy expensive cards! 57 MC start.",
    "Tharsis Republic": "🏙️ Tharsis: +1 MC-prod per city. Cities = engine. Immigrant City = cancel your bonus for opponents.",
    "Poseidon": "🚀 Poseidon: Free colony + MC-prod per colony. Build colonies early! Trade = priority.",
    "Manutech": "🔧 Manutech: Production increase = gain that resource. Steel-prod +1 = gain 1 steel immediately.",
    "Saturn Systems": "🪐 Saturn Systems: +1 MC per Jovian tag played by ANYONE. Jovian cards = priority.",
    "Morning Star Inc.": "♀️ MSI: flex on Venus requirements, not flat power on every Venus tag. Prefer Venus cards that exploit the req window.",
    "Splice": "🧬 Splice: +2 MC per Microbe tag (ANY player). In 3P = 2 opponents trigger too. Underrated.",
    "Viron": "🔄 Viron: Reuse action card. AI Central twice = 4 cards/gen. Prioritize action cards.",
    "Inventrix": "🔬 Inventrix: -2 on all global requirements. Play cards others can't. Flexibility = value.",
    "Pharmacy Union": "💊 Pharmacy Union: Science tag = +1 TR - disease. Microbe tag = disease + lose 4 MC. Science engine.",
    "Phobolog": "🪨 Phobolog: Ti value +1 (4 MC each). Space cards = priority. 23 MC start but ti-prod 1.",
    "PhoboLog": "🪨 Phobolog: Ti value +1 (4 MC each). Space cards = priority. 23 MC start but ti-prod 1.",
    "Interplanetary Cinematics": "🎬 IC: +2 MC per event played. Events = free money. 30 MC start.",
    "Robinson Industries": "🔩 Robinson: Action: +1 to lowest prod. Flexible engine. Works with everything.",
    "Thorgate": "⚡ Thorgate: -3 MC on Power tag cards. Energy cards + Power Plant SP = 8 MC.",
    "Crescent Research": "🔭 Crescent: -1 on cards with requirements. Science tag. Niche but flexible.",
    "Polaris": "❄️ Polaris: +1 MC per ocean placed (by anyone). Ocean placement = priority. Aquifer SP = value.",
    "Mining Guild": "⛏️ Mining Guild: Steel prod +1 per steel/ti placement bonus. Place on steel spots!",
    "Recyclon": "♻️ Recyclon: +1 microbe per Building tag. Decomposers = must-buy. Building + Microbe synergy.",
    "Lakefront Resorts": "🏖️ Lakefront: +1 MC-prod per ocean. Oceans = engine. Don't let others place your oceans.",
    "Stormcraft Incorporated": "🌪️ Stormcraft: Floaters as heat (2 heat each). Floater cards = heat engine + VP.",
    "Celestic": "🎈 Celestic: Action: add floater. 2 VP per 3 floaters. Floater cards = VP engine.",
    "Terralabs Research": "🧪 Terralabs: Cards cost 1 MC (not 3). Buy EVERYTHING on draft. 14 MC start = painful.",
    "Aridor": "🌐 Aridor: +1 MC-prod per new tag type. Diversify tags! First 5-6 unique tags = free production.",
    "Ecoline": "🌿 Ecoline: 7 plants = greenery (не 8). Plant prod = priority #1. Greens ruling = +4 MC per greenery.",
}

# === Prelude-specific tips (shown gen 1 only) ===
PRELUDE_TIPS = {
    "Experimental Forest": "🌲 Experimental Forest: Plant tags + greenery gen 1. EcoLine/Arklight synergy.",
    "Business Empire": "💼 Business Empire: +6 MC-prod. Expensive but compounds 8+ gens.",
    "Donation": "🎁 Donation: 10 MC one-time. Weakest prelude. Should have skipped.",
    "Ecology Experts": "🌱 Ecology Experts: +1 plant-prod + play 1 green card ignoring reqs. Найди карту с жёстким req!",
    "Excentric Sponsor": "🎪 Excentric Sponsor: Play card for free (≤25 MC). Ищи карту 20-25 MC!",
    "Loan": "🏦 Loan: +30 MC, -2 MC-prod. Сильно если вложишь в engine gen 1.",
    "Galilean Mining": "🪐 Galilean Mining: +2 ti-prod. Space cards = priority.",
    "Metal-Rich Asteroid": "☄️ Metal-Rich Asteroid: +1 steel-prod, +1 ti-prod. Building + Space engine.",
    "Mohole Excavation": "🕳️ Mohole Excavation: +2 heat-prod, +2 heat, +1 steel. Heat engine starter.",
    "Research Network": "🔬 Research Network: Wild tag + 3 cards. Flexible, helps milestones.",
    "Biofuels": "🌾 Biofuels: +1 plant-prod, +2 plants. Cheap greenery push.",
    "Acquired Space Agency": "🚀 Acquired Space Agency: +1 ti-prod, 6 cards. Card advantage + Space engine.",
    "Society Support": "🤝 Society Support: All prod to 1 (except MC stays). Нивелирует слабую корпу.",
    "Supplier": "⚡ Supplier: +2 energy-prod, +4 steel. Energy engine + Building boost.",
    "Self-Sufficient Settlement": "🏠 Self-Sufficient Settlement: City + 1 MC-prod. Early city = adjacency value.",
    "Early Settlement": "🏘️ Early Settlement: City + 1 plant-prod. Place near greenery spots.",
    "Huge Asteroid": "💥 Huge Asteroid: +3 temp, +5 heat. Temp rush start.",
    "Nitrogen Shipment": "🚢 Nitrogen Shipment: +1 TR, +5 MC. Solid value, no ongoing.",
    "Power Generation": "⚡ Power Generation: +3 energy-prod, +1 steel. Energy engine.",
    "Orbital Construction Yard": "🏗️ Orbital Construction Yard: +1 ti-prod, +4 ti. Space discount fuel.",
    "Martian Industries": "🏭 Martian Industries: +1 heat-prod, +1 steel-prod, +6 MC. Balanced start.",
    "High Circles": "🏛️ High Circles: 2 delegates + influence. Turmoil control = huge.",
}


def _detect_strategy(player) -> str:
    """Определить стратегию игрока по тегам, корпорации и production."""
    tags = player.tags
    parts = []

    # Dominant tags
    tag_counts = sorted(tags.items(), key=lambda x: x[1], reverse=True)
    top_tags = [(t, n) for t, n in tag_counts if n >= 3 and t not in ("event", "wild")]

    # Corp-based strategy
    corp = player.corp.lower() if player.corp else ""
    if "thorgate" in corp:
        parts.append("Energy engine")
    elif "ecoline" in corp or "arklight" in corp:
        parts.append("Bio engine")
    elif "point luna" in corp or "teractor" in corp:
        parts.append("Earth cards")
    elif "phobolog" in corp:
        parts.append("Space/Ti")
    elif "credicor" in corp:
        parts.append("Big cards")
    elif "pharmacy" in corp:
        parts.append("Science/cards")
    elif "tharsis" in corp:
        parts.append("Cities/MC")
    elif "morning star" in corp:
        parts.append("Venus")
    elif "splice" in corp:
        parts.append("Microbe")
    elif "interplanetary" in corp:
        parts.append("Events")
    elif "mining guild" in corp:
        parts.append("Building/Steel")
    elif "inventrix" in corp:
        parts.append("Flexible/req-free")
    elif "robinson" in corp:
        parts.append("Production engine")
    elif "helion" in corp:
        parts.append("Heat→MC")

    # Production-based
    if player.plant_prod >= 4:
        parts.append(f"Plant machine ({player.plant_prod}/gen)")
    if player.energy_prod >= 5:
        parts.append(f"Energy {player.energy_prod}/gen")
    if player.heat_prod >= 4:
        parts.append(f"Heat→TR ({player.heat_prod}/gen)")
    if player.ti_prod >= 3:
        parts.append(f"Ti prod {player.ti_prod}")

    # Tag specialization
    for t, n in top_tags[:2]:
        if t not in ("building",):  # building is generic
            parts.append(f"{t}×{n}")

    # Card accumulator
    if player.cards_in_hand_n >= 15:
        parts.append(f"Hoarding {player.cards_in_hand_n} cards")

    # Threats
    if player.tr >= 30:
        parts.append(f"TR lead ({player.tr})")

    return " │ ".join(parts[:4]) if parts else "Непонятная стратегия"


def _generate_alerts(state, effect_parser=None) -> list[str]:
    """Генерирует контекстные алерты — самые важные действия прямо сейчас."""
    alerts = []
    me = state.me
    mc = me.mc

    # === Milestones ===
    for m in state.milestones:
        if m["claimed_by"]:
            continue
        my_score = m["scores"].get(me.color, {})
        if isinstance(my_score, dict) and my_score.get("claimable", False):
            claimed_count = sum(1 for mi in state.milestones if mi["claimed_by"])
            if claimed_count < 3 and mc >= 8:
                gen = state.generation if hasattr(state, 'generation') else 1
                if gen <= 2:
                    alerts.append(f"🏆 {m['name']} доступен! (8 MC = 5 VP, но gen {gen} — можно подождать если MC нужны на engine)")
                else:
                    alerts.append(f"🏆 ЗАЯВИ {m['name']}! (8 MC = 5 VP)")

    # === Milestone race countdown ===
    cn = state.color_names
    claimed_total = sum(1 for mi in state.milestones if mi["claimed_by"])
    if claimed_total < 3:
        for m in state.milestones:
            if m["claimed_by"]:
                continue
            # Show progress for all players
            my_score = m["scores"].get(me.color, {})
            my_val = my_score.get("score", 0) if isinstance(my_score, dict) else 0
            my_threshold = my_score.get("threshold", 0) if isinstance(my_score, dict) else 0
            my_claimable = isinstance(my_score, dict) and my_score.get("claimable", False)

            # Find closest opponent
            opp_closest = None
            opp_closest_val = 0
            opp_claimable = False
            for color, score_info in m["scores"].items():
                if color == me.color:
                    continue
                if isinstance(score_info, dict):
                    oval = score_info.get("score", 0)
                    if oval > opp_closest_val:
                        opp_closest_val = oval
                        opp_closest = cn.get(color, color)
                    if score_info.get("claimable"):
                        opp_claimable = True
                        opp_closest = cn.get(color, color)

            # Race alert with numbers
            if my_threshold > 0 and (my_val > 0 or opp_closest_val > 0):
                my_gap = max(0, my_threshold - my_val)
                opp_gap = max(0, my_threshold - opp_closest_val)
                if opp_claimable and not my_claimable:
                    alerts.append(
                        f"🚨 {m['name']}: {opp_closest} МОЖЕТ ЗАЯВИТЬ! "
                        f"Ты {my_val}/{my_threshold} (нужно ещё {my_gap})")
                elif opp_claimable and my_claimable:
                    alerts.append(
                        f"⚡ {m['name']}: ГОНКА! Ты и {opp_closest} оба можете. "
                        f"Заяви ПЕРВЫМ (8 MC)!")
                elif my_gap <= 2 and my_gap > 0:
                    alerts.append(
                        f"🏆 {m['name']}: {my_val}/{my_threshold} — ещё {my_gap}! "
                        f"Ближайший: {opp_closest} {opp_closest_val}/{my_threshold}")

            for color, score_info in m["scores"].items():
                if color == me.color:
                    continue
                if isinstance(score_info, dict) and score_info.get("claimable"):
                    opp_name = cn.get(color, color)
                    if my_claimable and mc >= 8:
                        alerts.append(
                            f"⚠️ {opp_name} тоже может заявить {m['name']}! Успей первым!")
                    elif not my_claimable:
                        alerts.append(
                            f"⚠️ {opp_name} может заявить {m['name']}!")
                    break

    # === Awards — delegated to award_capture ===
    from .award_capture import urgent_award_actions
    funded_count = sum(1 for a in state.awards if a.get("funded_by"))
    gens_left_aw = _estimate_remaining_gens(state)
    phase_aw = game_phase(gens_left_aw, state.generation)
    end_triggered = is_game_end_triggered(state)
    urgent = urgent_award_actions(state)
    if funded_count < 3 and urgent:
        cost = urgent[0]["cost"]
        # Save-up alert: I'm leading but can't afford this turn
        affordable = [u for u in urgent if mc >= u["cost"]]
        save_up = [u for u in urgent if mc < u["cost"] and u["lead"] > 0]
        if save_up and not end_triggered:
            lead_list = ", ".join(
                f"{u['award_name']} +{u['lead']}" for u in save_up[:3]
            )
            income_est = mc + me.mc_prod + state.me.tr
            turns_to_save = 1 if income_est >= cost else max(
                2, (cost - mc) // max(me.mc_prod + 1, 5) + 1
            )
            alerts.append(
                f"🏅 ФОНДИРУЙ через ~{turns_to_save} gen: лидируешь в "
                f"{lead_list} (need {cost} MC, есть {mc}). БЕЗ ФОНДА VP = 0!"
            )
        if affordable:
            best = affordable[0]
            timing_note = {
                "early": f"Рано! Лид +{best['lead']} может растаять. Фондируй только если уверен.",
                "mid": f"Хороший момент — лид +{best['lead']}, оппоненты ещё могут догнать.",
                "late": f"Фондируй сейчас — лид +{best['lead']} уже надёжный.",
                "endgame": f"ПОСЛЕДНИЙ ШАНС фондировать! +{best['lead']} лид.",
            }.get(phase_aw, "")
            block_note = " ⚠ opp может blockнуть slot!" if best.get("opp_can_fund") else ""
            alerts.append(
                f"💰 ФОНДИРУЙ {best['award_name']}! "
                f"({best['cost']} MC, {best['urgency']}) {timing_note}{block_note}"
            )
            if len(affordable) > 1:
                others = ", ".join(
                    f"{u['award_name']} +{u['lead']}" for u in affordable[1:3]
                )
                alerts.append(f"   Также лидируешь: {others} (но только 1 slot доступен)")

    # === Turmoil look-ahead ===
    reds_now = (state.turmoil and "Reds" in str(state.turmoil.get("ruling", "")))
    reds_coming = False
    if state.turmoil:
        dominant = str(state.turmoil.get("dominant", ""))
        reds_coming = "Reds" in dominant and not reds_now and not end_triggered

    gens_left_conv = _estimate_remaining_gens(state)

    # === Award opponent threat ===
    if funded_count < 3:
        cost = [8, 14, 20][funded_count]
        for a in state.awards:
            if a["funded_by"]:
                continue
            my_val = a["scores"].get(me.color, 0)
            opp_scores = [(c, v) for c, v in a["scores"].items() if c != me.color]
            for opp_color, opp_val in opp_scores:
                opp_name = cn.get(opp_color, opp_color)
                opp_mc = 0
                for o in state.opponents:
                    if o.color == opp_color:
                        opp_mc = o.mc
                        break
                # Opponent leads AND has MC to fund
                if opp_val > my_val and opp_val > 0 and opp_mc >= cost:
                    lead = opp_val - my_val
                    alerts.append(
                        f"⚠️ {opp_name} лидирует в {a['name']} (+{lead}) "
                        f"и может фондить ({opp_mc} MC >= {cost})!")
                    break
            # I funded this award but opponent is catching up
            if a.get("funded_by") == me.color:
                for opp_color, opp_val in opp_scores:
                    if opp_val >= my_val and opp_val > 0:
                        opp_name = cn.get(opp_color, opp_color)
                        alerts.append(
                            f"⚠️ {opp_name} догнал тебя в {a['name']}! ({opp_val} vs {my_val})")
                        break

    # === Plants → Greenery ===
    if me.plants >= 8:
        if reds_now:
            if gens_left_conv <= 1:
                alerts.append(f"🌿 Plants {me.plants} — КОНВЕРТИРУЙ! Последний gen, VP > TR penalty")
            else:
                alerts.append(f"🌿 Plants {me.plants} — greenery = +1 VP но 0 net TR (Reds). Ок если VP нужнее")
        else:
            extra = ""
            if reds_coming:
                extra = " ⚡ СЕЙЧАС! Reds доминируют — след. gen будет -1 TR!"
            elif me.plant_prod >= 5 and me.plants < 16 and gens_left_conv >= 3:
                extra = f" (plant-prod {me.plant_prod} — можно копить на 2 greenery)"
            alerts.append(f"🌿 Greenery из {me.plants} plants (+1 O₂, +1 TR, +1 VP){extra}")

    # === Heat → Temperature ===
    if me.heat >= 8 and state.temperature < 8:
        heat_rebate = 0
        if me.tableau:
            tableau_names = {c.get("name", "") if isinstance(c, dict) else str(c) for c in me.tableau}
            for card_name, card_rebates in TABLEAU_REBATES.items():
                if card_name in tableau_names:
                    heat_rebate += card_rebates.get("any_temp", 0)
        if reds_now:
            if gens_left_conv <= 1:
                alerts.append(f"🔥 Heat {me.heat} — КОНВЕРТИРУЙ! Последний gen, TR не важнее")
            else:
                alerts.append(f"🔥 Heat {me.heat} — НЕ трать, Reds = 0 net TR. Копи на след. gen")
        else:
            rebate_str = f" +{heat_rebate} MC rebate" if heat_rebate else ""
            extra = ""
            if reds_coming:
                extra = " ⚡ СЕЙЧАС! Reds доминируют — след. gen -1 TR!"
            alerts.append(f"🔥 TR из {me.heat} heat (+1 temp, +1 TR{rebate_str}){extra}")
    elif me.heat >= 6 and me.heat < 8 and state.temperature < 8 and me.heat_prod >= 2:
        gens_to_8 = max(1, (8 - me.heat + me.heat_prod - 1) // me.heat_prod)
        if gens_to_8 == 1:
            alerts.append(f"🔥 Heat {me.heat} (+{me.heat_prod}/gen) — хватит след. gen для temp raise")

    # === Action cards in tableau ===
    active_actions = []
    gens_left_actions = _estimate_remaining_gens(state)
    for c in me.tableau:
        name = c["name"]
        if c.get("isDisabled"):
            continue
        action_summary = summarize_action_card(name, effect_parser)
        if action_summary and _is_action_alert_relevant(
                name, state, effect_parser, gens_left=gens_left_actions):
            active_actions.append(f"{name}: {action_summary}")
    if active_actions:
        alerts.append("🔵 Actions (" + str(len(active_actions)) + "): " +
                      " │ ".join(active_actions[:5]))

    # === TR gap warning ===
    max_opp_tr = max((o.tr for o in state.opponents), default=0)
    tr_gap = max_opp_tr - me.tr
    if tr_gap >= 8:
        alerts.append(f"⚠️ TR отставание: -{tr_gap} от лидера ({max_opp_tr})")

    # === Turmoil alerts (enhanced) ===
    if state.turmoil:
        t = state.turmoil
        ruling = t.get("ruling", "")
        dominant = t.get("dominant", "")

        # Reds ruling penalty
        if ruling and "Reds" in str(ruling):
            alerts.append("⛔ REDS RULING: -1 TR/шаг при подъёме параметров!")

        # Reds incoming warning
        if dominant and "Reds" in str(dominant) and not end_triggered:
            alerts.append("⚠️ REDS DOMINANT → станут ruling! Блокируй делегатами или придержи terraform")

        # Party strategy for dominant party
        if dominant and dominant in PARTY_STRATEGY and not end_triggered:
            tip = _dominant_party_tip(dominant, state)
            if tip:
                alerts.append(f"🏛️ Dominant: {dominant} — {tip}")

        # Global event preparation
        coming = t.get("coming")
        if coming and coming in GLOBAL_EVENT_ADVICE and not end_triggered:
            ev = GLOBAL_EVENTS.get(coming, {})
            icon = "🟢" if ev.get("good", True) else "🔴"
            alerts.append(f"{icon} Событие (след. gen): {coming}")
            alerts.append(f"   → {GLOBAL_EVENT_ADVICE[coming]}")

        # v73: Specific resource protection alerts
        coming_lower = (coming or '').lower()
        if not end_triggered and 'dust storm' in coming_lower and me.heat >= 8:
            alerts.append(f"🔥 DUST STORM через 1 gen! Потрать heat ({me.heat}) СЕЙЧАС — потеряешь ВСЁ!")
        if (not end_triggered and
                ('eco sabotage' in coming_lower or 'sabotage' in coming_lower) and me.plants >= 4):
            alerts.append(f"🌿 ECO SABOTAGE через 1 gen! Конвертируй plants ({me.plants}) в greenery!")
        if not end_triggered and 'miners on strike' in coming_lower:
            me_tags = getattr(me, 'tags', {}) if me else {}
            jovian_tags = 0
            if isinstance(me_tags, dict):
                jovian_tags = int(me_tags.get("jovian", 0) or me_tags.get("Jovian", 0) or 0)
            influence = int(getattr(me, 'influence', 0) or 0)
            exposed_tags = max(0, min(5, jovian_tags) - influence)
            titanium_risk = min(me.titanium or 0, exposed_tags)
            if titanium_risk > 0:
                alerts.append(
                    f"⛏️ MINERS STRIKE через 1 gen! Под риском ~{titanium_risk} titanium "
                    f"({jovian_tags} Jovian, influence {influence}) — трать ti или добирай influence.")
            elif jovian_tags > 0:
                alerts.append(
                    f"⛏️ MINERS STRIKE через 1 gen: influence {influence} уже прикрывает "
                    f"текущие Jovian ({jovian_tags}). Saturn/Jovian line ок.")

        distant = t.get("distant")
        if distant and distant in GLOBAL_EVENT_ADVICE and not end_triggered:
            ev = GLOBAL_EVENTS.get(distant, {})
            if not ev.get("good", True):
                alerts.append(f"⚠️ Через 2 gen: {distant} — начинай готовиться")

        current = t.get("current")
        if current:
            ev = GLOBAL_EVENTS.get(current, {})
            if not ev.get("good", True):
                alerts.append(f"🔴 Global Event СЕЙЧАС: {current} — {ev.get('desc', '?')}")

        # Delegate advice
        my_in_lobby = me.color in t.get("lobby", [])
        if my_in_lobby and mc >= 0:
            if dominant and "Reds" in str(dominant):
                # Find best non-Reds party to push
                parties = t.get("parties", {})
                non_reds = [(p, len(dels)) for p, dels in parties.items()
                           if "Reds" not in p and isinstance(dels, list)]
                if non_reds:
                    best_party = max(non_reds, key=lambda x: x[1])[0]
                    alerts.append(f"📋 Делегат в lobby — БЛОКИРУЙ Reds! Ставь в {best_party}")
                else:
                    alerts.append("📋 Делегат в lobby — блокируй Reds!")
            else:
                alerts.append("📋 Делегат в lobby — можно разместить бесплатно")

    # === Opponent threat detection ===
    gens_left_threat = _estimate_remaining_gens(state)
    for opp in state.opponents:
        threats = []
        opp_vp_est = _estimate_vp(state, opp)
        opp_card_vp_visible = opp_vp_est.get("cards", 0)
        my_card_vp_visible = _estimate_vp(state, me).get("cards", 0)

        # Milestone dominance
        opp_milestones = sum(1 for m in state.milestones
                           if m.get("owner_color") == opp.color or m.get("claimed_by") == opp.color)
        my_milestones = sum(1 for m in state.milestones
                          if m.get("owner_color") == me.color or m.get("claimed_by") == me.color)
        if opp_milestones >= 2 and opp_milestones > my_milestones:
            threats.append(f"{opp_milestones} milestones ({opp_milestones * 5} VP)")

        # High MC production (engine player)
        if opp.mc_prod >= 20 and opp.mc_prod > me.mc_prod + 5:
            threats.append(f"MC-prod {opp.mc_prod} (greedy engine)")

        # Large hand (card strategy)
        opp_hand = getattr(opp, 'cards_in_hand_n', 0) or getattr(opp, 'cards_in_hand_count', 0)
        my_hand = len(state.cards_in_hand or [])
        if opp_hand >= 15 and opp_hand > my_hand + 5:
            threats.append(f"{opp_hand} карт в руке (card strategy)")

        # Visible VP shell on tableau
        if opp_card_vp_visible >= 12:
            delta = opp_card_vp_visible - my_card_vp_visible
            if delta >= 6:
                threats.append(f"~{opp_card_vp_visible} VP на картах уже на столе (+{delta} к тебе)")
            else:
                threats.append(f"~{opp_card_vp_visible} VP на картах уже на столе")

        # TR lead
        if opp.tr > me.tr + 5:
            threats.append(f"TR {opp.tr} (+{opp.tr - me.tr} над тобой)")

        # Resource-based VP pressure on cards (subset of total card VP).
        opp_resource_vp = 0
        if opp.tableau:
            for card in opp.tableau:
                res = card.get("resources", 0) if isinstance(card, dict) else 0
                if res and res >= 3:
                    opp_resource_vp += res // 2  # ~1 VP per 2 resources (conservative)
        if opp_resource_vp >= 8:
            threats.append(f"~{opp_resource_vp} VP только из ресурсов на картах (floater/animal/microbe engine)")

        # Combine threats into one alert
        if threats:
            action = ""
            if opp.mc_prod >= 20 or opp_hand >= 15:
                if gens_left_threat <= 1:
                    action = " → следи за last-gen swing, но рост engine уже почти не важен"
                else:
                    action = " → ЗАКРЫВАЙ ИГРУ (greedy player набирает обороты)"
            elif opp_card_vp_visible >= 15:
                if gens_left_threat <= 1:
                    action = " → считай уже видимые VP, а не только TR/движок"
                else:
                    action = " → ЗАКРЫВАЙ ИГРУ (у оппонента уже собран толстый VP shell)"
            elif opp_milestones >= 3:
                action = " → компенсируй awards + VP карты"
            elif opp_resource_vp >= 10:
                if gens_left_threat <= 1:
                    action = " → это уже mostly текущие VP, а не будущий snowball"
                else:
                    action = " → ЗАКРЫВАЙ ИГРУ (VP engine набирает ресурсы каждый gen!)"
            elif opp.tr > me.tr + 8:
                action = " → догоняй по TR"

            alerts.append(f"🎯 {opp.name}: {'; '.join(threats)}{action}")

    # === Dead cards in hand (impossible requirements) ===
    for card in (state.cards_in_hand or []):
        if not isinstance(card, dict):
            continue
        cname = card.get("name", "")
        reqs = card.get("play_requirements", [])
        if not reqs:
            continue
        # Check for Inventrix in tableau
        has_inventrix = any(
            (c.get("name") == "Inventrix" if isinstance(c, dict) else False)
            for c in (me.tableau or [])
        )
        inv_bonus = 2 if has_inventrix else 0

        for req in reqs:
            if not isinstance(req, dict):
                continue
            # Max temperature (e.g. ArchaeBacteria: -18 max)
            temp_val = req.get("temperature") or req.get("count")
            if req.get("max") and temp_val is not None and isinstance(temp_val, (int, float)):
                if state.temperature > temp_val + inv_bonus * 2:
                    alerts.append(
                        f"💀 {cname} — МЁРТВАЯ КАРТА (req {temp_val}°C max, "
                        f"сейчас {state.temperature}°C). ПРОДАЙ!")
                    break
            # Max oxygen
            oxy_val = req.get("oxygen") or req.get("count")
            if req.get("max") and "oxygen" in str(req).lower() and oxy_val is not None:
                if state.oxygen > int(oxy_val) + inv_bonus:
                    alerts.append(
                        f"💀 {cname} — МЁРТВАЯ КАРТА (req {oxy_val}% O2 max, "
                        f"сейчас {state.oxygen}%). ПРОДАЙ!")
                    break

    # === Ongoing effect cards held too long ===
    ONGOING_EFFECT_CARDS = {
        "Viral Enhancers": "When you play plant/microbe/animal tag → +1 plant or resource",
        "Decomposers": "When you play plant/microbe/animal tag → +1 microbe",
        "Ecological Zone": "When you play plant/animal tag → +1 animal (VP!)",
        "Mars University": "When you play science tag → discard+draw",
        "Olympus Conference": "When you play science tag → science resource or card",
        "Spin-off Department": "When you play 20+ MC card → draw card",
        "Media Group": "When you play event → +3 MC",
        "Pets": "When any city placed → +1 animal (VP!)",
        "Immigrant City": "When any city placed → +1 MC-prod",
        "Rover Construction": "When any city placed → +2 MC",
        "Arctic Algae": "When anyone places ocean → +2 plants",
        "Optimal Aerobraking": "When you play space event → +3 MC +3 heat",
    }
    for card in (state.cards_in_hand or []):
        if not isinstance(card, dict):
            continue
        cname = card.get("name", "")
        if cname in ONGOING_EFFECT_CARDS and state.generation >= 5:
            alerts.append(
                f"⚠️ {cname} В РУКЕ gen {state.generation}! Ongoing эффект теряет value "
                f"каждый gen. ИГРАЙ СЕЙЧАС или ПРОДАЙ")

    # === BonelessDota rule 3: Zeppelins unreliable in opening ===
    gen = state.generation if hasattr(state, 'generation') else 1
    if gen <= 2 and state.cards_in_hand:
        for card in (state.cards_in_hand or []):
            if not isinstance(card, dict):
                continue
            if card.get("name") == "Zeppelins":
                alerts.append(
                    "⏳ Zeppelins: req 5% O₂, ненадёжна в начале. "
                    "Надейся вытянуть позже, а не покупай gen 1-2.")

    # === BonelessDota rule 4: Regolith/GHG bacteria bad without Extreme-Cold Fungus ===
    if state.cards_in_hand and me.tableau:
        tab_names_r4 = {c.get("name", "") if isinstance(c, dict) else str(c) for c in me.tableau}
        hand_names_r4 = {c.get("name", "") for c in state.cards_in_hand if isinstance(c, dict)}
        has_ecf = "Extreme-Cold Fungus" in tab_names_r4
        SLOW_BACTERIA = {"Regolith Eaters", "GHG Producing Bacteria"}
        for bact in SLOW_BACTERIA:
            # In hand without Extreme-Cold Fungus in tableau
            if bact in hand_names_r4 and not has_ecf:
                alerts.append(
                    f"⚠️ {bact} без Extreme-Cold Fungus = медленный action "
                    f"(2 хода на 1 TR/O₂). Рассмотри продажу.")
            # In tableau without ECF — still warn
            if bact in tab_names_r4 and not has_ecf and bact not in hand_names_r4:
                # Already played — can't sell, but warn about inefficiency
                pass

    # === BonelessDota rule 7: Media Archives — play when events plateau ===
    if state.cards_in_hand:
        for card in (state.cards_in_hand or []):
            if not isinstance(card, dict):
                continue
            if card.get("name") == "Media Archives":
                # Count total events played by all players
                total_events = 0
                for p_ma in [me] + state.opponents:
                    p_tags = getattr(p_ma, 'tags', {})
                    if isinstance(p_tags, dict):
                        total_events += p_tags.get("event", 0)
                gens_left_ma = _estimate_remaining_gens(state)
                if gens_left_ma <= 2:
                    alerts.append(
                        f"🎬 Media Archives: {total_events} event'ов всего. "
                        f"Последние gen'ы — играй сейчас, events не вырастут сильно!")
                elif total_events >= 8:
                    alerts.append(
                        f"🎬 Media Archives: {total_events} event'ов уже — "
                        f"хороший момент играть (события начинают плато)")

    # === BonelessDota rule 9: Satellites — show current tag count ===
    if state.cards_in_hand:
        for card in (state.cards_in_hand or []):
            if not isinstance(card, dict):
                continue
            if card.get("name") == "Satellites":
                my_tags_sat = me.tags if hasattr(me, 'tags') and isinstance(me.tags, dict) else {}
                space_n = my_tags_sat.get("space", my_tags_sat.get("Space", 0))
                earth_n = my_tags_sat.get("earth", my_tags_sat.get("Earth", 0))
                total_sat = space_n + earth_n
                alerts.append(
                    f"📡 Satellites: сейчас {space_n} Space + {earth_n} Earth = "
                    f"{total_sat} тегов → +{total_sat} MC-prod. "
                    f"{'Хорошо!' if total_sat >= 5 else 'Подожди ещё тегов.' if total_sat < 3 else 'Играбельно.'}")

    # === BonelessDota rule 10: Strip Mine needs 2 energy ===
    if state.cards_in_hand:
        for card in (state.cards_in_hand or []):
            if not isinstance(card, dict):
                continue
            if card.get("name") == "Strip Mine":
                en_prod = getattr(me, 'energy_prod', 0)
                if en_prod < 2:
                    alerts.append(
                        f"⚡ Strip Mine: нужно -2 energy-prod, у тебя всего {en_prod}! "
                        f"Сначала добудь energy production.")

    # === BonelessDota rule 11: Immigration Shuttles needs 12-15 cities total ===
    if state.cards_in_hand:
        for card in (state.cards_in_hand or []):
            if not isinstance(card, dict):
                continue
            if card.get("name") == "Immigration Shuttles":
                total_cities = sum(1 for s in state.spaces if s.get("tileType") == 2)
                gens_left_is = _estimate_remaining_gens(state)
                # ~2 cities/gen in 3P
                projected = total_cities + gens_left_is * 2
                if projected < 10:
                    alerts.append(
                        f"⚠️ Immigration Shuttles: сейчас {total_cities} городов, "
                        f"прогноз ~{projected} к концу. Нужно 12-15 для окупаемости — "
                        f"маловероятно, рассмотри продажу.")
                else:
                    alerts.append(
                        f"📊 Immigration Shuttles: {total_cities} городов, "
                        f"прогноз ~{projected}. 1 VP/3 cities → ~{projected // 3} VP.")

    # === BonelessDota rule 14: Aquifer SP expensive early ===
    if gen <= 4 and me.mc >= 18 and state.oceans < 9:
        # Only alert if player might consider SP aquifer (no ocean cards in hand)
        ocean_cards_in_hand = False
        for card in (state.cards_in_hand or []):
            if not isinstance(card, dict):
                continue
            desc = card.get("description", "")
            if isinstance(desc, dict):
                desc = desc.get("text", "")
            if "ocean" in str(desc).lower() and "place" in str(desc).lower():
                ocean_cards_in_hand = True
                break
        if not ocean_cards_in_hand and state.oceans < 7:
            alerts.append(
                "💧 Aquifer SP = 18 MC за 1 ocean (+1 TR, placement bonus ~4-6 MC). "
                "Карты дают oceans дешевле — ищи Imported Hydrogen, Arctic Algae, и т.д.")

    # === BonelessDota rule 15: Late game city vs greenery math ===
    gens_left_cg = _estimate_remaining_gens(state)
    if gens_left_cg <= 3 and me.mc >= 23:
        my_greeneries = sum(1 for s in state.spaces
                            if s.get("tileType") == 0 and s.get("color") == me.color)
        my_cities = sum(1 for s in state.spaces
                        if s.get("tileType") == 2 and s.get("color") == me.color)
        if my_greeneries >= 3 and my_cities <= 1:
            alerts.append(
                "🏙️ City vs Greenery math: Greenery рядом с городом = 2-3 VP. "
                "Город нужно 3+ adj greeneries чтобы обогнать. "
                f"У тебя {my_greeneries} greeneries, {my_cities} cities — "
                f"{'ставь город рядом!' if my_greeneries >= 3 else 'greenery выгоднее.'}")
        elif my_cities >= 2 and my_greeneries <= 1 and me.mc >= 23:
            alerts.append(
                f"🌿 У тебя {my_cities} cities — greenery рядом с городом = "
                f"1 VP (tile) + 1 VP (adj) + 1 TR (O₂) = до 3 VP!")

    # === Late-play timing cards ===
    PLAY_LAST_ACTION = {
        "Media Archives": "gain 1 MC per event EVER PLAYED by all players — играй ПОСЛЕДНИМ действием!",
        "Molecular Printing": "gain 1 MC per city + colony — играй ПОСЛЕДНИМ действием!",
        "Greenhouses": "gain plants per city on Mars — играй ПОСЛЕДНИМ действием (больше городов = больше plants)!",
        "Toll Station": "gain MC per opponent Space tag — играй ПОСЛЕДНИМ действием!",
        "Galilean Waystation": "gain MC per opponent Jovian tag — играй ПОСЛЕДНИМ действием!",
    }
    for card in (state.cards_in_hand or []):
        if not isinstance(card, dict):
            continue
        cname = card.get("name", "")
        if cname in PLAY_LAST_ACTION:
            alerts.append(f"⏰ {cname}: {PLAY_LAST_ACTION[cname]}")

    # === Game timing alert ===
    gens_est = _estimate_remaining_gens(state)
    if gens_est <= 2 and state.generation >= 5:
        alerts.append(f"⏰ ~{gens_est} gen до конца! Переключайся на VP/TR")

    # === Card timing advice ===
    if gens_est >= 3:
        LAST_GEN_CARDS = {
            "Ganymede Colony": "Jovian amplifier — pure VP",
            "Water Import From Europa": "Jovian amplifier — pure VP",
            "Terraforming Ganymede": "Jovian amplifier — pure VP (исключение: 6+ Jovian mid-game = 6 TR engine)",
            "Noctis City": "обычно late city: city VP + MC-prod от будущих городов, не slam early",
            "Noctis Farming": "NRA enabler + VP, но играй ПОЗДНО (plants уязвимы, синергии с bio появятся позже)",
            "Advanced Ecosystems": "3→5 VP с bio chain (Decomposers+Eco Zone), строго last gen",
            "Colonizer Training Camp": "дешёвый Jovian + 2 VP, играй при O2 ~4-5, не раньше",
        }
        for card in (state.cards_in_hand or []):
            cname = card.get("name", "") if isinstance(card, dict) else str(card)
            if cname in LAST_GEN_CARDS:
                alerts.append(f"⏳ {cname} — {LAST_GEN_CARDS[cname]}")

        # Amplifier timing: play AFTER accumulating matching tags
        AMPLIFIER_TIMING = {
            "Insects": ("Plant", 3, "играй ПОСЛЕ максимума Plant тегов (держи в руке → slam)"),
            "Cartel": ("Earth", 3, "играй когда Earth тегов достаточно, но не слишком поздно (prod раньше = больше total)"),
            "Satellites": ("Space", 4, "играй после накопления Space тегов"),
            "Miranda Resort": ("Earth", 3, "VP scaling — играй после Earth тегов"),
            "Toll Station": (None, 0, "играй ПОСЛЕДНИМ действием в поколении (X от opponents)"),
            "Galilean Waystation": (None, 0, "играй ПОСЛЕДНИМ действием в поколении (X от opponents)"),
            "Greenhouses": (None, 0, "играй ПОСЛЕДНИМ действием — X от cities на карте"),
        }
        tableau_names = {c.get("name", "") if isinstance(c, dict) else str(c) for c in (me.tableau or [])}
        # Use parsed player tag totals from API. Tableau entries in GameState are stripped-down
        # and do not carry per-card tags, so reconstructing from tableau undercounts badly.
        player_tags = dict(getattr(me, "tags", {}) or {})

        for card in (state.cards_in_hand or []):
            cname = card.get("name", "") if isinstance(card, dict) else str(card)
            if cname in AMPLIFIER_TIMING:
                tag, threshold, advice = AMPLIFIER_TIMING[cname]
                have_tag = 0
                if tag:
                    have_tag = player_tags.get(tag, 0) or player_tags.get(tag.lower(), 0) or player_tags.get(tag.capitalize(), 0)
                if tag and have_tag < threshold:
                    alerts.append(
                        f"📊 {cname}: {advice} (сейчас {have_tag} {tag} тегов, "
                        f"подожди до {threshold}+)")

    # === CEO OPG timing reminder ===
    try:
        from .constants import CEO_STRATEGY
        for card in (me.tableau or []):
            cname = card.get("name", "") if isinstance(card, dict) else str(card)
            ceo_data = CEO_STRATEGY.get(cname)
            if not ceo_data or not ceo_data.get("opg"):
                continue
            # Check if OPG already used (isDisabled = true after OPG)
            is_disabled = card.get("isDisabled", False) if isinstance(card, dict) else False
            if is_disabled:
                continue
            timing = ceo_data.get("opg_timing", "")
            gen = state.generation
            hint = None

            if timing == "gen_1_2" and gen >= 3:
                hint = f"⚡ {cname} OPG: оптимально было gen 1-2! Используй СЕЙЧАС (value падает)"
            elif timing == "gen_2_3" and gen >= 4:
                hint = f"⚡ {cname} OPG: оптимально gen 2-3. Используй скоро!"
            elif timing == "gen_3_4" and gen >= 3 and gen <= 5:
                hint = f"⚡ {cname} OPG: сейчас оптимальное окно (gen 3-5)!"
            elif timing == "gen_3_5" and gen >= 3 and gen <= 5:
                hint = f"⚡ {cname} OPG: сейчас оптимальное окно! ({ceo_data['strategy'][:60]})"
            elif timing == "mid_game" and gen >= 4 and gen <= 6:
                hint = f"⚡ {cname} OPG: mid-game — хорошее время"
            elif timing == "last_gen" and gens_est <= 2:
                hint = f"⚡ {cname} OPG: ИСПОЛЬЗУЙ СЕЙЧАС (last gen = max value)!"
            elif timing == "before_trade" and state.colonies_data:
                hint = f"⚡ {cname} OPG: используй ПЕРЕД trade (все треки на max → trade = max value)"
            elif timing == "when_oceans_maxed" and state.oceans >= 9:
                hint = f"⚡ {cname} OPG: океаны заполнены — используй для 15 MC бонус!"
            elif timing == "when_reds_can_become_ruling" and state.turmoil:
                dominant = state.turmoil.get("dominant", "")
                if "Reds" in str(dominant):
                    hint = f"⚡ {cname} OPG: Reds dominant — идеальный момент!"
            elif timing and gen >= 6 and gens_est <= 3:
                hint = f"⚡ {cname} OPG не использован! Осталось ~{gens_est} gen"

            if hint:
                alerts.append(hint)
    except ImportError:
        pass

    # === "Don't help close" advisory for greedy strategy ===
    if gens_est >= 3 and me.mc_prod >= 6:
        # Player has decent engine — check if they should avoid helping close
        params_near_max = 0
        if state.temperature >= 6:
            params_near_max += 1
        if state.oxygen >= 12:
            params_near_max += 1
        if state.oceans >= 7:
            params_near_max += 1
        if state.venus >= 26:
            params_near_max += 1

        if params_near_max >= 2:
            alerts.append(
                "🛑 Параметры близко к закрытию — не помогай закрывать! "
                "Каждый SP Greenery/Aquifer/Asteroid приближает конец (невыгодно при сильном engine)")

    # === Play rate check ===
    # Winners play ~59.5 cards, losers ~44.4 (backtest finding)
    if state.generation >= 4:
        tableau_size = len(me.tableau) if me.tableau else 0
        play_rate = tableau_size / max(1, state.generation)
        affordable_now = 0
        if state.cards_in_hand:
            for card in state.cards_in_hand:
                if not isinstance(card, dict):
                    continue
                cost = card.get("cost", 0)
                if cost <= me.mc:
                    affordable_now += 1
        # Sustained <3 cards/gen by midgame often means tempo issues.
        if play_rate < 3.0 and state.generation >= 5 and (me.mc >= 8 or affordable_now >= 2):
            alerts.append(
                f"📉 Низкий темп: {play_rate:.1f} карт/gen "
                f"({tableau_size} за {state.generation} gen). "
                f"Если рука играбельна, конвертируй MC в tempo активнее.")
        elif play_rate >= 5 and state.generation >= 5:
            alerts.append(
                f"📈 Отличный темп: {play_rate:.1f} карт/gen!")

    # === VP source balance check ===
    gens_left_bal = _estimate_remaining_gens(state)
    if gens_left_bal <= 4 and state.generation >= 5:
        my_vp_est = _estimate_vp(state)
        card_vp = my_vp_est.get("cards", 0)
        tr_vp = my_vp_est.get("tr", 0)
        tile_vp = my_vp_est.get("greenery", 0) + my_vp_est.get("city", 0)
        total = my_vp_est.get("total", 1)
        if total > 0:
            card_pct = card_vp / total * 100
            # If card VP < 20% of total in late game, warn
            if card_pct < 15 and total >= 30:
                alerts.append(
                    f"⚠️ Card VP всего {card_vp} ({card_pct:.0f}% от {total} VP). "
                    f"TR/tiles доминируют — в длинной игре card VP players обгонят")

    # === "You forgot" alerts ===
    # Free delegate
    if hasattr(state, 'turmoil') and state.turmoil:
        my_in_lobby = me.color in state.turmoil.get("lobby", [])
        if my_in_lobby:
            alerts.append("🎫 FREE delegate в lobby! Не теряй 5 MC — поставь в партию.")

    # Plants near greenery but not converted
    plants_needed = 7 if "EcoLine" in (me.corp or "") else 8
    if me.plants >= plants_needed:
        alerts.append(f"🌿 Plants {me.plants} >= {plants_needed} — конвертируй в greenery!")

    # Heat near temp raise
    if me.heat >= 8 and state.temperature < 8:
        raises = me.heat // 8
        alerts.append(f"🌡️ Heat {me.heat} = {raises} temp raise{'s' if raises > 1 else ''}. Конвертируй!")

    # === Endgame checklist ===
    gens_left_eg = _estimate_remaining_gens(state)
    if gens_left_eg <= 1:
        checklist = []
        total_vp = 0
        total_cost = 0

        if me.plants >= plants_needed:
            vp = 2 if state.oxygen < 14 else 1
            checklist.append(f"Plants→greenery ({me.plants} plants → +{vp} VP) [FREE]")
            total_vp += vp

        if me.heat >= 8 and state.temperature < 8:
            raises = min(me.heat // 8, (8 - state.temperature) // 2)
            checklist.append(f"Heat→temp ({me.heat} heat → +{raises} TR) [FREE]")
            total_vp += raises

        if mc >= 23 and state.oxygen < 14:
            vp = 2 if state.oxygen < 14 else 1
            checklist.append(f"SP Greenery (+{vp} VP) [23 MC]")
            total_vp += vp
            total_cost += 23

        if mc >= 14 and state.temperature < 8:
            checklist.append(f"SP Asteroid (+1 TR) [14 MC]")
            total_vp += 1
            total_cost += 14

        funded = sum(1 for a in state.awards if a.get("funded_by"))
        if funded < 3:
            award_cost = [8, 14, 20][funded]
            if mc >= award_cost:
                checklist.append(f"Fund award (+2-5 VP) [{award_cost} MC]")
                total_vp += 3
                total_cost += award_cost

        if checklist:
            alerts.append(f"🏁 LAST GEN CHECKLIST ({total_vp}+ VP potential, {total_cost} MC needed):")
            for i, item in enumerate(checklist, 1):
                alerts.append(f"  {i}. {item}")

    # === 1. Award standings ===
    if state.awards:
        funded = [a for a in state.awards if a.get("funded_by")]
        for a in funded:
            scores_list = []
            for color, val in a.get("scores", {}).items():
                name_p = cn.get(color, color)
                v = val if isinstance(val, (int, float)) else val.get("score", 0) if isinstance(val, dict) else 0
                is_me = (color == me.color)
                scores_list.append((v, name_p, is_me))
            scores_list.sort(key=lambda x: -x[0])
            if scores_list:
                top_score = scores_list[0][0]
                leaders = [entry for entry in scores_list if entry[0] == top_score]
                parts = []
                for v, n, is_me in scores_list[:3]:
                    marker = "→ТЫ" if is_me else ""
                    parts.append(f"{n} {v}{marker}")
                my_place = next((i for i, (v, n, m) in enumerate(scores_list) if m), 99) + 1
                if len(leaders) > 1:
                    leader_names = ", ".join(n for _, n, _ in leaders)
                    if any(is_me for _, _, is_me in leaders):
                        status = f"🤝 делишь 1-е с {leader_names}"
                    else:
                        status = f"🤝 ничья за 1-е: {leader_names}"
                else:
                    status = "✅ лидируешь" if my_place == 1 else f"⚠️ {my_place}-е место"
                alerts.append(f"🏅 {a.get('name','?')}: {' > '.join(parts)} ({status})")

    # === 2. Colony trade one-liner ===
    if state.colonies_data and (me.energy >= 3 or me.mc >= 9):
        try:
            from .colony_advisor import analyze_trade_options
            tr = analyze_trade_options(state)
            if tr.get("best_hint") and "невыгоден" not in tr["best_hint"].lower():
                best = tr["trades"][0] if tr["trades"] else None
                rec = f"🚀 {tr['best_hint']}"
                if best:
                    method = "energy" if me.energy >= 3 else f"{best['best_cost']} MC"
                    rec += f" [{method}]"
                alerts.append(rec)
        except Exception:
            pass

    # === 3. Requirement forecast ===
    if state.cards_in_hand:
        gens_l = _estimate_remaining_gens(state)
        temp = state.temperature
        oxy = state.oxygen
        oceans = state.oceans
        venus = getattr(state, 'venus', 0)
        # Rough param growth: ~2 steps/gen for each
        for card in state.cards_in_hand:
            card_info_r = card
            name_r = card.get("name", "")
            reqs = card.get("play_requirements", [])
            if not reqs:
                continue
            for req in reqs:
                req_text = str(req).lower() if isinstance(req, str) else str(req.get("text", req)).lower()
                # Oxygen req
                import re as _re
                m_oxy = _re.search(r'(\d+)%?\s*oxygen', req_text)
                if m_oxy:
                    needed = int(m_oxy.group(1))
                    if oxy < needed:
                        gens_to_req = max(1, (needed - oxy) // 2)
                        if gens_to_req <= 3:
                            alerts.append(f"⏰ {name_r}: req {needed}% O₂ (сейчас {oxy}%). ~{gens_to_req} gen → держи!")
                m_temp = _re.search(r'(-?\d+)\s*[°c]?\s*temp', req_text)
                if m_temp:
                    needed_t = int(m_temp.group(1))
                    if temp < needed_t:
                        gens_to_req = max(1, (needed_t - temp) // 4)
                        if gens_to_req <= 3:
                            alerts.append(f"⏰ {name_r}: req {needed_t}°C (сейчас {temp}°C). ~{gens_to_req} gen → держи!")

    # === 4. Production summary ===
    steel_val = getattr(me, 'steel_value', 2)
    ti_val = getattr(me, 'ti_value', 3)
    effective_income = (me.mc_prod + me.tr
                        + getattr(me, 'steel_prod', 0) * steel_val
                        + getattr(me, 'ti_prod', 0) * ti_val
                        + getattr(me, 'plant_prod', 0) * 2
                        + getattr(me, 'heat_prod', 0) * 1)
    if state.generation >= 2:
        alerts.append(
            f"💰 Income: MC {me.mc_prod}+TR {me.tr} + steel {getattr(me,'steel_prod',0)}×{steel_val} "
            f"+ ti {getattr(me,'ti_prod',0)}×{ti_val} = ~{effective_income} MC effective")

    engine_draw_hint = _engine_draw_alert(state)
    if engine_draw_hint:
        alerts.append(engine_draw_hint)

    # === 5. Danger from opponent hand ===
    for opp in state.opponents:
        hand_n = getattr(opp, 'cards_in_hand_n', 0)
        if hand_n >= 8 and me.plants >= 5:
            opp_name = getattr(opp, 'name', cn.get(opp.color, opp.color))
            alerts.append(
                f"⚠️ {opp_name} {hand_n} карт — может иметь Asteroid/Virus. "
                f"Защити plants ({me.plants}) — конвертируй или играй Protected Habitats.")

    # === 6. Hand synergy with tableau ===
    if state.cards_in_hand and me.tableau:
        from .constants import TABLEAU_DISCOUNT_CARDS
        tab_names = {c["name"] if isinstance(c, dict) else str(c) for c in me.tableau}
        tag_discounts = {}
        for tc_name in tab_names:
            disc = TABLEAU_DISCOUNT_CARDS.get(tc_name, {})
            for tag, amount in disc.items():
                tag_discounts[tag] = tag_discounts.get(tag, 0) + amount

        if tag_discounts:
            # Count hand cards matching discounts
            for tag, discount in tag_discounts.items():
                if tag == "all":
                    continue
                matching = []
                for card in state.cards_in_hand:
                    card_tags = card.get("tags", [])
                    if tag.capitalize() in card_tags or tag.lower() in [t.lower() for t in card_tags]:
                        matching.append(card["name"])
                if len(matching) >= 2:
                    saving = len(matching) * discount
                    alerts.append(
                        f"🔗 {len(matching)} {tag} карт на руке + discount -{discount} MC = "
                        f"экономия {saving} MC! Играй все: {', '.join(matching[:4])}")

    # === Action ordering advice ===
    try:
        from .action_ordering import get_action_advice
        ordering = get_action_advice(state)
        alerts.extend(ordering)
    except Exception:
        pass  # don't break alerts if ordering fails

    # === VP gap + win plan (late/endgame) ===
    gens_left_vp = _estimate_remaining_gens(state)
    if gens_left_vp <= 3:
        my_vp = _estimate_vp(state)["total"]
        opp_vps = []
        for opp in state.opponents:
            visible_vp = _estimate_vp(state, player=opp)["total"]
            hidden_vp = _estimate_hidden_vp_buffer(opp)
            opp_vps.append((opp.name, visible_vp + hidden_vp, hidden_vp))
        if opp_vps:
            leader_name, leader_vp, leader_hidden_vp = max(opp_vps, key=lambda x: x[1])
            gap = leader_vp - my_vp
            if gap > 0:
                # Build specific catch-up plan
                plan_parts = []
                if me.plants >= (7 if "EcoLine" in (me.corp or "") else 8):
                    plan_parts.append(f"greenery (plants {me.plants})")
                if me.heat >= 8 and state.temperature < 8:
                    plan_parts.append(f"temp raise (heat {me.heat})")
                if mc >= 23 and state.oxygen < 14:
                    plan_parts.append("SP Greenery (23 MC)")
                if mc >= 14 and state.temperature < 8:
                    plan_parts.append("SP Asteroid (14 MC)")
                plan = ", ".join(plan_parts) if plan_parts else "нужны VP-карты"
                alerts.append(
                    f"🎯 VP GAP: -{gap} от {leader_name} ({my_vp} vs {leader_vp}). "
                    f"Plan: {plan}")
            elif gap < -5:
                if leader_hidden_vp >= 4:
                    alerts.append(
                        f"⚠️ Видимый VP лид большой, но у {leader_name} скрытый потолок "
                        f"~{leader_hidden_vp} VP. Защищай позицию без переоценки отрыва.")
                else:
                    alerts.append(
                        f"✅ VP LEAD: +{-gap} над {leader_name}. Защищай позицию!")

    # === Resource VP on cards ===
    _RESOURCE_VP_MAP = {
        # 1 VP per animal
        "Birds": (1, 1), "Fish": (1, 1), "Livestock": (1, 1),
        "Small Animals": (1, 1), "Penguins": (1, 1), "Pets": (1, 1),
        "Predators": (1, 1), "Venusian Animals": (1, 1), "Herbivores": (1, 1),
        # 1 VP per floater
        "Stratospheric Birds": (1, 1), "Aerial Mappers": (1, 1),
        # 1 VP per 2 floaters
        "Floating Habs": (1, 2),
        # 1 VP per 4 microbes
        "Tardigrades": (1, 4),
        # 1 VP per 3 microbes
        "Decomposers": (1, 3), "Symbiotic Fungus": (1, 3), "Extremophiles": (1, 3),
        # 1 VP per 2 microbes
        "Ants": (1, 2),
        # 1 VP per 2 animals
        "Ecological Zone": (1, 2),
        # 2 VP per science resource
        "Physics Complex": (2, 1),
        # 1 VP per fighter
        "Security Fleet": (1, 1),
        # 1 VP per camp
        "Refugee Camps": (1, 1),
    }
    try:
        me_tab = me.tableau or []
        card_vp_parts = []
        total_res_vp = 0
        for c in me_tab:
            name = c.get("name", "")
            res = c.get("resources", 0)
            if not res or name not in _RESOURCE_VP_MAP:
                continue
            mult, divisor = _RESOURCE_VP_MAP[name]
            card_vp = (res // divisor) * mult
            if card_vp > 0:
                card_vp_parts.append(f"{name} {res} ({card_vp} VP)")
                total_res_vp += card_vp
        if card_vp_parts and total_res_vp >= 2:
            alerts.append(
                f"📊 Resource VP: {', '.join(card_vp_parts)} = {total_res_vp} VP на картах")
    except Exception:
        pass

    return _dedupe_alerts(alerts)


def _dedupe_alerts(alerts: list[str]) -> list[str]:
    """Collapse repeated alerts from analysis + action-ordering layers."""
    deduped = []
    seen = set()

    for alert in alerts:
        if alert in seen:
            continue

        if alert.startswith("⚡ Trade FIRST: "):
            trade_targets = alert.removeprefix("⚡ Trade FIRST: ").split("(", 1)[0].strip()
            targets = [t.strip() for t in trade_targets.split(",") if t.strip()]
            if any(
                prev.startswith("🚀 Trade ") and any(target in prev for target in targets)
                for prev in deduped
            ):
                continue

        if alert.startswith("🏆 Milestone "):
            ms_name = alert.removeprefix("🏆 Milestone ").split(" FIRST", 1)[0].strip()
            if any(
                ms_name in prev and any(token in prev for token in ("ЗАЯВИ", "доступен", "ГОНКА", "может заявить"))
                for prev in deduped
            ):
                continue

        deduped.append(alert)
        seen.add(alert)

    return deduped


def _estimate_vp(state, player=None) -> dict:
    """Estimate VP for a player based on current state."""
    p = player or state.me
    vp = {"tr": p.tr, "greenery": 0, "city": 0, "cards": 0, "milestones": 0, "awards": 0, "details_cards": {}}

    # Use victoryPointsBreakdown if available (most accurate)
    vp_breakdown = p.raw.get("victoryPointsBreakdown", {})
    use_breakdown = bool(vp_breakdown)
    if use_breakdown and player is not None:
        # When opponent VP is hidden, the API still returns a skeleton breakdown:
        # TR may be populated, but cards/milestones/awards/tiles are often zeroed out.
        # In that case, falling back to visible-board estimation is less wrong than
        # treating the hidden zeroes as exact and claiming a fake huge VP lead.
        visible_total = (
            vp_breakdown.get("greenery", 0)
            + vp_breakdown.get("city", 0)
            + vp_breakdown.get("victoryPoints", 0)
            + vp_breakdown.get("milestones", 0)
            + vp_breakdown.get("awards", 0)
        )
        if visible_total == 0:
            use_breakdown = False
    if use_breakdown:
        vp["cards"] = vp_breakdown.get("victoryPoints", 0)
        vp["greenery"] = vp_breakdown.get("greenery", 0)
        vp["city"] = vp_breakdown.get("city", 0)
        vp["awards"] = vp_breakdown.get("awards", 0)
        vp["milestones"] = vp_breakdown.get("milestones", 0)
        vp["details_cards"] = {
            d.get("cardName", ""): d.get("victoryPoint", 0)
            for d in vp_breakdown.get("detailsCards", [])
            if d.get("cardName")
        }
        vp["total"] = sum(v for k, v in vp.items() if k != "details_cards")
        return vp

    # Build a map for adjacency calculation
    space_map = {}  # (x, y) -> space
    my_cities = []
    for s in state.spaces:
        x, y = s.get("x", -1), s.get("y", -1)
        if x >= 0:
            space_map[(x, y)] = s
        if s.get("color") != p.color:
            continue
        tile = s.get("tileType")
        if tile == TILE_GREENERY:
            vp["greenery"] += 1
        elif tile == TILE_CITY:
            my_cities.append(s)

    # City VP = count adjacent greeneries (from any player)
    for city in my_cities:
        cx, cy = city.get("x", -1), city.get("y", -1)
        if cx < 0:
            continue
        adj_greenery = 0
        for nx, ny in _get_neighbors(cx, cy):
            neighbor = space_map.get((nx, ny))
            if neighbor and neighbor.get("tileType") == TILE_GREENERY:
                adj_greenery += 1
        vp["city"] += adj_greenery

    # Milestone VP
    for m in state.milestones:
        if m.get("claimed_by") == p.name:
            vp["milestones"] += 5

    vp["cards"], vp["details_cards"] = _estimate_card_vp_from_tableau(state, p)

    vp["total"] = sum(v for k, v in vp.items() if k != "details_cards")
    return vp


def _estimate_hidden_vp_buffer(player) -> int:
    """Extra uncertainty buffer for opponents with hidden VP.

    When only visible information is available, large hands and developed engines
    mean real VP ceiling is likely higher than visible tableau/TR suggests.
    """
    hand_n = getattr(player, "cards_in_hand_n", 0) or 0
    science_n = (getattr(player, "tags", {}) or {}).get("science", 0)
    jovian_n = (getattr(player, "tags", {}) or {}).get("jovian", 0)
    animal_n = (getattr(player, "tags", {}) or {}).get("animal", 0)
    microbe_n = (getattr(player, "tags", {}) or {}).get("microbe", 0)

    buffer = 0
    if hand_n >= 25:
        buffer += 8
    elif hand_n >= 18:
        buffer += 5
    elif hand_n >= 12:
        buffer += 3
    elif hand_n >= 8:
        buffer += 1

    # Visible tableau VP is now estimated much better, so engine tags should add
    # only a small uncertainty premium, and only when there are enough hidden cards
    # left for them to matter.
    if hand_n >= 10:
        if science_n >= 4:
            buffer += 1
        if jovian_n >= 3:
            buffer += 1
        if animal_n + microbe_n >= 3:
            buffer += 1

    return buffer


def _estimate_hidden_vp_risk(state) -> int:
    """Conservative uncertainty margin for rush advice.

    If opponents have large hidden hands/engines, don't treat the visible VP
    lead as fully secure.
    """
    if not state.opponents:
        return 0

    buffers = [_estimate_hidden_vp_buffer(opp) for opp in state.opponents]
    max_buffer = max(buffers, default=0)
    avg_buffer = sum(buffers) / max(1, len(buffers))
    return max(max_buffer, round(avg_buffer))


def _strategy_label(strategy_name: str) -> str:
    labels = {
        "plant_engine": "Plant engine",
        "space_colony": "Colony",
        "venus_engine": "Venus",
        "heat_rush": "Heat rush",
        "city_builder": "Cities",
        "science_draw": "Science draw",
        "earth_economy": "Earth eco",
        "animal_vp": "Animal VP",
    }
    return labels.get(strategy_name, strategy_name.replace("_", " ").title())


def _normalize_strategy_tags(tag_map) -> dict[str, int]:
    normalized: dict[str, int] = {}
    if not isinstance(tag_map, dict):
        return normalized

    for raw_tag, raw_value in tag_map.items():
        if not raw_tag or not isinstance(raw_value, (int, float)):
            continue
        tag = str(raw_tag).strip()
        if not tag:
            continue
        normalized_tag = tag[0].upper() + tag[1:].lower()
        normalized[normalized_tag] = max(normalized.get(normalized_tag, 0), int(raw_value))
    return normalized


def _strategy_overview_lines(state) -> list[str]:
    try:
        from types import SimpleNamespace
        from .synergy import detect_strategies
    except Exception:
        return []

    players = [("Ты", getattr(state, "me", None))]
    players.extend((opp.name, opp) for opp in getattr(state, "opponents", []) or [])

    lines = []
    for label, player in players:
        if not player or not getattr(player, "tags", None):
            continue
        pseudo_state = SimpleNamespace(me=player)
        strategies = detect_strategies(_normalize_strategy_tags(player.tags), pseudo_state)
        shown = [_strategy_label(name) for name, conf in strategies[:2] if conf >= 0.4]
        if shown:
            lines.append(f"   • {label}: {' + '.join(shown)}")

    if not lines:
        return []
    return ["🧭 Линии стола:"] + lines


def is_game_end_triggered(state) -> bool:
    """True once the current generation is the final action generation."""
    return (
        getattr(state, "temperature", -30) >= 8
        and getattr(state, "oxygen", 0) >= 14
        and getattr(state, "oceans", 0) >= 9
    )


def _estimate_remaining_gens(state) -> int:
    """Estimate remaining generations based on global parameters progress.

    Venus не влияет на конец игры напрямую, но WGT иногда поднимает Venus
    вместо основных параметров, что замедляет игру на ~1-2 gen.
    """
    temp_remaining = max(0, (8 - state.temperature) // 2)
    o2_remaining = max(0, 14 - state.oxygen)
    ocean_remaining = max(0, 9 - state.oceans)

    total_remaining = temp_remaining + o2_remaining + ocean_remaining

    # Player count affects terraforming speed
    player_count = 1 + len(state.opponents) if hasattr(state, 'opponents') else 3
    if player_count == 2:
        base_steps = 4 if state.is_wgt else 3  # 2P: fewer actions per gen
    elif player_count >= 4:
        base_steps = 8 if state.is_wgt else 6  # 4-5P: more actions per gen
    else:
        base_steps = 6 if state.is_wgt else 4  # 3P: default

    steps_per_gen = base_steps
    if state.generation <= 3:
        steps_per_gen = max(3, base_steps - 2)  # early: less production, fewer steps
    elif state.generation >= 7:
        steps_per_gen = base_steps + (2 if player_count >= 3 else 1)  # late closeout accelerates

    late_closeout = state.generation >= 7 and total_remaining <= 18

    # Venus+WGT can slow the midgame, but in closeout it rarely costs a full extra generation.
    if state.has_venus and state.is_wgt and state.venus < 30:
        if late_closeout:
            steps_per_gen += 1
        elif state.generation < 7:
            steps_per_gen = max(3, steps_per_gen - 1)

    raw_gens = total_remaining / max(1, steps_per_gen)
    gens = round(raw_gens) if late_closeout else math.ceil(raw_gens)
    if state.generation >= 8 and player_count >= 3 and total_remaining <= 18:
        gens = min(gens, 2)

    return max(1, gens)


def strategy_advice(state) -> list[str]:
    """Высокоуровневые стратегические советы на основе фазы игры."""
    gens_left = _estimate_remaining_gens(state)
    phase = game_phase(gens_left, state.generation)
    me = state.me
    tips = []

    # === Corp-specific tips (gen 1-2) ===
    if state.generation <= 2:
        corp = me.corp or ""
        if corp in CORP_TIPS:
            tips.append(CORP_TIPS[corp])

        # Prelude tips (gen 1 only)
        if state.generation == 1:
            raw_tableau = me.raw.get("tableau", []) if hasattr(me, 'raw') else []
            for card in raw_tableau:
                card_name = card.get("name", "") if isinstance(card, dict) else ""
                if card_name in PRELUDE_TIPS:
                    tips.append(PRELUDE_TIPS[card_name])

    if phase == "early":
        tips.append("🔧 ФАЗА: Engine. Приоритет: production, дискаунты, теги.")
        tips.append(f"   1 MC-prod сейчас = ~{gens_left} MC за игру.")
        if me.mc_prod < 5:
            tips.append("   ⚠️ MC-prod < 5 — ищи production карты!")
    elif phase == "mid":
        tips.append("⚖️ ФАЗА: Баланс. Production ещё ок, начинай TR.")
        tips.append(f"   1 MC-prod = ~{gens_left} MC. 1 VP = ~{8 - gens_left * 0.8:.0f} MC.")
        if sum(1 for m in state.milestones if m.get("claimed_by")) < 3:
            tips.append("   Milestones ещё открыты — заяви когда готов, но engine важнее в ранних gen.")
    elif phase == "late":
        tips.append("🎯 ФАЗА: Поздняя. VP важнее новой production.")
        tips.append(f"   1 MC-prod = ~{gens_left} MC. 1 VP = ~{8 - gens_left * 0.8:.0f} MC.")
        tips.append("   Приоритет: VP-карты, greenery, awards, города. Дорогая production — скип.")
    elif phase == "endgame":
        tips.append("🏁 ФАЗА: Финал! Только VP/TR. Production = 0.")
        tips.append("   Greenery из plants, temp из heat, awards, VP-карты.")
        tips.append("   Не покупай карт на драфте если не сыграешь в этом gen!")

    tips.extend(_strategy_overview_lines(state))

    # Rush vs Engine detection
    total_prod = me.mc_prod + me.steel_prod * 1.6 + me.ti_prod * 2.5
    opp_max_tr = max((o.tr for o in state.opponents), default=20)
    tr_lead = me.tr - opp_max_tr

    opp_max_prod = 0
    for opp in state.opponents:
        opp_prod = opp.mc_prod + opp.steel_prod * 1.6 + opp.ti_prod * 2.5
        opp_max_prod = max(opp_max_prod, opp_prod)
    engine_gap = total_prod - opp_max_prod

    my_vp_est = _estimate_vp(state)
    opp_vp_max = 0
    for opp in state.opponents:
        ovp = _estimate_vp(state, opp)["total"] + _estimate_hidden_vp_buffer(opp)
        opp_vp_max = max(opp_vp_max, ovp)
    vp_lead = my_vp_est["total"] - opp_vp_max
    hidden_vp_risk = _estimate_hidden_vp_risk(state)
    safe_vp_lead = vp_lead - hidden_vp_risk

    if safe_vp_lead >= 5 and engine_gap <= -3 and phase in ("mid", "late"):
        tips.append(
            f"   🏃 РАШ! Безопасный VP лид +{safe_vp_lead} "
            f"(сырой +{vp_lead}), но engine слабее ({total_prod:.0f} vs {opp_max_prod:.0f}). "
            f"Рашь конец!")
    elif safe_vp_lead >= 5 and tr_lead >= 5 and phase in ("mid", "late"):
        tips.append(
            f"   🏃 VP+TR лид (безопасный VP +{safe_vp_lead}, TR +{tr_lead}). "
            f"Рашь конец — поднимай параметры.")
    elif vp_lead >= 5 and hidden_vp_risk >= 4 and phase in ("mid", "late"):
        tips.append(
            f"   ⚠️ Видимый VP лид +{vp_lead}, но скрытый потолок оппонентов высокий "
            f"(риск ~{hidden_vp_risk} VP). Ускоряй игру, но не считай отрыв безопасным.")
    elif tr_lead >= 8 and phase in ("mid", "late"):
        tips.append(f"   🏃 TR лид +{tr_lead}. Можно рашить если engine не отстаёт.")
    elif tr_lead <= -8:
        tips.append(f"   🐢 TR отставание {tr_lead}. Компенсируй VP (milestones/awards/cards).")

    if engine_gap >= 5 and phase == "mid":
        tips.append(f"   💰 Сильный engine ({total_prod:.0f} vs {opp_max_prod:.0f} MC-eq/gen). Замедляй игру!")
    elif engine_gap <= -8 and phase in ("early", "mid"):
        tips.append(f"   ⚠️ Engine слабее оппонентов ({total_prod:.0f} vs {opp_max_prod:.0f}). Не затягивай!")

    my_greenery = sum(1 for s in state.spaces
                      if s.get("tileType") == 0 and s.get("color") == me.color)
    my_cities = sum(1 for s in state.spaces
                    if s.get("tileType") == 2 and s.get("color") == me.color)
    if my_greenery >= 3 and my_cities == 0 and phase in ("mid", "late", "endgame"):
        tips.append(f"   🏙️ {my_greenery} greenery но 0 cities! City даст adjacency VP + MC-prod.")
    elif my_greenery >= 5 and my_cities <= 1 and phase in ("late", "endgame"):
        tips.append(f"   🏙️ {my_greenery} greenery, {my_cities} city — рассмотри ещё city для adjacency VP.")

    my_vp = _estimate_vp(state)
    opp_vps = []
    for opp in state.opponents:
        ovp = _estimate_vp(state, opp)
        ovp_total = ovp["total"] + _estimate_hidden_vp_buffer(opp)
        opp_vps.append((opp.name, ovp_total))
    if opp_vps:
        leader_name, leader_vp = max(opp_vps, key=lambda x: x[1])
        gap = my_vp["total"] - leader_vp
        if gap > 5:
            hidden_vp_risk = _estimate_hidden_vp_risk(state)
            if hidden_vp_risk >= 4:
                tips.append(
                    f"   🟢 VP лидер: безопасный +{gap} над {leader_name} "
                    f"(видимый риск оппонентов ~{hidden_vp_risk} VP)")
            else:
                tips.append(f"   🟢 VP лидер: +{gap} над {leader_name} (~{my_vp['total']} VP)")
        elif gap > 0:
            tips.append(f"   🟢 Впереди +{gap} VP ({my_vp['total']} vs {leader_name} {leader_vp})")
        elif gap >= -3:
            tips.append(f"   🟡 Почти вровень с {leader_name} ({my_vp['total']} vs {leader_vp})")
        else:
            vp_needed = abs(gap) / max(1, gens_left)
            tips.append(f"   🔴 Отставание {gap} VP от {leader_name} ({my_vp['total']} vs {leader_vp})")
            if gens_left >= 2:
                tips.append(f"      Нужно +{vp_needed:.1f} VP/gen: greenery, awards, VP-карты")

    if phase == "endgame" and opp_vps:
        closest_gap = min(abs(my_vp["total"] - vp) for _, vp in opp_vps)
        if closest_gap <= 5:
            tips.append(f"   💰 Гонка плотная (±{closest_gap} VP)! MC = тайбрейк. Не трать всё в ноль.")

        def _visible_closeout_only(player):
            vp_gain = 0
            if player.plants >= 8:
                vp_gain += (player.plants // 8) * (2 if state.oxygen < 14 else 1)
            if state.temperature < 8:
                vp_gain += min(player.heat // 8, max(0, (8 - state.temperature) // 2))
            return vp_gain

        my_closeout = _visible_closeout_only(me)
        opp_closeouts = [(opp.name, _visible_closeout_only(opp)) for opp in state.opponents]
        best_opp_closeout = max((gain for _, gain in opp_closeouts), default=0)
        if best_opp_closeout > my_closeout:
            opp_name = max(opp_closeouts, key=lambda x: x[1])[0]
            tips.append(
                f"   ⚠️ Visible closeout: у {opp_name} +{best_opp_closeout} VP из ресурсов, "
                f"у тебя +{my_closeout}. Не отдавай последний swing.")
        elif my_closeout > best_opp_closeout:
            tips.append(
                f"   ✅ Visible closeout: у тебя +{my_closeout} VP из ресурсов vs максимум +{best_opp_closeout} у оппонентов.")

    # === Endgame VP Action Ranker ===
    if phase == "endgame":
        vp_actions = []  # (vp, cost_mc, description, priority)

        # 1. Greenery from plants (8 plants = 1 greenery = 1 VP + maybe 1 TR)
        plant_greeneries = me.plants // 8
        if plant_greeneries > 0:
            tr_bonus = 1 if state.oxygen < 14 else 0
            vp_per = 1 + tr_bonus
            vp_actions.append((vp_per, 0, f"Greenery из plants ({me.plants} plants → {plant_greeneries} greenery)", 1))

        # 2. Temperature from heat (8 heat = +1 temp = +1 TR)
        if state.temperature < 8:
            heat_raises = me.heat // 8
            if heat_raises > 0:
                temp_steps_left = (8 - state.temperature) // 2
                actual = min(heat_raises, temp_steps_left)
                if actual > 0:
                    vp_actions.append((actual, 0, f"Temp из heat ({me.heat} heat → {actual} TR)", 1))

        # 3. Standard project: Greenery (23 MC)
        if me.mc >= 23 and state.oxygen < 14:
            mc_greeneries = me.mc // 23
            vp_actions.append((2, 23, f"SP Greenery (23 MC → 1 VP + 1 TR)", 3))
        elif me.mc >= 23:
            vp_actions.append((1, 23, f"SP Greenery (23 MC → 1 VP, O₂ maxed)", 4))

        # 4. Standard project: Asteroid/Temperature (14 MC)
        if state.temperature < 8 and me.mc >= 14:
            vp_actions.append((1, 14, f"SP Asteroid (14 MC → 1 TR)", 3))

        # 5. Award funding
        funded_count = sum(1 for a in state.awards if a["funded_by"])
        if funded_count < 3:
            cost = [8, 14, 20][funded_count]
            if me.mc >= cost:
                # Check if we'd win any unfunded award
                for a in state.awards:
                    if a["funded_by"]:
                        continue
                    my_score = a["scores"].get(me.color, 0)
                    if isinstance(my_score, dict):
                        my_score = my_score.get("score", 0)
                    opp_scores = [v if isinstance(v, (int, float)) else v.get("score", 0)
                                  for c, v in a["scores"].items() if c != me.color]
                    opp_max = max(opp_scores) if opp_scores else 0
                    if my_score > opp_max:
                        vp_actions.append((5, cost, f"Fund {a['name']} award ({cost} MC → 5 VP, ты лидер)", 2))
                    elif my_score == opp_max and my_score > 0:
                        vp_actions.append((2, cost, f"Fund {a['name']} award ({cost} MC → 2 VP, tied)", 4))

        # 6. Venus raise (if < 30 and we have standard project)
        if state.venus < 30 and state.has_venus and me.mc >= 15:
            vp_actions.append((1, 15, f"SP Venus (15 MC → 1 TR)", 3))

        if vp_actions:
            # Sort: priority first, then VP/MC ratio
            vp_actions.sort(key=lambda x: (x[3], -x[0] / max(x[1], 1)))
            tips.append("   📊 VP ACTIONS (ранжирование):")
            for vp, cost, desc, _ in vp_actions[:6]:
                cost_str = f"{cost} MC" if cost > 0 else "FREE"
                ratio = f"{vp/cost:.2f} VP/MC" if cost > 0 else "∞"
                tips.append(f"      {vp} VP | {cost_str} | {ratio} | {desc}")
            best_visible = endgame_convert_actions(state)
            if best_visible:
                top = best_visible[0]
                cost_str = f"{top['cost']} MC" if top["cost"] > 0 else "FREE"
                tips.append(f"   🎯 Best visible convert: {top['action']} → +{top['vp']} VP for {cost_str}")

    # === Opponent rush detection ===
    if phase in ("mid", "late", "endgame") and gens_left <= 5:
        temp_steps = max(0, (8 - state.temperature) // 2)
        o2_steps = max(0, 14 - state.oxygen)
        ocean_steps = max(0, 9 - state.oceans)
        total_steps = temp_steps + o2_steps + ocean_steps
        if total_steps == 0:
            total_steps = -1

        for opp in state.opponents:
            opp_heat_raises = opp.heat // 8
            opp_plant_greens = opp.plants // 8
            opp_mc_avail = opp.mc + opp.steel * 2 + opp.titanium * 3
            # How many steps opponent can close this gen with resources
            opp_free_steps = min(opp_heat_raises, temp_steps) + min(opp_plant_greens, o2_steps)
            remaining_after_free = total_steps - opp_free_steps
            # SP costs: temp=14, ocean=18, greenery=23 (avg ~18)
            opp_sp_steps = opp_mc_avail // 18
            opp_total_closes = opp_free_steps + opp_sp_steps
            if total_steps > 0 and opp_total_closes >= total_steps and total_steps <= 6:
                tips.append(
                    f"   🚨 {opp.name} может ЗАРАШИТЬ! "
                    f"(heat:{opp.heat}, plants:{opp.plants}, MC:{opp.mc}) "
                    f"= ~{opp_total_closes} шагов vs {total_steps} нужно")
            elif total_steps > 0 and opp_free_steps >= 3 and total_steps <= 8:
                tips.append(
                    f"   ⚠️ {opp.name} закроет ~{opp_free_steps} шагов бесплатно "
                    f"(heat→temp, plants→O₂). Игра ускоряется!")

    # Card VP gap detection
    if phase in ("mid", "late") and me.mc_prod >= 12:
        my_card_vp = my_vp.get("cards", 0)
        best_opp_card_vp = 0
        for opp in state.opponents:
            opp_card_vp = _estimate_vp(state, opp).get("cards", 0)
            best_opp_card_vp = max(best_opp_card_vp, opp_card_vp)
        card_gap = best_opp_card_vp - my_card_vp
        if card_gap >= 10:
            tips.append(f"   ⚠️ CARD VP: {my_card_vp} vs {best_opp_card_vp} у оппонента (−{card_gap})!")
            tips.append(f"      VP-action карты = 0.3-0.5 VP/MC. Greenery SP = 0.13 VP/MC.")
        elif card_gap >= 5 and gens_left >= 3:
            tips.append(f"   ⚠️ Card VP отставание −{card_gap}. Приоритет VP-карты!")

    # Low hand warning: high income but few cards to play
    if me.mc_prod >= 20 and phase in ("mid", "late"):
        hand_n = len(state.cards_in_hand or []) if hasattr(state, 'cards_in_hand') else 0
        if hand_n < 3:
            tips.append(f"   ⚠️ Income {me.mc_prod + me.tr}/gen но {hand_n} карт! Покупай ВСЕ 4 на драфте.")

    # === WGT parameter selection advice ===
    if state.is_wgt:
        temp_steps = max(0, (8 - state.temperature) // 2)
        o2_steps = max(0, 14 - state.oxygen)
        ocean_steps = max(0, 9 - state.oceans)
        venus_steps = max(0, (30 - state.venus) // 2) if state.has_venus else 0

        wgt_hints = []
        # Venus to stall (doesn't end game)
        if state.has_venus and venus_steps > 0 and engine_gap >= 3:
            wgt_hints.append("Venus (не завершает игру → stall)")
        # Deny opponent's rush parameter
        for opp in state.opponents:
            opp_heat = opp.heat
            opp_plants = opp.plants
            if opp_heat >= 16 and temp_steps >= 2:
                wgt_hints.append(f"НЕ temp — {opp.name} рашит heat→temp ({opp_heat} heat)")
            if opp_plants >= 16 and o2_steps >= 2:
                wgt_hints.append(f"НЕ O₂ — {opp.name} рашит plants→greenery ({opp_plants} plants)")
        # Your weakest parameter (let WGT do it for free)
        params = []
        if temp_steps > 0:
            params.append(("temp", temp_steps))
        if o2_steps > 0:
            params.append(("O₂", o2_steps))
        if ocean_steps > 0:
            params.append(("ocean", ocean_steps))
        if params:
            weakest = max(params, key=lambda x: x[1])
            wgt_hints.append(f"Твой слабый параметр: {weakest[0]} ({weakest[1]} шагов) — пусть WGT поднимает бесплатно")

        if wgt_hints:
            tips.append("   🌍 WGT выбор параметра:")
            for h in wgt_hints:
                tips.append(f"      • {h}")

    # === Turmoil party matching ===
    if state.turmoil:
        party_tag_map = {
            "Mars First": {"building": "Building"},
            "Scientists": {"science": "Science"},
            "Unity": {"venus": "Venus", "earth": "Earth", "jovian": "Jovian"},
            "Greens": {"plant": "Plant", "microbe": "Microbe", "animal": "Animal"},
            "Kelvinists": {},  # heat-prod based, not tags
        }
        best_party = None
        best_count = 0
        my_tags = me.tags if hasattr(me, 'tags') and isinstance(me.tags, dict) else {}
        for party, tag_map in party_tag_map.items():
            count = sum(my_tags.get(t, 0) for t in tag_map)
            if count > best_count:
                best_count = count
                best_party = party
        # Kelvinists: check heat production
        if me.heat_prod >= 4 and me.heat_prod > best_count:
            best_party = "Kelvinists"
            best_count = me.heat_prod
        if best_party and best_count >= 3:
            tag_label = {
                "Mars First": "Building", "Scientists": "Science",
                "Unity": "Venus/Earth/Jovian", "Greens": "Plant/Microbe/Animal",
                "Kelvinists": "heat-prod",
            }.get(best_party, "?")
            tips.append(
                f"   🏛️ Твои {best_count} {tag_label} → {best_party} ruling bonus = "
                f"+{min(5, best_count)} MC/gen")

    return tips


def _rush_calculator(state) -> list[str]:
    """Calculate if VP leader can rush end by closing parameters."""
    hints = []
    me = state.me

    temp_steps = max(0, (8 - state.temperature) // 2)
    o2_steps = max(0, 14 - state.oxygen)
    ocean_steps = max(0, 9 - state.oceans)
    total_steps = temp_steps + o2_steps + ocean_steps

    if total_steps == 0:
        return ["🏁 Параметры закрыты! Последний gen."]

    my_vp = _estimate_vp(state)
    opp_vps = [
        (o.name, _estimate_vp(state, o)["total"] + _estimate_hidden_vp_buffer(o))
        for o in state.opponents
    ]
    am_leader = all(my_vp["total"] >= ov for _, ov in opp_vps)

    if not am_leader:
        return []

    lead = my_vp["total"] - max(ov for _, ov in opp_vps)

    heat_raises = me.heat // 8
    plant_greeneries = me.plants // 8
    mc_avail = me.mc + me.steel * 2 + me.titanium * 3

    my_temp_closes = heat_raises
    remaining_temp = max(0, temp_steps - my_temp_closes)
    my_o2_closes = plant_greeneries
    remaining_o2 = max(0, o2_steps - my_o2_closes)
    remaining_ocean = ocean_steps

    sp_cost = remaining_temp * 14 + remaining_ocean * 18 + remaining_o2 * 23
    wgt_discount = 1 if state.is_wgt else 0
    total_need = remaining_temp + remaining_ocean + remaining_o2 - wgt_discount

    can_rush = sp_cost <= mc_avail and total_need >= 0

    hints.append(f"🏁 До закрытия: Temp {temp_steps}↑ O₂ {o2_steps}↑ Ocean {ocean_steps}↑ = {total_steps} шагов")

    if total_steps <= 3:
        resources = []
        if heat_raises:
            resources.append(f"heat→temp ×{min(heat_raises, temp_steps)}")
        if plant_greeneries:
            resources.append(f"plants→green ×{min(plant_greeneries, o2_steps)}")
        if resources:
            hints.append(f"   Бесплатно: {', '.join(resources)}")
        if sp_cost > 0:
            hints.append(f"   SP: ~{sp_cost} MC за остаток")
        if can_rush and lead >= 5:
            hints.append(f"   ✅ МОЖНО ЗАРАШИТЬ! Лид +{lead} VP, ресурсов хватает")
        elif can_rush:
            hints.append(f"   ⚠️ Теоретически можешь закрыть, но безопасный лид всего +{lead} VP")
        else:
            hints.append(f"   ❌ Не хватает ресурсов ({mc_avail} MC vs {sp_cost} MC нужно)")
    elif total_steps <= 8:
        my_closes_per_gen = heat_raises + plant_greeneries + max(0, mc_avail // 18)
        gens_to_close = max(1, (total_steps - wgt_discount) // max(1, my_closes_per_gen + wgt_discount))
        hints.append(f"   ~{gens_to_close} gen чтобы закрыть (при текущих ресурсах)")

    return hints


def _vp_projection(state) -> list[str]:
    """Project final VP for each player based on remaining resources + future actions."""
    hints = []
    gens_left = _estimate_remaining_gens(state)

    def _visible_closeout_vp(player) -> tuple[int, list[str]]:
        bonus_vp = 0
        details = []

        plant_greeneries = (player.plants or 0) // 8
        if plant_greeneries:
            greenery_vp = plant_greeneries * (2 if state.oxygen < 14 else 1)
            bonus_vp += greenery_vp
            details.append(f"+{greenery_vp} green")

        if state.temperature < 8:
            heat_raises = min((player.heat or 0) // 8, max(0, (8 - state.temperature) // 2))
            if heat_raises:
                bonus_vp += heat_raises
                details.append(f"+{heat_raises} temp")

        funded_count = sum(1 for a in state.awards if a.get("funded_by"))
        if funded_count < 3 and (player.mc or 0) >= [8, 14, 20][funded_count]:
            best_award_vp = 0
            for award in state.awards:
                if award.get("funded_by"):
                    continue
                my_score = award.get("scores", {}).get(player.color, 0)
                if isinstance(my_score, dict):
                    my_score = my_score.get("score", 0)
                opp_scores = []
                for color, val in award.get("scores", {}).items():
                    if color == player.color:
                        continue
                    if isinstance(val, dict):
                        opp_scores.append(val.get("score", 0))
                    else:
                        opp_scores.append(val)
                opp_best = max(opp_scores) if opp_scores else 0
                if my_score > opp_best:
                    best_award_vp = max(best_award_vp, 5)
                elif my_score == opp_best and my_score > 0:
                    best_award_vp = max(best_award_vp, 2)
            if best_award_vp:
                bonus_vp += best_award_vp
                details.append(f"+{best_award_vp} award")

        return bonus_vp, details

    for p in [state.me] + state.opponents:
        current_vp = _estimate_vp(state, p)
        bonus_vp = 0
        details = []

        if gens_left <= 1:
            bonus_vp, details = _visible_closeout_vp(p)
            projected = current_vp["total"] + bonus_vp
            is_me = p.name == state.me.name
            marker = "🔴" if is_me else "  "
            detail_str = f" ({', '.join(details)})" if details else ""
            hints.append(f"{marker} {p.name}: ~{projected} VP (visible closeout, сейчас {current_vp['total']}{detail_str})")
            continue

        total_plants = p.plants + p.plant_prod * gens_left
        future_greeneries = total_plants // 8
        if future_greeneries:
            bonus_vp += future_greeneries * 2
            details.append(f"+{future_greeneries} green")

        if state.temperature < 8:
            # Energy converts to heat at end of each gen
            total_heat = p.heat + (p.heat_prod + p.energy_prod) * gens_left + p.energy
            heat_raises = min(total_heat // 8, max(0, (8 - state.temperature) // 2))
            if heat_raises:
                bonus_vp += heat_raises
                details.append(f"+{heat_raises} temp")

        # (card_name -> (resource_type, vp_rate_per_resource))
        VP_PER_RES = {
            # 1 VP per resource (action: +1 resource/gen)
            "Penguins": ("animal", 1), "Fish": ("animal", 1),
            "Birds": ("animal", 1), "Livestock": ("animal", 1),
            "Predators": ("animal", 1), "Small Animals": ("animal", 1),
            "Venusian Animals": ("animal", 1),
            "Security Fleet": ("fighter", 1), "Refugee Camps": ("camp", 1),
            "Physics Complex": ("science", 1),
            # 1 VP per 2 resources
            "Herbivores": ("animal", 0.5),
            "Venusian Insects": ("microbe", 0.5),
            "Stratopolis": ("floater", 0.5), "Ants": ("microbe", 0.5),
            # 1 VP per 3 resources
            "Decomposers": ("microbe", 0.33), "Extremophiles": ("microbe", 0.33),
            "Tardigrades": ("microbe", 0.25),
        }
        # Cards that add extra resources of a type each gen
        RESOURCE_ADDERS = {
            "animal": {"Symbiotic Fungus", "Ecological Zone"},
            "microbe": {"Symbiotic Fungus", "Decomposers", "Ants"},
        }
        tableau_names_set = {c.get("name", "") for c in p.tableau}
        action_vp = 0
        for c in p.tableau:
            cname = c.get("name", "")
            entry = VP_PER_RES.get(cname)
            if entry:
                res_type, vp_rate = entry
                # Boost rate if tableau has adders for this resource type
                adders = RESOURCE_ADDERS.get(res_type, set())
                if adders & tableau_names_set:
                    vp_rate *= 1.5
                action_vp += round(vp_rate * gens_left)
        if action_vp:
            bonus_vp += action_vp
            details.append(f"+{action_vp} actions")

        future_mc = (p.mc + p.mc_prod * gens_left
                     + p.steel_prod * gens_left * 2
                     + p.ti_prod * gens_left * 3)
        # Colony trade income: energy trade (free-ish) or MC trade (9 MC cost)
        if state.has_colonies:
            if p.energy_prod >= 3:
                future_mc += gens_left * 12  # energy trade: ~12 MC value net
            elif p.mc_prod >= 5:
                future_mc += gens_left * 5   # MC trade: ~14 MC value - 9 MC cost

        # Cards: playing cards is more efficient than SP (~12 MC per VP-eq)
        tr_from_income = min(gens_left * 2, future_mc // 12)
        if tr_from_income and gens_left >= 2:
            bonus_vp += tr_from_income
            details.append(f"+~{tr_from_income} TR")

        # Cards in hand: each played card ≈ 1.2 VP (mix of TR, VP, production value)
        cards_count = p.cards_in_hand_n
        if p.is_me and hasattr(state, 'cards_in_hand') and state.cards_in_hand:
            cards_count = max(cards_count, len(state.cards_in_hand))
        playable = min(cards_count, gens_left * 3)
        card_vp = round(playable * 1.2)
        if card_vp:
            bonus_vp += card_vp
            details.append(f"+~{card_vp} cards")

        projected = current_vp["total"] + bonus_vp
        is_me = p.name == state.me.name
        marker = "🔴" if is_me else "  "
        detail_str = f" ({', '.join(details)})" if details else ""
        hints.append(f"{marker} {p.name}: ~{projected} VP (сейчас {current_vp['total']}{detail_str})")

    return hints


def endgame_convert_actions(state) -> list[dict]:
    """Visible endgame conversions ranked by immediate VP value."""
    me = state.me
    gens_left = _estimate_remaining_gens(state)
    phase = game_phase(gens_left, state.generation)
    if phase != "endgame":
        return []

    actions = []
    tableau_names = {c.get("name", "") for c in (me.tableau or [])}

    free_action_vp = {
        "Penguins": 1,
        "Fish": 1,
        "Birds": 1,
        "Livestock": 1,
        "Predators": 1,
        "Small Animals": 1,
        "Herbivores": 1,
        "Venusian Animals": 1,
        "Security Fleet": 1,
        "Physics Complex": 2,
        "Refugee Camps": 1,
        "Aerial Mappers": 1,
        "Stratospheric Birds": 1,
        "Ants": 0.5,
        "Extremophiles": 0.33,
        "Decomposers": 0.33,
        "Tardigrades": 0.25,
    }
    for name, vp_gain in free_action_vp.items():
        if name in tableau_names:
            actions.append({
                "action": f"Action: {name}",
                "vp": vp_gain,
                "cost": 0,
                "type": "blue_action",
                "priority": 1,
            })

    plant_greeneries = me.plants // 8
    if plant_greeneries > 0:
        oxygen_steps_left = max(0, 14 - state.oxygen)
        tr_bonus = min(plant_greeneries, oxygen_steps_left)
        vp_gain = plant_greeneries + tr_bonus
        actions.append({
            "action": f"Greenery x{plant_greeneries} из plants ({me.plants} plants)",
            "vp": vp_gain,
            "cost": 0,
            "type": "greenery",
            "priority": 1,
        })

    if state.temperature < 8:
        heat_raises = min(me.heat // 8, max(0, (8 - state.temperature) // 2))
        if heat_raises > 0:
            actions.append({
                "action": f"Temp из heat ({me.heat} heat)",
                "vp": heat_raises,
                "cost": 0,
                "type": "temperature",
                "priority": 1,
            })

    # Awards — delegated to award_capture (urgency-based)
    from .award_capture import urgent_award_actions
    for ua in urgent_award_actions(state):
        if me.mc < ua["cost"]:
            continue
        vp = 5 if ua["lead"] > 0 else 2
        priority = {"CRITICAL": 1, "HIGH": 2, "MEDIUM": 4}[ua["urgency"]]
        label = f"Fund {ua['award_name']} award"
        if ua["lead"] == 0:
            label += " (tie)"
        actions.append({
            "action": label,
            "vp": vp,
            "cost": ua["cost"],
            "type": "award",
            "priority": priority,
        })

    if me.mc >= 23:
        actions.append({
            "action": "SP Greenery",
            "vp": 2 if state.oxygen < 14 else 1,
            "cost": 23,
            "type": "sp_greenery",
            "priority": 3 if state.oxygen < 14 else 4,
        })

    if state.temperature < 8 and me.mc >= 14:
        actions.append({
            "action": "SP Asteroid",
            "vp": 1,
            "cost": 14,
            "type": "sp_temp",
            "priority": 3,
        })

    if state.has_venus and state.venus < 30 and me.mc >= 15:
        actions.append({
            "action": "SP Venus",
            "vp": 1,
            "cost": 15,
            "type": "sp_venus",
            "priority": 3,
        })

    actions.sort(key=lambda a: (a["priority"], -(a["vp"] / max(a["cost"], 1)), -a["vp"]))
    return actions


def _card_play_impact(db, card_name: str, state) -> str:
    """Показать что даст розыгрыш карты: production, VP, TR, tags, ресурсы."""
    info = db.get_info(card_name)
    if not info:
        return ""
    desc_raw = info.get("description", "")
    desc = desc_raw if isinstance(desc_raw, str) else str(desc_raw.get("text", desc_raw.get("message", ""))) if isinstance(desc_raw, dict) else str(desc_raw)
    tags = info.get("tags", [])
    vp_raw = info.get("victoryPoints", "")
    vp = str(vp_raw) if vp_raw else ""
    cost = info.get("cost", 0)
    has_action = info.get("hasAction", False)
    card_type = info.get("type", "")

    parts = []

    if tags:
        tag_str = "+".join(t[:3] for t in tags)
        parts.append(f"[{tag_str}]")

    prod_pattern = re.findall(
        r'(?:increase|raise)\s+your\s+(\w+)\s+production\s+(\d+)\s+step',
        desc, re.IGNORECASE)
    for res, amount in prod_pattern:
        parts.append(f"+{amount} {res[:4]}-prod")

    dec_pattern = re.findall(
        r'decrease\s+your\s+(\w+)\s+production\s+(\d+)\s+step',
        desc, re.IGNORECASE)
    for res, amount in dec_pattern:
        parts.append(f"-{amount} {res[:4]}-prod")

    tr_match = re.search(r'raise\s+(?:your\s+)?(?:terraform(?:ing)?\s+rating|TR)\s+(\d+)', desc, re.IGNORECASE)
    if tr_match:
        parts.append(f"+{tr_match.group(1)} TR")
    temp_match = re.search(r'raise\s+temperature\s+(\d+)', desc, re.IGNORECASE)
    if temp_match:
        parts.append(f"+{temp_match.group(1)} temp")
    o2_match = re.search(r'raise\s+oxygen\s+(\d+)', desc, re.IGNORECASE)
    if o2_match:
        parts.append(f"+{o2_match.group(1)} O₂")
    venus_match = re.search(r'raise\s+venus\s+(\d+)', desc, re.IGNORECASE)
    if venus_match:
        parts.append(f"+{venus_match.group(1)} Venus")
    if re.search(r'place\s+(?:1\s+|an?\s+)?ocean', desc, re.IGNORECASE):
        parts.append("+ocean")
    if re.search(r'place\s+(?:1\s+|a\s+)?(?:greenery|forest)', desc, re.IGNORECASE):
        parts.append("+greenery")
    if re.search(r'place\s+(?:1\s+|a\s+)?city', desc, re.IGNORECASE):
        parts.append("+city")

    gain_pattern = re.findall(
        r'gain\s+(\d+)\s+(\w+)', desc, re.IGNORECASE)
    for amount, res in gain_pattern:
        if res.lower() not in ('step', 'steps', 'tile', 'tiles', 'tag', 'tags'):
            parts.append(f"+{amount} {res[:5]}")

    draw_match = re.search(r'draw\s+(\d+)\s+card', desc, re.IGNORECASE)
    if draw_match:
        parts.append(f"+{draw_match.group(1)} cards")

    if vp:
        parts.append(f"VP:{vp}")

    if has_action:
        parts.append("(action)")

    return " ".join(parts)


def _build_action_chains(db, req_checker, hand: list[dict], state) -> list[str]:
    """Построить цепочки действий: сыграй X → разблокирует Y → можно Z."""
    chains = []
    hand_names = [c["name"] for c in hand]

    for card in hand:
        name = card["name"]
        ok, reason = req_checker.check(name, state)
        if ok:
            continue
        if not reason:
            continue

        for provider in hand:
            pname = provider["name"]
            if pname == name:
                continue
            pok, _ = req_checker.check(pname, state)
            if not pok:
                continue
            pcost = provider.get("cost", 0)
            if pcost > state.me.mc:
                continue

            pinfo = db.get_info(pname)
            if not pinfo:
                continue
            ptags = [t.lower() for t in pinfo.get("tags", [])]

            m = re.match(r"Нужно (\d+) (\w+) tag", reason)
            if m:
                needed_tag = m.group(2).lower()
                if needed_tag in ptags:
                    chains.append(
                        f"▶ {pname} ({pcost} MC) → разблокирует {name}")
                    break

            pdesc = pinfo.get("description", "")
            if "temp" in reason.lower() and re.search(r'raise\s+temperature', pdesc, re.IGNORECASE):
                chains.append(f"▶ {pname} ({pcost} MC) → +temp → может разблокировать {name}")
                break

    me = state.me
    tableau_names = [c["name"] for c in me.tableau]
    for card in hand:
        name = card["name"]
        ok, _ = req_checker.check(name, state)
        cost = card.get("cost", 0)
        if not ok or cost > me.mc:
            continue
        info = db.get_info(name)
        if not info:
            continue
        card_tags = [t.lower() for t in info.get("tags", [])]

        triggers = []
        for tc in me.tableau:
            tname = tc.get("name", "")
            if tname == "Decomposers" and ("microbe" in card_tags or "animal" in card_tags or "plant" in card_tags):
                triggers.append("Decomposers +microbe")
            elif tname == "Viral Enhancers" and ("plant" in card_tags or "microbe" in card_tags or "animal" in card_tags):
                triggers.append("Viral Enhancers trigger")
            elif tname == "Symbiotic Fungus" and "microbe" in card_tags:
                triggers.append("Symbiotic Fungus +microbe")
            elif tname == "Media Group" and info.get("type") == "event":
                triggers.append("Media Group +3 MC")
            elif tname == "Mars University" and "science" in card_tags:
                triggers.append("Mars Uni: swap card")
            elif tname == "Orbital Cleanup" and "space" in card_tags:
                triggers.append(f"Orbital Cleanup +MC")

        if triggers:
            chains.append(f"⚡ {name} → {', '.join(triggers)}")

    return chains[:8]


def _forecast_requirements(state, req_checker, hand: list[dict]) -> list[str]:
    """Прогноз когда карты из руке станут играбельными."""
    hints = []
    gens_left = _estimate_remaining_gens(state)
    steps_per_gen = 6 if state.is_wgt else 4

    for card in hand:
        name = card["name"]
        ok, reason = req_checker.check(name, state)
        if ok:
            continue

        req = req_checker.get_req(name)
        if not req:
            continue

        r = req.lower().strip()
        gens_needed = None

        m = re.search(r'(-?\d+)\s*[°c]', r)
        if m and "warmer" in r:
            needed_temp = int(m.group(1))
            temp_gap = needed_temp - state.temperature
            if temp_gap > 0:
                gens_needed = max(1, temp_gap // (2 * steps_per_gen // 3 + 1))

        m = re.search(r'(\d+)%', r)
        if m and "oxygen" in r:
            needed_o2 = int(m.group(1))
            o2_gap = needed_o2 - state.oxygen
            if o2_gap > 0:
                gens_needed = max(1, o2_gap // max(1, steps_per_gen // 3))

        m = re.search(r'(\d+)\s+ocean', r)
        if m:
            needed_oceans = int(m.group(1))
            ocean_gap = needed_oceans - state.oceans
            if ocean_gap > 0:
                gens_needed = max(1, ocean_gap // max(1, steps_per_gen // 4))

        m = re.search(r'(\d+)%?\s*venus', r)
        if m:
            needed_venus = int(m.group(1))
            venus_gap = needed_venus - state.venus
            if venus_gap > 0:
                gens_needed = max(1, venus_gap // 3)

        if gens_needed and gens_needed <= gens_left:
            if gens_needed <= 1:
                hints.append(f"⏳ {name}: req скоро ({reason}) — ~этот gen")
            elif gens_needed <= 2:
                hints.append(f"⏳ {name}: req через ~{gens_needed} gen ({reason})")
            else:
                hints.append(f"⌛ {name}: req через ~{gens_needed} gen ({reason})")
        elif gens_needed and gens_needed > gens_left:
            hints.append(f"❌ {name}: req НЕ успеет ({reason}, ~{gens_needed} gen)")

    return hints


def _trade_optimizer(state) -> list[str]:
    """Оптимальный выбор колонии для торговли (делегирует colony_advisor)."""
    from .colony_advisor import format_trade_hints
    return format_trade_hints(state)


def _mc_flow_projection(state) -> list[str]:
    """Прогноз MC flow на следующие 1-2 gen."""
    me = state.me
    hints = []
    gens_left = _estimate_remaining_gens(state)

    income = me.mc_prod + me.tr
    steel_mc = me.steel_prod * me.steel_value
    ti_mc = me.ti_prod * me.ti_value
    total_income = income + steel_mc + ti_mc

    current_mc = me.mc + me.steel * me.steel_value + me.titanium * me.ti_value

    next_gen_mc = current_mc + income

    if gens_left >= 2:
        gen2_mc = next_gen_mc + income
        hints.append(f"💰 MC прогноз: сейчас ~{current_mc} → "
                     f"Gen+1: ~{next_gen_mc} → Gen+2: ~{gen2_mc}"
                     f" (income: {income}/gen, +{steel_mc}st +{ti_mc}ti)")

        avg_card_cost = 15
        cards_affordable = next_gen_mc // avg_card_cost
        if cards_affordable >= 3:
            hints.append(f"   Можешь сыграть ~{cards_affordable} карт (avg {avg_card_cost} MC)")
    else:
        hints.append(f"💰 MC: {current_mc} (+{income}/gen) — LAST GEN, трать всё!")

    return hints


def _safe_title(wf: dict) -> str:
    """Get title from waitingFor safely — title can be str or dict."""
    t = wf.get("title", "")
    return t if isinstance(t, str) else str(t.get("message", t.get("text", "")))


def _extract_wf_card_names(wf: dict) -> str:
    """Extract card names from waitingFor for state deduplication."""
    names = []
    for card in wf.get("cards", []):
        if isinstance(card, dict):
            names.append(card.get("name", ""))
        elif isinstance(card, str):
            names.append(card)
    if not names:
        for opt in wf.get("options", []):
            if isinstance(opt, dict):
                for card in opt.get("cards", []):
                    if isinstance(card, dict):
                        names.append(card.get("name", ""))
                    elif isinstance(card, str):
                        names.append(card)
    return ",".join(sorted(names))


def _should_pass(state, playable, gens_left, phase) -> list[str]:
    """Определить, когда лучше НЕ играть карту (pass/sell patents)."""
    reasons = []
    me = state.me
    mc = me.mc

    if not playable:
        return reasons

    best_score = playable[0][1]
    best_cost = playable[0][3]

    unclaimed = [m for m in state.milestones if not m.get("claimed_by")]
    claimed_count = len(state.milestones) - len(unclaimed)
    if claimed_count < 3:
        for m in unclaimed:
            my_sc = m.get("scores", {}).get(me.color, {})
            if isinstance(my_sc, dict) and my_sc.get("near", False):
                mc_after = mc - best_cost
                if mc_after < 8 and mc >= 8:
                    reasons.append(
                        f"MILESTONE: {m['name']} почти — не трать ниже 8 MC!")
                    break
            elif isinstance(my_sc, dict) and my_sc.get("claimable", False):
                reasons.append(
                    f"MILESTONE: заяви {m['name']} (8 MC = 5 VP) вместо карты!")
                break

    # Award funding — delegated to award_capture (urgency-based)
    from .award_capture import urgent_award_actions
    for ua in urgent_award_actions(state):
        if mc < ua["cost"]:
            continue
        if mc - best_cost < ua["cost"]:
            reasons.append(
                f"AWARD: фондируй {ua['award_name']} ({ua['cost']} MC) — "
                f"{ua['urgency']} лид +{ua['lead']}")
            break

    if state.colonies_data and me.energy >= 3:
        best_col = max(state.colonies_data, key=lambda c: c.get("track", 0))
        if best_col.get("track", 0) >= 4 and me.mc - best_cost < 9:
            reasons.append(
                f"TRADE: {best_col['name']} (track={best_col['track']}) — "
                f"сохрани 9 MC на трейд!")

    if phase == "endgame" and best_score < 70:
        card_data = None
        for cd in (state.cards_in_hand or []):
            if cd.get("name") == playable[0][2]:
                card_data = cd
                break
        if card_data:
            tags = card_data.get("tags", [])
            if "Building" in tags and best_score < 65:
                reasons.append(
                    "TIMING: endgame — production карты уже не отобьются!")

    if best_score < 55 and len(state.cards_in_hand or []) >= 3:
        # Count weak cards by checking each playable card's score
        weak_count = sum(1 for _, sc, _, _ in playable if _score_to_tier(sc) in ("D", "F"))
        if weak_count >= 2:
            reasons.append(
                f"SELL PATENTS: {weak_count} слабых карт в руке — продай за MC!")

    if me.mc_prod >= 8 and mc - best_cost < 3 and phase != "endgame":
        reasons.append(
            f"CASH: MC-prod={me.mc_prod}, не уходи в 0 — "
            f"оставь запас на следующий gen!")

    # Colony trade opportunity cost (detailed)
    if state.colonies_data and me.energy >= 3:
        from .colony_advisor import analyze_trade_options
        trade_result = analyze_trade_options(state)
        if trade_result["trades"]:
            best_trade = trade_result["trades"][0]
            net = best_trade.get("net_profit", 0)
            if net > 5 and best_score < 70:
                mc_after_card = mc - best_cost
                trade_cost = 9
                for method in trade_result.get("methods", []):
                    if method.get("cost_mc", 99) < trade_cost:
                        trade_cost = method["cost_mc"]
                if mc_after_card < trade_cost:
                    reasons.append(
                        f"TRADE: {best_trade['name']} net +{net} MC > "
                        f"карта {playable[0][2]} ({_score_to_tier(best_score)}-{best_score}). "
                        f"Trade выгоднее!")

    # MC reserve for next gen (low income)
    gens_left_check = _estimate_remaining_gens(state)
    income = me.mc_prod + me.tr
    if income < 15 and gens_left_check >= 2 and mc - best_cost < 5:
        reasons.append(
            f"RESERVE: income {income}/gen — оставь 5+ MC запаса!")

    return reasons


def _score_to_tier(score: int) -> str:
    if score >= 90: return "S"
    if score >= 80: return "A"
    if score >= 70: return "B"
    if score >= 55: return "C"
    if score >= 35: return "D"
    return "F"


def _strip_ares_suffix(name: str) -> str:
    """Strip ':ares' suffix from card names (Ares Expansion duplicates)."""
    if name.endswith(":ares"):
        return name[:-5]
    return name


def _parse_wf_card(card_data) -> dict:
    if isinstance(card_data, str):
        return {"name": _strip_ares_suffix(card_data), "tags": [], "cost": 0}
    if isinstance(card_data, dict):
        return {
            "name": _strip_ares_suffix(card_data.get("name", "???")),
            "tags": card_data.get("tags", []),
            "cost": card_data.get("calculatedCost", card_data.get("cost", 0)),
        }
    return {"name": _strip_ares_suffix(str(card_data)), "tags": [], "cost": 0}
