/**
 * extract-card-behaviors.js — Extract behavior/action from TM TypeScript sources
 * Run on VPS: node extract-card-behaviors.js > missing-behaviors.json
 *
 * Reads all card .ts files, extracts behavior/action/cost/requirements/victoryPoints
 * for cards that are missing from card_effects.json.js
 */

const fs = require('fs');
const path = require('path');

const TM_ROOT = process.env.TM_ROOT || '/home/openclaw/terraforming-mars';
const CARDS_DIR = path.join(TM_ROOT, 'src/server/cards');

function extractBalancedBraces(text, openIndex) {
  if (openIndex < 0 || text[openIndex] !== '{') return null;
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return null;
}

function extractObjectLiteral(text, key) {
  const keyRegex = new RegExp(key + '\\s*:\\s*\\{');
  const match = keyRegex.exec(text);
  if (!match) return null;
  const openIndex = text.indexOf('{', match.index);
  return extractBalancedBraces(text, openIndex);
}

function parseCardDiscount(body) {
  const inner = extractObjectLiteral(body, 'cardDiscount');
  if (!inner) return null;
  const amountMatch = inner.match(/amount:\s*(-?\d+)/);
  if (!amountMatch) return null;
  const amount = parseInt(amountMatch[1], 10);
  const tagMatch = inner.match(/tag:\s*Tag\.(\w+)/);
  if (tagMatch) {
    return { amount: amount, tag: tagMatch[1].toLowerCase() };
  }
  return amount;
}

function applyTradeRenderEffects(source, result) {
  const behavior = result.behavior || (result.behavior = {});

  const tradeMcMatch = source.match(/trade\(\)\.startEffect\.megacredits\((-?\d+)/);
  if (tradeMcMatch) behavior.tradeMC = parseInt(tradeMcMatch[1], 10);

  const tradeDiscountMatch = source.match(/trade\(\)\.startEffect\.tradeDiscount\((\d+)/);
  if (tradeDiscountMatch) behavior.tradeDiscount = parseInt(tradeDiscountMatch[1], 10);

  const tradeOffsetMatch = source.match(/trade\(\)\.startEffect\.text\('([+-]?\d+)'/);
  if (tradeOffsetMatch) behavior.tradeOffset = parseInt(tradeOffsetMatch[1], 10);

  if (behavior.tradeDiscount != null || behavior.tradeOffset != null) {
    const colonies = behavior.colonies || (behavior.colonies = {});
    if (behavior.tradeDiscount != null) colonies.tradeDiscount = behavior.tradeDiscount;
    if (behavior.tradeOffset != null) colonies.tradeOffset = behavior.tradeOffset;
  }
}

// Find all .ts card files recursively
function findCardFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findCardFiles(full));
    } else if (entry.name.endsWith('.ts') && entry.name[0] === entry.name[0].toUpperCase()) {
      files.push(full);
    }
  }
  return files;
}

// Extract structured data from TypeScript source
function extractCard(source, filename) {
  // Find the super({ ... }) call
  const superMatch = source.match(/super\(\{([\s\S]*?)\}\s*\)\s*;?\s*\}/);
  if (!superMatch) return null;
  const body = superMatch[1];

  const result = {};

  // Name
  const nameMatch = body.match(/name:\s*CardName\.(\w+)/);
  if (!nameMatch) return null;
  // Convert SNAKE_CASE to Title Case
  const rawName = nameMatch[1];

  // Cost
  const costMatch = body.match(/cost:\s*(\d+)/);
  if (costMatch) result.cost = parseInt(costMatch[1]);

  // Tags
  const tagsMatch = body.match(/tags:\s*\[([\s\S]*?)\]/);
  if (tagsMatch) {
    const tagStr = tagsMatch[1];
    result.tags = [...tagStr.matchAll(/Tag\.(\w+)/g)].map(m => m[1].toLowerCase());
  }

  // Type
  const typeMatch = body.match(/type:\s*CardType\.(\w+)/);
  if (typeMatch) result.type = typeMatch[1];

  // Behavior block
  const behMatch = body.match(/behavior:\s*\{([\s\S]*?)\}(?:\s*,\s*(?:requirements|action|metadata|resourceType|victoryPoints))/);
  if (behMatch) {
    result.behavior = parseBehaviorBlock(behMatch[1]);
  }

  // Action block
  const actMatch = body.match(/\baction:\s*\{([\s\S]*?)\}(?:\s*,\s*(?:metadata|behavior|requirements|victoryPoints))/);
  if (actMatch) {
    result.action = parseActionBlock(actMatch[1]);
  }

  // Victory points
  const vpMatch = body.match(/victoryPoints:\s*(\{[\s\S]*?\}|\d+)/);
  if (vpMatch) {
    const vpStr = vpMatch[1];
    if (/^\d+$/.test(vpStr)) {
      result.vp = parseInt(vpStr);
    } else if (vpStr.includes('resourcesHere')) {
      const divMatch = vpStr.match(/divisor:\s*(\d+)/);
      result.vpPerResource = divMatch ? parseInt(divMatch[1]) : 1;
    } else if (vpStr.includes('tag:')) {
      const tagMatch = vpStr.match(/tag:\s*Tag\.(\w+)/);
      const perMatch = vpStr.match(/per:\s*(\d+)/);
      if (tagMatch) {
        result.vpPerTag = { tag: tagMatch[1].toLowerCase(), per: perMatch ? parseInt(perMatch[1]) : 1 };
      }
    }
  }

  // Resource type
  const resMatch = body.match(/resourceType:\s*CardResource\.(\w+)/);
  if (resMatch) result.resourceType = resMatch[1].toLowerCase();

  // Requirements
  const reqArrayMatch = body.match(/requirements:\s*\[([\s\S]*?)\]/);
  if (reqArrayMatch) {
    result.requirements = parseRequirementsArray(reqArrayMatch[1]);
  } else {
    const reqMatch = body.match(/requirements:\s*\{([\s\S]*?)\}/);
    if (reqMatch) {
      result.requirements = parseRequirements(reqMatch[1]);
    }
  }

  const cardDiscount = parseCardDiscount(body);
  if (cardDiscount != null) result.cardDiscount = cardDiscount;

  applyTradeRenderEffects(source, result);

  return result;
}

