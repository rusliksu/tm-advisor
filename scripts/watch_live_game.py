#!/usr/bin/env python3
"""Poll a live TM game and log per-player advisor-aware diffs.

Usage:
    python scripts/watch_live_game.py <game_id> [--interval 10]
"""

from __future__ import annotations

import argparse
import functools
import importlib.util
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
ENTRYPOINT_CANDIDATES = [
    os.path.join(REPO_ROOT, "apps", "tm-advisor-py", "entrypoints", "advisor_snapshot.py"),
    os.path.join(REPO_ROOT, "scripts", "advisor_snapshot.py"),
]
DEFAULT_BASE_URL = "https://tm.knightbyte.win"
LOG_DIR = os.path.join(REPO_ROOT, "data", "game_logs")
DEFAULT_HAND_CHECK_INTERVAL = float(os.environ.get("TM_HAND_CHECK_INTERVAL", "300"))
DEFAULT_ADVISOR_CHECK_INTERVAL = float(os.environ.get("TM_ADVISOR_CHECK_INTERVAL", "300"))
ADVISOR_MISS_MIN_RANK = int(os.environ.get("TM_ADVISOR_MISS_MIN_RANK", "4"))
ADVISOR_MISS_MIN_SCORE_GAP = int(os.environ.get("TM_ADVISOR_MISS_MIN_SCORE_GAP", "6"))
ADVISOR_MISS_STRONG_SCORE_GAP = int(os.environ.get("TM_ADVISOR_MISS_STRONG_SCORE_GAP", "15"))
ADVISOR_MISS_TOP_CHOICES = int(os.environ.get("TM_ADVISOR_MISS_TOP_CHOICES", "3"))
ADVISOR_CHECK_VALUE_GAP = float(os.environ.get("TM_ADVISOR_CHECK_VALUE_GAP", "12"))


def fetch_json(url: str, retries: int = 3, timeout: float = 20.0) -> dict:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, ConnectionResetError, OSError) as exc:
            last_error = exc
            if attempt >= retries - 1:
                break
            time.sleep(min(5.0, 0.75 * (2 ** attempt)))
    assert last_error is not None
    raise last_error


@functools.lru_cache(maxsize=4)
def load_snapshot(base_url: str):
    os.environ["TM_BASE_URL"] = base_url.rstrip("/")
    errors: list[str] = []
    for entrypoint in ENTRYPOINT_CANDIDATES:
        if not os.path.exists(entrypoint):
            errors.append(f"{entrypoint}: missing")
            continue
        entrypoint_dir = os.path.dirname(entrypoint)
        if entrypoint_dir not in sys.path:
            sys.path.insert(0, entrypoint_dir)
        try:
            spec = importlib.util.spec_from_file_location(
                f"tm_advisor_snapshot_entrypoint_{abs(hash(entrypoint))}",
                entrypoint,
            )
            if spec is None or spec.loader is None:
                errors.append(f"{entrypoint}: no loader")
                continue
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        except Exception as exc:
            errors.append(f"{entrypoint}: {exc}")
            continue
        snapshot_fn = getattr(module, "snapshot", None)
        if snapshot_fn is not None:
            return snapshot_fn
        errors.append(f"{entrypoint}: snapshot missing")
    raise RuntimeError(
        "Cannot load snapshot() from advisor snapshot entrypoint candidates: "
        + ", ".join(ENTRYPOINT_CANDIDATES)
        + (f" | errors: {'; '.join(errors)}" if errors else "")
    )


def fetch_game(base_url: str, game_id: str) -> dict:
    return fetch_json(f"{base_url}/api/game?id={game_id}")


def fetch_player_view(base_url: str, player_id: str) -> dict:
    raw = fetch_json(f"{base_url}/api/player?id={player_id}")
    return raw.get("playerView", raw)


def build_player_state(player_id: str, snapshot_fn, base_url: str) -> dict:
    view = fetch_player_view(base_url, player_id)
    me = view.get("thisPlayer", {})
    waiting_for = view.get("waitingFor") or {}
    snap_error = None
    try:
        snap = snapshot_fn(player_id)
    except Exception as exc:
        snap = {
            "game": {},
            "me": {},
            "hand": [],
            "current_draft": [],
            "alerts": [],
        }
        snap_error = str(exc)

    me_block = snap.setdefault("me", {})
    me_block.setdefault("name", me.get("name") or player_id)
    me_block.setdefault("corp", "unknown")
    snap["player_id"] = player_id
    snap["live"] = {
        "is_active": me.get("isActive"),
        "color": me.get("color"),
        "last_card_played": me.get("lastCardPlayed"),
        "hand_count": me.get("cardsInHandNbr"),
        "cards_in_hand": [c.get("name") for c in view.get("cardsInHand", []) if isinstance(c, dict)],
        "tr": me.get("terraformRating"),
        "mc": me.get("megacredits"),
        "heat": me.get("heat"),
        "plants": me.get("plants"),
        "energy": me.get("energy"),
        "actions_this_generation": list(me.get("actionsThisGeneration", []) or []),
        "tableau": [c.get("name") for c in me.get("tableau", []) if isinstance(c, dict)],
        "current_pack": [c.get("name") for c in waiting_for.get("cards", []) if isinstance(c, dict)],
        "drafted_cards": [c.get("name") for c in view.get("draftedCards", []) if isinstance(c, dict)],
        "dealt_corps": [c.get("name") for c in view.get("dealtCorporationCards", []) if isinstance(c, dict)],
        "dealt_preludes": [c.get("name") for c in view.get("dealtPreludeCards", []) if isinstance(c, dict)],
        "dealt_ceos": [c.get("name") for c in (view.get("dealtCEOCards", view.get("dealtCeoCards", [])) or []) if isinstance(c, dict)],
        "dealt_project_cards": [c.get("name") for c in view.get("dealtProjectCards", []) if isinstance(c, dict)],
        "picked_corp_cards": [c.get("name") for c in view.get("pickedCorporationCard", []) if isinstance(c, dict)],
        "prelude_cards_in_hand": [c.get("name") for c in view.get("preludeCardsInHand", []) if isinstance(c, dict)],
        "ceo_cards_in_hand": [c.get("name") for c in view.get("ceoCardsInHand", []) if isinstance(c, dict)],
        "waiting_type": waiting_for.get("type"),
        "waiting_label": waiting_for.get("buttonLabel"),
    }
    if snap_error:
        snap["snapshot_error"] = snap_error
    return snap


