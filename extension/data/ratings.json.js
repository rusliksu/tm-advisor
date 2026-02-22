const TM_RATINGS = {
  "Point Luna": {
    "s": 90,
    "t": "S",
    "y": [
      "Earth Office",
      "Luna Governor",
      "Карты с тегом Earth",
      "Карты с тегом Science"
    ],
    "w": "Почти всегда pick. Только пропускай если 0 Earth тегов в стартовых 10 (очень редко). S-tier.",
    "e": "38 MC + 1 титан-прод (12"
  },
  "CrediCor": {
    "s": 88,
    "t": "A",
    "y": [
      "Earth Catapult",
      "дорогие карты (20+ MC)",
      "Стандартный проект Greenery/City",
      "любая стратегия"
    ],
    "w": "Почти всегда. Один из самых безопасных picks в игре.",
    "e": "57 MC — один из лучших стартов"
  },
  "Manutech": {
    "s": 88,
    "t": "A",
    "y": [
      "Strip Mine",
      "Business Empire",
      "Insects",
      "Cartel",
      "Fuel Factory"
    ],
    "w": "Почти всегда. Даже средний хенд с Manutech лучше хорошего с большинством корпораций.",
    "e": "35 MC + 1 сталь-прод"
  },
  "EcoLine": {
    "s":87,
    "t": "A",
    "y": [
      "Ecology Experts",
      "Kelp Farming",
      "Nitrophilic Moss",
      "Farming",
      "Gardener"
    ],
    "w": "Plant production карты в руке. Лучше на Tharsis/Elysium. Осторожно на Hellas.",
    "e": "36 MC — низкий старт"
  },
  "Vitor": {
    "s":82,
    "t": "A",
    "y": [
      "Карты VP (большинство сильных карт)",
      "Стратегия наград",
      "Dust Seals",
      "Синергии Earth тега"
    ],
    "w": "Почти всегда. Особенно с VP-heavy рукой. Top 5 corp overall.",
    "e": "48 MC + бесплатная награда (8-20 MC экономии)"
  },
  "Tharsis Republic": {
    "s":68,
    "t": "C",
    "y": [
      "Immigrant City",
      "Карты городов",
      "Вэха Mayor",
      "Награда Landlord"
    ],
    "w": "Сильный generic pick. Особенно на Tharsis. С city-картами и production strategy.",
    "e": "40 MC + бесплатный город (бонус размещения + ~2 MC-прод от города + 1 MC-прод от эффекта = ~18-22 MC)"
  },
  "Lakefront Resorts": {
    "s":72,
    "t": "B",
    "y": [
      "Прелюдия Great Aquifer",
      "Ice Asteroid",
      "Arctic Algae",
      "Kelp Farming",
      "Aquifer Pumping"
    ],
    "w": "Почти всегда. Особенно с ocean-прелюдиями. Работает на любой карте.",
    "e": "54 MC + passive income от океанов"
  },
  "Poseidon": {
    "s":87,
    "t": "A",
    "y": [
      "Колония Luna",
      "Колония Pluto",
      "Колония Ceres",
      "Карты размещения колоний",
      "Торговый флот"
    ],
    "w": "Когда strong colonies in play. Одна из лучших в colony games.",
    "e": "45 MC + 1 MC-прод + бесплатная колония (~15-20 MC)"
  },
  "Philares": {
    "s":80,
    "t": "A",
    "y": [
      "Специальные тайлы",
      "Карты городов",
      "Карты озеленения",
      "Стратегия присутствия на карте",
      "Вэха Builder"
    ],
    "w": "Почти всегда сильна. Особенно с tile-placing картами.",
    "e": "47 MC + бесплатное озеленение (19 MC: 1 TR + O2 + бонус размещения)"
  },
  "Teractor": {
    "s":80,
    "t": "A",
    "y": [
      "Earth Office",
      "Luna Governor",
      "Карты с тегом Earth",
      "Любая дорогая стратегия"
    ],
    "w": "Почти всегда safe pick. Особенно с Earth тегами в руке.",
    "e": "60 MC — высший non-resource старт"
  },
  "Helion": {
    "s":52,
    "t": "D",
    "y": [
      "Soletta",
      "GHG Factories",
      "Heat Trappers",
      "Caretaker Contract",
      "Колония Miranda"
    ],
    "w": "Почти всегда хорош. Особенно с heat/energy прелюдиями. Лучше на Hellas.",
    "e": "42 MC + 3 тепло-прод"
  },
  "Valley Trust": {
    "s": 64,
    "t": "C",
    "y": [
      "Карты с тегом Science",
      "Research",
      "Сильный пул прелюдий",
      "Синергии Earth тега"
    ],
    "w": "Почти всегда safe pick. Extra prelude = flexibility и power. На Hellas (Scientist award) чуть лучше.",
    "e": "37 MC + extra prelude (~28-32 MC при выборе из 3)"
  },
  "Interplanetary Cinematics": {
    "s":62,
    "t": "C",
    "y": [
      "Advanced Alloys",
      "Rego Plastics",
      "Space Elevator",
      "Electro Catapult",
      "Strip Mine"
    ],
    "w": "ТОЛЬКО если в руке 2+ building-карт для сброса steel gen 1. Без steel-targets — слабая.",
    "e": "30 MC + 20 steel (40 MC при 2 MC/steel)"
  },
  "Spire": {
    "s": 73,
    "t": "B",
    "y": [
      "Мультитеговые карты",
      "Стандартные проекты",
      "Синергии Earth тега",
      "Научные карты"
    ],
    "w": "Хороший generic pick. Лучше когда ожидаешь SP использование.",
    "e": "50 MC + draw 4, оставить 1 (фильтрация)",
    "c": "/r/TerraformingMarsGame/comments/1ncexbi/cotd_spire_9_sept_2025/",
    "r": "This corp has been really fun and powerful in our games. It has great starting cash and a nice mulligan ability to he... — fuzzyplastic"
  },
  "Cheung Shing MARS": {
    "s":80,
    "t": "A",
    "y": [
      "Прелюдии с упором на сталь",
      "Mining Guild",
      "Building-карты",
      "Вэха Builder",
      "Earth Catapult"
    ],
    "w": "Универсальный pick. Хорош с building-рукой. Не выбирай если рука Space/ti heavy.",
    "e": "44 MC + 3 MC-прод (15-18 MC) = ~62 MC"
  },
  "PolderTECH Dutch": {
    "s": 72,
    "t": "B",
    "y": [
      "Arctic Algae",
      "Карты синергий океанов",
      "Карты с тегом Earth"
    ],
    "w": "Хороший generic pick. Immediate TR и tiles сильны gen 1.",
    "e": "35 MC + бесплатный океан (12-14 MC) + бесплатное озеленение (19 MC) = ~66-68 MC"
  },
  "Morning Star Inc.": {
    "s": 55,
    "t": "C",
    "y": [
      "Stratospheric Birds",
      "Maxwell Base",
      "Venus Governor",
      "Dirigibles",
      "Atmospheric Enhancers"
    ],
    "w": "Когда хотите Venus-стратегию. Лучше когда Venus L1 Shade или Atmospheric Enhancers в прелюдиях. 50 MC позволяет гибко...",
    "e": "50 MC + 3 Venus карты из колоды (~12-15 MC card value) + Venus тег (~2 MC)",
    "c": "/r/TerraformingMarsGame/comments/1paetj9/cotd_morning_star_inc_30_nov_2025/",
    "r": "It's an alright engine corp. Generally needs a longer game to win. — icehawk84"
  },
  "Nirgal Enterprises": {
    "s":70,
    "t": "B",
    "y": [
      "Прелюдии прод",
      "Вэха Ecologist",
      "Вэха Builder",
      "Вэха Diversifier"
    ],
    "w": "Прелюдии компенсируют низкий старт И есть путь к 1-2 milestones.",
    "e": "30 MC + 1 энергия + 1 растение + 1 сталь прод"
  },
  "Septem Tribus": {
    "s":74,
    "t": "B",
    "y": [
      "Карты делегатов",
      "Партии Turmoil",
      "Wild тег для вэх"
    ],
    "w": "С Turmoil и возможностью инвестировать в delegates рано.",
    "e": "36 MC + Wild тег"
  },
  "Saturn Systems": {
    "s":76,
    "t": "B",
    "y": [
      "Io Mining Industries",
      "Множители Jovian",
      "Колония Ganymede",
      "Колония Titan"
    ],
    "w": "Jovian карты в руке и ti-prod prelude. Лучше с меньшим количеством игроков.",
    "e": "42 MC + 1 титан-прод (12"
  },
  "EcoTec": {
    "s":50,
    "t": "D",
    "y": [
      "Decomposers",
      "Ants",
      "Splice",
      "Вэха Ecologist",
      "NRA"
    ],
    "w": "Bio-heavy рука с microbe targets. На Elysium (Ecologist).",
    "e": "42 MC + 1 растения-прод (8 MC) = ~50 MC"
  },
  "Robinson Industries": {
    "s":52,
    "t": "D",
    "y": [
      "Стратегия диверсификации прод",
      "Вэха Diversifier"
    ],
    "w": "Decent generic pick. Ранний ti/energy prod за 4 MC хорош gens 1-2.",
    "e": "47 MC + действие (повысить наименьший прод за 4 MC)"
  },
  "Inventrix": {
    "s": 63,
    "t": "C",
    "y": [
      "Научные карты",
      "Карты со строгими требованиями",
      "Mars University",
      "Olympus Conference"
    ],
    "w": "Нужен Science тег или карты с жёсткими requirements. На Hellas (Scientist award) чуть лучше.",
    "e": "45 MC + 3 cards (~10 MC) + Science тег (3-5 MC)"
  },
  "Mons Insurance": {
    "s":76,
    "t": "B",
    "y": [
      "Карты высокой MC прод"
    ],
    "w": "При отсутствии лучших альтернатив. Избегай если видишь Ants у оппонентов.",
    "e": "48 MC + 4 MC-прод"
  },
  "Sagitta Frontier Services": {
    "s": 63,
    "t": "C",
    "y": [
      "Карты без тегов",
      "Community Services",
      "Black Polar Dust",
      "Карты с одним тегом"
    ],
    "w": "С production прелюдиями. Energy помогает с Colonies.",
    "e": "31 MC + 1 энергия + 2 MC-прод"
  },
  "Arklight": {
    "s":50,
    "t": "D",
    "y": [
      "Large Convoy",
      "Imported Nitrogen",
      "Ecological Zone",
      "Колония Miranda",
      "Fish"
    ],
    "w": "Рука с plant/animal картами. На Elysium (Ecologist milestone).",
    "e": "45 MC + 2 MC-прод (10-12 MC) = ~57 MC"
  },
  "Viron": {
    "s": 65,
    "t": "C",
    "y": [
      "AI Central",
      "Electro Catapult",
      "Карты VP животных",
      "Extreme Cold Fungus"
    ],
    "w": "ТОЛЬКО с AI Central или premium action card в стартовой руке. Не надеяться найти позже.",
    "e": "48 MC + Microbe тег"
  },
  "Aridor": {
    "s": 61,
    "t": "C",
    "y": [
      "Olympus Conference",
      "Deuterium Export",
      "Колония Pluto",
      "Колония Luna",
      "Мультитеговые карты"
    ],
    "w": "Много дешёвых карт с разными тегами в стартовой руке. Лучше с Venus (11-й тег). Не брать если рука дорогая.",
    "e": "40 MC — низкий старт",
    "c": "/r/TerraformingMarsGame/comments/1n3xvwo/cotd_aridor_on_a_stick_30_aug_2025/",
    "r": "Weaker, situational card with annoying design Early game it is situational to have enough (at least 6+) different tag... — FieldMouse007"
  },
  "Mining Guild": {
    "s":45,
    "t": "D",
    "y": [
      "Space Elevator",
      "Electro Catapult",
      "Advanced Alloys",
      "Вэха Builder",
      "Награда Miner"
    ],
    "w": "На Tharsis с ocean-прелюдиями и steel-dump картами.",
    "e": "30 MC + 5 сталь + 1 сталь-прод"
  },
  "PhoboLog": {
    "s":48,
    "t": "D",
    "y": [
      "Io Mining Industries",
      "Космические события",
      "Карты прод титана",
      "Космические прелюдии"
    ],
    "w": "ТОЛЬКО с Io Mining Industries или 2+ дорогих space карт И ti-prod. Иначе пропускай.",
    "e": "23 MC + 10 титана (30-50 MC)"
  },
  "Pristar": {
    "s":68,
    "t": "C",
    "y": [
      "Партия Reds",
      "Карты VP без TR",
      "Нетерраформинговая прод",
      "Массовый терраформинг лейт-гейма"
    ],
    "w": "Strong production прелюдии и VP карты без TR. Очень специфичный playstyle.",
    "e": "53 MC - 2 TR штраф (~16 MC потеряно)"
  },
  "Factorum": {
    "s": 58,
    "t": "C",
    "y": [
      "Колонии (торговля)",
      "AI Central",
      "Power Infrastructure",
      "Strip Mine"
    ],
    "w": "С Colonies и energy-картами. Без Colonies — ниже среднего.",
    "e": "37 MC + 1 сталь-прод (8 MC) = ~45 MC"
  },
  "Palladin Shipping": {
    "s": 58,
    "t": "C",
    "y": [
      "Космические карты",
      "Io Mining Industries",
      "Колония Titan",
      "Планетарные треки Pathfinders"
    ],
    "w": "С space-heavy рукой где 5 ti пригодятся gen 1. Не лучший pick, но приемлемый если альтернативы хуже. Action на planet...",
    "e": "36 MC + 5 ti (~15 MC) + Space тег (~1 MC)",
    "c": "/r/TerraformingMarsGame/comments/1p3pwjo/cotd_palladin_shipping_22_nov_2025/",
    "r": "This corporation is a bit like Phobolog, with the space tag, low start mc, and start titanium. — benbever"
  },
  "Tycho Magnetics": {
    "s": 60,
    "t": "C",
    "y": [
      "Predators",
      "Fish",
      "Livestock",
      "Physics Complex",
      "Dirigibles"
    ],
    "w": "С VP-аккумуляторами (animals/microbes/floaters). Science тег ценен. 42 MC старт тяжёлый, но действие компенсирует.",
    "e": "42 MC + 1 энергия-прод (~49.5 MC старт). Действие: 1 энергия → +1 ресурс = ~5-8 MC/пок с хорошей целью."
  },
  "Thorgate": {
    "s":44,
    "t": "D",
    "y": [
      "Standard Technologies",
      "Power Infrastructure",
      "Колонии",
      "Карты потребляющие энергию"
    ],
    "w": "С Colonies и Standard Technologies. Без них — ниже среднего.",
    "e": "48 MC + 1 энергия-прод"
  },
  "Utopia Invest": {
    "s":74,
    "t": "B",
    "y": [
      "Robinson Industries (Merger)",
      "Карты стали и титана",
      "Конвертация ресурсов лейт-гейма"
    ],
    "w": "Building/space карты для steel и titanium. Action — nice late-game option.",
    "e": "40 MC + 1 сталь-прод + 1 титан-прод = ~60"
  },
  "Arcadian Communities": {
    "s":54,
    "t": "D",
    "y": [
      "Immigrant City",
      "Research Outpost",
      "Lava Flows",
      "Nuclear Zone"
    ],
    "w": "Elysium с city-тяжёлой рукой. На Tharsis/Hellas — почти никогда.",
    "e": "40 MC + 10 стали (~20 MC) = ~60 MC"
  },
  "Stormcraft Incorporated": {
    "s": 54,
    "t": "D",
    "y": [
      "Карты флоатеров",
      "Titan Floating Launch-pad",
      "Множители Jovian",
      "Колония Titan"
    ],
    "w": "Хорошие Jovian multipliers и floater targets. Jovian тег — главный аргумент.",
    "e": "48 MC + Jovian тег"
  },
  "Celestic": {
    "s":62,
    "t": "C",
    "y": [
      "Dirigibles",
      "Titan Floating Launch-Pad",
      "Stratospheric Birds",
      "Вэха Hoverlord"
    ],
    "w": "Venus-тяжёлая рука с хорошими floater targets.",
    "e": "42 MC + 2 floater-карты (~6-8 MC)"
  },
  "Pharmacy Union": {
    "s":68,
    "t": "C",
    "y": [
      "Карты с тегом Science",
      "Research",
      "Mars University",
      "Стратегия быстрого флипа"
    ],
    "w": "Только с 3+ science тегами для быстрого cure gen 1-2. Очень рискованно в 3P.",
    "e": "54 MC + Science карта"
  },
  "Aphrodite": {
    "s":58,
    "t": "C",
    "y": [
      "Stratospheric Birds",
      "Venus Governor",
      "Dirigibles",
      "Morning Star Inc (Merger)"
    ],
    "w": "Почти никогда. Только если обе альтернативы хуже и в руке Venus-карты.",
    "e": "47 MC + 1 растения-прод (8 MC) = ~55 MC"
  },
  "Kuiper Cooperative": {
    "s": 48,
    "t": "D",
    "y": [
      "Не-событийные космические карты",
      "Titan Shuttles",
      "Space Station"
    ],
    "w": "Почти никогда. Одна из самых слабых корпораций.",
    "e": "33 MC + 1 титан-прод (12"
  },
  "Recyclon": {
    "s":58,
    "t": "C",
    "y": [
      "Карты с тегом Building",
      "Advanced Alloys",
      "Прелюдии тега Building"
    ],
    "w": "Только с 2+ building preludes И хорошими building картами. Обычно outclassed.",
    "e": "38 MC + 1 сталь-прод"
  },
  "Astrodrill": {
    "s":64,
    "t": "C",
    "y": [
      "Mining Area",
      "Asteroid Mining",
      "Space-тег карты"
    ],
    "w": "Практически никогда.",
    "e": "35 MC + 3 ресурса астероидов (~9 MC)"
  },
  "Splice": {
    "s": 58,
    "t": "C",
    "y": [
      "Decomposers",
      "Extreme-Cold Fungus",
      "Viral Enhancers",
      "Колония Enceladus",
      "Карты микробов"
    ],
    "w": "С microbe-engine (Decomposers + Extreme-Cold Fungus) или колонией Enceladus — работающая стратегия. Без microbe поддержки — слабая.",
    "e": "44 MC + 1 Microbe карта. Ability: при Microbe теге получи 2 MC или microbe на карту"
  },
  "United Nations Mars Initiative": {
    "s": 42,
    "t": "D",
    "y": [
      "Карты фокуса на терраформинг",
      "Вэха Terraformer"
    ],
    "w": "Почти никогда. Только с очень эффективными TR-raising картами.",
    "e": "40 MC + Earth тег"
  },
  "Polyphemos": {
    "s":42,
    "t": "D",
    "y": [
      "AI Central",
      "Mars University",
      "Стандартные проекты"
    ],
    "w": "Почти никогда. Только с alternative card draw И ti-heavy картами.",
    "e": "50 MC + 5 MC-прод + 5 титан"
  },
  "Terralabs Research": {
    "s": 38,
    "t": "D",
    "y": [
      "Mars University",
      "Карты с тегом Science",
      "Скидки Earth тега"
    ],
    "w": "Почти никогда. Даже с incredible free картами — слишком рискованно.",
    "e": "14 MC - 1 TR штраф"
  },
  "Project Eden": {
    "s": 90,
    "t": "S",
    "y": [
      "Любая корпорация",
      "Tharsis (вэха Mayor)",
      "Стратегии наземной игры",
      "Ecoline"
    ],
    "w": "Всегда. Сильнейшая стандартная прелюдия. Бери каждый раз, когда видишь.",
    "e": "1 океан (12 MC) + 1 город (~8 MC) + 1 озеленение (~12 MC) + бонусы размещения (~6-10 MC) - 3 карты (..."
  },
  "High Circles": {
    "s": 85,
    "t": "A",
    "y": [
      "Septem Tribus",
      "Стратегии Turmoil",
      "Corridors of Power",
      "Rise To Power",
      "Point Luna"
    ],
    "w": "Всегда берите в Turmoil-играх. Permanent +1 influence масштабируется экспоненциально. Особенно сильна с Septem Tribus...",
    "e": "1 TR = 7 MC",
    "c": "/r/TerraformingMarsGame/comments/1p74ees/cotd_high_circles_26_nov_2025/",
    "r": "You get an Earth tag, 1TR, a card with a party requirement, and 2 delegates to place in 1 party. — benbever"
  },
  "Great Aquifer": {
    "s": 84,
    "t": "A",
    "y": [
      "Arctic Algae",
      "Kelp Farming",
      "Ecoline",
      "Бонусы размещения Tharsis"
    ],
    "w": "Почти всегда сильный выбор. Лучше всего на Tharsis (бонусы размещения). Чуть слабее, если нет карт наземной игры.",
    "e": "2 океана = 2 TR (~14-15 MC) + 2 бонуса размещения (~4-8 MC в среднем)"
  },
  "Huge Asteroid": {
    "s":72,
    "t": "B",
    "y": [
      "Карты с гейтом температуры",
      "Helion",
      "Стратегии TR-раша",
      "Insects/Methane From Titan"
    ],
    "w": "Сильно в раш-стратегиях. Хорошо когда есть карты с требованием температуры. Стоимость 5 MC означает меньшую выгоду при нехватке денег...",
    "e": "3 шага температуры = 3 TR (~21-22 MC) + тепло-прод от 0->-2 шага = ~4 MC"
  },
  "UNMI Contractor": {
    "s": 78,
    "t": "B",
    "y": [
      "UNMI",
      "Point Luna",
      "TR-раш",
      "Вэха Terraformer"
    ],
    "w": "Почти всегда топ-пик. Особенно хорош для стратегий TR-раша и Point Luna (Earth тег + карта).",
    "e": "3 TR = 3 MC-прод + 3 VP = ~21 MC немедленно (3 x 7 MC)"
  },
  "Experimental Forest": {
    "s": 82,
    "t": "A",
    "y": [
      "Ecoline",
      "NRA (Nitrogen-Rich Asteroid)",
      "Вэха Gardener",
      "Arctic Algae",
      "Tharsis (бонусы размещения)"
    ],
    "w": "Plant/ground game стратегия. Особенно с Ecoline. На Tharsis для Gardener milestone. 2 plant-карты из колоды обеспечив...",
    "e": "1 озеленение = 1 TR + подъём O2 + бонус размещения (~12-15 MC)",
    "c": "/r/TerraformingMarsGame/comments/1okqiv1/cotd_experimental_forest_31_oct_2025/",
    "r": "It's an unbelievable prelude. Tile placement can often get you a big rebate, especially on expansion maps. — DaiWales"
  },
  "Planetary Alliance": {
    "s": 82,
    "t": "A",
    "y": [
      "Saturn Systems",
      "Point Luna",
      "Aridor",
      "Io Mining Industries",
      "Множители Jovian"
    ],
    "w": "Почти всегда сильна при игре с Venus. Особенно ценна с Saturn Systems (Jovian тег + Jovian карта) и Point Luna (Earth...",
    "e": "2 TR = 14 MC",
    "c": "/r/TerraformingMarsGame/comments/1perax7/cotd_planetary_alliance_5_dec_2025/",
    "r": "Very high value prelude. Most comparable with [UNMI Contractor] which is one of thr best preludes from Prelude 1. — benbever"
  },
  "Allied Bank": {
    "s": 80,
    "t": "A",
    "y": [
      "Point Luna",
      "Teractor",
      "Cartels",
      "Space Hotels",
      "Robinson Industries"
    ],
    "w": "Почти всегда хороший выбор. Чуть лучше в длинных играх (больше пок для получения выгоды от продакшена).",
    "e": "4 MC-прод = 20-24 MC в 1 пок"
  },
  "Metal-Rich Asteroid": {
    "s": 80,
    "t": "A",
    "y": [
      "Advanced Alloys",
      "Смешанные Building+Space руки",
      "Любая корпорация"
    ],
    "w": "Когда есть building и space карты, чтобы потратить металлы. Почти всегда сильный пик.",
    "e": "1 шаг температуры = 1 TR (~7 MC) + бонус тепло-прод"
  },
  "Business Empire": {
    "s": 79,
    "t": "B",
    "y": [
      "Credicor",
      "Teractor",
      "Point Luna",
      "Robinson Industries"
    ],
    "w": "Когда хватает стартовых MC, чтобы выдержать расход 6 MC без провала пок 1. Лучше в длинных играх.",
    "e": "6 MC-прод = 30-36 MC пок 1"
  },
  "Atmospheric Enhancers": {
    "s": 78,
    "t": "B",
    "y": [
      "Morning Star Inc",
      "Stratospheric Birds",
      "Venus L1 Shade",
      "Aphrodite"
    ],
    "w": "Когда есть карты Venus в руке или нужен гибкий TR. Отлично с Morning Star Inc. Хорошо даже без синергии Venus.",
    "e": "2 подъёма любого параметра = ~14-15 MC (2 TR)"
  },
  "Early Colonization": {
    "s": 77,
    "t": "B",
    "y": [
      "Titan",
      "Io",
      "Ganymede",
      "Miranda",
      "Poseidon"
    ],
    "w": "Когда в игре сильные колонии и есть (или можно получить) 3 энергия-прод для будущей торговли. Топ колониальная прелюдия.",
    "e": "Размещение колонии = ~13 MC"
  },
  "Metals Company": {
    "s": 76,
    "t": "B",
    "y": [
      "Любая стратегия",
      "Вэха Diversifier (Hellas)",
      "Движковые билды"
    ],
    "w": "Почти всегда хорош для стратегий наращивания движка. Менее хорош в чистом раше. Надёжный дефолтный пик.",
    "e": "1 MC-прод = 5 MC, 1 сталь-прод = 8 MC, 1 титан-прод = 12"
  },
  "Soil Bacteria": {
    "s": 76,
    "t": "B",
    "y": [
      "Decomposers",
      "Ants",
      "Tardigrades",
      "Splice",
      "EcoTec"
    ],
    "w": "При microbe-стратегии или когда нужен pipeline для VP через microbe engine. Особенно с Splice или EcoTec. 3 plants по...",
    "e": "2 карты микробов (на выбор) = ~8-10 MC",
    "c": "/r/TerraformingMarsGame/comments/1pflzwr/cotd_soil_bacteria_6_dec_2025/",
    "r": "Soil Bacteria, without its effect, is worth 4 plants, 2 microbe cards, and a microbe tag. — benbever"
  },
  "Double Down": {
    "s": 76,
    "t": "B",
    "y": [
      "Great Aquifer (x2 = 4 океана)",
      "Huge Asteroid (x2 = 6 темп)",
      "Business Empire (x2 = 12 MC-прод)",
      "Allied Bank (x2 = 8 MC-прод)",
      "UNMI Contractor (x2 = 6 TR)"
    ],
    "w": "Когда парная прелюдия имеет мощный direct effect. Лучше всего с Great Aquifer, Huge Asteroid, UNMI Contractor. Не бер...",
    "e": "Копирует direct effect другой прелюдии",
    "c": "/r/TerraformingMarsGame/comments/1oqql60/cotd_double_down_7_nov_2025/",
    "r": "Fun card, and potentially really strong, as long as you can copy a strong prelude. — benbever"
  },
  "Acquired Space Agency": {
    "s": 74,
    "t": "B",
    "y": [
      "Phobolog",
      "Saturn Systems",
      "Point Luna",
      "Satellites"
    ],
    "w": "Когда есть космические карты в руке или играешь Phobolog/Saturn Systems. Пропускай, если рука вся Building/Earth.",
    "e": "6 титан = 18 MC (24 за Phobolog)"
  },
  "Polar Industries": {
    "s": 74,
    "t": "B",
    "y": [
      "Helion",
      "Ecoline",
      "Robotic Workforce",
      "Раш-стратегии"
    ],
    "w": "Хорошо для раша или стратегии терраформирования. Бонусы размещения океана могут быть отличными на Тарсисе.",
    "e": "2 тепло-прод = 8 MC, 1 океан = ~12 MC (1 TR + бонус размещения)"
  },
  "Strategic Base Planning": {
    "s": 74,
    "t": "B",
    "y": [
      "Игры с колониями",
      "Tharsis (Mayor)",
      "Руки с прод энергии"
    ],
    "w": "Когда сильные колонии в игре и есть энергия для торговли. Также хорош для майлстоуна Mayor на Tharsis.",
    "e": "Город = ~8-12 MC (зависит от бонуса размещения), колония = ~13 MC"
  },
  "Corporate Archives": {
    "s": 73,
    "t": "B",
    "y": [
      "Crescent Research",
      "Научные требования",
      "Хорошая стартовая рука"
    ],
    "w": "Когда рука уже неплохая и нужно найти конкретные синергии. Тег Science открывает требования. S...",
    "e": "13 MC + просмотр 7, оставить 2 карты = ~6-10 MC (лучше случайных благодаря выбору)"
  },
  "Research Network": {
    "s": 73,
    "t": "B",
    "y": [
      "NRA",
      "AI Central",
      "Множители Jovian",
      "Любая вэха на теги"
    ],
    "w": "Когда Wild тег закрывает критическую потребность (активация NRA, счётчик тегов для вехи). Слабее, если нужна только сырая прод...",
    "e": "1 MC-прод = 5 MC, 3 карты = 9-12 MC",
    "c": "/r/TerraformingMarsGame/comments/1nj8y7l/cotd_research_network_17_sept_2025/",
    "r": "It's decent value for a prelude, but it hardly provides any development, so I'm always hesitant to pick this unless I... — icehawk84"
  },
  "Space Lanes": {
    "s": 73,
    "t": "B",
    "y": [
      "Игры с колониями",
      "Poseidon",
      "Торговый флот",
      "Колония Titan",
      "Колония Luna"
    ],
    "w": "В играх с хорошими колониями, где вы планируете активно торговать. 3 ti gen 1 + ongoing trade bonus = solid combo. Бе...",
    "e": "3 титана = 9 MC",
    "c": "/r/TerraformingMarsGame/comments/1p4j61q/cotd_space_lanes_23_nov_2025/",
    "r": "It's fine. Reaches average value after 6 discounted cards, if my math is correct. — Great_GW"
  },
  "Aquifer Turbines": {
    "s": 72,
    "t": "B",
    "y": [
      "Колонии (торговля)",
      "Strip Mine",
      "Electro Catapult",
      "Thorgate"
    ],
    "w": "Когда есть потребители энергии в руке или играешь с Colonies. Хорош на Tharsis за бонусы размещения океанов.",
    "e": "1 океан = ~12 MC (1 TR + бонус размещения)"
  },
  "Merger": {
    "s": 72,
    "t": "B",
    "y": [
      "Valley Trust (9 прелюдий для просмотра)",
      "Любая сильная комбинация корпораций"
    ],
    "w": "Когда текущий сетап посредственный и готов рискнуть. Пропускай, если рука уже сильная — 42 MC ...",
    "e": "Draw 4 корпорации, сыграть 1, заплатить 42 MC",
    "c": "/r/TerraformingMarsGame/comments/1nftxej/cotd_merger_13_sept_2025/",
    "r": "My group plays this like any other prelude. It's decent, but not as crazy as it looks at first glance. — icehawk84"
  },
  "Smelting Plant": {
    "s": 72,
    "t": "B",
    "y": [
      "Руки карт Building",
      "Small Animals",
      "Cattle",
      "Карты с req O2"
    ],
    "w": "Когда есть карты Building для траты стали. Хорошо, если O2 открывает карты с требованиями. Надёжная TR-прелюдия.",
    "e": "2 шага O2 = 2 TR (~14-15 MC) + 5 сталь = 10 MC"
  },
  "Supply Drop": {
    "s": 71,
    "t": "B",
    "y": [
      "Advanced Alloys",
      "Смешанные Building+Space руки",
      "Ecoline (растения)"
    ],
    "w": "Когда есть карты building + space для немедленной траты ресурсов. Хуже без целей для применения.",
    "e": "3 титана = 9 MC, 8 стали = 16 MC, 3 растения = ~5 MC"
  },
  "Ecology Experts": {
    "s": 70,
    "t": "B",
    "y": [
      "Kelp Farming",
      "NRA",
      "Trees",
      "Bushes",
      "Fish"
    ],
    "w": "Только когда есть сильная карта с глобальным требованием, которое иначе не выполнить. Без цели = плохая прелюдия.",
    "e": "1 растения-прод = 8 MC"
  },
  "New Partner": {
    "s": 70,
    "t": "B",
    "y": [
      "Valley Trust",
      "Плохие прелюдии"
    ],
    "w": "Когда другие прелюдии посредственные и хочется перебросить. Пропускай, если уже есть 2 отличные прелюдии.",
    "e": "1 MC-прод = 5 MC + draw 2 прелюдии, сыграть 1"
  },
  "World Government Advisor": {
    "s": 70,
    "t": "B",
    "y": [
      "Стратегии TR-раша",
      "UNMI",
      "Point Luna",
      "Стратегии Venus (подъём Venus)"
    ],
    "w": "Когда идёшь ва-банк на раш и хочешь укоротить игру. Опасно, если оппоненты тоже рашат или если тво...",
    "e": "2 TR = ~14 MC сразу"
  },
  "Corridors of Power": {
    "s": 68,
    "t": "C",
    "y": [
      "Septum Tribus",
      "Стратегии Turmoil",
      "Point Luna"
    ],
    "w": "При стратегии с фокусом на Turmoil или Septum Tribus. Менее надёжно в конкурентном 3P лоббировании.",
    "e": "1 TR = 7 MC, 4 MC сразу, тег Earth ~2 MC",
    "c": "/r/TerraformingMarsGame/comments/1nk4awd/cotd_corridors_of_power_18_sept_2025/",
    "r": "It is a strong Prelude. In 2p, you can pretty much gain an extra card every single turn. — ThainEshKelch"
  },
  "Rise To Power": {
    "s": 66,
    "t": "C",
    "y": [
      "Septum Tribus",
      "Стратегии Turmoil",
      "Политическое лоббирование"
    ],
    "w": "Когда Turmoil важен для твоей стратегии и хочешь ранний политический контроль. Менее эффективен в неполитических стратегиях.",
    "e": "3 MC-прод = 15-18 MC"
  },
  "Supplier": {
    "s": 66,
    "t": "C",
    "y": [
      "Electro Catapult",
      "Колонии (торговля)",
      "Strip Mine",
      "Руки Building"
    ],
    "w": "Когда нужна энергия для Колоний или есть карты Building для траты стали. Неплохой дефолтный выбор.",
    "e": "2 энергия-прод = 15 MC, 4 стали = 8 MC"
  },
  "Focused Organization": {
    "s": 66,
    "t": "C",
    "y": [
      "Стратегии ротации карт",
      "Viron (двойное действие)",
      "Корпорации с бонусами вытягивания карт"
    ],
    "w": "Когда нужен resource conversion или card filtering и другие прелюдии хуже. Не приоритетный pick — immediate value сли...",
    "e": "Сразу: draw 1 карта (~3-4 MC) + получить 1 стандартный ресурс (~2-3 MC)",
    "c": "/r/TerraformingMarsGame/comments/1ou5ntn/cotd_focused_organization_11_nov_2025/",
    "r": "Contrary to most preludes it does not give much of an instant effect, but it does give you the equivalent of triggeri... — Insanitarius-"
  },
  "Power Generation": {
    "s": 64,
    "t": "C",
    "y": [
      "Колонии (торговля)",
      "Strip Mine",
      "Electro Catapult",
      "Thorgate"
    ],
    "w": "Лучше всего с Colonies (можно торговать с 1 пок). Также хорошо с энергозатратными картами. Без потребителей это просто дорогой тепло-прод.",
    "e": "3 энергия-прод = 22"
  },
  "Dome Farming": {
    "s": 63,
    "t": "C",
    "y": [
      "Robotic Workforce",
      "NRA",
      "Ecoline",
      "Mining Guild"
    ],
    "w": "Когда нужна комбинация тегов Plant+Building, или есть Robotic Workforce. Приемлемая прелюдия-филлер.",
    "e": "2 MC-прод = 10-12 MC, 1 растения-прод = 8 MC"
  },
  "Mining Operations": {
    "s": 62,
    "t": "C",
    "y": [
      "Руки со сталью",
      "Space Elevator",
      "Electro Catapult",
      "Mining Guild"
    ],
    "w": "Только когда в руке 3+ карт Building. Без целей для стали значительно слабее.",
    "e": "2 сталь-прод = 16 MC, 4 стали = 8 MC"
  },
  "Terraforming Deal": {
    "s": 62,
    "t": "C",
    "y": [
      "Стратегии TR-раша",
      "UNMI",
      "UNMI Contractor",
      "Huge Asteroid",
      "Great Aquifer"
    ],
    "w": "При TR rush стратегии, где вы поднимаете 3-5 TR за gen. Сочетается с UNMI. Не берите если ваша стратегия — engine bui...",
    "e": "Earth тег ~2-3 MC",
    "c": "/r/TerraformingMarsGame/comments/1pgetcn/cotd_terraforming_deal_7_dec_2025/",
    "r": "This prelude can give you a lot of mc, but only if you get a lot of TR. — benbever"
  },
  "Donation": {
    "s": 60,
    "t": "C",
    "y": [
      "Дорогие карты 1 поколения",
      "Io Mining Industries",
      "Любая корпорация с низким стартом MC"
    ],
    "w": "Когда есть дорогие карты на 1-е пок и другие прелюдии не подходят. Не впечатляет, но редко ужасна.",
    "e": "21 MC фиксировано"
  },
  "Venus L1 Shade": {
    "s": 60,
    "t": "C",
    "y": [
      "Morning Star Inc",
      "Aphrodite",
      "Карты с Venus req",
      "Atmospheric Enhancers"
    ],
    "w": "Когда есть карты стратегии Венеры или Morning Star Inc. Без синергии с Венерой Huge Asteroid или Great Aquifer сильнее...",
    "e": "3 шага Венеры"
  },
  "Eccentric Sponsor": {
    "s": 58,
    "t": "C",
    "y": [
      "Io Mining Industries",
      "Space Elevator",
      "Любая движковая карта 25+ MC"
    ],
    "w": "Только когда есть карта на 25+ MC, которую хочешь сыграть в 1 пок. Если нет цели — никогда не бери.",
    "e": "Фактически Donation (25 MC), если есть карта на 25+ MC"
  },
  "Industrial Complex": {
    "s": 58,
    "t": "C",
    "y": [
      "Credicor",
      "Point Luna",
      "Loan (комбо)",
      "Корпорации без прод"
    ],
    "w": "Только с корпорациями, у которых стартовое производство 0 по всем ресурсам. Никогда с Ecoline, Mining Guild, Helion и т.д.",
    "e": "Поднимает все прод <1 до 1"
  },
  "Old Mining Colony": {
    "s": 58,
    "t": "C",
    "y": [
      "Игры с колониями",
      "Saturn Systems",
      "Руки космических карт"
    ],
    "w": "Когда колонии хороши и есть мусорная карта на сброс. Early Colonization обычно лучше.",
    "e": "1 колония = ~13 MC, 1 титан-прод = 12",
    "c": "/r/TerraformingMarsGame/comments/1nv4l86/cotd_old_mining_colony_1_oct_2025/",
    "r": "It’s ok. Quantified value is 1 colony (~13mc), 1 titanium production (~12mc), -1 card (-3mc) and a space tag (~1) so ... — benbever"
  },
  "Recession": {
    "s": 58,
    "t": "C",
    "y": [
      "Агрессивные раш-стратегии",
      "Ранние темпо-ходы",
      "Когда противники бедны"
    ],
    "w": "При aggressive rush где вы хотите замедлить оппонентов. Лучше в 3P (2 жертвы) чем в 2P. Не берите если нужен engine —...",
    "e": "10 MC сразу",
    "c": "/r/TerraformingMarsGame/comments/1ofo9m3/cotd_recession_25_oct_2025/",
    "r": "Removing money from all opponents is about as good as gaining money, since it still means you end up ahead by that am... — jaminfine"
  },
  "Main Belt Asteroids": {
    "s": 48,
    "t": "D",
    "y": [
      "Astrodrill",
      "Карты астероидов",
      "Kuiper Cooperative"
    ],
    "w": "Когда есть синергии с астероидами (Astrodrill). Без синергии — ниже среднего.",
    "e": "-5 MC"
  },
  "Floating Trade Hub": {
    "s": 55,
    "t": "C",
    "y": [
      "Dirigibles",
      "Stratospheric Birds",
      "Карты флоатеров",
      "Morning Star Inc"
    ],
    "w": "Когда есть синергии с флоатерами и другие прелюдии покрывают нужды пок 1. В одиночку — слабо.",
    "e": "2 флоатера/действие, конвертация в стандартный ресурс"
  },
  "Orbital Construction Yard": {
    "s": 55,
    "t": "C",
    "y": [
      "Phobolog",
      "Руки с космическими картами",
      "Saturn Systems"
    ],
    "w": "Когда есть несколько космических карт в руке. Пропускай, если рука Building/Earth-ориентированная или высок риск AMC.",
    "e": "1 титан-прод = 12"
  },
  "Board of Directors": {
    "s": 55,
    "t": "C",
    "y": [
      "Point Luna (Earth тег)",
      "Карто-жадные стратегии",
      "Viron (двойное действие)",
      "Applied Science"
    ],
    "w": "Когда вам нужен card draw pipeline и Earth тег. Лучше с Point Luna. Не приоритетная — immediate value слишком мала дл...",
    "e": "4 ресурса директора",
    "c": "/r/TerraformingMarsGame/comments/1o4ntpb/cotd_board_of_directors_12_oct_2025/",
    "r": "If I'm looking to have a fun game with my friends, this is what I pick — SYRsheetZ77"
  },
  "Self-Sufficient Settlement": {
    "s": 53,
    "t": "D",
    "y": [
      "Tharsis Republic",
      "Вэха Mayor",
      "Elysium (Olympus Mons)"
    ],
    "w": "Только для майлстоуна Mayor на Tharsis или лучшего места под город на Elysium. Иначе пропускай.",
    "e": "2 MC-прод = 10-12 MC, тайл города = ~5-10 MC"
  },
  "Anti-desertification Techniques": {
    "s": 52,
    "t": "D",
    "y": [
      "Ecoline",
      "Splice",
      "NRA",
      "Tharsis Republic"
    ],
    "w": "Только когда теги важны для стратегии (Ecologist, Splice) и остальные прелюдии хуже. Обычно пропускай.",
    "e": "1 растения-прод = 8 MC, 1 сталь-прод = 8 MC, 3 MC сразу"
  },
  "Martian Industries": {
    "s": 52,
    "t": "D",
    "y": [
      "Electro Catapult",
      "Колонии (торговля)",
      "Руки с интенсивной сталью"
    ],
    "w": "Когда конкретно нужна энергия-прод для игры на 1-м пок. Иначе есть варианты лучше.",
    "e": "1 энергия-прод = 7"
  },
  "Mohole": {
    "s": 52,
    "t": "D",
    "y": [
      "Helion",
      "Robotic Workforce",
      "Стратегии TR-раша"
    ],
    "w": "Только как Helion (где тепло-прод = MC-прод) или как цель для Robotic Workforce. В остальных случаях избегать.",
    "e": "3 тепло-прод = 12 MC (по 4 MC за тепло-прод), 3 тепла = ~2 MC"
  },
  "Biolab": {
    "s": 50,
    "t": "D",
    "y": [
      "Требования Science тега",
      "Crescent Research",
      "AI Central"
    ],
    "w": "Только когда нужен Science тег, чтобы разблокировать что-то критичное в 1 пок, или остальные прелюдии совсем ужасны.",
    "e": "1 растения-прод = 8 MC, 3 случайные карты = 9-12 MC"
  },
  "Early Settlement": {
    "s": 50,
    "t": "D",
    "y": [
      "Tharsis Republic",
      "Вэха Mayor (Tharsis)",
      "Ecoline (с размещением города)"
    ],
    "w": "Только на Tharsis для вехи Mayor или если можно занять Olympus Mons на Elysium. Иначе пропускай.",
    "e": "1 растения-прод = 8 MC, тайл города = ~5-10 MC (бонус размещения + будущая смежность)"
  },
  "Colony Trade Hub": {
    "s": 48,
    "t": "D",
    "y": [
      "Игры с колониями",
      "Poseidon",
      "Aridor"
    ],
    "w": "Только в играх 4-5 игроков с агрессивным размещением колоний. В 3P почти никогда не достигает средней ценности.",
    "e": "1 энергия-прод = 7"
  },
  "Giant Solar Collector": {
    "s": 48,
    "t": "D",
    "y": [
      "Колонии (торговля)",
      "Morning Star Inc",
      "Thorgate"
    ],
    "w": "Только с Colonies когда нужна энергия для торговли и синергия с Венерой. Иначе пропускать.",
    "e": "2 энергия-прод = 15 MC, 1 шаг Венеры = ~4-5 MC (TR Венеры менее ценен)"
  },
  "Mohole Excavation": {
    "s": 48,
    "t": "D",
    "y": [
      "Helion",
      "Robotic Workforce",
      "Карты с тегом Building"
    ],
    "w": "Почти никогда. Только за Helion или если нужен Building тег и ничего лучше нет.",
    "e": "1 сталь-прод = 8 MC, 2 тепло-прод = 8 MC, 2 тепло = ~1 MC"
  },
  "Preservation Program": {
    "s": 48,
    "t": "D",
    "y": [
      "Стратегии TR-раша",
      "Вэха Terraformer",
      "Terraforming Deal"
    ],
    "w": "При pure TR rush, когда 5 TR ставят вас close к Terraformer milestone. Сочетается с Terraforming Deal (+10 MC from ef...",
    "e": "5 TR = 5 MC-прод + 5 VP = ~35 MC (5 x 7 MC)",
    "c": "/r/TerraformingMarsGame/comments/1nxq53d/cotd_preservation_program_4_oct_2025/",
    "r": "Not a very good Prelude in my opinion. Did play it once though, together with \\[Double Down\\], which worked out quite... — ThainEshKelch"
  },
  "Venus Contract": {
    "s": 46,
    "t": "D",
    "y": [
      "Morning Star Inc.",
      "Карты Venus стратегии",
      "Aphrodite",
      "Stratospheric Birds",
      "Dirigibles"
    ],
    "w": "Только при активной Venus-стратегии и отсутствии лучших альтернатив. Слабый immediate value. Morning Star Inc. + Venu...",
    "e": "1 карта Venus (выбранная) = ~4-5 MC",
    "c": "/r/TerraformingMarsGame/comments/1o8x94m/cotd_venus_contract_17_oct_2025/",
    "r": "You need some kind of a massive combo in hand to pick this. You need 6 more Venus bumps to get to meh. — dfinberg"
  },
  "Nobel Prize": {
    "s": 45,
    "t": "D",
    "y": [
      "Стратегии VP лейт-гейма",
      "Требования Wild тегов"
    ],
    "w": "Почти никогда. Прелюдии с продакшеном строго лучше для 1 пок. Только если остальные варианты ужасны.",
    "e": "5 MC + 2 VP (= ~10 MC в мид) + 2 карты с требованиями (~8 MC от выбора) + Wild тег ~2 MC"
  },
  "Loan": {
    "s": 44,
    "t": "D",
    "y": [
      "Industrial Complex (комбо)",
      "Дорогие карты 1 поколения",
      "Community Services"
    ],
    "w": "Только когда 30 MC позволяют критический ход в 1 пок (напр., Io Mining) и нет лучшей продакшн-прелюдии.",
    "e": "30 MC - 2 MC-прод (= -10 MC ценность в 1 пок)"
  },
  "Io Research Outpost": {
    "s": 43,
    "t": "D",
    "y": [
      "Saturn Systems",
      "Множители Jovian",
      "Rim Settler",
      "Награда Scientist"
    ],
    "w": "Только с Saturn Systems или когда оба тега Jovian+Science критичны для стратегии.",
    "e": "1 титан-прод = 12"
  },
  "Applied Science": {
    "s": 42,
    "t": "D",
    "y": [
      "Physics Complex",
      "Mass Converter",
      "Viron",
      "Board of Directors"
    ],
    "w": "Только с Physics Complex в стартовой руке. Иначе одна из худших прелюдий.",
    "e": "6 ресурсов науки на эту карту",
    "c": "/r/TerraformingMarsGame/comments/1ngndt4/cotd_applied_science_14_sept_2025/",
    "r": "Physics Complex’s best friend! — GriIIedCheeseSammich"
  },
  "Galilean Mining": {
    "s": 42,
    "t": "D",
    "y": [
      "Saturn Systems",
      "Множители Jovian",
      "Вэха Rim Settler"
    ],
    "w": "Только с Saturn Systems или когда нужен Jovian тег для Rim Settler. Иначе одна из слабейших прелюдий.",
    "e": "2 титан-прод = 25 MC теоретически"
  },
  "Biofuels": {
    "s": 40,
    "t": "D",
    "y": [
      "Ecoline",
      "Electro Catapult",
      "Splice"
    ],
    "w": "Почти никогда. Только если отчаянно нужна энергия-прод и ничего лучше нет.",
    "e": "1 энергия-прод = 7"
  },
  "Biosphere Support": {
    "s": 38,
    "t": "D",
    "y": [
      "Ecoline",
      "NRA (если +3 Plant тега)",
      "Nitrogen-Rich Asteroid"
    ],
    "w": "Почти никогда. Только Ecoline с NRA в руке, когда отчаянно нужны 3 тега Plant. Дно среди прелюдий.",
    "e": "2 растения-прод = 16 MC, -1 MC-прод = -5 MC"
  },
  "Nitrogen Shipment": {
    "s": 36,
    "t": "D",
    "y": [
      "Ничего конкретного"
    ],
    "w": "Почти никогда. Только когда все остальные варианты совсем ужасны.",
    "e": "1 растения-прод = 8 MC, 1 TR = 7 MC, 5 MC сразу"
  },
  "Society Support": {
    "s": 30,
    "t": "F",
    "y": [
      "Helion (чуть менее плох)",
      "Ничего полезного"
    ],
    "w": "Никогда. Практически нет сценария, где это правильный выбор.",
    "e": "1 растения-прод = 8 MC, 1 энергия-прод = 7"
  },
  "Space Port Colony": {
    "s": 93,
    "t": "S",
    "y": [
      "Poseidon",
      "Колонии Luna/Ceres/Pluto",
      "Карты торговых синергий",
      "Credicor (-4 MC)"
    ],
    "w": "Всегда драфти, всегда играй. Одна из 3 лучших карт в игре с колониями.",
    "e": "30 MC всего (27+3) за колонию + двойную колонию + торговый флот + VP/2 колонии (~3-5 VP в 3P)"
  },
  "Research Colony": {
    "s": 92,
    "t": "S",
    "y": [
      "Poseidon",
      "Колонии Luna/Ceres/Pluto",
      "Научный движок",
      "Синергии колониальной торговли"
    ],
    "w": "Всегда драфти, всегда покупай. Играй как можно раньше, чтобы максимизировать ценность двойной колонии. Одна из лучших карт во всей игре.",
    "e": "23 MC всего (20+3) за колонию + 2 карты (~8 MC) + теги Science+Space (~5 MC)"
  },
  "Sky Docks": {
    "s": 91,
    "t": "S",
    "y": [
      "Point Luna",
      "Teractor",
      "Синергии колоний (Cryo Sleep, Rim Freighters)",
      "Движок Earth тега"
    ],
    "w": "Всегда драфтить. Играть ASAP при 2 Earth тегах. Топ-5 карта в играх с колониями.",
    "e": "21 MC всего (18+3) за доп. торговый флот (~10+ MC/пок) + скидка -1 MC/карта (~2-3 MC/пок) + 2 VP..."
  },
  "Nitrogen-Rich Asteroid": {
    "s": 90,
    "t": "S",
    "y": [
      "Ecoline",
      "Arctic Algae",
      "Adapted Lichen",
      "Moss",
      "Research Network"
    ],
    "w": "Всегда драфтить. С 2+ тегами растений начинай планировать достижение порога в 3 тега. Без тегов растений всё ещё неплохо для TR...",
    "e": "Стоимость 31+3=34 MC (оплата титаном)"
  },
  "Research Outpost": {
    "s": 87,
    "t": "A",
    "y": [
      "Любая движковая стратегия",
      "Вэха Builder",
      "Награда Scientist",
      "Вэха Mayor",
      "Корпорации стали"
    ],
    "w": "Всегда драфти, играй в 1 пок если возможно. В лейте размещение становится невозможным. Топ-5 движковая карта.",
    "e": "21 MC всего (18+3) за город (~14 MC) + скидка -1 MC (~2-3 MC/пок за 6-7 пок = 15+ MC) + Scien..."
  },
  "Earth Catapult": {
    "s": 88,
    "t": "A",
    "y": [
      "Credicor",
      "Teractor",
      "Earth Office",
      "Point Luna",
      "Движки вытягивания карт"
    ],
    "w": "Почти всегда в пок 1-4. Даже пок 5 может окупиться при сильном draw карт. Топ-3 приоритет драфта.",
    "e": "23 MC + 3 MC карта = 26 MC стоимость"
  },
  "Mars University": {
    "s": 88,
    "t": "A",
    "y": [
      "Olympus Conference",
      "Point Luna",
      "AI Central",
      "Research",
      "Cutting Edge Technology"
    ],
    "w": "Всегда. Калибр первого пика в большинстве драфтов. Играть как можно раньше для максимальной ценности цикла.",
    "e": "Стоимость 8+3=11 MC (оплата сталью)"
  },
  "Solar Logistics": {
    "s": 88,
    "t": "A",
    "y": [
      "Движок Earth тега",
      "Стратегии космических событий",
      "Earth Office",
      "Teractor",
      "Point Luna"
    ],
    "w": "Всегда драфтить в ранней-мид игре. Draw карт от ВСЕХ космических событий игроков — безумная ценность.",
    "e": "23 MC всего (20+3) - 6 MC (2 титана) = фактически 17 MC за draw карт на ВСЕ космические события + -2 MC..."
  },
  "Kelp Farming": {
    "s": 87,
    "t": "A",
    "y": [
      "Ecology Experts",
      "Arctic Algae",
      "Insects",
      "NRA",
      "Lakefront Resorts"
    ],
    "w": "Всегда оставляй из стартовой руки. Топ приоритет драфта. Стоит пушить океаны, чтобы включить. Одна из топ-5 карт растений.",
    "e": "17 MC + 3 MC карта = 20 MC за 2 MC-прод (~10 MC) + 3 растения-прод (~24 MC) + 2 растения (~2 MC) + 1 V..."
  },
  "Insects": {
    "s": 80,
    "t": "A",
    "y": [
      "NRA",
      "Ecological Zone",
      "Viral Enhancers",
      "Heather",
      "Lichen"
    ],
    "w": "Всегда высокий приоритет драфта. Оставляй из стартовой руки при ЛЮБЫХ тегах Plant. Даже хейт-драфт, чтобы не дать игрокам на растениях. Топ-10...",
    "e": "9 MC + 3 MC карта = 12 MC"
  },
  "Spin-off Department": {
    "s": 92,
    "t": "S",
    "y": [
      "Credicor (+4 MC за карту 20+ + карта)",
      "Point Luna",
      "Большие Space/Building карты",
      "Earth Catapult"
    ],
    "w": "Всегда драфтить рано. Играть на 1-2 пок для максимальной ценности draw. Никогда не пропускать в драфте.",
    "e": "13 MC всего (10+3) за 2 MC-прод (~10 MC) + draw карт за каждую сыгранную карту за 20+ MC"
  },
  "Olympus Conference": {
    "s": 85,
    "t": "A",
    "y": [
      "Mars University",
      "Point Luna",
      "AI Central",
      "Research",
      "Cutting Edge Technology"
    ],
    "w": "Всегда. Высокий приоритет первого выбора. Играть рано для максимизации draw карт. Тройной тег непревзойдён.",
    "e": "Стоимость 10+3=13 MC (оплата сталью)"
  },
  "Giant Ice Asteroid": {
    "s": 84,
    "t": "A",
    "y": [
      "Phobolog",
      "Advanced Alloys",
      "Arctic Algae",
      "Media Group",
      "Вэха Legend"
    ],
    "w": "Почти всегда когда видишь. Особенно мощно, когда доступны бонусы размещения океанов и температуры.",
    "e": "36 MC (оплата титаном) + 3 MC карта = 39 MC стоимость"
  },
  "L1 Trade Terminal": {
    "s": 84,
    "t": "A",
    "y": [
      "Карты торгового флота",
      "Cryo-Sleep",
      "Rim Freighters",
      "Poseidon",
      "Колония Luna"
    ],
    "w": "Всегда оставляй в стартовой руке. Топ приоритет драфта в играх с Колониями. Чем раньше сыграешь, тем больше ценности.",
    "e": "25 MC + 3 MC карта = 28 MC"
  },
  "Protected Habitats": {
    "s": 84,
    "t": "A",
    "y": [
      "Ecoline",
      "Карты растительной прод",
      "Карты животных (Birds, Fish)",
      "Стратегия NRA"
    ],
    "w": "Почти всегда драфтить — отнять у оппонентов, даже если тебе не нужна. Играть, когда есть растения/животные, которые стоит защитить...",
    "e": "8 MC всего (5+3) за защиту всех растений, животных, микробов"
  },
  "Cutting Edge Technology": {
    "s": 84,
    "t": "A",
    "y": [
      "Adaptation Technology",
      "Special Design",
      "Mars University",
      "Olympus Conference",
      "Research"
    ],
    "w": "Всегда брать в 1-3 пок если предложена. Приоритет контр-драфта. Даже в 4-5 пок с 3+ картами с требованиями на руке стоит того...",
    "e": "12+3=15 MC за -2 MC на карту с требованием + 1 VP (5 MC) + тег Science (3-5 MC)",
    "c": "/r/TerraformingMarsGame/comments/1p2utp1/cotd_cutting_edge_technology_21_nov_2025/",
    "r": "Very strong card. There are so many cards with requirements. — icehawk84"
  },
  "Ecological Zone": {
    "s": 83,
    "t": "A",
    "y": [
      "Viral Enhancers",
      "Decomposers",
      "Advanced Ecosystems",
      "Imported Nitrogen",
      "Large Convoy"
    ],
    "w": "Высокий приоритет когда есть или планируется озеленение. Ключевая карта для стратегий на био-теги. Хейт-драфт у игроков на растения.",
    "e": "12 MC + 3 MC карта = 15 MC стоимость"
  },
  "AI Central": {
    "s": 82,
    "t": "A",
    "y": [
      "Mars University",
      "Olympus Conference",
      "Mass Converter",
      "Earth Catapult",
      "Anti-Gravity Technology"
    ],
    "w": "Когда уже есть 2+ тега Science и производство энергии, и ожидается длинная игра. Контр-драфт, чтобы не дать движковым игрокам...",
    "e": "21+3=24 MC + ~7 MC энергия-прод = 31 MC фактически"
  },
  "Deimos Down": {
    "s": 82,
    "t": "A",
    "y": [
      "Phobolog",
      "Advanced Alloys",
      "Media Group",
      "Astra Mechanica",
      "Вэха Legend"
    ],
    "w": "Почти всегда, когда видишь. Лучше всего рано ради бонусов тепло-прод, но хорош в любой момент для эффективного раша температуры...",
    "e": "31 MC (оплата титаном) + 3 MC карта = 34 MC стоимость"
  },
  "Earth Office": {
    "s": 82,
    "t": "A",
    "y": [
      "Point Luna",
      "Teractor",
      "Earth Catapult",
      "Space Hotels",
      "Cartel"
    ],
    "w": "Почти всегда брать рано. Даже как спекуляция на будущие теги Earth, стоимость ничтожно мала.",
    "e": "1 MC + 3 MC карта = 4 MC стоимость"
  },
  "Large Convoy": {
    "s": 82,
    "t": "A",
    "y": [
      "Birds",
      "Fish",
      "Livestock",
      "Optimal Aerobraking",
      "Earth Office"
    ],
    "w": "Оставляй из стартовой руки, если ожидаешь 1VP животное. Высокий приоритет драфта. Отличный сброс титана в последний пок.",
    "e": "36 MC + 3 MC карта = 39 MC"
  },
  "Psychrophiles": {
    "s": 82,
    "t": "A",
    "y": [
      "Любые карты с Plant тегом",
      "GHG Producing Bacteria",
      "Decomposers",
      "Микробные колонии",
      "Вэха Ecologist"
    ],
    "w": "Всегда драфти при темп <= -20C. Играй сразу. Быстро теряет ценность с ростом температуры.",
    "e": "5 MC всего (2+3) фактически ~2 MC/пок скидка на карты растений + тег Microbe + стоп-действие"
  },
  "Viral Enhancers": {
    "s": 82,
    "t": "A",
    "y": [
      "Decomposers",
      "Ecological Zone",
      "Advanced Ecosystems",
      "Topsoil Contract",
      "Любая 1-VP карта животных"
    ],
    "w": "Почти всегда. Приоритет драфта. Тег Science сам по себе оправдывает раннюю игру. Эффект прекрасно масштабируется с био-движком.",
    "e": "9+3=12 MC за эффект: +1 растение или +1 ресурс за каждый сыгранный био-тег"
  },
  "Anti-Gravity Technology": {
    "s": 80,
    "t": "A",
    "y": [
      "Earth Catapult",
      "Mars University",
      "Mass Converter",
      "Quantum Extractor",
      "AI Central"
    ],
    "w": "Всегда оставлять если видишь. Даже если не можешь сыграть, контр-драфт чтобы не дать science-игроку.",
    "e": "14+3=17 MC за 3 VP (15 MC) + тег Science (3-5 MC) + скидка -2 MC на все карты (мощно в движке)"
  },
  "Conscription": {
    "s": 80,
    "t": "A",
    "y": [
      "Point Luna",
      "Earth Office",
      "Teractor",
      "Media Group",
      "IC"
    ],
    "w": "Когда есть 2 Earth тега и карта на 16+ MC для розыгрыша. Почти всегда стоит в 1-6 пок.",
    "e": "5+3=8 MC стоимость"
  },
  "Deimos Down:promo": {
    "s": 80,
    "t": "A",
    "y": [
      "Phobolog",
      "Advanced Alloys",
      "Media Group",
      "Mining Guild",
      "Вэха Legend"
    ],
    "w": "То же, что оригинальный Deimos Down — почти всегда драфти при появлении.",
    "e": "31 MC (оплата титаном) + 3 MC карта = 34 MC стоимость"
  },
  "Imported Nitrogen": {
    "s": 80,
    "t": "A",
    "y": [
      "Birds",
      "Fish",
      "Livestock",
      "Ecological Zone",
      "Optimal Aerobraking"
    ],
    "w": "Высокий приоритет драфта. Держать из стартовой руки, если ожидаешь цели для животных/микробов. Лучше всего с 1VP картой животных.",
    "e": "23 MC + 3 MC карта = 26 MC"
  },
  "Nuclear Zone": {
    "s": 80,
    "t": "A",
    "y": [
      "Helion",
      "Earth Office",
      "Teractor",
      "Point Luna",
      "Вэха Terraformer"
    ],
    "w": "Почти всегда драфтить. Отлично для терраформеров, хороший тайл-телепорт для любого. Даже движковые игроки могут использовать для отказа...",
    "e": "Стоимость 10+3=13 MC"
  },
  "Optimal Aerobraking": {
    "s": 80,
    "t": "A",
    "y": [
      "Giant Ice Asteroid",
      "Asteroid Mining",
      "Deimos Down",
      "Interplanetary Cinematics",
      "Media Group"
    ],
    "w": "Ранняя игра с космическими событиями в руке или запланированными. Даже в мид хорош, если ожидаешь 2+ космических события.",
    "e": "Стоимость 7+3=10 MC"
  },
  "Research": {
    "s": 80,
    "t": "A",
    "y": [
      "Mars University",
      "Olympus Conference",
      "Пэйоффы научного движка",
      "Награда Scientist",
      "Valley Trust"
    ],
    "w": "Почти всегда драфти. Играй в миде, когда теги Science дают профит. Оставляй рано для научного движка.",
    "e": "14 MC всего (11+3) за 2 тега Science (~8 MC) + 2 карты (~8 MC) + 1 VP (~5 MC)"
  },
  "Space Port": {
    "s": 80,
    "t": "A",
    "y": [
      "Колониальные стратегии",
      "Корпорации стали",
      "Карты торговых синергий",
      "Вэха Mayor"
    ],
    "w": "Всегда драфтить при колониях в игре. Играть, когда есть колония и можешь потянуть стоимость энергии.",
    "e": "25 MC всего (22+3) + 1 энергия-прод за город (~14 MC) + 4 MC-прод (~20 MC) + торговый флот (~10+ MC/..."
  },
  "Terraforming Ganymede": {
    "s": 80,
    "t": "A",
    "y": [
      "Saturn Systems",
      "Io Mining Industries",
      "Ganymede Colony",
      "Jupiter Floating Station",
      "Wild теги"
    ],
    "w": "Драфтить когда 3+ тега Jovian в планах, или чтобы не дать оппонентам. Играть в последнее пок для максимума тегов. Оплата титаном дела...",
    "e": "33+3=36 MC (оплата титаном) за N TR + 2 VP где N = теги Jovian включая этот"
  },
  "Imported Hydrogen": {
    "s": 80,
    "t": "A",
    "y": [
      "Birds",
      "Fish",
      "Predators",
      "Decomposers",
      "Ecological Zone"
    ],
    "w": "Когда есть цели для размещения животных или микробов. Даже без целей, океан + растения + двойной тег делают её ...",
    "e": "16+3=19 MC за 1 океан (12 MC + 1 TR = 7 MC = 19 MC) + гибкие ресурсы (3 растения = 2",
    "c": "/r/TerraformingMarsGame/comments/1osg0h5/cotd_imported_hydrogen_9_nov_2025/",
    "r": "Very nice card. Discountable, may lead to a conversion or late titanium dump for 1-point animal. — Great_GW"
  },
  "Arctic Algae": {
    "s": 84,
    "t": "A",
    "y": [
      "Ecoline",
      "Giant Ice Asteroid",
      "Ice Asteroid",
      "Towing a Comet",
      "Карты защиты растений"
    ],
    "w": "В стартовую руку пок 1, если выполнено -12C. Высокий приоритет — чем раньше сыграешь, тем больше океанов поймаешь.",
    "e": "12+3=15 MC за тег Plant (1-2 MC) + 1 растение (2 MC) + эффект: 2 растения за каждый размещённый океан"
  },
  "Advanced Ecosystems": {
    "s": 78,
    "t": "B",
    "y": [
      "Decomposers",
      "Ecological Zone",
      "Viral Enhancers",
      "GMO Contract",
      "Splice"
    ],
    "w": "Когда есть или ожидаются теги Plant+Microbe+Animal. Контр-драфт, даже если не можешь сыграть — отнять у оппонентов...",
    "e": "11+3=14 MC за 3 VP (15 MC)"
  },
  "Dusk Laser Mining": {
    "s": 78,
    "t": "B",
    "y": [
      "Phobolog",
      "Advanced Alloys",
      "Mercurian Alloys",
      "Inventrix",
      "Любой научный движок"
    ],
    "w": "1-3 пок с 2 тегами Science и свободным энергия-прод. Всё ещё хорошо в мид благодаря мгновенному возврату титана.",
    "e": "8 MC (оплата титаном) + 3 MC карта + ~7 MC энергия-прод = ~18 MC стоимость"
  },
  "Indentured Workers": {
    "s": 82,
    "t": "A",
    "y": [
      "Earth Catapult",
      "IC",
      "Media Group",
      "Anti-Gravity Tech"
    ],
    "w": "Почти всегда оставляй в стартовой руке. Высокий приоритет драфта для дорогих ранних розыгрышей. Ещё лучше как бесплатный draw.",
    "e": "0 MC (или 3 MC в драфте) + штраф 1 VP"
  },
  "Mangrove": {
    "s": 78,
    "t": "B",
    "y": [
      "Ecoline",
      "Arctic Algae",
      "Nitrogen-Rich Asteroid",
      "Insects",
      "NRA"
    ],
    "w": "Почти всегда драфти при предложении. Лучше в мид-лейте, но стоит спекулировать рано. Даже без подъёма O2, 1 VP ...",
    "e": "Стоимость 12+3=15 MC"
  },
  "Space Hotels": {
    "s": 78,
    "t": "B",
    "y": [
      "Point Luna",
      "Teractor",
      "Cartel",
      "Движок Earth тега",
      "Вэхи Banker/Specialist"
    ],
    "w": "1-е пок с 2 Earth тегами (или 1 + корп/прелюдия). Быстро теряет ценность после 2-го пок.",
    "e": "15 MC всего (12+3) за 4 MC-прод (~20-24 MC) + теги Space+Earth (~4 MC)"
  },
  "Trading Colony": {
    "s": 78,
    "t": "B",
    "y": [
      "Любая сильная колония",
      "Space Port Colony",
      "Rim Freighters",
      "Прод энергии",
      "Титан"
    ],
    "w": "Почти всегда в играх с Colonies. Лучше всего рано когда ещё не размещена колония. Оплата титаном делает доступной.",
    "e": "18+3=21 MC (оплата титаном) за размещение колонии + эффект: +1 шаг трека колонии за торговлю"
  },
  "Mining Colony": {
    "s": 78,
    "t": "B",
    "y": [
      "Phobolog",
      "Saturn Systems",
      "Aridor",
      "Poseidon",
      "Advanced Alloys"
    ],
    "w": "1-3 пок с хорошими доступными колониями и синергиями титан-прод. Лучше всего когда открыта колония Titan или Ganymede. Пропускай если...",
    "e": "20+3=23 MC за размещение колонии (~8-12 MC ценности в зависимости от колонии) + 1 титан-прод (12",
    "c": "/r/TerraformingMarsGame/comments/1pdwh7d/cotd_mining_colony_4_dec_2025/",
    "r": "Very solid card, especially if it's early enough and you have colonies where you really want to build anyway. — Insanitarius-"
  },
  "Venus Orbital Survey": {
    "s": 78,
    "t": "B",
    "y": [
      "Aphrodite",
      "Stratopolis",
      "Venusian Animals",
      "Dirigibles",
      "Morning Star Inc"
    ],
    "w": "При стратегии Venus или Aphrodite/Morning Star. Пок 1-3 для максимальной ценности. Оплата титаном делает доступной для ...",
    "e": "18+3=21 MC за действие: открыть 2 карты, бесплатные карты Venus",
    "c": "/r/TerraformingMarsGame/comments/1od4a5o/cotd_venus_orbital_survey_22_oct_2025/",
    "r": "Fantastic card. Yes, the effect is weaker than AI Central since you usually have to pay for the cards, and the cards ... — Insanitarius-"
  },
  "Mars Nomads": {
    "s": 77,
    "t": "B",
    "y": [
      "Sagitta",
      "Community Services",
      "Viron",
      "Project Inspection",
      "Land Claim"
    ],
    "w": "Только ранняя игра. При draw на 3+ пок ценность падает значительно. Лучше всего на картах с богатыми бонусами размещения (Elysium).",
    "e": "Стоимость 13+3=16 MC"
  },
  "Trade Envoys": {
    "s": 62,
    "t": "C",
    "y": [
      "Space Port Colony",
      "Rim Freighters",
      "Cryo Sleep",
      "Колония Miranda",
      "Колония Luna"
    ],
    "w": "Когда можешь торговать регулярно. Очень высокий приоритет с 2 торговыми флотами. Даже с 1 флотом отличная ценность.",
    "e": "6+3=9 MC за эффект: +1 шаг трека колонии за торговлю"
  },
  "Electro Catapult": {
    "s": 77,
    "t": "B",
    "y": [
      "Mining Guild",
      "Interplanetary Cinematics",
      "Карты прод стали",
      "Manutech",
      "Thorgate"
    ],
    "w": "1-3 пок когда O2 ниже 8% и есть производство энергии. Лучше всего с движком сталь/растения-прод. Building тег дел...",
    "e": "17+3=20 MC + потеря энергия-прод (~7 MC) = 27 MC фактически",
    "c": "/r/TerraformingMarsGame/comments/1pjtv5l/cotd_electro_catapult_11_dec_2025/",
    "r": "Basically 5 mc prod and a point for 22 mc (17 + 3 to buy + 7 for the power - 5 because you use it the same gen). — Legitimate-Date-5927"
  },
  "Astra Mechanica": {
    "s": 76,
    "t": "B",
    "y": [
      "Giant Ice Asteroid",
      "Deimos Down",
      "Nitrogen Rich Asteroid",
      "Large Convoy",
      "Conscription"
    ],
    "w": "После розыгрыша 2+ сильных событий. Оставляй, если есть дорогие космические события или мощные события в сбросе.",
    "e": "7+3=10 MC за тег Science (3-5 MC) + вернуть 2 события в руку",
    "c": "/r/TerraformingMarsGame/comments/1n6fmsi/cotd_astra_mechanica_2_sept_2025/",
    "r": "There are obviously better cards to use it on, depending on circumstances, but it is very funny to use it to pull Law... — ElderAlter"
  },
  "Cultural Metropolis": {
    "s": 76,
    "t": "B",
    "y": [
      "Tharsis Republic",
      "Cheung Shing Mars",
      "Credicor",
      "Immigrant City",
      "Rover Construction"
    ],
    "w": "Ранняя-мид игра со сталью и свободной энергия-прод. Отлично для вехи Mayor и наград на основе городов.",
    "e": "20 MC (оплата сталью) + 3 MC карта + ~7 MC энергия-прод = ~30 MC стоимость"
  },
  "Ice Moon Colony": {
    "s": 76,
    "t": "B",
    "y": [
      "Poseidon",
      "Arctic Algae",
      "Lakefront Resorts",
      "Phobolog",
      "Колония Miranda"
    ],
    "w": "Ранняя-мид игра когда хорошие места колоний и бонусы размещения океана доступны. Отличный слив титана.",
    "e": "23 MC + 3 MC карта = 26 MC за 1 океан (SP 18 MC) + 1 колонию (SP 17 MC) = 35 MC совокупная ценность"
  },
  "Media Group": {
    "s": 76,
    "t": "B",
    "y": [
      "Interplanetary Cinematics",
      "Optimal Aerobraking",
      "Point Luna",
      "Teractor",
      "Nuclear Zone"
    ],
    "w": "Ранняя игра с событиями в руке. Даже в мид хорош, если ожидаешь 3+ события. Высокий приоритет драфта.",
    "e": "Стоимость 6+3=9 MC"
  },
  "Red Spot Observatory": {
    "s": 76,
    "t": "B",
    "y": [
      "Множители Jovian",
      "Колония Titan (флоатеры)",
      "Научный движок",
      "Celestic/Stormcraft",
      "Вэха Rim Settler"
    ],
    "w": "При построении научного движка с 3+ тегами и синергиями Jovian. Лучше с поддержкой флоатеров.",
    "e": "20 MC всего (17+3) за 2 VP + 2 карты (~8 MC) + теги Jovian+Science (~8 MC) + действие draw карт"
  },
  "Sub-Crust Measurements": {
    "s": 76,
    "t": "B",
    "y": [
      "Point Luna",
      "AI Central",
      "Mars University",
      "Olympus Conference",
      "Прод стали"
    ],
    "w": "Когда есть 2+ тега Science и планируешь движковую игру. Сталь для сброса удешевляет. Приоритет на ранний-мид.",
    "e": "20+3=23 MC (оплата сталью) за Действие: draw 1 карта + 2 VP + теги Science+Building+Earth"
  },
  "Birds": {
    "s": 76,
    "t": "B",
    "y": [
      "Imported Hydrogen",
      "Extreme-Cold Fungus",
      "Ecological Zone",
      "Predators",
      "Viral Enhancers"
    ],
    "w": "Когда O2 приближается к 13% и ожидается 3+ пок впереди. Гораздо лучше с поддержкой размещения животных. Контр-драфт чтобы не дать...",
    "e": "10+3=13 MC за VP-движок (1 VP за животное в пок)",
    "c": "/r/TerraformingMarsGame/comments/1o2wu0m/cotd_birds_10_oct_2025/",
    "r": "Birds are so ridiculously strong in many situations that it's a card I tend to speculate on in my opening hand almost... — icehawk84"
  },
  "Ganymede Colony": {
    "s": 77,
    "t": "B",
    "y": [
      "Io Mining Industries",
      "Карты с тегом Jovian",
      "Phobolog",
      "Vesta Shipyard",
      "Вэха Rim Settler"
    ],
    "w": "Лейт с 3+ Jovian тегами. Чем больше Jovian тегов, тем выше приоритет.",
    "e": "20 MC (оплата титаном) + 3 MC карта = 23 MC стоимость"
  },
  "Ice Asteroid": {
    "s": 75,
    "t": "B",
    "y": [
      "Arctic Algae",
      "Optimal Aerobraking",
      "Kelp Farming",
      "Lakefront Resorts",
      "Phobolog"
    ],
    "w": "Ранняя-средняя игра, когда места для океанов ещё хорошие. Отличный слив титана. Круто с Arctic Algae или синергиями океанов.",
    "e": "23 MC + 3 MC карта = 26 MC за 2 океана (2 TR = ~14-15 MC + ~6-8 MC бонусы размещения = ~20-23 MC ..."
  },
  "Mass Converter": {
    "s": 80,
    "t": "A",
    "y": [
      "Research",
      "Mars University",
      "Olympus Conference",
      "Physics Complex",
      "Колонии (торговля)"
    ],
    "w": "Когда уже есть 3+ тега Science и планируешь играть ещё. Держать в руке на спекуляцию, если draw ранний с путём наук...",
    "e": "Стоимость 8+3=11 MC"
  },
  "Mohole Area": {
    "s": 75,
    "t": "B",
    "y": [
      "Robotic Workforce",
      "Credicor",
      "Mining Guild",
      "Manutech",
      "Helion"
    ],
    "w": "1-2 пок как якорь терраформирования. Оплата сталью делает очень эффективным. В лейте слишком медленно.",
    "e": "Стоимость 20+3=23 MC (оплата сталью)"
  },
  "Quantum Communications": {
    "s": 75,
    "t": "B",
    "y": [
      "Карты научного движка",
      "Игры с колониями",
      "Колонии Luna/Ceres/Pluto",
      "Награда Banker"
    ],
    "w": "Когда есть 3+ science тега и хорошие колонии в игре. Драфти рано если идёшь в science, играй когда 4 тега набрано.",
    "e": "11 MC всего (8+3) за X MC-прод (1 за колонию в игре) + 1 VP"
  },
  "Trees": {
    "s": 75,
    "t": "B",
    "y": [
      "NRA",
      "Insects",
      "Ecology Experts",
      "Ecoline",
      "Herbivores"
    ],
    "w": "Когда -4C достижимо скоро. Даже держать до выполнения требования — нормально. Одна из лучших карт на производство растений.",
    "e": "13+3=16 MC за 3 растения-прод (24 MC) + 1 растение (2 MC) + 1 VP (5 MC) + тег Plant (~1-2 MC)"
  },
  "Red Ships": {
    "s": 75,
    "t": "B",
    "y": [
      "Низкий opportunity cost",
      "Stall value (лишний action в раунде)",
      "Любой движок — не мешает основной стратегии"
    ],
    "w": "Почти всегда плюсово. Берём если есть слот — 5 MC total, action окупается за 1-2 использования. Слабеет только когда все параметры закрыты.",
    "e": "2+3=5 MC всего",
    "c": "/r/TerraformingMarsGame/comments/1ovxds6/cotd_red_ships_13_nov_2025/",
    "r": "With its cost so low 2+3 this starts as a mid card that could pay for itself in two or three generations. — Fredrick_18241"
  },
  "Atalanta Planitia Lab": {
    "s": 74,
    "t": "B",
    "y": [
      "Научный движок",
      "Награда Venuphile",
      "Вэха Diversifier",
      "Награда Scientists",
      "Venus Waystation"
    ],
    "w": "Когда есть 2+ тега Science и ожидается достичь 3. Высокий приоритет для движковых игроков. Хорошо в любое время мид-лейт.",
    "e": "10+3=13 MC за 2 VP (10 MC) + 2 карты (6-8 MC) + тег Venus (2-3 MC) + тег Science (3-5 MC)",
    "c": "/r/TerraformingMarsGame/comments/1n7aqq5/cotd_atalanta_planitia_lab_3_sept_2025/",
    "r": "Perfectly fine card to keep building towards bigger and better things. — Futuralis"
  },
  "Big Asteroid": {
    "s": 74,
    "t": "B",
    "y": [
      "Deimos Down",
      "Optimal Aerobraking",
      "Media Group",
      "Phobolog",
      "Solar Logistics"
    ],
    "w": "В большинстве игр при раше температуры. Выше приоритет со скидкой на титан/возвратом событий. Хорош для перехвата бонуса океана на ...",
    "e": "27+3=30 MC за 2 температурных TR (14 MC) + 4 титан (12 MC) + убрать 4 растения"
  },
  "Field-Capped City": {
    "s": 74,
    "t": "B",
    "y": [
      "Mining Guild",
      "Tharsis Republic",
      "Торговля колониями",
      "Вэха Mayor",
      "Вэха Builder"
    ],
    "w": "Ранняя-средняя игра со сталью. Один из немногих городов, который не бьёт по экономике энергии.",
    "e": "29 MC (оплата сталью) + 3 MC карта = 32 MC стоимость"
  },
  "Fish": {
    "s": 78,
    "t": "B",
    "y": [
      "Viral Enhancers",
      "Large Convoy",
      "Imported Nitrogen",
      "Ecological Zone",
      "Колония Miranda"
    ],
    "w": "Когда температура близка к +2°C и есть или ожидаются карты размещения животных. Приоритет аналогичен Birds.",
    "e": "9 MC + 3 MC карта = 12 MC стоимость",
    "c": "/r/TerraformingMarsGame/comments/1nrreeg/cotd_fish_27_sept_2025/",
    "r": "Amazing when someone is pushing heat hard in your game, less so if it's the last parameter to go (in which case it mi... — Agreeable_Hat"
  },
  "GMO Contract": {
    "s": 74,
    "t": "B",
    "y": [
      "Ecoline",
      "Ecological Zone",
      "Viral Enhancers",
      "Decomposers",
      "Стратегии био-тегов"
    ],
    "w": "1-3 пок с запланированной стратегией био-тегов и доступными Greens. Отличный возврат даже с 3-4 будущими био-тегами.",
    "e": "3 MC + 3 MC карта = 6 MC стоимость"
  },
  "Homeostasis Bureau": {
    "s": 74,
    "t": "B",
    "y": [
      "Helion",
      "Deimos Down",
      "GIA",
      "Standard Tech",
      "Credicor"
    ],
    "w": "Ранняя игра при планировании терраформинга через тепло. Отличный розыгрыш 1-3 пок. Теряет ценность если температура уже близка к максимуму.",
    "e": "16 MC + 3 MC карта = 19 MC"
  },
  "Lunar Exports": {
    "s": 74,
    "t": "B",
    "y": [
      "Point Luna",
      "Teractor",
      "Phobolog",
      "Earth Office",
      "Acquired Space Agency"
    ],
    "w": "Пок 1-3 для режима MC-прод. Оплата титаном делает отличной с прелюдным титаном. Почти всегда бери MC вместо растений.",
    "e": "19 MC + 3 MC карта = 22 MC за 5 MC-прод (~25 MC) или 2 растения-прод (~16 MC)"
  },
  "Meat Industry": {
    "s": 78,
    "t": "B",
    "y": [
      "Ecological Zone",
      "Martian Zoo",
      "Birds",
      "Fish",
      "Колония Miranda"
    ],
    "w": "Когда есть 1+ карта животных с VP или Ecological Zone. С колонией Miranda становится очень сильной. Не драфтить...",
    "e": "Стоимость 5+3=8 MC (оплата сталью)"
  },
  "Mining Area": {
    "s": 74,
    "t": "B",
    "y": [
      "Mining Guild",
      "Phobolog",
      "Manutech",
      "Philares",
      "Mining Rights"
    ],
    "w": "Когда есть тайл рядом с минеральным местом. Приоритет титану над сталью. Держать в стартовой руке.",
    "e": "Стоимость 4+3=7 MC (оплата сталью)"
  },
  "Robotic Workforce": {
    "s": 74,
    "t": "B",
    "y": [
      "Mohole Area",
      "Fusion Power",
      "Field Capped City",
      "Cheung Shing Mars",
      "Utopia Invest"
    ],
    "w": "Драфти когда есть хорошие building карты с блоками производства. Играй после того как целевая карта сыграна.",
    "e": "12 MC всего (9+3) за дублирование блока производства building карты"
  },
  "Sulphur-Eating Bacteria": {
    "s": 74,
    "t": "B",
    "y": [
      "Колония Enceladus",
      "Extreme-Cold Fungus",
      "Topsoil Contract",
      "Symbiotic Fungus",
      "Psychrophiles"
    ],
    "w": "Почти всегда при выполненном или близком Venus 6%. Особенно сильно с колонией Enceladus. Драфти рано, играй при выполнении требования...",
    "e": "6+3=9 MC за ~3 MC эквивалент прод за пок (действие: добавить микроба или обналичить по 3 MC каждый)"
  },
  "Topsoil Contract": {
    "s": 74,
    "t": "B",
    "y": [
      "Колония Enceladus",
      "Decomposers",
      "Psychrophiles",
      "Sulphur-Eating Bacteria",
      "Viral Enhancers"
    ],
    "w": "Почти всегда, когда есть или планируется генерация микробов. Даже без неё 3 растения + тег Earth — неплохо.",
    "e": "8+3=11 MC за 3 растения (6 MC) + эффект: получить 1 MC за каждого добавленного микроба где угодно + теги Microbe+Earth..."
  },
  "Open City": {
    "s": 74,
    "t": "B",
    "y": [
      "Mining Guild",
      "Rover Construction",
      "Вэха Mayor",
      "Награда Landlord",
      "Manutech"
    ],
    "w": "4-6 пок когда O2 приближается к 12% и есть энергия-прод и сталь. Лучший город в базовой игре для чистой экономики. Слив стали...",
    "e": "23+3=26 MC - энергия-прод (~7 MC) = 33 MC фактически",
    "c": "/r/TerraformingMarsGame/comments/1pd0e28/cotd_open_city_3_dec_2025/",
    "r": "One of the best value for money city cards from base game. But harder to play because of the requirement. — benbever"
  },
  "Sponsoring Nation": {
    "s": 74,
    "t": "B",
    "y": [
      "Point Luna",
      "Teractor",
      "Earth Office",
      "Luna Metropolis",
      "Luna Governor"
    ],
    "w": "Мид (3-5 пок) когда есть 3+ Earth тега и Turmoil активен. Топ приоритет для движка Earth. Пропускай без...",
    "e": "21+3=24 MC за 3 TR (21-22",
    "c": "/r/TerraformingMarsGame/comments/1o21xfo/cotd_sponsoring_nation_9_oct_2025/",
    "r": "This is a green project card, not a red event card. 21 + 3mc card cost = 24mc for 3TR is already decent, and Sponsori... — benbever"
  },
  "Algae": {
    "s": 73,
    "t": "B",
    "y": [
      "Nitrogen Rich Asteroid",
      "Insects",
      "Ecoline",
      "Arctic Algae",
      "Robot Pollinators"
    ],
    "w": "Когда 5 океанов будет к пок 2-4 и нужны озеленения. Спекулируй рано, если разыграны прелюдии с океанами.",
    "e": "10+3=13 MC за 2 растения-прод (16 MC пок 1) + 1 растение (2 MC) + тег Plant (1-2 MC)"
  },
  "Energy Market": {
    "s": 73,
    "t": "B",
    "y": [
      "Mass Converter",
      "Quantum Extractor",
      "Fusion Power",
      "Торговля колониями",
      "Steelworks"
    ],
    "w": "Почти всегда стоит подобрать за 6 MC общей стоимости. Особенно хорош с колониями или энергоёмкими движками.",
    "e": "3 MC + 3 MC карта = 6 MC стоимость"
  },
  "Frontier Town": {
    "s": 73,
    "t": "B",
    "y": [
      "Tharsis Republic",
      "Mining Guild",
      "Конкретные споты на карте",
      "Партия Mars First",
      "Вэха Mayor"
    ],
    "w": "1-3 пок с сильным доступным бонусом размещения. Проверь карту перед драфтом.",
    "e": "11 MC (оплата сталью) + 3 MC карта + ~7 MC энергия-прод = ~21 MC стоимость"
  },
  "Interplanetary Colony Ship": {
    "s": 73,
    "t": "B",
    "y": [
      "Optimal Aerobraking",
      "Earth Office",
      "Media Group",
      "IC",
      "Poseidon"
    ],
    "w": "Ранняя-мид игра когда слоты колоний ещё ценные. Отлично со скидками на события/space. Стандартный сброс титана.",
    "e": "12 MC + 3 MC карта = 15 MC за 1 колонию (SP 17 MC)",
    "c": "/r/TerraformingMarsGame/comments/1oam3d4/cotd_interplanetary_colony_ship_19_oct_2025/",
    "r": "After Interstellar Colony Ship, a mere interplanetary one sounds kind of lame. — icehawk84"
  },
  "Interstellar Colony Ship": {
    "s": 64,
    "t": "C",
    "y": [
      "Earth Office",
      "Warp Drive",
      "Mass Converter",
      "Optimal Aerobraking",
      "Phobolog"
    ],
    "w": "При научном движке с 4+ тегами Science. Держи для слива титана в последнем пок со скидками. Не играй по полной...",
    "e": "24 MC + 3 MC карта = 27 MC база"
  },
  "Martian Media Center": {
    "s": 73,
    "t": "B",
    "y": [
      "Mining Guild",
      "Tharsis Republic",
      "Карты партии Mars First",
      "Robotic Workforce",
      "Credicor"
    ],
    "w": "Когда Mars First у власти или у тебя 2 делегата там. Лучше всего в ранней игре для максимальной ценности прод.",
    "e": "Стоимость 7+3=10 MC (оплата сталью)"
  },
  "Stratospheric Birds": {
    "s": 79,
    "t": "B",
    "y": [
      "Freyja Biodomes",
      "Large Convoy",
      "Imported Nitrogen",
      "Maxwell Base",
      "Decomposers"
    ],
    "w": "Когда Венера на/около 12% и есть флоатер для траты. Высокий приоритет если требования выполнены, пропускать если Венера игнорируется...",
    "e": "12+3=15 MC + 1 флоатер стоимость за 1 VP за действие с животным"
  },
  "Terraforming Contract": {
    "s": 73,
    "t": "B",
    "y": [
      "Point Luna",
      "Teractor",
      "Earth Office",
      "Manutech",
      "Награда Banker"
    ],
    "w": "1-3 пок когда TR 25 достижим. С терраформинг-прелюдиями требование почти бесплатно выполнить. Даже 4-5 пок если не слишком поздно.",
    "e": "8+3=11 MC за 4 MC-прод (20-24 MC) + Earth тег (~2-3 MC)"
  },
  "Warp Drive": {
    "s": 73,
    "t": "B",
    "y": [
      "Mass Converter",
      "Large Convoy",
      "Interstellar Colony Ship",
      "Imported Nitrogen",
      "Научный движок"
    ],
    "w": "Когда есть 4+ тега Science. Авто-плей. 2 VP + скидка окупаются сразу с любой космической картой.",
    "e": "14+3=17 MC за эффект: -2 MC на карты с тегом Space + 2 VP (10 MC) + тег Science (~3-5 MC)"
  },
  "Asteroid Rights": {
    "s": 72,
    "t": "B",
    "y": [
      "Astrodrill",
      "Comet Aiming",
      "Directed Impactors",
      "Point Luna",
      "Phobolog"
    ],
    "w": "1-5 пок, когда есть космические карты-цели для титана. Хорошая быстрая экономика даже без синергии астероидов.",
    "e": "10+3=13 MC за тег Earth (2-3 MC) + тег Space (1-2 MC) + 2 астероида (6 MC титан) сразу"
  },
  "Carbon Nanosystems": {
    "s": 72,
    "t": "B",
    "y": [
      "Карты научного движка",
      "Космические карты",
      "Карты городов",
      "Mars University",
      "Olympus Conference"
    ],
    "w": "1-4 пок при строительстве science-движка и ожидании 3+ тегов Science впереди. Оплата сталью — большой плюс.",
    "e": "14+3=17 MC (оплата сталью) за теги Science+Building (4-7 MC) + 1 VP (5 MC) + 1 графен сразу"
  },
  "Caretaker Contract": {
    "s": 72,
    "t": "B",
    "y": [
      "Helion",
      "Карты прод тепла",
      "Вэха Generalist",
      "Столлинг"
    ],
    "w": "Когда есть 8+ тепло-прод за пок и 0C близко. Необходим для стратегий на тепло. Низкая стоимость драфта.",
    "e": "3+3=6 MC за действие: потратить 8 тепла -> 1 TR (7 MC)"
  },
  "Comet": {
    "s": 72,
    "t": "B",
    "y": [
      "Optimal Aerobraking",
      "Arctic Algae",
      "Media Group",
      "Phobolog",
      "Solar Logistics"
    ],
    "w": "В большинстве игр при терраформинге. Выше приоритет со скидками на Space/Event. Хорошо для контроля темпа игры.",
    "e": "21+3=24 MC за 1 темп TR (7 MC) + 1 океан TR (7 MC) + бонус размещения (~2-4 MC) + удаление 3 растений"
  },
  "Decomposers": {
    "s": 72,
    "t": "B",
    "y": [
      "Ecological Zone",
      "Viral Enhancers",
      "Advanced Ecosystems",
      "Колония Enceladus",
      "Imported Nitrogen"
    ],
    "w": "Ранняя-мид игра при планировании стратегии био-тегов. Отлично, если уже есть или ожидается 4+ био-тегов.",
    "e": "5 MC + 3 MC карта = 8 MC стоимость"
  },
  "Ecology Research": {
    "s": 75,
    "t": "B",
    "y": [
      "Viral Enhancers",
      "Decomposers",
      "Ecological Zone",
      "GMO Contract",
      "Вэха Diversifier"
    ],
    "w": "Мид с 1-2 колониями и целями био-тегов для животных и микробов. Отлично для снайпа Diversifier.",
    "e": "21 MC + 3 MC карта = 24 MC стоимость",
    "c": "/r/TerraformingMarsGame/comments/1n914xk/cotd_ecology_research_5_sept_2025/",
    "r": "With bio combos, this can be a huge point bomb of 5 points or more and can also give you enough plants to score some ... — icehawk84"
  },
  "Event Analysts": {
    "s": 72,
    "t": "B",
    "y": [
      "Научный движок",
      "Игры с Turmoil",
      "Mars University",
      "Olympus Conference",
      "Награда Scientist"
    ],
    "w": "1-5 пок в играх с Turmoil. Чем раньше, тем лучше для накопительной ценности от влияния.",
    "e": "5 MC + 3 MC карта = 8 MC стоимость"
  },
  "Harvest": {
    "s": 72,
    "t": "B",
    "y": [
      "Media Group",
      "IC",
      "Ecological Zone",
      "GMO Contract",
      "Decomposers"
    ],
    "w": "Всегда оставляй, если получена бесплатно. Драфти при стратегии растений или нужен счётчик событий. Не приоритетнее ключевых деталей движка.",
    "e": "4 MC + 3 MC стоимость карты = 7 MC"
  },
  "Imported Nutrients": {
    "s": 78,
    "t": "B",
    "y": [
      "Psychrophiles",
      "Ants",
      "Decomposers",
      "Optimal Aerobraking",
      "Earth Office"
    ],
    "w": "Когда есть хорошая цель для микробов или мощная инфраструктура скидок. Отличный сброс титана. Надёжная мид-лейт игра.",
    "e": "14 MC + 3 MC карта = 17 MC за 4 растения (~8 MC) + 4 микроба (1-2 VP = 5-10 MC на хороших целях)"
  },
  "Kaguya Tech": {
    "s": 72,
    "t": "B",
    "y": [
      "Стратегия растений",
      "Вэха Mayor",
      "Награда Landlord",
      "Соседство городов"
    ],
    "w": "Когда есть озеленения в игре и можно создать VP-свинг размещением города. Отличный сюрприз на последнее пок.",
    "e": "10 MC + 3 MC карта = 13 MC за 2 MC-прод (~10 MC) + 1 карту (~3 MC) + конверсия озеленения в город (нетто..."
  },
  "Livestock": {
    "s": 72,
    "t": "B",
    "y": [
      "Large Convoy",
      "Imported Nitrogen",
      "Viral Enhancers",
      "Колония Miranda",
      "Meat Industries"
    ],
    "w": "Мид-лейт когда нужна 1VP цель для животных. Чуть слабее Birds/Fish, но всё равно сильно. Оставляй если есть...",
    "e": "13 MC + 3 MC карта = 16 MC"
  },
  "Lunar Mining": {
    "s": 72,
    "t": "B",
    "y": [
      "Point Luna",
      "Teractor",
      "Earth Office",
      "Advanced Alloys",
      "Стратегия космических карт"
    ],
    "w": "Когда есть 3+ тега Earth (включая этот). Хейт-драфт у игроков на Earth. Отличная деталь для Point Luna/Teractor.",
    "e": "11 MC + 3 MC карта = 14 MC за 1 титан-прод на 2 тега Earth"
  },
  "Mercurian Alloys": {
    "s": 72,
    "t": "B",
    "y": [
      "Phobolog",
      "Advanced Alloys",
      "Io Mining Industries",
      "Asteroid Mining",
      "Acquired Space Agency"
    ],
    "w": "Когда есть 2+ тега Science и прод/ресурсы титана. Дешёвый тег Space для вех тоже.",
    "e": "Стоимость 3+3=6 MC (оплата титаном)"
  },
  "Penguins": {
    "s": 76,
    "t": "B",
    "y": [
      "Inventrix",
      "Large Convoy",
      "Imported Nitrogen",
      "Колония Miranda",
      "Meat Industry"
    ],
    "w": "Мид когда 8 океанов близко. Хорошая цель для слива животных. С Inventrix можно играть гораздо раньше.",
    "e": "Стоимость 7+3=10 MC"
  },
  "Predators": {
    "s": 72,
    "t": "B",
    "y": [
      "Meat Industries",
      "Ecological Zone",
      "Protected Habitats (контр)",
      "Inventrix"
    ],
    "w": "Драфти рано, чтобы подавить игру оппонентов на животных. Играй когда 11% кислорода близко и у оппонентов незащищённые животные.",
    "e": "17 MC всего (14+3) за ~5 VP в среднем при розыгрыше"
  },
  "Research Coordination": {
    "s": 72,
    "t": "B",
    "y": [
      "NRA (доп Plant тег)",
      "Insects",
      "Terraforming Ganymede",
      "Научные требования",
      "Заявки на вэхи"
    ],
    "w": "В ранней игре, когда Wild тег может открыть несколько розыгрышей за всю игру. Менее ценно в лейте.",
    "e": "7 MC всего (4+3) за Wild тег"
  },
  "Restricted Area": {
    "s": 72,
    "t": "B",
    "y": [
      "Движковые стратегии",
      "Научные вэхи",
      "Колония Pluto (ротация карт)",
      "Mars University"
    ],
    "w": "Тайл (~4 MC) + Science тег без req. Действие: 2 MC → карта, нужно 5 использований для окупаемости. Не играй рано без экономики — draw без денег бессмыслен",
    "e": "14 MC всего (11+3). Карта стоит ~4 MC, платишь 2 MC за draw. Нетто +2 MC/use → 5 use для break-even",
    "c": "/r/TerraformingMarsGame/comments/1ihec4g/cotd_restricted_area_4_feb_2025/",
    "r": "Needs 5 uses for net positive. Card draw is most limiting factor in the game. Don't blindly play it. — icehawk84"
  },
  "Standard Technology": {
    "s": 60,
    "t": "C",
    "y": [
      "Credicor",
      "Thorgate",
      "AI Central",
      "Mass Converter",
      "Anti-Gravity Technology"
    ],
    "w": "Когда планируешь 3+ стандартных проекта, особенно с Credicor. Тег Science всегда полезен. Хорошо в ранней-мид игре.",
    "e": "6+3=9 MC за тег Science + 1 VP (5 MC) + 3 MC возврат за SP"
  },
  "Venusian Animals": {
    "s": 86,
    "t": "A",
    "y": [
      "Научный движок",
      "Вытягивание карт",
      "Olympus Conference",
      "Mars University",
      "Freyja Biodomes"
    ],
    "w": "Когда Venus на/близко к 18% и есть draw карт + science теги для розыгрыша. Хейт-драфт против science игроков если Venus ...",
    "e": "15+3=18 MC за 1 VP за каждый сыгранный после science тег"
  },
  "WG Project": {
    "s": 72,
    "t": "B",
    "y": [
      "Point Luna",
      "Teractor",
      "Позиция председателя",
      "Прелюдия Loan",
      "Прелюдия UNMI Contractor"
    ],
    "w": "Когда ты Chairman или можешь им стать. Пок 2-4 для максимальной ценности прелюдии. Бонус тега Earth. Весело и мощно.",
    "e": "9+3=12 MC за лучшую из 3 прелюдий"
  },
  "Atmoscoop": {
    "s": 72,
    "t": "B",
    "y": [
      "Dirigibles",
      "Stratospheric Birds",
      "Phobolog",
      "Jovian Embassy",
      "Mass Converter"
    ],
    "w": "Когда есть 3+ тега Science и нужен TR + теги. Лучше всего 3-5 пок. Оплата титаном делает дружелюбной для Space-движка. Подъём Venus...",
    "e": "22+3=25 MC за 2 TR (14-14",
    "c": "/r/TerraformingMarsGame/comments/1odz9jy/cotd_atmoscoop_23_oct_2025/",
    "r": "Pretty good late game card, can be worth 4 points even before Jovian counters, and you can often discount it by then. — dfinberg"
  },
  "Colonial Representation": {
    "s": 72,
    "t": "B",
    "y": [
      "Poseidon",
      "Aridor",
      "Sky Docks",
      "Партии Turmoil",
      "Стратегии колоний"
    ],
    "w": "2-4 пок с 2+ колониями в играх с Turmoil. Чем раньше постоянное влияние, тем больше ценность. Пропускать без Turmoil...",
    "e": "10+3=13 MC за +1 влияние навсегда (3-5 MC за пок в Turmoil) + 3 MC за колонию при розыгрыше (6-12 MC...",
    "c": "/r/TerraformingMarsGame/comments/1ojvlk5/cotd_colonial_representation_30_oct_2025/",
    "r": "Influence is generally very good. Sometimes it's low value, and on rare occasions it's even a negative to have influe... — Insanitarius-"
  },
  "Hermetic Order of Mars": {
    "s": 72,
    "t": "B",
    "y": [
      "Manutech",
      "Стратегии Landlord",
      "Раннее размещение тайлов",
      "Движки MC-прод"
    ],
    "w": "Только 1 пок когда O2 на 0-4%. Лучше всего с ранним размещением тайлов для MC по соседству. Всегда пропускай после 2 пок — окно...",
    "e": "10+3=13 MC за 2 MC-прод (10-12 MC в 1 пок) + MC за каждую пустую соседнюю клетку (~3-6 MC немедленно)",
    "c": "/r/TerraformingMarsGame/comments/1o3rtkq/cotd_hermetic_order_of_mars_11_oct_2025/",
    "r": "Even if you only have one tile, it is usually good. A single tile nets you 6M€ back, giving you 2M€ production for 4M... — ThainEshKelch"
  },
  "Stratospheric Expedition": {
    "s": 72,
    "t": "B",
    "y": [
      "Aphrodite",
      "Morning Star Inc",
      "Dirigibles",
      "Stratospheric Birds",
      "Celestic"
    ],
    "w": "При стратегии Venus или нужны карты Venus. Оплата титаном делает доступной. Лучше пок 2-5 для максимальной ценности карт Venus ...",
    "e": "12+3=15 MC за 2 флоатера (2-4 MC) + 2 карты Venus бесплатно (6-8 MC ценности) + 1 VP (5 MC) + Venu...",
    "c": "/r/TerraformingMarsGame/comments/1oo3kbm/cotd_stratospheric_expedition_4_nov_2025/",
    "r": "This card is very good value for money, you get 1VP (worth ~5), 2 Venus cards (~3 each) and 2 floaters (about 4 each)... — benbever"
  },
  "Static Harvesting": {
    "s": 72,
    "t": "B",
    "y": [
      "Interplanetary Cinematics",
      "Mining Guild",
      "Стратегии Building",
      "Manutech",
      "Thorgate"
    ],
    "w": "1-2 пок с 3+ тегами Building сыгранными или запланированными. Пропускать после 3 океанов. Лучшая ценность со сталь-тяжёлыми Building...",
    "e": "5+3=8 MC за 1 энергия-прод (7 MC на 1-м пок) + 1 MC за каждый тег Building (~3-6 MC при 3-6 тегах Building)",
    "c": "/r/TerraformingMarsGame/comments/1pnyaqx/cotd_static_harvesting_16_dec_2025/",
    "r": "Great idea to link to the BGG entry for the newer promo cards. — benbever"
  },
  "Virus": {
    "s": 75,
    "t": "B",
    "y": [
      "Decomposers",
      "Viral Enhancers",
      "GMO Contract",
      "Анти-VP стратегии"
    ],
    "w": "Драфтить когда у оппонента VP-движок на животных (Birds, Fish, Predators). Даже без целей дешёвый тег Microbe имеет ценность...",
    "e": "1+3=4 MC за удаление до 2 животных или 5 растений у любого игрока",
    "c": "/r/TerraformingMarsGame/comments/1p13olg/cotd_virus_19_nov_2025/",
    "r": "Very strong attack card. It’s only 1mc plus the 3mc card cost, meaning that if you get this as a free draw, you can o... — benbever"
  },
  "Asteroid": {
    "s": 71,
    "t": "B",
    "y": [
      "Optimal Aerobraking",
      "Media Group",
      "Phobolog",
      "Interplanetary Cinematics",
      "Solar Logistics"
    ],
    "w": "В большинстве игр когда есть титан. Выше приоритет с возвратом событий/space. Хорош для контроля шкалы температуры.",
    "e": "14+3=17 MC за 1 температурный TR (7 MC) + 2 титан (6 MC) + убрать 3 растения",
    "c": "/r/TerraformingMarsGame/comments/1noe5qv/cotd_asteroid_23_sept_2025/",
    "r": "Space events are very good in this game. This is not the most impactful one, but it's usually a relatively high draft... — icehawk84"
  },
  "Flooding": {
    "s": 71,
    "t": "B",
    "y": [
      "Arctic Algae",
      "Kelp Farming",
      "Стратегия океанов Lakefront",
      "Вэха Legend",
      "Media Group"
    ],
    "w": "Почти всегда, когда нужны океаны. Хорошо рано для бонусов размещения, хорошо поздно для завершения игры.",
    "e": "7 MC + 3 MC карта = 10 MC стоимость"
  },
  "Gene Repair": {
    "s": 71,
    "t": "B",
    "y": [
      "Научный движок",
      "Mars University",
      "Olympus Conference",
      "Награда Scientist",
      "Награда Banker"
    ],
    "w": "3-6 пок с 3+ тегами Science. Хороший набор экономики и VP для игроков Science.",
    "e": "12 MC + 3 MC карта = 15 MC стоимость"
  },
  "Luna Metropolis": {
    "s": 71,
    "t": "B",
    "y": [
      "Point Luna",
      "Teractor",
      "Earth Office",
      "Cartel",
      "Miranda Resort"
    ],
    "w": "Когда есть 3+ тега Earth или строится стратегия тегов Earth. Отличный слив титана. Хорошо для Banker/Mayor.",
    "e": "21 MC + 3 MC карта = 24 MC за N MC-прод (за тег Earth включая этот) + город на зарезервированном месте +..."
  },
  "Natural Preserve": {
    "s": 71,
    "t": "B",
    "y": [
      "Mining Guild",
      "Вэха Builder",
      "Награда Scientist",
      "Mars University",
      "Спот 3-карт на Elysium"
    ],
    "w": "1-2 пок когда O2 низкий. Отлично на раннем этапе для science тега, размещения тайла и производства. Мёртвая карта после 4% O2.",
    "e": "Стоимость 9+3=12 MC (оплата сталью)"
  },
  "Luna Governor": {
    "s": 71,
    "t": "B",
    "y": [
      "Point Luna",
      "Teractor",
      "Earth Office",
      "Cartel",
      "Luna Metropolis"
    ],
    "w": "Пок 1-3 с 2+ уже сыгранными тегами Earth и Point Luna/Teractor/Earth Office. Чем раньше, тем лучше для накопления MC-прод...",
    "e": "4+3=7 MC за 2 MC-прод (10-12 MC пок 1) + 2 тега Earth (4-6 MC синергии)",
    "c": "/r/TerraformingMarsGame/comments/1oeu0cp/cotd_luna_governor_24_oct_2025/",
    "r": "“I’ll pass him cartel it won’t be that bad” — SoupsBane"
  },
  "Ceres Tech Market": {
    "s": 71,
    "t": "B",
    "y": [
      "Point Luna",
      "Mars University",
      "Olympus Conference",
      "Колониальные стратегии",
      "Движки вытягивания карт"
    ],
    "w": "2-4 пок с синергиями тега Science и/или колониями. Действие переработки карт полезно всю игру. Science+...",
    "e": "12+3=15 MC за теги Science+Space (4-6 MC) + возврат за колонию (2 MC за колонию при игре) + сброс карт...",
    "c": "/r/TerraformingMarsGame/comments/1oyj11i/cotd_ceres_tech_market_16_nov_2025/",
    "r": "@Enson_Chan , you forgot to include the cost: 12mc. Ceres Tech Market looks really cool, but basically you’re just pa... — benbever"
  },
  "Business Contacts": {
    "s": 70,
    "t": "B",
    "y": [
      "Point Luna",
      "Media Group",
      "IC",
      "Earth Office",
      "Вэха Legend"
    ],
    "w": "1-4 пок при поиске конкретных деталей движка. Хорошо с синергиями тега Earth и возвратами за события.",
    "e": "7+3=10 MC за 2 выбранные карты (6-8 MC, просмотр 4 = лучший выбор)"
  },
  "Development Center": {
    "s": 70,
    "t": "B",
    "y": [
      "Thorgate",
      "Mass Converter",
      "Quantum Extractor",
      "Mars University",
      "Valley Trust"
    ],
    "w": "1-3 пок когда есть или можно дёшево получить производство энергии. Ключевой draw карт для движковых стратегий.",
    "e": "11 MC (оплата сталью) + 3 MC карта = 14 MC стоимость"
  },
  "GHG Producing Bacteria": {
    "s": 58,
    "t": "C",
    "y": [
      "Extreme-Cold Fungus",
      "Symbiotic Fungus",
      "Колония Enceladus",
      "Decomposers",
      "Splice"
    ],
    "w": "Пок 1-3, когда температура ещё далеко от максимума и есть или ожидаются кормушки микробов.",
    "e": "8 MC + 3 MC карта = 11 MC стоимость"
  },
  "Heavy Taxation": {
    "s": 70,
    "t": "B",
    "y": [
      "Point Luna",
      "Teractor",
      "Earth Office",
      "Cartel",
      "IC"
    ],
    "w": "Ранняя-мид игра при 2+ тегах Earth. Отличная игра на 1-4 пок. Пропускать, если осталось менее 4 пок.",
    "e": "3 MC + 3 MC карта - 1 VP штраф = ~11 MC фактическая стоимость"
  },
  "Ishtar Expedition": {
    "s": 70,
    "t": "B",
    "y": [
      "Phobolog",
      "Advanced Alloys",
      "Карты Venus стратегии",
      "Morning Star Inc"
    ],
    "w": "Когда Венера поднималась или активно поднимается. Титан окупает себя; карты Венеры — чистый бонус.",
    "e": "6 MC + 3 MC карта = 9 MC за 3 титана (~9 MC) + 2 карты Венеры (~6 MC целевой draw)"
  },
  "Jovian Embassy": {
    "s": 70,
    "t": "B",
    "y": [
      "Terraforming Ganymede",
      "Io Mining Industries",
      "Saturn Systems",
      "Вэха Rim Settler"
    ],
    "w": "Последний пок или лейт как сброс стали с потенциалом множителя Jovian. Хорош для майлстоуна Rim Settler на Hellas.",
    "e": "14 MC + 3 MC карта = 17 MC за 1 TR (~7 MC) + 1 VP (~5 MC) + Jovian тег (~3-5 MC) + Building тег (..."
  },
  "Martian Zoo": {
    "s": 70,
    "t": "B",
    "y": [
      "Meat Industry",
      "Колония Miranda",
      "Tharsis Republic",
      "Point Luna",
      "Viral Enhancers"
    ],
    "w": "Когда существуют 2 города и планируешь играть теги Earth. Лучше с прелюдиями городов или Tharsis в игре.",
    "e": "Стоимость 12+3=15 MC"
  },
  "Mining Quota": {
    "s": 70,
    "t": "B",
    "y": [
      "Advanced Alloys",
      "Rego Plastics",
      "Прелюдии Wild тегов",
      "Colonizer Training Camp",
      "Space Elevator"
    ],
    "w": "Когда естественно есть или можно дёшево получить все три планетарных тега. Не ломай стратегию ради требования.",
    "e": "Стоимость 5+3=8 MC (оплата сталью)"
  },
  "Rim Freighters": {
    "s": 70,
    "t": "B",
    "y": [
      "Колониальные стратегии",
      "Несколько торговых флотов",
      "Синергии Space тега",
      "Cryo Sleep"
    ],
    "w": "Ранняя игра когда колонии в игре и планируешь торговать регулярно. Дёшево, эффективно, просто.",
    "e": "7 MC всего (4+3) за -1 стоимость торговли (~7"
  },
  "Sister Planet Support": {
    "s": 70,
    "t": "B",
    "y": [
      "Движки Earth тега (Cartel, Miranda Resort)",
      "Партия Unity",
      "Вэха Specialist",
      "Синергии Venus тега"
    ],
    "w": "1-2 пок когда уже есть Venus+Earth теги. Быстро теряет ценность после 3 пок.",
    "e": "10 MC всего (7+3) за 3 MC-прод (~15-18 MC) + Venus+Earth теги (~5 MC)"
  },
  "Space Elevator": {
    "s": 70,
    "t": "B",
    "y": [
      "IC (запас стали)",
      "Mining Guild",
      "Прелюдии прод стали",
      "Колония Ceres"
    ],
    "w": "Когда есть стабильное производство стали (2+ сталь-прод). Лучше для стартовой руки IC.",
    "e": "30 MC всего (27+3) за 1 титан-прод (~12"
  },
  "Technology Demonstration": {
    "s": 70,
    "t": "B",
    "y": [
      "IC",
      "Mars University",
      "Olympus Conference",
      "Media Group",
      "Optimal Aerobraking"
    ],
    "w": "Когда есть скидки на Space/Event или триггеры тега Science. Хорошая движковая карта. Даже без синергий 8 MC за 2 карты...",
    "e": "5+3=8 MC за 2 карты (6-8 MC) + теги Science+Space+Event"
  },
  "Wildlife Dome": {
    "s": 70,
    "t": "B",
    "y": [
      "Decomposers",
      "Viral Enhancers",
      "Ecological Zone",
      "Aridor",
      "Вэха Ecologist"
    ],
    "w": "1 пок когда Greens правят (4 MC обратно). Мид с 2 делегатами в Greens. Тройной тег всегда ценен.",
    "e": "15+3=18 MC (оплата сталью) за озеленение (TR + VP, стоит ~19 MC) + тройной тег Animal+Plant+Building..."
  },
  "Colonizer Training Camp": {
    "s": 64,
    "t": "C",
    "y": [
      "Jovian Embassy",
      "Jupiter Floating Station",
      "Io Mining Industries",
      "Interplanetary Colony Ship",
      "Прод стали"
    ],
    "w": "Mid без стали. Силён на Hellas (Diversifier/Rim Settler). На Tharsis слабее. Узкое окно max 5% O₂. Steel dump основной смысл",
    "e": "8+3=11 MC за 2 VP (10 MC) + Jovian+Building теги (3-5 MC)",
    "c": "/r/TerraformingMarsGame/comments/1owsm5v/cotd_colonizer_training_camp_14_nov_2025/",
    "r": "This card is awesome on Hellas where it hits Diversifier, Rim Settler, Tactician, Magnate and Contractor. — icehawk84"
  },
  "Noctis Farming": {
    "s": 70,
    "t": "B",
    "y": [
      "Nitrogen Rich Asteroid",
      "Insects",
      "Mining Guild",
      "Ecological Zone",
      "Прод стали"
    ],
    "w": "Пок 1-3 как активатор NRA + слив стали + VP. Лучше с синергиями тега Plant. Пропускай после пок 4, когда MC-прод имеет слишком мало пок...",
    "e": "10+3=13 MC за 1 MC-прод (5-6 MC пок 1) + 2 растения (1",
    "c": "/r/TerraformingMarsGame/comments/1oi5aag/cotd_noctis_farming_28_oct_2025/",
    "r": "This cards great! 13mc for the equivalent of a TR (worth 7-8ish) and two plants (worth 4-5) which makes it already wo... — SoupsBane"
  },
  "Cartel": {
    "s": 75,
    "t": "B",
    "y": [
      "Point Luna",
      "Teractor",
      "Earth Office",
      "Luna Metropolis",
      "Acquired Company"
    ],
    "w": "Когда есть 2+ других тега Earth. Отлично с Point Luna + Earth Office. Пропускать с только 1 тегом Earth.",
    "e": "8+3=11 MC за N MC-прод, где N = теги Earth (включая эту)"
  },
  "Bushes": {
    "s": 68,
    "t": "C",
    "y": [
      "Nitrogen Rich Asteroid",
      "Insects",
      "Ecoline",
      "Robot Pollinators",
      "Arctic Algae"
    ],
    "w": "Когда -10C будет достигнуто через 1-2 пок и хочешь озеленения. Приоритет аналогичен Algae.",
    "e": "10+3=13 MC за 2 растения-прод (16 MC) + 2 растения (4 MC) + тег Plant (1-2 MC)"
  },
  "Business Network": {
    "s": 74,
    "t": "B",
    "y": [
      "Point Luna",
      "Earth Office",
      "Teractor",
      "Движковые стратегии"
    ],
    "w": "1-2 пок с синергией Earth тега и хорошей экономикой. Пропускай если MC-прод ограничен.",
    "e": "4+3=7 MC + 1 MC-прод (-5 MC) = 12 MC фактически"
  },
  "Cyberia Systems": {
    "s": 68,
    "t": "C",
    "y": [
      "Cheung Shing Mars",
      "Nirgal Enterprises",
      "Sagitta",
      "Community Services",
      "Mining Operations"
    ],
    "w": "Пок 1-2 с 2+ хорошими целями карт Building уже в игре. Значительно лучше с расширенным правилом старта из Prelude 2.",
    "e": "16 MC + 3 MC карта = 19 MC (оплата сталью)"
  },
  "Domed Crater": {
    "s": 68,
    "t": "C",
    "y": [
      "Mining Guild",
      "Tharsis Republic",
      "Ecoline",
      "Immigrant City",
      "Pets"
    ],
    "w": "Мид с имеющейся сталью и 5+ ресурсов растений для немедленной конверсии в озеленение. Слабее при ранней игре чисто ради экономики.",
    "e": "24 MC (оплата сталью) + 3 MC карта + ~7 MC энергия-прод = ~34 MC стоимость"
  },
  "Freyja Biodomes": {
    "s": 68,
    "t": "C",
    "y": [
      "Morning Star Inc",
      "Venusian Animals",
      "Stratospheric Birds",
      "Fish",
      "Decomposers"
    ],
    "w": "Только с 5+ тегами Venus или Morning Star Inc с -2 к требованию. Хорошая карта выплаты для глубоких стратегий Венеры.",
    "e": "14 MC + 3 MC карта = 17 MC стоимость"
  },
  "Invention Contest": {
    "s": 72,
    "t": "B",
    "y": [
      "Mars University",
      "IC",
      "Media Group",
      "Пэйоффы Science тега"
    ],
    "w": "Когда нужны science теги или фильтрация карт. Лучше с возвратом событий. Не высокий приоритет драфта, но неплохой филлер.",
    "e": "2 MC + 3 MC карта = 5 MC за 1 отобранную карту (смотришь 3, оставляешь 1)"
  },
  "Io Mining Industries": {
    "s": 76,
    "t": "B",
    "y": [
      "Phobolog",
      "Saturn Systems",
      "Advanced Alloys",
      "Terraforming Ganymede",
      "Excentric Sponsor"
    ],
    "w": "Пок 1 с Phobolog или мощной поддержкой титана из прелюдий. Иначе слишком дорого и медленно для 8-пок игр.",
    "e": "41 MC + 3 MC карта = 44 MC за 2 титан-прод (~25 MC) + 2 MC-прод (~10 MC) + тег Jovian (3-5 MC) + 1VP..."
  },
  "Jovian Lanterns": {
    "s": 73,
    "t": "B",
    "y": [
      "Колония Titan",
      "Aerial Mappers",
      "Celestic",
      "Множители Jovian",
      "Floating Habs"
    ],
    "w": "Мид с синергиями Jovian/floater. Хорошая цель для колонии Titan. Не играть без поддержки floater.",
    "e": "20 MC + 3 MC карта = 23 MC (только наличные)"
  },
  "Lagrange Observatory": {
    "s": 68,
    "t": "C",
    "y": [
      "Mars University",
      "Пэйоффы научного движка",
      "Phobolog",
      "Warp Drive"
    ],
    "w": "При строительстве science-движка или когда нужен VP + тег Science. Хороший слив титана в любое время. Твёрдый 3-4 пик в драфте.",
    "e": "9 MC + 3 MC карта = 12 MC за 1 карту (~3 MC) + 1 VP (~5 MC) + теги Science+Space (~6 MC)"
  },
  "Mine": {
    "s": 68,
    "t": "C",
    "y": [
      "Mining Guild",
      "Advanced Alloys",
      "Rego Plastics",
      "Space Elevator",
      "Electro Catapult"
    ],
    "w": "1-2 пок когда есть цели для стали. Дешёвый building тег филлер. Пропускай после 3 пок.",
    "e": "Стоимость 4+3=7 MC (оплата сталью)"
  },
  "Orbital Cleanup": {
    "s": 68,
    "t": "C",
    "y": [
      "Научные стратегии",
      "Mass Converter",
      "Mars University",
      "Olympus Conference",
      "Point Luna"
    ],
    "w": "Мид с 4+ тегами Science. -2 MC-прод означает, что стоит брать только когда действие перевешивает потерю.",
    "e": "Стоимость 14+3=17 MC (оплата титаном) + 2 MC-прод потеряно (10)"
  },
  "Potatoes": {
    "s": 68,
    "t": "C",
    "y": [
      "Nitrogen-Rich Asteroid",
      "Insects",
      "Viral Enhancers",
      "Ecological Zone",
      "NRA"
    ],
    "w": "1-3 пок, когда есть 2 растения или можно легко получить. Тег Plant — основная ценность. Отличная дешёвая прод.",
    "e": "Стоимость 2+3=5 MC - 2 растения (~4)"
  },
  "Project Inspection": {
    "s": 68,
    "t": "C",
    "y": [
      "AI Central",
      "Electro Catapult",
      "Martian Rails",
      "Martian Zoo",
      "Карты животных 1-VP"
    ],
    "w": "Когда есть хотя бы одна сильная карта с действием. Низкий приоритет в драфте, но почти всегда можно сыграть.",
    "e": "3 MC всего (0+3) за повторное действие"
  },
  "Quantum Extractor": {
    "s": 74,
    "t": "B",
    "y": [
      "Mass Converter",
      "AI Central",
      "Научный движок",
      "Physics Complex",
      "Колонии (торговля энергией)"
    ],
    "w": "Когда уже строишь science движок и нужна энергия. Не играй плохие science теги только ради разблокировки этого.",
    "e": "16 MC всего (13+3) за 4 энергия-прод (~30 MC) + скидка 2 MC на space карту + Science+Power теги"
  },
  "Saturn Surfing": {
    "s": 68,
    "t": "C",
    "y": [
      "Движки Earth тега",
      "Point Luna",
      "Teractor",
      "Вэха Hoverlord",
      "Карты поддержки флоатеров"
    ],
    "w": "Когда есть 3+ тега Earth и ценен тег Jovian. В лейте, если Hoverlord оспариваем.",
    "e": "16 MC всего (13+3) за теги Jovian+Earth (~6 MC) + 1 VP (~5 MC) + X флоатеров (1 за тег Earth) + ..."
  },
  "Solar Wind Power": {
    "s": 68,
    "t": "C",
    "y": [
      "Aridor (3 новых тега)",
      "Вэхи Science/Space/Power",
      "Diversifier",
      "Колонии (энергия для торговли)"
    ],
    "w": "Ранняя игра, когда нужна энергия-прод и теги. Хорошая ценность для старта Science-движка.",
    "e": "14 MC всего (11+3) - 6 MC (2 титан) = фактически 8 MC за 1 энергия-прод (~7"
  },
  "Sponsored Academies": {
    "s": 68,
    "t": "C",
    "y": [
      "Mars University",
      "Olympus Conference",
      "Earth Office",
      "Научный движок",
      "Разблокировка AGT"
    ],
    "w": "Когда есть триггеры science в игре. Играть после того как оппоненты спасуют. Хороший источник тегов Science+Earth.",
    "e": "12 MC всего (9+3) за нетто +2 карты (draw 3, сброс 1) + 1 VP + теги Earth+Science (~6 MC) - оппо..."
  },
  "Strip Mine": {
    "s": 68,
    "t": "C",
    "y": [
      "Interplanetary Cinematics",
      "Thorgate",
      "Прелюдия Power Generation",
      "Mining Guild",
      "Robotic Workforce"
    ],
    "w": "Только 1 пок когда уже есть 2+ энергия-прод от прелюдий/корпорации. Пропускай если пришлось бы ставить SP электростанцию.",
    "e": "25+3=28 MC, минус 2 энергия-прод (14 MC) = фактическая стоимость 42 MC"
  },
  "Zeppelins": {
    "s": 68,
    "t": "C",
    "y": [
      "Награда Banker",
      "Tharsis Republic",
      "Поля с городами",
      "Вытягивание карт Zeppelin",
      "Сброс MC лейт-гейма"
    ],
    "w": "Мид-лейт, когда города накапливаются. Ключевой свинг награды Banker. Менее полезно, если Banker не в игре.",
    "e": "13+3=16 MC за N MC-прод (где N = города на Марсе) + 1 VP (5 MC)"
  },
  "Productive Outpost": {
    "s": 68,
    "t": "C",
    "y": [
      "Poseidon",
      "Aridor",
      "Стратегии колоний",
      "Колония Titan",
      "Колония Ganymede"
    ],
    "w": "Только с 2+ колониями на ценных локациях. Лучше всего как взрывная карта на 5-7 пок. Пропускать с 0-1 колонией. Штраф без тега ограничив...",
    "e": "0+3=3 MC за повтор всех бонусов колоний",
    "c": "/r/TerraformingMarsGame/comments/1p9lb4g/cotd_productive_outpost_29_nov_2025/",
    "r": "Such a nice little card. Worth it with two colonies (arguably even one if it’s Pluto or Miranda), if you end up with ... — Enter_Octopus"
  },
  "Rover Construction": {
    "s": 72,
    "t": "B",
    "y": [
      "Mining Guild",
      "Стратегии размещения городов",
      "Immigration Shuttles",
      "Capital",
      "Прод стали"
    ],
    "w": "1-2 пок как пассивный движок дохода. Приоритет слива стали. Лучше в метах с большим количеством городов. Пропускать в 4+ пок когда меньше городов оста...",
    "e": "8+3=11 MC за +2 MC за каждый размещённый город (все игроки) + 1 VP (5 MC) + тег Building (оплата сталью)",
    "c": "/r/TerraformingMarsGame/comments/1omdqpy/cotd_rover_construction_2_nov_2025/",
    "r": "Decent but not great card. If you know you and or the opponents are going to play a few city over the course of the g... — Arimotomeku"
  },
  "Asteroid Mining Consortium": {
    "s": 67,
    "t": "C",
    "y": [
      "Phobolog (как атакующий)",
      "Множители Jovian",
      "Saturn Systems",
      "Вэха Rim Settler"
    ],
    "w": "1-2 пок когда есть титан-прод и можно нацелиться на ключевого оппонента. В лейте для Jovian тега. Контр-драфт для защиты своего ...",
    "e": "13+3=16 MC за 1 титан-прод нетто (12"
  },
  "Dirigibles": {
    "s": 67,
    "t": "C",
    "y": [
      "Morning Star Inc",
      "Celestic",
      "Aerial Mappers",
      "Floating Habs",
      "Колония Titan"
    ],
    "w": "При приверженности стратегии Venus с другими картами флоатеров/Venus. Хорошо для вехи Hoverlord.",
    "e": "11 MC + 3 MC карта = 14 MC стоимость"
  },
  "Giant Solar Shade": {
    "s": 68,
    "t": "C",
    "y": [
      "Phobolog",
      "Aphrodite",
      "Terraforming Deal",
      "Карты с Venus req",
      "Награда Venuphile"
    ],
    "w": "1-3 пок с титаном и синергиями Venus. Слабее в лейте, когда доход от TR минимален.",
    "e": "27 MC (оплата титаном) + 3 MC карта = 30 MC стоимость"
  },
  "Investment Loan": {
    "s": 67,
    "t": "C",
    "y": [
      "Teractor",
      "Earth Office",
      "IC",
      "Media Group",
      "Point Luna"
    ],
    "w": "Когда нужно 10 MC сейчас чтобы сыграть ключевую карту на поколение раньше. Лучше в мид-лейт когда -1 MC-прод менее важен. Хор...",
    "e": "3 MC + 3 MC карта = 6 MC стоимость"
  },
  "Mining Rights": {
    "s": 58,
    "t": "C",
    "y": [
      "Mining Guild",
      "Mining Area",
      "Phobolog",
      "Награда Landlord",
      "Споты стали/титана на Tharsis"
    ],
    "w": "1-3 пок на клетку с титаном. Неплохо для телепортации через карту. Менее ценно после 3 пок.",
    "e": "Стоимость 9+3=12 MC (оплата сталью)"
  },
  "Titan Shuttles": {
    "s": 67,
    "t": "C",
    "y": [
      "Jupiter Floating Station",
      "Jovian Lanterns",
      "Saturn Surfing",
      "Колония Titan",
      "Партия Unity"
    ],
    "w": "В стратегиях Jovian с синергиями флоатеров. Комбо тегов Jovian + Space помогает множителям и Rim Settler.",
    "e": "23+3=26 MC за теги Jovian+Space + 1 VP + действие: добавить 2 флоатера на любой Jovian или конвертировать флоатер..."
  },
  "Soil Studies": {
    "s": 70,
    "t": "B",
    "y": [
      "Nitrogen Rich Asteroid",
      "Decomposers",
      "Ecological Zone",
      "Стратегии Venus",
      "Колониальные стратегии"
    ],
    "w": "2-4 пок с 4+ тегами Venus/Plant/Colony для дешёвого озеленения. Теги Microbe+Plant — минимальная ценность. Пропускать с меньшим числом тегов...",
    "e": "13+3=16 MC за растения за каждый тег Venus+Plant+Colony",
    "c": "/r/TerraformingMarsGame/comments/1ov1eej/cotd_soil_studies_12_nov_2025/",
    "r": "A pretty strong card, which combos with generally unrelated stuff. — SoupsBane"
  },
  "Neptunian Power Consultants": {
    "s": 67,
    "t": "C",
    "y": [
      "Aquifer Pumping",
      "Arctic Algae",
      "Стратегии размещения океанов",
      "Thorgate",
      "Manutech"
    ],
    "w": "1-3 пок когда большинство океанов осталось. Оплата сталью помогает раннему розыгрышу. Пропускать если 4+ океана уже размещено. Лучше всего с корпами которые...",
    "e": "14+3=17 MC (оплата сталью, подразумеваемая стоимость ~12-13 MC)",
    "c": "/r/TerraformingMarsGame/comments/1o824ky/cotd_neptunian_power_consultants_16_oct_2025/",
    "r": "A potentially good way to energy and VP in the early game, but you have to play it as early as humanly possible, and ... — BentonSancho"
  },
  "Acquired Company": {
    "s": 66,
    "t": "C",
    "y": [
      "Point Luna",
      "Teractor",
      "Earth Office",
      "Cartel",
      "Manutech"
    ],
    "w": "1-2 пок с синергиями Earth тега или когда оспаривается награда Banker. Пропускай после 3 пок если Earth теги не важны.",
    "e": "10+3=13 MC за 3 MC-прод = 4"
  },
  "Bactoviral Research": {
    "s": 71,
    "t": "B",
    "y": [
      "Ants",
      "Sulphur-Eating Bacteria",
      "Decomposers",
      "Venusian Insects",
      "Колония Enceladus"
    ],
    "w": "Когда есть 4+ тега Science И сильный слив микробов (Ants, SEB, Decomposers). Иначе низкий приоритет.",
    "e": "10+3=13 MC за 1 карту (3-4 MC) + тег Microbe (1-2 MC) + тег Science (3-5 MC) + N микробов где N..."
  },
  "Convoy From Europa": {
    "s": 66,
    "t": "C",
    "y": [
      "Optimal Aerobraking",
      "Media Group",
      "Phobolog",
      "Спот 2-карт океана на Tharsis",
      "Solar Logistics"
    ],
    "w": "Когда нужен океан и есть титан. Лучше со скидками на Event/Space. Средний приоритет драфта.",
    "e": "15+3=18 MC за 1 океан TR (7 MC) + бонус размещения (~2-4 MC) + 1 карта (3-4 MC) + теги Space/Event"
  },
  "Dawn City": {
    "s": 66,
    "t": "C",
    "y": [
      "Phobolog",
      "Advanced Alloys",
      "Quantum Extractor",
      "Mass Converter",
      "Pets"
    ],
    "w": "Лейт с 4+ тегами Science и избытком энергия-прод. Хороший слив титана в последнее пок.",
    "e": "15 MC (3 MC + ~5 титана) + 3 MC карта + ~7 MC энергия-прод = ~25 MC фактически"
  },
  "Envoys From Venus": {
    "s": 66,
    "t": "C",
    "y": [
      "Стратегия Venus",
      "Turmoil"
    ],
    "w": "Venus + Turmoil.",
    "e": "4 MC за 2 delegates",
    "c": "/r/TerraformingMarsGame/comments/1o6bc9k/cotd_envoys_from_venus_14_oct_2025/",
    "r": "Action efficient if you have three Venus tags and need to take control. — Sir_Stash"
  },
  "Farming": {
    "s": 72,
    "t": "B",
    "y": [
      "Прелюдия Ecology Experts",
      "Viral Enhancers",
      "Ecological Zone",
      "Psychrophiles",
      "Vitor"
    ],
    "w": "Оставляй в руке с ранней игры, играй в последнем поколении. Исключительно с прелюдией Ecology Experts.",
    "e": "16 MC + 3 MC карта = 19 MC стоимость"
  },
  "Galilean Waystation": {
    "s": 66,
    "t": "C",
    "y": [
      "Множители Jovian",
      "Ganymede Colony",
      "Io Mining Industries",
      "Вэха Rim Settler",
      "Vesta Shipyard"
    ],
    "w": "Мид с 3+ тегами Jovian суммарно в игре. Хорош для стратегий коллекционирования тегов Jovian.",
    "e": "15 MC + 3 MC карта = 18 MC стоимость"
  },
  "Industrial Microbes": {
    "s": 66,
    "t": "C",
    "y": [
      "Electro Catapult",
      "Advanced Alloys",
      "Rego Plastics",
      "Вэха Ecologist",
      "Decomposers"
    ],
    "w": "1-2 пок когда нужен энергия-прод и есть сталь для траты. Хороший активатор Electro Catapult.",
    "e": "12 MC + 3 MC карта = 15 MC за 1 сталь-прод (~8 MC) + 1 энергия-прод (~7"
  },
  "Methane From Titan": {
    "s": 66,
    "t": "C",
    "y": [
      "Inventrix",
      "Phobolog",
      "Advanced Alloys",
      "Smelting Plant",
      "Adaptation Technology"
    ],
    "w": "1-2 пок когда O2 уже 2%+ и есть титан. Не драфти только ради Jovian тега — слишком дорого.",
    "e": "Стоимость 28+3=31 MC (оплата титаном)"
  },
  "Peroxide Power": {
    "s": 66,
    "t": "C",
    "y": [
      "Колонии (торговля)",
      "Strip Mine",
      "AI Central",
      "Города",
      "Вэха Builder"
    ],
    "w": "Когда нужны 2 производства энергии. Одна из наиболее эффективных карт энергии. Хорошо с оплатой сталью.",
    "e": "Стоимость 7+3=10 MC (оплата сталью) + 1 MC-прод потерян (5-6)"
  },
  "Protected Valley": {
    "s": 66,
    "t": "C",
    "y": [
      "Mining Guild",
      "Credicor",
      "IC (сталь)",
      "NRA",
      "Вэха Gardener"
    ],
    "w": "Когда есть значительная прод стали или запасы. Хорош для внезапного захвата вехи Gardener.",
    "e": "26 MC всего (23+3) за озеленение + 1 TR + 2 MC-прод + теги Plant+Building"
  },
  "Solar Reflectors": {
    "s": 66,
    "t": "C",
    "y": [
      "Phobolog (оплата титаном)",
      "Helion",
      "UNMI",
      "Награда Thermalist",
      "Раш-стратегия"
    ],
    "w": "1 пок с титаном для оплаты. Активирует стратегию раша температуры. Бесполезно после 2-3 пок.",
    "e": "26 MC всего (23+3) за 5 тепло-прод (~20-30 MC в зависимости от пок)"
  },
  "Space Station": {
    "s": 60,
    "t": "C",
    "y": [
      "Phobolog",
      "Движок Space тега",
      "Satellites",
      "Другие скидки Space (стакаются)"
    ],
    "w": "Ранняя-мид игра при планировании много space карт. В лейте только для сброса VP с титаном.",
    "e": "13 MC всего (10+3) за скидку -2 MC на space карту + 1 VP (~5 MC) + Space тег"
  },
  "Titan Floating Launch-pad": {
    "s": 66,
    "t": "C",
    "y": [
      "Stormcraft",
      "Celestic",
      "Saturn Systems",
      "Floater Technology",
      "Вэха Hoverlord"
    ],
    "w": "Когда нужна альтернатива торговому флоту и/или тег Jovian. Лучше рано, когда можно использовать все бесплатные торговли.",
    "e": "18+3=21 MC за тег Jovian + 1 VP + 2 флоатера сразу + действие: добавить 1 флоатер или потратить 6 для торговли"
  },
  "Titanium Mine": {
    "s": 66,
    "t": "C",
    "y": [
      "Космические карты",
      "Phobolog",
      "Advanced Alloys",
      "Карты за сталь",
      "Вэха Builder"
    ],
    "w": "1-2 пок всегда. Простая карта прод. Пропускать после 3-го пок — титан-прод теряет ценность.",
    "e": "7+3=10 MC за 1 титан-прод (12"
  },
  "Aerial Mappers": {
    "s": 65,
    "t": "C",
    "y": [
      "Dirigibles",
      "Колония Titan",
      "Stratopolis",
      "Floating Habs",
      "Venus Waystation"
    ],
    "w": "1-3 пок в движке Venus/флоатеров. Пропускать после 4 пок если нет сильной синергии с флоатерами.",
    "e": "11+3=14 MC за 1 VP (5 MC) + тег Venus (2-3 MC) + действие: 1 карта каждые 2 пок (~1"
  },
  "CEO's Favorite Project": {
    "s": 45,
    "t": "D",
    "y": [
      "Physics Complex",
      "Birds",
      "Fish",
      "Livestock",
      "Predators"
    ],
    "w": "Когда есть 1-VP животное или Physics Complex с ресурсами. Хорош для майлстоуна Legend. Низкий приоритет драфта.",
    "e": "1+3=4 MC за ~1 VP (5 MC) обычно"
  },
  "Corona Extractor": {
    "s": 65,
    "t": "C",
    "y": [
      "Колонии (торговля)",
      "Научный движок",
      "AI Central",
      "Quantum Extractor",
      "Карты городов"
    ],
    "w": "Когда есть 4 тега Science и нужна энергия, особенно с Колониями. Оплата титаном — плюс.",
    "e": "10+3=13 MC (оплата титаном) за 4 энергия-прод (30 MC) + теги Space+Power (2-3 MC)",
    "c": "/r/TerraformingMarsGame/comments/1nez65p/cotd_corona_extractor_12_sept_2025/",
    "r": "I always like power production in colonies — kelkashoze"
  },
  "Directed Heat Usage": {
    "s": 65,
    "t": "C",
    "y": [
      "Helion",
      "Sagitta",
      "Community Services",
      "Mass Converter",
      "Любая прод тепла"
    ],
    "w": "Когда тепло-прод высока и температура близка к максимуму. Хороший дешёвый подбор в любой момент.",
    "e": "1 MC + 3 MC карта = 4 MC стоимость"
  },
  "Floyd Continuum": {
    "s": 65,
    "t": "C",
    "y": [
      "Научный движок",
      "Экономика лейт-гейма",
      "Viron",
      "Standard Technology",
      "Включение Venus"
    ],
    "w": "1-3 пок как спекуляция на лейт-доход. Лучше в длинных играх где параметры завершаются со временем.",
    "e": "4 MC + 3 MC карта = 7 MC стоимость"
  },
  "Great Dam:promo": {
    "s": 65,
    "t": "C",
    "y": [
      "Торговля колониями",
      "Physics Complex",
      "Mining Guild",
      "Steelworks",
      "Вэха Builder"
    ],
    "w": "Мид с 4+ океанами и хорошим местом рядом с океаном для размещения. Чуть лучше оригинальной Great Dam.",
    "e": "15 MC (оплата сталью) + 3 MC карта = 18 MC стоимость"
  },
  "Miranda Resort": {
    "s": 65,
    "t": "C",
    "y": [
      "Point Luna",
      "Teractor",
      "Cartels",
      "Множители Jovian",
      "Ganymede Colony"
    ],
    "w": "Когда есть 3+ тега Earth для MC-прод, или нужен дешёвый тег Jovian. Оплата титаном помогает в лейте.",
    "e": "Стоимость 12+3=15 MC (оплата титаном)"
  },
  "Nitrophilic Moss": {
    "s": 65,
    "t": "C",
    "y": [
      "Nitrogen-Rich Asteroid",
      "Insects",
      "Viral Enhancers",
      "Ecological Zone",
      "Arctic Algae"
    ],
    "w": "2-4 пок, когда 3 океана размещены и есть 2+ растения. Хороший тег Plant для синергии NRA/Insects.",
    "e": "Стоимость 8+3=11 MC - 2 растения (~4)"
  },
  "Noctis City": {
    "s": 70,
    "t": "B",
    "y": [
      "Карта Tharsis",
      "Вэха Mayor",
      "Размещение озеленения",
      "Оплата сталью",
      "Robotic Workforce"
    ],
    "w": "На Тарсисе: высокий приоритет, купить рано и сыграть поздно для неожиданного города. На других картах: посредственно, только с избытком стали.",
    "e": "Стоимость 18+3=21 MC (оплата сталью) + 1 энергия-прод (~7",
    "c": "/r/TerraformingMarsGame/comments/1n284vb/cotd_noctis_city_28_aug_2025/",
    "r": "Cheap way to get a city - on original board quite a nice spot - good card imho — AnMiWr"
  },
  "Plantation": {
    "s": 65,
    "t": "C",
    "y": [
      "Nitrogen-Rich Asteroid",
      "Insects",
      "Вэха Gardener",
      "Mars University (для req)",
      "Research"
    ],
    "w": "Когда есть 2 science тега и нужно озеленение или plant тег. Мид скидка на SP озеленение.",
    "e": "Стоимость 15+3=18 MC"
  },
  "Self-replicating Robots": {
    "s": 65,
    "t": "C",
    "y": [
      "Viron (двойное действие)",
      "Большие Space/Building карты (Deimos Down, Io Mining)",
      "Научный движок"
    ],
    "w": "В ранней игре с 2 тегами Science и дорогими картами-целями. Теряет ценность после пок 3-4.",
    "e": "10 MC всего (7+3) за действие: добавить 2 ресурса, ИЛИ убрать ресурсы с карты для скидки на Building..."
  },
  "Towing A Comet": {
    "s": 65,
    "t": "C",
    "y": [
      "Arctic Algae",
      "Скидка IC",
      "Credicor",
      "Optimal Aerobraking",
      "Титан"
    ],
    "w": "Мид, когда можно оплатить титаном и скомбинировать с конверсией растений. Хорош для стратегий раша.",
    "e": "23+3=26 MC (оплата титаном) за 1 океан TR (7 MC) + 1 O2 TR (7 MC) + 2 растения (4 MC) + бонус размещ..."
  },
  "Lava Flows": {
    "s": 65,
    "t": "C",
    "y": [
      "Mining Guild (соседство тайлов)",
      "Стратегии Landlord",
      "Карты зависимые от температуры"
    ],
    "w": "Когда вулканические места размещения совпадают с твоими тайлами и нужен TR. Пропускать если нет ценности соседства. Обычно переоценена...",
    "e": "18+3=21 MC за 2 подъёма температуры (2 TR = 14-14",
    "c": "/r/TerraformingMarsGame/comments/1pi3tzx/cotd_lava_flows_9_dec_2025/",
    "r": "I wish they'd marked the volcano spots on the boards with a little volcano symbol or text in red or something so that... — Acceptable-Ease4640"
  },
  "Advanced Alloys": {
    "s": 74,
    "t": "B",
    "y": [
      "Interplanetary Cinematics",
      "Phobolog",
      "Mining Guild",
      "Supply Drop",
      "Metal-Rich Asteroid"
    ],
    "w": "1-2 пок с IC, Phobolog или тяжёлыми металлическими прелюдиями. Пропускай если менее 3 метал-прод или мало Building/Space целей...",
    "e": "9+3=12 MC"
  },
  "Bribed Committee": {
    "s": 64,
    "t": "C",
    "y": [
      "Point Luna",
      "Teractor",
      "Media Group",
      "IC",
      "Вэха Legend"
    ],
    "w": "Пок 1-3, когда нужен немедленный буст дохода. Чем раньше, тем лучше. Пропускай после пок 4.",
    "e": "7+3=10 MC за 2 TR (14 MC) - 2 VP (-10 MC)"
  },
  "Cryo-Sleep": {
    "s": 64,
    "t": "C",
    "y": [
      "Колонии (торговля)",
      "Несколько торговых флотов",
      "Научный движок",
      "Rim Freighters"
    ],
    "w": "При игре с колониями и нужен тег Science. Лучше с 2+ торговыми флотами. Пропускать без активной торговли колоний.",
    "e": "10+3=13 MC за тег Science (3-5 MC) + 1 VP (5 MC) + скидка на торговлю (экономит 1 энергию/MC за торговлю =..."
  },
  "Cupola City": {
    "s": 64,
    "t": "C",
    "y": [
      "Mining Guild",
      "Tharsis Republic",
      "Cheung Shing Mars",
      "Immigrant City",
      "Rover Construction"
    ],
    "w": "Ранняя игра со сталью для слива и свободным энергия-прод. Хорошо для веха Mayor на Тарсисе.",
    "e": "16 MC (оплата сталью) + 3 MC карта + ~7 MC энергия-прод = ~26 MC стоимость"
  },
  "Earth Elevator": {
    "s": 72,
    "t": "B",
    "y": [
      "Phobolog",
      "Advanced Alloys",
      "Turmoil Unity",
      "Колония Triton",
      "Скидки Space тега"
    ],
    "w": "2-4 пок с Phobolog или значительными запасами титана. Пропускай если не можешь сыграть до 5 пок.",
    "e": "43 MC (оплата титаном) + 3 MC карта = 46 MC стоимость"
  },
  "Extremophiles": {
    "s": 64,
    "t": "C",
    "y": [
      "GHG Producing Bacteria",
      "Sulphur-Eating Bacteria",
      "Decomposers",
      "Колония Enceladus",
      "Ants"
    ],
    "w": "В ранней игре с 2 тегами Science и целями для микробов. Хороший дешёвый тег Venus для спекуляции.",
    "e": "3 MC + 3 MC карта = 6 MC стоимость"
  },
  "GHG Factories": {
    "s": 64,
    "t": "C",
    "y": [
      "Helion",
      "Награда Thermalist",
      "Steelworks",
      "Mining Guild",
      "Бонусы температуры"
    ],
    "w": "1-3 пок со свободной энергия-прод и стратегией раша температуры. Хороший сброс стали.",
    "e": "11 MC (оплата сталью) + 3 MC карта + ~7 MC энергия-прод = ~21 MC стоимость",
    "c": "/r/TerraformingMarsGame/comments/1nvzo7b/cotd_ghg_factories_2_oct_2025/",
    "r": "Decent efficient heat prod and a nice amount of it (once every two gen temp raise). — Strijder20"
  },
  "Great Dam": {
    "s": 64,
    "t": "C",
    "y": [
      "Торговля колониями",
      "Physics Complex",
      "Mining Guild",
      "Steelworks",
      "Вэха Builder"
    ],
    "w": "Мид с 4+ океанами и потребностью в энергия-прод. Хороший слив стали с тегами и VP.",
    "e": "12 MC (оплата сталью) + 3 MC карта = 15 MC стоимость"
  },
  "Heather": {
    "s": 64,
    "t": "C",
    "y": [
      "Insects",
      "NRA",
      "Ecological Zone",
      "Viral Enhancers",
      "GMO Contract"
    ],
    "w": "Когда строишь движок на растениях и нужны дешёвые plant теги. Не приоритизируй в драфте если синергии растений не сильны.",
    "e": "6 MC + 3 MC карта = 9 MC за 1 растения-прод (~8 MC) + 1 растение (~1 MC) + Plant тег (~2 MC) = ~11 MC ц..."
  },
  "Jupiter Floating Station": {
    "s": 64,
    "t": "C",
    "y": [
      "Колония Titan",
      "Jovian Lanterns",
      "Множители Jovian",
      "Red Spot Observatory"
    ],
    "w": "Когда нужен дешёвый тег Jovian для множителей и есть 3 тега Science. Или как цель для флоатеров для колонии Titan.",
    "e": "9 MC + 3 MC карта = 12 MC за тег Jovian (~3-5 MC) + 1 VP (~5 MC) + Действие: добавить флоатер/потратить 4 фл..."
  },
  "Maxwell Base": {
    "s": 64,
    "t": "C",
    "y": [
      "Stratospheric Birds",
      "Venusian Animals",
      "Morning Star Inc",
      "Dirigibles",
      "Titan Floating Launch-pad"
    ],
    "w": "Когда есть 1VP карта животных/floater для кормления. Лейт-сброс 3 VP, если Venus высока. Сильно с комбо Strat Birds.",
    "e": "Стоимость 18+3=21 MC + 1 энергия-прод (~7"
  },
  "Power Plant": {
    "s": 64,
    "t": "C",
    "y": [
      "Трек Mars",
      "Оплата сталью",
      "Thorgate",
      "Конвертеры тепла"
    ],
    "w": "Как дешёвый triple tag для Mars track. Production mediocre но acceptable с steel.",
    "e": "16 MC всего (13+3), оплата сталью"
  },
  "Refugee Camps": {
    "s": 56,
    "t": "C",
    "y": [
      "Мощные движки MC-прод",
      "Синергии Earth тега",
      "Вэха Diversifier (уникальный ресурс)"
    ],
    "w": "Ранний мид когда есть MC-прод 5+ и осталось 4+ пок. Каждый пок = 1 VP за 1 MC. Поздно — не окупается.",
    "e": "13 MC всего (10+3) за действие 1 VP/пок (стоит -1 MC каждый раз). Чем раньше — тем больше VP."
  },
  "Self-Replicating Bacteria": {
    "s": 72,
    "t": "B",
    "y": [
      "Splice",
      "Decomposers",
      "Anti-Gravity Technology",
      "Earth Catapult",
      "Microbe-тяжёлые стратегии"
    ],
    "w": "Пок 1-4 когда планируешь играть много карт. Каждый микроб = -2 MC с карты. Поздно бесполезна.",
    "e": "7+3=10 MC за действие: +1 микроб, каждый микроб = -2 MC при игре карты. ~4 MC/пок при активной игре."
  },
  "Soil Enrichment": {
    "s": 64,
    "t": "C",
    "y": [
      "Viral Enhancers",
      "Decomposers",
      "Topsoil Contract",
      "Карты микробов с лишними ресурсами"
    ],
    "w": "В лейте, когда есть лишний микроб и нужны растения для озеленения. Хороший бесплатный draw.",
    "e": "9 MC всего (6+3) + 1 микроб = 10-12 MC всего за 5 растений (~11 MC, 5/8 озеленения)"
  },
  "Sponsors": {
    "s": 64,
    "t": "C",
    "y": [
      "Point Luna",
      "Teractor",
      "Earth Office",
      "Cartels",
      "Награда Banker"
    ],
    "w": "1-3 пок, или если тег Earth имеет сильную синергию с корпорацией/движком. Пропускать после 4-го пок.",
    "e": "6+3=9 MC за 2 MC-прод + тег Earth"
  },
  "Supported Research": {
    "s": 64,
    "t": "C",
    "y": [
      "Партия Scientists",
      "AI Central",
      "Mass Converter",
      "Olympus Conference",
      "Mars University"
    ],
    "w": "Когда Scientists правят или есть 2 делегата там. Дешёвый тег Science всегда кстати, но требование ограничивает...",
    "e": "3+3=6 MC за 2 карты (6-8 MC) + тег Science (~3-5 MC)"
  },
  "Toll Station": {
    "s": 64,
    "t": "C",
    "y": [
      "Награда Banker",
      "Противники с космическим движком",
      "Оплата титаном",
      "Phobolog",
      "Метагейм Point Luna"
    ],
    "w": "1-2 пок если у оппонентов 3+ space тега. В лейте для награды Banker. В 3P обычно карта среднего уровня.",
    "e": "12+3=15 MC (оплата титаном) за 1 MC-прод на каждый Space тег оппонента"
  },
  "Worms": {
    "s": 64,
    "t": "C",
    "y": [
      "Decomposers",
      "Tardigrades",
      "Symbiotic Fungus",
      "Вэха Ecologist",
      "NRA"
    ],
    "w": "Когда есть 2+ тега Microbe и ожидаются ещё. Отлично масштабируется в билдах с микробами. 4% O2 обычно достигается к пок ...",
    "e": "8+3=11 MC за N растения-прод, где N = теги Microbe/2 (включая этот)",
    "c": "/r/TerraformingMarsGame/comments/1nape1r/cotd_worms_7_sept_2025/",
    "r": "There are too few microbe tags in the game to make it really good. — ThainEshKelch"
  },
  "Protected Growth": {
    "s": 64,
    "t": "C",
    "y": [
      "Thorgate",
      "Стратегии энергии",
      "Nitrogen Rich Asteroid",
      "Движки Power тега"
    ],
    "w": "1-3 пок с 3+ тегами Power сыгранными или запланированными. Тег Plant имеет синергию NRA. Пропускать при менее 3 тегов Power — слишком мал...",
    "e": "2+3=5 MC за растения за каждый тег Power",
    "c": "/r/TerraformingMarsGame/comments/1plin4g/cotd_protected_growth_13_dec_2025/",
    "r": "Interesting. It's nice to have an use for power tags. — Great_GW"
  },
  "Artificial Lake": {
    "s": 63,
    "t": "C",
    "y": [
      "Награда Estate Dealer",
      "Capital",
      "Mining Guild",
      "Rego Plastics",
      "Advanced Alloys"
    ],
    "w": "Когда есть избыток стали и -6C выполнено. Хорошо для Estate Dealer на Элизиуме. Средний приоритет.",
    "e": "15+3=18 MC за 1 океан (14 MC) + 1 VP (5 MC) + тег Building (1-2 MC)"
  },
  "Crash Site Cleanup": {
    "s": 63,
    "t": "C",
    "y": [
      "События астероидов",
      "Media Group",
      "IC",
      "Вэха Legend"
    ],
    "w": "Низкий приоритет драфта, но оставляй если есть или ожидаются события убирания растений. Почти бесплатная VP.",
    "e": "4+3=7 MC за 1 VP (5 MC) + 1 титан (3 MC) или 2 сталь (4 MC)"
  },
  "Eos Chasma National Park": {
    "s": 63,
    "t": "C",
    "y": [
      "Viral Enhancers",
      "Ecological Zone",
      "Decomposers",
      "Pets",
      "Mining Guild"
    ],
    "w": "Мид-лейт со сталью, картой животных в игре и синергией растений. Неплохой слив стали для последнего поколения.",
    "e": "16 MC (оплата сталью) + 3 MC карта = 19 MC стоимость"
  },
  "Floater Prototypes": {
    "s": 63,
    "t": "C",
    "y": [
      "Aerial Mappers",
      "Floating Habs",
      "Forced Precipitation",
      "Mars University",
      "Olympus Conference"
    ],
    "w": "Когда есть сильная цель для floater и нужен дешёвый триггер тега Science. Низкий приоритет без целей.",
    "e": "2 MC + 3 MC карта = 5 MC стоимость"
  },
  "Fusion Power": {
    "s": 63,
    "t": "C",
    "y": [
      "Thorgate",
      "Energy Market",
      "Торговля колониями",
      "Physics Complex",
      "Steelworks"
    ],
    "w": "Когда уже есть 2 тега Power (обычно 2-4 пок). Отличная эффективность энергии когда требование выполнено.",
    "e": "14 MC + 3 MC карта = 17 MC стоимость"
  },
  "Io Sulphur Research": {
    "s": 63,
    "t": "C",
    "y": [
      "Множители Jovian",
      "Научный движок",
      "Venusian Animals",
      "Стратегия Venus тега"
    ],
    "w": "Когда нужны Science+Jovian теги и есть 3+ Venus тега для бонусных карт. Иначе пропускай.",
    "e": "17 MC + 3 MC карта = 20 MC за 2 VP (~10 MC) + Science+Jovian теги (~6-8 MC) + 1 карта (3 MC) или 3 ..."
  },
  "Jovian Envoys": {
    "s": 63,
    "t": "C",
    "y": [
      "Контроль председателя",
      "Партийная стратегия Turmoil",
      "Стратегия Jovian"
    ],
    "w": "При игре Jovian в играх с Turmoil и необходимости размещения делегатов. Иначе не стоит драфтить.",
    "e": "2 MC + 3 MC карта = 5 MC за 2 делегатов (SP ~10 MC)"
  },
  "Local Heat Trapping": {
    "s": 63,
    "t": "C",
    "y": [
      "Карты животных 1VP",
      "Helion",
      "Высокая прод тепла",
      "Penguins"
    ],
    "w": "Когда есть излишек тепла и 1VP карта животных. Хорош как бесплатный draw. Не драфтить рано без тепло-прод.",
    "e": "1 MC + 3 MC карта = 4 MC + 5 тепла (~6"
  },
  "Medical Lab": {
    "s": 72,
    "t": "B",
    "y": [
      "Mining Guild",
      "Robotic Workforce",
      "Interplanetary Cinematics",
      "Вэха Builder",
      "Награда Scientist"
    ],
    "w": "Когда есть 4+ тега Building и можно оплатить сталью. Хороший лейт-слив стали за VP + тег Science.",
    "e": "Стоимость 13+3=16 MC (оплата сталью)",
    "c": "/r/TerraformingMarsGame/comments/1n4qxda/cotd_medical_lab_31_aug_2025/",
    "r": "Pretty good multi-purpose card. Can give a decent amount of production, enables science payoffs, allows you to draw w... — icehawk84"
  },
  "Molecular Printing": {
    "s": 63,
    "t": "C",
    "y": [
      "Научные стратегии",
      "Mars University",
      "Olympus Conference",
      "Лейт-гейм игра"
    ],
    "w": "В лейте когда колонии и города накопились. Science тег может позволить другие розыгрыши.",
    "e": "Стоимость 11+3=14 MC"
  },
  "Public Baths": {
    "s": 63,
    "t": "C",
    "y": [
      "Корпорации стали (IC, Mining Guild)",
      "Вэха Builder",
      "Credicor (общая стоимость 20+)"
    ],
    "w": "Мид-лейт, когда размещено 6 океанов. Очень хороший бесплатный draw, неплохой поздний пик драфта для лёгкого VP.",
    "e": "9 MC всего (6+3) - 6 MC возврат = чистые 3 MC за 1 VP + тег Building",
    "c": "/r/TerraformingMarsGame/comments/1n863uz/cotd_public_baths_4_sept_2025/",
    "r": "Turn 3 steal into 6M€ for 3 M€ and you get a point. — Fredrick_18241"
  },
  "Small Animals": {
    "s": 63,
    "t": "C",
    "y": [
      "Large Convoy",
      "Ecological Zone",
      "Meat Industries",
      "Decomposers",
      "Advanced Ecosystems"
    ],
    "w": "Когда нужен тег/цель для животных и нет вариантов лучше. Играть в миде.",
    "e": "9 MC всего (6+3) за действие половинного VP животных + тег Animal"
  },
  "Urban Decomposers": {
    "s": 63,
    "t": "C",
    "y": [
      "GHG Producing Bacteria",
      "Ants",
      "Psychrophiles",
      "Sulphur-Eating Bacteria",
      "Viral Enhancers"
    ],
    "w": "Когда есть город + колония и хорошая цель для микробов. Достаточно дёшево чтобы включить в большинство био-стратегий.",
    "e": "6+3=9 MC за 1 растения-прод (8 MC) + 2 микроба на другую карту (~2-5 MC) + тег Microbe (~1-2 MC)"
  },
  "Vesta Shipyard": {
    "s": 63,
    "t": "C",
    "y": [
      "Saturn Systems",
      "Io Mining Industries",
      "Terraforming Ganymede",
      "Вэха Rim Settler",
      "Множители Jovian"
    ],
    "w": "С Jovian стратегией или Saturn Systems. Также нормально как ранний титан-прод + Jovian тег. Пропускай если нет Jovian синергии.",
    "e": "15+3=18 MC (оплата титаном) за 1 титан-прод (12"
  },
  "Venus Shuttles": {
    "s": 63,
    "t": "C",
    "y": [
      "Dirigibles",
      "Stratospheric Birds",
      "Floating Habs",
      "Aphrodite",
      "Celestic"
    ],
    "w": "При стратегии Venus с флоатерами и Dirigibles или Floating Habs. Пропускай без сильных профитов от флоатеров. Тег Venus ...",
    "e": "9+3=12 MC за действие: добавить 2 флоатера на карту Venus",
    "c": "/r/TerraformingMarsGame/comments/1o16cby/cotd_venus_shuttles_8_oct_2025/",
    "r": "Decent if you have a few Venus cards already, good bit of synergy — loudwallace"
  },
  "Energy Tapping": {
    "s": 63,
    "t": "C",
    "y": [
      "Thorgate",
      "Требования Power тега",
      "Энергозависимые стратегии"
    ],
    "w": "Когда нужен дешёвый тег Power и цель кражи энергии имеет избыток, который не может использовать. Пропускать, если цель исп...",
    "e": "3+3=6 MC за кражу 1 энергия-прод (7 MC получено тобой, ~7 MC потеряно оппонентом) - 1 VP (5 MC)",
    "c": "/r/TerraformingMarsGame/comments/1opuz5h/cotd_energy_tapping_6_nov_2025/",
    "r": "A card im often scared of,and love playing early generations. — WellDressedShorty"
  },
  "Summit Logistics": {
    "s": 63,
    "t": "C",
    "y": [
      "Партия Scientists Turmoil",
      "Колониальные стратегии",
      "Движки Building+Space"
    ],
    "w": "Когда Scientists правят или есть 2 делегата там. Лучше всего с 3+ тегами планет и колониями. Пропускать если Scientists сложно контролировать...",
    "e": "10+3=13 MC за 1 MC за тег планеты + колонию + 2 вытянутые карты (6 MC)",
    "c": "/r/TerraformingMarsGame/comments/1piyus9/cotd_summit_logistics_10_dec_2025/",
    "r": "What I find interesting about this card is that it is the only card that directly references all of the expansions (V... — Acceptable-Ease4640"
  },
  "Vermin": {
    "s": 63,
    "t": "C",
    "y": [
      "Ecological Zone",
      "Decomposers",
      "Advanced Ecosystems",
      "Viral Enhancers",
      "Стратегии без городов"
    ],
    "w": "Ради комбинации тегов Microbe+Animal, а не VP-атаки. Лучше всего с синергиями био-тегов. VP-механика — бонус если игра ...",
    "e": "8+3=11 MC за Microbe+Animal теги (4-6 MC комбо) + действие: накапливать животных",
    "c": "/r/TerraformingMarsGame/comments/1pmau22/cotd_vermin_14_dec_2025/",
    "r": "So each person with a city tile loses a VP once 10 animals are achieved? — baldsoprano"
  },
  "16 Psyche": {
    "s": 62,
    "t": "C",
    "y": [
      "Phobolog",
      "Advanced Alloys",
      "Saturn Systems",
      "Mass Converter",
      "Mercurian Alloys"
    ],
    "w": "Когда есть прод титана или Phobolog и нужен слив титана с VP. Лучше пок 1-2, пропускай после пок 3.",
    "e": "31+3=34 MC за 2 титан-прод (25 MC) + 3 титана (9 MC) + 2 VP (10 MC) = 44 MC ценности"
  },
  "Breathing Filters": {
    "s": 66,
    "t": "C",
    "y": [
      "Карты с Science req",
      "Награда Scientist",
      "Вэха Diversifier"
    ],
    "w": "Когда нужен тег Science и 7% кислорода близко. Приемлемо как лейт-сброс VP. Не высокий приоритет.",
    "e": "11+3=14 MC за 2 VP (10 MC) + тег Science (3-5 MC)"
  },
  "Building Industries": {
    "s": 62,
    "t": "C",
    "y": [
      "Mining Guild",
      "Beam From A Thorium Asteroid",
      "Mass Converter",
      "Вэха Builder",
      "Награда Contractor"
    ],
    "w": "Когда есть свободный энергия-прод и нужна сталь для карт building. 1-3 пок с прелюдией энергии.",
    "e": "6+3=9 MC + 1 энергия-прод (~7"
  },
  "Diaspora Movement": {
    "s": 62,
    "t": "C",
    "y": [
      "Ganymede Colony",
      "Множители Jovian",
      "Io Mining Industries",
      "Vesta Shipyard",
      "Вэха Rim Settler"
    ],
    "w": "Мид-лейт с 2+ Jovian тегами и Reds удобно правят или есть делегаты в запасе.",
    "e": "7 MC + 3 MC карта = 10 MC стоимость"
  },
  "Floater Technology": {
    "s": 68,
    "t": "C",
    "y": [
      "Aerial Mappers",
      "Floating Habs",
      "Forced Precipitation",
      "Deuterium Export",
      "Titan Floating Launchpad"
    ],
    "w": "Пок 1-4 с хотя бы одной картой флоатеров в игре. Хороший дешёвый тег Science для требований Warp Drive или Anti-Gravity.",
    "e": "7 MC + 3 MC карта = 10 MC стоимость"
  },
  "Fuel Factory": {
    "s": 62,
    "t": "C",
    "y": [
      "Advanced Alloys",
      "Phobolog",
      "Mercurian Alloys",
      "Thorgate",
      "Asteroid Mining Consortium"
    ],
    "w": "1-2 пок со свободной энергия-прод от прелюдий/корпорации. Пропускать, если нужно сначала покупать SP Power Plant.",
    "e": "6 MC (оплата сталью) + 3 MC карта + ~7 MC энергия-прод = ~16 MC стоимость"
  },
  "Herbivores": {
    "s": 70,
    "t": "B",
    "y": [
      "Protected Habitats",
      "Ecological Zone",
      "Viral Enhancers",
      "Arklight"
    ],
    "w": "Когда нужен тег Animal и не можешь найти Birds/Fish/Livestock. Лучше в метах с большим количеством растений, где много озеленений...",
    "e": "12 MC + 3 MC карта = 15 MC"
  },
  "Inventors' Guild": {
    "s": 62,
    "t": "C",
    "y": [
      "Mars University",
      "AI Central",
      "Terralabs",
      "Valley Trust"
    ],
    "w": "2-3 пок при построении science движка и игра идёт на 9+ пок. Пропускай в коротких 8-пок играх если не нужен Science...",
    "e": "9 MC + 3 MC карта = 12 MC за Science тег + повторяемый draw карт (3 MC за оставленную карту)"
  },
  "Lake Marineris": {
    "s": 62,
    "t": "C",
    "y": [
      "Стратегия теплового раша",
      "Special Design",
      "Inventrix",
      "Arctic Algae"
    ],
    "w": "Спекулируй в стартовой руке, если планируешь пушить температуру. Драфти в миде, только если океаны остаются при темп около 0C.",
    "e": "18 MC + 3 MC карта = 21 MC"
  },
  "Lichen": {
    "s": 62,
    "t": "C",
    "y": [
      "NRA",
      "Insects",
      "Ecological Zone",
      "Viral Enhancers",
      "Вэха Ecologist"
    ],
    "w": "При построении стратегии растений и нужны дешёвые теги Plant. Приоритет драфта растёт с NRA/Insects в руке.",
    "e": "7 MC + 3 MC карта = 10 MC за 1 растения-прод (~8 MC) + тег Plant (~2 MC)"
  },
  "Lightning Harvest": {
    "s": 62,
    "t": "C",
    "y": [
      "AI Central",
      "Научный движок",
      "Торговля колониями",
      "Вэха Energizer"
    ],
    "w": "Когда есть 3+ тега Science и нужен энергия-прод. Хорошая побочная ценность, не определяющий стратегию выбор.",
    "e": "8 MC + 3 MC карта = 11 MC за 1 энергия-прод (~7"
  },
  "Lunar Beam": {
    "s": 62,
    "t": "C",
    "y": [
      "Teractor",
      "Earth Office",
      "Thorgate",
      "Cartel",
      "Торговля колониями"
    ],
    "w": "1-2 пок при раше тепла И нужна энергия для колоний/других карт. Лучше со скидками Earth тега.",
    "e": "13 MC + 3 MC карта + 10 MC (-2 MC-прод) = ~26 MC фактическая стоимость"
  },
  "Magnetic Shield": {
    "s": 62,
    "t": "C",
    "y": [
      "Phobolog",
      "Mass Converter",
      "Thorgate",
      "Quantum Extractor",
      "Nuclear Power"
    ],
    "w": "Когда уже есть 2 тега Power и титан для траты. Слив титана в лейте при выполненных требованиях.",
    "e": "Стоимость 24+3=27 MC (оплата титаном)"
  },
  "Moss": {
    "s": 62,
    "t": "C",
    "y": [
      "Nitrogen-Rich Asteroid",
      "Insects",
      "Viral Enhancers",
      "Ecological Zone",
      "NRA"
    ],
    "w": "2-4 пок, когда 3 океана размещены и нужна растения-прод или дешёвый тег Plant.",
    "e": "Стоимость 4+3=7 MC - 1 растение (~2)"
  },
  "Nuclear Power": {
    "s": 62,
    "t": "C",
    "y": [
      "Колонии (торговля)",
      "Strip Mine",
      "AI Central",
      "Physics Complex",
      "Ironworks/Steelworks"
    ],
    "w": "Когда конкретно нужно 3 энергия-прод. С Colonies хорошо в стартовой руке. Без конкретной потребности в энергии...",
    "e": "Стоимость 10+3=13 MC (оплата сталью) + 2 MC-прод потеряно (10)"
  },
  "Permafrost Extraction": {
    "s": 62,
    "t": "C",
    "y": [
      "Interplanetary Cinematics",
      "Media Group",
      "Arctic Algae",
      "Lakefront Resorts",
      "Inventrix"
    ],
    "w": "Когда температура около -8C и остались океаны. Не спекулируй рано. Хорош как мид бесплатный draw.",
    "e": "Стоимость 8+3=11 MC"
  },
  "Rad-Chem Factory": {
    "s": 72,
    "t": "B",
    "y": [
      "Корпорации стали",
      "Избыток прод энергии",
      "Вэха Terraformer",
      "Колонии (лишняя энергия)"
    ],
    "w": "В лейте при избытке производства энергии и стали. Не стоит драфтить рано.",
    "e": "11 MC всего (8+3) + 1 энергия прод (~7"
  },
  "Rego Plastics": {
    "s": 62,
    "t": "C",
    "y": [
      "IC (20 стали)",
      "Mining Guild",
      "Прелюдии прод стали",
      "Колония Ceres",
      "Стратегии Building"
    ],
    "w": "Когда есть 2+ сталь-прод и много карт Building для игры. В лейте это просто 1 VP.",
    "e": "13 MC всего (10+3) за сталь +1 к ценности + 1 VP + тег Building"
  },
  "Shuttles": {
    "s": 62,
    "t": "C",
    "y": [
      "Тяжёлый космический движок",
      "Mass Converter/Quantum Extractor",
      "Phobolog"
    ],
    "w": "Мид для строителей космического движка с избытком энергии. Не карта высокого приоритета.",
    "e": "13 MC всего (10+3) + 1 энергия-прод (~7"
  },
  "Small Asteroid": {
    "s": 62,
    "t": "C",
    "y": [
      "Optimal Aerobraking",
      "IC/Media Group",
      "Скидки Space",
      "Бонусы температуры"
    ],
    "w": "Когда нужен температурный TR и есть титан или скидки на space. Неплохой филлер.",
    "e": "13 MC всего (10+3) за 1 температурный TR (~7-7"
  },
  "Solarnet": {
    "s": 62,
    "t": "C",
    "y": [
      "Мультитеговые стратегии",
      "Вэха Diversifier",
      "Награда Forecaster"
    ],
    "w": "Только когда уже выполнены требования Venus+Earth+Jovian. Не стоит форсить.",
    "e": "10 MC всего (7+3) за 2 карты (~8 MC) + 1 VP (~5 MC)"
  },
  "Subterranean Reservoir": {
    "s": 62,
    "t": "C",
    "y": [
      "Arctic Algae",
      "Lakefront Resorts",
      "Скидка IC",
      "Media Group",
      "Вэха Legend"
    ],
    "w": "Когда нужен океан и есть MC, но нет вариантов лучше. Хорош для комбо ocean-walking.",
    "e": "11+3=14 MC за 1 океан (1 TR = 7 MC + бонус размещения ~2-4 MC)"
  },
  "Venus Governor": {
    "s": 62,
    "t": "C",
    "y": [
      "Morning Star Inc",
      "Venus Waystation",
      "Награда Venuphile",
      "Gyropolis",
      "Sulphur Exports"
    ],
    "w": "1-2 пок если уже есть 2 тега Venus. Закрепляет Venuphile. Со скидками это фактически бесплатная ценность.",
    "e": "4+3=7 MC за 2 MC-прод (10-12 MC) + 2 тега Venus (~4-5 MC)"
  },
  "Venus Trade Hub": {
    "s": 62,
    "t": "C",
    "y": [
      "Торговля колониями",
      "Morning Star Inc",
      "Venus Waystation",
      "Награда Venuphile",
      "Титан"
    ],
    "w": "При комбинации Venus + Colonies и есть 2+ Venus тега. Оплата титаном делает доступным.",
    "e": "12+3=15 MC (оплата титаном) за эффект (вероятно торговый бонус) + 1 VP + Venus+Space теги",
    "c": "/r/TerraformingMarsGame/comments/1nq2qpi/cotd_venus_trade_hub_25_sept_2025/",
    "r": "Good card that can be very powerful if you have more than one trade fleet and the spare energy/titanium. — Fredrick_18241"
  },
  "Casinos": {
    "s": 62,
    "t": "C",
    "y": [
      "Manutech",
      "Thorgate",
      "Корпорации размещения городов",
      "Прод стали"
    ],
    "w": "Пок 2-3 с уже размещённым городом и доступным энергия-прод. Оплата сталью через тег Building. Пропускай без города или если пок...",
    "e": "5+3=8 MC + энергия-прод (~7 MC) = 15 MC фактически",
    "c": "/r/TerraformingMarsGame/comments/1ppn5bg/cotd_casinos_18_dec_2025/",
    "r": "I feel like this card is a real *gamble* to pick — UziiLVD"
  },
  "Corporate Stronghold": {
    "s": 62,
    "t": "C",
    "y": [
      "Mining Guild",
      "Manutech",
      "Вэха Mayor",
      "Прод стали",
      "Ранняя экономика"
    ],
    "w": "1-2 пок как дешевейший город + сброс MC-прод. Приоритет оплаты сталью. Принять размен -2 VP ради ранней экономики. Пропускать на 4+ пок или...",
    "e": "11+3=14 MC + энергия-прод (~7 MC) = 21 MC фактически",
    "c": "/r/TerraformingMarsGame/comments/1o9sgjk/cotd_corporate_stronghold_18_oct_2025/",
    "r": "Much better on Hellas where cheap city tags are at a premium, which is something to keep in mind for the current Aren... — icehawk84"
  },
  "Floating Refinery": {
    "s": 62,
    "t": "C",
    "y": [
      "Floating Habs",
      "Dirigibles",
      "Celestic",
      "Aphrodite",
      "Stratospheric Birds"
    ],
    "w": "При стратегии Venus-флоатеров с 2+ тегами Venus и целями для флоатеров. Пропускать без Floating Habs или Diri...",
    "e": "7+3=10 MC за действие: добавить 1 флоатер за тег Venus",
    "c": "/r/TerraformingMarsGame/comments/1olleqi/cotd_floating_refinery_1_nov_2025/",
    "r": "Can be very good with the right engine going. Also, it gives a use for to floaters still left on cards that raise the... — Fredrick_18241"
  },
  "Media Archives": {
    "s": 61,
    "t": "C",
    "y": [
      "Point Luna",
      "Teractor",
      "Earth Office",
      "Стратегии событий"
    ],
    "w": "Мид-лейт когда ~15+ событий было сыграно. Не спекулируй на ней рано если денег не в избытке.",
    "e": "Стоимость 8+3=11 MC"
  },
  "Spin-Inducing Asteroid": {
    "s": 61,
    "t": "C",
    "y": [
      "Стратегия Venus",
      "Прод титана"
    ],
    "w": "Venus + титан.",
    "e": "2 Venus TR за 19 MC",
    "c": "/r/TerraformingMarsGame/comments/1o0bhob/cotd_spininducing_asteroid_7_oct_2025/",
    "r": "It's not the worst card if you have Venus payoffs, but there aren't that many of them. — icehawk84"
  },
  "Symbiotic Fungus": {
    "s": 61,
    "t": "C",
    "y": [
      "Ants",
      "GHG Producing Bacteria",
      "Decomposers",
      "Regolith Eaters",
      "Sulphur-Eating Bacteria"
    ],
    "w": "Когда есть VP-карта микробов для кормления. Драфтить спекулятивно даже без — достаточно дёшево, чтобы рискнуть найти цел...",
    "e": "4+3=7 MC за действие: добавить 1 микроба на любую карту"
  },
  "Weather Balloons": {
    "s": 61,
    "t": "C",
    "y": [
      "Mars University",
      "Olympus Conference",
      "Требования Science тега",
      "Floating Habs"
    ],
    "w": "Когда нужен тег Science и draw карты + действие с флоатером добавляют маргинальную ценность. Пропускать без синергий тега Science...",
    "e": "11+3=14 MC за тег Science (3-5 MC) + draw 1 карты (3 MC) + действие: добавить флоатер",
    "c": "/r/TerraformingMarsGame/comments/1posw2z/cotd_weather_balloons_17_dec_2025/",
    "r": "I like this. It is a good mid range cost science tag. — The-University"
  },
  "Advertising": {
    "s": 60,
    "t": "C",
    "y": [
      "Credicor",
      "Point Luna",
      "Teractor",
      "Earth Office",
      "Luna Metropolis"
    ],
    "w": "1 пок с 2+ дорогими картами в руке и/или Point Luna/Credicor. Иначе просто дешёвый Earth тег.",
    "e": "4+3=7 MC за Earth тег (2-3 MC) + эффект"
  },
  "Beam From A Thorium Asteroid": {
    "s": 60,
    "t": "C",
    "y": [
      "Saturn Systems",
      "Колонии (торговля)",
      "Phobolog",
      "Вэхи Hellas",
      "Множители Jovian"
    ],
    "w": "Пок 1-3 с Saturn Systems или прелюдией Jovian + титаном. Отлично с Колониями для энергии. Пропускай без тега Jovian.",
    "e": "32+3=35 MC за 3 тепло-прод (12 MC) + 3 энергия-прод (22"
  },
  "Deuterium Export": {
    "s": 60,
    "t": "C",
    "y": [
      "Celestic",
      "Stormcraft",
      "Колония Titan",
      "Floater Technology",
      "Dirigibles"
    ],
    "w": "С корпорациями, генерирующими floater, или когда нужен тройной тег для Diversifier. Иначе низкий приоритет.",
    "e": "11 MC + 3 MC карта = 14 MC стоимость"
  },
  "GHG Import From Venus": {
    "s": 60,
    "t": "C",
    "y": [
      "Phobolog",
      "Aphrodite",
      "Terraforming Deal",
      "Helion",
      "Награда Thermalist"
    ],
    "w": "Ранняя игра с титаном для траты и синергиями TR Венеры. Пропускать если нет выгоды от Венеры.",
    "e": "23 MC (оплата титаном) + 3 MC карта = 26 MC стоимость"
  },
  "Hi-Tech Lab": {
    "s": 60,
    "t": "C",
    "y": [
      "Колония Callisto",
      "Energy Market",
      "Mars University",
      "AI Central"
    ],
    "w": "Когда есть сильное производство энергии и нужна фильтрация карт. Элемент поддержки science движка. Пропускай в большинстве ситуаций.",
    "e": "17 MC + 3 MC карта = 20 MC",
    "c": "/r/TerraformingMarsGame/comments/1orlrju/cotd_hitech_lab_but_a_corp_8_nov_2025/",
    "r": "Can trick you into thinking spending 18 energy to look at 18 cards and pick one is a solid game plan. — SoupsBane"
  },
  "Immigrant City": {
    "s": 65,
    "t": "C",
    "y": [
      "Tharsis Republic",
      "Rover Construction",
      "Standard Technology"
    ],
    "w": "В лейте как дешёвый тайл города и слив стали. НЕ играй рано в 3P, несмотря на соблазн.",
    "e": "13 MC + 3 MC карта + 7",
    "c": "/r/TerraformingMarsGame/comments/1n9w06h/cotd_immigrant_city_6_sept_2025/",
    "r": "In 2P at least, it’s better to think of this as a cheap city tile (that may be better late game) than a source of ext... — nageyoyo"
  },
  "Import of Advanced GHG": {
    "s": 60,
    "t": "C",
    "y": [
      "Optimal Aerobraking",
      "Media Group",
      "IC",
      "Earth Office",
      "Teractor"
    ],
    "w": "1-2 пок при стратегии терраформинга теплом и инфраструктуре скидок. С Optimal Aerobraking — отлично.",
    "e": "9 MC + 3 MC карта = 12 MC за 2 тепло-прод (~8 MC на 1-м пок)"
  },
  "Industrial Center": {
    "s": 60,
    "t": "C",
    "y": [
      "Вэха Builder",
      "Mining Guild",
      "Награда Landlord"
    ],
    "w": "Когда хорошие бонусы размещения доступны рядом с городами, или нужен тег Building для вехи. Не рассчитывать на действие.",
    "e": "4 MC + 3 MC карта = 7 MC"
  },
  "Martian Survey": {
    "s": 60,
    "t": "C",
    "y": [
      "Interplanetary Cinematics",
      "Media Group",
      "Valley Trust",
      "Mars University",
      "Olympus Conference"
    ],
    "w": "Когда есть скидки на события/science. Также хорош для майлстоуна Legend. Не спекулируй если O2 может рано подскочить.",
    "e": "Стоимость 9+3=12 MC"
  },
  "Minority Refuge": {
    "s": 60,
    "t": "C",
    "y": [
      "Poseidon",
      "Phobolog",
      "Колония Europa",
      "Колония Miranda",
      "Скидки Space тега"
    ],
    "w": "В лейте для бонусов размещения колонии, когда -2 MC-прод неважны. В ранней игре только при захвате критического места колонии...",
    "e": "Стоимость 5+3=8 MC + 2 MC-прод потеряно (10)"
  },
  "Mohole Lake": {
    "s": 60,
    "t": "C",
    "y": [
      "GHG Producing Bacteria",
      "Venusian Animals",
      "Fish",
      "Mining Guild",
      "Колония Ceres"
    ],
    "w": "При избытке стали И наличии цели для микробов/животных для действия. Не играть только ради терраформинга.",
    "e": "Стоимость 31+3=34 MC (оплата сталью)"
  },
  "Omnicourt": {
    "s": 60,
    "t": "C",
    "y": [
      "Стратегии стали",
      "Mining Guild",
      "Вэха Builder",
      "Вэха Terraformer"
    ],
    "w": "Когда естественно есть теги Venus+Earth+Jovian и избыток стали. Лейт-слив стали за TR.",
    "e": "Стоимость 11+3=14 MC (оплата сталью)"
  },
  "Political Alliance": {
    "s": 60,
    "t": "C",
    "y": [
      "Media Group",
      "Interplanetary Cinematics",
      "Вэха Legend",
      "Стратегии влияния Turmoil"
    ],
    "w": "Когда есть 2 лидера партий и нужен дешёвый TR. Хорош для майлстоуна Legend. Низкий приоритет в драфте.",
    "e": "Стоимость 4+3=7 MC"
  },
  "Power Supply Consortium": {
    "s": 60,
    "t": "C",
    "y": [
      "Thorgate",
      "Карты Wild тегов",
      "Прелюдии Power тега",
      "Колонии (блокировка торговой энергии)"
    ],
    "w": "Когда уже есть 2 тега Power и можно нарушить планы оппонента. Менее полезно в 3P, чем в 2P.",
    "e": "8 MC всего (5+3) за 1 энергия прод"
  },
  "Red Appeasement": {
    "s": 60,
    "t": "C",
    "y": [
      "Политическая стратегия Reds",
      "Pristar",
      "Движковые билдеры с низким TR",
      "Media Group"
    ],
    "w": "Когда Reds у власти и ты ходишь первым. Очень нишевая, но мощная при совпадении условий.",
    "e": "3 MC всего (0+3) за 2 MC-прод (~10-12 MC рано)"
  },
  "Solar Probe": {
    "s": 60,
    "t": "C",
    "y": [
      "Mass Converter/Warp Drive (скидки Space)",
      "Mars University",
      "Optimal Aerobraking",
      "Тяжёлый научный движок"
    ],
    "w": "Лейт с 5+ тегами Science и скидками на Space. Не стоит форсировать.",
    "e": "12 MC всего (9+3) за X карт (1 за 3 тега Science включая этот) + 1 VP + теги Space+Science событие..."
  },
  "Soletta": {
    "s": 60,
    "t": "C",
    "y": [
      "Phobolog (оплата титаном)",
      "Advanced Alloys",
      "Helion",
      "Insulation (конвертация в MC-прод)",
      "Thermalist"
    ],
    "w": "Только 1 пок с титаном для оплаты. Обязывает к стратегии раша. Иначе пропускай.",
    "e": "38 MC всего (35+3) за 7 тепло-прод (~42 MC в 1 пок)"
  },
  "Sponsored Mohole": {
    "s": 60,
    "t": "C",
    "y": [
      "Политическая стратегия Kelvinists",
      "Стратегия тепла/раша",
      "Вэха Builder",
      "Колонии (энергия Kelvinists)"
    ],
    "w": "Когда Kelvinists уже у власти или ты всё равно хочешь их к власти. Не форси Kelvinists только ради этого.",
    "e": "8 MC всего (5+3) за 2 тепло прод (~8-12 MC)",
    "c": "/r/TerraformingMarsGame/comments/1np87wp/cotd_sponsored_mohole_24_sept_2025/",
    "r": "Extremely rare card that actually prices heat prod reasonably. — SoupsBane"
  },
  "Venus Allies": {
    "s": 60,
    "t": "C",
    "y": [
      "2+ колоний",
      "Титан для оплаты",
      "Venus req карты",
      "Награда Venuphile",
      "Aphrodite"
    ],
    "w": "Лейт с 2+ колониями и титаном для оплаты. Лучше в Venus-тяжёлых играх. Пропускать без колоний.",
    "e": "30+3=33 MC (оплата титаном) за 2 Venus TR (18 MC) + 4 MC за колонию + 2 VP (10 MC) + теги Venus+Space...",
    "c": "/r/TerraformingMarsGame/comments/1nwv1xb/cotd_venus_allies_3_oct_2025/",
    "r": "Если есть деньги и колонии — дешёвые VP и TR. — Blackgaze"
  },
  "Corroder Suits": {
    "s": 59,
    "t": "C",
    "y": [
      "Награда Venuphile",
      "Venusian Animals",
      "Stratospheric Birds",
      "Venus Waystation",
      "Вэха Diversifier"
    ],
    "w": "1-2 пок для MC-прод если тег Venus помогает с наградой/вехой. Лейт если есть 1-VP Venus животное.",
    "e": "8+3=11 MC за 2 MC-прод (10 MC) + тег Venus (2-3 MC) + 1 ресурс Venus (~1-5 MC в зависимости от цели..."
  },
  "Pets": {
    "s": 59,
    "t": "C",
    "y": [
      "Meat Industry",
      "Tharsis Republic",
      "Viral Enhancers",
      "Arklight",
      "Ecological Zone"
    ],
    "w": "Когда ожидаешь 6+ городов и можешь сыграть в 1-2 пок. С Meat Industry становится гораздо лучше. Иначе низкий приоритет.",
    "e": "Стоимость 10+3=13 MC"
  },
  "Aqueduct Systems": {
    "s": 58,
    "t": "C",
    "y": [
      "Mining Guild",
      "Прелюдия Early Settlement",
      "Capital",
      "Колония Steel"
    ],
    "w": "Только когда город уже стоит рядом с океаном и есть сталь для траты. Не строй стратегию вокруг этой карты.",
    "e": "9+3=12 MC (в стали) за 3 карты Building (9-12 MC) + 1 VP (5 MC) + тег Building (1-2 MC)",
    "c": "/r/TerraformingMarsGame/comments/1ndaezs/cotd_aqueduct_systems_10_sept_2025/",
    "r": "Kind of niche since you typically don't want to place cities adjacent to oceans and don't want to build a city just t... — icehawk84"
  },
  "Bio Printing Facility": {
    "s": 58,
    "t": "C",
    "y": [
      "Birds",
      "Fish",
      "Livestock",
      "Mass Converter",
      "Quantum Extractor"
    ],
    "w": "Когда есть 2+ избытка энергия-прод И 1-VP карта животных. Иначе низкий приоритет.",
    "e": "7+3=10 MC за тег Building (1-2 MC) + действие: 2 энергии -> 2 растения или 1 животное"
  },
  "Deep Well Heating": {
    "s": 58,
    "t": "C",
    "y": [
      "Mining Guild",
      "Thorgate",
      "Fusion Power",
      "Standard Technology",
      "Steelworks"
    ],
    "w": "Когда есть сталь для слива и нужен и энергия-прод и продвижение температуры. Хорошо рано с ресурсами стали...",
    "e": "13 MC (оплата сталью) + 3 MC карта = 16 MC стоимость"
  },
  "Floating Habs": {
    "s": 76,
    "t": "B",
    "y": [
      "Колония Titan",
      "Dirigibles",
      "Aerial Mappers",
      "Floater Technology",
      "Celestic",
      "Вэха Hoverlord"
    ],
    "w": "Сильный VP accumulator — 1 VP/2 floaters, дешёвый (5 MC), action добавляет floaters. С Aerial Mappers/Dirigibles = 10+ VP за игру. Берём рано.",
    "e": "5+3=8 MC → 5-10+ VP при 2+ floater sources. Один из лучших VP accumulators."
  },
  "Fueled Generators": {
    "s": 58,
    "t": "C",
    "y": [
      "Торговля колониями",
      "GHG Factories",
      "Требование Fusion Power",
      "Вэха Builder",
      "Карты городов"
    ],
    "w": "Пок 1-2, когда срочно нужно производство энергии для другой карты и нет лучшего источника энергии.",
    "e": "1 MC + 3 MC карта = 4 MC стоимость"
  },
  "Gyropolis": {
    "s": 58,
    "t": "C",
    "y": [
      "Robotic Workforce",
      "Point Luna",
      "Teractor",
      "Earth Office",
      "Advanced Alloys"
    ],
    "w": "Мид-лейт сброс стали при 5+ тегах Earth/Venus и избытке энергия-прод. Хорош для снайпа награды Banker.",
    "e": "20 MC + 14 MC (2 энергия-прод) + 3 MC карта = ~37 MC всего"
  },
  "Imported GHG": {
    "s": 58,
    "t": "C",
    "y": [
      "Optimal Aerobraking",
      "Media Group",
      "IC",
      "Earth Office",
      "Point Luna"
    ],
    "w": "Когда есть 2+ активных карты скидки/возврата. С Optimal Aerobraking почти всегда играть. Без скидок это...",
    "e": "7 MC + 3 MC карта = 10 MC за 1 тепло-прод (~4-6 MC) + 3 тепла (~3"
  },
  "Mineral Deposit": {
    "s": 58,
    "t": "C",
    "y": [
      "Interplanetary Cinematics",
      "Media Group",
      "Advanced Alloys",
      "Rego Plastics",
      "Electro Catapult"
    ],
    "w": "Когда есть возврат событий или нужна сталь для конкретных розыгрышей. Низкий приоритет драфта. Хорош как бесплатный draw.",
    "e": "Стоимость 5+3=8 MC"
  },
  "New Holland": {
    "s": 58,
    "t": "C",
    "y": [
      "Tharsis Republic",
      "Вэха Mayor",
      "Стратегии городов",
      "Capital"
    ],
    "w": "Только когда 4+ города на Марсе И остаются хорошие места для океанов рядом с городом. Очень редкий сценарий.",
    "e": "Стоимость 20+3=23 MC (оплата сталью)"
  },
  "Nitrogen from Titan": {
    "s": 58,
    "t": "C",
    "y": [
      "Множители Jovian",
      "Titan Floating Launch-pad",
      "Phobolog",
      "Jovian Lanterns",
      "Скидки Space тега"
    ],
    "w": "Лейт с множителями Jovian и титаном на трату. Низкий приоритет без конкретной синергии.",
    "e": "Стоимость 25+3=28 MC (оплата титаном)"
  },
  "PR Office": {
    "s": 58,
    "t": "C",
    "y": [
      "Teractor",
      "Point Luna",
      "Earth Office",
      "Стратегии Earth тега",
      "Партия Unity"
    ],
    "w": "С 3+ тегами Earth когда Unity правит. Иначе пропускать.",
    "e": "Стоимость 7+3=10 MC"
  },
  "Recruitment": {
    "s": 58,
    "t": "C",
    "y": [
      "Стратегии Turmoil",
      "IC/Media Group (скидки событий)",
      "Карты зависимые от председателя"
    ],
    "w": "Когда Turmoil в игре и нужно оспорить лидерство в партии. Держи для оптимального тайминга.",
    "e": "5 MC всего (2+3) за замену нейтрального делегата на своего"
  },
  "Satellites": {
    "s": 52,
    "t": "D",
    "y": [
      "Phobolog",
      "Стратегии Space тега",
      "Награда Banker",
      "Saturn Systems"
    ],
    "w": "Когда сыграны 3+ не-событийных тега Space. Может качнуть награду Banker. Иначе пропускай.",
    "e": "13 MC всего (10+3) за X MC-прод (1 за тег Space включая этот)"
  },
  "Trans-Neptune Probe": {
    "s": 58,
    "t": "C",
    "y": [
      "Anti-Gravity Technology",
      "AI Central",
      "Mass Converter",
      "Mars University",
      "Сброс титана"
    ],
    "w": "Когда нужен тег Science для требований и есть титан на трату. Лейт-сброс VP. Не приоритетный пик.",
    "e": "6+3=9 MC (оплата титаном) за 1 VP (5 MC) + теги Science+Space (~5-7 MC)"
  },
  "Tropical Resort": {
    "s": 58,
    "t": "C",
    "y": [
      "Награда Banker",
      "Сброс стали",
      "Температура на максимуме",
      "Helion",
      "Вэха Builder"
    ],
    "w": "Последнее пок или предпоследнее когда температура на максимуме и есть тепло-прод для жертвы. Оплата сталью удешевляет...",
    "e": "13+3=16 MC (оплата сталью) за -2 тепло-прод + 3 MC-прод + 2 VP"
  },
  "Water Import From Europa": {
    "s": 67,
    "t": "C",
    "y": [
      "Saturn Systems",
      "Io Mining Industries",
      "Terraforming Ganymede",
      "Phobolog",
      "Lakefront Resorts"
    ],
    "w": "В Jovian стратегии ради множительных VP. Хейт-драфт против Jovian игроков. Действие океана — бонус. Оплата титаном — ключ.",
    "e": "25+3=28 MC (оплата титаном) за действие: заплатить 12 MC (титан ОК) за 1 океан + 1 VP на Jovian тег"
  },
  "Martian Lumber Corp": {
    "s": 58,
    "t": "C",
    "y": [
      "Nitrogen Rich Asteroid",
      "Insects",
      "Стратегии Building",
      "Движки растительной прод"
    ],
    "w": "Для комбо тегов Building+Plant, активирующего NRA. Игнорируй эффект в большинстве случаев — это ловушка. Лучше пок 3-4 с 2 озеленениями...",
    "e": "6+3=9 MC за 1 растения-прод (8 MC пок 1) + теги Building+Plant (3-4 MC) + эффект: растения как 3 MC для...",
    "c": "/r/TerraformingMarsGame/comments/1oc9cvk/cotd_martian_lumber_corp_21_oct_2025/",
    "r": "The plant prod and tags make it decent, though the requirement makes it tough to get out early. — SoupsBane"
  },
  "Airliners": {
    "s": 58,
    "t": "C",
    "y": [
      "Dirigibles",
      "Aerial Mappers",
      "Floating Habs",
      "Celestic",
      "Стратегии флоатеров"
    ],
    "w": "Только с активным floater-движком, дающим 3+ floater. MC-прод + VP — неплохая отдача, но нет тегов и требование...",
    "e": "11+3=14 MC за 2 MC-прод (10-12 MC на 1-м пок) + 2 floater (2-4 MC) + 1 VP (5 MC)",
    "c": "/r/TerraformingMarsGame/comments/1p084d9/cotd_airliners_18_nov_2025/",
    "r": "IF you have a good target card for the floaters, and IF you meet the 3 floater requirement, AND you can play this car... — benbever"
  },
  "ArchaeBacteria": {
    "s": 57,
    "t": "C",
    "y": [
      "Nitrogen Rich Asteroid (нужен Plant тег вместо)",
      "Decomposers",
      "Advanced Ecosystems",
      "Worms",
      "Ecological Zone"
    ],
    "w": "Только 1 пок, когда нужен дешёвый растения-прод и нет лучших вариантов. Тег Microbe менее полезен чем Plant...",
    "e": "6+3=9 MC за 1 растения-прод (8 MC в 1 пок)"
  },
  "Artificial Photosynthesis": {
    "s": 57,
    "t": "C",
    "y": [
      "Карты с Science req",
      "Колонии (энергия для торговли)",
      "AI Central",
      "Mass Converter"
    ],
    "w": "Когда нужен Science тег И 2 энергия-прод. Иначе найди более дешёвую энергию или лучшие Science теги.",
    "e": "12+3=15 MC за Science тег (3-5 MC) + 2 энергия-прод (15 MC) или 1 растения-прод (8 MC)"
  },
  "Giant Space Mirror": {
    "s": 57,
    "t": "C",
    "y": [
      "Phobolog",
      "Energy Market",
      "Торговля колониями",
      "Physics Complex",
      "Equatorial Magnetizer"
    ],
    "w": "Пок 1-2 с титаном для оплаты и немедленной нуждой в 3 энергии (Колонии, несколько карт, зависящих от энергии).",
    "e": "17 MC + 3 MC карта = 20 MC стоимость",
    "c": "/r/TerraformingMarsGame/comments/1nu95mq/cotd_giant_space_mirror_30_sept_2025/",
    "r": "Fine card. Saves you a lot of money if you need the power. — ThainEshKelch"
  },
  "Grass": {
    "s": 57,
    "t": "C",
    "y": [
      "Ecoline",
      "Insects",
      "Viral Enhancers",
      "NRA",
      "Ecological Zone"
    ],
    "w": "1-3 пок с синергией растений и путём к раннему озеленению. Не стоит держать для лейта.",
    "e": "11 MC + 3 MC карта = 14 MC стоимость"
  },
  "SF Memorial": {
    "s": 57,
    "t": "C",
    "y": [
      "Прод стали/излишки",
      "Вэха Builder",
      "Движки вытягивания карт"
    ],
    "w": "Лейт-слив стали за 1 VP. Не стоит драфтить рано если нет острой нужды в тегах Building.",
    "e": "10 MC всего (7+3) за 1 карту (~4 MC) + 1 VP (~5 MC) + тег Building (~1 MC)"
  },
  "Wave Power": {
    "s": 57,
    "t": "C",
    "y": [
      "Торговля колониями",
      "Thorgate (скидка)",
      "Protected Habitats",
      "Потребности в энергии",
      "Вэха Builder"
    ],
    "w": "Когда нужно производство энергии и 3 океана размещены. Нормальный филлер. Лучше с Colonies.",
    "e": "8+3=11 MC за 1 энергия-прод (7"
  },
  "Supermarkets": {
    "s": 50,
    "t": "D",
    "y": [
      "Стратегии размещения городов",
      "Вэха Mayor",
      "Движки MC-прод"
    ],
    "w": "Только когда 2 города уже размещены и нужен MC-прод. Строго хуже Acquired Company. Пропускай, если есть лучшие варианты MC-прод ...",
    "e": "9+3=12 MC за 2 MC-прод (10-12 MC пок 1) + 1 VP (5 MC)",
    "c": "/r/TerraformingMarsGame/comments/1pkof0r/cotd_supermarkets_12_dec_2025/",
    "r": "Somehow they made a worse rad suits. It's no longer as cheap of a point in the late game. — ThreadPacifist"
  },
  "Ants": {
    "s": 72,
    "t": "B",
    "y": [
      "Extreme-Cold Fungus",
      "Колония Enceladus",
      "Bactoviral Research",
      "Imported Nitrogen",
      "Symbiotic Fungus"
    ],
    "w": "Когда есть синергия микробов (Enceladus, Extreme-Cold Fungus) или у оппонентов уязвимые карты микробов. Средний приоритет.",
    "e": "9+3=12 MC за тег Microbe + действие: 1/2 VP за микроба"
  },
  "Cloud Tourism": {
    "s": 62,
    "t": "C",
    "y": [
      "Venus Waystation",
      "Point Luna",
      "Earth Office",
      "Вэха Hoverlord",
      "Награда Venuphile"
    ],
    "w": "Когда есть 2+ тега Earth И 2+ тега Venus. Очень нишевая. Пропускать без инвестиций в двойные теги.",
    "e": "11+3=14 MC за тег Venus (2-3 MC) + MC-прод за каждую пару Earth/Venus",
    "c": "/r/TerraformingMarsGame/comments/1pc52v0/cotd_cloud_tourism_2_dec_2025/",
    "r": "Okay card, not strong. Chances of you having many Earth tags AND many Venus tags will be low in most games, short of ... — ThainEshKelch"
  },
  "Community Services": {
    "s": 56,
    "t": "C",
    "y": [
      "Корпорация Sagitta",
      "Caretaker Contract",
      "Indentured Workers",
      "Карты без тегов"
    ],
    "w": "Когда уже есть 3+ карты без тегов. Не стоит строить стратегию вокруг.",
    "e": "13+3=16 MC за 1 VP (5 MC) + N MC-прод где N = карты без тегов (включая эту)"
  },
  "Geothermal Power": {
    "s": 56,
    "t": "C",
    "y": [
      "Торговля колониями",
      "Physics Complex",
      "Steelworks",
      "Требование Fusion Power",
      "Вэха Builder"
    ],
    "w": "Пок 1-3, когда нужно производство энергии и ничего лучше нет. Оплата сталью помогает.",
    "e": "11 MC + 3 MC карта = 14 MC стоимость"
  },
  "Luxury Foods": {
    "s": 56,
    "t": "C",
    "y": [
      "Vitor",
      "Сброс VP в конце игры"
    ],
    "w": "Последнее пок — сброс очков при выполненных требованиях и отсутствии лучших вариантов. Не драфтить, если требования не просты.",
    "e": "8 MC + 3 MC карта = 11 MC за 2 VP (~10 MC)"
  },
  "Phobos Space Haven": {
    "s": 56,
    "t": "C",
    "y": [
      "Phobolog",
      "Стратегии Jovian",
      "Вэха Mayor (на Tharsis)",
      "Ganymede Colony"
    ],
    "w": "Последние 1-2 пок как слив титана за 3 VP. Не играть ради продакшена — слишком медленно.",
    "e": "Стоимость 25+3=28 MC (оплата титаном)"
  },
  "Physics Complex": {
    "s": 56,
    "t": "C",
    "y": [
      "Mass Converter",
      "Quantum Extractor",
      "Viron",
      "Project Inspection",
      "Thorgate"
    ],
    "w": "Только с 6+ энергия-прод и нет лучшего применения. Одни теги могут оправдать её как сброс стали.",
    "e": "Стоимость 12+3=15 MC (оплата сталью)"
  },
  "Robot Pollinators": {
    "s": 56,
    "t": "C",
    "y": [
      "Растительные стратегии",
      "Sagitta (бонус без тегов)",
      "Community Services"
    ],
    "w": "Только когда много тегов Plant и нужны дополнительные растения для озеленения. Низкий приоритет.",
    "e": "12 MC всего (9+3) за 1 растения прод (~8 MC) + X растений (1 за тег Plant)"
  },
  "Special Permit": {
    "s": 56,
    "t": "C",
    "y": [
      "Политическая стратегия Greens",
      "Синергии Plant тега",
      "NRA (Plant тег)",
      "Стратегии озеленения"
    ],
    "w": "Только когда Greens у власти и можно сразу использовать украденные растения. Нишевая.",
    "e": "8 MC всего (5+3) за кражу 4 растений у оппонента + тег Plant Event"
  },
  "Supercapacitors": {
    "s": 56,
    "t": "C",
    "y": [
      "Thorgate",
      "Aridor",
      "Торговля колониями",
      "Награда Industrialist",
      "Physics Complex"
    ],
    "w": "Когда теги важны (Diversifier, вехи Builder) или с Colonies и ограниченной энергией. Достаточно дёшево чтобы играть почти всегда.",
    "e": "4+3=7 MC за 1 MC-прод (5-6 MC) + способность хранения энергии + теги Power+Building"
  },
  "Water to Venus": {
    "s": 56,
    "t": "C",
    "y": [
      "Скидка IC",
      "Optimal Aerobraking",
      "Скидки Space",
      "Вэха Legend",
      "Требования Venus"
    ],
    "w": "Когда есть скидки на space/события и нужен Venus TR. Оплата титаном делает доступным. Лейт сброс титана.",
    "e": "9+3=12 MC (оплата титаном) за 1 Venus TR (9 MC)"
  },
  "Windmills": {
    "s": 56,
    "t": "C",
    "y": [
      "Торговля колониями",
      "Thorgate",
      "Сброс стали",
      "Вэха Builder",
      "Потребности в энергии"
    ],
    "w": "Когда выполнено 7% O2 и есть сталь. Дешёвый VP + энергия. Нормальный филлер для лейта.",
    "e": "6+3=9 MC (оплата сталью) за 1 энергия-прод (7"
  },
  "Biomass Combustors": {
    "s": 56,
    "t": "C",
    "y": [
      "Thorgate",
      "Manutech",
      "Энергозависимые стратегии",
      "Движки Building"
    ],
    "w": "2-4 пок, когда отчаянно нужна энергия-прод и кража растения-прод бьёт по лидеру. Теги Power+Building — основная...",
    "e": "4+3=7 MC за 2 энергия-прод (14 MC на 1-м пок) - 1 VP (5 MC) - штраф take-that (кража растения-прод)",
    "c": "/r/TerraformingMarsGame/comments/1p7ylis/cotd_biomass_combustors_27_nov_2025/",
    "r": "It doesn't look very good at first glance, but it can actually be a really good card. — icehawk84"
  },
  "House Printing": {
    "s": 56,
    "t": "C",
    "y": [
      "Interplanetary Cinematics",
      "Mining Guild",
      "Стратегии Building",
      "Потребители стали"
    ],
    "w": "1-2 пок со стратегией Building и потребителями стали. Оплата сталью снижает стоимость. Пропускать в 3+ пок или без Building...",
    "e": "10+3=13 MC за 1 сталь-прод (7",
    "c": "/r/TerraformingMarsGame/comments/1ogh1bh/cotd_house_printing_26_oct_2025/",
    "r": "Meh. A mine with a VP attached to it, which is … fine? — Fektoer"
  },
  "Air-Scrapping Expedition": {
    "s": 55,
    "t": "C",
    "y": [
      "Optimal Aerobraking",
      "Stratopolis",
      "Floating Habs",
      "Aerial Mappers",
      "Dirigibles"
    ],
    "w": "Когда есть Venus карты с флоатерами в игре и нужен Venus подъём. Пропускай без синергии флоатеров.",
    "e": "13+3=16 MC за 1 Venus TR (7 MC) + 3 флоатера (~3-4"
  },
  "City Parks": {
    "s": 55,
    "t": "C",
    "y": [
      "Стратегии городов",
      "Вэха Builder",
      "Вэха Mayor",
      "Mining Guild"
    ],
    "w": "Только когда есть или ожидаются 3 города, что редко в 3P. Не строй города ради активации этого.",
    "e": "7+3=10 MC за 2 VP (10 MC) + 2 растения (4 MC) + тег Building (1-2 MC)"
  },
  "Comet Aiming": {
    "s": 55,
    "t": "C",
    "y": [
      "Astrodrill",
      "Directed Impactors",
      "Asteroid Deflection System",
      "Asteroid Rights"
    ],
    "w": "Когда есть титан-прод и синергия карт астероидов. Средний приоритет с Astrodrill. Ниже без.",
    "e": "17+3=20 MC за тег Space"
  },
  "Comet for Venus": {
    "s": 55,
    "t": "C",
    "y": [
      "Optimal Aerobraking",
      "Media Group",
      "Phobolog",
      "Venus Waystation",
      "Solar Logistics"
    ],
    "w": "Когда нужен подъём Venus и есть скидки на титан/события. Пропускать без скидок.",
    "e": "11+3=14 MC за 1 TR Venus (7 MC) + снятие 4 MC у игрока с тегом Venus (~2-4 MC ценность в 3P)"
  },
  "Directed Impactors": {
    "s": 55,
    "t": "C",
    "y": [
      "Phobolog",
      "Advanced Alloys",
      "Asteroid Mining Consortium",
      "Любая прод титана"
    ],
    "w": "1-2 пок при раше температуры с избытком титана. Пропускай если мид или позже.",
    "e": "8 MC + 3 MC карта = 11 MC стоимость"
  },
  "Greenhouses": {
    "s": 73,
    "t": "B",
    "y": [
      "Ecoline",
      "NRA",
      "Insects",
      "Mining Guild",
      "Viral Enhancers"
    ],
    "w": "В лейте с 5+ городами для финального рывка растений к конвертации в озеленение. Иначе низкий приоритет.",
    "e": "6 MC (оплата сталью) + 3 MC карта = 9 MC стоимость"
  },
  "Hired Raiders": {
    "s": 55,
    "t": "C",
    "y": [
      "IC",
      "Media Group",
      "Electro Catapult",
      "Viron"
    ],
    "w": "Когда есть скидки на Event или нужно сорвать планы конкретного оппонента по стали. Не драфтить рано без синергий.",
    "e": "1 MC + 3 MC карта = 4 MC стоимость"
  },
  "Hydrogen to Venus": {
    "s": 62,
    "t": "C",
    "y": [
      "Dirigibles",
      "Floating Habs",
      "Celestic",
      "Phobolog",
      "Optimal Aerobraking"
    ],
    "w": "Только когда есть теги Jovian И карта флоатеров Venus. Иначе пас.",
    "e": "11 MC + 3 MC карта = 14 MC за 1 TR Venus (~7 MC)"
  },
  "Ironworks": {
    "s": 55,
    "t": "C",
    "y": [
      "Manutech",
      "Energy Market",
      "Колония Callisto",
      "Вэха Builder"
    ],
    "w": "Когда есть 4+ энергия-прод без нужд торговли колониями и хочешь конкурировать на шкале кислорода. В основном карта для 2P.",
    "e": "11 MC + 3 MC карта = 14 MC изначально"
  },
  "Local Shading": {
    "s": 55,
    "t": "C",
    "y": [
      "Карты Venus флоатеров",
      "Dirigibles",
      "Стратегия Venus тега",
      "Награда Banker"
    ],
    "w": "Когда нужен дешёвый тег Venus или цель для флоатеров. Генерация MC-прод — бонус, не основная причина.",
    "e": "4 MC + 3 MC карта = 7 MC"
  },
  "Magnetic Field Generators:promo": {
    "s": 55,
    "t": "C",
    "y": [
      "Thorgate",
      "Mass Converter",
      "Quantum Extractor",
      "Robotic Workforce",
      "Mining Guild"
    ],
    "w": "Только при 5+ энергия-прод без лучшего применения. Лейт-сброс стали с избытком энергии.",
    "e": "Стоимость 22+3=25 MC (оплата сталью)"
  },
  "Market Manipulation": {
    "s": 57,
    "t": "C",
    "y": [
      "Media Group",
      "Interplanetary Cinematics",
      "Point Luna",
      "Martian Zoo",
      "Teractor"
    ],
    "w": "Когда есть возвраты за теги Event/Earth. Низкий приоритет драфта в остальных случаях. Хорошо как бесплатный draw.",
    "e": "Стоимость 1+3=4 MC"
  },
  "Mining Expedition": {
    "s": 55,
    "t": "C",
    "y": [
      "Interplanetary Cinematics",
      "Media Group",
      "Arctic Algae",
      "Birds (разблокировка 13% O2)"
    ],
    "w": "Чтобы перехватить бонусы O2 или закончить игру. Take-that в 3P — реальный минус. Низкий приоритет в драфте.",
    "e": "Стоимость 12+3=15 MC"
  },
  "Ore Processor": {
    "s": 55,
    "t": "C",
    "y": [
      "Mass Converter",
      "Nuclear Power",
      "Steelworks",
      "Альтернатива Physics Complex",
      "Против растительных противников"
    ],
    "w": "Когда есть 4+ производства энергии и хочется запретить кислород игрокам на растениях. Не стоит строить стратегию специально под это.",
    "e": "Стоимость 13+3=16 MC (оплата сталью)"
  },
  "Public Celebrations": {
    "s": 55,
    "t": "C",
    "y": [
      "Vitor (-3 MC)",
      "IC (-2 MC)",
      "Media Group (-3 MC)",
      "Вэха Legend"
    ],
    "w": "Лейт при статусе Chairman. Не стоит драфтить рано. Бесплатный draw — нормально.",
    "e": "11 MC всего (8+3) за 2 VP"
  },
  "Release of Inert Gases": {
    "s": 60,
    "t": "C",
    "y": [
      "UNMI",
      "IC/Media Group",
      "Вэха Terraformer",
      "Вэха Legend",
      "Награда Benefactor"
    ],
    "w": "Лейт для VP, или мид со скидками на события. Никогда не высокий приоритет.",
    "e": "17 MC всего (14+3) за 2 TR (~14"
  },
  "Search For Life": {
    "s": 42,
    "t": "D",
    "y": [
      "Научные требования",
      "Разблокировка AI Central",
      "Ценность столлинга",
      "Вэха Diversifier"
    ],
    "w": "Ранняя игра когда нужен дешёвый science тег. Действие — бонус, а не причина для розыгрыша.",
    "e": "6 MC всего (3+3) за самый дешёвый Science тег + stall действие + лотерея на 3 VP"
  },
  "Stanford Torus": {
    "s": 55,
    "t": "C",
    "y": [
      "Pets",
      "Immigrant City",
      "Rover Construction",
      "Vitor",
      "Вэха Mayor"
    ],
    "w": "В лейте как слив титана или при конкуренции за Mayor. Со скидками на Space становится более играбельной.",
    "e": "12+3=15 MC за 2 VP"
  },
  "Tectonic Stress Power": {
    "s": 57,
    "t": "C",
    "y": [
      "Торговля колониями",
      "Strip Mine",
      "Water Splitting Plant",
      "Physics Complex",
      "Thorgate"
    ],
    "w": "С колониями и 2+ тегами Science уже. Оплата сталью делает доступнее. Пропускать без колоний, если нет...",
    "e": "18+3=21 MC (оплата сталью) за 3 энергия-прод (22",
    "c": "/r/TerraformingMarsGame/comments/1nluihb/cotd_tectonic_stress_power_20_sept_2025/",
    "r": "Meh. One of those cards where it's hard to get the requirements early enough to make it worth it. — jayron32"
  },
  "Unexpected Application": {
    "s": 55,
    "t": "C",
    "y": [
      "Morning Star Inc",
      "Награда Venuphile",
      "Требования Venus",
      "Вэха Legend",
      "Aphrodite"
    ],
    "w": "Когда нужно поднять Venus для требований или Venuphile. Достаточно дёшево как филлер.",
    "e": "4+3=7 MC + 1 сброс карты (3-4 MC) = ~10-11 MC фактически за 1 TR Venus (9 MC) + тег Venus (~2-3 MC)"
  },
  "Urbanized Area": {
    "s": 55,
    "t": "C",
    "y": [
      "Вэха Mayor",
      "Commercial District",
      "Города противника",
      "Оплата сталью",
      "Соседство озеленений"
    ],
    "w": "Когда 2 города соседствуют на поле и можно использовать размещение. Ценность помехи в 3P. Иначе пропускай.",
    "e": "10+3=13 MC (оплата сталью) - 1 энергия-прод (7"
  },
  "Asteroid Deflection System": {
    "s": 55,
    "t": "C",
    "y": [
      "Phobolog",
      "Point Luna",
      "Mining Guild",
      "Синергии тройного тега",
      "Стратегии VP"
    ],
    "w": "Пок 1-3 за ценность тройного тега (Space+Earth+Building). VP от действия — вторичны. Оплата титаном/сталью снижает фактическую стоимость...",
    "e": "13+3=16 MC + энергия-прод (~7 MC) = 23 MC фактически",
    "c": "/r/TerraformingMarsGame/comments/1oj0lts/cotd_asteroid_deflection_system_29_oct_2025/",
    "r": "The poor man's Protected Habitats, but I'm still glad to see it if I am planting. — CaptainCFloyd"
  },
  "Diversity Support": {
    "s": 55,
    "t": "C",
    "y": [
      "Стратегии диверсификации ресурсов",
      "Движки Floater+Microbe+Animal",
      "Psychrophiles",
      "Decomposers"
    ],
    "w": "Драфтить спекулятивно, если уже есть 6+ типов ресурсов и путь к 9. При стоимости 4 MC отдача отличная, ЕСЛИ дости...",
    "e": "1+3=4 MC за 1 TR (7-7",
    "c": "/r/TerraformingMarsGame/comments/1p1zdz5/cotd_diversity_support_20_nov_2025/",
    "r": "It's highly situational and low impact, which means it's rarely worth it unless you know it's getting played, and eve... — icehawk84"
  },
  "Venus Waystation": {
    "s": 53,
    "t": "D",
    "y": [
      "Morning Star Inc",
      "Venus Governor (играется бесплатно)",
      "Тяжёлая стратегия Venus",
      "Награда Venuphile",
      "Сброс титана"
    ],
    "w": "Только при коммите в стратегию Venus с 3+ картами Venus на руке. Приоритетный выбор для Morning Star Inc.",
    "e": "9+3=12 MC (оплата титаном) за скидку -2 MC за сыгранный тег Venus + 1 VP (5 MC) + теги Venus+Space (~3-4 MC)"
  },
  "Adapted Lichen": {
    "s": 52,
    "t": "D",
    "y": [
      "Nitrogen Rich Asteroid",
      "Insects",
      "Вэха Ecologist",
      "Ecological Zone",
      "Viral Enhancers"
    ],
    "w": "Только 1 пок если Plant тег включает NRA или майлстоун. Иначе предпочитай более дешёвые растения-прод карты типа Lichen или Archaebact...",
    "e": "9+3=12 MC за 1 растения-прод (8 MC в 1 пок)"
  },
  "Commercial District": {
    "s": 52,
    "t": "D",
    "y": [
      "Награда Banker",
      "Награда Landlord",
      "Награда Estate Dealer",
      "Излишки стали"
    ],
    "w": "Слив стали в лейте с избытком энергии, или для свинга наград Banker/Landlord. Пропускай как экономическую карту.",
    "e": "16+3=19 MC + 1 энергия-прод (7"
  },
  "Extreme-Cold Fungus": {
    "s": 62,
    "t": "C",
    "y": [
      "GHG Producing Bacteria",
      "Sulphur-Eating Bacteria",
      "Ants",
      "Decomposers",
      "Колония Enceladus"
    ],
    "w": "Только с высокоценной целью для микробов уже в игре или в руке. Пропускать ради генерации растений в одиночку.",
    "e": "13 MC + 3 MC карта = 16 MC стоимость"
  },
  "Interplanetary Trade": {
    "s": 58,
    "t": "C",
    "y": [
      "Phobolog",
      "Вэха Diversifier",
      "Награда Banker"
    ],
    "w": "Только как слив титана когда есть 7+ уникальных тегов и 4+ пок впереди. Иначе пас.",
    "e": "27 MC + 3 MC карта = 30 MC за N MC-прод (где N = уникальные теги в игре)"
  },
  "Law Suit": {
    "s": 52,
    "t": "D",
    "y": [
      "IC",
      "Media Group",
      "Синергии Earth тега"
    ],
    "w": "В 2P играх когда ожидаешь атаку. В 3P только как бесплатный draw или если знаешь что будешь целью.",
    "e": "2 MC + 3 MC карта = 5 MC"
  },
  "Outdoor Sports": {
    "s": 52,
    "t": "D",
    "y": [
      "Sagitta",
      "Community Services",
      "Vitor",
      "Capital",
      "Награда Banker"
    ],
    "w": "Только когда город уже стоит рядом с океаном И ты в пок 1-2. Очень низкий приоритет в драфте.",
    "e": "Стоимость 8+3=11 MC"
  },
  "Red Tourism Wave": {
    "s": 52,
    "t": "D",
    "y": [
      "Наземная игра со множеством тайлов",
      "Размещение Research Outpost",
      "Синергии Earth тега",
      "Политическая стратегия Reds"
    ],
    "w": "Только когда Reds уже у власти и много тайлов с пустыми соседними клетками. Очень ситуативная.",
    "e": "6 MC всего (3+3) за переменное MC (1 за пустую клетку рядом с твоими тайлами)"
  },
  "Regolith Eaters": {
    "s": 52,
    "t": "D",
    "y": [
      "Научный движок (только тег)",
      "Decomposers (Microbe тег)",
      "Разблокировка AI Central"
    ],
    "w": "Только когда отчаянно нужен тег Science и нет ничего лучше. Действие почти никогда не стоит использования.",
    "e": "16 MC всего (13+3) за теги Science+Microbe (~6-8 MC) + 1 TR за 3 действия (~2"
  },
  "Sub-zero Salt Fish": {
    "s": 56,
    "t": "C",
    "y": [
      "Viral Enhancers",
      "Meat Industries",
      "Decomposers",
      "Ecological Zone",
      "Large Convoy"
    ],
    "w": "Лейт филлер если температура каким-то образом впереди. Гораздо хуже Fish/Small Animals на практике.",
    "e": "5+3=8 MC за 1/2 VP за животное + take-that (-1 растения-прод)"
  },
  "Tundra Farming": {
    "s": 52,
    "t": "D",
    "y": [
      "NRA",
      "Insects",
      "Ecoline",
      "Синергии Plant тега",
      "Награда Banker"
    ],
    "w": "Только если -6C выполнено и нужен тег Plant или 2 VP. Trees почти всегда лучше, если можно подождать до -4C.",
    "e": "16+3=19 MC за 1 растения-прод (8 MC) + 2 MC-прод (10-12 MC) + 1 растение (2 MC) + 2 VP (10 MC) + тег Plant..."
  },
  "Asteroid Mining": {
    "s": 50,
    "t": "D",
    "y": [
      "Phobolog",
      "Saturn Systems",
      "Множители Jovian",
      "Mass Converter",
      "Advanced Alloys"
    ],
    "w": "Phobolog на 1-м пок или Saturn Systems с прелюдиями титана. Стратегия Jovian с множителями. Иначе пропускать.",
    "e": "30+3=33 MC за 2 титан-прод (25 MC) + 2 VP (10 MC) + тег Jovian (3-5 MC) + тег Space (1-2 MC)"
  },
  "Carbonate Processing": {
    "s": 50,
    "t": "D",
    "y": [
      "Helion",
      "UNMI",
      "Награда Thermalist",
      "Вэха Generalist"
    ],
    "w": "Только 1 пок, для целенаправленного раша тепла с избытком энергия-прод. Иначе пропускать.",
    "e": "6+3=9 MC + 1 энергия-прод (7"
  },
  "Cloud Seeding": {
    "s": 50,
    "t": "D",
    "y": [
      "Стратегия растительной прод",
      "Вэха Generalist"
    ],
    "w": "Только когда нет лучших вариантов растения-прод и 3 океана выложены. Низкий приоритет.",
    "e": "11+3=14 MC + 1 MC-прод (5 MC) за 2 растения-прод (16 MC)"
  },
  "Energy Saving": {
    "s": 50,
    "t": "D",
    "y": [
      "Physics Complex",
      "Steelworks",
      "Торговля колониями",
      "Противник Tharsis Republic",
      "Награда Thermalist"
    ],
    "w": "Мид-лейт с 4+ городами уже в игре и применением для энергии (Колонии, Physics Complex). Иначе пропускай.",
    "e": "15 MC + 3 MC карта = 18 MC стоимость"
  },
  "GHG Shipment": {
    "s": 50,
    "t": "D",
    "y": [
      "Движок флоатеров",
      "Партия Kelvinists",
      "Helion",
      "Колония Titan",
      "Награда Thermalist"
    ],
    "w": "Только если Kelvinists у власти, есть 10+ floater и нужно тепло. Крайне нишевая.",
    "e": "3 MC + 3 MC карта = 6 MC стоимость"
  },
  "Immigration Shuttles": {
    "s": 57,
    "t": "C",
    "y": [
      "Phobolog",
      "Point Luna",
      "Advanced Alloys",
      "Credicor"
    ],
    "w": "Когда тонешь в титане без других космических карт для розыгрыша. Неплохой слив титана для Phobolog.",
    "e": "31 MC + 3 MC карта = 34 MC за 5 MC-прод (~25 MC в 1 пок) + 1/3 VP за город (~2-3 VP типично)",
    "c": "/r/TerraformingMarsGame/comments/1n33h0l/cotd_immigration_shuttles_29_aug_2025/",
    "r": "Expensive card. Usually not worth playing, unless you are bathing in Titanium or Mars is riddled with citites. — ThainEshKelch"
  },
  "Ishtar Mining": {
    "s": 50,
    "t": "D",
    "y": [
      "Morning Star Inc",
      "Inventrix",
      "Стратегия Venus тега",
      "Advanced Alloys"
    ],
    "w": "Только когда Venus 8% уже выполнено или вот-вот, и нужен дешёвый Venus тег + титан-прод. Иначе Titanium Mine...",
    "e": "5 MC + 3 MC карта = 8 MC за 1 титан-прод (~12"
  },
  "Lava Tube Settlement": {
    "s": 50,
    "t": "D",
    "y": [
      "Карта Hellas",
      "Mining Guild",
      "Вэха Builder"
    ],
    "w": "Только на Hellas с оставшейся энергией и сталью, или для критического пуша вехи Mayor.",
    "e": "15 MC + 3 MC карта + 7"
  },
  "Microgravity Nutrition": {
    "s": 56,
    "t": "C",
    "y": [
      "Poseidon",
      "Aridor",
      "Viral Enhancers",
      "Ecological Zone",
      "Decomposers"
    ],
    "w": "Только с 3+ колониями уже размещёнными в ранней игре. Двойной био-тег — основная привлекательность для конкретных вех.",
    "e": "Стоимость 11+3=14 MC"
  },
  "Public Plans": {
    "s": 70,
    "t": "B",
    "y": [
      "Vitor",
      "IC",
      "Вэха Legend",
      "Media Group"
    ],
    "w": "Почти никогда. Только при множестве карт на руке, сильных скидках и потребности в вехе Legend.",
    "e": "10 MC всего (7+3) за 1 VP + ~X MC возврат (1 MC за раскрытую карту)"
  },
  "Special Design": {
    "s": 54,
    "t": "D",
    "y": [
      "Inventrix (+2 ещё = +4 всего)",
      "Триггеры научных событий (Mars U, IC, Media Group)",
      "Разблокировка Kelp Farming/Trees"
    ],
    "w": "Только когда дополнительные 2 шага разблокируют очень мощную карту на 1 пок раньше. Очень нишевая.",
    "e": "7 MC всего (4+3) за +/- 2 шага к требованию следующей карты + Science event тег"
  },
  "Venusian Insects": {
    "s": 72,
    "t": "B",
    "y": [
      "Symbiotic Fungus",
      "Extreme-Cold Fungus",
      "Вэха Ecologist",
      "Колония Enceladus",
      "Hoverlord"
    ],
    "w": "Когда Venus 12% выполнено и нужно накопление VP. Значительно слабее Stratospheric Birds или Venusian Animals.",
    "e": "5+3=8 MC за действие: добавить 1 микроба, 1 VP за 2 микробов"
  },
  "Venusian Plants": {
    "s": 60,
    "t": "C",
    "y": [
      "Stratospheric Birds",
      "Venusian Animals",
      "Inventrix",
      "Morning Star Inc",
      "Награда Venuphile"
    ],
    "w": "Только когда Venus на 16%+ и есть карта животных Venus для размещения. На практике очень редко.",
    "e": "13+3=16 MC за 1 Venus TR (9 MC) + 1 VP (5 MC) + 1 микроб/животное на карту Venus (~2-5 MC) + Venus..."
  },
  "Adaptation Technology": {
    "s": 48,
    "t": "D",
    "y": [
      "Inventrix",
      "Special Design",
      "Kelp Farming",
      "Birds",
      "Predators"
    ],
    "w": "Только когда отчаянно нужен тег Science и эффект позволит сыграть 2+ карты с требованиями раньше. Почти все...",
    "e": "12+3=15 MC за 1 VP (5 MC) + тег Science (3-5 MC) + эффект"
  },
  "Atmo Collectors": {
    "s": 48,
    "t": "D",
    "y": [
      "Колония Titan",
      "Floater Technology",
      "Dirigibles",
      "Stormcraft"
    ],
    "w": "Почти никогда. Только при обильной генерации флоатеров и отчаянной нужде в конверсии энергии/тепла.",
    "e": "15+3=18 MC без тегов + 2 флоатера"
  },
  "Extractor Balloons": {
    "s": 48,
    "t": "D",
    "y": [
      "Celestic",
      "Stormcraft",
      "Floater Technology",
      "Вэха Hoverlord",
      "Колония Titan"
    ],
    "w": "Пок 1-2 с Celestic/Stormcraft для заявки Hoverlord. Иначе слишком медленно и дорого.",
    "e": "21 MC + 3 MC карта = 24 MC стоимость"
  },
  "Great Escarpment Consortium": {
    "s": 48,
    "t": "D",
    "y": [
      "Игры 2P",
      "Asteroid Mining Consortium",
      "Mining Guild",
      "Стратегии стали"
    ],
    "w": "Редко в 3P. Только если отчаянно нужна сталь-прод И один конкретный оппонент имеет избыток. Лучше в 2P.",
    "e": "6 MC + 3 MC карта = 9 MC стоимость"
  },
  "Hospitals": {
    "s": 48,
    "t": "D",
    "y": [
      "Pharmacy Union",
      "Tharsis Republic"
    ],
    "w": "Редко. Последнее-пок дешёвая VP с оплатой сталью если нет ничего лучше. Пропускать в большинстве ситуаций.",
    "e": "8 MC + 3 MC карта + 7",
    "c": "/r/TerraformingMarsGame/comments/1nmpj4r/cotd_hospitals_21_sept_2025/",
    "r": "It's good for a cheap point in the last gen, but that's about it. — icehawk84"
  },
  "Neutralizer Factory": {
    "s": 48,
    "t": "D",
    "y": [
      "Morning Star Inc",
      "Aphrodite",
      "Карты Venus с требованиями",
      "Награда Venuphile"
    ],
    "w": "Только когда Venus близко к 14-16% и хочешь бонусный TR за достижение порога. Очень низкий приоритет.",
    "e": "Стоимость 7+3=10 MC"
  },
  "Snow Algae": {
    "s": 48,
    "t": "D",
    "y": [
      "Ecoline",
      "Tharsis Republic",
      "Вэха Generalist",
      "Insects (Plant тег)"
    ],
    "w": "Только пок 1-2 с 2 уже размещёнными океанами и стратегией растений/тепла. Иначе пропускай.",
    "e": "15 MC всего (12+3) за 1 растения прод (~8 MC) + 1 тепло прод (~4-6 MC) + тег Plant (~1-2 MC)"
  },
  "Solar Power": {
    "s": 48,
    "t": "D",
    "y": [
      "Сброс стали",
      "Вэха Builder",
      "Thorgate",
      "Vitor"
    ],
    "w": "Лейт-сброс стали за 1 VP. Не стоит драфтить, если не в отчаянии по тегам Building/Power.",
    "e": "14 MC всего (11+3) за 1 энергия-прод (~7"
  },
  "Tardigrades": {
    "s": 48,
    "t": "D",
    "y": [
      "Колония Enceladus",
      "Topsoil Contract",
      "Extreme-Cold Fungus",
      "Вэха Ecologist",
      "Viral Enhancers"
    ],
    "w": "1 пок филлер когда нет ничего лучше. Дешёвый тег для Ecologist/Diversifier. Никогда не приоритетный выбор.",
    "e": "4+3=7 MC за действие: добавить 1 микроба, 1 VP за 4 микроба"
  },
  "Vote Of No Confidence": {
    "s": 48,
    "t": "D",
    "y": [
      "Политические события Turmoil",
      "Влияние председателя",
      "Стратегия делегатов",
      "Вэха Legend (событие)",
      "TR-раш"
    ],
    "w": "Не держи рано. Возможно драфти если лейт и нейтральный председатель вот-вот появится. Иначе пропускай.",
    "e": "5+3=8 MC за 1 TR (7 MC) + позиция председателя (1 влияние, ~2-4 MC/пок в событиях Turmoil)"
  },
  "Water Splitting Plant": {
    "s": 48,
    "t": "D",
    "y": [
      "Mass Converter",
      "Thorgate",
      "Избыток энергии",
      "Factorum",
      "Standard Technology"
    ],
    "w": "Только при избытке производства энергии и O2 ещё не на максимуме. Редко правильно в конкурентной 3P игре.",
    "e": "12+3=15 MC за действие: потратить 3 энергии для 1 O2 TR (7 MC)"
  },
  "Hackers": {
    "s": 48,
    "t": "D",
    "y": [
      "Ничего значимого"
    ],
    "w": "Почти никогда. Только от безысходности, когда энергия бесплатна и кража MC-прод бьёт по явному лидеру. Даже тогда -...",
    "e": "3+3=6 MC + энергия-прод (~7 MC) = 13 MC фактически",
    "c": "/r/TerraformingMarsGame/comments/1p8r7b7/cotd_hackers_28_nov_2025/",
    "r": "This card has been hotly debated on Discord recently. According to traditional wisdom, it's a trap card because of th... — icehawk84"
  },
  "Callisto Penal Mines": {
    "s": 40,
    "t": "D",
    "y": [
      "Saturn Systems",
      "Phobolog",
      "Множители Jovian",
      "Вэха Rim Settler"
    ],
    "w": "Только при стратегии Jovian с множителями или как лейт-слив титана за тег Jovian.",
    "e": "24+3=27 MC за 3 MC-прод (15 MC) + 2 VP (10 MC) + тег Jovian (3-5 MC) + тег Space (1-2 MC)",
    "c": "/r/TerraformingMarsGame/comments/1nqxcv8/cotd_callisto_penal_mines_26_sept_2025/",
    "r": "Trap card. It's so rarely worth it. — icehawk84"
  },
  "Capital": {
    "s": 66,
    "t": "C",
    "y": [
      "Mining Guild",
      "Artificial Lake",
      "Награда Estate Dealer",
      "Колония Ceres"
    ],
    "w": "Только в лейте с избытком стали и производства энергии. Хорошие места для размещения редки.",
    "e": "26+3=29 MC + 2 энергия-прод (15 MC) = 44 MC фактически"
  },
  "Forced Precipitation": {
    "s": 46,
    "t": "D",
    "y": [
      "Venus тег для требований",
      "Dirigibles",
      "Floater Technology",
      "Колония Titan",
      "Награда Venuphile"
    ],
    "w": "Только как дешёвый тег Venus или при внешних источниках флоатеров. Очень низкий приоритет для реального терраформинга Venus.",
    "e": "8 MC + 3 MC карта = 11 MC стоимость"
  },
  "Sabotage": {
    "s": 46,
    "t": "D",
    "y": [
      "IC (возврат событий)",
      "Media Group",
      "Вэха Legend",
      "Блокировка вэх противника"
    ],
    "w": "Почти никогда в 3P. Только со скидками/скидками на Event или для отказа в критической вехе.",
    "e": "4 MC всего (1+3) для удаления 7 MC / 4 стали / 3 титана у оппонента"
  },
  "Colonial Envoys": {
    "s": 45,
    "t": "D",
    "y": [
      "Стратегия колоний",
      "Манипуляции Turmoil"
    ],
    "w": "Только с 3+ колониями и Unity правит или скоро будет править. Очень низкий приоритет.",
    "e": "4+3=7 MC за делегатов (ценность зависит от количества колоний, ~3-5 MC за делегата)",
    "c": "/r/TerraformingMarsGame/comments/1nsklw4/cotd_colonial_envoys_28_sept_2025/",
    "r": "Haven't played this card before, but it seems strong. In my games it's quite common for players to have 2-3 colonies,... — Siphono"
  },
  "Equatorial Magnetizer": {
    "s": 50,
    "t": "D",
    "y": [
      "Robinson Industries",
      "Mass Converter",
      "Избыток прод энергии",
      "Mining Guild",
      "Сброс стали"
    ],
    "w": "Лейт с 3+ избыточным производством энергии и сталью для оплаты. Очень низкий приоритет в остальном.",
    "e": "11 MC (оплата сталью) + 3 MC карта = 14 MC стоимость"
  },
  "Heat Trappers": {
    "s": 45,
    "t": "D",
    "y": [
      "Robotic Workforce",
      "Thorgate",
      "Manutech"
    ],
    "w": "Только в 2P или если один оппонент убегает через производство тепла и нужно конкретно его замедлить.",
    "e": "6 MC + 3 MC карта + 1 штраф VP = ~14 MC фактическая стоимость"
  },
  "Magnetic Field Dome": {
    "s": 45,
    "t": "D",
    "y": [
      "Избыток энергии последнее покол.",
      "Излишки энергии колоний"
    ],
    "w": "Последнее пок с 2+ неиспользованной энергия-прод и сталью для сброса. Иначе пропускать. Никогда не играть рано/в миде.",
    "e": "5 MC + 3 MC карта + 15 MC (2 энергия-прод) = ~23 MC за 1 TR (~7 MC) + 1 растения-прод (~8 MC) + Build..."
  },
  "Meltworks": {
    "s": 45,
    "t": "D",
    "y": [
      "Helion",
      "Advanced Alloys",
      "Rego Plastics",
      "Electro Catapult",
      "Space Elevator"
    ],
    "w": "Только с Advanced Alloys И избытком тепла И целями для стали. Или как дешёвый тег Building для вехи Builder.",
    "e": "Стоимость 4+3=7 MC (оплата сталью)"
  },
  "Rad-Suits": {
    "s": 50,
    "t": "D",
    "y": [
      "Vitor (-3 MC)",
      "Community Services",
      "Вэхи требований"
    ],
    "w": "Только как сброс VP в последний пок когда нет ничего лучше. Никогда не драфти рано.",
    "e": "9 MC всего (6+3) за 1 MC-прод + 1 VP"
  },
  "Sulphur Exports": {
    "s": 45,
    "t": "D",
    "y": [
      "Morning Star Inc",
      "Venus Governor",
      "Gyropolis",
      "Stratopolis",
      "Награда Venuphile"
    ],
    "w": "Только с 4+ тегами Venus уже в игре/руке. MSI — самый частый активатор. Иначе пропускай.",
    "e": "21+3=24 MC (оплата титаном) за 1 Venus TR (9 MC) + 1 MC-прод за тег Venus"
  },
  "Black Polar Dust": {
    "s": 44,
    "t": "D",
    "y": [
      "Helion",
      "Ecoline (нужно тепло)",
      "Награда Thermalist"
    ],
    "w": "1-2 пок для стратегии раша, когда нужен и океан, и тепло-прод. Пропускать, если ценишь MC-прод или теги.",
    "e": "15+3=18 MC за 1 океан (14 MC) + 3 тепло-прод (12 MC) - 2 MC-прод (-10 MC)"
  },
  "Teslaract": {
    "s": 44,
    "t": "D",
    "y": [
      "Robinson Industries",
      "Thorgate",
      "Power Supply Consortium",
      "Deuterium Export",
      "NRA"
    ],
    "w": "Только с избытком дешёвого энергия-прод и стратегией на растения. Очень нишевая.",
    "e": "14+3=17 MC (оплата сталью) за 1 TR (7 MC) + действие: потратить 1 энергия-прод чтобы получить 1 растения-прод"
  },
  "Venus Soils": {
    "s": 44,
    "t": "D",
    "y": [
      "NRA",
      "Insects",
      "GHG Producing Bacteria",
      "Скидка Credicor",
      "Оплата через Psychrophiles/Dirigibles"
    ],
    "w": "Только когда нужны все три: шаг Venus, растения-прод и цель для микробов. Очень нишевый пакет.",
    "e": "20+3=23 MC за 1 Venus TR (9 MC) + 1 растения-прод (8 MC) + 2 микроба (~2-5 MC) + Venus+Plant теги ..."
  },
  "Aerosport Tournament": {
    "s": 44,
    "t": "D",
    "y": [
      "Движки флоатеров",
      "Игры с городами"
    ],
    "w": "Только когда случайно есть 5+ флоатеров и много городов в игре. Никогда не драфти спекулятивно. D-тир из-за жёстких требований...",
    "e": "7+3=10 MC за 1 MC за город в игре (~5-8 MC в 3P) + 1 VP (5 MC)",
    "c": "/r/TerraformingMarsGame/comments/1p68oso/cotd_aerosport_tournament_25_nov_2025/",
    "r": "It’s usually trash. Occasionally it will give you a cheap point, but it’s just a worse version of molecular printing. — SoupsBane"
  },
  "Banned Delegate": {
    "s": 42,
    "t": "D",
    "y": [
      "Партии Turmoil",
      "Стратегии председателя",
      "IC (кэшбэк событий)"
    ],
    "w": "Очень низкий приоритет. Только если часто Chairman и нужно манипулировать партийной политикой.",
    "e": "0+3=3 MC за удаление 1 делегата"
  },
  "Designed Microorganisms": {
    "s": 42,
    "t": "D",
    "y": [
      "Ecoline",
      "Cutting Edge Technology",
      "Insects",
      "NRA",
      "Splice"
    ],
    "w": "Почти никогда. Только если отчаянно нужен тег Science при Ecoline идущей за раннюю веху Gardener.",
    "e": "16 MC + 3 MC карта = 19 MC стоимость"
  },
  "Icy Impactors": {
    "s": 42,
    "t": "D",
    "y": [
      "Phobolog",
      "Advanced Alloys"
    ],
    "w": "Почти никогда в 3P. Только при массивном избытке титана и нет лучших space карт.",
    "e": "15 MC + 3 MC карта = 18 MC изначально"
  },
  "Land Claim": {
    "s": 58,
    "t": "C",
    "y": [
      "Arcadian Communities",
      "Frontier Town",
      "Вэха Legend"
    ],
    "w": "Только при бесплатном draw или когда конкретная позиция на карте критична. Не стоит драфтить.",
    "e": "1 MC + 3 MC карта = 4 MC для резервирования места на карте"
  },
  "Magnetic Field Generators": {
    "s": 42,
    "t": "D",
    "y": [
      "Научный движок лишняя энергия",
      "Сброс стали последнее покол.",
      "Вэха Builder"
    ],
    "w": "Последнее пок с 4+ неиспользованной энергия-прод и сталью. Иначе полностью пропускать. Одна из самых переоценённых карт в игр...",
    "e": "20 MC + 3 MC карта + 28 MC (4 энергия-прод) = ~51 MC за 3 TR (~21 MC) + 2 растения-прод (~16 MC) + тайл..."
  },
  "Nitrite Reducing Bacteria": {
    "s": 42,
    "t": "D",
    "y": [
      "Extreme-Cold Fungus",
      "Symbiotic Fungus",
      "Decomposers",
      "Колония Enceladus",
      "Imported Nitrogen"
    ],
    "w": "Почти никогда. Только с несколькими источниками добавления микробов которые ускоряют производство TR.",
    "e": "Стоимость 11+3=14 MC"
  },
  "Parliament Hall": {
    "s": 42,
    "t": "D",
    "y": [
      "Mining Guild",
      "Вэха Builder",
      "Партия Mars First",
      "Оплата сталью"
    ],
    "w": "Как дешёвый сброс стали на 1VP с правящей Mars First. Не драфти ради эффекта производства.",
    "e": "Стоимость 8+3=11 MC (оплата сталью)",
    "c": "/r/TerraformingMarsGame/comments/1ne4spw/cotd_parliament_hall_11_sept_2025/",
    "r": "Why, why, WHY does it raise production for every 3 and not every 2 tags? — yolopukki567"
  },
  "Power Grid": {
    "s": 42,
    "t": "D",
    "y": [
      "Thorgate",
      "Physics Complex",
      "Карты req Mass Converter",
      "Колонии (мульти-флот)"
    ],
    "w": "Почти никогда. Только с 3+ существующими тегами Power и отчаянной нуждой в энергии. Thorgate делает более играбельной.",
    "e": "Стоимость 18+3=21 MC"
  },
  "Space Mirrors": {
    "s": 42,
    "t": "D",
    "y": [
      "Колонии (аварийная энергия)",
      "Потребности Power+Space тегов"
    ],
    "w": "Почти никогда. Действие слишком дорогое. Только от безысходности ради энергии для колоний.",
    "e": "6 MC всего (3+3) за действие: потратить 7 MC за 1 энергия-прод"
  },
  "Steelworks": {
    "s": 42,
    "t": "D",
    "y": [
      "Mass Converter",
      "Electro Catapult",
      "Space Elevator",
      "Thorgate",
      "Factorum"
    ],
    "w": "Только когда есть избыток энергия-прод и нужно не дать растительным игрокам очки O2. Редко правильно играть.",
    "e": "15+3=18 MC за действие: тратишь 4 энергии на 2 стали (6 MC) + 1 O2 TR (7 MC) = ~13 MC за действие"
  },
  "Food Factory": {
    "s": 42,
    "t": "D",
    "y": [
      "Прод стали",
      "Движки MC-прод",
      "Стратегии Building"
    ],
    "w": "Только 1-2 пок когда растения-прод реально в избытке (2+ растения-прод которые не успевают конвертировать в озеленения). Сталь...",
    "e": "12+3=15 MC за 4 MC-прод (20-24 MC в 1 пок) - 1 растения-прод (8 MC в 1 пок) + 1 VP (5 MC)",
    "c": "/r/TerraformingMarsGame/comments/1ooyxi7/cotd_food_factory_5_nov_2025/",
    "r": "Typically bad. You pay 15mc (3 for the card and 12 in steel) and lose 1 plant production (worth 10 or maybe 11 gen 1)... — benbever"
  },
  "Titan Air-scrapping": {
    "s": 50,
    "t": "D",
    "y": [
      "Phobolog",
      "Стратегии Jovian",
      "Вэха Hoverlord"
    ],
    "w": "Почти никогда. Только при избытке титан-прод и нечем лучшим его тратить. Тег Jovian — главный интерес. Классическая ...",
    "e": "21+3=24 MC за цикл действий: потратить 1 титан → 2 флоатера → затем потратить 2 флоатера → 1 TR",
    "c": "/r/TerraformingMarsGame/comments/1oxpffm/cotd_titan_airscrapping_15_nov_2025/",
    "r": "This is not a card I pick or play ever. It’s too expensive and slow on its own, and floater placement often has bette... — SoupsBane"
  },
  "Rotator Impacts": {
    "s": 42,
    "t": "D",
    "y": [
      "Aphrodite (подъём Venus)",
      "Космические движки",
      "Игры с мало Venus для req"
    ],
    "w": "Только когда Venus низка и нужны дешёвые подъёмы Venus со временем. Тег Space для оплаты титаном. Обычно хуже прямых...",
    "e": "6+3=9 MC за цикл действий: потратить 6 MC → добавить астероид, затем потратить астероид → поднять Venus на 1 шаг (1...",
    "c": "/r/TerraformingMarsGame/comments/1nykfeq/cotd_rotator_impacts_5_oct_2025/",
    "r": "Asteroid cards are trash in general, and this is no exception. — icehawk84"
  },
  "Aerobraked Ammonia Asteroid": {
    "s": 40,
    "t": "D",
    "y": [
      "Optimal Aerobraking",
      "Credicor",
      "Phobolog",
      "Psychrophiles",
      "Regolith Eaters"
    ],
    "w": "Почти никогда. Только со значительной скидкой на титан + Optimal Aerobraking + карта микробов уже в игре.",
    "e": "26+3=29 MC за 3 тепло-прод (12 MC) + 1 растения-прод (8 MC) + 2 микроба (~2-4 MC)"
  },
  "Insulation": {
    "s": 40,
    "t": "D",
    "y": [
      "Награда Banker",
      "Manutech"
    ],
    "w": "Только когда награда Banker профинансирована и это может её качнуть, или температура на максимуме и есть 3+ тепло-прод для конверсии.",
    "e": "2 MC + 3 MC карта = 5 MC"
  },
  "Martian Rails": {
    "s": 72,
    "t": "B",
    "y": [
      "Tharsis Republic",
      "Стратегии городов",
      "Колонии (для энергии)"
    ],
    "w": "Почти никогда. Только если стол загружен городами и есть избыток энергии. Даже тогда есть варианты лучше.",
    "e": "Стоимость 13+3=16 MC"
  },
  "Pioneer Settlement": {
    "s": 40,
    "t": "D",
    "y": [
      "Phobolog",
      "Vitor",
      "Колония Miranda (для лейт-гейм животных)",
      "Скидки Space тега"
    ],
    "w": "Почти никогда. Лейт с 0-1 колониями и титаном на трату. Даже тогда маргинальна.",
    "e": "Стоимость 13+3=16 MC + потеря 2 MC-прод (10) = ~26 MC всего"
  },
  "Power Infrastructure": {
    "s": 40,
    "t": "D",
    "y": [
      "Factorum",
      "Вэха Builder",
      "Вэха Diversifier",
      "Дешёвый филлер тегов"
    ],
    "w": "Только для тегов вехи Builder/Diversifier. Действие почти никогда не стоит использования. Дешёвый слив стали.",
    "e": "Стоимость 4+3=7 MC (оплата сталью)"
  },
  "Soil Factory": {
    "s": 40,
    "t": "D",
    "y": [
      "Только сброс стали",
      "Вэха Builder (отчаянная)"
    ],
    "w": "Почти никогда. Сброс стали в последний пок с запасной энергией если нужна 1 VP. Карта нижнего уровня.",
    "e": "12 MC всего (9+3) + 1 энергия-прод (~7"
  },
  "Stratopolis": {
    "s": 56,
    "t": "C",
    "y": [
      "Dirigibles",
      "Aerial Mappers",
      "Deuterium Export",
      "Sulphur Exports",
      "Вэха Hoverlord"
    ],
    "w": "Только при глубокой инвестиции в стратегию Venus с флоатерами и хорошими целями для флоатеров. Очень нишево.",
    "e": "22+3=25 MC за 2 MC-прод (10 MC) + тайл города + действие: флоатеры 1/3 VP"
  },
  "St. Joseph of Cupertino Mission": {
    "s": 40,
    "t": "D",
    "y": [
      "Стратегии городов",
      "Накопление VP"
    ],
    "w": "Почти никогда. Только когда нет лучших действий и много городов. Нет тегов и медленная генерация VP делают её слаб...",
    "e": "7+3=10 MC за действие: добавить Cathedral в город (1 VP за Cathedral)",
    "c": "/r/TerraformingMarsGame/comments/1o76wjr/cotd_st_joseph_of_cupertino_mission_15_oct_2025/",
    "r": "In Catholicism, St. Joseph of Cupertino is the patron saint of aviators, flying, studying, and those suffering mental... — BentonSancho"
  },
  "Air Raid": {
    "s": 38,
    "t": "D",
    "y": [
      "Media Group",
      "Interplanetary Cinematics",
      "Вэха Legend",
      "Колония Titan"
    ],
    "w": "Только если вытянута бесплатно, есть лишние флоатеры, и можно ударить по лидеру. Низкий приоритет в драфте.",
    "e": "0+3=3 MC + 1 флоатер (~3 MC) стоимость = 6 MC потрачено"
  },
  "Floater Leasing": {
    "s": 38,
    "t": "D",
    "y": [
      "Колония Titan",
      "Titan Shuttles",
      "Jovian Lanterns",
      "Floating Habs",
      "Celestic"
    ],
    "w": "Только когда уже есть 9+ хранимых флоатеров и осталось 3+ пок. Почти никогда не драфти.",
    "e": "3 MC + 3 MC карта = 6 MC стоимость"
  },
  "Impactor Swarm": {
    "s": 46,
    "t": "D",
    "y": [
      "Helion",
      "Optimal Aerobraking",
      "Награда Thermalist"
    ],
    "w": "Очень редко. Только при игре Jovian и необходимости конвертировать титан в пуш температуры в последнем поколении.",
    "e": "11 MC + 3 MC карта = 14 MC за 12 тепла (~15 MC при 1"
  },
  "Micro-Mills": {
    "s": 38,
    "t": "D",
    "y": [
      "Community Services",
      "Вэха Generalist",
      "Награда Thermalist"
    ],
    "w": "Почти никогда в драфте. Играть, если draw бесплатный и это доводит тепло-прод до кратного 8. Веха Generalist — единств...",
    "e": "Стоимость 3+3=6 MC"
  },
  "Security Fleet": {
    "s": 38,
    "t": "D",
    "y": [
      "Phobolog (только)",
      "Лишний титан без космических карт"
    ],
    "w": "Почти никогда. Только как последне-пок слив титана за VP, и даже тогда 15 MC авансом — круто.",
    "e": "15 MC всего (12+3) за тег Space + действие: потратить 1 титан за 1 VP"
  },
  "Thermophiles": {
    "s": 65,
    "t": "C",
    "y": [
      "Extreme-Cold Fungus",
      "Symbiotic Fungus",
      "Колония Enceladus",
      "Вэха Ecologist",
      "Hoverlord"
    ],
    "w": "Только с внешним источником микробов, питающим каждый ход. Иначе пропускай.",
    "e": "9+3=12 MC за действие: добавить 1 микроба на Venus карту или потратить 2 за 1 Venus TR"
  },
  "Underground City": {
    "s": 38,
    "t": "D",
    "y": [
      "Electro Catapult",
      "Space Elevator",
      "Вэха Mayor",
      "Сброс стали лейт-гейм",
      "Избыток энергии"
    ],
    "w": "Только в последнем пок при избытке энергия-прод и стали для оплаты. Почти никогда не стоит приоритизировать.",
    "e": "18+3=21 MC (оплата сталью) + 2 энергия-прод (15 MC) = 36 MC фактически за тайл города + 2 сталь-прод..."
  },
  "Jet Stream Microscrappers": {
    "s": 36,
    "t": "D",
    "y": [
      "Колония Titan",
      "Вэха Hoverlord",
      "Celestic"
    ],
    "w": "Почти никогда. Только для вехи Hoverlord или при бесплатном размещении floater. Карта-ловушка floater.",
    "e": "12 MC + 3 MC карта = 15 MC"
  },
  "Aquifer Pumping": {
    "s": 35,
    "t": "D",
    "y": [
      "Mining Guild",
      "Interplanetary Cinematics",
      "Rego Plastics",
      "Advanced Alloys",
      "Lakefront Resorts"
    ],
    "w": "Только с Mining Guild и без других вариантов океана, или IC с 20+ избытком стали.",
    "e": "18+3=21 MC авансом + 8 MC за океан (в стали)"
  },
  "Dust Seals": {
    "s": 35,
    "t": "D",
    "y": [
      "Vitor",
      "Sagitta",
      "Community Services",
      "Cutting Edge Technology",
      "Вэха Tactician"
    ],
    "w": "Почти никогда не драфти. Играй только если получена бесплатно или конкретные синергии делают её достаточно дешёвой.",
    "e": "2 MC + 3 MC карта = 5 MC стоимость"
  },
  "Ice Cap Melting": {
    "s": 42,
    "t": "D",
    "y": [
      "Special Design",
      "Inventrix"
    ],
    "w": "Только в лейте, когда видишь, что карта легальна и океаны остаются. Никогда не драфти рано. Никогда не держи в стартовой руке.",
    "e": "5 MC + 3 MC карта = 8 MC за 1 океан (1 TR ~7 MC + бонус размещения ~2-3 MC)"
  },
  "Orbital Reflectors": {
    "s": 35,
    "t": "D",
    "y": [
      "Aphrodite",
      "UNMI",
      "Terraforming Deal",
      "Morning Star Inc",
      "Награда Venuphile"
    ],
    "w": "Почти никогда. Только если Venus в 1-2 шагах от бонуса 16% TR и нужен тег Venus для Venuphile.",
    "e": "Стоимость 26+3=29 MC (оплата титаном)"
  },
  "Venus Magnetizer": {
    "s": 40,
    "t": "D",
    "y": [
      "Robinson Industries",
      "Thorgate",
      "Factorum",
      "Избыток прод энергии",
      "Standard Technology"
    ],
    "w": "Очень редко. Только с избытком энергия-прод и Венера уже высоко. Одна из слабейших карт Venus.",
    "e": "7+3=10 MC за действие: потратить 1 энергия-прод за 1 TR Venus"
  },
  "Asteroid Hollowing": {
    "s": 30,
    "t": "F",
    "y": [
      "Astrodrill",
      "Asteroid Rights",
      "Directed Impactors"
    ],
    "w": "Никогда. Даже с Astrodrill есть лучшее применение для титана.",
    "e": "16+3=19 MC изначально + 1 титан (~3 MC)/действие за 1 MC-прод + 1/2 VP",
    "c": "/r/TerraformingMarsGame/comments/1nkzgse/cotd_asteroid_hollowing_19_sept_2025/",
    "r": "Not a fan of the asteroid cards, it's too hard to get a good combo going and none of them are really that good on the... — MammothMessage3166"
  },
  "Aerial Lenses": {
    "s": 20,
    "t": "F",
    "y": [
      "Helion",
      "Партия Kelvinists"
    ],
    "w": "Никогда. Даже в редком сценарии Kelvinists, -1 VP делает это ловушкой.",
    "e": "2+3=5 MC за 2 тепло-прод (8 MC) - 1 VP (5 MC) - удаление 2 растений незначительная ценность"
  },
  "Underground Detonations": {
    "s": 15,
    "t": "F",
    "y": [
      "Вэха Builder (отчаянная)",
      "Helion (чуть менее плох)",
      "Награда Thermalist (возможно)",
      "Ничего больше",
      "Всё ещё ничего"
    ],
    "w": "Никогда. Если ты сыграл эту карту добровольно, что-то пошло совсем не так.",
    "e": "6+3=9 MC за действие: потратить 10 MC за 2 тепло-прод (8 MC)"
  },
  "Apollo": {
    "s": 30,
    "t": "F",
    "y": [
      "Luna Mining",
      "Корпорации Moon (Luna First)",
      "Стратегии тайлов Moon",
      "Тяжёлый драфт карт Moon"
    ],
    "w": "Практически никогда. Даже в Moon-heavy играх другие CEOs дают больше. Только если альтернативы ещё хуже.",
    "e": "OPG: 3 MC x тайлов Moon (обычно 3-6 тайлов в лейте) = 9-18 MC единоразово"
  },
  "Asimov": {
    "s": 80,
    "t": "A",
    "y": [
      "Любая корпорация с сильной специализацией (Phobolog для Miner, Ecoline для Mayor)",
      "Стратегии с упором на награды",
      "Диверсифицированные движки (чтобы быть 2nd+ в нескольких наградах)"
    ],
    "w": "Почти всегда отличный pick. Особенно хорош если стратегия позволяет быть competitive в 2-3 наградах. Слабее если выну...",
    "e": "Постоянный: +2 очка в 3-4 профинансированных наградах = +4-6 VP (20-30 MC)"
  },
  "Bjorn": {
    "s": 45,
    "t": "D",
    "y": [
      "Дешёвые корпорации (чтобы быть 'беднее' и триггерить стил у обоих)",
      "Бёрст-стратегии лейт-гейма",
      "Helion (тепло как MC делает беднее)"
    ],
    "w": "Слабый pick в 3P. Берём только если альтернативы хуже. Чуть лучше если оба оппонента очевидно богаче тебя на gen 5-6.",
    "e": "OPG: украсть X+2 MC у каждого более богатого оппонента"
  },
  "Caesar": {
    "s": 35,
    "t": "D",
    "y": [
      "Игры с Ares",
      "Агрессивные стратегии",
      "Тайминг лейт-гейма (покол. 6+ для 2 потерь прод)"
    ],
    "w": "Только в Ares играх когда ты позади и нужен catch-up. В целом слабый — нет ongoing, take-that в 3P, и зависимость от ...",
    "e": "OPG: разместить X опасных тайлов (4-е пок = 4 тайла)"
  },
  "Clarke": {
    "s": 75,
    "t": "B",
    "y": [
      "EcoLine (бонус ценности растений)",
      "Helion (тепло как MC)",
      "Растительные стратегии",
      "Стратегии пуша озеленения"
    ],
    "w": "Если играешь greenery/plant стратегию и нужен буст. Средний pick — не хватает ongoing эффекта для конкуренции с топ C...",
    "e": "OPG: +1 растения-прод (8 MC) + +1 тепло-прод (4 MC) + получение растений = растения-прод+4 + получение тепла =..."
  },
  "Co-leadership": {
    "s": 72,
    "t": "B",
    "y": [
      "Любая корпорация (CEO выбирается под неё)",
      "Сильные комбо прелюдий (если вторая прелюдия сильная)",
      "Гибкие стратегии"
    ],
    "w": "Берём если вторая прелюдия сильная и CEO pool в игре включает топовых CEOs (VanAllen, Greta, Gordon). Не берём если а...",
    "e": "Это ПРЕЛЮДИЯ, не CEO"
  },
  "Duncan": {
    "s": 65,
    "t": "C",
    "y": [
      "Любая корпорация (универсальный)",
      "MC-жадные стратегии (поздний OPG)",
      "VP-фокус (ранний OPG покол. 1-2)"
    ],
    "w": "Безопасный default pick если нет лучших CEOs. Gen 1 OPG для 6 VP — неплохой floor. Не берём если есть Greta/Gordon/Va...",
    "e": "OPG: 7-X VP + 4X MC"
  },
  "Ender": {
    "s": 52,
    "t": "D",
    "y": [
      "Terralabs (много карт)",
      "Стратегии карт",
      "Корпорации с дешёвым вытягиванием карт",
      "Когда рука забита Event-картами без целей"
    ],
    "w": "Слабый pick. Берём только если рука совсем плохая и нужна перетасовка. Не берём если есть любой ongoing CEO.",
    "e": "OPG: сбросить до 2X карт, draw столько же"
  },
  "Faraday": {
    "s": 70,
    "t": "B",
    "y": [
      "Point Luna (Earth теги)",
      "Interplanetary Cinematics (Building теги)",
      "Splice (Microbe теги)",
      "Стратегии на теги",
      "Научные билды"
    ],
    "w": "Хорош если корпорация и стратегия накапливают 1-2 типа тегов до 10+. Слабее в diversified стратегиях с 3-4 по каждому...",
    "e": "Постоянный: плати 3 MC за целевой draw карт на каждой 5-й вехе тегов"
  },
  "Floyd": {
    "s": 68,
    "t": "C",
    "y": [
      "Дорогие карты (Terraforming Ganymede, Great Dam, и т.д.)",
      "Корпорации карт (Point Luna, Terralabs)",
      "Удержание дорогих карт для оптимального тайминга"
    ],
    "w": "Берём если в стартовой руке есть дорогая мощная карта (25+ MC). Не берём если рука дешёвая или нет clear target для д...",
    "e": "OPG: сыграй карту на 13+2X MC дешевле"
  },
  "Gaia": {
    "s": 28,
    "t": "F",
    "y": [
      "Только игры с Ares",
      "Стратегии тайлов в Ares",
      "Активация лейт-гейма (больше тайлов = больше бонусов)"
    ],
    "w": "Только в Ares играх с большим количеством тайлов. В стандартном формате — не берём никогда.",
    "e": "OPG: получить бонусы смежности Ares всех тайлов игроков на Марсе"
  },
  "Gordon": {
    "s": 70,
    "t": "B",
    "y": [
      "EcoLine (много озеленений)",
      "Tharsis Republic (города)",
      "Mining Guild (сталь + размещение тайлов)",
      "Любая стратегия тайлов",
      "Вэхи Mayor/Builder"
    ],
    "w": "Почти всегда отличный pick. Особенно силён с tile-heavy стратегиями. Слабее если не планируешь размещать много тайлов...",
    "e": "Постоянно: +2 MC за озеленение/город на Марсе (8-14 MC) + игнорирование ограничений размещения (5-10 MC гибкост..."
  },
  "Greta": {
    "s": 72,
    "t": "B",
    "y": [
      "Любая стратегия TR",
      "Стандартный проект Greenery/Asteroid",
      "Карты подъёма температуры/кислорода",
      "Стратегии терраформинга",
      "Robinson Industries"
    ],
    "w": "Берём ВСЕГДА. Лучший или второй лучший CEO в игре. Единственная причина не брать — VanAllen доступен И ты уверен что ...",
    "e": "OPG (одно поколение!): gain 4 MC per TR raise this gen, max 10"
  },
  "HAL 9000": {
    "s": 45,
    "t": "D",
    "y": [
      "Бёрст лейт-гейма (покол. 7-8)",
      "Manutech (триггеры подъёма прод)",
      "Когда нужны ресурсы СЕЙЧАС для финального пуша"
    ],
    "w": "Слабый pick. Только если нужен burst ресурсов в последние 1-2 поколения. Не берём если есть ongoing CEO.",
    "e": "OPG: -1 каждого продакшена, +4 каждого ресурса"
  },
  "Huan": {
    "s": 75,
    "t": "B",
    "y": [
      "Poseidon",
      "Aridor",
      "Стратегии колоний",
      "Polyphemos (доход торговли)",
      "Стратегии множественных колоний"
    ],
    "w": "Отличный pick в colony-heavy играх. Gain 1 Trade Fleet = потенциально 35-70 MC за игру. Не берём если не планируешь а...",
    "e": "Постоянный: оппоненты не могут торговать в следующем поколении + получи 1 Торговый Флот"
  },
  "Ingrid": {
    "s": 60,
    "t": "C",
    "y": [
      "EcoLine (много озеленений)",
      "Tharsis Republic (города)",
      "Mining Guild",
      "Стратегии тайлов",
      "Gordon (если оба доступны — дрим-комбо)"
    ],
    "w": "Берём если планируешь 5+ тайлов на Марсе. Отличный с ground game стратегиями. Слабее в pure card/VP/Venus/Colonies ст...",
    "e": "OPG одно-пок: draw карты за каждый тайл Марса, размещённый В ЭТОМ ПОКОЛЕНИИ"
  },
  "Jansson": {
    "s": 60,
    "t": "C",
    "y": [
      "Стратегии тайлов",
      "Тайлы на бонусных спотах",
      "Mining Guild (бонусы стали)",
      "EcoLine (растительные бонусы)"
    ],
    "w": "Средний pick. Лучше если уже разместил 4+ тайлов на бонусных клетках. Не берём если тайлов мало или бонусы слабые.",
    "e": "OPG: получить все бонусы размещения под твоими тайлами на Марсе"
  },
  "Karen": {
    "s": 73,
    "t": "B",
    "y": [
      "Любая корпорация (универсально)",
      "Прелюдии прод (покол. 2-3)",
      "Прелюдии мгновенной ценности (любое покол.)",
      "Пул Prelude 2 (больше опций)"
    ],
    "w": "Хороший safe pick. Гарантированная прелюдия ~28-35 MC. Лучше gen 3-4 для баланса выбора и production value. Не берём ...",
    "e": "OPG: вытяни X прелюдий (X = текущее пок), сыграй одну бесплатно"
  },
  "Lowell": {
    "s": 62,
    "t": "C",
    "y": [
      "Любая стратегия (wild тег покол. 1)",
      "Надежда на топ-тир CEO в драфте",
      "Гибкие стратегии адаптирующиеся к любому CEO"
    ],
    "w": "Берём если остальные CEO options слабые. Wild тег gen 1 = milestone help. Не берём если уже есть хороший CEO (Greta, ...",
    "e": "OPG: заплати 8 MC, вытяни 3 CEO, сыграй одного, сбрось Lowell"
  },
  "Maria": {
    "s": 62,
    "t": "C",
    "y": [
      "Poseidon",
      "Aridor",
      "Naomi CEO",
      "Productive Outpost",
      "Карты колоний"
    ],
    "w": "Берём при colony-heavy стратегии с Poseidon/Aridor и 2+ colony cards в руке. Не берём если колонии — побочный ресурс,...",
    "e": "OPG: вытянуть X colony tiles (X = gen number), выбрать одну, поставить + бесплатная колония"
  },
  "Musk": {
    "s": 65,
    "t": "C",
    "y": [
      "Phobolog (+1 к ценности Ti)",
      "Point Luna (вытягивание Earth карт для сброса)",
      "Teractor",
      "Стратегия Space тега",
      "Credicor (дорогие космические карты)"
    ],
    "w": "Берём с Phobolog (титан стоит 4 MC), при наличии 2-3 expendable Earth карт в руке. Не берём при Earth-focused engine ...",
    "e": "OPG: сбросить X Earth карт → вытянуть X Space карт + X+6 титана"
  },
  "Naomi": {
    "s": 82,
    "t": "A",
    "y": [
      "Poseidon",
      "Aridor",
      "Карты Trade Fleet",
      "Карты требующие энергию",
      "Productive Outpost"
    ],
    "w": "Берём всегда когда доступна Colony стратегия (т.е. почти всегда в нашем формате). Особенно сильна с Poseidon (2 MC pe...",
    "e": "Ongoing: +2 energy + 3 MC при строительстве колонии"
  },
  "Neil": {
    "s": 45,
    "t": "D",
    "y": [
      "Корпорации Moon (Luna Trade Federation, Nanotech)",
      "Карты с тегом Moon",
      "Стратегия подъёма рейтов Moon"
    ],
    "w": "Только при наличии Moon корпорации + Moon карт в стартовой руке. В большинстве партий Moon activity недостаточна для ...",
    "e": "OPG: +MC-прод = наименьший показатель Луны"
  },
  "Oscar": {
    "s": 80,
    "t": "A",
    "y": [
      "Корпорации Turmoil",
      "Карты делегатов",
      "Colonial Representation",
      "Политическая стратегия",
      "Синергия бонуса правящей (Mars First + Building теги)"
    ],
    "w": "Берём при Turmoil-aware стратегии — т.е. почти всегда. Особенно силён когда Reds threatening или когда можешь стабиль...",
    "e": "Постоянно: +1 влияние навсегда"
  },
  "Petra": {
    "s": 60,
    "t": "C",
    "y": [
      "Корпорации Turmoil",
      "Стратегия председателя",
      "Выравнивание бонуса правящей",
      "Карты делегатов"
    ],
    "w": "Берём когда важен конкретный political outcome (block Reds, claim Chairman для 1 TR). Не берём как default — Oscar зн...",
    "e": "OPG: заменить всех Neutral delegates своими + 3 MC за каждого + поставить 3 Neutral"
  },
  "Quill": {
    "s": 48,
    "t": "D",
    "y": [
      "Dirigibles",
      "Celestic",
      "Stratopollution",
      "Карты сбора флоатеров",
      "Стратегия Venus"
    ],
    "w": "Только при наличии 3+ floater карт И Celestic/Dirigibles. В остальных случаях — trap. Floater engine в 3P слишком нес...",
    "e": "OPG: +2 floaters на каждую твою floater карту + 2 floaters на любую + 0"
  },
  "Rogers": {
    "s": 48,
    "t": "D",
    "y": [
      "Morning Star Inc",
      "Aphrodite",
      "Карты с тегом Venus",
      "Stratospheric Birds",
      "Venus Governor"
    ],
    "w": "Берём с Morning Star Inc или при 3+ Venus карт в стартовой руке. Не берём без Venus фокуса — скидки на 0 карт = 0 value.",
    "e": "OPG на одно пок: игнорируй требования Venus + -3 MC за тег Venus В ЭТОМ ПОКОЛЕНИИ"
  },
  "Ryu": {
    "s": 58,
    "t": "C",
    "y": [
      "Корпорации с перекосом прод (Helion — heat)",
      "Прелюдии с теплом",
      "Карты с упором на энергию",
      "Корректировка MC-прод лейт-гейма"
    ],
    "w": "Берём когда production profile перекошен (много heat/energy, мало MC/steel). Не берём при сбалансированном engine — s...",
    "e": "OPG: свопнуть до X+2 production между двумя ресурсами (X = gen)"
  },
  "Shara": {
    "s": 42,
    "t": "D",
    "y": [
      "Корпорации Pathfinders",
      "Карты фокуса планетарных треков",
      "Стратегии на теги (вэхи)"
    ],
    "w": "Практически никогда. Даже с Pathfinders корпорациями value слишком низок. Берём только если нет альтернатив.",
    "e": "OPG: выбрать planetary tag, получить 2 тега этого типа + MC = track value - gen number"
  },
  "Stefan": {
    "s": 70,
    "t": "B",
    "y": [
      "Корпорации карт (Point Luna, Inventrix)",
      "Вэха Planner (16 карт)",
      "Стратегии карт",
      "Конвертация VP лейт-гейма"
    ],
    "w": "Берём при card-draw engine или когда рука большая (8+ карт). Особенно с Point Luna — draw много Earth карт, sell нену...",
    "e": "OPG: продавай карты по 3 MC (вместо обычного 1 MC)"
  },
  "Tate": {
    "s": 61,
    "t": "C",
    "y": [
      "Стратегии на теги (Science, Jovian)",
      "Корпорации карточных синергий",
      "Погоня за вэхами (конкретные теги)",
      "Оптимизация наград"
    ],
    "w": "Берём когда нужна конкретная карта/тег для стратегии (ищешь Decomposers для bio engine, или Science для Scientist awa...",
    "e": "OPG: назвать тег → показывать карты из деки пока не найдёшь 5 с этим тегом → КУПИТЬ до 2"
  },
  "Ulrich": {
    "s": 65,
    "t": "C",
    "y": [
      "Стратегия размещения океанов",
      "Arctic Algae",
      "Финансирование стандартных проектов",
      "Пуш VP лейт-гейма"
    ],
    "w": "Берём как reliable cash injection (20-28 MC). Хорош для финального push. Не берём если есть CEO с ongoing effects — p...",
    "e": "OPG: 4 MC x размещённые океаны (жёсткий потолок 15 MC при всех 9)"
  },
  "Van Allen": {
    "s": 92,
    "t": "S",
    "y": [
      "Любая корпорация (универсально)",
      "Гибкие стратегии (мульти-тег)",
      "Игра на вэхи",
      "Ecoline (Gardener)",
      "IC (Builder)"
    ],
    "w": "ВСЕГДА берём. Единственный CEO который almost never wrong pick. Claim 2-3 milestones бесплатно + passive income = gam...",
    "e": "Ongoing: milestones БЕСПЛАТНО (0 MC вместо 8 MC) + 3 MC при claim любого milestone любым игроком"
  },
  "Will": {
    "s": 52,
    "t": "D",
    "y": [
      "Arklight",
      "Splice",
      "Карты VP животных (Birds, Fish)",
      "Decomposers",
      "Dirigibles"
    ],
    "w": "Берём только при 3+ resource-collecting cards разных типов. С полным bio+floater engine — приличный VP boost. Не берё...",
    "e": "OPG: +2 animals + 2 microbes + 2 floaters + 2 wild на свои карты"
  },
  "Xavier": {
    "s": 72,
    "t": "B",
    "y": [
      "Вэхи на теги (Diversifier, Builder)",
      "Стратегии с требованиями",
      "Научные карты",
      "Любая корпорация (универсальная скидка)"
    ],
    "w": "Берём как solid B-tier pick при отсутствии S/A CEO. Wild теги + ongoing discount = стабильная ценность. Не берём вмес...",
    "e": "OPG: 2 wild тега на этот gen (milestones, tag requirements, discounts)"
  },
  "Xu": {
    "s": 55,
    "t": "C",
    "y": [
      "Morning Star Inc",
      "Aphrodite",
      "Стратегия Venus тега",
      "Карты Venus"
    ],
    "w": "Берём с Venus корпорацией + Venus focus (гарантирует лидерство = +8 MC). Не берём без Venus стратегии — value слишком...",
    "e": "OPG: +2 MC за тег Venus в игре (все игроки) + 8 MC бонус при наибольшем числе тегов Venus"
  },
  "Yvonne": {
    "s": 56,
    "t": "C",
    "y": [
      "Poseidon",
      "Стратегия колоний",
      "Колония Luna (MC-прод)",
      "Ganymede (прод растений)",
      "Синергии прод"
    ],
    "w": "Берём при 3+ колониях с production bonuses (Luna, Ganymede). Не берём с 0-1 колониями или resource-only bonuses (Tita...",
    "e": "OPG: получить все colony bonuses дважды"
  },
  "Zan": {
    "s": 78,
    "t": "B",
    "y": [
      "Стратегия терраформинга",
      "TR-раш",
      "Политические манипуляции",
      "Стандартные проекты (Asteroid, Greenery)",
      "Любая корпорация с частым TR"
    ],
    "w": "Берём при TR-heavy стратегии. Особенно силён когда Reds threatening или когда хочешь force Reds на оппонентов через O...",
    "e": "Ongoing: иммунитет к Reds ruling policy (-3 MC per TR raise)"
  },
  "Adhai High Orbit Constructions": {
    "s": 48,
    "t": "D",
    "y": [
      "Карты с тегом Space",
      "Orbital Cleanup",
      "VP в стиле Search for Life"
    ],
    "w": "Почти никогда. VP engine слишком медленный для 3P/WGT формата.",
    "e": "43 MC + Space тег"
  },
  "Ambient": {
    "s": 60,
    "t": "C",
    "y": [
      "Карты с тегом Venus",
      "Stratospheric Birds",
      "Dirigibles",
      "Sulphur Exports",
      "Venus Governor"
    ],
    "w": "Только с сильными Venus картами в руке (Stratospheric Birds, Dirigibles). Слабый стартовый капитал требует компенсаци...",
    "e": "38 MC — очень низкий старт (-25 от среднего)"
  },
  "Aurorai": {
    "s": 72,
    "t": "B",
    "y": [
      "Standard Technology",
      "Стратегия терраформинга",
      "Любые карты поднятия TR",
      "Карты размещения Data",
      "Синергии Mars тега"
    ],
    "w": "Берём с прелюдиями, дающими MC/production (компенсация низкого старта). Хороша с Standard Technology. Пропускай если ...",
    "e": "33 MC — один из самых низких стартов"
  },
  "Bio-Sol": {
    "s": 50,
    "t": "D",
    "y": [
      "Карты с тегом Plant",
      "Карты с тегом Animal",
      "Decomposers",
      "Splice"
    ],
    "w": "Bio-heavy стартовая рука с дешёвыми Plant/Animal картами. Splice combo. Без bio тегов — пропускай.",
    "e": "42 MC + Microbe тег"
  },
  "Chimera": {
    "s": 62,
    "t": "C",
    "y": [
      "Вэхи с разнообразием тегов",
      "Карты с требованиями тегов",
      "Вэха Diversifier"
    ],
    "w": "Почти никогда. 2 wild тега не компенсируют отсутствие реальных бонусов. Diversifier на Hellas — единственный сценарий...",
    "e": "48 MC + 2 Wild тега"
  },
  "Collegium Copernicus": {
    "s": 76,
    "t": "B",
    "y": [
      "Стратегия колоний (Pluto, Luna, Titan)",
      "Карты с тегом Science",
      "Карты с тегом Earth",
      "Mars University",
      "Research"
    ],
    "w": "Обязательно Colonies в игре. С Science картами в руке + хорошие колонии = отличный pick. Без Colonies — пропускай.",
    "e": "33 MC — очень низкий старт"
  },
  "Gagarin Mobile Base": {
    "s": 72,
    "t": "B",
    "y": [
      "Бонусы соседства городов",
      "Размещение озеленения",
      "Вэха Mayor",
      "Rover Construction"
    ],
    "w": "Когда город-стратегия жизнеспособна. Mayor milestone goal. Adjacency bonuses на карте хорошие.",
    "e": "36 MC + мобильная база (city tile)"
  },
  "Habitat Marte": {
    "s": 78,
    "t": "B",
    "y": [
      "Mars University",
      "Olympus Conference",
      "Designed Organisms",
      "Карты Mars тега из Pathfinders"
    ],
    "w": "Когда Mars University или Olympus Conference в стартовых + несколько Mars-тег карт. На Tharsis (Scientist milestone) ...",
    "e": "40 MC — ниже среднего на 23 MC"
  },
  "Mars Direct": {
    "s":58,
    "t": "C",
    "y": [
      "Карты Mars тега из Pathfinders",
      "Mars University",
      "HabitatMarte"
    ],
    "w": "Mars-тег карты в стартовой руке. Без Mars карт discount бесполезен.",
    "e": "44 MC + Mars тег"
  },
  "Mars Maths": {
    "s": 76,
    "t": "B",
    "y": [
      "Mars University",
      "Research",
      "Olympus Conference",
      "Карты с тегом Science"
    ],
    "w": "Science-heavy стартовая рука (3+ Science тегов). С Research или Mars University — лучше. Без Science карт в руке — сл...",
    "e": "42 MC + 1 MC-prod + Science тег"
  },
  "Martian Insurance Group": {
    "s": 66,
    "t": "C",
    "y": [
      "Игры с агрессивными игроками",
      "Синергии Mars тега",
      "Оборонительная игра"
    ],
    "w": "Meta с агрессивными игроками (много attack карт). Иначе ability почти не тригерится.",
    "e": "42 MC + Mars тег"
  },
  "Mind Set Mars": {
    "s": 35,
    "t": "D",
    "y": [
      "Карты с тегом Building",
      "Стратегия Turmoil"
    ],
    "w": "Слабая корпорация. Условная скидка на building — ненадёжна, 44 MC старт ниже среднего, no-tag penalty убивает синергии.",
    "e": "44 MC — значительно ниже среднего"
  },
  "Odyssey": {
    "s": 78,
    "t": "B",
    "y": [
      "Дешёвые карты событий (≤16 MC)",
      "Virus",
      "Asteroid Mining",
      "Subterranean Reservoir",
      "Media Group"
    ],
    "w": "Берём ТОЛЬКО с хорошими дешёвыми events в руке. Без events — 33 MC no-tag корпорация = катастрофа.",
    "e": "33 MC — очень низкий старт"
  },
  "Polaris": {
    "s": 86,
    "t": "A",
    "y": [
      "Карты размещения океанов",
      "Arctic Algae",
      "Ice Asteroid",
      "Kelp Farming",
      "Прелюдия Great Aquifer"
    ],
    "w": "Берём с ocean-прелюдиями или ocean-картами в руке. Прелюдии ОБЯЗАТЕЛЬНО должны компенсировать 32 MC start. Без них — ...",
    "e": "32 MC — очень низкий"
  },
  "Ringcom": {
    "s": 76,
    "t": "B",
    "y": [
      "Игры с колониями",
      "Карты с тегом Earth",
      "Poseidon",
      "Стратегии торговли"
    ],
    "w": "Colony games с хорошими колониями. Earth теги в руке усиливают trade бонус. Без Colonies — значительно слабее.",
    "e": "40 MC + 3 торговых флота"
  },
  "Robin Haulings": {
    "s": 58,
    "t": "C",
    "y": [
      "Карты атаки",
      "Hackers",
      "Energy Tapping",
      "Predators"
    ],
    "w": "Почти никогда в 3P. Take-that стратегия проигрышна — помогаешь третьему. Только если оба оппонента — слабые игроки.",
    "e": "39 MC"
  },
  "SolBank": {
    "s": 80,
    "t": "A",
    "y": [
      "Любая активная стратегия (частые траты)",
      "Стандартные проекты",
      "Торговля колониями",
      "Любая покупка карт",
      "Заявки на вэхи/награды"
    ],
    "w": "Берём почти всегда. Универсальная корпорация. Слабее только при passive/low-spending стратегии (редко).",
    "e": "40 MC"
  },
  "Soylent Seedling Systems": {
    "s": 68,
    "t": "C",
    "y": [
      "Карты растительной прод",
      "Карты озеленения",
      "Kelp Farming",
      "Farming",
      "Стратегия в стиле EcoLine"
    ],
    "w": "Берём с plant-heavy рукой и plant прелюдиями. На Tharsis (Gardener milestone) лучше. Без plant strategy — пропускай.",
    "e": "38 MC — низкий старт"
  },
  "Steelaris": {
    "s": 70,
    "t": "B",
    "y": [
      "Стратегии городов",
      "Карты с тегом Building",
      "Вэха Builder (Tharsis)",
      "Конвертация растений",
      "Advanced Alloys"
    ],
    "w": "Берём с building картами в руке. В играх с ожидаемым множеством city placements — лучше. Generic pick средней силы.",
    "e": "42 MC"
  },
  "CO² Reducers": {
    "s": 78,
    "t": "B",
    "y": [
      "Корпорация Splice",
      "Decomposers",
      "Ants",
      "Планетарный трек Venus",
      "Стратегия микробов"
    ],
    "w": "Берём почти всегда — 3 MC-prod универсально полезна. Ещё лучше с microbe/Venus стратегией.",
    "e": "+3 MC-прод (ценность 17 MC в 1 пок) + draw 2 карт микробов (~7 MC)"
  },
  "Crew Training": {
    "s": 65,
    "t": "C",
    "y": [
      "Стратегии вэх (Rim Settler, Diversifier)",
      "Продвижение планетарных треков",
      "Корпорации на теги (Point Luna = Earth)",
      "Habitat Marte (Mars = двойной Science)"
    ],
    "w": "Берём когда конкретные теги критичны (Rim Settler milestone, planetary track race). Пропускай если нужна экономика ge...",
    "e": "2 planetary тега по выбору"
  },
  "Deep Space Operations": {
    "s": 72,
    "t": "B",
    "y": [
      "Корпорации Space тега (Phobolog = ti стоит 4)",
      "Карты за титан",
      "Космические события",
      "Asteroid Mining",
      "Comet"
    ],
    "w": "Берём с Space стратегией и titanium-friendly корпорацией. Phobolog + Deep Space Ops = отличная комбинация.",
    "e": "+4 titanium (12 MC immediate) + draw 2 Space event cards (~7 MC, но Space events часто хорошие: A..."
  },
  "Design Company": {
    "s": 74,
    "t": "B",
    "y": [
      "Корпорация IC",
      "Mining Guild",
      "Cheung Shing MARS",
      "Карты с тегом Building",
      "Стратегия стали"
    ],
    "w": "Берём с building/steel стратегией. IC + Design Company = strong combo. Средний pick без steel focus.",
    "e": "+1 сталь-прод (8 MC ценность в 1 пок) + вытяни 3 building карты (~10"
  },
  "Experienced Martians": {
    "s": 68,
    "t": "C",
    "y": [
      "Стратегия Mars тега",
      "HabitatMarte",
      "Mars Direct",
      "Стратегии Turmoil"
    ],
    "w": "Filler прелюдия. 2 MC-prod и delegate нормально, Mars cards draw — бонус.",
    "e": "2 MC-прод (10-12 MC) + 1 делегат (3 MC) + draw 2 карты с тегом Mars"
  },
  "Hydrogen Bombardment": {
    "s": 80,
    "t": "A",
    "y": [
      "Космическая стратегия",
      "Стратегия Venus",
      "Карты за титан",
      "Корпорация Phobolog",
      "Планетарный трек Venus"
    ],
    "w": "Берём почти всегда — one of the best preludes. Особенно с Space/Venus стратегией.",
    "e": "+1 шкала Venus (1 TR = 7 MC) + 1 титан-прод (12"
  },
  "Personal Agenda": {
    "s": 72,
    "t": "B",
    "y": [
      "Корпорации событий (Odyssey, MIG)",
      "Media Group",
      "Стратегия карт событий",
      "Вэха Legend (Elysium)"
    ],
    "w": "Берём как generic production прелюдию. 3 MC-prod хороша всегда. Events — бонус.",
    "e": "+3 MC-прод (ценность 17 MC в 1 пок) + draw 3 не-Space карт событий (~10"
  },
  "Research Grant": {
    "s": 82,
    "t": "A",
    "y": [
      "Научная стратегия",
      "Mars University",
      "Olympus Conference",
      "Research",
      "Награда/вэха Scientist"
    ],
    "w": "Берём почти всегда — 14 MC + 2 Science тега = top-tier value. Особенно с Science-dependent картами.",
    "e": "+1 энергия-прод (7"
  },
  "Survey Mission": {
    "s": 76,
    "t": "B",
    "y": [
      "Стратегия размещения городов",
      "Соседство озеленений",
      "Корпорации тайлов (Philares, Steelaris)",
      "Вэха Builder",
      "Карта Tharsis"
    ],
    "w": "Берём с tile-placing стратегией на map-dependent играх. На Tharsis — чуть лучше.",
    "e": "+5 стали (10 MC) + резервирование 3 мест треугольником (бонусы размещения ~3-8 MC + стратегическая ценность)"
  },
  "The New Space Race": {
    "s": 70,
    "t": "B",
    "y": [
      "Стратегия Turmoil",
      "Корпорации Science + Earth тега",
      "Политические манипуляции",
      "Преимущество политики Greens/Scientists"
    ],
    "w": "Берём с Turmoil в игре и когда первый ход даёт стратегическое преимущество. Science + Earth теги ценны сами по себе.",
    "e": "+12 MC сразу"
  },
  "Valuable Gases": {
    "s": 76,
    "t": "B",
    "y": [
      "Dirigibles",
      "Корпорация Celestic",
      "Stratospheric Birds (если активный флоатер)",
      "Карты флоатеров",
      "Стратегия Venus"
    ],
    "w": "ТОЛЬКО с активной floater картой в руке (Dirigibles, Celestic). Без неё — слабая прелюдия.",
    "e": "+10 MC + сыграй бесплатно активную карту флоатеров (игнорируя требования) + 5 флоатеров на неё"
  },
  "Venus First": {
    "s": 73,
    "t": "B",
    "y": [
      "Стратегия Venus",
      "Корпорации Venus тега (Morning Star, Ambient, Robin Haulings)",
      "Планетарный трек Venus",
      "Stratospheric Birds"
    ],
    "w": "Берём с Venus стратегией. 2 TR gen 1 всегда приятно. Без Venus фокуса — средняя.",
    "e": "+2 шкалы Venus (2 TR = 14 MC) + вытяни 2 Venus карты (~7 MC)"
  },
  "Vital Colony": {
    "s": 79,
    "t": "B",
    "y": [
      "Стратегия колоний",
      "Корпорация Poseidon",
      "Колонии Luna/Ganymede/Pluto",
      "Планетарные треки Mars/Space",
      "Карты колониальной торговли"
    ],
    "w": "Берём с Colonies в игре и сильными колониями (Luna, Ganymede). Пропускай без Colonies.",
    "e": "Размещение колонии (13-17 MC ценности в зависимости от колонии) + получить бонус размещения ДВАЖДЫ"
  },
  "Advanced Power Grid": {
    "s": 72,
    "t": "B",
    "y": [
      "Thorgate",
      "Energy Tapping",
      "High-Temp Superconductors",
      "Power Infrastructure",
      "Geothermal Power"
    ],
    "w": "При наличии 1+ Power тега в engine. Отличная с Thorgate. Steel payable (Building тег).",
    "e": "21 MC total (18+3) за 2 energy-prod (15 MC) + X MC-prod (5-6 MC each)"
  },
  "Agro-Drones": {
    "s": 52,
    "t": "D",
    "y": [
      "EcoLine",
      "Mining Guild",
      "Thorgate",
      "Производители стали/энергии"
    ],
    "w": "Только если есть избыток steel И energy одновременно. В большинстве случаев — skip.",
    "e": "17 MC всего (14+3)"
  },
  "Anthozoa": {
    "s": 63,
    "t": "C",
    "y": [
      "EcoLine",
      "Ecological Zone",
      "Large Convoy",
      "Imported Nitrogen",
      "NRA"
    ],
    "w": "При plant engine + animal placement карт. Тройной тег привлекателен для Mars track.",
    "e": "12 MC всего (9+3)"
  },
  "Asteroid Resources": {
    "s": 74,
    "t": "B",
    "y": [
      "Phobolog",
      "Io Mining Industries",
      "Ganymede Colony",
      "Карты трека Jupiter"
    ],
    "w": "При наличии energy production. Отличная для Jovian strategy. Ti payable.",
    "e": "20 MC всего (17+3)"
  },
  "Botanical Experience": {
    "s": 66,
    "t": "C",
    "y": [
      "Habitat Marte",
      "Карты Data синергий",
      "Научные награды",
      "Движок растений"
    ],
    "w": "При Science/Mars strategy и наличии greenery планов.",
    "e": "17 MC всего (14+3)"
  },
  "Breeding Farms": {
    "s": 73,
    "t": "B",
    "y": [
      "Birds",
      "Fish",
      "Livestock",
      "Predators",
      "Ecological Zone"
    ],
    "w": "При наличии animal VP карт + plant production. Science+Animal теги нужны до розыгрыша.",
    "e": "19 MC всего (16+3)"
  },
  "Cassini Station": {
    "s": 62,
    "t": "C",
    "y": [
      "Стратегии колоний",
      "Power Infrastructure",
      "Карты конвертации",
      "Thorgate"
    ],
    "w": "Только при 4+ колониях в игре на момент розыгрыша. Иначе too slow.",
    "e": "26 MC всего (23+3)"
  },
  "Ceres Spaceport": {
    "s": 77,
    "t": "B",
    "y": [
      "Io Mining Industries",
      "Ganymede Colony",
      "Space Station",
      "Jupiter Floating Station",
      "Phobolog"
    ],
    "w": "При 2+ Jovian тегах до розыгрыша. С Phobolog — S-tier. Без Jovian engine — переоценена.",
    "e": "39 MC всего (36+3), оплата титаном"
  },
  "Charity Donation": {
    "s": 65,
    "t": "C",
    "y": [
      "Odyssey",
      "Mars Direct",
      "Martian Insurance Group",
      "Трек Mars"
    ],
    "w": "Если нужен Mars тег или 1 VP дёшево. Помни — оппоненты тоже получают карты.",
    "e": "10 MC всего (7+3)"
  },
  "Communication Center": {
    "s": 70,
    "t": "B",
    "y": [
      "Habitat Marte",
      "Синергии Data",
      "Трек Mars",
      "Научные вэхи"
    ],
    "w": "При наличии energy production и Science/Mars strategy. Steel payable делает её очень дешёвой.",
    "e": "11 MC всего (8+3)"
  },
  "Controlled Bloom": {
    "s": 67,
    "t": "C",
    "y": [
      "Decomposers",
      "Psychrophiles",
      "Splice",
      "Virus",
      "EcoLine"
    ],
    "w": "При наличии microbe targets (Decomposers/GHG Producing Bacteria). Без них — skip.",
    "e": "16 MC всего (13+3)"
  },
  "Coordinated Raid": {
    "s": 64,
    "t": "C",
    "y": [
      "Игры с колониями",
      "Titan",
      "Luna",
      "Бонусы торгового флота"
    ],
    "w": "При наличии ценных колоний (Titan, Luna). No tags = penalty.",
    "e": "8 MC всего (5+3)"
  },
  "Crashlanding": {
    "s": 40,
    "t": "D",
    "y": [
      "Дополнение Ares",
      "Стратегии соседства тайлов"
    ],
    "w": "Только с Ares expansion и хорошей позицией на доске. Без Ares — F-tier.",
    "e": "23 MC всего (20+3)"
  },
  "Oumuamua Type Object Survey": {
    "s": 42,
    "t": "D",
    "y": [
      "Карты Data VP",
      "Научная стратегия",
      "Оплата титаном"
    ],
    "w": "Вероятно лучше, чем видно из truncated description. На основе данных — weak.",
    "e": "23 MC всего (20+3), оплата титаном"
  },
  "Cryptocurrency": {
    "s": 51,
    "t": "D",
    "y": [
      "Thorgate",
      "Карты излишков энергии",
      "Карты Data синергий"
    ],
    "w": "Почти никогда. Есть гораздо лучшие способы использовать energy. Stall value минимальный.",
    "e": "9 MC всего (6+3)"
  },
  "Cultivation of Venus": {
    "s": 73,
    "t": "B",
    "y": [
      "Корпорации Venus стратегии",
      "Morning Star Inc",
      "Aphrodite",
      "Трек Venus"
    ],
    "w": "Только при deep Venus strategy с 3+ Venus тегами и plant production surplus.",
    "e": "21 MC всего (18+3)"
  },
  "Cyanobacteria": {
    "s": 74,
    "t": "B",
    "y": [
      "Decomposers",
      "GHG Producing Bacteria",
      "Splice",
      "Psychrophiles",
      "Tardigrades"
    ],
    "w": "При наличии microbe targets и 3+ океанов. Mars тег для track bonus.",
    "e": "15 MC всего (12+3)"
  },
  "Data Leak": {
    "s": 52,
    "t": "D",
    "y": [
      "Martian Repository",
      "Martian Culture",
      "Economic Espionage",
      "Карты Data VP"
    ],
    "w": "Только при наличии карты с 1 VP/2-3 data. Без data targets — trap.",
    "e": "8 MC всего (5+3)"
  },
  "Declaration of Independence": {
    "s": 45,
    "t": "D",
    "y": [
      "HabitatMarte"
    ],
    "w": "Никогда.",
    "e": "20+3=23 MC"
  },
  "Designed Organisms": {
    "s": 50,
    "t": "D",
    "y": [
      "Habitat Marte",
      "Научные билды",
      "EcoLine",
      "Прод растений"
    ],
    "w": "Только при Habitat Marte или 4+ Science тегах уже в engine. Иначе мёртвая карта.",
    "e": "16 MC всего (13+3)"
  },
  "Dust Storm": {
    "s": 61,
    "t": "C",
    "y": [
      "Трек Mars",
      "Билды с низкой энергией",
      "Раш температуры"
    ],
    "w": "Когда temperature далеко от max и у оппонентов energy surplus. Без этих условий — слабый TR.",
    "e": "20 MC всего (17+3)"
  },
  "Dyson Screens": {
    "s": 85,
    "t": "A",
    "y": [
      "Phobolog",
      "Прод титана",
      "Трек Venus",
      "Соседство городов",
      "Thorgate"
    ],
    "w": "Почти всегда при наличии ti для оплаты. Даже без ti-дисконта — сильная. A-tier уверенно.",
    "e": "31 MC всего (28+3), оплата титаном"
  },
  "Early Expedition": {
    "s": 69,
    "t": "C",
    "y": [
      "Tharsis Republic",
      "Вэха Mayor",
      "Соседство городов",
      "Научные вэхи"
    ],
    "w": "Gen 1-2 только. Ti payable. Хорошо с city strategy. После -16°C — мёртвая карта.",
    "e": "18 MC всего (15+3), оплата титаном"
  },
  "Economic Espionage": {
    "s": 68,
    "t": "C",
    "y": [
      "Point Luna",
      "Earth Office",
      "Карты Data VP",
      "Martian Repository",
      "Трек Earth"
    ],
    "w": "При Earth strategy или наличии хороших data targets. Дешёвый Earth тег.",
    "e": "11 MC всего (8+3)"
  },
  "Economic Help": {
    "s": 58,
    "t": "C",
    "y": [
      "Стратегии планетарных треков",
      "Бонусы порогов треков"
    ],
    "w": "Когда нужные треки close к threshold. No tags = penalty. Ситуативная.",
    "e": "12 MC всего (9+3)"
  },
  "Expedition to the Surface - Venus": {
    "s": 70,
    "t": "B",
    "y": [
      "Morning Star Inc",
      "Стратегия Venus",
      "Aphrodite",
      "Карты трека Venus"
    ],
    "w": "При 2+ Venus тегах. Card draw + TR хорошая комбинация. Venus track bonus.",
    "e": "19 MC всего (16+3)"
  },
  "Flat Mars Theory": {
    "s": 73,
    "t": "B",
    "y": [
      "Трек Earth",
      "Point Luna",
      "Билды без Science",
      "Ранняя экономика"
    ],
    "w": "Gen 1-3 при отсутствии Science engine планов. Чем раньше — тем лучше.",
    "e": "11 MC всего (8+3)"
  },
  "Floater-Urbanism": {
    "s": 45,
    "t": "D",
    "y": [
      "Стратегия Venus",
      "Генераторы флоатеров",
      "Morning Star Inc"
    ],
    "w": "Только при deep Venus strategy с 3+ Venus тегами + floater source. Очень нишевая.",
    "e": "10 MC всего (7+3)"
  },
  "Geological Expedition": {
    "s": 76,
    "t": "B",
    "y": [
      "Карты городов",
      "Стратегия озеленения",
      "Mining Rights",
      "Mining Area",
      "Habitat Marte"
    ],
    "w": "При активном tile placement (cities + greeneries). Чем раньше — тем больше triggers.",
    "e": "21 MC всего (18+3)"
  },
  "High Temp. Superconductors": {
    "s": 82,
    "t": "A",
    "y": [
      "Thorgate",
      "Карты Power",
      "Прод энергии",
      "Прод тепла",
      "Партия Kelvinists"
    ],
    "w": "Имба. 3 energy-prod + 3 heat-prod за 13 MC total. Мощнейший старт production при любой стратегии.",
    "e": "13 MC total → 6 production = 2.17 MC/prod, отличный rate"
  },
  "Huygens Observatory": {
    "s": 75,
    "t": "B",
    "y": [
      "Miranda",
      "Titan",
      "Luna",
      "Стратегии колоний",
      "Phobolog"
    ],
    "w": "При наличии ценных колоний для дублирования. Ti payable важен для affordability.",
    "e": "30 MC всего (27+3), оплата титаном"
  },
  "Hydrogen Processing Plant": {
    "s": 56,
    "t": "C",
    "y": [
      "Оплата сталью",
      "Стратегия Power",
      "Продление игры"
    ],
    "w": "Ситуативная карта. -1 VP penalty нужно компенсировать strong production gain.",
    "e": "12 MC всего (9+3), оплата сталью"
  },
  "Interplanetary Transport": {
    "s": 64,
    "t": "C",
    "y": [
      "Трек Jovian",
      "Трек Earth",
      "Point Luna",
      "Space Station",
      "Phobolog"
    ],
    "w": "Ради тройного тега, особенно с Jovian/Earth strategy. MC-prod — бонус, не core.",
    "e": "18 MC всего (15+3), оплата титаном"
  },
  "Kickstarter": {
    "s": 55,
    "t": "C",
    "y": [
      "Стратегии планетарных треков",
      "Треки у порога"
    ],
    "w": "Когда нужный track close к ценному threshold bonus. No tags = significant penalty.",
    "e": "15 MC всего (12+3)"
  },
  "Last Resort Ingenuity": {
    "s": 62,
    "t": "C",
    "y": [
      "Phobolog",
      "Mining Guild",
      "Производители стали/титана",
      "Дорогие карты без Space/Building тегов"
    ],
    "w": "При большом запасе steel/ti и дорогой карте без Building/Space тега для розыгрыша.",
    "e": "7 MC всего (4+3)"
  },
  "Lobby Halls": {
    "s": 55,
    "t": "C",
    "y": [
      "Стратегии Turmoil",
      "Лидерство в партии"
    ],
    "w": "Когда delegate критически нужен + MC-prod. Иначе пропускай из-за no tags.",
    "e": "14 MC всего (11+3)"
  },
  "Lunar Embassy": {
    "s": 82,
    "t": "A",
    "y": [
      "Point Luna",
      "Earth Office",
      "Трек Earth",
      "Трек Mars",
      "Соседство городов"
    ],
    "w": "При 2+ Earth тегах. С Point Luna — must pick. Ti payable makes it affordable.",
    "e": "31 MC всего (28+3), оплата титаном"
  },
  "Luxury Estate": {
    "s": 63,
    "t": "C",
    "y": [
      "Стратегия городов",
      "Стратегия озеленения",
      "Треки Earth/Mars",
      "Оплата сталью"
    ],
    "w": "При 3+ собственных tiles (cities + greeneries) и O2 approaching 7%.",
    "e": "15 MC всего (12+3), оплата сталью"
  },
  "Martian Culture": {
    "s": 60,
    "t": "C",
    "y": [
      "Карты Mars тега",
      "Карты зависимые от Data",
      "HabitatMarte"
    ],
    "w": "Есть 2+ Mars тега и карты с data-зависимостью. Как standalone VP engine = слаб.",
    "e": "11+3=14 MC"
  },
  "Martian Dust Processing Plant": {
    "s": 75,
    "t": "B",
    "y": [
      "Mining Guild",
      "Трек Mars",
      "Стратегия стали",
      "Синергии тега Building"
    ],
    "w": "При наличии energy production. Steel payable + Mars тег = good efficiency.",
    "e": "18 MC всего (15+3), оплата сталью"
  },
  "Martian Monuments": {
    "s": 65,
    "t": "C",
    "y": [
      "Город на Mars",
      "HabitatMarte",
      "Mars Direct",
      "Скидка Building"
    ],
    "w": "Есть city на Марсе + 2+ Mars тега. Steel payable помогает. Дешёвая, можно брать.",
    "e": "10+3=13 MC"
  },
  "Martian Nature Wonders": {
    "s": 54,
    "t": "D",
    "y": [
      "Трек Mars",
      "Позиционное нарушение",
      "Накопление VP"
    ],
    "w": "Когда нужен Mars тег + 2 VP. Blocking space — ситуативный бонус, не core value.",
    "e": "16 MC всего (13+3)"
  },
  "Martian Repository": {
    "s": 73,
    "t": "B",
    "y": [
      "Карты с тегом Science",
      "Карты с тегом Mars",
      "HabitatMarte",
      "Research"
    ],
    "w": "Science-heavy engine. Mars теги = бонус. Building тег + steel payable.",
    "e": "12+3=15 MC"
  },
  "Microbiology Patents": {
    "s": 66,
    "t": "C",
    "y": [
      "Splice",
      "Decomposers",
      "BioSol",
      "Карты с тегом Microbe",
      "Трек Mars"
    ],
    "w": "При microbe strategy с 2+ microbe тегами планируемыми. Иначе risky.",
    "e": "9 MC всего (6+3)"
  },
  "Museum of Early Colonisation": {
    "s": 62,
    "t": "C",
    "y": [
      "Стратегия городов",
      "Стратегия озеленения",
      "Трек Mars",
      "Оплата сталью"
    ],
    "w": "При наличии city + greenery + ocean. Steel payable. Mars тег для track.",
    "e": "23 MC всего (20+3), оплата сталью"
  },
  "New Venice": {
    "s": 71,
    "t": "B",
    "y": [
      "Трек Mars",
      "Стратегия городов",
      "Tharsis Republic",
      "Оплата сталью",
      "Mining Guild"
    ],
    "w": "При 3+ oceans и steel для оплаты. Quad тег делает карту ценной в Pathfinders.",
    "e": "24 MC всего (21+3), оплата сталью"
  },
  "Nobel Labs": {
    "s": 53,
    "t": "D",
    "y": [
      "Habitat Marte",
      "Decomposers",
      "Tardigrades",
      "Карты Data VP",
      "Научные билды"
    ],
    "w": "При 3+ Science тегах + resource VP cards. С Habitat Marte — значительно лучше.",
    "e": "11 MC всего (8+3)"
  },
  "Orbital Laboratories": {
    "s": 65,
    "t": "C",
    "y": [
      "Стратегия растений",
      "EcoLine",
      "Научные вэхи",
      "Оплата титаном"
    ],
    "w": "При наличии ti для оплаты и plant strategy. Triple тег — main value.",
    "e": "21 MC всего (18+3), оплата титаном"
  },
  "Ozone Generators": {
    "s": 66,
    "t": "C",
    "y": [
      "Thorgate",
      "Излишки энергии",
      "Трек Mars",
      "TR-раш"
    ],
    "w": "При energy surplus и нужда в TR. Energy → TR conversion — not efficient but usable.",
    "e": "17 MC всего (14+3), оплата титаном"
  },
  "Pollinators": {
    "s": 72,
    "t": "B",
    "y": [
      "EcoLine",
      "NRA",
      "Ecologist",
      "Карты растительной прод",
      "Размещение животных"
    ],
    "w": "При 2+ Plant тегах уже в engine. Free animal action = passive VP.",
    "e": "22 MC всего (19+3)"
  },
  "Prefabrication of Human Habitats": {
    "s": 74,
    "t": "B",
    "y": [
      "Tharsis Republic",
      "Стратегия городов",
      "Производители стали",
      "Вэха Mayor"
    ],
    "w": "При city strategy с 2+ cities planned. Steel on cities = game changing discount.",
    "e": "11 MC всего (8+3), оплата сталью"
  },
  "Private Security": {
    "s": 52,
    "t": "D",
    "y": [
      "Трек Earth",
      "Point Luna",
      "Высокопродуктивные билды",
      "Страховка от атак"
    ],
    "w": "Если видишь attack cards у оппонентов. Иначе Earth тег не стоит 11 MC.",
    "e": "11 MC всего (8+3)"
  },
  "Public Sponsored Grant": {
    "s": 60,
    "t": "C",
    "y": [
      "Научная стратегия",
      "Партия Scientists",
      "Целевой поиск карт"
    ],
    "w": "Когда Scientists ruling и нужны specific тег карты для strategy. No tags penalty.",
    "e": "9 MC всего (6+3)"
  },
  "Rare-Earth Elements": {
    "s": 59,
    "t": "C",
    "y": [
      "Трек Earth",
      "Трек Mars",
      "Карты специальных тайлов",
      "Nuclear Zone",
      "Restricted Area"
    ],
    "w": "Дёшевый двойной тег. При 1+ special tiles — okay. При 0 — покупаешь только теги.",
    "e": "8 MC всего (5+3)"
  },
  "Red City": {
    "s": 60,
    "t": "C",
    "y": [
      "Партия Reds",
      "Стратегия Turmoil",
      "Соседство городов",
      "Оплата сталью"
    ],
    "w": "При Reds influence и city plans. Steel payable. Situational.",
    "e": "24 MC всего (21+3), оплата сталью"
  },
  "Return to Abandoned Technology": {
    "s": 58,
    "t": "C",
    "y": [
      "Трек Mars",
      "Odyssey",
      "Качество карт лейт-гейма"
    ],
    "w": "Mid-to-late game когда discard pile большой. Дёшевый Mars тег + card draw.",
    "e": "7 MC всего (4+3)"
  },
  "Rich Deposits": {
    "s": 66,
    "t": "C",
    "y": [
      "Карты Building",
      "Стратегия стали",
      "Mining Guild",
      "Научные билды"
    ],
    "w": "При 2+ Science тегов и Building-heavy engine. No tags penalty is significant.",
    "e": "15 MC всего (12+3)"
  },
  "Secret Labs": {
    "s": 68,
    "t": "C",
    "y": [
      "Трек Jovian",
      "Phobolog",
      "Научные билды",
      "Оплата титаном/сталью"
    ],
    "w": "При Jovian+Science build. Triple тег + VP + dual payability.",
    "e": "24 MC всего (21+3), оплата титаном/сталью"
  },
  "Small Comet": {
    "s": 55,
    "t": "C",
    "y": [
      "Phobolog",
      "Производители титана",
      "Трек Mars",
      "Продвижение температуры + O2"
    ],
    "w": "Только с significant ti для оплаты. Без ti — слишком дорого для 2 TR.",
    "e": "35 MC всего (32+3), оплата титаном"
  },
  "Small Open Pit Mine": {
    "s": 70,
    "t": "B",
    "y": [
      "Mining Guild",
      "Стратегия стали",
      "Phobolog",
      "Карты Building"
    ],
    "w": "Карта производства для ранней игры. Оплата сталью делает эффективной. Выбирай по нуждам движка.",
    "e": "13 MC всего (10+3), оплата сталью"
  },
  "Social Events": {
    "s": 60,
    "t": "C",
    "y": [
      "HabitatMarte",
      "Mars Direct",
      "Point Luna (Earth тег)",
      "Тяжёлый Mars движок"
    ],
    "w": "Только при 4+ Mars тегах уже в игре. Иначе слишком дорого за 1 TR.",
    "e": "18+3=21 MC"
  },
  "Soil Detoxification": {
    "s": 62,
    "t": "C",
    "y": [
      "EcoLine",
      "Стратегия растений",
      "Партия Greens",
      "Раш озеленения"
    ],
    "w": "При Greens influence + plant strategy. Minor but consistent discount.",
    "e": "13 MC всего (10+3)"
  },
  "Solar Storm": {
    "s": 38,
    "t": "D",
    "y": [
      "Анти-Data стратегия",
      "Space тег для трека"
    ],
    "w": "Почти никогда. 15 MC за pure disruption в 3P = bad. Only if desperately need Space тег.",
    "e": "15 MC всего (12+3), оплата титаном"
  },
  "Solarpedia": {
    "s": 58,
    "t": "C",
    "y": [
      "Мультитеговые билды",
      "Карты Data VP",
      "Стратегии планетарных треков"
    ],
    "w": "Только при наличии ВСЕХ четырёх planetary тегов. Otherwise dead card.",
    "e": "15 MC всего (12+3), оплата титаном"
  },
  "Space Debris Cleaning Operation": {
    "s": 65,
    "t": "C",
    "y": [
      "Phobolog",
      "Космическая стратегия",
      "Карты зависимые от титана",
      "Трек Mars"
    ],
    "w": "При Space-heavy game (4+ Space tags в play). Дёшевый ti burst + dual тег.",
    "e": "10 MC всего (7+3), оплата титаном"
  },
  "Space Relay": {
    "s": 78,
    "t": "B",
    "y": [
      "Io Mining Industries",
      "Ganymede Colony",
      "Ceres Spaceport",
      "Трек Jovian",
      "Phobolog"
    ],
    "w": "При Jovian strategy. 2+ Jovian тега planned = strong. Ti payable. Card draw engine.",
    "e": "16 MC всего (13+3), оплата титаном"
  },
  "Specialized Settlement": {
    "s": 73,
    "t": "B",
    "y": [
      "Трек Mars",
      "Tharsis Republic",
      "Вэха Mayor",
      "Оплата сталью",
      "Соседство городов"
    ],
    "w": "При energy production и city strategy. Steel payable. Mars тег bonus.",
    "e": "23 MC всего (20+3), оплата сталью"
  },
  "Terraforming Control Station": {
    "s": 78,
    "t": "B",
    "y": [
      "Карты Venus",
      "Карты с тегом Mars",
      "Morning Star Inc",
      "Оплата титаном"
    ],
    "w": "Venus стратегия + тройной тег. Mars discount = бонус. 2 TR immediate всегда ценно.",
    "e": "18+3=21 MC"
  },
  "Terraforming Robots": {
    "s": 48,
    "t": "D",
    "y": [
      "HabitatMarte (Mars=Science)",
      "Тяжёлый движок Science+Mars"
    ],
    "w": "Почти никогда. Двойное условие слишком ограничивает.",
    "e": "10+3=13 MC"
  },
  "Think Tank": {
    "s": 74,
    "t": "B",
    "y": [
      "Трек Mars",
      "Трек Venus",
      "Habitat Marte",
      "Синергии Data",
      "Гибкая оплата"
    ],
    "w": "Для тройного тега в Mars/Venus/Science strategy. Data banking — secondary benefit.",
    "e": "15 MC всего (12+3)"
  },
  "Venera Base": {
    "s": 76,
    "t": "B",
    "y": [
      "Стратегия Venus",
      "Партия Unity",
      "Morning Star Inc",
      "Трек Venus",
      "Карты флоатеров"
    ],
    "w": "При Venus strategy + Unity influence. Double Venus тег + city = strong.",
    "e": "24 MC всего (21+3)"
  },
  "Wetlands": {
    "s": 77,
    "t": "B",
    "y": [
      "Lakefront Resorts",
      "Arctic Algae",
      "Polaris",
      "Награды озеленения",
      "Трек Mars"
    ],
    "w": "При ocean/greenery synergies (Lakefront, Arctic Algae). Dual tile type = unique value.",
    "e": "23 MC всего (20+3)"
  },
  "Greenhouse": {
    "s": 62,
    "t": "C",
    "y": [
      "Ecoline",
      "NRA",
      "Viral Enhancers",
      "Herbivores",
      "Стратегия озеленения"
    ],
    "w": "Только при 4+ plant тегов уже на борде или гарантированно скоро. Оплата сталью снижает реальную цену. Не драфти без plant engine.",
    "e": "6+3=9 MC (оплата сталью ~5-6 MC реально) за 1 TR (7-7.4 MC) + Building тег (~1-2 MC). Break-even со сталью, минус без."
  },
  "Galilea": {
    "s": 48,
    "t": "D",
    "y": [
      "Saturn Systems",
      "Jovian Lanterns",
      "Io Mining Industries",
      "Вэха Rim Settler",
      "Стратегия Science"
    ],
    "w": "Почти никогда. 6 Science тегов — крайне редкое условие. Даже при выполнении value маргинальный для 30 MC. Trap-карта для амбициозных Science стратегий.",
    "e": "27+3=30 MC за (3-4 Jovian × 5 MC/prod = 15-20 MC) + 1 VP (5 MC) + 2 тега (8 MC). Реально 28-33 MC value, но 6 Science req почти недостижим."
  },
  "Spin-Off Department": {
    "s": 40,
    "t": "D",
    "y": [
      "Стратегия Building",
      "Sagitta",
      "Interplanetary Cinematics",
      "Дорогие Building карты"
    ],
    "w": "Почти никогда. 21 MC без тегов за одноразовую карто-тягу — невыгодно. Даже при 2 Building тегах на следующей карте (4 карты = 12-16 MC) не окупается.",
    "e": "18+3=21 MC без тегов. 1 Building тег на след. карте = 2 карты (6-8 MC), 2 тега = 4 карты (12-16 MC). Ожидание ~8 MC value за 21 MC."
  },
  "Sub-Zero Salt Fish": {
    "s": 73,
    "t": "B",
    "y": [
      "Large Convoy",
      "Imported Nitrogen",
      "Miranda colony",
      "Ecological Zone",
      "Arklight"
    ],
    "w": "Дёшевый VP-аккумулятор, бери при -6°C близко или уже выполнено. Req лёгкий, Animal тег ценен. Take-that (-1 plant-prod) мягче чем Birds, штраф 3P минимален.",
    "e": "5+3=8 MC за ~3-4 VP самостоятельно (15-20 MC) + Animal тег (1-2 MC). С animal placement карты ceiling 6+ VP."
  },
  "Band Society": {
    "s": 66,
    "t": "C",
    "y": [
      "Tharsis Republic",
      "Rover Construction",
      "Immigration Shuttles",
      "Стратегия городов",
      "Sagitta"
    ],
    "w": "Играй рано в 3P — 6-10 городов на Mars за игру = 6-10 MC-prod потенциально. Но без тегов теряешь синергии. Лучше в играх с много городов.",
    "e": "6+3=9 MC без тегов. При 4-5 городах за игру: ~4 MC-prod среднее × 5 = 20 MC. Но no-tag штраф -3 to -5 снижает реальную ценность."
  },
  "Mars Tourism": {
    "s": 65,
    "t": "C",
    "y": [
      "Media Group",
      "InterPlanetary Cinematics",
      "Вэха Legend",
      "Point Luna",
      "Earth Office"
    ],
    "w": "При 3+ Event тегов уже сыгранных. Два тега (Earth+Building) ценны. Оплата сталью снижает реальную цену. Не бери если мало Event в стратегии.",
    "e": "12+3=15 MC (оплата сталью ~10-12 MC). При 3 events: 3 MC-prod (15 MC) + 2 тега (4 MC) = 19 MC. При 5 events: 29 MC. Break-even при ~3 events."
  },
  "Ambient Magnetism": {
    "s": 38,
    "t": "D",
    "y": [
      "Thorgate",
      "Steelworks",
      "Ironworks",
      "Physics Complex"
    ],
    "w": "Почти никогда. 25 MC без тегов за 3 энергия-прод — хуже Space Mirrors × 3 (9 MC за то же самое). Энергия-прод не самый ценный. Trap-карта.",
    "e": "22+3=25 MC без тегов. 3 EP × 7.5 MC = 22.5 MC gen 1. 8.3 MC/EP — вдвое хуже Power Plant (7 MC/EP с тегом). No tag -3 to -5."
  },
  "Archimedes Hydroponics": {
    "s": 58,
    "t": "C",
    "y": [
      "Стратегия растений",
      "Ecoline",
      "Herbivores/Livestock",
      "Greenery Awards",
      "NRA (Nitrogen-Rich Asteroid)"
    ],
    "w": "При наличии plant-production 2+. Конвертация 4 растений в озеленение ускоряет terraforming. Без plant engine — слишком медленно.",
    "e": "17 MC всего (14+3). Building+Plant теги (~3 MC). 1 растение/действие = ~8 действий на озеленение самостоятельно. С plant-prod 2+ — озеленение каждые 2 гена."
  },
  "Diplomatic Pressure": {
    "s": 66,
    "t": "C",
    "y": [
      "Venus стратегия",
      "Point Luna",
      "Teractor",
      "Celestic",
      "Карты с флоатерами"
    ],
    "w": "При Venus-стратегии с 3+ флоатерами. Двойной тег Venus+Earth даёт отличные синергии. Без флоатерного движка — мертвая карта.",
    "e": "11 MC всего (8+3). +2 MC-prod = 10-12 MC gen 1. Venus+Earth теги (~5 MC). Req 3 флоатера снижает timing value."
  },
  "Expedition To The Surface": {
    "s": 65,
    "t": "C",
    "y": [
      "Mining Guild",
      "Стальной движок",
      "Building-heavy стратегия",
      "Sagitta (бонус no-tag)"
    ],
    "w": "Мощный production burst, но отсутствие тегов убивает синергии. Берём только при стальном движке или Sagitta corp.",
    "e": "24 MC всего (21+3). +2 MC-prod (~12 MC) + 2 steel-prod (~16 MC) + 2 steel (4 MC) = ~32 MC value. No tag penalty -4 MC. Нетто ~28 MC за 24 MC."
  },
  "Luna Trade Federation": {
    "s": 72,
    "t": "B",
    "y": [
      "Point Luna",
      "Колониальная стратегия",
      "Teractor",
      "Earth Office",
      "Jovian карты (VP multipliers)"
    ],
    "w": "При 2+ колониях и Earth-тегах в движке. Jovian+Earth двойной тег — один из лучших в игре. С 3 колониями = 3 MC-prod + теги за 18 MC.",
    "e": "18 MC всего (15+3). Jovian+Earth теги (~6 MC). При 2 колониях: 2 MC-prod = 10-12 MC. При 3 колониях: 3 MC-prod = 15-18 MC."
  },
  "Nanotech Industries": {
    "s": 78,
    "t": "B",
    "y": [
      "Science стратегия",
      "Scientist Award",
      "Crescent Research",
      "Mars University",
      "Large Convoy (animal placement)"
    ],
    "w": "Одна из лучших VP-action карт. Без требований, Science тег для Scientist. При игре на gen 3-4 набирает 5-6 VP.",
    "e": "17 MC всего (14+3). Science тег (~4 MC). 1 VP/действие. Gen 3 play: ~6 VP = 30 MC mid-game value. Gen 5 play: ~4 VP = 20 MC."
  },
  "Soylent Green": {
    "s": 60,
    "t": "C",
    "y": [
      "Splice",
      "Decomposers",
      "Ecoline",
      "NRA",
      "Стратегия растений"
    ],
    "w": "Средняя карта. Plant+Microbe теги дают синергии со Splice и Decomposers. Break-even по экономике.",
    "e": "17 MC всего (14+3). +1 plant-prod (~8 MC) + 3 plants (~6 MC) = 14 MC. Plant+Microbe теги (~3 MC). Итого ~17 MC = break-even."
  },
  "Test Animals": {
    "s": 73,
    "t": "B",
    "y": [
      "Science стратегия",
      "Scientist Award",
      "Large Convoy",
      "Imported Nitrogen",
      "Ecological Zone"
    ],
    "w": "Хорошая VP-action карта с Science тегом. Req 4% O2 легче чем Birds (13%). Дороже Birds, но Science тег ценнее Animal.",
    "e": "19 MC всего (16+3). Science тег (~4 MC). 1 VP/animal. Gen 4 play: ~5 VP = 25 MC. Animal placement (Large Convoy, Imported Nitrogen) поднимает ceiling."
  },
  "The Grand Tour": {
    "s": 72,
    "t": "B",
    "y": [
      "Jovian стратегия",
      "Io Mining Industries",
      "Rim Settler milestone (Hellas)",
      "Interplanetary Cinematics",
      "Phobolog"
    ],
    "w": "Огромный payoff при 4+ Jovian, но requirement крайне жёсткий. Берём только в deep Jovian стратегии.",
    "e": "23 MC всего (20+3). Jovian+Space теги (~6 MC). При 4 Jovian: 4 MC-prod (~24 MC) + 4 VP (~20 MC) = ~44 MC. Но req 4 Jovian = нужно 3 до розыгрыша."
  },
  "Tyrell Corporation": {
    "s": 75,
    "t": "B",
    "y": [
      "Birds/Fish/Livestock",
      "Decomposers",
      "Ants",
      "Ecological Zone",
      "Splice"
    ],
    "w": "Топ-поддержка для animal/microbe VP engine. 2 ресурса/действие = Birds получает 2 VP/ген. Дорогая, но окупается при 2+ VP-картах с животными/микробами.",
    "e": "27 MC всего (24+3). Building+Science теги (~5 MC). При 3 animal/microbe тегах: 3 MC-prod (~18 MC). Action: 2 ресурса/ген на чужую карту — мощнейший VP-генератор."
  },
  "Gagarin Mobility": {
    "s": 42,
    "t": "D",
    "y": [
      "Building-heavy стратегия",
      "Science стратегия",
      "Scientist Award"
    ],
    "w": "Крайне слабая карта. 25 MC за 1 VP/3 science ресурса = в 3 раза хуже Nanotech Industries. Req 5 Building тегов ещё и ограничивает.",
    "e": "25 MC всего (22+3). Building+Science теги (~5 MC). 4 гена play = 4 ресурса = ~1.3 VP = 6.5 MC. Ужасная окупаемость."
  },
  "Hydrogen To Venus": {
    "s": 68,
    "t": "C",
    "y": [
      "Venus стратегия с флоатерами",
      "Celestic",
      "Dirigibles",
      "Stratospheric Birds",
      "Стратегия Space тега"
    ],
    "w": "При 2+ Venus-картах с флоатерами на столе. Без флоатерных целей — переплата за 1 TR. Space тег для титана.",
    "e": "14 MC всего (11+3). 1 Venus step = 1 TR = 7 MC. Флоатеры: при 2 целях = 2 флоатера ~4-6 MC. Space тег ~2 MC. Итого ~13-15 MC."
  },
  "JetStream Microscrappers": {
    "s": 42,
    "t": "D",
    "y": [
      "Venus стратегия",
      "Hydrogen To Venus",
      "Aerial Mappers",
      "Карты с флоатерами"
    ],
    "w": "Классическая floater trap. 1 титан + 2 действия → 2 флоатера, ещё 1 действие → Venus step. 4 хода на 1 TR — слишком медленно.",
    "e": "15 MC всего (12+3). Science тег ~3 MC. 4 действия = 1 TR = 7 MC. За 8 gen = 2 TR = 14 MC. Чистый убыток."
  },
  "Titan Air-Scrapping": {
    "s": 45,
    "t": "D",
    "y": [
      "Jovian стратегия",
      "Titan Floating Launch-pad",
      "Io Mining Industries",
      "Внешние источники флоатеров"
    ],
    "w": "24 MC за медленную floater машину. 2 VP спасают, но 4 хода на 1 TR. Только с Jovian-мультипликаторами и внешними флоатерами.",
    "e": "24 MC всего (21+3). 2 VP = 10 MC. Jovian тег ~3 MC. 8 gen = 2 TR = 14 MC. Итого ~27 MC = break-even."
  },
  "Sulfur-Eating Bacteria": {
    "s": 57,
    "t": "C",
    "y": [
      "Venus стратегия",
      "Decomposers",
      "Symbiotic Fungus",
      "Splice",
      "Viral Enhancers"
    ],
    "w": "Дешевле JetStream, но 6 действий на 1 TR. Microbe тег ценен для Splice/Decomposers. С внешними источниками микробов — лучше.",
    "e": "9 MC всего (6+3). Microbe тег ~2 MC. 3 действия = 1 TR = 7 MC. За 8 gen ≈ 2.6 TR ≈ 18 MC. Нетто ~11 MC."
  },
  "Floater Refinery": {
    "s": 48,
    "t": "D",
    "y": [
      "Venus стратегия",
      "Celestic",
      "Карты с флоатерами",
      "Stormcraft"
    ],
    "w": "Дешёвая, но действие = ловушка: 3 MC за 3 действия = 1 MC/действие. Только как дешёвый Venus тег или цель для флоатеров.",
    "e": "8 MC всего (5+3). Venus тег (~2 MC). Цикл: 2 действия копить + 1 конвертация = 3 MC за 3 действия = 1 MC/действие (сравни Steelworks: 4 MC/действие)."
  }
};