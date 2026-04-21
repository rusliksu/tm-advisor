/**
 * audit-score.js — Аудит scoreCard: детальный EV breakdown + поиск проблем
 *
 * Запуск: node scripts/audit-score.js
 *
 * Проверяет:
 *  1. Карты с BOTH parsed action data AND MANUAL_EV (потенциальный double-count)
 *  2. Карты со static VP в card_vp, которые scoreCard может пропустить
 *  3. MANUAL_EV perGen inconsistent с parsed data
 *  4. Негативные VP без учёта штрафа
 *  5. Карты с невыполнимыми requirements но высоким score
 *  6. take-that (decreaseAnyProduction / removeAnyPlants) без 3P penalty
 *  7. colony/tradeFleet в behavior (мёртвый код)
 */

const fs = require('fs');
const path = require('path');
const {resolveGeneratedExtensionPath} = require('./lib/generated-extension-data');

// ── Load data files using eval+const→var pattern ──

function loadJsData(relPath, varName) {
  var fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(__dirname, '..', relPath);
  var raw = fs.readFileSync(fullPath, 'utf8');
  // Replace const/let with var for eval compatibility
  var code = raw.replace(/\bconst\b/g, 'var').replace(/\blet\b/g, 'var');
  var fn = new Function(code + '\nreturn ' + varName + ';');
  return fn();
}

var TM_CARD_DATA = loadJsData(resolveGeneratedExtensionPath('card_data.js'), 'TM_CARD_DATA');
var TM_CARD_TAGS = loadJsData(resolveGeneratedExtensionPath('card_tags.js'), 'TM_CARD_TAGS');
var TM_CARD_VP = loadJsData(resolveGeneratedExtensionPath('card_vp.js'), 'TM_CARD_VP');
var TM_CARD_EFFECTS = loadJsData(resolveGeneratedExtensionPath('card_effects.json.js'), 'TM_CARD_EFFECTS');
var CARD_VARIANT_RULES = [
  { suffix: ':u', option: 'underworldExpansion' },
  { suffix: ':Pathfinders', option: 'pathfindersExpansion' },
  { suffix: ':ares', option: 'ares' },
  { suffix: ':promo', option: 'promoCardsOption' },
];

// Load tm-brain.js via require (it exports TM_BRAIN via module.exports)
var TM_BRAIN = require(path.resolve(__dirname, '..', 'extension/tm-brain.js'));
var brainRaw = fs.readFileSync(path.resolve(__dirname, '..', 'extension/tm-brain.js'), 'utf8');

// Load tag/global requirements
var tagReqsFile = resolveGeneratedExtensionPath('card_tag_reqs.js');
var tagReqsRaw = fs.readFileSync(tagReqsFile, 'utf8').replace(/\bconst\b/g, 'var');
var tagReqsFn = new Function(tagReqsRaw + '\nreturn { tagReqs: TM_CARD_TAG_REQS, globalReqs: TM_CARD_GLOBAL_REQS };');
var reqs = tagReqsFn();
var TM_CARD_TAG_REQS = reqs.tagReqs;
var TM_CARD_GLOBAL_REQS = reqs.globalReqs;

// Load discounts
var discountsFile = resolveGeneratedExtensionPath('synergy_tables.json.js');
var discountsRaw = fs.readFileSync(discountsFile, 'utf8').replace(/\bconst\b/g, 'var');
var discountsFn = new Function(discountsRaw + '\nreturn typeof TM_CARD_DISCOUNTS !== "undefined" ? TM_CARD_DISCOUNTS : {};');
var TM_CARD_DISCOUNTS = discountsFn();

// Inject card data in TM_BRAIN.setCardData order:
// (tags, vp, data, globalReqs, tagReqs, effects)
TM_BRAIN.setCardData(
  TM_CARD_TAGS,
  TM_CARD_VP,
  TM_CARD_DATA,
  TM_CARD_GLOBAL_REQS,
  TM_CARD_TAG_REQS,
  TM_CARD_EFFECTS
);

// ── Standard mid-game state (gen 5, 3P) ──

var state = {
  game: { generation: 5, temperature: -14, oxygen: 6, oxygenLevel: 6, oceans: 4, venusScaleLevel: 12 },
  thisPlayer: {
    megaCredits: 40, steel: 2, titanium: 1,
    tags: { building: 3, space: 2, science: 1, earth: 2, venus: 1, microbe: 1, plant: 1 },
    steelValue: 2, titaniumValue: 3
  },
  players: [{}, {}, {}]
};

// ── Extract MANUAL_EV from tm-brain source ──
// We need direct access to internal MANUAL_EV. Parse it from source.

var manualEvMatch = brainRaw.match(/var MANUAL_EV\s*=\s*\{([\s\S]*?)\n\s*\};/);
var MANUAL_EV = {};
if (manualEvMatch) {
  try {
    var meCode = 'var MANUAL_EV = {' + manualEvMatch[1] + '\n}; MANUAL_EV;';
    // Strip comments for eval
    meCode = meCode.replace(/\/\/[^\n]*/g, '');
    MANUAL_EV = eval('(' + '{\n' + manualEvMatch[1].replace(/\/\/[^\n]*/g, '') + '\n}' + ')');
  } catch(e) {
    console.error('WARNING: Could not parse MANUAL_EV from source:', e.message);
  }
}

var behOverridesMatch = brainRaw.match(/var _behOverrides\s*=\s*\{([\s\S]*?)\n\s*\};/);
var BEH_OVERRIDES = {};
if (behOverridesMatch) {
  try {
    BEH_OVERRIDES = eval('(' + '{\n' + behOverridesMatch[1].replace(/\/\/[^\n]*/g, '') + '\n}' + ')');
  } catch (e) {
    console.error('WARNING: Could not parse _behOverrides from source:', e.message);
  }
}

