"""Все dict-константы и конфигурационные данные TM Advisor."""

import os
from colorama import Fore, Style


BASE_URL = "https://terraforming-mars.herokuapp.com"
POLL_INTERVAL = 0.5
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data")


# ── Tile type constants ──

TILE_GREENERY = 0
TILE_OCEAN = 1
TILE_CITY = 2
BONUS_TITANIUM = 0
BONUS_STEEL = 1
BONUS_PLANT = 2
BONUS_CARD = 3
BONUS_HEAT = 4

# Hex adjacency offsets
_EVEN_Y_NEIGHBORS = [(-1, -1), (0, -1), (-1, 0), (1, 0), (-1, 1), (0, 1)]
_ODD_Y_NEIGHBORS = [(0, -1), (1, -1), (-1, 0), (1, 0), (0, 1), (1, 1)]


# ── Standard Projects ──

STANDARD_PROJECTS = {
    "Power Plant":   {"cost": 11, "gives": "+1 energy-prod",     "value_fn": "energy_prod"},
    "Asteroid":      {"cost": 14, "gives": "+1 temp (+1 TR)",    "value_fn": "tr"},
    "Aquifer":       {"cost": 18, "gives": "ocean (+1 TR +adj)", "value_fn": "ocean"},
    "Greenery":      {"cost": 23, "gives": "greenery (+1 O₂ +1 TR +1 VP)", "value_fn": "greenery"},
    "City":          {"cost": 25, "gives": "city (+1 MC-prod)",  "value_fn": "mc_prod"},
    "Air Scrapping": {"cost": 15, "gives": "+1 Venus",           "value_fn": "tr"},
}

# Tableau cards that give rebates on standard projects / parameter raises
TABLEAU_REBATES: dict[str, dict[str, int]] = {
    "Homeostasis Bureau": {"sp_temp": 6, "any_temp": 3},
}


# ── Corp & Tableau Synergies ──

CORP_TAG_SYNERGIES: dict[str, dict[str, int]] = {
    "Point Luna": {"Earth": 5}, "Teractor": {"Earth": 4},
    "Splice": {"Microbe": 4}, "Phobolog": {"Space": 3},
    "Interplanetary Cinematics": {"Event": 3},
    "Morning Star Inc": {"Venus": 3}, "Morning Star Inc.": {"Venus": 3},
    "Arklight": {"Animal": 3, "Plant": 2},
    "Polyphemos": {"Science": 2}, "Celestic": {"Venus": 2},
    "Crescent Research": {"Science": 3},
    "Manutech": {"Building": 2}, "Mining Guild": {"Building": 2},
    "Thorgate": {"Power": 3}, "EcoLine": {"Plant": 3},
    "Sagitta Frontier Services": {},
    "Lakefront Resorts": {},
    "Philares": {"Building": 2},
    "Robinson Industries": {},
    "Helion": {},
}

CORP_DISCOUNTS: dict[str, dict] = {
    "Teractor": {"Earth": 3},
    "Thorgate": {"Power": 3},
    "Morning Star Inc": {"Venus": 2}, "Morning Star Inc.": {"Venus": 2},
    "Phobolog": {},
    "Helion": {},
}

TABLEAU_DISCOUNT_CARDS: dict[str, dict] = {
    "Earth Office": {"Earth": 3},
    "Research Outpost": {"all": 1},
    "Space Station": {"Space": 2},
    "Quantum Extractor": {"Space": 2},
    "Warp Drive": {"Space": 4},
    "Media Group": {},
    "Cutting Edge Technology": {},
    "Earth Catapult": {"all": 2},
    "Solar Logistics": {"Earth": 2},
    "Anti-Gravity Technology": {"all": 2},
}

