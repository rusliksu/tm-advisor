#!/usr/bin/env python3
"""Backfill advisor-vs-human decision traces from Terraforming Mars game.db.

The live watcher can only learn from games watched in real time. This script
uses saved game snapshots from SQLite and reconstructs the same JSONL shape:
decision_observed -> card_played/actions_taken/project_pick/research_buy ->
real_action_observed.
"""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Callable


ROOT = Path(__file__).resolve().parents[2]
LOG_DIR = ROOT / "data" / "game_logs"
DEFAULT_REMOTE_DB = "/home/openclaw/tm-runtime/prod/shared/db/game.db"
LEGACY_REMOTE_DB = "/home/openclaw/terraforming-mars/db/game.db"
CARD_DATA_PATH = ROOT / "data" / "all_cards.json"
WATCH_PATH = ROOT / "scripts" / "watch_live_game.py"
ADVISOR_ENTRYPOINT = ROOT / "apps" / "tm-advisor-py" / "entrypoints" / "advisor_snapshot.py"


def load_module(path: Path, module_name: str):
    if str(path.parent) not in sys.path:
        sys.path.insert(0, str(path.parent))
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


WATCH = load_module(WATCH_PATH, "watch_live_game_backfill")
ADVISOR = load_module(ADVISOR_ENTRYPOINT, "advisor_snapshot_backfill")


def load_card_index() -> dict[str, dict]:
    if not CARD_DATA_PATH.exists():
        return {}
    with CARD_DATA_PATH.open("r", encoding="utf-8") as fh:
        cards = json.load(fh)
    out: dict[str, dict] = {}
    for card in cards:
        if not isinstance(card, dict) or not card.get("name"):
            continue
        out[str(card["name"])] = card
    return out


CARD_INDEX = load_card_index()


def card_name(card) -> str | None:
    if isinstance(card, dict):
        name = card.get("name")
    else:
        name = card
    if not name:
        return None
    name = str(name)
    return name[:-5] if name.endswith(":ares") else name


def card_names(cards) -> list[str]:
    return [name for name in (card_name(card) for card in (cards or [])) if name]


def enrich_card_model(card) -> dict:
    if isinstance(card, dict):
        out = copy.deepcopy(card)
        name = card_name(out)
        if name:
            out["name"] = name
    else:
        name = card_name(card)
        out = {"name": name} if name else {}
    if not out.get("name"):
        return out

    info = CARD_INDEX.get(out["name"]) or {}
    if "cost" not in out and info.get("cost") is not None:
        out["cost"] = info.get("cost")
    if "tags" not in out and info.get("tags") is not None:
        out["tags"] = list(info.get("tags") or [])
    if "resources" not in out and out.get("resourceCount") is not None:
        out["resources"] = out.get("resourceCount")
    return out


def card_models(cards) -> list[dict]:
    return [model for model in (enrich_card_model(card) for card in (cards or [])) if model.get("name")]


def single_card_model(value) -> list[dict]:
    if not value:
        return []
    if isinstance(value, list):
        return card_models(value)
    return card_models([value])


def count_oceans(game: dict) -> int:
    spaces = (game.get("board") or {}).get("spaces") or game.get("spaces") or []
    count = 0
    for space in spaces:
        if not isinstance(space, dict):
            continue
        if space.get("spaceType") != "ocean":
            continue
        if space.get("tile") is not None:
            count += 1
    return count


def named_models(values) -> list[dict]:
    out = []
    for value in values or []:
        if isinstance(value, dict):
            if value.get("name"):
                out.append(copy.deepcopy(value))
        elif value:
            out.append({"name": str(value)})
    return out


