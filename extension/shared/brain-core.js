// Shared low-risk helpers mirrored into runtime consumers.
/* eslint-disable */
;(function(root) {
  'use strict';

  var PAY_ZERO = {
    heat: 0, megacredits: 0, steel: 0, titanium: 0, plants: 0,
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

    pay.megacredits = Math.max(0, Math.min(remaining, tp.megaCredits || tp.megacredits || 0));
    return pay;
  }

  function vpMC(gensLeft) {
    if (gensLeft >= 6) return 2;
    if (gensLeft >= 3) return 5.5;
    return 10;
  }

  function trMC(gensLeft, redsTax) {
    return gensLeft + vpMC(gensLeft) - redsTax;
  }

  function calcPlayerVP(player, state, cardVP) {
    if (!player) return { tr: 0, greenery: 0, city: 0, cards: 0, milestones: 0, awards: 0, total: 0 };
    var vp = { tr: 0, greenery: 0, city: 0, cards: 0, milestones: 0, awards: 0, total: 0 };

    vp.tr = player.terraformRating || 0;

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

    if (player.tableau) {
      for (var ci = 0; ci < player.tableau.length; ci++) {
        var card = player.tableau[ci];
        var name = card.name || card;
        var vpDef = cardVP && cardVP[name];
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

    var claimed = (state && state.game && state.game.claimedMilestones) || [];
    for (var mi = 0; mi < claimed.length; mi++) {
      if (claimed[mi].playerColor === player.color || claimed[mi].player === player.color) vp.milestones += 5;
    }

    vp.total = vp.tr + vp.greenery + vp.city + vp.cards + vp.milestones + vp.awards;
    return vp;
  }

  function vpLead(state) {
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

  function isRedsRuling(state) {
    return state && state.game && state.game.turmoil && state.game.turmoil.ruling === 'Reds';
  }

  function hasVPCard(tableauNames, vpSet) {
    var arr = [];
    vpSet.forEach(function(c) { arr.push(c); });
    for (var i = 0; i < arr.length; i++) {
      if (tableauNames.has(arr[i])) return true;
    }
    return false;
  }

  function remainingStepsWithOptions(state, options) {
    var g = (state && state.game) || {};
    var opts = options || {};
    var temp = typeof g.temperature === 'number' ? g.temperature : -30;
    var o2 = typeof g.oxygenLevel === 'number' ? g.oxygenLevel : 0;
    var oceans = typeof g.oceans === 'number' ? g.oceans : 0;
    var venus = typeof g.venusScaleLevel === 'number' ? g.venusScaleLevel : 30;
    var venusWeight = typeof opts.venusWeight === 'number' ? opts.venusWeight : 0.5;
    var tempSteps = Math.max(0, Math.round((8 - temp) / 2));
    var oxySteps = Math.max(0, 14 - o2);
    var oceanSteps = Math.max(0, 9 - oceans);
    var coreSteps = tempSteps + oxySteps + oceanSteps;
    if (opts.zeroWhenCoreDone && coreSteps === 0) return 0;
    var venusSteps = Math.max(0, Math.round((30 - venus) / 2));
    return coreSteps + Math.round(venusSteps * venusWeight);
  }

  function scoreColonyTrade(colony, state, options) {
    var opts = options || {};
    var colonyTrade = opts.colonyTrade || {};
    var hasVPCardFn = opts.hasVPCard || hasVPCard;
    var resourceValues = opts.resourceValues || {};
    var animalVpCards = opts.animalVpCards;
    var microbeVpCards = opts.microbeVpCards;
    var floaterVpCards = opts.floaterVpCards;

    var name = colony.name || colony;
    var pos = colony.trackPosition != null ? colony.trackPosition : 3;
    var tp = (state && state.thisPlayer) || {};
    var tableau = tp.tableau || [];
    var tableauNames = new Set(tableau.map(function(c) { return c.name || c; }));

    var data = colonyTrade[name];
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
        mcPerUnit = hasVPCardFn(tableauNames, animalVpCards) ? 5 : 1; break;
      case 'microbes':
        mcPerUnit = hasVPCardFn(tableauNames, microbeVpCards) ? 2.5 : 0.5; break;
      case 'floaters':
        mcPerUnit = hasVPCardFn(tableauNames, floaterVpCards) ? 3 : 0.5; break;
      default:
        mcPerUnit = Object.prototype.hasOwnProperty.call(resourceValues, data.res) ? resourceValues[data.res] : 1;
        break;
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

      var colonyBonusMC = {
        Luna: 2, Callisto: 5.1, Ceres: 3.6, Io: 1.6,
        Ganymede: 1.5, Europa: 1, Triton: 2.5, Pluto: 3,
        Miranda: 4, Titan: 2.5, Enceladus: 2
      };
      if (name === 'Miranda' && hasVPCardFn(tableauNames, animalVpCards)) colonyBonusMC.Miranda = 5;
      if (name === 'Titan' && hasVPCardFn(tableauNames, floaterVpCards)) colonyBonusMC.Titan = 3;
      if (name === 'Enceladus' && hasVPCardFn(tableauNames, microbeVpCards)) colonyBonusMC.Enceladus = 2.5;

      if (myColonies > 0) {
        tradeValue += myColonies * (colonyBonusMC[name] || 1);
      }

      if (opts.includeOpponentPenalty && oppColonies > 0) {
        var penaltyFactor = typeof opts.opponentPenaltyFactor === 'number' ? opts.opponentPenaltyFactor : 0.5;
        var oppBonusPerCol = colonyBonusMC[name] || 1;
        tradeValue -= oppColonies * oppBonusPerCol * penaltyFactor;
      }
    }

    return tradeValue;
  }

  function shouldPushGlobe(state, options) {
    var opts = options || {};
    var remainingStepsFn = opts.remainingSteps;
    var vpLeadFn = opts.vpLead;
    var gen = (state && state.game && state.game.generation) || 5;
    if (gen >= 20) return true;

    var steps = remainingStepsFn ? remainingStepsFn(state) : 0;
    if (steps > 8) return true;

    var lead = vpLeadFn ? vpLeadFn(state) : 0;
    if (steps > 4) return lead >= -5;
    return lead >= 0;
  }

  function estimateTriggersPerGen(triggerTag, tp, handCards, getCardTags) {
    var myTags = tp.tags || {};
    var handTagCount = 0;
    var lookupCardTags = getCardTags || function() { return []; };
    if (handCards) {
      for (var hi = 0; hi < handCards.length; hi++) {
        var hcName = handCards[hi].name || handCards[hi];
        var hcTags = lookupCardTags(hcName) || [];
        for (var hti = 0; hti < hcTags.length; hti++) {
          var ht = hcTags[hti];
          if (triggerTag === 'science' && ht === 'science') handTagCount++;
          else if (triggerTag === 'event' && ht === 'event') handTagCount++;
          else if (triggerTag === 'venus' && ht === 'venus') handTagCount++;
          else if (triggerTag === 'bio' && (ht === 'plant' || ht === 'animal' || ht === 'microbe')) handTagCount++;
          else if (
            triggerTag === 'space_event' &&
            hcTags.indexOf('space') >= 0 &&
            hcTags.indexOf('event') >= 0
          ) {
            handTagCount++;
            break;
          }
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

  function pAtLeastOne(target, total, draw) {
    if (target <= 0 || total <= 0 || draw <= 0) return 0;
    var pNone = 1;
    for (var di = 0; di < Math.min(draw, total); di++) {
      pNone *= Math.max(0, (total - target - di)) / (total - di);
    }
    return 1 - Math.max(0, pNone);
  }

  function buildGlobalProgressBreakdown(state) {
    var g = (state && state.game) || {};
    var temp = typeof g.temperature === 'number' ? g.temperature : -30;
    var oxy = typeof g.oxygenLevel === 'number' ? g.oxygenLevel : 0;
    var oceans = typeof g.oceans === 'number' ? g.oceans : 0;
    var venus = typeof g.venusScaleLevel === 'number' ? g.venusScaleLevel : 30;
    return {
      temp: temp,
      tempSteps: Math.max(0, Math.round((8 - temp) / 2)),
      oxy: oxy,
      oxySteps: Math.max(0, 14 - oxy),
      oceans: oceans,
      oceanSteps: Math.max(0, 9 - oceans),
      venus: venus,
      venusSteps: Math.max(0, Math.round((30 - venus) / 2)),
    };
  }

  function estimateAverageGameLengthFromState(state, options) {
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

  function estimateGensLeftFromState(state, options) {
    var opts = options || {};
    var breakdown = buildGlobalProgressBreakdown(state);
    var g = (state && state.game) || {};
    var gen = typeof opts.gen === 'number' ? opts.gen : (g.generation || 1);
    var playerCount = typeof opts.playerCount === 'number'
      ? opts.playerCount
      : ((state && state.players) ? (state.players.length || 3) : 3);
    var coreSteps = breakdown.tempSteps + breakdown.oxySteps + breakdown.oceanSteps;

    if (coreSteps <= 0) return 1;

    var avgGameLen = typeof opts.avgGameLen === 'number'
      ? opts.avgGameLen
      : estimateAverageGameLengthFromState(state, { playerCount: playerCount });
    var totalCoreSteps = 42;
    var avgRatePerGen = totalCoreSteps / avgGameLen;
    var genBased = Math.max(1, Math.ceil(avgGameLen - gen + 1));
    var stepsBased = Math.max(1, Math.ceil(coreSteps / avgRatePerGen));
    var gensLeft = Math.min(genBased, stepsBased);
    var completedGens = Math.max(0, gen - 1);
    var completedCoreSteps = Math.max(0, totalCoreSteps - coreSteps);
    if (completedGens >= 3 && completedCoreSteps >= 12) {
      var observedRatePerGen = completedCoreSteps / completedGens;
      if (observedRatePerGen > avgRatePerGen * 1.05) {
        var observedStepsBased = Math.max(1, Math.ceil(coreSteps / observedRatePerGen));
        gensLeft = Math.min(gensLeft, observedStepsBased);
      }
    }

    if (gen >= 8 && playerCount >= 3 && coreSteps <= 18) {
      gensLeft = Math.min(gensLeft, 2);
    }

    return Math.max(1, gensLeft);
  }

  function buildEndgameTiming(state, options) {
    var opts = options || {};
    var remainingStepsFn = opts.remainingSteps;
    var estimateGensFn = opts.estimateGens;
    var shouldPushFn = opts.shouldPush;
    var vpLeadFn = opts.vpLead;
    var steps = remainingStepsFn ? remainingStepsFn(state) : 0;
    var gen = (state && state.game && state.game.generation) || 1;
    var estimatedGens = estimateGensFn ? estimateGensFn(state, steps, gen) : 0;

    var dangerZone;
    if (estimatedGens <= 1) dangerZone = 'red';
    else if (estimatedGens <= 2) dangerZone = 'yellow';
    else dangerZone = 'green';

    return {
      steps: steps,
      estimatedGens: estimatedGens,
      dangerZone: dangerZone,
      shouldPush: shouldPushFn ? shouldPushFn(state) : false,
      vpLead: vpLeadFn ? vpLeadFn(state) : 0,
      breakdown: buildGlobalProgressBreakdown(state),
      generation: gen,
    };
  }

  function estimateScoreCardTimingInterpolated(options) {
    var opts = options || {};
    var state = opts.state;
    var steps = typeof opts.steps === 'number' ? opts.steps : 0;
    var gen = typeof opts.gen === 'number' ? opts.gen : 5;
    var totalSteps = typeof opts.totalSteps === 'number' ? opts.totalSteps : 42;
    var playerCount = typeof opts.playerCount === 'number' ? opts.playerCount : 3;
    var avgGameLen = typeof opts.avgGameLen === 'number'
      ? opts.avgGameLen
      : (playerCount >= 4 ? 8 : (playerCount >= 3 ? 9 : 10.5));
    var genBased = Math.max(1, avgGameLen - gen + 1);
    var stepsBased = Math.max(1, Math.round(steps / (totalSteps / avgGameLen)));
    var completionPct = steps > 0 ? Math.max(0, 1 - steps / totalSteps) : 1;
    var boardBased = state ? estimateGensLeftFromState(state, { gen: gen, playerCount: playerCount }) : 0;
    var gensLeft = boardBased || Math.max(1, Math.round(genBased * completionPct + stepsBased * (1 - completionPct)));
    var ratePerGen = steps > 0 ? steps / Math.max(1, gensLeft) : totalSteps / avgGameLen;
    return {
      totalSteps: totalSteps,
      avgGameLen: avgGameLen,
      genBased: genBased,
      stepsBased: stepsBased,
      completionPct: completionPct,
      boardBased: boardBased,
      gensLeft: gensLeft,
      ratePerGen: ratePerGen,
    };
  }

  function estimateScoreCardTimingAccelerating(options) {
    var opts = options || {};
    var steps = typeof opts.steps === 'number' ? opts.steps : 0;
    var totalSteps = typeof opts.totalSteps === 'number' ? opts.totalSteps : 42;
    var playerCount = typeof opts.playerCount === 'number' ? opts.playerCount : 3;
    var completionPct = steps > 0 ? Math.max(0, 1 - steps / totalSteps) : 1;
    var baseRate = typeof opts.baseRate === 'number'
      ? opts.baseRate
      : Math.max(3, Math.min(5, playerCount + 1));
    var rateScale = typeof opts.rateScale === 'number' ? opts.rateScale : 1.5;
    var minRate = typeof opts.minRate === 'number' ? opts.minRate : 3;
    var maxRate = typeof opts.maxRate === 'number' ? opts.maxRate : 12;
    var ratePerGen = baseRate * (1 + completionPct * rateScale);
    ratePerGen = Math.max(minRate, Math.min(maxRate, ratePerGen));
    return {
      totalSteps: totalSteps,
      completionPct: completionPct,
      baseRate: baseRate,
      ratePerGen: ratePerGen,
      gensLeft: Math.max(1, Math.ceil(steps / ratePerGen)),
    };
  }

  function buildScoreCardContext(options) {
    var opts = options || {};
    var state = opts.state || {};
    var card = opts.card || {};
    var name = opts.name != null ? opts.name : (card.name || '');
    var cost = opts.cost != null ? opts.cost : (card.calculatedCost != null ? card.calculatedCost : (card.cost || 0));
    var gen = opts.gen != null ? opts.gen : ((state && state.game && state.game.generation) || 5);
    var playerCount = opts.playerCount != null
      ? opts.playerCount
      : ((state && state.players) ? (state.players.length || 3) : 3);
    var remainingStepsFn = opts.remainingSteps || function() { return 0; };
    var steps = opts.steps != null ? opts.steps : remainingStepsFn(state);
    var estimateTiming = opts.estimateTiming || function(meta) {
      return {
        totalSteps: meta.totalSteps,
        gensLeft: 1,
        ratePerGen: meta.steps,
        completionPct: meta.steps > 0 ? 0 : 1,
      };
    };
    var timing = estimateTiming({
      state: state,
      card: card,
      name: name,
      cost: cost,
      gen: gen,
      steps: steps,
      playerCount: playerCount,
      totalSteps: opts.totalSteps,
    }) || {};
    var tp = opts.player || ((state && state.thisPlayer) || {});
    var myTags = opts.myTags || tp.tags || {};
    var handCards = opts.handCards || tp.cardsInHand || [];
    var tableau = opts.tableau || tp.tableau || [];
    var tableauNames = opts.tableauNames || new Set(tableau.map(function(c) { return c.name || c; }));
    var redsTax;
    if (opts.redsTax != null) redsTax = opts.redsTax;
    else {
      var isRedsRulingFn = opts.isRedsRuling || isRedsRuling;
      redsTax = isRedsRulingFn(state) ? 3 : 0;
    }
    return {
      cost: cost,
      name: name,
      gen: gen,
      steps: steps,
      playerCount: playerCount,
      totalSteps: timing.totalSteps,
      completionPct: timing.completionPct,
      gensLeft: Math.max(1, timing.gensLeft || 1),
      ratePerGen: typeof timing.ratePerGen === 'number' ? timing.ratePerGen : 0,
      tp: tp,
      myTags: myTags,
      handCards: handCards,
      tableau: tableau,
      tableauNames: tableauNames,
      redsTax: redsTax,
    };
  }

  function buildProductionValuationContext(options) {
    var opts = options || {};
    var state = opts.state || {};
    var gensLeft = typeof opts.gensLeft === 'number' ? opts.gensLeft : 1;
    var isPatched = !!opts.isPatched;
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
      prodLatePenalty: gensLeft <= 1 ? 0.05 : (gensLeft <= 2 ? 0.25 : (gensLeft <= 3 ? 0.55 : 1.0)),
    };
  }

  function normalizeOpeningHandBias(rawBias) {
    if (typeof rawBias !== 'number' || !isFinite(rawBias) || rawBias === 0) return 0;
    var scaled = Math.round(rawBias * 0.6);
    if (scaled === 0) scaled = rawBias > 0 ? 1 : -1;
    return Math.max(-5, Math.min(5, scaled));
  }

  function isOpeningHandContext(state) {
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
  }

  function getOpeningHandBias(overlayRating, state) {
    if (!overlayRating || typeof overlayRating.o !== 'number') return 0;
    return isOpeningHandContext(state) ? normalizeOpeningHandBias(overlayRating.o) : 0;
  }

  function getGlobalRequirementCurrent(param, game) {
    var g = game || {};
    if (param === 'oceans') return typeof g.oceans === 'number' ? g.oceans : 0;
    if (param === 'oxygen') return typeof g.oxygenLevel === 'number' ? g.oxygenLevel : 0;
    if (param === 'temperature') return typeof g.temperature === 'number' ? g.temperature : -30;
    if (param === 'venus') return typeof g.venusScaleLevel === 'number' ? g.venusScaleLevel : 0;
    return 0;
  }

  function globalRequirementStepGap(param, fromValue, toValue) {
    var diff = Math.max(0, Number(toValue) - Number(fromValue));
    if (!isFinite(diff) || diff <= 0) return 0;
    if (param === 'temperature' || param === 'venus') return Math.ceil(diff / 2);
    return Math.ceil(diff);
  }

  function estimateGlobalRequirementDelay(param, stepGap, state) {
    if (!stepGap) return 0;
    var avgLen = estimateAverageGameLengthFromState(state);
    var avgRate = param === 'venus' ? (15 / avgLen) : (42 / avgLen);
    return Math.max(1, Math.ceil(stepGap / Math.max(1, avgRate)));
  }

  function scoreGlobalRequirementGap(param, stepGap, state) {
    if (!stepGap) return 0;
    var delayGens = estimateGlobalRequirementDelay(param, stepGap, state);
    var raw = stepGap * 1.5 + delayGens * 2;
    var cap = param === 'venus' ? 30 : 36;
    return Math.min(cap, raw);
  }

  function countHandTagsForRequirement(handCards, selfName, getCardTags) {
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

  function scoreRequirementPenalty(options) {
    var opts = options || {};
    var state = opts.state || {};
    var game = state.game || {};
    var name = opts.name || '';
    var globalReqs = opts.globalReqs || null;
    var tagReqs = opts.tagReqs || null;
    var myTags = opts.myTags || {};
    var handCards = opts.handCards || [];
    var getCardTags = opts.getCardTags || function() { return []; };
    var penalty = 0;
    var globalPenalty = 0;
    var tagPenalty = 0;
    var details = [];

    if (globalReqs) {
      for (var grk in globalReqs) {
        var grObj = globalReqs[grk];
        var grMin = typeof grObj === 'object' ? grObj.min : grObj;
        var grMax = typeof grObj === 'object' ? grObj.max : undefined;
        var current = getGlobalRequirementCurrent(grk, game);
        if (grMin !== undefined && current < grMin) {
          var minGap = globalRequirementStepGap(grk, current, grMin);
          var minPenalty = scoreGlobalRequirementGap(grk, minGap, state);
          globalPenalty += minPenalty;
          details.push({ type: 'global-min', key: grk, steps: minGap, penalty: minPenalty });
        }
        if (grMax !== undefined && current > grMax) {
          var maxGap = globalRequirementStepGap(grk, grMax, current);
          var maxPenalty = 50 + Math.min(20, maxGap * 3);
          globalPenalty += maxPenalty;
          details.push({ type: 'global-max', key: grk, steps: maxGap, penalty: maxPenalty });
        }
      }
    }

    if (tagReqs) {
      var handTagCounts = countHandTagsForRequirement(handCards, name, getCardTags);
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

    penalty = globalPenalty + tagPenalty;
    return {
      penalty: penalty,
      globalPenalty: globalPenalty,
      tagPenalty: tagPenalty,
      details: details,
    };
  }

  function analyzePass(state, options) {
    var opts = options || {};
    var remainingStepsFn = opts.remainingSteps;
    var steps = remainingStepsFn ? remainingStepsFn(state) : 0;
    var tp = (state && state.thisPlayer) || {};
    var mc = tp.megaCredits || tp.megacredits || 0;
    var heat = tp.heat || 0;
    var plants = tp.plants || 0;
    var gen = (state && state.game && state.game.generation) || 5;

    var canGreenery = plants >= 8;
    var canHeatTR = heat >= 8 && steps > 0;
    var canAffordAction = mc >= 10;
    var cardsInHand = tp.cardsInHandNbr || (tp.cardsInHand ? tp.cardsInHand.length : 0);

    if (steps <= 4 && !canGreenery && !canHeatTR && mc < 15) {
      return { shouldPass: true, confidence: 'high', reason: 'Эндгейм, ресурсов мало' };
    }

    if (gen <= 4 && (canAffordAction || cardsInHand > 0)) {
      return { shouldPass: false, confidence: 'high', reason: 'Ранняя игра, есть что делать' };
    }

    if (mc < 5 && !canGreenery && !canHeatTR && cardsInHand <= 1) {
      return { shouldPass: true, confidence: 'medium', reason: 'Мало MC, нет конверсий' };
    }

    return { shouldPass: false, confidence: 'low', reason: 'Есть доступные действия' };
  }

  function rankHandCards(cards, state, options) {
    if (!cards || cards.length === 0) return [];
    var opts = options || {};
    var getCardTags = opts.getCardTags || function(_name, fallbackTags) { return fallbackTags || []; };
    var scoreCardFn = opts.scoreCard || function() { return 0; };
    var getOverlayRating = opts.getOverlayRating || function() { return null; };
    var isVPCard = opts.isVPCard || function() { return false; };
    var isEngineCard = opts.isEngineCard || function() { return false; };
    var isProdCard = opts.isProdCard || function() { return false; };
    var isCityCard = opts.isCityCard || function() { return false; };

    var tp = (state && state.thisPlayer) || {};
    var mc = tp.megaCredits || tp.megacredits || 0;
    var steel = tp.steel || 0;
    var titanium = tp.titanium || 0;

    var results = [];
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var name = card.name || '';
      var cost = card.calculatedCost != null ? card.calculatedCost : (card.cost || 0);
      var tags = getCardTags(name, card.tags || []);
      var score = scoreCardFn(card, state);

      var buyingPower = mc;
      if (tags.indexOf('building') >= 0) buyingPower += steel * (tp.steelValue || 2);
      if (tags.indexOf('space') >= 0) buyingPower += titanium * (tp.titaniumValue || 3);
      if (buyingPower < cost) score -= 10;

      var overlayRating = getOverlayRating(name, state);
      if (overlayRating) {
        var baseScore = (overlayRating.s || 50) + getOpeningHandBias(overlayRating, state);
        score = Math.round((score + baseScore) / 2);
      }

      var reason = '';
      if (isVPCard(name)) reason = 'VP';
      if (isEngineCard(name)) reason = reason ? reason + '+Engine' : 'Engine';
      if (isProdCard(name)) reason = reason ? reason + '+Prod' : 'Prod';
      if (isCityCard(name)) reason = reason ? reason + '+City' : 'City';
      if (buyingPower < cost) reason += ' [нет MC]';
      if (!reason) reason = 'base';

      var stars = score >= 30 ? 3 : (score >= 15 ? 2 : 1);
      results.push({ name: name, score: score, stars: stars, reason: reason, cost: cost });
    }

    results.sort(function(a, b) { return b.score - a.score; });
    return results;
  }

  function analyzeActions(waitingFor, state, options) {
    if (!waitingFor) return [];
    var opts = options || {};
    var remainingStepsFn = opts.remainingSteps;
    var isRedsRulingFn = opts.isRedsRuling;
    var analyzePassFn = opts.analyzePass;
    var tp = (state && state.thisPlayer) || {};
    var heat = tp.heat || 0;
    var plants = tp.plants || 0;
    var steps = remainingStepsFn ? remainingStepsFn(state) : 0;
    var endgame = steps <= 8;
    var redsTax = isRedsRulingFn && isRedsRulingFn(state) ? 3 : 0;
    var results = [];

    var optionsList = [];
    if (waitingFor.type === 'or' && waitingFor.options) {
      optionsList = waitingFor.options;
    }

    for (var i = 0; i < optionsList.length; i++) {
      var opt = optionsList[i];
      var title = (opt.title || opt.buttonLabel || '');
      var titleLow = title.toLowerCase();
      var score = 50;
      var reason = '';
      var emoji = '📊';

      if (titleLow.indexOf('greenery') >= 0 || (titleLow.indexOf('convert') >= 0 && titleLow.indexOf('plant') >= 0)) {
        if (plants >= 8 && steps > 0) {
          score = endgame ? 95 : 80;
          emoji = '🌿';
          reason = 'Озеленение = TR + VP';
        } else {
          score = 30;
          emoji = '🌿';
          reason = 'Мало растений';
        }
      }
      else if (titleLow.indexOf('heat') >= 0 || (titleLow.indexOf('temperature') >= 0 && titleLow.indexOf('convert') >= 0)) {
        if (heat >= 8 && steps > 0) {
          score = endgame ? 90 : 75;
          emoji = '🔥';
          reason = 'Тепло → TR';
        } else {
          score = 25;
          emoji = '🔥';
          reason = 'Мало тепла';
        }
      }
      else if (titleLow.indexOf('standard project') >= 0 || (titleLow.indexOf('sell') >= 0 && titleLow.indexOf('patent') >= 0)) {
        score = endgame ? 60 : 45;
        emoji = '🏗️';
        reason = 'Стандартный проект';
      }
      else if ((titleLow.indexOf('play') >= 0 && titleLow.indexOf('card') >= 0) || titleLow.indexOf('project card') >= 0) {
        score = endgame ? 55 : 70;
        emoji = '🃏';
        reason = endgame ? 'Карта (поздно)' : 'Карта';
      }
      else if (titleLow.indexOf('action') >= 0 || titleLow.indexOf('use') >= 0) {
        score = endgame ? 70 : 65;
        emoji = '⚡';
        reason = 'Действие карты';
      }
      else if (titleLow.indexOf('trade') >= 0) {
        score = endgame ? 40 : 65;
        emoji = '🚢';
        reason = endgame ? 'Торговля (поздно)' : 'Торговля';
      }
      else if (titleLow.indexOf('pass') >= 0 || titleLow.indexOf('end turn') >= 0 || titleLow.indexOf('skip') >= 0 || titleLow.indexOf('do nothing') >= 0) {
        var passAnalysis = analyzePassFn ? analyzePassFn(state) : { shouldPass: false, reason: 'Есть доступные действия' };
        score = passAnalysis.shouldPass ? 70 : 20;
        emoji = '⏸️';
        reason = passAnalysis.reason;
      }
      else if (titleLow.indexOf('delegate') >= 0) {
        score = endgame ? 65 : 55;
        emoji = '🏦';
        reason = 'Делегат';
      }
      else if (titleLow.indexOf('milestone') >= 0 || titleLow.indexOf('claim') >= 0) {
        score = 85;
        emoji = '🏆';
        reason = 'Веха!';
      }
      else if (titleLow.indexOf('award') >= 0 || titleLow.indexOf('fund') >= 0) {
        score = 60;
        emoji = '🏅';
        reason = 'Награда';
      }
      else if (titleLow.indexOf('colony') >= 0 || titleLow.indexOf('build') >= 0) {
        score = endgame ? 35 : 60;
        emoji = '🌍';
        reason = 'Колония';
      }
      else if (titleLow.indexOf('sell') >= 0) {
        score = endgame ? 50 : 30;
        emoji = '💰';
        reason = 'Продажа карт';
      }

      if (redsTax > 0 && (titleLow.indexOf('greenery') >= 0 || titleLow.indexOf('temperature') >= 0 || titleLow.indexOf('ocean') >= 0)) {
        score -= 10;
        reason += ' [Reds -3MC]';
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

  function analyzeDeck(state, ratings, cardData, draftSeen, options) {
    if (!state || !state.game || !ratings || !cardData) return null;
    var opts = options || {};
    var optToExp = opts.optToExp || {};
    var expCards = opts.expCards || {};
    var nonProject = opts.nonProject || {};
    var cardExp = opts.cardExp || {};

    var g = state.game;
    var deckSize = g.deckSize || 0;
    var discardSize = g.discardPileSize || 0;
    if (deckSize === 0 && discardSize === 0) return null;

    var gameOptions = g.gameOptions || {};
    var enabledExp = { base: true, corpera: true };
    for (var optKey in optToExp) {
      if (gameOptions[optKey]) enabledExp[optToExp[optKey]] = true;
    }
    if (gameOptions.expansions) {
      for (var expK in gameOptions.expansions) {
        if (gameOptions.expansions[expK] && expCards[expK]) enabledExp[expK] = true;
      }
    }

    var poolNames = [];
    var poolSet = {};
    for (var name in cardData) {
      if (nonProject[name]) continue;
      var exp = cardExp[name];
      if (exp && !enabledExp[exp]) continue;
      poolNames.push(name);
      poolSet[name] = true;
    }

    var known = {};
    var myHand = (state.thisPlayer && state.thisPlayer.cardsInHand) || [];
    for (var hi = 0; hi < myHand.length; hi++) {
      var hName = myHand[hi].name || myHand[hi];
      if (hName && poolSet[hName]) known[hName] = 'hand';
    }

    var drafted = state.draftedCards || (state.thisPlayer && state.thisPlayer.draftedCards) || [];
    for (var dri = 0; dri < drafted.length; dri++) {
      var drName = drafted[dri].name || drafted[dri];
      if (drName && poolSet[drName]) known[drName] = 'draft';
    }

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

    if (draftSeen && draftSeen.length > 0) {
      for (var dsi = 0; dsi < draftSeen.length; dsi++) {
        var dsName = draftSeen[dsi];
        if (dsName && poolSet[dsName] && !known[dsName]) {
          known[dsName] = 'draft_seen';
        }
      }
    }

    var unknown = [];
    for (var ui = 0; ui < poolNames.length; ui++) {
      if (!known[poolNames[ui]]) unknown.push(poolNames[ui]);
    }

    var oppHands = 0;
    for (var oi = 0; oi < allPlayers.length; oi++) {
      var opl = allPlayers[oi];
      if (state.thisPlayer && opl.color === state.thisPlayer.color) continue;
      oppHands += opl.cardsInHandNbr || 0;
    }

    var totalHidden = deckSize + discardSize + oppHands;
    var pInDeck = totalHidden > 0 ? deckSize / totalHidden : 0;
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

    for (var tierName in tierCards) {
      tierCards[tierName].sort(function(a, b) { return b.score - a.score; });
    }

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

    var saCount = tierCounts.S + tierCounts.A;
    var saInDeck = Math.round(saCount * pInDeck);
    var bPlusCount = saCount + tierCounts.B;
    var bPlusInDeck = Math.round(bPlusCount * pInDeck);

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

  function countTagsInHand(tag, handCards, selfName, getCardTags) {
    var count = 0;
    var lookupCardTags = getCardTags || function() { return []; };
    for (var hci = 0; hci < (handCards || []).length; hci++) {
      var hcName = handCards[hci].name || handCards[hci];
      if (!hcName || hcName === selfName) continue;
      var hcTags = lookupCardTags(hcName) || [];
      if (hcTags.indexOf(tag) >= 0) count++;
    }
    return count;
  }

  function countEffectivePlayedTagTotal(myTags, selfTags, wantedTags, options) {
    var opts = options || {};
    var includeWild = opts.includeWild !== false;
    var tags = myTags || {};
    var cardTags = selfTags || [];
    var wanted = Array.isArray(wantedTags) ? wantedTags : [wantedTags];
    var total = 0;

    for (var wi = 0; wi < wanted.length; wi++) {
      total += tags[wanted[wi]] || 0;
    }
    for (var ci = 0; ci < cardTags.length; ci++) {
      if (wanted.indexOf(cardTags[ci]) >= 0) total += 1;
    }
    if (includeWild) total += tags.wild || 0;
    return total;
  }

  function countEffectiveTagSupport(tag, myTags, handCards, selfName, getCardTags, options) {
    var opts = options || {};
    var tags = myTags || {};
    var includeWild = opts.includeWild !== false;
    var selfTags = getCardTags ? (getCardTags(selfName) || []) : [];
    var current = countEffectivePlayedTagTotal(tags, selfTags, tag, {includeWild: includeWild});
    var future = countTagsInHand(tag, handCards, selfName, getCardTags);
    if (includeWild) future += countTagsInHand('wild', handCards, selfName, getCardTags);
    return {
      current: current,
      future: future,
      total: current + future,
    };
  }

  function scoreCardMetaBonuses(options) {
    var opts = options || {};
    var tags = opts.tags || [];
    var tp = opts.tp || {};
    var myTags = opts.myTags || {};
    var cost = opts.cost || 0;
    var gensLeft = opts.gensLeft || 1;
    var prod = opts.prod || null;
    var beh = opts.beh || {};
    var discount = opts.discount || null;
    var cd = opts.cd || {};
    var act = opts.act || {};
    var state = opts.state || {};
    var tagValue = opts.tagValue || {};
    var stockValues = opts.stockValues || {};
    var vpMCFn = opts.vpMC || vpMC;

    var delta = 0;
    var isEvent = tags.indexOf('event') >= 0;
    var hasBuilding = tags.indexOf('building') >= 0;
    var hasSpace = tags.indexOf('space') >= 0;

    if (hasBuilding && (tp.steel || 0) > 0) {
      var steelVal = tp.steelValue || 2;
      var steelSave = Math.min(tp.steel * steelVal, cost);
      delta += steelSave;
    }
    if (hasSpace && (tp.titanium || 0) > 0) {
      var tiVal = tp.titaniumValue || 3;
      var tiSave = Math.min(tp.titanium * tiVal, cost);
      delta += tiSave;
    }

    if (!isEvent) {
      for (var tgi = 0; tgi < tags.length; tgi++) {
        var tg = tags[tgi];
        delta += tagValue[tg] || 0.5;
        var existing = myTags[tg] || 0;
        if (existing >= 5) delta += 5;
        else if (existing >= 3) delta += 3;
        else if (existing >= 1) delta += 1;
      }
    } else {
      delta += 1;
    }

    if (tags.length === 0) delta -= 3;

    var fundedAwards = (state && state.game && state.game.fundedAwards) || [];
    if (fundedAwards.length > 0 && !isEvent) {
      for (var fai = 0; fai < fundedAwards.length; fai++) {
        var awName = ((fundedAwards[fai] && fundedAwards[fai].name) || fundedAwards[fai] || '').toLowerCase();
        if (awName.indexOf('scientist') >= 0 && tags.indexOf('science') >= 0) delta += 3;
        if (awName.indexOf('thermalist') >= 0 && prod && (prod.heat > 0 || prod.energy > 0)) delta += 2;
        if (awName.indexOf('banker') >= 0 && prod && prod.megacredits > 0) delta += prod.megacredits * 1.5;
        if (awName.indexOf('miner') >= 0 && (tags.indexOf('building') >= 0 || (prod && (prod.steel > 0 || prod.titanium > 0)))) delta += 2;
        if (awName.indexOf('landlord') >= 0 && beh.city) delta += 4;
        if (awName.indexOf('venuphile') >= 0 && tags.indexOf('venus') >= 0) delta += 3;
      }
    }

    var corp = (tp.tableau && tp.tableau[0] && (tp.tableau[0].name || tp.tableau[0])) || '';
    if (corp) {
      if (corp === 'Saturn Systems' && tags.indexOf('jovian') >= 0) delta += gensLeft * 1;
      if (corp === 'Arklight') {
        if (tags.indexOf('animal') >= 0) delta += vpMCFn(gensLeft);
        if (tags.indexOf('plant') >= 0) delta += vpMCFn(gensLeft) * 0.6;
      }
      if (corp === 'Teractor' && tags.indexOf('earth') >= 0) {
        delta += 3;
        if (discount && discount.tag === 'earth') delta += discount.amount * 0.8 * gensLeft;
      }
      if (corp === 'Interplanetary Cinematics' && isEvent) delta += 2;
      if (corp === 'Point Luna' && tags.indexOf('earth') >= 0) delta += 3.5;
      if (corp === 'Manutech' && prod) {
        for (var mk in prod) {
          if (prod[mk] > 0) delta += prod[mk] * (stockValues[mk] || 1);
        }
      }
      if (corp === 'Stormcraft Incorporated') {
        if (tags.indexOf('jovian') >= 0) delta += 2;
        if (cd.resourceType === 'Floater') delta += 3;
      }
      if (corp === 'Polyphemos' && act.addResources) delta += gensLeft * 1;
      if (corp === 'Mining Guild' && hasBuilding) delta += gensLeft * 0.5;
      if (corp === 'Ecoline' && tags.indexOf('plant') >= 0) delta += 2;
      if (corp === 'CrediCor' && cost >= 20) delta += 4;
      if (corp === 'Thorgate' && tags.indexOf('power') >= 0) delta += 3;
      if (corp === 'Poseidon' && beh.colony) delta += gensLeft * 1;
    }

    return {
      delta: delta,
      isEvent: isEvent,
      corp: corp,
    };
  }

  function scoreCardVPInfo(options) {
    var opts = options || {};
    var vpInfo = opts.vpInfo || null;
    if (!vpInfo) return 0;
    var gensLeft = opts.gensLeft || 1;
    var myTags = opts.myTags || {};
    var vpMCFn = opts.vpMC || vpMC;

    if (vpInfo.type === 'static') {
      return (vpInfo.vp || 0) * vpMCFn(gensLeft);
    }
    if (vpInfo.type === 'per_resource') {
      var resourcePerAction = Number(vpInfo.actionResourceAmount || vpInfo.resourcePerAction || 1);
      if (!isFinite(resourcePerAction) || resourcePerAction <= 0) resourcePerAction = 1;
      var expectedRes = Math.max(1, gensLeft - 2) * resourcePerAction;
      return (expectedRes / (vpInfo.per || 1)) * vpMCFn(gensLeft) * 0.8;
    }
    if (vpInfo.type === 'per_tag') {
      var tagCount = (myTags[vpInfo.tag] || 0) + 2;
      return (tagCount / (vpInfo.per || 1)) * vpMCFn(gensLeft);
    }
    if (vpInfo.type === 'per_colony' || vpInfo.type === 'per_city') {
      return (5 / (vpInfo.per || 1)) * vpMCFn(gensLeft);
    }
    if (vpInfo.type === 'special') {
      return vpMCFn(gensLeft) * 2;
    }
    return 0;
  }

  function scoreRecurringActionValue(options) {
    var opts = options || {};
    var act = opts.act || {};
    var vpInfo = opts.vpInfo || null;
    var gensLeft = opts.gensLeft || 1;
    var redsTax = opts.redsTax || 0;
    var stockValues = opts.stockValues || {};
    var prodValues = opts.prodValues || {};
    var trMCFn = opts.trMC || trMC;

    var delta = 0;
    if (act.addResources && vpInfo && vpInfo.type === 'per_resource') {
      // already counted in VP projection
    } else if (act.addResources) {
      delta += gensLeft * (Number(act.addResources) || 1);
    }
    if (act.drawCard) delta += gensLeft * act.drawCard * 3;
    if (act.stock) {
      for (var ask in act.stock) {
        delta += gensLeft * (act.stock[ask] || 0) * (stockValues[ask] || 1) * 0.5;
      }
    }
    if (act.production) {
      for (var apk in act.production) {
        delta += gensLeft * (act.production[apk] || 0) * (prodValues[apk] || 1) * 0.5;
      }
    }
    if (act.tr) delta += gensLeft * act.tr * trMCFn(gensLeft, redsTax) * 0.5;
    if (act.global) {
      for (var agk in act.global) {
        delta += gensLeft * (act.global[agk] || 0) * trMCFn(gensLeft, redsTax) * 0.5;
      }
    }
    return delta;
  }

  function scoreCardDiscountValue(options) {
    var opts = options || {};
    var discount = opts.discount || null;
    if (!discount || !discount.amount) return 0;
    var gensLeft = opts.gensLeft || 1;
    var genericCardsPerGen = opts.genericCardsPerGen || 2.5;
    var tagCardsPerGen = opts.tagCardsPerGen || 1;
    var cardsPerGen = discount.tag ? tagCardsPerGen : genericCardsPerGen;
    return discount.amount * cardsPerGen * gensLeft;
  }

  function scoreHandDiscountValue(options) {
    var opts = options || {};
    var name = opts.name || '';
    var discount = opts.discount || null;
    var handCards = opts.handCards || [];
    var getCardTags = opts.getCardTags || function() { return []; };
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
    if (!discountInfo && !discount) return 0;
    var requiredTag = discountInfo && discountInfo.tag;
    var amount = (discountInfo && discountInfo.amount) || discount.amount || 1;
    var handSaving = 0;
    for (var i = 0; i < handCards.length; i++) {
      var handCardName = handCards[i] && (handCards[i].name || handCards[i]);
      if (!handCardName || handCardName === name) continue;
      var handTags = getCardTags(handCardName) || [];
      if (!requiredTag || handTags.indexOf(requiredTag) >= 0) handSaving += amount;
    }
    return Math.min(handSaving, 20);
  }

  function scoreCityTimingValue(options) {
    var opts = options || {};
    var beh = opts.beh || {};
    var name = opts.name || '';
    var isCityCard = opts.isCityCard || function() { return false; };
    var isOffBoardCityCard = opts.isOffBoardCityCard || function() { return false; };
    if (!(isCityCard(name) || beh.city) || isOffBoardCityCard(name)) return 0;
    var steps = typeof opts.steps === 'number' ? opts.steps : 0;
    var gensLeft = typeof opts.gensLeft === 'number' ? opts.gensLeft : 1;
    var tp = opts.tp || {};
    var urgency = steps > 0 ? Math.max(0, Math.min(1, 1 - (steps - 2) / 14)) : 0;
    var myCities = tp.citiesCount || 0;
    var cityTimingUrgency = Math.max(urgency, 1 - Math.max(0, gensLeft - 1) / 4);
    var cityPremium = 4 + Math.round(cityTimingUrgency * 4);
    if (myCities < 2) cityPremium += 4;
    return cityPremium;
  }

  function scoreProductionTimingValue(options) {
    var opts = options || {};
    var name = opts.name || '';
    var isProdCard = opts.isProdCard || function() { return false; };
    if (!isProdCard(name)) return 0;
    if ((opts.reqPenalty || 0) > 0) return 0;
    var gen = typeof opts.gen === 'number' ? opts.gen : 1;
    var steps = typeof opts.steps === 'number' ? opts.steps : 0;
    var urgency = steps > 0 ? Math.max(0, Math.min(1, 1 - (steps - 2) / 14)) : 0;
    return gen <= 3 ? 10 : Math.round(5 * Math.max(0, 1 - urgency * 1.5));
  }

  function scoreCardDisruptionValue(options) {
    var opts = options || {};
    var beh = opts.beh || {};
    var delta = 0;
    if (beh.decreaseAnyProduction) {
      delta += (beh.decreaseAnyProduction.count || 0) * 1.5;
    }
    if (beh.removeAnyPlants) {
      delta += beh.removeAnyPlants * 0.5;
    }
    return delta;
  }

  function liveGlobalRaiseCount(param, amount, game, counter) {
    var count = Number(amount) || 0;
    if (count <= 0) return 0;
    var key = String(param || '').toLowerCase();
    var g2 = game || {};
    var tempNow = typeof g2.temperature === 'number' ? g2.temperature : -30;
    var oxyNow = typeof g2.oxygenLevel === 'number' ? g2.oxygenLevel : 0;
    var oceansNow = typeof g2.oceans === 'number' ? g2.oceans : 0;
    var venusNow = typeof g2.venusScaleLevel === 'number' ? g2.venusScaleLevel : 30;
    var left = count;
    if (key === 'temperature' || key === 'temp' || key === 'heat') left = Math.max(0, Math.round((8 - tempNow) / 2));
    else if (key === 'oxygen' || key === 'o2') left = Math.max(0, 14 - oxyNow);
    else if (key === 'ocean' || key === 'oceans') left = Math.max(0, 9 - oceansNow);
    else if (key === 'venus') left = Math.max(0, Math.round((30 - venusNow) / 2));
    var live = Math.min(count, left);
    if (counter) counter.maxed += Math.max(0, count - live);
    return live;
  }

  function scoreGlobalTileValue(options) {
    var opts = options || {};
    var beh = opts.beh || {};
    var card = opts.card || {};
    var game = opts.game || {};
    var gensLeft = typeof opts.gensLeft === 'number' ? opts.gensLeft : 1;
    var redsTax = opts.redsTax || 0;
    var trMCFn = opts.trMC || trMC;
    var vpMCFn = opts.vpMC || vpMC;
    var tempoBonus = opts.tempoBonus || 0;
    var glob = beh.global;
    var counter = { maxed: 0 };
    var delta = 0;

    if (glob) {
      var trRaises = 0;
      for (var gk in glob) trRaises += liveGlobalRaiseCount(gk, glob[gk], game, counter);
      delta += trRaises * (trMCFn(gensLeft, redsTax) + tempoBonus);
    }
    if (counter.maxed > 0) delta -= counter.maxed * 3;
    if (beh.tr) delta += beh.tr * trMCFn(gensLeft, redsTax);
    if (beh.ocean) {
      var oceanRaises = liveGlobalRaiseCount('oceans', typeof beh.ocean === 'number' ? beh.ocean : 1, game, counter);
      delta += oceanRaises * (trMCFn(gensLeft, redsTax) + tempoBonus + 2);
    }
    if (beh.greenery) {
      var oxyRaise = liveGlobalRaiseCount('oxygen', 1, game, counter);
      delta += oxyRaise * (trMCFn(gensLeft, redsTax) + tempoBonus) + vpMCFn(gensLeft);
    }
    if ((card.warnings || []).indexOf('maxvenus') >= 0 || (counter.maxed > 0 && glob && Object.keys(glob).length > 0)) {
      delta -= 6;
    }
    return delta;
  }

  function applyManualEVAdjustments(options) {
    var opts = options || {};
    var name = opts.name || '';
    var manual = opts.manual || null;
    if (!manual) return 0;
    var actionResourceReq = opts.actionResourceReq || {};
    var tp = opts.tp || {};
    var gensLeft = opts.gensLeft || 1;
    var estimateTriggersPerGenFn = opts.estimateTriggersPerGen || function() { return 0; };
    var myTags = opts.myTags || tp.tags || {};
    var handCards = opts.handCards || [];
    var selfName = opts.selfName || name;
    var getCardTags = opts.getCardTags || function() { return []; };
    var selfTags = getCardTags(selfName) || [];

    var delta = 0;
    var timingGens = Math.min(gensLeft, 6);

    if (name === 'Insects') {
      var plantSupport = countEffectiveTagSupport('plant', myTags, handCards, selfName, getCardTags);
      delta += plantSupport.current * timingGens * 1.2;
      delta += Math.min(6, plantSupport.future * 1.2);
      if (plantSupport.current === 0 && plantSupport.future === 0) delta -= 8;
      else if (plantSupport.current === 0) delta -= 5;
      else if (plantSupport.current === 1 && plantSupport.future === 0) delta -= 2;
      if (plantSupport.total >= 5) delta += 2;
      return delta;
    }

    if (name === 'Worms') {
      var microbeSupport = countEffectiveTagSupport('microbe', myTags, handCards, selfName, getCardTags);
      var currentMicrobes = microbeSupport.current;
      var currentProd = Math.floor(currentMicrobes / 2);
      delta += currentProd * timingGens * 1.2;
      delta += Math.min(4, microbeSupport.future * 0.8);
      if (currentMicrobes <= 1 && microbeSupport.future === 0) delta -= 6;
      else if (currentMicrobes <= 2) delta -= 3;
      else if (currentMicrobes <= 3 && microbeSupport.future === 0) delta -= 2;
      if (currentMicrobes + microbeSupport.future >= 6) delta += 2;
      return delta;
    }

    if (name === 'Terraforming Ganymede') {
      var trMCFn = opts.trMC || trMC;
      var redsTax = opts.redsTax || 0;
      var jovianCount = countEffectivePlayedTagTotal(myTags, selfTags, 'jovian');
      return jovianCount * trMCFn(gensLeft, redsTax);
    }

    var perGenMult = 1;
    if (manual.perGen && actionResourceReq[name]) {
      var reqRes = actionResourceReq[name];
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
    if (manual.perGen) delta += manual.perGen * gensLeft * perGenMult;
    if (manual.once) delta += manual.once;
    if (manual.perTrigger && manual.triggerTag) {
      delta += manual.perTrigger * estimateTriggersPerGenFn(manual.triggerTag) * gensLeft;
    }
    return delta;
  }

  var TM_BRAIN_CORE = {
    PAY_ZERO: PAY_ZERO,
    smartPay: smartPay,
    vpMC: vpMC,
    trMC: trMC,
    calcPlayerVP: calcPlayerVP,
    vpLead: vpLead,
    isRedsRuling: isRedsRuling,
    hasVPCard: hasVPCard,
    remainingStepsWithOptions: remainingStepsWithOptions,
    scoreColonyTrade: scoreColonyTrade,
    shouldPushGlobe: shouldPushGlobe,
    estimateTriggersPerGen: estimateTriggersPerGen,
    pAtLeastOne: pAtLeastOne,
    buildGlobalProgressBreakdown: buildGlobalProgressBreakdown,
    estimateGensLeftFromState: estimateGensLeftFromState,
    estimateAverageGameLengthFromState: estimateAverageGameLengthFromState,
    buildEndgameTiming: buildEndgameTiming,
    estimateScoreCardTimingInterpolated: estimateScoreCardTimingInterpolated,
    estimateScoreCardTimingAccelerating: estimateScoreCardTimingAccelerating,
    buildScoreCardContext: buildScoreCardContext,
    buildProductionValuationContext: buildProductionValuationContext,
    normalizeOpeningHandBias: normalizeOpeningHandBias,
    isOpeningHandContext: isOpeningHandContext,
    getOpeningHandBias: getOpeningHandBias,
    scoreRequirementPenalty: scoreRequirementPenalty,
    analyzePass: analyzePass,
    rankHandCards: rankHandCards,
    analyzeActions: analyzeActions,
    analyzeDeck: analyzeDeck,
    countTagsInHand: countTagsInHand,
    countEffectivePlayedTagTotal: countEffectivePlayedTagTotal,
    scoreCardMetaBonuses: scoreCardMetaBonuses,
    scoreCardVPInfo: scoreCardVPInfo,
    scoreRecurringActionValue: scoreRecurringActionValue,
    scoreCardDiscountValue: scoreCardDiscountValue,
    scoreHandDiscountValue: scoreHandDiscountValue,
    scoreCityTimingValue: scoreCityTimingValue,
    scoreProductionTimingValue: scoreProductionTimingValue,
    scoreCardDisruptionValue: scoreCardDisruptionValue,
    scoreGlobalTileValue: scoreGlobalTileValue,
    applyManualEVAdjustments: applyManualEVAdjustments,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TM_BRAIN_CORE;
  } else {
    root.TM_BRAIN_CORE = TM_BRAIN_CORE;
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
