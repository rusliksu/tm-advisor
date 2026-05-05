#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..', '..');

const CARD_DATA = loadConst('packages/tm-data/generated/extension/card_data.js', ['TM_CARD_DATA']).TM_CARD_DATA;
const CARD_TAGS = loadConst('packages/tm-data/generated/extension/card_tags.js', ['TM_CARD_TAGS']).TM_CARD_TAGS;
const CARD_VP = loadConst('packages/tm-data/generated/extension/card_vp.js', ['TM_CARD_VP']).TM_CARD_VP;
const CARD_EFFECTS = loadConst('packages/tm-data/generated/extension/card_effects.json.js', ['TM_CARD_EFFECTS']).TM_CARD_EFFECTS;
const CARD_REQS = loadConst('packages/tm-data/generated/extension/card_tag_reqs.js', ['TM_CARD_TAG_REQS', 'TM_CARD_GLOBAL_REQS']);
const MANUAL_EV = require(path.join(ROOT, 'packages', 'tm-brain-js', 'src', 'manual-ev')).MANUAL_EV || {};

function loadConst(relPath, names) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(
    code + '\nthis.__out = {' +
      names.map((name) => `${name}: (typeof ${name} !== "undefined" ? ${name} : undefined)`).join(',') +
      '};',
    ctx,
    {filename: relPath},
  );
  return ctx.__out;
}

function loadBrain(relPath) {
  const fullPath = path.join(ROOT, relPath);
  delete require.cache[require.resolve(fullPath)];
  const brain = require(fullPath);
  brain.setCardData(CARD_TAGS, CARD_VP, CARD_DATA, CARD_REQS.TM_CARD_GLOBAL_REQS, CARD_REQS.TM_CARD_TAG_REQS, CARD_EFFECTS);
  return brain;
}

function cardWithCost(name) {
  const data = CARD_DATA[name] || {};
  const effects = CARD_EFFECTS[name] || {};
  const cost = effects.c != null ? effects.c : (data.cost || 0);
  return {name, cost, calculatedCost: cost};
}

function baseCardName(name) {
  return String(name || '').replace(/:[a-z0-9_-]+$/i, '');
}

function hasRequirementData(name) {
  const base = baseCardName(name);
  return !!(
    CARD_REQS.TM_CARD_GLOBAL_REQS[name] ||
    CARD_REQS.TM_CARD_TAG_REQS[name] ||
    CARD_REQS.TM_CARD_GLOBAL_REQS[base] ||
    CARD_REQS.TM_CARD_TAG_REQS[base]
  );
}

function hasProductionTimingEffect(name) {
  const effects = CARD_EFFECTS[name] || CARD_EFFECTS[baseCardName(name)] || {};
  return ['mp', 'sp', 'tp', 'pp', 'ep', 'hp'].some((key) => effects[key] !== undefined) ||
    effects.global !== undefined ||
    effects.ocean !== undefined ||
    effects.grn !== undefined ||
    effects.city !== undefined;
}

function categorizeScoreCardParityDiff(name) {
  if (/:ares$/i.test(String(name || ''))) return 'Ares';
  if (['Greenhouses', 'Optimal Aerobraking', 'Molecular Printing'].includes(name)) return 'named-runtime';
  if (hasRequirementData(name)) return 'requirements';
  if (MANUAL_EV[name] || MANUAL_EV[baseCardName(name)]) return 'manualEV';
  if (hasProductionTimingEffect(name)) return 'prod/timing';
  return 'unknown';
}

function formatScoreCardParityDiff(diff) {
  const category = categorizeScoreCardParityDiff(diff.name);
  const delta = typeof diff.botScore === 'number' && typeof diff.extensionScore === 'number'
    ? diff.extensionScore - diff.botScore
    : 'n/a';
  return `[${category}] ${diff.name}: bot=${diff.botScore}, extension=${diff.extensionScore}, delta=${delta}`;
}

