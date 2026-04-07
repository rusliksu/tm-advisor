# tm-data

Canonical shared data owner for `tm-tierlist`.

Current scope in this refactor slice:
- canonical input ownership remains in `data/`
- generated extension bundle ownership moves here:
  - `packages/tm-data/generated/extension/ratings.json.js`
  - `packages/tm-data/generated/extension/combos.json.js`
  - `packages/tm-data/generated/extension/names_ru.json.js`
  - `packages/tm-data/generated/extension/corps.json.js`
  - `packages/tm-data/generated/extension/card_descriptions.js`
  - `packages/tm-data/generated/extension/card_tag_reqs.js`
  - `packages/tm-data/generated/extension/card_tags.js`
  - `packages/tm-data/generated/extension/card_vp.js`
  - `packages/tm-data/generated/extension/card_data.js`
- generated smartbot bundle ownership moves here:
  - `packages/tm-data/generated/bot/card_data.js`
  - `packages/tm-data/generated/bot/card_global_reqs.js`
  - `packages/tm-data/generated/bot/card_tags.js`
  - `packages/tm-data/generated/bot/card_vp.js`

Compatibility:
- `extension/data/*.json.js` remains the runtime mirror consumed by the current
  extension and scripts
- `extension/data/corps.json.js`, `card_descriptions.js`, `card_tag_reqs.js`, `card_tags.js`, `card_vp.js`, `card_data.js` remain the runtime
  mirrors consumed by the current extension and scripts
- build scripts must write to `packages/tm-data/generated/extension` first and
  mirror the same payload to `extension/data`
- `bot/card_*.js` remains the runtime mirror consumed by the current smartbot
- sync/check scripts must keep `packages/tm-data/generated/bot` and `bot/`
  byte-identical for the smartbot bundle
