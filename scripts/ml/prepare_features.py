#!/usr/bin/env python3
"""
Prepare ML features from smartbot JSONL training data.

Input:  ml_training_data.jsonl (produced by bot/smartbot.js --ml-log)
Output: features.csv (ready for XGBoost/LightGBM)

JSONL schema (per action entry, enriched at game end):
{
  ts, game_id, gen, phase, player,
  tr, mc, mc_prod, steel, steel_prod, ti, ti_prod,
  plants, plant_prod, energy, energy_prod, heat, heat_prod,
  hand_size, tableau_size, tags: {Building: N, ...}, colonies,
  temp, oxygen, oceans, venus, player_count,
  opponents: [{tr, mc_prod, tableau_size, tags}],
  action_type, action_detail, corp,
  final_vp, winner, vp_rank          # added by mlLogGameEnd
}
"""
import json
import csv
import sys
import os
from pathlib import Path
from collections import defaultdict

# All TM tags we track
TAG_NAMES = [
    'building', 'space', 'science', 'earth', 'venus', 'jovian',
    'plant', 'microbe', 'animal', 'event', 'power', 'city',
    'mars', 'moon', 'wild',
]

# Global parameter maximums for urgency calculation
MAX_TEMP_STEPS = 19      # -30 to +8 in 2-degree steps
MAX_OXYGEN_STEPS = 14    # 0% to 14%
MAX_OCEAN_STEPS = 9      # 0 to 9


def normalize_tags(tags_dict):
    """Normalize tag keys to lowercase, return counts for all TAG_NAMES."""
    lower = {k.lower(): v for k, v in (tags_dict or {}).items()}
    return {tag: lower.get(tag, 0) for tag in TAG_NAMES}


def calc_urgency(temp, oxygen, oceans):
    """How close the game is to ending (0=start, 1=maxed out).
    Based on global parameters remaining steps."""
    temp_done = (temp - (-30)) / 2   # steps from -30
    oxy_done = oxygen
    ocean_done = oceans
    total_done = temp_done + oxy_done + ocean_done
    total_max = MAX_TEMP_STEPS + MAX_OXYGEN_STEPS + MAX_OCEAN_STEPS  # 42
    return min(total_done / total_max, 1.0)


def extract_features(entry):
    """Extract flat feature dict from one JSONL entry."""
    # Skip entries without outcome labels
    if 'final_vp' not in entry:
        return None

    tags = normalize_tags(entry.get('tags', {}))
    opponents = entry.get('opponents', [])

    # Core numeric features
    f = {
        'game_id':      entry.get('game_id', ''),
        'gen':          entry.get('gen', 0),
        'phase':        entry.get('phase', ''),
        'player':       entry.get('player', ''),
        'corp':         entry.get('corp', ''),
        'action_type':  entry.get('action_type', ''),

        # Player resources
        'tr':           entry.get('tr', 0),
        'mc':           entry.get('mc', 0),
        'mc_prod':      entry.get('mc_prod', 0),
        'steel':        entry.get('steel', 0),
        'steel_prod':   entry.get('steel_prod', 0),
        'ti':           entry.get('ti', 0),
        'ti_prod':      entry.get('ti_prod', 0),
        'plants':       entry.get('plants', 0),
        'plant_prod':   entry.get('plant_prod', 0),
        'energy':       entry.get('energy', 0),
        'energy_prod':  entry.get('energy_prod', 0),
        'heat':         entry.get('heat', 0),
        'heat_prod':    entry.get('heat_prod', 0),
        'hand_size':    entry.get('hand_size', 0),
        'tableau_size': entry.get('tableau_size', 0),
        'colonies':     entry.get('colonies', 0),

        # Global state
        'temp':         entry.get('temp', -30),
        'oxygen':       entry.get('oxygen', 0),
        'oceans':       entry.get('oceans', 0),
        'venus':        entry.get('venus', 0),
        'player_count': entry.get('player_count', 3),
    }

    # Tag counts
    for tag in TAG_NAMES:
        f[f'tag_{tag}'] = tags[tag]

    # Derived features
    f['income'] = f['mc_prod'] + f['tr']  # total MC income per gen
    gen = max(f['gen'], 1)
    f['play_rate'] = round(f['tableau_size'] / gen, 3)
    f['urgency'] = round(calc_urgency(f['temp'], f['oxygen'], f['oceans']), 4)

    # Total tag count
    f['total_tags'] = sum(tags[t] for t in TAG_NAMES)

    # Production score (weighted sum)
    f['prod_score'] = (
        f['mc_prod'] * 1.0 +
        f['steel_prod'] * 1.6 +
        f['ti_prod'] * 2.5 +
        f['plant_prod'] * 1.6 +
        f['energy_prod'] * 1.5 +
        f['heat_prod'] * 0.8
    )

    # Opponent features
    if opponents:
        opp_trs = [o.get('tr', 0) for o in opponents]
        opp_tabs = [o.get('tableau_size', 0) for o in opponents]
        f['max_opp_tr'] = max(opp_trs)
        f['avg_opp_tr'] = round(sum(opp_trs) / len(opp_trs), 2)
        f['avg_opp_tableau'] = round(sum(opp_tabs) / len(opp_tabs), 2)
        f['tr_gap'] = f['tr'] - f['max_opp_tr']  # positive = we lead
        f['max_opp_tableau'] = max(opp_tabs)

        # Opponent total tag counts
        opp_total_tags = []
        for o in opponents:
            ot = normalize_tags(o.get('tags', {}))
            opp_total_tags.append(sum(ot.values()))
        f['avg_opp_tags'] = round(sum(opp_total_tags) / len(opp_total_tags), 2)
    else:
        f['max_opp_tr'] = 0
        f['avg_opp_tr'] = 0
        f['avg_opp_tableau'] = 0
        f['tr_gap'] = 0
        f['max_opp_tableau'] = 0
        f['avg_opp_tags'] = 0

    # Labels
    f['final_vp'] = entry.get('final_vp', 0)
    f['winner'] = 1 if entry.get('winner', False) else 0
    f['vp_rank'] = entry.get('vp_rank', 0)

    return f