function summarizeScoreCardParityDiffs(diffs) {
  const counts = {};
  for (const diff of diffs) {
    const category = categorizeScoreCardParityDiff(diff.name);
    counts[category] = (counts[category] || 0) + 1;
  }
  return Object.keys(counts)
    .sort()
    .map((category) => `${category}=${counts[category]}`)
    .join(', ');
}

function makeEndgameState() {
  const cardsInHand = [
    {name: 'Advanced Ecosystems', calculatedCost: 10},
    {name: 'Plantation', calculatedCost: 14},
    {name: 'Comet for Venus', calculatedCost: 10, warnings: ['maxvenus']},
    {name: 'Bactoviral Research', calculatedCost: 9},
    {name: 'Dawn City', calculatedCost: 14},
    {name: 'Magnetic Shield', calculatedCost: 23},
    {name: 'Moss', calculatedCost: 3},
  ];
  return {
    game: {
      generation: 9,
      temperature: 8,
      oxygenLevel: 14,
      oceans: 6,
      venusScaleLevel: 30,
      gameOptions: {requiresVenusTrackCompletion: false},
    },
    players: [{color: 'green'}, {color: 'red'}, {color: 'pink'}],
    thisPlayer: {
      color: 'green',
      megacredits: 119,
      megaCredits: 119,
      titanium: 12,
      titaniumProduction: 6,
      titaniumValue: 3,
      cardsInHand,
      tableau: [
        {name: 'Morning Star Inc.'},
        {name: 'Extremophiles', resources: 6},
        {name: 'Venusian Animals', resources: 7},
      ],
      tags: {
        science: 13,
        microbe: 3,
        animal: 2,
        venus: 15,
        space: 7,
        earth: 8,
        power: 4,
        plant: 2,
        building: 12,
        city: 2,
        event: 10,
      },
    },
  };
}

function makeOpeningEngineShellState() {
  const handNames = [
    'Business Network',
    'Restricted Area',
    'Sponsors',
    'Earth Office',
    'Cartel',
    'Luna Governor',
    'Luna Metropolis',
    'Venus Governor',
    'Unexpected Application',
    'Venus Waystation',
    'Gyropolis',
    'Sulphur Exports',
    'Open City',
    'Titanium Extraction Center',
    'Iron Extraction Center',
  ];
  return {
    game: {
      generation: 1,
      temperature: -30,
      oxygenLevel: 0,
      oceans: 0,
      venusScaleLevel: 0,
      gameOptions: {solarPhaseOption: true, preludeExtension: true, coloniesExtension: true},
    },
    players: [{color: 'red'}, {color: 'blue'}, {color: 'green'}],
    thisPlayer: {
      color: 'red',
      megacredits: 40,
      megaCredits: 40,
      steel: 0,
      titanium: 0,
      steelValue: 2,
      titaniumValue: 3,
      cardsInHand: handNames.map(cardWithCost),
      tableau: [],
      tags: {},
    },
  };
}

function makeMidgameParityState() {
  const handNames = [
    'Acquired Company',
    'Hi-Tech Lab',
    'Development Center',
    'Physics Complex',
    'Earth Office',
  ];
  return {
    game: {
      generation: 6,
      temperature: -6,
      oxygenLevel: 8,
      oceans: 6,
      venusScaleLevel: 12,
      gameOptions: {solarPhaseOption: true, preludeExtension: true, coloniesExtension: true},
    },
    players: [{color: 'red'}, {color: 'blue'}, {color: 'green'}],
    thisPlayer: {
      color: 'red',
      megacredits: 34,
      megaCredits: 34,
      steel: 2,
      titanium: 0,
      steelValue: 2,
      titaniumValue: 3,
      energy: 0,
      energyProduction: 0,
      cardsInHand: handNames.map(cardWithCost),
      tableau: [],
      tags: {},
    },
  };
}

