#!/usr/bin/env python3
"""Canonical tm-advisor-py snapshot entrypoint."""

from __future__ import annotations

import argparse
from collections import defaultdict
from functools import lru_cache
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
    is_game_end_triggered,
)
from scripts.tm_advisor.colony_advisor import (  # noqa: E402
    analyze_trade_options, colony_strategy_advice,
)
from scripts.tm_advisor.draft_play_advisor import (  # noqa: E402
    draft_buy_advice, mc_allocation_advice, play_hold_advice,
)
from scripts.tm_advisor.economy import resource_values, game_phase  # noqa: E402
from scripts.tm_advisor.requirements import RequirementsChecker  # noqa: E402
from scripts.tm_advisor.shared_data import resolve_data_path  # noqa: E402


def _build_advice_queues(entries: list[dict] | None) -> dict[str, list[dict]]:
    queues: dict[str, list[dict]] = defaultdict(list)
    for entry in entries or []:
        name = entry.get("name")
        if not name:
            continue
        queues[name].append(dict(entry))
    return queues


def _pop_card_advice(queues: dict[str, list[dict]], name: str) -> dict | None:
    bucket = queues.get(name)
    if not bucket:
        return None
    return bucket.pop(0)


def _flatten_draft_advice(draft_plan: dict) -> list[dict]:
    card_advice = []
    for card in draft_plan.get("buy_list", []) or []:
        card_advice.append({
            "name": card.get("name"),
            "action": "BUY",
            "reason": card.get("buy_reason", ""),
            "score": card.get("score"),
            "tier": card.get("tier"),
            "cost_play": card.get("cost_play"),
            "req_ok": card.get("req_ok"),
            "playability_gens": card.get("playability_gens", 0),
        })
    for card in draft_plan.get("skip_list", []) or []:
        card_advice.append({
            "name": card.get("name"),
            "action": "SKIP",
            "reason": card.get("skip_reason", ""),
            "score": card.get("score"),
            "tier": card.get("tier"),
        })
    return card_advice


def _is_draft_like_card_prompt(state: GameState) -> bool:
    waiting = state.waiting_for or {}
    if waiting.get("type") != "card" or not waiting.get("cards"):
        return False

    live_phase = str(state.phase or "").lower()
    if live_phase in {"drafting", "initial_drafting", "initialdrafting", "research"}:
        return True

    prompt_text = " ".join(
        str(waiting.get(key, "") or "")
        for key in ("title", "message", "label", "buttonLabel")
    ).lower()
    return "select a card to keep and pass" in prompt_text


def _is_keep_pass_draft(state: GameState) -> bool:
    if not _is_draft_like_card_prompt(state):
        return False
    live_phase = str(state.phase or "").lower()
    if live_phase in {"initial_drafting", "initialdrafting", "drafting"}:
        return True
    waiting = state.waiting_for or {}
    prompt_text = " ".join(
        str(waiting.get(key, "") or "")
        for key in ("title", "message", "label", "buttonLabel")
    ).lower()
    return "select a card to keep and pass" in prompt_text


def _keep_pass_draft_advice(cards, state, synergy, req_checker, corp_name, player_tags) -> tuple[dict, list[dict]]:
    scored = []
    for card in cards:
        name = card.get("name", "")
        if not name:
            continue
        tags = card.get("tags", [])
        score = synergy.adjusted_score(
            name, tags, corp_name, state.generation, player_tags, state, context="draft"
        )
        req_ok, req_reason = True, ""
        if req_checker:
            req_ok, req_reason = req_checker.check(name, state)
        scored.append({
            "name": name,
            "score": score,
            "tier": _score_to_tier(score),
            "cost_play": card.get("cost", card.get("calculatedCost", 0)),
            "req_ok": req_ok,
            "req_reason": req_reason,
        })

    scored.sort(key=lambda c: c["score"], reverse=True)
    if not scored:
        return {
            "mode": "keep_pass",
            "hint": "Нет карт в текущем паке",
            "keep_count": 0,
            "pass_count": 0,
            "card_advice": [],
        }, []

    best = scored[0]
    card_advice = []
    for idx, card in enumerate(scored):
        if idx == 0:
            reason = "лучший keep в текущем паке"
            action = "KEEP"
        else:
            gap = best["score"] - card["score"]
            reason = f"хуже {best['name']} на {gap:.0f}"
            action = "PASS"
        card_advice.append({
            "name": card["name"],
            "action": action,
            "reason": reason,
            "score": card["score"],
            "tier": card["tier"],
            "cost_play": card["cost_play"],
            "req_ok": card["req_ok"],
            "req_reason": card["req_reason"],
            "playability_gens": 0,
        })

    pass_count = max(0, len(scored) - 1)
    if pass_count:
        hint = f"Оставь {best['name']}, передай {pass_count}"
    else:
        hint = f"Оставь {best['name']}"
    plan = {
        "mode": "keep_pass",
        "hint": hint,
        "keep_count": 1,
        "pass_count": pass_count,
        "card_advice": card_advice,
    }
    return plan, card_advice


