#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

delete global.TM_CONTENT_GAME_SIGNALS;
require(path.resolve(__dirname, '..', 'src', 'content-game-signals.js'));

const signals = global.TM_CONTENT_GAME_SIGNALS;
assert(signals, 'TM_CONTENT_GAME_SIGNALS should be loaded');
assert.strictEqual(typeof signals.computeGameSignals, 'function', 'computeGameSignals should be exported');

function makeState(overrides = {}) {
  return Object.assign({
    game: {
      phase: 'action',
      generation: 8,
      temperature: 2,
      oxygenLevel: 13,
      oceans: 8,
      turmoil: {
        coming: {
          name: 'Corrosive Rain',
          description: 'All players lose all heat.',
        },
      },
      awards: [
        {
          name: 'Thermalist',
          scores: [
            {color: 'hydro', score: 26},
            {color: 'blue', score: 8},
          ],
        },
      ],
      milestones: [
        {name: 'Legend', playerName: null},
      ],
    },
    thisPlayer: {
      color: 'hydro',
      heat: 26,
      plants: 8,
      megacredits: 20,
      terraformRating: 41,
      tags: {event: 5},
      tableau: [{name: 'Ecoline'}],
    },
    players: [
      {color: 'hydro', terraformRating: 41, victoryPointsBreakdown: {total: 66}},
      {color: 'blue', terraformRating: 17, victoryPointsBreakdown: {total: 57}},
    ],
  }, overrides);
}

function byId(list, id) {
  return list.find((signal) => signal.id === id);
}

function testHeatEventRisk() {
  const result = signals.computeGameSignals(makeState());
  const signal = byId(result, 'heat-event-risk');
  assert(signal, 'heat event risk should be emitted');
  assert.strictEqual(signal.severity, 'critical');
  assert.strictEqual(signal.anchor.type, 'global');
  assert.strictEqual(signal.anchor.key, 'event');
  assert.strictEqual(signal.label, 'Heat event');
  assert(signal.action.includes('event'), 'heat signal should point at the event, not duplicate the action menu');
}

function testHeatEventRiskFromEventNameOnly() {
  assert.strictEqual(
    signals.isHeatLossEvent({turmoil: {coming: 'Corrosive Rain'}}),
    true,
    'known heat-loss event names should work even when API omits description'
  );
}

function testSpendPlantsForEcolineThreshold() {
  const result = signals.computeGameSignals(makeState({
    thisPlayer: {
      color: 'hydro',
      heat: 0,
      plants: 7,
      megacredits: 20,
      terraformRating: 30,
      tags: {event: 0},
      tableau: [{name: 'Ecoline'}],
    },
  }));
  const signal = byId(result, 'spend-plants');
  assert(signal, 'Ecoline should get plant-spend hint at 7 plants');
  assert.strictEqual(signal.anchor.key, 'plants');
}

function testFinishNowWhenAheadNearEnd() {
  const result = signals.computeGameSignals(makeState());
  const signal = byId(result, 'finish-now');
  assert(signal, 'finish-now hint should be emitted when ahead and endgame is close');
  assert.strictEqual(signal.severity, 'info');
  assert.strictEqual(signal.anchor.type, 'global');
}

function testLikelyFinalGenerationFromVisibleTableCapacity() {
  const result = signals.computeGameSignals(makeState({
    game: {
      phase: 'action',
      generation: 9,
      temperature: 0,
      oxygenLevel: 11,
      oceans: 5,
      awards: [],
      milestones: [],
    },
    thisPlayer: {
      color: 'red',
      heat: 6,
      plants: 5,
      megacredits: 37,
      steel: 3,
      titanium: 1,
      terraformRating: 28,
      tags: {},
      tableau: [],
    },
    players: [
      {color: 'red', heat: 6, plants: 5, megacredits: 37, steel: 3, titanium: 1, terraformRating: 28},
      {color: 'orange', heat: 5, plants: 8, megacredits: 41, steel: 0, titanium: 6, terraformRating: 39},
      {color: 'green', heat: 24, plants: 0, megacredits: 52, steel: 2, titanium: 7, terraformRating: 35},
    ],
  }));
  const signal = byId(result, 'likely-final-gen');
  assert(signal, 'likely-final-gen should be emitted before the board reaches 5 remaining steps');
  assert.strictEqual(signal.severity, 'warning');
  assert(signal.reasons.some((reason) => reason.includes('11 terraforming steps')), signal.reasons);
  assert(signal.reasons.some((reason) => reason.toLowerCase().includes('visible table capacity')), signal.reasons);
}

