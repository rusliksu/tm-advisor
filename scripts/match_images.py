"""
Матчинг изображений карт из card-images-repo с данными карт.
Создаёт маппинг card_name -> image_path и копирует в images/.
"""

import json
import os
import re
import shutil
from difflib import SequenceMatcher

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
IMAGES_REPO = os.path.join(os.path.dirname(__file__), '..', 'card-images-repo')
IMAGES_DIR = os.path.join(os.path.dirname(__file__), '..', 'images')


def normalize_filename(filename):
    """Извлекает имя карты из filename."""
    # Remove extension and number prefix
    name = os.path.splitext(filename)[0]
    # Remove number prefix (001-, corp01-, p01-, x01-, c01-, etc.)
    name = re.sub(r'^(?:corp|promo|p|x|c|t|bb)?\d+[-_]', '', name)
    # Replace underscores with spaces
    name = name.replace('_', ' ').strip()
    return name


def normalize_card_name(name):
    """Нормализует имя карты для сравнения."""
    return name.lower().replace("'", '').replace('"', '').replace('-', ' ').replace('.', '').strip()


def match_images():
    # Загрузка данных карт
    with open(os.path.join(DATA_DIR, 'all_cards.json'), 'r', encoding='utf-8') as f:
        all_cards = json.load(f)

    card_names = {c['name']: c for c in all_cards}
    norm_to_card = {normalize_card_name(name): name for name in card_names}

    # Список изображений
    image_files = [f for f in os.listdir(IMAGES_REPO) if f.endswith('.png')]
    print(f"Изображений: {len(image_files)}")
    print(f"Карт: {len(card_names)}")

    matched = {}
    unmatched_images = []

    for img_file in sorted(image_files):
        img_name = normalize_filename(img_file)
        norm_img = normalize_card_name(img_name)

        # Точное совпадение
        if norm_img in norm_to_card:
            card_name = norm_to_card[norm_img]
            matched[card_name] = img_file
            continue

        # Fuzzy match
        best_match = None
        best_score = 0
        for norm_card, card_name in norm_to_card.items():
            score = SequenceMatcher(None, norm_img, norm_card).ratio()
            if score > best_score:
                best_score = score
                best_match = card_name

        if best_score >= 0.85:
            matched[best_match] = img_file
        else:
            unmatched_images.append((img_file, img_name, best_match, best_score))

    # Статистика
    matched_cards = set(matched.keys())
    unmatched_cards = [c['name'] for c in all_cards if c['name'] not in matched_cards]

    print(f"\nСопоставлено: {len(matched)}")
    print(f"Изображений без карты: {len(unmatched_images)}")
    print(f"Карт без изображения: {len(unmatched_cards)}")

    # Классификация карт без изображений
    corps_no_img = [n for n in unmatched_cards if card_names[n]['type'] == 'corporation']
    prel_no_img = [n for n in unmatched_cards if card_names[n]['type'] == 'prelude']
    proj_no_img = [n for n in unmatched_cards if card_names[n]['type'] in ('active', 'automated', 'event')]

    print(f"\n  Корпорации без фото: {len(corps_no_img)}")
    if corps_no_img:
        for n in corps_no_img[:10]:
            print(f"    - {n}")
    print(f"  Прелюдии без фото: {len(prel_no_img)}")
    if prel_no_img:
        for n in prel_no_img[:10]:
            print(f"    - {n}")
    print(f"  Проектные без фото: {len(proj_no_img)}")

    # Организуем изображения по типу карты
    os.makedirs(os.path.join(IMAGES_DIR, 'corporations'), exist_ok=True)
    os.makedirs(os.path.join(IMAGES_DIR, 'preludes'), exist_ok=True)
    os.makedirs(os.path.join(IMAGES_DIR, 'project_cards'), exist_ok=True)

    copied = 0
    for card_name, img_file in matched.items():
        card = card_names[card_name]
        card_type = card['type']

        if card_type == 'corporation':
            dest_dir = os.path.join(IMAGES_DIR, 'corporations')
        elif card_type == 'prelude':
            dest_dir = os.path.join(IMAGES_DIR, 'preludes')
        else:
            dest_dir = os.path.join(IMAGES_DIR, 'project_cards')

        src = os.path.join(IMAGES_REPO, img_file)
        # Используем clean filename
        safe_name = re.sub(r'[^\w\-.]', '_', card_name) + '.png'
        dst = os.path.join(dest_dir, safe_name)

        if not os.path.exists(dst):
            shutil.copy2(src, dst)
            copied += 1

    print(f"\nСкопировано изображений: {copied}")

    # Сохраняем маппинг
    image_mapping = {}
    for card_name, img_file in matched.items():
        card = card_names[card_name]
        card_type = card['type']
        if card_type == 'corporation':
            subdir = 'corporations'
        elif card_type == 'prelude':
            subdir = 'preludes'
        else:
            subdir = 'project_cards'

        safe_name = re.sub(r'[^\w\-.]', '_', card_name) + '.png'
        image_mapping[card_name] = f"images/{subdir}/{safe_name}"

    mapping_file = os.path.join(DATA_DIR, 'image_mapping.json')
    with open(mapping_file, 'w', encoding='utf-8') as f:
        json.dump(image_mapping, f, ensure_ascii=False, indent=2)
    print(f"Маппинг сохранён: {mapping_file}")


if __name__ == '__main__':
    match_images()