def _should_show_trade_hint(state: GameState) -> bool:
    if str(state.phase or "").lower() in {"initial_drafting", "initialdrafting", "drafting", "research"}:
        return False
    waiting = state.waiting_for or {}
    return bool(waiting.get("type"))


def _truncate_summary_text(text: str, max_len: int = 96) -> str:
    raw = " ".join(str(text or "").split()).strip()
    if not raw:
        return ""
    if len(raw) <= max_len:
        return raw
    return raw[: max_len - 3].rstrip() + "..."


def _format_play_summary_line(entry: dict) -> str:
    action = entry.get("action", "?")
    priority = entry.get("priority")
    reason = entry.get("reason", "")
    pv = entry.get("play_value_now")
    desc = _truncate_summary_text(entry.get("description", ""), 96)
    desc_first = bool(entry.get("description_first"))
    line = f"{action} {entry.get('name', '?')}"
    parts = []
    if desc_first:
        if desc:
            parts.append(f"Описание: {desc}")
        if reason:
            parts.append(reason)
    else:
        if reason:
            parts.append(reason)
        if desc:
            parts.append(f"Описание: {desc}")
    if isinstance(pv, (int, float)) and pv > 0:
        parts.append(f"value {pv}")
    if priority is not None:
        parts.append(f"prio {priority}")
    if parts:
        line += " — " + " | ".join(parts)
    return line


def _format_draft_summary_line(entry: dict) -> str:
    action = entry.get("action", "?")
    reason = entry.get("reason", "")
    score = entry.get("score")
    desc = _truncate_summary_text(entry.get("description", ""), 96)
    desc_first = bool(entry.get("description_first"))
    line = f"{action} {entry.get('name', '?')}"
    parts = []
    if desc_first:
        if desc:
            parts.append(f"Описание: {desc}")
        if reason:
            parts.append(reason)
    else:
        if reason:
            parts.append(reason)
        if desc:
            parts.append(f"Описание: {desc}")
    if isinstance(score, (int, float)):
        parts.append(f"score {score}")
    if parts:
        line += " — " + " | ".join(parts)
    return line


def _format_allocation_summary_line(entry: dict) -> str:
    action = str(entry.get("action", "") or "").strip()
    kind = str(entry.get("type", "") or "").strip()
    cost = entry.get("cost")
    value = entry.get("value_mc")
    urgency = str(entry.get("urgency", "") or "").strip()

    if kind == "milestone" and action.startswith("Claim "):
        label = action[len("Claim "):].strip()
        return f"🏆 ЗАЯВИ {label}! ({cost} MC = {value} value)"

    if kind == "award" and action.startswith("Fund "):
        label = action[len("Fund "):].split(" (", 1)[0].strip()
        bits = [f"{cost} MC"]
        if urgency:
            bits.append(urgency)
        return f"💰 ФОНДИРУЙ {label}! ({', '.join(bits)})"

    if kind == "trade":
        return f"🚀 {action} ({cost} MC → {value} value)"

    if kind == "conversion":
        icon = "🌿" if "Greenery" in action else "🔥"
        return f"{icon} {action}"

    if kind == "colony_build":
        return f"🛰️ {action} ({cost} MC)"

    if kind == "turmoil":
        return action

    if kind == "action":
        return action

    if kind == "sell":
        return action

    parts = []
    if isinstance(cost, (int, float)):
        parts.append(f"{cost} MC")
    if isinstance(value, (int, float)) and value > 0:
        parts.append(f"value {value}")
    if parts:
        return f"{action} ({', '.join(parts)})"
    return action


