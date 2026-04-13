# TM Site Split Dry Run v0

## Цель
Подготовить первый реальный repo split для `tm-site` без фактического cutover и без деплоя.

Этот dry-run фиксирует:
- какой именно scope должен уйти в site repo
- какой naming даст минимальную боль
- какие файлы и зависимости нельзя забыть
- какой порядок cutover не ломает текущий Pages URL

## Рекомендуемый naming

### Recommended
- оставить `rusliksu/tm-tierlist` как будущий site-only repo
- текущий mixed runtime/core repo позже вынести в отдельный repo с новым именем

Почему это лучший вариант:
- текущий live URL уже `https://rusliksu.github.io/tm-tierlist/`
- `apps/tm-site/src/index.html` и generated tierlist pages уже хардкодят:
  - `https://rusliksu.github.io/tm-tierlist/`
  - `https://github.com/rusliksu/tm-tierlist`
- смена site repo name сразу потянет:
  - URL migration
  - meta/OG fixes
  - footer/source-link fixes
  - возможные redirect/SEO хвосты

### Not recommended for the first cut
- создать новый site repo вроде `rusliksu/tm-site` или `rusliksu/tm-tierlist-site`

Почему хуже:
- сразу меняется GitHub Pages path
- придётся массово перепрошивать canonical URLs
- появится больше moving parts, чем пользы

## Текущий git reality check
Локальный repo уже partially split по remote-логике:
- `main` -> `site/main` (`https://github.com/rusliksu/tm-tierlist.git`)
- `master` -> `origin/master` (`https://github.com/rusliksu/tm-advisor.git`)

Это значит:
- `tm-tierlist` уже естественный кандидат стать чистым site repo
- смешанный runtime/core поток и так уже живёт отдельно по другому remote

## Exact site-owned transfer manifest

### 1. Source-owned site tree
Из `apps/tm-site/src/`:
- `index.html`
- `crisis-rules.html`
- `strategy-guide.html`
- `turmoil-guide.html`
- `colonies-guide.html`
- `maps-guide.html`
- `venus-guide.html`
- `prelude-guide.html`
- `ceo-guide.html`
- `pathfinders-guide.html`
- `favicon.ico`
- `favicon.png`
- `og-image.png`
- `output/tierlist_all.html`
- `output/tierlist_ceos.html`
- `output/tierlist_ceos_ru.html`
- `output/tierlist_corporations.html`
- `output/tierlist_corporations_ru.html`
- `output/tierlist_preludes.html`
- `output/tierlist_preludes_ru.html`
- `output/tierlist_projects.html`
- `output/tierlist_projects_ru.html`

### 2. Site tooling
Из `tools/site/`:
- `sync-site.py`
- `test-tierlist-network.mjs`
- `tool-manifest.json`

### 3. Static images
Из `images/`:
- `images/ceos/**` — 38 files
- `images/corporations/**` — 91 files
- `images/expansions/**` — 11 files
- `images/preludes/**` — 99 files
- `images/project_cards/**` — 626 files
- `images/tags/**` — 15 files

Итого:
- `images/**` = 880 files

### 4. Transitional publish mirrors in current repo
Сейчас это deploy copies, которые публикуются из repo root:
- `index.html`
- `crisis-rules.html`
- `strategy-guide.html`
- `turmoil-guide.html`
- `colonies-guide.html`
- `maps-guide.html`
- `venus-guide.html`
- `prelude-guide.html`
- `ceo-guide.html`
- `pathfinders-guide.html`
- `favicon.ico`
- `favicon.png`
- `og-image.png`
- `output/tierlist_all.html`
- `output/tierlist_ceos.html`
- `output/tierlist_ceos_ru.html`
- `output/tierlist_corporations.html`
- `output/tierlist_corporations_ru.html`
- `output/tierlist_preludes.html`
- `output/tierlist_preludes_ru.html`
- `output/tierlist_projects.html`
- `output/tierlist_projects_ru.html`

