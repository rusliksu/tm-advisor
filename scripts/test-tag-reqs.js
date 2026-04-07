var fs = require('fs');
var generatedExtensionData = require('./lib/generated-extension-data');
eval(fs.readFileSync(generatedExtensionData.resolveGeneratedExtensionPath('card_data.js'),'utf8').replace(/\bconst\b/g,'var'));
eval(fs.readFileSync(generatedExtensionData.resolveGeneratedExtensionPath('card_tags.js'),'utf8').replace(/\bconst\b/g,'var'));
eval(fs.readFileSync(generatedExtensionData.resolveGeneratedExtensionPath('card_vp.js'),'utf8').replace(/\bconst\b/g,'var'));
eval(generatedExtensionData.readGeneratedExtensionFile('synergy_tables.json.js','utf8').replace(/\bconst\b/g,'var'));
eval(generatedExtensionData.readGeneratedExtensionFile('card_effects.json.js','utf8').replace(/\bconst\b/g,'var'));
eval(generatedExtensionData.readGeneratedExtensionFile('card_tag_reqs.js','utf8').replace(/\bconst\b/g,'var'));
global.TM_CARD_TAGS = TM_CARD_TAGS;
global.TM_CARD_VP = TM_CARD_VP;
global.TM_CARD_DATA = TM_CARD_DATA;
global.TM_CARD_DISCOUNTS = typeof TM_CARD_DISCOUNTS !== 'undefined' ? TM_CARD_DISCOUNTS : {};
var TM_BRAIN = require('../extension/tm-brain.js');
TM_BRAIN.setCardData(TM_CARD_TAGS, TM_CARD_VP, TM_CARD_DATA, TM_CARD_DISCOUNTS, TM_CARD_TAG_REQS, TM_CARD_GLOBAL_REQS);
var state = {
  game: { generation: 5, temperature: -14, oxygen: 6, oceans: 4, venusScaleLevel: 12 },
  thisPlayer: { megaCredits: 40, steel: 2, titanium: 1,
    tags: {building:3,space:2,science:1,earth:2,venus:1,microbe:1,plant:1},
    steelValue: 2, titaniumValue: 3 },
  players: [{},{},{}]
};

console.log('=== TAG REQUIREMENT PENALTY TEST ===');
// Anti-Gravity: needs 7 sci, player has 1 sci + card has 1 sci = 2, gap = 5
console.log('Anti-Gravity Technology (1 sci tag): ' + TM_BRAIN.scoreCard({name:'Anti-Gravity Technology', cost:14}, state));

var state5 = JSON.parse(JSON.stringify(state));
state5.thisPlayer.tags.science = 5;
console.log('Anti-Gravity Technology (5 sci tags): ' + TM_BRAIN.scoreCard({name:'Anti-Gravity Technology', cost:14}, state5));

var state7 = JSON.parse(JSON.stringify(state));
state7.thisPlayer.tags.science = 7;
console.log('Anti-Gravity Technology (7 sci tags): ' + TM_BRAIN.scoreCard({name:'Anti-Gravity Technology', cost:14}, state7));

console.log('');
var tests = [
  ['Mass Converter', 8, 'science', 5],
  ['AI Central', 21, 'science', 3],
  ['Lightning Harvest', 8, 'science', 3],
  ['Interstellar Colony Ship', 24, 'science', 5],
  ['Strip Mine', 25, null, 0],  // no req
  ['Birds', 10, null, 0],        // no tag req
];
tests.forEach(function(t) {
  var s = TM_BRAIN.scoreCard({name:t[0], cost:t[1]}, state);
  console.log(t[0] + (t[2] ? ' (need ' + t[3] + ' ' + t[2] + ', have ' + (state.thisPlayer.tags[t[2]]||0) + ')' : '') + ': ' + s);
});

console.log('');
console.log('=== GLOBAL REQUIREMENT PENALTY TEST ===');
// State: temp=-14, oxygen=6, oceans=4, venus=12
// Birds: needs oxygen >= 13 → gap = (13-6)/1 = 7 steps → heavy penalty
console.log('Birds (oxy 13 min, have 6): ' + TM_BRAIN.scoreCard({name:'Birds', cost:10}, state));
// Arctic Algae: needs temp <= -12 → current -14 is OK (below max)
console.log('Arctic Algae (temp -12 max, have -14): ' + TM_BRAIN.scoreCard({name:'Arctic Algae', cost:12}, state));
// ArchaeBacteria: needs temp <= -18 → current -14 is OVER (past max by 2 steps)
console.log('ArchaeBacteria (temp -18 max, have -14): ' + TM_BRAIN.scoreCard({name:'ArchaeBacteria', cost:2}, state));
// Farming: needs temp >= 4 → gap = (4-(-14))/2 = 9 steps
console.log('Farming (temp 4 min, have -14): ' + TM_BRAIN.scoreCard({name:'Farming', cost:16}, state));
// Decomposers: needs oxygen >= 3 → current 6, MET
console.log('Decomposers (oxy 3 min, have 6): ' + TM_BRAIN.scoreCard({name:'Decomposers', cost:5}, state));
// Algae: needs oceans >= 5 → current 4, gap = 1
console.log('Algae (oceans 5 min, have 4): ' + TM_BRAIN.scoreCard({name:'Algae', cost:10}, state));
// Venusian Animals: needs venus >= 18 → current 12, gap = (18-12)/2 = 3 steps
console.log('Venusian Animals (venus 18 min, have 12): ' + TM_BRAIN.scoreCard({name:'Venusian Animals', cost:15}, state));
// Caretaker Contract: needs temp >= 0 → gap = (0-(-14))/2 = 7 steps
console.log('Caretaker Contract (temp 0 min, have -14): ' + TM_BRAIN.scoreCard({name:'Caretaker Contract', cost:3}, state));

// Test with warm state
var stateWarm = JSON.parse(JSON.stringify(state));
stateWarm.game.temperature = 2;
stateWarm.game.oxygen = 12;
stateWarm.game.oceans = 7;
stateWarm.game.venusScaleLevel = 18;
console.log('');
console.log('=== WARM STATE (temp=2, oxy=12, oceans=7, venus=18) ===');
console.log('Birds (oxy 13 min): ' + TM_BRAIN.scoreCard({name:'Birds', cost:10}, stateWarm));
console.log('Farming (temp 4 min): ' + TM_BRAIN.scoreCard({name:'Farming', cost:16}, stateWarm));
console.log('Arctic Algae (temp -12 max): ' + TM_BRAIN.scoreCard({name:'Arctic Algae', cost:12}, stateWarm));
console.log('Venusian Animals (venus 18 min): ' + TM_BRAIN.scoreCard({name:'Venusian Animals', cost:15}, stateWarm));

console.log('');
console.log('=== TOP 10 ===');
var scored = [];
for (var name in TM_CARD_EFFECTS) {
  var fx = TM_CARD_EFFECTS[name]; if (!fx || fx.c == null || fx.c === 0) continue;
  scored.push({name: name, score: TM_BRAIN.scoreCard({name: name, cost: fx.c}, state), cost: fx.c});
}
scored.sort(function(a,b) { return b.score - a.score; });
scored.slice(0, 10).forEach(function(c) {
  console.log(('  '+c.score.toFixed(1)).padStart(8) + '  ' + c.name + ' (' + c.cost + ')');
});
