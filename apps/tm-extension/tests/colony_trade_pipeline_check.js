#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
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
const ratings = loadGeneratedVar('ratings.json.js', 'TM_RATINGS');
const tags = loadGeneratedVar('card_tags.js', 'TM_CARD_TAGS');
const tagReqs = loadGeneratedVar('card_tag_reqs.js', 'TM_CARD_TAG_REQS');
const vp = loadGeneratedVar('card_vp.js', 'TM_CARD_VP');
const canonicalBehaviors = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'all-card-behaviors.json'), 'utf8'));

function assertNoBackslashKeys(label, table) {
  const badKeys = Object.keys(table).filter((key) => key.includes('\\'));
  assert.deepStrictEqual(badKeys, [], label + ' should not contain escaped/truncated card-name keys');
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function assertResourceOnlyAction(name) {
  const action = (cardData[name] && cardData[name].action) || {};
  assert.strictEqual(action.addResources, 1, name + ' should expose only the resource accumulation action');
  assert.strictEqual(hasOwn(action, 'tr'), false, name + ' should not expose a simultaneous TR action');
  assert.strictEqual(hasOwn(action, 'global'), false, name + ' should not expose a simultaneous global-raise action');
  assert.strictEqual(hasOwn(action, 'stock'), false, name + ' should not expose a simultaneous stock action');
  assert.strictEqual(hasOwn(action, 'production'), false, name + ' should not expose a simultaneous production action');
}

[
  ['canonical behaviors', canonicalBehaviors],
  ['effects', effects],
  ['cardData', cardData],
  ['descriptions', descriptions],
  ['tags', tags],
  ['tagReqs', tagReqs],
  ['vp', vp],
].forEach(([label, table]) => assertNoBackslashKeys(label, table));

for (const staleName of ['CEO\\', 'Inventors\\', 'An Offer You Can\\', 'Darkside Smugglers\\']) {
  assert.strictEqual(canonicalBehaviors[staleName], undefined, staleName + ' should not exist in canonical behaviors');
  assert.strictEqual(descriptions[staleName], undefined, staleName + ' should not exist in descriptions');
  assert.strictEqual(tags[staleName], undefined, staleName + ' should not exist in tags');
}

for (const canonicalName of ["CEO's Favorite Project", "Inventors' Guild", "An Offer You Can't Refuse", "Darkside Smugglers' Union"]) {
  assert.ok(canonicalBehaviors[canonicalName], canonicalName + ' should keep its canonical apostrophe name');
}
assert.ok(descriptions["An Offer You Can't Refuse"], "An Offer You Can't Refuse description should use the canonical name");
assert.ok(descriptions["Darkside Smugglers' Union"], "Darkside Smugglers' Union description should use the canonical name");
assert.ok(tags["Darkside Smugglers' Union"].includes('space'), "Darkside Smugglers' Union should keep its space tag");

assert.strictEqual(effects['Cryo-Sleep'].tradeDiscount, 1, 'Cryo-Sleep should keep tradeDiscount in effects');
assert.strictEqual(effects['Rim Freighters'].tradeDiscount, 1, 'Rim Freighters should keep tradeDiscount in effects');
assert.strictEqual(effects['Trade Envoys'].tradeOffset, 1, 'Trade Envoys should keep tradeOffset in effects');
assert.strictEqual(effects['Trading Colony'].tradeOffset, 1, 'Trading Colony should keep tradeOffset in effects');
assert.strictEqual(effects['L1 Trade Terminal'].tradeOffset, 2, 'L1 Trade Terminal should keep tradeOffset in effects');
assert.strictEqual(effects['Venus Trade Hub'].tradeMC, 3, 'Venus Trade Hub should keep tradeMC in effects');
assert.strictEqual(effects['Business Empire'].c, 6, 'Business Empire should keep the 6 MC payment as cost');
assert.strictEqual(effects['Business Empire'].mp, 6, 'Business Empire should keep +6 MC production');
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(effects['Business Empire'], 'ep'),
  false,
  'Business Empire should not require or spend energy production',
);
assert.strictEqual(
  canonicalBehaviors['Business Empire'].behavior.production.megacredits,
  6,
  'Business Empire canonical behavior should expose +6 MC production',
);
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(effects['Prefabrication of Human Habitats'], 'mp'),
  false,
  'Prefabrication should not be parsed as MC production',
);
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(effects['Prefabrication of Human Habitats'], 'city'),
  false,
  'Prefabrication should not be parsed as placing a city tile',
);
assert.strictEqual(
  effects['Prefabrication of Human Habitats'].disc.tag,
  'city',
  'Prefabrication should keep only its city-card discount effect',
);
assert.strictEqual(
  cardData['Prefabrication of Human Habitats'].behavior,
  undefined,
  'Prefabrication card_data should not expose fake production or city behavior',
);
assert.strictEqual(
  cardData['Prefabrication of Human Habitats'].cardDiscount.tag,
  'city',
  'Prefabrication card_data should keep the city-card discount',
);
assert.deepStrictEqual(
  canonicalBehaviors['Prefabrication of Human Habitats'].behavior,
  {},
  'Prefabrication canonical behavior should remain empty except for its cardDiscount',
);
assert.strictEqual(canonicalBehaviors['Aquifer Turbines'].behavior.production.energy, 2, 'Aquifer Turbines canonical behavior should expose +2 energy production');
assert.strictEqual(canonicalBehaviors['Aquifer Turbines'].behavior.ocean, 1, 'Aquifer Turbines canonical behavior should expose the ocean placement');
assert.strictEqual(canonicalBehaviors['Ice Asteroid'].behavior.ocean, 2, 'Ice Asteroid canonical behavior should expose both ocean placements');
assert.strictEqual(canonicalBehaviors['Giant Ice Asteroid'].behavior.ocean, 2, 'Giant Ice Asteroid canonical behavior should expose both ocean placements');
assert.strictEqual(canonicalBehaviors['Lake Marineris'].behavior.ocean, 2, 'Lake Marineris canonical behavior should expose both ocean placements');
assert.strictEqual(canonicalBehaviors['Great Aquifer'].behavior.ocean, 2, 'Great Aquifer canonical behavior should expose both ocean placements');
assert.strictEqual(canonicalBehaviors['Galilean Mining'].behavior.production.titanium, 2, 'Galilean Mining canonical behavior should expose +2 titanium production');
assert.strictEqual(canonicalBehaviors['Terraforming Control Station'].behavior.tr, 2, 'Terraforming Control Station canonical behavior should expose +2 TR');
assert.strictEqual(canonicalBehaviors['Asteroid Resources'].behavior.production.steel, 1, 'Asteroid Resources should keep the production branch steel production');
assert.strictEqual(canonicalBehaviors['Asteroid Resources'].behavior.production.titanium, 1, 'Asteroid Resources should keep the production branch titanium production');
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(canonicalBehaviors['Asteroid Resources'].behavior, 'stock'),
  false,
  'Asteroid Resources should not sum the ocean+stock choice branch into canonical behavior',
);
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(canonicalBehaviors['Asteroid Resources'].behavior, 'ocean'),
  false,
  'Asteroid Resources should not sum the ocean choice branch into canonical behavior',
);
assert.strictEqual(effects['Tectonic Stress Power'].c, 18, 'Tectonic Stress Power should keep the 18 MC payment as cost');
assert.strictEqual(effects['Tectonic Stress Power'].ep, 3, 'Tectonic Stress Power should expose +3 energy production');
assert.strictEqual(effects['Tectonic Stress Power'].vp, 1, 'Tectonic Stress Power should expose 1 VP');
assert.strictEqual(effects['Colonial Representation'].c, 10, 'Colonial Representation should keep the 10 MC payment as cost');
assert.strictEqual(effects['Colonial Representation'].infl, 1, 'Colonial Representation should keep the permanent +1 influence effect');
assert.strictEqual(effects['High Circles'].infl, 1, 'High Circles should keep the permanent +1 influence effect');
assert.strictEqual(effects['Event Analysts'].infl, 1, 'Event Analysts should keep the permanent +1 influence effect');
assert.strictEqual(effects['Election Sponsorship'].infl, 1, 'Election Sponsorship should keep the permanent +1 influence effect');
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(effects['Extractor Balloons'], 'vn'),
  false,
  'Extractor Balloons should not be modeled as an immediate Venus raise',
);
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(effects['Extractor Balloons'], 'actVn'),
  false,
  'Extractor Balloons should not sum action Venus with resource accumulation',
);
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(effects['Darkside Observatory'], 'tr'),
  false,
  'Darkside Observatory should not be modeled as an immediate TR gain',
);
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(effects['Colonial Representation'], 'mp'),
  false,
  'Colonial Representation should not be modeled as MC production',
);

