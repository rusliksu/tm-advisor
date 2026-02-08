# Terraforming Mars Tier List — Автоматизированный проект

## Обзор проекта

Создание полного тир-листа всех карт Terraforming Mars (корпорации, прелюдии, проектные карты) для формата **3 игрока / World Government Terraforming / Все дополнения**.

Итоговый результат — визуальный tier list с картинками карт (как на tiermaker.com), плюс подробные markdown-файлы с анализом каждой карты.

---

## Фаза 1: Сбор данных

### 1.1 Данные карт

**Источник:** https://terraforming-mars.herokuapp.com/cards

Отфильтрованная ссылка (без фан-карт): `https://terraforming-mars.herokuapp.com/cards#~mbcp2vCtr~trbgpc~d!`

**Что собрать для каждой карты:**
- Название
- ID/номер
- Стоимость (MC)
- Требования (global requirements)
- Теги (Building, Space, Science, Plant, Microbe, Animal, Earth, Jovian, Venus, Power, City, Event, Mars, Wild)
- Тип (Automated/Green, Active/Blue, Event/Red, Corporation, Prelude)
- Эффект (текст)
- VP (если есть)
- Дополнение (Base, Corporate Era, Prelude, Venus Next, Colonies, Turmoil, Prelude 2, Promo, Big Box Promo, Prelude 2 Kickstarter Promo)
- URL картинки карты

**Технический подход:**
Сайт использует React и рендерит карты клиентски. Данные карт, скорее всего, в JSON в исходниках проекта. Попробуй:

1. Проверить GitHub репозиторий terraforming-mars (open source) — данные карт в JSON/TypeScript файлах
2. Если нет — scrape HTML страницу, парсить rendered карты
3. Картинки: каждая карта рендерится как DOM элемент с иконками/текстом. Для tier list нужны скриншоты карт или их миниатюры. Варианты:
   - Puppeteer/Playwright для скриншотов каждой карты
   - Использовать существующие изображения карт из других источников (ssimeonoff.github.io, BoardGameGeek)
   - Генерировать миниатюры программно (название + стоимость + теги)

**Категории карт для сбора:**

| Категория | Примерное кол-во | Файл tier list |
|-----------|-----------------|----------------|
| Корпорации | ~60-70 | TM_Tierlist_Corporations.md |
| Прелюдии | ~70-80 | TM_Tierlist_Preludes.md |
| Проектные карты (Automated) | ~200+ | TM_Tierlist_S_A/B/C/D/F.md |
| Проектные карты (Active) | ~80+ | Те же файлы |
| Проектные карты (Event) | ~80+ | Те же файлы |

### 1.2 COTD данные (Card of the Day)

**Источник:** r/TerraformingMarsGame на Reddit, посты пользователя Enson_Chan с тегом [COTD]

**Что собрать:**
- Название карты
- Дата поста
- **ВСЕ комментарии — это САМОЕ ВАЖНОЕ** (оценки карт строятся на мнениях опытных игроков из комментариев, без них оценка будет неточной)
- Upvotes комментариев (как proxy для качества мнения)
- Вложенные ответы (replies) тоже собирать — часто содержат уточнения и дебаты

**КРИТИЧНО:** Пост COTD сам по себе содержит только название и описание карты. Вся ценность — в комментариях. Если не получается собрать комменты — этот шаг бесполезен. Убедись что `submission.comments.replace_more(limit=None)` вызван для раскрытия всех свёрнутых веток.

**Ключевые комментаторы (опытные игроки, их мнению доверяем больше):**
- **benbever** — подробный количественный анализ, часто считает MC value
- **icehawk84** — краткие но точные оценки, хорошо чувствует meta
- **SoupsBane** — хорошие стратегические инсайты
- **Krazyguy75** — детальный математический разбор, иногда спорный но аргументированный
- **CaptainCFloyd** — практические комментарии из опыта игры
- **FieldMouse007** — сбалансированные оценки

**Технический подход:**
Reddit API через PRAW (Python Reddit API Wrapper) или прямой HTTP к old.reddit.com/api.

