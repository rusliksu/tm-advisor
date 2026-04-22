#!/usr/bin/env node
'use strict';

const assert = require('assert');

const {
  analyze,
  formatReport,
  normalizeLogEntry,
} = require('./shadow-analyze');

function testNormalizeMergedTurn() {
  const normalized = normalizeLogEntry({
    type: 'merged_turn',
    matchStatus: 'matched',
    generation: 6,
    player: 'Ruslan',
    playerId: 'p1',
    color: 'red',
    promptType: 'or',
    botAction: 'play Sponsors',
    inputAction: 'play Sponsors',
    observedAction: 'play Sponsors',
    shadow: {
      botReasoning: ['gen=6 mc=30', 'DECISION card=Sponsors(22) vs SP(10)', 'hand(3)'],
      raw: {mc: 30},
    },
  });

  assert.notStrictEqual(normalized, null);
  assert.strictEqual(normalized.length, 1);
  assert.strictEqual(normalized[0].sourceType, 'merged');
  assert.strictEqual(normalized[0].matchStatus, 'matched');
  assert.strictEqual(normalized[0].botReasoning.length, 3);
  assert.strictEqual(normalized[0].mc, 30);
}

function testAnalyzeMergedMatch() {
  const entries = normalizeLogEntry({
    type: 'merged_turn',
    matchStatus: 'matched',
    generation: 6,
    player: 'Ruslan',
    playerId: 'p1',
    color: 'red',
    promptType: 'or',
    botAction: 'play Sponsors',
    inputAction: 'play Sponsors',
    observedAction: 'play Sponsors',
    shadow: {
      botReasoning: ['gen=6 mc=30', 'DECISION card=Sponsors(22) vs SP(10)', 'hand(3)'],
      raw: {mc: 30},
    },
  });

  const stats = analyze(entries);
  assert.strictEqual(stats.totalDecisions, 1);
  assert.strictEqual(stats.sourceCoverage.matched, 1);
  assert.strictEqual(stats.botVsPlayer.comparable, 1);
  assert.strictEqual(stats.botVsPlayer.matched, 1);
  assert.strictEqual(stats.botVsPlayer.byPromptType.or.matched, 1);
}

function testNormalizeRawShadowEntryRepairsBrokenPromptTitle() {
  const normalized = normalizeLogEntry({
    gameId: 'g-shadow',
    playerId: 'p1',
    player: 'Rav',
    promptType: 'card',
    title: '[object Object]',
    phase: 'initial_drafting',
    botAction: 'cards: Mohole Lake',
    observedAction: 'draft Red Spot Observatory',
    observedChanges: {
      draftedAdded: ['Red Spot Observatory'],
      currentPackRemoved: ['Red Spot Observatory', 'Power Plant'],
    },
  });

  assert.strictEqual(normalized.length, 1);
  assert.strictEqual(normalized[0].promptTitle, 'Select a card to keep and pass the rest to ${0}');
}

function testNormalizeLegacyRawShadowEntryWithoutPlayerId() {
  const normalized = normalizeLogEntry({
    gameId: 'g-legacy',
    player: 'Ruslan',
    color: 'red',
    gen: 4,
    promptType: 'or',
    title: 'Take your first action',
    mc: 24,
    botAction: 'play Sponsors',
    botReasoning: ['gen=4 mc=24', 'DECISION: card=Sponsors(22) vs SP(9)'],
    observedAction: 'play Sponsors',
  });

  assert.strictEqual(normalized.length, 1);
  assert.strictEqual(normalized[0].sourceType, 'shadow');
  assert.strictEqual(normalized[0].playerId, null);
  assert.strictEqual(normalized[0].player, 'Ruslan');
  assert.strictEqual(normalized[0].botReasoning.length, 2);
}

function testNormalizeMergedEntryRepairsBrokenPromptTitle() {
  const normalized = normalizeLogEntry({
    type: 'merged_turn',
    matchStatus: 'shadow_only',
    generation: 1,
    player: 'Аня',
    playerId: 'p1',
    promptType: 'card',
    promptTitle: '[object Object]',
    botAction: 'cards: Adapted Lichen',
    observedAction: 'draft Olympus Conference',
    shadow: {
      raw: {
        promptType: 'card',
        title: '[object Object]',
        phase: 'initial_drafting',
        observedChanges: {
          draftedAdded: ['Olympus Conference'],
          currentPackRemoved: ['Olympus Conference', 'Comet Aiming'],
        },
      },
    },
  });

  assert.strictEqual(normalized.length, 1);
  assert.strictEqual(normalized[0].promptTitle, 'Select a card to keep and pass the rest to ${0}');
}

function testNormalizeHistoricalBotActionSummary() {
  const normalized = normalizeLogEntry({
    type: 'merged_turn',
    matchStatus: 'matched',
    generation: 4,
    player: 'Rav',
    playerId: 'p1',
    color: 'red',
    promptType: 'option',
    promptTitle: 'Spend 3 M€ to draw a blue card',
    botAction: 'option[undefined]',
    inputAction: 'option',
    observedAction: 'resource delta mc',
    shadow: {raw: {}},
  });

  assert.strictEqual(normalized.length, 1);
  assert.strictEqual(normalized[0].botAction, 'option');
}