var actionReqMatch = brainRaw.match(/var ACTION_RESOURCE_REQ\s*=\s*\{([\s\S]*?)\n\s*\};/);
var ACTION_RESOURCE_REQ = {};
if (actionReqMatch) {
  try {
    ACTION_RESOURCE_REQ = eval('(' + '{\n' + actionReqMatch[1].replace(/\/\/[^\n]*/g, '') + '\n}' + ')');
  } catch (e) {
    console.error('WARNING: Could not parse ACTION_RESOURCE_REQ from source:', e.message);
  }
}

var MANUAL_SUPPLEMENTS_OK = {
  'GHG Factories': 'manual models heat->heat-prod action value on top of parsed production',
  'Shuttles': 'manual models space-card discount engine on top of parsed prod/vp',
  'Quantum Extractor': 'manual models space discount engine on top of parsed energy prod',
  'Meat Industry': 'manual models animal-tag trigger income on top of parsed MC prod',
  'Homeostasis Bureau': 'manual models city trigger value on top of parsed heat prod',
  'Solar Reflectors': 'manual models extra tempo/TR value on top of parsed heat production',
  'Trading Colony': 'manual models trade bonus on top of parsed MC prod',
  'Colonial Representation': 'manual models one-time MC per own colony; parser must not treat it as MC production'
};

// ── Extract constants from tm-brain source ──

var prodMcMatch = brainRaw.match(/var PROD_MC_VANILLA\s*=\s*(\{[^}]+\})/);
var PROD_MC = prodMcMatch ? eval('(' + prodMcMatch[1] + ')') : { megacredits:1,steel:2,titanium:3,plants:2.2,energy:1.3,heat:0.8 };

var stockMcMatch = brainRaw.match(/var STOCK_MC_VANILLA\s*=\s*(\{[^}]+\})/);
var STOCK_MC = stockMcMatch ? eval('(' + stockMcMatch[1] + ')') : { megacredits:1,steel:2,titanium:3,plants:1.1,energy:0.7,heat:0.8 };

var tagValMatch = brainRaw.match(/var TAG_VALUE\s*=\s*(\{[^}]+\})/);
var TAG_VALUE = tagValMatch ? eval('(' + tagValMatch[1] + ')') : {};


// ── Scoring helpers (reimplemented to get breakdown) ──

function vpMC(gensLeft) {
  if (gensLeft >= 6) return 2;
  if (gensLeft >= 3) return 5.5;
  return 10;
}

function trMC(gensLeft, redsTax) {
  return gensLeft + vpMC(gensLeft) - (redsTax || 0);
}

function remainingStepsFromState(st) {
  var g = (st && st.game) || {};
  var temp = typeof g.temperature === 'number' ? g.temperature : -30;
  var oxy = typeof g.oxygenLevel === 'number' ? g.oxygenLevel : (typeof g.oxygen === 'number' ? g.oxygen : 0);
  var oceans = typeof g.oceans === 'number' ? g.oceans : 0;
  var venus = typeof g.venusScaleLevel === 'number' ? g.venusScaleLevel : 0;

  var tempSteps = Math.max(0, Math.round((8 - temp) / 2));
  var oxySteps = Math.max(0, 14 - oxy);
  var oceanSteps = Math.max(0, 9 - oceans);
  var coreSteps = tempSteps + oxySteps + oceanSteps;
  if (coreSteps === 0) return 0;
  var venusSteps = Math.max(0, Math.round((30 - venus) / 2));
  return coreSteps + Math.round(venusSteps * 0.5);
}

function normalizeState(st) {
  var clone = JSON.parse(JSON.stringify(st || {}));
  clone.game = clone.game || {};
  if (clone.game.oxygenLevel == null && clone.game.oxygen != null) clone.game.oxygenLevel = clone.game.oxygen;
  if (clone.game.oxygen == null && clone.game.oxygenLevel != null) clone.game.oxygen = clone.game.oxygenLevel;
  return clone;
}

function isVariantOptionEnabled(rule, st) {
  var game = st && st.game;
  var opts = game && game.gameOptions;
  if (!rule) return false;
  if (rule.option === 'ares') {
    return !!(
      (game && game.ares) ||
      (opts && opts.ares) ||
      (opts && opts.aresExpansion) ||
      (opts && typeof opts.boardName === 'string' && opts.boardName.toLowerCase().indexOf('ares') >= 0)
    );
  }
  return !!(opts && opts[rule.option]);
}

function canonicalCardName(name) {
  return name;
}

function resolveVariantCardName(name, st) {
  if (!name) return name;
  if (/:u$|:Pathfinders$|:promo$|:ares$/.test(name)) return name;
  var opts = st && st.game && st.game.gameOptions;
  var game = st && st.game;
  if (!opts && !game) return name;
  for (var i = 0; i < CARD_VARIANT_RULES.length; i++) {
    var rule = CARD_VARIANT_RULES[i];
    if (!isVariantOptionEnabled(rule, st)) continue;
    var variantName = name + rule.suffix;
    if (TM_CARD_DATA[variantName] || TM_CARD_TAGS[variantName] || TM_CARD_VP[variantName] || TM_CARD_EFFECTS[variantName]) {
      return variantName;
    }
  }
  return name;
}

function getCardDataByName(name, st) {
  var resolvedName = resolveVariantCardName(name, st);
  return TM_CARD_DATA[resolvedName] || TM_CARD_DATA[name] || TM_CARD_DATA[canonicalCardName(name)] || {};
}

function getCardTagsByName(name, fallbackTags, st) {
  var resolvedName = resolveVariantCardName(name, st);
  return TM_CARD_TAGS[resolvedName] || TM_CARD_TAGS[name] || TM_CARD_TAGS[canonicalCardName(name)] || fallbackTags || [];
}

