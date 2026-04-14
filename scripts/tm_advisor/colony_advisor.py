"""Colony Advisor — полный анализ колоний: торговля, settlement, модификаторы."""

import re

from .constants import (
    COLONY_TRADE_DATA,
    TRADE_DISCOUNT_CARDS,
    TRADE_TRACK_BOOST_CARDS,
    TRADE_MC_BONUS_CARDS,
    FREE_TRADE_CARDS,
    COLONY_SYNERGY_CARDS,
    COLONY_STANDARD_PROJECT_COST,
    COLONY_TIERS,
    COLONY_BUILD_THRESHOLDS,
)
from .economy import resource_values
from .analysis import _estimate_remaining_gens
from .shared_data import load_data_json


# ── Resource MC conversion ──

def _resource_mc_value(resource: str, rv: dict, gens_left: int) -> float:
    """Конвертация единицы ресурса колонии в MC-эквивалент.

    Для MC+Ocean (Europa): returns 1.0 per unit — ocean добавляется отдельно
    через _ocean_bonus_value() в colony_trade_value_at().
    """
    mapping = {
        "MC": 1.0,
        "Plants": rv["plant"],
        "Energy": rv.get("energy_prod", gens_left * 1.5) / max(gens_left, 1) if gens_left > 1 else 0.5,
        "Heat": rv["heat"],
        "Steel": rv["steel"],
        "Titanium": rv["titanium"],
        "Cards": rv["card"],
        "Animals": 5.0,
        "Floaters": 3.0,
        "Microbes": 2.5,
        "MC+Ocean": 1.0,  # Europa: N MC (ocean added separately)
    }
    return mapping.get(resource, 1.0)


def _parse_bonus_mc(bonus_str: str, rv: dict) -> float:
    """Парсит строку бонуса колонии и возвращает MC-эквивалент.

    Примеры: '2 MC-prod', '1 plant', '1 ti', '3 energy', '1 card',
             '1 animal', '1 floater', '1 microbe', '+2 MC-prod',
             '+3 ti', '+2 cards', 'Place ocean'
    """
    s = bonus_str.strip().lstrip("+")
    if not s:
        return 0.0

    s_low = s.lower()

    if "ocean" in s_low:
        return rv["ocean"]

    m = re.match(r'(\d+)\s+(.+)', s)
    if not m:
        return 0.0

    amount = int(m.group(1))
    res = m.group(2).strip().lower()

    # Production types
    if "mc-prod" in res or "mc prod" in res:
        return amount * rv["mc_prod"]
    if "plant-prod" in res or "plant prod" in res:
        return amount * rv["plant_prod"]
    if "energy-prod" in res or "energy prod" in res:
        return amount * rv["energy_prod"]
    if "heat-prod" in res or "heat prod" in res:
        return amount * rv["heat_prod"]
    if "steel-prod" in res or "steel prod" in res:
        return amount * rv["steel_prod"]
    if "ti-prod" in res or "titanium-prod" in res:
        return amount * rv["ti_prod"]

    # Instant resources
    if res in ("mc",):
        return amount * 1.0
    if res in ("plant", "plants"):
        return amount * rv["plant"]
    if res in ("energy",):
        return amount * rv.get("heat", 1.0)  # energy → heat next gen
    if res in ("heat",):
        return amount * rv["heat"]
    if res in ("steel",):
        return amount * rv["steel"]
    if res in ("ti", "titanium"):
        return amount * rv["titanium"]
    if res in ("card", "cards"):
        return amount * rv["card"]
    if res in ("animal", "animals"):
        return amount * 5.0
    if res in ("floater", "floaters"):
        return amount * 3.0
    if res in ("microbe", "microbes"):
        return amount * 2.5

    return 0.0


def _parse_bonus_amount(bonus_str: str, resource_tokens: tuple[str, ...]) -> int:
    """Return immediate resource amount from strings like '+3 energy'."""
    s = (bonus_str or "").strip().lstrip("+").lower()
    if not s:
        return 0
    m = re.match(r'(\d+)\s+(.+)', s)
    if not m:
        return 0
    amount = int(m.group(1))
    resource = m.group(2).strip()
    if any(token in resource for token in resource_tokens):
        return amount
    return 0


_RESOURCE_COLONY_TYPES = {
    "Titan": "floater",
    "Enceladus": "microbe",
    "Miranda": "animal",
}
_EUROPA_OCEAN_PAYOFFS = {
    "Arctic Algae",
    "Kelp Farming",
    "Lakefront Resorts",
    "Aquifer Pumping",
    "Ice Cap Melting",
    "Giant Ice Asteroid",
}
_ALL_CARD_DATA = {
    entry.get("name", ""): entry
    for entry in load_data_json("all_cards.json")
    if isinstance(entry, dict) and entry.get("name")
}


def _strip_variant(name: str) -> str:
    return name[:-5] if name.endswith(":ares") else name


def _lookup_card_info(name: str) -> dict:
    return _ALL_CARD_DATA.get(_strip_variant(name), {})


