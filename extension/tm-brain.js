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

    return qty * mcPerUnit;
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
    'Arctic Algae':            { perGen: 2 },   // +2 plants per ocean
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
    // Physics Complex: "1 VP per science resource" wrongly stored as static:2
    if (name === 'Physics Complex' && vpInfo && vpInfo.type === 'static') {
      vpInfo = { type: 'per_resource', per: 1, tag: null };
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
    }

    // ── MANUAL EV OVERRIDES (effects not captured by parser) ──
    var manual = MANUAL_EV[name];
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
  // HAND CARD RANKING (uses full scoreCard)
  // ══════════════════════════════════════════════════════════════

  function rankHandCards(cards, state) {
    if (!cards || cards.length === 0) return [];
    var tp = (state && state.thisPlayer) || {};
    var mc = tp.megaCredits || 0;
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
    var availableActions = cardsInHand + tableauActions + (canGreenery ? 1 : 0) + (canHeatTR ? 1 : 0) + (canTrade ? 1 : 0) + (canSPGreenery ? 1 : 0);

    if (gen <= 4 && availableActions > 0) {
      return { shouldPass: false, confidence: 'high', reason: 'Ранняя игра, есть что делать' };
    }

    if (availableActions === 0 && mc < 11) {
      return { shouldPass: true, confidence: 'high', reason: 'Нет доступных действий' };
    }

    if (steps <= 4 && !canGreenery && !canHeatTR && mc < 15 && tableauActions === 0 && !canTrade) {
      return { shouldPass: true, confidence: 'high', reason: 'Эндгейм, ресурсов мало' };
    }

    if (mc < 5 && !canGreenery && !canHeatTR && cardsInHand <= 1 && tableauActions === 0) {
      return { shouldPass: true, confidence: 'medium', reason: 'Мало MC, нет конверсий' };
    }

    var reasons = [];
    if (cardsInHand > 0) reasons.push(cardsInHand + ' карт');
    if (tableauActions > 0) reasons.push(tableauActions + ' действ.');
    if (canTrade) reasons.push('торговля');
    if (canGreenery) reasons.push('озеленение');
    if (canHeatTR) reasons.push('тепло→TR');
    return { shouldPass: false, confidence: 'low', reason: reasons.length > 0 ? reasons.join(', ') : 'Есть доступные действия' };
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
        // Estimate trade value from colony data if available
        var tradeVal = 0;
        var colonies = (state && state.game && state.game.colonies) || [];
        if (colonies.length > 0) {
          for (var ci = 0; ci < colonies.length; ci++) {
            var cv = scoreColonyTrade(colonies[ci], state);
            if (cv > tradeVal) tradeVal = cv;
          }
        }
        if (tradeVal > 8) {
          score = endgame ? 70 : 80;
          reason = '\u0422\u043e\u0440\u0433\u043e\u0432\u043b\u044f ~' + Math.round(tradeVal) + ' MC';
        } else if (tradeVal > 0) {
          score = endgame ? 45 : 60;
          reason = '\u0422\u043e\u0440\u0433\u043e\u0432\u043b\u044f ~' + Math.round(tradeVal) + ' MC';
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
