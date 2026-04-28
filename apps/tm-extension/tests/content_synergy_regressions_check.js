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
const getCardNameSource = extractFunctionSource(source, 'getCardName');
const getCardTagsForNameSource = extractFunctionSource(source, 'getCardTagsForName');
const resourcePlacementCanReachTargetSource = extractFunctionSource(source, 'resourcePlacementCanReachTarget');
const isLateEcoZoneBioTriggerCardSource = extractFunctionSource(source, 'isLateEcoZoneBioTriggerCard');
const yNameSource = extractFunctionSource(source, 'yName');
const yWeightSource = extractFunctionSource(source, 'yWeight');
const reasonCardLabelSource = extractFunctionSource(source, 'reasonCardLabel');
const describeNamedSynergySource = extractFunctionSource(source, 'describeNamedSynergy');
const describeCorpBoostReasonSource = extractFunctionSource(source, 'describeCorpBoostReason');
const getCorpBoostSource = extractFunctionSource(source, 'getCorpBoost');
const pushStructuredReasonSource = extractFunctionSource(source, 'pushStructuredReason');
const getProductionFloorStatusSource = extractFunctionSource(source, 'getProductionFloorStatus');
const getRequirementTagReasonLabelSource = extractFunctionSource(source, 'getRequirementTagReasonLabel');
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
const ftnRowSource = extractFunctionSource(source, 'ftnRow');
const computeCardValueSource = extractFunctionSource(source, 'computeCardValue');
const scoreBreakEvenTimingSource = extractFunctionSource(source, 'scoreBreakEvenTiming');
const scoreFTNTimingSource = extractFunctionSource(source, 'scoreFTNTiming');
const isPreludeOrCorpCardSource = extractFunctionSource(source, 'isPreludeOrCorpCard');
const formatTableauSynergyReasonSource = extractFunctionSource(source, 'formatTableauSynergyReason');
const dampTableauSynergyWeightSource = extractFunctionSource(source, 'dampTableauSynergyWeight');
const isSpentTableauSynergySource = extractFunctionSource(source, 'isSpentTableauSynergy');
const scoreTableauSynergySource = extractFunctionSource(source, 'scoreTableauSynergy');
const scoreSynergyRulesSource = extractFunctionSource(source, '_scoreSynergyRules');
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
    getCardNameSource,
    getCardTagsForNameSource,
    resourcePlacementCanReachTargetSource,
    isLateEcoZoneBioTriggerCardSource,
    yNameSource,
    yWeightSource,
    reasonCardLabelSource,
    describeNamedSynergySource,
    describeCorpBoostReasonSource,
    getCorpBoostSource,
    pushStructuredReasonSource,
    getRequirementTagReasonLabelSource,
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
    ftnRowSource,
    computeCardValueSource,
    scoreBreakEvenTimingSource,
    scoreFTNTimingSource,
    isPreludeOrCorpCardSource,
    formatTableauSynergyReasonSource,
    dampTableauSynergyWeightSource,
    isSpentTableauSynergySource,
    scoreTableauSynergySource,
    scoreSynergyRulesSource,
    getNamedRequirementDelayProfileSource,
    scorePositionalFactorsSource,
    isOpeningHandContextSource,
    normalizeOpeningHandBiasSource,
    getOpeningHandBiasSource,
    getInitialDraftRatingScoreSource,
    'globalThis.__tm_test_describeCorpBoostReason = describeCorpBoostReason;',
    'globalThis.__tm_test_getCorpBoost = getCorpBoost;',
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
    'globalThis.__tm_test_isVpAccumulatorActionFx = isVpAccumulatorActionFx;',
    'globalThis.__tm_test_isBlueActionFx = isBlueActionFx;',
    'globalThis.__tm_test_getVpAccumulatorProjectedResources = getVpAccumulatorProjectedResources;',
    'globalThis.__tm_test_computeCardValue = computeCardValue;',
    'globalThis.__tm_test_scoreBreakEvenTiming = scoreBreakEvenTiming;',
    'globalThis.__tm_test_scoreFTNTiming = scoreFTNTiming;',
    'globalThis.__tm_test_isPreludeOrCorpCard = isPreludeOrCorpCard;',
    'globalThis.__tm_test_scoreTableauSynergy = scoreTableauSynergy;',
    'globalThis.__tm_test_resourcePlacementCanReachTarget = resourcePlacementCanReachTarget;',
    'globalThis.__tm_test_scoreSynergyRules = _scoreSynergyRules;',
    'globalThis.__tm_test_getNamedRequirementDelayProfile = getNamedRequirementDelayProfile;',
    'globalThis.__tm_test_scorePositionalFactors = scorePositionalFactors;',
    'globalThis.__tm_test_getOpeningHandBias = getOpeningHandBias;',
    'globalThis.__tm_test_getInitialDraftRatingScore = getInitialDraftRatingScore;',
  ].join('\n\n'),
  sandbox,
  {filename: sourcePath}
);

