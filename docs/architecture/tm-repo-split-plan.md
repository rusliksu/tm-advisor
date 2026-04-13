# TM Repo Split Plan v0

## Цель
Разложить `tm-tierlist` на отдельные GitHub-репозитории без хаотичного big-bang split.

Этот документ отвечает на три вопроса:
- какие части реально тянут на отдельный repo
- в каком порядке их выносить
- что должно остаться вместе, пока shared boundaries не стабилизированы

## Текущее состояние
- `tm-tierlist` уже выглядит как будущий monorepo модулей:
  - `apps/tm-site`
  - `apps/tm-extension`
  - `apps/tm-smartbot`
  - `apps/tm-advisor-py`
  - `packages/tm-data`
  - `packages/tm-brain-js`
  - `packages/tm-advisor-js`
- но это ещё не настоящий workspace:
  - в корневом `package.json` нет `workspaces`
  - у приложений и пакетов нет собственных `package.json` / `pyproject.toml`
  - большинство runtime paths всё ещё живут на legacy путях `extension/`, `bot/`, `scripts/tm_advisor/`, repo root
- поэтому split нужно делать не "по папкам как лежат", а по ownership и runtime contract

## Что не надо превращать в отдельные repos
- временные локальные checkout-ы вроде `terraforming-mars-live-clean-*`, `terraforming-mars-manual-merge-*` и прочие `terraforming-mars-*`
- generated bundles как source repos
- `tm-data`, `tm-brain-js` и `tm-advisor-js` как три независимых репозитория на первом шаге

Причина:
- shared packages пока обслуживают сразу несколько приложений
- у них ещё нет нормального release/versioning flow
- ранний split shared libs даст больше coordination pain, чем пользы

## Рекомендуемая целевая форма

### Repo 1: `tm-site`
Назначение:
- guides
- landing
- generated tierlist pages
- static assets для GitHub Pages

Что должно войти:
- `apps/tm-site/**`
- `tools/site/**`
- `images/**`
- Pages workflow и repo-local deploy config

Что пока transitional:
- корневые publish files `index.html`, `*guide.html`, `output/tierlist_*.html`, `favicon*`, `og-image.png`

Почему это первый кандидат:
- это already documented first practical boundary
- source-owned tree уже существует
- основная боль уже была именно здесь: потерянные гайды и неочевидный deploy path

Главный blocker:
- текущий publish flow всё ещё ожидает файлы в repo root

### Repo 2: core monorepo, временно оставить как `tm-tierlist`
Назначение:
- canonical data
- shared brain logic
- advisor workflow JS
- архитектурные и sync tools

Что оставить вместе:
- `data/**`
- `packages/tm-data/**`
- `packages/tm-brain-js/**`
- `packages/tm-advisor-js/**`
- `tools/data/**`
- `tools/brain/**`
- `tools/advisor/sync-workflow.js`
- `docs/architecture/**`

Почему не split сейчас:
- это внутренняя shared platform
- extension, smartbot и advisor пока завязаны на неё одновременно

### Repo 3: `tm-extension`
Назначение:
- browser extension runtime
- popup/background/content scripts
- extension tests

Что должно войти:
- `apps/tm-extension/**`
- `extension/**`
- `tools/extension/**`

Условие для выноса:
- extension должен собираться из своих source-owned путей и versioned shared packages, а не из случайных соседних repo paths

### Repo 4: `tm-smartbot`
Назначение:
- bot runtime
- auto-join
- shadow tooling
- bot regressions

Что должно войти:
- `apps/tm-smartbot/**`
- `bot/**`

Условие для выноса:
- bot-generated data и shared brain должны приходить из stable shared contract, а не через repo-local assumptions

### Repo 5: `tm-advisor-py`
Назначение:
- Python advisor runtime
- snapshot/backtest/analysis
- advisor tests

Что должно войти:
- `apps/tm-advisor-py/**`
- `scripts/tm_advisor/**`
- compatibility wrappers, пока они ещё нужны
- advisor-specific tooling

