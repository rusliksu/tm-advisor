#!/usr/bin/env node
'use strict';

const assert = require('assert');
const SMARTBOT = require('../bot/smartbot');

function testProductionToLoseUsesPayProductionCost() {
  const wf = {
    type: 'productionToLose',
    title: 'Lose production',
    payProduction: {
      cost: 5,
      units: {
        megacredits: 0,
        steel: 0,
        titanium: 0,
        plants: 0,
        energy: 2,
        heat: 3,
      },
    },
  };
  const state = {
    thisPlayer: {
      megacreditProduction: -3,
      steelProduction: 1,
      titaniumProduction: 1,
      plantProduction: 0,
      energyProduction: 2,
      heatProduction: 3,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);

  assert.deepStrictEqual(input, {
    type: 'productionToLose',
    units: {
      megacredits: 0,
      steel: 0,
      titanium: 0,
      plants: 0,
      energy: 2,
      heat: 3,
    },
  });
}

function testInitialCardsStillHonorRequiredMinimum() {
  const wf = {
    type: 'initialCards',
    options: [{
      type: 'card',
      title: 'Buy initial cards',
      min: 2,
      max: 4,
      cards: [
        {name: 'Comet', cost: 21},
        {name: 'Asteroid', cost: 14},
        {name: 'Trees', cost: 13},
      ],
    }],
  };
  const state = {
    thisPlayer: {
      megaCredits: 0,
      tableau: [],
    },
    players: [],
    game: {
      generation: 1,
      oxygenLevel: 0,
      temperature: -30,
      oceans: 0,
      venusScaleLevel: 0,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'initialCards');
  assert.strictEqual(input.responses.length, 1);
  assert.strictEqual(input.responses[0].type, 'card');
  assert.ok(input.responses[0].cards.length >= 2, 'required minimum pick count must be preserved');
}

function testForcedSellFallsBackWhenAllCardsHaveVpPotential() {
  const wf = {
    type: 'card',
    title: 'Sell patents',
    min: 1,
    max: 1,
    cards: [
      {name: 'Trees', cost: 13},
      {name: 'Ganymede Colony', cost: 20},
    ],
  };
  const state = {
    thisPlayer: {
      megacredits: 5,
      tableau: [],
      cardsInHand: [],
    },
    players: [],
    game: {
      generation: 10,
      oxygenLevel: 10,
      temperature: 0,
      oceans: 7,
      venusScaleLevel: 12,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'card');
  assert.strictEqual(input.cards.length, 1, 'forced sell must still choose a card');
  assert.ok(['Trees', 'Ganymede Colony'].includes(input.cards[0]));
}

function testDiscardHonorsRequiredCount() {
  const wf = {
    type: 'card',
    title: 'Discard cards',
    min: 2,
    max: 2,
    cards: [
      {name: 'Comet', cost: 21},
      {name: 'Asteroid', cost: 14},
      {name: 'Trees', cost: 13},
    ],
  };
  const state = {
    thisPlayer: {
      megacredits: 20,
      tableau: [],
      cardsInHand: [],
    },
    players: [],
    game: {
      generation: 4,
      oxygenLevel: 4,
      temperature: -16,
      oceans: 2,
      venusScaleLevel: 6,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'card');
  assert.strictEqual(input.cards.length, 2, 'discard should satisfy required minimum count');
}

function testStandardProjectSkipsClosedGlobals() {
  const wf = {
    type: 'card',
    title: 'Standard project',
    cards: [
      {name: 'Standard Project Asteroid'},
      {name: 'Standard Project Aquifer'},
      {name: 'Standard Project Greenery'},
      {name: 'Standard Project City'},
      {name: 'Standard Project Air Scrapping'},
    ],
  };
  const state = {
    thisPlayer: {
      megacredits: 14,
      tableau: [],
      citiesCount: 0,
    },
    players: [{ color: 'red' }, { color: 'blue' }, { color: 'green' }],
    game: {
      generation: 8,
      oxygenLevel: 14,
      temperature: 8,
      oceans: 9,
      venusScaleLevel: 30,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.deepStrictEqual(input, { type: 'card', cards: [] });
}

function testStandardProjectPrioritizesOpenAsteroid() {
  const wf = {
    type: 'card',
    title: 'Standard project',
    cards: [
      {name: 'Standard Project Greenery'},
      {name: 'Standard Project Aquifer'},
      {name: 'Standard Project Asteroid'},
    ],
  };
  const state = {
    thisPlayer: {
      megacredits: 30,
      tableau: [],
      citiesCount: 0,
    },
    players: [{ color: 'red' }, { color: 'blue' }, { color: 'green' }],
    game: {
      generation: 5,
      oxygenLevel: 10,
      temperature: 0,
      oceans: 5,
      venusScaleLevel: 12,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.deepStrictEqual(input, { type: 'card', cards: ['Standard Project Asteroid'] });
}

function testBlueActionIgnoresDisabledHigherEvOption() {
  const wf = {
    type: 'card',
    title: 'Choose blue action',
    selectBlueCardAction: true,
    cards: [
      {name: 'Birds', resources: 3, isDisabled: true},
      {name: 'Some Enabled Action', isDisabled: false},
    ],
  };
  const state = {
    thisPlayer: {
      megacredits: 20,
      tableau: [],
      cardsInHand: [],
    },
    players: [{ color: 'red' }, { color: 'blue' }, { color: 'green' }],
    game: {
      generation: 9,
      oxygenLevel: 10,
      temperature: 2,
      oceans: 7,
      venusScaleLevel: 12,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.deepStrictEqual(input, { type: 'card', cards: ['Some Enabled Action'] });
}

function testTradePaymentPrefersEnergyInNestedOr() {
  const wf = {
    type: 'or',
    title: 'Trade payment',
    options: [
      { type: 'resource', title: 'Pay 3 energy', include: ['energy'] },
      { type: 'resource', title: 'Pay 3 titanium', include: ['titanium'] },
      { type: 'resource', title: 'Pay 9 M€', include: ['megacredits'] },
    ],
  };
  const state = {
    thisPlayer: {
      megacredits: 20,
      energy: 3,
      titanium: 5,
      tableau: [],
      cardsInHand: [],
    },
    players: [],
    game: {
      generation: 6,
      oxygenLevel: 8,
      temperature: -4,
      oceans: 5,
      venusScaleLevel: 10,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 0);
  assert.deepStrictEqual(input.response, { type: 'resource', resource: 'energy' });
}

function testNestedOrSelectsStandardProjectBranch() {
  const wf = {
    type: 'or',
    title: 'Choose action',
    options: [
      { type: 'option', title: 'Pass for now' },
      {
        type: 'card',
        title: 'Standard project',
        cards: [
          {name: 'Standard Project Greenery'},
          {name: 'Standard Project Asteroid'},
        ],
      },
    ],
  };
  const state = {
    thisPlayer: {
      megacredits: 25,
      tableau: [],
      citiesCount: 0,
    },
    players: [{ color: 'red' }, { color: 'blue' }, { color: 'green' }],
    game: {
      generation: 5,
      oxygenLevel: 9,
      temperature: 0,
      oceans: 5,
      venusScaleLevel: 8,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
  assert.deepStrictEqual(input.response, { type: 'card', cards: ['Standard Project Asteroid'] });
}

function testAndAmountRespectsMixedExchangeRates() {
  const wf = {
    type: 'and',
    title: { data: [{ value: '5' }] },
    options: [
      { type: 'amount', title: '2 heat each', max: 3 },
      { type: 'amount', title: '1 heat each', max: 5 },
    ],
  };

  const input = SMARTBOT.handleInput(wf, {});
  assert.deepStrictEqual(input, {
    type: 'and',
    responses: [
      { type: 'amount', amount: 2 },
      { type: 'amount', amount: 1 },
    ],
  });
}

function testAresGlobalParametersReturnsValidPayload() {
  const wf = {
    type: 'aresGlobalParameters',
    aresData: {
      hazardData: {
        temperatureDelta: 0,
        oxygenDelta: 0,
        lowOceanDelta: 0,
        highOceanDelta: 0,
      },
    },
  };
  const state = {
    thisPlayer: {
      color: 'red',
      heatProduction: 5,
      plantProduction: 0,
      energyProduction: 1,
      tableau: [],
    },
    players: [
      { color: 'red', victoryPointsBreakdown: { total: 30 } },
      { color: 'blue', heatProduction: 1, plantProduction: 4, victoryPointsBreakdown: { total: 32 } },
      { color: 'green', heatProduction: 2, plantProduction: 1, victoryPointsBreakdown: { total: 31 } },
    ],
    game: {
      generation: 8,
      temperature: -2,
      oxygenLevel: 8,
      oceans: 5,
      aresData: {
        hazardData: {
          temperatureDelta: 0,
          oxygenDelta: 0,
          lowOceanDelta: 0,
          highOceanDelta: 0,
        },
      },
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'aresGlobalParameters');
  assert.deepStrictEqual(input.response, {
    lowOceanDelta: 0,
    highOceanDelta: 0,
    temperatureDelta: 1,
    oxygenDelta: 0,
  });
}

function testClaimedUndergroundTokenReturnsSelectedIndexes() {
  const wf = {
    type: 'claimedUndergroundToken',
    title: 'Select a token to discard',
    min: 1,
    max: 1,
    tokens: [
      {token: 'plant'},
      {token: 'steel'},
    ],
  };

  const input = SMARTBOT.handleInput(wf, {});
  assert.deepStrictEqual(input, {
    type: 'claimedUndergroundToken',
    selected: [0],
  });
}

function run() {
  testProductionToLoseUsesPayProductionCost();
  testInitialCardsStillHonorRequiredMinimum();
  testForcedSellFallsBackWhenAllCardsHaveVpPotential();
  testDiscardHonorsRequiredCount();
  testStandardProjectSkipsClosedGlobals();
  testStandardProjectPrioritizesOpenAsteroid();
  testBlueActionIgnoresDisabledHigherEvOption();
  testTradePaymentPrefersEnergyInNestedOr();
  testNestedOrSelectsStandardProjectBranch();
  testAndAmountRespectsMixedExchangeRates();
  testAresGlobalParametersReturnsValidPayload();
  testClaimedUndergroundTokenReturnsSelectedIndexes();
  console.log('smartbot regression checks: OK');
}

run();
