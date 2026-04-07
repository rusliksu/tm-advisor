# CLAUDE.md — Terraforming Mars Tier List

> Общие правила: `~/.claude/rules/shared.md` (загружаются автоматически)

## Обзор проекта

Полный тир-лист всех карт Terraforming Mars (корпорации, прелюдии, проектные карты) для формата **3 игрока / World Government Terraforming / Все дополнения**.

Итоговый результат — визуальный tier list с картинками + подробные markdown-файлы с анализом.

## Architecture Routing

Перед structural/refactor правками сначала открой:
- `ARCHITECTURE.md`
- `docs/architecture/README.md`

Дальше:
- `tm-modules-rfc.md` — целевая архитектура
- `tm-ownership-map.md` — кто владеет путями
- `tm-dependency-graph.md` — допустимые зависимости
- `tm-migration-checklist.md` — порядок фаз
- `tm-site-boundary.md` — что именно относится к сайту и гайдам
- `tm-brain-extraction-plan.md` — если задача про общий brain

Правила:
- `data/evaluations.json` — canonical source of truth
- `extension/data/*.json.js` — generated output
- `extension` и `smartbot` не должны иметь независимые копии shared brain
- не смешивать structural changes и unrelated scoring fixes

---

## Формат игры (КРИТИЧЕСКИ ВАЖНО)

Всё оценивается для этого формата:
- 3 игрока (не 2, не 4-5)
- World Government Terraforming (WGT) — каждый раунд автоматически +1 параметр
- Все дополнения (Base + CE + Prelude + Venus + Colonies + Turmoil + Prelude 2 + промо)
- Средняя длина: ~8-9 поколений
- Средний стартовый капитал: ~63 MC

---

## Экономические формулы

**Базовые ценности:**

| Ресурс | Gen 1 | Mid-game | Last gen |
|--------|-------|----------|----------|
| 1 TR | 7 MC | 7.2-7.4 MC | 8 MC |
| 1 VP | 1 MC | 2-5 MC | 8 MC |
| 1 MC-prod | 5-6 MC | 5 MC | 0 MC |
| 1 Card | 3-4 MC | 3-4 MC | 3-4 MC |

**Production (Gen 1):** MC-prod 5-6, Steel-prod 8, Ti-prod 12.5, Plant-prod 8, Energy-prod 7.5, Heat-prod 4

**Ключевое:** TR = VP + MC-prod. Стоимость карты = printed + 3 MC.

**Теги:** Jovian 3-5, Science 3-5, Earth 2-3, Venus 2-3, Space 1-2, Building 1-2, No tag: -3 to -5 penalty

---

## Scoring

| Score | Tier | Описание |
|-------|------|----------|
| 90-100 | S | Must-pick |
| 80-89 | A | Почти всегда берём |
| 70-79 | B | Хорош с синергией |
| 55-69 | C | Ситуативный |
| 35-54 | D | Очень слабый |
| 0-34 | F | Trap-карта |

**Факторы:** Economy 35%, Flexibility 25%, Timing 20%, Synergies 20%

---

## Критические паттерны

### Take-that в 3P
Атака одного = бесплатный бонус третьему. Штраф -5 to -10 score.
Исключения: дешёвые attack (Virus 4MC), attack как бонус (Birds -2 plant-prod).

### Floater trap
Большинство переоценены: дорого (20+ MC), медленно (2 хода/TR), сложные req.
Исключения: дешёвые targets (Dirigibles), immediate floaters.

### Дешёвые action карты недооценены
Red Ships (5 MC), Virus (4 MC) — низкий floor, высокий ceiling + stall value.

### No-tag penalty: -3 to -5 score
Исключение: Sagitta (+4 MC за no-tag).

### Одноочковые животные: B-tier (70-78), не A-tier
Самостоятельно 3-4 VP, для 5+ нужны animal placers (не гарантированы).

---

## Специфика корпораций

- Стартовый капитал vs ~63 MC
- Ability: recurring vs one-time
- Floor vs ceiling
- Combo potential