## Explicit non-transfer list
На первом cut не переносить в site repo:
- `extension/**`
- `bot/**`
- `scripts/tm_advisor/**`
- `data/**`
- `packages/**`
- `tools/extension/**`
- `tools/data/**`
- `tools/brain/**`
- top-level temporary files

Также не включать как site source of truth:
- `output/pathfinders_guide.md`
- `output/TM_Tierlist_Corporations.md`
- `output/TM_Tierlist_Preludes.md`
- `output/TM_Tierlist_Projects.md`
- `output/tiermaker_ranking.txt`

Эти файлы сейчас есть рядом, но не входят в `site-manifest.json` и не должны случайно стать частью первого split scope.

## Hidden dependencies to account for

### Hardcoded URLs
Сейчас site source содержит прямые ссылки на:
- `https://rusliksu.github.io/tm-tierlist/`
- `https://github.com/rusliksu/tm-tierlist`

Где это живёт:
- `apps/tm-site/src/index.html`
- `apps/tm-site/src/output/tierlist_*.html`
- generator output paths and current publish copies

Вывод:
- если repo name сохраняем как `tm-tierlist`, эти ссылки почти не надо трогать
- если repo name меняем, нужен отдельный URL migration pass

### Publish model
Текущее правило:
- canonical source = `apps/tm-site/src/**`
- publish target = repo root + `output/**`
- sync tool = `python tools/site/sync-site.py`

Вывод:
- до cutover нельзя удалять root publish copies
- новый site repo должен либо публиковать root directly, либо заменить этот publish model на явный build/deploy step

### Site validation today
Уже есть usable checks:
- `python tools/site/sync-site.py --check`
- `node tools/site/test-tierlist-network.mjs`

Но нет отдельного site-specific GitHub Actions workflow.

Вывод:
- при split нужен отдельный `site` CI/Pages workflow
- текущий `.github/workflows/test.yml` не является site pipeline

## Safe cutover sequence

### Phase A: prepare clean site repo without production switch
1. Взять `site/main` как базу будущего site repo.
2. Вынести в отдельный clean checkout только site-owned scope.
3. Убедиться, что в новом repo есть:
   - `apps/tm-site/**`
   - `tools/site/**`
   - `images/**`
   - transitional publish root files
4. Не менять пока live Pages source.

### Phase B: validate in isolation
1. Прогнать `python tools/site/sync-site.py --check`
2. Прогнать `node tools/site/test-tierlist-network.mjs`
3. Проверить, что `index.html` и tierlist pages открываются без missing asset requests
4. Проверить, что guide links не потерялись

### Phase C: only then switch ownership
1. Зафиксировать новый repo как единственный owner сайта
2. Обновить local workflow:
   - site changes идут в site repo
   - runtime/core changes не идут туда
3. После этого уже можно чистить дубли в mixed repo

## Cutover options

### Option A: preserve `tm-tierlist` as site repo
Это recommended path.

Плюсы:
- сохраняется текущий Pages URL
- почти не нужен URL rewrite
- совпадает с текущим `site` remote

Минусы:
- текущий mixed repo придётся позже переименовать или вынести в новый repo

### Option B: create a brand-new site repo name
Это fallback path.

Плюсы:
- naming может стать более "чистым"

Минусы:
- нужен URL migration pass
- нужен redirect/custom-domain plan
- выше риск битых ссылок и лишней ручной работы

## Definition of ready for actual split
- новый site repo проверяется без соседнего mixed checkout
- `images/**` присутствуют и доступны локально для tierlist pages
- `site:check` проходит
- `test-tierlist-network` не показывает missing requests по `images/` ресурсам
- Pages workflow существует отдельно от extension CI
- mixed repo после cutover перестаёт быть owner для site deploy

## First actual command batch later
Это не выполнять сейчас. Это reference для будущего cutover.

1. Создать clean checkout от `site/main`
2. Перенести туда site-owned scope
3. Прогнать `site:check`
4. Прогнать `test-tierlist-network`
5. Подготовить отдельный site workflow
6. Только потом делать GitHub-side switch

## What this dry-run deliberately does not touch
- TM game server
- `terraforming-mars` repo
- extension runtime
- bot runtime
- advisor runtime
- live deploy
