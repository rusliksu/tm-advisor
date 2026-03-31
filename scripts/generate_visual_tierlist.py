"""
Генератор визуальных HTML тир-листов для Terraforming Mars.
Создаёт 3 standalone HTML файла: корпорации, прелюдии, проектные карты.
Поддержка --ru для русских названий карт.
"""

import json
import os
import sys
import html
from pathlib import Path

from PIL import Image

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"
SPRITES_DIR = OUTPUT_DIR / "sprites"

LANG_RU = "--ru" in sys.argv

# Image prefix: HTML files live in output/, images in images/ — so relative path is ../
IMG_PREFIX = ".."

TIER_ORDER = ["S", "A", "B", "C", "D", "F"]
TIER_COLORS = {
    "S": "#FF7F7F",
    "A": "#FFBF7F",
    "B": "#FFDF7F",
    "C": "#BFFF7F",
    "D": "#7FFF7F",
    "F": "#CCCCCC",
}

CARD_TYPES = {
    "corporations": {"title": "Тир-лист корпораций", "title_en": "Corporations Tier List", "types": {"corporation"}},
    "preludes": {"title": "Тир-лист прелюдий", "title_en": "Preludes Tier List", "types": {"prelude"}},
    "projects": {"title": "Тир-лист проектных карт", "title_en": "Project Cards Tier List", "types": {"active", "automated", "event"}},
    "ceos": {"title": "Тир-лист CEO", "title_en": "CEOs Tier List", "types": {"ceo"}},
}

NAV_LINKS = {
    "corporations": {"label_ru": "Корпорации", "label_en": "Corporations"},
    "preludes": {"label_ru": "Прелюдии", "label_en": "Preludes"},
    "projects": {"label_ru": "Проекты", "label_en": "Projects"},
    "ceos": {"label_ru": "CEO", "label_en": "CEOs"},
}

TAG_ICONS = {
    "Animal": "animal.png", "Building": "building.png", "City": "city.png",
    "Earth": "earth.png", "Event": "event.png", "Jovian": "jovian.png",
    "Mars": "mars.png", "Microbe": "microbe.png", "Plant": "plant.png",
    "Power": "power.png", "Science": "science.png", "Space": "space.png",
    "Venus": "venus.png", "Wild": "wild.png",
}

EXPANSION_ICONS = {
    "Colonies": "expansion_icon_colonies.png",
    "Corporate Era": "expansion_icon_corporateEra.png",
    "Prelude": "expansion_icon_prelude.png",
    "Prelude 2": "expansion_icon_prelude2.png",
    "Promo": "expansion_icon_promo.png",
    "Turmoil": "expansion_icon_turmoil.png",
    "Venus Next": "expansion_icon_venus.png",
    "Pathfinders": "expansion_icon_pathfinders.png",
    "CEOs": "expansion_icon_ceos.png",
}


def load_data():
    with open(DATA_DIR / "evaluations.json", "r", encoding="utf-8") as f:
        evaluations = json.load(f)
    with open(DATA_DIR / "card_index.json", "r", encoding="utf-8") as f:
        card_index = json.load(f)
    with open(DATA_DIR / "image_mapping.json", "r", encoding="utf-8") as f:
        image_mapping = json.load(f)
    names_ru = {}
    if LANG_RU:
        ru_path = DATA_DIR / "card_names_ru.json"
        if ru_path.exists():
            with open(ru_path, "r", encoding="utf-8") as f:
                names_ru = json.load(f)
    return evaluations, card_index, image_mapping, names_ru


def get_cards_for_category(category, evaluations, card_index, names_ru=None):
    """Фильтрует карты по категории и группирует по тирам."""
    allowed_types = CARD_TYPES[category]["types"]
    tiers = {t: [] for t in TIER_ORDER}
    names_ru = names_ru or {}

    for name, ev in evaluations.items():
        card_type = card_index.get(name, {}).get("type", "")
        if card_type not in allowed_types:
            if name not in card_index:
                continue
            continue

        tier = ev.get("tier", "C")
        if tier not in tiers:
            tier = "C"

        card_info = card_index.get(name, {})
        tiers[tier].append({
            "name": name,
            "name_ru": names_ru.get(name, ""),
            "score": ev.get("score", 0),
            "tier": tier,
            "economy": ev.get("economy", ""),
            "reasoning": ev.get("reasoning", ""),
            "synergies": ev.get("synergies", []),
            "when_to_pick": ev.get("when_to_pick", ""),
            "cost": card_info.get("cost", ""),
            "tags": card_info.get("tags", []),
            "card_type": card_info.get("type", ""),
            "expansion": card_info.get("expansion", ""),
            "description": card_info.get("description", ""),
            "description_ru": card_info.get("description_ru", ""),
            "requirements": card_info.get("requirements", ""),
            "vp": card_info.get("victoryPoints", ""),
            "cotd_url": ev.get("cotd_url", ""),
        })

    for tier in tiers:
        tiers[tier].sort(key=lambda c: -c["score"])

    return tiers


def escape(text):
    """HTML-escape text."""
    if isinstance(text, list):
        text = ", ".join(str(x) for x in text)
    return html.escape(str(text)) if text else ""


def build_nav_html(current_category):
    """Генерирует навигационный бар."""
    suffix = "_ru" if LANG_RU else ""
    alt_suffix = "" if LANG_RU else "_ru"
    lang_label = "EN" if LANG_RU else "RU"
    back_label = "← Назад" if LANG_RU else "← Back"

    nav_items = []
    for cat, info in NAV_LINKS.items():
        label = info["label_ru"] if LANG_RU else info["label_en"]
        if cat == current_category:
            nav_items.append(f'<span class="nav-link active">{label}</span>')
        else:
            nav_items.append(f'<a class="nav-link" href="tierlist_{cat}{suffix}.html">{label}</a>')

    alt_file = f"tierlist_{current_category}{alt_suffix}.html"

    return f"""<nav class="top-nav">
    <a class="nav-link nav-back" href="../index.html">{back_label}</a>
    <div class="nav-links">{''.join(nav_items)}</div>
    <a class="nav-link nav-lang" href="{alt_file}">{lang_label}</a>
</nav>"""


def get_all_tags_and_expansions(tiers):
    """Собирает уникальные теги и дополнения для фильтров."""
    tags = set()
    expansions = set()
    for cards in tiers.values():
        for card in cards:
            for t in card.get("tags", []):
                tags.add(t)
            exp = card.get("expansion", "")
            if exp:
                expansions.add(exp)
    return sorted(tags), sorted(expansions)


def build_cross_page_map(evaluations, card_index):
    """Build mapping: card_name -> page filename for cross-page synergy links."""
    suffix = "_ru" if LANG_RU else ""
    type_to_page = {
        "corporation": f"tierlist_corporations{suffix}.html",
        "prelude": f"tierlist_preludes{suffix}.html",
        "ceo": f"tierlist_ceos{suffix}.html",
    }
    project_page = f"tierlist_projects{suffix}.html"
    cross_map = {}
    for name in evaluations:
        card_type = card_index.get(name, {}).get("type", "")
        if card_type in ("active", "automated", "event"):
            cross_map[name] = project_page
        elif card_type in type_to_page:
            cross_map[name] = type_to_page[card_type]
    return cross_map


