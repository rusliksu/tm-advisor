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


# ── Colonies ──

COLONY_TRADE_DATA = {
    "Luna": {"resource": "MC", "track": [1, 2, 4, 7, 10, 13, 17], "colony_bonus": "2 MC-prod", "build": "+2 MC-prod"},
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