TABLEAU_SYNERGIES: dict[str, list[tuple[str, int, str]]] = {
    "Dirigibles": [
        ("has:Floater Technology", 5, "double floater placement"),
        ("has:Titan Floating Launch-Pad", 4, "floater source"),
        ("has:Stratospheric Birds", 4, "floater engine"),
    ],
    "Floater Technology": [
        ("has:Dirigibles", 5, "double floater engine"),
        ("has:Celestic", 4, "corp floater synergy"),
    ],
    "Titan Shuttles": [
        ("has:Dirigibles", 4, "floater placement"),
        ("has:Floater Technology", 4, "floater engine"),
    ],
    "Venus Governor": [
        ("tag:Venus>=2", 4, "Venus focus"),
    ],
    "Venus Soils": [
        ("has:Psychrophiles", 3, "microbe placement"),
    ],
    "Decomposers": [
        ("tag:Plant>=2", 4, "plant tag triggers"),
        ("tag:Microbe>=2", 4, "microbe tag triggers"),
        ("tag:Animal>=1", 3, "animal tag triggers"),
    ],
    "Psychrophiles": [
        ("tag:Plant>=2", 3, "plant tag triggers"),
    ],
    "Birds": [
        ("has:Ecological Zone", 4, "animal placement"),
        ("has:Small Animals", 3, "animal chain"),
    ],
    "Fish": [
        ("has:Ecological Zone", 4, "animal placement"),
    ],
    "Livestock": [
        ("has:Ecological Zone", 4, "animal placement"),
    ],
    "Mars University": [
        ("tag:Science>=3", 5, "draw engine"),
        ("has:Olympus Conference", 4, "science combo"),
    ],
    "Olympus Conference": [
        ("has:Mars University", 4, "science combo"),
        ("tag:Science>=3", 4, "science resource engine"),
    ],
    "Research": [
        ("tag:Science>=2", 3, "science synergy"),
    ],
    "Robotic Workforce": [
        ("tag:Building>=4", 5, "copy best building"),
    ],
    "Spin-off Department": [
        ("tag:Science>=3", 4, "free cards from science plays"),
    ],
    "Standard Technology": [
        ("has:Homeostasis Bureau", 5, "SP rebate chain"),
    ],
    "Homeostasis Bureau": [
        ("has:Standard Technology", 5, "SP discount + rebate"),
    ],
    "Earth Office": [
        ("tag:Earth>=3", 6, "earth discount scales"),
    ],
    "Luna Governor": [
        ("tag:Earth>=2", 3, "earth tag synergy"),
        ("has:Earth Office", 4, "earth discount"),
    ],
    "Miranda Resort": [
        ("tag:Earth>=3", 4, "earth VP scaling"),
        ("tag:Jovian>=2", 3, "jovian contributes"),
    ],
    "AI Central": [
        ("tag:Science>=3", 4, "science prereq + draw engine"),
        ("has:Viron", 6, "double action = 4 cards/gen"),
    ],

    # === BonelessDota 50 Combos ===

    # City combos
    "Standard Technology": [
        ("has:Homeostasis Bureau", 5, "SP rebate chain"),
        ("has:Tharsis Republic", 5, "city SP за 19 MC + 2 MC-prod"),
        ("has:Poseidon", 6, "colony SP за 14 MC + 1 MC-prod/colony"),
        ("has:Thorgate", 5, "power plant SP за 5 MC"),
    ],
    "Immigrant City": [
        ("has:Tharsis Republic", 5, "city = 3 MC-prod"),
        ("has:Martian Rails", 4, "double city payoff"),
    ],
    "Martian Rails": [
        ("has:Tharsis Republic", 4, "city engine"),
        ("has:Immigrant City", 4, "double city payoff"),
        ("has:Viron", 5, "double action = 2x city income"),
    ],
    "Tharsis Republic": [
        ("has:Immigrant City", 5, "city = 3 MC-prod"),
        ("has:Standard Technology", 5, "cheap city SP"),
    ],

    # Titanium combos
    "Advanced Alloys": [
        ("has:Phobolog", 5, "ti = 5 MC/шт"),
    ],
    "Iron Mining Industries": [
        ("has:Phobolog", 6, "стартовые Ti оплачивают карту, ~10 MC-prod"),
        ("tag:Jovian>=3", 4, "Jovian amplifier engine"),
    ],

    # Colony combos
    "Polyphemos": [
        ("has:Pluto", 5, "бесплатные карты решают 5 MC/card"),
    ],

    # Green tag / Microbe combos
    "Ants": [
        ("has:Extreme-Cold Fungus", 5, "1 free VP/gen бесконечно"),
        ("has:Enceladus", 4, "triple colony = almost win"),
    ],
    "Venusian Insects": [
        ("has:Extreme-Cold Fungus", 5, "1 free VP/gen бесконечно"),
        ("has:Enceladus", 4, "microbe colony synergy"),
    ],
    "Extreme-Cold Fungus": [
        ("has:Ants", 5, "1 free VP/gen бесконечно"),
        ("has:Venusian Insects", 5, "1 free VP/gen бесконечно"),
        ("has:Regolith Eaters", 5, "1 free TR/gen = ~8 MC-prod"),
        ("has:GHG Producing Bacteria", 5, "1 free TR/gen = ~8 MC-prod"),
        ("has:Sulfur-Eating Bacteria", 4, "free microbe → MC engine"),
        ("has:Decomposers", 4, "free microbe → VP"),
    ],
    "Regolith Eaters": [
        ("has:Extreme-Cold Fungus", 5, "1 free TR/gen = ~8 MC-prod"),
    ],
    "GHG Producing Bacteria": [
        ("has:Extreme-Cold Fungus", 5, "1 free TR/gen = ~8 MC-prod"),
    ],
    "Sulfur-Eating Bacteria": [
        ("has:Enceladus", 5, "personal Luna colony (6 microbes = 18 MC)"),
    ],
    "Large Convoy": [
        ("has:Fish", 6, "~8 VP combo (4 animals + ocean + cards)"),
        ("has:Birds", 5, "animal placement + VP"),
        ("has:Livestock", 5, "animal placement + VP"),
    ],
    "Viral Enhancers": [
        ("tag:Plant>=2", 4, "+1 plant per green tag"),
        ("tag:Animal>=1", 4, "+1 animal per bio tag"),
        ("has:Decomposers", 5, "bio chain = exponential VP"),
        ("has:Ecological Zone", 5, "bio chain = exponential VP"),
    ],
    "Meat Industry": [
        ("tag:Animal>=2", 5, "MC per animal placement"),
        ("tag:Plant>=3", 4, "MC per plant placement"),
    ],
    "Advanced Ecosystems": [
        ("has:Decomposers", 5, "5 VP instead of 3 with bio chain"),
        ("has:Ecological Zone", 5, "5 VP instead of 3 with bio chain"),
        ("has:Viral Enhancers", 4, "amplified green tags"),
    ],
    "Herbivores": [
        ("has:Ecological Zone", 4, "animal placement synergy"),
    ],
    "Protected Habitats": [
        ("has:Insects", 5, "safe plant accumulation"),
        ("tag:Plant>=3", 4, "protect plants from attacks"),
        ("tag:Animal>=2", 3, "protect animals from Predators"),
    ],

    # Kelp Farming + Ecology Experts (S-tier combo)
    "Kelp Farming": [
        ("has:Ecology Experts", 7, "2 MC-prod + 4 plant-prod gen 1 = S-tier combo"),
    ],
    "Ecology Experts": [
        ("has:Kelp Farming", 7, "best prelude+card combo in game"),
        ("has:Trees", 4, "early plant engine"),
        ("has:Penguins", 4, "gen 1 animal VP card"),
    ],

    # Floater combos
    "Stratopolis": [
        ("has:Forced Precipitation", 6, "1 free TR/gen + VP engine"),
        ("has:Floating Habs", 5, "1.5 VP/gen (0.5 VP/floater)"),
    ],
    "Forced Precipitation": [
        ("has:Stratopolis", 6, "1 free TR/gen + VP engine"),
        ("has:Jovian Lanterns", 4, "floater → VP"),
    ],
    "Floating Habs": [
        ("has:Hydrogen to Venus", 5, "half a Jovian Amplifier, late game"),
        ("has:Stratopolis", 5, "1.5 VP/gen"),
        ("has:Dirigibles", 4, "floater engine → VP"),
    ],
    "Hydrogen to Venus": [
        ("has:Floating Habs", 5, "half a Jovian Amplifier, late game"),
    ],
    "Floater Technology": [
        ("has:Dirigibles", 5, "double floater engine"),
        ("has:Aerial Mappers", 5, "1 free card/gen"),
        ("has:Titan Shuttles", 4, "1 free titanium/gen"),
        ("has:Local Shading", 3, "1 free MC-prod/gen early"),
        ("has:Celestic", 4, "corp floater synergy"),
    ],
    "Aerial Mappers": [
        ("has:Floater Technology", 5, "1 free card/gen = Sub-Crust Measurements"),
    ],

    # Robotic Workforce combos
    "Robotic Workforce": [
        ("has:Gyropolis", 7, "copy best building — magnificent"),
        ("has:Medical Lab", 7, "copy production — deadly"),
        ("has:Strip Mine", 5, "copy steel+ti prod (no O2 raise)"),
        ("has:Mohole Area", 4, "4 heat-prod for 9 MC"),
        ("tag:Building>=4", 5, "copy best building"),
    ],

    # Viron combos
    "Viron": [
        ("has:AI Central", 6, "4 cards/gen — one of the best combos"),
        ("has:Martian Rails", 5, "double city income"),
        ("has:Orbital Cleanup", 5, "double action per science tags"),
    ],

    # Science combos
    "High-Tech Lab": [
        ("has:Mass Converter", 4, "science tag for req + draw ~6 cards"),
    ],
    "Physics Complex": [
        ("has:CEO's Favorite Project", 5, "last gen VP dump"),
        ("has:Mass Converter", 4, "science tag for req"),
    ],

    # Card draw + discount (core God Mode)
    "Earth Catapult": [
        ("has:Anti-Gravity Technology", 7, "-4 ко всем картам = God Mode enabler"),
        ("has:Mars University", 5, "discount + draw exponential"),
        ("has:Olympus Conference", 5, "discount + draw exponential"),
    ],
    "Anti-Gravity Technology": [
        ("has:Earth Catapult", 7, "-4 ко всем картам = God Mode enabler"),
        ("has:Mars University", 5, "discount + draw exponential"),
    ],
    "Spin-off Department": [
        ("tag:Science>=3", 4, "free cards from science plays"),
        ("has:Mars University", 5, "double card draw triggers"),
        ("has:Olympus Conference", 5, "triple science card draw"),
    ],

    # Arctic Algae
    "Arctic Algae": [
        ("has:Lakefront Resorts", 4, "strong with water cards"),
    ],
}


