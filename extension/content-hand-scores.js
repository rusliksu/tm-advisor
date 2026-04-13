// TM Tier Overlay - Content hand scoring helpers
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
      rows = source.reasons.map(function(reason) { return { text: reason, tone: 'positive' }; });
    } else if (source && typeof source.reasons === 'string' && source.reasons) {
      rows = source.reasons.split('|').filter(Boolean).map(function(reason) { return { text: reason, tone: 'positive' }; });
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

  function updateHandScores(input) {
    var enabled = input && input.enabled;
    var windowObj = input && input.windowObj;
    var documentObj = input && input.documentObj;
    var selCards = input && input.selCards;
    var detectMyCorp = input && input.detectMyCorp;
    var getMyTableauNames = input && input.getMyTableauNames;
    var getMyHandWithDrafted = input && input.getMyHandWithDrafted;
    var getCachedPlayerContext = input && input.getCachedPlayerContext;
    var enrichCtxForScoring = input && input.enrichCtxForScoring;
    var detectGeneration = input && input.detectGeneration;
    var invalidateStaleScores = input && input.invalidateStaleScores;
    var resolveCorpName = input && input.resolveCorpName;
    var knownCorps = input && input.knownCorps;
    var ratings = input && input.ratings;
    var scoreCorpByVisibleCards = input && input.scoreCorpByVisibleCards;
    var scoreCardAgainstCorps = input && input.scoreCardAgainstCorps;
    var updateBadgeScore = input && input.updateBadgeScore;
    var detectCardOwner = input && input.detectCardOwner;
    var frozenScores = input && input.frozenScores;
    var scoreFromOpponentPerspective = input && input.scoreFromOpponentPerspective;
    var getPlayerVueData = input && input.getPlayerVueData;
    var scoreDraftCard = input && input.scoreDraftCard;
    var getSynergyIndicators = input && input.getSynergyIndicators;
    var setReasonPayload = input && input.setReasonPayload;
    var clearReasonPayload = input && input.clearReasonPayload;
    var serializeReasonRowsPayload = input && input.serializeReasonRowsPayload;

    if (!enabled || !windowObj || !documentObj || !selCards || !ratings || !knownCorps || !frozenScores) return;
    var isCardsListPage = /\/cards\b/.test(windowObj.location.pathname);
    if (isCardsListPage) return;

    var allCards = documentObj.querySelectorAll(selCards);
    if (allCards.length === 0) return;

    var myCorp = typeof detectMyCorp === 'function' ? detectMyCorp() : '';
    var myTableau = typeof getMyTableauNames === 'function' ? getMyTableauNames() : [];
    var myHand = typeof getMyHandWithDrafted === 'function' ? getMyHandWithDrafted() : [];
    var ctx = typeof getCachedPlayerContext === 'function' ? getCachedPlayerContext() : null;
    if (!ctx) return;
    if (typeof enrichCtxForScoring === 'function') enrichCtxForScoring(ctx, myTableau, myHand);

    var offeredCorps = [];
    var gen = typeof detectGeneration === 'function' ? detectGeneration() : 0;
    ctx._openingHand = false;

    if (typeof invalidateStaleScores === 'function') invalidateStaleScores();

    if (!myCorp && gen <= 1) {
      allCards.forEach(function(el) {
        var cn = typeof resolveCorpName === 'function' ? resolveCorpName(el.getAttribute('data-tm-card')) : el.getAttribute('data-tm-card');
        if (cn && knownCorps.has(cn)) {
          offeredCorps.push(cn);
        }
      });
      ctx._openingHand = offeredCorps.length > 0;
    }

    var visibleNames = [];
    allCards.forEach(function(el) {
      var cn = el.getAttribute('data-tm-card');
      if (cn && !knownCorps.has(cn) && !knownCorps.has(typeof resolveCorpName === 'function' ? resolveCorpName(cn) : cn)) {
        visibleNames.push(cn);
      }
    });

    allCards.forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (!name) return;
      if (el.closest('.wf-component--select-card') || el.closest('.wf-component--select-prelude')) return;
      var badge = el.querySelector('.tm-tier-badge');
      if (!badge) return;
      var data = ratings[name];
      if (!data) return;

      var resolvedName = typeof resolveCorpName === 'function' ? resolveCorpName(name) : name;
      var isCorp = knownCorps.has(name) || knownCorps.has(resolvedName);
      if (isCorp) {
        if (!myCorp && offeredCorps.length > 0 && visibleNames.length > 0 && typeof scoreCorpByVisibleCards === 'function') {
          var corpResult = scoreCorpByVisibleCards(resolvedName || name, allCards, ctx);
          if (typeof updateBadgeScore === 'function') {
            updateBadgeScore(badge, data.t, data.s, corpResult.total, '', undefined, true);
          }
          applyReasonPayload(el, corpResult, setReasonPayload, clearReasonPayload);
        }
        return;
      }

      var isInTableau = !!el.closest('.player_home_block--cards, .player_home_block--tableau, .cards-wrapper');
      var cardOpp = null;
      if (isInTableau && typeof detectCardOwner === 'function') {
        cardOpp = detectCardOwner(name);
      }

      if (isInTableau) {
        var frozenKey = cardOpp ? ('opp:' + cardOpp.color + ':' + name) : name;
        var frozen = frozenScores.get(frozenKey);
        if (frozen) {
          badge.innerHTML = frozen.html;
          badge.className = frozen.className;
          applyReasonPayload(el, { reasons: frozen.reasons || '', reasonRows: frozen.reasonRows || '' }, setReasonPayload, clearReasonPayload);
          if (frozen.dimClass) el.classList.add('tm-dim'); else el.classList.remove('tm-dim');
          return;
        }
      }

      var result;
      if (cardOpp && typeof scoreFromOpponentPerspective === 'function') {
        result = scoreFromOpponentPerspective(name, cardOpp, el, typeof getPlayerVueData === 'function' ? getPlayerVueData() : null);
      } else if (!myCorp && offeredCorps.length > 0 && typeof scoreCardAgainstCorps === 'function') {
        result = scoreCardAgainstCorps(name, el, myTableau, visibleNames, offeredCorps, myCorp, ctx);
      } else if (typeof scoreDraftCard === 'function') {
        result = scoreDraftCard(name, myTableau, myHand, myCorp, el, ctx);
      } else {
        return;
      }

      var showContextDisplay = !cardOpp && !myCorp && offeredCorps.length > 0;
      var newTier = typeof updateBadgeScore === 'function'
        ? updateBadgeScore(badge, data.t, data.s, result.total, cardOpp ? ' tm-opp-badge' : '', result.uncappedTotal, showContextDisplay)
        : data.t;

      var oldHint = el.querySelector('.tm-synergy-hint');
      if (oldHint) oldHint.remove();
      if (!cardOpp && ctx && typeof getSynergyIndicators === 'function') {
        var myCorpsHint = ctx._myCorps || [];
        if (myCorpsHint.length === 0 && myCorp) myCorpsHint = [myCorp];
        var hints = getSynergyIndicators(name, el, ctx, myCorpsHint);
        if (hints.length > 0) {
          var hintEl = documentObj.createElement('div');
          hintEl.className = 'tm-synergy-hint';
          hintEl.textContent = hints.join(' ');
          badge.parentNode.insertBefore(hintEl, badge.nextSibling);
        }
      }

      if (newTier === 'D' || newTier === 'F') {
        el.classList.add('tm-dim');
      } else {
        el.classList.remove('tm-dim');
      }

      applyReasonPayload(el, result, setReasonPayload, clearReasonPayload);

      if (isInTableau) {
        var fKey = cardOpp ? ('opp:' + cardOpp.color + ':' + name) : name;
        frozenScores.set(fKey, {
          html: badge.innerHTML,
          className: badge.className,
          reasons: result.reasons.length > 0 ? result.reasons.join('|') : '',
          reasonRows: result.reasonRows && result.reasonRows.length > 0 && typeof serializeReasonRowsPayload === 'function'
            ? serializeReasonRowsPayload(result.reasonRows)
            : '',
          dimClass: newTier === 'D' || newTier === 'F'
        });
      }
    });
  }

  global.TM_CONTENT_HAND_SCORES = {
    updateHandScores: updateHandScores
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
