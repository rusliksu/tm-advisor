"""
Подготовка объединённых данных для оценки карт.
Объединяет: all_cards.json + cotd данные + image_mapping + existing evaluations.
"""

import json
import os
import re

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')


def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def extract_cotd_for_card(card_name, cotd_lookup, cotd_mapping):
    """Находит COTD данные для карты."""
    # Прямой поиск по имени карты
    if card_name in cotd_lookup:
        return cotd_lookup[card_name]

    # Поиск через маппинг (COTD name -> real name)
    for cotd_name, real_name in cotd_mapping.items():
        if real_name == card_name and cotd_name in cotd_lookup:
            return cotd_lookup[cotd_name]

    return None


def summarize_cotd_comments(cotd_entries):
    """Извлекает ключевые комментарии из COTD данных."""
    if not cotd_entries:
        return None

    # Ключевые комментаторы (опытные игроки)
    KEY_COMMENTERS = {
        'benbever', 'icehawk84', 'SoupsBane', 'Krazyguy75',
        'CaptainCFloyd', 'FieldMouse007', 'shai_aus', 'ad_hocNC',
        'warpspeed100', 'Ill-Wish-3150', 'ludovic1313', 'erikrtheread',
        'Great_GW', 'BouncyPolarBear'
    }

    all_comments = []
    for entry in cotd_entries:
        post_url = entry.get('url', '')
        post_date = entry.get('date', '')
        for comment in entry.get('comments', []):
            author = comment.get('author', '')
            body = comment.get('body', '').strip()
            score = comment.get('score', 0)
            depth = comment.get('depth', 0)

            # Пропускаем автора COTD, удалённые, короткие
            if author == 'Enson_Chan':
                continue
            if author in ('[deleted]', 'AutoModerator'):
                continue
            if len(body) < 20:
                continue

            is_key = author.lower() in {k.lower() for k in KEY_COMMENTERS}
            all_comments.append({
                'author': author,
                'body': body,
                'score': score,
                'depth': depth,
                'is_key_commenter': is_key,
                'post_date': post_date,
            })

    if not all_comments:
        return None

    # Сортируем: ключевые комментаторы первые, затем по score
    all_comments.sort(key=lambda c: (-c['is_key_commenter'], -c['score']))

    # Берём топ-10 комментариев (или все если меньше)
    top_comments = all_comments[:10]

    return {
        'num_posts': len(cotd_entries),
        'total_comments': sum(len(e.get('comments', [])) for e in cotd_entries),
        'top_comments': top_comments,
        'post_urls': [e.get('url', '') for e in cotd_entries],
        'dates': [e.get('date', '') for e in cotd_entries],
    }


EXISTING_EVALUATIONS = {
    # A-tier
    'Cutting Edge Technology': {'score': 84, 'tier': 'A'},
    'Imported Hydrogen': {'score': 80, 'tier': 'A'},
    # B-tier
    'Mining Colony': {'score': 78, 'tier': 'B'},
    'Venus Orbital Survey': {'score': 78, 'tier': 'B'},
    'Electro Catapult': {'score': 77, 'tier': 'B'},
    'Birds': {'score': 76, 'tier': 'B'},
    'Red Ships': {'score': 75, 'tier': 'B'},
    'Open City': {'score': 74, 'tier': 'B'},
    'Sponsoring Nation': {'score': 74, 'tier': 'B'},
    'Atmoscoop': {'score': 72, 'tier': 'B'},
    'Colonial Representation': {'score': 72, 'tier': 'B'},
    'Hermetic Order of Mars': {'score': 72, 'tier': 'B'},
    'Stratospheric Expedition': {'score': 72, 'tier': 'B'},
    'Static Harvesting': {'score': 72, 'tier': 'B'},
    'Virus': {'score': 72, 'tier': 'B'},
    'Luna Governor': {'score': 71, 'tier': 'B'},
    'Ceres Tech Market': {'score': 71, 'tier': 'B'},
    'Colonizer Training Camp': {'score': 70, 'tier': 'B'},
    'Noctis Farming': {'score': 70, 'tier': 'B'},
    # C-tier
    'Productive Outpost': {'score': 68, 'tier': 'C'},
    'Rover Construction': {'score': 68, 'tier': 'C'},
    'Soil Studies': {'score': 67, 'tier': 'C'},
    'Neptunian Power Consultants': {'score': 67, 'tier': 'C'},
    'Envoys from Venus': {'score': 66, 'tier': 'C'},
    'Lava Flows': {'score': 65, 'tier': 'C'},
    'Protected Growth': {'score': 64, 'tier': 'C'},
    'Venus Shuttles': {'score': 63, 'tier': 'C'},
    'Energy Tapping': {'score': 63, 'tier': 'C'},
    'Summit Logistics': {'score': 63, 'tier': 'C'},
    'Vermin': {'score': 63, 'tier': 'C'},
    'Casinos': {'score': 62, 'tier': 'C'},
    'Corporate Stronghold': {'score': 62, 'tier': 'C'},
    'Floating Refinery': {'score': 62, 'tier': 'C'},
    'Spin-inducing Asteroid': {'score': 61, 'tier': 'C'},
    'Weather Balloons': {'score': 61, 'tier': 'C'},
    'Martian Lumber Corp': {'score': 58, 'tier': 'C'},
    'Airliners': {'score': 58, 'tier': 'C'},
    'Supermarkets': {'score': 57, 'tier': 'C'},
    'Biomass Combustors': {'score': 56, 'tier': 'C'},
    'House Printing': {'score': 56, 'tier': 'C'},
    'Asteroid Deflection System': {'score': 55, 'tier': 'C'},
    'Diversity Support': {'score': 55, 'tier': 'C'},
    # D-tier
    'Hackers': {'score': 48, 'tier': 'D'},
    'Aerosport Tournament': {'score': 44, 'tier': 'D'},
    'Food Factory': {'score': 42, 'tier': 'D'},
    'Titan Air-scrapping': {'score': 42, 'tier': 'D'},
    'Rotator Impacts': {'score': 42, 'tier': 'D'},
    'St. Joseph of Cupertino Mission': {'score': 40, 'tier': 'D'},
    # Corporations
    'Morning Star Inc.': {'score': 70, 'tier': 'B'},
    'Palladin Shipping': {'score': 58, 'tier': 'C'},
    'Tycho Magnetics': {'score': 58, 'tier': 'C'},
    # Preludes
    'High Circles': {'score': 85, 'tier': 'A'},
    'Experimental Forest': {'score': 82, 'tier': 'A'},
    'Planetary Alliance': {'score': 82, 'tier': 'A'},
    'Soil Bacteria': {'score': 76, 'tier': 'B'},
    'Double Down': {'score': 76, 'tier': 'B'},
    'Space Lanes': {'score': 73, 'tier': 'B'},
    'Focused Organization': {'score': 66, 'tier': 'C'},
    'Terraforming Deal': {'score': 62, 'tier': 'C'},
    'Recession': {'score': 58, 'tier': 'C'},
    'Board of Directors': {'score': 55, 'tier': 'C'},
    'Preservation Program': {'score': 48, 'tier': 'D'},
    'Venus Contract': {'score': 46, 'tier': 'D'},
}


