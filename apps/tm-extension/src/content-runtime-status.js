// TM Tier Overlay - Content runtime status helpers
(function(global) {
  'use strict';

  var gameStartTime = Date.now();
  var gameEndNotified = false;

  function addSellBadge(contentOverlays, el, detail) {
    if (!el) return;
    if (contentOverlays && typeof contentOverlays.addSellBadge === 'function') {
      contentOverlays.addSellBadge({ el: el, detail: detail });
      return;
    }
    var hint = global.document.createElement('div');
    hint.className = 'tm-sell-hint';
    var text = 'SELL 💰 1MC';
    if (detail) text += ' (' + detail + ')';
    hint.textContent = text;
    hint.style.cssText = 'position:absolute;bottom:2px;left:2px;font-size:9px;font-weight:bold;color:#999;background:rgba(40,40,40,0.85);padding:1px 5px;border-radius:3px;z-index:6;pointer-events:none;border:1px solid #666';
    el.style.position = 'relative';
    el.appendChild(hint);
  }

  function addPlayBadge(contentOverlays, el, ev) {
    if (!el) return;
    if (contentOverlays && typeof contentOverlays.addPlayBadge === 'function') {
      contentOverlays.addPlayBadge({ el: el, ev: ev });
      return;
    }
    var hint = global.document.createElement('div');
    hint.className = 'tm-sell-hint';
    hint.textContent = '▶ PLAY +' + ev + ' MC';
    hint.style.cssText = 'position:absolute;bottom:2px;left:2px;font-size:9px;font-weight:bold;color:#4caf50;background:rgba(40,40,40,0.85);padding:1px 5px;border-radius:3px;z-index:6;pointer-events:none;border:1px solid #4caf50';
    el.style.position = 'relative';
    el.appendChild(hint);
  }

  function injectSellIndicators(input) {
    var enabled = input && input.enabled;
    var documentObj = input && input.documentObj;
    var getCachedPlayerContext = input && input.getCachedPlayerContext;
    var getPlayerVueData = input && input.getPlayerVueData;
    var selHand = input && input.selHand;
    var getCardCost = input && input.getCardCost;
    var getCachedCardTags = input && input.getCachedCardTags;
    var getEffectiveCost = input && input.getEffectiveCost;
    var computeCardValue = input && input.computeCardValue;
    var contentOverlays = input && input.contentOverlays;

    if (!enabled || !documentObj || typeof getCachedPlayerContext !== 'function') return;

    var ctx = getCachedPlayerContext();
    if (!ctx || ctx.gensLeft > 1) {
      documentObj.querySelectorAll('.tm-sell-hint, .tm-sell-summary').forEach(function(el) { el.remove(); });
      return;
    }

    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    var myMC = (pv && pv.thisPlayer) ? (pv.thisPlayer.megaCredits || 0) : 0;
    var handEls = documentObj.querySelectorAll(selHand || '');
    if (handEls.length === 0) return;

    var o2Maxed = ctx.globalParams && ctx.globalParams.oxy >= 14;
    var tempMaxed = ctx.globalParams && ctx.globalParams.temp >= 8;
    var cvOpts = { o2Maxed: o2Maxed, tempMaxed: tempMaxed };

    var sellCount = 0;

    handEls.forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      var oldHint = el.querySelector('.tm-sell-hint');
      if (oldHint) oldHint.remove();
      if (!name) return;

      var fx = (typeof TM_CARD_EFFECTS !== 'undefined') ? TM_CARD_EFFECTS[name] : null;
      var cardCost = typeof getCardCost === 'function' ? getCardCost(el) : null;
      if (cardCost == null && fx && fx.c != null) cardCost = fx.c;

      var effCost = cardCost || 0;
      if (ctx.discounts && cardCost != null && typeof getCachedCardTags === 'function' && typeof getEffectiveCost === 'function') {
        var cardTags = getCachedCardTags(el);
        effCost = getEffectiveCost(cardCost, cardTags, ctx.discounts);
        if (cardTags.has('building') && ctx.steel > 0) {
          effCost = Math.max(0, effCost - ctx.steel * ctx.steelVal);
        } else if (cardTags.has('space') && ctx.titanium > 0) {
          effCost = Math.max(0, effCost - ctx.titanium * ctx.tiVal);
        }
      }

      if (effCost > myMC) {
        sellCount++;
        addSellBadge(contentOverlays, el, 'нет MC');
        return;
      }

      if (fx && typeof computeCardValue === 'function') {
        var playValue = computeCardValue(fx, 0, cvOpts);
        var netEV = playValue - effCost;
        if (netEV < 1) {
          sellCount++;
          addSellBadge(contentOverlays, el, netEV < -5 ? 'EV ' + Math.round(netEV) : null);
        } else {
          addPlayBadge(contentOverlays, el, Math.round(netEV));
        }
      } else {
        var badge = el.querySelector('.tm-tier-badge');
        if (badge) {
          var scoreText = badge.textContent || '';
          var scoreMatch = scoreText.match(/(\d+\.?\d*)$/);
          var adjScore = scoreMatch ? parseFloat(scoreMatch[1]) : 50;
          if (adjScore < 55) {
            sellCount++;
            addSellBadge(contentOverlays, el);
          }
        }
      }
    });

    var oldSummary = documentObj.querySelector('.tm-sell-summary');
    if (oldSummary) oldSummary.remove();
    if (sellCount <= 0) return;

    var handBlock = documentObj.querySelector('.player_home_block--hand');
    if (!handBlock) return;

    var summary = contentOverlays && typeof contentOverlays.createSellSummary === 'function'
      ? contentOverlays.createSellSummary({ sellCount: sellCount })
      : null;
    if (!summary) {
      summary = documentObj.createElement('div');
      summary.className = 'tm-sell-summary';
      summary.innerHTML = '💰 Продать ' + sellCount + ' карт = ' + sellCount + ' MC';
      summary.style.cssText = 'color:#aaa;font-size:11px;text-align:center;padding:2px 0;background:rgba(0,0,0,0.3);border-radius:4px;margin:2px 8px';
    }
    handBlock.insertBefore(summary, handBlock.firstChild);
  }

  function checkGameEnd(input) {
    var getPlayerVueData = input && input.getPlayerVueData;
    var detectGeneration = input && input.detectGeneration;
    var dateNow = input && input.dateNow;
    var showToast = input && input.showToast;
    var postgameHelpers = input && input.postgameHelpers;
    var recordGameStats = input && input.recordGameStats;
    var localStorageObj = input && input.localStorageObj;

    if (gameEndNotified || typeof getPlayerVueData !== 'function') return;

    var pv = getPlayerVueData();
    if (!pv || !pv.game || !pv.thisPlayer) return;
    if (pv.game.phase !== 'end') return;

    gameEndNotified = true;

    if (!localStorageObj) {
      try {
        localStorageObj = global.localStorage;
      } catch (e) {
        localStorageObj = null;
      }
    }

    var gameId = (pv.game.id || pv.id || '').replace(/^[pg]/, '');
    var exportKey = 'tm_exported_' + gameId;
    var alreadyExported = false;
    try {
      alreadyExported = !!(localStorageObj && localStorageObj.getItem(exportKey));
    } catch (e) {}
    if (alreadyExported) return;

    var now = typeof dateNow === 'function' ? dateNow() : Date.now();
    var gen = typeof detectGeneration === 'function' ? detectGeneration() : 0;
    var elapsed = now - gameStartTime;
    var p = pv.thisPlayer;
    var tr = p.terraformRating || 0;
    var cardsPlayed = p.tableau ? p.tableau.length : 0;
    var mins = Math.round(elapsed / 60000);

    if (typeof showToast === 'function') {
      showToast('Конец игры! Пок. ' + gen + ' | TR ' + tr + ' | ' + cardsPlayed + ' карт | ' + mins + ' мин', 'great');
    }
    if (postgameHelpers && typeof postgameHelpers.clearPostGameInsights === 'function') {
      postgameHelpers.clearPostGameInsights();
    }

    if (typeof recordGameStats === 'function') {
      global.setTimeout(function() { recordGameStats(); }, 5000);
    }

    try {
      if (localStorageObj) localStorageObj.setItem(exportKey, '1');
    } catch (e) {}
  }

  global.TM_CONTENT_RUNTIME_STATUS = {
    injectSellIndicators: injectSellIndicators,
    checkGameEnd: checkGameEnd
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
