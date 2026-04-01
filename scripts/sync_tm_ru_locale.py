import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
TM_RU_DIR = Path(r"C:\Users\Ruslan\tm\terraforming-mars\src\locales\ru")

CARD_INDEX_PATH = DATA_DIR / "card_index.json"
CARD_NAMES_RU_PATH = DATA_DIR / "card_names_ru.json"

LOCALE_FILES = [
    "cards.json",
    "underworld_cards.json",
    "corporations.json",
    "preludes.json",
    "UI_cards.json",
    "prelude_cards.json",
    "prelude_corporations.json",
    "prelude2_cards.json",
    "prelude2_corporations.json",
    "venus_next_cards.json",
    "venus_next_corporations.json",
    "colonies_cards.json",
    "colonies_corporations.json",
    "turmoil_cards.json",
    "turmoil_corporations.json",
    "promo.json",
]


def load_locale_strings():
    strings: dict[str, str] = {}
    for filename in LOCALE_FILES:
        path = TM_RU_DIR / filename
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for key, value in data.items():
            if isinstance(key, str) and isinstance(value, str) and value.strip():
                strings[key] = value
    return strings


def main():
    locale_strings = load_locale_strings()
    card_index = json.loads(CARD_INDEX_PATH.read_text(encoding="utf-8"))
    card_names_ru = json.loads(CARD_NAMES_RU_PATH.read_text(encoding="utf-8"))

    names_updated = 0
    descriptions_updated = 0

    for name, card in card_index.items():
        if name in locale_strings:
            translated_name = locale_strings[name]
            if card_names_ru.get(name) != translated_name:
                card_names_ru[name] = translated_name
                names_updated += 1

        description = card.get("description")
        if description and description in locale_strings:
            translated_desc = locale_strings[description]
            if card.get("description_ru") != translated_desc:
                card["description_ru"] = translated_desc
                descriptions_updated += 1

    CARD_INDEX_PATH.write_text(json.dumps(card_index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    CARD_NAMES_RU_PATH.write_text(json.dumps(card_names_ru, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"RU names updated: {names_updated}")
    print(f"RU descriptions updated: {descriptions_updated}")


if __name__ == "__main__":
    main()
