#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  analyze,
  formatReport,
  parseArgs,
  normalizeLogEntry,
  resolveFiles,
  filterEntries,
} = require('./shadow-analyze');
const {SHADOW_DIR} = require('./shadow-runtime');
const {MERGED_DIR} = require('./shadow-merge');

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

function testNormalizeMergedRejectedInputIsNotComparable() {
  const entries = normalizeLogEntry({
    type: 'merged_turn',
    matchStatus: 'matched',
    generation: 1,
    player: 'Ruslan',
    playerId: 'p1',
    color: 'red',
    promptType: 'card',
    botAction: 'cards: Medical Lab',
    inputAction: 'cards: Jovian Lanterns',
    observedAction: 'state changed',
    input: {
      result: 'rejected',
      raw: {
        result: 'rejected',
        errorId: '#invalid-run-id',
      },
    },
    shadow: {
      raw: {mc: 0},
    },
  });

  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].inputAction, null);
  const stats = analyze(entries);
  assert.strictEqual(stats.botVsPlayer.comparable, 0);
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

function testFormatReportWarnsWhenMergedWithoutExactInputs() {
  const entries = normalizeLogEntry({
    type: 'merged_turn',
    matchStatus: 'shadow_only',
    generation: 1,
    player: 'Ruslan',
    playerId: 'p1',
    color: 'red',
    promptType: 'or',
    botAction: 'play Spin-off Department',
    observedAction: 'action Septem Tribus',
    playerActed: true,
    status: 'resolved',
    shadow: {
      botReasoning: ['gen=1 mc=42', 'DECISION card=Spin-off Department(57) vs SP(-999)', 'hand(1)'],
      raw: {mc: 42},
    },
  });

  const report = formatReport(analyze(entries), ['merged-g2.jsonl']);
  assert.ok(report.includes('WARNING: no exact player-input matches'));
  assert.ok(report.includes('NO EXACT PLAYER INPUTS'));
  assert.ok(report.includes('pattern evidence only'));
}

function testFormatReportDoesNotSuggestBotTuningWithoutDecisions() {
  const report = formatReport(analyze([]), ['merged-empty.jsonl']);
  assert.ok(report.includes('No DECISION traces found'));
  assert.ok(report.includes('Investigate why this game produced zero shadow DECISION traces'));
  assert.ok(report.includes('before changing bot logic'));
  assert.ok(!report.includes('improve card play rate'));
}

function testAnalyzeDoesNotCountOpaqueOptionIndexAsPass() {
  const entries = normalizeLogEntry({
    gameId: 'g-shadow',
    player: 'Ruslan',
    color: 'red',
    gen: 2,
    promptType: 'or',
    title: 'Take your next action',
    botAction: 'option[0]',
    playerActed: true,
    status: 'resolved',
    mc: 9,
    botReasoning: [
      'gen=2 steps=40 gensLeft=7 mc=9',
      'DECISION: card=none(-999) vs SP(-999)',
    ],
  });

  const stats = analyze(entries);
  assert.strictEqual(stats.totalDecisions, 1);
  assert.strictEqual(stats.byGen[2].pass, 0);
  assert.strictEqual(stats.spVsCard.bothNone, 0);
  assert.strictEqual(stats.spVsCard.unknownOptions, 1);
  assert.strictEqual(stats.projectCardCandidates.noCandidateLine, 1);
  assert.strictEqual(stats.projectCardCandidates.belowThreshold, 0);

  const report = formatReport(stats, ['shadow-g.jsonl']);
  assert.ok(report.includes('Unclassified option actions: 1'));
  assert.ok(report.includes('No project-card candidate: 1 / 1'));
  assert.ok(report.includes('No candidate line: 1'));
  assert.ok(report.includes('Candidates below threshold: 0'));
  assert.ok(!report.includes('Empty hand (0 playable)'));
  assert.ok(!report.includes('High pass rate in Gen 1-3'));
}

function testAnalyzeSeparatesBelowThresholdProjectCards() {
  const entries = normalizeLogEntry({
    gameId: 'g-shadow',
    player: 'Ruslan',
    color: 'red',
    gen: 4,
    promptType: 'or',
    title: 'Take your next action',
    botAction: 'pass',
    playerActed: true,
    status: 'resolved',
    mc: 16,
    botReasoning: [
      'gen=4 steps=35 gensLeft=6 mc=16',
      'hand(2): Weak Card=-9(6MC), Trap Card=-12(3MC) thr=-8',
      'DECISION: card=none(-999) vs SP(-999)',
    ],
  });

  const stats = analyze(entries);
  assert.strictEqual(stats.totalDecisions, 1);
  assert.strictEqual(stats.projectCardCandidates.noCandidateLine, 0);
  assert.strictEqual(stats.projectCardCandidates.belowThreshold, 1);

  const report = formatReport(stats, ['shadow-g.jsonl']);
  assert.ok(report.includes('No candidate line: 0'));
  assert.ok(report.includes('Candidates below threshold: 1'));
}

