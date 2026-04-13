// TM Tier Overlay — Content overlay render helpers
(function(global) {
  'use strict';

  function clearReasonPayloadFallback(el) {
    if (!el) return;
    el.removeAttribute('data-tm-reasons');
    el.removeAttribute('data-tm-reason-rows');
  }

  function applyReasonPayload(el, source, setReasonPayload, clearReasonPayload) {
    if (!el) return;
    if (typeof setReasonPayload === 'function') {
      setReasonPayload(el, source);
      return;
    }
    var rows = [];
    if (source && Array.isArray(source.reasonRows) && source.reasonRows.length > 0) rows = source.reasonRows;
    else if (source && Array.isArray(source.reasons) && source.reasons.length > 0) {
      rows = source.reasons.map(function(reason) { return { text: reason }; });
    }
    if (rows.length === 0) {
      if (typeof clearReasonPayload === 'function') clearReasonPayload(el);
      else clearReasonPayloadFallback(el);
      return;
    }
    el.setAttribute('data-tm-reasons', rows.map(function(row) { return row.text || ''; }).join('|'));
    try {
      el.setAttribute('data-tm-reason-rows', JSON.stringify(rows));
    } catch (e) {
      el.removeAttribute('data-tm-reason-rows');
    }
  }

  function updateBadgeScore(input) {
    var badge = input && input.badge;
    var origTier = input && input.origTier;
    var origScore = input && input.origScore;
    var total = input && input.total;
    var extraClass = input && input.extraClass;
    var displayTotal = input && input.displayTotal;
    var forceContextDisplay = input && input.forceContextDisplay;
    var scoreToTier = input && input.scoreToTier;
    if (!badge || typeof scoreToTier !== 'function') return origTier || '?';

    var adjTotal = Math.round(total * 10) / 10;
    var shownTotal = Math.round((displayTotal != null ? displayTotal : total) * 10) / 10;
    var delta = Math.round((adjTotal - origScore) * 10) / 10;
    var newTier = scoreToTier(adjTotal);
    if (delta === 0) {
      if (forceContextDisplay) {
        badge.innerHTML = origTier + origScore +
          '<span class="tm-badge-arrow">\u2192</span>' +
          newTier + shownTotal;
      } else {
        badge.innerHTML = newTier + ' ' + shownTotal;
      }
    } else {
      var cls = delta > 0 ? 'tm-delta-up' : 'tm-delta-down';
      var sign = delta > 0 ? '+' : '';
      badge.innerHTML = origTier + origScore +
        '<span class="tm-badge-arrow">\u2192</span>' +
        newTier + shownTotal +
        ' <span class="' + cls + '">' + sign + delta + '</span>';
    }
    badge.className = 'tm-tier-badge tm-tier-' + newTier + (extraClass || '');
    return newTier;
  }

  function addSellBadge(input) {
    var el = input && input.el;
    var detail = input && input.detail;
    if (!el) return;

    var hint = document.createElement('div');
    hint.className = 'tm-sell-hint';
    var text = 'SELL \uD83D\uDCB0 1MC';
    if (detail) text += ' (' + detail + ')';
    hint.textContent = text;
    hint.style.cssText = 'position:absolute;bottom:2px;left:2px;font-size:9px;font-weight:bold;color:#999;background:rgba(40,40,40,0.85);padding:1px 5px;border-radius:3px;z-index:6;pointer-events:none;border:1px solid #666';
    el.style.position = 'relative';
    el.appendChild(hint);
  }

  function addPlayBadge(input) {
    var el = input && input.el;
    var ev = input && input.ev;
    if (!el) return;

    var hint = document.createElement('div');
    hint.className = 'tm-sell-hint';
    hint.textContent = '\u25B6 PLAY +' + ev + ' MC';
    hint.style.cssText = 'position:absolute;bottom:2px;left:2px;font-size:9px;font-weight:bold;color:#4caf50;background:rgba(40,40,40,0.85);padding:1px 5px;border-radius:3px;z-index:6;pointer-events:none;border:1px solid #4caf50';
    el.style.position = 'relative';
    el.appendChild(hint);
  }

  function renderCardOverlay(input) {
    var item = input && input.item;
    var scored = input && input.scored;
    var getCardCost = input && input.getCardCost;
    var getCachedPlayerContext = input && input.getCachedPlayerContext;
    var getCardTags = input && input.getCardTags;
    var getEffectiveCost = input && input.getEffectiveCost;
    var getPlayerVueData = input && input.getPlayerVueData;
    var tmBrain = input && input.tmBrain;
    var cardEffects = input && input.cardEffects;
    var ratings = input && input.ratings;
    var ruName = input && input.ruName;
    var yName = input && input.yName;
    if (!item) return null;

    var adjTotal28 = Math.round(item.total * 10) / 10;
    var rec28, recClass28;
    if (adjTotal28 >= 70) { rec28 = '\u0411\u0415\u0420\u0418'; recClass28 = 'tm-iov-take'; }
    else if (adjTotal28 >= 55) { rec28 = 'OK'; recClass28 = 'tm-iov-ok'; }
    else { rec28 = '\u041F\u0410\u0421\u0421'; recClass28 = 'tm-iov-skip'; }

    var overlay28 = document.createElement('div');
    overlay28.className = 'tm-inline-overlay';
    var ovHTML = '<div class="tm-iov-rec ' + recClass28 + '">' + rec28 + '</div>';

    var rank28 = Array.isArray(scored) ? (scored.indexOf(item) + 1) : 0;
    if (rank28 === 1) ovHTML += '<div class="tm-iov-rank">#1</div>';
    else if (rank28 === 2) ovHTML += '<div class="tm-iov-rank tm-iov-rank2">#2</div>';

    var cost28 = typeof getCardCost === 'function' ? getCardCost(item.el) : null;
    if (cost28 != null) {
      var ctx28 = typeof getCachedPlayerContext === 'function' ? getCachedPlayerContext() : null;
      var disc28 = ctx28 && ctx28.discounts ? ctx28.discounts : {};
      var tags28 = typeof getCardTags === 'function' ? getCardTags(item.el) : new Set();
      var effCost28 = typeof getEffectiveCost === 'function'
        ? getEffectiveCost(cost28, tags28, disc28)
        : cost28;
      var costStr28 = effCost28 < cost28 ? effCost28 + '/<s>' + cost28 + '</s>' : '' + cost28;
      ovHTML += '<div class="tm-iov-cost">' + costStr28 + ' MC</div>';
    }

    if (tmBrain && tmBrain.scoreCard && cost28 != null) {
      var pvEv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
      if (pvEv) {
        var evState = { game: pvEv.game, thisPlayer: pvEv.thisPlayer, players: (pvEv.game && pvEv.game.players) || [] };
        var evVal = tmBrain.scoreCard({ name: item.name, calculatedCost: cost28 }, evState);
        var evColor = evVal > 5 ? '#2ecc71' : evVal > 0 ? '#f1c40f' : '#e74c3c';
        ovHTML += '<div style="font-size:10px;color:' + evColor + '">EV ' + (evVal > 0 ? '+' : '') + Math.round(evVal) + ' MC</div>';
      }
    }

    var ctx28vp = typeof getCachedPlayerContext === 'function' ? getCachedPlayerContext() : null;
    if (ctx28vp && ctx28vp.gensLeft <= 1 && cost28 != null && cardEffects) {
      var fx28vp = cardEffects[item.name];
      if (fx28vp) {
        var vpTotal28 = (fx28vp.vp || 0) + (fx28vp.tr || 0) + (fx28vp.tmp || 0) + (fx28vp.o2 || 0) + (fx28vp.oc || 0) + (fx28vp.vn || 0);
        if (fx28vp.grn) vpTotal28 += fx28vp.grn * (ctx28vp.globalParams && ctx28vp.globalParams.oxy < 14 ? 2 : 1);
        if (vpTotal28 > 0) {
          var effCost28vp = cost28 + 3;
          var ratio28 = Math.round(effCost28vp / vpTotal28 * 10) / 10;
          ovHTML += '<div class="tm-iov-vp">' + vpTotal28 + ' VP за ' + effCost28vp + ' MC (' + ratio28 + '/VP)</div>';
        }
      }
    }

    var reasons28 = Array.isArray(item.reasons) ? item.reasons.slice(0, 3) : [];
    if (reasons28.length > 0) {
      ovHTML += '<div class="tm-iov-reasons">';
      for (var ri28 = 0; ri28 < reasons28.length; ri28++) {
        var rText = reasons28[ri28];
        if (rText.length > 30) rText = rText.substring(0, 30) + '\u2026';
        ovHTML += '<div class="tm-iov-reason">' + rText + '</div>';
      }
      ovHTML += '</div>';
    }

    var rData28 = ratings ? ratings[item.name] : null;
    if (rData28 && rData28.y && rData28.y.length > 0 && typeof yName === 'function') {
      var synName28 = yName(rData28.y[0]);
      var synShort28 = synName28.split(' ')[0];
      var alreadyInReasons28 = Array.isArray(item.reasons) && item.reasons.some(function(r) { return r.indexOf(synShort28) !== -1; });
      if (!alreadyInReasons28) {
        if (synName28.length > 20) synName28 = synName28.substring(0, 20) + '\u2026';
        ovHTML += '<div class="tm-iov-syn">\uD83D\uDD17 ' + synName28 + '</div>';
      }
    }

    if (item.hateDraft) {
      var hateLabel = '\uD83D\uDEAB' + item.hateDraft.label;
      if (hateLabel.length > 22) hateLabel = hateLabel.substring(0, 22) + '\u2026';
      ovHTML += '<div class="tm-iov-hate" style="font-size:9px;color:#e67e22;font-weight:bold;margin-top:2px">' + hateLabel + '</div>';
    }

    overlay28.innerHTML = ovHTML;
    return overlay28;
  }

  function resetDraftOverlays(input) {
    var revealPendingContextBadge = input && input.revealPendingContextBadge;
    var clearReasonPayload = input && input.clearReasonPayload;

    var intelBanner = document.querySelector('.tm-draft-intel');
    if (intelBanner) intelBanner.remove();
    document.querySelectorAll('.tm-rec-best').forEach(function(el) { el.classList.remove('tm-rec-best'); });
    document.querySelectorAll('[data-tm-reasons], [data-tm-reason-rows]').forEach(function(el) {
      if (typeof clearReasonPayload === 'function') clearReasonPayload(el);
      else {
        el.removeAttribute('data-tm-reasons');
        el.removeAttribute('data-tm-reason-rows');
      }
    });
    document.querySelectorAll('.tm-tier-badge[data-tm-original]').forEach(function(badge) {
      badge.textContent = badge.getAttribute('data-tm-original');
      badge.removeAttribute('data-tm-original');
      if (typeof revealPendingContextBadge === 'function') revealPendingContextBadge(badge);
      var origTier = badge.getAttribute('data-tm-orig-tier');
      if (origTier) {
        badge.className = 'tm-tier-badge tm-tier-' + origTier;
        badge.removeAttribute('data-tm-orig-tier');
      }
    });
  }

  function createSellSummary(input) {
    var sellCount = input && input.sellCount;
    if (!sellCount) return null;

    var summary = document.createElement('div');
    summary.className = 'tm-sell-summary';
    summary.innerHTML = '\uD83D\uDCB0 Продать ' + sellCount + ' карт = ' + sellCount + ' MC';
    summary.style.cssText = 'color:#aaa;font-size:11px;text-align:center;padding:2px 0;background:rgba(0,0,0,0.3);border-radius:4px;margin:2px 8px';
    return summary;
  }

  function applyDraftRecommendationCardUi(input) {
    var item = input && input.item;
    var scored = input && input.scored;
    var bestScore = input && input.bestScore;
    var isDraftOrResearch = input && input.isDraftOrResearch;
    var ratings = input && input.ratings;
    var revealPendingContextBadge = input && input.revealPendingContextBadge;
    var scoreToTier = input && input.scoreToTier;
    var overlayInput = input && input.overlayInput;
    var setReasonPayload = input && input.setReasonPayload;
    var clearReasonPayload = input && input.clearReasonPayload;
    if (!item || !item.el) return;

    var itemRankScore = item.uncappedTotal != null ? item.uncappedTotal : item.total;
    var isBest = itemRankScore >= bestScore - 5;
    var hasBonus = item.reasons.length > 0;

    if (isBest && hasBonus) item.el.classList.add('tm-rec-best');
    else item.el.classList.remove('tm-rec-best');

    var badge = item.el.querySelector('.tm-tier-badge');
    if (badge) {
      var origData = ratings ? ratings[item.name] : null;
      var origTier = origData ? origData.t : 'C';
      var origScore = origData ? origData.s : 0;

      if (!badge.hasAttribute('data-tm-original')) {
        badge.setAttribute('data-tm-original', badge.textContent);
        badge.setAttribute('data-tm-orig-tier', origTier);
      }

      var newTier = updateBadgeScore({
        badge: badge,
        origTier: origTier,
        origScore: origScore,
        total: item.total,
        extraClass: '',
        displayTotal: item.uncappedTotal,
        forceContextDisplay: true,
        scoreToTier: scoreToTier
      });
      if (typeof revealPendingContextBadge === 'function') revealPendingContextBadge(badge);

      if (newTier === 'D' || newTier === 'F') item.el.classList.add('tm-dim');
      else item.el.classList.remove('tm-dim');
    }

    applyReasonPayload(item.el, item, setReasonPayload, clearReasonPayload);

    var oldOverlay = item.el.querySelector('.tm-inline-overlay');
    if (oldOverlay) oldOverlay.remove();
    if (!isDraftOrResearch) return;

    var overlay = renderCardOverlay(Object.assign({ item: item, scored: scored }, overlayInput || {}));
    if (overlay) item.el.appendChild(overlay);
  }

  function notifyDraftRecommendationToasts(input) {
    var isDraftOrResearch = input && input.isDraftOrResearch;
    var scored = input && input.scored;
    var bestScore = input && input.bestScore;
    var gen = input && input.gen;
    var canShowToast = input && input.canShowToast;
    var showToast = input && input.showToast;
    if (!isDraftOrResearch || !Array.isArray(scored) || typeof canShowToast !== 'function' || typeof showToast !== 'function') return;

    for (var di = 0; di < scored.length; di++) {
      var dItem = scored[di];
      if (dItem.total >= bestScore - 5) continue;
      for (var ri = 0; ri < dItem.reasons.length; ri++) {
        if (dItem.reasons[ri].indexOf('\u2702') === 0 && canShowToast('deny', gen + '-' + dItem.name)) {
          showToast(dItem.reasons[ri] + ': ' + dItem.name, 'deny');
          break;
        }
      }
    }

    for (var si = 0; si < scored.length; si++) {
      var sItem = scored[si];
      if (sItem.total >= 90 && canShowToast('great', gen + '-' + sItem.name)) {
        showToast('⭐ S-tier: ' + sItem.name + ' (' + sItem.total + ')', 'great');
      }
      for (var sri = 0; sri < sItem.reasons.length; sri++) {
        if (sItem.reasons[sri].indexOf('GODMODE') >= 0 && canShowToast('godmode', gen + '-' + sItem.name)) {
          showToast('🔥 GODMODE: ' + sItem.name + ' — ' + sItem.reasons[sri], 'great');
        }
      }
    }
  }

  function buildDraftScoreSnapshot(input) {
    var scored = input && input.scored;
    var ratings = input && input.ratings;
    var scoreToTier = input && input.scoreToTier;
    var snapshot = {};
    if (!Array.isArray(scored) || typeof scoreToTier !== 'function') return snapshot;

    scored.forEach(function(item) {
      var d = ratings ? ratings[item.name] : null;
      var rankScore = item.uncappedTotal != null ? item.uncappedTotal : item.total;
      snapshot[item.name] = {
        total: rankScore,
        displayTotal: item.total,
        tier: scoreToTier(item.total),
        baseTier: d ? d.t : '?',
        baseScore: d ? d.s : 0,
        reasons: item.reasons.slice(0, 3)
      };
    });

    return snapshot;
  }

  function detectDraftRecommendationUiMode(input) {
    var getPlayerVueData = input && input.getPlayerVueData;
    var selectCards = input && input.selectCards;
    var isResearchPhase = input && input.isResearchPhase;
    var myCorp = input && input.myCorp;
    var scored = input && input.scored;

    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    var gamePhase = pv && pv.game ? pv.game.phase : null;
    if (gamePhase) {
      return gamePhase === 'drafting' || gamePhase === 'research' ||
        gamePhase === 'initial_drafting' || gamePhase === 'corporationsDrafting';
    }

    var hasBlueAction = false;
    (selectCards || []).forEach(function(sec) {
      if (sec.querySelector('.card-content--blue, .blue-action, .card-content-wrapper[class*="blue"]')) hasBlueAction = true;
    });
    return !hasBlueAction && (isResearchPhase || (!myCorp && (scored || []).length <= 10));
  }

  function detectResearchPhase(input) {
    var gen = input && input.gen;
    var root = (input && input.root) || document;
    if (!(gen >= 2) || !root || !root.querySelectorAll) return false;

    var cardCount = root.querySelectorAll('.wf-component--select-card .card-container[data-tm-card]').length;
    var hasCheckboxes = root.querySelectorAll('.wf-component--select-card input[type="checkbox"]').length > 0;
    return cardCount === 4 && hasCheckboxes;
  }

  function shouldSkipDraftRecommendationSelection(input) {
    var getPlayerVueData = input && input.getPlayerVueData;
    var myHand = input && input.myHand;
    var selectCards = input && input.selectCards;
    var isKeepLikeActionCardChoice = input && input.isKeepLikeActionCardChoice;

    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    var phase = pv && pv.game ? pv.game.phase : null;
    if (phase !== 'action') return false;

    var handSet = new Set(myHand || []);
    var allShownNames = [];
    var keepLikeChoice = typeof isKeepLikeActionCardChoice === 'function'
      ? isKeepLikeActionCardChoice(selectCards || [])
      : false;

    (selectCards || []).forEach(function(sec) {
      sec.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
        var n = el.getAttribute('data-tm-card');
        if (n) allShownNames.push(n);
      });
    });

    var handCardsShown = allShownNames.filter(function(n) { return handSet.has(n); });
    return allShownNames.length > 0 && handCardsShown.length === 0 && !keepLikeChoice;
  }

  function prepareDraftRecommendationContext(input) {
    var detectMyCorp = input && input.detectMyCorp;
    var getMyTableauNames = input && input.getMyTableauNames;
    var getMyHandWithDrafted = input && input.getMyHandWithDrafted;
    var getCachedPlayerContext = input && input.getCachedPlayerContext;
    var enrichCtxForScoring = input && input.enrichCtxForScoring;
    var detectGeneration = input && input.detectGeneration;
    var detectOfferedCorps = input && input.detectOfferedCorps;

    var myCorp = typeof detectMyCorp === 'function' ? detectMyCorp() : '';
    var myTableau = typeof getMyTableauNames === 'function' ? getMyTableauNames() : [];
    var myHand = typeof getMyHandWithDrafted === 'function' ? getMyHandWithDrafted() : [];
    var ctx = typeof getCachedPlayerContext === 'function' ? getCachedPlayerContext() : null;
    if (ctx && typeof enrichCtxForScoring === 'function') {
      enrichCtxForScoring(ctx, myTableau, myHand);
    }

    var gen = typeof detectGeneration === 'function' ? detectGeneration() : 1;
    var offeredCorps = (!myCorp && gen <= 1 && typeof detectOfferedCorps === 'function')
      ? detectOfferedCorps()
      : [];
    if (ctx) ctx._openingHand = gen <= 1 && offeredCorps.length > 0;

    return {
      myCorp: myCorp,
      myTableau: myTableau,
      myHand: myHand,
      ctx: ctx,
      gen: gen,
      offeredCorps: offeredCorps
    };
  }

  function collectDraftRecommendationScores(input) {
    var selectCards = input && input.selectCards;
    var myTableau = input && input.myTableau;
    var myHand = input && input.myHand;
    var offeredCorps = input && input.offeredCorps;
    var myCorp = input && input.myCorp;
    var ctx = input && input.ctx;
    var isResearchPhase = input && input.isResearchPhase;
    var scoreCardAgainstCorps = input && input.scoreCardAgainstCorps;
    var adjustForResearch = input && input.adjustForResearch;

    var scored = [];
    (selectCards || []).forEach(function(section) {
      section.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
        var name = el.getAttribute('data-tm-card');
        if (!name || typeof scoreCardAgainstCorps !== 'function') return;

        var result = scoreCardAgainstCorps(name, el, myTableau, myHand, offeredCorps, myCorp, ctx);
        if (isResearchPhase && typeof adjustForResearch === 'function') {
          adjustForResearch(result, el, myHand, ctx);
        }
        scored.push(Object.assign({ el: el, name: name }, result));
      });
    });
    return scored;
  }

  function prepareDraftRecommendationDisplayState(input) {
    var scoredInput = input && input.scored;
    var getPlayerVueData = input && input.getPlayerVueData;
    var selectCards = input && input.selectCards;
    var isResearchPhase = input && input.isResearchPhase;
    var myCorp = input && input.myCorp;
    var detectGeneration = input && input.detectGeneration;

    var scored = Array.isArray(scoredInput) ? scoredInput.slice() : [];
    scored.sort(function(a, b) {
      var aRankScore = a && a.uncappedTotal != null ? a.uncappedTotal : a.total;
      var bRankScore = b && b.uncappedTotal != null ? b.uncappedTotal : b.total;
      return bRankScore - aRankScore;
    });

    var bestScore = scored.length > 0
      ? (scored[0].uncappedTotal != null ? scored[0].uncappedTotal : scored[0].total)
      : null;
    var isDraftOrResearch = detectDraftRecommendationUiMode({
      getPlayerVueData: getPlayerVueData,
      selectCards: selectCards,
      isResearchPhase: isResearchPhase,
      myCorp: myCorp,
      scored: scored
    });
    var gen = typeof detectGeneration === 'function' ? detectGeneration() : 1;

    return {
      scored: scored,
      bestScore: bestScore,
      isDraftOrResearch: isDraftOrResearch,
      gen: gen,
      intelScored: isDraftOrResearch && !isResearchPhase ? scored : []
    };
  }

  global.TM_CONTENT_OVERLAYS = {
    addPlayBadge: addPlayBadge,
    addSellBadge: addSellBadge,
    applyDraftRecommendationCardUi: applyDraftRecommendationCardUi,
    buildDraftScoreSnapshot: buildDraftScoreSnapshot,
    collectDraftRecommendationScores: collectDraftRecommendationScores,
    createSellSummary: createSellSummary,
    prepareDraftRecommendationDisplayState: prepareDraftRecommendationDisplayState,
    detectResearchPhase: detectResearchPhase,
    detectDraftRecommendationUiMode: detectDraftRecommendationUiMode,
    notifyDraftRecommendationToasts: notifyDraftRecommendationToasts,
    prepareDraftRecommendationContext: prepareDraftRecommendationContext,
    renderCardOverlay: renderCardOverlay,
    resetDraftOverlays: resetDraftOverlays,
    shouldSkipDraftRecommendationSelection: shouldSkipDraftRecommendationSelection,
    updateBadgeScore: updateBadgeScore
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
