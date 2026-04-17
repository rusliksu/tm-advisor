"""Batch shadow-log analyzer — run match-rate classifier on every shadow-*.jsonl."""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path


def classify(rec):
    status = rec.get('status')
    if status != 'resolved':
        return 'unscorable'
    if not rec.get('playerActed'):
        return 'unscorable'
    ba = (rec.get('botAction') or '').strip()
    oa = (rec.get('observedAction') or '').strip()
    ch = rec.get('observedChanges') or {}
    tableau_added = ch.get('tableauAdded') or []
    corp_added = ch.get('corpAdded') or []
    prelude_added = ch.get('preludeAdded') or []
    drafted_added = ch.get('draftedAdded') or []
    if not ba:
        return 'unscorable'
    if (oa == 'state changed' or oa.startswith('prompt ') or oa.startswith('phase ')
            or oa.startswith('resource delta') or oa.startswith('corp ')
            or oa.startswith('lastCard')):
        return 'unscorable'
    if ba.startswith('option['):
        return 'unscorable'
    if ba == 'initialCards':
        return 'unscorable'
    if ba == 'pass':
        low = oa.lower()
        return 'match' if 'pass' in low or 'idle' in low else 'mismatch'
    m = re.match(r'^cards?:\s*(.+)$', ba)
    if m:
        card = m.group(1).strip()
        if oa == f'draft {card}' or oa == f'play {card}' or oa == f'play card {card}':
            return 'match'
        if card in tableau_added or card in corp_added or card in prelude_added or card in drafted_added:
            return 'match'
        if oa.startswith('draft '):
            picked = [c.strip() for c in oa[6:].split(',')]
            if card in picked:
                return 'match'
        return 'mismatch'
    m = re.match(r'^play\s+(.+)$', ba)
    if m:
        card = m.group(1).strip()
        if oa == f'play {card}' or oa == f'play card {card}':
            return 'match'
        if card in tableau_added:
            return 'match'
        return 'mismatch'
    if ba.startswith('space') or ba.startswith('player'):
        return 'unscorable'
    m = re.match(r'^colony\s+(.+)$', ba)
    if m:
        name = m.group(1).strip()
        return 'match' if name.lower() in oa.lower() else 'mismatch'
    return 'unscorable'


def analyze_file(path: Path) -> dict:
    players = {}
    phase_cls = defaultdict(lambda: defaultdict(int))  # phase → cls → count
    total = defaultdict(int)  # cls → count
    game_id = path.stem.replace('shadow-', '')
    with open(path, encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            d = json.loads(line)
            if d.get('type') == 'shadow_start':
                for p in d.get('players', []):
                    players[p['id']] = p['name']
                continue
            if d.get('type') == 'shadow_end':
                continue
            cls = classify(d)
            phase = d.get('phase') or '?'
            phase_cls[phase][cls] += 1
            total[cls] += 1
    return {
        'game_id': game_id,
        'players': list(players.values()),
        'total': dict(total),
        'phase_cls': {ph: dict(c) for ph, c in phase_cls.items()},
    }


def format_pct(match, mismatch):
    scored = match + mismatch
    return f'{100 * match / scored:5.1f}%' if scored else '  n/a'


def main():
    shadow_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
    files = sorted(shadow_dir.glob('shadow-*.jsonl'), key=lambda p: p.stat().st_size, reverse=True)
    if not files:
        print(f'No shadow-*.jsonl in {shadow_dir}')
        return

    results = [analyze_file(p) for p in files[:20]]

    print('=== Per-game match-rate ===')
    print(f"{'Game':<16} {'Players':<36} {'match':>6} {'miss':>6} {'scored':>7} {'total':>6} {'%':>7}")
    for r in results:
        t = r['total']
        m = t.get('match', 0)
        mm = t.get('mismatch', 0)
        u = t.get('unscorable', 0)
        scored = m + mm
        print(f"{r['game_id']:<16} {', '.join(r['players']):<36} "
              f"{m:>6} {mm:>6} {scored:>7} {m+mm+u:>6} {format_pct(m, mm):>7}")

    print('\n=== Combined phase match-rate across all games ===')
    combined = defaultdict(lambda: defaultdict(int))
    for r in results:
        for ph, c in r['phase_cls'].items():
            for k, v in c.items():
                combined[ph][k] += v
    print(f"{'Phase':<22} {'match':>6} {'miss':>6} {'scored':>7} {'%':>7}")
    for ph in sorted(combined):
        c = combined[ph]
        m = c.get('match', 0)
        mm = c.get('mismatch', 0)
        print(f"  {ph:<20} {m:>6} {mm:>6} {m+mm:>7} {format_pct(m, mm):>7}")

    total_m = sum(r['total'].get('match', 0) for r in results)
    total_mm = sum(r['total'].get('mismatch', 0) for r in results)
    total_u = sum(r['total'].get('unscorable', 0) for r in results)
    print(f'\nAggregate: {total_m} match, {total_mm} mismatch, {total_u} unscorable, '
          f'overall {format_pct(total_m, total_mm).strip()}')


if __name__ == '__main__':
    main()