function getCardVPByName(name, st) {
  var resolvedName = resolveVariantCardName(name, st);
  return TM_CARD_VP[resolvedName] || TM_CARD_VP[name] || TM_CARD_VP[canonicalCardName(name)] || null;
}

function getCardEffectsByName(name, st) {
  var resolvedName = resolveVariantCardName(name, st);
  return TM_CARD_EFFECTS[resolvedName] || TM_CARD_EFFECTS[name] || TM_CARD_EFFECTS[canonicalCardName(name)] || {};
}

function hasCardDataByName(name, st) {
  var resolvedName = resolveVariantCardName(name, st);
  return Boolean(TM_CARD_DATA[resolvedName] || TM_CARD_DATA[name] || TM_CARD_DATA[canonicalCardName(name)]);
}

function hasCardEffectsByName(name, st) {
  var resolvedName = resolveVariantCardName(name, st);
  return Boolean(TM_CARD_EFFECTS[resolvedName] || TM_CARD_EFFECTS[name] || TM_CARD_EFFECTS[canonicalCardName(name)]);
}

function estimateGensLeft(st) {
  var norm = normalizeState(st);
  var gen = (norm && norm.game && norm.game.generation) || 5;
  var steps = remainingStepsFromState(norm);
  var totalSteps = 49;
  var numPlayers = (norm && norm.players) ? (norm.players.length || 3) : 3;
  var avgGameLen = numPlayers >= 4 ? 8 : (numPlayers >= 3 ? 9 : 10.5);
  var genBased = Math.max(1, avgGameLen - gen + 1);
  var stepsBased = Math.max(1, Math.round(steps / (totalSteps / avgGameLen)));
  var completionPct = steps > 0 ? Math.max(0, 1 - steps / totalSteps) : 1;
  return Math.max(1, Math.round(genBased * completionPct + stepsBased * (1 - completionPct)));
}

function estimateTriggersPerGen(triggerTag, tp, handCards) {
  var myTags = (tp && tp.tags) || {};
  var handTagCount = 0;
  handCards = handCards || [];

  for (var hci = 0; hci < handCards.length; hci++) {
    var hcName = handCards[hci].name || handCards[hci];
    var hcTags = getCardTagsByName(hcName, null, st);
    for (var hti = 0; hti < hcTags.length; hti++) {
      var ht = hcTags[hti];
      if (triggerTag === 'science' && ht === 'science') handTagCount++;
      else if (triggerTag === 'event' && ht === 'event') handTagCount++;
      else if (triggerTag === 'venus' && ht === 'venus') handTagCount++;
      else if (triggerTag === 'bio' && (ht === 'plant' || ht === 'animal' || ht === 'microbe')) handTagCount++;
      else if (triggerTag === 'space_event' && ht === 'space') handTagCount++;
    }
  }

  var baselines = { science: 0.4, event: 0.5, bio: 0.5, venus: 0.3, space_event: 0.2 };
  var baseline = baselines[triggerTag] || 0.3;
  var tableauBoost = 0;

  if (triggerTag === 'science') tableauBoost = Math.min(1, (myTags.science || 0) * 0.15);
  else if (triggerTag === 'event') tableauBoost = Math.min(0.5, (myTags.event || 0) * 0.1);
  else if (triggerTag === 'venus') tableauBoost = Math.min(0.8, (myTags.venus || 0) * 0.15);
  else if (triggerTag === 'bio') {
    var bioCount = (myTags.plant || 0) + (myTags.animal || 0) + (myTags.microbe || 0);
    tableauBoost = Math.min(1, bioCount * 0.1);
  } else if (triggerTag === 'space_event') {
    tableauBoost = Math.min(0.6, ((myTags.space || 0) * 0.05) + ((myTags.event || 0) * 0.1));
  }

  return baseline + tableauBoost + Math.min(1.5, handTagCount * 0.2);
}

function calcReqPenalty(cardName, tags, st) {
  var reqPenalty = 0;
  var norm = normalizeState(st);
  var g2r = (norm && norm.game) || {};
  var tp = (norm && norm.thisPlayer) || {};
  var myTags = tp.tags || {};

  var globalReqs = TM_CARD_GLOBAL_REQS[cardName];
  if (globalReqs) {
    for (var grk in globalReqs) {
      var grObj = globalReqs[grk];
      var grMin = typeof grObj === 'object' ? grObj.min : grObj;
      var grMax = typeof grObj === 'object' ? grObj.max : undefined;
      var grCurrent = grk === 'oceans' ? (g2r.oceans || 0) :
        grk === 'oxygen' ? (g2r.oxygenLevel || 0) :
        grk === 'temperature' ? (g2r.temperature || -30) :
        grk === 'venus' ? (g2r.venusScaleLevel || 0) : 0;
      if (grMin !== undefined && grCurrent < grMin) reqPenalty += (grMin - grCurrent) * 3;
      if (grMax !== undefined && grCurrent > grMax) reqPenalty += 50;
    }
  }

  var tagReqs = TM_CARD_TAG_REQS[cardName];
  if (tagReqs) {
    var handTagCounts = {};
    var handCards = tp.cardsInHand || [];
    for (var hci = 0; hci < handCards.length; hci++) {
      var hcName = handCards[hci].name || handCards[hci];
      if (hcName === cardName) continue;
      var hcTags = getCardTagsByName(hcName, null, st);
      for (var hti = 0; hti < hcTags.length; hti++) {
        handTagCounts[hcTags[hti]] = (handTagCounts[hcTags[hti]] || 0) + 1;
      }
    }

    for (var trk in tagReqs) {
      var needed = tagReqs[trk];
      var have = myTags[trk] || 0;
      var selfTagCount = 0;
      for (var sti = 0; sti < tags.length; sti++) {
        if (tags[sti] === trk) selfTagCount++;
      }
      var totalAfter = have + selfTagCount;
      if (totalAfter < needed) {
        var gap = needed - totalAfter;
        var handHelp = Math.min(gap, handTagCounts[trk] || 0);
        var effectiveGap = gap - handHelp * 0.6;
        reqPenalty += Math.max(0, effectiveGap) * 8;
      }
    }
  }

  return reqPenalty;
}

