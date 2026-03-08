/**
 * analyze-scoring.js — Detailed scoreCard analysis
 * Shows what each card scores at different game stages and WHY
 */
const TM_BRAIN = require('../extension/tm-brain');
const CARD_TAGS = require('../extension/data/card_tags');
const CARD_VP = require('../extension/data/card_vp');

const CARD_DATA = require('../extension/data/card_data');
const fs = require('fs');

// Load ratings via eval (browser format)
let TM_RATINGS = {};
try {
  const r = fs.readFileSync(__dirname + '/../extension/ratings.json.js', 'utf8').replace(/\bconst\b/g, 'var');
  TM_RATINGS = (new Function(r + '\nreturn TM_RATINGS;'))();
} catch(e) {}

// Load discounts + tag reqs from synergy_tables and card_tag_reqs
let TM_CARD_DISCOUNTS = {}, TM_CARD_TAG_REQS = {}, TM_CARD_GLOBAL_REQS = {};
try {
  const s = fs.readFileSync(__dirname + '/../extension/data/synergy_tables.json.js', 'utf8').replace(/\bconst\b/g, 'var');
  TM_CARD_DISCOUNTS = (new Function(s + '\nreturn typeof TM_CARD_DISCOUNTS!=="undefined"?TM_CARD_DISCOUNTS:{};'))();
} catch(e) {}
try {
  const r2 = fs.readFileSync(__dirname + '/../extension/data/card_tag_reqs.js', 'utf8').replace(/\bconst\b/g, 'var');
  const res = (new Function(r2 + '\nreturn {t:TM_CARD_TAG_REQS, g:TM_CARD_GLOBAL_REQS};'))();
  TM_CARD_TAG_REQS = res.t; TM_CARD_GLOBAL_REQS = res.g;
} catch(e) {}

TM_BRAIN.setCardData(CARD_TAGS, CARD_VP, CARD_DATA, TM_CARD_DISCOUNTS, TM_CARD_TAG_REQS, TM_CARD_GLOBAL_REQS, TM_RATINGS);

console.log('Data loaded: cards=' + Object.keys(CARD_DATA).length +
  ', tags=' + Object.keys(CARD_TAGS).length +
  ', ratings=' + Object.keys(TM_RATINGS).length +
  ', discounts=' + Object.keys(TM_CARD_DISCOUNTS).length);

// Game states at different points
const states = {
  'GEN 1 (early)': {
    game: { generation: 1, temperature: -30, oxygenLevel: 0, oceans: 0, venusScaleLevel: 0 },
    thisPlayer: { tags: { building: 1, earth: 1 }, megaCredits: 40, plantProduction: 0, megaCreditProduction: 5 },
    players: [{}, {}, {}]
  },
  'GEN 4 (mid-early)': {
    game: { generation: 4, temperature: -18, oxygenLevel: 4, oceans: 3, venusScaleLevel: 10 },
    thisPlayer: { tags: { building: 3, earth: 2, science: 1, space: 2 }, megaCredits: 30, plantProduction: 2, megaCreditProduction: 12 },
    players: [{}, {}, {}]
  },
  'GEN 7 (mid-late)': {
    game: { generation: 7, temperature: -4, oxygenLevel: 9, oceans: 6, venusScaleLevel: 20 },
    thisPlayer: { tags: { building: 5, earth: 3, science: 2, space: 3, plant: 2 }, megaCredits: 45, plantProduction: 4, megaCreditProduction: 20 },
    players: [{}, {}, {}]
  },
  'GEN 10 (late)': {
    game: { generation: 10, temperature: 4, oxygenLevel: 12, oceans: 8, venusScaleLevel: 26 },
    thisPlayer: { tags: { building: 6, earth: 3, science: 3, space: 4, plant: 3, jovian: 1 }, megaCredits: 50, plantProduction: 6, megaCreditProduction: 25 },
    players: [{}, {}, {}]
  }
};

// Test cards — known strong/weak ones for calibration
const testCards = [
  // Production cards
  { name: 'Strip Mine', cost: 25 },        // -2 energy, +2 steel, +1 ti prod. Building tag
  { name: 'Farming', cost: 16 },           // +2 MC prod, +2 plant prod, +2 VP. Plant tag
  { name: 'Kelp Farming', cost: 17 },      // +3 plant prod, +2 MC prod, 1VP
  { name: 'Bushes', cost: 10 },            // +2 plant prod, +2 plants
  { name: 'Insects', cost: 9 },            // +1 plant prod per plant tag
  { name: 'Food Factory', cost: 12 },      // -1 plant prod, +4 MC prod
  { name: 'Steelworks', cost: 15 },        // action: spend 4 energy → +2 steel, +TR

  // TR/Global cards
  { name: 'Comet', cost: 21 },             // +1 temp, +1 ocean, -3 plants opponent
  { name: 'Big Asteroid', cost: 27 },      // +2 temp, -4 plants, +4 ti
  { name: 'Imported Hydrogen', cost: 16 }, // +1 ocean + 3 plants or microbes/animals

  // VP cards
  { name: 'Birds', cost: 10 },             // action: +1 animal, -2 plant prod, 1VP/animal
  { name: 'Fish', cost: 9 },               // action: +1 animal, -1 plant prod, 1VP/animal
  { name: 'Herbivores', cost: 12 },        // action: +1 animal, +1 animal/greenery, 1VP/2 animals
  { name: 'Pets', cost: 10 },              // +1 animal per city, 1VP/2 animals

  // City cards
  { name: 'Open City', cost: 23 },         // city + 4 plants, +1 VP
  { name: 'Corporate Stronghold', cost: 11 }, // city + 3 MC prod - 1 energy, -2 VP

  // Expensive production
  { name: 'Immigration Shuttles', cost: 31 }, // +5 MC prod, 1VP/3 cities
  { name: 'Soletta', cost: 35 },           // +7 heat prod

  // Engine cards
  { name: 'Earth Office', cost: 1 },       // -3 earth tag cost
  { name: 'Earth Catapult', cost: 23 },    // -2 all cards
  { name: 'Cutting Edge Technology', cost: 11 }, // -2 req cards, +1VP

  // Standard Projects comparison (manual EV)
  { name: 'SP_Asteroid', cost: 14 },       // +1 temp (1 TR)
  { name: 'SP_Aquifer', cost: 18 },        // +1 ocean (1 TR + placement bonus)
  { name: 'SP_Greenery', cost: 23 },       // +1 greenery (1 TR + 1 VP)
];

