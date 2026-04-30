#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

delete global.TM_CONTENT_OVERLAYS;
require(path.resolve(__dirname, '..', 'src', 'content-overlays.js'));

const overlays = global.TM_CONTENT_OVERLAYS;
assert(overlays, 'TM_CONTENT_OVERLAYS should be loaded');
assert.strictEqual(
  typeof overlays.prepareDraftRecommendationDisplayState,
  'function',
  'prepareDraftRecommendationDisplayState should be exported',
);

function score(name, total) {
  return {
    name,
    total,
    uncappedTotal: total,
    reasons: [`score ${total}`],
  };
}

function testDiscardPromptRanksLowestCardsFirst() {
  const display = overlays.prepareDraftRecommendationDisplayState({
    scored: [
      score('Bactoviral Research', 88),
      score('Comet for Venus', 16),
      score('Asteroid Mining', 47),
      score('Moss', 24),
    ],
    getPlayerVueData() {
      return {
        game: {phase: 'solar', generation: 9},
        thisPlayer: {
          waitingFor: {
            title: {
              message: 'Global Event - Select 2 cards to discard',
            },
            buttonLabel: 'Discard',
            type: 'card',
          },
        },
      };
    },
    selectCards: [],
    isResearchPhase: false,
    myCorp: 'Morning Star Inc.',
    detectGeneration() {
      return 9;
    },
  });

  assert.strictEqual(display.discardMode, true, 'discard prompt should be detected');
  assert.strictEqual(display.discardCount, 2, 'discard count should come from waitingFor max/min');
  assert.strictEqual(display.isDraftOrResearch, true, 'discard prompt should still render inline overlays');
  assert.deepStrictEqual(
    display.scored.map((item) => item.name),
    ['Comet for Venus', 'Moss', 'Asteroid Mining', 'Bactoviral Research'],
    'discard mode should sort by lowest value first',
  );
  assert.deepStrictEqual(
    display.scored.map((item) => !!item.discardCandidate),
    [true, true, false, false],
    'only the required number of lowest-value cards should be discard candidates',
  );
  assert(
    display.scored[0].reasons[0].startsWith('Discard:'),
    'discard candidate should get an explicit discard reason',
  );
}

function testKeepPromptKeepsNormalRanking() {
  const display = overlays.prepareDraftRecommendationDisplayState({
    scored: [
      score('Bactoviral Research', 88),
      score('Comet for Venus', 16),
      score('Asteroid Mining', 47),
    ],
    getPlayerVueData() {
      return {
        game: {phase: 'drafting', generation: 4},
        thisPlayer: {
          waitingFor: {
            title: 'Select a card to keep',
            buttonLabel: 'Keep',
            type: 'card',
          },
        },
      };
    },
    selectCards: [],
    isResearchPhase: true,
    myCorp: 'Morning Star Inc.',
  });

  assert.strictEqual(display.discardMode, false, 'normal keep prompts should not become discard mode');
  assert.deepStrictEqual(
    display.scored.map((item) => item.name),
    ['Bactoviral Research', 'Asteroid Mining', 'Comet for Venus'],
    'normal prompt should keep highest-value-first ranking',
  );
  assert(display.scored.every((item) => !item.discardCandidate), 'normal prompt should not mark discard candidates');
}

testDiscardPromptRanksLowestCardsFirst();
testKeepPromptKeepsNormalRanking();

console.log('content discard recommendation checks: OK');
