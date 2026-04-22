#!/usr/bin/env python3
"""Audit live TM advisor output for recurring advisor regressions.

The script intentionally audits rendered public outputs instead of internal
heuristics: JSON snapshot payloads and Claude markdown. That keeps it useful
for heartbeat checks without exposing full hands or private state.
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import re
import sys
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / "scripts"
DEFAULT_SERVER = "https://terraforming-mars.herokuapp.com"
DEFAULT_LOG_DIR = ROOT / "data" / "advisor_live_audit"
DEFAULT_STALE_AFTER = 6

for path in (ROOT, SCRIPTS_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))


ACTION_ONLY_SNAPSHOT_KEYS = (
    "alerts",
    "play_advice",
    "trade",
    "colony_advice",
    "opponent_intents",
)

ACTION_ONLY_MARKERS = (
    "## Play/Hold анализ",
    "## MC Allocation",
    "## Best Endgame Conversions",
    "## Рекомендации",
    "## Стандартные проекты",
    "## Торговля (анализ)",
    "## Советник",
    "**Рекомендация:**",
    "### Поселение",
)

TERMINAL_PHASES = {"end", "ended", "game_end", "postgame", "final", "results"}

NON_ACTIONABLE_TRADE_HINTS = (
    "флот занят",
    "нет ресурсов",
    "нет доступ",
    "не хватает",
    "невыгод",
    "не выгод",
    "no trade",
    "not profitable",
    "fleet busy",
)


def issue(check: str, player: str, message: str, module: str) -> dict:
    return {
        "check": check,
        "player": player,
        "message": message,
        "module": module,
    }


def extract_identifier(value: str) -> tuple[str, str | None]:
    """Return (game/player id, server inferred from URL if present)."""
    parsed = urlparse(value)
    if parsed.scheme and parsed.netloc:
        query_id = parse_qs(parsed.query).get("id", [""])[0]
        if query_id:
            return query_id, f"{parsed.scheme}://{parsed.netloc}"
        match = re.search(r"[gp][0-9a-z]+", parsed.path)
        if match:
            return match.group(0), f"{parsed.scheme}://{parsed.netloc}"
    return value.strip(), None


def is_action_phase(phase: str | None) -> bool:
    return str(phase or "").lower() in {"action", ""}


def is_terminal_phase(phase: str | None) -> bool:
    return str(phase or "").lower() in TERMINAL_PHASES


def should_suppress_action_advice(phase: str | None) -> bool:
    return not is_action_phase(phase) or is_terminal_phase(phase)


def live_phase_from_snapshot(snapshot: dict) -> str:
    game = snapshot.get("game") or {}
    return str(game.get("live_phase") or game.get("phase") or "")


def is_non_actionable_trade_hint(hint: str) -> bool:
    hint_l = str(hint or "").lower()
    return any(fragment in hint_l for fragment in NON_ACTIONABLE_TRADE_HINTS)


def payload_count(value) -> int:
    if isinstance(value, (list, tuple, set, dict)):
        return len(value)
    return 1 if value else 0


def short_text(value: str, limit: int = 140) -> str:
    text = " ".join(str(value).split())
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "..."


def safe_log_name(identifier: str) -> str:
    safe = re.sub(r"[^0-9A-Za-z_.-]+", "_", identifier).strip("._")
    return safe or "advisor-live-audit"


def alert_conflict_for_card(alert: str, name: str, advice: dict) -> str | None:
    action = advice.get("action")
    if action != "PLAY":
        if (
            alert.startswith(f"⚠️ {name} В РУКЕ")
            or alert.startswith(f"🎯 Play {name} EARLY")
            or alert.startswith(f"⏰ {name}:")
            or f"PLAY {name} NOW" in alert
        ):
            return f"alert pushes {name} to play, play_advice says {action}"
        return None

    try:
        priority = int(advice.get("priority", 99) or 99)
    except (TypeError, ValueError):
        priority = 99
    if priority > 3:
        return None

    if alert.startswith(f"📊 {name}:") or alert.startswith(f"⏳ {name}"):
        return f"alert delays {name}, play_advice says PLAY priority {priority}"
    if alert.startswith(f"⚠️ {name} ") and "продаж" in alert.lower():
        return f"alert suggests selling {name}, play_advice says PLAY priority {priority}"
    return None


def audit_alert_play_conflicts(player_label: str, snapshot: dict) -> list[dict]:
    alerts = snapshot.get("alerts") or []
    advice_by_name = {
        row.get("name"): row
        for row in (snapshot.get("play_advice") or [])
        if isinstance(row, dict) and row.get("name")
    }
    if not alerts or not advice_by_name:
        return []

    found = []
    for alert in alerts:
        alert_s = str(alert)
        for name, advice in advice_by_name.items():
            conflict = alert_conflict_for_card(alert_s, name, advice)
            if not conflict:
                continue
            found.append(issue(
                "alert-play-conflict",
                player_label,
                f"{conflict}: {short_text(alert_s)}",
                "apps/tm-advisor-py/entrypoints/advisor_snapshot.py::_filter_alerts_against_play_advice",
            ))
            break
    return found


def audit_snapshot_payload(player_label: str, snapshot: dict) -> list[dict]:
    found = []
    phase = live_phase_from_snapshot(snapshot)
    if should_suppress_action_advice(phase):
        for key in ACTION_ONLY_SNAPSHOT_KEYS:
            value = snapshot.get(key)
            if value:
                found.append(issue(
                    "phase-gating",
                    player_label,
                    f"{key} present in non-action phase '{phase}' ({payload_count(value)} item(s))",
                    "apps/tm-advisor-py/entrypoints/advisor_snapshot.py",
                ))

    trade = snapshot.get("trade") or {}
    hint = trade.get("hint") or trade.get("best_hint") or ""
    if hint and is_non_actionable_trade_hint(hint):
        found.append(issue(
            "trade-noise",
            player_label,
            f"non-actionable trade hint leaked into snapshot: {short_text(hint)}",
            "apps/tm-advisor-py/entrypoints/advisor_snapshot.py::_snapshot_trade_payload",
        ))

    found.extend(audit_alert_play_conflicts(player_label, snapshot))
    return found


def audit_claude_output(player_label: str, phase: str, output: str) -> list[dict]:
    if not should_suppress_action_advice(phase):
        return []

    found = []
    for marker in ACTION_ONLY_MARKERS:
        if marker in output:
            found.append(issue(
                "claude-phase-gating",
                player_label,
                f"Claude markdown contains action-only marker in phase '{phase}': {marker}",
                "scripts/tm_advisor/claude_output.py",
            ))
    return found


def configure_server(server: str) -> None:
    os.environ["TM_BASE_URL"] = server.rstrip("/")


def load_live_dependencies():
    from scripts.tm_advisor.card_parser import CardEffectParser
    from scripts.tm_advisor.claude_output import ClaudeOutput
    from scripts.tm_advisor.client import TMClient
    from scripts.tm_advisor.combo import ComboDetector
    from scripts.tm_advisor.database import CardDatabase
    from scripts.tm_advisor.models import GameState
    from scripts.tm_advisor.requirements import RequirementsChecker
    from scripts.tm_advisor.shared_data import resolve_data_path
    from scripts.tm_advisor.synergy import SynergyEngine

    advisor_snapshot = importlib.import_module("scripts.advisor_snapshot")
    return {
        "CardDatabase": CardDatabase,
        "CardEffectParser": CardEffectParser,
        "ClaudeOutput": ClaudeOutput,
        "ComboDetector": ComboDetector,
        "GameState": GameState,
        "RequirementsChecker": RequirementsChecker,
        "SynergyEngine": SynergyEngine,
        "TMClient": TMClient,
        "advisor_snapshot": advisor_snapshot,
        "resolve_data_path": resolve_data_path,
    }


def build_claude_formatter(deps: dict):
    db = deps["CardDatabase"](str(deps["resolve_data_path"]("evaluations.json")))
    parser = deps["CardEffectParser"](db)
    combo = deps["ComboDetector"](parser, db)
    synergy = deps["SynergyEngine"](db, combo)
    req_checker = deps["RequirementsChecker"](str(deps["resolve_data_path"]("all_cards.json")))
    return deps["ClaudeOutput"](db, synergy, req_checker)


def player_label(snapshot: dict, player_id: str) -> str:
    me = snapshot.get("me") or {}
    name = me.get("name") or "unknown"
    return f"{name} ({player_id[:12]})"


def discover_player_ids(client, identifier: str) -> list[str]:
    ids = client.discover_all_player_ids(identifier)
    if ids:
        return ids
    if identifier.startswith("p"):
        return [identifier]
    return []


def audit_live(identifier: str, server: str, include_claude: bool = True) -> dict:
    configure_server(server)
    deps = load_live_dependencies()
    client = deps["TMClient"]()
    player_ids = discover_player_ids(client, identifier)
    if not player_ids:
        raise RuntimeError(f"Could not discover player ids for {identifier}")

    formatter = build_claude_formatter(deps) if include_claude else None
    players = []
    all_issues = []

    for player_id in player_ids:
        snapshot = deps["advisor_snapshot"].snapshot(player_id)
        label = player_label(snapshot, player_id)
        phase = live_phase_from_snapshot(snapshot)
        player_entry = {
            "id": player_id,
            "label": label,
            "generation": (snapshot.get("game") or {}).get("generation"),
            "phase": phase,
        }

        player_issues = audit_snapshot_payload(label, snapshot)
        if include_claude:
            raw = client.get_player_state(player_id)
            state = deps["GameState"](raw)
            player_entry["game_age"] = state.game_age
            player_entry["undo_count"] = state.undo_count
            rendered = formatter.format(state)
            player_issues.extend(audit_claude_output(label, state.phase, rendered))

        players.append(player_entry)
        all_issues.extend(player_issues)

    return {
        "target": identifier,
        "server": server,
        "players": players,
        "issues": all_issues,
    }


def default_log_path(identifier: str) -> Path:
    return DEFAULT_LOG_DIR / f"{safe_log_name(identifier)}.jsonl"


def resolve_log_path(value: str, identifier: str) -> Path:
    path = default_log_path(identifier) if value == "" else Path(value)
    if not path.is_absolute():
        path = ROOT / path
    return path


def resolve_summary_path(value: str) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    if path.exists() or value.endswith(".jsonl") or any(sep in value for sep in ("/", "\\")):
        return path

    identifier, _server = extract_identifier(value)
    return default_log_path(identifier)


def jsonl_record(result: dict) -> dict:
    players = result.get("players") or []
    return {
        "schema_version": 1,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "target": result.get("target"),
        "server": result.get("server"),
        "generation": next((p.get("generation") for p in players if p.get("generation") is not None), None),
        "phases": sorted({str(p.get("phase") or "?") for p in players}),
        "players": players,
        "issue_count": len(result.get("issues") or []),
        "issues": result.get("issues") or [],
    }


def append_jsonl_record(record: dict, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
    return path


def write_jsonl_log(result: dict, path: Path) -> Path:
    return append_jsonl_record(jsonl_record(result), path)


def read_recent_jsonl(path: Path, limit: int) -> list[dict]:
    if limit <= 0 or not path.exists():
        return []

    rows = deque(maxlen=limit)
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return list(rows)


def read_jsonl(path: Path) -> list[dict]:
    return read_recent_jsonl(path, 1_000_000)


def record_state_fingerprint(record: dict) -> dict:
    players = record.get("players") or []
    player_fingerprints = []
    for player in players:
        player_fingerprints.append({
            "id": player.get("id"),
            "generation": player.get("generation"),
            "phase": player.get("phase"),
            "game_age": player.get("game_age"),
            "undo_count": player.get("undo_count"),
        })
    return {
        "generation": record.get("generation"),
        "phases": sorted(str(phase) for phase in (record.get("phases") or [])),
        "players": sorted(player_fingerprints, key=lambda item: str(item.get("id") or "")),
    }


def record_is_terminal(record: dict) -> bool:
    phases = record.get("phases") or []
    return bool(phases) and all(is_terminal_phase(phase) for phase in phases)


def assess_stale(records: list[dict], threshold: int) -> dict | None:
    if threshold <= 0 or not records:
        return None

    latest = records[-1]
    latest_fp = record_state_fingerprint(latest)
    stable_runs = 0
    for record in reversed(records):
        if record_state_fingerprint(record) != latest_fp:
            break
        stable_runs += 1

    terminal = record_is_terminal(latest)
    return {
        "is_stale": stable_runs >= threshold and not terminal,
        "stable_runs": stable_runs,
        "threshold": threshold,
        "terminal": terminal,
        "fingerprint": latest_fp,
    }


def write_jsonl_log_with_stale(result: dict, path: Path, stale_after: int) -> Path:
    record = jsonl_record(result)
    previous = read_recent_jsonl(path, max(0, stale_after - 1))
    stale = assess_stale(previous + [record], stale_after)
    if stale:
        record["stale"] = stale
        result["stale"] = stale
    append_jsonl_record(record, path)
    return path


def record_state_label(record: dict) -> str:
    generation = record.get("generation")
    gen_label = f"gen {generation}" if generation is not None else "gen ?"
    phases = ", ".join(str(phase) for phase in (record.get("phases") or ["?"]))
    return f"{gen_label} {phases}"


def timeline_transitions(records: list[dict]) -> list[str]:
    transitions = []
    previous = None
    for record in records:
        label = record_state_label(record)
        if label == previous:
            continue
        transitions.append(label)
        previous = label
    return transitions


def summarize_records(records: list[dict], stale_after: int = DEFAULT_STALE_AFTER) -> dict:
    if not records:
        return {
            "records": 0,
            "issues_total": 0,
            "issue_checks": {},
            "timeline": [],
            "last_state": None,
            "terminal": False,
            "stale": None,
            "recommendation": "no-data",
        }

    issue_checks = {}
    issues_total = 0
    for record in records:
        issues = record.get("issues") or []
        issues_total += int(record.get("issue_count", len(issues)) or 0)
        for item in issues:
            check = item.get("check") or "unknown"
            issue_checks[check] = issue_checks.get(check, 0) + 1

    latest = records[-1]
    stale = assess_stale(records, stale_after)
    terminal = record_is_terminal(latest)
    if issues_total:
        recommendation = "inspect-issues"
    elif terminal:
        recommendation = "stop-heartbeat-terminal"
    elif stale and stale.get("is_stale"):
        recommendation = "stop-heartbeat-stale"
    else:
        recommendation = "continue"

    return {
        "records": len(records),
        "target": latest.get("target"),
        "server": latest.get("server"),
        "started_at": records[0].get("recorded_at"),
        "last_recorded_at": latest.get("recorded_at"),
        "timeline": timeline_transitions(records),
        "last_state": {
            "generation": latest.get("generation"),
            "phases": latest.get("phases") or [],
            "label": record_state_label(latest),
        },
        "issues_total": issues_total,
        "issue_checks": issue_checks,
        "terminal": terminal,
        "stale": stale,
        "recommendation": recommendation,
    }


def summarize_jsonl(path: Path, stale_after: int = DEFAULT_STALE_AFTER) -> dict:
    summary = summarize_records(read_jsonl(path), stale_after)
    summary["path"] = str(path)
    return summary


def format_summary(summary: dict) -> str:
    lines = [f"Advisor live audit summary: {summary.get('path', '?')}"]
    records = summary.get("records", 0)
    if not records:
        lines.append("records: 0")
        lines.append("recommendation: no-data")
        return "\n".join(lines)

    lines.append(f"target: {summary.get('target') or '?'}")
    lines.append(f"records: {records}")
    timeline = summary.get("timeline") or []
    lines.append(f"timeline: {' -> '.join(timeline) if timeline else '?'}")
    lines.append(f"last_state: {(summary.get('last_state') or {}).get('label', '?')}")
    issue_checks = summary.get("issue_checks") or {}
    issue_suffix = ""
    if issue_checks:
        issue_suffix = " (" + ", ".join(f"{k}: {v}" for k, v in sorted(issue_checks.items())) + ")"
    lines.append(f"issues: {summary.get('issues_total', 0)}{issue_suffix}")
    stale = summary.get("stale") or {}
    if stale:
        stale_text = (
            f"{str(bool(stale.get('is_stale'))).lower()} "
            f"({stale.get('stable_runs', 0)}/{stale.get('threshold', 0)} identical checks)"
        )
    else:
        stale_text = "disabled"
    lines.append(f"terminal: {str(bool(summary.get('terminal'))).lower()}")
    lines.append(f"stale: {stale_text}")
    lines.append(f"recommendation: {summary.get('recommendation')}")
    return "\n".join(lines)


def watch_recommendation(result: dict, summary: dict) -> str:
    if result.get("issues"):
        return "inspect-issues"
    if summary.get("terminal"):
        return "stop-heartbeat-terminal"
    stale = summary.get("stale") or {}
    if stale.get("is_stale"):
        return "stop-heartbeat-stale"
    return "continue"


def heartbeat_contract(recommendation: str, result: dict, summary: dict) -> dict:
    target = summary.get("target") or result.get("target") or "?"
    last_state = (summary.get("last_state") or {}).get("label", "?")
    if recommendation == "inspect-issues":
        return {
            "decision": "notify",
            "message": f"{target}: advisor issues found at {last_state}; inspect and fix.",
        }
    if recommendation == "stop-heartbeat-terminal":
        return {
            "decision": "delete",
            "message": f"{target}: terminal state reached ({last_state}); delete heartbeat.",
        }
    if recommendation == "stop-heartbeat-stale":
        stale = summary.get("stale") or {}
        stable_runs = stale.get("stable_runs", "?")
        threshold = stale.get("threshold", "?")
        return {
            "decision": "delete",
            "message": (
                f"{target}: stale live state at {last_state} "
                f"({stable_runs}/{threshold} identical checks); delete heartbeat."
            ),
        }
    return {
        "decision": "continue",
        "message": f"{target}: {last_state}; no advisor issues.",
    }


def watch_once(
    identifier: str,
    server: str,
    log_path_value: str,
    stale_after: int,
    include_claude: bool = True,
) -> dict:
    result = audit_live(identifier, server, include_claude=include_claude)
    log_path = resolve_log_path(log_path_value, identifier)
    write_jsonl_log_with_stale(result, log_path, stale_after)
    result["log_path"] = str(log_path)
    summary = summarize_jsonl(log_path, stale_after)
    recommendation = watch_recommendation(result, summary)
    heartbeat = heartbeat_contract(recommendation, result, summary)
    return {
        "audit": result,
        "summary": summary,
        "recommendation": recommendation,
        "heartbeat": heartbeat,
        "log_path": str(log_path),
    }


def format_watch_once(data: dict) -> str:
    lines = [
        f"Advisor watch once: {data.get('log_path', '?')}",
        format_report(data.get("audit") or {}),
        "",
        format_summary(data.get("summary") or {}),
        f"watch_recommendation: {data.get('recommendation')}",
        f"heartbeat_decision: {(data.get('heartbeat') or {}).get('decision')}",
        f"heartbeat_message: {(data.get('heartbeat') or {}).get('message')}",
    ]
    return "\n".join(lines)


def format_report(result: dict) -> str:
    players = result.get("players") or []
    issues = result.get("issues") or []
    gen = next((p.get("generation") for p in players if p.get("generation") is not None), "?")
    phases = sorted({str(p.get("phase") or "?") for p in players})
    lines = [
        f"Advisor live audit: {result.get('target')} @ {result.get('server')}",
        f"Gen {gen}, phase(s): {', '.join(phases)}, players: {len(players)}",
    ]
    stale = result.get("stale") or {}
    if not issues:
        lines.append("OK: recurring advisor regressions not detected.")
        if stale.get("is_stale"):
            lines.append(
                f"STALE: same live state for {stale['stable_runs']} checks "
                f"(threshold {stale['threshold']}); stop or refresh the heartbeat."
            )
        return "\n".join(lines)

    lines.append(f"Issues: {len(issues)}")
    for item in issues:
        lines.append(
            f"- [{item['check']}] {item['player']}: {item['message']} "
            f"(fix: {item['module']})"
        )
    if stale.get("is_stale"):
        lines.append(
            f"STALE: same live state for {stale['stable_runs']} checks "
            f"(threshold {stale['threshold']}); stop or refresh the heartbeat."
        )
    return "\n".join(lines)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audit live Terraforming Mars advisor output for recurring regressions.",
    )
    parser.add_argument(
        "identifier",
        nargs="?",
        help="Game/player id or Terraforming Mars URL. Not required with --summary.",
    )
    parser.add_argument(
        "--summary",
        metavar="PATH_OR_ID",
        help="Summarize an advisor live audit JSONL log and exit.",
    )
    parser.add_argument(
        "--watch-once",
        action="store_true",
        help=(
            "Run live audit, append JSONL, summarize the updated log, and print "
            "a heartbeat recommendation."
        ),
    )
    parser.add_argument(
        "--server",
        default=None,
        help="TM server base URL. Defaults to URL host, TM_BASE_URL, or herokuapp.",
    )
    parser.add_argument(
        "--skip-claude",
        action="store_true",
        help="Skip Claude markdown output phase-gating audit.",
    )
    parser.add_argument(
        "--log-jsonl",
        nargs="?",
        const="",
        default=None,
        metavar="PATH",
        help=(
            "Append one JSONL audit record. If PATH is omitted, writes to "
            "data/advisor_live_audit/<target>.jsonl."
        ),
    )
    parser.add_argument(
        "--stale-after",
        type=int,
        default=DEFAULT_STALE_AFTER,
        help=(
            "When used with --log-jsonl, mark the run stale after N identical "
            f"live-state records. Use 0 to disable. Default: {DEFAULT_STALE_AFTER}."
        ),
    )
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    if args.summary:
        summary = summarize_jsonl(resolve_summary_path(args.summary), max(0, args.stale_after))
        if args.json:
            print(json.dumps(summary, ensure_ascii=False, indent=2))
        else:
            print(format_summary(summary))
        return 0

    if not args.identifier:
        print("Advisor live audit failed: identifier is required unless --summary is used", file=sys.stderr)
        return 2

    identifier, url_server = extract_identifier(args.identifier)
    server = args.server or url_server or os.getenv("TM_BASE_URL") or DEFAULT_SERVER
    stale_after = max(0, args.stale_after)

    if args.watch_once:
        try:
            data = watch_once(
                identifier,
                server,
                args.log_jsonl if args.log_jsonl is not None else "",
                stale_after,
                include_claude=not args.skip_claude,
            )
        except Exception as exc:
            if args.json:
                print(json.dumps({"error": str(exc)}, ensure_ascii=False, indent=2))
            else:
                print(f"Advisor watch once failed: {exc}", file=sys.stderr)
            return 2

        if args.json:
            print(json.dumps(data, ensure_ascii=False, indent=2))
        else:
            print(format_watch_once(data))
        return 1 if (data.get("audit") or {}).get("issues") else 0

    try:
        result = audit_live(identifier, server, include_claude=not args.skip_claude)
    except Exception as exc:
        if args.json:
            print(json.dumps({"error": str(exc)}, ensure_ascii=False, indent=2))
        else:
            print(f"Advisor live audit failed: {exc}", file=sys.stderr)
        return 2

    log_path = None
    if args.log_jsonl is not None:
        log_path = write_jsonl_log_with_stale(
            result,
            resolve_log_path(args.log_jsonl, identifier),
            stale_after,
        )
        result["log_path"] = str(log_path)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(format_report(result))
        if log_path:
            print(f"Log: {log_path}")
    return 1 if result.get("issues") else 0


if __name__ == "__main__":
    raise SystemExit(main())
