// TM_ADVISOR — аналитическое ядро для advisor panel.
// Извлечено из smartbot.js, адаптировано для read-only анализа.
// Формат state: vue-bridge (globalParams через pv.game, thisPlayer через pv.thisPlayer).

/* eslint-disable */
var TM_ADVISOR = (function() {
  'use strict';

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
    'Mars University', 'Olympus Conference',
  ]);

  var PROD_CARDS = new Set([
    'Immigrant City', 'Mining Guild', 'Fuel Synthesis', 'Noctis City',
    'Domed Crater', 'Phobos Space Haven', 'Space Elevator', 'Ironworks',
    'Steelworks', 'Ore Processor', 'Geothermal Power', 'Tropical Resort',
    'Electro Catapult', 'Mohole Area', 'Arctic Algae', 'Windmills',
    'Tundra Farming', 'Open City', 'Underground City', 'Rotator Impacts',
    'Caretaker Contract', 'Hired Raiders', 'Mining Area', 'Mining Rights',
    'Power Supply Consortium', 'Wave Power', 'Mangrove', 'Plantation',
  ]);

  var ANIMAL_VP_CARDS = new Set([
    'Birds', 'Fish', 'Predators', 'Small Animals', 'Livestock', 'Penguins',
    'Pets', 'Stratospheric Birds', 'Herbivores', 'Ecological Zone',
    'Sub-zero Salt Fish',
  ]);

  var MICROBE_VP_CARDS = new Set([
    'Tardigrades', 'Venusian Insects', 'Regolith Eaters',
    'GHG Producing Bacteria', 'Nitrite Reducing Bacteria',
    'Extremophiles', 'Decomposers', 'Ants', 'Symbiotic Fungus',
  ]);

  var FLOATER_VP_CARDS = new Set([
    'Dirigibles', 'Floating Habs', 'Atmo Collectors', 'Jovian Lanterns',
  ]);

  // ══════════════════════════════════════════════════════════════
  // COLONY TRADE DATA
  // ══════════════════════════════════════════════════════════════

  var COLONY_TRADE = {
    Luna:      { res: 'mc',         qty: [1,2,4,7,10,13,17] },
    Europa:    { res: 'production', qty: [1,1,1,1,1,1,1] },
    Ceres:     { res: 'steel',      qty: [1,2,3,4,6,8,10] },
    Triton:    { res: 'titanium',   qty: [0,0,0,1,1,3,5] },
    Ganymede:  { res: 'plants',     qty: [0,1,1,2,3,4,6] },
    Enceladus: { res: 'microbes',   qty: [0,1,1,2,3,4,5] },
    Io:        { res: 'heat',       qty: [2,3,4,6,8,10,13] },
    Callisto:  { res: 'energy',     qty: [0,2,3,5,7,10,13] },
    Miranda:   { res: 'animals',    qty: [0,0,1,1,2,2,3] },
    Pluto:     { res: 'cards',      qty: [0,1,1,2,2,3,4] },
    Titan:     { res: 'floaters',   qty: [0,0,1,1,2,3,4] },
  };

  // ══════════════════════════════════════════════════════════════
  // CORE ANALYTICS
  // ══════════════════════════════════════════════════════════════

  /** Remaining global parameter steps (temp + O2 + oceans) */
  function remainingSteps(state) {
    var g = (state && state.game) || {};
    var temp   = typeof g.temperature  === 'number' ? g.temperature  : -30;
    var o2     = typeof g.oxygenLevel  === 'number' ? g.oxygenLevel  : 0;
    var oceans = typeof g.oceans       === 'number' ? g.oceans       : 0;

    var tempSteps  = Math.max(0, Math.round((8 - temp) / 2));
    var oxySteps   = Math.max(0, 14 - o2);
    var oceanSteps = Math.max(0, 9 - oceans);

    return tempSteps + oxySteps + oceanSteps;
  }

  /** Should we push global parameters (spend resources on TR)? */
  function shouldPushGlobe(state) {
    var gen = (state && state.game && state.game.generation) || 5;
    if (gen >= 20) return true;

    var steps = remainingSteps(state);
    if (steps > 8) return true;

    var lead = vpLead(state);
    if (steps > 4) return lead >= -5;
    return lead >= 0;
  }

  /** Is Reds the ruling party? (+3 MC tax on TR raises) */
  function isRedsRuling(state) {
    return state && state.game && state.game.turmoil && state.game.turmoil.ruling === 'Reds';
  }

  /** Estimate VP lead vs best opponent */
  function vpLead(state) {
    if (!state || !state.thisPlayer || !state.players) return 0;
    var myTR = state.thisPlayer.terraformRating || 0;
    var bestOpp = 0;
    for (var i = 0; i < state.players.length; i++) {
      var p = state.players[i];
      if (p.color === state.thisPlayer.color) continue;
      var oppTR = p.terraformRating || 0;
      if (oppTR > bestOpp) bestOpp = oppTR;
    }
    return myTR - bestOpp;
  }

  /** Score a colony trade by MC equivalent */
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
      case 'cards':      mcPerUnit = 3; break;
      case 'plants':     mcPerUnit = 1.5; break;
      case 'energy':     mcPerUnit = 0.6; break;
      case 'heat':       mcPerUnit = 0.4; break;
      case 'production': mcPerUnit = 8; break;
      case 'animals':
        mcPerUnit = tableauNames && Array.from(ANIMAL_VP_CARDS).some(function(c) { return tableauNames.has(c); }) ? 5 : 1;
        break;
      case 'microbes':
        mcPerUnit = tableauNames && Array.from(MICROBE_VP_CARDS).some(function(c) { return tableauNames.has(c); }) ? 2.5 : 0.5;
        break;
      case 'floaters':
        mcPerUnit = tableauNames && Array.from(FLOATER_VP_CARDS).some(function(c) { return tableauNames.has(c); }) ? 3 : 0.5;
        break;
      default: mcPerUnit = 1;
    }

    return qty * mcPerUnit;
  }

  // ══════════════════════════════════════════════════════════════
  // ENDGAME TIMING DASHBOARD
  // ══════════════════════════════════════════════════════════════

  /**
   * Returns endgame timing analysis.
   * @param {Object} state - vue-bridge serialized state
   * @returns {{ steps: number, estimatedGens: number, dangerZone: string, shouldPush: boolean, vpLead: number, breakdown: Object }}
   */
  function endgameTiming(state) {
    var steps = remainingSteps(state);
    var gen = (state && state.game && state.game.generation) || 1;

    // Estimate terraform rate per generation (from all players)
    // In 3P WGT: ~4 raises/gen avg (WGT + player actions)
    var ratePerGen = 4;
    if (state && state.players) {
      // Rough estimate: higher TR players push faster
      var totalPlayers = state.players.length || 3;
      ratePerGen = Math.max(3, Math.min(6, totalPlayers + 1));
    }

    var estimatedGens = steps > 0 ? Math.ceil(steps / ratePerGen) : 0;

    var dangerZone;
    if (estimatedGens <= 1) dangerZone = 'red';
    else if (estimatedGens <= 2) dangerZone = 'yellow';
    else dangerZone = 'green';

    var g = (state && state.game) || {};
    var breakdown = {
      temp: typeof g.temperature === 'number' ? g.temperature : -30,
      tempSteps: Math.max(0, Math.round((8 - (g.temperature || -30)) / 2)),
      oxy: typeof g.oxygenLevel === 'number' ? g.oxygenLevel : 0,
      oxySteps: Math.max(0, 14 - (g.oxygenLevel || 0)),
      oceans: typeof g.oceans === 'number' ? g.oceans : 0,
      oceanSteps: Math.max(0, 9 - (g.oceans || 0)),
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
  // HAND CARD RANKING
  // ══════════════════════════════════════════════════════════════

  /**
   * Rank cards in hand by play priority.
   * @param {Array} cards - [{name, calculatedCost?, cost?, tags?}]
   * @param {Object} state
   * @returns {Array} sorted [{name, score, stars, reason}]
   */
  function rankHandCards(cards, state) {
    if (!cards || cards.length === 0) return [];
    var tp = (state && state.thisPlayer) || {};
    var gen = (state && state.game && state.game.generation) || 5;
    var mc = tp.megaCredits || 0;
    var steel = tp.steel || 0;
    var titanium = tp.titanium || 0;
    var steps = remainingSteps(state);
    var early = gen <= 4;
    var late = steps <= 8;

    var results = [];
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var name = card.name || '';
      var cost = card.calculatedCost != null ? card.calculatedCost : (card.cost || 0);
      var tags = card.tags || [];
      var score = 0;
      var reason = '';

      // VP accumulator
      if (VP_CARDS.has(name)) {
        score += late ? 10 : 6;
        reason = 'VP';
      }
      // Engine
      if (ENGINE_CARDS.has(name)) {
        score += early ? 12 : (late ? 2 : 7);
        reason = reason ? reason + '+Engine' : 'Engine';
      }
      // Production
      if (PROD_CARDS.has(name)) {
        score += early ? 8 : (late ? 2 : 5);
        reason = reason ? reason + '+Prod' : 'Prod';
      }

      // Tag bonuses
      for (var t = 0; t < tags.length; t++) {
        var tag = tags[t];
        if (tag === 'jovian') score += 4;
        else if (tag === 'city') score += 4;
        else if (tag === 'animal') score += 4;
        else if (tag === 'microbe') score += 3;
        else if (tag === 'science') score += 3;
        else if (tag === 'venus') score += 2;
        else if (tag === 'plant') score += 2;
        else if (tag === 'earth') score += 1;
      }

      // Cost efficiency
      if (cost <= 6) score += 4;
      else if (cost <= 12) score += 2;
      else if (cost <= 18) score += 1;
      else if (cost >= 30) score -= 3;

      // Affordability
      var buyingPower = mc;
      if (tags.indexOf('building') >= 0) buyingPower += steel * (tp.steelValue || 2);
      if (tags.indexOf('space') >= 0) buyingPower += titanium * (tp.titaniumValue || 3);
      if (buyingPower < cost) {
        score -= 10;
        reason += ' [нет MC]';
      }

      // Use overlay score if available
      if (typeof TM_RATINGS !== 'undefined' && TM_RATINGS[name]) {
        var baseScore = TM_RATINGS[name].s || 50;
        score = Math.round((score + baseScore) / 2);
      }

      var stars = score >= 70 ? 3 : (score >= 55 ? 2 : 1);

      results.push({ name: name, score: score, stars: stars, reason: reason || 'base', cost: cost });
    }

    results.sort(function(a, b) { return b.score - a.score; });
    return results;
  }

  // ══════════════════════════════════════════════════════════════
  // PASS ANALYSIS
  // ══════════════════════════════════════════════════════════════

  /**
   * Should the player pass this generation?
   * @param {Object} state
   * @returns {{ shouldPass: boolean, confidence: string, reason: string }}
   */
  function analyzePass(state) {
    var tp = (state && state.thisPlayer) || {};
    var mc = tp.megaCredits || 0;
    var heat = tp.heat || 0;
    var plants = tp.plants || 0;
    var steps = remainingSteps(state);
    var gen = (state && state.game && state.game.generation) || 5;
    var redsTax = isRedsRuling(state) ? 3 : 0;

    // Can we do something useful?
    var canGreenery = plants >= 8;
    var canHeatTR = heat >= 8 && steps > 0;
    var canAffordAction = mc >= 10;
    var cardsInHand = tp.cardsInHandNbr || (tp.cardsInHand ? tp.cardsInHand.length : 0);

    // Endgame: pass is often correct when out of resources
    if (steps <= 4 && !canGreenery && !canHeatTR && mc < 15) {
      return { shouldPass: true, confidence: 'high', reason: 'Эндгейм, ресурсов мало' };
    }

    // Early game: don't pass if you have cards and money
    if (gen <= 4 && (canAffordAction || cardsInHand > 0)) {
      return { shouldPass: false, confidence: 'high', reason: 'Ранняя игра, есть что делать' };
    }

    // Mid game: pass if broke and no useful conversions
    if (mc < 5 && !canGreenery && !canHeatTR && cardsInHand <= 1) {
      return { shouldPass: true, confidence: 'medium', reason: 'Мало MC, нет конверсий' };
    }

    // Default: don't pass
    return { shouldPass: false, confidence: 'low', reason: 'Есть доступные действия' };
  }

  // ══════════════════════════════════════════════════════════════
  // ACTION ANALYSIS
  // ══════════════════════════════════════════════════════════════

  /**
   * Analyze available actions and rank them.
   * @param {Object} waitingFor - raw waitingFor from API
   * @param {Object} state
   * @returns {Array} [{action: string, score: number, reason: string, emoji: string}]
   */
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

    // Parse options from waitingFor
    var options = [];
    if (waitingFor.type === 'or' && waitingFor.options) {
      options = waitingFor.options;
    }

    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      var title = (opt.title || opt.buttonLabel || '').toLowerCase();
      var score = 50;
      var reason = '';
      var emoji = '\ud83d\udcca';

      // Greenery
      if (title.includes('greenery') || title.includes('convert') && title.includes('plant')) {
        if (plants >= 8 && steps > 0) {
          score = endgame ? 95 : 80;
          emoji = '\ud83c\udf3f';
          reason = 'Озеленение = TR + VP';
        } else {
          score = 30;
          emoji = '\ud83c\udf3f';
          reason = 'Мало растений';
        }
      }
      // Heat → Temperature
      else if (title.includes('heat') || (title.includes('temperature') && title.includes('convert'))) {
        if (heat >= 8 && steps > 0) {
          score = endgame ? 90 : 75;
          emoji = '\ud83d\udd25';
          reason = 'Тепло → TR';
        } else {
          score = 25;
          emoji = '\ud83d\udd25';
          reason = 'Мало тепла';
        }
      }
      // Standard Projects
      else if (title.includes('standard project') || title.includes('sell') && title.includes('patent')) {
        score = endgame ? 60 : 45;
        emoji = '\ud83c\udfd7\ufe0f';
        reason = 'Стандартный проект';
      }
      // Play card
      else if (title.includes('play') && title.includes('card') || title.includes('project card')) {
        score = endgame ? 55 : 70;
        emoji = '\ud83c\udccf';
        reason = endgame ? 'Карта (поздно)' : 'Карта';
      }
      // Blue action
      else if (title.includes('action') || title.includes('use')) {
        score = endgame ? 70 : 65;
        emoji = '\u26a1';
        reason = 'Действие карты';
      }
      // Trade
      else if (title.includes('trade')) {
        score = endgame ? 40 : 65;
        emoji = '\ud83d\udea2';
        reason = endgame ? 'Торговля (поздно)' : 'Торговля';
      }
      // Pass
      else if (title.includes('pass') || title.includes('end turn') || title.includes('skip') || title.includes('do nothing')) {
        var passAnalysis = analyzePass(state);
        score = passAnalysis.shouldPass ? 70 : 20;
        emoji = '\u23f8\ufe0f';
        reason = passAnalysis.reason;
      }
      // Delegate
      else if (title.includes('delegate')) {
        score = endgame ? 65 : 55;
        emoji = '\ud83c\udfe6';
        reason = 'Делегат';
      }
      // Milestone
      else if (title.includes('milestone') || title.includes('claim')) {
        score = 85;
        emoji = '\ud83c\udfc6';
        reason = 'Веха!';
      }
      // Award
      else if (title.includes('award') || title.includes('fund')) {
        score = 60;
        emoji = '\ud83c\udfc5';
        reason = 'Награда';
      }
      // Colony
      else if (title.includes('colony') || title.includes('build')) {
        score = endgame ? 35 : 60;
        emoji = '\ud83c\udf0d';
        reason = 'Колония';
      }
      // Sell cards
      else if (title.includes('sell')) {
        score = endgame ? 50 : 30;
        emoji = '\ud83d\udcb0';
        reason = 'Продажа карт';
      }

      // Reds tax penalty
      if (redsTax > 0 && (title.includes('greenery') || title.includes('temperature') || title.includes('ocean'))) {
        score -= 10;
        reason += ' [Reds −3MC]';
      }

      results.push({
        action: opt.title || opt.buttonLabel || 'Option ' + (i + 1),
        score: score,
        reason: reason || 'Действие',
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

  return {
    remainingSteps: remainingSteps,
    shouldPushGlobe: shouldPushGlobe,
    isRedsRuling: isRedsRuling,
    vpLead: vpLead,
    scoreColonyTrade: scoreColonyTrade,
    endgameTiming: endgameTiming,
    rankHandCards: rankHandCards,
    analyzePass: analyzePass,
    analyzeActions: analyzeActions,
    VP_CARDS: VP_CARDS,
    ENGINE_CARDS: ENGINE_CARDS,
    PROD_CARDS: PROD_CARDS,
    ANIMAL_VP_CARDS: ANIMAL_VP_CARDS,
    MICROBE_VP_CARDS: MICROBE_VP_CARDS,
    FLOATER_VP_CARDS: FLOATER_VP_CARDS,
  };
})();
