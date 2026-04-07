import re, json
from collections import defaultdict, Counter

logs = {
    'g1': 'tm_g909e23236602_20260223_191739.log',
    'g2': 'tm_g992c5032c5b9_20260223_212823.log',
    'g3': 'tm_ge2b194ff1011_20260223_215033.log',
    'g4': 'tm_g22c1ca96466d_20260223_230524.log'
}

game_meta = {
    'g1': {'map': 'Elysium', 'players': ['wdkymyms', 'VitalyVit', 'Nihoka13'], 'winner': 'wdkymyms', 'gens': '2-11'},
    'g2': {'map': 'Tharsis', 'players': ['Tersius', 'Reinforcement', 'Zara'], 'winner': 'Tersius', 'gens': '4-7'},
    'g3': {'map': 'Vastitas Borealis Novus', 'players': ['Geekdumb', 'Gydro', 'Pokemar'], 'winner': 'Gydro', 'gens': '1-8'},
    'g4': {'map': 'Tharsis', 'players': ['Plazma', 'Geekdumb'], 'winner': 'Geekdumb', 'gens': '6-11'}
}

final_scores = {
    'g1': {'wdkymyms': {'vp':123,'tr':55}, 'VitalyVit': {'vp':103,'tr':41}, 'Nihoka13': {'vp':114,'tr':42}},
    'g2': {'Tersius': {'vp':74,'tr':28}, 'Reinforcement': {'vp':48,'tr':24}, 'Zara': {'vp':72,'tr':33}},
    'g3': {'Geekdumb': {'vp':61,'tr':32}, 'Gydro': {'vp':85,'tr':50}, 'Pokemar': {'vp':65,'tr':31}},
    'g4': {'Plazma': {'vp':132,'tr':43}, 'Geekdumb': {'vp':145,'tr':53}}
}

all_cards_played = []
all_cards_gone = []
all_globals = {}
all_player_stats = {}