def build_sprite_atlas(category, tiers, image_mapping):
    """Build a single sprite sheet for card thumbnails on the tier page."""
    thumb_w = 80
    thumb_h = 100
    cols = 12

    cards_in_order = []
    for tier in TIER_ORDER:
        cards_in_order.extend(tiers.get(tier, []))

    sprite_entries = {}
    sprite_cards = []
    for card in cards_in_order:
        img_path = image_mapping.get(card["name"], "")
        if not img_path:
            continue
        abs_path = BASE_DIR / img_path
        if not abs_path.exists():
            continue
        sprite_entries[card["name"]] = len(sprite_cards)
        sprite_cards.append((card["name"], abs_path))

    if not sprite_cards:
        return {"path": "", "sheet_width": 0, "sheet_height": 0, "thumb_width": thumb_w, "thumb_height": thumb_h, "coords": {}}

    rows = (len(sprite_cards) + cols - 1) // cols
    sheet_w = cols * thumb_w
    sheet_h = rows * thumb_h
    atlas = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
    coords = {}

    for idx, (card_name, abs_path) in enumerate(sprite_cards):
        col = idx % cols
        row = idx // cols
        x = col * thumb_w
        y = row * thumb_h
        try:
            with Image.open(abs_path) as src:
                src = src.convert("RGBA")
                src.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
                paste_x = x + (thumb_w - src.width) // 2
                paste_y = y + (thumb_h - src.height) // 2
                atlas.alpha_composite(src, (paste_x, paste_y))
                coords[card_name] = {"x": x, "y": y}
        except OSError:
            continue

    SPRITES_DIR.mkdir(parents=True, exist_ok=True)
    sprite_name = f"tierlist_{category}_cards.webp"
    sprite_path = SPRITES_DIR / sprite_name
    atlas.save(sprite_path, format="WEBP", quality=82, method=6)

    return {
        "path": f"sprites/{sprite_name}",
        "sheet_width": sheet_w,
        "sheet_height": sheet_h,
        "thumb_width": thumb_w,
        "thumb_height": thumb_h,
        "coords": coords,
    }


