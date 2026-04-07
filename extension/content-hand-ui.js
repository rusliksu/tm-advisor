// TM Tier Overlay - Content hand UI helpers
(function(global) {
  'use strict';

  var lastPlayableCheck = 0;

  function injectDiscardHints(input) {
    var enabled = input && input.enabled;
    var getDiscardAdvice = input && input.getDiscardAdvice;
    var documentObj = input && input.documentObj;
    var selHand = input && input.selHand;

    if (!enabled || typeof getDiscardAdvice !== 'function' || !documentObj || !selHand) return;
    var advice = getDiscardAdvice();
    if (!advice || advice.length < 6) return;

    var threshold = advice.length >= 8 ? 3 : 2;
    var discardSet = new Set();
    for (var i = Math.max(0, advice.length - threshold); i < advice.length; i++) {
      if (advice[i].keepScore !== undefined && advice[i].keepScore >= 55) continue;
      discardSet.add(advice[i].name);
    }

    documentObj.querySelectorAll(selHand).forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      var oldHint = el.querySelector('.tm-discard-hint');
      if (oldHint) oldHint.remove();

      if (discardSet.has(name)) {
        var hint = documentObj.createElement('div');
        hint.className = 'tm-discard-hint';
        hint.textContent = '📤 продать';
        hint.style.cssText = 'position:absolute;bottom:2px;right:2px;font-size:9px;color:#ff9800;background:rgba(0,0,0,0.7);padding:1px 4px;border-radius:3px;z-index:5;pointer-events:none';
        el.style.position = 'relative';
        el.appendChild(hint);
      }
    });
  }

  function highlightPlayable(input) {
    var dateNow = input && input.dateNow;
    var documentObj = input && input.documentObj;
    var getPlayerVueData = input && input.getPlayerVueData;
    var defaultSteelVal = input && input.defaultSteelVal;
    var defaultTiVal = input && input.defaultTiVal;
    var getCachedPlayerContext = input && input.getCachedPlayerContext;
    var getCardCost = input && input.getCardCost;
    var getCardTags = input && input.getCardTags;
    var getEffectiveCost = input && input.getEffectiveCost;
    var cardGlobalReqs = input && input.cardGlobalReqs;
    var cardTagReqs = input && input.cardTagReqs;
    var getRequirementFlexSteps = input && input.getRequirementFlexSteps;
    var detectMyCorps = input && input.detectMyCorps;
    var evaluateBoardRequirements = input && input.evaluateBoardRequirements;
    var getProductionFloorStatus = input && input.getProductionFloorStatus;
    var selHand = input && input.selHand;

    if (!documentObj || typeof getPlayerVueData !== 'function' || !selHand) return;
    var now = typeof dateNow === 'function' ? dateNow() : Date.now();
    if (now - lastPlayableCheck < 2000) return;
    lastPlayableCheck = now;

    documentObj.querySelectorAll('.tm-playable, .tm-unplayable').forEach(function(el) {
      el.classList.remove('tm-playable', 'tm-unplayable');
    });

    var pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) return;
    var p = pv.thisPlayer;
    var mc = p.megaCredits || 0;
    var steel = p.steel || 0;
    var steelVal = p.steelValue || defaultSteelVal;
    var ti = p.titanium || 0;
    var tiVal = p.titaniumValue || defaultTiVal;
    var heat = p.heat || 0;
    var isHelion = false;
    if (p.tableau) {
      for (var i = 0; i < p.tableau.length; i++) {
        if (((p.tableau[i].name || '') + '').toLowerCase() === 'helion') { isHelion = true; break; }
      }
    }
    var heatMC = isHelion ? heat : 0;

    var ctx = typeof getCachedPlayerContext === 'function' ? getCachedPlayerContext() : null;
    var discounts = (ctx && ctx.discounts) ? ctx.discounts : {};

    documentObj.querySelectorAll(selHand).forEach(function(el) {
      var cost = typeof getCardCost === 'function' ? getCardCost(el) : null;
      if (cost == null) return;
      var tags = typeof getCardTags === 'function' ? getCardTags(el) : new Set();
      var effectiveCost = typeof getEffectiveCost === 'function' ? getEffectiveCost(cost, tags, discounts) : cost;
      var bp = mc + heatMC;
      if (tags.has('building')) bp += steel * steelVal;
      if (tags.has('space')) bp += ti * tiVal;
      var reqMet = true;
      var cardName = el.getAttribute('data-tm-card');
      if (cardName && cardGlobalReqs && pv.game) {
        var greq = cardGlobalReqs[cardName];
        if (greq) {
          var gp = { oxy: pv.game.oxygenLevel, temp: pv.game.temperature, oceans: pv.game.oceans, venus: pv.game.venusScaleLevel };
          var pm = { oceans: 'oceans', oxygen: 'oxy', temperature: 'temp', venus: 'venus' };
          var myCorps = typeof detectMyCorps === 'function' ? detectMyCorps() : [];
          var reqFlex = typeof getRequirementFlexSteps === 'function' ? getRequirementFlexSteps(cardName, myCorps) : { any: 0, venus: 0 };
          for (var rk in pm) {
            if (!greq[rk]) continue;
            var cv = gp[pm[rk]];
            if (cv == null) continue;
            var step = rk === 'temperature' ? 2 : (rk === 'venus' ? 2 : 1);
            var flexSteps = reqFlex.any + (rk === 'venus' ? reqFlex.venus : 0);
            var effectiveMax = greq[rk].max != null ? greq[rk].max + flexSteps * step : null;
            var effectiveMin = greq[rk].min != null ? greq[rk].min - flexSteps * step : null;
            if (effectiveMax != null && cv > effectiveMax) reqMet = false;
            if (effectiveMin != null && cv < effectiveMin) reqMet = false;
          }
        }
      }
      if (reqMet && cardName && cardTagReqs) {
        var treq = cardTagReqs[cardName];
        if (treq) {
          var myTags = (ctx && ctx.tags) ? ctx.tags : {};
          for (var tk in treq) {
            if (typeof treq[tk] === 'object') continue;
            if ((myTags[tk] || 0) < treq[tk]) { reqMet = false; break; }
          }
        }
      }
      if (reqMet) {
        var reqNode = el.querySelector('.card-requirements, .card-requirement');
        var reqText = reqNode ? (reqNode.textContent || '').trim() : '';
        var boardReqs = typeof evaluateBoardRequirements === 'function' ? evaluateBoardRequirements(reqText, ctx, pv) : null;
        if (boardReqs && !boardReqs.metNow) reqMet = false;
      }
      if (reqMet && cardName && typeof getProductionFloorStatus === 'function') {
        var prodFloorStatus = getProductionFloorStatus(cardName, ctx);
        if (prodFloorStatus.unplayable) reqMet = false;
      }
      if (bp >= effectiveCost && reqMet) {
        el.classList.add('tm-playable');
      } else {
        el.classList.add('tm-unplayable');
      }
    });
  }

  global.TM_CONTENT_HAND_UI = {
    highlightPlayable: highlightPlayable,
    injectDiscardHints: injectDiscardHints
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
