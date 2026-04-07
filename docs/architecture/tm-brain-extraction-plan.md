# TM Brain Extraction Plan v0

## Цель
Выделить общий JS brain для `tm-extension` и `tm-smartbot` без поломки поведения и без хаотичного merge двух текущих реализаций.

## Источник проблемы
Сейчас shared JS logic живёт в двух местах:
- `extension/tm-brain.js`
- `bot/tm-brain.js`

Это блокирует clean split модулей и повышает риск divergence.

## План
1. Собрать diff map между двумя файлами
2. Разметить блоки как shared, extension-only, smartbot-only
3. Описать public API shared brain
4. Переносить только small verified slices
5. Оставлять compatibility wrappers, пока оба consumer'а не переведены

## Правила
- не делать big bang rewrite
- не тянуть туда DOM/UI code
- не тянуть туда bot runtime orchestration
- не смешивать extraction brain и scoring retune