function detailedBreakdown(cardName, st) {
  st = normalizeState(st);
  var cd = getCardDataByName(cardName, st);
  var tags = getCardTagsByName(cardName, cd.tags || [], st);
  var beh = cd.behavior || {};
  var act = cd.action || {};
  var vpInfo = cd.vp || getCardVPByName(cardName, st) || null;
  var discount = cd.cardDiscount || null;
  var effects = getCardEffectsByName(cardName, st);
  var cost = effects.c || 0;
  var isPatched = st && st._botName === 'Beta';

  if (BEH_OVERRIDES[cardName]) {
    beh = {};
    act = {};
  }

  var steps = remainingStepsFromState(st);
  var gensLeft = estimateGensLeft(st);
  var tp = (st && st.thisPlayer) || {};
  var myTags = tp.tags || {};
  var redsTax = 0;
  var reqPenalty = calcReqPenalty(cardName, tags, st);
  var g2 = (st && st.game) || {};
  var prodCompound = isPatched ? (gensLeft >= 8 ? 1.3 : (gensLeft >= 5 ? 1.15 : 1.0)) : 1.0;
  var prodLatePenalty = gensLeft <= 1 ? 0.15 : (gensLeft <= 2 ? 0.4 : (gensLeft <= 3 ? 0.65 : 1.0));
  var tempStepsLeft = Math.max(0, Math.round((8 - (g2.temperature || -30)) / 2));
  var oxyStepsLeft = Math.max(0, 14 - (g2.oxygenLevel || 0));
  var heatDevalue = tempStepsLeft <= 1 ? 0.2 : (tempStepsLeft <= 3 ? 0.5 : 1.0);
  var plantDevalue = oxyStepsLeft <= 1 ? 0.6 : (oxyStepsLeft <= 3 ? 0.8 : 1.0);

  var breakdown = {
    production: 0,
    stock: 0,
    globals: 0,
    tr: 0,
    ocean: 0,
    greenery: 0,
    city: 0,
    colony: 0,
    drawCard: 0,
    vp: 0,
    action: 0,
    discount: 0,
    manualEV: 0,
    tags: 0,
    steelTiValue: 0,
    decreaseAnyProd: 0,
    removeAnyPlants: 0,
    reqPenalty: 0,
    cost: cost
  };

  // Production
  var prod = beh.production;
  if (prod) {
    for (var pk in prod) {
      var pVal = PROD_MC[pk] || 1;
      if (pk === 'heat') pVal *= heatDevalue;
      if (pk === 'plants') pVal *= plantDevalue;
      var delta = prod[pk];
      if (delta < 0) breakdown.production += delta * pVal * gensLeft * 1.5;
      else breakdown.production += delta * pVal * gensLeft * prodCompound * prodLatePenalty;
    }
  }

  // Stock
  var stock = beh.stock;
  if (stock) {
    for (var sk in stock) {
      breakdown.stock += stock[sk] * (STOCK_MC[sk] || 1);
    }
  }

  // Globals
  var tempoBonus = isPatched ? 0 : (gensLeft >= 5 ? 8 : (gensLeft >= 3 ? 6 : 4));
  var glob = beh.global;
  if (glob) {
    var trRaises = 0;
    for (var gk in glob) trRaises += glob[gk];
    breakdown.globals += trRaises * (trMC(gensLeft, redsTax) + tempoBonus);
  }
  if (beh.tr) breakdown.tr += beh.tr * trMC(gensLeft, redsTax);
  if (beh.ocean) breakdown.ocean += (typeof beh.ocean === 'number' ? beh.ocean : 1) * (trMC(gensLeft, redsTax) + tempoBonus + 4);
  if (beh.greenery) breakdown.greenery += (typeof beh.greenery === 'number' ? beh.greenery : 1) * (trMC(gensLeft, redsTax) + tempoBonus + vpMC(gensLeft) + 3);

  // City
  if (beh.city) breakdown.city += vpMC(gensLeft) * 2 + 2;

  // Colony / tradeFleet
  if (beh.colony) breakdown.colony += 7;

  // Draw
  var drawVal = Math.min(6, 2.5 + gensLeft * 0.35);
  if (beh.drawCard) breakdown.drawCard += beh.drawCard * drawVal;

  // VP
  if (vpInfo) {
    if (vpInfo.type === 'static') {
      breakdown.vp += (vpInfo.vp || 0) * vpMC(gensLeft);
    } else if (vpInfo.type === 'per_resource') {
      var expectedRes = Math.max(1, gensLeft - 2);
      breakdown.vp += (expectedRes / (vpInfo.per || 1)) * vpMC(gensLeft) * 0.8;
    } else if (vpInfo.type === 'per_tag') {
      var tagCount = (myTags[vpInfo.tag] || 0) + 2;
      breakdown.vp += (tagCount / (vpInfo.per || 1)) * vpMC(gensLeft);
    } else if (vpInfo.type === 'per_colony' || vpInfo.type === 'per_city') {
      breakdown.vp += (5 / (vpInfo.per || 1)) * vpMC(gensLeft);
    } else if (vpInfo.type === 'special') {
      breakdown.vp += vpMC(gensLeft) * 2;
    }
  }

  // Action (only if no MANUAL_EV)
  var hasManualEV = !!MANUAL_EV[cardName];
  if (!hasManualEV) {
    if (act.addResources && vpInfo && vpInfo.type === 'per_resource') {
      // skip — already in VP
    } else if (act.addResources) {
      breakdown.action += gensLeft * 1;
    }
    if (act.drawCard) breakdown.action += gensLeft * act.drawCard * 3;
    if (act.stock) {
      for (var ask in act.stock) {
        breakdown.action += gensLeft * (act.stock[ask] || 0) * (STOCK_MC[ask] || 1) * 0.5;
      }
    }
    if (act.production) {
      for (var apk in act.production) {
        breakdown.action += gensLeft * (act.production[apk] || 0) * (PROD_MC[apk] || 1) * 0.5;
      }
    }
    if (act.tr) breakdown.action += gensLeft * act.tr * trMC(gensLeft, redsTax) * 0.5;
    if (act.global) {
      for (var agk in act.global) {
        breakdown.action += gensLeft * (act.global[agk] || 0) * trMC(gensLeft, redsTax) * 0.5;
      }
    }
  }

  // Discount
  if (discount && discount.amount) {
    var cardsPerGen = discount.tag ? 1 : 2.5;
    breakdown.discount += discount.amount * cardsPerGen * gensLeft;
  }

  // decreaseAnyProduction
  if (beh.decreaseAnyProduction) {
    breakdown.decreaseAnyProd += beh.decreaseAnyProduction.count * 1.5;
  }
  if (beh.removeAnyPlants) {
    breakdown.removeAnyPlants += beh.removeAnyPlants * 0.5;
  }

  // Tags
  var isEvent = tags.indexOf('event') >= 0;
  var hasBuilding = tags.indexOf('building') >= 0;
  var hasSpace = tags.indexOf('space') >= 0;

  if (!isEvent) {
    for (var tgi = 0; tgi < tags.length; tgi++) {
      var tg = tags[tgi];
      breakdown.tags += TAG_VALUE[tg] || 0.5;
      var existing = myTags[tg] || 0;
      if (existing >= 5) breakdown.tags += 5;
      else if (existing >= 3) breakdown.tags += 3;
      else if (existing >= 1) breakdown.tags += 1;
    }
  } else {
    breakdown.tags += 1;
  }
  if (tags.length === 0) breakdown.tags -= 3;

  // Steel/ti premium
  if (hasBuilding && (tp.steel || 0) > 0) {
    var steelVal = tp.steelValue || 2;
    breakdown.steelTiValue += Math.min(tp.steel * steelVal, cost);
  }
  if (hasSpace && (tp.titanium || 0) > 0) {
    var tiVal = tp.titaniumValue || 3;
    breakdown.steelTiValue += Math.min(tp.titanium * tiVal, cost);
  }

  // MANUAL_EV
  var manual = MANUAL_EV[cardName];
  if (manual) {
    var perGenMult = 1;
    if (manual.perGen && ACTION_RESOURCE_REQ[cardName]) {
      var reqRes = ACTION_RESOURCE_REQ[cardName];
      var hasProd = false;
      if (reqRes === 'energy') {
        hasProd = (tp.energyProduction || 0) >= 1 || (tp.energy || 0) >= 3;
      } else if (reqRes === 'heat') {
        hasProd = (tp.heatProduction || 0) >= 1 || (tp.energyProduction || 0) >= 1 || (tp.heat || 0) >= 8;
      } else if (reqRes === 'titanium') {
        hasProd = (tp.titaniumProduction || 0) >= 1 || (tp.titanium || 0) >= 2;
      } else if (reqRes === 'plants_or_steel') {
        hasProd = (tp.plantProduction || 0) >= 1 || (tp.steelProduction || 0) >= 1 || (tp.plants || 0) >= 4 || (tp.steel || 0) >= 2;
      }
      if (!hasProd) perGenMult = 0.3;
    }
    if (manual.perGen) breakdown.manualEV += manual.perGen * gensLeft * perGenMult;
    if (manual.once) breakdown.manualEV += manual.once;
    if (manual.perTrigger && manual.triggerTag) {
      var handCards = tp.cardsInHand || [];
      var triggersPerGen = estimateTriggersPerGen(manual.triggerTag, tp, handCards);
      breakdown.manualEV += manual.perTrigger * triggersPerGen * gensLeft;
    }
  }

  if (cardName === 'Gyropolis') {
    var gyroTags = (myTags.venus || 0) + (myTags.earth || 0);
    var gyroProd = Math.max(0, gyroTags - 2);
    breakdown.manualEV += gyroProd * (PROD_MC.megacredits || 1) * gensLeft * prodLatePenalty;
  }

  if (cardName === 'Iron Extraction Center' || cardName === 'Titanium Extraction Center') {
    var miningRate = g2.miningRate;
    if (typeof miningRate !== 'number') miningRate = g2.moonMiningRate;
    if (typeof miningRate !== 'number') miningRate = Math.max(2, Math.min(6, ((g2.generation || 5) - 1)));
    var prodSteps = Math.max(0, Math.floor(miningRate / 2));
    var moonProdType = cardName === 'Iron Extraction Center' ? 'steel' : 'titanium';
    breakdown.manualEV += prodSteps * (PROD_MC[moonProdType] || 1) * gensLeft * prodCompound * prodLatePenalty;
  }

  breakdown.reqPenalty -= reqPenalty;

  // Total EV
  var totalEV = 0;
  for (var bk in breakdown) {
    if (bk !== 'cost') totalEV += breakdown[bk];
  }
  breakdown.totalEV = totalEV;
  breakdown.netEV = Math.round((totalEV - cost) * 10) / 10;

  // Also get the official scoreCard result for comparison
  breakdown.scoreCardResult = TM_BRAIN.scoreCard({ name: cardName, cost: cost }, st);

  return breakdown;
}

