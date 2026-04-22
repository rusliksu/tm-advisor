# TFMStats Disagreement Report - 2026-04-21

## Snapshot

- Imported at: 2026-04-21T18:22:18.398Z
- Indexed games: 191509
- Players: 71715
- Card draws: 40466005
- Compared cards: 214
- Coverage: evaluations 854, played 213, option 214, starting-hand 214

## Method

- Played and option sections require at least 5000 played samples.
- Starting-hand section requires at least 5000 offered samples.
- Stat score is the average percentile of played dElo, option dElo, and kept starting-hand dElo when available.
- Gap = stat score - local evaluation score. Positive means the card looks underrated locally; negative means it looks overrated locally.
- Selection Bias / Timing Review removes obvious low-keep conditional hits and opener traps from the direct likely underrated/overrated queues.
- Acknowledged Low-Actionability Signals lists already-penalized, already-low, or otherwise acknowledged rows so they do not masquerade as new action items.
- TFMStats is observational BGA data, so these rows are review candidates, not automatic truth.

## Selection Bias / Timing Review

No actionable manual-review rows remain.

## Acknowledged Low-Actionability Signals

| Card | Signal | Our | Stat | Gap | Played dElo | Option dElo | Kept dElo | Keep | Sample |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Immigrant City | Already has local opener penalty | 58 C | 5 | -53 | -0.06 | 0.42 | -0.94 | 76% | 11374 |
| Colonizer Training Camp | Already has local opener penalty | 62 C | 17 | -45 | 0.14 | 0.46 | -0.37 | 67% | 11440 |
| Energy Saving | Already has local opener penalty | 58 C | 13 | -45 | 0.31 | 0.46 | -1.33 | 6% | 11408 |
| Toll Station | Already has local opener penalty | 64 C | 19 | -45 | 0.47 | 0.48 | -1.05 | 14% | 11469 |
| Great Dam | Already has local opener penalty | 64 C | 20 | -44 | 0.28 | 0.48 | -0.76 | 24% | 11469 |
| Protected Habitats | Already has local opener penalty | 70 B | 26 | -44 | 0.31 | 0.49 | -0.36 | 94% | 11298 |
| Tropical Resort | Already has local opener penalty | 56 C | 13 | -43 | 0.52 | 0.43 | -1.49 | 7% | 11136 |
| Lava Tube Settlement | Already low local score; deprioritize score cut | 50 D | 7 | -43 | -0.07 | 0.30 | -0.57 | 58% | 10395 |
| Caretaker Contract | Already has local opener penalty | 54 D | 12 | -42 | 0.45 | 0.44 | -1.76 | 1% | 11414 |
| Solar Power | Already low local score; deprioritize score cut | 52 D | 10 | -42 | 0.04 | 0.45 | -0.68 | 41% | 11425 |
| SF Memorial | Already has local opener penalty | 55 C | 14 | -41 | 0.28 | 0.31 | -0.46 | 52% | 10268 |
| Soletta | Already has local opener penalty | 50 D | 10 | -40 | -0.66 | 0.42 | -0.40 | 45% | 11455 |
| Research Coordination | COTD percentile gap; absolute results positive | 72 B | 32 | -40 | 0.43 | 0.38 | 0.28 | 85% | 10474 |
| Extreme-Cold Fungus | Already has local opener penalty | 58 C | 19 | -39 | 0.22 | 0.48 | -0.59 | 30% | 11250 |
| Lunar Beam | Already has local opener penalty | 56 C | 17 | -39 | -0.09 | 0.46 | -0.21 | 54% | 11160 |
| Martian Survey | Already has local opener penalty | 56 C | 18 | -38 | 0.27 | 0.34 | -0.13 | 71% | 10396 |
| Nuclear Power | Already has local opener penalty | 58 C | 20 | -38 | -0.01 | 0.48 | -0.23 | 47% | 11136 |
| Security Fleet | Already has local opener penalty | 42 D | 4 | -38 | 0.09 | 0.41 | -1.14 | 6% | 11305 |
| Ants | Already has local opener penalty | 63 C | 26 | -37 | 0.65 | 0.47 | -0.89 | 13% | 11114 |
| GHG Factories | Already has local opener penalty | 56 C | 19 | -37 | -0.05 | 0.46 | -0.11 | 60% | 11490 |

## Likely Underrated

No cards exceeded the positive gap threshold.

## Likely Overrated

No cards exceeded the negative gap threshold.

## High Keep / Low Local Score

No low-scored cards had both high keep rate and strong kept dElo.

## Negative Kept / High Local Score

No high-scored cards had negative kept dElo.

## COTD-Sensitive Review Queue

No COTD-linked cards crossed the review threshold.