function makeRushParityState() {
  const handNames = [
    'Space Port Colony',
    'Gyropolis',
    'Interstellar Colony Ship',
    'Birds',
    'Harvest',
    'Small Comet',
  ];
  return {
    game: {
      generation: 4,
      temperature: -10,
      oxygenLevel: 10,
      oceans: 5,
      venusScaleLevel: 12,
      gameOptions: {solarPhaseOption: true, preludeExtension: true, coloniesExtension: true},
      colonies: [],
    },
    players: [{color: 'red', citiesCount: 0}, {color: 'blue', citiesCount: 0}, {color: 'green', citiesCount: 0}],
    thisPlayer: {
      color: 'red',
      megacredits: 32,
      megaCredits: 32,
      steel: 0,
      titanium: 0,
      steelValue: 2,
      titaniumValue: 3,
      energy: 0,
      energyProduction: 1,
      cardsInHand: handNames.map(cardWithCost),
      tableau: [],
      tags: {space: 2, earth: 2, science: 2},
    },
  };
}

function makeBoardRuntimeParityState() {
  const handNames = [
    'Molecular Printing',
    'Optimal Aerobraking',
    'Greenhouses',
    'Mining Area:ares',
    'Commercial District:ares',
  ];
  return {
    game: {
      generation: 5,
      temperature: -6,
      oxygenLevel: 8,
      oceans: 5,
      venusScaleLevel: 10,
      gameOptions: {solarPhaseOption: true, preludeExtension: true, coloniesExtension: true, aresExtension: true},
      colonies: [
        {name: 'Luna', colonies: ['red', 'blue']},
        {name: 'Ceres', colonies: ['green']},
      ],
    },
    players: [
      {color: 'red', citiesCount: 2},
      {color: 'blue', citiesCount: 3},
      {color: 'green', citiesCount: 1},
    ],
    thisPlayer: {
      color: 'red',
      megacredits: 46,
      megaCredits: 46,
      steel: 2,
      titanium: 1,
      steelValue: 2,
      titaniumValue: 3,
      energy: 0,
      energyProduction: 1,
      cardsInHand: handNames.map(cardWithCost),
      tableau: [],
      tags: {space: 2, earth: 1, building: 3, plant: 1},
    },
  };
}

function assertParityForCards(cardNames, state, message) {
  delete global.TM_BRAIN_CORE;
  delete global.TM_RATINGS;
  const bot = loadBrain('bot/tm-brain.js');
  const extension = loadBrain('extension/tm-brain.js');

  for (const name of cardNames) {
    const card = cardWithCost(name);
    const botScore = bot.scoreCard(card, state);
    const extensionScore = extension.scoreCard(card, state);
    assert.strictEqual(
      extensionScore,
      botScore,
      `${message}: ${name} should score identically in bot and extension brain`,
    );
  }
}

function projectCardNames() {
  return Object.keys(CARD_DATA)
    .filter((name) => {
      const data = CARD_DATA[name] || {};
      const type = String(data.cardType || data.card_type || data.type || '').toLowerCase();
      return type !== 'corporation' && type !== 'corp';
    });
}

function assertParityForAllProjectCards(state, message) {
  delete global.TM_BRAIN_CORE;
  delete global.TM_RATINGS;
  const bot = loadBrain('bot/tm-brain.js');
  const extension = loadBrain('extension/tm-brain.js');

  const diffs = [];
  for (const name of projectCardNames()) {
    const card = cardWithCost(name);
    const botScore = bot.scoreCard(card, state);
    const extensionScore = extension.scoreCard(card, state);
    if (extensionScore !== botScore) {
      diffs.push({name, botScore, extensionScore});
    }
  }

  assert.strictEqual(
    diffs.length,
    0,
    `${message}: bot and extension scoreCard diverged` +
      `\nCategories: ${summarizeScoreCardParityDiffs(diffs)}` +
      `\n${diffs.slice(0, 20).map(formatScoreCardParityDiff).join('\n')}`,
  );
}

function testScoreCardParityOnMidgameSharedPolicy() {
  assertParityForCards(
    [
      'Acquired Company',
      'Hi-Tech Lab',
      'Physics Complex',
    ],
    makeMidgameParityState(),
    'midgame shared policy parity',
  );
}

