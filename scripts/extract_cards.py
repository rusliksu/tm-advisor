"""
Извлечение и очистка данных карт из cards.json (сгенерирован из GitHub репо terraforming-mars).
Фильтрует только нужные дополнения для формата 3P/WGT/All Expansions.
"""

import json
import os
import re

REPO_CARDS = os.path.join(os.path.dirname(__file__), '..', 'tm-repo', 'src', 'genfiles', 'cards.json')
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')

# Дополнения которые мы включаем в tier list
INCLUDED_MODULES = {
    'base', 'corpera', 'venus', 'colonies', 'prelude', 'prelude2', 'turmoil', 'promo'
}

# Типы карт для tier list (исключаем standard_action, standard_project, ceo, proxy)
INCLUDED_TYPES = {
    'active', 'automated', 'event', 'corporation', 'prelude'
}

# Маппинг module -> человекочитаемое название
MODULE_NAMES = {
    'base': 'Base',
    'corpera': 'Corporate Era',
    'venus': 'Venus Next',
    'colonies': 'Colonies',
    'prelude': 'Prelude',
    'prelude2': 'Prelude 2',
    'turmoil': 'Turmoil',
    'promo': 'Promo',
    'community': 'Community',
}


def parse_requirements(reqs):
    """Преобразует requirements в человекочитаемую строку."""
    if not reqs:
        return None

    parts = []
    for req in reqs:
        is_max = req.get('max', False)
        prefix = 'Max ' if is_max else ''

        if 'oxygen' in req:
            parts.append(f"{prefix}{req['oxygen']}% oxygen")
        elif 'temperature' in req:
            parts.append(f"{prefix}{req['temperature']}°C")
        elif 'oceans' in req:
            parts.append(f"{prefix}{req['oceans']} oceans")
        elif 'venus' in req:
            parts.append(f"{prefix}{req['venus']}% Venus")
        elif 'tag' in req:
            count = req.get('count', 1)
            tag = req['tag'].capitalize()
            parts.append(f"{count} {tag} tag{'s' if count > 1 else ''}")
        elif 'production' in req:
            parts.append(f"Production")
        elif 'colonies' in req:
            parts.append(f"{req['colonies']} colonies")
        elif 'cities' in req:
            count = req.get('count', req.get('cities', 1))
            parts.append(f"{prefix}{count} {'city' if count == 1 else 'cities'}")
        elif 'greeneries' in req:
            count = req.get('count', req.get('greeneries', 1))
            parts.append(f"{prefix}{count} greeneries")
        elif 'tr' in req:
            parts.append(f"TR {req['tr']}")
        elif 'party' in req:
            parts.append(f"{req['party']} ruling")
        elif 'chairman' in req:
            parts.append("Chairman")
        elif 'partyLeader' in req:
            parts.append(f"Party leader: {req.get('partyLeader', '')}")
        else:
            # Catch-all for unknown requirements
            parts.append(str(req))

    return ' / '.join(parts) if parts else None


def parse_victory_points(vp):
    """Преобразует victoryPoints в строку."""
    if vp is None:
        return None
    if isinstance(vp, (int, float)):
        return str(int(vp))
    if isinstance(vp, str):
        return vp  # 'special'
    if isinstance(vp, dict):
        if 'resourcesHere' in vp:
            per = vp.get('per', 1)
            each = vp.get('each')
            if each == -1:
                return '-1/resource'
            if each:
                return f'{each}/resource'
            if per == 1:
                return '1/resource'
            return f'1/{per} resources'
        if 'tag' in vp:
            per = vp.get('per', 1)
            tag = vp['tag'].capitalize()
            if per == 1:
                return f'1/{tag} tag'
            return f'1/{per} {tag} tags'
        if 'cities' in vp:
            per = vp.get('per', 1)
            if per == 1:
                return '1/city'
            return f'1/{per} cities'
        if 'colonies' in vp:
            per = vp.get('per', 1)
            if per == 1:
                return '1/colony'
            return f'1/{per} colonies'
        if 'moon' in vp:
            return '1/moon tile'
        return str(vp)
    return str(vp)


