"""
Скриншот недостающих карт с terraforming-mars.herokuapp.com.
Использует Playwright для рендера и скриншота каждой карты.
"""

import json
import re
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
IMAGES_DIR = BASE_DIR / "images"

CARDS_URL = "https://terraforming-mars.herokuapp.com/cards#~mbcp2vCtr~trbgpc~d!"
ALL_CARDS_URL = "https://terraforming-mars.herokuapp.com/cards"

# Card type -> image subdirectory
TYPE_TO_DIR = {
    "corporation": "corporations",
    "prelude": "preludes",
    "active": "project_cards",
    "automated": "project_cards",
    "event": "project_cards",
    "ceo": "ceos",
}


def load_missing_cards():
    """Find cards that have evaluations but no images."""
    with open(DATA_DIR / "evaluations.json", "r", encoding="utf-8") as f:
        evaluations = json.load(f)
    with open(DATA_DIR / "image_mapping.json", "r", encoding="utf-8") as f:
        image_mapping = json.load(f)
    with open(DATA_DIR / "card_index.json", "r", encoding="utf-8") as f:
        card_index = json.load(f)

    missing = []
    for name in evaluations:
        if name not in image_mapping and name in card_index:
            card_type = card_index[name].get("type", "")
            missing.append((name, card_type))

    return missing, image_mapping


def name_to_css_class(name):
    """Convert card name to CSS class used on herokuapp."""
    # Split CamelCase: "AdhaiHighOrbitConstructions" -> "Adhai High Orbit Constructions"
    slug = re.sub(r'(?<=[a-z0-9])(?=[A-Z])', ' ', name)
    slug = slug.lower()
    slug = slug.replace("'", "")
    slug = slug.replace(".", "")
    slug = slug.replace(",", "")
    slug = slug.replace(":", "")
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return f"card-{slug}"


def safe_filename(name):
    """Create safe filename from card name."""
    safe = name.replace(" ", "_").replace("'", "").replace('"', '')
    safe = re.sub(r"[^a-zA-Z0-9_\-]", "", safe)
    return safe


def screenshot_cards_on_page(page, cards_to_find, image_mapping):
    """Screenshot cards found on the current page. Returns (new_mappings, failed)."""
    all_containers = page.query_selector_all(".card-container")
    print(f"Карт на странице: {len(all_containers)}")

    new_mappings = {}
    failed = []

    for name, card_type in cards_to_find:
        css_class = name_to_css_class(name)
        selector = f".{css_class}"

        el = page.query_selector(selector)
        if not el:
            # Normalize name for comparison: strip non-alphanumeric
            norm_name = re.sub(r'[^A-Z0-9]', '', name.upper())
            for container in all_containers:
                title_el = container.query_selector(".card-title")
                if title_el:
                    title_text = title_el.inner_text().strip()
                    title_lines = title_text.split("\n")
                    card_title = title_lines[-1].strip()
                    norm_title = re.sub(r'[^A-Z0-9]', '', card_title.upper())
                    if norm_title == norm_name:
                        el = container
                        break

        if not el:
            failed.append(name)
            print(f"  SKIP: {name} (не найдена на странице)")
            continue

        subdir = TYPE_TO_DIR.get(card_type, "project_cards")
        filename = f"{safe_filename(name)}.png"
        rel_path = f"images/{subdir}/{filename}"
        abs_path = BASE_DIR / rel_path

        try:
            el.screenshot(path=str(abs_path))
            new_mappings[name] = rel_path
            print(f"  OK: {name} -> {rel_path}")
        except Exception as e:
            failed.append(name)
            print(f"  ERR: {name} — {e}")

    return new_mappings, failed


def main():
    missing, image_mapping = load_missing_cards()
    print(f"Недостающих карт: {len(missing)}")

    if not missing:
        print("Все карты уже имеют изображения!")
        return

    # Ensure output directories exist
    for subdir in set(TYPE_TO_DIR.values()):
        (IMAGES_DIR / subdir).mkdir(parents=True, exist_ok=True)

    all_new_mappings = {}
    all_failed = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        # Load ALL cards (no filter) — includes base, Pathfinder, CEO, etc.
        print("Загружаю ВСЕ карты (без фильтра)...")
        page.goto(ALL_CARDS_URL, timeout=120000)
        page.wait_for_selector(".card-container", timeout=60000)
        page.wait_for_timeout(5000)

        new_m, failed = screenshot_cards_on_page(page, missing, image_mapping)
        all_new_mappings.update(new_m)
        all_failed.extend(failed)

        browser.close()

    # Update image_mapping.json with new entries
    if all_new_mappings:
        image_mapping.update(all_new_mappings)
        with open(DATA_DIR / "image_mapping.json", "w", encoding="utf-8") as f:
            json.dump(image_mapping, f, indent=2, ensure_ascii=False)
        print(f"\nimage_mapping.json обновлён: +{len(all_new_mappings)} записей")

    print(f"\nИтого: {len(all_new_mappings)} скриншотов, {len(all_failed)} пропущено")
    if all_failed:
        print(f"Пропущенные: {all_failed}")


if __name__ == "__main__":
    main()
