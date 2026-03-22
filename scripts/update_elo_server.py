#!/usr/bin/env python3
"""Scrape completed games from TM SQLite DB and compute Elo ratings."""

import json
import sqlite3

DB_PATH = '/home/openclaw/terraforming-mars/db/game.db'
OUT_PATH = '/home/openclaw/terraforming-mars/elo/data.json'
DEFAULT_ELO = 1500
BASE_K = 32

PLAYER_ALIASES = {
    'gydro': 'GydRo', 'руслан': 'GydRo', 'ruslan': 'GydRo',
}

def resolve_name(name):
    key = name.strip().lower()
    canonical = PLAYER_ALIASES.get(key)
    return (canonical.strip().lower(), canonical) if canonical else (key, name)

def get_k(elo):
    if elo < 1400: return BASE_K * 1.2
    if elo < 1600: return BASE_K
    if elo < 1800: return BASE_K * 0.8
    if elo < 2000: return BASE_K * 0.6
    return BASE_K * 0.4

def expected(a, b):
    return 1 / (1 + 10 ** ((b - a) / 400))

def calc_elo(players, db):
    n = len(players)
    if n < 2: return []
    results = []
    for i, p in enumerate(players):
        name, display = resolve_name(p['name'])
        my_elo = db.get(name, {}).get('elo', DEFAULT_ELO)
        k = get_k(my_elo)
        exp_total = sum(expected(my_elo, db.get(resolve_name(players[j]['name'])[0], {}).get('elo', DEFAULT_ELO))
                        for j in range(n) if j != i)
        act_total = sum(1.0 if p['place'] < players[j]['place'] else
                        0.5 if p['place'] == players[j]['place'] else 0
                        for j in range(n) if j != i)
        delta = round(k / (n - 1) * 1.5 * (act_total - exp_total))
        results.append({'name': name, 'displayName': display, 'oldElo': my_elo,
                        'newElo': my_elo + delta, 'delta': delta, 'place': p['place'],
                        'corp': p.get('corp', ''), 'vp': p.get('vp', 0)})
    return results

def calc_elo_vp(players, db):
    n = len(players)
    if n < 2: return []
    results = []
    for i, p in enumerate(players):
        name, display = resolve_name(p['name'])
        my_elo = db.get(name, {}).get('elo_vp', DEFAULT_ELO)
        k = get_k(my_elo)
        exp_total = sum(expected(my_elo, db.get(resolve_name(players[j]['name'])[0], {}).get('elo_vp', DEFAULT_ELO))
                        for j in range(n) if j != i)
        act_total = 0
        for j in range(n):
            if j == i: continue
            diff = (p.get('vp', 0) - players[j].get('vp', 0))
            margin = min(abs(diff) / 20.0, 1.0)
            act_total += 0.5 + (margin * 0.5 if diff > 0 else -margin * 0.5 if diff < 0 else 0)
        delta = round(k / (n - 1) * 1.5 * (act_total - exp_total))
        results.append({'name': name, 'newElo': my_elo + delta, 'delta': delta})
    return results

