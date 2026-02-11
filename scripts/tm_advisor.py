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
from typing import Optional

import requests
from colorama import init, Fore, Style

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

    @staticmethod
    def _normalize(name: str) -> str:
        return re.sub(r"[^a-z0-9]", "", name.lower())

    def get(self, name: str) -> Optional[dict]:
        if name in self.cards:
            return self.cards[name]
        norm = self._normalize(name)
        canonical = self._norm_index.get(norm)
        return self.cards[canonical] if canonical else None

    def get_score(self, name: str) -> int:
        card = self.get(name)
        return card["score"] if card else 50

    def get_tier(self, name: str) -> str:
        card = self.get(name)
        return card["tier"] if card else "?"


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
    def __init__(self, db: CardDatabase):
        self.db = db

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
        self.board_name = opts.get("boardName", "tharsis")
        self.is_wgt = opts.get("fastModeOption", False) or opts.get("solarPhaseOption", False)

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
                for color, info in m["scores"].items():
                    s = info["score"] if isinstance(info, dict) else info
                    all_scores[color] = s

                my_val = all_scores.get(my_color, 0)
                opp_closest = max((s for c, s in all_scores.items() if c != my_color), default=0)

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
                    if opp_closest >= threshold:
                        # Show who else can claim
                        claimers = [cn.get(c, c) for c, s in all_scores.items()
                                    if c != my_color and s >= threshold]
                        mark += f" {Fore.RED}⚠️ {', '.join(claimers)} тоже может!{Style.RESET_ALL}"
                elif slots_left <= 0:
                    mark = f"{Fore.RED}ЗАКРЫТО{Style.RESET_ALL}"
                else:
                    if threshold > 0 and my_val >= threshold - 1:
                        mark = f"{Fore.YELLOW}ПОЧТИ!{Style.RESET_ALL}"
                    elif opp_closest >= threshold:
                        claimers = [cn.get(c, c) for c, s in all_scores.items()
                                    if c != my_color and s >= threshold]
                        mark = f"{Fore.RED}⚠️ {', '.join(claimers)} может заявить!{Style.RESET_ALL}"
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
                res_str = f" ({c['resources']} res)" if c.get("resources") else ""
                a(f"- {c['name']}{res_str}")
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

    # Count greeneries and cities from map
    for s in state.spaces:
        if s.get("color") != p.color:
            continue
        tile = s.get("tileType")
        if tile == 0:  # greenery
            vp["greenery"] += 1
        elif tile == 2:  # city
            # Count adjacent greeneries (any player)
            # We'd need adjacency data - approximate with 1 VP per city
            vp["city"] += 1  # rough estimate, real depends on greenery adjacency

    # Milestone VP
    for m in state.milestones:
        if m.get("claimed_by") == p.name:
            vp["milestones"] += 5

    # Award VP (from victoryPointsBreakdown if available)
    vp_breakdown = p.raw.get("victoryPointsBreakdown", {})
    if vp_breakdown:
        vp["cards"] = vp_breakdown.get("victoryPoints", 0)
        vp["greenery"] = vp_breakdown.get("greenery", 0)
        vp["city"] = vp_breakdown.get("city", 0)
        vp["awards"] = vp_breakdown.get("awards", 0)
        vp["milestones"] = vp_breakdown.get("milestones", 0)

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
        self.synergy = SynergyEngine(self.db)
        self.req_checker = RequirementsChecker(os.path.join(DATA_DIR, "all_cards.json"))
        self.display = AdvisorDisplay()
        self.claude_out = ClaudeOutput(self.db, self.synergy, self.req_checker)
        self.running = True
        self._last_state_key = None

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
                        self._show_advice(state)
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
            self.display.section("Корпорации")
            rated = self._rate_cards(corps, "", state.generation, {})
            for t, s, n, nt, *_ in rated:
                self.display.card_row(t, s, n, nt)
            if rated:
                self.display.recommendation(f"Лучшая: {rated[0][2]} ({rated[0][0]}-{rated[0][1]})")

        preludes = state.dealt_preludes or self._extract_cards_from_wf(wf, "preludeCard")
        if preludes:
            self.display.section("Прелюдии")
            rated = self._rate_cards(preludes, "", state.generation, {})
            for t, s, n, nt, *_ in rated:
                self.display.card_row(t, s, n, nt)
            if len(rated) >= 2:
                self.display.recommendation(
                    f"Лучшие: {rated[0][2]} ({rated[0][0]}-{rated[0][1]})"
                    f" + {rated[1][2]} ({rated[1][0]}-{rated[1][1]})")

        project_cards = state.dealt_project_cards or self._extract_cards_from_wf(wf, "card")
        if project_cards:
            self.display.section("Проектные карты")
            rated = self._rate_cards(project_cards, "", state.generation, {}, state)
            for t, s, n, nt, req_ok, req_reason in rated:
                buy = "БЕРИ" if s >= 65 else "МОЖЕТ" if s >= 50 else "СКИП"
                req_mark = f" ⛔{req_reason}" if not req_ok else ""
                self.display.card_row(t, s, n, f"[{buy}] {nt}{req_mark}")
        print()

    # ── Драфт ──

    def _advise_draft(self, state: GameState, wf: dict):
        self.display.clear()
        self.display.header(state, "Драфт")
        self.display.resources_bar(state)

        cards = self._extract_cards_list(wf)
        if cards:
            self.display.section("Выбери одну карту:")
            rated = self._rate_cards(cards, state.corp_name, state.generation, state.tags, state)
            for t, s, n, nt, req_ok, req_reason in rated:
                req_mark = f" ⛔{req_reason}" if not req_ok else ""
                self.display.card_row(t, s, n, f"{nt}{req_mark}", adjusted=True)
            # Лучшая играбельная
            best_playable = next((r for r in rated if r[4]), None)
            if best_playable:
                self.display.recommendation(f"Бери: {best_playable[2]} ({best_playable[0]}-{best_playable[1]})")

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

        self.display.milestones_table(state)
        self.display.awards_table(state)
        if state.has_turmoil:
            self.display.turmoil_table(state)
        if state.has_colonies:
            self.display.colonies_table(state)
        self.display.map_table(state)
        self.display.opponents_table(state)

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
        if not card:
            return "нет данных"
        economy = card.get("economy", "")
        if economy:
            return economy.split(".")[0][:50]
        return ""

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
        self.synergy = SynergyEngine(self.db)
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
                    print(f"    {tc}{tier}-{score:2d}{Style.RESET_ALL}"
                          f" {name:<30s} {afford}{cost:3d} MC{req_mark}")

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
    parser.add_argument("player_id", help="Player ID из URL игры")
    parser.add_argument("--spy", nargs="*", default=None,
                        help="SPY mode: доп. player IDs (видит руки всех)")
    parser.add_argument("--claude", action="store_true",
                        help="Markdown вывод для Claude Code (AI анализ)")
    parser.add_argument("--snapshot", action="store_true",
                        help="Один snapshot и выход (для --claude)")
    args = parser.parse_args()

    if args.spy is not None:
        all_ids = [args.player_id] + args.spy
        SpyMode(all_ids).run()
    else:
        bot = AdvisorBot(args.player_id, claude_mode=args.claude, snapshot_mode=args.snapshot)
        bot.run()


if __name__ == "__main__":
    main()
