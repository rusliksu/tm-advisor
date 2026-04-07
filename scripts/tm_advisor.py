#!/usr/bin/env python3
"""Compatibility wrapper for the canonical tm-advisor-py entrypoint."""

from __future__ import annotations

import runpy
from pathlib import Path


ENTRYPOINT = Path(__file__).resolve().parents[1] / "apps" / "tm-advisor-py" / "entrypoints" / "tm_advisor.py"

if __name__ == "__main__":
    runpy.run_path(str(ENTRYPOINT), run_name="__main__")