def card_score(card: dict) -> int | None:
    return card.get("effective_score", card.get("adjusted_score", card.get("base_score")))


def draft_score(card: dict) -> int | None:
    return card.get("adjusted_score", card.get("effective_score", card.get("base_score")))


def numeric_score(value) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def hand_cards_by_name(snap: dict) -> dict[str, dict]:
    cards: dict[str, dict] = {}
    for card in snap.get("hand", []) or []:
        name = card.get("name")
        if name and name not in cards:
            cards[name] = card
    return cards


def hand_advice_by_name(snap: dict) -> dict[str, dict]:
    rows: dict[str, dict] = {}
    for row in snap.get("hand_advice", []) or []:
        name = row.get("name")
        if name and name not in rows:
            rows[name] = row
    return rows


def advice_value(row: dict, fallback_card: dict | None = None) -> float | None:
    score = numeric_score(row.get("play_value_now"))
    if score is not None:
        return score
    score = numeric_score(row.get("hold_value"))
    if score is not None:
        return score
    if fallback_card is not None:
        return numeric_score(card_score(fallback_card))
    return None


def build_rank_map(cards: list[dict], score_fn) -> dict[str, tuple[int, int | None]]:
    ranks: dict[str, tuple[int, int | None]] = {}
    for idx, card in enumerate(cards, start=1):
        name = card.get("name")
        if not name:
            continue
        ranks[name] = (idx, score_fn(card))
    return ranks


def hand_rank_map(snap: dict) -> dict[str, tuple[int, int | None]]:
    return build_rank_map(snap.get("hand", []), card_score)


def draft_rank_map(snap: dict) -> dict[str, tuple[int, int | None]]:
    return build_rank_map(snap.get("current_draft", []), draft_score)


def new_items(curr_items: list[str], prev_items: list[str]) -> list[str]:
    prev_set = {item for item in (prev_items or []) if item}
    return [item for item in (curr_items or []) if item and item not in prev_set]


def option_entries_from_cards(cards: list[dict], score_fn, limit: int | None = 3) -> list[dict]:
    entries = []
    source = cards if limit is None else cards[:limit]
    for idx, card in enumerate(source, start=1):
        entry = {
            "name": card.get("name"),
            "rank": idx,
            "score": score_fn(card),
        }
        action = card.get("play_action") or card.get("draft_action")
        reason = card.get("play_reason") or card.get("draft_reason")
        if action:
            entry["action"] = action
        if reason:
            entry["reason"] = reason
        entries.append(entry)
    return entries


def option_entries_from_hand_advice(snap: dict, limit: int | None = 3) -> list[dict]:
    entries = []
    cards = hand_cards_by_name(snap)
    source = snap.get("hand_advice", []) or []
    if limit is not None:
        source = source[:limit]
    for idx, row in enumerate(source, start=1):
        name = row.get("name")
        card = cards.get(name, {})
        entry = {
            "name": name,
            "rank": idx,
            "score": card_score(card),
        }
        action = row.get("action")
        reason = row.get("reason")
        value = advice_value(row, card)
        if action:
            entry["action"] = action
        if reason:
            entry["reason"] = reason
        if value is not None:
            entry["play_value_now"] = value
        if row.get("priority") is not None:
            entry["priority"] = row.get("priority")
        entries.append(entry)
    return entries


def recommended_play_card_name(snap: dict) -> str | None:
    best_move = str((snap.get("summary") or {}).get("best_move") or "").strip()
    if not best_move.startswith("PLAY "):
        return None

    remainder = best_move.removeprefix("PLAY ").strip()
    if not remainder:
        return None

    known_names = [
        row.get("name")
        for row in (snap.get("hand_advice", []) or [])
        if row.get("name")
    ]
    known_names.extend(hand_cards_by_name(snap).keys())
    for name in sorted(set(known_names), key=len, reverse=True):
        if remainder == name or remainder.startswith(f"{name} "):
            return name

    for separator in (" — ", " | ", " - "):
        if separator in remainder:
            return remainder.split(separator, 1)[0].strip() or None
    return remainder


def advisor_miss_top_choices(play_entries: list[dict], best_name: str) -> list[dict]:
    best_entry = next((entry for entry in play_entries if entry.get("name") == best_name), None)
    if best_entry is None:
        return play_entries[:ADVISOR_MISS_TOP_CHOICES]

    choices = [best_entry]
    for entry in play_entries:
        if entry.get("name") == best_name:
            continue
        choices.append(entry)
        if len(choices) >= ADVISOR_MISS_TOP_CHOICES:
            break
    return choices


def option_entries_from_names(option_names: list[str], rank_map: dict[str, tuple[int, int | None]], limit: int | None = 3) -> list[dict]:
    entries = []
    source = option_names if limit is None else option_names[:limit]
    for idx, name in enumerate(source, start=1):
        rank, score = rank_map.get(name, (idx, None))
        entries.append({
            "name": name,
            "rank": rank,
            "score": score,
        })
    return entries


def pick_relevant_alerts(alerts: list[str], limit: int = 3) -> list[str]:
    preferred: list[str] = []
    markers = ("🎯", "VP", "ЗАКРЫВАЙ ИГРУ", "ФОНДИРУЙ", "Trade", "greenery", "tempo")
    for marker in markers:
        for alert in alerts or []:
            if marker in alert and alert not in preferred:
                preferred.append(alert)
                if len(preferred) >= limit:
                    return preferred
    return list((alerts or [])[:limit])


def summarize_vp_race(snap: dict) -> dict | None:
    me_name = snap.get("me", {}).get("name")
    rows = []
    for row in snap.get("vp_estimates", []) or []:
        vp = row.get("vp", {}) or {}
        total = vp.get("total")
        if isinstance(total, (int, float)):
            rows.append({"name": row.get("name"), "total": total})
    if not rows or not me_name:
        return None
    rows.sort(key=lambda row: (-row["total"], row["name"] or ""))
    leader = rows[0]
    mine = next((row for row in rows if row["name"] == me_name), None)
    if mine is None:
        return None
    return {
        "leader": leader["name"],
        "leader_vp": leader["total"],
        "me_vp": mine["total"],
        "gap_to_leader": mine["total"] - leader["total"],
    }


