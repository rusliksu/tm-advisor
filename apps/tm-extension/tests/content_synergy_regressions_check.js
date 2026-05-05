#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.resolve(__dirname, '..', 'src', 'content.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function extractFunctionSource(fileSource, functionName) {
  const marker = `function ${functionName}(`;
  const start = fileSource.indexOf(marker);
  if (start === -1) throw new Error(`Function not found: ${functionName}`);

  const braceStart = fileSource.indexOf('{', start);
  if (braceStart === -1) throw new Error(`No body found for function: ${functionName}`);

  let depth = 1;
  let i = braceStart + 1;
  while (i < fileSource.length && depth > 0) {
    const ch = fileSource[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    i++;
  }
  if (depth !== 0) throw new Error(`Unbalanced braces for function: ${functionName}`);
  return fileSource.slice(start, i);
}

const getFxSource = extractFunctionSource(source, 'getFx');
const isPureProductionFxSource = extractFunctionSource(source, 'isPureProductionFx');
const isLatePureProductionFxSource = extractFunctionSource(source, 'isLatePureProductionFx');
const isVpAccumulatorActionFxSource = extractFunctionSource(source, 'isVpAccumulatorActionFx');
const isBlueActionFxSource = extractFunctionSource(source, 'isBlueActionFx');
const getVpAccumulatorProjectedResourcesSource = extractFunctionSource(source, 'getVpAccumulatorProjectedResources');
const cardPlacesCityTileByNameSource = extractFunctionSource(source, 'cardPlacesCityTileByName');
const cardPlacesMapTileByNameSource = extractFunctionSource(source, 'cardPlacesMapTileByName');
const getCardTypeByNameSource = extractFunctionSource(source, 'getCardTypeByName');
const isPreludeOrCorpNameSource = extractFunctionSource(source, 'isPreludeOrCorpName');
const cardHasRequirementsByNameSource = extractFunctionSource(source, 'cardHasRequirementsByName');
const cardMatchesDiscountEntrySource = extractFunctionSource(source, 'cardMatchesDiscountEntry');
const getDiscountTargetLabelSource = extractFunctionSource(source, 'getDiscountTargetLabel');
const getCardNameSource = extractFunctionSource(source, 'getCardName');
const getCardTagsForNameSource = extractFunctionSource(source, 'getCardTagsForName');
const resourcePlacementCanReachTargetSource = extractFunctionSource(source, 'resourcePlacementCanReachTarget');
const isLateEcoZoneBioTriggerCardSource = extractFunctionSource(source, 'isLateEcoZoneBioTriggerCard');
const yNameSource = extractFunctionSource(source, 'yName');
const yWeightSource = extractFunctionSource(source, 'yWeight');
const reasonCardLabelSource = extractFunctionSource(source, 'reasonCardLabel');
const describeNamedSynergySource = extractFunctionSource(source, 'describeNamedSynergy');
const describeCorpBoostReasonSource = extractFunctionSource(source, 'describeCorpBoostReason');
const formatReasonNumberSource = extractFunctionSource(source, 'formatReasonNumber');
const formatDiscountTargetReasonSource = extractFunctionSource(source, 'formatDiscountTargetReason');
const globalParamRaisesSource = extractFunctionSource(source, 'globalParamRaises');
const estimateGensLeftSource = extractFunctionSource(source, 'estimateGensLeft');
const getCorpBoostSource = extractFunctionSource(source, 'getCorpBoost');
const checkDenyDraftSource = extractFunctionSource(source, 'checkDenyDraft');
const pushStructuredReasonSource = extractFunctionSource(source, 'pushStructuredReason');
const getRequirementHardnessSource = extractFunctionSource(source, 'getRequirementHardness');
const getProductionFloorStatusSource = extractFunctionSource(source, 'getProductionFloorStatus');
const getRequirementTagReasonLabelSource = extractFunctionSource(source, 'getRequirementTagReasonLabel');
const getRequirementHandTagCountsSource = extractFunctionSource(source, 'getRequirementHandTagCounts');
const getCardTagCountsForNamesSource = extractFunctionSource(source, 'getCardTagCountsForNames');
const countRequirementTagsSource = extractFunctionSource(source, 'countRequirementTags');
const getXavierRequirementWildCountSource = extractFunctionSource(source, 'getXavierRequirementWildCount');
const getRequirementFlexStepsSource = extractFunctionSource(source, 'getRequirementFlexSteps');
const getBoardRequirementCountsSource = extractFunctionSource(source, 'getBoardRequirementCounts');
const getBoardRequirementDisplayNameSource = extractFunctionSource(source, 'getBoardRequirementDisplayName');
const parseBoardRequirementsSource = extractFunctionSource(source, 'parseBoardRequirements');
const evaluateBoardRequirementsSource = extractFunctionSource(source, 'evaluateBoardRequirements');
const isCardPlayableNowByStaticRequirementsSource = extractFunctionSource(source, 'isCardPlayableNowByStaticRequirements');
const computeReqPrioritySource = extractFunctionSource(source, 'computeReqPriority');
const scoreCardRequirementsSource = extractFunctionSource(source, 'scoreCardRequirements');
const scoreTagSynergiesSource = extractFunctionSource(source, 'scoreTagSynergies');
const scoreResourceSynergiesSource = extractFunctionSource(source, 'scoreResourceSynergies');
const scoreCardEconomyInContextSource = extractFunctionSource(source, 'scoreCardEconomyInContext');
const scoreTurmoilSynergySource = extractFunctionSource(source, 'scoreTurmoilSynergy');
const scoreBoardStateModifiersSource = extractFunctionSource(source, 'scoreBoardStateModifiers');
const getCardCostSource = extractFunctionSource(source, 'getCardCost');
const isPlantEngineCardByFxSource = extractFunctionSource(source, 'isPlantEngineCardByFx');
const hasCardTagForScoringSource = extractFunctionSource(source, 'hasCardTagForScoring');
const estimateImmediatePlantGainForFinalSource = extractFunctionSource(source, 'estimateImmediatePlantGainForFinal');
const isFinalGreenerySourceSource = extractFunctionSource(source, 'isFinalGreenerySource');
const isMeltworksLastGenCashoutSource = extractFunctionSource(source, 'isMeltworksLastGenCashout');
const hasSelfFloaterSourceSource = extractFunctionSource(source, 'hasSelfFloaterSource');
const scorePostContextChecksSource = extractFunctionSource(source, 'scorePostContextChecks');
const kaguyaTechConversionValueSource = extractFunctionSource(source, 'kaguyaTechConversionValue');
const ftnRowSource = extractFunctionSource(source, 'ftnRow');
const computeCardValueSource = extractFunctionSource(source, 'computeCardValue');
const scoreBreakEvenTimingSource = extractFunctionSource(source, 'scoreBreakEvenTiming');
const scoreFTNTimingSource = extractFunctionSource(source, 'scoreFTNTiming');
const scoreHandSynergySource = extractFunctionSource(source, 'scoreHandSynergy');
const scoreDiscountsAndPaymentsSource = extractFunctionSource(source, 'scoreDiscountsAndPayments');
const scoreTerraformRateSource = extractFunctionSource(source, 'scoreTerraformRate');
const openingPolicyScoreFromMCSource = extractFunctionSource(source, 'openingPolicyScoreFromMC');
const pushOpeningPolicyReasonSource = extractFunctionSource(source, 'pushOpeningPolicyReason');
const getOpeningContextGameOptionsSource = extractFunctionSource(source, 'getOpeningContextGameOptions');
const getOpeningPlayerCountSource = extractFunctionSource(source, 'getOpeningPlayerCount');
const getOpeningVisibleColoniesForTimingSource = extractFunctionSource(source, 'getOpeningVisibleColoniesForTiming');
const estimateOpeningAverageGameLengthSource = extractFunctionSource(source, 'estimateOpeningAverageGameLength');
const openingExpectedEndGenSource = extractFunctionSource(source, 'openingExpectedEndGen');
const openingRemainingStepsForParamSource = extractFunctionSource(source, 'openingRemainingStepsForParam');
const openingRequirementRouteFactorSource = extractFunctionSource(source, 'openingRequirementRouteFactor');
const openingHandRequirementStepsSource = extractFunctionSource(source, 'openingHandRequirementSteps');
const openingRequirementRateScaleSource = extractFunctionSource(source, 'openingRequirementRateScale');
const openingRequirementStepsPerGenSource = extractFunctionSource(source, 'openingRequirementStepsPerGen');
const estimateOpeningRequirementDelayProfileSource = extractFunctionSource(source, 'estimateOpeningRequirementDelayProfile');
const openingLatePayoffScoreFromDelaySource = extractFunctionSource(source, 'openingLatePayoffScoreFromDelay');
const scoreOpeningDraftPolicySource = extractFunctionSource(source, 'scoreOpeningDraftPolicy');
const isPreludeOrCorpCardSource = extractFunctionSource(source, 'isPreludeOrCorpCard');
const getEffectiveCostSource = extractFunctionSource(source, 'getEffectiveCost');
const formatTableauSynergyReasonSource = extractFunctionSource(source, 'formatTableauSynergyReason');
const dampTableauSynergyWeightSource = extractFunctionSource(source, 'dampTableauSynergyWeight');
const isSpentTableauSynergySource = extractFunctionSource(source, 'isSpentTableauSynergy');
const scoreTableauSynergySource = extractFunctionSource(source, 'scoreTableauSynergy');
const getComboIndexSource = extractFunctionSource(source, 'getComboIndex');
const getAntiComboIndexSource = extractFunctionSource(source, 'getAntiComboIndex');
const scoreComboPotentialSource = extractFunctionSource(source, 'scoreComboPotential');
const scoreSynergyRulesSource = extractFunctionSource(source, '_scoreSynergyRules');
const scoreMapMASource = extractFunctionSource(source, '_scoreMapMA');
const scoreMilestoneAwardProximitySource = extractFunctionSource(source, 'scoreMilestoneAwardProximity');
const getNamedRequirementDelayProfileSource = extractFunctionSource(source, 'getNamedRequirementDelayProfile');
const scorePositionalFactorsSource = extractFunctionSource(source, 'scorePositionalFactors');
const isOpeningHandContextSource = extractFunctionSource(source, 'isOpeningHandContext');
const normalizeOpeningHandBiasSource = extractFunctionSource(source, 'normalizeOpeningHandBias');
const getOpeningHandBiasSource = extractFunctionSource(source, 'getOpeningHandBias');
const getInitialDraftRatingScoreSource = extractFunctionSource(source, 'getInitialDraftRatingScore');

const positionalScoring = new Proxy({
  drawEarlyBonus: 5,
  drawMidBonus: 2,
  drawLatePenalty: 4,
  handEmptyBonus: 3,
  handEmptyThreshold: 3,
  tableauSynergyPer: 3,
  tableauSynergyMax: 4,
  delegateFew: 3,
  delegateMid: 2,
  delegateMany: 1,
  delegateMulti: 1,
  influenceCap: 2,
  energyDeficitPenalty: 3,
  energyDeepDeficit: 8,
  ppUnplayable: 30,
  tagRarity: { jovian: 5, science: 3, venus: 3, earth: 2, microbe: 1, animal: 1, plant: 1, space: 0, building: 0, power: 1, city: 1, event: 0 },
  tagDensity6: 4,
  tagDensity4: 3,
  tagDensity2Rare: 2,
  tagDensity1Epic: 2,
  tagDensityCheapCost: 15,
  tagDensityCheapCap: 1,
  tiProdSynCap: 5,
  steelProdSynCap: 4,
  tiPenaltyCapHigh: 8,
  tiPenaltyCapLow: 5,
  tiPenaltyCostThreshold: 10,
  tiPenaltyCostHigh: 25,
  tiPenaltyDivisor: 5,
  lateProdGen9: -15,
  lateProdGen8: -10,
  lateProdGen7: -5,
  lateProdGen6: -2,
  mcProdExcessPenalty: 2,
  mcProdExcessThreshold: 15,
  ftnReferenceGL: 7,
  ftnScaleProd: 2.0,
  ftnScaleOther: 1.5,
  ftnCapProd: 15,
  ftnCapOther: 15,
  ftnCostFree: 15,
  ftnCostPerGen: 15,
  maxGL: 13,
  oxyMax: 14,
  tempMax: 8,
  oceansMax: 9,
  plantsPerGreenery: 8,
  plantEngineConvBonus: 2,
  endgameGreeneryBonus: 3,
  prodMul: { mp: 1, sp: 1.6, tp: 2.5, pp: 2.0, ep: 1.5, hp: 0.8 },
  resVal: { mc: 1, st: 2, ti: 3, pl: 1.6, he: 0.5, en: 1, cd: 3 },
  multiTagCap: 4,
  energyConsumerCap: 4,
  energySinkBonus: 3,
  energySurplusPenalty: 2,
  draftCost: 3,
  breakEvenCap: 15,
  breakEvenMul: 3,
  comboGodmode: 10,
  comboGreat: 7,
  comboGood: 5,
  comboDecent: 3,
  timingBlue6: 1.5,
  timingBlue4: 1.2,
  timingBlue2: 0.8,
  timingBlue1: 0.5,
  timingProd5: 1.3,
  timingProd3: 1.0,
  timingProd1: 0.4,
  timingVPBurst2: 1.4,
  timingVPBurst4: 1.1,
  timingVPBurstHi: 0.8,
  timingAccum5: 1.4,
  timingAccum3: 1.1,
  timingAccum1: 0.6,
  triggerCap: 10,
  discountCap: 10,
  discountStackMax: 3,
  steelPayCap: 6,
  steelPayDivisor: 4,
  tiPayCap: 8,
  tiPayDivisor: 5,
  terraformFastThreshold: 3,
  terraformSlowThreshold: 1,
  terraformFastProdPenalty: 2,
  terraformSlowProdBonus: 2,
  terraformFastVPBonus: 2,
}, {
  get(target, prop) {
    return Object.prototype.hasOwnProperty.call(target, prop) ? target[prop] : 0;
  },
});

const sandbox = {
  console,
  Set,
  TM_CONTENT_PLAY_PRIORITY: null,
  TM_CARD_EFFECTS: {},
  TM_CARD_DATA: {},
  TM_CARD_TAGS: {},
  TM_CARD_TAG_REQS: {},
  TM_CARD_GLOBAL_REQS: {},
  TM_CARD_DISCOUNTS: {},
  TM_TAG_TRIGGERS: {},
  TM_ANIMAL_VP_CARDS: [],
  TM_MICROBE_VP_CARDS: [],
  TM_ANIMAL_PLACERS: {},
  TM_ENERGY_PRODUCERS: [],
  TM_ENERGY_CONSUMERS: [],
  TM_JOVIAN_VP_CARDS: [],
  TM_FLOATER_GENERATORS: [],
  TM_FLOATER_CONSUMERS: [],
  TM_STACKING_RULES: [],
  TM_NAMED_EFF_COMBOS: [],
  TM_NAMED_TAG_COMBOS: [],
  TM_OPP_CORP_VULN_GLOBAL: {},
  TM_DELEGATE_CARDS: {},
  TM_CARD_DESCRIPTIONS: {},
  MA_DATA: {},
  TAG_TO_MA: {},
  TM_FTN_TABLE: {
    0: [8.0, 0.0, 8.0],
    1: [8.0, 0.5, 7.5],
    2: [8.0, 1.2, 6.8],
    3: [8.0, 2.0, 6.0],
    4: [7.9, 2.9, 5.0],
    5: [7.8, 3.9, 3.9],
    6: [7.6, 4.8, 2.8],
    7: [7.4, 5.4, 2.0],
    8: [7.2, 5.6, 1.6],
    9: [7.1, 5.7, 1.4],
    10: [7.0, 5.8, 1.2],
    11: [7.0, 5.9, 1.1],
    12: [7.0, 6.0, 1.0],
    13: [7.0, 6.0, 1.0],
  },
  FTN_FALLBACK: [7, 5, 5],
  TM_RATINGS: {},
  _TM_RATINGS_RAW: {},
  TM_COMBOS: [],
  TM_ANTI_COMBOS: [],
  TM_CORPS: {},
  FLOATER_TARGETS: new Set(),
  ANIMAL_TARGETS: new Set(),
  MICROBE_TARGETS: new Set(),
  TM_FLOATER_TRAPS: {},
  PROD_KEYWORDS: ['прод', 'prod', 'production', 'increase'],
  VP_KEYWORDS: ['VP', 'vp', 'ПО', 'victory point'],
  kebabLookup: {},
  lowerLookup: {},
  resolveCorpName(name) {
    return name;
  },
  _baseCardName(name) {
    return name;
  },
  _getRatingByCardName(name) {
    return sandbox.TM_RATINGS[name] || null;
  },
  _getRatingKeyByCardName(name) {
    return name;
  },
  SC: positionalScoring,
  _lookupCardData(table, key) {
    return table ? table[key] : undefined;
  },
  detectMyCorps() {
    return [];
  },
  getVisiblePreludeNames() {
    return [];
  },
  getVisibleColonyNames() {
    return [];
  },
  cardIsColonyRelatedByName() {
    return false;
  },
  cardBuildsColonyByName() {
    return false;
  },
  cardHasTradeEngineByName() {
    return false;
  },
  computeParamSaturation() {
    return {penalty: 0, reason: ''};
  },
  getNamedRequirementDelayProfile() {
    return {suppressAccumulatorBonus: false};
  },
  isFloaterCardByFx() {
    return false;
  },
  getFx() {
    return null;
  },
  cardN(card) {
    if (typeof card === 'string') return card;
    return card && card.name ? card.name : '';
  },
  getMyHandNames() {
    return sandbox.__tm_test_handNames || [];
  },
  getPlayerVueData() {
    return sandbox.__tm_test_pv || null;
  },
  __tm_test_generation: 1,
  detectGeneration() {
    return sandbox.__tm_test_generation || 1;
  },
};
sandbox.FTN_TABLE = sandbox.TM_FTN_TABLE;
sandbox.PROD_MUL = positionalScoring.prodMul;
sandbox.RES_VAL = positionalScoring.resVal;
sandbox.globalThis = sandbox;

