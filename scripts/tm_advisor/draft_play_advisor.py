"""Draft Buy Advisor + Play/Hold Advisor + MC Allocation.

Improvements over base advisor logic:
- Dynamic buy threshold based on MC pressure, phase, hand saturation
- Play/Hold/Sell per-card with opportunity cost analysis
- MC allocation optimization across milestones/awards/trades/cards
- Combo-aware play order: discounts, tag unlocks, trigger chains
- MC sequence simulation: checks if full play sequence is affordable
- Effect-based card value using production/TR/VP/placement data
- Opponent milestone race awareness
"""

import math
import re

from .analysis import (
    _estimate_remaining_gens,
    _score_to_tier,
    _estimate_vp,
    _estimate_hidden_vp_buffer,
    is_game_end_triggered,
)
from .economy import resource_values, game_phase
from .constants import (
    TABLEAU_DISCOUNT_CARDS,
    GLOBAL_EVENTS,
    PARTY_POLICY_ACTIONS_BY_ID,
    CORP_DISCOUNTS,
)


# ═══════════════════════════════════════════════════════════════
# Draft Buy Advice
# ═══════════════════════════════════════════════════════════════

def draft_buy_advice(cards, state, synergy, req_checker) -> dict:
    """Анализ: сколько карт покупать и какие.

    Args:
        cards: list[dict] — карты предложенные для покупки (name, tags, cost)
        state: GameState
        synergy: SynergyEngine
        req_checker: RequirementsChecker
    Returns: dict с buy_list, skip_list, mc_pressure, hand_saturation, hint
    """
    me = state.me
    gens_left = _estimate_remaining_gens(state)
    phase = game_phase(gens_left, state.generation)
    income = me.mc_prod + me.tr
    hand_size = len(state.cards_in_hand or [])
    combo = getattr(synergy, 'combo', None)
    effect_parser = combo.parser if combo else None

    # Opponent milestone pressure: if opponent can claim, we need MC reserve
    opp_milestone_threat = _opponent_milestone_threat(state)

    # Score each card
    scored = []
    for card in cards:
        name = card["name"]
        tags = card.get("tags", [])
        cost_play = card.get("cost", card.get("calculatedCost", 0))
        score = synergy.adjusted_score(
            name, tags, me.corp, state.generation, me.tags, state, context="draft")
        tier = _score_to_tier(score)

        req_ok, req_reason = True, ""
        if req_checker:
            req_ok, req_reason = req_checker.check(name, state)
            if req_ok:
                req_ok, req_reason = req_checker.check_prod_decrease(name, state)

        playability_gens = 0
        if not req_ok:
            playability_gens = _estimate_req_gap(
                req_reason, state, gens_left, effect_parser=effect_parser
            )

        # Future playability bonus: if req will be met in 1-2 gens, boost score
        if not req_ok and 0 < playability_gens <= 2:
            bonus_future = max(0, 3 - playability_gens)  # +2 if 1 gen, +1 if 2
            score += bonus_future

        dead_window_reason = _draft_dead_window_reason(name, state)

        scored.append({
            "name": name, "score": score, "tier": tier,
            "cost_play": cost_play, "req_ok": req_ok,
            "req_reason": req_reason, "playability_gens": playability_gens,
            "tags": tags, "dead_window_reason": dead_window_reason,
        })

    scored.sort(key=lambda c: c["score"], reverse=True)

    # Decide buy/skip for each card
    buy_list = []
    skip_list = []
    total_buy_cost = 0
    mc_remaining = me.mc

    from .action_ordering import ALWAYS_BUY_CARDS, COMBO_PAIRS

    for card in scored:
        # BonelessDota: always-buy cards bypass threshold
        if card["name"] in ALWAYS_BUY_CARDS and mc_remaining >= 3:
            buy_list.append({
                "name": card["name"], "score": card["score"],
                "tier": card["tier"], "cost_play": card["cost_play"],
                "buy_reason": "must-buy (BonelessDota)", "req_ok": card["req_ok"],
                "playability_gens": card.get("playability_gens", 0),
            })
            total_buy_cost += 3
            mc_remaining -= 3
            continue

        # Combo detection: if card completes a known combo, boost
        if state and state.me and state.me.tableau:
            tab_names = {c["name"] if isinstance(c, dict) else str(c) for c in state.me.tableau}
            for (a, b), bonus in COMBO_PAIRS.items():
                if card["name"] == a and b in tab_names:
                    card["score"] += bonus
                elif card["name"] == b and a in tab_names:
                    card["score"] += bonus

        buy_reason, skip_reason = _decide_buy(
            card, phase, gens_left, mc_remaining, income,
            hand_size + len(buy_list), opp_milestone_threat)

        if buy_reason:
            buy_list.append({
                "name": card["name"], "score": card["score"],
                "tier": card["tier"], "cost_play": card["cost_play"],
                "buy_reason": buy_reason, "req_ok": card["req_ok"],
                "playability_gens": card["playability_gens"],
            })
            total_buy_cost += 3
            mc_remaining -= 3
        else:
            skip_list.append({
                "name": card["name"], "score": card["score"],
                "tier": card["tier"], "skip_reason": skip_reason,
            })

    mc_after_buy = me.mc - total_buy_cost

    # MC pressure
    if mc_after_buy >= 20:
        mc_pressure = "comfortable"
    elif mc_after_buy >= 8:
        mc_pressure = "tight"
    else:
        mc_pressure = "critical"

    # Hand saturation (dynamic play rate based on avg card cost)
    total_hand = hand_size + len(buy_list)
    avg_card_cost = 15
    if state.cards_in_hand:
        costs = [c.get("cost", 15) for c in state.cards_in_hand]
        if costs:
            avg_card_cost = max(8, sum(costs) / len(costs))
    # How many cards can we play per gen?
    mc_per_gen = income + me.steel_prod * me.steel_value + me.ti_prod * me.ti_value
    play_rate = max(0.5, mc_per_gen / avg_card_cost)
    gens_to_play = total_hand / play_rate if play_rate > 0 else 999
    if gens_to_play <= gens_left:
        hand_saturation = "ok"
    elif gens_to_play <= gens_left + 2:
        hand_saturation = "full"
    else:
        hand_saturation = "overloaded"

    hint = _build_buy_hint(buy_list, skip_list, mc_after_buy,
                           mc_pressure, hand_saturation, phase)

    return {
        "buy_list": buy_list,
        "skip_list": skip_list,
        "buy_count": len(buy_list),
        "total_buy_cost": total_buy_cost,
        "mc_after_buy": mc_after_buy,
        "mc_pressure": mc_pressure,
        "hand_saturation": hand_saturation,
        "hand_size": hand_size,
        "gens_to_play_all": round(gens_to_play, 1),
        "hint": hint,
    }


def _decide_buy(card, phase, gens_left, mc_remaining, income,
                projected_hand, opp_milestone_threat=False):
    """Решение buy/skip для одной карты. Returns (buy_reason, skip_reason)."""
    score = card["score"]
    cost_play = card["cost_play"]
    req_ok = card["req_ok"]
    playability_gens = card["playability_gens"]
    dead_window_reason = card.get("dead_window_reason", "")

    if dead_window_reason:
        return None, dead_window_reason

    # Hand bloat check: if hand is already overloaded, raise bar significantly
    # projected_hand includes cards already decided to buy this draft
    play_rate_est = max(1, income / 15)  # rough: income / avg card cost
    gens_to_play_hand = projected_hand / play_rate_est if play_rate_est > 0 else 999
    hand_bloated = gens_to_play_hand > gens_left + 1

    if hand_bloated and projected_hand >= 22:
        # Hand is overloaded — only buy truly exceptional cards
        # (tempo 10-12 normal, engine 20-25 normal, up to 40 possible)
        if score < 80:
            return None, f"hand bloat ({projected_hand} cards, ~{gens_to_play_hand:.0f} gen needed)"
        # Score >= 80: still buy but warn
        if not req_ok and playability_gens > gens_left:
            return None, f"req не успеет + hand bloat"

    # MC velocity check: if income is near zero and MC low, can't play cards
    if income <= 5 and mc_remaining <= 10 and score < 80:
        return None, f"MC crunch (income {income}, MC {mc_remaining})"

    if not req_ok and playability_gens > gens_left + 50:
        return None, f"req окно закрыто ({card['req_reason']})"

    # Must-pick: always buy high score cards
    if score >= 75:
        if not req_ok and playability_gens > gens_left:
            return None, f"req не успеет ({card['req_reason']})"
        reason = "must-pick" if score >= 80 else "strong card"
        if not req_ok:
            reason += f", req через ~{playability_gens} gen"
        return reason, None

    # Endgame: skip production cards with low score
    if phase == "endgame" and score < 70:
        return None, "endgame, score < 70"

    # Endgame: only buy if can play this gen
    if phase == "endgame" and cost_play + 3 > mc_remaining:
        return None, "endgame, не хватит MC сыграть"

    # Requirement gap too large
    if not req_ok and playability_gens > 2:
        return None, f"req через ~{playability_gens} gen"

    # Score threshold (dynamic based on income, MC pressure & phase)
    # HIGH INCOME → lower threshold, buy more cards for card throughput
    threshold = 60
    if income >= 40:
        threshold = 50
    elif income >= 30:
        threshold = 53
    elif income >= 22:
        threshold = 56

    if mc_remaining < 12:
        threshold = max(threshold, 65)
    if phase == "late":
        threshold = max(threshold, 63)
    # If opponent threatens milestone, keep MC reserve — raise bar
    if opp_milestone_threat and mc_remaining < 15:
        threshold = max(threshold, 67)

    if score < threshold:
        return None, f"score {score} < {threshold}"

    # Hand overload check (engine builds can have 20-25 cards normally)
    if projected_hand > gens_left * 4 and score < 70:
        return None, "рука переполнена"

    # Can't afford to buy (3 MC)
    if mc_remaining < 3:
        return None, "нет MC на покупку"

    # Buy!
    reason = "good value"
    if not req_ok:
        reason += f", req через ~{playability_gens} gen"
    elif cost_play > mc_remaining - 3 + income:
        reason += ", сыграешь не этот gen"
    else:
        reason += ", сыграешь этот gen"

    return reason, None


def _draft_dead_window_reason(card_name, state):
    """Detect dead draft keeps for cards whose value mostly depends on future windows."""
    if not state or not card_name:
        return ""

    oceans_placed = getattr(state, "oceans", 0)
    oceans_remaining = max(0, 9 - getattr(state, "oceans", 0))

    if card_name == "Arctic Algae":
        if oceans_remaining <= 0:
            return "океаны закончились"
        if oceans_remaining == 1:
            return "остался 1 океан"

    if card_name == "Neptunian Power Consultants":
        if oceans_remaining <= 0:
            return "океаны закончились"
        if oceans_placed >= 4:
            return "уже 4+ океанов"

    return ""


def _normalize_req_resource_name(raw: str) -> str:
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
        "plant": "plant",
        "plants": "plant",
    }
    return aliases.get(key, "")


def _action_resource_gain_this_gen(action: dict, resource_key: str, me) -> int:
    cost_text = str(action.get("cost", "") or "").strip().lower()
    if cost_text not in ("", "free", "0", "0 mc", "0 m€"):
        if "mc" not in cost_text:
            return 0
        m = re.search(r"(\d+)", cost_text)
        if not m or getattr(me, "mc", 0) < int(m.group(1)):
            return 0

    effect_text = str(action.get("effect", "") or "").lower()
    m = re.search(rf"add\s+(\d+)\s+{resource_key}s?\b", effect_text)
    return int(m.group(1)) if m else 0


def _resource_velocity_per_gen(state, resource_key: str, effect_parser=None) -> int:
    if not effect_parser or not resource_key:
        return 0

    me = getattr(state, "me", None)
    if not me:
        return 0

    sources = []
    corp_name = getattr(me, "corp", "") or ""
    if corp_name:
        sources.append(corp_name)
    for card in getattr(me, "tableau", []) or []:
        if isinstance(card, dict):
            name = card.get("name", "")
        else:
            name = str(card)
        if name:
            sources.append(name)

    total = 0
    for name in sources:
        eff = effect_parser.get(name)
        if not eff:
            continue
        for action in eff.actions or []:
            total += _action_resource_gain_this_gen(action, resource_key, me)
    return total


def _estimate_req_gap(req_reason, state, gens_left, effect_parser=None):
    """Estimate how many gens until requirement is met. Returns 0 if unknown."""
    if not req_reason:
        return 0
    reason = req_reason.lower()

    # Max/global-window requirements are irreversible once the track has passed
    # them. Treat them as beyond the remaining game instead of "0 gen away".
    if "max" in reason or "макс" in reason:
        return gens_left + 99

    resource_gap = re.search(
        r'нужно(?:\s+[a-zа-яё]+)?\s+(\d+)\s+([a-zа-яё-]+)\s+\(сейчас\s+(\d+)\)',
        reason,
    )
    if resource_gap:
        need = int(resource_gap.group(1))
        have = int(resource_gap.group(3))
        gap = need - have
        resource_key = _normalize_req_resource_name(resource_gap.group(2))
        if gap > 0 and resource_key:
            velocity = _resource_velocity_per_gen(state, resource_key, effect_parser)
            if velocity <= 0:
                return gens_left + gap
            return max(1, math.ceil(gap / velocity))

    tag_gap = re.search(r'нужно\s+(\d+)\s+([a-zа-яё]+)\s+tag.*есть\s+(\d+)', reason)
    if tag_gap:
        need = int(tag_gap.group(1))
        have = int(tag_gap.group(3))
        gap = need - have
        if gap > 0:
            return max(1, gap)

    m = re.search(r'(\d+)%?\s*o', reason)
    if m and "oxygen" in reason:
        gap = int(m.group(1)) - state.oxygen
        if gap > 0:
            return max(1, math.ceil(gap / 2))

    m = re.search(r'(-?\d+)', reason)
    if m and ("temp" in reason or "°" in reason):
        needed = int(m.group(1))
        gap = needed - state.temperature
        if gap > 0:
            return max(1, math.ceil(gap / 4))

    m = re.search(r'(\d+)\s*ocean', reason)
    if m:
        gap = int(m.group(1)) - state.oceans
        if gap > 0:
            return max(1, math.ceil(gap / 2))

    m = re.search(r'(\d+)%?\s*venus', reason)
    if m:
        gap = int(m.group(1)) - state.venus
        if gap > 0:
            return max(1, math.ceil(gap / 3))

    return 0


