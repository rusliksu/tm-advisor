from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[3]
SITE_OUTPUT_DIR = BASE_DIR / "apps" / "tm-site" / "src" / "output"
SOURCE_GENERATOR = BASE_DIR / "scripts" / "generate_visual_tierlist.py"

REQUIRED_MARKERS = [
    "const cardRecords = cardEls.map((el) => {",
    "const tierRows = Array.from(document.querySelectorAll('.tier-row')).map((row) => ({",
    "function scheduleApplyFilters() {",
    "function writeHashNow() {",
    "filterCountEl.textContent = hasFilters ?",
    "flushScheduledFilters();",
]

LEGACY_MARKERS = [
    "const cardTags = el.dataset.tags ? el.dataset.tags.split(',') : [];",
    "const cardMechanics = el.dataset.mechanics ? el.dataset.mechanics.split(',') : [];",
    "const cardRoles = el.dataset.roles ? el.dataset.roles.split(',') : [];",
    "const visibleCards = row.querySelectorAll('.card:not(.filtered-out)');",
    "const input = document.getElementById('searchInput');",
]


def main():
    generator_content = SOURCE_GENERATOR.read_text(encoding="utf-8")
    for marker in REQUIRED_MARKERS:
        assert marker in generator_content, f"{SOURCE_GENERATOR.name}: missing marker {marker!r}"
    for marker in LEGACY_MARKERS:
        assert marker not in generator_content, f"{SOURCE_GENERATOR.name}: legacy marker still present {marker!r}"

    html_files = sorted(
        path
        for path in SITE_OUTPUT_DIR.glob("tierlist_*.html")
        if path.stem != "tierlist_all"
    )
    assert html_files, f"No generated tierlist pages found in {SITE_OUTPUT_DIR}"

    for html_file in html_files:
        content = html_file.read_text(encoding="utf-8")
        for marker in REQUIRED_MARKERS:
            assert marker in content, f"{html_file.name}: missing marker {marker!r}"
        for marker in LEGACY_MARKERS:
            assert marker not in content, f"{html_file.name}: legacy marker still present {marker!r}"

    print("tierlist perf regressions: OK")


if __name__ == "__main__":
    main()
