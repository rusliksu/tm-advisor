# BonelessDota — TERRAFORMING MARSterclass: Полная выжимка

**Источник:** YouTube плейлист (22 видео), канал BonelessDota
**Формат:** Стратегические инсайты для продвинутых игроков TM
**Применение:** Калибровка оценок карт, улучшение tm_advisor.py, обновление strategy_guide.md

---

## Часть 1: Базовые экономические формулы

### Ценности ресурсов

| Ресурс | Gen 1 | Mid-game | Last gen |
|--------|-------|----------|----------|
| 1 TR | ~7 MC | ~7.5 MC | ~8 MC |
| 1 VP | ~1-2 MC | ~3-5 MC | ~8 MC |
| 1 MC-prod | ~5 MC | ~4 MC | ~0 MC |
| 1 heat-prod | ~5 MC | ~4 MC | ~0 MC |
| 1 energy-prod (gen 1) | ~10 MC | ~7 MC | ~6 MC |
| 1 случайная карта | ~3 MC (4 MC в 2P) | ~3 MC | ~3 MC |
| 1 plant | ~2 MC | ~2 MC | varies |
| 1 steel | ~2 MC | | |
| 1 titanium | ~3 MC | | |
| 1 heat | ~1 MC | | |

**Важно:** Energy gen 1 = ~10 MC, значительно дороже стандартных оценок (~7 MC). Топ-игроки единодушны.

### Формула эффективности (God Mode)
```
Money Income × Cards per Generation = Efficiency Number
Если > 1000 → "God Mode"
```
Нужен баланс обоих параметров. Один без другого не работает.

### Окупаемость карт
- Engine-карта должна окупаться за ≤5 поколений
- Позже в игре — ещё быстрее
- 3 MC в early game ≈ 10 MC в late game (compound interest)

---

## Часть 2: Стратегии по количеству игроков

### 2P (9-14 поколений)
- **Greedy card strategy — безоговорочно лучшая**
- Point Luna = S-tier корпорация
- Card draw + card discount = God Mode
- Рекорд: 278 VP за 14 поколений
- Attack cards сильнее (урон 100% противников)
- AI Central, Anti-Gravity Technology — топ picks

### 3P (8-11 поколений)
- Card strategy работает, но оппоненты закрывают быстрее
- "Middle road" (Fuxelius strategy) — оптимальна: engine + терраформирование
- All-in terraforming НЕ работает
- Milestones менее критичны чем в 5P
- 168 VP за 11 gen — сильный результат

### 4-5P (6-9 поколений)
- Terraforming rush валиден (Omni + heat)
- City strategy сильна (больше оппонентов = больше городов = больше MC)
- Tharsis Republic = S-tier (в 5P)
- Milestones — гонка, бери ASAP
- Card strategy рискованна (игра может кончиться на gen 7)

### Корпорации по player count

| Корпорация | 2P | 3P | 5P |
|---|---|---|---|
| Point Luna | S | A | B |
| Tharsis Republic | B | B | S |
| Omni | мусор | C | A |
| Vitor | A | B | B |

---

## Часть 3: Три основные стратегии

### A. Card Strategy / God Mode (длинная игра)

**7 принципов:**
1. Держи ВСЕ card-draw карты (Mars University, Olympus Conference, Spin-off Department — ВСЕГДА)
2. Большой размер руки (20-30 карт в 2-3P)
3. Огромный money engine (MC/steel/ti prod)
4. Не терраформь — тяни игру. Определи последний параметр и не закрывай
5. Discount-карты — ключ к god mode
6. Resource amplifiers — все карты "чем длиннее, тем лучше"
7. VP amplifiers: Jovian + Green tag amplifiers

**Card Draw + Card Discount = лучшая синергия в игре:**
- 1 discount = ~4 MC-prod (при 4 картах/gen)
- 2 discount = ~16 MC-prod (квадратичный рост!)
- 3+ discount = positive feedback loop (плохие карты становятся бесплатными)
- Earth Catapult + Anti-Gravity Technology = -4 ко всем картам = "way more than 16 MC-prod"

**Ранжирование card draw:**
Effect-based (Point Luna, Spin-off Department, Mars University, Olympus Conference) >>> Action-based (AI Central)
Причина: effect масштабируется с количеством сыгранных карт, action = фиксированно 1 раз/gen

**Theorycraft идеальный deck:**
- 156 карт сыграно за 7 поколений
- 228 VP за 7 gen (solo cheated start)
- Point Luna дала ~37 карт, Spin-off Department ~30, Mars University ~28 ротаций

### B. Terraforming Rush (короткая игра)

