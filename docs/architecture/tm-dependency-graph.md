# TM Dependency Graph v0

## Цель
Зафиксировать допустимые зависимости между модулями до начала реального split.

## Разрешённые зависимости
- `tm-site` -> `tm-data`
- `tm-extension` -> `tm-data`
- `tm-extension` -> `tm-brain-js`
- `tm-smartbot` -> `tm-data`
- `tm-smartbot` -> `tm-brain-js`
- `tm-advisor-py` -> exported data/contracts from `tm-data`
- `tm-data` -> `tm-domain`
- `tm-brain-js` -> `tm-domain`

## Запрещённые зависимости
- `tm-site` -> `tm-extension`
- `tm-site` -> `tm-smartbot`
- `tm-site` -> `tm-advisor-py`
- `tm-extension` -> `tm-smartbot`
- `tm-extension` -> `tm-advisor-py`
- `tm-smartbot` -> `tm-extension`
- `tm-smartbot` -> `tm-advisor-py`
- `tm-advisor-py` -> runtime internals of `tm-extension` or `tm-smartbot`

## Transitional rules
- `extension/data/*.json.js` можно временно оставлять на старом пути, но это generated output, а не source
- `bot/tm-brain.js` и `extension/tm-brain.js` можно временно оставлять как wrappers, пока идёт extraction shared brain
- `tm-site` должен зависеть только от site assets и generated web outputs, не от bot/advisor runtime files
