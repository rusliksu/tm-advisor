#!/usr/bin/env node
// Генерирует card_data.js, card_tags.js, card_vp.js для browser-контекста расширения.
// Источники: all_cards.json, card_effects.json.js, vp_multipliers.json.js

const fs = require('fs');
const path = require('path');
const {
  readGeneratedExtensionFile,
  resolveGeneratedExtensionPath,
  writeGeneratedExtensionFile,
} = require('./lib/generated-extension-data');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const EXT_DATA = path.join(ROOT, 'extension', 'data');

// ── Load sources ──

const allCards = JSON.parse(fs.readFileSync(path.join(DATA, 'all_cards.json'), 'utf8'));
const allCardsByName = Object.fromEntries(allCards.map((card) => [card.name, card]));

// Load existing card_tags.js for tag fallback (has more cards than all_cards.json)
let existingCardTags = {};
try {
  existingCardTags = require(resolveGeneratedExtensionPath('card_tags.js'));
} catch(e) {}

// Parse TM_CARD_EFFECTS from .js file (strip const declaration, eval as expression)
const effectsSrc = readGeneratedExtensionFile('card_effects.json.js', 'utf8');
const effectsMatch = effectsSrc.match(/const TM_CARD_EFFECTS\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
if (!effectsMatch) throw new Error('Cannot parse TM_CARD_EFFECTS');
const effects = eval('(' + effectsMatch[1] + ')');

// Parse TM_VP_MULTIPLIERS
const vpSrc = fs.readFileSync(path.join(EXT_DATA, 'vp_multipliers.json.js'), 'utf8');
const vpMatch = vpSrc.match(/const TM_VP_MULTIPLIERS\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
if (!vpMatch) throw new Error('Cannot parse TM_VP_MULTIPLIERS');
const vpMult = eval('(' + vpMatch[1] + ')');

// ══════════════════════════════════════════════════════════════
// 1. CARD TAGS — { "Birds": ["animal"], ... }
// ══════════════════════════════════════════════════════════════

const cardTags = {};
for (const card of allCards) {
  if (card.tags && card.tags.length > 0) {
    cardTags[card.name] = card.tags.map(t => t.toLowerCase());
  }
}

// ══════════════════════════════════════════════════════════════
// 2. CARD VP — { "Birds": { type: "per_resource", per: 1 }, ... }
// ══════════════════════════════════════════════════════════════

const cardVP = {};

// From vp_multipliers
for (const [name, info] of Object.entries(vpMult)) {
  if (info.vpPer === 'self_resource') {
    cardVP[name] = { type: 'per_resource', per: info.divisor || 1 };
  } else if (info.vpPer === 'flat_conditional') {
    cardVP[name] = { type: 'static', vp: info.vpFlat || 3 };
  } else if (info.vpPer) {
    // per tag (jovian, science, space, etc.)
    cardVP[name] = { type: 'per_tag', tag: info.vpPer, per: 1 };
  }
}

// From card_effects (static VP, per-resource VP, per-tag VP)
for (const [name, e] of Object.entries(effects)) {
  if (cardVP[name]) continue;
  if (typeof e.vp === 'number' && e.vp !== 0) {
    cardVP[name] = { type: 'static', vp: e.vp };
  } else if (e.vpAcc) {
    // VP per resource on card (e.g. 1 VP per animal, or 1 VP per 2 microbes)
    cardVP[name] = { type: 'per_resource', per: e.vpAcc };
  } else if (e.vpTag) {
    // VP per tag (e.g. 1 VP per Jovian tag)
    cardVP[name] = { type: 'per_tag', tag: e.vpTag.tag, per: e.vpTag.per || 1 };
  }
}

// From all_cards.json (static VP not in effects)
for (const card of allCards) {
  if (cardVP[card.name]) continue;
  if (card.victoryPoints) {
    const vp = parseInt(card.victoryPoints);
    if (!isNaN(vp) && vp !== 0) {
      cardVP[card.name] = { type: 'static', vp: vp };
    }
    // "1/2 resources" etc → already handled by vpMult
  }
}

// ══════════════════════════════════════════════════════════════
// 3. CARD DATA — structured behavior/action for scoreCard
// ══════════════════════════════════════════════════════════════

// Mapping: TM_CARD_EFFECTS short keys → scoreCard behavior format
const PROD_MAP = { mp: 'megacredits', sp: 'steel', tp: 'titanium', pp: 'plants', ep: 'energy', hp: 'heat' };
const STOCK_MAP = { mc: 'megacredits', st: 'steel', ti: 'titanium', pl: 'plants', en: 'energy', he: 'heat' };
const GLOBAL_MAP = { tmp: 'temperature', o2: 'oxygen', vn: 'venus' };

const cardData = {};

for (const [name, e] of Object.entries(effects)) {
  const entry = {};

  // ── behavior ──
  const beh = {};

  // Production
  const prod = {};
  for (const [k, longKey] of Object.entries(PROD_MAP)) {
    if (typeof e[k] === 'number') prod[longKey] = e[k];
  }
  if (Object.keys(prod).length > 0) beh.production = prod;

  // Stock (instant resources)
  const stock = {};
  for (const [k, longKey] of Object.entries(STOCK_MAP)) {
    if (typeof e[k] === 'number') stock[longKey] = e[k];
  }
  if (e.cd) stock.cards = e.cd; // draw cards as stock
  if (Object.keys(stock).length > 0) beh.stock = stock;

  // Global parameter raises
  const glob = {};
  for (const [k, longKey] of Object.entries(GLOBAL_MAP)) {
    if (typeof e[k] === 'number' && e[k] > 0) glob[longKey] = e[k];
  }
  if (Object.keys(glob).length > 0) beh.global = glob;

  // TR
  if (e.tr) beh.tr = e.tr;

  // Oceans
  if (e.oc) beh.ocean = e.oc;

  // Greenery
  if (e.grn) beh.greenery = e.grn;

  // City
  if (e.city) beh.city = e.city;

  // Colony
  if (e.colony) beh.colony = e.colony;

  // Trade fleet
  if (e.tradeFleet) beh.tradeFleet = e.tradeFleet;

  const colonies = {};
  if (e.colony) colonies.buildColony = typeof e.colony === 'object' ? e.colony : {};
  if (typeof e.tradeFleet === 'number') colonies.addTradeFleet = e.tradeFleet;
  if (typeof e.tradeDiscount === 'number') colonies.tradeDiscount = e.tradeDiscount;
  if (typeof e.tradeOffset === 'number') colonies.tradeOffset = e.tradeOffset;
  if (typeof e.tradeMC === 'number') colonies.tradeMC = e.tradeMC;
  if (Object.keys(colonies).length > 0) beh.colonies = colonies;

  // Draw cards
  if (e.cd) beh.drawCard = e.cd;

  // Attack
  if (e.pOpp) beh.decreaseAnyProduction = { count: e.pOpp };
  if (e.rmPl) beh.removeAnyPlants = e.rmPl;

  if (Object.keys(beh).length > 0) entry.behavior = beh;

  // ── action (blue card recurring) ──
  const act = {};
  const catalogCard = allCardsByName[name];
  const canExposeStaticAction = !catalogCard || catalogCard.hasAction === true;
  if (canExposeStaticAction) {
    if (e.actCD) act.drawCard = e.actCD;
    if (e.actTR) act.tr = e.actTR;
    if (e.actMC) act.stock = { megacredits: e.actMC };
    if (e.actOc) act.global = { ocean: e.actOc };
    if (e.vpAcc || e.res) act.addResources = 1;
  }
  if (Object.keys(act).length > 0) entry.action = act;

  // ── VP ──
  if (cardVP[name]) entry.vp = cardVP[name];

  // ── Resource type ──
  if (e.res) entry.resourceType = e.res;

  // ── Card discount ──
  if (e.disc) {
    if (typeof e.disc === 'number') {
      entry.cardDiscount = { amount: e.disc };
    } else if (typeof e.disc === 'object') {
      entry.cardDiscount = e.disc;
    }
  }

  // ── Tags (from cardTags OR existing card_tags.js) ──
  if (cardTags[name]) entry.tags = cardTags[name];
  else if (existingCardTags[name]) entry.tags = existingCardTags[name];

  if (Object.keys(entry).length > 0) {
    cardData[name] = entry;
  }
}

// Add cards from allCards that have no effects entry but have useful data
for (const card of allCards) {
  if (cardData[card.name]) continue;
  const entry = {};
  if (cardTags[card.name]) entry.tags = cardTags[card.name];
  if (cardVP[card.name]) entry.vp = cardVP[card.name];
  if (card.hasAction) entry.action = {}; // mark as blue card
  if (Object.keys(entry).length > 1 || entry.vp) {
    cardData[card.name] = entry;
  }
}

// ══════════════════════════════════════════════════════════════
// WRITE FILES
// ══════════════════════════════════════════════════════════════

function writeWrapper(filename, varName, data) {
  const json = JSON.stringify(data, null, 1);
  const content = `// Auto-generated by gen_browser_data.js — do not edit manually\nvar ${varName} = ${json};\nif (typeof module !== 'undefined') module.exports = ${varName};\n`;
  const out = writeGeneratedExtensionFile(filename, content, 'utf8');
  const size = Buffer.byteLength(content);
  console.log(`${filename}: ${Object.keys(data).length} cards, ${(size / 1024).toFixed(1)} KB`);
  console.log(`  canonical: ${out.canonicalPath}`);
  console.log(`  legacy: ${out.legacyPath}`);
}

// Merge existing card_vp.js entries not covered by sources
let existingCardVP = {};
try { existingCardVP = require(resolveGeneratedExtensionPath('card_vp.js')); } catch(e) {}
for (const [name, vp] of Object.entries(existingCardVP)) {
  if (!cardVP[name]) cardVP[name] = vp;
}

// Only regenerate card_data.js and card_vp.js — card_tags.js has extra entries
// from scraping that all_cards.json doesn't cover. Use --all flag to regen card_tags too.
if (process.argv.includes('--all')) {
  writeWrapper('card_tags.js', 'TM_CARD_TAGS', cardTags);
}
writeWrapper('card_vp.js', 'TM_CARD_VP', cardVP);
writeWrapper('card_data.js', 'TM_CARD_DATA', cardData);

console.log('\nDone!');
