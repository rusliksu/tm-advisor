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
ADVISOR_MISS_MIN_RANK = int(os.environ.get("TM_ADVISOR_MISS_MIN_RANK", "4"))
ADVISOR_MISS_MIN_SCORE_GAP = int(os.environ.get("TM_ADVISOR_MISS_MIN_SCORE_GAP", "6"))
ADVISOR_MISS_STRONG_SCORE_GAP = int(os.environ.get("TM_ADVISOR_MISS_STRONG_SCORE_GAP", "15"))
ADVISOR_MISS_TOP_CHOICES = int(os.environ.get("TM_ADVISOR_MISS_TOP_CHOICES", "3"))


def fetch_json(url: str) -> dict:
    with urllib.request.urlopen(url) as response:
        return json.load(response)


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
        entries.append({
            "name": card.get("name"),
            "rank": idx,
            "score": score_fn(card),
        })
    return entries


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
    trade_hint = (snap.get("trade") or {}).get("hint")
    if trade_hint:
        context["trade_hint"] = trade_hint
    if top_options is None:
        if snap.get("current_draft"):
            top_options = option_entries_from_cards(snap.get("current_draft", []), draft_score)
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


def build_advisor_miss(prev_snap: dict, curr_snap: dict, player_id: str, card_name: str) -> dict | None:
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

    score_gap = best_score - chosen_score
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

    top_choices = []
    for idx, card in enumerate(prev_hand[:ADVISOR_MISS_TOP_CHOICES], start=1):
        top_choices.append({
            "name": card.get("name"),
            "rank": idx,
            "score": card_score(card),
        })

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
        "severity": severity,
        "reason": "+".join(reasons) if reasons else "score_gap",
        "top_choices": top_choices,
        "snapshot_error": prev_snap.get("snapshot_error"),
    }


def append_jsonl(path: str, payload: dict) -> None:
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False) + "\n")


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
                {"name": c["name"], "score": c["adjusted_score"]}
                for c in state.get("current_draft", [])[:5]
            ],
            "alerts": state.get("alerts", [])[:6],
            "decision_context": build_decision_context(state),
            "snapshot_error": state.get("snapshot_error"),
        })

    return {
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
    }


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
    for pid in player_ids:
        prev = prev_players[pid]
        curr = curr_players[pid]
        prev_live = prev["live"]
        curr_live = curr["live"]
        prev_ranks = hand_rank_map(prev)
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
            append_jsonl(log_path, {
                "type": "card_played",
                "ts": datetime.now().isoformat(timespec="seconds"),
                "player_id": pid,
                "player": curr["me"]["name"],
                "card": card_name,
                "prev_hand_rank": rank[0] if rank else None,
                "prev_hand_score": rank[1] if rank else None,
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

        if curr_live["current_pack"] != prev_live["current_pack"] and curr_live["current_pack"]:
            changed = True
            draft_scores = {
                card["name"]: card["adjusted_score"]
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


def monitor_game(game_id: str, interval: float, base_url: str) -> str:
    session = start_game_session(game_id, base_url)
    while True:
        time.sleep(interval)
        result = poll_game_session(session)
        if not result["active"]:
            break
    return session["log_path"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("game_id")
    parser.add_argument("--interval", type=float, default=10.0)
    parser.add_argument("--server-url", default=os.environ.get("TM_BASE_URL", DEFAULT_BASE_URL))
    args = parser.parse_args()

    log_path = monitor_game(args.game_id, args.interval, args.server_url.rstrip("/"))
    print(log_path)


if __name__ == "__main__":
    main()
