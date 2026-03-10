#!/usr/bin/env node
// Test hand synergy scoring with sample hands
// Usage: node scripts/test-hand-synergy.js

var fs = require('fs');

// Load data files
var indirectEval = eval; // indirect eval → global scope
function loadGlobal(path) {
  var c = fs.readFileSync(path, 'utf8');
  c = c.replace(/^const /gm, 'var ');
  c = c.replace(/^if \(typeof module.*$/gm, '');
  indirectEval(c);
}

loadGlobal('extension/data/card_effects.json.js');
loadGlobal('extension/data/card_tags.js');
loadGlobal('extension/data/synergy_tables.json.js');

// Minimal scoreHandSynergy from content.js (extracted and adapted)
function getCardTagsLocal(n) {
  if (typeof TM_CARD_TAGS !== 'undefined' && TM_CARD_TAGS[n]) return TM_CARD_TAGS[n];
  return [];
}

// We'll eval the actual function from content.js
// First, extract it
var contentJs = fs.readFileSync('extension/content.js', 'utf8');
var fnStart = contentJs.indexOf('function scoreHandSynergy(cardName, myHand, ctx)');
var braceCount = 0;
var fnEnd = fnStart;
var started = false;
for (var i = fnStart; i < contentJs.length; i++) {
  if (contentJs[i] === '{') { braceCount++; started = true; }
  if (contentJs[i] === '}') { braceCount--; }
  if (started && braceCount === 0) { fnEnd = i + 1; break; }
}
var fnBody = contentJs.substring(fnStart, fnEnd);

// Create the function in global context
indirectEval(fnBody);

// Test hands
var testHands = [
  {
    name: 'Steel Engine',
    cards: ['Mining Operations', 'Open City', 'Underground City', 'Robotic Workforce', 'Asteroid'],
    expect: 'Mining Ops gets bld bonus, Robotic Workforce gets copy bonus, Asteroid standalone'
  },
  {
    name: 'Science Rush',
    cards: ['Research', 'Physics Complex', 'Mars University', 'Nuclear Power', 'Invention Contest'],
    expect: 'Science chain stacking, Physics+Nuclear energy, no Physics double-count'
  },
  {
    name: 'Space Events + OptAero',
    cards: ['Optimal Aerobraking', 'Asteroid', 'Comet', 'Towing A Comet', 'Ice Asteroid', 'Media Group'],
    expect: 'OptAero gets rush bonus, each space event gets OptAero rebate + Media'
  },
  {
    name: 'Animal VP',
    cards: ['Birds', 'Large Convoy', 'Decomposers', 'Viral Enhancers', 'Ecological Zone'],
    expect: 'Large Convoy places animals, Decomposers gets bio tags, Viral feeds both'
  },
  {
    name: 'Venus Focus',
    cards: ['Spin-Inducing Asteroid', 'Giant Solar Shade', 'Dirigibles', 'Stratopolis', 'Venus Waystation'],
    expect: 'Venus stacking, floater engine, discount chain'
  },
  {
    name: 'City Mayor',
    cards: ['Open City', 'Capital', 'Immigrant City', 'Rover Construction', 'Pets'],
    expect: '3 cities → Mayor, Rover+cities, Pets+cities, ImmCity+cities'
  },
  {
    name: 'Heat Rush',
    cards: ['GHG Factories', 'Mohole Area', 'Soletta', 'Asteroid', 'Deimos Down'],
    expect: 'Heat stacking, temp stacking, TR rush'
  },
  {
    name: 'Action Overload',
    cards: ['Physics Complex', 'Electro Catapult', 'Birds', 'Predators', 'Fish', 'Tardigrades'],
    expect: 'Action card diminishing returns penalty'
  },
  {
    name: 'Balanced Mid',
    cards: ['Earth Office', 'Luna Governor', 'Mining Colony', 'Trees', 'Shuttles'],
    expect: 'Earth discount, some space synergy, diverse'
  }
];

var ctx = { gensLeft: 5 };

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          HAND SYNERGY TEST — scoreHandSynergy              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

for (var h = 0; h < testHands.length; h++) {
  var hand = testHands[h];
  console.log('━━━ ' + hand.name + ' ━━━');
  console.log('Cards: ' + hand.cards.join(', '));
  console.log('Expected: ' + hand.expect);
  console.log('');

  var results = [];
  for (var c = 0; c < hand.cards.length; c++) {
    var card = hand.cards[c];
    var result = scoreHandSynergy(card, hand.cards, ctx);
    results.push({ name: card, bonus: result.bonus, reasons: result.reasons });
  }

  // Sort by bonus descending
  results.sort(function(a, b) { return b.bonus - a.bonus; });

  for (var r = 0; r < results.length; r++) {
    var res = results[r];
    var bonusStr = (res.bonus >= 0 ? '+' : '') + res.bonus;
    var reasonStr = res.reasons.length > 0 ? res.reasons[0] : '(no synergy)';
    var tags = getCardTagsLocal(res.name).join(',');
    console.log('  ' + bonusStr.padStart(6) + '  ' + res.name + ' [' + tags + ']');
    console.log('         ' + reasonStr);
  }
  console.log('');
}
