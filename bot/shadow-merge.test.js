#!/usr/bin/env node
'use strict';

const assert = require('assert');

const {
  collapseInputOnlyChains,
  inferShadowPromptTitle,
  isBrokenPromptTitle,
  matchInputsToShadow,
  mergeEntries,
  normalizeActionSummaryText,
  normalizePromptTitle,
  normalizeShadowPromptTitle,
  promptTitlesEquivalent,
  summarizePlayerInputAction,
} = require('./shadow-merge');

function testSummarizeInitialCards() {
  const summary = summarizePlayerInputAction({
    type: 'initialCards',
    responses: [
      {type: 'card', cards: ['Teractor']},
      {type: 'card', cards: ['Mohole Excavation', 'Loan']},
      {type: 'card', cards: []},
    ],
  });
  assert.strictEqual(summary, 'initialCards | corp=Teractor | preludes=Mohole Excavation, Loan');
}

function testSummarizeNestedOptionKeepsOuterIndex() {
  const summary = summarizePlayerInputAction({
    type: 'or',
    index: 3,
    response: {type: 'option'},
  });
  assert.strictEqual(summary, 'option[3]');
}

function testSummarizeOptionIncludesPromptLabel() {
  const summary = summarizePlayerInputAction({
    type: 'or',
    index: 1,
    response: {type: 'option'},
  }, {
    promptOptions: [
      {title: 'Spend 2X M€ to gain X energy', type: 'option'},
      {title: 'Decrease energy production 1 step to gain 8 M€', type: 'option'},
    ],
  });
  assert.strictEqual(summary, 'option[1]: Decrease energy production 1 step to gain 8 M€');
}

function testNormalizeHistoricalOptionSummary() {
  assert.strictEqual(normalizeActionSummaryText('option[undefined]'), 'option');
  assert.strictEqual(normalizeActionSummaryText('option[null]'), 'option');
  assert.strictEqual(normalizeActionSummaryText('option[2]'), 'option[2]');
}

function testMatchInputToShadowTurn() {
  const shadowTurns = [{
    gameId: 'g1',
    gen: 1,
    playerId: 'p1',
    player: 'InputLog1',
    color: 'blue',
    phase: 'research',
    promptType: 'initialCards',
    title: ' ',
    ts: '2026-04-09T13:28:22.610Z',
    resolvedAt: '2026-04-09T13:29:20.387Z',
    botAction: 'initialCards',
    observedAction: 'corp Teractor',
    playerActed: true,
    status: 'resolved',
  }];
  const inputEntries = [{
    source: 'player-input',
    gameId: 'g1',
    generation: 1,
    playerId: 'p1',
    player: 'InputLog1',
    color: 'blue',
    promptType: 'initialCards',
    promptTitle: ' ',
    promptButtonLabel: 'Start',
    ts: '2026-04-09T13:29:10.049Z',
    result: 'accepted',
    inputType: 'initialCards',
    isUndo: false,
    playerAction: {
      type: 'initialCards',
      responses: [
        {type: 'card', cards: ['Teractor']},
        {type: 'card', cards: ['Mohole Excavation', 'Loan']},
        {type: 'card', cards: []},
      ],
    },
    rawBody: '{"type":"initialCards"}',
  }];

  const {matches, precursorInputs, postMatchInputs, unusedInputs} = matchInputsToShadow(shadowTurns, inputEntries);
  assert.deepStrictEqual(matches.get(shadowTurns[0]), [inputEntries[0]]);
  assert.deepStrictEqual(precursorInputs.get(shadowTurns[0]) || [], []);
  assert.deepStrictEqual(postMatchInputs.get(shadowTurns[0]) || [], []);
  assert.deepStrictEqual(unusedInputs, []);
}

