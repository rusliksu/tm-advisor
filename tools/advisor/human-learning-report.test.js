#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {analyzeEntries} = require('./human-learning-report');

function play(ts, card, best) {
  return {
    type: 'card_played',
    ts,
    game_id: 'g-test',
    player_id: 'p1',
    player: 'Human',
    card,
    prev_recommended_play: best,
    decision_context: {
      game: {generation: 7, phase: 'action'},
      me: {mc: 20, production: {mc: 10}},
      top_options: [{name: best, rank: 1, score: 30}],
    },
  };
}

function miss(ts, card, best, gap) {
  return {
    type: 'advisor_miss',
    ts,
    game_id: 'g-test',
    player_id: 'p1',
    player: 'Human',
    card,
    chosen_rank: 3,
    chosen_score: 0,
    best_card: best,
    best_score: gap,
    score_gap: gap,
    severity: 'high',
    confidence: 'normal',
    same_poll_card_count: 1,
  };
}

function decision(ts, decisionId) {
  return {
    type: 'decision_observed',
    ts,
    game_id: 'g-test',
    decision_id: decisionId,
    player_id: 'p1',
    player: 'Human',
    best_move: 'PLAY Playable A - highest play value',
    decision_context: {
      game: {generation: 4, phase: 'action'},
      me: {mc: 18, production: {mc: 7}},
      top_options: [
        {name: 'Playable A', rank: 1, score: 30, action: 'PLAY'},
        {name: 'Playable B', rank: 2, score: 24, action: 'PLAY'},
      ],
    },
  };
}

function actionDecision(ts, decisionId, bestMove) {
  return {
    type: 'decision_observed',
    ts,
    game_id: 'g-test',
    decision_id: decisionId,
    player_id: 'p1',
    player: 'Human',
    best_move: bestMove,
    decision_context: {
      game: {generation: 5, phase: 'action'},
      me: {mc: 21, production: {mc: 8}},
      best_move: bestMove,
      top_options: [],
    },
  };
}

function testDoesNotReuseMissAcrossFiles() {
  const stats = analyzeEntries([
    {
      file: 'first.jsonl',
      events: [
        play('2026-05-03T20:24:02Z', 'Soil Studies', 'Ganymede Colony'),
        miss('2026-05-03T20:24:02Z', 'Soil Studies', 'Ganymede Colony', 29.6),
      ],
    },
    {
      file: 'second.jsonl',
      events: [
        play('2026-05-03T20:51:03Z', 'Soil Studies', 'Physics Complex'),
      ],
    },
  ], {minGap: 10});

  const soil = stats.plays.filter((row) => row.card === 'Soil Studies');
  assert.strictEqual(soil.length, 2);
  assert.strictEqual(soil[0].classification, 'teaching');
  assert.strictEqual(soil[1].classification, 'unranked');
  assert.strictEqual(soil[1].scoreGap, null);
  assert.strictEqual(stats.summary.teaching, 1);
}

function testIgnoresStaleMissInSameFile() {
  const stats = analyzeEntries([
    {
      file: 'same.jsonl',
      events: [
        miss('2026-05-03T20:24:02Z', 'Soil Studies', 'Ganymede Colony', 29.6),
        play('2026-05-03T20:51:03Z', 'Soil Studies', 'Physics Complex'),
      ],
    },
  ], {minGap: 10});

  assert.strictEqual(stats.plays[0].classification, 'unranked');
  assert.strictEqual(stats.plays[0].scoreGap, null);
  assert.strictEqual(stats.summary.teaching, 0);
}

function testUsesLinkedDecisionWhenPlayHasNoContext() {
  const stats = analyzeEntries([
    {
      file: 'linked.jsonl',
      events: [
        decision('2026-05-03T20:00:00Z', 'd1'),
        {
          type: 'card_played',
          ts: '2026-05-03T20:00:05Z',
          game_id: 'g-test',
          decision_id: 'd1',
          player_id: 'p1',
          player: 'Human',
          card: 'Playable B',
        },
      ],
    },
  ], {minGap: 10});

  assert.strictEqual(stats.plays.length, 1);
  assert.strictEqual(stats.plays[0].decisionId, 'd1');
  assert.strictEqual(stats.plays[0].rank, 2);
  assert.strictEqual(stats.plays[0].chosenScore, 24);
  assert.strictEqual(stats.plays[0].best.name, 'Playable A');
  assert.strictEqual(stats.plays[0].scoreGap, 6);
  assert.strictEqual(stats.plays[0].classification, 'reasonable');
}

function testClassifiesLinkedActions() {
  const stats = analyzeEntries([
    {
      file: 'actions.jsonl',
      events: [
        actionDecision('2026-05-03T21:00:00Z', 'a1', 'USE Development Center - draw card'),
        {
          type: 'actions_taken',
          ts: '2026-05-03T21:00:03Z',
          game_id: 'g-test',
          decision_id: 'a1',
          player_id: 'p1',
          player: 'Human',
          actions: ['Development Center'],
        },
        actionDecision('2026-05-03T21:01:00Z', 'a2', 'PLAY Big Asteroid - highest play value'),
        {
          type: 'actions_taken',
          ts: '2026-05-03T21:01:04Z',
          game_id: 'g-test',
          decision_id: 'a2',
          player_id: 'p1',
          player: 'Human',
          actions: ['Restricted Area'],
        },
      ],
    },
  ], {minGap: 10});

  assert.strictEqual(stats.summary.actions, 2);
  assert.strictEqual(stats.summary.actionRanked, 2);
  assert.strictEqual(stats.summary.actionAligned, 1);
  assert.strictEqual(stats.summary.actionMismatch, 1);
  assert.strictEqual(stats.actionMismatches.length, 1);
  assert.strictEqual(stats.actionMismatches[0].actionText, 'Restricted Area');
  assert.strictEqual(stats.actionMismatches[0].bestMove, 'PLAY Big Asteroid - highest play value');
  assert.strictEqual(stats.actionMismatches[0].bestMoveType, 'play_card');
  assert.strictEqual(stats.aggregates.actionPairs[0].key, 'Restricted Area <- Big Asteroid');
  assert.strictEqual(stats.aggregates.actionTypes[0].key, 'blue_action <- play_card');
}

