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
testManualEVParity();

console.log('brain scorecard parity checks: OK');