def _build_summary_block(
    result: dict,
    hand_advice: list[dict],
    allocation_plan: dict | None,
    draft_plan: dict | None,
    draft_card_advice: list[dict] | None,
) -> dict:
    def _best_play_entry(entries: list[dict]) -> dict | None:
        plays = [entry for entry in entries if entry.get("action") == "PLAY"]
        if not plays:
            return None
        return max(
            plays,
            key=lambda entry: (
                float(entry.get("play_value_now", 0) or 0),
                -int(entry.get("priority", 99) or 99),
            ),
        )

    def _priority_alert_move(alerts: list[str], best_play: dict | None) -> str | None:
        best_play_value = float((best_play or {}).get("play_value_now", 0) or 0)
        best_play_priority = int((best_play or {}).get("priority", 99) or 99)
        phase_name = str((result.get("game") or {}).get("phase", "") or "")
        for alert in alerts:
            if alert.startswith("🏆 ЗАЯВИ "):
                is_race = "ГОНКА" in alert or "ПЕРВЫМ" in alert or "оппонент" in alert
                if (
                    best_play
                    and not is_race
                    and phase_name in ("early", "mid")
                    and best_play_priority <= 1
                    and best_play_value >= 35
                ):
                    continue
                return alert
        for alert in alerts:
            if alert.startswith("⚡ ") and "Заяви ПЕРВЫМ" in alert:
                return alert
        return None

    def _priority_allocation_move(plan: dict | None, best_play: dict | None) -> str | None:
        allocations = list((plan or {}).get("allocations") or [])
        if not allocations:
            return None
        best_play_value = float((best_play or {}).get("play_value_now", 0) or 0)
        best_play_priority = int((best_play or {}).get("priority", 99) or 99)
        phase_name = str((result.get("game") or {}).get("phase", "") or "")
        preferred_types = (
            "milestone", "award", "trade", "conversion",
            "colony_build", "action", "turmoil", "sell",
        )
        for entry in allocations:
            kind = entry.get("type")
            if kind not in preferred_types:
                continue
            if "❌нет MC" in str(entry.get("action", "")):
                continue
            if kind == "award":
                urgency = str(entry.get("urgency", "") or "").strip()
                if (
                    best_play
                    and urgency == "MEDIUM"
                    and (
                        (best_play_priority <= 2 and best_play_value >= 20)
                        or best_play_value >= 35
                    )
                ):
                    continue
            if kind == "milestone":
                action = str(entry.get("action", "") or "")
                allocation_value = float(entry.get("value_mc", 0) or 0)
                is_race = "ГОНКА" in action or "⚠" in action
                if (
                    best_play
                    and not is_race
                    and phase_name in ("early", "mid")
                    and best_play_priority <= 1
                    and best_play_value >= 35
                    and allocation_value + 15 < best_play_value
                ):
                    continue
            if kind == "action":
                action_value = float(entry.get("value_mc", 0) or 0)
                if (
                    best_play
                    and best_play_priority <= 3
                    and best_play_value >= 5
                    and (action_value <= 2 or action_value + 5 < best_play_value)
                ):
                    continue
            if kind == "turmoil":
                action_value = float(entry.get("value_mc", 0) or 0)
                if (
                    best_play
                    and best_play_priority <= 3
                    and best_play_value >= 20
                    and action_value + 10 < best_play_value
                ):
                    continue
            if kind == "trade":
                trade_value = float(entry.get("value_mc", 0) or 0)
                if (
                    best_play
                    and best_play_priority <= 3
                    and best_play_value >= 20
                    and trade_value + 10 < best_play_value
                ):
                    continue
            return _format_allocation_summary_line(entry)
        return None

    summary = {
        "focus": f"{result['game']['phase']} / gen {result['game']['generation']}",
        "best_move": None,
        "hand": [],
        "draft": [],
        "trade": None,
        "alerts": list(result.get("alerts", [])[:3]),
        "lines": [],
    }

    if hand_advice:
        summary["hand"] = [_format_play_summary_line(entry) for entry in hand_advice[:5]]

    if draft_plan and draft_card_advice:
        summary["draft"] = [_format_draft_summary_line(entry) for entry in draft_card_advice[:5]]
        draft_hint = draft_plan.get("hint")
        if draft_hint:
            summary["best_move"] = f"Draft: {draft_hint}"
            summary["lines"].append(summary["best_move"])
        summary["lines"].extend(summary["draft"][:3])
    else:
        best_play = _best_play_entry(hand_advice)
        alert_move = _priority_alert_move(result.get("alerts", []) or [], best_play)
        if alert_move:
            summary["best_move"] = alert_move
            summary["lines"].append(alert_move)
        else:
            allocation_move = _priority_allocation_move(
                allocation_plan, best_play
            )
            if allocation_move:
                summary["best_move"] = allocation_move
                summary["lines"].append(allocation_move)
        if not summary["best_move"] and hand_advice:
            best_play = _best_play_entry(hand_advice)
            fallback = hand_advice[0] if hand_advice else None
            chosen = best_play or fallback
            if chosen:
                summary["best_move"] = _format_play_summary_line(chosen)
                summary["lines"].append(summary["best_move"])

    if summary["hand"]:
        if not summary["best_move"]:
            summary["best_move"] = summary["hand"][0]
        summary["lines"].extend(line for line in summary["hand"][:3] if line not in summary["lines"])

    trade_hint = (result.get("trade") or {}).get("hint")
    if trade_hint:
        summary["trade"] = trade_hint
        summary["lines"].append(f"Trade: {trade_hint}")

    for alert in summary["alerts"]:
        if alert not in summary["lines"]:
            summary["lines"].append(alert)

    return summary


