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

import re

from .analysis import _estimate_remaining_gens, _score_to_tier, _estimate_vp, _estimate_hidden_vp_buffer
from .economy import resource_values, game_phase
from .constants import TABLEAU_DISCOUNT_CARDS, GLOBAL_EVENTS, PARTY_POLICIES, CORP_DISCOUNTS
from .opponent_intent import format_opponent_intent_warnings


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
    db = getattr(synergy, 'db', None)

    # Opponent milestone pressure: if opponent can claim, we need MC reserve
    opp_milestone_threat = _opponent_milestone_threat(state)

    # Score each card
    scored = []
    for card in cards:
        name = card["name"]
        tags = _card_tags(card, db)
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
            playability_gens = _estimate_req_gap(req_reason, state, gens_left)

        # Future playability bonus: if req will be met in 1-2 gens, boost score
        if not req_ok and 0 < playability_gens <= 2:
            bonus_future = max(0, 3 - playability_gens)  # +2 if 1 gen, +1 if 2
            score += bonus_future

        scored.append({
            "name": name, "score": score, "tier": tier,
            "cost_play": cost_play, "req_ok": req_ok,
            "req_reason": req_reason, "playability_gens": playability_gens,
            "tags": tags,
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


def _estimate_req_gap(req_reason, state, gens_left):
    """Estimate how many gens until requirement is met. Returns 0 if unknown."""
    if not req_reason:
        return 0
    reason = req_reason.lower()
    if "макс" in reason or "max" in reason:
        return gens_left + 1

    m = re.search(r'(\d+)%?\s*o', reason)
    if m and "oxygen" in reason:
        gap = int(m.group(1)) - state.oxygen
        if gap > 0:
            return max(1, gap // 2)

    m = re.search(r'(-?\d+)', reason)
    if m and ("temp" in reason or "°" in reason):
        needed = int(m.group(1))
        gap = needed - state.temperature
        if gap > 0:
            return max(1, gap // 4)

    m = re.search(r'(\d+)\s*ocean', reason)
    if m:
        gap = int(m.group(1)) - state.oceans
        if gap > 0:
            return max(1, gap // 2)

    m = re.search(r'(\d+)%?\s*venus', reason)
    if m:
        gap = int(m.group(1)) - state.venus
        if gap > 0:
            return max(1, gap // 3)

    if "tag" in reason:
        return 2

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
    """Predict opponent actions this turn from public state and recent actions."""
    return format_opponent_intent_warnings(state)


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
        tags = _card_tags(card, db)
        cost = card.get("cost", card.get("calculatedCost", 0))
        score = synergy.adjusted_score(
            name, tags, me.corp, state.generation, me.tags, state, context="play")

        # Effective cost considering discounts + steel/titanium payment
        eff_cost, pay_hint = _effective_cost(
            cost, tags, me,
            tableau_discounts=tableau_discounts,
            discounts_already_applied=_card_cost_is_calculated(card),
        )

        req_ok, req_reason = True, ""
        if req_checker:
            req_ok, req_reason = req_checker.check(name, state)
            if req_ok:
                req_ok, req_reason = req_checker.check_prod_decrease(name, state)

        # Can't play: req not met
        if not req_ok:
            gap = _estimate_req_gap(req_reason, state, gens_left)
            if gap > gens_left:
                results.append(_entry(name, "SELL", f"req не успеет: {req_reason}",
                                      0, 0, 0, 9))
            elif gap <= 1:
                results.append(_entry(name, "HOLD", f"req скоро: {req_reason}",
                                      0, score / 10, 0, 6))
            else:
                results.append(_entry(name, "HOLD", f"req через ~{gap} gen",
                                      0, score / 15, 0, 7))
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
            player_colonies=getattr(me, "colonies", 0),
            tableau_cards=getattr(me, "tableau", None),
            hand_cards=hand)
        mc_after = me.mc - eff_cost  # effective cost with steel/ti

        # SELL: low score card (but allow early game speculation and immediate payoff)
        if score < 40 and phase != "early":
            net_play_value = play_value - eff_cost
            has_immediate_value = _has_endgame_immediate_value(
                name, effect_parser, allow_placement=True,
                tableau_tags=dict(me.tags) if me.tags else None,
                player_colonies=getattr(me, "colonies", 0))
            if net_play_value <= 0 and not has_immediate_value:
                results.append(_entry(name, "SELL", f"score {score}, продай за 1 MC",
                                      play_value, 0, eff_cost, 9))
                continue

        # Production in endgame = bad
        is_production = _is_production_card(tags, name, effect_parser=effect_parser)
        has_endgame_nonplacement_value = _has_endgame_immediate_value(
            name, effect_parser, allow_placement=False,
            tableau_tags=dict(me.tags) if me.tags else None,
            player_colonies=getattr(me, "colonies", 0))
        has_endgame_immediate_value = _has_endgame_immediate_value(
            name, effect_parser, allow_placement=True,
            tableau_tags=dict(me.tags) if me.tags else None,
            player_colonies=getattr(me, "colonies", 0))
        if (is_production and gens_left <= 2 and
                not has_endgame_nonplacement_value and
                (not has_endgame_immediate_value or play_value <= eff_cost)):
            results.append(_entry(name, "SELL", "production в endgame бесполезна",
                                  play_value * 0.2, 0, eff_cost, 9))
            continue

        # Last gen: only play if immediate VP/TR or conversion fuel
        if gens_left <= 1 and not _is_vp_card(name, tags, effect_parser):
            # Check if card gives immediate TR, placement, or resources
            has_immediate_value = has_endgame_immediate_value
            if not has_immediate_value and score < 70:
                sell_reason = f"last gen: no immediate VP (sell +1 MC)"
                results.append(_entry(name, "SELL", sell_reason,
                                      play_value * 0.1, 0, eff_cost, 9))
                continue

        endgame_shortfall = _endgame_low_value_reason(
            name, effect_parser, play_value, eff_cost, state,
            tableau_tags=dict(me.tags) if me.tags else None,
            player_colonies=getattr(me, "colonies", 0))
        if endgame_shortfall:
            results.append(_entry(name, "SELL", endgame_shortfall,
                                  play_value, 0, eff_cost, 9))
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

        # Trade opportunity cost
        if state.colonies_data and me.energy >= 3 and mc_after < 9:
            best_track = max((c.get("track", 0) for c in state.colonies_data),
                             default=0)
            if best_track >= 4:
                results.append(_entry(name, "HOLD",
                                      f"trade выгоднее (track {best_track}), сохрани MC",
                                      play_value, play_value * 0.8,
                                      opportunity_cost, 6))
                continue

        # Good card — PLAY (VP race adjustments)
        priority = _play_priority(
            score, eff_cost, is_production, phase, gens_left, play_value)
        play_reason = _play_reason(score, phase, gens_left, play_value)
        if pay_hint:
            play_reason += f" ({pay_hint})"

        # Income delta for production cards
        if is_production and effect_parser:
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

        for hint in order_hints:
            first_name = hint["play_first"]
            second_name = hint["then_play"]
            reason = hint["reason"]
            mc_saved = hint["mc_saved"]

            for r in results:
                if r["name"] == first_name and r["action"] == "PLAY":
                    # Scale priority boost by MC saved: -2 for big discounts, -1 for small
                    delta = 2 if mc_saved >= 3 else 1
                    r["priority"] = max(1, r["priority"] - delta)
                    if "play_before" not in r:
                        r["play_before"] = []
                    r["play_before"].append(f"→ {second_name}: {reason}")
                    r["sequence_bonus"] = round(r.get("sequence_bonus", 0) + mc_saved, 1)
                    if "combo:" not in r["reason"]:
                        r["reason"] += f" (combo: play before {second_name})"

    # ── MC sequence simulation: check affordability of full PLAY sequence ──
    # Uses effective cost (steel/ti) for accurate simulation
    play_sequence = sorted(
        [r for r in results if r["action"] == "PLAY"],
        key=lambda r: r["priority"])
    if len(play_sequence) >= 2:
        mc_sim = me.mc
        steel_sim, ti_sim = me.steel, me.titanium
        for r in play_sequence:
            card_data = next((c for c in hand if c["name"] == r["name"]), {})
            card_tags = _card_tags(card_data, db)
            card_cost = card_data.get("cost", card_data.get("calculatedCost", 0))
            eff, _ = _effective_cost(
                card_cost, card_tags, me,
                steel_sim, ti_sim,
                tableau_discounts=tableau_discounts,
                discounts_already_applied=_card_cost_is_calculated(card_data),
            )
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
        card_tags = _card_tags(card_data, db)
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

    results.sort(key=lambda r: r["priority"])
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

    budget = me.mc + (me.heat if me.corp == "Helion" else 0)
    allocations = []
    warnings = []
    reds_ruling = (state.turmoil and
                   "Reds" in str(state.turmoil.get("ruling", "")))

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

    # 2. Awards (with overtake risk analysis)
    funded_count = sum(1 for a in state.awards if a.get("funded_by"))
    if funded_count < 3:
        cost_award = [8, 14, 20][funded_count]
        min_lead = {"early": 8, "mid": 5, "late": 3, "endgame": 2}.get(phase, 5)
        best_award = None
        best_award_lead = -999
        for a in state.awards:
            if a.get("funded_by"):
                # Check already funded awards: am I at risk of losing?
                my_val = a.get("scores", {}).get(me.color, 0)
                scores_sorted = sorted(
                    ((c, v) for c, v in a.get("scores", {}).items()),
                    key=lambda x: -x[1])
                if len(scores_sorted) >= 2:
                    first_c, first_v = scores_sorted[0]
                    second_c, second_v = scores_sorted[1]
                    if first_c == me.color and second_v >= first_v - 1:
                        warnings.append(
                            f"Award {a['name']}: тебя могут обойти! "
                            f"Лид всего +{first_v - second_v}")
                continue
            my_val = a.get("scores", {}).get(me.color, 0)
            opp_max = max((v for c, v in a.get("scores", {}).items()
                           if c != me.color), default=0)
            lead = my_val - opp_max
            if lead >= min_lead and lead > best_award_lead:
                best_award = a
                best_award_lead = lead

        if best_award and budget >= cost_award:
            # Check overtake risk: can opponents close the gap?
            overtake_risk = ""
            opp_second = sorted(
                ((c, v) for c, v in best_award.get("scores", {}).items()
                 if c != me.color),
                key=lambda x: -x[1])
            if opp_second and best_award_lead <= 3 and phase in ("late", "endgame"):
                overtake_risk = " ⚠️risk"
                warnings.append(
                    f"Award {best_award['name']}: лид тонкий (+{best_award_lead}), "
                    f"фондируй сейчас!")

            value_mc = round(5 * rv["vp"] * 0.7)
            allocations.append({
                "action": f"Fund {best_award['name']} (лид +{best_award_lead}){overtake_risk}",
                "cost": cost_award, "value_mc": value_mc,
                "priority": 2, "type": "award",
            })

    # 3. Colony trade
    if state.colonies_data and (me.energy >= 3 or budget >= 9):
        from .colony_advisor import analyze_trade_options
        trade_result = analyze_trade_options(state)
        if trade_result["trades"]:
            best = trade_result["trades"][0]
            if best["net_profit"] > 0:
                methods = trade_result.get("methods", []) or []
                cheapest = min(
                    methods,
                    key=lambda method: method.get("cost_mc", 99),
                    default={"method": "mc", "cost_mc": 9.0, "cost_desc": "9 MC"},
                )
                method_name = str(cheapest.get("method", "mc") or "mc")
                opportunity_cost = float(cheapest.get("cost_mc", 9.0) or 0)
                trade_cost = int(opportunity_cost) if method_name == "mc" else 0
                allocations.append({
                    "action": f"Trade {best['name']}",
                    "cost": trade_cost,
                    "cost_desc": cheapest.get("cost_desc", f"{opportunity_cost:g} MC"),
                    "opportunity_cost_mc": round(opportunity_cost, 1),
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
        tableau_discounts = _collect_tableau_discounts(me.tableau)
        sell_advice_names = {
            row["name"] for row in play_hold_advice(
                state.cards_in_hand, state, synergy, req_checker)
            if row.get("action") == "SELL"
        }
        for card in state.cards_in_hand:
            name = card["name"]
            tags = _card_tags(card, db)
            cost = card.get("cost", card.get("calculatedCost", 0))
            score = synergy.adjusted_score(
                name, tags, me.corp, state.generation, me.tags, state)
            req_ok, _ = req_checker.check(name, state)

            cost, _ = _effective_cost(
                cost, tags, me,
                tableau_discounts=tableau_discounts,
                discounts_already_applied=_card_cost_is_calculated(card),
            )

            if not req_ok or cost > budget:
                continue
            if name in sell_advice_names:
                continue

            if gens_left <= 1 and not _is_vp_card(name, tags, effect_parser):
                has_immediate_value = _has_endgame_immediate_value(
                    name, effect_parser, allow_placement=True,
                    tableau_tags=dict(me.tags) if me.tags else None,
                    player_colonies=getattr(me, "colonies", 0))
                if not has_immediate_value and score < 70:
                    continue

            value_mc = _estimate_card_value_rich(
                name, score, cost, tags, phase, gens_left, rv,
                effect_parser, db, corp_name=me.corp,
                tableau_tags=dict(me.tags) if me.tags else None,
                player_colonies=getattr(me, "colonies", 0),
                tableau_cards=getattr(me, "tableau", None),
                hand_cards=state.cards_in_hand)
            priority = _play_priority(
                score,
                cost,
                _is_production_card(tags, name, effect_parser=effect_parser),
                phase,
                gens_left,
                value_mc,
            )
            allocations.append({
                "action": f"Play {name}",
                "cost": cost, "value_mc": round(value_mc),
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
    elif me.plants >= 5 and me.plant_prod >= 3 and gens_left >= 1:
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
    elif me.heat >= 5 and me.heat_prod >= 3 and state.temperature < 8 and gens_left >= 1:
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
                act_cost_str, act_effect_str, me, rv, gens_left)
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

        # Policy action (if unused and beneficial)
        ruling = turm.get("ruling", "")
        policy_used = turm.get("policy_used", {}).get(me_color, False)
        if ruling and not policy_used:
            policy_info = PARTY_POLICIES.get(ruling, {})
            if policy_info and ruling != "Reds":
                allocations.append({
                    "action": f"🏛️ Policy: {ruling} — {policy_info['policy'][:40]}",
                    "cost": 0, "value_mc": 3,
                    "priority": 5, "type": "turmoil",
                })

        # Global event warnings
        coming = turm.get("coming")
        if coming:
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
        play_allocation_names = {
            a["action"][5:]
            for a in allocations
            if a.get("type") == "card" and a.get("action", "").startswith("Play ")
        }
        sellable = []
        for card in state.cards_in_hand:
            cname = card["name"]
            if cname in play_allocation_names:
                continue
            ctags = _card_tags(card, db)
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
        -(a["value_mc"] / max(1, a.get("opportunity_cost_mc", a["cost"]))),
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
            ctags = _card_tags(card, db)
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

    # ── Scenario 4: Carbon Nanosystems should be before Space/City payoffs ──
    if "Carbon Nanosystems" in play_names:
        for b_name in play_names:
            if b_name == "Carbon Nanosystems":
                continue
            b_tags = card_tags_map.get(b_name, [])
            if "space" not in b_tags and "city" not in b_tags:
                continue
            hints.append({
                "play_first": "Carbon Nanosystems",
                "then_play": b_name,
                "reason": "self science tag creates 1 graphene (=4 MC)",
                "mc_saved": 4,
            })

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
        db = getattr(synergy, 'db', None)
        for card in hand:
            card_tags = [t.lower() for t in _card_tags(card, db)]
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
            policy = PARTY_POLICIES.get(party_name, {})
            if policy and party_name != "Reds":
                score = max(score, 8)
                reason = reason or f"push to dominant ({policy.get('policy', '')[:25]})"

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

def _card_cost_is_calculated(card: dict) -> bool:
    """True when API already included fixed discounts in the card cost."""
    return bool(card.get("cost_is_calculated"))


def _card_tags(card: dict, db=None) -> list[str]:
    """Return API tags, falling back to card DB tags when player API omits them."""
    tags = card.get("tags", []) or []
    if tags:
        return tags
    name = card.get("name", "")
    if not name or not db:
        return []
    info = db.get_info(name) or {}
    return list(info.get("tags", []) or [])


def _tableau_resources(me, card_name: str) -> int:
    total = 0
    for card in getattr(me, "tableau", []) or []:
        if not isinstance(card, dict):
            continue
        if card.get("name") != card_name or card.get("isDisabled"):
            continue
        try:
            total += int(card.get("resources") or 0)
        except (TypeError, ValueError):
            pass
    return total


def _card_has_any_tag(card_name: str, tags: list[str], wanted: set[str], db=None) -> bool:
    if not tags and db and card_name:
        info = db.get_info(card_name) or {}
        tags = info.get("tags", []) or []
    tag_set = {str(tag).lower() for tag in tags or []}
    return bool(tag_set & {tag.lower() for tag in wanted})


def _count_hand_tag_any(hand_cards, wanted: set[str], skip_name: str = "", db=None) -> int:
    count = 0
    for card in hand_cards or []:
        name = card.get("name", "") if isinstance(card, dict) else str(card)
        if not name or name == skip_name:
            continue
        raw_tags = card.get("tags", []) if isinstance(card, dict) else []
        if _card_has_any_tag(name, raw_tags, wanted, db=db):
            count += 1
    return count


def _carbon_nanosystems_graphene_value(card_name: str, hand_cards, db, gens_left: int) -> float:
    if card_name != "Carbon Nanosystems":
        return 0.0

    payment_targets = _count_hand_tag_any(
        hand_cards, {"Space", "City"}, skip_name=card_name, db=db)
    science_followups = _count_hand_tag_any(
        hand_cards, {"Science", "Wild"}, skip_name=card_name, db=db)

    if payment_targets <= 0:
        return 2.0 if science_followups > 0 and gens_left >= 4 else -2.0

    graphenes = 1 + science_followups  # Carbon triggers on its own science tag.
    paid_graphenes = min(graphenes, payment_targets)
    value = paid_graphenes * 4.0
    if payment_targets >= 2:
        value += 2.0
    if science_followups >= 2:
        value += 2.0
    if gens_left <= 2:
        value -= 3.0
    return max(-3.0, min(14.0, value))


def _effective_cost(printed_cost, tags, me, steel_override=None, ti_override=None,
                    tableau_discounts=None, discounts_already_applied=False):
    """Calculate effective MC cost after discounts, steel/titanium payment.

    Returns (eff_mc_cost, pay_hint_str).
    Applies: 1) Tableau discounts (Earth Office, etc.), 2) Titanium, 3) Steel.
    """
    tag_set = {t.lower() for t in tags}
    steel = steel_override if steel_override is not None else me.steel
    ti = ti_override if ti_override is not None else me.titanium
    remaining = printed_cost
    hints = []

    if not discounts_already_applied:
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

    if ("space" in tag_set or "city" in tag_set) and remaining > 0:
        graphenes = _tableau_resources(me, "Carbon Nanosystems")
        graphene_usable = min(graphenes, (remaining + 3) // 4)
        if graphene_usable > 0:
            graphene_mc = min(remaining, graphene_usable * 4)
            remaining -= graphene_mc
            hints.append(f"{graphene_usable} graphene={graphene_mc} MC")

    # 4. Helion: spend heat as MC
    if me.corp == "Helion" and remaining > 0 and me.heat > 0:
        heat_usable = min(me.heat, remaining)
        if heat_usable > 0:
            remaining -= heat_usable
            hints.append(f"{heat_usable} heat=MC")

    pay_hint = ", ".join(hints) if hints else ""
    return remaining, pay_hint


def _estimate_action_value(cost_str, effect_str, me, rv, gens_left):
    """Estimate MC cost and value of a blue card action.

    Returns (mc_cost, mc_value).
    """
    cost_str = str(cost_str).lower()
    effect_str = str(effect_str).lower()
    mc_cost = 0
    mc_value = 0

    # Parse cost
    mc_m = re.search(r'(\d+)\s*(?:mc|m€|megacredit)', cost_str)
    if mc_m:
        mc_cost = int(mc_m.group(1))
    if "energy" in cost_str:
        en_m = re.search(r'(\d+)\s*energy', cost_str)
        en_needed = int(en_m.group(1)) if en_m else 1
        if me.energy < en_needed:
            return 0, 0  # can't afford
    if "titanium" in cost_str:
        return 0, 0  # too rare to recommend spending

    # Parse value
    mc_m = re.search(r'(\d+)\s*(?:mc|m€|megacredit)', effect_str)
    if mc_m:
        mc_value += int(mc_m.group(1))
    if "card" in effect_str and "draw" in effect_str:
        card_m = re.search(r'(\d+)\s*card', effect_str)
        mc_value += int(card_m.group(1)) * rv["card"] if card_m else rv["card"]
    if "vp" in effect_str or "victory" in effect_str:
        vp_m = re.search(r'(\d+)\s*(?:vp|victory)', effect_str)
        mc_value += int(vp_m.group(1)) * rv["vp"] if vp_m else rv["vp"]
    if "animal" in effect_str or "microbe" in effect_str or "floater" in effect_str:
        # Resource accumulation → ~0.5 VP per resource
        mc_value += rv["vp"] * 0.5
    if "production" in effect_str or "prod" in effect_str:
        mc_value += 3  # rough production boost value
    if "tr" in effect_str and "raise" in effect_str:
        mc_value += rv["tr"]

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


def _estimate_card_value_rich(name, score, cost, tags, phase, gens_left, rv,
                              effect_parser=None, db=None, corp_name="",
                              tableau_tags=None, player_colonies=0,
                              tableau_cards=None,
                              hand_cards=None):
    """Effect-based MC-value estimation. Falls back to score heuristic."""
    carbon_bonus = _carbon_nanosystems_graphene_value(
        name, hand_cards or [], db, gens_left)

    # Try effect-based estimation first
    if effect_parser:
        eff = effect_parser.get(name)
        if eff:
            value = _value_from_effects(eff, gens_left, rv, phase,
                                        corp_name=corp_name,
                                        card_cost=cost,
                                        tableau_tags=tableau_tags,
                                        player_colonies=player_colonies,
                                        card_tags=tags,
                                        tableau_cards=tableau_cards,
                                        effect_parser=effect_parser)
            value += carbon_bonus
            # Late-game penalty for engine/draw cards that won't pay off
            if value > 0 and gens_left <= 3:
                value *= _late_game_engine_multiplier(eff, gens_left)
            if value > 0:
                return value
            if phase == "endgame" and gens_left <= 2 and _has_structured_effect_data(eff):
                return max(0, value)

    # Fallback: score heuristic (with late-game engine penalty for high-score cards)
    return _estimate_card_value(score, cost, tags, phase, gens_left, rv) + carbon_bonus


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
    has_immediate_gains = bool(eff.gains_resources or eff.scaled_gains_resources)
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


def _immediate_resource_value(res, rv):
    return {
        "mc": 1.0, "steel": rv["steel"], "titanium": rv["titanium"],
        "plant": rv["plant"], "heat": rv["heat"],
    }.get(res, 1.0)


def _scaled_gain_count(scales, tableau_tags=None, player_colonies=0):
    tag_counts = {str(k).lower(): v for k, v in (tableau_tags or {}).items()}
    count = 0
    for scale in scales or []:
        kind = scale.get("kind")
        if kind == "tag":
            count += tag_counts.get(str(scale.get("name", "")).lower(), 0)
        elif kind == "planet_tags":
            count += (
                tag_counts.get("earth", 0)
                + tag_counts.get("jovian", 0)
                + tag_counts.get("venus", 0)
            )
        elif kind == "colony":
            count += max(0, int(player_colonies or 0))
    return count


def _scaled_resource_gain(eff, resource, tableau_tags=None, player_colonies=0):
    total = 0
    for gain in eff.scaled_gains_resources:
        if gain.get("resource") != resource:
            continue
        total += gain.get("amount", 0) * _scaled_gain_count(
            gain.get("scales"), tableau_tags, player_colonies)
    return total


def _resource_vp_type(eff) -> str:
    if not eff or not eff.vp_per:
        return ""
    if "resource" not in str(eff.vp_per.get("per", "")).lower():
        return ""
    if eff.resource_type:
        return _normalize_vp_resource_name(eff.resource_type)
    per_text = str(eff.vp_per.get("per", "")).lower()
    for word in ("animal", "microbe", "floater", "fighter", "science", "asteroid",
                 "data", "camp", "seed"):
        if word in per_text:
            return word
    return "resource"


def _normalize_vp_resource_name(name: str) -> str:
    text = str(name or "").lower().strip()
    aliases = {
        "animals": "animal",
        "microbes": "microbe",
        "floaters": "floater",
        "fighters": "fighter",
        "asteroids": "asteroid",
    }
    if text in aliases:
        return aliases[text]
    if text.endswith("s") and text not in {"science"}:
        return text[:-1]
    return text


def _action_cost_value(cost_text: str) -> float:
    text = str(cost_text or "").lower()
    if text in ("", "free"):
        return 0.0
    m = re.search(r'(\d+)', text)
    amount = int(m.group(1)) if m else 1
    if "energy" in text:
        return amount * 2.0
    if "heat" in text:
        return amount * 1.0
    if "steel" in text:
        return amount * 2.0
    if "titanium" in text:
        return amount * 3.0
    return float(amount)


def _best_self_resource_vp_action_value(eff, rv) -> float:
    res_type = _resource_vp_type(eff)
    if not res_type:
        return 0.0
    vp_amount = float(eff.vp_per.get("amount", 1) or 1)
    best = 0.0
    for act in eff.actions or []:
        effect = str(act.get("effect", "")).lower()
        if "to this card" not in effect and "here" not in effect:
            continue
        m = re.search(r'add\s+(\d+)\s+([a-z -]+?)(?:\s+to|\s+here|$)', effect)
        if not m:
            continue
        amount = int(m.group(1))
        action_res = _normalize_vp_resource_name(m.group(2))
        if res_type != "resource" and res_type not in action_res:
            continue
        raw = amount * vp_amount * rv["vp"] - _action_cost_value(act.get("cost", "free"))
        best = max(best, raw)
    return best


def _tag_trigger_matches_play(trigger_text: str, tags: set[str]) -> bool:
    text = str(trigger_text or "").lower()
    if "play" not in text:
        return False
    return any(tag and tag in text for tag in tags)


def _tableau_trigger_resource_vp_value(card_tags, target_eff, tableau_cards,
                                       effect_parser, rv) -> float:
    """Immediate VP-resource value from already-played triggers."""
    if not effect_parser:
        return 0.0
    res_type = _resource_vp_type(target_eff)
    if not res_type:
        return 0.0
    tags = {str(t).lower() for t in (card_tags or [])}
    vp_amount = float(target_eff.vp_per.get("amount", 1) or 1)
    total_resources = 0
    for tableau_card in tableau_cards or []:
        if not isinstance(tableau_card, dict) or tableau_card.get("isDisabled"):
            continue
        source_eff = effect_parser.get(tableau_card.get("name", ""))
        if not source_eff:
            continue
        for trigger in source_eff.triggers or []:
            if not _tag_trigger_matches_play(trigger.get("on", ""), tags):
                continue
            effect = str(trigger.get("effect", "")).lower()
            if "add" not in effect or "to that card" not in effect:
                continue
            m = re.search(r'add\s+(\d+)\s+([a-z -]+?)\s+to that card', effect)
            if m:
                amount = int(m.group(1))
                trigger_res = _normalize_vp_resource_name(m.group(2))
                if trigger_res != "resource" and res_type != "resource" and res_type not in trigger_res:
                    continue
                total_resources += amount
            else:
                amount_m = re.search(r'add\s+(\d+)\s+resource', effect)
                total_resources += int(amount_m.group(1)) if amount_m else 1
    return total_resources * vp_amount * rv["vp"]


def _has_structured_effect_data(eff):
    return bool(
        eff.tr_gain
        or eff.production_change
        or eff.vp_per
        or eff.discount
        or eff.triggers
        or eff.actions
        or eff.tag_scaling
        or eff.placement
        or eff.draws_cards
        or eff.gains_resources
        or eff.scaled_gains_resources
    )


def _endgame_low_value_reason(name, effect_parser, play_value, eff_cost, state,
                              tableau_tags=None, player_colonies=0):
    if eff_cost <= 0:
        return None
    gens_left = _estimate_remaining_gens(state)
    if game_phase(gens_left, state.generation) != "endgame" or gens_left > 2:
        return None
    if play_value + 1 >= eff_cost:
        return None
    if not effect_parser:
        return None

    eff = effect_parser.get(name)
    if not eff or not _has_structured_effect_data(eff):
        return None

    me = state.me
    plant_gain = eff.gains_resources.get("plant", 0) + _scaled_resource_gain(
        eff, "plant", tableau_tags, player_colonies)
    if plant_gain > 0 and getattr(me, "plants", 0) + plant_gain >= 8:
        return None

    heat_gain = eff.gains_resources.get("heat", 0) + _scaled_resource_gain(
        eff, "heat", tableau_tags, player_colonies)
    if heat_gain > 0 and state.temperature < 8 and getattr(me, "heat", 0) + heat_gain >= 8:
        return None

    return f"endgame: value {play_value:.1f} < cost {eff_cost}"


def _value_from_effects(eff, gens_left, rv, phase, has_colonies=False, corp_name="", card_cost=0,
                        tableau_tags=None, player_colonies=0, card_tags=None,
                        tableau_cards=None, effect_parser=None):
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
        value += amount * _immediate_resource_value(res, rv)

    for gain in eff.scaled_gains_resources:
        amount = gain.get("amount", 0) * _scaled_gain_count(
            gain.get("scales"), tableau_tags, player_colonies)
        if amount <= 0:
            continue
        value += amount * _immediate_resource_value(gain.get("resource"), rv)

    # VP (rough estimate — VP cards scale with remaining game)
    if eff.vp_per:
        per = eff.vp_per.get("per", "")
        amt = eff.vp_per.get("amount", 1)
        if "resource" in str(per):
            # Resource-VP cards accumulate resources → VP at end.
            # Current generation matters: after playing a blue action card, the
            # player can usually spend the second action on that new card. Also
            # count immediate tableau triggers such as Viral Enhancers.
            # External placers (Bio Printing, Freyja Biodomes, etc.) add more.
            # Count external placers in tableau if available.
            current_action_value = max(
                0.0, _best_self_resource_vp_action_value(eff, rv) - 1.0)
            trigger_value = _tableau_trigger_resource_vp_value(
                card_tags, eff, tableau_cards, effect_parser, rv)
            value += current_action_value + trigger_value

            resources_per_gen = 1.0  # own action
            if tableau_tags:
                # Heuristic: each animal/microbe/floater placer in tableau
                # adds ~0.5 resources/gen to existing accumulators.
                # This is approximate — real value depends on which card
                # the resources go to, but it captures the synergy.
                res_type = ""
                per_clean = str(per).lower().replace("(", " ").replace(")", " ")
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
            # Subtract action opportunity cost (~2 MC/gen for using the action)
            action_cost_per_gen = 2.0
            net_value_per_gen = (resources_per_gen * amt * rv["vp"]
                                 - action_cost_per_gen)
            future_action_gens = max(0, gens_left - 1)
            value += max(0, future_action_gens * net_value_per_gen * 0.65)
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
        for act in eff.actions:
            act_eff = act.get("effect", "").lower()
            act_cost = act.get("cost", "free").lower()
            # Some cards have mangled cost/effect split — combine for pattern matching
            act_full = (act_cost + " " + act_eff).strip()

            # Resource adders to ANY card (Nobel Labs, Mohole Lake, Extreme-Cold Fungus, etc.)
            # These are valuable when you have VP-per-resource targets
            import re as _re
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
                else:
                    cost_match = _re.search(r'(\d+)', act_cost)
                    act_mc_cost = int(cost_match.group(1)) if cost_match else 3
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
                        cost_match = _re.search(r'(\d+)', act_cost)
                        act_mc_cost = int(cost_match.group(1)) if cost_match else 3
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
                    cost_match = _re.search(r'(\d+)', act_cost) if act_cost not in ("free", "") else None
                    act_mc_cost = int(cost_match.group(1)) if cost_match else 0
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


def _has_endgame_immediate_value(name, effect_parser=None, allow_placement=True,
                                 tableau_tags=None, player_colonies=0):
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
    plant_gain = eff.gains_resources.get("plant", 0) + _scaled_resource_gain(
        eff, "plant", tableau_tags, player_colonies)
    mc_gain = eff.gains_resources.get("mc", 0) + _scaled_resource_gain(
        eff, "mc", tableau_tags, player_colonies)
    if plant_gain >= 5:
        return True
    if mc_gain >= 4:
        return True
    if (eff.vp_per and str(eff.vp_per.get("per", "")).lower() == "flat"
            and eff.vp_per.get("amount", 0) > 0):
        return True
    return False


def _is_production_card(tags, name, effect_parser=None):
    """Heuristic: is this a production-focused card."""
    eff = effect_parser.get(name) if effect_parser else None
    if eff and any(amount > 0 for amount in eff.production_change.values()):
        return True
    tag_set = {t.lower() for t in tags}
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


def _play_priority(score, cost, is_production, phase, gens_left, play_value=None):
    """1 = play first, 9 = play last."""
    if phase == "endgame" and play_value is not None:
        if play_value >= 14:
            return 3
        if play_value >= 8:
            return 4
        if play_value < 2:
            return 7
        if play_value < 5:
            return 6

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


def _play_reason(score, phase, gens_left, play_value=None):
    if phase == "endgame" and play_value is not None:
        if play_value < 2:
            return "endgame low immediate value — after VP/TR plays"
        if play_value < 5:
            return "endgame filler value"
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