function testMergeEntriesProducesMatchedAndInputOnlyRows() {
  const shadowEntries = [{
    gameId: 'g2',
    gen: 4,
    playerId: 'p1',
    player: 'Ruslan',
    color: 'red',
    phase: 'action',
    promptType: 'or',
    title: 'Action',
    ts: '2026-04-09T14:00:00.000Z',
    resolvedAt: '2026-04-09T14:00:08.000Z',
    botAction: 'play Sponsors',
    observedAction: 'play Sponsors',
    playerActed: true,
    status: 'resolved',
  }];
  const inputEntries = [
    {
      source: 'player-input',
      gameId: 'g2',
      generation: 4,
      playerId: 'p1',
      player: 'Ruslan',
      color: 'red',
      promptType: 'or',
      promptTitle: 'Action',
      promptButtonLabel: 'Save',
      ts: '2026-04-09T14:00:05.000Z',
      result: 'accepted',
      inputType: 'projectCard',
      isUndo: false,
      playerAction: {type: 'projectCard', card: 'Sponsors'},
      rawBody: '{"type":"projectCard","card":"Sponsors"}',
    },
    {
      source: 'player-input',
      gameId: 'g2',
      generation: 4,
      playerId: 'p2',
      player: 'Other',
      color: 'blue',
      promptType: 'option',
      promptTitle: 'Confirm',
      promptButtonLabel: 'OK',
      ts: '2026-04-09T14:00:10.000Z',
      result: 'accepted',
      inputType: 'option',
      isUndo: false,
      playerAction: {type: 'option', index: 1},
      rawBody: '{"type":"option","index":1}',
    },
  ];

  const merged = mergeEntries('g2', shadowEntries, inputEntries);
  assert.strictEqual(merged.counts.matched, 1);
  assert.strictEqual(merged.counts.inputOnly, 1);
  assert.strictEqual(merged.mergedTurns[0].matchStatus, 'matched');
  assert.strictEqual(merged.mergedTurns[0].inputAction, 'play Sponsors');
  assert.strictEqual(merged.mergedTurns[0].inputs.length, 1);
  assert.strictEqual(merged.mergedTurns[1].matchStatus, 'input_only');
}

function testMergeEntriesCarriesOptionLabels() {
  const shadowEntries = [{
    gameId: 'g-label',
    gen: 7,
    playerId: 'p1',
    player: 'Ruslan',
    color: 'red',
    phase: 'action',
    promptType: 'or',
    title: 'Select one option',
    ts: '2026-04-09T14:00:00.000Z',
    resolvedAt: '2026-04-09T14:00:08.000Z',
    botAction: 'option[0]',
    observedAction: 'resource delta mc',
    playerActed: true,
    status: 'resolved',
  }];
  const inputEntries = [{
    source: 'player-input',
    gameId: 'g-label',
    generation: 7,
    playerId: 'p1',
    player: 'Ruslan',
    color: 'red',
    promptType: 'or',
    promptTitle: 'Select one option',
    promptButtonLabel: 'Confirm',
    promptOptions: [
      {title: 'Spend 2X M€ to gain X energy', type: 'option'},
      {title: 'Decrease energy production 1 step to gain 8 M€', type: 'option'},
    ],
    ts: '2026-04-09T14:00:05.000Z',
    result: 'accepted',
    inputType: 'or',
    isUndo: false,
    playerAction: {type: 'or', index: 1, response: {type: 'option'}},
    rawBody: '{"type":"or","index":1,"response":{"type":"option"}}',
  }];

  const merged = mergeEntries('g-label', shadowEntries, inputEntries);
  assert.strictEqual(merged.mergedTurns[0].inputAction, 'option[1]: Decrease energy production 1 step to gain 8 M€');
  assert.strictEqual(merged.mergedTurns[0].inputs[0].actionSummary, 'option[1]: Decrease energy production 1 step to gain 8 M€');
}

