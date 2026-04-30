#!/usr/bin/env python3
"""RU advisor-note regressions."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.database import CardDatabase  # noqa: E402
from tm_advisor.claude_output import ClaudeOutput  # noqa: E402
from tm_advisor.card_parser import CardEffectParser  # noqa: E402
from tm_advisor.combo import ComboDetector  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402
from tm_advisor.requirements import RequirementsChecker  # noqa: E402
from tm_advisor.shared_data import load_generated_extension_object, resolve_data_path  # noqa: E402
from tm_advisor.synergy import SynergyEngine  # noqa: E402


def build_raw_state() -> dict:
    me = {
        "color": "red",
        "name": "me",
        "megaCredits": 24,
        "steel": 0,
        "titanium": 0,
        "plants": 0,
        "energy": 3,
        "heat": 0,
        "megaCreditProduction": 6,
        "steelProduction": 0,
        "titaniumProduction": 0,
        "plantProduction": 0,
        "energyProduction": 1,
        "heatProduction": 0,
        "terraformRating": 24,
        "cardsInHandNbr": 2,
        "tableau": [
            {"name": "Teractor"},
            {"name": "Development Center"},
        ],
        "tags": {
            "earth": 1,
            "science": 1,
        },
    }
    opp = {
        "color": "blue",
        "name": "opp",
        "megaCredits": 18,
        "terraformRating": 22,
        "cardsInHandNbr": 3,
        "tableau": [{"name": "Helion"}],
        "tags": {},
    }
    return {
        "thisPlayer": me,
        "players": [me, opp],
        "pickedCorporationCard": [{"name": "Teractor"}],
        "cardsInHand": [
            {"name": "Sponsors", "calculatedCost": 6, "tags": ["Earth"]},
            {"name": "Birds", "calculatedCost": 10, "tags": ["Animal"]},
        ],
        "waitingFor": {
            "type": "card",
            "buttonLabel": "Research",
            "cards": [
                {"name": "Media Group", "calculatedCost": 6, "tags": ["Earth"]},
                {"name": "Comet", "calculatedCost": 21, "tags": ["Event", "Space"]},
            ],
        },
        "game": {
            "generation": 2,
            "phase": "research",
            "oxygenLevel": 0,
            "temperature": -24,
            "oceans": 1,
            "venusScaleLevel": 0,
            "milestones": [],
            "awards": [],
            "gameOptions": {
                "expansions": {
                    "prelude": True,
                    "ceos": True,
                    "colonies": False,
                },
            },
        },
    }


def main() -> int:
    db = CardDatabase(str(resolve_data_path("evaluations.json")))

    earth_catapult = db.get_advisor_note("Earth Catapult", locale="ru")
    assert "скидка -2" in earth_catapult or "скидка -2 на каждую карту" in earth_catapult, earth_catapult
    assert any("\u0400" <= ch <= "\u04FF" for ch in earth_catapult), earth_catapult

    kelp = db.get_advisor_note("Kelp Farming", locale="ru")
    assert "plant" in kelp.lower() or "oceans" in kelp.lower() or "Экology" not in kelp, kelp
    assert any("\u0400" <= ch <= "\u04FF" for ch in kelp), kelp

    fish = db.get_advisor_note("Fish", locale="ru")
    assert "animal" in fish.lower() or "темп" not in fish.lower(), fish
    assert any("\u0400" <= ch <= "\u04FF" for ch in fish), fish

    earth_office = db.get_advisor_note("Earth Office", locale="ru")
    assert "earth" in earth_office.lower() or "скид" in earth_office.lower(), earth_office
    assert any("\u0400" <= ch <= "\u04FF" for ch in earth_office), earth_office

    research_colony = db.get_advisor_note("Research Colony", locale="ru")
    assert "колони" in research_colony.lower() or "colon" in research_colony.lower(), research_colony
    assert any("\u0400" <= ch <= "\u04FF" for ch in research_colony), research_colony

    poseidon_desc = db.get_advisor_description("Poseidon", max_len=200)
    assert "Вы начинаете с 45" in poseidon_desc, poseidon_desc
    assert any("\u0400" <= ch <= "\u04FF" for ch in poseidon_desc), poseidon_desc

    business_contacts_desc = db.get_advisor_description("Business Contacts", max_len=200)
    assert "Посмотрите 4 верхние карты колоды" in business_contacts_desc, business_contacts_desc
    assert any("\u0400" <= ch <= "\u04FF" for ch in business_contacts_desc), business_contacts_desc

    hal_desc = db.get_advisor_description("HAL 9000", max_len=220)
    assert "decrease each of your productions" in hal_desc.lower(), hal_desc

    van_allen_desc = db.get_advisor_description("Van Allen", max_len=220)
    assert "milestones always cost 0" in van_allen_desc.lower(), van_allen_desc

    co_leadership_desc = db.get_advisor_description("Co-leadership", max_len=220)
    assert "draw 3 ceo cards" in co_leadership_desc.lower(), co_leadership_desc

    co2_eval = db.get("CO2Reducers")
    assert co2_eval and co2_eval["name"] == "CO² Reducers", co2_eval
    co2_info = db.get_info("CO² Reducers")
    assert co2_info and co2_info["name"] == "CO2Reducers", co2_info

    established_blurb = db.get_advisor_blurb("Established Methods", locale="ru", note_max_len=140, desc_max_len=180, total_max_len=280)
    assert established_blurb.startswith("Гибкая prelude"), established_blurb
    assert "Описание:" not in established_blurb, established_blurb
    assert db.prefer_description_first("Birds") is True

    birds_blurb = db.get_advisor_blurb("Birds", locale="ru", note_max_len=110, desc_max_len=160, total_max_len=280)
    assert birds_blurb.startswith("Описание: Уровень кислорода"), birds_blurb
    assert "animal" in birds_blurb.lower() or "vp" in birds_blurb.lower(), birds_blurb

    claude = ClaudeOutput(db, None, None)
    note = claude._get_note("Mars University")
    assert "engine" in note.lower() or "фильтр руки" in note.lower(), note
    assert any("\u0400" <= ch <= "\u04FF" for ch in note), note

    birds_note = claude._get_note("Birds")
    assert birds_note.startswith("Описание: Уровень кислорода"), birds_note
    assert "animal" in birds_note.lower() or "vp" in birds_note.lower(), birds_note

    parser = CardEffectParser(db)
    combo = ComboDetector(parser, db)
    synergy = SynergyEngine(db, combo)
    req_checker = RequirementsChecker(str(resolve_data_path("all_cards.json")))
    state = GameState(build_raw_state())
    rendered = ClaudeOutput(db, synergy, req_checker).format(state)
    assert rendered.count("Описание / заметка") >= 2, rendered
    birds_line = next(line for line in rendered.splitlines() if "| Birds " in line)
    assert "Описание: Уровень кислорода" in birds_line, birds_line
    assert birds_line.index("Описание: Уровень кислорода") < birds_line.index("Сильный VP engine"), birds_line

    ratings = load_generated_extension_object("ratings.json.js", "TM_RATINGS")
    assert ratings["Earth Catapult"]["nr"] == earth_catapult, ratings["Earth Catapult"]
    assert ratings["Earth Office"]["nr"] == earth_office, ratings["Earth Office"]
    assert ratings["Research Colony"]["nr"] == research_colony, ratings["Research Colony"]
    assert ratings["Mars University"]["nr"] == db.get_advisor_note("Mars University", locale="ru"), ratings["Mars University"]
    assert ratings["Power Generation"]["nr"] == db.get_advisor_note("Power Generation", locale="ru"), ratings["Power Generation"]
    assert ratings["Poseidon"]["dr"] == poseidon_desc, ratings["Poseidon"]
    assert ratings["Business Contacts"]["dr"].rstrip(".") == business_contacts_desc.rstrip("."), ratings["Business Contacts"]
    assert "dr" not in ratings["Established Methods"], ratings["Established Methods"]

    print("localized advisor notes: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
