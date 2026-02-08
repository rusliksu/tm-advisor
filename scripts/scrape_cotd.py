"""
Сбор COTD (Card of the Day) постов из r/TerraformingMarsGame.
Собирает ВСЕ посты от Enson_Chan с тегом [COTD] и ВСЕ комментарии.
Работает без аутентификации через old.reddit.com JSON API.
"""

import json
import os
import re
import time
import sys
from datetime import datetime

import requests

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
HEADERS = {
    'User-Agent': 'TM_TierList_Research/1.0 (Card of the Day analysis for Terraforming Mars tier list)'
}
DELAY = 2.0  # seconds between requests

# Кэш для возобновления прерванного сбора
CACHE_FILE = os.path.join(DATA_DIR, 'cotd_cache.json')


def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'posts': {}, 'post_list_complete': False}


def save_cache(cache):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def fetch_json(url, params=None, max_retries=3):
    """Fetch JSON from Reddit API with retries and rate limiting."""
    for attempt in range(max_retries):
        try:
            time.sleep(DELAY)
            resp = requests.get(url, params=params, headers=HEADERS, timeout=30)
            if resp.status_code == 429:
                wait = int(resp.headers.get('Retry-After', 10))
                print(f"  Rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            if resp.status_code == 200:
                return resp.json()
            print(f"  HTTP {resp.status_code} for {url}")
            if attempt < max_retries - 1:
                time.sleep(5)
        except requests.RequestException as e:
            print(f"  Request error: {e}")
            if attempt < max_retries - 1:
                time.sleep(5)
    return None


def is_cotd_post(post_data):
    """Проверяет что пост — COTD от Enson_Chan."""
    title = post_data.get('title', '')
    author = post_data.get('author', '')
    subreddit = post_data.get('subreddit', '').lower()
    return (
        '[cotd]' in title.lower()
        and author.lower() == 'enson_chan'
        and subreddit == 'terraformingmarsgame'
    )


def extract_card_name(title):
    """Извлекает название карты из заголовка COTD поста."""
    # Типичные форматы:
    # [COTD] Birds | May 8, 2024
    # [COTD] Birds (#072)
    # [COTD] Birds (8 May 2024)
    # [COTD] #72 Birds
    match = re.search(r'\[COTD\]\s*(?:#?\d+\s+)?(.+?)(?:\s*[\|#(]|\s*$)', title, re.IGNORECASE)
    if match:
        name = match.group(1).strip()
        # Убираем trailing date patterns
        name = re.sub(r'\s*\d{1,2}\s+\w+\s+\d{4}\s*$', '', name)
        name = re.sub(r'\s*\w+\s+\d{1,2},?\s+\d{4}\s*$', '', name)
        return name.strip(' -–—|')
    return title.replace('[COTD]', '').strip()


def collect_posts_from_user_profile(cache):
    """Собирает COTD посты через профиль пользователя."""
    print("=== Сбор постов через профиль Enson_Chan ===")
    base_url = 'https://old.reddit.com/user/Enson_Chan/submitted.json'
    after = None
    page = 0
    new_posts = 0

    while True:
        page += 1
        params = {'limit': 100, 'sort': 'new', 'raw_json': 1}
        if after:
            params['after'] = after

        print(f"  Страница {page}, after={after}")
        data = fetch_json(base_url, params)
        if not data or 'data' not in data:
            print("  Нет данных, завершаем.")
            break

        children = data['data'].get('children', [])
        if not children:
            print("  Нет постов, завершаем.")
            break

        for child in children:
            post = child.get('data', {})
            if is_cotd_post(post):
                post_id = post['id']
                if post_id not in cache['posts']:
                    cache['posts'][post_id] = {
                        'id': post_id,
                        'title': post['title'],
                        'card_name': extract_card_name(post['title']),
                        'url': f"https://reddit.com{post['permalink']}",
                        'permalink': post['permalink'],
                        'date': datetime.utcfromtimestamp(post['created_utc']).strftime('%Y-%m-%d'),
                        'created_utc': post['created_utc'],
                        'num_comments': post.get('num_comments', 0),
                        'score': post.get('score', 0),
                        'selftext': post.get('selftext', ''),
                        'comments': None,  # будет заполнено позже
                    }
                    new_posts += 1

        after = data['data'].get('after')
        if not after:
            print("  Достигнут конец пагинации.")
            break

    print(f"  Найдено {new_posts} новых COTD постов (всего: {len(cache['posts'])})")
    return cache


def collect_posts_from_search(cache):
    """Дополнительный сбор через поиск (покрывает старые посты)."""
    print("\n=== Дополнительный сбор через поиск ===")
    base_url = 'https://old.reddit.com/r/TerraformingMarsGame/search.json'
    new_posts = 0

    for sort_mode in ['new', 'relevance', 'top', 'comments']:
        after = None
        page = 0

        while True:
            page += 1
            params = {
                'q': '[COTD] author:Enson_Chan',
                'sort': sort_mode,
                'restrict_sr': 'on',
                'limit': 100,
                't': 'all',
                'raw_json': 1,
            }
            if after:
                params['after'] = after

            print(f"  Поиск sort={sort_mode}, page={page}")
            data = fetch_json(base_url, params)
            if not data or 'data' not in data:
                break

            children = data['data'].get('children', [])
            if not children:
                break

            for child in children:
                post = child.get('data', {})
                if is_cotd_post(post):
                    post_id = post['id']
                    if post_id not in cache['posts']:
                        cache['posts'][post_id] = {
                            'id': post_id,
                            'title': post['title'],
                            'card_name': extract_card_name(post['title']),
                            'url': f"https://reddit.com{post['permalink']}",
                            'permalink': post['permalink'],
                            'date': datetime.utcfromtimestamp(post['created_utc']).strftime('%Y-%m-%d'),
                            'created_utc': post['created_utc'],
                            'num_comments': post.get('num_comments', 0),
                            'score': post.get('score', 0),
                            'selftext': post.get('selftext', ''),
                            'comments': None,
                        }
                        new_posts += 1

            after = data['data'].get('after')
            if not after:
                break

    print(f"  Найдено {new_posts} дополнительных COTD постов (всего: {len(cache['posts'])})")
    return cache


def extract_comments(comment_data, depth=0):
    """Рекурсивно извлекает комментарии из дерева Reddit."""
    comments = []

    if not comment_data or not isinstance(comment_data, dict):
        return comments

    kind = comment_data.get('kind', '')

    if kind == 'Listing':
        for child in comment_data.get('data', {}).get('children', []):
            comments.extend(extract_comments(child, depth))

    elif kind == 't1':
        data = comment_data.get('data', {})
        author = data.get('author', '[deleted]')
        body = data.get('body', '')

        if author != '[deleted]' or body not in ('[deleted]', '[removed]', ''):
            comment = {
                'id': data.get('id', ''),
                'author': author,
                'body': body,
                'score': data.get('score', 0),
                'parent_id': data.get('parent_id', ''),
                'depth': depth,
                'created_utc': data.get('created_utc', 0),
            }
            comments.append(comment)

        # Обработка вложенных ответов
        replies = data.get('replies', '')
        if replies and isinstance(replies, dict):
            comments.extend(extract_comments(replies, depth + 1))

    elif kind == 'more':
        # Запоминаем для possible дозагрузки
        data = comment_data.get('data', {})
        count = data.get('count', 0)
        if count > 0:
            comments.append({
                'type': 'more',
                'count': count,
                'children_ids': data.get('children', []),
            })

    return comments


def fetch_more_comments(post_id, children_ids):
    """Загружает скрытые комментарии через morechildren API."""
    if not children_ids:
        return []

    url = 'https://old.reddit.com/api/morechildren.json'
    params = {
        'api_type': 'json',
        'link_id': f't3_{post_id}',
        'children': ','.join(children_ids[:100]),  # max 100 per request
        'limit_children': 'false',
        'raw_json': 1,
    }

    data = fetch_json(url, params)
    if not data:
        return []

    comments = []
    things = data.get('json', {}).get('data', {}).get('things', [])
    for thing in things:
        if thing.get('kind') == 't1':
            td = thing.get('data', {})
            author = td.get('author', '[deleted]')
            body = td.get('body', '')
            if author != '[deleted]' or body not in ('[deleted]', '[removed]', ''):
                comments.append({
                    'id': td.get('id', ''),
                    'author': author,
                    'body': body,
                    'score': td.get('score', 0),
                    'parent_id': td.get('parent_id', ''),
                    'depth': td.get('depth', 0),
                    'created_utc': td.get('created_utc', 0),
                })

    return comments


def collect_comments_for_post(post):
    """Собирает все комментарии для одного поста."""
    post_id = post['id']
    url = f"https://old.reddit.com/r/TerraformingMarsGame/comments/{post_id}/.json"
    params = {'limit': 500, 'depth': 100, 'raw_json': 1}

    data = fetch_json(url, params)
    if not data or not isinstance(data, list) or len(data) < 2:
        return []

    # data[1] — дерево комментариев
    comments = extract_comments(data[1])

    # Обработка "more" маркеров
    more_items = [c for c in comments if isinstance(c, dict) and c.get('type') == 'more']
    real_comments = [c for c in comments if isinstance(c, dict) and c.get('type') != 'more']

    for more in more_items:
        if more.get('count', 0) > 0 and more.get('children_ids'):
            extra = fetch_more_comments(post_id, more['children_ids'])
            real_comments.extend(extra)

    return real_comments


def collect_all_comments(cache):
    """Собирает комментарии для всех постов без комментариев."""
    posts_needing_comments = [
        pid for pid, post in cache['posts'].items()
        if post.get('comments') is None
    ]

    if not posts_needing_comments:
        print("\nВсе комментарии уже собраны.")
        return cache

    total = len(posts_needing_comments)
    print(f"\n=== Сбор комментариев для {total} постов ===")
    print(f"    Примерное время: {total * DELAY / 60:.0f} минут")

    for i, post_id in enumerate(posts_needing_comments, 1):
        post = cache['posts'][post_id]
        card_name = post.get('card_name', '?')
        print(f"  [{i}/{total}] {card_name} ({post['date']}) — {post['num_comments']} comments")

        comments = collect_comments_for_post(post)
        cache['posts'][post_id]['comments'] = comments

        # Сохраняем кэш каждые 50 постов
        if i % 50 == 0:
            save_cache(cache)
            print(f"    Кэш сохранён ({i}/{total})")

    save_cache(cache)
    return cache


def build_cotd_lookup(cache):
    """Строит маппинг card_name -> COTD data."""
    lookup = {}

    for post_id, post in cache['posts'].items():
        card_name = post.get('card_name', '')
        if not card_name:
            continue

        entry = {
            'post_id': post_id,
            'title': post['title'],
            'url': post['url'],
            'date': post['date'],
            'num_comments': post.get('num_comments', 0),
            'comments': post.get('comments', []),
        }

        if card_name not in lookup:
            lookup[card_name] = []
        lookup[card_name].append(entry)

    # Сортируем по дате (новые первые)
    for card_name in lookup:
        lookup[card_name].sort(key=lambda x: x['date'], reverse=True)

    return lookup


def save_results(cache):
    """Сохраняет финальные результаты."""
    os.makedirs(DATA_DIR, exist_ok=True)

    # Список постов
    posts_list = sorted(cache['posts'].values(), key=lambda p: p.get('created_utc', 0), reverse=True)

    # Сохраняем полные данные
    cotd_file = os.path.join(DATA_DIR, 'cotd_posts.json')
    with open(cotd_file, 'w', encoding='utf-8') as f:
        json.dump(posts_list, f, ensure_ascii=False, indent=2)
    print(f"\nСохранено: {cotd_file} ({len(posts_list)} постов)")

    # Маппинг card -> COTD
    lookup = build_cotd_lookup(cache)
    lookup_file = os.path.join(DATA_DIR, 'cotd_lookup.json')
    with open(lookup_file, 'w', encoding='utf-8') as f:
        json.dump(lookup, f, ensure_ascii=False, indent=2)
    print(f"Сохранено: {lookup_file} ({len(lookup)} уникальных карт)")

    # Статистика
    total_comments = sum(
        len(p.get('comments', []) or [])
        for p in posts_list
    )
    print(f"\nСтатистика:")
    print(f"  Постов: {len(posts_list)}")
    print(f"  Уникальных карт: {len(lookup)}")
    print(f"  Комментариев: {total_comments}")

    # Карты с несколькими COTD
    multi = {k: len(v) for k, v in lookup.items() if len(v) > 1}
    if multi:
        print(f"  Карты с несколькими COTD: {len(multi)}")


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    # Аргументы командной строки
    skip_comments = '--skip-comments' in sys.argv
    posts_only = '--posts-only' in sys.argv

    cache = load_cache()

    # Шаг 1: Сбор списка постов
    if not cache.get('post_list_complete'):
        cache = collect_posts_from_user_profile(cache)
        cache = collect_posts_from_search(cache)
        cache['post_list_complete'] = True
        save_cache(cache)
    else:
        print(f"Используем кэшированный список: {len(cache['posts'])} постов")

    if posts_only:
        save_results(cache)
        return

    # Шаг 2: Сбор комментариев
    if not skip_comments:
        cache = collect_all_comments(cache)
    else:
        print("\nПропуск сбора комментариев (--skip-comments)")

    # Шаг 3: Сохранение
    save_results(cache)
    print("\n=== Готово! ===")


if __name__ == '__main__':
    main()