function testFundingSignals() {
  const result = signals.computeGameSignals(makeState());
  assert(byId(result, 'fund-thermalist'), 'Thermalist funding hint should be emitted');
  assert(byId(result, 'claim-legend'), 'Legend milestone hint should be emitted');
}

function testGenericMilestoneSignalsFromAdvisorEvaluator() {
  const previousAdvisor = global.TM_ADVISOR;
  global.TM_ADVISOR = {
    evaluateMilestone(name, state) {
      assert.strictEqual(name, 'Fundraiser');
      assert.strictEqual(state.thisPlayer.color, 'hydro');
      return {myScore: 12, threshold: 12};
    },
  };

  let result;
  try {
    result = signals.computeGameSignals(makeState({
      game: {
        phase: 'action',
        generation: 6,
        temperature: -12,
        oxygenLevel: 7,
        oceans: 4,
        awards: [],
        milestones: [{name: 'Fundraiser'}],
      },
      thisPlayer: {
        color: 'hydro',
        heat: 0,
        plants: 0,
        megacredits: 14,
        megaCreditProduction: 12,
        terraformRating: 30,
        tags: {},
        tableau: [],
      },
    }));
  } finally {
    if (previousAdvisor === undefined) delete global.TM_ADVISOR;
    else global.TM_ADVISOR = previousAdvisor;
  }

  const signal = byId(result, 'claim-fundraiser');
  assert(signal, 'claimable evaluated milestones should be emitted');
  assert.strictEqual(signal.severity, 'warning');
  assert.deepStrictEqual(signal.anchor, {type: 'milestone', key: 'Fundraiser'});
  assert(signal.reasons.some((reason) => reason.includes('12/12')), signal.reasons);
}

function testGenericMilestoneSignalsFromRealBrainWithoutScores() {
  const previousAdvisor = global.TM_ADVISOR;
  const previousMaData = global.TM_MA_DATA;
  const brainPath = path.resolve(__dirname, '..', '..', '..', 'extension', 'tm-brain.js');
  delete require.cache[require.resolve(brainPath)];
  global.TM_MA_DATA = {
    Fundraiser: {type: 'milestone', check: 'prod', resource: 'megacredits', target: 12},
  };
  global.TM_ADVISOR = require(brainPath);

  let result;
  try {
    const state = makeState({
      game: {
        phase: 'action',
        generation: 6,
        temperature: -12,
        oxygenLevel: 7,
        oceans: 4,
        awards: [],
        milestones: [{name: 'Fundraiser'}],
      },
      thisPlayer: {
        color: 'hydro',
        heat: 0,
        plants: 0,
        megacredits: 14,
        megacreditProduction: 12,
        terraformRating: 30,
        tags: {},
        tableau: [],
      },
    });
    const progress = global.TM_ADVISOR.evaluateMilestone('Fundraiser', state);
    assert(progress, 'real brain should evaluate milestone progress without API scores');
    assert.strictEqual(progress.myScore, 12);
    assert.strictEqual(progress.threshold, 12);
    result = signals.computeGameSignals(state);
  } finally {
    if (previousAdvisor === undefined) delete global.TM_ADVISOR;
    else global.TM_ADVISOR = previousAdvisor;
    if (previousMaData === undefined) delete global.TM_MA_DATA;
    else global.TM_MA_DATA = previousMaData;
  }

  assert(byId(result, 'claim-fundraiser'), 'real brain fallback should feed generic milestone signals');
}

function testRealBrainEvaluatesCommonMilestoneFallbacksWithoutScores() {
  const previousMaData = global.TM_MA_DATA;
  const brainPath = path.resolve(__dirname, '..', '..', '..', 'extension', 'tm-brain.js');
  delete require.cache[require.resolve(brainPath)];
  global.TM_MA_DATA = {
    Mayor: {type: 'milestone', check: 'cities', target: 3},
    Tycoon: {type: 'milestone', check: 'tableau', target: 15},
    Colonizer: {type: 'milestone', check: 'colonies', target: 3},
    Gardener: {type: 'milestone', check: 'greeneries', target: 3},
    Planner: {type: 'milestone', check: 'hand', target: 16},
  };

  try {
    const brain = require(brainPath);
    const state = {
      game: {
        milestones: [
          {name: 'Mayor'},
          {name: 'Tycoon'},
          {name: 'Colonizer'},
          {name: 'Gardener'},
          {name: 'Planner'},
        ],
      },
      thisPlayer: {
        color: 'hydro',
        citiesCount: 3,
        coloniesCount: 3,
        greeneriesCount: 3,
        tableau: Array.from({length: 15}, (_, index) => ({name: 'Played ' + index})),
        cardsInHand: Array.from({length: 16}, (_, index) => ({name: 'Hand ' + index})),
      },
    };

    for (const name of Object.keys(global.TM_MA_DATA)) {
      const progress = brain.evaluateMilestone(name, state);
      assert(progress, name + ' should be evaluated without API scores');
      assert.strictEqual(progress.canClaim, true, name + ' should be claimable');
      assert.strictEqual(progress.myScore, progress.threshold, name + ' score should meet its threshold');
    }
  } finally {
    if (previousMaData === undefined) delete global.TM_MA_DATA;
    else global.TM_MA_DATA = previousMaData;
  }
}

