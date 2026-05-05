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

const cardNSource = extractFunctionSource(source, 'cardN');
const getFxSource = extractFunctionSource(source, 'getFx');
const cardHasRequirementsByNameSource = extractFunctionSource(source, 'cardHasRequirementsByName');
const cardMatchesDiscountEntrySource = extractFunctionSource(source, 'cardMatchesDiscountEntry');
const getCardTypeByNameSource = extractFunctionSource(source, 'getCardTypeByName');
const isPreludeOrCorpNameSource = extractFunctionSource(source, 'isPreludeOrCorpName');
const getCardNameSource = extractFunctionSource(source, 'getCardName');
const getCardTagsForNameSource = extractFunctionSource(source, 'getCardTagsForName');
const yNameSource = extractFunctionSource(source, 'yName');
const yWeightSource = extractFunctionSource(source, 'yWeight');
const reasonCardLabelSource = extractFunctionSource(source, 'reasonCardLabel');
const describeNamedSynergySource = extractFunctionSource(source, 'describeNamedSynergy');
const getCorpBoostSource = extractFunctionSource(source, 'getCorpBoost');
const getCardCostSource = extractFunctionSource(source, 'getCardCost');
const computeCardValueSource = extractFunctionSource(source, 'computeCardValue');
const isPlantEngineCardByFxSource = extractFunctionSource(source, 'isPlantEngineCardByFx');
const isMeltworksLastGenCashoutSource = extractFunctionSource(source, 'isMeltworksLastGenCashout');
const isPreludeOrCorpCardSource = extractFunctionSource(source, 'isPreludeOrCorpCard');
const formatTableauSynergyReasonSource = extractFunctionSource(source, 'formatTableauSynergyReason');
const dampTableauSynergyWeightSource = extractFunctionSource(source, 'dampTableauSynergyWeight');
const isSpentTableauSynergySource = extractFunctionSource(source, 'isSpentTableauSynergy');
const scoreTableauSynergySource = extractFunctionSource(source, 'scoreTableauSynergy');
const getNamedRequirementDelayProfileSource = extractFunctionSource(source, 'getNamedRequirementDelayProfile');
const ctxHasTableauCardSource = extractFunctionSource(source, 'ctxHasTableauCard');
const getRequirementFlexStepsSource = extractFunctionSource(source, 'getRequirementFlexSteps');
const getRequirementHardnessSource = extractFunctionSource(source, 'getRequirementHardness');
const isCardPlayableNowByStaticRequirementsSource = extractFunctionSource(source, 'isCardPlayableNowByStaticRequirements');
const pushStructuredReasonSource = extractFunctionSource(source, 'pushStructuredReason');
const scorePostContextChecksSource = extractFunctionSource(source, 'scorePostContextChecks');
const scoreCardRequirementsSource = extractFunctionSource(source, 'scoreCardRequirements');
const scorePositionalFactorsSource = extractFunctionSource(source, 'scorePositionalFactors');
const getColonyBehaviorByNameSource = extractFunctionSource(source, 'getColonyBehaviorByName');
const scoreSynergyRulesSource = extractFunctionSource(source, '_scoreSynergyRules');

const positionalScoring = new Proxy({
  drawEarlyBonus: 5,
  drawMidBonus: 2,
  drawLatePenalty: 4,
  maxGL: 13,
  prodMul: {mp: 1, sp: 1.6, tp: 2.5, pp: 2, ep: 1.5, hp: 0.8},
  resVal: {mc: 1, st: 2, ti: 3, pl: 1.6, he: 0.5, en: 1, cd: 3},
  tableauSynergyPer: 3,
  tableauSynergyMax: 4,
}, {
  get(target, prop) {
    return Object.prototype.hasOwnProperty.call(target, prop) ? target[prop] : 0;
  },
});