def build_decision_context(snap: dict, top_options: list[dict] | None = None) -> dict:
    game = snap.get("game", {}) or {}
    me = snap.get("me", {}) or {}
    live = snap.get("live", {}) or {}
    context = {
        "game": {
            "generation": game.get("generation"),
            "phase": game.get("phase"),
            "live_phase": game.get("live_phase"),
            "gens_left": game.get("gens_left"),
            "temperature": game.get("temperature"),
            "oxygen": game.get("oxygen"),
            "oceans": game.get("oceans"),
            "venus": game.get("venus"),
        },
        "me": {
            "corp": me.get("corp"),
            "tr": me.get("tr"),
            "mc": me.get("mc"),
            "steel": me.get("steel"),
            "titanium": me.get("titanium"),
            "plants": me.get("plants"),
            "energy": me.get("energy"),
            "heat": me.get("heat"),
            "production": me.get("production", {}),
        },
        "waiting": {
            "type": live.get("waiting_type"),
            "label": live.get("waiting_label"),
        },
        "alerts": pick_relevant_alerts(snap.get("alerts", []) or []),
        "vp_race": summarize_vp_race(snap),
    }
    summary = snap.get("summary") or {}
    if summary.get("best_move"):
        context["best_move"] = summary.get("best_move")
    if summary.get("lines"):
        context["summary_lines"] = list(summary.get("lines")[:4])
    trade_hint = (snap.get("trade") or {}).get("hint")
    if trade_hint:
        context["trade_hint"] = trade_hint
    if top_options is None:
        if snap.get("current_draft"):
            top_options = option_entries_from_cards(snap.get("current_draft", []), draft_score)
        elif snap.get("hand_advice"):
            top_options = ranked_advisor_play_entries(snap, limit=3) or option_entries_from_hand_advice(snap)
        elif snap.get("hand"):
            top_options = option_entries_from_cards(snap.get("hand", []), card_score)
    if top_options:
        context["top_options"] = top_options[:3]
    return context


def research_offer_cards(live: dict) -> list[str]:
    return (
        list(live.get("drafted_cards") or [])
        or list(live.get("dealt_project_cards") or [])
        or list(live.get("current_pack") or [])
    )


def advisor_play_entries(snap: dict, limit: int | None = None) -> list[dict]:
    entries = []
    cards = hand_cards_by_name(snap)
    seen: set[str] = set()
    for advice_rank, row in enumerate(snap.get("hand_advice", []) or [], start=1):
        name = row.get("name")
        if not name or name in seen or row.get("action") != "PLAY":
            continue
        seen.add(name)
        card = cards.get(name, {})
        value = advice_value(row, card)
        if value is None:
            continue
        entry = {
            "name": name,
            "rank": len(entries) + 1,
            "advice_rank": advice_rank,
            "score": value,
            "play_value_now": value,
            "effective_score": card_score(card),
            "action": row.get("action"),
            "reason": row.get("reason"),
        }
        entries.append(entry)
        if limit is not None and len(entries) >= limit:
            break
    return entries


def ranked_advisor_play_entries(snap: dict, limit: int | None = None) -> list[dict]:
    entries = advisor_play_entries(snap)
    recommended_name = recommended_play_card_name(snap)
    recommended = next(
        (entry for entry in entries if entry.get("name") == recommended_name),
        None,
    )
    ordered = ([recommended] if recommended else []) + [
        entry for entry in entries
        if recommended is None or entry.get("name") != recommended.get("name")
    ]

    ranked = []
    for idx, entry in enumerate(ordered, start=1):
        ranked_entry = dict(entry)
        ranked_entry["rank"] = idx
        ranked.append(ranked_entry)
        if limit is not None and len(ranked) >= limit:
            break
    return ranked


def build_static_advisor_miss(prev_snap: dict, curr_snap: dict, player_id: str, card_name: str) -> dict | None:
    prev_hand = prev_snap.get("hand", [])
    if not prev_hand:
        return None

    prev_ranks = hand_rank_map(prev_snap)
    rank = prev_ranks.get(card_name)
    if rank is None:
        return None

    chosen_rank, chosen_score = rank
    if chosen_rank <= 1:
        return None

    best_card = prev_hand[0]
    best_name = best_card.get("name")
    best_score = card_score(best_card)
    if best_name == card_name or best_score is None or chosen_score is None:
        return None

    return build_advisor_miss_event(
        prev_snap,
        curr_snap,
        player_id,
        card_name,
        chosen_rank,
        float(chosen_score),
        best_name,
        float(best_score),
        [
            {
                "name": card.get("name"),
                "rank": idx,
                "score": card_score(card),
            }
            for idx, card in enumerate(prev_hand[:ADVISOR_MISS_TOP_CHOICES], start=1)
        ],
        "effective_score",
    )


def build_advisor_miss_event(
    prev_snap: dict,
    curr_snap: dict,
    player_id: str,
    card_name: str,
    chosen_rank: int,
    chosen_score: float,
    best_name: str,
    best_score: float,
    top_choices: list[dict],
    score_kind: str,
) -> dict | None:
    if best_name == card_name:
        return None

    score_gap = round(best_score - chosen_score, 1)
    if score_gap < 0:
        return None
    if chosen_rank < ADVISOR_MISS_MIN_RANK and score_gap < ADVISOR_MISS_STRONG_SCORE_GAP:
        return None
    if chosen_rank >= ADVISOR_MISS_MIN_RANK and score_gap < ADVISOR_MISS_MIN_SCORE_GAP:
        return None

    severity = "low"
    if chosen_rank >= 7 or score_gap >= 20:
        severity = "high"
    elif chosen_rank >= 5 or score_gap >= 12:
        severity = "medium"

    reasons = []
    if chosen_rank >= ADVISOR_MISS_MIN_RANK:
        reasons.append("rank")
    if score_gap >= ADVISOR_MISS_STRONG_SCORE_GAP:
        reasons.append("score_gap")

    return {
        "type": "advisor_miss",
        "ts": datetime.now().isoformat(timespec="seconds"),
        "player_id": player_id,
        "player": curr_snap["me"]["name"],
        "card": card_name,
        "chosen_rank": chosen_rank,
        "chosen_score": chosen_score,
        "best_card": best_name,
        "best_score": best_score,
        "score_gap": score_gap,
        "score_kind": score_kind,
        "severity": severity,
        "reason": "+".join(reasons) if reasons else "score_gap",
        "top_choices": top_choices,
        "snapshot_error": prev_snap.get("snapshot_error"),
    }


