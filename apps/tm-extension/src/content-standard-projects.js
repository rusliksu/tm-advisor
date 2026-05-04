// TM Tier Overlay - Content standard projects helpers
(function(global) {
  'use strict';

  var lastUpdateAt = 0;
  var SP_NAMES = { power: 'Электростанция', asteroid: 'Астероид', aquifer: 'Океан', greenery: 'Озеленение', city: 'Город', venus: 'Очистка', buffer: 'Буфер', lobby: 'Лобби' };
  var SP_ICONS = { power: '⚡', asteroid: '🌡', aquifer: '🌊', greenery: '🌿', city: '🏙', venus: '♀', buffer: '♀B', lobby: '🏛' };

  function reasonTextPayload(row) {
    if (!row) return '';
    if (typeof row === 'string') return row;
    if (typeof row.text === 'string') return row.text;
    return '';
  }

  function normalizeReasonRow(row) {
    if (!row) return null;
    if (typeof row === 'string') return { text: row, tone: 'positive' };
    if (typeof row !== 'object') return null;
    if (!row.text) return null;
    var normalized = { text: String(row.text), tone: row.tone === 'negative' ? 'negative' : 'positive' };
    if (typeof row.value === 'number' && isFinite(row.value)) normalized.value = row.value;
    return normalized;
  }

  function normalizeReasonRows(rows) {
    if (!rows) return [];
    var list = Array.isArray(rows) ? rows : [rows];
    var normalized = [];
    for (var i = 0; i < list.length; i++) {
      var row = normalizeReasonRow(list[i]);
      if (row) normalized.push(row);
    }
    return normalized;
  }

  function mergeReasonRows(baseRows, overrideRows) {
    var base = normalizeReasonRows(baseRows);
    var override = normalizeReasonRows(overrideRows);
    if (override.length === 0) return base;
    var overrideByText = new Map();
    for (var oi = 0; oi < override.length; oi++) {
      overrideByText.set(reasonTextPayload(override[oi]), override[oi]);
    }
    var merged = [];
    var seen = new Set();
    for (var bi = 0; bi < base.length; bi++) {
      var baseText = reasonTextPayload(base[bi]);
      var row = overrideByText.get(baseText) || base[bi];
      merged.push(row);
      seen.add(reasonTextPayload(row));
    }
    for (var oi2 = 0; oi2 < override.length; oi2++) {
      var overrideText = reasonTextPayload(override[oi2]);
      if (!seen.has(overrideText)) {
        merged.push(override[oi2]);
        seen.add(overrideText);
      }
    }
    return merged;
  }

  function pushStructuredReason(reasons, reasonRows, text, value, tone) {
    if (!text) return;
    reasons.push(text);
    if (!reasonRows) return;
    var row = { text: text, tone: tone || ((typeof value === 'number' && value < 0) ? 'negative' : 'positive') };
    if (typeof value === 'number' && isFinite(value)) row.value = value;
    reasonRows.push(row);
  }

  function getMegaCredits(player) {
    if (!player) return 0;
    var raw = player.megaCredits;
    if (raw == null) raw = player.megacredits;
    return Math.max(0, Number(raw) || 0);
  }

  function getMegaCreditProduction(player) {
    if (!player) return 0;
    var raw = player.megaCreditProduction;
    if (raw == null) raw = player.megacreditProduction;
    if (raw == null) raw = player.megaCreditsProduction;
    return Math.max(0, Number(raw) || 0);
  }

  function setReasonPayload(el, source, externalSetter) {
    if (!el) return;
    if (typeof externalSetter === 'function') {
      externalSetter(el, source);
      return;
    }
    var reasonRows = [];
    if (source && typeof source === 'object' && !Array.isArray(source) && !source.text && (source.reasons || source.reasonRows)) {
      reasonRows = mergeReasonRows(source.reasons || [], source.reasonRows || []);
    } else {
      reasonRows = normalizeReasonRows(source);
    }
    if (reasonRows.length === 0) {
      el.removeAttribute('data-tm-reasons');
      el.removeAttribute('data-tm-reason-rows');
      return;
    }
    el.setAttribute('data-tm-reasons', reasonRows.map(reasonTextPayload).join('|'));
    el.setAttribute('data-tm-reason-rows', JSON.stringify(reasonRows));
  }

  function detectSPType(cardEl) {
    var classes = cardEl.className || '';
    var title = (cardEl.querySelector('.card-title') || {}).textContent || '';
    title = title.trim().toLowerCase();

    if (classes.indexOf('sell-patents') !== -1 || title.indexOf('sell') !== -1 || title.indexOf('патент') !== -1) return 'sell';
    if (classes.indexOf('power-plant') !== -1 || (title.indexOf('power') !== -1 && title.indexOf('plant') !== -1) || title.indexOf('электростан') !== -1) return 'power';
    if (classes.indexOf('asteroid-standard') !== -1 || (title.indexOf('asteroid') !== -1 && classes.indexOf('standard') !== -1) || title.indexOf('астероид') !== -1) return 'asteroid';
    if (classes.indexOf('aquifer') !== -1 || title.indexOf('aquifer') !== -1 || title.indexOf('океан') !== -1 || title.indexOf('аквифер') !== -1) return 'aquifer';
    if (classes.indexOf('greenery') !== -1 || title.indexOf('greenery') !== -1 || title.indexOf('озеленен') !== -1) return 'greenery';
    if (classes.indexOf('city-standard') !== -1 || (title.indexOf('city') !== -1 && classes.indexOf('standard') !== -1) || title.indexOf('город') !== -1) return 'city';
    if (classes.indexOf('air-scrapping') !== -1 || title.indexOf('air scrap') !== -1 || title.indexOf('очистк') !== -1) return 'venus';
    if (classes.indexOf('buffer-gas') !== -1 || title.indexOf('buffer') !== -1 || title.indexOf('буфер') !== -1) return 'buffer';
    if (classes.indexOf('trade') !== -1 || title.indexOf('trade') !== -1 || title.indexOf('торг') !== -1) return 'trade';
    if (classes.indexOf('build-colony') !== -1 || (title.indexOf('colony') !== -1 && classes.indexOf('standard') !== -1) || title.indexOf('колон') !== -1) return 'colony';
    if (classes.indexOf('lobby') !== -1 || title.indexOf('lobby') !== -1 || title.indexOf('лобби') !== -1) return 'lobby';
    return null;
  }

  function checkSPMilestoneAward(input) {
    var spType = input && input.spType;
    var pv = input && input.pv;
    var isGreeneryTile = input && input.isGreeneryTile;
    var sc = input && input.sc;
    var bonus = 0;
    var reasons = [];
    var reasonRows = [];
    var g = pv && pv.game;
    var p = pv && pv.thisPlayer;
    if (!g || !p || typeof isGreeneryTile !== 'function' || !sc) return { bonus: 0, reasons: [], reasonRows: [] };

    var myColor = p.color;

    if (g.milestones) {
      var claimedCount = 0;
      for (var mi = 0; mi < g.milestones.length; mi++) {
        if (g.milestones[mi].playerName || g.milestones[mi].player) claimedCount++;
      }
      if (claimedCount < 3) {
        for (var mi2 = 0; mi2 < g.milestones.length; mi2++) {
          var ms = g.milestones[mi2];
          if (ms.playerName || ms.player) continue;
          var msName = ms.name;

          if (spType === 'greenery' && (msName === 'Gardener' || msName === 'Forester')) {
            var myGreens = 0;
            if (g.spaces) {
              for (var si = 0; si < g.spaces.length; si++) {
                if (g.spaces[si].color === myColor && isGreeneryTile(g.spaces[si].tileType)) myGreens++;
              }
            }
            if (myGreens >= 2) { bonus += sc.spMilestoneReach; pushStructuredReason(reasons, reasonRows, '→ ' + msName + '! (' + myGreens + '/3)', sc.spMilestoneReach); }
            else if (myGreens >= 1) { bonus += sc.spMilestoneClose; pushStructuredReason(reasons, reasonRows, msName + ' ' + myGreens + '/3', sc.spMilestoneClose); }
          }

          if (spType === 'city' && msName === 'Mayor') {
            var myCities = p.citiesCount || 0;
            if (myCities >= 2) { bonus += sc.spMilestoneReach; pushStructuredReason(reasons, reasonRows, '→ Mayor! (' + myCities + '/3)', sc.spMilestoneReach); }
            else if (myCities >= 1) { bonus += sc.spMilestoneClose; pushStructuredReason(reasons, reasonRows, 'Mayor ' + myCities + '/3', sc.spMilestoneClose); }
          }

          if (spType === 'power') {
            if (msName === 'Specialist') {
              var maxProd = Math.max(getMegaCreditProduction(p), p.steelProduction || 0, p.titaniumProduction || 0, p.plantProduction || 0, p.energyProduction || 0, p.heatProduction || 0);
              var epAfter = (p.energyProduction || 0) + 1;
              if (epAfter >= 10 && maxProd < 10) { bonus += sc.spMilestoneReach; pushStructuredReason(reasons, reasonRows, '→ Specialist!', sc.spMilestoneReach); }
            }
            if (msName === 'Energizer') {
              var ep = p.energyProduction || 0;
              if (ep + 1 >= 6 && ep < 6) { bonus += sc.spMilestoneReach; pushStructuredReason(reasons, reasonRows, '→ Energizer!', sc.spMilestoneReach); }
              else if (ep >= 4) { bonus += sc.spMilestoneClose; pushStructuredReason(reasons, reasonRows, 'Energizer ' + ep + '/6', sc.spMilestoneClose); }
            }
          }
        }
      }
    }

    if (g.awards) {
      for (var ai = 0; ai < g.awards.length; ai++) {
        var aw = g.awards[ai];
        var isFunded = !!(aw.playerName || aw.color);
        if (!isFunded || !aw.scores || aw.scores.length === 0) continue;

        var myScore = 0;
        var bestOpp = 0;
        for (var si2 = 0; si2 < aw.scores.length; si2++) {
          if (aw.scores[si2].color === myColor) myScore = aw.scores[si2].score;
          else bestOpp = Math.max(bestOpp, aw.scores[si2].score);
        }

        if (spType === 'greenery' && (aw.name === 'Landscaper' || aw.name === 'Cultivator')) {
          if (myScore >= bestOpp - 1) { bonus += sc.spAwardLead; pushStructuredReason(reasons, reasonRows, aw.name + ' ' + myScore + '→' + (myScore + 1), sc.spAwardLead); }
        }
        if (spType === 'city' && (aw.name === 'Suburbian' || aw.name === 'Urbanist')) {
          if (myScore >= bestOpp - 1) { bonus += sc.spAwardLead; pushStructuredReason(reasons, reasonRows, aw.name + ' ' + myScore + '→' + (myScore + 1), sc.spAwardLead); }
        }
        if (spType === 'aquifer' && aw.name === 'Landlord') {
          if (myScore >= bestOpp - 1) { bonus += sc.spAwardContrib; pushStructuredReason(reasons, reasonRows, 'Landlord +1', sc.spAwardContrib); }
        }
        if ((spType === 'asteroid' || spType === 'aquifer' || spType === 'greenery' || spType === 'venus' || spType === 'buffer') && aw.name === 'Benefactor') {
          if (myScore >= bestOpp - 2) { bonus += sc.spAwardContrib; pushStructuredReason(reasons, reasonRows, 'Benefactor TR+1', sc.spAwardContrib); }
        }
        if (spType === 'power' && (aw.name === 'Industrialist' || aw.name === 'Electrician')) {
          if (myScore >= bestOpp - 1) { bonus += sc.spAwardContrib; pushStructuredReason(reasons, reasonRows, aw.name + ' +1', sc.spAwardContrib); }
        }
      }
    }

    return { bonus: bonus, reasons: reasons, reasonRows: reasonRows };
  }

  function countMyDelegates(g, playerColor) {
    var count = 0;
    if (g.turmoil && g.turmoil.parties) {
      for (var i = 0; i < g.turmoil.parties.length; i++) {
        var party = g.turmoil.parties[i];
        if (party.delegates) {
          for (var j = 0; j < party.delegates.length; j++) {
            var d = party.delegates[j];
            if ((d.color || d) === playerColor) count += (d.number || 1);
          }
        }
      }
    }
    return count;
  }

  var COLONY_BUILD_COST = 17;
  var COLONY_BUILD_PRIORITY = {
    Pluto: 11, Luna: 10, Triton: 9, Ceres: 8, Ganymede: 6,
    Callisto: 5, Titan: 4, Miranda: 4, Enceladus: 4, Io: 4, Europa: 2,
  };
  var RESOURCE_COLONY_TYPES = { Titan: 'floater', Enceladus: 'microbe', Miranda: 'animal' };
  var FREE_TRADE_TABLEAU_CARDS = { 'Titan Floating Launch-Pad': 1, 'Titan Floating Launch-pad': 1 };
  var TRADE_DISCOUNT_TABLEAU_CARDS = { 'Cryo-Sleep': 1, 'Rim Freighters': 1 };
  var TRADE_TRACK_BOOST_TABLEAU_CARDS = { 'Trade Envoys': 1, 'Trading Colony': 1, 'L1 Trade Terminal': 2 };
  var TRADE_MC_BONUS_TABLEAU_CARDS = { 'Venus Trade Hub': 3 };

  function normalizeLookupCardName(name) {
    if (!name) return '';
    return String(name).replace(/:ares$/i, '');
  }

  function getCardDataByName(name) {
    if (typeof TM_CARD_DATA === 'undefined' || !name) return null;
    var direct = TM_CARD_DATA[name];
    if (direct) return direct;
    var normalized = normalizeLookupCardName(name);
    return TM_CARD_DATA[normalized] || null;
  }

  function countOwnedColonies(colonies, color) {
    if (!colonies || !color) return 0;
    var count = 0;
    for (var i = 0; i < colonies.length; i++) {
      var slots = colonies[i] && colonies[i].colonies;
      if (!slots) continue;
      for (var j = 0; j < slots.length; j++) {
        var slot = slots[j];
        if (slot === color || (slot && (slot.color === color || slot.player === color))) count++;
      }
    }
    return count;
  }

  function hasColonyOnTarget(target, color) {
    var slots = target && target.colonies;
    if (!slots || !color) return false;
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (slot === color || (slot && (slot.color === color || slot.player === color))) return true;
    }
    return false;
  }

  function countReadyFleets(player) {
    if (!player) return 0;
    return Math.max(0, (player.fleetSize || 1) - (player.tradesThisGeneration || 0));
  }

  function getTradeModifiers(player) {
    var tableau = (player && player.tableau) || [];
    var energyDiscount = 0;
    var trackBoost = 0;
    var mcBonus = 0;
    for (var i = 0; i < tableau.length; i++) {
      var cardName = normalizeLookupCardName(tableau[i] && tableau[i].name);
      if (TRADE_DISCOUNT_TABLEAU_CARDS[cardName]) energyDiscount += 1;
      if (TRADE_TRACK_BOOST_TABLEAU_CARDS[cardName]) trackBoost += TRADE_TRACK_BOOST_TABLEAU_CARDS[cardName];
      if (TRADE_MC_BONUS_TABLEAU_CARDS[cardName]) mcBonus += TRADE_MC_BONUS_TABLEAU_CARDS[cardName];
    }
    return { energyDiscount: energyDiscount, trackBoost: trackBoost, mcBonus: mcBonus };
  }

  function playerCanTradeNow(player) {
    if (!player || countReadyFleets(player) <= 0) return false;
    var modifiers = getTradeModifiers(player);
    var energyCost = Math.max(1, 3 - modifiers.energyDiscount);
    if ((player.energy || 0) >= energyCost) return true;
    if (getMegaCredits(player) >= 9) return true;
    var tableau = player.tableau || [];
    for (var i = 0; i < tableau.length; i++) {
      if (FREE_TRADE_TABLEAU_CARDS[normalizeLookupCardName(tableau[i] && tableau[i].name)] && (tableau[i].resources || 0) > 0) return true;
    }
    return false;
  }

  function isPlayerPassed(game, player) {
    var passed = (game && game.passedPlayers) || [];
    if (!player) return false;
    if (player.passed) return true;
    return passed.indexOf(player.color) !== -1 || passed.indexOf(player.name) !== -1;
  }

  function seatTradeWeight(game, myColor, playerColor) {
    var orderPlayers = (game && game.players) || [];
    var order = orderPlayers.map(function(p) { return p && p.color; }).filter(Boolean);
    var myIdx = order.indexOf(myColor);
    var oppIdx = order.indexOf(playerColor);
    if (myIdx === -1 || oppIdx === -1) return 1.0;
    if (oppIdx > myIdx) return 1.0;
    if (oppIdx < myIdx) return 0.75;
    return 0.0;
  }

  function colonyTrackValueMc(cdata, trackPos, rv) {
    if (!cdata || !cdata.track) return 0;
    var idx = Math.max(0, Math.min(cdata.track.length - 1, trackPos || 0));
    var entry = cdata.track[idx];
    if (typeof entry === 'number') {
      var amount = entry;
      var res = String(cdata.res || '').toLowerCase();
      if (res === 'mc') return amount;
      if (res === 'steel') return amount * rv.steel;
      if (res === 'titanium') return amount * rv.titanium;
      if (res === 'plants') return amount * rv.plant;
      if (res === 'heat') return amount * rv.heat;
      if (res === 'cards') return amount * rv.card;
      if (res === 'floaters') return amount * rv.floater;
      if (res === 'microbes') return amount * rv.microbe;
      if (res === 'animals') return amount * rv.animal;
      if (res.indexOf('tr') !== -1) return amount * 7.6;
      if (res.indexOf('vp') !== -1) return amount * 5.0;
      return amount;
    }
    if (typeof entry === 'string') {
      var lower = entry.toLowerCase();
      if (lower.indexOf('mc production') !== -1) return rv.mcProd;
      if (lower.indexOf('energy production') !== -1) return rv.energyProd;
      if (lower.indexOf('plant production') !== -1) return rv.plantProd;
      if (lower.indexOf('heat production') !== -1) return rv.heatProd;
      if (lower.indexOf('steel production') !== -1) return rv.steelProd;
      if (lower.indexOf('titanium production') !== -1) return rv.tiProd;
    }
    return 0;
  }

  function contestPressureContext(game, target, player, rv, gensLeft) {
    if (!game || !target || !player) return { penalty: 0, reason: '' };
    var generation = game.generation || 1;
    if (generation >= 9) return { penalty: 0, reason: '' };
    var trackPos = target.trackPosition != null ? target.trackPosition : (target.track || 0);
    if ((trackPos || 0) <= 1) return { penalty: 0, reason: '' };
    var cdata = (typeof TM_COLONY_DATA !== 'undefined') ? TM_COLONY_DATA[target.name] : null;
    if (!cdata) return { penalty: 0, reason: '' };

    var stripValue = Math.max(0, colonyTrackValueMc(cdata, trackPos, rv) - colonyTrackValueMc(cdata, 0, rv));
    if (stripValue < 4) return { penalty: 0, reason: '' };

    var contenders = [];
    var players = game.players || [];
    for (var i = 0; i < players.length; i++) {
      var opp = players[i];
      if (!opp || opp.color === player.color || isPlayerPassed(game, opp)) continue;
      if (!playerCanTradeNow(opp)) continue;

      var modifiers = getTradeModifiers(opp);
      var oppSettlers = 0;
      var slots = target.colonies || [];
      for (var j = 0; j < slots.length; j++) {
        var slot = slots[j];
        if (slot === opp.color || (slot && (slot.color === opp.color || slot.player === opp.color))) oppSettlers++;
      }
      var effectiveTrack = Math.min((trackPos || 0) + modifiers.trackBoost, (cdata.track || []).length - 1);
      var totalMc = colonyTrackValueMc(cdata, effectiveTrack, rv) + colonyBenefitMc(cdata.bonus, rv) * oppSettlers + modifiers.mcBonus;
      if (totalMc < 10) continue;

      var weight = seatTradeWeight(game, player.color, opp.color);
      if (weight <= 0) continue;
      if (totalMc >= 16) weight += 0.2;
      contenders.push({ name: opp.name || opp.color || 'opp', weight: weight });
    }

    if (!contenders.length) return { penalty: 0, reason: '' };

    var myInterest = countReadyFleets(player) > 0 ? 1.0 : 0.55;
    var lateDecay = generation <= 3 ? 1.0 : (generation <= 5 ? 0.8 : 0.6);
    var totalWeight = 0;
    for (var k = 0; k < contenders.length; k++) totalWeight += contenders[k].weight;
    var penalty = Math.round(Math.min(7, totalWeight * Math.min(stripValue, 10) * 0.32 * myInterest * lateDecay) * 10) / 10;
    if (penalty <= 0.4) return { penalty: 0, reason: '' };
    var names = contenders.slice(0, 2).map(function(c) { return c.name; });
    return { penalty: penalty, reason: names.join(', ') + ' can strip track first' };
  }

  function colonyBenefitMc(text, rv) {
    var s = String(text || '').trim().toLowerCase().replace(/^\+/, '');
    if (!s) return 0;
    if (s.indexOf('ocean') !== -1) return rv.ocean;
    var m = s.match(/(\d+)\s+(.+)/);
    if (!m) return 0;
    var amount = parseInt(m[1], 10);
    var rest = m[2];
    if (rest.indexOf('mc-prod') !== -1 || rest.indexOf('mc prod') !== -1) return amount * rv.mcProd;
    if (rest.indexOf('steel-prod') !== -1 || rest.indexOf('steel prod') !== -1) return amount * rv.steelProd;
    if (rest.indexOf('ti-prod') !== -1 || rest.indexOf('titanium-prod') !== -1) return amount * rv.tiProd;
    if (rest.indexOf('plant-prod') !== -1 || rest.indexOf('plant prod') !== -1) return amount * rv.plantProd;
    if (rest.indexOf('energy-prod') !== -1 || rest.indexOf('energy prod') !== -1) return amount * rv.energyProd;
    if (rest.indexOf('heat-prod') !== -1 || rest.indexOf('heat prod') !== -1) return amount * rv.heatProd;
    if (rest.indexOf('card') !== -1) return amount * rv.card;
    if (rest.indexOf('titanium') !== -1 || /^ti\b/.test(rest)) return amount * rv.titanium;
    if (rest.indexOf('steel') !== -1) return amount * rv.steel;
    if (rest.indexOf('plant') !== -1) return amount * rv.plant;
    if (rest.indexOf('energy') !== -1) return amount * rv.energy;
    if (rest.indexOf('heat') !== -1) return amount * rv.heat;
    if (rest.indexOf('animal') !== -1) return amount * rv.animal;
    if (rest.indexOf('floater') !== -1) return amount * rv.floater;
    if (rest.indexOf('microbe') !== -1) return amount * rv.microbe;
    return 0;
  }

  function parseBonusAmount(text, resourceKind) {
    if (!text || !resourceKind) return 0;
    var s = String(text).trim().toLowerCase().replace(/^\+/, '');
    var m = s.match(/(\d+)\s+(.+)/);
    if (!m) return 0;
    var amount = parseInt(m[1], 10);
    var rest = m[2];
    if (rest.indexOf(resourceKind) !== -1) return amount;
    return 0;
  }

  function resourceColonySupportContext(colonyName, player, handCards) {
    var resourceKind = RESOURCE_COLONY_TYPES[colonyName];
    if (!resourceKind || !player) return { deltaPerUnit: 0, reason: '' };
    var hits = [];
    var tableau = player.tableau || [];

    function consider(cardName, resources, inHand) {
      var info = getCardDataByName(cardName);
      if (!info) return;
      if (String(info.resourceType || '').toLowerCase() !== resourceKind) return;
      var score = 1.0;
      if (info.hasAction) score += 0.6;
      var vp = String(info.victoryPoints || '').toLowerCase();
      if (vp.indexOf('/resource') !== -1 || vp.indexOf('resources') !== -1) score += 1.2;
      else if (vp === 'special') score += 0.5;
      if (!inHand && resources > 0) score += Math.min(0.8, resources * 0.2);
      if (resourceKind === 'floater' && FREE_TRADE_TABLEAU_CARDS[normalizeLookupCardName(cardName)]) score += 1.2;
      if (inHand) score *= 0.7;
      hits.push({ score: score, name: normalizeLookupCardName(cardName) });
    }

    for (var i = 0; i < tableau.length; i++) {
      if (tableau[i] && tableau[i].name) consider(tableau[i].name, tableau[i].resources || 0, false);
    }
    var cards = handCards || [];
    for (var j = 0; j < cards.length; j++) {
      if (cards[j] && cards[j].name) consider(cards[j].name, 0, true);
    }

    hits.sort(function(a, b) { return b.score - a.score; });
    var total = 0;
    for (var k = 0; k < hits.length; k++) total += hits[k].score;
    var names = hits.slice(0, 2).map(function(hit) { return hit.name; });
    var labelPart = names.length ? ' (' + names.join(', ') + ')' : '';
    if (total <= 0.05) return { deltaPerUnit: -0.8, reason: 'No good ' + resourceKind + ' sinks' };
    if (total < 2.0) return { deltaPerUnit: 0.5, reason: resourceKind + ' sink online' + labelPart };
    if (total < 4.0) return { deltaPerUnit: 1.0, reason: 'Good ' + resourceKind + ' sinks' + labelPart };
    return { deltaPerUnit: 1.5, reason: 'Strong ' + resourceKind + ' sinks' + labelPart };
  }

  function bestColonyBuildTarget(pv, gensLeft, prodVal) {
    if (!pv || !pv.thisPlayer || !pv.game || !pv.game.colonies) return null;
    var p = pv.thisPlayer;
    var g = pv.game;
    var myColor = p.color || '';
    var colonies = g.colonies || [];
    var myColonies = countOwnedColonies(colonies, myColor);
    if (myColonies >= 3) {
      return {
        label: 'Лимит 3',
        cls: 'tm-sp-bad',
        net: -4,
        canAfford: getMegaCredits(p) >= COLONY_BUILD_COST,
        reasonRows: [{ text: 'Build Colony: лимит 3 колонии', tone: 'negative', value: -4 }],
      };
    }

    var openTargets = [];
    for (var i = 0; i < colonies.length; i++) {
      var col = colonies[i];
      if (!col || col.isActive === false) continue;
      var slots = col.colonies || [];
      if (slots.length >= 3) continue;
      if (hasColonyOnTarget(col, myColor)) continue;
      openTargets.push(col);
    }
    if (openTargets.length === 0) {
      return {
        label: 'Нет слотов',
        cls: 'tm-sp-bad',
        net: -4,
        canAfford: getMegaCredits(p) >= COLONY_BUILD_COST,
        reasonRows: [{ text: 'Build Colony: нет свободных слотов', tone: 'negative', value: -4 }],
      };
    }

    var rv = {
      mcProd: Math.max(4, prodVal || 0),
      steelProd: Math.max(5, (prodVal || 0) * 1.5),
      tiProd: Math.max(6, (prodVal || 0) * 2.0),
      plantProd: Math.max(5, (prodVal || 0) * 1.5),
      energyProd: Math.max(5, (prodVal || 0) * 1.5),
      heatProd: Math.max(3, (prodVal || 0) * 0.8),
      card: 3.5,
      steel: 2,
      titanium: 3,
      plant: 1,
      energy: gensLeft > 1 ? 1.2 : 0.5,
      heat: 1,
      animal: 5,
      floater: 3,
      microbe: 2.5,
      ocean: 9,
    };
    var fleetsLeft = countReadyFleets(p);
    var players = g.players || [];
    var oppReady = 0;
    var handCards = p.cardsInHand || [];
    for (var pi = 0; pi < players.length; pi++) {
      var opp = players[pi];
      if (!opp || opp.color === myColor) continue;
      if (isPlayerPassed(g, opp)) continue;
      if (playerCanTradeNow(opp)) {
        oppReady += 1;
      }
    }

    var lateScale = gensLeft <= 2 ? 0.25 : gensLeft <= 4 ? 0.6 : 1;
    var best = null;
    for (var ci = 0; ci < openTargets.length; ci++) {
      var target = openTargets[ci];
      var cdata = (typeof TM_COLONY_DATA !== 'undefined') ? TM_COLONY_DATA[target.name] : null;
      if (!cdata) continue;
      var base = COLONY_BUILD_PRIORITY[target.name] != null ? COLONY_BUILD_PRIORITY[target.name] : 4;
      var buildMcBase = colonyBenefitMc(cdata.build, rv);
      var colonyBonusMcBase = colonyBenefitMc(cdata.bonus, rv);
      var supportCtx = resourceColonySupportContext(target.name, p, handCards);
      var resourceKind = RESOURCE_COLONY_TYPES[target.name];
      var buildAmount = parseBonusAmount(cdata.build, resourceKind);
      var colonyBonusAmount = parseBonusAmount(cdata.bonus, resourceKind);
      var buildMc = buildMcBase + buildAmount * supportCtx.deltaPerUnit;
      var colonyBonusMc = colonyBonusMcBase + colonyBonusAmount * supportCtx.deltaPerUnit;
      var ownerFactor = (0.6 + Math.min(2.6, (fleetsLeft + oppReady * 0.5) * 0.55)) * lateScale;
      var ownerFuture = colonyBonusMc * ownerFactor;
      var trackPos = target.trackPosition != null ? target.trackPosition : (target.track || 0);
      var immediateTrack = Math.max(0, Math.min(4, (trackPos || 0)));
      var contestCtx = contestPressureContext(g, target, p, rv, gensLeft);
      var contestPenalty = contestCtx.penalty || 0;
      var latePenalty = gensLeft <= 2 ? 5 : (gensLeft <= 4 ? 2 : 0);
      var total = Math.round((base + buildMc * lateScale + ownerFuture + immediateTrack - contestPenalty - latePenalty - COLONY_BUILD_COST) * 10) / 10;
      var supportImpact = Math.round(((buildMc - buildMcBase) * lateScale + ((colonyBonusMc - colonyBonusMcBase) * ownerFactor)) * 10) / 10;
      var rows = [];
      pushStructuredReason([], rows, 'Build Colony: ' + target.name + ' target +' + base, base);
      if (buildMc > 0.4) pushStructuredReason([], rows, 'Placement bonus +' + Math.round(buildMc * lateScale * 10) / 10, Math.round(buildMc * lateScale * 10) / 10);
      if (ownerFuture > 0.4) pushStructuredReason([], rows, 'Colony bonus future +' + Math.round(ownerFuture * 10) / 10, Math.round(ownerFuture * 10) / 10);
      if (immediateTrack > 0.4) pushStructuredReason([], rows, 'Track/fleet upside +' + immediateTrack, immediateTrack);
      if (Math.abs(supportImpact) >= 0.4 && supportCtx.reason) {
        pushStructuredReason([], rows, supportCtx.reason + ' ' + (supportImpact > 0 ? '+' : '−') + Math.abs(supportImpact), supportImpact, supportImpact > 0 ? 'positive' : 'negative');
      }
      if (contestPenalty > 0) pushStructuredReason([], rows, contestCtx.reason + ' −' + contestPenalty, -contestPenalty, 'negative');
      if (latePenalty > 0) pushStructuredReason([], rows, 'Late colony −' + latePenalty, -latePenalty, 'negative');

      if (!best || total > best.net) {
        best = {
          label: target.name + ' ' + (total >= 0 ? '+' : '') + Math.round(total),
          cls: total >= 2 ? 'tm-sp-good' : total >= -3 ? 'tm-sp-ok' : 'tm-sp-bad',
          net: total,
          canAfford: getMegaCredits(p) >= COLONY_BUILD_COST,
          reasonRows: rows,
        };
      }
    }
    return best;
  }

  function steelDiscount(baseCost, steel, stVal) {
    var disc = Math.min(steel, Math.floor(baseCost / stVal)) * stVal;
    return { eff: baseCost - disc, disc: disc };
  }

  function spScore(type, net, sc) {
    return Math.round(Math.min(sc.spScoreMax, Math.max(sc.spScoreMin, sc.spBases[type] + net * sc.spScales[type])));
  }

  function annotateSPvsHand(input) {
    var documentObj = input && input.documentObj;
    var spCards = input && input.spCards;
    var lastPriorityMap = input && input.lastPriorityMap;
    if (!documentObj || !spCards || !lastPriorityMap) return;

    documentObj.querySelectorAll('.tm-sp-vs-hand').forEach(function(el) { el.remove(); });

    var bestHandNet = -Infinity;
    var bestHandName = '';
    for (var cardName in lastPriorityMap) {
      if (!Object.prototype.hasOwnProperty.call(lastPriorityMap, cardName)) continue;
      var info = lastPriorityMap[cardName];
      if (!info || info.type !== 'play' || info.unplayable || !info.affordable) continue;
      var netVal = info.mcValue || 0;
      if (netVal > bestHandNet) {
        bestHandNet = netVal;
        bestHandName = cardName;
      }
    }

    if (bestHandNet === -Infinity) return;

    spCards.forEach(function(cardEl) {
      var badge = cardEl.querySelector('.tm-sp-badge');
      if (!badge) return;
      var spNetStr = badge.getAttribute('data-sp-net');
      if (spNetStr === null) return;
      var spNet = parseFloat(spNetStr);
      if (!(spNet > bestHandNet + 1)) return;

      var marker = documentObj.createElement('div');
      marker.className = 'tm-sp-vs-hand';
      var shortHand = bestHandName.length > 14 ? bestHandName.substring(0, 12) + '..' : bestHandName;
      marker.textContent = '\uD83C\uDFAF SP ' + (spNet >= 0 ? '+' : '') + spNet +
        ' > ' + shortHand + ' ' + (bestHandNet >= 0 ? '+' : '') + bestHandNet;
      marker.title = 'Стандартный проект выгоднее лучшей карты в руке (' + bestHandName + ')';
      cardEl.appendChild(marker);
    });
  }

  function rateStandardProjects(input) {
    var documentObj = input && input.documentObj;
    var dateNow = input && input.dateNow;
    var getPlayerVueData = input && input.getPlayerVueData;
    var detectMyCorp = input && input.detectMyCorp;
    var estimateGensLeft = input && input.estimateGensLeft;
    var ftnRow = input && input.ftnRow;
    var isGreeneryTile = input && input.isGreeneryTile;
    var getLastPriorityMap = input && input.getLastPriorityMap;
    var sc = input && input.sc;
    var externalSetReasonPayload = input && input.setReasonPayload;
    var externalMergeReasonRows = input && input.mergeReasonRows;
    var externalShowTooltip = input && input.showTooltip;
    var externalHideTooltip = input && input.hideTooltip;
    var externalScoreToTier = input && input.scoreToTier;
    if (!documentObj || typeof getPlayerVueData !== 'function' || typeof detectMyCorp !== 'function' ||
        typeof estimateGensLeft !== 'function' || typeof ftnRow !== 'function' ||
        typeof isGreeneryTile !== 'function' || typeof getLastPriorityMap !== 'function' || !sc) {
      return;
    }

    var now = typeof dateNow === 'function' ? dateNow() : Date.now();
    if (now - lastUpdateAt < 2000) return;

    var spCards = Array.from(documentObj.querySelectorAll('.card-standard-project'));
    if (spCards.length === 0) return;

    var pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer || !pv.game) return;

    var p = pv.thisPlayer;
    var g = pv.game;
    var mc = getMegaCredits(p);
    var heat = p.heat || 0;
    var steel = p.steel || 0;
    var stVal = p.steelValue || sc.defaultSteelVal;
    var gensLeft = estimateGensLeft(pv);
    var myCorp = detectMyCorp();
    var isHelion = myCorp === 'Helion';
    var spBudget = mc + (isHelion ? heat : 0);

    var gl = Math.max(0, Math.min(sc.maxGL, gensLeft));
    var row = ftnRow(gl);
    var trVal = row[0];
    var prodVal = row[1];
    var vpVal = row[2];

    var coloniesOwned = p.coloniesCount || 0;
    var fleetSize = p.fleetSize || 1;
    var tradesThisGen = p.tradesThisGeneration || 0;
    var tradesLeft = fleetSize - tradesThisGen;

    lastUpdateAt = now;

    spCards.forEach(function(cardEl) {
      var old = cardEl.querySelector('.tm-sp-badge');
      if (old) old.remove();

      var spType = detectSPType(cardEl);
      if (!spType) return;

      var label = '';
      var cls = 'tm-sp-bad';
      var net = 0;
      var canAfford = false;
      var maBonus = checkSPMilestoneAward({ spType: spType, pv: pv, isGreeneryTile: isGreeneryTile, sc: sc });
      var badgeReasonRows = [];

      if (spType === 'sell') {
        label = '1 MC/карта';
        cls = 'tm-sp-ok';
      } else if (spType === 'power') {
        var powerCost = (myCorp === 'Thorgate') ? sc.thorgatePowerCost : sc.spCosts.power;
        var epValue = Math.round(prodVal * 1.5);
        net = epValue - powerCost;
        canAfford = spBudget >= powerCost;
        if (gensLeft <= 2) {
          label = 'Поздно';
          cls = 'tm-sp-bad';
          pushStructuredReason([], badgeReasonRows, 'Электростанция: поздно', -Math.abs(net || 1), 'negative');
        } else {
          net += maBonus.bonus;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -4 ? 'tm-sp-ok' : 'tm-sp-bad';
          pushStructuredReason([], badgeReasonRows, 'Электростанция: прод ' + epValue + ' − ' + powerCost, net);
        }
      } else if (spType === 'asteroid') {
        if (g.temperature != null && g.temperature >= sc.tempMax) {
          label = 'Закрыто';
          cls = 'tm-sp-closed';
          pushStructuredReason([], badgeReasonRows, 'Астероид: глобал закрыт', -1, 'negative');
        } else {
          net = Math.round(trVal) - sc.spCosts.asteroid + maBonus.bonus;
          canAfford = spBudget >= sc.spCosts.asteroid;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
          pushStructuredReason([], badgeReasonRows, 'Астероид: TR ' + Math.round(trVal) + ' − ' + sc.spCosts.asteroid, net);
        }
      } else if (spType === 'aquifer') {
        if (g.oceans != null && g.oceans >= sc.oceansMax) {
          label = 'Закрыто';
          cls = 'tm-sp-closed';
          pushStructuredReason([], badgeReasonRows, 'Океан: глобал закрыт', -1, 'negative');
        } else {
          net = Math.round(trVal + 2) - sc.spCosts.aquifer + maBonus.bonus;
          canAfford = spBudget >= sc.spCosts.aquifer;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
          pushStructuredReason([], badgeReasonRows, 'Океан: TR+бонус ' + Math.round(trVal + 2) + ' − ' + sc.spCosts.aquifer, net);
        }
      } else if (spType === 'greenery') {
        var greeneryDiscount = steelDiscount(sc.spCosts.greenery, steel, stVal);
        var o2open = g.oxygenLevel != null && g.oxygenLevel < sc.oxyMax;
        var greeneryEV = Math.round(vpVal + (o2open ? trVal : 0) + 2);
        net = greeneryEV - greeneryDiscount.eff + maBonus.bonus;
        canAfford = spBudget + steel * stVal >= sc.spCosts.greenery;
        label = (net >= 0 ? '+' : '') + net + ' MC';
        if (greeneryDiscount.disc > 0) label += ' (⚒−' + greeneryDiscount.disc + ')';
        if (!o2open) label += ' VP';
        cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
        pushStructuredReason([], badgeReasonRows, 'Озеленение: VP+TR ' + greeneryEV + ' − ' + greeneryDiscount.eff, net);
      } else if (spType === 'city') {
        var cityDiscount = steelDiscount(sc.spCosts.city, steel, stVal);
        var cityEV = Math.round(vpVal * 2 + 3);
        net = cityEV - cityDiscount.eff + maBonus.bonus;
        canAfford = spBudget + steel * stVal >= sc.spCosts.city;
        label = (net >= 0 ? '+' : '') + net + ' MC';
        if (cityDiscount.disc > 0) label += ' (⚒−' + cityDiscount.disc + ')';
        cls = net >= 0 ? 'tm-sp-good' : net >= -6 ? 'tm-sp-ok' : 'tm-sp-bad';
        pushStructuredReason([], badgeReasonRows, 'Город: VP+прод ' + cityEV + ' − ' + cityDiscount.eff, net);
      } else if (spType === 'venus') {
        if (g.venusScaleLevel != null && g.venusScaleLevel >= sc.venusMax) {
          label = 'Закрыто';
          cls = 'tm-sp-closed';
          pushStructuredReason([], badgeReasonRows, 'Очистка: глобал закрыт', -1, 'negative');
        } else {
          net = Math.round(trVal) - sc.spCosts.venus + maBonus.bonus;
          canAfford = spBudget >= sc.spCosts.venus;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
          pushStructuredReason([], badgeReasonRows, 'Очистка: TR ' + Math.round(trVal) + ' − ' + sc.spCosts.venus, net);
        }
      } else if (spType === 'buffer') {
        if (g.venusScaleLevel != null && g.venusScaleLevel >= sc.venusMax) {
          label = 'Закрыто';
          cls = 'tm-sp-closed';
          pushStructuredReason([], badgeReasonRows, 'Буфер: глобал закрыт', -1, 'negative');
        } else {
          net = Math.round(trVal) - sc.spCosts.buffer + maBonus.bonus;
          canAfford = spBudget >= sc.spCosts.buffer;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : 'tm-sp-ok';
          pushStructuredReason([], badgeReasonRows, 'Буфер: TR ' + Math.round(trVal) + ' − ' + sc.spCosts.buffer, net);
        }
      } else if (spType === 'trade') {
        if (tradesLeft > 0 && coloniesOwned > 0) {
          label = tradesLeft + ' trade, ' + coloniesOwned + ' кол.';
          cls = 'tm-sp-good';
          pushStructuredReason([], badgeReasonRows, 'Trade: ' + tradesLeft + ' trade, ' + coloniesOwned + ' кол.', 4);
        } else if (tradesLeft > 0) {
          label = tradesLeft + ' trade';
          cls = 'tm-sp-ok';
          pushStructuredReason([], badgeReasonRows, 'Trade: ' + tradesLeft + ' trade', 1);
        } else {
          label = 'Нет trade';
          cls = 'tm-sp-bad';
          pushStructuredReason([], badgeReasonRows, 'Trade: нет trade', -2, 'negative');
        }
      } else if (spType === 'colony') {
        var colonyAdvice = bestColonyBuildTarget(pv, gensLeft, prodVal);
        if (colonyAdvice) {
          label = colonyAdvice.label;
          cls = colonyAdvice.cls;
          net = colonyAdvice.net;
          canAfford = colonyAdvice.canAfford;
          badgeReasonRows = colonyAdvice.reasonRows || [];
        }
      } else if (spType === 'lobby') {
        var myDelegates = countMyDelegates(g, p.color || '');
        label = myDelegates + ' дел.';
        cls = myDelegates < 3 ? 'tm-sp-good' : myDelegates < 5 ? 'tm-sp-ok' : 'tm-sp-bad';
        pushStructuredReason([], badgeReasonRows, 'Лобби: ' + myDelegates + ' делегатов', myDelegates < 3 ? 3 : myDelegates < 5 ? 1 : -1);
      }

      if (maBonus.reasons.length > 0) {
        label += ' ' + maBonus.reasons[0];
        if (maBonus.bonus >= 5) cls = 'tm-sp-good';
      }
      if (maBonus.reasonRows && maBonus.reasonRows.length > 0) {
        badgeReasonRows = (typeof externalMergeReasonRows === 'function')
          ? externalMergeReasonRows(badgeReasonRows, maBonus.reasonRows)
          : mergeReasonRows(badgeReasonRows, maBonus.reasonRows);
      }

      if (!label) return;

      var badge = documentObj.createElement('div');
      badge.className = 'tm-sp-badge ' + cls;
      badge.textContent = label;
      cardEl.style.position = 'relative';
      cardEl.appendChild(badge);

      if (typeof net === 'number' && canAfford) {
        badge.setAttribute('data-sp-net', net);
        badge.setAttribute('data-sp-type', spType);
      }
      setReasonPayload(badge, { reasonRows: badgeReasonRows }, externalSetReasonPayload);
      setReasonPayload(cardEl, { reasonRows: badgeReasonRows }, externalSetReasonPayload);
      if (typeof externalShowTooltip === 'function' && typeof externalHideTooltip === 'function' && !cardEl.hasAttribute('data-tm-tip')) {
        var tipName = ((cardEl.querySelector('.card-title') || {}).textContent || SP_NAMES[spType] || label || '').trim();
        var tipScore = typeof net === 'number'
          ? spScore(spType, net, sc)
          : (cls.indexOf('good') !== -1 ? 68 : (cls.indexOf('ok') !== -1 ? 58 : 42));
        var tipTier = typeof externalScoreToTier === 'function' ? externalScoreToTier(tipScore) : 'C';
        var tipData = { s: tipScore, t: tipTier, dr: 'Стандартный проект' };
        cardEl.setAttribute('data-tm-tip', '1');
        cardEl.addEventListener('mouseenter', function(e) { externalShowTooltip(e, tipName, tipData); });
        cardEl.addEventListener('mouseleave', externalHideTooltip);
      }
    });

    annotateSPvsHand({
      documentObj: documentObj,
      spCards: spCards,
      lastPriorityMap: getLastPriorityMap()
    });
  }

  function computeAllSP(input) {
    var pv = input && input.pv;
    var gensLeft = input && input.gensLeft;
    var myCorp = input && input.myCorp;
    var ftnRow = input && input.ftnRow;
    var isGreeneryTile = input && input.isGreeneryTile;
    var sc = input && input.sc;
    if (!pv || !pv.thisPlayer || !pv.game || typeof ftnRow !== 'function' ||
        typeof isGreeneryTile !== 'function' || !sc) {
      return null;
    }

    var p = pv.thisPlayer;
    var g = pv.game;
    var steel = p.steel || 0;
    var stVal = p.steelValue || sc.defaultSteelVal;
    var gl = Math.max(0, Math.min(sc.maxGL, gensLeft));
    var row = ftnRow(gl);
    var trVal = row[0];
    var prodVal = row[1];
    var vpVal = row[2];

    var all = [];
    var best = null;
    function consider(type, net, detail) {
      var ma = checkSPMilestoneAward({ spType: type, pv: pv, isGreeneryTile: isGreeneryTile, sc: sc });
      net += ma.bonus;
      var adjS = spScore(type, net, sc);
      var reasonRows = [];
      if (detail) {
        reasonRows.push({ text: detail, tone: net >= 0 ? 'positive' : 'negative', value: net });
      }
      if (ma.reasonRows && ma.reasonRows.length > 0) {
        reasonRows = mergeReasonRows(reasonRows, ma.reasonRows);
      }
      var entry = {
        type: type,
        name: SP_NAMES[type],
        icon: SP_ICONS[type],
        cost: sc.spCosts[type],
        adj: adjS,
        net: net,
        detail: detail || '',
        reasons: reasonRows.map(reasonTextPayload),
        reasonRows: reasonRows
      };
      if (ma.bonus) entry.detail += (entry.detail ? ', ' : '') + 'веха/нагр +' + ma.bonus;
      all.push(entry);
      if (!best || adjS > best.score) best = { name: SP_NAMES[type], net: net, score: adjS };
    }

    if (gensLeft > 2) {
      var pwCost = (myCorp === 'Thorgate') ? sc.thorgatePowerCost : sc.spCosts.power;
      var pwVal = Math.round(prodVal * 1.5);
      var pwNet = pwVal - pwCost;
      consider('power', pwNet, 'прод ' + pwVal + ' − ' + pwCost);
    }

    if (g.temperature == null || g.temperature < sc.tempMax) {
      consider('asteroid', Math.round(trVal) - sc.spCosts.asteroid, 'TR ' + Math.round(trVal) + ' − ' + sc.spCosts.asteroid);
    }

    if (g.oceans == null || g.oceans < sc.oceansMax) {
      var aqVal = Math.round(trVal + 2);
      consider('aquifer', aqVal - sc.spCosts.aquifer, 'TR+бонус ' + aqVal + ' − ' + sc.spCosts.aquifer);
    }

    {
      var grSD = steelDiscount(sc.spCosts.greenery, steel, stVal);
      var o2open = g.oxygenLevel == null || g.oxygenLevel < sc.oxyMax;
      var grEV = Math.round(vpVal + (o2open ? trVal : 0) + 2);
      var grDetail = 'VP+TR ' + grEV + ' − ' + grSD.eff;
      if (grSD.disc > 0) grDetail += ' (сталь −' + grSD.disc + ')';
      consider('greenery', grEV - grSD.eff, grDetail);
    }

    {
      var ciSD = steelDiscount(sc.spCosts.city, steel, stVal);
      var ciEV = Math.round(vpVal * 2 + 3);
      var ciDetail = 'VP+прод ' + ciEV + ' − ' + ciSD.eff;
      if (ciSD.disc > 0) ciDetail += ' (сталь −' + ciSD.disc + ')';
      consider('city', ciEV - ciSD.eff, ciDetail);
    }

    if (g.venusScaleLevel == null || g.venusScaleLevel < sc.venusMax) {
      consider('venus', Math.round(trVal) - sc.spCosts.venus, 'TR ' + Math.round(trVal) + ' − ' + sc.spCosts.venus);
    }

    if (g.venusScaleLevel == null || g.venusScaleLevel < sc.venusMax) {
      consider('buffer', Math.round(trVal) - sc.spCosts.buffer, 'TR ' + Math.round(trVal) + ' − ' + sc.spCosts.buffer);
    }

    if (g.turmoil) {
      var myDel = countMyDelegates(g, p.color || '');
      var delBonus = myDel < 3 ? 5 : myDel < 5 ? 3 : 1;
      consider('lobby', delBonus, 'влияние +' + delBonus);
    }

    all.sort(function(a, b) { return b.adj - a.adj; });
    return { all: all, best: best };
  }

  global.TM_CONTENT_STANDARD_PROJECTS = {
    detectSPType: detectSPType,
    checkSPMilestoneAward: checkSPMilestoneAward,
    countMyDelegates: countMyDelegates,
    steelDiscount: steelDiscount,
    rateStandardProjects: rateStandardProjects,
    computeAllSP: computeAllSP
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
