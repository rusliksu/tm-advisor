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

console.log('content tooltip state regressions: OK');
