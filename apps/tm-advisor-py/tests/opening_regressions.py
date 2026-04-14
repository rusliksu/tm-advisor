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
from tm_advisor.analysis import _generate_alerts  # noqa: E402
from tm_advisor.colony_advisor import analyze_settlement, analyze_trade_options, colony_strategy_advice, format_trade_hints  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402


def build_state(*, corps, preludes, projects, ceos=None, colonies=None, player_count=3, game_options=None, venus=0, oxygen=0, temperature=-30, generation=1):
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
            "temperature": temperature,
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

    titan_sink_state = build_state(
        corps=["CrediCor", "Helion", "Arklight"],
        preludes=["Donation", "Power Generation", "Allied Banks"],
        projects=[],
        colonies=[("Titan", True), ("Europa", True)],
        generation=3,
    )
    titan_sink_state.me.tableau = [
        {"name": "Aerial Mappers", "resources": 1},
        {"name": "Titan Floating Launch-pad", "resources": 1},
    ]
    titan_blank_state = build_state(
        corps=["CrediCor", "Helion", "Arklight"],
        preludes=["Donation", "Power Generation", "Allied Banks"],
        projects=[],
        colonies=[("Titan", True), ("Europa", True)],
        generation=3,
    )
    titan_supported = next(entry for entry in analyze_settlement(titan_sink_state) if entry["name"] == "Titan")
    titan_blank = next(entry for entry in analyze_settlement(titan_blank_state) if entry["name"] == "Titan")
    assert titan_supported["total_value"] > titan_blank["total_value"]
    assert titan_supported.get("resource_support_bonus", 0) > 0

    enceladus_sink_state = build_state(
        corps=["CrediCor", "Helion", "Arklight"],
        preludes=["Donation", "Power Generation", "Allied Banks"],
        projects=["Ecological Zone"],
        colonies=[("Enceladus", True), ("Europa", True)],
        generation=3,
    )
    enceladus_sink_state.me.tableau = [{"name": "Decomposers", "resources": 2}]
    enceladus_blank_state = build_state(
        corps=["CrediCor", "Helion", "Arklight"],
        preludes=["Donation", "Power Generation", "Allied Banks"],
        projects=[],
        colonies=[("Enceladus", True), ("Europa", True)],
        generation=3,
    )
    enceladus_supported = next(entry for entry in analyze_settlement(enceladus_sink_state) if entry["name"] == "Enceladus")
    enceladus_blank = next(entry for entry in analyze_settlement(enceladus_blank_state) if entry["name"] == "Enceladus")
    assert enceladus_supported["total_value"] > enceladus_blank["total_value"]
    assert enceladus_supported.get("resource_support_bonus", 0) > 0

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

    caretaker_weak_state = build_state(
        corps=["Cheung Shing MARS", "Helion", "Teractor"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Caretaker Contract", "Sky Docks", "Imported Nutrients"],
        colonies=[("Callisto", True), ("Miranda", True)],
        temperature=-30,
        generation=2,
    )
    caretaker_supported_state = build_state(
        corps=["Helion", "Thorgate", "Teractor"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Caretaker Contract", "GHG Factories", "Import of Advanced GHG", "Soletta"],
        colonies=[("Callisto", True), ("Miranda", True)],
        temperature=-4,
        generation=4,
    )
    assert project_score(bot, caretaker_supported_state, "Helion", "Caretaker Contract") > (
        project_score(bot, caretaker_weak_state, "Cheung Shing MARS", "Caretaker Contract")
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

    europa_engine_penalty_state = build_state(
        corps=["Cheung Shing MARS", "Thorgate", "Kuiper Cooperative"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Earth Catapult", "Cutting Edge Technology", "Imported Nutrients"],
        colonies=[("Europa", True), ("Luna", True), ("Triton", True), ("Ceres", True), ("Enceladus", True)],
        generation=2,
    )
    europa_engine_hints = colony_strategy_advice(europa_engine_penalty_state)
    assert not any("Europa" in hint for hint in europa_engine_hints)

    europa_ocean_shell_state = build_state(
        corps=["Cheung Shing MARS", "Thorgate", "Kuiper Cooperative"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Imported Nutrients"],
        colonies=[("Europa", True), ("Luna", True), ("Triton", True)],
        generation=2,
    )
    europa_ocean_shell_state.drafted_cards = [{"name": "Arctic Algae"}, {"name": "Kelp Farming"}]
    europa_ocean_hints = colony_strategy_advice(europa_ocean_shell_state)
    europa_ocean_hint = next((hint for hint in europa_ocean_hints if "Europa" in hint), "")
    assert "premium engine colonies first" not in europa_ocean_hint
    assert "owner bonus grows with trades" in europa_ocean_hint

    contest_state = build_state(
        corps=["Cheung Shing MARS", "Thorgate", "Kuiper Cooperative"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Imported Nutrients", "Deimos Down"],
        colonies=[("Triton", True), ("Europa", True)],
        generation=3,
    )
    for colony in contest_state.colonies_data:
        if colony["name"] == "Triton":
            colony["track"] = 5
    contest_state.opponents[0].energy = 3
    contest_state.opponents[0].fleet_size = 1
    contest_state.opponents[0].trades_this_gen = 0
    contest_state.opponents[1].mc = 12
    contest_state.opponents[1].fleet_size = 1
    contest_state.opponents[1].trades_this_gen = 0
    contest_settlement = next(s for s in analyze_settlement(contest_state) if s["name"] == "Triton")
    assert contest_settlement["contest_risk_penalty"] > 0
    assert "can strip track first" in contest_settlement["contest_risk_reason"]
    contest_hints = colony_strategy_advice(contest_state)
    assert any("Triton" in hint and "can strip track first" in hint for hint in contest_hints)

    contest_state.passed_players = [contest_state.opponents[0].color]
    lighter_contest = next(s for s in analyze_settlement(contest_state) if s["name"] == "Triton")
    assert lighter_contest["contest_risk_penalty"] < contest_settlement["contest_risk_penalty"]

    pluto_draw_hint_state = build_state(
        corps=["Teractor", "Helion", "Arklight"],
        preludes=["Donation", "Power Generation", "Allied Banks"],
        projects=["Research"],
        colonies=[("Pluto", True), ("Europa", True)],
        generation=2,
    )
    pluto_hint = next((hint for hint in colony_strategy_advice(pluto_draw_hint_state) if "Pluto" in hint), "")
    assert "draw/selection engine" in pluto_hint

    sky_docks_blocked_state = build_state(
        corps=["Cheung Shing MARS", "Thorgate", "Kuiper Cooperative"],
        preludes=["Strategic Base Planning", "Suitable Infrastructure", "Metals Company"],
        projects=["Sky Docks", "Warp Drive", "Heat Trappers"],
        colonies=[("Luna", True), ("Triton", True), ("Ceres", True), ("Europa", True)],
    )
    sky_docks_supported_state = build_state(
        corps=["Point Luna", "Cheung Shing MARS", "Kuiper Cooperative"],
        preludes=["Acquired Space Agency", "Suitable Infrastructure", "Metals Company"],
        projects=["Sky Docks", "Earth Office", "Imported Nutrients"],
        colonies=[("Luna", True), ("Triton", True), ("Ceres", True), ("Europa", True)],
    )
    assert project_score(bot, sky_docks_supported_state, "Point Luna", "Sky Docks") > (
        project_score(bot, sky_docks_blocked_state, "Cheung Shing MARS", "Sky Docks")
    )

    callisto_trade_state = build_state(
        corps=["Cheung Shing MARS", "Thorgate", "Kuiper Cooperative"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Imported Nutrients", "Deimos Down"],
        colonies=[("Callisto", True), ("Luna", True), ("Triton", True)],
        generation=1,
    )
    callisto_trade_state.me.energy = 0
    callisto_trade_state.me.energy_prod = 0
    callisto_trade_state.me.mc = 8
    callisto_hints = colony_strategy_advice(callisto_trade_state)
    assert any("Callisto" in hint and "unlocks trade now" in hint for hint in callisto_hints)

    energy_hint_state = build_state(
        corps=["Cheung Shing MARS", "Thorgate", "Kuiper Cooperative"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Imported Nutrients", "Deimos Down"],
        colonies=[("Callisto", True), ("Luna", True), ("Triton", True)],
        generation=1,
    )
    energy_hint_state.me.energy = 0
    energy_hint_state.me.energy_prod = 0
    energy_hint_state.me.mc = 0
    energy_hint_state.me.tableau = [{"name": "Power Infrastructure"}]
    trade_hints = format_trade_hints(energy_hint_state)
    assert any("3 energy ASAP" in hint and "Luna/Triton" in hint for hint in trade_hints)

    weak_energy_hint_state = build_state(
        corps=["Cheung Shing MARS", "Thorgate", "Kuiper Cooperative"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Imported Nutrients", "Deimos Down"],
        colonies=[("Europa", True), ("Titan", True), ("Io", True)],
        generation=1,
    )
    weak_energy_hint_state.me.energy = 0
    weak_energy_hint_state.me.energy_prod = 0
    weak_energy_hint_state.me.mc = 0
    weak_trade_hints = format_trade_hints(weak_energy_hint_state)
    assert not any("energy ASAP" in hint for hint in weak_trade_hints)

    late_energy_hint_state = build_state(
        corps=["Cheung Shing MARS", "Thorgate", "Kuiper Cooperative"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Imported Nutrients", "Deimos Down"],
        colonies=[("Callisto", True), ("Luna", True), ("Triton", True)],
        generation=5,
    )
    late_energy_hint_state.me.energy = 0
    late_energy_hint_state.me.energy_prod = 0
    late_energy_hint_state.me.mc = 0
    late_trade_hints = format_trade_hints(late_energy_hint_state)
    assert not any("energy ASAP" in hint for hint in late_trade_hints)

    ceres_trade_state = build_state(
        corps=["Cheung Shing MARS", "Thorgate", "Kuiper Cooperative"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Imported Nutrients", "Deimos Down"],
        colonies=[("Ceres", True)],
        generation=3,
    )
    ceres_trade_state.me.energy = 3
    ceres_trade_state.me.energy_prod = 0
    ceres_trade_state.me.mc = 8
    ceres_trade_hints = format_trade_hints(ceres_trade_state)
    assert any("Сначала Ceres" in hint for hint in ceres_trade_hints)

    engine_no_draw_state = build_state(
        corps=["Cheung Shing MARS", "Helion", "Teractor"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Research", "Earth Catapult", "Acquired Company"],
        colonies=[("Luna", True), ("Triton", True), ("Ceres", True)],
        generation=3,
    )
    engine_no_draw_state.me.tableau = [
        {"name": "Cheung Shing MARS"},
        {"name": "Earth Catapult"},
        {"name": "Cutting Edge Technology"},
        {"name": "Suitable Infrastructure"},
    ]
    engine_no_draw_state.me.mc_prod = 6
    engine_no_draw_state.me.steel_prod = 1
    engine_no_draw_state.me.energy_prod = 2

    engine_with_draw_state = build_state(
        corps=["Cheung Shing MARS", "Helion", "Teractor"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Research", "Earth Catapult", "Acquired Company"],
        colonies=[("Luna", True), ("Triton", True), ("Ceres", True)],
        generation=3,
    )
    engine_with_draw_state.me.tableau = [
        {"name": "Cheung Shing MARS"},
        {"name": "Earth Catapult"},
        {"name": "Cutting Edge Technology"},
        {"name": "Mars University"},
    ]
    engine_with_draw_state.me.mc_prod = 6
    engine_with_draw_state.me.steel_prod = 1
    engine_with_draw_state.me.energy_prod = 2

    draw_heavy_state = build_state(
        corps=["Cheung Shing MARS", "Helion", "Teractor"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Research", "Earth Catapult", "Acquired Company"],
        colonies=[("Callisto", True), ("Europa", True), ("Titan", True)],
        generation=3,
    )
    draw_heavy_state.me.tableau = [
        {"name": "Cheung Shing MARS"},
        {"name": "Mars University"},
        {"name": "Olympus Conference"},
        {"name": "Research"},
    ]
    draw_heavy_state.me.mc_prod = 1
    draw_heavy_state.me.steel_prod = 0
    draw_heavy_state.me.energy_prod = 0

    assert project_score(bot, engine_no_draw_state, "Cheung Shing MARS", "Research") >= (
        project_score(bot, engine_with_draw_state, "Cheung Shing MARS", "Research")
    )
    assert project_score(bot, engine_no_draw_state, "Cheung Shing MARS", "Earth Catapult") < (
        project_score(bot, engine_with_draw_state, "Cheung Shing MARS", "Earth Catapult")
    )
    assert project_score(bot, draw_heavy_state, "Cheung Shing MARS", "Acquired Company") > (
        project_score(bot, engine_with_draw_state, "Cheung Shing MARS", "Acquired Company")
    )

    engine_relief_state = build_state(
        corps=["Cheung Shing MARS", "Helion", "Teractor"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Research", "Earth Catapult", "Acquired Company"],
        colonies=[("Luna", True), ("Triton", True), ("Ceres", True)],
        generation=3,
    )
    engine_relief_state.me.tableau = [
        {"name": "Cheung Shing MARS"},
        {"name": "Sponsors"},
    ]
    engine_relief_state.me.mc_prod = 6
    engine_relief_state.me.steel_prod = 1
    engine_relief_state.me.energy_prod = 1
    engine_relief_state.me.cards_in_hand_n = 11

    engine_tight_state = build_state(
        corps=["Cheung Shing MARS", "Helion", "Teractor"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Research", "Earth Catapult", "Acquired Company"],
        colonies=[("Europa", True)],
        generation=3,
    )
    engine_tight_state.me.tableau = [
        {"name": "Cheung Shing MARS"},
        {"name": "Sponsors"},
    ]
    engine_tight_state.me.mc_prod = 6
    engine_tight_state.me.steel_prod = 1
    engine_tight_state.me.energy_prod = 1
    engine_tight_state.me.cards_in_hand_n = 4

    assert project_score(bot, engine_relief_state, "Cheung Shing MARS", "Earth Catapult") > (
        project_score(bot, engine_tight_state, "Cheung Shing MARS", "Earth Catapult")
    )
    assert project_score(bot, engine_relief_state, "Cheung Shing MARS", "Acquired Company") > (
        project_score(bot, engine_tight_state, "Cheung Shing MARS", "Acquired Company")
    )

    engine_alert_state = build_state(
        corps=["Cheung Shing MARS", "Helion", "Teractor"],
        preludes=["Donation", "Allied Banks", "Power Generation"],
        projects=["Earth Catapult", "Cutting Edge Technology", "Acquired Company"],
        colonies=[("Luna", True), ("Triton", True), ("Ceres", True)],
        generation=3,
    )
    engine_alert_state.me.tableau = [
        {"name": "Cheung Shing MARS"},
        {"name": "Suitable Infrastructure"},
    ]
    engine_alert_state.me.mc_prod = 6
    engine_alert_state.me.steel_prod = 1
    engine_alert_state.me.energy_prod = 2
    engine_alert_state.cards_in_hand = []
    for name in ["Earth Catapult", "Cutting Edge Technology", "Acquired Company"]:
        info = bot.db.get_info(name) or {}
        engine_alert_state.cards_in_hand.append({
            "name": name,
            "tags": info.get("tags", []) or [],
            "description": info.get("description", "") or "",
        })

    engine_alerts = _generate_alerts(engine_alert_state)
    assert any("добора мало" in alert for alert in engine_alerts)
    engine_draw_ok_alerts = _generate_alerts(engine_with_draw_state)
    assert not any("добора мало" in alert for alert in engine_draw_ok_alerts)

    print("advisor opening regression checks: OK")


if __name__ == "__main__":
    main()
