"""CardDatabase — загрузка и поиск карт из JSON-файлов."""

import json
import os
import re
from typing import Optional

from .constants import DATA_DIR


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