def _opponent_milestone_threat(state) -> bool:
    """Check if any opponent can claim an unclaimed milestone."""
    claimed_count = sum(1 for m in state.milestones if m.get("claimed_by"))
    if claimed_count >= 3:
        return False
    me_color = state.me.color
    for m in state.milestones:
        if m.get("claimed_by"):
            continue
        for color, score_info in m.get("scores", {}).items():
            if color == me_color:
                continue
            if isinstance(score_info, dict) and score_info.get("claimable"):
                return True
    return False


# Warning priority prefixes (higher = more important)
_WARNING_PRIORITY = {
    "🏆": 10,   # milestone claimable
    "⏰": 9,    # opponent threat / urgency
    "🔴": 8,    # Reds penalty
    "📤": 7,    # sell suggestion
    "VP": 6,    # VP race
    "💰": 5,    # MC tiebreaker
    "🏗": 4,    # milestone progress
    "📅": 3,    # next gen preview
}

_MAX_WARNINGS = 6


def _dedupe_and_cap_warnings(warnings: list[str]) -> list[str]:
    """Deduplicate similar warnings, prioritize, cap at _MAX_WARNINGS."""
    if not warnings:
        return warnings

    # 1. Exact dedup
    seen = set()
    unique = []
    for w in warnings:
        if w not in seen:
            seen.add(w)
            unique.append(w)

    # 2. Semantic dedup: collapse multiple same-prefix warnings
    #    e.g., multiple "⏰ X может заявить..." → keep first 2
    prefix_counts: dict[str, int] = {}
    deduped = []
    for w in unique:
        # Extract prefix (first emoji or first word)
        prefix = w[:2] if len(w) >= 2 and ord(w[0]) > 127 else w.split()[0]
        count = prefix_counts.get(prefix, 0)
        if count < 2:  # max 2 per prefix category
            deduped.append(w)
            prefix_counts[prefix] = count + 1

    # 3. Sort by priority (highest first)
    def _priority(w: str) -> int:
        for pfx, prio in _WARNING_PRIORITY.items():
            if pfx in w[:10]:
                return prio
        return 1  # default low

    deduped.sort(key=_priority, reverse=True)

    # 4. Cap
    return deduped[:_MAX_WARNINGS]


def _opponent_threats(state) -> list[str]:
    """Predict opponent actions this turn: milestones, awards, trades.

    Returns list of ⏰ urgency warnings.
    """
    threats = []
    me = state.me
    color_names = state.color_names

    # 1. Opponent milestone claims
    claimed_count = sum(1 for m in state.milestones if m.get("claimed_by"))
    if claimed_count < 3:
        for m in state.milestones:
            if m.get("claimed_by"):
                continue
            for color, sc in m.get("scores", {}).items():
                if color == me.color:
                    continue
                if isinstance(sc, dict) and sc.get("claimable"):
                    # Check if opponent can afford (8 MC)
                    opp = next((o for o in state.opponents if o.color == color), None)
                    if opp and opp.mc >= 8:
                        name = color_names.get(color, color)
                        threats.append(
                            f"⏰ {name} может заявить {m['name']}! "
                            f"Claim first или потеряешь слот.")

    # 2. Opponent award funding
    funded = sum(1 for a in state.awards if a.get("funded_by"))
    if funded < 3:
        cost_award = [8, 14, 20][funded]
        for a in state.awards:
            if a.get("funded_by"):
                continue
            for opp in state.opponents:
                if opp.mc < cost_award:
                    continue
                opp_val = a.get("scores", {}).get(opp.color, 0)
                my_val = a.get("scores", {}).get(me.color, 0)
                if opp_val > my_val + 2:
                    name = color_names.get(opp.color, opp.color)
                    threats.append(
                        f"⏰ {name} может фондировать {a['name']} "
                        f"(лидирует {opp_val} vs {my_val})")
                    break  # one per award

    # 3. Opponent colony trades (blocking good tracks)
    if state.colonies_data:
        for opp in state.opponents:
            if opp.energy >= 3 or opp.mc >= 9:
                for col in state.colonies_data:
                    track = col.get("track", 0)
                    if track >= 5:
                        threats.append(
                            f"⏰ {color_names.get(opp.color, '?')} может "
                            f"trade {col['name']} (track {track})")
                        break
                break  # only one opponent warning

    return threats[:5]  # cap at 5


# ═══════════════════════════════════════════════════════════════
# Play/Hold Advice
# ═══════════════════════════════════════════════════════════════