def build_advisor_miss(prev_snap: dict, curr_snap: dict, player_id: str, card_name: str) -> dict | None:
    best_move = (prev_snap.get("summary") or {}).get("best_move") or ""
    if best_move and not str(best_move).startswith("PLAY "):
        return None

    if "hand_advice" not in prev_snap:
        return build_static_advisor_miss(prev_snap, curr_snap, player_id, card_name)

    play_entries = ranked_advisor_play_entries(prev_snap)
    if not play_entries:
        return None

    play_rank_map = {entry["name"]: entry for entry in play_entries}
    recommended_name = recommended_play_card_name(prev_snap)
    best = play_rank_map.get(recommended_name) if recommended_name else None
    if best is None:
        best = play_entries[0]
    chosen = play_rank_map.get(card_name)
    if chosen is None:
        card = hand_cards_by_name(prev_snap).get(card_name, {})
        advice = hand_advice_by_name(prev_snap).get(card_name)
        if advice is None:
            return None
        chosen_score = advice_value(advice, card)
        if chosen_score is None:
            return None
        chosen_rank = len(play_entries) + 1
    else:
        chosen_score = chosen["score"]
        chosen_rank = chosen["rank"]

    return build_advisor_miss_event(
        prev_snap,
        curr_snap,
        player_id,
        card_name,
        chosen_rank,
        chosen_score,
        best["name"],
        best["score"],
        advisor_miss_top_choices(play_entries, best["name"]),
        "play_value_now",
    )


def is_draft_pack_snapshot(snap: dict) -> bool:
    game = snap.get("game", {}) or {}
    live = snap.get("live", {}) or {}
    live_phase = str(game.get("live_phase") or "").lower()
    if live_phase in {"drafting", "initial_drafting", "initialdrafting", "research"}:
        return True
    if snap.get("current_draft"):
        return True
    return False


def append_jsonl(path: str, payload: dict) -> None:
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False) + "\n")


def hand_check_card_entries(snap: dict) -> list[dict]:
    live = snap.get("live", {}) or {}
    cards = hand_cards_by_name(snap)
    advice = hand_advice_by_name(snap)
    names = [name for name in (live.get("cards_in_hand") or []) if name]
    if not names and live.get("hand_count"):
        names = [card.get("name") for card in (snap.get("hand") or []) if card.get("name")]

    entries = []
    for name in names:
        card = cards.get(name, {})
        row = advice.get(name, {})
        entry = {"name": name}
        score = card_score(card)
        if score is not None:
            entry["score"] = score
        value = advice_value(row, card) if row or card else None
        if value is not None:
            entry["play_value_now"] = value
        action = row.get("action") or card.get("play_action") or card.get("draft_action")
        reason = row.get("reason") or card.get("play_reason") or card.get("draft_reason")
        if action:
            entry["action"] = action
        if reason:
            entry["reason"] = reason
        entries.append(entry)
    return entries


def build_hand_check_event(
    game_id: str,
    game: dict,
    player_ids: list[str],
    player_states: dict[str, dict],
    reason: str,
    interval_sec: float,
) -> dict:
    players = []
    for pid in player_ids:
        state = player_states.get(pid) or {}
        me = state.get("me", {}) or {}
        live = state.get("live", {}) or {}
        players.append({
            "player_id": pid,
            "player": me.get("name") or pid,
            "color": live.get("color"),
            "corp": me.get("corp"),
            "is_active": live.get("is_active"),
            "tr": live.get("tr"),
            "mc": live.get("mc"),
            "hand_count": live.get("hand_count"),
            "cards_in_hand": hand_check_card_entries(state),
            "current_pack": list(live.get("current_pack") or []),
            "drafted_cards": list(live.get("drafted_cards") or []),
            "dealt_corps": list(live.get("dealt_corps") or []),
            "dealt_preludes": list(live.get("dealt_preludes") or []),
            "dealt_ceos": list(live.get("dealt_ceos") or []),
            "dealt_project_cards": list(live.get("dealt_project_cards") or []),
            "waiting_type": live.get("waiting_type"),
            "waiting_label": live.get("waiting_label"),
            "snapshot_error": state.get("snapshot_error"),
        })

    return {
        "type": "hand_check",
        "ts": datetime.now().isoformat(timespec="seconds"),
        "game_id": game_id,
        "reason": reason,
        "interval_sec": interval_sec,
        "generation": game.get("generation"),
        "phase": game.get("phase"),
        "active_player": game.get("activePlayer"),
        "player_count": len(players),
        "players": players,
    }


def maybe_append_hand_check(session: dict, game: dict, player_states: dict[str, dict], reason: str) -> bool:
    interval_sec = float(session.get("hand_check_interval", DEFAULT_HAND_CHECK_INTERVAL) or 0)
    if interval_sec <= 0:
        return False
    append_jsonl(
        session["log_path"],
        build_hand_check_event(
            session["game_id"],
            game,
            session["player_ids"],
            player_states,
            reason,
            interval_sec,
        ),
    )
    session["last_hand_check_at"] = time.monotonic()
    session["hand_check_logged"] = True
    return True


def hand_check_due(session: dict, now: float) -> bool:
    interval_sec = float(session.get("hand_check_interval", DEFAULT_HAND_CHECK_INTERVAL) or 0)
    if interval_sec <= 0:
        return False
    if not session.get("hand_check_logged"):
        return True
    return now - float(session.get("last_hand_check_at", 0.0)) >= interval_sec


def compact_option_entry(entry: dict) -> dict:
    out = {
        "name": entry.get("name"),
    }
    for key in (
        "rank", "advice_rank", "score", "play_value_now", "effective_score",
        "action", "reason", "priority",
    ):
        if entry.get(key) is not None:
            out[key] = entry.get(key)
    return out


def ui_playable_project_names(snap: dict) -> set[str]:
    validation = snap.get("action_validation") or {}
    if validation.get("saw_project_selector"):
        return {
            str(name)
            for name in (validation.get("playable_project_cards") or [])
            if name
        }
    live = snap.get("live", {}) or {}
    return {
        str(name)
        for name in (live.get("playable_project_cards") or [])
        if name
    }


def advisor_check_play_entries(snap: dict, limit: int = 5) -> list[dict]:
    entries = ranked_advisor_play_entries(snap)
    ui_names = ui_playable_project_names(snap)
    if ui_names:
        entries = [entry for entry in entries if entry.get("name") in ui_names]
    return [compact_option_entry(entry) for entry in entries[:limit]]


def advisor_check_draft_entries(snap: dict, limit: int = 5) -> list[dict]:
    return option_entries_from_cards(snap.get("current_draft", []) or [], draft_score, limit=limit)


