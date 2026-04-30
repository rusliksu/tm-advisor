#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');

delete global.TM_CONTENT_ACTION_RECOMMENDATION;
require(path.resolve(__dirname, '..', 'src', 'content-action-recommendation.js'));

const actionRec = global.TM_CONTENT_ACTION_RECOMMENDATION;
assert(actionRec, 'TM_CONTENT_ACTION_RECOMMENDATION should be loaded');
assert.strictEqual(typeof actionRec.computeActionRecommendation, 'function', 'computeActionRecommendation should be exported');
assert.strictEqual(typeof actionRec.renderActionRecommendation, 'function', 'renderActionRecommendation should be exported');

function makeState(overrides = {}) {
  return Object.assign({
    game: {phase: 'action', generation: 8},
    thisPlayer: {color: 'hydro', megacredits: 30},
    players: [{color: 'hydro'}],
    _waitingFor: {
      type: 'or',
      title: 'Select an action',
      options: [
        {
          type: 'card',
          title: 'Play project card',
          cards: [{name: 'Kelp Farming'}, {name: 'Cloud Seeding', isDisabled: true}],
        },
        {type: 'option', title: 'Pass for this generation'},
      ],
    },
  }, overrides);
}

function testAdvisorRecommendationRanksCard() {
  const advisor = {
    analyzeActions(waitingFor) {
      assert.strictEqual(waitingFor.options.length, 2);
      return [
        {index: 0, action: 'Play project card', score: 82, reason: 'Best card tempo'},
        {index: 1, action: 'Pass', score: 10, reason: 'No more actions'},
      ];
    },
    rankHandCards(cards) {
      assert.strictEqual(cards.length, 1);
      return [{name: 'Kelp Farming', reason: 'Ocean window + plant payoff'}];
    },
  };

  const rec = actionRec.computeActionRecommendation({state: makeState(), advisor});
  assert(rec, 'advisor recommendation should be produced');
  assert.strictEqual(rec.title, 'Play Kelp Farming');
  assert.strictEqual(rec.optionIndex, 0);
  assert.strictEqual(rec.optionTitle, 'Play project card');
  assert(rec.reasonRows.some((row) => row.text.includes('Best card tempo')));
  assert(rec.reasonRows.some((row) => row.text.includes('Ocean window')));
  assert.strictEqual(rec.alt, 'Pass');
}

function testSignalFallbackRequiresActionPrompt() {
  const rec = actionRec.computeActionRecommendation({
    state: makeState(),
    advisor: {analyzeActions: () => []},
    signals: [{
      id: 'fund-thermalist',
      severity: 'warning',
      label: 'Fund Thermalist',
      title: 'Fund Thermalist',
      priority: 85,
      reasons: ['Current lead: 26 vs 8.'],
      action: 'Fund this award if no higher swing is available.',
    }],
  });

  assert(rec, 'signal fallback should be produced when advisor cannot rank the action prompt');
  assert.strictEqual(rec.title, 'Fund Thermalist');
  assert.strictEqual(rec.kind, 'signal');
  assert(rec.reasonRows.some((row) => row.text.includes('26 vs 8')));
}

