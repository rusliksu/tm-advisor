"""
Build minified data files for TM Tier Overlay Chrome Extension.

Reads evaluations.json, combos.json, card_names_ru.json
and produces ratings.json.js and combos.json.js wrapped as JS variables.
"""

import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
EXT_DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'extension', 'data')


def build_ratings():
    """Extract name → {s: score, t: tier} from evaluations.json"""
    with open(os.path.join(DATA_DIR, 'evaluations.json'), 'r', encoding='utf-8') as f:
        evaluations = json.load(f)

    ratings = {}
    for key, card in evaluations.items():
        name = card.get('name', key)
        score = card.get('score')
        tier = card.get('tier')
        if score is not None and tier:
            entry = {"s": score, "t": tier}

            # Short synergies (max 5, truncated)
            syn = card.get('synergies', [])
            if syn:
                entry["y"] = syn[:5]

            # When to pick (truncated to ~120 chars)
            wtp = card.get('when_to_pick', '')
            if wtp:
                if len(wtp) > 120:
                    wtp = wtp[:117] + '...'
                entry["w"] = wtp

            # Economy one-liner (truncated to ~100 chars)
            eco = card.get('economy', '')
            if eco:
                # Take first sentence
                first = eco.split('.')[0].strip()
                if len(first) > 100:
                    first = first[:97] + '...'
                entry["e"] = first

            ratings[name] = entry

    return ratings


def build_combos():
    """Extract combo data: cards[] + rating + value (short)"""
    with open(os.path.join(DATA_DIR, 'combos.json'), 'r', encoding='utf-8') as f:
        combos = json.load(f)

    result = []
    for combo in combos:
        result.append({
            "cards": combo["cards"],
            "r": combo.get("rating", ""),
            "v": combo.get("value", ""),
        })
    return result


def build_ru_names():
    """Load Russian card name translations"""
    path = os.path.join(DATA_DIR, 'card_names_ru.json')
    if not os.path.exists(path):
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def write_js(filename, var_name, data):
    """Write JSON data wrapped as a JS const"""
    os.makedirs(EXT_DATA_DIR, exist_ok=True)
    json_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    js_content = f"const {var_name}={json_str};\n"
    path = os.path.join(EXT_DATA_DIR, filename)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(js_content)
    size_kb = os.path.getsize(path) / 1024
    print(f"  {filename}: {len(data)} entries, {size_kb:.1f} KB")


def main():
    print("Building extension data...")

    ratings = build_ratings()
    write_js('ratings.json.js', 'TM_RATINGS', ratings)

    combos = build_combos()
    write_js('combos.json.js', 'TM_COMBOS', combos)

    ru_names = build_ru_names()
    write_js('names_ru.json.js', 'TM_NAMES_RU', ru_names)

    print(f"\nDone! {len(ratings)} cards, {len(combos)} combos, {len(ru_names)} RU names")


if __name__ == '__main__':
    main()
