#!/usr/bin/env python3
"""Golden-file baseline regression for synergy.adjusted_score.

Snapshots scores for ~50 representative cards across 3 typical game states
(opening, mid-game, late-game). On every run, re-scores the same matrix and
compares to the saved baseline. A diff on more than 10% of cells or a delta
exceeding ±5 on any cell indicates a regression.

Regenerate baseline: `python apps/tm-advisor-py/tests/baseline_regressions.py --regenerate`
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
BASELINE_PATH = FIXTURE_DIR / "score_baseline.json"

from tm_advisor.database import CardDatabase  # noqa: E402
from tm_advisor.combo import ComboDetector  # noqa: E402
from tm_advisor.card_parser import CardEffectParser  # noqa: E402
from tm_advisor.synergy import SynergyEngine  # noqa: E402
from tm_advisor.threat import OpponentReactiveAdjuster  # noqa: E402
from tm_advisor.feasibility import FeasibilityAdjuster  # noqa: E402
from tm_advisor.prelude_scorer import PreludeScorer  # noqa: E402
from tm_advisor.requirements import RequirementsChecker  # noqa: E402
from tm_advisor.models import GameState  # noqa: E402
from tm_advisor.shared_data import resolve_data_path  # noqa: E402


REPRESENTATIVE_CARDS = [
    # S
    "Sky Docks", "Point Luna", "Project Eden",
    # A
    "CrediCor", "Manutech", "Earth Catapult", "Mars University", "Solar Logistics",
    "Hermetic Order of Mars", "Imported Hydrogen", "Cutting Edge Technology",
    # B
    "Teractor", "Atmospheric Enhancers", "Birds", "Red Ships", "Mining Colony",
    "Venus Orbital Survey", "Saturn Surfing", "Electro Catapult",
    # C
    "Ceres Tech Market", "Vermin", "Virus", "Floating Refinery", "Venus Shuttles",
    "Protected Growth", "Lava Flows", "Asteroid Deflection System",
    # D
    "Aerosport Tournament", "Food Factory", "Titan Air-scrapping", "Rotator Impacts",
    "St. Joseph", "Hackers",
    # Preludes
    "Huge Asteroid", "Martian Industries", "Society Support", "Corporate Archives",
    "Great Aquifer", "Experimental Forest",
    # Attack cards
    "Asteroid", "Big Asteroid", "Comet", "Sabotage", "Hired Raiders",
    # Mining
    "Mining Rights", "Mining Area",
    # Opp-reactive
    "Ants", "Herbivores", "Small Animals", "Predators", "Decomposers",
]


def _scenario(name: str, tags: dict, mc: int, oxygen: int, temp: int,
              oceans: int, venus: int, tr: int, gen: int, phase: str):
    return {
        "label": name,
        "data": {
            "thisPlayer": {
                "color": "red", "name": "me",
                "megaCredits": mc, "megaCreditProduction": 3,
                "steel": 1, "titanium": 0, "plants": 1, "energy": 1, "heat": 1,
                "steelProduction": 1, "titaniumProduction": 0,
                "plantProduction": 1, "energyProduction": 1, "heatProduction": 1,
                "tableau": [], "tags": tags,
                "cardsInHandNbr": 5, "terraformRating": tr,
            },
            "players": [
                {"color": "red", "name": "me",
                 "megaCredits": mc, "megaCreditProduction": 3,
                 "terraformRating": tr, "tags": tags, "tableau": [],
                 "cardsInHandNbr": 5},
                {"color": "blue", "name": "opp",
                 "megaCredits": 25, "megaCreditProduction": 2,
                 "terraformRating": tr - 2, "tags": {}, "tableau": [],
                 "cardsInHandNbr": 4},
            ],
            "game": {
                "generation": gen, "phase": phase,
                "oxygenLevel": oxygen, "temperature": temp,
                "oceans": oceans, "venusScaleLevel": venus,
                "milestones": [], "awards": [], "colonies": [], "spaces": [],
                "gameOptions": {"expansions": {"colonies": True, "venus": True}},
            },
        },
    }


SCENARIOS = [
    _scenario("opening", tags={"building": 1}, mc=40, oxygen=0, temp=-30,
              oceans=0, venus=0, tr=20, gen=1, phase="action"),
    _scenario("mid", tags={"building": 4, "earth": 2, "science": 1}, mc=35,
              oxygen=5, temp=-18, oceans=3, venus=8, tr=28, gen=5, phase="action"),
    _scenario("late", tags={"building": 8, "earth": 4, "science": 3, "space": 2},
              mc=30, oxygen=12, temp=4, oceans=8, venus=20, tr=38, gen=9, phase="action"),
]


def _build_engine():
    db = CardDatabase(str(resolve_data_path("evaluations.json")))
    effect_parser = CardEffectParser(db)
    combo = ComboDetector(effect_parser, db)
    threat = OpponentReactiveAdjuster(db)
    req = RequirementsChecker(str(resolve_data_path("all_cards.json")))
    feas = FeasibilityAdjuster(req, db)
    prelude = PreludeScorer(db)
    synergy = SynergyEngine(db, combo, threat_adjuster=threat,
                            feasibility_adjuster=feas, prelude_scorer=prelude)
    return db, synergy


def compute_matrix() -> dict:
    db, synergy = _build_engine()
    matrix = {}
    for scen in SCENARIOS:
        state = GameState(scen["data"])
        row = {}
        for name in REPRESENTATIVE_CARDS:
            info = db.get_info(name)
            if info is None:
                continue
            tags = info.get("tags") or []
            try:
                score = synergy.adjusted_score(
                    name, tags, state.me.corp, state.generation,
                    dict(state.me.tags), state,
                )
            except Exception as e:
                score = f"ERR:{type(e).__name__}"
            row[name] = score
        matrix[scen["label"]] = row
    return matrix


def _save(matrix):
    FIXTURE_DIR.mkdir(exist_ok=True)
    BASELINE_PATH.write_text(
        json.dumps(matrix, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def _load() -> dict | None:
    if not BASELINE_PATH.exists():
        return None
    return json.loads(BASELINE_PATH.read_text(encoding="utf-8"))


MAX_CELL_DELTA = 5
MAX_PCT_CELLS_CHANGED = 10.0


def main_check():
    current = compute_matrix()
    baseline = _load()
    if baseline is None:
        _save(current)
        print(f"No baseline found — saved current matrix to {BASELINE_PATH}")
        print(f"{sum(len(r) for r in current.values())} cells captured.")
        return 0

    total = 0
    changed = 0
    big_deltas = []
    for scen, row in current.items():
        base_row = baseline.get(scen, {})
        for name, score in row.items():
            total += 1
            base = base_row.get(name)
            if base is None:
                continue
            if not isinstance(score, (int, float)) or not isinstance(base, (int, float)):
                if score != base:
                    changed += 1
                    big_deltas.append((scen, name, base, score))
                continue
            delta = score - base
            if abs(delta) > 0.5:
                changed += 1
            if abs(delta) > MAX_CELL_DELTA:
                big_deltas.append((scen, name, base, score))

    pct = 100 * changed / total if total else 0
    print(f"baseline compare: {changed}/{total} cells changed ({pct:.1f}%)")
    if big_deltas:
        print(f"cells with delta > ±{MAX_CELL_DELTA}:")
        for scen, name, base, cur in big_deltas[:10]:
            print(f"  [{scen}] {name}: {base} → {cur}")
    if pct > MAX_PCT_CELLS_CHANGED or big_deltas:
        print("FAIL: baseline drift exceeded threshold")
        return 1
    print("baseline regression OK")
    return 0


if __name__ == "__main__":
    if "--regenerate" in sys.argv:
        matrix = compute_matrix()
        _save(matrix)
        print(f"Regenerated baseline: {BASELINE_PATH}")
        sys.exit(0)
    sys.exit(main_check())
