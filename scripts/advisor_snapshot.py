#!/usr/bin/env python3
"""Compatibility wrapper for the canonical tm-advisor-py snapshot entrypoint."""

from __future__ import annotations

import importlib.util
import runpy
import sys
from functools import lru_cache
from pathlib import Path


ENTRYPOINT = Path(__file__).resolve().parents[1] / "apps" / "tm-advisor-py" / "entrypoints" / "advisor_snapshot.py"
ENTRYPOINT_DIR = str(ENTRYPOINT.parent)


@lru_cache(maxsize=1)
def _load_entrypoint_module():
    if ENTRYPOINT_DIR not in sys.path:
        sys.path.insert(0, ENTRYPOINT_DIR)
    spec = importlib.util.spec_from_file_location("tm_advisor_snapshot_entrypoint", ENTRYPOINT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load advisor snapshot entrypoint: {ENTRYPOINT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def snapshot(player_id: str) -> dict:
    module = _load_entrypoint_module()
    return module.snapshot(player_id)


def snapshot_from_raw(raw: dict) -> dict:
    module = _load_entrypoint_module()
    return module.snapshot_from_raw(raw)


def format_snapshot_summary(data: dict) -> str:
    module = _load_entrypoint_module()
    return module.format_snapshot_summary(data)


def _get_runtime_bundle():
    module = _load_entrypoint_module()
    return module._get_runtime_bundle()


def main() -> None:
    if ENTRYPOINT_DIR not in sys.path:
        sys.path.insert(0, ENTRYPOINT_DIR)
    runpy.run_path(str(ENTRYPOINT), run_name="__main__")


if __name__ == "__main__":
    main()
