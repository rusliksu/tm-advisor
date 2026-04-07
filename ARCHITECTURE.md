# ARCHITECTURE.md — TM Tierlist Entry Point

Используй этот файл для любых structural changes в `tm-tierlist/`.

Сначала открой:
1. `docs/architecture/README.md`

Потом по задаче:
- `tm-modules-rfc.md` — что за модули и зачем
- `tm-ownership-map.md` — кто владеет файлами
- `tm-dependency-graph.md` — кто от кого может зависеть
- `tm-migration-checklist.md` — в каком порядке делать реорганизацию
- `tm-site-boundary.md` — что относится к сайту, гайдам и деплою
- `tm-brain-extraction-plan.md` — если задача про `tm-brain`

Базовые правила:
- `data/evaluations.json` — canonical source of truth
- generated files не source of truth
- приложения не импортируют друг друга напрямую
- реорганизацию не начинать с массового move/rename
- восстановление и деплой гайдов должны идти через `tm-site` ownership, а не через случайные cross-module правки