# ── Turmoil ──

GLOBAL_EVENTS = {
    "Global Dust Storm": {"desc": "Lose all heat. -2 MC/building tag (max 5, -influence)", "good": False},
    "Sponsored Projects": {"desc": "All cards with resources +1. Draw 1 card/influence", "good": True},
    "Asteroid Mining": {"desc": "+1 ti/Jovian tag (max 5) + influence", "good": True},
    "Generous Funding": {"desc": "+2 MC/influence + per 5 TR over 15 (max 5)", "good": True},
    "Successful Organisms": {"desc": "+1 plant/plant-prod (max 5) + influence", "good": True},
    "Eco Sabotage": {"desc": "Lose all plants except 3 + influence", "good": False},
    "Productivity": {"desc": "+1 steel/steel-prod (max 5) + influence", "good": True},
    "Snow Cover": {"desc": "Temp -2 steps. Draw 1 card/influence", "good": False},
    "Diversity": {"desc": "+10 MC if 9+ different tags. Influence = extra tags", "good": True},
    "Pandemic": {"desc": "-3 MC/building tag (max 5, -influence)", "good": False},
    "War on Earth": {"desc": "-4 TR. Influence prevents 1 step each", "good": False},
    "Improved Energy Templates": {"desc": "+1 energy-prod/2 power tags. Influence = power tags", "good": True},
    "Interplanetary Trade": {"desc": "+2 MC/space tag (max 5) + influence", "good": True},
    "Celebrity Leaders": {"desc": "+2 MC/event played (max 5) + influence", "good": True},
    "Spin-Off Products": {"desc": "+2 MC/science tag (max 5) + influence", "good": True},
    "Election": {"desc": "Count influence+building+cities. 1st +2 TR, 2nd +1 TR", "good": True},
    "Aquifer Released by Public Council": {"desc": "1st player places ocean. +1 plant +1 steel/influence", "good": True},
    "Paradigm Breakdown": {"desc": "Discard 2 cards. +2 MC/influence", "good": False},
    "Homeworld Support": {"desc": "+2 MC/Earth tag (max 5) + influence", "good": True},
    "Riots": {"desc": "-4 MC/city (max 5, -influence)", "good": False},
    "Volcanic Eruptions": {"desc": "Temp +2 steps. +1 heat-prod/influence", "good": True},
    "Mud Slides": {"desc": "-4 MC/tile adjacent to ocean (max 5, -influence)", "good": False},
    "Miners On Strike": {"desc": "-1 ti/Jovian tag (max 5, -influence)", "good": False},
    "Sabotage": {"desc": "-1 steel-prod, -1 energy-prod. +1 steel/influence", "good": False},
    "Revolution": {"desc": "Count Earth tags + influence. Most loses 2 TR, 2nd loses 1 TR", "good": False},
    "Dry Deserts": {"desc": "1st player removes 1 ocean. +1 resource/influence", "good": False},
    "Scientific Community": {"desc": "+1 MC/card in hand (no limit) + influence", "good": True},
    "Corrosive Rain": {"desc": "Lose 2 floaters or 10 MC. Draw 1 card/influence", "good": False},
    "Jovian Tax Rights": {"desc": "+1 MC-prod/colony. +1 ti/influence", "good": True},
    "Red Influence": {"desc": "-3 MC per 5 TR over 10 (max 5). +1 MC-prod/influence", "good": False},
    "Solarnet Shutdown": {"desc": "-3 MC/blue card (max 5, -influence)", "good": False},
    "Strong Society": {"desc": "+2 MC/city (max 5) + influence", "good": True},
    "Solar Flare": {"desc": "-3 MC/space tag (max 5, -influence)", "good": False},
    "Venus Infrastructure": {"desc": "+2 MC/Venus tag (max 5) + influence", "good": True},
    "Cloud Societies": {"desc": "+1 floater to each floater card. +1 floater/influence", "good": True},
    "Microgravity Health Problems": {"desc": "-3 MC/colony (max 5, -influence)", "good": False},
}

