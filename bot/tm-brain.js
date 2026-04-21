// TM_BRAIN — единое аналитическое ядро для Terraforming Mars.
// Isomorphic: работает в Node.js (require) и Browser (window.TM_BRAIN).
// Объединяет логику из smartbot.js и advisor-core.js.

/* eslint-disable */
;(function(root) {
  'use strict';

  var TM_BRAIN_CORE = (typeof module !== 'undefined' && module.exports)
    ? require('./shared/brain-core')
    : (root.TM_BRAIN_CORE || null);

  var TM_CARD_VARIANTS = (typeof module !== 'undefined' && module.exports)
    ? require('./shared/card-variants')
    : null;
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
  var sharedScoreCardDisruptionValue = TM_BRAIN_CORE && TM_BRAIN_CORE.scoreCardDisruptionValue;
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
  // Variant data
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

  function setCardData(cardTags, cardVP, cardData, cardGlobalReqs, cardTagReqs, cardEffects) {
    if (cardTags) _cardTags = cardTags;
    if (cardVP) _cardVP = cardVP;
    if (cardData) _cardData = cardData;
    if (cardGlobalReqs) _cardGlobalReqs = cardGlobalReqs;
    if (cardTagReqs) _cardTagReqs = cardTagReqs;
    if (cardEffects) _cardEffects = cardEffects;
  }

  // ══════════════════════════════════════════════════════════════
  // VARIANT RESOLUTION
  // ══════════════════════════════════════════════════════════════

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

  var WEAK_PSEUDO_VP_ACTION_CARDS = new Set([
    'Search For Life', 'Security Fleet',
  ]);

  var ANIMAL_VP_CARDS = new Set([
    'Birds', 'Fish', 'Predators', 'Animals', 'Livestock', 'Bees', 'Moose',
    'Penguins', 'Small Animals', 'Space Whales', 'Pets',
  ]);

  var MICROBE_VP_CARDS = new Set([
    'Ants', 'Tardigrades', 'Decomposers', 'Viral Enhancers',
    'Regolith Eaters', 'Extreme-Cold Fungus', 'Nitrophilic Moss', 'Symbiotic Fungus',
    'GHG Factories',
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

  function normalizePaymentShape(pay) {
    var normalized = {};
    var source = pay || {};
    var k;
    for (k in PAY_ZERO) normalized[k] = PAY_ZERO[k];
    for (k in source) {
      if (!Object.prototype.hasOwnProperty.call(source, k)) continue;
      var targetKey = k === 'megaCredits' ? 'megacredits' : k;
      if (!Object.prototype.hasOwnProperty.call(normalized, targetKey)) continue;
      normalized[targetKey] = typeof source[k] === 'number' && !isNaN(source[k]) ? source[k] : normalized[targetKey];
    }
    return normalized;
  }

  function adjustSpecialCardPayment(pay, amount, state, wfOrOpts, cardName) {
    var tp = (state && state.thisPlayer) || {};
    var payRes = normalizePaymentShape(pay);
    var selectedCardName = cardName || (wfOrOpts && wfOrOpts.card) || '';
    var mcKey = 'megacredits';
    var availableMC = tp.megaCredits || tp.megacredits || 0;
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

    pay.megacredits = Math.max(0, Math.min(remaining, tp.megacredits || 0));
    return adjustSpecialCardPayment(pay, amount, state, wfOrOpts, cardName);
  };

  // ══════════════════════════════════════════════════════════════
  // CORE ANALYTICS
  // ══════════════════════════════════════════════════════════════

  var remainingSteps = (TM_BRAIN_CORE && TM_BRAIN_CORE.remainingStepsWithOptions)
    ? function(state) {
      return TM_BRAIN_CORE.remainingStepsWithOptions(state, {
        venusWeight: 0.5,
        zeroWhenCoreDone: false,
      });
    }
    : function(state) {
      var g = (state && state.game) || {};
      var temp   = typeof g.temperature  === 'number' ? g.temperature  : -30;
      var o2     = typeof g.oxygenLevel  === 'number' ? g.oxygenLevel  : 0;
      var oceans = typeof g.oceans       === 'number' ? g.oceans       : 0;
      var venus  = typeof g.venusScaleLevel === 'number' ? g.venusScaleLevel : 30; // 30 = maxed/not in game
      var tempSteps  = Math.max(0, Math.round((8 - temp) / 2));
      var oxySteps   = Math.max(0, 14 - o2);
      var oceanSteps = Math.max(0, 9 - oceans);
      var venusSteps = Math.max(0, Math.round((30 - venus) / 2));
      // Venus steps weighted 0.5x: WGT doesn't raise Venus, so it doesn't end the game
      return tempSteps + oxySteps + oceanSteps + Math.round(venusSteps * 0.5);
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
        includeOpponentPenalty: false,
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
        for (var ci = 0; ci < colonyColors.length; ci++) {
          if (colonyColors[ci] === myColor) myColonies++;
        }
        if (myColonies > 0) {
          var COLONY_BONUS_MC = {
            Luna: 2, Callisto: 5.1, Ceres: 3.6, Io: 1.6,
            Ganymede: 1.5, Europa: 1, Triton: 2.5, Pluto: 3,
            Miranda: 4, Titan: 2.5, Enceladus: 2
          };
          if (name === 'Miranda' && hasVPCard(tableauNames, ANIMAL_VP_CARDS)) COLONY_BONUS_MC.Miranda = 5;
          if (name === 'Titan' && hasVPCard(tableauNames, FLOATER_VP_CARDS)) COLONY_BONUS_MC.Titan = 3;
          if (name === 'Enceladus' && hasVPCard(tableauNames, MICROBE_VP_CARDS)) COLONY_BONUS_MC.Enceladus = 2.5;
          tradeValue += myColonies * (COLONY_BONUS_MC[name] || 1);
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

  var ACTION_RESOURCE_REQ = {
    'Water Splitting Plant': 'energy',
    'Steelworks': 'energy',
    'Ironworks': 'energy',
    'Ore Processor': 'energy',
    'Physics Complex': 'energy',
    'Development Center': 'energy',
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

  // ══════════════════════════════════════════════════════════════
  // MANUAL EV OVERRIDES — for cards where parser misses effects
  // perGen: MC-equivalent value generated per generation
  // once: one-time MC-equivalent bonus
  // ══════════════════════════════════════════════════════════════

  var MANUAL_EV = {
    // === Engine / Discount effects NOT captured by parser ===
    // Cards with cardDiscount in parser data are handled automatically
    'Advanced Alloys':         { perGen: 4 },   // +1 steel AND +1 ti value. With 2 steel+1 ti prod = ~5-7 MC/gen
    'Toll Station':            { perGen: 3 },   // +1 MC per opponent space tag
    'Interplanetary Trade':    { perGen: 4 },   // +1 MC income per 5 played tags

    // === Action cards (draw, MC, TR) ===
    'AI Central':              { perGen: 7 },   // action: draw 2 cards
    'Martian Rails':           { perGen: 2 },   // action: 1 MC per city
    'Business Network':        { perGen: 2 },   // action: buy 1 card (net ~0.5 MC + filtering)
    'Olympus Conference':      { perTrigger: 2, triggerTag: 'science' },   // look+keep on science tag (~0.5 card ≈ 2 MC)
    'Mars University':         { perTrigger: 1.5, triggerTag: 'science' }, // discard→draw on science
    'Media Archives':          { perTrigger: 1, triggerTag: 'event' },     // +1 MC on event
    'Optimal Aerobraking':     { perTrigger: 2, triggerTag: 'space_event' }, // +3 steel +3 heat on space event
    'Standard Technology':     { perGen: 5 },   // trigger: +3 MC per std project. 2-3 SP/gen mid-late = 6-9 MC/gen
    'Red Ships':               { perGen: 3 },   // action: MC per empty adj (scales)
    'Directed Impactors':      { perGen: 1.2 }, // expensive asteroid/TR action; earlier value made Ares rush lines too sticky
    'Power Infrastructure':    { perGen: 2 },   // action: energy→MC

    // === Trigger/passive cards ===
    'Arctic Algae':            { perGen: 3 },   // +2 plants per ocean — calculated based on remaining oceans
    'Herbivores':              { perGen: 1.5 }, // +1 animal per greenery (trigger, not action — ~1/gen)
    'Pets':                    { perGen: 1.5 }, // +1 animal per city (any player, trigger)
    'Ecological Survey':       { perGen: 1.5 }, // +1 plant per greenery action
    'Geological Survey':       { perGen: 1.5 }, // +1 steel per placement bonus
    'Marketing Experts':       { perTrigger: 2, triggerTag: 'event' },   // +1 MC per event played
    'Decomposers':             { perTrigger: 1.5, triggerTag: 'bio' },   // +1 microbe per bio tag (value depends on VP target)
    'GHG Factories':           { perGen: 1.5 }, // spend 1 heat → +1 heat prod
    'Viral Enhancers':         { perTrigger: 1.5, triggerTag: 'bio' },   // +1 plant/animal/microbe on bio tag
    'Ants':                    { perGen: 1 },   // action: steal 1 microbe → this
    'Protected Habitats':      { once: 6 },     // defense: opponents can't remove plants/animals/microbes
    'Immigrant City':          { perGen: 1, once: 3 },  // city(8) - prod penalty(-1MC -1energy ≈ 5) = +3 once + perGen:1 for +1MC/city trigger
    'Adaptation Technology':   { once: 5 },     // -2 to all req → opens cards
    'Media Group':             { perTrigger: 3, triggerTag: 'event' },   // +3 MC per event
    'Inventors Guild':         { perGen: 1.5 }, // action: buy 1 card from deck

    // === Resource placement (multi) ===
    'Nobel Labs':              { perGen: 3.5 }, // action: +2 microbe/data/floater to ANY card (req 4 sci)

    // === Floater actions ===
    'Dirigibles':              { perGen: 2 },   // action: add 1 floater, 3 floaters = 1 Venus TR
    'Jovian Lanterns':         { perGen: 1.5 }, // action: spend 1 ti → +2 floaters, 2 = 1 TR
    'Venusian Animals':        { perTrigger: 1.5, triggerTag: 'venus' }, // +1 animal per Venus tag

    // === Colony-related ===
    'Trade Envoys':            { perGen: 1.5 }, // +1 to trade bonus
    'Rim Freighters':          { perGen: 1.5 }, // trade costs 1 less
    'Orbital Laboratories':    { perGen: 1.5 }, // draw card when trading

    // === Awards/Milestones enablers ===
    'Aquifer Pumping':         { perGen: 2 },   // action: 8 MC → ocean (can use steel)

    // === Discount/value modifiers (not cardDiscount) ===
    'Earth Office':            { perGen: 3 },   // -3 MC on earth cards (high impact, many earth cards)
    'Space Station':           { perGen: 2 },   // -2 MC on space cards
    'Sky Docks':               { perGen: 2 },   // -1 MC on all cards (=cardDiscount but parser misses)
    'Shuttles':                { perGen: 2 },   // -2 MC on space cards + 1 VP
    'Warp Drive':              { perGen: 2 },   // -4 MC on space cards (big but narrow)
    'Mass Converter':          { perGen: 2 },   // -5 MC on space cards (huge but narrow)
    'Rego Plastics':           { perGen: 1.5 }, // +1 steel value
    'Mercurian Alloys':        { perGen: 2 },   // +2 titanium value
    'Lunar Steel':             { perGen: 1 },   // +1 steel value on Moon cards
    'Quantum Extractor':       { perGen: 2 },   // -2 MC on space cards + energy prod

    // === Trigger/passive cards (continued) ===
    'Rover Construction':      { perGen: 1.5 }, // +2 MC per city placed
    'Spin-off Department':     { perGen: 2 },   // draw 1 card on card play with prod increase
    'Meat Industry':           { perGen: 1.5 }, // +2 MC per animal tag played
    'Topsoil Contract':        { perGen: 1 },   // +1 MC per microbe tag + sell plants
    'Breeding Farms':          { perGen: 1 },   // +2 plants per animal tag played
    'Pollinators':             { perGen: 1 },   // +1 animal per plant tag
    'Bioengineering Enclosure':{ perGen: 3 },   // action: +1 animal (1 VP per 2 animals) + science tag. NOT in card_data
    'Event Analysts':          { perGen: 1 },   // +1 influence per event
    'Floater Technology':      { perGen: 1 },   // +1 floater per science tag
    'GMO Contract':            { perGen: 1 },   // +2 MC per animal/plant/microbe tag
    'Agro-Drones':             { perGen: 1 },   // +1 plant per Mars tag
    'Communication Center':    { perGen: 1 },   // +1 MC per event (3P)
    'Advertising':             { perGen: 1 },   // +2 MC per card with req fulfilled
    'Botanical Experience':    { perGen: 1 },   // +1 plant per plant tag (any player)
    'Floyd Continuum':         { perGen: 0.8 }, // science tag is scored separately; only trim the speculative action payoff a bit
    'Self-replicating Robots': { perGen: 3 },   // -2 MC on space/building cards with no tags, repeats
    'Homeostasis Bureau':      { perGen: 1.5 }, // +2 plants per city (trigger)

    // === Action: TR/global raises ===
    'Caretaker Contract':      { perGen: 3 },   // action: 8 heat → 1 TR (great with heat engine)
    'Symbiotic Fungus':        { perGen: 1 },   // action: add 1 microbe to another card
    'Predators':               { perGen: 1 },   // action: steal 1 animal from opponent
    'Extreme-Cold Fungus':     { perGen: 1 },   // action: +1 plant or +1 microbe

    // === Colony / trade modifiers ===
    'Trading Colony':          { perGen: 2 },   // +2 resources per trade (~2 trades left, ~4 MC/trade bonus)
    'L1 Trade Terminal':       { perGen: 2 },   // no energy/MC for trade, +1 VP
    'Cryo-Sleep':              { perGen: 1 },   // +1 trade income

    // === VP accumulators the parser can't score ===
    'Ocean Sanctuary':         { perGen: 3 },   // action: +1 animal per ocean (1 VP/animal). NOT in card_data. Action value only, no double-count
    'Whales':                  { perGen: 4 },   // action: +1 animal (1 VP/animal) + 2 MC prod. Action value, NOT in card_data
    'Anthozoa':                { perGen: 0.5 }, // +1 animal per ocean placed, no action
    'Stratopolis':             { perGen: 1 },   // +1 floater per Venus tag, 1 VP/2 floaters

    // === Action: energy converters (TR/oxygen/ocean) ===
    'Equatorial Magnetizer':   { perGen: 1 },   // trap unless you already have spare energy shell
    'Development Center':      { perGen: 3 },   // action: spend 1 energy → draw 1 card
    'Water Splitting Plant':   { perGen: 2.5 }, // action: spend 3 energy → place ocean
    'Steelworks':              { perGen: 2.5 }, // action: spend 4 energy → +2 steel + oxygen
    'Ironworks':               { perGen: 2 },   // action: spend 4 energy → +1 steel + oxygen
    'Ore Processor':           { perGen: 2 },   // action: spend 4 energy → +1 titanium + oxygen
    'Electro Catapult':        { perGen: 4 },   // action: spend 1 plant/steel → +7 MC
    'Venus Magnetizer':        { perGen: 2 },   // action: -1 energy prod → raise Venus

    // === Action: microbe/floater → TR (free raises) ===
    'GHG Producing Bacteria':  { perGen: 1.5 }, // action: +1 microbe OR spend 2 → raise temp
    'Nitrite Reducing Bacteria': { perGen: 1.5 }, // action: +1 microbe OR spend 3 → +1 TR (starts with 3)
    'Regolith Eaters':         { perGen: 1.5 }, // action: +1 microbe OR spend 2 → raise oxygen
    'Thermophiles':            { perGen: 2 },   // action: +1 microbe OR spend 2 → raise Venus
    'Sulphur-Eating Bacteria': { perGen: 1.5 }, // action: +1 microbe OR spend 3 → raise Venus
    'Forced Precipitation':    { perGen: 1.5 }, // action: 2 MC → +1 floater OR 2 floaters → Venus
    'Rotator Impacts':         { perGen: 1.5 }, // action: 6 MC(ti) → +1 asteroid OR spend 1 → Venus
    'Extractor Balloons':      { perGen: 3 },   // action: +1 floater OR 3 → Venus (starts with 3). ~2 Venus raises in 6 gens
    'Jet Stream Microscrappers': { perGen: 1.5 }, // action: 1 ti → +2 floaters OR 2 → Venus

    // === Action: VP accumulators (free VP/gen) ===
    // VP accumulators: perGen reflects full action+VP value (no separate VP per_resource calc)
    // 1 VP/animal ≈ 3 MC mid-game, with action cost discount → ~2.5/gen
    'Fish':                    { perGen: 2.5 }, // action: +1 animal (1 VP each)
    'Birds':                   { perGen: 2.5 }, // action: +1 animal (1 VP each)
    'Livestock':               { perGen: 2.5 }, // action: +1 animal (1 VP each)
    'Penguins':                { perGen: 2.5 }, // action: +1 animal (1 VP each)
    'Stratospheric Birds':     { perGen: 2.5 }, // action: +1 animal (1 VP each, Venus)
    'Sub-zero Salt Fish':      { perGen: 2.5 }, // action: +1 animal (1 VP each) + colony trigger
    'Small Animals':           { perGen: 1.2 }, // action: +1 animal (1 VP per 2)
    'Refugee Camps':           { perGen: 1.5 }, // action: spend 1 MC → +1 VP counter (net ~2 MC/gen)
    'Martian Zoo':             { perGen: 2 },   // action: 1 MC → +1 VP + earth tag trigger MC
    'Physics Complex':         { perGen: 2 },   // action: spend 6 energy → +1 science (1 VP, expensive)
    'Tardigrades':             { perGen: 0.7 }, // action: +1 microbe (1 VP per 4)
    'Extremophiles':           { perGen: 0.8 }, // action: +1 microbe (1 VP per 3)
    'Venusian Insects':        { perGen: 1.2 }, // action: +1 microbe (1 VP per 2)
    'Floating Habs':           { perGen: 0.7 }, // action: 2 MC → +1 floater (1 VP per 2, costs 2 MC)

    // === Action: resource converters ===
    'Deuterium Export':        { perGen: 1.5 }, // action: +1 floater OR spend 1 → +1 energy prod
    'Atmo Collectors':         { perGen: 1.5 }, // action: +1 floater OR spend 1 → 2 any resource
    'Jupiter Floating Station': { perGen: 1 },  // action: +1 floater (VP/3) + MC on Jovian tag
    'Directed Heat Usage':     { perGen: 1 },   // action: 3 heat → +1 steel or +1 MC prod
    'Cryptocurrency':          { perGen: 1 },   // action: +1 resource (usable as MC for SP)

    // === Discount: Venus ===
    'Venus Waystation':        { perGen: 1.5 }, // -2 MC on Venus cards

    // === One-time value adjustments ===
    'Mohole Lake':             { once: 5 },     // city + ocean + 3 plants, parser misses city/ocean combo
    'Research Outpost':        { once: 3 },     // city + draw 1, parser misses city
    // 'Maxwell Base': removed — parser now handles city + energy cost correctly
    'Robotic Workforce':       { once: 5 },     // duplicate production box of 1 building card
    'Sponsored Academies':     { once: 4 },     // draw 3 - discard 1 = +2 net(7 MC) - opponents draw 1 each(-3.5 in 3P) ≈ 4
    'Psychrophiles':           { perGen: 1 },   // action: +1 microbe (usable as 2 MC on plant cards)

    // === Colony cards (parser writes production:0 for dynamic/colony effects) ===
    'Space Port Colony':       { once: 20 },    // place colony(10) + trade fleet(~10 MC over game) + 1 VP. Parser: prod:0
    'Ice Moon Colony':         { once: 18 },    // place colony(10) + place ocean(~10 with TR+tempo). Parser: prod:0
    'Pioneer Settlement':      { once: 10 },    // place colony (~10 MC total with trade income) + 2 VP. Parser has -2 MC prod, correct
    'Gyropolis':               { perGen: 2 },   // city + MC prod per earth+venus tags. Parser: prod:0 MC
    'Power Grid':              { perGen: 2 },   // energy prod = power tags. Parser: prod:0 energy
    'Luxury Estate':           { once: 6 },     // +1 titanium per city+greenery you own (one-time). Req 7% O2. Tags: Earth/Mars/Building
    'Immigration Shuttles':    { perGen: 5 },   // +5 MC prod + VP per 3 cities. Tags: Earth/Space
    'Geological Expedition':   { perGen: 1.5 }, // effect: +1 extra space bonus per Mars tile placed. 2 VP. Tags: Mars/Science
    'Cassini Station':         { perGen: 3, once: 3 }, // +1 energy prod per colony (~4 in 3P) + 2 floaters/3 data. Tags: Power/Sci/Space
    'Huygens Observatory':     { once: 19 },    // colony(7) + free trade(6) + 1 TR(7) + 1 VP(~3) - overhead ≈ 19. _behOverrides nulls parser tr:1

    // === Dynamic production (parser writes 0, real value depends on board/tags) ===
    'Energy Saving':           { perGen: 3 },   // +1 energy prod per city in play (~4-5 cities in 3P). Parser: prod:0
    'Pollinators':             { perGen: 4 },   // +1 plant prod + 2 MC prod + action: +1 animal (1 VP/animal). Tags: Plant/Animal
    'Zeppelins':               { perGen: 1.5 }, // +1 MC prod per Mars city (~3-4). Parser: prod:0. No tags
    'Hydrogen Processing Plant': { perGen: 1.5 }, // -1 oxy, +1 energy prod per 2 oceans. -1 VP. Tags: Building/Power
    'Advanced Power Grid':     { perGen: 2 },   // +2 energy prod + MC prod per power tag. Tags: Power/Building/Mars
    'Flat Mars Theory':        { perGen: 2.5 }, // +1 MC prod per generation so far (~5 at gen 5). Req: max 1 sci. Tags: Earth
    'Soletta':                 { perGen: 5 },   // +7 heat prod = 1 temp/gen (≈10 MC/gen). Parser values heat at 0.5 → 3.5. Extra 5 for temp conversion potential

    // === Cards missing from card_data entirely ===
    'Quantum Communications':  { perGen: 3 },   // +1 MC prod per colony in play (~3-4 in 3P). Tags: none
    'Floating Trade Hub':      { perGen: 2 },   // +1 MC per trade fleet (~2 in 3P). Tags: Space
    'Lunar Mining':            { perGen: 2.5 }, // +1 ti prod per Moon mining tag (~1-2). Tags: Earth
    'Insects':                 { perGen: 1.5 }, // +1 plant prod per plant tag (have 1+). Tags: Microbe
    'Worms':                   { perGen: 1.5 }, // +1 plant prod per microbe tag (have 1+). Tags: Microbe
    'Floater Leasing':         { perGen: 1.5 }, // +1 MC per floater on any card. Tags: none
    'Community Services':      { perGen: 2 },   // +1 MC prod per no-tag card in play (~3-4). Tags: none
    'Aerosport Tournament':    { once: 5 },     // gain 1 MC per floater on any card (~5 floaters avg). Req 5 floaters. 1 VP
    'Venus Orbital Survey':    { perGen: 3 },   // action: reveal 4, buy Venus cards free (~1 free Venus/2-3 gens). Tags: space,venus
    'Imported Nitrogen':       { once: 5 },     // +3 microbes on microbe card + 2 animals on animal card ≈ 5 MC value (parser misses)
    'Imported Nutrients':      { once: 4 },     // +4 microbes on any microbe card ≈ 4 MC (parser misses)
    'Aerobraked Ammonia Asteroid': { once: 3 }, // +2 microbes ≈ 2 MC + heat-to-temp potential (~1 MC extra). Tags: space
    'Solar Reflectors':        { perGen: 2 },   // 5 heat prod at 0.5/heat is 2.5/gen; real value with temp raises ≈ 4.5/gen. Diff ≈ 2
    'Pharmacy Union':          { perGen: 2, once: -6 }, // Corp: 4 diseases cured by science tags → post-cure each science = +1 TR. ~0.6 sci/gen × trMC. once: -6 = cure delay cost. Two Corps reduces risk. Microbe tags add diseases back (~1/game)
    'Data Leak':               { once: 5 },     // +1 data on each data card (~3-4 data). Tags: none. Pathfinders
    'Cultural Metropolis':     { once: 3 },     // +2 delegates (parser misses). -2 energy + 2 MC prod + city
    'Crashlanding':            { once: 12 },    // event: remove up to 3 animals → gain 12 + N MC. Tags: Event
    'Oumuamua Type Object Survey': { once: 12 }, // draw 2: play sci/microbe free, +3 energy for space. Tags: Space/Science
    'Solarpedia':              { perGen: 2 },   // action: +2 data to any card + 1 VP/6 data. Req 4 tags. Tags: Space
    'Kickstarter':             { once: 8 },     // choose planet tag + raise track 3 steps. Tags: clone
    'Social Events':           { once: 5 },     // +1 TR per 2 Mars tags. Event. Tags: Earth/Mars
    'Declaration of Independence': { once: 3 }, // 4 VP + 2 delegates. Req 6 Mars tags. Event. Tags: Mars
    'Private Security':        { once: 4 },     // opponents can't remove your basic prod. Tags: Earth
    'Nanotech Industries':     { perGen: 2 },   // corp: draw 3 keep 2 + action: +1 sci resource (1 VP/2). Tags: Science/Moon

    // === Undervalued cards with correct parsed data but missing MANUAL_EV ===
    'Titan Shuttles':          { perGen: 2.5 }, // action: +2 floaters OR spend floaters → titanium. 1 VP. Tags: Jovian/Space
    'Archimedes Hydroponics Station': { once: 8 }, // -1 energy, -1 MC, +2 plant prod ≈ net 9 MC. Parser: action:stock:MC (wrong)
    'Terraforming Ganymede':   { once: 15 },    // +1 TR per Jovian tag (~2-3 TR incl card) + 2 VP. Parser: tr:1 (wrong, dynamic)

    // === More dynamic production cards (parser writes 0 or wrong values) ===
    'Interplanetary Transport': { perGen: 1 },  // +1 MC prod per offworld city. Parser: drawCard mush
    'Martian Monuments':       { perGen: 2 },   // +1 MC prod per Mars tag. Parser: prod:0. Tags: Mars/Building
    'New Venice':              { once: 2 },     // city + 2 MC prod + 1 energy prod - 2 plants. Parser: energy:-1 (wrong sign?)
    'Red City':                { once: 2 },     // city + 2 MC prod - 1 energy. Req: Reds ruling. Parser OK-ish but no tags
    'Cyberia Systems':         { once: 10 },    // +1 steel prod + copy 2 building prod boxes. Parser: +2 energy (wrong)
    'Galilean Waystation':     { perGen: 2 },   // +1 MC prod per Jovian tag in play (~4-6 in 3P). 1 VP. Tags: Space
    'Think Tank':              { perGen: 2 },   // action: 2 MC → data, shift requirements. Tags: Mars/Venus/Science. Parser: drawCard mush
    'Martian Nature Wonders':  { once: 2 },     // block a space + 2 VP. Tags: Science/Mars. Parser: no tags

    // === Per-tag production (parser can't handle dynamic prod) ===
    'Iron Extraction Center':  { perGen: 2 },   // +1 steel prod per building tag (~3-5 building tags). Tags: Building
    'Titanium Extraction Center': { perGen: 2 }, // +1 ti prod per building tag (~1-2). Tags: Building
    'Public Spaceline':        { once: 10 },    // 8 tags (2 earth+2 jovian+2 venus+2 mars) = massive tag value, +2 MC prod

    // === Corp action cards (not project cards, but scored via scoreCard with cost:0) ===
    'Viron':                   { perGen: 1.5 }, // corp action: reuse blue card action (extra activation ≈ 1.5 MC/gen avg)
    'Recyclon':                { perGen: 1.5 }, // corp action: +1 microbe or spend 2 microbes → plant prod. Microbe+building tags
    'Astrodrill':              { perGen: 1.5, once: 3 }, // corp action: +1 asteroid or spend → TR/temp. Start with 3 asteroids. Space tag

    // === Preludes with bad parsed data ===
    'Merger':                  { once: 20 },    // pay 42 MC → new corp (avg +21 MC capital + ability ~10 MC). Gamble card, ситуативно

    // === Dynamic production cards (parser writes 0, _behOverrides nulls parsed data) ===
    'Medical Lab':             { perGen: 2 },   // +1 MC prod per 2 building tags (~4 buildings = 2 MC prod). Tags: Building/Science
    'Luna Metropolis':         { perGen: 2.5, once: 6 }, // city(6) + MC prod per Earth tag (~2-3). Tags: Earth/City
    'Parliament Hall':         { perGen: 1.5 }, // +1 MC prod per 3 building tags (~4-6 = 1-2 MC prod). Tags: Building
    'Miranda Resort':          { perGen: 2.5 }, // +1 MC prod per Earth tag (~3-4 Earth tags). Tags: Earth/Jovian
    'Venus Trade Hub':         { perGen: 1.5 }, // +1 MC prod per trade fleet (~2 fleets). Tags: Venus/Space
    'Cloud Tourism':           { perGen: 2.5 }, // +1 MC prod per Venus+Jovian tag (~3-4 total). Tags: Venus
    'Molecular Printing':      { once: 4 },     // +1 MC per City+Earth tag (~4 total one-time). Tags: Building
    'Martian Media Center':    { perGen: 1 },   // +1 MC prod per event trigger (~1/gen). Tags: Building
    'Ecology Research':        { perGen: 2 },   // +1 plant prod per 2 bio tags (~2-3 bio = 1 plant prod). Tags: Science
    'Ceres Spaceport':         { perGen: 5, once: 6 }, // city(6) + 2 MC prod + ti prod per Jovian (~2). Tags: Jovian/Space
    'Lunar Embassy':           { perGen: 5, once: 6 }, // city(6) + 3 MC prod + plant prod per Moon road (~1-2). Tags: Earth/Moon
    'Static Harvesting':       { perGen: 2.5 }, // +1 MC prod per Power tag (~2-3) + energy prod. Tags: Power/Building
    'Red Tourism Wave':        { once: 6 },     // MC per adj empty spaces near oceans (~6 MC avg). Tags: Earth
    'Cartel':                  { perGen: 3 },   // +1 MC prod per Earth tag incl this (~3-4). Tags: Earth
    'Satellites':              { perGen: 3 },   // +1 MC prod per Space tag incl this (~3-4). Tags: Space
    'Protected Valley':        { once: 0 },     // handled by contextual scoring below
    'Stanford Torus':          { once: 0 },     // handled by contextual scoring below
    'Designed Microorganisms': { once: 0 },     // handled by contextual scoring below
    'Security Fleet':          { perGen: 0, once: -8 },  // bad ti→VP exchange; explicit trap penalty keeps it out of average hands
    'Copernicus Tower':        { perGen: 2 },   // action: spend data → TR. ~1 TR per 3-4 gens. Tags: Science/Building/Moon
    'Project Workshop':        { perGen: 2 },   // corp action: draw+discard building → build free or +3 MC. Tags: none

    // === Cards with wrong/missing MANUAL_EV (no _behOverride needed) ===
    'Titan Air-scrapping':     { perGen: 1.5 }, // action: +1 floater or spend 2 → remove heat → raise temp. Slow but free TR
    'Underground Detonations': { once: -10 },   // classic trap: delayed 8 MC heat bump is too slow, so don't treat it as a real engine
    'United Nations Mars Initiative': { perGen: 3 }, // action: 3 MC → raise TR if raised this gen. ~1 TR/gen = 4 MC net
    'Cloud Vortex Outpost':    { perGen: 3, once: 7 }, // action: floater→Venus + colony placement(7 MC). Tags: Venus/Jovian
    'Micro-Geodesics':         { perGen: 3 },   // ongoing: -2 MC on Ares-compatible cards. Tags: Mars/Science
    'Titan Floating Launch-pad': { perGen: 2.5 }, // action: +1 floater or spend → free colony placement. Tags: Jovian/Space
    'The Darkside of The Moon Syndicate': { perGen: 2 }, // action: spend MC → steal opponent's resource. Tags: Moon
    'Meltworks':               { perGen: 0.5 }, // action: spend 5 heat → 1 steel. Marginal but free steel
    'Microgravity Nutrition':  { perGen: 1.2 }, // action: +1 microbe (1 VP per 2). Parser has per:0.5 bug

    // === MEDIUM confidence — action/trigger cards parser undervalues ===
    'Ecological Zone':         { perGen: 1.5 }, // +1 animal per plant/animal tag played. 1 VP/2 animals. Tags: Plant/Animal
    'Asteroid Hollowing':      { perGen: 1.5 }, // action: 1 ti → +1 asteroid (1 VP/asteroid). Tags: none
    'Floater Urbanism':        { perGen: 1.5 }, // action: +1 floater or spend → city. Tags: Venus
    'Space Wargames':          { once: 5 },     // event: 3 data → +3 VP or draw 3 or +5 MC. Tags: Space/Science
    'Bactoviral Research':     { once: 5 },     // +1 microbe per science tag (~3 microbes ≈ 3 MC) + draw card (3.5 MC). Tags: Microbe/Science
    'Private Military Contractor': { perGen: 1.5 }, // +1 resource per Earth tag. 1 VP/2. Tags: Earth/Science
    'Hecate Speditions':       { perGen: 2, once: 8 }, // action: data VP + trade fleet (~8 MC over game). Tags: Moon/Space
    'Asteroid Rights':         { perGen: 2 },   // action: +1 asteroid or spend → MC/titanium. Tags: none
    'Martian Culture':         { perGen: 0.7 }, // action: +1 data (1 VP/2 data). Tags: Mars/Building
    'Ancient Shipyards':       { perGen: 1.5 }, // action: spend 3 data → draw 2 cards. Tags: Jovian/Space
    'Processor Factory':       { perGen: 1 },   // action: spend 1 energy → +2 data to any card. Tags: Building
    'Rust Eating Bacteria':    { perGen: 1 },   // action: +1 microbe or spend 3 → raise oxygen. Tags: Microbe
    'Search For Life':         { perGen: 0.5 }, // action: 1 MC → reveal top card, +3 VP if microbe. ~10% chance. Tags: Science
    'Darkside Incubation Plant': { perGen: 1 }, // action: +1 microbe (1 VP/2). Tags: Microbe/Moon

    // === Cheap attack/event cards parser undervalues ===
    'Air Raid':                { once: 6 },     // 0 MC + 1 floater → steal 5 MC. Floater often expendable. Event tag for Legend.
    'Hired Raiders':           { once: 4 },     // 1 MC → steal 2 steel or 3 MC. Cheap event tag.
  };


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
      // v76: Plants still give greenery VP (2 VP) even after O2 maxed. Floor at 0.75.
      plantDevalue: oxyStepsLeft <= 1 ? 0.75 : (oxyStepsLeft <= 3 ? 0.85 : 1.0),
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
    var ratePerGen = scoreCtx.ratePerGen;
    var gensLeft = scoreCtx.gensLeft;
    var tp = scoreCtx.tp;
    var myTags = scoreCtx.myTags;
    var handCards = scoreCtx.handCards;
    var tableau = scoreCtx.tableau;
    var tableauNames = scoreCtx.tableauNames;
    var redsTax = scoreCtx.redsTax;

    // Lookup structured data (from card_data.js or TM_CARD_EFFECTS)
    var cd = _cardData[name] || {};
    var tags = _cardTags[name] || card.tags || cd.tags || [];
    var beh = cd.behavior || {};

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
    };
    if (_behOverrides[name]) { beh = {}; }
    var act = cd.action || {};
    var vpInfo = cd.vp || _cardVP[name] || null;
    var discount = cd.cardDiscount || null;

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
    if (glob) {
      var trRaises = 0;
      for (var gk in glob) trRaises += glob[gk];
      ev += trRaises * (trMC(gensLeft, redsTax) + tempoBonus);
    }
    if (beh.tr) ev += beh.tr * trMC(gensLeft, redsTax); // pure TR (no tempo, doesn't shorten game)
    if (beh.ocean) ev += (typeof beh.ocean === 'number' ? beh.ocean : 1) * (trMC(gensLeft, redsTax) + tempoBonus + 2); // TR + tempo + ~2 MC board bonus
    if (beh.greenery) ev += trMC(gensLeft, redsTax) + tempoBonus + vpMC(gensLeft); // TR + tempo + 1 VP

    // ── CITY TILE ──
    // City = 3-4 VP from adjacent greeneries (accumulates over game) + positional value
    // Early city: ~4 VP by endgame (adj greeneries placed over time). Late city: ~2 VP.
    // +1 MC prod implicit. Landlord/Mayor award synergy.
    if (beh.city && !isOffBoardCityCard(name)) {
      var cityAdjVP = gensLeft >= 5 ? 4 : (gensLeft >= 3 ? 3 : 2);
      ev += vpMC(gensLeft) * cityAdjVP + 3; // VP from adj greeneries + MC prod + positional
    }

    // ── COLONY ──
    if (beh.colony) ev += 7; // colony slot ≈ 7 MC (prod bonus + trade target)
    if (beh.tradeFleet) ev += gensLeft * 4; // extra trade ≈ 4 MC/gen (opp cost of energy)

    // ── DRAW CARDS ──
    var drawVal = Math.min(6, 2.5 + gensLeft * 0.35);
    if (beh.drawCard) ev += beh.drawCard * drawVal;

    // ── VP ──
    // v76: VP scored at game end — use endgame value for accumulators, not current vpMC
    var endgameVpMC = 8;
    if (sharedScoreCardVPInfo) {
      ev += sharedScoreCardVPInfo({
        vpInfo: vpInfo,
        gensLeft: gensLeft,
        myTags: myTags,
        vpMC: vpMC,
      });
    } else if (vpInfo) {
      if (vpInfo.type === 'static') {
        // v76: Static VP blend — early: low (MC better in engine), late: high (VP = endgame value)
        // Gen 1-3: 30% endgame. Gen 4-6: 50%. Gen 7+: 80%.
        var vpBlend = gen <= 3 ? 0.3 : (gen <= 6 ? 0.5 : 0.8);
        var staticVpVal = vpMC(gensLeft) * (1 - vpBlend) + endgameVpMC * vpBlend;
        ev += (vpInfo.vp || 0) * staticVpVal;
      } else if (vpInfo.type === 'per_resource') {
        // VP accumulator: ~1 resource/gen via action, loses 1 gen to play
        // v76: Gen-scaled — early game discount (no engine yet, action may not fire)
        // Gen 1-3: 0.5 (optimistic, no support), Gen 4+: 0.7 (engine running)
        var accDiscount = gen <= 3 ? 0.5 : 0.7;
        var expectedRes = Math.max(1, gensLeft - 1);
        ev += (expectedRes / (vpInfo.per || 1)) * endgameVpMC * accDiscount;
      } else if (vpInfo.type === 'per_tag') {
        var tagCount = (myTags[vpInfo.tag] || 0) + 2; // current + ~2 future
        ev += (tagCount / (vpInfo.per || 1)) * endgameVpMC;
      } else if (vpInfo.type === 'per_colony' || vpInfo.type === 'per_city') {
        // Estimate ~4-6 colonies or cities total in 3P game
        ev += (5 / (vpInfo.per || 1)) * vpMC(gensLeft);
      } else if (vpInfo.type === 'special') {
        ev += vpMC(gensLeft) * 2; // conservative estimate: ~2 VP
      }
    }

    // ── BLUE CARD ACTIONS (recurring) ──
    // PvP: only Alpha skips parsed actions when MANUAL_EV exists
    var hasManualEV = _isPatched && !!MANUAL_EV[name];
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

    // Hand-aware discount value: near-term matching cards materially increase real discount payoff.
    {
      var discountMap = {
        'Earth Office': { tag: 'earth', amount: 3 },
        'Earth Catapult': { tag: null, amount: 2 },
        'Space Station': { tag: 'space', amount: 2 },
        'Anti-Gravity Technology': { tag: null, amount: 2 },
        'Warp Drive': { tag: 'space', amount: 4 },
        'Cutting Edge Technology': { tag: null, amount: 2 },
        'Sky Docks': { tag: 'earth', amount: 2 },
        'Mass Converter': { tag: 'space', amount: 2 },
        'Shuttles': { tag: 'space', amount: 2 },
        'Research Outpost': { tag: null, amount: 1 },
      };
      var discountInfo = discountMap[name];
      if (discountInfo || discount) {
        var handSaving = 0;
        var requiredTag = discountInfo && discountInfo.tag;
        var amount = (discountInfo && discountInfo.amount) || discount.amount || 1;
        for (var hdi = 0; hdi < handCards.length; hdi++) {
          var handCardName = handCards[hdi].name || handCards[hdi] || '';
          if (!handCardName || handCardName === name) continue;
          var handTags = _cardTags[handCardName] || [];
          if (!requiredTag || handTags.indexOf(requiredTag) >= 0) handSaving += amount;
        }
        ev += Math.min(handSaving, 20);
      }
    }

    // Production timing policy belongs in base EV: the same production card should score higher
    // in buy/draft/play when there is enough runway left for compounding.
    var urgency = steps > 0 ? Math.max(0, Math.min(1, 1 - (steps - 2) / 14)) : 0;
    {
      if (PROD_CARDS.has(name)) {
        ev += gen <= 3 ? 10 : Math.round(5 * Math.max(0, 1 - urgency * 1.5));
      }
    }

    {
      var hasVpCard = (vpInfo || VP_CARDS.has(name) || DYNAMIC_VP_CARDS.has(name));
      var hasWeakPseudoVpAction = WEAK_PSEUDO_VP_ACTION_CARDS.has(name);
      var hasProd = !!beh.production;
      var hasAction = !!beh.action || !!cd.action;
      if (hasVpCard && !hasProd && !hasAction && urgency < 0.3 && cost >= 15) {
        ev -= 3;
      }
      if (hasVpCard && hasAction && urgency < 0.5 && !hasWeakPseudoVpAction) {
        ev += 4;
      }
    }

    if ((CITY_CARDS.has(name) || beh.city) && !isOffBoardCityCard(name)) {
      var myCities = tp.citiesCount || 0;
      var cityPremium = 4 + Math.round(urgency * 4);
      if (myCities < 2) cityPremium += 4;
      ev += cityPremium;
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

    // Cards that raise globals can be materially worse if they accelerate the wrong opponent engine.
    if (state && Array.isArray(state.players) && (((glob && ((glob.temperature || 0) > 0 || (glob.heat || 0) > 0 || (glob.oxygen || 0) > 0)) || beh.ocean))) {
      var oppHeatRush = false;
      var oppPlantEngine = false;
      var myColor = tp.color || null;
      for (var opi = 0; opi < state.players.length; opi++) {
        var opp = state.players[opi] || {};
        if (myColor && opp.color === myColor) continue;
        if ((glob && ((glob.temperature || 0) > 0 || (glob.heat || 0) > 0)) &&
            (((opp.heatProduction || 0) >= 5) || ((opp.heat || 0) >= 16))) {
          oppHeatRush = true;
        }
        if ((((glob && (glob.oxygen || 0) > 0)) || beh.ocean) && ((opp.plantProduction || 0) >= 4)) {
          oppPlantEngine = true;
        }
      }
      if (oppHeatRush) ev -= 3;
      if (glob && (glob.oxygen || 0) > 0 && oppPlantEngine) ev -= 3;
      if (beh.ocean && oppPlantEngine) ev -= 2;
    }

    if (name === 'Greenhouses') {
      var totalCities = 0;
      var cityPlayers = Array.isArray(state && state.players) ? state.players : [];
      for (var cpi = 0; cpi < cityPlayers.length; cpi++) {
        totalCities += cityPlayers[cpi].citiesCount || 0;
      }
      if (totalCities >= 3) ev += totalCities * 2;
    }

    if (name === 'Optimal Aerobraking') {
      ev += 5;
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
      if ((myTags.plant || 0) >= 2 || corp === 'Ecoline') ev += 3;
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
      if ((tp.megacredits || 0) < 10 && (tp.mc || 0) < 10) ev -= 2;
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
    var manual = MANUAL_EV[name];
    if (sharedApplyManualEVAdjustments) {
      ev += sharedApplyManualEVAdjustments({
        name: name,
        manual: manual,
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
    var venus = typeof g.venusScaleLevel === 'number' ? g.venusScaleLevel : 30;
    var breakdown = {
      temp: typeof g.temperature === 'number' ? g.temperature : -30,
      tempSteps: Math.max(0, Math.round((8 - (g.temperature || -30)) / 2)),
      oxy: typeof g.oxygenLevel === 'number' ? g.oxygenLevel : 0,
      oxySteps: Math.max(0, 14 - (g.oxygenLevel || 0)),
      oceans: typeof g.oceans === 'number' ? g.oceans : 0,
      oceanSteps: Math.max(0, 9 - (g.oceans || 0)),
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
        getOverlayRating: getOverlayRatingByName,
        isVPCard: function(name) { return DYNAMIC_VP_CARDS.has(name) || VP_CARDS.has(name); },
        isEngineCard: function(name) { return ENGINE_CARDS.has(name); },
        isProdCard: function(name) { return PROD_CARDS.has(name); },
        isCityCard: function(name) { return CITY_CARDS.has(name); },
        isOffBoardCityCard: isOffBoardCityCard,
      });
    }
    if (!cards || cards.length === 0) return [];
    var tp = (state && state.thisPlayer) || {};
    var mc = tp.megacredits || 0;
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
    var mc = tp.megacredits || 0;
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
    var mc = tp.megacredits || 0;
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
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════

  var TM_BRAIN = {
    // Data injection
    setCardData: setCardData,

    // Card category sets
    VP_CARDS: VP_CARDS,
    ENGINE_CARDS: ENGINE_CARDS,
    CITY_CARDS: CITY_CARDS,
    OFFBOARD_CITY_CARDS: OFFBOARD_CITY_CARDS,
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
    normalizeOpeningHandBias: normalizeOpeningHandBias,
    isOpeningHandContext: isOpeningHandContext,
    getOpeningHandBias: getOpeningHandBiasForName,
    getOverlayRatingByName: getOverlayRatingByName,
    getOverlayRatingScore: getOverlayRatingScore,
    isOffBoardCityCard: isOffBoardCityCard,

    // Dashboard & advisor
    endgameTiming: endgameTiming,
    rankHandCards: rankHandCards,
    analyzePass: analyzePass,
    analyzeActions: analyzeActions,

    // Deck analyzer
    analyzeDeck: analyzeDeck,

    // Variant resolution
    resolveVariantCardName: resolveVariantCardName,
    baseCardName: baseCardName,
    getCardDataByName: getCardDataByName,
    getCardTagsByName: getCardTagsByName,
    getCardVPByName: getCardVPByName,
    getCardEffectsByName: getCardEffectsByName,
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
    'promo': ['16 Psyche','Advertising','Aqueduct Systems','Asteroid Deflection System','Asteroid Hollowing','Asteroid Rights','Astra Mechanica','Bactoviral Research','Bio Printing Facility','Carbon Nanosystems','Casinos','City Parks','Comet Aiming','Crash Site Cleanup','Cutting Edge Technology','Cyberia Systems','Deimos Down:promo','Directed Heat Usage','Directed Impactors','Diversity Support','Dusk Laser Mining','Energy Market','Field-Capped City','Floyd Continuum','Great Dam:promo','Harvest','Hermetic Order of Mars','Hi-Tech Lab','Homeostasis Bureau','Hospitals','Icy Impactors','Imported Nutrients','Interplanetary Trade','Jovian Embassy','Kaguya Tech','Law Suit','Magnetic Field Generators:promo','Magnetic Shield','Mars Nomads','Martian Lumber Corp','Meat Industry','Meltworks','Mercurian Alloys','Mohole Lake','Neptunian Power Consultants','New Holland','Orbital Cleanup','Outdoor Sports','Penguins','Potatoes','Project Inspection','Protected Growth','Public Baths','Public Plans','Red Ships','Rego Plastics','Robot Pollinators','Saturn Surfing','Self-replicating Robots','Small Asteroid','Snow Algae','Soil Enrichment','Solar Logistics','St. Joseph of Cupertino Mission','Stanford Torus','Static Harvesting','Sub-Crust Measurements','Supercapacitors','Supermarkets','Teslaract','Topsoil Contract','Vermin','Weather Balloons'],
    'venus': ['Aerial Mappers','Aerosport Tournament','Air-Scrapping Expedition','Atalanta Planitia Lab','Atmoscoop','Comet for Venus','Corroder Suits','Dawn City','Deuterium Export','Dirigibles','Extractor Balloons','Extremophiles','Floating Habs','Forced Precipitation','Freyja Biodomes','GHG Import From Venus','Giant Solar Shade','Gyropolis','Hydrogen to Venus','Io Sulphur Research','Ishtar Mining','Jet Stream Microscrappers','Local Shading','Luna Metropolis','Luxury Foods','Maxwell Base','Mining Quota','Neutralizer Factory','Omnicourt','Orbital Reflectors','Rotator Impacts','Sister Planet Support','Solarnet','Spin-Inducing Asteroid','Sponsored Academies','Stratopolis','Stratospheric Birds','Sulphur Exports','Sulphur-Eating Bacteria','Terraforming Contract','Thermophiles','Venus Governor','Venus Magnetizer','Venus Soils','Venus Waystation','Venusian Animals','Venusian Insects','Venusian Plants','Water to Venus'],
    'colonies': ['Air Raid','Airliners','Atmo Collectors','Community Services','Conscription','Corona Extractor','Cryo-Sleep','Earth Elevator','Ecology Research','Floater Leasing','Floater Prototypes','Floater Technology','Galilean Waystation','Heavy Taxation','Ice Moon Colony','Impactor Swarm','Interplanetary Colony Ship','Jovian Lanterns','Jupiter Floating Station','Luna Governor','Lunar Exports','Lunar Mining','Market Manipulation','Martian Zoo','Mining Colony','Minority Refuge','Molecular Printing','Nitrogen from Titan','Pioneer Settlement','Productive Outpost','Quantum Communications','Red Spot Observatory','Refugee Camps','Research Colony','Rim Freighters','Sky Docks','Solar Probe','Solar Reflectors','Space Port','Space Port Colony','Spin-off Department','Sub-zero Salt Fish','Titan Air-scrapping','Titan Floating Launch-pad','Titan Shuttles','Trade Envoys','Trading Colony','Urban Decomposers','Warp Drive'],
    'prelude': ['House Printing','Lava Tube Settlement','Martian Survey','Psychrophiles','Research Coordination','SF Memorial','Space Hotels'],
    'prelude2': ['Ceres Tech Market','Cloud Tourism','Colonial Envoys','Colonial Representation','Envoys From Venus','Floating Refinery','Frontier Town','GHG Shipment','Ishtar Expedition','Jovian Envoys','L1 Trade Terminal','Microgravity Nutrition','Red Appeasement','Soil Studies','Special Permit','Sponsoring Nation','Stratospheric Expedition','Summit Logistics','Unexpected Application','Venus Allies','Venus Orbital Survey','Venus Shuttles','Venus Trade Hub','WG Project'],
    'turmoil': ['Aerial Lenses','Banned Delegate','Cultural Metropolis','Diaspora Movement','Event Analysts','GMO Contract','Martian Media Center','PR Office','Parliament Hall','Political Alliance','Public Celebrations','Recruitment','Red Tourism Wave','Sponsored Mohole','Supported Research','Vote Of No Confidence','Wildlife Dome']
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
    turmoilExtension: 'turmoil'
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
    var poolNames = [];
    var poolSet = {};
    for (var name in cardData) {
      if (_NON_PROJECT[name]) continue;  // skip corps/preludes/CEOs
      var exp = _CARD_EXP[name];         // undefined = base/corpera (always in)
      if (exp && !enabledExp[exp]) continue; // expansion not enabled
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
    var globalReqs = typeof root.TM_CARD_GLOBAL_REQS !== 'undefined' ? root.TM_CARD_GLOBAL_REQS : null;
    var tagReqs = typeof root.TM_CARD_TAG_REQS !== 'undefined' ? root.TM_CARD_TAG_REQS : null;
    var cardEffects = typeof root.TM_CARD_EFFECTS !== 'undefined' ? root.TM_CARD_EFFECTS : null;
    setCardData(null, autoVP, null, globalReqs, tagReqs, cardEffects);
  }

  // UMD export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TM_BRAIN;
  } else {
    root.TM_BRAIN = TM_BRAIN;
  }

})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
