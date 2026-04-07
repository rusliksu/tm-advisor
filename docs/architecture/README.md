# TM Architecture Docs Index

Используй этот индекс как entrypoint перед structural changes в `tm-tierlist/`.

## Какой документ открывать
- `tm-modules-rfc.md`
  - если нужно понять целевую архитектуру модулей
- `tm-ownership-map.md`
  - если нужно понять, какой модуль владеет файлами и папками
- `tm-dependency-graph.md`
  - если нужно понять, какие зависимости допустимы
- `tm-migration-checklist.md`
  - если нужно понять порядок реорганизации по фазам
- `tm-site-boundary.md`
  - если задача про сайт, гайды, tierlist pages или GitHub Pages deploy
- `tm-brain-extraction-plan.md`
  - если задача про общий `tm-brain` для extension и smartbot

## Быстрый маршрут
- Большая реорганизация:
  1. `tm-modules-rfc.md`
  2. `tm-ownership-map.md`
  3. `tm-dependency-graph.md`
  4. `tm-migration-checklist.md`
- Move/rename:
  1. `tm-ownership-map.md`
  2. `tm-dependency-graph.md`
- Shared data / source of truth:
  1. `tm-modules-rfc.md`
  2. `tm-ownership-map.md`
  3. `tm-migration-checklist.md`
- Сайт и гайды:
  1. `tm-site-boundary.md`
  2. `tm-ownership-map.md`
  3. `tm-migration-checklist.md`
- `tm-brain` / общая логика bot и extension:
  1. `tm-brain-extraction-plan.md`
  2. `tm-dependency-graph.md`
  3. `tm-migration-checklist.md`

## Правило
Если правка затрагивает границы между `site`, `extension`, `smartbot`, `advisor`, `shared data` или `shared brain`, сначала открой релевантные документы из этого индекса, потом планируй изменения.