vm.runInNewContext(
  [
    getFxSource,
    isPureProductionFxSource,
    isLatePureProductionFxSource,
    isVpAccumulatorActionFxSource,
    isBlueActionFxSource,
    getVpAccumulatorProjectedResourcesSource,
    cardPlacesCityTileByNameSource,
    cardPlacesMapTileByNameSource,
    getCardTypeByNameSource,
    isPreludeOrCorpNameSource,
    cardHasRequirementsByNameSource,
    cardMatchesDiscountEntrySource,
    getDiscountTargetLabelSource,
    getCardNameSource,
    getCardTagsForNameSource,
    resourcePlacementCanReachTargetSource,
    isLateEcoZoneBioTriggerCardSource,
    yNameSource,
    yWeightSource,
    reasonCardLabelSource,
    describeNamedSynergySource,
    describeCorpBoostReasonSource,
    formatReasonNumberSource,
    formatDiscountTargetReasonSource,
    globalParamRaisesSource,
    estimateGensLeftSource,
    getCorpBoostSource,
    checkDenyDraftSource,
    pushStructuredReasonSource,
    getRequirementHardnessSource,
    getRequirementTagReasonLabelSource,
    getRequirementHandTagCountsSource,
    getCardTagCountsForNamesSource,
    countRequirementTagsSource,
    getXavierRequirementWildCountSource,
    getRequirementFlexStepsSource,
    getBoardRequirementCountsSource,
    getBoardRequirementDisplayNameSource,
    parseBoardRequirementsSource,
    evaluateBoardRequirementsSource,
    isCardPlayableNowByStaticRequirementsSource,
    computeReqPrioritySource,
    scoreCardRequirementsSource,
    scoreTagSynergiesSource,
    scoreResourceSynergiesSource,
    scoreCardEconomyInContextSource,
    getProductionFloorStatusSource,
    scoreTurmoilSynergySource,
    scoreBoardStateModifiersSource,
    getCardCostSource,
    isPlantEngineCardByFxSource,
    hasCardTagForScoringSource,
    estimateImmediatePlantGainForFinalSource,
    isFinalGreenerySourceSource,
    isMeltworksLastGenCashoutSource,
    hasSelfFloaterSourceSource,
    scorePostContextChecksSource,
    kaguyaTechConversionValueSource,
    ftnRowSource,
    computeCardValueSource,
    scoreBreakEvenTimingSource,
    scoreFTNTimingSource,
    scoreHandSynergySource,
    scoreDiscountsAndPaymentsSource,
    scoreTerraformRateSource,
    openingPolicyScoreFromMCSource,
    pushOpeningPolicyReasonSource,
    getOpeningContextGameOptionsSource,
    getOpeningPlayerCountSource,
    getOpeningVisibleColoniesForTimingSource,
    estimateOpeningAverageGameLengthSource,
    openingExpectedEndGenSource,
    openingRemainingStepsForParamSource,
    openingRequirementRouteFactorSource,
    openingHandRequirementStepsSource,
    openingRequirementRateScaleSource,
    openingRequirementStepsPerGenSource,
    estimateOpeningRequirementDelayProfileSource,
    openingLatePayoffScoreFromDelaySource,
    scoreOpeningDraftPolicySource,
    isPreludeOrCorpCardSource,
    getEffectiveCostSource,
    formatTableauSynergyReasonSource,
    dampTableauSynergyWeightSource,
    isSpentTableauSynergySource,
    scoreTableauSynergySource,
    'var _comboIndex = null; var _antiComboIndex = null;',
    getComboIndexSource,
    getAntiComboIndexSource,
    scoreComboPotentialSource,
    scoreSynergyRulesSource,
    scoreMapMASource,
    'var MA_DATA = globalThis.MA_DATA || {}; var TAG_TO_MA = globalThis.TAG_TO_MA || {};',
    scoreMilestoneAwardProximitySource,
    getNamedRequirementDelayProfileSource,
    scorePositionalFactorsSource,
    isOpeningHandContextSource,
    normalizeOpeningHandBiasSource,
    getOpeningHandBiasSource,
    getInitialDraftRatingScoreSource,
    'globalThis.__tm_test_describeCorpBoostReason = describeCorpBoostReason;',
    'globalThis.__tm_test_estimateGensLeft = estimateGensLeft;',
    'globalThis.__tm_test_getCorpBoost = getCorpBoost;',
    'globalThis.__tm_test_checkDenyDraft = checkDenyDraft;',
    'globalThis.__tm_test_scoreCardRequirements = scoreCardRequirements;',
    'globalThis.__tm_test_computeReqPriority = computeReqPriority;',
    'globalThis.__tm_test_scoreTagSynergies = scoreTagSynergies;',
    'globalThis.__tm_test_scoreResourceSynergies = scoreResourceSynergies;',
    'globalThis.__tm_test_scoreCardEconomyInContext = scoreCardEconomyInContext;',
    'globalThis.__tm_test_getProductionFloorStatus = getProductionFloorStatus;',
    'globalThis.__tm_test_scoreTurmoilSynergy = scoreTurmoilSynergy;',
    'globalThis.__tm_test_scoreBoardStateModifiers = scoreBoardStateModifiers;',
    'globalThis.__tm_test_getCardCost = getCardCost;',
    'globalThis.__tm_test_isPlantEngineCardByFx = isPlantEngineCardByFx;',
    'globalThis.__tm_test_estimateImmediatePlantGainForFinal = estimateImmediatePlantGainForFinal;',
    'globalThis.__tm_test_isFinalGreenerySource = isFinalGreenerySource;',
    'globalThis.__tm_test_isMeltworksLastGenCashout = isMeltworksLastGenCashout;',
    'globalThis.__tm_test_scorePostContextChecks = scorePostContextChecks;',
    'globalThis.__tm_test_kaguyaTechConversionValue = kaguyaTechConversionValue;',
    'globalThis.__tm_test_isVpAccumulatorActionFx = isVpAccumulatorActionFx;',
    'globalThis.__tm_test_isBlueActionFx = isBlueActionFx;',
    'globalThis.__tm_test_getVpAccumulatorProjectedResources = getVpAccumulatorProjectedResources;',
    'globalThis.__tm_test_computeCardValue = computeCardValue;',
    'globalThis.__tm_test_scoreBreakEvenTiming = scoreBreakEvenTiming;',
    'globalThis.__tm_test_scoreFTNTiming = scoreFTNTiming;',
    'globalThis.__tm_test_scoreHandSynergy = scoreHandSynergy;',
    'globalThis.__tm_test_scoreDiscountsAndPayments = scoreDiscountsAndPayments;',
    'globalThis.__tm_test_scoreTerraformRate = scoreTerraformRate;',
    'globalThis.__tm_test_openingExpectedEndGen = openingExpectedEndGen;',
    'globalThis.__tm_test_estimateOpeningRequirementDelayProfile = estimateOpeningRequirementDelayProfile;',
    'globalThis.__tm_test_scoreOpeningDraftPolicy = scoreOpeningDraftPolicy;',
    'globalThis.__tm_test_isPreludeOrCorpCard = isPreludeOrCorpCard;',
    'globalThis.__tm_test_scoreTableauSynergy = scoreTableauSynergy;',
    'globalThis.__tm_test_scoreComboPotential = scoreComboPotential;',
    'globalThis.__tm_test_resourcePlacementCanReachTarget = resourcePlacementCanReachTarget;',
    'globalThis.__tm_test_scoreSynergyRules = _scoreSynergyRules;',
    'globalThis.__tm_test_scoreMapMA = _scoreMapMA;',
    'globalThis.__tm_test_scoreMilestoneAwardProximity = scoreMilestoneAwardProximity;',
    'globalThis.__tm_test_getNamedRequirementDelayProfile = getNamedRequirementDelayProfile;',
    'globalThis.__tm_test_scorePositionalFactors = scorePositionalFactors;',
    'globalThis.__tm_test_getOpeningHandBias = getOpeningHandBias;',
    'globalThis.__tm_test_getInitialDraftRatingScore = getInitialDraftRatingScore;',
  ].join('\n\n'),
  sandbox,
  {filename: sourcePath}
);

const describeCorpBoostReason = sandbox.__tm_test_describeCorpBoostReason;
const estimateGensLeft = sandbox.__tm_test_estimateGensLeft;
const getCorpBoost = sandbox.__tm_test_getCorpBoost;
const checkDenyDraft = sandbox.__tm_test_checkDenyDraft;
const scoreCardRequirements = sandbox.__tm_test_scoreCardRequirements;
const computeReqPriority = sandbox.__tm_test_computeReqPriority;
const scoreTagSynergies = sandbox.__tm_test_scoreTagSynergies;
const scoreResourceSynergies = sandbox.__tm_test_scoreResourceSynergies;
const scoreCardEconomyInContext = sandbox.__tm_test_scoreCardEconomyInContext;
const getProductionFloorStatus = sandbox.__tm_test_getProductionFloorStatus;
const scoreTurmoilSynergy = sandbox.__tm_test_scoreTurmoilSynergy;
const scoreBoardStateModifiers = sandbox.__tm_test_scoreBoardStateModifiers;
const getCardCost = sandbox.__tm_test_getCardCost;
const isPlantEngineCardByFx = sandbox.__tm_test_isPlantEngineCardByFx;
const estimateImmediatePlantGainForFinal = sandbox.__tm_test_estimateImmediatePlantGainForFinal;
const isFinalGreenerySource = sandbox.__tm_test_isFinalGreenerySource;
const isMeltworksLastGenCashout = sandbox.__tm_test_isMeltworksLastGenCashout;
const scorePostContextChecks = sandbox.__tm_test_scorePostContextChecks;
const kaguyaTechConversionValue = sandbox.__tm_test_kaguyaTechConversionValue;
const isVpAccumulatorActionFx = sandbox.__tm_test_isVpAccumulatorActionFx;
const isBlueActionFx = sandbox.__tm_test_isBlueActionFx;
const getVpAccumulatorProjectedResources = sandbox.__tm_test_getVpAccumulatorProjectedResources;
const computeCardValue = sandbox.__tm_test_computeCardValue;
const scoreBreakEvenTiming = sandbox.__tm_test_scoreBreakEvenTiming;
const scoreFTNTiming = sandbox.__tm_test_scoreFTNTiming;
const scoreHandSynergy = sandbox.__tm_test_scoreHandSynergy;
const scoreDiscountsAndPayments = sandbox.__tm_test_scoreDiscountsAndPayments;
const scoreTerraformRate = sandbox.__tm_test_scoreTerraformRate;
const openingExpectedEndGen = sandbox.__tm_test_openingExpectedEndGen;
const estimateOpeningRequirementDelayProfile = sandbox.__tm_test_estimateOpeningRequirementDelayProfile;
const scoreOpeningDraftPolicy = sandbox.__tm_test_scoreOpeningDraftPolicy;
const isPreludeOrCorpCard = sandbox.__tm_test_isPreludeOrCorpCard;
const scoreTableauSynergy = sandbox.__tm_test_scoreTableauSynergy;
const scoreComboPotential = sandbox.__tm_test_scoreComboPotential;
const resourcePlacementCanReachTarget = sandbox.__tm_test_resourcePlacementCanReachTarget;
const scoreSynergyRules = sandbox.__tm_test_scoreSynergyRules;
const scoreMapMA = sandbox.__tm_test_scoreMapMA;
const scoreMilestoneAwardProximity = sandbox.__tm_test_scoreMilestoneAwardProximity;
const getNamedRequirementDelayProfile = sandbox.__tm_test_getNamedRequirementDelayProfile;
const scorePositionalFactors = sandbox.__tm_test_scorePositionalFactors;
const getOpeningHandBias = sandbox.__tm_test_getOpeningHandBias;
const getInitialDraftRatingScore = sandbox.__tm_test_getInitialDraftRatingScore;

assert.strictEqual(
  checkDenyDraft(
    {s: 76, t: 'B', e: 'Increase your plant production 1 step for each plant tag you have.'},
    72,
    {oppCorps: ['Any Corp'], oppStrategies: {'Пеша': [{id: 'plant'}]}},
    new Set(),
    'Insects',
    'increase your plant production 1 step for each plant tag you have.'
  ),
  '\u2702 Deny: Пеша plant shell',
  'Insects should be treated as a deny pick against an opponent plant shell even when it is not good for us'
);

function assertNoUglyFloatReasons(result, label) {
  const reasons = result && Array.isArray(result.reasons) ? result.reasons : [];
  const ugly = reasons.find((reason) => /\d+\.\d{6,}/.test(reason));
  assert(!ugly, `${label} should not expose JS floating point artifacts: ${ugly || ''}`);
}

