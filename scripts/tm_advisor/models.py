"""Модели данных: CardEffect, PlayerInfo, GameState."""

import re
from typing import Optional


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

        # Game & player IDs
        self.game_id = self.game.get("id", "")
        self.player_ids: dict[str, str] = {}  # color -> player_id
        for p in data.get("players", []):
            color = p.get("color", "?")
            pid = p.get("id", "")
            if pid:
                self.player_ids[color] = pid

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
