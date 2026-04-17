"""Fetch live ELO from tm.knightbyte.win and merge into data/elo_import.json.

Usage: python scripts/update_elo.py
"""
import json
import sys
import urllib.request
from pathlib import Path


LIVE_URL = "https://tm.knightbyte.win/elo/data.json"
TARGET = Path(__file__).resolve().parent.parent / "data" / "elo_import.json"


def fetch_live() -> dict:
    with urllib.request.urlopen(LIVE_URL, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    try:
        live = fetch_live()
    except Exception as e:
        print(f"fetch failed: {e}")
        return 1
    live_players = live.get("players") or {}
    if not live_players:
        print("no players in live response")
        return 1

    if TARGET.exists():
        merged = json.loads(TARGET.read_text(encoding="utf-8"))
    else:
        merged = {"players": {}, "games": []}

    merged_players = merged.setdefault("players", {})
    before = len(merged_players)
    added = 0
    updated = 0
    for name, info in live_players.items():
        if name in merged_players:
            old = merged_players[name]
            if old.get("elo") != info.get("elo") or old.get("games") != info.get("games"):
                updated += 1
            merged_players[name] = info
        else:
            merged_players[name] = info
            added += 1

    games = live.get("games") or []
    if games and "games" in merged:
        merged["games"] = games

    TARGET.write_text(
        json.dumps(merged, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"elo_import updated: {before} → {len(merged_players)} players "
          f"(+{added} new, {updated} refreshed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