def _resource_colony_support_context(state, colony_name: str) -> dict:
    resource_kind = _RESOURCE_COLONY_TYPES.get(colony_name)
    if not resource_kind:
        return {"delta_per_unit": 0.0, "reason": ""}

    hits: list[tuple[float, str]] = []

    def consider(card_name: str, *, resources: int = 0, in_hand: bool = False):
        info = _lookup_card_info(card_name)
        if str(info.get("resourceType", "")).lower() != resource_kind:
            return

        score = 1.0
        if info.get("hasAction"):
            score += 0.6

        victory_points = str(info.get("victoryPoints", "") or "").lower()
        if "/resource" in victory_points or "resources" in victory_points:
            score += 1.2
        elif victory_points == "special":
            score += 0.5

        if resources > 0 and not in_hand:
            score += min(0.8, resources * 0.2)

        if resource_kind == "floater" and card_name in FREE_TRADE_CARDS:
            score += 1.2

        if in_hand:
            score *= 0.7

        hits.append((score, card_name))

    for card in (state.me.tableau or []):
        if not isinstance(card, dict) or not card.get("name"):
            continue
        consider(card.get("name", ""), resources=int(card.get("resources", 0) or 0), in_hand=False)

    for card in (state.cards_in_hand or []):
        if not isinstance(card, dict) or not card.get("name"):
            continue
        consider(card.get("name", ""), in_hand=True)

    hits.sort(reverse=True)
    total = sum(score for score, _ in hits)
    labels = [name for _, name in hits[:2]]
    label_part = f" ({', '.join(labels)})" if labels else ""

    if total <= 0.05:
        return {"delta_per_unit": -0.8, "reason": f"no good {resource_kind} sinks"}
    if total < 2.0:
        return {"delta_per_unit": 0.5, "reason": f"{resource_kind} sink online{label_part}"}
    if total < 4.0:
        return {"delta_per_unit": 1.0, "reason": f"good {resource_kind} sinks{label_part}"}
    return {"delta_per_unit": 1.5, "reason": f"strong {resource_kind} sinks{label_part}"}


def _resource_colony_amount_delta(state, colony_name: str, *, amount: int) -> dict:
    if amount <= 0:
        return {"delta_mc": 0.0, "reason": ""}
    ctx = _resource_colony_support_context(state, colony_name)
    return {
        "delta_mc": round(amount * ctx.get("delta_per_unit", 0.0), 1),
        "reason": ctx.get("reason", ""),
    }


def _has_europa_ocean_shell(tableau_names: set[str], hand_names: set[str]) -> bool:
    return bool((tableau_names | hand_names) & _EUROPA_OCEAN_PAYOFFS)


def _apply_resource_colony_trade_context(state, colony_name: str, val: dict, my_settlers: int) -> dict:
    cdata = COLONY_TRADE_DATA.get(colony_name) or {}
    resource_kind = _RESOURCE_COLONY_TYPES.get(colony_name)
    if not resource_kind:
        return {"delta_mc": 0.0, "reason": ""}

    track_amount = int(val.get("raw_amount", 0) or 0)
    colony_bonus_amount = _parse_bonus_amount(cdata.get("colony_bonus", ""), (resource_kind, f"{resource_kind}s"))
    track_ctx = _resource_colony_amount_delta(state, colony_name, amount=track_amount)
    settler_ctx = _resource_colony_amount_delta(state, colony_name, amount=colony_bonus_amount * my_settlers)
    delta_total = round(track_ctx["delta_mc"] + settler_ctx["delta_mc"], 1)
    if abs(delta_total) <= 0.05:
        return {"delta_mc": 0.0, "reason": ""}

    val["trade_mc"] = round(val["trade_mc"] + track_ctx["delta_mc"], 1)
    val["settler_mc"] = round(val["settler_mc"] + settler_ctx["delta_mc"], 1)
    val["total_mc"] = round(val["total_mc"] + delta_total, 1)
    val["resource_support_bonus"] = delta_total
    val["resource_support_reason"] = track_ctx.get("reason", "") or settler_ctx.get("reason", "")
    return {"delta_mc": delta_total, "reason": val["resource_support_reason"]}


def _is_player_passed(state, player) -> bool:
    passed = set(getattr(state, "passed_players", []) or [])
    raw = getattr(player, "raw", {}) or {}
    return bool(raw.get("passed")) or player.color in passed or player.name in passed


def _seat_trade_weight(state, player_color: str) -> float:
    order = getattr(state, "player_order", []) or []
    my_color = getattr(state.me, "color", None)
    if not order or my_color not in order or player_color not in order:
        return 1.0
    my_idx = order.index(my_color)
    opp_idx = order.index(player_color)
    if opp_idx > my_idx:
        return 1.0
    if opp_idx < my_idx:
        return 0.75
    return 0.0


def _opponent_trade_readiness(opp) -> tuple[float, str]:
    fleets_left = max(0, getattr(opp, "fleet_size", 0) - getattr(opp, "trades_this_gen", 0))
    if fleets_left <= 0:
        return 0.0, ""

    modifiers = _get_trade_modifiers(opp)
    energy_cost = max(1, 3 - modifiers.get("energy_discount", 0))
    tableau = getattr(opp, "tableau", []) or []

    if getattr(opp, "energy", 0) >= energy_cost:
        return 1.0, f"{energy_cost} energy"
    if getattr(opp, "mc", 0) >= 9:
        return 0.65, "9 MC"
    for card in tableau:
        if card.get("name") in FREE_TRADE_CARDS and card.get("resources", 0) >= 1:
            return 0.9, f"1 floater ({card['name']})"
    return 0.0, ""


