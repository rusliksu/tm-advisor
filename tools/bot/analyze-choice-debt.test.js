#!/usr/bin/env node
'use strict';

const assert = require('assert');

const {
  analyzeEntries,
  formatReport,
  normalizePickedCards,
} = require('./analyze-choice-debt');

function buyEntry({gameId = 'g1', color = 'red', generation = 4, picked}) {
  return {
    gameId,
    color,
    generation,
    title: 'Select card(s) to buy',
    picked,
    options: picked,
    stateSummary: {mc: 40, handCount: 2},
    reasoning: ['BUY: 4 cards'],
  };
}

function actionEntry({gameId = 'g1', color = 'red', generation = 5, options, picked, reasoning = []}) {
  return {
    gameId,
    color,
    generation,
    title: 'Take your next action',
    options,
    picked,
    stateSummary: {mc: 20, handCount: 4},
    reasoning,
  };
}

function testNormalizePickedCardsHandlesDirectAndNestedShapes() {
  assert.deepStrictEqual(normalizePickedCards(['A', 'B']), ['A', 'B']);
  assert.deepStrictEqual(normalizePickedCards({responseType: 'card', picked: ['A']}), ['A']);
  assert.deepStrictEqual(normalizePickedCards({responseType: 'projectCard', picked: 'A'}), ['A']);
  assert.deepStrictEqual(normalizePickedCards({responseType: 'projectCard', card: 'A'}), ['A']);
}

function testAnalyzeEntriesSeparatesPlayedSoldVisibleDeadAndNeverVisible() {
  const entries = [
    buyEntry({picked: ['Played Card', 'Sold Card', 'Visible Dead', 'Never Visible']}),
    actionEntry({
      generation: 5,
      options: [
        {index: 0, title: 'Play project card', type: 'projectCard', cards: ['Played Card', 'Visible Dead']},
        {index: 1, title: 'Pass for this generation', type: 'option'},
      ],
      picked: {index: 0, responseType: 'projectCard', picked: 'Played Card'},
      reasoning: ['hand(2): Played Card=20, Visible Dead=-4', 'DECISION: card=Played Card(20) vs SP(none=-999)'],
    }),
    actionEntry({
      generation: 6,
      options: [
        {index: 0, title: 'Sell patents', type: 'card', cards: ['Sold Card', 'Visible Dead']},
        {index: 1, title: 'Pass for this generation', type: 'option'},
      ],
      picked: {index: 0, responseType: 'card', picked: ['Sold Card']},
      reasoning: ['late-cleanup sell: Sold Card'],
    }),
    actionEntry({
      generation: 7,
      options: [
        {index: 0, title: 'Play project card', type: 'projectCard', cards: ['Visible Dead']},
        {index: 1, title: 'Pass for this generation', type: 'option'},
      ],
      picked: {index: 1, responseType: 'option', picked: 'Pass for this generation'},
      reasoning: ['hand(1): Visible Dead=-6', 'DECISION: card=none(-999) vs SP(none=-999)'],
    }),
  ];

  const stats = analyzeEntries(entries);
  assert.strictEqual(stats.summary.bought, 4);
  assert.strictEqual(stats.summary.played, 1);
  assert.strictEqual(stats.summary.sold, 1);
  assert.strictEqual(stats.summary.dead, 2);
  assert.strictEqual(stats.summary.visibleDead, 1);
  assert.strictEqual(stats.summary.neverVisibleDead, 1);
  assert.strictEqual(stats.summary.lateCleanupSells, 1);
  assert.strictEqual(stats.cards['Visible Dead'].visibleDead, 1);
  assert.strictEqual(stats.cards['Never Visible'].neverVisibleDead, 1);

  const report = formatReport(stats);
  assert.ok(report.includes('Bought: 4'));
  assert.ok(report.includes('Visible-dead: 1'));
  assert.ok(report.includes('Never-visible-dead: 1'));
  assert.ok(report.includes('Visible Dead'));
  assert.ok(report.includes('Never Visible'));
}

function main() {
  testNormalizePickedCardsHandlesDirectAndNestedShapes();
  testAnalyzeEntriesSeparatesPlayedSoldVisibleDeadAndNeverVisible();
  console.log('analyze-choice-debt tests passed');
}

if (require.main === module) main();

module.exports = {
  testNormalizePickedCardsHandlesDirectAndNestedShapes,
  testAnalyzeEntriesSeparatesPlayedSoldVisibleDeadAndNeverVisible,
};
