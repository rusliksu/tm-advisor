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

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"

LANG_RU = "--ru" in sys.argv

TIER_ORDER = ["S", "A", "B", "C", "D", "F"]
TIER_COLORS = {
    "S": "#FF7F7F",
    "A": "#FFBF7F",
    "B": "#FFDF7F",
    "C": "#BFFF7F",
    "D": "#7FFF7F",
    "F": "#CCCCCC",
}
TIER_LABELS = {
    "S": "S — Must-pick",
    "A": "A — Почти всегда",
    "B": "B — Хорош с синергией",
    "C": "C — Ситуативный",
    "D": "D — Слабый",
    "F": "F — Trap-карта",
}

CARD_TYPES = {
    "corporations": {"title": "Тир-лист корпораций", "title_en": "Corporations Tier List", "types": {"corporation"}},
    "preludes": {"title": "Тир-лист прелюдий", "title_en": "Preludes Tier List", "types": {"prelude"}},
    "projects": {"title": "Тир-лист проектных карт", "title_en": "Project Cards Tier List", "types": {"active", "automated", "event"}},
}

NAV_LINKS = {
    "corporations": {"label_ru": "Корпорации", "label_en": "Corporations"},
    "preludes": {"label_ru": "Прелюдии", "label_en": "Preludes"},
    "projects": {"label_ru": "Проекты", "label_en": "Projects"},
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
            "requirements": card_info.get("requirements", ""),
            "vp": card_info.get("victoryPoints", ""),
        })

    # Sort each tier by score descending
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

    # Language switch: link to same category, opposite language
    alt_file = f"tierlist_{current_category}{alt_suffix}.html"

    return f"""<nav class="top-nav">
    <a class="nav-link nav-back" href="../index.html">{back_label}</a>
    <div class="nav-links">{''.join(nav_items)}</div>
    <a class="nav-link nav-lang" href="{alt_file}">{lang_label}</a>
</nav>"""


def generate_html(category, tiers, image_mapping):
    """Генерирует standalone HTML для одной категории."""
    title = CARD_TYPES[category]["title"] if LANG_RU else CARD_TYPES[category]["title_en"]
    total_cards = sum(len(cards) for cards in tiers.values())
    nav_html = build_nav_html(category)

    # Build cards data as JSON for the modal
    cards_json = {}
    for tier, cards in tiers.items():
        for card in cards:
            cards_json[card["name"]] = card

    cards_data = json.dumps(cards_json, ensure_ascii=False)

    # Build HTML
    rows_html = []
    for tier in TIER_ORDER:
        cards = tiers[tier]
        if not cards:
            continue

        color = TIER_COLORS[tier]
        label = TIER_LABELS[tier]

        cards_html_parts = []
        for card in cards:
            img_path = image_mapping.get(card["name"], "")
            display_name = card.get("name_ru") or card["name"] if LANG_RU else card["name"]
            # Path relative to output/ directory
            if img_path:
                rel_path = "../" + img_path.replace("\\", "/")
                img_tag = f'<img src="{escape(rel_path)}" alt="{escape(display_name)}" loading="lazy">'
            else:
                img_tag = f'<div class="placeholder">{escape(display_name)}</div>'

            tooltip = f'{escape(display_name)} — {card["score"]}'

            cards_html_parts.append(
                f'<div class="card" data-name="{escape(card["name"])}" title="{tooltip}">'
                f'{img_tag}'
                f'<div class="card-score">{card["score"]}</div>'
                f'</div>'
            )

        cards_html = "\n".join(cards_html_parts)

        rows_html.append(f"""
        <div class="tier-row">
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

    return f"""<!DOCTYPE html>
<html lang="{"ru" if LANG_RU else "en"}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{escape(title)} — Terraforming Mars</title>
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
    background: #e94560;
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
    color: #888;
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
    overflow: hidden;
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
    transition: transform 0.15s, box-shadow 0.15s;
    background: #0f3460;
    flex-shrink: 0;
}}

.card:hover {{
    transform: scale(1.08);
    box-shadow: 0 4px 20px rgba(233, 69, 96, 0.4);
    z-index: 10;
}}