def _contest_pressure_context(state, colony_entry: dict, rv: dict, gens_left: int) -> dict:
    generation = getattr(state, "generation", 1) or 1
    if generation >= 9:
        return {"penalty": 0.0, "reason": ""}

    col_name = colony_entry["name"]
    current_track = int(colony_entry.get("track", 0) or 0)
    if current_track <= 1:
        return {"penalty": 0.0, "reason": ""}

    base_now = colony_trade_value_at(col_name, current_track, 0, rv, gens_left)["trade_mc"]
    base_reset = colony_trade_value_at(col_name, 0, 0, rv, gens_left)["trade_mc"]
    strip_value = max(0.0, base_now - base_reset)
    if strip_value < 4:
        return {"penalty": 0.0, "reason": ""}

    contenders: list[tuple[str, float]] = []
    for opp in getattr(state, "opponents", []) or []:
        if _is_player_passed(state, opp):
            continue

        readiness, _method = _opponent_trade_readiness(opp)
        if readiness <= 0:
            continue

        modifiers = _get_trade_modifiers(opp)
        opp_settlers = (colony_entry.get("settlers", []) or []).count(opp.color)
        effective_track = min(current_track + modifiers.get("track_boost", 0), 6)
        trade_val = colony_trade_value_at(col_name, effective_track, opp_settlers, rv, gens_left)
        total_mc = trade_val["total_mc"] + modifiers.get("mc_bonus", 0)
        if total_mc < 10:
            continue

        weight = readiness * _seat_trade_weight(state, opp.color)
        if total_mc >= 16:
            weight += 0.2
        contenders.append((opp.name, weight))

    if not contenders:
        return {"penalty": 0.0, "reason": ""}

    my_fleets_left = max(0, getattr(state.me, "fleet_size", 0) - getattr(state.me, "trades_this_gen", 0))
    my_interest = 1.0 if my_fleets_left > 0 else 0.55
    late_decay = 1.0 if generation <= 3 else 0.8 if generation <= 5 else 0.6
    total_weight = sum(weight for _, weight in contenders)
    penalty = round(min(7.0, total_weight * min(strip_value, 10.0) * 0.32 * my_interest * late_decay), 1)
    if penalty <= 0.4:
        return {"penalty": 0.0, "reason": ""}

    names = ", ".join(name for name, _ in contenders[:2])
    return {"penalty": penalty, "reason": f"{names} can strip track first"}


# ── Colony trade value ──

def colony_trade_value_at(colony_name: str, effective_track: int,
                          my_settlers: int, rv: dict, gens_left: int) -> dict:
    """Вычисляет MC-ценность торговли с колонией при данном track position."""
    cdata = COLONY_TRADE_DATA.get(colony_name)
    if not cdata:
        return {"name": colony_name, "resource": "?", "raw_amount": 0,
                "trade_mc": 0, "settler_mc": 0, "total_mc": 0}

    track = cdata["track"]
    pos = min(max(effective_track, 0), len(track) - 1)
    raw_amount = track[pos]

    res_type = cdata["resource"]
    mc_per_unit = _resource_mc_value(res_type, rv, gens_left)
    trade_mc = raw_amount * mc_per_unit

    # MC+Ocean: add ocean value once (Europa gives N MC + 1 ocean per trade)
    if res_type == "MC+Ocean":
        trade_mc += rv["ocean"]

    # Settler bonus
    colony_bonus = cdata.get("colony_bonus", "")
    settler_bonus_mc = _parse_bonus_mc(colony_bonus, rv)
    settler_mc = settler_bonus_mc * my_settlers

    return {
        "name": colony_name,
        "resource": res_type,
        "raw_amount": raw_amount,
        "trade_mc": round(trade_mc, 1),
        "settler_mc": round(settler_mc, 1),
        "total_mc": round(trade_mc + settler_mc, 1),
    }


# ── Trade methods ──

def _get_trade_methods(me, rv: dict) -> list[dict]:
    """Определить доступные способы торговли и их стоимость в MC."""
    methods = []

    # Check for trade modifiers (energy discount)
    tableau_names = {c.get("name", "") for c in me.tableau} if me.tableau else set()
    energy_discount = sum(1 for card in TRADE_DISCOUNT_CARDS if card in tableau_names)
    energy_cost = max(1, 3 - energy_discount)

    # Standard: energy
    if me.energy >= energy_cost:
        energy_mc_cost = energy_cost * rv.get("heat", 1.0)
        methods.append({
            "method": "energy",
            "cost_mc": round(energy_mc_cost, 1),
            "cost_desc": f"{energy_cost} energy" + (f" (скидка -{energy_discount})" if energy_discount else ""),
        })

    # Standard: 9 MC
    if me.mc >= 9:
        methods.append({"method": "mc", "cost_mc": 9.0, "cost_desc": "9 MC"})

    # Titan Floating Launch-Pad: spend 1 floater -> free trade
    for card in (me.tableau or []):
        if card.get("name") in FREE_TRADE_CARDS and card.get("resources", 0) >= 1:
            methods.append({
                "method": "free_floater",
                "cost_mc": 3.0,
                "cost_desc": f"1 floater ({card['name']})",
            })
            break

    return methods


def _get_trade_methods_after_build(me, rv: dict, build_bonus: str) -> list[dict]:
    """Trade methods available after building a colony and taking build bonus."""
    methods = []
    tableau_names = {c.get("name", "") for c in me.tableau} if me.tableau else set()
    energy_discount = sum(1 for card in TRADE_DISCOUNT_CARDS if card in tableau_names)
    energy_cost = max(1, 3 - energy_discount)
    build_energy = _parse_bonus_amount(build_bonus, ("energy",))
    energy_after_build = (me.energy or 0) + build_energy
    if energy_after_build >= energy_cost:
        energy_mc_cost = energy_cost * rv.get("heat", 1.0)
        methods.append({
            "method": "energy",
            "cost_mc": round(energy_mc_cost, 1),
            "cost_desc": f"{energy_cost} energy" + (f" (скидка -{energy_discount})" if energy_discount else ""),
        })

    mc_after_build = max(0, (me.mc or 0) - COLONY_STANDARD_PROJECT_COST)
    if mc_after_build >= 9:
        methods.append({"method": "mc", "cost_mc": 9.0, "cost_desc": "9 MC"})

    for card in (me.tableau or []):
        if card.get("name") in FREE_TRADE_CARDS and card.get("resources", 0) >= 1:
            methods.append({
                "method": "free_floater",
                "cost_mc": 3.0,
                "cost_desc": f"1 floater ({card['name']})",
            })
            break

    return methods


