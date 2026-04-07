import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CANONICAL_EXTENSION_GENERATED_DIR = ROOT / 'packages' / 'tm-data' / 'generated' / 'extension'
LEGACY_EXTENSION_DATA_DIR = ROOT / 'extension' / 'data'


def get_canonical_generated_extension_path(filename: str) -> Path:
    return CANONICAL_EXTENSION_GENERATED_DIR / filename


def get_legacy_generated_extension_path(filename: str) -> Path:
    return LEGACY_EXTENSION_DATA_DIR / filename


def resolve_generated_extension_path(filename: str) -> Path:
    canonical = get_canonical_generated_extension_path(filename)
    if canonical.exists():
        return canonical
    return get_legacy_generated_extension_path(filename)


def read_generated_extension_file(filename: str, encoding: str = 'utf-8') -> str:
    return resolve_generated_extension_path(filename).read_text(encoding=encoding)


def write_generated_extension_file(filename: str, content: str, encoding: str = 'utf-8'):
    canonical = get_canonical_generated_extension_path(filename)
    legacy = get_legacy_generated_extension_path(filename)
    canonical.parent.mkdir(parents=True, exist_ok=True)
    legacy.parent.mkdir(parents=True, exist_ok=True)
    canonical.write_text(content, encoding=encoding)
    legacy.write_text(content, encoding=encoding)
    return canonical, legacy


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
    result = subprocess.check_output(['node', '-e', script, target, var_name], text=True)
    return json.loads(result)