function testAnalyzeCountsExplicitPassOptionAsPass() {
  const entries = normalizeLogEntry({
    gameId: 'g-shadow',
    player: 'Ruslan',
    color: 'red',
    gen: 2,
    promptType: 'or',
    title: 'Take your next action',
    botAction: 'pass',
    playerActed: true,
    status: 'resolved',
    mc: 9,
    botReasoning: [
      'gen=2 steps=40 gensLeft=7 mc=9',
      'DECISION: card=none(-999) vs SP(-999)',
    ],
  });

  const stats = analyze(entries);
  assert.strictEqual(stats.totalDecisions, 1);
  assert.strictEqual(stats.byGen[2].pass, 1);
  assert.strictEqual(stats.spVsCard.bothNone, 1);
  assert.strictEqual(stats.spVsCard.unknownOptions, 0);
}

function testAnalyzeCanFilterByPlayerName() {
  const entries = [
    ...normalizeLogEntry({
      type: 'merged_turn',
      matchStatus: 'matched',
      generation: 7,
      player: 'GydRo',
      playerId: 'p-gydro',
      color: 'hydro',
      promptType: 'or',
      botAction: 'play Sponsors',
      inputAction: 'play Sponsors',
      observedAction: 'play Sponsors',
      shadow: {raw: {mc: 20}},
    }),
    ...normalizeLogEntry({
      type: 'merged_turn',
      matchStatus: 'matched',
      generation: 7,
      player: 'Other',
      playerId: 'p-other',
      color: 'pink',
      promptType: 'or',
      botAction: 'play Comet',
      inputAction: 'play Sponsors',
      observedAction: 'play Sponsors',
      shadow: {raw: {mc: 20}},
    }),
  ];

  const filtered = filterEntries(entries, {player: 'GydRo'});
  const stats = analyze(filtered);
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(stats.botVsPlayer.comparable, 1);
  assert.strictEqual(stats.botVsPlayer.matched, 1);
  assert.strictEqual(stats.botVsPlayer.differed, 0);
}

function testAnalyzeSeparatesFinishNowOverrideFromMismatch() {
  const entries = normalizeLogEntry({
    type: 'merged_turn',
    matchStatus: 'matched',
    generation: 9,
    player: 'GydRo',
    playerId: 'p-gydro',
    color: 'hydro',
    promptType: 'or',
    botAction: 'play Interstellar Colony Ship',
    inputAction: 'play Asteroid:SP',
    observedAction: 'resource delta mc, tr',
    shadow: {
      observedChanges: {
        resources: {
          mc: {from: 79, to: 65},
          tr: {from: 39, to: 40},
        },
      },
      raw: {mc: 79},
    },
  });

  const stats = analyze(entries);
  assert.strictEqual(stats.botVsPlayer.comparable, 1);
  assert.strictEqual(stats.botVsPlayer.matched, 0);
  assert.strictEqual(stats.botVsPlayer.differed, 0);
  assert.strictEqual(stats.botVsPlayer.strategicOverrides.finishNow.count, 1);

  const report = formatReport(stats, ['merged-g.jsonl']);
  assert.ok(report.includes('Finish-now overrides: 1'));
  assert.ok(report.includes('not counted as generic mismatch'));
}

function testAnalyzeDoesNotTreatCityAsFinishNowTerraforming() {
  const entries = normalizeLogEntry({
    type: 'merged_turn',
    matchStatus: 'matched',
    generation: 9,
    player: 'GydRo',
    playerId: 'p-gydro',
    color: 'hydro',
    promptType: 'or',
    botAction: 'play Interstellar Colony Ship',
    inputAction: 'play City',
    observedAction: 'resource delta mc',
    shadow: {
      observedChanges: {
        resources: {
          mc: {from: 42, to: 21},
        },
      },
      raw: {mc: 42},
    },
  });

  const stats = analyze(entries);
  assert.strictEqual(stats.botVsPlayer.comparable, 1);
  assert.strictEqual(stats.botVsPlayer.differed, 1);
  assert.strictEqual(stats.botVsPlayer.strategicOverrides.finishNow.count, 0);
}

