"""
Build minified data files for TM Tier Overlay Chrome Extension.

Reads evaluations.json, combos.json, card_names_ru.json
and produces ratings.json.js and combos.json.js wrapped as JS variables.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
TM_DATA_EXT_DIR = ROOT / "packages" / "tm-data" / "generated" / "extension"
LEGACY_EXT_DATA_DIR = ROOT / "extension" / "data"


def build_ratings():
    with (DATA_DIR / "evaluations.json").open("r", encoding="utf-8") as f:
        evaluations = json.load(f)

    ratings = {}
    for key, card in evaluations.items():
        name = card.get("name", key)
        score = card.get("score")
        tier = card.get("tier")
        if score is not None and tier:
            entry = {"s": score, "t": tier}

            opening_bias = card.get("opening_hand_bias")
            if isinstance(opening_bias, int) and opening_bias != 0:
                entry["o"] = opening_bias

            opening_note = card.get("opening_hand_note", "")
            if opening_note:
                if len(opening_note) > 120:
                    opening_note = opening_note[:117] + "..."
                entry["on"] = opening_note

            syn = card.get("synergies", [])
            if syn:
                entry["y"] = syn[:5]

            wtp = card.get("when_to_pick", "")
            if wtp:
                if len(wtp) > 120:
                    wtp = wtp[:117] + "..."
                entry["w"] = wtp

            desc_ru = card.get("description_ru", "")
            if desc_ru:
                entry["dr"] = desc_ru

            eco = card.get("economy", "")
            if eco:
                first = eco.split(".")[0].strip()
                if len(first) > 100:
                    first = first[:97] + "..."
                entry["e"] = first

            ratings[name] = entry

    return ratings


def build_combos():
    with (DATA_DIR / "combos.json").open("r", encoding="utf-8") as f:
        combos = json.load(f)

    return [
        {
            "cards": combo["cards"],
            "r": combo.get("rating", ""),
            "v": combo.get("value", ""),
        }
        for combo in combos
    ]


def build_ru_names():
    path = DATA_DIR / "card_names_ru.json"
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_js(filename, var_name, data):
    TM_DATA_EXT_DIR.mkdir(parents=True, exist_ok=True)
    LEGACY_EXT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    json_str = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    js_content = f"const {var_name}={json_str};\n"
    for target in (TM_DATA_EXT_DIR / filename, LEGACY_EXT_DATA_DIR / filename):
        target.write_text(js_content, encoding="utf-8")
        size_kb = target.stat().st_size / 1024
        print(f"  {target}: {len(data)} entries, {size_kb:.1f} KB")


def main() -> int:
    print("Building extension data...")

    ratings = build_ratings()
    write_js("ratings.json.js", "TM_RATINGS", ratings)

    combos = build_combos()
    write_js("combos.json.js", "TM_COMBOS", combos)

    ru_names = build_ru_names()
    write_js("names_ru.json.js", "TM_NAMES_RU", ru_names)

    print(f"\nDone! {len(ratings)} cards, {len(combos)} combos, {len(ru_names)} RU names")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