def aggregate_game_snapshots(rows):
    """From per-action rows, create per-game-per-player snapshots.
    Takes the LAST action of each generation as the gen-end snapshot.
    This reduces noise from mid-turn transient states."""
    games = defaultdict(lambda: defaultdict(list))
    for r in rows:
        key = (r['game_id'], r['player'])
        games[key][r['gen']].append(r)

    snapshots = []
    for (gid, player), gens in games.items():
        for gen_num in sorted(gens.keys()):
            actions = gens[gen_num]
            # Take the last action of this gen as the snapshot
            snapshots.append(actions[-1])
    return snapshots


def main():
    project_root = Path(__file__).resolve().parents[2]
    input_file = project_root / 'ml_training_data.jsonl'
    output_file = project_root / 'data' / 'features.csv'

    # Allow override via CLI args
    if len(sys.argv) > 1:
        input_file = Path(sys.argv[1])
    if len(sys.argv) > 2:
        output_file = Path(sys.argv[2])

    if not input_file.exists():
        print(f"Input file not found: {input_file}")
        print("Run bot with --ml-log flag to generate training data:")
        print("  node bot/smartbot.js --ml-log")
        sys.exit(1)

    # Read JSONL
    entries = []
    skipped = 0
    with open(input_file, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f"  Skipping line {line_num}: {e}")
                skipped += 1

    print(f"Read {len(entries)} entries from {input_file} ({skipped} skipped)")

    # Extract features
    rows = []
    for entry in entries:
        feat = extract_features(entry)
        if feat:
            rows.append(feat)

    print(f"Extracted {len(rows)} feature rows (entries without final_vp dropped)")

    if not rows:
        print("No valid rows to write. Make sure games completed (mlLogGameEnd called).")
        sys.exit(1)

    # Aggregate: one row per player per generation (last action snapshot)
    snapshots = aggregate_game_snapshots(rows)
    print(f"Aggregated to {len(snapshots)} gen-end snapshots")

    # Write CSV
    output_file.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(snapshots[0].keys())
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(snapshots)

    print(f"Written to {output_file}")

    # Quick stats
    games = set(r['game_id'] for r in snapshots)
    players = set(r['player'] for r in snapshots)
    avg_vp = sum(r['final_vp'] for r in snapshots) / len(snapshots)
    print(f"\nStats: {len(games)} games, {len(players)} unique players")
    print(f"  Avg final VP: {avg_vp:.1f}")
    print(f"  Gen range: {min(r['gen'] for r in snapshots)}-{max(r['gen'] for r in snapshots)}")
    print(f"  Features: {len(fieldnames)} columns")


if __name__ == '__main__':
    main()
