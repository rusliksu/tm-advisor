"""
Генерация markdown тир-листа прелюдий из оценок.
"""

import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'output')


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(os.path.join(DATA_DIR, 'prelude_evaluations.json'), 'r', encoding='utf-8') as f:
        evals = json.load(f)

    # All evaluations now in prelude_evaluations.json, no hardcoded entries needed

    # Load card data for IDs
    with open(os.path.join(DATA_DIR, 'card_index.json'), 'r', encoding='utf-8') as f:
        card_index = json.load(f)

    # Sort by score descending
    evals.sort(key=lambda x: -x['score'])

    # Group by tier
    tiers = {'S': [], 'A': [], 'B': [], 'C': [], 'D': [], 'F': []}
    for e in evals:
        tiers[e['tier']].append(e)

    # Generate markdown
    lines = []
    lines.append("# Тир-лист: Прелюдии")
    lines.append("")
    lines.append("**Формат:** 3P / WGT / Все дополнения")
    lines.append("")
    lines.append(f"**Всего оценено:** {len(evals)} прелюдий")
    lines.append("")
    lines.append("**Средняя ценность прелюдии:** ~24.5 MC")
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
        lines.append("| Прелюдия | Score | Теги | Ключевое |")
        lines.append("|----------|-------|------|----------|")

        for e in sorted(tier_cards, key=lambda x: -x['score']):
            name = e['name']
            card = card_index.get(name, {})
            tags = ', '.join(card.get('tags', [])) or '—'
            reasoning_short = e.get('reasoning', '')[:80].split('.')[0]
            lines.append(f"| {name} | {e['score']} | {tags} | {reasoning_short} |")

        lines.append("")
        lines.append("---")
        lines.append("")

    # Detailed analysis
    lines.append("## Подробный анализ")
    lines.append("")

    for e in evals:
        name = e['name']
        card = card_index.get(name, {})
        tags = ', '.join(card.get('tags', [])) or '—'
        expansion = card.get('expansion', '?')
        card_id = card.get('id', '?')

        lines.append(f"### {name} (#{card_id}) — {e['score']}/{e['tier']}")
        lines.append("")
        lines.append(f"Теги: {tags} | Дополнение: {expansion}")
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

    output_file = os.path.join(OUTPUT_DIR, 'TM_Tierlist_Preludes.md')
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"Тир-лист сохранён: {output_file}")
    print(f"Прелюдий: {len(evals)}")
    for tier_name in ['S', 'A', 'B', 'C', 'D', 'F']:
        if tiers[tier_name]:
            names = [e['name'] for e in sorted(tiers[tier_name], key=lambda x: -x['score'])]
            print(f"  {tier_name}: {len(tiers[tier_name])} — {', '.join(names)}")

    # Save evaluations to combined JSON
    eval_output = os.path.join(DATA_DIR, 'evaluations.json')
    existing_evals = {}
    if os.path.exists(eval_output):
        with open(eval_output, 'r', encoding='utf-8') as f:
            existing_evals = json.load(f)

    for e in evals:
        existing_evals[e['name']] = e

    with open(eval_output, 'w', encoding='utf-8') as f:
        json.dump(existing_evals, f, ensure_ascii=False, indent=2)
    print(f"\nОбщий файл оценок: {eval_output} ({len(existing_evals)} записей)")


if __name__ == '__main__':
    main()
