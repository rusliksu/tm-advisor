#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.resolve(__dirname, '..', 'src', 'advisor-panel.js');

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

class PanelFakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.textContent = '';
    this.attrs = {};
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
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx >= 0) this.parentNode.children.splice(idx, 1);
    this.parentNode = null;
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
      if (selector === '.tm-advisor-action-target') return hasClass(el, 'tm-advisor-action-target');
      if (selector === '.tm-advisor-card-target') return hasClass(el, 'tm-advisor-card-target');
      if (selector === '.tm-advisor-action-badge') return hasClass(el, 'tm-advisor-action-badge');
      if (selector === 'label.form-radio') return el.tagName === 'label' && hasClass(el, 'form-radio');
      if (selector === '.wf-component button') return false;
      if (selector === '.wf-component input[type="button"]') return false;
      if (selector === '.wf-component input[type="submit"]') return false;
      if (selector === 'button') return el.tagName === 'button';
      if (selector === '[data-tm-card]') return el.getAttribute('data-tm-card') !== null;
      if (selector === '.card-container') return hasClass(el, 'card-container');
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

class PanelFakeDocument {
  constructor() {
    this.body = new PanelFakeElement('body');
  }

  createElement(tagName) {
    return new PanelFakeElement(tagName);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
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
    rankHandCards(cards) {
      return (cards || []).map((card, index) => Object.assign({
        score: 60 - index,
        reason: 'base',
      }, card));
    },
  },
  __TM_ADVISOR_PANEL_TEST_HOOKS__: true,
  location: { pathname: '/noop' },
  addEventListener() {},
};

let standardProjectCalls = 0;
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
  TM_CONTENT_STANDARD_PROJECTS: {
    computeAllSP() {
      standardProjectCalls += 1;
      return {
        best: {name: 'Greenery', score: 42, net: 1},
        all: [{name: 'Greenery', score: 42, net: 1}],
      };
    },
  },
  TM_SCORING_CONFIG: {standardProjects: true},
};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), sandbox, { filename: sourcePath });

const hooks = windowObj.__TM_ADVISOR_PANEL_TEST__;
assert(hooks, 'advisor-panel should expose test hooks when requested');
assert.strictEqual(typeof hooks.clearBotActionTarget, 'function');
assert.strictEqual(typeof hooks.markBotActionTarget, 'function');
assert.strictEqual(typeof hooks.renderActions, 'function');
assert.strictEqual(typeof hooks.renderOffTurnPlan, 'function');
assert.strictEqual(typeof hooks.renderPublicMilestoneRace, 'function');

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

const playCardState = {
  game: { phase: 'action' },
  thisPlayer: { color: 'hydro', megacredits: 40 },
  players: [{ color: 'hydro', isActive: true }],
  _waitingFor: {
    type: 'or',
    title: 'Take your next action',
    options: [
      {
        title: 'Play project card',
        cards: [{ name: 'Kelp Farming' }],
      },
      { title: 'Pass for this generation' },
    ],
  },
};
const playCardHint = hooks.buildBotActionHint(playCardState);
assert.strictEqual(playCardHint.title, 'Play Kelp Farming');
assert.strictEqual(playCardHint.cardName, 'Kelp Farming');

const deferredCeoState = {
  __timing: { estimatedGens: 2 },
  game: { phase: 'action' },
  thisPlayer: { color: 'hydro', megacredits: 54 },
  players: [{ color: 'hydro', isActive: true }],
  _waitingFor: {
    type: 'or',
    title: 'Take your next action',
    options: [
      {
        title: 'Play project card',
        cards: [{ name: "CEO's Favorite Project" }],
      },
      {
        title: 'Perform an action from a played card',
        cards: [{ name: 'Titan Shuttles' }],
      },
      { title: 'Pass for this generation' },
    ],
  },
};
const deferredCeoHint = hooks.buildBotActionHint(deferredCeoState);
assert.strictEqual(deferredCeoHint.title, 'Use Titan Shuttles');
assert.strictEqual(deferredCeoHint.cardName, 'Titan Shuttles');
assert.strictEqual(deferredCeoHint.optionIndex, 1);
assert.strictEqual(deferredCeoHint.optionTitle, 'Perform an action from a played card');