for gid, fname in logs.items():
    with open(fname, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    players = game_meta[gid]['players']
    current_player = None
    globals_snapshots = []
    player_stats = {p: {'tr': [], 'vp': [], 'mc_prod': [], 'tableau': [], 'actions_total': 0, 'cards_played': []} for p in players}

    for i, line in enumerate(lines):
        raw = line.rstrip()

        for p in players:
            if re.search(r'\[\d{2}:\d{2}:\d{2}\]\s+' + re.escape(p) + r':', raw):
                current_player = p
                break
            if re.search(r'\]\s+' + re.escape(p) + r'\s+\(', raw):
                current_player = p
                break

        m = re.search(r'Gen\s+(\d+).*?Phase:\s*(\w+).*?Temp:(-?\d+)\s+O2:(\d+)\s+Oceans:(\d+)\s+Venus:(\d+)', raw)
        if m:
            globals_snapshots.append({
                'gen': int(m.group(1)), 'phase': m.group(2),
                'temp': int(m.group(3)), 'o2': int(m.group(4)),
                'oceans': int(m.group(5)), 'venus': int(m.group(6))
            })

        m2 = re.search(r'(\w+)\s+\(\w+\)\s+.*?TR:(\d+)\s+VP:(\d+)\s+Tableau:(\d+)\s+Hand:(\d+)', raw)
        if m2:
            pname = m2.group(1)
            if pname in player_stats:
                player_stats[pname]['tr'].append(int(m2.group(2)))
                player_stats[pname]['vp'].append(int(m2.group(3)))
                player_stats[pname]['tableau'].append(int(m2.group(4)))

        m3 = re.search(r'MC prod:\s*(\d+)\s*->\s*(\d+)', raw)
        if m3 and current_player:
            player_stats[current_player]['mc_prod'].append(int(m3.group(2)))

        m4 = re.search(r'Actions\(game\):\s*\d+\s*->\s*(\d+)', raw)
        if m4 and current_player:
            player_stats[current_player]['actions_total'] = int(m4.group(1))

        m5 = re.search(r'NEW CARDS PLAYED:\s*(.+)', raw)
        if m5 and current_player:
            cards = [c.strip() for c in m5.group(1).split(',')]
            for c in cards:
                all_cards_played.append((gid, current_player, c))
                player_stats[current_player]['cards_played'].append(c)

        m6 = re.search(r'CARDS GONE from hand:\s*(.+)', raw)
        if m6 and current_player:
            cards = [c.strip() for c in m6.group(1).split(',')]
            for c in cards:
                all_cards_gone.append((gid, current_player, c))

    all_globals[gid] = globals_snapshots
    all_player_stats[gid] = player_stats

# =====================================================
# 1. CARD FREQUENCY
# =====================================================
card_counter = Counter()
card_players = defaultdict(list)

for gid, player, card in all_cards_played:
    card_counter[card] += 1
    card_players[card].append((gid, player))

print("=== 1. CARD FREQUENCY (played 2+ times) ===")
multi = [(card, cnt) for card, cnt in card_counter.most_common() if cnt >= 2]
for card, cnt in multi:
    details = ", ".join([f"{g}:{p}" for g, p in card_players[card]])
    print(f"  {card}: {cnt}x -- {details}")

once_cards = [c for c, n in card_counter.items() if n == 1]
print(f"\nCards played exactly once: {len(once_cards)}")
print(f"Cards played 2+ times: {len(multi)}")
print(f"Total unique cards: {len(card_counter)}")
print(f"Total card plays: {sum(card_counter.values())}")

# =====================================================
# 2. SOLD / DISCARDED CARDS
# =====================================================
print("\n=== 2. SOLD/DISCARDED CARDS ===")
played_set = defaultdict(set)
for gid, player, card in all_cards_played:
    played_set[(gid, player)].add(card)

sold_cards = defaultdict(list)
for gid, player, card in all_cards_gone:
    if card not in played_set[(gid, player)]:
        sold_cards[(gid, player)].append(card)

for key in sorted(sold_cards.keys()):
    gid, player = key
    cards = sold_cards[key]
    print(f"  {gid} {player}: {len(cards)} sold -- {chr(10).join(['    ' + c for c in cards])}")

# =====================================================
# 3. GLOBALS PROGRESSION
# =====================================================
print("\n=== 3. GLOBALS PROGRESSION ===")
for gid in ['g1','g2','g3','g4']:
    snaps = all_globals[gid]
    if snaps:
        print(f"  {gid} ({game_meta[gid]['map']}):")
        for s in snaps:
            print(f"    Gen {s['gen']} ({s['phase']}): T={s['temp']} O2={s['o2']} Oc={s['oceans']} V={s['venus']}")

# =====================================================
# 4. ECONOMY STATS
# =====================================================
print("\n=== 4. ECONOMY STATS ===")
for gid in ['g1','g2','g3','g4']:
    print(f"  {gid} ({game_meta[gid]['map']}):")
    for p in game_meta[gid]['players']:
        stats = all_player_stats[gid][p]
        peak_mc = max(stats['mc_prod']) if stats['mc_prod'] else 'N/A'
        peak_vp = max(stats['vp']) if stats['vp'] else 'N/A'
        final_tab = stats['tableau'][-1] if stats['tableau'] else 'N/A'
        actions = stats['actions_total']
        n_played = len(stats['cards_played'])
        fs = final_scores[gid].get(p, {})
        winner_mark = " [W]" if p == game_meta[gid]['winner'] else ""
        print(f"    {p}{winner_mark}: played={n_played} actions={actions} peak_mc_prod={peak_mc} final_tab={final_tab} VP={fs.get('vp','?')} TR={fs.get('tr','?')}")

# =====================================================
# 5. WINNER TABLEAUS
# =====================================================
print("\n=== 5. WINNER TABLEAUS ===")
for gid in ['g1','g2','g3','g4']:
    winner = game_meta[gid]['winner']
    cards = all_player_stats[gid][winner]['cards_played']
    fs = final_scores[gid][winner]
    print(f"  {gid} Winner: {winner} (VP:{fs['vp']} TR:{fs['tr']}) -- {len(cards)} cards:")
    for c in cards:
        print(f"    - {c}")

# =====================================================
# 6. TR TRAJECTORY FOR WINNERS
# =====================================================
print("\n=== 6. TR/VP TRAJECTORY ===")
for gid in ['g1','g2','g3','g4']:
    winner = game_meta[gid]['winner']
    stats = all_player_stats[gid][winner]
    print(f"  {gid} {winner}: TR trajectory = {stats['tr']}")
    print(f"  {gid} {winner}: VP trajectory = {stats['vp']}")

# =====================================================
# 7. DRAFT DATA (Game 4 only)
# =====================================================
print("\n=== 7. DRAFT DATA (g4 only) ===")
with open('tm_g22c1ca96466d_20260223_230524.log', 'r', encoding='utf-8') as f:
    g4_lines = f.readlines()

current_player_g4 = None
draft_data = []
for i, line in enumerate(g4_lines):
    raw = line.rstrip()
    for p in ['Plazma', 'Geekdumb']:
        if re.search(r'\[\d{2}:\d{2}:\d{2}\]\s+' + re.escape(p) + r':', raw):
            current_player_g4 = p
            break
        if re.search(r'\]\s+' + re.escape(p) + r'\s+\(', raw):
            current_player_g4 = p
            break

    m = re.search(r'DRAFT OPTIONS:\s*(.+)', raw)
    if m:
        opts = [c.strip() for c in m.group(1).split(',')]
        draft_data.append({'player': current_player_g4, 'type': 'options', 'cards': opts})

    m = re.search(r'DRAFTED:\s*(.+)', raw)
    if m:
        drafted = [c.strip() for c in m.group(1).split(',')]
        draft_data.append({'player': current_player_g4, 'type': 'drafted', 'cards': drafted})

for d in draft_data:
    print(f"  {d['player']} {d['type']}: {', '.join(d['cards'])}")

print("\nDONE")
