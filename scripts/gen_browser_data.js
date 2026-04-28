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
let rawCards = [];
try {
  rawCards = JSON.parse(fs.readFileSync(path.join(DATA, 'tm-all-cards-raw.json'), 'utf8'));
} catch(e) {
  rawCards = [];
}
const rawCardsByName = Object.fromEntries(rawCards.map((card) => [card.name, card]));
let extractedBehaviors = {};
try {
  extractedBehaviors = require(path.join(DATA, 'all-card-behaviors.json'));
} catch(e) {
  extractedBehaviors = {};
}

function readGeneratedObject(filename, varName) {
  try {
    const loaded = require(resolveGeneratedExtensionPath(filename));
    if (loaded && typeof loaded === 'object' && Object.keys(loaded).length > 0) {
      return loaded;
    }
  } catch(e) {}
  try {
    const src = readGeneratedExtensionFile(filename, 'utf8');
    const re = new RegExp(`(?:const|var)\\s+${varName}\\s*=\\s*(\\{[\\s\\S]*\\})\\s*;`);
    const match = src.match(re);
    return match ? eval('(' + match[1] + ')') : {};
  } catch(e) {
    return {};
  }
}

// Load existing card_tags.js for tag fallback (has more cards than all_cards.json)
const existingCardTags = readGeneratedObject('card_tags.js', 'TM_CARD_TAGS');

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

const cardTags = Object.assign({}, existingCardTags);
for (const card of allCards) {
  if (card.tags && card.tags.length > 0) {
    cardTags[card.name] = card.tags.map(t => t.toLowerCase());
  }
}

// ══════════════════════════════════════════════════════════════
// 2. CARD VP — { "Birds": { type: "per_resource", per: 1 }, ... }
// ══════════════════════════════════════════════════════════════

const cardVP = {};

function parseResourceVP(victoryPoints) {
  if (!victoryPoints) return null;
  const text = String(victoryPoints).trim();
  const match = text.match(/^(\d+)\s*\/\s*(?:(\d+)\s+)?resources?$/i);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = match[2] ? Number(match[2]) : 1;
  if (!Number.isFinite(numerator) || numerator <= 0 || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return denominator / numerator;
}

function normalizeResourceType(resourceType) {
  const text = String(resourceType || '').trim().toLowerCase();
  if (!text) return '';
  return text.replace(/[\s-]+/g, '_');
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
  if (!Number.isFinite(divisor) || divisor <= 0) return null;
  return {type: 'per_resource', per: divisor};
}

function textFromRenderNode(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textFromRenderNode).join(' ');
  if (!node || typeof node !== 'object') return '';
  return Object.values(node).map(textFromRenderNode).join(' ');
}

function collectRenderResources(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectRenderResources(item, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (node.type === 'resource' && typeof node.amount === 'number' && node.amount > 0) {
    out.push({
      amount: node.amount,
      resourceType: normalizeResourceType(node.resource),
      tagConstraint: node.secondaryTag ? String(node.secondaryTag).toLowerCase() : null,
    });
  }
  for (const value of Object.values(node)) collectRenderResources(value, out);
}

function actionResourceAddFromRaw(card) {
  if (!card || !card.metadata || !card.metadata.renderData) return null;
  const resourceType = normalizeResourceType(card.resourceType);
  if (!resourceType) return null;
  const rows = card.metadata.renderData.rows || [];
  let best = null;
  for (const row of rows) {
    const text = textFromRenderNode(row);
    if (!/\bAction:/i.test(text) || !/\b(add|put)\b/i.test(text)) continue;
    const resources = [];
    collectRenderResources(row, resources);
    for (const resource of resources) {
      if (resource.resourceType !== resourceType) continue;
      if (!best || resource.amount > best.amount) {
        best = {
          amount: resource.amount,
          resourceType: resource.resourceType,
          target: /\bany\b/i.test(text) ? 'any' : 'this',
          tagConstraint: resource.tagConstraint,
        };
      }
    }
  }
  return best;
}

function actionResourceAddFromExtracted(name, e) {
  const extracted = extractedBehaviors[name];
  const actionAdd = extracted && extracted.action && extracted.action.addResources;
  if (typeof actionAdd !== 'number' || actionAdd <= 0) return null;
  return {
    amount: actionAdd,
    resourceType: normalizeResourceType((extracted && extracted.resourceType) || (e && e.res)),
    target: 'this',
  };
}

function staticActionResourceAdd(name, e) {
  const rawAdd = actionResourceAddFromRaw(rawCardsByName[name]);
  if (rawAdd) return rawAdd;
  const extractedAdd = actionResourceAddFromExtracted(name, e);
  if (extractedAdd) return extractedAdd;
  return {
    amount: 1,
    resourceType: normalizeResourceType((rawCardsByName[name] && rawCardsByName[name].resourceType) || (e && e.res)),
    target: 'this',
  };
}

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
    cardVP[name] = { type: 'per_resource', per: e.vpPer || e.vpAcc };
  } else if (e.vpTag) {
    // VP per tag (e.g. 1 VP per Jovian tag)
    cardVP[name] = { type: 'per_tag', tag: e.vpTag.tag, per: e.vpTag.per || 1 };
  }
}

// From raw canonical TM source extraction. This covers Moon/Pathfinders/etc.
// cards not present in compact all_cards.json and corrects stale generated
// divisors such as Solarpedia's 1 VP / 6 data.
for (const card of rawCards) {
  const rawResourceVP = resourceVPFromRaw(card);
  if (rawResourceVP) cardVP[card.name] = rawResourceVP;
}