```python
# Пример с PRAW
import praw

reddit = praw.Reddit(client_id='...', client_secret='...', user_agent='TM_tierlist_bot')
subreddit = reddit.subreddit('TerraformingMarsGame')

# Поиск COTD постов
for submission in subreddit.search('[COTD]', sort='new', limit=500):
    if submission.author and submission.author.name == 'Enson_Chan':
        # Собрать пост + все комменты
        submission.comments.replace_more(limit=None)
        for comment in submission.comments.list():
            # Сохранить: автор, текст, score, parent
            pass
```

**Альтернатива без API key:** Perplexity/ChatGPT для сбора COTD данных, или scrape old.reddit.com напрямую.

**Важно:** COTD посты идут с 2024 года, покрывают ~200-300 карт. Не все карты имеют COTD. Для карт без COTD — оценка на основе математики и общих принципов.

**Стратегия сбора COTD:** Собери ВСЕ посты [COTD] от Enson_Chan в r/TerraformingMarsGame. Это основной источник экспертных мнений. Без COTD комментариев оценка карты будет значительно менее точной — опирайся на математику но помечай "no COTD data" для ручной проверки.

### 1.3 Ссылки на COTD

В проекте может быть файл `cotd_lookup.json` с маппингом карта → URL COTD поста. Если нет — построить при сборе.

---

## Фаза 2: Оценка карт

### 2.1 Формат игры

**КРИТИЧЕСКИ ВАЖНО — всё оценивается для этого формата:**
- 3 игрока (не 2, не 4-5)
- World Government Terraforming (WGT) — каждый раунд автоматически поднимается 1 параметр
- Все дополнения включены (Base + Corporate Era + Prelude + Venus Next + Colonies + Turmoil + Prelude 2 + все промо)
- Средняя длина игры: ~8-9 поколений
- Средний стартовый капитал корпорации: ~63 MC

### 2.2 Экономические формулы

**Базовые ценности ресурсов:**

| Ресурс | Gen 1 value | Mid-game | Last gen |
|--------|-------------|----------|----------|
| 1 TR | 7 MC | 7.2-7.4 MC | 8 MC |
| 1 VP | 1 MC | 2-5 MC | 8 MC |
| 1 MC-prod | 5-6 MC | 5 MC | 0 MC |
| 1 Card (draw) | 3-4 MC | 3-4 MC | 3-4 MC |

**Production multipliers (Gen 1):**

| Production | Value | Multiplier |
|------------|-------|------------|
| 1 MC-prod | 5-6 MC | 1.0x |
| 1 Steel-prod | 8 MC | 1.6x |
| 1 Titanium-prod | 12.5 MC | 2.5x |
| 1 Plant-prod | 8 MC | 1.6x |
| 1 Energy-prod | 7.5 MC | 1.5x |
| 1 Heat-prod | 4 MC | 0.8x |

**Ключевое правило:** TR = VP + MC-prod (в любой момент игры).

**Стоимость карты:** printed cost + 3 MC (за покупку при драфте).

**Ценность тегов (приблизительно):**
- Jovian: 3-5 MC (редкий, VP multipliers)
- Science: 3-5 MC (Scientist award, card draw combos)
- Earth: 2-3 MC (Point Luna, Teractor, Earth Office)
- Venus: 2-3 MC (Venus дискаунты)
- Space: 1-2 MC (ti payment offset)
- Building: 1-2 MC (steel payment offset)
- Plant: 1-2 MC (NRA, Ecologist)
- Microbe: 1-2 MC (Decomposers, Splice)
- Animal: 1-2 MC (Ecological Zone)
- Event: 1-2 MC (Media Group, Legend milestone)
- Power: 1 MC (нишевый)
- City: 1 MC (нишевый)
- No tag: -3 to -5 MC penalty (теряешь все синергии; исключение — Sagitta corp +4 MC)

### 2.3 Benchmarks эффективности

