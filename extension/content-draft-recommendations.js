// TM Tier Overlay - Draft recommendation orchestration helpers
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

  function scoreHandCardsInPlace(input) {
    var detectMyCorp = input && input.detectMyCorp;
    var getMyTableauNames = input && input.getMyTableauNames;
    var getMyHandNames = input && input.getMyHandNames;
    var getCachedPlayerContext = input && input.getCachedPlayerContext;
    var enrichCtxForScoring = input && input.enrichCtxForScoring;
    var documentObj = input && input.documentObj;
    var selHand = input && input.selHand;
    var ratings = input && input.ratings;
    var scoreDraftCard = input && input.scoreDraftCard;
    var updateBadgeScore = input && input.updateBadgeScore;
    var setReasonPayload = input && input.setReasonPayload;

    var myCorp = typeof detectMyCorp === 'function' ? detectMyCorp() : '';
    if (!myCorp || !documentObj || !selHand || !ratings || typeof scoreDraftCard !== 'function' || typeof updateBadgeScore !== 'function') return;

    var myTableau = typeof getMyTableauNames === 'function' ? getMyTableauNames() : [];
    var myHand = typeof getMyHandNames === 'function' ? getMyHandNames() : [];
    var ctx = typeof getCachedPlayerContext === 'function' ? getCachedPlayerContext() : null;
    if (ctx && typeof enrichCtxForScoring === 'function') enrichCtxForScoring(ctx, myTableau, myHand);

    documentObj.querySelectorAll(selHand).forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (!name || !ratings[name]) return;
      var origData = ratings[name];
      var badge = el.querySelector('.tm-tier-badge');
      if (!badge) return;
      var result = scoreDraftCard(name, myTableau, myHand, myCorp, el, ctx);
      if (!badge.hasAttribute('data-tm-original')) {
        badge.setAttribute('data-tm-original', badge.textContent);
        badge.setAttribute('data-tm-orig-tier', origData.t);
      }
      var newTier = updateBadgeScore(badge, origData.t, origData.s, result.total, '', result.uncappedTotal);
      if (newTier === 'D' || newTier === 'F') el.classList.add('tm-dim');
      else el.classList.remove('tm-dim');
      applyReasonPayload(el, result, setReasonPayload, null);
    });
  }

  function updateDraftRecommendations(input) {
    var enabled = input && input.enabled;
    var documentObj = input && input.documentObj;
    var resetDraftOverlays = input && input.resetDraftOverlays;
    var scoreHandCardsInPlaceFn = input && input.scoreHandCardsInPlace;
    var prepareDraftRecommendationContext = input && input.prepareDraftRecommendationContext;
    var detectMyCorp = input && input.detectMyCorp;
    var getMyTableauNames = input && input.getMyTableauNames;
    var getMyHandNames = input && input.getMyHandNames;
    var getMyHandWithDrafted = input && input.getMyHandWithDrafted;
    var getCachedPlayerContext = input && input.getCachedPlayerContext;
    var enrichCtxForScoring = input && input.enrichCtxForScoring;
    var detectGeneration = input && input.detectGeneration;
    var detectOfferedCorps = input && input.detectOfferedCorps;
    var detectResearchPhase = input && input.detectResearchPhase;
    var getPlayerVueData = input && input.getPlayerVueData;
    var shouldSkipDraftRecommendationSelection = input && input.shouldSkipDraftRecommendationSelection;
    var isKeepLikeActionCardChoice = input && input.isKeepLikeActionCardChoice;
    var revealPendingWorkflowBadges = input && input.revealPendingWorkflowBadges;
    var collectDraftRecommendationScores = input && input.collectDraftRecommendationScores;
    var scoreCardAgainstCorps = input && input.scoreCardAgainstCorps;
    var adjustForResearch = input && input.adjustForResearch;
    var buildDraftScoreSnapshot = input && input.buildDraftScoreSnapshot;
    var ratings = input && input.ratings;
    var scoreToTier = input && input.scoreToTier;
    var setLastDraftScoresState = input && input.setLastDraftScoresState;
    var prepareDraftRecommendationDisplayState = input && input.prepareDraftRecommendationDisplayState;
    var applyDraftRecommendationCardUi = input && input.applyDraftRecommendationCardUi;
    var revealPendingContextBadge = input && input.revealPendingContextBadge;
    var updateBadgeScore = input && input.updateBadgeScore;
    var renderCardOverlay = input && input.renderCardOverlay;
    var notifyDraftRecommendationToasts = input && input.notifyDraftRecommendationToasts;
    var canShowToast = input && input.canShowToast;
    var showToast = input && input.showToast;
    var syncDraftIntelBanner = input && input.syncDraftIntelBanner;
    var getDraftIntel = input && input.getDraftIntel;
    var playerColor = input && input.playerColor;
    var ruName = input && input.ruName;
    var selHand = input && input.selHand;
    var scoreDraftCard = input && input.scoreDraftCard;
    var setReasonPayload = input && input.setReasonPayload;
    var clearReasonPayload = input && input.clearReasonPayload;
    var serializeReasonRowsPayload = input && input.serializeReasonRowsPayload;

    if (!enabled || !documentObj) return;
    if (typeof resetDraftOverlays === 'function') resetDraftOverlays();

    var selectCards = Array.from(documentObj.querySelectorAll('.wf-component--select-card, .wf-component--select-prelude'));
    if (selectCards.length === 0) {
      if (typeof scoreHandCardsInPlaceFn === 'function') {
        scoreHandCardsInPlaceFn();
      } else {
        scoreHandCardsInPlace({
          detectMyCorp: detectMyCorp,
          getMyTableauNames: getMyTableauNames,
          getMyHandNames: getMyHandNames,
          getCachedPlayerContext: getCachedPlayerContext,
          enrichCtxForScoring: enrichCtxForScoring,
          documentObj: documentObj,
          selHand: selHand,
          ratings: ratings,
          scoreDraftCard: scoreDraftCard,
          updateBadgeScore: updateBadgeScore,
          setReasonPayload: setReasonPayload
        });
      }
      return;
    }

    var prep = typeof prepareDraftRecommendationContext === 'function'
      ? prepareDraftRecommendationContext({
        detectMyCorp: detectMyCorp,
        getMyTableauNames: getMyTableauNames,
        getMyHandWithDrafted: getMyHandWithDrafted,
        getCachedPlayerContext: getCachedPlayerContext,
        enrichCtxForScoring: enrichCtxForScoring,
        detectGeneration: detectGeneration,
        detectOfferedCorps: detectOfferedCorps
      })
      : null;

    var myCorp = prep ? prep.myCorp : (typeof detectMyCorp === 'function' ? detectMyCorp() : '');
    var myTableau = prep ? prep.myTableau : (typeof getMyTableauNames === 'function' ? getMyTableauNames() : []);
    var myHand = prep ? prep.myHand : (typeof getMyHandWithDrafted === 'function' ? getMyHandWithDrafted() : []);
    var ctx = prep ? prep.ctx : (typeof getCachedPlayerContext === 'function' ? getCachedPlayerContext() : null);
    if ((!prep || !prep.ctx) && ctx && typeof enrichCtxForScoring === 'function') {
      enrichCtxForScoring(ctx, myTableau, myHand);
    }

    var gen = prep ? prep.gen : (typeof detectGeneration === 'function' ? detectGeneration() : 1);
    var offeredCorps = prep ? prep.offeredCorps : ((!myCorp && gen <= 1 && typeof detectOfferedCorps === 'function') ? detectOfferedCorps() : []);
    if (!prep && ctx) ctx._openingHand = gen <= 1 && offeredCorps.length > 0;

    var isResearchPhase = typeof detectResearchPhase === 'function'
      ? detectResearchPhase({gen: gen, root: documentObj})
      : false;
    if (!detectResearchPhase && gen >= 2) {
      var cardCount = documentObj.querySelectorAll('.wf-component--select-card .card-container[data-tm-card]').length;
      var hasCheckboxes = documentObj.querySelectorAll('.wf-component--select-card input[type="checkbox"]').length > 0;
      isResearchPhase = cardCount === 4 && hasCheckboxes;
    }

    var shouldSkipSelection = typeof shouldSkipDraftRecommendationSelection === 'function'
      ? shouldSkipDraftRecommendationSelection({
        getPlayerVueData: getPlayerVueData,
        myHand: myHand,
        selectCards: selectCards,
        isKeepLikeActionCardChoice: isKeepLikeActionCardChoice
      })
      : false;
    if (!shouldSkipDraftRecommendationSelection) {
      var pv0 = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
      var phase0 = pv0 && pv0.game ? pv0.game.phase : null;
      if (phase0 === 'action') {
        var handSet0 = new Set(myHand);
        var allShownNames0 = [];
        var keepLikeChoice0 = typeof isKeepLikeActionCardChoice === 'function'
          ? isKeepLikeActionCardChoice(selectCards)
          : false;
        selectCards.forEach(function(section) {
          section.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
            var name = el.getAttribute('data-tm-card');
            if (name) allShownNames0.push(name);
          });
        });
        var handCardsShown0 = allShownNames0.filter(function(name) { return handSet0.has(name); });
        shouldSkipSelection = allShownNames0.length > 0 && handCardsShown0.length === 0 && !keepLikeChoice0;
      }
    }
    if (shouldSkipSelection) {
      if (typeof revealPendingWorkflowBadges === 'function') revealPendingWorkflowBadges(selectCards);
      return;
    }

    var scored = typeof collectDraftRecommendationScores === 'function'
      ? collectDraftRecommendationScores({
        selectCards: selectCards,
        myTableau: myTableau,
        myHand: myHand,
        offeredCorps: offeredCorps,
        myCorp: myCorp,
        ctx: ctx,
        isResearchPhase: isResearchPhase,
        scoreCardAgainstCorps: scoreCardAgainstCorps,
        adjustForResearch: adjustForResearch
      })
      : null;
    if (!collectDraftRecommendationScores) {
      scored = [];
      selectCards.forEach(function(section) {
        section.querySelectorAll('.card-container[data-tm-card]').forEach(function(el) {
          var name = el.getAttribute('data-tm-card');
          if (!name || typeof scoreCardAgainstCorps !== 'function') return;
          var result = scoreCardAgainstCorps(name, el, myTableau, myHand, offeredCorps, myCorp, ctx);
          if (isResearchPhase && typeof adjustForResearch === 'function') {
            adjustForResearch(result, el, myHand, ctx);
          }
          scored.push(Object.assign({el: el, name: name}, result));
        });
      });
    }

    if (!Array.isArray(scored) || scored.length === 0) {
      if (typeof revealPendingWorkflowBadges === 'function') revealPendingWorkflowBadges(selectCards);
      return;
    }

    var draftScoreSnapshot = typeof buildDraftScoreSnapshot === 'function'
      ? buildDraftScoreSnapshot({
        scored: scored,
        ratings: ratings,
        scoreToTier: scoreToTier
      })
      : {};
    if (!buildDraftScoreSnapshot) {
      scored.forEach(function(item) {
        var rating = ratings ? ratings[item.name] : null;
        var rankScore = item.uncappedTotal != null ? item.uncappedTotal : item.total;
        draftScoreSnapshot[item.name] = {
          total: rankScore,
          displayTotal: item.total,
          tier: typeof scoreToTier === 'function' ? scoreToTier(item.total) : '?',
          baseTier: rating ? rating.t : '?',
          baseScore: rating ? rating.s : 0,
          reasons: item.reasons.slice(0, 3)
        };
      });
    }
    if (typeof setLastDraftScoresState === 'function') setLastDraftScoresState(draftScoreSnapshot);

    var displayState = typeof prepareDraftRecommendationDisplayState === 'function'
      ? prepareDraftRecommendationDisplayState({
        scored: scored,
        getPlayerVueData: getPlayerVueData,
        selectCards: selectCards,
        isResearchPhase: isResearchPhase,
        myCorp: myCorp,
        detectGeneration: detectGeneration
      })
      : null;
    if (displayState && Array.isArray(displayState.scored)) {
      scored = displayState.scored;
    } else {
      scored.sort(function(a, b) {
        var aRank = a.uncappedTotal != null ? a.uncappedTotal : a.total;
        var bRank = b.uncappedTotal != null ? b.uncappedTotal : b.total;
        return bRank - aRank;
      });
    }

    var bestScore = displayState
      ? displayState.bestScore
      : (scored[0].uncappedTotal != null ? scored[0].uncappedTotal : scored[0].total);

    var isDraftOrResearch = displayState ? displayState.isDraftOrResearch : false;
    if (!displayState) {
      var pv28 = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
      var gamePhase28 = pv28 && pv28.game ? pv28.game.phase : null;
      if (gamePhase28) {
        isDraftOrResearch = gamePhase28 === 'drafting' || gamePhase28 === 'research' ||
          gamePhase28 === 'initial_drafting' || gamePhase28 === 'corporationsDrafting';
      } else {
        var hasBlueAction = false;
        selectCards.forEach(function(section) {
          if (section.querySelector('.card-content--blue, .blue-action, .card-content-wrapper[class*="blue"]')) hasBlueAction = true;
        });
        isDraftOrResearch = !hasBlueAction && (isResearchPhase || (!myCorp && scored.length <= 10));
      }
    }

    scored.forEach(function(item) {
      if (typeof applyDraftRecommendationCardUi === 'function') {
        applyDraftRecommendationCardUi({
          item: item,
          scored: scored,
          bestScore: bestScore,
          isDraftOrResearch: isDraftOrResearch,
          ratings: ratings,
          revealPendingContextBadge: revealPendingContextBadge,
          scoreToTier: scoreToTier
          ,
          setReasonPayload: setReasonPayload,
          clearReasonPayload: clearReasonPayload
        });
        return;
      }

      var itemRankScore = item.uncappedTotal != null ? item.uncappedTotal : item.total;
      var isBest = itemRankScore >= bestScore - 5;
      var hasBonus = item.reasons.length > 0;
      if (isBest && hasBonus) item.el.classList.add('tm-rec-best');

      var badge = item.el.querySelector('.tm-tier-badge');
      if (badge) {
        var origData = ratings ? ratings[item.name] : null;
        var origTier = origData ? origData.t : 'C';
        var origScore = origData ? origData.s : 0;

        if (!badge.hasAttribute('data-tm-original')) {
          badge.setAttribute('data-tm-original', badge.textContent);
          badge.setAttribute('data-tm-orig-tier', origTier);
        }

        var newTier = typeof updateBadgeScore === 'function'
          ? updateBadgeScore(badge, origTier, origScore, item.total, '', item.uncappedTotal, true)
          : origTier;
        if (typeof revealPendingContextBadge === 'function') revealPendingContextBadge(badge);

        if (newTier === 'D' || newTier === 'F') item.el.classList.add('tm-dim');
        else item.el.classList.remove('tm-dim');
      }

      applyReasonPayload(item.el, item, setReasonPayload, clearReasonPayload);

      var oldOverlay = item.el.querySelector('.tm-inline-overlay');
      if (oldOverlay) oldOverlay.remove();
      if (!isDraftOrResearch || typeof renderCardOverlay !== 'function') return;
      var overlay = renderCardOverlay(item, scored);
      if (overlay) item.el.appendChild(overlay);
    });

    var toastGen = displayState ? displayState.gen : (typeof detectGeneration === 'function' ? detectGeneration() : gen);
    if (typeof notifyDraftRecommendationToasts === 'function') {
      notifyDraftRecommendationToasts({
        isDraftOrResearch: isDraftOrResearch,
        scored: scored,
        bestScore: bestScore,
        gen: toastGen,
        canShowToast: canShowToast,
        showToast: showToast
      });
    } else if (isDraftOrResearch && typeof canShowToast === 'function' && typeof showToast === 'function') {
      for (var di = 0; di < scored.length; di++) {
        var denyItem = scored[di];
        if (denyItem.total >= bestScore - 5) continue;
        for (var dri = 0; dri < denyItem.reasons.length; dri++) {
          if (denyItem.reasons[dri].indexOf('\u2702') === 0 && canShowToast('deny', toastGen + '-' + denyItem.name)) {
            showToast(denyItem.reasons[dri] + ': ' + denyItem.name, 'deny');
            break;
          }
        }
      }
      for (var si = 0; si < scored.length; si++) {
        var scoreItem = scored[si];
        if (scoreItem.total >= 90 && canShowToast('great', toastGen + '-' + scoreItem.name)) {
          showToast('⭐ S-tier: ' + scoreItem.name + ' (' + scoreItem.total + ')', 'great');
        }
        for (var sri = 0; sri < scoreItem.reasons.length; sri++) {
          if (scoreItem.reasons[sri].indexOf('GODMODE') >= 0 && canShowToast('godmode', toastGen + '-' + scoreItem.name)) {
            showToast('🔥 GODMODE: ' + scoreItem.name + ' — ' + scoreItem.reasons[sri], 'great');
          }
        }
      }
    }

    if (typeof syncDraftIntelBanner === 'function') {
      syncDraftIntelBanner({
        scored: displayState ? displayState.intelScored : ((isDraftOrResearch && !isResearchPhase) ? scored : []),
        getDraftIntel: getDraftIntel,
        playerColor: playerColor,
        ruName: ruName,
        documentObj: documentObj
      });
    }
  }

  global.TM_CONTENT_DRAFT_RECOMMENDATIONS = {
    scoreHandCardsInPlace: scoreHandCardsInPlace,
    updateDraftRecommendations: updateDraftRecommendations
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
