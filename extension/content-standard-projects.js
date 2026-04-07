// TM Tier Overlay - Content standard projects helpers
(function(global) {
  'use strict';

  var lastUpdateAt = 0;
  var SP_NAMES = { power: 'Электростанция', asteroid: 'Астероид', aquifer: 'Океан', greenery: 'Озеленение', city: 'Город', venus: 'Очистка', buffer: 'Буфер', lobby: 'Лобби' };
  var SP_ICONS = { power: '⚡', asteroid: '🌡', aquifer: '🌊', greenery: '🌿', city: '🏙', venus: '♀', buffer: '♀B', lobby: '🏛' };

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
    var g = pv && pv.game;
    var p = pv && pv.thisPlayer;
    if (!g || !p || typeof isGreeneryTile !== 'function' || !sc) return { bonus: 0, reasons: [] };

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
            if (myGreens >= 2) { bonus += sc.spMilestoneReach; reasons.push('→ ' + msName + '! (' + myGreens + '/3)'); }
            else if (myGreens >= 1) { bonus += sc.spMilestoneClose; reasons.push(msName + ' ' + myGreens + '/3'); }
          }

          if (spType === 'city' && msName === 'Mayor') {
            var myCities = p.citiesCount || 0;
            if (myCities >= 2) { bonus += sc.spMilestoneReach; reasons.push('→ Mayor! (' + myCities + '/3)'); }
            else if (myCities >= 1) { bonus += sc.spMilestoneClose; reasons.push('Mayor ' + myCities + '/3'); }
          }

          if (spType === 'power') {
            if (msName === 'Specialist') {
              var maxProd = Math.max(p.megaCreditProduction || 0, p.steelProduction || 0, p.titaniumProduction || 0, p.plantProduction || 0, p.energyProduction || 0, p.heatProduction || 0);
              var epAfter = (p.energyProduction || 0) + 1;
              if (epAfter >= 10 && maxProd < 10) { bonus += sc.spMilestoneReach; reasons.push('→ Specialist!'); }
            }
            if (msName === 'Energizer') {
              var ep = p.energyProduction || 0;
              if (ep + 1 >= 6 && ep < 6) { bonus += sc.spMilestoneReach; reasons.push('→ Energizer!'); }
              else if (ep >= 4) { bonus += sc.spMilestoneClose; reasons.push('Energizer ' + ep + '/6'); }
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
          if (myScore >= bestOpp - 1) { bonus += sc.spAwardLead; reasons.push(aw.name + ' ' + myScore + '→' + (myScore + 1)); }
        }
        if (spType === 'city' && (aw.name === 'Suburbian' || aw.name === 'Urbanist')) {
          if (myScore >= bestOpp - 1) { bonus += sc.spAwardLead; reasons.push(aw.name + ' ' + myScore + '→' + (myScore + 1)); }
        }
        if (spType === 'aquifer' && aw.name === 'Landlord') {
          if (myScore >= bestOpp - 1) { bonus += sc.spAwardContrib; reasons.push('Landlord +1'); }
        }
        if ((spType === 'asteroid' || spType === 'aquifer' || spType === 'greenery' || spType === 'venus' || spType === 'buffer') && aw.name === 'Benefactor') {
          if (myScore >= bestOpp - 2) { bonus += sc.spAwardContrib; reasons.push('Benefactor TR+1'); }
        }
        if (spType === 'power' && (aw.name === 'Industrialist' || aw.name === 'Electrician')) {
          if (myScore >= bestOpp - 1) { bonus += sc.spAwardContrib; reasons.push(aw.name + ' +1'); }
        }
      }
    }

    return { bonus: bonus, reasons: reasons };
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
    var mc = p.megaCredits || 0;
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
        } else {
          net += maBonus.bonus;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -4 ? 'tm-sp-ok' : 'tm-sp-bad';
        }
      } else if (spType === 'asteroid') {
        if (g.temperature != null && g.temperature >= sc.tempMax) {
          label = 'Закрыто';
          cls = 'tm-sp-closed';
        } else {
          net = Math.round(trVal) - sc.spCosts.asteroid + maBonus.bonus;
          canAfford = spBudget >= sc.spCosts.asteroid;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
        }
      } else if (spType === 'aquifer') {
        if (g.oceans != null && g.oceans >= sc.oceansMax) {
          label = 'Закрыто';
          cls = 'tm-sp-closed';
        } else {
          net = Math.round(trVal + 2) - sc.spCosts.aquifer + maBonus.bonus;
          canAfford = spBudget >= sc.spCosts.aquifer;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
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
      } else if (spType === 'city') {
        var cityDiscount = steelDiscount(sc.spCosts.city, steel, stVal);
        var cityEV = Math.round(vpVal * 2 + 3);
        net = cityEV - cityDiscount.eff + maBonus.bonus;
        canAfford = spBudget + steel * stVal >= sc.spCosts.city;
        label = (net >= 0 ? '+' : '') + net + ' MC';
        if (cityDiscount.disc > 0) label += ' (⚒−' + cityDiscount.disc + ')';
        cls = net >= 0 ? 'tm-sp-good' : net >= -6 ? 'tm-sp-ok' : 'tm-sp-bad';
      } else if (spType === 'venus') {
        if (g.venusScaleLevel != null && g.venusScaleLevel >= sc.venusMax) {
          label = 'Закрыто';
          cls = 'tm-sp-closed';
        } else {
          net = Math.round(trVal) - sc.spCosts.venus + maBonus.bonus;
          canAfford = spBudget >= sc.spCosts.venus;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : net >= -5 ? 'tm-sp-ok' : 'tm-sp-bad';
        }
      } else if (spType === 'buffer') {
        if (g.venusScaleLevel != null && g.venusScaleLevel >= sc.venusMax) {
          label = 'Закрыто';
          cls = 'tm-sp-closed';
        } else {
          net = Math.round(trVal) - sc.spCosts.buffer + maBonus.bonus;
          canAfford = spBudget >= sc.spCosts.buffer;
          label = (net >= 0 ? '+' : '') + net + ' MC';
          cls = net >= 0 ? 'tm-sp-good' : 'tm-sp-ok';
        }
      } else if (spType === 'trade') {
        if (tradesLeft > 0 && coloniesOwned > 0) {
          label = tradesLeft + ' trade, ' + coloniesOwned + ' кол.';
          cls = 'tm-sp-good';
        } else if (tradesLeft > 0) {
          label = tradesLeft + ' trade';
          cls = 'tm-sp-ok';
        } else {
          label = 'Нет trade';
          cls = 'tm-sp-bad';
        }
      } else if (spType === 'colony') {
        if (coloniesOwned < 3) {
          label = (coloniesOwned + 1) + '-я кол.';
          cls = coloniesOwned === 0 ? 'tm-sp-good' : 'tm-sp-ok';
        } else {
          label = 'Макс. колоний';
          cls = 'tm-sp-bad';
        }
      } else if (spType === 'lobby') {
        var myDelegates = countMyDelegates(g, p.color || '');
        label = myDelegates + ' дел.';
        cls = myDelegates < 3 ? 'tm-sp-good' : myDelegates < 5 ? 'tm-sp-ok' : 'tm-sp-bad';
      }

      if (maBonus.reasons.length > 0) {
        label += ' ' + maBonus.reasons[0];
        if (maBonus.bonus >= 5) cls = 'tm-sp-good';
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
      var entry = { type: type, name: SP_NAMES[type], icon: SP_ICONS[type], cost: sc.spCosts[type], adj: adjS, net: net, detail: detail || '' };
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
