"""CardEffectParser — парсит описания карт в структурированные CardEffect."""

import re
from typing import Optional

from .models import CardEffect


class CardEffectParser:
    """Парсит текстовые описания карт в структурированные CardEffect объекты."""

    # Resource type aliases
    _RES_ALIASES = {
        "animal": "Animal", "animals": "Animal",
        "microbe": "Microbe", "microbes": "Microbe",
        "floater": "Floater", "floaters": "Floater",
        "science": "Science", "science resource": "Science",
        "fighter": "Fighter", "fighters": "Fighter",
        "asteroid": "Asteroid", "asteroids": "Asteroid",
        "camp": "Camp", "camps": "Camp",
        "data": "Data",
        "disease": "Disease",
        "preservation": "Preservation",
        "seed": "Seed",
        "clone trooper": "Clone Trooper",
    }

    _PROD_ALIASES = {
        "m€": "mc", "megacredit": "mc", "megacredits": "mc", "mc": "mc",
        "steel": "steel", "titanium": "titanium", "ti": "titanium",
        "plant": "plant", "plants": "plant",
        "energy": "energy", "heat": "heat",
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
        "Venusian Animals": [{"cost": "free", "effect": "add 1 animal to this card"}],
        "Extremophiles": [{"cost": "free", "effect": "add 1 microbe to this card"}],
        "GHG Producing Bacteria": [{"cost": "free", "effect": "add 1 microbe to this card"},
                                    {"cost": "2 microbes", "effect": "raise temperature 1 step"}],
        "Sulphur-Eating Bacteria": [{"cost": "free", "effect": "add 1 microbe to this card"},
                                     {"cost": "3 microbes", "effect": "gain 3 MC"}],
        "Nitrite Reducing Bacteria": [{"cost": "free", "effect": "add 1 microbe to this card"},
                                       {"cost": "3 microbes", "effect": "raise TR 1 step"}],
        "Regolith Eaters": [{"cost": "free", "effect": "add 1 microbe to this card"},
                             {"cost": "2 microbes", "effect": "raise oxygen 1 step"}],
        "Decomposers": [{"cost": "free", "effect": "add 1 microbe to this card"}],
        "Tardigrades": [{"cost": "free", "effect": "add 1 microbe to this card"}],
        "Thermophiles": [{"cost": "free", "effect": "add 1 microbe to this card"},
                          {"cost": "2 microbes", "effect": "raise venus 1 step"}],
        "Dirigibles": [{"cost": "free", "effect": "add 1 floater to this card"},
                        {"cost": "1 floater", "effect": "gain 3 MC"}],
        "Atmo Collectors": [{"cost": "free", "effect": "add 1 floater to this card"},
                             {"cost": "1 floater", "effect": "gain 2 energy/heat/plant"}],
        "Celestic": [{"cost": "free", "effect": "add 1 floater to this card (or draw card)"}],
        "Stormcraft Incorporated": [{"cost": "free", "effect": "add 1 floater to this card"}],
        "Titan Floating Launch-Pad": [{"cost": "free", "effect": "add 1 floater to this card"},
                                       {"cost": "1 floater", "effect": "play a Jovian -1 MC"}],
        "Titan Air-scrapping": [{"cost": "free", "effect": "add 1 floater to this card"},
                                 {"cost": "2 floaters", "effect": "raise venus 1 step"}],
        "Stratopolis": [{"cost": "free", "effect": "add 2 floaters to this card"}],
        "Floating Habs": [{"cost": "2 MC", "effect": "add 1 floater to this card"}],
        "Local Shading": [{"cost": "free", "effect": "add 1 floater to this card"},
                           {"cost": "1 floater", "effect": "+1 MC-prod"}],
        "Orbital Cleanup": [{"cost": "free", "effect": "gain MC = space tags x 2"}],
        "Electro Catapult": [{"cost": "1 plant/steel", "effect": "gain 7 MC"}],
        "Development Center": [{"cost": "1 energy", "effect": "draw 1 card"}],
        "Physics Complex": [{"cost": "6 energy", "effect": "add 1 science to this card"}],
        "Search For Life": [{"cost": "1 MC", "effect": "reveal top card, if microbe keep science"}],
        "Restricted Area": [{"cost": "2 MC", "effect": "draw 1 card"}],
        "Security Fleet": [{"cost": "1 MC", "effect": "add 1 fighter to this card"}],
        "Ceres Tech Market": [{"cost": "1 science", "effect": "draw cards"}],
        "Mars University": [],  # trigger, not action per se
    }

    # Implicit "add resource to self" for hasAction + resourceType cards
    _SELF_ADD_RESOURCES = {"Animal", "Microbe", "Floater", "Science", "Fighter", "Asteroid", "Data"}

    def _parse_all(self):
        """Парсит все карты из card_info."""
        for name, info in self.db.card_info.items():
            eff = CardEffect(name)
            desc = info.get("description", "")
            if isinstance(desc, dict):
                desc = desc.get("text", str(desc))
            if not isinstance(desc, str):
                desc = ""
            res_type = info.get("resourceType", "")
            if isinstance(res_type, str) and res_type:
                eff.resource_type = res_type
                eff.resource_holds = True

            if desc:
                self._parse_description(eff, desc, info)

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

            # Auto-generate implicit action for hasAction + resourceType cards
            elif info.get("hasAction") and res_type in self._SELF_ADD_RESOURCES:
                if not eff.actions:  # don't override if already parsed
                    eff.actions.append({"cost": "free", "effect": f"add 1 {res_type.lower()} to this card"})
                if not any(a["target"] == "this" and a["type"] == res_type for a in eff.adds_resources):
                    eff.adds_resources.append({"type": res_type, "amount": 1,
                                                "target": "this", "per_tag": None})

            self.effects[name] = eff
            norm = self.db._normalize(name)
            self.effects[norm] = eff

    def get(self, name: str) -> Optional[CardEffect]:
        if name in self.effects:
            return self.effects[name]
        norm = self.db._normalize(name)
        return self.effects.get(norm)

    def _parse_description(self, eff: CardEffect, desc: str, info: dict):
        """Парсит описание карты и заполняет CardEffect."""
        desc_lower = desc.lower()

        # --- Resource placement: "Add N resource to ..." ---
        for m in re.finditer(
            r'add\s+(\d+)\s+([\w\s]+?)(?:\s+resources?)?\s+to\s+(this card|it|any\s*\w*\s*card|another\s*\w*\s*card)',
            desc_lower
        ):
            amount = int(m.group(1))
            res_raw = m.group(2).strip()
            tgt = m.group(3)
            target = "this" if ("this" in tgt or tgt == "it") else ("any" if "any" in tgt else "another")
            res_type = self._RES_ALIASES.get(res_raw, res_raw.title())
            entry = {"type": res_type, "amount": amount, "target": target, "per_tag": None}

            # Check for per-tag scaling: "add 1 microbe to it for each science tag"
            after = desc_lower[m.end():]
            per_m = re.match(r'\s*(?:for each|per)\s+(\w+)\s+tag', after)
            if per_m:
                entry["per_tag"] = per_m.group(1).title()
            eff.adds_resources.append(entry)

        # Also catch "add resource to" without number (= add 1)
        for m in re.finditer(
            r'add\s+(?:a\s+|an?\s+)?([\w]+)\s+(?:resource\s+)?to\s+(this card|any\s*\w*\s*card|another\s*\w*\s*card)',
            desc_lower
        ):
            res_raw = m.group(1).strip()
            if res_raw.isdigit():
                continue  # already caught above
            target = "this" if "this" in m.group(2) else ("any" if "any" in m.group(2) else "another")
            res_type = self._RES_ALIASES.get(res_raw, res_raw.title())
            # Avoid duplicates
            if not any(a["type"] == res_type and a["target"] == target for a in eff.adds_resources):
                eff.adds_resources.append({"type": res_type, "amount": 1, "target": target, "per_tag": None})

        # --- Resource removal: "remove N resource ... to ..." ---
        for m in re.finditer(
            r'remove\s+(\d+)\s+([\w]+)s?\s+(?:from\s+\w+\s+)?(?:to|and)\s+(.+?)(?:\.|$)',
            desc_lower
        ):
            amount = int(m.group(1))
            res_raw = m.group(2).strip()
            gives = m.group(3).strip()[:60]
            res_type = self._RES_ALIASES.get(res_raw, res_raw.title())
            eff.removes_resources.append({"type": res_type, "amount": amount, "gives": gives})

        # --- Production changes ---
        for m in re.finditer(
            r'(increase|decrease)\s+(?:your\s+)?([\w€]+)\s+production\s+(\d+)\s+step',
            desc_lower
        ):
            direction = 1 if m.group(1) == "increase" else -1
            res = self._PROD_ALIASES.get(m.group(2), m.group(2))
            amount = int(m.group(3)) * direction
            eff.production_change[res] = eff.production_change.get(res, 0) + amount

        # --- Tag-scaling production: "1 step for each X tag" ---
        for m in re.finditer(
            r'(increase|decrease)\s+(?:your\s+)?([\w€]+)\s+production\s+(\d+)\s+step.*?for\s+each\s+(\w+)\s+tag',
            desc_lower
        ):
            res = self._PROD_ALIASES.get(m.group(2), m.group(2))
            tag = m.group(4).title()
            amount = int(m.group(3))
            direction = 1 if m.group(1) == "increase" else -1
            eff.tag_scaling.append({"tag": tag, "per": 1, "gives": f"{amount * direction} {res}-prod"})

        # --- Tag-scaling TR: "raise TR 1 step for each X tag" ---
        for m in re.finditer(
            r'raise\s+(?:your\s+)?tr\s+(\d+)\s+step.*?for\s+each\s+(\w+)\s+tag',
            desc_lower
        ):
            amount = int(m.group(1))
            tag = m.group(2).title()
            eff.tag_scaling.append({"tag": tag, "per": 1, "gives": f"{amount} TR"})

        # --- Tag-scaling resource add: "add 1 X for each Y tag" / "per Y tag" ---
        for m in re.finditer(
            r'add\s+(\d+)\s+([\w]+).*?(?:for each|per)\s+(\w+)\s+tag',
            desc_lower
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
        for m in re.finditer(r'raise\s+(?:your\s+)?tr\s+(\d+)', desc_lower):
            eff.tr_gain += int(m.group(1))
        # Temperature, oxygen, ocean → TR
        if "raise temperature" in desc_lower or "raise the temperature" in desc_lower:
            eff.tr_gain += desc_lower.count("raise temperature") + desc_lower.count("raise the temperature")
        if "place" in desc_lower and "ocean" in desc_lower:
            ocean_count = len(re.findall(r'place\s+(\d+)?\s*ocean', desc_lower))
            if ocean_count:
                for m in re.finditer(r'place\s+(\d+)\s+ocean', desc_lower):
                    eff.tr_gain += int(m.group(1))
                if not re.search(r'place\s+\d+\s+ocean', desc_lower):
                    eff.tr_gain += ocean_count  # "place ocean" = 1
        if "raise oxygen" in desc_lower or "raise the oxygen" in desc_lower:
            eff.tr_gain += 1
        if "raise venus" in desc_lower or "raise the venus" in desc_lower:
            eff.tr_gain += 1

        # --- VP ---
        vp = info.get("victoryPoints", "")
        if vp:
            vp_str = str(vp)
            if "/" in vp_str:
                parts = vp_str.split("/")
                try:
                    vp_amount = int(parts[0].strip())
                    per = parts[1].strip()
                    eff.vp_per = {"amount": vp_amount, "per": per}
                except ValueError:
                    pass
            else:
                try:
                    eff.vp_per = {"amount": int(vp_str), "per": "flat"}
                except ValueError:
                    if vp_str == "special":
                        eff.vp_per = {"amount": 0, "per": "special"}

        # Check description for VP patterns too
        for m in re.finditer(r'(\d+)\s+vp\s+(?:per|for each)\s+(.+?)(?:\.|$)', desc_lower):
            if not eff.vp_per:
                eff.vp_per = {"amount": int(m.group(1)), "per": m.group(2).strip()}

        # --- Discounts ---
        for m in re.finditer(r'(?:you\s+)?pay\s+(\d+)\s+m[€c]\s+less\s+(?:for\s+)?(?:it|them)?', desc_lower):
            amount = int(m.group(1))
            # Find what tag discount applies to
            tag_m = re.search(r'when\s+you\s+play\s+(?:an?\s+)?(\w+)\s+(?:tag|card)', desc_lower)
            if tag_m:
                tag = tag_m.group(1).title()
                eff.discount[tag] = amount
            else:
                eff.discount["all"] = amount

        # --- Triggered effects ---
        for m in re.finditer(
            r'effect:\s*when\s+(?:you\s+)?(.+?),\s*(.+?)(?:\.|effect:|action:|$)',
            desc_lower
        ):
            trigger = m.group(1).strip()
            effect_text = m.group(2).strip()
            eff.triggers.append({"on": trigger, "effect": effect_text})

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
            if f"place" in desc_lower and tile in desc_lower:
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
        for m in re.finditer(r'draw\s+(\d+)\s+card', desc_lower):
            eff.draws_cards += int(m.group(1))
        if "look at the top card" in desc_lower and "take" in desc_lower:
            eff.draws_cards += 1

        # --- Immediate gains ---
        for m in re.finditer(r'gain\s+(\d+)\s+([\w€]+)', desc_lower):
            amount = int(m.group(1))
            res_raw = m.group(2).lower()
            res = self._PROD_ALIASES.get(res_raw, res_raw)
            eff.gains_resources[res] = eff.gains_resources.get(res, 0) + amount
