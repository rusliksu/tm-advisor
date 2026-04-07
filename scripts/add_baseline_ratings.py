import json
import sys
from lib.generated_extension_data import (
    load_generated_extension_object,
    write_generated_extension_file,
)

# Read current ratings
ratings = load_generated_extension_object('ratings.json.js', 'TM_RATINGS')
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
canonical, legacy = write_generated_extension_file(
    'ratings.json.js',
    'const TM_RATINGS = ' + json.dumps(ratings, ensure_ascii=False) + ';\n',
)

print(f'Added {len(unrated)} ratings. Total: {len(ratings)}')
print(f'Canonical: {canonical}')
print(f'Legacy mirror: {legacy}')
print('Distribution by tier:')
for t in ['S', 'A', 'B', 'C', 'D', 'F']:
    print(f'  {t}: {tier_counts.get(t, 0)}')

# Show some examples per tier
print('\nExamples:')
for card in unrated[:3]:
    print(f'  Top: {card["name"]} EV={round(card["ev"],1)}')
for card in unrated[-3:]:
    print(f'  Bottom: {card["name"]} EV={round(card["ev"],1)}')