assert.strictEqual(cardData['Cryo-Sleep'].behavior.colonies.tradeDiscount, 1, 'Cryo-Sleep should expose colonies.tradeDiscount');
assert.strictEqual(cardData['Trade Envoys'].behavior.colonies.tradeOffset, 1, 'Trade Envoys should expose colonies.tradeOffset');
assert.strictEqual(cardData['Trading Colony'].behavior.colonies.buildColony != null, true, 'Trading Colony should expose colonies.buildColony');
assert.strictEqual(cardData['L1 Trade Terminal'].behavior.colonies.tradeOffset, 2, 'L1 Trade Terminal should expose colonies.tradeOffset');
assert.strictEqual(cardData['Venus Trade Hub'].behavior.colonies.tradeMC, 3, 'Venus Trade Hub should expose colonies.tradeMC');
assert.strictEqual(cardData['Tectonic Stress Power'].behavior.production.energy, 3, 'Tectonic Stress Power should expose energy production behavior');
assert.strictEqual(cardData['Tectonic Stress Power'].vp.vp, 1, 'Tectonic Stress Power should expose static VP behavior');
assert.strictEqual(cardData['Aquifer Turbines'].behavior.production.energy, 2, 'Aquifer Turbines should expose energy production behavior');
assert.strictEqual(cardData['Aquifer Turbines'].behavior.ocean, 1, 'Aquifer Turbines should expose ocean behavior');
assert.strictEqual(effects['Ice Asteroid'].oc, 2, 'Ice Asteroid effects should expose both ocean placements');
assert.strictEqual(cardData['Ice Asteroid'].behavior.ocean, 2, 'Ice Asteroid card data should expose both ocean placements');
assert.strictEqual(effects['Giant Ice Asteroid'].oc, 2, 'Giant Ice Asteroid effects should expose both ocean placements');
assert.strictEqual(cardData['Giant Ice Asteroid'].behavior.ocean, 2, 'Giant Ice Asteroid card data should expose both ocean placements');
assert.strictEqual(cardData['Galilean Mining'].behavior.production.titanium, 2, 'Galilean Mining should expose titanium production behavior');
assert.strictEqual(effects['Asteroid Resources'].sp, 1, 'Asteroid Resources effects should keep the production branch steel production');
assert.strictEqual(effects['Asteroid Resources'].tp, 1, 'Asteroid Resources effects should keep the production branch titanium production');
assert.strictEqual(Object.prototype.hasOwnProperty.call(effects['Asteroid Resources'], 'st'), false, 'Asteroid Resources effects should not sum the stock branch');
assert.strictEqual(Object.prototype.hasOwnProperty.call(effects['Asteroid Resources'], 'ti'), false, 'Asteroid Resources effects should not sum the stock branch');
assert.strictEqual(Object.prototype.hasOwnProperty.call(effects['Asteroid Resources'], 'oc'), false, 'Asteroid Resources effects should not sum the ocean branch');
assert.strictEqual(cardData['Asteroid Resources'].behavior.production.steel, 1, 'Asteroid Resources card data should keep the production branch steel production');
assert.strictEqual(cardData['Asteroid Resources'].behavior.production.titanium, 1, 'Asteroid Resources card data should keep the production branch titanium production');
assert.strictEqual(Object.prototype.hasOwnProperty.call(cardData['Asteroid Resources'].behavior, 'stock'), false, 'Asteroid Resources card data should not sum the stock branch');
assert.strictEqual(Object.prototype.hasOwnProperty.call(cardData['Asteroid Resources'].behavior, 'ocean'), false, 'Asteroid Resources card data should not sum the ocean branch');
const statefulOrActionStaleKeys = {
  'Aerial Mappers': ['actCD'],
  'Atmo Collectors': ['actMC'],
  'Copernicus Tower': ['actTR'],
  'Deuterium Export': ['actTR', 'act_ep'],
  'Dirigibles': ['actMC'],
  'Extractor Balloons': ['vn', 'actTR', 'actVn'],
  'Floating Refinery': ['actMC'],
  'Forced Precipitation': ['actMC'],
  'GHG Producing Bacteria': ['actTR', 'actTmp'],
  'Jet Stream Microscrappers': ['actTR'],
  'Jupiter Floating Station': ['actMC'],
  'Local Shading': ['actTR', 'act_mp'],
  'Nitrite Reducing Bacteria': ['tr', 'actTR'],
  'Regolith Eaters': ['actTR', 'actO2'],
  'Sulphur-Eating Bacteria': ['actMC'],
  'Thermophiles': ['actTR', 'actVn'],
};
for (const [name, staleKeys] of Object.entries(statefulOrActionStaleKeys)) {
  for (const staleKey of staleKeys) {
    assert.strictEqual(hasOwn(effects[name], staleKey), false, name + ' effects should not expose stale ' + staleKey);
  }
  assertResourceOnlyAction(name);
}
assertResourceOnlyAction('Weather Balloons');
for (const nonVpResourceCard of [
  'Atmo Collectors',
  'Dirigibles',
  'GHG Producing Bacteria',
  'Nitrite Reducing Bacteria',
  'Regolith Eaters',
]) {
  assert.strictEqual(vp[nonVpResourceCard], undefined, nonVpResourceCard + ' resources should not be scored as VP');
  assert.strictEqual(cardData[nonVpResourceCard].vp, undefined, nonVpResourceCard + ' card data should not expose resource VP');
}
assert.strictEqual(cardData['High Circles'].behavior.turmoil.influenceBonus, 1, 'High Circles should expose turmoil influence behavior');
assert.strictEqual(cardData['Event Analysts'].behavior.turmoil.influenceBonus, 1, 'Event Analysts should expose turmoil influence behavior');
assert.strictEqual(cardData['Election Sponsorship'].behavior.turmoil.influenceBonus, 1, 'Election Sponsorship should expose turmoil influence behavior');
assert.strictEqual(
  !!(cardData['Extractor Balloons'].behavior && cardData['Extractor Balloons'].behavior.global),
  false,
  'Extractor Balloons should not expose immediate global Venus behavior',
);
assertResourceOnlyAction('Extractor Balloons');
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(cardData['Comet Aiming'], 'action'),
  false,
  'Comet Aiming should not expose a free recurring action from a titanium/asteroid OR action',
);
assert.strictEqual(
  !!(cardData['Darkside Observatory'].behavior && cardData['Darkside Observatory'].behavior.tr),
  false,
  'Darkside Observatory should not expose immediate TR behavior',
);
assert.strictEqual(
  !!(cardData['Colonial Representation'].behavior && cardData['Colonial Representation'].behavior.production),
  false,
  'Colonial Representation should not expose MC production behavior',
);
assert.strictEqual(
  cardData['Colonial Representation'].behavior.turmoil.influenceBonus,
  1,
  'Colonial Representation should expose turmoil influence behavior',
);

