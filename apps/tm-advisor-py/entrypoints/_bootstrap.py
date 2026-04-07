"""Bootstrap helpers for tm-advisor-py entrypoints."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT / "scripts"


def add_repo_root() -> None:
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))


def add_scripts_dir() -> None:
    if str(SCRIPTS_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPTS_DIR))