function testParseGameIdOption() {
  const args = parseArgs(['node', 'bot/shadow-analyze.js', '--game', 'g123']);
  assert.strictEqual(args.gameId, 'g123');
  assert.deepStrictEqual(args.files, []);
}

function testParsePlayerOption() {
  const args = parseArgs(['node', 'bot/shadow-analyze.js', '--player', 'GydRo']);
  assert.strictEqual(args.player, 'GydRo');
  assert.deepStrictEqual(args.files, []);
}

function testResolveGameIdFallsBackToRawShadowWhenOtherMergedLogsExist() {
  const gameId = 'gtest-shadow-only-resolve';
  const shadowFile = path.join(SHADOW_DIR, `shadow-${gameId}.jsonl`);
  const unrelatedMergedFile = path.join(MERGED_DIR, 'merged-gtest-unrelated-resolve.jsonl');
  fs.mkdirSync(SHADOW_DIR, {recursive: true});
  fs.mkdirSync(MERGED_DIR, {recursive: true});
  fs.writeFileSync(shadowFile, '{"type":"shadow_start"}\n');
  fs.writeFileSync(unrelatedMergedFile, '{"type":"merged_turn"}\n');
  try {
    const files = resolveFiles(parseArgs(['node', 'bot/shadow-analyze.js', '--game', gameId]));
    assert.deepStrictEqual(files, [shadowFile]);
  } finally {
    fs.rmSync(shadowFile, {force: true});
    fs.rmSync(unrelatedMergedFile, {force: true});
  }
}

function testResolveGameIdPrefersMergedOverRawWhenBothExist() {
  const gameId = 'gtest-merged-preferred-resolve';
  const shadowFile = path.join(SHADOW_DIR, `shadow-${gameId}.jsonl`);
  const mergedFile = path.join(MERGED_DIR, `merged-${gameId}.jsonl`);
  fs.mkdirSync(SHADOW_DIR, {recursive: true});
  fs.mkdirSync(MERGED_DIR, {recursive: true});
  fs.writeFileSync(shadowFile, '{"gameId":"gtest-merged-preferred-resolve","botAction":"pass"}\n');
  fs.writeFileSync(mergedFile, '{"type":"merged_turn","gameId":"gtest-merged-preferred-resolve"}\n');
  try {
    const files = resolveFiles(parseArgs(['node', 'bot/shadow-analyze.js', '--game', gameId]));
    assert.deepStrictEqual(files, [mergedFile]);
  } finally {
    fs.rmSync(shadowFile, {force: true});
    fs.rmSync(mergedFile, {force: true});
  }
}

function testParseHelpOptionDoesNotBecomeFile() {
  const args = parseArgs(['node', 'bot/shadow-analyze.js', '--help']);
  assert.strictEqual(args.help, true);
  assert.deepStrictEqual(args.files, []);
}

function main() {
  testNormalizeMergedTurn();
  testAnalyzeMergedMatch();
  testNormalizeMergedRejectedInputIsNotComparable();
  testNormalizeRawShadowEntryRepairsBrokenPromptTitle();
  testNormalizeLegacyRawShadowEntryWithoutPlayerId();
  testNormalizeMergedEntryRepairsBrokenPromptTitle();
  testNormalizeHistoricalBotActionSummary();
  testFormatReportMentionsExactInput();
  testAnalyzeRawObservedOutcomeMatch();
  testAnalyzeRawObservedOutcomeMismatchReport();
  testAnalyzeRawObservedCardActionOutcomeMatch();
  testAnalyzeRawObservedIntermediateIsUnscorable();
  testFormatReportWarnsWhenMergedWithoutExactInputs();
  testFormatReportDoesNotSuggestBotTuningWithoutDecisions();
  testAnalyzeDoesNotCountOpaqueOptionIndexAsPass();
  testAnalyzeSeparatesBelowThresholdProjectCards();
  testAnalyzeCountsExplicitPassOptionAsPass();
  testAnalyzeCanFilterByPlayerName();
  testAnalyzeSeparatesFinishNowOverrideFromMismatch();
  testAnalyzeDoesNotTreatCityAsFinishNowTerraforming();
  testParseGameIdOption();
  testParsePlayerOption();
  testResolveGameIdFallsBackToRawShadowWhenOtherMergedLogsExist();
  testResolveGameIdPrefersMergedOverRawWhenBothExist();
  testParseHelpOptionDoesNotBecomeFile();
  console.log('shadow-analyze tests passed');
}

main();