function testDraftTurnCanMatchMultipleInputsByObservedCards() {
  const shadowTurns = [{
    gameId: 'g3',
    gen: 1,
    playerId: 'p-red',
    player: 'Rav',
    color: 'red',
    phase: 'initial_drafting',
    promptType: 'card',
    ts: '2026-04-09T17:58:02.977Z',
    resolvedAt: '2026-04-09T17:59:39.275Z',
    botAction: 'cards: Robot Pollinators',
    observedAction: 'draft Mining Area, Stratospheric Expedition',
    observedChanges: {
      draftedAdded: ['Mining Area', 'Stratospheric Expedition'],
    },
  }];
  const inputEntries = [
    {
      source: 'player-input',
      gameId: 'g3',
      generation: 1,
      playerId: 'p-red',
      player: 'Rav',
      color: 'red',
      promptType: 'card',
      ts: '2026-04-09T17:59:26.155Z',
      result: 'accepted',
      playerAction: {type: 'card', cards: ['Mining Area']},
    },
    {
      source: 'player-input',
      gameId: 'g3',
      generation: 1,
      playerId: 'p-red',
      player: 'Rav',
      color: 'red',
      promptType: 'card',
      ts: '2026-04-09T17:59:30.942Z',
      result: 'accepted',
      playerAction: {type: 'card', cards: ['Stratospheric Expedition']},
    },
    {
      source: 'player-input',
      gameId: 'g3',
      generation: 1,
      playerId: 'p-red',
      player: 'Rav',
      color: 'red',
      promptType: 'card',
      ts: '2026-04-09T17:59:44.357Z',
      result: 'accepted',
      playerAction: {type: 'card', cards: ['Power Plant']},
    },
  ];

  const {matches, precursorInputs, postMatchInputs, unusedInputs} = matchInputsToShadow(shadowTurns, inputEntries);
  assert.deepStrictEqual(matches.get(shadowTurns[0]), [inputEntries[0], inputEntries[1]]);
  assert.deepStrictEqual(precursorInputs.get(shadowTurns[0]) || [], []);
  assert.deepStrictEqual(postMatchInputs.get(shadowTurns[0]) || [], []);
  assert.deepStrictEqual(unusedInputs, [inputEntries[2]]);
}

function testActionTitlesNormalizeTogether() {
  assert.strictEqual(normalizePromptTitle('Take your first action'), 'Take your action');
  assert.strictEqual(normalizePromptTitle('Take your next action'), 'Take your action');
  assert.strictEqual(promptTitlesEquivalent('Take your first action', 'Take your next action'), true);
}

function testBrokenDraftTitleGetsInferred() {
  const shadow = {
    promptType: 'card',
    phase: 'initial_drafting',
    title: '[object Object]',
    observedChanges: {
      draftedAdded: ['Olympus Conference'],
      currentPackRemoved: ['Olympus Conference', 'Comet Aiming'],
    },
  };
  assert.strictEqual(isBrokenPromptTitle(shadow.title), true);
  assert.strictEqual(inferShadowPromptTitle(shadow), 'Select a card to keep and pass the rest to ${0}');
  assert.strictEqual(normalizeShadowPromptTitle(shadow), 'Select a card to keep and pass the rest to ${0}');
}

function testMergeAbsorbsPrecursorInputsIntoTrail() {
  const shadowEntries = [{
    gameId: 'g4',
    gen: 2,
    playerId: 'p-green',
    player: 'Аня',
    color: 'green',
    phase: 'research',
    promptType: 'card',
    title: 'Select card(s) to buy',
    ts: '2026-04-09T18:12:54.152Z',
    resolvedAt: '2026-04-09T18:13:01.147Z',
    botAction: 'cards: Anti-Gravity Technology, Callisto Penal Mines, Extreme-Cold Fungus',
    observedAction: 'resource delta mc',
    playerActed: true,
    status: 'resolved',
  }];
  const inputEntries = [
    {
      source: 'player-input',
      gameId: 'g4',
      generation: 2,
      playerId: 'p-green',
      player: 'Аня',
      color: 'green',
      promptType: 'card',
      promptTitle: 'Select card(s) to buy',
      ts: '2026-04-09T18:12:28.094Z',
      result: 'accepted',
      playerAction: {type: 'card', cards: ['Atmo Collectors']},
    },
    {
      source: 'player-input',
      gameId: 'g4',
      generation: 2,
      playerId: 'p-green',
      player: 'Аня',
      color: 'green',
      promptType: 'card',
      promptTitle: 'Select card(s) to buy',
      ts: '2026-04-09T18:12:49.706Z',
      result: 'accepted',
      playerAction: {type: 'card', cards: ['Mine']},
    },
    {
      source: 'player-input',
      gameId: 'g4',
      generation: 2,
      playerId: 'p-green',
      player: 'Аня',
      color: 'green',
      promptType: 'card',
      promptTitle: 'Select card(s) to buy',
      ts: '2026-04-09T18:12:59.826Z',
      result: 'accepted',
      playerAction: {type: 'card', cards: ['Atmo Collectors', 'Mine']},
    },
  ];

  const merged = mergeEntries('g4', shadowEntries, inputEntries);
  assert.strictEqual(merged.counts.matched, 1);
  assert.strictEqual(merged.counts.inputOnly, 0);
  assert.strictEqual(merged.mergedTurns[0].inputAction, 'cards: Atmo Collectors, Mine');
  assert.strictEqual(merged.mergedTurns[0].inputs.length, 1);
  assert.strictEqual(merged.mergedTurns[0].inputTrail.length, 3);
  assert.deepStrictEqual(merged.mergedTurns[0].inputTrail.map((entry) => entry.role), ['precursor', 'precursor', 'matched']);
}

