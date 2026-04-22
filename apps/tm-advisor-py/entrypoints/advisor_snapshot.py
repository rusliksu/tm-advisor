#!/usr/bin/env python3
"""Canonical tm-advisor-py snapshot entrypoint."""

from __future__ import annotations

import json
import sys

from _bootstrap import add_repo_root


add_repo_root()

from scripts.tm_advisor.client import TMClient  # noqa: E402
from scripts.tm_advisor.models import GameState  # noqa: E402
from scripts.tm_advisor.database import CardDatabase  # noqa: E402
from scripts.tm_advisor.card_parser import CardEffectParser  # noqa: E402
from scripts.tm_advisor.combo import ComboDetector  # noqa: E402
from scripts.tm_advisor.synergy import SynergyEngine  # noqa: E402
from scripts.tm_advisor.analysis import (  # noqa: E402
    _generate_alerts, _estimate_remaining_gens, _estimate_vp, _score_to_tier,
)
from scripts.tm_advisor.colony_advisor import (  # noqa: E402
    analyze_trade_options, colony_strategy_advice,
)
from scripts.tm_advisor.economy import resource_values, game_phase  # noqa: E402
from scripts.tm_advisor.opponent_intent import (  # noqa: E402
    analyze_opponent_intents, format_opponent_intent_warnings,
)
from scripts.tm_advisor.requirements import RequirementsChecker  # noqa: E402
from scripts.tm_advisor.shared_data import resolve_data_path  # noqa: E402