def format_snapshot_summary(data: dict) -> str:
    game = data.get("game", {}) or {}
    me = data.get("me", {}) or {}
    summary = data.get("summary", {}) or {}
    economy = data.get("economy", {}) or {}

    lines = [
        f"# Snapshot — {me.get('name', '?')} / Gen {game.get('generation', '?')} / {game.get('phase', '?')}",
        (
            f"Corp: {me.get('corp', '?')} | TR {me.get('tr', '?')} | "
            f"MC {me.get('mc', '?')} | income {economy.get('income_per_gen', '?')}/gen"
        ),
    ]

    best_move = summary.get("best_move")
    if best_move:
        lines.extend(["", f"Best move: {best_move}"])

    draft_lines = list(summary.get("draft") or [])
    if draft_lines:
        lines.extend(["", "Draft:"])
        lines.extend(f"- {line}" for line in draft_lines[:3])

    hand_lines = list(summary.get("hand") or [])
    if hand_lines:
        lines.extend(["", "Hand:"])
        lines.extend(f"- {line}" for line in hand_lines[:3])

    trade_hint = summary.get("trade")
    if trade_hint:
        lines.extend(["", f"Trade: {trade_hint}"])

    alerts = list(summary.get("alerts") or [])
    if alerts:
        lines.extend(["", "Alerts:"])
        lines.extend(f"- {line}" for line in alerts[:3])

    return "\n".join(lines)


@lru_cache(maxsize=1)
def _get_runtime_bundle():
    eval_path = str(resolve_data_path("evaluations.json"))
    db = CardDatabase(eval_path)
    parser = CardEffectParser(db)
    combo = ComboDetector(parser, db)
    synergy = SynergyEngine(db, combo)
    req_checker = RequirementsChecker(str(resolve_data_path("all_cards.json")))
    return db, parser, combo, synergy, req_checker


