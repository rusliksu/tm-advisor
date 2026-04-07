# TM Site Boundary v0

## Почему это первый practical scope
Исходная проблема была про сайт: гайды пропали с `https://rusliksu.github.io/tm-tierlist/`, а восстановление оказалось грязным из-за того, что site files, generated outputs и другие рабочие потоки лежат вперемешку.

Первый безопасный шаг — формально выделить `tm-site` как отдельную зону ответственности, не трогая пока `advisor`, `smartbot` и shared brain.

## Что относится к `tm-site`
- `index.html`
- `*guide.html`
- `tierlist_*.html`
- `output/tierlist_*.html`
- `favicon.ico`
- `favicon.png`
- `og-image.png`
- site-owned content files for guides and long-form pages

## Что не относится к `tm-site`
- `extension/**`
- `bot/**`
- `scripts/tm_advisor/**`
- runtime logs и game snapshots
- локальные tmp files

## Source vs generated
- source of truth for ratings and card evaluations:
  - `data/evaluations.json`
- generated outputs:
  - `output/tierlist_*.html`
  - root html outputs copied/published for site use
  - consumer-specific bundles

## Правило для правок сайта
- восстановление гайдов, landing page changes и GitHub Pages deploy path должны рассматриваться как изменения внутри `tm-site`
- такие правки не должны тянуть изменения в `smartbot`, `advisor` или `tm-brain`, если это не доказано необходимостью

## Ближайшая цель
Сделать так, чтобы любой агент, который чинит сайт или гайды, видел:
- какие файлы принадлежат сайту
- какие файлы generated
- где канон данных
- что не надо трогать в том же change set
