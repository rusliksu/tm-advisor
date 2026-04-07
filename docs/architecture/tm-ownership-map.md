# TM Ownership Map v0

## Цель
Зафиксировать, какой модуль владеет какими путями до любых переносов файлов.

## Ownership
- `tm-site`
  - `index.html`
  - `*guide.html`
  - `tierlist_*.html`
  - `output/tierlist_*.html`
  - `favicon*`
  - `og-image.png`
  - guide markdown и site content в `docs/` и top-level markdown, если они используются как источник контента
- `tm-extension`
  - `extension/**`, кроме generated data ownership, который логически должен перейти к `tm-data`
- `tm-smartbot`
  - `bot/**`, кроме shared JS logic, который должен перейти к `tm-brain-js`
- `tm-advisor-py`
  - `scripts/tm_advisor/**`
  - `scripts/tm_advisor.py`
  - `scripts/advisor_snapshot.py`
- `legacy`
  - `legacy/tm-advisor-py/tm_advisor_old.py`
- `tm-data`
  - `data/evaluations.json`
  - canonical card metadata, effects, combos, translations
  - generators для derived bundles
- `tm-brain-js`
  - shared logic, которая сейчас размазана между `extension/tm-brain.js` и `bot/tm-brain.js`

## Conflict zones
- `extension/data/*.json.js`
  - физически рядом с extension, но owner должен быть `tm-data`
- `extension/tm-brain.js` и `bot/tm-brain.js`
  - owner должен быть один: `tm-brain-js`
- repo root
  - сейчас тут смешаны site files, generated outputs и runtime artifacts

## Правило
Нельзя начинать move/rename, пока не понятно, чей это путь по ownership map.