// ══════════════════════════════════════════════════════════════
// AUDIT CHECKS
// ══════════════════════════════════════════════════════════════

var issues = {
  CRITICAL: [],
  WARNING: [],
  INFO: []
};

function addIssue(severity, card, description, details) {
  issues[severity].push({ card: card, description: description, details: details || '' });
}

var allCardNames = Object.keys(TM_CARD_DATA);
console.log('Total cards in card_data: ' + allCardNames.length);
console.log('Total cards in MANUAL_EV: ' + Object.keys(MANUAL_EV).length);
console.log('Total cards in card_vp: ' + Object.keys(TM_CARD_VP).length);
console.log('Total cards in card_effects: ' + Object.keys(TM_CARD_EFFECTS).length);
console.log('');

// ── CHECK 1: Cards with BOTH parsed action AND MANUAL_EV ──
// The guard (hasManualEV) should prevent double-count, but check if MANUAL_EV
// covers cards that also have parsed action data — the guard works, but are
// the MANUAL_EV values reasonable given what's being skipped?

allCardNames.forEach(function(name) {
  var cd = getCardDataByName(name, state);
  var act = cd.action || {};
  var hasAction = act.drawCard || act.stock || act.production || act.tr || act.global || act.addResources;
  var manual = MANUAL_EV[name];

  if (hasAction && manual) {
    // Guard works — parsed action is skipped. But flag for review.
    var parsedActionDesc = [];
    if (act.drawCard) parsedActionDesc.push('drawCard:' + act.drawCard);
    if (act.stock) parsedActionDesc.push('stock:' + JSON.stringify(act.stock));
    if (act.production) parsedActionDesc.push('prod:' + JSON.stringify(act.production));
    if (act.tr) parsedActionDesc.push('tr:' + act.tr);
    if (act.global) parsedActionDesc.push('global:' + JSON.stringify(act.global));
    if (act.addResources) parsedActionDesc.push('addRes:' + JSON.stringify(act.addResources));

    var manualDesc = manual.perGen ? 'perGen:' + manual.perGen : '';
    if (manual.once) manualDesc += (manualDesc ? ' + ' : '') + 'once:' + manual.once;

    addIssue('INFO', name,
      'Has BOTH parsed action AND MANUAL_EV (guard active, parsed action skipped)',
      'Parsed: [' + parsedActionDesc.join(', ') + '] | Manual: [' + manualDesc + ']');
  }
});

