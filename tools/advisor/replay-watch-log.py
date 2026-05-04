#!/usr/bin/env python3
"""Replay watch_live JSONL decisions with the current advisor engine.

This is for logs that contain decision_observed.replay_snapshot.raw_player_view.
It refreshes advisor fields from that raw player view, updates linked real human
actions, and drops old advisor_miss events tied to replayed decisions.
"""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Callable


ROOT = Path(__file__).resolve().parents[2]
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


WATCH = load_module(WATCH_PATH, "watch_live_game_replay")
ADVISOR = load_module(ADVISOR_ENTRYPOINT, "advisor_snapshot_replay")


def parse_jsonl(path: Path) -> list[dict]:
    events: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        events.append(json.loads(line))
    return events


def write_jsonl(path: Path, events: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for event in events:
            fh.write(json.dumps(event, ensure_ascii=False) + "\n")


def raw_view_from_event(event: dict) -> dict | None:
    replay = event.get("replay_snapshot")
    if not isinstance(replay, dict):
        return None
    raw = replay.get("raw_player_view")
    return raw if isinstance(raw, dict) else None


def fresh_decision_event(event: dict, snap: dict) -> tuple[dict, list[dict]]:
    updated = copy.deepcopy(event)
    summary = snap.get("summary") or {}
    top_options = WATCH.decision_top_options(snap)
    game = snap.get("game", {}) or {}
    me = snap.get("me", {}) or {}
    live = snap.get("live", {}) or {}

    updated.update({
        "player": me.get("name") or updated.get("player"),
        "color": live.get("color") or updated.get("color"),
        "corp": me.get("corp") or updated.get("corp"),
        "generation": game.get("generation"),
        "phase": game.get("phase"),
        "live_phase": game.get("live_phase"),
        "active_player": game.get("activePlayer"),
        "waiting_type": live.get("waiting_type"),
        "waiting_label": live.get("waiting_label"),
        "hand_count": live.get("hand_count"),
        "best_move": summary.get("best_move"),
        "summary_lines": list((summary.get("lines") or [])[:4]),
        "top_options": top_options,
        "decision_context": WATCH.build_decision_context(snap, top_options),
        "snapshot_error": snap.get("snapshot_error"),
        "replayed_at": datetime.now().isoformat(timespec="seconds"),
        "replay_engine": "advisor_snapshot.snapshot_from_raw",
    })
    return updated, top_options


def ranked_play_lookup(snap: dict) -> tuple[dict[str, dict], str | None]:
    entries = WATCH.ranked_advisor_play_entries(snap)
    best = entries[0]["name"] if entries else None
    return {entry["name"]: entry for entry in entries}, best


def refresh_card_play_event(event: dict, snap: dict) -> dict:
    updated = copy.deepcopy(event)
    card = updated.get("card") or (updated.get("action") or {}).get("card")
    play_entries, best = ranked_play_lookup(snap)
    play = play_entries.get(card)
    hand_rank = WATCH.hand_rank_map(snap).get(card)

    updated["decision_context"] = WATCH.build_decision_context(snap)
    updated["snapshot_error"] = snap.get("snapshot_error")
    updated["prev_recommended_play"] = best
    updated["prev_hand_rank"] = hand_rank[0] if hand_rank else None
    updated["prev_hand_score"] = hand_rank[1] if hand_rank else None
    updated["prev_play_rank"] = play.get("rank") if play else None
    updated["prev_play_score"] = play.get("score") if play else None
    updated["prev_play_reason"] = play.get("reason") if play else None
    updated["replayed_from_decision_id"] = updated.get("decision_id")
    if isinstance(updated.get("action"), dict):
        updated["action"]["prev_recommended_play"] = best
        updated["action"]["prev_hand_rank"] = updated["prev_hand_rank"]
        updated["action"]["prev_hand_score"] = updated["prev_hand_score"]
        updated["action"]["prev_play_rank"] = updated["prev_play_rank"]
        updated["action"]["prev_play_score"] = updated["prev_play_score"]
    return updated


def refresh_linked_event(event: dict, snap: dict) -> dict:
    if event.get("type") in {"card_played", "real_action_observed"}:
        action = event.get("action") or {}
        if event.get("type") == "card_played" or action.get("card"):
            return refresh_card_play_event(event, snap)

    updated = copy.deepcopy(event)
    updated["decision_context"] = WATCH.build_decision_context(snap)
    updated["snapshot_error"] = snap.get("snapshot_error")
    updated["replayed_from_decision_id"] = updated.get("decision_id")
    return updated


def replay_events(
    events: list[dict],
    *,
    snapshot_fn: Callable[[dict], dict] | None = None,
    drop_old_misses: bool = True,
) -> tuple[list[dict], dict]:
    snapshot_fn = snapshot_fn or ADVISOR.snapshot_from_raw
    replayed_by_decision: dict[str, dict] = {}
    out: list[dict] = []
    summary = {
        "events": len(events),
        "decisions_replayed": 0,
        "linked_events_refreshed": 0,
        "old_misses_dropped": 0,
        "replay_errors": 0,
    }

    for event in events:
        if event.get("type") != "decision_observed" or not event.get("decision_id"):
            out.append(copy.deepcopy(event))
            continue
        raw = raw_view_from_event(event)
        if raw is None:
            out.append(copy.deepcopy(event))
            continue
        try:
            snap = snapshot_fn(raw)
            updated, _top_options = fresh_decision_event(event, snap)
            replayed_by_decision[event["decision_id"]] = snap
            summary["decisions_replayed"] += 1
        except Exception as exc:  # keep the old event but make the replay failure visible
            updated = copy.deepcopy(event)
            updated["replay_error"] = str(exc)
            summary["replay_errors"] += 1
        out.append(updated)

    refreshed: list[dict] = []
    for event in out:
        decision_id = event.get("decision_id")
        snap = replayed_by_decision.get(decision_id)
        if snap is None or event.get("type") == "decision_observed":
            refreshed.append(event)
            continue
        if drop_old_misses and event.get("type") == "advisor_miss":
            summary["old_misses_dropped"] += 1
            continue
        if event.get("type") in {
            "card_played",
            "actions_taken",
            "real_action_observed",
            "project_pick",
            "research_buy",
            "corp_pick",
            "prelude_pick",
            "ceo_pick",
        }:
            refreshed.append(refresh_linked_event(event, snap))
            summary["linked_events_refreshed"] += 1
        else:
            refreshed.append(event)

    summary["events_out"] = len(refreshed)
    return refreshed, summary


def default_output_path(path: Path) -> Path:
    return path.with_name(f"{path.stem}.replayed{path.suffix}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Replay watch_live JSONL decisions using replay snapshots")
    parser.add_argument("files", nargs="+", help="watch_live JSONL files")
    parser.add_argument("--out", help="Output path; only valid with one input file")
    parser.add_argument("--keep-old-misses", action="store_true", help="Keep old advisor_miss events")
    args = parser.parse_args()

    if args.out and len(args.files) != 1:
        parser.error("--out is only valid with one input file")

    for raw_file in args.files:
        in_path = Path(raw_file)
        out_path = Path(args.out) if args.out else default_output_path(in_path)
        events = parse_jsonl(in_path)
        replayed, summary = replay_events(events, drop_old_misses=not args.keep_old_misses)
        write_jsonl(out_path, replayed)
        print(
            f"{in_path.name}: decisions={summary['decisions_replayed']} "
            f"linked={summary['linked_events_refreshed']} "
            f"dropped_misses={summary['old_misses_dropped']} "
            f"errors={summary['replay_errors']} -> {out_path}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
