"""CardEffectParser — парсит описания карт в структурированные CardEffect."""

import re
from typing import Optional

from .models import CardEffect


class CardEffectParser:
    """Парсит текстовые описания карт в структурированные CardEffect объекты."""

    # Resource type aliases
    _RES_ALIASES = {
        "animal": "Animal", "animals": "Animal", "ANIMAL": "Animal",
        "microbe": "Microbe", "microbes": "Microbe", "MICROBE": "Microbe",
        "floater": "Floater", "floaters": "Floater", "FLOATER": "Floater",
        "science": "Science", "science resource": "Science",
        "fighter": "Fighter", "fighters": "Fighter",
        "asteroid": "Asteroid", "asteroids": "Asteroid",
        "camp": "Camp", "camps": "Camp",
        "ware": "Ware", "wares": "Ware",
        "activist": "Activist", "activists": "Activist",
        "cathedral": "Cathedral", "cathedrals": "Cathedral",
        "standard resource": "Standard",
        "data": "Data", "DATA": "Data",
        "disease": "Disease",
        "tool": "Tool", "tools": "Tool",
        "journalism": "Journalism", "journalism resource": "Journalism",
        "preservation": "Preservation",
        "seed": "Seed", "SEED": "Seed",
        "clone trooper": "Clone Trooper",
        "ORBITAL": "Orbital",
        "SPECIALIZED_ROBOT": "Robot",
        "VENUSIAN_HABITAT": "Venusian Habitat",
        "AGENDA": "Agenda",
        "hydroelectric resource": "Hydroelectric",
        "graphene": "Graphene",
    }

    _PROD_ALIASES = {
        "m€": "mc", "megacredit": "mc", "megacredits": "mc", "mc": "mc",
        "steel": "steel", "titanium": "titanium", "ti": "titanium",
        "plant": "plant", "plants": "plant",
        "energy": "energy", "heat": "heat",
    }
    _GENERATED_PROD_KEYS = {
        "mp": "mc",
        "sp": "steel",
        "tp": "titanium",
        "pp": "plant",
        "ep": "energy",
        "hp": "heat",
    }
    _GENERATED_GAIN_KEYS = {
        "mc": "mc",
        "st": "steel",
        "ti": "titanium",
        "pl": "plant",
        "en": "energy",
        "ht": "heat",
    }
    _GENERATED_PLACEMENT_KEYS = {
        "oc": "ocean",
        "city": "city",
        "grn": "greenery",
    }
    _GENERATED_PROD_EXCLUDES = {
        # Generated fx currently leaks a fake mp:3 into this city card.
        "Phobos Space Haven": {"mc"},
        # Action costs are not immediate production changes.
        "Equatorial Magnetizer": {"energy"},
        "Venus Magnetizer": {"energy"},
        # Corporation actions are not starting production.
        "Robinson Industries": {"mc"},
        "Stormcraft Incorporated": {"heat"},
    }
    _GENERATED_TR_EXCLUDES = {
        # Action-only TR bumps must not inflate on-play value.
        "Equatorial Magnetizer",
    }
    _GENERATED_DRAW_EXCLUDES = {
        # Render icons near the action text leak as fake on-play card draw.
        "Floyd Continuum",
        # CEO OPG/filtering effects are not immediate free card draw. Their
        # strategic value is carried by CEO evaluations, not draws_cards.
        "Ender",
        "Tate",
    }
    _GENERATED_RESOURCE_HOLD_EXCLUDES = {
        # Feeder-only cards place microbes on another card; they do not store
        # resources or score VP from resources themselves.
        "Symbiotic Fungus",
        "Extreme-Cold Fungus",
    }
    _ACTION_RESOURCE_ADD_OVERRIDES = {
        "Symbiotic Fungus": [
            {"type": "Microbe", "amount": 1, "target": "another", "per_tag": None},
        ],
        "Extreme-Cold Fungus": [
            {"type": "Microbe", "amount": 2, "target": "another", "per_tag": None},
        ],
    }
    _DRAW_DISCARD_OVERRIDES = {
        # The cleaned DB description is truncated at "draw 4 cards,". Canonical
        # raw data and TS both say the initial action then discards 3 cards.
        "Spire": {"draws": 4, "discards": 3, "after": True},
    }
    _MANUAL_EFFECT_OVERRIDES = {
        # OR effect: choose either +2 plant production or +5 MC production.
        # The generic parser sees both clauses and otherwise overcounts them.
        "Lunar Exports": {
            "production_change": {"mc": 5},
        },
        # Cathedrals are special city markers, not resources on this card.
        # The generic "1 VP per ..." text parser must not treat them as a
        # direct static VP or resource-VP accumulator.
        "St. Joseph of Cupertino Mission": {
            "resource_type": "",
            "resource_holds": False,
            "vp_per": {},
        },
        # Moon corp is absent from the compact Python card catalog. Canonical
        # raw data and TS: 42 MC, first action draw 3 keep 2, science resources,
        # 1 VP per 2 science resources, action adds science to an eligible card.
        "Nanotech Industries": {
            "resource_type": "Science",
            "resource_holds": True,
            "draws_cards": 3,
            "discards_cards": 1,
            "discard_after_draw": True,
            "vp_per": {"amount": 1, "per": "2 resources"},
            "actions": [
                {"cost": "free", "effect": "add 1 science resource to any eligible card"},
            ],
            "adds_resources": [
                {"type": "Science", "amount": 1, "target": "any", "per_tag": None},
            ],
        },
        "Solarpedia": {
            "resource_type": "Data",
            "resource_holds": True,
            "vp_per": {"amount": 1, "per": "6 resources"},
            "actions": [
                {"cost": "free", "effect": "add 2 data to any card"},
            ],
            "adds_resources": [
                {"type": "Data", "amount": 2, "target": "any", "per_tag": None},
            ],
        },
        "Stratopolis": {
            "resource_type": "Floater",
            "resource_holds": True,
            "vp_per": {"amount": 1, "per": "3 resources"},
            "actions": [
                {"cost": "free", "effect": "add 2 floaters to any Venus card"},
            ],
            "adds_resources": [
                {"type": "Floater", "amount": 2, "target": "any", "per_tag": None, "tag_constraint": "Venus"},
            ],
        },
        "Floater-Urbanism": {
            "resource_type": "Venusian Habitat",
            "resource_holds": True,
            "vp_per": {"amount": 1, "per": "resource"},
            "actions": [
                {
                    "cost": "1 floater from any card",
                    "effect": "add 1 Venusian Habitat to this card",
                    "conditional": True,
                },
            ],
            "adds_resources": [
                {"type": "Venusian Habitat", "amount": 1, "target": "this", "per_tag": None},
            ],
        },
        "FloaterUrbanism": {
            "resource_type": "Venusian Habitat",
            "resource_holds": True,
            "vp_per": {"amount": 1, "per": "resource"},
            "actions": [
                {
                    "cost": "1 floater from any card",
                    "effect": "add 1 Venusian Habitat to this card",
                    "conditional": True,
                },
            ],
            "adds_resources": [
                {"type": "Venusian Habitat", "amount": 1, "target": "this", "per_tag": None},
            ],
        },
        # Cleaned DB description keeps only the city trigger; canonical raw text
        # also has the on-play animal.
        "Pets": {
            "adds_resources": [
                {"type": "Animal", "amount": 1, "target": "this", "per_tag": None},
            ],
        },
        # Compact catalog drops the trailing raw "| Add 1 animal on this card".
        "Pollinators": {
            "adds_resources": [
                {"type": "Animal", "amount": 1, "target": "this", "per_tag": None},
            ],
        },
    }

    def __init__(self, db):
        self.db = db
        self.effects: dict[str, CardEffect] = {}  # name -> CardEffect
        self._parse_all()

    # Manual overrides for well-known active cards missing action text
    _ACTION_OVERRIDES: dict[str, list[dict]] = {
        "Birds": [{"cost": "free", "effect": "add 1 animal to this card"}],
        "Fish": [{"cost": "free", "effect": "add 1 animal to this card"}],
        "Livestock": [{"cost": "free", "effect": "add 1 animal to this card"}],
        "Small Animals": [{"cost": "free", "effect": "add 1 animal to this card"}],
        "Penguins": [{"cost": "free", "effect": "add 1 animal to this card"}],
        "Stratospheric Birds": [{"cost": "free", "effect": "add 1 animal to this card"}],
        "Predators": [{"cost": "free", "effect": "add 1 animal (remove 1 animal from another)"}],
        "Extremophiles": [{"cost": "free", "effect": "add 1 microbe to this card"}],
        "GHG Producing Bacteria": [{"cost": "free", "effect": "add 1 microbe to this card"},
                                    {"cost": "2 microbes", "effect": "raise temperature 1 step"}],
        "Sulphur-Eating Bacteria": [{"cost": "free", "effect": "add 1 microbe to this card"},
                                     {"cost": "1+ microbes", "effect": "gain 3 MC per microbe spent"}],
        "Nitrite Reducing Bacteria": [{"cost": "free", "effect": "add 1 microbe to this card"},
                                       {"cost": "3 microbes", "effect": "raise TR 1 step"}],
        "Regolith Eaters": [{"cost": "free", "effect": "add 1 microbe to this card"},
                             {"cost": "2 microbes", "effect": "raise oxygen 1 step"}],
        "Tardigrades": [{"cost": "free", "effect": "add 1 microbe to this card"}],
        "Thermophiles": [{"cost": "free", "effect": "add 1 microbe to this card"},
                          {"cost": "2 microbes", "effect": "raise venus 1 step"}],
        "Symbiotic Fungus": [{"cost": "free", "effect": "add 1 microbe to another card"}],
        "Extreme-Cold Fungus": [
            {"cost": "free", "effect": "gain 1 plant", "choice_group": "or"},
            {"cost": "free", "effect": "add 2 microbes to another card", "choice_group": "or"},
        ],
        "Dirigibles": [{"cost": "free", "effect": "add 1 floater to any card"}],
        "Venus Shuttles": [{"cost": "dynamic Venus tag discount", "effect": "raise venus 1 step", "conditional": True}],
        "BreedingFarms": [{"cost": "1 plant", "effect": "add 1 animal to any card"}],
        "MartianCulture": [{"cost": "free", "effect": "add 1 data to any card"}],
        "NobelLabs": [{"cost": "free", "effect": "add 2 microbes or 2 data or 2 floaters to any card"}],
        "VeneraBase": [{"cost": "free", "effect": "add 1 floater to any Venus card"}],
        "Atmo Collectors": [{"cost": "free", "effect": "add 1 floater to this card"},
                             {"cost": "1 floater", "effect": "gain 2 titanium / 3 energy / 4 heat"}],
        "Celestic": [{"cost": "free", "effect": "add 1 floater to this card (or draw card)"}],
        "United Nations Mars Initiative": [{"cost": "3 MC", "effect": "raise TR 1 step if TR was raised this generation", "conditional": True}],
        "Factorum": [{"cost": "no energy resources", "effect": "increase energy production 1 step", "conditional": True},
                      {"cost": "3 MC", "effect": "draw 1 building card"}],
        "Viron": [
            {
                "cost": "used blue card action",
                "effect": "use a blue card action that has already been used this generation",
                "conditional": True,
            },
        ],
        "Tycho Magnetics": [{"cost": "any energy", "effect": "draw that many cards and keep 1"}],
        "Kuiper Cooperative": [{"cost": "free", "effect": "add 1 asteroid here per space tag", "conditional": True}],
        "Stormcraft Incorporated": [{"cost": "free", "effect": "add 1 floater to this card"}],
        "Robinson Industries": [{"cost": "4 MC", "effect": "increase one lowest production 1 step", "conditional": True}],
        "Palladin Shipping": [{"cost": "2 titanium", "effect": "raise temperature 1 step", "conditional": True}],
        "Utopia Invest": [{"cost": "1 production", "effect": "gain 4 resources of that kind", "conditional": True}],
        "Arcadian Communities": [{"cost": "free", "effect": "place a community marker", "conditional": True}],
        "Hadesphere": [{"cost": "free", "effect": "excavate an underground resource", "conditional": True}],
        "Septem Tribus": [{"cost": "free", "effect": "wild tag counts as any tag for this action", "conditional": True}],
        "Self-replicating Robots": [{"cost": "free", "effect": "link a Space or Building card from hand with 2 resources", "conditional": True},
                                    {"cost": "free", "effect": "double resources on a hosted card", "conditional": True}],
        "Mohole Lake": [{"cost": "free", "effect": "add 1 microbe or animal to another card", "conditional": True}],
        "Bioengineering Enclosure": [{"cost": "1 animal", "effect": "add 1 animal to another card", "conditional": True}],
        "Cloud Vortex Outpost": [{"cost": "1 floater", "effect": "add 1 floater to another card", "conditional": True}],
        "Applied Science": [
            {"cost": "1 science", "effect": "gain 1 standard resource", "conditional": True},
            {"cost": "1 science", "effect": "add 1 resource to any card with a resource", "conditional": True},
        ],
        "Board of Directors": [{"cost": "free", "effect": "draw 1 prelude; discard it or pay 12 MC and 1 director to play it", "conditional": True}],
        "Aeron Genomics": [{"cost": "claimed underground token(s)", "effect": "add up to 2 animals to any card", "conditional": True}],
        "Demetron Labs": [{"cost": "3 data", "effect": "identify 3 underground resources and claim 1", "conditional": True}],
        "The Darkside of The Moon Syndicate": [
            {"cost": "1 titanium", "effect": "add 1 syndicate fleet to this card"},
            {"cost": "1 syndicate fleet", "effect": "steal 2 MC from each opponent", "conditional": True},
        ],
        "Saturn Surfing": [{"cost": "1 floater", "effect": "gain 1 MC per floater here max 5", "conditional": True}],
        "Mars Nomads": [{"cost": "free", "effect": "move Nomads and collect placement bonus", "conditional": True}],
        "Teslaract": [{"cost": "1 energy production", "effect": "increase plant production 1 step", "conditional": True}],
        "Hospitals": [{"cost": "1 disease", "effect": "gain 1 MC per city in play", "conditional": True}],
        "Maxwell Base": [{"cost": "free", "effect": "add 1 resource to another Venus card", "conditional": True}],
        "Geologist Team": [{"cost": "free", "effect": "identify 1 underground resource", "conditional": True}],
        "Search for Life Underground": [{"cost": "1 MC", "effect": "identify 1 underground resource; if microbe add 1 science resource here", "conditional": True}],
        "Chemical Factory": [{"cost": "1 plant", "effect": "excavate 1 underground resource", "conditional": True}],
        "Corporate Theft": [{"cost": "5 MC", "effect": "steal any 1 resource from another player", "conditional": True}],
        "Deep Foundations": [{"cost": "20 MC", "effect": "excavate a valid city space if possible and place a city", "conditional": True}],
        "Monopoly": [{"cost": "1 corruption", "effect": "increase any production 1 step", "conditional": True}],
        "Space Privateers": [{"cost": "free", "effect": "steal up to 1 MC per fighter here from each other player", "conditional": True}],
        "Stem Field Subsidies": [{"cost": "2 data", "effect": "identify 3 underground resources and claim 1", "conditional": True}],
        "Titan Manufacturing Colony": [{"cost": "1 tool", "effect": "excavate 1 underground resource", "conditional": True}],
        "Underground Shelters": [{"cost": "free", "effect": "place a cube on one claimed underground resource token", "conditional": True}],
        "Voltaic Metallurgy": [{"cost": "any steel", "effect": "gain that many titanium max power tags", "conditional": True}],
        "Titan Floating Launch-pad": [{"cost": "free", "effect": "add 1 floater to a Jovian card"},
                                       {"cost": "1 floater", "effect": "trade for free"}],
        "Titan Air-scrapping": [{"cost": "1 titanium", "effect": "add 2 floaters to this card"},
                                 {"cost": "2 floaters", "effect": "raise TR 1 step"}],
        "Extractor Balloons": [{"cost": "free", "effect": "add 1 floater to this card"},
                                {"cost": "2 floaters", "effect": "raise venus 1 step"}],
        "Jet Stream Microscrappers": [{"cost": "1 titanium", "effect": "add 2 floaters to this card"},
                                       {"cost": "2 floaters", "effect": "raise venus 1 step"}],
        "Jupiter Floating Station": [{"cost": "free", "effect": "add 1 floater to a Jovian card"},
                                      {"cost": "free", "effect": "gain 1 MC per floater here max 4"}],
        "Floating Refinery": [{"cost": "free", "effect": "add 1 floater to this card"},
                              {"cost": "2 floaters", "effect": "gain 2 MC and 1 titanium"}],
        "Stratopolis": [{"cost": "free", "effect": "add 2 floaters to any Venus card"}],
        "Rotator Impacts": [{"cost": "6 MC", "effect": "add 1 asteroid to this card"},
                            {"cost": "1 asteroid", "effect": "raise venus 1 step"}],
        "Floating Habs": [{"cost": "2 MC", "effect": "add 1 floater to this card"}],
        "Local Shading": [{"cost": "free", "effect": "add 1 floater to this card"},
                           {"cost": "1 floater", "effect": "+1 MC-prod"}],
        "Orbital Cleanup": [{"cost": "free", "effect": "gain 1 MC per science tag"}],
        "Power Infrastructure": [{"cost": "any energy", "effect": "gain that many MC"}],
        "Floyd Continuum": [{"cost": "free", "effect": "gain 3 MC per completed terraforming parameter"}],
        "Focused Organization": [{"cost": "1 card and 1 standard resource", "effect": "draw 1 card and gain 1 standard resource", "conditional": True}],
        "World Government Advisor": [{"cost": "free", "effect": "raise 1 global parameter without TR or bonuses", "conditional": True}],
        "Electro Catapult": [{"cost": "1 plant/steel", "effect": "gain 7 MC"}],
        "AI Central": [{"cost": "free", "effect": "draw 2 cards"}],
        "St. Joseph of Cupertino Mission": [
            {
                "cost": "5 MC (steel may be used)",
                "effect": "build 1 Cathedral in a city; city owner may pay 2 MC to draw 1 card",
                "conditional": True,
            },
        ],
        "Business Network": [{"cost": "free", "effect": "look at the top card and either buy it or discard it"}],
        "Inventors' Guild": [{"cost": "free", "effect": "look at the top card and either buy it or discard it"}],
        "Space Elevator": [{"cost": "1 steel", "effect": "gain 5 MC"}],
        "Sub-Crust Measurements": [{"cost": "free", "effect": "draw 1 card"}],
        "Red Ships": [{"cost": "free", "effect": "gain 1 MC per ocean-adjacent city or special tile"}],
        "Martian Media Center": [{"cost": "3 MC", "effect": "add 1 delegate to any party", "conditional": True}],
        "Grey Market Exploitation": [
            {"cost": "1 MC", "effect": "gain 1 standard resource", "conditional": True},
            {"cost": "1 corruption", "effect": "gain 3 of the same standard resource", "conditional": True},
        ],
        "Microgravimetry": [
            {"cost": "2 energy", "effect": "identify 3 underground resources and claim 1", "conditional": True},
        ],
        "Personal Spacecruiser": [
            {"cost": "1 energy", "effect": "gain 2 MC for each corruption resource you have", "conditional": True},
        ],
        "Earthquake Machine": [{"cost": "1 energy", "effect": "excavate 1 underground resource", "conditional": True}],
        "Martian Express": [{"cost": "all ware resources", "effect": "gain 1 MC per ware removed", "conditional": True}],
        "Exploitation Of Venus": [{"cost": "1 corruption", "effect": "raise venus 1 step", "conditional": True}],
        "Standard Technology:u": [
            {
                "cost": "used standard project",
                "effect": "repeat a standard project already used this generation with cost reduced by 8 MC",
                "conditional": True,
            },
        ],
        "Arborist Collective": [
            {
                "cost": "2 activists",
                "effect": "increase plant production 1 step and gain 2 plants",
                "conditional": True,
            },
        ],
        "Voltagon": [{"cost": "8 energy", "effect": "raise oxygen or venus 1 step"}],
        "Industrial Center": [{"cost": "7 MC", "effect": "increase steel production 1 step"}],
        "Industrial Center:ares": [{"cost": "7 MC", "effect": "increase steel production 1 step"}],
        "Restricted Area:ares": [{"cost": "2 MC", "effect": "draw 1 card"}],
        "Development Center": [{"cost": "1 energy", "effect": "draw 1 card"}],
        "Water Splitting Plant": [{"cost": "3 energy", "effect": "raise oxygen 1 step"}],
        "Venus Magnetizer": [{"cost": "1 energy production", "effect": "raise venus 1 step"}],
        "Caretaker Contract": [{"cost": "8 heat", "effect": "raise TR 1 step"}],
        "Equatorial Magnetizer": [{"cost": "1 energy production", "effect": "raise TR 1 step"}],
        "Physics Complex": [{"cost": "6 energy", "effect": "add 1 science to this card"}],
        "Search For Life": [{"cost": "1 MC", "effect": "reveal top card; if microbe add 1 science resource here", "conditional": True}],
        "Restricted Area": [{"cost": "2 MC", "effect": "draw 1 card"}],
        "Project Workshop": [{"cost": "3 MC", "effect": "draw 1 blue card", "choice_group": "or"},
                             {"cost": "played blue card",
                              "effect": "convert VP on discarded blue card to TR and draw 2 cards",
                              "choice_group": "or", "conditional": True}],
        "Security Fleet": [{"cost": "1 MC", "effect": "add 1 fighter to this card"}],
        "Anthozoa": [{"cost": "1 plant", "effect": "add 1 animal to this card"}],
        "Investigative Journalism": [
            {
                "cost": "5 MC and 1 corruption from another player",
                "effect": "add 1 journalism resource to this card",
                "conditional": True,
            },
        ],
        "Refugee Camps": [{"cost": "1 MC production", "effect": "add 1 camp resource to this card"}],
        "Bio Printing Facility": [{"cost": "2 energy", "effect": "gain 2 plants", "choice_group": "or"},
                                  {"cost": "2 energy", "effect": "add 1 animal to another card",
                                   "choice_group": "or", "conditional": True}],
        "Ceres Tech Market": [{"cost": "1 science", "effect": "draw cards"}],
        "EconomicEspionage": [{"cost": "2 MC", "effect": "add 1 data to any card"}],
        "Economic Espionage": [{"cost": "2 MC", "effect": "add 1 data to any card"}],
        "Mars University": [],  # trigger, not action per se
        "Vermin": [{"cost": "free", "effect": "add 1 animal here or 1 microbe to another card"}],
    }

    _TRIGGER_OVERRIDES: dict[str, list[dict]] = {
        # These are trigger-only resource VP cards, not blue actions.
        "Decomposers": [
            {
                "on": "play an animal, plant, or microbe tag",
                "effect": "add a microbe to this card",
                "self": True,
            },
        ],
        "Ecological Zone": [
            {
                "on": "play an animal or plant tag",
                "effect": "add an animal to this card",
                "self": True,
            },
        ],
        "Ecological Zone:ares": [
            {
                "on": "play an animal or plant tag",
                "effect": "add an animal to this card",
                "self": True,
            },
        ],
        "Arklight": [
            {
                "on": "play an animal or plant tag",
                "effect": "add 1 animal to this card",
                "self": True,
            },
        ],
        "Arborist Collective": [
            {
                "on": "play an event card with base cost 14 or less",
                "effect": "add an activist resource to this card",
                "self": True,
            },
        ],
        "Pristar": [
            {
                "on": "production phase if you did not get TR this generation",
                "effect": "add one preservation resource here and gain 6 M€",
                "self": False,
            },
        ],
        "Research & Development Hub": [
            {
                "on": "end of each production phase for each other player with 7 or more cards in hand",
                "effect": "add 1 data here",
                "self": False,
            },
        ],
        "Neptunian Power Consultants": [
            {
                "on": "any ocean is placed",
                "effect": "you may pay 5 M€ to raise energy production 1 step and add 1 hydroelectric resource to this card",
                "self": False,
            },
        ],
        "Venusian Animals": [
            {
                "on": "play a science tag",
                "effect": "add 1 animal to this card",
                "self": True,
            },
        ],
    }

    # Implicit "add resource to self" for hasAction + resourceType cards
    _SELF_ADD_RESOURCES = {"Animal", "Microbe", "Floater", "Science", "Fighter", "Asteroid",
                           "Data", "Orbital", "Robot", "Venusian Habitat", "Agenda", "Seed"}
    _SELF_ADD_RESOURCE_EXCLUDES = {
        # Resources are added only after a successful reveal/identify, not as a
        # guaranteed self-feed action.
        "Search For Life",
        "Search for Life Underground",
        # These actions add resources to any eligible card, not a guaranteed
        # one-resource self-feed.
        "Aeron Genomics",
        "Applied Science",
        "Bioengineering Enclosure",
        "Board of Directors",
        "Cloud Vortex Outpost",
        "Demetron Labs",
        "Solarpedia",
        "Stratopolis",
    }

    def _parse_all(self):
        """Парсит все карты из card_info."""
        for name, info in self.db.card_info.items():
            eff = CardEffect(name)
            desc = self.db.get_desc(name)
            if isinstance(desc, dict):
                desc = desc.get("text", str(desc))
            if not isinstance(desc, str):
                desc = ""
            res_type = info.get("resourceType", "")
            if isinstance(res_type, str) and res_type:
                eff.resource_type = self._RES_ALIASES.get(res_type, res_type)
                eff.resource_holds = True

            if desc:
                self._parse_description(eff, desc, info)
            self._apply_generated_effect_fallback(eff, self.db.get_generated_effect(name))
            draw_override = self._DRAW_DISCARD_OVERRIDES.get(name)
            if draw_override:
                eff.draws_cards = draw_override["draws"]
                eff.discards_cards = draw_override["discards"]
                eff.discard_after_draw = bool(draw_override.get("after"))
            manual_override = self._MANUAL_EFFECT_OVERRIDES.get(name)
            if manual_override:
                self._apply_manual_effect_override(eff, manual_override)

            # Apply action overrides for known cards
            if name in self._ACTION_OVERRIDES:
                eff.actions = self._ACTION_OVERRIDES[name]
                # Also ensure resource adds are populated
                for act in eff.actions:
                    if "add" in act.get("effect", "") and "to this card" in act.get("effect", ""):
                        m = re.match(r"add (\d+) (\w+)", act["effect"])
                        if m:
                            rt = self._RES_ALIASES.get(m.group(2), m.group(2).title())
                            if not any(a["target"] == "this" and a["type"] == rt for a in eff.adds_resources):
                                eff.adds_resources.append({"type": rt, "amount": int(m.group(1)),
                                                            "target": "this", "per_tag": None})
                for add in self._ACTION_RESOURCE_ADD_OVERRIDES.get(name, []):
                    if not any(
                        a["target"] == add["target"]
                        and a["type"] == add["type"]
                        and a.get("amount", 1) == add["amount"]
                        for a in eff.adds_resources
                    ):
                        eff.adds_resources.append(dict(add))

            # Auto-generate implicit action for hasAction + resourceType cards
            elif info.get("hasAction") and res_type in self._SELF_ADD_RESOURCES:
                if not eff.actions:  # don't override if already parsed
                    eff.actions.append({"cost": "free", "effect": f"add 1 {res_type.lower()} to this card", "implicit": True})

            trigger_override = self._TRIGGER_OVERRIDES.get(name)
            if trigger_override:
                eff.triggers = [dict(trig) for trig in trigger_override]

            # Ensure all resource-holding action cards have self-add in adds_resources
            # (even if actions were parsed from description, e.g. Ants)
            if (
                info.get("hasAction")
                and res_type in self._SELF_ADD_RESOURCES
                and name not in self._SELF_ADD_RESOURCE_EXCLUDES
            ):
                if not any(a["target"] == "this" and a["type"] == res_type for a in eff.adds_resources):
                    eff.adds_resources.append({"type": res_type, "amount": 1,
                                                "target": "this", "per_tag": None})

            self.effects[name] = eff
            norm = self.db._normalize(name)
            self.effects[norm] = eff

        # Some corporations are missing from the Python card catalog but still
        # appear in live snapshots and generated JS data. Preserve their manual
        # action facts so advisor checks do not silently drop them.
        for name, actions in self._ACTION_OVERRIDES.items():
            norm = self.db._normalize(name)
            if name in self.effects or norm in self.effects:
                continue
            eff = CardEffect(name)
            eff.actions = [dict(action) for action in actions]
            self.effects[name] = eff
            self.effects[norm] = eff

        for name, override in self._MANUAL_EFFECT_OVERRIDES.items():
            norm = self.db._normalize(name)
            if name in self.effects or norm in self.effects:
                continue
            eff = CardEffect(name)
            self._apply_manual_effect_override(eff, override)
            self.effects[name] = eff
            self.effects[norm] = eff

    def get(self, name: str) -> Optional[CardEffect]:
        if name in self.effects:
            return self.effects[name]
        norm = self.db._normalize(name)
        return self.effects.get(norm)

    @staticmethod
    def _apply_manual_effect_override(eff: CardEffect, override: dict):
        for key in (
            "resource_type", "resource_holds", "draws_cards",
            "discards_cards", "discard_after_draw", "opponents_draw_cards",
        ):
            if key in override:
                setattr(eff, key, override[key])
        if "vp_per" in override:
            eff.vp_per = dict(override["vp_per"])
        if "production_change" in override:
            eff.production_change = dict(override["production_change"])
        if "actions" in override:
            eff.actions = [dict(action) for action in override["actions"]]
        if "adds_resources" in override:
            eff.adds_resources = [dict(add) for add in override["adds_resources"]]

    def _apply_generated_effect_fallback(self, eff: CardEffect, generated: dict | None):
        if not generated or not isinstance(generated, dict):
            return

        res_type_raw = generated.get("res")
        if (
            eff.name not in self._GENERATED_RESOURCE_HOLD_EXCLUDES
            and not eff.resource_holds
            and isinstance(res_type_raw, str)
            and res_type_raw
        ):
            res_type = self._RES_ALIASES.get(res_type_raw.lower(), res_type_raw.title())
            eff.resource_type = res_type
            eff.resource_holds = True

        excluded_prod = self._GENERATED_PROD_EXCLUDES.get(eff.name, set())
        for gen_key, prod_key in self._GENERATED_PROD_KEYS.items():
            amount = generated.get(gen_key)
            if (
                isinstance(amount, (int, float))
                and amount
                and prod_key not in eff.production_change
                and prod_key not in excluded_prod
            ):
                eff.production_change[prod_key] = int(amount) if float(amount).is_integer() else amount

        if eff.name not in self._GENERATED_TR_EXCLUDES:
            derived_tr = 0
            for tr_key in ("tr", "tmp", "o2", "oc", "vn"):
                amount = generated.get(tr_key)
                if isinstance(amount, (int, float)) and amount > 0:
                    derived_tr += amount
            if derived_tr > eff.tr_gain:
                eff.tr_gain = derived_tr

        needs_discount_fallback = (
            not eff.discount
            or any(not isinstance(tag, str) or len(tag.strip()) <= 1 for tag in eff.discount.keys())
        )
        if needs_discount_fallback:
            if eff.discount:
                eff.discount = {}
            disc = generated.get("disc")
            if isinstance(disc, dict):
                amount = disc.get("amount")
                tag = disc.get("tag")
                if isinstance(amount, (int, float)) and amount > 0:
                    if isinstance(tag, str) and tag:
                        eff.discount[tag.title()] = int(amount) if float(amount).is_integer() else amount
                    else:
                        eff.discount["all"] = int(amount) if float(amount).is_integer() else amount
            elif isinstance(disc, (int, float)) and disc > 0:
                eff.discount["all"] = int(disc) if float(disc).is_integer() else disc

        for gen_key, tile_name in self._GENERATED_PLACEMENT_KEYS.items():
            amount = generated.get(gen_key)
            if isinstance(amount, (int, float)) and amount > 0 and tile_name not in eff.placement:
                eff.placement.append(tile_name)

        raw_draws = generated.get("cd")
        if (
            eff.name not in self._GENERATED_DRAW_EXCLUDES
            and eff.draws_cards == 0
            and isinstance(raw_draws, (int, float))
            and raw_draws >= 1
            and float(raw_draws).is_integer()
        ):
            eff.draws_cards = int(raw_draws)

        for gen_key, res_name in self._GENERATED_GAIN_KEYS.items():
            amount = generated.get(gen_key)
            if isinstance(amount, (int, float)) and amount > 0 and res_name not in eff.gains_resources:
                eff.gains_resources[res_name] = int(amount) if float(amount).is_integer() else amount

        if not eff.vp_per:
            vp_tag = generated.get("vpTag")
            if isinstance(vp_tag, dict):
                tag = vp_tag.get("tag")
                per = vp_tag.get("per", 1)
                if isinstance(tag, str) and tag:
                    eff.vp_per = {"amount": 1, "per": f"{per} {tag.title()} tag"}
            else:
                vp_acc = generated.get("vpAcc")
                vp_per = generated.get("vpPer")
                if isinstance(vp_acc, (int, float)) and vp_acc > 0 and eff.resource_holds:
                    if isinstance(vp_per, (int, float)) and vp_per > 1:
                        per_label = f"{int(vp_per) if float(vp_per).is_integer() else vp_per} resources"
                    else:
                        per_label = "resource"
                    eff.vp_per = {"amount": 1, "per": per_label}
                else:
                    static_vp = generated.get("vp")
                    if isinstance(static_vp, (int, float)) and static_vp > 0:
                        eff.vp_per = {"amount": int(static_vp) if float(static_vp).is_integer() else static_vp, "per": "flat"}

    @staticmethod
    def _parse_target(tgt: str) -> tuple[str, str | None]:
        """Parse target string → (target, tag_constraint).

        "this card"     → ("this", None)
        "any card"      → ("any", None)
        "any venus card"→ ("any", "Venus")
        "another card"  → ("another", None)
        "a jovian card" → ("another", "Jovian")
        """
        if "this" in tgt or tgt == "it":
            return "this", None
        if "any" in tgt:
            tc = re.match(r'any\s+(\w+)\s+card', tgt)
            constraint = tc.group(1).title() if tc else None
            return "any", constraint
        if "another" in tgt:
            tc = re.match(r'another\s+(\w+)\s+card', tgt)
            constraint = tc.group(1).title() if tc else None
            return "another", constraint
        # "a jovian card", "a venus card" etc.
        tc = re.match(r'a\s+(\w+)\s+card', tgt)
        constraint = tc.group(1).title() if tc else None
        return "another", constraint

    def _parse_description(self, eff: CardEffect, desc: str, info: dict):
        """Парсит описание карты и заполняет CardEffect."""
        desc_lower = desc.lower()
        # Immediate on-play parsing should ignore action/trigger clauses.
        # Otherwise cards like Energy Market or Venus Trade Hub leak action/trigger
        # text into top-level gains/production.
        desc_immediate = re.sub(
            r'action:\s*.+?(?=(?:action:|effect:|$))',
            ' ',
            desc_lower,
        )
        desc_immediate = re.sub(
            r'effect:\s*.+?(?=(?:action:|effect:|$))',
            ' ',
            desc_immediate,
        )
        desc_immediate = re.sub(
            r'(?:^|[.!]\s*)(?:when|whenever|after|each time)\s+.+?(?:\.|$)',
            ' ',
            desc_immediate,
        )
        desc_immediate = re.sub(
            r'\b(?:when|whenever|after|each time)\s+.+?(?:\.|$)',
            ' ',
            desc_immediate,
        )
        desc_immediate = re.sub(
            r'\bfor every\s+[^.|]+?\s+you\s+play\s*(?:\([^)]*\))?\s*,?\s*'
            r'(?:add|put|gain|draw|place|remove|increase|decrease)\s+.+?(?:\.|$)',
            ' ',
            desc_immediate,
        )

        # --- Resource placement: "Add N resource to ..." ---
        # Supports: "add 3 microbes or 2 animals to ANOTHER card"
        #           "add 1 asteroid resource to ANY CARD"
        #           "add 1 data per step to any card"
        for m in re.finditer(
            r'add\s+(\d+)\s+(\w+(?:\s+(?!here\b|per\b)\w+)?(?:\s+or\s+\d+\s+\w+)*)\s+'
            r'(?:resources?\s+)?'
            r'(?:per\s+\w+\s+)?'
            r'to\s+'
            r'(this card|it|any\s*\w*\s*card|another\s*\w*\s*card|a\s+\w+\s+card)',
            desc_immediate
        ):
            amount = int(m.group(1))
            res_raw = m.group(2).strip()
            tgt = m.group(3)
            # Strip noise: "resource" suffix, trailing "here"/"per"
            res_raw = re.sub(r'\s+resources?$', '', res_raw).strip()
            res_raw = re.sub(r'\s+(?:here|per)$', '', res_raw).strip()
            target, tag_constraint = self._parse_target(tgt)
            res_type = self._RES_ALIASES.get(res_raw, res_raw.title())
            entry = {"type": res_type, "amount": amount, "target": target, "per_tag": None}
            if tag_constraint:
                entry["tag_constraint"] = tag_constraint

            # Check "per step" scaling
            if "per step" in desc_immediate[m.start():m.end()+10]:
                entry["per_tag"] = "_per_step"

            # Check for per-tag scaling: "add 1 microbe to it for each science tag"
            after = desc_immediate[m.end():]
            per_m = re.match(r'\s*(?:for each|per)\s+(\w+)\s+tag', after)
            if per_m:
                entry["per_tag"] = per_m.group(1).title()

            # Avoid exact duplicates (e.g. Solarpedia has "Add 2 data to ANY card" twice)
            if not any(a["type"] == entry["type"] and a["amount"] == entry["amount"]
                       and a["target"] == entry["target"] and a.get("per_tag") == entry.get("per_tag")
                       for a in eff.adds_resources):
                eff.adds_resources.append(entry)

        # Continuation: "and N resource to TARGET" (e.g. Imported Nitrogen)
        for m in re.finditer(
            r'and\s+(\d+)\s+(\w+)\s+to\s+'
            r'(another\s*\w*\s*card|any\s*\w*\s*card|this card|a\s+\w+\s+card)',
            desc_immediate
        ):
            amount = int(m.group(1))
            res_raw = m.group(2).strip()
            if res_raw.isdigit():
                continue
            target, tag_constraint = self._parse_target(m.group(3))
            res_type = self._RES_ALIASES.get(res_raw, res_raw.title())
            if not any(a["type"] == res_type and a["target"] == target and a["amount"] == amount
                       for a in eff.adds_resources):
                entry = {"type": res_type, "amount": amount, "target": target, "per_tag": None}
                if tag_constraint:
                    entry["tag_constraint"] = tag_constraint
                eff.adds_resources.append(entry)

        # "add N resource here" = add to self (e.g. Vermin: "add 1 animal here")
        for m in re.finditer(r'add\s+(\d+)\s+(\w+)\s+here', desc_immediate):
            amount = int(m.group(1))
            res_raw = m.group(2).strip()
            res_type = self._RES_ALIASES.get(res_raw, res_raw.title())
            if not any(a["target"] == "this" and a["type"] == res_type for a in eff.adds_resources):
                eff.adds_resources.append({"type": res_type, "amount": amount,
                                            "target": "this", "per_tag": None})

        # Also catch "add resource to" without number (= add 1)
        for m in re.finditer(
            r'add\s+(?:a\s+|an?\s+)?([\w]+)\s+(?:resource\s+)?to\s+'
            r'(this card|any\s*\w*\s*card|another\s*\w*\s*card|a\s+\w+\s+card)',
            desc_immediate
        ):
            res_raw = m.group(1).strip()
            if res_raw.isdigit() or res_raw in ("it", "them", "one", "this"):
                continue  # already caught above / pronouns
            target, tag_constraint = self._parse_target(m.group(2))
            res_type = self._RES_ALIASES.get(res_raw, res_raw.title())
            # Avoid duplicates
            if not any(a["type"] == res_type and a["target"] == target for a in eff.adds_resources):
                entry = {"type": res_type, "amount": 1, "target": target, "per_tag": None}
                if tag_constraint:
                    entry["tag_constraint"] = tag_constraint
                eff.adds_resources.append(entry)

        # --- Resource removal: "remove N resource ... to ..." ---
        for m in re.finditer(
            r'remove\s+(\d+)\s+([\w]+)s?\s+(?:from\s+(?:\w+\s+){1,3})?(?:to|and)\s+(.+?)(?:\.|$)',
            desc_immediate
        ):
            amount = int(m.group(1))
            res_raw = m.group(2).strip()
            gives = m.group(3).strip()[:60]
            res_type = self._RES_ALIASES.get(res_raw, res_raw.title())
            eff.removes_resources.append({"type": res_type, "amount": amount, "gives": gives})

        # --- Production changes ---
        for m in re.finditer(
            r'(increase|decrease)\s+(?:your\s+)?([\w€]+)\s+production\s+(\d+)\s+step',
            desc_immediate
        ):
            direction = 1 if m.group(1) == "increase" else -1
            res = self._PROD_ALIASES.get(m.group(2), m.group(2))
            amount = int(m.group(3)) * direction
            eff.production_change[res] = eff.production_change.get(res, 0) + amount

        # --- Tag-scaling production: "1 step for each X tag" ---
        for m in re.finditer(
            r'(increase|decrease)\s+(?:your\s+)?([\w€]+)\s+production\s+(\d+)\s+step.*?for\s+each\s+(\w+)\s+tag',
            desc_immediate
        ):
            res = self._PROD_ALIASES.get(m.group(2), m.group(2))
            tag = m.group(4).title()
            amount = int(m.group(3))
            direction = 1 if m.group(1) == "increase" else -1
            eff.tag_scaling.append({"tag": tag, "per": 1, "gives": f"{amount * direction} {res}-prod"})

        # --- Tag-scaling TR: "raise TR 1 step for each X tag" ---
        for m in re.finditer(
            r'raise\s+(?:your\s+)?tr\s+(\d+)\s+step.*?for\s+each\s+(\w+)\s+tag',
            desc_immediate
        ):
            amount = int(m.group(1))
            tag = m.group(2).title()
            eff.tag_scaling.append({"tag": tag, "per": 1, "gives": f"{amount} TR"})

        # --- Tag-scaling resource add: "add 1 X for each Y tag" / "per Y tag" ---
        for m in re.finditer(
            r'add\s+(\d+)\s+([\w]+).*?(?:for each|per)\s+(\w+)\s+tag',
            desc_immediate
        ):
            amount = int(m.group(1))
            res_raw = m.group(2).strip()
            tag = m.group(3).title()
            res_type = self._RES_ALIASES.get(res_raw, res_raw.title())
            # Update existing add_resources entry
            for entry in eff.adds_resources:
                if entry["type"] == res_type:
                    entry["per_tag"] = tag
                    break

        # --- TR gain ---
        for m in re.finditer(r'raise\s+(?:your\s+)?tr\s+(\d+)', desc_immediate):
            eff.tr_gain += int(m.group(1))
        # Temperature, oxygen, ocean → TR
        if "raise temperature" in desc_immediate or "raise the temperature" in desc_immediate:
            eff.tr_gain += desc_immediate.count("raise temperature") + desc_immediate.count("raise the temperature")
        if "place" in desc_immediate and "ocean" in desc_immediate:
            ocean_count = len(re.findall(r'place\s+(\d+)?\s*ocean', desc_immediate))
            if ocean_count:
                for m in re.finditer(r'place\s+(\d+)\s+ocean', desc_immediate):
                    eff.tr_gain += int(m.group(1))
                if not re.search(r'place\s+\d+\s+ocean', desc_immediate):
                    eff.tr_gain += ocean_count  # "place ocean" = 1
        if "raise oxygen" in desc_immediate or "raise the oxygen" in desc_immediate:
            eff.tr_gain += 1
        if "raise venus" in desc_immediate or "raise the venus" in desc_immediate:
            eff.tr_gain += 1

        # --- VP ---
        def normalize_vp_per(per_text: str) -> str:
            raw = str(per_text or "").strip()
            low = raw.lower()
            resource_words = (
                "resource", "animal", "microbe", "floater", "data",
                "hydroelectric", "preservation", "journalism", "ware",
                "activist", "robot", "habitat", "asteroid", "fighter",
            )
            if any(word in low for word in resource_words):
                num_match = re.search(r'\b(\d+(?:\.\d+)?)\b', low)
                if num_match:
                    return f"{num_match.group(1)} resources"
                return "resource"
            return raw

        vp = info.get("victoryPoints", "")
        if vp:
            vp_str = str(vp)
            if "/" in vp_str:
                parts = vp_str.split("/")
                try:
                    vp_amount = int(parts[0].strip())
                    per = normalize_vp_per(parts[1].strip())
                    eff.vp_per = {"amount": vp_amount, "per": per}
                except ValueError:
                    pass
            else:
                try:
                    eff.vp_per = {"amount": int(vp_str), "per": "flat"}
                except ValueError:
                    pass

        # Check description for VP patterns too
        for m in re.finditer(r'(\d+)\s+vp\s+(?:per|for each|for every)\s+(.+?)(?:\.|$)', desc_immediate):
            if not eff.vp_per:
                eff.vp_per = {"amount": int(m.group(1)), "per": normalize_vp_per(m.group(2).strip())}

        # --- Discounts ---
        for m in re.finditer(r'(?:you\s+)?pay\s+(\d+)\s+m[€c]\s+less\s+(?:for\s+)?(?:it|them)?', desc_lower):
            amount = int(m.group(1))
            context = desc_lower[max(0, m.start() - 180):m.start()]
            # Find what tag discount applies to. Pathfinder-style trigger
            # discounts often use "When playing a power card" or
            # "When you play a Venus or Mars tag".
            known_tags = (
                "science", "earth", "building", "space", "jovian", "venus",
                "plant", "animal", "microbe", "power", "city", "event",
                "moon", "mars",
            )
            matched_tags = []
            for tag in known_tags:
                if re.search(rf'\b{re.escape(tag)}\b(?:\s+(?:tag|card)|\s*,|\s+or\b|\s+and\b)', context):
                    matched_tags.append(tag.title())
            if matched_tags:
                for tag in matched_tags:
                    eff.discount[tag] = amount
            else:
                if "when" not in context and "whenever" not in context:
                    eff.discount["all"] = amount

        # --- Triggered effects ---
        # Multiple trigger prefixes: when, each time, after, whenever
        _trigger_prefixes = [
            r'effect:\s*when\s+(?:you\s+)?',
            r'effect:\s*each\s+time\s+(?:you\s+)?',
            r'effect:\s*after\s+you\s+',
            r'effect:\s*whenever\s+',
        ]
        _verb_pat = (
            r'(?:also\s+|either\s+)?'
            r'(?:'
            r'add|gain|raise|increase|decrease|draw|place|remove|lose|pay|spend'
            r'|put'
            r'|you\s+(?:may|can|pay|gain|get|draw|lose|spend)'
            r'|that\s+player'
            r')'
        )
        for prefix in _trigger_prefixes:
            for m in re.finditer(
                prefix + r'(.+?),\s*'
                r'(?P<self>incl(?:uding)?\.?\s+this,\s*)?'
                r'(?:except\s+[^,]+,\s*)?'
                r'(' + _verb_pat + r')\s+'
                r'(.+?)(?:\.|effect:|action:|$)',
                desc_lower
            ):
                trigger = m.group(1).strip()
                effect_text = (m.group(3) + " " + m.group(4)).strip()
                includes_self = bool(m.group("self"))
                if not any(t["on"] == trigger for t in eff.triggers):
                    eff.triggers.append({"on": trigger, "effect": effect_text, "self": includes_self})

        # Relaxed fallback for "after/when ..., except ..., you gain/draw..."
        # cards such as Standard Technology where the exception clause sits
        # between the trigger and the effect.
        if not eff.triggers:
            for prefix in _trigger_prefixes:
                for m in re.finditer(
                    prefix + r'(.+?)\s*,\s*'
                    r'(?:except\s+[^,]+,\s*)?'
                    r'(' + _verb_pat + r')\s+'
                    r'(.+?)(?:\.|effect:|action:|$)',
                    desc_lower
                ):
                    trigger = m.group(1).strip()
                    effect_text = (m.group(2) + " " + m.group(3)).strip()
                    if not any(t["on"] == trigger and t["effect"] == effect_text for t in eff.triggers):
                        eff.triggers.append({"on": trigger, "effect": effect_text, "self": False})

        # Cost-modifier triggers: "when playing/paying for X, Y may be used as Z"
        for m in re.finditer(
            r'effect:\s*when\s+(?:you\s+)?'
            r'((?:pay(?:ing)?\s+for|play(?:ing)?|buy(?:ing)?|use)\s+.+?),\s*'
            r'(?P<self>incl(?:uding)?\.?\s+this,\s*)?'
            r'(.+?)\s+(?:here\s+)?may\s+be\s+used\s+'
            r'(.+?)(?:\.|effect:|action:|$)',
            desc_lower
        ):
            trigger = m.group(1).strip()
            resource = m.group(3).strip()
            effect_text = f"{resource} may be used {m.group(4).strip()}"
            includes_self = bool(m.group("self"))
            if not any(t["on"] == trigger for t in eff.triggers):
                eff.triggers.append({"on": trigger, "effect": effect_text, "self": includes_self})

        # Standalone triggers without explicit "effect:" prefix
        if not eff.triggers and 'effect:' not in desc_lower:
            _standalone_trigger_prefixes = [
                r'(?:^|[.!|]\s*)when\s+(?:you\s+)?',
                r'(?:^|[.!|]\s*)after\s+(?:you\s+)?',
                r'(?:^|[.!|]\s*)each\s+time\s+(?:you\s+)?',
                r'(?:^|[.!|]\s*)whenever\s+',
            ]
            for prefix in _standalone_trigger_prefixes:
                for m in re.finditer(
                    prefix + r'(.+?)\s*,\s*'
                    r'(?P<self>incl(?:uding)?\.?\s+this,\s*)?'
                    r'(?:except\s+[^,]+,\s*)?'
                    r'(' + _verb_pat + r')\s+'
                    r'(.+?)(?:\.|$)',
                    desc_lower
                ):
                    trigger = m.group(1).strip()
                    effect_text = (m.group(3) + " " + m.group(4)).strip()
                    includes_self = bool(m.group("self"))
                    if not any(t["on"] == trigger and t["effect"] == effect_text for t in eff.triggers):
                        eff.triggers.append({"on": trigger, "effect": effect_text, "self": includes_self})

        # "For every science or Mars tag you play (including these), add ..."
        # appears on several fan/pathfinder cards without a leading Effect:.
        for m in re.finditer(
            r'(?:^|[.!|]\s*)for every\s+(.+?\s+tag)\s+you\s+play\s*'
            r'(?:\((including\s+(?:this|these))\))?\s*,?\s*'
            r'(' + _verb_pat + r')\s+'
            r'(.+?)(?:\.|$)',
            desc_lower,
        ):
            trigger = f"play a {m.group(1).strip()}"
            effect_text = (m.group(3) + " " + m.group(4)).strip()
            includes_self = bool(m.group(2))
            if not any(t["on"] == trigger and t["effect"] == effect_text for t in eff.triggers):
                eff.triggers.append({"on": trigger, "effect": effect_text, "self": includes_self})

        # --- Actions ---
        for m in re.finditer(
            r'action:\s*(?:spend\s+)?(.+?)(?:\s+to\s+|\s*[→:]\s*)(.+?)(?:\.|action:|$)',
            desc_lower
        ):
            cost = m.group(1).strip()
            effect_text = m.group(2).strip()
            if cost.startswith("add"):
                # "Action: Add 1 animal to this card" — no cost, effect is the add
                eff.actions.append({"cost": "free", "effect": f"{cost} to {effect_text}"})
            else:
                eff.actions.append({"cost": cost, "effect": effect_text})

        # --- Placement ---
        for tile in ["ocean", "city", "greenery"]:
            if f"place" in desc_immediate and tile in desc_immediate:
                if tile not in eff.placement:
                    eff.placement.append(tile)

        # --- Attacks (take-that) ---
        for m in re.finditer(
            r'decrease\s+any\s+([\w€]+)\s+production\s+(\d+)', desc_lower
        ):
            res = m.group(1)
            amount = m.group(2)
            eff.attacks.append(f"-{amount} {res}-prod")
        for m in re.finditer(r'remove\s+(\d+)\s+([\w]+)\s+from\s+any', desc_lower):
            eff.attacks.append(f"-{m.group(1)} {m.group(2)}")

        # --- Card draw ---
        for sentence in re.split(r'[.!]\s*', desc_immediate):
            opponent_draw = re.search(r'\bopponents?\s+draw\s+(\d+)\s+cards?\b', sentence)
            if opponent_draw:
                eff.opponents_draw_cards += int(opponent_draw.group(1))
                continue
            for m in re.finditer(r'draw\s+(\d+)\s+card', sentence):
                draws = int(m.group(1))
                discard_before = sentence[:m.start()]
                discard_match = re.search(r'discard\s+(\d+)\s+cards?', discard_before)
                if discard_match:
                    eff.discards_cards += int(discard_match.group(1))
                discard_after = sentence[m.end():]
                discard_after_match = re.search(r'[,;\s]*(?:then|and)?\s*discard\s+(\d+)\s+cards?', discard_after)
                if discard_after_match:
                    eff.discards_cards += int(discard_after_match.group(1))
                    eff.discard_after_draw = True
                eff.draws_cards += draws
        if "look at the top card" in desc_immediate and "take" in desc_immediate:
            eff.draws_cards += 1

        # --- Immediate gains ---
        for m in re.finditer(r'gain\s+(\d+)\s+([\w€]+)', desc_immediate):
            amount = int(m.group(1))
            res_raw = m.group(2).lower()
            res = self._PROD_ALIASES.get(res_raw, res_raw)
            eff.gains_resources[res] = eff.gains_resources.get(res, 0) + amount