def is_actionable_state(snap: dict) -> bool:
    live = snap.get("live", {}) or {}
    if not live.get("waiting_type"):
        return False
    game = snap.get("game", {}) or {}
    live_phase = str(game.get("live_phase") or game.get("phase") or "").lower()
    if not live_phase:
        return True
    return live_phase in {
        "action",
        "drafting",
        "initial_drafting",
        "initialdrafting",
        "corporationsdrafting",
        "research",
    }


def build_advisor_diagnostics(snap: dict) -> list[dict]:
    diagnostics: list[dict] = []

    def add(severity: str, code: str, message: str, **extra) -> None:
        item = {"severity": severity, "code": code, "message": message}
        item.update({key: value for key, value in extra.items() if value is not None})
        diagnostics.append(item)

    live = snap.get("live", {}) or {}
    game = snap.get("game", {}) or {}
    live_phase = str(game.get("live_phase") or "").lower()
    terminal = live_phase in {"end", "the_end"}
    hand_count = live.get("hand_count")
    live_hand_names = [name for name in (live.get("cards_in_hand") or []) if name]
    hand_cards = snap.get("hand", []) or []
    hand_advice = snap.get("hand_advice", []) or []
    current_draft = snap.get("current_draft", []) or []
    current_pack = [name for name in (live.get("current_pack") or []) if name]
    actionable = is_actionable_state(snap)

    if snap.get("snapshot_error"):
        add("error", "snapshot_error", "Advisor snapshot raised an exception.", error=snap.get("snapshot_error"))

    for alert in snap.get("alerts", []) or []:
        if str(alert).startswith("Error:"):
            add("error", "alert_error", "Advisor produced an error alert.", alert=alert)

    if isinstance(hand_count, int) and live_hand_names and hand_count != len(live_hand_names):
        add(
            "warning",
            "hand_count_mismatch",
            "API hand_count differs from parsed cards_in_hand length.",
            hand_count=hand_count,
            parsed_count=len(live_hand_names),
        )

    if hand_count and not terminal and not hand_cards and not snap.get("snapshot_error"):
        add("warning", "missing_hand_cards", "Player has cards in hand but advisor hand list is empty.", hand_count=hand_count)

    if hand_count and actionable and live_phase == "action" and not hand_advice and not snap.get("snapshot_error"):
        add("warning", "missing_hand_advice", "Action-phase hand is non-empty but advisor returned no hand_advice.", hand_count=hand_count)

    missing_hand_scores = [card.get("name") for card in hand_cards if card.get("name") and card_score(card) is None]
    if missing_hand_scores:
        add("warning", "missing_hand_scores", "Some hand cards have no advisor score.", cards=missing_hand_scores[:8])

    missing_draft_scores = [card.get("name") for card in current_draft if card.get("name") and draft_score(card) is None]
    if missing_draft_scores:
        add("warning", "missing_draft_scores", "Some draft/current-pack cards have no advisor score.", cards=missing_draft_scores[:8])

    if current_pack and not current_draft and live_phase in {"drafting", "initial_drafting", "initialdrafting", "research"}:
        add("warning", "missing_current_draft", "API exposes a current pack but advisor current_draft is empty.", pack_count=len(current_pack))

    summary = snap.get("summary") or {}
    best_move = str(summary.get("best_move") or "").strip()
    play_entries = advisor_play_entries(snap)
    ranked_play = ranked_advisor_play_entries(snap)
    ui_playable_names = ui_playable_project_names(snap)
    waiting_type = live.get("waiting_type")
    has_decision_context = bool(
        (actionable and waiting_type)
        or (actionable and current_draft)
        or (actionable and live_phase == "action" and (play_entries or hand_advice))
    )
    if not best_move and not terminal and has_decision_context:
        add("warning", "missing_best_move", "Advisor returned no best_move for a non-empty decision context.")

    if not actionable:
        return diagnostics

    play_entries_for_value = play_entries
    ranked_play_for_value = ranked_play
    if live_phase == "action" and ui_playable_names:
        unavailable_play_cards = [
            row.get("name")
            for row in hand_advice
            if row.get("action") == "PLAY"
            and row.get("name")
            and row.get("name") not in ui_playable_names
        ]
        if unavailable_play_cards:
            add(
                "warning",
                "play_not_available_in_ui",
                "Advisor marks PLAY for cards absent from the current UI Play project card list.",
                cards=unavailable_play_cards[:8],
            )
        best_card = recommended_play_card_name(snap)
        if best_move.lower().startswith("play ") and best_card and best_card not in ui_playable_names:
            add(
                "warning",
                "best_move_not_available_in_ui",
                "Summary recommends PLAY for a card absent from the current UI Play project card list.",
                card=best_card,
            )
        play_entries_for_value = [
            entry for entry in play_entries
            if entry.get("name") in ui_playable_names
        ]
        ranked_play_for_value = [
            entry for entry in ranked_play
            if entry.get("name") in ui_playable_names
        ]

    if best_move.startswith("PLAY "):
        best_card = recommended_play_card_name(snap)
        known_cards = set(hand_cards_by_name(snap).keys()) | set(hand_advice_by_name(snap).keys())
        play_cards = {entry.get("name") for entry in play_entries}
        if best_card and known_cards and best_card not in known_cards:
            add("error", "best_move_card_not_in_hand", "Summary recommends a card absent from hand/advice.", card=best_card)
        if best_card and play_cards and best_card not in play_cards:
            add("warning", "best_move_not_playable", "Summary PLAY card is not present in PLAY advice entries.", card=best_card)

    if ranked_play_for_value:
        recommended = ranked_play_for_value[0]
        best_by_value = max(play_entries_for_value, key=lambda entry: entry.get("score", 0), default=None)
        if best_by_value:
            gap = float(best_by_value.get("score", 0) or 0) - float(recommended.get("score", 0) or 0)
            if gap >= ADVISOR_CHECK_VALUE_GAP:
                add(
                    "warning",
                    "best_move_value_gap",
                    "Recommended play is far below the highest play_value_now option.",
                    recommended=recommended.get("name"),
                    recommended_value=recommended.get("score"),
                    best=best_by_value.get("name"),
                    best_value=best_by_value.get("score"),
                    gap=round(gap, 1),
                )
            if numeric_score(recommended.get("score")) is not None and recommended.get("score") <= 0:
                add(
                    "warning",
                    "nonpositive_recommended_play",
                    "Advisor recommends PLAY with non-positive play value.",
                    card=recommended.get("name"),
                    value=recommended.get("score"),
                )

    for row in hand_advice:
        play_value = numeric_score(row.get("play_value_now"))
        if row.get("action") == "PLAY" and play_value is not None and play_value <= -5:
            add(
                "error",
                "negative_value_play",
                "Advisor marks a negative-value card as PLAY.",
                card=row.get("name"),
                value=play_value,
            )

    return diagnostics