def generate_html(category, tiers, image_mapping, cross_page_map=None):
    """Генерирует standalone HTML для одной категории."""
    title = CARD_TYPES[category]["title"] if LANG_RU else CARD_TYPES[category]["title_en"]
    total_cards = sum(len(cards) for cards in tiers.values())
    nav_html = build_nav_html(category)
    all_tags, all_expansions = get_all_tags_and_expansions(tiers)
    sprite_atlas = build_sprite_atlas(category, tiers, image_mapping)

    # Build image paths map for JS
    img_paths = {}
    for cards in tiers.values():
        for card in cards:
            img = image_mapping.get(card["name"], "")
            if img:
                img_paths[card["name"]] = IMG_PREFIX + "/" + img.replace("\\", "/")
    img_paths_json = json.dumps(img_paths, ensure_ascii=False)

    # Build cards data as JSON for the modal
    cards_json = {}
    for tier, cards in tiers.items():
        for card in cards:
            cards_json[card["name"]] = card

    cards_data = json.dumps(cards_json, ensure_ascii=False)

    # Cross-page card lookup for synergy links
    cross_page_json = json.dumps(cross_page_map or {}, ensure_ascii=False)

    # Tag icon mapping for JS
    tag_icons_json = json.dumps(TAG_ICONS, ensure_ascii=False)
    expansion_icons_json = json.dumps(EXPANSION_ICONS, ensure_ascii=False)

    # Build filter HTML
    search_placeholder = "Поиск по имени..." if LANG_RU else "Search by name..."
    filter_label_tags = "Теги" if LANG_RU else "Tags"
    filter_label_exp = "Дополнение" if LANG_RU else "Expansion"
    filter_label_tier = "Тир" if LANG_RU else "Tier"
    reset_label = "Сбросить" if LANG_RU else "Reset"
    search_btn_label = "Найти" if LANG_RU else "Search"

    no_tag_label = "Без тегов" if LANG_RU else "No tags"
    tag_options = f'<label class="filter-chip" data-tag="_none">{no_tag_label}</label>'
    for t in all_tags:
        icon_file = TAG_ICONS.get(t, "")
        icon_html = f'<img src="{IMG_PREFIX}/images/tags/{icon_file}" class="filter-icon" alt="">' if icon_file else ""
        tag_options += f'<label class="filter-chip" data-tag="{escape(t)}">{icon_html}{escape(t)}</label>'

    exp_options = ""
    for e in all_expansions:
        icon_file = EXPANSION_ICONS.get(e, "")
        icon_html = f'<img src="{IMG_PREFIX}/images/expansions/{icon_file}" class="filter-icon" alt="">' if icon_file else ""
        exp_options += f'<label class="filter-chip" data-expansion="{escape(e)}">{icon_html}{escape(e)}</label>'

    tier_options = ""
    jump_buttons = ""
    for t in TIER_ORDER:
        if tiers[t]:
            tier_options += f'<label class="filter-chip filter-tier" data-tier="{t}" style="--tier-color:{TIER_COLORS[t]}">{t}</label>'
            jump_buttons += f'<a class="jump-btn" href="#tier-{t}" style="background:{TIER_COLORS[t]}">{t}</a>'

    # Legend for project card types
    legend_html = ""
    if category == "projects":
        auto_label = "Автоматическая" if LANG_RU else "Automated"
        active_label = "Активная" if LANG_RU else "Active"
        event_label = "Событие" if LANG_RU else "Event"
        legend_html = f"""
        <div class="filter-group">
            <div class="filter-label">{"Тип" if LANG_RU else "Type"}</div>
            <div class="filter-chips">
                <span class="legend-item"><span class="legend-dot" style="background:#4caf50"></span>{auto_label}</span>
                <span class="legend-item"><span class="legend-dot" style="background:#2196f3"></span>{active_label}</span>
                <span class="legend-item"><span class="legend-dot" style="background:#f44336"></span>{event_label}</span>
            </div>
        </div>"""

    scroll_label = "Перейти" if LANG_RU else "Jump to"
    sort_label = "Сортировка" if LANG_RU else "Sort"
    sort_score = "По оценке" if LANG_RU else "By score"
    sort_cost = "По стоимости" if LANG_RU else "By cost"
    sort_name = "По имени" if LANG_RU else "By name"

    filters_html = f"""
    <div class="filters">
        <div class="search-row">
            <input type="text" id="searchInput" class="search-input" placeholder="{search_placeholder}">
            <button class="search-btn" id="runSearch">{search_btn_label}</button>
            <select id="sortSelect" class="sort-select" title="{sort_label}">
                <option value="score">{sort_score}</option>
                <option value="cost">{sort_cost}</option>
                <option value="name">{sort_name}</option>
            </select>
            <div class="jump-row"><span class="jump-label">{scroll_label}</span>{jump_buttons}</div>
            <button class="reset-btn" id="resetFilters">{reset_label}</button>
        </div>
        <div class="filter-group">
            <div class="filter-label">{filter_label_tier}</div>
            <div class="filter-chips" id="tierFilters">{tier_options}</div>
        </div>
        <div class="filter-group">
            <div class="filter-label">{filter_label_tags}</div>
            <div class="filter-chips" id="tagFilters">{tag_options}</div>
        </div>
        <div class="filter-group">
            <div class="filter-label">{filter_label_exp}</div>
            <div class="filter-chips" id="expFilters">{exp_options}</div>
        </div>{legend_html}
        <div class="filter-count" id="filterCount"></div>
    </div>"""

    # Build HTML rows
    rows_html = []
    for tier in TIER_ORDER:
        cards = tiers[tier]
        if not cards:
            continue

        color = TIER_COLORS[tier]

        cards_html_parts = []
        for card in cards:
            img_path = image_mapping.get(card["name"], "")
            display_name = card.get("name_ru") or card["name"] if LANG_RU else card["name"]
            sprite_meta = sprite_atlas["coords"].get(card["name"])
            if sprite_meta and sprite_atlas["path"]:
                img_tag = (
                    f'<div class="card-thumb" aria-label="{escape(display_name)}" role="img" '
                    f'style="background-image:url(\'{escape(sprite_atlas["path"])}\');'
                    f'background-size:{sprite_atlas["sheet_width"]}px {sprite_atlas["sheet_height"]}px;'
                    f'background-position:-{sprite_meta["x"]}px -{sprite_meta["y"]}px"></div>'
                )
            elif img_path:
                rel_path = IMG_PREFIX + "/" + img_path.replace("\\", "/")
                img_tag = f'<img src="{escape(rel_path)}" alt="{escape(display_name)}" loading="lazy">'
            else:
                img_tag = f'<div class="placeholder">{escape(display_name)}</div>'

            tooltip = f'{escape(display_name)} — {card["score"]}'
            tags_attr = ",".join(card.get("tags", []))
            exp_attr = card.get("expansion", "")

            card_type_cls = f' ctype-{card["card_type"]}' if card.get("card_type") else ""
            cards_html_parts.append(
                f'<div class="card{card_type_cls}" data-name="{escape(card["name"])}" '
                f'data-tags="{escape(tags_attr)}" data-expansion="{escape(exp_attr)}" '
                f'data-score="{card["score"]}">'
                f'{img_tag}'
                f'<div class="card-score" style="background:{TIER_COLORS[tier]};color:#101828">{card["score"]}</div>'
                f'<div class="card-tooltip">{escape(display_name)}'
                f'{" · " + str(card["cost"]) + " MC" if card.get("cost") else ""}'
                f'</div>'
                f'</div>'
            )

        cards_html = "\n".join(cards_html_parts)

        rows_html.append(f"""
        <div class="tier-row" id="tier-{tier}" data-tier="{tier}">
            <div class="tier-label" style="background-color: {color}">
                <span class="tier-letter">{tier}</span>
                <span class="tier-count">{len(cards)}</span>
            </div>
            <div class="tier-cards">
                {cards_html}
            </div>
        </div>
        """)

    all_rows = "\n".join(rows_html)

    # Localized modal labels
    l_req = "Требования" if LANG_RU else "Requirements"
    l_vp = "Победные очки" if LANG_RU else "Victory Points"
    l_tags = "Теги" if LANG_RU else "Tags"
    l_desc = "Описание" if LANG_RU else "Description"
    l_econ = "Экономика" if LANG_RU else "Economy"
    l_analysis = "Анализ" if LANG_RU else "Analysis"
    l_synergies = "Синергии" if LANG_RU else "Synergies"
    l_when = "Когда брать" if LANG_RU else "When to Pick"
    l_display_name = "card.name_ru || card.name" if LANG_RU else "card.name"
    l_subtitle = "card.name_ru ? card.name : ''" if LANG_RU else "card.name_ru || ''"
    l_shown = "Показано" if LANG_RU else "Shown"
    l_of = "из" if LANG_RU else "of"

    return f"""<!DOCTYPE html>
<html lang="{"ru" if LANG_RU else "en"}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{escape(title)} — Terraforming Mars</title>
<meta property="og:title" content="{escape(title)} — Terraforming Mars">
<meta property="og:description" content="{"Тир-лист карт Terraforming Mars для формата 3P / WGT / Все дополнения" if LANG_RU else "Terraforming Mars card tier list for 3P / WGT / All Expansions"}">
<meta property="og:type" content="website">
<style>
* {{
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}}

body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    min-height: 100vh;
}}

.top-nav {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #0f1a2e;
    padding: 8px 20px;
    border-bottom: 1px solid #0f3460;
}}

.nav-links {{
    display: flex;
    gap: 4px;
}}

.nav-link {{
    padding: 5px 14px;
    font-size: 13px;
    color: #aaa;
    text-decoration: none;
    border-radius: 4px;
    transition: background 0.2s, color 0.2s;
}}

.nav-link:hover {{
    background: #16213e;
    color: #e0e0e0;
}}

.nav-link.active {{
    background: #c01640;
    color: #fff;
    cursor: default;
}}

.nav-back {{
    font-weight: 500;
}}

.nav-lang {{
    background: #16213e;
    border: 1px solid #0f3460;
}}

.nav-lang:hover {{
    border-color: #e94560;
    color: #e94560;
}}

.header {{
    background: #16213e;
    padding: 20px 30px;
    border-bottom: 2px solid #0f3460;
}}

.header h1 {{
    font-size: 24px;
    color: #e94560;
    margin-bottom: 4px;
}}

.header .subtitle {{
    font-size: 13px;
    color: #aaa;
}}

.header .hint {{
    color: #e0607a;
}}

/* Filters */
.filters {{
    background: #16213e;
    padding: 14px 20px;
    border-bottom: 1px solid #0f3460;
    position: sticky;
    top: 0;
    z-index: 100;
}}

.search-row {{
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
}}

.search-input {{
    flex: 1;
    padding: 7px 12px;
    border: 1px solid #0f3460;
    border-radius: 4px;
    background: #1a1a2e;
    color: #e0e0e0;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
}}

.search-input:focus {{
    border-color: #e94560;
}}

.sort-select {{
    padding: 7px 12px;
    border: 1px solid #0f3460;
    border-radius: 4px;
    background: #1a1a2e;
    color: #aaa;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
}}

.sort-select:hover, .sort-select:focus {{
    border-color: #e94560;
    color: #e0e0e0;
    outline: none;
}}

.search-btn,
.reset-btn {{
    padding: 7px 16px;
    border: 1px solid #0f3460;
    border-radius: 4px;
    background: #1a1a2e;
    color: #888;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
}}

.search-btn {{
    background: #22365f;
    border-color: #35548b;
    color: #f3f7ff;
    font-weight: 700;
}}

.search-btn:hover {{
    background: #2c4a7c;
    border-color: #e94560;
    color: #fff;
}}

.reset-btn:hover {{
    border-color: #e94560;
    color: #e94560;
}}

.filter-group {{
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    flex-wrap: wrap;
}}

.filter-label {{
    font-size: 12px;
    color: #aaa;
    min-width: 70px;
    text-transform: uppercase;
    font-weight: 600;
}}

.filter-chips {{
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}}

.filter-chip {{
    padding: 3px 10px;
    border: 1px solid #0f3460;
    border-radius: 12px;
    font-size: 12px;
    color: #aaa;
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 4px;
}}

.filter-chip:hover {{
    border-color: #e94560;
    color: #e0e0e0;
}}

.filter-chip.active {{
    background: #e94560;
    border-color: #e94560;
    color: #fff;
}}

.filter-tier.active {{
    background: var(--tier-color);
    border-color: var(--tier-color);
    color: #1a1a2e;
}}

.filter-icon {{
    height: 14px;
    width: 14px;
    object-fit: contain;
}}

.filter-count {{
    font-size: 12px;
    color: #666;
    margin-top: 4px;
}}

.jump-row {{
    display: flex;
    align-items: center;
    gap: 3px;
}}

.jump-label {{
    font-size: 11px;
    color: #999;
    margin-right: 2px;
}}

.jump-btn {{
    width: 22px;
    height: 22px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: bold;
    color: #1a1a2e;
    text-decoration: none;
    transition: opacity 0.2s;
}}

.jump-btn:hover {{
    opacity: 0.7;
}}

.legend-item {{
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #aaa;
    padding: 3px 0;
}}

.legend-dot {{
    width: 20px;
    height: 3px;
    border-radius: 2px;
    flex-shrink: 0;
}}

.container {{
    padding: 20px;
    max-width: 1600px;
    margin: 0 auto;
}}

.tier-row {{
    display: flex;
    margin-bottom: 4px;
    min-height: 120px;
    background: #16213e;
    border-radius: 4px;
    overflow: visible;
    scroll-margin-top: 160px;
}}

.tier-row.hidden {{
    display: none;
}}

.tier-label {{
    width: 80px;
    min-width: 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    color: #1a1a2e;
    user-select: none;
}}

.tier-letter {{
    font-size: 32px;
    line-height: 1;
}}

.tier-count {{
    font-size: 12px;
    margin-top: 4px;
    opacity: 0.7;
}}

.tier-cards {{
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    padding: 6px;
    gap: 6px;
    flex: 1;
}}

.card {{
    position: relative;
    cursor: pointer;
    border-radius: 4px;
    overflow: hidden;
    transition: transform 0.15s, box-shadow 0.15s, opacity 0.2s;
    background: #0f3460;
    flex-shrink: 0;
}}

.card:hover {{
    transform: scale(1.08);
    box-shadow: 0 4px 20px rgba(233, 69, 96, 0.4);
    z-index: 10;
}}

.card.filtered-out {{
    display: none;
}}

@keyframes card-pulse {{
    0%, 100% {{ box-shadow: 0 0 0 0 rgba(233, 69, 96, 0); }}
    50% {{ box-shadow: 0 0 0 4px rgba(233, 69, 96, 0.6); }}
}}
.card.highlight {{
    animation: card-pulse 0.7s ease 3;
    z-index: 10;
}}

.card img,
.card-thumb {{
    height: 100px;
    width: 80px;
    display: block;
}}

.card-thumb {{
    background-repeat: no-repeat;
    background-color: #0a1628;
    image-rendering: auto;
}}

.card .placeholder {{
    height: 100px;
    width: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-size: 10px;
    padding: 4px;
    color: #aaa;
    background: #0a1628;
    line-height: 1.2;
}}

.card-score {{
    position: absolute;
    bottom: 2px;
    right: 2px;
    font-size: 11px;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.7);
    box-shadow: 0 2px 8px rgba(0,0,0,0.45);
}}

/* Card type colors (project cards) */
.card.ctype-automated {{
    border-bottom: 3px solid #4caf50;
}}

.card.ctype-active {{
    border-bottom: 3px solid #2196f3;
}}

.card.ctype-event {{
    border-bottom: 3px solid #f44336;
}}

/* Card hover tooltip */
.card-tooltip {{
    position: absolute;
    bottom: -28px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.9);
    color: #e0e0e0;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 3px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 20;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
}}

.card:hover .card-tooltip {{
    opacity: 1;
}}

/* Modal */
.modal-overlay {{
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.7);
    z-index: 1000;
    justify-content: center;
    align-items: center;
}}

.modal-overlay.active {{
    display: flex;
}}

.modal {{
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 8px;
    max-width: 750px;
    width: 95%;
    max-height: 90vh;
    overflow-y: auto;
    padding: 24px;
    position: relative;
}}

.modal-close {{
    position: absolute;
    top: 12px;
    right: 16px;
    font-size: 24px;
    cursor: pointer;
    color: #888;
    background: none;
    border: none;
    line-height: 1;
}}

.modal-close:hover {{
    color: #e94560;
}}

.modal-nav {{
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(15, 52, 96, 0.9);
    border: 1px solid #0f3460;
    color: #aaa;
    font-size: 28px;
    width: 36px;
    height: 60px;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    z-index: 1001;
    padding: 0;
    line-height: 1;
}}

.modal-nav:hover {{
    color: #e94560;
    border-color: #e94560;
}}

.modal-nav.prev {{
    left: -44px;
}}

.modal-nav.next {{
    right: -44px;
}}

@media (max-width: 850px) {{
    .modal-nav.prev {{
        left: 4px;
    }}
    .modal-nav.next {{
        right: 4px;
    }}
    .modal-nav {{
        background: rgba(15, 52, 96, 0.95);
    }}
}}

.modal-top {{
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
}}

.modal-card-img {{
    max-height: 220px;
    width: auto;
    border-radius: 6px;
    flex-shrink: 0;
}}

.modal-info {{
    flex: 1;
    min-width: 0;
}}

.modal h2 {{
    color: #e94560;
    font-size: 20px;
    margin-bottom: 4px;
}}

.modal .meta {{
    color: #888;
    font-size: 13px;
    margin-bottom: 12px;
}}

.modal .meta .tier-badge {{
    display: inline-block;
    padding: 2px 8px;
    border-radius: 3px;
    font-weight: bold;
    color: #1a1a2e;
    font-size: 12px;
}}

.synergy-link {{
    color: #FFBF7F;
    text-decoration: none;
    border-bottom: 1px dotted #FFBF7F55;
    transition: 0.2s;
}}
.synergy-link:hover {{
    color: #FFD700;
    border-bottom-color: #FFD700;
}}

.cotd-link {{
    display: inline-block;
    color: #ff5577;
    text-decoration: none;
    font-size: 13px;
    padding: 4px 0;
    transition: 0.2s;
}}
.cotd-link:hover {{
    color: #ff7799;
    text-decoration: underline;
}}

.copy-link-btn {{
    background: none;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 6px;
    margin-left: 8px;
    transition: 0.2s;
    vertical-align: middle;
}}
.copy-link-btn:hover {{
    border-color: #e94560;
    background: #e9456022;
}}
.copy-link-btn.copied {{
    border-color: #2ecc71;
    background: #2ecc7122;
}}

.modal .section {{
    margin-bottom: 14px;
}}

.modal .section-title {{
    color: #e94560;
    font-size: 13px;
    font-weight: bold;
    text-transform: uppercase;
    margin-bottom: 4px;
}}

.modal .section p {{
    font-size: 14px;
    line-height: 1.5;
    color: #ccc;
}}

.modal .tags {{
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}}

.modal .tag {{
    background: #0f3460;
    padding: 3px 10px;
    border-radius: 3px;
    font-size: 12px;
    color: #aaa;
    display: flex;
    align-items: center;
    gap: 4px;
}}

.modal .tag img {{
    height: 16px;
    width: 16px;
    object-fit: contain;
}}

.modal .expansion-badge {{
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0f3460;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 12px;
    color: #aaa;
}}

.modal .expansion-badge img {{
    height: 14px;
    width: 14px;
    object-fit: contain;
}}

.footer {{
    text-align: center;
    padding: 20px;
    color: #999;
    font-size: 12px;
}}

.scroll-top {{
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #e94560;
    color: #fff;
    border: none;
    font-size: 20px;
    cursor: pointer;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s, visibility 0.3s;
    z-index: 50;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}}
.scroll-top.visible {{
    opacity: 0.8;
    visibility: visible;
}}
.scroll-top:hover {{
    opacity: 1;
}}

.filter-toggle {{
    padding: 6px 14px;
    border: 1px solid #0f3460;
    border-radius: 4px;
    background: #1a1a2e;
    color: #aaa;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
}}

.filter-toggle:hover {{
    border-color: #e94560;
    color: #e0e0e0;
}}

@media (max-width: 768px) {{
    .filters {{
        padding: 10px 12px;
    }}
    .search-row {{
        flex-wrap: wrap;
        gap: 6px;
        align-items: stretch;
    }}
    .search-input {{
        min-width: 0;
        flex: 1 1 100%;
        order: 1;
    }}
    .search-btn {{
        order: 2;
        flex: 1 1 110px;
        min-height: 38px;
    }}
    .sort-select {{
        order: 3;
        flex: 1 1 140px;
        min-height: 38px;
    }}
    .jump-row {{
        order: 10;
        width: 100%;
        justify-content: center;
        overflow-x: auto;
        padding-bottom: 2px;
    }}
    .reset-btn {{
        order: 4;
        flex: 1 1 110px;
        min-height: 38px;
    }}
    .filter-group {{
        flex-wrap: wrap;
    }}
    .filter-label {{
        min-width: auto;
        width: 100%;
    }}
    .filter-chips {{
        gap: 3px;
    }}
    .filter-chip {{
        padding: 3px 7px;
        font-size: 11px;
    }}
    .tier-label {{
        width: 50px;
        min-width: 50px;
    }}
    .tier-letter {{
        font-size: 24px;
    }}
    .card img {{
        height: 80px;
    }}
    .card .placeholder {{
        height: 80px;
        width: 64px;
        font-size: 9px;
    }}
    .card-score {{
        font-size: 10px;
        padding: 1px 4px;
    }}
    .tier-cards {{
        padding: 4px;
        gap: 4px;
    }}
    .tier-row {{
        min-height: 90px;
    }}
    .container {{
        padding: 4px 8px;
    }}
    .header h1 {{
        font-size: 18px;
    }}
    .header .subtitle {{
        font-size: 12px;
    }}
    .top-nav {{
        padding: 8px 10px;
        flex-wrap: wrap;
        gap: 4px;
    }}
    .nav-link {{
        font-size: 12px;
        padding: 4px 10px;
    }}
    .filter-toggle {{
        order: 5;
        width: 100%;
        margin-top: 2px;
        text-align: center;
    }}
}}

@media (max-width: 600px) {{
    .filters {{
        padding: 8px 10px;
    }}
    .search-row {{
        gap: 5px;
    }}
    .search-input {{
        font-size: 16px;
        padding: 9px 11px;
    }}
    .search-btn,
    .sort-select,
    .reset-btn {{
        font-size: 12px;
        padding: 8px 10px;
    }}
    .jump-row {{
        justify-content: flex-start;
        gap: 4px;
    }}
    .jump-label {{
        display: none;
    }}
    .modal-top {{
        flex-direction: column;
        align-items: center;
    }}
    .modal {{
        padding: 16px;
        margin: 10px;
        max-height: 90vh;
    }}
    .modal h2 {{
        font-size: 17px;
    }}
    .modal-card-img {{
        max-height: 180px;
    }}
    .modal-nav {{
        width: 36px;
        height: 36px;
        font-size: 16px;
    }}
    .card img {{
        height: 70px;
    }}
    .card .placeholder {{
        height: 70px;
        width: 56px;
        font-size: 8px;
    }}
    .tier-label {{
        width: 40px;
        min-width: 40px;
    }}
    .tier-letter {{
        font-size: 20px;
    }}
    .tier-count {{
        font-size: 10px;
    }}
}}
</style>
</head>
<body>

{nav_html}

<div class="header">
    <h1>{escape(title)}</h1>
    <div class="subtitle">{"Формат: 3 игрока / WGT / Все дополнения" if LANG_RU else "Format: 3P / WGT / All Expansions"} — {total_cards} {"карт" if LANG_RU else "cards"} &nbsp;·&nbsp; <span class="hint">{"Нажмите на карту для подробностей" if LANG_RU else "Click a card for details"}</span></div>
</div>

{filters_html}

<div class="container">
{all_rows}
</div>

<div class="footer">
    Terraforming Mars Tier List — <a href="https://github.com/rusliksu/tm-tierlist" target="_blank" style="color:#ff5577;text-decoration:none">github.com/rusliksu/tm-tierlist</a>
    <br><span style="font-size:11px;color:#555">{"Клавиши: / поиск · j/k тиры · ←→ навигация · Esc закрыть" if LANG_RU else "Keys: / search · j/k tiers · ←→ navigate · Esc close"}</span>
</div>

<button class="scroll-top" id="scrollTop" onclick="window.scrollTo({{top:0,behavior:'smooth'}})">↑</button>

<div class="modal-overlay" id="modalOverlay">
    <div class="modal" id="modal">
        <button class="modal-close" id="modalClose">&times;</button>
        <button class="modal-nav prev" id="modalPrev">&#8249;</button>
        <button class="modal-nav next" id="modalNext">&#8250;</button>
        <div id="modalContent"></div>
    </div>
</div>

<script>
const cardsData = {cards_data};
const crossPageMap = {cross_page_json};
const imgPaths = {img_paths_json};
const tagIcons = {tag_icons_json};
const expansionIcons = {expansion_icons_json};

const tierColors = {{
    "S": "{TIER_COLORS['S']}",
    "A": "{TIER_COLORS['A']}",
    "B": "{TIER_COLORS['B']}",
    "C": "{TIER_COLORS['C']}",
    "D": "{TIER_COLORS['D']}",
    "F": "{TIER_COLORS['F']}"
}};

function escapeHtml(text) {{
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}}

function tagHtml(tag) {{
    const icon = tagIcons[tag];
    const img = icon ? '<img src="{IMG_PREFIX}/images/tags/' + icon + '">' : '';
    return '<span class="tag">' + img + escapeHtml(tag) + '</span>';
}}

function expansionHtml(exp) {{
    const icon = expansionIcons[exp];
    const img = icon ? '<img src="{IMG_PREFIX}/images/expansions/' + icon + '">' : '';
    return '<span class="expansion-badge">' + img + escapeHtml(exp) + '</span>';
}}

let currentModalCard = null;

function getVisibleCards() {{
    return Array.from(document.querySelectorAll('.card:not(.filtered-out)')).map(el => el.dataset.name);
}}

function openModal(cardName) {{
    const card = cardsData[cardName];
    if (!card) return;
    currentModalCard = cardName;

    const tierColor = tierColors[card.tier] || "#ccc";
    const tags = (card.tags && card.tags.length) ? card.tags.map(tagHtml).join('') : '<span class="tag">—</span>';
    const synergies = (card.synergies && card.synergies.length) ? card.synergies.map(s => {{
        if (cardsData[s]) {{
            return '<a href="#" class="synergy-link" data-card="' + escapeHtml(s) + '">' + escapeHtml(s) + '</a>';
        }}
        if (crossPageMap[s]) {{
            return '<a href="' + crossPageMap[s] + '#' + encodeURIComponent(s) + '" class="synergy-link synergy-external">' + escapeHtml(s) + ' ↗</a>';
        }}
        return escapeHtml(s);
    }}).join(', ') : '—';

    let costLine = '';
    if (card.cost) costLine += card.cost + ' MC';
    if (card.requirements) costLine += (costLine ? ' | ' : '') + '{l_req}: ' + escapeHtml(card.requirements);

    const expBadge = card.expansion ? expansionHtml(card.expansion) : '';
    const vpLine = card.vp ? '<div class="section"><div class="section-title">{l_vp}</div><p>' + escapeHtml(String(card.vp)) + '</p></div>' : '';

    const displayName = {l_display_name};
    const subtitle = {l_subtitle};

    const imgSrc = imgPaths[cardName];
    const imgEl = imgSrc ? '<img class="modal-card-img" src="' + escapeHtml(imgSrc) + '">' : '';

    document.getElementById('modalContent').innerHTML = `
        <div class="modal-top">
            ${{imgEl}}
            <div class="modal-info">
                <h2>${{escapeHtml(displayName)}}</h2>
                ${{subtitle ? '<div style="color:#888;font-size:13px;margin-bottom:2px">' + escapeHtml(subtitle) + '</div>' : ''}}
                <div class="meta">
                    <span class="tier-badge" style="background-color: ${{tierColor}}">${{card.tier}} — ${{card.score}}</span>
                    ${{costLine ? ' &nbsp; ' + escapeHtml(costLine) : ''}}
                    ${{expBadge ? ' &nbsp; ' + expBadge : ''}}
                    <button class="copy-link-btn" onclick="copyCardLink('${{escapeHtml(cardName).replace(/'/g, "\\\\'")}}')" title="{"Скопировать ссылку" if LANG_RU else "Copy link"}">🔗</button>
                </div>
                <div class="section">
                    <div class="section-title">{l_tags}</div>
                    <div class="tags">${{tags}}</div>
                </div>
                ${{{"(card.description_ru || card.description)" if LANG_RU else "card.description"} ? '<div class="section"><div class="section-title">{l_desc}</div><p>' + escapeHtml({"card.description_ru || card.description" if LANG_RU else "card.description"}) + '</p></div>' : ''}}
                ${{vpLine}}
            </div>
        </div>
        <div class="section">
            <div class="section-title">{l_econ}</div>
            <p>${{escapeHtml(card.economy || '—')}}</p>
        </div>
        <div class="section">
            <div class="section-title">{l_analysis}</div>
            <p>${{escapeHtml(card.reasoning || '—')}}</p>
        </div>
        <div class="section">
            <div class="section-title">{l_synergies}</div>
            <p>${{synergies}}</p>
        </div>
        <div class="section">
            <div class="section-title">{l_when}</div>
            <p>${{escapeHtml(card.when_to_pick || '—')}}</p>
        </div>
        ${{card.cotd_url ? '<div class="section"><a href="' + escapeHtml(card.cotd_url) + '" target="_blank" class="cotd-link">{"💬 Обсуждение на Reddit (COTD)" if LANG_RU else "💬 Reddit Discussion (COTD)"}</a></div>' : ''}}
    `;

    document.querySelectorAll('#modalContent .synergy-link[data-card]').forEach(link => {{
        link.addEventListener('click', (e) => {{
            e.preventDefault();
            const targetCard = link.getAttribute('data-card');
            if (targetCard) openModal(targetCard);
        }});
    }});

    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('modal').scrollTop = 0;
    history.replaceState(null, '', '#' + encodeURIComponent(cardName));
}}

function navigateModal(direction) {{
    if (!currentModalCard) return;
    const visible = getVisibleCards();
    const idx = visible.indexOf(currentModalCard);
    if (idx === -1) return;
    const next = idx + direction;
    if (next >= 0 && next < visible.length) {{
        openModal(visible[next]);
    }}
}}

function copyCardLink(cardName) {{
    const url = window.location.origin + window.location.pathname + '#' + encodeURIComponent(cardName);
    navigator.clipboard.writeText(url).then(() => {{
        const btn = document.querySelector('.copy-link-btn');
        if (btn) {{
            btn.classList.add('copied');
            btn.textContent = '✓';
            setTimeout(() => {{ btn.classList.remove('copied'); btn.textContent = '🔗'; }}, 1500);
        }}
    }});
}}

function closeModal() {{
    const lastCard = currentModalCard;
    document.getElementById('modalOverlay').classList.remove('active');
    currentModalCard = null;
    history.replaceState(null, '', window.location.pathname + window.location.search);
    // Scroll to and highlight the card in the grid
    if (lastCard) {{
        const el = document.querySelector('.card[data-name="' + CSS.escape(lastCard) + '"]');
        if (el) {{
            el.scrollIntoView({{behavior: 'smooth', block: 'center'}});
            el.classList.add('highlight');
            setTimeout(() => el.classList.remove('highlight'), 2000);
        }}
    }}
}}

window.addEventListener('hashchange', () => {{
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash && cardsData[hash]) {{
        openModal(hash);
    }}
}});

// --- Filtering ---
let activeTagFilters = new Set();
let activeExpFilters = new Set();
let activeTierFilters = new Set();
let searchQuery = '';

function applyFilters() {{
    let shown = 0;
    let total = 0;

    document.querySelectorAll('.card').forEach(el => {{
        total++;
        const name = el.dataset.name;
        const card = cardsData[name];
        if (!card) return;

        const cardTags = el.dataset.tags ? el.dataset.tags.split(',') : [];
        const cardExp = el.dataset.expansion || '';
        const cardTier = card.tier;
        const displayName = (card.name_ru || '') + ' ' + card.name;

        let visible = true;

        // Search filter
        if (searchQuery && !displayName.toLowerCase().includes(searchQuery)) {{
            visible = false;
        }}

        // Tag filter (AND: card must have ALL selected tags)
        if (visible && activeTagFilters.size > 0) {{
            for (const tag of activeTagFilters) {{
                if (tag === '_none') {{
                    if (cardTags.length > 0) {{ visible = false; break; }}
                }} else if (!cardTags.includes(tag)) {{
                    visible = false;
                    break;
                }}
            }}
        }}

        // Expansion filter (OR: card must match any selected expansion)
        if (visible && activeExpFilters.size > 0) {{
            if (!activeExpFilters.has(cardExp)) {{
                visible = false;
            }}
        }}

        // Tier filter
        if (visible && activeTierFilters.size > 0) {{
            if (!activeTierFilters.has(cardTier)) {{
                visible = false;
            }}
        }}

        el.classList.toggle('filtered-out', !visible);
        if (visible) shown++;
    }});

    // Hide empty tier rows
    document.querySelectorAll('.tier-row').forEach(row => {{
        const visibleCards = row.querySelectorAll('.card:not(.filtered-out)');
        row.classList.toggle('hidden', visibleCards.length === 0);
        const countEl = row.querySelector('.tier-count');
        if (countEl) countEl.textContent = visibleCards.length;
    }});

    const countEl = document.getElementById('filterCount');
    const hasFilters = searchQuery || activeTagFilters.size || activeExpFilters.size || activeTierFilters.size;
    countEl.textContent = hasFilters ? '{l_shown}: ' + shown + ' {l_of} ' + total : '';
}}

// Search
document.getElementById('searchInput').addEventListener('input', (e) => {{
    searchQuery = e.target.value.toLowerCase().trim();
    applyFilters();
}});
document.getElementById('searchInput').addEventListener('keydown', (e) => {{
    if (e.key === 'Enter') {{
        searchQuery = e.target.value.toLowerCase().trim();
        applyFilters();
    }}
}});
document.getElementById('runSearch').addEventListener('click', () => {{
    const input = document.getElementById('searchInput');
    searchQuery = input.value.toLowerCase().trim();
    applyFilters();
}});

// Chip toggles
function setupChipFilters(containerId, filterSet, dataAttr) {{
    document.querySelectorAll('#' + containerId + ' .filter-chip').forEach(chip => {{
        chip.addEventListener('click', () => {{
            const val = chip.getAttribute('data-' + dataAttr);
            if (filterSet.has(val)) {{
                filterSet.delete(val);
                chip.classList.remove('active');
            }} else {{
                filterSet.add(val);
                chip.classList.add('active');
            }}
            applyFilters();
        }});
    }});
}}

setupChipFilters('tagFilters', activeTagFilters, 'tag');
setupChipFilters('expFilters', activeExpFilters, 'expansion');
setupChipFilters('tierFilters', activeTierFilters, 'tier');

// Reset
document.getElementById('resetFilters').addEventListener('click', () => {{
    searchQuery = '';
    activeTagFilters.clear();
    activeExpFilters.clear();
    activeTierFilters.clear();
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.filter-chip.active').forEach(c => c.classList.remove('active'));
    applyFilters();
    updateHash();
}});

// --- URL Hash ---
function updateHash() {{
    if (currentModalCard) return; // don't overwrite card hash while modal is open
    const parts = [];
    if (searchQuery) parts.push('q=' + encodeURIComponent(searchQuery));
    if (activeTierFilters.size) parts.push('tier=' + [...activeTierFilters].join(','));
    if (activeTagFilters.size) parts.push('tag=' + [...activeTagFilters].map(encodeURIComponent).join(','));
    if (activeExpFilters.size) parts.push('exp=' + [...activeExpFilters].map(encodeURIComponent).join(','));
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname);
}}

function loadFromHash() {{
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) return;
    // Direct card link: #CardName
    if (cardsData[hash]) {{
        openModal(hash);
        return;
    }}
    const params = Object.fromEntries(hash.split('&').map(p => {{
        const [k, ...v] = p.split('=');
        return [k, v.join('=')];
    }}));

    if (params.q) {{
        searchQuery = decodeURIComponent(params.q).toLowerCase();
        document.getElementById('searchInput').value = decodeURIComponent(params.q);
    }}
    if (params.tier) {{
        params.tier.split(',').forEach(t => {{
            activeTierFilters.add(t);
            const chip = document.querySelector('#tierFilters [data-tier="' + t + '"]');
            if (chip) chip.classList.add('active');
        }});
    }}
    if (params.tag) {{
        params.tag.split(',').map(decodeURIComponent).forEach(t => {{
            activeTagFilters.add(t);
            const chip = document.querySelector('#tagFilters [data-tag="' + t + '"]');
            if (chip) chip.classList.add('active');
        }});
    }}
    if (params.exp) {{
        params.exp.split(',').map(decodeURIComponent).forEach(e => {{
            activeExpFilters.add(e);
            const chip = document.querySelector('#expFilters [data-expansion="' + e + '"]');
            if (chip) chip.classList.add('active');
        }});
    }}
    applyFilters();
}}

// Wrap applyFilters to also update hash
const _origApply = applyFilters;
applyFilters = function() {{
    _origApply();
    updateHash();
}};

// Sorting
document.getElementById('sortSelect').addEventListener('change', (e) => {{
    const mode = e.target.value;
    document.querySelectorAll('.tier-cards').forEach(container => {{
        const cards = [...container.querySelectorAll('.card')];
        cards.sort((a, b) => {{
            const ca = cardsData[a.dataset.name] || {{}};
            const cb = cardsData[b.dataset.name] || {{}};
            if (mode === 'cost') {{
                const costA = parseInt(ca.cost) || 0;
                const costB = parseInt(cb.cost) || 0;
                return costA - costB || (cb.score || 0) - (ca.score || 0);
            }}
            if (mode === 'name') {{
                const nameA = (ca.name_ru || ca.name || '').toLowerCase();
                const nameB = (cb.name_ru || cb.name || '').toLowerCase();
                return nameA.localeCompare(nameB);
            }}
            return (cb.score || 0) - (ca.score || 0);
        }});
        cards.forEach(c => container.appendChild(c));
    }});
}});

// Card click
document.querySelectorAll('.card').forEach(el => {{
    el.addEventListener('click', () => {{
        openModal(el.dataset.name);
    }});
}});

// Modal controls
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalPrev').addEventListener('click', () => navigateModal(-1));
document.getElementById('modalNext').addEventListener('click', () => navigateModal(1));
document.getElementById('modalOverlay').addEventListener('click', (e) => {{
    if (e.target === document.getElementById('modalOverlay')) closeModal();
}});
document.addEventListener('keydown', (e) => {{
    if (e.key === 'Escape') closeModal();
    if (currentModalCard) {{
        if (e.key === 'ArrowLeft') navigateModal(-1);
        if (e.key === 'ArrowRight') navigateModal(1);
    }}
}});

// Touch swipe navigation in modal
(function() {{
    let touchStartX = 0;
    let touchStartY = 0;
    const modal = document.getElementById('modal');
    if (!modal) return;
    modal.addEventListener('touchstart', (e) => {{
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }}, {{passive: true}});
    modal.addEventListener('touchend', (e) => {{
        if (!currentModalCard) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {{
            if (dx > 0) navigateModal(-1); // swipe right = prev
            else navigateModal(1); // swipe left = next
        }}
    }}, {{passive: true}});
}})();

// Collapsible filters on mobile
(function() {{
    const filters = document.querySelector('.filters');
    const searchRow = filters.querySelector('.search-row');
    const groups = filters.querySelectorAll('.filter-group');
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'filter-toggle';
    toggleBtn.textContent = '{"Фильтры ▼" if LANG_RU else "Filters ▼"}';
    toggleBtn.style.display = 'none';
    searchRow.appendChild(toggleBtn);

    let filtersExpanded = false;
    function updateFilterVisibility() {{
        if (window.innerWidth <= 768) {{
            toggleBtn.style.display = 'block';
            groups.forEach(g => g.style.display = filtersExpanded ? '' : 'none');
            toggleBtn.textContent = filtersExpanded ? '{"Фильтры ▲" if LANG_RU else "Filters ▲"}' : '{"Фильтры ▼" if LANG_RU else "Filters ▼"}';
        }} else {{
            toggleBtn.style.display = 'none';
            groups.forEach(g => g.style.display = '');
        }}
    }}
    toggleBtn.addEventListener('click', () => {{
        filtersExpanded = !filtersExpanded;
        updateFilterVisibility();
    }});
    window.addEventListener('resize', updateFilterVisibility);
    updateFilterVisibility();
}})();

// Touch swipe for modal navigation
(function() {{
    const overlay = document.getElementById('modalOverlay');
    let touchStartX = 0;
    let touchStartY = 0;
    overlay.addEventListener('touchstart', (e) => {{
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }}, {{passive: true}});
    overlay.addEventListener('touchend', (e) => {{
        const dx = e.changedTouches[0].screenX - touchStartX;
        const dy = e.changedTouches[0].screenY - touchStartY;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {{
            if (dx > 0) navigateModal(-1);
            else navigateModal(1);
        }}
    }}, {{passive: true}});
}})();

// Scroll-to-top button visibility
window.addEventListener('scroll', () => {{
    document.getElementById('scrollTop').classList.toggle('visible', window.scrollY > 400);
}}, {{passive: true}});

// Keyboard shortcuts: / search, j/k jump between tiers
document.addEventListener('keydown', (e) => {{
    if (currentModalCard || document.activeElement.tagName === 'INPUT') return;
    if (e.key === '/') {{
        e.preventDefault();
        document.getElementById('searchInput').focus();
    }}
    if (e.key === 'j' || e.key === 'k') {{
        const tiers = Array.from(document.querySelectorAll('.tier-row'));
        const scrollY = window.scrollY + 80;
        let target = null;
        if (e.key === 'j') {{
            target = tiers.find(t => t.offsetTop > scrollY + 10);
        }} else {{
            for (let i = tiers.length - 1; i >= 0; i--) {{
                if (tiers[i].offsetTop < scrollY - 10) {{ target = tiers[i]; break; }}
            }}
        }}
        if (target) target.scrollIntoView({{behavior: 'smooth', block: 'start'}});
    }}
}});

// Load filters from URL on page load
loadFromHash();
</script>
</body>
</html>"""