PARTY_POLICIES = {
    "Mars First": {"policy": "Action: -2 MC cost for cards with Mars tag", "icon": "🔴"},
    "Scientists": {"policy": "Action: +1 MC per Science tag when playing card", "icon": "🔬"},
    "Unity": {"policy": "Action: +1 MC per Venus/Earth/Jovian tag when playing card", "icon": "🌍"},
    "Greens": {"policy": "Action: +1 MC per Plant/Microbe/Animal tag when playing card", "icon": "🌿"},
    "Reds": {"policy": "-1 TR when raising any global parameter (penalty!)", "icon": "⛔"},
    "Kelvinists": {"policy": "Action: +1 MC when increasing heat production", "icon": "🔥"},
}

# Party strategy advice for delegate placement and policy usage
PARTY_STRATEGY: dict[str, dict] = {
    "Mars First": {
        "ruling_bonus": "+1 MC per Building tag (max 5, +influence)",
        "policy": "Action: spend 2 MC to gain Mars tag discount on next card",
        "good_for": ["Building-heavy", "Mining Guild", "IC", "Standard Technology"],
        "bad_for": ["Space-heavy", "Venus-focused"],
        "delegate_value": "high_if_building",
        "ruling_tip": "Отличная для Building стратегии. Влияние даёт +1 MC/building tag сверху",
    },
    "Scientists": {
        "ruling_bonus": "+1 MC per Science tag (max 5, +influence)",
        "policy": "Action: spend 10 MC to draw 3 cards",
        "good_for": ["Science-heavy", "card draw strategy", "AI Central"],
        "bad_for": ["no Science tags"],
        "delegate_value": "high_if_science",
        "ruling_tip": "Draw 3 за 10 MC — хорошая сделка mid-game. Science теги кормят бонус",
    },
    "Unity": {
        "ruling_bonus": "+1 MC per Venus/Earth/Jovian tag (max 5, +influence)",
        "policy": "Action: spend 2 MC to gain Space/Venus tag discount on next card",
        "good_for": ["Multi-planetary", "Point Luna", "Morning Star Inc", "Phobolog"],
        "bad_for": ["pure Building/Plant strategy"],
        "delegate_value": "medium",
        "ruling_tip": "Широкий бонус — Venus+Earth+Jovian теги. Хороша для разносторонних стратегий",
    },
    "Greens": {
        "ruling_bonus": "+1 MC per Plant/Microbe/Animal tag (max 5, +influence)",
        "policy": "Action: spend 5 MC to gain greenery placement bonus (2 plants)",
        "good_for": ["Bio strategy", "Ecoline", "Arklight", "Splice"],
        "bad_for": ["no green tags"],
        "delegate_value": "medium",
        "ruling_tip": "Хороша для bio engine. Policy даёт 2 plants за 5 MC — средне, но теги кормят",
    },
    "Reds": {
        "ruling_bonus": "-1 TR per parameter raise (PENALTY!)",
        "policy": "No beneficial policy for active players",
        "good_for": ["НИКОГО — Reds вредят всем"],
        "bad_for": ["terraforming strategy", "TR-focused", "all players"],
        "delegate_value": "negative",
        "ruling_tip": "⛔ БЛОКИРУЙ Reds любой ценой! -1 TR/шаг = катастрофа. Ставь делегатов в другую партию",
    },
    "Kelvinists": {
        "ruling_bonus": "+1 MC per heat production (max 5, +influence)",
        "policy": "Action: spend 2 MC to gain 1 heat production",
        "good_for": ["Heat strategy", "Helion", "temperature rush"],
        "bad_for": ["temperature already maxed"],
        "delegate_value": "medium_if_heat",
        "ruling_tip": "Policy даёт heat-prod за 2 MC — отлично для Helion. Бесполезна после max temp",
    },
}

