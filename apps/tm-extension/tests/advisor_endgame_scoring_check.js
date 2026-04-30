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
  const brain = require(path.join(ROOT, relPath));
  const data = loadConst('packages/tm-data/generated/extension/card_data.js', ['TM_CARD_DATA']);
  const tags = loadConst('packages/tm-data/generated/extension/card_tags.js', ['TM_CARD_TAGS']);
  const vp = loadConst('packages/tm-data/generated/extension/card_vp.js', ['TM_CARD_VP']);
  const effects = loadConst('packages/tm-data/generated/extension/card_effects.json.js', ['TM_CARD_EFFECTS']);
  const reqs = loadConst('packages/tm-data/generated/extension/card_tag_reqs.js', ['TM_CARD_TAG_REQS', 'TM_CARD_GLOBAL_REQS']);
  brain.setCardData(tags.TM_CARD_TAGS, vp.TM_CARD_VP, data.TM_CARD_DATA, reqs.TM_CARD_GLOBAL_REQS, reqs.TM_CARD_TAG_REQS, effects.TM_CARD_EFFECTS);
  return brain;
}

function makeEndgameState(withVenusianAnimals = true) {
  const tableau = [
    {name: 'Morning Star Inc.'},
    {name: 'Extremophiles', resources: 6},
  ];
  if (withVenusianAnimals) tableau.push({name: 'Venusian Animals', resources: 7});
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
      cardsInHand: [],
      tableau,
      tags: {
        science: 13,
        microbe: 3,
        animal: 2,
        venus: 15,
        space: 7,
        earth: 8,
        power: 4,
      },
    },
  };
}

function testBrain(brain, label) {
  const state = makeEndgameState(true);
  const comet = brain.scoreCard({name: 'Comet for Venus', calculatedCost: 10, warnings: ['maxvenus']}, state);
  const bacto = brain.scoreCard({name: 'Bactoviral Research', calculatedCost: 9}, state);
  const imported = brain.scoreCard({name: 'Imported Nutrients', calculatedCost: 10}, state);
  const solarWithAnimal = brain.scoreCard({name: 'Solar Probe', calculatedCost: 8}, state);
  const solarWithoutAnimal = brain.scoreCard({name: 'Solar Probe', calculatedCost: 8}, makeEndgameState(false));

  assert(
    comet < 8,
    `${label}: maxed Venus global cards should be near-discard value, got ${comet}`,
  );
  assert(
    bacto > comet + 25,
    `${label}: Bactoviral should see large Extremophiles microbe VP payoff`,
  );
  assert(
    imported > comet + 10,
    `${label}: Imported Nutrients should value microbes on existing VP microbe cards`,
  );
  assert(
    solarWithAnimal > solarWithoutAnimal + 6,
    `${label}: science cards should credit existing Venusian Animals trigger`,
  );
}

testBrain(loadBrain('bot/tm-brain.js'), 'bot');
testBrain(loadBrain('extension/tm-brain.js'), 'extension');

console.log('advisor endgame scoring checks: OK');
