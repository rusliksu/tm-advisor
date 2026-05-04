#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..', '..');

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
  if (relPath.startsWith('extension/')) {
    const sharedPath = path.join(ROOT, 'extension', 'shared', 'brain-core.js');
    delete require.cache[require.resolve(sharedPath)];
    global.TM_BRAIN_CORE = require(sharedPath);
  }
  const brain = require(fullPath);
  const data = loadConst('packages/tm-data/generated/extension/card_data.js', ['TM_CARD_DATA']);
  const tags = loadConst('packages/tm-data/generated/extension/card_tags.js', ['TM_CARD_TAGS']);
  const vp = loadConst('packages/tm-data/generated/extension/card_vp.js', ['TM_CARD_VP']);
  const effects = loadConst('packages/tm-data/generated/extension/card_effects.json.js', ['TM_CARD_EFFECTS']);
  const reqs = loadConst('packages/tm-data/generated/extension/card_tag_reqs.js', ['TM_CARD_TAG_REQS', 'TM_CARD_GLOBAL_REQS']);
  brain.setCardData(tags.TM_CARD_TAGS, vp.TM_CARD_VP, data.TM_CARD_DATA, reqs.TM_CARD_GLOBAL_REQS, reqs.TM_CARD_TAG_REQS, effects.TM_CARD_EFFECTS);
  return brain;
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

const KNOWN_SCORECARD_DELTAS = {
  'Advanced Ecosystems': 6,
  Plantation: 3,
  'Comet for Venus': 0,
  'Bactoviral Research': 0,
  'Dawn City': -1,
  'Magnetic Shield': 5,
  Moss: 0,
};

function testScoreCardParityOrKnownDebtOnEndgameDiscardHand() {
  delete global.TM_BRAIN_CORE;
  delete global.TM_RATINGS;
  const bot = loadBrain('bot/tm-brain.js');
  const extension = loadBrain('extension/tm-brain.js');
  const state = makeEndgameState();

  for (const card of state.thisPlayer.cardsInHand) {
    const botScore = bot.scoreCard(card, state);
    const extensionScore = extension.scoreCard(card, state);
    const delta = extensionScore - botScore;
    const expectedDelta = KNOWN_SCORECARD_DELTAS[card.name];
    assert.notStrictEqual(expectedDelta, undefined, `${card.name} must declare its expected scorecard drift`);
    assert(
      delta === 0 || delta === expectedDelta,
      `${card.name} unexpected scorecard drift: bot=${botScore}, extension=${extensionScore}, ` +
        `delta=${delta}, expected 0 or ${expectedDelta}`,
    );
  }
}

const REPRESENTATIVE_MANUAL_EV = [
  'Advanced Alloys',
  'AI Central',
  'Bactoviral Research',
  'Olympus Conference',
  'Venusian Animals',
];

function testRepresentativeManualEVParity() {
  delete global.TM_BRAIN_CORE;
  delete global.TM_RATINGS;
  const bot = loadBrain('bot/tm-brain.js');
  const extension = loadBrain('extension/tm-brain.js');

  for (const cardName of REPRESENTATIVE_MANUAL_EV) {
    assert.deepStrictEqual(
      extension.MANUAL_EV && extension.MANUAL_EV[cardName],
      bot.MANUAL_EV && bot.MANUAL_EV[cardName],
      `${cardName} representative MANUAL_EV should stay in parity`,
    );
  }
}

function makeRuntimeAdjustmentState(overrides = {}) {
  return Object.assign({
    _botName: 'Beta',
    game: {
      generation: 8,
      temperature: 0,
      oxygenLevel: 12,
      oceans: 7,
      venusScaleLevel: 20,
      gameOptions: {},
    },
    players: [{color: 'red'}, {color: 'blue'}, {color: 'green'}],
    thisPlayer: {
      color: 'red',
      megacredits: 40,
      megaCredits: 40,
      steel: 0,
      steelValue: 2,
      steelProduction: 0,
      titanium: 0,
      titaniumValue: 3,
      cardsInHand: [],
      tableau: [],
      tags: {building: 0, city: 0, plant: 0, power: 0, space: 0, science: 0},
    },
  }, overrides);
}