def normalize_turmoil(game: dict) -> dict | None:
    turmoil = copy.deepcopy(game.get("turmoil"))
    if not isinstance(turmoil, dict):
        return turmoil

    id_to_color = {
        str(player.get("id")): player.get("color")
        for player in (game.get("players") or [])
        if player.get("id") and player.get("color")
    }
    turmoil["ruling"] = turmoil.get("ruling") or turmoil.get("rulingParty")
    turmoil["dominant"] = turmoil.get("dominant") or turmoil.get("dominantParty")
    turmoil["distant"] = turmoil.get("distant") or turmoil.get("distantGlobalEvent")
    turmoil["coming"] = turmoil.get("coming") or turmoil.get("comingGlobalEvent")

    parties = []
    for party in turmoil.get("parties") or []:
        if not isinstance(party, dict):
            continue
        counts: dict[str, int] = {}
        for delegate in party.get("delegates") or []:
            if isinstance(delegate, dict):
                color = delegate.get("color") or delegate.get("player")
                number = int(delegate.get("number") or 0)
            else:
                color = id_to_color.get(str(delegate), str(delegate))
                number = 1
            if color:
                counts[color] = counts.get(color, 0) + number
        normalized = dict(party)
        normalized["delegates"] = [
            {"color": color, "number": number}
            for color, number in counts.items()
        ]
        leader = normalized.get("partyLeader")
        if leader in id_to_color:
            normalized["partyLeader"] = id_to_color[leader]
        parties.append(normalized)
    turmoil["parties"] = parties

    agenda_data = turmoil.get("politicalAgendasData") or {}
    agendas = agenda_data.get("agendas")
    if isinstance(agendas, list) and not turmoil.get("politicalAgendas"):
        converted = {}
        for item in agendas:
            if isinstance(item, list) and len(item) == 2 and isinstance(item[1], dict):
                converted[str(item[0])] = item[1]
        turmoil["politicalAgendas"] = converted
    return turmoil


def public_game_model(game: dict) -> dict:
    model = copy.deepcopy(game)
    for key in ("gameLog", "projectDeck", "corporationDeck", "preludeDeck", "ceoDeck"):
        model.pop(key, None)
    model.setdefault("id", game.get("id"))
    model["milestones"] = named_models(model.get("milestones") or [])
    model["awards"] = named_models(model.get("awards") or [])
    if "turmoil" in model:
        model["turmoil"] = normalize_turmoil(game)
    if model.get("oceans") is None:
        model["oceans"] = count_oceans(game)
    if "spaces" not in model and isinstance(model.get("board"), dict):
        model["spaces"] = copy.deepcopy(model["board"].get("spaces") or [])
    return model


def normalize_player(player: dict, *, active: bool = False) -> dict:
    out = copy.deepcopy(player)
    if "tableau" not in out:
        out["tableau"] = card_models(out.get("playedCards") or [])
    else:
        out["tableau"] = card_models(out.get("tableau") or [])
    out["cardsInHandNbr"] = len(out.get("cardsInHand") or [])
    out["isActive"] = active
    return out


def infer_waiting_for(game: dict, player: dict) -> dict | None:
    phase = str(game.get("phase") or "").lower()
    if phase in {"initial_drafting", "initialdrafting", "drafting"}:
        cards = card_models(player.get("draftHand") or [])
        if cards:
            return {
                "type": "card",
                "buttonLabel": "Keep",
                "title": "Select a card to keep and pass",
                "cards": cards,
            }
    if phase == "research":
        cards = card_models(player.get("draftedCards") or [])
        if cards:
            return {
                "type": "card",
                "buttonLabel": "Buy",
                "title": "Select cards to buy",
                "cards": cards,
            }
    return None


def build_raw_player_view(game: dict, player: dict, *, active: bool = True) -> dict:
    normalized_player = normalize_player(player, active=active)
    players = [
        normalize_player(row, active=(row.get("id") == player.get("id")))
        for row in (game.get("players") or [])
    ]
    waiting_for = infer_waiting_for(game, player)
    raw = {
        "cardsInHand": card_models(player.get("cardsInHand") or []),
        "ceoCardsInHand": card_models(player.get("ceoCardsInHand") or []),
        "dealtCorporationCards": card_models(player.get("dealtCorporationCards") or []),
        "dealtPreludeCards": card_models(player.get("dealtPreludeCards") or []),
        "dealtCeoCards": card_models(player.get("dealtCeoCards") or player.get("dealtCEOCards") or []),
        "dealtProjectCards": card_models(player.get("dealtProjectCards") or []),
        "draftedCards": card_models(player.get("draftedCards") or []),
        "game": public_game_model(game),
        "id": player.get("id"),
        "pickedCorporationCard": single_card_model(player.get("pickedCorporationCard")),
        "preludeCardsInHand": card_models(player.get("preludeCardsInHand") or []),
        "thisPlayer": normalized_player,
        "players": players,
        "autopass": player.get("autopass", False),
    }
    if waiting_for:
        raw["waitingFor"] = waiting_for
    return raw