**Production efficiency (MC за 1 MC-prod):**
- ≤ 3.0 → отлично
- 3.0-4.0 → хорошо
- 4.0-5.0 → нормально
- 5.0-6.0 → слабо
- > 6.0 → плохо

**TR efficiency (MC за 1 TR):**
- ≤ 6.0 → отлично
- 6.0-8.0 → хорошо (стандарт ~7-7.4)
- 8.0-10.0 → нормально
- > 10.0 → слабо

**Средняя ценность прелюдии:** ~24.5 MC

### 2.4 Scoring система

| Score | Tier | Описание |
|-------|------|----------|
| 90-100 | S | Must-pick, берёшь всегда |
| 80-89 | A | Почти всегда берём |
| 70-79 | B | Хорош с синергией |
| 55-69 | C | Ситуативный |
| 35-54 | D | Очень слабый |
| 0-34 | F | Trap-карта |

**Факторы оценки:**

| Фактор | Вес | Что оценивать |
|--------|-----|---------------|
| Economy | 35% | MC value vs cost, efficiency ratios |
| Flexibility | 25% | Лёгкость requirements, универсальность |
| Timing | 20% | Когда играется, окно для игры |
| Synergies | 20% | Combo potential, тег value |

### 2.5 Критические паттерны (ОБЯЗАТЕЛЬНО УЧИТЫВАТЬ)

#### Take-that в 3P
Карты которые атакуют одного игрока **помогают третьему бесплатно**. В 3P это серьёзный минус (-5 to -10 score):
- Hackers: в 2P сильная, в 3P = D-тир
- Energy Tapping: -1 VP + take-that = C в 3P
- Biomass Combustors: то же
- **Исключение:** дешёвые attack (Virus, 4 MC total) и attack бонусом (Birds, -2 plant-prod это free bonus не core value)

#### Floater trap
Большинство floater карт **переоценены**:
- Высокая стоимость (20+ MC)
- Медленный action (2 хода на 1 TR)
- Requirements (3-5 floaters) сложно выполнить
- Примеры trap: Titan Air-scrapping (D42), Aerosport Tournament (D44), Rotator Impacts (D42)
- **Исключения:** дешёвые floater targets (Dirigibles), карты с immediate floaters

#### Дешёвые action карты недооценены
- Red Ships (5 MC total) → 4-7 MC/action late game = B75
- Virus (4 MC total) → huge swing = B72
- Низкий floor, высокий ceiling
- Stall value бонусом (лишнее действие = задержка конца раунда)

#### No-tag penalty
Карты без тегов теряют:
- Corporation synergies (Splice, Point Luna, Teractor, etc.)
- Milestone/Award contributions
- Discount synergies
- Штраф: -3 to -5 score
- **Исключение:** Sagitta corp (+4 MC за no-tag карту)

#### Одноочковые животные (1 VP per resource)
Карты типа Birds, Fish, Livestock, Predators — сильные VP-карты, но:
- Самостоятельно набирают 3-4 VP (не 5-10)
- Для большего нужны animal placement cards (Large Convoy, Imported Nitrogen, etc.) — не гарантированы
- Конкурируют между собой за placement slots
- Оценка: B-tier (70-78), не A-tier

#### Execution difficulty
Некоторые карты сложны в execution:
- Diversity Support: условие может провалиться из-за порядка розыгрыша
- Requirements проверяются ДО оплаты
- Action cards с holding costs (Neptunian Power Consultants: держи MC/steel в резерве)

### 2.6 Специфика корпораций

Корпорации оцениваются иначе:
- **Стартовый капитал** — сравни с средним (~63 MC). Недобор = штраф, перебор = бонус
- **Способность (ability)** — recurring value vs one-time
- **Теги** — corp tag считается
- **Combo potential** — какие стратегии открывает
- **Floor vs ceiling** — насколько плох worst case