assert(descriptions['Cryo-Sleep'].includes('When you trade'), 'Cryo-Sleep description should include trade text');
assert(descriptions['Trade Envoys'].includes('When you trade'), 'Trade Envoys description should include trade text');
assert(descriptions['L1 Trade Terminal'].includes('colony tile track 2 steps'), 'L1 Trade Terminal description should include trade offset text');
assert(descriptions['Venus Trade Hub'].includes('When you trade, gain 3 M€.'), 'Venus Trade Hub description should include trade MC text');
assert(descriptions['Colonial Representation'].toLowerCase().includes('influence'), 'Colonial Representation description should mention influence');

assert.strictEqual(ratings['Colonial Representation'].s, 72, 'Colonial Representation rating should include influence value');
assert.strictEqual(ratings['Colonial Representation'].t, 'B', 'Colonial Representation should be B tier with the real influence effect');
assert.deepStrictEqual(ratings['Colonial Representation'].y || [], ['Septem Tribus', 'Productive Outpost', 'Mining Colony'], 'Colonial Representation should list only direct influence/colony synergies');
assert(
  /influence/i.test((ratings['Colonial Representation'].e || '') + ' ' + (ratings['Colonial Representation'].w || '')),
  'Colonial Representation rating text should expose Turmoil/Septem relevance',
);
assert(
  !/MC production|MC-production|Banker|Sky Docks/i.test((ratings['Colonial Representation'].e || '') + ' ' + (ratings['Colonial Representation'].w || '') + ' ' + ((ratings['Colonial Representation'].y || []).join(' '))),
  'Colonial Representation rating should not trigger Banker, MC-production, or generic discount synergies',
);
assert.strictEqual(ratings['Tectonic Stress Power'].s, 58, 'Tectonic Stress Power should use the current canonical Colonies/wild baseline');
assert.deepStrictEqual(tagReqs['Tectonic Stress Power'], { science: 2 }, 'Tectonic Stress Power should require 2 science tags');