# Global Event preparation advice — what to do when you see these coming
GLOBAL_EVENT_ADVICE: dict[str, str] = {
    "Global Dust Storm": "Потрать heat ДО события! Lose all heat + -2 MC/building. Копи influence",
    "Eco Sabotage": "Конвертируй plants в greenery ДО события! Lose all plants except 3+influence",
    "War on Earth": "-4 TR! Influence спасает. Ставь делегатов в dominant party для influence",
    "Pandemic": "-3 MC/building tag. Если много Building — копи MC или набирай influence",
    "Riots": "-4 MC/city. Если много городов — готовь MC резерв или influence",
    "Mud Slides": "-4 MC/tile adj. to ocean. Проверь сколько тайлов у тебя рядом с океаном",
    "Miners On Strike": "-1 ti/Jovian tag. Потрать titanium ДО события",
    "Sabotage": "-1 steel-prod, -1 energy-prod. Больно для Building engine",
    "Revolution": "Кто с наибольшим Earth+influence теряет 2 TR. Следи за Earth тегами",
    "Dry Deserts": "1st player removes ocean! Готовься к потере TR",
    "Corrosive Rain": "Lose 2 floaters or 10 MC. Если нет floaters — готовь 10 MC",
    "Paradigm Breakdown": "Discard 2 cards. Держи слабые карты для discard",
    "Red Influence": "-3 MC per 5 TR over 10. Чем выше TR — тем больше потери",
    "Solarnet Shutdown": "-3 MC/blue card. Много action карт = большие потери",
    "Solar Flare": "-3 MC/space tag. Space-heavy player страдает больше всех",
    "Microgravity Health Problems": "-3 MC/colony. Много колоний = больше потери",
    "Snow Cover": "Temp -2 steps. Если ты heat player — плохо (отдаляет конец). Draw card/influence",
    # Good events — how to maximize
    "Sponsored Projects": "Все карты с ресурсами +1! Не трать ресурсы до события. Influence = draw",
    "Asteroid Mining": "+1 ti/Jovian tag. Держи Jovian теги. Influence = extra ti",
    "Generous Funding": "+2 MC/influence + per 5 TR>15. Высокий TR = больше MC",
    "Successful Organisms": "+1 plant/plant-prod. Plant стратегия бенефитит",
    "Productivity": "+1 steel/steel-prod. Building стратегия бенефитит",
    "Diversity": "+10 MC if 9+ different tags. Считай свои уникальные теги",
    "Improved Energy Templates": "+1 energy-prod/2 power tags. Power теги ценнее",
    "Interplanetary Trade": "+2 MC/space tag. Space стратегия максимизирует",
    "Celebrity Leaders": "+2 MC/event played. Копи events до события",
    "Spin-Off Products": "+2 MC/science tag. Science стратегия максимизирует",
    "Election": "Influence+building+cities. 1st=+2 TR, 2nd=+1 TR. Строй города!",
    "Aquifer Released by Public Council": "1st player places ocean. Хорошо для ocean strategy",
    "Homeworld Support": "+2 MC/Earth tag. Earth стратегия максимизирует",
    "Volcanic Eruptions": "Temp +2 steps. Ускоряет конец. +1 heat-prod/influence",
    "Strong Society": "+2 MC/city. Больше городов = больше MC",
    "Venus Infrastructure": "+2 MC/Venus tag. Venus стратегия максимизирует",
    "Cloud Societies": "+1 floater everywhere. Floater cards бенефитят",
    "Jovian Tax Rights": "+1 MC-prod/colony. Много колоний = production boost",
    "Scientific Community": "+1 MC/card in hand. Держи карты! Card strategy максимизирует",
}


