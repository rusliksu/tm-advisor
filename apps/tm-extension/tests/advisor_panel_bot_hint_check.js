#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.resolve(__dirname, '..', 'src', 'advisor-panel.js');
const source = fs.readFileSync(sourcePath, 'utf8');

let analyzeCalls = 0;
function makeElement(tagName = 'div') {
  const attrs = Object.create(null);
  const el = {
    tagName,
    children: [],
    parentNode: null,
    className: '',
    _textContent: '',
    innerHTML: '',
    style: {},
    get textContent() { return el._textContent; },
    set textContent(value) {
      el._textContent = String(value || '');
      el.innerHTML = el._textContent
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },
    classList: {
      add(cls) {
        const parts = new Set(String(el.className).split(/\s+/).filter(Boolean));
        parts.add(cls);
        el.className = Array.from(parts).join(' ');
      },
      remove(cls) {
        el.className = String(el.className).split(/\s+/).filter((part) => part && part !== cls).join(' ');
      },
      toggle(cls, force) {
        if (force === false) this.remove(cls);
        else this.add(cls);
      },
    },
    getAttribute(name) { return attrs[name] || ''; },
    setAttribute(name, value) { attrs[name] = String(value); },
    removeAttribute(name) { delete attrs[name]; },
    appendChild(child) {
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = el.children.indexOf(child);
      if (idx >= 0) el.children.splice(idx, 1);
      child.parentNode = null;
      return child;
    },
    remove() {
      if (el.parentNode) el.parentNode.removeChild(el);
    },
    querySelector(selector) {
      return el.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const result = [];
      const hasClass = (node, cls) => String(node.className).split(/\s+/).includes(cls);
      const matches = (node) => {
        if (selector.charAt(0) === '.') return hasClass(node, selector.slice(1));
        if (selector.charAt(0) === '#') return node.getAttribute('id') === selector.slice(1);
        if (selector === '[data-tm-game-anchor="actions"]') return node.getAttribute('data-tm-game-anchor') === 'actions';
        if (selector === '[data-tm-card]') return !!node.getAttribute('data-tm-card');
        if (selector === 'label.form-radio') return node.tagName === 'label' && hasClass(node, 'form-radio');
        if (selector === '.wf-component button') return node.tagName === 'button' && node.parentNode && hasClass(node.parentNode, 'wf-component');
        if (selector === 'button') return node.tagName === 'button';
        return false;
      };
      const walk = (node) => {
        if (matches(node)) result.push(node);
        node.children.forEach(walk);
      };
      walk(el);
      return result;
    },
  };
  return el;
}

const documentObj = {
  body: null,
  hidden: false,
  addEventListener() {},
  createElement(tagName) { return makeElement(tagName); },
  getElementById(id) { return this.body.querySelector('#' + id); },
  querySelector(selector) { return this.body.querySelector(selector); },
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); },
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
assert.strictEqual(typeof hooks.markBotActionTarget, 'function');
assert.strictEqual(typeof hooks.panelIsMyActionTurn, 'function');
assert.strictEqual(typeof hooks.renderActions, 'function');
assert.strictEqual(typeof hooks.renderOffTurnPlan, 'function');

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
assert.strictEqual(onTurnHint.optionTitle, 'Play project card');
assert.strictEqual(onTurnHint.optionIndex, 0);
assert.strictEqual(analyzeCalls, 1, 'on-turn hints should call action analysis');

const playCardHint = hooks.buildBotActionHint(makeState({
  _waitingFor: {
    type: 'or',
    options: [{
      title: 'Play project card',
      cards: [{name: 'Kelp Farming', cost: 17}],
    }],
  },
}));
assert.strictEqual(playCardHint.title, 'Play Kelp Farming');
assert.strictEqual(playCardHint.cardName, 'Kelp Farming');

const deferredCeoHint = hooks.buildBotActionHint(makeState({
  gensLeft: 2,
  _waitingFor: {
    type: 'or',
    options: [{
      title: 'Play project card',
      cards: [{name: "CEO's Favorite Project", cost: 1}],
    }],
  },
}));
assert.strictEqual(deferredCeoHint, null, "CEO's Favorite Project should be deferred before the last useful timing window");

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

