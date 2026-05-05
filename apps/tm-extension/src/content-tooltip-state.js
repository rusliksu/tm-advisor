// TM Tier Overlay — Content tooltip state helpers
(function(global) {
  'use strict';

  function resolveTooltipScoreState(input) {
    var cardEl = input && input.cardEl;
    var tipReasons = cardEl ? (cardEl.getAttribute('data-tm-reasons') || '') : '';
    var tipReasonRows = [];
    if (cardEl && typeof input.parseReasonRows === 'function') {
      tipReasonRows = input.parseReasonRows(cardEl.getAttribute('data-tm-reason-rows') || '');
    }
    var ctxScore = input && typeof input.baseScore === 'number' ? input.baseScore : 0;
    var ctxTier = input && input.baseTier ? input.baseTier : '';

    if (input && input.isOppCard && input.oppScoreResult) {
      ctxScore = Math.round(input.oppScoreResult.total * 10) / 10;
      ctxTier = input.scoreToTier(ctxScore);
      tipReasons = input.oppScoreResult.reasons.join('|');
      if (typeof input.normalizeReasonRows === 'function') {
        tipReasonRows = input.normalizeReasonRows(input.oppScoreResult.reasonRows || input.oppScoreResult.reasons || []);
      }
    } else if (tipReasons && cardEl) {
      var tipBadge = cardEl.querySelector('.tm-tier-badge');
      if (tipBadge && tipBadge.textContent) {
        var matches = tipBadge.textContent.match(/[A-Z]\s*(\d+)/g);
        if (matches && matches.length >= 2) {
          ctxScore = parseInt(matches[matches.length - 1].replace(/[A-Z]\s*/, ''), 10) || ctxScore;
          ctxTier = input.scoreToTier(ctxScore);
        }
      }
    }

    return {
      ctxScore: ctxScore,
      ctxTier: ctxTier,
      tipReasons: tipReasons,
      tipReasonRows: tipReasonRows
    };
  }

  function resolveTooltipCardState(input) {
    var cardEl = input && input.cardEl;
    var cardCost = null;
    if (cardEl) {
      var costEl = cardEl.querySelector('.card-number, .card-cost');
      if (costEl) {
        var parsedCost = parseInt(costEl.textContent, 10);
        if (!isNaN(parsedCost)) {
          cardCost = parsedCost;
        }
      }
    }

    var descriptions = input && input.descriptions;
    var name = input && input.name;
    var data = input && input.data;
    var localizedName = input && typeof input.ruName === 'function' ? (input.ruName(name) || name) : name;
    var localizedDesc = data && data.dr ? data.dr : '';
    var fallbackDesc = descriptions && descriptions[name] ? descriptions[name] : '';
    var isInHand = !!(cardEl && cardEl.closest('.cards-in-hand, [class*="hand"]'));

    return {
      cardCost: cardCost,
      fallbackDesc: fallbackDesc,
      isInHand: isInHand,
      localizedDesc: localizedDesc,
      localizedName: localizedName
    };
  }

  function resolveTooltipTriggerState(input) {
    var cardEl = input && input.cardEl;
    if (!cardEl) return {hits: []};

    var tags = input.getCardTags(cardEl);
    if (!tags || tags.size === 0) return {hits: []};

    var tableauNames = [];
    var seenTableauNames = {};
    function addTableauName(name) {
      if (!name) return;
      var key = String(name).toLowerCase();
      if (seenTableauNames[key]) return;
      seenTableauNames[key] = true;
      tableauNames.push(name);
    }
    if (input.isOppCard && input.oppOwner) {
      if (input.oppOwner.tableau) {
        for (var oi = 0; oi < input.oppOwner.tableau.length; oi++) {
          addTableauName(input.cardN(input.oppOwner.tableau[oi]));
        }
      }
      if (input.oppCtx && input.oppCtx._myCorps) {
        for (var ci = 0; ci < input.oppCtx._myCorps.length; ci++) {
          addTableauName(input.oppCtx._myCorps[ci]);
        }
      }
    } else {
      if (input.pv && input.pv.thisPlayer && input.pv.thisPlayer.tableau) {
        for (var ti = 0; ti < input.pv.thisPlayer.tableau.length; ti++) {
          addTableauName(input.cardN(input.pv.thisPlayer.tableau[ti]));
        }
      }
      var corpsForTrig = input.detectMyCorps();
      for (var cft = 0; cft < corpsForTrig.length; cft++) {
        addTableauName(corpsForTrig[cft]);
      }
    }

    var hits = [];
    for (var ni = 0; ni < tableauNames.length; ni++) {
      var trigs = input.tagTriggers[tableauNames[ni]];
      if (!trigs) continue;
      for (var tri = 0; tri < trigs.length; tri++) {
        tagsLoop:
        for (var tag of tags) {
          if (trigs[tri].tags.includes(tag.toLowerCase())) {
            if (trigs[tri].eventOnly && !cardEl.classList.contains('card-type--event')) break tagsLoop;
            hits.push(trigs[tri].desc);
            break tagsLoop;
          }
        }
      }
    }

    return {
      hits: hits,
      isOpponent: !!input.isOppCard
    };
  }

  function resolveTooltipRequirementState(input) {
    var cardEl = input && input.cardEl;
    var pv = input && input.pv;
    if (!cardEl || !pv || !pv.game) return {checks: []};

    var reqEl = cardEl.querySelector('.card-requirements, .card-requirement');
    if (!reqEl) return {checks: []};

    var reqText = (reqEl.textContent || '').trim();
    if (!reqText) return {checks: []};

    var checks = [];
    var gp = pv.game;
    var isMax = /max/i.test(reqText);
    var reqFlex = input.getRequirementFlexSteps(cardEl.getAttribute('data-tm-card') || '', input.detectMyCorps());

    var tempMatch = reqText.match(/([\-\d]+)\s*°?C/i);
    var oxyMatch = reqText.match(/(\d+)\s*%?\s*O/i);
    var oceanMatch = reqText.match(/(\d+)\s*ocean/i);
    var venusMatch = reqText.match(/(\d+)\s*%?\s*Venus/i);

    if (tempMatch && typeof gp.temperature === 'number') {
      var tempValue = parseInt(tempMatch[1], 10);
      var effectiveTemp = isMax ? tempValue + reqFlex.any * 2 : tempValue - reqFlex.any * 2;
      if (!(isMax ? gp.temperature <= effectiveTemp : gp.temperature >= effectiveTemp)) {
        checks.push('Темп ' + gp.temperature + '°C/' + effectiveTemp + '°C');
      }
    }
    if (oxyMatch && typeof gp.oxygenLevel === 'number') {
      var oxyValue = parseInt(oxyMatch[1], 10);
      var effectiveOxy = isMax ? oxyValue + reqFlex.any : oxyValue - reqFlex.any;
      if (!(isMax ? gp.oxygenLevel <= effectiveOxy : gp.oxygenLevel >= effectiveOxy)) {
        checks.push('O₂ ' + gp.oxygenLevel + '%/' + effectiveOxy + '%');
      }
    }
    if (oceanMatch && typeof gp.oceans === 'number') {
      var oceanValue = parseInt(oceanMatch[1], 10);
      var effectiveOcean = isMax ? oceanValue + reqFlex.any : oceanValue - reqFlex.any;
      if (!(isMax ? gp.oceans <= effectiveOcean : gp.oceans >= effectiveOcean)) {
        checks.push('Океаны ' + gp.oceans + '/' + effectiveOcean);
      }
    }
    if (venusMatch && typeof gp.venusScaleLevel === 'number') {
      var venusValue = parseInt(venusMatch[1], 10);
      var venusFlex = reqFlex.any + reqFlex.venus;
      var effectiveVenus = isMax ? venusValue + venusFlex * 2 : venusValue - venusFlex * 2;
      if (!(isMax ? gp.venusScaleLevel <= effectiveVenus : gp.venusScaleLevel >= effectiveVenus)) {
        checks.push('Венера ' + gp.venusScaleLevel + '%/' + effectiveVenus + '%');
      }
    }

    var boardReqs = input.evaluateBoardRequirements(reqText, input.getCachedPlayerContext(), pv);
    if (boardReqs && !boardReqs.metNow) {
      for (var bi = 0; bi < boardReqs.unmet.length; bi++) {
        var breq = boardReqs.unmet[bi];
        checks.push(input.getBoardRequirementStatusLabel(breq.key) + ' ' + breq.have + '/' + breq.need);
      }
    }

    return {
      checks: checks
    };
  }

  function resolveTooltipOwnerState(input) {
    var oppOwner = input.detectCardOwner(input.name, input.pv);
    if (!oppOwner) {
      return {
        isOppCard: false,
        oppCtx: null,
        oppOwner: null,
        oppScoreResult: null
      };
    }

    var oppCtx = input.getCachedOpponentContext(oppOwner, input.pv);
    return {
      isOppCard: true,
      oppCtx: oppCtx,
      oppOwner: oppOwner,
      oppScoreResult: input.scoreFromOpponentPerspective(input.name, oppOwner, input.cardEl, input.pv, oppCtx)
    };
  }

  function resolveTooltipMetaRowsState(input) {
    var cardEl = input && input.cardEl;
    var pv = input && input.pv;
    var takeThatCards = input && input.takeThatCards;
    var name = input && input.name;

    var comboText = cardEl ? (cardEl.getAttribute('data-tm-combo') || '') : '';
    var conflictText = cardEl ? (cardEl.getAttribute('data-tm-anti-combo') || '') : '';
    var takeThatMessage = takeThatCards && name ? (takeThatCards[name] || '') : '';
    var playerCount = pv && pv.game && pv.game.players ? pv.game.players.length : 3;

    return {
      comboText: comboText,
      conflictText: conflictText,
      playerCountLabel: playerCount + 'P',
      takeThatMessage: takeThatMessage
    };
  }

  function resolveTooltipAnalysisState(input) {
    var data = input && input.data;
    var isInHand = !!(input && input.isInHand);
    return {
      analysisText: data && data.e ? data.e : '',
      isInHand: isInHand,
      whenText: data && data.w ? data.w : ''
    };
  }

  function resolveTooltipValueState(input) {
    var name = input && input.name;
    if (!name) return {cardCost: 0, ctx: null, effectTags: [], fx: null, ratingGroups: null};

    var ctx = input.isOppCard && input.oppCtx ? input.oppCtx : input.getCachedPlayerContext();
    var fx = input.getFx(name);
    var ratingData = input.getRatingByCardName(name);
    var effectTags = fx && fx.tags ? fx.tags : ((input.cardEffects && input.cardEffects[name] && input.cardEffects[name].tags) ? input.cardEffects[name].tags : []);
    if ((!effectTags || effectTags.length === 0) && input.cardEl && typeof input.getCardTags === 'function') {
      var domTagSet = input.getCardTags(input.cardEl);
      if (domTagSet && typeof domTagSet.forEach === 'function') {
        effectTags = [];
        domTagSet.forEach(function(tag) {
          effectTags.push(String(tag || '').toLowerCase());
        });
      }
    }

    return {
      cardCost: typeof input.cardCost === 'number' ? input.cardCost : 0,
      ctx: ctx,
      effectTags: effectTags,
      fx: fx,
      ratingGroups: ratingData && ratingData.g
    };
  }

  function resolveTooltipSynergyState(input) {
    var pv = input && input.pv;
    var myCorpsTip = input.isOppCard && input.oppCtx ? (input.oppCtx._myCorps || []) : input.detectMyCorps();
    var handNames = input.isOppCard ? [] : input.getMyHandNames();
    var claimedMilestones = [];
    var claimedCount = 0;

    if (pv && pv.game && pv.game.milestones) {
      for (var mi = 0; mi < pv.game.milestones.length; mi++) {
        var ms = pv.game.milestones[mi];
        if (ms.playerName || ms.color) {
          claimedMilestones.push((ms.name || '').toLowerCase());
          claimedCount++;
        }
      }
    }

    return {
      claimedMilestones: claimedMilestones,
      handNames: handNames,
      moonOn: !!input.isMoonExpansionOn(),
      msAllFull: claimedCount >= 3,
      myCorpsTip: myCorpsTip,
      pfOn: !!input.isPfExpansionOn(),
      underworldOn: !!input.isUnderworldExpansionOn()
    };
  }

  function resolveTooltipSectionsState(input) {
    var ownerState = resolveTooltipOwnerState({
      cardEl: input.cardEl,
      detectCardOwner: input.detectCardOwner,
      getCachedOpponentContext: input.getCachedOpponentContext,
      name: input.name,
      pv: input.pv,
      scoreFromOpponentPerspective: input.scoreFromOpponentPerspective
    });

    var scoreState = resolveTooltipScoreState({
      baseScore: input.baseScore,
      baseTier: input.baseTier,
      cardEl: input.cardEl,
      normalizeReasonRows: input.normalizeReasonRows,
      isOppCard: ownerState.isOppCard,
      oppScoreResult: ownerState.oppScoreResult,
      parseReasonRows: input.parseReasonRows,
      scoreToTier: input.scoreToTier
    });

    var cardState = resolveTooltipCardState({
      cardEl: input.cardEl,
      data: input.data,
      descriptions: input.descriptions,
      name: input.name,
      ruName: input.ruName
    });

    var valueState = resolveTooltipValueState({
      cardCost: typeof cardState.cardCost === 'number' ? cardState.cardCost : 0,
      cardEl: input.cardEl,
      cardEffects: input.cardEffects,
      getCachedPlayerContext: input.getCachedPlayerContext,
      getCardTags: input.getCardTags,
      getFx: input.getFx,
      getRatingByCardName: input.getRatingByCardName,
      isOppCard: ownerState.isOppCard,
      name: input.name,
      oppCtx: ownerState.oppCtx
    });

    var analysisState = resolveTooltipAnalysisState({
      data: input.data,
      isInHand: cardState.isInHand
    });

    var synergyState = resolveTooltipSynergyState({
      detectMyCorps: input.detectMyCorps,
      getMyHandNames: input.getMyHandNames,
      isMoonExpansionOn: input.isMoonExpansionOn,
      isOppCard: ownerState.isOppCard,
      isPfExpansionOn: input.isPfExpansionOn,
      isUnderworldExpansionOn: input.isUnderworldExpansionOn,
      oppCtx: ownerState.oppCtx,
      pv: input.pv
    });

    var metaRowsState = resolveTooltipMetaRowsState({
      cardEl: input.cardEl,
      name: input.name,
      pv: input.pv,
      takeThatCards: input.takeThatCards
    });

    return {
      analysisState: analysisState,
      cardState: cardState,
      ctxScore: scoreState.ctxScore,
      ctxTier: scoreState.ctxTier,
      isOppCard: ownerState.isOppCard,
      metaRowsState: metaRowsState,
      oppCtx: ownerState.oppCtx,
      oppOwner: ownerState.oppOwner,
      oppScoreResult: ownerState.oppScoreResult,
      synergyState: synergyState,
      tipReasons: scoreState.tipReasons,
      tipReasonRows: scoreState.tipReasonRows,
      valueState: valueState
    };
  }

  global.TM_CONTENT_TOOLTIP_STATE = {
    resolveTooltipAnalysisState: resolveTooltipAnalysisState,
    resolveTooltipCardState: resolveTooltipCardState,
    resolveTooltipMetaRowsState: resolveTooltipMetaRowsState,
    resolveTooltipOwnerState: resolveTooltipOwnerState,
    resolveTooltipRequirementState: resolveTooltipRequirementState,
    resolveTooltipScoreState: resolveTooltipScoreState,
    resolveTooltipSectionsState: resolveTooltipSectionsState,
    resolveTooltipSynergyState: resolveTooltipSynergyState,
    resolveTooltipTriggerState: resolveTooltipTriggerState,
    resolveTooltipValueState: resolveTooltipValueState
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
