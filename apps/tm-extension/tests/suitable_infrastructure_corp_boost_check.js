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

  let braceStart = fileSource.indexOf('{', start);
  if (braceStart === -1) throw new Error(`No body found for function: ${functionName}`);

  let depth = 1;
  let i = braceStart + 1;
  while (i < fileSource.length && depth > 0) {
    const ch = fileSource[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  if (depth !== 0) throw new Error(`Unbalanced braces for function: ${functionName}`);
  return fileSource.slice(start, i);
}

const getFxSource = extractFunctionSource(source, 'getFx');
const getCorpBoostSource = extractFunctionSource(source, 'getCorpBoost');

const sandbox = {
  console,
  Set,
  TM_CARD_EFFECTS: {},
};
sandbox.globalThis = sandbox;

vm.runInNewContext(
  `${getFxSource}\n${getCorpBoostSource}\nglobalThis.__tm_test_getCorpBoost = getCorpBoost;`,
  sandbox,
  {filename: sourcePath}
);

const getCorpBoost = sandbox.__tm_test_getCorpBoost;
assert.strictEqual(typeof getCorpBoost, 'function', 'getCorpBoost should be exposed for the test harness');

function suitableBoost(corpName) {
  return getCorpBoost(corpName, {
    cardName: 'Suitable Infrastructure',
    eLower: 'increase production and trigger refund',
    cardTags: new Set(['building']),
    cardCost: 0,
    ctx: {},
    globalParams: {},
  });
}

assert.strictEqual(suitableBoost('Robinson Industries'), 3, 'Robinson should treat Suitable Infrastructure as a strong production opener');
assert.strictEqual(suitableBoost('Manutech'), 3, 'Manutech should treat Suitable Infrastructure as a strong production opener');
assert.strictEqual(suitableBoost('Cheung Shing MARS'), 0, 'Cheung should not add a generic building bonus to Suitable Infrastructure');
assert.strictEqual(suitableBoost('Factorum'), 0, 'Factorum should not add a generic building/energy bonus to Suitable Infrastructure');
assert.strictEqual(suitableBoost('Mining Guild'), 0, 'Mining Guild should not add a generic building bonus to Suitable Infrastructure');

console.log('suitable infrastructure corp boost checks: OK');
