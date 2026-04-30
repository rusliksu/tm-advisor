"""CardDatabase — загрузка и поиск карт из JSON-файлов."""

import json
import os
import re
from pathlib import Path
from typing import Optional

from .shared_data import resolve_data_path
from .shared_data import load_generated_extension_object, load_json_file


class CardDatabase:
    def __init__(self, evaluations_path: str):
        raw = load_json_file(evaluations_path)
        self.cards: dict[str, dict] = {}
        self._norm_index: dict[str, str] = {}
        for name, data in raw.items():
            self.cards[name] = dict(data) if isinstance(data, dict) else data
            self._norm_index[self._normalize(name)] = name

        self.locale_strings_ru: dict[str, str] = self._load_tm_ru_locale_strings()
        self.advisor_notes_ru: dict[str, str] = {}
        self._norm_advisor_notes_ru: dict[str, str] = {}
        advisor_notes_path = resolve_data_path("advisor_notes_ru.json")
        if advisor_notes_path.exists():
            raw_notes = load_json_file(advisor_notes_path)
            if isinstance(raw_notes, dict):
                for name, note in raw_notes.items():
                    if not isinstance(name, str):
                        continue
                    note_str = note if isinstance(note, str) else str(note)
                    if not note_str.strip():
                        continue
                    self.advisor_notes_ru[name] = note_str.strip()
                    self._norm_advisor_notes_ru[self._normalize(name)] = name

        self.generated_card_descriptions: dict[str, str] = load_generated_extension_object(
            "card_descriptions.js", "TM_CARD_DESCRIPTIONS"
        )
        self.generated_card_effects: dict[str, dict] = load_generated_extension_object(
            "card_effects.json.js", "TM_CARD_EFFECTS"
        )

        self.localized_descriptions_ru: dict[str, str] = {}
        self._norm_localized_descriptions_ru: dict[str, str] = {}
        card_index_path = resolve_data_path("card_index.json")
        if card_index_path.exists():
            raw_index = load_json_file(card_index_path)
            if isinstance(raw_index, dict):
                for name, info in raw_index.items():
                    if not isinstance(name, str) or not isinstance(info, dict):
                        continue
                    localized_desc = self._resolve_source_localized_description(info)
                    if localized_desc:
                        self._remember_localized_description(name, localized_desc)

        # Load card descriptions from canonical data files
        self.card_info: dict[str, dict] = {}  # name -> {description, tags, cost, type, ...}
        self._norm_info: dict[str, str] = {}
        all_cards_path = resolve_data_path("all_cards.json")
        for data_path in (all_cards_path, resolve_data_path("corporations.json"), resolve_data_path("preludes.json")):
            if not os.path.exists(data_path):
                continue
            cards = load_json_file(data_path)
            if not isinstance(cards, list):
                continue
            for card in cards:
                self._register_card_info(card)

        # Load CEO cards
        self.ceo_cards: dict[str, dict] = {}
        ceo_path = resolve_data_path("ceo_cards.json")
        if os.path.exists(ceo_path):
            for c in load_json_file(ceo_path):
                info = self._register_card_info(c)
                if not info:
                    continue
                self.ceo_cards[info["name"]] = info

        # Load Pathfinder cards
        self.pathfinder_cards: dict[str, dict] = {}
        pf_path = resolve_data_path("pathfinder_cards.json")
        if os.path.exists(pf_path):
            for c in load_json_file(pf_path):
                info = self._register_card_info(c)
                if not info:
                    continue
                self.pathfinder_cards[info["name"]] = info

        # Load planetary tracks (Pathfinders)
        self.planetary_tracks: dict = {}
        tracks_path = resolve_data_path("planetary_tracks.json")
        if os.path.exists(tracks_path):
            data = load_json_file(tracks_path)
            self.planetary_tracks = data.get("tracks", {})

    @staticmethod
    def _normalize(name: str) -> str:
        normalized = (
            str(name)
            .lower()
            .replace("²", "2")
            .replace("³", "3")
        )
        return re.sub(r"[^a-z0-9]", "", normalized)

    @staticmethod
    def _truncate(text: str, max_len: int) -> str:
        if len(text) <= max_len:
            return text
        return text[: max_len - 3].rstrip() + "..."

    @classmethod
    def _first_sentence(cls, text: str, max_len: int = 120) -> str:
        raw = str(text or "").strip()
        if not raw:
            return ""
        parts = re.split(r"(?<=[.!?])\s+", raw, maxsplit=1)
        first = parts[0].strip()
        return cls._truncate(first, max_len)

    @staticmethod
    def _normalize_text_value(value) -> str:
        if isinstance(value, dict):
            text = value.get("text") or value.get("message") or ""
        else:
            text = value or ""
        return re.sub(r"\s+", " ", str(text)).strip()

    @staticmethod
    def _load_tm_ru_locale_strings() -> dict[str, str]:
        locale_path = Path(__file__).resolve().parents[3] / "terraforming-mars" / "assets" / "locales" / "ru.json"
        if not locale_path.exists():
            return {}
        try:
            raw = json.loads(locale_path.read_text(encoding="utf-8"))
        except Exception:
            return {}
        if not isinstance(raw, dict):
            return {}
        return {
            str(key): str(value).strip()
            for key, value in raw.items()
            if isinstance(key, str) and isinstance(value, str) and value.strip()
        }

    def _lookup_tm_ru_locale(self, value) -> str:
        normalized = self._normalize_text_value(value)
        candidates = []
        if normalized:
            candidates.append(normalized)
        cleaned = self._clean_card_description(normalized)
        if cleaned and cleaned not in candidates:
            candidates.append(cleaned)
        if cleaned and (cleaned + ".") not in candidates:
            candidates.append(cleaned + ".")
        for candidate in candidates:
            localized = self._normalize_text_value(self.locale_strings_ru.get(candidate, ""))
            if localized:
                return localized
        return ""

    def _resolve_source_localized_description(self, info: dict) -> str:
        if not isinstance(info, dict):
            return ""
        for field in ("description_ru", "description", "_raw_description"):
            if field == "description_ru":
                localized = self._normalize_text_value(info.get(field, ""))
            else:
                localized = self._lookup_tm_ru_locale(info.get(field, ""))
            if localized:
                return localized
        return ""

    def _remember_localized_description(self, name: str, description: str) -> None:
        localized = self._normalize_text_value(description)
        if not localized:
            return
        self.localized_descriptions_ru[name] = localized
        self._norm_localized_descriptions_ru[self._normalize(name)] = name

    def _get_localized_description(self, name: str, info: Optional[dict] = None) -> str:
        if name in self.localized_descriptions_ru:
            return self.localized_descriptions_ru[name]
        localized_name = self._norm_localized_descriptions_ru.get(self._normalize(name))
        if localized_name:
            return self.localized_descriptions_ru.get(localized_name, "")
        if info:
            localized = self._resolve_source_localized_description(info)
            if localized:
                self._remember_localized_description(name, localized)
                return localized
        return ""

    def _register_card_info(self, card: dict) -> Optional[dict]:
        if not isinstance(card, dict):
            return None
        name = str(card.get("name", "") or "").strip()
        if not name:
            return None

        info = dict(card)
        raw_description = card.get("description", "")
        if not self._normalize_text_value(raw_description):
            raw_description = card.get("fullDescription", "")
        if not self._normalize_text_value(raw_description):
            parts = [
                self._normalize_text_value(card.get("opgAction", "")),
                self._normalize_text_value(card.get("ongoingEffect", "")),
            ]
            raw_description = " | ".join(part for part in parts if part)
        info["_raw_description"] = raw_description
        if self._normalize_text_value(raw_description) and not self._normalize_text_value(info.get("description", "")):
            info["description"] = raw_description
        generated_desc = self.generated_card_descriptions.get(name)
        if isinstance(generated_desc, str) and generated_desc.strip():
            info["description"] = generated_desc

        localized_desc = self._resolve_source_localized_description(info)
        if localized_desc:
            info["description_ru"] = localized_desc
            self._remember_localized_description(name, localized_desc)
        else:
            remembered = self._get_localized_description(name)
            if remembered:
                info["description_ru"] = remembered

        self.card_info[name] = info
        self._norm_info[self._normalize(name)] = name
        return info

    @classmethod
    def _clean_card_description(cls, text: str) -> str:
        raw = cls._normalize_text_value(text)
        if not raw:
            return ""

        if "Effect:" in raw:
            raw = raw[raw.index("Effect:") + len("Effect:"):].strip()
        elif "Action:" in raw:
            raw = raw[raw.index("Action:") + len("Action:"):].strip()

        raw = re.sub(r"\b(?:tag|item|symbol|effect|action|root|text|plate)\b", " ", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\s+", " ", raw).strip(" .;|")
        return raw

    def _fallback_card_description(self, info: dict) -> str:
        primary = self._clean_card_description(info.get("description", ""))
        raw_fallback = self._clean_card_description(info.get("_raw_description", ""))

        desc = primary
        if not desc or len(desc.split()) < 3:
            desc = raw_fallback
        elif "requires" not in desc.lower() and "requires" in raw_fallback.lower():
            # Prefer canonical wording when generated text dropped requirement context.
            desc = raw_fallback
        return desc

    def get_advisor_description(self, name: str, max_len: int = 160, locale: str = "ru") -> str:
        info = self.get_info(name)
        if not info:
            return ""

        if locale == "ru":
            localized = self._clean_card_description(self._get_localized_description(name, info))
            if localized:
                return self._truncate(localized, max_len)

        desc = self._fallback_card_description(info)
        return self._truncate(desc, max_len) if desc else ""

    def prefer_description_first(self, name: str, locale: str = "ru") -> bool:
        info = self.get_info(name) or {}
        req = str(info.get("requirements", "") or "").strip()
        if req:
            return True
        desc = self.get_advisor_description(name, max_len=220, locale=locale).lower()
        return desc.startswith("requires ") or desc.startswith("max ") or desc.startswith("min ")

    def get_advisor_blurb(
        self,
        name: str,
        locale: str = "ru",
        note_max_len: int = 120,
        desc_max_len: int = 160,
        total_max_len: int = 260,
    ) -> str:
        note = self.get_advisor_note(name, locale=locale, max_len=note_max_len)
        desc = self.get_advisor_description(name, max_len=desc_max_len, locale=locale)
        desc_first = self.prefer_description_first(name, locale=locale)
        if note and desc:
            if desc.lower() in note.lower():
                return note
            merged = f"Описание: {desc} │ {note}" if desc_first else f"{note} │ Описание: {desc}"
            return self._truncate(merged, total_max_len)
        if desc:
            return self._truncate(f"Описание: {desc}", total_max_len)
        return note

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

    def get_advisor_note(self, name: str, locale: str = "ru", max_len: int = 120) -> str:
        if locale != "ru":
            card = self.get(name)
            if not card:
                return ""
            return self._first_sentence(card.get("economy", ""), max_len=max_len)

        if name in self.advisor_notes_ru:
            return self._truncate(self.advisor_notes_ru[name], max_len)

        norm = self._normalize(name)
        localized_name = self._norm_advisor_notes_ru.get(norm)
        if localized_name:
            return self._truncate(self.advisor_notes_ru.get(localized_name, ""), max_len)

        card = self.get(name)
        if not card:
            return ""

        for field in ("economy_ru", "when_to_pick_ru", "reasoning_ru"):
            localized = card.get(field, "")
            if isinstance(localized, str) and localized.strip():
                return self._first_sentence(localized, max_len=max_len)

        return ""

    def get_desc(self, name: str) -> str:
        """Get card description text."""
        info = self.get_info(name)
        return info.get("description", "") if info else ""

    def get_generated_effect(self, name: str) -> Optional[dict]:
        if name in self.generated_card_effects:
            return self.generated_card_effects[name]
        norm = self._normalize(name)
        for effect_name, data in self.generated_card_effects.items():
            if self._normalize(effect_name) == norm:
                return data
        return None

    def get_score(self, name: str) -> int:
        card = self.get(name)
        return card["score"] if card else 50

    def get_opening_hand_bias(self, name: str) -> int:
        card = self.get(name)
        if not card:
            return 0
        info = self.get_info(name)
        if info and str(info.get("type", "")).lower() == "prelude":
            return 0
        bias = card.get("opening_hand_bias", 0)
        try:
            raw = int(bias)
        except (TypeError, ValueError):
            return 0
        if raw == 0:
            return 0
        scaled = round(raw * 0.6)
        if scaled == 0:
            scaled = 1 if raw > 0 else -1
        return max(-5, min(5, scaled))

    def get_opening_hand_note(self, name: str) -> str:
        card = self.get(name)
        if not card:
            return ""
        note = card.get("opening_hand_note", "")
        return note if isinstance(note, str) else str(note)

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
