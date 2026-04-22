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
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / "scripts"
DEFAULT_SERVER = "https://terraforming-mars.herokuapp.com"
DEFAULT_LOG_DIR = ROOT / "data" / "advisor_live_audit"

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
        players.append({
            "id": player_id,
            "label": label,
            "generation": (snapshot.get("game") or {}).get("generation"),
            "phase": phase,
        })

        player_issues = audit_snapshot_payload(label, snapshot)
        if include_claude:
            raw = client.get_player_state(player_id)
            state = deps["GameState"](raw)
            rendered = formatter.format(state)
            player_issues.extend(audit_claude_output(label, state.phase, rendered))

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


def write_jsonl_log(result: dict, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(jsonl_record(result), ensure_ascii=False, sort_keys=True) + "\n")
    return path


def format_report(result: dict) -> str:
    players = result.get("players") or []
    issues = result.get("issues") or []
    gen = next((p.get("generation") for p in players if p.get("generation") is not None), "?")
    phases = sorted({str(p.get("phase") or "?") for p in players})
    lines = [
        f"Advisor live audit: {result.get('target')} @ {result.get('server')}",
        f"Gen {gen}, phase(s): {', '.join(phases)}, players: {len(players)}",
    ]
    if not issues:
        lines.append("OK: recurring advisor regressions not detected.")
        return "\n".join(lines)

    lines.append(f"Issues: {len(issues)}")
    for item in issues:
        lines.append(
            f"- [{item['check']}] {item['player']}: {item['message']} "
            f"(fix: {item['module']})"
        )
    return "\n".join(lines)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audit live Terraforming Mars advisor output for recurring regressions.",
    )
    parser.add_argument("identifier", help="Game/player id or Terraforming Mars URL")
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
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    identifier, url_server = extract_identifier(args.identifier)
    server = args.server or url_server or os.getenv("TM_BASE_URL") or DEFAULT_SERVER

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
        log_path = write_jsonl_log(result, resolve_log_path(args.log_jsonl, identifier))
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
