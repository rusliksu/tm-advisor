"""Prompt-specific decision proposals for live Terraforming Mars UI states.

This module owns rules for deferred `waitingFor` prompts. The snapshot
entrypoint should not need to know how each prompt is ranked.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
import re

from scripts.tm_advisor.colony_advisor import analyze_settlement
from scripts.tm_advisor.constants import COLONY_TIERS


@dataclass
class DecisionProposal:
    kind: str
    best_move: str
    best: dict
    options: list[dict]
    channel: str = "decision"
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        payload = {
            "kind": self.kind,
            "best_move": self.best_move,
            "best": self.best,
            "options": self.options,
        }
        payload.update(self.extra)
        return payload


def workflow_title_text(value) -> str:
    if isinstance(value, dict):
        message = value.get("message")
        if message:
            return str(message)
        data = value.get("data")
        if data:
            return " ".join(str(item.get("value", "")) for item in data if isinstance(item, dict)).strip()
        return ""
    return str(value or "")


def waiting_prompt_text(waiting: dict | None) -> str:
    if not waiting:
        return ""
    parts = [
        workflow_title_text(waiting.get("title")),
        workflow_title_text(waiting.get("message")),
        workflow_title_text(waiting.get("label")),
        workflow_title_text(waiting.get("buttonLabel")),
    ]
    return " ".join(part for part in parts if part).strip()


def prompt_decision_advice(state) -> DecisionProposal | None:
    for handler in PROMPT_HANDLERS:
        proposal = handler(state)
        if proposal:
            return proposal
    return None


def colony_prompt_advice(state) -> DecisionProposal | None:
    choices = _waiting_colony_entries(state)
    if not choices:
        return None

    temp_state = copy.copy(state)
    temp_state.colonies_data = choices
    try:
        settlements = analyze_settlement(temp_state)
    except Exception:
        settlements = []

    by_name = {entry.get("name"): entry for entry in settlements if entry.get("name")}
    options = []
    for colony in choices:
        name = colony["name"]
        settlement = by_name.get(name)
        if settlement:
            score = float(settlement.get("total_value", 0) or 0)
            tier_score = COLONY_TIERS.get(name, {}).get("score", 50)
            option = {
                "name": name,
                "score": round(score, 1),
                "tier": settlement.get("tier"),
                "action": "COLONY",
                "reason": _colony_prompt_reason(settlement),
                "total_value": round(score, 1),
                "tier_score": tier_score,
                "build_bonus": settlement.get("build_bonus"),
                "colony_bonus": settlement.get("colony_bonus"),
                "future_value": settlement.get("future_value"),
                "slots": settlement.get("slots"),
            }
        else:
            option = _fallback_colony_prompt_option(colony)
        options.append(option)

    options.sort(
        key=lambda row: (
            row.get("score", 0),
            row.get("tier_score", COLONY_TIERS.get(row.get("name"), {}).get("score", 0)),
        ),
        reverse=True,
    )
    for idx, option in enumerate(options, start=1):
        option["rank"] = idx
        reason = option.get("reason") or ""
        tier = f" [{option['tier']}]" if option.get("tier") else ""
        value = option.get("score")
        option["line"] = f"{option['name']}{tier} - value {value}: {reason}".rstrip()

    best = options[0] if options else None
    if not best:
        return None
    verb = _colony_prompt_verb(state)
    best_move = f"Colony: {verb} {best['name']} (value {best.get('score')})"
    if best.get("reason"):
        best_move += f" - {best['reason']}"
    return DecisionProposal(
        kind="colony_prompt",
        channel="colony_prompt",
        best_move=best_move,
        best=best,
        options=options,
        extra={"verb": verb},
    )


def card_prompt_advice(state) -> DecisionProposal | None:
    waiting = state.waiting_for or {}
    if waiting.get("type") != "card":
        return None
    prompt_text = waiting_prompt_text(waiting).lower()
    if "select cards to reveal" in prompt_text:
        return _reveal_cards_prompt(state)
    if "select card to add" in prompt_text and "resource" in prompt_text:
        return _add_resources_prompt(state)
    return None


def _reveal_cards_prompt(state) -> DecisionProposal | None:
    cards = _card_prompt_entries(state)
    count = len(cards)
    option = {
        "name": f"Reveal all {count} cards",
        "rank": 1,
        "score": count,
        "action": "REVEAL_ALL",
        "reason": f"Public Plans pays +{count} MC; only skip cards if hiding information is worth more",
        "cards": [card["name"] for card in cards],
        "line": f"Reveal all {count} cards - +{count} MC from Public Plans",
    }
    fallback = {
        "name": "Reveal no cards",
        "rank": 2,
        "score": 0,
        "action": "REVEAL_NONE",
        "reason": "Only if secrecy is worth more than the refund",
        "cards": [],
        "line": "Reveal no cards - keep hand hidden, but give up the refund",
    }
    return DecisionProposal(
        kind="reveal_cards",
        channel="card_prompt",
        best_move=option["line"],
        best=option,
        options=[option, fallback],
    )


def _add_resources_prompt(state) -> DecisionProposal | None:
    waiting = state.waiting_for or {}
    cards = _card_prompt_entries(state)
    if not cards:
        return None
    amount = _resource_prompt_amount(waiting)
    options = [_resource_target_option(card, amount) for card in cards]
    options.sort(key=lambda row: row.get("score", 0), reverse=True)
    for idx, option in enumerate(options, start=1):
        option["rank"] = idx
        option["line"] = (
            f"Add {amount} resources to {option['name']} "
            f"(value {option['score']}) - {option['reason']}"
        )
    best = options[0]
    return DecisionProposal(
        kind="add_resources",
        channel="card_prompt",
        best_move=best["line"],
        best=best,
        options=options,
    )


def _waiting_colony_entries(state) -> list[dict]:
    waiting = state.waiting_for or {}
    if waiting.get("type") != "colony":
        return []
    raw_colonies = waiting.get("coloniesModel") or waiting.get("colonies") or []
    entries = []
    for colony in raw_colonies:
        if isinstance(colony, str):
            name = colony
            settlers = []
            track = 0
            active = True
        elif isinstance(colony, dict):
            name = colony.get("name")
            settlers = list(colony.get("colonies") or colony.get("settlers") or [])
            track = colony.get("trackPosition", colony.get("track", 0))
            active = colony.get("isActive", True)
        else:
            continue
        if not name:
            continue
        entries.append({
            "name": str(name),
            "settlers": settlers,
            "track": track or 0,
            "isActive": active,
        })
    return entries


def _colony_prompt_verb(state) -> str:
    waiting = state.waiting_for or {}
    text = waiting_prompt_text(waiting).lower()
    if "add colony tile" in text:
        return "Add colony tile"
    return "Build colony"


def _colony_prompt_reason(entry: dict) -> str:
    parts = []
    build_bonus = (entry.get("build_bonus") or "").strip()
    if build_bonus:
        parts.append(build_bonus)
    if entry.get("future_value") is not None:
        parts.append(f"owner bonus ~{entry.get('future_value')} MC")
    if entry.get("tempo_trade_gain", 0) > 0:
        parts.append(f"trade tempo +{entry.get('tempo_trade_gain')} MC")
    if abs(entry.get("resource_support_bonus", 0) or 0) >= 0.5 and entry.get("resource_support_reason"):
        parts.append(entry["resource_support_reason"])
    if entry.get("contest_risk_penalty", 0) > 0 and entry.get("contest_risk_reason"):
        parts.append(f"{entry['contest_risk_reason']} (-{entry['contest_risk_penalty']})")
    return "; ".join(parts)


def _fallback_colony_prompt_option(colony: dict) -> dict:
    tier = COLONY_TIERS.get(colony["name"], {})
    score = tier.get("score", 50)
    return {
        "name": colony["name"],
        "score": score,
        "tier": tier.get("tier"),
        "action": "COLONY",
        "reason": tier.get("why", "")[:120],
    }


def _card_prompt_entries(state) -> list[dict]:
    waiting = state.waiting_for or {}
    if waiting.get("type") != "card":
        return []
    entries = []
    for card in waiting.get("cards") or []:
        resources = 0
        if isinstance(card, str):
            name = card
        elif isinstance(card, dict):
            name = card.get("name")
            resources = card.get("resources") or 0
        else:
            continue
        if name:
            entries.append({"name": str(name), "resources": resources})
    return entries


RESOURCE_TARGETS = {
    "Aerial Mappers": {"draw_per": 1.0},
    "Decomposers": {"vp_every": 3},
    "Ecological Zone": {"vp_every": 2},
    "Extremophiles": {"vp_every": 3},
    "Fish": {"vp_every": 1},
    "Livestock": {"vp_every": 1},
    "Pets": {"vp_every": 2},
    "Predators": {"vp_every": 1},
    "Security Fleet": {"vp_every": 1},
    "Small Animals": {"vp_every": 2},
    "Sulphur-Eating Bacteria": {"mc_per": 3.0},
    "Venusian Animals": {"vp_every": 1},
}


def _resource_prompt_amount(waiting: dict) -> int:
    text = waiting_prompt_text(waiting).lower()
    match = re.search(r"add\s+(\d+)\s+resources?", text)
    if match:
        return int(match.group(1))
    return 1


def _resource_target_option(card: dict, amount: int) -> dict:
    name = card["name"]
    current = int(card.get("resources") or 0)
    profile = RESOURCE_TARGETS.get(name, {})
    score = float(amount)
    reason = f"+{amount} resources"
    if profile.get("vp_every"):
        every = int(profile["vp_every"])
        before = current // every
        after = (current + amount) // every
        vp_delta = after - before
        score = vp_delta * 5 + amount * 0.2
        if vp_delta:
            reason = f"+{vp_delta} VP now ({current}->{current + amount} resources)"
        else:
            remaining = every - ((current + amount) % every)
            if remaining == every:
                remaining = 0
            reason = f"toward VP threshold; {remaining} more for next VP"
    elif profile.get("mc_per"):
        mc = amount * float(profile["mc_per"])
        score = mc
        reason = f"cashable for ~{mc:g} MC"
    elif profile.get("draw_per"):
        cards = amount * float(profile["draw_per"])
        score = cards * 3.5
        reason = f"can convert into ~{cards:g} card draws"

    return {
        "name": name,
        "score": round(score, 1),
        "action": "ADD_RESOURCES",
        "reason": reason,
        "resources_before": current,
        "resources_added": amount,
    }


PROMPT_HANDLERS = (
    colony_prompt_advice,
    card_prompt_advice,
)
