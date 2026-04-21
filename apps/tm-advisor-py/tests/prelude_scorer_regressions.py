#!/usr/bin/env python3
"""Prelude scorer regression tests — MC-value math + blend calibration."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from tm_advisor.prelude_scorer import PreludeScorer  # noqa: E402
from tm_advisor.database import CardDatabase  # noqa: E402
from tm_advisor.shared_data import resolve_data_path  # noqa: E402


_DB = None


def db():
    global _DB
    if _DB is None:
        _DB = CardDatabase(str(resolve_data_path("evaluations.json")))
    return _DB


PASSED = 0
FAILED: list = []


def run(name, fn):
    global PASSED
    try:
        fn()
        PASSED += 1
        print(f"\u2713 {name}")
    except AssertionError as e:
        FAILED.append((name, str(e)))
        print(f"\u2717 {name}: {e}")
    except Exception as e:
        FAILED.append((name, f"ERROR {type(e).__name__}: {e}"))
        print(f"! {name}: ERROR {type(e).__name__}: {e}")


def test_is_prelude_true_for_prelude():
    sc = PreludeScorer(db())
    assert sc.is_prelude("Huge Asteroid"), "Huge Asteroid should be prelude"
    assert sc.is_prelude("Corporate Archives"), "Corporate Archives should be prelude"


def test_is_prelude_false_for_project():
    sc = PreludeScorer(db())
    assert not sc.is_prelude("Birds"), "Birds is project card, not prelude"
    assert not sc.is_prelude("Magnetic Shield"), "Magnetic Shield is project card"


def test_opening_hand_bias_not_applied_to_prelude():
    assert db().get_opening_hand_bias("Acquired Space Agency") == 0


def test_opening_hand_bias_still_applies_to_corp():
    assert db().get_opening_hand_bias("EcoLine") == 3


def test_preludes_do_not_store_opener_metadata_in_canonical_evals():
    bad = []
    for name, data in db().cards.items():
        info = db().get_info(name)
        if not info or str(info.get("type", "")).lower() != "prelude":
            continue
        if "opening_hand_bias" in data or "opening_hand_note" in data:
            bad.append(name)
    assert not bad, f"Prelude entries still contain opener metadata: {bad}"


def test_corporate_archives_stock_13mc():
    """Corporate Archives: +13 MC flat + science tag."""
    sc = PreludeScorer(db())
    mc, reason = sc.immediate_value("Corporate Archives")
    # 13 MC stock + 4 MC science tag = ~17 MC
    assert 14 <= mc <= 20, f"expected 14-20 MC, got {mc} ({reason!r})"


def test_huge_asteroid_three_temp_steps():
    """Huge Asteroid: 3 global temp steps → 3 TR = 21 MC, no tag → -3."""
    sc = PreludeScorer(db())
    mc, reason = sc.immediate_value("Huge Asteroid")
    # 3 * 7 = 21, no tag = -3, total ~18
    assert 15 <= mc <= 22, f"expected 15-22 MC, got {mc} ({reason!r})"
    assert "globalTR" in reason, f"reason should mention global TR: {reason!r}"


def test_martian_industries_prod_plus_stock():
    """Martian Industries: +1 energy-prod, +1 steel-prod, +6 MC, building tag."""
    sc = PreludeScorer(db())
    mc, _ = sc.immediate_value("Martian Industries")
    # energy-prod 7.5 + steel-prod 8 + 6 MC + building 1.5 = ~23
    assert 20 <= mc <= 26, f"expected 20-26 MC, got {mc}"


def test_society_support_plant_energy_heat_negative_mc():
    """Society Support: +1 plant, +1 energy, +1 heat prod, -1 MC-prod."""
    sc = PreludeScorer(db())
    mc, _ = sc.immediate_value("Society Support")
    # 8 + 7.5 + 4 + (-5.5) = 14, no tag -3 = 11
    assert 8 <= mc <= 16, f"expected 8-16 MC, got {mc}"


def test_giant_solar_collector_energy_prod_venus_step():
    """Giant Solar Collector: +2 energy-prod + 1 venus step, power/space tags."""
    sc = PreludeScorer(db())
    mc, _ = sc.immediate_value("Giant Solar Collector")
    # 2*7.5 + 1*7 + power 1.5 + space 1.5 = 25
    assert 22 <= mc <= 28, f"expected 22-28 MC, got {mc}"


def test_aquifer_turbines_counts_ocean_and_energy_prod():
    """Aquifer Turbines must not be treated as empty behavior."""
    sc = PreludeScorer(db())
    mc, reason = sc.immediate_value("Aquifer Turbines")
    assert mc >= 28, f"expected ocean + energy-prod value, got {mc} ({reason!r})"
    assert "+1ocean" in reason, reason
    assert "+2enep" in reason, reason


def test_aridor_prelude_tag_bonus():
    """Aridor weights venus/earth/jovian tags higher. Giant Solar Collector
    has space+power → Aridor gets small boost; Corporate Archives (science)
    no Aridor bonus."""
    sc = PreludeScorer(db())
    mc_default, _ = sc.immediate_value("Corporate Archives")
    mc_aridor, _ = sc.immediate_value("Corporate Archives", corp_name="Aridor")
    # Aridor doesn't boost science → same value
    assert mc_default == mc_aridor, \
        f"Aridor should not boost Corporate Archives: {mc_default} vs {mc_aridor}"


def test_morning_star_venus_prelude_boost():
    """Morning Star Inc → venus tag worth more. Giant Solar Collector has space+power
    (no venus tag itself) but global venus step."""
    sc = PreludeScorer(db())
    # Use a prelude with venus tag if any
    mc_default, _ = sc.immediate_value("Giant Solar Collector")
    mc_msi, _ = sc.immediate_value("Giant Solar Collector", corp_name="Morning Star Inc")
    # No venus tag on card itself → scores equal (only tag_mul matters for tags)
    assert mc_default == mc_msi


def test_score_blend_in_range():
    """Final blended score stays in valid 0-100."""
    sc = PreludeScorer(db())
    for name in ["Huge Asteroid", "Corporate Archives", "Martian Industries",
                 "Society Support", "Giant Solar Collector", "Great Aquifer"]:
        s = sc.score(name)
        assert 0 <= s <= 100, f"{name} score out of range: {s}"


def test_great_aquifer_override_applied():
    """Great Aquifer has empty behavior but override adds ocean value."""
    sc = PreludeScorer(db())
    mc, reason = sc.immediate_value("Great Aquifer")
    # Empty behavior but override +14 + no-tag -3 = 11
    assert mc >= 10, f"Great Aquifer override should push mc >= 10, got {mc} ({reason!r})"
    assert "ovr" in reason


def test_empty_behavior_prelude_falls_back_to_base():
    """Pathfinder prelude with empty behavior (Central Reservoir) → base COTD score."""
    sc = PreludeScorer(db())
    base = db().get_score("Central Reservoir")
    assert base >= 80, "fixture assumes Central Reservoir base >= 80"
    result = sc.score("Central Reservoir")
    # Pure base (no MC dilution because behavior is empty)
    assert result == base


def test_business_empire_production_behavior_not_empty():
    """Business Empire must score from +6 MC production, not empty-behavior fallback."""
    sc = PreludeScorer(db())
    mc, reason = sc.immediate_value("Business Empire")
    assert mc >= 35, f"expected +6 MC-prod value, got {mc} ({reason!r})"
    assert "+6megp" in reason, reason
    result = sc.score("Business Empire")
    assert result >= 82, f"expected A-range production score, got {result}"


def test_override_still_wins_over_empty_behavior_path():
    """Great Aquifer has empty behavior BUT an override — override applies."""
    sc = PreludeScorer(db())
    # Override adds +14 to mc value; score should show MC-blend effect
    mc, reason = sc.immediate_value("Great Aquifer")
    assert "ovr" in reason, "override should be applied for Great Aquifer"


def test_score_unknown_prelude_uses_base():
    """Unknown prelude name falls back to base score safely (no crash)."""
    sc = PreludeScorer(db())
    # "Made Up Prelude" not in db → db.get_score returns 50 default
    s = sc.score("Made Up Prelude")
    assert 0 <= s <= 100


if __name__ == "__main__":
    names = [n for n in dir() if n.startswith("test_") and callable(globals()[n])]
    for n in sorted(names):
        run(n, globals()[n])
    print(f"\n{PASSED} passed, {len(FAILED)} failed")
    for n, e in FAILED:
        print(f"  {n}: {e}")
    sys.exit(0 if not FAILED else 1)
