#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  readGeneratedExtensionFile,
  ROOT,
} = require(path.resolve(__dirname, '..', '..', '..', 'scripts', 'lib', 'generated-extension-data.js'));

function loadGeneratedVar(filename, varName) {
  const src = readGeneratedExtensionFile(filename, 'utf8');
  return new Function(
    'var module = { exports: {} }; var exports = module.exports;\n' +
    src +
    '\nreturn typeof ' + varName + ' !== "undefined" ? ' + varName + ' : module.exports;'
  )();
}

const effects = loadGeneratedVar('card_effects.json.js', 'TM_CARD_EFFECTS');
const cardData = loadGeneratedVar('card_data.js', 'TM_CARD_DATA');
const descriptions = loadGeneratedVar('card_descriptions.js', 'TM_CARD_DESCRIPTIONS');
const tags = loadGeneratedVar('card_tags.js', 'TM_CARD_TAGS');

assert.strictEqual(effects['Cryo-Sleep'].tradeDiscount, 1, 'Cryo-Sleep should keep tradeDiscount in effects');
assert.strictEqual(effects['Rim Freighters'].tradeDiscount, 1, 'Rim Freighters should keep tradeDiscount in effects');
assert.strictEqual(effects['Trade Envoys'].tradeOffset, 1, 'Trade Envoys should keep tradeOffset in effects');
assert.strictEqual(effects['Trading Colony'].tradeOffset, 1, 'Trading Colony should keep tradeOffset in effects');
assert.strictEqual(effects['L1 Trade Terminal'].tradeOffset, 2, 'L1 Trade Terminal should keep tradeOffset in effects');
assert.strictEqual(effects['Venus Trade Hub'].tradeMC, 3, 'Venus Trade Hub should keep tradeMC in effects');

assert.strictEqual(cardData['Cryo-Sleep'].behavior.colonies.tradeDiscount, 1, 'Cryo-Sleep should expose colonies.tradeDiscount');
assert.strictEqual(cardData['Trade Envoys'].behavior.colonies.tradeOffset, 1, 'Trade Envoys should expose colonies.tradeOffset');
assert.strictEqual(cardData['Trading Colony'].behavior.colonies.buildColony != null, true, 'Trading Colony should expose colonies.buildColony');
assert.strictEqual(cardData['L1 Trade Terminal'].behavior.colonies.tradeOffset, 2, 'L1 Trade Terminal should expose colonies.tradeOffset');
assert.strictEqual(cardData['Venus Trade Hub'].behavior.colonies.tradeMC, 3, 'Venus Trade Hub should expose colonies.tradeMC');

assert(descriptions['Cryo-Sleep'].includes('When you trade'), 'Cryo-Sleep description should include trade text');
assert(descriptions['Trade Envoys'].includes('When you trade'), 'Trade Envoys description should include trade text');
assert(descriptions['L1 Trade Terminal'].includes('colony tile track 2 steps'), 'L1 Trade Terminal description should include trade offset text');
assert(descriptions['Venus Trade Hub'].includes('When you trade, gain 3 M€.'), 'Venus Trade Hub description should include trade MC text');

assert.strictEqual(effects['Freyja Biodomes'].placesTag, 'venus', 'Freyja Biodomes should remain tagged as a venus placer');
assert(tags['Venusian Animals'] && tags['Venusian Animals'].includes('venus'), 'Venusian Animals should expose its venus tag');

const contentSrc = fs.readFileSync(path.resolve(ROOT, 'apps', 'tm-extension', 'src', 'content.js'), 'utf8');
assert(contentSrc.includes('getCardTagsForName(targetName)'), 'content.js should use card tags for placesTag target reachability');
assert(contentSrc.includes('let directPartners = new Set();'), 'content.js should track direct tableau partners');
assert(contentSrc.includes('if (directPartners.has(myCard)) continue;'), 'content.js should skip reverse tableau synergy for direct mutual pairs');
assert(!contentSrc.includes('TM_COLONY_BUILDERS'), 'content.js should not rely on TM_COLONY_BUILDERS');
assert(!contentSrc.includes('TM_COLONY_BENEFITS'), 'content.js should not rely on TM_COLONY_BENEFITS');

console.log('colony/trade pipeline checks: OK');
