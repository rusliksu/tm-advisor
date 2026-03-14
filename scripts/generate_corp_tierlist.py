"""
Генерация markdown тир-листа корпораций из оценок.
"""

import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'output')


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Single source of truth: evaluations.json
    with open(os.path.join(DATA_DIR, 'evaluations.json'), 'r', encoding='utf-8') as f:
        all_evals = json.load(f)

    # Load card data for IDs
    with open(os.path.join(DATA_DIR, 'card_index.json'), 'r', encoding='utf-8') as f:
        card_index = json.load(f)

    # Filter corporations from evaluations.json
    evals = []
    for name, ev in all_evals.items():
        card_type = card_index.get(name, {}).get("type", ev.get("type", ""))
        if card_type == "corporation":
            entry = dict(ev)
            entry["name"] = name
            evals.append(entry)

    # Sort by score descending
    evals.sort(key=lambda x: -x['score'])

    # Group by tier
    tiers = {'S': [], 'A': [], 'B': [], 'C': [], 'D': [], 'F': []}
    for e in evals:
        tiers[e['tier']].append(e)

    # Generate markdown
    lines = []
    lines.append("# Тир-лист: Корпорации")
    lines.append("")
    lines.append("**Формат:** 3P / WGT / Все дополнения")
    lines.append("")
    lines.append(f"**Всего оценено:** {len(evals)} корпораций")
    lines.append("")
    lines.append("---")
    lines.append("")

    tier_colors = {
        'S': 'Must-pick, берёшь всегда',
        'A': 'Почти всегда берём',
        'B': 'Хорош с синергией',
        'C': 'Ситуативный',
        'D': 'Очень слабый',
        'F': 'Trap-карта',
    }

    for tier_name in ['S', 'A', 'B', 'C', 'D', 'F']:
        tier_cards = tiers[tier_name]
        if not tier_cards:
            continue

        lines.append(f"## {tier_name}-Tier ({len(tier_cards)}) — {tier_colors[tier_name]}")
        lines.append("")
        lines.append("| Корпорация | Score | Старт MC | Теги | Ключевое |")
        lines.append("|------------|-------|----------|------|----------|")

        for e in sorted(tier_cards, key=lambda x: -x['score']):
            name = e['name']
            card = card_index.get(name, {})
            start_mc = card.get('startingMegaCredits', '?')
            tags = ', '.join(card.get('tags', [])) or '—'
            # Short key phrase
            reasoning_short = e.get('reasoning', '')[:80].split('.')[0]
            lines.append(f"| {name} | {e['score']} | {start_mc} | {tags} | {reasoning_short} |")

        lines.append("")
        lines.append("---")
        lines.append("")

    # Detailed analysis
    lines.append("## Подробный анализ")
    lines.append("")

    for e in evals:
        name = e['name']
        card = card_index.get(name, {})
        start_mc = card.get('startingMegaCredits', '?')
        tags = ', '.join(card.get('tags', [])) or '—'
        expansion = card.get('expansion', '?')
        card_id = card.get('id', '?')

        lines.append(f"### {name} (#{card_id}) — {e['score']}/{e['tier']}")
        lines.append("")
        lines.append(f"Старт: {start_mc} MC | Теги: {tags} | Дополнение: {expansion}")
        lines.append("")
        lines.append(f"**Экономика:** {e['economy']}")
        lines.append("")
        lines.append(f"**Почему {e['tier']} ({e['score']}):** {e['reasoning']}")
        lines.append("")
        if e.get('synergies'):
            lines.append(f"**Синергии:** {', '.join(e['synergies'])}")
            lines.append("")
        lines.append(f"**Когда брать:** {e['when_to_pick']}")
        lines.append("")
        lines.append("---")
        lines.append("")

    output_file = os.path.join(OUTPUT_DIR, 'TM_Tierlist_Corporations.md')
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"Тир-лист сохранён: {output_file}")
    print(f"Корпораций: {len(evals)}")
    for tier_name in ['S', 'A', 'B', 'C', 'D', 'F']:
        if tiers[tier_name]:
            names = [e['name'] for e in sorted(tiers[tier_name], key=lambda x: -x['score'])]
            print(f"  {tier_name}: {len(tiers[tier_name])} — {', '.join(names)}")

    print(f"\nИсточник данных: evaluations.json (single source of truth)")


if __name__ == '__main__':
    main()
