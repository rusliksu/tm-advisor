// TM_BRAIN — единое аналитическое ядро для Terraforming Mars.
// Isomorphic: работает в Node.js (require) и Browser (window.TM_BRAIN).
// Объединяет логику из smartbot.js и advisor-core.js.

/* eslint-disable */
;(function(root) {
  'use strict';

  var TM_BRAIN_CORE = (typeof module !== 'undefined' && module.exports)
    ? require('./shared/brain-core')
    : (root.TM_BRAIN_CORE || null);
  var TM_CARD_VARIANTS = null;
  if (typeof module !== 'undefined' && module.exports) {
    try {
      TM_CARD_VARIANTS = require('./shared/card-variants');
    } catch (_variantErr) {
      TM_CARD_VARIANTS = require('../packages/tm-brain-js/src/card-variants');
    }
  }
  var TM_MANUAL_EV = null;
  if (typeof module !== 'undefined' && module.exports) {
    try {
      TM_MANUAL_EV = require('./shared/manual-ev');
    } catch (_manualEvErr) {
      TM_MANUAL_EV = require('../packages/tm-brain-js/src/manual-ev');
    }
  } else {
    TM_MANUAL_EV = root.TM_MANUAL_EV || null;
  }
  var sharedEstimateTriggersPerGen = TM_BRAIN_CORE && TM_BRAIN_CORE.estimateTriggersPerGen;
  var sharedPAtLeastOne = TM_BRAIN_CORE && TM_BRAIN_CORE.pAtLeastOne;
  var sharedBuildEndgameTiming = TM_BRAIN_CORE && TM_BRAIN_CORE.buildEndgameTiming;
  var sharedEstimateGensLeftFromState = TM_BRAIN_CORE && TM_BRAIN_CORE.estimateGensLeftFromState;
  var sharedAnalyzePass = TM_BRAIN_CORE && TM_BRAIN_CORE.analyzePass;
  var sharedRankHandCards = TM_BRAIN_CORE && TM_BRAIN_CORE.rankHandCards;
  var sharedAnalyzeActions = TM_BRAIN_CORE && TM_BRAIN_CORE.analyzeActions;
  var sharedAnalyzeDeck = TM_BRAIN_CORE && TM_BRAIN_CORE.analyzeDeck;
  var sharedCountTagsInHand = TM_BRAIN_CORE && TM_BRAIN_CORE.countTagsInHand;
  var sharedCountEffectivePlayedTagTotal = TM_BRAIN_CORE && TM_BRAIN_CORE.countEffectivePlayedTagTotal;
  var sharedScoreCardMetaBonuses = TM_BRAIN_CORE && TM_BRAIN_CORE.scoreCardMetaBonuses;
  var sharedScoreCardVPInfo = TM_BRAIN_CORE && TM_BRAIN_CORE.scoreCardVPInfo;
  var sharedScoreRecurringActionValue = TM_BRAIN_CORE && TM_BRAIN_CORE.scoreRecurringActionValue;
  var sharedScoreCardDiscountValue = TM_BRAIN_CORE && TM_BRAIN_CORE.scoreCardDiscountValue;
  var sharedScoreHandDiscountValue = TM_BRAIN_CORE && TM_BRAIN_CORE.scoreHandDiscountValue;
  var sharedScoreCityTimingValue = TM_BRAIN_CORE && TM_BRAIN_CORE.scoreCityTimingValue;
  var sharedScoreProductionTimingValue = TM_BRAIN_CORE && TM_BRAIN_CORE.scoreProductionTimingValue;
  var sharedScoreCardTimingShapeValue = TM_BRAIN_CORE && TM_BRAIN_CORE.scoreCardTimingShapeValue;
  var sharedScoreAcquiredCompanyTimingValue = TM_BRAIN_CORE && TM_BRAIN_CORE.scoreAcquiredCompanyTimingValue;
  var sharedScoreCardDisruptionValue = TM_BRAIN_CORE && TM_BRAIN_CORE.scoreCardDisruptionValue;
  var sharedScoreGlobalTileValue = TM_BRAIN_CORE && TM_BRAIN_CORE.scoreGlobalTileValue;
  var sharedEstimateAresPlacementDelta = TM_BRAIN_CORE && TM_BRAIN_CORE.estimateAresPlacementDelta;
  var sharedScoreNamedCardRuntimeAdjustments = TM_BRAIN_CORE && TM_BRAIN_CORE.scoreNamedCardRuntimeAdjustments;
  var sharedScoreRequirementPenalty = (TM_BRAIN_CORE && TM_BRAIN_CORE.scoreRequirementPenalty) || localScoreRequirementPenalty;
  var sharedApplyManualEVAdjustments = TM_BRAIN_CORE && TM_BRAIN_CORE.applyManualEVAdjustments;
  var sharedEstimateScoreCardTimingInterpolated = TM_BRAIN_CORE && TM_BRAIN_CORE.estimateScoreCardTimingInterpolated;
  var sharedBuildScoreCardContext = TM_BRAIN_CORE && TM_BRAIN_CORE.buildScoreCardContext;
  var sharedBuildProductionValuationContext = TM_BRAIN_CORE && TM_BRAIN_CORE.buildProductionValuationContext;
  var normalizeOpeningHandBias = (TM_BRAIN_CORE && TM_BRAIN_CORE.normalizeOpeningHandBias) || function(rawBias) {
    if (typeof rawBias !== 'number' || !isFinite(rawBias) || rawBias === 0) return 0;
    var scaled = Math.round(rawBias * 0.6);
    if (scaled === 0) scaled = rawBias > 0 ? 1 : -1;
    return Math.max(-5, Math.min(5, scaled));
  };
  var isOpeningHandContext = (TM_BRAIN_CORE && TM_BRAIN_CORE.isOpeningHandContext) || function(state) {
    if (!state) return false;
    if (state._openingHand != null) return !!state._openingHand;
    var game = state.game || {};
    var phase = game.phase || '';
    if (phase === 'initial_drafting' || phase === 'corporationsDrafting') return true;
    var generation = typeof game.generation === 'number' ? game.generation : 99;
    if (generation > 1) return false;
    var tp = state.thisPlayer || {};
    var tableau = tp.tableau || [];
    return tableau.length === 0;
  };

  function localEstimateAverageGameLengthFromState(state, options) {
    var opts = options || {};
    var g = (state && state.game) || {};
    var playerCount = typeof opts.playerCount === 'number'
      ? opts.playerCount
      : ((state && state.players) ? (state.players.length || 3) : 3);
    var gameOptions = g.gameOptions || {};
    var avgGameLen = playerCount <= 2 ? 11.5 : (playerCount === 3 ? 9 : (playerCount === 4 ? 8.5 : 8));
    var hasSolarPhase = !!(gameOptions.solarPhaseOption || gameOptions.worldGovernmentTerraforming);
    var noSolarPhase = gameOptions.solarPhaseOption === false || gameOptions.worldGovernmentTerraforming === false;
    if (noSolarPhase && !hasSolarPhase) {
      avgGameLen += playerCount <= 2 ? 1.5 : (playerCount === 3 ? 1 : 0.5);
    }
    if (gameOptions.preludeExtension === false) avgGameLen += 1;
    if (gameOptions.requiresVenusTrackCompletion) avgGameLen += 0.5;
    if (hasSolarPhase && playerCount >= 4) avgGameLen -= 0.2;
    return Math.max(7.5, Math.min(13.5, avgGameLen));
  }

  function localGlobalRequirementCurrent(param, game) {
    var g = game || {};
    if (param === 'oceans') return typeof g.oceans === 'number' ? g.oceans : 0;
    if (param === 'oxygen') return typeof g.oxygenLevel === 'number' ? g.oxygenLevel : 0;
    if (param === 'temperature') return typeof g.temperature === 'number' ? g.temperature : -30;
    if (param === 'venus') return typeof g.venusScaleLevel === 'number' ? g.venusScaleLevel : 0;
    return 0;
  }

  function localGlobalRequirementStepGap(param, fromValue, toValue) {
    var diff = Math.max(0, Number(toValue) - Number(fromValue));
    if (!isFinite(diff) || diff <= 0) return 0;
    if (param === 'temperature' || param === 'venus') return Math.ceil(diff / 2);
    return Math.ceil(diff);
  }

  function localScoreGlobalRequirementGap(param, stepGap, state) {
    if (!stepGap) return 0;
    var avgLen = localEstimateAverageGameLengthFromState(state);
    var avgRate = param === 'venus' ? (15 / avgLen) : (42 / avgLen);
    var delayGens = Math.max(1, Math.ceil(stepGap / Math.max(1, avgRate)));
    var raw = stepGap * 1.5 + delayGens * 2;
    var cap = param === 'venus' ? 30 : 36;
    return Math.min(cap, raw);
  }

  function localCountHandTagsForRequirement(handCards, selfName, getCardTags) {
    var counts = {};
    var lookupCardTags = getCardTags || function() { return []; };
    for (var hci = 0; hci < (handCards || []).length; hci++) {
      var hcName = handCards[hci] && (handCards[hci].name || handCards[hci]);
      if (!hcName || hcName === selfName) continue;
      var hcTags = lookupCardTags(hcName) || [];
      for (var hti = 0; hti < hcTags.length; hti++) {
        counts[hcTags[hti]] = (counts[hcTags[hti]] || 0) + 1;
      }
    }
    return counts;
  }

  function localScoreRequirementPenalty(options) {
    var opts = options || {};
    var state = opts.state || {};
    var game = state.game || {};
    var name = opts.name || '';
    var globalReqs = opts.globalReqs || null;
    var tagReqs = opts.tagReqs || null;
    var myTags = opts.myTags || {};
    var handCards = opts.handCards || [];
    var getCardTags = opts.getCardTags || function() { return []; };
    var globalPenalty = 0;
    var tagPenalty = 0;
    var details = [];

    if (globalReqs) {
      for (var grk in globalReqs) {
        var grObj = globalReqs[grk];
        var grMin = typeof grObj === 'object' ? grObj.min : grObj;
        var grMax = typeof grObj === 'object' ? grObj.max : undefined;
        var current = localGlobalRequirementCurrent(grk, game);
        if (grMin !== undefined && current < grMin) {
          var minGap = localGlobalRequirementStepGap(grk, current, grMin);
          var minPenalty = localScoreGlobalRequirementGap(grk, minGap, state);
          globalPenalty += minPenalty;
          details.push({ type: 'global-min', key: grk, steps: minGap, penalty: minPenalty });
        }
        if (grMax !== undefined && current > grMax) {
          var maxGap = localGlobalRequirementStepGap(grk, grMax, current);
          var maxPenalty = 50 + Math.min(20, maxGap * 3);
          globalPenalty += maxPenalty;
          details.push({ type: 'global-max', key: grk, steps: maxGap, penalty: maxPenalty });
        }
      }
    }

    if (tagReqs) {
      var handTagCounts = localCountHandTagsForRequirement(handCards, name, getCardTags);
      var handCredit = typeof opts.handTagCredit === 'number' ? opts.handTagCredit : 0.75;
      var perMissingTag = typeof opts.perMissingTagPenalty === 'number' ? opts.perMissingTagPenalty : 8;
      for (var trk in tagReqs) {
        var needed = tagReqs[trk];
        var have = myTags[trk] || 0;
        var wildHave = trk !== 'wild' ? (myTags.wild || 0) : 0;
        var gap = needed - have - wildHave;
        if (gap > 0) {
          var exactHandHelp = handTagCounts[trk] || 0;
          var wildHandHelp = trk !== 'wild' ? (handTagCounts.wild || 0) : 0;
          var handHelp = Math.min(gap, exactHandHelp + wildHandHelp);
          var effectiveGap = Math.max(0, gap - handHelp * handCredit);
          var localPenalty = effectiveGap * perMissingTag;
          tagPenalty += localPenalty;
          details.push({
            type: 'tag',
            key: trk,
            missing: gap,
            handHelp: handHelp,
            effectiveGap: effectiveGap,
            penalty: localPenalty,
          });
        }
      }
    }

    return {
      penalty: globalPenalty + tagPenalty,
      globalPenalty: globalPenalty,
      tagPenalty: tagPenalty,
      details: details,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // CARD DATA INJECTION (set from outside)
  // In Node: TM_BRAIN.setCardData(require('./card_tags'), require('./card_vp'))
  // In Browser: mapped from TM_CARD_EFFECTS at init
  // ══════════════════════════════════════════════════════════════

  var _cardTags = {};
  var _cardVP = {};
  var _cardData = {};
  var _cardGlobalReqs = {};  // global parameter requirements (oxygen, temperature, oceans, venus)
  var _cardTagReqs = {};     // tag requirements (earth:2, science:3, etc.)
  var _cardEffects = {};     // card effects (cost, production, etc.) from card_effects.json.js
  // Variant data loaded from data/card_variants.js (TM_VARIANT_RATING_OVERRIDES, TM_CARD_VARIANT_RULES)
  var _VARIANT_RATING_OVERRIDES = (TM_CARD_VARIANTS && TM_CARD_VARIANTS.TM_VARIANT_RATING_OVERRIDES) ||
    (typeof TM_VARIANT_RATING_OVERRIDES !== 'undefined' ? TM_VARIANT_RATING_OVERRIDES : {});
  var _CARD_VARIANT_RULES = (TM_CARD_VARIANTS && TM_CARD_VARIANTS.TM_CARD_VARIANT_RULES) ||
    (typeof TM_CARD_VARIANT_RULES !== 'undefined' ? TM_CARD_VARIANT_RULES : []);
  var _OVERLAY_NAME_ALIASES = {
    'Ecoline': 'EcoLine',
    'EcoLine': 'EcoLine',
    'Phobolog': 'PhoboLog',
    'PhoboLog': 'PhoboLog',
    'Septum Tribus': 'Septem Tribus',
    'Septem Tribus': 'Septem Tribus',
    'Morning Star Inc': 'Morning Star Inc.',
    'Morning Star Inc.': 'Morning Star Inc.',
  };
  var _OVERLAY_RATINGS = (function() {
    if (root && root.TM_RATINGS) return root.TM_RATINGS;
    if (!(typeof module !== 'undefined' && module.exports)) return null;
    try {
      var fs = require('fs');
      var path = require('path');
      var ratingsPath = path.resolve(__dirname, '..', 'packages', 'tm-data', 'generated', 'extension', 'ratings.json.js');
      var raw = fs.readFileSync(ratingsPath, 'utf8').replace(/\bconst\b/g, 'var');
      return (new Function(raw + '\nreturn TM_RATINGS;'))();
    } catch (_err) {
      return null;
    }
  })();

  function setCardData(cardTags, cardVP, cardData, cardGlobalReqs, cardTagReqs, cardEffects) {
    if (cardTags) _cardTags = cardTags;
    if (cardVP) _cardVP = cardVP;
    if (cardData) _cardData = cardData;
    if (cardGlobalReqs) _cardGlobalReqs = cardGlobalReqs;
    if (cardTagReqs) _cardTagReqs = cardTagReqs;
    if (cardEffects) _cardEffects = cardEffects;
  }

  // Shared utils from data/card_variants.js
  var baseCardName = (TM_CARD_VARIANTS && TM_CARD_VARIANTS.tmBaseCardName) ||
    (typeof tmBaseCardName !== 'undefined' ? tmBaseCardName : function(n) { return n; });

  function isVariantOptionEnabled(rule, state) {
    var fn = (TM_CARD_VARIANTS && TM_CARD_VARIANTS.tmIsVariantOptionEnabled) ||
      (typeof tmIsVariantOptionEnabled !== 'undefined' ? tmIsVariantOptionEnabled : null);
    if (!fn) return false;
    var game = state && state.game;
    var opts = game && game.gameOptions;
    return fn(rule, game, opts);
  }

  function resolveVariantCardName(name, state) {
    if (!name) return name;
    if (/:u$|:Pathfinders$|:promo$/.test(name)) return name;
    var opts = state && state.game && state.game.gameOptions;
    var game = state && state.game;
    if (!opts && !game) return name;
    for (var i = 0; i < _CARD_VARIANT_RULES.length; i++) {
      var rule = _CARD_VARIANT_RULES[i];
      if (!isVariantOptionEnabled(rule, state)) continue;
      var variantName = name + rule.suffix;
      if (_cardTags[variantName] || _cardData[variantName] || _cardVP[variantName] || _cardEffects[variantName]) {
        return variantName;
      }
    }
    return name;
  }

  function mergeCardStruct(baseObj, variantObj) {
    var merged = {};
    var k;
    for (k in baseObj) merged[k] = baseObj[k];
    for (k in variantObj) merged[k] = variantObj[k];
    if (baseObj.behavior || variantObj.behavior) {
      merged.behavior = {};
      for (k in (baseObj.behavior || {})) merged.behavior[k] = baseObj.behavior[k];
      for (k in (variantObj.behavior || {})) merged.behavior[k] = variantObj.behavior[k];
    }
    if (baseObj.action || variantObj.action) {
      merged.action = {};
      for (k in (baseObj.action || {})) merged.action[k] = baseObj.action[k];
      for (k in (variantObj.action || {})) merged.action[k] = variantObj.action[k];
    }
    if (baseObj.vp || variantObj.vp) {
      merged.vp = {};
      for (k in (baseObj.vp || {})) merged.vp[k] = baseObj.vp[k];
      for (k in (variantObj.vp || {})) merged.vp[k] = variantObj.vp[k];
    }
    return merged;
  }

  function getCardDataByName(name, state) {
    var resolvedName = resolveVariantCardName(name, state);
    var baseName = baseCardName(resolvedName || name);
    var variantData = _cardData[resolvedName] || _cardData[name] || _cardData[baseCardName(name)] || null;
    var baseData = _cardData[baseName] || null;
    if (variantData && baseData && resolvedName !== baseName) return mergeCardStruct(baseData, variantData);
    return variantData || baseData || {};
  }

  function getCardTagsByName(name, fallbackTags, state) {
    var resolvedName = resolveVariantCardName(name, state);
    return _cardTags[resolvedName] || _cardTags[name] || _cardTags[baseCardName(name)] || fallbackTags || [];
  }

  function getCardVPByName(name, state) {
    var resolvedName = resolveVariantCardName(name, state);
    return _cardVP[resolvedName] || _cardVP[name] || _cardVP[baseCardName(name)] || null;
  }

  function getCardEffectsByName(name, state) {
    var resolvedName = resolveVariantCardName(name, state);
    var baseName = baseCardName(resolvedName || name);
    var variantEffects = _cardEffects[resolvedName] || _cardEffects[name] || _cardEffects[baseCardName(name)] || null;
    var baseEffects = _cardEffects[baseName] || null;
    if (variantEffects && baseEffects && resolvedName !== baseName) return mergeCardStruct(baseEffects, variantEffects);
    return variantEffects || baseEffects || {};
  }

  function getOverlayRatingByName(name, state) {
    if (!_OVERLAY_RATINGS || !name) return null;
    var resolvedName = resolveVariantCardName(name, state);
    var baseName = baseCardName(resolvedName || name);
    var aliasName = _OVERLAY_NAME_ALIASES[resolvedName] || _OVERLAY_NAME_ALIASES[name] || _OVERLAY_NAME_ALIASES[baseName] || null;
    var baseRating = _OVERLAY_RATINGS[resolvedName] || _OVERLAY_RATINGS[name] || _OVERLAY_RATINGS[baseName] || (aliasName ? _OVERLAY_RATINGS[aliasName] : null) || null;
    var override = _VARIANT_RATING_OVERRIDES[resolvedName];
    return override ? Object.assign({}, baseRating || {}, override) : baseRating;
  }

  function getOpeningHandBiasForName(name, state) {
    var overlayRating = getOverlayRatingByName(name, state);
    if (!overlayRating || !isOpeningHandContext(state)) return 0;
    return normalizeOpeningHandBias(overlayRating.o);
  }

  function getOverlayRatingScore(name, state, fallbackScore) {
    var overlayRating = getOverlayRatingByName(name, state);
    if (!overlayRating || typeof overlayRating.s !== 'number') return fallbackScore;
    return overlayRating.s + getOpeningHandBiasForName(name, state);
  }

  // ══════════════════════════════════════════════════════════════
  // CARD CATEGORY SETS
  // ══════════════════════════════════════════════════════════════

  var VP_CARDS = new Set([
    'Birds', 'Fish', 'Predators', 'Ants', 'Tardigrades', 'Animals', 'Livestock',
    'Bees', 'Moose', 'Space Whales', 'Pets', 'Small Animals', 'Penguins',
    'Jovian Lanterns', 'Venusian Animals', 'GHG Factories', 'Viral Enhancers',
    'Regolith Eaters', 'Extreme-Cold Fungus', 'Nitrophilic Moss', 'Symbiotic Fungus',
    'Decomposers', 'Wetlands', 'Kelp Farming', 'Cartel', 'Dirigibles',
    'Stratospheric Birds', 'Caretaker Contract', 'Polyphemos',
  ]);

  var ENGINE_CARDS = new Set([
    'Earth Catapult', 'Warp Drive', 'Anti-Gravity Technology', 'AI Central',
    'Research Outpost', 'Martian Rails', 'Interplanetary Trade', 'Business Network',
    'Mars University', 'Olympus Conference', 'Optimal Aerobraking', 'Media Archives',
    'Standard Technology', 'Space Station', 'Toll Station',
    'Solar Logistics', 'Earth Office', 'Shuttles', 'Sky Docks',
  ]);

  var CITY_CARDS = new Set([
    'Capital', 'Noctis City', 'Domed Crater', 'Underground City', 'Open City',
    'Immigrant City', 'Phobos Space Haven', 'Ganymede Colony', 'Luna Metropolis',
    'Urbanized Area', 'Magnetic Field Generators', 'Early Settlement',
    'Self-Sufficient Settlement', 'Stratopolis', 'Martian Zoo', 'Refugee Camps',
    'Cultural Metropolis', 'City',
  ]);

  var OFFBOARD_CITY_CARDS = new Set([
    'Ganymede Colony', 'Phobos Space Haven', 'Luna Metropolis',
    'Stratopolis', 'Stanford Torus', 'Dawn City', 'Maxwell Base',
    'Venera Base', 'Dyson Screens',
  ]);

  var PROD_CARDS = new Set([
    'Immigrant City', 'Mining Guild', 'Fuel Synthesis', 'Noctis City',
    'Domed Crater', 'Phobos Space Haven', 'Space Elevator', 'Ironworks',
    'Steelworks', 'Ore Processor', 'Geothermal Power', 'Tropical Resort',
    'Electro Catapult', 'Mohole Area', 'Arctic Algae', 'Windmills',
    'Tundra Farming', 'Open City', 'Underground City', 'Rotator Impacts',
    'Caretaker Contract', 'Hired Raiders', 'Mining Area', 'Mining Rights',
    'Power Supply Consortium', 'Wave Power', 'Mangrove', 'Plantation',
    'Cartel', 'Media Group', 'Sponsors', 'Earth Office', 'Heavy Taxation',
    'Rover Construction', 'Great Dam', 'Magnetic Field Generators',
    'Strip Mine', 'Kelp Farming', 'Livestock', 'Satellites', 'Quantum Extractor',
    'Standard Technology', 'Toll Station', 'Space Station', 'Titan Shuttles',
    'Luna Governor', 'Energy Market', 'Potatoes', 'Moss', 'Snow Algae',
    'Sulphur-Eating Bacteria', 'Venus Soils', 'Thermophiles', 'Corroder Suits',
    'Spin-Inducing Asteroid', 'Water to Venus', 'GHG Import from Venus',
    'Sulfur Exports', 'Venus Governor',
    'Asteroid Mining Consortium', 'Building Industries', 'Insulation',
    'Power Grid', 'Solar Power', 'Energy Tapping', 'Acquired Space Agency',
    'Power Infrastructure', 'Gyropolis', 'Titan Floating Launch-Pad',
    'Productive Outpost', 'Mining Colony',
  ]);

  var DYNAMIC_VP_CARDS = new Set([
    'Birds', 'Fish', 'Predators', 'Livestock', 'Penguins', 'Venusian Animals',
    'Stratospheric Birds',
    'Pets', 'Small Animals', 'Herbivores', 'Ecological Zone', 'Floating Habs',
    'Sub-zero Salt Fish', 'Refugee Camps',
    'Ants', 'Decomposers', 'Tardigrades', 'Extremophiles',
    'Jovian Lanterns', 'Dirigibles',
    'Physics Complex',
    'Ganymede Colony', 'Io Mining Industries', 'Water Import From Europa',
    'Immigration Shuttles', 'Immigrant City',
    'Capital', 'Commercial District', 'Search For Life', 'Security Fleet',
  ]);

  var ANIMAL_VP_CARDS = new Set([
    'Birds', 'Fish', 'Predators', 'Animals', 'Livestock', 'Bees', 'Moose',
    'Penguins', 'Small Animals', 'Space Whales', 'Pets',
  ]);

  var MICROBE_VP_CARDS = new Set([
    'Ants', 'Tardigrades', 'Decomposers', 'Viral Enhancers',
    'Regolith Eaters', 'Extreme-Cold Fungus', 'Nitrophilic Moss', 'Symbiotic Fungus',
    'GHG Factories', 'Extremophiles', 'Venusian Insects',
  ]);

  var FLOATER_VP_CARDS = new Set([
    'Jovian Lanterns', 'Dirigibles', 'Stratospheric Birds', 'Venusian Animals',
  ]);

  function isOffBoardCityCard(name) {
    return OFFBOARD_CITY_CARDS.has(name);
  }

  // ══════════════════════════════════════════════════════════════
  // STATIC DATA
  // ══════════════════════════════════════════════════════════════

  var COLONY_TRADE = {
    Luna:      { res: 'mc',        qty: [1, 2, 4, 7, 10, 13, 17] },
    Callisto:  { res: 'energy',    qty: [0, 2, 3, 5, 7, 10, 13] },
    Ceres:     { res: 'steel',     qty: [1, 2, 3, 4, 6, 8, 10] },
    Enceladus: { res: 'microbes',  qty: [0, 1, 2, 3, 4, 4, 5] },
    Ganymede:  { res: 'plants',    qty: [0, 1, 2, 3, 4, 5, 6] },
    Io:        { res: 'heat',      qty: [2, 3, 4, 6, 8, 10, 13] },
    Miranda:   { res: 'animals',   qty: [0, 1, 1, 2, 2, 3, 3] },
    Pluto:     { res: 'cards',     qty: [0, 1, 2, 2, 3, 3, 4] },
    Titan:     { res: 'floaters',  qty: [0, 1, 1, 2, 3, 3, 4] },
    Triton:    { res: 'titanium',  qty: [0, 1, 1, 2, 3, 4, 5] },
    Leavitt:   { res: 'cards',     qty: [0, 1, 1, 2, 2, 3, 3] },
    Europa:    { res: 'production',qty: [1, 1, 1, 1, 1, 1, 1] },
    // Community colonies
    Titania:   { res: 'vp',        qty: [2, 2, 2, 1, 1, 0, 0] },
    Iapetus:   { res: 'tr',        qty: [0, 0, 0, 1, 1, 1, 2] },
    Mercury:   { res: 'mc',        qty: [4, 4, 4, 8, 8, 12, 12] },  // 1 prod: heat/heat/heat/steel/steel/ti/ti → MC equiv
    Hygiea:    { res: 'mc',        qty: [3, 3, 2, 5, 5, 6, 9] },    // steal 3: MC/MC/heat/energy/plants/steel/ti → MC equiv
    Pallas:    { res: 'delegates', qty: [1, 1, 1, 2, 2, 2, 3] },
    Venus:     { res: 'floaters',  qty: [0, 0, 0, 1, 2, 3, 4] },    // floaters to Venus card
    // Pathfinders
    'Iapetus II': { res: 'data',  qty: [0, 1, 2, 3, 4, 5, 6] },
  };

  var COLONY_BUILD_PRIORITY = [
    'Luna', 'Europa', 'Ganymede', 'Miranda', 'Pluto', 'Leavitt',
    'Titan', 'Enceladus', 'Ceres', 'Triton', 'Callisto', 'Io',
  ];

  var PREF_CORPS = [
    'Interplanetary Cinematics', 'CrediCor', 'Tharsis Republic', 'Vitor',
    'Point Luna', 'Saturn Systems', 'Ecoline', 'Teractor', 'Helion',
    'Inventrix', 'Poseidon', 'Manutech', 'Stormcraft Incorporated',
    'Septum Tribus', 'Pristar', 'Lakefront Resorts', 'Utopia Invest',
    'Terralabs Research',
  ];

  var PREF_PRELUDES = [
    'Great Aquifer', 'Supply Drop', 'Metal-Rich Asteroid', 'UNMI Contractor',
    'Experimental Forest', 'Eccentric Sponsor', 'Metals Company',
    'Aquifer Turbines', 'Allied Banks', 'Research Network',
  ];

  var STATIC_VP = {
    'Interstellar Colony Ship': 4, 'Earth Elevator': 4, 'Declaration of Independence': 4,
    'Advanced Ecosystems': 3, 'Anti-Gravity Technology': 3, 'Phobos Space Haven': 3,
    'Dawn City': 3, 'Maxwell Base': 3, 'Class-action Lawsuit': 3,
    'Asteroid Mining': 2, 'Callisto Penal Mines': 2, 'Earth Catapult': 2,
    'Farming': 2, 'Gene Repair': 2, 'Lake Marineris': 2, 'Large Convoy': 2,
    'Methane From Titan': 2, 'Space Elevator': 2, 'Terraforming Ganymede': 2,
    'Tropical Resort': 2, 'Tundra Farming': 2, 'Pioneer Settlement': 2,
    'Red Spot Observatory': 2, 'Sky Docks': 2, 'Titan Air-scrapping': 2,
    'Warp Drive': 2, 'Public Celebrations': 2, 'Atalanta Planitia Lab': 2,
    'Freyja Biodomes': 2, 'Io Sulphur Research': 2, 'Luna Metropolis': 2,
    'Luxury Foods': 2, 'City Parks': 2, 'Orbital Cleanup': 2, 'Stanford Torus': 2,
    'Sub-Crust Measurements': 2, 'Anti-trust Crackdown': 2, 'Nanofoundry': 2,
    'Neutrinograph': 2, 'Geological Expedition': 2, 'Lunar Embassy': 2,
    'Martian Nature Wonders': 2, 'Nobel Prize': 2, 'L1 Trade Terminal': 2,
    'Venus Allies': 2, 'Breathing Filters': 2, 'Colonizer Training Camp': 2,
    'Adaptation Technology': 1, 'AI Central': 1, 'Artificial Lake': 1,
    'Asteroid Mining Consortium': 1, 'Beam From A Thorium Asteroid': 1,
    'Domed Crater': 1, 'Dust Seals': 1, 'Electro Catapult': 1,
    'Eos Chasma National Park': 1, 'Food Factory': 1, 'Great Dam': 1,
    'Kelp Farming': 1, 'Lagrange Observatory': 1, 'Lightning Harvest': 1,
    'Mangrove': 1, 'Mars University': 1, 'Medical Lab': 1, 'Miranda Resort': 1,
    'Natural Preserve': 1, 'Noctis Farming': 1, 'Olympus Conference': 1,
    'Open City': 1, 'Rad-Suits': 1, 'Research': 1, 'Rover Construction': 1,
    'Shuttles': 1, 'Soil Factory': 1, 'Solar Power': 1, 'Space Station': 1,
    'Tectonic Stress Power': 1, 'Trans-Neptune Probe': 1, 'Trees': 1,
    'Vesta Shipyard': 1, 'Wave Power': 1, 'Windmills': 1, 'Zeppelins': 1,
    'House Printing': 1, 'Martian Survey': 1, 'SF Memorial': 1,
    'Airliners': 1, 'Community Services': 1, 'Cryo-Sleep': 1,
    'Ecology Research': 1, 'Galilean Waystation': 1,
    'Jupiter Floating Station': 1, 'Martian Zoo': 1, 'Molecular Printing': 1,
    'Nitrogen from Titan': 1, 'Quantum Communications': 1, 'Solar Probe': 1,
    'Titan Floating Launch-pad': 1, 'Titan Shuttles': 1,
    'Diaspora Movement': 1, 'Parliament Hall': 1,
    'Aqueduct Systems': 1, 'Carbon Nanosystems': 1, 'Crash Site Cleanup': 1,
    'Cutting Edge Technology': 1, 'Hi-Tech Lab': 1, 'Hospitals': 1,
    'Interplanetary Trade': 1, 'Jovian Embassy': 1, 'Outdoor Sports': 1,
    'Public Baths': 1, 'Public Plans': 1, 'Rego Plastics': 1,
    'Saturn Surfing': 1, 'Solar Logistics': 1, 'Supermarkets': 1,
    'Aerial Mappers': 1, 'Aerosport Tournament': 1, 'Atmoscoop': 1,
    'Solarnet': 1, 'Sponsored Academies': 1, 'Venusian Plants': 1,
    'Venus Waystation': 1, 'Moon Tether': 1, 'Orbital Power Grid': 1,
    'Asteroid Resources': 1, 'Ceres Spaceport': 1, 'Charity Donation': 1,
    'Controlled Bloom': 1, 'Dyson Screens': 1, 'Huygens Observatory': 1,
    'Interplanetary Transport': 1, 'Secret Labs': 1, 'Wetlands': 1,
    'Nuclear Zone': -2, 'Bribed Committee': -2, 'Corporate Stronghold': -2,
    'Biomass Combustors': -1, 'Energy Tapping': -1, 'Flooding': -1,
    'Hackers': -1, 'Heat Trappers': -1, 'Indentured Workers': -1,
    'Aerial Lenses': -1, 'Conscription': -1, 'Heavy Taxation': -1,
  };

  // ══════════════════════════════════════════════════════════════
  // PAYMENT
  // ══════════════════════════════════════════════════════════════

  var PAY_ZERO = (TM_BRAIN_CORE && TM_BRAIN_CORE.PAY_ZERO) || {
    heat: 0, megacredits: 0, steel: 0, titanium: 0, plants: 0,
    microbes: 0, floaters: 0, lunaArchivesScience: 0, spireScience: 0,
    seeds: 0, auroraiData: 0, graphene: 0, kuiperAsteroids: 0
  };

  function countResourceCardsWithType(tableau, resourceType) {
    if (!Array.isArray(tableau) || !resourceType) return 0;
    var target = String(resourceType).toLowerCase();
    var count = 0;
    for (var i = 0; i < tableau.length; i++) {
      var card = tableau[i] || {};
      if ((card.resources || 0) <= 0) continue;
      var data = getCardDataByName(card.name) || {};
      var cardResourceType = String(data.resourceType || card.resourceType || '').toLowerCase();
      if (cardResourceType === target) count++;
    }
    return count;
  }

  function getMegaCredits(player) {
    return player && player.megaCredits != null
      ? player.megaCredits
      : (player && player.megacredits != null ? player.megacredits : 0);
  }

  function adjustSpecialCardPayment(pay, amount, state, wfOrOpts, cardName) {
    var tp = (state && state.thisPlayer) || {};
    var payRes = pay || {};
    var selectedCardName = cardName || (wfOrOpts && wfOrOpts.card) || '';
    var mcKey = Object.prototype.hasOwnProperty.call(payRes, 'megaCredits') ? 'megaCredits' : 'megacredits';
    var availableMC = getMegaCredits(tp);
    var wfRes = wfOrOpts || {};
    var adjustSpendAll = function(resourceKey, resourceType, unitValue) {
      if ((payRes[resourceKey] || 0) <= 0) return;
      var available = wfRes[resourceKey] || tp[resourceKey] || 0;
      if (available <= 0) return;
      if ((payRes[resourceKey] || 0) < available) return;
      if (countResourceCardsWithType(tp.tableau || [], resourceType) > 1) return;
      payRes[resourceKey] = Math.max(0, available - 1);
      var spentDelta = available - payRes[resourceKey];
      if (spentDelta <= 0) return;
      payRes[mcKey] = Math.max(0, Math.min((payRes[mcKey] || 0) + (spentDelta * unitValue), availableMC));
    };
    if (selectedCardName === 'Stratospheric Birds') adjustSpendAll('floaters', 'floater', 3);
    if (selectedCardName === 'Soil Enrichment') adjustSpendAll('microbes', 'microbe', 2);
    return payRes;
  }

  var smartPay = function(amount, state, wfOrOpts, tags, cardName) {
    if (TM_BRAIN_CORE && TM_BRAIN_CORE.smartPay) {
      return adjustSpecialCardPayment(TM_BRAIN_CORE.smartPay(amount, state, wfOrOpts, tags), amount, state, wfOrOpts, cardName);
    }
    var tp = (state && state.thisPlayer) || {};
    var pay = {};
    var k;
    for (k in PAY_ZERO) pay[k] = PAY_ZERO[k];
    var remaining = amount;

    var payOpts = (wfOrOpts && wfOrOpts.paymentOptions) || wfOrOpts || {};
    var wfRes = wfOrOpts || {};
    var selectedCardName = cardName || (wfOrOpts && wfOrOpts.card) || '';

    // Use steel/titanium for cards with matching tags
    if (tags) {
      if (tags.indexOf('building') >= 0 && (tp.steel || 0) > 0) {
        var steelVal = tp.steelValue || 2;
        var steelUse = Math.min(tp.steel, Math.ceil(remaining / steelVal));
        pay.steel = steelUse;
        remaining = Math.max(0, remaining - steelUse * steelVal);
      }
      if (tags.indexOf('space') >= 0 && (tp.titanium || 0) > 0) {
        var tiVal = tp.titaniumValue || 3;
        var tiUse = Math.min(tp.titanium, Math.ceil(remaining / tiVal));
        pay.titanium = tiUse;
        remaining = Math.max(0, remaining - tiUse * tiVal);
      }
    }

    // Use alt resources (highest value first)
    var altRes = [
      { key: 'seeds', val: 5 },
      { key: 'graphene', val: 4 },
      { key: 'auroraiData', val: 3 },
      { key: 'floaters', val: 3 },
      { key: 'titanium', val: 3 },
      { key: 'microbes', val: 2 },
      { key: 'spireScience', val: 2 },
      { key: 'steel', val: 2 },
      { key: 'heat', val: 1 },
      { key: 'lunaArchivesScience', val: 1 },
      { key: 'kuiperAsteroids', val: 1 },
    ];

    for (var ai = 0; ai < altRes.length; ai++) {
      if (remaining <= 0) break;
      var alt = altRes[ai];
      var resourceAllowed = false;
      switch (alt.key) {
        case 'heat':               resourceAllowed = !!payOpts.heat; break;
        case 'titanium':           resourceAllowed = !!(payOpts.lunaTradeFederationTitanium || payOpts.titanium); break;
        case 'microbes':           resourceAllowed = !!(payOpts.microbes || (tags && tags.indexOf('plant') >= 0)); break;
        case 'seeds':              resourceAllowed = !!(payOpts.seeds || (tags && tags.indexOf('plant') >= 0)); break;
        case 'floaters':           resourceAllowed = !!(payOpts.floaters || (tags && tags.indexOf('venus') >= 0)); break;
        case 'graphene':           resourceAllowed = !!(payOpts.graphene || (tags && (tags.indexOf('city') >= 0 || tags.indexOf('space') >= 0))); break;
        case 'lunaArchivesScience':resourceAllowed = !!(payOpts.lunaArchivesScience || (tags && tags.indexOf('moon') >= 0)); break;
        default:                   resourceAllowed = !!payOpts[alt.key]; break;
      }
      if (!resourceAllowed) continue;
      if (pay[alt.key] > 0) continue;
      var available = wfRes[alt.key] || tp[alt.key] || 0;
      if (alt.key === 'floaters' && selectedCardName === 'Stratospheric Birds' && available > 0) {
        if (countResourceCardsWithType(tp.tableau || [], 'floater') <= 1) {
          available = Math.max(0, available - 1);
        }
      }
      if (alt.key === 'microbes' && selectedCardName === 'Soil Enrichment' && available > 0) {
        if (countResourceCardsWithType(tp.tableau || [], 'microbe') <= 1) {
          available = Math.max(0, available - 1);
        }
      }
      if (available <= 0) continue;
      var use = Math.min(available, Math.ceil(remaining / alt.val));
      pay[alt.key] = use;
      remaining = Math.max(0, remaining - use * alt.val);
    }

    pay.megacredits = Math.max(0, Math.min(remaining, getMegaCredits(tp)));
    return adjustSpecialCardPayment(pay, amount, state, wfOrOpts, cardName);
  };

  // ══════════════════════════════════════════════════════════════
  // CORE ANALYTICS
  // ══════════════════════════════════════════════════════════════

  var remainingSteps = (TM_BRAIN_CORE && TM_BRAIN_CORE.remainingStepsWithOptions)
    ? function(state) {
      return TM_BRAIN_CORE.remainingStepsWithOptions(state, {
        venusWeight: 0,
        zeroWhenCoreDone: true,
      });
    }
    : function(state) {
      var g = (state && state.game) || {};
      var temp   = typeof g.temperature  === 'number' ? g.temperature  : -30;
      var o2     = typeof g.oxygenLevel  === 'number' ? g.oxygenLevel  : 0;
      var oceans = typeof g.oceans       === 'number' ? g.oceans       : 0;
      var tempSteps  = Math.max(0, Math.round((8 - temp) / 2));
      var oxySteps   = Math.max(0, 14 - o2);
      var oceanSteps = Math.max(0, 9 - oceans);
      var coreSteps  = tempSteps + oxySteps + oceanSteps;
      // Game ends when temp+oxy+oceans all maxed — Venus doesn't affect game end
      return coreSteps;
    };

  var estimateGensLeft = sharedEstimateGensLeftFromState
    ? function(state) {
      return sharedEstimateGensLeftFromState(state);
    }
    : function(state) {
      var g = (state && state.game) || {};
      var breakdown = {
        tempSteps: Math.max(0, Math.round((8 - (typeof g.temperature === 'number' ? g.temperature : -30)) / 2)),
        oxySteps: Math.max(0, 14 - (typeof g.oxygenLevel === 'number' ? g.oxygenLevel : 0)),
        oceanSteps: Math.max(0, 9 - (typeof g.oceans === 'number' ? g.oceans : 0)),
        venus: typeof g.venusScaleLevel === 'number' ? g.venusScaleLevel : 30,
      };
      var coreSteps = breakdown.tempSteps + breakdown.oxySteps + breakdown.oceanSteps;
      var gen = g.generation || 1;
      var playerCount = (state && state.players) ? (state.players.length || 3) : 3;
      var isWgt = !!(g.gameOptions && g.gameOptions.solarPhaseOption);
      if (coreSteps <= 0) return 1;

      var baseSteps;
      if (playerCount <= 2) baseSteps = isWgt ? 4 : 3;
      else if (playerCount >= 4) baseSteps = isWgt ? 8 : 6;
      else baseSteps = isWgt ? 6 : 4;

      var stepsPerGen = baseSteps;
      if (gen <= 3) stepsPerGen = Math.max(3, baseSteps - 2);
      else if (gen >= 7) stepsPerGen = baseSteps + (playerCount >= 3 ? 2 : 1);

      var lateCloseout = gen >= 7 && coreSteps <= 18;
      if (breakdown.venus < 30 && isWgt) {
        if (lateCloseout) stepsPerGen += 1;
        else if (gen < 7) stepsPerGen = Math.max(3, stepsPerGen - 1);
      }

      var rawGens = coreSteps / Math.max(1, stepsPerGen);
      var gensLeft = lateCloseout ? Math.round(rawGens) : Math.ceil(rawGens);
      if (gen >= 8 && playerCount >= 3 && coreSteps <= 18) gensLeft = Math.min(gensLeft, 2);
      return Math.max(1, gensLeft);
    };

  // Calculate VP for any player from visible game data
  var calcPlayerVP = (TM_BRAIN_CORE && TM_BRAIN_CORE.calcPlayerVP)
    ? function(player, state) { return TM_BRAIN_CORE.calcPlayerVP(player, state, _cardVP); }
    : function(player, state) {
    if (!player) return { tr: 0, greenery: 0, city: 0, cards: 0, milestones: 0, awards: 0, total: 0 };
    var vp = { tr: 0, greenery: 0, city: 0, cards: 0, milestones: 0, awards: 0, total: 0 };

    // 1. TR
    vp.tr = player.terraformRating || 0;

    // 2. Board tiles — exact calculation from spaces
    var spaces = (state && state.game && state.game.spaces) || [];
    var coordMap = {};
    for (var si = 0; si < spaces.length; si++) {
      var sp = spaces[si];
      if (sp.x !== undefined && sp.y !== undefined) coordMap[sp.x + ',' + sp.y] = sp;
    }
    for (var si2 = 0; si2 < spaces.length; si2++) {
      var sp2 = spaces[si2];
      if (!sp2.color || sp2.color !== player.color) continue;
      var tt = sp2.tileType;
      if (tt === 'greenery' || tt === 1) vp.greenery++;
      if (tt === 'city' || tt === 0 || tt === 'capital' || tt === 5) {
        // Count adjacent greeneries (any player's greeneries give VP to city owner)
        if (sp2.x !== undefined && sp2.y !== undefined) {
          var deltas = [
            [-1, 0], [1, 0],
            [sp2.y % 2 === 0 ? -1 : 0, -1], [sp2.y % 2 === 0 ? 0 : 1, -1],
            [sp2.y % 2 === 0 ? -1 : 0, 1], [sp2.y % 2 === 0 ? 0 : 1, 1]
          ];
          for (var di = 0; di < deltas.length; di++) {
            var adjKey = (sp2.x + deltas[di][0]) + ',' + (sp2.y + deltas[di][1]);
            var adj = coordMap[adjKey];
            if (adj && (adj.tileType === 'greenery' || adj.tileType === 1)) vp.city++;
          }
        }
      }
    }

    // 3. Card VP from tableau
    if (player.tableau) {
      for (var ci = 0; ci < player.tableau.length; ci++) {
        var card = player.tableau[ci];
        var name = card.name || card;
        var vpDef = _cardVP[name];
        if (!vpDef) continue;
        if (vpDef.type === 'static') {
          vp.cards += vpDef.vp || 0;
        } else if (vpDef.type === 'per_resource') {
          var res = card.resources || 0;
          var per = vpDef.per || 1;
          vp.cards += Math.floor(res / per);
        } else if (vpDef.type === 'per_tag') {
          var tags = player.tags || {};
          var tagCount = tags[vpDef.tag] || 0;
          vp.cards += Math.floor(tagCount / (vpDef.per || 1));
        }
      }
    }

    // 4. Milestones — 5 VP each
    var claimed = (state && state.game && state.game.claimedMilestones) || [];
    for (var mi = 0; mi < claimed.length; mi++) {
      if (claimed[mi].playerColor === player.color || claimed[mi].player === player.color) vp.milestones += 5;
    }

    // 5. Awards — estimate from funded
    var funded = (state && state.game && state.game.fundedAwards) || [];
    // Simple estimation: check if player would win each funded award
    // (Full evaluation needs all player metrics — simplified here)

    vp.total = vp.tr + vp.greenery + vp.city + vp.cards + vp.milestones + vp.awards;
    return vp;
  };

  function isCityTile(t) {
    return t === 0 || t === 2 || t === 3 || t === 5 || t === 20 || t === 37 || t === 43 ||
      t === 'city' || t === 'capital' || t === 'ocean city' || t === 'red city';
  }

  function isOceanTile(t) {
    return t === 1 || t === 2 || t === 20 || t === 21 || t === 22 || t === 36 || t === 43 ||
      t === 'ocean' || t === 'ocean city' || t === 'ocean farm' || t === 'ocean sanctuary' || t === 'wetlands';
  }

  function isHazardTile(t) {
    return t === 23 || t === 24 || t === 25 || t === 26 ||
      t === 'Mild Dust Storm' || t === 'Severe Dust Storm' || t === 'Mild Erosion' || t === 'Severe Erosion';
  }

  function hasSpaceBonus(space, bonusId) {
    var bonus = space && space.bonus;
    if (!bonus || !bonus.length) return false;
    for (var i = 0; i < bonus.length; i++) {
      if (bonus[i] === bonusId) return true;
    }
    return false;
  }

  function hasAdjacencyBonus(space) {
    return !!(space && space.adjacency && space.adjacency.bonus && space.adjacency.bonus.length);
  }

  function getAdjacencyCost(space) {
    return (space && space.adjacency && space.adjacency.cost) || 0;
  }

  function getAdjacentSpaces(space, coordMap) {
    if (!space || space.x === undefined || space.y === undefined) return [];
    var deltas = [
      [-1, 0], [1, 0],
      [space.y % 2 === 0 ? -1 : 0, -1], [space.y % 2 === 0 ? 0 : 1, -1],
      [space.y % 2 === 0 ? -1 : 0, 1], [space.y % 2 === 0 ? 0 : 1, 1]
    ];
    var out = [];
    for (var i = 0; i < deltas.length; i++) {
      var adj = coordMap[(space.x + deltas[i][0]) + ',' + (space.y + deltas[i][1])];
      if (adj) out.push(adj);
    }
    return out;
  }

  function getBoardMetrics(state) {
    var spaces = (state && state.game && state.game.spaces) || [];
    var myColor = state && state.thisPlayer && state.thisPlayer.color;
    var coordMap = {};
    var m = {
      emptyLand: 0,
      occupiedLand: 0,
      myTiles: 0,
      oceans: 0,
      hazards: 0,
      emptyMiningBonus: 0,
      emptyMiningBonusRichness: 0,
      emptyAdjacentToAnyTile: 0,
      emptyAdjacentToOcean: 0,
      emptyAdjacentToCity: 0,
      emptyAdjacentToOwn: 0,
      emptyAdjacentToOwnMiningBonus: 0,
      emptyAdjacentToOwnMiningBonusRichness: 0,
      emptyAdjacentToAdjacencyBonus: 0,
      emptyAdjacentToAdjacencyCost: 0,
      protectedHazards: 0,
      isolatedEmpty: 0,
      noCityAdjacent: 0,
    };
    for (var i = 0; i < spaces.length; i++) {
      var sp = spaces[i];
      if (sp.x !== undefined && sp.y !== undefined) coordMap[sp.x + ',' + sp.y] = sp;
      if (sp.tileType != null) {
        if (sp.spaceType === 'land' || sp.spaceType === 'ocean') m.occupiedLand++;
        if (isOceanTile(sp.tileType)) m.oceans++;
        if (isHazardTile(sp.tileType)) m.hazards++;
        if (sp.protectedHazard === true) m.protectedHazards++;
        if (myColor && sp.color === myColor) m.myTiles++;
      } else if (sp.spaceType === 'land') {
        m.emptyLand++;
      }
    }
    for (var j = 0; j < spaces.length; j++) {
      var empty = spaces[j];
      if (empty.tileType != null || empty.spaceType !== 'land') continue;
      var miningRichness = (hasSpaceBonus(empty, 0) ? 1 : 0) + (hasSpaceBonus(empty, 1) ? 1 : 0);
      var adjs = getAdjacentSpaces(empty, coordMap);
      var hasAnyTile = false;
      var hasOcean = false;
      var hasCity = false;
      var hasOwn = false;
      var hasAdjBonus = false;
      var hasAdjCost = false;
      for (var ai = 0; ai < adjs.length; ai++) {
        var adj = adjs[ai];
        if (adj.tileType != null) {
          hasAnyTile = true;
          if (isOceanTile(adj.tileType)) hasOcean = true;
          if (isCityTile(adj.tileType)) hasCity = true;
          if (myColor && adj.color === myColor) hasOwn = true;
          if (hasAdjacencyBonus(adj)) hasAdjBonus = true;
          if (getAdjacencyCost(adj) > 0) hasAdjCost = true;
        }
      }
      if (miningRichness > 0) {
        m.emptyMiningBonus++;
        m.emptyMiningBonusRichness += miningRichness;
      }
      if (hasAnyTile) m.emptyAdjacentToAnyTile++;
      if (hasOcean) m.emptyAdjacentToOcean++;
      if (hasCity) m.emptyAdjacentToCity++;
      if (hasOwn) m.emptyAdjacentToOwn++;
      if (hasOwn && miningRichness > 0) {
        m.emptyAdjacentToOwnMiningBonus++;
        m.emptyAdjacentToOwnMiningBonusRichness += miningRichness;
      }
      if (hasAdjBonus) m.emptyAdjacentToAdjacencyBonus++;
      if (hasAdjCost) m.emptyAdjacentToAdjacencyCost++;
      if (!hasAnyTile) m.isolatedEmpty++;
      if (!hasCity) m.noCityAdjacent++;
    }
    m.boardFullness = (m.emptyLand + m.occupiedLand) > 0 ? m.occupiedLand / (m.emptyLand + m.occupiedLand) : 0;
    return m;
  }

  function estimateAresPlacementDelta(name, state, gensLeft) {
    if (!/:ares$/.test(name)) return 0;
    var m = getBoardMetrics(state);
    var early = gensLeft >= 6 ? 1.15 : (gensLeft >= 3 ? 1.0 : 0.8);
    var openFactor = Math.max(0.6, 1 - m.boardFullness * 0.35);
    var base = 0;

    switch (name) {
      case 'Capital:ares':
        base = 4.5 + Math.min(2.5, m.emptyAdjacentToOcean * 0.12) + Math.min(0.8, m.emptyAdjacentToAdjacencyBonus * 0.03);
        break;
      case 'Commercial District:ares':
        base = 4.2
          + Math.min(2, m.emptyAdjacentToCity * 0.18)
          + Math.min(1.6, m.emptyAdjacentToAnyTile * 0.05)
          + Math.min(0.8, m.emptyAdjacentToAdjacencyBonus * 0.03);
        break;
      case 'Great Dam:ares':
        base = 4.8
          + Math.min(2.5, m.emptyAdjacentToOcean * 0.14)
          + Math.min(1.2, m.emptyAdjacentToAnyTile * 0.035)
          + Math.min(0.8, m.emptyAdjacentToAdjacencyBonus * 0.03);
        break;
      case 'Deimos Down:ares':
        base = 5 + Math.min(1.5, m.noCityAdjacent * 0.04);
        break;
      case 'Ecological Zone:ares':
        base = 4 + Math.min(1.5, m.emptyAdjacentToOwn * 0.1);
        break;
      case 'Natural Preserve:ares':
        base = 2.5 + Math.min(1.5, m.isolatedEmpty * 0.06);
        break;
      case 'Restricted Area:ares':
        base = 3.5 + (gensLeft >= 5 ? 1 : 0);
        break;
      case 'Magnetic Field Generators:ares':
        base = 3.5;
        break;
      case 'Mining Area:ares':
        base = 2.8
          + Math.min(4.5, m.emptyAdjacentToOwnMiningBonus * 0.8)
          + Math.min(2, m.emptyAdjacentToOwnMiningBonusRichness * 0.45)
          + Math.min(0.8, m.emptyAdjacentToOwn * 0.06);
        break;
      case 'Mining Rights:ares':
        base = 3
          + Math.min(4.5, m.emptyMiningBonus * 0.45)
          + Math.min(2.5, m.emptyMiningBonusRichness * 0.35)
          + Math.min(1.2, m.emptyAdjacentToOwnMiningBonus * 0.2);
        break;
      case 'Industrial Center:ares':
        base = 3 + Math.min(1.5, m.emptyAdjacentToOwn * 0.12);
        break;
      case 'Mohole Area:ares':
        base = 3.5;
        break;
      case 'Nuclear Zone:ares':
        base = 5 + Math.min(1, m.noCityAdjacent * 0.03) + Math.min(1.2, m.emptyAdjacentToAdjacencyCost * 0.08);
        break;
      case 'Lava Flows:ares':
        base = 3;
        break;
      default:
        base = 2.5;
    }

    if (m.hazards > 0 && (name === 'Mining Area:ares' || name === 'Mining Rights:ares' || name === 'Commercial District:ares' || name === 'Capital:ares')) {
      base -= Math.min(1.5, m.hazards * 0.2);
    }
    if (m.protectedHazards > 0 && (name === 'Deimos Down:ares' || name === 'Natural Preserve:ares')) {
      base -= Math.min(0.8, m.protectedHazards * 0.25);
    }
    return base * early * openFactor;
  }

  var vpLead = (TM_BRAIN_CORE && TM_BRAIN_CORE.vpLead) || function(state) {
    // Use victoryPointsBreakdown.total if available (smartbot context — more accurate)
    var tp = (state && state.thisPlayer) || {};
    var myVP = tp.victoryPointsBreakdown && tp.victoryPointsBreakdown.total;
    if (myVP !== undefined && myVP !== null) {
      var myColor = tp.color;
      var players = (state && state.players) || [];
      var maxOppVP = 0;
      for (var i = 0; i < players.length; i++) {
        var p = players[i];
        if (p.color === myColor) continue;
        var oppVP = (p.victoryPointsBreakdown && p.victoryPointsBreakdown.total) || 0;
        if (oppVP > maxOppVP) maxOppVP = oppVP;
      }
      return myVP - maxOppVP;
    }
    // Fallback: TR-based
    if (!state || !tp || !state.players) return 0;
    var myTR = tp.terraformRating || 0;
    var bestOpp = 0;
    for (var j = 0; j < state.players.length; j++) {
      var pl = state.players[j];
      if (pl.color === tp.color) continue;
      var oppTR = pl.terraformRating || 0;
      if (oppTR > bestOpp) bestOpp = oppTR;
    }
    return myTR - bestOpp;
  };

  var shouldPushGlobe = (TM_BRAIN_CORE && TM_BRAIN_CORE.shouldPushGlobe)
    ? function(state) {
      return TM_BRAIN_CORE.shouldPushGlobe(state, {
        remainingSteps: remainingSteps,
        vpLead: vpLead,
      });
    }
    : function(state) {
      var gen = (state && state.game && state.game.generation) || 5;
      if (gen >= 20) return true;

      var steps = remainingSteps(state);
      if (steps > 8) return true;

      var lead = vpLead(state);
      if (steps > 4) return lead >= -5;
      return lead >= 0;
    };

  var isRedsRuling = (TM_BRAIN_CORE && TM_BRAIN_CORE.isRedsRuling) || function(state) {
    return state && state.game && state.game.turmoil && state.game.turmoil.ruling === 'Reds';
  };

  var scoreColonyTrade = (TM_BRAIN_CORE && TM_BRAIN_CORE.scoreColonyTrade)
    ? function(colony, state) {
      return TM_BRAIN_CORE.scoreColonyTrade(colony, state, {
        colonyTrade: COLONY_TRADE,
        hasVPCard: hasVPCard,
        animalVpCards: ANIMAL_VP_CARDS,
        microbeVpCards: MICROBE_VP_CARDS,
        floaterVpCards: FLOATER_VP_CARDS,
        resourceValues: {
          tr: 7,
          vp: 5,
          delegates: 2.5,
          data: 1.5,
        },
        includeOpponentPenalty: true,
        opponentPenaltyFactor: 0.5,
      });
    }
    : function(colony, state) {
      var name = colony.name || colony;
      var pos = colony.trackPosition != null ? colony.trackPosition : 3;
      var tp = (state && state.thisPlayer) || {};
      var tableau = tp.tableau || [];
      var tableauNames = new Set(tableau.map(function(c) { return c.name || c; }));

      var data = COLONY_TRADE[name];
      if (!data) return pos;

      var qty = data.qty[Math.min(pos, data.qty.length - 1)];

      var mcPerUnit;
      switch (data.res) {
        case 'mc':         mcPerUnit = 1; break;
        case 'steel':      mcPerUnit = tp.steelValue || 2; break;
        case 'titanium':   mcPerUnit = tp.titaniumValue || 3; break;
        case 'cards':      mcPerUnit = tp.cardCost || 3; break;
        case 'plants':     mcPerUnit = 1.5; break;
        case 'energy':     mcPerUnit = 0.6; break;
        case 'heat':       mcPerUnit = 0.4; break;
        case 'production': mcPerUnit = 8; break;
        case 'tr':         mcPerUnit = 7; break;
        case 'vp':         mcPerUnit = 5; break;
        case 'delegates':  mcPerUnit = 2.5; break;
        case 'data':       mcPerUnit = 1.5; break;
        case 'animals':
          mcPerUnit = hasVPCard(tableauNames, ANIMAL_VP_CARDS) ? 5 : 1; break;
        case 'microbes':
          mcPerUnit = hasVPCard(tableauNames, MICROBE_VP_CARDS) ? 2.5 : 0.5; break;
        case 'floaters':
          mcPerUnit = hasVPCard(tableauNames, FLOATER_VP_CARDS) ? 3 : 0.5; break;
        default: mcPerUnit = 1;
      }

      var tradeValue = qty * mcPerUnit;

      var myColor = tp.color;
      var colonyColors = colony.colonies || [];
      if (myColor && colonyColors.length > 0) {
        var myColonies = 0;
        var oppColonies = 0;
        for (var ci = 0; ci < colonyColors.length; ci++) {
          if (colonyColors[ci] === myColor) myColonies++;
          else oppColonies++;
        }
        var COLONY_BONUS_MC = {
          Luna: 2, Callisto: 5.1, Ceres: 3.6, Io: 1.6,
          Ganymede: 1.5, Europa: 1, Triton: 2.5, Pluto: 3,
          Miranda: 4, Titan: 2.5, Enceladus: 2
        };
        if (name === 'Miranda' && hasVPCard(tableauNames, ANIMAL_VP_CARDS)) COLONY_BONUS_MC.Miranda = 5;
        if (name === 'Titan' && hasVPCard(tableauNames, FLOATER_VP_CARDS)) COLONY_BONUS_MC.Titan = 3;
        if (name === 'Enceladus' && hasVPCard(tableauNames, MICROBE_VP_CARDS)) COLONY_BONUS_MC.Enceladus = 2.5;
        if (myColonies > 0) {
          tradeValue += myColonies * (COLONY_BONUS_MC[name] || 1);
        }
        if (oppColonies > 0) {
          var oppBonusPerCol = COLONY_BONUS_MC[name] || 1;
          tradeValue -= oppColonies * oppBonusPerCol * 0.5;
        }
      }

      return tradeValue;
    };

  function countOwnColonies(state, tp) {
    if (tp && typeof tp.coloniesCount === 'number') return tp.coloniesCount;
    var colonies = state && state.game && state.game.colonies;
    var color = tp && tp.color;
    if (!Array.isArray(colonies) || !color) return 0;
    var count = 0;
    for (var ci = 0; ci < colonies.length; ci++) {
      var slots = colonies[ci] && colonies[ci].colonies;
      if (!Array.isArray(slots)) continue;
      for (var si = 0; si < slots.length; si++) {
        var slot = slots[si];
        if (slot === color) {
          count++;
        } else if (slot && (slot.player === color || slot.playerColor === color || slot.color === color)) {
          count++;
        }
      }
    }
    return count;
  }

  function normalizeResourceType(type) {
    var value = String(type || '').toLowerCase();
    if (value === 'microbes') return 'microbe';
    if (value === 'animals') return 'animal';
    if (value === 'floaters') return 'floater';
    return value;
  }

  function cardResourceTypeForScoring(cardName, state) {
    var cd = getCardDataByName(cardName, state) || {};
    var directType = normalizeResourceType(cd.resourceType);
    if (directType) return directType;
    if (MICROBE_VP_CARDS.has(cardName)) return 'microbe';
    if (ANIMAL_VP_CARDS.has(cardName)) return 'animal';
    if (FLOATER_VP_CARDS.has(cardName)) return 'floater';
    return '';
  }

  function scoreAddedResourcesToBestVpCard(resourceType, count, state, vpValueMC) {
    var normalized = normalizeResourceType(resourceType);
    var qty = Number(count) || 0;
    if (!normalized || qty <= 0) return { value: 0, target: '', vp: 0 };

    var tp = (state && state.thisPlayer) || {};
    var tableau = tp.tableau || [];
    var best = { value: 0, target: '', vp: 0 };
    for (var ri = 0; ri < tableau.length; ri++) {
      var cardObj = tableau[ri] || {};
      var targetName = cardObj.name || cardObj;
      if (!targetName || cardResourceTypeForScoring(targetName, state) !== normalized) continue;
      var vpDef = getCardVPByName(targetName, state) || {};
      if (vpDef.type !== 'per_resource') continue;
      var per = Number(vpDef.per) || 1;
      var current = Number(cardObj.resources) || 0;
      var wholeVp = Math.floor((current + qty) / per) - Math.floor(current / per);
      var fractionalVp = qty / per;
      var vpGain = Math.max(wholeVp, fractionalVp * 0.6);
      var value = vpGain * (vpValueMC || 8);
      if (value > best.value) best = { value: value, target: targetName, vp: vpGain };
    }
    return best;
  }

  var hasVPCard = (TM_BRAIN_CORE && TM_BRAIN_CORE.hasVPCard) || function(tableauNames, vpSet) {
    var arr = [];
    vpSet.forEach(function(c) { arr.push(c); });
    for (var i = 0; i < arr.length; i++) {
      if (tableauNames.has(arr[i])) return true;
    }
    return false;
  };

  // ══════════════════════════════════════════════════════════════
  // CARD SCORING (full version from smartbot)
  // ══════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════
  // EV CONSTANTS (MC equivalents from CLAUDE.md tier-list formulas)
  // ══════════════════════════════════════════════════════════════

  // MC value of 1 unit of production per remaining generation
  // PATCHED constants (v30 — corrected valuations)
  var PROD_MC_PATCHED = {
    megacredits: 1, steel: 1.8, titanium: 2.5, plants: 2,
    energy: 1.7, heat: 0.8
  };
  var STOCK_MC_PATCHED = {
    megacredits: 1, steel: 1.8, titanium: 2.5, plants: 1.5,
    energy: 1.5, heat: 0.8
  };
  // VANILLA constants (original)
  var PROD_MC_VANILLA = {
    megacredits: 1, steel: 2, titanium: 3, plants: 2.2,
    energy: 1.3, heat: 0.8
  };
  var STOCK_MC_VANILLA = {
    megacredits: 1, steel: 2, titanium: 3, plants: 1.1,
    energy: 0.7, heat: 0.8
  };
  // Default to PATCHED (will be switched per-bot in scoreCard)
  var PROD_MC = PROD_MC_PATCHED;
  var STOCK_MC = STOCK_MC_PATCHED;

  // MC value of 1 VP (scales with game phase)
  var vpMC = (TM_BRAIN_CORE && TM_BRAIN_CORE.vpMC) || function(gensLeft) {
    if (gensLeft >= 6) return 2;  // early: VP cheap, MC more useful
    if (gensLeft >= 3) return 5.5;  // mid
    return 10;                     // late: VP = everything (was 7)
  };

  // MC value of 1 TR raise (production income + VP at end)
  var trMC = (TM_BRAIN_CORE && TM_BRAIN_CORE.trMC) || function(gensLeft, redsTax) {
    return gensLeft + vpMC(gensLeft) - redsTax;
  };

  // Tag intrinsic value (MC equivalent of having the tag)
  var TAG_VALUE = {
    jovian: 5, science: 5, earth: 3, venus: 2, space: 1.5,
    building: 1.5, plant: 2, microbe: 1.5, animal: 2, power: 1,
    city: 1, moon: 1, mars: 0.5, event: 1, wild: 2
  };

  var ACTION_RESOURCE_REQ = (TM_BRAIN_CORE && TM_BRAIN_CORE.ACTION_RESOURCE_REQ) || {
    'Water Splitting Plant': 'energy',
    'Steelworks': 'energy',
    'Ironworks': 'energy',
    'Ore Processor': 'energy',
    'Physics Complex': 'energy',
    'Development Center': 'energy',
    'Hi-Tech Lab': 'energy',
    'Venus Magnetizer': 'energy',
    'Hydrogen Processing Plant': 'energy',
    'Power Infrastructure': 'energy',
    'Caretaker Contract': 'heat',
    'GHG Factories': 'heat',
    'Directed Heat Usage': 'heat',
    'Security Fleet': 'titanium',
    'Jovian Lanterns': 'titanium',
    'Jet Stream Microscrappers': 'titanium',
    'Rotator Impacts': 'titanium',
    'Electro Catapult': 'plants_or_steel',
  };

  // MANUAL EV OVERRIDES
  // Single source of truth: packages/tm-brain-js/src/manual-ev.js
  // Runtime copies are synced to bot/shared and extension/shared.
  // ══════════════════════════════════════════════════════════════

  var MANUAL_EV = (TM_MANUAL_EV && TM_MANUAL_EV.MANUAL_EV) || {};


  // ══════════════════════════════════════════════════════════════
  // CARD SCORING — EV-based (uses structured card data)
  // ══════════════════════════════════════════════════════════════

  function _estimateTriggersPerGen(triggerTag, tp, handCards) {
    if (sharedEstimateTriggersPerGen) {
      return sharedEstimateTriggersPerGen(triggerTag, tp, handCards, function(cardName) {
        return _cardTags[cardName] || [];
      });
    }
    var myTags = tp.tags || {};
    var handTagCount = 0;
    if (handCards) {
      for (var hi = 0; hi < handCards.length; hi++) {
        var hcName = handCards[hi].name || handCards[hi];
        var hcTags = _cardTags[hcName] || [];
        for (var hti = 0; hti < hcTags.length; hti++) {
          var ht = hcTags[hti];
          if (triggerTag === 'science' && ht === 'science') handTagCount++;
          else if (triggerTag === 'event' && ht === 'event') handTagCount++;
          else if (triggerTag === 'venus' && ht === 'venus') handTagCount++;
          else if (triggerTag === 'bio' && (ht === 'plant' || ht === 'animal' || ht === 'microbe')) handTagCount++;
          else if (triggerTag === 'space_event' && ht === 'space') handTagCount++;
        }
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
    }
    var handPerGen = handCards ? Math.min(2, handTagCount / 3) : 0;
    return Math.max(0.3, baseline + tableauBoost + handPerGen);
  }

  function _estimateScoreCardTiming(state, gen, steps, playerCount) {
    var totalSteps = 19 + 14 + 9 + 7;
    if (sharedEstimateScoreCardTimingInterpolated) {
      return sharedEstimateScoreCardTimingInterpolated({
        state: state,
        gen: gen,
        steps: steps,
        playerCount: playerCount,
        totalSteps: totalSteps,
      });
    }
    var avgGameLen = playerCount >= 4 ? 8 : (playerCount >= 3 ? 9 : 10.5);
    var genBased = Math.max(1, avgGameLen - gen + 1);
    var stepsBased = Math.max(1, Math.round(steps / (totalSteps / avgGameLen)));
    var completionPct = steps > 0 ? Math.max(0, 1 - steps / totalSteps) : 1;
    var gensLeft = Math.max(1, Math.round(genBased * completionPct + stepsBased * (1 - completionPct)));
    return {
      totalSteps: totalSteps,
      completionPct: completionPct,
      gensLeft: gensLeft,
      ratePerGen: steps > 0 ? steps / Math.max(1, gensLeft) : totalSteps / avgGameLen,
    };
  }

  function _buildScoreCardContext(card, state) {
    if (sharedBuildScoreCardContext) {
      return sharedBuildScoreCardContext({
        card: card,
        state: state,
        remainingSteps: remainingSteps,
        isRedsRuling: isRedsRuling,
        totalSteps: 19 + 14 + 9 + 7,
        estimateTiming: function(meta) {
          return _estimateScoreCardTiming(meta.state, meta.gen, meta.steps, meta.playerCount);
        },
      });
    }
    var cost = card.calculatedCost != null ? card.calculatedCost : (card.cost || 0);
    var name = card.name || '';
    var gen = (state && state.game && state.game.generation) || 5;
    var steps = remainingSteps(state);
    var playerCount = (state && state.players) ? (state.players.length || 3) : 3;
    var timing = _estimateScoreCardTiming(state, gen, steps, playerCount);
    var tp = (state && state.thisPlayer) || {};
    var myTags = tp.tags || {};
    var handCards = tp.cardsInHand || [];
    var tableau = tp.tableau || [];
    return {
      cost: cost,
      name: name,
      gen: gen,
      steps: steps,
      playerCount: playerCount,
      totalSteps: timing.totalSteps,
      completionPct: timing.completionPct,
      gensLeft: timing.gensLeft,
      ratePerGen: timing.ratePerGen,
      tp: tp,
      myTags: myTags,
      handCards: handCards,
      tableau: tableau,
      tableauNames: new Set(tableau.map(function(c) { return c.name || c; })),
      redsTax: isRedsRuling(state) ? 3 : 0,
    };
  }

  function _buildProductionValuationContext(state, isPatched, gensLeft) {
    if (sharedBuildProductionValuationContext) {
      return sharedBuildProductionValuationContext({
        state: state,
        isPatched: isPatched,
        gensLeft: gensLeft,
      });
    }
    var g2 = (state && state.game) || {};
    var tempStepsLeft = Math.max(0, Math.round((8 - (g2.temperature || -30)) / 2));
    var oxyStepsLeft = Math.max(0, 14 - (g2.oxygenLevel || 0));
    return {
      game: g2,
      tempStepsLeft: tempStepsLeft,
      oxyStepsLeft: oxyStepsLeft,
      heatDevalue: tempStepsLeft <= 1 ? 0.2 : (tempStepsLeft <= 3 ? 0.5 : 1.0),
      plantDevalue: oxyStepsLeft <= 1 ? 0.6 : (oxyStepsLeft <= 3 ? 0.8 : 1.0),
      prodCompound: isPatched ? (gensLeft >= 8 ? 1.3 : (gensLeft >= 5 ? 1.15 : 1.0)) : 1.0,
      prodLatePenalty: gensLeft <= 1 ? 0.15 : (gensLeft <= 2 ? 0.4 : (gensLeft <= 3 ? 0.65 : 1.0)),
    };
  }

    function scoreCard(card, state) {
    // PvP test: Beta=PATCHED, Alpha/Gamma=VANILLA
    var _isPatched = state && state._botName === 'Beta';
    PROD_MC = _isPatched ? PROD_MC_PATCHED : PROD_MC_VANILLA;
    STOCK_MC = _isPatched ? STOCK_MC_PATCHED : STOCK_MC_VANILLA;
    var scoreCtx = _buildScoreCardContext(card, state);
    var cost = scoreCtx.cost;
    var name = scoreCtx.name;
    var gen = scoreCtx.gen;
    var steps = scoreCtx.steps;
    var totalSteps = scoreCtx.totalSteps;
    var completionPct = scoreCtx.completionPct;
    var gensLeft = scoreCtx.gensLeft;
    var ratePerGen = scoreCtx.ratePerGen;
    var tp = scoreCtx.tp;
    var myTags = scoreCtx.myTags;
    var handCards = scoreCtx.handCards;
    var tableau = scoreCtx.tableau;
    var tableauNames = scoreCtx.tableauNames;
    var redsTax = scoreCtx.redsTax;

    // Lookup structured data (from card_data.js or TM_CARD_EFFECTS)
    var cd = getCardDataByName(name, state);
    var tags = getCardTagsByName(name, card.tags || cd.tags || [], state);
    var beh = cd.behavior || {};
    var act = cd.action || {};

    // _behOverrides: cards where parser gives wrong behavior data.
    // Null parsed behavior → scoreCard relies only on MANUAL_EV for these.
    var _behOverrides = {
      'Media Group': true,
      'Trading Colony': true,
      'Colonial Representation': true,
      'Equatorial Magnetizer': true,
      'Space Port Colony': true,
      'Ice Moon Colony': true,
      'Gyropolis': true,
      'Power Grid': true,
      'Luxury Estate': true,
      'Immigration Shuttles': true,
      'Cassini Station': true,
      'Energy Saving': true,
      'Pollinators': true,
      'Zeppelins': true,
      'Hydrogen Processing Plant': true,
      'Advanced Power Grid': true,
      'Flat Mars Theory': true,
      'Archimedes Hydroponics Station': true,
      'Terraforming Ganymede': true,
      'Interplanetary Transport': true,
      'Martian Monuments': true,
      'Cyberia Systems': true,
      'Think Tank': true,
      'Quantum Communications': true,
      'Floating Trade Hub': true,
      'Lunar Mining': true,
      'Insects': true,
      'Worms': true,
      'Floater Leasing': true,
      'Immigrant City': true,
      'Community Services': true,
      'Soletta': true,
      'Aerosport Tournament': true,
      'Venus Orbital Survey': true,
      'Merger': true,
      'Pharmacy Union': true,
      'Medical Lab': true,
      'Luna Metropolis': true,
      'Parliament Hall': true,
      'Miranda Resort': true,
      'Venus Trade Hub': true,
      'Cloud Tourism': true,
      'Molecular Printing': true,
      'Martian Media Center': true,
      'Ecology Research': true,
      'Ceres Spaceport': true,
      'Lunar Embassy': true,
      'Static Harvesting': true,
      'Red Tourism Wave': true,
      'Cartel': true,
      'Satellites': true,
      'Bactoviral Research': true,
      'Hecate Speditions': true,
      'Cloud Vortex Outpost': true,
      'Copernicus Tower': true,
      'Project Workshop': true,
      'Sponsored Academies': true,
      'Media Archives': true,
      'Nitrite Reducing Bacteria': true,
      'Huygens Observatory': true,
      'Caretaker Contract': true,   // parsed action: stock 3.5 MC (wrong — real: 8 heat → 1 TR)
      'Electro Catapult': true,     // parsed production: steel:-1 (wrong — real: energy:-1). Action also wrong.
      'Mass Converter': true,      // parsed production: energy:6 (wrong — real: -5 energy +6 energy = net +1). Card value is -5 MC on space cards.
      'Beam From A Thorium Asteroid': true, // parsed production: heat:3+energy:3 grossly overvalued. Real: overcosted at 32 MC. MANUAL_EV handles.
      'Aerobraked Ammonia Asteroid': true, // parsed production inflates value. MANUAL_EV handles.
    };
    if (_behOverrides[name]) { beh = {}; act = {}; }
    var vpInfo = cd.vp || getCardVPByName(name, state) || null;
    var discount = cd.cardDiscount || null;
    var resolvedReqName = resolveVariantCardName(name, state);
    var baseReqName = baseCardName(resolvedReqName || name);
    var reqInfo = sharedScoreRequirementPenalty ? sharedScoreRequirementPenalty({
      state: state,
      name: name,
      globalReqs: _cardGlobalReqs[resolvedReqName] || _cardGlobalReqs[name] || _cardGlobalReqs[baseReqName] || null,
      tagReqs: _cardTagReqs[resolvedReqName] || _cardTagReqs[name] || _cardTagReqs[baseReqName] || null,
      myTags: myTags,
      handCards: handCards,
      getCardTags: function(cardName) { return getCardTagsByName(cardName, null, state); },
    }) : { penalty: 0 };
    var reqPenalty = reqInfo.penalty || 0;

    var ev = 0;

    // ── PRODUCTION VALUE ──
    // Each +1 prod = gensLeft * MC-per-unit * compound bonus
    // Early production compounds: more resources → more cards → better engine
    var prodValueCtx = _buildProductionValuationContext(state, _isPatched, gensLeft);
    var prodCompound = prodValueCtx.prodCompound;
    // Late-game production penalty: production cards lose value sharply after gen 5
    // At gensLeft<=2, production barely matters — cap synergy uplift
    var prodLatePenalty = prodValueCtx.prodLatePenalty;
    // Negative production (self-cost) penalized 1.5x because it permanently removes capability
    // Dynamic production devaluation: heat/plant prod worth less when their global is almost done
    var g2 = prodValueCtx.game;
    var tempStepsLeft = prodValueCtx.tempStepsLeft;
    var oxyStepsLeft = prodValueCtx.oxyStepsLeft;
    var heatDevalue = prodValueCtx.heatDevalue;
    var plantDevalue = prodValueCtx.plantDevalue;
    // Plants still give VP via greenery even after O2 closes, so floor at 0.6

    var prod = beh.production;
    if (prod) {
      for (var pk in prod) {
        var pVal = PROD_MC[pk] || 1;
        if (pk === 'heat') pVal *= heatDevalue;
        if (pk === 'plants') pVal *= plantDevalue;
        var delta = prod[pk];
        if (delta < 0) {
          ev += delta * pVal * gensLeft * 1.5; // penalty multiplier for self-harm
        } else {
          ev += delta * pVal * gensLeft * prodCompound * prodLatePenalty;
        }
      }
    }

    // ── INSTANT RESOURCES (stock) ──
    var stock = beh.stock;
    if (stock) {
      for (var sk in stock) {
        var sVal = STOCK_MC[sk] || 1;
        ev += stock[sk] * sVal;
      }
    }
    if (name === 'Colonial Representation') {
      ev += countOwnColonies(state, tp) * 3;
    }

    // ── GLOBAL PARAMETER RAISES ──
    // Each raise = 1 TR + tempo bonus (pushing game to end locks in your lead)
    // Tempo bonus: ending game 1 gen sooner denies opponents production in 3P.
    // PATCHED: aggressive tempo (globals worth more → do SPs earlier).
    // VANILLA: conservative tempo (original).
    // v71: No magic tempo. SP value = TR value only. Cards compete on pure EV.
    // If best card EV > SP EV → play card. If SP EV > best card → do SP.
    // This naturally means: early game cards win (production compounds),
    // late game SP wins (TR is worth more, fewer gens for production).
    var tempoBonus = _isPatched ? 0 : (gensLeft >= 5 ? 8 : (gensLeft >= 3 ? 6 : 4));
    var glob = beh.global;
    ev += sharedScoreGlobalTileValue ? sharedScoreGlobalTileValue({
      beh: beh,
      card: card,
      game: g2,
      gensLeft: gensLeft,
      redsTax: redsTax,
      trMC: trMC,
      vpMC: vpMC,
      tempoBonus: tempoBonus
    }) : 0;

    // ── CITY TILE ──
    // City = ~2 VP avg (1 from adjacent greenery early, 2-3 late) + MC from Mayor award
    if (beh.city && !isOffBoardCityCard(name)) ev += vpMC(gensLeft) * 2 + 2; // VP from adj greeneries + positional value
    ev += sharedEstimateAresPlacementDelta
      ? sharedEstimateAresPlacementDelta(name, state, gensLeft)
      : estimateAresPlacementDelta(name, state, gensLeft);

    // ── COLONY ──
    if (beh.colony) ev += 7; // colony slot ≈ 7 MC (prod bonus + trade target)
    // ── DRAW CARDS ──
    var drawVal = Math.min(6, 2.5 + gensLeft * 0.35);
    if (beh.drawCard) {
      if (beh.discardAfterDraw && typeof beh.netDrawCard === 'number') {
        ev += beh.netDrawCard * drawVal;
        var selectionBonus = typeof beh.discardCardSelectionBonusMC === 'number' ? beh.discardCardSelectionBonusMC : 0.75;
        ev += Math.max(0, beh.drawCard - beh.netDrawCard) * selectionBonus;
      } else {
        ev += beh.drawCard * drawVal;
      }
      if (beh.discardCardsFromHand && !beh.discardAfterDraw) {
        var discardCost = typeof beh.discardCardCostMC === 'number' ? beh.discardCardCostMC : 1;
        ev -= beh.discardCardsFromHand * discardCost;
      }
    }

    // ── VP ──
    if (sharedScoreCardVPInfo) {
      ev += sharedScoreCardVPInfo({
        vpInfo: vpInfo,
        gensLeft: gensLeft,
        myTags: myTags,
        vpMC: vpMC,
      });
    } else if (vpInfo) {
      if (vpInfo.type === 'static') {
        ev += (vpInfo.vp || 0) * vpMC(gensLeft);
      } else if (vpInfo.type === 'per_resource') {
        // VP accumulator: ~1 resource/gen via action, but loses 1 gen to play it
        // Also discounted because action slot competes with other actions
        var expectedRes = Math.max(1, gensLeft - 2); // gens of accumulation (play delay + ramp)
        ev += (expectedRes / (vpInfo.per || 1)) * vpMC(gensLeft) * 0.8; // 0.8 = action slot cost
      } else if (vpInfo.type === 'per_tag') {
        var tagCount = (myTags[vpInfo.tag] || 0) + 2; // current + ~2 future
        ev += (tagCount / (vpInfo.per || 1)) * vpMC(gensLeft);
      } else if (vpInfo.type === 'per_colony' || vpInfo.type === 'per_city') {
        // Estimate ~4-6 colonies or cities total in 3P game
        ev += (5 / (vpInfo.per || 1)) * vpMC(gensLeft);
      } else if (vpInfo.type === 'special') {
        ev += vpMC(gensLeft) * 2; // conservative estimate: ~2 VP
      }
    }

    // ── BLUE CARD ACTIONS (recurring) ──
    // PvP: only Alpha skips parsed actions when MANUAL_EV exists
    var hasManualEV = !!MANUAL_EV[name];
    if (!hasManualEV) {
      if (sharedScoreRecurringActionValue) {
        ev += sharedScoreRecurringActionValue({
          act: act,
          vpInfo: vpInfo,
          gensLeft: gensLeft,
          redsTax: redsTax,
          stockValues: STOCK_MC,
          prodValues: PROD_MC,
          trMC: trMC,
        });
      } else {
        if (act.addResources && vpInfo && vpInfo.type === 'per_resource') {
          // Already counted in VP accumulator above, don't double count
        } else if (act.addResources) {
          ev += gensLeft * 1; // generic resource gain, small value
        }
        if (act.drawCard) ev += gensLeft * act.drawCard * 3; // card/gen
        if (act.stock) {
          for (var ask in act.stock) {
            ev += gensLeft * (act.stock[ask] || 0) * (STOCK_MC[ask] || 1) * 0.5;
          }
        }
        if (act.production) {
          for (var apk in act.production) {
            ev += gensLeft * (act.production[apk] || 0) * (PROD_MC[apk] || 1) * 0.5;
          }
        }
        if (act.tr) ev += gensLeft * act.tr * trMC(gensLeft, redsTax) * 0.5;
        if (act.global) {
          for (var agk in act.global) {
            ev += gensLeft * (act.global[agk] || 0) * trMC(gensLeft, redsTax) * 0.5;
          }
        }
      }
    }

    // ── CARD DISCOUNT (engine value) ──
    if (sharedScoreCardDiscountValue) {
      ev += sharedScoreCardDiscountValue({
        discount: discount,
        gensLeft: gensLeft,
      });
    } else if (discount && discount.amount) {
      var cardsPerGen = 2.5; // avg cards played per gen (universal discount)
      if (discount.tag) cardsPerGen = 1; // tag-specific: fewer matching cards
      ev += discount.amount * cardsPerGen * gensLeft;
    }
    if (sharedScoreHandDiscountValue) {
      ev += sharedScoreHandDiscountValue({
        name: name,
        discount: discount,
        handCards: handCards,
        getCardTags: function(cardName) {
          return _cardTags[cardName] || [];
        },
      });
    }
    if (sharedScoreCityTimingValue) {
      ev += sharedScoreCityTimingValue({
        name: name,
        beh: beh,
        tp: tp,
        steps: steps,
        gensLeft: gensLeft,
        isCityCard: function(cardName) { return CITY_CARDS.has(cardName); },
        isOffBoardCityCard: isOffBoardCityCard,
      });
    }
    if (sharedScoreProductionTimingValue) {
      ev += sharedScoreProductionTimingValue({
        name: name,
        gen: gen,
        steps: steps,
        reqPenalty: reqPenalty,
        isProdCard: function(cardName) { return PROD_CARDS.has(cardName); },
      });
    }
    if (sharedScoreCardTimingShapeValue) {
      ev += sharedScoreCardTimingShapeValue({
        name: name,
        cost: cost,
        steps: steps,
        vpInfo: vpInfo,
        beh: beh,
        cd: cd,
        isVPCard: function(cardName) { return VP_CARDS.has(cardName); },
        isDynamicVPCard: function(cardName) { return DYNAMIC_VP_CARDS.has(cardName); },
      });
    }

    // ── DECREASE ANY PRODUCTION (opponent harm) ──
    // In 3P: hurting 1 opponent helps the 3rd for free → halve value
    if (sharedScoreCardDisruptionValue) {
      ev += sharedScoreCardDisruptionValue({ beh: beh });
    } else {
      if (beh.decreaseAnyProduction) {
        ev += beh.decreaseAnyProduction.count * 1.5; // small bonus, nerfed for 3P
      }
      if (beh.removeAnyPlants) {
        ev += beh.removeAnyPlants * 0.5; // low value in 3P
      }
    }

    // ── TAG VALUE / AWARDS / CORPORATION SYNERGY ──
    var isEvent = tags.indexOf('event') >= 0;
    var corp = (tp.tableau && tp.tableau[0] && (tp.tableau[0].name || tp.tableau[0])) || '';
    if (sharedScoreCardMetaBonuses) {
      var metaBonuses = sharedScoreCardMetaBonuses({
        tags: tags,
        tp: tp,
        myTags: myTags,
        cost: cost,
        gensLeft: gensLeft,
        prod: prod,
        beh: beh,
        discount: discount,
        cd: cd,
        act: act,
        state: state,
        tagValue: TAG_VALUE,
        stockValues: STOCK_MC,
        vpMC: vpMC,
      });
      ev += metaBonuses.delta;
      isEvent = metaBonuses.isEvent;
      corp = metaBonuses.corp;
    } else {
      var hasBuilding = tags.indexOf('building') >= 0;
      var hasSpace = tags.indexOf('space') >= 0;
      if (hasBuilding && (tp.steel || 0) > 0) {
        var steelVal = tp.steelValue || 2;
        var steelSave = Math.min(tp.steel * steelVal, cost);
        ev += steelSave;
      }
      if (hasSpace && (tp.titanium || 0) > 0) {
        var tiVal = tp.titaniumValue || 3;
        var tiSave = Math.min(tp.titanium * tiVal, cost);
        ev += tiSave;
      }
      if (!isEvent) {
        for (var tgi = 0; tgi < tags.length; tgi++) {
          var tg = tags[tgi];
          ev += TAG_VALUE[tg] || 0.5;
          var existing = myTags[tg] || 0;
          if (existing >= 5) ev += 5;
          else if (existing >= 3) ev += 3;
          else if (existing >= 1) ev += 1;
        }
      } else {
        ev += 1;
      }
      if (tags.length === 0) ev -= 3;
      var fundedAwards = (state && state.game && state.game.fundedAwards) || [];
      if (fundedAwards.length > 0 && !isEvent) {
        for (var fai = 0; fai < fundedAwards.length; fai++) {
          var awName = ((fundedAwards[fai] && fundedAwards[fai].name) || fundedAwards[fai] || '').toLowerCase();
          if (awName.indexOf('scientist') >= 0 && tags.indexOf('science') >= 0) ev += 3;
          if (awName.indexOf('thermalist') >= 0 && prod && (prod.heat > 0 || prod.energy > 0)) ev += 2;
          if (awName.indexOf('banker') >= 0 && prod && prod.megacredits > 0) ev += prod.megacredits * 1.5;
          if (awName.indexOf('miner') >= 0 && (tags.indexOf('building') >= 0 || (prod && (prod.steel > 0 || prod.titanium > 0)))) ev += 2;
          if (awName.indexOf('landlord') >= 0 && beh.city) ev += 4;
          if (awName.indexOf('venuphile') >= 0 && tags.indexOf('venus') >= 0) ev += 3;
        }
      }
      if (corp) {
        if (corp === 'Saturn Systems' && tags.indexOf('jovian') >= 0) ev += gensLeft * 1;
        if (corp === 'Arklight') {
          if (tags.indexOf('animal') >= 0) ev += vpMC(gensLeft);
          if (tags.indexOf('plant') >= 0) ev += vpMC(gensLeft) * 0.6;
        }
        if (corp === 'Teractor' && tags.indexOf('earth') >= 0) {
          ev += 3;
          if (discount && discount.tag === 'earth') ev += discount.amount * 0.8 * gensLeft;
        }
        if (corp === 'Interplanetary Cinematics' && isEvent) ev += 2;
        if (corp === 'Point Luna' && tags.indexOf('earth') >= 0) ev += 3.5;
        if (corp === 'Manutech' && prod) {
          for (var mk in prod) {
            if (prod[mk] > 0) ev += prod[mk] * (STOCK_MC[mk] || 1);
          }
        }
        if (corp === 'Stormcraft Incorporated') {
          if (tags.indexOf('jovian') >= 0) ev += 2;
          if (cd.resourceType === 'Floater') ev += 3;
        }
        if (corp === 'Polyphemos' && act.addResources) ev += gensLeft * 1;
        if (corp === 'Mining Guild' && hasBuilding) ev += gensLeft * 0.5;
        if (corp === 'Ecoline' && tags.indexOf('plant') >= 0) ev += 2;
        if (corp === 'CrediCor' && cost >= 20) ev += 4;
        if (corp === 'Thorgate' && tags.indexOf('power') >= 0) ev += 3;
        if (corp === 'Poseidon' && beh.colony) ev += gensLeft * 1;
      }
    }

    // ── CARD-SPECIFIC CONTEXT ADJUSTMENTS ──
    var handTagCount = function(tag) {
      if (sharedCountTagsInHand) {
        return sharedCountTagsInHand(tag, handCards, name, function(cardName) {
          return _cardTags[cardName] || [];
        });
      }
      var count = 0;
      for (var hci = 0; hci < handCards.length; hci++) {
        var hcName = handCards[hci].name || handCards[hci];
        if (!hcName || hcName === name) continue;
        var hcTags = _cardTags[hcName] || [];
        if (hcTags.indexOf(tag) >= 0) count++;
      }
      return count;
    };
    var currentWildTags = myTags.wild || 0;
    var handWildTags = handTagCount('wild');
    var futureTagSupport = function(tag) {
      return handTagCount(tag) + handWildTags;
    };
    var tagSupport = function(tag) {
      return (myTags[tag] || 0) + handTagCount(tag) + currentWildTags + handWildTags;
    };
    var pairedTagSupport = function(tagA, tagB) {
      var baseA = (myTags[tagA] || 0) + handTagCount(tagA);
      var baseB = (myTags[tagB] || 0) + handTagCount(tagB);
      var wild = currentWildTags + handWildTags;
      return Math.min(Math.max(baseA, baseB), Math.floor((baseA + baseB + wild) / 2));
    };
    var multiTagSupport = function(tagsArr) {
      var total = currentWildTags + handWildTags;
      for (var tsi = 0; tsi < tagsArr.length; tsi++) {
        total += (myTags[tagsArr[tsi]] || 0) + handTagCount(tagsArr[tsi]);
      }
      return total;
    };

    if (tags.indexOf('science') >= 0 && tableauNames.has('Venusian Animals')) {
      ev += 8; // existing Venusian Animals converts each future science tag into 1 VP.
    }

    if (name === 'Bactoviral Research') {
      var bactoviralMicrobes = Math.max(1, (myTags.science || 0) + currentWildTags + 1);
      var bactoviralResourceValue = scoreAddedResourcesToBestVpCard('microbe', bactoviralMicrobes, state, 8);
      ev += bactoviralResourceValue.value + drawVal;
    }

    if (name === 'Imported Nutrients') {
      var nutrientResourceValue = scoreAddedResourcesToBestVpCard('microbe', 4, state, 8);
      ev += nutrientResourceValue.value;
    }

    if (sharedScoreAcquiredCompanyTimingValue) {
      ev += sharedScoreAcquiredCompanyTimingValue({
        name: name,
        gen: gen,
        gensLeft: gensLeft,
        corp: corp,
        tableauNames: tableauNames,
        handCards: handCards,
      });
    }

    if (name === 'Space Station') {
      var handSpace = futureTagSupport('space');
      if (handSpace === 0) ev -= 6;
      else if (handSpace === 1) ev -= 3;
      else if (handSpace >= 4) ev += 2;
    }

    if (name === 'Satellites') {
      var totalSpace = tagSupport('space');
      if (totalSpace <= 2) ev -= 8;
      else if (totalSpace <= 4) ev -= 4;
      else if (totalSpace >= 7) ev += 3;
    }

    if (name === 'Protected Valley') {
      if (gensLeft <= 2) ev -= 10;
      else if (gensLeft <= 4) ev -= 6;
      else if (gensLeft <= 6) ev -= 3;
      if ((myTags.plant || 0) >= 2 || corp === 'Ecoline' || corp === 'EcoLine') ev += 3;
    }

    if (name === 'Stanford Torus') {
      if (gensLeft <= 3) ev -= 8;
      else if (gensLeft <= 5) ev -= 4;
      var citySynergy = 0;
      if ((myTags.city || 0) + currentWildTags >= 1) citySynergy += 2;
      if (corp === 'Tharsis Republic' || corp === 'Philares') citySynergy += 2;
      if (handTagCount('city') + handWildTags > 0) citySynergy += 1;
      ev += citySynergy;
    }

    if (name === 'Arctic Algae') {
      var oceansLeft = Math.max(0, 9 - (g2.oceans || 0));
      if (oceansLeft <= 1) ev -= 10;
      else if (oceansLeft <= 3) ev -= 6;
      else if (oceansLeft <= 5) ev -= 2;
      else if (oceansLeft >= 7) ev += 2;
      if ((tp.tableau || []).some(function(c) {
        var cn = c.name || c;
        return cn === 'Lakefront Resorts' || cn === 'Kelp Farming' || cn === 'Aquifer Pumping';
      })) ev += 2;
    }

    if (name === 'Designed Microorganisms') {
      var microbeSupport = (myTags.microbe || 0) + handTagCount('microbe');
      if (microbeSupport === 0) ev -= 9;
      else if (microbeSupport === 1) ev -= 5;
      else if (microbeSupport === 2) ev -= 2;
      if ((tp.plantProduction || 0) <= 0) ev -= 2;
      if (gensLeft <= 3) ev -= 5;
      else if (gensLeft <= 5) ev -= 3;
    }

    if (name === 'Floyd Continuum') {
      var completedParams = 0;
      if ((g2.temperature || -30) >= 8) completedParams++;
      if ((g2.oxygenLevel || 0) >= 14) completedParams++;
      if ((g2.oceans || 0) >= 9) completedParams++;
      if ((typeof g2.venusScaleLevel === 'number' ? g2.venusScaleLevel : 30) >= 30) completedParams++;
      if (completedParams <= 1) ev -= 8;
      else if (completedParams === 2) ev -= 4;
      if (gensLeft <= 3) ev += 3;
      else if (gensLeft >= 7 && completedParams <= 2) ev -= 3;
    }

    if (name === 'GHG Producing Bacteria') {
      var ghgSupport = handTagCount('microbe');
      var tempStepsLeft = Math.max(0, Math.round((8 - (g2.temperature || -30)) / 2));
      if (ghgSupport === 0) ev -= 5;
      else if (ghgSupport === 1) ev -= 2;
      if (tempStepsLeft <= 1) ev -= 8;
      else if (tempStepsLeft <= 3) ev -= 4;
      else if (tempStepsLeft >= 6 && ghgSupport >= 1) ev += 2;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Equatorial Magnetizer') {
      var excessEnergy = (tp.energyProduction || 0) - 2;
      if (excessEnergy <= 0) ev -= 10;
      else if (excessEnergy === 1) ev -= 5;
      else if (gensLeft <= 3 && excessEnergy >= 2) ev += 2;
    }

    if (name === 'Security Fleet') {
      var tiFlow = (tp.titaniumProduction || 0) + Math.floor((tp.titanium || 0) / 3);
      if (tiFlow <= 1) ev -= 12;
      else if (tiFlow === 2) ev -= 6;
      if (gensLeft >= 6) ev -= 4;
      else if (gensLeft <= 2 && tiFlow >= 3) ev += 3;
    }

    if (name === 'Directed Impactors') {
      var impTempSteps = Math.max(0, Math.round((8 - (g2.temperature || -30)) / 2));
      var impTi = (tp.titaniumProduction || 0) + Math.floor((tp.titanium || 0) / 3);
      if (impTempSteps <= 1) ev -= 10;
      else if (impTempSteps <= 3) ev -= 4;
      if (impTi === 0) ev -= 4;
      else if (impTi >= 3 && impTempSteps >= 4) ev += 2;
    }

    if (name === 'Deuterium Export') {
      var deutFloaters = (myTags.venus || 0) + handTagCount('venus');
      if (deutFloaters <= 1) ev -= 5;
      else if (deutFloaters === 2) ev -= 2;
      if (gensLeft <= 2) ev -= 10;
      else if (gensLeft <= 4) ev -= 5;
    }

    if (name === 'Atmo Collectors') {
      var atmoFloaters = (myTags.venus || 0) + handTagCount('venus');
      if (atmoFloaters <= 1) ev -= 6;
      if (gensLeft <= 2) ev -= 12;
      else if (gensLeft <= 4) ev -= 6;
    }

    if (name === 'Nitrite Reducing Bacteria') {
      var nitriteSupport = (myTags.microbe || 0) + handTagCount('microbe');
      var oxyStepsLeft = Math.max(0, 14 - (g2.oxygenLevel || 0));
      if (nitriteSupport <= 1) ev -= 6;
      else if (nitriteSupport === 2) ev -= 3;
      if (oxyStepsLeft <= 1) ev -= 10;
      else if (oxyStepsLeft <= 3) ev -= 4;
      if (gensLeft <= 2) ev -= 10;
      else if (gensLeft <= 4) ev -= 5;
    }

    if (name === 'Saturn Surfing') {
      var surfingEarth = tagSupport('earth');
      if (surfingEarth <= 1) ev -= 7;
      else if (surfingEarth === 2) ev -= 3;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Power Infrastructure') {
      var infraEnergy = (tp.energyProduction || 0);
      if (infraEnergy <= 1) ev -= 8;
      else if (infraEnergy === 2) ev -= 4;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Regolith Eaters') {
      var regolithSupport = (myTags.microbe || 0) + handTagCount('microbe');
      var regolithOxySteps = Math.max(0, 14 - (g2.oxygenLevel || 0));
      if (regolithSupport <= 1) ev -= 6;
      else if (regolithSupport === 2) ev -= 3;
      if (regolithOxySteps <= 1) ev -= 10;
      else if (regolithOxySteps <= 3) ev -= 4;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Aerial Mappers') {
      var mapperVenus = (myTags.venus || 0) + handTagCount('venus');
      var mapperFloaters = hasVPCard(tableauNames, FLOATER_VP_CARDS) ? 1 : 0;
      if (mapperVenus <= 1) ev -= 7;
      else if (mapperVenus === 2) ev -= 3;
      if (!mapperFloaters && mapperVenus <= 2) ev -= 2;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Floating Habs') {
      var habsVenus = (myTags.venus || 0) + handTagCount('venus');
      var habsFloaters = hasVPCard(tableauNames, FLOATER_VP_CARDS) ? 1 : 0;
      if (habsVenus <= 1) ev -= 7;
      else if (habsVenus === 2) ev -= 3;
      if (!habsFloaters) ev -= 3;
      if (gensLeft <= 2) ev -= 10;
      else if (gensLeft <= 4) ev -= 5;
    }

    if (name === 'Cultivation of Venus') {
      var venusTags = tagSupport('venus');
      var venusStepsLeft = Math.max(0, Math.round((30 - (typeof g2.venusScaleLevel === 'number' ? g2.venusScaleLevel : 30)) / 2));
      if (venusTags <= 2) ev -= 8;
      else if (venusTags === 3) ev -= 3;
      if ((tp.plants || 0) < 6 && (tp.plantProduction || 0) <= 0) ev -= 5;
      if (venusStepsLeft <= 1) ev -= 10;
      else if (venusStepsLeft <= 3) ev -= 4;
      if (gensLeft <= 2) ev -= 8;
    }

    if (name === 'Venus Orbital Survey') {
      var vosVenus = (myTags.venus || 0) + handTagCount('venus');
      var vosSteps = Math.max(0, Math.round((30 - (typeof g2.venusScaleLevel === 'number' ? g2.venusScaleLevel : 30)) / 2));
      if (vosVenus <= 1) ev -= 9;
      else if (vosVenus === 2) ev -= 4;
      if (vosSteps <= 1) ev -= 12;
      else if (vosSteps <= 3) ev -= 6;
      if (gensLeft <= 2) ev -= 10;
      else if (gensLeft <= 4) ev -= 5;
    }

    if (name === 'AstroDrill') {
      var astroTi = (tp.titaniumProduction || 0) + Math.floor((tp.titanium || 0) / 3);
      var astroTempSteps = Math.max(0, Math.round((8 - (g2.temperature || -30)) / 2));
      if (astroTi === 0) ev -= 6;
      else if (astroTi === 1) ev -= 3;
      if (astroTempSteps <= 1) ev -= 10;
      else if (astroTempSteps <= 3) ev -= 4;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Rotator Impacts') {
      var rotatorVenus = (myTags.venus || 0) + handTagCount('venus');
      var rotatorTi = (tp.titaniumProduction || 0) + Math.floor((tp.titanium || 0) / 3);
      var rotatorSteps = Math.max(0, Math.round((30 - (typeof g2.venusScaleLevel === 'number' ? g2.venusScaleLevel : 30)) / 2));
      if (rotatorVenus <= 1) ev -= 7;
      else if (rotatorVenus === 2) ev -= 3;
      if (rotatorTi === 0) ev -= 5;
      else if (rotatorTi === 1) ev -= 2;
      if (rotatorSteps <= 1) ev -= 10;
      else if (rotatorSteps <= 3) ev -= 4;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Processor Factory') {
      var processorEnergy = (tp.energyProduction || 0);
      if (processorEnergy <= 1) ev -= 7;
      else if (processorEnergy === 2) ev -= 3;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'HE3 Refinery') {
      var miningRate = g2.miningRate;
      if (typeof miningRate !== 'number') miningRate = g2.moonMiningRate;
      if (typeof miningRate !== 'number') miningRate = Math.max(2, Math.min(6, gen - 1));
      if (miningRate <= 2) ev -= 8;
      else if (miningRate <= 3) ev -= 4;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Venera Base') {
      var veneraTags = (myTags.venus || 0) + handTagCount('venus');
      var veneraFloaterPayoff = hasVPCard(tableauNames, FLOATER_VP_CARDS) ? 1 : 0;
      if (veneraTags <= 1) ev -= 6;
      else if (veneraTags === 2) ev -= 3;
      if (!veneraFloaterPayoff && veneraTags <= 2) ev -= 2;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Battery Factory') {
      var powerTags = (myTags.power || 0) + handTagCount('power');
      var powerEnergy = (tp.energyProduction || 0);
      if (powerTags <= 1) ev -= 7;
      else if (powerTags === 2) ev -= 3;
      if (powerEnergy <= 1) ev -= 4;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Asteroid Deflection System') {
      var adsTi = (tp.titaniumProduction || 0) + Math.floor((tp.titanium || 0) / 3);
      if (adsTi === 0) ev -= 5;
      else if (adsTi === 1) ev -= 2;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Floating Refinery') {
      var refineryVenus = tagSupport('venus');
      var refineryFloaterTargets = hasVPCard(tableauNames, FLOATER_VP_CARDS) ? 1 : 0;
      if (refineryVenus <= 1) ev -= 8;
      else if (refineryVenus === 2) ev -= 4;
      if (!refineryFloaterTargets && refineryVenus <= 2) ev -= 3;
      if (gensLeft <= 2) ev -= 12;
      else if (gensLeft <= 4) ev -= 6;
    }

    if (name === 'Symbiotic Fungus') {
      var fungusTargets = (myTags.microbe || 0) + handTagCount('microbe');
      if (fungusTargets <= 1) ev -= 7;
      else if (fungusTargets === 2) ev -= 3;
      if (gensLeft <= 2) ev -= 10;
      else if (gensLeft <= 4) ev -= 5;
    }

    if (name === 'Asteroid Rights') {
      var rightsTi = (tp.titaniumProduction || 0) + Math.floor((tp.titanium || 0) / 3);
      var rightsSpace = (myTags.space || 0) + handTagCount('space');
      if (rightsTi === 0) ev -= 6;
      else if (rightsTi === 1) ev -= 2;
      if (rightsSpace <= 2) ev -= 3;
      if (gensLeft <= 2) ev -= 9;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'World Government Advisor') {
      var wgaStepsLeft =
        Math.max(0, Math.round((8 - (g2.temperature || -30)) / 2)) +
        Math.max(0, 14 - (g2.oxygenLevel || 0)) +
        Math.max(0, 9 - (g2.oceans || 0)) +
        Math.max(0, Math.round((30 - (typeof g2.venusScaleLevel === 'number' ? g2.venusScaleLevel : 30)) / 2));
      if (wgaStepsLeft <= 2) ev -= 14;
      else if (wgaStepsLeft <= 5) ev -= 8;
      else if (wgaStepsLeft <= 8) ev -= 4;
      if (gensLeft <= 2) ev -= 8;
    }

    if (name === 'Stormcraft Incorporated') {
      var stormFloaters = (myTags.venus || 0) + handTagCount('venus');
      var stormJovians = (myTags.jovian || 0) + handTagCount('jovian');
      if (stormFloaters <= 1) ev -= 10;
      else if (stormFloaters <= 2) ev -= 5;
      if (stormJovians === 0) ev -= 2;
    }

    if (name === 'Dirigibles') {
      var dirigibleSupport = (myTags.venus || 0) + handTagCount('venus');
      var dirigibleSteps = Math.max(0, Math.round((30 - (typeof g2.venusScaleLevel === 'number' ? g2.venusScaleLevel : 30)) / 2));
      if (dirigibleSupport <= 1) ev -= 7;
      else if (dirigibleSupport === 2) ev -= 3;
      if (dirigibleSteps <= 1) ev -= 10;
      else if (dirigibleSteps <= 3) ev -= 4;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Forced Precipitation') {
      var precipSupport = (myTags.venus || 0) + handTagCount('venus');
      var precipSteps = Math.max(0, Math.round((30 - (typeof g2.venusScaleLevel === 'number' ? g2.venusScaleLevel : 30)) / 2));
      if (precipSupport <= 1) ev -= 8;
      else if (precipSupport === 2) ev -= 4;
      if (getMegaCredits(tp) < 10 && (tp.mc || 0) < 10) ev -= 2;
      if (precipSteps <= 1) ev -= 10;
      else if (precipSteps <= 3) ev -= 4;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Cloud Tourism') {
      var cloudPairs = pairedTagSupport('earth', 'venus');
      if (cloudPairs === 0) ev -= 9;
      else if (cloudPairs === 1) ev -= 4;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Titan Floating Launch-pad') {
      var titanSupport = (myTags.jovian || 0) + handTagCount('jovian') + (myTags.space || 0) + handTagCount('space');
      var titanTi = (tp.titaniumProduction || 0) + Math.floor((tp.titanium || 0) / 3);
      if (titanSupport <= 2) ev -= 7;
      else if (titanSupport <= 4) ev -= 3;
      if (titanTi === 0) ev -= 3;
      if (gensLeft <= 2) ev -= 10;
      else if (gensLeft <= 4) ev -= 5;
    }

    if (name === 'Cryptocurrency') {
      var cryptoSteps = remainingSteps(state);
      if (cryptoSteps <= 6) ev -= 6;
      else if (cryptoSteps <= 10) ev -= 3;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Martian Zoo') {
      var zooEarth = tagSupport('earth');
      var zooCities = tagSupport('city');
      if (zooEarth === 0) ev -= 4;
      if (zooCities === 0) ev -= 2;
      if (gensLeft <= 2) ev -= 12;
      else if (gensLeft <= 4) ev -= 6;
    }

    if (name === 'Business Network') {
      if (gensLeft <= 2) ev -= 12;
      else if (gensLeft <= 4) ev -= 6;
      if ((tp.cardsInHand || []).length >= 8) ev -= 2;
    }

    if (name === 'Thermophiles') {
      var thermoVenusSteps = Math.max(0, Math.round((30 - (typeof g2.venusScaleLevel === 'number' ? g2.venusScaleLevel : 30)) / 2));
      if (thermoVenusSteps <= 1) ev -= 10;
      else if (thermoVenusSteps <= 3) ev -= 5;
      if (gensLeft <= 2) ev -= 10;
      else if (gensLeft <= 4) ev -= 5;
    }

    if (name === 'Private Military Contractor') {
      var pmcEarth = tagSupport('earth');
      if (pmcEarth <= 1) ev -= 5;
      else if (pmcEarth === 2) ev -= 2;
      if (gensLeft <= 2) ev -= 10;
      else if (gensLeft <= 4) ev -= 5;
    }

    if (name === 'Solar Panel Foundry') {
      var foundryMoon = tagSupport('moon');
      var foundryEnergy = (tp.energyProduction || 0) + Math.floor((tp.energy || 0) / 3);
      if (foundryMoon <= 1) ev -= 4;
      if (foundryEnergy === 0) ev -= 4;
      if (gensLeft <= 2) ev -= 10;
      else if (gensLeft <= 4) ev -= 5;
    }

    if (name === 'Refugee Camps') {
      var refugeCities = tagSupport('city');
      if (refugeCities === 0) ev -= 3;
      if (gensLeft <= 2) ev -= 10;
      else if (gensLeft <= 4) ev -= 5;
    }

    if (name === 'Tardigrades') {
      var tardiSupport = (myTags.microbe || 0) + handTagCount('microbe') + (myTags.bio || 0);
      if (tardiSupport === 0) ev -= 6;
      else if (tardiSupport === 1) ev -= 3;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    if (name === 'Search For Life') {
      var sflScience = (myTags.science || 0) + handTagCount('science');
      if (sflScience <= 1) ev -= 7;
      else if (sflScience === 2) ev -= 3;
      if (gensLeft <= 2) ev -= 10;
      else if (gensLeft <= 4) ev -= 5;
    }

    if (name === 'Arcadian Communities') {
      var boardBoard = (state && state.game && state.game.gameOptions && state.game.gameOptions.boardName) ||
        (state && state.game && state.game.gameOptions && state.game.gameOptions.board) || '';
      var boardName = String(boardBoard || '').toLowerCase();
      if (boardName.indexOf('elysium') === -1) ev -= 4;
      if (gensLeft <= 2) ev -= 10;
      else if (gensLeft <= 4) ev -= 5;
    }

    if (name === 'Small Duty Rovers') {
      var moonSupport = (myTags.moon || 0) + handTagCount('moon');
      if (moonSupport <= 1) ev -= 6;
      else if (moonSupport === 2) ev -= 2;
      if (gensLeft <= 2) ev -= 8;
      else if (gensLeft <= 4) ev -= 4;
    }

    // ── MANUAL EV OVERRIDES (effects not captured by parser) ──
    if (sharedScoreNamedCardRuntimeAdjustments) {
      ev += sharedScoreNamedCardRuntimeAdjustments({
        name: name,
        state: state,
        gensLeft: gensLeft,
        handCards: handCards,
        getCardTags: function(cardName, fallbackTags) {
          return getCardTagsByName(cardName, fallbackTags || [], state);
        },
      });
    }
    var manual = name === 'Molecular Printing' ? null : MANUAL_EV[name];
    if (sharedApplyManualEVAdjustments) {
      ev += sharedApplyManualEVAdjustments({
        name: name,
        manual: manual,
        state: state,
        actionResourceReq: ACTION_RESOURCE_REQ,
        tp: tp,
        myTags: myTags,
        handCards: handCards,
        selfName: name,
        getCardTags: function(cardName) {
          return _cardTags[cardName] || [];
        },
        gensLeft: gensLeft,
        redsTax: redsTax,
        trMC: trMC,
        estimateTriggersPerGen: function(triggerTag) {
          return _estimateTriggersPerGen(triggerTag, tp, tp.cardsInHand || []);
        },
      });
    } else if (manual) {
      var perGenMult = 1;
    if (manual.perGen && ACTION_RESOURCE_REQ[name]) {
      var reqRes = ACTION_RESOURCE_REQ[name];
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
    if (manual.perGen) ev += manual.perGen * gensLeft * perGenMult;
      if (manual.once) ev += manual.once;
      if (manual.perTrigger && manual.triggerTag) {
        var _handCards = tp.cardsInHand || [];
        var triggersPerGen = _estimateTriggersPerGen(manual.triggerTag, tp, _handCards);
        ev += manual.perTrigger * triggersPerGen * gensLeft;
      }
    }

    // ── DYNAMIC PRODUCTION OVERRIDES ──
    // Gyropolis: +1 MC-prod per venus + earth tag (replaces static perGen:2)
    if (name === 'Gyropolis') {
      var gyroTags = (myTags['venus'] || 0) + (myTags['earth'] || 0);
      var gyroProd = Math.max(0, gyroTags - 2); // perGen:2 already counted, add extra
      ev += gyroProd * (PROD_MC['megacredits'] || 5) * gensLeft * prodLatePenalty;
    }

    if (name === 'Iron Extraction Center' || name === 'Titanium Extraction Center') {
      // Moon cards scale with mining rate. Prefer the real rate from state when present,
      // otherwise use a conservative generation-based fallback for extension-only contexts.
      var miningRate = g2.miningRate;
      if (typeof miningRate !== 'number') miningRate = g2.moonMiningRate;
      if (typeof miningRate !== 'number') miningRate = Math.max(2, Math.min(6, gen - 1));
      var prodSteps = Math.max(0, Math.floor(miningRate / 2));
      var moonProdType = name === 'Iron Extraction Center' ? 'steel' : 'titanium';
      ev += prodSteps * (PROD_MC[moonProdType] || 1) * gensLeft * prodCompound * prodLatePenalty;
    }

    // ── REQUIREMENT PENALTY ──
    if (reqPenalty > 0) ev -= reqPenalty;

    // ── FINAL: EV minus cost ──
    // cost already includes server-side discounts via calculatedCost
    if (isOpeningHandContext(state)) ev += getOpeningHandBiasForName(name, state);
    var netEV = ev - cost;

    return Math.round(netEV * 10) / 10; // 1 decimal precision
  }

  // ══════════════════════════════════════════════════════════════
  // ENDGAME TIMING DASHBOARD
  // ══════════════════════════════════════════════════════════════

  function endgameTiming(state) {
    if (sharedBuildEndgameTiming) {
      return sharedBuildEndgameTiming(state, {
        remainingSteps: remainingSteps,
        estimateGens: function(_state) {
          return estimateGensLeft(_state);
        },
        shouldPush: shouldPushGlobe,
        vpLead: vpLead,
      });
    }
    var steps = remainingSteps(state);
    var gen = (state && state.game && state.game.generation) || 1;
    var estimatedGens = estimateGensLeft(state);

    var dangerZone;
    if (estimatedGens <= 1) dangerZone = 'red';
    else if (estimatedGens <= 2) dangerZone = 'yellow';
    else dangerZone = 'green';

    var g = (state && state.game) || {};
    var temp = typeof g.temperature === 'number' ? g.temperature : -30;
    var oxy = typeof g.oxygenLevel === 'number' ? g.oxygenLevel : 0;
    var oceans = typeof g.oceans === 'number' ? g.oceans : 0;
    var venus = typeof g.venusScaleLevel === 'number' ? g.venusScaleLevel : 30;
    var breakdown = {
      temp: temp,
      tempSteps: Math.max(0, Math.round((8 - temp) / 2)),
      oxy: oxy,
      oxySteps: Math.max(0, 14 - oxy),
      oceans: oceans,
      oceanSteps: Math.max(0, 9 - oceans),
      venus: venus,
      venusSteps: Math.max(0, Math.round((30 - venus) / 2)),
    };

    return {
      steps: steps,
      estimatedGens: estimatedGens,
      dangerZone: dangerZone,
      shouldPush: shouldPushGlobe(state),
      vpLead: vpLead(state),
      breakdown: breakdown,
      generation: gen,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // HAND CARD RANKING (uses full scoreCard)
  // ══════════════════════════════════════════════════════════════

  function rankHandCards(cards, state) {
    if (sharedRankHandCards) {
      return sharedRankHandCards(cards, state, {
        getCardTags: function(name, fallbackTags) { return _cardTags[name] || fallbackTags || []; },
        scoreCard: scoreCard,
        getOverlayRating: function(name, localState) { return getOverlayRatingByName(name, localState); },
        isVPCard: function(name) { return DYNAMIC_VP_CARDS.has(name) || VP_CARDS.has(name); },
        isEngineCard: function(name) { return ENGINE_CARDS.has(name); },
        isProdCard: function(name) { return PROD_CARDS.has(name); },
        isCityCard: function(name) { return CITY_CARDS.has(name); },
      });
    }
    if (!cards || cards.length === 0) return [];
    var tp = (state && state.thisPlayer) || {};
    var mc = getMegaCredits(tp);
    var steel = tp.steel || 0;
    var titanium = tp.titanium || 0;
    var steps = remainingSteps(state);

    var results = [];
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var name = card.name || '';
      var cost = card.calculatedCost != null ? card.calculatedCost : (card.cost || 0);
      var tags = _cardTags[name] || card.tags || [];

      var score = scoreCard(card, state);

      // Affordability penalty
      var buyingPower = mc;
      if (tags.indexOf('building') >= 0) buyingPower += steel * (tp.steelValue || 2);
      if (tags.indexOf('space') >= 0) buyingPower += titanium * (tp.titaniumValue || 3);
      if (buyingPower < cost) {
        score -= 10;
      }

      // Blend with overlay rating if available (browser only)
      var overlayRating = getOverlayRatingByName(name, state);
      if (overlayRating) {
        var baseScore = (overlayRating.s || 50) + getOpeningHandBiasForName(name, state);
        score = Math.round((score + baseScore) / 2);
      }

      var reason = '';
      if (DYNAMIC_VP_CARDS.has(name) || VP_CARDS.has(name)) reason = 'VP';
      if (ENGINE_CARDS.has(name)) reason = reason ? reason + '+Engine' : 'Engine';
      if (PROD_CARDS.has(name)) reason = reason ? reason + '+Prod' : 'Prod';
      if (CITY_CARDS.has(name)) reason = reason ? reason + '+City' : 'City';
      if (buyingPower < cost) reason += ' [\u043d\u0435\u0442 MC]';
      if (!reason) reason = 'base';

      var stars = score >= 30 ? 3 : (score >= 15 ? 2 : 1);

      results.push({ name: name, score: score, stars: stars, reason: reason, cost: cost });
    }

    results.sort(function(a, b) { return b.score - a.score; });
    return results;
  }

  // ══════════════════════════════════════════════════════════════
  // PASS ANALYSIS
  // ══════════════════════════════════════════════════════════════

  function analyzePass(state) {
    if (sharedAnalyzePass) {
      return sharedAnalyzePass(state, { remainingSteps: remainingSteps });
    }
    var tp = (state && state.thisPlayer) || {};
    var mc = getMegaCredits(tp);
    var heat = tp.heat || 0;
    var plants = tp.plants || 0;
    var steps = remainingSteps(state);
    var gen = (state && state.game && state.game.generation) || 5;

    var canGreenery = plants >= 8;
    var canHeatTR = heat >= 8 && steps > 0;
    var canAffordAction = mc >= 10;
    var cardsInHand = tp.cardsInHandNbr || (tp.cardsInHand ? tp.cardsInHand.length : 0);

    if (steps <= 4 && !canGreenery && !canHeatTR && mc < 15) {
      return { shouldPass: true, confidence: 'high', reason: '\u042d\u043d\u0434\u0433\u0435\u0439\u043c, \u0440\u0435\u0441\u0443\u0440\u0441\u043e\u0432 \u043c\u0430\u043b\u043e' };
    }

    if (gen <= 4 && (canAffordAction || cardsInHand > 0)) {
      return { shouldPass: false, confidence: 'high', reason: '\u0420\u0430\u043d\u043d\u044f\u044f \u0438\u0433\u0440\u0430, \u0435\u0441\u0442\u044c \u0447\u0442\u043e \u0434\u0435\u043b\u0430\u0442\u044c' };
    }

    if (mc < 5 && !canGreenery && !canHeatTR && cardsInHand <= 1) {
      return { shouldPass: true, confidence: 'medium', reason: '\u041c\u0430\u043b\u043e MC, \u043d\u0435\u0442 \u043a\u043e\u043d\u0432\u0435\u0440\u0441\u0438\u0439' };
    }

    return { shouldPass: false, confidence: 'low', reason: '\u0415\u0441\u0442\u044c \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f' };
  }

  // ══════════════════════════════════════════════════════════════
  // ACTION ANALYSIS
  // ══════════════════════════════════════════════════════════════

  function analyzeActions(waitingFor, state) {
    if (sharedAnalyzeActions) {
      return sharedAnalyzeActions(waitingFor, state, {
        remainingSteps: remainingSteps,
        isRedsRuling: isRedsRuling,
        analyzePass: analyzePass,
      });
    }
    if (!waitingFor) return [];

    var tp = (state && state.thisPlayer) || {};
    var mc = getMegaCredits(tp);
    var heat = tp.heat || 0;
    var plants = tp.plants || 0;
    var steps = remainingSteps(state);
    var endgame = steps <= 8;
    var redsTax = isRedsRuling(state) ? 3 : 0;
    var results = [];

    var options = [];
    if (waitingFor.type === 'or' && waitingFor.options) {
      options = waitingFor.options;
    }

    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      var title = (opt.title || opt.buttonLabel || '');
      var titleLow = title.toLowerCase();
      var score = 50;
      var reason = '';
      var emoji = '\ud83d\udcca';

      if (titleLow.indexOf('greenery') >= 0 || (titleLow.indexOf('convert') >= 0 && titleLow.indexOf('plant') >= 0)) {
        if (plants >= 8 && steps > 0) {
          score = endgame ? 95 : 80;
          emoji = '\ud83c\udf3f';
          reason = '\u041e\u0437\u0435\u043b\u0435\u043d\u0435\u043d\u0438\u0435 = TR + VP';
        } else {
          score = 30;
          emoji = '\ud83c\udf3f';
          reason = '\u041c\u0430\u043b\u043e \u0440\u0430\u0441\u0442\u0435\u043d\u0438\u0439';
        }
      }
      else if (titleLow.indexOf('heat') >= 0 || (titleLow.indexOf('temperature') >= 0 && titleLow.indexOf('convert') >= 0)) {
        if (heat >= 8 && steps > 0) {
          score = endgame ? 90 : 75;
          emoji = '\ud83d\udd25';
          reason = '\u0422\u0435\u043f\u043b\u043e \u2192 TR';
        } else {
          score = 25;
          emoji = '\ud83d\udd25';
          reason = '\u041c\u0430\u043b\u043e \u0442\u0435\u043f\u043b\u0430';
        }
      }
      else if (titleLow.indexOf('standard project') >= 0 || (titleLow.indexOf('sell') >= 0 && titleLow.indexOf('patent') >= 0)) {
        score = endgame ? 60 : 45;
        emoji = '\ud83c\udfd7\ufe0f';
        reason = '\u0421\u0442\u0430\u043d\u0434\u0430\u0440\u0442\u043d\u044b\u0439 \u043f\u0440\u043e\u0435\u043a\u0442';
      }
      else if ((titleLow.indexOf('play') >= 0 && titleLow.indexOf('card') >= 0) || titleLow.indexOf('project card') >= 0) {
        score = endgame ? 55 : 70;
        emoji = '\ud83c\udccf';
        reason = endgame ? '\u041a\u0430\u0440\u0442\u0430 (\u043f\u043e\u0437\u0434\u043d\u043e)' : '\u041a\u0430\u0440\u0442\u0430';
      }
      else if (titleLow.indexOf('action') >= 0 || titleLow.indexOf('use') >= 0) {
        score = endgame ? 70 : 65;
        emoji = '\u26a1';
        reason = '\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043a\u0430\u0440\u0442\u044b';
      }
      else if (titleLow.indexOf('trade') >= 0) {
        score = endgame ? 40 : 65;
        emoji = '\ud83d\udea2';
        reason = endgame ? '\u0422\u043e\u0440\u0433\u043e\u0432\u043b\u044f (\u043f\u043e\u0437\u0434\u043d\u043e)' : '\u0422\u043e\u0440\u0433\u043e\u0432\u043b\u044f';
      }
      else if (titleLow.indexOf('pass') >= 0 || titleLow.indexOf('end turn') >= 0 || titleLow.indexOf('skip') >= 0 || titleLow.indexOf('do nothing') >= 0) {
        var passAnalysis = analyzePass(state);
        score = passAnalysis.shouldPass ? 70 : 20;
        emoji = '\u23f8\ufe0f';
        reason = passAnalysis.reason;
      }
      else if (titleLow.indexOf('delegate') >= 0) {
        score = endgame ? 65 : 55;
        emoji = '\ud83c\udfe6';
        reason = '\u0414\u0435\u043b\u0435\u0433\u0430\u0442';
      }
      else if (titleLow.indexOf('milestone') >= 0 || titleLow.indexOf('claim') >= 0) {
        score = 85;
        emoji = '\ud83c\udfc6';
        reason = '\u0412\u0435\u0445\u0430!';
      }
      else if (titleLow.indexOf('award') >= 0 || titleLow.indexOf('fund') >= 0) {
        score = 60;
        emoji = '\ud83c\udfc5';
        reason = '\u041d\u0430\u0433\u0440\u0430\u0434\u0430';
      }
      else if (titleLow.indexOf('colony') >= 0 || titleLow.indexOf('build') >= 0) {
        score = endgame ? 35 : 60;
        emoji = '\ud83c\udf0d';
        reason = '\u041a\u043e\u043b\u043e\u043d\u0438\u044f';
      }
      else if (titleLow.indexOf('sell') >= 0) {
        score = endgame ? 50 : 30;
        emoji = '\ud83d\udcb0';
        reason = '\u041f\u0440\u043e\u0434\u0430\u0436\u0430 \u043a\u0430\u0440\u0442';
      }

      if (redsTax > 0 && (titleLow.indexOf('greenery') >= 0 || titleLow.indexOf('temperature') >= 0 || titleLow.indexOf('ocean') >= 0)) {
        score -= 10;
        reason += ' [Reds \u22123MC]';
      }

      results.push({
        action: opt.title || opt.buttonLabel || 'Option ' + (i + 1),
        score: score,
        reason: reason || '\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435',
        emoji: emoji,
        index: i,
      });
    }

    results.sort(function(a, b) { return b.score - a.score; });
    return results;
  }

  // ══════════════════════════════════════════════════════════════
  // BASELINE SCORING — scoreCard with neutral game state
  // ══════════════════════════════════════════════════════════════

  /**
   * Score a card outside of a game context using a mid-game baseline state.
   * Represents "average moment you'd play this card" for tier-list calibration.
   * @param {string} cardName - exact card name
   * @param {Object} [opts] - optional overrides
   * @param {number} [opts.gen] - generation (default 5 = mid-game)
   * @param {string} [opts.corp] - corporation name for synergy
   * @param {Object} [opts.tags] - player tags (default: typical mid-game spread)
   * @param {number} [opts.steel] - steel in stock (default 2)
   * @param {number} [opts.titanium] - titanium in stock (default 1)
   * @returns {Object} {name, score, gen, gensLeft}
   */
  function scoreCardBaseline(cardName, opts) {
    opts = opts || {};

    // If gen is explicitly set, use single-pass mode
    if (opts.gen != null) {
      return _scoreAtState(cardName, opts.gen, opts);
    }

    // Check if card has max requirements (oxygen max, temperature max, venus max)
    // These cards are early-game by design — score at gen 2 instead of gen 5
    var hasMaxReq = false;
    var gReqs = _cardGlobalReqs[cardName];
    if (gReqs) {
      for (var rk in gReqs) {
        if (typeof gReqs[rk] === 'object' && gReqs[rk].max != null) {
          hasMaxReq = true;
          break;
        }
      }
    }

    if (hasMaxReq) {
      return _scoreAtState(cardName, 2, opts);
    }

    // Check if card has temperature MIN requirement — these are systematically
    // undervalued at gen 5 because quadratic progression puts temp at -20.
    // Score also at gen 7 (temp≈-1) and take the best result.
    var hasTempMinReq = false;
    if (gReqs && gReqs.temperature != null) {
      var tempReq = gReqs.temperature;
      var tempMin = typeof tempReq === 'object' ? tempReq.min : tempReq;
      if (tempMin != null && tempMin > -30) {
        hasTempMinReq = true;
      }
    }

    // Default: mid-game (gen 5) — represents average play timing
    var baseResult = _scoreAtState(cardName, 5, opts);

    if (hasTempMinReq) {
      var lateResult = _scoreAtState(cardName, 7, opts);
      if (lateResult.score > baseResult.score) {
        return lateResult;
      }
    }

    return baseResult;
  }

  function _scoreAtState(cardName, gen, opts) {
    opts = opts || {};
    if (opts.state) {
      var providedState = opts.state;
      if (providedState.game) {
        if (providedState.game.generation == null) providedState.game.generation = gen;
        if (providedState.game.temperature == null) providedState.game.temperature = Math.round(-30 + 38 * Math.max(0, Math.min(1, (gen - 1) / 8)) * Math.max(0, Math.min(1, (gen - 1) / 8)));
        if (providedState.game.oxygenLevel == null) providedState.game.oxygenLevel = Math.round(14 * Math.max(0, Math.min(1, (gen - 1) / 8)) * Math.max(0, Math.min(1, (gen - 1) / 8)));
        if (providedState.game.oceans == null) providedState.game.oceans = Math.round(9 * Math.max(0, Math.min(1, (gen - 1) / 8)) * Math.max(0, Math.min(1, (gen - 1) / 8)));
        if (providedState.game.venusScaleLevel == null) providedState.game.venusScaleLevel = Math.round(30 * Math.max(0, Math.min(1, (gen - 1) / 8)) * Math.max(0, Math.min(1, (gen - 1) / 8)));
      }
      var providedCd = getCardDataByName(cardName, providedState);
      var providedEff = getCardEffectsByName(cardName, providedState);
      var providedCost = (providedEff && providedEff.c != null) ? providedEff.c : (providedCd && providedCd.cost != null ? providedCd.cost : 0);
      return {
        name: cardName,
        score: scoreCard({ name: cardName, cost: providedCost, calculatedCost: providedCost }, providedState),
        gen: gen,
        gensLeft: Math.max(1, 9 - gen + 1),
      };
    }
    // Global parameters scale with generation (quadratic — slow early, fast late)
    // Calibrated from 184 real 3P/WGT games: globals accelerate as players get richer
    var t = Math.max(0, Math.min(1, (gen - 1) / 8));
    var progress = t * t; // quadratic: gen5=0.25, gen7=0.56, gen9=1.0
    var state = {
      _botName: 'Beta',
      game: {
        generation: gen,
        temperature: opts.temperature != null ? opts.temperature : Math.round(-30 + 38 * progress),
        oxygenLevel: opts.oxygenLevel != null ? opts.oxygenLevel : Math.round(14 * progress),
        oceans: opts.oceans != null ? opts.oceans : Math.round(9 * progress),
        venusScaleLevel: opts.venusScaleLevel != null ? opts.venusScaleLevel : Math.round(30 * progress),
        fundedAwards: [],
      },
      players: [{}, {}, {}],
      thisPlayer: {
        // Tags scale with gen: ~2 tags/gen average
        tags: opts.tags || (function() {
          var t = {};
          var tagPool = ['building','space','earth','science','power','plant','venus','event'];
          var total = Math.round(gen * 2);
          for (var i = 0; i < tagPool.length && total > 0; i++) {
            var cnt = Math.min(total, i < 4 ? Math.ceil(gen * 0.4) : Math.ceil(gen * 0.2));
            t[tagPool[i]] = cnt;
            total -= cnt;
          }
          return t;
        })(),
        steel: opts.steel != null ? opts.steel : Math.min(4, Math.round(gen * 0.5)),
        titanium: opts.titanium != null ? opts.titanium : Math.min(3, Math.round(gen * 0.3)),
        steelValue: 2,
        titaniumValue: 3,
        megacredits: 50,
        tableau: opts.corp ? [{ name: opts.corp }] : [],
        cardsInHand: [],
      },
    };

    var cd = getCardDataByName(cardName, state);
    var eff = getCardEffectsByName(cardName, state);
    var cost = (eff && eff.c != null) ? eff.c : (cd && cd.cost != null ? cd.cost : 0);
    var card = { name: cardName, cost: cost, calculatedCost: cost };

    var score = scoreCard(card, state);
    var avgGameLen = 9;
    var gensLeft = Math.max(1, avgGameLen - gen + 1);

    return { name: cardName, score: score, gen: gen, gensLeft: gensLeft };
  }

  // ══════════════════════════════════════════════════════════════
  // MILESTONE & AWARD EVALUATION
  // ══════════════════════════════════════════════════════════════

  /**
   * Evaluate a milestone for thisPlayer.
   * Uses scores from API + threshold from TM_MA_DATA.
   * @param {string} msName - milestone name
   * @param {Object} state - {thisPlayer, game, players}
   * @returns {Object|null} {canClaim, myScore, threshold, distance}
   */
  function milestoneNumber(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function milestoneMaData() {
    if (typeof TM_MA_DATA !== 'undefined') return TM_MA_DATA;
    return (root && root.TM_MA_DATA) || {};
  }

  function playerProductionForMilestone(player, resource) {
    var p = player || {};
    if (resource === 'megacredits' || resource === 'megaCredits' || resource === 'mc') {
      return milestoneNumber(
        p.megaCreditProduction != null ? p.megaCreditProduction :
        p.megacreditProduction != null ? p.megacreditProduction :
        p.megacreditsProduction != null ? p.megacreditsProduction :
        p.mcProduction
      );
    }
    if (resource === 'plants') return milestoneNumber(p.plantProduction);
    if (resource === 'energy+heat') return milestoneNumber(p.energyProduction) + milestoneNumber(p.heatProduction);
    if (resource === 'steel+titanium') return milestoneNumber(p.steelProduction) + milestoneNumber(p.titaniumProduction);
    return milestoneNumber(p[resource + 'Production']);
  }

  function milestoneCountValue(value) {
    if (Array.isArray(value)) return value.length;
    if (value != null) return milestoneNumber(value);
    return null;
  }

  function playerMilestoneCount(player, keys) {
    var p = player || {};
    for (var i = 0; i < keys.length; i++) {
      if (p[keys[i]] != null) return milestoneCountValue(p[keys[i]]);
    }
    return null;
  }

  function milestoneProductionValues(player) {
    var resources = ['megacredits', 'steel', 'titanium', 'plants', 'energy', 'heat'];
    var values = [];
    for (var i = 0; i < resources.length; i++) {
      values.push(Math.max(0, playerProductionForMilestone(player, resources[i])));
    }
    return values;
  }

  function countUniqueMilestoneTags(tags) {
    var count = 0;
    var seen = {};
    var source = tags || {};
    for (var key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      if (key === 'event' || key === 'wild') continue;
      if (milestoneNumber(source[key]) <= 0 || seen[key]) continue;
      seen[key] = true;
      count++;
    }
    return count;
  }

  function milestoneCardName(card) {
    if (!card) return '';
    return typeof card === 'string' ? card : (card.name || '');
  }

  function hasMilestoneRequirementObject(value) {
    if (!value) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return !!value;
  }

  function milestoneCardHasRequirement(card, state) {
    var name = milestoneCardName(card);
    if (hasMilestoneRequirementObject(card && card.requirements)) return true;
    if (hasMilestoneRequirementObject(card && card.globalRequirements)) return true;
    if (hasMilestoneRequirementObject(card && card.tagRequirements)) return true;
    if (!name) return false;
    return hasMilestoneRequirementObject(_cardGlobalReqs[name] || _cardGlobalReqs[baseCardName(name)]) ||
      hasMilestoneRequirementObject(_cardTagReqs[name] || _cardTagReqs[baseCardName(name)]) ||
      hasMilestoneRequirementObject(getCardDataByName(name, state).requirements);
  }

  function milestoneCardCost(card, state) {
    if (!card) return 0;
    if (typeof card === 'object' && card.cost != null) return milestoneNumber(card.cost);
    var name = milestoneCardName(card);
    var effects = getCardEffectsByName(name, state);
    var data = getCardDataByName(name, state);
    if (effects && effects.c != null) return milestoneNumber(effects.c);
    if (data && data.cost != null) return milestoneNumber(data.cost);
    if (typeof card === 'object' && card.calculatedCost != null) return milestoneNumber(card.calculatedCost);
    return 0;
  }

  function milestoneCardHasPositiveVp(card, state) {
    if (!card) return false;
    if (typeof card === 'object') {
      if (milestoneNumber(card.victoryPoints) > 0) return true;
      if (typeof card.vp === 'number' && card.vp > 0) return true;
      if (milestoneNumber(card.points) > 0) return true;
    }
    var name = milestoneCardName(card);
    var vpDef = name ? getCardVPByName(name, state) : null;
    if (!vpDef) return false;
    if (vpDef.type === 'static') return milestoneNumber(vpDef.vp) > 0;
    return true;
  }

  function countMilestoneTableauCards(state, predicate) {
    var tableau = (state && state.thisPlayer && state.thisPlayer.tableau) || [];
    var count = 0;
    for (var i = 0; i < tableau.length; i++) {
      if (predicate(tableau[i], state)) count++;
    }
    return count;
  }

  function milestoneScoreFromPlayer(maDef, state) {
    if (!maDef || !state || !state.thisPlayer) return null;
    var tp = state.thisPlayer;
    if (maDef.check === 'tr') return milestoneNumber(tp.terraformRating);
    if (maDef.check === 'prod') return playerProductionForMilestone(tp, maDef.resource);
    if (maDef.check === 'events') return milestoneNumber(tp.tags && tp.tags.event);
    if (maDef.check === 'tags') return milestoneNumber(tp.tags && tp.tags[maDef.tag]);
    if (maDef.check === 'cities') return playerMilestoneCount(tp, ['citiesCount', 'cityCount', 'cities']);
    if (maDef.check === 'tableau') return playerMilestoneCount(tp, ['tableauCount', 'tableau']);
    if (maDef.check === 'colonies') return countOwnColonies(state, tp);
    if (maDef.check === 'greeneries') return playerMilestoneCount(tp, ['greeneriesCount', 'greeneryCount', 'greeneries', 'greeneryTiles']);
    if (maDef.check === 'hand') return playerMilestoneCount(tp, ['cardsInHandCount', 'cardsInHand', 'hand']);
    if (maDef.check === 'maxProd') return Math.max.apply(Math, milestoneProductionValues(tp));
    if (maDef.check === 'totalProd') {
      var prodValues = milestoneProductionValues(tp);
      var total = 0;
      for (var pi = 0; pi < prodValues.length; pi++) total += prodValues[pi];
      return total;
    }
    if (maDef.check === 'uniqueTags') return countUniqueMilestoneTags(tp.tags);
    if (maDef.check === 'bioTags') {
      var tags = tp.tags || {};
      return milestoneNumber(tags.plant) + milestoneNumber(tags.microbe) + milestoneNumber(tags.animal);
    }
    if (maDef.check === 'reqCards') return countMilestoneTableauCards(state, milestoneCardHasRequirement);
    if (maDef.check === 'expensiveCards') return countMilestoneTableauCards(state, function(card, cardState) {
      return milestoneCardCost(card, cardState) >= 20;
    });
    if (maDef.check === 'vpCards') return countMilestoneTableauCards(state, milestoneCardHasPositiveVp);
    return null;
  }

  function evaluateMilestone(msName, state) {
    if (!state || !state.game || !state.thisPlayer) return null;
    var milestones = state.game.milestones || [];
    var ms = null;
    for (var i = 0; i < milestones.length; i++) {
      if (milestones[i].name === msName) { ms = milestones[i]; break; }
    }
    if (!ms) return null;

    // Get threshold from TM_MA_DATA or ms.threshold (API sometimes provides it)
    var maData = milestoneMaData();
    var maDef = maData[msName];
    var threshold = milestoneNumber(ms.threshold) > 0 ? milestoneNumber(ms.threshold) : (maDef && milestoneNumber(maDef.target) > 0 ? milestoneNumber(maDef.target) : 0);
    if (threshold <= 0) return null; // unknown milestone, can't evaluate

    // Find thisPlayer's score
    var myColor = state.thisPlayer.color;
    var myScore = null;
    if (ms.scores) {
      for (var si = 0; si < ms.scores.length; si++) {
        if (ms.scores[si].playerColor === myColor || ms.scores[si].color === myColor) {
          myScore = milestoneNumber(ms.scores[si].score);
          break;
        }
      }
    }
    if (myScore === null) myScore = milestoneScoreFromPlayer(maDef, state);
    if (myScore === null) return null;

    var atMost = maDef && maDef.thresholdDirection === 'atMost';
    var canClaim = atMost ? myScore <= threshold : myScore >= threshold;
    return { canClaim: canClaim, myScore: myScore, threshold: threshold, distance: atMost ? myScore - threshold : threshold - myScore };
  }

  /**
   * Evaluate an award for thisPlayer.
   * @param {string} awName - award name
   * @param {Object} state - {thisPlayer, game, players}
   * @returns {Object|null} {winning, tied, myScore, bestOppScore, bestOppName, margin}
   */
  function evaluateAward(awName, state) {
    if (!state || !state.game || !state.thisPlayer) return null;
    var awards = state.game.awards || [];
    var aw = null;
    for (var i = 0; i < awards.length; i++) {
      if (awards[i].name === awName) { aw = awards[i]; break; }
    }
    if (!aw || !aw.scores || aw.scores.length === 0) return null;

    var myColor = state.thisPlayer.color;
    var myScore = 0, bestOppScore = 0, bestOppName = '';
    for (var si = 0; si < aw.scores.length; si++) {
      var s = aw.scores[si];
      var sColor = s.playerColor || s.color;
      var sScore = s.score || 0;
      if (sColor === myColor) {
        myScore = sScore;
      } else {
        if (sScore > bestOppScore) {
          bestOppScore = sScore;
          bestOppName = s.playerName || s.name || sColor;
        }
      }
    }

    var margin = myScore - bestOppScore;
    return { winning: margin > 0, tied: margin === 0 && myScore > 0, myScore: myScore, bestOppScore: bestOppScore, bestOppName: bestOppName, margin: margin };
  }

  // ══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════

  var TM_BRAIN = {
    // Data injection
    setCardData: setCardData,

    // Card category sets
    VP_CARDS: VP_CARDS,
    ENGINE_CARDS: ENGINE_CARDS,
    CITY_CARDS: CITY_CARDS,
    PROD_CARDS: PROD_CARDS,
    DYNAMIC_VP_CARDS: DYNAMIC_VP_CARDS,
    ANIMAL_VP_CARDS: ANIMAL_VP_CARDS,
    MICROBE_VP_CARDS: MICROBE_VP_CARDS,
    FLOATER_VP_CARDS: FLOATER_VP_CARDS,

    // Static data
    COLONY_TRADE: COLONY_TRADE,
    COLONY_BUILD_PRIORITY: COLONY_BUILD_PRIORITY,
    PREF_CORPS: PREF_CORPS,
    PREF_PRELUDES: PREF_PRELUDES,
    STATIC_VP: STATIC_VP,
    PAY_ZERO: PAY_ZERO,
    MANUAL_EV: MANUAL_EV,

    // Core analytics
    remainingSteps: remainingSteps,
    estimateGensLeft: estimateGensLeft,
    calcPlayerVP: calcPlayerVP,
    vpLead: vpLead,
    shouldPushGlobe: shouldPushGlobe,
    isRedsRuling: isRedsRuling,
    scoreColonyTrade: scoreColonyTrade,
    scoreCard: scoreCard,
    smartPay: smartPay,

    // Baseline scoring (no game context)
    scoreCardBaseline: scoreCardBaseline,

    // Dashboard & advisor
    endgameTiming: endgameTiming,
    rankHandCards: rankHandCards,
    analyzePass: analyzePass,
    analyzeActions: analyzeActions,

    // Deck analyzer
    analyzeDeck: analyzeDeck,

    // Milestone & Award evaluation
    evaluateMilestone: evaluateMilestone,
    evaluateAward: evaluateAward,
  };

  // ══════════════════════════════════════════════════════════════
  // DECK ANALYZER — remaining cards in deck
  // ══════════════════════════════════════════════════════════════

  /**
   * Analyze remaining cards in the project deck.
   * @param {Object} state - vue-bridge state {thisPlayer, players, game}
   * @param {Object} ratings - TM_RATINGS dict {name: {s, t, y, ...}}
   * @param {Object} cardData - TM_CARD_DATA dict {name: {tags, behavior}}
   * @returns {Object} analysis result
   */

  // Non-project card names (corps, preludes, CEOs) — excluded from deck pool
  var _NON_PROJECT = {
    'Acquired Space Agency':1,'Allied Bank':1,'Anti-desertification Techniques':1,'Aphrodite':1,'Apollo':1,
    'Applied Science':1,'Aquifer Turbines':1,'Arcadian Communities':1,'Aridor':1,'Arklight':1,
    'Asimov':1,'Astrodrill':1,'Atmospheric Enhancers':1,'Beginner Corporation':1,'Biofuels':1,
    'Biolab':1,'Biosphere Support':1,'Bjorn':1,'Board of Directors':1,'Business Empire':1,
    'Caesar':1,'Celestic':1,'Cheung Shing MARS':1,'Clarke':1,'CoLeadership':1,
    'Colony Trade Hub':1,'Corporate Archives':1,'Corridors of Power':1,'CrediCor':1,'Dome Farming':1,
    'Donation':1,'Double Down':1,'Duncan':1,'Early Colonization':1,'Early Settlement':1,
    'Eccentric Sponsor':1,'EcoLine':1,'EcoTec':1,'Ecology Experts':1,'Ender':1,
    'Experimental Forest':1,'Factorum':1,'Faraday':1,'Floating Trade Hub':1,'Floyd':1,
    'Focused Organization':1,'Gaia':1,'Galilean Mining':1,'Giant Solar Collector':1,'Gordon':1,
    'Great Aquifer':1,'Greta':1,'HAL9000':1,'Helion':1,'High Circles':1,
    'Huan':1,'Huge Asteroid':1,'Industrial Complex':1,'Ingrid':1,'Interplanetary Cinematics':1,
    'Inventrix':1,'Io Research Outpost':1,'Jansson':1,'Karen':1,'Kuiper Cooperative':1,
    'Lakefront Resorts':1,'Loan':1,'Lowell':1,'Main Belt Asteroids':1,'Manutech':1,
    'Maria':1,'Martian Industries':1,'Merger':1,'Metal-Rich Asteroid':1,'Metals Company':1,
    'Mining Guild':1,'Mining Operations':1,'Mohole':1,'Mohole Excavation':1,'Mons Insurance':1,
    'Morning Star Inc.':1,'Musk':1,'Naomi':1,'Neil':1,'New Partner':1,
    'Nirgal Enterprises':1,'Nitrogen Shipment':1,'Nobel Prize':1,'Old Mining Colony':1,'Orbital Construction Yard':1,
    'Oscar':1,'Palladin Shipping':1,'Petra':1,'Pharmacy Union':1,'Philares':1,
    'PhoboLog':1,'Planetary Alliance':1,'Point Luna':1,'Polar Industries':1,'PolderTECH Dutch':1,
    'Polyphemos':1,'Poseidon':1,'Power Generation':1,'Preservation Program':1,'Pristar':1,
    'Project Eden':1,'Quill':1,'Recession':1,'Recyclon':1,'Research Network':1,
    'Rise To Power':1,'Robinson Industries':1,'Rogers':1,'Ryu':1,'Sagitta Frontier Services':1,
    'Saturn Systems':1,'Self-Sufficient Settlement':1,'Septem Tribus':1,'Shara':1,'Smelting Plant':1,
    'Society Support':1,'Soil Bacteria':1,'Space Lanes':1,'Spire':1,'Splice':1,
    'Stefan':1,'Stormcraft Incorporated':1,'Strategic Base Planning':1,'Supplier':1,'Supply Drop':1,
    'Tate':1,'Teractor':1,'Terraforming Deal':1,'Terralabs Research':1,'Tharsis Republic':1,
    'Thorgate':1,'Tycho Magnetics':1,'UNMI Contractor':1,'Ulrich':1,'United Nations Mars Initiative':1,
    'Utopia Invest':1,'Valley Trust':1,'VanAllen':1,'Venus Contract':1,'Venus L1 Shade':1,
    'Viron':1,'Vitor':1,'Will':1,'World Government Advisor':1,'Xavier':1,
    'Xu':1,'Yvonne':1,'Zan':1,
    // Pathfinder corps
    'Adhai High Orbit Constructions':1,'Ambient':1,'Aurorai':1,'Bio-Sol':1,'Chimera':1,
    'Collegium Copernicus':1,'Gagarin Mobile Base':1,'Habitat Marte':1,'Mars Direct':1,
    'Mars Maths':1,'Martian Insurance Group':1,'Mind Set Mars':1,'Odyssey':1,'Polaris':1,
    'Ringcom':1,'Robin Haulings':1,'SolBank':1,'Soylent Seedling Systems':1,'Steelaris':1,
    // Pathfinder preludes
    'CO² Reducers':1,'Crew Training':1,'Deep Space Operations':1,'Design Company':1,
    'Experienced Martians':1,'Hydrogen Bombardment':1,'Personal Agenda':1,'Research Grant':1,
    'Survey Mission':1,'The New Space Race':1,'Valuable Gases':1,'Venus First':1,'Vital Colony':1,
    // Missing base/promo corps
    'Curiosity II':1,'Playwrights':1,'Midas':1,'HAL 9000':1,'Albedo Plants':1,
    'Co-leadership':1,'Van Allen':1,'Trade Advance':1,'Agricola Inc':1,
    // Turmoil/other corps
    'Athena':1,'Eris':1,'Incite':1,'Junk Ventures':1,
    'United Nations Mission One':1,'Luna Trade Federation':1,
    // Promo prelude
    'Aerospace Mission':1
  };

  // Expansion → project card names (base+corpera always included, only list expansion-specific)
  var _EXP_CARDS = {
    'base': ["Adaptation Technology","Adapted Lichen","Advanced Ecosystems","Aerobraked Ammonia Asteroid","Algae","Ants","Aquifer Pumping","ArchaeBacteria","Arctic Algae","Artificial Lake","Artificial Photosynthesis","Asteroid","Asteroid Mining","Beam From A Thorium Asteroid","Big Asteroid","Biomass Combustors","Birds","Black Polar Dust","Breathing Filters","Bushes","Capital","Carbonate Processing","Cloud Seeding","Colonizer Training Camp","Comet","Convoy From Europa","Cupola City","Decomposers","Deep Well Heating","Deimos Down","Designed Microorganisms","Domed Crater","Dust Seals","Ecological Zone","Energy Saving","Eos Chasma National Park","Equatorial Magnetizer","Extreme-Cold Fungus","Farming","Fish","Flooding","Food Factory","Fueled Generators","Fusion Power","GHG Factories","GHG Producing Bacteria","Ganymede Colony","Geothermal Power","Giant Ice Asteroid","Giant Space Mirror","Grass","Great Dam","Greenhouses","Heat Trappers","Heather","Herbivores","Ice Asteroid","Ice Cap Melting","Immigrant City","Immigration Shuttles","Import of Advanced GHG","Imported GHG","Imported Hydrogen","Imported Nitrogen","Industrial Microbes","Insects","Insulation","Ironworks","Kelp Farming","Lake Marineris","Large Convoy","Lava Flows","Lichen","Livestock","Local Heat Trapping","Lunar Beam","Magnetic Field Dome","Magnetic Field Generators","Mangrove","Martian Rails","Methane From Titan","Micro-Mills","Mining Expedition","Mining Rights","Mohole Area","Moss","Natural Preserve","Nitrite Reducing Bacteria","Nitrogen-Rich Asteroid","Nitrophilic Moss","Noctis City","Noctis Farming","Nuclear Power","Nuclear Zone","Open City","Optimal Aerobraking","Ore Processor","Permafrost Extraction","Peroxide Power","Pets","Phobos Space Haven","Plantation","Power Grid","Power Plant","Predators","Protected Valley","Rad-Chem Factory","Regolith Eaters","Release of Inert Gases","Research Outpost","Rover Construction","Search For Life","Shuttles","Small Animals","Soil Factory","Solar Power","Solar Wind Power","Soletta","Space Mirrors","Special Design","Steelworks","Strip Mine","Subterranean Reservoir","Symbiotic Fungus","Tectonic Stress Power","Towing A Comet","Trees","Tundra Farming","Underground City","Underground Detonations","Urbanized Area","Water Import From Europa","Water Splitting Plant","Wave Power","Windmills","Worms","Zeppelins"],
    'corpera': ["AI Central","Acquired Company","Advanced Alloys","Anti-Gravity Technology","Asteroid Mining Consortium","Bribed Committee","Building Industries","Business Contacts","Business Network","CEO's Favorite Project","Callisto Penal Mines","Caretaker Contract","Cartel","Commercial District","Corporate Stronghold","Development Center","Earth Catapult","Earth Office","Electro Catapult","Energy Tapping","Fuel Factory","Gene Repair","Great Escarpment Consortium","Hackers","Hired Raiders","Indentured Workers","Industrial Center","Interstellar Colony Ship","Invention Contest","Inventors' Guild","Investment Loan","Io Mining Industries","Lagrange Observatory","Land Claim","Lightning Harvest","Mars University","Mass Converter","Media Archives","Media Group","Medical Lab","Mine","Mineral Deposit","Mining Area","Miranda Resort","Olympus Conference","Physics Complex","Power Infrastructure","Power Supply Consortium","Protected Habitats","Quantum Extractor","Rad-Suits","Research","Restricted Area","Robotic Workforce","Sabotage","Satellites","Security Fleet","Space Elevator","Space Station","Sponsors","Standard Technology","Tardigrades","Technology Demonstration","Terraforming Ganymede","Titanium Mine","Toll Station","Trans-Neptune Probe","Tropical Resort","Vesta Shipyard","Viral Enhancers","Virus"],
    'promo': ['16 Psyche','Advertising','Aqueduct Systems','Asteroid Deflection System','Asteroid Hollowing','Asteroid Rights','Astra Mechanica','Bactoviral Research','Bio Printing Facility','Carbon Nanosystems','Casinos','City Parks','Comet Aiming','Crash Site Cleanup','Cutting Edge Technology','Cyberia Systems','Deimos Down:promo','Directed Heat Usage','Directed Impactors','Diversity Support','Dusk Laser Mining','Energy Market','Field-Capped City','Floyd Continuum','Great Dam:promo','Harvest','Hermetic Order of Mars','Hi-Tech Lab','Homeostasis Bureau','Hospitals','Icy Impactors','Imported Nutrients','Interplanetary Trade','Jovian Embassy','Kaguya Tech','Law Suit','Magnetic Field Generators:promo','Magnetic Shield','Mars Nomads','Martian Lumber Corp','Meat Industry','Meltworks','Mercurian Alloys','Mohole Lake','Neptunian Power Consultants','New Holland','Orbital Cleanup','Outdoor Sports','Penguins','Potatoes','Project Inspection','Protected Growth','Public Baths','Public Plans','Red Ships','Rego Plastics','Robot Pollinators','Saturn Surfing','Self-replicating Robots','Small Asteroid','Snow Algae','Soil Enrichment','Solar Logistics','St. Joseph of Cupertino Mission','Stanford Torus','Static Harvesting','Sub-Crust Measurements','Supercapacitors','Supermarkets','Teslaract','Topsoil Contract','Vermin','Weather Balloons'],
    'venus': ['Aerial Mappers','Aerosport Tournament','Air-Scrapping Expedition','Atalanta Planitia Lab','Atmoscoop','Comet for Venus','Corroder Suits','Dawn City','Deuterium Export','Dirigibles','Extractor Balloons','Extremophiles','Floating Habs','Forced Precipitation','Freyja Biodomes','GHG Import From Venus','Giant Solar Shade','Gyropolis','Hydrogen to Venus','Io Sulphur Research','Ishtar Mining','Jet Stream Microscrappers','Local Shading','Luna Metropolis','Luxury Foods','Maxwell Base','Mining Quota','Neutralizer Factory','Omnicourt','Orbital Reflectors','Rotator Impacts','Sister Planet Support','Solarnet','Spin-Inducing Asteroid','Sponsored Academies','Stratopolis','Stratospheric Birds','Sulphur Exports','Sulphur-Eating Bacteria','Terraforming Contract','Thermophiles','Venus Governor','Venus Magnetizer','Venus Soils','Venus Waystation','Venusian Animals','Venusian Insects','Venusian Plants','Water to Venus'],
    'colonies': ['Air Raid','Airliners','Atmo Collectors','Community Services','Conscription','Corona Extractor','Cryo-Sleep','Earth Elevator','Ecology Research','Floater Leasing','Floater Prototypes','Floater Technology','Galilean Waystation','Heavy Taxation','Ice Moon Colony','Impactor Swarm','Interplanetary Colony Ship','Jovian Lanterns','Jupiter Floating Station','Luna Governor','Lunar Exports','Lunar Mining','Market Manipulation','Martian Zoo','Mining Colony','Minority Refuge','Molecular Printing','Nitrogen from Titan','Pioneer Settlement','Productive Outpost','Quantum Communications','Red Spot Observatory','Refugee Camps','Research Colony','Rim Freighters','Sky Docks','Solar Probe','Solar Reflectors','Space Port','Space Port Colony','Spin-off Department','Sub-zero Salt Fish','Titan Air-scrapping','Titan Floating Launch-pad','Titan Shuttles','Trade Envoys','Trading Colony','Urban Decomposers','Warp Drive'],
    'prelude': ['House Printing','Lava Tube Settlement','Martian Survey','Psychrophiles','Research Coordination','SF Memorial','Space Hotels'],
    'prelude2': ['Ceres Tech Market','Cloud Tourism','Colonial Envoys','Colonial Representation','Envoys From Venus','Floating Refinery','Frontier Town','GHG Shipment','Ishtar Expedition','Jovian Envoys','L1 Trade Terminal','Microgravity Nutrition','Red Appeasement','Soil Studies','Special Permit','Sponsoring Nation','Stratospheric Expedition','Summit Logistics','Unexpected Application','Venus Allies','Venus Orbital Survey','Venus Shuttles','Venus Trade Hub','WG Project'],
    'turmoil': ['Aerial Lenses','Banned Delegate','Cultural Metropolis','Diaspora Movement','Event Analysts','GMO Contract','Martian Media Center','PR Office','Parliament Hall','Political Alliance','Public Celebrations','Recruitment','Red Tourism Wave','Sponsored Mohole','Supported Research','Vote Of No Confidence','Wildlife Dome'],
    'pathfinders': ["Breeding Farms","Prefabrication of Human Habitats","New Venice","Agro-Drones","Wetlands","Rare-Earth Elements","Orbital Laboratories","Dust Storm","Martian Monuments","Martian Nature Wonders","Museum of Early Colonisation","Terraforming Control Station","Ceres Spaceport","Dyson Screens","Lunar Embassy","Geological Expedition","Early Expedition","Hydrogen Processing Plant","Power Plant:Pathfinders","Luxury Estate","Return to Abandoned Technology","Designed Organisms","Space Debris Cleaning Operation","Private Security","Secret Labs","Cyanobacteria","Communication Center","Martian Repository","Small Open Pit Mine","Solar Storm","Space Relay","Declaration of Independence","Martian Culture","Ozone Generators","Small Comet","Economic Espionage","Flat Mars Theory","Asteroid Resources","Economic Help","Interplanetary Transport","Martian Dust Processing Plant","Cultivation of Venus","Expedition to the Surface - Venus","Think Tank","Botanical Experience","Cryptocurrency","Rich Deposits","Solarpedia","Anthozoa","Advanced Power Grid","Specialized Settlement","Charity Donation","Huygens Observatory","Cassini Station","Microbiology Patents","Coordinated Raid","Lobby Halls","Red City","Venera Base","Floater-Urbanism","Soil Detoxification","High Temp. Superconductors","Public Sponsored Grant","Pollinators","Social Events","Controlled Bloom","Terraforming Robots"],
    'moon': ["Mare Nectaris Mine","Mare Nubium Mine","Mare Imbrium Mine","Mare Serenitatis Mine","Habitat 14","Geodesic Tents","The Womb","Tycho Road Network","Aristarchus Road Network","Sinus Irdium Road Network","Momentum Virium Habitat","Luna Trade Station","Luna Mining Hub","Luna Train Station","Deep Lunar Mining","Ancient Shipyards","Luna Resort","Lunar Observation Post","Pride of the Earth Arkship","Archimedes Hydroponics Station","Luna Staging Station","AI Controlled Mine Network","Darkside Meteor Bombardment","Lunar Trade Fleet","Microsingularity Plant","Heliostat Mirror Array","Hypersensitive Silicon Chip Factory","Copernicus Solar Arrays","Darkside Incubation Plant","Algae Bioreactors","Lunar Mine Urbanization","Copernicus Tower","Lunar Industry Complex","Orbital Power Grid","Processor Factory","Rust Eating Bacteria","Solar Panel Foundry","Moon Tether","Nanotech Industries","The Darkside of The Moon Syndicate","Luna Hyperloop Corporation","Crescent Research Association","Luna First Incorporated","The Grand Luna Capital Group","Intragen Sanctuary Headquarters","Luna Trade Federation","First Lunar Settlement","Core Mine","Basic Infrastructure","Lunar Planning Office"],
    'underworld': ["Underground Railway","Gaia City","Nightclubs","Off-World Tax Haven","Man-made Volcano","Underground Amusement Park","Casino","Microprobing Technology","Geothermal Network","Cave City","Orbital Laser Drill","Microgravimetry","Robot Moles","Mining Market Insider","Server Sabotage","Space Wargames","Private Military Contractor","Private Resorts","Earthquake Machine","Micro-Geodesics","Neutrinograph","Underground Habitat","Nanofoundry","Public Spaceline","Expedition Vehicles","Cut-throat Budgeting","Class-action Lawsuit","Research & Development Hub","Planetary Rights Buyout","Investigative Journalism","Whales","Thiolava Vents","Sting Operation","Biobatteries","Acidizing","Exploitation Of Venus","Hadesphere","Demetron Labs","Henkei Genetics","Arborist Collective","Kingdom of Tauraro","Aeron Genomics","Keplertec","Voltagon","Hecate Speditions","Investor Plaza","Inherited Fortune","Tunneling Operation","Ganymede Trading Company","Battery Shipment","Deepwater Dome","Secret Research","Cloud Vortex Outpost"]
  };
  // Build fast lookup: card name → expansion key
  var _CARD_EXP = {};
  for (var _ek in _EXP_CARDS) {
    for (var _ei = 0; _ei < _EXP_CARDS[_ek].length; _ei++) {
      _CARD_EXP[_EXP_CARDS[_ek][_ei]] = _ek;
    }
  }

  // Map gameOptions boolean keys → expansion keys
  var _OPT_TO_EXP = {
    promoCardsOption: 'promo',
    venusNextExtension: 'venus',
    coloniesExtension: 'colonies',
    preludeExtension: 'prelude',
    prelude2Extension: 'prelude2',
    turmoilExtension: 'turmoil',
    pathfindersExpansion: 'pathfinders',
    moonExpansion: 'moon',
    underworldExpansion: 'underworld'
  };

  function analyzeDeck(state, ratings, cardData, draftSeen) {
    if (sharedAnalyzeDeck) {
      return sharedAnalyzeDeck(state, ratings, cardData, draftSeen, {
        optToExp: _OPT_TO_EXP,
        expCards: _EXP_CARDS,
        nonProject: _NON_PROJECT,
        cardExp: _CARD_EXP,
      });
    }
    if (!state || !state.game || !ratings || !cardData) return null;

    var g = state.game;
    var deckSize = g.deckSize || 0;
    var discardSize = g.discardPileSize || 0;
    if (deckSize === 0 && discardSize === 0) return null;

    // 1. Determine enabled expansions from gameOptions
    var opts = g.gameOptions || {};
    var enabledExp = { base: true, corpera: true }; // always
    for (var optKey in _OPT_TO_EXP) {
      if (opts[optKey]) enabledExp[_OPT_TO_EXP[optKey]] = true;
    }
    // Also check expansions sub-object if present
    if (opts.expansions) {
      for (var expK in opts.expansions) {
        if (opts.expansions[expK] && _EXP_CARDS[expK]) enabledExp[expK] = true;
      }
    }

    // 2. Build pool: project cards only, filtered by expansion
    // _CARD_EXP now maps all expansions including pathfinders/moon/underworld
    var poolNames = [];
    var poolSet = {};
    for (var name in cardData) {
      if (_NON_PROJECT[name]) continue;
      var exp = _CARD_EXP[name];
      if (exp && !enabledExp[exp]) continue;
      poolNames.push(name);
      poolSet[name] = true;
    }

    // 3. Collect known cards (hand + draft + all tableaux)
    var known = {};

    // Our hand
    var myHand = (state.thisPlayer && state.thisPlayer.cardsInHand) || [];
    for (var hi = 0; hi < myHand.length; hi++) {
      var hName = myHand[hi].name || myHand[hi];
      if (hName && poolSet[hName]) known[hName] = 'hand';
    }

    // Cards currently in draft offer
    var drafted = state.draftedCards || (state.thisPlayer && state.thisPlayer.draftedCards) || [];
    for (var dri = 0; dri < drafted.length; dri++) {
      var drName = drafted[dri].name || drafted[dri];
      if (drName && poolSet[drName]) known[drName] = 'draft';
    }

    // All players' tableaux
    var allPlayers = state.players || [];
    for (var pi = 0; pi < allPlayers.length; pi++) {
      var pl = allPlayers[pi];
      var tab = pl.tableau || [];
      for (var ti = 0; ti < tab.length; ti++) {
        var tName = tab[ti].name || tab[ti];
        if (tName && poolSet[tName]) known[tName] = 'tableau';
      }
    }
    if (state.thisPlayer && state.thisPlayer.tableau) {
      var myTab = state.thisPlayer.tableau;
      for (var mi = 0; mi < myTab.length; mi++) {
        var mName = myTab[mi].name || myTab[mi];
        if (mName && poolSet[mName]) known[mName] = 'my_tableau';
      }
    }

    // Draft-seen cards (from localStorage tracking)
    if (draftSeen && draftSeen.length > 0) {
      for (var dsi = 0; dsi < draftSeen.length; dsi++) {
        var dsName = draftSeen[dsi];
        if (dsName && poolSet[dsName] && !known[dsName]) {
          known[dsName] = 'draft_seen';
        }
      }
    }

    // 4. Compute unknown
    var unknown = [];
    for (var ui = 0; ui < poolNames.length; ui++) {
      if (!known[poolNames[ui]]) unknown.push(poolNames[ui]);
    }

    // Opponent hand counts
    var oppHands = 0;
    for (var oi = 0; oi < allPlayers.length; oi++) {
      var opl = allPlayers[oi];
      if (state.thisPlayer && opl.color === state.thisPlayer.color) continue;
      oppHands += opl.cardsInHandNbr || 0;
    }

    var totalHidden = deckSize + discardSize + oppHands;
    var pInDeck = totalHidden > 0 ? deckSize / totalHidden : 0;

    // 5. Tier distribution
    var tierCounts = {S:0, A:0, B:0, C:0, D:0, F:0};
    var tierCards = {S:[], A:[], B:[], C:[], D:[], F:[]};
    var tagCounts = {};

    for (var ki = 0; ki < unknown.length; ki++) {
      var uName = unknown[ki];
      var r = ratings[uName];
      var tier = r ? r.t : 'C';
      var score = r ? r.s : 50;
      if (tierCounts[tier] !== undefined) {
        tierCounts[tier]++;
        tierCards[tier].push({name: uName, score: score});
      }
      var cd = cardData[uName];
      if (cd && cd.tags) {
        for (var tgi = 0; tgi < cd.tags.length; tgi++) {
          var tag = cd.tags[tgi].toLowerCase();
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
    }

    for (var t in tierCards) {
      tierCards[t].sort(function(a, b) { return b.score - a.score; });
    }

    // 6. Synergy matching with player's tableau
    var synCards = [];
    var myTableauNames = {};
    if (state.thisPlayer && state.thisPlayer.tableau) {
      for (var si = 0; si < state.thisPlayer.tableau.length; si++) {
        var sn = state.thisPlayer.tableau[si].name || state.thisPlayer.tableau[si];
        myTableauNames[sn] = true;
      }
    }
    for (var yi = 0; yi < unknown.length; yi++) {
      var yName = unknown[yi];
      var yr = ratings[yName];
      if (!yr || !yr.y) continue;
      var matches = [];
      for (var yj = 0; yj < yr.y.length; yj++) {
        if (myTableauNames[yr.y[yj]]) matches.push(yr.y[yj]);
      }
      if (matches.length > 0) {
        synCards.push({name: yName, score: yr.s, matches: matches});
      }
    }
    synCards.sort(function(a, b) { return b.score - a.score; });

    // 7. Draft probability (hypergeometric)
    var saCount = tierCounts.S + tierCounts.A;
    var saInDeck = Math.round(saCount * pInDeck);
    var bPlusCount = saCount + tierCounts.B;
    var bPlusInDeck = Math.round(bPlusCount * pInDeck);
    var pAtLeastOne = sharedPAtLeastOne || function(target, total, draw) {
      if (target <= 0 || total <= 0 || draw <= 0) return 0;
      var pNone = 1;
      for (var di = 0; di < Math.min(draw, total); di++) {
        pNone *= Math.max(0, (total - target - di)) / (total - di);
      }
      return 1 - Math.max(0, pNone);
    };

    return {
      poolSize: poolNames.length,
      knownCount: Object.keys(known).length,
      unknownCount: unknown.length,
      deckSize: deckSize,
      discardSize: discardSize,
      oppHands: oppHands,
      totalHidden: totalHidden,
      pInDeck: pInDeck,
      tierCounts: tierCounts,
      tierCards: tierCards,
      tagCounts: tagCounts,
      synCards: synCards.slice(0, 15),
      draftP: {
        sa: pAtLeastOne(saInDeck, deckSize, 4),
        bPlus: pAtLeastOne(bPlusInDeck, deckSize, 4),
      },
      generation: g.generation || 1,
    };
  }

  // Auto-init from TM_CARD_EFFECTS in browser context
  if (typeof module === 'undefined' && typeof root.TM_CARD_EFFECTS !== 'undefined') {
    var effects = root.TM_CARD_EFFECTS;
    var autoVP = {};
    for (var cardName in effects) {
      var e = effects[cardName];
      if (e.vpAcc || e.vpPer) {
        autoVP[cardName] = { type: 'per_resource', per: e.vpPer || 2 };
      } else if (typeof e.vp === 'number' && e.vp !== 0) {
        autoVP[cardName] = { type: 'static', vp: e.vp };
      }
    }
    var cardTags = typeof root.TM_CARD_TAGS !== 'undefined' ? root.TM_CARD_TAGS : null;
    var cardVP = typeof root.TM_CARD_VP !== 'undefined' ? root.TM_CARD_VP : autoVP;
    var cardData = typeof root.TM_CARD_DATA !== 'undefined' ? root.TM_CARD_DATA : null;
    var globalReqs = typeof root.TM_CARD_GLOBAL_REQS !== 'undefined' ? root.TM_CARD_GLOBAL_REQS : null;
    var tagReqs = typeof root.TM_CARD_TAG_REQS !== 'undefined' ? root.TM_CARD_TAG_REQS : null;
    var cardEffects = typeof root.TM_CARD_EFFECTS !== 'undefined' ? root.TM_CARD_EFFECTS : null;
    setCardData(cardTags, cardVP, cardData, globalReqs, tagReqs, cardEffects);
  }

  // UMD export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TM_BRAIN;
  } else {
    root.TM_BRAIN = TM_BRAIN;
  }

})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
