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
const isPlantEngineCardByFxSource = extractFunctionSource(source, 'isPlantEngineCardByFx');
const isMeltworksLastGenCashoutSource = extractFunctionSource(source, 'isMeltworksLastGenCashout');
const isPreludeOrCorpCardSource = extractFunctionSource(source, 'isPreludeOrCorpCard');
const formatTableauSynergyReasonSource = extractFunctionSource(source, 'formatTableauSynergyReason');
const isSpentTableauSynergySource = extractFunctionSource(source, 'isSpentTableauSynergy');
const scoreTableauSynergySource = extractFunctionSource(source, 'scoreTableauSynergy');
const getNamedRequirementDelayProfileSource = extractFunctionSource(source, 'getNamedRequirementDelayProfile');
const scorePositionalFactorsSource = extractFunctionSource(source, 'scorePositionalFactors');

const positionalScoring = new Proxy({
  drawEarlyBonus: 5,
  drawMidBonus: 2,
  drawLatePenalty: 4,
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
  TM_CARD_TAG_REQS: {},
  TM_RATINGS: {},
  TM_CORPS: {},
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
  getFx() {
    return null;
  },
};
sandbox.globalThis = sandbox;

vm.runInNewContext(
  [
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
    isPlantEngineCardByFxSource,
    isMeltworksLastGenCashoutSource,
    isPreludeOrCorpCardSource,
    formatTableauSynergyReasonSource,
    isSpentTableauSynergySource,
    scoreTableauSynergySource,
    getNamedRequirementDelayProfileSource,
    scorePositionalFactorsSource,
    'globalThis.__tm_test_getCorpBoost = getCorpBoost;',
    'globalThis.__tm_test_getCardCost = getCardCost;',
    'globalThis.__tm_test_isPlantEngineCardByFx = isPlantEngineCardByFx;',
    'globalThis.__tm_test_isMeltworksLastGenCashout = isMeltworksLastGenCashout;',
    'globalThis.__tm_test_isPreludeOrCorpCard = isPreludeOrCorpCard;',
    'globalThis.__tm_test_scoreTableauSynergy = scoreTableauSynergy;',
    'globalThis.__tm_test_getNamedRequirementDelayProfile = getNamedRequirementDelayProfile;',
    'globalThis.__tm_test_scorePositionalFactors = scorePositionalFactors;',
  ].join('\n\n'),
  sandbox,
  {filename: sourcePath}
);

const getCorpBoost = sandbox.__tm_test_getCorpBoost;
const getCardCost = sandbox.__tm_test_getCardCost;
const isPlantEngineCardByFx = sandbox.__tm_test_isPlantEngineCardByFx;
const isMeltworksLastGenCashout = sandbox.__tm_test_isMeltworksLastGenCashout;
const isPreludeOrCorpCard = sandbox.__tm_test_isPreludeOrCorpCard;
const scoreTableauSynergy = sandbox.__tm_test_scoreTableauSynergy;
const getNamedRequirementDelayProfile = sandbox.__tm_test_getNamedRequirementDelayProfile;
const scorePositionalFactors = sandbox.__tm_test_scorePositionalFactors;

assert.strictEqual(typeof getCorpBoost, 'function', 'getCorpBoost should be exposed');
assert.strictEqual(typeof getCardCost, 'function', 'getCardCost should be exposed');
assert.strictEqual(typeof isPlantEngineCardByFx, 'function', 'isPlantEngineCardByFx should be exposed');
assert.strictEqual(typeof isMeltworksLastGenCashout, 'function', 'isMeltworksLastGenCashout should be exposed');
assert.strictEqual(typeof scoreTableauSynergy, 'function', 'scoreTableauSynergy should be exposed');
assert.strictEqual(typeof scorePositionalFactors, 'function', 'scorePositionalFactors should be exposed');

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

console.log('content synergy regressions: OK');