function testRuntimeAdjustmentBehavior() {
  delete global.TM_BRAIN_CORE;
  delete global.TM_RATINGS;
  const bot = loadBrain('bot/tm-brain.js');
  const extension = loadBrain('extension/tm-brain.js');

  const lateNoSteel = makeRuntimeAdjustmentState();
  const botFieldLate = bot.scoreCard({name: 'Field-Capped City', calculatedCost: 29}, lateNoSteel);
  const extFieldLate = extension.scoreCard({name: 'Field-Capped City', calculatedCost: 29}, lateNoSteel);
  const botResearchLate = bot.scoreCard({name: 'Research Colony', calculatedCost: 20}, lateNoSteel);
  const extResearchLate = extension.scoreCard({name: 'Research Colony', calculatedCost: 20}, lateNoSteel);
  assert(botFieldLate < botResearchLate, 'bot should not prefer late no-steel Field-Capped City over Research Colony');
  assert(extFieldLate < extResearchLate, 'extension should not prefer late no-steel Field-Capped City over Research Colony');

  const steelState = makeRuntimeAdjustmentState({
    game: {generation: 5, temperature: -10, oxygenLevel: 6, oceans: 4, venusScaleLevel: 12, gameOptions: {}},
    thisPlayer: {
      color: 'red',
      megacredits: 40,
      megaCredits: 40,
      steel: 12,
      steelValue: 2,
      steelProduction: 4,
      titanium: 0,
      titaniumValue: 3,
      cardsInHand: [],
      tableau: [{name: 'Mining Guild'}],
      tags: {building: 4, city: 1, plant: 1, power: 1, space: 0, science: 0},
    },
  });
  assert(
    bot.scoreCard({name: 'Field-Capped City', calculatedCost: 29}, steelState) > botFieldLate + 25,
    'bot should still keep Field-Capped City strong as an excess-steel outlet'
  );
  assert(
    extension.scoreCard({name: 'Field-Capped City', calculatedCost: 29}, steelState) > extFieldLate + 25,
    'extension should still keep Field-Capped City strong as an excess-steel outlet'
  );

  const blockedIce = makeRuntimeAdjustmentState({
    game: {
      generation: 9,
      temperature: 6,
      oxygenLevel: 14,
      oceans: 9,
      venusScaleLevel: 30,
      gameOptions: {},
      colonies: [
        {name: 'Luna', colonies: ['red', 'blue', 'green']},
        {name: 'Ceres', colonies: ['red', 'blue', 'green']},
        {name: 'Pluto', colonies: ['red', 'blue', 'green']},
      ],
    },
    thisPlayer: {
      color: 'red',
      megacredits: 40,
      megaCredits: 40,
      steel: 0,
      steelValue: 2,
      titanium: 0,
      titaniumValue: 3,
      cardsInHand: [],
      tableau: [],
      tags: {space: 2, science: 1},
    },
  });
  assert.strictEqual(
    extension.scoreCard({name: 'Ice Moon Colony', calculatedCost: 23}, blockedIce),
    bot.scoreCard({name: 'Ice Moon Colony', calculatedCost: 23}, blockedIce),
    'Ice Moon Colony runtime penalty should be shared exactly'
  );
  assert(
    bot.scoreCard({name: 'Ice Moon Colony', calculatedCost: 23}, blockedIce) < -40,
    'Ice Moon Colony should be heavily penalized when oceans and colony slots are closed'
  );
}

testScoreCardParityOrKnownDebtOnEndgameDiscardHand();
testRepresentativeManualEVParity();
testRuntimeAdjustmentBehavior();

console.log('brain scorecard parity/debt checks: OK');
