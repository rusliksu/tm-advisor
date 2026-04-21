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
  'Asteroid Deflection System': ['actTR'],
  'Atmo Collectors': ['actMC'],
  'Communication Center': ['actCD'],
  'Comet Aiming': ['actTR', 'res'],
  'Copernicus Tower': ['actTR'],
  'Deuterium Export': ['actTR', 'act_ep'],
  'Directed Impactors': ['actTR', 'res'],
  'Dirigibles': ['actMC'],
  'Economic Espionage': ['actMC'],
  'Extractor Balloons': ['vn', 'actTR', 'actVn'],
  'Floating Refinery': ['actMC'],
  'Forced Precipitation': ['actMC'],
  'GHG Producing Bacteria': ['actTR', 'actTmp'],
  'Icy Impactors': ['actTR', 'res'],
  'Jet Stream Microscrappers': ['actTR'],
  'Jupiter Floating Station': ['actMC'],
  'Local Shading': ['actTR', 'act_mp'],
  'Martian Repository': ['actCD'],
  'Neptunian Power Consultants': ['actMC'],
  'Nitrite Reducing Bacteria': ['tr', 'actTR'],
  'Physics Complex': ['actTR'],
  'Psychrophiles': ['actMC'],
  'Regolith Eaters': ['actTR', 'actO2'],
  'Refugee Camps': ['actMC'],
  'Rotator Impacts': ['actTR', 'res', 'tg'],
  'Stratopolis': ['actCD'],
  'Sulphur-Eating Bacteria': ['actMC'],
  'Thermophiles': ['actTR', 'actVn'],
};
const noStaticResourceActionCards = new Set([
  'Comet Aiming',
  'Communication Center',
  'Directed Impactors',
  'Economic Espionage',
  'Icy Impactors',
  'Martian Repository',
  'Neptunian Power Consultants',
  'Rotator Impacts',
]);
const triggerOnlyNoStaticActionCards = [
  'Arklight',
  'Bactoviral Research',
  'Decomposers',
  'Ecological Zone',
  'Ecological Zone:ares',
  'Hecate Speditions',
  'Herbivores',
  'Mars University',
  'Microgravity Nutrition',
  'Ocean Sanctuary',
  'Olympus Conference',
  'Pets',
  'Pristar',
  'Recyclon',
  'Research & Development Hub',
  'Thiolava Vents',
  'Venusian Animals',
  'Whales',
];
for (const [name, staleKeys] of Object.entries(statefulOrActionStaleKeys)) {
  for (const staleKey of staleKeys) {
    assert.strictEqual(hasOwn(effects[name], staleKey), false, name + ' effects should not expose stale ' + staleKey);
  }
  if (noStaticResourceActionCards.has(name)) {
    assert.strictEqual(
      hasOwn(cardData[name] || {}, 'action'),
      false,
      name + ' should not expose a trigger-only or paid resource path as a free static action',
    );
    if (name === 'Comet Aiming') {
      assert.strictEqual(cardData[name].actionChoices.length, 2, name + ' should preserve both paid/add and spend/ocean branches');
      assert.strictEqual(cardData[name].actionChoices[0].stock.titanium, -1, name + ' add branch should expose titanium cost');
      assert.strictEqual(cardData[name].actionChoices[0].target, 'any', name + ' add branch should target any asteroid card');
      assert.strictEqual(cardData[name].actionChoices[1].conditional, true, name + ' ocean branch should be conditional on an asteroid');
      assert.strictEqual(cardData[name].actionChoices[1].global.ocean, 1, name + ' ocean branch should place an ocean');
    }
    if (name === 'Directed Impactors') {
      assert.strictEqual(cardData[name].actionChoices.length, 2, name + ' should preserve both paid/add and spend/temperature branches');
      assert.strictEqual(cardData[name].actionChoices[0].stock.megacredits, -6, name + ' add branch should expose MC cost');
      assert.strictEqual(cardData[name].actionChoices[0].canUseTitanium, true, name + ' add branch should preserve titanium payment');
      assert.strictEqual(cardData[name].actionChoices[1].conditional, true, name + ' temperature branch should be conditional on an asteroid');
      assert.strictEqual(cardData[name].actionChoices[1].global.temperature, 1, name + ' temperature branch should raise temperature');
    }
    if (name === 'Icy Impactors') {
      assert.strictEqual(cardData[name].actionChoices.length, 2, name + ' should preserve both paid/add and spend/ocean branches');
      assert.strictEqual(cardData[name].actionChoices[0].stock.megacredits, -10, name + ' add branch should expose MC cost');
      assert.strictEqual(cardData[name].actionChoices[0].addResources, 2, name + ' add branch should add two asteroids');
      assert.strictEqual(cardData[name].actionChoices[0].canUseTitanium, true, name + ' add branch should preserve titanium payment');
      assert.strictEqual(cardData[name].actionChoices[1].conditional, true, name + ' ocean branch should be conditional on an asteroid');
      assert.strictEqual(cardData[name].actionChoices[1].global.ocean, 1, name + ' ocean branch should place an ocean');
    }
    if (name === 'Rotator Impacts') {
      assert.strictEqual(cardData[name].actionChoices.length, 2, name + ' should preserve both paid/add and spend/raise branches');
      assert.strictEqual(cardData[name].actionChoices[0].stock.megacredits, -6, name + ' add branch should expose MC cost');
      assert.strictEqual(cardData[name].actionChoices[0].canUseTitanium, true, name + ' add branch should preserve titanium payment');
      assert.strictEqual(cardData[name].actionChoices[1].conditional, true, name + ' Venus branch should be conditional on an asteroid');
      assert.strictEqual(cardData[name].actionChoices[1].global.venus, 1, name + ' Venus branch should raise Venus');
    }
    continue;
  }
  if (name === 'Floating Refinery') {
    assert.strictEqual(
      hasOwn(cardData[name] || {}, 'action'),
      false,
      name + ' should not keep the stale payout action after removing actMC',
    );
    assert.strictEqual(cardData[name].actionChoices.length, 2, name + ' should preserve both add-floater and spend-floaters branches');
    assert.strictEqual(cardData[name].actionChoices[0].addResources, 1, name + ' first branch should add a floater');
    assert.strictEqual(cardData[name].actionChoices[1].conditional, true, name + ' payout branch should be conditional on floaters');
    assert.strictEqual(cardData[name].actionChoices[1].stock.titanium, 1, name + ' payout branch should gain titanium');
    assert.strictEqual(cardData[name].actionChoices[1].stock.megacredits, 2, name + ' payout branch should gain MC');
    continue;
  }
  if (name === 'Refugee Camps') {
    assert.strictEqual(cardData[name].action.addResources, 1, name + ' should keep its camp-resource action branch');
    assert.strictEqual(cardData[name].action.production.megacredits, -1, name + ' action should model MC production loss');
    assert.strictEqual(hasOwn(cardData[name].action, 'stock'), false, name + ' should not model production loss as stock MC loss');
    continue;
  }
  if (name === 'Physics Complex') {
    assert.strictEqual(cardData[name].action.addResources, 1, name + ' should keep its science-resource action branch');
    assert.strictEqual(cardData[name].action.stock.energy, -6, name + ' should expose the 6 energy action cost');
    assert.strictEqual(hasOwn(cardData[name].action, 'tr'), false, name + ' should not expose a simultaneous TR action');
    assert.strictEqual(hasOwn(cardData[name].action, 'global'), false, name + ' should not expose a simultaneous global action');
    continue;
  }
  assertResourceOnlyAction(name);
}
for (const name of triggerOnlyNoStaticActionCards) {
  assert.strictEqual(hasOwn(cardData[name] || {}, 'action'), false, name + ' should not expose trigger-only resources as recurring actions');
}
assert.strictEqual(hasOwn(effects['Olympus Conference'], 'actCD'), false, 'Olympus Conference science trigger should not be a blue-card draw action');
assert.strictEqual(hasOwn(effects['Mars University'], 'actCD'), false, 'Mars University science trigger should not be a blue-card draw action');
assert.strictEqual(cardData['Decomposers'].resourceType, 'microbe', 'Decomposers should keep resource metadata after dropping fake action');
assert.strictEqual(cardData['Decomposers'].vp.per, 3, 'Decomposers should keep VP/resource metadata after dropping fake action');
assert.strictEqual(cardData['Pets'].resourceType, 'animal', 'Pets should keep animal resource metadata after dropping fake action');
assert.strictEqual(cardData['Arklight'].resourceType, 'animal', 'Arklight should keep animal resource metadata from canonical card data');
assert.strictEqual(cardData['Research & Development Hub'].resourceType, 'data', 'Research & Development Hub should keep data resource metadata from canonical card data');
assert.strictEqual(cardData['Whales'].resourceType, 'animal', 'Whales should keep animal resource metadata from canonical card data');
for (const [name, per] of Object.entries({
  'Aeron Genomics': 3,
  'Ants': 2,
  'Arklight': 2,
  'Asteroid Hollowing': 2,
  'Celestic': 3,
  'Cloud Tourism': 3,
  'Decomposers': 3,
  'Ecological Zone:ares': 2,
  'Henkei Genetics': 3,
  'Main Belt Asteroids': 2,
  'Physics Complex': 0.5,
  'Research & Development Hub': 3,
  'Stratopolis': 3,
  'Thiolava Vents': 3,
  'Venusian Animals': 1,
})) {
  assert.strictEqual(cardData[name].vp.type, 'per_resource', name + ' should score VP from resources, not tags/static VP');
  assert.strictEqual(cardData[name].vp.per, per, name + ' should preserve canonical VP/resource divisor');
}
assertResourceOnlyAction('Weather Balloons');
assert.strictEqual(hasOwn(effects['Ore Processor'], 'tp'), false, 'Ore Processor should not expose a fake immediate titanium production value');
assert.strictEqual(effects['Ore Processor'].actTI, 1, 'Ore Processor effects should expose action titanium gain');
assert.strictEqual(cardData['Ore Processor'].action.stock.titanium, 1, 'Ore Processor action should gain titanium, not MC');
assert.strictEqual(cardData['Ore Processor'].action.global.oxygen, 1, 'Ore Processor action should keep the oxygen raise');
assert.strictEqual(hasOwn(cardData['Ore Processor'].behavior, 'production'), false, 'Ore Processor should not expose zero titanium production behavior');
assert.strictEqual(effects['Steelworks'].actST, 2, 'Steelworks effects should expose action steel gain');
assert.strictEqual(hasOwn(effects['Steelworks'], 'actMC'), false, 'Steelworks should not value steel as action MC');
assert.strictEqual(cardData['Steelworks'].action.stock.steel, 2, 'Steelworks action should gain steel, not MC');
assert.strictEqual(cardData['Steelworks'].action.global.oxygen, 1, 'Steelworks action should keep the oxygen raise');
assert.strictEqual(hasOwn(cardData['Steelworks'].action.stock, 'megacredits'), false, 'Steelworks action should not gain MC');
assert.strictEqual(effects['Ironworks'].actST, 1, 'Ironworks effects should expose action steel gain');
assert.strictEqual(hasOwn(effects['Ironworks'], 'actMC'), false, 'Ironworks should not value steel as action MC');
assert.strictEqual(cardData['Ironworks'].action.stock.steel, 1, 'Ironworks action should gain steel, not MC');
assert.strictEqual(cardData['Ironworks'].action.global.oxygen, 1, 'Ironworks action should keep the oxygen raise');
assert.strictEqual(hasOwn(cardData['Ironworks'].action.stock, 'megacredits'), false, 'Ironworks action should not gain MC');
assert.strictEqual(hasOwn(effects['Water Splitting Plant'], 'actTR'), false, 'Water Splitting Plant should not double-count TR beside oxygen');
assert.strictEqual(cardData['Water Splitting Plant'].action.global.oxygen, 1, 'Water Splitting Plant action should keep the oxygen raise');
assert.strictEqual(hasOwn(cardData['Water Splitting Plant'].action, 'tr'), false, 'Water Splitting Plant action should not expose separate TR');
assert.strictEqual(effects['Meltworks'].actST, 3, 'Meltworks effects should expose action steel gain');
assert.strictEqual(hasOwn(effects['Meltworks'], 'actMC'), false, 'Meltworks should not value steel as action MC');
assert.strictEqual(cardData['Meltworks'].action.stock.steel, 3, 'Meltworks action should gain steel, not MC');
assert.strictEqual(hasOwn(cardData['Meltworks'].action.stock, 'megacredits'), false, 'Meltworks action should not gain MC');
assert.strictEqual(hasOwn(effects['Venus Magnetizer'], 'ep'), false, 'Venus Magnetizer should not spend energy production on play');
assert.strictEqual(hasOwn(effects['Venus Magnetizer'], 'actMC'), false, 'Venus Magnetizer should not value the Venus action as MC stock');
assert.strictEqual(cardData['Venus Magnetizer'].action.global.venus, 1, 'Venus Magnetizer action should keep the Venus raise');
assert.strictEqual(cardData['Venus Magnetizer'].action.production.energy, -1, 'Venus Magnetizer action should spend energy production');
assert.strictEqual(hasOwn(cardData['Venus Magnetizer'].behavior, 'production'), false, 'Venus Magnetizer should not expose immediate energy production loss');
assert.strictEqual(hasOwn(cardData['Venus Magnetizer'].action, 'stock'), false, 'Venus Magnetizer action should not gain MC');
assert.strictEqual(hasOwn(effects['Equatorial Magnetizer'], 'tr'), false, 'Equatorial Magnetizer should not gain TR on play');
assert.strictEqual(hasOwn(effects['Equatorial Magnetizer'], 'ep'), false, 'Equatorial Magnetizer should not spend energy production on play');
assert.strictEqual(cardData['Equatorial Magnetizer'].action.tr, 1, 'Equatorial Magnetizer action should keep the TR raise');
assert.strictEqual(cardData['Equatorial Magnetizer'].action.production.energy, -1, 'Equatorial Magnetizer action should spend energy production');
assert.strictEqual(hasOwn(cardData['Equatorial Magnetizer'], 'behavior'), false, 'Equatorial Magnetizer should not expose immediate play behavior');
assert.strictEqual(hasOwn(effects['Caretaker Contract'], 'actMC'), false, 'Caretaker Contract should not value heat spending as MC stock');
assert.strictEqual(cardData['Caretaker Contract'].action.tr, 1, 'Caretaker Contract action should keep the TR raise');
assert.strictEqual(cardData['Caretaker Contract'].action.stock.heat, -8, 'Caretaker Contract action should expose its heat cost');
assert.strictEqual(hasOwn(cardData['Caretaker Contract'].action.stock, 'megacredits'), false, 'Caretaker Contract action should not gain MC');
for (const name of ['Restricted Area', 'Restricted Area:ares']) {
  assert.strictEqual(effects[name].actCD, 1, name + ' effects should expose the action card draw');
  assert.strictEqual(effects[name].actMC, -2, name + ' effects should expose the 2 MC action cost');
  assert.strictEqual(cardData[name].action.drawCard, 1, name + ' action should draw a card');
  assert.strictEqual(cardData[name].action.stock.megacredits, -2, name + ' action should pay MC, not gain MC');
}
assert.strictEqual(cardData['Project Workshop'].behavior.stock.steel, 1, 'Project Workshop should keep starting steel');
assert.strictEqual(cardData['Project Workshop'].behavior.stock.titanium, 1, 'Project Workshop should keep starting titanium');
assert.strictEqual(effects['Project Workshop'].actCD, 1, 'Project Workshop effects should keep the paid blue-card draw branch');
assert.strictEqual(effects['Project Workshop'].actMC, -3, 'Project Workshop effects should expose the 3 MC action cost');
assert.strictEqual(hasOwn(effects['Project Workshop'], 'actTR'), false, 'Project Workshop should not expose an averaged TR action');
assert.strictEqual(cardData['Project Workshop'].action.drawCard, 1, 'Project Workshop action should draw a blue card as a card draw');
assert.strictEqual(cardData['Project Workshop'].action.stock.megacredits, -3, 'Project Workshop action should pay MC, not gain MC');
assert.strictEqual(hasOwn(cardData['Project Workshop'].action, 'tr'), false, 'Project Workshop action should not expose fake averaged TR');
assert.strictEqual(cardData['Project Workshop'].actionChoices.length, 2, 'Project Workshop should preserve both OR action choices');
assert.strictEqual(cardData['Project Workshop'].actionChoices[0].drawCard, 1, 'Project Workshop first action choice should be the paid blue-card draw');
assert.strictEqual(cardData['Project Workshop'].actionChoices[0].stock.megacredits, -3, 'Project Workshop paid draw choice should expose the MC cost');
assert.strictEqual(cardData['Project Workshop'].actionChoices[1].conditional, true, 'Project Workshop flip branch should be marked conditional');
assert.strictEqual(cardData['Project Workshop'].actionChoices[1].drawCard, 2, 'Project Workshop flip branch should draw 2 cards');
assert.strictEqual(cardData['Project Workshop'].actionChoices[1].trFromDiscardedCardVP, true, 'Project Workshop flip branch should preserve VP-to-TR conversion');
assert.strictEqual(hasOwn(effects['Energy Market'], 'actMC'), false, 'Energy Market should not expose a static MC action for its OR action');
assert.strictEqual(hasOwn(cardData['Energy Market'] || {}, 'action'), false, 'Energy Market should not expose a misleading static action');
assert.strictEqual(cardData['Energy Market'].actionChoices.length, 2, 'Energy Market should preserve both variable-energy and energy-prod cash branches');
assert.strictEqual(cardData['Energy Market'].actionChoices[0].variable, true, 'Energy Market energy branch should be variable');
assert.strictEqual(cardData['Energy Market'].actionChoices[0].stockRatio.megacredits, -2, 'Energy Market energy branch should expose 2 MC per energy');
assert.strictEqual(cardData['Energy Market'].actionChoices[0].stockRatio.energy, 1, 'Energy Market energy branch should expose gained energy');
assert.strictEqual(cardData['Energy Market'].actionChoices[1].conditional, true, 'Energy Market cash branch should be conditional on energy production');
assert.strictEqual(cardData['Energy Market'].actionChoices[1].production.energy, -1, 'Energy Market cash branch should spend energy production');
assert.strictEqual(cardData['Energy Market'].actionChoices[1].stock.megacredits, 8, 'Energy Market cash branch should gain 8 MC');
assert.strictEqual(hasOwn(effects['Floyd Continuum'], 'cd'), false, 'Floyd Continuum should not expose a false immediate card draw');
assert.strictEqual(!!(cardData['Floyd Continuum'].behavior && cardData['Floyd Continuum'].behavior.drawCard), false, 'Floyd Continuum card data should not draw on play');
assert.strictEqual(cardData['Floyd Continuum'].actionChoices.length, 1, 'Floyd Continuum should preserve its dynamic MC action');
assert.strictEqual(cardData['Floyd Continuum'].actionChoices[0].completedParameterMc, 3, 'Floyd Continuum action should gain 3 MC per completed parameter');
assert.strictEqual(cardData['Power Infrastructure'].actionChoices.length, 1, 'Power Infrastructure should expose its variable energy-to-MC action');
assert.strictEqual(cardData['Power Infrastructure'].actionChoices[0].stockRatio.energy, -1, 'Power Infrastructure action should spend energy');
assert.strictEqual(cardData['Power Infrastructure'].actionChoices[0].stockRatio.megacredits, 1, 'Power Infrastructure action should gain matching MC');
assert.strictEqual(cardData['Hi-Tech Lab'].actionChoices.length, 1, 'Hi-Tech Lab should expose its variable energy draw action');
assert.strictEqual(cardData['Hi-Tech Lab'].actionChoices[0].stockRatio.energy, -1, 'Hi-Tech Lab action should spend energy');
assert.strictEqual(cardData['Hi-Tech Lab'].actionChoices[0].drawCardRatio.keepMax, 1, 'Hi-Tech Lab action should keep one drawn card');
assert.strictEqual(cardData['United Nations Mars Initiative'].actionChoices.length, 1, 'UNMI should expose its conditional TR action');
assert.strictEqual(cardData['United Nations Mars Initiative'].actionChoices[0].stock.megacredits, -3, 'UNMI action should pay 3 MC');
assert.strictEqual(cardData['United Nations Mars Initiative'].actionChoices[0].tr, 1, 'UNMI action should raise TR');
assert.strictEqual(cardData['Factorum'].actionChoices.length, 2, 'Factorum should preserve energy-production and building-draw branches');
assert.strictEqual(cardData['Factorum'].actionChoices[0].conditional, true, 'Factorum production branch should be conditional on no energy resources');
assert.strictEqual(cardData['Factorum'].actionChoices[0].production.energy, 1, 'Factorum production branch should increase energy production');
assert.strictEqual(cardData['Factorum'].actionChoices[1].stock.megacredits, -3, 'Factorum draw branch should pay 3 MC');
assert.strictEqual(cardData['Factorum'].actionChoices[1].tagConstraint, 'building', 'Factorum draw branch should draw a building card');
assert.strictEqual(cardData['Tycho Magnetics'].actionChoices[0].drawCardRatio.keepMax, 1, 'Tycho Magnetics should preserve its keep-1 draw action');
assert.strictEqual(cardData['Kuiper Cooperative'].actionChoices[0].addResourcesPerTag.tag, 'space', 'Kuiper Cooperative should add asteroids per space tag');
assert.strictEqual(hasOwn(effects['Stormcraft Incorporated'], 'hp'), false, 'Stormcraft Incorporated should not expose false heat production');
assert.strictEqual(!!(cardData['Stormcraft Incorporated'].behavior && cardData['Stormcraft Incorporated'].behavior.production), false, 'Stormcraft Incorporated should not expose heat production behavior');
assert.strictEqual(cardData['Stormcraft Incorporated'].actionChoices[0].resourceType, 'floater', 'Stormcraft Incorporated action should add a floater');
assert.strictEqual(cardData['Stormcraft Incorporated'].actionChoices[0].target, 'any', 'Stormcraft Incorporated should add a floater to any card');
assert.strictEqual(hasOwn(effects['Robinson Industries'], 'mp'), false, 'Robinson Industries should not expose false MC production');
assert.strictEqual(hasOwn(cardData['Robinson Industries'], 'behavior'), false, 'Robinson Industries should not expose MC production behavior');
assert.strictEqual(cardData['Robinson Industries'].actionChoices[0].stock.megacredits, -4, 'Robinson Industries action should pay 4 MC');
assert.strictEqual(cardData['Robinson Industries'].actionChoices[0].productionChoice.lowestOnly, true, 'Robinson Industries should only increase a lowest production');
assert.strictEqual(cardData['Palladin Shipping'].actionChoices[0].stock.titanium, -2, 'Palladin Shipping action should spend 2 titanium');
assert.strictEqual(cardData['Palladin Shipping'].actionChoices[0].global.temperature, 1, 'Palladin Shipping action should raise temperature');
assert.strictEqual(cardData['Utopia Invest'].actionChoices[0].productionToStockRatio.stock, 4, 'Utopia Invest action should gain 4 matching resources');
assert.strictEqual(cardData['Arcadian Communities'].actionChoices[0].boardAction, 'place_community_marker', 'Arcadian Communities should expose community marker action');
assert.strictEqual(cardData['Hadesphere'].actionChoices[0].underworld.excavate, 1, 'Hadesphere should expose its excavate action');
assert.strictEqual(cardData['Focused Organization'].actionChoices[0].gainStandardResource, 1, 'Focused Organization should expose its standard resource exchange action');
assert.strictEqual(cardData['World Government Advisor'].actionChoices[0].noTR, true, 'World Government Advisor action should not grant TR');
assert.strictEqual(cardData['Atmo Collectors'].actionChoices.length, 4, 'Atmo Collectors should preserve all OR action choices');
assert.strictEqual(cardData['Atmo Collectors'].actionChoices[0].addResources, 1, 'Atmo Collectors first branch should add a floater');
assert.strictEqual(cardData['Atmo Collectors'].actionChoices[1].stock.titanium, 2, 'Atmo Collectors titanium branch should gain 2 titanium');
assert.strictEqual(cardData['Atmo Collectors'].actionChoices[2].stock.energy, 3, 'Atmo Collectors energy branch should gain 3 energy');
assert.strictEqual(cardData['Atmo Collectors'].actionChoices[3].stock.heat, 4, 'Atmo Collectors heat branch should gain 4 heat');
assert.strictEqual(cardData['Floater Technology'].actionChoices.length, 1, 'Floater Technology should expose its floater placement action');
assert.strictEqual(cardData['Floater Technology'].actionChoices[0].target, 'another', 'Floater Technology should target another card');
assert.strictEqual(cardData['Local Shading'].actionChoices.length, 2, 'Local Shading should preserve both add-floater and spend-floater branches');
assert.strictEqual(cardData['Local Shading'].actionChoices[0].addResources, 1, 'Local Shading first branch should add a floater');
assert.strictEqual(cardData['Local Shading'].actionChoices[1].conditional, true, 'Local Shading production branch should be conditional on a floater');
assert.strictEqual(cardData['Local Shading'].actionChoices[1].production.megacredits, 1, 'Local Shading production branch should increase MC production');
assert.strictEqual(cardData['Sulphur-Eating Bacteria'].actionChoices.length, 2, 'Sulphur-Eating Bacteria should preserve both add/spend microbe branches');
assert.strictEqual(cardData['Sulphur-Eating Bacteria'].actionChoices[0].resourceType, 'microbe', 'Sulphur-Eating Bacteria first branch should add a microbe');
assert.strictEqual(cardData['Sulphur-Eating Bacteria'].actionChoices[1].variable, true, 'Sulphur-Eating Bacteria spend branch should be variable');
assert.strictEqual(cardData['Sulphur-Eating Bacteria'].actionChoices[1].stockRatio.megacredits, 3, 'Sulphur-Eating Bacteria spend branch should gain 3 MC per microbe');
assert.strictEqual(cardData['Titan Air-scrapping'].actionChoices.length, 2, 'Titan Air-scrapping should preserve both paid/add and spend/TR branches');
assert.strictEqual(cardData['Titan Air-scrapping'].actionChoices[0].stock.titanium, -1, 'Titan Air-scrapping add branch should spend titanium');
assert.strictEqual(cardData['Titan Air-scrapping'].actionChoices[0].addResources, 2, 'Titan Air-scrapping add branch should add two floaters');
assert.strictEqual(cardData['Titan Air-scrapping'].actionChoices[1].conditional, true, 'Titan Air-scrapping TR branch should be conditional on floaters');
assert.strictEqual(cardData['Titan Air-scrapping'].actionChoices[1].tr, 1, 'Titan Air-scrapping TR branch should raise TR');
assert.strictEqual(cardData['Titan Shuttles'].actionChoices.length, 2, 'Titan Shuttles should preserve both add-floaters and spend-floaters branches');
assert.strictEqual(cardData['Titan Shuttles'].actionChoices[0].tagConstraint, 'jovian', 'Titan Shuttles add branch should require a Jovian target');
assert.strictEqual(cardData['Titan Shuttles'].actionChoices[1].variable, true, 'Titan Shuttles spend branch should be variable');
assert.strictEqual(cardData['Titan Shuttles'].actionChoices[1].stockRatio.titanium, 1, 'Titan Shuttles spend branch should gain titanium per floater');
assert.strictEqual(cardData['Floating Trade Hub'].actionChoices.length, 2, 'Floating Trade Hub should preserve both add-floaters and conversion branches');
assert.strictEqual(cardData['Floating Trade Hub'].actionChoices[0].addResources, 2, 'Floating Trade Hub add branch should add two floaters');
assert.strictEqual(cardData['Floating Trade Hub'].actionChoices[1].standardResourceChoice, true, 'Floating Trade Hub conversion branch should choose a standard resource');
assert.strictEqual(cardData['Electro Catapult'].action.stock.megacredits, 7, 'Electro Catapult action should keep the 7 MC payout');
assert.strictEqual(cardData['Electro Catapult'].action.stock.plants, -1, 'Electro Catapult action should expose its plant/steel spend cost');
assert.strictEqual(cardData['Directed Heat Usage'].action.stock.megacredits, 4, 'Directed Heat Usage action should keep the 4 MC payout');
assert.strictEqual(cardData['Directed Heat Usage'].action.stock.heat, -3, 'Directed Heat Usage action should expose its heat cost');
assert.strictEqual(cardData['Martian Rails'].action.stock.megacredits, 3, 'Martian Rails should keep the dynamic MC heuristic');
assert.strictEqual(cardData['Martian Rails'].action.stock.energy, -1, 'Martian Rails should expose its energy cost');
assert.strictEqual(cardData['Space Elevator'].action.stock.megacredits, 5, 'Space Elevator action should keep the 5 MC payout');
assert.strictEqual(cardData['Space Elevator'].action.stock.steel, -1, 'Space Elevator action should expose its steel cost');
assert.strictEqual(cardData['Personal Spacecruiser'].action.stock.megacredits, 2, 'Personal Spacecruiser should keep the corruption MC heuristic');
assert.strictEqual(cardData['Personal Spacecruiser'].action.stock.energy, -1, 'Personal Spacecruiser should expose its energy cost');
assert.strictEqual(cardData['Battery Factory'].action.stock.megacredits, 2, 'Battery Factory should keep the power-tag MC heuristic');
assert.strictEqual(cardData['Battery Factory'].action.stock.energy, -1, 'Battery Factory should expose its energy cost');
for (const name of ['Industrial Center', 'Industrial Center:ares']) {
  assert.strictEqual(hasOwn(effects[name], 'sp'), false, name + ' should not expose steel production on play');
  assert.strictEqual(effects[name].actMC, -7, name + ' action should spend 7 MC');
  assert.strictEqual(effects[name].act_sp, 1, name + ' action should increase steel production');
  assert.strictEqual(cardData[name].action.stock.megacredits, -7, name + ' action should pay MC, not gain MC');
  assert.strictEqual(cardData[name].action.production.steel, 1, name + ' action should increase steel production');
  assert.strictEqual(hasOwn(cardData[name], 'behavior'), false, name + ' should not expose immediate steel production behavior');
}
assert.strictEqual(hasOwn(effects['Bio Printing Facility'], 'actMC'), false, 'Bio Printing Facility should not expose plant/animal choice as MC income');
assert.strictEqual(cardData['Bio Printing Facility'].action.stock.energy, -2, 'Bio Printing Facility action should expose its energy cost');
assert.strictEqual(cardData['Bio Printing Facility'].action.stock.plants, 2, 'Bio Printing Facility action should expose the plant branch');
assert.strictEqual(cardData['Bio Printing Facility'].actionChoices.length, 2, 'Bio Printing Facility should preserve both OR action choices');
assert.strictEqual(cardData['Bio Printing Facility'].actionChoices[0].stock.energy, -2, 'Bio Printing Facility plant branch should expose energy cost');
assert.strictEqual(cardData['Bio Printing Facility'].actionChoices[0].stock.plants, 2, 'Bio Printing Facility plant branch should gain plants');
assert.strictEqual(cardData['Bio Printing Facility'].actionChoices[1].conditional, true, 'Bio Printing Facility animal branch should be marked conditional');
assert.strictEqual(cardData['Bio Printing Facility'].actionChoices[1].resourceType, 'animal', 'Bio Printing Facility animal branch should target animals');
assert.strictEqual(cardData['Bio Printing Facility'].actionChoices[1].target, 'another', 'Bio Printing Facility animal branch should target another card');
assert.strictEqual(hasOwn(effects['Chemical Factory'], 'actMC'), false, 'Chemical Factory should not expose excavation as MC income');
assert.strictEqual(hasOwn(cardData['Chemical Factory'] || {}, 'action'), false, 'Chemical Factory should not expose unsupported excavation as a static MC action');
for (const name of [
  'Cryptocurrency',
  'Mars Nomads',
  'Saturn Surfing',
  'Chemical Factory',
  'Corporate Theft',
  'Deep Foundations',
  'Monopoly',
  'Space Privateers',
  'Stem Field Subsidies',
  'Titan Manufacturing Colony',
  'Underground Shelters',
  'Voltaic Metallurgy',
]) {
  assert.strictEqual(hasOwn(effects[name], 'actMC'), false, name + ' should not expose a stateful/board action as static MC income');
  assert.strictEqual(hasOwn(cardData[name] || {}, 'action'), false, name + ' should not expose a misleading static MC action');
}
assert.strictEqual(cardData['Septem Tribus'].actionChoices[0].tagFlexAction, true, 'Septem Tribus should expose wild-tag action flexibility without static income');
assert.strictEqual(cardData['Self-replicating Robots'].actionChoices.length, 2, 'Self-replicating Robots should expose link/double action choices');
assert.strictEqual(cardData['Self-replicating Robots'].actionChoices[0].hostCardFromHand, true, 'Self-replicating Robots should link a card from hand');
assert.strictEqual(cardData['Self-replicating Robots'].actionChoices[1].doubleHostedResources, true, 'Self-replicating Robots should double hosted resources');
assert.strictEqual(cardData['Orbital Cleanup'].actionChoices[0].stockPerTag.tag, 'science', 'Orbital Cleanup should scale with science tags');
assert.strictEqual(cardData['Orbital Cleanup'].actionChoices[0].stockPerTag.megacredits, 1, 'Orbital Cleanup should gain 1 MC per science tag');
assert.strictEqual(cardData['Mohole Lake'].actionChoices.length, 2, 'Mohole Lake should expose animal/microbe target choices');
assert.strictEqual(cardData['Mohole Lake'].actionChoices[0].target, 'another', 'Mohole Lake should target another card');
assert.strictEqual(cardData['Mohole Lake'].actionChoices[1].resourceType, 'animal', 'Mohole Lake should expose the animal branch');
assert.strictEqual(cardData['Saturn Surfing'].resourceType, 'floater', 'Saturn Surfing should expose its floater resource type');
assert.strictEqual(cardData['Saturn Surfing'].actionChoices[0].stockPerResourceHere.max, 5, 'Saturn Surfing should cap MC gain at 5');
assert.strictEqual(cardData['Saturn Surfing'].actionChoices[0].stockPerResourceHere.includesSpent, true, 'Saturn Surfing should count the paid floater');
assert.strictEqual(cardData['Mars Nomads'].actionChoices[0].boardAction, 'move_nomads', 'Mars Nomads should expose a board action, not MC income');
assert.strictEqual(cardData['Mars Nomads'].actionChoices[0].placementBonus, true, 'Mars Nomads should collect placement bonus');
assert.strictEqual(cardData['Teslaract'].actionChoices[0].production.energy, -1, 'Teslaract action should spend energy production');
assert.strictEqual(cardData['Teslaract'].actionChoices[0].production.plants, 1, 'Teslaract action should gain plant production');
assert.strictEqual(cardData['Hospitals'].resourceType, 'disease', 'Hospitals should expose disease resources');
assert.strictEqual(cardData['Hospitals'].actionChoices[0].spendResources.type, 'disease', 'Hospitals should spend a disease');
assert.strictEqual(cardData['Hospitals'].actionChoices[0].stockPerBoard.per, 'city', 'Hospitals payout should scale with cities in play');
assert.strictEqual(cardData['Maxwell Base'].actionChoices[0].tagConstraint, 'venus', 'Maxwell Base should target another Venus card');
assert.strictEqual(cardData['Geologist Team'].actionChoices[0].underworld.identify, 1, 'Geologist Team should identify one underground resource');
assert.strictEqual(cardData['Search for Life Underground'].resourceType, 'science', 'Search for Life Underground should expose science resources');
assert.strictEqual(cardData['Search for Life Underground'].actionChoices[0].stock.megacredits, -1, 'Search for Life Underground action should cost 1 MC');
assert.strictEqual(cardData['Search for Life Underground'].actionChoices[0].addResourcesIfToken.resourceType, 'science', 'Search for Life Underground should add science resource on a microbe token');
assert.strictEqual(cardData['Chemical Factory'].actionChoices[0].stock.plants, -1, 'Chemical Factory action should spend a plant');
assert.strictEqual(cardData['Chemical Factory'].actionChoices[0].underworld.excavate, 1, 'Chemical Factory action should excavate');
assert.strictEqual(cardData['Corporate Theft'].actionChoices[0].stock.megacredits, -5, 'Corporate Theft action should cost 5 MC');
assert.strictEqual(cardData['Corporate Theft'].actionChoices[0].stealResource.count, 1, 'Corporate Theft action should steal one resource');
assert.strictEqual(cardData['Deep Foundations'].actionChoices[0].canUseSteel, true, 'Deep Foundations action should allow steel payment');
assert.strictEqual(cardData['Deep Foundations'].actionChoices[0].city, 1, 'Deep Foundations action should place a city');
assert.strictEqual(cardData['Monopoly'].actionChoices[0].spendCorruption, 1, 'Monopoly action should spend corruption');
assert.strictEqual(cardData['Monopoly'].actionChoices[0].productionChoice.count, 1, 'Monopoly action should increase one production');
assert.strictEqual(cardData['Space Privateers'].resourceType, 'fighter', 'Space Privateers should expose fighter resources');
assert.strictEqual(cardData['Space Privateers'].actionChoices[0].stockPerResourceHere.resourceType, 'fighter', 'Space Privateers payout should scale with fighters');
assert.strictEqual(cardData['Stem Field Subsidies'].resourceType, 'data', 'Stem Field Subsidies should expose data resources');
assert.strictEqual(cardData['Stem Field Subsidies'].actionChoices[0].underworld.claim, 1, 'Stem Field Subsidies action should claim one identified resource');
assert.strictEqual(cardData['Titan Manufacturing Colony'].resourceType, 'tool', 'Titan Manufacturing Colony should expose tool resources');
assert.strictEqual(cardData['Titan Manufacturing Colony'].actionChoices[0].underworld.excavate, 1, 'Titan Manufacturing Colony action should excavate');
assert.strictEqual(cardData['Underground Shelters'].actionChoices[0].underworld.shelterToken, 1, 'Underground Shelters action should mark a claimed token');
assert.strictEqual(cardData['Voltaic Metallurgy'].actionChoices[0].stockRatio.titanium, 1, 'Voltaic Metallurgy should convert steel to titanium');
assert.strictEqual(cardData['Voltaic Metallurgy'].actionChoices[0].maxByTag, 'power', 'Voltaic Metallurgy conversion should cap by power tags');
assert.strictEqual(effects['Physics Complex'].vpAcc, 0.5, 'Physics Complex should score 2 VP per science resource');
assert.strictEqual(cardData['Physics Complex'].vp.per, 0.5, 'Physics Complex card data should score 2 VP per science resource');
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
