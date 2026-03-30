import json
import sys

# Read current ratings
with open('extension/ratings.json.js', 'r', encoding='utf-8') as f:
    raw = f.read()

prefix = 'const TM_RATINGS='
idx = raw.index(prefix) + len(prefix)
json_str = raw[idx:].rstrip().rstrip(';')
ratings = json.loads(json_str)
print(f'Current ratings: {len(ratings)}')

# Read unrated scores
with open('/tmp/unrated_scores.json', 'r') as f:
    unrated = json.load(f)
print(f'Unrated cards to add: {len(unrated)}')

# Convert and add
tier_counts = {}
for card in unrated:
    ev = card['ev']
    if ev > 40:
        tier, score = 'S', min(95, 85 + int(ev / 5))
    elif ev > 25:
        tier, score = 'A', min(89, 78 + int(ev / 4))
    elif ev > 15:
        tier, score = 'B', min(79, 70 + int(ev / 3))
    elif ev > 5:
        tier, score = 'C', min(69, 55 + int(ev / 2))
    elif ev > -5:
        tier, score = 'D', min(54, 35 + int((ev + 5) * 3))
    else:
        tier, score = 'F', max(5, 25 + int(ev))

    score = max(5, min(95, score))

    ratings[card['name']] = {
        's': score, 't': tier,
        'y': [],
        'w': 'Auto-rated by baseline model. No COTD data.',
        'e': f"cost {card['cost']}, baseline EV={round(card['ev'], 1)}"
    }
    tier_counts[tier] = tier_counts.get(tier, 0) + 1

# Write back
with open('extension/ratings.json.js', 'w', encoding='utf-8') as f:
    f.write(prefix + json.dumps(ratings, ensure_ascii=False) + ';\n')

print(f'Added {len(unrated)} ratings. Total: {len(ratings)}')
print('Distribution by tier:')
for t in ['S', 'A', 'B', 'C', 'D', 'F']:
    print(f'  {t}: {tier_counts.get(t, 0)}')

# Show some examples per tier
print('\nExamples:')
for card in unrated[:3]:
    print(f'  Top: {card["name"]} EV={round(card["ev"],1)}')
for card in unrated[-3:]:
    print(f'  Bottom: {card["name"]} EV={round(card["ev"],1)}')