// From all_cards.json (static VP not in effects)
for (const card of allCards) {
  const resourceVP = parseResourceVP(card.victoryPoints);
  if (resourceVP !== null) {
    cardVP[card.name] = { type: 'per_resource', per: resourceVP };
    continue;
  }
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
const ACTION_STOCK_MAP = { actMC: 'megacredits', actST: 'steel', actTI: 'titanium', actPL: 'plants', actEN: 'energy', actHE: 'heat' };
const GLOBAL_MAP = { tmp: 'temperature', o2: 'oxygen', vn: 'venus' };
const SCORE_ONLY_BEHAVIOR_DRAW = new Set([
  // OPG/filtering effects that use cd as a valuation proxy in effects, but
  // are not immediate free card draw in factual browser card_data.
  'Ender',
  'Tate',
]);
const BEHAVIOR_DRAW_OVERRIDES = {
  'Sponsored Academies': {
    // The printed effect is discard 1, then draw 3; opponents draw 1.
    // netDrawCard is only the resulting hand-size delta, not the scoring input:
    // the discarded card comes from the old hand before the 3-card draw.
    drawCard: 3,
    netDrawCard: 2,
    discardCardsFromHand: 1,
    discardBeforeDraw: true,
    discardCardCostMC: 1,
    opponentsDrawCard: 1,
  },
  'Spire': {
    // Initial action: draw 4, then discard 3 from the enlarged hand.
    // Net hand-size is +1, with selection/filtering value from seeing 4.
    drawCard: 4,
    netDrawCard: 1,
    discardCardsFromHand: 3,
    discardAfterDraw: true,
    discardCardSelectionBonusMC: 0.75,
  },
  'Nanotech Industries': {
    // Initial action: draw 3 and keep 2. Net hand-size is +2, with a small
    // filtering bonus from seeing one extra card.
    drawCard: 3,
    netDrawCard: 2,
    discardCardsFromHand: 1,
    discardAfterDraw: true,
    discardCardSelectionBonusMC: 0.75,
  },
};
const SCORE_ONLY_ACTION_DRAW = new Set([
  // These actions look/reveal cards and optionally buy/keep them; actCD is an
  // EV approximation for scoring, not a literal fractional card draw action.
  "Inventors' Guild",
  'Business Network',
  'Venus Orbital Survey',
  // The effect score uses a fractional card EV for the two-turn
  // floater->card cycle. Browser card_data should show the factual branches.
  'Red Spot Observatory',
]);
const SCORE_ONLY_ACTION_TR = new Set([
  // Dynamic-cost Venus raise. actTR is an EV approximation for scoreCard.
  'Venus Shuttles',
]);
const ACTION_CHOICES = {
  'United Nations Mars Initiative': [
    {
      label: 'If your TR was raised this generation, pay 3 MC to raise TR 1 step',
      conditional: true,
      stock: { megacredits: -3 },
      tr: 1,
    },
  ],
  'Factorum': [
    {
      label: 'Increase energy production 1 step if you have no energy resources',
      conditional: true,
      production: { energy: 1 },
    },
    {
      label: 'Spend 3 MC to draw a building card',
      stock: { megacredits: -3 },
      drawCard: 1,
      tagConstraint: 'building',
    },
  ],
  'Viron': [
    {
      label: 'Use a blue card action that has already been used this generation',
      conditional: true,
      reuseActionCard: true,
      cardType: 'active',
    },
  ],
  'St. Joseph of Cupertino Mission': [
    {
      label: 'Pay 5 MC (steel may be used) to build 1 Cathedral in a city; city owner may pay 2 MC to draw 1 card',
      conditional: true,
      stock: { megacredits: -5 },
      placeCathedral: true,
      cityOwnerMayPayToDraw: { megacredits: 2, drawCard: 1 },
    },
  ],
  'Stefan': [
    {
      label: 'Once per game, sell any number of cards from hand for 3 MC each',
      conditional: true,
      oncePerGame: true,
      sellCardsFromHand: { megacredits: 3 },
    },
  ],
  'Ender': [
    {
      label: 'Once per game, discard up to twice the generation number, then draw the same number of cards',
      conditional: true,
      oncePerGame: true,
      variable: true,
      discardCardsFromHand: { maxPerGenerationMultiplier: 2 },
      drawCardsEqualToDiscarded: true,
      netHandSizeChange: 0,
    },
  ],
  'Tate': [
    {
      label: 'Once per game, name a tag; reveal until 5 cards with that tag, buy up to 2 and discard the rest',
      conditional: true,
      oncePerGame: true,
      chooseTag: true,
      excludeTags: ['wild', 'event', 'clone'],
      revealUntilTaggedCards: 5,
      acquireRevealedCards: {
        optional: true,
        keepMax: 2,
        cost: { megacredits: 3 },
        discardUnbought: true,
      },
    },
  ],
  "Inventors' Guild": [
    {
      label: 'Look at the top card and either buy it for 3 MC or discard it',
      conditional: true,
      revealTopCards: 1,
      buyOrDiscardRevealedCards: true,
      buyCost: { megacredits: 3 },
      acquireRevealedCards: {
        optional: true,
        cost: { megacredits: 3 },
        discardUnbought: true,
      },
    },
  ],
  'Business Network': [
    {
      label: 'Look at the top card and either buy it for 3 MC or discard it',
      conditional: true,
      revealTopCards: 1,
      buyOrDiscardRevealedCards: true,
      buyCost: { megacredits: 3 },
      acquireRevealedCards: {
        optional: true,
        cost: { megacredits: 3 },
        discardUnbought: true,
      },
    },
  ],
  'Ceres Tech Market': [
    {
      label: 'Discard any number of cards from hand to gain 2 MC each',
      conditional: true,
      variable: true,
      sellCardsFromHand: { megacredits: 2 },
    },
  ],
  'Venus Orbital Survey': [
    {
      label: 'Reveal the top 2 cards; keep Venus cards for free, buy or discard the rest',
      conditional: true,
      revealTopCards: 2,
      keepTagsFree: ['venus'],
      buyOrDiscardRest: true,
      buyCost: { megacredits: 3 },
      acquireRevealedCards: {
        freeTags: ['venus'],
        optionalPaidRest: true,
        cost: { megacredits: 3 },
        discardUnbought: true,
      },
    },
  ],
  'Tycho Magnetics': [
    {
      label: 'Spend any amount of energy to draw that many cards and keep 1',
      variable: true,
      stockRatio: { energy: -1 },
      drawCardRatio: { cards: 1, keepMax: 1 },
    },
  ],
  'Kuiper Cooperative': [
    {
      label: 'Add 1 asteroid here for every space tag you have',
      dynamic: true,
      addResourcesPerTag: { tag: 'space', amount: 1 },
      resourceType: 'asteroid',
      target: 'this',
    },
  ],
  'Stormcraft Incorporated': [
    {
      label: 'Add 1 floater to any card',
      addResources: 1,
      resourceType: 'floater',
      target: 'any',
    },
  ],
  'Robinson Industries': [
    {
      label: 'Spend 4 MC to increase one of your lowest productions 1 step',
      conditional: true,
      stock: { megacredits: -4 },
      productionChoice: { count: 1, lowestOnly: true },
    },
  ],
  'Palladin Shipping': [
    {
      label: 'Spend 2 titanium to raise temperature 1 step',
      conditional: true,
      stock: { titanium: -2 },
      global: { temperature: 1 },
    },
  ],
  'Utopia Invest': [
    {
      label: 'Decrease any production 1 step to gain 4 resources of that kind',
      conditional: true,
      variable: true,
      productionToStockRatio: { production: -1, stock: 4 },
    },
  ],
  'Arcadian Communities': [
    {
      label: 'Place a community marker adjacent to one of your tiles or marked areas',
      conditional: true,
      boardAction: 'place_community_marker',
    },
  ],
  'Hadesphere': [
    {
      label: 'Excavate an underground resource',
      conditional: true,
      underworld: { excavate: 1 },
    },
  ],
  'Focused Organization': [
    {
      label: 'Discard 1 card and spend 1 standard resource to draw 1 card and gain 1 standard resource',
      conditional: true,
      stock: { cards: -1 },
      spendStandardResource: 1,
      drawCard: 1,
      gainStandardResource: 1,
    },
  ],
  'World Government Advisor': [
    {
      label: 'Raise 1 global parameter without TR or placement bonuses',
      conditional: true,
      globalChoice: ['ocean', 'oxygen', 'temperature', 'venus'],
      noTR: true,
      noBonuses: true,
    },
  ],
  'Water Import From Europa': [
    {
      label: 'Pay 12 MC to place an ocean tile; titanium may be used',
      stock: { megacredits: -12 },
      global: { ocean: 1 },
      canUseTitanium: true,
    },
  ],
  'Septem Tribus': [
    {
      label: 'When you perform an action, the wild tag counts as any tag of your choice',
      conditional: true,
      tagFlexAction: true,
    },
  ],
  'Self-replicating Robots': [
    {
      label: 'Reveal a Space or Building card from hand here and place 2 resources on it',
      conditional: true,
      hostCardFromHand: true,
      tagConstraint: ['space', 'building'],
      addResources: 2,
      target: 'hosted_card',
    },
    {
      label: 'Double resources on a card hosted here',
      conditional: true,
      doubleHostedResources: true,
    },
  ],
  'Orbital Cleanup': [
    {
      label: 'Gain 1 MC per science tag you have',
      dynamic: true,
      stockPerTag: { tag: 'science', megacredits: 1 },
    },
  ],
  'Think Tank': [
    {
      label: 'Spend 2 MC to place 1 data on any card',
      stock: { megacredits: -2 },
      addResources: 1,
      resourceType: 'data',
      target: 'any',
    },
  ],
  'Darkside Observatory': [
    {
      label: 'Add 1 science resource to an eligible science-resource card',
      conditional: true,
      addResources: 1,
      resourceType: 'science',
      target: 'any',
      excludesHighVpScienceResources: true,
    },
    {
      label: 'Add 2 data resources to any data card',
      conditional: true,
      addResources: 2,
      resourceType: 'data',
      target: 'any',
    },
  ],
  'Floater-Urbanism': [
    {
      label: 'Spend 1 floater from any card to add 1 Venusian habitat here',
      conditional: true,
      spendResourcesAny: { type: 'floater', amount: 1 },
      addResources: 1,
      resourceType: 'venusian_habitat',
      target: 'this',
    },
  ],
  'Nanotech Industries': [
    {
      label: 'Add 1 science resource to any eligible science-resource card',
      addResources: 1,
      resourceType: 'science',
      target: 'any',
      excludesHighVpScienceResources: true,
    },
  ],
  'Electro Catapult': [
    {
      label: 'Spend 1 plant to gain 7 MC',
      stock: { plants: -1, megacredits: 7 },
    },
    {
      label: 'Spend 1 steel to gain 7 MC',
      stock: { steel: -1, megacredits: 7 },
    },
  ],
  'Directed Heat Usage': [
    {
      label: 'Spend 3 heat to gain 4 MC',
      stock: { heat: -3, megacredits: 4 },
    },
    {
      label: 'Spend 3 heat to gain 2 plants',
      stock: { heat: -3, plants: 2 },
    },
  ],
  'Martian Rails': [
    {
      label: 'Spend 1 energy to gain 1 MC for each city tile on Mars',
      dynamic: true,
      stock: { energy: -1 },
      stockPerBoard: { per: 'mars_city_tile', megacredits: 1 },
    },
  ],
  'Red Ships': [
    {
      label: 'Gain 1 MC for each city and special tile adjacent to an ocean',
      dynamic: true,
      stockPerBoard: { per: 'ocean_adjacent_city_or_special_tile', megacredits: 1 },
    },
  ],
  'Luna Trade Station': [
    {
      label: 'Gain 2 MC for each habitat tile on The Moon',
      dynamic: true,
      stockPerBoard: { per: 'moon_habitat_tile', megacredits: 2 },
    },
  ],
  'HE3 Refinery': [
    {
      label: 'Gain 1 MC for each level of mining rate',
      dynamic: true,
      stockPerBoard: { per: 'moon_mining_rate', megacredits: 1 },
    },
  ],
  'Steel Market Monopolists': [
    {
      label: 'Spend 3X MC to gain 2X steel, max 9 MC',
      variable: true,
      stockRatio: { megacredits: -3, steel: 2 },
      maxSpend: { megacredits: 9 },
    },
    {
      label: 'Spend X steel to gain 3X MC, max 3 steel',
      variable: true,
      stockRatio: { steel: -1, megacredits: 3 },
      maxSpend: { steel: 3 },
    },
  ],
  'Titanium Market Monopolists': [
    {
      label: 'Spend 2X MC to gain X titanium, max 8 MC',
      variable: true,
      stockRatio: { megacredits: -2, titanium: 1 },
      maxSpend: { megacredits: 8 },
    },
    {
      label: 'Spend X titanium to gain 4X MC, max 4 titanium',
      variable: true,
      stockRatio: { titanium: -1, megacredits: 4 },
      maxSpend: { titanium: 4 },
    },
  ],
  'Grey Market Exploitation': [
    {
      label: 'Spend 1 MC to gain 1 standard resource',
      stock: { megacredits: -1 },
      gainStandardResource: 1,
    },
    {
      label: 'Spend 1 corruption to gain 3 of the same standard resource',
      spendCorruption: 1,
      gainStandardResource: 3,
      sameStandardResource: true,
    },
  ],
  'Personal Spacecruiser': [
    {
      label: 'Spend 1 energy to gain 2 MC for each corruption resource you have',
      dynamic: true,
      stock: { energy: -1 },
      stockPerPlayerResource: { resourceType: 'corruption', megacredits: 2 },
    },
  ],
  'Battery Factory': [
    {
      label: 'Spend 1 energy to gain 1 MC for each power tag you have',
      dynamic: true,
      stock: { energy: -1 },
      stockPerTag: { tag: 'power', megacredits: 1 },
    },
  ],
  'Martian Express': [
    {
      label: 'Remove all wares here to gain 1 MC for each ware removed',
      conditional: true,
      spendResourcesHere: 'all',
      stockPerResourceHere: { resourceType: 'ware', megacredits: 1 },
    },
  ],
  'Martian Media Center': [
    {
      label: 'Pay 3 MC to add a delegate to any party',
      stock: { megacredits: -3 },
      turmoil: { sendDelegates: { count: 1, target: 'any_party' } },
    },
  ],
  'Mohole Lake': [
    {
      label: 'Add 1 microbe to another card',
      conditional: true,
      addResources: 1,
      resourceType: 'microbe',
      target: 'another',
    },
    {
      label: 'Add 1 animal to another card',
      conditional: true,
      addResources: 1,
      resourceType: 'animal',
      target: 'another',
    },
  ],
  'Saturn Surfing': [
    {
      label: 'Remove 1 floater here to gain 1 MC per floater here, including the paid floater, max 5',
      conditional: true,
      spendResourcesHere: 1,
      stockPerResourceHere: { resourceType: 'floater', megacredits: 1, max: 5, includesSpent: true },
    },
  ],
  'Mars Nomads': [
    {
      label: 'Move the Nomads to an adjacent non-reserved empty area and collect the placement bonus',
      conditional: true,
      boardAction: 'move_nomads',
      placementBonus: true,
      noTilePlaced: true,
    },
  ],
  'Teslaract': [
    {
      label: 'Decrease energy production 1 step to increase plant production 1 step',
      conditional: true,
      production: { energy: -1, plants: 1 },
    },
  ],
  'Hospitals': [
    {
      label: 'Remove 1 disease from any of your cards to gain 1 MC per city in play',
      conditional: true,
      spendResources: { type: 'disease', count: 1, target: 'any_owned' },
      stockPerBoard: { per: 'city', megacredits: 1 },
    },
  ],
  'Maxwell Base': [
    {
      label: 'Add 1 resource to another Venus card',
      conditional: true,
      addResources: 1,
      target: 'another',
      tagConstraint: 'venus',
    },
  ],
  'Geologist Team': [
    {
      label: 'Identify 1 underground resource',
      conditional: true,
      underworld: { identify: 1 },
    },
  ],
  'Search For Life': [
    {
      label: 'Spend 1 MC to reveal the top deck card; if it has a microbe tag, add 1 science resource here',
      conditional: true,
      stock: { megacredits: -1 },
      revealTopCard: 1,
      addResourcesIfTag: { tag: 'microbe', resourceType: 'science', amount: 1, target: 'this' },
    },
  ],
  'Search for Life Underground': [
    {
      label: 'Spend 1 MC to identify an underground resource; if it depicts a microbe, add 1 science resource here',
      conditional: true,
      stock: { megacredits: -1 },
      underworld: { identify: 1 },
      addResourcesIfToken: { token: 'microbe', resourceType: 'science', amount: 1, target: 'this' },
    },
  ],
  'Chemical Factory': [
    {
      label: 'Spend 1 plant to excavate an underground resource',
      conditional: true,
      stock: { plants: -1 },
      underworld: { excavate: 1 },
    },
  ],
  'Corporate Theft': [
    {
      label: 'Pay 5 MC to steal any 1 resource from another player',
      conditional: true,
      stock: { megacredits: -5 },
      stealResource: { count: 1, source: 'opponent', anyStandardOrCardResource: true },
    },
  ],
  'Deep Foundations': [
    {
      label: 'Pay 20 MC, steel may be used, excavate a valid city space if possible, then place a city',
      conditional: true,
      stock: { megacredits: -20 },
      canUseSteel: true,
      underworld: { excavate: 1, ifPossible: true },
      city: 1,
    },
  ],
  'Monopoly': [
    {
      label: 'Spend 1 corruption to increase any production 1 step',
      conditional: true,
      spendCorruption: 1,
      productionChoice: { count: 1 },
    },
  ],
  'Space Privateers': [
    {
      label: 'Steal up to 1 MC per fighter here from each other player; blocked players remove 1 fighter',
      conditional: true,
      stockPerResourceHere: { resourceType: 'fighter', megacredits: 1 },
      stealFromEachOpponent: true,
      blockedRemovesResource: 'fighter',
    },
  ],
  'Stem Field Subsidies': [
    {
      label: 'Spend 2 data here to identify 3 underground resources and claim 1',
      conditional: true,
      spendResourcesHere: 2,
      underworld: { identify: 3, claim: 1 },
    },
  ],
  'Titan Manufacturing Colony': [
    {
      label: 'Spend 1 tool here to excavate an underground resource',
      conditional: true,
      spendResourcesHere: 1,
      underworld: { excavate: 1 },
    },
  ],
  'Underground Shelters': [
    {
      label: 'Place your cube on one of your claimed underground resource tokens without a cube',
      conditional: true,
      underworld: { shelterToken: 1 },
    },
  ],
  'Voltaic Metallurgy': [
    {
      label: 'Spend any number of steel to gain the same amount of titanium, max power tags',
      conditional: true,
      variable: true,
      stockRatio: { steel: -1, titanium: 1 },
      maxByTag: 'power',
    },
  ],
  'Energy Market': [
    {
      label: 'Spend 2X MC to gain X energy',
      variable: true,
      stockRatio: { megacredits: -2, energy: 1 },
    },
    {
      label: 'Decrease energy production 1 step to gain 8 MC',
      conditional: true,
      production: { energy: -1 },
      stock: { megacredits: 8 },
    },
  ],
  'Power Infrastructure': [
    {
      label: 'Spend any amount of energy to gain that many MC',
      variable: true,
      stockRatio: { energy: -1, megacredits: 1 },
    },
  ],
  'Hi-Tech Lab': [
    {
      label: 'Spend any amount of energy to draw that many cards and keep 1',
      variable: true,
      stockRatio: { energy: -1 },
      drawCardRatio: { cards: 1, keepMax: 1 },
    },
  ],
  'Floyd Continuum': [
    {
      label: 'Gain 3 MC per completed terraforming parameter',
      dynamic: true,
      completedParameterMc: 3,
    },
  ],
  'Asteroid Rights': [
    {
      label: 'Spend 1 MC to add 1 asteroid to any card',
      stock: { megacredits: -1 },
      addResources: 1,
      resourceType: 'asteroid',
      target: 'any',
    },
    {
      label: 'Remove 1 asteroid here to increase MC production 1 step',
      conditional: true,
      spendResourcesHere: 1,
      production: { megacredits: 1 },
    },
    {
      label: 'Remove 1 asteroid here to gain 2 titanium',
      conditional: true,
      spendResourcesHere: 1,
      stock: { titanium: 2 },
    },
  ],
  'Comet Aiming': [
    {
      label: 'Spend 1 titanium to add 1 asteroid to any card',
      stock: { titanium: -1 },
      addResources: 1,
      resourceType: 'asteroid',
      target: 'any',
    },
    {
      label: 'Remove 1 asteroid here to place an ocean',
      conditional: true,
      spendResourcesHere: 1,
      global: { ocean: 1 },
    },
  ],
  'Directed Impactors': [
    {
      label: 'Spend 6 MC to add 1 asteroid to any card',
      stock: { megacredits: -6 },
      addResources: 1,
      resourceType: 'asteroid',
      target: 'any',
      canUseTitanium: true,
    },
    {
      label: 'Remove 1 asteroid here to raise temperature 1 step',
      conditional: true,
      spendResourcesHere: 1,
      global: { temperature: 1 },
    },
  ],
  'Icy Impactors': [
    {
      label: 'Spend 10 MC to add 2 asteroids to this card',
      stock: { megacredits: -10 },
      addResources: 2,
      resourceType: 'asteroid',
      target: 'this',
      canUseTitanium: true,
    },
    {
      label: 'Remove 1 asteroid here to place an ocean',
      conditional: true,
      spendResourcesHere: 1,
      global: { ocean: 1 },
      firstPlayerPlaces: true,
    },
  ],
  'Atmo Collectors': [
    {
      label: 'Add 1 floater to this card',
      addResources: 1,
      resourceType: 'floater',
      target: 'this',
    },
    {
      label: 'Remove 1 floater to gain 2 titanium',
      conditional: true,
      spendResourcesHere: 1,
      stock: { titanium: 2 },
    },
    {
      label: 'Remove 1 floater to gain 3 energy',
      conditional: true,
      spendResourcesHere: 1,
      stock: { energy: 3 },
    },
    {
      label: 'Remove 1 floater to gain 4 heat',
      conditional: true,
      spendResourcesHere: 1,
      stock: { heat: 4 },
    },
  ],
  'Red Spot Observatory': [
    {
      label: 'Add 1 floater to this card',
      addResources: 1,
      resourceType: 'floater',
      target: 'this',
    },
    {
      label: 'Remove 1 floater here to draw a card',
      conditional: true,
      spendResourcesHere: 1,
      drawCard: 1,
    },
  ],
  'Venus Shuttles': [
    {
      label: 'Spend 12 MC minus 1 MC per Venus tag to raise Venus 1 step',
      conditional: true,
      dynamicCost: { baseMegacredits: 12, discountPerTag: 'venus', minimumMegacredits: 0 },
      global: { venus: 1 },
    },
  ],
  'Project Workshop': [
    {
      label: 'Spend 3 MC to draw a blue card',
      stock: { megacredits: -3 },
      drawCard: 1,
      cardType: 'active',
    },
    {
      label: 'Flip and discard a played blue card to convert VP into TR and draw 2 cards',
      conditional: true,
      discardPlayedCardType: 'active',
      trFromDiscardedCardVP: true,
      drawCard: 2,
    },
  ],
  'Floating Refinery': [
    {
      label: 'Add 1 floater to this card',
      addResources: 1,
      resourceType: 'floater',
      target: 'this',
    },
    {
      label: 'Remove 2 floaters from any card to gain 1 titanium and 2 MC',
      conditional: true,
      spendResources: { type: 'floater', count: 2, target: 'any' },
      stock: { titanium: 1, megacredits: 2 },
    },
  ],
  'Floater Technology': [
    {
      label: 'Add 1 floater to another card',
      addResources: 1,
      resourceType: 'floater',
      target: 'another',
    },
  ],
  'Local Shading': [
    {
      label: 'Add 1 floater to this card',
      addResources: 1,
      resourceType: 'floater',
      target: 'this',
    },
    {
      label: 'Remove 1 floater to increase MC production 1 step',
      conditional: true,
      spendResourcesHere: 1,
      production: { megacredits: 1 },
    },
  ],
  'Jet Stream Microscrappers': [
    {
      label: 'Spend 1 titanium to add 2 floaters to this card',
      stock: { titanium: -1 },
      addResources: 2,
      resourceType: 'floater',
      target: 'this',
    },
    {
      label: 'Remove 2 floaters here to raise Venus 1 step',
      conditional: true,
      spendResourcesHere: 2,
      global: { venus: 1 },
    },
  ],
  'Sulphur-Eating Bacteria': [
    {
      label: 'Add 1 microbe to this card',
      addResources: 1,
      resourceType: 'microbe',
      target: 'this',
    },
    {
      label: 'Remove any number of microbes to gain 3 MC per microbe',
      conditional: true,
      variable: true,
      spendResourcesHere: 'any',
      stockRatio: { microbe: -1, megacredits: 3 },
    },
  ],
  'Titan Air-scrapping': [
    {
      label: 'Spend 1 titanium to add 2 floaters to this card',
      stock: { titanium: -1 },
      addResources: 2,
      resourceType: 'floater',
      target: 'this',
    },
    {
      label: 'Remove 2 floaters here to increase TR 1 step',
      conditional: true,
      spendResourcesHere: 2,
      tr: 1,
    },
  ],
  'Titan Shuttles': [
    {
      label: 'Add 2 floaters to any Jovian card',
      addResources: 2,
      resourceType: 'floater',
      target: 'any',
      tagConstraint: 'jovian',
    },
    {
      label: 'Remove any number of floaters here to gain that many titanium',
      conditional: true,
      variable: true,
      spendResourcesHere: 'any',
      stockRatio: { floater: -1, titanium: 1 },
    },
  ],
  'Floating Trade Hub': [
    {
      label: 'Add 2 floaters to any card',
      addResources: 2,
      resourceType: 'floater',
      target: 'any',
    },
    {
      label: 'Remove any number of floaters here to gain that many of one standard resource',
      conditional: true,
      variable: true,
      spendResourcesHere: 'any',
      standardResourceChoice: true,
    },
  ],
  'Bioengineering Enclosure': [
    {
      label: 'Remove 1 animal from here to add 1 animal to another card',
      conditional: true,
      spendResourcesHere: 1,
      addResources: 1,
      resourceType: 'animal',
      target: 'another',
    },
  ],
  'Cloud Vortex Outpost': [
    {
      label: 'Remove 1 floater from here to add 1 floater to another card',
      conditional: true,
      spendResourcesHere: 1,
      addResources: 1,
      resourceType: 'floater',
      target: 'another',
    },
  ],
  'Applied Science': [
    {
      label: 'Remove 1 science resource here to gain 1 standard resource',
      conditional: true,
      spendResourcesHere: 1,
      gainStandardResource: 1,
    },
    {
      label: 'Remove 1 science resource here to add 1 resource to any card with a resource',
      conditional: true,
      spendResourcesHere: 1,
      addResources: 1,
      target: 'any',
      anyResourceCard: true,
    },
  ],
  'Board of Directors': [
    {
      label: 'Draw 1 prelude; discard it or pay 12 MC and remove 1 director to play it',
      conditional: true,
      drawPreludeCard: 1,
      optionalPlayDrawnPrelude: { megacredits: 12, spendResourcesHere: 1 },
    },
  ],
  'Aeron Genomics': [
    {
      label: 'Discard up to 2 claimed underground resource tokens to add that many animals to any card',
      conditional: true,
      spendClaimedUndergroundTokens: { min: 1, max: 2 },
      addResources: 2,
      resourceType: 'animal',
      target: 'any',
      variable: true,
    },
  ],
  'Demetron Labs': [
    {
      label: 'Spend 3 data here to identify 3 underground resources and claim 1',
      conditional: true,
      spendResourcesHere: 3,
      underworld: { identify: 3, claim: 1 },
    },
  ],
  'The Darkside of The Moon Syndicate': [
    {
      label: 'Spend 1 titanium to add 1 syndicate fleet here',
      stock: { titanium: -1 },
      addResources: 1,
      resourceType: 'syndicate_fleet',
      target: 'this',
    },
    {
      label: 'Remove 1 syndicate fleet here to steal 2 MC from each opponent',
      conditional: true,
      spendResourcesHere: 1,
      stealFromEachOpponent: { megacredits: 2 },
    },
  ],
  'Rotator Impacts': [
    {
      label: 'Spend 6 MC to add 1 asteroid to this card',
      stock: { megacredits: -6 },
      addResources: 1,
      resourceType: 'asteroid',
      target: 'this',
      canUseTitanium: true,
    },
    {
      label: 'Remove 1 asteroid to raise Venus 1 step',
      conditional: true,
      spendResourcesHere: 1,
      global: { venus: 1 },
    },
  ],
  'Bio Printing Facility': [
    {
      label: 'Spend 2 energy to gain 2 plants',
      stock: { energy: -2, plants: 2 },
    },
    {
      label: 'Spend 2 energy to add 1 animal to another card',
      conditional: true,
      stock: { energy: -2 },
      addResources: 1,
      resourceType: 'animal',
      target: 'another',
    },
  ],
};
const STALE_CARD_VP = new Set([
  'Atmo Collectors',
  'Dirigibles',
  'GHG Producing Bacteria',
  'Nitrite Reducing Bacteria',
  'Regolith Eaters',
  'Search For Life',
  'St. Joseph of Cupertino Mission',
]);
for (const staleName of STALE_CARD_VP) {
  delete cardVP[staleName];
}
const NO_STATIC_RESOURCE_ACTION = new Set([
  // Trigger-only or paid resource effects. Keep VP/resource metadata, but do
  // not expose them as free recurring resource actions in static card data.
  'Communication Center',
  'Comet Aiming',
  'Directed Impactors',
  'Aeron Genomics',
  'Applied Science',
  'Bioengineering Enclosure',
  'Board of Directors',
  'Cloud Vortex Outpost',
  'Demetron Labs',
  'Economic Espionage',
  'Floater-Urbanism',
  'Floating Refinery',
  'Icy Impactors',
  'Martian Repository',
  'Neptunian Power Consultants',
  'Rotator Impacts',
  'Search For Life',
  'Asteroid Rights',
  'St. Joseph of Cupertino Mission',
  'Terraforming Robots',
]);
const RESOURCE_TYPE_OVERRIDES = {
  'Saturn Surfing': 'floater',
  'Hospitals': 'disease',
  'Nanotech Industries': 'science',
  'Search for Life Underground': 'science',
  'Space Privateers': 'fighter',
  'Stem Field Subsidies': 'data',
  'Think Tank': 'data',
  'Titan Manufacturing Colony': 'tool',
  'Floater-Urbanism': 'venusian_habitat',
};

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
  const behaviorDrawOverride = BEHAVIOR_DRAW_OVERRIDES[name] || null;
  const behaviorDrawCards = behaviorDrawOverride ? behaviorDrawOverride.drawCard : e.cd;
  if (behaviorDrawCards && !SCORE_ONLY_BEHAVIOR_DRAW.has(name)) stock.cards = behaviorDrawCards; // draw cards as stock
  if (behaviorDrawOverride && typeof behaviorDrawOverride.netDrawCard === 'number') stock.cards = behaviorDrawOverride.netDrawCard;
  if (Object.keys(stock).length > 0) beh.stock = stock;

  // Global parameter raises
  const glob = {};
  for (const [k, longKey] of Object.entries(GLOBAL_MAP)) {
    if (typeof e[k] === 'number' && e[k] > 0) glob[longKey] = e[k];
  }
  if (Object.keys(glob).length > 0) beh.global = glob;

  // TR
  if (e.tr) beh.tr = e.tr;

  // Turmoil
  if (typeof e.infl === 'number') beh.turmoil = { influenceBonus: e.infl };

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
  if (behaviorDrawCards && !SCORE_ONLY_BEHAVIOR_DRAW.has(name)) beh.drawCard = behaviorDrawCards;
  if (behaviorDrawOverride) {
    if (typeof behaviorDrawOverride.netDrawCard === 'number') beh.netDrawCard = behaviorDrawOverride.netDrawCard;
    if (behaviorDrawOverride.discardCardsFromHand) beh.discardCardsFromHand = behaviorDrawOverride.discardCardsFromHand;
    if (behaviorDrawOverride.discardBeforeDraw) beh.discardBeforeDraw = true;
    if (behaviorDrawOverride.discardAfterDraw) beh.discardAfterDraw = true;
    if (typeof behaviorDrawOverride.discardCardCostMC === 'number') beh.discardCardCostMC = behaviorDrawOverride.discardCardCostMC;
    if (typeof behaviorDrawOverride.discardCardSelectionBonusMC === 'number') beh.discardCardSelectionBonusMC = behaviorDrawOverride.discardCardSelectionBonusMC;
    if (behaviorDrawOverride.opponentsDrawCard) beh.opponentsDrawCard = behaviorDrawOverride.opponentsDrawCard;
  }

  // Attack
  if (e.pOpp) beh.decreaseAnyProduction = { count: e.pOpp };
  if (e.rmPl) beh.removeAnyPlants = e.rmPl;

  if (Object.keys(beh).length > 0) entry.behavior = beh;

  // ── action (blue card recurring) ──
  const act = {};
  let resourceActionAdd = null;
  const catalogCard = allCardsByName[name];
  const canExposeStaticAction = !catalogCard || catalogCard.hasAction === true;
  if (canExposeStaticAction) {
    if (e.actCD && !SCORE_ONLY_ACTION_DRAW.has(name)) act.drawCard = e.actCD;
    if (e.actTR && !SCORE_ONLY_ACTION_TR.has(name)) act.tr = e.actTR;
    const actStock = {};
    for (const [k, longKey] of Object.entries(ACTION_STOCK_MAP)) {
      if (typeof e[k] === 'number') actStock[longKey] = e[k];
    }
    if (Object.keys(actStock).length > 0) act.stock = actStock;
    const actGlobal = {};
    if (e.actTmp) actGlobal.temperature = e.actTmp;
    if (e.actO2) actGlobal.oxygen = e.actO2;
    if (e.actOc) actGlobal.ocean = e.actOc;
    if (e.actVn) actGlobal.venus = e.actVn;
    if (Object.keys(actGlobal).length > 0) act.global = actGlobal;
    const actProduction = {};
    for (const [k, longKey] of Object.entries(PROD_MAP)) {
      const actionProd = e['act_' + k];
      if (typeof actionProd === 'number') actProduction[longKey] = actionProd;
    }
    if (Object.keys(actProduction).length > 0) act.production = actProduction;
    if ((e.vpAcc || e.res) && !NO_STATIC_RESOURCE_ACTION.has(name)) {
      resourceActionAdd = staticActionResourceAdd(name, e);
      act.addResources = resourceActionAdd.amount || 1;
      if (resourceActionAdd.resourceType) act.resourceType = resourceActionAdd.resourceType;
      if (resourceActionAdd.target && resourceActionAdd.target !== 'this') act.target = resourceActionAdd.target;
      if (resourceActionAdd.tagConstraint) act.tagConstraint = resourceActionAdd.tagConstraint;
    }
  }
  if (Object.keys(act).length > 0) entry.action = act;
  if (ACTION_CHOICES[name]) entry.actionChoices = ACTION_CHOICES[name];

  // ── VP ──
  if (cardVP[name]) {
    if (
      resourceActionAdd
      && resourceActionAdd.amount > 1
      && cardVP[name].type === 'per_resource'
    ) {
      cardVP[name] = Object.assign({}, cardVP[name], { actionResourceAmount: resourceActionAdd.amount });
    }
    entry.vp = cardVP[name];
  }

  // ── Resource type ──
  const rawCard = rawCardsByName[name];
  if (rawCard && rawCard.resourceType) entry.resourceType = normalizeResourceType(rawCard.resourceType);
  else if (e.res) entry.resourceType = e.res;
  else if (RESOURCE_TYPE_OVERRIDES[name]) entry.resourceType = RESOURCE_TYPE_OVERRIDES[name];
  else if (allCardsByName[name] && allCardsByName[name].resourceType) {
    entry.resourceType = normalizeResourceType(allCardsByName[name].resourceType);
  }

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
  if (!cardVP[name] && !STALE_CARD_VP.has(name)) cardVP[name] = vp;
}
for (const staleName of STALE_CARD_VP) {
  delete cardVP[staleName];
}

// Only regenerate card_data.js and card_vp.js — card_tags.js has extra entries
// from scraping that all_cards.json doesn't cover. Use --all flag to regen card_tags too.
if (process.argv.includes('--all')) {
  writeWrapper('card_tags.js', 'TM_CARD_TAGS', cardTags);
}
writeWrapper('card_vp.js', 'TM_CARD_VP', cardVP);
writeWrapper('card_data.js', 'TM_CARD_DATA', cardData);

console.log('\nDone!');