assert.strictEqual(typeof describeCorpBoostReason, 'function', 'describeCorpBoostReason should be exposed');
assert.strictEqual(typeof estimateGensLeft, 'function', 'estimateGensLeft should be exposed');
assert.strictEqual(typeof getCorpBoost, 'function', 'getCorpBoost should be exposed');
assert.strictEqual(typeof scoreCardRequirements, 'function', 'scoreCardRequirements should be exposed');
assert.strictEqual(typeof computeReqPriority, 'function', 'computeReqPriority should be exposed');
assert.strictEqual(typeof scoreTagSynergies, 'function', 'scoreTagSynergies should be exposed');
assert.strictEqual(typeof scoreResourceSynergies, 'function', 'scoreResourceSynergies should be exposed');
assert.strictEqual(typeof scoreCardEconomyInContext, 'function', 'scoreCardEconomyInContext should be exposed');
assert.strictEqual(typeof getProductionFloorStatus, 'function', 'getProductionFloorStatus should be exposed');
assert.strictEqual(typeof scoreTurmoilSynergy, 'function', 'scoreTurmoilSynergy should be exposed');
assert.strictEqual(typeof scoreBoardStateModifiers, 'function', 'scoreBoardStateModifiers should be exposed');
assert.strictEqual(typeof getCardCost, 'function', 'getCardCost should be exposed');
assert.strictEqual(typeof isPlantEngineCardByFx, 'function', 'isPlantEngineCardByFx should be exposed');
assert.strictEqual(typeof estimateImmediatePlantGainForFinal, 'function', 'estimateImmediatePlantGainForFinal should be exposed');
assert.strictEqual(typeof isFinalGreenerySource, 'function', 'isFinalGreenerySource should be exposed');
assert.strictEqual(typeof isMeltworksLastGenCashout, 'function', 'isMeltworksLastGenCashout should be exposed');
assert.strictEqual(typeof scorePostContextChecks, 'function', 'scorePostContextChecks should be exposed');
assert.strictEqual(typeof kaguyaTechConversionValue, 'function', 'kaguyaTechConversionValue should be exposed');
assert.strictEqual(typeof isVpAccumulatorActionFx, 'function', 'isVpAccumulatorActionFx should be exposed');
assert.strictEqual(typeof isBlueActionFx, 'function', 'isBlueActionFx should be exposed');
assert.strictEqual(typeof getVpAccumulatorProjectedResources, 'function', 'getVpAccumulatorProjectedResources should be exposed');
assert.strictEqual(typeof computeCardValue, 'function', 'computeCardValue should be exposed');
assert.strictEqual(typeof scoreBreakEvenTiming, 'function', 'scoreBreakEvenTiming should be exposed');
assert.strictEqual(typeof scoreFTNTiming, 'function', 'scoreFTNTiming should be exposed');
assert.strictEqual(typeof scoreHandSynergy, 'function', 'scoreHandSynergy should be exposed');
assert.strictEqual(typeof scoreDiscountsAndPayments, 'function', 'scoreDiscountsAndPayments should be exposed');
assert.strictEqual(typeof scoreTerraformRate, 'function', 'scoreTerraformRate should be exposed');
assert.strictEqual(typeof openingExpectedEndGen, 'function', 'openingExpectedEndGen should be exposed');
assert.strictEqual(typeof estimateOpeningRequirementDelayProfile, 'function', 'estimateOpeningRequirementDelayProfile should be exposed');
assert.strictEqual(typeof scoreOpeningDraftPolicy, 'function', 'scoreOpeningDraftPolicy should be exposed');
assert.strictEqual(typeof scoreTableauSynergy, 'function', 'scoreTableauSynergy should be exposed');
assert.strictEqual(typeof scoreComboPotential, 'function', 'scoreComboPotential should be exposed');
assert.strictEqual(typeof resourcePlacementCanReachTarget, 'function', 'resourcePlacementCanReachTarget should be exposed');
assert.strictEqual(typeof scoreSynergyRules, 'function', 'scoreSynergyRules should be exposed');
assert.strictEqual(typeof scoreMapMA, 'function', 'scoreMapMA should be exposed');
assert.strictEqual(typeof scoreMilestoneAwardProximity, 'function', 'scoreMilestoneAwardProximity should be exposed');
assert.strictEqual(typeof scorePositionalFactors, 'function', 'scorePositionalFactors should be exposed');
assert.strictEqual(typeof getOpeningHandBias, 'function', 'getOpeningHandBias should be exposed');
assert.strictEqual(typeof getInitialDraftRatingScore, 'function', 'getInitialDraftRatingScore should be exposed');
assert(source.includes("co2-reducers"), 'Pathfinders CO2/CO² Reducers alias should be present in content lookup');

const contentFullOpeningNoWgt = {
  game: {
    generation: 1,
    temperature: -30,
    oxygenLevel: 0,
    oceans: 0,
    gameOptions: {solarPhaseOption: false, preludeExtension: true, coloniesExtension: true},
    players: [{color: 'red'}, {color: 'blue'}, {color: 'green'}],
  },
};
sandbox.__tm_test_generation = 1;
sandbox.SC.genParamDivisor = 4;
sandbox.TM_ADVISOR = null;
sandbox.TM_BRAIN_CORE = null;
assert.strictEqual(
  estimateGensLeft(contentFullOpeningNoWgt),
  10,
  'content fallback should use calibrated 3P no-WGT baseline instead of 42/genParamDivisor ~= 11'
);
sandbox.TM_BRAIN_CORE = {
  estimateGensLeftFromState() {
    return 7;
  },
};
assert.strictEqual(
  estimateGensLeft(contentFullOpeningNoWgt),
  7,
  'content fallback should delegate to TM_BRAIN_CORE when TM_ADVISOR is not available yet'
);
sandbox.TM_BRAIN_CORE = null;

assert.strictEqual(
  openingExpectedEndGen({
    gen: 1,
    _playerCount: 3,
    gameOptions: {solarPhaseOption: true, preludeExtension: true, coloniesExtension: true},
  }),
  9,
  'opening timing should use the same 3P WGT baseline as header gens-left'
);
assert.strictEqual(
  openingExpectedEndGen({
    gen: 1,
    _playerCount: 3,
    gameOptions: {solarPhaseOption: false, preludeExtension: true, coloniesExtension: true},
  }),
  10,
  'opening timing should use the calibrated 3P no-WGT baseline'
);
assert.strictEqual(
  openingExpectedEndGen({
    gen: 1,
    _playerCount: 2,
    gameOptions: {solarPhaseOption: true, preludeExtension: true, coloniesExtension: true},
  }),
  11.5,
  'opening timing should use the calibrated 2P baseline'
);
let capturedOpeningLengthState = null;
sandbox.TM_BRAIN_CORE = {
  estimateAverageGameLengthFromState(state, options) {
    capturedOpeningLengthState = {state, options};
    return 10.5;
  },
};
assert.strictEqual(
  openingExpectedEndGen({
    gen: 1,
    _playerCount: 3,
    gameOptions: {solarPhaseOption: true, preludeExtension: true, coloniesExtension: true},
  }),
  10.5,
  'opening timing should delegate its baseline to TM_BRAIN_CORE when available'
);
assert.strictEqual(
  capturedOpeningLengthState.options.playerCount,
  3,
  'opening timing should pass player count into TM_BRAIN_CORE baseline estimation'
);
sandbox.TM_BRAIN_CORE = null;

sandbox.TM_CARD_EFFECTS = {
  'Cloud Seeding': {c: 11, pp: 2, mp: -1, pOpp: 1},
  'Trigger One': {},
  'Trigger Two': {},
  'Trigger Three': {},
};
sandbox.TM_CARD_TAGS = {
  'Cloud Seeding': [],
  'Trigger One': [],
  'Trigger Two': [],
  'Trigger Three': [],
};
sandbox.TM_TAG_TRIGGERS = {
  'Trigger One': [{tags: ['plant'], value: 1}],
  'Trigger Two': [{tags: ['microbe'], value: 1}],
  'Trigger Three': [{tags: ['earth'], value: 1}],
};
sandbox.TM_CARD_DISCOUNTS = {};
const cloudSeedingNoTagPenalty = scoreHandSynergy(
  'Cloud Seeding',
  ['Cloud Seeding', 'Trigger One', 'Trigger Two', 'Trigger Three'],
  {
    gensLeft: 7,
    gen: 2,
    globalParams: {temp: -24, oxy: 2, oceans: 3, venus: 0},
    tags: {},
    _myCorps: [],
  },
);
const cloudSeedingNoTagReason = cloudSeedingNoTagPenalty.reasons.find((reason) => reason.includes('no tag: miss 3 trigger/disc')) || '';
assert(cloudSeedingNoTagReason, 'Cloud Seeding should show the no-tag trigger/discount miss reason');
assert(
  !/1\.799999/.test(cloudSeedingNoTagReason),
  'No-tag penalty reason should not expose JS floating point artifacts',
);
assert(
  cloudSeedingNoTagReason.includes('−1.8'),
  'No-tag penalty reason should be rounded to one decimal place',
);
assertNoUglyFloatReasons(cloudSeedingNoTagPenalty, 'Cloud Seeding no-tag penalty');

sandbox.TM_CARD_EFFECTS = {
  'Optimal Aerobraking': {c: 7},
  Asteroid: {c: 14, tmp: 1},
  'Local Heat Trapping': {c: 1},
  'Media Group': {c: 6},
};
sandbox.TM_CARD_TAGS = {
  'Optimal Aerobraking': ['space'],
  Asteroid: ['event', 'space'],
  'Local Heat Trapping': ['event'],
  'Media Group': ['earth', 'event'],
};
sandbox.TM_CARD_TAG_REQS = {};
sandbox.TM_CARD_GLOBAL_REQS = {};
sandbox.TM_CARD_DISCOUNTS = {};
sandbox.TM_TAG_TRIGGERS = {};
const optAeroMixedEventsSynergy = scoreHandSynergy(
  'Optimal Aerobraking',
  ['Optimal Aerobraking', 'Asteroid', 'Local Heat Trapping', 'Media Group'],
  {
    gensLeft: 4,
    gen: 5,
    globalParams: {temp: 6, oxy: 8, oceans: 5, venus: 0},
    tags: {},
    _myCorps: [],
  },
);
const optAeroMixedReasons = optAeroMixedEventsSynergy.reasons.join(' | ');
assert(
  optAeroMixedReasons.includes('1 space ev'),
  'Optimal Aerobraking should still count actual space-event triggers in hand',
);
assert(
  !/\d+ events \+3ea/.test(optAeroMixedReasons),
  'Optimal Aerobraking should not treat non-space events as trigger density',
);
assertNoUglyFloatReasons(optAeroMixedEventsSynergy, 'Optimal Aerobraking mixed-event hand');

sandbox.TM_CARD_EFFECTS = {
  'Dirigibles': {c: 11},
  'Immigration Shuttles': {c: 31, mp: 5},
  'Mercurian Alloys': {c: 3},
};
sandbox.TM_CARD_TAGS = {
  'Dirigibles': ['venus'],
  'Immigration Shuttles': ['earth', 'space'],
  'Mercurian Alloys': ['space'],
};
sandbox.TM_CARD_TAG_REQS = {};
sandbox.TM_CARD_DISCOUNTS = {
  'Mercurian Alloys': {_all: 2},
};
const mercurianDirigiblesSynergy = scoreHandSynergy(
  'Dirigibles',
  ['Dirigibles', 'Mercurian Alloys'],
  {
    gensLeft: 7,
    gen: 3,
    globalParams: {temp: -30, oxy: 4, oceans: 4, venus: 2},
    tags: {science: 0},
    _myCorps: [],
  },
);
assert(
  !mercurianDirigiblesSynergy.reasons.some((reason) => reason.includes('Mercurian Alloys') && reason.includes('скидка')),
  'Mercurian Alloys should not be modeled as a generic discount for non-space Venus cards like Dirigibles',
);
sandbox.TM_CARD_DISCOUNTS = {
  'Cutting Edge Technology': {_req: 2},
  'Earth Catapult': {_all: 2},
};
const cuttingEdgeNoReqStack = scoreHandSynergy(
  'Dirigibles',
  ['Dirigibles', 'Cutting Edge Technology', 'Earth Catapult'],
  {
    gensLeft: 2,
    gen: 9,
    globalParams: {temp: 6, oxy: 12, oceans: 7, venus: 14},
    tags: {science: 4},
    _myCorps: [],
  },
);
assert(
  !cuttingEdgeNoReqStack.reasons.some((reason) => reason.includes('disc stack -4')),
  'Cutting Edge Technology _req discount should not stack on cards without requirements',
);
sandbox.TM_CARD_DATA['Birds'] = {requirements: [{oxygen: {min: 13}}]};
sandbox.TM_CARD_GLOBAL_REQS['Birds'] = {oxygen: {min: 13}};
const lateCuttingEdgeThinReqTargets = scorePostContextChecks(
  'Cutting Edge Technology',
  null,
  'when playing a card with a requirement, you pay 2 m€ less for it. 1 vp',
  {e: 'When playing a card with a requirement, you pay 2 M€ less for it. 1 VP.', c: 12},
  new Set(['science']),
  {
    gensLeft: 2,
    gen: 9,
    globalParams: {temp: 6, oxy: 13, oceans: 7, venus: 14},
    prod: {plants: 0, heat: 0},
    tags: {science: 4},
    tableauNames: new Set(),
    _myCorps: [],
    microbeAccumRate: 0,
    floaterAccumRate: 0,
    floaterTargetCount: 0,
    animalTargetCount: 0,
    microbeTargetCount: 0,
  },
  null,
  ['Cutting Edge Technology', 'Birds'],
);
assert(
  lateCuttingEdgeThinReqTargets.bonus <= -22,
  'Late Cutting Edge Technology with only one playable requirement target should get a real context downgrade',
);
assert(
  lateCuttingEdgeThinReqTargets.reasons.some((reason) => reason.includes('CET поздно') && reason.includes('req targets 1')),
  'Late Cutting Edge Technology target-count downgrade should be visible in reasons',
);
sandbox.CORP_ABILITY_SYNERGY = {
  'Tharsis Republic': {tags: ['city'], kw: ['city', 'город'], b: 4},
  'Philares': {tags: [], kw: ['tile', 'тайл', 'city', 'город', 'greenery', 'озелен', 'ocean', 'океан'], b: 4},
};
sandbox.TAG_TRIGGERS = {};
sandbox.CORP_DISCOUNTS = {};
const immigrationCorpMarkers = scoreTagSynergies(
  'Immigration Shuttles',
  new Set(['earth', 'space']),
  'green',
  31,
  1,
  'increase your m€ production 5 steps. 1 vp for every 3 city tiles in play.',
  {e: 'increase your m€ production 5 steps. 1 vp for every 3 city tiles in play.'},
  ['Philares', 'Tharsis Republic'],
  {
    gen: 3,
    gensLeft: 7,
    tags: {earth: 1, space: 0, city: 1},
    tagsWithHand: {earth: 2, space: 1, city: 1},
    globalParams: {temp: -30, oxy: 4, oceans: 4, venus: 2},
  },
  null,
);
assert(
  !immigrationCorpMarkers.reasons.some((reason) => reason.includes('Корп: Philares') || reason.includes('Корп: Tharsis Republic')),
  'Immigration Shuttles should not show tile/city corp markers unless it actually places a tile/city',
);
sandbox.CORP_ABILITY_SYNERGY = {};
sandbox.TM_CARD_DISCOUNTS = {};

sandbox.TM_CARD_EFFECTS = {
  'Harvest': {c: 4, mc: 12},
  'Insects': {c: 9, pp: 1},
};
sandbox.TM_CARD_TAGS = {
  'Harvest': ['event', 'plant'],
  'Insects': ['plant'],
};
const harvestInsectsSynergy = scoreHandSynergy(
  'Harvest',
  ['Harvest', 'Insects'],
  {
    gensLeft: 7,
    gen: 3,
    globalParams: {temp: -30, oxy: 4, oceans: 4, venus: 2},
    tags: {plant: 2},
    _myCorps: [],
  },
);
assert(
  !harvestInsectsSynergy.reasons.some((reason) => reason.includes('Insects +tag')),
  'Harvest should not count as an Insects plant-tag payoff because event tags do not persist',
);
const insectsHarvestSynergy = scoreHandSynergy(
  'Insects',
  ['Insects', 'Harvest'],
  {
    gensLeft: 7,
    gen: 3,
    globalParams: {temp: -30, oxy: 4, oceans: 4, venus: 2},
    tags: {plant: 2},
    _myCorps: [],
  },
);
assert(
  !insectsHarvestSynergy.reasons.some((reason) => reason.includes('plant tag')),
  'Insects should not count plant tags from event cards in hand',
);

sandbox.TM_CARD_EFFECTS = {
  Livestock: {c: 13, pp: -1, mp: 2},
};
const livestockMissingPlantProd = scoreBoardStateModifiers(
  'Livestock',
  {},
  '',
  {
    gen: 5,
    gensLeft: 4,
    prod: {plants: 0, energy: 0, steel: 0, ti: 0, heat: 0},
  },
);
assert.strictEqual(
  livestockMissingPlantProd.bonus,
  -10,
  'missing own plant production for Livestock should be a temporary soft-lock penalty, not ppUnplayable',
);
assert(
  livestockMissingPlantProd.reasons.some((reason) => reason.includes('Не сейчас: plants prod 0→-1 −10')),
  'temporary production-payment locks should show the visible score penalty',
);
assert(
  !livestockMissingPlantProd.reasons.some((reason) => reason.includes('Невозможно сыграть')),
  'temporary production-payment locks should not be labelled as permanently impossible',
);

