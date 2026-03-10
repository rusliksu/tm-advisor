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
  },
  {
    name: 'MC Prod Banker',
    cards: ['Acquired Company', 'Luna Governor', 'Corporate Stronghold', 'Immigration Shuttles', 'Rover Construction'],
    expect: 'MC prod stacking → Banker, city chain, Rover+cities'
  },
  {
    name: 'Herbivore Plant Engine',
    cards: ['Herbivores', 'Farming', 'Trees', 'Kelp Farming', 'Bushes'],
    expect: 'Herbivores gets big bonus from plant prod, plant stacking'
  },
  {
    name: 'Insulation Heat Convert',
    cards: ['Insulation', 'GHG Factories', 'Mohole Area', 'Soletta', 'Nuclear Power'],
    expect: 'Insulation synergy with heat prod, heat stacking, energy chain'
  },
  {
    name: 'Double Tags Monster',
    cards: ['Research', 'Luna Governor', 'Venus Governor', 'Mining Guild', 'Olympus Conference'],
    expect: 'Research sci×2 + OC trigger, Luna earth×2, Venus venus×2, Mining building×2'
  },
  {
    name: 'Point Luna Earth Rush',
    cards: ['Luna Governor', 'Earth Office', 'Lunar Mining', 'Lunar Exports', 'Space Station'],
    expect: 'PtLuna earth compound draw, Earth Office discount stacking',
    corps: ['Point Luna']
  },
  {
    name: 'IC Event Burst',
    cards: ['Asteroid', 'Comet', 'Virus', 'Towing A Comet', 'Optimal Aerobraking'],
    expect: 'IC +2 MC per event compound, OptAero rebate',
    corps: ['Interplanetary Cinematics']
  },
  {
    name: 'Saturn Jovian Stack',
    cards: ['Io Mining Station', 'Ganymede Colony', 'Colonizer Training Camp', 'Titan Floating Launch-pad', 'Water Import From Europa'],
    expect: 'Saturn +1 MC prod per jovian compound',
    corps: ['Saturn Systems']
  },
  {
    name: 'CrediCor Big Spender',
    cards: ['Deimos Down', 'Giant Ice Asteroid', 'Giant Solar Shade', 'Terraforming Ganymede', 'Magnetic Field Generators'],
    expect: 'CrediCor -4 MC refund per 20+ card compound',
    corps: ['CrediCor']
  },
  {
    name: 'Helion Heat Engine',
    cards: ['GHG Factories', 'Mohole Area', 'Soletta', 'Nuclear Power', 'Asteroid'],
    expect: 'Helion heat=MC compound, heat prod stacking',
    corps: ['Helion']
  },
  {
    name: 'Milestone Builder Push',
    cards: ['Mining Operations', 'Underground City', 'Robotic Workforce', 'Open City', 'Steelworks'],
    expect: 'Builder milestone -2 building, compound milestone delta',
    milestoneNeeds: { building: 2 }
  },
  {
    name: 'Milestone Scientist Push',
    cards: ['Research', 'Physics Complex', 'Mars University', 'Invention Contest', 'Olympus Conference'],
    expect: 'Scientist milestone -1, science compound milestone close',
    milestoneNeeds: { science: 1 }
  },
  {
    name: 'VP Burst Endgame',
    cards: ['Terraforming Ganymede', 'Giant Ice Asteroid', 'Deimos Down', 'Comet', 'Imported Hydrogen'],
    expect: 'VP burst at gensLeft=1, massive TR/VP dump',
    gensLeft: 1
  },
  {
    name: 'Colony Engine',
    cards: ['Mining Colony', 'Trade Envoys', 'Rim Freighters', 'Productive Outpost', 'Research Colony'],
    expect: 'Colony builders + fleet compound, colony density stacking'
  },
  {
    name: 'Scientists Rule - Science Rush',
    cards: ['Research', 'Physics Complex', 'Mars University', 'Olympus Conference', 'Invention Contest'],
    expect: 'Scientists ruling + science chain = double compound',
    rulingParty: 'Scientists'
  },
  {
    name: 'Reds Tax - TR Rush',
    cards: ['Terraforming Ganymede', 'Giant Ice Asteroid', 'Deimos Down', 'Comet', 'Giant Solar Shade'],
    expect: 'Reds ruling penalty on TR stacking',
    rulingParty: 'Reds'
  },
  {
    name: 'Plant Prod + Birds Conflict',
    cards: ['Farming', 'Trees', 'Kelp Farming', 'Birds', 'Bushes'],
    expect: 'Birds eats pp anti-synergy, plant stacking reduced'
  },
  {
    name: 'Production Diversity Rush',
    cards: ['Mining Operations', 'Nuclear Power', 'Farming', 'GHG Factories', 'Acquired Company'],
    expect: 'Steel+energy+plant+heat+MC → 5 prod types Generalist'
  },
  {
    name: 'Opp Polaris Ocean Stack',
    cards: ['Ice Asteroid', 'Towing A Comet', 'Imported Hydrogen', 'Convoy From Europa', 'Comet'],
    expect: 'Ocean stacking penalized by opp Polaris',
    oppCorps: ['Polaris']
  },
  {
    name: 'Early Prod Cohesion',
    cards: ['Mining Operations', 'Farming', 'GHG Factories', 'Nuclear Power', 'Acquired Company'],
    expect: 'All production cards at gen2 = prod cohesion bonus',
    gensLeft: 7
  },
  {
    name: 'Late VP Cohesion',
    cards: ['Terraforming Ganymede', 'Giant Solar Shade', 'Immigration Shuttles', 'Birds', 'Noctis Farming'],
    expect: 'VP cards at gensLeft=2 = VP cohesion bonus',
    gensLeft: 2
  },
  {
    name: 'Wild Tag + Triggers',
    cards: ['Research Coordination', 'Mars University', 'Olympus Conference', 'Earth Office', 'Point Luna'],
    expect: 'Wild tag amplifies all triggers/discounts in hand'
  },
  {
    name: 'Draw Engine',
    cards: ['Research', 'Mars University', 'Invention Contest', 'Olympus Conference', 'Business Network'],
    expect: 'Multiple draw sources compound into card advantage engine'
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

  var handCtx = { gensLeft: hand.gensLeft || ctx.gensLeft };
  if (hand.corps) handCtx._myCorps = hand.corps;
  if (hand.milestoneNeeds) handCtx.milestoneNeeds = hand.milestoneNeeds;
  if (hand.awardRacing) handCtx.awardRacing = hand.awardRacing;
  if (hand.awardTags) handCtx.awardTags = hand.awardTags;
  if (hand.rulingParty) handCtx.rulingParty = hand.rulingParty;
  if (hand.dominantParty) handCtx.dominantParty = hand.dominantParty;
  if (hand.oppCorps) handCtx.oppCorps = hand.oppCorps;
  if (hand.oppHasAnimalAttack) handCtx.oppHasAnimalAttack = true;
  if (hand.oppHasPlantAttack) handCtx.oppHasPlantAttack = true;

  var results = [];
  for (var c = 0; c < hand.cards.length; c++) {
    var card = hand.cards[c];
    var result = scoreHandSynergy(card, hand.cards, handCtx);
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