def build_advisor_check_event(
    game_id: str,
    game: dict,
    player_ids: list[str],
    player_states: dict[str, dict],
    reason: str,
    interval_sec: float,
) -> dict:
    players = []
    for pid in player_ids:
        state = player_states.get(pid) or {}
        me = state.get("me", {}) or {}
        live = state.get("live", {}) or {}
        diagnostics = build_advisor_diagnostics(state)
        summary = state.get("summary") or {}
        actionable = is_actionable_state(state)
        players.append({
            "player_id": pid,
            "player": me.get("name") or pid,
            "color": live.get("color"),
            "corp": me.get("corp"),
            "snapshot_ok": not state.get("snapshot_error"),
            "snapshot_error": state.get("snapshot_error"),
            "hand_count": live.get("hand_count"),
            "hand_advice_count": len(state.get("hand_advice", []) or []),
            "current_draft_count": len(state.get("current_draft", []) or []),
            "waiting_type": live.get("waiting_type"),
            "waiting_label": live.get("waiting_label"),
            "actionable": actionable,
            "best_move": summary.get("best_move") if actionable else None,
            "summary_lines": list((summary.get("lines") or [])[:4]) if actionable else [],
            "top_play": advisor_check_play_entries(state) if actionable else [],
            "top_draft": advisor_check_draft_entries(state) if actionable else [],
            "alerts": pick_relevant_alerts(state.get("alerts", []) or [], limit=5),
            "diagnostics": diagnostics,
            "diagnostic_count": len(diagnostics),
            "max_severity": (
                "error" if any(item.get("severity") == "error" for item in diagnostics)
                else "warning" if diagnostics
                else "ok"
            ),
        })

    return {
        "type": "advisor_check",
        "ts": datetime.now().isoformat(timespec="seconds"),
        "game_id": game_id,
        "reason": reason,
        "interval_sec": interval_sec,
        "generation": game.get("generation"),
        "phase": game.get("phase"),
        "active_player": game.get("activePlayer"),
        "player_count": len(players),
        "players": players,
        "diagnostic_count": sum(player["diagnostic_count"] for player in players),
        "max_severity": (
            "error" if any(player["max_severity"] == "error" for player in players)
            else "warning" if any(player["max_severity"] == "warning" for player in players)
            else "ok"
        ),
    }


def maybe_append_advisor_check(session: dict, game: dict, player_states: dict[str, dict], reason: str) -> bool:
    interval_sec = float(session.get("advisor_check_interval", DEFAULT_ADVISOR_CHECK_INTERVAL) or 0)
    if interval_sec <= 0:
        return False
    append_jsonl(
        session["log_path"],
        build_advisor_check_event(
            session["game_id"],
            game,
            session["player_ids"],
            player_states,
            reason,
            interval_sec,
        ),
    )
    session["last_advisor_check_at"] = time.monotonic()
    session["advisor_check_logged"] = True
    return True


def advisor_check_due(session: dict, now: float) -> bool:
    interval_sec = float(session.get("advisor_check_interval", DEFAULT_ADVISOR_CHECK_INTERVAL) or 0)
    if interval_sec <= 0:
        return False
    if not session.get("advisor_check_logged"):
        return True
    return now - float(session.get("last_advisor_check_at", 0.0)) >= interval_sec


def append_pick_event(
    log_path: str,
    event_type: str,
    prev_snap: dict,
    player_id: str,
    picked_name: str,
    option_names: list[str],
    rank_map: dict[str, tuple[int, int | None]] | None = None,
) -> None:
    rank_map = rank_map or {}
    rank = rank_map.get(picked_name)
    option_entries = option_entries_from_names(option_names, rank_map)
    append_jsonl(log_path, {
        "type": event_type,
        "ts": datetime.now().isoformat(timespec="seconds"),
        "player_id": player_id,
        "player": prev_snap["me"]["name"],
        "picked": picked_name,
        "options": option_names,
        "prev_option_rank": rank[0] if rank else None,
        "prev_option_score": rank[1] if rank else None,
        "decision_context": build_decision_context(prev_snap, option_entries),
        "snapshot_error": prev_snap.get("snapshot_error"),
    })


def maybe_start_research_pending(session: dict, pid: str, prev_snap: dict) -> None:
    prev_live = prev_snap["live"]
    offer = research_offer_cards(prev_live)
    if not offer:
        return
    if prev_snap.get("game", {}).get("live_phase") != "research":
        return
    session["pending_research"][pid] = {
        "cards": offer,
        "prev_hand": list(prev_live.get("cards_in_hand") or []),
        "prev_tableau": list(prev_live.get("tableau") or []),
        "retries": 0,
        "rank_map": draft_rank_map(prev_snap),
        "decision_context": build_decision_context(
            prev_snap,
            option_entries_from_names(offer, draft_rank_map(prev_snap), limit=None),
        ),
        "snapshot_error": prev_snap.get("snapshot_error"),
    }


def try_resolve_research_pending(log_path: str, pid: str, prev_snap: dict, curr_snap: dict, pending: dict) -> bool:
    curr_live = curr_snap["live"]
    pending_cards = list(pending["cards"])
    prev_hand = list(pending.get("prev_hand") or [])
    prev_tableau = list(pending.get("prev_tableau") or [])
    rank_map = pending.get("rank_map") or {}

    hand_now = list(curr_live.get("cards_in_hand") or [])
    tableau_now = list(curr_live.get("tableau") or [])
    new_in_hand = new_items(hand_now, prev_hand)
    new_in_tableau = new_items(tableau_now, prev_tableau)
    appeared = set(new_in_hand + new_in_tableau)
    bought = [name for name in pending_cards if name in appeared]
    unresolved = [name for name in pending_cards if name not in bought]
    hand_size_delta = (curr_live.get("hand_count") or 0) - len(prev_hand)
    bought_unknown_count = max(0, min(hand_size_delta - len(bought), len(unresolved)))

    if not bought and hand_size_delta <= 0 and pending.get("retries", 0) < 6:
        pending["retries"] = pending.get("retries", 0) + 1
        return False

    detection = "exact"
    if bought_unknown_count > 0:
        detection = "partial"
    elif not bought and hand_size_delta <= 0:
        detection = "all_skipped"
    elif not bought and hand_size_delta > 0:
        detection = "count_only"

    skipped = unresolved[bought_unknown_count:] if unresolved else []
    append_jsonl(log_path, {
        "type": "research_buy",
        "ts": datetime.now().isoformat(timespec="seconds"),
        "player_id": pid,
        "player": curr_snap["me"]["name"],
        "offered": pending_cards,
        "bought": bought,
        "bought_unknown_count": bought_unknown_count,
        "skipped": skipped,
        "detection": detection,
        "advisor_order": option_entries_from_names(pending_cards, rank_map, limit=None),
        "decision_context": pending.get("decision_context"),
        "snapshot_error": pending.get("snapshot_error"),
    })
    return True


