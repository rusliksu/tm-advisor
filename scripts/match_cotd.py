"""
Матчинг COTD карт к данным карт из репозитория.
Использует fuzzy matching для несовпадающих имён.
"""

import json
import os
import re
from difflib import SequenceMatcher

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')


def normalize_name(name):
    """Нормализует имя карты для сравнения."""
    name = name.lower().strip()
    # Убираем спецсимволы и нормализуем пробелы
    name = re.sub(r'[\'\"''""\-–—]', '', name)
    name = re.sub(r'\s+', ' ', name)
    return name


def build_name_variants(card_names):
    """Строит словарь вариантов написания для каждой карты."""
    variants = {}
    for name in card_names:
        norm = normalize_name(name)
        variants[norm] = name
        # Без артиклей
        for article in ['the ', 'a ', 'an ']:
            if norm.startswith(article):
                variants[norm[len(article):]] = name
    return variants


def fuzzy_match(cotd_name, card_names, variants, threshold=0.85):
    """Находит лучшее совпадение для COTD имени."""
    norm_cotd = normalize_name(cotd_name)

    # Точное совпадение нормализованных
    if norm_cotd in variants:
        return variants[norm_cotd], 1.0

    # Fuzzy match
    best_match = None
    best_score = 0

    for card_name in card_names:
        norm_card = normalize_name(card_name)
        score = SequenceMatcher(None, norm_cotd, norm_card).ratio()
        if score > best_score:
            best_score = score
            best_match = card_name

    if best_score >= threshold:
        return best_match, best_score

    return None, best_score


# Известные маппинги (ручные)
MANUAL_MAPPINGS = {
    'Allied Banks': 'Allied Bank',
    'Archaebacteria': 'ArchaeBacteria',
    'CEO\'s Favourite Project': 'CEO\'s Favorite Project',
    'Cryo-sleep': 'Cryo Sleep',
    'Extreme-cold Fungus': 'Extreme-Cold Fungus',
    'Hi-tech Lab': 'Hi-Tech Lab',
    'GHG Import from Venus': 'GHG Import From Venus',
    'Convoy from Europa': 'Convoy From Europa',
    'Beam from a Thorium Asteroid': 'Beam From A Thorium Asteroid',
    'Anti-gravity Technology': 'Anti-Gravity Technology',
    'Aerosports Tournament': 'Aerosport Tournament',
    'Field-capped City': 'Field Capped City',
    'Air-scrapping Expedition': 'Air-Scrapping Expedition',
    'Excentric Sponsor': 'Eccentric Sponsor',
    # Шуточные/альтернативные заголовки от Enson_Chan
    'Pengwings': 'Penguins',
    'Self-replicating Robots Robots Robots Robots Robots Robots Robots...': 'Self-Replicating Bacteria',
    'The Worst Card in the Game': None,  # unknown, skip
    'The Most Expensive Card': None,  # unknown
    'The OG Earth Multiplier': 'Earth Catapult',  # или другая карта
    'The Process or Period of Gathering in Crops': 'Harvest',  # подозрение
    'Venus Number 1 Shade': 'Venusian Insects',  # подозрение
    'Local Hot Shading in Your Area': None,  # unknown
    'Oxygen-releasing Bacteria': 'Nitrite Reducing Bacteria',  # подозрение
    'Luxury': 'Luxury Foods',
    'Europa': 'Convoy From Europa',  # подозрение
    'Psyche': None,  # unknown
    'Stormcraft': 'Stormcraft Incorporated',
    'Terralabs': 'Terralabs Research',
    'Sagitta': 'Sagitta Frontier Services',
    'Head Start': None,  # prelude 2 specific?
    'Suitable Infrastructure': 'Suitable Infrastructure',  # may not be in our modules
    'Established Methods': None,  # unknown
    'TR Solo': None,  # meta post
}

# Посты которые НЕ являются картами (polls, meta posts)
NOT_CARDS = {
    'End of 3rd cycle poll',
    'End of 4th Cycle Poll',
    'End of Current Cycle Poll',
    'End of round 2 announcement and voting',
    'Enson Archives',
    'Giant Ass Iceteroid',
    'Aridor on a Stick',
    'Hi-tech Lab but a corp',
    'Quick Announcement for the 5th Cycle',
    'TR Solo',
}


def main():
    with open(os.path.join(DATA_DIR, 'card_index.json'), 'r', encoding='utf-8') as f:
        card_index = json.load(f)

    with open(os.path.join(DATA_DIR, 'cotd_lookup.json'), 'r', encoding='utf-8') as f:
        cotd_lookup = json.load(f)

    card_names = list(card_index.keys())
    variants = build_name_variants(card_names)

    matched = {}
    unmatched = {}
    skipped = []
    fuzzy_matches = []

    for cotd_name in cotd_lookup:
        # Пропускаем не-карты
        if cotd_name in NOT_CARDS:
            skipped.append(cotd_name)
            continue

        # Ручной маппинг
        if cotd_name in MANUAL_MAPPINGS:
            real_name = MANUAL_MAPPINGS[cotd_name]
            if real_name is None:
                skipped.append(cotd_name)
                continue
            if real_name in card_index:
                matched[cotd_name] = real_name
                continue

        # Точное совпадение
        if cotd_name in card_index:
            matched[cotd_name] = cotd_name
            continue

        # Fuzzy match
        match, score = fuzzy_match(cotd_name, card_names, variants)
        if match:
            matched[cotd_name] = match
            fuzzy_matches.append((cotd_name, match, score))
        else:
            unmatched[cotd_name] = score

    # Результаты
    print(f"Точно совпало: {len(matched) - len(fuzzy_matches)}")
    print(f"Fuzzy совпало: {len(fuzzy_matches)}")
    print(f"Не найдено: {len(unmatched)}")
    print(f"Пропущено (не карты): {len(skipped)}")

    if fuzzy_matches:
        print(f"\nFuzzy matches:")
        for cotd, card, score in sorted(fuzzy_matches, key=lambda x: x[2]):
            print(f"  \"{cotd}\" -> \"{card}\" ({score:.2f})")

    if unmatched:
        print(f"\nНе найденные:")
        for name, score in sorted(unmatched.items()):
            print(f"  \"{name}\" (best: {score:.2f})")

    # Сохраняем маппинг
    mapping = {}
    for cotd_name, real_name in matched.items():
        mapping[cotd_name] = real_name

    mapping_file = os.path.join(DATA_DIR, 'cotd_card_mapping.json')
    with open(mapping_file, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)
    print(f"\nМаппинг сохранён: {mapping_file} ({len(mapping)} записей)")


if __name__ == '__main__':
    main()