- Идея: закрыть игру до того, как greedy player обгонит по VP
- VP растёт линейно (у terraformer) vs экспоненциально (у greedy)
- Всё ещё нужен базовый money income
- Heat-prod, plant-prod, TR-карты, стандартные проекты
- **Лучше в 4-5P, НИКОГДА в 2P, сомнительно в 3P**
- Extreme Cold Fungus + Regolith Eaters/GHG = 1 free TR/gen = ~8 MC-prod

### C. City Strategy

**Когда работает:** 4-5P (больше городов от оппонентов), стандартная карта Tharsis
**Когда слабее:** 2-3P (мало городов, attack больнее)

**Ключевые карты (Big Three):**
- Immigrant City — MC-prod за каждый город (свой и чужой)
- Martian Rails — MC action за каждый город (чуть сильнее Immigrant City)
- Tharsis Republic — corp, TR за свои города

**Правило:** количество городов = количество гринерей к концу. Перекос = проигрыш.

---

## Часть 4: Тайминг действий

### Делай РАНО
1. Milestones и awards
2. Последние TR перед закрытием параметра
3. Лучшие placement bonuses
4. Трата растений (до burn)
5. Attack-карты
6. Effect-карты (Pets, Immigrant City)

### Делай ПОЗДНО
1. Action-карты с "X от opponents Y": Toll Station, Galilean Waystation, Martian Rails, Greenhouses
2. Terraform через heat/actions (не помогай противнику)
3. Energy stealing — после pass оппонента
4. Подготовка к гонке в следующем поколении

### Одно действие за ход (по умолчанию)
- Противник "показывает руку" первым
- Больше последовательных действий
- **Исключения:** гонка, colony+trade, play around Energy Tapping, play around Sabotage

### Последнее поколение — 1 действие КРИТИЧЕСКИ важно
- "You shall not pass" — не пасуй раньше противника
- Slow play критичен для awards
- Stall через action cards = преимущество

---

## Часть 5: Opening Hand приоритеты

### Порядок приоритетов
1. **MC income + Card Draw** — самое важное
2. **Синергии** (colony, discount, heat combos)
3. **Поддержка стратегии** (terraforming / card / city)
4. **Milestones** — НЕ главное, не диктуют руку
5. **Карты "на потом"** — только если осталось MC после плана на gen 1

### Что ВСЕГДА держать
- Mars University, Olympus Conference, Spin-off Department
- Earth Catapult, Anti-Gravity Technology
- Indentured Workers (5+ MC сейчас > -1 VP)
- Ecology Experts + Kelp Farming (если оба — мечта)

### Что НИКОГДА в стартовой руке
- Birds, Trees, Lake Marineris, Open City (жёсткие requirements)
- Aerobrake, Ammonia Asteroid, Interstellar Colony Ship (дорого, нет engine)

### Четвёртая карта — ВСЕГДА покупай
Категоричное утверждение топ-игроков. Исключения минимальны.

---

## Часть 6: Колонии

### Приоритеты
- **Build Colony (17 MC)** — лучший standard project раннего game
- Luna — ~3-4 MC-prod, стабильна
- Pluto — лучшая если есть money income
- Ceres, Triton, Callisto — тоже хороши
- Miranda — сильна в late game

### 3 Energy ASAP
- 3 energy для trade значительно дешевле, чем 3 Ti или 9 MC
- Power Generation prelude при колониях ≈ 9 MC-prod
- Europa = энергия дешевле (9 vs 11)
- Callisto trick: колония + 2 energy-prod = trade каждый gen + излишек → heat

### Покупай колонию первым действием → trade вторым

---

## Часть 7: Heat Production

### Когда хорош
1. Играешь рано (gen 1-2)
2. Хочешь закрыть игру (наказать greedy player)
3. Есть heat combos: Melt Works, Helion, Insulation, Kelvinists
4. 8 heat-prod = 1 TR/gen = ~8 MC-prod (до закрытия температуры)

### Когда плох
- После max температуры — бесполезен
- Micro Mills (6 MC за 1 heat-prod) — мусор
- Soletta — не "must pick" в opening hand

### Контроль длины игры
- Rank 1 Steam player: heat prod = контроль (возможность закрыть когда нужно)
- Insulation — страховка: конвертируй heat-prod в MC-prod когда temperature закрыта

---

## Часть 8: Plant Production

### Timing
- Plant-prod = mid game (НЕ early, НЕ last gen)
- 1-2 plant-prod early = плохо (4 gen на greenery, могут сжечь)
- 4+ plant-prod = хорошо (greenery каждые 2 gen)
- Greenery = ~3 VP late game (1 greenery + 1 TR oxygen + 1 adj. city)