function testOrResponseProjectCardMatchesObservedPlay() {
  const shadowEntries = [{
    gameId: 'g5',
    gen: 3,
    playerId: 'p-green',
    player: 'Аня',
    color: 'green',
    phase: 'action',
    promptType: 'or',
    title: 'Take your first action',
    ts: '2026-04-09T18:17:35.724Z',
    resolvedAt: '2026-04-09T18:18:07.550Z',
    botAction: 'option[3]',
    observedAction: 'play Imported GHG',
    observedChanges: {
      tableauAdded: ['Imported GHG'],
    },
    playerActed: true,
    status: 'resolved',
  }];
  const inputEntries = [{
    source: 'player-input',
    gameId: 'g5',
    generation: 3,
    playerId: 'p-green',
    player: 'Аня',
    color: 'green',
    promptType: 'or',
    promptTitle: 'Take your first action',
    ts: '2026-04-09T18:17:52.745Z',
    result: 'accepted',
    inputType: 'or',
    playerAction: {
      type: 'or',
      index: 1,
      response: {
        type: 'projectCard',
        card: 'Imported GHG',
      },
    },
  }];

  const merged = mergeEntries('g5', shadowEntries, inputEntries);
  assert.strictEqual(merged.counts.matched, 1);
  assert.strictEqual(merged.counts.shadowOnly, 0);
  assert.strictEqual(merged.counts.inputOnly, 0);
  assert.strictEqual(merged.mergedTurns[0].inputAction, 'play Imported GHG');
}

function testMatchedTurnAbsorbsSpaceFollowup() {
  const shadowEntries = [{
    gameId: 'g6',
    gen: 3,
    playerId: 'p-green',
    player: 'Аня',
    color: 'green',
    phase: 'action',
    promptType: 'or',
    title: 'Take your next action',
    ts: '2026-04-09T18:18:42.000Z',
    resolvedAt: '2026-04-09T18:18:58.786Z',
    botAction: 'option[3]',
    observedAction: 'play Immigrant City',
    observedChanges: {
      tableauAdded: ['Immigrant City'],
    },
    playerActed: true,
    status: 'resolved',
  }];
  const inputEntries = [
    {
      source: 'player-input',
      gameId: 'g6',
      generation: 3,
      playerId: 'p-green',
      player: 'Аня',
      color: 'green',
      promptType: 'or',
      promptTitle: 'Take your next action',
      ts: '2026-04-09T18:18:42.470Z',
      result: 'accepted',
      inputType: 'or',
      playerAction: {type: 'or', response: {type: 'projectCard', card: 'Immigrant City'}},
    },
    {
      source: 'player-input',
      gameId: 'g6',
      generation: 3,
      playerId: 'p-green',
      player: 'Аня',
      color: 'green',
      promptType: 'space',
      promptTitle: 'Select space for city tile',
      ts: '2026-04-09T18:18:52.160Z',
      result: 'accepted',
      inputType: 'space',
      playerAction: {type: 'space', spaceId: '21'},
    },
  ];

  const merged = mergeEntries('g6', shadowEntries, inputEntries);
  assert.strictEqual(merged.counts.matched, 1);
  assert.strictEqual(merged.counts.inputOnly, 0);
  assert.strictEqual(merged.mergedTurns[0].inputs.length, 1);
  assert.strictEqual(merged.mergedTurns[0].inputTrail.length, 2);
  assert.deepStrictEqual(merged.mergedTurns[0].inputTrail.map((entry) => entry.role), ['matched', 'followup']);
}