def generate_ranking_txt(evaluations, card_index):
    """Генерирует tiermaker_ranking.txt из evaluations.json (single source of truth)."""
    category_map = {
        "CORPS": {"types": {"corporation"}},
        "PRELUDES": {"types": {"prelude"}},
        "PROJECTS": {"types": {"active", "automated", "event"}},
        "CEOS": {"types": {"ceo"}},
    }

    lines = ["TERRAFORMING MARS TIER LIST — RANKING",
             "Формат: 3P / WGT / All Expansions"]

    for cat_key, cat_info in category_map.items():
        allowed_types = cat_info["types"]
        cards_by_tier = {t: [] for t in TIER_ORDER}

        for name, ev in evaluations.items():
            card_type = card_index.get(name, {}).get("type", "")
            if card_type not in allowed_types:
                continue
            tier = ev.get("tier", "C")
            if tier not in cards_by_tier:
                tier = "C"
            cards_by_tier[tier].append((name, ev.get("score", 0)))

        for tier in TIER_ORDER:
            cards_by_tier[tier].sort(key=lambda x: -x[1])

        lines.append(f"\n{'='*60}")
        lines.append(f"  {cat_key}")
        lines.append(f"{'='*60}")

        for tier in TIER_ORDER:
            cards = cards_by_tier[tier]
            if not cards:
                continue
            lines.append(f"\n--- {tier} Tier ---")
            for name, score in cards:
                lines.append(f"  {score:3d}  {name}")

    ranking_path = OUTPUT_DIR / "tiermaker_ranking.txt"
    with open(ranking_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Ranking: {ranking_path}")


def main():
    evaluations, card_index, image_mapping, names_ru = load_data()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    suffix = "_ru" if LANG_RU else ""
    if LANG_RU:
        print(f"Режим: русский ({len(names_ru)} переводов)")

    cross_page_map = build_cross_page_map(evaluations, card_index)

    for category in CARD_TYPES:
        print(f"Генерирую {category}...")
        tiers = get_cards_for_category(category, evaluations, card_index, names_ru)

        total = sum(len(c) for c in tiers.values())
        for t in TIER_ORDER:
            if tiers[t]:
                print(f"  {t}: {len(tiers[t])} карт")

        html_content = generate_html(category, tiers, image_mapping, cross_page_map)
        output_path = OUTPUT_DIR / f"tierlist_{category}{suffix}.html"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_content)
        print(f"  -> {output_path} ({total} карт)")

    # Генерируем ranking.txt из evaluations.json (single source of truth)
    if not LANG_RU:
        generate_ranking_txt(evaluations, card_index)

    # Sanity check: no broken image paths
    broken = False
    for html_file in OUTPUT_DIR.glob("tierlist_*.html"):
        content = html_file.read_text(encoding="utf-8")
        if '="./images/' in content:
            print(f"  ⚠ BROKEN IMAGE PATHS in {html_file.name}: found ./images/ (should be ../images/)")
            broken = True
    if broken:
        print("\n❌ Image paths broken! Fix IMG_PREFIX in generate_visual_tierlist.py")
        sys.exit(1)

    print("\nГотово!")


if __name__ == "__main__":
    main()
