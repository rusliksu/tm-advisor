#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.resolve(__dirname, '..', 'src', 'content-tooltip-state.js');
const source = fs.readFileSync(sourcePath, 'utf8');

const sandbox = {
  console,
};
sandbox.globalThis = sandbox;

vm.runInNewContext(source, sandbox, {filename: sourcePath});

const tooltipState = sandbox.TM_CONTENT_TOOLTIP_STATE;
assert(tooltipState && typeof tooltipState.resolveTooltipAnalysisState === 'function', 'resolveTooltipAnalysisState should be exposed');
assert(typeof tooltipState.resolveTooltipCardState === 'function', 'resolveTooltipCardState should be exposed');
assert(typeof tooltipState.resolveTooltipRequirementState === 'function', 'resolveTooltipRequirementState should be exposed');

const localized = tooltipState.resolveTooltipAnalysisState({
  data: {nr: 'Короткая RU note', e: 'English economy text', w: 'English when text'},
  isInHand: false,
});
assert.strictEqual(localized.analysisText, 'Короткая RU note');
assert.strictEqual(localized.whenText, '');
assert.strictEqual(localized.isInHand, false);

const fallback = tooltipState.resolveTooltipAnalysisState({
  data: {e: 'English economy text', w: 'English when text'},
  isInHand: true,
});
assert.strictEqual(fallback.analysisText, 'English economy text');
assert.strictEqual(fallback.whenText, 'English when text');
assert.strictEqual(fallback.isInHand, true);

const cardState = tooltipState.resolveTooltipCardState({
  cardEl: {
    querySelector() {
      return null;
    },
    closest() {
      return null;
    },
  },
  data: {dr: 'Русское описание'},
  descriptions: {Test: 'English fallback description'},
  name: 'Test',
  ruName() {
    return 'Тест';
  },
});
assert.strictEqual(cardState.localizedDesc, 'Русское описание');
assert.strictEqual(cardState.fallbackDesc, '');
assert.strictEqual(cardState.localizedName, 'Тест');

const earlyMinGlobalReq = tooltipState.resolveTooltipRequirementState({
  cardEl: {
    getAttribute() {
      return 'Mangrove';
    },
    querySelector(selector) {
      if (selector === '.card-requirements, .card-requirement') {
        return {textContent: 'Requires +4°C or warmer.'};
      }
      return null;
    },
  },
  detectMyCorps() {
    return [];
  },
  evaluateBoardRequirements() {
    return {metNow: true, unmet: []};
  },
  getBoardRequirementStatusLabel(key) {
    return key;
  },
  getCachedPlayerContext() {
    return {};
  },
  getRequirementFlexSteps() {
    return {any: 0, venus: 0};
  },
  pv: {
    game: {
      generation: 1,
      phase: 'initial_drafting',
      temperature: -30,
    },
  },
});
assert.strictEqual(earlyMinGlobalReq.checks.length, 1);
assert.strictEqual(earlyMinGlobalReq.checks[0].tone, 'muted');
assert(earlyMinGlobalReq.checks[0].text.includes('Окно позже: Темп -30°C/4°C'));

const saturnTriggerState = tooltipState.resolveTooltipTriggerState({
  cardEl: {
    classList: {
      contains() {
        return false;
      },
    },
  },
  cardN(card) {
    return card && (card.name || card);
  },
  detectMyCorps() {
    return ['Saturn Systems'];
  },
  getCardTags() {
    return new Set(['jovian', 'space']);
  },
  isOppCard: false,
  pv: {
    thisPlayer: {
      tableau: [{name: 'Saturn Systems'}],
    },
  },
  tagTriggers: {
    'Saturn Systems': [{tags: ['jovian'], desc: 'Saturn Sys → +1 MC-прод'}],
  },
});
assert.strictEqual(
  saturnTriggerState.hits.length,
  1,
  'corp trigger listed both in tableau and detected corps should appear once'
);
assert.strictEqual(saturnTriggerState.hits[0], 'Saturn Sys → +1 MC-прод');

console.log('content tooltip state regressions: OK');
