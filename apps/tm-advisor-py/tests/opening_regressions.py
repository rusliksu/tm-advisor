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
from tm_advisor.colony_advisor import analyze_trade_options  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402


def build_state(*, corps, preludes, projects, ceos=None, colonies=None, player_count=3, game_options=None, venus=0, oxygen=0, generation=1):
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
            "generation": generation,
            "phase": "initial_drafting",
            "oxygenLevel": oxygen,
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

    ecoline_rush_state = build_state(
        corps=["EcoLine", "Helion", "Arklight"],
        preludes=["Ecology Experts", "Power Generation", "Donation"],
        projects=["Kelp Farming", "Warp Drive", "Anti-Gravity Technology", "Biofuels"],
        colonies=[("Ceres", True), ("Luna", True)],
    )
    assert best_corp(bot, ecoline_rush_state) == "EcoLine"
    assert project_score(bot, ecoline_rush_state, "EcoLine", "Kelp Farming") > (
        project_score(bot, ecoline_rush_state, "EcoLine", "Warp Drive")
    )
    assert project_score(bot, ecoline_rush_state, "EcoLine", "Kelp Farming") > (
        project_score(bot, ecoline_rush_state, "EcoLine", "Anti-Gravity Technology")
    )

    insects_support_state = build_state(
        corps=["EcoLine", "Helion", "Arklight"],
        preludes=["Ecology Experts", "Donation", "Power Generation"],
        projects=["Insects", "Lichen", "Nitrogen-Rich Asteroid", "Mars University"],
        colonies=[("Luna", True), ("Ceres", True)],
    )
    insects_weak_state = build_state(
        corps=["Helion", "Arklight", "Teractor"],
        preludes=["Donation", "Power Generation", "Loan"],
        projects=["Insects", "Warp Drive", "AI Central"],
        colonies=[("Callisto", True), ("Miranda", True)],
    )
    assert project_score(bot, insects_support_state, "EcoLine", "Insects") > (
        project_score(bot, insects_weak_state, "Helion", "Insects")
    )

    insects_online_state = build_state(
        corps=["EcoLine", "Helion", "Arklight"],
        preludes=["Ecology Experts", "Donation", "Power Generation"],
        projects=["Insects", "Lichen", "Nitrogen-Rich Asteroid", "Mars University"],
        colonies=[("Luna", True), ("Ceres", True)],
        oxygen=5,
        generation=4,
    )
    assert project_score(bot, insects_online_state, "EcoLine", "Insects") > (
        project_score(bot, insects_support_state, "EcoLine", "Insects")
    )

    birds_opening_state = build_state(
        corps=["Arklight", "Helion", "Teractor"],
        preludes=["Donation", "Power Generation", "Loan"],
        projects=["Birds", "Imported Hydrogen", "Ark Nova"],
        colonies=[("Callisto", True), ("Miranda", True)],
    )
    birds_ready_state = build_state(
        corps=["Arklight", "Helion", "Teractor"],
        preludes=["Donation", "Power Generation", "Loan"],
        projects=["Birds", "Imported Hydrogen", "Ark Nova"],
        colonies=[("Callisto", True), ("Miranda", True)],
        oxygen=12,
        generation=6,
    )
    assert project_score(bot, birds_ready_state, "Arklight", "Birds") > (
        project_score(bot, birds_opening_state, "Arklight", "Birds")
    )

    harvest_strong_state = build_state(
        corps=["EcoLine", "Helion", "Arklight"],
        preludes=["Donation", "Power Generation", "Loan"],
        projects=["Harvest", "Arctic Algae", "Nitrogen-Rich Asteroid", "Bushes"],
        colonies=[("Callisto", True), ("Miranda", True)],
    )
    harvest_weak_state = build_state(
        corps=["CrediCor", "Helion", "Arklight"],
        preludes=["Donation", "Power Generation", "Loan"],
        projects=["Harvest", "Lichen", "Warp Drive"],
        colonies=[("Callisto", True), ("Miranda", True)],
    )
    assert project_score(bot, harvest_strong_state, "EcoLine", "Harvest") > (
        project_score(bot, harvest_weak_state, "CrediCor", "Harvest")
    )

    established_strong_state = build_state(
        corps=["Thorgate", "CrediCor", "Helion"],
        preludes=["Established Methods", "Donation", "Allied Banks"],
        projects=["Research", "Acquired Company"],
        ceos=["Sagitta Frontier Services"],
        colonies=[("Luna", True), ("Pluto", True), ("Titan", True)],
    )
    established_weak_state = build_state(
        corps=["Helion", "Teractor", "Arklight"],
        preludes=["Established Methods", "Donation", "Allied Banks"],
        projects=["Warp Drive", "AI Central"],
        colonies=[("Callisto", True), ("Miranda", True)],
    )
    assert project_score(bot, established_strong_state, "Thorgate", "Established Methods") > (
        project_score(bot, established_weak_state, "Helion", "Established Methods")
    )

    aquifer_strong_state = build_state(
        corps=["EcoLine", "Helion", "Arklight"],
        preludes=["Great Aquifer", "Donation", "Allied Banks"],
        projects=["Arctic Algae", "Kelp Farming", "Bushes"],
        colonies=[("Callisto", True), ("Miranda", True)],
    )
    aquifer_weak_state = build_state(
        corps=["Thorgate", "Cheung Shing MARS", "Kuiper Cooperative"],
        preludes=["Great Aquifer", "Donation", "Allied Banks"],
        projects=["Neptunian Power Consultants", "Warp Drive"],
        colonies=[("Europa", True), ("Luna", True), ("Pluto", True), ("Triton", True), ("Ceres", True)],
    )
    aquifer_engine_state = build_state(
        corps=["Thorgate", "Cheung Shing MARS", "Kuiper Cooperative"],
        preludes=["Great Aquifer", "Donation", "Allied Banks"],
        projects=["Warp Drive", "AI Central"],
        colonies=[("Luna", True), ("Pluto", True), ("Triton", True), ("Ceres", True)],
    )
    assert project_score(bot, aquifer_strong_state, "EcoLine", "Great Aquifer") > (
        project_score(bot, aquifer_weak_state, "Thorgate", "Great Aquifer")
    )
    assert project_score(bot, aquifer_strong_state, "EcoLine", "Great Aquifer") > (
        project_score(bot, aquifer_engine_state, "Thorgate", "Great Aquifer")
    )

    strategic_strong_state = build_state(
        corps=["Tharsis Republic", "Helion", "Arklight"],
        preludes=["Strategic Base Planning", "Donation", "Allied Banks"],
        projects=["Power Infrastructure", "Electro Catapult", "Mining Colony"],
        colonies=[("Luna", True), ("Pluto", True), ("Europa", True)],
    )
    strategic_weak_state = build_state(
        corps=["Helion", "Arklight", "Teractor"],
        preludes=["Strategic Base Planning", "Donation", "Allied Banks"],
        projects=["Warp Drive", "AI Central"],
        colonies=[("Europa", True), ("Callisto", True)],
    )
    assert project_score(bot, strategic_strong_state, "Tharsis Republic", "Strategic Base Planning") > (
        project_score(bot, strategic_weak_state, "Helion", "Strategic Base Planning")
    )

    suitable_strong_state = build_state(
        corps=["Manutech", "Helion", "Teractor"],
        preludes=["Suitable Infrastructure", "Donation", "Allied Banks"],
        projects=["Acquired Company", "Power Generation", "Mining Area"],
        colonies=[("Ceres", True), ("Luna", True)],
    )
    suitable_weak_state = build_state(
        corps=["Helion", "Arklight", "Teractor"],
        preludes=["Suitable Infrastructure", "Donation", "Allied Banks"],
        projects=["Warp Drive", "AI Central"],
        colonies=[("Callisto", True), ("Miranda", True)],
    )
    assert project_score(bot, suitable_strong_state, "Manutech", "Suitable Infrastructure") > (
        project_score(bot, suitable_weak_state, "Helion", "Suitable Infrastructure")
    )

    heat_trappers_strong_state = build_state(
        corps=["Thorgate", "Cheung Shing MARS", "Helion"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Heat Trappers", "Neptunian Power Consultants"],
        colonies=[("Luna", True), ("Ceres", True)],
    )
    heat_trappers_weak_state = build_state(
        corps=["Helion", "Arklight", "Teractor"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Heat Trappers", "Warp Drive"],
        colonies=[("Callisto", True), ("Miranda", True)],
    )
    heat_trappers_no_npc_state = build_state(
        corps=["Thorgate", "Cheung Shing MARS", "Helion"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Heat Trappers", "Warp Drive"],
        colonies=[("Luna", True), ("Ceres", True)],
    )
    assert project_score(bot, heat_trappers_strong_state, "Thorgate", "Heat Trappers") > (
        project_score(bot, heat_trappers_weak_state, "Helion", "Heat Trappers")
    )
    assert project_score(bot, heat_trappers_no_npc_state, "Thorgate", "Heat Trappers") > (
        project_score(bot, heat_trappers_strong_state, "Thorgate", "Heat Trappers")
    )

    soil_engine_state = build_state(
        corps=["Cheung Shing MARS", "Thorgate", "Kuiper Cooperative"],
        preludes=["Strategic Base Planning", "Suitable Infrastructure", "Metals Company"],
        projects=["Soil Studies", "Neptunian Power Consultants", "Harvest"],
        colonies=[("Europa", True), ("Luna", True), ("Triton", True), ("Ceres", True), ("Callisto", True), ("Enceladus", True)],
    )
    soil_supported_state = build_state(
        corps=["Morning Star Inc.", "EcoLine", "Helion"],
        preludes=["Strategic Base Planning", "Donation", "Allied Banks"],
        projects=["Soil Studies", "Venus Soils", "Nitrogen-Rich Asteroid", "Harvest"],
        colonies=[("Europa", True), ("Callisto", True), ("Enceladus", True)],
    )
    assert project_score(bot, soil_supported_state, "Morning Star Inc.", "Soil Studies") > (
        project_score(bot, soil_engine_state, "Cheung Shing MARS", "Soil Studies")
    )

    europa_trade_noise_state = build_state(
        corps=["Cheung Shing MARS", "Thorgate", "Kuiper Cooperative"],
        preludes=["Strategic Base Planning", "Suitable Infrastructure", "Metals Company"],
        projects=["Soil Studies", "Neptunian Power Consultants", "Harvest"],
        colonies=[("Europa", True), ("Luna", True), ("Triton", True), ("Ceres", True)],
    )
    trade = analyze_trade_options(europa_trade_noise_state)
    assert "Europa" not in (trade.get("best_hint") or "")

    print("advisor opening regression checks: OK")


if __name__ == "__main__":
    main()
