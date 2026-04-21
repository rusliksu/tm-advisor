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
const cardPlacesCityTileByNameSource = extractFunctionSource(source, 'cardPlacesCityTileByName');
const cardPlacesMapTileByNameSource = extractFunctionSource(source, 'cardPlacesMapTileByName');
const getCardTypeByNameSource = extractFunctionSource(source, 'getCardTypeByName');
const isPreludeOrCorpNameSource = extractFunctionSource(source, 'isPreludeOrCorpName');
const getCardNameSource = extractFunctionSource(source, 'getCardName');
const getCardTagsForNameSource = extractFunctionSource(source, 'getCardTagsForName');
const yNameSource = extractFunctionSource(source, 'yName');
const yWeightSource = extractFunctionSource(source, 'yWeight');
const reasonCardLabelSource = extractFunctionSource(source, 'reasonCardLabel');
const describeNamedSynergySource = extractFunctionSource(source, 'describeNamedSynergy');
const describeCorpBoostReasonSource = extractFunctionSource(source, 'describeCorpBoostReason');
const getCorpBoostSource = extractFunctionSource(source, 'getCorpBoost');
const pushStructuredReasonSource = extractFunctionSource(source, 'pushStructuredReason');
const getProductionFloorStatusSource = extractFunctionSource(source, 'getProductionFloorStatus');
const scoreTurmoilSynergySource = extractFunctionSource(source, 'scoreTurmoilSynergy');
const scoreBoardStateModifiersSource = extractFunctionSource(source, 'scoreBoardStateModifiers');
const getCardCostSource = extractFunctionSource(source, 'getCardCost');
const isPlantEngineCardByFxSource = extractFunctionSource(source, 'isPlantEngineCardByFx');
const isMeltworksLastGenCashoutSource = extractFunctionSource(source, 'isMeltworksLastGenCashout');
const isPreludeOrCorpCardSource = extractFunctionSource(source, 'isPreludeOrCorpCard');
const formatTableauSynergyReasonSource = extractFunctionSource(source, 'formatTableauSynergyReason');
const isSpentTableauSynergySource = extractFunctionSource(source, 'isSpentTableauSynergy');
const scoreTableauSynergySource = extractFunctionSource(source, 'scoreTableauSynergy');
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
  TM_RATINGS: {},
  _TM_RATINGS_RAW: {},
  TM_CORPS: {},
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
sandbox.globalThis = sandbox;

vm.runInNewContext(
  [
    getFxSource,
    cardPlacesCityTileByNameSource,
    cardPlacesMapTileByNameSource,
    getCardTypeByNameSource,
    isPreludeOrCorpNameSource,
    getCardNameSource,
    getCardTagsForNameSource,
    yNameSource,
    yWeightSource,
    reasonCardLabelSource,
    describeNamedSynergySource,
    describeCorpBoostReasonSource,
    getCorpBoostSource,
    pushStructuredReasonSource,
    getProductionFloorStatusSource,
    scoreTurmoilSynergySource,
    scoreBoardStateModifiersSource,
    getCardCostSource,
    isPlantEngineCardByFxSource,
    isMeltworksLastGenCashoutSource,
    isPreludeOrCorpCardSource,
    formatTableauSynergyReasonSource,
    isSpentTableauSynergySource,
    scoreTableauSynergySource,
    getNamedRequirementDelayProfileSource,
    scorePositionalFactorsSource,
    isOpeningHandContextSource,
    normalizeOpeningHandBiasSource,
    getOpeningHandBiasSource,
    getInitialDraftRatingScoreSource,
    'globalThis.__tm_test_describeCorpBoostReason = describeCorpBoostReason;',
    'globalThis.__tm_test_getCorpBoost = getCorpBoost;',
    'globalThis.__tm_test_getProductionFloorStatus = getProductionFloorStatus;',
    'globalThis.__tm_test_scoreTurmoilSynergy = scoreTurmoilSynergy;',
    'globalThis.__tm_test_scoreBoardStateModifiers = scoreBoardStateModifiers;',
    'globalThis.__tm_test_getCardCost = getCardCost;',
    'globalThis.__tm_test_isPlantEngineCardByFx = isPlantEngineCardByFx;',
    'globalThis.__tm_test_isMeltworksLastGenCashout = isMeltworksLastGenCashout;',
    'globalThis.__tm_test_isPreludeOrCorpCard = isPreludeOrCorpCard;',
    'globalThis.__tm_test_scoreTableauSynergy = scoreTableauSynergy;',
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
const getProductionFloorStatus = sandbox.__tm_test_getProductionFloorStatus;
const scoreTurmoilSynergy = sandbox.__tm_test_scoreTurmoilSynergy;
const scoreBoardStateModifiers = sandbox.__tm_test_scoreBoardStateModifiers;
const getCardCost = sandbox.__tm_test_getCardCost;
const isPlantEngineCardByFx = sandbox.__tm_test_isPlantEngineCardByFx;
const isMeltworksLastGenCashout = sandbox.__tm_test_isMeltworksLastGenCashout;
const isPreludeOrCorpCard = sandbox.__tm_test_isPreludeOrCorpCard;
const scoreTableauSynergy = sandbox.__tm_test_scoreTableauSynergy;
const getNamedRequirementDelayProfile = sandbox.__tm_test_getNamedRequirementDelayProfile;
const scorePositionalFactors = sandbox.__tm_test_scorePositionalFactors;
const getOpeningHandBias = sandbox.__tm_test_getOpeningHandBias;
const getInitialDraftRatingScore = sandbox.__tm_test_getInitialDraftRatingScore;

assert.strictEqual(typeof describeCorpBoostReason, 'function', 'describeCorpBoostReason should be exposed');
assert.strictEqual(typeof getCorpBoost, 'function', 'getCorpBoost should be exposed');
assert.strictEqual(typeof getProductionFloorStatus, 'function', 'getProductionFloorStatus should be exposed');
assert.strictEqual(typeof scoreTurmoilSynergy, 'function', 'scoreTurmoilSynergy should be exposed');
assert.strictEqual(typeof scoreBoardStateModifiers, 'function', 'scoreBoardStateModifiers should be exposed');
assert.strictEqual(typeof getCardCost, 'function', 'getCardCost should be exposed');
assert.strictEqual(typeof isPlantEngineCardByFx, 'function', 'isPlantEngineCardByFx should be exposed');
assert.strictEqual(typeof isMeltworksLastGenCashout, 'function', 'isMeltworksLastGenCashout should be exposed');
assert.strictEqual(typeof scoreTableauSynergy, 'function', 'scoreTableauSynergy should be exposed');
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

console.log('content synergy regressions: OK');
