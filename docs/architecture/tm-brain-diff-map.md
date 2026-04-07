# TM Brain Diff Map

**bot/tm-brain.js** (2517 строк) vs **extension/tm-brain.js** (3203 строк)

## Модуль загрузки

| Аспект | Bot | Extension |
|--------|-----|-----------|
| TM_BRAIN_CORE import | Node.js: `require('./shared/brain-core')` | Browser: `root.TM_BRAIN_CORE` |
| Timing function | `Accelerating` (rateScale, min/maxRate) | `Interpolated` (gen+steps blend) |
| totalSteps | 42 (19+14+9, без Venus) | 49 (19+14+9+7, с Venus) |

## setCardData signature

- **Bot:** `(cardTags, cardVP, cardData, cardGlobalReqs)` — 4 params
- **Extension:** `+ cardTagReqs, cardEffects` — 6 params
- Extension имеет доп. глобалы: `_cardTagReqs`, `_cardEffects`, `_VARIANT_RATING_OVERRIDES`, `_CARD_VARIANT_RULES`

## Категории функций

### IDENTICAL (10)
VP_CARDS/ENGINE_CARDS/CITY_CARDS sets, calcPlayerVP, vpLead, shouldPushGlobe, isRedsRuling, scoreColonyTrade, smartPay, analyzePass, analyzeActions

### SHARED-DIVERGED (6)

| Функция | Расхождение |
|---------|-------------|
| `_estimateScoreCardTiming` | totalSteps 42 vs 49 + разные алгоритмы timing |
| `_buildScoreCardContext` | Вызывает разные timing functions |
| `scoreCard` | Косвенно через context builders |
| `endgameTiming` | Bot: 2 params, Extension: 3 params + interpolation |
| `rankHandCards` | getOverlayRating callback: bot `(name)`, ext `(name, state)` |
| `analyzeDeck` | Аналогичные minor diffs |

### EXTENSION-ONLY (21)

**Variant resolution (9):** `baseCardName`, `isVariantOptionEnabled`, `resolveVariantCardName`, `mergeCardStruct`, `getCardDataByName`, `getCardTagsByName`, `getCardVPByName`, `getCardEffectsByName`, `getOverlayRatingByName`

**Board/Ares (8):** `isCityTile`, `isOceanTile`, `isHazardTile`, `hasSpaceBonus`, `hasAdjacencyBonus`, `getAdjacencyCost`, `getAdjacentSpaces`, `getBoardMetrics`, `estimateAresPlacementDelta`

**UI scoring (2):** `scoreCardBaseline`, `_scoreAtState`

**Milestone/Award (2):** `evaluateMilestone`, `evaluateAward`

### BOT-ONLY: нет

## Приоритеты выравнивания

1. **totalSteps 42→49** — бот не учитывает Venus steps
2. **Timing Interpolated** — extension точнее, бот должен перейти
3. **setCardData 4→6 params** — бот не получает tagReqs и effects
4. **Variant resolution** — бот играет Ares/Underworld, но не резолвит variant карты
5. **Board/Ares и UI scoring** — оставить extension-only (бот не работает с DOM)

## Plan

Согласно tm-brain-extraction-plan.md — small verified slices:
1. ~~Fix totalSteps в bot (42→49)~~ ✅ DONE
2. ~~Выровнять timing на Interpolated~~ ✅ DONE
3. ~~Расширить setCardData signature в bot (4→6 params)~~ ✅ DONE
4. Перенести variant resolution в brain-core.js (shared)
   - Зависит от `extension/data/card_variants.js` (68 строк: `tmBaseCardName`, `tmIsVariantOptionEnabled`, `TM_CARD_VARIANT_RULES`)
   - Вариант A: перенести card_variants.js в packages/tm-brain-js/src/ и подключить в обоих consumers
   - Вариант B: скопировать в bot/data/ (быстрее, но дублирование)
   - Рекомендация: вариант A, но как отдельный PR
5. Board/Ares/UI — НЕ переносить в bot (extension-only)
6. scoreCardBaseline, evaluateMilestone, evaluateAward — оставить extension-only
