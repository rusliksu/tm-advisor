# tm-smartbot

Ownership module for the smartbot runtime.

Current transition model:
- runtime files still live under `bot/`
- shared JS logic comes from `packages/tm-brain-js/src/brain-core.js`
- bot runtime consumes the mirrored core under `bot/shared/brain-core.js`
- bot card metadata still lives in `bot/card_*.js` during this refactor phase

Scope of this module:
- gameplay bot runtime
- auto-join runtime
- bot-specific card data bootstrap
- bot runtime regressions and smoke tests

Canonical test commands:
- `npm run test:bot`

Shared dependencies:
- `packages/tm-brain-js/src/brain-core.js`

Current local runtime-owned data:
- `bot/card_data.js`
- `bot/card_global_reqs.js`
- `bot/card_tags.js`
- `bot/card_vp.js`

Out of scope:
- `apps/tm-site/**`
- `extension/**`
- `scripts/tm_advisor/**`
- canonical/generated extension data bundles