def start_game_session(game_id: str, base_url: str) -> dict:
    os.makedirs(LOG_DIR, exist_ok=True)
    started_at = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(LOG_DIR, f"watch_live_{game_id}_{started_at}.jsonl")
    snapshot_fn = load_snapshot(base_url)

    game = fetch_game(base_url, game_id)
    players = game.get("players", [])
    player_ids = [p["id"] for p in players]
    prev_game = game
    prev_players = {pid: build_player_state(pid, snapshot_fn, base_url) for pid in player_ids}

    append_jsonl(log_path, {
        "type": "session_start",
        "ts": datetime.now().isoformat(timespec="seconds"),
        "game_id": game_id,
        "spectator_id": game.get("spectatorId"),
        "players": players,
        "phase": game.get("phase"),
        "generation": game.get("generation"),
        "active_player": game.get("activePlayer"),
    })

    for pid, state in prev_players.items():
        append_jsonl(log_path, {
            "type": "initial_snapshot",
            "ts": datetime.now().isoformat(timespec="seconds"),
            "player_id": pid,
            "player": state["me"]["name"],
            "corp": state["me"]["corp"],
            "top_hand": [
                {
                    "name": c["name"],
                    "score": card_score(c),
                }
                for c in state.get("hand", [])[:5]
            ],
            "current_draft": [
                {"name": c["name"], "score": draft_score(c)}
                for c in state.get("current_draft", [])[:5]
            ],
            "alerts": state.get("alerts", [])[:6],
            "decision_context": build_decision_context(state),
            "snapshot_error": state.get("snapshot_error"),
        })

    session = {
        "game_id": game_id,
        "base_url": base_url,
        "log_path": log_path,
        "snapshot_fn": snapshot_fn,
        "player_ids": player_ids,
        "prev_game": prev_game,
        "prev_players": prev_players,
        "started_at": started_at,
        "advisor_miss_counts": {},
        "pending_research": {},
        "hand_check_interval": DEFAULT_HAND_CHECK_INTERVAL,
        "last_hand_check_at": 0.0,
        "hand_check_logged": False,
        "advisor_check_interval": DEFAULT_ADVISOR_CHECK_INTERVAL,
        "last_advisor_check_at": 0.0,
        "advisor_check_logged": False,
    }
    return session