// ── CHECK 2: Negative VP cards where penalty may not be captured ──

Object.keys(TM_CARD_VP).forEach(function(name) {
  var vpInfo = getCardVPByName(name, state);
  if (!vpInfo) return;
  if (vpInfo.type === 'static' && vpInfo.vp < 0) {
    var bd = detailedBreakdown(name, state);
    // Use the same gensLeft as scoreCard to get the right vpMC
    var stepsForVp = remainingStepsFromState(state);
    var rateForVp = Math.max(4, Math.min(8, ((state.players || []).length || 3) * 2));
    var gensLeftForVp = Math.max(1, Math.ceil(stepsForVp / rateForVp));
    var expectedVpPenalty = vpInfo.vp * vpMC(gensLeftForVp);

    if (Math.abs(bd.vp) < 0.01) {
      // VP penalty completely missing — real problem
      addIssue('CRITICAL', name,
        'Negative VP (' + vpInfo.vp + ' VP) NOT penalized at all',
        'VP contribution in score: 0 | Expected penalty: ' + expectedVpPenalty.toFixed(1) + ' MC');
    } else if (Math.abs(bd.vp - expectedVpPenalty) > 0.5) {
      // Penalty exists but wrong magnitude
      addIssue('WARNING', name,
        'Negative VP (' + vpInfo.vp + ' VP) penalty magnitude mismatch',
        'VP contribution: ' + bd.vp.toFixed(1) + ' | Expected: ' + expectedVpPenalty.toFixed(1) + ' (vpMC=' + vpMC(gensLeftForVp) + ', gensLeft=' + gensLeftForVp + ')');
    }
    // Check if negative VP card still scores high
    if (bd.scoreCardResult > 20) {
      addIssue('INFO', name,
        'Negative VP card (' + vpInfo.vp + ' VP) still scores high: ' + bd.scoreCardResult.toFixed(1),
        'VP penalty=' + bd.vp.toFixed(1) + ' but overall EV is very positive');
    }
  }
});

// ── CHECK 3: MANUAL_EV inconsistency with parsed production ──
// If a card has production in behavior AND perGen in MANUAL_EV,
// the production is counted PLUS the manual perGen — potential overcount?

Object.keys(MANUAL_EV).forEach(function(name) {
  var manual = MANUAL_EV[name];
  var cd = getCardDataByName(name, state);
  var beh = cd.behavior || {};

  // Check if card has significant production AND manual perGen
  if (manual.perGen && beh.production) {
    var prodNames = Object.keys(beh.production);
    var significantProd = prodNames.filter(function(pk) { return Math.abs(beh.production[pk]) >= 2; });

    if (significantProd.length > 0) {
      var steps = remainingStepsFromState(state);
      var ratePerGen = 6;
      var gensLeft = Math.max(1, Math.ceil(steps / ratePerGen));

      var prodValue = 0;
      prodNames.forEach(function(pk) {
        var pv = PROD_MC[pk] || 1;
        var d = beh.production[pk];
        prodValue += d * pv * gensLeft * (d < 0 ? 1.2 : 1);
      });

      if (BEH_OVERRIDES[name]) {
        addIssue('INFO', name,
          'Has parsed production + MANUAL_EV, but parser is disabled by _behOverrides in scoreCard',
          'Production value: ' + prodValue.toFixed(1) + ' MC | Manual perGen: ' + manual.perGen + ' * ' + gensLeft + ' = ' + (manual.perGen * gensLeft).toFixed(1) + ' MC');
      } else if (MANUAL_SUPPLEMENTS_OK[name]) {
        addIssue('INFO', name,
          'Has parsed production + MANUAL_EV, but manual is a known supplement',
          MANUAL_SUPPLEMENTS_OK[name] + ' | Production: ' + prodValue.toFixed(1) + ' MC | Manual: ' + (manual.perGen * gensLeft).toFixed(1) + ' MC');
      } else {
        addIssue('WARNING', name,
          'Has BOTH parsed production AND MANUAL_EV perGen — production counted separately from manual',
          'Production value: ' + prodValue.toFixed(1) + ' MC | Manual perGen: ' + manual.perGen + ' * ' + gensLeft + ' = ' + (manual.perGen * gensLeft).toFixed(1) + ' MC | Combined: ' + (prodValue + manual.perGen * gensLeft).toFixed(1) + ' MC');
      }
    }
  }

  // Check if MANUAL_EV card exists in card_data at all
  if (!hasCardDataByName(name, state) && !hasCardEffectsByName(name, state)) {
    addIssue('WARNING', name,
      'In MANUAL_EV but NOT in card_data or card_effects — orphan entry',
      'Manual: perGen=' + (manual.perGen || 0) + ' once=' + (manual.once || 0));
  }
});