function testRealBrainEvaluatesComplexMilestoneFallbacksWithoutScores() {
  const previousMaData = global.TM_MA_DATA;
  const brainPath = path.resolve(__dirname, '..', '..', '..', 'extension', 'tm-brain.js');
  delete require.cache[require.resolve(brainPath)];
  global.TM_MA_DATA = {
    Specialist: {type: 'milestone', check: 'maxProd', target: 10},
    Producer: {type: 'milestone', check: 'totalProd', target: 16},
    Diversifier: {type: 'milestone', check: 'uniqueTags', target: 8},
    Ecologist: {type: 'milestone', check: 'bioTags', target: 4},
    Tactician4: {type: 'milestone', check: 'reqCards', target: 4},
    Sponsor: {type: 'milestone', check: 'expensiveCards', target: 3},
    Philantropist: {type: 'milestone', check: 'vpCards', target: 5},
  };

  try {
    const brain = require(brainPath);
    const state = {
      game: {
        milestones: Object.keys(global.TM_MA_DATA).map((name) => ({name})),
      },
      thisPlayer: {
        color: 'hydro',
        megaCreditProduction: 3,
        steelProduction: 1,
        titaniumProduction: 1,
        plantProduction: 2,
        energyProduction: 10,
        heatProduction: 2,
        tags: {
          earth: 1,
          venus: 1,
          jovian: 1,
          science: 1,
          animal: 1,
          microbe: 1,
          plant: 2,
          building: 1,
        },
        tableau: [
          {name: 'Req VP 1', cost: 20, victoryPoints: 1, requirements: [{type: 'oxygen'}]},
          {name: 'Req VP 2', cost: 21, victoryPoints: 1, requirements: [{type: 'temperature'}]},
          {name: 'Req VP 3', cost: 22, victoryPoints: 1, requirements: [{type: 'science'}]},
          {name: 'Req VP 4', cost: 8, victoryPoints: 1, requirements: [{type: 'venus'}]},
          {name: 'VP 5', cost: 7, victoryPoints: 1},
        ],
      },
    };

    for (const name of Object.keys(global.TM_MA_DATA)) {
      const progress = brain.evaluateMilestone(name, state);
      assert(progress, name + ' should be evaluated without API scores');
      assert.strictEqual(progress.canClaim, true, name + ' should be claimable');
      assert(progress.myScore >= progress.threshold, name + ' score should meet its threshold');
    }
  } finally {
    if (previousMaData === undefined) delete global.TM_MA_DATA;
    else global.TM_MA_DATA = previousMaData;
  }
}

function testNoEndgameCloseAfterTerraformingComplete() {
  const result = signals.computeGameSignals(makeState({
    game: {
      phase: 'action',
      generation: 9,
      temperature: 8,
      oxygenLevel: 14,
      oceans: 9,
      awards: [],
      milestones: [],
    },
  }));
  assert(!byId(result, 'endgame-close'), 'endgame-close should not render after all Mars globals are complete');
}

function testNoSignalsOutsideActionPhase() {
  const result = signals.computeGameSignals(makeState({game: {phase: 'drafting'}}));
  assert.deepStrictEqual(result, [], 'drafting phase should not emit action overlays');
}

testHeatEventRisk();
testHeatEventRiskFromEventNameOnly();
testSpendPlantsForEcolineThreshold();
testFinishNowWhenAheadNearEnd();
testLikelyFinalGenerationFromVisibleTableCapacity();
testFundingSignals();
testGenericMilestoneSignalsFromAdvisorEvaluator();
testGenericMilestoneSignalsFromRealBrainWithoutScores();
testRealBrainEvaluatesCommonMilestoneFallbacksWithoutScores();
testRealBrainEvaluatesComplexMilestoneFallbacksWithoutScores();
testNoEndgameCloseAfterTerraformingComplete();
testNoSignalsOutsideActionPhase();

console.log('content-game-signals checks: OK');
