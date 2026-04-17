"""Two-step play-sequence planner — looks 2 cards ahead for combos.

Problem: on shadow logs the action-phase match-rate is stuck at ~16%
across ELO tiers — bot picks single best card every turn, players chain
cheap enabler → expensive payoff (e.g. Earth Catapult → Earth-heavy
card at a big discount).

Strategy: evaluate pairs (A, B) from hand. Project A's on-play effects
(new tags it adds, its tableau-discount if any), then re-score B under
that projection. If A→B combined surplus beats the best single card
by > threshold, recommend the sequence.

MVP scope:
- depth = 2 (A→B only)
- projection: card.tags (added as player tag), TABLEAU_DISCOUNT_CARDS
  entry (cost reduction for future cards of matching tag)
- NOT projected: trigger resources (Mars University +draw), recurring
  effects, req unlocks, resource-on-play from card behavior
- Guard: only offer sequence if combined surplus > best_single + 6 MC
"""

from __future__ import annotations

from .constants import TABLEAU_DISCOUNT_CARDS


_SURPLUS_THRESHOLD = 6   # minimum MC advantage over best-single to recommend
_TOP_K = 5               # only consider top-K cards as A; pairs are K*K


def plan_sequence(state, synergy, req_checker, effect_parser, db,
                  phase: str, gens_left: int, rv: dict) -> dict | None:
    """Return best 2-card plan (A→B) or None if no sequence outperforms single.

    Returns dict:
        {first, first_cost, second, second_cost_base, second_cost_after_A,
         combined_surplus, single_surplus, reason}
    """
    hand = list(getattr(state, "cards_in_hand", []) or [])
    me = getattr(state, "me", None)
    if not hand or me is None:
        return None

    # Avoid circular imports
    from .draft_play_advisor import (
        _collect_tableau_discounts, _effective_cost, _estimate_card_value_rich,
    )

    base_discounts = _collect_tableau_discounts(me.tableau or [])
    base_tags = dict(getattr(me, "tags", {}) or {})
    mc_now = getattr(me, "mc", 0) or 0

    candidates = _score_candidates(
        hand, state, me, base_discounts, base_tags, mc_now,
        synergy, req_checker, effect_parser, db, phase, gens_left, rv,
    )
    if not candidates:
        return None

    # Best single is top surplus in candidates (they're sorted by surplus desc)
    best_single = candidates[0]
    best_seq = None
    best_seq_surplus = best_single["surplus"] + _SURPLUS_THRESHOLD

    # Try every (A, B) pair from top-K
    for a in candidates[:_TOP_K]:
        proj_tags = dict(base_tags)
        for t in a["tags"] or []:
            key = t.lower()
            proj_tags[key] = proj_tags.get(key, 0) + 1
        proj_disc = dict(base_discounts)
        for dtag, amount in (TABLEAU_DISCOUNT_CARDS.get(a["name"], {}) or {}).items():
            proj_disc[dtag] = proj_disc.get(dtag, 0) + amount

        mc_after_a = mc_now - a["eff_cost"]
        if mc_after_a < 0:
            continue

        for b in candidates:
            if b["name"] == a["name"]:
                continue
            b_eff_after, _ = _effective_cost(
                b["cost"], b["tags"], me,
                tableau_discounts=proj_disc,
            )
            if b_eff_after > mc_after_a:
                continue
            # Re-score B under projection (new player_tags dict)
            b_score_after = synergy.adjusted_score(
                b["name"], b["tags"], getattr(me, "corp", ""),
                state.generation, proj_tags, state,
            )
            b_value_after = _estimate_card_value_rich(
                b["name"], b_score_after, b["cost"], b["tags"],
                phase, gens_left, rv,
                effect_parser=effect_parser, db=db,
                corp_name=getattr(me, "corp", ""),
                tableau_tags=proj_tags,
            )
            b_surplus_after = b_value_after - b_eff_after
            combined = a["surplus"] + b_surplus_after
            if combined > best_seq_surplus:
                best_seq_surplus = combined
                best_seq = {
                    "first": a["name"],
                    "first_cost": a["eff_cost"],
                    "second": b["name"],
                    "second_cost_base": b["eff_cost"],
                    "second_cost_after_A": b_eff_after,
                    "combined_surplus": round(combined, 1),
                    "single_surplus": round(best_single["surplus"], 1),
                    "single_best_name": best_single["name"],
                    "reason": _format_reason(
                        a["name"], b["name"],
                        b["eff_cost"], b_eff_after,
                        combined, best_single["surplus"], best_single["name"],
                    ),
                }
    return best_seq


def _score_candidates(hand, state, me, base_discounts, base_tags, mc_now,
                      synergy, req_checker, effect_parser, db,
                      phase, gens_left, rv):
    """Build list of playable hand cards with surplus = value - eff_cost."""
    from .draft_play_advisor import _effective_cost, _estimate_card_value_rich

    out = []
    for card in hand:
        name = card.get("name") if isinstance(card, dict) else str(card)
        if not name:
            continue
        info = db.get_info(name) if db else None
        tags = (info.get("tags") if info else None) or card.get("tags") or []
        cost = card.get("cost", 0) or 0
        eff_cost, _ = _effective_cost(cost, tags, me, tableau_discounts=base_discounts)
        if eff_cost > mc_now:
            continue
        if req_checker is not None:
            ok, _ = req_checker.check(name, state)
            if not ok:
                continue
        score = synergy.adjusted_score(
            name, tags, getattr(me, "corp", ""),
            state.generation, base_tags, state,
        )
        value = _estimate_card_value_rich(
            name, score, cost, tags, phase, gens_left, rv,
            effect_parser=effect_parser, db=db,
            corp_name=getattr(me, "corp", ""),
            tableau_tags=base_tags,
        )
        out.append({
            "name": name, "cost": cost, "tags": tags,
            "eff_cost": eff_cost, "score": score,
            "value": value, "surplus": value - eff_cost,
        })
    out.sort(key=lambda x: -x["surplus"])
    return out


def _format_reason(a_name, b_name, b_base, b_after, combined, single, single_name):
    disc_note = ""
    if b_after < b_base:
        disc_note = f" ({b_base}→{b_after} MC)"
    return (
        f"\U0001f517 План: {a_name} → {b_name}{disc_note}. "
        f"Суммарный surplus {combined:.0f} MC "
        f"vs лучший одиночный {single_name} {single:.0f}."
    )
