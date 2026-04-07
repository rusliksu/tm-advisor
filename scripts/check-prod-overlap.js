// Check cards with MANUAL_EV + non-zero parsed production (potential double-count)
var fs = require('fs');
var generatedExtensionData = require('./lib/generated-extension-data');
eval(generatedExtensionData.readGeneratedExtensionFile('synergy_tables.json.js','utf8').replace(/^const /gm,'var '));
eval(fs.readFileSync(generatedExtensionData.resolveGeneratedExtensionPath('card_tags.js'),'utf8').replace(/^const /gm,'var '));
eval(fs.readFileSync(generatedExtensionData.resolveGeneratedExtensionPath('card_vp.js'),'utf8').replace(/^const /gm,'var '));
eval(fs.readFileSync(generatedExtensionData.resolveGeneratedExtensionPath('card_data.js'),'utf8').replace(/^const /gm,'var '));

var src = fs.readFileSync('extension/tm-brain.js','utf8');
var manualBlock = src.match(/var MANUAL_EV = \{[\s\S]*?\n  \};/)[0];
var re = /'([^']+)':\s*\{/g;
var manualKeys = new Set();
var m;
while ((m = re.exec(manualBlock)) !== null) manualKeys.add(m[1]);

global.TM_CARD_TAGS = TM_CARD_TAGS;
global.TM_CARD_VP = TM_CARD_VP;
global.TM_CARD_DATA = TM_CARD_DATA;
global.TM_CARD_DISCOUNTS = TM_CARD_DISCOUNTS;
var brain = require('../extension/tm-brain.js');
brain.setCardData(TM_CARD_TAGS, TM_CARD_VP, TM_CARD_DATA, TM_CARD_DISCOUNTS);

var state = {
  game: { generation: 5, temperature: -14, oxygen: 6, oceans: 4, venus: 12 },
  thisPlayer: { megaCredits: 40, steel: 2, titanium: 1, tags: {building:3, space:2, science:1, earth:2, venus:1, microbe:1}, steelValue: 2, titaniumValue: 3 },
  players: [{},{},{}]
};

console.log('=== MANUAL_EV + non-zero parsed production ===\n');

var suspicious = [];
for (var name of manualKeys) {
  var cd = TM_CARD_DATA[name];
  if (!cd || !cd.behavior || !cd.behavior.production) continue;
  var prod = cd.behavior.production;
  var prodParts = [];
  for (var pk in prod) {
    if (prod[pk] !== 0) prodParts.push(pk + ':' + prod[pk]);
  }
  if (prodParts.length === 0) continue;

  var meMatch = manualBlock.match(new RegExp("'" + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':\\s*\\{([^}]+)\\}"));
  var meStr = meMatch ? meMatch[1].trim() : '?';
  var score = brain.scoreCard({name: name, cost: cd.cost || 10}, state);

  suspicious.push({name: name, prod: prodParts.join(', '), manual: meStr, score: score});
}

// Known OK: cards where production is the immediate effect and MANUAL_EV is a separate trigger/action
var knownOK = new Set([
  'GHG Factories',    // prod: -1 energy, +4 heat. manual: action spend heat → +1 heat prod
  'Immigrant City',   // prod: -1 MC, -1 energy. manual: +1 MC per city trigger
  'Shuttles',         // prod: +2 MC, -1 energy. manual: -2 space discount
  'Mass Converter',   // prod: +6 energy. manual: -5 space discount (NOT in TM_CARD_DISCOUNTS)
  'Quantum Extractor',// prod: +4 energy. manual: -2 space discount
  'Meat Industry',    // prod: +2 MC. manual: +2 MC per animal tag trigger
  'Advertising',      // prod: +1 MC. manual: +2 MC per req card trigger
  'Homeostasis Bureau',// prod: +2 heat. manual: +3 MC per temp raise trigger
  'Agro-Drones',      // prod: +1 steel, +1 plant. manual: +1 plant per Mars tag trigger
  'AI Central',       // prod: -1 energy. manual: action draw 2
  'Electro Catapult', // prod: -1 steel. manual: action spend plant/steel → 7 MC
  'Venus Magnetizer', // prod: -1 energy. manual: action → Venus raise
  'Livestock',        // prod: -1 plant. manual: action +1 animal
]);

console.log('--- SUSPICIOUS (not in known-OK list) ---\n');
for (var s of suspicious) {
  if (knownOK.has(s.name)) continue;
  console.log(s.name + ' (score: ' + s.score + ')');
  console.log('  production: ' + s.prod);
  console.log('  MANUAL_EV: ' + s.manual);
  console.log('');
}

console.log('\n--- Known OK (prod + MANUAL_EV are separate effects) ---\n');
for (var s of suspicious) {
  if (!knownOK.has(s.name)) continue;
  console.log('  ✓ ' + s.name + ': prod=' + s.prod + ' | manual=' + s.manual + ' | score=' + s.score);
}
