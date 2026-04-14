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

    # Best hint
    best_hint = ""
    if trades and _trade_hint_is_worthy(trades[0]):
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

        entry = {
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
        }

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

    # Suggest building before trading if empty colonies available
    if state.colonies_data:
        me = state.me
        tableau_names = {c.get("name", "") for c in me.tableau} if me.tableau else set()
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

        # Score: base tier score + synergy bonus
        score = tier_data["score"]
        best_with = tier_data.get("best_with", [])
        matched = [c for c in best_with if c in tableau_names]
        if matched:
            score += 10  # synergy bonus pushes it up in ranking

        icon = _COLONY_ICONS.get(col_name, "🪐")

        # Build the hint text
        hint = f"{icon} {col_name} ({tier}-tier)"

        if col_name == "Luna":
            hint += " — всегда строй первым действием. Build colony SP = лучший early game ход"
        elif col_name == "Pluto":
            mc_prod = getattr(me, 'mc_prod', 0)
            enough = "достаточно" if mc_prod >= 10 else "need more"
            hint += f" — лучшая при income. MC-prod={mc_prod}, {enough}"
        elif matched:
            hint += f" — есть {', '.join(matched)} в tableau!"
            if col_name == "Enceladus":
                hint += " Triple colony = almost win"
            elif col_name == "Miranda":
                hint += " Animal VP engine!"
        else:
            hint += f" — {tier_data['why'][:60]}"

        candidates.append((score, hint))

    candidates.sort(key=lambda x: x[0], reverse=True)
    return [hint for _, hint in candidates[:3]]