def live_block_from_raw(game: dict, player: dict, waiting_for: dict | None) -> dict:
    phase = str(game.get("phase") or "").lower()
    waiting_type = (waiting_for or {}).get("type")
    waiting_label = (waiting_for or {}).get("buttonLabel")
    if not waiting_type and phase == "action":
        waiting_type = "db_action"
        waiting_label = "DB inferred action"
    return {
        "is_active": True,
        "color": player.get("color"),
        "last_card_played": player.get("lastCardPlayed"),
        "hand_count": len(player.get("cardsInHand") or []),
        "cards_in_hand": card_names(player.get("cardsInHand") or []),
        "tr": player.get("terraformRating"),
        "mc": WATCH.first_present(player, "megacredits", "megaCredits"),
        "mc_prod": WATCH.first_present(player, "megacreditProduction", "megaCreditProduction"),
        "heat": player.get("heat"),
        "plants": player.get("plants"),
        "energy": player.get("energy"),
        "actions_this_generation": list(player.get("actionsThisGeneration") or []),
        "tableau": card_names(player.get("playedCards") or player.get("tableau") or []),
        "current_pack": card_names((waiting_for or {}).get("cards") or []),
        "drafted_cards": card_names(player.get("draftedCards") or []),
        "dealt_corps": card_names(player.get("dealtCorporationCards") or []),
        "dealt_preludes": card_names(player.get("dealtPreludeCards") or []),
        "dealt_ceos": card_names(player.get("dealtCeoCards") or player.get("dealtCEOCards") or []),
        "dealt_project_cards": card_names(player.get("dealtProjectCards") or []),
        "picked_corp_cards": card_names(single_card_model(player.get("pickedCorporationCard"))),
        "prelude_cards_in_hand": card_names(player.get("preludeCardsInHand") or []),
        "ceo_cards_in_hand": card_names(player.get("ceoCardsInHand") or []),
        "waiting_type": waiting_type,
        "waiting_label": waiting_label,
    }


def fallback_snapshot(game: dict, player: dict, error: str | None = None) -> dict:
    phase = str(game.get("phase") or "").lower()
    return {
        "game": {
            "generation": game.get("generation"),
            "phase": phase,
            "live_phase": game.get("phase"),
            "temperature": game.get("temperature"),
            "oxygen": game.get("oxygenLevel"),
            "oceans": count_oceans(game),
            "venus": game.get("venusScaleLevel"),
        },
        "me": {
            "name": player.get("name") or player.get("id"),
            "corp": "unknown",
            "tr": player.get("terraformRating"),
            "mc": WATCH.first_present(player, "megacredits", "megaCredits"),
            "production": {"mc": WATCH.first_present(player, "megacreditProduction", "megaCreditProduction")},
        },
        "hand": [],
        "hand_advice": [],
        "current_draft": [],
        "alerts": [],
        "summary": {},
        "snapshot_error": error,
    }


def build_state_snapshot(
    game: dict,
    player: dict,
    snapshot_fn: Callable[[dict], dict] | None = None,
) -> dict:
    snapshot_fn = snapshot_fn or ADVISOR.snapshot_from_raw
    waiting_for = infer_waiting_for(game, player)
    try:
        snap = snapshot_fn(build_raw_player_view(game, player, active=True))
    except Exception as exc:
        snap = fallback_snapshot(game, player, str(exc))

    snap.setdefault("me", {}).setdefault("name", player.get("name") or player.get("id"))
    snap.setdefault("me", {}).setdefault("corp", "unknown")
    snap["player_id"] = player.get("id")
    snap["live"] = live_block_from_raw(game, player, waiting_for)
    return snap