def _get_trade_modifiers(me) -> dict:
    """Считает торговые модификаторы из tableau."""
    tableau_names = {c.get("name", "") for c in me.tableau} if me.tableau else set()

    track_boost = 0
    for card_name, boost in TRADE_TRACK_BOOST_CARDS.items():
        if card_name in tableau_names:
            track_boost += boost

    mc_bonus = 0
    for card_name, bonus in TRADE_MC_BONUS_CARDS.items():
        if card_name in tableau_names:
            mc_bonus += bonus

    energy_discount = sum(1 for card in TRADE_DISCOUNT_CARDS if card in tableau_names)

    modifier_names = []
    if energy_discount:
        cards = [c for c in TRADE_DISCOUNT_CARDS if c in tableau_names]
        modifier_names.extend(f"{c} (-1 energy)" for c in cards)
    if track_boost:
        cards = [c for c in TRADE_TRACK_BOOST_CARDS if c in tableau_names]
        modifier_names.extend(f"{c} (+{TRADE_TRACK_BOOST_CARDS[c]} track)" for c in cards)
    if mc_bonus:
        cards = [c for c in TRADE_MC_BONUS_CARDS if c in tableau_names]
        modifier_names.extend(f"{c} (+{TRADE_MC_BONUS_CARDS[c]} MC)" for c in cards)

    return {
        "track_boost": track_boost,
        "mc_bonus": mc_bonus,
        "energy_discount": energy_discount,
        "descriptions": modifier_names,
    }


_IMMEDIATE_ENERGY_ACTION_CARDS = {
    "Power Infrastructure",
    "Development Center",
    "Physics Complex",
    "Space Elevator",
    "Ironworks",
    "Steelworks",
    "Ore Processor",
    "Water Splitting Plant",
}

_ENERGY_FLEX_CARDS = {
    "Energy Market",
}


def _trade_pool_quality(state, *, exclude: set[str] | None = None) -> dict:
    """Estimate how rewarding current colony pool is for spending energy on trade."""
    exclude = exclude or set()
    me = state.me
    fleets_left = max(0, getattr(me, "fleet_size", 0) - getattr(me, "trades_this_gen", 0))
    top_n = 3 if fleets_left >= 2 else 2

    ranked = []
    for col in state.colonies_data or []:
        name = col.get("name")
        if not name or name in exclude or not col.get("isActive", True):
            continue
        ranked.append((COLONY_TIERS.get(name, {}).get("score", 0), name))
    ranked.sort(reverse=True)
    focus = ranked[:top_n]

    premium = [name for score, name in focus if score >= 75]
    good = [name for score, name in focus if 70 <= score < 75]
    weak = [name for score, name in focus if score <= 66]
    score = len(premium) * 2 + len(good) - len(weak)

    return {
        "score": score,
        "premium": premium,
        "good": good,
        "weak": weak,
    }


def _energy_tempo_context(state, *, build_bonus: str = "", exclude_colony: str | None = None) -> dict:
    """Estimate whether immediate energy matters for current colony tempo."""
    me = state.me
    generation = getattr(state, "generation", 1) or 1
    fleets_left = max(0, getattr(me, "fleet_size", 0) - getattr(me, "trades_this_gen", 0))
    tableau_names = {c.get("name", "") for c in me.tableau} if me.tableau else set()
    hand_names = {c.get("name", "") for c in (state.cards_in_hand or [])}
    all_names = tableau_names | hand_names

    quality = _trade_pool_quality(state, exclude={exclude_colony} if exclude_colony else None)
    immediate_sinks = [name for name in _IMMEDIATE_ENERGY_ACTION_CARDS if name in tableau_names]
    flex_sinks = [name for name in _ENERGY_FLEX_CARDS if name in all_names]

    energy_gain = _parse_bonus_amount(build_bonus, ("energy",))
    rv = resource_values(_estimate_remaining_gens(state))
    modifiers = _get_trade_modifiers(me)
    energy_trade_cost = max(1, 3 - modifiers.get("energy_discount", 0))
    current_methods = _get_trade_methods(me, rv) if state.colonies_data else []
    methods_after = _get_trade_methods_after_build(me, rv, build_bonus) if build_bonus else []

    bonus = 0
    parts: list[str] = []

    if energy_gain > 0 and generation <= 4 and fleets_left > 0:
        unlocks_trade = (
            getattr(me, "energy", 0) < energy_trade_cost <= getattr(me, "energy", 0) + energy_gain
            and bool(methods_after)
        )
        if unlocks_trade:
            trade_bonus = 3 + max(0, quality["score"])
            if generation <= 2:
                trade_bonus += 1
            if current_methods:
                cheapest_now = min(m["cost_mc"] for m in current_methods)
                cheapest_after = min(m["cost_mc"] for m in methods_after)
                trade_bonus += 1 if cheapest_after + 0.5 < cheapest_now else -1
            else:
                trade_bonus += 1
            bonus += max(1, trade_bonus)
            parts.append(f"+{energy_gain} energy unlocks trade now")

        if quality["score"] < 0:
            bonus += quality["score"]
            parts.append("colony pool weak")
        elif quality["premium"] and (unlocks_trade or generation <= 2):
            parts.append(f"premium trade pool: {'/'.join(quality['premium'][:2])}")

    if generation <= 4 and immediate_sinks:
        sink_bonus = min(3, len(immediate_sinks))
        if generation <= 2:
            sink_bonus += 1
        bonus += sink_bonus
        parts.append(f"energy actions: {', '.join(immediate_sinks[:2])}")
    elif generation <= 3 and flex_sinks and quality["score"] > 0:
        bonus += 1
        parts.append(f"energy flex: {', '.join(flex_sinks[:1])}")

    urgency = max(0, quality["score"]) + len(immediate_sinks) + len(flex_sinks)
    if fleets_left >= 2:
        urgency += 1

    return {
        "bonus": bonus,
        "parts": parts,
        "urgency": urgency,
        "quality": quality,
        "immediate_sinks": immediate_sinks,
        "flex_sinks": flex_sinks,
        "fleets_left": fleets_left,
        "energy_trade_cost": energy_trade_cost,
    }


