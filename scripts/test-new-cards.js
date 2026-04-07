const TM_BRAIN = require('../extension/tm-brain');
const {resolveGeneratedExtensionPath, readGeneratedExtensionFile} = require('./lib/generated-extension-data');
const CARD_TAGS = require(resolveGeneratedExtensionPath('card_tags.js'));
const CARD_VP = require(resolveGeneratedExtensionPath('card_vp.js'));
const CARD_DATA = require(resolveGeneratedExtensionPath('card_data.js'));
const fs = require('fs');

let TM_RATINGS = {};
try {
  const r = readGeneratedExtensionFile('ratings.json.js', 'utf8').replace(/\bconst\b/g, 'var');
  TM_RATINGS = (new Function(r + '\nreturn TM_RATINGS;'))();
} catch(e) {}

let TM_CARD_DISCOUNTS = {}, TM_CARD_TAG_REQS = {}, TM_CARD_GLOBAL_REQS = {};
let TM_CARD_EFFECTS = {};
try {
  const effects = readGeneratedExtensionFile('card_effects.json.js', 'utf8').replace(/\bconst\b/g, 'var');
  TM_CARD_EFFECTS = (new Function(effects + '\nreturn TM_CARD_EFFECTS;'))();
} catch(e) {}
try {
  const s = readGeneratedExtensionFile('synergy_tables.json.js', 'utf8').replace(/\bconst\b/g, 'var');
  TM_CARD_DISCOUNTS = (new Function(s + '\nreturn typeof TM_CARD_DISCOUNTS!=="undefined"?TM_CARD_DISCOUNTS:{};'))();
} catch(e) {}
try {
  const r2 = readGeneratedExtensionFile('card_tag_reqs.js', 'utf8').replace(/\bconst\b/g, 'var');
  const res = (new Function(r2 + '\nreturn {t:TM_CARD_TAG_REQS, g:TM_CARD_GLOBAL_REQS};'))();
  TM_CARD_TAG_REQS = res.t; TM_CARD_GLOBAL_REQS = res.g;
} catch(e) {}

TM_BRAIN.setCardData(
  CARD_TAGS,
  CARD_VP,
  CARD_DATA,
  TM_CARD_GLOBAL_REQS,
  TM_CARD_TAG_REQS,
  TM_CARD_EFFECTS
);

const gen4 = {
  game: { generation: 4, temperature: -18, oxygenLevel: 4, oceans: 3, venusScaleLevel: 10 },
  thisPlayer: { tags: { building: 3, earth: 2, science: 1, space: 2 }, megaCredits: 30, plantProduction: 2, megaCreditProduction: 12 },
  players: [{}, {}, {}]
};

const newCards = [
  { name: 'Ocean City', cost: 18 },
  { name: 'Ocean Farm', cost: 15 },
  { name: 'Ocean Sanctuary', cost: 9 },
  { name: 'Whales', cost: 10 },
  { name: 'Thiolava Vents', cost: 13 },
  { name: 'Iron Extraction Center', cost: 10 },
  { name: 'Titanium Extraction Center', cost: 14 },
  { name: 'Metallic Asteroid', cost: 26 },
  { name: 'Ganymede Trading Company', cost: 20 },
  { name: 'Keplertec', cost: 17 },
  { name: 'Public Spaceline', cost: 18 },
  { name: 'Rust Eating Bacteria', cost: 7 },
  { name: 'Gaia City', cost: 28 },
  { name: 'Cave City', cost: 16 },
  { name: 'Kingdom of Tauraro', cost: 36 },
  { name: 'Algae Bioreactors', cost: 5 },
  { name: 'Agricola Inc', cost: 6 },
  { name: 'Heliostat Mirror Array', cost: 12 },
  { name: 'Man-made Volcano', cost: 13 },
  { name: 'Voltagon', cost: 10 },
  { name: 'Bioengineering Enclosure', cost: 7 },
  { name: 'Aeron Genomics', cost: 14 },
  { name: 'Arborist Collective', cost: 12 },
  { name: 'Bio-Fertilizer Facility', cost: 12 },
  { name: 'Deepwater Dome', cost: 15 },
  // Some reference cards that already had data
  { name: 'Farming', cost: 16 },
  { name: 'Birds', cost: 10 },
  { name: 'Earth Office', cost: 1 },
];

console.log('Card'.padEnd(35) + 'Cost'.padStart(5) + 'EV@Gen4'.padStart(10) + '  Tags');
console.log('-'.repeat(80));

const results = newCards.map(card => {
  const ev = TM_BRAIN.scoreCard(card, gen4);
  const cd = CARD_DATA[card.name] || {};
  const tags = (cd.tags || []).join(',');
  return { name: card.name, cost: card.cost, ev: Math.round(ev * 10) / 10, tags };
}).sort((a, b) => b.ev - a.ev);

for (const r of results) {
  let flag = '';
  if (r.ev > 15) flag = ' ★';
  else if (r.ev > 8) flag = ' ✓';
  else if (r.ev > 0) flag = '';
  else flag = ' ✗';
  console.log(r.name.padEnd(35) + String(r.cost).padStart(5) + String(r.ev).padStart(10) + '  [' + r.tags + ']' + flag);
}
