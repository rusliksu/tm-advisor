// TM Tier Overlay - Content hand UI helpers
(function(global) {
  'use strict';

  var lastPlayableCheck = 0;

  function forEachNode(nodes, fn) {
    if (!nodes || typeof fn !== 'function') return;
    for (var i = 0; i < nodes.length; i++) fn(nodes[i], i);
  }

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function addClass(el, cls) {
    if (!el || !cls) return;
    if (el.classList && typeof el.classList.add === 'function') {
      el.classList.add(cls);
      return;
    }
    var parts = String(el.className || '').split(/\s+/).filter(Boolean);
    if (parts.indexOf(cls) < 0) parts.push(cls);
    el.className = parts.join(' ');
  }

  function removeClass(el, cls) {
    if (!el || !cls) return;
    if (el.classList && typeof el.classList.remove === 'function') {
      el.classList.remove(cls);
      return;
    }
    el.className = String(el.className || '').split(/\s+/).filter(function(part) {
      return part && part !== cls;
    }).join(' ');
  }

  function hasClass(el, cls) {
    if (!el || !cls) return false;
    if (el.classList && typeof el.classList.contains === 'function') return el.classList.contains(cls);
    return String(el.className || '').split(/\s+/).filter(Boolean).indexOf(cls) >= 0;
  }

  function toTagArray(tags) {
    var out = [];
    if (!tags) return out;
    if (Array.isArray(tags)) return tags.slice();
    if (typeof tags.forEach === 'function') {
      tags.forEach(function(tag) {
        if (tag) out.push(tag);
      });
      return out;
    }
    return out;
  }

  function roundScore(value) {
    var n = Number(value);
    return isFinite(n) ? Math.round(n) : null;
  }

  var DEFERRED_SCALING_CASHOUTS = {
    'Terraforming Ganymede': { tag: 'jovian', label: 'late Jovian TR cashout' },
    'Social Events': { tag: 'mars', label: 'late Mars-tag TR cashout' }
  };

  function estimateGensLeftFromState(pv) {
    var game = pv && pv.game;
    if (!game) return null;
    var gen = Number(game.generation);
    if (!isFinite(gen)) return null;
    return Math.max(0, 9 - gen + 1);
  }

  function getGensLeft(input, pv) {
    var ctx = input && typeof input.getCachedPlayerContext === 'function'
      ? input.getCachedPlayerContext()
      : null;
    if (ctx && typeof ctx.gensLeft === 'number' && isFinite(ctx.gensLeft)) return ctx.gensLeft;
    if (input && typeof input.estimateGensLeft === 'function') {
      var est = Number(input.estimateGensLeft(pv));
      if (isFinite(est)) return est;
    }
    return estimateGensLeftFromState(pv);
  }

  function isLateGame(input, pv) {
    var gensLeft = getGensLeft(input, pv);
    if (gensLeft != null) return gensLeft <= 2;
    var gen = Number(pv && pv.game && pv.game.generation);
    return isFinite(gen) && gen >= 8;
  }

  function countFutureTagCards(cards, targetTag, selfName) {
    if (!cards || !targetTag) return 0;
    var count = 0;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i] || {};
      if (!card.name || card.name === selfName) continue;
      var tags = toTagArray(card.tags);
      if (tags.indexOf(targetTag) >= 0 || tags.indexOf('wild') >= 0) count++;
    }
    return count;
  }

  function deferredPlayReason(name, input, pv, cards) {
    if (!name || !DEFERRED_SCALING_CASHOUTS[name]) return '';
    if (isLateGame(input, pv)) return '';
    var def = DEFERRED_SCALING_CASHOUTS[name];
    var futureTags = countFutureTagCards(cards, def.tag, name);
    var gensLeft = getGensLeft(input, pv);
    if (futureTags <= 0 && gensLeft != null && gensLeft <= 3) return '';
    return def.label + (futureTags > 0 ? '; +' + futureTags + ' ' + def.tag + ' still in hand' : '');
  }

  function hasHelionHeatAsMC(player) {
    var tableau = player && player.tableau;
    if (!Array.isArray(tableau)) return false;
    for (var i = 0; i < tableau.length; i++) {
      if (compactText(tableau[i] && tableau[i].name).toLowerCase() === 'helion') return true;
    }
    return false;
  }

  function effectiveCost(card, input) {
    var cost = card && typeof card.cost === 'number' ? card.cost : 0;
    var ctx = input && typeof input.getCachedPlayerContext === 'function'
      ? input.getCachedPlayerContext()
      : null;
    var discounts = (ctx && ctx.discounts) ? ctx.discounts : {};
    if (input && typeof input.getEffectiveCost === 'function') {
      return input.getEffectiveCost(cost, new Set(card.tags || []), discounts);
    }
    var d = discounts._all || 0;
    var tags = card && card.tags ? card.tags : [];
    for (var i = 0; i < tags.length; i++) d += discounts[tags[i]] || 0;
    return Math.max(0, cost - d);
  }

  function buyingPower(card, pv) {
    var p = (pv && pv.thisPlayer) || {};
    var tags = (card && card.tags) || [];
    var bp = p.megaCredits || p.megacredits || 0;
    if (hasHelionHeatAsMC(p)) bp += p.heat || 0;
    if (tags.indexOf('building') >= 0) bp += (p.steel || 0) * (p.steelValue || 2);
    if (tags.indexOf('space') >= 0) bp += (p.titanium || 0) * (p.titaniumValue || 3);
    return bp;
  }

  function globalReqLabel(key) {
    if (key === 'oxygen') return 'O2';
    if (key === 'temperature') return 'temp';
    if (key === 'oceans') return 'oceans';
    if (key === 'venus') return 'Venus';
    return key;
  }

  function requirementBlockReason(el, card, input, pv) {
    var cardName = card && card.name;
    if (!cardName || !pv || !pv.game) return '';
    var cardGlobalReqs = input && input.cardGlobalReqs;
    var cardTagReqs = input && input.cardTagReqs;
    var ctx = input && typeof input.getCachedPlayerContext === 'function'
      ? input.getCachedPlayerContext()
      : null;

    if (cardGlobalReqs) {
      var greq = cardGlobalReqs[cardName];
      if (greq) {
        var gp = {
          oceans: pv.game.oceans,
          oxygen: pv.game.oxygenLevel,
          temperature: pv.game.temperature,
          venus: pv.game.venusScaleLevel
        };
        var myCorps = typeof input.detectMyCorps === 'function' ? input.detectMyCorps() : [];
        var reqFlex = typeof input.getRequirementFlexSteps === 'function'
          ? input.getRequirementFlexSteps(cardName, myCorps)
          : { any: 0, venus: 0 };
        for (var rk in greq) {
          if (!Object.prototype.hasOwnProperty.call(greq, rk)) continue;
          var rule = greq[rk];
          if (!rule || typeof rule !== 'object') continue;
          var cv = gp[rk];
          if (cv == null) continue;
          var step = rk === 'temperature' ? 2 : (rk === 'venus' ? 2 : 1);
          var flexSteps = (reqFlex.any || 0) + (rk === 'venus' ? (reqFlex.venus || 0) : 0);
          var effectiveMax = rule.max != null ? rule.max + flexSteps * step : null;
          var effectiveMin = rule.min != null ? rule.min - flexSteps * step : null;
          if (effectiveMax != null && cv > effectiveMax) {
            return 'Req closed: ' + globalReqLabel(rk) + ' ' + cv + '>' + effectiveMax;
          }
          if (effectiveMin != null && cv < effectiveMin) {
            return 'Req locked: ' + globalReqLabel(rk) + ' ' + cv + '/' + effectiveMin;
          }
        }
      }
    }

    if (cardTagReqs) {
      var treq = cardTagReqs[cardName];
      if (treq) {
        var myTags = (ctx && ctx.tags) ? ctx.tags : {};
        for (var tk in treq) {
          if (!Object.prototype.hasOwnProperty.call(treq, tk)) continue;
          if (typeof treq[tk] === 'object') continue;
          var have = (myTags[tk] || 0) + (tk !== 'wild' ? (myTags.wild || 0) : 0);
          if (have < treq[tk]) return 'Req locked: ' + tk + ' tags ' + have + '/' + treq[tk];
        }
      }
    }

    if (cardName && typeof input.getProductionFloorStatus === 'function') {
      var prodFloorStatus = input.getProductionFloorStatus(cardName, ctx);
      if (prodFloorStatus && prodFloorStatus.unplayable) {
        return compactText(prodFloorStatus.reasons && prodFloorStatus.reasons[0])
          .replace('Невозможно сыграть: ', 'Req locked: ');
      }
    }

    if (typeof input.evaluateBoardRequirements === 'function' && el && typeof el.querySelector === 'function') {
      var reqNode = el.querySelector('.card-requirements, .card-requirement');
      var reqText = reqNode ? compactText(reqNode.textContent || '') : '';
      if (reqText) {
        var boardReqs = input.evaluateBoardRequirements(reqText, ctx, pv);
        if (boardReqs && !boardReqs.metNow) {
          var unmet = boardReqs.unmet && boardReqs.unmet[0];
          if (unmet) return 'Req locked: ' + unmet.key + ' ' + unmet.have + '/' + unmet.need;
          return 'Req locked: board requirement';
        }
      }
    }

    return '';
  }

  function requirementsMetNow(el, card, input, pv) {
    return !requirementBlockReason(el, card, input, pv);
  }

  function isPlayableNow(el, card, input, pv) {
    if (!requirementsMetNow(el, card, input, pv)) return false;
    if (hasClass(el, 'tm-unplayable')) return false;
    if (hasClass(el, 'tm-playable')) return true;
    return buyingPower(card, pv) >= effectiveCost(card, input);
  }

  function nonPlayMarkerKind(row, score) {
    var reason = compactText(row && row.reason).toLowerCase();
    if (reason.indexOf('engine') >= 0 || reason.indexOf('prod') >= 0) return 'engine';
    if (score != null && score >= 55) return 'hold';
    return '';
  }

  function clearHandPriorityBadges(input) {
    var documentObj = input && input.documentObj;
    var selHand = input && input.selHand;
    if (!documentObj || !selHand) return;

    forEachNode(documentObj.querySelectorAll(selHand), function(el) {
      forEachNode(el.querySelectorAll('.tm-hand-priority-badge'), function(badge) {
        badge.remove();
      });
      removeClass(el, 'tm-hand-priority-card');
      removeClass(el, 'tm-hand-priority-card-1');
      removeClass(el, 'tm-hand-priority-card-2');
      removeClass(el, 'tm-hand-priority-card-3');
      removeClass(el, 'tm-hand-priority-card-hold');
      removeClass(el, 'tm-hand-priority-card-engine');
      removeClass(el, 'tm-hand-priority-card-late');
      if (typeof el.removeAttribute === 'function') {
        el.removeAttribute('data-tm-hand-priority');
        el.removeAttribute('data-tm-hand-priority-score');
        el.removeAttribute('data-tm-hand-priority-kind');
        el.removeAttribute('data-tm-hand-priority-lock');
      }
    });
  }

  function priorityBadgeStyle(rank, kind) {
    var play = kind === 'play';
    var background = kind === 'late'
      ? 'rgba(93,109,126,0.95)'
      : (kind === 'engine'
        ? 'rgba(22,160,133,0.95)'
        : (kind === 'hold'
          ? 'rgba(52,73,94,0.95)'
          : (rank === 1
            ? 'linear-gradient(135deg,#2ecc71,#17a673)'
            : (rank === 2 ? 'linear-gradient(135deg,#f1c40f,#e67e22)' : 'rgba(52,152,219,0.92)'))));
    var color = play && rank === 2 ? '#1b1f24' : '#fff';
    var minWidth = kind === 'play' ? '24px' : (kind === 'engine' ? '36px' : '34px');
    return 'position:absolute;top:2px;right:2px;min-width:' + minWidth + ';height:20px;border-radius:10px;' +
      'padding:0 6px;font-size:10px;font-weight:700;line-height:20px;text-align:center;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;z-index:125;' +
      'pointer-events:auto;cursor:help;box-shadow:0 1px 6px rgba(0,0,0,0.42);' +
      'background:' + background + ';color:' + color;
  }

  function injectHandPriorityBadges(input) {
    var enabled = input && input.enabled;
    var advisor = input && (input.advisor || input.tmBrain);
    var documentObj = input && input.documentObj;
    var getPlayerVueData = input && input.getPlayerVueData;
    var getCardCost = input && input.getCardCost;
    var getCardTags = input && input.getCardTags;
    var selHand = input && input.selHand;

    if (!documentObj || !selHand) return;
    clearHandPriorityBadges({ documentObj: documentObj, selHand: selHand });
    if (!enabled || !advisor || typeof advisor.rankHandCards !== 'function' || typeof getPlayerVueData !== 'function') return;

    var pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer) return;

    var cards = [];
    var elementsByName = {};
    forEachNode(documentObj.querySelectorAll(selHand), function(el) {
      var name = typeof el.getAttribute === 'function' ? el.getAttribute('data-tm-card') : '';
      if (!name) return;
      var cost = typeof getCardCost === 'function' ? getCardCost(el) : null;
      var tags = typeof getCardTags === 'function' ? toTagArray(getCardTags(el)) : [];
      cards.push({
        name: name,
        cost: cost == null ? 0 : cost,
        calculatedCost: cost == null ? 0 : cost,
        tags: tags,
        el: el
      });
      if (!elementsByName[name]) elementsByName[name] = [];
      elementsByName[name].push(el);
    });
    if (!cards.length) return;

    var ranked = [];
    try {
      ranked = advisor.rankHandCards(cards, pv) || [];
    } catch (_err) {
      return;
    }
    var displayRows = [];
    for (var ri = 0; ri < ranked.length; ri++) {
      var rankedRow = ranked[ri] || {};
      var rankedName = rankedRow.name || '';
      var originalScore = roundScore(rankedRow.score);
      var deferReason = deferredPlayReason(rankedName, input, pv, cards);
      displayRows.push({
        row: rankedRow,
        deferredReason: deferReason,
        adjustedScore: (originalScore == null ? 0 : originalScore) - (deferReason ? 45 : 0),
        originalIndex: ri
      });
    }
    displayRows.sort(function(a, b) {
      if (b.adjustedScore !== a.adjustedScore) return b.adjustedScore - a.adjustedScore;
      return a.originalIndex - b.originalIndex;
    });

    var applied = 0;
    var playRank = 0;
    for (var i = 0; i < displayRows.length && applied < 3; i++) {
      var displayRow = displayRows[i] || {};
      var row = displayRow.row || {};
      var name = row.name || '';
      var pool = elementsByName[name];
      if (!name || !pool || !pool.length) continue;
      var el = pool.shift();
      var card = null;
      for (var ci = 0; ci < cards.length; ci++) {
        if (cards[ci].name === name && cards[ci].el === el) { card = cards[ci]; break; }
      }
      if (!card) card = { name: name, cost: row.cost || 0, tags: [] };
      var score = roundScore(row.score);
      var lockReason = requirementBlockReason(el, card, input, pv);
      var kind = displayRow.deferredReason ? 'late' : (!lockReason && isPlayableNow(el, card, input, pv) ? 'play' : nonPlayMarkerKind(row, score));
      if (!kind) continue;
      var rank = 0;
      if (kind === 'play') {
        playRank++;
        rank = playRank;
        if (rank > 3) continue;
      }
      var badge = documentObj.createElement('div');
      badge.className = 'tm-hand-priority-badge tm-hand-priority-badge-' + kind + (rank ? ' tm-hand-priority-badge-' + rank : '');
      badge.textContent = kind === 'play' ? ('#' + rank) : (kind === 'engine' ? 'eng' : kind);
      badge.style.cssText = priorityBadgeStyle(rank, kind);
      var reason = compactText(row.reason || row.detail || '');
      badge.title = (kind === 'play' ? 'Play now #' + rank + ': ' : (kind === 'late' ? 'Hold for late game: ' : (kind === 'engine' ? 'Engine hold: ' : 'Hold: '))) + name +
        (score == null ? '' : '\nScore: ' + score) +
        (displayRow.deferredReason ? '\n' + displayRow.deferredReason : '') +
        (lockReason ? '\n' + lockReason : '') +
        (reason ? '\n' + reason : '');

      addClass(el, 'tm-hand-priority-card');
      if (kind === 'play') addClass(el, 'tm-hand-priority-card-' + rank);
      else addClass(el, 'tm-hand-priority-card-' + kind);
      if (typeof el.setAttribute === 'function') {
        if (kind === 'play') el.setAttribute('data-tm-hand-priority', String(rank));
        if (score != null) el.setAttribute('data-tm-hand-priority-score', String(score));
        el.setAttribute('data-tm-hand-priority-kind', kind);
        if (lockReason) el.setAttribute('data-tm-hand-priority-lock', lockReason);
      }
      el.style.position = 'relative';
      el.appendChild(badge);
      applied++;
    }
  }

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
    clearHandPriorityBadges: clearHandPriorityBadges,
    highlightPlayable: highlightPlayable,
    injectHandPriorityBadges: injectHandPriorityBadges,
    injectDiscardHints: injectDiscardHints
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