const sandbox = {
  console,
  Set,
  TM_CARD_EFFECTS: {},
  TM_CARD_DATA: {},
  TM_CARD_TAGS: {},
  TM_CARD_GLOBAL_REQS: {},
  TM_CARD_TAG_REQS: {},
  TM_CARD_DISCOUNTS: {},
  CARD_DISCOUNTS: {},
  TM_RATINGS: {},
  TM_CORPS: {},
  TM_FLOATER_TRAPS: {},
  kebabLookup: {},
  lowerLookup: {},
  resolveCorpName(name) {
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
  hasSelfFloaterSource() {
    return false;
  },
  isGreeneryTile() {
    return false;
  },
  getFx() {
    return null;
  },
};
sandbox.globalThis = sandbox;

vm.runInNewContext(
  [
    cardNSource,
    getFxSource,
    getCardTypeByNameSource,
    isPreludeOrCorpNameSource,
    getCardNameSource,
    getCardTagsForNameSource,
    yNameSource,
    yWeightSource,
    reasonCardLabelSource,
    describeNamedSynergySource,
    getCorpBoostSource,
    getCardCostSource,
    'var FTN_TABLE = {0: [8, 0, 8], 1: [8, 0.5, 7.5]};',
    'var FTN_FALLBACK = [7, 5, 5];',
    'function ftnRow(gl) { return FTN_TABLE[gl] || FTN_TABLE[FTN_TABLE.length - 1] || FTN_FALLBACK; }',
    'const PROD_MUL = SC.prodMul;',
    'const RES_VAL = SC.resVal;',
    computeCardValueSource,
    cardHasRequirementsByNameSource,
    cardMatchesDiscountEntrySource,
    isPlantEngineCardByFxSource,
    isMeltworksLastGenCashoutSource,
    isPreludeOrCorpCardSource,
    formatTableauSynergyReasonSource,
    dampTableauSynergyWeightSource,
    isSpentTableauSynergySource,
    scoreTableauSynergySource,
    getNamedRequirementDelayProfileSource,
    ctxHasTableauCardSource,
    getRequirementFlexStepsSource,
    getRequirementHardnessSource,
    isCardPlayableNowByStaticRequirementsSource,
    pushStructuredReasonSource,
    scorePostContextChecksSource,
    'function evaluateBoardRequirements() { return null; }',
    scoreCardRequirementsSource,
    scorePositionalFactorsSource,
    getColonyBehaviorByNameSource,
    scoreSynergyRulesSource,
    'globalThis.__tm_test_getCorpBoost = getCorpBoost;',
    'globalThis.__tm_test_getCardCost = getCardCost;',
    'globalThis.__tm_test_computeCardValue = computeCardValue;',
    'globalThis.__tm_test_cardMatchesDiscountEntry = cardMatchesDiscountEntry;',
    'globalThis.__tm_test_isPlantEngineCardByFx = isPlantEngineCardByFx;',
    'globalThis.__tm_test_isMeltworksLastGenCashout = isMeltworksLastGenCashout;',
    'globalThis.__tm_test_isPreludeOrCorpCard = isPreludeOrCorpCard;',
    'globalThis.__tm_test_scoreTableauSynergy = scoreTableauSynergy;',
    'globalThis.__tm_test_getNamedRequirementDelayProfile = getNamedRequirementDelayProfile;',
    'globalThis.__tm_test_getRequirementFlexSteps = getRequirementFlexSteps;',
    'globalThis.__tm_test_scorePostContextChecks = scorePostContextChecks;',
    'globalThis.__tm_test_scoreCardRequirements = scoreCardRequirements;',
    'globalThis.__tm_test_scorePositionalFactors = scorePositionalFactors;',
    'globalThis.__tm_test_getColonyBehaviorByName = getColonyBehaviorByName;',
    'globalThis.__tm_test_scoreSynergyRules = _scoreSynergyRules;',
  ].join('\n\n'),
  sandbox,
  {filename: sourcePath}
);

const getCorpBoost = sandbox.__tm_test_getCorpBoost;
const getCardCost = sandbox.__tm_test_getCardCost;
const computeCardValue = sandbox.__tm_test_computeCardValue;
const cardMatchesDiscountEntry = sandbox.__tm_test_cardMatchesDiscountEntry;
const isPlantEngineCardByFx = sandbox.__tm_test_isPlantEngineCardByFx;
const isMeltworksLastGenCashout = sandbox.__tm_test_isMeltworksLastGenCashout;
const isPreludeOrCorpCard = sandbox.__tm_test_isPreludeOrCorpCard;
const scoreTableauSynergy = sandbox.__tm_test_scoreTableauSynergy;
const getNamedRequirementDelayProfile = sandbox.__tm_test_getNamedRequirementDelayProfile;
const getRequirementFlexSteps = sandbox.__tm_test_getRequirementFlexSteps;
const scorePostContextChecks = sandbox.__tm_test_scorePostContextChecks;
const scoreCardRequirements = sandbox.__tm_test_scoreCardRequirements;
const scorePositionalFactors = sandbox.__tm_test_scorePositionalFactors;
const getColonyBehaviorByName = sandbox.__tm_test_getColonyBehaviorByName;
const scoreSynergyRules = sandbox.__tm_test_scoreSynergyRules;

assert.strictEqual(typeof getCorpBoost, 'function', 'getCorpBoost should be exposed');
assert.strictEqual(typeof getCardCost, 'function', 'getCardCost should be exposed');
assert.strictEqual(typeof computeCardValue, 'function', 'computeCardValue should be exposed');
assert.strictEqual(typeof cardMatchesDiscountEntry, 'function', 'cardMatchesDiscountEntry should be exposed');
assert.strictEqual(typeof isPlantEngineCardByFx, 'function', 'isPlantEngineCardByFx should be exposed');
assert.strictEqual(typeof isMeltworksLastGenCashout, 'function', 'isMeltworksLastGenCashout should be exposed');
assert.strictEqual(typeof scoreTableauSynergy, 'function', 'scoreTableauSynergy should be exposed');
assert.strictEqual(typeof getRequirementFlexSteps, 'function', 'getRequirementFlexSteps should be exposed');
assert.strictEqual(typeof scorePostContextChecks, 'function', 'scorePostContextChecks should be exposed');
assert.strictEqual(typeof scoreCardRequirements, 'function', 'scoreCardRequirements should be exposed');
assert.strictEqual(typeof scorePositionalFactors, 'function', 'scorePositionalFactors should be exposed');
assert.strictEqual(typeof getColonyBehaviorByName, 'function', 'getColonyBehaviorByName should be exposed');
assert.strictEqual(typeof scoreSynergyRules, 'function', 'scoreSynergyRules should be exposed');

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

sandbox.TM_CARD_DATA['Birds'] = {requirements: [{oxygen: 13}]};
sandbox.TM_CARD_GLOBAL_REQS['Birds'] = {oxygen: {min: 13}};
sandbox.TM_CARD_DATA['Research'] = {};
sandbox.TM_CARD_DISCOUNTS['Cutting Edge Technology'] = {_req: 2};
assert.strictEqual(
  cardMatchesDiscountEntry('Birds', {_req: 2}),
  true,
  'Cutting Edge Technology-style _req discounts should match cards with requirements'
);
assert.strictEqual(
  cardMatchesDiscountEntry('Research', {_req: 2}),
  false,
  'Cutting Edge Technology-style _req discounts should not match cards without requirements'
);

const adaptationCtx = {
  gen: 9,
  gensLeft: 1,
  globalParams: {oxy: 9, temp: 8, oceans: 6, venus: 0},
  tableauNames: new Set(['Adaptation Technology']),
  tags: {},
  terraformRate: 1,
};
assert.strictEqual(
  getRequirementFlexSteps('Birds', [], adaptationCtx).any,
  2,
  'played Adaptation Technology should count as two global-requirement flex steps'
);
assert.strictEqual(
  getNamedRequirementDelayProfile('Birds', {
    globalParams: {oxy: 7},
    tableauNames: new Set(['Adaptation Technology']),
  }).penalty,
  0,
  'Birds delay profile should use the Adaptation Technology O2 11 threshold'
);
const birdsHardLockedWithoutAdaptation = scoreCardRequirements(
  null,
  Object.assign({}, adaptationCtx, {tableauNames: new Set()}),
  'Birds'
);
assert(
  birdsHardLockedWithoutAdaptation &&
  birdsHardLockedWithoutAdaptation.reasons.some((reason) => reason.includes('Req далеко oxygen')),
  'Birds at O2 9 should still be hard-locked without Adaptation Technology'
);
const birdsWithAdaptationReq = scoreCardRequirements(null, adaptationCtx, 'Birds');
assert(
  !birdsWithAdaptationReq ||
  !birdsWithAdaptationReq.reasons.some((reason) => reason.includes('Req далеко oxygen')),
  'Birds at O2 9 with Adaptation Technology should not receive the final-poke hard-lock penalty'
);

const lateCuttingEdgeLockedTarget = scorePostContextChecks(
  'Cutting Edge Technology',
  null,
  '',
  {c: 14},
  [],
  {
    gensLeft: 1,
    gen: 10,
    globalParams: {oxy: 12, temp: 0, oceans: 0, venus: 0},
    tags: {},
    prod: {plants: 0, heat: 0},
    floaterTargetCount: 0,
    floaterAccumRate: 0,
    microbeTargetCount: 0,
    microbeAccumRate: 0,
    animalTargetCount: 0,
    turmoilActive: false,
  },
  null,
  ['Cutting Edge Technology', 'Birds', 'Research']
);
assert.strictEqual(
  lateCuttingEdgeLockedTarget.bonus,
  -32,
  'Late Cutting Edge Technology should heavily penalize no playable requirement-discount targets'
);
assert(
  lateCuttingEdgeLockedTarget.reasons.some((reason) => reason.includes('CET late: req targets 0')),
  'Late Cutting Edge Technology penalty should name the playable requirement target count'
);

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

sandbox.TM_CARD_DATA['Colony Fallback'] = {};
sandbox.TM_CARD_EFFECTS['Colony Fallback'] = {colony: 1};
const colonyFallback = getColonyBehaviorByName('Colony Fallback');
assert.strictEqual(
  colonyFallback && colonyFallback.buildColony,
  1,
  'colony behavior should fall back to generated effect facts when behavior data is missing'
);

sandbox.TM_CARD_EFFECTS['St. Joseph of Cupertino Mission'] = {vpAcc: 1};
sandbox.TM_CARD_EFFECTS['Fighter Training Camp'] = {res: 'fighter'};
const fighterCompetition = scoreSynergyRules(
  'St. Joseph of Cupertino Mission',
  ['Fighter Training Camp'],
  {},
  {accumCompete: 4, synRulesCap: 10}
);
assert.strictEqual(fighterCompetition.bonus, -4, fighterCompetition);
assert(
  fighterCompetition.reasons.some((reason) => reason.includes('конкуренция fighter')),
  'St. Joseph should show fighter competition when another fighter sink exists'
);

assert(
  source.includes("if (!immediateTi && cardName === 'Asteroid Rights') immediateTi = 2;"),
  'Asteroid Rights should be treated as an immediate titanium source in hand synergy'
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

console.log('content synergy regressions: OK');