function parseBehaviorBlock(block) {
  const beh = {};

  // Production
  const prodMatch = block.match(/production:\s*\{([^}]+)\}/);
  if (prodMatch) {
    const prod = {};
    const prodStr = prodMatch[1];
    for (const [, key, val] of prodStr.matchAll(/(\w+):\s*(-?\d+)/g)) {
      prod[key] = parseInt(val);
    }
    if (Object.keys(prod).length > 0) beh.production = prod;
  }

  // Stock (direct resources)
  const stockMatch = block.match(/stock:\s*\{([^}]+)\}/);
  if (stockMatch) {
    const stock = {};
    for (const [, key, val] of stockMatch[1].matchAll(/(\w+):\s*(-?\d+)/g)) {
      stock[key === 'Resource.MEGACREDITS' ? 'megacredits' : key] = parseInt(val);
    }
    if (Object.keys(stock).length > 0) beh.stock = stock;
  }

  // Draw cards
  const drawMatch = block.match(/drawCard:\s*(\d+)/);
  if (drawMatch) beh.drawCard = parseInt(drawMatch[1]);

  // TR
  const trMatch = block.match(/\btr:\s*(\d+)/);
  if (trMatch) beh.tr = parseInt(trMatch[1]);

  // Global params
  const globalMatch = block.match(/global:\s*\{([^}]+)\}/);
  if (globalMatch) {
    const glob = {};
    for (const [, key, val] of globalMatch[1].matchAll(/(\w+):\s*(\d+)/g)) {
      glob[key] = parseInt(val);
    }
    if (Object.keys(glob).length > 0) beh.global = glob;
  }

  // Ocean
  const oceanMatch = block.match(/ocean:\s*(\d+)/);
  if (oceanMatch) beh.ocean = parseInt(oceanMatch[1]);

  // Greenery
  const greenMatch = block.match(/greenery:\s*(?:\{[^}]*\}|(\d+))/);
  if (greenMatch) beh.greenery = greenMatch[1] ? parseInt(greenMatch[1]) : 1;

  // City
  const cityMatch = block.match(/city:\s*(?:\{|true)/);
  if (cityMatch) beh.city = 1;

  // Tile (ocean_city etc.)
  const tileMatch = block.match(/tile:\s*\{[^}]*type:\s*TileType\.(\w+)/);
  if (tileMatch) {
    const tt = tileMatch[1];
    if (tt.includes('CITY') || tt.includes('CAPITAL')) beh.city = 1;
  }

  // Colony
  const coloniesBlock = extractObjectLiteral(block, 'colonies');
  if (coloniesBlock) {
    const colonies = {};
    const addTradeFleetMatch = coloniesBlock.match(/addTradeFleet:\s*(\d+)/);
    if (addTradeFleetMatch) {
      colonies.addTradeFleet = parseInt(addTradeFleetMatch[1], 10);
      beh.tradeFleet = colonies.addTradeFleet;
    }

    const tradeDiscountMatch = coloniesBlock.match(/tradeDiscount:\s*(\d+)/);
    if (tradeDiscountMatch) {
      colonies.tradeDiscount = parseInt(tradeDiscountMatch[1], 10);
      beh.tradeDiscount = colonies.tradeDiscount;
    }

    const tradeOffsetMatch = coloniesBlock.match(/tradeOffset:\s*(-?\d+)/);
    if (tradeOffsetMatch) {
      colonies.tradeOffset = parseInt(tradeOffsetMatch[1], 10);
      beh.tradeOffset = colonies.tradeOffset;
    }

    const buildColonyBlock = extractObjectLiteral(coloniesBlock, 'buildColony');
    if (buildColonyBlock !== null) {
      const buildColony = {};
      if (/allowDuplicates:\s*true/.test(buildColonyBlock)) buildColony.allowDuplicates = true;
      colonies.buildColony = buildColony;
      beh.colony = buildColony;
    }

    if (Object.keys(colonies).length > 0) beh.colonies = colonies;
  }

  // Decrease production
  const decProdMatch = block.match(/decreaseAnyProduction:\s*\{[^}]*count:\s*(\d+)/);
  if (decProdMatch) beh.decreaseAnyProduction = parseInt(decProdMatch[1]);

  // Remove plants
  const rmPlMatch = block.match(/removeAnyPlants:\s*(\d+)/);
  if (rmPlMatch) beh.removeAnyPlants = parseInt(rmPlMatch[1]);

  // Add resources
  const addResMatch = block.match(/addResources:\s*(\d+)/);
  if (addResMatch) beh.addResources = parseInt(addResMatch[1]);

  return beh;
}

