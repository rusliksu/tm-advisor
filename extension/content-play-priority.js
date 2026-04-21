// TM Tier Overlay - Content play priority helpers
(function(global) {
  'use strict';

  var lastPriorityMap = {};
  var offeredCorpsCache = { documentObj: null, at: 0, names: null };
  var visiblePreludeNamesCache = { documentObj: null, at: 0, names: null };
  var OFFERED_CORPS_CACHE_MS = 300;
  var VISIBLE_PRELUDE_NAMES_CACHE_MS = 300;

  function formatCorpBoostReason(corpName, cardName, boost) {
    var sign = boost > 0 ? '+' : '';
    if (corpName === 'Septem Tribus') {
      var data = typeof TM_RATINGS !== 'undefined' ? TM_RATINGS[cardName] : null;
      var text = data ? [data.e || '', data.w || '', data.dr || ''].join(' ').toLowerCase() : '';
      if (text.includes('influence') || text.includes('влия')) return 'Septem: influence ' + sign + boost;
      if (text.includes('delegate') || text.includes('делегат')) return 'Septem: delegates ' + sign + boost;
    }
    if (cardName === 'Heat Trappers') {
      if (corpName === 'Thorgate') return 'Thorgate: cheap power ' + sign + boost;
      if (corpName === 'Cheung Shing MARS') return 'Cheung: cheap building ' + sign + boost;
    }
    if (cardName === 'Suitable Infrastructure') {
      if (corpName === 'Robinson Industries') return 'Robinson: prod action ' + sign + boost;
      if (corpName === 'Manutech') return 'Manutech: prod cashout ' + sign + boost;
    }
    return corpName.split(' ')[0] + ' ' + sign + boost;
  }

  function formatShortReasonName(name) {
    var label = (name || '').trim();
    if (!label) return '';
    if (label.length <= 28) return label;
    return label.substring(0, 27) + '…';
  }

  function formatCorpProjectReason(count, value) {
    var absCount = Math.abs(count);
    var mod10 = absCount % 10;
    var mod100 = absCount % 100;
    var noun = (mod10 === 1 && mod100 !== 11)
      ? 'проект под корпу'
      : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
        ? 'проекта под корпу'
        : 'проектов под корпу';
    return count + ' ' + noun + ' ' + (value >= 0 ? '+' : '') + value;
  }

  function reasonsMentionName(reasons, name) {
    if (!Array.isArray(reasons) || !name) return false;
    var exact = String(name);
    var short = formatShortReasonName(exact);
    return reasons.some(function(reason) {
      return reason.indexOf(exact) !== -1 || (short && reason.indexOf(short) !== -1);
    });
  }

  function scoreToTier(score) {
    if (score >= 90) return 'S';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 35) return 'D';
    return 'F';
  }

  function normalizeOpeningHandBias(rawBias) {
    if (typeof rawBias !== 'number' || !isFinite(rawBias) || rawBias === 0) return 0;
    var scaled = Math.round(rawBias * 0.6);
    if (scaled === 0) scaled = rawBias > 0 ? 1 : -1;
    return Math.max(-5, Math.min(5, scaled));
  }

  function isOpeningHandContext(input) {
    var ctx = input && input.ctx;
    var getPlayerVueData = input && input.getPlayerVueData;
    if (ctx && ctx._openingHand != null) return !!ctx._openingHand;
    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    var phase = pv && pv.game ? pv.game.phase : '';
    return phase === 'initial_drafting' || phase === 'corporationsDrafting';
  }

  function getOpeningHandBias(input) {
    var cardName = input && input.cardName;
    var data = input && input.data;
    var ctx = input && input.ctx;
    var getPlayerVueData = input && input.getPlayerVueData;
    var getCardTypeByName = input && input.getCardTypeByName;
    if (cardName && typeof getCardTypeByName === 'function' && getCardTypeByName(cardName) === 'prelude') return 0;
    if (!data || typeof data.o !== 'number') return 0;
    return isOpeningHandContext({ ctx: ctx, getPlayerVueData: getPlayerVueData }) ? normalizeOpeningHandBias(data.o) : 0;
  }

  function detectOfferedCorps(input) {
    var documentObj = input && input.documentObj;
    var ratings = input && input.ratings;
    var tagTriggers = input && input.tagTriggers;
    var corpDiscounts = input && input.corpDiscounts;

    var offeredCorps = [];
    if (!documentObj) return offeredCorps;

    var now = Date.now();
    if (offeredCorpsCache.names &&
        offeredCorpsCache.documentObj === documentObj &&
        now - offeredCorpsCache.at < OFFERED_CORPS_CACHE_MS) {
      return offeredCorpsCache.names.slice();
    }

    var level1 = [];
    var level2 = [];
    var level3 = [];
    documentObj.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
      var cn = el.getAttribute('data-tm-card');
      if (!cn) return;
      if (el.querySelector('.card-title.is-corporation, .card-corporation-logo, .corporation-label') ||
          (el.closest('.select-corporation') || el.closest('[class*="corporation"]'))) {
        level1.push(cn);
      }

      var d = ratings ? ratings[cn] : null;
      if (d && d.e && (d.e.includes('Корп') || d.e.includes('Corp') || d.e.includes('Стартовый') || d.e.includes('Start'))) {
        level2.push(cn);
      }

      if (cn && ((tagTriggers && tagTriggers[cn]) || (corpDiscounts && corpDiscounts[cn]))) {
        level3.push(cn);
      }
    });

    offeredCorps = level1.length > 0 ? level1 : (level2.length > 0 ? level2 : level3);
    offeredCorpsCache = {
      documentObj: documentObj,
      at: now,
      names: offeredCorps.slice()
    };
    return offeredCorps;
  }

  function getVisiblePreludeNames(input) {
    var getPlayerVueData = input && input.getPlayerVueData;
    var cardN = input && input.cardN;
    var documentObj = input && input.documentObj;

    var now = Date.now();
    if (visiblePreludeNamesCache.names &&
        visiblePreludeNamesCache.documentObj === documentObj &&
        now - visiblePreludeNamesCache.at < VISIBLE_PRELUDE_NAMES_CACHE_MS) {
      return visiblePreludeNamesCache.names.slice();
    }

    var preludes = [];
    var seen = new Set();
    function finish() {
      visiblePreludeNamesCache = {
        documentObj: documentObj || null,
        at: now,
        names: preludes.slice()
      };
      return preludes;
    }
    function remember(name) {
      if (!name || seen.has(name)) return;
      seen.add(name);
      preludes.push(name);
    }
    function rememberList(cards) {
      if (!Array.isArray(cards)) return;
      for (var i = 0; i < cards.length; i++) remember(typeof cardN === 'function' ? cardN(cards[i]) : cards[i]);
    }

    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    if (pv) {
      rememberList(pv.dealtPreludeCards);
      rememberList(pv.preludeCardsInHand);
    }
    if (preludes.length > 0) return finish();

    if (documentObj) {
      var preludeRoot = typeof documentObj.querySelector === 'function'
        ? documentObj.querySelector('.wf-component--select-prelude')
        : null;
      if (preludeRoot) {
        preludeRoot.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
          remember(el.getAttribute('data-tm-card'));
        });
      } else {
        documentObj.querySelectorAll('.prelude-label').forEach(function(label) {
          var el = label.closest ? label.closest('.card-container[data-tm-card]') : null;
          if (el) remember(el.getAttribute('data-tm-card'));
        });
      }
    }
    return finish();
  }

  function rewriteCaretakerRequirementReason(reasons, penalty) {
    if (!Array.isArray(reasons) || penalty <= 0) return false;
    for (var i = 0; i < reasons.length; i++) {
      if (/^Req далеко temperature [\-−]\d+/.test(reasons[i])) {
        reasons[i] = 'Caretaker ждёт 0°C −' + penalty;
        return true;
      }
    }
    return false;
  }

  function getVisibleColonyNames(input) {
    var activeOnly = input && input.activeOnly;
    var getPlayerVueData = input && input.getPlayerVueData;

    var colonies = [];
    var seen = new Set();
    function remember(name) {
      if (!name || seen.has(name)) return;
      seen.add(name);
      colonies.push(name);
    }

    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    if (pv && pv.game && Array.isArray(pv.game.colonies)) {
      for (var i = 0; i < pv.game.colonies.length; i++) {
        var col = pv.game.colonies[i];
        if (!col || !col.name) continue;
        if (activeOnly && col.isActive === false) continue;
        remember(col.name);
      }
    }
    return colonies;
  }

  function getRequirementReasonParam(text) {
    if (!text) return '';
    var m = text.match(/^Req (?:\d+ шагов|далеко) ([a-z]+)/i);
    return m ? m[1].toLowerCase() : '';
  }

  function isSpecificRequirementReasonText(text) {
    if (!text) return false;
    return /^Req \d+ шагов /.test(text) ||
      /^Req почти /.test(text) ||
      /^Req ~\d+ пок\./.test(text) ||
      text.indexOf('Нет ') === 0 ||
      text.indexOf('Нужно ') === 0 ||
      text.indexOf('Окно') === 0 ||
      text.indexOf('Окно закрыто') !== -1;
  }

  function isGenericFarRequirementReasonText(text) {
    if (!text) return false;
    return /^Req далеко(?: [a-z]+)? /.test(text) || /^Req далеко \(/.test(text);
  }

  function cleanupRequirementReasons(reasons) {
    if (!reasons || reasons.length === 0) return reasons || [];
    var specificReqReasons = reasons.filter(isSpecificRequirementReasonText);
    if (specificReqReasons.length === 0) return reasons;

    var specificReqParams = new Set();
    for (var sri = 0; sri < specificReqReasons.length; sri++) {
      var reqParam = getRequirementReasonParam(specificReqReasons[sri]);
      if (reqParam) specificReqParams.add(reqParam);
    }

    return reasons.filter(function(text) {
      if (!isGenericFarRequirementReasonText(text)) return true;
      var param = getRequirementReasonParam(text);
      if (!param) return false;
      return !(specificReqParams.size === 0 || specificReqParams.has(param));
    });
  }

  function getCorpReasonAliases(name) {
    if (!name) return [];
    var aliases = [];
    function addAlias(alias) {
      if (!alias || aliases.indexOf(alias) !== -1) return;
      aliases.push(alias);
    }
    addAlias(String(name).trim());
    addAlias(String(name).trim().split(/\s+/)[0]);
    return aliases;
  }

  function isHardRequirementReasonText(text) {
    if (!text) return false;
    if (text.indexOf('Окно закрыто') >= 0 || text.indexOf('Req далеко') === 0 || text.indexOf('Нет ') === 0 || text.indexOf('Нужно ') === 0) return true;
    var stepM = text.match(/^Req (\d+) шагов /);
    return !!(stepM && parseInt(stepM[1], 10) >= 3);
  }

  function isSoftNearRequirementReasonText(text) {
    if (!text) return false;
    return /^Нужно 1 .+ сейчас [\-−]\d+/.test(text);
  }

  function getInitialDraftRatingScore(input) {
    var name = input && input.name;
    var fallback = input && input.fallback;
    var resolveCorpName = input && input.resolveCorpName;
    var ratings = input && input.ratings;
    var ratingsRaw = input && input.ratingsRaw;
    var baseCardName = input && input.baseCardName;
    var normalizeOpeningHandBiasFn = input && input.normalizeOpeningHandBias;
    var getCardTypeByName = input && input.getCardTypeByName;

    var toBaseCardName = typeof baseCardName === 'function' ? baseCardName : function(n) { return n; };
    var resolved = typeof resolveCorpName === 'function' ? (resolveCorpName(name) || name) : name;
    var raw = (ratings && (ratings[resolved] || ratings[toBaseCardName(resolved)]))
      || (ratingsRaw && (ratingsRaw[resolved] || ratingsRaw[toBaseCardName(resolved)]));
    if (raw && typeof raw.s === 'number') {
      var openingBias = 0;
      if (!(name && typeof getCardTypeByName === 'function' && getCardTypeByName(name) === 'prelude')) {
        openingBias = typeof normalizeOpeningHandBiasFn === 'function' ? normalizeOpeningHandBiasFn(raw.o) : normalizeOpeningHandBias(raw.o);
      }
      return raw.s + openingBias;
    }
    return fallback == null ? 55 : fallback;
  }

  function getInitialDraftInfluence(input) {
    var score = input && input.score;
    var minWeight = input && input.minWeight;
    var maxWeight = input && input.maxWeight;
    var safeScore = typeof score === 'number' ? score : 55;
    var clamped = Math.max(45, Math.min(85, safeScore));
    var ratio = (clamped - 45) / 40;
    return minWeight + (maxWeight - minWeight) * ratio;
  }

  function withForcedCorpContext(input) {
    var baseCtx = input && input.baseCtx;
    var corpName = input && input.corpName;
    if (!baseCtx) return baseCtx;
    var cloned = Object.assign({}, baseCtx);
    cloned._myCorps = corpName ? [corpName] : [];
    return cloned;
  }

  function computeReqPriority(input) {
    var cardEl = input && input.cardEl;
    var pv = input && input.pv;
    var ctx = input && input.ctx;
    var getProductionFloorStatus = input && input.getProductionFloorStatus;
    var evaluateBoardRequirements = input && input.evaluateBoardRequirements;
    var detectMyCorps = input && input.detectMyCorps;
    var getRequirementFlexSteps = input && input.getRequirementFlexSteps;
    var getBoardRequirementDisplayName = input && input.getBoardRequirementDisplayName;
    var sc = input && input.sc;

    var result = { penalty: 0, unplayable: false, hardBlocked: false, reasons: [] };
    if (!cardEl || !pv || !pv.game || !sc) return result;
    var cardName0 = cardEl.getAttribute('data-tm-card') || '';
    var prodFloor = typeof getProductionFloorStatus === 'function'
      ? getProductionFloorStatus(cardName0, ctx)
      : { unplayable: false, reasons: [] };
    if (prodFloor.unplayable) {
      result.unplayable = true;
      for (var pfi0 = 0; pfi0 < prodFloor.reasons.length; pfi0++) {
        result.reasons.push(prodFloor.reasons[pfi0].replace('Невозможно сыграть: ', 'Не сейчас: '));
      }
    }
    var reqEl = cardEl.querySelector('.card-requirements, .card-requirement');
    if (!reqEl) return result;

    var reqText = (reqEl.textContent || '').trim();
    var boardReqs = typeof evaluateBoardRequirements === 'function'
      ? evaluateBoardRequirements(reqText, ctx, pv)
      : null;
    var isMaxReq = /max/i.test(reqText);
    var gTemp = pv.game.temperature;
    var gOxy = pv.game.oxygenLevel;
    var gVenus = pv.game.venusScaleLevel;
    var gOceans = pv.game.oceans;

    var myCorpsReq = typeof detectMyCorps === 'function' ? detectMyCorps() : [];
    var reqFlex = typeof getRequirementFlexSteps === 'function'
      ? getRequirementFlexSteps(cardName0, myCorpsReq)
      : { any: 0, venus: 0 };
    var reqBonus = reqFlex.any || 0;
    var venusReqBonus = (reqFlex.any || 0) + (reqFlex.venus || 0);

    if (isMaxReq) {
      var tmM = reqText.match(/([\-\d]+)\s*°?C/i);
      var oxM = reqText.match(/(\d+)\s*%?\s*O/i);
      var vnM = reqText.match(/(\d+)\s*%?\s*Venus/i);
      if (tmM && typeof gTemp === 'number' && gTemp > parseInt(tmM[1]) + reqBonus * 2) { result.unplayable = true; result.hardBlocked = true; }
      if (oxM && typeof gOxy === 'number' && gOxy > parseInt(oxM[1]) + reqBonus) { result.unplayable = true; result.hardBlocked = true; }
      if (vnM && gVenus != null && gVenus > parseInt(vnM[1]) + venusReqBonus * 2) { result.unplayable = true; result.hardBlocked = true; }
    } else {
      var tmM2 = reqText.match(/([\-\d]+)\s*°?C/i);
      var oxM2 = reqText.match(/(\d+)\s*%?\s*O/i);
      var ocM2 = reqText.match(/(\d+)\s*ocean/i);
      var vnM2 = reqText.match(/(\d+)\s*%?\s*Venus/i);

      var maxGap = 0;
      if (tmM2 && typeof gTemp === 'number') { var need = parseInt(tmM2[1]) - reqBonus * 2; var gap = (need - gTemp) / 2; if (gap > maxGap) maxGap = gap; }
      if (oxM2 && typeof gOxy === 'number') { var need2 = parseInt(oxM2[1]) - reqBonus; var gap2 = need2 - gOxy; if (gap2 > maxGap) maxGap = gap2; }
      if (ocM2 && typeof gOceans === 'number') { var need3 = parseInt(ocM2[1]); var gap3 = need3 - gOceans; if (gap3 > maxGap) maxGap = gap3; }
      if (vnM2 && gVenus != null) { var need4 = parseInt(vnM2[1]) - venusReqBonus * 2; var gap4 = (need4 - gVenus) / 2; if (gap4 > maxGap) maxGap = gap4; }

      if (maxGap > 0) {
        result.penalty += Math.min(sc.ppReqGapCap, Math.round(maxGap * sc.ppReqGapMul));
        if (maxGap <= 1) result.reasons.push('Req почти (' + Math.ceil(maxGap) + ' подн.)');
        else result.reasons.push('Req далеко (' + Math.ceil(maxGap) + ' подн.)');
      }

      var tagReqM = (!(boardReqs && boardReqs.reqs && boardReqs.reqs.length > 0))
        ? reqText.match(/(\d+)\s*(science|earth|venus|jovian|building|space|plant|microbe|animal|power|city|event|mars|wild)/i)
        : null;
      if (tagReqM) {
        var tagReqCount = parseInt(tagReqM[1]);
        var tagReqName = tagReqM[2].toLowerCase();
        var realExact = (ctx && ctx.tagsWithHand) ? (ctx.tagsWithHand[tagReqName] || 0) : ((ctx && ctx.tags) ? (ctx.tags[tagReqName] || 0) : 0);
        var realWild = tagReqName !== 'wild' && ctx
          ? (ctx.tagsWithHand ? (ctx.tagsWithHand.wild || 0) : (ctx.tags ? (ctx.tags.wild || 0) : 0))
          : 0;
        var realCount = realExact + realWild;
        var projExact = (ctx && ctx.tagsProjected) ? (ctx.tagsProjected[tagReqName] || 0) : realExact;
        var projWild = tagReqName !== 'wild' && ctx
          ? (ctx.tagsProjected ? (ctx.tagsProjected.wild || 0) : realWild)
          : 0;
        var projCount = projExact + projWild;
        var tagGap = tagReqCount - realCount;
        if (tagGap > 0) {
          var projGap = Math.max(0, tagReqCount - projCount);
          var penaltyMul = (projGap <= 0) ? 0.5 : 1.0;
          result.penalty += Math.round(Math.min(sc.ppTagReqCap, tagGap * sc.ppTagReqMul) * penaltyMul);
          result.reasons.push('Нужно ' + tagGap + ' ' + tagReqName + ' тег(ов)' + (projGap <= 0 ? ' (прогноз ок)' : ''));
        }
      }
    }

    if (boardReqs && !boardReqs.metNow) {
      result.unplayable = true;
      for (var bri = 0; bri < boardReqs.unmet.length; bri++) {
        var breq = boardReqs.unmet[bri];
        var boardPrioPenalty = breq.missing * (breq.key === 'colonies' ? 8 : breq.key === 'city' ? 6 : 5);
        result.penalty += boardPrioPenalty;
        result.reasons.push(
          'Не сейчас: нужно ' + breq.missing + ' ' +
          (typeof getBoardRequirementDisplayName === 'function' ? getBoardRequirementDisplayName(breq.key, breq.missing) : breq.key) +
          ' (есть ' + breq.have + ')'
        );
      }
    }

    if (result.unplayable) {
      if (result.hardBlocked) {
        result.penalty += sc.ppUnplayable;
        result.reasons.push('Нельзя сыграть!');
      } else {
        result.penalty += Math.min(18, 6 + result.reasons.length * 2);
        if (!result.reasons.some(function(r) { return r.indexOf('Не сейчас') === 0; })) result.reasons.push('Не сейчас');
      }
    }
    return result;
  }

  function scoreBlueActions(input) {
    var tableauCards = input && input.tableauCards;
    var pv = input && input.pv;
    var paramMaxed = input && input.paramMaxed;
    var ratings = input && input.ratings;
    var getFx = input && input.getFx;

    var scored = [];
    var tp = (pv && pv.thisPlayer) ? pv.thisPlayer : null;
    var myTi = tp ? (tp.titanium || 0) : 0;
    var maxed = paramMaxed || {};

    for (var ti = 0; ti < (tableauCards || []).length; ti++) {
      var tName = tableauCards[ti];
      var tData = ratings ? ratings[tName] : null;
      if (!tData) continue;
      var tEcon = (tData.e || '').toLowerCase();
      if (!tEcon.includes('action') && !tEcon.includes('действие')) continue;

      var aPriority = 45;
      var aReasons = [];
      var aMCValue = 0;

      var fx = typeof getFx === 'function' ? getFx(tName) : null;
      if (fx) {
        if (fx.actMC) { aMCValue += fx.actMC; if (fx.actMC > 0) aReasons.push('+' + fx.actMC + ' MC'); }
        if (fx.actTR) { var trVal = fx.actTR * 7.2; aMCValue += trVal; aReasons.push('+' + fx.actTR + ' TR (~' + Math.round(trVal) + ' MC)'); }
        if (fx.actCD) { aMCValue += fx.actCD * 3.5; aReasons.push('+' + fx.actCD + ' карт'); }
        if (fx.actOc && !maxed.oceans) { aMCValue += 18; aReasons.push('Океан!'); }
        if (fx.vpAcc) { aMCValue += fx.vpAcc * 5; aReasons.push('+' + fx.vpAcc + ' VP'); }
      }

      if (!fx) {
        if (tEcon.includes('vp') || tEcon.includes('вп')) { aPriority += 10; aMCValue += 5; aReasons.push('VP действие'); }
        if (tEcon.includes('microbe') || tEcon.includes('микроб') || tEcon.includes('animal') || tEcon.includes('животн') || tEcon.includes('floater') || tEcon.includes('флоатер')) { aPriority += 5; aMCValue += 3; aReasons.push('Ресурс'); }
        if (tEcon.includes('mc') && (tEcon.includes('gain') || tEcon.includes('получ'))) { aPriority += 8; aMCValue += 4; aReasons.push('MC'); }
      }

      var isVenusAction = tEcon.includes('venus') || tEcon.includes('венер') || tEcon.includes('флоатер') || tEcon.includes('floater');
      if (isVenusAction && maxed.venus) {
        if (fx && fx.actTR) aMCValue -= fx.actTR * 7.2;
        aPriority -= 20;
        aReasons.push('Venus max!');
      }

      if ((tEcon.includes('titanium') || tEcon.includes('титан')) && myTi < 1) {
        aPriority -= 15;
        aReasons.push('Нет титана');
      }

      aPriority += Math.min(20, Math.round(aMCValue * 1.5));
      scored.push({ name: '⚡ ' + tName, priority: aPriority, reasons: aReasons, tier: tData.t || '?', score: tData.s || 0, type: 'action', mcValue: aMCValue });
    }

    return scored;
  }

  function scoreStandardActions(input) {
    var tp = input && input.tp;
    var pv = input && input.pv;
    var ctx = input && input.ctx;
    var saturation = input && input.saturation;
    var sc = input && input.sc;
    var detectMyCorps = input && input.detectMyCorps;
    var brain = input && input.brain;
    var fundedAwardsCache = input && input.fundedAwardsCache;

    if (!tp || !sc) return [];
    var items = [];
    var sat = saturation || {};
    var plantCost = sc.plantsPerGreenery;
    var myCorpsP = typeof detectMyCorps === 'function' ? detectMyCorps() : [];
    if (myCorpsP.indexOf('EcoLine') !== -1) plantCost = sc.plantsPerGreenery - 1;
    var myHeat = tp.heat || 0;
    var myPlants = tp.plants || 0;

    if (myHeat >= sc.heatPerTR && !sat.temp) {
      var heatConvs = Math.floor(myHeat / sc.heatPerTR);
      var heatReasons = heatConvs > 1 ? [myHeat + ' heat (' + heatConvs + 'x)'] : [myHeat + ' heat'];
      items.push({ name: '🔥 Тепло → Темп', priority: 35, reasons: heatReasons, tier: '-', score: 0, type: 'standard', mcValue: 7.2 });
    }

    if (myPlants >= plantCost) {
      var greenMC = sat.oxy ? 4 : 11;
      var greenPrio = sat.oxy ? 20 : 25;
      items.push({ name: '🌿 Озеленение', priority: greenPrio, reasons: [myPlants + ' растений' + (sat.oxy ? ', O₂ max' : '')], tier: '-', score: 0, type: 'standard', mcValue: greenMC });
    }

    if (ctx && ctx.tradesLeft > 0 && pv && pv.game && pv.game.colonies) {
      var colReasons = [ctx.tradesLeft + ' флот(ов)'];
      var scoredCols = [];
      var brainState = { game: pv.game, thisPlayer: pv.thisPlayer, players: pv.game.players || [] };
      for (var ci = 0; ci < pv.game.colonies.length; ci++) {
        var col = pv.game.colonies[ci];
        if (!col.isActive && col.isActive !== undefined) continue;
        if (col.visitor) continue;
        var val = 0;
        if (brain && typeof brain.scoreColonyTrade === 'function') val = Math.round(brain.scoreColonyTrade(col, brainState));
        else val = (col.trackPosition || 0) * 2 + 3;
        if (val > 0) scoredCols.push({ name: col.name, val: val });
      }
      scoredCols.sort(function(a, b) { return b.val - a.val; });
      var topCols = scoredCols.slice(0, 3);
      if (topCols.length > 0) colReasons.push(topCols.map(function(c) { return c.name + ' ~' + c.val + ' MC'; }).join(' | '));
      var bestColVal = topCols.length > 0 ? topCols[0].val : 0;
      items.push({ name: '🚀 Торговля', priority: 40, reasons: colReasons, tier: '-', score: 0, type: 'standard', mcValue: Math.max(8, bestColVal) });
    }

    if (pv && pv.game && pv.game.milestones && (tp.megaCredits || 0) >= 8) {
      var claimedMs = 0;
      pv.game.milestones.forEach(function(ms) {
        if (ms.owner_name || ms.owner_color) claimedMs++;
      });
      if (claimedMs < 3) {
        pv.game.milestones.forEach(function(ms) {
          if (ms.owner_name || ms.owner_color) return;
          if (ms.scores) {
            var myMsScore = 0, msThr = ms.threshold || 0;
            for (var msi = 0; msi < ms.scores.length; msi++) {
              if (ms.scores[msi].color === tp.color) myMsScore = ms.scores[msi].score;
            }
            if (msThr > 0 && myMsScore >= msThr) {
              items.push({ name: '⭐ ' + ms.name, priority: 80, reasons: ['5 VP за 8 MC!', myMsScore + '/' + msThr], tier: '-', score: 0, type: 'standard', mcValue: 32 });
            }
          }
        });
      }
    }

    if (pv && pv.game && pv.game.awards) {
      var myColor = tp.color;
      var fundedCount = 0;
      var fundCosts = [8, 14, 20];
      pv.game.awards.forEach(function(aw) {
        if (aw.funder_name || aw.funder_color || (aw.scores && aw.scores.some(function(s) { return s.claimable; }))) fundedCount++;
      });
      if (fundedAwardsCache && fundedAwardsCache.awards) fundedCount = Math.max(fundedCount, fundedAwardsCache.awards.size);
      if (fundedCount < 3) {
        var fundCost = fundCosts[Math.min(fundedCount, 2)];
        if ((tp.megaCredits || 0) >= fundCost) {
          pv.game.awards.forEach(function(aw) {
            if (!aw.scores || aw.scores.length === 0) return;
            var isFunded = fundedAwardsCache && fundedAwardsCache.awards && fundedAwardsCache.awards.has(aw.name);
            if (isFunded) return;
            var myScore = 0, bestOpp = 0;
            for (var si = 0; si < aw.scores.length; si++) {
              if (aw.scores[si].color === myColor) myScore = aw.scores[si].score;
              else bestOpp = Math.max(bestOpp, aw.scores[si].score);
            }
            if (myScore <= 0) return;
            var lead = myScore - bestOpp;
            var vpExpected = lead > 0 ? 5 : lead === 0 ? 3.5 : lead >= -2 ? 2 : 0;
            var ev = vpExpected * 8 - fundCost;
            if (ev > 0 && lead >= -2) {
              var prio = lead > 0 ? 30 : 20;
              var awReasons = [myScore + ' vs ' + bestOpp + (lead > 0 ? ' лидер' : lead === 0 ? ' равны' : ' −' + Math.abs(lead))];
              awReasons.push(fundCost + ' MC, EV ' + Math.round(ev) + ' MC');
              items.push({ name: '🏆 ' + aw.name, priority: prio, reasons: awReasons, tier: '-', score: 0, type: 'standard', mcValue: ev });
            }
          });
        }
      }
    }

    return items;
  }

  function invalidateStaleScores(input) {
    var getPlayerVueData = input && input.getPlayerVueData;
    var frozenScores = input && input.frozenScores;
    var frozenGameId = input && input.frozenGameId;
    var oppTableauSizes = input && input.oppTableauSizes;
    var oppCtxCache = input && input.oppCtxCache;

    var nextFrozenGameId = frozenGameId;
    var nextOppTableauSizes = oppTableauSizes || {};
    var pvf = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    var curGameId = pvf && pvf.game ? (pvf.game.id || '') : '';
    if (curGameId && curGameId !== frozenGameId) {
      if (frozenScores && typeof frozenScores.clear === 'function') frozenScores.clear();
      nextFrozenGameId = curGameId;
      nextOppTableauSizes = {};
    }
    if (pvf && pvf.game && pvf.game.players && pvf.thisPlayer) {
      var myCol = pvf.thisPlayer.color;
      for (var opi = 0; opi < pvf.game.players.length; opi++) {
        var opp = pvf.game.players[opi];
        if (opp.color === myCol) continue;
        var newSize = opp.tableau ? opp.tableau.length : 0;
        var oldSize = nextOppTableauSizes[opp.color] || 0;
        if (newSize !== oldSize) {
          nextOppTableauSizes[opp.color] = newSize;
          var prefix = 'opp:' + opp.color + ':';
          if (frozenScores && typeof frozenScores.forEach === 'function') {
            frozenScores.forEach(function(v, k) {
              if (k.indexOf(prefix) === 0) frozenScores.delete(k);
            });
          }
          if (oppCtxCache && oppCtxCache[opp.color]) delete oppCtxCache[opp.color];
        }
      }
    }

    return {
      frozenGameId: nextFrozenGameId,
      oppTableauSizes: nextOppTableauSizes
    };
  }

  function scoreCorpByVisibleCards(input) {
    var corpName = input && input.corpName;
    var visibleCardEls = input && input.visibleCardEls;
    var ctx = input && input.ctx;
    var ratingsRaw = input && input.ratingsRaw;
    var baseCardName = input && input.baseCardName;
    var getVisiblePreludeNames = input && input.getVisiblePreludeNames;
    var knownCorps = input && input.knownCorps;
    var resolveCorpName = input && input.resolveCorpName;
    var getCachedCardTags = input && input.getCachedCardTags;
    var getCardCost = input && input.getCardCost;
    var isSpliceOpeningPlacer = input && input.isSpliceOpeningPlacer;
    var getCorpBoost = input && input.getCorpBoost;
    var getInitialDraftInfluence = input && input.getInitialDraftInfluence;
    var getInitialDraftRatingScore = input && input.getInitialDraftRatingScore;
    var ruName = input && input.ruName;
    var getVisibleColonyNames = input && input.getVisibleColonyNames;
    var getPlayerVueData = input && input.getPlayerVueData;

    var bonus = 0;
    var reasons = [];
    var rawRatings = ratingsRaw || {};
    var toBaseCardName = typeof baseCardName === 'function' ? baseCardName : function(n) { return n; };
    var known = knownCorps || new Set();
    var synergyData = rawRatings[corpName];
    var synergyCards = synergyData && synergyData.y ? synergyData.y : [];
    var synergySet = new Set();
    for (var sc = 0; sc < synergyCards.length; sc++) {
      var entry = synergyCards[sc];
      if (Array.isArray(entry)) {
        for (var sj = 0; sj < entry.length; sj++) {
          if (!entry[sj]) continue;
          synergySet.add(entry[sj]);
          synergySet.add(toBaseCardName(entry[sj]));
        }
      } else if (entry) {
        synergySet.add(entry);
        synergySet.add(toBaseCardName(entry));
      }
    }

    var visiblePreludeSet = new Set(typeof getVisiblePreludeNames === 'function' ? getVisiblePreludeNames() : []);
    var preludeEntries = [];
    var projectBoostTotal = 0;
    var projectHitCount = 0;
    var spliceMicrobeCards = 0;
    var splicePlacers = 0;

    for (var i = 0; i < (visibleCardEls || []).length; i++) {
      var el = visibleCardEls[i];
      var cardName = el.getAttribute('data-tm-card');
      if (!cardName || known.has(cardName) || known.has(typeof resolveCorpName === 'function' ? resolveCorpName(cardName) : cardName)) continue;

      var rawBonus = 0;
      if (synergySet.has(cardName) || synergySet.has(toBaseCardName(cardName))) rawBonus += 3;

      var cardTags = typeof getCachedCardTags === 'function' ? getCachedCardTags(el) : new Set();
      var cardData = rawRatings[cardName] || rawRatings[toBaseCardName(cardName)];
      var eLower = cardData && cardData.e ? cardData.e.toLowerCase() : '';
      var cardCost = typeof getCardCost === 'function' ? getCardCost(el) : null;
      var cardType = cardTags.has('event') ? 'event' : el.closest('.automated-card, [class*="auto"]') ? 'auto' : 'blue';
      if (corpName === 'Splice') {
        if (cardTags.has('microbe')) spliceMicrobeCards++;
        if (typeof isSpliceOpeningPlacer === 'function' && isSpliceOpeningPlacer(cardName)) splicePlacers++;
      }
      rawBonus += typeof getCorpBoost === 'function'
        ? getCorpBoost(corpName, { eLower: eLower, cardTags: cardTags, cardCost: cardCost, cardType: cardType, cardName: cardName, ctx: ctx, globalParams: ctx ? ctx.globalParams : null })
        : 0;
      if (rawBonus === 0) continue;

      var cardWeight = (typeof getInitialDraftInfluence === 'function' && typeof getInitialDraftRatingScore === 'function')
        ? getInitialDraftInfluence(getInitialDraftRatingScore(cardName, 55), 0.25, 0.7)
        : 1;
      var weightedBonus = rawBonus >= 0 ? rawBonus * cardWeight : rawBonus * Math.max(0.15, cardWeight * 0.5);
      if (visiblePreludeSet.has(cardName)) {
        preludeEntries.push({ name: cardName, weighted: weightedBonus, raw: rawBonus });
      } else {
        projectBoostTotal += weightedBonus;
        projectHitCount++;
      }
    }

    if (projectBoostTotal !== 0) {
      var scaledProjectBoost = Math.round(Math.max(-10, Math.min(12, projectBoostTotal)));
      bonus += scaledProjectBoost;
      reasons.push(formatCorpProjectReason(projectHitCount, scaledProjectBoost));
    }

    if (preludeEntries.length > 0) {
      preludeEntries.sort(function(a, b) { return b.weighted - a.weighted; });
      var topPrelude = preludeEntries[0];
      var secondPrelude = preludeEntries.length > 1 ? preludeEntries[1] : null;
      var preludeBonus = topPrelude.weighted;
      if (secondPrelude) preludeBonus += secondPrelude.weighted * (secondPrelude.weighted >= 0 ? 0.4 : 0.15);
      var scaledPreludeBonus = Math.round(Math.max(-6, Math.min(10, preludeBonus)));
      bonus += scaledPreludeBonus;

      var topShown = Math.round(topPrelude.weighted);
      if (topShown !== 0) {
        var topPreludeName = formatShortReasonName((typeof ruName === 'function' ? ruName(topPrelude.name) : topPrelude.name) || topPrelude.name);
        reasons.push('лучшая прел. ' + topPreludeName + ' ' + (topShown >= 0 ? '+' : '') + topShown);
      }
      if (secondPrelude) {
        var secondShown = Math.round(secondPrelude.weighted * (secondPrelude.weighted >= 0 ? 0.4 : 0.15));
        if (secondShown !== 0) {
          var secondPreludeName = formatShortReasonName((typeof ruName === 'function' ? ruName(secondPrelude.name) : secondPrelude.name) || secondPrelude.name);
          reasons.push('2-я прел. ' + secondPreludeName + ' ' + (secondShown >= 0 ? '+' : '') + secondShown);
        }
      }
    }

    if (corpName === 'Splice') {
      var spliceShellBonus = 0;
      var spliceColonies = new Set(typeof getVisibleColonyNames === 'function' ? getVisibleColonyNames() : []);
      if (spliceMicrobeCards >= 2) spliceShellBonus += 1;
      if (spliceMicrobeCards >= 4) spliceShellBonus += 1;
      if (splicePlacers > 0) spliceShellBonus += Math.min(2, splicePlacers);
      if (spliceColonies.has('Enceladus')) spliceShellBonus += 2;
      if (spliceShellBonus > 0) {
        bonus += spliceShellBonus;
        reasons.push('microbe shell +' + spliceShellBonus);
      }
    }

    var pvDraft = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    var playerCount = (pvDraft && pvDraft.game && pvDraft.game.players) ? pvDraft.game.players.length : 3;
    var hasWGT = !!(pvDraft && pvDraft.game && pvDraft.game.gameOptions && pvDraft.game.gameOptions.solarPhaseOption);
    if (corpName === 'Nirgal Enterprises' && playerCount >= 4) {
      var nirgalPenalty = hasWGT ? 2 : 3;
      bonus -= nirgalPenalty;
      reasons.push(playerCount + 'P M&A race −' + nirgalPenalty);
    }

    if (corpName === 'Septem Tribus' && bonus > 5) {
      bonus = 5;
      reasons.push('political shell cap +5');
    }

    return { total: (synergyData ? synergyData.s : 0) + bonus, reasons: reasons };
  }

  function scoreCardAgainstCorps(input) {
    var name = input && input.name;
    var el = input && input.el;
    var myTableau = input && input.myTableau;
    var myHand = input && input.myHand;
    var offeredCorps = input && input.offeredCorps;
    var myCorp = input && input.myCorp;
    var ctx = input && input.ctx;
    var scoreDraftCard = input && input.scoreDraftCard;
    var withForcedCorpContext = input && input.withForcedCorpContext;
    var getInitialDraftRatingScore = input && input.getInitialDraftRatingScore;
    var getInitialDraftInfluence = input && input.getInitialDraftInfluence;

    var corps = offeredCorps || [];
    if (typeof scoreDraftCard !== 'function' || typeof withForcedCorpContext !== 'function') return null;

    if (!myCorp && corps.length > 0 && corps.indexOf(name) === -1) {
      var corpResults = [];
      for (var ci = 0; ci < corps.length; ci++) {
        var offeredCorp = corps[ci];
        corpResults.push({
          corp: offeredCorp,
          result: scoreDraftCard(name, myTableau, myHand, offeredCorp, el, withForcedCorpContext(ctx, offeredCorp)),
          corpScore: typeof getInitialDraftRatingScore === 'function' ? getInitialDraftRatingScore(offeredCorp, 55) : 55
        });
      }
      var noCorp = scoreDraftCard(name, myTableau, myHand, '', el, withForcedCorpContext(ctx, ''));
      if (corpResults.length === 0) return noCorp;

      corpResults.sort(function(a, b) {
        var aRank = a.result.uncappedTotal != null ? a.result.uncappedTotal : a.result.total;
        var bRank = b.result.uncappedTotal != null ? b.result.uncappedTotal : b.result.total;
        return bRank - aRank;
      });

      var baseRank = noCorp.uncappedTotal != null ? noCorp.uncappedTotal : noCorp.total;
      var best = corpResults[0];
      var second = corpResults.length > 1 ? corpResults[1] : null;
      var bestRank = best.result.uncappedTotal != null ? best.result.uncappedTotal : best.result.total;
      var bestDelta = Math.max(0, bestRank - baseRank);
      if (bestDelta <= 0) return noCorp;

      var bestWeight = typeof getInitialDraftInfluence === 'function'
        ? getInitialDraftInfluence(best.corpScore, 0.55, 1.0)
        : 1;
      var weightedRank = baseRank + bestDelta * bestWeight;
      var weightedTotal = noCorp.total + Math.max(0, best.result.total - noCorp.total) * bestWeight;
      var secondLabel = '';
      if (second) {
        var secondRank = second.result.uncappedTotal != null ? second.result.uncappedTotal : second.result.total;
        var secondDelta = Math.max(0, secondRank - baseRank);
        if (secondDelta > 0) {
          var secondWeight = typeof getInitialDraftInfluence === 'function'
            ? getInitialDraftInfluence(second.corpScore, 0.15, 0.45)
            : 0.3;
          weightedRank += secondDelta * secondWeight;
          weightedTotal += Math.max(0, second.result.total - noCorp.total) * secondWeight;
          secondLabel = second.corp;
        }
      }

      var result = {
        total: Math.round(weightedTotal),
        uncappedTotal: Math.round(weightedRank),
        reasons: best.result.reasons.slice()
      };
      if (best.corp && bestRank >= baseRank + 3) {
        if (!reasonsMentionName(result.reasons, best.corp)) {
          result.reasons.push('лучше с ' + best.corp);
        }
      }
      if (secondLabel) {
        if (!reasonsMentionName(result.reasons, secondLabel)) {
          result.reasons.push('ещё ок с ' + secondLabel);
        }
      }
      return result;
    }

    return scoreDraftCard(name, myTableau, myHand, myCorp, el, ctx);
  }

  function adjustForResearch(input) {
    var result = input && input.result;
    var el = input && input.el;
    var myHand = input && input.myHand;
    var ctx = input && input.ctx;
    var getCardCost = input && input.getCardCost;
    var getPlayerVueData = input && input.getPlayerVueData;
    var tmBrain = input && input.tmBrain;
    var cardEffects = input && input.cardEffects;

    if (!result || !el) return;

    var adj = 0;
    var handSize = myHand ? myHand.length : 0;
    var cardName = el.getAttribute('data-tm-card') || '';
    var cardCost = typeof getCardCost === 'function' ? getCardCost(el) : null;
    var myMC = ctx ? (ctx.mc || 0) : 0;
    var gensLeft = ctx ? (ctx.gensLeft || 3) : 3;

    var cardEV = 0;
    if (tmBrain && typeof tmBrain.scoreCard === 'function' && cardName) {
      var pvResearch = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
      if (pvResearch) {
        var brainState = { game: pvResearch.game, thisPlayer: pvResearch.thisPlayer, players: (pvResearch.game && pvResearch.game.players) || [] };
        cardEV = tmBrain.scoreCard({ name: cardName, calculatedCost: cardCost || 0 }, brainState);
      }
    }

    if (cardEV > 5 || (result.uncappedTotal != null ? result.uncappedTotal : result.total) >= 80) adj += 5;
    else if (cardEV > 0 || (result.uncappedTotal != null ? result.uncappedTotal : result.total) >= 70) adj += 3;
    else if (cardCost !== null && cardCost <= 10 && result.reasons.length >= 2) adj += 2;

    if (cardEV < -10 || (result.uncappedTotal != null ? result.uncappedTotal : result.total) < 45) adj -= 6;
    else if (cardEV < -5 || (result.uncappedTotal != null ? result.uncappedTotal : result.total) < 55) adj -= 3;

    if (cardCost !== null && cardCost > 20 && myMC < cardCost * 0.5) adj -= 5;

    if (handSize > gensLeft * 2) adj -= Math.min(4, Math.round((handSize - gensLeft * 2) * 1.5));

    if (gensLeft <= 1 && cardEffects) {
      var fx = cardEffects[cardName];
      var hasVP = fx && (fx.vp || fx.tr || fx.tmp || fx.o2 || fx.oc || fx.vn || fx.grn);
      if (!hasVP) adj -= 8;
    }

    var reqHardBlockDraft = result.reasons.some(function(r) { return isHardRequirementReasonText(r); });
    var reqSoftNearDraft = result.reasons.some(function(r) { return isSoftNearRequirementReasonText(r); });
    if (reqHardBlockDraft) adj -= reqSoftNearDraft ? (gensLeft <= 2 ? 2 : 1) : (gensLeft <= 2 ? 6 : 3);

    result.total += adj;
    if (result.uncappedTotal != null) result.uncappedTotal += adj;
    var preferReqLaterLabel = reqHardBlockDraft && reqSoftNearDraft && (result.total >= 55 || (result.uncappedTotal != null ? result.uncappedTotal : result.total) >= 55);
    if (adj <= -4) {
      if (preferReqLaterLabel) result.reasons.push('Позже (req)');
      else result.reasons.push('Skip (' + (cardEV < 0 ? 'EV ' + Math.round(cardEV) : 'слабая') + ')');
    }
    else if (adj >= 4 && !reqHardBlockDraft) result.reasons.push('Buy! (' + (cardEV > 0 ? 'EV +' + Math.round(cardEV) : 'сильная') + ')');
    else if (adj <= -2) result.reasons.push(preferReqLaterLabel ? 'Позже (req)' : 'Skip');
    else if (adj >= 2 && !reqHardBlockDraft) result.reasons.push('Buy');
    else if (adj >= 2 && reqHardBlockDraft) result.reasons.push('Позже (req)');
    else if (preferReqLaterLabel) result.reasons.push('Позже (req)');
  }

  function scoreDraftCard(input) {
    var cardName = input && input.cardName;
    var myTableau = input && input.myTableau;
    var myHand = input && input.myHand;
    var myCorp = input && input.myCorp;
    var cardEl = input && input.cardEl;
    var ctx = input && input.ctx;
    var ratings = input && input.ratings;
    var getPlayerVueData = input && input.getPlayerVueData;
    var detectMyCorps = input && input.detectMyCorps;
    var getOpeningHandBias = input && input.getOpeningHandBias;
    var sc = input && input.sc;
    var applyResult = input && input.applyResult;
    var scoreTableauSynergy = input && input.scoreTableauSynergy;
    var scoreComboPotential = input && input.scoreComboPotential;
    var scoreHandSynergy = input && input.scoreHandSynergy;
    var getCachedCardTags = input && input.getCachedCardTags;
    var getCardCost = input && input.getCardCost;
    var cardEffects = input && input.cardEffects;
    var scoreCardRequirements = input && input.scoreCardRequirements;
    var isPreludeOrCorpCard = input && input.isPreludeOrCorpCard;
    var scoreDiscountsAndPayments = input && input.scoreDiscountsAndPayments;
    var scoreTagSynergies = input && input.scoreTagSynergies;
    var scoreColonySynergy = input && input.scoreColonySynergy;
    var scoreTurmoilSynergy = input && input.scoreTurmoilSynergy;
    var scoreFTNTiming = input && input.scoreFTNTiming;
    var scoreCrudeTiming = input && input.scoreCrudeTiming;
    var scoreMilestoneAwardProximity = input && input.scoreMilestoneAwardProximity;
    var scoreResourceSynergies = input && input.scoreResourceSynergies;
    var scoreCardEconomyInContext = input && input.scoreCardEconomyInContext;
    var scoreOpponentAwareness = input && input.scoreOpponentAwareness;
    var scorePositionalFactors = input && input.scorePositionalFactors;
    var getCorpBoost = input && input.getCorpBoost;
    var combos = input && input.combos;
    var scoreMapMA = input && input.scoreMapMA;
    var scoreTerraformRate = input && input.scoreTerraformRate;
    var scorePostContextChecks = input && input.scorePostContextChecks;
    var scoreBoardStateModifiers = input && input.scoreBoardStateModifiers;
    var scoreSynergyRules = input && input.scoreSynergyRules;
    var scorePrelude = input && input.scorePrelude;
    var scoreBreakEvenTiming = input && input.scoreBreakEvenTiming;
    var checkDenyDraft = input && input.checkDenyDraft;
    var checkHateDraft = input && input.checkHateDraft;
    var debugMode = input && input.debugMode;
    var tmLog = input && input.tmLog;

    var data = ratings ? ratings[cardName] : null;
    if (!data) return { total: 0, reasons: [] };

    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    var bonus = 0;
    var reasons = [];
    var eLower = data.e ? data.e.toLowerCase() : '';

    var myCorps = ctx && ctx._myCorps ? ctx._myCorps : [];
    if (myCorps.length === 0) {
      if (myCorp) myCorps.push(myCorp);
      var allDetected = typeof detectMyCorps === 'function' ? detectMyCorps() : [];
      for (var ci = 0; ci < allDetected.length; ci++) {
        if (allDetected[ci] && myCorps.indexOf(allDetected[ci]) === -1) myCorps.push(allDetected[ci]);
      }
    }

    var baseScore = data.s;
    var openingBias = typeof getOpeningHandBias === 'function' ? getOpeningHandBias(cardName, data, ctx) : 0;
    if (openingBias) {
      baseScore += openingBias;
      reasons.push('старт ' + (openingBias > 0 ? '+' : '') + openingBias);
    }

    var tagDecay = (ctx.gensLeft >= sc.tagDecayFullAt)
      ? 1.0
      : Math.max(sc.tagDecayMin, ctx.gensLeft / sc.tagDecayFullAt);

    var allMyCards = ctx && ctx._allMyCards ? ctx._allMyCards : (myTableau || []).concat(myHand || []);
    var allMyCardsSet = ctx && ctx._allMyCardsSet ? ctx._allMyCardsSet : new Set(allMyCards);
    var playedEvents = ctx && ctx._playedEvents ? ctx._playedEvents : new Set();
    var isPreludeOrCorpEarly = typeof isPreludeOrCorpCard === 'function' ? isPreludeOrCorpCard(cardEl) : false;
    bonus = typeof applyResult === 'function' ? applyResult(scoreTableauSynergy(cardName, data, allMyCards, allMyCardsSet, playedEvents), bonus, reasons) : bonus;
    bonus = typeof applyResult === 'function' ? applyResult(scoreComboPotential(cardName, eLower, allMyCardsSet, ctx), bonus, reasons) : bonus;
    if (!isPreludeOrCorpEarly) {
      bonus = typeof applyResult === 'function' ? applyResult(scoreHandSynergy(cardName, myHand, ctx), bonus, reasons) : bonus;
    }

    var cardTags = new Set();
    if (cardEl && typeof getCachedCardTags === 'function') cardTags = getCachedCardTags(cardEl);
    var cardCost = null;
    if (cardEl && typeof getCardCost === 'function') cardCost = getCardCost(cardEl);
    if (cardCost == null && cardEffects) {
      var fxCost = cardEffects[cardName];
      if (fxCost && fxCost.c != null) cardCost = fxCost.c;
    }

    if (ctx) {
      var reqResult = typeof scoreCardRequirements === 'function' ? scoreCardRequirements(cardEl, ctx, cardName) : null;
      if (reqResult && typeof applyResult === 'function') bonus = applyResult(reqResult, bonus, reasons);

      if (cardName === 'Caretaker Contract' && (isOpeningHandContext({ ctx: ctx, getPlayerVueData: getPlayerVueData }) || (ctx && ctx.gen <= 2))) {
        var caretakerTemp = ctx && ctx.globalParams
          ? (typeof ctx.globalParams.temp === 'number'
            ? ctx.globalParams.temp
            : (typeof ctx.globalParams.temperature === 'number' ? ctx.globalParams.temperature : -30))
          : (pv && pv.game && typeof pv.game.temperature === 'number' ? pv.game.temperature : -30);
        var caretakerGap = Math.max(0, Math.ceil((0 - caretakerTemp) / 2));
        var caretakerPenalty = 0;
        if (caretakerGap >= 14) caretakerPenalty = 6;
        else if (caretakerGap >= 11) caretakerPenalty = 5;
        else if (caretakerGap >= 8) caretakerPenalty = 3;

        if (caretakerPenalty > 0 && !rewriteCaretakerRequirementReason(reasons, caretakerPenalty)) {
          bonus -= caretakerPenalty;
          reasons.push('Caretaker ждёт 0°C −' + caretakerPenalty);
        }

        if (!reasons.some(function(r) { return r.indexOf('Caretaker heat shell thin') >= 0; })) {
          var caretakerPreludeNames = getVisiblePreludeNames({ getPlayerVueData: getPlayerVueData });
          var caretakerSupportNames = [];
          for (var cci = 0; cci < (myHand || []).length; cci++) {
            if (myHand[cci] && myHand[cci] !== cardName) caretakerSupportNames.push(myHand[cci]);
          }
          for (var ccp = 0; ccp < caretakerPreludeNames.length; ccp++) {
            if (caretakerPreludeNames[ccp] && caretakerPreludeNames[ccp] !== cardName) caretakerSupportNames.push(caretakerPreludeNames[ccp]);
          }
          var caretakerSeen = new Set();
          var caretakerHeatShell = 0;
          for (var ccs = 0; ccs < caretakerSupportNames.length; ccs++) {
            var caretakerName = caretakerSupportNames[ccs];
            if (!caretakerName || caretakerSeen.has(caretakerName)) continue;
            caretakerSeen.add(caretakerName);
            var caretakerFx = cardEffects ? cardEffects[caretakerName] : null;
            if (!caretakerFx) continue;
            if ((caretakerFx.hp || 0) > 0 || (caretakerFx.tmp || 0) > 0) caretakerHeatShell++;
          }
          if (myCorps.indexOf('Helion') !== -1) caretakerHeatShell++;
          if (caretakerGap >= 10 && caretakerHeatShell <= 1) {
            bonus -= 3;
            reasons.push('Caretaker heat shell thin -3');
          } else if (caretakerGap >= 8 && caretakerHeatShell === 0) {
            bonus -= 2;
            reasons.push('Caretaker heat shell thin -2');
          }
        }
      }

      var cardType = 'green';
      if (cardEl) {
        if (cardEl.classList.contains('card-type--active') ||
            cardEl.querySelector('.card-content--blue, .blue-action, [class*="blue"]')) {
          cardType = 'blue';
        } else if (cardTags.has('event') ||
                   cardEl.classList.contains('card-type--event') ||
                   cardEl.querySelector('.card-content--red')) {
          cardType = 'red';
        }
      } else if (cardTags.has('event')) {
        cardType = 'red';
      } else if (eLower.includes('action')) {
        cardType = 'blue';
      }

      if (!isPreludeOrCorpEarly && typeof applyResult === 'function') {
        bonus = applyResult(scoreDiscountsAndPayments(cardTags, cardCost, cardType, ctx, tagDecay), bonus, reasons);
      }

      if (typeof applyResult === 'function') bonus = applyResult(scoreTagSynergies(cardName, cardTags, cardType, cardCost, tagDecay, eLower, data, myCorps, ctx, pv), bonus, reasons);
      if (typeof applyResult === 'function') bonus = applyResult(scoreColonySynergy(eLower, data, ctx), bonus, reasons);
      if (typeof applyResult === 'function') bonus = applyResult(scoreTurmoilSynergy(eLower, data, cardTags, ctx, cardName), bonus, reasons);

      var isPreludeOrCorp = typeof isPreludeOrCorpCard === 'function' ? isPreludeOrCorpCard(cardEl) : false;
      var ftnResult = scoreFTNTiming(cardName, ctx, { isPreludeOrCorp: !!isPreludeOrCorp });
      if (typeof applyResult === 'function') bonus = applyResult(ftnResult, bonus, reasons);
      var skipCrudeTiming = ftnResult.skipCrudeTiming;

      if (!skipCrudeTiming && typeof applyResult === 'function') bonus = applyResult(scoreCrudeTiming(cardName, eLower, data, ctx), bonus, reasons);
      if (typeof applyResult === 'function') bonus = applyResult(scoreMilestoneAwardProximity(cardTags, cardType, eLower, data, ctx, cardName), bonus, reasons);
      if (typeof applyResult === 'function') bonus = applyResult(scoreResourceSynergies(eLower, data, cardTags, ctx, cardName), bonus, reasons);
      if (typeof applyResult === 'function') bonus = applyResult(scoreCardEconomyInContext(cardTags, cardType, cardName, cardCost, tagDecay, eLower, data, ctx, skipCrudeTiming), bonus, reasons);
      if (typeof applyResult === 'function') bonus = applyResult(scoreOpponentAwareness(cardName, eLower, data, cardTags, ctx), bonus, reasons);

      var reqMet = reasons.some(function(r) { return r.indexOf('Req ✓') !== -1; });
      var reqPenaltyPresent = reasons.some(function(r) {
        return r.indexOf('Req ') === 0 || r.indexOf('Окно') !== -1 || r.indexOf('Нет ') === 0 || r.indexOf('Нужно ') === 0;
      });
      if (typeof applyResult === 'function') {
        bonus = applyResult(scorePositionalFactors(cardTags, cardType, cardName, cardCost, tagDecay, eLower, data, ctx, baseScore, reqMet, reqPenaltyPresent, isPreludeOrCorp), bonus, reasons);
      }

      if (!isPreludeOrCorp && myCorp && data.e && typeof getCorpBoost === 'function') {
        var cbOpts = { eLower: eLower, cardTags: cardTags, cardCost: cardCost, cardType: cardType, cardName: cardName, ctx: ctx, globalParams: ctx.globalParams };
        for (var cbi = 0; cbi < myCorps.length; cbi++) {
          var cbCorp = myCorps[cbi];
          var corpBoost = getCorpBoost(cbCorp, cbOpts);
          if (corpBoost !== 0) {
            bonus += corpBoost;
            reasons.push(formatCorpBoostReason(cbCorp, cardName, corpBoost));
          }
        }
      }

      if (combos) {
        for (var coi = 0; coi < combos.length; coi++) {
          var combo = combos[coi];
          if (!combo.cards.includes(cardName)) continue;
          var otherCards = combo.cards.filter(function(c) { return c !== cardName; });
          var matchCount = otherCards.filter(function(c) { return allMyCardsSet.has(c); }).length;
          if (matchCount >= 2) {
            var chainRating = combo.r === 'godmode' ? sc.chainGodmode : combo.r === 'great' ? sc.chainGreat : sc.chainDecent;
            bonus += chainRating;
            reasons.push('Цепь ' + (matchCount + 1) + '/' + combo.cards.length + ' +' + chainRating);
            break;
          }
        }
      }

      if (ctx.tradesLeft > 0 && data.e) {
        if (eLower.includes('trade') || eLower.includes('colony') || eLower.includes('торг') || eLower.includes('колон')) {
          if (pv && pv.game && pv.game.colonies) {
            var bestTrackVal = 0;
            for (var coli = 0; coli < pv.game.colonies.length; coli++) {
              var col = pv.game.colonies[coli];
              if (col.isActive !== false && col.trackPosition != null) bestTrackVal = Math.max(bestTrackVal, col.trackPosition);
            }
            if (bestTrackVal >= sc.tradeTrackThreshold) {
              var tradeBonus = Math.min(sc.tradeTrackCap, Math.floor(bestTrackVal / 2));
              bonus += tradeBonus;
              reasons.push('Трек ' + bestTrackVal + ' +' + tradeBonus);
            }
          }
        }
      }

      if (typeof applyResult === 'function') bonus = applyResult(scoreMapMA(data, cardTags, cardCost, ctx, sc, cardName), bonus, reasons);
      if (typeof applyResult === 'function') bonus = applyResult(scoreTerraformRate(ctx, eLower, data), bonus, reasons);
    }

    if (typeof applyResult === 'function') bonus = applyResult(scorePostContextChecks(cardName, cardEl, eLower, data, cardTags, ctx, pv, myHand), bonus, reasons);
    if (typeof applyResult === 'function') bonus = applyResult(scoreBoardStateModifiers(cardName, data, eLower, ctx), bonus, reasons);
    if (typeof applyResult === 'function') bonus = applyResult(scoreSynergyRules(cardName, allMyCards, ctx, sc), bonus, reasons);
    if (typeof applyResult === 'function') bonus = applyResult(scorePrelude(cardName, data, cardEl, myCorp, ctx, sc), bonus, reasons);

    if (ctx && ctx.allSP && cardEffects) {
      var cfx = cardEffects[cardName];
      var relevantSP = null;
      if (cfx) {
        if ((cfx.ep || cfx.mp || cfx.sp || cfx.tp || cfx.pp || cfx.hp) && !cfx.tr) {
          relevantSP = ctx.allSP.find(function(sp) { return sp.type === 'power'; });
        } else if (cfx.tr && !(cfx.ep || cfx.mp || cfx.sp || cfx.tp || cfx.pp || cfx.hp)) {
          var trSPs = ctx.allSP.filter(function(sp) { return sp.type === 'asteroid' || sp.type === 'aquifer' || sp.type === 'venus' || sp.type === 'buffer'; });
          if (trSPs.length > 0) relevantSP = trSPs.reduce(function(best, sp) { return sp.adj > best.adj ? sp : best; });
        }
      }
      if (relevantSP) {
        var spDiff = (baseScore + bonus) - relevantSP.adj;
        if (spDiff < -5) reasons.push('vs ' + relevantSP.name + ' ' + spDiff);
      }
    }

    if (cardEffects) {
      var fx = cardEffects[cardName];
      if (fx && fx.vp && fx.vp < 0) reasons.push('⚠ ' + fx.vp + ' VP');
    }

    var be = scoreBreakEvenTiming(cardName, ctx, cardTags);
    if (be.penalty > 0) bonus -= be.penalty;
    if (be.reason) reasons.push(be.reason);

    var denyReason = checkDenyDraft(data, baseScore + bonus, ctx, cardTags, cardName, eLower);
    if (denyReason) {
      reasons.push(denyReason);
      var currentTotal = baseScore + bonus;
      if (currentTotal < 75 && data.s >= 70) {
        var denyBoost = Math.min(8, Math.round((data.s - currentTotal) * 0.3));
        if (denyBoost > 0) { bonus += denyBoost; reasons.push('Deny ↑' + denyBoost); }
      }
    }

    var hateDraft = null;
    if (!denyReason) {
      hateDraft = checkHateDraft(cardName, baseScore + bonus, ctx, cardTags);
      if (hateDraft) reasons.push('🚫 Hate: ' + hateDraft.label);
    }

    reasons = cleanupRequirementReasons(reasons);
    if (myCorps && myCorps.length > 0) {
      var bareCorpAliasGroups = [];
      for (var _dcr = 0; _dcr < myCorps.length; _dcr++) {
        var corpAliases = getCorpReasonAliases(myCorps[_dcr]);
        var hasSpecificCorpReason = reasons.some(function(r) {
          if (!r || r.indexOf('Корп: ') === 0) return false;
          for (var ai = 0; ai < corpAliases.length; ai++) {
            if (corpAliases[ai] && r.indexOf(corpAliases[ai]) === 0) return true;
          }
          return false;
        });
        if (hasSpecificCorpReason) bareCorpAliasGroups.push(corpAliases);
      }
      if (bareCorpAliasGroups.length > 0) {
        function isBareCorpReasonForMatchedAlias(text) {
          if (!text || text.indexOf('Корп: ') !== 0) return false;
          for (var gi = 0; gi < bareCorpAliasGroups.length; gi++) {
            var aliases = bareCorpAliasGroups[gi];
            for (var ai = 0; ai < aliases.length; ai++) {
              if (aliases[ai] && text.indexOf(aliases[ai]) !== -1) return true;
            }
          }
          return false;
        }
        reasons = reasons.filter(function(r) { return !isBareCorpReasonForMatchedAlias(r); });
      }
    }
    var isUnplayable = reasons.some(function(r) { return r.indexOf('Невозможно сыграть') !== -1; });
    var uncappedTotal = baseScore + bonus;
    var finalScore = Math.min(100, uncappedTotal);
    if (isUnplayable && !(ctx && (ctx._openingHand || (ctx.gensLeft != null && ctx.gensLeft >= 6))) && finalScore > 54) finalScore = 54;
    if (debugMode && typeof tmLog === 'function') tmLog('score', cardName + ': ' + baseScore + ' → ' + finalScore + ' (' + reasons.join(', ') + ')');
    return { total: finalScore, uncappedTotal: uncappedTotal, reasons: reasons, hateDraft: hateDraft };
  }

  function computePlayPriorities(input) {
    var getMyHandNames = input && input.getMyHandNames;
    var detectGeneration = input && input.detectGeneration;
    var getPlayerVueData = input && input.getPlayerVueData;
    var estimateGensLeft = input && input.estimateGensLeft;
    var getCachedPlayerContext = input && input.getCachedPlayerContext;
    var getMyTableauNames = input && input.getMyTableauNames;
    var documentObj = input && input.documentObj;
    var selHand = input && input.selHand;
    var ratings = input && input.ratings;
    var cardTagsData = input && input.cardTagsData;
    var lookupCardData = input && input.lookupCardData;
    var detectCardTypeForScoring = input && input.detectCardTypeForScoring;
    var cardEffects = input && input.cardEffects;
    var computeCardValue = input && input.computeCardValue;
    var cardDiscounts = input && input.cardDiscounts;
    var getCardCost = input && input.getCardCost;
    var sc = input && input.sc;
    var computeReqPriority = input && input.computeReqPriority;
    var scorePlayPriorityMA = input && input.scorePlayPriorityMA;
    var scoreBlueActions = input && input.scoreBlueActions;
    var scoreStandardActions = input && input.scoreStandardActions;
    var yName = input && input.yName;

    if (!sc || typeof getMyHandNames !== 'function' || typeof getPlayerVueData !== 'function') return [];
    var handCards = getMyHandNames();
    if (handCards.length === 0) return [];

    detectGeneration();
    var pv = getPlayerVueData();
    var gensLeft = typeof estimateGensLeft === 'function' ? estimateGensLeft(pv) : 0;
    var ctx = typeof getCachedPlayerContext === 'function' ? getCachedPlayerContext() : null;
    var myMC = (pv && pv.thisPlayer) ? (pv.thisPlayer.megaCredits || 0) : 0;
    var myTableau = typeof getMyTableauNames === 'function' ? getMyTableauNames() : [];

    var handElMap = new Map();
    if (documentObj && selHand) {
      documentObj.querySelectorAll(selHand).forEach(function(el) {
        handElMap.set(el.getAttribute('data-tm-card'), el);
      });
    }

    var scored = [];
    for (var hi = 0; hi < handCards.length; hi++) {
      var name = handCards[hi];
      var data = ratings ? ratings[name] : null;
      if (!data) {
        scored.push({ name: name, priority: sc.ppBase, reasons: [], tier: '?', score: 0 });
        continue;
      }

      var priority = sc.ppBase;
      var reasons = [];
      var econ = (data.e || '').toLowerCase();
      var when = (data.w || '').toLowerCase();
      var cardEl = handElMap.get(name);
      var cardTagsArr = (cardTagsData ? lookupCardData(cardTagsData, name) : null) || [];
      var cardTags = new Set((cardTagsArr || []).map(function(t) { return String(t).toLowerCase(); }));
      var cardType = typeof detectCardTypeForScoring === 'function'
        ? detectCardTypeForScoring(cardEl, cardTags, econ + ' ' + when)
        : 'green';

      var cardMCValue = 0;
      if (cardEffects) {
        var fx = cardEffects[name];
        if (fx && typeof computeCardValue === 'function') {
          var mcNow = computeCardValue(fx, gensLeft);
          var mcLater = computeCardValue(fx, Math.max(0, gensLeft - 2));
          var urgency = mcNow - mcLater;
          cardMCValue = mcNow - (fx.c || 0) - 3;
          if (urgency > 5) {
            priority += Math.min(20, Math.round(urgency));
            reasons.push('Срочно (' + Math.round(urgency) + ' MC потерь)');
          } else if (urgency > 2) {
            priority += Math.round(urgency);
            reasons.push('Лучше раньше');
          } else if (urgency < -2) {
            priority += Math.round(urgency);
            reasons.push('Можно позже');
          }
        }
      }

      if (econ.includes('prod') && !econ.includes('vp only')) {
        priority += gensLeft * sc.ppProdMul;
        reasons.push('Продукция');
      }

      if (econ.includes('action') || when.includes('action')) {
        priority += gensLeft * sc.ppActionMul;
        reasons.push('Действие');
      }

      if (cardDiscounts && cardDiscounts[name]) {
        var expensiveInHand = 0;
        for (var ei = 0; ei < handCards.length; ei++) {
          if (handCards[ei] === name) continue;
          var hEl = handElMap.get(handCards[ei]);
          if (!hEl || typeof getCardCost !== 'function') continue;
          var hCost = getCardCost(hEl);
          if (hCost !== null && hCost >= 12) expensiveInHand++;
        }
        if (expensiveInHand > 0) {
          priority += expensiveInHand * sc.ppDiscountMul;
          reasons.push('Скидка → ' + expensiveInHand + ' карт');
        }
      }

      if (econ.includes('tr') && !econ.includes('prod')) {
        priority += sc.ppTrBoost;
        reasons.push('TR');
      }

      var enablesOthers = 0;
      for (var oi = 0; oi < handCards.length; oi++) {
        var other = handCards[oi];
        if (other === name) continue;
        var od = ratings ? ratings[other] : null;
        if (od && od.y && od.y.some(function(e) { return yName(e) === name; })) enablesOthers++;
      }
      if (enablesOthers > 0) {
        priority += enablesOthers * sc.ppEnablesMul;
        reasons.push('Активирует ' + enablesOthers);
      }

      var needsOthers = 0;
      if (data.y) {
        for (var yi = 0; yi < data.y.length; yi++) {
          if (handCards.includes(yName(data.y[yi]))) needsOthers++;
        }
      }
      if (needsOthers > 0) {
        priority -= needsOthers * sc.ppNeedsMul;
        reasons.push('После синергии');
      }

      if (econ.includes('vp') && !econ.includes('prod') && !econ.includes('action')) {
        priority -= gensLeft * sc.ppVpMul;
        reasons.push('Только VP');
      }

      if (cardEl && typeof getCardCost === 'function') {
        var cardCost = getCardCost(cardEl);
        if (cardCost !== null && cardCost > myMC) {
          priority -= Math.min(sc.ppAffordCap, Math.round((cardCost - myMC) / sc.ppAffordDiv));
          reasons.push('Дорого (' + cardCost + ' MC)');
        }
      }

      var reqResult = typeof computeReqPriority === 'function'
        ? computeReqPriority(cardEl, pv, ctx)
        : { penalty: 0, reasons: [], unplayable: false };
      var reqUnplayable = reqResult.unplayable;
      priority -= reqResult.penalty || 0;
      for (var rqi = 0; rqi < (reqResult.reasons || []).length; rqi++) reasons.push(reqResult.reasons[rqi]);

      var maPriority = typeof scorePlayPriorityMA === 'function'
        ? scorePlayPriorityMA(name, data, cardTags, cardType, ctx, pv)
        : { bonus: 0, reasons: [] };
      priority += maPriority.bonus || 0;
      for (var mai = 0; mai < (maPriority.reasons || []).length; mai++) reasons.push(maPriority.reasons[mai]);

      scored.push({
        name: name,
        priority: priority,
        reasons: reasons,
        tier: data.t || '?',
        score: data.s || 0,
        type: 'play',
        mcValue: cardMCValue > 0 ? cardMCValue : 0,
        unplayable: reqUnplayable
      });
    }

    var tempMaxed = false;
    var oxyMaxed = false;
    var venusMaxed = false;
    var oceansMaxed = false;
    if (pv && pv.game) {
      tempMaxed = typeof pv.game.temperature === 'number' && pv.game.temperature >= sc.tempMax;
      oxyMaxed = typeof pv.game.oxygenLevel === 'number' && pv.game.oxygenLevel >= sc.oxyMax;
      venusMaxed = pv.game.venusScaleLevel != null && pv.game.venusScaleLevel >= sc.venusMax;
      oceansMaxed = typeof pv.game.oceans === 'number' && pv.game.oceans >= sc.oceansMax;
    }

    var tableauCards = typeof getMyTableauNames === 'function' ? getMyTableauNames() : [];
    var tp = (pv && pv.thisPlayer) ? pv.thisPlayer : null;
    var saturation = { temp: tempMaxed, oxy: oxyMaxed, venus: venusMaxed, oceans: oceansMaxed };
    var blueActions = typeof scoreBlueActions === 'function' ? scoreBlueActions(tableauCards, pv, saturation) : [];
    for (var bai = 0; bai < blueActions.length; bai++) scored.push(blueActions[bai]);

    if (tp && typeof scoreStandardActions === 'function') {
      var stdActions = scoreStandardActions(tp, pv, ctx, saturation);
      for (var sai = 0; sai < stdActions.length; sai++) scored.push(stdActions[sai]);
    }

    scored.sort(function(a, b) { return b.priority - a.priority; });
    return scored;
  }

  function applyPriorityBadges(input) {
    var documentObj = input && input.documentObj;
    var selector = input && input.selector;
    if (!documentObj || !selector) return;

    documentObj.querySelectorAll(selector).forEach(function(el) {
      var old = el.querySelector('.tm-priority-badge');
      if (old) old.remove();
      var oldMark = el.querySelector('.tm-play-mark');
      if (oldMark) oldMark.remove();
      el.classList.remove('tm-play-top1', 'tm-play-top2');
      el.removeAttribute('data-tm-priority');
    });
  }

  function injectPlayPriorityBadges(input) {
    var documentObj = input && input.documentObj;
    var selHand = input && input.selHand;
    var selDraft = input && input.selDraft;

    lastPriorityMap = {};
    applyPriorityBadges({ documentObj: documentObj, selector: selHand });
    applyPriorityBadges({ documentObj: documentObj, selector: selDraft });
  }

  function getDiscardAdvice(input) {
    var getMyHandNames = input && input.getMyHandNames;
    var detectMyCorp = input && input.detectMyCorp;
    var getMyTableauNames = input && input.getMyTableauNames;
    var getCachedPlayerContext = input && input.getCachedPlayerContext;
    var getPlayerVueData = input && input.getPlayerVueData;
    var ratings = input && input.ratings;
    var yName = input && input.yName;
    var documentObj = input && input.documentObj;
    var getCardCost = input && input.getCardCost;
    var getCardTags = input && input.getCardTags;
    var getCorpBoost = input && input.getCorpBoost;
    var combos = input && input.combos;

    if (typeof getMyHandNames !== 'function' || typeof detectMyCorp !== 'function' || typeof getMyTableauNames !== 'function' || typeof getPlayerVueData !== 'function') return null;
    var handCards = getMyHandNames();
    if (handCards.length < 6) return null;

    var myCorp = detectMyCorp();
    var myTableau = getMyTableauNames();
    var ctx = typeof getCachedPlayerContext === 'function' ? getCachedPlayerContext() : null;
    var pv = getPlayerVueData();
    var myMC = (pv && pv.thisPlayer) ? (pv.thisPlayer.megaCredits || 0) : 0;

    var scored = [];
    for (var i = 0; i < handCards.length; i++) {
      var name = handCards[i];
      var data = ratings ? ratings[name] : null;
      if (!data) continue;

      var keepScore = data.s || 50;
      var keepReasons = [];

      var synCount = 0;
      if (data.y) {
        for (var j = 0; j < data.y.length; j++) {
          if (myTableau.includes(yName(data.y[j]))) synCount++;
        }
      }
      for (var tj = 0; tj < myTableau.length; tj++) {
        var td = ratings ? ratings[myTableau[tj]] : null;
        if (td && td.y && td.y.some(function(e) { return yName(e) === name; })) synCount++;
      }
      if (synCount > 0) {
        keepScore += synCount * 5;
        keepReasons.push(synCount + ' синерг.');
      }

      var handSyn = 0;
      for (var hj = 0; hj < handCards.length; hj++) {
        if (handCards[hj] === name) continue;
        var hd = ratings ? ratings[handCards[hj]] : null;
        if (hd && hd.y && hd.y.some(function(e) { return yName(e) === name; })) handSyn++;
        if (data.y && data.y.some(function(e) { return yName(e) === handCards[hj]; })) handSyn++;
      }
      if (handSyn > 0) {
        keepScore += handSyn * 3;
        keepReasons.push('связь с ' + handSyn + ' в руке');
      }

      var cardCost = null;
      var cardEls = documentObj ? documentObj.querySelectorAll('.card-container[data-tm-card="' + name + '"]') : [];
      if (cardEls.length > 0 && typeof getCardCost === 'function') cardCost = getCardCost(cardEls[0]);
      if (cardCost !== null && cardCost > myMC * 1.5 && ctx && ctx.gensLeft <= 2) {
        keepScore -= 15;
        keepReasons.push('не потянуть');
      }

      if (data.e) {
        var eLower = data.e.toLowerCase();
        var isProd = eLower.includes('prod') || eLower.includes('прод');
        if (isProd && ctx && ctx.gensLeft <= 1) {
          keepScore -= 10;
          keepReasons.push('поздно для прод');
        }
      }

      if (myCorp && data.y && data.y.some(function(e) { return yName(e) === myCorp; })) {
        keepScore += 5;
        keepReasons.push('корп.');
      }

      var allCorpsHand = ctx && ctx._myCorps ? ctx._myCorps : (myCorp ? [myCorp] : []);
      if (data.e && cardEls.length > 0 && typeof getCardTags === 'function' && typeof getCorpBoost === 'function') {
        var cTags = getCardTags(cardEls[0]);
        var cType = 'green';
        if (cardEls[0].querySelector('.card-content--blue, .blue-action, [class*="blue"]')) cType = 'blue';
        var cbOpts = {
          eLower: data.e.toLowerCase(),
          cardTags: cTags,
          cardCost: cardCost,
          cardType: cType,
          cardName: name,
          ctx: ctx,
          globalParams: ctx ? ctx.globalParams : null
        };
        for (var hci = 0; hci < allCorpsHand.length; hci++) {
          var hcCorp = allCorpsHand[hci];
          var cb = getCorpBoost(hcCorp, cbOpts);
          if (cb !== 0) {
            keepScore += cb;
            keepReasons.push(formatCorpBoostReason(hcCorp, name, cb));
          }
        }
      }

      if (combos) {
        var bestCb = 0;
        for (var ci = 0; ci < combos.length; ci++) {
          var combo = combos[ci];
          if (!combo.cards.includes(name)) continue;
          var otherCards = combo.cards.filter(function(c) { return c !== name; });
          var matchCount = otherCards.filter(function(c) { return c === myCorp || myTableau.includes(c) || handCards.includes(c); }).length;
          if (matchCount > 0) {
            var cbonus = combo.r === 'godmode' ? 10 : combo.r === 'great' ? 7 : combo.r === 'good' ? 5 : 3;
            if (cbonus > bestCb) bestCb = cbonus;
          }
        }
        if (bestCb > 0) {
          keepScore += bestCb;
          keepReasons.push('комбо +' + bestCb);
        }
      }

      scored.push({ name: name, keepScore: keepScore, tier: data.t, reasons: keepReasons });
    }

    scored.sort(function(a, b) { return b.keepScore - a.keepScore; });
    return scored;
  }

  function getLastPriorityMap() {
    return lastPriorityMap;
  }

  global.TM_CONTENT_PLAY_PRIORITY = {
    scoreToTier: scoreToTier,
    normalizeOpeningHandBias: normalizeOpeningHandBias,
    isOpeningHandContext: isOpeningHandContext,
    getOpeningHandBias: getOpeningHandBias,
    detectOfferedCorps: detectOfferedCorps,
    getVisiblePreludeNames: getVisiblePreludeNames,
    getVisibleColonyNames: getVisibleColonyNames,
    getInitialDraftRatingScore: getInitialDraftRatingScore,
    getInitialDraftInfluence: getInitialDraftInfluence,
    withForcedCorpContext: withForcedCorpContext,
    scoreDraftCard: scoreDraftCard,
    computeReqPriority: computeReqPriority,
    scoreBlueActions: scoreBlueActions,
    scoreStandardActions: scoreStandardActions,
    invalidateStaleScores: invalidateStaleScores,
    scoreCorpByVisibleCards: scoreCorpByVisibleCards,
    scoreCardAgainstCorps: scoreCardAgainstCorps,
    adjustForResearch: adjustForResearch,
    computePlayPriorities: computePlayPriorities,
    injectPlayPriorityBadges: injectPlayPriorityBadges,
    getDiscardAdvice: getDiscardAdvice,
    getLastPriorityMap: getLastPriorityMap
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
