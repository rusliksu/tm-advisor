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
  'Stefan': [
    {
      label: 'Once per game, sell any number of cards from hand for 3 MC each',
      conditional: true,
      oncePerGame: true,
      sellCardsFromHand: { megacredits: 3 },
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
]);
const NO_STATIC_RESOURCE_ACTION = new Set([
  // Trigger-only or paid resource effects. Keep VP/resource metadata, but do
  // not expose them as free recurring resource actions in static card data.
  'Communication Center',
  'Comet Aiming',
  'Directed Impactors',
  'Economic Espionage',
  'Floating Refinery',
  'Icy Impactors',
  'Martian Repository',
  'Neptunian Power Consultants',
  'Rotator Impacts',
]);
const RESOURCE_TYPE_OVERRIDES = {
  'Saturn Surfing': 'floater',
  'Hospitals': 'disease',
  'Search for Life Underground': 'science',
  'Space Privateers': 'fighter',
  'Stem Field Subsidies': 'data',
  'Think Tank': 'data',
  'Titan Manufacturing Colony': 'tool',
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
    if ((e.vpAcc || e.res) && !NO_STATIC_RESOURCE_ACTION.has(name)) act.addResources = 1;
  }
  if (Object.keys(act).length > 0) entry.action = act;
  if (ACTION_CHOICES[name]) entry.actionChoices = ACTION_CHOICES[name];

  // ── VP ──
  if (cardVP[name]) entry.vp = cardVP[name];

  // ── Resource type ──
  if (e.res) entry.resourceType = e.res;
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