function testMatchedTurnAbsorbsExtraPlayedCardWithinSameResolve() {
  const shadowEntries = [{
    gameId: 'g7',
    gen: 3,
    playerId: 'p-red',
    player: 'Rav',
    color: 'red',
    phase: 'action',
    promptType: 'or',
    title: 'Take your first action',
    ts: '2026-04-09T18:20:00.000Z',
    resolvedAt: '2026-04-09T18:20:14.977Z',
    botAction: 'option[1]',
    observedAction: 'play Viral Enhancers, Meat Industry',
    observedChanges: {
      tableauAdded: ['Viral Enhancers', 'Meat Industry'],
    },
    playerActed: true,
    status: 'resolved',
  }];
  const inputEntries = [
    {
      source: 'player-input',
      gameId: 'g7',
      generation: 3,
      playerId: 'p-red',
      player: 'Rav',
      color: 'red',
      promptType: 'or',
      promptTitle: 'Take your first action',
      ts: '2026-04-09T18:20:02.032Z',
      result: 'accepted',
      inputType: 'or',
      playerAction: {type: 'or', response: {type: 'projectCard', card: 'Viral Enhancers'}},
    },
    {
      source: 'player-input',
      gameId: 'g7',
      generation: 3,
      playerId: 'p-red',
      player: 'Rav',
      color: 'red',
      promptType: 'or',
      promptTitle: 'Take your next action',
      ts: '2026-04-09T18:20:05.992Z',
      result: 'accepted',
      inputType: 'or',
      playerAction: {type: 'or', response: {type: 'projectCard', card: 'Meat Industry'}},
    },
  ];

  const merged = mergeEntries('g7', shadowEntries, inputEntries);
  assert.strictEqual(merged.counts.matched, 1);
  assert.strictEqual(merged.counts.inputOnly, 0);
  assert.strictEqual(merged.mergedTurns[0].inputs.length, 2);
  assert.strictEqual(merged.mergedTurns[0].inputAction, 'play Viral Enhancers + play Meat Industry');
  assert.deepStrictEqual(merged.mergedTurns[0].inputTrail.map((entry) => entry.role), ['matched', 'matched']);
}

function testCollapseInputOnlyActionChain() {
  const mergedTurns = [
    {
      type: 'merged_turn',
      matchStatus: 'input_only',
      playerId: 'p-black',
      player: 'Серый',
      generation: 3,
      promptType: 'or',
      promptTitle: 'Take your first action',
      inputTs: '2026-04-09T18:20:11.081Z',
      input: {raw: {gameId: 'g8', generation: 3, playerId: 'p-black', player: 'Серый', promptType: 'or', promptTitle: 'Take your first action', ts: '2026-04-09T18:20:11.081Z', result: 'accepted', playerAction: {type: 'or', response: {type: 'card', cards: ['Aerial Mappers']}}}},
      inputTrail: [{raw: {gameId: 'g8', generation: 3, playerId: 'p-black', player: 'Серый', promptType: 'or', promptTitle: 'Take your first action', ts: '2026-04-09T18:20:11.081Z', result: 'accepted', playerAction: {type: 'or', response: {type: 'card', cards: ['Aerial Mappers']}}}}],
    },
    {
      type: 'merged_turn',
      matchStatus: 'input_only',
      playerId: 'p-black',
      player: 'Серый',
      generation: 3,
      promptType: 'card',
      promptTitle: 'Select card to add ${0} ${1}',
      inputTs: '2026-04-09T18:20:12.901Z',
      input: {raw: {gameId: 'g8', generation: 3, playerId: 'p-black', player: 'Серый', promptType: 'card', promptTitle: 'Select card to add ${0} ${1}', ts: '2026-04-09T18:20:12.901Z', result: 'accepted', playerAction: {type: 'card', cards: ['Aerial Mappers']}}},
      inputTrail: [{raw: {gameId: 'g8', generation: 3, playerId: 'p-black', player: 'Серый', promptType: 'card', promptTitle: 'Select card to add ${0} ${1}', ts: '2026-04-09T18:20:12.901Z', result: 'accepted', playerAction: {type: 'card', cards: ['Aerial Mappers']}}}],
    },
    {
      type: 'merged_turn',
      matchStatus: 'input_only',
      playerId: 'p-black',
      player: 'Серый',
      generation: 3,
      promptType: 'or',
      promptTitle: 'Take your next action',
      inputTs: '2026-04-09T18:20:14.593Z',
      input: {raw: {gameId: 'g8', generation: 3, playerId: 'p-black', player: 'Серый', promptType: 'or', promptTitle: 'Take your next action', ts: '2026-04-09T18:20:14.593Z', result: 'accepted', playerAction: {type: 'or', response: {type: 'option'}}}},
      inputTrail: [{raw: {gameId: 'g8', generation: 3, playerId: 'p-black', player: 'Серый', promptType: 'or', promptTitle: 'Take your next action', ts: '2026-04-09T18:20:14.593Z', result: 'accepted', playerAction: {type: 'or', response: {type: 'option'}}}}],
    },
  ];

  const collapsed = collapseInputOnlyChains(mergedTurns);
  assert.strictEqual(collapsed.length, 1);
  assert.strictEqual(collapsed[0].matchStatus, 'input_only');
  assert.strictEqual(collapsed[0].synthetic, true);
  assert.strictEqual(collapsed[0].syntheticSize, 3);
  assert.strictEqual(collapsed[0].inputTrail.length, 3);
}

