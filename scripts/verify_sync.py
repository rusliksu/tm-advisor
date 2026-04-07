"""Quick check: evaluations.json vs extension ratings.json.js"""
import json, os
from lib.generated_extension_data import load_generated_extension_object

DATA = os.path.join(os.path.dirname(__file__), '..', 'data')

with open(os.path.join(DATA, 'evaluations.json'), encoding='utf-8') as f:
    evals = json.load(f)

ratings = load_generated_extension_object('ratings.json.js', 'TM_RATINGS')

print(f"evaluations.json: {len(evals)} | ratings.json.js: {len(ratings)}")

miss = 0
diff = 0
for key, card in evals.items():
    name = card.get('name', key)
    score = card.get('score')
    if score is None:
        continue
    if name not in ratings:
        miss += 1
    elif ratings[name]['s'] != score:
        diff += 1

print(f"Missing in extension: {miss}")
print(f"Score differences: {diff}")
print("OK" if miss == 0 and diff == 0 else "OUT OF SYNC")