def _build_then_trade_outcome(state, colony_entry: dict, rv: dict,
                              modifiers: dict, current_best_net: float,
                              current_methods: list[dict]) -> dict | None:
    """Evaluate whether building a colony first creates a stronger immediate trade line."""
    me = state.me
    if me.trades_this_gen >= me.fleet_size:
        return None

    settlers = colony_entry.get("settlers", [])
    if (3 - len(settlers)) <= 0 or me.color in settlers:
        return None

    col_name = colony_entry["name"]
    cdata = COLONY_TRADE_DATA.get(col_name)
    if not cdata:
        return None

    build_bonus = cdata.get("build", "")
    methods_after = _get_trade_methods_after_build(me, rv, build_bonus)
    if not methods_after:
        return None

    my_settlers_now = settlers.count(me.color)
    my_settlers_after = my_settlers_now + 1
    current_track = colony_entry.get("track", 0)
    effective_track_after = min(current_track + 1 + modifiers["track_boost"], 6)
    after_val = colony_trade_value_at(
        col_name, effective_track_after, my_settlers_after, rv, _estimate_remaining_gens(state)
    )
    _apply_resource_colony_trade_context(state, col_name, after_val, my_settlers_after)
    total_after = after_val["total_mc"] + modifiers["mc_bonus"]
    best_cost_after = min(m["cost_mc"] for m in methods_after)
    net_after = round(total_after - best_cost_after, 1)

    unlocks_trade = not current_methods and bool(methods_after)
    baseline_net = max(0.0, current_best_net)
    tempo_gain = round(net_after - baseline_net, 1)
    if unlocks_trade and "energy" in build_bonus.lower():
        energy_ctx = _energy_tempo_context(state, build_bonus=build_bonus, exclude_colony=col_name)
        tempo_gain = round(tempo_gain + max(0, energy_ctx["bonus"]) * 0.5, 1)
    if not unlocks_trade and tempo_gain < 1.5:
        return None

    if unlocks_trade and "energy" in build_bonus.lower():
        hint = f"Сначала {col_name}: {build_bonus} → trade сейчас"
    else:
        hint = (
            f"Сначала {col_name}, потом trade: track {current_track}→{effective_track_after}, "
            f"{cdata.get('colony_bonus', '')} (+{tempo_gain} MC темпа)"
        )

    return {
        "name": col_name,
        "hint": hint,
        "tempo_gain": tempo_gain,
        "net_after": net_after,
        "unlocks_trade": unlocks_trade,
    }


# ── Main analysis functions ──

