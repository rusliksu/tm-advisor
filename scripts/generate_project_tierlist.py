"""
Генерация markdown тир-листа проектных карт из оценок.
Объединяет результаты из batch файлов + существующие оценки.
"""

import json
import os
import glob

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'output')


# Existing evaluations from CLAUDE.md reference data
EXISTING_EVALUATIONS = [
    {"name": "Cutting Edge Technology", "score": 84, "tier": "A",
     "economy": "-2 MC за requirement карты + 1 VP. Топ engine карта.",
     "reasoning": "Универсальный дискаунт на req карты. 1 VP бонусом. Science тег ценный.",
     "synergies": ["Requirement cards", "Science tag cards", "AI Central"],
     "when_to_pick": "Всегда хорош если есть 2+ req карт в руке."},
    {"name": "Imported Hydrogen", "score": 80, "tier": "A",
     "economy": "Тройной тег + ocean + flexible resources. Ti payable.",
     "reasoning": "3 тега (Earth, Space, Event) за одну карту + ocean + 3 microbes/animals OR 3 plants. Ti payable снижает cost.",
     "synergies": ["Point Luna", "Splice", "Animal/Microbe cards", "Ti-heavy corps"],
     "when_to_pick": "Когда есть animal/microbe targets. Тройной тег всегда ценен."},
    {"name": "Mining Colony", "score": 78, "tier": "B",
     "economy": "Colony placement + 1 ti-prod. Space тег. ~24-28 MC value.",
     "reasoning": "Colony + ti-prod = отличная комбинация. Space тег. Зависит от доступных колоний.",
     "synergies": ["Titan colony", "Io colony", "Saturn Systems", "Phobolog"],
     "when_to_pick": "Когда хорошие колонии доступны."},
    {"name": "Venus Orbital Survey", "score": 78, "tier": "B",
     "economy": "Action: free Venus cards. Ti payable. No req.",
     "reasoning": "Free Venus cards каждый ход = engine. Ti payable. Нет requirements.",
     "synergies": ["Morning Star Inc", "Venus cards", "Dirigibles"],
     "when_to_pick": "Venus стратегия."},
    {"name": "Electro Catapult", "score": 77, "tier": "B",
     "economy": "~5 MC/action + 1 VP. Building тег. Req 17 O2.",
     "reasoning": "Отличная action карта с Building тегом. ~5 MC за action + 1 VP.",
     "synergies": ["Steel production", "Building tags", "Energy production"],
     "when_to_pick": "С energy + steel/plant production."},
    {"name": "Birds", "score": 76, "tier": "B",
     "economy": "13 MC за 3-4 VP self-contained. Animal тег.",
     "reasoning": "Сильная VP карта, но 13% O2 = mid-late. Нужны animal placement для 5+ VP.",
     "synergies": ["Large Convoy", "Imported Nitrogen", "Miranda colony", "Ecological Zone"],
     "when_to_pick": "Animal placement cards в engine, 13% O2 close."},
    {"name": "Red Ships", "score": 75, "tier": "B",
     "economy": "5 MC total. Scaling action 4-7 MC/action late game.",
     "reasoning": "Дешёвая action карта с высоким ceiling. Stall value бонусом.",
     "synergies": ["Late game", "Stall strategies"],
     "when_to_pick": "Почти всегда. Дёшево, scaling value."},
    {"name": "Open City", "score": 74, "tier": "B",
     "economy": "Best city base game. Steel dump.",
     "reasoning": "4 MC-prod + city + 1 VP. Steel payable. Лучшая city карта в base.",
     "synergies": ["Steel production", "City adjacency", "Tharsis Republic"],
     "when_to_pick": "С steel. Mayor milestone."},
    {"name": "Sponsoring Nation", "score": 74, "tier": "B",
     "economy": "3 TR + 2 delegates. Req 4 Earth.",
     "reasoning": "3 TR отличный rate + political influence. Req 4 Earth — нужны Earth теги.",
     "synergies": ["Point Luna", "Teractor", "Earth tag cards"],
     "when_to_pick": "С 4+ Earth тегами."},
    {"name": "Atmoscoop", "score": 72, "tier": "B",
     "economy": "2 TR + 2 floaters + VP. Req 3 Science.",
     "reasoning": "2 TR + floater bonus + VP. Science req ограничивает timing.",
     "synergies": ["Science tags", "Venus cards", "Dirigibles"],
     "when_to_pick": "С 3 Science тегами."},
    {"name": "Colonial Representation", "score": 72, "tier": "B",
     "economy": "+1 influence permanent + colony rebate.",
     "reasoning": "Permanent influence = ongoing value. Colony cost reduction.",
     "synergies": ["Colony strategies", "Turmoil"],
     "when_to_pick": "Colony + Turmoil games."},
    {"name": "Hermetic Order of Mars", "score": 72, "tier": "B",
     "economy": "2 MC-prod + MC rebate. Max 4% O2. No tags.",
     "reasoning": "Хороший early game MC engine. No tags — штраф.",
     "synergies": ["Early game", "MC production"],
     "when_to_pick": "Early game, O2 < 4%."},
    {"name": "Stratospheric Expedition", "score": 72, "tier": "B",
     "economy": "Triple tag + 2 floaters + 2 Venus cards + VP.",
     "reasoning": "3 тега + floaters + card draw + VP. Venus specific.",
     "synergies": ["Morning Star Inc", "Venus cards", "Splice"],
     "when_to_pick": "Venus стратегия."},
    {"name": "Static Harvesting", "score": 72, "tier": "B",
     "economy": "Power Plant + Building bonus.",
     "reasoning": "Energy prod + Building тег. Steel payable.",
     "synergies": ["Building tags", "Energy sinks", "Colonies"],
     "when_to_pick": "С energy sinks или Colonies."},
    {"name": "Virus", "score": 72, "tier": "B",
     "economy": "4 MC total attack. Microbe тег.",
     "reasoning": "Дешёвая attack карта. -5 plants opponent. Microbe тег ценный.",
     "synergies": ["Splice", "Decomposers", "Microbe cards"],
     "when_to_pick": "Почти всегда. Дёшево + Microbe тег."},
    {"name": "Luna Governor", "score": 71, "tier": "B",
     "economy": "3.5 MC/prod. 2 Earth тега. Point Luna OP.",
     "reasoning": "2 Earth тега на одной карте = редкость. Point Luna combo.",
     "synergies": ["Point Luna", "Teractor", "Earth tag cards"],
     "when_to_pick": "С Point Luna = must-pick. Иначе solid B."},
    {"name": "Ceres Tech Market", "score": 71, "tier": "B",
     "economy": "Science+Space. Colony rebate. Card action.",
     "reasoning": "2 ценных тега + colony rebate + card filtering action.",
     "synergies": ["Colony strategies", "Science tags", "Saturn Systems"],
     "when_to_pick": "Colony games + science strategy."},
    {"name": "Colonizer Training Camp", "score": 70, "tier": "B",
     "economy": "Cheap Jovian + 2 VP. Steel dump.",
     "reasoning": "Дешёвый Jovian тег + 2 VP. Steel payable.",
     "synergies": ["Jovian multipliers", "Rim Settler", "Steel production"],
     "when_to_pick": "Jovian стратегия, steel в руке."},
    {"name": "Noctis Farming", "score": 70, "tier": "B",
     "economy": "Steel dump + VP + NRA enabler.",
     "reasoning": "MC-prod + VP + Plant тег для NRA.",
     "synergies": ["NRA", "Steel", "Plant tags"],
     "when_to_pick": "NRA стратегия, steel heavy."},
    {"name": "Productive Outpost", "score": 68, "tier": "C",
     "economy": "Free colony bonuses. Нужно 2+ колоний.",
     "reasoning": "Free production from colonies. Зависит от количества колоний.",
     "synergies": ["Multiple colonies", "Poseidon", "Colony strategies"],
     "when_to_pick": "С 2+ colonies already placed."},
    {"name": "Rover Construction", "score": 68, "tier": "C",
     "economy": "+2 MC per city. Steel dump + VP.",
     "reasoning": "Ongoing city bonus. Steel payable. 1 VP.",
     "synergies": ["City-heavy strategies", "Tharsis Republic"],
     "when_to_pick": "На Tharsis, city strategy."},
    {"name": "Soil Studies", "score": 67, "tier": "C",
     "economy": "Cheap greenery при 8+ plants. Triple tag.",
     "reasoning": "3 тега за дёшево + greenery bonus. Req 8 plants.",
     "synergies": ["Plant production", "NRA", "Ecoline"],
     "when_to_pick": "Plant strategy, NRA."},
    {"name": "Neptunian Power Consultants", "score": 67, "tier": "C",
     "economy": "5 MC (steel) → energy+VP per ocean.",
     "reasoning": "Conditional VP + energy. Нужны oceans.",
     "synergies": ["Ocean strategies", "Steel production"],
     "when_to_pick": "Ocean-heavy games."},
    {"name": "Envoys from Venus", "score": 66, "tier": "C",
     "economy": "4 MC за 2 delegates. Req 3 Venus.",
     "reasoning": "Дешёвые delegates. Venus req ограничивает.",
     "synergies": ["Venus strategy", "Turmoil"],
     "when_to_pick": "Venus + Turmoil."},
    {"name": "Lava Flows", "score": 65, "tier": "C",
     "economy": "2 TR за 21 MC.",
     "reasoning": "2 temp raises + placement. Standard project-like efficiency.",
     "synergies": ["Temperature strategy", "Helion"],
     "when_to_pick": "Temp rush."},
    {"name": "Protected Growth", "score": 64, "tier": "C",
     "economy": "Cheap. Нужно 3+ Power тегов.",
     "reasoning": "Conditional value. Power тегов мало.",
     "synergies": ["Power tag cards", "Thorgate"],
     "when_to_pick": "3+ Power тегов."},
    {"name": "Venus Shuttles", "score": 63, "tier": "C",
     "economy": "Action: 12-X MC → Venus raise + 2 floaters.",
     "reasoning": "Venus raise action. Slow but repeatable.",
     "synergies": ["Venus strategy", "Morning Star Inc"],
     "when_to_pick": "Venus engine."},
    {"name": "Energy Tapping", "score": 63, "tier": "C",
     "economy": "Take-that в 3P. Power тег.",
     "reasoning": "-1 energy-prod opponent + gain 1. Take-that penalty в 3P. -1 VP.",
     "synergies": ["Power tag", "Energy needs"],
     "when_to_pick": "Когда нужен Power тег + energy."},
    {"name": "Summit Logistics", "score": 63, "tier": "C",
     "economy": "2 карты. Req Scientists.",
     "reasoning": "Card draw с Science req.",
     "synergies": ["Science strategy"],
     "when_to_pick": "Science heavy."},
    {"name": "Vermin", "score": 63, "tier": "C",
     "economy": "Microbe+Animal теги.",
     "reasoning": "2 био-тега за дёшево. Action для VP.",
     "synergies": ["Splice", "Ecologist", "Bio tags"],
     "when_to_pick": "Bio tag strategy."},
    {"name": "Casinos", "score": 62, "tier": "C",
     "economy": "3.75 MC/prod. 2 жёстких req.",
     "reasoning": "Хорошая production но 2 requirements.",
     "synergies": ["Earth tag", "Steel"],
     "when_to_pick": "Когда оба req met."},
    {"name": "Corporate Stronghold", "score": 62, "tier": "C",
     "economy": "Cheap city + 3 MC-prod. -2 VP.",
     "reasoning": "City + production но -2 VP penalty.",
     "synergies": ["City strategy", "Steel"],
     "when_to_pick": "City strategy, Mayor milestone."},
    {"name": "Floating Refinery", "score": 62, "tier": "C",
     "economy": "Venus engine. Slow.",
     "reasoning": "Floater-based Venus production. Slow action.",
     "synergies": ["Venus strategy", "Floater cards"],
     "when_to_pick": "Venus engine."},
    {"name": "Spin-inducing Asteroid", "score": 61, "tier": "C",
     "economy": "2 Venus TR за 19 MC. Ti payable.",
     "reasoning": "2 Venus TR. Ti payable снижает cost. Event тег.",
     "synergies": ["Venus strategy", "Ti production"],
     "when_to_pick": "Venus + ti."},
    {"name": "Weather Balloons", "score": 61, "tier": "C",
     "economy": "Science тег + карта.",
     "reasoning": "Cheap Science тег + draw. Filler.",
     "synergies": ["Science strategy", "AI Central"],
     "when_to_pick": "Science тег needed."},
    {"name": "Martian Lumber Corp", "score": 58, "tier": "C",
     "economy": "NRA enabler. Effect = trap.",
     "reasoning": "Plant тег для NRA. Ongoing effect слабый.",
     "synergies": ["NRA", "Plant tags"],
     "when_to_pick": "NRA enabler only."},
    {"name": "Airliners", "score": 58, "tier": "C",
     "economy": "Req 3 floaters. No tags.",
     "reasoning": "Req сложный. No tags penalty. Floater bonus.",
     "synergies": ["Floater cards", "Venus"],
     "when_to_pick": "С 3+ floaters already."},
    {"name": "Supermarkets", "score": 57, "tier": "C",
     "economy": "No tags. Acquired Company лучше.",
     "reasoning": "MC-prod + VP но no tags penalty. Строго хуже Acquired Company.",
     "synergies": ["MC production"],
     "when_to_pick": "Filler."},
    {"name": "Biomass Combustors", "score": 56, "tier": "C",
     "economy": "Take-that в 3P. Good tags.",
     "reasoning": "-1 plant-prod opponent. Take-that penalty. Building+Microbe теги спасают.",
     "synergies": ["Building tags", "Splice"],
     "when_to_pick": "Когда нужны теги."},
    {"name": "House Printing", "score": 56, "tier": "C",
     "economy": "1 steel-prod + VP. Break-even.",
     "reasoning": "1 steel-prod + 1 VP. Building тег. Marginal value.",
     "synergies": ["Building tags", "Steel"],
     "when_to_pick": "Building тег filler."},
    {"name": "Asteroid Deflection System", "score": 55, "tier": "C",
     "economy": "Triple tag + plant protect.",
     "reasoning": "3 тега ценные. Plant protection niche.",
     "synergies": ["Point Luna", "Splice", "Space tags"],
     "when_to_pick": "Tag synergies."},
    {"name": "Diversity Support", "score": 55, "tier": "C",
     "economy": "1 TR за 4 MC if condition met.",
     "reasoning": "Conditional 1 TR. Execution difficulty.",
     "synergies": ["Diverse tags"],
     "when_to_pick": "С 9 разными тегами."},
    {"name": "Hackers", "score": 48, "tier": "D",
     "economy": "Take-that в 3P.",
     "reasoning": "В 2P сильная, в 3P = D-тир. Третий игрок выигрывает бесплатно.",
     "synergies": ["2P games"],
     "when_to_pick": "Только в 2P."},
    {"name": "Aerosport Tournament", "score": 44, "tier": "D",
     "economy": "5 floaters req.",
     "reasoning": "Req слишком сложный. Floater trap.",
     "synergies": ["Floater cards"],
     "when_to_pick": "Почти никогда."},
    {"name": "Food Factory", "score": 42, "tier": "D",
     "economy": "-1 plant-prod conflict.",
     "reasoning": "Конфликт с plant strategy. No tags.",
     "synergies": [],
     "when_to_pick": "Почти никогда."},
    {"name": "Titan Air-scrapping", "score": 42, "tier": "D",
     "economy": "24 MC. Slow action.",
     "reasoning": "Дорого + медленная action. Floater trap.",
     "synergies": ["Venus floater cards"],
     "when_to_pick": "Почти никогда."},
    {"name": "Rotator Impacts", "score": 42, "tier": "D",
     "economy": "6 MC/2 actions → 1 Venus TR. Slow.",
     "reasoning": "Floater trap. 2 действия на 1 TR = слишком медленно.",
     "synergies": ["Venus strategy"],
     "when_to_pick": "Почти никогда."},
    {"name": "St. Joseph of Cupertino Mission", "score": 40, "tier": "D",
     "economy": "Security Fleet v2. No tags.",
     "reasoning": "Медленная VP accumulation. No tags.",
     "synergies": [],
     "when_to_pick": "Почти никогда."},
]


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Load batch evaluation results
    all_evals = []
    for i in range(1, 8):
        batch_file = os.path.join(DATA_DIR, f'project_evaluations_batch{i}.json')
        if os.path.exists(batch_file):
            with open(batch_file, 'r', encoding='utf-8') as f:
                batch = json.load(f)
                all_evals.extend(batch)
                print(f"Batch {i}: {len(batch)} карт")
        else:
            print(f"Batch {i}: НЕ НАЙДЕН ({batch_file})")

    # Add existing evaluations
    existing_names = {e['name'] for e in all_evals}
    for e in EXISTING_EVALUATIONS:
        if e['name'] not in existing_names:
            all_evals.append(e)

    print(f"\nВсего проектных карт с оценками: {len(all_evals)}")

    # Load card data for IDs
    with open(os.path.join(DATA_DIR, 'card_index.json'), 'r', encoding='utf-8') as f:
        card_index = json.load(f)

    # Sort by score descending
    all_evals.sort(key=lambda x: -x['score'])

    # Group by tier
    tiers = {'S': [], 'A': [], 'B': [], 'C': [], 'D': [], 'F': []}
    for e in all_evals:
        tiers[e['tier']].append(e)

    # Generate markdown
    lines = []
    lines.append("# Тир-лист: Проектные карты")
    lines.append("")
    lines.append("**Формат:** 3P / WGT / Все дополнения")
    lines.append("")
    lines.append(f"**Всего оценено:** {len(all_evals)} проектных карт")
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
        lines.append("| Карта | Score | Стоимость | Теги | Тип | Ключевое |")
        lines.append("|-------|-------|-----------|------|-----|----------|")

        for e in sorted(tier_cards, key=lambda x: -x['score']):
            name = e['name']
            card = card_index.get(name, {})
            cost = card.get('cost', '?')
            tags = ', '.join(card.get('tags', [])) or '—'
            card_type = card.get('type', '?')
            reasoning_short = e.get('reasoning', '')[:60].split('.')[0]
            lines.append(f"| {name} | {e['score']} | {cost} | {tags} | {card_type} | {reasoning_short} |")

        lines.append("")
        lines.append("---")
        lines.append("")

    # Detailed analysis
    lines.append("## Подробный анализ")
    lines.append("")

    for e in all_evals:
        name = e['name']
        card = card_index.get(name, {})
        cost = card.get('cost', '?')
        tags = ', '.join(card.get('tags', [])) or '—'
        expansion = card.get('expansion', '?')
        card_id = card.get('id', '?')
        card_type = card.get('type', '?')
        req = card.get('requirements', '')
        vp = card.get('victoryPoints', '')

        lines.append(f"### {name} (#{card_id}) — {e['score']}/{e['tier']}")
        lines.append("")
        header_parts = [f"Стоимость: {cost} MC"]
        if req:
            header_parts.append(f"Требования: {req}")
        header_parts.append(f"Теги: {tags}")
        header_parts.append(f"Тип: {card_type}")
        header_parts.append(f"Дополнение: {expansion}")
        if vp:
            header_parts.append(f"VP: {vp}")
        lines.append(" | ".join(header_parts))
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

    output_file = os.path.join(OUTPUT_DIR, 'TM_Tierlist_Projects.md')
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"\nТир-лист сохранён: {output_file}")
    for tier_name in ['S', 'A', 'B', 'C', 'D', 'F']:
        if tiers[tier_name]:
            print(f"  {tier_name}: {len(tiers[tier_name])}")

    # Save to combined evaluations.json
    eval_output = os.path.join(DATA_DIR, 'evaluations.json')
    existing_evals = {}
    if os.path.exists(eval_output):
        with open(eval_output, 'r', encoding='utf-8') as f:
            existing_evals = json.load(f)

    for e in all_evals:
        existing_evals[e['name']] = e

    with open(eval_output, 'w', encoding='utf-8') as f:
        json.dump(existing_evals, f, ensure_ascii=False, indent=2)
    print(f"\nОбщий файл оценок: {eval_output} ({len(existing_evals)} записей)")


if __name__ == '__main__':
    main()
