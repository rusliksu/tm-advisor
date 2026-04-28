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
let rawCards = [];
try {
  rawCards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tm-all-cards-raw.json'), 'utf8'));
} catch (e) {
  rawCards = [];
}
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
function normalizeResourceType(resourceType) {
  const text = String(resourceType || '').trim().toLowerCase();
  if (!text) return '';
  return text.replace(/[\s-]+/g, '_');
}
function floaterTargetTagFromRaw(card) {
  const tags = (card && card.tags || [])
    .map((tag) => String(tag || '').trim().toLowerCase())
    .filter((tag) => tag === 'venus' || tag === 'jovian');
  if (tags.length === 0) return null;
  return tags.length === 1 ? tags[0] : tags;
}
function resourceVPFromRaw(card) {
  if (!card || !card.victoryPoints || typeof card.victoryPoints !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(card.victoryPoints, 'resourcesHere')) return null;
  const metaVP = card.metadata && card.metadata.victoryPoints;
  if (metaVP && metaVP.targetOneOrMore) return null;

  let divisor = null;
  if (typeof card.victoryPoints.per === 'number') {
    divisor = card.victoryPoints.per;
  } else if (typeof card.victoryPoints.each === 'number') {
    if (card.victoryPoints.each <= 0) return null;
    divisor = 1 / card.victoryPoints.each;
  } else if (metaVP && typeof metaVP.points === 'number' && typeof metaVP.target === 'number') {
    if (metaVP.points <= 0 || metaVP.target <= 0) return null;
    divisor = metaVP.target / metaVP.points;
  } else {
    divisor = 1;
  }
  const res = normalizeResourceType(card.resourceType || (metaVP && metaVP.item && metaVP.item.resource));
  if (!res || !Number.isFinite(divisor) || divisor <= 0) return null;
  return {res, divisor};
}
function rawRenderText(card) {
  if (!card) return '';
  const chunks = [];
  if (card.description) chunks.push(String(card.description));
  if (card.metadata && card.metadata.renderData) chunks.push(JSON.stringify(card.metadata.renderData));
  return chunks.join(' ').toLowerCase();
}
function isTriggerOnlyResourceVP(card) {
  if (!card || card.hasAction) return false;
  const text = rawRenderText(card);
  return text.includes('effect:') && !text.includes('action:');
}
const STALE_EFFECT_KEYS = {
  // These cards use delayed/action resource conversion, not immediate global/TR effects.
  'Darkside Observatory': ['tr', 'actCD'],
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
  'Space Relay': ['actCD'],
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
  // Dynamic VP: 3 VP only if a science resource was actually found. Do not
  // expose this as printed/static VP in scoring data.
  'Search For Life': ['vp'],
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
  // Automated card: production box symbols were misread as a cash action.
  'Archimedes Hydroponics Station': {remove: ['actMC']},
  // Action-only dynamic MC. The render icons include a cards symbol near the
  // help text, but the card does not draw on play.
  'Floyd Continuum': {remove: ['cd']},
  // Board-scaled action. Static actMC=4 is only an old estimate and is not
  // factual card text.
  'Red Ships': {remove: ['actMC']},
  // Corporation action reuses another already-used blue-card action; it is not
  // a fixed MC payout.
  'Viron': {remove: ['actMC']},
  // Cathedrals are special city markers, not fighter resources on this card.
  // Do not expose this as a generic VP/resource accumulator.
  'St. Joseph of Cupertino Mission': {remove: ['res', 'vpAcc', 'vpPer']},
  // Variable/conditional actions. Keep their factual actionChoices in
  // generated card_data, but do not expose a single recurring MC number.
  'Stefan': {remove: ['actMC']},
  // Discard cards from hand for MC. The action does not draw cards, and a
  // fractional actCD created fake recurring card-flow value.
  'Ceres Tech Market': {remove: ['actCD']},
  // Stateful floater action: standalone it averages about 0.5 card/action via
  // add-floater -> spend-floater, while external floater support can raise the
  // ceiling. Keep actCD as score-only EV, and let generated actionChoices hold
  // the factual branches.
  'Red Spot Observatory': {set: {actCD: 0.5, res: 'floater', tg: 'jovian'}},
  'Luna Trade Station': {remove: ['actMC']},
  'HE3 Refinery': {remove: ['actMC']},
  'Steel Market Monopolists': {remove: ['actMC']},
  'Titanium Market Monopolists': {remove: ['actMC']},
  'Martian Rails': {remove: ['actMC', 'actEN']},
  'Battery Factory': {remove: ['actMC', 'actEN']},
  'Personal Spacecruiser': {remove: ['actMC', 'actEN']},
  'Martian Express': {remove: ['actMC']},
  'Grey Market Exploitation': {remove: ['actMC']},
  'Think Tank': {remove: ['actMC', 'cd']},
  // Turmoil action: spend MC to place a delegate. Delegate placement is not a
  // cash loss action, so keep it as semantic actionChoices only.
  'Martian Media Center': {remove: ['actMC']},
  // Dynamic plant payout per Venus tag, plant tag, and owned colony. This does
  // not place a greenery, and stale grn/cost data inflated advisor value.
  'Soil Studies': {remove: ['grn'], set: {c: 13}},
  // Paid ocean action. The stale actOc=0.7 shortcut made the action look like
  // a free recurring ocean in generated card_data and blue-action advice.
  'Water Import From Europa': {set: {actMC: -12, actOc: 1}},
  // Adds 2 floaters to a Jovian card. It was previously parsed as 4 plants,
  // which inflated raw value and plant-engine hooks while hiding the target check.
  'Nitrogen from Titan': {remove: ['pl'], set: {places: 'floater', placesTag: 'jovian', placesN: 2}},
  // Conditional event: pay 4 plants, 3 microbes, or 2 animals to gain 20 MC
  // and corruption. Do not expose the 20 MC as unconditional stock.
  'Export Convoy': {remove: ['mc']},
  // OR action: spend 1 titanium to add 2 floaters here, or spend 2 floaters
  // here to raise Venus. The static branch should preserve the titanium cost.
  'Jet Stream Microscrappers': {remove: ['actTR'], set: {actTI: -1}},
  // OR action: spend 1 titanium to add 1 syndicate fleet here, or spend a
  // fleet here to steal MC. Static branch keeps the resource-add cost.
  'The Darkside of The Moon Syndicate': {set: {actTI: -1}},
  // Starts with asteroid resources, not titanium stock. Titanium is one paid
  // action branch after removing an asteroid here.
  'Asteroid Rights': {remove: ['ti']},
  // Not a floater accumulator. The action spends a floater from any card to
  // add a Venusian habitat here; generated floater res/tg caused false
  // floater-target synergies.
  'Floater-Urbanism': {remove: ['tg'], set: {res: 'venusian_habitat', vpAcc: 1}},
  // Corporation first action is draw 3 keep 2, and it stores science resources
  // worth 1 VP per 2 resources. Extracted render data missed both facts and
  // exposed the VP divisor as 1/resource.
  'Nanotech Industries': {set: {cd: 2, res: 'science', vpAcc: 1, vpPer: 2}},
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

for (const card of rawCards) {
  const rawVP = resourceVPFromRaw(card);
  if (!rawVP) continue;
  if (!inCatalog.has(card.name) && !effects[card.name]) continue;

  const entry = Object.assign({}, effects[card.name] || {});
  const before = JSON.stringify(entry);
  delete entry.vp;
  entry.res = rawVP.res;
  if (rawVP.divisor < 1) {
    entry.vpAcc = rawVP.divisor;
    delete entry.vpPer;
  } else {
    entry.vpAcc = 1;
    if (rawVP.divisor !== 1) entry.vpPer = rawVP.divisor;
    else delete entry.vpPer;
  }
  if (isTriggerOnlyResourceVP(card)) entry.triggerOnlyVpAcc = true;
  else delete entry.triggerOnlyVpAcc;

  const after = JSON.stringify(entry);
  if (after === before) continue;
  effects[card.name] = entry;
  if (!inEffects.has(card.name)) {
    added++;
    console.log('  + ' + card.name + ': ' + after);
  } else {
    updated++;
    console.log('  ~ ' + card.name + ': ' + after);
  }
}

for (const card of rawCards) {
  const entry = effects[card.name];
  if (!entry || entry.res !== 'floater') continue;
  const targetTag = floaterTargetTagFromRaw(card);
  if (!targetTag || entry.tg) continue;

  const before = JSON.stringify(entry);
  entry.tg = targetTag;
  const after = JSON.stringify(entry);
  if (after === before) continue;
  effects[card.name] = entry;
  if (!inEffects.has(card.name)) {
    added++;
    console.log('  + ' + card.name + ': ' + after);
  } else {
    updated++;
    console.log('  ~ ' + card.name + ': ' + after);
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
