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
)
from .economy import resource_values
from .analysis import _estimate_remaining_gens


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

    if not methods:
        return {
            "trades": [],
            "methods": [],
            "modifiers": modifiers,
            "best_hint": "Нет ресурсов для торговли (нужно 3 energy или 9 MC)",
        }

    best_cost = min(m["cost_mc"] for m in methods)

    trades = []
    for col in state.colonies_data:
        col_name = col["name"]
        settlers = col.get("settlers", [])
        my_settlers = settlers.count(me.color)

        effective_track = min(col["track"] + modifiers["track_boost"], 6)

        val = colony_trade_value_at(col_name, effective_track, my_settlers, rv, gens_left)
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

    # Best hint
    best_hint = ""
    if trades and trades[0]["net_profit"] > 0:
        t = trades[0]
        best_hint = (f"Trade {t['name']} (+{t['net_profit']} MC net, "
                     f"{t['raw_amount']} {t['resource']})")
    elif trades:
        best_hint = "Trade невыгоден в этом gen"

    return {
        "trades": trades,
        "methods": methods,
        "modifiers": modifiers,
        "best_hint": best_hint,
    }


def analyze_settlement(state) -> list[dict]:
    """Анализ: куда ставить колонию и стоит ли (17 MC standard project)."""
    if not state.colonies_data:
        return []

    me = state.me
    gens_left = _estimate_remaining_gens(state)
    rv = resource_values(gens_left)

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

        # Build bonus (one-time)
        build_mc = _parse_bonus_mc(cdata.get("build", ""), rv)

        # Future colony bonus per trade (remaining gens ~ trades)
        colony_bonus_mc = _parse_bonus_mc(cdata.get("colony_bonus", ""), rv)
        expected_trades = min(gens_left, max(1, gens_left - 1))  # ~1 trade/gen
        future_value = colony_bonus_mc * expected_trades

        total_value = build_mc + future_value
        cost = COLONY_STANDARD_PROJECT_COST
        roi_gens = max(1, round(cost / max(colony_bonus_mc, 0.1))) if colony_bonus_mc > 0 else 99

        worth_it = total_value >= cost * 0.7  # 70% threshold

        results.append({
            "name": col_name,
            "slots": slots,
            "build_bonus": cdata.get("build", ""),
            "build_mc": round(build_mc, 1),
            "colony_bonus": cdata.get("colony_bonus", ""),
            "colony_bonus_mc": round(colony_bonus_mc, 1),
            "future_value": round(future_value, 1),
            "total_value": round(total_value, 1),
            "cost": cost,
            "roi_gens": roi_gens,
            "worth_it": worth_it,
        })

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
        # "3 energy ASAP" advice when colonies exist but can't trade
        me = state.me
        if state.colonies_data and getattr(me, 'energy_prod', 0) < 3:
            energy_deficit = 3 - getattr(me, 'energy_prod', 0)
            hints.append(
                f"⚡ 3 energy ASAP для trade! (нужно ещё +{energy_deficit} energy-prod — "
                f"trade значительно дешевле через energy чем через 9 MC/3 Ti)")
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

    return hints


def format_settlement_hints(state) -> list[str]:
    """Форматированные строки для settlement рекомендаций."""
    settlements = analyze_settlement(state)
    if not settlements:
        return []

    hints = []
    for s in settlements[:3]:
        worth = "✅" if s["worth_it"] else "❌"
        hints.append(
            f"{worth} {s['name']}: {s['slots']} слота, "
            f"build={s['build_bonus']} ({s['build_mc']} MC), "
            f"future ~{s['future_value']} MC → "
            f"total {s['total_value']} MC (стоит {s['cost']} MC, ROI gen {s['roi_gens']}+)")

    return hints