function testMergeEntriesCollapsesDraftInputOnlyChain() {
  const inputEntries = [
    {
      source: 'player-input',
      gameId: 'g9',
      generation: 4,
      playerId: 'p-red',
      player: 'Rav',
      color: 'red',
      promptType: 'card',
      promptTitle: 'Select a card to keep and pass the rest to ${0}',
      ts: '2026-04-09T18:21:07.583Z',
      result: 'accepted',
      inputType: 'card',
      playerAction: {type: 'card', cards: ['Breathing Filters']},
    },
    {
      source: 'player-input',
      gameId: 'g9',
      generation: 4,
      playerId: 'p-red',
      player: 'Rav',
      color: 'red',
      promptType: 'card',
      promptTitle: 'Select a card to keep and pass the rest to ${0}',
      ts: '2026-04-09T18:21:18.400Z',
      result: 'accepted',
      inputType: 'card',
      playerAction: {type: 'card', cards: ['Geothermal Power']},
    },
  ];

  const merged = mergeEntries('g9', [], inputEntries);
  assert.strictEqual(merged.counts.inputOnly, 1);
  assert.strictEqual(merged.mergedTurns.length, 1);
  assert.strictEqual(merged.mergedTurns[0].synthetic, true);
  assert.strictEqual(merged.mergedTurns[0].inputTrail.length, 2);
  assert.strictEqual(merged.mergedTurns[0].inputAction, 'cards: Breathing Filters + cards: Geothermal Power');
}

function testBrokenShadowTitleStillMatchesHistoricalDraftInput() {
  const shadowEntries = [{
    gameId: 'g10',
    gen: 1,
    playerId: 'p-green',
    player: 'Аня',
    color: 'green',
    phase: 'initial_drafting',
    promptType: 'card',
    title: '[object Object]',
    ts: '2026-04-09T17:58:02.976Z',
    resolvedAt: '2026-04-09T17:58:39.115Z',
    botAction: 'cards: Adapted Lichen',
    observedAction: 'draft Olympus Conference',
    observedChanges: {
      draftedAdded: ['Olympus Conference'],
      currentPackRemoved: ['Stratospheric Expedition', 'Comet Aiming', 'Olympus Conference'],
    },
    playerActed: true,
    status: 'resolved',
  }];
  const inputEntries = [{
    source: 'player-input',
    gameId: 'g10',
    generation: 1,
    playerId: 'p-green',
    player: 'Аня',
    color: 'green',
    promptType: 'card',
    promptTitle: 'Select a card to keep and pass the rest to ${0}',
    ts: '2026-04-09T17:58:31.000Z',
    result: 'accepted',
    inputType: 'card',
    playerAction: {type: 'card', cards: ['Olympus Conference']},
  }];

  const merged = mergeEntries('g10', shadowEntries, inputEntries);
  assert.strictEqual(merged.counts.matched, 1);
  assert.strictEqual(merged.counts.shadowOnly, 0);
  assert.strictEqual(merged.counts.inputOnly, 0);
  assert.strictEqual(merged.mergedTurns[0].promptTitle, 'Select a card to keep and pass the rest to ${0}');
}