def snapshot(player_id: str) -> dict:
    eval_path = str(resolve_data_path("evaluations.json"))
    db = CardDatabase(eval_path)
    parser = CardEffectParser(db)
    combo = ComboDetector(parser, db)
    synergy = SynergyEngine(db, combo)
    req_checker = RequirementsChecker(str(resolve_data_path("all_cards.json")))
    client = TMClient()

    raw = client.get_player_state(player_id)
    state = GameState(raw)
    me = state.me

    gens_left = _estimate_remaining_gens(state)
    phase = game_phase(gens_left, state.generation)
    rv = resource_values(gens_left)

    player_tags = dict(me.tags) if me.tags else {}
    tableau_names = [c.get("name", "") for c in (me.tableau or [])]

    corp_name = ""
    for c in (me.tableau or []):
        ctype = c.get("cardType", "")
        if ctype in ("corp", "corporation") or c.get("name", "") in (
            db._norm_index.keys() if hasattr(db, "_norm_index") else []
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

    current_draft = []
    if state.waiting_for and state.waiting_for.get("type") == "card":
        current_draft = GameState._parse_cards(state.waiting_for.get("cards", []))

    result = {
        "game": {
            "generation": state.generation,
            "phase": phase,
            "live_phase": state.phase,
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
                "mc": me.mc_prod,
                "steel": me.steel_prod,
                "ti": me.ti_prod,
                "plant": me.plant_prod,
                "energy": me.energy_prod,
                "heat": me.heat_prod,
            },
            "tags": player_tags,
            "tableau_count": len(me.tableau or []),
            "hand_count": len(state.cards_in_hand or []),
        },
    }

    show_initial_draft = (
        state.phase == "initial_drafting"
        or (
            state.generation <= 1
            and (state.dealt_corps or state.dealt_preludes or state.drafted_cards)
        )
    )

    if show_initial_draft:
        result["initial_draft"] = {
            "corp_options": [c["name"] for c in (state.dealt_corps or [])],
            "prelude_options": [c["name"] for c in (state.dealt_preludes or [])],
            "drafted_cards": [c["name"] for c in (state.drafted_cards or [])],
            "current_pack": [c["name"] for c in current_draft],
        }

    hand_cards = []
    for card in (state.cards_in_hand or []):
        name = card.get("name", "")
        if not name:
            continue
        base_score = db.get_score(name) or 50
        card_tags = card.get("tags", []) or (db.get_info(name) or {}).get("tags", [])
        adj_score = synergy.adjusted_score(name, card_tags, corp_name, state.generation, player_tags, state)
        effective_score, req_ok, req_reason = req_checker.adjust_score(adj_score, name, state)
        combo_bonus = combo.get_hand_synergy_bonus(name, tableau_names, player_tags)
        hand_cards.append({
            "name": name,
            "cost": card.get("cost", 0),
            "tags": card_tags,
            "base_score": base_score,
            "adjusted_score": adj_score,
            "effective_score": effective_score,
            "combo_bonus": combo_bonus,
            "tier": db.get(name).get("tier", "?") if db.get(name) else "?",
            "effective_tier": _score_to_tier(effective_score),
            "req_ok": req_ok,
            "req_reason": req_reason,
        })
    hand_cards.sort(key=lambda c: c["effective_score"], reverse=True)
    result["hand"] = hand_cards

    if current_draft:
        draft_cards = []
        for card in current_draft:
            name = card.get("name", "")
            if not name:
                continue
            base_score = db.get_score(name) or 50
            adj_score = synergy.adjusted_score(
                name, card.get("tags", []), corp_name, state.generation, player_tags, state
            )
            draft_cards.append({
                "name": name,
                "cost": card.get("cost", 0),
                "tags": card.get("tags", []) or (db.get_info(name) or {}).get("tags", []),
                "base_score": base_score,
                "adjusted_score": adj_score,
                "tier": db.get(name).get("tier", "?") if db.get(name) else "?",
            })
        draft_cards.sort(key=lambda c: c["adjusted_score"], reverse=True)
        result["current_draft"] = draft_cards

    tableau_vp = []
    for c in (me.tableau or []):
        name = c.get("name", "")
        resources = c.get("resources", 0)
        if resources and resources > 0:
            tableau_vp.append({"name": name, "resources": resources})
    result["tableau_vp_cards"] = tableau_vp

    combos_found = combo.analyze_tableau_combos(tableau_names, [c["name"] for c in hand_cards], player_tags)
    result["combos"] = [
        {
            "type": c["type"],
            "cards": c["cards"],
            "description": c["description"],
            "bonus": c["value_bonus"],
        }
        for c in combos_found[:10]
    ]

    try:
        result["alerts"] = _generate_alerts(state)
    except Exception as e:
        result["alerts"] = [f"Error: {e}"]
    try:
        result["opponent_intents"] = analyze_opponent_intents(state)
        result["alerts"].extend(format_opponent_intent_warnings(state))
    except Exception as e:
        result["opponent_intents"] = [{"error": str(e)}]

    vp_estimates = []
    try:
        vp_estimates.append({"name": me.name, "vp": _estimate_vp(state)})
    except Exception:
        pass
    for opp in state.opponents:
        try:
            vp_estimates.append({"name": opp.name, "vp": _estimate_vp(state, opp)})
        except Exception:
            pass
    result["vp_estimates"] = vp_estimates

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
            result["colony_advice"] = colony_strategy_advice(state)
        except Exception:
            pass

    income = me.mc_prod + me.tr
    steel_mc = me.steel * (me.steel_value if hasattr(me, "steel_value") else 2)
    ti_mc = me.titanium * (me.ti_value if hasattr(me, "ti_value") else 3)
    total_liquid = me.mc + steel_mc + ti_mc
    result["economy"] = {
        "income_per_gen": income,
        "liquid_mc": total_liquid,
        "next_gen_mc": total_liquid + income,
        "resource_values": rv,
    }

    opponents = []
    for opp in state.opponents:
        opponents.append({
            "name": opp.name,
            "tr": opp.tr,
            "mc": opp.mc,
            "production_mc": opp.mc_prod,
            "hand_count": opp.cards_in_hand_count if hasattr(opp, "cards_in_hand_count") else 0,
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