def extract_effect_text(metadata):
    """Извлекает текстовое описание эффекта из metadata."""
    desc = metadata.get('description', '')

    # Также ищем текст в renderData
    render_data = metadata.get('renderData', {})
    texts = []

    def extract_texts(obj):
        if isinstance(obj, str) and len(obj) > 10:
            texts.append(obj)
        elif isinstance(obj, dict):
            for v in obj.values():
                extract_texts(v)
        elif isinstance(obj, list):
            for item in obj:
                extract_texts(item)

    if not desc and render_data:
        extract_texts(render_data)
        if texts:
            desc = ' '.join(texts)

    return desc or None


def process_card(card):
    """Обрабатывает одну карту и возвращает очищенный dict."""
    metadata = card.get('metadata', {})

    result = {
        'name': card['name'],
        'id': metadata.get('cardNumber', ''),
        'cost': card.get('cost', 0),
        'type': card['type'],
        'tags': [t.capitalize() for t in card.get('tags', [])],
        'module': card.get('module', ''),
        'expansion': MODULE_NAMES.get(card.get('module', ''), card.get('module', '')),
        'requirements': parse_requirements(card.get('requirements', [])),
        'description': extract_effect_text(metadata),
        'victoryPoints': parse_victory_points(card.get('victoryPoints')),
        'resourceType': card.get('resourceType'),
        'hasAction': card.get('hasAction', False),
        'productionBox': card.get('productionBox', {}),
        'compatibility': card.get('compatibility', []),
    }

    # Корпорации
    if card['type'] == 'corporation':
        result['startingMegaCredits'] = card.get('startingMegaCredits', 0)
        result['cardCost'] = card.get('cardCost')

    # Прелюдии
    if card['type'] == 'prelude':
        result['startingMegaCredits'] = card.get('startingMegaCredits', 0)

    # Убираем пустые productionBox
    prod = result['productionBox']
    if prod and all(v == 0 for v in prod.values()):
        result['productionBox'] = None

    # Убираем None значения
    result = {k: v for k, v in result.items() if v is not None}

    return result


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    with open(REPO_CARDS, 'r', encoding='utf-8') as f:
        raw_cards = json.load(f)

    print(f"Загружено {len(raw_cards)} карт из cards.json")

    # Фильтруем по включённым модулям и типам
    filtered = [c for c in raw_cards
                if c.get('module') in INCLUDED_MODULES
                and c.get('type') in INCLUDED_TYPES]

    print(f"После фильтрации: {len(filtered)} карт")

    # Обрабатываем карты
    all_cards = [process_card(c) for c in filtered]

    # Разделяем по категориям
    corporations = [c for c in all_cards if c['type'] == 'corporation']
    preludes = [c for c in all_cards if c['type'] == 'prelude']
    project_cards = [c for c in all_cards if c['type'] in ('active', 'automated', 'event')]

    # Сортируем
    corporations.sort(key=lambda c: c['name'])
    preludes.sort(key=lambda c: c['name'])
    project_cards.sort(key=lambda c: c['name'])

    # Статистика
    print(f"\nКорпорации: {len(corporations)}")
    print(f"Прелюдии: {len(preludes)}")
    print(f"Проектные карты: {len(project_cards)}")

    by_module = {}
    for c in all_cards:
        by_module[c['expansion']] = by_module.get(c['expansion'], 0) + 1
    print(f"\nПо дополнениям:")
    for mod, count in sorted(by_module.items()):
        print(f"  {mod}: {count}")

    by_type = {}
    for c in project_cards:
        by_type[c['type']] = by_type.get(c['type'], 0) + 1
    print(f"\nПроектные карты по типу:")
    for t, count in sorted(by_type.items()):
        print(f"  {t}: {count}")

    # Сохраняем
    def save_json(filename, data):
        path = os.path.join(DATA_DIR, filename)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"\nСохранено: {path} ({len(data)} записей)")

    save_json('all_cards.json', all_cards)
    save_json('corporations.json', corporations)
    save_json('preludes.json', preludes)
    save_json('project_cards.json', project_cards)

    # Создаём индекс для быстрого поиска
    card_index = {c['name']: c for c in all_cards}
    save_json('card_index.json', card_index)

    print(f"\n=== Готово! ===")


if __name__ == '__main__':
    main()