function testFormatReportMentionsExactInput() {
  const entries = [
    ...normalizeLogEntry({
      type: 'merged_turn',
      matchStatus: 'matched',
      generation: 4,
      player: 'Other',
      playerId: 'p2',
      color: 'blue',
      promptType: 'or',
      botAction: 'play Comet',
      inputAction: 'play Sponsors',
      observedAction: 'play Sponsors',
      shadow: {
        botReasoning: ['gen=4 mc=24', 'DECISION card=Comet(18) vs SP(9)', 'hand(2)'],
        raw: {mc: 24},
      },
    }),
    ...normalizeLogEntry({
      type: 'merged_turn',
      matchStatus: 'matched',
      generation: 5,
      player: 'Other2',
      playerId: 'p3',
      color: 'green',
      promptType: 'or',
      botAction: 'play Comet',
      inputAction: 'play Sponsors',
      observedAction: 'play Sponsors',
      shadow: {
        botReasoning: ['gen=5 mc=26', 'DECISION card=Comet(20) vs SP(9)', 'hand(2)'],
        raw: {mc: 26},
      },
    }),
  ];

  const report = formatReport(analyze(entries), ['merged-g2.jsonl']);
  assert.ok(report.includes('## Bot vs Exact Player Input'));
  assert.ok(report.includes('Mismatch gen 4 Other'));
  assert.ok(report.includes('## Mismatch Breakdown By Prompt'));
  assert.ok(report.includes('or: differed 2/2 (100%)'));
  assert.ok(report.includes('## Top Mismatch Patterns'));
  assert.ok(report.includes('[or] play Comet -> play Sponsors | count=2'));
}

function testAnalyzeRawObservedOutcomeMatch() {
  const entries = normalizeLogEntry({
    gameId: 'g-shadow',
    player: 'Ruslan',
    color: 'red',
    gen: 2,
    promptType: 'card',
    title: 'Select a card to keep and pass the rest to ${0}',
    botAction: 'cards: Tectonic Stress Power',
    observedAction: 'draft Tectonic Stress Power, Soil Factory',
    playerActed: true,
    status: 'resolved',
    observedChanges: {
      draftedAdded: ['Tectonic Stress Power', 'Soil Factory'],
    },
  });

  const stats = analyze(entries);
  assert.strictEqual(stats.botVsObserved.scorable, 1);
  assert.strictEqual(stats.botVsObserved.matched, 1);
  assert.strictEqual(stats.botVsObserved.differed, 0);
  assert.strictEqual(stats.botVsObserved.byPromptType.card.matched, 1);
}

function testAnalyzeRawObservedOutcomeMismatchReport() {
  const entries = normalizeLogEntry({
    gameId: 'g-shadow',
    player: 'Ruslan',
    color: 'red',
    gen: 3,
    promptType: 'card',
    title: 'Select a card to keep and pass the rest to ${0}',
    botAction: 'cards: Comet',
    observedAction: 'draft Sponsors',
    playerActed: true,
    status: 'resolved',
    observedChanges: {
      draftedAdded: ['Sponsors'],
    },
  });

  const stats = analyze(entries);
  assert.strictEqual(stats.botVsObserved.scorable, 1);
  assert.strictEqual(stats.botVsObserved.matched, 0);
  assert.strictEqual(stats.botVsObserved.differed, 1);

  const report = formatReport(stats, ['shadow-g.jsonl']);
  assert.ok(report.includes('## Bot vs Observed Outcome'));
  assert.ok(report.includes('Mismatch gen 3 Ruslan'));
  assert.ok(report.includes('## Top Observed Mismatch Patterns'));
  assert.ok(report.includes('[card] cards: Comet -> draft Sponsors | count=1'));
}

function testAnalyzeRawObservedCardActionOutcomeMatch() {
  const entries = normalizeLogEntry({
    gameId: 'g-shadow',
    player: 'Ruslan',
    color: 'red',
    gen: 4,
    promptType: 'or',
    title: 'Take your next action',
    botAction: 'cards: Local Shading',
    observedAction: 'action Local Shading',
    playerActed: true,
    status: 'resolved',
    observedChanges: {
      actionsAdded: ['Local Shading'],
    },
  });

  const stats = analyze(entries);
  assert.strictEqual(stats.botVsObserved.scorable, 1);
  assert.strictEqual(stats.botVsObserved.matched, 1);
  assert.strictEqual(stats.botVsObserved.differed, 0);
}

function testAnalyzeRawObservedIntermediateIsUnscorable() {
  const entries = normalizeLogEntry({
    gameId: 'g-shadow',
    player: 'Ruslan',
    color: 'red',
    gen: 3,
    promptType: 'card',
    botAction: 'cards: Comet',
    observedAction: 'state changed',
    playerActed: true,
    status: 'resolved',
  });

  const stats = analyze(entries);
  assert.strictEqual(stats.botVsObserved.scorable, 0);
}

function main() {
  testNormalizeMergedTurn();
  testAnalyzeMergedMatch();
  testNormalizeRawShadowEntryRepairsBrokenPromptTitle();
  testNormalizeLegacyRawShadowEntryWithoutPlayerId();
  testNormalizeMergedEntryRepairsBrokenPromptTitle();
  testNormalizeHistoricalBotActionSummary();
  testFormatReportMentionsExactInput();
  testAnalyzeRawObservedOutcomeMatch();
  testAnalyzeRawObservedOutcomeMismatchReport();
  testAnalyzeRawObservedCardActionOutcomeMatch();
  testAnalyzeRawObservedIntermediateIsUnscorable();
  console.log('shadow-analyze tests passed');
}

main();
