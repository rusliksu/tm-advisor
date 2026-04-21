#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.resolve(__dirname, '..', 'src', 'content.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function extractFunctionSource(fileSource, functionName) {
  const marker = `function ${functionName}(`;
  const start = fileSource.indexOf(marker);
  if (start === -1) throw new Error(`Function not found: ${functionName}`);

  const braceStart = fileSource.indexOf('{', start);
  if (braceStart === -1) throw new Error(`No body found for function: ${functionName}`);

  let depth = 1;
  let i = braceStart + 1;
  while (i < fileSource.length && depth > 0) {
    const ch = fileSource[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    i++;
  }
  if (depth !== 0) throw new Error(`Unbalanced braces for function: ${functionName}`);
  return fileSource.slice(start, i);
}

const buildTooltipHtmlCacheKeySource = extractFunctionSource(source, 'buildTooltipHtmlCacheKey');

const sandbox = {
  console,
  Math,
  _processAllRunId: 4,
  _pvCacheTime: 1200,
  _pvApiStateTime: 800,
  ctxCacheTime: 300,
  _oppCtxCache: {
    blue: {time: 9000},
  },
};
sandbox.globalThis = sandbox;

vm.runInNewContext(
  [
    buildTooltipHtmlCacheKeySource,
    'globalThis.__tm_test_buildTooltipHtmlCacheKey = buildTooltipHtmlCacheKey;',
  ].join('\n\n'),
  sandbox,
  {filename: sourcePath}
);

const buildTooltipHtmlCacheKey = sandbox.__tm_test_buildTooltipHtmlCacheKey;
assert.strictEqual(typeof buildTooltipHtmlCacheKey, 'function', 'buildTooltipHtmlCacheKey should be exposed');

function makeCardEl(opts) {
  const attrs = Object.assign({
    'data-tm-card': 'Birds',
    'data-tm-reasons': '+ VP engine',
    'data-tm-reason-rows': '[{"tone":"positive","text":"VP engine"}]',
    'data-tm-combo': 'Imported Hydrogen',
    'data-tm-anti-combo': '',
  }, (opts && opts.attrs) || {});
  const costText = opts && opts.costText ? opts.costText : '10';
  const reqText = opts && Object.prototype.hasOwnProperty.call(opts, 'reqText') ? opts.reqText : '13% O2';
  return {
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : '';
    },
    querySelector(selector) {
      if (selector === '.card-number, .card-cost') return {textContent: costText};
      if (selector === '.card-requirements, .card-requirement') return reqText ? {textContent: reqText} : null;
      return null;
    },
  };
}

const selfInput = {
  baseScore: 78,
  baseTier: 'B',
  cardEl: makeCardEl(),
  isOppCard: false,
  name: 'Birds',
  oppOwner: null,
  pv: {
    game: {
      generation: 2,
      phase: 'research',
      temperature: -24,
      oxygenLevel: 0,
      oceans: 1,
      venusScaleLevel: 0,
    },
  },
};

const keyA = buildTooltipHtmlCacheKey(selfInput);
assert.ok(keyA.includes('Birds'), keyA);
assert.ok(keyA.includes('research'), keyA);
assert.ok(keyA.includes('VP engine'), keyA);

const keyA2 = buildTooltipHtmlCacheKey(selfInput);
assert.strictEqual(keyA2, keyA, 'same tooltip state should keep the same cache key');

sandbox._processAllRunId = 5;
const keyRunChanged = buildTooltipHtmlCacheKey(selfInput);
assert.notStrictEqual(keyRunChanged, keyA, 'processAll cycle should invalidate tooltip cache');

sandbox._processAllRunId = 4;
sandbox._pvCacheTime = 1500;
const keyPvChanged = buildTooltipHtmlCacheKey(selfInput);
assert.notStrictEqual(keyPvChanged, keyA, 'vue data refresh should invalidate tooltip cache');

sandbox._pvCacheTime = 1200;
const keyReasonChanged = buildTooltipHtmlCacheKey(Object.assign({}, selfInput, {
  cardEl: makeCardEl({attrs: {'data-tm-reasons': '+ VP engine|+ animal support'}}),
}));
assert.notStrictEqual(keyReasonChanged, keyA, 'reason payload change should invalidate tooltip cache');

const oppInput = Object.assign({}, selfInput, {
  isOppCard: true,
  oppOwner: {color: 'blue'},
});
const oppKey = buildTooltipHtmlCacheKey(oppInput);
assert.notStrictEqual(oppKey, keyA, 'opponent tooltip should not share cache key with self tooltip');
assert.ok(oppKey.includes('blue'), oppKey);

sandbox._oppCtxCache.blue.time = 9100;
const oppKeyChanged = buildTooltipHtmlCacheKey(oppInput);
assert.notStrictEqual(oppKeyChanged, oppKey, 'opponent context refresh should invalidate tooltip cache');

assert.strictEqual(buildTooltipHtmlCacheKey({cardEl: null}), '', 'missing card element should disable cache');

console.log('content tooltip cache check: OK');
