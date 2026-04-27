#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const {
  buildStateSummary,
  deriveObservedChanges,
  getPlayersToPoll,
  multisetAdded,
  pollShadowSession,
  resolvePendingEntry,
  shouldCreatePredictionForSummary,
  summarizeAction,
  summarizeObservedAction,
} = require('./shadow-runtime');

function testMultisetAdded() {
  assert.deepStrictEqual(
    multisetAdded(['A', 'B', 'A'], ['A', 'B']),
    ['A'],
  );
}

function testObservedCardPlay() {
  const prev = {
    tableau: ['Sponsors'],
    cardsInHand: ['Comet', 'Adaptation Technology'],
    draftedCards: [],
    pickedCorpCards: [],
    preludeCardsInHand: [],
    ceoCardsInHand: [],
    currentPack: [],
    actionsThisGeneration: ['trade'],
    mc: 26,
    tr: 22,
    heat: 3,
    plants: 5,
    energy: 2,
    steel: 0,
    titanium: 1,
    promptType: 'or',
    phase: 'action',
    generation: 6,
    lastCardPlayed: 'Sponsors',
  };
  const curr = {
    ...prev,
    tableau: ['Sponsors', 'Comet'],
    cardsInHand: ['Adaptation Technology'],
    mc: 5,
    heat: 0,
    promptType: 'or',
    lastCardPlayed: 'Comet',
  };

  const changes = deriveObservedChanges(prev, curr);
  assert.deepStrictEqual(changes.tableauAdded, ['Comet']);
  assert.strictEqual(summarizeObservedAction(changes), 'play Comet');
}

function testObservedDraftPick() {
  const prev = {
    tableau: [],
    cardsInHand: [],
    draftedCards: [],
    pickedCorpCards: [],
    preludeCardsInHand: [],
    ceoCardsInHand: [],
    currentPack: ['Mars University', 'Power Plant', 'Inventors Guild'],
    actionsThisGeneration: [],
    mc: 42,
    tr: 20,
    heat: 0,
    plants: 0,
    energy: 0,
    steel: 0,
    titanium: 0,
    promptType: 'card',
    phase: 'research',
    generation: 1,
    lastCardPlayed: null,
  };
  const curr = {
    ...prev,
    draftedCards: ['Mars University'],
    currentPack: ['Power Plant', 'Inventors Guild'],
  };

  const changes = deriveObservedChanges(prev, curr);
  assert.deepStrictEqual(changes.draftedAdded, ['Mars University']);
  assert.strictEqual(summarizeObservedAction(changes), 'draft Mars University');
}

function testStateSummaryNormalizesMegaCredits() {
  const summary = buildStateSummary({
    game: {gameId: 'g1', generation: 2, phase: 'action', activePlayer: 'red'},
    thisPlayer: {
      name: 'Ruslan',
      color: 'red',
      megaCredits: 37,
      terraformRating: 24,
      tableau: [{name: 'Sponsors'}],
      actionsThisGeneration: [],
    },
    cardsInHand: [{name: 'Comet'}],
    waitingFor: {type: 'or', title: 'Action', cards: []},
  }, {playerId: 'p1'});

  assert.strictEqual(summary.mc, 37);
  assert.strictEqual(summary.playerId, 'p1');
  assert.deepStrictEqual(summary.cardsInHand, ['Comet']);
}

function testStateSummaryExtractsMessageTitle() {
  const summary = buildStateSummary({
    game: {gameId: 'g2', generation: 1, phase: 'initial_drafting', activePlayer: 'red', inputSeq: 4},
    thisPlayer: {
      name: 'Rav',
      color: 'red',
      megaCredits: 42,
      terraformRating: 20,
      tableau: [],
      actionsThisGeneration: [],
    },
    cardsInHand: [],
    waitingFor: {
      type: 'card',
      title: {
        message: 'Select a card to keep and pass the rest to ${0}',
        data: [],
      },
      cards: [],
    },
  }, {playerId: 'p2'});

  assert.strictEqual(summary.title, 'Select a card to keep and pass the rest to ${0}');
  assert.strictEqual(summary.inputSeq, 4);
}

