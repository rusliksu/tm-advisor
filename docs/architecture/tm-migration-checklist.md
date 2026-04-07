# TM Migration Checklist v0

## Batch 1
- добавить architecture routing в `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`
- зафиксировать ownership map
- зафиксировать dependency graph
- выделить `tm-site` boundary как первый practical scope

## Batch 2
- формализовать `tm-data`
- зафиксировать canonical inputs и derived outputs
- перестать считать generated files source of truth

## Batch 3
- начать extraction `tm-brain-js`
- сначала diff map, потом API draft, потом small-slice extraction

## Дальше
- split `tm-site`
- split `tm-extension`
- split `tm-smartbot`
- split `tm-advisor-py`

## Стоп-условия
- непонятно, кто owner у пути
- для изменения нужен cross-app import
- generated file пытаются править как canonical source
- structural change смешался с unrelated scoring fixes
