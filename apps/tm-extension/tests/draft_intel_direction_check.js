#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.resolve(__dirname, '..', 'src', 'content-draft-intel.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const sandbox = {
  console,
  Set,
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

vm.runInNewContext(source, sandbox, {filename: sourcePath});

const draftIntel = sandbox.TM_CONTENT_DRAFT_INTEL;
assert(draftIntel && typeof draftIntel.getDraftIntel === 'function', 'draft intel helpers were not exported');

function getIntel(pv, currentCardNames) {
  return draftIntel.getDraftIntel({
    currentCardNames,
    getPlayerVueData: () => pv,
    detectGeneration: () => (pv.game ? pv.game.generation : 0),
    draftHistory: [],
    ratings: {},
  });
}

const players = [
  {color: 'red', name: 'Паша'},
  {color: 'green', name: 'Саша'},
  {color: 'pink', name: 'Даша'},
  {color: 'blue', name: 'Руслан'},
];

const liveLikeDraft = {
  game: {generation: 6, phase: 'drafting'},
  players: players,
  thisPlayer: {
    color: 'blue',
    waitingFor: {
      title: {
        message: 'Select a card to keep and pass the rest to ${0}',
        data: [{type: 1, value: 'Паша'}],
      },
    },
  },
};
assert.strictEqual(getIntel(liveLikeDraft, ['Indentured Workers', 'Eos Chasma National Park']).fromName, 'Даша');

const initialDraft = {
  game: {generation: 1, phase: 'initial_drafting'},
  players: players,
  thisPlayer: {
    color: 'blue',
    waitingFor: {
      title: {
        message: 'Select a card to keep and pass the rest to ${0}',
        data: [{type: 1, value: 'Даша'}],
      },
    },
  },
};
assert.strictEqual(getIntel(initialDraft, ['Card A', 'Card B']).fromName, 'Паша');

const fallbackDraft = {
  game: {generation: 6, phase: 'drafting'},
  players: players,
  thisPlayer: {color: 'blue'},
};
assert.strictEqual(getIntel(fallbackDraft, ['Card A', 'Card B']).fromName, 'Даша');

console.log('draft intel direction checks: OK');
