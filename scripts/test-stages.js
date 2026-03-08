var fs = require('fs'), path = require('path');
function load(f,v) { var r=fs.readFileSync(path.resolve(__dirname,'..',f),'utf8').replace(/\bconst\b/g,'var'); return (new Function(r+'\nreturn '+v+';'))(); }
var TM_CARD_DATA = load('extension/data/card_data.js','TM_CARD_DATA');
var TM_CARD_TAGS = load('extension/data/card_tags.js','TM_CARD_TAGS');
var TM_CARD_VP = load('extension/data/card_vp.js','TM_CARD_VP');
var TM_CARD_EFFECTS = load('extension/data/card_effects.json.js','TM_CARD_EFFECTS');
var reqs = load('extension/data/card_tag_reqs.js','{ tagReqs: TM_CARD_TAG_REQS, globalReqs: TM_CARD_GLOBAL_REQS }');
var disc = load('extension/data/synergy_tables.json.js','typeof TM_CARD_DISCOUNTS!=="undefined"?TM_CARD_DISCOUNTS:{}');
var TM_BRAIN = require('../extension/tm-brain.js');
TM_BRAIN.setCardData(TM_CARD_TAGS, TM_CARD_VP, TM_CARD_DATA, disc, reqs.tagReqs, reqs.globalReqs);

var early = {
  game: {generation:2,temperature:-26,oxygen:2,oceans:1,venusScaleLevel:4},
  thisPlayer: {megaCredits:50,steel:3,titanium:2,tags:{building:2,space:1,science:0,earth:1,venus:0,microbe:0,plant:0},steelValue:2,titaniumValue:3},
  players:[{},{},{}]
};
var mid = {
  game: {generation:5,temperature:-14,oxygen:6,oceans:4,venusScaleLevel:12},
  thisPlayer: {megaCredits:40,steel:2,titanium:1,tags:{building:3,space:2,science:1,earth:2,venus:1,microbe:1,plant:1},steelValue:2,titaniumValue:3},
  players:[{},{},{}]
};
var late = {
  game: {generation:8,temperature:2,oxygen:11,oceans:7,venusScaleLevel:22},
  thisPlayer: {megaCredits:60,steel:4,titanium:2,tags:{building:5,space:4,science:3,earth:3,venus:2,microbe:2,plant:2,jovian:1},steelValue:2,titaniumValue:3},
  players:[{},{},{}]
};

function scoreAll(st) {
  var scored = [];
  for (var nm in TM_CARD_EFFECTS) {
    var fx = TM_CARD_EFFECTS[nm];
    if (!fx || fx.c == null || fx.c === 0) continue;
    scored.push({name:nm, score:TM_BRAIN.scoreCard({name:nm,cost:fx.c},st), cost:fx.c});
  }
  scored.sort(function(a,b){return b.score-a.score;});
  return scored;
}

function showTop(label, st, n) {
  console.log('=== ' + label + ' ===');
  var s = scoreAll(st);
  s.slice(0,n).forEach(function(c) {
    console.log(('  '+c.score.toFixed(1)).padStart(8) + '  ' + c.name + ' (' + c.cost + ')');
  });
  console.log('');
  console.log('Bottom 10:');
  s.slice(-10).forEach(function(c) {
    console.log(('  '+c.score.toFixed(1)).padStart(8) + '  ' + c.name + ' (' + c.cost + ')');
  });
  console.log('');
  var neg = s.filter(function(c){return c.score < -5;}).length;
  var pos = s.filter(function(c){return c.score >= 0;}).length;
  console.log('Score >= 0: ' + pos + '/' + s.length + ' (' + (pos/s.length*100).toFixed(0) + '%)');
  console.log('Score < -5: ' + neg);
  console.log('');
}

showTop('EARLY GAME (gen 2, temp -26, oxy 2, oceans 1, venus 4)', early, 20);
showTop('MID GAME (gen 5, temp -14, oxy 6, oceans 4, venus 12)', mid, 20);
showTop('LATE GAME (gen 8, temp 2, oxy 11, oceans 7, venus 22)', late, 20);

// === KEY CARDS: score across stages ===
console.log('=== KEY CARDS ACROSS STAGES ===');
console.log('Card'.padEnd(35) + 'Early'.padStart(8) + 'Mid'.padStart(8) + 'Late'.padStart(8));
console.log('-'.repeat(59));
var keyCards = [
  'Strip Mine','Giant Ice Asteroid','Deimos Down','Giant Solar Shade',
  'Business Empire','Cutting Edge Technology','AI Central','Space Port',
  'Birds','Fish','Livestock','Farming','Caretaker Contract',
  'Arctic Algae','ArchaeBacteria','Colonizer Training Camp',
  'Anti-Gravity Technology','Soletta','Solar Reflectors',
  'Kelp Farming','Algae','Mangrove',
  'Psychrophiles','Hermetic Order of Mars','Dust Seals',
  'Decomposers','Insects','Worms',
  'Electro Catapult','Steelworks','Development Center',
  'Earth Office','Immigrant City','Imported Nitrogen',
  'Terraforming Ganymede','Interstellar Colony Ship',
  'Venus Orbital Survey','Extractor Balloons',
];
keyCards.forEach(function(n) {
  var fx = TM_CARD_EFFECTS[n];
  if (!fx) return;
  var se = TM_BRAIN.scoreCard({name:n,cost:fx.c},early);
  var sm = TM_BRAIN.scoreCard({name:n,cost:fx.c},mid);
  var sl = TM_BRAIN.scoreCard({name:n,cost:fx.c},late);
  console.log(n.padEnd(35) + (se.toFixed(1)).padStart(8) + (sm.toFixed(1)).padStart(8) + (sl.toFixed(1)).padStart(8));
});