// ── CHECK 4: Cards with decreaseAnyProduction without proper 3P penalty ──

allCardNames.forEach(function(name) {
  var cd = getCardDataByName(name, state);
  var beh = cd.behavior || {};

  if (beh.decreaseAnyProduction) {
    var count = beh.decreaseAnyProduction.count || 0;
    var bd = detailedBreakdown(name, state);

    // In 3P, take-that should be penalized. The code gives count * 1.5 MC bonus.
    // This is a small bonus — good for 3P (nerfed). But verify it's not too high.
    if (bd.decreaseAnyProd > 5) {
      addIssue('WARNING', name,
        'decreaseAnyProduction bonus seems high for 3P: ' + bd.decreaseAnyProd.toFixed(1) + ' MC',
        'count=' + count + ' | Expected max ~3 MC in 3P');
    }
  }

  if (beh.removeAnyPlants) {
    var rmPlants = beh.removeAnyPlants;
    var bd2 = detailedBreakdown(name, state);

    if (bd2.removeAnyPlants > 5) {
      addIssue('WARNING', name,
        'removeAnyPlants bonus seems high for 3P: ' + bd2.removeAnyPlants.toFixed(1) + ' MC',
        'plants=' + rmPlants + ' | Expected max ~4 MC in 3P');
    }
  }
});

// ── CHECK 5: Colony/tradeFleet in behavior (dead code) ──

allCardNames.forEach(function(name) {
  var cd = getCardDataByName(name, state);
  var beh = cd.behavior || {};

  if (beh.colony) {
    addIssue('CRITICAL', name,
      'Has colony in behavior — this data should not exist (dead code audit #7)',
      'colony=' + beh.colony);
  }
  if (beh.tradeFleet) {
    addIssue('CRITICAL', name,
      'Has tradeFleet in behavior — this data should not exist (dead code audit #7)',
      'tradeFleet=' + beh.tradeFleet);
  }
});

// ── CHECK 6: Cards with requirements that make them unplayable in mid-game state ──
// Use card_effects minG field as proxy for requirements

Object.keys(TM_CARD_EFFECTS).forEach(function(name) {
  var fx = getCardEffectsByName(name, state);
  if (!fx || fx.c == null) return; // skip non-project cards

  // minG is minimum generation requirement (proxy for global requirements)
  // In our state: gen 5, temp -14, oxy 6, oceans 4, venus 12
  // Cards requiring temp >= 0 (minG >= 7), or oxy >= 9, etc. might be unplayable

  if (fx.minG && fx.minG > 7) {
    var bd = detailedBreakdown(name, state);
    if (bd.scoreCardResult > 25) {
      addIssue('WARNING', name,
        'Requires late-game conditions (minG=' + fx.minG + ') but scored high: ' + bd.scoreCardResult,
        'Score breakdown: prod=' + bd.production.toFixed(1) + ' vp=' + bd.vp.toFixed(1) + ' manual=' + bd.manualEV.toFixed(1));
    }
  }
});

// ── CHECK 7: Static VP in card_vp that scoreCard might miss ──
// Look for cards with static VP in card_vp but where the breakdown.vp is 0

Object.keys(TM_CARD_VP).forEach(function(name) {
  var vpInfo = getCardVPByName(name, state);
  if (!vpInfo) return;
  if (!hasCardDataByName(name, state) && !hasCardEffectsByName(name, state)) return; // unknown card

  var bd = detailedBreakdown(name, state);

  // If card_vp says static VP but breakdown.vp is 0, something's wrong
  if (vpInfo.type === 'static' && vpInfo.vp !== 0 && Math.abs(bd.vp) < 0.01) {
    addIssue('CRITICAL', name,
      'Has static VP (' + vpInfo.vp + ') in card_vp but VP contribution is 0 in scoreCard',
      'scoreCard result: ' + bd.scoreCardResult);
  }
});

// ── CHECK 8: MANUAL_EV cards that also have parsed discount ──

allCardNames.forEach(function(name) {
  var cd = getCardDataByName(name, state);
  var manual = MANUAL_EV[name];
  var discount = cd.cardDiscount;

  if (manual && discount && discount.amount) {
    // hasManualEV guard skips discount calculation — but is MANUAL_EV perGen
    // accounting for the discount value that's being skipped?
    var steps = remainingStepsFromState(state);
    var ratePerGen = 6;
    var gensLeft = Math.max(1, Math.ceil(steps / ratePerGen));
    var cardsPerGen = discount.tag ? 1 : 2.5;
    var skippedDiscount = discount.amount * cardsPerGen * gensLeft;

    addIssue('INFO', name,
      'Has MANUAL_EV AND cardDiscount — discount calc is skipped (guard active)',
      'Manual perGen=' + (manual.perGen || 0) + ' | Skipped discount value=' + skippedDiscount.toFixed(1) +
      ' MC (' + discount.amount + ' MC * ' + cardsPerGen + ' cards/gen * ' + gensLeft + ' gens)');
  }
});

