#!/usr/bin/env python
"""Quick advisor snapshot — fetch game state and run analysis.

Usage: python scripts/advisor_snapshot.py <player_id>

Outputs structured JSON with:
- Game state (gen, params, resources)
- Hand cards with scores + adjusted scores + synergy bonuses
- Tableau summary
- Alerts and recommendations
- VP estimates for all players
- Colony/trade recommendations
"""

import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.tm_advisor.client import TMClient
from scripts.tm_advisor.models import GameState
from scripts.tm_advisor.database import CardDatabase
from scripts.tm_advisor.card_parser import CardEffectParser
from scripts.tm_advisor.combo import ComboDetector
from scripts.tm_advisor.synergy import SynergyEngine
from scripts.tm_advisor.analysis import (
    _generate_alerts, _estimate_remaining_gens, _estimate_vp,
)
from scripts.tm_advisor.colony_advisor import (
    analyze_trade_options, colony_strategy_advice,
)
from scripts.tm_advisor.economy import resource_values, game_phase

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def snapshot(player_id: str) -> dict:
    # Init
    eval_path = os.path.join(DATA_DIR, "evaluations.json")
    db = CardDatabase(eval_path)
    parser = CardEffectParser(db)
    combo = ComboDetector(parser, db)
    synergy = SynergyEngine(db, combo)
    client = TMClient()

    # Fetch
    raw = client.get_player_state(player_id)
    state = GameState(raw)
    me = state.me

    gens_left = _estimate_remaining_gens(state)
    phase = game_phase(gens_left, state.generation)
    rv = resource_values(gens_left)

    # Player tags
    player_tags = {}
    for c in (me.tableau or []):
        for t in c.get("tags", []):
            player_tags[t] = player_tags.get(t, 0) + 1

    tableau_names = [c.get("name", "") for c in (me.tableau or [])]

    # Corp name
    corp_name = ""
    for c in (me.tableau or []):
        ctype = c.get("cardType", "")
        if ctype in ("corp", "corporation") or c.get("name", "") in (
            db._norm_index.keys() if hasattr(db, '_norm_index') else []
        ):
            if db.get(c.get("name", "")):
                d = db.get(c["name"])
                if d and d.get("type") in ("Corporation", "corporation", "corp"):
                    corp_name = c["name"]
                    break
    if not corp_name:
        for c in (me.tableau or []):
            name = c.get("name", "")
            if name and db.get(name) and db.get(name).get("type") in ("Corporation", "corporation"):
                corp_name = name
                break

    result = {
        "game": {
            "generation": state.generation,
            "phase": phase,
            "gens_left": gens_left,
            "temperature": state.temperature,
            "oxygen": state.oxygen,
            "oceans": state.oceans,
            "venus": state.venus,
        },
        "me": {
            "name": me.name,
            "corp": corp_name or "unknown",
            "tr": me.tr,
            "mc": me.mc,
            "steel": me.steel,
            "titanium": me.titanium,
            "plants": me.plants,
            "energy": me.energy,
            "heat": me.heat,
            "production": {
                "mc": me.mc_prod, "steel": me.steel_prod,
                "ti": me.ti_prod, "plant": me.plant_prod,
                "energy": me.energy_prod, "heat": me.heat_prod,
            },
            "tags": player_tags,
            "tableau_count": len(me.tableau or []),
            "hand_count": len(state.cards_in_hand or []),
        },
    }

    # Hand cards with scores
    hand_cards = []
    for card in (state.cards_in_hand or []):
        name = card.get("name", "")
        if not name:
            continue
        base_score = db.get_score(name) or 50
        card_tags = card.get("tags", [])
        adj_score = synergy.adjusted_score(
            name, card_tags, corp_name, state.generation,
            player_tags, state
        )
        combo_bonus = combo.get_hand_synergy_bonus(name, tableau_names, player_tags)
        hand_cards.append({
            "name": name,
            "cost": card.get("cost", 0),
            "tags": card_tags,
            "base_score": base_score,
            "adjusted_score": adj_score,
            "combo_bonus": combo_bonus,
            "tier": db.get(name).get("tier", "?") if db.get(name) else "?",
        })
    hand_cards.sort(key=lambda c: c["adjusted_score"], reverse=True)
    result["hand"] = hand_cards

    # Tableau VP cards
    tableau_vp = []
    for c in (me.tableau or []):
        name = c.get("name", "")
        resources = c.get("resources", 0)
        if resources and resources > 0:
            tableau_vp.append({"name": name, "resources": resources})
    result["tableau_vp_cards"] = tableau_vp

    # Combos detected
    combos_found = combo.analyze_tableau_combos(tableau_names,
        [c["name"] for c in hand_cards], player_tags)
    result["combos"] = [
        {"type": c["type"], "cards": c["cards"],
         "description": c["description"], "bonus": c["value_bonus"]}
        for c in combos_found[:10]
    ]

    # Alerts
    try:
        alerts = _generate_alerts(state)
        result["alerts"] = alerts
    except Exception as e:
        result["alerts"] = [f"Error: {e}"]

    # VP estimates
    vp_estimates = []
    try:
        my_vp = _estimate_vp(state)
        vp_estimates.append({"name": me.name, "vp": my_vp})
    except Exception:
        pass
    for opp in state.opponents:
        try:
            opp_vp = _estimate_vp(state, opp)
            vp_estimates.append({"name": opp.name, "vp": opp_vp})
        except Exception:
            pass
    result["vp_estimates"] = vp_estimates

    # Colony advice
    if state.colonies_data:
        try:
            trade = analyze_trade_options(state)
            result["trade"] = {
                "best": trade["trades"][0] if trade["trades"] else None,
                "hint": trade["best_hint"],
            }
        except Exception:
            pass
        try:
            col_advice = colony_strategy_advice(state)
            result["colony_advice"] = col_advice
        except Exception:
            pass

    # Economy summary
    income = me.mc_prod + me.tr
    steel_mc = me.steel * (me.steel_value if hasattr(me, 'steel_value') else 2)
    ti_mc = me.titanium * (me.ti_value if hasattr(me, 'ti_value') else 3)
    total_liquid = me.mc + steel_mc + ti_mc
    result["economy"] = {
        "income_per_gen": income,
        "liquid_mc": total_liquid,
        "next_gen_mc": total_liquid + income,
    }

    # Opponents summary
    opponents = []
    for opp in state.opponents:
        opponents.append({
            "name": opp.name,
            "tr": opp.tr,
            "mc": opp.mc,
            "production_mc": opp.mc_prod,
            "hand_count": opp.cards_in_hand_count if hasattr(opp, 'cards_in_hand_count') else 0,
            "tableau_count": len(opp.tableau) if opp.tableau else 0,
        })
    result["opponents"] = opponents

    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/advisor_snapshot.py <player_id>")
        sys.exit(1)

    pid = sys.argv[1]
    data = snapshot(pid)
    print(json.dumps(data, ensure_ascii=False, indent=2))