Условие для выноса:
- advisor больше не должен зависеть от `extension/data/*` или других runtime internals
- входные данные должны приходить только через `tm-data` exports

## Рекомендуемый порядок

### Phase 0: preflight внутри текущего repo
Сначала подготовить split-friendly состояние, не создавая новые repos:
- сохранить ownership map и dependency graph как source of truth
- не трогать unrelated scoring/runtime изменения
- формализовать shared package contracts
- добавить минимальные package/runtime manifests там, где их ещё нет
- убрать implicit assumptions, что root repo всегда рядом

### Phase 1: вынести `tm-site`
Первый реальный split:
- создать отдельный GitHub repo для `tm-site`
- перенести source-owned tree из `apps/tm-site/src`
- перенести `tools/site/**`
- перенести `images/**`, потому что tierlist pages реально зависят от них
- перевести Pages deploy на новый repo

Cutover rule:
- новый repo становится owner для site source и deploy
- текущий repo либо перестаёт публиковать site root files, либо держит их только как transitional mirror

### Phase 2: дожать shared core внутри оставшегося repo
До split runtime apps:
- довести `tm-data` до явного canonical contract
- довести `tm-brain-js` до явного shared API
- оставить `tm-advisor-js` рядом как shared workflow package
- избавиться от implicit direct reads между приложениями

### Phase 3: вынести `tm-extension`
Делать только после Phase 2.

Definition of ready:
- extension runtime не зависит от repo-root source ownership
- sync/check tooling можно перенести вместе с extension
- shared dependencies можно зафиксировать как versioned import или vendored snapshot

### Phase 4: вынести `tm-smartbot`
Делать после того, как shared brain и generated bot data стабилизированы.

Definition of ready:
- `bot/shared/brain-core.js` больше не требует ручной coordination across repos
- `bot/card_*.js` либо полностью generated из shared source, либо заменены на более чистый contract

### Phase 5: вынести `tm-advisor-py`
Последним из runtime apps.

Почему позже:
- advisor сейчас всё ещё в переходной фазе
- direct reads from `extension/data/*` ещё не убиты полностью
- compatibility wrappers пока часть рабочего контура

## Конкретная split-карта по ownership

### `tm-site`
- `apps/tm-site/**`
- `tools/site/**`
- `images/**`
- текущие publish mirrors в repo root и `output/**`

### `tm-extension`
- `apps/tm-extension/**`
- `extension/**`
- `tools/extension/**`

### `tm-smartbot`
- `apps/tm-smartbot/**`
- `bot/**`

### `tm-advisor-py`
- `apps/tm-advisor-py/**`
- `scripts/tm_advisor/**`
- `scripts/tm_advisor.py`
- `scripts/advisor_snapshot.py`

### shared core
- `data/**`
- `packages/tm-data/**`
- `packages/tm-brain-js/**`
- `packages/tm-advisor-js/**`
- `tools/data/**`
- `tools/brain/**`
- shared architecture docs

## Stop conditions
- новый repo нельзя запустить или проверить без соседнего checkout-а
- generated files accidentally объявлены source of truth
- для split нужен direct app-to-app import
- one-step move требует массового rename через весь repo
- split смешан с unrelated gameplay/scoring fixes

## Первый практический шаг
Если делать один next move, то он такой:
1. Подготовить отдельный GitHub repo под `tm-site`
2. Перенести туда `apps/tm-site/**`, `tools/site/**`, `images/**`
3. Перевести deploy на новый repo
4. Только потом решать, оставлять ли current `tm-tierlist` как core monorepo или переименовывать его во что-то вроде `tm-core`

## Набор проверок перед каждым split
- `rg` по repo не находит forbidden sibling-path imports
- тесты и check-команды запускаются внутри нового ownership boundary
- generated mirrors воспроизводимы из canonical source
- новый repo имеет свой deploy/test entrypoint
- старый repo после выноса не хранит два source of truth для одного и того же артефакта