### Топ Plant Amplifiers
- Ecology Research (лучший при колониях!)
- Nitrogen-rich Asteroid, Nitrophilic Moss
- Viral Enhancers (+ VP monster, дёшево!) — **сильно недооценена**
- Meat Industries (не VP, но делает богатым)
- Insects
- **Worms — слабый** (автор не любит)

### Protected Habitat — must-have для green tag / plant strategy

---

## Часть 9: Tile Placement

### Ценность тайлов
- Ocean rebate (+2 MC adjacency) — высоко ценится топ-игроками
- **Топ 4 слова high-elo:** Rebates, Ocean, Portal, Heat production
- Portal = возможность добраться до центра карты. Тайл на краю без портала = ловушка

### По картам

**Elysium:**
- Центр (2-3 plants) — лучшее место (4-6 MC за тайл)
- Три карты (upper right) — переоценены: ~9 MC реальной ценности, не 13-16
- Первые oceans: два центральных

**Tharsis:**
- Первые ocean: в центре у реки
- Noctis City — держи в руке, играй в последний gen (даже в tempo!)
- Лучший city spot: 36 (у реки, центр)

**Hellas:**
- Engine builder map, greedy сильнее
- ~0.3 gen длиннее Tharsis
- Cheap ocean на юге = 8 MC value
- Capital на Hellas — плохая

### Два архетипа

| | Tempo | Greedy |
|---|---|---|
| Приоритет | Plants, rebates, close game | Cards, special tiles, VP |
| Города | 0-1 | 2-3+ |
| Ocean | Агрессивно, рано | По необходимости |

---

## Часть 10: 50 Комбо (Ep. 5)

### Топ-комбо для нашего формата (3P/WGT/All)

| Combo | Суть | Ценность |
|---|---|---|
| Mars University + Olympus Conference | Экспоненциальный card draw | S-tier |
| Card Discount + Card Draw (общий) | God Mode enabler | S-tier |
| Kelp Farming + Ecology Experts | 2 MC-prod + 4 plant-prod gen 1 | S-tier |
| Standard Technology + Poseidon | Colony SP за 14 MC + 1 MC-prod/colony | A-tier |
| Fish + Large Convoy | ~8+ VP combo | A-tier |
| Robotic Workforce + Gyropolis | Copy production | A-tier |
| Robotic Workforce + Medical Lab | Copy production | A-tier |
| Stratopolis + Forced Precipitation | 1 free TR/gen + VP | A-tier |
| Extreme Cold Fungus + Ants/Venusian Insects | 1 VP/gen бесконечно | A-tier |
| Iron Mining Industries + Phobolog | Стартовые Ti оплачивают карту | A-tier |
| Immigrant City + Tharsis | City = 3 MC-prod | B-tier (3P) |
| Sulfur-Eating Bacteria + Enceladus | Personal Luna colony | B-tier |
| Viron + AI Central | 4 карты/gen | B-tier |
| Polyphemos + Pluto | Бесплатные карты решают проблему 5 MC/card | B-tier |
| Floater Technology + Aerial Mappers | 1 free card/gen | B-tier |
| Hydrogen to Venus + Floating Habs | Half a Jovian Amplifier | B-tier |
| Protected Habitat + Insects | Копи plants безопасно | B-tier |

### Ключевой принцип
- 3-piece combos: вероятность ~0.04%. Не строй план, но радуйся
- Дешёвые 2-piece combos надёжнее
- 1 TR/gen combo = ~8 MC-prod benchmark

---

## Часть 11: Jovian Strategy

### Amplifiers (всего 4)
- **IO Mining Industries** (41 MC): единственный, который играется рано (engine card). Окупается при 6+ Jovian
- **Ganymede Colony** (20 MC): last gen, окупается при 3+ Jovian
- **Water Import from Europa** (25 MC): last gen, окупается при 4+ Jovian
- **Terraforming Ganymede** (33 MC): last gen, окупается при 5+ Jovian

### Правило
- Без amplifier — большинство Jovian карт плохие (дорогие, слабый value)
- Средний VP от amplifier при хорошей игре: ~6 VP
- Лучше в 2-3P (длиннее), рискованнее в 5P

---

## Часть 12: Green Tag Strategy

### Почему недооценена
- Green tag VP карты дешевле Jovian amplifiers при сопоставимой отдаче
- 4+ free VP/gen от action cards = невозможно догнать
- Тесно связана с card strategy

### Ключевые карты
- Viral Enhancers (9 MC): ~5 VP, science tag, **очень недооценена**
- Imported Nitrogen: ~7 VP (1 TR + microbes + animals + plants)
- Large Convoy: 7 VP (без 1VP/animal карты — лучше 5 plants)
- Decomposers: дешёвая, ~3 VP
- Ecological Zone: ~5 VP при 10 green tags
- Venusian Animals: до 20+ VP (но 18 Venus req тяжело)
- Advanced Ecosystems: 5 VP с synergy (last gen!)