**Benchmark корпораций:**
- S-tier: Tharsis Republic, Point Luna, Credicor, Ecoline
- A-tier: Helion, Phobolog, Interplanetary Cinematics, Mining Guild, Robinson Industries, Inventrix, Thorgate, United Planeterials
- B-tier: Manutech, Viron, Morning Star Inc (70)
- C-tier: Poseidon, Celestic, Lakefront, MSI, Arklight, Aridor, Polyphemos, Stormcraft, Mons, PhilAres
- D-tier: Aphrodite, Crescent Research, Utopia, Terralabs, Arcadian, Splice, Recyclon, Palladin Shipping (58)

(Это reference из community tier list на tiermaker.com, используй как ориентир но не копируй слепо — у них может быть другой формат)

### 2.7 Специфика прелюдий

- Сравнивай с **средней ценностью прелюдии ~24.5 MC**
- Immediate value важнее effect/action (gen 1 ценнее gen 5)
- Теги на прелюдии ценны (считаются с gen 1)
- Production preludes > VP preludes (early game)
- Effect preludes (ongoing) — считай total value за оставшиеся gen

### 2.8 Map-specific considerations

- **Tharsis:** Mayor (3 cities), Builder (8 building tags), Banker (MC prod), Miner (steel+ti), Scientist (science)
- **Hellas:** Diversifier (8 tags), Rim Settler (3 Jovian), Tactician (5 req cards), Energizer (6 energy), более длинные игры
- **Elysium:** Ecologist (4 bio tags), Legend (5 events), Celebrity (15+ cost cards), Benefactor (TR)

Оценка дефолтно для "any map" но упоминай map-specific value где важно.

---

## Фаза 3: Формат вывода

### 3.1 Markdown tier list файлы

Для каждого tier — отдельный файл. Структура:

```markdown
# Тир-лист: [Tier name]

**Формат:** 3P / WGT / Все дополнения

---

## Карты

| Карта | ID | Score | Теги | Ключевое |
|-------|----|-------|------|----------|
| Card Name | ID | XX | Tag1, Tag2 | Краткое описание 5-10 слов |

---

## Анализ

### Card Name (#ID) — Score

Стоимость X | Требования: Y | Теги: Z | Тип

**Эффект:** [текст эффекта]

**Почему [Tier] (Score):** [2-3 предложения с экономикой и reasoning]

**Синергии:** Corp1, Corp2, Card1, Card2

**Когда брать:** [условия]

---
```

**Язык: русский.** Без ссылок на конкретных людей из COTD (не "benbever сказал", а "по данным опытных игроков").

### 3.2 Визуальный tier list

Финальный output — HTML страница или изображение с tier list в стиле tiermaker.com:
- Ряды по тирам (S/A/B/C/D/F) с цветовой кодировкой
- Картинки карт (миниатюры) в каждом ряду
- Hover/click для деталей (если HTML)
- Три отдельных tier list: Corporations, Preludes, Project Cards

