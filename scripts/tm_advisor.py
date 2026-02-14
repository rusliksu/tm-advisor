#!/usr/bin/env python3
"""
TM Advisor v2 — Советник для Terraforming Mars (herokuapp).
Подключается к игре через player ID, поллит API и даёт рекомендации.
НЕ автоигрок — только советы (GET only).

Использование:
    python scripts/tm_advisor.py <player_id>              # ANSI-терминал
    python scripts/tm_advisor.py <player_id> --claude      # Markdown для Claude Code
    python scripts/tm_advisor.py <player_id> --snapshot     # Один snapshot и выход
"""

import sys
import os
import json
import time
import signal
import re
import argparse
from datetime import datetime
from itertools import combinations
from typing import Optional

import requests
from colorama import init, Fore, Style
from tm_game_analyzer import resolve_game, load_db, save_db

init()

BASE_URL = "https://terraforming-mars.herokuapp.com"
POLL_INTERVAL = 2.0
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")


# ═══════════════════════════════════════════════
# CardDatabase
# ═══════════════════════════════════════════════

class CardDatabase:
    def __init__(self, evaluations_path: str):
        with open(evaluations_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        self.cards: dict[str, dict] = {}
        self._norm_index: dict[str, str] = {}
        for name, data in raw.items():
            self.cards[name] = data
            self._norm_index[self._normalize(name)] = name

        # Load card descriptions from all_cards.json
        self.card_info: dict[str, dict] = {}  # name -> {description, tags, cost, type, ...}
        self._norm_info: dict[str, str] = {}
        all_cards_path = os.path.join(DATA_DIR, "all_cards.json")
        if os.path.exists(all_cards_path):
            with open(all_cards_path, "r", encoding="utf-8") as f:
                all_cards = json.load(f)
            for c in all_cards:
                name = c.get("name", "")
                self.card_info[name] = c
                self._norm_info[self._normalize(name)] = name

        # Load CEO cards
        self.ceo_cards: dict[str, dict] = {}
        ceo_path = os.path.join(DATA_DIR, "ceo_cards.json")
        if os.path.exists(ceo_path):
            with open(ceo_path, "r", encoding="utf-8") as f:
                for c in json.load(f):
                    name = c.get("name", "")
                    self.ceo_cards[name] = c
                    if name not in self.card_info:
                        self.card_info[name] = c
                        self._norm_info[self._normalize(name)] = name

        # Load Pathfinder cards
        self.pathfinder_cards: dict[str, dict] = {}
        pf_path = os.path.join(DATA_DIR, "pathfinder_cards.json")
        if os.path.exists(pf_path):
            with open(pf_path, "r", encoding="utf-8") as f:
                for c in json.load(f):
                    name = c.get("name", "")
                    self.pathfinder_cards[name] = c
                    if name not in self.card_info:
                        self.card_info[name] = c
                        self._norm_info[self._normalize(name)] = name

        # Load planetary tracks (Pathfinders)
        self.planetary_tracks: dict = {}
        tracks_path = os.path.join(DATA_DIR, "planetary_tracks.json")
        if os.path.exists(tracks_path):
            with open(tracks_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.planetary_tracks = data.get("tracks", {})

    @staticmethod
    def _normalize(name: str) -> str:
        return re.sub(r"[^a-z0-9]", "", name.lower())

    def get(self, name: str) -> Optional[dict]:
        if name in self.cards:
            return self.cards[name]
        norm = self._normalize(name)
        canonical = self._norm_index.get(norm)
        return self.cards[canonical] if canonical else None

    def get_info(self, name: str) -> Optional[dict]:
        """Get full card info (description, tags, cost, type) from all_cards."""
        if name in self.card_info:
            return self.card_info[name]
        norm = self._normalize(name)
        canonical = self._norm_info.get(norm)
        return self.card_info[canonical] if canonical else None

    def get_desc(self, name: str) -> str:
        """Get card description text."""
        info = self.get_info(name)
        return info.get("description", "") if info else ""

    def get_score(self, name: str) -> int:
        card = self.get(name)
        return card["score"] if card else 50

    def get_tier(self, name: str) -> str:
        card = self.get(name)
        return card["tier"] if card else "?"

    def is_ceo(self, name: str) -> bool:
        norm = self._normalize(name)
        for ceo_name in self.ceo_cards:
            if self._normalize(ceo_name) == norm:
                return True
        return False

    def get_ceo(self, name: str) -> Optional[dict]:
        if name in self.ceo_cards:
            return self.ceo_cards[name]
        norm = self._normalize(name)
        for ceo_name, data in self.ceo_cards.items():
            if self._normalize(ceo_name) == norm:
                return data
        return None

    def is_pathfinder(self, name: str) -> bool:
        norm = self._normalize(name)
        for pf_name in self.pathfinder_cards:
            if self._normalize(pf_name) == norm:
                return True
        return False


# ═══════════════════════════════════════════════
# CardEffectParser — парсинг описаний карт в структуры
# ═══════════════════════════════════════════════

class CardEffect:
    """Структурированное представление эффекта карты."""
    __slots__ = (
        "name", "resource_type", "resource_holds",
        "adds_resources", "removes_resources",
        "production_change", "tr_gain", "vp_per",
        "discount", "triggers", "actions",
        "tag_scaling", "placement", "attacks",
        "draws_cards", "gains_resources",
    )

    def __init__(self, name: str):
        self.name = name
        self.resource_type: str = ""          # что держит: Microbe/Animal/Floater/Science/...
        self.resource_holds: bool = False      # может держать ресурсы
        self.adds_resources: list[dict] = []   # [{type, amount, target: "this"/"any"/"another", per_tag: str|None}]
        self.removes_resources: list[dict] = []  # [{type, amount, target, gives: str}]
        self.production_change: dict = {}      # {mc: +2, plant: -1, ...}
        self.tr_gain: float = 0                # сколько TR даёт
        self.vp_per: dict = {}                 # {per: "resource"|"2 resources"|"Jovian tag", amount: 1}
        self.discount: dict = {}               # {tag: amount} or {"all": amount}
        self.triggers: list[dict] = []         # [{on: "play Earth tag", effect: "gain 1 MC"}]
        self.actions: list[dict] = []          # [{cost: "1 energy", effect: "gain 7 MC"}]
        self.tag_scaling: list[dict] = []      # [{tag: "Earth", per: 1, gives: "1 MC-prod"}]
        self.placement: list[str] = []         # ["ocean", "city", "greenery"]
        self.attacks: list[str] = []           # ["-2 plant-prod", "-3 MC-prod"]
        self.draws_cards: int = 0              # сколько карт draw
        self.gains_resources: dict = {}        # {mc: 5, plant: 3, ...} immediate


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

    def __init__(self, db: 'CardDatabase'):
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
        # Split into sentences for processing
        # Handle "Action:" and "Effect:" prefixes
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


# ═══════════════════════════════════════════════
# ComboDetector — обнаружение синергий в tableau
# ═══════════════════════════════════════════════

class ComboDetector:
    """Анализирует tableau и руку игрока для поиска комбо и синергий."""

    def __init__(self, parser: CardEffectParser, db: 'CardDatabase'):
        self.parser = parser
        self.db = db

        # Предварительно построим индексы
        self._resource_targets: dict[str, list[str]] = {}  # res_type -> [card names that hold it]
        self._resource_adders: dict[str, list[str]] = {}   # res_type -> [card names that add it]
        self._trigger_cards: dict[str, list[str]] = {}     # trigger_key -> [card names]
        self._discount_cards: list[str] = []
        self._tag_scalers: dict[str, list[str]] = {}       # tag -> [card names with tag_scaling]

        for name, eff in parser.effects.items():
            if eff.name != name:
                continue  # skip normalized duplicates

            # Resource targets (cards that hold resources)
            if eff.resource_holds and eff.resource_type:
                rt = eff.resource_type
                self._resource_targets.setdefault(rt, []).append(name)

            # Resource adders (normalize multi-type like "Microbe Or 1 Animal" → both)
            for add in eff.adds_resources:
                if add["target"] in ("any", "another"):
                    raw_type = add["type"]
                    # Check for "X or Y" multi-resource adders
                    if " or " in raw_type.lower():
                        for part in re.split(r'\s+or\s+', raw_type.lower()):
                            clean = re.sub(r'^\d+\s*', '', part).strip()
                            res = CardEffectParser._RES_ALIASES.get(clean, clean.title())
                            self._resource_adders.setdefault(res, []).append(name)
                    else:
                        self._resource_adders.setdefault(raw_type, []).append(name)

            # Trigger cards
            for trig in eff.triggers:
                key = trig["on"][:40]
                self._trigger_cards.setdefault(key, []).append(name)

            # Discount cards
            if eff.discount:
                self._discount_cards.append(name)

            # Tag scalers
            for ts in eff.tag_scaling:
                self._tag_scalers.setdefault(ts["tag"], []).append(name)

    def find_resource_targets(self, resource_type: str) -> list[str]:
        """Найти все карты, которые могут держать данный тип ресурса."""
        return self._resource_targets.get(resource_type, [])

    def find_resource_adders(self, resource_type: str) -> list[str]:
        """Найти все карты, которые кладут ресурс на другие карты."""
        return self._resource_adders.get(resource_type, [])

    def analyze_tableau_combos(self, tableau_names: list[str], hand_names: list[str],
                                tags: dict[str, int]) -> list[dict]:
        """
        Анализирует комбо между сыгранными картами и рукой.
        Returns list of {type, cards, description, value_bonus}
        """
        combos = []
        tableau_set = set(tableau_names)
        hand_set = set(hand_names)
        all_cards = tableau_set | hand_set

        # 1. Resource placement combos: adder in tableau + target in tableau/hand
        tableau_targets = {}  # res_type -> [card names on tableau that hold it]
        tableau_adders = {}   # res_type -> [card names on tableau that add to other cards]

        for name in tableau_names:
            eff = self.parser.get(name)
            if not eff:
                continue
            if eff.resource_holds and eff.resource_type:
                tableau_targets.setdefault(eff.resource_type, []).append(name)
            for add in eff.adds_resources:
                if add["target"] in ("any", "another"):
                    raw_type = add["type"]
                    if " or " in raw_type.lower():
                        for part in re.split(r'\s+or\s+', raw_type.lower()):
                            clean = re.sub(r'^\d+\s*', '', part).strip()
                            res = CardEffectParser._RES_ALIASES.get(clean, clean.title())
                            tableau_adders.setdefault(res, []).append(name)
                    else:
                        tableau_adders.setdefault(raw_type, []).append(name)

        # Hand cards that are targets — combo with existing adders
        for name in hand_names:
            eff = self.parser.get(name)
            if not eff:
                continue
            if eff.resource_holds and eff.resource_type:
                adders = tableau_adders.get(eff.resource_type, [])
                if adders:
                    vp_info = ""
                    if eff.vp_per and eff.vp_per.get("per") in ("resource", "1 resource"):
                        vp_info = " (1 VP/ресурс!)"
                    elif eff.vp_per and "resource" in str(eff.vp_per.get("per", "")):
                        vp_info = f" ({eff.vp_per['amount']} VP/{eff.vp_per['per']})"
                    combos.append({
                        "type": "resource_target",
                        "cards": [name] + adders[:2],
                        "description": f"{name} принимает {eff.resource_type} ← {', '.join(adders[:2])}{vp_info}",
                        "value_bonus": 8 if "1 VP" in vp_info else 5,
                    })

            # Hand cards that add resources — combo with existing targets
            for add in eff.adds_resources:
                if add["target"] in ("any", "another"):
                    raw_type = add["type"]
                    # Normalize multi-type
                    if " or " in raw_type.lower():
                        for part in re.split(r'\s+or\s+', raw_type.lower()):
                            clean = re.sub(r'^\d+\s*', '', part).strip()
                            res = CardEffectParser._RES_ALIASES.get(clean, clean.title())
                            targets = tableau_targets.get(res, [])
                            if targets:
                                combos.append({
                                    "type": "resource_adder",
                                    "cards": [name] + targets[:2],
                                    "description": f"{name} кладёт {res} → {', '.join(targets[:2])}",
                                    "value_bonus": 5,
                                })
                    else:
                        targets = tableau_targets.get(raw_type, [])
                        if targets:
                            combos.append({
                                "type": "resource_adder",
                                "cards": [name] + targets[:2],
                                "description": f"{name} кладёт {raw_type} → {', '.join(targets[:2])}",
                                "value_bonus": 5,
                            })

        # 2. Tag scaling combos: card in hand scales by tag count
        for name in hand_names:
            eff = self.parser.get(name)
            if not eff:
                continue
            for ts in eff.tag_scaling:
                tag = ts["tag"]
                count = tags.get(tag, 0)
                if count >= 3:
                    combos.append({
                        "type": "tag_scaling",
                        "cards": [name],
                        "description": f"{name}: {ts['gives']} × {count} {tag} тегов",
                        "value_bonus": min(count * 2, 12),
                    })

            # Per-tag resource placement
            for add in eff.adds_resources:
                if add.get("per_tag"):
                    tag = add["per_tag"]
                    count = tags.get(tag, 0)
                    if count >= 2:
                        total = add["amount"] * count
                        targets = tableau_targets.get(add["type"], [])
                        target_str = f" → {targets[0]}" if targets else ""
                        combos.append({
                            "type": "scaling_placement",
                            "cards": [name] + (targets[:1] if targets else []),
                            "description": f"{name}: {total} {add['type']} ({add['amount']}×{count} {tag}){target_str}",
                            "value_bonus": min(total * 2, 10),
                        })

        # 3. Trigger combos: triggered effect in tableau + matching card in hand
        for name in tableau_names:
            eff = self.parser.get(name)
            if not eff:
                continue
            for trig in eff.triggers:
                trigger_text = trig["on"].lower()
                for hname in hand_names:
                    heff = self.parser.get(hname)
                    hinfo = self.db.get_info(hname)
                    if not hinfo:
                        continue
                    htags = [t.lower() for t in hinfo.get("tags", [])]

                    # "play X tag" triggers
                    for tag in htags:
                        if f"play" in trigger_text and tag in trigger_text:
                            combos.append({
                                "type": "trigger",
                                "cards": [hname, name],
                                "description": f"{hname} ({tag}) → триггерит {name}: {trig['effect'][:50]}",
                                "value_bonus": 3,
                            })
                            break

        # 4. Discount combos: discount in tableau + matching cards in hand
        for name in tableau_names:
            eff = self.parser.get(name)
            if not eff:
                continue
            if eff.discount:
                for hname in hand_names:
                    hinfo = self.db.get_info(hname)
                    if not hinfo:
                        continue
                    htags = hinfo.get("tags", [])
                    for tag, amount in eff.discount.items():
                        if tag == "all" or tag.lower() in [t.lower() for t in htags]:
                            combos.append({
                                "type": "discount",
                                "cards": [hname, name],
                                "description": f"{hname} дешевле на {amount} MC ({name})",
                                "value_bonus": min(amount, 4),
                            })
                            break

        # 5. Intra-tableau combos (existing synergies already in play)
        for name in tableau_names:
            eff = self.parser.get(name)
            if not eff:
                continue
            # Existing resource engines
            if eff.resource_holds and eff.resource_type:
                adders = tableau_adders.get(eff.resource_type, [])
                if adders and name not in adders:
                    vp_info = ""
                    if eff.vp_per and "resource" in str(eff.vp_per.get("per", "")):
                        vp_info = f" → VP"
                    if vp_info:  # only report active VP engines
                        combos.append({
                            "type": "active_engine",
                            "cards": [name] + [a for a in adders if a != name][:2],
                            "description": f"ENGINE: {', '.join(adders[:2])} → {name}{vp_info}",
                            "value_bonus": 0,  # already in play, just informational
                        })

        # Deduplicate by main card
        seen = set()
        unique = []
        for c in combos:
            key = (c["type"], c["cards"][0])
            if key not in seen:
                seen.add(key)
                unique.append(c)

        # Sort by value bonus
        unique.sort(key=lambda x: x["value_bonus"], reverse=True)
        return unique

    def get_hand_synergy_bonus(self, card_name: str, tableau_names: list[str],
                                tags: dict[str, int]) -> int:
        """Рассчитать бонус синергии конкретной карты с текущим tableau."""
        bonus = 0
        eff = self.parser.get(card_name)
        if not eff:
            return 0

        # Resource target bonus: card holds resources and we have adders
        if eff.resource_holds and eff.resource_type:
            for tname in tableau_names:
                teff = self.parser.get(tname)
                if not teff:
                    continue
                for add in teff.adds_resources:
                    if add["target"] not in ("any", "another"):
                        continue
                    # Normalize multi-type adders
                    add_types = set()
                    raw = add["type"]
                    if " or " in raw.lower():
                        for part in re.split(r'\s+or\s+', raw.lower()):
                            clean = re.sub(r'^\d+\s*', '', part).strip()
                            add_types.add(CardEffectParser._RES_ALIASES.get(clean, clean.title()))
                    else:
                        add_types.add(raw)
                    if eff.resource_type in add_types:
                        bonus += 5
                        if eff.vp_per and "resource" in str(eff.vp_per.get("per", "")):
                            bonus += 3
                        break

        # Resource adder bonus: card adds resources and we have targets
        for add in eff.adds_resources:
            if add["target"] in ("any", "another"):
                add_types = set()
                raw = add["type"]
                if " or " in raw.lower():
                    for part in re.split(r'\s+or\s+', raw.lower()):
                        clean = re.sub(r'^\d+\s*', '', part).strip()
                        add_types.add(CardEffectParser._RES_ALIASES.get(clean, clean.title()))
                else:
                    add_types.add(raw)
                for tname in tableau_names:
                    teff = self.parser.get(tname)
                    if not teff:
                        continue
                    if teff.resource_holds and teff.resource_type in add_types:
                        bonus += 4
                        if teff.vp_per and "resource" in str(teff.vp_per.get("per", "")):
                            bonus += 3
                        break

        # Tag scaling bonus
        for ts in eff.tag_scaling:
            count = tags.get(ts["tag"], 0)
            if count >= 3:
                bonus += min(count, 6)

        # Per-tag resource placement bonus
        for add in eff.adds_resources:
            if add.get("per_tag"):
                count = tags.get(add["per_tag"], 0)
                if count >= 3:
                    bonus += min(count, 6)

        # Trigger bonus: this card triggers something in tableau
        card_info = self.db.get_info(card_name)
        card_tags = [t.lower() for t in card_info.get("tags", [])] if card_info else []
        for tname in tableau_names:
            teff = self.parser.get(tname)
            if not teff:
                continue
            for trig in teff.triggers:
                trigger_text = trig["on"].lower()
                for tag in card_tags:
                    if "play" in trigger_text and tag in trigger_text:
                        bonus += 3
                        break

        return min(bonus, 15)  # cap


# ═══════════════════════════════════════════════
# RequirementsChecker — проверка requirements карт
# ═══════════════════════════════════════════════

class RequirementsChecker:
    """Загружает requirements из all_cards.json и проверяет против game state."""

    def __init__(self, all_cards_path: str):
        self.reqs: dict[str, str] = {}  # name -> raw requirement string
        self._norm_reqs: dict[str, str] = {}
        if os.path.exists(all_cards_path):
            with open(all_cards_path, "r", encoding="utf-8") as f:
                cards = json.load(f)
            for c in cards:
                name = c.get("name", "")
                req = c.get("requirements", "")
                if req:
                    self.reqs[name] = str(req)
                    self._norm_reqs[re.sub(r"[^a-z0-9]", "", name.lower())] = str(req)

    def get_req(self, name: str) -> str:
        if name in self.reqs:
            return self.reqs[name]
        norm = re.sub(r"[^a-z0-9]", "", name.lower())
        return self._norm_reqs.get(norm, "")

    def check(self, name: str, state) -> tuple[bool, str]:
        """Проверить requirement карты. Returns (playable, reason)."""
        req = self.get_req(name)
        if not req:
            return True, ""

        r = req.strip()

        # Dict-type requirements (stored as string repr of dict)
        if r.startswith("{"):
            return self._check_dict_req(r)

        # Compound requirements: conditions separated by " / "
        if " / " in r:
            return self._check_compound(r, state)

        return self._check_single(r, state)

    def _check_compound(self, req: str, state) -> tuple[bool, str]:
        """Check compound requirements like '1 Plant tag / 1 Animal tag'."""
        parts = req.split(" / ")
        for part in parts:
            ok, reason = self._check_single(part.strip(), state)
            if not ok:
                return False, reason
        return True, ""

    @staticmethod
    def _check_dict_req(req: str) -> tuple[bool, str]:
        """Handle dict-type requirements like {'floaters': 3}."""
        if "floaters" in req:
            m = re.search(r"'floaters':\s*(\d+)", req)
            if m:
                return True, f"Req: {m.group(1)} floaters на карте"
        if "plantsRemoved" in req:
            return True, "Req: растения удалены в этом gen"
        if "resourceTypes" in req:
            m = re.search(r"'resourceTypes':\s*(\d+)", req)
            if m:
                return True, f"Req: {m.group(1)} типов ресурсов"
        return True, f"Req: {req}"

    def _check_single(self, r: str, state) -> tuple[bool, str]:
        """Check a single requirement condition."""
        I = re.IGNORECASE

        # --- Temperature max (check before min to avoid false match) ---
        m = re.match(r"max (-?\d+)\s*°C", r, I)
        if m:
            limit = int(m.group(1))
            if state.temperature > limit:
                return False, f"Макс {limit}°C (сейчас {state.temperature}°C)"
            return True, ""

        # --- Temperature min ---
        m = re.match(r"(-?\d+)\s*°C", r)
        if m:
            need = int(m.group(1))
            if state.temperature < need:
                return False, f"Нужно {need}°C (сейчас {state.temperature}°C)"
            return True, ""

        # --- Oxygen max ---
        m = re.match(r"max (\d+)% oxygen", r, I)
        if m:
            limit = int(m.group(1))
            if state.oxygen > limit:
                return False, f"Макс {limit}% O₂ (сейчас {state.oxygen}%)"
            return True, ""

        # --- Oxygen min ---
        m = re.match(r"(\d+)% oxygen", r, I)
        if m:
            need = int(m.group(1))
            if state.oxygen < need:
                return False, f"Нужно {need}% O₂ (сейчас {state.oxygen}%)"
            return True, ""

        # --- Venus max ---
        m = re.match(r"max (\d+)% venus", r, I)
        if m:
            limit = int(m.group(1))
            if state.venus > limit:
                return False, f"Макс {limit}% Venus (сейчас {state.venus}%)"
            return True, ""

        # --- Venus min (%) ---
        m = re.match(r"(\d+)% venus", r, I)
        if m:
            need = int(m.group(1))
            if state.venus < need:
                return False, f"Нужно {need}% Venus (сейчас {state.venus}%)"
            return True, ""

        # --- Oceans max ---
        m = re.match(r"max (\d+) oceans?", r, I)
        if m:
            limit = int(m.group(1))
            if state.oceans > limit:
                return False, f"Макс {limit} ocean (сейчас {state.oceans})"
            return True, ""

        # --- Oceans min ---
        m = re.match(r"(\d+) oceans?", r, I)
        if m:
            need = int(m.group(1))
            if state.oceans < need:
                return False, f"Нужно {need} ocean (сейчас {state.oceans})"
            return True, ""

        # --- TR ---
        m = re.match(r"tr\s+(\d+)", r, I)
        if m:
            need = int(m.group(1))
            if state.tr < need:
                return False, f"Нужно TR {need} (сейчас {state.tr})"
            return True, ""

        # --- Tag requirement: "N TagName tag(s)" ---
        m = re.match(r"(\d+)\s+([\w]+)\s+tags?", r, I)
        if m:
            need = int(m.group(1))
            tag_name = m.group(2).lower()
            tags = state.tags if hasattr(state, 'tags') else {}
            have = tags.get(tag_name, 0)
            if have < need:
                return False, f"Нужно {need} {tag_name} tag (есть {have})"
            return True, ""

        # --- Cities ---
        m = re.match(r"(\d+) cit(?:y|ies)", r, I)
        if m:
            need = int(m.group(1))
            have = state.me.cities if hasattr(state, 'me') else 0
            if have < need:
                return False, f"Нужно {need} city (есть {have})"
            return True, ""

        # --- Colonies ---
        m = re.match(r"(\d+) colonies", r, I)
        if m:
            need = int(m.group(1))
            have = state.me.colonies if hasattr(state, 'me') else 0
            if have < need:
                return False, f"Нужно {need} colony (есть {have})"
            return True, ""

        # --- Greeneries ---
        m = re.match(r"(\d+) greeneries", r, I)
        if m:
            need = int(m.group(1))
            have = self._count_greeneries(state)
            if have < need:
                return False, f"Нужно {need} greenery (есть {have})"
            return True, ""

        # --- Production (оппонент должен иметь) ---
        if r.lower() == "production":
            return True, "Req: production оппонента"

        # --- Turmoil: Party ruling ---
        m = re.match(r"(\w+) ruling", r, I)
        if m:
            has_turmoil = getattr(state, 'has_turmoil', True)
            if not has_turmoil:
                return False, f"Нет Turmoil в игре ({m.group(1).title()} ruling)"
            return True, f"Turmoil: {m.group(1).title()} ruling"

        # --- Chairman ---
        if "chairman" in r.lower():
            has_turmoil = getattr(state, 'has_turmoil', True)
            if not has_turmoil:
                return False, "Нет Turmoil в игре (Chairman)"
            return True, "Turmoil: Chairman"

        # --- Party leader ---
        if "party leader" in r.lower():
            has_turmoil = getattr(state, 'has_turmoil', True)
            if not has_turmoil:
                return False, f"Нет Turmoil в игре ({r})"
            return True, f"Turmoil: {r}"

        # --- Fallback ---
        return True, f"Req: {r}"

    @staticmethod
    def _count_greeneries(state) -> int:
        """Count player's greeneries from map spaces."""
        if not hasattr(state, 'spaces'):
            return 0
        my_color = state.me.color if hasattr(state, 'me') else ""
        count = 0
        for s in state.spaces:
            if s.get("tileType") == 0 and s.get("color") == my_color:
                count += 1
        return count


# ═══════════════════════════════════════════════
# Economy Model — ценность ресурсов по фазам игры
# ═══════════════════════════════════════════════

def resource_values(gens_left: int) -> dict:
    """MC-ценность ресурсов и production в зависимости от оставшихся поколений."""
    gl = max(0, gens_left)
    return {
        # Production: value = remaining gens where it pays off
        "mc_prod":     max(0, gl * 1.0),           # 1 MC-prod = gens_left MC
        "steel_prod":  max(0, gl * 1.6),           # steel-prod ≈ 1.6× MC-prod
        "ti_prod":     max(0, gl * 2.5),           # ti-prod ≈ 2.5× MC-prod
        "plant_prod":  max(0, gl * 1.3),           # plant-prod: greenery every ~6 gens
        "energy_prod": max(0, gl * 1.2),           # energy-prod: powers actions
        "heat_prod":   max(0, gl * 0.8),           # heat-prod: weakest
        # Instant resources
        "tr":          7.0 + min(gl, 3) * 0.2,     # TR = 7-7.8 MC
        "vp":          max(1.0, 8.0 - gl * 0.8),   # VP: 1 MC early → 8 MC last gen
        "card":        3.5,                          # card draw ≈ 3.5 MC always
        "steel":       2.0,                          # steel = 2 MC
        "titanium":    3.0,                          # ti = 3 MC (base)
        "plant":       1.0 if gl > 2 else 0.5,     # plants cheap, greenery = 8 plants
        "heat":        1.0 if gl > 1 else 0.3,     # heat = temp = TR
        "ocean":       7.0 + 2.0,                   # ocean = 1 TR + ~2 MC adj bonus
        "greenery":    7.0 + max(1.0, 8.0 - gl * 0.8),  # greenery = 1 TR + 1 VP
    }


def game_phase(gens_left: int, generation: int) -> str:
    """Определить фазу игры для стратегических решений."""
    if generation <= 2:
        return "early"      # Engine building, production максимально ценна
    elif gens_left <= 2:
        return "endgame"    # VP и TR, production бесполезна
    elif gens_left <= 4:
        return "late"       # Переход к VP, баланс production/TR
    else:
        return "mid"        # Баланс, начинай terraforming


def strategy_advice(state) -> list[str]:
    """Высокоуровневые стратегические советы на основе фазы игры."""
    gens_left = _estimate_remaining_gens(state)
    phase = game_phase(gens_left, state.generation)
    me = state.me
    tips = []

    if phase == "early":
        tips.append("🔧 ФАЗА: Engine. Приоритет: production, дискаунты, теги.")
        tips.append(f"   1 MC-prod сейчас = ~{gens_left} MC за игру.")
        if me.mc_prod < 5:
            tips.append("   ⚠️ MC-prod < 5 — ищи production карты!")
    elif phase == "mid":
        tips.append("⚖️ ФАЗА: Баланс. Production ещё ок, начинай TR.")
        tips.append(f"   1 MC-prod = ~{gens_left} MC. 1 VP = ~{8 - gens_left * 0.8:.0f} MC.")
        if sum(1 for m in state.milestones if m.get("claimed_by")) < 3:
            tips.append("   Milestones ещё открыты — гони к ним!")
    elif phase == "late":
        tips.append("🎯 ФАЗА: Поздняя. VP > production. Terraformь!")
        tips.append(f"   1 MC-prod = ~{gens_left} MC (мало!). 1 VP = ~{8 - gens_left * 0.8:.0f} MC.")
        tips.append("   Не покупай production карты. Greenery/heat конверсии = хорошо.")
    elif phase == "endgame":
        tips.append("🏁 ФАЗА: Финал! Только VP/TR. Production = 0.")
        tips.append("   Greenery из plants, temp из heat, awards, VP-карты.")
        tips.append("   Не покупай карт на драфте если не сыграешь в этом gen!")

    # Rush vs Engine detection
    total_prod = me.mc_prod + me.steel_prod * 1.6 + me.ti_prod * 2.5
    opp_max_tr = max((o.tr for o in state.opponents), default=20)
    tr_lead = me.tr - opp_max_tr

    if tr_lead >= 5 and phase in ("mid", "late"):
        tips.append(f"   🏃 TR лид +{tr_lead}! Можно рашить конец — поднимай параметры.")
    elif tr_lead <= -8:
        tips.append(f"   🐢 TR отставание {tr_lead}. Компенсируй VP (milestones/awards/cards).")

    if total_prod >= 20 and phase == "mid":
        tips.append(f"   💰 Сильный engine ({total_prod:.0f} MC-eq/gen). Можно замедлять игру.")

    # VP gap analysis — where do I stand?
    my_vp = _estimate_vp(state)
    opp_vps = []
    for opp in state.opponents:
        ovp = _estimate_vp(state, opp)
        opp_vps.append((opp.name, ovp["total"]))
    if opp_vps:
        leader_name, leader_vp = max(opp_vps, key=lambda x: x[1])
        gap = my_vp["total"] - leader_vp
        if gap > 5:
            tips.append(f"   🟢 VP лидер: +{gap} над {leader_name} (~{my_vp['total']} VP)")
        elif gap > 0:
            tips.append(f"   🟢 Впереди +{gap} VP ({my_vp['total']} vs {leader_name} {leader_vp})")
        elif gap >= -3:
            tips.append(f"   🟡 Почти вровень с {leader_name} ({my_vp['total']} vs {leader_vp})")
        else:
            vp_needed = abs(gap) / max(1, gens_left)
            tips.append(f"   🔴 Отставание {gap} VP от {leader_name} ({my_vp['total']} vs {leader_vp})")
            if gens_left >= 2:
                tips.append(f"      Нужно +{vp_needed:.1f} VP/gen: greenery, awards, VP-карты")

    return tips


# Standard Projects reference with efficiency
STANDARD_PROJECTS = {
    "Power Plant":   {"cost": 11, "gives": "+1 energy-prod",     "value_fn": "energy_prod"},
    "Asteroid":      {"cost": 14, "gives": "+1 temp (+1 TR)",    "value_fn": "tr"},
    "Aquifer":       {"cost": 18, "gives": "ocean (+1 TR +adj)", "value_fn": "ocean"},
    "Greenery":      {"cost": 23, "gives": "greenery (+1 O₂ +1 TR +1 VP)", "value_fn": "greenery"},
    "City":          {"cost": 25, "gives": "city (+1 MC-prod)",  "value_fn": "mc_prod"},
    "Air Scrapping": {"cost": 15, "gives": "+1 Venus",           "value_fn": "tr"},
    "Buffer Gas":    {"cost": 16, "gives": "+1 TR",              "value_fn": "tr"},
}


def sp_efficiency(gens_left: int) -> list[tuple[str, float, str]]:
    """Calculate standard project efficiency (value/cost ratio) for current timing."""
    rv = resource_values(gens_left)
    results = []
    for name, sp in STANDARD_PROJECTS.items():
        val = rv.get(sp["value_fn"], 7.0)
        ratio = val / sp["cost"]
        results.append((name, ratio, sp["gives"]))
    results.sort(key=lambda x: x[1], reverse=True)
    return results


# ═══════════════════════════════════════════════
# SynergyEngine
# ═══════════════════════════════════════════════

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
    "Sagitta Frontier Services": {},  # +4 MC per no-tag card
    "Lakefront Resorts": {},
    "Philares": {"Building": 2},  # adjacency bonuses from building
    "Robinson Industries": {},  # production engine
    "Helion": {},  # heat as MC
}

# Corp discounts for effective cost calculation
CORP_DISCOUNTS: dict[str, dict] = {
    "Teractor": {"Earth": 3},
    "Thorgate": {"Power": 3},
    "Morning Star Inc": {"Venus": 2}, "Morning Star Inc.": {"Venus": 2},
    "Phobolog": {},  # +1 ti value
    "Helion": {},  # heat as MC
}

# Cards that give ongoing discounts when in tableau
TABLEAU_DISCOUNT_CARDS: dict[str, dict] = {
    "Earth Office": {"Earth": 3},
    "Research Outpost": {"all": 1},
    "Space Station": {"Space": 2},
    "Quantum Extractor": {"Space": 2},
    "Warp Drive": {"Space": 4},
    "Media Group": {},  # +3 MC per event
    "Cutting Edge Technology": {},  # -2 MC per req card
    "Earth Catapult": {"all": 2},
    "Solar Logistics": {"Earth": 2},
    "Anti-Gravity Technology": {"all": 2},
}


class SynergyEngine:
    def __init__(self, db: CardDatabase, combo_detector: ComboDetector = None):
        self.db = db
        self.combo = combo_detector

    def adjusted_score(self, card_name: str, card_tags: list[str],
                       corp_name: str, generation: int,
                       player_tags: dict[str, int],
                       state=None) -> int:
        base = self.db.get_score(card_name)
        bonus = 0

        # Corp tag synergies
        corp_syn = CORP_TAG_SYNERGIES.get(corp_name, {})
        for tag in card_tags:
            bonus += corp_syn.get(tag, 0)

        # Sagitta bonus for no-tag cards
        if "sagitta" in corp_name.lower() and not card_tags:
            bonus += 5

        # Timing: production vs VP
        gens_left = _estimate_remaining_gens(state) if state else max(1, 9 - generation)
        card_data = self.db.get(card_name)
        if card_data:
            r = card_data.get("reasoning", "").lower()
            if "prod" in r or "production" in r:
                if gens_left <= 2:
                    bonus -= 8  # production late = useless
                elif gens_left >= 5:
                    bonus += 4  # production early = great
            if "vp" in r or "victory" in r:
                if gens_left <= 2:
                    bonus += 5  # VP late = great
                elif gens_left >= 6:
                    bonus -= 3  # VP early = meh

        # Tag synergies based on existing tags
        if "Jovian" in card_tags:
            bonus += 2
        if "Science" in card_tags and player_tags.get("Science", 0) >= 2:
            bonus += 2
        if "Earth" in card_tags and player_tags.get("Earth", 0) >= 3:
            bonus += 2  # Earth cluster
        if "Event" in card_tags and player_tags.get("Event", 0) >= 3:
            bonus += 2  # Legend milestone / IC

        # Turmoil ruling bonus
        if state and state.turmoil:
            ruling = state.turmoil.get("ruling", "")
            if ruling == "Scientists" and "Science" in card_tags:
                bonus += 2
            elif ruling == "Unity" and any(t in card_tags for t in ("Venus", "Earth", "Jovian")):
                bonus += 2
            elif ruling == "Greens" and any(t in card_tags for t in ("Plant", "Microbe", "Animal")):
                bonus += 2
            elif ruling == "Reds":
                # Cards that raise parameters are penalized under Reds
                if card_data:
                    r = card_data.get("reasoning", "").lower()
                    if "tr" in r and ("raise" in r or "terraform" in r or "ocean" in r or "temp" in r):
                        bonus -= 3

        # Tableau discount awareness
        if state and hasattr(state, 'me') and state.me.tableau:
            for tc in state.me.tableau:
                disc = TABLEAU_DISCOUNT_CARDS.get(tc["name"], {})
                for tag in card_tags:
                    if tag in disc:
                        bonus += min(disc[tag], 3)  # cap at 3
                if "all" in disc and card_tags:
                    bonus += min(disc["all"], 2)  # generic discount = slight bonus

        # === Pathfinders: planetary tag bonus ===
        # Each planetary tag advances a track that gives bonuses to everyone/rising player
        if state and hasattr(state, 'has_pathfinders') and state.has_pathfinders:
            PLANETARY_TAGS = {"Venus", "Earth", "Mars", "Jovian", "Moon"}
            planetary_count = sum(1 for t in card_tags if t.capitalize() in PLANETARY_TAGS
                                 or t.upper() in PLANETARY_TAGS or t in PLANETARY_TAGS)
            if planetary_count > 0:
                # Base bonus: each planetary tag is worth ~2-3 MC more with tracks
                track_bonus = planetary_count * 2
                # Extra bonus if close to a track threshold
                tracks = self.db.planetary_tracks
                if tracks:
                    for tag in card_tags:
                        tag_lower = tag.lower()
                        track = tracks.get(tag_lower)
                        if not track:
                            continue
                        # Use real position from API if available
                        api_tracks = getattr(state, 'planetary_tracks', {})
                        if api_tracks and tag_lower in api_tracks:
                            est_position = api_tracks[tag_lower]
                        else:
                            # Fallback: estimate from player tags
                            est_position = player_tags.get(tag_lower, 0) * 2
                        bonuses = track.get("bonuses", [])
                        for b in bonuses:
                            tags_to_bonus = b["position"] - est_position
                            if 0 < tags_to_bonus <= 2:
                                # Very close to bonus — this tag could trigger it
                                track_bonus += 2
                                break
                bonus += track_bonus

        # === ComboDetector: tableau synergy bonus ===
        if self.combo and state and hasattr(state, 'me') and state.me.tableau:
            tableau_names = [c["name"] for c in state.me.tableau]
            combo_bonus = self.combo.get_hand_synergy_bonus(card_name, tableau_names, player_tags)
            bonus += combo_bonus

        return max(0, min(100, base + bonus))


# ═══════════════════════════════════════════════
# TMClient
# ═══════════════════════════════════════════════

class TMClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "TM-Advisor/2.0"
        self._last_request = 0.0

    def _rate_limit(self):
        elapsed = time.time() - self._last_request
        if elapsed < 1.0:
            time.sleep(1.0 - elapsed)
        self._last_request = time.time()

    def get_player_state(self, player_id: str) -> dict:
        self._rate_limit()
        resp = self.session.get(f"{BASE_URL}/api/player", params={"id": player_id})
        resp.raise_for_status()
        return resp.json()

    def get_game_info(self, game_id: str) -> dict | None:
        """Fetch game overview (includes all player IDs)."""
        self._rate_limit()
        try:
            resp = self.session.get(f"{BASE_URL}/api/game", params={"id": game_id})
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass
        return None

    def discover_all_player_ids(self, identifier: str) -> list[str]:
        """Auto-discover all player IDs from a game ID, player ID, or spectator ID."""
        # If game ID (gXXX) — fetch directly
        if identifier.startswith("g"):
            game_info = self.get_game_info(identifier)
            if game_info and "players" in game_info:
                return [p["id"] for p in game_info["players"] if "id" in p]
            return []

        # If player ID (pXXX) — try to find game ID via spectatorId
        if identifier.startswith("p"):
            state_data = self.get_player_state(identifier)
            game = state_data.get("game", {})
            # spectatorId → game API doesn't accept it, but let's try game.id
            for candidate in [game.get("id"), state_data.get("runId")]:
                if candidate:
                    game_info = self.get_game_info(candidate)
                    if game_info and "players" in game_info:
                        all_ids = [p["id"] for p in game_info["players"] if "id" in p]
                        if identifier in all_ids:
                            all_ids.remove(identifier)
                            all_ids.insert(0, identifier)
                        return all_ids
            return [identifier]

        return [identifier]

    def poll_waiting_for(self, player_id: str, game_age: int, undo_count: int) -> dict:
        self._rate_limit()
        resp = self.session.get(
            f"{BASE_URL}/api/waitingfor",
            params={"id": player_id, "gameAge": game_age, "undoCount": undo_count},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()


# ═══════════════════════════════════════════════
# PlayerInfo — данные одного игрока
# ═══════════════════════════════════════════════

class PlayerInfo:
    def __init__(self, data: dict, is_me: bool = False):
        self.raw = data
        self.name = data.get("name", "???")
        self.color = data.get("color", "?")
        self.is_me = is_me

        # Corp
        self.corp = "???"
        tableau = data.get("tableau", [])
        if tableau and isinstance(tableau[0], dict):
            self.corp = tableau[0].get("name", "???")

        # Resources
        self.mc = data.get("megaCredits", 0)
        self.steel = data.get("steel", 0)
        self.titanium = data.get("titanium", 0)
        self.plants = data.get("plants", 0)
        self.energy = data.get("energy", 0)
        self.heat = data.get("heat", 0)

        # Production
        self.mc_prod = data.get("megaCreditProduction", 0)
        self.steel_prod = data.get("steelProduction", 0)
        self.ti_prod = data.get("titaniumProduction", 0)
        self.plant_prod = data.get("plantProduction", 0)
        self.energy_prod = data.get("energyProduction", 0)
        self.heat_prod = data.get("heatProduction", 0)

        self.tr = data.get("terraformRating", 20)
        self.steel_value = data.get("steelValue", 2)
        self.ti_value = data.get("titaniumValue", 3)
        self.cards_in_hand_n = data.get("cardsInHandNbr", 0)
        self.cities = data.get("citiesCount", 0)
        self.colonies = data.get("coloniesCount", 0)
        self.fleet_size = data.get("fleetSize", 1)
        self.actions_this_gen = data.get("actionsTakenThisRound", 0)

        # Tags
        tp_tags = data.get("tags", {})
        self.tags = {k: v for k, v in tp_tags.items() if v > 0} if isinstance(tp_tags, dict) else {}

        # Tableau
        self.tableau = []
        for c in tableau:
            if isinstance(c, dict):
                self.tableau.append({
                    "name": c.get("name", "???"),
                    "resources": c.get("resources", 0),
                    "discount": c.get("discount", 0),
                })

        # Turmoil influence
        self.influence = data.get("influence", 0)

        # Timer
        timer = data.get("timer", {})
        self.time_ms = timer.get("sumElapsed", 0)


# ═══════════════════════════════════════════════
# GameState — полный snapshot игры
# ═══════════════════════════════════════════════

class GameState:
    def __init__(self, data: dict):
        self.raw = data
        self.game = data.get("game", {})
        self.this_player_raw = data.get("thisPlayer", data)

        # Я
        self.me = PlayerInfo(self.this_player_raw, is_me=True)

        # Корпорация из pickedCorporationCard (надёжнее)
        picked = data.get("pickedCorporationCard", [])
        if picked and isinstance(picked[0], dict):
            self.me.corp = picked[0].get("name", self.me.corp)

        # Оппоненты
        self.opponents: list[PlayerInfo] = []
        for p in data.get("players", []):
            if p.get("color") != self.me.color:
                self.opponents.append(PlayerInfo(p))

        # Color → name map for display (all players)
        self.color_names: dict[str, str] = {self.me.color: self.me.name}
        for opp in self.opponents:
            self.color_names[opp.color] = opp.name

        # Глобальные параметры
        self.generation = self.game.get("generation", 1)
        self.oxygen = self.game.get("oxygenLevel", 0)
        self.temperature = self.game.get("temperature", -30)
        self.oceans = self.game.get("oceans", 0)
        self.venus = self.game.get("venusScaleLevel", 0)
        self.phase = self.game.get("phase", "")
        self.game_age = self.game.get("gameAge", 0)
        self.undo_count = self.game.get("undoCount", 0)
        self.deck_size = self.game.get("deckSize", 0)

        # Game options
        opts = self.game.get("gameOptions", {})
        expansions = opts.get("expansions", {})
        self.has_colonies = expansions.get("colonies", False)
        self.has_turmoil = expansions.get("turmoil", False)
        self.has_venus = expansions.get("venus", False)
        self.has_prelude = expansions.get("prelude", False)
        self.has_moon = expansions.get("moon", False)
        self.has_pathfinders = expansions.get("pathfinders", False)
        self.has_ceos = expansions.get("ceos", False)
        self.board_name = opts.get("boardName", "tharsis")
        self.is_wgt = opts.get("fastModeOption", False) or opts.get("solarPhaseOption", False)
        self.is_merger = opts.get("twoCorpsVariant", False)
        self.is_draft = opts.get("draftVariant", False)

        # Planetary tracks (Pathfinders) — real positions from API
        pf_data = self.game.get("pathfinders")
        self.planetary_tracks: dict[str, int] = {}
        if pf_data and isinstance(pf_data, dict):
            for track in ("venus", "earth", "mars", "jovian", "moon"):
                pos = pf_data.get(track, -1)
                if pos >= 0:
                    self.planetary_tracks[track] = pos

        # Milestones
        self.milestones = self._parse_milestones()

        # Awards
        self.awards = self._parse_awards()

        # Colonies
        self.colonies_data = self._parse_colonies()

        # Turmoil
        self.turmoil = self._parse_turmoil()

        # Map spaces
        self.spaces = self.game.get("spaces", [])

        # Карты в руке
        self.cards_in_hand = self._parse_cards(data.get("cardsInHand", []))
        self.dealt_corps = self._parse_cards(data.get("dealtCorporationCards", []))
        self.dealt_preludes = self._parse_cards(data.get("dealtPreludeCards", []))
        self.dealt_ceos = self._parse_cards(data.get("dealtCEOCards", []))
        self.dealt_project_cards = self._parse_cards(data.get("dealtProjectCards", []))

        # waitingFor
        self.waiting_for = data.get("waitingFor")

    # Shortcuts для совместимости
    @property
    def corp_name(self): return self.me.corp
    @property
    def mc(self): return self.me.mc
    @property
    def tr(self): return self.me.tr
    @property
    def tags(self): return self.me.tags

    def _parse_milestones(self) -> list[dict]:
        result = []
        for m in self.game.get("milestones", []):
            entry = {"name": m.get("name", "???"), "claimed_by": None, "scores": {}}
            if "playerName" in m:
                entry["claimed_by"] = m["playerName"]
            for s in m.get("scores", []):
                entry["scores"][s.get("color", "?")] = {
                    "score": s.get("score", 0),
                    "claimable": s.get("claimable", False),
                }
            result.append(entry)
        return result

    def _parse_awards(self) -> list[dict]:
        result = []
        for a in self.game.get("awards", []):
            entry = {"name": a.get("name", "???"), "funded_by": None, "scores": {}}
            if "playerName" in a:
                entry["funded_by"] = a["playerName"]
            for s in a.get("scores", []):
                entry["scores"][s.get("color", "?")] = s.get("score", 0)
            result.append(entry)
        return result

    def _parse_colonies(self) -> list[dict]:
        result = []
        for c in self.game.get("colonies", []):
            if not c.get("isActive", True):
                continue
            result.append({
                "name": c.get("name", "???"),
                "settlers": c.get("colonies", []),  # цвета игроков
                "track": c.get("trackPosition", 0),
            })
        return result

    def _parse_turmoil(self) -> dict | None:
        """Parse Turmoil data from game.turmoil."""
        t = self.game.get("turmoil")
        if not t:
            return None
        result = {
            "ruling": t.get("ruling"),       # current ruling party
            "dominant": t.get("dominant"),    # party with most delegates
            "chairman": t.get("chairman"),   # color of chairman
            "distant": t.get("distant"),     # global event 2 gens away
            "coming": t.get("coming"),       # global event next gen
            "current": t.get("current"),     # global event resolving this gen
            "parties": {},
            "lobby": t.get("lobby", []),
            "policy_used": {},
        }
        # Parse parties
        for p in t.get("parties", []):
            name = p.get("name", "?")
            delegates = {}
            for d in p.get("delegates", []):
                delegates[d.get("color", "?")] = d.get("number", 0)
            result["parties"][name] = {
                "leader": p.get("partyLeader"),
                "delegates": delegates,
                "total": sum(delegates.values()),
            }
        # Policy action used
        for pu in t.get("policyActionUsers", []):
            result["policy_used"][pu.get("color", "?")] = pu.get("turmoilPolicyActionUsed", False)
        return result

    @staticmethod
    def _parse_cards(card_list: list) -> list[dict]:
        result = []
        for c in card_list:
            if isinstance(c, dict):
                result.append({
                    "name": c.get("name", "???"),
                    "tags": c.get("tags", []),
                    "cost": c.get("calculatedCost", c.get("cost", 0)),
                })
            elif isinstance(c, str):
                result.append({"name": c, "tags": [], "cost": 0})
        return result


# ═══════════════════════════════════════════════
# Turmoil Data — Global Events & Party Policies
# ═══════════════════════════════════════════════

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


# ═══════════════════════════════════════════════
# Colony Trade Data
# ═══════════════════════════════════════════════

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


# ═══════════════════════════════════════════════
# AdvisorDisplay — ANSI-терминал
# ═══════════════════════════════════════════════

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


class AdvisorDisplay:
    W = 64

    @staticmethod
    def clear():
        os.system("cls" if os.name == "nt" else "clear")

    def header(self, state: GameState, title: str = ""):
        line = "═" * self.W
        mods = []
        if state.has_colonies: mods.append("Col")
        if state.has_turmoil: mods.append("Turm")
        if state.has_venus: mods.append("Ven")
        if state.is_wgt: mods.append("WGT")
        if state.has_pathfinders: mods.append("Path")
        if state.has_ceos: mods.append("CEO")
        if state.is_merger: mods.append("Merger")
        mod_str = " │ " + "+".join(mods) if mods else ""

        print(f"\n{Fore.CYAN}{line}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}  TM Advisor v2 — Gen {state.generation}"
              f"{f' ({title})' if title else ''}"
              f"  [{state.board_name}]{mod_str}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}  Corp: {state.corp_name} │ MC: {state.mc}"
              f" │ TR: {state.tr}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}  O₂: {state.oxygen}% │ T: {state.temperature}°C"
              f" │ Oceans: {state.oceans}/9"
              f"{f' │ Venus: {state.venus}%' if state.has_venus else ''}"
              f" │ Deck: {state.deck_size}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}{line}{Style.RESET_ALL}")

    def card_row(self, tier: str, score: int, name: str,
                 note: str = "", adjusted: bool = False):
        color = TIER_COLORS.get(tier, "")
        adj = "★" if adjusted else " "
        print(f"  {color}{tier}{Style.RESET_ALL}"
              f"  {color}{score:3d}{Style.RESET_ALL}"
              f"  {name:<28s} {adj} │ {note[:38]}")

    def separator(self):
        print(f"  {'─' * (self.W - 4)}")

    def section(self, title: str):
        print(f"\n  {Fore.WHITE}{Style.BRIGHT}{title}{Style.RESET_ALL}\n")

    def recommendation(self, text: str):
        print(f"\n  {Fore.GREEN}{Style.BRIGHT}→ {text}{Style.RESET_ALL}")

    def info(self, text: str):
        print(f"  {Fore.CYAN}{text}{Style.RESET_ALL}")

    def waiting(self, text: str):
        print(f"\r  {Fore.WHITE}{Style.DIM}⏳ {text}{Style.RESET_ALL}", end="", flush=True)

    def error(self, text: str):
        print(f"  {Fore.RED}✗ {text}{Style.RESET_ALL}")

    def resources_bar(self, state: GameState):
        me = state.me
        print(f"\n  {Fore.YELLOW}MC:{me.mc}(+{me.mc_prod})"
              f"  Steel:{me.steel}(+{me.steel_prod})"
              f"  Ti:{me.titanium}(+{me.ti_prod}){Style.RESET_ALL}")
        print(f"  {Fore.GREEN}Plants:{me.plants}(+{me.plant_prod})"
              f"  Energy:{me.energy}(+{me.energy_prod})"
              f"  Heat:{me.heat}(+{me.heat_prod}){Style.RESET_ALL}")

    def opponents_table(self, state: GameState):
        if not state.opponents:
            return
        # Show my VP estimate first
        my_vp = _estimate_vp(state)
        my_total = my_vp["total"]
        self.section(f"Мой VP estimate: ~{my_total}"
                     f" (TR:{my_vp['tr']} Gr:{my_vp['greenery']} Ci:{my_vp['city']}"
                     f" Cards:{my_vp['cards']} M:{my_vp['milestones']} A:{my_vp['awards']})")
        print()
        self.section("Оппоненты")
        for opp in state.opponents:
            c = COLOR_MAP.get(opp.color, "")
            strategy = _detect_strategy(opp)
            opp_vp = _estimate_vp(state, opp)
            opp_total = opp_vp["total"]
            diff = my_total - opp_total
            diff_str = f"{Fore.GREEN}+{diff}{Style.RESET_ALL}" if diff > 0 else f"{Fore.RED}{diff}{Style.RESET_ALL}"
            print(f"  {c}{opp.name}{Style.RESET_ALL} ({opp.corp})"
                  f"  TR:{opp.tr}  VP:~{opp_total} [{diff_str}]"
                  f"  MC:{opp.mc}(+{opp.mc_prod})"
                  f"  Cards:{opp.cards_in_hand_n}")
            if strategy:
                print(f"    {Fore.YELLOW}⚡ {strategy}{Style.RESET_ALL}")

    def milestones_table(self, state: GameState):
        if not state.milestones:
            return
        self.section("Milestones")
        my_color = state.me.color
        claimed_count = sum(1 for m in state.milestones if m.get("claimed_by"))
        slots_left = 3 - claimed_count

        cn = state.color_names  # color → name map
        for m in state.milestones:
            if m["claimed_by"]:
                claimer = m["claimed_by"]
                claimer_name = cn.get(claimer, claimer)
                cc = COLOR_MAP.get(claimer, "")
                print(f"  ✓ {m['name']} — {cc}{claimer_name}{Style.RESET_ALL}")
            else:
                my_score = m["scores"].get(my_color, {})
                score_val = my_score.get("score", 0) if isinstance(my_score, dict) else 0
                claimable = my_score.get("claimable", False) if isinstance(my_score, dict) else False
                threshold = my_score.get("threshold", 0) if isinstance(my_score, dict) else 0

                # Deep analysis: proximity and competition
                all_scores = {}
                opp_claimable = []
                for color, info in m["scores"].items():
                    s = info["score"] if isinstance(info, dict) else info
                    all_scores[color] = s
                    if color != my_color and isinstance(info, dict) and info.get("claimable"):
                        opp_claimable.append(cn.get(color, color))

                my_val = all_scores.get(my_color, 0)

                # Progress bar
                if threshold > 0:
                    progress = min(1.0, my_val / threshold)
                    bar_len = 8
                    filled = int(progress * bar_len)
                    bar = "█" * filled + "░" * (bar_len - filled)
                    progress_str = f" [{bar}] {my_val}/{threshold}"
                else:
                    progress_str = f" ({my_val})"

                if claimable:
                    mark = f"{Fore.GREEN}{Style.BRIGHT}◆ ЗАЯВЛЯЙ! (8 MC = 5 VP){Style.RESET_ALL}"
                    if opp_claimable:
                        mark += f" {Fore.RED}⚠️ {', '.join(opp_claimable)} тоже может!{Style.RESET_ALL}"
                elif slots_left <= 0:
                    mark = f"{Fore.RED}ЗАКРЫТО{Style.RESET_ALL}"
                else:
                    if threshold > 0 and my_val >= threshold - 1:
                        mark = f"{Fore.YELLOW}ПОЧТИ!{Style.RESET_ALL}"
                    elif opp_claimable:
                        mark = f"{Fore.RED}⚠️ {', '.join(opp_claimable)} может заявить!{Style.RESET_ALL}"
                    else:
                        mark = ""

                # All players scores with names
                scores_parts = []
                for color, val in all_scores.items():
                    c = COLOR_MAP.get(color, "")
                    pname = cn.get(color, color)[:6]
                    bold = Style.BRIGHT if color == my_color else ""
                    scores_parts.append(f"{c}{bold}{pname}:{val}{Style.RESET_ALL}")
                scores_str = " ".join(scores_parts)

                print(f"  {'◆' if claimable else '○'} {m['name']}{progress_str}: {scores_str}  {mark}")

        if slots_left > 0:
            print(f"  {Fore.CYAN}Осталось слотов: {slots_left}/3 │ Стоимость: 8 MC = 5 VP (ROI: 0.63 VP/MC){Style.RESET_ALL}")

    def awards_table(self, state: GameState):
        if not state.awards:
            return
        self.section("Awards")
        my_color = state.me.color
        funded_count = sum(1 for a in state.awards if a.get("funded_by"))
        award_costs = [8, 14, 20]
        next_cost = award_costs[min(funded_count, 2)] if funded_count < 3 else 0

        cn = state.color_names
        for a in state.awards:
            funded = a.get("funded_by")
            scores_parts = []
            my_val = 0
            max_val = 0
            second_val = 0
            for color, val in a["scores"].items():
                c = COLOR_MAP.get(color, "")
                pname = cn.get(color, color)[:6]
                bold = Style.BRIGHT if color == my_color else ""
                scores_parts.append(f"{c}{bold}{pname}:{val}{Style.RESET_ALL}")
                if color == my_color:
                    my_val = val
                if val > max_val:
                    second_val = max_val
                    max_val = val
                elif val > second_val:
                    second_val = val

            i_am_first = my_val == max_val and my_val > 0
            i_am_second = not i_am_first and my_val == second_val and my_val > 0
            scores_str = " ".join(scores_parts)

            if funded:
                funder_name = cn.get(funded, funded)
                fc = COLOR_MAP.get(funded, "")
                # Already funded — show expected VP
                if i_am_first:
                    vp_str = f" {Fore.GREEN}→ 5 VP (1st){Style.RESET_ALL}"
                elif i_am_second:
                    vp_str = f" {Fore.YELLOW}→ 2 VP (2nd){Style.RESET_ALL}"
                else:
                    vp_str = f" {Fore.RED}→ 0 VP{Style.RESET_ALL}"
                print(f"  $ {a['name']}: {scores_str}{vp_str}  [funded: {fc}{funder_name}{Style.RESET_ALL}]")
            else:
                # Not funded — show ROI if we fund
                if funded_count >= 3:
                    print(f"  ✗ {a['name']}: {scores_str}  {Fore.RED}ЗАКРЫТО{Style.RESET_ALL}")
                else:
                    # ROI: expected VP / cost
                    if i_am_first:
                        ev = 5  # guaranteed 5 VP
                        lead = my_val - second_val
                        safety = f"лид +{lead}" if lead > 0 else "НИЧЬЯ — рискованно"
                        roi_str = f"{Fore.GREEN}→ 5 VP за {next_cost} MC ({safety}){Style.RESET_ALL}"
                    elif i_am_second:
                        ev = 2
                        gap = max_val - my_val
                        roi_str = f"{Fore.YELLOW}→ 2 VP за {next_cost} MC (отстаёшь на {gap}){Style.RESET_ALL}"
                    else:
                        ev = 0
                        roi_str = f"{Fore.RED}→ 0 VP (не лидер){Style.RESET_ALL}"
                    print(f"  ○ {a['name']}: {scores_str}  {roi_str}")

        if funded_count < 3:
            print(f"  {Fore.CYAN}След. award стоит: {next_cost} MC │ Слотов: {3 - funded_count}/3{Style.RESET_ALL}")

    def map_table(self, state: GameState):
        """Display map placement recommendations."""
        info = _analyze_map(state)
        if not info:
            return
        self.section(f"Карта (cities:{info['my_cities']} green:{info['my_greeneries']} oceans:{info['total_oceans']}/9)")
        best_city = info.get("best_city", [])
        best_green = info.get("best_greenery", [])

        if best_city:
            top = best_city[0]
            others = ", ".join(f"#{s[0]}" for s in best_city[1:3])
            print(f"  🏙 City: #{top[0]} ({top[3]}pt) {top[4]}"
                  f"{f'  also: {others}' if others else ''}")
        if best_green:
            top = best_green[0]
            others = ", ".join(f"#{s[0]}" for s in best_green[1:3])
            print(f"  🌿 Green: #{top[0]} ({top[3]}pt) {top[4]}"
                  f"{f'  also: {others}' if others else ''}")

    def turmoil_table(self, state: GameState):
        """Display Turmoil state: ruling party, global events, delegates."""
        if not state.turmoil:
            return
        t = state.turmoil
        self.section("Turmoil")

        # Ruling party & chairman
        cn = state.color_names
        ruling = t["ruling"] or "?"
        dominant = t["dominant"] or "?"
        chairman_color = t["chairman"] or "?"
        chairman_name = cn.get(chairman_color, chairman_color)
        cc = COLOR_MAP.get(chairman_color, "")
        policy = PARTY_POLICIES.get(ruling, {})
        icon = policy.get("icon", "")
        policy_text = policy.get("policy", "")
        ruling_is_reds = "Reds" in str(ruling)

        clr = Fore.RED + Style.BRIGHT if ruling_is_reds else Fore.GREEN
        print(f"  {icon} Ruling: {clr}{ruling}{Style.RESET_ALL}"
              f" │ Dominant: {dominant} │ Chairman: {cc}{chairman_name}{Style.RESET_ALL}")
        if policy_text:
            print(f"    Policy: {policy_text}")

        # Reds warning
        if ruling_is_reds:
            print(f"  {Fore.RED}{Style.BRIGHT}  ⚠️ REDS RULING: -1 TR за каждый подъём параметра!{Style.RESET_ALL}")

        # My influence
        my_influence = state.me.influence
        is_chairman = chairman_color == state.me.color
        print(f"  Мой influence: {my_influence}"
              f"{'  (chairman)' if is_chairman else ''}")

        # Global events forecast
        print()
        for label, event_name in [("Сейчас", t["current"]), ("Следующий", t["coming"]), ("Далёкий", t["distant"])]:
            if event_name:
                ev = GLOBAL_EVENTS.get(event_name, {})
                desc = ev.get("desc", "?")
                good = ev.get("good", True)
                clr = Fore.GREEN if good else Fore.RED
                print(f"  {label}: {clr}{event_name}{Style.RESET_ALL}")
                print(f"    {desc}")

        # Party delegates summary (compact)
        my_color = state.me.color
        my_in_lobby = my_color in t.get("lobby", [])
        parties_with_me = []
        for pname, pdata in t["parties"].items():
            my_dels = pdata["delegates"].get(my_color, 0)
            if my_dels > 0:
                parties_with_me.append(f"{pname}:{my_dels}")
        if parties_with_me or my_in_lobby:
            lobby_str = " │ Lobby: ✓" if my_in_lobby else " │ Lobby: ✗"
            print(f"\n  Мои делегаты: {', '.join(parties_with_me) if parties_with_me else 'нет'}{lobby_str}")

    def colonies_table(self, state: GameState):
        if not state.colonies_data:
            return
        self.section("Колонии")
        cn = state.color_names
        my_color = state.me.color
        for col in state.colonies_data:
            settlers = col["settlers"]
            my_count = settlers.count(my_color)
            slots = 3 - len(settlers)
            # Show settler names with colors
            settler_parts = []
            for sc in settlers:
                c = COLOR_MAP.get(sc, "")
                sname = cn.get(sc, sc)[:5]
                settler_parts.append(f"{c}{sname}{Style.RESET_ALL}")
            settler_str = ",".join(settler_parts) if settler_parts else "пусто"
            # Enhanced: show trade value from COLONY_TRADE_DATA
            cdata = COLONY_TRADE_DATA.get(col["name"])
            trade_val = ""
            if cdata:
                track = cdata["track"]
                pos = min(col["track"], len(track) - 1)
                trade_val = f"  trade={track[pos]} {cdata['resource']}"
            my_marker = f"  {Fore.GREEN}← ты{Style.RESET_ALL}" if my_count > 0 else ""
            print(f"  {col['name']}: track={col['track']}{trade_val}"
                  f"  [{settler_str}]"
                  f"  (слотов: {slots}){my_marker}")


# ═══════════════════════════════════════════════
# ClaudeOutput — Markdown для Claude Code
# ═══════════════════════════════════════════════

class ClaudeOutput:
    """Форматирует snapshot как Markdown для анализа Claude."""

    def __init__(self, db: CardDatabase, synergy: SynergyEngine, req_checker: RequirementsChecker = None):
        self.db = db
        self.synergy = synergy
        self.req_checker = req_checker

    def format(self, state: GameState) -> str:
        lines = []
        a = lines.append

        # Header
        a(f"# TM Game Snapshot — Gen {state.generation}, Phase: {state.phase}")
        a("")

        # Game info
        mods = []
        if state.has_colonies: mods.append("Colonies")
        if state.has_turmoil: mods.append("Turmoil")
        if state.has_venus: mods.append("Venus")
        if state.has_pathfinders: mods.append("Pathfinders")
        if state.has_ceos: mods.append("CEOs")
        if state.is_merger: mods.append("Merger")
        if state.is_wgt: mods.append("WGT")
        a(f"**Board:** {state.board_name} │ **Mods:** {', '.join(mods) or 'base'}")
        a(f"**Global:** O₂ {state.oxygen}% │ T {state.temperature}°C"
          f" │ Oceans {state.oceans}/9"
          f"{f' │ Venus {state.venus}%' if state.has_venus else ''}"
          f" │ Deck {state.deck_size}")
        a("")

        # My state
        me = state.me
        a(f"## Мой игрок: {me.name} ({me.color})")
        a(f"**Corp:** {me.corp} │ **TR:** {me.tr}")
        a("")
        a("| Ресурс | Кол-во | Prod |")
        a("|--------|--------|------|")
        a(f"| MC | {me.mc} | +{me.mc_prod} |")
        a(f"| Steel | {me.steel} (val={me.steel_value}) | +{me.steel_prod} |")
        a(f"| Titanium | {me.titanium} (val={me.ti_value}) | +{me.ti_prod} |")
        a(f"| Plants | {me.plants} | +{me.plant_prod} |")
        a(f"| Energy | {me.energy} | +{me.energy_prod} |")
        a(f"| Heat | {me.heat} | +{me.heat_prod} |")
        a("")
        tags_str = ", ".join(f"{t}: {n}" for t, n in me.tags.items() if n > 0)
        a(f"**Tags:** {tags_str or 'нет'}")
        a("")

        # Tableau
        if me.tableau:
            a("**Tableau (сыгранные карты):**")
            for c in me.tableau:
                name = c['name']
                res_str = f" ({c['resources']} res)" if c.get("resources") else ""
                ceo = self.db.get_ceo(name)
                if ceo:
                    action_type = ceo.get("actionType", "")
                    a(f"- **CEO {name}** [{action_type}]{res_str}")
                else:
                    a(f"- {name}{res_str}")
            a("")

        # Hand
        if state.cards_in_hand:
            a("## Карты в руке")
            a("")
            a("| Карта | Cost | Score | Tier | Req | Заметка |")
            a("|-------|------|-------|------|-----|---------|")
            for card in state.cards_in_hand:
                name = card["name"]
                cost = card.get("cost", 0)
                score = self.synergy.adjusted_score(
                    name, card.get("tags", []), me.corp,
                    state.generation, me.tags, state)
                tier = _score_to_tier(score)
                note = self._get_note(name)
                if self.req_checker:
                    req_ok, req_reason = self.req_checker.check(name, state)
                else:
                    req_ok, req_reason = True, ""
                if not req_ok:
                    status = f"⛔ {req_reason}"
                elif cost <= me.mc:
                    status = f"✓ {cost} MC"
                else:
                    status = f"✗ {cost} MC"
                a(f"| {name} | {status} | {score} | {tier} | {req_reason if req_ok else '**НЕТ**'} | {note} |")
            a("")

        # Opponents
        if state.opponents:
            a("## Оппоненты")
            a("")
            for opp in state.opponents:
                a(f"### {opp.name} ({opp.color}) — {opp.corp}")
                a(f"TR: {opp.tr} │ MC: {opp.mc}(+{opp.mc_prod})"
                  f" │ Steel: {opp.steel}(+{opp.steel_prod})"
                  f" │ Ti: {opp.titanium}(+{opp.ti_prod})")
                a(f"Plants: {opp.plants}(+{opp.plant_prod})"
                  f" │ Energy: {opp.energy}(+{opp.energy_prod})"
                  f" │ Heat: {opp.heat}(+{opp.heat_prod})")
                a(f"Cards: {opp.cards_in_hand_n} │ Cities: {opp.cities}"
                  f" │ Colonies: {opp.colonies}")
                opp_tags = ", ".join(f"{t}: {n}" for t, n in opp.tags.items() if n > 0)
                a(f"Tags: {opp_tags}")
                if opp.tableau:
                    played = [c["name"] for c in opp.tableau]
                    a(f"Tableau: {', '.join(played)}")
                a("")

        # Map
        if state.spaces:
            a("## Карта")
            a("")
            a("```")
            for line in self._render_map(state.spaces):
                a(line)
            a("```")
            a("Легенда: Gr=greenery OC=ocean Ci=city Mi=mining Re=restricted NP=nat.preserve")
            a("Цвет: G=green R=red O=orange B=blue Y=yellow  ~~=свободный ocean  .=пусто")
            a("Бонусы: t=ti s=steel p=plant c=card h=heat e=energy $=MC a=animal m=microbe T=temp")
            a("")

        # Milestones
        if state.milestones:
            a("## Milestones")
            a("")
            for m in state.milestones:
                if m["claimed_by"]:
                    a(f"- **{m['name']}** — заявлен {m['claimed_by']}")
                else:
                    scores = []
                    for color, info in m["scores"].items():
                        s = info["score"] if isinstance(info, dict) else info
                        cl = info.get("claimable", False) if isinstance(info, dict) else False
                        mark = " ✓МОЖНО" if cl else ""
                        scores.append(f"{color}={s}{mark}")
                    a(f"- {m['name']}: {', '.join(scores)}")
            a("")

        # Awards
        if state.awards:
            a("## Awards")
            a("")
            for aw in state.awards:
                funded = f" (funded by {aw['funded_by']})" if aw["funded_by"] else ""
                scores = [f"{c}={v}" for c, v in aw["scores"].items()]
                a(f"- {aw['name']}: {', '.join(scores)}{funded}")
            a("")

        # Turmoil
        if state.turmoil:
            t = state.turmoil
            a("## Turmoil")
            a("")
            ruling = t.get("ruling", "?")
            dominant = t.get("dominant", "?")
            policy = PARTY_POLICIES.get(ruling, {})
            a(f"**Ruling:** {ruling} │ **Dominant:** {dominant} │ **Chairman:** {t.get('chairman', '?')}")
            a(f"**Policy:** {policy.get('policy', '?')}")
            a(f"**Мой influence:** {state.me.influence}")
            if "Reds" in str(ruling):
                a("**⚠️ REDS RULING — каждый подъём параметра = -1 TR!**")
            a("")
            for label, ev_name in [("Текущий", t.get("current")), ("Следующий", t.get("coming")), ("Далёкий", t.get("distant"))]:
                if ev_name:
                    ev = GLOBAL_EVENTS.get(ev_name, {})
                    good = "✅" if ev.get("good", True) else "❌"
                    a(f"- {label}: **{ev_name}** {good} — {ev.get('desc', '?')}")
            a("")

        # Colonies
        if state.colonies_data:
            a("## Колонии")
            a("")
            a("| Колония | Track | Trade Value | Settlers | Slots | Colony Bonus |")
            a("|---------|-------|-------------|----------|-------|--------------|")
            for col in state.colonies_data:
                settlers = col["settlers"]
                settler_str = ", ".join(settlers) if settlers else "-"
                cdata = COLONY_TRADE_DATA.get(col["name"], {})
                trade_val = ""
                if cdata:
                    track = cdata.get("track", [])
                    pos = min(col["track"], len(track) - 1) if track else 0
                    trade_val = f"{track[pos] if track else '?'} {cdata.get('resource', '?')}"
                cb = cdata.get("colony_bonus", "") if cdata else ""
                a(f"| {col['name']} | {col['track']} | {trade_val} | {settler_str} | {3 - len(settlers)} | {cb} |")
            a("")

        # Timing estimate
        gens_left = _estimate_remaining_gens(state)
        a(f"**Оценка оставшихся поколений:** ~{gens_left}")
        if gens_left <= 2:
            a("**⏰ Финал близко! Приоритет: VP, TR, milestones/awards.**")
        a("")

        # WaitingFor
        wf = state.waiting_for
        if wf:
            a("## Текущее решение")
            a("")
            wf_type = wf.get("type", "?")
            wf_title = _safe_title(wf)
            a(f"**Type:** {wf_type} │ **Title:** {wf_title}")
            if wf_type == "or":
                a("**Опции:**")
                for i, opt in enumerate(wf.get("options", []), 1):
                    a(f"  {i}. {opt.get('buttonLabel', opt.get('title', opt.get('type', '?')))}")

            # Карты в waitingFor
            wf_cards = self._extract_all_wf_cards(wf)
            if wf_cards:
                a("")
                a("**Карты на выбор:**")
                a("| Карта | Cost | Score | Tier | Req | Заметка |")
                a("|-------|------|-------|------|-----|---------|")
                for card in wf_cards:
                    name = card["name"]
                    cost = card.get("cost", 0)
                    score = self.synergy.adjusted_score(
                        name, card.get("tags", []), me.corp,
                        state.generation, me.tags)
                    tier = _score_to_tier(score)
                    note = self._get_note(name)
                    if self.req_checker:
                        req_ok, req_reason = self.req_checker.check(name, state)
                    else:
                        req_ok, req_reason = True, ""
                    req_col = f"⛔ {req_reason}" if not req_ok else "✓"
                    a(f"| {name} | {cost} MC | {score} | {tier} | {req_col} | {note} |")
            a("")

        a("---")
        a("*Проанализируй ситуацию и дай стратегический совет: что делать на этом ходу,"
          " какие milestones/awards преследовать, какие карты играть/покупать, и почему.*")

        return "\n".join(lines)

    @staticmethod
    def _render_map(spaces: list[dict]) -> list[str]:
        """Рендер гексагональной карты в ASCII."""
        TILE_CH = {
            0: "Gr", 1: "OC", 2: "Ci", 9: "Mi", 11: "Re",
            13: "NP", 8: "LA", 3: "In", 4: "Mo", 5: "Ca",
            6: "Nu", 7: "Ec", 10: "Co", 14: "Ma", 15: "Er",
        }
        BONUS_CH = {
            0: "t", 1: "s", 2: "p", 3: "c", 4: "h",  # base: ti/steel/plant/card/heat
            5: "O", 6: "$", 7: "a", 8: "m", 9: "e",   # ocean/MC/animal/microbe/energy
            10: "d", 11: "S", 12: "E", 13: "T",        # data/science/energy-prod/temperature
            15: "*", 16: "D", 17: "K", 18: "T",        # asteroid/delegate/colony/temp-4MC
        }
        COLOR_CH = {
            "green": "G", "red": "R", "orange": "O",
            "blue": "B", "yellow": "Y", "purple": "P",
        }

        grid: dict[tuple[int, int], str] = {}
        for s in spaces:
            y, x = s.get("y", -1), s.get("x", -1)
            if y < 0:
                continue
            tile = s.get("tileType")
            color = s.get("color", "")
            st = s.get("spaceType", "land")
            bonus = s.get("bonus", [])

            if tile is not None:
                tc = TILE_CH.get(tile, f"{tile:02d}")
                ci = COLOR_CH.get(color, " ")
                cell = f"{ci}{tc}"
            elif st == "ocean":
                cell = " ~~ "
            else:
                b_str = "".join(BONUS_CH.get(b, "?") for b in bonus)
                cell = f" {b_str:<3s}" if b_str else " .  "
            grid[(x, y)] = cell

        # Determine row layout
        rows_by_y: dict[int, list[int]] = {}
        for (x, y) in grid:
            rows_by_y.setdefault(y, []).append(x)

        if not rows_by_y:
            return ["(карта пуста)"]

        max_row_size = max(len(xs) for xs in rows_by_y.values())

        lines = []
        for y in sorted(rows_by_y.keys()):
            xs = sorted(rows_by_y[y])
            row_size = len(xs)
            indent = "  " * (max_row_size - row_size)
            cells = [f"[{grid[(x, y)]}]" for x in xs]
            lines.append(f"{indent}{' '.join(cells)}")

        return lines

    def _get_note(self, name: str) -> str:
        card = self.db.get(name)
        if not card:
            return "нет данных"
        economy = card.get("economy", "")
        if economy:
            return economy.split(".")[0][:60]
        return ""

    @staticmethod
    def _extract_all_wf_cards(wf: dict) -> list[dict]:
        cards = []
        for c in wf.get("cards", []):
            cards.append(_parse_wf_card(c))
        for opt in wf.get("options", []):
            for c in opt.get("cards", []):
                cards.append(_parse_wf_card(c))
        return cards

    def format_postgame(self, state: GameState) -> str:
        """Markdown post-game report для --claude mode."""
        lines = []
        a = lines.append

        all_players = [state.me] + state.opponents
        vp_data = {}
        for p in all_players:
            bd = p.raw.get("victoryPointsBreakdown", {})
            vp_data[p.name] = {
                "total": bd.get("total", 0),
                "tr": bd.get("terraformRating", p.tr),
                "cards": bd.get("victoryPoints", 0),
                "greenery": bd.get("greenery", 0),
                "city": bd.get("city", 0),
                "milestones": bd.get("milestones", 0),
                "awards": bd.get("awards", 0),
                "details_cards": {d["cardName"]: d["victoryPoint"]
                                  for d in bd.get("detailsCards", [])},
            }

        ranked = sorted(all_players, key=lambda p: vp_data[p.name]["total"], reverse=True)

        a(f"# Post-Game Report — Gen {state.generation}")
        a("")

        # Scoreboard
        a("## Scoreboard")
        a("")
        a("| # | Player | Corp | Total | TR | Cards | Green | City | MS | AW |")
        a("|---|--------|------|-------|----|-------|-------|------|----|-----|")
        for i, p in enumerate(ranked, 1):
            v = vp_data[p.name]
            marker = "**" if i == 1 else ""
            a(f"| {i} | {marker}{p.name}{marker} | {p.corp} | "
              f"{v['total']} | {v['tr']} | {v['cards']} | "
              f"{v['greenery']} | {v['city']} | {v['milestones']} | {v['awards']} |")
        a("")

        # My best cards
        my_vp = vp_data[state.me.name]
        card_vps = my_vp["details_cards"]
        if card_vps:
            positive = [(n, vp) for n, vp in sorted(card_vps.items(), key=lambda x: x[1], reverse=True) if vp > 0]
            if positive:
                a("## Мои лучшие карты")
                a("")
                a("| VP | Карта | Tier | Score |")
                a("|----|-------|------|-------|")
                for name, vp_val in positive:
                    score = self.db.get_score(name)
                    tier = self.db.get_tier(name)
                    a(f"| +{vp_val} | {name} | {tier} | {score} |")
                a("")

        # Dead cards
        dead = []
        for tc in state.me.tableau:
            name = tc["name"]
            card_info = self.db.get_info(name)
            cost = card_info.get("cost", 0) if card_info else 0
            vp_val = card_vps.get(name, 0)
            if vp_val == 0 and cost > 10:
                dead.append((name, cost, tc.get("resources", 0),
                             self.db.get_score(name), self.db.get_tier(name)))
        if dead:
            a("## Мёртвые карты (0 VP, cost > 10)")
            a("")
            a("| Карта | Cost | Res | Tier | Score |")
            a("|-------|------|-----|------|-------|")
            for name, cost, res, score, tier in dead:
                a(f"| {name} | {cost} MC | {res} | {tier} | {score} |")
            a("")

        # Stats
        tableau_size = len(state.me.tableau)
        total_cards_vp = my_vp["cards"]
        vp_per_card = total_cards_vp / tableau_size if tableau_size > 0 else 0
        a("## Статистика")
        a("")
        a(f"- Сыграно карт: {tableau_size} | VP от карт: {total_cards_vp} | VP/card: {vp_per_card:.2f}")
        a(f"- Greenery: {my_vp['greenery']} VP | Cities: {my_vp['city']} VP | TR: {my_vp['tr']}")
        a(f"- Milestones: {my_vp['milestones']} VP | Awards: {my_vp['awards']} VP | Total: {my_vp['total']} VP")
        a("")

        return "\n".join(lines)


# ═══════════════════════════════════════════════
# Утилиты (вне классов)
# ═══════════════════════════════════════════════

def _detect_strategy(player) -> str:
    """Определить стратегию игрока по тегам, корпорации и production."""
    tags = player.tags
    parts = []

    # Dominant tags
    tag_counts = sorted(tags.items(), key=lambda x: x[1], reverse=True)
    top_tags = [(t, n) for t, n in tag_counts if n >= 3 and t not in ("event", "wild")]

    # Corp-based strategy
    corp = player.corp.lower() if player.corp else ""
    if "thorgate" in corp:
        parts.append("Energy engine")
    elif "ecoline" in corp or "arklight" in corp:
        parts.append("Bio engine")
    elif "point luna" in corp or "teractor" in corp:
        parts.append("Earth cards")
    elif "phobolog" in corp:
        parts.append("Space/Ti")
    elif "credicor" in corp:
        parts.append("Big cards")
    elif "pharmacy" in corp:
        parts.append("Science/cards")
    elif "tharsis" in corp:
        parts.append("Cities/MC")
    elif "morning star" in corp:
        parts.append("Venus")
    elif "splice" in corp:
        parts.append("Microbe")
    elif "interplanetary" in corp:
        parts.append("Events")
    elif "mining guild" in corp:
        parts.append("Building/Steel")
    elif "inventrix" in corp:
        parts.append("Flexible/req-free")
    elif "robinson" in corp:
        parts.append("Production engine")
    elif "helion" in corp:
        parts.append("Heat→MC")

    # Production-based
    if player.plant_prod >= 4:
        parts.append(f"Plant machine ({player.plant_prod}/gen)")
    if player.energy_prod >= 5:
        parts.append(f"Energy {player.energy_prod}/gen")
    if player.heat_prod >= 4:
        parts.append(f"Heat→TR ({player.heat_prod}/gen)")
    if player.ti_prod >= 3:
        parts.append(f"Ti prod {player.ti_prod}")

    # Tag specialization
    for t, n in top_tags[:2]:
        if t not in ("building",):  # building is generic
            parts.append(f"{t}×{n}")

    # Card accumulator
    if player.cards_in_hand_n >= 15:
        parts.append(f"Hoarding {player.cards_in_hand_n} cards")

    # Threats
    if player.tr >= 30:
        parts.append(f"TR lead ({player.tr})")

    return " │ ".join(parts[:4]) if parts else "Непонятная стратегия"


def _generate_alerts(state) -> list[str]:
    """Генерирует контекстные алерты — самые важные действия прямо сейчас."""
    alerts = []
    me = state.me
    mc = me.mc

    # === Milestones ===
    for m in state.milestones:
        if m["claimed_by"]:
            continue
        my_score = m["scores"].get(me.color, {})
        if isinstance(my_score, dict) and my_score.get("claimable", False):
            claimed_count = sum(1 for mi in state.milestones if mi["claimed_by"])
            if claimed_count < 3 and mc >= 8:
                alerts.append(f"🏆 ЗАЯВИ {m['name']}! (8 MC = 5 VP)")

    # === Opponent milestone warnings ===
    cn = state.color_names
    claimed_total = sum(1 for mi in state.milestones if mi["claimed_by"])
    if claimed_total < 3:
        for m in state.milestones:
            if m["claimed_by"]:
                continue
            my_score = m["scores"].get(me.color, {})
            my_claimable = isinstance(my_score, dict) and my_score.get("claimable", False)
            for color, score_info in m["scores"].items():
                if color == me.color:
                    continue
                if isinstance(score_info, dict) and score_info.get("claimable"):
                    opp_name = cn.get(color, color)
                    if my_claimable and mc >= 8:
                        alerts.append(
                            f"⚠️ {opp_name} тоже может заявить {m['name']}! Успей первым!")
                    elif not my_claimable:
                        alerts.append(
                            f"⚠️ {opp_name} может заявить {m['name']}!")
                    break

    # === Awards ===
    funded_count = sum(1 for a in state.awards if a["funded_by"])
    if funded_count < 3:
        cost = [8, 14, 20][funded_count]
        if mc >= cost:
            best_award = None
            best_lead = 0
            for a in state.awards:
                if a["funded_by"]:
                    continue
                my_val = a["scores"].get(me.color, 0)
                opp_max = max((v for c, v in a["scores"].items() if c != me.color), default=0)
                lead = my_val - opp_max
                if lead > best_lead:
                    best_lead = lead
                    best_award = a
            if best_award and best_lead >= 2:
                alerts.append(
                    f"💰 ФОНДИРУЙ {best_award['name']}! "
                    f"({cost} MC, лидируешь +{best_lead})")

    # === Plants → Greenery ===
    if me.plants >= 8:
        alerts.append(f"🌿 Greenery из {me.plants} plants (+1 O₂, +1 TR, +1 VP)")

    # === Heat → Temperature ===
    if me.heat >= 8 and state.temperature < 8:
        alerts.append(f"🔥 TR из {me.heat} heat (+1 temp, +1 TR)")

    # === Action cards in tableau ===
    action_cards = {
        "Development Center": "потрать energy → draw card",
        "Penguins": "+1 animal (+1 VP)",
        "Local Shading": "+1 floater",
        "Red Ships": "trade action",
        "Electro Catapult": "spend plant/steel → +7 MC",
        "Inventors' Guild": "look at top card",
        "Rover Construction": "+2 MC per city placed",
        "Ceres Tech Market": "spend science → cards",
        "Self-Replicating Robots": "install card cheaper",
    }
    active_actions = []
    for c in me.tableau:
        name = c["name"]
        if name in action_cards:
            active_actions.append(f"{name}: {action_cards[name]}")
    if active_actions:
        alerts.append("🔵 Actions: " + " │ ".join(active_actions[:3]))

    # === Colony trade ===
    if state.colonies_data and me.energy >= 3:
        best_col = max(state.colonies_data, key=lambda c: c["track"])
        if best_col["track"] >= 3:
            alerts.append(f"🚀 Trade {best_col['name']} (track={best_col['track']})")

    # === TR gap warning ===
    max_opp_tr = max((o.tr for o in state.opponents), default=0)
    tr_gap = max_opp_tr - me.tr
    if tr_gap >= 8:
        alerts.append(f"⚠️ TR отставание: -{tr_gap} от лидера ({max_opp_tr})")

    # === Turmoil alerts ===
    if state.turmoil:
        t = state.turmoil
        ruling = t.get("ruling", "")
        if ruling and "Reds" in str(ruling):
            alerts.append("⛔ REDS RULING: не поднимай параметры без необходимости (-1 TR/шаг)")

        # Coming global event warning
        coming = t.get("coming")
        if coming:
            ev = GLOBAL_EVENTS.get(coming, {})
            if not ev.get("good", True):
                alerts.append(f"⚠️ Global Event (след. gen): {coming} — {ev.get('desc', '?')}")

        # Current global event
        current = t.get("current")
        if current:
            ev = GLOBAL_EVENTS.get(current, {})
            if not ev.get("good", True):
                alerts.append(f"🔴 Global Event СЕЙЧАС: {current} — {ev.get('desc', '?')}")

        # Lobby available
        my_in_lobby = me.color in t.get("lobby", [])
        if my_in_lobby and mc >= 0:
            alerts.append("📋 Делегат в lobby — можно разместить бесплатно")

    # === Game timing alert ===
    gens_est = _estimate_remaining_gens(state)
    if gens_est <= 2 and state.generation >= 5:
        alerts.append(f"⏰ ~{gens_est} gen до конца! Переключайся на VP/TR")

    return alerts


def _estimate_vp(state, player=None) -> dict:
    """Estimate VP for a player based on current state."""
    p = player or state.me
    vp = {"tr": p.tr, "greenery": 0, "city": 0, "cards": 0, "milestones": 0, "awards": 0}

    # Use victoryPointsBreakdown if available (most accurate)
    vp_breakdown = p.raw.get("victoryPointsBreakdown", {})
    if vp_breakdown:
        vp["cards"] = vp_breakdown.get("victoryPoints", 0)
        vp["greenery"] = vp_breakdown.get("greenery", 0)
        vp["city"] = vp_breakdown.get("city", 0)
        vp["awards"] = vp_breakdown.get("awards", 0)
        vp["milestones"] = vp_breakdown.get("milestones", 0)
        vp["total"] = sum(vp.values())
        return vp

    # Build a map for adjacency calculation
    space_map = {}  # (x, y) -> space
    my_cities = []
    for s in state.spaces:
        x, y = s.get("x", -1), s.get("y", -1)
        if x >= 0:
            space_map[(x, y)] = s
        if s.get("color") != p.color:
            continue
        tile = s.get("tileType")
        if tile == TILE_GREENERY:
            vp["greenery"] += 1
        elif tile == TILE_CITY:
            my_cities.append(s)

    # City VP = count adjacent greeneries (from any player)
    for city in my_cities:
        cx, cy = city.get("x", -1), city.get("y", -1)
        if cx < 0:
            continue
        adj_greenery = 0
        for nx, ny in _get_neighbors(cx, cy):
            neighbor = space_map.get((nx, ny))
            if neighbor and neighbor.get("tileType") == TILE_GREENERY:
                adj_greenery += 1
        vp["city"] += adj_greenery

    # Milestone VP
    for m in state.milestones:
        if m.get("claimed_by") == p.name:
            vp["milestones"] += 5

    # Estimate card VP from tableau resources (for our player)
    if p.is_me and p.tableau:
        for c in p.tableau:
            res = c.get("resources", 0)
            name = c.get("name", "")
            if not res:
                continue
            # Known VP per resource patterns
            if name in ("Birds", "Fish", "Livestock", "Small Animals", "Penguins",
                        "Stratospheric Birds", "Predators", "Venusian Animals",
                        "Herbivores"):
                vp["cards"] += res  # 1 VP per animal
            elif name in ("Decomposers", "Symbiotic Fungus", "Tardigrades"):
                vp["cards"] += res // 3  # 1 VP per 3 microbes
            elif name in ("Ecological Zone",):
                vp["cards"] += res // 2  # 1 VP per 2 animals
            elif name in ("Physics Complex",):
                vp["cards"] += res * 2  # 2 VP per science
            elif name in ("Security Fleet",):
                vp["cards"] += res  # 1 VP per fighter
            elif name in ("Ants",):
                vp["cards"] += res // 2  # 1 VP per 2 microbes
            elif name in ("Extremophiles",):
                vp["cards"] += res // 3
            elif name in ("Saturn Surfing", "Aerial Mappers"):
                vp["cards"] += res  # 1 VP per floater
            elif name in ("Refugee Camps",):
                vp["cards"] += res  # 1 VP per camp

        # Also add flat VP from known cards in tableau
        for c in p.tableau:
            name = c.get("name", "")
            if name in ("Search For Life",) and c.get("resources", 0) > 0:
                vp["cards"] += 3
            # Cards with flat VP (not resource-based) — handled by victoryPointsBreakdown usually

    vp["total"] = sum(vp.values())
    return vp


def _estimate_remaining_gens(state) -> int:
    """Estimate remaining generations based on global parameters progress."""
    # Steps remaining for each parameter
    temp_remaining = max(0, (8 - state.temperature) // 2)   # each step = +2°C
    o2_remaining = max(0, 14 - state.oxygen)                 # each step = +1%
    ocean_remaining = max(0, 9 - state.oceans)               # each = 1 ocean

    # Total steps remaining (game ends when ALL are maxed)
    total_remaining = temp_remaining + o2_remaining + ocean_remaining

    # Average steps per gen: depends on player count, WGT, phase
    # In 3P WGT: ~5-8 steps per gen (3 players × 1-2 TR raises + 1 WGT + side effects)
    steps_per_gen = 6 if state.is_wgt else 4
    # Early game is slower (building engine), late game faster (everyone terraforms)
    if state.generation <= 3:
        steps_per_gen = 4
    elif state.generation >= 6:
        steps_per_gen = 8

    gens = max(1, total_remaining // steps_per_gen)
    return gens


def _forecast_requirements(state, req_checker, hand: list[dict]) -> list[str]:
    """Прогноз когда карты из руки станут играбельными."""
    hints = []
    gens_left = _estimate_remaining_gens(state)
    steps_per_gen = 6 if state.is_wgt else 4

    for card in hand:
        name = card["name"]
        ok, reason = req_checker.check(name, state)
        if ok:
            continue  # already playable

        # Parse requirement to estimate when it'll be met
        req = req_checker.get_req(name)
        if not req:
            continue

        r = req.lower().strip()
        gens_needed = None

        # Temperature requirements: "X C or warmer" / "max X C"
        m = re.search(r'(-?\d+)\s*[°c]', r)
        if m and "warmer" in r:
            needed_temp = int(m.group(1))
            temp_gap = needed_temp - state.temperature
            if temp_gap > 0:
                gens_needed = max(1, temp_gap // (2 * steps_per_gen // 3 + 1))

        # Oxygen requirements: "X% oxygen"
        m = re.search(r'(\d+)%', r)
        if m and "oxygen" in r:
            needed_o2 = int(m.group(1))
            o2_gap = needed_o2 - state.oxygen
            if o2_gap > 0:
                gens_needed = max(1, o2_gap // max(1, steps_per_gen // 3))

        # Ocean requirements: "X ocean"
        m = re.search(r'(\d+)\s+ocean', r)
        if m:
            needed_oceans = int(m.group(1))
            ocean_gap = needed_oceans - state.oceans
            if ocean_gap > 0:
                gens_needed = max(1, ocean_gap // max(1, steps_per_gen // 4))

        # Venus requirements: "X% venus"
        m = re.search(r'(\d+)%?\s*venus', r)
        if m:
            needed_venus = int(m.group(1))
            venus_gap = needed_venus - state.venus
            if venus_gap > 0:
                gens_needed = max(1, venus_gap // 3)  # ~3 venus steps per gen

        if gens_needed and gens_needed <= gens_left:
            if gens_needed <= 1:
                hints.append(f"⏳ {name}: req скоро ({reason}) — ~этот gen")
            elif gens_needed <= 2:
                hints.append(f"⏳ {name}: req через ~{gens_needed} gen ({reason})")
            else:
                hints.append(f"⌛ {name}: req через ~{gens_needed} gen ({reason})")
        elif gens_needed and gens_needed > gens_left:
            hints.append(f"❌ {name}: req НЕ успеет ({reason}, ~{gens_needed} gen)")

    return hints


def _trade_optimizer(state) -> list[str]:
    """Оптимальный выбор колонии для торговли."""
    if not state.colonies_data:
        return []
    me = state.me
    hints = []

    # Can trade? Need energy >= 3 + MC for trade cost
    if me.energy < 3:
        return []

    trade_cost = 9  # default MC cost
    fleet_used = me.actions_this_gen  # rough proxy — not exact

    colony_values = []
    for col in state.colonies_data:
        name = col["name"]
        track = col.get("track", 0)
        settlers = col.get("settlers", [])
        my_settlers = settlers.count(me.color)

        # Estimate trade value based on colony type and track position
        # Higher track = more resources per trade
        base_value = track * 2  # rough MC equivalent per track level

        # Bonus for having settlers (colony bonus on trade)
        settler_bonus = my_settlers * 2

        # Known colony values
        colony_mc_values = {
            "Ceres": track * 1 + my_settlers * 2,  # steel
            "Europa": track + my_settlers * 1,  # MC-prod (very valuable early)
            "Ganymede": track * 2 + my_settlers * 2,  # plants
            "Callisto": track + my_settlers * 1,  # energy
            "Miranda": track * 2 + my_settlers * 3,  # animals (VP!)
            "Titan": track * 2 + my_settlers * 2,  # floaters
            "Enceladus": track + my_settlers * 2,  # microbes
            "Luna": track * 2 + my_settlers * 2,  # MC
            "Io": track + my_settlers * 1,  # heat
            "Triton": track + my_settlers * 2,  # titanium
            "Pluto": track * 2 + my_settlers * 1,  # cards
        }

        value = colony_mc_values.get(name, base_value + settler_bonus)
        colony_values.append((name, track, my_settlers, value))

    colony_values.sort(key=lambda x: x[3], reverse=True)

    if colony_values:
        best = colony_values[0]
        hints.append(f"🚀 Best trade: {best[0]} (track={best[1]}, "
                     f"settlers={best[2]}, value~{best[3]} MC)")
        if len(colony_values) > 1:
            second = colony_values[1]
            hints.append(f"   2nd: {second[0]} (track={second[1]}, value~{second[3]} MC)")

    return hints


def _mc_flow_projection(state) -> list[str]:
    """Прогноз MC flow на следующие 1-2 gen."""
    me = state.me
    hints = []
    gens_left = _estimate_remaining_gens(state)

    # Income per gen
    income = me.mc_prod + me.tr  # MC-prod + TR
    steel_mc = me.steel_prod * me.steel_value  # rough steel value
    ti_mc = me.ti_prod * me.ti_value  # rough ti value
    total_income = income + steel_mc + ti_mc

    # Current resources (MC equivalent)
    current_mc = me.mc + me.steel * me.steel_value + me.titanium * me.ti_value

    # Project next gen MC (after production phase)
    next_gen_mc = current_mc + income  # conservative (no steel/ti prod spent)

    if gens_left >= 2:
        gen2_mc = next_gen_mc + income
        hints.append(f"💰 MC прогноз: сейчас ~{current_mc} → "
                     f"Gen+1: ~{next_gen_mc} → Gen+2: ~{gen2_mc}"
                     f" (income: {income}/gen, +{steel_mc}st +{ti_mc}ti)")

        # How many cards can we buy+play next gen?
        avg_card_cost = 15  # rough average
        cards_affordable = next_gen_mc // avg_card_cost
        if cards_affordable >= 3:
            hints.append(f"   Можешь сыграть ~{cards_affordable} карт (avg {avg_card_cost} MC)")
    else:
        hints.append(f"💰 MC: {current_mc} (+{income}/gen) — LAST GEN, трать всё!")

    return hints


def _safe_title(wf: dict) -> str:
    """Get title from waitingFor safely — title can be str or dict."""
    t = wf.get("title", "")
    return t if isinstance(t, str) else str(t.get("message", t.get("text", "")))


# ═══════════════════════════════════════════════
# Map Placement Advisor
# ═══════════════════════════════════════════════

# Hex adjacency: for a hex grid, neighbors depend on row parity
# TM uses offset coordinates: even rows shift right, odd rows shift left
# Neighbor offsets for even-y rows (0,2,4,...) and odd-y rows (1,3,5,...)
_EVEN_Y_NEIGHBORS = [(-1, -1), (0, -1), (-1, 0), (1, 0), (-1, 1), (0, 1)]
_ODD_Y_NEIGHBORS = [(0, -1), (1, -1), (-1, 0), (1, 0), (0, 1), (1, 1)]

TILE_GREENERY = 0
TILE_OCEAN = 1
TILE_CITY = 2
BONUS_TITANIUM = 0
BONUS_STEEL = 1
BONUS_PLANT = 2
BONUS_CARD = 3
BONUS_HEAT = 4


def _get_neighbors(x: int, y: int) -> list[tuple[int, int]]:
    """Get hex neighbor coordinates for TM offset hex grid."""
    offsets = _EVEN_Y_NEIGHBORS if y % 2 == 0 else _ODD_Y_NEIGHBORS
    return [(x + dx, y + dy) for dx, dy in offsets]


def _analyze_map(state) -> dict:
    """Analyze map for placement recommendations.

    Returns dict with:
        best_city: [(id, x, y, score, reason)] top city spots
        best_greenery: [(id, x, y, score, reason)] top greenery spots
        my_cities: number of player's cities
        my_greeneries: number of player's greeneries
        total_oceans: number of placed oceans
    """
    spaces = state.spaces
    if not spaces:
        return {}

    my_color = state.me.color

    # Build lookup
    by_pos: dict[tuple[int, int], dict] = {}
    by_id: dict[str, dict] = {}
    for s in spaces:
        x, y = s.get("x", -1), s.get("y", -1)
        if x >= 0 and y >= 0:
            by_pos[(x, y)] = s
            by_id[s["id"]] = s

    # Count my tiles
    my_cities = sum(1 for s in spaces
                    if s.get("tileType") == TILE_CITY and s.get("color") == my_color)
    my_greeneries = sum(1 for s in spaces
                        if s.get("tileType") == TILE_GREENERY and s.get("color") == my_color)
    total_oceans = sum(1 for s in spaces if s.get("tileType") == TILE_OCEAN)

    # Find empty land spaces
    empty = [s for s in spaces if s.get("tileType") is None
             and s.get("spaceType") == "land" and s.get("x", -1) >= 0]

    # Score city spots: adjacency value
    city_spots = []
    for s in empty:
        x, y = s["x"], s["y"]
        score = 0
        reasons = []

        # Placement bonus
        for b in s.get("bonus", []):
            if b == BONUS_STEEL:
                score += 2
            elif b == BONUS_TITANIUM:
                score += 3
            elif b == BONUS_PLANT:
                score += 2
            elif b == BONUS_CARD:
                score += 3.5
            elif b == BONUS_HEAT:
                score += 1

        # Adjacent tile bonuses
        neighbors = _get_neighbors(x, y)
        adj_oceans = 0
        adj_greenery = 0
        adj_my_tiles = 0
        adj_empty = 0
        for nx, ny in neighbors:
            ns = by_pos.get((nx, ny))
            if not ns:
                continue
            tt = ns.get("tileType")
            if tt == TILE_OCEAN:
                adj_oceans += 1
                score += 2  # +2 MC placement bonus per adjacent ocean
            elif tt == TILE_GREENERY:
                adj_greenery += 1
                score += 1  # +1 VP per adjacent greenery (city VP)
            if ns.get("color") == my_color:
                adj_my_tiles += 1
                score += 1  # clustering bonus
            if tt is None and ns.get("spaceType") == "land":
                adj_empty += 1

        if adj_oceans:
            reasons.append(f"{adj_oceans} ocean(+{adj_oceans * 2} MC)")
        if adj_greenery:
            reasons.append(f"{adj_greenery} green(+{adj_greenery} VP)")
        if adj_my_tiles:
            reasons.append(f"near {adj_my_tiles} своих")
        if adj_empty >= 3:
            reasons.append(f"{adj_empty} пусто(room)")

        # Room for future greeneries near this city
        score += min(adj_empty, 3) * 0.5

        city_spots.append((s["id"], x, y, round(score, 1), ", ".join(reasons) or "нет бонусов"))

    city_spots.sort(key=lambda x: x[3], reverse=True)

    # Score greenery spots: prefer near own cities, next to oceans
    greenery_spots = []
    for s in empty:
        x, y = s["x"], s["y"]
        score = 0
        reasons = []

        # Must be adjacent to own tile (unless no tiles placed)
        neighbors = _get_neighbors(x, y)
        adj_my_cities = 0
        adj_oceans = 0
        near_own = False

        for nx, ny in neighbors:
            ns = by_pos.get((nx, ny))
            if not ns:
                continue
            if ns.get("color") == my_color:
                near_own = True
                if ns.get("tileType") == TILE_CITY:
                    adj_my_cities += 1
                    score += 3  # +1 VP for city adjacency
            if ns.get("tileType") == TILE_OCEAN:
                adj_oceans += 1
                score += 2  # +2 MC placement bonus

        # Placement bonus
        for b in s.get("bonus", []):
            if b == BONUS_PLANT:
                score += 2
            elif b == BONUS_STEEL:
                score += 2
            elif b == BONUS_CARD:
                score += 3.5
            elif b == BONUS_TITANIUM:
                score += 3

        if not near_own and my_cities + my_greeneries > 0:
            score -= 10  # strong penalty: greenery should be near own tiles

        if adj_my_cities:
            reasons.append(f"adj {adj_my_cities} city (+{adj_my_cities} VP)")
        if adj_oceans:
            reasons.append(f"{adj_oceans} ocean(+{adj_oceans * 2} MC)")

        greenery_spots.append((s["id"], x, y, round(score, 1), ", ".join(reasons) or ""))

    greenery_spots.sort(key=lambda x: x[3], reverse=True)

    return {
        "best_city": city_spots[:5],
        "best_greenery": greenery_spots[:5],
        "my_cities": my_cities,
        "my_greeneries": my_greeneries,
        "total_oceans": total_oceans,
    }


def _should_pass(state, playable, gens_left, phase) -> list[str]:
    """Определить, когда лучше НЕ играть карту (pass/sell patents).

    Returns list of reasons to consider passing. Empty = play freely.
    """
    reasons = []
    me = state.me
    mc = me.mc

    if not playable:
        return reasons

    best_score = playable[0][1]
    best_cost = playable[0][3]

    # 1. Milestone close — сохрани MC на milestone (8 MC = 5 VP)
    unclaimed = [m for m in state.milestones if not m.get("claimed_by")]
    claimed_count = len(state.milestones) - len(unclaimed)
    if claimed_count < 3:
        for m in unclaimed:
            my_sc = m.get("scores", {}).get(me.color, {})
            if isinstance(my_sc, dict) and my_sc.get("near", False):
                mc_after = mc - best_cost
                if mc_after < 8 and mc >= 8:
                    reasons.append(
                        f"MILESTONE: {m['name']} почти — не трать ниже 8 MC!")
                    break
            elif isinstance(my_sc, dict) and my_sc.get("claimable", False):
                reasons.append(
                    f"MILESTONE: заяви {m['name']} (8 MC = 5 VP) вместо карты!")
                break

    # 2. Award funding opportunity — сохрани MC
    funded_count = sum(1 for a in state.awards if a.get("funded_by"))
    if funded_count < 3:
        cost_award = [8, 14, 20][funded_count]
        for a in state.awards:
            if a.get("funded_by"):
                continue
            my_val = a.get("scores", {}).get(me.color, 0)
            opp_max = max((v for c, v in a.get("scores", {}).items()
                           if c != me.color), default=0)
            if my_val > opp_max and mc >= cost_award:
                mc_after = mc - best_cost
                if mc_after < cost_award:
                    reasons.append(
                        f"AWARD: фондируй {a['name']} ({cost_award} MC) — "
                        f"ты лидер (+{my_val - opp_max})!")
                    break

    # 3. Colony trade opportunity — 3 energy + 9 MC
    if state.colonies_data and me.energy >= 3:
        trades_left = 1  # simplified: assume 1 trade/gen
        best_col = max(state.colonies_data, key=lambda c: c.get("track", 0))
        if best_col.get("track", 0) >= 4 and me.mc - best_cost < 9:
            reasons.append(
                f"TRADE: {best_col['name']} (track={best_col['track']}) — "
                f"сохрани 9 MC на трейд!")

    # 4. Production card too late — не покупай production в endgame
    if phase == "endgame" and best_score < 70:
        card_data = None
        for cd in (state.cards_in_hand or []):
            if cd.get("name") == playable[0][2]:
                card_data = cd
                break
        if card_data:
            tags = card_data.get("tags", [])
            # Production cards usually have Building tag and low-mid score
            if "Building" in tags and best_score < 65:
                reasons.append(
                    "TIMING: endgame — production карты уже не отобьются!")

    # 5. Weak cards — лучше продай patents
    if best_score < 55 and len(state.cards_in_hand or []) >= 3:
        sell_value = len([c for c in (state.cards_in_hand or [])
                         if _score_to_tier(
                             state.me and playable and playable[-1][1] or 40) in ("D", "F")])
        if sell_value >= 2:
            reasons.append(
                "SELL PATENTS: слабые карты в руке — продай за MC!")

    # 6. Cash reserve for next gen — если MC мало и есть production
    if me.mc_prod >= 8 and mc - best_cost < 3 and phase != "endgame":
        reasons.append(
            f"CASH: MC-prod={me.mc_prod}, не уходи в 0 — "
            f"оставь запас на следующий gen!")

    # 7. Threshold waiting — requirements скоро выполнятся
    for t, s, n, cost in playable[1:]:  # skip the best one
        if s > best_score + 5:  # card that would be even better if playable
            pass  # placeholder for future req tracking

    return reasons


def _score_to_tier(score: int) -> str:
    if score >= 90: return "S"
    if score >= 80: return "A"
    if score >= 70: return "B"
    if score >= 55: return "C"
    if score >= 35: return "D"
    return "F"

def _parse_wf_card(card_data) -> dict:
    if isinstance(card_data, str):
        return {"name": card_data, "tags": [], "cost": 0}
    if isinstance(card_data, dict):
        return {
            "name": card_data.get("name", "???"),
            "tags": card_data.get("tags", []),
            "cost": card_data.get("calculatedCost", card_data.get("cost", 0)),
        }
    return {"name": str(card_data), "tags": [], "cost": 0}


# ═══════════════════════════════════════════════
# AdvisorBot — главный polling loop
# ═══════════════════════════════════════════════

class AdvisorBot:
    def __init__(self, player_id: str, claude_mode: bool = False, snapshot_mode: bool = False):
        self.player_id = player_id
        self.claude_mode = claude_mode
        self.snapshot_mode = snapshot_mode
        self.client = TMClient()
        eval_path = os.path.join(DATA_DIR, "evaluations.json")
        if not os.path.exists(eval_path):
            print(f"Файл не найден: {eval_path}")
            sys.exit(1)
        self.db = CardDatabase(eval_path)
        self.effect_parser = CardEffectParser(self.db)
        self.combo_detector = ComboDetector(self.effect_parser, self.db)
        self.synergy = SynergyEngine(self.db, self.combo_detector)
        self.req_checker = RequirementsChecker(os.path.join(DATA_DIR, "all_cards.json"))
        self.display = AdvisorDisplay()
        self.claude_out = ClaudeOutput(self.db, self.synergy, self.req_checker)
        self.running = True
        self._last_state_key = None
        self._draft_memory: list[dict] = []  # [{gen, passed: [names], kept: name}]
        self._last_draft_cards: list[str] = []  # track what was offered last draft

        # Offer logging — "when option" tracking
        self._offer_log_path = os.path.join(DATA_DIR, "game_logs", "offers_log.jsonl")
        self._game_log_path = os.path.join(DATA_DIR, "game_logs")  # dir for per-game logs
        self._game_session_id: str | None = None
        self._offers_logged: set = set()  # dedup (gen, phase, cards)
        self._game_ended = False
        # Detailed game state tracking
        self._prev_state_snapshot: dict | None = None  # for diffing

    def run(self):
        signal.signal(signal.SIGINT, self._shutdown)

        if not self.claude_mode:
            print(f"\n{Fore.CYAN}TM Advisor v2.0{Style.RESET_ALL}")
            print(f"  Player ID: {self.player_id[:8]}...")
            print(f"  База: {len(self.db.cards)} оценённых карт")
            print(f"  Режим: {'Claude Code' if self.claude_mode else 'Терминал'}")
            print(f"  Ctrl+C для выхода\n")

        try:
            state_data = self.client.get_player_state(self.player_id)
        except requests.HTTPError as e:
            self.display.error(f"Не удалось подключиться: {e}")
            return
        except requests.ConnectionError:
            self.display.error("Нет подключения к серверу.")
            return

        state = GameState(state_data)

        # Init game session logging
        self._init_game_session(state)
        self._diff_and_log_state(state)

        # Snapshot mode — один раз и выход
        if self.snapshot_mode:
            print(self.claude_out.format(state))
            return

        self._show_advice(state)

        # Polling loop
        while self.running:
            try:
                result = self.client.poll_waiting_for(
                    self.player_id, state.game_age, state.undo_count)
                status = result.get("result", "WAIT")

                if status in ("GO", "REFRESH"):
                    state_data = self.client.get_player_state(self.player_id)
                    state = GameState(state_data)
                    if self._state_key(state) != self._last_state_key:
                        self._diff_and_log_state(state)
                        self._show_advice(state)

                    # Detect game end
                    if state.phase == "end" and not self._game_ended:
                        self._log_game_end(state)
                        self._auto_add_game()
                        if self.claude_mode:
                            print(self.claude_out.format_postgame(state))
                        else:
                            self._show_postgame_report(state)
                else:
                    if not self.claude_mode:
                        self.display.waiting(
                            f"Ждём ход... Gen {state.generation} │ "
                            f"GameAge {state.game_age}")

                time.sleep(POLL_INTERVAL)

            except requests.Timeout:
                continue
            except requests.ConnectionError:
                self.display.error("Потеряно соединение, переподключение...")
                time.sleep(5)
            except requests.HTTPError as e:
                if e.response and e.response.status_code == 404:
                    if not self._game_ended:
                        # Try to log game end with last known state
                        try:
                            self._log_game_end(state)
                        except Exception:
                            pass
                    self.display.error("Игра не найдена или завершена.")
                    break
                self.display.error(f"HTTP ошибка: {e}")
                time.sleep(5)

    @staticmethod
    def _state_key(state: GameState):
        """Ключ для дедупликации — меняется при любом изменении game state."""
        wf = state.waiting_for
        wf_sig = (wf.get("type", ""), _safe_title(wf)) if wf else ("", "")
        return (state.game_age, state.undo_count,
                state.me.actions_this_gen, wf_sig)

    def _show_advice(self, state: GameState):
        self._last_state_key = self._state_key(state)

        # Claude mode — markdown
        if self.claude_mode:
            print("\n" + self.claude_out.format(state))
            return

        # ANSI mode
        wf = state.waiting_for
        if not wf:
            self.display.clear()
            self.display.header(state, "Ожидание")
            self.display.info("Нет активного решения. Ждём...")
            return

        wf_type = wf.get("type", "")
        title = _safe_title(wf).lower()

        if wf_type == "or":
            options = wf.get("options", [])
            inner_types = [opt.get("type", "") for opt in options]
            if "initialCards" in inner_types:
                self._advise_initial(state, wf)
            elif state.phase == "drafting":
                self._advise_draft(state, wf)
            elif state.phase == "research":
                self._advise_buy(state, wf)
            elif "projectCard" in inner_types:
                self._advise_play(state, wf)
            elif "take your next action" in title or state.phase == "action":
                self._advise_action(state, wf)
            else:
                self._advise_or(state, wf)
        elif wf_type == "initialCards":
            self._advise_initial(state, wf)
        elif wf_type == "card":
            if "draft" in title or state.phase == "drafting":
                self._advise_draft(state, wf)
            else:
                self._advise_buy(state, wf)
        elif wf_type == "projectCard":
            self._advise_play(state, wf)
        else:
            self._advise_generic(state, wf)

    # ── Начальный выбор ──

    def _advise_initial(self, state: GameState, wf: dict):
        self.display.clear()
        self.display.header(state, "Начальный выбор")

        corps = state.dealt_corps or self._extract_cards_from_wf(wf, "corporationCard")
        if corps:
            self._log_offer("initial_corp", [c["name"] for c in corps], state)
            self.display.section("Корпорации")
            rated = self._rate_cards(corps, "", state.generation, {})
            for t, s, n, nt, *_ in rated:
                info = self.db.get_info(n)
                mc = info.get("startingMegaCredits", 0) if info else 0
                mc_str = f" [{mc} MC]" if mc else ""
                self.display.card_row(t, s, n, f"{nt}{mc_str}")

        preludes = state.dealt_preludes or self._extract_cards_from_wf(wf, "preludeCard")
        if preludes:
            self._log_offer("initial_prelude", [c["name"] for c in preludes], state)
            self.display.section("Прелюдии")
            rated = self._rate_cards(preludes, "", state.generation, {})
            for t, s, n, nt, *_ in rated:
                self.display.card_row(t, s, n, nt)

        # Combo analysis: corp + prelude synergies
        best_corp = ""
        if corps and preludes and len(preludes) >= 2:
            best_corp = self._show_initial_combos(corps, preludes, state)
        elif corps:
            best_corp = corps[0]["name"] if len(corps) == 1 else ""
            rated = self._rate_cards(corps, "", state.generation, {})
            if rated:
                best_corp = rated[0][2]
                self.display.recommendation(f"Лучшая: {rated[0][2]} ({rated[0][0]}-{rated[0][1]})")

        # CEO cards
        ceos = state.dealt_ceos or self._extract_cards_from_wf(wf, "ceo")
        if ceos:
            self._log_offer("initial_ceo", [c["name"] for c in ceos], state)
            self.display.section("CEO карты")
            rated_ceos = self._rate_ceo_cards(ceos, state)
            for t, s, name, note in rated_ceos:
                self.display.card_row(t, s, name, note)
            if rated_ceos:
                self.display.recommendation(
                    f"Лучший CEO: {rated_ceos[0][2]} ({rated_ceos[0][0]}-{rated_ceos[0][1]})")

        project_cards = state.dealt_project_cards or self._extract_cards_from_wf(wf, "card")
        if project_cards:
            self._log_offer("initial_project", [c["name"] for c in project_cards], state)
            corp_hint = f" (синергия с {best_corp})" if best_corp else ""
            self.display.section(f"Проектные карты{corp_hint}")
            rated = self._rate_cards(project_cards, best_corp, state.generation, {}, state)
            for t, s, n, nt, req_ok, req_reason in rated:
                buy = "БЕРИ" if s >= 65 else "МОЖЕТ" if s >= 50 else "СКИП"
                req_mark = f" ⛔{req_reason}" if not req_ok else ""
                self.display.card_row(t, s, n, f"[{buy}] {nt}{req_mark}")
        print()

    def _show_initial_combos(self, corps, preludes, state):
        """Analyze corp+prelude combinations and return best corp name."""
        combos = []
        for corp in corps:
            corp_name = corp["name"]
            corp_score = self.db.get_score(corp_name)
            info = self.db.get_info(corp_name)
            start_mc = info.get("startingMegaCredits", 0) if info else 0

            # Rate each prelude WITH this corp's synergies
            p_scores = {}
            for p in preludes:
                p_name = p["name"]
                p_tags = p.get("tags", [])
                adj = self.synergy.adjusted_score(p_name, p_tags, corp_name, 1, {})
                base = self.db.get_score(p_name)
                p_scores[p_name] = (adj, adj - base)

            # All prelude pairs
            for p1, p2 in combinations(preludes, 2):
                n1, n2 = p1["name"], p2["name"]
                s1, b1 = p_scores[n1]
                s2, b2 = p_scores[n2]
                total = corp_score + s1 + s2
                syn = b1 + b2
                combos.append((total, syn, corp_name, corp_score, n1, s1, n2, s2, start_mc))

        combos.sort(key=lambda x: x[0], reverse=True)

        self.display.section("Лучшие комбо (корп + 2 прелюдии)")
        for i, (total, syn, cn, cs, p1, s1, p2, s2, mc) in enumerate(combos[:3]):
            star = "★" if i == 0 else "●"
            ct = _score_to_tier(cs)
            t1 = _score_to_tier(s1)
            t2 = _score_to_tier(s2)
            syn_str = f"  {Fore.GREEN}synergy +{syn}{Style.RESET_ALL}" if syn > 0 else ""
            color = Fore.GREEN + Style.BRIGHT if i == 0 else Fore.WHITE
            print(f"  {color}{star} {cn} ({ct}-{cs}) + {p1} ({t1}-{s1}) + {p2} ({t2}-{s2}){Style.RESET_ALL}")
            print(f"    Σ {total}  │  Start: {mc} MC{syn_str}")

        if combos:
            best = combos[0]
            self.display.recommendation(
                f"КОМБО: {best[2]} + {best[4]} + {best[6]}")
            return best[2]
        return ""

    # ── Драфт ──

    def _advise_draft(self, state: GameState, wf: dict):
        self.display.clear()
        self.display.header(state, "Драфт")
        self.display.resources_bar(state)

        cards = self._extract_cards_list(wf)
        if cards:
            current_names = [c["name"] for c in cards]

            # Log draft offer
            self._log_offer("draft", current_names, state)

            # Draft memory: detect what was taken from previous offer
            if self._last_draft_cards:
                prev_set = set(self._last_draft_cards)
                curr_set = set(current_names)
                # Cards from previous pack that are NOT in current = we kept one, rest went left
                # But we see a NEW pack (from the right), so the pack we see now is different
                # The pack we passed = previous minus what we kept
                if prev_set != curr_set:
                    # We kept something from the previous pack
                    kept = prev_set - curr_set
                    if len(kept) == 1:
                        kept_name = kept.pop()
                        passed = [n for n in self._last_draft_cards if n != kept_name]
                        self._draft_memory.append({
                            "gen": state.generation,
                            "kept": kept_name,
                            "passed": passed,
                        })
                        # Log draft pick
                        self._log_offer("draft_pick", [kept_name], state,
                                        extra={"passed": passed})

            self._last_draft_cards = current_names

            # Phase-aware draft tip
            gens_left = _estimate_remaining_gens(state)
            phase = game_phase(gens_left, state.generation)
            if phase == "endgame":
                print(f"  {Fore.RED}⚠️ Финал ({gens_left} gen)! Бери ТОЛЬКО VP/TR. Production бесполезна.{Style.RESET_ALL}")
            elif phase == "late":
                print(f"  {Fore.YELLOW}Поздняя фаза ({gens_left} gen left): VP > Production. Дорогие engine — скип.{Style.RESET_ALL}")
            elif phase == "early":
                print(f"  {Fore.GREEN}Engine фаза: Production и дискаунты максимально ценны!{Style.RESET_ALL}")

            self.display.section("Выбери одну карту:")
            rated = self._rate_cards(cards, state.corp_name, state.generation, state.tags, state)
            for t, s, n, nt, req_ok, req_reason in rated:
                req_mark = f" ⛔{req_reason}" if not req_ok else ""
                # Show card cost for budget awareness
                card_info = self.db.get_info(n)
                cost = card_info.get("cost", 0) if card_info else 0
                cost_str = f" [{cost}MC]" if cost > 0 else ""
                self.display.card_row(t, s, n, f"{nt}{cost_str}{req_mark}", adjusted=True)
            # Combo hints for draft cards
            self._show_combos(state, cards)

            # Лучшая играбельная
            best_playable = next((r for r in rated if r[4]), None)
            if best_playable:
                self.display.recommendation(f"Бери: {best_playable[2]} ({best_playable[0]}-{best_playable[1]})")

            # Show draft memory — what we passed to opponents
            if self._draft_memory:
                passed_strong = []
                for mem in self._draft_memory:
                    if mem["gen"] == state.generation:
                        for p in mem["passed"]:
                            sc = self.db.get_score(p)
                            if sc >= 65:
                                passed_strong.append(f"{p}({sc})")
                if passed_strong:
                    print(f"  {Fore.YELLOW}⚠️ Передано соседу: {', '.join(passed_strong)}{Style.RESET_ALL}")

        self._show_game_context(state)
        print()

    # ── Покупка ──

    def _advise_buy(self, state: GameState, wf: dict):
        self.display.clear()
        self.display.header(state, "Покупка карт")
        self.display.resources_bar(state)

        gens_left = _estimate_remaining_gens(state)
        phase = game_phase(gens_left, state.generation)
        me = state.me

        cards = self._extract_cards_list(wf)
        if cards:
            self._log_offer("buy", [c["name"] for c in cards], state)
            self.display.section(f"Карты (3 MC каждая, MC: {me.mc}):")
            rated = self._rate_cards(cards, state.corp_name, state.generation, state.tags, state)
            affordable = me.mc // 3

            # Endgame filter: only buy cards you can PLAY this gen
            for i, (t, s, n, nt, req_ok, req_reason) in enumerate(rated):
                cd = next((c for c in cards if c["name"] == n), {})
                play_cost = cd.get("cost", 0)
                total_cost = 3 + play_cost  # buy + play

                if not req_ok:
                    buy = "⛔REQ"
                elif phase == "endgame" and s < 70:
                    buy = "СКИП⏰"  # endgame: skip mediocre cards
                elif phase == "endgame" and total_cost > me.mc:
                    buy = "СКИП💰"  # can't afford to play it
                elif s >= 60 and i < affordable:
                    buy = "БЕРИ"
                else:
                    buy = "СКИП"

                note = f"[{buy}] {nt}"
                if not req_ok:
                    note += f" ({req_reason})"
                elif phase == "endgame" and total_cost <= me.mc and s >= 55:
                    note += f" (buy+play={total_cost} MC)"
                self.display.card_row(t, s, n, note, adjusted=True)

            # Combo hints for buy phase
            self._show_combos(state, cards)

            buy_list = [r[2] for r in rated if r[1] >= 60 and r[4]][:affordable]

            # Phase-specific warnings
            if phase == "endgame":
                playable_buy = [r[2] for r in rated
                                if r[1] >= 65 and r[4]
                                and (3 + next((c for c in cards if c["name"] == r[2]), {}).get("cost", 999)) <= me.mc]
                if playable_buy:
                    self.display.recommendation(
                        f"Купи+сыграй: {', '.join(playable_buy[:3])}")
                else:
                    print(f"  {Fore.MAGENTA}💡 ENDGAME: не покупай карт которые не сыграешь!{Style.RESET_ALL}")
                    self.display.recommendation("Пропусти все — сохрани MC!")
            elif buy_list:
                self.display.recommendation(f"Купи: {', '.join(buy_list)}")
            else:
                self.display.recommendation("Пропусти все.")

        self._show_game_context(state)
        print()

    # ── Действие ──

    def _advise_action(self, state: GameState, wf: dict):
        self.display.clear()
        self.display.header(state, "Действие")
        self.display.resources_bar(state)

        hand = state.cards_in_hand
        gens_left = _estimate_remaining_gens(state)
        phase = game_phase(gens_left, state.generation)
        me = state.me

        if hand:
            self.display.section("Карты в руке:")
            rated = self._rate_cards(hand, state.corp_name, state.generation, state.tags, state)
            for t, s, n, nt, req_ok, req_reason in rated:
                cd = next((c for c in hand if c["name"] == n), {})
                cost = cd.get("cost", 0)
                if not req_ok:
                    mark = f"⛔ {req_reason}"
                elif cost <= me.mc:
                    mark = f"✓ {cost} MC"
                else:
                    mark = f"✗ {cost} MC"
                self.display.card_row(t, s, n, f"[{mark}] {nt}", adjusted=True)

        # === Combo Detection ===
        self._show_combos(state, hand)

        self._show_or_options(wf)

        # === Generation Plan ===
        self._show_gen_plan(state, hand, gens_left, phase)

        self._show_game_context(state)

        # === Умная рекомендация с "не играй" логикой ===
        if hand:
            rated = self._rate_cards(hand, state.corp_name, state.generation, state.tags, state)
            playable = []
            for t, s, n, _, req_ok, _ in rated:
                cd = next((c for c in hand if c["name"] == n), {})
                cost = cd.get("cost", 0)
                if req_ok and cost <= me.mc:
                    playable.append((t, s, n, cost))

            # Причины НЕ играть карты
            dont_play_reasons = _should_pass(state, playable, gens_left, phase)

            if dont_play_reasons:
                for reason in dont_play_reasons:
                    print(f"  {Fore.MAGENTA}{Style.BRIGHT}💡 {reason}{Style.RESET_ALL}")

            if playable and playable[0][1] >= 60 and not dont_play_reasons:
                self.display.recommendation(
                    f"Сыграй: {playable[0][2]} ({playable[0][0]}-{playable[0][1]})")
            elif playable and playable[0][1] >= 60 and dont_play_reasons:
                self.display.recommendation(
                    f"Можно: {playable[0][2]} ({playable[0][0]}-{playable[0][1]}), "
                    f"но рассмотри PASS")
            elif not playable or playable[0][1] < 55:
                # Рекомендуй SP или pass
                sp_list = sp_efficiency(gens_left)
                best_sp = next(
                    ((n, r, g) for n, r, g in sp_list
                     if STANDARD_PROJECTS[n]["cost"] <= me.mc and r >= 0.45), None)
                if best_sp:
                    self.display.recommendation(
                        f"SP: {best_sp[0]} ({STANDARD_PROJECTS[best_sp[0]]['cost']} MC)")
                elif len(hand) > 3:
                    self.display.recommendation("SELL PATENTS — продай слабые карты за MC")
                else:
                    self.display.recommendation("PASS — пропусти ход")
        print()

    # ── Combo Detection Display ──

    def _show_combos(self, state: GameState, hand: list[dict]):
        """Показать обнаруженные комбо между tableau и рукой."""
        if not hasattr(self, 'combo_detector') or not self.combo_detector:
            return
        tableau_names = [c["name"] for c in state.me.tableau]
        hand_names = [c["name"] for c in hand] if hand else []
        if not tableau_names and not hand_names:
            return

        combos = self.combo_detector.analyze_tableau_combos(
            tableau_names, hand_names, state.tags
        )
        if not combos:
            return

        # Filter: only show combos with value > 0 or active engines
        interesting = [c for c in combos if c["value_bonus"] > 0 or c["type"] == "active_engine"]
        if not interesting:
            return

        self.display.section("🔗 Синергии:")
        shown = 0
        for combo in interesting[:6]:
            ct = combo["type"]
            desc = combo["description"]
            val = combo["value_bonus"]

            if ct == "active_engine":
                icon = "⚙️"
                color = Fore.CYAN
            elif ct in ("resource_target", "resource_adder", "scaling_placement"):
                icon = "🎯"
                color = Fore.GREEN
            elif ct == "tag_scaling":
                icon = "📈"
                color = Fore.YELLOW
            elif ct == "trigger":
                icon = "⚡"
                color = Fore.MAGENTA
            elif ct == "discount":
                icon = "💰"
                color = Fore.BLUE
            else:
                icon = "🔗"
                color = Fore.WHITE

            bonus_str = f" [+{val}]" if val > 0 else ""
            print(f"    {icon} {color}{desc}{bonus_str}{Style.RESET_ALL}")
            shown += 1

        if len(interesting) > 6:
            print(f"    {Fore.WHITE}{Style.DIM}...и ещё {len(interesting) - 6} синергий{Style.RESET_ALL}")

    # ── Generation Plan ──

    def _show_gen_plan(self, state, hand, gens_left, phase):
        """Составить и показать план действий на текущий generation."""
        me = state.me
        mc = me.mc

        plan_steps = []
        mc_budget = mc  # track spending

        # 1. Priority: claim milestones
        unclaimed = [m for m in state.milestones if not m.get("claimed_by")]
        claimed_count = len(state.milestones) - len(unclaimed)
        if claimed_count < 3 and mc_budget >= 8:
            for m in unclaimed:
                my_sc = m.get("scores", {}).get(me.color, {})
                if isinstance(my_sc, dict) and my_sc.get("claimable", False):
                    plan_steps.append(
                        (1, f"🏆 Заяви milestone {m['name']} (8 MC = 5 VP)", 8))
                    mc_budget -= 8
                    break

        # 2. Priority: fund award if leading
        funded_count = sum(1 for a in state.awards if a.get("funded_by"))
        if funded_count < 3:
            cost_award = [8, 14, 20][funded_count]
            if mc_budget >= cost_award:
                for a in state.awards:
                    if a.get("funded_by"):
                        continue
                    my_val = a.get("scores", {}).get(me.color, 0)
                    opp_max = max((v for c, v in a.get("scores", {}).items()
                                   if c != me.color), default=0)
                    if my_val > opp_max + 1:
                        plan_steps.append(
                            (2, f"💰 Fund award {a['name']} ({cost_award} MC, лид +{my_val - opp_max})", cost_award))
                        mc_budget -= cost_award
                        break

        # 3. Blue card actions
        action_cards = []
        for c in me.tableau:
            name = c.get("name", "")
            if c.get("isDisabled"):
                continue
            # Known action cards
            known_actions = {
                "Development Center": "energy → card",
                "Physics Complex": "6 energy → science VP",
                "Penguins": "+1 animal = +1 VP",
                "Red Ships": "trade action",
                "Electro Catapult": "plant/steel → 7 MC",
                "Search For Life": "reveal → 3 VP",
                "Stratospheric Birds": "+1 floater",
                "Sulphur-Eating Bacteria": "3 microbe → 3 MC",
                "GHG Producing Bacteria": "+1 microbe",
                "Local Shading": "+1 floater / -1 float → +1 MC-prod",
                "Extremophiles": "+1 microbe",
                "Ceres Tech Market": "science → cards",
                "Orbital Cleanup": "Space tags → MC",
                "Restricted Area": "2 MC → draw card",
                "Rover Construction": "+2 MC per city",
            }
            if name in known_actions:
                action_cards.append(f"🔵 {name}: {known_actions[name]}")

        if action_cards:
            for ac in action_cards[:4]:
                plan_steps.append((3, ac, 0))

        # 4. Play cards from hand — prioritized
        if hand:
            rated = self._rate_cards(hand, state.corp_name, state.generation, state.tags, state)
            for t, s, n, nt, req_ok, req_reason in rated:
                cd = next((c for c in hand if c["name"] == n), {})
                cost = cd.get("cost", 0)
                if not req_ok:
                    continue
                if cost > mc_budget:
                    plan_steps.append(
                        (6, f"❌ {n} ({t}-{s}) — не хватает MC ({cost} > {mc_budget})", 0))
                    continue
                if s >= 65:
                    plan_steps.append(
                        (4, f"▶ Сыграй {n} ({t}-{s}, {cost} MC) — {nt}", cost))
                    mc_budget -= cost
                elif s >= 55 and phase != "endgame":
                    plan_steps.append(
                        (5, f"▷ Можно {n} ({t}-{s}, {cost} MC) — {nt}", cost))

        # 5. Convert resources
        if me.plants >= 8:
            plan_steps.append((3, f"🌿 Greenery из {me.plants} plants (1 TR + 1 VP)", 0))
        if me.heat >= 8 and state.temperature < 8:
            plan_steps.append((3, f"🔥 Temperature из {me.heat} heat (1 TR)", 0))

        # 6. Colony trade
        if state.colonies_data and me.energy >= 3 and mc_budget >= 9:
            best_col = max(state.colonies_data, key=lambda c: c.get("track", 0))
            if best_col.get("track", 0) >= 3:
                plan_steps.append(
                    (3, f"🚀 Trade {best_col['name']} (track={best_col['track']}, 9 MC+3 energy)", 9))

        # 7. Standard projects
        sp_list = sp_efficiency(gens_left)
        for sp_name, ratio, gives in sp_list:
            sp_cost = STANDARD_PROJECTS[sp_name]["cost"]
            if sp_cost <= mc_budget and ratio >= 0.5 and len(plan_steps) < 12:
                plan_steps.append(
                    (7, f"🔨 SP: {sp_name} ({sp_cost} MC) → {gives}", sp_cost))

        # 8. Sell patents (weak cards)
        if hand:
            rated = self._rate_cards(hand, state.corp_name, state.generation, state.tags, state)
            weak = [(n, s) for _, s, n, _, _, _ in rated if s < 45]
            if weak:
                names = ", ".join(n for n, _ in weak[:3])
                plan_steps.append(
                    (8, f"📤 Продай patents: {names} (+{len(weak)} MC)", 0))

        # Display plan
        if plan_steps:
            plan_steps.sort(key=lambda x: x[0])
            self.display.section(f"📋 План на Gen {state.generation} (MC: {mc}→~{mc_budget}):")
            for priority, step, cost in plan_steps[:10]:
                cost_str = f" [{cost} MC]" if cost > 0 else ""
                print(f"    {step}{cost_str}")

    # ── Розыгрыш ──

    def _advise_play(self, state: GameState, wf: dict):
        self._advise_action(state, wf)

    # ── Or / Generic ──

    def _advise_or(self, state: GameState, wf: dict):
        self.display.clear()
        self.display.header(state, "Выбор")
        self.display.resources_bar(state)
        self._show_or_options(wf)
        self._show_game_context(state)
        print()

    def _advise_generic(self, state: GameState, wf: dict):
        self.display.clear()
        self.display.header(state, wf.get("type", "???"))
        self.display.resources_bar(state)
        title = _safe_title(wf)
        if title:
            self.display.section(title)
        self._show_or_options(wf)
        self._show_game_context(state)
        print()

    # ── Game context (milestones, awards, colonies, opponents) ──

    def _show_game_context(self, state: GameState):
        """Показать стратегию, алерты, milestones, awards, colonies, opponents, SP."""
        # Стратегические советы по фазе игры
        tips = strategy_advice(state)
        if tips:
            self.display.section("📊 Стратегия:")
            for tip in tips:
                print(f"  {Fore.CYAN}{tip}{Style.RESET_ALL}")

        # Контекстные алерты — самое важное
        alerts = _generate_alerts(state)
        if alerts:
            self.display.section("⚡ Рекомендации:")
            for alert in alerts:
                print(f"  {Fore.YELLOW}{Style.BRIGHT}{alert}{Style.RESET_ALL}")

        # Standard projects efficiency (если в action phase)
        gens_left = _estimate_remaining_gens(state)
        sp_list = sp_efficiency(gens_left)
        affordable_sps = [(n, r, g) for n, r, g in sp_list
                          if STANDARD_PROJECTS[n]["cost"] <= state.mc and r >= 0.45]
        if affordable_sps:
            self.display.section("🔨 Стандартные проекты:")
            for name, ratio, gives in affordable_sps[:4]:
                cost = STANDARD_PROJECTS[name]["cost"]
                eff = "отлично" if ratio >= 0.6 else "ок" if ratio >= 0.5 else "слабо"
                print(f"    {name:<18s} {cost:2d} MC → {gives:<30s} [{eff}]")

        # Requirement forecasting for hand cards
        if state.cards_in_hand:
            req_hints = _forecast_requirements(state, self.req_checker, state.cards_in_hand)
            if req_hints:
                self.display.section("⏳ Прогноз requirements:")
                for h in req_hints[:5]:
                    print(f"    {h}")

        # Trade optimizer
        if state.has_colonies and state.me.energy >= 3:
            trade_hints = _trade_optimizer(state)
            if trade_hints:
                for h in trade_hints:
                    print(f"  {Fore.CYAN}{h}{Style.RESET_ALL}")

        # MC flow projection
        mc_hints = _mc_flow_projection(state)
        if mc_hints:
            for h in mc_hints:
                print(f"  {Fore.WHITE}{Style.DIM}{h}{Style.RESET_ALL}")

        # CEO OPG timing advice
        if state.has_ceos:
            self._show_ceo_opg_advice(state)

        # Planetary tracks (Pathfinders)
        if state.has_pathfinders:
            self._show_planetary_tracks(state)

        self.display.milestones_table(state)
        self.display.awards_table(state)
        if state.has_turmoil:
            self.display.turmoil_table(state)
        if state.has_colonies:
            self.display.colonies_table(state)
        self.display.map_table(state)
        self.display.opponents_table(state)

    def _show_ceo_opg_advice(self, state: GameState):
        """Show timing advice for CEO's once-per-game action."""
        # Find current CEO from tableau
        ceo_name = None
        for card in state.me.tableau:
            name = card.get("name", "")
            if self.db.is_ceo(name):
                ceo_name = name
                break
        if not ceo_name:
            return

        ceo = self.db.get_ceo(ceo_name)
        if not ceo or not ceo.get("opgAction"):
            return  # Ongoing-only CEO, no OPG to time

        gen = state.generation
        gens_left = _estimate_remaining_gens(state)
        opg = ceo["opgAction"]

        # Build timing advice based on CEO mechanics
        advice = self._ceo_timing_advice(ceo_name, ceo, state, gen, gens_left)
        if advice:
            self.display.section(f"👤 CEO {ceo_name}:")
            for line in advice:
                print(f"    {Fore.MAGENTA}{line}{Style.RESET_ALL}")

    @staticmethod
    def _ceo_timing_advice(name: str, ceo: dict, state: GameState,
                           gen: int, gens_left: int) -> list[str]:
        """Generate timing advice for specific CEO OPG action."""
        opg = ceo.get("opgAction", "")
        lines = []

        # ── Scaling with generation (X = gen number) ──
        # Bjorn: steal X+2 MC from richer players
        if name == "Bjorn":
            steal_per = gen + 2
            lines.append(f"OPG: steal {steal_per} MC/player (gen {gen})")
            if gens_left <= 2:
                lines.append(f"ИСПОЛЬЗУЙ СЕЙЧАС! Последние gens, max value = {steal_per} MC × opponents")
            elif gen >= 5:
                lines.append(f"Хороший момент: {steal_per} MC с каждого богаче тебя")
            else:
                lines.append(f"Подожди — на gen {gen+2} будет {gen+4} MC/player")

        # Duncan: gain 7-X VP and 4X MC
        elif name == "Duncan":
            vp = max(0, 7 - gen)
            mc = 4 * gen
            lines.append(f"OPG сейчас: {vp} VP + {mc} MC (gen {gen})")
            if gen <= 2:
                lines.append(f"РАНО для MC! VP={vp} хорош, но MC мало")
            elif gen == 3:
                lines.append(f"Баланс: {vp} VP + {mc} MC — хороший момент")
            elif gens_left <= 2:
                lines.append(f"ИСПОЛЬЗУЙ! MC = {mc}, VP уже 0")
            else:
                next_vp = max(0, 7 - gen - 1)
                next_mc = 4 * (gen + 1)
                lines.append(f"Следующий gen: {next_vp} VP + {next_mc} MC")

        # Floyd: play card for 13+2X less
        elif name == "Floyd":
            discount = 13 + 2 * gen
            lines.append(f"OPG: -{discount} MC на карту (gen {gen})")
            if gens_left <= 1:
                lines.append("ПОСЛЕДНИЙ ШАНС! Используй на самую дорогую карту в руке")
            elif discount >= 25:
                lines.append("Отличный дискаунт! Сыграй самую дорогую карту")
            else:
                lines.append(f"Подожди — на gen {gen+1} будет -{discount+2} MC")

        # Ender: discard up to 2X to draw that many
        elif name == "Ender":
            max_swap = 2 * gen
            lines.append(f"OPG: обменяй до {max_swap} карт (gen {gen})")
            if gens_left <= 2:
                lines.append("ИСПОЛЬЗУЙ! Сбрось ненужные, найди VP-карты")
            elif max_swap >= 8:
                lines.append("Хороший масштаб для рефреша руки")

        # Karen: draw X preludes, play 1
        elif name == "Karen":
            lines.append(f"OPG: выбери из {gen} прелюдий (gen {gen})")
            if gen >= 4:
                lines.append("Хороший выбор! Но прелюдии слабее поздно")
            elif gen <= 2:
                lines.append("Мало выбора, но прелюдия ценнее рано")
            if gens_left <= 2:
                lines.append("ИСПОЛЬЗУЙ СЕЙЧАС — потом будет поздно для прелюдий!")

        # Ryu: swap X+2 production units
        elif name == "Ryu":
            swaps = gen + 2
            lines.append(f"OPG: переставь до {swaps} production (gen {gen})")
            if gens_left <= 2:
                lines.append("Поздно для production swap! Используй если есть heat→MC")
            elif gen >= 3 and gen <= 5:
                lines.append("Хороший момент — ещё будут gen-ы для новой production")

        # ── State-dependent OPGs ──
        # Ulrich: 4 MC per ocean
        elif name == "Ulrich":
            oceans = state.oceans
            mc_now = 4 * oceans if oceans < 9 else 15
            lines.append(f"OPG: {mc_now} MC ({oceans} океанов × 4)")
            if oceans >= 7:
                lines.append(f"ИСПОЛЬЗУЙ! {mc_now} MC — отличная сумма")
            elif oceans >= 9:
                lines.append(f"Все океаны → только 15 MC (cap)")
            else:
                lines.append(f"Подожди — при 9 океанах будет 36 MC")

        # Clarke: +1 plant/heat prod, gain prod+4 each
        elif name == "Clarke":
            plant_p = state.me.plant_prod
            heat_p = state.me.heat_prod
            lines.append(f"OPG: {plant_p+5} plants + {heat_p+5} heat + prod (gen {gen})")
            if gens_left <= 2:
                lines.append("Production поздно, но ресурсы полезны!")
            elif plant_p >= 3 or heat_p >= 3:
                lines.append("Хорошее production → большой burst ресурсов")

        # HAL9000: -1 each prod, +4 each resource
        elif name == "HAL9000":
            me = state.me
            prods = {"MC": me.mc_prod, "Steel": me.steel_prod, "Ti": me.ti_prod,
                     "Plant": me.plant_prod, "Energy": me.energy_prod, "Heat": me.heat_prod}
            active = sum(1 for v in prods.values() if v > 0)
            lines.append(f"OPG: -1 каждая prod ({active} активных), +4 каждого ресурса")
            if gens_left <= 1:
                lines.append("ИСПОЛЬЗУЙ! Production уже не нужна, ресурсы — да")
            elif gens_left <= 2:
                lines.append("Хороший момент — sacrifice prod для burst")

        # Stefan: sell cards for 3 MC each
        elif name == "Stefan":
            hand_size = len(state.cards_in_hand)
            lines.append(f"OPG: продай карты по 3 MC ({hand_size} в руке = {hand_size*3} MC)")
            if gens_left <= 1 and hand_size >= 3:
                lines.append(f"ИСПОЛЬЗУЙ! Сбрось ненужное за {hand_size*3} MC")

        # Jansson: gain all placement bonuses under tiles
        elif name == "Jansson":
            tiles = sum(1 for s in state.spaces
                        if s.get("color") == state.me.color and s.get("tileType") is not None)
            lines.append(f"OPG: бонусы под твоими {tiles} тайлами повторно")
            if tiles >= 5:
                lines.append("Много тайлов — хороший момент!")
            elif gens_left <= 2:
                lines.append("Финал близко, используй пока можешь")

        # Generic for all other OPGs
        if not lines:
            short = opg.replace("Once per game, ", "")[:80]
            lines.append(f"OPG: {short}")
            if gens_left <= 1:
                lines.append("ИСПОЛЬЗУЙ! Последний шанс!")
            elif "generation number" in opg.lower():
                lines.append(f"Скейлится с gen ({gen}) — позже = сильнее")

        return lines

    def _show_planetary_tracks(self, state: GameState):
        """Show Pathfinders planetary track progress. Uses real API data when available."""
        tracks = self.db.planetary_tracks
        if not tracks:
            return

        TRACK_ICONS = {
            "venus": "♀", "earth": "🌍", "mars": "♂",
            "jovian": "♃", "moon": "☽",
        }

        rows = []
        for track_name, track_data in tracks.items():
            # Skip tracks not in game
            if track_name == "venus" and not state.has_venus:
                continue
            if track_name == "moon" and not state.has_moon:
                continue

            my_tags = state.me.tags.get(track_name, 0)
            max_pos = track_data.get("maxPosition", 0)

            # Use real API position if available, otherwise estimate from tags
            if state.planetary_tracks and track_name in state.planetary_tracks:
                position = state.planetary_tracks[track_name]
            else:
                # Fallback: estimate from all players' tags
                total_tags = my_tags
                for opp in state.opponents:
                    total_tags += opp.tags.get(track_name, 0)
                position = min(total_tags, max_pos)

            icon = TRACK_ICONS.get(track_name, "")

            # Find next bonus
            bonuses = track_data.get("bonuses", [])
            next_bonus = None
            for b in bonuses:
                if b["position"] > position:
                    next_bonus = b
                    break

            if next_bonus:
                tags_needed = next_bonus["position"] - position
                rising = ", ".join(next_bonus.get("risingPlayer", []))
                everyone = ", ".join(next_bonus.get("everyone", []))
                bonus_str = f"@{next_bonus['position']}: rise={rising} all={everyone} ({tags_needed} tags away)"
            else:
                bonus_str = "MAX"

            rows.append(f"  {icon} {track_name.capitalize():<7s} [{position:2d}/{max_pos}] "
                        f"my={my_tags} │ {bonus_str}")

        if rows:
            self.display.section("🛤️ Планетарные треки:")
            for r in rows:
                print(f"  {Fore.CYAN}{r}{Style.RESET_ALL}")

    def _show_or_options(self, wf: dict):
        options = wf.get("options", [])
        if not options:
            return
        self.display.section("Доступные действия:")
        for i, opt in enumerate(options, 1):
            label = opt.get("buttonLabel") or _safe_title(opt) or opt.get("type", "?")
            if not isinstance(label, str):
                label = str(label)
            print(f"    {i}. {label}")

    # ── CEO оценка ──

    def _rate_ceo_cards(self, ceos: list[dict], state: GameState) -> list[tuple]:
        """Rate CEO cards. Returns [(tier, score, name, note)]."""
        # CEO evaluation heuristics (no evaluations.json entries yet)
        results = []
        for card in ceos:
            name = card["name"]
            # Check if we have an evaluation
            ev = self.db.get(name)
            if ev:
                score = ev["score"]
            else:
                score = self._estimate_ceo_score(name, state)
            tier = _score_to_tier(score)
            note = self._get_ceo_note(name)
            results.append((tier, score, name, note))
        results.sort(key=lambda x: x[1], reverse=True)
        return results

    def _estimate_ceo_score(self, name: str, state: GameState) -> int:
        """Heuristic CEO score based on action type and compatibility."""
        ceo = self.db.get_ceo(name)
        if not ceo:
            return 50

        score = 60  # baseline

        # Ongoing effect is very strong (persistent value)
        if ceo.get("actionType") == "OPG + Ongoing":
            score += 10

        # Compatibility check — penalize if expansion not in game
        compat = ceo.get("compatibility")
        if compat:
            compat_map = {
                "moon": state.has_moon,
                "colonies": state.has_colonies,
                "venus": state.has_venus,
                "turmoil": state.has_turmoil,
                "ares": "ares" in state.board_name.lower(),
                "pathfinders": state.has_pathfinders,
            }
            if not compat_map.get(compat, True):
                score -= 25  # heavy penalty — can't use main ability

        # Heuristic bonuses based on OPG text
        opg = (ceo.get("opgAction") or "").lower()
        if "draw" in opg and "card" in opg:
            score += 5  # card draw is always good
        if "gain" in opg and "m€" in opg:
            score += 3  # MC is universally good
        if "production" in opg:
            score += 4  # production boost
        if "tr" in opg:
            score += 3
        if "steal" in opg:
            score -= 3  # take-that penalty in 3P
        if "opponent" in opg and ("lose" in opg or "decrease" in opg):
            score -= 3  # take-that

        return max(20, min(95, score))

    def _get_ceo_note(self, name: str) -> str:
        """Get a concise note for CEO card display."""
        ceo = self.db.get_ceo(name)
        if not ceo:
            return "нет данных"
        parts = []
        opg = ceo.get("opgAction", "")
        ongoing = ceo.get("ongoingEffect", "")
        compat = ceo.get("compatibility")
        if compat:
            parts.append(f"[{compat.upper()}]")
        if ceo.get("actionType") == "OPG + Ongoing":
            parts.append("OPG+Ong")
        else:
            parts.append("OPG")
        # Truncate OPG description
        if opg:
            short = opg.replace("Once per game, ", "").replace("Once per game ", "")
            parts.append(short[:55])
        return " │ ".join(parts)

    # ── Утилиты ──

    def _rate_cards(self, cards, corp_name, generation, tags, state=None):
        """Returns [(tier, score, name, note, req_ok, req_reason)]"""
        results = []
        for card in cards:
            name = card["name"]
            card_tags = card.get("tags", [])
            if corp_name:
                score = self.synergy.adjusted_score(name, card_tags, corp_name, generation, tags, state)
            else:
                score = self.db.get_score(name)
            tier = _score_to_tier(score)
            note = self._get_note(name)
            if state:
                req_ok, req_reason = self.req_checker.check(name, state)
            else:
                req_ok, req_reason = True, ""
            results.append((tier, score, name, note, req_ok, req_reason))
        results.sort(key=lambda x: x[1], reverse=True)
        return results

    def _get_note(self, name):
        card = self.db.get(name)
        if card:
            economy = card.get("economy", "")
            if economy:
                return economy.split(".")[0][:50]
        # Fallback to card description from all_cards
        desc = self.db.get_desc(name)
        if desc:
            return desc[:55]
        return "нет данных" if not card else ""

    def _extract_cards_list(self, wf):
        cards = wf.get("cards", [])
        if cards:
            return [_parse_wf_card(c) for c in cards]
        for opt in wf.get("options", []):
            cards = opt.get("cards", [])
            if cards:
                return [_parse_wf_card(c) for c in cards]
        return []

    def _extract_cards_from_wf(self, wf, card_type):
        cards = wf.get("cards", [])
        if cards:
            return [_parse_wf_card(c) for c in cards]
        for opt in wf.get("options", []):
            if card_type in opt.get("type", ""):
                cards = opt.get("cards", [])
                if cards:
                    return [_parse_wf_card(c) for c in cards]
        return []

    # ── Offer & Game Logging ──

    def _init_game_session(self, state: GameState):
        """Инициализирует game session ID и per-game лог при первом подключении."""
        player_names = sorted([state.me.name] + [o.name for o in state.opponents])
        self._game_session_id = f"g{state.game_age}_{state.me.name}"
        os.makedirs(self._game_log_path, exist_ok=True)

        # Per-game detail log
        safe_id = re.sub(r'[^\w\-]', '_', self._game_session_id)
        self._detail_log_path = os.path.join(
            self._game_log_path, f"game_{safe_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl")

        # Log game start
        self._log_game_event("game_start", {
            "players": player_names,
            "player_count": 1 + len(state.opponents),
            "board": state.board_name,
            "wgt": state.is_wgt,
            "draft": state.is_draft,
            "colonies": state.has_colonies,
            "turmoil": state.has_turmoil,
            "venus": state.has_venus,
            "pathfinders": state.has_pathfinders,
            "ceos": state.has_ceos,
        })

    def _log_offer(self, phase: str, card_names: list[str], state: GameState, extra: dict = None):
        """Логирует предложение карт в JSONL (offers_log)."""
        if not card_names or not self._game_session_id:
            return
        dedup_key = (state.generation, phase, tuple(sorted(card_names)))
        if dedup_key in self._offers_logged:
            return
        self._offers_logged.add(dedup_key)

        entry = {
            "ts": datetime.now().isoformat(),
            "game_id": self._game_session_id,
            "player": state.me.name,
            "phase": phase,
            "gen": state.generation,
            "cards": card_names,
            "player_count": 1 + len(state.opponents),
        }
        if extra:
            entry.update(extra)

        os.makedirs(os.path.dirname(self._offer_log_path), exist_ok=True)
        with open(self._offer_log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def _log_game_event(self, event_type: str, data: dict):
        """Логирует детальное событие в per-game лог."""
        if not self._game_session_id:
            return
        entry = {
            "ts": datetime.now().isoformat(),
            "game_id": self._game_session_id,
            "event": event_type,
        }
        entry.update(data)

        log_path = getattr(self, '_detail_log_path', None)
        if not log_path:
            return
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def _snapshot_state(self, state: GameState) -> dict:
        """Снимок состояния игры для диффа."""
        players = {}
        for p in [state.me] + state.opponents:
            players[p.name] = {
                "corp": p.corp,
                "tr": p.tr,
                "mc": p.mc,
                "steel": p.raw.get("steel", 0),
                "titanium": p.raw.get("titanium", 0),
                "plants": p.raw.get("plants", 0),
                "energy": p.raw.get("energy", 0),
                "heat": p.raw.get("heat", 0),
                "cards": p.raw.get("handSize", p.raw.get("cardsInHandNbr", 0)),
                "actions": p.raw.get("actionsThisGeneration", []),
                "tags": dict(p.tags) if hasattr(p, 'tags') and isinstance(p.tags, dict) else {},
                "tableau": [c if isinstance(c, str) else c.get("name", "?")
                            for c in (p.raw.get("tableau", []) or [])],
            }
        return {
            "gen": state.generation,
            "oxygen": state.oxygen,
            "temperature": state.temperature,
            "oceans": state.oceans,
            "venus": state.venus,
            "phase": state.phase,
            "players": players,
        }

    def _diff_and_log_state(self, state: GameState):
        """Сравнивает текущий стейт с предыдущим и логирует изменения."""
        snap = self._snapshot_state(state)
        prev = self._prev_state_snapshot
        self._prev_state_snapshot = snap

        if prev is None:
            self._log_game_event("state_snapshot", snap)
            return

        changes = {}

        # Global parameter changes
        for param in ("oxygen", "temperature", "oceans", "venus", "gen"):
            if snap.get(param) != prev.get(param):
                changes[param] = {"from": prev.get(param), "to": snap.get(param)}

        # Phase change
        if snap.get("phase") != prev.get("phase"):
            changes["phase"] = {"from": prev.get("phase"), "to": snap.get("phase")}

        # Per-player changes
        player_changes = {}
        for name, psnap in snap["players"].items():
            pprev = prev.get("players", {}).get(name, {})
            pc = {}
            # New cards in tableau (played)
            prev_tableau = set(pprev.get("tableau", []))
            curr_tableau = set(psnap.get("tableau", []))
            new_played = curr_tableau - prev_tableau
            if new_played:
                pc["played"] = list(new_played)
            # TR change
            if psnap.get("tr", 0) != pprev.get("tr", 0):
                pc["tr"] = {"from": pprev.get("tr"), "to": psnap.get("tr")}
            # Resource changes
            for res in ("mc", "steel", "titanium", "plants", "energy", "heat"):
                if psnap.get(res, 0) != pprev.get(res, 0):
                    pc[res] = {"from": pprev.get(res, 0), "to": psnap.get(res, 0)}
            # Hand size change
            if psnap.get("cards", 0) != pprev.get("cards", 0):
                pc["hand_size"] = {"from": pprev.get("cards", 0), "to": psnap.get("cards", 0)}
            if pc:
                player_changes[name] = pc

        if changes or player_changes:
            event = {"gen": state.generation, "phase": state.phase}
            if changes:
                event["global_changes"] = changes
            if player_changes:
                event["player_changes"] = player_changes
            self._log_game_event("state_diff", event)

    def _log_game_end(self, state: GameState):
        """Логирует конец игры."""
        if self._game_ended:
            return
        self._game_ended = True

        # Tableau extraction
        def get_tableau(p):
            raw_tab = p.raw.get("tableau", []) or []
            return [c if isinstance(c, str) else c.get("name", "?") for c in raw_tab]

        all_players = [state.me] + state.opponents
        # Winner
        best = max(all_players,
                   key=lambda p: p.raw.get("victoryPointsBreakdown", {}).get("total", 0))

        # Offers log entry
        entry = {
            "ts": datetime.now().isoformat(),
            "game_id": self._game_session_id,
            "player": state.me.name,
            "phase": "game_end",
            "gen": state.generation,
            "corp": state.me.corp,
            "tableau": get_tableau(state.me),
            "vp": state.me.raw.get("victoryPointsBreakdown", {}).get("total", 0),
            "winner": best.name,
            "player_count": 1 + len(state.opponents),
        }
        os.makedirs(os.path.dirname(self._offer_log_path), exist_ok=True)
        with open(self._offer_log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

        # Detailed game end log
        players_summary = {}
        for p in all_players:
            vp_bd = p.raw.get("victoryPointsBreakdown", {})
            players_summary[p.name] = {
                "corp": p.corp,
                "vp_total": vp_bd.get("total", 0),
                "vp_breakdown": vp_bd,
                "tr": p.tr,
                "tableau": get_tableau(p),
                "tags": dict(p.tags) if hasattr(p, 'tags') and isinstance(p.tags, dict) else {},
            }
        self._log_game_event("game_end", {
            "gen": state.generation,
            "winner": best.name,
            "players": players_summary,
        })

    def _show_postgame_report(self, state: GameState):
        """Выводит post-game разбор в терминал."""
        all_players = [state.me] + state.opponents
        vp_data = {}
        for p in all_players:
            bd = p.raw.get("victoryPointsBreakdown", {})
            vp_data[p.name] = {
                "total": bd.get("total", 0),
                "tr": bd.get("terraformRating", p.tr),
                "cards": bd.get("victoryPoints", 0),
                "greenery": bd.get("greenery", 0),
                "city": bd.get("city", 0),
                "milestones": bd.get("milestones", 0),
                "awards": bd.get("awards", 0),
                "details_cards": {d["cardName"]: d["victoryPoint"]
                                  for d in bd.get("detailsCards", [])},
            }

        # Sort by total VP
        ranked = sorted(all_players, key=lambda p: vp_data[p.name]["total"], reverse=True)
        winner = ranked[0]

        W = self.display.W
        line = "═" * W
        print(f"\n{Fore.CYAN}{line}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}  POST-GAME REPORT — Gen {state.generation}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}{line}{Style.RESET_ALL}")

        # ── Scoreboard ──
        self.display.section("── Scoreboard ──")
        for i, p in enumerate(ranked):
            v = vp_data[p.name]
            marker = f"{Fore.YELLOW}★{Style.RESET_ALL}" if i == 0 else " "
            name_col = f"{Fore.WHITE}{Style.BRIGHT}{p.name}{Style.RESET_ALL}" if i == 0 else p.name
            corp_str = f" ({p.corp})" if p.corp != "???" else ""
            print(f"  {marker} {name_col:<20s}{corp_str}")
            print(f"      {v['total']:3d} VP  "
                  f"(TR:{v['tr']}  Cards:{v['cards']}  "
                  f"Green:{v['greenery']}  City:{v['city']}  "
                  f"MS:{v['milestones']}  AW:{v['awards']})")

        # ── Мои лучшие карты по VP ──
        my_vp = vp_data[state.me.name]
        card_vps = my_vp["details_cards"]
        if card_vps:
            self.display.section("── Мои лучшие карты ──")
            sorted_cards = sorted(card_vps.items(), key=lambda x: x[1], reverse=True)
            for name, vp_val in sorted_cards:
                if vp_val <= 0:
                    continue
                score = self.db.get_score(name)
                tier = self.db.get_tier(name)
                # Find resources on this card
                res_str = ""
                for tc in state.me.tableau:
                    if tc["name"] == name and tc.get("resources", 0) > 0:
                        res_str = f" ({tc['resources']} res)"
                        break
                tc_color = TIER_COLORS.get(tier, "")
                print(f"    +{vp_val} VP  {name:<30s}{res_str}"
                      f"  {tc_color}[{tier}-{score}]{Style.RESET_ALL}")

        # ── Мёртвые карты (0 VP, cost > 10) ──
        dead_cards = []
        for tc in state.me.tableau:
            name = tc["name"]
            card_info = self.db.get_info(name)
            cost = card_info.get("cost", 0) if card_info else 0
            vp_val = card_vps.get(name, 0)
            if vp_val == 0 and cost > 10:
                res = tc.get("resources", 0)
                score = self.db.get_score(name)
                tier = self.db.get_tier(name)
                dead_cards.append((name, cost, res, score, tier))

        if dead_cards:
            self.display.section("── Мёртвые карты (0 VP, cost > 10) ──")
            for name, cost, res, score, tier in dead_cards:
                tc_color = TIER_COLORS.get(tier, "")
                res_str = f", {res} res" if res else ""
                print(f"    {Fore.YELLOW}⚠{Style.RESET_ALL} {name} ({cost} MC) "
                      f"— 0 VP{res_str}  "
                      f"{tc_color}[{tier}-{score}]{Style.RESET_ALL}")

        # ── Статистика ──
        self.display.section("── Статистика ──")
        tableau_size = len(state.me.tableau)
        total_cards_vp = my_vp["cards"]
        vp_per_card = total_cards_vp / tableau_size if tableau_size > 0 else 0
        print(f"    Сыграно карт: {tableau_size} │ "
              f"VP от карт: {total_cards_vp} │ "
              f"VP/card: {vp_per_card:.2f}")
        print(f"    Greenery: {my_vp['greenery']} VP │ "
              f"Cities: {my_vp['city']} VP │ "
              f"TR: {my_vp['tr']}")
        print(f"    Milestones: {my_vp['milestones']} VP │ "
              f"Awards: {my_vp['awards']} VP │ "
              f"Total: {my_vp['total']} VP")

        # ── Milestones & Awards ──
        ms_parts = []
        for m in state.milestones:
            if m.get("claimed_by"):
                ms_parts.append(f"★ {m['name']} ({m['claimed_by']})")
        aw_parts = []
        for aw in state.awards:
            if aw.get("funded_by"):
                aw_parts.append(f"★ {aw['name']} (funded: {aw['funded_by']})")

        if ms_parts or aw_parts:
            self.display.section("── Milestones & Awards ──")
            if ms_parts:
                print(f"    MS: {' │ '.join(ms_parts)}")
            if aw_parts:
                print(f"    AW: {' │ '.join(aw_parts)}")

        # ── Сравнение оценок с реальностью ──
        overrated = []
        underrated = []
        for tc in state.me.tableau:
            name = tc["name"]
            score = self.db.get_score(name)
            tier = self.db.get_tier(name)
            vp_val = card_vps.get(name, 0)
            card_info = self.db.get_info(name)
            cost = card_info.get("cost", 0) if card_info else 0
            if score >= 70 and vp_val == 0 and cost > 8:
                overrated.append((name, score, tier, cost))
            elif score <= 55 and vp_val >= 3:
                underrated.append((name, score, tier, vp_val))

        if overrated or underrated:
            self.display.section("── Оценка vs реальность ──")
            for name, score, tier, cost in overrated:
                tc_color = TIER_COLORS.get(tier, "")
                print(f"    {Fore.RED}▼{Style.RESET_ALL} {name} "
                      f"{tc_color}[{tier}-{score}]{Style.RESET_ALL} "
                      f"— 0 VP при cost {cost} MC (переоценена?)")
            for name, score, tier, vp_val in underrated:
                tc_color = TIER_COLORS.get(tier, "")
                print(f"    {Fore.GREEN}▲{Style.RESET_ALL} {name} "
                      f"{tc_color}[{tier}-{score}]{Style.RESET_ALL} "
                      f"— {vp_val} VP (недооценена?)")

        print(f"\n{'─' * W}\n")

    def _auto_add_game(self):
        """Автоматически добавляет завершённую игру в games_db."""
        try:
            record = resolve_game(self.player_id)
            if not record:
                return
            if record.get("phase") != "end":
                return
            db = load_db()
            game_id = record["game_id"]
            if game_id in db["games"]:
                return  # уже есть
            db["games"][game_id] = record
            save_db(db)
            winner = next((p for p in record["players"] if p.get("winner")), None)
            w_name = winner["name"] if winner else "?"
            w_vp = winner["total_vp"] if winner else 0
            print(f"\n  {Fore.GREEN}✓ Игра {game_id} автоматически сохранена в БД "
                  f"(Gen {record['generation']}, Winner: {w_name} {w_vp}VP){Style.RESET_ALL}")
        except Exception as e:
            print(f"\n  {Fore.YELLOW}⚠ Auto-add не удался: {e}{Style.RESET_ALL}")

    def _shutdown(self, sig, frame):
        print(f"\n\n{Fore.YELLOW}Выход...{Style.RESET_ALL}\n")
        self.running = False
        sys.exit(0)


# ═══════════════════════════════════════════════
# SpyMode — полный обзор всех игроков (multi-ID)
# ═══════════════════════════════════════════════

class SpyMode:
    """Режим полного обзора: видит руки, драфт и стратегию ВСЕХ игроков."""

    def __init__(self, player_ids: list[str]):
        self.player_ids = player_ids
        self.client = TMClient()
        eval_path = os.path.join(DATA_DIR, "evaluations.json")
        self.db = CardDatabase(eval_path)
        self.effect_parser = CardEffectParser(self.db)
        self.combo_detector = ComboDetector(self.effect_parser, self.db)
        self.synergy = SynergyEngine(self.db, self.combo_detector)
        self.req_checker = RequirementsChecker(os.path.join(DATA_DIR, "all_cards.json"))
        self.display = AdvisorDisplay()
        self.running = True
        self._last_key = None

    def run(self):
        signal.signal(signal.SIGINT, self._shutdown)
        print(f"\n{Fore.CYAN}TM Advisor — SPY MODE{Style.RESET_ALL}")
        print(f"  {len(self.player_ids)} player IDs loaded")
        print(f"  База: {len(self.db.cards)} карт │ Ctrl+C для выхода\n")

        self._show_all()

        while self.running:
            try:
                # Poll first player's game for changes
                first_state = self._fetch_state(self.player_ids[0])
                if not first_state:
                    time.sleep(3)
                    continue
                key = (first_state.game_age, first_state.undo_count,
                       first_state.phase, first_state.generation)
                if key != self._last_key:
                    self._show_all()
                else:
                    self.display.waiting(
                        f"Ждём... Gen {first_state.generation} │ {first_state.phase}")
                time.sleep(POLL_INTERVAL)
            except requests.ConnectionError:
                time.sleep(5)
            except requests.HTTPError as e:
                if e.response and e.response.status_code == 404:
                    print(f"\n{Fore.RED}Игра завершена.{Style.RESET_ALL}")
                    break
                time.sleep(5)

    def _fetch_state(self, pid: str) -> GameState | None:
        try:
            data = self.client.get_player_state(pid)
            return GameState(data)
        except Exception:
            return None

    def _show_all(self):
        """Fetch all players and show comprehensive analysis."""
        states: list[GameState] = []
        for pid in self.player_ids:
            st = self._fetch_state(pid)
            if st:
                states.append(st)

        if not states:
            self.display.error("Не удалось загрузить ни одного игрока")
            return

        ref = states[0]  # reference for global params
        self._last_key = (ref.game_age, ref.undo_count, ref.phase, ref.generation)

        self.display.clear()

        # Header
        line = "═" * 72
        mods = []
        if ref.has_colonies: mods.append("Col")
        if ref.has_turmoil: mods.append("Turm")
        if ref.has_venus: mods.append("Ven")
        if ref.is_wgt: mods.append("WGT")
        mod_str = "+".join(mods) if mods else "base"

        print(f"\n{Fore.CYAN}{line}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}  SPY MODE — Gen {ref.generation} ({ref.phase})"
              f"  [{ref.board_name}] {mod_str}{Style.RESET_ALL}")
        print(f"{Fore.CYAN}  O₂:{ref.oxygen}% T:{ref.temperature}°C"
              f" Oceans:{ref.oceans}/9"
              f"{f' Venus:{ref.venus}%' if ref.has_venus else ''}"
              f" │ Deck:{ref.deck_size}"
              f" │ ~{_estimate_remaining_gens(ref)} gens left{Style.RESET_ALL}")
        print(f"{Fore.CYAN}{line}{Style.RESET_ALL}")

        # Turmoil
        if ref.has_turmoil and ref.turmoil:
            self.display.turmoil_table(ref)

        # Each player (FULL)
        for i, st in enumerate(states):
            me = st.me
            pc = COLOR_MAP.get(me.color, "")
            label = f"  Игрок {i + 1}" if i > 0 else "  ★ МОЙ ИГРОК"

            vp = _estimate_vp(st)
            print(f"\n{pc}{'━' * 68}{Style.RESET_ALL}")
            print(f"  {pc}{Style.BRIGHT}{label}: {me.name} ({me.corp}){Style.RESET_ALL}"
                  f"  TR:{me.tr} │ VP:~{vp['total']}")

            # Resources
            print(f"  {Fore.YELLOW}MC:{me.mc}(+{me.mc_prod})"
                  f"  St:{me.steel}(+{me.steel_prod}) val={me.steel_value}"
                  f"  Ti:{me.titanium}(+{me.ti_prod}) val={me.ti_value}{Style.RESET_ALL}")
            print(f"  {Fore.GREEN}Pl:{me.plants}(+{me.plant_prod})"
                  f"  En:{me.energy}(+{me.energy_prod})"
                  f"  Heat:{me.heat}(+{me.heat_prod}){Style.RESET_ALL}")

            # Tags
            tags_str = ", ".join(f"{t}:{n}" for t, n in me.tags.items() if n > 0)
            if tags_str:
                print(f"  Tags: {tags_str}")

            # Strategy
            strategy = _detect_strategy(me)
            if strategy:
                print(f"  {Fore.YELLOW}⚡ Стратегия: {strategy}{Style.RESET_ALL}")

            # Influence (Turmoil)
            if ref.has_turmoil:
                print(f"  Influence: {me.influence}")

            # TABLEAU (played cards with scores)
            if me.tableau:
                print(f"\n  {Style.BRIGHT}Tableau ({len(me.tableau)} карт):{Style.RESET_ALL}")
                for c in me.tableau:
                    name = c["name"]
                    score = self.db.get_score(name)
                    tier = self.db.get_tier(name)
                    tc = TIER_COLORS.get(tier, "")
                    res_str = f" ({c['resources']} res)" if c.get("resources") else ""
                    if score:
                        print(f"    {tc}{tier}-{score:2d}{Style.RESET_ALL} {name}{res_str}")
                    else:
                        print(f"    {'?':>4s} {name}{res_str}")

            # HAND (cards in hand — only visible from this player's perspective)
            if st.cards_in_hand:
                print(f"\n  {Style.BRIGHT}Рука ({len(st.cards_in_hand)} карт):{Style.RESET_ALL}")
                rated = []
                for card in st.cards_in_hand:
                    name = card["name"]
                    card_tags = card.get("tags", [])
                    score = self.synergy.adjusted_score(
                        name, card_tags, me.corp, ref.generation, me.tags, st)
                    tier = _score_to_tier(score)
                    cost = card.get("cost", 0)
                    req_ok, req_reason = self.req_checker.check(name, st)
                    rated.append((tier, score, name, cost, req_ok, req_reason))
                rated.sort(key=lambda x: x[1], reverse=True)
                for tier, score, name, cost, req_ok, req_reason in rated:
                    tc = TIER_COLORS.get(tier, "")
                    afford = "✓" if cost <= me.mc else "✗"
                    req_mark = f" ⛔{req_reason}" if not req_ok else ""
                    # Show card description for unknown cards
                    desc_hint = ""
                    if score == 50 and tier == "?":
                        desc = self.db.get_desc(name)
                        if desc:
                            desc_hint = f"\n      {Fore.WHITE}{Style.DIM}{desc[:70]}{Style.RESET_ALL}"
                    print(f"    {tc}{tier}-{score:2d}{Style.RESET_ALL}"
                          f" {name:<30s} {afford}{cost:3d} MC{req_mark}{desc_hint}")

            # DRAFT / DEALT (if in initial selection or draft phase)
            if st.dealt_corps:
                print(f"\n  {Style.BRIGHT}Dealt Corps:{Style.RESET_ALL}")
                for c in st.dealt_corps:
                    s = self.db.get_score(c["name"])
                    t = self.db.get_tier(c["name"])
                    tc = TIER_COLORS.get(t, "")
                    print(f"    {tc}{t}-{s or '?'}{Style.RESET_ALL} {c['name']}")

            if st.dealt_preludes:
                print(f"\n  {Style.BRIGHT}Dealt Preludes:{Style.RESET_ALL}")
                for c in st.dealt_preludes:
                    s = self.db.get_score(c["name"])
                    t = self.db.get_tier(c["name"])
                    tc = TIER_COLORS.get(t, "")
                    print(f"    {tc}{t}-{s or '?'}{Style.RESET_ALL} {c['name']}")

            if st.dealt_ceos:
                print(f"\n  {Style.BRIGHT}Dealt CEOs:{Style.RESET_ALL}")
                for c in st.dealt_ceos:
                    name = c["name"]
                    ceo = self.db.get_ceo(name)
                    action = ""
                    if ceo:
                        at = ceo.get("actionType", "")
                        short = (ceo.get("opgAction") or ceo.get("ongoingEffect") or "")[:60]
                        action = f" [{at}] {short}"
                    print(f"    {Fore.MAGENTA}{name}{Style.RESET_ALL}{action}")

            # WaitingFor
            wf = st.waiting_for
            if wf:
                wf_type = wf.get("type", "")
                title = _safe_title(wf)
                print(f"\n  {Fore.CYAN}Ждёт: {title} ({wf_type}){Style.RESET_ALL}")

                # Cards in waitingFor (draft picks etc)
                wf_cards = []
                for c in wf.get("cards", []):
                    wf_cards.append(_parse_wf_card(c))
                for opt in wf.get("options", []):
                    for c in opt.get("cards", []):
                        wf_cards.append(_parse_wf_card(c))
                if wf_cards:
                    print(f"  {Style.BRIGHT}Карты на выбор:{Style.RESET_ALL}")
                    for card in wf_cards:
                        name = card["name"]
                        s = self.synergy.adjusted_score(
                            name, card.get("tags", []), me.corp,
                            ref.generation, me.tags, st)
                        t = _score_to_tier(s)
                        tc = TIER_COLORS.get(t, "")
                        print(f"    {tc}{t}-{s:2d}{Style.RESET_ALL} {name}")

        # Milestones & Awards (from ref state)
        self.display.milestones_table(ref)
        self.display.awards_table(ref)
        if ref.has_colonies:
            self.display.colonies_table(ref)

        print()

    def _shutdown(self, sig, frame):
        print(f"\n{Fore.YELLOW}Выход...{Style.RESET_ALL}")
        self.running = False
        sys.exit(0)


# ═══════════════════════════════════════════════
# main
# ═══════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="TM Advisor — советник для Terraforming Mars")
    parser.add_argument("player_id", help="Player ID (pXXX) или Game ID (gXXX) из URL игры")
    parser.add_argument("--spy", nargs="*", default=None,
                        help="SPY mode: без аргументов = авто (нужен game ID), или доп. player IDs")
    parser.add_argument("--claude", action="store_true",
                        help="Markdown вывод для Claude Code (AI анализ)")
    parser.add_argument("--snapshot", action="store_true",
                        help="Один snapshot и выход (для --claude)")
    args = parser.parse_args()

    if args.spy is not None:
        if args.spy:
            # Manual IDs provided
            all_ids = [args.player_id] + args.spy
        else:
            # Auto-discover all player IDs
            print(f"{Fore.CYAN}Автопоиск player IDs...{Style.RESET_ALL}")
            client = TMClient()
            all_ids = client.discover_all_player_ids(args.player_id)
            if not all_ids:
                print(f"{Fore.RED}Не удалось найти игроков{Style.RESET_ALL}")
                return
            print(f"{Fore.GREEN}Найдено {len(all_ids)} игроков{Style.RESET_ALL}")
        SpyMode(all_ids).run()
    else:
        player_id = args.player_id
        # If game ID given, resolve to first player
        if player_id.startswith("g"):
            print(f"{Fore.CYAN}Game ID → ищу player ID...{Style.RESET_ALL}")
            client = TMClient()
            game_info = client.get_game_info(player_id)
            if game_info and "players" in game_info:
                player_id = game_info["players"][0]["id"]
                print(f"{Fore.GREEN}Играю за: {game_info['players'][0]['name']} ({player_id[:12]}...){Style.RESET_ALL}")
            else:
                print(f"{Fore.RED}Не удалось получить game info{Style.RESET_ALL}")
                return
        bot = AdvisorBot(player_id, claude_mode=args.claude, snapshot_mode=args.snapshot)
        bot.run()


if __name__ == "__main__":
    main()