sandbox.TM_CARD_EFFECTS = {
  'Electro Catapult': {c: 14, ep: -1, sp: -1},
};
const electroCatapultLegacyReqPriority = computeReqPriority(
  {
    getAttribute(attr) {
      return attr === 'data-tm-card' ? 'Electro Catapult' : '';
    },
    querySelector() {
      return null;
    },
  },
  {
    game: {
      oxygenLevel: 6,
      temperature: -16,
      oceans: 4,
      venusScaleLevel: 0,
    },
  },
  {
    gen: 5,
    gensLeft: 4,
    prod: {energy: 0, steel: 0, plants: 0, ti: 0, heat: 0},
  },
);
assert.strictEqual(
  electroCatapultLegacyReqPriority.penalty,
  10,
  'legacy computeReqPriority fallback should apply one visible soft penalty for multi production-payment locks',
);
assert(electroCatapultLegacyReqPriority.reasons.includes('Не сейчас: energy prod 0→-1 −10'));
assert(electroCatapultLegacyReqPriority.reasons.includes('Не сейчас: steel prod 0→-1 −10'));
assert(
  !electroCatapultLegacyReqPriority.reasons.some((reason) => reason.includes('Невозможно сыграть')),
  'legacy computeReqPriority fallback should not expose hard impossible text for temporary production locks',
);

sandbox.TM_CARD_EFFECTS = {
  'Fish': {c: 9, vpAcc: 1},
  'Pets': {c: 10, vpAcc: 1},
  'Birds': {c: 10, vpAcc: 1},
  'Small Animals': {c: 6, vpAcc: 1},
};
sandbox.TM_CARD_TAGS = {
  'Fish': ['animal'],
  'Pets': ['animal'],
  'Birds': ['animal'],
  'Small Animals': ['animal'],
};
const animalAttackPenalty = scoreHandSynergy(
  'Fish',
  ['Fish', 'Pets', 'Birds', 'Small Animals'],
  {
    gensLeft: 5,
    gen: 4,
    globalParams: {temp: -6, oxy: 8, oceans: 5, venus: 0},
    tags: {},
    _myCorps: [],
    oppHasAnimalAttack: true,
  },
);
const animalAttackReason = animalAttackPenalty.reasons.find((reason) => reason.includes('opp Pred/Ants')) || '';
assert(animalAttackReason, 'Animal attack context should show the opponent-aware animal penalty');
assertNoUglyFloatReasons(animalAttackPenalty, 'Opponent animal attack penalty');

sandbox.TM_CARD_EFFECTS = {
  'Nitrophilic Moss': {c: 8, pp: 2},
  'Bushes': {c: 10, pp: 2},
  'Moss': {c: 4, pp: 1},
  'Ecological Zone': {c: 12, pp: 1},
};
sandbox.TM_CARD_TAGS = {
  'Nitrophilic Moss': ['plant'],
  'Bushes': ['plant'],
  'Moss': ['plant'],
  'Ecological Zone': ['plant'],
};
const plantAttackPenalty = scoreHandSynergy(
  'Nitrophilic Moss',
  ['Nitrophilic Moss', 'Bushes', 'Moss', 'Ecological Zone'],
  {
    gensLeft: 6,
    gen: 3,
    globalParams: {temp: -18, oxy: 4, oceans: 4, venus: 0},
    tags: {},
    _myCorps: [],
    oppHasPlantAttack: true,
  },
);
const plantAttackReason = plantAttackPenalty.reasons.find((reason) => reason.includes('opp plant atk risky')) || '';
assert(plantAttackReason, 'Plant attack context should show the opponent-aware plant penalty');
assertNoUglyFloatReasons(plantAttackPenalty, 'Opponent plant attack penalty');

sandbox.TM_CARD_EFFECTS = {
  'Protected Habitats': {c: 5},
  'Kelp Farming': {c: 17, pp: 2, pl: 2, vp: 2},
  'Fish': {c: 9, vpAcc: 1, res: 'animal', vpPer: 1},
};
sandbox.TM_CARD_TAGS = {
  'Protected Habitats': ['plant'],
  'Kelp Farming': ['plant'],
  'Fish': ['animal'],
};
sandbox.TM_ANIMAL_VP_CARDS = ['Fish'];
sandbox.TM_MICROBE_VP_CARDS = [];
const protectedHabitatsLivePayoff = scoreHandSynergy(
  'Protected Habitats',
  ['Protected Habitats', 'Kelp Farming', 'Fish'],
  {
    gensLeft: 5,
    gen: 5,
    plants: 7,
    animalTargetCount: 1,
    microbeTargetCount: 0,
    animalAccumRate: 1,
    microbeAccumRate: 0,
    globalParams: {temp: 2, oxy: 10, oceans: 8, venus: 0},
    prod: {plants: 4},
    tags: {plant: 3, animal: 1},
    _myCorps: [],
  },
);
assert(
  protectedHabitatsLivePayoff.bonus >= 8,
  'Protected Habitats should get a stronger live payoff bonus before Kelp/animal realization when plants/resources are already exposed',
);
assert(
  protectedHabitatsLivePayoff.reasons.some((reason) => reason.includes('protect live bio payoff')),
  'Protected Habitats should explain the live plant/animal/microbe protection bonus in tooltip reasons',
);
const protectedHabitatsEmptyHand = scoreHandSynergy(
  'Protected Habitats',
  ['Protected Habitats'],
  {
    gensLeft: 5,
    gen: 5,
    plants: 0,
    animalTargetCount: 0,
    microbeTargetCount: 0,
    animalAccumRate: 0,
    microbeAccumRate: 0,
    globalParams: {temp: 2, oxy: 10, oceans: 8, venus: 0},
    prod: {plants: 0},
    tags: {},
    _myCorps: [],
  },
);
assert.strictEqual(
  protectedHabitatsEmptyHand.bonus,
  0,
  'Protected Habitats should not inflate in empty hands without exposed resources or payoff cards',
);

sandbox.TM_COMBOS = [{
  cards: ['Robotic Workforce', 'Medical Lab'],
  r: 'great',
  v: "'Magnificent.' One of the best combos. Copy Medical Lab production for 15 MC",
}];
sandbox.TM_ANTI_COMBOS = [];
const medicalLabCopyTargetCombo = scoreComboPotential(
  'Medical Lab',
  'increase your m€ production 1 step for every 2 building tags you have.',
  new Set(['Medical Lab', 'Robotic Workforce']),
  {gensLeft: 6, globalParams: {}, _myCorps: []},
);
assert.strictEqual(
  medicalLabCopyTargetCombo.bonus,
  0,
  'Medical Lab should not receive a direct combo score because Robotic Workforce could later copy it',
);
assert(
  !medicalLabCopyTargetCombo.reasons.some((reason) => reason.includes('Magnificent')),
  'Medical Lab should not surface the Robotic Workforce copy-target combo as its own scoring reason',
);
const roboticWorkforceCopyProviderCombo = scoreComboPotential(
  'Robotic Workforce',
  'copy the production box of one of your building cards.',
  new Set(['Medical Lab', 'Robotic Workforce']),
  {gensLeft: 6, globalParams: {}, _myCorps: []},
);
assert(
  roboticWorkforceCopyProviderCombo.bonus > 0,
  'Robotic Workforce should still score the Medical Lab copy combo when Robotic Workforce is the card being evaluated',
);

function fusionRequirementResult({tags = {}, tableau = [], handNames = []} = {}) {
  sandbox.TM_CARD_TAG_REQS = {'Fusion Power': {power: 2}};
  sandbox.TM_CARD_GLOBAL_REQS = {};
  sandbox.TM_CARD_EFFECTS = {};
  sandbox.__tm_test_handNames = handNames;
  sandbox.__tm_test_pv = {
    thisPlayer: {
      tableau: tableau.map((entry) => (typeof entry === 'string' ? {name: entry} : entry)),
    },
  };
  const tableauNames = tableau.map((entry) => (typeof entry === 'string' ? entry : entry.name));
  return scoreCardRequirements(
    null,
    {
      tags,
      tableauNames: new Set(tableauNames),
      globalParams: {temperature: -18, oxy: 4, oceans: 3, venus: 0},
      gensLeft: 4,
      gen: 5,
      terraformRate: 1,
      _myCorps: [],
    },
    'Fusion Power',
  );
}

const fusionNoPowerReq = fusionRequirementResult();
assert(
  fusionNoPowerReq.reasons.some((reason) => reason.includes('Нет power')),
  'Fusion Power should normally show a missing Power tag requirement',
);

const fusionXavierReq = fusionRequirementResult({tableau: ['Xavier']});
assert(
  !fusionXavierReq.reasons.some((reason) => reason.includes('Нет power')),
  'Xavier OPG wild tags should cover Fusion Power tag requirement instead of showing Нет power',
);
assert(
  fusionXavierReq.reasons.some((reason) => reason.includes('Xavier wild req')),
  'Fusion Power should explain that Xavier is covering the tag requirement',
);
assert(
  fusionXavierReq.bonus > fusionNoPowerReq.bonus,
  'Xavier-covered Fusion Power should score higher than missing the Power requirement',
);

const fusionSpentXavierReq = fusionRequirementResult({tableau: [{name: 'Xavier', isDisabled: true}]});
assert(
  fusionSpentXavierReq.reasons.some((reason) => reason.includes('Нет power')),
  'Spent Xavier should not cover future Fusion Power requirements',
);

sandbox.TM_CARD_TAG_REQS = {'Luna Governor': {earth: 3}};
sandbox.TM_CARD_GLOBAL_REQS = {};
sandbox.TM_CARD_EFFECTS = {};
sandbox.__tm_test_handNames = [];
sandbox.__tm_test_pv = {
  thisPlayer: {tableau: []},
};
const lunaGovernorVisibleEarthShellReq = scoreCardRequirements(
  null,
  {
    tags: {earth: 0},
    tagsWithHand: {earth: 3},
    _handTagCounts: {earth: 3},
    globalParams: {temp: -30, oxy: 0, oceans: 0, venus: 0},
    gensLeft: 10,
    gen: 1,
    terraformRate: 1,
    _myCorps: [],
    tableauNames: new Set(),
  },
  'Luna Governor',
);
assert(
  !lunaGovernorVisibleEarthShellReq.reasons.some((reason) => reason.includes('Нет earth')),
  'Luna Governor should not say Нет earth when the visible opening hand already contains enough Earth tag setup',
);
assert(
  lunaGovernorVisibleEarthShellReq.reasons.some((reason) => reason.includes('Earth') && reason.includes('рука +3')),
  'Luna Governor should explain that the Earth requirement is setup-gated by visible hand tags',
);

sandbox.TM_CARD_TAG_REQS = {'Venus Governor': {venus: 2}};
sandbox.TM_CARD_GLOBAL_REQS = {};
sandbox.TM_CARD_EFFECTS = {};
sandbox.TM_CARD_TAGS = {
  'Unexpected Application': ['event', 'venus'],
  'Forced Precipitation': ['venus'],
  'Venus Governor': ['venus', 'venus'],
};
sandbox.__tm_test_handNames = ['Unexpected Application', 'Forced Precipitation', 'Venus Governor'];
sandbox.__tm_test_pv = {
  thisPlayer: {tableau: []},
};
const venusGovernorEventVenusReq = scoreCardRequirements(
  null,
  {
    tags: {venus: 1},
    globalParams: {temp: -28, oxy: 0, oceans: 0, venus: 0},
    gensLeft: 8,
    gen: 2,
    terraformRate: 1,
    _myCorps: [],
    tableauNames: new Set(),
  },
  'Venus Governor',
);
assert(
  venusGovernorEventVenusReq.reasons.some((reason) => reason.includes('Venus') && reason.includes('рука +1')),
  'Venus Governor should count only persistent Venus tags in hand as setup for its on-table tag requirement',
);
assert(
  !venusGovernorEventVenusReq.reasons.some((reason) => reason.includes('рука +2')),
  'Venus Governor should not count event Venus tags as future played Venus tags',
);

positionalScoring.strategyThresholds = Object.assign({}, positionalScoring.strategyThresholds || {}, {venus: 3});
positionalScoring.strategyBase = 2;
positionalScoring.strategyCap = 4;
const venusGovernorRouteCtx = {
  gen: 2,
  gensLeft: 8,
  tags: {venus: 1},
  tagsWithHand: {venus: 4},
  tagsWithPersistentHand: {venus: 3},
  _handTagCounts: {venus: 4},
  _persistentHandTagCounts: {venus: 3},
  _handNamesSet: new Set(['Venus Governor', 'Unexpected Application', 'Forced Precipitation']),
  prod: {mc: 4, steel: 0, ti: 0, energy: 0, heat: 0, plants: 0},
  globalParams: {temp: -28, oxy: 0, oceans: 0, venus: 0},
};
const venusGovernorTagSynergy = scoreTagSynergies(
  'Venus Governor',
  new Set(['venus']),
  'green',
  4,
  1,
  'requires 2 venus tags. increase your m€ production 2 steps.',
  {e: 'Requires 2 Venus tags. Increase your M€ production 2 steps.'},
  [],
  venusGovernorRouteCtx,
  null,
);
assert(
  !venusGovernorTagSynergy.reasons.some((reason) => reason.includes('рука venus')),
  'Venus Governor should not receive generic hand Venus affinity from its own tags or event Venus tags',
);
const venusGovernorPositional = scorePositionalFactors(
  new Set(['venus']),
  'green',
  'Venus Governor',
  4,
  1,
  'requires 2 venus tags. increase your m€ production 2 steps.',
  {e: 'Requires 2 Venus tags. Increase your M€ production 2 steps.'},
  venusGovernorRouteCtx,
  74,
  false,
  true,
  false,
);
assert(
  !venusGovernorPositional.reasons.some((reason) => reason.includes('venus стратегия')),
  'Venus Governor should not infer a Venus strategy from its own unplayable tags plus an event tag',
);

sandbox.TM_CARD_TAG_REQS = {'Interstellar Colony Ship': {science: 5}};
sandbox.TM_CARD_GLOBAL_REQS = {};
sandbox.TM_CARD_EFFECTS = {};
sandbox.__tm_test_handNames = [];
sandbox.__tm_test_pv = {
  thisPlayer: {tableau: []},
};
const interstellarThinScienceReq = scoreCardRequirements(
  null,
  {
    tags: {science: 0},
    tagsWithHand: {science: 3},
    _handTagCounts: {science: 3},
    globalParams: {temp: -18, oxy: 9, oceans: 7, venus: 8},
    gensLeft: 4,
    gen: 6,
    terraformRate: 1,
    _myCorps: [],
    tableauNames: new Set(),
  },
  'Interstellar Colony Ship',
);
assert(
  interstellarThinScienceReq.bonus <= -16,
  'Interstellar Colony Ship should be heavily penalized when 5 Science are not on table and the visible route is still short',
);
assert(
  interstellarThinScienceReq.reasons.some((reason) =>
    reason.includes('Нужно 5 science на стол') &&
    reason.includes('есть 0') &&
    reason.includes('рука +3')),
  'Interstellar Colony Ship should explain the played Science requirement instead of hiding it behind a small Нет science penalty',
);

sandbox.TM_CARD_TAG_REQS = {'Warp Drive': {science: 5}};
sandbox.TM_CARD_GLOBAL_REQS = {};
sandbox.TM_CARD_EFFECTS = {};
sandbox.__tm_test_handNames = [];
sandbox.__tm_test_pv = {
  thisPlayer: {tableau: []},
};
const warpDriveOpeningScienceRouteReq = scoreCardRequirements(
  null,
  {
    tags: {science: 0},
    tagsWithHand: {science: 1},
    _handTagCounts: {science: 1},
    globalParams: {temp: -30, oxy: 0, oceans: 0, venus: 0},
    gensLeft: 10,
    gen: 1,
    terraformRate: 1,
    _myCorps: [],
    tableauNames: new Set(),
  },
  'Warp Drive',
);
assert(
  warpDriveOpeningScienceRouteReq.bonus >= -18,
  `Warp Drive opener with visible Science route should stay speculative instead of being hard-greyed, got ${warpDriveOpeningScienceRouteReq.bonus}`,
);