def play_hold_advice(hand, state, synergy, req_checker) -> list[dict]:
    """Для каждой карты в руке: PLAY / HOLD / SELL с приоритетом.

    Args:
        hand: list[dict] — карты в руке
        state: GameState
        synergy: SynergyEngine
        req_checker: RequirementsChecker
    Returns: list[dict] sorted by priority
    """
    me = state.me
    gens_left = _estimate_remaining_gens(state)
    phase = game_phase(gens_left, state.generation)
    rv = resource_values(gens_left)
    end_triggered = is_game_end_triggered(state)

    # Get effect parser for richer card value estimation
    combo = getattr(synergy, 'combo', None)
    effect_parser = combo.parser if combo else None
    db = getattr(synergy, 'db', None)

    # Collect tableau discount cards for effective cost calculation
    tableau_discounts = _collect_tableau_discounts(me.tableau)

    # Reds ruling check
    reds_ruling = (state.turmoil and
                   "Reds" in str(state.turmoil.get("ruling", "")))

    results = []
    for card in hand:
        name = card["name"]
        tags = _merged_card_tags(name, card.get("tags", []), db)
        cost = _card_base_cost(card)
        score = synergy.adjusted_score(
            name, tags, me.corp, state.generation, me.tags, state, context="play")

        # Effective cost considering discounts + steel/titanium payment
        eff_cost, pay_hint = _effective_card_cost(
            card, tags, me, tableau_discounts=tableau_discounts)

        req_ok, req_reason = True, ""
        req_score = score
        if req_checker:
            req_ok, req_reason = req_checker.check(name, state)
            if req_ok:
                req_ok, req_reason = req_checker.check_prod_decrease(name, state)
            req_score, _, _ = req_checker.adjust_score(score, name, state)

        # Can't play: req not met
        if not req_ok:
            gap = _estimate_req_gap(
                req_reason, state, gens_left, effect_parser=effect_parser
            )
            hold_score = min(score, req_score)
            if gap > gens_left:
                results.append(_entry(name, "SELL", f"req не успеет: {req_reason}",
                                      0, 0, 0, 9))
            elif gap <= 1:
                results.append(_entry(name, "HOLD", f"req скоро: {req_reason}",
                                      0, hold_score / 10, 0, 6))
            else:
                results.append(_entry(name, "HOLD", f"req через ~{gap} gen",
                                      0, hold_score / 15, 0, 7))
            continue

        # Can't afford (using effective cost with steel/ti)
        if eff_cost > me.mc:
            results.append(_entry(name, "HOLD", f"нет MC ({eff_cost} MC eff > {me.mc})",
                                  0, score / 10, 0, 7))
            continue

        # Estimate play value now (effect-based when possible)
        play_value = _estimate_card_value_rich(
            name, score, cost, tags, phase, gens_left, rv,
            effect_parser, db, corp_name=me.corp,
            tableau_tags=dict(me.tags) if me.tags else None,
            me=me,
            hand_cards=state.cards_in_hand)
        mc_after = me.mc - eff_cost  # effective cost with steel/ti

        # SELL: low score card (but allow early game speculation)
        if score < 40 and phase != "early":
            results.append(_entry(name, "SELL", f"score {score}, продай за 1 MC",
                                  play_value, 0, eff_cost, 9))
            continue

        # Production in endgame = bad
        is_production = _is_production_card(tags, name, effect_parser=effect_parser, db=db)
        if (is_production and gens_left <= 2 and
                not _has_endgame_immediate_value(name, effect_parser, allow_placement=False)):
            results.append(_entry(name, "SELL", "production в endgame бесполезна",
                                  play_value * 0.2, 0, eff_cost, 9))
            continue

        # Last gen: only play if immediate VP/TR or conversion fuel
        if gens_left <= 1 and not _is_vp_card(name, tags, effect_parser):
            # Check if card gives immediate TR, placement, or resources
            has_immediate_value = _has_endgame_immediate_value(
                name, effect_parser, allow_placement=True
            )
            if not has_immediate_value and score < 70:
                sell_reason = f"last gen: no immediate VP (sell +1 MC)"
                results.append(_entry(name, "SELL", sell_reason,
                                      play_value * 0.1, 0, eff_cost, 9))
                continue

        # Check opportunity costs (using effective MC cost)
        opportunity_cost = _calc_opportunity_cost(state, eff_cost)

        # Milestone danger: don't drop below 8 MC
        has_claimable = _has_claimable_milestone(state)
        if has_claimable and mc_after < 8:
            results.append(_entry(name, "HOLD",
                                  "сначала milestone (8 MC = 5 VP)!",
                                  play_value, play_value * 1.2,
                                  opportunity_cost, 8))
            continue

        # Trade opportunity cost: only preserve MC when an actual MC-paid trade is
        # still available this generation. Energy-paid trades do not compete for MC.
        fleets_left = getattr(me, "trades_this_gen", 0) < getattr(me, "fleet_size", 0)
        needs_mc_for_trade = getattr(me, "energy", 0) < 3 and getattr(me, "mc", 0) >= 9 and mc_after < 9
        if state.colonies_data and fleets_left and needs_mc_for_trade:
            best_track = max((c.get("track", 0) for c in state.colonies_data),
                             default=0)
            if best_track >= 4:
                results.append(_entry(name, "HOLD",
                                      f"trade выгоднее (track {best_track}), сохрани MC",
                                      play_value, play_value * 0.8,
                                      opportunity_cost, 6))
                continue

        # Good card — PLAY (VP race adjustments)
        priority = _play_priority(score, eff_cost, is_production, phase, gens_left)
        play_reason = _play_reason(score, phase, gens_left)
        if pay_hint:
            play_reason += f" ({pay_hint})"

        # Income delta for production cards
        if is_production and effect_parser and gens_left > 1:
            income_delta = _calc_income_delta(name, effect_parser, me)
            if income_delta:
                play_reason += f" [income {income_delta}]"

        # Reds penalty: TR-raising cards are worse under Reds
        if reds_ruling and effect_parser:
            eff_data = effect_parser.get(name)
            if eff_data and (eff_data.tr_gain > 0 or eff_data.placement):
                tr_raises = eff_data.tr_gain + len(eff_data.placement)
                penalty_mc = tr_raises * 7  # each TR raise loses 1 TR = ~7 MC
                play_reason += f" ⛔Reds: -{tr_raises} TR penalty!"
                play_value -= penalty_mc * 0.5  # reduce value
                priority = min(9, priority + 1)  # lower priority

        # Milestone tag boost: if card contributes to a near milestone
        ms_boost = _check_milestone_contribution(name, tags, state, me)
        if ms_boost:
            priority = max(1, priority - 1)
            play_reason += f" 🏆{ms_boost}"

        # VP race: if behind, boost VP cards; if ahead, boost production
        vp_ctx = _vp_race_context(state)
        is_vp_card = _is_vp_card(name, tags, effect_parser)
        if vp_ctx["behind"] and is_vp_card:
            priority = max(1, priority - 1)
            play_reason += " 🏃VP push!"
        elif vp_ctx["ahead"] and is_production and phase in ("late", "endgame"):
            priority = min(9, priority + 1)
            play_reason += " (ahead, low priority)"

        results.append(_entry(name, "PLAY", play_reason,
                              play_value, 0, opportunity_cost, priority))

    # ── Combo-aware play order ──
    play_results = [r for r in results if r["action"] == "PLAY"]
    if len(play_results) >= 2:
        tableau_names = [c["name"] for c in state.me.tableau]
        order_hints = _detect_play_order(
            play_results, hand, state, db, effect_parser, tableau_names)
        rows_by_name = {r["name"]: r for r in results}
        hand_by_name = {c.get("name"): c for c in hand if c.get("name")}

        def target_still_worth_playing(target_name, discount_mc):
            target_row = rows_by_name.get(target_name)
            if not target_row or target_row.get("action") != "PLAY":
                return False
            if gens_left > 3:
                return True
            target_card = hand_by_name.get(target_name, {})
            target_tags = _merged_card_tags(
                target_name, target_card.get("tags", []), db)
            target_eff_cost, _ = _effective_card_cost(
                target_card, target_tags, me, tableau_discounts=tableau_discounts)
            discounted_cost = max(0, target_eff_cost - max(0, discount_mc))
            return _play_sequence_net_value(target_row) - discounted_cost > 0

        for hint in order_hints:
            first_name = hint["play_first"]
            second_name = hint["then_play"]
            reason = hint["reason"]
            mc_saved = hint["mc_saved"]
            if not target_still_worth_playing(second_name, mc_saved):
                continue

            for r in results:
                if r["name"] == first_name and r["action"] == "PLAY":
                    # Scale priority boost by MC saved: -2 for big discounts, -1 for small
                    delta = 2 if mc_saved >= 3 else 1
                    r["priority"] = max(1, r["priority"] - delta)
                    if "play_before" not in r:
                        r["play_before"] = []
                    r["play_before"].append(f"→ {second_name}: {reason}")
                    r["sequence_bonus"] = round(
                        r.get("sequence_bonus", 0) + mc_saved, 1)
                    if "combo:" not in r["reason"]:
                        r["reason"] += f" (combo: play before {second_name})"

    # ── MC budget selection + sequence simulation ──
    # First choose the highest-value PLAY subset that fits current MC budget,
    # then simulate the chosen sequence with steel/ti consumption.
    play_sequence = _select_play_sequence(
        results, hand, me, tableau_discounts, gens_left=gens_left, db=db)
    if len(play_sequence) >= 2:
        mc_sim = me.mc
        steel_sim, ti_sim = me.steel, me.titanium
        for item in play_sequence:
            r = item["row"]
            card_data = item["card"]
            card_tags = _merged_card_tags(
                r.get("name"), card_data.get("tags", []), db)
            card_cost = _card_base_cost(card_data)
            eff, _ = _effective_card_cost(card_data, card_tags, me,
                                          steel_sim, ti_sim,
                                          tableau_discounts=tableau_discounts)
            if eff > mc_sim:
                r["reason"] += f" ⚠️ sequence: {eff} MC eff > {mc_sim} осталось"
                r["action"] = "HOLD"
                r["priority"] = 7
            else:
                # Consume resources in simulation
                tag_set = {t.lower() for t in card_tags}
                if "building" in tag_set and steel_sim > 0:
                    steel_used = min(steel_sim, card_cost // me.steel_value)
                    steel_sim -= steel_used
                if "space" in tag_set and ti_sim > 0:
                    ti_used = min(ti_sim, card_cost // me.ti_value)
                    ti_sim -= ti_used
                mc_sim -= eff

    # ── Event tag-loss warning ──
    # Event (red) cards lose tags after play. Check if this affects milestones/awards.
    for r in results:
        if r["action"] != "PLAY":
            continue
        card_data = next((c for c in hand if c["name"] == r["name"]), {})
        card_tags = card_data.get("tags", [])
        if "Event" not in card_tags:
            continue
        # Event card: tags disappear after play. Check milestone/award impact.
        event_tags = [t for t in card_tags if t != "Event"]
        if not event_tags:
            continue
        # Check if any of these tags are counted in near-claimable milestones
        tag_warning = _check_event_tag_loss(event_tags, state)
        if tag_warning:
            r["reason"] += f" ⚠️{tag_warning}"

    results.sort(key=_result_sort_key)
    return results


# ═══════════════════════════════════════════════════════════════
# MC Allocation Advice
# ═══════════════════════════════════════════════════════════════

def mc_allocation_advice(state, synergy=None, req_checker=None) -> dict:
    """Рекомендация по распределению MC в текущем gen.

    Returns: dict with budget, allocations, mc_reserve, warnings.
    """
    me = state.me
    gens_left = _estimate_remaining_gens(state)
    phase = game_phase(gens_left, state.generation)
    rv = resource_values(gens_left)
    end_triggered = is_game_end_triggered(state)

    budget = me.mc + (me.heat if me.corp == "Helion" else 0)
    allocations = []
    warnings = []
    reds_ruling = (state.turmoil and
                   "Reds" in str(state.turmoil.get("ruling", "")))
    tableau_discounts = _collect_tableau_discounts(me.tableau)

    # VP race context
    vp_ctx = _vp_race_context(state)
    if vp_ctx["behind"] and phase in ("late", "endgame"):
        warnings.append(
            f"VP отставание: {vp_ctx['gap']:+d} от {vp_ctx['leader']} "
            f"({vp_ctx['my_vp']} VP). Приоритет VP-карты и greenery!")
    elif vp_ctx["ahead"] and vp_ctx["gap"] >= 8:
        warnings.append(
            f"Большой безопасный VP лид: +{vp_ctx['gap']} VP. Можно рашить конец!")
    elif (vp_ctx["my_vp"] - vp_ctx["opp_vp_visible"]) >= 8 and vp_ctx["uncertainty"] >= 4:
        warnings.append(
            f"Видимый VP лид большой, но у {vp_ctx['leader']} скрытый потолок высокий "
            f"(риск ~{vp_ctx['uncertainty']} VP). Ускоряй игру без переоценки отрыва.")

    # Milestone progress tracker
    unclaimed = [m for m in state.milestones if not m.get("claimed_by")]
    claimed_count = len(state.milestones) - len(unclaimed)
    if claimed_count < 3:
        for m in unclaimed:
            my_sc = m.get("scores", {}).get(me.color, {})
            if isinstance(my_sc, dict):
                score_val = my_sc.get("score", 0)
                claimable = my_sc.get("claimable", False)
                if not claimable and score_val > 0:
                    # Estimate what's needed — milestone names hint at requirement
                    ms_name = m["name"]
                    _add_milestone_progress(
                        warnings, ms_name, score_val, state, me,
                        hand=state.cards_in_hand, synergy=synergy)

    # 1. Milestones (highest value per MC)
    if claimed_count < 3 and budget >= 8:
        for m in unclaimed:
            my_sc = m.get("scores", {}).get(me.color, {})
            if isinstance(my_sc, dict) and my_sc.get("claimable", False):
                value_mc = 5 * rv["vp"]
                # Check opponent race
                opp_can = False
                for color, info in m.get("scores", {}).items():
                    if color == me.color:
                        continue
                    if isinstance(info, dict) and info.get("claimable"):
                        opp_can = True
                        break
                urgency = " ⚠️ГОНКА!" if opp_can else ""
                allocations.append({
                    "action": f"Claim {m['name']}{urgency}",
                    "cost": 8, "value_mc": round(value_mc),
                    "priority": 1, "type": "milestone",
                })
                if opp_can:
                    warnings.append(
                        f"Milestone {m['name']}: оппонент тоже может заявить!")
                break

    # 2. Awards — delegated to award_capture (urgency-based slot capture)
    from .award_capture import urgent_award_actions
    _URGENCY_PRIORITY = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}
    _URGENCY_VALUE_FACTOR = {"CRITICAL": 1.2, "HIGH": 0.9, "MEDIUM": 0.6}
    for a in state.awards:
        if not a.get("funded_by"):
            continue
        scores_sorted = sorted(
            ((c, v) for c, v in a.get("scores", {}).items()),
            key=lambda x: -x[1])
        if len(scores_sorted) >= 2:
            first_c, first_v = scores_sorted[0]
            _, second_v = scores_sorted[1]
            if first_c == me.color and second_v >= first_v - 1:
                warnings.append(
                    f"Award {a['name']}: тебя могут обойти! "
                    f"Лид всего +{first_v - second_v}")
    for ua in urgent_award_actions(state):
        if budget < ua["cost"]:
            continue
        factor = _URGENCY_VALUE_FACTOR[ua["urgency"]]
        value_mc = round(5 * rv["vp"] * factor)
        label = f"Fund {ua['award_name']} ({ua['urgency']}, лид +{ua['lead']})"
        if ua["urgency"] == "CRITICAL":
            label += " \u26a0\ufe0frisk"
            warnings.append(
                f"Award {ua['award_name']}: LAST SLOT, opp может фондировать — "
                f"фондируй сейчас!")
        elif ua["urgency"] == "HIGH" and ua["lead"] <= 1:
            label += " \u26a0\ufe0frisk"
            warnings.append(
                f"Award {ua['award_name']}: лид тонкий (+{ua['lead']}), фондируй сейчас!")
        allocations.append({
            "action": label,
            "cost": ua["cost"], "value_mc": value_mc,
            "priority": _URGENCY_PRIORITY[ua["urgency"]],
            "type": "award", "urgency": ua["urgency"],
        })

    # 3. Colony trade
    if state.colonies_data and (me.energy >= 3 or budget >= 9):
        from .colony_advisor import analyze_trade_options
        trade_result = analyze_trade_options(state)
        if trade_result["trades"]:
            best = trade_result["trades"][0]
            if best["net_profit"] > 0:
                trade_cost = 9
                for method in trade_result.get("methods", []):
                    if method.get("cost_mc", 99) < trade_cost:
                        trade_cost = method["cost_mc"]
                allocations.append({
                    "action": f"Trade {best['name']}",
                    "cost": trade_cost,
                    "value_mc": best["total_mc"],
                    "priority": 3, "type": "trade",
                })

    # 3b. Colony build (17 MC + card play that allows it, or SP 26 MC)
    if state.colonies_data and budget >= 17 and gens_left >= 3:
        build_advice = _colony_build_decision(state, me, gens_left, rv, phase)
        if build_advice:
            allocations.append(build_advice)

    # 4. Playable cards from hand (with effect-based values)
    combo = getattr(synergy, 'combo', None) if synergy else None
    effect_parser = combo.parser if combo else None
    db = getattr(synergy, 'db', None) if synergy else None

    if state.cards_in_hand and synergy and req_checker:
        for card in state.cards_in_hand:
            name = card["name"]
            tags = _merged_card_tags(name, card.get("tags", []), db)
            eff_cost, _ = _effective_card_cost(
                card, tags, me, tableau_discounts=tableau_discounts)
            score = synergy.adjusted_score(
                name, tags, me.corp, state.generation, me.tags, state)
            req_ok, _ = req_checker.check(name, state)

            if not req_ok or eff_cost > budget:
                continue

            value_mc = _estimate_card_value_rich(
                name, score, eff_cost, tags, phase, gens_left, rv,
                effect_parser, db, corp_name=me.corp,
                tableau_tags=dict(me.tags) if me.tags else None,
                me=me,
                hand_cards=state.cards_in_hand)
            if phase in ("late", "endgame") and value_mc <= eff_cost:
                continue
            priority = _play_priority(score, eff_cost,
                                      _is_production_card(tags, name, effect_parser=effect_parser, db=db),
                                      phase, gens_left)
            allocations.append({
                "action": f"Play {name}",
                "cost": int(eff_cost), "value_mc": round(value_mc),
                "priority": priority, "type": "card",
            })

    # 5. Resource conversions (with timing advice)
    if me.plants >= 8:
        value = round(rv["greenery"])
        # Check: will plant production give another greenery next gen?
        plant_hint = ""
        if me.plants >= 8 and me.plants < 16 and me.plant_prod >= 4 and gens_left >= 2:
            plant_hint = " (hold 1 gen → 2 greeneries next gen?)"
            if me.plant_prod + me.plants - 8 >= 8:
                plant_hint = " → convert now, 2nd greenery next gen"
        # Endgame: always convert
        priority_conv = 2 if phase == "endgame" else 3
        # Reds penalty: greenery raises O2 (or gives VP if maxed)
        if reds_ruling and state.oxygen < 14:
            value -= 7  # lose 1 TR
            plant_hint += " ⛔Reds: -1 TR!"
            priority_conv = min(priority_conv + 1, 6)
        # Behind in VP: greenery = TR + VP, high priority
        if vp_ctx["behind"]:
            priority_conv = max(1, priority_conv - 1)
            plant_hint += " 🏃VP push"
        allocations.append({
            "action": f"Greenery (plants){plant_hint}",
            "cost": 0, "value_mc": max(0, value),
            "priority": priority_conv, "type": "conversion",
        })
    elif me.plants >= 5 and me.plant_prod >= 3 and gens_left >= 1 and not end_triggered:
        # Almost there — note for planning
        plants_next = me.plants + me.plant_prod
        if plants_next >= 8:
            warnings.append(
                f"Plants: {me.plants}+{me.plant_prod} prod → greenery next gen!")

    if me.heat >= 8 and state.temperature < 8:
        value = round(rv["tr"])
        heat_hint = ""
        # If we have heat production and gens left, consider holding
        if me.heat >= 8 and me.heat < 16 and me.heat_prod >= 4 and gens_left >= 2:
            if me.heat_prod + me.heat - 8 >= 8:
                heat_hint = " → convert now, 2nd raise next gen"
        priority_heat = 3
        # Reds penalty for temperature raise
        if reds_ruling:
            value -= 7
            heat_hint += " ⛔Reds: -1 TR!"
            priority_heat = min(priority_heat + 2, 7)
        # Temp close to max: less valuable
        if state.temperature >= 6:
            heat_hint += " (temp almost capped)"
        allocations.append({
            "action": f"Temperature (heat){heat_hint}",
            "cost": 0, "value_mc": max(0, value),
            "priority": priority_heat, "type": "conversion",
        })
    elif (me.heat >= 5 and me.heat_prod >= 3 and state.temperature < 8
          and gens_left >= 1 and not end_triggered):
        heat_next = me.heat + me.heat_prod + me.energy  # energy → heat
        if heat_next >= 8:
            warnings.append(
                f"Heat: {me.heat}+{me.heat_prod} prod → temp raise next gen!")

    # 6. Blue card actions from tableau (with stall value)
    # Count available actions for stall potential
    action_count = 0
    for tc in me.tableau:
        if tc.get("isDisabled"):
            continue
        tname = tc.get("name", "")
        if not effect_parser:
            break
        eff = effect_parser.get(tname)
        if not eff or not eff.actions:
            continue
        for act in eff.actions:
            act_cost_str = act.get("cost", "")
            act_effect_str = act.get("effect", "")
            mc_cost, mc_value = _estimate_action_value(
                act_cost_str, act_effect_str, me, rv, gens_left, source_eff=eff,
                action=act)
            if mc_value > 0:
                action_count += 1
                stall_note = ""
                # Low-value actions are stall plays — mark them
                if mc_value <= 2 and mc_cost == 0:
                    stall_note = " [stall]"
                allocations.append({
                    "action": f"🔵 {tname}: {act_effect_str[:30]}{stall_note}",
                    "cost": mc_cost, "value_mc": round(mc_value),
                    "priority": 4, "type": "action",
                })
                break  # one action per card

    # Stall value summary: if we have many actions, opponents must act first
    if action_count >= 3:
        warnings.append(
            f"Stall advantage: {action_count} blue card actions — "
            f"оппоненты вынуждены действовать первыми!")

    # 7. Turmoil: delegate placement & policy actions
    if state.turmoil:
        turm = state.turmoil
        me_color = me.color

        # Delegate placement (5 MC to lobby, 5+X to party)
        in_lobby = me_color in turm.get("lobby", [])
        if not in_lobby and budget >= 5:
            # Find party where adding delegate gives most benefit
            best_party, best_reason = _best_delegate_target(turm, me_color, state)
            if best_party:
                allocations.append({
                    "action": f"🏛️ Delegate → {best_party}: {best_reason}",
                    "cost": 5, "value_mc": 8,
                    "priority": 4, "type": "turmoil",
                })

        # Policy action (if unused and beneficial). Use the concrete policyId:
        # several parties have passive policies under the same party name.
        ruling = turm.get("ruling", "")
        policy_used = turm.get("policy_used", {}).get(me_color, False)
        if ruling and not policy_used:
            policy_action = _policy_action_allocation(turm, ruling, me)
            if policy_action:
                allocations.append(policy_action)

        # Global event warnings
        coming = turm.get("coming")
        if coming and not end_triggered:
            ev = GLOBAL_EVENTS.get(coming, {})
            if not ev.get("good", True):
                warnings.append(
                    f"🌍 Global Event next gen: {coming} — {ev.get('desc', '?')[:50]}")

        # Reds ruling warning for TR-raising actions
        if ruling and "Reds" in str(ruling):
            warnings.append(
                "⛔ Reds ruling: -1 TR per parameter raise! Avoid unless critical.")

    # 8. Endgame sell-all optimization
    if phase == "endgame" and gens_left <= 1 and state.cards_in_hand and synergy:
        sellable = []
        for card in state.cards_in_hand:
            cname = card["name"]
            ctags = card.get("tags", [])
            cscore = synergy.adjusted_score(
                cname, ctags, me.corp, state.generation, me.tags, state)
            # Cards with no immediate VP value → sell
            is_vp = _is_vp_card(cname, ctags, effect_parser)
            if not is_vp and cscore < 65:
                sellable.append(cname)
        if sellable:
            sell_mc = len(sellable)
            # Check if selling opens a greenery (23 MC SP) or asteroid (14 MC SP)
            total_after_sell = budget + sell_mc
            hint = f"+{sell_mc} MC"
            if total_after_sell >= 23 and budget < 23:
                hint += " → SP Greenery!"
            elif total_after_sell >= 14 and budget < 14:
                hint += " → SP Asteroid!"
            allocations.append({
                "action": f"📤 Sell {len(sellable)} cards ({hint}): "
                          f"{', '.join(sellable[:3])}"
                          f"{'...' if len(sellable) > 3 else ''}",
                "cost": 0, "value_mc": sell_mc,
                "priority": 6, "type": "sell",
            })
        # MC = tiebreaker reminder
        warnings.append(
            "💰 Last gen: MC = тайбрейк! Не трать всё в ноль если гонка плотная.")

    # Sort by priority, then value/cost ratio
    allocations.sort(key=lambda a: (
        a["priority"],
        -(a["value_mc"] / max(1, a["cost"])),
    ))

    # ── MC sequence feasibility check ──
    mc_sim = budget
    feasible_allocs = []
    infeasible_allocs = []
    for a in allocations:
        if a["cost"] <= mc_sim:
            mc_sim -= a["cost"]
            feasible_allocs.append(a)
        else:
            a["action"] += " ❌нет MC"
            infeasible_allocs.append(a)
    allocations = feasible_allocs + infeasible_allocs

    # ── Sell-to-fund: if selling weak cards enables a high-value action ──
    sell_hint = ""
    if state.cards_in_hand and synergy:
        weak_cards = []
        for card in state.cards_in_hand:
            cname = card["name"]
            ctags = card.get("tags", [])
            cscore = synergy.adjusted_score(
                cname, ctags, me.corp, state.generation, me.tags, state)
            if cscore < 45:
                weak_cards.append(cname)
        if weak_cards:
            sell_mc = len(weak_cards)
            # Check if selling unlocks an infeasible high-value action
            for ia in infeasible_allocs:
                if ia["type"] in ("milestone", "trade") and ia["cost"] <= mc_sim + sell_mc:
                    sell_hint = (f"Продай {len(weak_cards)} слабых карт (+{sell_mc} MC)"
                                f" → хватит на {ia['action'].replace(' ❌нет MC', '')}")
                    warnings.append(sell_hint)
                    break

    # ── Opponent threats ──
    warnings.extend(_opponent_threats(state))

    # MC reserve recommendation
    mc_reserve = 0
    reserve_reason = ""
    if phase != "endgame" and gens_left >= 2:
        income_total = me.mc_prod + me.tr
        if income_total < 15:
            mc_reserve = 5
            reserve_reason = "low income, keep buffer"
        elif _opponent_milestone_threat(state) and not any(
                a["type"] == "milestone" for a in allocations):
            mc_reserve = 8
            reserve_reason = "opponent milestone threat, keep 8 MC"
        elif any(a["type"] == "milestone" for a in allocations):
            mc_reserve = 0
            reserve_reason = "milestone takes priority"
    elif phase == "endgame":
        mc_reserve = 0
        reserve_reason = "endgame — spend everything"

    # ── Next gen preview ──
    income_total = me.mc_prod + me.tr
    projected_mc_next = mc_sim + income_total  # MC left + income
    next_gen = None
    if phase != "endgame" and gens_left >= 2:
        next_gen = {
            "income": income_total,
            "projected_mc": projected_mc_next,
            "phase_next": game_phase(gens_left - 1, state.generation + 1),
        }

    # ── Dedupe and cap warnings ──
    warnings = _dedupe_and_cap_warnings(warnings)

    return {
        "budget": budget,
        "allocations": allocations,
        "mc_reserve": mc_reserve,
        "reserve_reason": reserve_reason,
        "warnings": warnings,
        "next_gen": next_gen,
        "vp_race": vp_ctx,
    }


# ═══════════════════════════════════════════════════════════════
# Combo-aware Play Order Detection
# ═══════════════════════════════════════════════════════════════

def _detect_play_order(play_results, hand, state, db, effect_parser,
                       tableau_names):
    """Detect combo-aware play order between PLAY cards in hand.

    Returns list of {play_first, then_play, reason, mc_saved} hints.

    Scenarios:
    1. Card A IS a discount card → card B benefits from discount
    2. Card A's tag triggers tableau card → gives MC that helps play B
    3. Card A provides tag needed for B's tag requirement
    """
    hints = []
    play_names = {r["name"] for r in play_results}

    # Build tag map: card_name → tags
    card_tags_map = {}
    card_costs_map = {}
    for card in hand:
        name = card["name"]
        if name not in play_names:
            continue
        info = db.get_info(name) if db else None
        tags = info.get("tags", []) if info else card.get("tags", [])
        card_tags_map[name] = [t.lower() for t in tags]
        card_costs_map[name] = card.get("cost", card.get("calculatedCost", 0))

    # ── Scenario 1: A is a discount card → B benefits ──
    if effect_parser:
        for a_name in play_names:
            a_eff = effect_parser.get(a_name)
            if not a_eff or not a_eff.discount:
                continue
            for b_name in play_names:
                if b_name == a_name:
                    continue
                b_tags = card_tags_map.get(b_name, [])
                for disc_tag, disc_amount in a_eff.discount.items():
                    disc_key = disc_tag.lower()
                    if disc_key == "all" or disc_key in b_tags:
                        hints.append({
                            "play_first": a_name,
                            "then_play": b_name,
                            "reason": f"-{disc_amount} MC discount",
                            "mc_saved": disc_amount,
                        })
                        break

    # ── Scenario 2: A's tag triggers tableau → gives MC/resources ──
    if effect_parser:
        # Find trigger sources in tableau
        tableau_mc_triggers = []  # [(on_tag, mc_gain, source)]
        for tc in state.me.tableau:
            tname = tc.get("name", "")
            eff = effect_parser.get(tname)
            if not eff:
                continue
            for trig in eff.triggers:
                trigger_text = trig["on"].lower()
                effect_text = trig["effect"].lower()
                if "play" not in trigger_text:
                    continue
                # Estimate MC gain from trigger
                mc_gain = 0
                mc_match = re.search(r'(\d+)\s*(?:mc|m€|megacredit)', effect_text)
                if mc_match:
                    mc_gain = int(mc_match.group(1))
                # Card draw ≈ 3 MC
                card_match = re.search(r'draw\s+(\d+)\s*card', effect_text)
                if card_match:
                    mc_gain += int(card_match.group(1)) * 3
                if mc_gain > 0:
                    tableau_mc_triggers.append((trigger_text, mc_gain, tname))

        # For each pair A, B: if playing A triggers tableau and gives MC,
        # and that MC is needed to afford B → play A first
        for a_name in play_names:
            a_tags = card_tags_map.get(a_name, [])
            a_mc_gain = 0
            trigger_source = ""
            for trigger_text, mc_gain, source in tableau_mc_triggers:
                for tag in a_tags:
                    if tag in trigger_text:
                        a_mc_gain += mc_gain
                        trigger_source = source
                        break
            if a_mc_gain <= 0:
                continue

            a_cost = card_costs_map.get(a_name, 0)
            for b_name in play_names:
                if b_name == a_name:
                    continue
                b_cost = card_costs_map.get(b_name, 0)
                mc_after_a = state.me.mc - a_cost
                # If B is tight on MC and trigger gives enough to help
                if mc_after_a < b_cost and mc_after_a + a_mc_gain >= b_cost:
                    hints.append({
                        "play_first": a_name,
                        "then_play": b_name,
                        "reason": f"trigger {trigger_source} +{a_mc_gain} MC → afford {b_name}",
                        "mc_saved": a_mc_gain,
                    })

    # ── Scenario 3: A provides tag needed for B's tag requirement ──
    if db:
        player_tags = dict(state.me.tags)
        for b_name in play_names:
            b_info = db.get_info(b_name)
            if not b_info:
                continue
            req_text = b_info.get("requirements", "")
            if not req_text:
                continue
            req_str = str(req_text).lower()

            tag_reqs = re.findall(r'(\d+)\s+(\w+)\s+tag', req_str)
            for needed_str, tag_name in tag_reqs:
                needed = int(needed_str)
                tag_key = tag_name.lower()
                current = player_tags.get(tag_key, 0)
                gap = needed - current

                if gap <= 0 or gap > 2:
                    continue

                for a_name in play_names:
                    if a_name == b_name:
                        continue
                    a_tags = card_tags_map.get(a_name, [])
                    if tag_key in a_tags:
                        hints.append({
                            "play_first": a_name,
                            "then_play": b_name,
                            "reason": f"+{tag_key} tag → unlocks req",
                            "mc_saved": 0,
                        })
                        break

    # Deduplicate
    seen = set()
    deduped = []
    for h in hints:
        key = (h["play_first"], h["then_play"])
        reverse = (h["then_play"], h["play_first"])
        if key in seen:
            continue
        if reverse in seen:
            existing = next((x for x in deduped
                             if x["play_first"] == h["then_play"]
                             and x["then_play"] == h["play_first"]), None)
            if existing and h["mc_saved"] > existing["mc_saved"]:
                deduped.remove(existing)
                deduped.append(h)
                seen.discard(reverse)
                seen.add(key)
            continue
        seen.add(key)
        deduped.append(h)

    deduped.sort(key=lambda h: -h["mc_saved"])
    return deduped


# ═══════════════════════════════════════════════════════════════
# Milestone progress helpers
# ═══════════════════════════════════════════════════════════════

# Known milestone thresholds: name → (tag_or_metric, threshold)
_MILESTONE_THRESHOLDS = {
    "Builder": ("Building", 8),
    "Scientist": ("Science", 3),
    "Rim Settler": ("Jovian", 3),
    "Diversifier": ("unique_tags", 8),
    "Tactician": ("req_cards", 5),
    "Ecologist": ("bio_tags", 4),  # Plant+Microbe+Animal
    "Legend": ("Event", 5),
    "Mayor": ("cities", 3),
    "Gardener": ("greeneries", 3),
    "Planner": ("cards_in_hand", 16),
    "Terraformer": ("tr", 35),
    "Generalist": ("prod_types", 6),
    "Specialist": ("max_prod", 10),
    "Benefactor": ("tr", 35),
    "Hoverlord": ("floaters", 7),
    "Energizer": ("energy_prod", 6),
    "Celebrity": ("expensive_cards", 4),  # cards cost 20+
}


def _add_milestone_progress(warnings, ms_name, current_score, state, me,
                            hand=None, synergy=None):
    """Add milestone progress info to warnings if close to claiming."""
    threshold_info = _MILESTONE_THRESHOLDS.get(ms_name)
    if not threshold_info:
        return

    tag_or_metric, threshold = threshold_info
    gap = threshold - current_score
    if gap <= 0 or gap > 3:
        return  # too far or already claimable

    # Find cards in hand that contribute
    contributing = []
    if hand and tag_or_metric not in ("cities", "greeneries", "tr",
                                       "prod_types", "max_prod",
                                       "cards_in_hand", "floaters",
                                       "energy_prod", "unique_tags",
                                       "req_cards", "expensive_cards"):
        # Tag-based milestone
        for card in hand:
            card_tags = [t.lower() for t in card.get("tags", [])]
            target_tag = tag_or_metric.lower()
            if target_tag == "bio_tags":
                if any(t in card_tags for t in ("plant", "microbe", "animal")):
                    contributing.append(card["name"])
            elif target_tag in card_tags:
                contributing.append(card["name"])

    hint = f"🏆 {ms_name}: {current_score}/{threshold} (need {gap} more)"
    if contributing:
        hint += f" — в руке: {', '.join(contributing[:3])}"
    warnings.append(hint)


def _check_milestone_contribution(card_name, card_tags, state, me):
    """Check if a card contributes to a near-claimable milestone.

    Returns milestone hint string or None.
    """
    claimed_count = sum(1 for m in state.milestones if m.get("claimed_by"))
    if claimed_count >= 3:
        return None

    tag_set = {t.lower() for t in card_tags}

    for m in state.milestones:
        if m.get("claimed_by"):
            continue
        ms_name = m["name"]
        my_sc = m.get("scores", {}).get(me.color, {})
        if not isinstance(my_sc, dict):
            continue
        score_val = my_sc.get("score", 0)
        claimable = my_sc.get("claimable", False)
        if claimable:
            continue

        threshold_info = _MILESTONE_THRESHOLDS.get(ms_name)
        if not threshold_info:
            continue
        target, threshold = threshold_info
        gap = threshold - score_val
        if gap <= 0 or gap > 2:
            continue

        # Check if this card's tags match the milestone requirement
        target_lower = target.lower()
        if target_lower == "bio_tags":
            if any(t in tag_set for t in ("plant", "microbe", "animal")):
                return f"→ {ms_name} ({score_val + 1}/{threshold})"
        elif target_lower in tag_set:
            return f"→ {ms_name} ({score_val + 1}/{threshold})"

    return None


# ═══════════════════════════════════════════════════════════════
# Colony helpers
# ═══════════════════════════════════════════════════════════════

def _colony_build_decision(state, me, gens_left, rv, phase):
    """Evaluate if building a colony (17-26 MC) is worthwhile.

    Returns allocation dict or None.
    """
    from .constants import COLONY_TRADE_DATA

    # Can we even build? Need colony with open slots
    my_colonies = me.colonies
    if my_colonies >= 3:  # max 3 colonies per player
        return None

    best_colony = None
    best_value = 0

    for col in state.colonies_data:
        col_name = col["name"]
        settlers = col.get("settlers", [])

        # Skip if already have colony here or full (3 settlers max)
        if me.color in settlers or len(settlers) >= 3:
            continue

        col_data = COLONY_TRADE_DATA.get(col_name, {})
        if not col_data:
            continue

        # Value = colony bonus per trade × expected trades + build bonus
        build_desc = col_data.get("build", "")
        bonus_desc = col_data.get("colony_bonus", "")

        # Estimate build value in MC
        build_value = _estimate_colony_build_value(build_desc, rv, gens_left)
        # Colony bonus per trade × remaining trades (~1 per gen)
        bonus_per_trade = _estimate_colony_bonus_value(bonus_desc, rv)
        expected_trades = min(gens_left, me.fleet_size * gens_left * 0.5)
        total_value = build_value + bonus_per_trade * min(expected_trades, gens_left)

        # Track position advantage: build resets track, increasing trade values
        track_pos = col.get("track", 0)
        track = col_data.get("track", [])
        if track_pos < len(track) and track_pos >= 3:
            # High track = good trade incoming, but building resets it
            total_value -= track[track_pos] * 0.3  # penalty for losing good track

        if total_value > best_value:
            best_value = total_value
            best_colony = col_name

    if best_colony and best_value >= 20:  # worth it if value >= 20 MC
        return {
            "action": f"🏗️ Build colony: {best_colony} (~{round(best_value)} MC value)",
            "cost": 17, "value_mc": round(best_value),
            "priority": 4, "type": "colony_build",
        }

    return None


def _estimate_colony_build_value(build_desc, rv, gens_left):
    """Estimate MC value of colony build bonus."""
    desc = build_desc.lower()
    if "mc-prod" in desc:
        m = re.search(r'\+?(\d+)', desc)
        return int(m.group(1)) * max(1, gens_left - 1) if m else 0
    if "plant-prod" in desc:
        m = re.search(r'\+?(\d+)', desc)
        return int(m.group(1)) * max(1, gens_left - 1) * 1.6 if m else 0
    if "heat-prod" in desc:
        m = re.search(r'\+?(\d+)', desc)
        return int(m.group(1)) * max(1, gens_left - 1) * 0.8 if m else 0
    if "ocean" in desc:
        return rv["ocean"]
    if "card" in desc:
        m = re.search(r'\+?(\d+)', desc)
        return int(m.group(1)) * rv["card"] if m else rv["card"]
    if "steel" in desc:
        m = re.search(r'\+?(\d+)', desc)
        return int(m.group(1)) * rv["steel"] if m else 0
    if "ti" in desc:
        m = re.search(r'\+?(\d+)', desc)
        return int(m.group(1)) * rv["titanium"] if m else 0
    if "energy" in desc:
        m = re.search(r'\+?(\d+)', desc)
        return int(m.group(1)) * 1.5 if m else 0
    if "animal" in desc or "microbe" in desc or "floater" in desc:
        return rv["vp"] * 0.5
    return 5  # fallback


def _estimate_colony_bonus_value(bonus_desc, rv):
    """Estimate MC value of colony trade bonus (per trade)."""
    desc = bonus_desc.lower()
    m = re.search(r'(\d+)', desc)
    amt = int(m.group(1)) if m else 1
    if "mc" in desc:
        return amt
    if "plant" in desc:
        return amt * rv["plant"]
    if "steel" in desc:
        return amt * rv["steel"]
    if "ti" in desc:
        return amt * rv["titanium"]
    if "card" in desc:
        return amt * rv["card"]
    if "energy" in desc:
        return amt * 1.5
    if "heat" in desc:
        return amt * rv["heat"]
    if "animal" in desc or "microbe" in desc or "floater" in desc:
        return rv["vp"] * 0.5
    return 1


# ═══════════════════════════════════════════════════════════════
# Turmoil helpers
# ═══════════════════════════════════════════════════════════════

def _policy_action_allocation(turmoil, party_name, me):
    """Return an actionable policy allocation for the current policyId, if any."""
    policy_id = (turmoil.get("policy_ids") or {}).get(party_name)
    policy = PARTY_POLICY_ACTIONS_BY_ID.get(policy_id)
    if not policy:
        return None

    cost = int(policy.get("cost", 0) or 0)
    heat_cost = int(policy.get("heat_cost", 0) or 0)
    if cost > getattr(me, "mc", 0):
        return None
    if heat_cost > getattr(me, "heat", 0):
        return None

    value_mc = float(policy.get("value_mc", 0) or 0)
    if value_mc <= 0:
        return None

    cost_text = f"{cost} MC" if cost else ""
    if heat_cost:
        cost_text = f"{heat_cost} heat"
    suffix = f" ({cost_text})" if cost_text else ""
    return {
        "action": f"🏛️ Policy: {party_name} — {policy['policy']}{suffix}",
        "cost": cost,
        "value_mc": round(value_mc),
        "priority": 5,
        "type": "turmoil",
        "policy_id": policy_id,
    }


def _party_policy_hint(turmoil, party_name):
    policy_id = (turmoil.get("policy_ids") or {}).get(party_name)
    policy = PARTY_POLICY_ACTIONS_BY_ID.get(policy_id)
    if policy and policy.get("value_mc", 0) > 0:
        return policy.get("policy", "")
    return ""


def _best_delegate_target(turmoil, me_color, state):
    """Find the best party to send a delegate to.

    Returns (party_name, reason) or (None, None).
    """
    parties = turmoil.get("parties", {})
    dominant = turmoil.get("dominant", "")
    best = None
    best_score = 0

    for party_name, party_data in parties.items():
        delegates = party_data.get("delegates", {})
        my_delegates = delegates.get(me_color, 0)
        total = party_data.get("total", 0)
        leader = party_data.get("leader")

        score = 0
        reason = ""

        # Become leader of dominant party → chairman next gen (2 TR)
        if party_name == dominant:
            if leader != me_color and my_delegates + 1 > max(
                    (v for c, v in delegates.items() if c != me_color), default=0):
                score = 15
                reason = "become leader → chairman (2 TR)"
            elif leader == me_color:
                score = 5
                reason = "strengthen lead"

        # If party is close to dominant, push it
        dominant_total = parties.get(dominant, {}).get("total", 0) if dominant else 0
        if total + 1 >= dominant_total and party_name != dominant:
            if party_name != "Reds":
                policy_hint = _party_policy_hint(turmoil, party_name)
                push_reason = f"push to dominant ({policy_hint[:25]})" if policy_hint else "push to dominant"
                score = max(score, 8)
                reason = reason or push_reason

        # Avoid Reds
        if party_name == "Reds":
            score = 0

        if score > best_score:
            best_score = score
            best = (party_name, reason)

    return best if best else (None, None)


# ═══════════════════════════════════════════════════════════════
# VP Race & Card Classification
# ═══════════════════════════════════════════════════════════════

def _vp_race_context(state) -> dict:
    """Lightweight VP race snapshot for play/hold decisions.

    Returns {ahead: bool, behind: bool, gap: int, leader: str}.
    """
    my_vp = _estimate_vp(state)
    best_opp_vp = 0
    visible_opp_vp = 0
    uncertainty = 0
    leader = ""
    for opp in state.opponents:
        visible = _estimate_vp(state, opp)["total"]
        hidden = _estimate_hidden_vp_buffer(opp)
        ovp = visible + hidden
        if ovp > best_opp_vp:
            best_opp_vp = ovp
            visible_opp_vp = visible
            uncertainty = hidden
            leader = opp.name
    gap = my_vp["total"] - best_opp_vp
    return {
        "ahead": gap > 3,
        "behind": gap < -3,
        "gap": gap,
        "my_vp": my_vp["total"],
        "opp_vp_visible": visible_opp_vp,
        "uncertainty": uncertainty,
        "leader": leader,
    }


def _is_vp_card(name, tags, effect_parser=None):
    """Check if a card primarily provides VP (animals, science, VP tokens)."""
    vp_keywords = ("birds", "fish", "livestock", "penguins", "predators",
                   "herbivores", "venusian animals", "small animals",
                   "ecological zone", "physics complex", "search for life",
                   "security fleet", "refugee camp", "protected habitats")
    if name.lower() in vp_keywords:
        return True
    tag_set = {t.lower() for t in tags}
    if "animal" in tag_set:
        return True
    if effect_parser:
        eff = effect_parser.get(name)
        if eff and eff.vp_per:
            return True
    return False


def _check_event_tag_loss(event_tags, state):
    """Check if an event card's tags are needed for milestone/award.

    Returns warning string or None.
    """
    me = state.me
    tag_set = {t.lower() for t in event_tags}
    warnings = []

    # Tag-based milestones on different boards
    tag_milestones = {
        "building": "Builder",
        "science": "Scientist",
        "earth": "Legend",  # only for Elysium
        "plant": "Ecologist", "microbe": "Ecologist",
        "animal": "Ecologist",
        "jovian": "Rim Settler",
    }

    for tag in tag_set:
        ms_name = tag_milestones.get(tag)
        if not ms_name:
            continue
        # Check if this milestone exists and is relevant
        for m in state.milestones:
            if ms_name not in m.get("name", ""):
                continue
            if m.get("claimed_by"):
                continue
            my_sc = m.get("scores", {}).get(me.color, {})
            if isinstance(my_sc, dict):
                score_val = my_sc.get("score", 0)
                claimable = my_sc.get("claimable", False)
                # If we're close to claiming and event tag would disappear
                if claimable:
                    warnings.append(f"event tag {tag} → claim {ms_name} FIRST!")
                elif score_val >= 3:  # close to threshold
                    warnings.append(f"event {tag} tag lost after play")

    # Tag-based awards (Scientist = science tags, etc.)
    for a in state.awards:
        if a.get("funded_by") is None:
            continue
        my_val = a.get("scores", {}).get(me.color, 0)
        opp_max = max((v for c, v in a.get("scores", {}).items()
                       if c != me.color), default=0)
        # If event tag contributes to a funded award we're winning
        if my_val > opp_max and my_val - opp_max <= 1:
            for tag in tag_set:
                if tag in a.get("name", "").lower():
                    warnings.append(f"event {tag} tag → award {a['name']} лид тонкий!")

    return "; ".join(warnings) if warnings else None


# ═══════════════════════════════════════════════════════════════
# Internal helpers
# ═══════════════════════════════════════════════════════════════

def _collect_tableau_discounts(tableau) -> dict:
    """Collect accumulated discounts from tableau cards.

    Returns {tag_or_all: total_discount_amount}.
    E.g. Earth Office + Earth Catapult → {"Earth": 3, "all": 2}
    """
    discounts = {}
    tableau_names = {c.get("name", "") for c in tableau}
    for card_name, card_discs in TABLEAU_DISCOUNT_CARDS.items():
        if card_name in tableau_names:
            for tag, amount in card_discs.items():
                discounts[tag] = discounts.get(tag, 0) + amount
    return discounts

def _card_has_server_calculated_cost(card: dict) -> bool:
    return bool(card.get("cost_is_calculated")) or card.get("calculated_cost") is not None


def _card_base_cost(card: dict) -> int:
    if _card_has_server_calculated_cost(card):
        return int(card.get("calculated_cost", card.get("cost", 0)) or 0)
    return int(card.get("cost", card.get("calculatedCost", 0)) or 0)


def _effective_card_cost(card: dict, tags, me, steel_override=None, ti_override=None,
                         tableau_discounts=None):
    """Effective payable MC for a card row.

    Server `calculatedCost` already includes card/corp/tableau discounts. We may
    still spend steel/titanium, but must not apply discounts a second time.
    """
    base_cost = _card_base_cost(card)
    apply_discounts = not _card_has_server_calculated_cost(card)
    return _effective_cost(
        base_cost,
        tags,
        me,
        steel_override=steel_override,
        ti_override=ti_override,
        tableau_discounts=tableau_discounts if apply_discounts else None,
        apply_discounts=apply_discounts,
    )


def _tableau_resources(me, card_name: str) -> int:
    total = 0
    for card in getattr(me, "tableau", []) or []:
        if not isinstance(card, dict):
            continue
        if card.get("isDisabled"):
            continue
        if card.get("name") != card_name:
            continue
        total += int(card.get("resources", 0) or 0)
    return total


def _effective_cost(printed_cost, tags, me, steel_override=None, ti_override=None,
                    tableau_discounts=None, apply_discounts=True):
    """Calculate effective MC cost after discounts, steel/titanium payment.

    Returns (eff_mc_cost, pay_hint_str).
    Applies: 1) Tableau discounts (Earth Office, etc.), 2) Titanium, 3) Steel.
    """
    tag_set = {t.lower() for t in tags}
    steel = steel_override if steel_override is not None else me.steel
    ti = ti_override if ti_override is not None else me.titanium
    remaining = printed_cost
    hints = []

    if apply_discounts:
        # 0. Credicor: +4 MC rebate for cards costing 20+ MC
        if me.corp == "Credicor" and printed_cost >= 20:
            remaining -= 4
            hints.append("-4 Credicor")

        # 0a. Corp-based tag discounts (Teractor -3 Earth, Thorgate -3 Power)
        # Supports Merger variant: scans tableau for secondary corps with discounts.
        corps_in_play = {me.corp}
        for card in me.tableau:
            cname = card.get("name", "") if isinstance(card, dict) else ""
            if cname in CORP_DISCOUNTS:
                corps_in_play.add(cname)
        corp_disc_total = 0
        corp_disc_hint = None
        for corp in corps_in_play:
            corp_discs = CORP_DISCOUNTS.get(corp, {})
            for disc_tag, disc_amount in corp_discs.items():
                if disc_tag.lower() in tag_set:
                    # Each corp can apply its discount once; take max if same tag
                    # from multiple corps (shouldn't stack same tag discount)
                    if disc_amount > corp_disc_total:
                        corp_disc_total = disc_amount
                        corp_disc_hint = f"-{disc_amount} {corp[:8]}"
        if corp_disc_total > 0:
            apply = min(corp_disc_total, remaining)
            remaining -= apply
            hints.append(corp_disc_hint)

        # 1. Tableau discounts (from TABLEAU_DISCOUNT_CARDS in constants)
        if tableau_discounts:
            total_disc = 0
            for disc_tag, disc_amount in tableau_discounts.items():
                disc_key = disc_tag.lower()
                if disc_key == "all" or disc_key in tag_set:
                    total_disc += disc_amount
            if total_disc > 0:
                total_disc = min(total_disc, remaining)  # can't go below 0
                remaining -= total_disc
                hints.append(f"-{total_disc} discount")

    # 2. Titanium (higher value, use first for Space cards)
    if "space" in tag_set and ti > 0 and me.ti_value > 0:
        ti_usable = min(ti, remaining // me.ti_value)
        if ti_usable > 0:
            ti_mc = ti_usable * me.ti_value
            remaining -= ti_mc
            hints.append(f"{ti_usable} ti={ti_mc} MC")

    # 3. Steel (for Building cards)
    if "building" in tag_set and steel > 0 and me.steel_value > 0:
        steel_usable = min(steel, remaining // me.steel_value)
        if steel_usable > 0:
            steel_mc = steel_usable * me.steel_value
            remaining -= steel_mc
            hints.append(f"{steel_usable} steel={steel_mc} MC")

    # 4. Card-stored payment resources.
    if "plant" in tag_set and remaining > 0:
        microbes = _tableau_resources(me, "Psychrophiles")
        microbes_usable = min(microbes, (remaining + 1) // 2)
        if microbes_usable > 0:
            microbe_mc = min(remaining, microbes_usable * 2)
            remaining -= microbe_mc
            hints.append(f"{microbes_usable} Psychrophiles microbes={microbe_mc} MC")

    if "venus" in tag_set and remaining > 0:
        floaters = _tableau_resources(me, "Dirigibles")
        floaters_usable = min(floaters, (remaining + 2) // 3)
        if floaters_usable > 0:
            floater_mc = min(remaining, floaters_usable * 3)
            remaining -= floater_mc
            hints.append(f"{floaters_usable} Dirigibles floaters={floater_mc} MC")

    # 5. Helion: spend heat as MC
    if me.corp == "Helion" and remaining > 0 and me.heat > 0:
        heat_usable = min(me.heat, remaining)
        if heat_usable > 0:
            remaining -= heat_usable
            hints.append(f"{heat_usable} heat=MC")

    pay_hint = ", ".join(hints) if hints else ""
    return remaining, pay_hint


def _estimate_action_value(cost_str, effect_str, me, rv, gens_left, source_eff=None, action=None):
    """Estimate MC cost and value of a blue card action.

    Returns (mc_cost, mc_value).
    """
    if isinstance(action, dict) and action.get("conditional"):
        return 0, 0

    cost_str = str(cost_str).lower()
    effect_str = str(effect_str).lower()
    mc_cost = 0
    mc_value = 0
    is_free_action = cost_str in ("", "free", "0", "0 mc", "0 m€")

    # Parse cost
    mc_m = re.search(r'(\d+)\s*(?:mc|m€|megacredit)', cost_str)
    if mc_m:
        mc_cost = int(mc_m.group(1))
    if "energy" in cost_str and "production" in cost_str:
        en_m = re.search(r'(\d+)\s*energy', cost_str)
        en_needed = int(en_m.group(1)) if en_m else 1
        if getattr(me, "energy_prod", 0) < en_needed:
            return 0, 0
    elif "energy" in cost_str:
        en_m = re.search(r'(\d+)\s*energy', cost_str)
        en_needed = int(en_m.group(1)) if en_m else 1
        if me.energy < en_needed:
            return 0, 0  # can't afford
    if "heat" in cost_str:
        heat_m = re.search(r'(\d+)\s*heat', cost_str)
        heat_needed = int(heat_m.group(1)) if heat_m else 1
        if getattr(me, "heat", 0) < heat_needed:
            return 0, 0
    if "titanium" in cost_str:
        return 0, 0  # too rare to recommend spending

    # Parse value
    has_direct_payoff = False
    mc_m = re.search(r'(\d+)\s*(?:mc|m€|megacredit)', effect_str)
    if mc_m:
        mc_value += int(mc_m.group(1))
        has_direct_payoff = True

    if "tr" in effect_str and "raise" in effect_str:
        mc_value += rv["tr"]
        has_direct_payoff = True
    if "raise" in effect_str and any(track in effect_str for track in ("oxygen", "temperature", "venus")):
        mc_value += rv["tr"]
        has_direct_payoff = True

    if "card" in effect_str and "draw" in effect_str:
        card_m = re.search(r'(\d+)\s*card', effect_str)
        draw_value = int(card_m.group(1)) * rv["card"] if card_m else rv["card"]
        if gens_left <= 1:
            draw_value = 0.8 if is_free_action and mc_cost == 0 else 0
        elif gens_left == 2:
            draw_value *= 0.45
        mc_value += draw_value
    if "vp" in effect_str or "victory" in effect_str:
        vp_m = re.search(r'(\d+)\s*(?:vp|victory)', effect_str)
        mc_value += int(vp_m.group(1)) * rv["vp"] if vp_m else rv["vp"]
        has_direct_payoff = True

    resource_add = re.search(
        r'add\s+(\d+)\s+(animal|microbe|floater|science|fighter|data|resource)',
        effect_str,
    )
    if resource_add:
        amount = int(resource_add.group(1))
        if (source_eff and getattr(source_eff, "resource_holds", False)
                and getattr(source_eff, "vp_per", None)
                and "resource" in str(source_eff.vp_per.get("per", "")).lower()):
            per_text = str(source_eff.vp_per.get("per", "")).lower()
            per_match = re.search(r'(\d+)\s+resource', per_text)
            per_amount = int(per_match.group(1)) if per_match else 1
            mc_value += amount * (rv["vp"] / max(1, per_amount))
        elif gens_left <= 1 and not has_direct_payoff:
            mc_value += 0.8 if is_free_action and mc_cost == 0 else 0
        else:
            # Resource accumulation → future VP/engine value
            mc_value += amount * rv["vp"] * 0.5
    if "production" in effect_str or "prod" in effect_str:
        if gens_left <= 1:
            mc_value += 0
        elif gens_left == 2:
            mc_value += 1.5
        else:
            mc_value += 3  # rough production boost value

    return mc_cost, mc_value


def _entry(name, action, reason, play_value_now, hold_value,
           opportunity_cost, priority):
    return {
        "name": name,
        "action": action,
        "reason": reason,
        "play_value_now": round(play_value_now, 1),
        "hold_value": round(hold_value, 1),
        "opportunity_cost": round(opportunity_cost, 1),
        "priority": priority,
    }


def _play_sequence_net_value(entry):
    """MC-equivalent value of including a card in this gen's play line."""
    return (
        float(entry.get("play_value_now", 0) or 0)
        + float(entry.get("sequence_bonus", 0) or 0)
        - float(entry.get("opportunity_cost", 0) or 0)
    )


def _play_sequence_utility(entry):
    """Integer utility for budget selection; priority is only a tiebreak."""
    priority = int(entry.get("priority", 9) or 9)
    priority_bonus = max(0, 10 - priority) * 2
    return int(round(_play_sequence_net_value(entry) * 10)) + priority_bonus


def _select_budget_best_entries(candidates, budget):
    """Pick the highest-value subset under the current MC budget."""
    if not candidates:
        return set()

    cap = max(0, int(budget))
    n = len(candidates)
    dp = [[0] * (cap + 1) for _ in range(n + 1)]
    take = [[False] * (cap + 1) for _ in range(n + 1)]

    for i, candidate in enumerate(candidates, start=1):
        weight = int(candidate["sequence_cost"])
        utility = int(candidate["utility"])
        for mc in range(cap + 1):
            best = dp[i - 1][mc]
            if weight <= mc:
                with_card = dp[i - 1][mc - weight] + utility
                if with_card > best:
                    dp[i][mc] = with_card
                    take[i][mc] = True
                    continue
            dp[i][mc] = best

    chosen = set()
    mc = cap
    for i in range(n, 0, -1):
        if not take[i][mc]:
            continue
        chosen.add(candidates[i - 1]["index"])
        mc -= int(candidates[i - 1]["sequence_cost"])
    return chosen


def _play_sequence_sort_key(candidate):
    row = candidate["row"]
    return (
        row.get("priority", 9),
        -_play_sequence_net_value(row),
        -float(row.get("play_value_now", 0) or 0),
        int(candidate["sequence_cost"]),
        row.get("name", ""),
    )


def _select_play_sequence(results, hand, me, tableau_discounts, gens_left=None, db=None):
    """Choose the best affordable PLAY subset before detailed simulation."""
    hand_by_name = {}
    for card in hand:
        name = card.get("name")
        if name and name not in hand_by_name:
            hand_by_name[name] = card

    candidates = []
    for idx, row in enumerate(results):
        if row.get("action") != "PLAY":
            continue
        card = hand_by_name.get(row.get("name"), {})
        tags = _merged_card_tags(row.get("name"), card.get("tags", []), db)
        eff_cost, _ = _effective_card_cost(
            card, tags, me, tableau_discounts=tableau_discounts)
        net_value = _play_sequence_net_value(row)
        if gens_left is not None and gens_left <= 3 and net_value - eff_cost <= 0:
            row["reason"] = (
                f"net value below cost ({net_value:.1f} value vs {eff_cost:g} MC eff)"
            )
            row.pop("play_before", None)
            row.pop("sequence_bonus", None)
            row["action"] = "HOLD"
            row["priority"] = min(9, max(7, row.get("priority", 7) + 2))
            continue
        candidates.append({
            "index": idx,
            "row": row,
            "card": card,
            "sequence_cost": int(eff_cost),
            "utility": _play_sequence_utility(row),
        })

    chosen = _select_budget_best_entries(candidates, me.mc)
    if not chosen:
        return []

    for candidate in candidates:
        if candidate["index"] in chosen:
            continue
        row = candidate["row"]
        row["reason"] += " ⚠️ budget line: сильнейший набор карт этого gen тратит MC в другом порядке"
        row["action"] = "HOLD"
        row["priority"] = min(9, max(6, row.get("priority", 7) + 2))

    selected = [c for c in candidates if c["index"] in chosen]
    selected.sort(key=_play_sequence_sort_key)
    return selected


_TRIGGER_TAGS = (
    "science", "earth", "building", "space", "jovian", "venus",
    "plant", "animal", "microbe", "power", "city", "event",
    "moon", "mars",
)


def _extract_trigger_tags(trigger_text: str) -> list[str]:
    low = (trigger_text or "").lower()
    tags = []
    for tag in _TRIGGER_TAGS:
        if re.search(rf"\b{re.escape(tag)}\b(?:\s+tag|\s*,|\s+or\b|\s+and\b)", low):
            tags.append(tag)
    return tags


def _count_hand_tag_matches(hand_cards, target_tag: str, skip_name: str = "", db=None) -> int:
    if not hand_cards or not target_tag:
        return 0
    count = 0
    for card in hand_cards:
        if isinstance(card, dict):
            name = card.get("name", "")
            if name == skip_name:
                continue
            raw_tags = card.get("tags")
            if raw_tags:
                tags = [str(tag).lower() for tag in raw_tags]
            elif db and name:
                info = db.get_info(name) or {}
                tags = [str(tag).lower() for tag in info.get("tags", []) or []]
            else:
                tags = []
        else:
            name = str(card)
            if name == skip_name:
                continue
            info = db.get_info(name) if db and name else {}
            tags = [str(tag).lower() for tag in info.get("tags", []) or []]
        if target_tag in tags:
            count += 1
    return count


def _estimate_standard_project_hits(gens_left: int) -> int:
    if gens_left >= 7:
        return 3
    if gens_left >= 4:
        return 2
    if gens_left >= 2:
        return 1
    return 0


def _estimate_trigger_hits(trig, card_name, card_tags, gens_left,
                           tableau_tags=None, hand_cards=None, db=None):
    trigger_text = (trig.get("on", "") or "").lower()
    trigger_tags = _extract_trigger_tags(trigger_text)
    current_tags = {str(tag).lower() for tag in (card_tags or [])}
    self_marker = bool(trig.get("self"))
    includes_self = self_marker and (
        not trigger_tags or any(tag in current_tags for tag in trigger_tags)
    )

    if "standard project" in trigger_text:
        return _estimate_standard_project_hits(gens_left)

    if not trigger_tags:
        return 1 if includes_self else 0

    max_future_hits = max(0, gens_left - (1 if includes_self else 0))
    future_hits = min(
        sum(
            _count_hand_tag_matches(hand_cards, trigger_tag, skip_name=card_name, db=db)
            for trigger_tag in trigger_tags
        ),
        max_future_hits,
    )

    if future_hits <= 0 and tableau_tags:
        shell_count = max(tableau_tags.get(trigger_tag, 0) for trigger_tag in trigger_tags)
        if shell_count >= 5 and gens_left >= 4:
            future_hits = min(2, max_future_hits)
        elif shell_count >= 2 and gens_left >= 4:
            future_hits = min(1, max_future_hits)

    return future_hits + (1 if includes_self else 0)


def _resource_vp_token_value(eff, rv) -> float:
    if not eff or not getattr(eff, "vp_per", None):
        return 0.0
    per = str(eff.vp_per.get("per", "") or "").lower()
    if "resource" not in per:
        return 0.0
    amount = float(eff.vp_per.get("amount", 1) or 1)
    divisor_match = re.search(
        r"(\d+(?:\.\d+)?)\s+(?:resources?|animals?|microbes?|floaters?|data|asteroids?|fighters?)",
        per,
    )
    divisor = float(divisor_match.group(1)) if divisor_match else 1.0
    if divisor <= 0:
        divisor = 1.0
    return amount * rv["vp"] / divisor


def _self_resource_action_rate(eff) -> float:
    if not eff or not getattr(eff, "actions", None):
        return 0.0
    rate = 0.0
    for act in eff.actions:
        if act.get("conditional"):
            continue
        effect_text = (act.get("effect", "") or "").lower()
        if "to this card" not in effect_text and "here" not in effect_text:
            continue
        add_match = re.search(r"add\s+(?:(\d+)|an?|one)\s+(microbe|animal|floater|data|resource)", effect_text)
        if add_match:
            rate += float(add_match.group(1) or 1)
    return rate


def _is_resource_vp_without_self_action(eff) -> bool:
    if not eff or not getattr(eff, "vp_per", None):
        return False
    per = str(eff.vp_per.get("per", "") or "").lower()
    return "resource" in per and _self_resource_action_rate(eff) <= 0


def _trigger_effect_value(trig, eff, card_name, card_tags, gens_left, rv,
                          tableau_tags=None, hand_cards=None, db=None):
    effect_text = (trig.get("effect", "") or "").lower()
    total_hits = _estimate_trigger_hits(
        trig, card_name, card_tags, gens_left,
        tableau_tags=tableau_tags,
        hand_cards=hand_cards,
        db=db,
    )
    if total_hits <= 0:
        return 0.0

    resource_token_value = _resource_vp_token_value(eff, rv)
    if resource_token_value > 0 and (
        "to this card" in effect_text or "on this card" in effect_text or "here" in effect_text
    ):
        add_match = re.search(
            r"(?:add|put)\s+(?:(\d+)|an?|one)\s+(microbe|animal|floater|data|resource)",
            effect_text,
        )
        if add_match:
            amount = float(add_match.group(1) or 1)
            return total_hits * amount * resource_token_value * 0.9

    if "draw" in effect_text and "card" in effect_text:
        draw_value = rv["card"]

        # Olympus Conference-style engines turn every ~2 triggers into a real card,
        # but leftover science on the card still carries future option value.
        if "remove" in effect_text and eff.resource_holds:
            return total_hits * 0.5 * draw_value * 0.9

        # Mars University-style filtering needs discard fodder, so discount it.
        if "discard" in effect_text:
            return total_hits * draw_value * 0.65

        # Point Luna-style pure draw triggers are close to full card value.
        may_discount = 0.9 if "may" in effect_text else 1.0
        return total_hits * draw_value * may_discount

    mc_match = re.search(r'gain\s+(\d+)\s*m[c€$]', effect_text)
    if mc_match:
        return total_hits * int(mc_match.group(1)) * 0.9

    discount_match = re.search(r'pay\s+(\d+)\s*m[€c]\s+less', effect_text)
    if discount_match and trigger_tag:
        return total_hits * int(discount_match.group(1)) * 0.9

    return 0.0


def _estimate_card_value_rich(name, score, cost, tags, phase, gens_left, rv,
                              effect_parser=None, db=None, corp_name="",
                              tableau_tags=None, me=None, hand_cards=None):
    """Effect-based MC-value estimation. Falls back to score heuristic."""
    # Try effect-based estimation first
    if effect_parser:
        eff = effect_parser.get(name)
        if eff:
            value = _value_from_effects(eff, gens_left, rv, phase,
                                        corp_name=corp_name,
                                        card_cost=cost,
                                        tableau_tags=tableau_tags,
                                        me=me,
                                        card_name=name,
                                        card_tags=tags,
                                        hand_cards=hand_cards,
                                        db=db)
            # Late-game penalty for engine/draw cards that won't pay off
            if value > 0 and gens_left <= 3:
                value *= _late_game_engine_multiplier(eff, gens_left)
            if value > 0:
                return value
            if _is_resource_vp_without_self_action(eff):
                return max(0.0, value)

    # Fallback: score heuristic (with late-game engine penalty for high-score cards)
    return _estimate_card_value(score, cost, tags, phase, gens_left, rv)


def _late_game_engine_multiplier(eff, gens_left: int) -> float:
    """Penalty multiplier for engine/draw/active cards in endgame.

    Cards that need multiple gens to pay off (active abilities, draw engines,
    resource accumulators) lose value sharply when gens_left <= 3. Cards
    with direct immediate value (TR, static VP, production boost, placement)
    are NOT penalized — they're still useful in endgame.

    Returns: multiplier in [0.25, 1.0] range.
    1.0 = no penalty, 0.25 = severe penalty (-75% value).
    """
    # Direct immediate value — no penalty
    has_direct_tr = bool(eff.tr_gain)
    has_prod_boost = any(amt > 0 for amt in eff.production_change.values())
    has_static_vp = eff.vp_per and "resource" not in str(eff.vp_per.get("per", "")) \
                    and "tag" not in str(eff.vp_per.get("per", ""))
    has_placement = bool(eff.placement)
    has_immediate_gains = bool(eff.gains_resources)
    has_immediate_draw = bool(eff.draws_cards)  # card draw is always valuable

    if (has_direct_tr or has_prod_boost or has_static_vp or has_placement
            or has_immediate_gains or has_immediate_draw):
        return 1.0  # direct-value card, no penalty

    # Engine-only cards: actions with no immediate payoff
    has_actions = bool(eff.actions)
    has_draw_engine = bool(eff.draws_cards)
    has_resource_adder = any(
        add.get("target") in ("any", "another")
        for add in eff.adds_resources
    )
    has_tag_scaling_vp = eff.vp_per and "tag" in str(eff.vp_per.get("per", ""))
    has_resource_vp = eff.vp_per and "resource" in str(eff.vp_per.get("per", ""))

    is_engine_card = (has_actions or has_draw_engine or has_resource_adder
                     or has_resource_vp)

    if not is_engine_card:
        # Some other card type we didn't classify — be conservative
        return 0.9 if not has_tag_scaling_vp else 1.0

    # Resource-per-VP cards (Penguins, Stratospheric Birds, Tardigrades, etc.)
    # maintain value в late game — proven 4-9 VP payoff через accumulated resources.
    # Softer penalty than pure action engines.
    if has_resource_vp:
        resource_penalties = {1: 0.55, 2: 0.75, 3: 0.90}
        return resource_penalties.get(gens_left, 1.0)

    # Pure engine/draw/action card (no resource-VP tie) — harsh penalty
    # At gens_left=3: 60% value (card gets ~1-2 uses)
    # At gens_left=2: 40% value
    # At gens_left=1: 25% value (basically useless)
    penalties = {1: 0.25, 2: 0.40, 3: 0.60}
    return penalties.get(gens_left, 1.0)


def _value_from_effects(eff, gens_left, rv, phase, has_colonies=False, corp_name="", card_cost=0,
                        tableau_tags=None, me=None, card_name="", card_tags=None,
                        hand_cards=None, db=None):
    """Calculate MC-value from CardEffect data."""
    value = 0

    # Production multipliers (centralized, matching economy.py)
    _PROD_MULT = {
        "mc": 1.0, "steel": 1.6, "titanium": 2.5,
        "plant": 1.6, "energy": 2.0, "heat": 0.8,
    }

    # Production value: each point × remaining gens (minus 1 for setup)
    prod_remaining = max(0, gens_left - 1)
    for res, amount in eff.production_change.items():
        if amount <= 0:
            continue
        mult = _PROD_MULT.get(res, 1.0)
        value += amount * mult * prod_remaining

    # TR
    if eff.tr_gain:
        value += eff.tr_gain * rv["tr"]

    # Placements (including estimated placement bonuses)
    for p in eff.placement:
        if p == "ocean":
            value += rv["ocean"]
            value += 4  # average placement bonus (2 MC adj × ~2 adjacent tiles)
        elif p == "greenery":
            value += rv["greenery"]
            value += 2  # average placement bonus (plants, adj to own city)
        elif p == "city":
            value += rv["tr"] + 5  # TR + adjacency potential (~2 adj greeneries mid-game)
            value += 3  # average placement bonus (steel, plants, cards on good spots)
        elif p == "special":
            value += 3  # special tiles (Nuclear Zone, etc.) — placement bonus only

    # Card draw
    if eff.draws_cards:
        value += eff.draws_cards * rv["card"]

    # Immediate resource gains
    for res, amount in eff.gains_resources.items():
        res_val = {
            "mc": 1.0, "steel": rv["steel"], "titanium": rv["titanium"],
            "plant": rv["plant"], "heat": rv["heat"],
        }.get(res, 1.0)
        value += amount * res_val

    # Trigger engines that pay off from future tag plays (Olympus Conference,
    # Mars University, Point Luna, etc.) need real hand-aware valuation.
    for trig in eff.triggers or []:
        value += _trigger_effect_value(
            trig, eff, card_name, card_tags, gens_left, rv,
            tableau_tags=tableau_tags,
            hand_cards=hand_cards,
            db=db,
        )

    # VP (rough estimate — VP cards scale with remaining game)
    if eff.vp_per:
        per = eff.vp_per.get("per", "")
        amt = eff.vp_per.get("amount", 1)
        if "resource" in str(per):
            # Resource-VP cards accumulate resources → VP at end.
            # Base rate comes only from a real self-add blue action. Trigger-only
            # cards such as Decomposers/Venusian Animals are valued above via
            # their trigger text, not as if they had a recurring action.
            # External placers (Bio Printing, Freyja Biodomes, etc.) add more.
            # Count external placers in tableau if available.
            resource_token_value = _resource_vp_token_value(eff, rv)
            resources_per_gen = _self_resource_action_rate(eff)
            if tableau_tags:
                # Heuristic: each animal/microbe/floater placer in tableau
                # adds ~0.5 resources/gen to existing accumulators.
                # This is approximate — real value depends on which card
                # the resources go to, but it captures the synergy.
                res_type = str(getattr(eff, "resource_type", "") or "").lower()
                per_clean = str(per).lower().replace("(", " ").replace(")", " ")
                if not res_type:
                    for word in per_clean.split():
                        if word in ("animal", "animals", "microbe", "microbes",
                                    "floater", "floaters", "fighter", "fighters"):
                            res_type = word.rstrip("s")
                            break
                if res_type and tableau_tags:
                    # Count cards that add this resource type to other cards
                    # Rough proxy: animal/microbe/floater tag count
                    placer_tags = tableau_tags.get(res_type, tableau_tags.get(res_type + "s", 0))
                    if placer_tags > 0:
                        resources_per_gen += placer_tags * 0.4
            immediate_resources = sum(
                float(add.get("amount", 1) or 1)
                for add in getattr(eff, "adds_resources", [])
                if add.get("target") == "this"
            )
            if immediate_resources > 0 and resource_token_value > 0:
                value += immediate_resources * resource_token_value
            # Subtract action opportunity cost (~2 MC/gen for using the action)
            action_cost_per_gen = 2.0 if resources_per_gen > 0 else 0.0
            net_value_per_gen = resources_per_gen * resource_token_value - action_cost_per_gen
            value += max(0, max(0, gens_left - 1) * net_value_per_gen * 0.65)
        elif "tag" in str(per):
            # Use actual tableau tag count instead of hardcoded 3
            tag_name = ""
            for word in str(per).lower().split():
                if word not in ("tag", "tags", "per", "each", "your"):
                    tag_name = word
                    break
            actual_count = 3  # fallback
            if tableau_tags and tag_name:
                actual_count = max(1, tableau_tags.get(tag_name, 0))
            value += actual_count * amt * rv["vp"]
        else:
            value += amt * rv["vp"]

    # Resource adders to other cards (action-like, e.g. Nobel Labs parsed as adds_resources not actions)
    # These give recurring value when target VP cards exist
    for add in eff.adds_resources:
        if add["target"] in ("any", "another") and not eff.actions:
            # Card has resource adder but no explicit actions — it's an action card
            add_amount = add.get("amount", 1)
            action_gens_add = max(0, gens_left - 1)
            value += add_amount * 2.0 * action_gens_add  # ~2 MC per resource placed

    # Action value: recurring actions generate value every gen
    if eff.actions:
        action_gens = max(0, gens_left - 1)  # actions start next gen
        prod_attr = {
            "mc": "mc_prod",
            "steel": "steel_prod",
            "titanium": "ti_prod",
            "plant": "plant_prod",
            "energy": "energy_prod",
            "heat": "heat_prod",
        }
        for act in eff.actions:
            if act.get("conditional"):
                continue
            act_eff = act.get("effect", "").lower()
            act_cost = act.get("cost", "free").lower()
            # Some cards have mangled cost/effect split — combine for pattern matching
            act_full = (act_cost + " " + act_eff).strip()
            import re as _re
            explicit_mc_cost_match = _re.search(r'(\d+)\s*(?:m[c€$]|mc)\b', act_cost)
            explicit_mc_cost = int(explicit_mc_cost_match.group(1)) if explicit_mc_cost_match else None
            prod_sac_match = _re.search(
                r'decrease\s+(\w+)\s+production\s+(\d+)\s+step',
                act_cost,
            )

            # Resource adders to ANY card (Nobel Labs, Mohole Lake, Extreme-Cold Fungus, etc.)
            # These are valuable when you have VP-per-resource targets
            add_match = _re.search(r'add\s+(\d+)\s+(microbe|animal|floater|data|resource)', act_eff)
            if add_match:
                add_amount = int(add_match.group(1))
                if act_cost == "free" or act_cost == "":
                    # Free action: full value per gen
                    value += add_amount * 2.0 * action_gens  # ~2 MC per resource placed (VP potential)
                else:
                    # Paid action: subtract cost estimate
                    cost_match = _re.search(r'(\d+)', act_cost)
                    act_mc_cost = int(cost_match.group(1)) if cost_match else 3
                    net = add_amount * 2.0 - act_mc_cost
                    if net > 0:
                        value += net * action_gens
                continue

            # MC-generating actions (Red Ships, Martian Rails, etc.)
            mc_match = _re.search(r'gain\s+(\d+)\s*m[c€$]', act_eff)
            if mc_match:
                mc_gain = int(mc_match.group(1))
                if act_cost == "free" or act_cost == "":
                    value += mc_gain * action_gens
                elif prod_sac_match:
                    prod_res = prod_sac_match.group(1)
                    prod_amount = int(prod_sac_match.group(2))
                    prod_key = {
                        "m€": "mc",
                        "mc": "mc",
                    }.get(prod_res, prod_res)
                    prod_mult = _PROD_MULT.get(prod_key, 1.0)
                    current_prod = prod_amount
                    if me is not None:
                        current_prod = getattr(me, prod_attr.get(prod_key, ""), prod_amount) or 0
                    possible_uses = max(0, current_prod // max(1, prod_amount))
                    if possible_uses > 0:
                        late_uses = min(possible_uses, max(1, min(3, action_gens)))
                        late_value = 0.0
                        for future_turns_lost in range(late_uses):
                            late_value += max(
                                0.0,
                                mc_gain - prod_amount * prod_mult * future_turns_lost,
                            )
                        value += late_value * 0.5
                else:
                    act_mc_cost = explicit_mc_cost if explicit_mc_cost is not None else 3
                    net = mc_gain - act_mc_cost
                    if net > 0:
                        value += net * action_gens * 0.7
                continue

            # Scaling MC actions: "gain X MC per/for each Y"
            if not mc_match:
                scale_match = _re.search(r'gain\s+(\d+)\s*m[c€$]\s*(?:per|for each)\s+(.+)', act_full)
                if scale_match:
                    per_mc = int(scale_match.group(1))
                    # Estimate count based on what it scales with
                    scale_target = scale_match.group(2).lower()
                    est_count = 3  # default conservative estimate
                    if 'city' in scale_target or 'tile' in scale_target:
                        est_count = 4  # ~4 cities/tiles mid-game
                    elif 'tag' in scale_target:
                        est_count = 5  # ~5 matching tags
                    elif 'colony' in scale_target or 'colon' in scale_target:
                        est_count = 3
                    elif 'card' in scale_target:
                        est_count = 5
                    est_mc = per_mc * est_count
                    if act_cost == "free" or act_cost == "":
                        value += est_mc * action_gens * 0.5  # discount for variance
                    else:
                        act_mc_cost = explicit_mc_cost if explicit_mc_cost is not None else 3
                        net = est_mc - act_mc_cost
                        if net > 0:
                            value += net * action_gens * 0.4
                    continue

            # Spend-to-gain actions: "spend X resource to gain Y MC"
            if not mc_match:
                spend_match = _re.search(r'spend\s+(\d+)\s+(\w+)\s+to\s+gain\s+(?:either\s+)?(\d+)\s*m[c€$]', act_full)
                if spend_match:
                    spend_amount = int(spend_match.group(1))
                    spend_res = spend_match.group(2)
                    gain_mc = int(spend_match.group(3))
                    res_cost = {"heat": 1.0, "energy": 2.0, "steel": 2.0, "titanium": 3.0, "plant": 1.5}.get(spend_res, 2.0)
                    net = gain_mc - spend_amount * res_cost
                    if net > 0:
                        value += net * action_gens * 0.5
                    continue

            # Production-increasing actions: "increase your X production N step"
            if not mc_match:
                prod_match = _re.search(r'increase\s+your\s+(\w+)\s+production\s+(\d+)', act_full)
                if prod_match:
                    prod_res = prod_match.group(1)
                    prod_amount = int(prod_match.group(2))
                    prod_mult = _PROD_MULT.get(prod_res, 1.0)
                    act_mc_cost = explicit_mc_cost if explicit_mc_cost is not None else 0
                    # Realistic: use action 1-2 times per game, not every gen
                    uses = min(2, max(1, gens_left // 3))
                    remaining_after = max(0, gens_left - 2)
                    value_per_use = prod_amount * prod_mult * remaining_after - act_mc_cost
                    if value_per_use > 0:
                        value += value_per_use * uses * 0.5  # discount for opportunity cost
                    continue

            # Card draw actions (AI Central, Inventors' Guild, etc.)
            if any(kw in act_eff for kw in ("draw", "card", "look at")):
                draw_match = _re.search(r'draw\s+(\d+)', act_eff)
                draws = int(draw_match.group(1)) if draw_match else 1
                value += draws * rv["card"] * action_gens * 0.6
                continue

            # Global/TR bump actions (Water Splitting Plant, Venus Magnetizer,
            # Caretaker Contract). Keep this conservative; action costs are
            # already represented by the source action text and availability.
            if _re.search(r'\b(?:raise|increase)\s+(?:your\s+)?(?:tr|oxygen|temperature|venus)\b', act_full):
                act_mc_cost = explicit_mc_cost if explicit_mc_cost is not None else 0
                net = rv["tr"] - act_mc_cost
                if net > 0:
                    value += net * action_gens * 0.5
                continue

            # Generic action with no clear MC value: estimate ~2 MC/gen
            if act_cost == "free" or act_cost == "":
                value += 2.0 * action_gens

    # Negative production penalty
    for res, amount in eff.production_change.items():
        if amount >= 0:
            continue
        mult = _PROD_MULT.get(res, 1.0)
        value += amount * mult * prod_remaining  # amount is negative

    # Corp-specific rebates
    if corp_name:
        if "credicor" in corp_name.lower() and card_cost >= 20:
            value += 4  # Credicor rebate: +4 MC for cards/SPs costing 20+

    return value


def _estimate_card_value(score, cost, tags, phase, gens_left, rv):
    """Fallback: score-based MC-value heuristic."""
    base_value = (score - 40) * 0.35
    if base_value < 0:
        base_value = 0

    is_prod = any(t.lower() in ("building", "power") for t in tags)
    if is_prod and phase == "early":
        base_value *= 1.3
    elif is_prod and phase == "endgame":
        base_value *= 0.3

    # Late-game penalty for high-score cards without parsed effects.
    # This is a FALLBACK heuristic only — effect-based estimation via
    # _late_game_engine_multiplier() handles cards with parsed effects.
    # Softer penalties: high-score cards may be VP-heavy (not just engine).
    if gens_left <= 3 and score >= 70:
        endgame_penalties = {1: 0.50, 2: 0.70, 3: 0.85}
        base_value *= endgame_penalties.get(gens_left, 1.0)

    return base_value


def _merged_card_tags(name, tags, db=None):
    """Merge live hand tags with canonical DB tags.

    Live payloads sometimes omit tags entirely for cards in hand.
    Use canonical tags as a fallback without trusting generated hand data
    as the sole source of truth.
    """
    merged = []
    seen = set()
    sources = [tags or []]
    if db and name:
        info = db.get_info(name) or {}
        sources.append(info.get("tags", []) or [])
    for source in sources:
        for tag in source:
            tag_text = str(tag).strip()
            if not tag_text:
                continue
            norm = tag_text.lower()
            if norm in seen:
                continue
            seen.add(norm)
            merged.append(tag_text)
    return merged


def _has_endgame_immediate_value(name, effect_parser=None, allow_placement=True):
    """Whether the card still gives a meaningful payoff this generation."""
    if not effect_parser:
        return False
    eff = effect_parser.get(name)
    if not eff:
        return False
    if eff.tr_gain > 0:
        return True
    if allow_placement and eff.placement:
        return True
    if eff.gains_resources.get("plant", 0) >= 5:
        return True
    if eff.gains_resources.get("mc", 0) >= 4:
        return True
    if eff.vp_per and str(eff.vp_per.get("per", "")).lower() == "flat":
        return True
    return False


def _is_production_card(tags, name, effect_parser=None, db=None):
    """Heuristic: is this a production-focused card."""
    resolved_tags = _merged_card_tags(name, tags, db)
    eff = effect_parser.get(name) if effect_parser else None
    if eff and any(amount > 0 for amount in eff.production_change.values()):
        return True
    tag_set = {t.lower() for t in resolved_tags}
    if "power" in tag_set and any(
        kw in name.lower()
        for kw in ("power", "energy", "generator", "reactor", "fusion", "solar", "wind")
    ):
        return True
    prod_keywords = ("production", "prod", "factory", "mining", "generator")
    return any(kw in name.lower() for kw in prod_keywords)


def _calc_income_delta(name, effect_parser, me):
    """Calculate income change from playing a production card.

    Returns string like "+3 MC/gen" or "+2 steel +1 MC" or None.
    """
    eff = effect_parser.get(name)
    if not eff or not eff.production_change:
        return None

    parts = []
    mc_eq_delta = 0
    for res, amount in eff.production_change.items():
        if amount == 0:
            continue
        sign = "+" if amount > 0 else ""
        if res == "mc":
            parts.append(f"{sign}{amount} MC")
            mc_eq_delta += amount
        else:
            parts.append(f"{sign}{amount} {res}")
            _PROD_MULT_INCOME = {
                "steel": 1.6, "titanium": 2.5, "plant": 1.6,
                "energy": 2.0, "heat": 0.8,
            }
            mult = _PROD_MULT_INCOME.get(res, 1.0)
            mc_eq_delta += amount * mult

    if not parts:
        return None

    current_income = me.mc_prod + me.tr
    return f"{', '.join(parts)} (~{mc_eq_delta:+.0f} MC-eq/gen)"


def _calc_opportunity_cost(state, card_cost):
    """What you lose by spending card_cost MC."""
    me = state.me
    mc_after = me.mc - card_cost
    cost = 0

    if mc_after < 8 and me.mc >= 8:
        has_ms = _has_claimable_milestone(state)
        if has_ms:
            cost += 15

    if state.colonies_data and me.energy >= 3 and mc_after < 9:
        cost += 5

    # Award funding opportunity
    funded = sum(1 for a in state.awards if a.get("funded_by"))
    if funded < 3:
        award_cost = [8, 14, 20][funded]
        if me.mc >= award_cost and mc_after < award_cost:
            cost += 8  # partial — might miss award

    return cost


def _has_claimable_milestone(state):
    me = state.me
    claimed_count = sum(1 for m in state.milestones if m.get("claimed_by"))
    if claimed_count >= 3:
        return False
    for m in state.milestones:
        if m.get("claimed_by"):
            continue
        my_sc = m.get("scores", {}).get(me.color, {})
        if isinstance(my_sc, dict) and my_sc.get("claimable", False):
            return True
    return False


def _result_sort_key(entry):
    action_order = {"PLAY": 0, "HOLD": 1, "SELL": 2}.get(entry.get("action"), 3)
    if entry.get("action") == "PLAY":
        value = float(entry.get("play_value_now", 0) or 0)
    else:
        value = float(entry.get("hold_value", 0) or 0)
    return (
        entry.get("priority", 9),
        action_order,
        -value,
        entry.get("name", ""),
    )


def _play_priority(score, cost, is_production, phase, gens_left):
    """1 = play first, 9 = play last."""
    if score >= 80:
        return 2
    if score >= 70:
        return 3
    if is_production and phase in ("early", "mid"):
        return 3
    if score >= 60:
        return 4
    if is_production and phase in ("late", "endgame"):
        return 7
    return 5


def _play_reason(score, phase, gens_left):
    if score >= 80:
        return "strong card, play ASAP"
    if score >= 70:
        return f"good card, {gens_left} gen left"
    if phase == "endgame":
        return "endgame VP push"
    return f"decent value (score {score})"


def _build_buy_hint(buy_list, skip_list, mc_after, mc_pressure,
                    hand_saturation, phase):
    """One-line summary for buy recommendation."""
    n = len(buy_list)
    total = n + len(skip_list)

    if n == 0:
        return f"Пропусти все {total} карт, сохрани MC"
    if n == total:
        return f"Купи все {total} ({mc_pressure})"

    parts = [f"Купи {n} из {total}"]
    if mc_pressure == "critical":
        parts.append("MC critical!")
    elif mc_pressure == "tight":
        parts.append(f"{mc_after} MC после покупки")
    if hand_saturation == "overloaded":
        parts.append("рука переполнена")
    return ", ".join(parts)
