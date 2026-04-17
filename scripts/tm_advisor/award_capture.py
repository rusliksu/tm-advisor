"""Award slot-capture logic — decides when to fund an award with urgency.

Addresses the bug where advisor recommends play-card while opponent can fund
the last slot and lock you out of a leading award. Root cause of the user's
Constructor lose in game g5c3f715ec370 (gen 8).

Urgency tiers:
- CRITICAL: last slot + I'm ranked 1st + opp has MC to fund → fund immediately
- HIGH:     thin lead (<= 1) in late game + opp has MC → fund before overtake
- MEDIUM:   comfortable lead + budget allows → opportunistic fund

Replaces the in-line award block at draft_play_advisor.py:750-798.
Currently used from mc_allocation_advice only; analysis.py call-sites
(_generate_alerts, endgame_convert_actions) still carry their own legacy
logic and will be migrated separately.
"""

from __future__ import annotations

_COST_SCHEDULE = [8, 14, 20]


def urgent_award_actions(state) -> list[dict]:
    """Return list of fund recommendations sorted by urgency, then by lead."""
    awards = getattr(state, "awards", None) or []
    funded = sum(1 for a in awards if a.get("funded_by"))
    if funded >= 3:
        return []
    cost = _COST_SCHEDULE[funded]
    slots_left = 3 - funded
    me_color = getattr(state.me, "color", "?")
    gen = getattr(state, "generation", 1) or 1

    opps = getattr(state, "opponents", []) or []
    opp_mcs = [(getattr(o, "color", "?"), getattr(o, "mc", 0) or 0) for o in opps]

    out: list[dict] = []
    for a in awards:
        if a.get("funded_by"):
            continue
        scores = a.get("scores", {}) or {}
        my_val = scores.get(me_color, 0) or 0
        opp_entries = [(c, v or 0) for c, v in scores.items() if c != me_color]
        opp_max = max((v for _, v in opp_entries), default=0)
        lead = my_val - opp_max
        # opp threatens THIS award (within ~2 of my score) AND has MC to fund
        opp_can_fund = any(
            mc >= cost and (scores.get(color, 0) or 0) >= my_val - 2
            for color, mc in opp_mcs
        )

        if my_val == 0 and lead <= 0:
            continue

        if lead > 0:
            my_rank = 1
        elif my_val == opp_max and my_val > 0:
            my_rank = 1  # tie for first (simplified: 2 VP in this codebase)
        elif my_val > 0:
            my_rank = 2
        else:
            my_rank = 3

        urgency = _classify_urgency(
            slots_left=slots_left,
            my_rank=my_rank,
            lead=lead,
            opp_can_fund=opp_can_fund,
            gen=gen,
        )
        if urgency is None:
            continue

        out.append({
            "award_name": a.get("name", "?"),
            "cost": cost,
            "my_score": my_val,
            "opp_max_score": opp_max,
            "my_rank": my_rank,
            "lead": lead,
            "urgency": urgency,
            "slots_left": slots_left,
            "opp_can_fund": opp_can_fund,
            "reason": _format_reason(
                a.get("name", "?"), urgency, lead, slots_left, opp_can_fund
            ),
        })

    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}
    out.sort(key=lambda x: (order[x["urgency"]], -x["lead"]))
    return out


def _classify_urgency(
    slots_left: int, my_rank: int, lead: int, opp_can_fund: bool, gen: int
) -> str | None:
    if my_rank > 2:
        return None

    if slots_left == 1 and my_rank == 1 and lead >= 1 and opp_can_fund:
        return "CRITICAL"

    if slots_left == 1 and my_rank == 1 and lead == 0 and opp_can_fund:
        return "HIGH"

    if slots_left <= 2 and my_rank == 1 and lead <= 1 and opp_can_fund and gen >= 6:
        return "HIGH"

    if gen >= 8 and my_rank == 1 and lead >= 1:
        return "HIGH"

    if my_rank == 1 and lead >= 2:
        return "MEDIUM"

    return None


def _format_reason(
    name: str, urgency: str, lead: int, slots_left: int, opp_can_fund: bool
) -> str:
    bits = []
    if urgency == "CRITICAL":
        bits.append("LAST SLOT")
    if lead > 0:
        bits.append(f"lead +{lead}")
    elif lead == 0:
        bits.append("tied 1st")
    if opp_can_fund:
        bits.append("opp has MC")
    if urgency == "HIGH" and slots_left > 1:
        bits.append("close race")
    return f"{urgency} {name}: " + ", ".join(bits)