def poll_game_session(session: dict) -> dict:
    game_id = session["game_id"]
    base_url = session["base_url"]
    log_path = session["log_path"]
    snapshot_fn = session["snapshot_fn"]
    player_ids = session["player_ids"]
    prev_game = session["prev_game"]
    prev_players = session["prev_players"]
    advisor_miss_counts = session["advisor_miss_counts"]
    pending_research = session["pending_research"]

    try:
        game = fetch_game(base_url, game_id)
    except Exception:
        append_jsonl(log_path, {
            "type": "game_unavailable",
            "ts": datetime.now().isoformat(timespec="seconds"),
            "game_id": game_id,
        })
        return {"active": False, "changed": False, "status": "unavailable"}
    if game.get("phase") == "end":
        append_jsonl(log_path, {
            "type": "game_end",
            "ts": datetime.now().isoformat(timespec="seconds"),
            "generation": game.get("generation"),
        })
        return {"active": False, "changed": True, "status": "ended"}

    changed = False
    if (
        game.get("phase") != prev_game.get("phase")
        or game.get("generation") != prev_game.get("generation")
        or game.get("activePlayer") != prev_game.get("activePlayer")
    ):
        changed = True
        append_jsonl(log_path, {
            "type": "game_state",
            "ts": datetime.now().isoformat(timespec="seconds"),
            "phase_from": prev_game.get("phase"),
            "phase_to": game.get("phase"),
            "generation_from": prev_game.get("generation"),
            "generation_to": game.get("generation"),
            "active_from": prev_game.get("activePlayer"),
            "active_to": game.get("activePlayer"),
        })

    curr_players = {pid: build_player_state(pid, snapshot_fn, base_url) for pid in player_ids}
    now_monotonic = time.monotonic()
    if hand_check_due(session, now_monotonic):
        reason = "periodic" if session.get("hand_check_logged") else "initial"
        changed = maybe_append_hand_check(session, game, curr_players, reason) or changed
    if advisor_check_due(session, now_monotonic):
        reason = "periodic" if session.get("advisor_check_logged") else "initial"
        changed = maybe_append_advisor_check(session, game, curr_players, reason) or changed

    for pid in player_ids:
        prev = prev_players[pid]
        curr = curr_players[pid]
        prev_live = prev["live"]
        curr_live = curr["live"]
        prev_ranks = hand_rank_map(prev)
        prev_play_entries = ranked_advisor_play_entries(prev)
        prev_play_ranks = {entry["name"]: entry for entry in prev_play_entries}
        prev_recommended_play = prev_play_entries[0]["name"] if prev_play_entries else None
        prev_draft_ranks = draft_rank_map(prev)

        prev_research_offer = research_offer_cards(prev_live)
        curr_research_offer = research_offer_cards(curr_live)
        if pid in pending_research:
            if try_resolve_research_pending(log_path, pid, prev, curr, pending_research[pid]):
                changed = True
                del pending_research[pid]
        if (
            pid not in pending_research
            and prev_research_offer
            and not curr_research_offer
            and curr.get("game", {}).get("live_phase") == "action"
        ):
            maybe_start_research_pending(session, pid, prev)
            if pid in pending_research and try_resolve_research_pending(log_path, pid, prev, curr, pending_research[pid]):
                changed = True
                del pending_research[pid]

        new_cards = new_items(curr_live["tableau"], prev_live["tableau"])
        for card_name in new_cards:
            changed = True
            rank = prev_ranks.get(card_name)
            play_rank = prev_play_ranks.get(card_name)
            append_jsonl(log_path, {
                "type": "card_played",
                "ts": datetime.now().isoformat(timespec="seconds"),
                "player_id": pid,
                "player": curr["me"]["name"],
                "card": card_name,
                "prev_hand_rank": rank[0] if rank else None,
                "prev_hand_score": rank[1] if rank else None,
                "prev_play_rank": play_rank.get("rank") if play_rank else None,
                "prev_play_score": play_rank.get("score") if play_rank else None,
                "prev_play_reason": play_rank.get("reason") if play_rank else None,
                "prev_recommended_play": prev_recommended_play,
                "last_card_played": curr_live["last_card_played"],
                "decision_context": build_decision_context(prev),
                "snapshot_error": prev.get("snapshot_error"),
            })
            advisor_miss = build_advisor_miss(prev, curr, pid, card_name)
            if advisor_miss is not None:
                advisor_miss_counts[pid] = advisor_miss_counts.get(pid, 0) + 1
                advisor_miss["miss_count"] = advisor_miss_counts[pid]
                append_jsonl(log_path, advisor_miss)

        new_actions = [
            action for action in curr_live["actions_this_generation"]
            if action not in prev_live["actions_this_generation"]
        ]
        if new_actions:
            changed = True
            append_jsonl(log_path, {
                "type": "actions_taken",
                "ts": datetime.now().isoformat(timespec="seconds"),
                "player_id": pid,
                "player": curr["me"]["name"],
                "actions": new_actions,
                "decision_context": build_decision_context(curr),
                "snapshot_error": curr.get("snapshot_error"),
            })

        for picked_name in new_items(curr_live["picked_corp_cards"], prev_live["picked_corp_cards"]):
            changed = True
            append_pick_event(
                log_path,
                "corp_pick",
                prev,
                pid,
                picked_name,
                prev_live["dealt_corps"],
            )

        for picked_name in new_items(curr_live["prelude_cards_in_hand"], prev_live["prelude_cards_in_hand"]):
            changed = True
            append_pick_event(
                log_path,
                "prelude_pick",
                prev,
                pid,
                picked_name,
                prev_live["dealt_preludes"],
            )

        for picked_name in new_items(curr_live["ceo_cards_in_hand"], prev_live["ceo_cards_in_hand"]):
            changed = True
            append_pick_event(
                log_path,
                "ceo_pick",
                prev,
                pid,
                picked_name,
                prev_live["dealt_ceos"],
            )

        project_options = prev_live["current_pack"] or prev_live["dealt_project_cards"]
        for picked_name in new_items(curr_live["drafted_cards"], prev_live["drafted_cards"]):
            changed = True
            append_pick_event(
                log_path,
                "project_pick",
                prev,
                pid,
                picked_name,
                project_options,
                prev_draft_ranks,
            )

        if (
            curr_live["current_pack"] != prev_live["current_pack"]
            and curr_live["current_pack"]
            and is_draft_pack_snapshot(curr)
        ):
            changed = True
            draft_scores = {
                card["name"]: draft_score(card)
                for card in curr.get("current_draft", [])
            }
            append_jsonl(log_path, {
                "type": "draft_pack",
                "ts": datetime.now().isoformat(timespec="seconds"),
                "player_id": pid,
                "player": curr["me"]["name"],
                "cards": curr_live["current_pack"],
                "advisor_order": [
                    {"name": name, "score": draft_scores.get(name)}
                    for name in curr_live["current_pack"]
                ],
                "decision_context": build_decision_context(
                    curr,
                    option_entries_from_names(curr_live["current_pack"], draft_rank_map(curr)),
                ),
                "snapshot_error": curr.get("snapshot_error"),
            })

        for res_name in ("mc", "heat", "plants", "energy", "tr"):
            prev_val = prev_live[res_name]
            curr_val = curr_live[res_name]
            if prev_val != curr_val and abs((curr_val or 0) - (prev_val or 0)) >= 4:
                changed = True
                append_jsonl(log_path, {
                    "type": "resource_delta",
                    "ts": datetime.now().isoformat(timespec="seconds"),
                    "player_id": pid,
                    "player": curr["me"]["name"],
                    "resource": res_name,
                    "from": prev_val,
                    "to": curr_val,
                    "decision_context": build_decision_context(curr),
                })

    session["prev_game"] = game
    session["prev_players"] = curr_players
    return {
        "active": True,
        "changed": changed,
        "status": "ok",
        "phase": game.get("phase"),
        "generation": game.get("generation"),
        "active_player": game.get("activePlayer"),
    }


def monitor_game(
    game_id: str,
    interval: float,
    base_url: str,
    hand_check_interval: float = DEFAULT_HAND_CHECK_INTERVAL,
    advisor_check_interval: float = DEFAULT_ADVISOR_CHECK_INTERVAL,
) -> str:
    session = start_game_session(game_id, base_url)
    session["hand_check_interval"] = hand_check_interval
    session["advisor_check_interval"] = advisor_check_interval
    while True:
        time.sleep(interval)
        try:
            result = poll_game_session(session)
        except (urllib.error.URLError, TimeoutError, ConnectionResetError, OSError) as exc:
            append_jsonl(session["log_path"], {
                "type": "poll_error",
                "ts": datetime.now().isoformat(timespec="seconds"),
                "error": repr(exc),
            })
            continue
        if not result["active"]:
            break
    return session["log_path"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("game_id")
    parser.add_argument("--interval", type=float, default=10.0)
    parser.add_argument("--server-url", default=os.environ.get("TM_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument(
        "--hand-check-interval",
        type=float,
        default=DEFAULT_HAND_CHECK_INTERVAL,
        help="Seconds between full all-player hand_check events (default: 300; <=0 disables)",
    )
    parser.add_argument(
        "--advisor-check-interval",
        type=float,
        default=DEFAULT_ADVISOR_CHECK_INTERVAL,
        help="Seconds between full all-player advisor_check events (default: 300; <=0 disables)",
    )
    args = parser.parse_args()

    log_path = monitor_game(
        args.game_id,
        args.interval,
        args.server_url.rstrip("/"),
        args.hand_check_interval,
        args.advisor_check_interval,
    )
    print(log_path)


if __name__ == "__main__":
    main()
