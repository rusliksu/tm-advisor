"""Sync the tm-site source tree into the current GitHub Pages publish layout.

The source-owned site lives under ``apps/tm-site/src`` while the current publish
target remains the repository root and ``output/`` directory.
"""

from __future__ import annotations

import argparse
import filecmp
import json
import re
import shutil
from pathlib import Path


def load_manifest(repo_root: Path) -> dict:
    manifest_path = repo_root / "apps" / "tm-site" / "site-manifest.json"
    with manifest_path.open(encoding="utf-8") as fh:
        return json.load(fh)


def ensure_exists(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Missing site source file: {path}")


def sync_file(src: Path, dst: Path, dry_run: bool) -> None:
    ensure_exists(src)
    if dry_run:
        print(f"SYNC {src} -> {dst}")
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    print(f"SYNC {src} -> {dst}")


def check_file(src: Path, dst: Path) -> bool:
    ensure_exists(src)
    if not dst.exists():
        print(f"MISSING publish file: {dst}")
        return False
    same = filecmp.cmp(src, dst, shallow=False)
    if not same:
        print(f"OUT OF SYNC: {src} != {dst}")
    return same


def guide_files_from_manifest(root_files: list[Path]) -> list[Path]:
    return [rel for rel in root_files if rel.name.endswith("-guide.html") or rel.name == "strategy-guide.html"]


def check_guide_links(source_root: Path, guide_files: list[Path]) -> bool:
    index_path = source_root / "index.html"
    ensure_exists(index_path)
    index_html = index_path.read_text(encoding="utf-8")
    hrefs = set(re.findall(r'href=["\']([^"\']+)["\']', index_html))
    ok = True
    for rel in guide_files:
        if rel.name not in hrefs:
            print(f"MISSING guide link in index.html: {rel.name}")
            ok = False
    return ok


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Only verify that all source files exist.")
    parser.add_argument("--dry-run", action="store_true", help="Print copy operations without writing files.")
    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parents[2]
    manifest = load_manifest(repo_root)
    source_root = repo_root / manifest["source_root"]

    root_files = [Path(item) for item in manifest["root_files"]]
    output_files = [Path("output") / item for item in manifest["output_files"]]
    guide_files = guide_files_from_manifest(root_files)

    if args.check:
        ok = True
        for rel in root_files:
            ok = check_file(source_root / rel, repo_root / rel) and ok
        for rel in output_files:
            ok = check_file(source_root / rel, repo_root / rel) and ok
        ok = check_guide_links(source_root, guide_files) and ok
        if ok:
            print("tm-site source check: OK")
            return 0
        print("tm-site source check: FAILED")
        return 1

    for rel in root_files:
        sync_file(source_root / rel, repo_root / rel, dry_run=args.dry_run)
    for rel in output_files:
        sync_file(source_root / rel, repo_root / rel, dry_run=args.dry_run)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