## Специфика прелюдий

- Benchmark: ~24.5 MC
- Immediate value > effect/action
- Теги на прелюдии ценны (gen 1)
- Production > VP (early game)

---

## Существующие оценки (Reference Data)

~50 карт уже оценены. Используй как calibration.

### Проектные карты

**A-Tier:** Cutting Edge Technology 84, Imported Hydrogen 80

**B-Tier:** Mining Colony 78, Venus Orbital Survey 78, Electro Catapult 77, Birds 76, Red Ships 75, Open City 74, Sponsoring Nation 74, Atmoscoop 72, Colonial Representation 72, Hermetic Order of Mars 72, Stratospheric Expedition 72, Static Harvesting 72, Virus 72, Luna Governor 71, Ceres Tech Market 71, Solar Reflectors 73, Colonizer Training Camp 70, Noctis Farming 70

**C-Tier:** Productive Outpost 68, Rover Construction 68, Soil Studies 67, Neptunian Power Consultants 67, Envoys from Venus 66, Lava Flows 65, Protected Growth 64, Venus Shuttles 63, Energy Tapping 63, Summit Logistics 63, Vermin 63, Rego Plastics 62, Casinos 62, Corporate Stronghold 62, Floating Refinery 62, Spin-inducing Asteroid 61, Weather Balloons 61, Martian Lumber Corp 58, Airliners 58, Supermarkets 57, Biomass Combustors 56, House Printing 56, Asteroid Deflection System 55, Diversity Support 55

**D-Tier:** Hackers 48, Aerosport Tournament 44, Food Factory 42, Titan Air-scrapping 42, Rotator Impacts 42, St. Joseph 40

### Корпорации
Morning Star Inc 70/B, Palladin Shipping 58/C

### Прелюдии
High Circles 85/A, Experimental Forest 82/A, Planetary Alliance 82/A, Soil Bacteria 76/B, Double Down 76/B, Space Lanes 73/B, Focused Organization 66/C, Terraforming Deal 62/C, Recession 58/C, Board of Directors 55/C, Preservation Program 48/D, Venus Contract 46/D

---

## Benchmark корпораций (community reference)

S: Point Luna, Credicor
A: Phobolog, IC, Robinson Industries, Inventrix, Thorgate, UP
B: Ecoline 76, Aridor 73, Tharsis Republic 72, Manutech, Viron, Morning Star Inc 70
C: Helion 64, Poseidon, Celestic, Lakefront, MSI, Arklight, Polyphemos, Stormcraft, Mons, PhilAres
D: Mining Guild 48, Aphrodite, Crescent Research, Utopia, Terralabs, Arcadian, Splice, Recyclon, Palladin Shipping 58

---

## Технический план

### Данные карт
Источник: https://github.com/bafolts/terraforming-mars (TypeScript в `src/server/cards/`)
Альтернатива: scrape https://terraforming-mars.herokuapp.com/cards

### COTD (Card of the Day)
Источник: r/TerraformingMarsGame, посты Enson_Chan с тегом [COTD]
Ключевые комментаторы: benbever, icehawk84, SoupsBane, Krazyguy75, CaptainCFloyd, FieldMouse007

### Картинки карт
Основной: herokuapp (Puppeteer скриншоты ~150x200px)
Запасной: ssimeonoff.github.io (НЕ содержит Prelude 2)

### Pipeline
1. Scrape карты → `data/all_cards.json`
2. Scrape COTD → `data/cotd_posts.json`
3. Картинки → `images/`
4. AI оценка батчами по 10-20 карт
5. Human review
6. Генерация tier list файлов (markdown + HTML + TierMaker)

---

## Финальный чеклист

- [ ] Все корпорации оценены (~60-70)
- [ ] Все прелюдии оценены (~70-80)
- [ ] Все проектные карты оценены (~350-400)
- [ ] Human review (хотя бы A/B tier)
- [ ] Markdown + визуальные tier lists
- [ ] TierMaker templates
- [ ] Consistency check