.card img {{
    height: 100px;
    width: auto;
    display: block;
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
    background: rgba(0,0,0,0.75);
    color: #fff;
    font-size: 11px;
    font-weight: bold;
    padding: 1px 5px;
    border-radius: 3px;
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
    max-width: 700px;
    width: 95%;
    max-height: 85vh;
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

.modal h2 {{
    color: #e94560;
    font-size: 20px;
    margin-bottom: 4px;
}}

.modal .meta {{
    color: #888;
    font-size: 13px;
    margin-bottom: 16px;
}}

.modal .meta .tier-badge {{
    display: inline-block;
    padding: 2px 8px;
    border-radius: 3px;
    font-weight: bold;
    color: #1a1a2e;
    font-size: 12px;
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
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 12px;
    color: #aaa;
}}

.modal .card-image-large {{
    max-height: 200px;
    width: auto;
    border-radius: 4px;
    margin-bottom: 12px;
}}

.footer {{
    text-align: center;
    padding: 20px;
    color: #555;
    font-size: 12px;
}}
</style>
</head>
<body>

{nav_html}

<div class="header">
    <h1>{escape(title)}</h1>
    <div class="subtitle">{"Формат: 3 игрока / WGT / Все дополнения" if LANG_RU else "Format: 3P / WGT / All Expansions"} — {total_cards} {"карт" if LANG_RU else "cards"}</div>
</div>

<div class="container">
{all_rows}
</div>

<div class="footer">
    Terraforming Mars Tier List — github.com/rusliksu/tm-tierlist
</div>

<div class="modal-overlay" id="modalOverlay">
    <div class="modal" id="modal">
        <button class="modal-close" id="modalClose">&times;</button>
        <div id="modalContent"></div>
    </div>
</div>

<script>
const cardsData = {cards_data};

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

function openModal(cardName) {{
    const card = cardsData[cardName];
    if (!card) return;

    const tierColor = tierColors[card.tier] || "#ccc";
    const tags = (card.tags && card.tags.length) ? card.tags.map(t => '<span class="tag">' + escapeHtml(t) + '</span>').join('') : '<span class="tag">—</span>';
    const synergies = (card.synergies && card.synergies.length) ? card.synergies.map(s => escapeHtml(s)).join(', ') : '—';

    let costLine = '';
    if (card.cost) costLine += card.cost + ' MC';
    if (card.requirements) costLine += (costLine ? ' | ' : '') + '{"Требования" if LANG_RU else "Requirements"}: ' + escapeHtml(card.requirements);
    if (card.expansion) costLine += (costLine ? ' | ' : '') + escapeHtml(card.expansion);

    const vpLine = card.vp ? '<div class="section"><div class="section-title">{"Победные очки" if LANG_RU else "Victory Points"}</div><p>' + escapeHtml(String(card.vp)) + '</p></div>' : '';

    const displayName = {"card.name_ru || card.name" if LANG_RU else "card.name"};
    const subtitle = {"card.name_ru ? card.name : ''" if LANG_RU else "card.name_ru || ''"};

    document.getElementById('modalContent').innerHTML = `
        <h2>${{escapeHtml(displayName)}}</h2>
        ${{subtitle ? '<div style="color:#888;font-size:13px;margin-bottom:2px">' + escapeHtml(subtitle) + '</div>' : ''}}
        <div class="meta">
            <span class="tier-badge" style="background-color: ${{tierColor}}">${{card.tier}} — ${{card.score}}</span>
            ${{costLine ? ' &nbsp; ' + escapeHtml(costLine) : ''}}
        </div>
        <div class="section">
            <div class="section-title">{"Теги" if LANG_RU else "Tags"}</div>
            <div class="tags">${{tags}}</div>
        </div>
        ${{card.description ? '<div class="section"><div class="section-title">{"Описание" if LANG_RU else "Description"}</div><p>' + escapeHtml(card.description) + '</p></div>' : ''}}
        ${{vpLine}}
        <div class="section">
            <div class="section-title">{"Экономика" if LANG_RU else "Economy"}</div>
            <p>${{escapeHtml(card.economy || '—')}}</p>
        </div>
        <div class="section">
            <div class="section-title">{"Анализ" if LANG_RU else "Analysis"}</div>
            <p>${{escapeHtml(card.reasoning || '—')}}</p>
        </div>
        <div class="section">
            <div class="section-title">{"Синергии" if LANG_RU else "Synergies"}</div>
            <p>${{synergies}}</p>
        </div>
        <div class="section">
            <div class="section-title">{"Когда брать" if LANG_RU else "When to Pick"}</div>
            <p>${{escapeHtml(card.when_to_pick || '—')}}</p>
        </div>
    `;

    document.getElementById('modalOverlay').classList.add('active');
}}

function closeModal() {{
    document.getElementById('modalOverlay').classList.remove('active');
}}

// Event listeners
document.querySelectorAll('.card').forEach(el => {{
    el.addEventListener('click', () => {{
        openModal(el.dataset.name);
    }});
}});

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', (e) => {{
    if (e.target === document.getElementById('modalOverlay')) closeModal();
}});
document.addEventListener('keydown', (e) => {{
    if (e.key === 'Escape') closeModal();
}});
</script>
</body>
</html>"""


def main():
    evaluations, card_index, image_mapping, names_ru = load_data()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    suffix = "_ru" if LANG_RU else ""
    if LANG_RU:
        print(f"Режим: русский ({len(names_ru)} переводов)")

    for category in CARD_TYPES:
        print(f"Генерирую {category}...")
        tiers = get_cards_for_category(category, evaluations, card_index, names_ru)

        total = sum(len(c) for c in tiers.values())
        for t in TIER_ORDER:
            if tiers[t]:
                print(f"  {t}: {len(tiers[t])} карт")

        html_content = generate_html(category, tiers, image_mapping)
        output_path = OUTPUT_DIR / f"tierlist_{category}{suffix}.html"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_content)
        print(f"  -> {output_path} ({total} карт)")

    print("\nГотово!")


if __name__ == "__main__":
    main()