### Enablers
- Meat Industries / GMO Contract / Topsoil Contract
- Protected Habitat — критичен
- Обязательно иметь хотя бы одну 1 VP/animal карту

---

## Часть 13: Standard Projects

| SP | Cost | Value | Вердикт |
|---|---|---|---|
| Build Colony | 17 MC | ~14 MC effective | **ЛУЧШИЙ early game** |
| Power Plant | 11 MC | Дорого, но нужно | Для 3-й energy → trade |
| Greenery | 23 MC | ~3 VP late game | Нормально в late game |
| City | 25 MC | Только с synergy | Late game VP |
| Aquifer | 18 MC | -6 MC value | Только с ocean req/bonus |
| Asteroid | 14 MC | -6 MC value | Только для bonus threshold |
| Air Scrapping | 15 MC | -7 MC value | Почти никогда |

---

## Часть 14: Milestones и Awards

### Milestones по player count
| Players | Timing |
|---|---|
| 2P | ~gen 5+ (можно пропустить) |
| 3P | ~gen 4 |
| 4P | ~gen 3 |
| 5P | ASAP (гонка!) |

### Awards
- Первый (8 MC) — только если уверен в победе
- Второй (14 MC) — mid game
- Третий (20 MC) — mid-late, не критичен
- **СЧИТАЙ ЗАРАНЕЕ.** Если не можешь защитить — не fund

---

## Часть 15: Training with Legends — Уроки от топ-игроков (2000+ Elo)

### Ключевые принципы

1. **Не помогай оппоненту закрывать игру.** SP Greenery, ocean, temperature bumps — каждое действие приближает конец
2. **Cash tight = play safe.** Greedy карты великолепны только если хватает MC
3. **Fund awards рано если можешь защитить.** Пропущенный award стоит партий
4. **Heat production = cash production по ценности.** Топ-игроки единодушны
5. **Energy gen 1 = ~10 MC.** Значительно дороже гайдовых ~7 MC
6. **Deny > develop когда нечего делать.** Cut сильную карту оппонента > marginal engine card
7. **Sequencing решает.** Порядок действий в последних 2 gen = победа или поражение
8. **Lake Marineris — top-tier keep** в любой руке (70-80% играбельна)
9. **Четвёртая карта — ВСЕГДА покупай**
10. **Hellas длиннее на ~0.3 gen**, greedy сильнее, tempo хуже

### Распространённые ошибки топ-игроков
- AI Central gen 7+ без подготовки — ~40 MC за 3 VP = катастрофа
- SP Greenery когда оппонент хочет закрыть = помогаешь ему
- Пропуск fund award из-за "math anxiety"
- Earth Catapult в раш-игре — development play помогает оппоненту
- Конверсия greenery вместо pass = отдаёшь 21 MC оппоненту

### Карточные переоценки/недооценки
- **Недооценены:** Viral Enhancers, Power Plant SP, Fuel Generators, Lake Marineris, Noctis Farming (last gen play)
- **Переоценены:** Cloud Seeding ("одна из худших"), Worms, Soletta в opening hand, "три карты" spot на Elysium
- **Ситуативно:** AAA (хороша в раш), Micro Mills (если выравнивает heat), Strip Mine gen 7+ (плоха без minerals)

---

## Применение к нашим инструментам

### Для tm_advisor.py
- Обновить ценность energy gen 1 с ~7 до ~10 MC
- Card draw + card discount синергия — добавить в ComboDetector (экспоненциальный бонус)
- Colony рекомендации: Build Colony первым действием при наличии Luna/Pluto
- Тайминг-советы: Jovian amplifiers = last gen (кроме IO Mining Industries)
- Green tag amplifiers = mid game
- "Don't help close" advisory при greedy strategy

### Для evaluations.json
- Viral Enhancers: пересмотреть вверх (~B75-78?)
- Lake Marineris: пересмотреть вверх (70-80% играбельна, top-tier VP efficiency)
- Cloud Seeding: пересмотреть вниз
- Worms: подтверждает текущую низкую оценку
- Fuel Generators: пересмотреть вверх (всегда играть по мнению топов)
- Noctis Farming: подтверждает B70, но уточнить — играть в last gen

### Для strategy_guide.md
- Добавить секцию "God Mode Formula" (income × card draw > 1000)
- Добавить секцию "Player Count Strategy Matrix"
- Добавить секцию "Tile Placement Priorities"
- Расширить colony/heat/plant стратегии
