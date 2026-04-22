#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.resolve(__dirname, '..', '..', '..', 'extension', 'advisor-panel.js');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeDocument() {
  return {
    hidden: false,
    body: {
      getAttribute() { return ''; },
      setAttribute() {},
    },
    getElementById() { return null; },
    querySelector() { return null; },
    addEventListener() {},
    createElement() {
      return {
        textContent: '',
        get innerHTML() {
          return escapeHtml(this.textContent);
        },
        set innerHTML(value) {
          this.textContent = String(value || '');
        },
      };
    },
  };
}

const documentObj = makeDocument();
const windowObj = {
  TM_ADVISOR: {
    endgameTiming(state) {
      return state && state.__timing ? state.__timing : { estimatedGens: 4 };
    },
    analyzeActions(waitingFor) {
      if (!waitingFor || !Array.isArray(waitingFor.options)) return [];
      return waitingFor.options.map((option, index) => ({
        index,
        action: option.title || '',
        score: 50 - index,
        reason: 'ranked',
      }));
    },
  },
  __TM_ADVISOR_PANEL_TEST_HOOKS__: true,
  location: { pathname: '/noop' },
  addEventListener() {},
};

const sandbox = {
  console,
  document: documentObj,
  window: windowObj,
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  },
  setTimeout() { return 0; },
  setInterval() { return 0; },
  clearTimeout() {},
  clearInterval() {},
};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });

const hooks = windowObj.__TM_ADVISOR_PANEL_TEST__;
assert(hooks, 'advisor-panel should expose test hooks when requested');

const noPromptState = { thisPlayer: { name: 'me' } };
assert.strictEqual(hooks.buildBotActionHint(noPromptState), null, 'bot hint should still require a live waitingFor prompt');
const noPromptStatus = hooks.buildBotHintStatus(noPromptState);
assert.strictEqual(noPromptStatus.title, 'No live action prompt');
assert(noPromptStatus.reason.includes('context-only'), noPromptStatus.reason);

const spacePromptStatus = hooks.buildBotHintStatus({
  thisPlayer: { name: 'me' },
  _waitingFor: { type: 'space', title: 'Select space for greenery tile' },
});
assert.strictEqual(spacePromptStatus.title, 'Prompt: Select space for greenery tile');
assert(spacePromptStatus.reason.includes('action-choice'), spacePromptStatus.reason);

const emptyOrStatus = hooks.buildBotHintStatus({
  thisPlayer: { name: 'me' },
  _waitingFor: { type: 'or', title: 'Take your next action', options: [] },
});
assert.strictEqual(emptyOrStatus.title, 'No action options');

const rankedState = {
  thisPlayer: { name: 'me' },
  _waitingFor: {
    type: 'or',
    title: 'Take your next action',
    options: [{ title: 'Pass for this generation' }],
  },
};
assert.strictEqual(hooks.buildBotHintStatus(rankedState, [{ action: 'Pass for this generation' }]), null);
const botHint = hooks.buildBotActionHint(rankedState);
assert.strictEqual(botHint.title, 'Pass');
assert.strictEqual(botHint.reason, 'ranked');

const statusHtml = hooks.renderBotHintCard(noPromptStatus, true);
assert(statusHtml.includes('tm-advisor-bot-status'), statusHtml);
assert(statusHtml.includes('No live action prompt'), statusHtml);

const lowProdMidgame = hooks.collectVarianceWarnings({
  __timing: { estimatedGens: 4 },
  game: { generation: 4, phase: 'action' },
  thisPlayer: {
    megaCreditProduction: 0,
    tableau: [],
    cardsInHand: [],
  },
});
assert(lowProdMidgame.some((line) => line.includes('Low production')), lowProdMidgame);

const lowProdLastGen = hooks.collectVarianceWarnings({
  __timing: { estimatedGens: 1 },
  game: { generation: 9, phase: 'action' },
  thisPlayer: {
    megaCreditProduction: 0,
    tableau: [],
    cardsInHand: [],
  },
});
assert(!lowProdLastGen.some((line) => line.includes('Low production')), lowProdLastGen);

const lowProdEndgamePhase = hooks.collectVarianceWarnings({
  __timing: { estimatedGens: 2 },
  game: { generation: 9, phase: 'endgame' },
  thisPlayer: {
    megaCreditProduction: 0,
    tableau: [],
    cardsInHand: [],
  },
});
assert(!lowProdEndgamePhase.some((line) => line.includes('Low production')), lowProdEndgamePhase);

console.log('advisor-panel bot hint checks: OK');
