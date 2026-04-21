/**
 * merge-extracted-to-effects.js
 * Reads extracted card behaviors from TM source and converts them
 * to card_effects.json.js format, then merges with existing effects.
 * After this, run gen_browser_data.js to regenerate card_data.js.
 */

const fs = require('fs');
const path = require('path');
const {
  resolveGeneratedExtensionPath,
  writeGeneratedExtensionFile,
} = require('./lib/generated-extension-data');

const ROOT = path.resolve(__dirname, '..');
const extracted = require(path.join(ROOT, 'data', 'all-card-behaviors.json'));
const allCards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'all_cards.json'), 'utf8'));
// Load existing card_effects
const effectsPath = resolveGeneratedExtensionPath('card_effects.json.js');
const effectsSrc = fs.readFileSync(effectsPath, 'utf8');
const effectsMatch = effectsSrc.match(/const TM_CARD_EFFECTS\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
if (!effectsMatch) throw new Error('Cannot parse TM_CARD_EFFECTS');
const effects = eval('(' + effectsMatch[1] + ')');

console.log('Existing effects:', Object.keys(effects).length);

// Reverse maps for conversion
const PROD_MAP = { megacredits: 'mp', steel: 'sp', titanium: 'tp', plants: 'pp', energy: 'ep', heat: 'hp' };
const STOCK_MAP = { megacredits: 'mc', steel: 'st', titanium: 'ti', plants: 'pl', energy: 'en', heat: 'he' };
const GLOBAL_MAP = { temperature: 'tmp', oxygen: 'o2', venus: 'vn' };
const STALE_EFFECT_KEYS = {
  // These cards use delayed/action resource conversion, not immediate global/TR effects.
  'Darkside Observatory': ['tr'],
  // Stateful OR-actions: add a resource now, or spend stored resources for a
  // payoff. Do not expose both branches as one recurring static action.
  'Aerial Mappers': ['actCD'],
  'Asteroid Deflection System': ['actTR'],
  'Atmo Collectors': ['actMC'],
  'Caretaker Contract': ['actMC'],
  'Communication Center': ['actCD'],
  'Comet Aiming': ['actTR', 'res'],
  'Copernicus Tower': ['actTR'],
  'Deuterium Export': ['actTR', 'act_ep'],
  'Directed Impactors': ['actTR', 'res'],
  'Dirigibles': ['actMC'],
  'Economic Espionage': ['actMC'],
  'Equatorial Magnetizer': ['tr', 'ep'],
  'Extractor Balloons': ['vn', 'actTR', 'actVn'],
  'Floating Refinery': ['actMC'],
  'Forced Precipitation': ['actMC'],
  'GHG Producing Bacteria': ['actTR', 'actTmp'],
  'Icy Impactors': ['actTR', 'res'],
  'Ironworks': ['actMC'],
  'Jet Stream Microscrappers': ['actTR'],
  'Jupiter Floating Station': ['actMC'],
  'Local Shading': ['actTR', 'act_mp'],
  'Martian Repository': ['actCD'],
  'Mars University': ['actCD'],
  'Meltworks': ['actMC'],
  'Neptunian Power Consultants': ['actMC'],
  'Nitrite Reducing Bacteria': ['tr', 'actTR'],
  'Olympus Conference': ['actCD'],
  'Ore Processor': ['tp'],
  'Physics Complex': ['actTR'],
  'Psychrophiles': ['actMC'],
  'Regolith Eaters': ['actTR', 'actO2'],
  'Refugee Camps': ['actMC'],
  'Rotator Impacts': ['actTR', 'res', 'tg'],
  'Steelworks': ['actMC'],
  'Stratopolis': ['actCD'],
  'Sulphur-Eating Bacteria': ['actMC'],
  'Thermophiles': ['actTR', 'actVn'],
  'Venus Magnetizer': ['ep', 'actMC'],
  'Water Splitting Plant': ['actTR'],
  // Either production OR ocean+stock; do not merge both branches into one value.
  'Asteroid Resources': ['st', 'ti', 'oc'],
  // Discount/enabler only: parser used render symbols as real MC production + city placement.
  'Prefabrication of Human Habitats': ['mp', 'city'],
};
const MANUAL_EFFECT_PATCHES = {
  // Paid draw actions should stay explicit. A net actMC shortcut makes these
  // look like recurring cash income and hides the real card draw/cost.
  'Restricted Area': {set: {actMC: -2, actCD: 1}},
  'Restricted Area:ares': {set: {actMC: -2, actCD: 1}},
  // OR action: spend 3 MC to draw a blue card, or flip a blue card for VP->TR.
  // Effects can only hold one scoreable static action; actionChoices in
  // generated card_data preserves the second branch for factual display.
  'Project Workshop': {remove: ['actTR'], set: {actMC: -3, actCD: 1}},
  // Complex OR action (MC -> energy, or energy-production -> MC). The old
  // actMC shortcut caused false cash-income value spikes.
  'Energy Market': {remove: ['actMC']},
  // Spend 7 MC to increase steel production; not immediate steel production
  // and not a positive cash action.
  'Industrial Center': {remove: ['sp'], set: {actMC: -7, act_sp: 1}},
  'Industrial Center:ares': {set: {actMC: -7, act_sp: 1}},
  // Unsupported board/excavation/resource-conversion actions should not be
  // exposed as fake recurring MC income.
  // The animal branch is conditional on an animal target and is represented in
  // generated card_data.actionChoices; keep the unconditional plant branch here.
  'Bio Printing Facility': {remove: ['actMC'], set: {actEN: -2, actPL: 2}},
  // Action-only dynamic MC. The render icons include a cards symbol near the
  // help text, but the card does not draw on play.
  'Floyd Continuum': {remove: ['cd']},
  // Corporation action text leaked into fake starting production.
  'Robinson Industries': {remove: ['mp']},
  'Stormcraft Incorporated': {remove: ['hp']},
  'Chemical Factory': {remove: ['actMC', 'actPL']},
  'Cryptocurrency': {remove: ['actMC']},
  'Economic Espionage': {remove: ['actMC']},
  'Mars Nomads': {remove: ['actMC']},
  'Saturn Surfing': {remove: ['actMC']},
};
const SKIP_ACTION_SPEND_MAP = new Set([
  // Their action payoff is unsupported by static card_data; do not create
  // cost-only placeholder actions.
  'Chemical Factory',
  'Economic Espionage',
]);

const inEffects = new Set(Object.keys(effects));
const inCatalog = new Set(allCards.map((card) => card.name).concat(Object.keys(effects)));

let added = 0;
let updated = 0;

for (const name of Object.keys(extracted)) {
  // Only process cards that exist in the canonical card catalog or current effects bundle.
  if (!inCatalog.has(name)) continue;

  const card = extracted[name];
  const beh = card.behavior || {};
  const act = card.action || {};
  const entry = Object.assign({}, effects[name] || {});
  for (const staleKey of STALE_EFFECT_KEYS[name] || []) {
    delete entry[staleKey];
  }
  const before = JSON.stringify(entry);

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

  // Turmoil
  if (beh.turmoil && typeof beh.turmoil.influenceBonus === 'number') {
    entry.infl = beh.turmoil.influenceBonus;
  }

  // Oceans
  if (beh.ocean) entry.oc = beh.ocean;

  // Greenery
  if (beh.greenery) entry.grn = beh.greenery;

  // City
  if (beh.city) entry.city = beh.city;

  // Draw cards
  if (beh.drawCard) entry.cd = beh.drawCard;

  // Colony/trade fleet
  if (beh.colony) entry.colony = beh.colony;
  if (beh.tradeFleet) entry.tradeFleet = beh.tradeFleet;
  if (typeof beh.tradeDiscount === 'number') entry.tradeDiscount = beh.tradeDiscount;
  if (typeof beh.tradeOffset === 'number') entry.tradeOffset = beh.tradeOffset;
  if (typeof beh.tradeMC === 'number') entry.tradeMC = beh.tradeMC;

  // Decrease production
  if (beh.decreaseAnyProduction) entry.pOpp = beh.decreaseAnyProduction;

  // Remove plants
  if (beh.removeAnyPlants) entry.rmPl = beh.removeAnyPlants;

  // Action: draw cards
  if (act.drawCard) entry.actCD = act.drawCard;

  // Action: TR
  if (act.tr) entry.actTR = act.tr;

  // Reset spend-derived action stock keys before recalculating them. The merge
  // reads the previous generated effects as input, so additive spend handling
  // must be idempotent across repeated runs.
  if (act.spend && !SKIP_ACTION_SPEND_MAP.has(name)) {
    for (const key of Object.keys(act.spend)) {
      const short = STOCK_MAP[key];
      if (short) delete entry['act' + short.toUpperCase()];
    }
  }

  // Action: stock resources.
  if (act.stock) {
    for (const [key, val] of Object.entries(act.stock)) {
      const short = STOCK_MAP[key];
      if (short && typeof val === 'number' && val !== 0) {
        entry['act' + short.toUpperCase()] = val;
      }
    }
  }

  // Action: spend standard resources. Keep costs explicit so recurring
  // actions are not valued as free income in generated card_data.
  if (act.spend && !SKIP_ACTION_SPEND_MAP.has(name)) {
    for (const [key, val] of Object.entries(act.spend)) {
      const short = STOCK_MAP[key];
      if (short && typeof val === 'number' && val !== 0) {
        const actionKey = 'act' + short.toUpperCase();
        entry[actionKey] = (entry[actionKey] || 0) - val;
      }
    }
  }

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
    const after = JSON.stringify(entry);
    if (!inEffects.has(name)) {
      added++;
      console.log('  + ' + name + ': ' + after);
    } else if (after !== before) {
      updated++;
      console.log('  ~ ' + name + ': ' + after);
    }
  }
}

for (const [name, patch] of Object.entries(MANUAL_EFFECT_PATCHES)) {
  const entry = Object.assign({}, effects[name] || {});
  const before = JSON.stringify(entry);
  for (const staleKey of patch.remove || []) {
    delete entry[staleKey];
  }
  for (const [key, val] of Object.entries(patch.set || {})) {
    if (val === undefined) delete entry[key];
    else entry[key] = val;
  }
  const after = JSON.stringify(entry);
  if (after === before) continue;
  if (Object.keys(entry).length > 0) effects[name] = entry;
  else delete effects[name];
  if (!inEffects.has(name)) {
    added++;
    console.log('  + ' + name + ': ' + after);
  } else {
    updated++;
    console.log('  ~ ' + name + ': ' + after);
  }
}

console.log('\nAdded:', added, 'new effects');
console.log('Updated:', updated, 'existing effects');
console.log('Total effects:', Object.keys(effects).length);

// Write back
const output = 'const TM_CARD_EFFECTS = ' + JSON.stringify(effects, null, 1) + ';\n';
const out = writeGeneratedExtensionFile('card_effects.json.js', output, 'utf8');
console.log('Canonical:', out.canonicalPath);
console.log('Legacy mirror:', out.legacyPath);