function testMergeNormalizesHistoricalBotActionSummary() {
  const merged = mergeEntries('g11', [{
    gameId: 'g11',
    gen: 4,
    playerId: 'p1',
    player: 'Rav',
    color: 'red',
    phase: 'action',
    promptType: 'option',
    title: 'Spend 3 M€ to draw a blue card',
    ts: '2026-04-09T18:30:00.000Z',
    resolvedAt: '2026-04-09T18:30:02.000Z',
    botAction: 'option[undefined]',
    observedAction: 'resource delta mc',
    status: 'resolved',
  }], []);

  assert.strictEqual(merged.mergedTurns[0].botAction, 'option');
}

function testMergeReconcilesDraftShadowOnlyWithSyntheticInputOnlyCluster() {
  const shadowEntries = [{
    gameId: 'g12',
    gen: 1,
    playerId: 'p-red',
    player: 'Rav',
    color: 'red',
    phase: 'initial_drafting',
    promptType: 'card',
    title: 'Select two cards to keep and pass the rest to ${0}',
    ts: '2026-04-09T17:58:02.977Z',
    resolvedAt: '2026-04-09T17:59:39.275Z',
    botAction: 'cards: Robot Pollinators',
    observedAction: 'draft Mining Area, Stratospheric Expedition',
    observedChanges: {
      draftedAdded: ['Mining Area', 'Stratospheric Expedition'],
    },
    playerActed: true,
    status: 'resolved',
  }];
  const inputEntries = [
    {
      source: 'player-input',
      gameId: 'g12',
      generation: 1,
      playerId: 'p-red',
      player: 'Rav',
      color: 'red',
      promptType: 'card',
      promptTitle: 'Select a card to keep and pass the rest to ${0}',
      ts: '2026-04-09T17:59:26.155Z',
      result: 'accepted',
      inputType: 'card',
      playerAction: {type: 'card', cards: ['Mining Area']},
    },
    {
      source: 'player-input',
      gameId: 'g12',
      generation: 1,
      playerId: 'p-red',
      player: 'Rav',
      color: 'red',
      promptType: 'card',
      promptTitle: 'Select a card to keep and pass the rest to ${0}',
      ts: '2026-04-09T17:59:30.942Z',
      result: 'accepted',
      inputType: 'card',
      playerAction: {type: 'card', cards: ['Stratospheric Expedition']},
    },
  ];

  const merged = mergeEntries('g12', shadowEntries, inputEntries);
  assert.strictEqual(merged.counts.matched, 1);
  assert.strictEqual(merged.counts.shadowOnly, 0);
  assert.strictEqual(merged.counts.inputOnly, 0);
  assert.strictEqual(merged.mergedTurns[0].inputAction, 'cards: Mining Area + cards: Stratospheric Expedition');
  assert.strictEqual(merged.mergedTurns[0].reconciled.stage, 'shadow_input_only_overlap');
}

function testDraftReconcileSkipsSyntheticClusterWithExtraCards() {
  const shadowEntries = [{
    gameId: 'g13',
    gen: 1,
    playerId: 'p-black',
    player: 'Серый',
    color: 'black',
    phase: 'initial_drafting',
    promptType: 'card',
    title: 'Select two cards to keep and pass the rest to ${0}',
    ts: '2026-04-09T18:00:11.226Z',
    resolvedAt: '2026-04-09T18:00:56.341Z',
    botAction: 'cards: Tectonic Stress Power',
    observedAction: 'draft Tectonic Stress Power, Soil Factory',
    observedChanges: {
      draftedAdded: ['Tectonic Stress Power', 'Soil Factory'],
    },
    playerActed: true,
    status: 'resolved',
  }];
  const inputEntries = [
    {
      source: 'player-input',
      gameId: 'g13',
      generation: 1,
      playerId: 'p-black',
      player: 'Серый',
      color: 'black',
      promptType: 'card',
      promptTitle: 'Select a card to keep and pass the rest to ${0}',
      ts: '2026-04-09T18:00:41.316Z',
      result: 'accepted',
      inputType: 'card',
      playerAction: {type: 'card', cards: ['Tectonic Stress Power']},
    },
    {
      source: 'player-input',
      gameId: 'g13',
      generation: 1,
      playerId: 'p-black',
      player: 'Серый',
      color: 'black',
      promptType: 'card',
      promptTitle: 'Select a card to keep and pass the rest to ${0}',
      ts: '2026-04-09T18:00:53.990Z',
      result: 'accepted',
      inputType: 'card',
      playerAction: {type: 'card', cards: ['Equatorial Magnetizer']},
    },
  ];

  const merged = mergeEntries('g13', shadowEntries, inputEntries);
  assert.strictEqual(merged.counts.matched, 0);
  assert.strictEqual(merged.counts.shadowOnly, 1);
  assert.strictEqual(merged.counts.inputOnly, 1);
}