assert.strictEqual(effects['Freyja Biodomes'].placesTag, 'venus', 'Freyja Biodomes should remain tagged as a venus placer');
assert(tags['Venusian Animals'] && tags['Venusian Animals'].includes('venus'), 'Venusian Animals should expose its venus tag');
assert(tags['Tectonic Stress Power'] && tags['Tectonic Stress Power'].includes('power'), 'Tectonic Stress Power should expose its power tag');
assert(tags['Tectonic Stress Power'] && tags['Tectonic Stress Power'].includes('building'), 'Tectonic Stress Power should expose its building tag');
assert(!tags['Tectonic Stress Power'].includes('wild'), 'Tectonic Stress Power should not be modeled as having a wild tag');

function loadBrainInBrowserSandbox(extraTags) {
  const sandbox = {
    console,
    TM_CARD_EFFECTS: effects,
    TM_CARD_TAGS: Object.assign({}, tags, extraTags || {}),
    TM_CARD_VP: vp,
    TM_CARD_DATA: cardData,
    TM_CARD_TAG_REQS: tagReqs,
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.resolve(ROOT, 'extension', 'tm-brain.js'), 'utf8'), sandbox);
  return sandbox.TM_BRAIN;
}

function makeTectonicState(playerTags, cardsInHand) {
  return {
    game: {
      generation: 1,
      temperature: -30,
      oxygenLevel: 0,
      oceans: 0,
      venusScaleLevel: 0,
      gameOptions: {},
    },
    players: [{}, {}, {}],
    thisPlayer: {
      tags: playerTags || {},
      cardsInHand: cardsInHand || [],
      tableau: [],
      steel: 0,
      steelValue: 2,
    },
  };
}