console.log('='.repeat(100));
console.log('SCORECARD ANALYSIS — comparing cards across game stages');
console.log('='.repeat(100));

// For each state, show all card scores
for (const [label, state] of Object.entries(states)) {
  console.log('\n' + '━'.repeat(80));
  console.log(`  ${label}`);
  console.log('━'.repeat(80));

  const results = testCards.map(card => {
    const ev = TM_BRAIN.scoreCard(card, state);
    return { name: card.name, cost: card.cost, ev: Math.round(ev * 10) / 10 };
  }).sort((a, b) => b.ev - a.ev);

  // Print as table
  console.log(
    'Card'.padEnd(30) + 'Cost'.padStart(5) + 'EV'.padStart(8) + '  Notes'
  );
  console.log('-'.repeat(80));

  for (const r of results) {
    let note = '';
    if (r.ev > 15) note = '★ STRONG';
    else if (r.ev > 8) note = '✓ good';
    else if (r.ev > 0) note = '~ ok';
    else if (r.ev > -5) note = '↓ weak';
    else note = '✗ BAD';

    const rating = TM_RATINGS[r.name];
    const tier = rating ? ` [${rating.t}:${rating.s}]` : '';

    console.log(
      r.name.padEnd(30) + String(r.cost).padStart(5) + String(r.ev).padStart(8) + '  ' + note + tier
    );
  }
}

// Specific deep-dive: Farming card at gen 4
console.log('\n\n' + '='.repeat(80));
console.log('DEEP DIVE: Plant production cards at GEN 4');
console.log('='.repeat(80));

const gen4 = states['GEN 4 (mid-early)'];
const plantCards = [
  { name: 'Farming', cost: 16 },
  { name: 'Kelp Farming', cost: 17 },
  { name: 'Bushes', cost: 10 },
  { name: 'Insects', cost: 9 },
  { name: 'Tundra Farming', cost: 16 },
  { name: 'Snow Algae', cost: 12 },
  { name: 'Adapted Lichen', cost: 9 },
  { name: 'Food Factory', cost: 12 },
];

for (const card of plantCards) {
  const ev = TM_BRAIN.scoreCard(card, gen4);
  console.log(`\n${card.name} (cost ${card.cost}): EV = ${Math.round(ev * 10) / 10}`);

  // Compare with a simple manual calculation
  const cd = CARD_DATA[card.name] || {};
  const beh = cd.behavior || {};
  const prod = beh.production || {};
  if (Object.keys(prod).length > 0) {
    console.log(`  Parsed production: ${JSON.stringify(prod)}`);
  }
}

// SP comparison
console.log('\n\n' + '='.repeat(80));
console.log('SP vs CARD threshold — when should bot prefer SP?');
console.log('='.repeat(80));

for (const [label, state] of Object.entries(states)) {
  const gen = state.game.generation;
  const steps = 19 - Math.floor((state.game.temperature + 30) / 2)
    + (14 - state.game.oxygenLevel)
    + (9 - state.game.oceans)
    + Math.ceil((30 - (state.game.venusScaleLevel || 0)) / 2);
  const ratePerGen = 6;
  const gensLeft = Math.max(1, Math.ceil(steps / ratePerGen));

  // SP EV
  const redsTax = 0;
  const vpMC = gensLeft >= 6 ? 3 : gensLeft >= 3 ? 5 : 7;
  const trMC = gensLeft + vpMC - redsTax;
  const tempo = gensLeft >= 5 ? 8 : (gensLeft >= 3 ? 6 : 4);

  const asteroidEV = trMC + tempo - 14;
  const aquiferEV = trMC + tempo + 2 - 18;
  const greeneryEV = trMC + tempo + vpMC - 23;

  console.log(`\n${label} (steps=${steps}, gensLeft=${gensLeft}):`);
  console.log(`  Asteroid SP: EV = ${asteroidEV} (TR=${trMC} tempo=${tempo} cost=14)`);
  console.log(`  Aquifer SP:  EV = ${aquiferEV} (TR=${trMC} tempo=${tempo} bonus=2 cost=18)`);
  console.log(`  Greenery SP: EV = ${greeneryEV} (TR=${trMC} tempo=${tempo} VP=${vpMC} cost=23)`);
  console.log(`  → Cards below EV ${Math.max(asteroidEV, aquiferEV)} are worse than SP`);
}
