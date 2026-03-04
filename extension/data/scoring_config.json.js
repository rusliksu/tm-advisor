// TM_SCORING_CONFIG — все числовые модификаторы scoreDraftCard() в одном месте.
// Менять значения здесь, код в content.js тянет через алиас SC = TM_SCORING_CONFIG.

/* eslint-disable */
const TM_SCORING_CONFIG = {

  // ══════════════════════════════════════════════════════════════
  // СИНЕРГИИ КОРПОРАЦИИ И ТАБЛО
  // Corp synergy/reverse удалены — теперь через CORP_ABILITY_SYNERGY + CORP_BOOSTS
  // ══════════════════════════════════════════════════════════════
  tableauSynergyPer: 3,        // за каждую синергию с табло/рукой
  tableauSynergyMax: 3,        // max кол-во синергий (3 × per = 9)

  // ══════════════════════════════════════════════════════════════
  // КОМБО
  // ══════════════════════════════════════════════════════════════
  comboGodmode: 10,            // base bonus за godmode комбо
  comboGreat: 7,               // great
  comboGood: 5,                // good
  comboDecent: 3,              // decent

  // Timing multipliers для комбо (blue action cards)
  timingBlue6: 1.5,            // gensLeft ≥ 6
  timingBlue4: 1.2,            // gensLeft ≥ 4
  timingBlue2: 0.8,            // gensLeft ≥ 2
  timingBlue1: 0.5,            // gensLeft < 2

  // Timing multipliers для комбо (production)
  timingProd5: 1.3,            // gensLeft ≥ 5
  timingProd3: 1.0,            // gensLeft ≥ 3
  timingProd1: 0.4,            // gensLeft < 3

  // Timing multipliers для комбо (VP burst)
  timingVPBurst2: 1.4,         // gensLeft ≤ 2
  timingVPBurst4: 1.1,         // gensLeft ≤ 4
  timingVPBurstHi: 0.8,        // gensLeft > 4

  // Timing multipliers для комбо (VP accumulator)
  timingAccum5: 1.4,           // gensLeft ≥ 5
  timingAccum3: 1.1,           // gensLeft ≥ 3
  timingAccum1: 0.6,           // gensLeft < 3

  // Анти-комбо
  antiCombo: 3,                // штраф за конфликт с табло (вычитается)

  // ══════════════════════════════════════════════════════════════
  // ТРЕБОВАНИЯ (REQUIREMENTS)
  // ══════════════════════════════════════════════════════════════
  reqInfeasible: 20,           // штраф когда окно закрыто (вычитается)
  reqPenaltyPerGen: 3,         // штраф за каждый ген ожидания
  reqPenaltyMax: 15,           // max штраф за ожидание
  reqMetHard: 6,               // bonus за выполненный hard req (hardness ≥ 4)
  reqMetMedium: 4,             // hardness ≥ 3
  reqMetEasy: 3,               // hardness ≥ 2
  reqFarCap: 5,                // max штраф за далёкий req (minG ≥ 3 gens away)

  // ══════════════════════════════════════════════════════════════
  // СТОИМОСТЬ И СКИДКИ
  // ══════════════════════════════════════════════════════════════
  discountCap: 7,              // max bonus от скидок
  discountStackMax: 3,         // max bonus от стакинга скидок
  steelPayCap: 5,              // max bonus от оплаты сталью
  steelPayDivisor: 3,          // steelMC / N для бонуса
  tiPayCap: 7,                 // max bonus от оплаты титаном
  tiPayDivisor: 3,             // tiMC / N для бонуса

  // ══════════════════════════════════════════════════════════════
  // TAG VALUE DECAY (endgame — теги теряют ценность)
  // ══════════════════════════════════════════════════════════════
  tagDecayFullAt: 5,           // gensLeft ≥ N → decay = 1.0 (полная ценность)
  tagDecayMin: 0.08,           // min decay (gensLeft ≈ 0) — снижен: теги в последнем гене почти бесполезны

  // ══════════════════════════════════════════════════════════════
  // ТРИГГЕРЫ ТЕГОВ
  // ══════════════════════════════════════════════════════════════
  triggerCap: 12,              // max bonus от триггеров тегов

  // ══════════════════════════════════════════════════════════════
  // ПЛОТНОСТЬ ТЕГОВ (TAG DENSITY)
  // ══════════════════════════════════════════════════════════════
  tagRarity: { jovian: 5, science: 3, venus: 3, earth: 2, microbe: 1, animal: 1, plant: 1, space: 0, building: 0, power: 1, city: 1, event: 0 },
  tagDensity6: 4,              // count ≥ 6
  tagDensity4: 3,              // count ≥ 4
  tagDensity2Rare: 2,          // count ≥ 2 + rarity ≥ 3
  tagDensity1Epic: 2,          // count ≥ 1 + rarity ≥ 5
  tagDensityCheapCost: 15,     // порог для cap дешёвых карт
  tagDensityCheapCap: 1,       // cap для дешёвых карт без ongoing

  // ══════════════════════════════════════════════════════════════
  // АВТО-СИНЕРГИЯ
  // ══════════════════════════════════════════════════════════════
  rareTagVal: { jovian: 3, science: 2, venus: 2, earth: 2, microbe: 1, animal: 1 },
  autoSynCap: 4,               // max bonus авто-синергии
  autoSynThreshold: 2,         // min autoSynVal для бонуса

  // ══════════════════════════════════════════════════════════════
  // PHARMACY UNION
  // ══════════════════════════════════════════════════════════════
  puCureBonus: 4,              // science tag + diseases > 0
  puDiseasePenalty: 3,         // science tag + diseases = 0 (вычитается)
  puMicrobeBonus: 2,           // microbe gen + diseases > 0

  // ══════════════════════════════════════════════════════════════
  // КОЛОНИИ И ТОРГОВЛЯ
  // ══════════════════════════════════════════════════════════════
  colonyCap: 10,               // max бонус колониальной карты
  colonyPerOwned: 3,           // множитель coloniesOwned
  colonyPerTrade: 2,           // множитель tradesLeft
  fleetCap: 6,                 // max бонус флота
  fleetPerColony: 2,           // множитель coloniesOwned для флота
  fleetBase: 2,                // базовое значение флота
  fleetNoColony: 1,            // флот без колоний
  colonyPlacement: 3,          // бонус за размещение колонии
  colonySlotMax: 3,            // max колоний для бонуса размещения
  tradeBonusCap: 5,            // max бонус от trade income
  tradeBonusPerColony: 2,      // множитель для trade income
  colonySlotsPerWorld: 3,      // слотов на colony world
  colonySatLow: 0.15,          // порог низкой насыщенности
  colonySatLowMax: 3,          // max totalColonies для low penalty
  colonySatHigh: 0.4,          // порог высокой насыщенности
  colonySatPenalty: 2,         // штраф за мало колоний
  colonySatBonus: 2,           // бонус за много колоний

  // ══════════════════════════════════════════════════════════════
  // ТУРМОЙЛЬ
  // ══════════════════════════════════════════════════════════════
  delegateFew: 5,              // base когда < 2 делегатов
  delegateMid: 4,              // base когда < 4
  delegateMany: 2,             // base когда ≥ 4
  delegateMulti: 2,            // бонус за multi-delegate карту
  influenceCap: 3,             // cap для influence-only карт
  chairmanBonus: 4,            // chairman/party leader
  partyMatchBonus: 2,          // правящая партия + matching tags
  scientistsDrawBonus: 1,      // Scientists + draw
  redsBasePenalty: 3,          // Reds base (вычитается)
  redsMultiPenalty: 5,         // Reds multi-TR (вычитается)
  dominantPartyBonus: 1,       // dominant (следующая) партия

  // ══════════════════════════════════════════════════════════════
  // FTN TIMING (точный расчёт)
  // ══════════════════════════════════════════════════════════════
  ftnReferenceGL: 5,           // reference gensLeft
  ftnScaleProd: 3.0,           // множитель для pure production
  ftnScaleOther: 1.5,          // множитель для остальных
  ftnCapProd: 20,              // cap для pure production (было 30 — слишком агрессивно)
  ftnCapOther: 15,             // cap для остальных
  ftnCostFree: 15,             // карты дешевле этого: нет задержки от стоимости
  ftnCostPerGen: 15,           // каждые N MC сверх порога = 1 gen задержки

  // ══════════════════════════════════════════════════════════════
  // CRUDE TIMING (грубый расчёт, когда нет FTN данных)
  // ══════════════════════════════════════════════════════════════
  earlyProdBonus: 3,           // production gen 1-4
  earlyProdMaxGen: 4,          // порог для раннего бонуса

  // Late production (hard, gensLeft ≤ 3)
  lateProdGL1: -10,            // gensLeft ≤ 1 (было -15, последний раунд prod ≈ 4-5 MC, не 0)
  lateProdGL2: -6,             // gensLeft ≤ 2 (было -10)
  lateProdGL3: -3,             // gensLeft ≤ 3 (было -5)

  // Late VP
  lateVPBonus: 4,              // VP карта gen 8+
  lateVPMinGen: 8,             // порог для позднего VP

  // VP burst (gensLeft ≤ 3)
  vpBurstGL1: 8,               // gensLeft ≤ 1
  vpBurstGL2: 5,               // gensLeft ≤ 2
  vpBurstGL3: 3,               // gensLeft ≤ 3

  // Action late
  actionLateGL1: -10,          // action без VP, gensLeft ≤ 1
  actionLateGL2: -5,           // gensLeft ≤ 2
  actionVPLate: -3,            // action + VP, gensLeft ≤ 1

  // Discount late
  discountLateGL1: -8,         // gensLeft ≤ 1
  discountLateGL2: -4,         // gensLeft ≤ 2

  // Late production (gen-based, gen ≥ 6)
  lateProdGen9: -15,           // gen ≥ 9
  lateProdGen8: -10,           // gen ≥ 8
  lateProdGen7: -6,            // gen ≥ 7
  lateProdGen6: -3,            // gen ≥ 6

  // Action ROI
  actionROITRMul: 7,           // TR value в MC для ROI
  actionROIOcMul: 11,          // Ocean value в MC
  actionROICDMul: 3,           // Card draw value в MC
  actionROIPenCap: 4,          // max penalty при gensLeft ≤ 2
  actionROIBonCap: 8,          // max bonus
  actionROIDivisor: 4,         // totalROI / N

  // Crude action fallback (когда нет fx data)
  crudeActionEarly: 5,         // gensLeft ≥ 6
  crudeActionMid: 3,           // gensLeft ≥ 4
  crudeActionLate: -4,         // gensLeft ≤ 2

  // ══════════════════════════════════════════════════════════════
  // ВЕХИ И НАГРАДЫ (MILESTONES & AWARDS)
  // ══════════════════════════════════════════════════════════════
  milestoneNeed1: 7,           // need = 1 (1 тег до вехи)
  milestoneNeed2: 5,           // need = 2
  milestoneNeed3: 3,           // need ≥ 3

  // Award tag-based
  awardBaseHigh: 4,            // myCount ≥ 4
  awardBaseMid: 3,             // myCount ≥ 2
  awardBaseLow: 2,             // myCount < 2

  // Award racing mods
  racingLeadBig: 2,            // лидер с delta ≥ 2
  racingLeadSmall: 1,          // лидер с delta < 2
  racingClose: 1,              // delta ≥ -1 (рядом)
  racingFar: -2,               // далеко

  // Award non-tag
  awardNonTagBase: 3,          // base для non-tag awards

  // ══════════════════════════════════════════════════════════════
  // РЕСУРСЫ: ЖИВОТНЫЕ И МИКРОБЫ (legacy — оставлены для обратной совместимости)
  // Логика перенесена в SYNERGY_RULES (секция 48)
  // ══════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════
  // ЭНЕРГИЯ
  // ══════════════════════════════════════════════════════════════
  energyConsumerCap: 5,        // max bonus от потребителей энергии
  energySinkBonus: 3,          // бонус за energy sink когда surplus
  energySurplusPenalty: 4,     // штраф за ещё energy prod (вычитается) (было 2, TFMStats: Power Gen rank 31/35)

  // ══════════════════════════════════════════════════════════════
  // РАСТЕНИЯ
  // ══════════════════════════════════════════════════════════════
  plantEngineCapStrong: 5,     // greenery + TR (O₂ не max)
  plantEngineCapWeak: 3,       // greenery без TR (O₂ max) или мало prod

  // ══════════════════════════════════════════════════════════════
  // ТЕПЛО
  // ══════════════════════════════════════════════════════════════
  heatProdMaxedPenalty: 3,     // heat prod при maxed temp (вычитается)
  heatConverterValue: 1,       // heat converter при maxed temp + heat ≥ 16
  heatToTRCap: 3,              // max bonus heat → TR
  heatProdBonus: 2,            // heat prod ≥ 4 при temp не max

  // ══════════════════════════════════════════════════════════════
  // МУЛЬТИ-ТЕГ
  // ══════════════════════════════════════════════════════════════
  multiTagCap: 4,              // max bonus от multi-tag

  // ══════════════════════════════════════════════════════════════
  // EVENT TAG
  // ══════════════════════════════════════════════════════════════
  eventMilestonePenalty: 2,    // за milestone tag на event
  eventAwardPenalty: 1,        // за award tag на event
  eventPenaltyCap: 4,          // max event penalty

  // ══════════════════════════════════════════════════════════════
  // STEEL/TI PRODUCTION SYNERGY
  // ══════════════════════════════════════════════════════════════
  steelProdSynCap: 4,          // max bonus steel prod synergy
  tiProdSynCap: 5,             // max bonus ti prod synergy

  // ══════════════════════════════════════════════════════════════
  // DIMINISHING RETURNS
  // ══════════════════════════════════════════════════════════════
  mcProdExcessPenalty: 2,      // MC prod ≥ 15 (вычитается)
  mcProdExcessThreshold: 15,   // порог MC prod
  heatProdUselessPenalty: 2,   // heat prod при temp max (вычитается)

  // ══════════════════════════════════════════════════════════════
  // VP ACCUMULATOR TIMING
  // ══════════════════════════════════════════════════════════════
  vpAccumEarly: 4,             // gensLeft ≥ 5
  vpAccumMid: 2,               // gensLeft ≥ 3
  vpAccumLate: 6,              // gensLeft ≤ 1 (вычитается) — усилен: поздняя копилка почти бесполезна

  // ══════════════════════════════════════════════════════════════
  // ДОСТУПНОСТЬ (AFFORDABILITY)
  // ══════════════════════════════════════════════════════════════
  affordRunway50: 6,           // runway < 50% (вычитается)
  affordRunway100: 4,          // runway < 100% (вычитается)
  affordDeficit15: 3,          // deficit > 15 (вычитается)
  affordDeficit8: 2,           // deficit > 8 (вычитается)

  // ══════════════════════════════════════════════════════════════
  // СТОЛЛ И НАСЫЩЕНИЕ ТАБЛО
  // ══════════════════════════════════════════════════════════════
  stallValue: 2,               // бонус за stall (cheap blue card)
  stallCostMax: 8,             // max cost для stall
  tableauSaturation: 3,        // штраф за полное табло (вычитается)
  tableauSatThreshold: 12,     // порог размера табло

  // ══════════════════════════════════════════════════════════════
  // ОППОНЕНТЫ
  // ══════════════════════════════════════════════════════════════
  plantProtect: 4,             // бонус защиты от plant attack
  animalAttackPenalty: 2,      // штраф animal attack опп (вычитается)
  takeThatDenyBonus: 1,        // deny bonus vs strong engine
  oppAdvantagePenalty: 2,      // глобальный эффект помогает опп (вычитается)

  // ══════════════════════════════════════════════════════════════
  // PARAMETER SATURATION
  // ══════════════════════════════════════════════════════════════
  approachPenalty: 2,          // параметр в 1-2 шагах от max

  // ══════════════════════════════════════════════════════════════
  // СТАНДАРТНЫЕ ПРОЕКТЫ
  // ══════════════════════════════════════════════════════════════
  stdCityThreshold: 22,        // city дешевле если cost ≤ N
  stdCityRef: 25,              // стоимость std project city
  stdCityCap: 6,               // max bonus (было 4, COTD: city карты занижены на 1-2 тира)
  stdGreenThreshold: 20,       // greenery
  stdGreenRef: 23,
  stdGreenCap: 3,
  stdOceanThreshold: 15,       // ocean
  stdOceanRef: 18,
  stdOceanCap: 3,

  // ══════════════════════════════════════════════════════════════
  // ДОСКА (BOARD)
  // ══════════════════════════════════════════════════════════════
  boardFullPenalty: 2,         // board > 70% (вычитается)
  boardFullThreshold: 0.7,     // порог
  boardTightPenalty: 3,        // ≤ 5 spaces (вычитается)
  boardTightThreshold: 5,      // порог

  // ══════════════════════════════════════════════════════════════
  // РЕСУРСЫ VP АККУМУЛЯЦИЯ
  // ══════════════════════════════════════════════════════════════
  resourceAccumVPCap: 3,       // max bonus per type

  // ══════════════════════════════════════════════════════════════
  // СТРАТЕГИЯ
  // ══════════════════════════════════════════════════════════════
  strategyThresholds: { venus: 3, jovian: 2, science: 4, earth: 4, microbe: 3, animal: 3, building: 6 },
  strategyCap: 4,              // max bonus
  strategyBase: 2,             // base bonus

  // ══════════════════════════════════════════════════════════════
  // РИСОВАНИЕ КАРТ
  // ══════════════════════════════════════════════════════════════
  drawEarlyBonus: 5,           // gensLeft ≥ 5 (было 4, card draw = king по Саймону/Crime/COTD)
  drawMidBonus: 3,             // gensLeft ≥ 3 (было 1, mid-game draw сильно недооценён)
  drawLatePenalty: 3,          // gensLeft ≤ 2 (вычитается)

  // ══════════════════════════════════════════════════════════════
  // ЗАПАСЫ STEEL/TI
  // ══════════════════════════════════════════════════════════════
  steelStockpileCap: 3,        // max bonus
  steelStockpileDivisor: 4,    // steel / N
  steelStockpileThreshold: 6,  // min steel для бонуса
  tiStockpileCap: 4,           // max bonus
  tiStockpileDivisor: 2,       // ti / N
  tiStockpileThreshold: 4,     // min ti для бонуса

  // Space без титана
  tiPenaltyCapHigh: 8,         // cap для cost ≥ 25
  tiPenaltyCapLow: 5,          // cap для cost < 25
  tiPenaltyCostThreshold: 10,  // min card cost для штрафа
  tiPenaltyCostHigh: 25,       // порог высокого штрафа
  tiPenaltyDivisor: 5,         // cardCost / N

  // ══════════════════════════════════════════════════════════════
  // TRIPLE COMBO CHAIN
  // ══════════════════════════════════════════════════════════════
  chainGodmode: 6,
  chainGreat: 4,
  chainDecent: 3,

  // ══════════════════════════════════════════════════════════════
  // TRADE TRACK
  // ══════════════════════════════════════════════════════════════
  tradeTrackCap: 3,            // max bonus
  tradeTrackThreshold: 3,      // min trackPosition для бонуса

  // ══════════════════════════════════════════════════════════════
  // MAP SPECIFIC
  // ══════════════════════════════════════════════════════════════
  hellasJovian: 2,
  hellasDiversifier: 2,
  hellasEnergizer: 1,
  elysiumEcologist: 1,
  elysiumLegend: 1,
  elysiumCelebrity: 1,
  tharsisMayor: 1,
  tharsisBuilder: 1,
  maGenericBonus: 1,             // generic milestone/award tag match bonus

  // ══════════════════════════════════════════════════════════════
  // TERRAFORM RATE
  // ══════════════════════════════════════════════════════════════
  terraformRateDefault: 4,     // default raises/gen for 3P WGT
  terraformFastThreshold: 4,   // rate ≥ N = fast
  terraformSlowThreshold: 2,   // rate ≤ N = slow
  terraformFastProdPenalty: 2,  // fast game prod (вычитается)
  terraformSlowProdBonus: 2,   // slow game prod
  terraformFastVPBonus: 2,     // fast game VP

  // ══════════════════════════════════════════════════════════════
  // RESOURCE CONVERSION
  // ══════════════════════════════════════════════════════════════
  plantEngineConvBonus: 2,     // plant engine conversion bonus
  heatConvBonus: 1,            // heat → TR conversion bonus
  microbeEngineBonus: 2,       // microbe engine bonus
  floaterEngineBonus: 2,       // floater engine bonus

  // ══════════════════════════════════════════════════════════════
  // РАЗМЕР РУКИ
  // ══════════════════════════════════════════════════════════════
  handFullPenalty: 3,          // hand ≥ 10 (вычитается)
  handFullThreshold: 10,
  handEmptyBonus: 3,           // hand ≤ 3
  handEmptyThreshold: 3,

  // ══════════════════════════════════════════════════════════════
  // ENDGAME CONVERSION
  // ══════════════════════════════════════════════════════════════
  endgameGreeneryBonus: 3,     // greenery + O₂ в финале
  endgameHeatPenalty: 2,       // heat при temp max в финале (вычитается)

  // ══════════════════════════════════════════════════════════════
  // FLOATER TRAP
  // ══════════════════════════════════════════════════════════════
  floaterTrapKnown: 4,         // known trap (вычитается)
  floaterTrapExpensive: 3,     // expensive без engine (вычитается)
  floaterTrapLate: 3,          // action поздно (вычитается)
  floaterCostThreshold: 18,    // min cost для trap

  // ══════════════════════════════════════════════════════════════
  // WILD TAG
  // ══════════════════════════════════════════════════════════════
  wildTagClose: 3,             // close milestone
  wildTagGeneric: 2,           // generic flexibility

  // ══════════════════════════════════════════════════════════════
  // CITY ADJACENCY
  // ══════════════════════════════════════════════════════════════
  cityAdjacencyBonus: 4,       // город + greenery engine (было 2, city+greenery = board presence + VP)
  cityAdjacencyPenalty: 2,     // город без greenery в конце (вычитается)
  cityGreeneryThreshold: 3,    // min greeneries для бонуса

  // ══════════════════════════════════════════════════════════════
  // DELEGATE LEADERSHIP
  // ══════════════════════════════════════════════════════════════
  delegateLeadershipBonus: 3,  // шанс стать лидером партии

  // ══════════════════════════════════════════════════════════════
  // CEO CARD
  // ══════════════════════════════════════════════════════════════
  ceoDrawCap: 8,
  ceoDiscountCap: 6,
  ceoProdCap: 6,
  ceoProdMul: 0.8,
  ceoVPCap: 5,
  ceoVPMul: 0.7,
  ceoActionCap: 7,
  ceoGenericCap: 4,
  ceoGenericMul: 0.5,

  // ══════════════════════════════════════════════════════════════
  // ПРЕЛЮДИИ
  // ══════════════════════════════════════════════════════════════
  preludeEarlyProd: 4,         // production gen ≤ 1
  preludeEarlyTR: 3,           // TR gen ≤ 1
  preludeEarlyResources: 2,    // steel/ti gen ≤ 1
  preludeTagCap: 8,            // max tag bonus на прелюдии

  // Corp+prelude combo
  preludeCorpGodmode: 8,
  preludeCorpGreat: 5,
  preludeCorpGood: 3,
  preludeCorpDecent: 1,

  // Prelude+prelude combo
  preludePreludeGodmode: 6,
  preludePreludeGreat: 4,
  preludePreludeGood: 2,
  preludePreludeDecent: 1,

  // Triple (corp + 2 preludes)
  preludeTripleGodmode: 12,
  preludeTripleGreat: 8,
  preludeTripleGood: 5,
  preludeTripleDecent: 3,

  // Partial triple
  preludePartialGodmode: 6,
  preludePartialGreat: 4,
  preludePartialDecent: 2,

  // Rare tag triple synergy
  preludeRareTagSynergy: 2,

  // ══════════════════════════════════════════════════════════════
  // BREAK-EVEN
  // ══════════════════════════════════════════════════════════════
  breakEvenCap: 15,            // max penalty (was 8 — too lenient for expensive late-game prod)
  breakEvenMul: 3,             // (breakEvenGens - gensLeft) × N

  // ══════════════════════════════════════════════════════════════
  // DENY DRAFT
  // ══════════════════════════════════════════════════════════════
  denyScoreThreshold: 68,      // min score для deny-hint (lowered: catch B-tier denies)
  denyCorpBoostThreshold: 3,   // min getCorpBoost value to trigger deny

  // ══════════════════════════════════════════════════════════════
  // STANDARD PROJECT MILESTONE/AWARD БОНУСЫ
  // ══════════════════════════════════════════════════════════════
  spMilestoneReach: 8,         // вот-вот достигнем milestone (2/3 greeneries etc)
  spMilestoneClose: 3,         // приближаемся к milestone (1/3 etc)
  spAwardLead: 4,              // SP помогает в funded award (greenery→Landscaper etc)
  spAwardContrib: 3,           // SP помогает в award (Landlord, Benefactor, Industrialist)

  // ══════════════════════════════════════════════════════════════
  // BOARD-STATE МОДИФИКАТОРЫ (секция 47)
  // ══════════════════════════════════════════════════════════════
  // 47a: Energy deficit — penalty for energy-consuming cards when energy negative
  energyDeficitPenalty: 3,     // энерг. прод. ≤ 0 + карта жрёт энергию (вычитается)
  energyDeepDeficit: 5,        // энерг. прод. ≤ -2 + карта жрёт ≥ 2 (вычитается)

  // 47b: REMOVED — перенесено в SYNERGY_RULES (секция 48e)

  // 47c: Plant prod vulnerability vs plant attacks
  plantProdVulnPenalty: 3,     // plant prod при oppHasPlantAttack (вычитается)
  oppSolarLogistics: 2,        // space+event при oppHasSolarLogistics (вычитается)

  // 47d: Production-copy cards (Robotic Workforce etc.)
  prodCopyBonusCap: 6,         // max bonus от копирования production
  prodCopyMinVal: 3,           // min ценность production для бонуса

  // 47e: Floater engine availability
  floaterNoEngine: 3,          // floater-requiring card без floater источника (вычитается)
  floaterHasEngine: 2,         // floater card С источником (бонус)

  // 47f: Colony trade density
  colonyTradeDensity: 2,       // colony card при ≥ 3 колоний бонус
  colonyTradeCap: 4,           // max bonus

  // ══════════════════════════════════════════════════════════════
  // SYNERGY RULES (секция 48) — pattern-based mechanical synergies
  // ══════════════════════════════════════════════════════════════
  placerPerTarget: 3,          // placer бонус за каждый accumulator на столе
  placerTargetCap: 6,          // cap бонуса placer→targets
  accumWithPlacer: 3,          // accumulator бонус за каждый placer (max 2)
  accumCompete: 2,             // 3+ accumulator одного типа = placement размазывается
  noTargetPenalty: 4,          // placer без целей (бывший noAnimalTargetPenalty)
  eatsOwnPenalty: 2,           // eater (Predators) + свой accumulator = жрёт свой VP
  eatsOppBonus: 3,             // eater + оппонент имеет targets этого типа
  synRulesCap: 10,             // общий cap (повышен с 8→10, секции 11-12 удалены)

  // ══════════════════════════════════════════════════════════════
  // ГЛОБАЛЬНЫЕ ПАРАМЕТРЫ ИГРЫ (game rules)
  // ══════════════════════════════════════════════════════════════
  maxGenerations: 9,              // expected game length (for gensLeft fallback)
  tempMax: 8,                    // max temperature (°C)
  oxyMax: 14,                    // max oxygen (%)
  oceansMax: 9,                  // max ocean tiles
  venusMax: 30,                  // max venus scale (%)
  tempStep: 2,                   // °C per temperature raise

  // ══════════════════════════════════════════════════════════════
  // ДЕФОЛТНЫЕ ЗНАЧЕНИЯ РЕСУРСОВ
  // ══════════════════════════════════════════════════════════════
  defaultSteelVal: 2,            // steel value без бонусов
  defaultTiVal: 3,               // titanium value без бонусов
  plantsPerGreenery: 8,          // растений на 1 greenery
  heatPerTR: 8,                  // тепла на 1 TR raise

  // ══════════════════════════════════════════════════════════════
  // ДРАФТ
  // ══════════════════════════════════════════════════════════════
  draftCost: 3,                  // MC penalty за покупку карты при драфте

  // ══════════════════════════════════════════════════════════════
  // PLAY PRIORITY (computePlayPriorities)
  // ══════════════════════════════════════════════════════════════
  ppBase: 50,                    // базовый приоритет для всех карт
  ppProdMul: 3,                  // множитель gensLeft для production карт
  ppActionMul: 2,                // множитель gensLeft для action карт
  ppDiscountMul: 4,              // множитель за expensive карт в руке (discount sources)
  ppTrBoost: 5,                  // фиксированный бонус для TR карт
  ppEnablesMul: 5,               // множитель за карты которые активирует
  ppNeedsMul: 3,                 // множитель за зависимость от других карт
  ppVpMul: 2,                    // множитель gensLeft для VP-only penalty
  ppAffordCap: 15,               // cap penalty за дороговизну
  ppAffordDiv: 3,                // делитель (cardCost - myMC) / N
  ppReqGapMul: 3,                // множитель за global requirement gap
  ppReqGapCap: 20,               // cap penalty за далёкий requirement
  ppTagReqMul: 5,                // множитель за tag requirement gap
  ppTagReqCap: 20,               // cap penalty за tag requirement
  ppUnplayable: 50,              // penalty за невозможность сыграть

  // ══════════════════════════════════════════════════════════════
  // PRODUCTION MULTIPLIERS (value per 1 prod)
  // ══════════════════════════════════════════════════════════════
  prodMul: { mp: 1, sp: 1.6, tp: 2.5, pp: 1.6, ep: 1.5, hp: 0.8 },

  // ══════════════════════════════════════════════════════════════
  // RESOURCE VALUES (instant value)
  // ══════════════════════════════════════════════════════════════
  resVal: { mc: 1, st: 2, ti: 3, pl: 1.6, he: 0.5, en: 1, cd: 3 },

  // ══════════════════════════════════════════════════════════════
  // GEN ESTIMATION
  // ══════════════════════════════════════════════════════════════
  genParamDivisor: 4,            // делитель суммы параметров → estimated gens
  maxGL: 13,                     // max gensLeft для FTN_TABLE

  // ══════════════════════════════════════════════════════════════
  // OCEAN ACTION PENALTIES (карта с actOc при мало оставшихся океанов)
  // ══════════════════════════════════════════════════════════════
  oceanPen0: -12,                // 0 океанов осталось
  oceanPen1: -8,                 // 1 океан
  oceanPen2: -4,                 // 2 океана

  // ══════════════════════════════════════════════════════════════
  // RESOURCE NETWORK SYNERGY (floater/animal/microbe сеть)
  // ══════════════════════════════════════════════════════════════
  resNetThreshold: 2,            // min targets на столе для бонуса
  resNetBonus: 1,                // бонус за достижение threshold

  // ══════════════════════════════════════════════════════════════
  // STANDARD PROJECT SCORING (computeAllSP)
  // ══════════════════════════════════════════════════════════════
  spBases: { power: 35, asteroid: 40, aquifer: 45, greenery: 50, city: 45, venus: 38, buffer: 38, lobby: 40 },
  spScales: { power: 2, asteroid: 1.5, aquifer: 1.5, greenery: 1.5, city: 1.5, venus: 1.5, buffer: 1.5, lobby: 1 },
  spCosts: { power: 11, asteroid: 14, aquifer: 18, greenery: 23, city: 25, venus: 15, buffer: 7, lobby: 5 },
  spScoreMin: 20,                // min SP score
  spScoreMax: 95,                // max SP score
  thorgatePowerCost: 8,          // Thorgate: Power Plant стоит 8 вместо 11

  // ══════════════════════════════════════════════════════════════
  // VP MULTIPLIER PROJECTION (секция 21b)
  // ══════════════════════════════════════════════════════════════
  vpMultBaseline: 5,             // базовое предположение VP для мультипликаторов
  vpMultScale: 2.5,              // множитель дельты (vpDelta * scale)
  vpMultCap: 12,                 // max ±корректировка от мультипликатора
};