def analyze_trade_options(state) -> dict:
    """Полный анализ trade options: MC-ценность, модификаторы, net profit.

    Returns dict with keys:
        trades: list[dict] — sorted by net_profit desc
        methods: list[dict] — available trade methods
        modifiers: dict — active modifiers
        best_hint: str — one-line recommendation
    """
    if not state.colonies_data:
        return {"trades": [], "methods": [], "modifiers": {}, "best_hint": ""}

    me = state.me
    gens_left = _estimate_remaining_gens(state)
    rv = resource_values(gens_left)

    # Fleet check: already traded this gen?
    if me.trades_this_gen >= me.fleet_size:
        return {
            "trades": [],
            "methods": [],
            "modifiers": {},
            "best_hint": f"Флот занят ({me.trades_this_gen}/{me.fleet_size} trades)",
        }

    methods = _get_trade_methods(me, rv)
    modifiers = _get_trade_modifiers(me)

    trades = []
    if methods:
        best_cost = min(m["cost_mc"] for m in methods)
        for col in state.colonies_data:
            col_name = col["name"]
            settlers = col.get("settlers", [])
            my_settlers = settlers.count(me.color)

            effective_track = min(col["track"] + modifiers["track_boost"], 6)

            val = colony_trade_value_at(col_name, effective_track, my_settlers, rv, gens_left)
            _apply_resource_colony_trade_context(state, col_name, val, my_settlers)
            val["effective_track"] = effective_track
            val["original_track"] = col["track"]
            val["total_mc"] += modifiers["mc_bonus"]
            val["mc_bonus"] = modifiers["mc_bonus"]
            val["net_profit"] = round(val["total_mc"] - best_cost, 1)
            val["best_cost"] = best_cost
            val["settlers_count"] = len(settlers)
            val["my_settlers"] = my_settlers
            trades.append(val)

        trades.sort(key=lambda x: x["net_profit"], reverse=True)

    def _trade_hint_is_worthy(entry: dict) -> bool:
        if not entry or entry["net_profit"] <= 0:
            return False

        generation = getattr(state, "generation", 1) or 1
        tier_score = COLONY_TIERS.get(entry["name"], {}).get("score", 0)
        active_colonies = {
            col.get("name")
            for col in state.colonies_data
            if col.get("isActive", True)
        }
        engine_colonies = {"Luna", "Pluto", "Triton", "Ceres"}

        # Early-game MC trades should only alert when the upside is clearly real.
        if generation <= 2 and entry["best_cost"] >= 9 and entry["net_profit"] < 2 and tier_score < 75:
            return False

        # Europa often shows tiny raw net value while stronger engine colonies define the opener.
        if (
            entry["name"] == "Europa"
            and generation <= 2
            and entry["net_profit"] < 3
            and len(active_colonies & engine_colonies) >= 2
        ):
            return False

        return True

    current_best_net = trades[0]["net_profit"] if trades else 0
    build_before_trade = None
    for col in state.colonies_data:
        candidate = _build_then_trade_outcome(
            state, col, rv, modifiers, current_best_net, methods
        )
        if not candidate:
            continue
        if (
            build_before_trade is None
            or candidate["tempo_gain"] > build_before_trade["tempo_gain"]
            or (candidate["unlocks_trade"] and not build_before_trade["unlocks_trade"])
        ):
            build_before_trade = candidate

    # Best hint
    best_hint = ""
    if build_before_trade and (
        build_before_trade["unlocks_trade"]
        or not trades
        or not _trade_hint_is_worthy(trades[0])
        or build_before_trade["tempo_gain"] >= 2
    ):
        best_hint = build_before_trade["hint"]
    elif trades and _trade_hint_is_worthy(trades[0]):
        t = trades[0]
        best_hint = (f"Trade {t['name']} (+{t['net_profit']} MC net, "
                     f"{t['raw_amount']} {t['resource']})")
    elif trades:
        best_hint = "Trade невыгоден в этом gen"
    else:
        best_hint = "Нет ресурсов для торговли (нужно 3 energy или 9 MC)"

    return {
        "trades": trades,
        "methods": methods,
        "modifiers": modifiers,
        "best_hint": best_hint,
        "build_before_trade": build_before_trade,
    }


def analyze_settlement(state) -> list[dict]:
    """Анализ: куда ставить колонию и стоит ли (17 MC standard project)."""
    if not state.colonies_data:
        return []

    me = state.me
    gens_left = _estimate_remaining_gens(state)
    rv = resource_values(gens_left)
    methods_now = _get_trade_methods(me, rv)
    modifiers = _get_trade_modifiers(me)
    current_trades = analyze_trade_options(state)["trades"] if state.colonies_data else []
    current_best_net = current_trades[0]["net_profit"] if current_trades else 0

    results = []
    for col in state.colonies_data:
        settlers = col.get("settlers", [])
        slots = 3 - len(settlers)
        if slots <= 0:
            continue
        if me.color in settlers:
            continue  # already settled

        col_name = col["name"]
        cdata = COLONY_TRADE_DATA.get(col_name)
        if not cdata:
            continue

        build_mc_base = _parse_bonus_mc(cdata.get("build", ""), rv)
        colony_bonus_mc_base = _parse_bonus_mc(cdata.get("colony_bonus", ""), rv)
        resource_kind = _RESOURCE_COLONY_TYPES.get(col_name)
        build_amount = _parse_bonus_amount(cdata.get("build", ""), (resource_kind, f"{resource_kind}s")) if resource_kind else 0
        colony_bonus_amount = _parse_bonus_amount(cdata.get("colony_bonus", ""), (resource_kind, f"{resource_kind}s")) if resource_kind else 0
        build_ctx = _resource_colony_amount_delta(state, col_name, amount=build_amount)
        owner_ctx = _resource_colony_amount_delta(state, col_name, amount=colony_bonus_amount)

        # Build bonus (one-time)
        build_mc = build_mc_base + build_ctx["delta_mc"]

        # Future colony bonus per trade (remaining gens ~ trades)
        colony_bonus_mc = colony_bonus_mc_base + owner_ctx["delta_mc"]
        expected_trades = min(gens_left, max(1, gens_left - 1))  # ~1 trade/gen
        future_value = colony_bonus_mc * expected_trades

        total_value = build_mc + future_value
        cost = COLONY_STANDARD_PROJECT_COST
        roi_gens = max(1, round(cost / max(colony_bonus_mc, 0.1))) if colony_bonus_mc > 0 else 99
        build_trade = _build_then_trade_outcome(
            state, col, rv, modifiers, current_best_net, methods_now
        )
        if build_trade:
            total_value += max(0, build_trade["tempo_gain"])
        contest_ctx = _contest_pressure_context(state, col, rv, gens_left)
        if contest_ctx["penalty"] > 0:
            total_value -= contest_ctx["penalty"]

        worth_it = total_value >= cost * 0.7  # 70% threshold

        entry = {
            "name": col_name,
            "slots": slots,
            "build_bonus": cdata.get("build", ""),
            "build_mc": round(build_mc, 1),
            "colony_bonus": cdata.get("colony_bonus", ""),
            "colony_bonus_mc": round(colony_bonus_mc, 1),
            "future_value": round(future_value, 1),
            "resource_support_bonus": round((build_mc - build_mc_base) + ((colony_bonus_mc - colony_bonus_mc_base) * expected_trades), 1),
            "resource_support_reason": build_ctx.get("reason", "") or owner_ctx.get("reason", ""),
            "contest_risk_penalty": contest_ctx["penalty"],
            "contest_risk_reason": contest_ctx["reason"],
            "total_value": round(total_value, 1),
            "cost": cost,
            "roi_gens": roi_gens,
            "worth_it": worth_it,
        }
        if build_trade:
            entry["tempo_trade_gain"] = round(build_trade["tempo_gain"], 1)
            entry["build_trade_hint"] = build_trade["hint"]

        # Tier info from COLONY_TIERS
        tier_data = COLONY_TIERS.get(col_name)
        if tier_data:
            entry["tier"] = tier_data["tier"]
            entry["tier_score"] = tier_data["score"]
            entry["tier_advice"] = tier_data["why"]
            entry["best_with"] = tier_data.get("best_with", [])

        results.append(entry)

    results.sort(key=lambda x: x["total_value"], reverse=True)
    return results