def minimal_curr_snapshot(game: dict, player: dict) -> dict:
    return {
        "game": {
            "generation": game.get("generation"),
            "phase": game.get("phase"),
            "live_phase": game.get("phase"),
            "temperature": game.get("temperature"),
            "oxygen": game.get("oxygenLevel"),
            "oceans": count_oceans(game),
            "venus": game.get("venusScaleLevel"),
        },
        "me": {"name": player.get("name") or player.get("id")},
        "live": {"color": player.get("color")},
    }


def players_by_id(game: dict) -> dict[str, dict]:
    return {
        str(player.get("id") or player.get("color") or player.get("name")): player
        for player in (game.get("players") or [])
    }


def new_items(curr_items: list[str], prev_items: list[str]) -> list[str]:
    prev_counts: dict[str, int] = {}
    for item in prev_items:
        prev_counts[item] = prev_counts.get(item, 0) + 1
    out = []
    for item in curr_items:
        count = prev_counts.get(item, 0)
        if count > 0:
            prev_counts[item] = count - 1
        else:
            out.append(item)
    return out


def append_card_played(log_path: str, game_id: str, player_id: str, prev_snap: dict, curr_snap: dict, card: str, same_count: int, decision_id: str | None) -> int:
    prev_ranks = WATCH.hand_rank_map(prev_snap)
    prev_play_entries = WATCH.ranked_advisor_play_entries(prev_snap)
    prev_play_ranks = {entry["name"]: entry for entry in prev_play_entries}
    prev_recommended_play = prev_play_entries[0]["name"] if prev_play_entries else None
    rank = prev_ranks.get(card)
    play_rank = prev_play_ranks.get(card)
    WATCH.append_jsonl(log_path, {
        "type": "card_played",
        "ts": datetime.now().isoformat(timespec="seconds"),
        "game_id": game_id,
        "decision_id": decision_id,
        "player_id": player_id,
        "player": curr_snap["me"]["name"],
        "card": card,
        "prev_hand_rank": rank[0] if rank else None,
        "prev_hand_score": rank[1] if rank else None,
        "prev_play_rank": play_rank.get("rank") if play_rank else None,
        "prev_play_score": play_rank.get("score") if play_rank else None,
        "prev_play_reason": play_rank.get("reason") if play_rank else None,
        "prev_recommended_play": prev_recommended_play,
        "same_poll_card_count": same_count,
        "decision_context": WATCH.build_decision_context(prev_snap),
        "snapshot_error": prev_snap.get("snapshot_error"),
    })
    WATCH.append_real_action_observed(
        log_path,
        game_id,
        player_id,
        curr_snap,
        "card_played",
        {
            "card": card,
            "prev_hand_rank": rank[0] if rank else None,
            "prev_hand_score": rank[1] if rank else None,
            "prev_play_rank": play_rank.get("rank") if play_rank else None,
            "prev_play_score": play_rank.get("score") if play_rank else None,
            "prev_recommended_play": prev_recommended_play,
            "same_poll_card_count": same_count,
        },
        decision_id=decision_id,
        prev_snap=prev_snap,
    )
    miss = WATCH.build_advisor_miss(prev_snap, curr_snap, player_id, card, same_count)
    if miss is not None:
        miss["game_id"] = game_id
        miss["decision_id"] = decision_id
        WATCH.append_jsonl(log_path, miss)
        return 3
    return 2


def append_actions_taken(log_path: str, game_id: str, player_id: str, prev_snap: dict, curr_snap: dict, actions: list[str], decision_id: str | None) -> int:
    WATCH.append_jsonl(log_path, {
        "type": "actions_taken",
        "ts": datetime.now().isoformat(timespec="seconds"),
        "game_id": game_id,
        "decision_id": decision_id,
        "player_id": player_id,
        "player": curr_snap["me"]["name"],
        "actions": actions,
        "decision_context": WATCH.build_decision_context(prev_snap),
        "snapshot_error": prev_snap.get("snapshot_error"),
    })
    WATCH.append_real_action_observed(
        log_path,
        game_id,
        player_id,
        curr_snap,
        "actions_taken",
        {"actions": actions},
        decision_id=decision_id,
        prev_snap=prev_snap,
    )
    return 2