const describeCorpBoostReason = sandbox.__tm_test_describeCorpBoostReason;
const getCorpBoost = sandbox.__tm_test_getCorpBoost;
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
const isVpAccumulatorActionFx = sandbox.__tm_test_isVpAccumulatorActionFx;
const isBlueActionFx = sandbox.__tm_test_isBlueActionFx;
const getVpAccumulatorProjectedResources = sandbox.__tm_test_getVpAccumulatorProjectedResources;
const computeCardValue = sandbox.__tm_test_computeCardValue;
const scoreBreakEvenTiming = sandbox.__tm_test_scoreBreakEvenTiming;
const scoreFTNTiming = sandbox.__tm_test_scoreFTNTiming;
const isPreludeOrCorpCard = sandbox.__tm_test_isPreludeOrCorpCard;
const scoreTableauSynergy = sandbox.__tm_test_scoreTableauSynergy;
const resourcePlacementCanReachTarget = sandbox.__tm_test_resourcePlacementCanReachTarget;
const scoreSynergyRules = sandbox.__tm_test_scoreSynergyRules;
const getNamedRequirementDelayProfile = sandbox.__tm_test_getNamedRequirementDelayProfile;
const scorePositionalFactors = sandbox.__tm_test_scorePositionalFactors;
const getOpeningHandBias = sandbox.__tm_test_getOpeningHandBias;
const getInitialDraftRatingScore = sandbox.__tm_test_getInitialDraftRatingScore;

assert.strictEqual(typeof describeCorpBoostReason, 'function', 'describeCorpBoostReason should be exposed');
assert.strictEqual(typeof getCorpBoost, 'function', 'getCorpBoost should be exposed');
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
assert.strictEqual(typeof isVpAccumulatorActionFx, 'function', 'isVpAccumulatorActionFx should be exposed');
assert.strictEqual(typeof isBlueActionFx, 'function', 'isBlueActionFx should be exposed');
assert.strictEqual(typeof getVpAccumulatorProjectedResources, 'function', 'getVpAccumulatorProjectedResources should be exposed');
assert.strictEqual(typeof computeCardValue, 'function', 'computeCardValue should be exposed');
assert.strictEqual(typeof scoreBreakEvenTiming, 'function', 'scoreBreakEvenTiming should be exposed');
assert.strictEqual(typeof scoreFTNTiming, 'function', 'scoreFTNTiming should be exposed');
assert.strictEqual(typeof scoreTableauSynergy, 'function', 'scoreTableauSynergy should be exposed');
assert.strictEqual(typeof resourcePlacementCanReachTarget, 'function', 'resourcePlacementCanReachTarget should be exposed');
assert.strictEqual(typeof scoreSynergyRules, 'function', 'scoreSynergyRules should be exposed');
assert.strictEqual(typeof scorePositionalFactors, 'function', 'scorePositionalFactors should be exposed');
assert.strictEqual(typeof getOpeningHandBias, 'function', 'getOpeningHandBias should be exposed');
assert.strictEqual(typeof getInitialDraftRatingScore, 'function', 'getInitialDraftRatingScore should be exposed');

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
  lateDirigiblesEconomy.bonus <= -20 && lateDirigiblesEconomy.reasons.some((reason) => reason.includes('Поздн. floater engine -20')),
  'Dirigibles should receive a hard late-game penalty as a no-VP floater/payment engine'
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
  source.includes("if (cardName === 'Arctic Algae' && ctx && ctx.globalParams) {"),
  'Arctic Algae should have dedicated dead-window guards in runtime scoring'
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
