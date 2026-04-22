"""Opponent intent heuristics from visible state and recent actions."""

from __future__ import annotations

import re

from .analysis import _estimate_remaining_gens
from .economy import game_phase


def analyze_opponent_intents(state, max_intents: int = 5) -> list[dict]:
    """Predict near-term opponent action classes.

    This is deliberately rule-based: it uses only public state and
    actionsThisGeneration. It does not try to infer hidden hand contents.
    """
    me = state.me
    phase = game_phase(_estimate_remaining_gens(state), state.generation)
    intents: list[dict] = []

    for opp in getattr(state, "opponents", []) or []:
        if opp.color in getattr(state, "passed_players", []):
            continue

        action_text = _recent_action_text(opp)
        if _shows_terraforming_tempo(action_text):
            intents.append(_intent(
                opp, "terraforming_tempo", 0.7, 7,
                "последние действия уже двигали глобалы"))

        milestone = _claimable_milestone(state, opp)
        if milestone and opp.mc >= 8:
            intents.append(_intent(
                opp, "milestone", 0.9, 10,
                f"может заявить {milestone} за 8 MC"))

        award = _fundable_award(state, opp, me)
        if award:
            intents.append(_intent(
                opp, "award", 0.7, 8,
                f"может фондировать {award['name']} за {award['cost']} MC"))

        if opp.plants >= 8:
            intents.append(_intent(
                opp, "greenery", 0.85, 9,
                f"{opp.plants} plants уже конвертируются в greenery"))
        elif phase in ("late", "endgame") and opp.plants >= 6 and opp.plant_prod > 0:
            intents.append(_intent(
                opp, "greenery", 0.6, 6,
                f"{opp.plants}+{opp.plant_prod} plants близко к greenery"))

        if state.temperature < 8 and opp.heat >= 8:
            intents.append(_intent(
                opp, "temperature", 0.8, 8,
                f"{opp.heat} heat уже конвертируется в temp"))

        trade = _trade_threat(state, opp)
        if trade:
            intents.append(_intent(
                opp, "trade", trade["probability"], 6,
                f"может trade {trade['name']} (track {trade['track']})"))

        if _shows_engine_tempo(action_text):
            intents.append(_intent(
                opp, "engine", 0.55, 3,
                "последние действия больше похожи на engine/card play"))

        if _likely_pass_soon(state, opp):
            intents.append(_intent(
                opp, "pass_soon", 0.6, 4,
                "мало MC и нет видимой конверсии ресурсов"))

    intents.sort(key=lambda i: (-i["urgency"], -i["probability"], i["player"]))
    return intents[:max_intents]


def format_opponent_intent_warnings(state, max_warnings: int = 5) -> list[str]:
    warnings = []
    for intent in analyze_opponent_intents(state, max_warnings):
        player = intent["player"]
        kind = intent["intent"]
        reason = intent["reason"]
        probability = round(intent["probability"] * 100)

        if kind == "milestone":
            warnings.append(f"⏰ {player}: {reason}. Claim first или потеряешь слот.")
        elif kind == "award":
            warnings.append(f"⏰ {player}: {reason}. Проверь, не надо ли блокировать.")
        elif kind == "greenery":
            warnings.append(f"⏰ {player}: likely greenery ({probability}%) — {reason}.")
        elif kind == "temperature":
            warnings.append(f"⏰ {player}: likely temp raise ({probability}%) — {reason}.")
        elif kind == "trade":
            warnings.append(f"⏰ {player}: likely colony trade ({probability}%) — {reason}.")
        elif kind == "terraforming_tempo":
            warnings.append(f"⏰ {player}: rush pressure ({probability}%) — {reason}.")
        elif kind == "pass_soon":
            warnings.append(f"⏳ {player}: likely pass soon ({probability}%) — {reason}.")
        elif kind == "engine":
            warnings.append(f"ℹ️ {player}: низкий rush pressure — {reason}.")
    return warnings


def _intent(opp, intent: str, probability: float, urgency: int, reason: str) -> dict:
    return {
        "player": opp.name,
        "color": opp.color,
        "intent": intent,
        "probability": probability,
        "urgency": urgency,
        "reason": reason,
    }


def _recent_action_text(opp) -> str:
    chunks = []
    for action in getattr(opp, "actions_this_generation", []) or []:
        if isinstance(action, dict):
            for key in ("title", "type", "name", "card", "action", "description"):
                val = action.get(key)
                if val:
                    chunks.append(str(val))
        else:
            chunks.append(str(action))
    return " ".join(chunks).lower()


def _shows_terraforming_tempo(action_text: str) -> bool:
    if not action_text:
        return False
    return bool(re.search(
        r'oxygen|temperature|ocean|greenery|asteroid|terraform|raise\s+(?:o2|oxygen|temp)',
        action_text,
    ))


def _shows_engine_tempo(action_text: str) -> bool:
    if not action_text:
        return False
    if _shows_terraforming_tempo(action_text):
        return False
    return bool(re.search(r'card|draw|production|research|invent|science|microbe|animal|floater', action_text))


def _claimable_milestone(state, opp) -> str | None:
    claimed_count = sum(1 for milestone in state.milestones if milestone.get("claimed_by"))
    if claimed_count >= 3:
        return None
    for milestone in state.milestones:
        if milestone.get("claimed_by"):
            continue
        score = milestone.get("scores", {}).get(opp.color)
        if isinstance(score, dict) and score.get("claimable"):
            return milestone.get("name", "milestone")
    return None


def _fundable_award(state, opp, me) -> dict | None:
    funded = sum(1 for award in state.awards if award.get("funded_by"))
    if funded >= 3:
        return None
    cost = [8, 14, 20][funded]
    if opp.mc < cost:
        return None
    best = None
    best_lead = 2
    for award in state.awards:
        if award.get("funded_by"):
            continue
        opp_val = award.get("scores", {}).get(opp.color, 0)
        my_val = award.get("scores", {}).get(me.color, 0)
        lead = opp_val - my_val
        if lead > best_lead:
            best = {"name": award.get("name", "award"), "cost": cost}
            best_lead = lead
    return best


def _trade_threat(state, opp) -> dict | None:
    if not getattr(state, "colonies_data", None):
        return None
    if getattr(opp, "trades_this_gen", 0) >= getattr(opp, "fleet_size", 1):
        return None
    can_trade = opp.energy >= 3 or opp.mc >= 9
    if not can_trade:
        return None
    best = max(state.colonies_data, key=lambda c: c.get("track", 0), default=None)
    if not best or best.get("track", 0) < 5:
        return None
    probability = 0.75 if opp.energy >= 3 else 0.55
    return {
        "name": best.get("name", "colony"),
        "track": best.get("track", 0),
        "probability": probability,
    }


def _likely_pass_soon(state, opp) -> bool:
    if getattr(opp, "actions_this_gen", 0) < 2:
        return False
    if opp.mc >= 8 or opp.plants >= 8:
        return False
    if state.temperature < 8 and opp.heat >= 8:
        return False
    return opp.mc <= 3