sandbox.TM_CARD_TAG_REQS = {'Mining Quota': {venus: 1, earth: 1, jovian: 1}};
sandbox.TM_CARD_GLOBAL_REQS = {};
sandbox.TM_CARD_EFFECTS = {};
sandbox.__tm_test_handNames = [];
sandbox.__tm_test_pv = {
  thisPlayer: {tableau: []},
};
const miningQuotaMissingJovianReq = scoreCardRequirements(
  null,
  {
    tags: {venus: 1, earth: 1, building: 5},
    globalParams: {temp: -30, oxy: 0, oceans: 0, venus: 0},
    gensLeft: 10,
    gen: 1,
    terraformRate: 1,
    _myCorps: [],
    tableauNames: new Set(),
  },
  'Mining Quota',
);
assert(
  miningQuotaMissingJovianReq.bonus <= -8,
  `Mining Quota without a Jovian route should not stay A-tier from steel synergy alone, got ${miningQuotaMissingJovianReq.bonus}`,
);

sandbox.cardBuildsColonyByName = function cardBuildsColonyByName(name) {
  return name === 'Interplanetary Colony Ship';
};
const pioneerColonyMilestoneBonus = scoreMapMA(
  {e: 'Place a colony.'},
  new Set(['event', 'space', 'earth']),
  12,
  {
    milestones: new Set(['Pioneer']),
    awards: new Set(),
    tags: {space: 1, earth: 1},
  },
  sandbox.SC,
  'Interplanetary Colony Ship',
);
assert(
  pioneerColonyMilestoneBonus.reasons.some((reason) => reason.includes('Pioneer')),
  'Colony-placement cards should show Pioneer milestone value when Pioneer is active',
);

sandbox.TAG_TO_MA.plant = [{name: 'Ecologist', type: 'milestone', target: 4, bio: true}];
const tundraClaimedEcologistProximity = scoreMilestoneAwardProximity(
  new Set(['plant']),
  'green',
  'increase your plant production 1 step',
  {e: 'Increase your plant production 1 step.'},
  {
    milestoneNeeds: {plant: 2},
    milestoneSpecial: {},
    claimedMilestones: new Set(['ecologist']),
    milestoneClaimedCount: 1,
    awardTags: {},
    awardRacing: {},
    tags: {plant: 2},
  },
  'Tundra Farming',
);
assert.strictEqual(
  tundraClaimedEcologistProximity.bonus,
  0,
  'Tundra Farming should not get plant-tag milestone proximity after Ecologist is claimed',
);
assert(
  !tundraClaimedEcologistProximity.reasons.some((reason) => reason.includes('Ecologist')),
  'claimed Ecologist should not appear in Tundra Farming play reasons',
);

sandbox.TM_CARD_EFFECTS = {
  'Kaguya Tech': {c: 10, mp: 2, cd: 1},
};
const kaguyaPlayableCtx = {
  gensLeft: 3,
  gen: 7,
  greeneries: 2,
  plants: 7,
  tableauNames: new Set(['Lakefront Resorts']),
  globalParams: {temp: -14, oxy: 6, oceans: 7, venus: 6},
};
const kaguyaBreakEven = scoreBreakEvenTiming(
  'Kaguya Tech',
  kaguyaPlayableCtx,
  new Set(['city', 'plant']),
);
assert(
  kaguyaBreakEven.penalty <= 3,
  `Kaguya Tech should not get a full pure-production break-even penalty when own greenery can be converted, got ${kaguyaBreakEven.penalty}`,
);
const kaguyaTiming = scoreFTNTiming(
  'Kaguya Tech',
  kaguyaPlayableCtx,
  {},
);
assert(
  kaguyaTiming.bonus >= -6,
  `Kaguya Tech should cap production timing penalty when greenery->city conversion is live, got ${kaguyaTiming.bonus}`,
);

sandbox.TM_CARD_EFFECTS = {
  'Gyropolis': {c: 20, mp: 0, ep: -2, city: 1},
};
const gyropolisFastRushTiming = scoreFTNTiming(
  'Gyropolis',
  {
    gensLeft: 4,
    gen: 6,
    prod: {energy: 3},
    globalParams: {temp: -18, oxy: 12, oceans: 7, venus: 8},
  },
  {},
);
assert(
  !gyropolisFastRushTiming.reasons.some((reason) => reason.includes('Тайминг +15')),
  'Gyropolis should not receive the full positive timing cap just because the energy-production loss is deferred in a fast rush',
);
assert(
  gyropolisFastRushTiming.bonus <= 4,
  `Gyropolis timing relief should be capped for a late energy-sac city, got ${gyropolisFastRushTiming.bonus}`,
);

sandbox.TM_CARD_EFFECTS = {
  'Space Port Colony': {c: 27, colony: {allowDuplicates: true}, tradeFleet: 1},
};
const spacePortColonyRushEconomy = scoreCardEconomyInContext(
  new Set(['space']),
  'green',
  'Space Port Colony',
  27,
  1,
  'requires 1 colony. build a colony and gain 1 trade fleet. 1 vp per 2 colonies.',
  {e: 'requires 1 colony. build a colony and gain 1 trade fleet. 1 vp per 2 colonies.'},
  {
    gensLeft: 4,
    gen: 6,
    terraformRate: 4,
    tags: {},
    awardTags: {},
    milestoneNeeds: {},
    tagTriggers: [],
    coloniesOwned: 1,
    prod: {},
    mc: 29,
    globalParams: {temp: -18, oxy: 12, oceans: 7, venus: 8},
  },
  false,
);
assert(
  spacePortColonyRushEconomy.bonus <= -8,
  `Late Space Port Colony should be penalized as an expensive colony engine in a rush, got ${spacePortColonyRushEconomy.bonus}`,
);
assert(
  spacePortColonyRushEconomy.reasons.some((reason) => reason.includes('Быстр. colony engine')),
  'Late Space Port Colony should explain the rush penalty as colony-engine timing',
);

const spacePortColonyFastRate = scoreTerraformRate(
  {terraformRate: 4, gen: 6, gensLeft: 4},
  'requires 1 colony. build a colony and gain 1 trade fleet. 1 vp per 2 colonies.',
  {e: 'requires 1 colony. build a colony and gain 1 trade fleet. 1 vp per 2 colonies.'},
);
assert(
  !spacePortColonyFastRate.reasons.some((reason) => reason.includes('VP timing')),
  'Conditional colony VP text should not receive the generic fast-game VP burst bonus',
);

const duplicateTharsisTriggers = scoreDiscountsAndPayments(
  new Set(['city']),
  null,
  'green',
  {
    discounts: {},
    steel: 0,
    titanium: 0,
    steelVal: 2,
    tiVal: 3,
    tagTriggers: [
      {tags: ['city'], value: 4, desc: 'Tharsis → +1 MC-прод'},
      {tags: ['city'], value: 4, desc: 'Tharsis → +1 MC-прод'},
    ],
  },
  1,
);
assert.strictEqual(
  duplicateTharsisTriggers.bonus,
  4,
  'Duplicate Tharsis city triggers should not score the same city-trigger twice',
);
assert(
  duplicateTharsisTriggers.reasons.length === 1 &&
    (duplicateTharsisTriggers.reasons[0].match(/Tharsis → \+1 MC-прод/g) || []).length === 1,
  'Duplicate Tharsis city triggers should be displayed once',
);

const discountedTitaniumPayment = scoreDiscountsAndPayments(
  new Set(['space']),
  10,
  'green',
  {
    discounts: {space: 4},
    steel: 0,
    titanium: 6,
    steelVal: 2,
    tiVal: 4,
    tagTriggers: [],
  },
  1,
);
assert(
  discountedTitaniumPayment.reasons.some((reason) => reason.includes('Скидка −4 MC')),
  'space discount should still be visible',
);
assert(
  discountedTitaniumPayment.reasons.some((reason) => reason.includes('Титан −6 MC')),
  'titanium payment should be capped to the post-discount remaining cost, not the printed card cost',
);
assert(
  !discountedTitaniumPayment.reasons.some((reason) => reason.includes('Титан −10 MC')),
  'discounted space cards should not double-count discount and full printed-cost titanium payment',
);

sandbox.TM_CARD_EFFECTS = {
  'Asteroid Mining': {c: 30, tp: 2, vp: 2},
  'Rover Construction': {c: 12, vp: 1},
  'Mangrove': {c: 12, grn: 1, vp: 1, minG: 4},
  'Topsoil Contract': {c: 8, pl: 3},
  'Unexpected Application': {c: 4, vn: 1},
  'Psychrophiles': {c: 2, res: 'microbe'},
  'Research': {c: 11, cd: 2, vp: 1},
  'Luna Governor': {c: 4, mp: 2},
  'Cartel': {c: 8, mp: 2},
  'Cloud Seeding': {c: 11, pp: 2, mp: -1, pOpp: 1},
  'Planetary Alliance': {c: 0, tr: 2},
  'Space Lanes': {c: 0, ti: 3, mc: 9},
};
sandbox.TM_CARD_TAGS = {
  'Asteroid Mining': ['jovian', 'space'],
  'Rover Construction': ['building'],
  'Mangrove': ['plant'],
  'Topsoil Contract': ['earth', 'microbe'],
  'Unexpected Application': ['event', 'venus'],
  'Psychrophiles': ['microbe'],
  'Research': ['science', 'science'],
  'Luna Governor': ['earth', 'earth'],
  'Cartel': ['earth'],
  'Planetary Alliance': ['earth', 'jovian', 'venus'],
  'Space Lanes': ['space'],
};
sandbox.TM_CARD_GLOBAL_REQS = {'Mangrove': {temperature: {min: 4}}};
sandbox.TM_CARD_TAG_REQS = {'Luna Governor': {earth: 3}};

const currentOpeningHand = [
  'Asteroid Mining',
  'Rover Construction',
  'Mangrove',
  'Topsoil Contract',
  'Unexpected Application',
  'Psychrophiles',
  'Research',
  'Luna Governor',
  'Cartel',
  'Cloud Seeding',
  'Planetary Alliance',
  'Space Lanes',
];
const openingCtx = {
  _openingHand: true,
  gen: 1,
  gensLeft: 10,
  globalParams: {temp: -30, oxy: 0, oceans: 0, venus: 0},
  tags: {earth: 0, jovian: 0, venus: 0, science: 0, space: 0, microbe: 0, plant: 0, building: 0, wild: 0},
  tagsWithHand: {earth: 5, jovian: 2, venus: 2, science: 2, space: 2, microbe: 2, plant: 1, building: 1},
  _handTagCounts: {earth: 5, jovian: 2, venus: 2, science: 2, space: 2, microbe: 2, plant: 1, building: 1},
  titanium: 0,
  steel: 0,
  tiVal: 3,
  steelVal: 2,
  prod: {mc: 0, ti: 0, steel: 0, energy: 0, plants: 0, heat: 0},
  discounts: {},
  _myCorps: [],
};
function openingPolicyFor(cardName, eLower) {
  const tags = new Set(sandbox.TM_CARD_TAGS[cardName] || []);
  const fx = sandbox.TM_CARD_EFFECTS[cardName] || {};
  const type = tags.has('event') ? 'red' : 'green';
  return scoreOpeningDraftPolicy(
    cardName,
    tags,
    type,
    fx.c,
    eLower || '',
    {e: eLower || ''},
    openingCtx,
    currentOpeningHand,
  );
}
function hasCalibratedOpeningReason(result, label) {
  return result.reasons.some((reason) => reason.includes(label) && /~\d+ MC/.test(reason));
}

const researchOpeningPolicy = openingPolicyFor('Research', 'draw 2 cards. 1 vp.');
const cartelOpeningPolicy = openingPolicyFor('Cartel', 'increase your m€ production 1 step for every earth tag you have.');
const lunaGovernorOpeningPolicy = openingPolicyFor('Luna Governor', 'requires 3 earth tags. increase your m€ production 2 steps.');
const topsoilOpeningPolicy = openingPolicyFor('Topsoil Contract', 'gain 3 plants.');
const mangroveOpeningPolicy = openingPolicyFor('Mangrove', 'temperature must be +4 c or warmer. place a greenery on an ocean reserved area.');
const asteroidOpeningPolicy = openingPolicyFor('Asteroid Mining', 'increase your titanium production 2 steps. 2 vp.');
const cloudSeedingOpeningPolicy = openingPolicyFor('Cloud Seeding', 'decrease your m€ production 1 step. increase your plant production 2 steps.');
const mangroveLateOpeningReason = mangroveOpeningPolicy.reasons.find((reason) => reason.includes('Opening late payoff')) || '';
const mangroveBaseOpeningDelay = estimateOpeningRequirementDelayProfile('temperature', 17, Object.assign({}, openingCtx, {
  _gameOptions: {preludeExtension: true, coloniesExtension: false, solarPhaseOption: false},
  _playerCount: 3,
}));
const mangroveIoOpeningDelay = estimateOpeningRequirementDelayProfile('temperature', 17, Object.assign({}, openingCtx, {
  _gameOptions: {preludeExtension: true, coloniesExtension: true, solarPhaseOption: false},
  _playerCount: 3,
  colonyWorldCount: 5,
  visibleColonies: ['Io'],
}));

assert(
  researchOpeningPolicy.bonus >= 2 &&
    hasCalibratedOpeningReason(researchOpeningPolicy, 'Opening anchor'),
  'Research should be treated as a calibrated opening anchor because early draw stabilizes the route',
);
assert(
  cartelOpeningPolicy.bonus >= 2 &&
    hasCalibratedOpeningReason(cartelOpeningPolicy, 'Opening anchor'),
  'Cartel should be treated as a calibrated opening anchor when Earth density is visible',
);
assert(
  topsoilOpeningPolicy.bonus >= 1 &&
    hasCalibratedOpeningReason(topsoilOpeningPolicy, 'Opening setup'),
  'Topsoil Contract should be treated as calibrated cheap setup in the current opening route',
);
assert(
  lunaGovernorOpeningPolicy.bonus >= 0 &&
    hasCalibratedOpeningReason(lunaGovernorOpeningPolicy, 'Opening setup') &&
    !lunaGovernorOpeningPolicy.reasons.some((reason) => reason.includes('Opening anchor')) &&
    !lunaGovernorOpeningPolicy.reasons.some((reason) => reason.includes('Opening late payoff')),
  'Luna Governor should stay a calibrated setup-gated payoff, not an opening anchor, when the visible hand has enough Earth route',
);
assert(
  mangroveOpeningPolicy.bonus <= -10 &&
    hasCalibratedOpeningReason(mangroveOpeningPolicy, 'Opening late payoff'),
  'Mangrove at -30C should be capped by calibrated opening policy as a late payoff, not ranked as an opening anchor',
);
assert(
  /Opening late payoff temperature -1[0-2]/.test(mangroveLateOpeningReason),
  'Mangrove opening late-payoff penalty should be harsher than plain MC/2 when playable only near the expected end',
);
assert(
  /~gen \d+/.test(mangroveLateOpeningReason),
  'Mangrove opening late-payoff penalty should be calibrated from expected playable generation, not raw temperature steps',
);
assert.strictEqual(
  mangroveBaseOpeningDelay.playableGen,
  10,
  'Mangrove at -30C in 3P no-WGT should use avg 10-generation game as the baseline playable-generation estimate',
);
assert(
  mangroveIoOpeningDelay.playableGen < mangroveBaseOpeningDelay.playableGen,
  'Io colony should shift temperature-gated opening cards earlier than the baseline timing model',
);
assert(
  asteroidOpeningPolicy.bonus <= -5 &&
    hasCalibratedOpeningReason(asteroidOpeningPolicy, 'Opening expensive payoff'),
  'Asteroid Mining should be penalized by calibrated opening policy as an expensive payoff that competes with early economy/draw',
);
assert(
  cloudSeedingOpeningPolicy.bonus <= -4 &&
    hasCalibratedOpeningReason(cloudSeedingOpeningPolicy, 'Opening weak economy'),
  'Cloud Seeding should be penalized as calibrated weak opening economy because it cuts MC production',
);