def snapshot_from_raw(raw: dict) -> dict:
    db, parser, combo, synergy, req_checker = _get_runtime_bundle()
    state = GameState(raw)
    me = state.me
    is_game_over = str(state.phase or "").lower() == "end"

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
    if _is_draft_like_card_prompt(state):
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
    hand_advice = [] if is_game_over else play_hold_advice(state.cards_in_hand or [], state, synergy, req_checker)
    hand_advice_queues = _build_advice_queues(hand_advice)
    allocation_plan = None
    draft_plan = None
    draft_card_advice = None
    for card in (state.cards_in_hand or []):
        name = card.get("name", "")
        if not name:
            continue
        base_score = db.get_score(name) or 50
        card_tags = card.get("tags", []) or (db.get_info(name) or {}).get("tags", [])
        adj_score = synergy.adjusted_score(name, card_tags, corp_name, state.generation, player_tags, state)
        effective_score, req_ok, req_reason = req_checker.adjust_score(adj_score, name, state)
        combo_bonus = combo.get_hand_synergy_bonus(name, tableau_names, player_tags)
        row = {
            "name": name,
            "cost": card.get("cost", 0),
            "tags": card_tags,
            "description": db.get_advisor_description(name, max_len=180),
            "description_first": db.prefer_description_first(name),
            "note": db.get_advisor_blurb(name, locale="ru", note_max_len=110, desc_max_len=140, total_max_len=280),
            "base_score": base_score,
            "adjusted_score": adj_score,
            "effective_score": effective_score,
            "combo_bonus": combo_bonus,
            "tier": db.get(name).get("tier", "?") if db.get(name) else "?",
            "effective_tier": _score_to_tier(effective_score),
            "req_ok": req_ok,
            "req_reason": req_reason,
        }
        advice = _pop_card_advice(hand_advice_queues, name)
        if advice:
            row["play_advice"] = advice
            row["play_action"] = advice.get("action")
            row["play_reason"] = advice.get("reason")
            row["play_priority"] = advice.get("priority")
        hand_cards.append(row)
    hand_cards.sort(key=lambda c: c["effective_score"], reverse=True)
    result["hand"] = hand_cards
    hand_meta = {
        row["name"]: {
            "description": row.get("description", ""),
            "note": row.get("note", ""),
            "description_first": row.get("description_first", False),
        }
        for row in hand_cards
    }
    for entry in hand_advice:
        meta = hand_meta.get(entry.get("name", ""))
        if meta:
            if meta.get("description"):
                entry["description"] = meta["description"]
            if meta.get("note"):
                entry["note"] = meta["note"]
            entry["description_first"] = bool(meta.get("description_first"))
    result["hand_advice"] = hand_advice

    if not is_game_over:
        try:
            allocation_plan = mc_allocation_advice(state, synergy, req_checker)
            result["allocation"] = allocation_plan
        except Exception:
            allocation_plan = None

    if current_draft and not is_game_over:
        if _is_keep_pass_draft(state):
            draft_plan, draft_card_advice = _keep_pass_draft_advice(
                current_draft, state, synergy, req_checker, corp_name, player_tags
            )
        else:
            draft_plan = draft_buy_advice(current_draft, state, synergy, req_checker)
            draft_card_advice = _flatten_draft_advice(draft_plan)
        draft_advice_queues = _build_advice_queues(draft_card_advice)
        draft_cards = []
        for card in current_draft:
            name = card.get("name", "")
            if not name:
                continue
            base_score = db.get_score(name) or 50
            adj_score = synergy.adjusted_score(
                name, card.get("tags", []), corp_name, state.generation, player_tags, state
            )
            row = {
                "name": name,
                "cost": card.get("cost", 0),
                "tags": card.get("tags", []) or (db.get_info(name) or {}).get("tags", []),
                "description": db.get_advisor_description(name, max_len=180),
                "description_first": db.prefer_description_first(name),
                "note": db.get_advisor_blurb(name, locale="ru", note_max_len=110, desc_max_len=140, total_max_len=280),
                "base_score": base_score,
                "adjusted_score": adj_score,
                "tier": db.get(name).get("tier", "?") if db.get(name) else "?",
            }
            advice = _pop_card_advice(draft_advice_queues, name)
            if advice:
                row["draft_advice"] = advice
                row["draft_action"] = advice.get("action")
                row["draft_reason"] = advice.get("reason")
            draft_cards.append(row)
        draft_cards.sort(key=lambda c: c["adjusted_score"], reverse=True)
        result["current_draft"] = draft_cards
        draft_meta = {
            row["name"]: {
                "description": row.get("description", ""),
                "note": row.get("note", ""),
                "description_first": row.get("description_first", False),
            }
            for row in draft_cards
        }
        for entry in draft_card_advice:
            meta = draft_meta.get(entry.get("name", ""))
            if meta:
                if meta.get("description"):
                    entry["description"] = meta["description"]
                if meta.get("note"):
                    entry["note"] = meta["note"]
                entry["description_first"] = bool(meta.get("description_first"))
        result["draft_advice"] = {
            **draft_plan,
            "card_advice": draft_card_advice,
        }

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

    if is_game_over:
        result["alerts"] = []
    else:
        try:
            result["alerts"] = _generate_alerts(state, parser)
        except Exception as e:
            result["alerts"] = [f"Error: {e}"]

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

    if state.colonies_data and _should_show_trade_hint(state):
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
    end_triggered = is_game_end_triggered(state)
    result["economy"] = {
        "income_per_gen": income,
        "liquid_mc": total_liquid,
        "next_gen_mc": None if end_triggered else total_liquid + income,
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
    result["summary"] = _build_summary_block(
        result, hand_advice, allocation_plan, draft_plan, draft_card_advice)

    return result


def snapshot(player_id: str) -> dict:
    client = TMClient()
    raw = client.get_player_state(player_id)
    return snapshot_from_raw(raw)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="tm-advisor snapshot")
    parser.add_argument("player_id", help="Player ID from TM game URL")
    parser.add_argument("--summary", action="store_true",
                        help="Print compact markdown summary instead of raw JSON")
    args = parser.parse_args()

    data = snapshot(args.player_id)
    if args.summary:
        print(format_snapshot_summary(data))
    else:
        print(json.dumps(data, ensure_ascii=False, indent=2))