function testScoreCardParityOnEndgameDiscardHand() {
  delete global.TM_BRAIN_CORE;
  delete global.TM_RATINGS;
  const bot = loadBrain('bot/tm-brain.js');
  const extension = loadBrain('extension/tm-brain.js');
  const state = makeEndgameState();

  for (const card of state.thisPlayer.cardsInHand) {
    const botScore = bot.scoreCard(card, state);
    const extensionScore = extension.scoreCard(card, state);
    assert.strictEqual(
      extensionScore,
      botScore,
      `${card.name} should score identically in bot and extension brain`,
    );
  }
}

function testScoreCardParityOnOpeningEngineShell() {
  assertParityForCards(
    [
      'Sponsors',
      'Earth Office',
      'Cartel',
      'Luna Governor',
      'Venus Governor',
      'Venus Waystation',
      'Gyropolis',
      'Open City',
      'Titanium Extraction Center',
      'Iron Extraction Center',
    ],
    makeOpeningEngineShellState(),
    'opening engine shell parity',
  );
}

function testScoreCardParityForAllProjectCards() {
  assertParityForAllProjectCards(makeOpeningEngineShellState(), 'opening engine exhaustive parity');
  assertParityForAllProjectCards(makeMidgameParityState(), 'midgame exhaustive parity');
  assertParityForAllProjectCards(makeRushParityState(), 'rush exhaustive parity');
  assertParityForAllProjectCards(makeEndgameState(), 'endgame exhaustive parity');
  assertParityForAllProjectCards(makeBoardRuntimeParityState(), 'board runtime exhaustive parity');
}

function testScoreCardParityDiffCategories() {
  assert.strictEqual(categorizeScoreCardParityDiff('Mining Area:ares'), 'Ares');
  assert.strictEqual(categorizeScoreCardParityDiff('Molecular Printing'), 'named-runtime');
  assert.strictEqual(categorizeScoreCardParityDiff('Martian Rails'), 'manualEV');
  assert.strictEqual(categorizeScoreCardParityDiff('Warp Drive'), 'requirements');
  assert.strictEqual(categorizeScoreCardParityDiff('Acquired Company'), 'prod/timing');
  assert.strictEqual(
    formatScoreCardParityDiff({
      name: 'Mining Area:ares',
      botScore: 12,
      extensionScore: 15,
    }),
    '[Ares] Mining Area:ares: bot=12, extension=15, delta=3',
  );
}

function testGeneratedDawnCityEffectsAreFactual() {
  assert.strictEqual(CARD_EFFECTS['Dawn City'].mp, undefined, 'Dawn City should not expose fake +3 MC production');
  assert.strictEqual(CARD_EFFECTS['Dawn City'].ep, -1);
  assert.strictEqual(CARD_EFFECTS['Dawn City'].tp, 1);
  assert.strictEqual(CARD_EFFECTS['Dawn City'].vp, 3);
}

function normalizeManualEV(manualEV) {
  return Object.fromEntries(
    Object.entries(manualEV || {})
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function testManualEVParity() {
  delete global.TM_BRAIN_CORE;
  delete global.TM_RATINGS;
  const bot = loadBrain('bot/tm-brain.js');
  const extension = loadBrain('extension/tm-brain.js');

  assert.deepStrictEqual(
    normalizeManualEV(bot.MANUAL_EV),
    normalizeManualEV(extension.MANUAL_EV),
    'bot and extension MANUAL_EV should stay in parity until it is fully extracted to shared core',
  );
}

testScoreCardParityOnEndgameDiscardHand();
testScoreCardParityOnOpeningEngineShell();
testScoreCardParityOnMidgameSharedPolicy();
testScoreCardParityDiffCategories();
testGeneratedDawnCityEffectsAreFactual();
testScoreCardParityForAllProjectCards();
testManualEVParity();

console.log('brain scorecard parity checks: OK');