sandbox.TM_CARD_GLOBAL_REQS = {'Mangrove': {temperature: {min: 4}}};
sandbox.TM_CARD_TAG_REQS = {};
sandbox.TM_CARD_EFFECTS = {};
sandbox.__tm_test_handNames = [];
sandbox.__tm_test_pv = {
  game: {
    gameOptions: {solarPhaseOption: false},
    players: [{}, {}, {}, {}],
  },
  thisPlayer: {tableau: []},
};
const mangroveOpenerFarTemperatureReq = scoreCardRequirements(
  null,
  {
    gen: 1,
    gensLeft: 10,
    globalParams: {temp: -30, oxy: 0, oceans: 0, venus: 0},
    tags: {},
    tagsWithHand: {},
    tagsProjected: {},
    tableauNames: new Set(),
  },
  'Mangrove'
);
assert(
  mangroveOpenerFarTemperatureReq.bonus <= -12 &&
    mangroveOpenerFarTemperatureReq.reasons.some((reason) => reason.includes('Req далеко temperature')),
  'Mangrove at -30C should keep a hard far-temperature penalty because +4C is 17 temp steps away'
);
sandbox.__tm_test_pv = null;

function corpBoost(corpName, opts) {
  return getCorpBoost(corpName, Object.assign({
    cardName: 'Test Card',
    eLower: '',
    cardTags: new Set(),
    cardCost: 0,
    cardType: 'green',
    ctx: {},
    globalParams: {},
  }, opts));
}

assert.strictEqual(
  corpBoost('Arklight', {
    cardName: 'Big Asteroid',
    eLower: 'raise temperature 2 steps and gain 4 titanium. remove up to 4 plants from any player.',
    cardTags: new Set(['space']),
  }),
  0,
  'Arklight should not boost cards that only remove plants in the text'
);

assert.strictEqual(
  corpBoost('Robinson Industries', {
    cardName: 'Metals Company',
    eLower: 'increase your m€, steel and titanium production 1 step.',
    cardTags: new Set(['building']),
  }),
  0,
  'Robinson should not get a generic bonus for any production text'
);

assert.strictEqual(
  corpBoost('Robinson Industries', {
    cardName: 'Suitable Infrastructure',
    eLower: 'increase your production and trigger refund',
    cardTags: new Set(['building']),
  }),
  3,
  'Robinson should keep the explicit Suitable Infrastructure bonus'
);

sandbox.TM_CARD_EFFECTS['Prefabrication of Human Habitats'] = {c: 8, disc: {amount: 2, tag: 'city'}};
const prefabCityDiscountText = 'cards with a city tag cost 2 m€ less. the city standard project costs 2 m€ less.';
for (const corpName of ['Tharsis Republic', 'Arcadian Communities', 'Philares', 'Gagarin Mobile Base']) {
  assert.strictEqual(
    corpBoost(corpName, {
      cardName: 'Prefabrication of Human Habitats',
      eLower: prefabCityDiscountText,
      cardTags: new Set(['building', 'city']),
    }),
    0,
    `${corpName} should not treat Prefabrication as placing a city/tile`,
  );
}

assert.strictEqual(
  isVpAccumulatorActionFx({vpAcc: 1, triggerOnlyVpAcc: true}),
  false,
  'trigger-only VP/resource engines should not be treated as action VP engines'
);
assert.strictEqual(
  isBlueActionFx({vpAcc: 1, triggerOnlyVpAcc: true}),
  false,
  'trigger-only VP/resource engines should not count as blue actions'
);
assert.strictEqual(
  isVpAccumulatorActionFx({vpAcc: 1}),
  true,
  'real action VP/resource engines should still count as action VP engines'
);
assert.strictEqual(
  isBlueActionFx({actCD: 1}),
  true,
  'non-resource blue actions should keep action detection'
);
assert.strictEqual(
  getVpAccumulatorProjectedResources({vpAcc: 1, triggerOnlyVpAcc: true}, 5),
  0,
  'trigger-only VP/resource engines should not get guaranteed per-generation resources'
);
assert.strictEqual(
  getVpAccumulatorProjectedResources({vpAcc: 1}, 5),
  5,
  'real action VP/resource engines should keep per-generation projection'
);
assert.strictEqual(
  computeCardValue({vpAcc: 1, vpPer: 2, triggerOnlyVpAcc: true}, 5),
  0,
  'trigger-only VP/resource engines should not get fake recurring compute value'
);
assert(
  computeCardValue({vpAcc: 1, vpPer: 2}, 5) > 0,
  'real VP/resource action cards should keep recurring value in computeCardValue'
);
const ganymedeCityOnlyValue = computeCardValue(
  {city: 1},
  1,
  {ctx: {tags: {jovian: 6, wild: 0}}, effectTags: ['city', 'jovian', 'space']}
);
const ganymedeVpTagValue = computeCardValue(
  {city: 1, vpTag: {tag: 'jovian', per: 1}},
  1,
  {ctx: {tags: {jovian: 6, wild: 0}}, effectTags: ['city', 'jovian', 'space']}
);
assert(
  Math.abs((ganymedeVpTagValue - ganymedeCityOnlyValue) - 52.5) < 0.001,
  'Ganymede Colony-style vpTag cards should include current + self Jovian VP in ROI value'
);

const prevVpMultipliers = sandbox.TM_VP_MULTIPLIERS;
sandbox.TM_VP_MULTIPLIERS = {
  Satellites: {vpPer: 'space', rate: 1, selfTags: ['space']},
};
sandbox.TM_CARD_EFFECTS['Satellites'] = {c: 10};
positionalScoring.vpMultBaseline = 5;
positionalScoring.vpMultScale = 2.5;
positionalScoring.vpMultCap = 12;
const satellitesEconomyWithBadVpData = scoreCardEconomyInContext(
  new Set(['space']),
  'green',
  'Satellites',
  10,
  1,
  '13 mc total for x mc-prod, 1 per space tag including this',
  {e: '13 mc total for x mc-prod, 1 per space tag including this'},
  {
    gensLeft: 2,
    gen: 7,
    tags: {space: 8, wild: 0},
    tagsProjected: {space: 9},
    prod: {ti: 0, steel: 0, mc: 0, plants: 0, energy: 0, heat: 0},
    tableauNames: new Set(['Space Station']),
  },
  false,
);
assert(
  !satellitesEconomyWithBadVpData.reasons.some((reason) => reason.includes('VP×space')),
  'Satellites should not get fake VP×space projection from bad multiplier data because it is production, not VP',
);
sandbox.TM_VP_MULTIPLIERS = prevVpMultipliers;

const richLateSatellitesEconomy = scoreCardEconomyInContext(
  new Set(['space']),
  'green',
  'Satellites',
  10,
  1,
  'increase your m€ production 1 step for each space tag you have, including this one.',
  {e: 'Increase your M€ production 1 step for each space tag you have, including this one.'},
  {
    gensLeft: 2,
    gen: 8,
    mc: 80,
    tags: {space: 7, wild: 0},
    tagsProjected: {space: 8},
    prod: {ti: 4, steel: 2, mc: 48, plants: 0, energy: 3, heat: 0},
    awardTags: {},
    milestoneNeeds: {},
    tagTriggers: [],
    activeMA: [],
    tableauNames: new Set(['Warp Drive', 'Advanced Alloys']),
  },
  false,
);
assert(
  richLateSatellitesEconomy.reasons.some((reason) => reason.includes('Прод. избыток −7')),
  'Satellites should be damped when late rich players already have massive MC production and no VP conversion',
);

const cloudTourismPairProduction = scoreCardEconomyInContext(
  new Set(['jovian', 'venus']),
  'blue',
  'Cloud Tourism',
  11,
  1,
  'increase your m€ production 1 step for each pair of earth and venus tags you own. 1 vp for every 3rd floater on this card.',
  {e: 'Increase your M€ production 1 step for each pair of Earth and Venus tags you own. 1 VP for every 3rd floater on this card.'},
  {
    gensLeft: 2,
    gen: 8,
    tags: {earth: 7, venus: 1, wild: 0},
    tagsProjected: {earth: 7, venus: 2},
    prod: {ti: 0, steel: 0, mc: 0, plants: 0, energy: 0, heat: 0},
    awardTags: {},
    milestoneNeeds: {},
    tagTriggers: [],
    activeMA: [],
    tableauNames: new Set(['Saturn Systems']),
  },
  false,
);
assert(
  cloudTourismPairProduction.reasons.some((reason) => reason.includes('2× прод +2')),
  'Cloud Tourism should score its own Earth/Venus pair MC-production in context',
);

sandbox.TM_CARD_EFFECTS['Real City Project'] = {c: 18, city: 1};
assert.strictEqual(
  corpBoost('Tharsis Republic', {
    cardName: 'Real City Project',
    eLower: 'place a city tile.',
    cardTags: new Set(['city', 'building']),
  }),
  3,
  'Tharsis should still boost cards that actually place a city tile'
);

sandbox.TM_RATINGS['Colonial Representation'] = {
  e: '13 MC for a one-time colony rebate',
  w: '',
  dr: 'У вас +1 влияние. Получите 3 M€ за каждую вашу колонию.',
};
assert.strictEqual(
  describeCorpBoostReason('Septem Tribus', 'Colonial Representation', 2),
  'Septem Tribus: influence +2',
  'Septem Tribus reason should identify influence, not print an opaque corp bonus',
);

sandbox.TM_CARD_EFFECTS['Corona Extractor'] = {c: 10, ep: 4};
const coronaText = '10+3=13 MC for 4 energy-prod';
const lateCoronaCtx = {
  gen: 9,
  gensLeft: 1,
  tags: {},
  tagsWithHand: {power: 7, space: 2},
  _handTagCounts: {power: 7},
  tableauNames: new Set(),
  awardTags: {},
  milestoneNeeds: {},
  tagTriggers: [],
  prod: {energy: 7, steel: 0, ti: 2, plants: 0, heat: 0, mc: 0},
  steel: 0,
  titanium: 0,
  hasEnergyConsumers: false,
};

assert.strictEqual(
  corpBoost('Factorum', {
    cardName: 'Corona Extractor',
    eLower: coronaText,
    cardTags: new Set(['power', 'space']),
    ctx: lateCoronaCtx,
  }),
  0,
  'Factorum should not boost last-gen pure energy-production cards',
);

assert.strictEqual(
  corpBoost('Factorum', {
    cardName: 'Corona Extractor',
    eLower: coronaText,
    cardTags: new Set(['power', 'space']),
    ctx: Object.assign({}, lateCoronaCtx, {gensLeft: 4}),
  }),
  1,
  'Factorum should keep its normal energy-production affinity before the final generation',
);

const coronaTagSynergy = scoreTagSynergies(
  'Corona Extractor',
  new Set(['power', 'space']),
  'green',
  10,
  0.2,
  coronaText,
  {e: coronaText},
  [],
  lateCoronaCtx,
  null,
);
assert(
  !coronaTagSynergy.reasons.some((reason) => reason.includes('power тегов')),
  'last-gen pure production should not receive generic power-tag density',
);

const coronaResourceSynergy = scoreResourceSynergies(
  coronaText,
  {e: coronaText},
  new Set(['power', 'space']),
  lateCoronaCtx,
  'Corona Extractor',
);
assert(
  !coronaResourceSynergy.reasons.some((reason) => reason.startsWith('Энерг:')),
  'energy-prod text should not be treated as an energy-spending consumer',
);
assert(
  !coronaResourceSynergy.reasons.some((reason) => reason.includes('Энерг. сток')),
  'energy-prod text should not receive the energy-sink bonus',
);

const coronaEconomy = scoreCardEconomyInContext(
  new Set(['power', 'space']),
  'green',
  'Corona Extractor',
  10,
  0.2,
  coronaText,
  {e: coronaText},
  lateCoronaCtx,
  false,
);
assert(
  !coronaEconomy.reasons.some((reason) => reason.includes('Ti.прод')),
  'final-gen scoring should not add titanium-production synergy to space cards',
);

const coronaPosition = scorePositionalFactors(
  new Set(['power', 'space']),
  'green',
  'Corona Extractor',
  10,
  0.2,
  coronaText,
  {e: coronaText},
  Object.assign({}, lateCoronaCtx, {boardFullness: 0, emptySpaces: 20, globalParams: {}}),
  65,
  true,
  false,
  false,
);
const coronaNoTiRow = coronaPosition.reasonRows.find((row) => row.text === '0 Ti −2');
assert(coronaNoTiRow, '0 Ti penalty should be emitted as a structured reason row');
assert.strictEqual(coronaNoTiRow.tone, 'negative', '0 Ti penalty should render in the negative reason group');

const influenceOnlyTurmoil = scoreTurmoilSynergy(
  'you have +1 influence. gain 3 m€ per colony you have.',
  {e: '13 MC for permanent +1 influence'},
  new Set(),
  {turmoilActive: true, myDelegates: 0},
);
assert(influenceOnlyTurmoil.reasons.includes('Влияние +2 (0 дел.)'), 'influence-only cards should be labeled as influence');
assert(!influenceOnlyTurmoil.reasons.some((reason) => reason.startsWith('Делегаты')), 'influence-only cards should not be labeled as delegates');

sandbox.TM_CARD_EFFECTS['Lunar Exports'] = { c: 19, mp: 5 };
assert.strictEqual(
  isPlantEngineCardByFx('Lunar Exports', 'increase your plant production 2 steps, or your m€ production 5 steps.'),
  false,
  'Lunar Exports should not be treated as a plant engine card when FX data encodes the MC-production mode'
);

sandbox.TM_CARD_EFFECTS['Imported Nutrients'] = { c: 14, pl: 4, places: 'microbe', placesN: 4 };
assert.strictEqual(
  isPlantEngineCardByFx('Imported Nutrients', 'gain 4 plants and add 4 microbes to another card.'),
  true,
  'real plant cards should keep the plant engine classification'
);

sandbox.TM_CARD_EFFECTS['Soil Studies'] = {c: 13};
sandbox.TM_CARD_TAGS['Soil Studies'] = ['event', 'microbe', 'plant'];
const soilStudiesTags = new Set(['event', 'microbe', 'plant']);
const soilStudiesText = 'requires that temperature is -4 c or lower. gain 1 plant per venus tag, plant tag, and colony you have.';
const soilStudiesBaseCtx = {
  gensLeft: 1,
  plants: 0,
  tags: {venus: 1, plant: 1},
  coloniesOwned: 2,
  colonies: 2,
  prod: {plants: 0, heat: 0},
  globalParams: {oxy: 10, temp: -4, oceans: 8},
  microbeAccumRate: 0,
  floaterAccumRate: 0,
  animalAccumRate: 0,
  microbeTargetCount: 0,
  animalTargetCount: 0,
  floaterTargetCount: 0,
  tableauNames: new Set(),
};
assert.strictEqual(
  estimateImmediatePlantGainForFinal('Soil Studies', soilStudiesTags, soilStudiesBaseCtx),
  5,
  'Soil Studies final-gen plant estimate should count Venus tags, plant tags, colonies, and its own plant tag'
);
assert.strictEqual(
  isFinalGreenerySource('Soil Studies', soilStudiesText, soilStudiesTags, soilStudiesBaseCtx),
  false,
  'Soil Studies should not be a final-greenery source when its plant burst still leaves fewer than 8 plants'
);
const soilStudiesNoGreenery = scorePostContextChecks(
  'Soil Studies',
  null,
  soilStudiesText,
  {e: 'Gain 1 plant per Venus tag, plant tag, and colony you have.'},
  soilStudiesTags,
  soilStudiesBaseCtx,
  null,
  []
);
assert(
  !soilStudiesNoGreenery.reasons.some((reason) => reason.includes('Финал: озелен')),
  'Soil Studies with a 5-plant burst and no plant stock should not receive the final O2 conversion bonus'
);

sandbox.TM_CARD_EFFECTS['Immigrant City'] = {c: 13, city: 1, ep: -1, mp: -2};
const immigrantCityWithGordon = scorePostContextChecks(
  'Immigrant City',
  null,
  'decrease your energy production 1 step and decrease your m€ production 2 steps. place a city tile.',
  {e: 'Decrease your energy production 1 step and decrease your M€ production 2 steps. Place a city tile.'},
  new Set(['building', 'city']),
  {
    gensLeft: 1,
    prod: {plants: 0, heat: 0},
    globalParams: {oxy: 14, temp: 8, oceans: 9},
    tableauNames: new Set(['Gordon']),
  },
  null,
  []
);
assert(
  immigrantCityWithGordon.reasons.some((reason) => reason.includes('Gordon city +2')),
  'Immigrant City should score Gordon CEO city placement cashback'
);
assert(
  !immigrantCityWithGordon.reasons.some((reason) => reason.includes('Мало озелен')),
  'Gordon should suppress the generic no-greenery city-placement penalty'
);