function testSeqRangeMatchesInputsWithoutPromptHeuristics() {
  const shadowEntries = [{
    gameId: 'g14',
    gen: 3,
    playerId: 'p-red',
    player: 'Rav',
    color: 'red',
    phase: 'action',
    promptType: 'or',
    title: 'Take your first action',
    promptInputSeq: 5,
    inputSeq: 7,
    ts: '2026-04-09T18:20:00.000Z',
    resolvedAt: '2026-04-09T18:20:14.977Z',
    botAction: 'option[1]',
    observedAction: 'play Viral Enhancers, Meat Industry',
    observedChanges: {
      tableauAdded: ['Viral Enhancers', 'Meat Industry'],
    },
    playerActed: true,
    status: 'resolved',
  }];
  const inputEntries = [
    {
      source: 'player-input',
      gameId: 'g14',
      generation: 3,
      playerId: 'p-red',
      player: 'Rav',
      color: 'red',
      promptType: 'space',
      promptTitle: 'Totally different prompt',
      promptInputSeq: 5,
      inputSeq: 6,
      ts: '2026-04-09T18:20:02.032Z',
      result: 'accepted',
      inputType: 'or',
      playerAction: {type: 'or', response: {type: 'projectCard', card: 'Viral Enhancers'}},
    },
    {
      source: 'player-input',
      gameId: 'g14',
      generation: 3,
      playerId: 'p-red',
      player: 'Rav',
      color: 'red',
      promptType: 'card',
      promptTitle: 'Another prompt',
      promptInputSeq: 6,
      inputSeq: 7,
      ts: '2026-04-09T18:20:05.992Z',
      result: 'accepted',
      inputType: 'or',
      playerAction: {type: 'or', response: {type: 'projectCard', card: 'Meat Industry'}},
    },
  ];

  const merged = mergeEntries('g14', shadowEntries, inputEntries);
  assert.strictEqual(merged.counts.matched, 1);
  assert.strictEqual(merged.counts.inputOnly, 0);
  assert.strictEqual(merged.mergedTurns[0].inputAction, 'play Viral Enhancers + play Meat Industry');
  assert.strictEqual(merged.mergedTurns[0].promptInputSeq, 5);
  assert.strictEqual(merged.mergedTurns[0].inputSeq, 7);
}

function main() {
  testSummarizeInitialCards();
  testSummarizeNestedOptionKeepsOuterIndex();
  testSummarizeOptionIncludesPromptLabel();
  testNormalizeHistoricalOptionSummary();
  testMatchInputToShadowTurn();
  testMergeEntriesProducesMatchedAndInputOnlyRows();
  testMergeEntriesCarriesOptionLabels();
  testDraftTurnCanMatchMultipleInputsByObservedCards();
  testActionTitlesNormalizeTogether();
  testBrokenDraftTitleGetsInferred();
  testMergeAbsorbsPrecursorInputsIntoTrail();
  testOrResponseProjectCardMatchesObservedPlay();
  testMatchedTurnAbsorbsSpaceFollowup();
  testMatchedTurnAbsorbsExtraPlayedCardWithinSameResolve();
  testCollapseInputOnlyActionChain();
  testMergeEntriesCollapsesDraftInputOnlyChain();
  testBrokenShadowTitleStillMatchesHistoricalDraftInput();
  testMergeNormalizesHistoricalBotActionSummary();
  testMergeReconcilesDraftShadowOnlyWithSyntheticInputOnlyCluster();
  testDraftReconcileSkipsSyntheticClusterWithExtraCards();
  testSeqRangeMatchesInputsWithoutPromptHeuristics();
  console.log('shadow-merge tests passed');
}

main();