const finalWindowCeoState = {
  __timing: { estimatedGens: 1 },
  game: {
    phase: 'action',
    generation: 9,
    temperature: 8,
    oxygenLevel: 14,
    oceans: 9,
    venusScaleLevel: 30,
    isTerraformed: true,
  },
  thisPlayer: { color: 'hydro', megacredits: 54 },
  players: [{ color: 'hydro', isActive: true }],
  _waitingFor: {
    type: 'or',
    title: 'Take your next action',
    options: [
      {
        title: 'Play project card',
        cards: [{ name: "CEO's Favorite Project" }],
      },
      {
        title: 'Perform an action from a played card',
        cards: [{ name: 'Fish' }],
      },
      { title: 'Pass for this generation' },
    ],
  },
};
const finalWindowCeoHint = hooks.buildBotActionHint(finalWindowCeoState);
assert.strictEqual(finalWindowCeoHint.title, 'Use Fish');
assert.strictEqual(finalWindowCeoHint.cardName, 'Fish');
assert.strictEqual(finalWindowCeoHint.optionIndex, 1);
assert.strictEqual(finalWindowCeoHint.optionTitle, 'Perform an action from a played card');

const finalWindowCeoApiTitleState = {
  __timing: { estimatedGens: 1 },
  game: {
    phase: 'action',
    generation: 9,
    temperature: 8,
    oxygenLevel: 14,
    oceans: 9,
    venusScaleLevel: 30,
    isTerraformed: true,
  },
  thisPlayer: { color: 'hydro', megacredits: 54 },
  players: [{ color: 'hydro', isActive: true }],
  _waitingFor: {
    type: 'or',
    title: { message: 'Take your next action', data: [] },
    options: [
      {
        title: { message: 'Play ${0}', data: [{ type: 1, value: 'project card' }] },
        cards: [{ name: "CEO's Favorite Project" }],
      },
      {
        title: { message: 'Perform an action from ${0}', data: [{ type: 1, value: 'a played card' }] },
        cards: [{ name: 'Fish' }],
      },
      { title: { message: 'Pass for ${0}', data: [{ type: 1, value: 'this generation' }] } },
    ],
  },
};
const finalWindowCeoApiTitleHint = hooks.buildBotActionHint(finalWindowCeoApiTitleState);
assert.strictEqual(finalWindowCeoApiTitleHint.title, 'Use Fish');
assert.strictEqual(finalWindowCeoApiTitleHint.cardName, 'Fish');
assert.strictEqual(finalWindowCeoApiTitleHint.optionIndex, 1);
assert.strictEqual(finalWindowCeoApiTitleHint.optionTitle, 'Perform an action from a played card');

const finalWindowEngineState = {
  __timing: { estimatedGens: 1 },
  game: {
    phase: 'action',
    generation: 9,
    temperature: 8,
    oxygenLevel: 14,
    oceans: 9,
    venusScaleLevel: 30,
    isTerraformed: true,
  },
  thisPlayer: { color: 'hydro', megacredits: 30 },
  players: [{ color: 'hydro', isActive: true }],
  _waitingFor: {
    type: 'or',
    title: 'Take your next action',
    options: [
      {
        title: 'Play project card',
        cards: [{ name: 'Sponsors' }],
      },
      {
        title: 'Perform an action from a played card',
        cards: [{ name: 'Small Animals' }],
      },
      { title: 'Pass for this generation' },
    ],
  },
};
const finalWindowEngineHint = hooks.buildBotActionHint(finalWindowEngineState);
assert.strictEqual(finalWindowEngineHint.title, 'Use Small Animals');
assert.strictEqual(finalWindowEngineHint.cardName, 'Small Animals');
assert.strictEqual(finalWindowEngineHint.optionIndex, 1);
assert.strictEqual(finalWindowEngineHint.optionTitle, 'Perform an action from a played card');

const panelDoc = new PanelFakeDocument();
const actionOption = panelDoc.createElement('label');
actionOption.className = 'form-radio';
actionOption.textContent = 'Perform an action from a played card';
panelDoc.body.appendChild(actionOption);
const tableauCard = panelDoc.createElement('div');
tableauCard.className = 'card-container';
tableauCard.textContent = 'Titan Shuttles Add 2 floaters';
panelDoc.body.appendChild(tableauCard);