function testSolarPhaseStalePromptDoesNotCreatePrediction() {
  const summary = buildStateSummary({
    game: {gameId: 'g3', generation: 2, phase: 'solar', activePlayer: 'red', inputSeq: 12},
    thisPlayer: {
      name: 'Ruslan',
      color: 'red',
      megaCredits: 11,
      terraformRating: 20,
      tableau: [],
      actionsThisGeneration: [],
    },
    cardsInHand: [{name: 'Cloud Tourism'}],
    waitingFor: {
      type: 'or',
      title: 'Take your next action',
      options: [{title: 'Play project card', type: 'card', cards: [{name: 'Cloud Tourism'}]}],
    },
  }, {playerId: 'p3'});

  assert.notStrictEqual(summary.workflowHash, 'idle');
  assert.strictEqual(shouldCreatePredictionForSummary(summary), false);
}

function testSummarizeActionOptionWithoutIndex() {
  assert.strictEqual(summarizeAction({type: 'option'}), 'option');
  assert.strictEqual(summarizeAction({type: 'option', index: 2}), 'option[2]');
}

function testGetPlayersToPollUsesAllPlayersDuringInputBurst() {
  const session = {
    inputBurstPollsRemaining: 2,
    players: [
      {id: 'p1', color: 'red'},
      {id: 'p2', color: 'blue'},
      {id: 'p3', color: 'green'},
    ],
    playerState: new Map([
      ['p1', {pendingShadow: null}],
      ['p2', {pendingShadow: null}],
      ['p3', {pendingShadow: null}],
    ]),
    colorToPlayerId: new Map([
      ['red', 'p1'],
      ['blue', 'p2'],
      ['green', 'p3'],
    ]),
  };
  const polled = getPlayersToPoll(session, {phase: 'action', activePlayer: 'red'});
  assert.deepStrictEqual(polled.sort(), ['p1', 'p2', 'p3']);
}

function testResolvePendingEntryUsesInputSeqForPlayerActed() {
  const resolved = resolvePendingEntry(
    {promptInputSeq: 4, inputSeq: null},
    {
      inputSeq: 4,
      promptType: 'or',
      phase: 'action',
      generation: 3,
      lastCardPlayed: null,
      tableau: [],
      cardsInHand: [],
      draftedCards: [],
      currentPack: [],
      pickedCorpCards: [],
      preludeCardsInHand: [],
      ceoCardsInHand: [],
      actionsThisGeneration: [],
      mc: 10,
      tr: 20,
      heat: 0,
      plants: 0,
      energy: 0,
      steel: 0,
      titanium: 0,
    },
    {
      inputSeq: 5,
      promptType: null,
      phase: 'action',
      generation: 3,
      lastCardPlayed: null,
      tableau: [],
      cardsInHand: [],
      draftedCards: [],
      currentPack: [],
      pickedCorpCards: [],
      preludeCardsInHand: [],
      ceoCardsInHand: [],
      actionsThisGeneration: [],
      mc: 10,
      tr: 20,
      heat: 0,
      plants: 0,
      energy: 0,
      steel: 0,
      titanium: 0,
    },
  );
  assert.strictEqual(resolved.playerActed, true);
  assert.strictEqual(resolved.promptInputSeq, 4);
  assert.strictEqual(resolved.inputSeq, 5);
}

async function testPollContinuesOnTransientGameFetchFailure() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/game')) {
      res.writeHead(502, {'content-type': 'text/plain'});
      res.end('bad gateway');
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const logFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-runtime-test-')),
    'shadow-g-test.jsonl',
  );
  try {
    const result = await pollShadowSession({
      gameId: 'g-test',
      serverUrl: `http://127.0.0.1:${address.port}`,
      logFile,
      players: [],
      playerState: new Map(),
      colorToPlayerId: new Map(),
      inputBurstPollsRemaining: 0,
    });
    assert.strictEqual(result.active, true, result);
    assert.strictEqual(result.status, 'unavailable', result);
    assert.match(fs.readFileSync(logFile, 'utf8'), /shadow_game_unavailable/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  testMultisetAdded();
  testObservedCardPlay();
  testObservedDraftPick();
  testStateSummaryNormalizesMegaCredits();
  testStateSummaryExtractsMessageTitle();
  testSolarPhaseStalePromptDoesNotCreatePrediction();
  testSummarizeActionOptionWithoutIndex();
  testGetPlayersToPollUsesAllPlayersDuringInputBurst();
  testResolvePendingEntryUsesInputSeqForPlayerActed();
  await testPollContinuesOnTransientGameFetchFailure();
  console.log('shadow-runtime tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