function testActionMatchesAdvisorActionAlert() {
  const stats = analyzeEntries([
    {
      file: 'action-alerts.jsonl',
      events: [
        {
          type: 'decision_observed',
          ts: '2026-05-03T22:00:00Z',
          game_id: 'g-test',
          decision_id: 'aa1',
          player_id: 'p1',
          player: 'Human',
          best_move: 'PLAY Big Asteroid - highest play value',
          decision_context: {
            game: {generation: 7, phase: 'action'},
            me: {mc: 30, production: {mc: 10}},
            best_move: 'PLAY Big Asteroid - highest play value',
            alerts: ['🔵 Actions (2): Development Center: 1 energy → draw 1 card │ Restricted Area: 2 MC → draw 1 card'],
          },
        },
        {
          type: 'actions_taken',
          ts: '2026-05-03T22:00:05Z',
          game_id: 'g-test',
          decision_id: 'aa1',
          player_id: 'p1',
          player: 'Human',
          actions: ['Restricted Area'],
        },
      ],
    },
  ], {minGap: 10});

  assert.strictEqual(stats.summary.actions, 1);
  assert.strictEqual(stats.summary.actionAligned, 1);
  assert.strictEqual(stats.summary.actionMismatch, 0);
  assert.strictEqual(stats.actions[0].matchedHint.includes('Restricted Area'), true);
}

function testGenericAlertsDoNotRankActionMismatch() {
  const stats = analyzeEntries([
    {
      file: 'generic-alerts.jsonl',
      events: [
        {
          type: 'actions_taken',
          ts: '2026-05-03T22:10:05Z',
          game_id: 'g-test',
          player_id: 'p1',
          player: 'Human',
          actions: ['Aquifer Pumping'],
          decision_context: {
            game: {generation: 5, phase: 'action'},
            me: {mc: 20, production: {mc: 8}},
            alerts: [
              '⚠️ Opponent can fund Space Baron',
              '🏅 ФОНДИРУЙ через ~1 gen',
              '🧠 Engine note, not an action recommendation',
            ],
          },
        },
      ],
    },
  ], {minGap: 10});

  assert.strictEqual(stats.summary.actions, 1);
  assert.strictEqual(stats.summary.actionRanked, 0);
  assert.strictEqual(stats.summary.actionMismatch, 0);
  assert.strictEqual(stats.summary.actionUnranked, 1);
  assert.strictEqual(stats.actionMismatches.length, 0);
}

function testAggregatesBlueActionsOverPlayCards() {
  const stats = analyzeEntries([
    {
      file: 'blue-over-play.jsonl',
      events: [
        actionDecision('2026-05-03T22:30:00Z', 'bp1', 'PLAY Big Asteroid - highest play value'),
        {
          type: 'actions_taken',
          ts: '2026-05-03T22:30:03Z',
          game_id: 'g-test',
          decision_id: 'bp1',
          player_id: 'p1',
          player: 'Human',
          actions: ['Restricted Area'],
        },
        actionDecision('2026-05-03T22:31:00Z', 'bp2', 'PLAY Project Inspection (0 MC, value 10)'),
        {
          type: 'actions_taken',
          ts: '2026-05-03T22:31:03Z',
          game_id: 'g-test',
          decision_id: 'bp2',
          player_id: 'p1',
          player: 'Human',
          actions: ['Restricted Area'],
        },
      ],
    },
  ], {minGap: 10});

  assert.strictEqual(stats.summary.actionMismatch, 2);
  assert.strictEqual(stats.aggregates.actionOverPlayActions[0].key, 'Restricted Area');
  assert.strictEqual(stats.aggregates.actionOverPlayActions[0].count, 2);
  assert.deepStrictEqual(
    stats.aggregates.actionOverPlayAdvisorPlays.map((row) => row.key).sort(),
    ['Big Asteroid', 'Project Inspection'],
  );
  assert.strictEqual(stats.aggregates.actionOverPlayTiming[0].key, 'Gen 4-6');
  assert.strictEqual(stats.aggregates.actionOverPlayTiming[0].count, 2);
}

function testClassifiesEmojiAdvisorMoveTypes() {
  const stats = analyzeEntries([
    {
      file: 'emoji-types.jsonl',
      events: [
        actionDecision('2026-05-03T23:00:00Z', 'e1', '🔵 Energy Market: gain 8 M€'),
        {
          type: 'actions_taken',
          ts: '2026-05-03T23:00:02Z',
          game_id: 'g-test',
          decision_id: 'e1',
          player_id: 'p1',
          player: 'Human',
          actions: ['Aerial Mappers'],
        },
      ],
    },
  ], {minGap: 10});

  assert.strictEqual(stats.actionMismatches[0].bestMoveType, 'action');
  assert.strictEqual(stats.aggregates.actionTypes[0].key, 'blue_action <- action');
}

testDoesNotReuseMissAcrossFiles();
testIgnoresStaleMissInSameFile();
testUsesLinkedDecisionWhenPlayHasNoContext();
testClassifiesLinkedActions();
testActionMatchesAdvisorActionAlert();
testGenericAlertsDoNotRankActionMismatch();
testAggregatesBlueActionsOverPlayCards();
testClassifiesEmojiAdvisorMoveTypes();
console.log('human-learning-report tests: OK');
