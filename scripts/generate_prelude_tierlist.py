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

    # Add existing evaluations (from CLAUDE.md reference data)
    existing = [
        {"name": "High Circles", "score": 85, "tier": "A",
         "economy": "3 delegates + 1 influence + draw 2. ~30 MC value.",
         "reasoning": "Политическое доминирование + отличная рука. Influence = постоянная защита.",
         "synergies": ["Septum Tribus", "Turmoil strategies"],
         "when_to_pick": "Всегда сильный. Turmoil стратегия."},
        {"name": "Experimental Forest", "score": 82, "tier": "A",
         "economy": "1 greenery + 2 Plant тег карты. ~28-30 MC.",
         "reasoning": "Greenery gen 1 = 1 TR + placement bonus. 2 выбранные Plant карты = engine. Plant тег ценный.",
         "synergies": ["Ecoline", "NRA", "Plant engine"],
         "when_to_pick": "Plant стратегия, NRA, Ecoline."},
        {"name": "Planetary Alliance", "score": 82, "tier": "A",
         "economy": "4 TR = ~28 MC. Earth тег ~2 MC.",
         "reasoning": "4 TR immediate = massive tempo. Earth тег для Point Luna. Один из лучших rush прелюдий.",
         "synergies": ["Point Luna", "UNMI", "TR rush"],
         "when_to_pick": "Всегда хороший. Особенно TR rush."},
        {"name": "Soil Bacteria", "score": 76, "tier": "B",
         "economy": "2 Microbe тег карты + 3 microbes. ~24-28 MC с синергиями.",
         "reasoning": "Microbe engine starter. 2 выбранные Microbe карты + 3 microbes для начала. Splice combo.",
         "synergies": ["Splice", "Decomposers", "Ants", "Tardigrades"],
         "when_to_pick": "Microbe стратегия, Splice."},
        {"name": "Double Down", "score": 76, "tier": "B",
         "economy": "Копирует другой прелюд. Value = копия - потеря слота.",
         "reasoning": "Зависит от парного прелюда. С Project Eden/Great Aquifer = S-tier. С плохим = F-tier.",
         "synergies": ["Project Eden", "Great Aquifer", "Huge Asteroid", "Allied Bank"],
         "when_to_pick": "Когда второй прелюд = A+ tier."},
        {"name": "Space Lanes", "score": 73, "tier": "B",
         "economy": "3 Trade Fleet → 3 колонии. ~24-27 MC в Colony играх.",
         "reasoning": "3 colonies = massive Colony engine. Но без Colonies = бесполезен.",
         "synergies": ["Poseidon", "Colony games", "Aridor"],
         "when_to_pick": "Только в Colony играх с хорошими колониями."},
        {"name": "Focused Organization", "score": 66, "tier": "C",
         "economy": "Effect: -1 MC на events/standard projects. ~3-4 MC/gen.",
         "reasoning": "Средний ongoing effect. Зависит от количества standard projects и events.",
         "synergies": ["Event-heavy strategies", "Standard projects"],
         "when_to_pick": "Event стратегия."},
        {"name": "Terraforming Deal", "score": 62, "tier": "C",
         "economy": "Effect: 1 MC за каждое terraforming другими. ~10-15 MC total в 3P.",
         "reasoning": "Пассивный доход от чужого terraforming. В 3P лучше чем в 2P.",
         "synergies": ["Long games", "Passive income"],
         "when_to_pick": "Длинные игры, passive стратегия."},
        {"name": "Recession", "score": 58, "tier": "C",
         "economy": "1 TR + draw 3 cards - discard 1 card. ~17-20 MC.",
         "reasoning": "Below average. TR + card selection = decent но не exciting.",
         "synergies": ["Card draw strategies"],
         "when_to_pick": "Когда нужен TR + card selection. Filler прелюд."},
        {"name": "Board of Directors", "score": 55, "tier": "C",
         "economy": "Effect: рисуй 1 карту когда играешь карту с 2+ requirements. ~2-3 cards/game.",
         "reasoning": "Slow card draw engine. Requirement карт не так много.",
         "synergies": ["Requirement-heavy hands"],
         "when_to_pick": "Только если много requirement карт в руке."},
        {"name": "Preservation Program", "score": 48, "tier": "D",
         "economy": "Effect: add 1 animal/microbe when opponent raises parameter. ~3-5 resources total.",
         "reasoning": "Slow, зависит от opponent actions. Animal/microbe resources слабо конвертируются.",
         "synergies": ["Animal cards", "Fish", "Livestock"],
         "when_to_pick": "Почти никогда. Слишком медленно."},
        {"name": "Venus Contract", "score": 46, "tier": "D",
         "economy": "Effect: +2 MC за Venus карты. ~4-6 MC total.",
         "reasoning": "Слишком мало Venus карт в средней игре для payoff.",
         "synergies": ["Morning Star Inc", "Venus strategy"],
         "when_to_pick": "Только с Morning Star Inc + Venus heavy hand."},
    ]
    evals.extend(existing)

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
