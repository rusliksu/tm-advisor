#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

const SMARTBOT = require(path.resolve(__dirname, '..', '..', '..', 'bot', 'smartbot'));

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

function buildInitialDraftWorkflow(corpNames, preludeNames, projectNames) {
  return {
    type: 'initialCards',
    options: [
      {
        type: 'card',
        title: 'Corporation cards',
        min: 1,
        max: 1,
        cards: corpNames.map((name) => ({name, cost: 0, calculatedCost: 0})),
      },
      {
        type: 'card',
        title: 'Prelude cards',
        min: 1,
        max: 1,
        cards: preludeNames.map((name) => ({name, cost: 0, calculatedCost: 0})),
      },
      {
        type: 'card',
        title: 'Buy initial cards',
        min: 0,
        max: projectNames.length,
        cards: projectNames.map((name) => ({name, cost: 0, calculatedCost: 0})),
      },
    ],
  };
}

function buildOpeningDraftState(colonies) {
  return {
    thisPlayer: {
      color: 'red',
      megaCredits: 21,
      megacredits: 21,
      tableau: [],
      cardsInHand: [],
    },
    players: [{color: 'red'}, {color: 'blue'}, {color: 'green'}],
    game: {
      generation: 1,
      oxygenLevel: 0,
      temperature: -30,
      oceans: 0,
      venusScaleLevel: 0,
      colonies: colonies.map((name) => ({name})),
    },
  };
}

function getCorpPickFromInitialDraft(input) {
  assert.strictEqual(input.type, 'initialCards');
  assert.ok(Array.isArray(input.responses));
  assert.ok(input.responses[0]);
  assert.strictEqual(input.responses[0].type, 'card');
  assert.ok(Array.isArray(input.responses[0].cards));
  assert.ok(input.responses[0].cards[0], 'expected a corporation pick in the first initialCards response');
  return input.responses[0].cards[0];
}

function testOpeningDraftPrefersIcEventShell() {
  const wf = buildInitialDraftWorkflow(
    ['Interplanetary Cinematics', 'Splice', 'Arklight'],
    ['Experimental Forest'],
    ['Optimal Aerobraking', 'Media Group', 'Comet', 'Decomposers']
  );
  const state = buildOpeningDraftState(['Triton']);

  const input = SMARTBOT.handleInput(wf, state);

  assert.strictEqual(getCorpPickFromInitialDraft(input), 'Interplanetary Cinematics');
}

function testOpeningDraftPrefersSpliceDenseMicrobeShell() {
  const wf = buildInitialDraftWorkflow(
    ['Interplanetary Cinematics', 'Splice', 'Arklight'],
    ['Soil Bacteria'],
    ['Decomposers', 'Vermin', 'Symbiotic Fungus', 'Topsoil Contract']
  );
  const state = buildOpeningDraftState(['Enceladus']);

  const input = SMARTBOT.handleInput(wf, state);

  assert.strictEqual(getCorpPickFromInitialDraft(input), 'Splice');
}

function testOpeningDraftKeepsIcAheadWhenSpliceOnlyHasLoneDecomposers() {
  const wf = buildInitialDraftWorkflow(
    ['Interplanetary Cinematics', 'Splice', 'Arklight'],
    ['Experimental Forest'],
    ['Optimal Aerobraking', 'Decomposers', 'Floater Prototypes']
  );
  const state = buildOpeningDraftState(['Enceladus', 'Triton']);

  const input = SMARTBOT.handleInput(wf, state);

  assert.strictEqual(getCorpPickFromInitialDraft(input), 'Interplanetary Cinematics');
}