# ── Formatting helpers ──

def format_trade_hints(state) -> list[str]:
    """Форматированные строки для ANSI display (замена _trade_optimizer)."""
    result = analyze_trade_options(state)
    hints = []

    if not result["trades"]:
        if result["best_hint"]:
            hints.append(f"🚀 {result['best_hint']}")
        me = state.me
        energy_ctx = _energy_tempo_context(state)
        energy_trade_cost = energy_ctx["energy_trade_cost"]
        if (
            state.colonies_data
            and (getattr(state, "generation", 1) or 1) <= 4
            and getattr(me, "energy_prod", 0) < energy_trade_cost
            and energy_ctx["fleets_left"] > 0
            and energy_ctx["urgency"] > 1
        ):
            energy_deficit = energy_trade_cost - getattr(me, "energy_prod", 0)
            trade_targets = energy_ctx["quality"]["premium"] or energy_ctx["quality"]["good"]
            target_part = f" ({'/'.join(trade_targets[:2])})" if trade_targets else ""
            sinks = energy_ctx["immediate_sinks"] or energy_ctx["flex_sinks"]
            sink_part = f"; also {', '.join(sinks[:2])}" if sinks else ""
            hints.append(
                f"⚡ {energy_trade_cost} energy ASAP{target_part} для trade-tempo"
                f"{sink_part} (нужно ещё +{energy_deficit} energy-prod)"
            )
        return hints

    mods = result["modifiers"]
    if mods["descriptions"]:
        hints.append(f"🔧 Trade mods: {', '.join(mods['descriptions'])}")

    trades = result["trades"]
    if trades:
        best = trades[0]
        hints.append(
            f"🚀 Best trade: {best['name']} (track={best['original_track']}"
            f"→{best['effective_track']}, "
            f"{best['raw_amount']} {best['resource']} = "
            f"{best['total_mc']} MC, net +{best['net_profit']})")

        if len(trades) > 1 and trades[1]["net_profit"] > 0:
            second = trades[1]
            hints.append(
                f"   2nd: {second['name']} (track={second['effective_track']}, "
                f"{second['total_mc']} MC, net +{second['net_profit']})")

    methods = result["methods"]
    if methods:
        method_strs = [f"{m['cost_desc']} ({m['cost_mc']} MC)" for m in methods]
        hints.append(f"   Способы: {' │ '.join(method_strs)}")

    if result.get("build_before_trade"):
        hints.append(f"   🏗️ {result['build_before_trade']['hint']}")

    if state.colonies_data and not result.get("build_before_trade"):
        me = state.me
        for col in state.colonies_data:
            settlers = col.get("settlers", [])
            col_name = col["name"]
            if len(settlers) == 0 and me.color not in settlers:
                tier_data = COLONY_TIERS.get(col_name)
                if tier_data and tier_data["tier"] in ("S", "A"):
                    hints.append(
                        f"   🏗️ {col_name} пустая ({tier_data['tier']}-tier) — "
                        f"рассмотри build colony перед trade!")
                    break  # one hint is enough

    return hints


def format_settlement_hints(state) -> list[str]:
    """Форматированные строки для settlement рекомендаций."""
    settlements = analyze_settlement(state)
    if not settlements:
        return []

    me = state.me
    tableau_names = {c.get("name", "") for c in me.tableau} if me.tableau else set()

    hints = []
    for s in settlements[:3]:
        worth = "✅" if s["worth_it"] else "❌"
        tier_label = f" [{s['tier']}]" if "tier" in s else ""
        line = (
            f"{worth} **{s['name']}**{tier_label}: {s['slots']} слота, "
            f"settle={s['build_bonus']} ({s['build_mc']} MC), "
            f"future colony bonus ~{s['future_value']} MC → "
            f"total {s['total_value']} MC (ROI gen {s['roi_gens']}+)")

        # Check for synergy with tableau cards
        best_with = s.get("best_with", [])
        matched = [c for c in best_with if c in tableau_names]
        if matched:
            line += f" 🔗 синергия: {', '.join(matched)}"
        if s.get("tempo_trade_gain", 0) > 0 and s.get("build_trade_hint"):
            line += f" ⚡ {s['build_trade_hint']}"
        if abs(s.get("resource_support_bonus", 0)) >= 0.5 and s.get("resource_support_reason"):
            if s["resource_support_bonus"] > 0:
                line += f" 🔋 {s['resource_support_reason']}"
            else:
                line += f" ⚠ {s['resource_support_reason']}"
        if s.get("contest_risk_penalty", 0) > 0 and s.get("contest_risk_reason"):
            line += f" ⏳ {s['contest_risk_reason']} (-{s['contest_risk_penalty']})"

        hints.append(line)

    return hints


# ── Colony strategy advice ──

