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

function testFundingSignals() {
  const result = signals.computeGameSignals(makeState());
  assert(byId(result, 'fund-thermalist'), 'Thermalist funding hint should be emitted');
  assert(byId(result, 'claim-legend'), 'Legend milestone hint should be emitted');
}

function testNoSignalsOutsideActionPhase() {
  const result = signals.computeGameSignals(makeState({game: {phase: 'drafting'}}));
  assert.deepStrictEqual(result, [], 'drafting phase should not emit action overlays');
}

testHeatEventRisk();
testHeatEventRiskFromEventNameOnly();
testSpendPlantsForEcolineThreshold();
testFinishNowWhenAheadNearEnd();
testFundingSignals();
testNoSignalsOutsideActionPhase();

console.log('content-game-signals checks: OK');