const browserBrain = loadBrainInBrowserSandbox({ '__Wild Req Test__': ['wild'] });
const tectonicNoReq = browserBrain.scoreCard(
  { name: 'Tectonic Stress Power', calculatedCost: 18 },
  makeTectonicState({}, []),
);
const tectonicWildHelp = browserBrain.scoreCard(
  { name: 'Tectonic Stress Power', calculatedCost: 18 },
  makeTectonicState({}, ['__Wild Req Test__']),
);
const tectonicReqMet = browserBrain.scoreCard(
  { name: 'Tectonic Stress Power', calculatedCost: 18 },
  makeTectonicState({ science: 2 }, []),
);
assert(tectonicNoReq > 0, 'Browser TM_BRAIN auto-init should score Tectonic Stress Power production/VP, not only cost');
assert(tectonicWildHelp > tectonicNoReq, 'A wild tag in hand should reduce Tectonic Stress Power tag requirement penalty');
assert(tectonicReqMet > tectonicWildHelp, 'Played science tags should be stronger than partial hand wild support');

const contentSrc = fs.readFileSync(path.resolve(ROOT, 'apps', 'tm-extension', 'src', 'content.js'), 'utf8');
assert(contentSrc.includes('getCardTagsForName(targetName)'), 'content.js should use card tags for placesTag target reachability');
assert(contentSrc.includes('let directPartners = new Set();'), 'content.js should track direct tableau partners');
assert(contentSrc.includes('if (directPartners.has(myCard)) continue;'), 'content.js should skip reverse tableau synergy for direct mutual pairs');
assert(!contentSrc.includes('TM_COLONY_BUILDERS'), 'content.js should not rely on TM_COLONY_BUILDERS');
assert(!contentSrc.includes('TM_COLONY_BENEFITS'), 'content.js should not rely on TM_COLONY_BENEFITS');

console.log('colony/trade pipeline checks: OK');
