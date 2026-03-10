// TM_BRAIN — единое аналитическое ядро для Terraforming Mars.
// Isomorphic: работает в Node.js (require) и Browser (window.TM_BRAIN).
// Объединяет логику из smartbot.js и advisor-core.js.

/* eslint-disable */
;(function(root) {
  'use strict';

  // ══════════════════════════════════════════════════════════════
  // CARD DATA INJECTION (set from outside)
  // In Node: TM_BRAIN.setCardData(require('./card_tags'), require('./card_vp'))
  // In Browser: mapped from TM_CARD_EFFECTS at init
  // ══════════════════════════════════════════════════════════════

  var _cardTags = {};
  var _cardVP = {};
  var _cardData = {};  // full structured card data from gen_card_data.js
  var _cardTagReqs = {}; // tag requirements: { 'Anti-Gravity Technology': { science: 7 } }
  var _cardGlobalReqs = {}; // global requirements: { 'Birds': { oxygen: { min: 13 } } }
  var _ratings = {}; // TM_RATINGS: { 'Birds': { s: 76, t: 'B', ... } }

  function setCardData(cardTags, cardVP, cardData, cardDiscounts, cardTagReqs, cardGlobalReqs, ratings) {
    if (cardTags) _cardTags = cardTags;
    if (cardVP) _cardVP = cardVP;
    if (cardData) _cardData = cardData;
    if (cardDiscounts) _injectCardDiscounts(cardDiscounts);
    if (cardTagReqs) _cardTagReqs = cardTagReqs;
    if (cardGlobalReqs) _cardGlobalReqs = cardGlobalReqs;
    if (ratings) _ratings = ratings;
  }

  // Inject TM_CARD_DISCOUNTS → _cardData[name].cardDiscount
  // Format: { 'Earth Office': { earth: 3 }, 'Anti-Gravity Technology': { _all: 2 }, ... }
  function _injectCardDiscounts(discounts) {
    for (var dn in discounts) {
      if (!_cardData[dn]) _cardData[dn] = {};
      var d = discounts[dn];
      for (var dk in d) {
        var amt = d[dk];
        if (dk === '_all' || dk === '_req') {
          _cardData[dn].cardDiscount = { amount: amt };
        } else {
          _cardData[dn].cardDiscount = { amount: amt, tag: dk };
        }
        break; // one discount per card
      }
    }
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
    'GHG Factories',
  ]);

  var FLOATER_VP_CARDS = new Set([
    'Jovian Lanterns', 'Dirigibles', 'Stratospheric Birds', 'Venusian Animals',
  ]);

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

  var PAY_ZERO = {
    heat: 0, megaCredits: 0, steel: 0, titanium: 0, plants: 0,
    microbes: 0, floaters: 0, lunaArchivesScience: 0, spireScience: 0,
    seeds: 0, auroraiData: 0, graphene: 0, kuiperAsteroids: 0
  };

  function smartPay(amount, state, wfOrOpts, tags) {
    var tp = (state && state.thisPlayer) || {};
    var pay = {};
    var k;
    for (k in PAY_ZERO) pay[k] = PAY_ZERO[k];
    var remaining = amount;

    var payOpts = (wfOrOpts && wfOrOpts.paymentOptions) || wfOrOpts || {};
    var wfRes = wfOrOpts || {};

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
      if (available <= 0) continue;
      var use = Math.min(available, Math.ceil(remaining / alt.val));
      pay[alt.key] = use;
      remaining = Math.max(0, remaining - use * alt.val);
    }

    pay.megaCredits = Math.max(0, Math.min(remaining, tp.megaCredits || 0));
    return pay;
  }

  // ══════════════════════════════════════════════════════════════
  // CORE ANALYTICS
  // ══════════════════════════════════════════════════════════════

  function remainingSteps(state) {
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
  }

  function estimateGensLeft(state) {
    var steps = remainingSteps(state);
    var players = (state && state.players) ? state.players.length : 3;
    // 3P WGT: ~6 raises/gen (WGT + 3 players × ~1.5 raises each)
    var ratePerGen = Math.max(4, Math.min(8, players * 2));
    var glBySteps = Math.max(1, Math.ceil(steps / ratePerGen));
    // Gen cap: game rarely goes past gen 14 in 3P WGT
    var gen = (state && state.game && state.game.generation) || 1;
    var glByGen = Math.max(1, 14 - gen);
    return Math.min(glBySteps, glByGen);
  }

  function vpLead(state) {
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
    // Fallback: TR-based (advisor/browser context)
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
  }

  function shouldPushGlobe(state) {
    var gen = (state && state.game && state.game.generation) || 5;
    if (gen >= 20) return true;

    var steps = remainingSteps(state);
    if (steps > 8) return true;
    // ≤2 steps: game ends this/next gen regardless — always push (each raise = 1 TR = 1 VP)
    if (steps <= 2) return true;

    var lead = vpLead(state);
    if (steps > 4) return lead >= -5;
    return lead >= 0;
  }

  function isRedsRuling(state) {
    return state && state.game && state.game.turmoil && state.game.turmoil.ruling === 'Reds';
  }

  function scoreColonyTrade(colony, state) {
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

    // Colony build bonus: if I have a colony here, I get the colony bonus on trade
    var myColonies = colony.colonies || [];
    var myColor = tp.color;
    var hasMyColony = false;
    if (myColor && myColonies.length > 0) {
      for (var mc2 = 0; mc2 < myColonies.length; mc2++) {
        if (myColonies[mc2] === myColor) { hasMyColony = true; break; }
      }
    }
    if (hasMyColony) tradeValue += 2; // colony bonus ≈ 2 MC avg

    return tradeValue;
  }

  function hasVPCard(tableauNames, vpSet) {
    var arr = [];
    vpSet.forEach(function(c) { arr.push(c); });
    for (var i = 0; i < arr.length; i++) {
      if (tableauNames.has(arr[i])) return true;
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════
  // AWARD EVALUATION
  // ══════════════════════════════════════════════════════════════

  // Award score functions: return numeric score for a player in a given award
  // Uses data available from vue-bridge (tags, production, resources, tiles)
  var AWARD_SCORE_FN = {
    // Tharsis
    'Landlord': function(p, tiles) { return tiles ? (tiles.cities || 0) + (tiles.greeneries || 0) : 0; },
    'Banker': function(p) { return p.megaCreditProduction || p.megaCreditsProduction || 0; },
    'Scientist': function(p) { return (p.tags && p.tags.science) || 0; },
    'Thermalist': function(p) { return p.heat || 0; },
    'Miner': function(p) { return (p.steel || 0) + (p.titanium || 0); },
    // Hellas
    'Cultivator': function(p, tiles) { return tiles ? (tiles.greeneries || 0) : 0; },
    'Space Baron': function(p) { return (p.tags && p.tags.space) || 0; },
    'Contractor': function(p) { return (p.tags && p.tags.building) || 0; },
    // Elysium
    'Benefactor': function(p) { return p.terraformRating || 0; },
    'Industrialist': function(p) { return (p.steel || 0) + (p.energy || 0); },
    // Venus
    'Venuphile': function(p) { return (p.tags && p.tags.venus) || 0; },
    // Additional awards (various maps/expansions)
    'Desert Settler': function(p, tiles) { return tiles ? (tiles.oceans || 0) : 0; },
    'Estate Dealer': function(p, tiles) { return tiles ? (tiles.greeneries || 0) : 0; }, // greeneries adj to oceans, approx
    'Magnate': function(p) {
      // Green (automated) + blue (active) cards played. Approx: tableau size minus events
      var total = p.tableau ? p.tableau.length : 0;
      var events = (p.tags && p.tags.event) || 0;
      return Math.max(0, total - events);
    },
    'Celebrity': function(p) {
      // Cards played with cost >= 20. Can't easily count from tags alone; estimate from tableau size
      return p.tableau ? Math.round(p.tableau.length * 0.25) : 0;
    },
    'Entrepreneur': function(p) {
      // Cards with production. Estimate from productions > 0
      var count = 0;
      if ((p.megaCreditProduction || p.megaCreditsProduction || 0) > 0) count++;
      if ((p.steelProduction || 0) > 0) count++;
      if ((p.titaniumProduction || 0) > 0) count++;
      if ((p.plantProduction || 0) > 0) count++;
      if ((p.energyProduction || 0) > 0) count++;
      if ((p.heatProduction || 0) > 0) count++;
      return count;
    },
    'Coordinator': function(p) { return (p.tags && p.tags.jovian) || 0; },
    'Politician': function(p) { return p.terraformRating || 0; },
    'Adapter': function(p) { return (p.tags && p.tags.event) || 0; },
    'Edgedancer': function(p) {
      // Tiles on edges — can't determine from data, estimate from total tiles
      return p.tableau ? Math.round(p.tableau.length * 0.15) : 0;
    },
    'Hoarder': function(p) { return p.cardsInHandNbr || 0; },
    'Warmonger': function(p) { return (p.tags && p.tags.event) || 0; },
  };

  /**
   * Evaluate an award: who would win, and should we fund it?
   * Returns { myScore, bestOppScore, bestOppName, winning, margin }
   */
  function evaluateAward(awardName, state) {
    var fn = AWARD_SCORE_FN[awardName];
    if (!fn) return null;

    var tp = (state && state.thisPlayer) || {};
    var playerTiles = (state && state.game && state.game.playerTiles) || {};
    var myTiles = playerTiles[tp.color] || {};
    var myScore = fn(tp, myTiles);

    var players = (state && state.players) || [];
    var bestOppScore = 0;
    var bestOppName = '';
    for (var i = 0; i < players.length; i++) {
      var pl = players[i];
      if (pl.color === tp.color) continue;
      var oppTiles = playerTiles[pl.color] || {};
      var oppScore = fn(pl, oppTiles);
      if (oppScore > bestOppScore) {
        bestOppScore = oppScore;
        bestOppName = pl.name || pl.color || '';
      }
    }

    return {
      myScore: myScore,
      bestOppScore: bestOppScore,
      bestOppName: bestOppName,
      winning: myScore > bestOppScore,
      tied: myScore === bestOppScore && myScore > 0,
      margin: myScore - bestOppScore,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // MILESTONE EVALUATION
  // ══════════════════════════════════════════════════════════════

  // Milestone score functions + thresholds
  var MILESTONE_SCORE_FN = {
    // Tharsis
    'Terraformer':  { fn: function(p) { return p.terraformRating || 0; }, threshold: 35 },
    'Mayor':        { fn: function(p) { return p.citiesCount || 0; }, threshold: 3 },
    'Gardener':     { fn: function(p, tiles) { return tiles ? (tiles.greeneries || 0) : 0; }, threshold: 3 },
    'Builder':      { fn: function(p) { return (p.tags && p.tags.building) || 0; }, threshold: 8 },
    'Planner':      { fn: function(p) { return p.cardsInHandNbr || 0; }, threshold: 16 },
    // Hellas
    'Diversifier':  { fn: function(p) {
      if (!p.tags) return 0;
      var count = 0;
      for (var t in p.tags) if (p.tags[t] > 0) count++;
      return count;
    }, threshold: 8 },
    'Tactician':    { fn: function(p) { return (p.tags && p.tags.event) || 0; }, threshold: 5 },
    'Polar Explorer': { fn: function(p, tiles) { return tiles ? (tiles.oceans || 0) : 0; }, threshold: 3 },
    'Energizer':    { fn: function(p) { return p.energyProduction || 0; }, threshold: 6 },
    'Rim Settler':  { fn: function(p) { return (p.tags && p.tags.jovian) || 0; }, threshold: 3 },
    // Elysium
    'Generalist':   { fn: function(p) {
      var count = 0;
      if ((p.megaCreditProduction || p.megaCreditsProduction || 0) > 0) count++;
      if ((p.steelProduction || 0) > 0) count++;
      if ((p.titaniumProduction || 0) > 0) count++;
      if ((p.plantProduction || 0) > 0) count++;
      if ((p.energyProduction || 0) > 0) count++;
      if ((p.heatProduction || 0) > 0) count++;
      return count;
    }, threshold: 6 },
    'Specialist':   { fn: function(p) {
      var prods = [
        p.megaCreditProduction || p.megaCreditsProduction || 0,
        p.steelProduction || 0, p.titaniumProduction || 0,
        p.plantProduction || 0, p.energyProduction || 0, p.heatProduction || 0
      ];
      return Math.max.apply(null, prods);
    }, threshold: 10 },
    'Ecologist':    { fn: function(p) {
      return ((p.tags && p.tags.animal) || 0) + ((p.tags && p.tags.plant) || 0) + ((p.tags && p.tags.microbe) || 0);
    }, threshold: 4 },
    'Tycoon':       { fn: function(p) {
      // Green + blue cards played (exclude events). Approximation: total tableau size
      return (p.tableau ? p.tableau.length : 0);
    }, threshold: 15 },
    'Legend':       { fn: function(p) { return (p.tags && p.tags.event) || 0; }, threshold: 5 },
  };

  /**
   * Evaluate a milestone: can player claim it?
   * Returns { myScore, threshold, canClaim, progress } or null
   */
  function evaluateMilestone(milestoneName, state) {
    var ms = MILESTONE_SCORE_FN[milestoneName];
    if (!ms) return null;

    var tp = (state && state.thisPlayer) || {};
    var playerTiles = (state && state.game && state.game.playerTiles) || {};
    var myTiles = playerTiles[tp.color] || {};
    var myScore = ms.fn(tp, myTiles);

    return {
      myScore: myScore,
      threshold: ms.threshold,
      canClaim: myScore >= ms.threshold,
      progress: Math.min(100, Math.round(myScore / ms.threshold * 100)),
    };
  }

  // ══════════════════════════════════════════════════════════════
  // CARD SCORING (full version from smartbot)
  // ══════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════
  // EV CONSTANTS (MC equivalents from CLAUDE.md tier-list formulas)
  // ══════════════════════════════════════════════════════════════

  // MC value of 1 unit of production per remaining generation
  var PROD_MC = {
    megacredits: 1, steel: 2, titanium: 3, plants: 1.5,
    energy: 0.8, heat: 0.5
  };

  // MC value of 1 instant resource
  var STOCK_MC = {
    megacredits: 1, steel: 2, titanium: 3, plants: 0.75,
    energy: 0.5, heat: 0.5
  };

  // MC value of 1 VP (scales with game phase)
  function vpMC(gensLeft) {
    if (gensLeft >= 6) return 3;  // early: VP cheap, MC more useful
    if (gensLeft >= 3) return 5;  // mid
    return 7;                     // late: VP = everything
  }

  // MC value of 1 TR raise (production income + VP at end)
  function trMC(gensLeft, redsTax) {
    return gensLeft + vpMC(gensLeft) - redsTax;
  }

  // Tag intrinsic value (MC equivalent of having the tag)
  var TAG_VALUE = {
    jovian: 4, science: 4, earth: 2, venus: 2, space: 1.5,
    building: 1.5, plant: 2, microbe: 1.5, animal: 2, power: 1,
    city: 1, moon: 1, mars: 0.5, event: 1, wild: 2
  };

  // Action cards that need specific resources to function.
  // Used to discount perGen when player lacks the resource.
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
    'Advanced Alloys':         { perGen: 3 },   // +1 steel/ti value (not a discount)
    'Toll Station':            { perGen: 3 },   // +1 MC per opponent space tag
    'Interplanetary Trade':    { perGen: 4 },   // +1 MC income per 5 played tags

    // === Action cards (draw, MC, TR) ===
    'AI Central':              { perGen: 7 },   // action: draw 2 cards
    'Martian Rails':           { perGen: 2 },   // action: 1 MC per city
    'Business Network':        { perGen: 2 },   // action: buy 1 card (net ~0.5 MC + filtering)
    'Olympus Conference':      { perGen: 1.5 }, // trigger: draw on science tag
    'Mars University':         { perGen: 1.5 }, // trigger: discard→draw on science
    'Media Archives':          { perGen: 1 },   // trigger: +1 MC on event
    'Optimal Aerobraking':     { perGen: 2 },   // trigger: +3 steel +3 heat on space event
    'Standard Technology':     { perGen: 3 },   // trigger: +3 MC per std project
    'Red Ships':               { perGen: 3 },   // action: MC per empty adj (scales)
    'Directed Impactors':      { perGen: 2 },   // action: 6 MC → +1 asteroid
    'Power Infrastructure':    { perGen: 2 },   // action: energy→MC

    // === Trigger/passive cards ===
    'Arctic Algae':            { _dynamic: true },   // +2 plants per ocean — calculated based on remaining oceans
    'Herbivores':              { perGen: 1.5 }, // +1 animal per greenery (trigger, not action — ~1/gen)
    'Pets':                    { perGen: 1.5 }, // +1 animal per city (any player, trigger)
    'Ecological Survey':       { perGen: 1.5 }, // +1 plant per greenery action
    'Geological Survey':       { perGen: 1.5 }, // +1 steel per placement bonus
    'Marketing Experts':       { perGen: 2 },   // +1 MC per event played
    'Decomposers':             { perGen: 2 },   // +1 microbe per plant/animal/microbe tag
    'GHG Factories':           { perGen: 1.5 }, // spend 1 heat → +1 heat prod
    'Viral Enhancers':         { perGen: 2 },   // +1 plant/animal/microbe on tag
    'Ants':                    { perGen: 1 },   // action: steal 1 microbe → this
    'Protected Habitats':      { once: 6 },     // defense: opponents can't remove plants/animals/microbes
    'Immigrant City':          { perGen: 1, once: 3 },  // city(8) - prod penalty(-1MC -1energy ≈ 5) = +3 once + perGen:1 for +1MC/city trigger
    'Adaptation Technology':   { once: 5 },     // -2 to all req → opens cards
    'Media Group':             { perGen: 1 },   // +3 MC per event
    'Inventors Guild':         { perGen: 1.5 }, // action: buy 1 card from deck

    // === Floater actions ===
    'Dirigibles':              { perGen: 2 },   // action: add 1 floater, 3 floaters = 1 Venus TR
    'Jovian Lanterns':         { perGen: 1.5 }, // action: spend 1 ti → +2 floaters, 2 = 1 TR
    'Venusian Animals':        { perGen: 1 },   // trigger: +1 animal per Venus tag

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
    'Floyd Continuum':         { perGen: 1 },   // draw 1 card per event played
    'Self-replicating Robots': { perGen: 3 },   // -2 MC on space/building cards with no tags, repeats
    'Homeostasis Bureau':      { perGen: 1.5 }, // +2 plants per city (trigger)

    // === Action: TR/global raises ===
    'Caretaker Contract':      { perGen: 3 },   // action: 8 heat → 1 TR (great with heat engine)
    'Symbiotic Fungus':        { perGen: 1 },   // action: add 1 microbe to another card
    'Predators':               { perGen: 1 },   // action: steal 1 animal from opponent
    'Extreme-Cold Fungus':     { perGen: 1 },   // action: +1 plant or +1 microbe

    // === Colony / trade modifiers ===
    'Trading Colony':          { perGen: 2 },   // +2 resources per trade (~2 trades left, ~4 MC/trade bonus)
    'Colonial Representation': { perGen: 1.5 }, // +1 influence permanent + colony rebate
    'L1 Trade Terminal':       { perGen: 2 },   // no energy/MC for trade, +1 VP
    'Cryo-Sleep':              { perGen: 1 },   // +1 trade income

    // === VP accumulators the parser can't score ===
    'Ocean Sanctuary':         { perGen: 3 },   // action: +1 animal per ocean (1 VP/animal). NOT in card_data. Action value only, no double-count
    'Whales':                  { perGen: 4 },   // action: +1 animal (1 VP/animal) + 2 MC prod. Action value, NOT in card_data
    'Anthozoa':                { perGen: 0.5 }, // +1 animal per ocean placed, no action
    'Stratopolis':             { perGen: 1 },   // +1 floater per Venus tag, 1 VP/2 floaters

    // === Action: energy converters (TR/oxygen/ocean) ===
    'Equatorial Magnetizer':   { perGen: 2.5 }, // action: -1 energy prod → +1 TR
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
    'Security Fleet':          { perGen: 1.5 }, // action: spend 1 titanium → +1 fighter (1 VP, costs 3 MC)
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
    'Copernicus Tower':        { perGen: 2 },   // action: spend data → TR. ~1 TR per 3-4 gens. Tags: Science/Building/Moon
    'Project Workshop':        { perGen: 2 },   // corp action: draw+discard building → build free or +3 MC. Tags: none

    // === Cards with wrong/missing MANUAL_EV (no _behOverride needed) ===
    'Titan Air-scrapping':     { perGen: 1.5 }, // action: +1 floater or spend 2 → remove heat → raise temp. Slow but free TR
    'Underground Detonations': { perGen: 1.5 }, // action: 8 MC (steel) → raise temp. Steel payable = real cost ~5 MC
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
  };

  // ══════════════════════════════════════════════════════════════
  // CARD SCORING — EV-based (uses structured card data)
  // ══════════════════════════════════════════════════════════════

  function scoreCard(card, state) {
    var cost = card.calculatedCost != null ? card.calculatedCost : (card.cost || 0);
    var name = card.name || '';
    var gensLeft = estimateGensLeft(state);
    var tp = (state && state.thisPlayer) || {};
    var myTags = tp.tags || {};
    var redsTax = isRedsRuling(state) ? 3 : 0;

    // Lookup structured data (from card_data.js or TM_CARD_EFFECTS)
    var cd = _cardData[name] || {};
    var tags = _cardTags[name] || card.tags || cd.tags || [];
    var beh = cd.behavior || {};
    var act = cd.action || {};
    var vpInfo = cd.vp || _cardVP[name] || null;
    // Fix wrong VP types in card_data (static instead of per_resource)
    // These cards have "1 VP per N resources" but card_data stores as static
    var _vpFix = {
      'Physics Complex': { type: 'per_resource', per: 1 },    // 1 VP per science
      'Martian Zoo': { type: 'per_resource', per: 1 },        // 1 VP per animal
      'Stratopolis': { type: 'per_resource', per: 2 },        // 1 VP per 2 floaters
      'Jupiter Floating Station': { type: 'per_resource', per: 3 }, // 1 VP per 3 floaters
      'Titan Floating Launch-pad': { type: 'per_resource', per: 3 }, // 1 VP per 3 floaters
    };
    if (vpInfo && vpInfo.type === 'static' && _vpFix[name]) {
      vpInfo = _vpFix[name];
    }
    var discount = cd.cardDiscount || null;

    var ev = 0;

    // ── BEHAVIOR OVERRIDE ──
    // Parser misidentifies effects for some cards (triggers as production, colony bonuses, etc.)
    // Cards listed here get their entire parsed behavior nulled — MANUAL_EV covers them instead.
    var _behOverrides = {
      'Media Group': true,              // trigger +3 MC/event, NOT production
      'Trading Colony': true,           // colony trade bonus, NOT production
      'Colonial Representation': true,  // influence + colony rebate, NOT production
      'Equatorial Magnetizer': true,    // action: -1 energy → TR; MANUAL_EV covers
      'Space Port Colony': true,        // colony + trade fleet (parser: prod:0)
      'Ice Moon Colony': true,          // colony + ocean (parser: prod:0)
      'Gyropolis': true,                // dynamic MC prod + city (parser: -2 energy only)
      'Power Grid': true,              // dynamic energy prod per power tags (parser: 0)
      'Luxury Estate': true,            // one-time titanium per city+greenery (parser: prod:0)
      'Immigration Shuttles': true,     // +5 MC prod (parser missed)
      'Cassini Station': true,          // +1 energy per colony in play (parser: drawCard+stock)
      'Energy Saving': true,            // dynamic energy prod per city (parser: 0)
      'Pollinators': true,              // 2 MC prod + plant prod + action VP (parser: prod:0)
      'Zeppelins': true,                // dynamic MC prod per Mars city (parser: prod:0)
      'Hydrogen Processing Plant': true, // dynamic energy prod per oceans (parser: prod:0)
      'Advanced Power Grid': true,      // dynamic MC prod per power tag (parser: missing)
      'Flat Mars Theory': true,         // dynamic MC prod per gen# (parser: prod:0)
      'Archimedes Hydroponics Station': true, // -1 energy, -1 MC, +2 plant prod (parser: action:stock)
      'Terraforming Ganymede': true,    // +1 TR per Jovian tag (parser: tr:1 static, wrong)
      'Interplanetary Transport': true, // dynamic MC prod (parser: drawCard+stock mush)
      'Martian Monuments': true,        // dynamic MC prod per Mars tag (parser: prod:0)
      'Cyberia Systems': true,          // copy prod boxes (parser: +2 energy, wrong)
      'Think Tank': true,               // action: data engine + req shift (parser: drawCard mush)
      'Quantum Communications': true,   // +1 MC prod per colony in play (parser: prod:0)
      'Floating Trade Hub': true,       // +1 MC per trade fleet (parser: prod:0)
      'Lunar Mining': true,             // +1 ti prod per Moon mining tag (parser: prod:0)
      'Insects': true,                  // +1 plant prod per plant tag (parser: prod:0)
      'Worms': true,                    // +1 plant prod per microbe tag (parser: prod:0)
      'Floater Leasing': true,          // dynamic MC (parser: prod:0)
      'Immigrant City': true,           // dynamic +1 MC prod per city placed (parser: only -1 MC -1 energy)
      'Community Services': true,       // +1 MC prod per no-tag card (parser: prod:1, too low)
      'Soletta': true,                  // 7 heat prod = ~1 temp/gen, valued at 0.5/heat is too low
      'Aerosport Tournament': true,     // dynamic MC per floater count (parser: stock:0)
      'Venus Orbital Survey': true,     // action: reveal 4, buy Venus free (parser: drawCard:0.3, too low)
      'Merger': true,                    // pay 42 MC → new corp (parser: stock:-42, misses new corp value)
      'Pharmacy Union': true,            // tr:-4 = disease tokens, NOT real TR loss. MANUAL_EV models cure/TR engine
      // Dynamic production cards (parser writes 0, real value depends on tags/board)
      'Medical Lab': true,               // +1 MC prod per 2 building tags (parser: prod:0)
      'Luna Metropolis': true,           // city + MC prod per Earth tag (parser: prod:0 MC)
      'Parliament Hall': true,           // +1 MC prod per 3 building tags (parser: prod:0)
      'Miranda Resort': true,            // +1 MC prod per Earth tag (parser: prod:0)
      'Venus Trade Hub': true,           // +1 MC prod per trade fleet (parser: prod:0)
      'Cloud Tourism': true,             // +1 MC prod per Venus/Jovian tag (parser: prod:0)
      'Molecular Printing': true,        // +1 MC per City/Earth tag, one-time (parser: stock:0)
      'Martian Media Center': true,      // +1 MC prod per event trigger (parser: prod:0)
      'Ecology Research': true,          // +1 plant prod per 2 bio tags (parser: prod:0)
      'Ceres Spaceport': true,           // city + 2 MC prod + ti prod per Jovian (parser: ti:0)
      'Lunar Embassy': true,             // city + 3 MC prod + plant prod per Moon (parser: plant:0)
      'Static Harvesting': true,         // +1 MC prod per Power tag + energy (parser: MC:0)
      'Red Tourism Wave': true,          // MC per adj empty spaces near oceans (parser: stock:0)
      'Cartel': true,                    // +1 MC prod per Earth tag (parser: prod:2, should be 3-5)
      'Satellites': true,                // +1 MC prod per Space tag (parser: prod:1, should be 2-4)
      'Bactoviral Research': true,       // microbes per sci tag (parser: drawCard:1 + stock, wrong)
      'Hecate Speditions': true,         // action: data for VP + trade bonus (parser: tradeFleet:1, conflates)
      'Cloud Vortex Outpost': true,      // action: floater/Venus + colony (parser: global.venus:2, wrong)
      'Copernicus Tower': true,          // action: spend data → TR (parser: tr:1 per gen, overvalues)
      'Project Workshop': true,          // corp action: parser encodes wrong (stock:3 should be -3)
      // v9: audit fixes — parser double-counts or wrong fields
      'Sponsored Academies': true,       // stock:cards:3 + drawCard:3 = same 3 cards counted twice (21 MC!)
      'Media Archives': true,            // stock:cards:1 + drawCard:1 wrong (no draw, only trigger +1MC/event)
      'Nitrite Reducing Bacteria': true,  // tr:1 wrong (no immediate TR, action: 3 microbes → 1 TR)
      'Huygens Observatory': true,       // tr:1 + MANUAL_EV once:12 fragile coupling. Override, once covers all
    };
    if (_behOverrides[name]) { beh = {}; }
    var prod = beh.production;
    if (prod) {
      for (var pk in prod) {
        var delta = prod[pk];
        if (pk === 'plants' && delta > 0) {
          // Plant production → greeneries: plants/8 = greeneries
          // Each greenery = 1 TR + 1 VP + tempo (pushes game end)
          var greenTempo = gensLeft >= 5 ? 8 : (gensLeft >= 3 ? 6 : 4);
          var greeneryVal = trMC(gensLeft, redsTax) + vpMC(gensLeft) + greenTempo;
          var newGreeneries = delta * gensLeft / 8;
          ev += newGreeneries * greeneryVal;
          // Synergy: existing plant prod makes new plant prod more efficient
          var existPlantProd = (tp.plantProduction || tp.plantsProduction || 0);
          if (existPlantProd >= 3) ev += delta * gensLeft * 0.3;
        } else {
          var pVal = PROD_MC[pk] || 1;
          if (delta < 0) {
            ev += delta * pVal * gensLeft * 1.2;
          } else {
            ev += delta * pVal * gensLeft;
          }
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

    // ── GLOBAL PARAMETER RAISES ──
    // Each raise = 1 TR + tempo bonus (pushing game to end locks in your lead)
    // Tempo bonus: ending the game 1 gen sooner saves opponents ~10 MC of production
    // and locks in VP lead. Scale with gensLeft (more valuable mid-game).
    var tempoBonus = gensLeft >= 5 ? 8 : (gensLeft >= 3 ? 6 : 4);
    var glob = beh.global;
    if (glob) {
      var trRaises = 0;
      for (var gk in glob) trRaises += glob[gk];
      ev += trRaises * (trMC(gensLeft, redsTax) + tempoBonus);
    }
    if (beh.tr) ev += beh.tr * trMC(gensLeft, redsTax); // pure TR (no tempo, doesn't shorten game)
    if (beh.ocean) ev += (beh.ocean || 1) * (trMC(gensLeft, redsTax) + tempoBonus + 2); // TR + tempo + ~2 MC board bonus
    if (beh.greenery) ev += (beh.greenery || 1) * (trMC(gensLeft, redsTax) + tempoBonus + vpMC(gensLeft)); // TR + tempo + 1 VP

    // ── CITY TILE ──
    // City = ~2 VP avg (1 from adjacent greenery early, 2-3 late) + MC from Mayor award
    if (beh.city) ev += vpMC(gensLeft) * 2 + 2; // VP from adj greeneries + positional value

    // ── COLONY ──
    if (beh.colony) ev += 7; // colony slot ≈ 7 MC (prod bonus + trade target)
    if (beh.tradeFleet) ev += gensLeft * 4; // extra trade ≈ 4 MC/gen (opp cost of energy)

    // ── DRAW CARDS ──
    if (beh.drawCard) ev += beh.drawCard * 3.5; // 1 card ≈ 3.5 MC

    // Need this BEFORE VP block — guard against double-counting VP for action+VP cards
    var hasManualEV = !!MANUAL_EV[name];

    // ── VP ──
    if (vpInfo) {
      if (vpInfo.type === 'static') {
        ev += (vpInfo.vp || 0) * vpMC(gensLeft);
      } else if (vpInfo.type === 'per_resource' && hasManualEV && act.addResources) {
        // MANUAL_EV already covers action+VP value — skip to avoid double-count
        // (e.g. Birds perGen:1.5 already prices in the animal VP accumulation)
      } else if (vpInfo.type === 'per_resource') {
        // VP accumulator: ~1 resource/gen via action, but loses 1-2 gens to play + ramp
        // Capped at 5: most accumulators have requirements and play mid-game (3-5 gens of value)
        var expectedRes = Math.min(5, Math.max(1, gensLeft - 2));
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
    // Skip parsed action block if MANUAL_EV covers this card (manual is more accurate,
    // otherwise we double-count: parsed action EV + MANUAL_EV perGen)
    if (!hasManualEV) {
      if (act.addResources && vpInfo && vpInfo.type === 'per_resource') {
        // Already counted in VP accumulator above, don't double count
      } else if (act.addResources) {
        ev += gensLeft * 1; // generic resource gain, small value
      }
      if (act.drawCard) ev += gensLeft * act.drawCard * 3; // card/gen
      if (act.stock) {
        for (var ask in act.stock) {
          ev += gensLeft * (act.stock[ask] || 0) * (STOCK_MC[ask] || 1) * 0.5; // 0.5 = action costs a full turn (~20% of gen)
        }
      }
      if (act.production) {
        for (var apk in act.production) {
          ev += gensLeft * (act.production[apk] || 0) * (PROD_MC[apk] || 1) * 0.5;
        }
      }
      if (act.tr) ev += gensLeft * act.tr * trMC(gensLeft, redsTax) * 0.5; // action for TR (slow)
      if (act.global) {
        for (var agk in act.global) {
          ev += gensLeft * (act.global[agk] || 0) * trMC(gensLeft, redsTax) * 0.5;
        }
      }
    }

    // ── CARD DISCOUNT (engine value) ──
    // Skip if MANUAL_EV covers this card (manual perGen already includes discount value)
    if (!hasManualEV && discount && discount.amount) {
      var cardsPerGen = 2.5; // avg cards played per gen (universal discount)
      if (discount.tag) cardsPerGen = 1; // tag-specific: fewer matching cards
      ev += discount.amount * cardsPerGen * gensLeft;
    }

    // ── DECREASE ANY PRODUCTION (opponent harm) ──
    // In 3P: hurting 1 opponent helps the 3rd for free → halve value
    if (beh.decreaseAnyProduction) {
      ev += beh.decreaseAnyProduction.count * 1.5; // small bonus, nerfed for 3P
    }
    if (beh.removeAnyPlants) {
      ev += beh.removeAnyPlants * 0.5; // low value in 3P
    }

    // ── TAG VALUE ──
    var isEvent = tags.indexOf('event') >= 0;
    var hasBuilding = tags.indexOf('building') >= 0;
    var hasSpace = tags.indexOf('space') >= 0;

    // Steel/titanium payment premium (value above base resource cost)
    // Steel is worth ~2 MC as resource; paying 2 MC/steel for a card saves 0 net.
    // Premium = (steelValue - baseValue) per steel used — only Advanced Alloys etc. give real savings.
    if (hasBuilding && (tp.steel || 0) > 0) {
      var steelVal = tp.steelValue || 2;
      var steelBase = 2; // STOCK_MC.steel baseline
      var steelUsed = Math.min(tp.steel, Math.ceil(cost / steelVal));
      ev += steelUsed * Math.max(0, steelVal - steelBase);
    }
    if (hasSpace && (tp.titanium || 0) > 0) {
      var tiVal = tp.titaniumValue || 3;
      var tiBase = 3; // STOCK_MC.titanium baseline
      var tiUsed = Math.min(tp.titanium, Math.ceil(cost / tiVal));
      ev += tiUsed * Math.max(0, tiVal - tiBase);
    }

    // Tag intrinsic value (synergies, milestones, awards)
    if (!isEvent) {
      for (var tgi = 0; tgi < tags.length; tgi++) {
        var tg = tags[tgi];
        ev += TAG_VALUE[tg] || 0.5;
        // Extra synergy if we already have tags in this category
        var existing = myTags[tg] || 0;
        if (existing >= 3) ev += 3;
        else if (existing >= 1) ev += 1;
      }
    } else {
      // Events: 1 tag value for event itself
      ev += 1;
    }

    // No-tag penalty (loses all synergies)
    if (tags.length === 0) ev -= 3;

    // ── CORPORATION SYNERGY ──
    var corp = (tp.tableau && tp.tableau[0] && (tp.tableau[0].name || tp.tableau[0])) || '';
    if (corp) {
      // Saturn Systems: +1 MC prod per jovian tag
      if (corp === 'Saturn Systems' && tags.indexOf('jovian') >= 0) {
        ev += gensLeft * 1; // +1 MC prod = gensLeft
      }
      // Arklight: +1 VP per animal/plant tag
      if (corp === 'Arklight') {
        if (tags.indexOf('animal') >= 0) ev += vpMC(gensLeft);
        if (tags.indexOf('plant') >= 0) ev += vpMC(gensLeft) * 0.6;
      }
      // Teractor: -3 MC on earth cards
      if (corp === 'Teractor' && tags.indexOf('earth') >= 0) {
        ev += 3; // save 3 MC
        // Compound discount: if card itself gives earth discount
        if (discount && discount.tag === 'earth') ev += discount.amount * 0.8 * gensLeft;
      }
      // Interplanetary Cinematics: +2 MC per event
      if (corp === 'Interplanetary Cinematics' && isEvent) ev += 2;
      // Point Luna: draw card per earth tag
      if (corp === 'Point Luna' && tags.indexOf('earth') >= 0) ev += 3.5;
      // Manutech: production = immediate resource
      if (corp === 'Manutech' && prod) {
        for (var mk in prod) {
          if (prod[mk] > 0) ev += prod[mk] * (STOCK_MC[mk] || 1);
        }
      }
      // Stormcraft: floater synergy
      if (corp === 'Stormcraft Incorporated') {
        if (tags.indexOf('jovian') >= 0) ev += 2;
        if (cd.resourceType === 'Floater') ev += 3;
      }
      // Polyphemos: +5 MC per card action → VP accumulators better
      if (corp === 'Polyphemos' && act.addResources) ev += gensLeft * 1;
      // Mining Guild: steel production on placement
      if (corp === 'Mining Guild' && hasBuilding) ev += gensLeft * 0.5;
      // Ecoline: -1 plant for greenery
      if (corp === 'Ecoline' && tags.indexOf('plant') >= 0) ev += 2;
      // CrediCor: -4 MC on 20+ cost cards
      if (corp === 'CrediCor' && cost >= 20) ev += 4;
      // Thorgate: -3 MC on power tag
      if (corp === 'Thorgate' && tags.indexOf('power') >= 0) ev += 3;
      // Poseidon: +1 MC prod per colony
      if (corp === 'Poseidon' && beh.colony) ev += gensLeft * 1;
      // Splice: +2 MC per microbe tag played
      if (corp === 'Splice' && tags.indexOf('microbe') >= 0) ev += 2;
      // Vitor: +3 MC per VP card played (non-event with VP)
      if (corp === 'Vitor' && !isEvent && vpInfo) ev += 3;
      // Inventrix: -2 to all requirements → opens more cards
      if (corp === 'Inventrix') ev += 1; // slight bonus: any card is easier to play
      // Sagitta: +4 MC per no-tag card (cancels no-tag penalty)
      if (corp === 'Sagitta' && tags.length === 0) ev += 7; // +4 MC + cancel -3 penalty
      // Lakefront Resorts: +1 MC per ocean → ocean cards more valuable
      if (corp === 'Lakefront Resorts' && beh.ocean) ev += (beh.ocean || 1) * gensLeft * 1;
      // Pristar: VP from TR not raised → penalize TR-raising cards slightly
      if (corp === 'Pristar' && (beh.tr || (glob && Object.keys(glob).length > 0))) ev -= 2;
      // Pharmacy Union: each science tag → cure disease or +1 TR. Science cards are premium.
      if (corp === 'Pharmacy Union' && tags.indexOf('science') >= 0) {
        ev += trMC(gensLeft, redsTax) * 0.7; // ~70% post-cure, each science = TR
      }
      // Celestic: action add floater to venus card. Venus tags = more targets + VP
      if (corp === 'Celestic') {
        if (tags.indexOf('venus') >= 0) ev += 2;
        if (cd.resourceType === 'Floater') ev += 3;
      }
      // Morning Star Inc: -2 to venus requirements. Venus cards more accessible.
      if (corp === 'Morning Star Inc.' && tags.indexOf('venus') >= 0) ev += 2;
      if (corp === 'Morning Star Inc' && tags.indexOf('venus') >= 0) ev += 2; // alias without dot
      // PhoboLog: +1 titanium value → space cards cheaper
      if (corp === 'PhoboLog' && tags.indexOf('space') >= 0) ev += 1.5;
      // Tharsis Republic: +MC prod per city → city cards more valuable
      if (corp === 'Tharsis Republic' && beh.city) ev += gensLeft * 1;
      // Aphrodite: +2 plants per Venus raise → venus global raise cards better
      if (corp === 'Aphrodite') {
        if (glob && glob.venus) ev += glob.venus * 1.5 * gensLeft * 0.3; // plants → greeneries
        if (tags.indexOf('venus') >= 0) ev += 1.5;
      }
      // Helion: heat as MC → heat production cards more valuable
      if (corp === 'Helion' && prod && prod.heat > 0) ev += prod.heat * 0.5 * gensLeft; // heat = 1 MC instead of 0.5
      // Crescent Research: +1 VP per science tag (trigger)
      if (corp === 'Crescent Research Association' && tags.indexOf('science') >= 0) {
        ev += vpMC(gensLeft);
      }
      // Kuiper Cooperative: extra trade fleet → colony/trade cards more valuable
      if (corp === 'Kuiper Cooperative' && (beh.colony || beh.tradeFleet)) ev += 3;
      // Robinson Industries: action raise any prod by 1. Cards with -prod less painful
      if (corp === 'Robinson Industries') {
        if (prod) {
          for (var rik in prod) { if (prod[rik] < 0) ev += Math.abs(prod[rik]) * 1.5; }
        }
      }
      // Aridor: +1 MC prod per NEW tag type + colony placement. Rare/new tags are more valuable
      if (corp === 'Aridor') {
        for (var ati = 0; ati < tags.length; ati++) {
          if (!isEvent && (myTags[tags[ati]] || 0) === 0) {
            ev += gensLeft * 1 + 5; // +1 MC prod + colony placement (~5 MC)
          }
        }
      }
      // Spire: +1 science resource per card with 2+ tags (events count +1 tag). Science = 2 MC for SP
      if (corp === 'Spire' && tags.length >= 2) ev += 2; // +1 science resource ≈ 2 MC (SP discount)
      // UNMI: action 3 MC → +1 TR if raised TR this gen. TR-raising cards enable cheap extra TR
      if (corp === 'United Nations Mars Initiative') {
        if (beh.tr || (glob && Object.keys(glob).length > 0) || beh.ocean || beh.greenery) ev += 3;
      }
      // Nirgal Enterprises: Awards & Milestones cost 0 MC. No specific card synergy
      // Valley Trust: -2 MC on preludes + science tag synergy
      if (corp === 'Valley Trust' && tags.indexOf('science') >= 0) ev += 2;
      // Factorum: action 3 MC → draw building card. Building cards more valuable
      if (corp === 'Factorum' && hasBuilding) ev += 1.5; // building card = draw target
      // Mars Direct: -1 MC per existing Mars tag when playing Mars card (scales with Mars count)
      if (corp === 'Mars Direct' && tags.indexOf('mars') >= 0) {
        ev += (myTags.mars || 0) + 1; // existing mars tags + this one ≈ discount
      }
      // Mons Insurance: pays 3 MC to victim per take-that. No card synergy — passive defense
      // Viron: free action reuse → VP accumulators get double value
      if (corp === 'Viron' && act.addResources) ev += 2;
      // Recyclon: +1 microbe per building tag → building cards more valuable
      if (corp === 'Recyclon' && hasBuilding) ev += 1.5;
      // Terralabs: -1 MC on all cards
      if (corp === 'Terralabs Research' || corp === 'Terralabs') ev += 1;
      // Phobolog: titanium value +1 → space cards cheaper
      if (corp === 'Phobolog' && tags.indexOf('space') >= 0) ev += 1.5; // alias
    }

    // ── MANUAL EV OVERRIDES (effects not captured by parser) ──
    var manual = MANUAL_EV[name];
    // Dynamic MANUAL_EV: Arctic Algae — 2 plants per remaining ocean
    if (manual && manual._dynamic && name === 'Arctic Algae') {
      var oceansPlaced = state.oceans || 0;
      var oceansRemaining = Math.max(0, 9 - oceansPlaced);
      var totalPlants = 2 * oceansRemaining; // +2 plants per ocean placed after this card
      var plantMC = 0.75; // STOCK_MC.plant
      ev += totalPlants * plantMC;
      manual = null; // skip normal manual processing
    }
    if (manual) {
      var perGenMult = 1;
      // Discount action cards when player lacks the resource to fuel them
      if (manual.perGen && ACTION_RESOURCE_REQ[name]) {
        var reqRes = ACTION_RESOURCE_REQ[name];
        var hasProd = false;
        if (reqRes === 'energy') {
          hasProd = (tp.energyProduction || 0) >= 1 || (tp.energy || 0) >= 3;
        } else if (reqRes === 'heat') {
          // energy converts to heat end-of-gen, so energy prod counts
          hasProd = (tp.heatProduction || 0) >= 1 || (tp.energyProduction || 0) >= 1 || (tp.heat || 0) >= 8;
        } else if (reqRes === 'titanium') {
          hasProd = (tp.titaniumProduction || 0) >= 1 || (tp.titanium || 0) >= 2;
        } else if (reqRes === 'plants') {
          hasProd = (tp.plantProduction || 0) >= 1 || (tp.plants || 0) >= 4;
        } else if (reqRes === 'plants_or_steel') {
          hasProd = (tp.plantProduction || 0) >= 1 || (tp.steelProduction || 0) >= 1 || (tp.plants || 0) >= 4 || (tp.steel || 0) >= 2;
        }
        if (!hasProd) perGenMult = 0.3; // might get production later, but unlikely
      }
      if (manual.perGen) ev += manual.perGen * gensLeft * perGenMult;
      if (manual.once) ev += manual.once;
    }

    // ── TAG REQUIREMENT PENALTY ──
    // If card requires N tags of type X and player has fewer, discount EV
    // based on how many tags are missing (probability of acquiring them)
    var tagReq = _cardTagReqs[name];
    if (tagReq) {
      for (var reqTag in tagReq) {
        var needed = tagReq[reqTag];
        var have = myTags[reqTag] || 0;
        // Card's own tag counts toward requirement (played after check, but close enough)
        var cardTags = _cardTags[name] || [];
        var cardContrib = 0;
        for (var cti = 0; cti < cardTags.length; cti++) {
          if (cardTags[cti] === reqTag) cardContrib++;
        }
        var gap = needed - have - cardContrib;
        if (gap > 0) {
          // Each missing tag: ~30% chance of drafting per gen, so probability of
          // getting N tags in gensLeft gens drops exponentially.
          // Rough penalty: -5 MC per missing tag, scaling with gap.
          // 1 missing: -5, 2: -12, 3: -21, 4+: -30+
          var penalty = gap <= 1 ? 5 : gap <= 2 ? 12 : gap <= 3 ? 21 : gap * 8;
          ev -= penalty;
        }
      }
    }

    // ── GLOBAL REQUIREMENT PENALTY ──
    // If card requires temperature/oxygen/oceans/venus and game state doesn't meet,
    // apply penalty based on how far the global parameter is from required value.
    var globalReq = _cardGlobalReqs[name];
    if (globalReq && state && state.game) {
      var game = state.game;
      // Map requirement keys to game state values and step sizes
      var globalMap = {
        temperature: { val: game.temperature, step: 2 },   // temp goes in steps of 2
        oxygen: { val: game.oxygen, step: 1 },              // oxygen goes in steps of 1%
        oceans: { val: game.oceans != null ? game.oceans : (game.oceansPlaced != null ? game.oceansPlaced : null), step: 1 },
        venus: { val: game.venusScaleLevel, step: 2 }        // venus goes in steps of 2
      };
      for (var gk in globalReq) {
        var gInfo = globalMap[gk];
        if (!gInfo || gInfo.val == null) continue;
        var req = globalReq[gk];
        if (req.min != null) {
          // Need global >= min. Steps remaining = (min - current) / stepSize
          var stepsNeeded = (req.min - gInfo.val) / gInfo.step;
          if (stepsNeeded > 0) {
            // In 3P/WGT each param advances ~1-2 steps/gen.
            // Penalty = lost production turns from waiting.
            // ~1.5 MC per step delay, cap at 30 (card is holdable in hand).
            var gPenalty = Math.min(30, stepsNeeded * 1.5);
            ev -= gPenalty;
          }
        }
        if (req.max != null) {
          // Need global <= max. If already past max, card is UNPLAYABLE.
          var overBy = (gInfo.val - req.max) / gInfo.step;
          if (overBy > 0) {
            // Already past max — card cannot be played, massive penalty
            ev -= 50 + overBy * 10;
          }
        }
      }
    }

    // ── FINAL: EV minus cost ──
    // cost already includes server-side discounts via calculatedCost
    var netEV = ev - cost;

    return Math.round(netEV * 10) / 10; // 1 decimal precision
  }

  // ══════════════════════════════════════════════════════════════
  // ENDGAME TIMING DASHBOARD
  // ══════════════════════════════════════════════════════════════

  function endgameTiming(state) {
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
  // HAND CARD RANKING (uses full scoreCard + hand synergy)
  // ══════════════════════════════════════════════════════════════

  // Hand synergy: cards in hand boost each other beyond individual scoreCard value.
  // This captures combos that scoreCard misses because it evaluates cards in isolation.
  function computeHandSynergy(cards, state) {
    if (!cards || cards.length < 2) return {};
    var gensLeft = estimateGensLeft(state);
    var tp = (state && state.thisPlayer) || {};
    var myTags = tp.tags || {};
    var corp = (tp.tableau && tp.tableau[0] && (tp.tableau[0].name || tp.tableau[0])) || '';
    var bonuses = {};  // cardName → { bonus: N, descs: [] }

    // Build hand index: name→tags, tag→cards, special sets
    var handNames = [];
    var handTagMap = {};  // tag → [cardName, ...]
    var handCardTags = {}; // cardName → tags[]
    var handIsEvent = {}; // cardName → bool
    for (var i = 0; i < cards.length; i++) {
      var n = cards[i].name || '';
      handNames.push(n);
      var tags = _cardTags[n] || cards[i].tags || [];
      handCardTags[n] = tags;
      var cd = _cardData[n] || {};
      handIsEvent[n] = tags.indexOf('event') >= 0;
      for (var ti = 0; ti < tags.length; ti++) {
        var t = tags[ti];
        if (!handTagMap[t]) handTagMap[t] = [];
        handTagMap[t].push(n);
      }
    }

    // Global headroom: dampen stacking bonus when globals closing
    var _gp = (state && state.game) || {};
    var tempStepsLeft = typeof _gp.temperature === 'number' ? Math.max(0, (8 - _gp.temperature) / 2) : 19;
    var oxyStepsLeft = typeof _gp.oxygenLevel === 'number' ? Math.max(0, 14 - _gp.oxygenLevel) : 14;
    var ocStepsLeft = typeof _gp.oceans === 'number' ? Math.max(0, 9 - _gp.oceans) : 9;
    var vnStepsLeft = typeof _gp.venusScaleLevel === 'number' ? Math.max(0, (30 - _gp.venusScaleLevel) / 2) : 15;
    var tempHR = tempStepsLeft >= 3 ? 1.0 : Math.max(0.2, tempStepsLeft / 3);
    var plantHR = oxyStepsLeft >= 3 ? 1.0 : Math.max(0.2, oxyStepsLeft / 3);
    var ocHR = ocStepsLeft >= 2 ? 1.0 : Math.max(0.2, ocStepsLeft / 2);
    var vnHR = vnStepsLeft >= 3 ? 1.0 : Math.max(0.2, vnStepsLeft / 3);

    function addBonus(name, val, desc) {
      if (!bonuses[name]) bonuses[name] = { bonus: 0, descs: [] };
      bonuses[name].bonus += val;
      bonuses[name].descs.push(desc);
    }
    var _effDataBot = (typeof root !== 'undefined' && root.TM_CARD_EFFECTS) || {};

    // ── 1. REBATES & TAG TRIGGERS: in hand boost matching cards ──

    // Rush space events raise globals → tempo; Opt Aero heat = more rush
    var RUSH_SPACE_EVENTS = {
      'Asteroid': 1, 'Big Asteroid': 1, 'Comet': 1, 'Comet for Venus': 1, 'Convoy From Europa': 1,
      'Deimos Down': 1, 'GHG Import From Venus': 1, 'Giant Ice Asteroid': 1, 'Hydrogen to Venus': 1,
      'Ice Asteroid': 1, 'Imported Hydrogen': 1, 'Imported Nitrogen': 1, 'Large Convoy': 1,
      'Metallic Asteroid': 1, 'Nitrogen-Rich Asteroid': 1, 'Small Asteroid': 1, 'Small Comet': 1,
      'Solar Storm': 1, 'Spin-Inducing Asteroid': 1, 'Towing A Comet': 1, 'Water to Venus': 1
    };

    // Optimal Aerobraking: base rebate +3 for ALL space events, rush gets +1.5 extra
    if (handNames.indexOf('Optimal Aerobraking') >= 0) {
      var spaceEvents = (handTagMap['space'] || []).filter(function(n) { return handIsEvent[n] && n !== 'Optimal Aerobraking'; });
      var oaAccum = 0;
      for (var se = 0; se < spaceEvents.length; se++) {
        var seRush = RUSH_SPACE_EVENTS[spaceEvents[se]];
        addBonus(spaceEvents[se], seRush ? 4.5 : 3, 'OptAero +' + (seRush ? '4.5 rush' : '3'));
        oaAccum += 2 + (seRush ? 0.5 : 0);
      }
      if (oaAccum > 0) addBonus('Optimal Aerobraking', Math.min(oaAccum, 8), spaceEvents.length + ' space events');
    }

    // Media Group (+3 MC per event played) → events in hand become cheaper
    if (handNames.indexOf('Media Group') >= 0) {
      var events = handNames.filter(function(n) { return handIsEvent[n] && n !== 'Media Group'; });
      var mgAccum = 0;
      for (var me = 0; me < events.length; me++) {
        addBonus(events[me], 1.5, 'Media +1.5');
        mgAccum += 1;
      }
      if (mgAccum > 0) addBonus('Media Group', Math.min(mgAccum, 5), events.length + ' events');
    }

    // Earth Office (-3 MC on earth cards) → boost earth cards in hand
    if (handNames.indexOf('Earth Office') >= 0) {
      var earthCards = (handTagMap['earth'] || []).filter(function(n) { return n !== 'Earth Office'; });
      var eoAccum = 0;
      for (var eo = 0; eo < earthCards.length; eo++) {
        addBonus(earthCards[eo], 3, 'EarthOff -3');
        eoAccum += 1;
      }
      if (eoAccum > 0) addBonus('Earth Office', Math.min(eoAccum, 6), earthCards.length + ' earth cards');
    }

    // Shuttles (-2 MC on space cards) → boost matching
    if (handNames.indexOf('Shuttles') >= 0) {
      var shuttleSpaceCards = (handTagMap['space'] || []).filter(function(n) { return n !== 'Shuttles'; });
      var shAccum = 0;
      for (var sh = 0; sh < shuttleSpaceCards.length; sh++) {
        addBonus(shuttleSpaceCards[sh], 2, 'Shuttles -2');
        shAccum += 0.5;
      }
      if (shAccum > 0) addBonus('Shuttles', Math.min(shAccum, 8), shuttleSpaceCards.length + ' space cards');
    }

    // Standard Technology (+3 MC per standard project) → less valuable directly,
    // but if hand has expensive cards, SP is more likely → skip (too speculative)

    // ── 2. RESOURCE PLACEMENT: card A places resources on card B ──

    // Animal placement cards → boost animal VP cards in hand
    var animalPlacers = TM_ANIMAL_PLACERS;
    var animalVPInHand = handNames.filter(function(n) { return TM_ANIMAL_VP_CARDS.indexOf(n) >= 0; });
    var microbeVPInHand = handNames.filter(function(n) { return TM_MICROBE_VP_CARDS.indexOf(n) >= 0; });

    for (var ap in animalPlacers) {
      if (handNames.indexOf(ap) < 0) continue;
      var count = animalPlacers[ap];
      if (count > 0 && animalVPInHand.length > 0) {
        var vpPerAnimal = vpMC(gensLeft);
        var placerBonus = Math.min(count * vpPerAnimal, 12);
        addBonus(ap, placerBonus * 0.5, animalVPInHand[0].split(' ')[0] + ' +' + count);
        addBonus(animalVPInHand[0], placerBonus * 0.5, ap.split(' ')[0] + ' +' + count);
      }
    }

    // Imported Nitrogen also places microbes
    if (handNames.indexOf('Imported Nitrogen') >= 0 && microbeVPInHand.length > 0) {
      var microbeBonus = Math.min(3 * vpMC(gensLeft) * 0.5, 8); // 3 microbes
      addBonus('Imported Nitrogen', microbeBonus * 0.4, microbeVPInHand[0].split(' ')[0] + ' microbes');
      addBonus(microbeVPInHand[0], microbeBonus * 0.4, 'ImpNitro microbes');
    }

    // Viral Enhancers: +1 animal/plant/microbe per plant/animal/microbe tag played
    if (handNames.indexOf('Viral Enhancers') >= 0) {
      var bioTags = ['plant', 'animal', 'microbe'];
      var feeders = handNames.filter(function(n) {
        if (n === 'Viral Enhancers') return false;
        var t = handCardTags[n] || [];
        for (var bi = 0; bi < bioTags.length; bi++) { if (t.indexOf(bioTags[bi]) >= 0) return true; }
        return false;
      });
      // Each feeder gives Viral Enhancers (and potentially VP targets) extra value
      if (feeders.length > 0 && (animalVPInHand.length > 0 || microbeVPInHand.length > 0)) {
        addBonus('Viral Enhancers', Math.min(feeders.length * 1.5, 8), feeders.length + ' bio feeders');
        for (var vf = 0; vf < feeders.length; vf++) {
          addBonus(feeders[vf], 1, 'Viral +1 res');
        }
      }
    }

    // ── 3. TAG DENSITY: multiple cards with same tag boost each other ──
    // Per-tag cards (Medical Lab, Parliament Hall, etc.) in hand + matching tags in hand
    var perTagCards = {
      'Medical Lab': { tag: 'building', per: 2, val: 1 },
      'Parliament Hall': { tag: 'building', per: 3, val: 1 },
      'Cartel': { tag: 'earth', per: 1, val: 1 },
      'Satellites': { tag: 'space', per: 1, val: 1 },
      'Insects': { tag: 'plant', per: 1, val: 1 },
      'Worms': { tag: 'microbe', per: 1, val: 1 },
    };
    for (var ptc in perTagCards) {
      if (handNames.indexOf(ptc) < 0) continue;
      var ptDef = perTagCards[ptc];
      var handTagCount = (handTagMap[ptDef.tag] || []).filter(function(n) { return n !== ptc; }).length;
      if (handTagCount > 0) {
        var extraProd = Math.floor(handTagCount / ptDef.per) * ptDef.val;
        if (extraProd > 0) {
          addBonus(ptc, extraProd * gensLeft * 0.5, '+' + handTagCount + ' ' + ptDef.tag + ' in hand');
        }
      }
    }

    // ── 4. SCIENCE CHAIN: science engines + science tags in hand ──
    var scienceEngines = { 'Research': 2, 'Olympus Conference': 1.5, 'Invention Contest': 1, 'Mars University': 1 };
    for (var seName in scienceEngines) {
      if (handNames.indexOf(seName) < 0) continue;
      var sciCards = (handTagMap['science'] || []).filter(function(n) { return n !== seName; });
      var seAccum = 0;
      for (var sci = 0; sci < sciCards.length; sci++) {
        seAccum += scienceEngines[seName] * 0.5;
        addBonus(sciCards[sci], scienceEngines[seName] * 0.5, seName.split(' ')[0] + ' +sci');
      }
      if (seAccum > 0) addBonus(seName, Math.min(seAccum, 6), sciCards.length + ' sci cards');
    }

    // ── 5. DISCOUNT CHAIN (data-driven from TM_CARD_DISCOUNTS) ──
    var _cdDataBot = (typeof root !== 'undefined' && root.TM_CARD_DISCOUNTS) || {};
    var _cdSkipBot = { 'Earth Office': 1, 'Shuttles': 1, 'Media Archives': 1, 'Science Fund': 1 }; // handled elsewhere
    for (var deName in _cdDataBot) {
      if (handNames.indexOf(deName) < 0 || _cdSkipBot[deName]) continue;
      var deEntry = _cdDataBot[deName];
      var deLabel = deName.split(' ')[0];
      for (var deTag in deEntry) {
        var deVal = deEntry[deTag];
        if (deVal <= 0) continue;
        var deMatches = (deTag === '_all' || deTag === '_req')
          ? handNames.filter(function(n) { return n !== deName; })
          : (handTagMap[deTag] || []).filter(function(n) { return n !== deName; });
        for (var dm = 0; dm < deMatches.length; dm++) {
          addBonus(deMatches[dm], deVal, deLabel + ' -' + deVal);
          addBonus(deName, deVal * 0.2, deMatches[dm].split(' ')[0]);
        }
      }
    }
    // Advanced Alloys: +1 steel & +1 titanium value
    if (handNames.indexOf('Advanced Alloys') >= 0) {
      var bldCards = (handTagMap['building'] || []).filter(function(n) { return n !== 'Advanced Alloys'; });
      var spcCards = (handTagMap['space'] || []).filter(function(n) { return n !== 'Advanced Alloys'; });
      for (var aa = 0; aa < bldCards.length; aa++) addBonus(bldCards[aa], 1.5, 'AdvAlloys +steel');
      for (var ab = 0; ab < spcCards.length; ab++) addBonus(spcCards[ab], 1.5, 'AdvAlloys +ti');
      if (bldCards.length + spcCards.length > 0) addBonus('Advanced Alloys', (bldCards.length + spcCards.length) * 0.5, (bldCards.length + spcCards.length) + ' steel/ti cards');
    }

    // ── 5b. TAG TRIGGER ENGINES (data-driven from TM_TAG_TRIGGERS) ──
    var _ttSkipBot = {
      'Optimal Aerobraking': 1, 'Earth Office': 1, 'Media Group': 1, 'Viral Enhancers': 1,
      'Olympus Conference': 1, 'Mars University': 1,
      'Space Station': 1, 'Quantum Extractor': 1, 'Mass Converter': 1, 'Warp Drive': 1,
      'Anti-Gravity Technology': 1, 'Earth Catapult': 1, 'Research Outpost': 1,
      'Dirigibles': 1, 'Venus Waystation': 1, 'Shuttles': 1, 'Advanced Alloys': 1,
      'Titan Floating Launch-pad': 1,
    };
    var _ttCorpsBot = (typeof root !== 'undefined' && root.TM_CORPS) || {};
    var _ttDataBot = (typeof root !== 'undefined' && root.TM_TAG_TRIGGERS) || {};
    for (var ttName in _ttDataBot) {
      if (handNames.indexOf(ttName) < 0 || _ttSkipBot[ttName] || _ttCorpsBot[ttName]) continue;
      var ttEntries = _ttDataBot[ttName];
      var ttLabel = ttName.split(' ')[0];
      for (var tti = 0; tti < ttEntries.length; tti++) {
        var tte = ttEntries[tti];
        for (var ttgi = 0; ttgi < tte.tags.length; ttgi++) {
          var ttTag = tte.tags[ttgi];
          var ttMatches = (handTagMap[ttTag] || []).filter(function(n) { return n !== ttName; });
          if (tte.eventOnly) ttMatches = ttMatches.filter(function(n) { return handIsEvent[n]; });
          for (var ttm = 0; ttm < ttMatches.length; ttm++) {
            addBonus(ttMatches[ttm], tte.value * 0.5, ttLabel + ' +trigger');
            addBonus(ttName, tte.value * 0.3, ttMatches[ttm].split(' ')[0] + ' ' + ttTag);
          }
        }
      }
    }

    // ── 6. ENERGY CHAIN: energy producers + energy consumers ──
    var energyProducers = TM_ENERGY_PRODUCERS;
    var energyConsumers = TM_ENERGY_CONSUMERS;
    var enAccum = {};
    var enDescs = {};
    for (var ep = 0; ep < energyProducers.length; ep++) {
      if (handNames.indexOf(energyProducers[ep]) < 0) continue;
      for (var ec = 0; ec < energyConsumers.length; ec++) {
        if (handNames.indexOf(energyConsumers[ec]) < 0) continue;
        enAccum[energyProducers[ep]] = (enAccum[energyProducers[ep]] || 0) + 2;
        enAccum[energyConsumers[ec]] = (enAccum[energyConsumers[ec]] || 0) + 2;
        enDescs[energyProducers[ep]] = (enDescs[energyProducers[ep]] || 0) + 1;
        enDescs[energyConsumers[ec]] = (enDescs[energyConsumers[ec]] || 0) + 1;
      }
    }
    for (var enK in enAccum) {
      addBonus(enK, Math.min(enAccum[enK], 6), enDescs[enK] + ' energy pair(s)');
    }

    // ── 7. JOVIAN VP CHAIN: jovian VP multipliers + jovian tags ──
    var jovianVPCards = TM_JOVIAN_VP_CARDS;
    var jovianInHand = (handTagMap['jovian'] || []);
    for (var jvp = 0; jvp < jovianVPCards.length; jvp++) {
      if (handNames.indexOf(jovianVPCards[jvp]) < 0) continue;
      var otherJovian = jovianInHand.filter(function(n) { return n !== jovianVPCards[jvp]; });
      if (otherJovian.length > 0) {
        var jBonus = Math.min(otherJovian.length * vpMC(gensLeft), 8);
        addBonus(jovianVPCards[jvp], jBonus, otherJovian.length + ' jovian in hand');
        for (var oj = 0; oj < otherJovian.length; oj++) {
          addBonus(otherJovian[oj], vpMC(gensLeft), jovianVPCards[jvp].split(' ')[0] + ' +VP');
        }
      }
    }

    // ── 7b. FLOATER ENGINE: generators + consumers ──
    var floaterGens = TM_FLOATER_GENERATORS;
    var floaterCons = TM_FLOATER_CONSUMERS;
    var flAccum = {};
    var flDescs = {};
    for (var fg = 0; fg < floaterGens.length; fg++) {
      if (handNames.indexOf(floaterGens[fg]) < 0) continue;
      for (var fc = 0; fc < floaterCons.length; fc++) {
        if (floaterGens[fg] === floaterCons[fc]) continue;
        if (handNames.indexOf(floaterCons[fc]) < 0) continue;
        flAccum[floaterGens[fg]] = (flAccum[floaterGens[fg]] || 0) + 2;
        flAccum[floaterCons[fc]] = (flAccum[floaterCons[fc]] || 0) + 2;
        flDescs[floaterGens[fg]] = (flDescs[floaterGens[fg]] || 0) + 1;
        flDescs[floaterCons[fc]] = (flDescs[floaterCons[fc]] || 0) + 1;
      }
    }
    for (var flK in flAccum) {
      addBonus(flK, Math.min(flAccum[flK], 8), flDescs[flK] + ' floater pair(s)');
    }
    // Titan Floating Launch-pad: jovian tags → more floaters
    if (handNames.indexOf('Titan Floating Launch-pad') >= 0) {
      var jovianForFloaters = jovianInHand.filter(function(n) { return n !== 'Titan Floating Launch-pad'; });
      var tflAccum = 0;
      for (var jf = 0; jf < jovianForFloaters.length; jf++) {
        tflAccum += 1.5;
        addBonus(jovianForFloaters[jf], 1, 'TitanLpad +floater');
      }
      if (tflAccum > 0) addBonus('Titan Floating Launch-pad', Math.min(tflAccum, 8), jovianForFloaters.length + ' jovian →floater');
    }

    // ── 7c. COLONY DENSITY: colony builders + trade/benefit cards ──
    var colonyBuilders = TM_COLONY_BUILDERS;
    var colonyBenefits = TM_COLONY_BENEFITS;
    for (var cb = 0; cb < colonyBuilders.length; cb++) {
      if (handNames.indexOf(colonyBuilders[cb]) < 0) continue;
      var cbBenefits = colonyBenefits.filter(function(n) { return n !== colonyBuilders[cb] && handNames.indexOf(n) >= 0; });
      if (cbBenefits.length > 0) {
        addBonus(colonyBuilders[cb], cbBenefits.length * 1.5, cbBenefits.length + ' colony benefit');
      }
      var cbOthers = colonyBuilders.filter(function(n) { return n !== colonyBuilders[cb] && handNames.indexOf(n) >= 0; });
      if (cbOthers.length >= 2) {
        addBonus(colonyBuilders[cb], 2, 'colony chain');
      }
    }

    // ── 8. Protected Habitats: mainly protects plants from removal ──
    if (handNames.indexOf('Protected Habitats') >= 0) {
      var plantTagCards = (handTagMap['plant'] || []).filter(function(n) { return n !== 'Protected Habitats'; });
      var plantProdCards = ['Nitrophilic Moss', 'Arctic Algae', 'Bushes', 'Trees', 'Grass',
        'Kelp Farming', 'Farming', 'Greenhouses', 'Greenhouse'];
      var plantProds = handNames.filter(function(n) { return plantProdCards.indexOf(n) >= 0; });
      var protBonus = plantTagCards.length * 1 + plantProds.length * 2 + animalVPInHand.length * 1;
      if (protBonus > 0) {
        addBonus('Protected Habitats', protBonus, 'protect plants' + (animalVPInHand.length > 0 ? '+animals' : ''));
      }
    }

    // ── 9. STEEL/TI PRODUCTION SYNERGY ──
    // Steel prod cards + building cards in hand
    for (var spi = 0; spi < handNames.length; spi++) {
      var spEff = _effDataBot[handNames[spi]];
      if (!spEff || !spEff.sp || spEff.sp <= 0) continue;
      var bldForSteel = (handTagMap['building'] || []).filter(function(n) { return n !== handNames[spi]; });
      if (bldForSteel.length > 0) {
        var spBonus = Math.min(spEff.sp * bldForSteel.length * 0.8, 5);
        addBonus(handNames[spi], spBonus, bldForSteel.length + ' bld for steel');
        for (var bfs = 0; bfs < bldForSteel.length; bfs++) {
          addBonus(bldForSteel[bfs], Math.min(spEff.sp * 0.7, 2), handNames[spi].split(' ')[0] + ' steel');
        }
      }
    }
    // Titanium prod cards + space cards in hand
    for (var tpi = 0; tpi < handNames.length; tpi++) {
      var tpEff = _effDataBot[handNames[tpi]];
      if (!tpEff || !tpEff.tp || tpEff.tp <= 0) continue;
      var spcForTi = (handTagMap['space'] || []).filter(function(n) { return n !== handNames[tpi]; });
      if (spcForTi.length > 0) {
        var tpBonus = Math.min(tpEff.tp * spcForTi.length * 1.0, 6);
        addBonus(handNames[tpi], tpBonus, spcForTi.length + ' spc for ti');
        for (var sft = 0; sft < spcForTi.length; sft++) {
          addBonus(spcForTi[sft], Math.min(tpEff.tp * 0.9, 2.5), handNames[tpi].split(' ')[0] + ' ti');
        }
      }
    }

    // ── 10-11, 13, 16-17, 26. PRODUCTION/PARAM STACKING (from TM_STACKING_RULES) ──
    var _hrMapB = { plant: plantHR, temp: tempHR, venus: vnHR, ocean: ocHR };
    for (var _sti = 0; _sti < TM_STACKING_RULES.length; _sti++) {
      var sr = TM_STACKING_RULES[_sti];
      var srCards = [];
      for (var _stj = 0; _stj < handNames.length; _stj++) {
        var srEff = _effDataBot[handNames[_stj]];
        if (srEff && srEff[sr.field] > 0) srCards.push({ name: handNames[_stj], val: srEff[sr.field] });
      }
      if (srCards.length >= 2) {
        for (var _stk = 0; _stk < srCards.length; _stk++) {
          var srOther = 0;
          for (var _stl = 0; _stl < srCards.length; _stl++) {
            if (_stk !== _stl) srOther += srCards[_stl].val;
          }
          var srMin = sr.minOther || 0;
          if (srOther > srMin) {
            var srHR = sr.hrKey ? (_hrMapB[sr.hrKey] || 1.0) : 1.0;
            addBonus(srCards[_stk].name, Math.min(srOther * sr.coeff * srHR, sr.cap),
              sr.desc + ' +' + srOther + (sr.suffix || ''));
          }
        }
      }
    }

    // ── 12. MICROBE ENGINE: microbe VP targets + generators + Decomposers ──
    var MICROBE_VP_ALL_B = { 'Decomposers': 3, 'Ants': 2, 'Tardigrades': 4, 'Extremophiles': 3 };
    var MICROBE_GENERATORS_B = { 'Symbiotic Fungus': 1, 'Extreme-Cold Fungus': 2, 'Bactoviral Research': 1 };
    var bioTags2 = ['plant', 'animal', 'microbe'];
    // Decomposers: each bio tag played → +1 microbe → VP
    if (handNames.indexOf('Decomposers') >= 0) {
      var bioFeeders2 = handNames.filter(function(n) {
        if (n === 'Decomposers') return false;
        var t = handCardTags[n] || [];
        for (var bi = 0; bi < bioTags2.length; bi++) { if (t.indexOf(bioTags2[bi]) >= 0) return true; }
        return false;
      });
      if (bioFeeders2.length > 0) {
        addBonus('Decomposers', Math.min(bioFeeders2.length * 1.5, 8), bioFeeders2.length + ' bio→microbe');
        for (var bf = 0; bf < bioFeeders2.length; bf++) {
          addBonus(bioFeeders2[bf], 1, 'Decomp +1m');
        }
      }
    }
    // Microbe generators + microbe VP targets
    for (var mgName in MICROBE_GENERATORS_B) {
      if (handNames.indexOf(mgName) < 0) continue;
      var mgVal = MICROBE_GENERATORS_B[mgName];
      for (var mvpName in MICROBE_VP_ALL_B) {
        if (mvpName === mgName || handNames.indexOf(mvpName) < 0) continue;
        addBonus(mgName, mgVal * 1.5, mvpName.split(' ')[0] + ' VP target');
        addBonus(mvpName, mgVal * 1.5, mgName.split(' ')[0] + ' +' + mgVal + 'm');
      }
    }

    // (13. venus stacking → moved to STACKING_RULES_B above)

    // ── 14. CITY CHAIN: multiple city cards → Mayor milestone + Rover Construction ──
    var cityInHand = (handTagMap['city'] || []);
    if (cityInHand.length >= 2) {
      for (var ci = 0; ci < cityInHand.length; ci++) {
        var otherCityCnt = cityInHand.length - 1;
        var cityBonus2 = otherCityCnt >= 2 ? 3 : 1.5;
        addBonus(cityInHand[ci], cityBonus2, otherCityCnt + ' cities→Mayor');
      }
    }
    // Rover Construction + city cards
    if (handNames.indexOf('Rover Construction') >= 0 && cityInHand.length > 0) {
      var roverCities = cityInHand.filter(function(n) { return n !== 'Rover Construction'; });
      for (var rc = 0; rc < roverCities.length; rc++) {
        addBonus(roverCities[rc], 2, 'Rover +2');
        addBonus('Rover Construction', 1.5, roverCities[rc].split(' ')[0] + ' city');
      }
    }

    // ── 15. EVENT MASS: many events → Legend milestone + compound bonuses ──
    var eventsInHand2 = handNames.filter(function(n) { return handIsEvent[n]; });
    if (eventsInHand2.length >= 3) {
      for (var ei = 0; ei < eventsInHand2.length; ei++) {
        addBonus(eventsInHand2[ei], 1.5, 'Legend potential');
      }
    }
    // Compound: Media Group + Opt Aero in hand → space events get double value
    if (handNames.indexOf('Media Group') >= 0 && handNames.indexOf('Optimal Aerobraking') >= 0) {
      var spaceEvents = handNames.filter(function(n) {
        return n !== 'Media Group' && n !== 'Optimal Aerobraking' && handIsEvent[n] &&
          (handCardTags[n] || []).indexOf('space') >= 0;
      });
      for (var se = 0; se < spaceEvents.length; se++) {
        addBonus(spaceEvents[se], 1, 'Media+OptA combo');
      }
    }

    // (16-17. temp/ocean stacking → moved to STACKING_RULES_B above)

    // ── 18. TR RUSH: 3+ TR-raising cards → cohesive rush strategy ──
    var handTRTotal = 0;
    var trCardsList = [];
    for (var tri = 0; tri < handNames.length; tri++) {
      var trEff = _effDataBot[handNames[tri]];
      if (!trEff) continue;
      var cardTR = (trEff.tr || 0) + (trEff.tmp || 0) + (trEff.oc || 0) + (trEff.vn ? Math.ceil(trEff.vn / 2) : 0);
      if (cardTR > 0) {
        handTRTotal += cardTR;
        trCardsList.push(handNames[tri]);
      }
    }
    if (handTRTotal >= 5 && trCardsList.length >= 3) {
      for (var trc = 0; trc < trCardsList.length; trc++) {
        var trEff2 = _effDataBot[trCardsList[trc]];
        var myTR = (trEff2.tr || 0) + (trEff2.tmp || 0) + (trEff2.oc || 0) + (trEff2.vn ? Math.ceil(trEff2.vn / 2) : 0);
        var otherTR = handTRTotal - myTR;
        addBonus(trCardsList[trc], Math.min(otherTR * 0.3, 3), 'TR rush ' + otherTR);
      }
    }

    // ── 19. ROBOTIC WORKFORCE: copies building production ──
    if (handNames.indexOf('Robotic Workforce') >= 0) {
      var bestProd = 0, bestProdName = '';
      for (var rwi = 0; rwi < handNames.length; rwi++) {
        if (handNames[rwi] === 'Robotic Workforce') continue;
        if ((handCardTags[handNames[rwi]] || []).indexOf('building') < 0) continue;
        var rwE = _effDataBot[handNames[rwi]] || {};
        var rwVal = (rwE.mp||0)*1 + (rwE.sp||0)*1.6 + (rwE.tp||0)*2.5 + (rwE.pp||0)*1.6 + (rwE.ep||0)*1.5 + (rwE.hp||0)*0.8;
        if (rwVal > bestProd) { bestProd = rwVal; bestProdName = handNames[rwi]; }
      }
      if (bestProd >= 3) {
        addBonus('Robotic Workforce', Math.min(bestProd * 0.8, 6), 'copy ' + bestProdName.split(' ')[0]);
        addBonus(bestProdName, Math.min(bestProd * 0.4, 3), 'RoboWork copy');
      }
    }

    // ── 20. REGO PLASTICS: +1 steel value + building cards ──
    if (handNames.indexOf('Rego Plastics') >= 0) {
      var rpBld = (handTagMap['building'] || []).filter(function(n) { return n !== 'Rego Plastics'; });
      if (rpBld.length > 0) {
        addBonus('Rego Plastics', Math.min(rpBld.length * 1, 4), rpBld.length + ' bld +steel');
        for (var rp = 0; rp < rpBld.length; rp++) {
          addBonus(rpBld[rp], 1, 'Rego +1 steel');
        }
      }
    }

    // ── 21-25, 27-28. NAMED CARD COMBOS (data-driven) ──
    // ── 21-25, 27-28. NAMED CARD COMBOS (from TM_NAMED_EFF_COMBOS / TM_NAMED_TAG_COMBOS) ──
    for (var _nci = 0; _nci < TM_NAMED_EFF_COMBOS.length; _nci++) {
      var nc = TM_NAMED_EFF_COMBOS[_nci];
      if (handNames.indexOf(nc.n) < 0) continue;
      var ncTotal = 0;
      for (var _ncj = 0; _ncj < handNames.length; _ncj++) {
        if (handNames[_ncj] === nc.n) continue;
        var ncEff = _effDataBot[handNames[_ncj]];
        if (ncEff && ncEff[nc.f] > 0) ncTotal += ncEff[nc.f];
      }
      if (ncTotal > (nc.fM || 0)) {
        addBonus(nc.n, Math.min(ncTotal * nc.fc, nc.fC), ncTotal + ' ' + nc.fd);
        for (var _nck = 0; _nck < handNames.length; _nck++) {
          if (handNames[_nck] === nc.n) continue;
          var nckEff = _effDataBot[handNames[_nck]];
          if (nckEff && nckEff[nc.f] > 0) {
            if (nc.rf > 0) {
              addBonus(handNames[_nck], nc.rf, nc.rd);
            } else if (nc.rc > 0) {
              addBonus(handNames[_nck], Math.min(nckEff[nc.f] * nc.rc, nc.rC), nc.rd);
            }
          }
        }
      }
    }
    for (var _ntci = 0; _ntci < TM_NAMED_TAG_COMBOS.length; _ntci++) {
      var ntc = TM_NAMED_TAG_COMBOS[_ntci];
      if (handNames.indexOf(ntc.n) < 0) continue;
      var ntcMatches = [];
      for (var _ntcj = 0; _ntcj < handNames.length; _ntcj++) {
        if (handNames[_ntcj] === ntc.n) continue;
        var ntcTags = handCardTags[handNames[_ntcj]] || [];
        for (var _ntct = 0; _ntct < ntc.tags.length; _ntct++) {
          if (ntcTags.indexOf(ntc.tags[_ntct]) >= 0) { ntcMatches.push(handNames[_ntcj]); break; }
        }
      }
      if (ntcMatches.length > 0) {
        addBonus(ntc.n, Math.min(ntcMatches.length * ntc.fc, ntc.fC), ntcMatches.length + ' ' + ntc.fd);
        for (var _ntck = 0; _ntck < ntcMatches.length; _ntck++) {
          addBonus(ntcMatches[_ntck], ntc.rb, ntc.rd);
        }
      }
    }

    // ── 29. ACTION CARD DIMINISHING RETURNS: 4+ action cards → not enough actions/gen ──
    var actionCardNames = [];
    for (var aci = 0; aci < handNames.length; aci++) {
      var acEff = _effDataBot[handNames[aci]];
      if (acEff && (acEff.actTR || acEff.actMC || acEff.vpAcc)) actionCardNames.push(handNames[aci]);
    }
    if (actionCardNames.length >= 4) {
      var actPenalty = (actionCardNames.length - 3) * -0.8;
      for (var acp = 0; acp < actionCardNames.length; acp++) {
        addBonus(actionCardNames[acp], Math.max(actPenalty, -3), actionCardNames.length + ' actions compete');
      }
    }

    // ── 33. ARIDOR UNIQUE TAG SYNERGY: multiple new tag types in hand ──
    if (corp === 'Aridor') {
      var newTagTypes = {};
      for (var ai = 0; ai < handNames.length; ai++) {
        var aTags = handCardTags[handNames[ai]] || [];
        for (var at = 0; at < aTags.length; at++) {
          if (aTags[at] !== 'event' && (myTags[aTags[at]] || 0) === 0) {
            if (!newTagTypes[aTags[at]]) newTagTypes[aTags[at]] = [];
            newTagTypes[aTags[at]].push(handNames[ai]);
          }
        }
      }
      // If multiple cards bring the same NEW tag, only the first one triggers Aridor
      // → penalize duplicates, boost the cheapest one
      for (var nt in newTagTypes) {
        if (newTagTypes[nt].length > 1) {
          // The cheapest card should be played first to get the Aridor trigger
          // Others lose ~5 MC (the colony bonus) since tag is no longer new
          // This is already handled in scoreCard per card, but we note it
        }
      }
    }

    // ── 31. EXISTING PRODUCTION AMPLIFIER: new prod card joins running engine ──
    var _tpProd = tp || {};
    var _existSP = _tpProd.steelProduction || 0;
    var _existTP = _tpProd.titaniumProduction || 0;
    var _existPP = _tpProd.plantProduction || 0;
    var _existHP = _tpProd.heatProduction || 0;
    var _existEP = _tpProd.energyProduction || 0;
    for (var _epi = 0; _epi < handNames.length; _epi++) {
      var _epEff = _effDataBot[handNames[_epi]] || {};
      // Steel prod card + existing steel + building consumers
      if (_epEff.sp > 0 && _existSP >= 1) {
        var _bldC = (handTagMap['building'] || []).filter(function(n) { return n !== handNames[_epi]; }).length;
        if (_bldC > 0) addBonus(handNames[_epi], Math.min(_existSP * 0.3, 1.5), 'steel engine ×' + _existSP);
      }
      // Ti prod card + existing ti + space consumers
      if (_epEff.tp > 0 && _existTP >= 1) {
        var _spcC = (handTagMap['space'] || []).filter(function(n) { return n !== handNames[_epi]; }).length;
        if (_spcC > 0) addBonus(handNames[_epi], Math.min(_existTP * 0.4, 2), 'ti engine ×' + _existTP);
      }
      // Plant prod card + existing plant prod ≥2
      if (_epEff.pp > 0 && _existPP >= 2) {
        addBonus(handNames[_epi], Math.min(_existPP * 0.2 * plantHR, 1.5), 'plant engine ×' + _existPP);
      }
      // Heat prod card + existing heat prod ≥3
      if (_epEff.hp > 0 && _existHP >= 3) {
        addBonus(handNames[_epi], Math.min(_existHP * 0.15 * tempHR, 1.5), 'heat engine ×' + _existHP);
      }
    }

    // ── 32. ENERGY CONSUMER + EXISTING ENERGY PROD (no producer in hand needed) ──
    var energyConsAll = ['Electro Catapult', 'Physics Complex', 'Water Splitting Plant', 'Ironworks',
      'Steelworks', 'Ore Processor', 'Power Infrastructure', 'Spin-Off Department'];
    if (_existEP >= 1) {
      var epInHand = ['Nuclear Power', 'Solar Power', 'Giant Space Mirror', 'Power Supply Consortium',
        'Geothermal Power', 'Quantum Extractor', 'Lightning Harvest', 'Corona Extractor', 'Lunar Beam'];
      var hasEProdBot = false;
      for (var _epc = 0; _epc < handNames.length; _epc++) {
        if (epInHand.indexOf(handNames[_epc]) >= 0) { hasEProdBot = true; break; }
      }
      if (!hasEProdBot) {
        for (var _ecb = 0; _ecb < handNames.length; _ecb++) {
          if (energyConsAll.indexOf(handNames[_ecb]) >= 0) {
            addBonus(handNames[_ecb], Math.min(_existEP * 1, 3), 'existing ep ' + _existEP);
          }
        }
      }
    }

    // ── 35. CORP-SPECIFIC HAND SYNERGY: cards compound when corp ability multiplies them ──
    if (corp) {
      // Point Luna: each earth tag draws a card → multiple earth cards compound
      if (corp === 'Point Luna') {
        var earthCards = handTagMap['earth'] || [];
        if (earthCards.length >= 2) {
          for (var _pli = 0; _pli < earthCards.length; _pli++) {
            var _otherEarth = earthCards.length - 1;
            addBonus(earthCards[_pli], Math.min(_otherEarth * 0.8, 3), 'PtLuna earth×' + earthCards.length);
          }
        }
      }

      // Interplanetary Cinematics: +2 MC per event → mass events = MC burst
      if (corp === 'Interplanetary Cinematics') {
        var eventCards = handTagMap['event'] || [];
        if (eventCards.length >= 3) {
          for (var _ici = 0; _ici < eventCards.length; _ici++) {
            addBonus(eventCards[_ici], Math.min((eventCards.length - 1) * 0.5, 2.5), 'IC events×' + eventCards.length);
          }
        }
      }

      // Splice: +2 MC per microbe tag → mass microbe = MC engine
      if (corp === 'Splice') {
        var micCards = handTagMap['microbe'] || [];
        if (micCards.length >= 2) {
          for (var _spi = 0; _spi < micCards.length; _spi++) {
            addBonus(micCards[_spi], Math.min((micCards.length - 1) * 0.5, 2), 'Splice mic×' + micCards.length);
          }
        }
      }

      // Arklight: +1 MC prod per animal/plant tag → bio mass = compound prod
      if (corp === 'Arklight') {
        var bioCards = (handTagMap['animal'] || []).concat(handTagMap['plant'] || []);
        var bioUniq = [];
        var _bioSeen = {};
        for (var _bui = 0; _bui < bioCards.length; _bui++) {
          if (!_bioSeen[bioCards[_bui]]) { bioUniq.push(bioCards[_bui]); _bioSeen[bioCards[_bui]] = true; }
        }
        if (bioUniq.length >= 2) {
          for (var _aki = 0; _aki < bioUniq.length; _aki++) {
            addBonus(bioUniq[_aki], Math.min((bioUniq.length - 1) * 0.6, 3), 'Arklight bio×' + bioUniq.length);
          }
        }
      }

      // Tharsis Republic: +1 MC prod per city → multiple cities compound
      if (corp === 'Tharsis Republic') {
        var cityCards = handTagMap['city'] || [];
        if (cityCards.length >= 2) {
          for (var _tri = 0; _tri < cityCards.length; _tri++) {
            addBonus(cityCards[_tri], Math.min((cityCards.length - 1) * 0.7, 2.5), 'Tharsis city×' + cityCards.length);
          }
        }
      }

      // Saturn Systems: +1 MC prod per jovian → multiple jovians compound
      if (corp === 'Saturn Systems') {
        var jovCards = handTagMap['jovian'] || [];
        if (jovCards.length >= 2) {
          for (var _ssi = 0; _ssi < jovCards.length; _ssi++) {
            addBonus(jovCards[_ssi], Math.min((jovCards.length - 1) * 0.7, 3), 'Saturn jov×' + jovCards.length);
          }
        }
      }

      // CrediCor: -4 MC refund on 20+ cost cards → multiple expensive = tempo burst
      if (corp === 'CrediCor') {
        var expCards = [];
        for (var _cri = 0; _cri < handNames.length; _cri++) {
          var _crEff = _effDataBot[handNames[_cri]];
          if (_crEff && (_crEff.c || 0) >= 20) expCards.push(handNames[_cri]);
        }
        if (expCards.length >= 2) {
          for (var _crj = 0; _crj < expCards.length; _crj++) {
            addBonus(expCards[_crj], Math.min((expCards.length - 1) * 0.6, 2.5), 'CrediCor 20+×' + expCards.length);
          }
        }
      }

      // Helion: heat = MC → heat prod cards compound (excess heat is liquid)
      if (corp === 'Helion') {
        var heatPCards = [];
        for (var _hli = 0; _hli < handNames.length; _hli++) {
          var _hlEff = _effDataBot[handNames[_hli]];
          if (_hlEff && _hlEff.hp > 0) heatPCards.push(handNames[_hli]);
        }
        if (heatPCards.length >= 2) {
          var totalHP = 0;
          for (var _hlj = 0; _hlj < heatPCards.length; _hlj++) {
            totalHP += (_effDataBot[heatPCards[_hlj]].hp || 0);
          }
          for (var _hlk = 0; _hlk < heatPCards.length; _hlk++) {
            var otherHP = totalHP - (_effDataBot[heatPCards[_hlk]].hp || 0);
            addBonus(heatPCards[_hlk], Math.min(otherHP * 0.4, 2), 'Helion heat→MC ×' + otherHP);
          }
        }
      }

      // Mining Guild: +1 steel prod per steel/ti placement → building mass compounds
      if (corp === 'Mining Guild') {
        var mgBldCards = handTagMap['building'] || [];
        if (mgBldCards.length >= 3) {
          for (var _mgi = 0; _mgi < mgBldCards.length; _mgi++) {
            addBonus(mgBldCards[_mgi], Math.min((mgBldCards.length - 2) * 0.5, 2), 'MiningG bld×' + mgBldCards.length);
          }
        }
      }

      // Thorgate: -3 MC per power tag → multiple power = discount burst
      if (corp === 'Thorgate') {
        var pwrCards = handTagMap['power'] || [];
        if (pwrCards.length >= 2) {
          for (var _thi = 0; _thi < pwrCards.length; _thi++) {
            addBonus(pwrCards[_thi], Math.min((pwrCards.length - 1) * 0.6, 2), 'Thorgate pwr×' + pwrCards.length);
          }
        }
      }
    }

    // ── 38. LATE-GAME VP BURST: hand full of VP/TR cards at gensLeft ≤ 2 = compound ──
    if (gensLeft <= 2) {
      var vpCards = [];
      for (var _vbi = 0; _vbi < handNames.length; _vbi++) {
        var _vbEff = _effDataBot[handNames[_vbi]] || {};
        // vpAcc cards (Birds, Fish) still score 1-2 VP at endgame
        var _vpTotal = (_vbEff.vp || 0) + (_vbEff.tr || 0) + (_vbEff.tmp || 0) + (_vbEff.vn || 0) + (_vbEff.oc || 0) + (_vbEff.vpAcc > 0 ? 1 : 0);
        if (_vpTotal > 0) vpCards.push(handNames[_vbi]);
      }
      if (vpCards.length >= 3) {
        for (var _vpj = 0; _vpj < vpCards.length; _vpj++) {
          var _vpOthers = vpCards.length - 1;
          var burstVal = gensLeft <= 1 ? Math.min(_vpOthers * 0.8, 3) : Math.min(_vpOthers * 0.5, 2);
          addBonus(vpCards[_vpj], burstVal, 'VP burst ×' + vpCards.length + (gensLeft <= 1 ? ' FINAL' : ''));
        }
      }
    }

    // ── 39. COLONY TRADE ENGINE: trade fleet + colony placement = compound ──
    var _colBuilders = ['Space Port', 'Space Port Colony', 'Titan Shuttles', 'Trade Envoys',
      'Rim Freighters', 'Mining Colony', 'Research Colony', 'Martian Zoo',
      'Community Services', 'Productive Outpost', 'Pioneer Settlement'];
    var _tradeFleet = ['Trade Envoys', 'Rim Freighters', 'Titan Shuttles',
      'Galilean Waystation', 'Quantum Communications'];
    var colBuildersInHand = [];
    var fleetInHand = [];
    for (var _ci = 0; _ci < handNames.length; _ci++) {
      if (_colBuilders.indexOf(handNames[_ci]) >= 0) colBuildersInHand.push(handNames[_ci]);
      if (_tradeFleet.indexOf(handNames[_ci]) >= 0) fleetInHand.push(handNames[_ci]);
    }
    if (colBuildersInHand.length >= 1 && fleetInHand.length >= 1) {
      for (var _cbi = 0; _cbi < colBuildersInHand.length; _cbi++) {
        addBonus(colBuildersInHand[_cbi], Math.min(fleetInHand.length * 1.0, 2), 'fleet+colony ×' + fleetInHand.length);
      }
      for (var _fi = 0; _fi < fleetInHand.length; _fi++) {
        addBonus(fleetInHand[_fi], Math.min(colBuildersInHand.length * 0.8, 2.5), 'colony×' + colBuildersInHand.length + '+fleet');
      }
    }
    if (colBuildersInHand.length >= 3) {
      for (var _csi = 0; _csi < colBuildersInHand.length; _csi++) {
        addBonus(colBuildersInHand[_csi], Math.min((colBuildersInHand.length - 2) * 0.5, 1.5), colBuildersInHand.length + ' col stack');
      }
    }

    // ── 40. TURMOIL PARTY SYNERGY: ruling party boosts/penalizes certain tags ──
    var _turm = (state && state.game && state.game.turmoil) || {};
    var _rulingBot = _turm.ruling || '';
    var _partyTagMapBot = {
      'Mars First': ['mars'],
      'Scientists': ['science'],
      'Unity': ['venus', 'earth', 'jovian'],
      'Greens': ['plant', 'microbe', 'animal']
    };
    if (_rulingBot && _rulingBot !== 'Reds' && _rulingBot !== 'Kelvinists') {
      var _partyTags = _partyTagMapBot[_rulingBot];
      if (_partyTags) {
        // Collect all cards matching party tags
        var partyMatches = {};
        for (var _pbi = 0; _pbi < handNames.length; _pbi++) {
          var _pbTags = handCardTags[handNames[_pbi]] || [];
          var hits = 0;
          for (var _pbj = 0; _pbj < _pbTags.length; _pbj++) {
            if (_partyTags.indexOf(_pbTags[_pbj]) >= 0) hits++;
          }
          if (hits > 0) partyMatches[handNames[_pbi]] = hits;
        }
        var partyCount = Object.keys(partyMatches).length;
        if (partyCount >= 2) {
          for (var _pmk in partyMatches) {
            addBonus(_pmk, Math.min((partyCount - 1) * 0.4, 2.5), _rulingBot.split(' ')[0] + ' party ×' + partyCount);
          }
        }
      }
    }
    // Kelvinists: boost heat prod cards
    if (_rulingBot === 'Kelvinists') {
      var hpBotCards = [];
      for (var _kbi = 0; _kbi < handNames.length; _kbi++) {
        var _kbEff = _effDataBot[handNames[_kbi]] || {};
        if (_kbEff.hp > 0) hpBotCards.push(handNames[_kbi]);
      }
      if (hpBotCards.length >= 2) {
        for (var _kbj = 0; _kbj < hpBotCards.length; _kbj++) {
          addBonus(hpBotCards[_kbj], Math.min((hpBotCards.length - 1) * 0.5, 2), 'Kelvin heat×' + hpBotCards.length);
        }
      }
    }
    // Reds: TR-raising cards compound penalty
    if (_rulingBot === 'Reds') {
      var trBotCards = [];
      for (var _rbi = 0; _rbi < handNames.length; _rbi++) {
        var _rbEff = _effDataBot[handNames[_rbi]] || {};
        if ((_rbEff.tr || 0) + (_rbEff.tmp || 0) + (_rbEff.vn || 0) + (_rbEff.oc || 0) > 0) trBotCards.push(handNames[_rbi]);
      }
      if (trBotCards.length >= 2) {
        for (var _rbj = 0; _rbj < trBotCards.length; _rbj++) {
          addBonus(trBotCards[_rbj], Math.max((trBotCards.length - 1) * -0.3, -2), 'Reds tax TR×' + trBotCards.length);
        }
      }
    }

    // ── 41. ANTI-SYNERGY: cards that conflict within the same hand ──
    // Plant prod + SELF plant-prod reduction = real conflict
    // Birds/Herbivores target opponent's pp, NOT anti-synergy with own plant prod
    var _selfPlantEatBot = ['Food Factory', 'Biomass Combustors'];
    var ppBotNames = [];
    var paFoundBot = [];
    for (var _abi = 0; _abi < handNames.length; _abi++) {
      var _abEff = _effDataBot[handNames[_abi]] || {};
      if (_abEff.pp > 0) ppBotNames.push(handNames[_abi]);
      if (_selfPlantEatBot.indexOf(handNames[_abi]) >= 0) paFoundBot.push(handNames[_abi]);
    }
    if (ppBotNames.length >= 1 && paFoundBot.length >= 1) {
      for (var _ppb = 0; _ppb < ppBotNames.length; _ppb++) {
        if (paFoundBot.indexOf(ppBotNames[_ppb]) < 0) {
          addBonus(ppBotNames[_ppb], -1, paFoundBot[0].split(' ')[0] + ' eats own pp');
        }
      }
    }
    // 2+ energy consumers competing
    var epConsBot = ['Steelworks', 'Ironworks', 'Water Splitting Plant'];
    var epConsBotFound = [];
    for (var _ecf = 0; _ecf < handNames.length; _ecf++) {
      if (epConsBot.indexOf(handNames[_ecf]) >= 0) epConsBotFound.push(handNames[_ecf]);
    }
    if (epConsBotFound.length >= 3) {
      for (var _ecg = 0; _ecg < epConsBotFound.length; _ecg++) {
        addBonus(epConsBotFound[_ecg], Math.max((epConsBotFound.length - 2) * -0.5, -1.5), epConsBotFound.length + ' ep consumers fight');
      }
    }

    // ── 43. PRODUCTION DIVERSITY: hand gives 3+ different prod types → Generalist ──
    var allProdTypes = {};
    var cardProdMap = {}; // cardName → has prod (bool)
    for (var _pdi = 0; _pdi < handNames.length; _pdi++) {
      var _pdEff = _effDataBot[handNames[_pdi]] || {};
      var hasProd = false;
      if (_pdEff.mp > 0) { allProdTypes.mc = true; hasProd = true; }
      if (_pdEff.sp > 0) { allProdTypes.steel = true; hasProd = true; }
      if (_pdEff.tp > 0) { allProdTypes.ti = true; hasProd = true; }
      if (_pdEff.pp > 0) { allProdTypes.plants = true; hasProd = true; }
      if (_pdEff.ep > 0) { allProdTypes.energy = true; hasProd = true; }
      if (_pdEff.hp > 0) { allProdTypes.heat = true; hasProd = true; }
      if (hasProd) cardProdMap[handNames[_pdi]] = true;
    }
    var totalProdTypes = Object.keys(allProdTypes).length;
    if (totalProdTypes >= 4) {
      var divBonus = totalProdTypes >= 6 ? 2 : totalProdTypes >= 5 ? 1.5 : 1;
      for (var _pdj in cardProdMap) {
        addBonus(_pdj, divBonus, totalProdTypes + ' prod types→Generalist');
      }
    }

    // ── 44. OPPONENT CORP GLOBAL PENALTY: raising params that help opp ──
    var _oppCorpsBot = [];
    if (state && state.game && state.game.players) {
      var _myColorBot = tp.color || '';
      for (var _obi = 0; _obi < state.game.players.length; _obi++) {
        var _obp = state.game.players[_obi];
        if (_obp.color === _myColorBot) continue;
        if (_obp.tableau && _obp.tableau[0]) {
          var _obCorp = _obp.tableau[0].name || _obp.tableau[0];
          if (_obCorp) _oppCorpsBot.push(_obCorp);
        }
      }
    }
    if (_oppCorpsBot.length > 0) {
      var oppHasPolaris = _oppCorpsBot.indexOf('Polaris') >= 0;
      var oppHasAphrodite = _oppCorpsBot.indexOf('Aphrodite') >= 0;
      if (oppHasPolaris) {
        var ocBotCards = [];
        for (var _oci = 0; _oci < handNames.length; _oci++) {
          var _ocEff = _effDataBot[handNames[_oci]] || {};
          if (_ocEff.oc > 0) ocBotCards.push(handNames[_oci]);
        }
        if (ocBotCards.length >= 2) {
          for (var _ocj = 0; _ocj < ocBotCards.length; _ocj++) {
            addBonus(ocBotCards[_ocj], Math.max((ocBotCards.length - 1) * -0.4, -1.5), 'opp Polaris oc×' + ocBotCards.length);
          }
        }
      }
      if (oppHasAphrodite) {
        var vnBotCards = [];
        for (var _vni = 0; _vni < handNames.length; _vni++) {
          var _vnEff = _effDataBot[handNames[_vni]] || {};
          if (_vnEff.vn > 0) vnBotCards.push(handNames[_vni]);
        }
        if (vnBotCards.length >= 2) {
          for (var _vnj = 0; _vnj < vnBotCards.length; _vnj++) {
            addBonus(vnBotCards[_vnj], Math.max((vnBotCards.length - 1) * -0.3, -1), 'opp Aphrodite vn×' + vnBotCards.length);
          }
        }
      }
    }

    // ── 45. TIMING COHESION: all-prod early or all-VP late = strategic coherence ──
    var prodBotCards = [];
    var vpBotCards2 = [];
    for (var _tci = 0; _tci < handNames.length; _tci++) {
      var _tcEff = _effDataBot[handNames[_tci]] || {};
      if (_tcEff.mp > 0 || _tcEff.sp > 0 || _tcEff.tp > 0 || _tcEff.pp > 0 || _tcEff.ep > 0 || _tcEff.hp > 0) prodBotCards.push(handNames[_tci]);
      if ((_tcEff.vp || 0) > 0 || _tcEff.vpAcc || (_tcEff.tr || 0) > 0) vpBotCards2.push(handNames[_tci]);
    }
    if (prodBotCards.length >= 4 && gensLeft >= 5) {
      for (var _pcb = 0; _pcb < prodBotCards.length; _pcb++) {
        addBonus(prodBotCards[_pcb], Math.min((prodBotCards.length - 3) * 0.5, 1.5), 'prod cohesion ×' + prodBotCards.length);
      }
    }
    if (vpBotCards2.length >= 3 && gensLeft === 3) { // gensLeft ≤ 2 handled by VP burst (section 38)
      for (var _vcb = 0; _vcb < vpBotCards2.length; _vcb++) {
        addBonus(vpBotCards2[_vcb], Math.min((vpBotCards2.length - 2) * 0.5, 2), 'VP cohesion ×' + vpBotCards2.length);
      }
    }

    // ── 46. WILD TAG COMPOUND: wild tags amplify all triggers/discounts ──
    var wildBotCards = handTagMap['wild'] || [];
    if (wildBotCards.length >= 1) {
      var triggerCardsInHand = 0;
      var _ttDataBot = typeof TM_TAG_TRIGGERS !== 'undefined' ? TM_TAG_TRIGGERS : {};
      var _cdDataBot = typeof TM_CARD_DISCOUNTS !== 'undefined' ? TM_CARD_DISCOUNTS : {};
      for (var _wbi = 0; _wbi < handNames.length; _wbi++) {
        if (_ttDataBot[handNames[_wbi]]) triggerCardsInHand++;
        if (_cdDataBot[handNames[_wbi]]) triggerCardsInHand++;
      }
      if (triggerCardsInHand >= 1) {
        for (var _wbj = 0; _wbj < wildBotCards.length; _wbj++) {
          addBonus(wildBotCards[_wbj], Math.min(triggerCardsInHand * 0.4, 3), 'wild amplifies ' + triggerCardsInHand + ' triggers');
        }
        // Non-wild cards also benefit from wild (extra trigger match)
        for (var _wbk = 0; _wbk < handNames.length; _wbk++) {
          if (wildBotCards.indexOf(handNames[_wbk]) >= 0) continue;
          if (_ttDataBot[handNames[_wbk]] || _cdDataBot[handNames[_wbk]]) {
            addBonus(handNames[_wbk], Math.min(wildBotCards.length * 0.3, 1), wildBotCards.length + ' wild in hand');
          }
        }
      }
    }

    // ── 47. STEEL/TI STOCKPILE COMPOUND: resources + matching cards cheapened ──
    var _stBot = tp.steel || 0;
    var _tiBot = tp.titanium || 0;
    if (_stBot >= 3) {
      var bldBotList = handTagMap['building'] || [];
      if (bldBotList.length >= 3) {
        for (var _sbi = 0; _sbi < bldBotList.length; _sbi++) {
          addBonus(bldBotList[_sbi], Math.min((bldBotList.length - 2) * 0.4, 2), 'steel ' + _stBot + '+' + bldBotList.length + ' bld');
        }
      }
    }
    if (_tiBot >= 2) {
      var spcBotList = handTagMap['space'] || [];
      if (spcBotList.length >= 3) {
        for (var _tbi = 0; _tbi < spcBotList.length; _tbi++) {
          addBonus(spcBotList[_tbi], Math.min((spcBotList.length - 2) * 0.5, 2.5), 'ti ' + _tiBot + '+' + spcBotList.length + ' spc');
        }
      }
    }

    // ── 48. DRAW ENGINE COMPOUND: multiple card-draw sources = hand refill ──
    var _drawCardsBot = {
      'Research': 2, 'Invention Contest': 1, 'Mars University': 1, 'Olympus Conference': 1,
      'Business Network': 1, 'Restricted Area': 1, 'AI Central': 2,
      'Media Archives': 1, 'Orbital Laboratories': 1, 'Development Center': 1,
      'Search For Life': 1, 'Aerial Mappers': 1
    };
    var drawBotFound = [];
    for (var _dbi = 0; _dbi < handNames.length; _dbi++) {
      if (_drawCardsBot[handNames[_dbi]] !== undefined && _drawCardsBot[handNames[_dbi]] > 0) drawBotFound.push(handNames[_dbi]);
    }
    if (drawBotFound.length >= 2) {
      for (var _dbj = 0; _dbj < drawBotFound.length; _dbj++) {
        addBonus(drawBotFound[_dbj], Math.min((drawBotFound.length - 1) * 0.6, 2), 'draw engine ×' + drawBotFound.length);
      }
    }

    // ── 49. HAND COST TEMPO: cheap cohesive hand = play 3-4 cards/gen ──
    if (handNames.length >= 4) {
      var cheapCards = [];
      for (var _cti = 0; _cti < handNames.length; _cti++) {
        var ctEff = _effDataBot[handNames[_cti]];
        if (ctEff && ctEff.c && ctEff.c <= 14) cheapCards.push(handNames[_cti]);
      }
      if (cheapCards.length >= 3) {
        var tempoVal = Math.min((cheapCards.length - 2) * 0.6, 2);
        for (var _ctj = 0; _ctj < cheapCards.length; _ctj++) {
          addBonus(cheapCards[_ctj], tempoVal, 'tempo ×' + cheapCards.length + ' cheap');
        }
      }
    }

    // ── 51. DOUBLE TAG EXTRA TRIGGERS: cards with 2+ of same tag fire triggers twice ──
    for (var _dti = 0; _dti < handNames.length; _dti++) {
      var dtTags = handCardTags[handNames[_dti]] || [];
      if (dtTags.length < 2) continue;
      var dtCounts = {};
      for (var _dtk = 0; _dtk < dtTags.length; _dtk++) {
        dtCounts[dtTags[_dtk]] = (dtCounts[dtTags[_dtk]] || 0) + 1;
      }
      for (var dtTag in dtCounts) {
        if (dtCounts[dtTag] < 2 || dtTag === 'science') continue;
        for (var _dtj = 0; _dtj < handNames.length; _dtj++) {
          if (handNames[_dtj] === handNames[_dti]) continue;
          var dtTrigger = TM_TAG_TRIGGERS[handNames[_dtj]];
          if (!dtTrigger) continue;
          for (var _dtl = 0; _dtl < dtTrigger.length; _dtl++) {
            if (dtTrigger[_dtl].tags.indexOf(dtTag) >= 0) {
              var dtExtra = (dtCounts[dtTag] - 1) * dtTrigger[_dtl].value * 0.3;
              addBonus(handNames[_dti], Math.min(dtExtra, 2),
                handNames[_dtj].split(' ')[0] + ' +' + dtTag + '×' + dtCounts[dtTag]);
              break;
            }
          }
        }
      }
    }

    // ── 52. NO-TAG PENALTY: cards without tags miss trigger/discount synergies ──
    for (var _nti = 0; _nti < handNames.length; _nti++) {
      var ntTags = handCardTags[handNames[_nti]] || [];
      if (ntTags.length > 0 || handIsEvent[handNames[_nti]]) continue;
      var ntMissed = 0;
      for (var _ntj = 0; _ntj < handNames.length; _ntj++) {
        if (handNames[_ntj] === handNames[_nti]) continue;
        if (TM_TAG_TRIGGERS[handNames[_ntj]] || TM_CARD_DISCOUNTS[handNames[_ntj]]) ntMissed++;
      }
      if (ntMissed >= 1) {
        addBonus(handNames[_nti], -Math.min(ntMissed * 0.6, 2), 'no tag: miss ' + ntMissed + ' trigger/disc');
      }
    }

    // ── 53. VP ACCUMULATOR TIMING: early vpAcc cards = more gens to grow ──
    if (gensLeft >= 5) {
      var vpAccCards = [];
      for (var _vai = 0; _vai < handNames.length; _vai++) {
        var vaEff = _effDataBot[handNames[_vai]];
        if (vaEff && vaEff.vpAcc > 0) vpAccCards.push(handNames[_vai]);
      }
      if (vpAccCards.length >= 2) {
        var vpEngVal = Math.min((vpAccCards.length - 1) * 0.5, 1.5);
        for (var _vaj = 0; _vaj < vpAccCards.length; _vaj++) {
          addBonus(vpAccCards[_vaj], vpEngVal, 'VP engine ×' + vpAccCards.length + ' early');
        }
      }
    }

    // ── 54. GLOBAL PARAM RUSH: hand all-in on one param = closing bonus ──
    var paramCounts = { tmp: 0, oc: 0, vn: 0 };
    for (var _gri = 0; _gri < handNames.length; _gri++) {
      var grEff = _effDataBot[handNames[_gri]];
      if (!grEff) continue;
      if (grEff.tmp > 0) paramCounts.tmp += grEff.tmp;
      if (grEff.oc > 0) paramCounts.oc += grEff.oc;
      if (grEff.vn > 0) paramCounts.vn += grEff.vn;
    }
    var _hrMapR = { tmp: tempHR, oc: ocHR, vn: vnHR };
    var _rushThresh = { tmp: 4, oc: 3, vn: 4 };
    var _rushNames = { tmp: 'temp', oc: 'ocean', vn: 'venus' };
    for (var rParam in paramCounts) {
      if (paramCounts[rParam] < _rushThresh[rParam]) continue;
      var rHR = _hrMapR[rParam] || 1.0;
      var rVal = Math.min(paramCounts[rParam] * 0.2 * rHR, 1.5);
      if (rVal <= 0.3) continue;
      for (var _grj = 0; _grj < handNames.length; _grj++) {
        var grjEff = _effDataBot[handNames[_grj]];
        if (grjEff && grjEff[rParam] > 0) {
          addBonus(handNames[_grj], rVal, _rushNames[rParam] + ' rush ×' + paramCounts[rParam]);
        }
      }
    }

    // ── 55. TAG DENSITY BONUS: 4+ cards with same tag → milestone proximity ──
    var tagDensityB = {};
    for (var _tdi = 0; _tdi < handNames.length; _tdi++) {
      var tdTags = handCardTags[handNames[_tdi]] || [];
      for (var _tdj = 0; _tdj < tdTags.length; _tdj++) {
        var tdt = tdTags[_tdj];
        if (tdt === 'event') continue;
        tagDensityB[tdt] = (tagDensityB[tdt] || 0) + 1;
      }
    }
    for (var tdTag in tagDensityB) {
      if (tagDensityB[tdTag] < 4) continue;
      var tdVal = Math.min((tagDensityB[tdTag] - 3) * 0.4, 1.5);
      for (var _tdk = 0; _tdk < handNames.length; _tdk++) {
        var tdkTags = handCardTags[handNames[_tdk]] || [];
        if (tdkTags.indexOf(tdTag) >= 0) {
          addBonus(handNames[_tdk], tdVal, tagDensityB[tdTag] + '×' + tdTag);
        }
      }
    }

    // ── 56. COST OVERLOAD PENALTY: hand of expensive cards = can't play multiple per gen ──
    if (handNames.length >= 4) {
      var coExpensive = 0, coTotalCost = 0;
      for (var _coi = 0; _coi < handNames.length; _coi++) {
        var coEff = _effDataBot[handNames[_coi]];
        if (coEff && coEff.c) {
          coTotalCost += coEff.c;
          if (coEff.c > 20) coExpensive++;
        }
      }
      var coAvg = coTotalCost / handNames.length;
      if (coExpensive >= 3 && coAvg > 22) {
        var coOverload = -Math.min((coAvg - 22) * 0.15, 2.5);
        for (var _coj = 0; _coj < handNames.length; _coj++) {
          var cojEff = _effDataBot[handNames[_coj]];
          if (cojEff && cojEff.c > 20) {
            addBonus(handNames[_coj], coOverload, 'costly hand avg' + Math.round(coAvg));
          }
        }
      }
    }

    // ── 57. ENERGY→HEAT PIPELINE: energy prod residual becomes heat next gen ──
    // Energy not consumed becomes heat. With heat strategy cards, hidden synergy.
    var epCards = [];
    for (var _ehi = 0; _ehi < handNames.length; _ehi++) {
      var ehEff = _effDataBot[handNames[_ehi]];
      if (ehEff && ehEff.ep > 0) epCards.push(handNames[_ehi]);
    }
    if (epCards.length > 0) {
      var heatBenefitBot = 0;
      var hasConsumerBot = false;
      for (var _ehj = 0; _ehj < handNames.length; _ehj++) {
        var ehjEff = _effDataBot[handNames[_ehj]];
        if (!ehjEff) continue;
        if (ehjEff.hp > 0 || ehjEff.tmp > 0) heatBenefitBot++;
        if (handNames[_ehj] === 'Insulation' || handNames[_ehj] === 'Caretaker Contract') heatBenefitBot++;
        if (TM_ENERGY_CONSUMERS.indexOf(handNames[_ehj]) >= 0) hasConsumerBot = true;
      }
      if (!hasConsumerBot && heatBenefitBot >= 2) {
        for (var _ehk = 0; _ehk < epCards.length; _ehk++) {
          var epVal = _effDataBot[epCards[_ehk]].ep || 0;
          var pipeValBot = Math.min(epVal * 0.4 * tempHR, 1.5);
          if (pipeValBot > 0.2) {
            addBonus(epCards[_ehk], pipeValBot, 'ep→heat pipe ×' + heatBenefitBot);
          }
        }
      }
    }

    // ── 58. MC CONVERSION ENABLERS: Insulation/Power Infra/Caretaker compound with production ──
    var MC_CONVERTERS_BOT = {
      'Insulation': { src: 'hp', label: 'heat→MC', perProd: 0.6 },
      'Power Infrastructure': { src: 'ep', label: 'energy→MC', perProd: 0.8 },
      'Caretaker Contract': { src: 'hp', label: 'heat→TR', perProd: 0.5 },
    };
    for (var _mci = 0; _mci < handNames.length; _mci++) {
      var mcConvBot = MC_CONVERTERS_BOT[handNames[_mci]];
      if (!mcConvBot) continue;
      var convProdBot = 0;
      for (var _mcj = 0; _mcj < handNames.length; _mcj++) {
        if (handNames[_mcj] === handNames[_mci]) continue;
        var mcjEff = _effDataBot[handNames[_mcj]];
        if (mcjEff && mcjEff[mcConvBot.src] > 0) convProdBot += mcjEff[mcConvBot.src];
      }
      if (convProdBot >= 3) {
        addBonus(handNames[_mci], Math.min(convProdBot * mcConvBot.perProd, 3),
          mcConvBot.label + ' ×' + convProdBot + ' prod');
      }
    }
    // Reverse: production card + converter in hand
    var hasInsulBot = handNames.indexOf('Insulation') >= 0;
    var hasCaretakerBot = handNames.indexOf('Caretaker Contract') >= 0;
    var hasPwrInfraBot = handNames.indexOf('Power Infrastructure') >= 0;
    for (var _mcr = 0; _mcr < handNames.length; _mcr++) {
      var mcrEff = _effDataBot[handNames[_mcr]];
      if (!mcrEff) continue;
      if (mcrEff.hp > 0 && (hasCaretakerBot || hasPwrInfraBot) && !hasInsulBot) {
        var convNameBot = hasCaretakerBot ? 'Caretaker' : 'PwrInfra';
        addBonus(handNames[_mcr], Math.min(mcrEff.hp * 0.3, 1.5), convNameBot + ' convert');
      }
      if (mcrEff.ep > 0 && hasPwrInfraBot && handNames[_mcr] !== 'Power Infrastructure') {
        addBonus(handNames[_mcr], Math.min(mcrEff.ep * 0.4, 2), 'PwrInfra ×' + mcrEff.ep + 'ep');
      }
    }

    // ── 59. (removed — Predators eating own animals is VP-neutral, not a penalty) ──

    // ── 62. IMMEDIATE RESOURCES: cards giving steel/ti + building/space cards = instant use ──
    var _delCardsBot = typeof TM_DELEGATE_CARDS !== 'undefined' ? TM_DELEGATE_CARDS : {};
    for (var _isi = 0; _isi < handNames.length; _isi++) {
      var isEff = _effDataBot[handNames[_isi]];
      if (!isEff) continue;
      var isTags = handCardTags[handNames[_isi]] || [];
      // Immediate steel + building cards
      if (isEff.st > 0) {
        var bldForSt = (handTagMap['building'] || []).filter(function(n) { return n !== handNames[_isi]; }).length;
        if (bldForSt > 0) {
          addBonus(handNames[_isi], Math.min(isEff.st * 0.5, 2.5), isEff.st + ' steel→' + bldForSt + ' bld');
        }
      }
      // Building card + immediate steel from hand
      if (isTags.indexOf('building') >= 0) {
        var stFromHand = 0;
        for (var _isj = 0; _isj < handNames.length; _isj++) {
          if (handNames[_isj] === handNames[_isi]) continue;
          var isjEff = _effDataBot[handNames[_isj]];
          if (isjEff && isjEff.st > 0) stFromHand += isjEff.st;
        }
        if (stFromHand >= 3) {
          addBonus(handNames[_isi], Math.min(stFromHand * 0.3, 1.5), stFromHand + ' steel avail');
        }
      }
      // Immediate titanium + space cards
      if (isEff.ti > 0) {
        var spcForTi = (handTagMap['space'] || []).filter(function(n) { return n !== handNames[_isi]; }).length;
        if (spcForTi > 0) {
          addBonus(handNames[_isi], Math.min(isEff.ti * 0.7, 3), isEff.ti + ' ti→' + spcForTi + ' spc');
        }
      }
      // Space card + immediate titanium from hand
      if (isTags.indexOf('space') >= 0) {
        var tiFromHand = 0;
        for (var _itj = 0; _itj < handNames.length; _itj++) {
          if (handNames[_itj] === handNames[_isi]) continue;
          var itjEff = _effDataBot[handNames[_itj]];
          if (itjEff && itjEff.ti > 0) tiFromHand += itjEff.ti;
        }
        if (tiFromHand >= 2) {
          addBonus(handNames[_isi], Math.min(tiFromHand * 0.4, 2), tiFromHand + ' ti avail');
        }
      }
    }

    // ── 63. DELEGATE COMPOUND: multiple delegate cards = political control ──
    var delFound = [];
    var delTotalBot = 0;
    for (var _dli = 0; _dli < handNames.length; _dli++) {
      if (_delCardsBot[handNames[_dli]]) {
        delFound.push(handNames[_dli]);
        delTotalBot += _delCardsBot[handNames[_dli]];
      }
    }
    if (delFound.length >= 2 && delTotalBot >= 3) {
      // Non-linear: 3-4 = party leader, 5-6 = chairman likely, 7+ = chairman lock
      var delCoeffBot = delTotalBot >= 7 ? 0.9 : delTotalBot >= 5 ? 0.7 : 0.5;
      for (var _dlj = 0; _dlj < delFound.length; _dlj++) {
        var othDel = delTotalBot - _delCardsBot[delFound[_dlj]];
        addBonus(delFound[_dlj], Math.min(othDel * delCoeffBot, 5), delTotalBot + ' delegates');
      }
    }

    // ── 60. STANDARD TECHNOLOGY: -3 MC on standard projects ──
    // StdTech is good with MC production (more budget to dump into SPs).
    // Plant/heat/energy prod REDUCE SP need (you greenery via plants, temp via heat).
    var hasStdTech = handNames.indexOf('Standard Technology') >= 0;
    if (hasStdTech) {
      var stMCProdBot = 0;
      for (var _sti2 = 0; _sti2 < handNames.length; _sti2++) {
        if (handNames[_sti2] === 'Standard Technology') continue;
        var stEff = _effDataBot[handNames[_sti2]];
        if (stEff && stEff.mp > 0) stMCProdBot += stEff.mp;
      }
      if (stMCProdBot >= 3) {
        addBonus('Standard Technology', Math.min(stMCProdBot * 0.3, 2), 'StdTech +' + stMCProdBot + 'MC→SP');
      }
      // Reverse: MC production card with Standard Technology in hand
      for (var _stj2 = 0; _stj2 < handNames.length; _stj2++) {
        if (handNames[_stj2] === 'Standard Technology') continue;
        var stjEff = _effDataBot[handNames[_stj2]];
        if (stjEff && stjEff.mp > 0) {
          addBonus(handNames[_stj2], 0.5, 'StdTech -3 SP');
        }
      }
    }

    // ── 61. GREENERY PIPELINE: 6+ total plant prod + O2 headroom = TR engine ──
    if (gensLeft >= 4 && plantHR > 0.5) {
      var totalPPBot = 0;
      var ppCardsBot = [];
      for (var _gpi = 0; _gpi < handNames.length; _gpi++) {
        var gpEff = _effDataBot[handNames[_gpi]];
        if (gpEff && gpEff.pp > 0) {
          totalPPBot += gpEff.pp;
          ppCardsBot.push(handNames[_gpi]);
        }
      }
      if (totalPPBot >= 6) {
        var greeneryRateBot = totalPPBot / 8;
        var pipeValBot = Math.min(greeneryRateBot * 0.6 * plantHR, 1.5);
        if (pipeValBot > 0.3) {
          for (var _gpj = 0; _gpj < ppCardsBot.length; _gpj++) {
            addBonus(ppCardsBot[_gpj], pipeValBot, 'greenery engine ' + totalPPBot + 'pp');
          }
        }
      }
    }

    // ── 64. MULTI-DISCOUNT COMPOUND: 3+ discount sources stacking ──
    var _cdDataMD = typeof TM_CARD_DISCOUNTS !== 'undefined' ? TM_CARD_DISCOUNTS : {};
    for (var _mdi = 0; _mdi < handNames.length; _mdi++) {
      var mdTags = handCardTags[handNames[_mdi]] || [];
      if (handIsEvent[handNames[_mdi]]) continue;
      var mdTotalDisc = 0, mdSources = 0;
      for (var _mdj = 0; _mdj < handNames.length; _mdj++) {
        if (handNames[_mdj] === handNames[_mdi]) continue;
        var mdEntry = _cdDataMD[handNames[_mdj]];
        if (!mdEntry) continue;
        for (var mdTag in mdEntry) {
          if (mdEntry[mdTag] <= 0) continue;
          if (mdTag === '_all' || mdTag === '_req' || mdTags.indexOf(mdTag) >= 0) {
            mdTotalDisc += mdEntry[mdTag];
            mdSources++;
            break;
          }
        }
      }
      if (mdSources >= 2 && mdTotalDisc >= 4) {
        addBonus(handNames[_mdi], Math.min((mdSources - 1) * 0.5, 1.5),
          mdSources + ' disc stack -' + mdTotalDisc);
      }
    }

    // ── 65. CITY + GREENERY ADJACENCY: city cards + plant prod = +MC adjacency ──
    if (gensLeft >= 3) {
      var cityCardsAdj = handTagMap['city'] || [];
      var ppForAdj = 0;
      var ppAdjCards = [];
      for (var _adi = 0; _adi < handNames.length; _adi++) {
        var adEff = _effDataBot[handNames[_adi]];
        if (adEff && adEff.pp > 0) {
          ppForAdj += adEff.pp;
          ppAdjCards.push(handNames[_adi]);
        }
      }
      if (cityCardsAdj.length >= 1 && ppForAdj >= 4) {
        var adjVal = Math.min(ppForAdj / 8 * gensLeft * 0.15, 1.5);
        if (adjVal > 0.3) {
          for (var _adj = 0; _adj < cityCardsAdj.length; _adj++) {
            addBonus(cityCardsAdj[_adj], adjVal, 'adj greenery ' + ppForAdj + 'pp');
          }
          for (var _adp = 0; _adp < ppAdjCards.length; _adp++) {
            addBonus(ppAdjCards[_adp], Math.min(cityCardsAdj.length * 0.4, 1), cityCardsAdj.length + ' city adj');
          }
        }
      }
    }

    // ── 66. PREREQ ENABLERS: param-raising cards unlock requirement cards in hand ──
    var _globalReqs = typeof TM_CARD_GLOBAL_REQS !== 'undefined' ? TM_CARD_GLOBAL_REQS :
                      (typeof _cardGlobalReqs !== 'undefined' ? _cardGlobalReqs : {});
    var paramMap = { tmp: 'temperature', oc: 'oceans', o2: 'oxygen', vn: 'venus' };
    var paramStep = { tmp: 2, oc: 1, o2: 1, vn: 2 };
    for (var _pei = 0; _pei < handNames.length; _pei++) {
      var peCard = handNames[_pei];
      var peEff = _effDataBot[peCard] || {};
      // Forward: this card raises params → unlock others with min-req
      var peEnabled = 0;
      for (var pmKey in paramMap) {
        if (!peEff[pmKey] || peEff[pmKey] <= 0) continue;
        for (var _pej = 0; _pej < handNames.length; _pej++) {
          if (handNames[_pej] === peCard) continue;
          var reqData = _globalReqs[handNames[_pej]];
          if (reqData && reqData[paramMap[pmKey]] && reqData[paramMap[pmKey]].min) peEnabled++;
        }
      }
      if (peEnabled >= 1) {
        addBonus(peCard, Math.min(peEnabled * 0.5, 1.5),
          'unlock ' + peEnabled + ' req card' + (peEnabled > 1 ? 's' : ''));
      }
      // Reverse: this card has min-req → enablers in hand
      var peReqs = _globalReqs[peCard];
      if (peReqs) {
        var peEnablers = 0;
        for (var pmKey2 in paramMap) {
          if (!peReqs[paramMap[pmKey2]] || !peReqs[paramMap[pmKey2]].min) continue;
          for (var _pek = 0; _pek < handNames.length; _pek++) {
            if (handNames[_pek] === peCard) continue;
            var pekEff = _effDataBot[handNames[_pek]] || {};
            if (pekEff[pmKey2] && pekEff[pmKey2] > 0) peEnablers++;
          }
        }
        if (peEnablers >= 1) {
          addBonus(peCard, Math.min(peEnablers * 0.4, 1),
            peEnablers + ' enabler' + (peEnablers > 1 ? 's' : '') + ' for req');
        }
      }
    }

    // ── 67. MAX-REQ ANTI-SYNERGY: param-raising conflicts with max-requirement cards ──
    for (var _mei = 0; _mei < handNames.length; _mei++) {
      var meReqs = _globalReqs[handNames[_mei]];
      if (!meReqs) continue;
      var meAnti = 0;
      for (var pmKey3 in paramMap) {
        if (!meReqs[paramMap[pmKey3]] || !meReqs[paramMap[pmKey3]].max) continue;
        for (var _mej = 0; _mej < handNames.length; _mej++) {
          if (handNames[_mej] === handNames[_mei]) continue;
          var mejEff = _effDataBot[handNames[_mej]] || {};
          if (mejEff[pmKey3] && mejEff[pmKey3] > 0) meAnti++;
        }
      }
      if (meAnti >= 1) {
        addBonus(handNames[_mei], -Math.min(meAnti * 0.4, 1),
          meAnti + ' raise vs max-req');
      }
    }

    // ── 70. TAG REQUIREMENT ENABLERS: hand provides tags needed for tag-req cards ──
    var _tagReqs = typeof TM_CARD_TAG_REQS !== 'undefined' ? TM_CARD_TAG_REQS : {};
    for (var _tri = 0; _tri < handNames.length; _tri++) {
      var trReq = _tagReqs[handNames[_tri]];
      if (!trReq) continue;
      for (var trTag in trReq) {
        var trNeeded = trReq[trTag];
        var trProvided = 0;
        for (var _trj = 0; _trj < handNames.length; _trj++) {
          if (handNames[_trj] === handNames[_tri]) continue;
          var trTags = handCardTags[handNames[_trj]] || [];
          for (var _trk = 0; _trk < trTags.length; _trk++) {
            if (trTags[_trk] === trTag) trProvided++;
          }
        }
        if (trProvided >= 1) {
          var trRatio = Math.min(trProvided / trNeeded, 1);
          var trVal = trRatio >= 1 ? Math.min(1.5, trNeeded * 0.3) : trRatio * 0.8;
          if (trVal > 0.2) {
            addBonus(handNames[_tri], trVal, trProvided + '/' + trNeeded + ' ' + trTag + ' req');
          }
        }
      }
      // Reverse: tag providers get bonus for enabling this req card
      for (var trTag2 in trReq) {
        for (var _trl = 0; _trl < handNames.length; _trl++) {
          if (handNames[_trl] === handNames[_tri]) continue;
          if (handIsEvent[handNames[_trl]]) continue;
          var trlTags = handCardTags[handNames[_trl]] || [];
          if (trlTags.indexOf(trTag2) >= 0) {
            addBonus(handNames[_trl], 0.3, 'enable ' + handNames[_tri].substring(0, 10) + ' req');
          }
        }
      }
    }

    // ── 68. TIMING MISMATCH: prod cards late or VP-only cards early = diminished value ──
    if (gensLeft <= 2) {
      var lateProdCards = [];
      for (var _tmi = 0; _tmi < handNames.length; _tmi++) {
        var tmEff = _effDataBot[handNames[_tmi]] || {};
        var tmIsProd = (tmEff.mp > 0 || tmEff.sp > 0 || tmEff.tp > 0 || tmEff.pp > 0 || tmEff.ep > 0 || tmEff.hp > 0);
        var tmIsVP = (tmEff.vp > 0 || tmEff.vpAcc || tmEff.tr > 0);
        if (tmIsProd && !tmIsVP) lateProdCards.push(handNames[_tmi]);
      }
      if (lateProdCards.length >= 3) {
        var lateProdPen = -Math.min((lateProdCards.length - 2) * 0.5, 1.5);
        for (var _tmj = 0; _tmj < lateProdCards.length; _tmj++) {
          addBonus(lateProdCards[_tmj], lateProdPen, 'late prod ×' + lateProdCards.length);
        }
      }
    }

    // ── 69. SHARED RESOURCE COMPETITION: multiple animal VP accumulators compete ──
    var animalAccCards = [];
    for (var _arci = 0; _arci < handNames.length; _arci++) {
      var arcEff = _effDataBot[handNames[_arci]] || {};
      var arcTags = handCardTags[handNames[_arci]] || [];
      if (arcEff.vpAcc && arcTags.indexOf('animal') >= 0) animalAccCards.push(handNames[_arci]);
    }
    if (animalAccCards.length >= 3) {
      var arcPen = -Math.min((animalAccCards.length - 2) * 0.4, 1);
      for (var _arcj = 0; _arcj < animalAccCards.length; _arcj++) {
        addBonus(animalAccCards[_arcj], arcPen, animalAccCards.length + ' animal VP compete');
      }
    }

    // Global per-card cap: hand synergy shouldn't dominate base score
    for (var _capK in bonuses) {
      bonuses[_capK].bonus = Math.max(Math.min(bonuses[_capK].bonus, 12), -5);
    }
    return bonuses;
  }

  function rankHandCards(cards, state) {
    if (!cards || cards.length === 0) return [];
    var tp = (state && state.thisPlayer) || {};
    var mc = tp.megaCredits || 0;
    var steel = tp.steel || 0;
    var titanium = tp.titanium || 0;
    var steps = remainingSteps(state);

    // Phase 1: base score per card
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
      if (typeof TM_RATINGS !== 'undefined' && TM_RATINGS[name]) {
        var baseScore = TM_RATINGS[name].s || 50;
        if (cost === 0) {
          // Corps/preludes: scoreCard can't capture abilities (discounts, triggers, etc.)
          // Trust TM_RATINGS (hand-tuned) with only light EV adjustment
          score = Math.round(baseScore * 0.85 + score * 0.15);
        } else {
          score = Math.round((score + baseScore) / 2);
        }
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

    // Phase 2: hand synergy — cards in hand boost each other
    var synBonuses = computeHandSynergy(cards, state);
    for (var si = 0; si < results.length; si++) {
      var syn = synBonuses[results[si].name];
      if (syn && syn.bonus) {
        results[si].score += Math.round(syn.bonus);
        var synDesc = syn.descs.slice(0, 4).join(', ');
        results[si].reason += ' [syn: ' + synDesc + ']';
        results[si].stars = results[si].score >= 30 ? 3 : (results[si].score >= 15 ? 2 : 1);
      }
    }

    results.sort(function(a, b) { return b.score - a.score; });
    return results;
  }

  // ══════════════════════════════════════════════════════════════
  // PASS ANALYSIS
  // ══════════════════════════════════════════════════════════════

  function analyzePass(state) {
    var tp = (state && state.thisPlayer) || {};
    var mc = tp.megaCredits || 0;
    var heat = tp.heat || 0;
    var plants = tp.plants || 0;
    var energy = tp.energy || 0;
    var steps = remainingSteps(state);
    var gen = (state && state.game && state.game.generation) || 5;

    var plantCost = 8; // default, can be 7 for EcoLine
    var canGreenery = plants >= plantCost;
    var tempMaxed = state && state.game && typeof state.game.temperature === 'number' && state.game.temperature >= 8;
    var canHeatTR = heat >= 8 && !tempMaxed;
    var canSPAsteroid = mc >= 14 && !tempMaxed;
    var canSPAquifer = mc >= 18;
    var canSPGreenery = mc >= 23;
    var cardsInHand = tp.cardsInHandNbr || (tp.cardsInHand ? tp.cardsInHand.length : 0);

    // Count unused blue actions in tableau
    var usedActions = tp.actionsThisGeneration || [];
    var usedSet = new Set(usedActions);
    var tableauActions = 0;
    if (tp.tableau) {
      for (var ti = 0; ti < tp.tableau.length; ti++) {
        var cn = tp.tableau[ti].name || tp.tableau[ti];
        var cd = _cardData[cn] || {};
        if (cd.action && !usedSet.has(cn)) tableauActions++;
      }
    }

    // Colony trades available (only if colonies expansion is active)
    var colonies = (state && state.game && state.game.colonies) || [];
    var fleets = tp.fleetSize || 0;
    var tradesUsed = tp.tradesThisGeneration || 0;
    var canTrade = colonies.length > 0 && fleets > tradesUsed;

    // Count available actions
    var canSP = canSPAsteroid || canSPAquifer || canSPGreenery;
    var availableActions = cardsInHand + tableauActions + (canGreenery ? 1 : 0) + (canHeatTR ? 1 : 0) + (canTrade ? 1 : 0) + (canSP ? 1 : 0);

    if (gen <= 4 && availableActions > 0) {
      return { shouldPass: false, confidence: 'high', reason: '\u0420\u0430\u043d\u043d\u044f\u044f \u0438\u0433\u0440\u0430, \u0435\u0441\u0442\u044c \u0447\u0442\u043e \u0434\u0435\u043b\u0430\u0442\u044c' };
    }

    if (availableActions === 0 && mc < 11) {
      return { shouldPass: true, confidence: 'high', reason: '\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0445 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439' };
    }

    if (steps <= 4 && !canGreenery && !canHeatTR && mc < 14 && tableauActions === 0 && !canTrade) {
      return { shouldPass: true, confidence: 'high', reason: '\u042d\u043d\u0434\u0433\u0435\u0439\u043c, \u0440\u0435\u0441\u0443\u0440\u0441\u043e\u0432 \u043c\u0430\u043b\u043e' };
    }

    if (mc < 5 && !canGreenery && !canHeatTR && cardsInHand <= 1 && tableauActions === 0 && !canTrade) {
      return { shouldPass: true, confidence: 'medium', reason: '\u041c\u0430\u043b\u043e MC, \u043d\u0435\u0442 \u043a\u043e\u043d\u0432\u0435\u0440\u0441\u0438\u0439' };
    }

    // Only low-value options left
    if (cardsInHand === 0 && tableauActions === 0 && !canGreenery && !canHeatTR && !canTrade) {
      if (canSP && steps > 0) {
        return { shouldPass: false, confidence: 'low', reason: '\u0421\u0442\u0430\u043d\u0434\u0430\u0440\u0442\u043d\u044b\u0439 \u043f\u0440\u043e\u0435\u043a\u0442' };
      }
      return { shouldPass: true, confidence: 'medium', reason: '\u041e\u0441\u0442\u0430\u043b\u0438\u0441\u044c \u0442\u043e\u043b\u044c\u043a\u043e SP' };
    }

    var reasons = [];
    if (cardsInHand > 0) reasons.push(cardsInHand + ' \u043a\u0430\u0440\u0442');
    if (tableauActions > 0) reasons.push(tableauActions + ' \u0434\u0435\u0439\u0441\u0442\u0432.');
    if (canTrade) reasons.push('\u0442\u043e\u0440\u0433\u043e\u0432\u043b\u044f');
    if (canGreenery) reasons.push('\u043e\u0437\u0435\u043b\u0435\u043d\u0435\u043d\u0438\u0435');
    if (canHeatTR) reasons.push('\u0442\u0435\u043f\u043b\u043e\u2192TR');
    return { shouldPass: false, confidence: 'low', reason: reasons.length > 0 ? reasons.join(', ') : '\u0415\u0441\u0442\u044c \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f' };
  }

  // ══════════════════════════════════════════════════════════════
  // ACTION ANALYSIS
  // ══════════════════════════════════════════════════════════════

  function analyzeActions(waitingFor, state) {
    if (!waitingFor) return [];

    var tp = (state && state.thisPlayer) || {};
    var mc = tp.megaCredits || 0;
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
        var oxyMaxed = state && state.game && typeof state.game.oxygenLevel === 'number' && state.game.oxygenLevel >= 14;
        if (plants >= 8) {
          if (oxyMaxed) {
            score = endgame ? 75 : 65;
            emoji = '\ud83c\udf3f';
            reason = '\u041e\u0437\u0435\u043b\u0435\u043d\u0435\u043d\u0438\u0435 = VP (\u043a\u0438\u0441\u043b\u043e\u0440\u043e\u0434 \u043c\u0430\u043a\u0441)';
          } else if (steps > 0) {
            score = endgame ? 95 : 80;
            emoji = '\ud83c\udf3f';
            reason = '\u041e\u0437\u0435\u043b\u0435\u043d\u0435\u043d\u0438\u0435 = TR + VP';
          } else {
            score = 70;
            emoji = '\ud83c\udf3f';
            reason = '\u041e\u0437\u0435\u043b\u0435\u043d\u0435\u043d\u0438\u0435 = VP';
          }
        } else {
          score = 30;
          emoji = '\ud83c\udf3f';
          reason = '\u041c\u0430\u043b\u043e \u0440\u0430\u0441\u0442\u0435\u043d\u0438\u0439';
        }
      }
      else if (titleLow.indexOf('heat') >= 0 || (titleLow.indexOf('temperature') >= 0 && titleLow.indexOf('convert') >= 0)) {
        var g = (state && state.game) || {};
        var tempMaxed = typeof g.temperature === 'number' && g.temperature >= 8;
        if (tempMaxed) {
          score = 15;
          emoji = '\ud83d\udd25';
          reason = '\u0422\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430 \u043c\u0430\u043a\u0441';
        } else if (heat >= 8 && steps > 0) {
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
        // Differentiate standard projects by sub-options if available
        var spSubs = opt.options || [];
        var spBest = '';
        var spBestScore = 0;
        for (var spi = 0; spi < spSubs.length; spi++) {
          var spTitle = (spSubs[spi].title || '').toLowerCase();
          var spVal = 0;
          var raisesGlobal = false;
          if (spTitle.indexOf('aquifer') >= 0 || spTitle.indexOf('ocean') >= 0) {
            spVal = steps > 0 ? (endgame ? 75 : 60) : 30;
            raisesGlobal = true;
            if (spVal > spBestScore) { spBestScore = spVal; spBest = 'Aquifer'; }
          } else if (spTitle.indexOf('asteroid') >= 0) {
            var tMaxed = state && state.game && typeof state.game.temperature === 'number' && state.game.temperature >= 8;
            spVal = tMaxed ? 15 : (steps > 0 ? (endgame ? 70 : 55) : 30);
            raisesGlobal = true;
            if (spVal > spBestScore) { spBestScore = spVal; spBest = 'Asteroid'; }
          } else if (spTitle.indexOf('greenery') >= 0) {
            var oMaxed = state && state.game && typeof state.game.oxygenLevel === 'number' && state.game.oxygenLevel >= 14;
            spVal = oMaxed ? (endgame ? 70 : 50) : (endgame ? 75 : 55);
            raisesGlobal = !oMaxed;
            if (spVal > spBestScore) { spBestScore = spVal; spBest = 'Greenery SP'; }
          } else if (spTitle.indexOf('city') >= 0) {
            spVal = endgame ? 45 : 55;
            if (spVal > spBestScore) { spBestScore = spVal; spBest = 'City SP'; }
          } else if (spTitle.indexOf('power') >= 0) {
            spVal = 35;
            if (spVal > spBestScore) { spBestScore = spVal; spBest = 'Power Plant'; }
          } else if (spTitle.indexOf('air') >= 0 || spTitle.indexOf('venus') >= 0) {
            spVal = steps > 0 ? 50 : 25;
            raisesGlobal = true;
            if (spVal > spBestScore) { spBestScore = spVal; spBest = 'Air Scrapping'; }
          }
          // Apply Reds tax to globe-raising SPs
          if (raisesGlobal && redsTax > 0 && spVal === spBestScore) {
            spBestScore -= 8;
          }
        }
        if (spBestScore > 0) {
          score = spBestScore;
          reason = 'SP: ' + spBest;
        } else {
          score = endgame ? 60 : 45;
          reason = '\u0421\u0442\u0430\u043d\u0434\u0430\u0440\u0442\u043d\u044b\u0439 \u043f\u0440\u043e\u0435\u043a\u0442';
        }
        emoji = '\ud83c\udfd7\ufe0f';
      }
      else if ((titleLow.indexOf('play') >= 0 && titleLow.indexOf('card') >= 0) || titleLow.indexOf('project card') >= 0) {
        // Use rankHandCards to find best playable card
        var tp = (state && state.thisPlayer) || {};
        var hand = tp.cardsInHand || [];
        if (hand.length > 0) {
          var ranked = rankHandCards(hand, state);
          var best = ranked.length > 0 ? ranked[0] : null;
          if (best && best.score >= 20) {
            score = endgame ? 60 : 75;
            var bName = best.name.length > 18 ? best.name.substring(0, 16) + '..' : best.name;
            reason = bName + ' (' + best.score + ')';
          } else if (best && best.score >= 0) {
            score = endgame ? 40 : 50;
            reason = '\u041b\u0443\u0447\u0448\u0430\u044f: ' + best.score + ' EV';
          } else if (best) {
            score = 25;
            reason = '\u041a\u0430\u0440\u0442\u044b \u043d\u0435 \u043e\u043a\u0443\u043f\u0430\u044e\u0442\u0441\u044f';
          } else {
            score = endgame ? 45 : 60;
            reason = '\u041a\u0430\u0440\u0442\u0430';
          }
        } else {
          score = 30;
          reason = '\u041d\u0435\u0442 \u043a\u0430\u0440\u0442';
        }
        emoji = '\ud83c\udccf';
      }
      else if (titleLow.indexOf('action') >= 0 || titleLow.indexOf('use') >= 0) {
        // Check how many action sub-options are available
        var actionSubs = opt.options || [];
        if (actionSubs.length > 0) {
          score = endgame ? 70 : 65;
          reason = actionSubs.length + ' \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439';
        } else {
          score = endgame ? 70 : 65;
          reason = '\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043a\u0430\u0440\u0442\u044b';
        }
        emoji = '\u26a1';
      }
      else if (titleLow.indexOf('trade') >= 0) {
        // Estimate trade value from colony data if available
        var tradeVal = 0;
        var bestColonyName = '';
        var colonies = (state && state.game && state.game.colonies) || [];
        var fleetsUsed = tp.tradesThisGeneration || 0;
        var fleetsTotal = tp.fleetSize || 1;
        var fleetsLeft = fleetsTotal - fleetsUsed;
        if (colonies.length > 0) {
          for (var ci = 0; ci < colonies.length; ci++) {
            var cv = scoreColonyTrade(colonies[ci], state);
            if (cv > tradeVal) {
              tradeVal = cv;
              bestColonyName = colonies[ci].name || '';
            }
          }
        }
        var fleetSuffix = fleetsTotal > 1 ? ' [' + fleetsLeft + '/' + fleetsTotal + ']' : '';
        if (tradeVal > 8) {
          score = endgame ? 70 : 80;
          reason = (bestColonyName || '\u0422\u043e\u0440\u0433\u043e\u0432\u043b\u044f') + ' ~' + Math.round(tradeVal) + ' MC' + fleetSuffix;
        } else if (tradeVal > 0) {
          score = endgame ? 45 : 60;
          reason = (bestColonyName || '\u0422\u043e\u0440\u0433\u043e\u0432\u043b\u044f') + ' ~' + Math.round(tradeVal) + ' MC' + fleetSuffix;
        } else {
          score = endgame ? 40 : 65;
          reason = endgame ? '\u0422\u043e\u0440\u0433\u043e\u0432\u043b\u044f (\u043f\u043e\u0437\u0434\u043d\u043e)' : '\u0422\u043e\u0440\u0433\u043e\u0432\u043b\u044f';
        }
        emoji = '\ud83d\udea2';
      }
      else if (titleLow.indexOf('pass') >= 0 || titleLow.indexOf('end turn') >= 0 || titleLow.indexOf('skip') >= 0 || titleLow.indexOf('do nothing') >= 0) {
        var passAnalysis = analyzePass(state);
        score = passAnalysis.shouldPass ? 70 : 20;
        emoji = '\u23f8\ufe0f';
        reason = passAnalysis.reason;
      }
      else if (titleLow.indexOf('delegate') >= 0) {
        var redsRuling = isRedsRuling(state);
        if (redsRuling && steps > 0) {
          score = endgame ? 70 : 65;
          reason = '\u0414\u0435\u043b\u0435\u0433\u0430\u0442 (Reds \u043f\u0440\u0430\u0432\u044f\u0442)';
        } else {
          score = endgame ? 60 : 50;
          reason = '\u0414\u0435\u043b\u0435\u0433\u0430\u0442';
        }
        emoji = '\ud83c\udfe6';
      }
      else if (titleLow.indexOf('milestone') >= 0 || titleLow.indexOf('claim') >= 0) {
        // Milestones = guaranteed 5 VP for 8 MC, almost always top priority
        // Check if we can afford it
        if (mc < 8) {
          score = 40;
          reason = '\u0412\u0435\u0445\u0430 (\u043d\u0435\u0442 8 MC)';
        } else {
          score = 90;
          // Try to show milestone name from sub-options
          var mSubs = opt.options || [];
          if (mSubs.length > 0) {
            reason = (mSubs[0].title || '\u0412\u0435\u0445\u0430') + '!';
          } else {
            reason = '\u0412\u0435\u0445\u0430! (5 VP / 8 MC)';
          }
        }
        emoji = '\ud83c\udfc6';
      }
      else if (titleLow.indexOf('award') >= 0 || titleLow.indexOf('fund') >= 0) {
        // Try to evaluate which award and if we'd win
        var awards = (state && state.game && state.game.awards) || [];
        var fundedNames = new Set(((state && state.game && state.game.fundedAwards) || []).map(function(fa) { return fa.name; }));
        var bestAward = null;
        for (var ai = 0; ai < awards.length; ai++) {
          if (fundedNames.has(awards[ai].name)) continue; // already funded
          var aEval = evaluateAward(awards[ai].name, state);
          if (aEval && (!bestAward || (aEval.winning && aEval.margin > bestAward.margin))) {
            bestAward = { name: awards[ai].name, eval: aEval };
          }
        }
        if (bestAward && bestAward.eval.winning) {
          score = bestAward.eval.margin >= 3 ? 80 : 70;
          reason = bestAward.name + ' (' + bestAward.eval.myScore + ' vs ' + bestAward.eval.bestOppScore + ')';
        } else if (bestAward && bestAward.eval.tied) {
          score = 55;
          reason = bestAward.name + ' (ничья ' + bestAward.eval.myScore + ')';
        } else {
          score = 35;
          reason = '\u041d\u0430\u0433\u0440\u0430\u0434\u0430 (\u043d\u0435 \u0432\u044b\u0438\u0433\u0440\u044b\u0432\u0430\u0435\u043c)';
        }
        emoji = '\ud83c\udfc5';
      }
      else if (titleLow.indexOf('colony') >= 0 || titleLow.indexOf('build') >= 0) {
        // Evaluate colony build: trade frequency matters (3+ gens left)
        var gensRemaining = estimateGensLeft(state);
        var colonyNames = (state && state.game && state.game.colonies || []).map(function(c) { return c.name; });
        var bestBuildColony = '';
        // Best colonies to build on: Europa (prod), Luna (MC), Ganymede (plants), Pluto/Leavitt (cards)
        var colBuildVal = 0;
        for (var cbi = 0; cbi < COLONY_BUILD_PRIORITY.length; cbi++) {
          if (colonyNames.indexOf(COLONY_BUILD_PRIORITY[cbi]) >= 0) {
            bestBuildColony = COLONY_BUILD_PRIORITY[cbi];
            colBuildVal = COLONY_BUILD_PRIORITY.length - cbi;
            break;
          }
        }
        if (gensRemaining <= 2) {
          score = 30;
          reason = '\u041a\u043e\u043b\u043e\u043d\u0438\u044f (\u043f\u043e\u0437\u0434\u043d\u043e)';
        } else if (colBuildVal > 6) {
          score = endgame ? 50 : 70;
          reason = bestBuildColony + ' (top)';
        } else {
          score = endgame ? 35 : 55;
          reason = bestBuildColony || '\u041a\u043e\u043b\u043e\u043d\u0438\u044f';
        }
        emoji = '\ud83c\udf0d';
      }
      else if (titleLow.indexOf('sell') >= 0) {
        // Selling cards: better when hand is large and cards are weak
        var handSize = (tp.cardsInHand && tp.cardsInHand.length) || tp.cardsInHandNbr || 0;
        if (endgame && handSize > 0) {
          score = 55;
          reason = '\u041f\u0440\u043e\u0434\u0430\u0436\u0430 ' + handSize + ' \u043a\u0430\u0440\u0442 (endgame)';
        } else if (handSize >= 5) {
          score = 35;
          reason = '\u041f\u0440\u043e\u0434\u0430\u0436\u0430 (' + handSize + ' \u043a\u0430\u0440\u0442)';
        } else {
          score = endgame ? 50 : 25;
          reason = '\u041f\u0440\u043e\u0434\u0430\u0436\u0430 \u043a\u0430\u0440\u0442';
        }
        emoji = '\ud83d\udcb0';
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
  // CORP/PRELUDE SCORING (for smartbot initial picks)
  // ══════════════════════════════════════════════════════════════

  /**
   * Score a corporation for initial selection.
   * Uses TM_RATINGS (85%) + scoreCard EV (15%) + synergy with available project cards.
   * @param {string} corpName - corporation name
   * @param {string[]} projectCardNames - names of available project cards in hand
   * @param {object} state - game state (gen 1)
   * @returns {number} score (higher = better)
   */
  function scoreCorp(corpName, projectCardNames, state) {
    var ratings = (typeof root !== 'undefined' && root.TM_RATINGS) || _ratings || {};
    var rating = ratings[corpName];
    var baseScore = rating ? rating.s : 50; // unknown corps default to 50

    var ev = scoreCard({ name: corpName, cost: 0 }, state || {});
    var blend = baseScore * 0.85 + ev * 0.15;

    // Synergy with available project cards
    var synergy = 0;
    if (projectCardNames && projectCardNames.length > 0) {
      var projectTags = [];
      for (var i = 0; i < projectCardNames.length; i++) {
        var t = _cardTags[projectCardNames[i]];
        if (t) for (var j = 0; j < t.length; j++) projectTags.push(t[j]);
      }
      var countTag = function(tag) {
        var n = 0;
        for (var k = 0; k < projectTags.length; k++) if (projectTags[k] === tag) n++;
        return n;
      };

      if (corpName === 'Saturn Systems') synergy += countTag('jovian') * 3;
      if (corpName === 'Arklight') synergy += (countTag('animal') + countTag('plant')) * 2;
      if (corpName === 'Teractor') synergy += countTag('earth') * 2;
      if (corpName === 'Point Luna') synergy += countTag('earth') * 2.5;
      if (corpName === 'Interplanetary Cinematics') synergy += countTag('event') * 2;
      if (corpName === 'Thorgate') synergy += countTag('power') * 2;
      if (corpName === 'Mining Guild') synergy += countTag('building') * 1;
      if (corpName === 'Stormcraft Incorporated') synergy += countTag('jovian') * 2;
      if (corpName === 'Ecoline') synergy += countTag('plant') * 2;
      if (corpName === 'Splice') synergy += countTag('microbe') * 2;
      if (corpName === 'Morning Star Inc.') synergy += countTag('venus') * 2;
      if (corpName === 'Celestic') synergy += countTag('venus') * 1.5;
      if (corpName === 'Pharmacy Union') synergy += countTag('science') * 3; // science = cure + TR
      // Synced from scoreCard corp synergies:
      if (corpName === 'PhoboLog') synergy += countTag('space') * 1.5;
      if (corpName === 'Tharsis Republic') synergy += countTag('building') * 1;
      if (corpName === 'CrediCor') synergy += countTag('building') * 1; // big cards tend to be building
      if (corpName === 'Aphrodite') synergy += (countTag('venus') + countTag('plant')) * 1.5;
      if (corpName === 'Helion') synergy += countTag('space') * 1; // heat + space
      if (corpName === 'Crescent Research Association') synergy += countTag('science') * 2.5;
      if (corpName === 'Kuiper Cooperative') synergy += countTag('space') * 1.5;
      if (corpName === 'Manutech') synergy += countTag('building') * 1.5;
      if (corpName === 'Poseidon') synergy += countTag('space') * 1; // colony cards tend to be space
      if (corpName === 'Vitor') synergy += countTag('jovian') * 1.5; // VP cards often jovian
      if (corpName === 'Lakefront Resorts') synergy += countTag('building') * 1; // ocean adjacency
      if (corpName === 'Polyphemos') synergy += countTag('science') * 1.5; // action cards draw
      // v9: new corp synergies
      // Robinson Industries: generic corp, no specific tag synergy
      if (corpName === 'Aridor') {
        // Count unique tag types — each unique type = +1 MC prod + colony
        var seenTags = {};
        for (var ari = 0; ari < projectTags.length; ari++) seenTags[projectTags[ari]] = true;
        synergy += Object.keys(seenTags).length * 2;
      }
      if (corpName === 'Spire') {
        // +1 science resource per 2+ tag card = 2 MC for SP. Count multi-tag cards
        for (var spi = 0; spi < projectCardNames.length; spi++) {
          var spTags = _cardTags[projectCardNames[spi]];
          if (spTags && spTags.length >= 2) synergy += 1.5;
        }
      }
      if (corpName === 'United Nations Mars Initiative') synergy += countTag('space') * 1; // space cards often raise params
      // Nirgal Enterprises: milestones/awards free, no tag synergy
      if (corpName === 'Valley Trust') synergy += countTag('science') * 1.5;
      if (corpName === 'Mars Direct') synergy += countTag('mars') * 1.5;
      if (corpName === 'Factorum') synergy += countTag('building') * 1.5; // draw building cards
    }

    return Math.round(blend + synergy);
  }

  /**
   * Score a prelude for initial selection.
   * Uses TM_RATINGS (85%) + scoreCard EV (15%).
   * @param {string} preludeName
   * @param {object} state - game state (gen 1)
   * @returns {number} score (higher = better)
   */
  function scorePrelude(preludeName, state) {
    var ratings = (typeof root !== 'undefined' && root.TM_RATINGS) || _ratings || {};
    var rating = ratings[preludeName];
    var baseScore = rating ? rating.s : 45;

    var ev = scoreCard({ name: preludeName, cost: 0 }, state || {});
    return Math.round(baseScore * 0.85 + ev * 0.15);
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

    // Core analytics
    remainingSteps: remainingSteps,
    estimateGensLeft: estimateGensLeft,
    vpLead: vpLead,
    shouldPushGlobe: shouldPushGlobe,
    isRedsRuling: isRedsRuling,
    scoreColonyTrade: scoreColonyTrade,
    evaluateAward: evaluateAward,
    evaluateMilestone: evaluateMilestone,
    scoreCard: scoreCard,
    smartPay: smartPay,

    // Corp/prelude scoring
    scoreCorp: scoreCorp,
    scorePrelude: scorePrelude,

    // Rating access for hate-draft
    getRating: function(name) { return _ratings[name] || null; },

    // Dashboard & advisor
    endgameTiming: endgameTiming,
    rankHandCards: rankHandCards,
    analyzePass: analyzePass,
    analyzeActions: analyzeActions,
  };

  // Auto-init in browser context
  if (typeof module === 'undefined') {
    // Prefer full generated data (card_tags.js + card_vp.js + card_data.js)
    if (typeof root.TM_CARD_DATA !== 'undefined') {
      setCardData(
        root.TM_CARD_TAGS || null,
        root.TM_CARD_VP || null,
        root.TM_CARD_DATA
      );
    }
    // Inject cardDiscount from TM_CARD_DISCOUNTS into _cardData
    if (typeof root.TM_CARD_DISCOUNTS !== 'undefined') {
      _injectCardDiscounts(root.TM_CARD_DISCOUNTS);
    }
    // Inject tag requirements
    if (typeof root.TM_CARD_TAG_REQS !== 'undefined') {
      _cardTagReqs = root.TM_CARD_TAG_REQS;
    }
    // Inject global requirements (temperature/oxygen/oceans/venus)
    if (typeof root.TM_CARD_GLOBAL_REQS !== 'undefined') {
      _cardGlobalReqs = root.TM_CARD_GLOBAL_REQS;
    }
    // Inject TM_RATINGS for corp/prelude scoring
    if (typeof root.TM_RATINGS !== 'undefined') {
      _ratings = root.TM_RATINGS;
    }
    // Fallback: derive VP from TM_CARD_EFFECTS if generated files missing
    else if (typeof root.TM_CARD_EFFECTS !== 'undefined') {
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
      setCardData(null, autoVP);
    }
  }

  // UMD export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TM_BRAIN;
  } else {
    root.TM_BRAIN = TM_BRAIN;
  }

})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