function testPristarBoostPrefersEngineShellOverTerraforming() {
  assert.ok(SMARTBOT.corpCardBoost('Research Network', 'Pristar') > 0);
  assert.ok(SMARTBOT.corpCardBoost('Comet', 'Pristar') < 0);
  assert.ok(
    SMARTBOT.corpCardBoost('Research Network', 'Pristar') >
      SMARTBOT.corpCardBoost('Comet', 'Pristar')
  );
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
    type: 'and',
    options: [
      {type: 'city'},
      {type: 'greenery'},
      {type: 'increaseOxygen'},
      {type: 'increaseTemperature'},
      {type: 'placeOceanTile'},
    ],
  };
  const state = {
    thisPlayer: {megacredits: 100, plants: 0, heat: 0, tableau: [], cardsInHand: []},
    players: [],
    game: {
      generation: 8,
      oxygenLevel: 14,
      temperature: 8,
      oceans: 9,
      venusScaleLevel: 12,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.ok(input);
  assert.notStrictEqual(input.type, 'increaseOxygen');
  assert.notStrictEqual(input.type, 'increaseTemperature');
  assert.notStrictEqual(input.type, 'placeOceanTile');
}

function testStandardProjectPrioritizesOpenAsteroid() {
  const wf = {
    type: 'and',
    options: [
      {type: 'increaseTemperature'},
      {type: 'greenery'},
      {type: 'city'},
    ],
  };
  const state = {
    thisPlayer: {megacredits: 100, plants: 0, heat: 0, tableau: [], cardsInHand: []},
    players: [],
    game: {
      generation: 8,
      oxygenLevel: 10,
      temperature: 0,
      oceans: 8,
      venusScaleLevel: 14,
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'and');
  assert.ok(Array.isArray(input.responses));
  assert.strictEqual(input.responses.length, 3);
  assert.ok(input.responses.every((response) => response && response.type === 'option'));
}

function testBlueActionIgnoresDisabledHigherEvOption() {
  const wf = {
    type: 'or',
    title: 'Choose action',
    options: [
      {title: 'Disabled high EV', disabled: true, type: 'card'},
      {title: 'Enabled lower EV', type: 'pass'},
    ],
  };
  const state = {
    thisPlayer: {megacredits: 20, tableau: [], cardsInHand: []},
    players: [],
    game: {generation: 6, oxygenLevel: 6, temperature: -2, oceans: 5, venusScaleLevel: 10},
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.ok(input);
  assert.notStrictEqual(input.index, 0);
}

function testTradePaymentPrefersEnergyInNestedOr() {
  const wf = {
    type: 'or',
    title: 'Choose payment',
    options: [
      {
        type: 'and',
        andOptions: [
          {type: 'resource', resource: 'megaCredits', amount: 10},
        ],
      },
      {
        type: 'and',
        andOptions: [
          {type: 'resource', resource: 'energy', amount: 3},
        ],
      },
    ],
  };
  const state = {
    thisPlayer: {megacredits: 20, energy: 3, tableau: [], cardsInHand: []},
    players: [],
    game: {generation: 5, oxygenLevel: 5, temperature: -8, oceans: 4, venusScaleLevel: 10},
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testNestedOrSelectsStandardProjectBranch() {
  const wf = {
    type: 'or',
    options: [
      {title: 'Do nothing', type: 'pass'},
      {
        title: 'Standard project',
        type: 'and',
        andOptions: [{type: 'increaseTemperature'}],
      },
    ],
  };
  const state = {
    thisPlayer: {megacredits: 30, tableau: [], cardsInHand: []},
    players: [],
    game: {generation: 9, oxygenLevel: 10, temperature: 0, oceans: 8, venusScaleLevel: 14},
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'or');
  assert.strictEqual(input.index, 1);
}

function testAndAmountRespectsMixedExchangeRates() {
  const wf = {
    type: 'and',
    options: [
      {type: 'amount', amount: 4, title: 'Pay 4'},
    ],
  };
  const state = {
    thisPlayer: {megacredits: 2, steel: 1, titanium: 0, tableau: [], cardsInHand: []},
    players: [],
    game: {generation: 5, oxygenLevel: 6, temperature: -10, oceans: 4, venusScaleLevel: 10},
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'and');
  assert.ok(Array.isArray(input.responses));
  assert.strictEqual(input.responses.length, 1);
  assert.strictEqual(input.responses[0].type, 'amount');
}

function testAresGlobalParametersReturnsValidPayload() {
  const wf = {
    type: 'aresGlobalParameters',
    title: 'Raise two parameters',
    optional: false,
    data: {
      current: {
        temperatureDelta: 0,
        oxygenDelta: 0,
        lowOceanDelta: 0,
        highOceanDelta: 0,
      },
      max: {
        temperatureDelta: 1,
        oxygenDelta: 1,
        lowOceanDelta: 1,
        highOceanDelta: 1,
      },
      payment: {
        temperatureDelta: 14,
        oxygenDelta: 14,
        lowOceanDelta: 16,
        highOceanDelta: 16,
      },
    },
  };
  const state = {
    thisPlayer: {
      megacredits: 30,
      tableau: [],
      cardsInHand: [],
    },
    players: [],
    game: {
      generation: 10,
      oxygenLevel: 13,
      temperature: 6,
      oceans: 8,
      venusScaleLevel: 12,
      gameOptions: {
        aresExtension: true,
      },
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'aresGlobalParameters');
  assert.strictEqual(input.response.lowOceanDelta, 0);
  assert.strictEqual(input.response.highOceanDelta, 0);
  assert.ok(
    (input.response.temperatureDelta === 1 && input.response.oxygenDelta === 0) ||
    (input.response.temperatureDelta === 0 && input.response.oxygenDelta === 1),
    'expected exactly one reachable global parameter to be raised',
  );
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

function testAwardFundingBranchDoesNotUseStepsBeforeInit() {
  const wf = {
    type: 'or',
    title: 'Fund an award',
    options: [
      {title: 'Banker'},
      {title: 'Thermalist'},
      {title: 'Do nothing'},
    ],
  };
  const state = {
    thisPlayer: {
      color: 'red',
      megacredits: 24,
      heat: 4,
      plants: 2,
      tableau: [],
      tags: {science: 2, venus: 1},
      terraformRating: 28,
      megacreditProduction: 3,
      steelProduction: 1,
      titaniumProduction: 0,
      citiesCount: 1,
    },
    players: [
      {color: 'red', megacreditProduction: 3, heat: 4, energy: 2, heatProduction: 2, steel: 1, titanium: 0, steelProduction: 1, titaniumProduction: 0, tags: {science: 2, venus: 1}, citiesCount: 1},
      {color: 'blue', megacreditProduction: 1, heat: 2, energy: 1, heatProduction: 1, steel: 0, titanium: 0, steelProduction: 0, titaniumProduction: 0, tags: {science: 1}, citiesCount: 0},
      {color: 'green', megacreditProduction: 2, heat: 3, energy: 0, heatProduction: 1, steel: 0, titanium: 1, steelProduction: 0, titaniumProduction: 1, tags: {venus: 2}, citiesCount: 0},
    ],
    game: {
      generation: 8,
      oxygenLevel: 9,
      temperature: 0,
      oceans: 6,
      venusScaleLevel: 18,
      fundedAwards: [],
      awards: [
        {
          name: 'Banker',
          scores: [
            {color: 'red', score: 3},
            {color: 'blue', score: 1},
            {color: 'green', score: 2},
          ],
        },
        {
          name: 'Thermalist',
          scores: [
            {color: 'red', score: 8},
            {color: 'blue', score: 3},
            {color: 'green', score: 4},
          ],
        },
      ],
    },
  };

  const input = SMARTBOT.handleInput(wf, state);
  assert.strictEqual(input.type, 'or');
  assert.ok(typeof input.index === 'number');
}

function run() {
  testProductionToLoseUsesPayProductionCost();
  testInitialCardsStillHonorRequiredMinimum();
  testOpeningDraftPrefersIcEventShell();
  testOpeningDraftPrefersSpliceDenseMicrobeShell();
  testOpeningDraftKeepsIcAheadWhenSpliceOnlyHasLoneDecomposers();
  testPristarBoostPrefersEngineShellOverTerraforming();
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
  testAwardFundingBranchDoesNotUseStepsBeforeInit();
  console.log('smartbot regression checks: OK');
}

module.exports = {run};

if (require.main === module) {
  run();
}