function testNoRecommendationOutsideTurnOrActionPhase() {
  assert.strictEqual(
    actionRec.computeActionRecommendation({state: makeState({_waitingFor: null}), advisor: {}}),
    null,
    'no waitingFor means no in-turn recommendation'
  );
  assert.strictEqual(
    actionRec.computeActionRecommendation({state: makeState({game: {phase: 'drafting'}}), advisor: {}}),
    null,
    'drafting should not emit action recommendation'
  );
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.className = '';
    this.textContent = '';
    this.attrs = {};
    this.style = {};
    this.classList = {
      add: (cls) => {
        const parts = new Set(String(this.className).split(/\s+/).filter(Boolean));
        parts.add(cls);
        this.className = Array.from(parts).join(' ');
      },
      remove: (cls) => {
        this.className = String(this.className).split(/\s+/).filter((part) => part && part !== cls).join(' ');
      },
    };
  }

  appendChild(child) {
    child.parentNode = this;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child, before) {
    child.parentNode = this;
    child.parentElement = this;
    const idx = this.children.indexOf(before);
    if (idx < 0) return this.appendChild(child);
    this.children.splice(idx, 0, child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx >= 0) this.parentNode.children.splice(idx, 1);
    this.parentNode = null;
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  removeAttribute(name) {
    delete this.attrs[name];
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const result = [];
    const classParts = (el) => String(el.className).split(/\s+/).filter(Boolean);
    const hasClass = (el, cls) => classParts(el).includes(cls);
    const matches = (el) => {
      if (selector === '.tm-action-recommendation') return hasClass(el, 'tm-action-recommendation');
      if (selector === '.tm-action-recommendation-target') return hasClass(el, 'tm-action-recommendation-target');
      if (selector === '.player_home_block--actions') return hasClass(el, 'player_home_block--actions');
      if (selector === '.wf-component') return hasClass(el, 'wf-component');
      if (selector === '.wf-options') return hasClass(el, 'wf-options');
      if (selector === 'label.form-radio') return el.tagName === 'label' && hasClass(el, 'form-radio');
      if (selector === '.wf-action') return hasClass(el, 'wf-action');
      if (selector === '.wf-component button') return el.tagName === 'button' && el.parentElement && hasClass(el.parentElement, 'wf-component');
      if (selector === '.card-standard-project') return hasClass(el, 'card-standard-project');
      if (selector === 'button') return el.tagName === 'button';
      if (selector === '#actions') return el.getAttribute('id') === 'actions';
      if (selector === '[data-tm-game-anchor="actions"]') return el.getAttribute('data-tm-game-anchor') === 'actions';
      if (selector === '.wf-component--select-option') return hasClass(el, 'wf-component--select-option');
      return false;
    };
    const walk = (el) => {
      if (matches(el)) result.push(el);
      el.children.forEach(walk);
    };
    walk(this);
    return result;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
    this.documentElement = this.body;
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

function testRenderAnchorsAndHighlightsAction() {
  const doc = new FakeDocument();
  const actions = doc.createElement('div');
  actions.className = 'player_home_block--actions';
  const wf = doc.createElement('div');
  wf.className = 'wf-options';
  const play = doc.createElement('label');
  play.className = 'form-radio';
  play.textContent = 'Play project card';
  wf.appendChild(play);
  const pass = doc.createElement('label');
  pass.className = 'form-radio';
  pass.textContent = 'Pass for this generation';
  wf.appendChild(pass);
  actions.appendChild(wf);
  doc.body.appendChild(actions);

  const rendered = actionRec.renderActionRecommendation({
    documentObj: doc,
    recommendation: {
      id: 'advisor:0:Play Kelp Farming',
      title: 'Play Kelp Farming',
      optionTitle: 'Play project card',
      optionIndex: 0,
      score: 82,
      reasonRows: [{text: 'Best card tempo'}],
    },
  });

  assert.strictEqual(rendered.length, 2, 'box and highlighted target should be returned');
  assert.strictEqual(actions.querySelectorAll('.tm-action-recommendation').length, 1, 'recommendation should render inside actions block');
  assert(play.className.includes('tm-action-recommendation-target'), 'matching action option should be highlighted');

  actionRec.clearActionRecommendation({documentObj: doc});
  assert.strictEqual(actions.querySelectorAll('.tm-action-recommendation').length, 0, 'clear should remove recommendation box');
  assert(!play.className.includes('tm-action-recommendation-target'), 'clear should remove highlight');
}

testAdvisorRecommendationRanksCard();
testSignalFallbackRequiresActionPrompt();
testNoRecommendationOutsideTurnOrActionPhase();
testRenderAnchorsAndHighlightsAction();

console.log('content-action-recommendation checks: OK');
