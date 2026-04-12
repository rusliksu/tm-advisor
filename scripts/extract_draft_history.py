#!/usr/bin/env python3
"""Extract full draft history from TM game.db for any completed game.

Reads save snapshots from the games table, diffs draftedCards between
consecutive saves to reconstruct: who picked what, from what pack, in
what order, and what they passed.

Works retroactively on any game stored in game.db.

Usage:
    # From VPS (direct DB access):
    python extract_draft_history.py g3f5cbaae7fe

    # From local (SSH to VPS):
    python extract_draft_history.py g3f5cbaae7fe --ssh

    # Output as JSON (for programmatic use):
    python extract_draft_history.py g3f5cbaae7fe --json

    # With card scores from evaluations.json:
    python extract_draft_history.py g3f5cbaae7fe --scores
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sqlite3
import sys
import tempfile
from pathlib import Path

# Default paths
VPS_DB_PATH = "/home/openclaw/terraforming-mars/db/game.db"
LOCAL_EVAL_PATH = Path(__file__).resolve().parent.parent / "data" / "evaluations.json"


def load_evaluations(path: Path | None = None) -> dict[str, dict]:
    """Load card evaluations for score/tier enrichment."""
    path = path or LOCAL_EVAL_PATH
    if not path.exists():
        return {}
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, dict):
        return data
    return {}


def query_db_local(db_path: str, game_id: str) -> list[tuple[int, str]]:
    """Query game saves directly from local SQLite DB."""
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute(
        """SELECT save_id, game FROM games
           WHERE game_id=? AND json_extract(game, "$.phase")
           IN ("initial_drafting", "drafting")
           ORDER BY save_id""",
        (game_id,),
    )
    rows = cur.fetchall()
    conn.close()
    return rows


def query_db_ssh(game_id: str) -> list[tuple[int, str]]:
    """Query game saves via SSH to VPS.

    Writes a temp Python script, sends via stdin to avoid quoting hell.
    """
    script = (
        "import sqlite3, json, sys\n"
        f"conn = sqlite3.connect('{VPS_DB_PATH}')\n"
        "cur = conn.cursor()\n"
        "cur.execute(\n"
        '    "SELECT save_id, game FROM games WHERE game_id=? '\
        "AND json_extract(game, '$.phase') "\
        "IN ('initial_drafting', 'drafting') ORDER BY save_id\",\n"
        f'    ("{game_id}",),\n'
        ")\n"
        "results = []\n"
        "for sid, g in cur:\n"
        '    results.append({"s": sid, "g": g})\n'
        "conn.close()\n"
        "print(json.dumps(results))\n"
    )
    cmd = ["ssh", "vps", "python3", "-"]
    result = subprocess.run(cmd, input=script, capture_output=True,
                            text=True, timeout=120)
    if result.returncode != 0:
        print(f"SSH error: {result.stderr}", file=sys.stderr)
        return []

    try:
        data = json.loads(result.stdout)
        return [(r["s"], r["g"]) for r in data]
    except (json.JSONDecodeError, KeyError) as e:
        print(f"Parse error: {e}", file=sys.stderr)
        return []


def extract_drafts(rows: list[tuple[int, str]]) -> dict:
    """Extract draft picks from save snapshots by diffing draftedCards.

    Returns: {
        "players": {color: {name, picks: [{gen, card, save_id}]}},
        "pick_order": [{save_id, gen, player, color, card}],  # chronological
    }
    """
    prev_drafted: dict[str, set[str]] = {}
    players: dict[str, dict] = {}
    pick_order: list[dict] = []

    for save_id, game_json in rows:
        if isinstance(game_json, str):
            game = json.loads(game_json)
        else:
            game = game_json
        gen = game.get("generation", 1)

        for p in game.get("players", []):
            color = p.get("color", "?")
            name = p.get("name", "?")

            # Parse draftedCards
            drafted = set()
            for c in p.get("draftedCards", []):
                cn = c.get("name", "") if isinstance(c, dict) else str(c)
                if cn:
                    drafted.add(cn)

            if color not in players:
                players[color] = {"name": name, "picks": []}
                prev_drafted[color] = set()

            # Detect new picks
            new_cards = drafted - prev_drafted[color]
            for card in sorted(new_cards):
                pick = {"gen": gen, "card": card, "save_id": save_id}
                players[color]["picks"].append(pick)
                pick_order.append({
                    "save_id": save_id,
                    "gen": gen,
                    "player": name,
                    "color": color,
                    "card": card,
                })

            prev_drafted[color] = drafted

    return {"players": players, "pick_order": pick_order}


def reconstruct_packs(pick_order: list[dict], player_count: int = 3) -> list[dict]:
    """Reconstruct draft packs from chronological pick order.

    In TM draft: packs of 4 cards rotate clockwise. Each player picks 1,
    passes remaining. So picks come in rounds of player_count.

    Returns enriched pick_order with pack_round info.
    """
    # Group by generation
    by_gen: dict[int, list[dict]] = {}
    for pick in pick_order:
        by_gen.setdefault(pick["gen"], []).append(pick)

    enriched = []
    for gen in sorted(by_gen):
        gen_picks = by_gen[gen]
        pack_round = 1
        count_in_round = 0
        for pick in gen_picks:
            pick["pack_round"] = pack_round
            enriched.append(pick)
            count_in_round += 1
            if count_in_round >= player_count:
                count_in_round = 0
                pack_round += 1

    return enriched


def enrich_with_scores(drafts: dict, evals: dict[str, dict]) -> None:
    """Add score/tier to each pick from evaluations."""
    for color, pdata in drafts["players"].items():
        for pick in pdata["picks"]:
            card_eval = evals.get(pick["card"], {})
            if isinstance(card_eval, dict):
                pick["score"] = card_eval.get("score")
                pick["tier"] = card_eval.get("tier")

    for pick in drafts.get("pick_order", []):
        card_eval = evals.get(pick["card"], {})
        if isinstance(card_eval, dict):
            pick["score"] = card_eval.get("score")
            pick["tier"] = card_eval.get("tier")


def format_human(drafts: dict) -> str:
    """Human-readable draft summary."""
    lines = []
    players = drafts["players"]
    pick_order = drafts.get("pick_order_enriched", drafts.get("pick_order", []))

    # Per-player summary
    for color in sorted(players, key=lambda c: players[c]["name"]):
        pdata = players[color]
        name = pdata["name"]
        picks = pdata["picks"]
        total = len(picks)

        # Stats
        tiers = {}
        scores = []
        for p in picks:
            t = p.get("tier", "?")
            tiers[t] = tiers.get(t, 0) + 1
            if p.get("score"):
                scores.append(p["score"])

        avg = sum(scores) / len(scores) if scores else 0
        tier_str = " ".join(f"{t}:{n}" for t, n in sorted(tiers.items()))

        lines.append(f"\n{'='*50}")
        lines.append(f"{name} ({color}) — {total} picks, avg score {avg:.0f}")
        lines.append(f"Tiers: {tier_str}")
        lines.append(f"{'='*50}")

        # By gen
        by_gen: dict[int, list] = {}
        for p in picks:
            by_gen.setdefault(p["gen"], []).append(p)

        for gen in sorted(by_gen):
            gen_picks = by_gen[gen]
            lines.append(f"\n  Gen {gen}:")
            for i, p in enumerate(gen_picks, 1):
                card = p["card"]
                score = p.get("score", "?")
                tier = p.get("tier", "?")
                pack = p.get("pack_round", "?")
                marker = ""
                if tier in ("D", "F"):
                    marker = " ← weak"
                elif tier == "S":
                    marker = " ★"
                elif tier == "A":
                    marker = " ✓"
                lines.append(f"    R{pack} {card:35s} ({tier}-{score}){marker}")

    # Chronological highlights
    lines.append(f"\n{'='*50}")
    lines.append("ХРОНОЛОГИЯ ПИКОВ (кто перед кем)")
    lines.append(f"{'='*50}")

    by_gen: dict[int, list] = {}
    for p in pick_order:
        by_gen.setdefault(p["gen"], []).append(p)

    for gen in sorted(by_gen):
        gen_picks = by_gen[gen]
        lines.append(f"\n--- Gen {gen} ---")
        cur_round = 0
        for p in gen_picks:
            rnd = p.get("pack_round", 0)
            if rnd != cur_round:
                cur_round = rnd
                lines.append(f"  Pack round {rnd}:")
            score = p.get("score", "?")
            tier = p.get("tier", "?")
            lines.append(f"    {p['player']:12s} → {p['card']:30s} ({tier}-{score})")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Extract TM draft history from game.db")
    parser.add_argument("game_id", help="Game ID (e.g. g3f5cbaae7fe)")
    parser.add_argument("--ssh", action="store_true", help="Query VPS via SSH")
    parser.add_argument("--db", default=VPS_DB_PATH, help="Path to game.db (local)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--scores", action="store_true", default=True,
                        help="Enrich with card scores (default: on)")
    parser.add_argument("--no-scores", action="store_true", help="Skip score enrichment")
    args = parser.parse_args()

    # Load saves
    if args.ssh:
        rows = query_db_ssh(args.game_id)
    else:
        rows = query_db_local(args.db, args.game_id)

    if not rows:
        print(f"No draft saves found for {args.game_id}", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(rows)} draft saves", file=sys.stderr)

    # Extract picks
    drafts = extract_drafts(rows)

    # Reconstruct packs
    player_count = len(drafts["players"])
    drafts["pick_order"] = reconstruct_packs(drafts["pick_order"], player_count)

    # Enrich scores
    if args.scores and not args.no_scores:
        evals = load_evaluations()
        if evals:
            enrich_with_scores(drafts, evals)
            print(f"Enriched with {len(evals)} evaluations", file=sys.stderr)

    if args.json:
        # Clean up for JSON output (remove save_id noise)
        output = {
            "game_id": args.game_id,
            "player_count": player_count,
            "total_saves": len(rows),
            "players": drafts["players"],
            "pick_order": drafts["pick_order"],
        }
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        print(format_human(drafts))


if __name__ == "__main__":
    main()