# ── Colonies ──

COLONY_TRADE_DATA = {
    "Luna": {"resource": "MC", "track": [1, 2, 4, 7, 10, 13, 17], "colony_bonus": "2 MC", "build": "+2 MC-prod"},
    "Ganymede": {"resource": "Plants", "track": [0, 1, 2, 3, 4, 5, 6], "colony_bonus": "1 plant", "build": "+1 plant-prod"},
    "Callisto": {"resource": "Energy", "track": [0, 2, 3, 5, 7, 10, 13], "colony_bonus": "3 energy", "build": "+3 energy"},
    "Triton": {"resource": "Titanium", "track": [0, 1, 1, 2, 3, 4, 5], "colony_bonus": "1 ti", "build": "+3 ti"},
    "Europa": {"resource": "MC+Ocean", "track": [1, 1, 2, 3, 4, 6, 8], "colony_bonus": "1 MC-prod", "build": "Place ocean"},
    "Miranda": {"resource": "Animals", "track": [0, 0, 1, 1, 2, 2, 3], "colony_bonus": "1 animal", "build": "+1 animal to card"},
    "Titan": {"resource": "Floaters", "track": [0, 1, 1, 2, 3, 3, 4], "colony_bonus": "1 floater", "build": "+3 floaters"},
    "Io": {"resource": "Heat", "track": [2, 3, 4, 6, 8, 10, 13], "colony_bonus": "2 heat", "build": "+2 heat-prod"},
    "Ceres": {"resource": "Steel", "track": [1, 2, 3, 4, 6, 8, 10], "colony_bonus": "2 steel", "build": "+3 steel"},
    "Enceladus": {"resource": "Microbes", "track": [0, 1, 1, 2, 3, 3, 4], "colony_bonus": "1 microbe", "build": "+3 microbes"},
    "Pluto": {"resource": "Cards", "track": [0, 1, 1, 2, 2, 3, 4], "colony_bonus": "1 card", "build": "+2 cards"},
}


