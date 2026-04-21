"""Canonical-first shared data access for tm_advisor."""

from __future__ import annotations

from functools import lru_cache
import json
import re
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


def _file_cache_key(path: Path) -> tuple[str, int, int]:
    stat = path.stat()
    return str(path), stat.st_mtime_ns, stat.st_size


@lru_cache(maxsize=None)
def _load_json_file_cached(path_str: str, _mtime_ns: int, _size: int):
    return json.loads(Path(path_str).read_text(encoding="utf-8"))


def load_json_file(path: str | Path):
    target = Path(path)
    return _load_json_file_cached(*_file_cache_key(target))


def resolve_generated_extension_path(filename: str) -> Path:
    canonical = CANONICAL_EXTENSION_GENERATED_DIR / filename
    if canonical.exists():
        return canonical
    return LEGACY_EXTENSION_DATA_DIR / filename


def read_generated_extension_file(filename: str, encoding: str = "utf-8") -> str:
    return resolve_generated_extension_path(filename).read_text(encoding=encoding)


def _maybe_parse_assigned_json(raw_text: str, var_name: str):
    text = str(raw_text or "")
    if not text.strip():
        return None

    assign_match = re.search(rf"\b(?:const|let|var)\s+{re.escape(var_name)}\s*=", text)
    if not assign_match:
        return None

    expr = text[assign_match.end():].lstrip()
    if not expr:
        return None

    if not expr or expr[0] not in "{[":
        return None

    literal = _extract_json_literal(expr)
    if not literal:
        return None

    try:
        return json.loads(literal)
    except Exception:
        return None


def _extract_json_literal(expr: str) -> str | None:
    if not expr:
        return None

    opener = expr[0]
    if opener == "{":
        closer = "}"
    elif opener == "[":
        closer = "]"
    else:
        return None

    depth = 0
    in_string = False
    escape = False
    quote = ""

    for idx, ch in enumerate(expr):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                in_string = False
            continue

        if ch == '"' or ch == "'":
            in_string = True
            quote = ch
            continue

        if ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return expr[: idx + 1]

    return None


@lru_cache(maxsize=None)
def _load_generated_extension_object_cached(
    path_str: str,
    var_name: str,
    _mtime_ns: int,
    _size: int,
):
    raw_text = Path(path_str).read_text(encoding="utf-8")
    parsed = _maybe_parse_assigned_json(raw_text, var_name)
    if parsed is not None:
        return parsed

    script = (
        "const fs=require('fs');"
        "const file=process.argv[1];"
        "const varName=process.argv[2];"
        "const raw=fs.readFileSync(file,'utf8').replace(/^(const|let)\\s+/gm,'var ');"
        "const value=(new Function(raw + '\\nreturn ' + varName + ';'))();"
        "process.stdout.write(JSON.stringify(value));"
    )
    result = subprocess.check_output(["node", "-e", script, path_str, var_name], text=True)
    return json.loads(result)


def load_generated_extension_object(filename: str, var_name: str):
    target = resolve_generated_extension_path(filename)
    path_str, mtime_ns, size = _file_cache_key(target)
    return _load_generated_extension_object_cached(path_str, var_name, mtime_ns, size)