**Цвета тиров:**
- S: красно-розовый (#FF7F7F)
- A: оранжевый (#FFBF7F)
- B: жёлтый (#FFDF7F)
- C: жёлто-зелёный (#BFFF7F)
- D: зелёный (#7FFF7F) или жёлто-зелёный
- F: серый (#CCCCCC)

### 3.3 TierMaker совместимость

Для загрузки на tiermaker.com нужны:
1. Template — набор изображений карт (все одинакового размера, ~150x200 px)
2. Ranking — JSON или ручное перетаскивание

Оптимальный путь: создать template на tiermaker → вручную расставить карты по тирам.

Для template нужны изображения каждой карты. Источники:
- ssimeonoff.github.io — есть изображения многих карт
- herokuapp — render скриншоты
- Собственная генерация миниатюр

---

## Фаза 4: Существующие оценки (Reference Data)

Мы уже оценили ~50 карт. Используй их как calibration — твои оценки новых карт должны быть consistent с этими.

### Проектные карты — уже оценённые

**A-Tier (80-89):**
| Карта | Score | Ключевое |
|-------|-------|----------|
| Cutting Edge Technology | 84 | -2 MC за req карты + 1 VP, топ engine |
| Imported Hydrogen | 80 | Тройной тег + ocean + flexible resources, ti payable |

**B-Tier (70-79):**
| Карта | Score | Ключевое |
|-------|-------|----------|
| Mining Colony | 78 | Colony + ti-prod, Space тег |
| Venus Orbital Survey | 78 | Action: free Venus cards, ti payable, no req |
| Electro Catapult | 77 | ~5 MC/action + 1 VP, Building тег |
| Birds | 76 | 1 VP/animal, нужны animal placers, 13% O2 |
| Red Ships | 75 | 5 MC total, scaling action |
| Open City | 74 | Best city base game, steel dump |
| Sponsoring Nation | 74 | 3 TR + 2 delegates, req 4 Earth |
| Atmoscoop | 72 | 2 TR + 2 floaters + VP, req 3 Science |
| Colonial Representation | 72 | +1 influence permanent + colony rebate |
| Hermetic Order of Mars | 72 | 2 MC-prod + MC rebate, max 4% O2, no tags |
| Stratospheric Expedition | 72 | Triple tag + 2 floaters + 2 Venus cards + VP |
| Static Harvesting | 72 | Power Plant + Building bonus |
| Virus | 72 | 4 MC attack, Microbe тег |
| Luna Governor | 71 | 3.5 MC/prod, 2 Earth тега, Point Luna OP |
| Ceres Tech Market | 71 | Science+Space, colony rebate, card action |
| Colonizer Training Camp | 70 | Cheap Jovian + 2 VP, steel dump |
| Noctis Farming | 70 | Steel dump + VP + NRA enabler |

**C-Tier (55-69):**
| Карта | Score | Ключевое |
|-------|-------|----------|
| Productive Outpost | 68 | Free colony bonuses, нужно 2+ колоний |
| Rover Construction | 68 | +2 MC per city, steel dump + VP |
| Soil Studies | 67 | Cheap greenery при 8+ plants, triple tag |
| Neptunian Power Consultants | 67 | 5 MC (steel) → energy+VP per ocean |
| Envoys from Venus | 66 | 4 MC за 2 delegates, req 3 Venus |
| Lava Flows | 65 | 2 TR за 21 MC |
| Protected Growth | 64 | Cheap, нужно 3+ Power тегов |
| Venus Shuttles | 63 | Action: 12-X MC → Venus raise + 2 floaters |
| Energy Tapping | 63 | Take-that в 3P, Power тег |
| Summit Logistics | 63 | 2 карты, req Scientists |
| Vermin | 63 | Microbe+Animal теги |
| Casinos | 62 | 3.75 MC/prod, 2 жёстких req |
| Corporate Stronghold | 62 | Cheap city + 3 MC-prod, -2 VP |
| Floating Refinery | 62 | Venus engine, slow |
| Spin-inducing Asteroid | 61 | 2 Venus TR за 19 MC, ti payable |
| Weather Balloons | 61 | Science тег + карта |
| Martian Lumber Corp | 58 | NRA enabler, effect = trap |
| Airliners | 58 | Req 3 floaters, no tags |
| Supermarkets | 57 | No tags, Acquired Company лучше |
| Biomass Combustors | 56 | Take-that в 3P, good tags |
| House Printing | 56 | 1 steel-prod + VP, break-even |
| Asteroid Deflection System | 55 | Triple tag + plant protect |
| Diversity Support | 55 | 1 TR за 4 MC if condition met |

**D-Tier (35-54):**
| Карта | Score | Ключевое |
|-------|-------|----------|
| Hackers | 48 | Take-that в 3P |
| Aerosport Tournament | 44 | 5 floaters req |
| Food Factory | 42 | -1 plant-prod conflict |
| Titan Air-scrapping | 42 | 24 MC, slow action |
| Rotator Impacts | 42 | 6 MC/2 actions → 1 Venus TR, slow |
| St. Joseph of Cupertino Mission | 40 | Security Fleet v2, no tags |

### Корпорации — уже оценённые
| Корпорация | Score | Tier |
|------------|-------|------|
| Morning Star Inc | 70 | B |
| Palladin Shipping | 58 | C |

### Прелюдии — уже оценённые
| Прелюдия | Score | Tier |
|----------|-------|------|
| High Circles | 85 | A |
| Experimental Forest | 82 | A |
| Planetary Alliance | 82 | A |
| Soil Bacteria | 76 | B |
| Double Down | 76 | B |
| Space Lanes | 73 | B |
| Focused Organization | 66 | C |
| Terraforming Deal | 62 | C |
| Recession | 58 | C |
| Board of Directors | 55 | C |
| Preservation Program | 48 | D |
| Venus Contract | 46 | D |

---

## Фаза 5: Пошаговый план выполнения

### Шаг 1: Setup (30 мин)
```bash
# Создать структуру проекта
mkdir -p tm-tierlist/{data,images,output,scripts}
cd tm-tierlist

# Установить зависимости
pip install praw requests beautifulsoup4 pillow
```

### Шаг 2: Scrape карты (1-2 часа)
```
scripts/scrape_cards.py
→ data/all_cards.json        # все карты с полными данными
→ data/corporations.json     # только корпорации
→ data/preludes.json         # только прелюдии
→ data/project_cards.json    # только проектные карты
```

Каждая карта в JSON:
```json
{
  "name": "Birds",
  "id": "072",
  "cost": 10,
  "requirements": "13% oxygen",
  "tags": ["Animal"],
  "type": "Active",
  "effect": "Action: Add 1 animal to this card. Decrease any plant production 2 steps. 1 VP per animal.",
  "vp": "1 per animal",
  "expansion": "Base",
  "image_url": "...",
  "cotd_url": null
}
```

### Шаг 3: Scrape COTD (2-4 часа)
```
scripts/scrape_cotd.py
→ data/cotd_posts.json       # все COTD посты + комменты
```

Match COTD → карты по названию. Обнови `all_cards.json` полем `cotd_data`.

### Шаг 4: Скачать/сгенерировать картинки карт (1-2 часа)
```
scripts/download_images.py
→ images/corporations/       # 150x200 миниатюры
→ images/preludes/
→ images/project_cards/
```

### Шаг 5: AI оценка карт (4-8 часов, batches)
```
scripts/evaluate_cards.py
→ data/evaluations.json      # score + tier + analysis для каждой карты
```

**ВАЖНО:** Оценивай батчами по 10-20 карт. Для каждой карты:

1. Посчитай экономику (cost vs value)
2. Учти COTD мнения (если есть)
3. Примени паттерны (take-that penalty, floater trap, etc.)
4. Сравни с уже оценёнными картами similar типа
5. Присвой score и tier

**Промпт для оценки карты (используй как system prompt):**

```
Ты оцениваешь карту Terraforming Mars для формата 3P/WGT/All Expansions.

Формулы:
- 1 TR = 7-7.4 MC
- 1 VP = ~5 MC mid-game
- 1 MC-prod = 5-6 MC gen 1
- 1 Card = 3-4 MC
- Card cost = printed + 3 MC

Паттерны:
- Take-that в 3P: -5 to -10 score
- Floater trap: expensive + slow = usually D-tier
- No tag penalty: -3 to -5
- Cheap action cards: usually underrated

Для каждой карты дай:
1. Score (0-100)
2. Tier (S/A/B/C/D/F)
3. Экономический расчёт (2-3 строки)
4. Почему этот tier (2-3 предложения)
5. Топ синергии (3-5 карт/корпораций)
6. Когда брать/не брать
```

### Шаг 6: Human review
Вывести оценки батчами для ревью. Формат:
```
=== BATCH 1: A-tier candidates (score 80+) ===

Birds (#072) — 76/B
[краткий analysis]
Согласен? [y/n/new_score]
```

### Шаг 7: Генерация tier list файлов (1 час)
```
scripts/generate_tierlists.py
→ output/TM_Tierlist_S_A.md
→ output/TM_Tierlist_B.md
→ output/TM_Tierlist_C.md
→ output/TM_Tierlist_D.md
→ output/TM_Tierlist_F.md
→ output/TM_Tierlist_Corporations.md
→ output/TM_Tierlist_Preludes.md
```

### Шаг 8: Визуальный tier list (2-3 часа)
```
scripts/generate_visual.py
→ output/tierlist_corporations.html
→ output/tierlist_preludes.html
→ output/tierlist_project_cards.html
→ output/tierlist_corporations.png
→ output/tierlist_preludes.png
→ output/tierlist_project_cards.png
```

HTML с drag-and-drop для финальной корректировки.

### Шаг 9: TierMaker подготовка
```
scripts/prepare_tiermaker.py
→ output/tiermaker_template_corps/     # папка с картинками для template
→ output/tiermaker_template_preludes/
→ output/tiermaker_template_projects/
→ output/tiermaker_ranking.txt         # порядок для ручной расстановки
```

---

## Примеры хороших и плохих оценок

### Хорошая оценка: Birds (#072) — 76/B

```
Стоимость 10 | 13% oxygen | Animal | Active
Action: +1 animal. -2 plant-prod opponent. 1 VP per animal.

Экономика: 13 MC за 3-4 VP самостоятельно (gen 5-7 play, 3-4 gen left).
С animal placers (Large Convoy +4, Imported Nitrogen +2) — ceiling 6-8+ VP.

Почему B: Сильная VP-карта, но 13% oxygen = mid-late game,
самостоятельно 3-4 VP. Нужны animal placement cards для 5+ VP,
конкурирует с Fish/Livestock за те же slots.

Синергии: Large Convoy, Imported Nitrogen/Hydrogen, Miranda colony, Ecological Zone
Когда брать: Animal placement cards в engine, 13% oxygen close
```

### Плохая оценка (типичные ошибки):

**Ошибка 1: Переоценка ceiling без учёта probability**
```
Birds — 85/A
С Large Convoy это 10+ VP!  ← неправильно: Large Convoy не гарантирован
```

**Ошибка 2: Игнорирование take-that penalty в 3P**
```
Hackers — 70/B
Отличная exchange rate: -2 MC-prod opponent, +2 MC-prod  ← забыл: третий игрок получает advantage бесплатно
```

**Ошибка 3: Floater trap**
```
Titan Air-scrapping — 72/B
2 VP + Jovian тег + action  ← забыл: 24 MC + 2 actions per TR = never pays off
```

**Ошибка 4: Переоценка VP ранних карт**
```
Security Fleet — 68/C
Cheap VP accumulator  ← забыл: VP early = bad, MC now > VP later
```

---

## Технические заметки

### Reddit scraping
- Reddit rate limit: 60 requests/min
- PRAW handles this automatically
- old.reddit.com JSON endpoint: append `.json` to any URL
- Для комментов: `https://old.reddit.com/r/TerraformingMarsGame/comments/{id}/.json`

### Herokuapp scraping
- Сайт open source: https://github.com/bafolts/terraforming-mars
- Данные карт в TypeScript файлах в `src/server/cards/`
- Или scrape rendered HTML с Puppeteer

### Картинки карт

**Основной источник:** https://terraforming-mars.herokuapp.com/cards#~mbcp2vCtr~trbgpc~d!
- Содержит ВСЕ карты включая Prelude 2 и все промо
- Карты рендерятся как HTML/DOM элементы
- Для скриншотов: Puppeteer/Playwright, скриншот каждой карты как PNG ~150x200px
- Можно использовать CSS селекторы для выделения отдельных карт

**Запасной источник:** ssimeonoff.github.io (по ID: `cards-list#072`)
- НЕ содержит Prelude 2 — не использовать как основной

**Третий вариант:** извлечь изображения из COTD постов на Reddit

---

## Финальный чеклист

- [ ] Все корпорации оценены (~60-70)
- [ ] Все прелюдии оценены (~70-80)
- [ ] Все проектные карты оценены (~350-400)
- [ ] Human review пройден (хотя бы для A/B tier)
- [ ] Markdown tier lists сгенерированы
- [ ] Визуальные tier lists сгенерированы
- [ ] TierMaker templates подготовлены
- [ ] Consistency check: похожие карты в похожих тирах
