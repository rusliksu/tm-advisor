"""Action-sequence proposals for live Terraforming Mars turns.

Prompt decisions answer an immediate `waitingFor` choice. Sequence decisions
answer a different question: when a visible card play is correct only as part
of a short ordered line, surface the order instead of a misleading single-card
recommendation.
"""

from __future__ import annotations

from dataclasses import dataclass, field


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


_ANIMAL_VP_TARGETS = {
    "Fish": 100,
    "Birds": 98,
    "Venusian Animals": 98,
    "Penguins": 98,
    "Livestock": 94,
    "Predators": 92,
    "Sub-zero Salt Fish": 90,
    "Herbivores": 70,
    "Pets": 65,
    "Small Animals": 62,
}

_ADAPTATION_GLOBAL_MIN_REQS = {
    "Fish": ("temperature", -2),
    "Small Animals": ("oxygen", 4),
    "Livestock": ("oxygen", 7),
    "Predators": ("oxygen", 9),
    "Birds": ("oxygen", 11),
    "Venusian Animals": ("venus", 14),
}


def sequence_decision_advice(state, hand_advice=None, req_checker=None) -> DecisionProposal | None:
    for handler in SEQUENCE_HANDLERS:
        proposal = handler(state, hand_advice=hand_advice, req_checker=req_checker)
        if proposal:
            return proposal
    return None


def minority_refuge_miranda_sequence(state, hand_advice=None, req_checker=None) -> DecisionProposal | None:
    if not _hand_card(state, "Minority Refuge"):
        return None

    miranda = _available_miranda(state)
    if not miranda:
        return None

    tableau_target = _best_tableau_animal_target(state)
    if tableau_target:
        return _minority_refuge_proposal(state, miranda, tableau_target, setup_card=None)

    setup = _best_hand_animal_setup(state, hand_advice=hand_advice, req_checker=req_checker)
    if not setup:
        return None

    return _minority_refuge_proposal(state, miranda, setup, setup_card=setup["name"])


def _minority_refuge_proposal(state, miranda: dict, target: dict, setup_card: str | None) -> DecisionProposal:
    target_name = target["name"]
    if setup_card:
        actions = [
            f"Play {setup_card}",
            "Play Minority Refuge",
            "choose Miranda",
            f"add Miranda animal to {target_name}",
        ]
        line = (
            f"Sequence: Play {setup_card} -> Minority Refuge on Miranda "
            f"-> animal to {target_name} (+1 VP now)"
        )
        reason = (
            "Miranda build bonus needs a real animal target; play the 1VP animal first "
            "so Minority Refuge does not waste the bonus."
        )
    else:
        actions = [
            "Play Minority Refuge",
            "choose Miranda",
            f"add Miranda animal to {target_name}",
        ]
        line = (
            f"Sequence: Minority Refuge on Miranda -> animal to {target_name} "
            f"(+1 VP now)"
        )
        reason = "Use Miranda because the build bonus converts directly into animal VP."

    total_cost = _hand_cost(state, "Minority Refuge")
    if setup_card:
        total_cost += _hand_cost(state, setup_card)

    option = {
        "rank": 1,
        "action": "SEQUENCE",
        "name": "Minority Refuge",
        "score": 90 if setup_card else 86,
        "reason": reason,
        "line": line,
        "actions": actions,
        "target_colony": "Miranda",
        "animal_target": target_name,
        "setup_card": setup_card,
        "total_cost": total_cost,
        "miranda_track": miranda.get("track", 0),
        "miranda_slots_left": max(0, 3 - len(miranda.get("settlers") or [])),
    }
    return DecisionProposal(
        kind="minority_refuge_miranda",
        channel="sequence",
        best_move=line,
        best=option,
        options=[option],
    )


def _available_miranda(state) -> dict | None:
    for colony in getattr(state, "colonies_data", []) or []:
        if colony.get("name") != "Miranda":
            continue
        if len(colony.get("settlers") or []) >= 3:
            continue
        return colony
    return None


def _best_tableau_animal_target(state) -> dict | None:
    me = getattr(state, "me", None)
    targets = []
    for card in getattr(me, "tableau", []) or []:
        name = card.get("name", "") if isinstance(card, dict) else str(card)
        score = _ANIMAL_VP_TARGETS.get(name)
        if score is None:
            continue
        targets.append({
            "name": name,
            "score": score + int(card.get("resources", 0) or 0) * 0.1,
        })
    if not targets:
        return None
    return max(targets, key=lambda row: row["score"])


def _best_hand_animal_setup(state, hand_advice=None, req_checker=None) -> dict | None:
    candidates = []
    for card in getattr(state, "cards_in_hand", []) or []:
        name = card.get("name", "") if isinstance(card, dict) else str(card)
        base_score = _ANIMAL_VP_TARGETS.get(name)
        if base_score is None:
            continue
        playable, note = _animal_setup_playable(name, state, req_checker)
        if not playable:
            continue
        advice_bonus = _hand_play_bonus(name, hand_advice)
        candidates.append({
            "name": name,
            "score": base_score + advice_bonus,
            "reason": note,
        })
    if not candidates:
        return None
    return max(candidates, key=lambda row: row["score"])


def _animal_setup_playable(name: str, state, req_checker=None) -> tuple[bool, str]:
    if req_checker is not None:
        try:
            ok, reason = req_checker.check(name, state)
        except Exception:
            ok, reason = False, ""
        if ok:
            return True, "requirement already met"
        if not _has_adaptation_technology(state):
            return False, reason

    if _has_adaptation_technology(state):
        override = _ADAPTATION_GLOBAL_MIN_REQS.get(name)
        if override:
            attr, need = override
            current = getattr(state, attr, None)
            if current is not None and current >= need:
                return True, "Adaptation Technology opens the requirement window"

    return False, ""


def _hand_play_bonus(name: str, hand_advice) -> float:
    for row in hand_advice or []:
        if row.get("name") != name:
            continue
        if row.get("action") == "PLAY":
            return 8.0
        if row.get("action") == "HOLD":
            return -2.0
    return 0.0


def _has_adaptation_technology(state) -> bool:
    me = getattr(state, "me", None)
    for card in getattr(me, "tableau", []) or []:
        name = card.get("name", "") if isinstance(card, dict) else str(card)
        if name == "Adaptation Technology":
            return True
    return False


def _hand_card(state, name: str) -> dict | None:
    for card in getattr(state, "cards_in_hand", []) or []:
        card_name = card.get("name", "") if isinstance(card, dict) else str(card)
        if card_name == name:
            return card if isinstance(card, dict) else {"name": card_name}
    return None


def _hand_cost(state, name: str) -> int:
    card = _hand_card(state, name)
    if not card:
        return 0
    try:
        return int(card.get("cost", 0) or 0)
    except (TypeError, ValueError):
        return 0


SEQUENCE_HANDLERS = (
    minority_refuge_miranda_sequence,
)
