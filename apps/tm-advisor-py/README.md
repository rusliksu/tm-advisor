# tm-advisor-py

Ownership module for the Python advisor runtime.

Current transition model:
- canonical entrypoints live under `apps/tm-advisor-py/entrypoints/`
- shared bootstrap for those entrypoints lives under `apps/tm-advisor-py/entrypoints/_bootstrap.py`
- runtime files still live under `scripts/tm_advisor/`
- advisor reads shared generated data through canonical-first helpers
- direct reads from `extension/data/*` are being phased out
- legacy `scripts/*.py` launchers stay as compatibility wrappers where needed
- old monolith was moved to `legacy/tm-advisor-py/tm_advisor_old.py` and must not become an active dependency again

Scope of this module:
- advisor runtime and analysis
- advisor snapshot / spy / backtest tooling
- advisor snapshot/opening regressions
- canonical advisor JS regressions under `apps/tm-advisor-py/tests/`
- Python-only helper logic
- canonical advisor Python tests under `apps/tm-advisor-py/tests/`

Canonical test commands:
- `npm run test:advisor`
- `npm run test:advisor-opening`

Canonical runtime commands:
- `npm run advisor:cli -- <player_id>`
- `npm run advisor:snapshot -- <player_id>`
- `npm run advisor:summary -- <player_id>`
- `npm run advisor:backtest -- --player NAME`

Shared dependencies:
- `data/evaluations.json`
- `data/all_cards.json`
- `data/ceo_cards.json`
- `data/pathfinder_cards.json`
- `data/planetary_tracks.json`
- `packages/tm-data/generated/extension/card_data.js`
- `packages/tm-data/generated/extension/card_vp.js`

Out of scope:
- `extension/**` browser runtime
- `bot/**` gameplay runtime
- `apps/tm-site/**`
