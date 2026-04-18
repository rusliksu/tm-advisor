// TM Tier Overlay - Content cycle helpers
(function(global) {
  'use strict';

  function processAll(input) {
    var enabled = input && input.enabled;
    var isProcessingNow = input && input.isProcessingNow;
    var setProcessingNow = input && input.setProcessingNow;
    var debugMode = input && input.debugMode;
    var performanceObj = input && input.performanceObj;
    var windowObj = input && input.windowObj;
    var documentObj = input && input.documentObj;
    var injectBadge = input && input.injectBadge;
    var getVisibleCardsHash = input && input.getVisibleCardsHash;
    var detectMyCorp = input && input.detectMyCorp;
    var prevVisibleHash = input && input.prevVisibleHash;
    var prevCorpName = input && input.prevCorpName;
    var setPrevVisibleHash = input && input.setPrevVisibleHash;
    var setPrevCorpName = input && input.setPrevCorpName;
    var checkCombos = input && input.checkCombos;
    var detectHandCombos = input && input.detectHandCombos;
    var highlightCorpSynergies = input && input.highlightCorpSynergies;
    var updateDraftRecommendations = input && input.updateDraftRecommendations;
    var updateHandScores = input && input.updateHandScores;
    var checkPreludePackage = input && input.checkPreludePackage;
    var injectDiscardHints = input && input.injectDiscardHints;
    var injectPlayPriorityBadges = input && input.injectPlayPriorityBadges;
    var trackDraftHistory = input && input.trackDraftHistory;
    var rateStandardProjects = input && input.rateStandardProjects;
    var enhanceGameLog = input && input.enhanceGameLog;
    var highlightPlayable = input && input.highlightPlayable;
    var tmLog = input && input.tmLog;
    var setLastProcessAllMs = input && input.setLastProcessAllMs;

    if (!enabled || isProcessingNow || typeof setProcessingNow !== 'function' || !documentObj) return;

    setProcessingNow(true);
    var perfNow = performanceObj && typeof performanceObj.now === 'function' ? function() { return performanceObj.now(); } : null;
    var t0 = debugMode && perfNow ? perfNow() : 0;
    var scrollY = windowObj ? windowObj.scrollY : 0;
    var dirty = false;

    try {
      var newCards = false;
      documentObj.querySelectorAll('.card-container:not([data-tm-processed])').forEach(function(el) {
        if (typeof injectBadge === 'function') injectBadge(el);
        el.setAttribute('data-tm-processed', '1');
        newCards = true;
      });

      var curHash = typeof getVisibleCardsHash === 'function' ? getVisibleCardsHash() : '';
      var curCorp = typeof detectMyCorp === 'function' ? (detectMyCorp() || '') : '';
      dirty = newCards || curHash !== prevVisibleHash || curCorp !== prevCorpName;
      if (typeof setPrevVisibleHash === 'function') setPrevVisibleHash(curHash);
      if (typeof setPrevCorpName === 'function') setPrevCorpName(curCorp);

      if (dirty) {
        var tCombos = debugMode && perfNow ? perfNow() : 0;
        if (typeof checkCombos === 'function') checkCombos();
        if (typeof detectHandCombos === 'function') detectHandCombos();
        if (typeof highlightCorpSynergies === 'function') highlightCorpSynergies();

        var tDraft = debugMode && perfNow ? perfNow() : 0;
        if (typeof updateDraftRecommendations === 'function') updateDraftRecommendations();
        if (typeof updateHandScores === 'function') updateHandScores();
        if (typeof checkPreludePackage === 'function') checkPreludePackage();
        if (typeof injectDiscardHints === 'function') injectDiscardHints();
        if (typeof injectPlayPriorityBadges === 'function') injectPlayPriorityBadges();

        if (debugMode && perfNow && typeof tmLog === 'function') {
          var tEndDirty = perfNow();
          tmLog('perf', 'processAll breakdown: combos=' + (tDraft - tCombos).toFixed(1) + 'ms, draft+badges=' + (tEndDirty - tDraft).toFixed(1) + 'ms');
        }
      }

      if (typeof trackDraftHistory === 'function') trackDraftHistory();
      if (typeof rateStandardProjects === 'function') rateStandardProjects();
      if (typeof enhanceGameLog === 'function') enhanceGameLog();
      if (typeof highlightPlayable === 'function') highlightPlayable();
    } finally {
      setProcessingNow(false);
      if (windowObj && typeof windowObj.scrollTo === 'function' && Math.abs((windowObj.scrollY || 0) - scrollY) > 5) {
        windowObj.scrollTo(0, scrollY);
      }
      if (debugMode && perfNow) {
        var elapsed = perfNow() - t0;
        if (typeof setLastProcessAllMs === 'function') setLastProcessAllMs(elapsed);
        if (typeof tmLog === 'function') {
          tmLog('perf', 'processAll ' + elapsed.toFixed(1) + 'ms, dirty=' + dirty);
        }
      }
    }
  }

  function removeAll(input) {
    var documentObj = input && input.documentObj;
    var hideTooltip = input && input.hideTooltip;
    var clearReasonPayload = input && input.clearReasonPayload;
    if (!documentObj) return;

    documentObj.querySelectorAll('.tm-tier-badge, .tm-combo-tooltip, .tm-anti-combo-tooltip, .tm-hand-combo, .tm-log-card-score').forEach(function(el) {
      el.remove();
    });
    documentObj.querySelectorAll('.tm-combo-highlight, .tm-combo-godmode, .tm-combo-great, .tm-combo-good, .tm-combo-decent, .tm-combo-niche').forEach(function(el) {
      el.classList.remove('tm-combo-highlight', 'tm-combo-godmode', 'tm-combo-great', 'tm-combo-good', 'tm-combo-decent', 'tm-combo-niche');
    });
    documentObj.querySelectorAll('.tm-dim, .tm-corp-synergy, .tm-tag-synergy, .tm-combo-hint, .tm-anti-combo, .tm-rec-best, .tm-playable, .tm-unplayable').forEach(function(el) {
      el.classList.remove('tm-dim', 'tm-corp-synergy', 'tm-tag-synergy', 'tm-combo-hint', 'tm-anti-combo', 'tm-rec-best', 'tm-playable', 'tm-unplayable');
    });
    documentObj.querySelectorAll('[data-tm-processed]').forEach(function(el) {
      el.removeAttribute('data-tm-processed');
      el.removeAttribute('data-tm-card');
      el.removeAttribute('data-tm-tier');
    });
    documentObj.querySelectorAll('[data-tm-reasons], [data-tm-reason-rows]').forEach(function(el) {
      if (typeof clearReasonPayload === 'function') clearReasonPayload(el);
      else {
        el.removeAttribute('data-tm-reasons');
        el.removeAttribute('data-tm-reason-rows');
      }
    });
    if (typeof hideTooltip === 'function') hideTooltip();
  }

  global.TM_CONTENT_CYCLE = {
    processAll: processAll,
    removeAll: removeAll
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
