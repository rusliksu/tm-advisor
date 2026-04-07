#!/usr/bin/env python3
"""Canonical tm-advisor-py opening regression checks."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.advisor import AdvisorBot  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402


def build_state(*, corps, preludes, projects, ceos=None, colonies=None, player_count=3, game_options=None, venus=0):
    ceos = ceos or []
    colonies = colonies or []
    players = [{"color": "red", "name": "me"}]
    extra_colors = ["blue", "green", "yellow", "black"]
    for idx in range(max(0, player_count - 1)):
        players.append({"color": extra_colors[idx], "name": f"opp{idx + 1}"})

    if game_options is None:
        game_options = {
            "expansions": {
                "colonies": True,
                "prelude": True,
                "ceos": True,
            }
        }

    return GameState({
        "thisPlayer": {
            "color": "red",
            "name": "me",
            "megaCredits": 21,
            "cardsInHandNbr": 0,
            "tableau": [],
            "tags": {},
        },
        "players": players,
        "dealtCorporationCards": [{"name": name, "calculatedCost": 0} for name in corps],
        "dealtPreludeCards": [{"name": name, "calculatedCost": 0} for name in preludes],
        "dealtCeoCards": [{"name": name, "calculatedCost": 0} for name in ceos],
        "draftedCards": [{"name": name, "calculatedCost": 0} for name in projects],
        "game": {
            "generation": 1,
            "phase": "initial_drafting",
            "oxygenLevel": 0,
            "temperature": -30,
            "oceans": 0,
            "venusScaleLevel": venus,
            "colonies": [
                {"name": name, "isActive": active, "trackPosition": 1, "colonies": []}
                for name, active in colonies
            ],
            "gameOptions": game_options,
        },
    })


def project_score(bot: AdvisorBot, state: GameState, corp_name: str, card_name: str) -> int:
    info = bot.db.get_info(card_name) or {}
    return bot.synergy.adjusted_score(
        card_name,
        info.get("tags", []) or [],
        corp_name,
        1,
        {},
        state,
        context="draft",
    )


def best_corp(bot: AdvisorBot, state: GameState) -> str:
    ranked = bot._rank_initial_corp_options(state.dealt_corps, state.dealt_preludes, state)
    assert ranked, "expected non-empty corp ranking"
    return ranked[0]["corp_name"]


def main():
    bot = AdvisorBot("test", snapshot_mode=True)

    ic_state = build_state(
        corps=["Interplanetary Cinematics", "Splice", "Arklight"],
        preludes=["Experimental Forest", "Applied Science", "Recession", "Albedo Plants"],
        projects=["Optimal Aerobraking", "Media Group", "Comet", "Decomposers"],
        ceos=["Clarke"],
        colonies=[("Triton", True), ("Enceladus", False)],
    )
    assert [c["name"] for c in ic_state.dealt_ceos] == ["Clarke"], "GameState should parse dealtCeoCards"
    assert best_corp(bot, ic_state) == "Interplanetary Cinematics"
    assert project_score(bot, ic_state, "Interplanetary Cinematics", "Optimal Aerobraking") > (
        project_score(bot, ic_state, "Splice", "Optimal Aerobraking")
    )

    splice_state = build_state(
        corps=["Interplanetary Cinematics", "Splice", "Arklight"],
        preludes=["Soil Bacteria", "Applied Science", "Recession", "Albedo Plants"],
        projects=["Decomposers", "Vermin", "Symbiotic Fungus", "Topsoil Contract"],
        colonies=[("Enceladus", False), ("Triton", True)],
    )
    assert best_corp(bot, splice_state) == "Splice"

    weak_splice_state = build_state(
        corps=["Interplanetary Cinematics", "Splice", "Arklight"],
        preludes=["Experimental Forest", "Applied Science", "Recession", "Albedo Plants"],
        projects=["Decomposers", "Floater Prototypes"],
        colonies=[("Triton", True)],
    )
    assert best_corp(bot, weak_splice_state) == "Interplanetary Cinematics"
    assert project_score(bot, splice_state, "Splice", "Decomposers") > (
        project_score(bot, weak_splice_state, "Splice", "Decomposers")
    )

    pristar_state = build_state(
        corps=["Pristar", "Helion", "Teractor"],
        preludes=["Research Network", "Applied Science", "Recession", "Albedo Plants"],
        projects=["Birds", "Board of Directors", "Comet"],
    )
    assert project_score(bot, pristar_state, "Pristar", "Research Network") > (
        project_score(bot, pristar_state, "", "Research Network")
    )
    assert project_score(bot, pristar_state, "Pristar", "Comet") < (
        project_score(bot, pristar_state, "", "Comet")
    )

    phobolog_state = build_state(
        corps=["Vitor", "PhoboLog", "Saturn Systems", "Thorgate"],
        preludes=["Huge Asteroid", "Allied Banks", "Donation", "Power Generation"],
        projects=["Earth Elevator", "Giant Space Mirror", "Towing A Comet", "Venusian Insects"],
        colonies=[("Callisto", True), ("Enceladus", False), ("Io", True), ("Luna", True), ("Titan", False), ("Triton", True)],
    )
    assert project_score(bot, phobolog_state, "PhoboLog", "Earth Elevator") > (
        project_score(bot, phobolog_state, "Vitor", "Earth Elevator")
    )

    base_venus_state = build_state(
        corps=["PhoboLog", "Saturn Systems", "Thorgate"],
        preludes=["Allied Banks", "Donation", "Power Generation"],
        projects=["Venusian Insects"],
        colonies=[("Callisto", True), ("Io", True), ("Luna", True), ("Triton", True)],
    )
    flat_options_venus_state = build_state(
        corps=["PhoboLog", "Saturn Systems", "Thorgate"],
        preludes=["Allied Banks", "Donation", "Power Generation"],
        projects=["Venusian Insects"],
        colonies=[("Callisto", True), ("Enceladus", False), ("Io", True), ("Luna", True), ("Titan", False), ("Triton", True)],
        player_count=4,
        game_options={
            "coloniesExtension": True,
            "preludeExtension": True,
            "ceosExtension": True,
            "venusNextExtension": True,
            "solarPhaseOption": True,
        },
    )
    assert flat_options_venus_state.has_venus is True
    assert flat_options_venus_state.has_colonies is True
    assert flat_options_venus_state.is_wgt is True
    assert project_score(bot, flat_options_venus_state, "PhoboLog", "Venusian Insects") > (
        project_score(bot, base_venus_state, "PhoboLog", "Venusian Insects")
    )

    print("advisor opening regression checks: OK")


if __name__ == "__main__":
    main()