def main():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    all_games = []

    # 1. Games from game_results (have real VP)
    c.execute("""SELECT gr.game_id, gr.generations, gr.scores,
                        cg.completed_time, json_extract(gr.game_options, '$.boardName')
                 FROM game_results gr
                 JOIN completed_game cg ON gr.game_id = cg.game_id
                 ORDER BY cg.completed_time""")
    for row in c.fetchall():
        gid, gen, scores_json, ts, map_name = row
        scores = json.loads(scores_json)
        scores.sort(key=lambda s: s.get('playerScore', 0), reverse=True)
        # Skip games without playerName (only corporation names = can't identify players)
        has_names = any('playerName' in s for s in scores)
        if not has_names:
            continue
        players = []
        for i, s in enumerate(scores):
            name = s.get('playerName', '?')
            if name == '?': continue  # skip entries without name
            place = i + 1
            if i > 0 and s.get('playerScore', 0) == scores[i-1].get('playerScore', 0):
                place = players[-1]['place']
            players.append({'name': name, 'place': place, 'vp': s.get('playerScore', 0),
                            'corp': s.get('corporation', '')})
        all_games.append({'id': gid, 'gen': gen, 'map': map_name or '', 'ts': ts,
                          'players': players, 'source': 'vp'})

    # 2. Finished games from games table (TR only)
    c.execute("""SELECT g.game_id, g.created_time,
                        json_extract(g.game, '$.generation') as gen,
                        json_extract(g.game, '$.gameOptions.boardName') as map_name,
                        json_extract(g.game, '$.players') as players_json
                 FROM games g
                 INNER JOIN (
                   SELECT game_id, MAX(save_id) as max_save
                   FROM games WHERE status = 'finished'
                   GROUP BY game_id
                 ) latest ON g.game_id = latest.game_id AND g.save_id = latest.max_save
                 WHERE g.game_id NOT IN (SELECT game_id FROM game_results)
                 ORDER BY g.created_time""")
    for row in c.fetchall():
        gid, ts, gen, map_name, players_json = row
        if not players_json: continue
        try:
            pdata = json.loads(players_json)
        except: continue
        raw = []
        for p in pdata:
            name = p.get('name', '?')
            tr = p.get('terraformRating', 0)
            corp = '?'
            if p.get('corporations'):
                corp = '|'.join(cc.get('name', '?') for cc in p['corporations'])
            elif p.get('corporationCard'):
                corp = p['corporationCard'].get('name', '?')
            raw.append({'name': name, 'tr': tr, 'vp': tr, 'corp': corp})
        raw.sort(key=lambda x: x['vp'], reverse=True)
        players = []
        for i, p in enumerate(raw):
            place = i + 1
            if i > 0 and p['vp'] == raw[i-1]['vp']:
                place = players[-1]['place']
            players.append({**p, 'place': place})
        all_games.append({'id': gid, 'gen': gen, 'map': map_name or '', 'ts': ts,
                          'players': players, 'source': 'tr'})

    conn.close()
    all_games.sort(key=lambda g: g.get('ts', 0) or 0)
    print(f"Games: {len(all_games)} ({sum(1 for g in all_games if g['source']=='vp')} VP, "
          f"{sum(1 for g in all_games if g['source']=='tr')} TR-only)")

    # 3. Calculate Elo
    elo = {'players': {}, 'games': []}
    for game in all_games:
        players = game['players']
        if len(players) < 2: continue
        results = calc_elo(players, elo['players'])
        results_vp = calc_elo_vp(players, elo['players'])
        for r in results:
            key = r['name']
            if key not in elo['players']:
                elo['players'][key] = {'elo': DEFAULT_ELO, 'elo_vp': DEFAULT_ELO,
                    'displayName': r['displayName'], 'games': 0, 'wins': 0,
                    'top3': 0, 'totalVP': 0, 'corps': {}}
            p = elo['players'][key]
            p['elo'] = r['newElo']
            p['displayName'] = r['displayName']
            p['games'] += 1
            if r['place'] == 1: p['wins'] += 1
            if r['place'] <= 3: p['top3'] += 1
            p['totalVP'] += r.get('vp', 0)
            if r['corp']: p['corps'][r['corp']] = p['corps'].get(r['corp'], 0) + 1
        for r in results_vp:
            if r['name'] in elo['players']:
                elo['players'][r['name']]['elo_vp'] = r['newElo']
        elo['games'].append({
            '_key': game['id'], 'date': '', 'server': 'knightbyte',
            'map': game.get('map', ''), 'generation': game.get('gen', 0),
            'playerCount': len(players),
            'results': [{'name': r['name'], 'displayName': r['displayName'],
                         'place': r['place'], 'delta': r['delta'],
                         'oldElo': r['oldElo'], 'newElo': r['newElo'],
                         'corp': r.get('corp', '')} for r in results]})

    lb = sorted(elo['players'].items(), key=lambda x: x[1]['elo'], reverse=True)
    print(f"\nPlayers: {len(lb)}")
    for i, (key, p) in enumerate(lb[:20]):
        fav = max(p['corps'].items(), key=lambda x: x[1])[0] if p['corps'] else '-'
        wr = round(p['wins'] / p['games'] * 100) if p['games'] > 0 else 0
        avg = round(p['totalVP'] / p['games']) if p['games'] > 0 else 0
        print(f"{i+1:>3} {p['displayName']:<20} {p['elo']:>5} {p['games']:>4}g {p['wins']:>3}w {wr:>3}% {avg:>3}vp {fav}")

    with open(OUT_PATH, 'w') as f:
        json.dump(elo, f, ensure_ascii=False, indent=2)
    print(f"\nSaved to {OUT_PATH}")

if __name__ == '__main__':
    main()