const soilStudiesCanGreenery = scorePostContextChecks(
  'Soil Studies',
  null,
  soilStudiesText,
  {e: 'Gain 1 plant per Venus tag, plant tag, and colony you have.'},
  soilStudiesTags,
  Object.assign({}, soilStudiesBaseCtx, {plants: 3}),
  null,
  []
);
assert(
  soilStudiesCanGreenery.reasons.some((reason) => reason.includes('Финал: озелен. +O₂ +3')),
  'Soil Studies should keep the final O2 conversion bonus when current plants plus the burst reach a greenery'
);

sandbox.TM_CARD_TAGS['Strip Mine'] = ['building'];
sandbox.TM_CARD_TAGS['Imported Nitrogen'] = ['space', 'event'];
assert.strictEqual(
  isMeltworksLastGenCashout('Meltworks', ['Meltworks', 'Strip Mine'], {
    gensLeft: 1,
    globalParams: { temp: positionalScoring.tempMax || 8 },
    tableauNames: new Set(),
  }),
  true,
  'Meltworks should count as a last-gen cashout when temperature is maxed and a building target exists in hand'
);
assert.strictEqual(
  isMeltworksLastGenCashout('Meltworks', ['Meltworks', 'Imported Nitrogen'], {
    gensLeft: 1,
    globalParams: { temp: positionalScoring.tempMax || 8 },
    tableauNames: new Set(),
  }),
  false,
  'Meltworks should not count as a cashout without a same-gen steel sink'
);

sandbox.TM_CARD_EFFECTS['Equatorial Magnetizer'] = { c: 11, actTR: 1, act_ep: -1 };
const equatorialFinalCashout = scoreFTNTiming('Equatorial Magnetizer', {
  gensLeft: 1,
  prod: {energy: 2},
  globalParams: { oxy: 14, temp: 8, oceans: 9 },
}, {});
assert.strictEqual(
  equatorialFinalCashout.bonus,
  0,
  'Equatorial Magnetizer should not take a late action timing penalty when surplus energy production can be cashed out for final-gen TR'
);
assert(
  !equatorialFinalCashout.reasons.some((reason) => reason.includes('Тайминг -15')),
  'Equatorial Magnetizer final-gen cashout should not show the hard timing penalty'
);

const equatorialNoEnergy = scoreFTNTiming('Equatorial Magnetizer', {
  gensLeft: 1,
  prod: {energy: 0},
  globalParams: { oxy: 14, temp: 8, oceans: 9 },
}, {});
assert(
  equatorialNoEnergy.reasons.some((reason) => reason.includes('Тайминг -15')),
  'Equatorial Magnetizer should keep the normal timing penalty when the energy-production action cannot be paid'
);

sandbox.TM_CARD_EFFECTS['Moss'] = {c: 4, pp: 1, minG: 2};
sandbox.TM_CARD_TAGS['Moss'] = ['plant'];
const mossNoEcoZoneTiming = scoreFTNTiming('Moss', {
  gensLeft: 1,
  prod: {},
  tableauNames: new Set(),
  globalParams: { oxy: 12, temp: 0, oceans: 9 },
}, {});
assert(
  mossNoEcoZoneTiming.reasons.some((reason) => reason.includes('Прод. тайминг -15')),
  'Moss should keep the normal final-gen production timing penalty without a live Ecological Zone trigger'
);

const mossEcoZoneTiming = scoreFTNTiming('Moss', {
  gensLeft: 1,
  prod: {},
  tableauNames: new Set(['Ecological Zone']),
  globalParams: { oxy: 12, temp: 0, oceans: 9 },
}, {});
assert(
  mossEcoZoneTiming.reasons.some((reason) => reason.includes('Прод. тайминг -4')),
  'Moss with Ecological Zone should cap the hard final-gen production timing penalty'
);

const mossNoEcoZoneBreakEven = scoreBreakEvenTiming(
  'Moss',
  {gensLeft: 1, tableauNames: new Set(['Other Card']), steel: 0, titanium: 0},
  new Set(['plant'])
);
assert.strictEqual(
  mossNoEcoZoneBreakEven.penalty,
  9,
  'Moss should keep the normal break-even penalty without Ecological Zone'
);

const mossEcoZoneBreakEven = scoreBreakEvenTiming(
  'Moss',
  {gensLeft: 1, tableauNames: new Set(['Ecological Zone']), steel: 0, titanium: 0},
  new Set(['plant'])
);
assert.strictEqual(
  mossEcoZoneBreakEven.penalty,
  0,
  'Moss with Ecological Zone should not be treated as pure delayed payback in the final generation'
);

sandbox.TM_CARD_EFFECTS['Early Expedition'] = {c: 15, ep: -1, mp: 3, city: 1};
const earlyExpeditionBreakEven = scoreBreakEvenTiming(
  'Early Expedition',
  {gensLeft: 14, tableauNames: new Set(['Manutech']), steel: 0, titanium: 0},
  new Set(['city', 'science', 'space'])
);
assert.strictEqual(
  earlyExpeditionBreakEven.penalty,
  0,
  'Early Expedition city tile value should prevent a pure production payback penalty'
);
const earlyExpeditionBoard = scoreBoardStateModifiers(
  'Early Expedition',
  {e: 'Decrease your energy production 1 step and increase your M€ production 3 steps. Place a city tile.'},
  'decrease your energy production 1 step and increase your m€ production 3 steps. place a city tile.',
  {
    gensLeft: 14,
    prod: {energy: 0, steel: 0, ti: 0, plants: 0, heat: 0},
    tableauNames: new Set(['Manutech']),
    coloniesOwned: 0,
  },
);
assert(
  earlyExpeditionBoard.reasons.some((reason) => reason.includes('Не сейчас: energy prod 0→-1')),
  'Early Expedition should still show the delayed energy-production payment blocker'
);
assert(
  !earlyExpeditionBoard.reasons.some((reason) => reason.includes('Нет энергии')),
  'Early Expedition should not add a second generic energy deficit penalty on top of the payment blocker'
);

sandbox.TM_CARD_TAGS['Luna Governor'] = ['earth', 'earth'];
sandbox.TM_CARD_TAGS['Earth Office'] = ['earth'];
sandbox.TM_RATINGS['Luna Governor'] = { y: ['Earth Office', 'Luna Metropolis'] };
sandbox.TM_RATINGS['Luna Metropolis'] = { y: ['Luna Governor'] };
sandbox.TM_RATINGS['Earth Office'] = { y: ['Luna Governor'] };

const spentTableauSynergy = scoreTableauSynergy(
  'Luna Governor',
  sandbox.TM_RATINGS['Luna Governor'],
  ['Luna Metropolis'],
  new Set(['Luna Metropolis']),
  new Set()
);
assert.strictEqual(
  spentTableauSynergy.bonus,
  0,
  'Luna Governor should not receive tableau synergy from already-played Luna Metropolis'
);

const liveTableauSynergy = scoreTableauSynergy(
  'Luna Governor',
  sandbox.TM_RATINGS['Luna Governor'],
  ['Earth Office'],
  new Set(['Earth Office']),
  new Set()
);
assert.strictEqual(
  liveTableauSynergy.bonus,
  3,
  'Luna Governor should keep persistent tableau synergy from Earth Office'
);
assert(
  liveTableauSynergy.reasons.some((reason) => reason.includes('Earth Office +3')),
  'Earth Office tableau synergy should remain visible'
);

sandbox.TM_CARD_TAGS['Cutting Edge Technology'] = ['science'];
sandbox.TM_CARD_TAGS['Adaptation Technology'] = ['science'];
sandbox.TM_CARD_TAGS['Research'] = ['science', 'science'];
sandbox.TM_RATINGS['Cutting Edge Technology'] = { y: ['Adaptation Technology', 'Research'] };
const lateCuttingEdgePlayedSetupSynergy = scoreTableauSynergy(
  'Cutting Edge Technology',
  sandbox.TM_RATINGS['Cutting Edge Technology'],
  ['Adaptation Technology', 'Research'],
  new Set(['Adaptation Technology', 'Research']),
  new Set(),
  {gensLeft: 1, _handNamesSet: new Set()}
);
assert.strictEqual(
  lateCuttingEdgePlayedSetupSynergy.bonus,
  1,
  'Cutting Edge Technology should not get full late tableau aura from already-played science setup cards'
);
assert(
  !lateCuttingEdgePlayedSetupSynergy.reasons.some((reason) => reason.includes('Research')),
  'Already-played Research should not keep scoring as live Cutting Edge Technology synergy'
);

sandbox.TM_CARD_EFFECTS['Nitrogen from Titan'] = {c: 25, tr: 2, vp: 1, places: 'floater', placesTag: 'jovian', placesN: 2};
sandbox.TM_CARD_EFFECTS['Titan Floating Launch-pad'] = {c: 18, res: 'floater', places: 'floater', placesTag: 'jovian', tg: 'jovian'};
sandbox.TM_CARD_EFFECTS['Dirigibles'] = {c: 11, res: 'floater', tg: 'venus'};
sandbox.TM_CARD_TAGS['Nitrogen from Titan'] = ['jovian', 'space'];
sandbox.TM_CARD_TAGS['Titan Floating Launch-pad'] = ['jovian'];
sandbox.TM_CARD_TAGS['Dirigibles'] = ['venus'];
assert.strictEqual(
  resourcePlacementCanReachTarget(sandbox.TM_CARD_EFFECTS['Nitrogen from Titan'], sandbox.TM_CARD_EFFECTS['Titan Floating Launch-pad'], 'Titan Floating Launch-pad'),
  true,
  'Nitrogen from Titan should be able to place floaters on Jovian floater cards'
);
assert.strictEqual(
  resourcePlacementCanReachTarget(sandbox.TM_CARD_EFFECTS['Nitrogen from Titan'], sandbox.TM_CARD_EFFECTS['Dirigibles'], 'Dirigibles'),
  false,
  'Nitrogen from Titan should not treat Venus floater cards as legal Jovian targets'
);
const placerRuleScale = Object.assign({}, positionalScoring, {
  placerPerTarget: 3,
  placerTargetCap: 4,
  noTargetPenalty: 2,
  accumWithPlacer: 1,
  accumCompete: 1,
  eatsOwnPenalty: 1,
  eatsOppBonus: 1,
  synRulesCap: 10,
});
const nitrogenWithJovianTarget = scoreSynergyRules(
  'Nitrogen from Titan',
  ['Titan Floating Launch-pad'],
  {},
  placerRuleScale
);
assert(
  nitrogenWithJovianTarget.bonus > 0 && nitrogenWithJovianTarget.reasons.some((reason) => reason.includes('floater цель ×2')),
  'Nitrogen from Titan should gain placer synergy when a Jovian floater target is present'
);
const nitrogenWithVenusOnlyTarget = scoreSynergyRules(
  'Nitrogen from Titan',
  ['Dirigibles'],
  {},
  placerRuleScale
);
assert(
  nitrogenWithVenusOnlyTarget.bonus <= 0 && nitrogenWithVenusOnlyTarget.reasons.some((reason) => reason.includes('Нет floater целей')),
  'Nitrogen from Titan should not gain placer synergy from non-Jovian floater targets'
);

const arcticThreeOceansLeftTiming = scoreFTNTiming(
  'Arctic Algae',
  {
    gensLeft: 5,
    tags: {},
    awardTags: {},
    milestoneNeeds: {},
    tagTriggers: [],
    prod: {steel: 0, ti: 0, energy: 0, heat: 0, plants: 0, mc: 0},
    tableauNames: new Set(),
    globalParams: {oxy: 0, temp: -12, oceans: 6, venus: 0},
  },
  {isPreludeOrCorp: false, myHand: []}
);
assert(
  arcticThreeOceansLeftTiming.reasons.some((reason) => reason.includes('Океанов 3 −6')),
  'Arctic Algae should get an explicit penalty when only three oceans remain'
);

const richEmptyLateCtx = {
  gen: 6,
  gensLeft: 2,
  handSize: 0,
  mc: 77,
  tags: {},
  awardTags: {},
  milestoneNeeds: {},
  tagTriggers: [],
  prod: {steel: 0, ti: 0, energy: 0, heat: 0, plants: 0, mc: 28},
  tableauNames: new Set(),
  globalParams: {oxy: 12, temp: 0, oceans: 8},
};

const richEmptyLateDrawTiming = scorePositionalFactors(
  new Set(),
  'green',
  'Research',
  11,
  1,
  'draw 2 cards.',
  {e: 'Draw 2 cards.'},
  richEmptyLateCtx,
  60,
  true,
  false,
  false
);
assert(
  richEmptyLateDrawTiming.bonus > 0 &&
    richEmptyLateDrawTiming.reasons.some((reason) => reason.includes('Пустая рука+MC')) &&
    !richEmptyLateDrawTiming.reasons.some((reason) => reason.includes('Рисовка поздно')),
  'late rich players with an empty hand should treat project draw as VP-conversion, not as dead late draw'
);

const oldActionROICDMul = positionalScoring.actionROICDMul;
const oldActionROIBonCap = positionalScoring.actionROIBonCap;
const oldActionROIDivisor = positionalScoring.actionROIDivisor;
const oldHandFullThreshold = positionalScoring.handFullThreshold;
positionalScoring.actionROICDMul = 3;
positionalScoring.actionROIBonCap = 8;
positionalScoring.actionROIDivisor = 4;
positionalScoring.handFullThreshold = 10;
sandbox.TM_CARD_EFFECTS['AI Central'] = {c: 21, vp: 1, actCD: 2, ep: -1};
const fullHandLateAiCentralEconomy = scoreCardEconomyInContext(
  new Set(['science', 'building']),
  'blue',
  'AI Central',
  21,
  0.5,
  'requires 3 science tags. decrease your energy production 1 step. action: draw 2 cards.',
  {e: 'Requires 3 science tags. Decrease your energy production 1 step. Action: Draw 2 cards.'},
  {
    gen: 7,
    gensLeft: 4,
    handSize: 14,
    tags: {science: 3, building: 2},
    awardTags: {},
    milestoneNeeds: {},
    tagTriggers: [],
    prod: {steel: 0, ti: 0, energy: 3, heat: 0, plants: 0, mc: 0},
    tableauNames: new Set(['Olympus Conference', 'Mars University', 'Research']),
    globalParams: {oxy: 4, temp: -8, oceans: 2},
  },
  false
);
assert(
  fullHandLateAiCentralEconomy.reasons.some((reason) => reason.includes('Draw ROI: рука полна −6')),
  'AI Central should not value draw-2 action at full ROI when the player already has a large late hand'
);
positionalScoring.actionROICDMul = oldActionROICDMul;
positionalScoring.actionROIBonCap = oldActionROIBonCap;
positionalScoring.actionROIDivisor = oldActionROIDivisor;
positionalScoring.handFullThreshold = oldHandFullThreshold;

sandbox.TM_CARD_EFFECTS['Acquired Company'] = {c: 10, mp: 3};
const richEmptyLateProdEconomy = scoreCardEconomyInContext(
  new Set(['earth']),
  'green',
  'Acquired Company',
  10,
  1,
  'increase your m€ production 3 steps.',
  {e: 'Increase your M€ production 3 steps.'},
  richEmptyLateCtx,
  false
);
assert(
  richEmptyLateProdEconomy.bonus <= -16 &&
    richEmptyLateProdEconomy.reasons.some((reason) => reason.includes('Нет VP-конверсии')),
  'late rich players with an empty hand should receive an extra penalty on pure production with no VP conversion'
);