def append_research_buy(log_path: str, game_id: str, player_id: str, prev_snap: dict, curr_snap: dict, offered: list[str], bought: list[str], decision_id: str | None) -> int:
    rank_map = WATCH.draft_rank_map(prev_snap)
    skipped = [name for name in offered if name not in set(bought)]
    WATCH.append_jsonl(log_path, {
        "type": "research_buy",
        "ts": datetime.now().isoformat(timespec="seconds"),
        "game_id": game_id,
        "decision_id": decision_id,
        "player_id": player_id,
        "player": curr_snap["me"]["name"],
        "offered": offered,
        "bought": bought,
        "bought_unknown_count": 0,
        "skipped": skipped,
        "detection": "db_diff",
        "advisor_order": WATCH.option_entries_from_names(offered, rank_map, limit=None),
        "decision_context": WATCH.build_decision_context(prev_snap),
        "snapshot_error": prev_snap.get("snapshot_error"),
    })
    WATCH.append_real_action_observed(
        log_path,
        game_id,
        player_id,
        curr_snap,
        "research_buy",
        {"offered": offered, "bought": bought, "skipped": skipped, "detection": "db_diff"},
        decision_id=decision_id,
        prev_snap=prev_snap,
    )
    return 2


def process_player_transition(
    session: dict,
    prev_game: dict,
    curr_game: dict,
    prev_player: dict,
    curr_player: dict,
    snapshot_fn: Callable[[dict], dict] | None = None,
    phases: set[str] | None = None,
) -> int:
    game_id = session["game_id"]
    log_path = session["log_path"]
    player_id = str(prev_player.get("id") or prev_player.get("color") or prev_player.get("name"))
    phase = str(prev_game.get("phase") or "").lower()
    if phases is not None and phase not in phases:
        return 0
    events_written = 0

    new_cards: list[str] = []
    new_actions: list[str] = []
    picked_projects: list[str] = []
    bought_research: list[str] = []
    research_offer: list[str] = []

    if phase == "action":
        new_cards = new_items(card_names(curr_player.get("playedCards") or []), card_names(prev_player.get("playedCards") or []))
        new_actions = new_items(list(curr_player.get("actionsThisGeneration") or []), list(prev_player.get("actionsThisGeneration") or []))
    elif phase in {"initial_drafting", "initialdrafting", "drafting"}:
        picked_projects = new_items(card_names(curr_player.get("draftedCards") or []), card_names(prev_player.get("draftedCards") or []))
    elif phase == "research":
        research_offer = card_names(prev_player.get("draftedCards") or [])
        if research_offer:
            new_hand = new_items(card_names(curr_player.get("cardsInHand") or []), card_names(prev_player.get("cardsInHand") or []))
            bought_research = [name for name in new_hand if name in set(research_offer)]

    if not (new_cards or new_actions or picked_projects or bought_research or (phase == "research" and research_offer and curr_game.get("phase") != "research")):
        return 0

    prev_snap = build_state_snapshot(prev_game, prev_player, snapshot_fn=snapshot_fn)
    curr_snap = minimal_curr_snapshot(curr_game, curr_player)
    decision_id = WATCH.maybe_append_decision_observed(session, player_id, prev_snap, f"db_save_{prev_game.get('lastSaveId') or ''}")
    if decision_id:
        events_written += 1

    for card in new_cards:
        events_written += append_card_played(log_path, game_id, player_id, prev_snap, curr_snap, card, len(new_cards), decision_id)

    if new_actions:
        events_written += append_actions_taken(log_path, game_id, player_id, prev_snap, curr_snap, new_actions, decision_id)

    prev_live = prev_snap.get("live") or {}
    for picked in picked_projects:
        WATCH.append_pick_event(
            log_path,
            game_id,
            "project_pick",
            prev_snap,
            curr_snap,
            player_id,
            picked,
            prev_live.get("current_pack") or card_names(prev_player.get("draftHand") or []),
            WATCH.draft_rank_map(prev_snap),
            decision_id=decision_id,
        )
        events_written += 2

    if phase == "research" and research_offer and curr_game.get("phase") != "research":
        events_written += append_research_buy(log_path, game_id, player_id, prev_snap, curr_snap, research_offer, bought_research, decision_id)

    return events_written