// ── CHECK 9: Cards in MANUAL_EV not in card_data (might not get scored) ──

Object.keys(MANUAL_EV).forEach(function(name) {
  if (!Object.keys(getCardDataByName(name, state)).length) {
    // Card is not in card_data but IS in MANUAL_EV
    // scoreCard looks up _cardData[name] which would be empty
    // MANUAL_EV still applies because it checks by name
    // But all other components (production, stock, globals, VP) would be 0
    var manual = MANUAL_EV[name];
    var fx = getCardEffectsByName(name, state);
    if (fx && (fx.mp || fx.sp || fx.tp || fx.pp || fx.ep || fx.hp)) {
      addIssue('WARNING', name,
        'In MANUAL_EV + card_effects has production, but NOT in card_data — production not scored',
        'card_effects production: ' + JSON.stringify({mp:fx.mp,sp:fx.sp,tp:fx.tp,pp:fx.pp,ep:fx.ep,hp:fx.hp}) +
        ' | MANUAL_EV: perGen=' + (manual.perGen || 0) + ' once=' + (manual.once || 0));
    }
  }
});

// ── CHECK 10: Breakdown mismatch — our breakdown vs scoreCard ──
// Verify our breakdown matches scoreCard (no corp synergy in standard state)

var mismatches = [];
allCardNames.forEach(function(name) {
  var fx = getCardEffectsByName(name, state);
  if (!fx || fx.c == null) return;
  var bd = detailedBreakdown(name, state);
  var diff = Math.abs(bd.netEV - bd.scoreCardResult);
  if (diff > 0.2) {
    mismatches.push({ name: name, breakdown: bd.netEV, scoreCard: bd.scoreCardResult, diff: diff });
  }
});

if (mismatches.length > 0) {
  mismatches.sort(function(a, b) { return b.diff - a.diff; });
  mismatches.slice(0, 10).forEach(function(m) {
    addIssue('WARNING', m.name,
      'Breakdown (' + m.breakdown + ') != scoreCard (' + m.scoreCard + '), diff=' + m.diff.toFixed(1),
      'May indicate missing component in our audit breakdown');
  });
}

// ══════════════════════════════════════════════════════════════
// OUTPUT
// ══════════════════════════════════════════════════════════════

console.log('══════════════════════════════════════════════════════════════');
console.log(' AUDIT RESULTS — scoreCard EV analysis');
console.log(' State: gen 5, 3P, temp=-14, oxy=6, oceans=4, venus=12');
console.log('══════════════════════════════════════════════════════════════');
console.log('');

var severities = ['CRITICAL', 'WARNING', 'INFO'];
severities.forEach(function(sev) {
  var list = issues[sev];
  if (list.length === 0) return;

  var icon = sev === 'CRITICAL' ? '[!!]' : sev === 'WARNING' ? '[!]' : '[i]';
  console.log('── ' + sev + ' (' + list.length + ') ──────────────────────────────────');
  console.log('');

  list.forEach(function(issue) {
    console.log('  ' + icon + ' ' + issue.card);
    console.log('      ' + issue.description);
    if (issue.details) console.log('      ' + issue.details);
    console.log('');
  });
});

// ── Summary ──
console.log('══════════════════════════════════════════════════════════════');
console.log(' SUMMARY');
console.log('══════════════════════════════════════════════════════════════');
console.log('  CRITICAL: ' + issues.CRITICAL.length);
console.log('  WARNING:  ' + issues.WARNING.length);
console.log('  INFO:     ' + issues.INFO.length);
console.log('  Breakdown mismatches (>0.2): ' + mismatches.length);
console.log('');

// ── Top/Bottom 10 cards by scoreCard ──
var scored = [];
allCardNames.forEach(function(name) {
  var fx = getCardEffectsByName(name, state);
  if (!fx || fx.c == null || fx.c === 0) return; // skip corps/preludes (cost 0)
  var s = TM_BRAIN.scoreCard({ name: name, cost: fx.c }, state);
  scored.push({ name: name, score: s, cost: fx.c });
});
scored.sort(function(a, b) { return b.score - a.score; });

console.log('── TOP 10 by scoreCard ──');
scored.slice(0, 10).forEach(function(c) {
  var bd = detailedBreakdown(c.name, state);
  var parts = [];
  if (bd.production) parts.push('prod:' + bd.production.toFixed(0));
  if (bd.globals) parts.push('glob:' + bd.globals.toFixed(0));
  if (bd.vp) parts.push('vp:' + bd.vp.toFixed(0));
  if (bd.manualEV) parts.push('manual:' + bd.manualEV.toFixed(0));
  if (bd.action) parts.push('act:' + bd.action.toFixed(0));
  if (bd.tags) parts.push('tags:' + bd.tags.toFixed(0));
  console.log('  ' + c.score.toFixed(1).padStart(6) + '  ' + c.name + ' (cost ' + c.cost + ') [' + parts.join(', ') + ']');
});

console.log('');
console.log('── BOTTOM 10 by scoreCard ──');
scored.slice(-10).forEach(function(c) {
  var bd = detailedBreakdown(c.name, state);
  var parts = [];
  if (bd.production) parts.push('prod:' + bd.production.toFixed(0));
  if (bd.vp) parts.push('vp:' + bd.vp.toFixed(0));
  if (bd.manualEV) parts.push('manual:' + bd.manualEV.toFixed(0));
  if (bd.tags) parts.push('tags:' + bd.tags.toFixed(0));
  console.log('  ' + c.score.toFixed(1).padStart(6) + '  ' + c.name + ' (cost ' + c.cost + ') [' + parts.join(', ') + ']');
});