const offTurnPlan = hooks.renderOffTurnPlan(makeState({
  players: [
    {color: 'red', isActive: false},
    {color: 'blue', isActive: true, name: 'Blue'},
  ],
  thisPlayer: {
    color: 'red',
    cardsInHand: [{name: 'Kelp Farming', cost: 17}],
  },
}));
assert(offTurnPlan.includes('Next action'), offTurnPlan);
assert(offTurnPlan.includes('Kelp Farming'), offTurnPlan);
assert(offTurnPlan.includes('ход Blue'), offTurnPlan);
assert(offTurnPlan.includes('tm-advisor-next-main'), offTurnPlan);
assert(offTurnPlan.includes('tm-advisor-next-more'), offTurnPlan);

const panelActionsEl = makeElement('div');
panelActionsEl.setAttribute('id', 'tm-advisor-actions');
documentObj.body.appendChild(panelActionsEl);
analyzeCalls = 0;
hooks.renderActions(makeState({
  players: [
    {color: 'red', isActive: false},
    {color: 'blue', isActive: true, name: 'Blue'},
  ],
  thisPlayer: {
    color: 'red',
    cardsInHand: [{name: 'Kelp Farming', cost: 17}],
  },
}));
assert(panelActionsEl.innerHTML.includes('Next action'), panelActionsEl.innerHTML);
assert(panelActionsEl.innerHTML.includes('Kelp Farming'), panelActionsEl.innerHTML);
assert.strictEqual(analyzeCalls, 0, 'off-turn renderActions should not analyze stale action options');
documentObj.body.removeChild(panelActionsEl);

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

const actionDocument = {
  body: makeElement('body'),
  createElement: (tagName) => makeElement(tagName),
  querySelector(selector) { return this.body.querySelector(selector); },
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); },
};
const actionsRoot = makeElement('div');
actionsRoot.className = 'player_home_block--actions';
const wfOptions = makeElement('div');
wfOptions.className = 'wf-options';
const playOption = makeElement('label');
playOption.className = 'form-radio';
playOption.textContent = 'Play project card';
const passOption = makeElement('label');
passOption.className = 'form-radio';
passOption.textContent = 'Pass for this generation';
wfOptions.appendChild(playOption);
wfOptions.appendChild(passOption);
actionsRoot.appendChild(wfOptions);
actionDocument.body.appendChild(actionsRoot);

const marked = hooks.markBotActionTarget(onTurnHint, actionDocument);
assert.strictEqual(marked, playOption, 'best action target should be the matching option node');
assert(playOption.className.includes('tm-advisor-action-target'), 'target option should receive highlight class');
assert.strictEqual(playOption.querySelectorAll('.tm-advisor-action-badge').length, 1, 'target option should receive BEST badge');
assert(playOption.getAttribute('title').includes('best available action'), 'target tooltip should include reason');

hooks.clearBotActionTarget(actionDocument);
assert(!playOption.className.includes('tm-advisor-action-target'), 'clear should remove highlight class');
assert.strictEqual(playOption.querySelectorAll('.tm-advisor-action-badge').length, 0, 'clear should remove BEST badge');

const kelpCard = makeElement('div');
kelpCard.setAttribute('data-tm-card', 'Kelp Farming');
actionDocument.body.appendChild(kelpCard);
const markedWithCard = hooks.markBotActionTarget(playCardHint, actionDocument);
assert.strictEqual(markedWithCard, playOption, 'action target should still be the matching option node');
assert(kelpCard.className.includes('tm-advisor-card-target'), 'specific card should receive card highlight class');
assert(kelpCard.getAttribute('title').includes('Best card: Kelp Farming'), 'card tooltip should name the selected card');

hooks.clearBotActionTarget(actionDocument);
assert(!kelpCard.className.includes('tm-advisor-card-target'), 'clear should remove card highlight class');

console.log('advisor panel bot hint checks: OK');