const lateDirigiblesEconomy = scoreCardEconomyInContext(
  new Set(['venus']),
  'blue',
  'Dirigibles',
  11,
  0.2,
  'action: add 1 floater to any card. when playing a venus tag, floaters here may be used as payment.',
  {e: 'Action: Add 1 floater to ANY card. When playing a Venus tag, Floaters here may be used as payment.'},
  {
    gensLeft: 1,
    tags: {venus: 1},
    awardTags: {},
    milestoneNeeds: {},
    tagTriggers: [],
    prod: {steel: 0, ti: 0, energy: 0, heat: 0, plants: 0, mc: 0},
    tableauNames: new Set(['Jet Stream Microscrappers']),
    globalParams: {oxy: 12, temp: 0, oceans: 9},
  },
  true
);
assert(
  lateDirigiblesEconomy.bonus <= -24 && lateDirigiblesEconomy.reasons.some((reason) => reason.includes('Поздн. floater engine -24')),
  'Dirigibles should receive a hard late-game penalty as a no-VP floater/payment engine'
);

const genSevenDirigiblesEconomy = scoreCardEconomyInContext(
  new Set(['venus']),
  'blue',
  'Dirigibles',
  11,
  0.5,
  'action: add 1 floater to any card. when playing a venus tag, floaters here may be used as payment.',
  {e: 'Action: Add 1 floater to ANY card. When playing a Venus tag, Floaters here may be used as payment.'},
  {
    gen: 7,
    gensLeft: 4,
    tags: {venus: 2},
    awardTags: {},
    milestoneNeeds: {},
    tagTriggers: [],
    prod: {steel: 0, ti: 0, energy: 0, heat: 0, plants: 0, mc: 0},
    floaterTargetCount: 1,
    floaterAccumRate: 0,
    tableauNames: new Set(['Titan Shuttles']),
    globalParams: {oxy: 4, temp: -8, oceans: 2},
  },
  true
);
assert(
  genSevenDirigiblesEconomy.bonus <= -20 &&
    genSevenDirigiblesEconomy.reasons.some((reason) => reason.includes('Поздн. floater engine -24')),
  'Dirigibles should not jump to S-tier in generation 7 from generic Venus/floater shell bonuses'
);

sandbox.TM_CARD_EFFECTS['Mine'] = {c: 4, sp: 1};
const lateMineEconomy = scoreCardEconomyInContext(
  new Set(['building']),
  'green',
  'Mine',
  4,
  0.5,
  'increase your steel production 1 step.',
  {e: 'Increase your steel production 1 step.'},
  {
    gen: 7,
    gensLeft: 4,
    tags: {building: 3},
    awardTags: {},
    milestoneNeeds: {},
    tagTriggers: [],
    prod: {steel: 0, ti: 0, energy: 0, heat: 0, plants: 0, mc: 0},
    steel: 8,
    tableauNames: new Set(['Space Elevator']),
    globalParams: {oxy: 4, temp: -8, oceans: 2},
  },
  false
);
assert(
  lateMineEconomy.bonus <= -15 &&
    lateMineEconomy.reasons.some((reason) => reason.includes('Mine: поздняя окупаемость -15')),
  'Mine should not stay high in generation 7 just because steel/building synergy exists'
);

sandbox.TM_CARD_EFFECTS["Inventors' Guild"] = {c: 9, actCD: 0.3};
const inventorsGuildLateEconomy = scoreCardEconomyInContext(
  new Set(['science']),
  'blue',
  "Inventors' Guild",
  9,
  0.8,
  'action: look at the top card and either buy it or discard it.',
  {e: 'Action: Look at the top card and either buy it or discard it.'},
  {
    gen: 7,
    gensLeft: 6,
    tags: {science: 2},
    awardTags: {},
    milestoneNeeds: {},
    tagTriggers: [],
    prod: {steel: 0, ti: 0, energy: 0, heat: 0, plants: 0, mc: 0},
    tableauNames: new Set(['Mars University']),
    globalParams: {oxy: 8, temp: -10, oceans: 5},
  },
  true
);
assert(
  inventorsGuildLateEconomy.bonus <= -8 &&
    inventorsGuildLateEconomy.reasons.some((reason) => reason.includes('Поздн. фильтр -8')),
  "Inventors' Guild should not be lifted to A-tier by late science synergy in generation 7"
);

const inventorsGuildOpeningEconomy = scoreCardEconomyInContext(
  new Set(['science']),
  'blue',
  "Inventors' Guild",
  9,
  1,
  'action: look at the top card and either buy it or discard it.',
  {e: 'Action: Look at the top card and either buy it or discard it.'},
  {
    gen: 2,
    gensLeft: 8,
    tags: {science: 1},
    awardTags: {},
    milestoneNeeds: {},
    tagTriggers: [],
    prod: {steel: 0, ti: 0, energy: 0, heat: 0, plants: 0, mc: 0},
    tableauNames: new Set(['Mars University']),
    globalParams: {oxy: 2, temp: -24, oceans: 1},
  },
  true
);
assert(
  !inventorsGuildOpeningEconomy.reasons.some((reason) => reason.includes('Поздн. фильтр')),
  "Inventors' Guild should keep its early engine-start window"
);

assert.strictEqual(getCardCost('not-a-dom-node'), null, 'getCardCost should ignore non-element inputs');

const baseCtx = {
  gensLeft: 6,
  tableauSize: 0,
  boardFullness: 0,
  emptySpaces: 20,
  animalAccumRate: 0,
  microbeAccumRate: 0,
  floaterAccumRate: 0,
  tagsWithHand: {},
  tags: {},
  steel: 0,
  titanium: 0,
  gen: 1,
};

positionalScoring.strategyThresholds = Object.assign({}, positionalScoring.strategyThresholds || {}, {building: 6});
positionalScoring.strategyBase = 2;
positionalScoring.strategyCap = 4;
const medicalLabPositionScore = scorePositionalFactors(
  new Set(['building', 'science']),
  'green',
  'Medical Lab',
  13,
  0.8,
  'increase your m€ production 1 step for every 2 building tags you have.',
  {e: 'Increase your M€ production 1 step for every 2 building tags you have.'},
  Object.assign({}, baseCtx, {
    tagsWithHand: {building: 6},
    tags: {building: 1},
    prod: {steel: 1, ti: 0, energy: 0, heat: 0, plants: 0, mc: 0},
    globalParams: {},
  }),
  69,
  true,
  false,
  false
);
assert(
  !medicalLabPositionScore.reasons.some((reason) => reason.includes('building стратегия')),
  'Medical Lab should not receive generic building-strategy bonus on top of its own played-building-tag production',
);

const prefabPositionalScore = scorePositionalFactors(
  new Set(['building', 'city']),
  'green',
  'Prefabrication of Human Habitats',
  8,
  1,
  prefabCityDiscountText,
  {e: prefabCityDiscountText},
  Object.assign({}, baseCtx, {prod: {plants: 4}, globalParams: {}}),
  74,
  true,
  false,
  false
);
assert(
  !prefabPositionalScore.reasons.some((reason) => reason.includes('Город+озелен') || reason.includes('Мало озелен')),
  'Prefabrication should not receive city adjacency positional reasons without fx.city'
);

const mergerScore = scorePositionalFactors(
  new Set(),
  'green',
  'Merger',
  0,
  1,
  'draw 4 corporation cards. play one of them and discard the other 3.',
  {e: 'Draw 4 corporation cards. Play one of them and discard the other 3. Then pay 42 M€.'},
  baseCtx,
  0,
  true,
  false,
  true
);
assert(
  !mergerScore.reasons.some((reason) => reason.includes('Рисовка рано')),
  'Merger should not receive the generic early draw bonus'
);

const researchLikeScore = scorePositionalFactors(
  new Set(),
  'green',
  'Research',
  0,
  1,
  'draw 2 cards.',
  {e: 'Draw 2 cards.'},
  baseCtx,
  0,
  true,
  false,
  false
);
assert(
  researchLikeScore.reasons.some((reason) => reason.includes('Рисовка рано +5')),
  'regular draw cards should keep the early draw bonus'
);

const newPartnerScore = scorePositionalFactors(
  new Set(),
  'green',
  'New Partner',
  0,
  1,
  'raise your m€ production 1 step. immediately draw 2 prelude cards. play 1 of them, and discard the other.',
  {e: 'Raise your M€ production 1 step. Immediately draw 2 prelude cards. Play 1 of them, and discard the other.'},
  baseCtx,
  0,
  true,
  false,
  false
);
assert(
  !newPartnerScore.reasons.some((reason) => reason.includes('Рисовка рано')),
  'New Partner should not receive generic project draw bonus for prelude draw'
);

sandbox.TM_CARD_DATA['New Partner'] = {type: 'prelude'};
sandbox.kebabLookup['new-partner'] = 'New Partner';
const fakePreludeCardEl = {
  classList: {
    contains() { return false; },
    *[Symbol.iterator]() { yield 'card-new-partner'; },
  },
  closest() { return null; },
  querySelector() { return null; },
};
assert.strictEqual(
  isPreludeOrCorpCard(fakePreludeCardEl),
  true,
  'Prelude detector should fall back to canonical card type when DOM lacks prelude classes'
);

const fishDelay = getNamedRequirementDelayProfile('Fish', {
  globalParams: {temperature: -30, oxy: 0},
});
assert.strictEqual(fishDelay.penalty, -10, 'Fish should get a heavy opener temp penalty at -30C');
assert.strictEqual(fishDelay.suppressAccumulatorBonus, true, 'Fish should suppress accumulator bonus while far from +2C');
assert.strictEqual(fishDelay.selfResourceFactor, 0.15, 'Fish should sharply discount self-resource VP projection while locked');

const treesDelay = getNamedRequirementDelayProfile('Trees', {
  globalParams: {temperature: -30, oxy: 0},
});
assert.strictEqual(treesDelay.penalty, -8, 'Trees should get a meaningful opener temp penalty at -30C');
assert.strictEqual(treesDelay.reason, 'Trees ждут temp −8', 'Trees delay reason should stay explicit in the tooltip');

sandbox.TM_CARD_DATA['Acquired Space Agency'] = {type: 'prelude'};
sandbox.TM_CARD_DATA['EcoLine'] = {type: 'corporation'};
sandbox.TM_RATINGS['Acquired Space Agency'] = {s: 72, o: 7};
sandbox.TM_RATINGS['EcoLine'] = {s: 85, o: 5};

assert.strictEqual(
  getOpeningHandBias('Acquired Space Agency', sandbox.TM_RATINGS['Acquired Space Agency'], {_openingHand: true}),
  0,
  'Prelude cards should not receive a separate opening-hand bias'
);
assert.strictEqual(
  getInitialDraftRatingScore('Acquired Space Agency', 55),
  72,
  'Prelude initial draft score should stay at base rating without a separate opening-hand uplift'
);
assert.strictEqual(
  getOpeningHandBias('EcoLine', sandbox.TM_RATINGS['EcoLine'], {_openingHand: true}),
  3,
  'Corps should keep their opening-hand bias'
);
assert.strictEqual(
  getInitialDraftRatingScore('EcoLine', 55),
  88,
  'Corp initial draft score should still include normalized opening-hand bias'
);

sandbox.TM_CARD_EFFECTS['Business Empire'] = {c: 6, mp: 6};
const businessCtx = {
  prod: {energy: 0, steel: 0, ti: 0, plants: 0, heat: 0},
  tableauNames: [],
  coloniesOwned: 0,
};
const businessFloor = getProductionFloorStatus('Business Empire', businessCtx);
assert.strictEqual(businessFloor.unplayable, false, 'Business Empire should not require energy production');
assert.strictEqual(businessFloor.reasons.length, 0, 'Business Empire should not emit production-floor reasons');
const businessBoard = scoreBoardStateModifiers(
  'Business Empire',
  {e: 'Increase your M€ production 6 steps. Pay 6 M€.'},
  'increase your m€ production 6 steps. pay 6 m€.',
  businessCtx,
);
assert(
  !businessBoard.reasons.some((reason) => /energy|энерг/i.test(reason)),
  'Business Empire should not show energy deficit reasons',
);

assert(
  source.includes("'Unity': ['venus', 'jovian']"),
  'Unity hand-cluster should stay focused on venus/jovian instead of generic earth stacking'
);

assert(
  source.includes("if (htTag === 'earth' && htCount < 3) continue;"),
  'Earth hand-affinity should ignore generic x2 clustering and wait for a real earth stack'
);

assert(
  source.includes("var premiumColonies = new Set(['Luna', 'Pluto', 'Triton', 'Ceres']);"),
  'Established Methods should treat Triton as a premium colony shell instead of older Titan/Europa heuristics'
);

assert(
  source.includes("reasons.push('Poseidon colony SP +3');"),
  'Established Methods should keep a stronger dedicated Poseidon opener bonus'
);

assert(
  source.includes("descs.push('Planetary Alliance unlocks req +6');"),
  'Solarnet should surface Planetary Alliance as a direct opener unlock'
);

assert(
  source.includes("if (cardName === 'High Circles') {"),
  'High Circles should have explicit Turmoil-shell opener logic'
);

assert(
  source.includes("reasons.push('Septem Tribus politics +3');"),
  'High Circles should explicitly reward Septem Tribus in opener scoring'
);

assert(
  source.includes("reasons.push('Corridors leader race +2');"),
  'High Circles should explicitly reward Corridors of Power in opener scoring'
);

assert(
  source.includes("reasons.push('Rise To Power delegates +2');"),
  'High Circles should explicitly reward Rise To Power in opener scoring'
);

assert(
  source.includes("pushStructuredReason(reasons, reasonRows, 'Океанов 1 −14', -14);"),
  'Arctic Algae should get a hard near-dead penalty when only one ocean remains'
);

assert(
  source.includes("pushStructuredReason(reasons, reasonRows, 'Океанов 3 −6', -6);"),
  'Arctic Algae should already be strongly discounted when only three oceans remain'
);

assert(
  source.includes("if (cardName === 'Arctic Algae' && ctx && ctx.globalParams) {"),
  'Arctic Algae should have dedicated dead-window guards in runtime scoring'
);

assert(
  source.includes("descs.push('ocean cap ' + ncUsableTotal + '/' + ncTotal"),
  'Arctic Algae hand ocean synergy should expose remaining-ocean caps'
);

assert(
  source.includes("if (!decompTargetDead && ['plant', 'animal', 'microbe'].some"),
  'Dead conditional bio cards should not receive generic Decomposers reverse synergy'
);

assert(
  source.includes("descs.push('slow opener −2.5');"),
  'Negative hand-synergy descriptors should include signed values so they render in the negative group'
);

assert(
  source.includes(" + ' animal VP compete −' + animalCompetePenalty"),
  'Animal VP competition should render as a negative hand-synergy reason'
);

assert(
  source.includes(" + ' ep consumers fight −' + hogFightPenalty"),
  'Energy-consumer competition should render as a negative hand-synergy reason'
);

assert(
  source.includes("'Power Infrastructure': { src: 'ep', label: 'energy→MC', perProd: 0.25, cap: 1.5, minProd: 4 }"),
  'Power Infrastructure should be treated as a weak fallback energy-to-MC cashout, not a premium converter'
);

assert(
  source.includes("cardName === 'Power Infrastructure' ? Math.min(producers * 0.5, 1)"),
  'Power Infrastructure should receive only a small hand bonus from energy producers'
);

assert(
  source.includes("var _mcConverters = ['Insulation', 'Caretaker Contract'];"),
  'Power Infrastructure should not be part of heat-to-MC/TR triple-chain converter scoring'
);

assert(
  source.includes("if (myHand[_hoi] === 'Insulation') hasMCSink80 = true;"),
  'Power Infrastructure should not suppress heat-only TR scoring as a fake heat sink'
);

assert(
  source.includes("return Math.min(weight, reverse ? 0.5 : 1);"),
  'Power Infrastructure named tableau synergies should be damped instead of giving full +3/+1.5 spikes'
);

assert(
  source.includes("myHand[_ehj] !== 'Power Infrastructure'"),
  'Power Infrastructure should not suppress residual energy-to-heat pipeline scoring'
);

assert(
  source.includes("myHand[_ec96] !== 'Power Infrastructure'"),
  'Power Infrastructure should not block full heat-chain scoring for energy production cards'
);

console.log('content synergy regressions: OK');
