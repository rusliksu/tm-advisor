#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.resolve(__dirname, '..', 'src', 'advisor-panel.js');
const source = fs.readFileSync(sourcePath, 'utf8');

let analyzeCalls = 0;
function makeElement() {
  const attrs = Object.create(null);
  return {
    classList: {add() {}, remove() {}, toggle() {}},
    getAttribute(name) { return attrs[name] || ''; },
    setAttribute(name, value) { attrs[name] = String(value); },
    appendChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    style: {},
  };
}

const documentObj = {
  body: null,
  hidden: false,
  addEventListener() {},
  createElement() { return makeElement(); },
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
documentObj.body = makeElement();

const windowObj = {
  __TM_ADVISOR_PANEL_TEST_HOOKS__: true,
  addEventListener() {},
  location: {pathname: '/'},
  TM_ADVISOR: {
    analyzeActions() {
      analyzeCalls += 1;
      return [{index: 0, action: 'Play project card', reason: 'best available action', score: 72}];
    },
    rankHandCards(cards) {
      return cards;
    },
  },
};

vm.runInNewContext(source, {
  clearInterval() {},
  clearTimeout() {},
  console,
  document: documentObj,
  setInterval() { return 0; },
  setTimeout() { return 0; },
  window: windowObj,
});

const hooks = windowObj.__TM_ADVISOR_PANEL_TEST__;
assert(hooks, 'advisor panel test hooks should be exposed');
assert.strictEqual(typeof hooks.buildBotActionHint, 'function');
assert.strictEqual(typeof hooks.panelIsMyActionTurn, 'function');

function makeState(overrides = {}) {
  return Object.assign({
    _waitingFor: {
      type: 'or',
      options: [{title: 'Play project card'}],
    },
    game: {},
    players: [
      {color: 'red', isActive: true},
      {color: 'blue', isActive: false},
    ],
    thisPlayer: {color: 'red'},
  }, overrides);
}

analyzeCalls = 0;
const onTurnHint = hooks.buildBotActionHint(makeState());
assert(onTurnHint, 'bot hint should render on our active action turn');
assert.strictEqual(onTurnHint.title, 'Play project card');
assert.strictEqual(analyzeCalls, 1, 'on-turn hints should call action analysis');

analyzeCalls = 0;
assert.strictEqual(
  hooks.buildBotActionHint(makeState({
    players: [
      {color: 'red', isActive: false},
      {color: 'blue', isActive: true},
    ],
  })),
  null,
  'stale waitingFor should not render a bot hint while another player is active'
);
assert.strictEqual(analyzeCalls, 0, 'off-turn hints should not call action analysis');

assert.strictEqual(
  hooks.panelIsMyActionTurn(makeState({
    activePlayerColor: 'blue',
    players: [
      {color: 'red'},
      {color: 'blue'},
    ],
  })),
  false,
  'activePlayerColor mismatch should suppress action-turn state'
);

console.log('advisor panel bot hint checks: OK');
