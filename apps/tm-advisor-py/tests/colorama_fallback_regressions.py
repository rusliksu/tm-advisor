#!/usr/bin/env python3
"""Regression for running advisor snapshot without external colorama."""

from __future__ import annotations

import importlib.util
import sys
import builtins
from contextlib import contextmanager
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
ENTRYPOINT = ROOT / "apps" / "tm-advisor-py" / "entrypoints" / "advisor_snapshot.py"
ENTRYPOINT_DIR = str(ENTRYPOINT.parent)
if ENTRYPOINT_DIR not in sys.path:
    sys.path.insert(0, ENTRYPOINT_DIR)


def _build_raw_state() -> dict:
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
        "cardsInHandNbr": 1,
        "tableau": [{"name": "Teractor"}],
        "tags": {"earth": 1},
    }
    opp = {
        "color": "blue",
        "name": "opp",
        "megaCredits": 18,
        "terraformRating": 22,
        "cardsInHandNbr": 1,
        "tableau": [],
        "tags": {},
    }
    return {
        "thisPlayer": me,
        "players": [me, opp],
        "pickedCorporationCard": [{"name": "Teractor"}],
        "cardsInHand": [
            {"name": "Sponsors", "calculatedCost": 6, "tags": ["Earth"]},
        ],
        "game": {
            "generation": 2,
            "phase": "action",
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


@contextmanager
def _block_colorama_import():
    original_import = builtins.__import__
    saved_colorama = sys.modules.pop("colorama", None)

    def blocked_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "colorama" or name.startswith("colorama."):
            raise ModuleNotFoundError("No module named 'colorama'")
        return original_import(name, globals, locals, fromlist, level)

    builtins.__import__ = blocked_import
    try:
        yield
    finally:
        builtins.__import__ = original_import
        if saved_colorama is not None:
            sys.modules["colorama"] = saved_colorama


def main():
    spec = importlib.util.spec_from_file_location("tm_advisor_snapshot_entrypoint", ENTRYPOINT)
    assert spec is not None and spec.loader is not None

    with _block_colorama_import():
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        snap = module.snapshot_from_raw(_build_raw_state())
        rendered = module.format_snapshot_summary(snap)

    assert snap["summary"]["best_move"], snap
    assert "Snapshot" in rendered, rendered
    print("advisor colorama fallback regressions: OK")


if __name__ == "__main__":
    main()