def main():
    print("Загрузка данных...")
    all_cards = load_json('all_cards.json')
    cotd_lookup = load_json('cotd_lookup.json')
    cotd_mapping = load_json('cotd_card_mapping.json')
    image_mapping = load_json('image_mapping.json')

    print(f"Карт: {len(all_cards)}")
    print(f"COTD записей: {len(cotd_lookup)}")
    print(f"COTD маппингов: {len(cotd_mapping)}")
    print(f"Изображений: {len(image_mapping)}")

    # Инвертируем cotd_mapping: real_name -> [cotd_names]
    reverse_mapping = {}
    for cotd_name, real_name in cotd_mapping.items():
        if real_name not in reverse_mapping:
            reverse_mapping[real_name] = []
        reverse_mapping[real_name].append(cotd_name)

    # Обогащаем каждую карту
    cards_full = []
    with_cotd = 0
    with_image = 0
    with_eval = 0

    for card in all_cards:
        name = card['name']
        enriched = dict(card)

        # COTD данные
        cotd_entries = None
        # Поиск напрямую
        if name in cotd_lookup:
            cotd_entries = cotd_lookup[name]
        # Поиск через обратный маппинг
        elif name in reverse_mapping:
            for cotd_name in reverse_mapping[name]:
                if cotd_name in cotd_lookup:
                    if cotd_entries is None:
                        cotd_entries = []
                    cotd_entries.extend(cotd_lookup[cotd_name])

        cotd_summary = summarize_cotd_comments(cotd_entries)
        enriched['cotd'] = cotd_summary
        if cotd_summary:
            with_cotd += 1

        # Изображение
        enriched['image'] = image_mapping.get(name)
        if enriched['image']:
            with_image += 1

        # Существующая оценка
        existing = EXISTING_EVALUATIONS.get(name)
        enriched['existing_eval'] = existing
        if existing:
            with_eval += 1

        cards_full.append(enriched)

    # Разделяем по типу
    corps = [c for c in cards_full if c['type'] == 'corporation']
    preludes = [c for c in cards_full if c['type'] == 'prelude']
    projects = [c for c in cards_full if c['type'] in ('active', 'automated', 'event')]

    # Сортируем по имени
    corps.sort(key=lambda c: c['name'])
    preludes.sort(key=lambda c: c['name'])
    projects.sort(key=lambda c: c['name'])

    # Сохраняем
    output = {
        'corporations': corps,
        'preludes': preludes,
        'project_cards': projects,
        'stats': {
            'total': len(cards_full),
            'with_cotd': with_cotd,
            'with_image': with_image,
            'with_existing_eval': with_eval,
            'corps': len(corps),
            'preludes': len(preludes),
            'projects': len(projects),
        }
    }

    output_file = os.path.join(DATA_DIR, 'cards_for_evaluation.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nРезультат: {output_file}")
    print(f"  Корпорации: {len(corps)} ({sum(1 for c in corps if c['cotd'])} с COTD)")
    print(f"  Прелюдии: {len(preludes)} ({sum(1 for c in preludes if c['cotd'])} с COTD)")
    print(f"  Проектные: {len(projects)} ({sum(1 for c in projects if c['cotd'])} с COTD)")
    print(f"  С изображениями: {with_image}")
    print(f"  Уже оценены: {with_eval}")
    print(f"  Осталось оценить: {len(cards_full) - with_eval}")

    # Генерируем список для оценки без existing eval
    to_evaluate = {
        'corporations': [c for c in corps if not c['existing_eval']],
        'preludes': [c for c in preludes if not c['existing_eval']],
        'project_cards': [c for c in projects if not c['existing_eval']],
    }

    eval_file = os.path.join(DATA_DIR, 'cards_to_evaluate.json')
    with open(eval_file, 'w', encoding='utf-8') as f:
        json.dump(to_evaluate, f, ensure_ascii=False, indent=2)

    print(f"\nОсталось оценить:")
    print(f"  Корпорации: {len(to_evaluate['corporations'])}")
    print(f"  Прелюдии: {len(to_evaluate['preludes'])}")
    print(f"  Проектные: {len(to_evaluate['project_cards'])}")


if __name__ == '__main__':
    main()
