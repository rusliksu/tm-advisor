# TM Modules RFC v0

## Цель
Разрезать `tm-tierlist` на логические модули так, чтобы сайт с гайдами, тир-лист, extension, smartbot и advisor жили отдельно, а общие данные и общая JS-логика имели одного owner.

## Целевые модули
- `apps/tm-site`
  - landing, guides, tierlist pages, static assets, deploy
- `apps/tm-extension`
  - overlay, popup, watcher, advisor panel
- `apps/tm-smartbot`
  - bot runtime, auto-join, bot-specific orchestration
- `apps/tm-advisor-py`
  - Python advisor, snapshot, backtest, analysis
- `packages/tm-data`
  - canonical data, generators, schemas, bundles
- `packages/tm-brain-js`
  - shared JS scoring and heuristic logic
- `packages/tm-domain`
  - ids, enums, contracts, shared metadata

## Основные правила
- `data/evaluations.json` остаётся canonical source of truth
- generated outputs не считаются primary edit target
- приложения не импортируют друг друга напрямую
- shared JS logic не должна жить в двух расходящихся копиях
- first practical boundary — `tm-site`, потому что исходная проблема проявилась именно там: пропавшие гайды и неочевидный deploy path

## Ближайший порядок
1. Зафиксировать routing и ownership
2. Зафиксировать `tm-site` boundary
3. Формализовать `tm-data`
4. Выделить `tm-brain-js`
5. Потом уже делать более глубокий split приложений