function parseActionBlock(block) {
  const act = {};
  const drawMatch = block.match(/drawCard:\s*(\d+)/);
  if (drawMatch) act.drawCard = parseInt(drawMatch[1]);

  const trMatch = block.match(/\btr:\s*(\d+)/);
  if (trMatch) act.tr = parseInt(trMatch[1]);

  const addResMatch = block.match(/addResources:\s*(\d+)/);
  if (addResMatch) act.addResources = parseInt(addResMatch[1]);

  const stockMatch = block.match(/stock:\s*\{([^}]+)\}/);
  if (stockMatch) {
    const stock = {};
    for (const [, key, val] of stockMatch[1].matchAll(/(\w+):\s*(-?\d+)/g)) {
      stock[key] = parseInt(val);
    }
    if (Object.keys(stock).length > 0) act.stock = stock;
  }

  // spend
  const spendMatch = block.match(/spend:\s*\{([^}]+)\}/);
  if (spendMatch) {
    const spend = {};
    for (const [, key, val] of spendMatch[1].matchAll(/(\w+):\s*(\d+)/g)) {
      spend[key] = parseInt(val);
    }
    if (Object.keys(spend).length > 0) act.spend = spend;
  }

  const globalMatch = block.match(/global:\s*\{([^}]+)\}/);
  if (globalMatch) {
    const glob = {};
    for (const [, key, val] of globalMatch[1].matchAll(/(\w+):\s*(\d+)/g)) {
      glob[key] = parseInt(val);
    }
    if (Object.keys(glob).length > 0) act.global = glob;
  }

  const prodMatch = block.match(/production:\s*\{([^}]+)\}/);
  if (prodMatch) {
    const prod = {};
    for (const [, key, val] of prodMatch[1].matchAll(/(\w+):\s*(-?\d+)/g)) {
      prod[key] = parseInt(val);
    }
    if (Object.keys(prod).length > 0) act.production = prod;
  }

  return act;
}

function parseRequirements(block) {
  const reqs = {};
  for (const [, key, val] of block.matchAll(/(\w+):\s*(-?\d+)/g)) {
    reqs[key] = parseInt(val);
  }
  return reqs;
}

function parseRequirementsArray(block) {
  const reqs = [];
  const tagReq = block.match(/tag:\s*Tag\.(\w+)[\s\S]*?count:\s*(\d+)/);
  if (tagReq) {
    reqs.push({ tag: tagReq[1].toLowerCase(), count: parseInt(tagReq[2], 10) });
  }
  return reqs;
}

// ── Main ──

const cardFiles = findCardFiles(CARDS_DIR);
console.error(`Found ${cardFiles.length} card files`);

// Read CardName enum to map SNAKE_CASE → display name
const cardNameFile = path.join(TM_ROOT, 'src/common/cards/CardName.ts');
const cardNameSrc = fs.readFileSync(cardNameFile, 'utf8');
const nameMap = {};
for (const [, key, val] of cardNameSrc.matchAll(/(\w+)\s*=\s*'([^']+)'/g)) {
  nameMap[key] = val;
}
console.error(`CardName entries: ${Object.keys(nameMap).length}`);

const allCards = {};
let parsed = 0, failed = 0;

for (const file of cardFiles) {
  try {
    const src = fs.readFileSync(file, 'utf8');
    const card = extractCard(src, file);
    if (!card) { failed++; continue; }

    // Resolve name
    const rawName = src.match(/name:\s*CardName\.(\w+)/);
    if (!rawName) { failed++; continue; }
    const displayName = nameMap[rawName[1]] || rawName[1];

    allCards[displayName] = card;
    parsed++;
  } catch (e) {
    failed++;
  }
}

console.error(`Parsed: ${parsed}, Failed: ${failed}`);

// Output as JSON
console.log(JSON.stringify(allCards, null, 2));