# ── Colony Trade Modifiers ──

TRADE_DISCOUNT_CARDS = {"Cryo-Sleep", "Rim Freighters"}  # -1 energy/ti cost to trade
TRADE_TRACK_BOOST_CARDS = {"Trade Envoys": 1, "Trading Colony": 1, "L1 Trade Terminal": 2}
TRADE_MC_BONUS_CARDS = {"Venus Trade Hub": 3}
FREE_TRADE_CARDS = {"Titan Floating Launch-Pad"}  # spend 1 floater -> free trade

COLONY_SYNERGY_CARDS = {
    "Ecology Research": {"type": "plant_prod_per_colony", "per": 1},
    "Quantum Communications": {"type": "mc_prod_per_colony", "per": 1},
    "Molecular Printing": {"type": "mc_per_city_colony", "per": 1},
    "Colonial Representation": {"type": "influence_plus_rebate", "per": 3},
    "Productive Outpost": {"type": "free_colony_bonus", "per": 0},
}

COLONY_STANDARD_PROJECT_COST = 17  # MC to build a colony via standard project

# Colony tiering for strategic advice (3P/WGT/All expansions)
# Based on: BonelessDota, BGG community, TierMaker consensus
COLONY_TIERS: dict[str, dict] = {
    "Luna": {
        "tier": "S", "score": 92,
        "why": "Pure MC income, best early colony. ~3-4 MC-prod effective. Double/triple colony = dominant",
        "build_priority": 1,  # always build first action if available
        "best_with": ["Point Luna", "Teractor", "Earth Office"],
        "trade_value": "high",  # always good to trade
    },
    "Pluto": {
        "tier": "S", "score": 90,
        "why": "Cards = information + value. Best if you have money income. Card strategy enabler",
        "build_priority": 1,
        "best_with": ["Polyphemos", "Mars University", "Olympus Conference"],
        "trade_value": "high_if_income",  # need MC to use cards
    },
    "Ganymede": {
        "tier": "A", "score": 82,
        "why": "Plant prod + plant trade. Max trade = 6 plants = almost greenery. Strong mid-game",
        "build_priority": 2,
        "best_with": ["Ecoline", "Ecology Research", "Insects"],
        "trade_value": "high",
    },
    "Triton": {
        "tier": "A", "score": 80,
        "why": "Titanium = premium resource. Build bonus +3 Ti offsets 17 MC cost. Space strategy enabler",
        "build_priority": 2,
        "best_with": ["Phobolog", "Advanced Alloys", "Iron Mining Industries"],
        "trade_value": "medium",  # track grows slowly
    },
    "Ceres": {
        "tier": "A", "score": 78,
        "why": "Steel focused. Build bonus +3 steel. Good Building strategy support",
        "build_priority": 2,
        "best_with": ["Mining Guild", "Interplanetary Cinematics", "Standard Technology"],
        "trade_value": "medium",
    },
    "Miranda": {
        "tier": "B", "score": 72,
        "why": "Animals on VP cards. Strong late game with Fish/Birds. Slow early",
        "build_priority": 3,
        "best_with": ["Fish", "Birds", "Predators", "Livestock"],
        "trade_value": "high_if_targets",  # need animal cards
    },
    "Enceladus": {
        "tier": "B", "score": 70,
        "why": "Microbes. Great with Ants/Decomposers/Sulfur-Eating Bacteria. Triple colony = almost win",
        "build_priority": 3,
        "best_with": ["Ants", "Sulfur-Eating Bacteria", "Decomposers", "Venusian Insects"],
        "trade_value": "high_if_targets",
    },
    "Europa": {
        "tier": "B", "score": 68,
        "why": "Ocean placement + MC prod. Energy cheaper here (9 vs 11). Decent all-rounder",
        "build_priority": 2,
        "best_with": ["Arctic Algae", "Lakefront Resorts"],
        "trade_value": "medium",
    },
    "Titan": {
        "tier": "B", "score": 66,
        "why": "Floaters. Build bonus +3 floaters kickstarts floater engine. Needs floater cards",
        "build_priority": 3,
        "best_with": ["Dirigibles", "Floating Habs", "Jovian Lanterns", "Celestic"],
        "trade_value": "medium_if_targets",
    },
    "Io": {
        "tier": "C", "score": 55,
        "why": "Heat. Build +2 heat-prod is OK early. Useless after temperature maxed. Track grows fast but heat = worst resource",
        "build_priority": 4,
        "best_with": ["Helion", "Insulation"],
        "trade_value": "low_late",
    },
    "Callisto": {
        "tier": "C", "score": 52,
        "why": "Energy. Build +3 energy is nice for trade. But energy is means, not end. Almost useless late game",
        "build_priority": 4,
        "best_with": ["Standard Technology"],
        "trade_value": "low",
    },
}

# When to build vs trade heuristics
COLONY_BUILD_THRESHOLDS = {
    # tier -> (max_gen_to_build, min_gens_left_for_roi)
    "S": (6, 3),   # build S-tier up to gen 6, need 3 gens to ROI
    "A": (5, 4),   # build A-tier up to gen 5
    "B": (4, 5),   # build B-tier up to gen 4
    "C": (3, 6),   # build C-tier only early
}


# ── Display ──

TIER_COLORS = {
    "S": Fore.RED + Style.BRIGHT, "A": Fore.YELLOW + Style.BRIGHT,
    "B": Fore.YELLOW, "C": Fore.GREEN,
    "D": Fore.WHITE + Style.DIM, "F": Fore.WHITE + Style.DIM, "?": Fore.CYAN,
}

COLOR_MAP = {
    "red": Fore.RED, "green": Fore.GREEN, "blue": Fore.BLUE,
    "yellow": Fore.YELLOW, "orange": Fore.RED + Style.BRIGHT,
    "purple": Fore.MAGENTA, "black": Fore.WHITE + Style.DIM,
}
