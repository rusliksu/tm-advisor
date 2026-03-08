/**
 * merge-extracted-to-effects.js
 * Reads extracted card behaviors from TM source and converts them
 * to card_effects.json.js format, then merges with existing effects.
 * After this, run gen_browser_data.js to regenerate card_data.js.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const extracted = require(path.join(ROOT, 'data', 'all-card-behaviors.json'));
const TAGS = require(path.join(ROOT, 'extension', 'data', 'card_tags'));
const DATA = require(path.join(ROOT, 'extension', 'data', 'card_data'));

// Load existing card_effects
const effectsPath = path.join(ROOT, 'extension', 'data', 'card_effects.json.js');
const effectsSrc = fs.readFileSync(effectsPath, 'utf8');
const effectsMatch = effectsSrc.match(/const TM_CARD_EFFECTS\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
if (!effectsMatch) throw new Error('Cannot parse TM_CARD_EFFECTS');
const effects = eval('(' + effectsMatch[1] + ')');

console.log('Existing effects:', Object.keys(effects).length);

// Reverse maps for conversion
const PROD_MAP = { megacredits: 'mp', steel: 'sp', titanium: 'tp', plants: 'pp', energy: 'ep', heat: 'hp' };
const STOCK_MAP = { megacredits: 'mc', steel: 'st', titanium: 'ti', plants: 'pl', energy: 'en', heat: 'he' };
const GLOBAL_MAP = { temperature: 'tmp', oxygen: 'o2', venus: 'vn' };

// Find missing cards
const inData = new Set(Object.keys(DATA));
const inEffects = new Set(Object.keys(effects));
const inTags = new Set(Object.keys(TAGS));

let added = 0;

for (const name of Object.keys(extracted)) {
  // Skip if already in effects
  if (inEffects.has(name)) continue;
  // Only process cards that are in card_tags (i.e., part of the game)
  if (!inTags.has(name)) continue;

  const card = extracted[name];
  const beh = card.behavior || {};
  const act = card.action || {};
  const entry = {};

  // Production
  if (beh.production) {
    for (const [key, val] of Object.entries(beh.production)) {
      const short = PROD_MAP[key];
      if (short) entry[short] = val;
    }
  }

  // Stock (immediate resources)
  if (beh.stock) {
    for (const [key, val] of Object.entries(beh.stock)) {
      const short = STOCK_MAP[key];
      if (short) entry[short] = val;
    }
  }

  // Global params
  if (beh.global) {
    for (const [key, val] of Object.entries(beh.global)) {
      const short = GLOBAL_MAP[key];
      if (short) entry[short] = val;
    }
  }

  // TR
  if (beh.tr) entry.tr = beh.tr;

  // Oceans
  if (beh.ocean) entry.oc = beh.ocean;

  // Greenery
  if (beh.greenery) entry.grn = beh.greenery;

  // City
  if (beh.city) entry.city = beh.city;

  // Draw cards
  if (beh.drawCard) entry.cd = beh.drawCard;

  // Colony/trade fleet
  if (beh.tradeFleet) entry.tradeFleet = beh.tradeFleet;

  // Decrease production
  if (beh.decreaseAnyProduction) entry.pOpp = beh.decreaseAnyProduction;

  // Remove plants
  if (beh.removeAnyPlants) entry.rmPl = beh.removeAnyPlants;

  // Action: draw cards
  if (act.drawCard) entry.actCD = act.drawCard;

  // Action: TR
  if (act.tr) entry.actTR = act.tr;

  // Action: stock (MC)
  if (act.stock && act.stock.megacredits) entry.actMC = act.stock.megacredits;

  // Action: add resources (for VP accumulators)
  if (act.addResources || beh.addResources) entry.res = card.resourceType || 'resource';

  // VP
  if (card.vp) entry.vp = card.vp;
  if (card.vpPerResource) entry.vpAcc = card.vpPerResource; // divisor for VP per resource
  if (card.vpPerTag) entry.vpTag = card.vpPerTag;

  // Card discount
  if (card.cardDiscount) entry.disc = card.cardDiscount;

  // Action: global
  if (act.global) {
    for (const [key, val] of Object.entries(act.global)) {
      const short = GLOBAL_MAP[key];
      if (short) entry['act' + short.charAt(0).toUpperCase() + short.slice(1)] = val;
    }
  }

  // Action: production
  if (act.production) {
    for (const [key, val] of Object.entries(act.production)) {
      const short = PROD_MAP[key];
      if (short) entry['act_' + short] = val;
    }
  }

  // Only add if we have something
  if (Object.keys(entry).length > 0) {
    effects[name] = entry;
    added++;
    console.log('  + ' + name + ': ' + JSON.stringify(entry));
  }
}

console.log('\nAdded:', added, 'new effects');
console.log('Total effects:', Object.keys(effects).length);

// Write back
const output = 'const TM_CARD_EFFECTS = ' + JSON.stringify(effects, null, 1) + ';\n';
fs.writeFileSync(effectsPath, output, 'utf8');
console.log('Written to', effectsPath);