hooks.markBotActionTarget(deferredCeoHint, panelDoc);
assert(actionOption.className.includes('tm-advisor-action-target'), 'advisor panel should still mark the action option');
assert(tableauCard.className.includes('tm-advisor-card-target'), 'advisor panel should fall back to card-container text');
hooks.clearBotActionTarget(panelDoc);
assert(!tableauCard.className.includes('tm-advisor-card-target'), 'advisor panel clear should remove text fallback card highlight');

const offTurnState = {
  game: { phase: 'action' },
  thisPlayer: { color: 'hydro' },
  players: [
    { color: 'hydro', isActive: false },
    { color: 'red', isActive: true },
  ],
  _waitingFor: {
    type: 'or',
    title: 'Take your next action',
    options: [{ title: 'Pass for this generation' }],
  },
};
assert.strictEqual(hooks.buildBotActionHint(offTurnState), null, 'bot hint should not render on another player turn');
standardProjectCalls = 0;
assert.strictEqual(hooks.buildStandardProjectsHint(offTurnState), null, 'standard project hint should not render on another player turn');
assert.strictEqual(standardProjectCalls, 0, 'off-turn standard project hint should not evaluate SP scores');

const offTurnPlanHtml = hooks.renderOffTurnPlan({
  game: { phase: 'action' },
  thisPlayer: {
    color: 'hydro',
    cardsInHand: [{ name: 'Kelp Farming', cost: 17 }],
  },
  players: [
    { color: 'hydro', isActive: false },
    { color: 'red', isActive: true, name: 'Red' },
  ],
});
assert(offTurnPlanHtml.includes('Next action'), offTurnPlanHtml);
assert(offTurnPlanHtml.includes('Kelp Farming'), offTurnPlanHtml);
assert(offTurnPlanHtml.includes('ход Red'), offTurnPlanHtml);
assert(offTurnPlanHtml.includes('tm-advisor-next-main'), offTurnPlanHtml);

const ownTurnSpHint = hooks.buildStandardProjectsHint({
  game: { phase: 'action' },
  thisPlayer: { color: 'hydro' },
  players: [{ color: 'hydro', isActive: true }],
});
assert(ownTurnSpHint, 'standard project hint should still render on own active turn');

const statusHtml = hooks.renderBotHintCard(noPromptStatus, true);
assert(statusHtml.includes('tm-advisor-bot-status'), statusHtml);
assert(statusHtml.includes('No live action prompt'), statusHtml);

const publicMilestoneHtml = hooks.renderPublicMilestoneRace({
  game: {
    milestones: [
      {
        name: 'Spacefarer',
        threshold: 6,
        scores: [
          { color: 'green', score: 6 },
          { color: 'red', score: 5 },
          { color: 'orange', score: 3 },
        ],
      },
      {
        name: 'Specialist',
        threshold: 10,
        playerName: 'Fr3',
        playerColor: 'green',
        scores: [
          { color: 'green', score: 10 },
          { color: 'red', score: 4 },
        ],
      },
      {
        name: 'Mayor',
        threshold: 3,
        scores: [
          { color: 'orange', score: 2 },
          { color: 'red', score: 1 },
        ],
      },
    ],
  },
  players: [
    { color: 'green', name: 'Fr3' },
    { color: 'red', name: 'Miki' },
    { color: 'orange', name: 'Ita' },
  ],
});
assert(publicMilestoneHtml.includes('Public milestone windows'), publicMilestoneHtml);
assert(publicMilestoneHtml.includes('2 slots'), publicMilestoneHtml);
assert(publicMilestoneHtml.includes('Spacefarer'), publicMilestoneHtml);
assert(publicMilestoneHtml.includes('Fr3'), publicMilestoneHtml);
assert(publicMilestoneHtml.includes('6/6'), publicMilestoneHtml);
assert(publicMilestoneHtml.includes('Mayor'), publicMilestoneHtml);
assert(publicMilestoneHtml.includes('Ita'), publicMilestoneHtml);
assert(!publicMilestoneHtml.includes('Specialist'), publicMilestoneHtml);

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