_COLONY_ICONS = {
    "Luna": "🌙", "Pluto": "📚", "Ganymede": "🌿", "Triton": "🚀",
    "Ceres": "⚒️", "Miranda": "🐾", "Enceladus": "🦠", "Europa": "🌊",
    "Titan": "🎈", "Io": "🔥", "Callisto": "⚡",
}


def colony_strategy_advice(state) -> list[str]:
    """Стратегические рекомендации по колониям на основе тиров и tableau.

    Returns list of top-3 hint strings sorted by priority.
    """
    if not state.colonies_data:
        return []

    me = state.me
    generation = state.generation
    gens_left = _estimate_remaining_gens(state)
    tableau_names = {c.get("name", "") for c in me.tableau} if me.tableau else set()
    hand_names = {c.get("name", "") for c in (state.cards_in_hand or [])}
    hand_names |= {c.get("name", "") for c in (getattr(state, "drafted_cards", None) or [])}
    active_colonies = {
        col.get("name")
        for col in state.colonies_data
        if col.get("isActive", True)
    }
    premium_engine_colonies = {"Luna", "Pluto", "Triton", "Ceres"}
    europa_ocean_shell = _has_europa_ocean_shell(tableau_names, hand_names)
    settlement_map = {entry["name"]: entry for entry in analyze_settlement(state)}

    candidates = []
    for col in state.colonies_data:
        col_name = col["name"]
        settlers = col.get("settlers", [])
        slots = 3 - len(settlers)

        # Skip full colonies or already settled
        if slots <= 0 or me.color in settlers:
            continue

        tier_data = COLONY_TIERS.get(col_name)
        if not tier_data:
            continue

        tier = tier_data["tier"]

        # Don't recommend C-tier colonies in late game (gen 7+)
        thresholds = COLONY_BUILD_THRESHOLDS.get(tier)
        if thresholds:
            max_gen, min_gens_for_roi = thresholds
            if generation > max_gen or gens_left < min_gens_for_roi:
                continue

        # Keep ranking conservative: tier baseline + narrow local context.
        score = tier_data["score"]
        best_with = tier_data.get("best_with", [])
        matched = [c for c in best_with if c in tableau_names or c in hand_names]
        if matched:
            score += 8
        settlement = settlement_map.get(col_name, {})
        tempo_trade_gain = settlement.get("tempo_trade_gain", 0) if settlement else 0
        resource_support_bonus = settlement.get("resource_support_bonus", 0) if settlement else 0
        resource_support_reason = settlement.get("resource_support_reason", "") if settlement else ""
        contest_risk_penalty = settlement.get("contest_risk_penalty", 0) if settlement else 0
        contest_risk_reason = settlement.get("contest_risk_reason", "") if settlement else ""
        if tempo_trade_gain > 0:
            score += min(5, int(round(tempo_trade_gain)))
        if abs(resource_support_bonus) >= 0.5:
            score += int(round(resource_support_bonus * 0.35))
        if contest_risk_penalty > 0:
            score -= min(6, int(round(contest_risk_penalty)))
        europa_pressure = False
        if col_name == "Europa" and generation <= 4 and not europa_ocean_shell:
            engine_count = len(active_colonies & premium_engine_colonies)
            if engine_count >= 2:
                score -= min(8, 4 + 2 * (engine_count - 2))
                europa_pressure = True

        icon = _COLONY_ICONS.get(col_name, "🪐")

        hint = f"{icon} {col_name} ({tier}-tier)"

        if settlement:
            build_bonus = (settlement.get("build_bonus", "") or "").strip()
            colony_bonus = (settlement.get("colony_bonus", "") or "").strip()
            future_value = settlement.get("future_value", 0)
            build_hint = build_bonus
            if build_hint.lower().startswith("place "):
                build_hint = build_hint[6:]

            if build_hint and colony_bonus and "prod" in colony_bonus.lower() and future_value >= 30:
                hint += f" — place {build_hint}; owner bonus grows with trades"
            elif build_hint:
                hint += f" — place {build_hint} + future owner bonus ~{future_value} MC"
            else:
                hint += f" — future owner bonus ~{future_value} MC"
        else:
            hint += f" — {tier_data['why'][:60]}"

        if col_name == "Luna":
            hint += "; сильный opener-темп"
        elif col_name == "Pluto":
            hint += "; draw/selection engine"
        elif col_name == "Callisto":
            cdata = COLONY_TRADE_DATA.get(col_name, {})
            energy_ctx = _energy_tempo_context(state, build_bonus=cdata.get("build", ""), exclude_colony=col_name)
            score += energy_ctx["bonus"]
            if energy_ctx["parts"]:
                hint += f" ⚡ {'; '.join(energy_ctx['parts'][:2])}"
        if matched and col_name not in ("Luna", "Pluto", "Callisto"):
            hint += f" 🔗 {', '.join(matched)}"
        if tempo_trade_gain > 0 and settlement.get("build_trade_hint"):
            hint += f" ⚡ {settlement['build_trade_hint']}"
        if abs(resource_support_bonus) >= 0.5 and resource_support_reason:
            if resource_support_bonus > 0:
                hint += f" 🔋 {resource_support_reason}"
            else:
                hint += f" ⚠ {resource_support_reason}"
        if contest_risk_penalty > 0 and contest_risk_reason:
            hint += f" ⏳ {contest_risk_reason}"
        if europa_pressure:
            hint += " ⚠ premium engine colonies first"

        candidates.append((score, hint))

    candidates.sort(key=lambda x: x[0], reverse=True)
    return [hint for _, hint in candidates[:3]]
