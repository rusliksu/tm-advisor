"""Canonical-first shared data access for tm_advisor."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
CANONICAL_EXTENSION_GENERATED_DIR = ROOT / "packages" / "tm-data" / "generated" / "extension"
LEGACY_EXTENSION_DATA_DIR = ROOT / "extension" / "data"


def resolve_data_path(*parts: str) -> Path:
    return DATA_DIR.joinpath(*parts)


def read_data_text(*parts: str, encoding: str = "utf-8") -> str:
    return resolve_data_path(*parts).read_text(encoding=encoding)


def load_data_json(*parts: str):
    return json.loads(read_data_text(*parts))


def resolve_generated_extension_path(filename: str) -> Path:
    canonical = CANONICAL_EXTENSION_GENERATED_DIR / filename
    if canonical.exists():
        return canonical
    return LEGACY_EXTENSION_DATA_DIR / filename


def read_generated_extension_file(filename: str, encoding: str = "utf-8") -> str:
    return resolve_generated_extension_path(filename).read_text(encoding=encoding)


def load_generated_extension_object(filename: str, var_name: str):
    target = str(resolve_generated_extension_path(filename))
    script = (
        "const fs=require('fs');"
        "const file=process.argv[1];"
        "const varName=process.argv[2];"
        "const raw=fs.readFileSync(file,'utf8').replace(/^(const|let)\\s+/gm,'var ');"
        "const value=(new Function(raw + '\\nreturn ' + varName + ';'))();"
        "process.stdout.write(JSON.stringify(value));"
    )
    result = subprocess.check_output(["node", "-e", script, target, var_name], text=True)
    return json.loads(result)
