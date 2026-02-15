"""Economy Model — ценность ресурсов по фазам игры, SP efficiency."""

from .constants import STANDARD_PROJECTS, TABLEAU_REBATES

# Cards with actions that consume energy
ENERGY_CONSUMER_CARDS = {
    "Development Center", "Physics Complex", "Warp Drive",
    "Space Elevator", "Earth Catapult", "Electro Catapult",
    "Orbital Cleanup", "Water Splitting Plant", "Ironworks",
    "Steelworks", "Ore Processor",
}


def check_energy_sinks(me, has_colonies: bool = False) -> bool:
    """Check if player has meaningful energy consumers.
    Energy sinks: trade with colonies (needs 3+ energy-prod), or action cards."""
    if not me:
        return False
    tableau_names = {c.get("name", "") if isinstance(c, dict) else str(c)
                     for c in (me.tableau or [])}
    # Has energy-consuming cards in tableau?
    if tableau_names & ENERGY_CONSUMER_CARDS:
        return True
    # Has colonies and enough energy-prod to trade (3 energy needed)?
    if has_colonies and getattr(me, "energy_prod", 0) >= 2:
        return True
    return False


def resource_values(gens_left: int) -> dict:
    """MC-ценность ресурсов и production в зависимости от оставшихся поколений."""
    gl = max(0, gens_left)
    return {
        # Production: value = remaining gens where it pays off
        "mc_prod":     max(0, gl * 1.0),           # 1 MC-prod = gens_left MC
        "steel_prod":  max(0, gl * 1.6),           # steel-prod ≈ 1.6× MC-prod
        "ti_prod":     max(0, gl * 2.5),           # ti-prod ≈ 2.5× MC-prod
        "plant_prod":  max(0, gl * 1.6),           # plant-prod = 8 MC (For The Nerd) = 1.6× MC-prod
        "energy_prod": max(0, gl * 1.5),           # energy-prod = 7.5 MC (For The Nerd) = 1.5× MC-prod
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


def sp_efficiency(gens_left: int, tableau: list[dict] = None,
                  has_energy_sinks: bool = False) -> list[tuple[str, float, str]]:
    """Calculate standard project efficiency (value/cost ratio) for current timing.
    Accounts for tableau rebates (e.g. Homeostasis Bureau).
    If has_energy_sinks is False, energy-prod is valued at heat level (just converts to heat)."""
    rv = resource_values(gens_left)
    if not has_energy_sinks:
        rv = dict(rv)
        rv["energy_prod"] = rv["heat_prod"]  # energy without sinks → just heat

    # Calculate rebates from tableau
    rebates: dict[str, int] = {}  # sp_name -> rebate MC
    if tableau:
        tableau_names = {c.get("name", "") if isinstance(c, dict) else str(c) for c in tableau}
        for card_name, card_rebates in TABLEAU_REBATES.items():
            if card_name in tableau_names:
                for action, mc in card_rebates.items():
                    if action.startswith("sp_"):
                        # Map sp action to standard project
                        sp_map = {"sp_temp": "Asteroid"}
                        sp_name = sp_map.get(action)
                        if sp_name:
                            rebates[sp_name] = rebates.get(sp_name, 0) + mc

    results = []
    for name, sp in STANDARD_PROJECTS.items():
        val = rv.get(sp["value_fn"], 7.0)
        rebate = rebates.get(name, 0)
        effective_cost = sp["cost"] - rebate
        ratio = val / max(1, effective_cost)
        gives = sp["gives"]
        if rebate:
            gives += f" [−{rebate} MC rebate → {effective_cost} MC net]"
        results.append((name, ratio, gives))
    results.sort(key=lambda x: x[1], reverse=True)
    return results
