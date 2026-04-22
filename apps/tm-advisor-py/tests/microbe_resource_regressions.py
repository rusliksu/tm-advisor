#!/usr/bin/env python3
"""Regression checks for microbe feeder cards vs resource-holding VP cards."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.analysis import _build_action_chains, _generate_alerts  # noqa: E402
from tm_advisor.card_parser import CardEffectParser  # noqa: E402
from tm_advisor.combo import ComboDetector  # noqa: E402
from tm_advisor.database import CardDatabase  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402
from tm_advisor.requirements import RequirementsChecker  # noqa: E402
from tm_advisor.shared_data import resolve_data_path  # noqa: E402


def build_symbiotic_state() -> GameState:
    return GameState({
        "thisPlayer": {
            "color": "red",
            "name": "me",
            "megaCredits": 40,
            "terraformRating": 30,
            "cardsInHandNbr": 1,
            "tableau": [{"name": "Symbiotic Fungus", "resources": 6}],
            "tags": {"microbe": 1},
        },
        "players": [{
            "color": "red",
            "name": "me",
            "megaCredits": 40,
            "megaCreditProduction": 0,
            "steelProduction": 0,
            "titaniumProduction": 0,
            "plantProduction": 0,
            "energyProduction": 0,
            "heatProduction": 0,
            "terraformRating": 30,
            "cardsInHandNbr": 1,
            "tableau": [{"name": "Symbiotic Fungus", "resources": 6}],
        }],
        "cardsInHand": [{"name": "Decomposers", "tags": ["Microbe"]}],
        "game": {
            "generation": 7,
            "phase": "action",
            "oxygenLevel": 5,
            "temperature": -10,
            "oceans": 3,
            "milestones": [],
            "awards": [],
            "colonies": [],
            "gameOptions": {"expansions": {}},
        },
    })


def main() -> None:
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    parser = CardEffectParser(db)
    combo = ComboDetector(parser, db)
    req_checker = RequirementsChecker(str(resolve_data_path("all_cards.json")))

    symbiotic = parser.get("Symbiotic Fungus")
    assert symbiotic.actions == [
        {"cost": "free", "effect": "add 1 microbe to another card"}
    ], symbiotic.actions
    assert not symbiotic.resource_holds, symbiotic.resource_holds
    assert not symbiotic.vp_per, symbiotic.vp_per
    assert (
        {"type": "Microbe", "amount": 1, "target": "another", "per_tag": None}
        in symbiotic.adds_resources
    )

    extreme = parser.get("Extreme-Cold Fungus")
    assert extreme.actions == [
        {"cost": "free", "effect": "gain 1 plant", "choice_group": "or"},
        {"cost": "free", "effect": "add 2 microbes to another card", "choice_group": "or"},
    ], extreme.actions
    assert not extreme.resource_holds, extreme.resource_holds
    assert not extreme.vp_per, extreme.vp_per
    assert (
        {"type": "Microbe", "amount": 2, "target": "another", "per_tag": None}
        in extreme.adds_resources
    )

    decomposers = parser.get("Decomposers")
    assert decomposers.resource_holds, decomposers
    assert decomposers.vp_per == {"amount": 1, "per": "3 resources"}, decomposers.vp_per

    assert "Symbiotic Fungus" in combo.find_resource_adders("Microbe")
    assert "Extreme-Cold Fungus" in combo.find_resource_adders("Microbe")
    assert "Symbiotic Fungus" not in combo.find_resource_targets("Microbe")
    assert "Extreme-Cold Fungus" not in combo.find_resource_targets("Microbe")

    feeder_combos = combo.analyze_tableau_combos(
        ["Decomposers"], ["Symbiotic Fungus", "Extreme-Cold Fungus"], {"microbe": 2}
    )
    assert any(
        c.get("type") == "resource_adder" and c["cards"][0] == "Symbiotic Fungus"
        for c in feeder_combos
    ), feeder_combos
    assert any(
        c.get("type") == "resource_adder" and c["cards"][0] == "Extreme-Cold Fungus"
        for c in feeder_combos
    ), feeder_combos

    state = build_symbiotic_state()
    alerts = _generate_alerts(state)
    assert not any("Resource VP: Symbiotic Fungus" in alert for alert in alerts), alerts
    chains = _build_action_chains(db, req_checker, state.cards_in_hand, state)
    assert not any("Symbiotic Fungus +microbe" in chain for chain in chains), chains

    print("advisor microbe-resource regression checks: OK")


if __name__ == "__main__":
    main()