def sanitize_remote_game(game: dict) -> dict:
    game = copy.deepcopy(game)
    for key in ("gameLog", "projectDeck", "corporationDeck", "preludeDeck", "ceoDeck"):
        game.pop(key, None)
    return game


def query_game_rows_local(db_path: str, game_id: str) -> list[dict]:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT save_id, game FROM games WHERE game_id=? ORDER BY save_id",
        (game_id,),
    ).fetchall()
    conn.close()
    return [{"save_id": save_id, "game": sanitize_remote_game(json.loads(game_json))} for save_id, game_json in rows]


def query_game_ids_local(db_path: str, *, latest: int = 0, all_completed: bool = False) -> list[str]:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    if all_completed:
        rows = cur.execute("SELECT game_id FROM completed_game ORDER BY completed_time DESC").fetchall()
    else:
        rows = cur.execute(
            "SELECT game_id FROM completed_game ORDER BY completed_time DESC LIMIT ?",
            (max(1, latest),),
        ).fetchall()
    conn.close()
    return [row[0] for row in rows]


def ssh_python(vps: str, script: str, args: list[str]) -> str:
    child = subprocess.run(
        ["ssh", vps, "python3", "-", *args],
        input=script,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if child.returncode != 0:
        raise RuntimeError((child.stderr or child.stdout or "ssh python failed").strip())
    return child.stdout


def query_game_ids_ssh(vps: str, db_path: str, *, latest: int = 0, all_completed: bool = False) -> list[str]:
    script = """
import sqlite3, json, os, sys
db_path, latest, all_completed = sys.argv[1], int(sys.argv[2]), sys.argv[3] == '1'
if not os.path.exists(db_path):
    alt = sys.argv[4]
    db_path = alt if os.path.exists(alt) else db_path
conn = sqlite3.connect(db_path)
cur = conn.cursor()
if all_completed:
    rows = cur.execute("SELECT game_id FROM completed_game ORDER BY completed_time DESC").fetchall()
else:
    rows = cur.execute("SELECT game_id FROM completed_game ORDER BY completed_time DESC LIMIT ?", (max(1, latest),)).fetchall()
conn.close()
print(json.dumps([row[0] for row in rows]))
"""
    out = ssh_python(vps, script, [db_path, str(latest), "1" if all_completed else "0", LEGACY_REMOTE_DB])
    return json.loads(out)


def query_game_rows_ssh(vps: str, db_path: str, game_id: str) -> list[dict]:
    script = """
import sqlite3, json, os, sys
db_path, gid = sys.argv[1], sys.argv[2]
if not os.path.exists(db_path):
    alt = sys.argv[3]
    db_path = alt if os.path.exists(alt) else db_path
conn = sqlite3.connect(db_path)
cur = conn.cursor()
rows = cur.execute("SELECT save_id, game FROM games WHERE game_id=? ORDER BY save_id", (gid,)).fetchall()
out = []
for save_id, game_json in rows:
    game = json.loads(game_json)
    for key in ("gameLog", "projectDeck", "corporationDeck", "preludeDeck", "ceoDeck"):
        game.pop(key, None)
    out.append({"save_id": save_id, "game": game})
conn.close()
print(json.dumps(out, ensure_ascii=False))
"""
    out = ssh_python(vps, script, [db_path, game_id, LEGACY_REMOTE_DB])
    return json.loads(out)


def write_game_backfill(
    rows: list[dict],
    out_path: Path,
    *,
    max_events: int = 0,
    phases: set[str] | None = None,
    snapshot_fn: Callable[[dict], dict] | None = None,
) -> dict:
    if not rows:
        raise ValueError("No DB rows to backfill")
    game_id = rows[0]["game"].get("id") or rows[0]["game"].get("gameId") or "unknown"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    session = {
        "game_id": game_id,
        "started_at": datetime.now().strftime("%Y%m%d_%H%M%S"),
        "log_path": str(out_path),
        "pending_decisions": {},
        "last_decision_signature_by_pid": {},
        "decision_counter": 0,
    }
    WATCH.append_jsonl(str(out_path), {
        "type": "session_start",
        "ts": datetime.now().isoformat(timespec="seconds"),
        "source": "db_backfill",
        "game_id": game_id,
        "rows": len(rows),
        "save_id_from": rows[0].get("save_id"),
        "save_id_to": rows[-1].get("save_id"),
    })

    transitions = 0
    events = 1
    for prev_row, curr_row in zip(rows, rows[1:]):
        prev_game = prev_row["game"]
        curr_game = curr_row["game"]
        prev_players = players_by_id(prev_game)
        curr_players = players_by_id(curr_game)
        for pid, prev_player in prev_players.items():
            curr_player = curr_players.get(pid)
            if not curr_player:
                continue
            written = process_player_transition(
                session,
                prev_game,
                curr_game,
                prev_player,
                curr_player,
                snapshot_fn=snapshot_fn,
                phases=phases,
            )
            if written:
                transitions += 1
                events += written
                if max_events and events >= max_events:
                    return {"game_id": game_id, "out_path": str(out_path), "rows": len(rows), "transitions": transitions, "events": events, "truncated": True}
    return {"game_id": game_id, "out_path": str(out_path), "rows": len(rows), "transitions": transitions, "events": events, "truncated": False}


def resolve_game_ids(args) -> list[str]:
    if args.game_ids:
        return [gid if gid.startswith("g") else f"g{gid}" for gid in args.game_ids]
    latest = args.latest or (0 if args.all_completed else 1)
    if args.ssh:
        ids = query_game_ids_ssh(args.vps, args.db, latest=latest, all_completed=args.all_completed)
    else:
        ids = query_game_ids_local(args.db, latest=latest, all_completed=args.all_completed)
    if args.limit_games:
        ids = ids[: args.limit_games]
    return ids


def parse_phases(raw: str) -> set[str] | None:
    if not raw or raw.lower() in {"all", "*"}:
        return None
    aliases = {
        "initialdrafting": "initial_drafting",
        "initial": "initial_drafting",
        "draft": "drafting",
    }
    phases = set()
    for part in raw.split(","):
        phase = part.strip().lower()
        if not phase:
            continue
        phases.add(aliases.get(phase, phase))
    if "initial_drafting" in phases:
        phases.add("initialdrafting")
    return phases


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill advisor-vs-human decision traces from TM game.db snapshots")
    parser.add_argument("game_ids", nargs="*", help="Game ids. If omitted, uses --latest 1 completed game.")
    parser.add_argument("--ssh", action="store_true", help="Read DB via SSH instead of local SQLite")
    parser.add_argument("--vps", default="vps", help="SSH alias for VPS")
    parser.add_argument("--db", default=DEFAULT_REMOTE_DB, help="SQLite game.db path")
    parser.add_argument("--latest", type=int, default=0, help="Backfill latest N completed games")
    parser.add_argument("--all-completed", action="store_true", help="Backfill all completed games")
    parser.add_argument("--limit-games", type=int, default=0, help="Limit number of resolved games")
    parser.add_argument("--max-events", type=int, default=0, help="Stop each game after approximately this many JSONL events")
    parser.add_argument("--phases", default="all", help="Comma-separated prev-save phases to include, e.g. action or drafting,research")
    parser.add_argument("--out-dir", default=str(LOG_DIR), help="Output directory")
    args = parser.parse_args()

    game_ids = resolve_game_ids(args)
    if not game_ids:
        print("No games resolved", file=sys.stderr)
        return 1

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    phases = parse_phases(args.phases)
    summaries = []
    for game_id in game_ids:
        rows = query_game_rows_ssh(args.vps, args.db, game_id) if args.ssh else query_game_rows_local(args.db, game_id)
        if not rows:
            print(f"{game_id}: no rows", file=sys.stderr)
            continue
        out_path = Path(args.out_dir) / f"db_backfill_{game_id}_{stamp}.jsonl"
        summary = write_game_backfill(rows, out_path, max_events=args.max_events, phases=phases)
        summaries.append(summary)
        suffix = " truncated" if summary["truncated"] else ""
        print(f"{game_id}: rows={summary['rows']} transitions={summary['transitions']} events={summary['events']} -> {summary['out_path']}{suffix}")

    return 0 if summaries else 1


if __name__ == "__main__":
    raise SystemExit(main())
