// TM Tier Overlay - Draft history helpers
(function(global) {
  'use strict';

  var _storedDraftLogEntries = [];
  var _storedDraftLogGameId = '';
  var _storedDraftLogAt = 0;
  var _storedDraftLogPending = false;
  var _lastDraftLogCount = 0;

  function getScrollablePanel(logPanel) {
    if (!logPanel || typeof logPanel.querySelector !== 'function') return null;
    return logPanel.querySelector('#logpanel-scrollable') || logPanel.querySelector('.panel-body');
  }

  function shouldStickLogToBottom(scrollablePanel) {
    if (!scrollablePanel) return false;
    var remaining = scrollablePanel.scrollHeight - scrollablePanel.clientHeight - scrollablePanel.scrollTop;
    return remaining <= 24;
  }

  function restoreLogScroll(scrollablePanel, shouldStick) {
    if (!scrollablePanel || !shouldStick) return;
    var stick = function() {
      scrollablePanel.scrollTop = scrollablePanel.scrollHeight;
    };
    stick();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function() {
        stick();
        requestAnimationFrame(stick);
      });
      return;
    }
    setTimeout(stick, 0);
    setTimeout(stick, 50);
  }

  function entryCardName(card) {
    if (!card) return '';
    return typeof card === 'string' ? card : (card.name || '');
  }

  function entryCardMeta(card, entry, ratings) {
    var name = entryCardName(card);
    var rating = (ratings && ratings[name]) || {};
    var score = null;
    var tier = null;
    var baseScore = rating && rating.s != null ? rating.s : 0;
    var baseTier = rating && rating.t ? rating.t : '?';
    var total = null;
    var reasons = [];
    if (card && typeof card === 'object') {
      if (card.score != null) score = card.score;
      if (card.tier) tier = card.tier;
      if (card.baseScore != null) baseScore = card.baseScore;
      if (card.baseTier) baseTier = card.baseTier;
      if (card.total != null) total = card.total;
      else if (card.displayTotal != null) total = card.displayTotal;
      if (Array.isArray(card.reasons)) reasons = card.reasons;
    }
    if (score == null) score = baseScore;
    if (!tier) tier = baseTier;
    return { name: name, score: score, tier: tier, baseScore: baseScore, baseTier: baseTier, total: total, reasons: reasons };
  }

  function formatDraftCardWithTier(card, entry, deps) {
    var meta = entryCardMeta(card, entry, deps && deps.ratings);
    var ruName = deps && deps.ruName;
    var escHtml = deps && deps.escHtml;
    var shown = (typeof ruName === 'function' ? ruName(meta.name) : '') || meta.name;
    return typeof escHtml === 'function' ? escHtml(shown + ' ' + meta.baseTier + meta.baseScore) : shown;
  }

  function formatDraftList(names, entry, deps) {
    var parts = (names || []).map(function(name) { return formatDraftCardWithTier(name, entry, deps); });
    if (parts.length <= 1) return parts.join('');
    if (parts.length === 2) return parts[0] + ' и ' + parts[1];
    return parts.slice(0, -1).join(', ') + ' и ' + parts[parts.length - 1];
  }

  function normalizeNameList(items) {
    return (items || []).map(function(item) { return entryCardName(item); }).filter(Boolean);
  }

  function renderStoredEntry(entry, li, deps) {
    var offeredCards = (entry.offered || []).map(function(card) { return entryCardMeta(card, entry, deps && deps.ratings); });
    var takenNames = normalizeNameList(entry.taken ? [entry.taken] : (entry.picked || entry.bought || []));
    var skippedNames = normalizeNameList(entry.passed || entry.skipped || []);
    var escHtml = deps && deps.escHtml;
    var ruName = deps && deps.ruName;
    var isNegativeReason = deps && deps.isNegativeReason;

    var title = '📋 Лог';
    if (entry.type === 'corp') title = '🏢 Корпа';
    else if (entry.type === 'prelude') title = '🛰 Прелюдия';
    else if (entry.type === 'research_buy') title = '🧪 Исследование';
    else if (entry.type === 'draft' || entry.type === 'initial_draft') title = '📋 Драфт';

    var genRound = [];
    if (entry.generation != null) genRound.push('G' + entry.generation);
    if (entry.round != null) genRound.push('R' + entry.round);

    var summary = [];
    if (takenNames.length > 0) summary.push('взял ' + formatDraftList(takenNames, entry, deps));
    if (skippedNames.length > 0) summary.push((entry.type === 'research_buy' ? 'скип ' : 'пропустил ') + formatDraftList(skippedNames, entry, deps));

    var header = '<span style="color:#bb86fc">' + title + (genRound.length > 0 ? ' ' + genRound.join(' ') : '') + '</span>';
    var summaryHtml = summary.length > 0
      ? '<div class="tm-draft-summary" style="margin:2px 0 4px 0;color:#d7d7d7;font-size:11px">(' + summary.join(' | ') + ')</div>'
      : '';
    var cardsHtml = '';

    if (offeredCards.length > 0) {
      cardsHtml = '<div class="tm-draft-cards">';
      for (var oi = 0; oi < offeredCards.length; oi++) {
        var card = offeredCards[oi];
        var displayName = typeof escHtml === 'function' ? escHtml((typeof ruName === 'function' ? ruName(card.name) : '') || card.name) : card.name;
        var isTaken = takenNames.indexOf(card.name) >= 0;
        var isSkipped = skippedNames.indexOf(card.name) >= 0;
        var shownScore = card.total != null ? card.total : card.score;
        var adjText = shownScore !== card.baseScore ? ' → ' + shownScore : '';
        cardsHtml += '<div class="tm-draft-card-row' + (isTaken ? ' tm-draft-taken' : '') + '">';
        cardsHtml += '<span class="tm-log-tier tm-tier-' + card.tier + '">' + card.baseTier + card.baseScore + adjText + '</span> ';
        if (isTaken) {
          cardsHtml += '<b>' + displayName + ' ✓</b>';
        } else if (isSkipped) {
          cardsHtml += '<span style="opacity:0.65">' + displayName + '</span> <span style="color:#ff9800;font-size:10px">' + (entry.type === 'research_buy' ? '↗ скип' : '↗ пропуск') + '</span>';
        } else {
          cardsHtml += '<span style="opacity:0.65">' + displayName + '</span>';
        }
        if (isTaken && card.reasons.length > 0) {
          var pos = [];
          var neg = [];
          for (var ri = 0; ri < card.reasons.length; ri++) {
            if (typeof isNegativeReason === 'function' && isNegativeReason(card.reasons[ri])) neg.push(card.reasons[ri]);
            else pos.push(card.reasons[ri]);
          }
          if (pos.length > 0) cardsHtml += ' <span class="tm-draft-reasons">' + pos.join(', ') + '</span>';
          if (neg.length > 0) cardsHtml += ' <span class="tm-draft-reasons" style="color:#ff5252">' + neg.join(', ') + '</span>';
        }
        cardsHtml += '</div>';
      }
      cardsHtml += '</div>';
    }

    li.innerHTML = header + summaryHtml + cardsHtml;
  }

  function injectDraftHistory(input) {
    var logPanel = input && input.logPanel;
    var scrollablePanel = getScrollablePanel(logPanel);
    var stickToBottom = shouldStickLogToBottom(scrollablePanel);
    var draftHistory = input && input.draftHistory;
    var scrollable = logPanel && (logPanel.querySelector('#logpanel-scrollable ul') || logPanel.querySelector('#logpanel-scrollable'));
    if (!scrollable) return 0;

    scrollable.querySelectorAll('.tm-draft-log-entry').forEach(function(el) { el.remove(); });
    var entries = (_storedDraftLogEntries.length >= (draftHistory || []).length) ? _storedDraftLogEntries : (draftHistory || []);
    var useStored = entries === _storedDraftLogEntries;
    if (!entries || entries.length === 0) return 0;

    var deps = {
      ratings: input && input.ratings,
      ruName: input && input.ruName,
      escHtml: input && input.escHtml,
      isNegativeReason: input && input.isNegativeReason
    };

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var li = document.createElement('li');
      li.className = 'tm-draft-log-entry';
      if (useStored) {
        renderStoredEntry(entry, li, deps);
        scrollable.appendChild(li);
        continue;
      }

      var takenName = entry.taken || '?';
      var draftedLabel = entry.taken ? formatDraftCardWithTier(entry.taken, entry, deps) : '?';
      var passedText = formatDraftList(entry.passed || [], entry, deps);
      var summaryHtml = '<div class="tm-draft-summary" style="margin:2px 0 4px 0;color:#d7d7d7;font-size:11px">(взял <b>' + draftedLabel + '</b>';
      if (passedText) {
        summaryHtml += ' | пропустил ' + passedText;
        if (entry.passedTo) {
          summaryHtml += ' → ' + (typeof deps.escHtml === 'function' ? deps.escHtml(entry.passedTo) : entry.passedTo);
        }
      }
      summaryHtml += ' )</div>';

      var cardsHtml = '<div class="tm-draft-cards">';
      for (var j = 0; j < entry.offered.length; j++) {
        var card = entry.offered[j];
        var isTaken = card.name === takenName;
        var displayName = typeof deps.escHtml === 'function' ? deps.escHtml((typeof deps.ruName === 'function' ? deps.ruName(card.name) : '') || card.name) : card.name;
        var tierClass = 'tm-tier-' + card.tier;
        var scoreText = card.baseTier + card.baseScore;
        var shownScore = card.displayTotal != null ? card.displayTotal : card.total;
        var adjText = shownScore !== card.baseScore ? ' → ' + shownScore : '';

        var isPassed = !isTaken && entry.passed && entry.passed.includes(card.name);
        cardsHtml += '<div class="tm-draft-card-row' + (isTaken ? ' tm-draft-taken' : '') + '">';
        cardsHtml += '<span class="tm-log-tier ' + tierClass + '">' + scoreText + adjText + '</span> ';
        if (isTaken) {
          cardsHtml += '<b>' + displayName + ' ✓</b>';
        } else if (isPassed) {
          cardsHtml += '<span style="opacity:0.65">' + displayName + '</span> <span style="color:#ff9800;font-size:10px">↗ отдано</span>';
        } else {
          cardsHtml += '<span style="opacity:0.65">' + displayName + '</span>';
        }
        if (isTaken && card.reasons.length > 0) {
          var drPos = [];
          var drNeg = [];
          for (var dri = 0; dri < card.reasons.length; dri++) {
            if (typeof deps.isNegativeReason === 'function' && deps.isNegativeReason(card.reasons[dri])) drNeg.push(card.reasons[dri]);
            else drPos.push(card.reasons[dri]);
          }
          if (drPos.length > 0) cardsHtml += ' <span class="tm-draft-reasons">' + drPos.join(', ') + '</span>';
          if (drNeg.length > 0) cardsHtml += ' <span class="tm-draft-reasons" style="color:#ff5252">' + drNeg.join(', ') + '</span>';
        }
        cardsHtml += '</div>';
      }
      cardsHtml += '</div>';

      li.innerHTML = '<span style="color:#bb86fc">📋 Драфт ' + entry.round + '</span>' + summaryHtml + cardsHtml;
      scrollable.appendChild(li);
    }

    _lastDraftLogCount = entries.length;
    restoreLogScroll(scrollablePanel, stickToBottom);
    return _lastDraftLogCount;
  }

  function refreshStoredDraftLog(input) {
    var safeStorage = input && input.safeStorage;
    var parseGameId = input && input.parseGameId;
    var chromeRuntime = input && input.chromeRuntime;
    var documentObj = input && input.documentObj;

    var gameId = typeof parseGameId === 'function' ? parseGameId() : '';
    if (!gameId || typeof safeStorage !== 'function') return;
    if (_storedDraftLogPending) return;
    if (_storedDraftLogGameId === gameId && (Date.now() - _storedDraftLogAt) < 1500) return;

    _storedDraftLogPending = true;
    _storedDraftLogGameId = gameId;
    safeStorage(function(storage) {
      storage.local.get('gamelog_' + gameId, function(data) {
        _storedDraftLogPending = false;
        _storedDraftLogAt = Date.now();
        try {
          if (chromeRuntime && chromeRuntime.lastError) return;
        } catch (e) {}
        var log = data ? data['gamelog_' + gameId] : null;
        _storedDraftLogEntries = (log && Array.isArray(log.draftLog)) ? log.draftLog.slice() : [];
        var panel = documentObj && typeof documentObj.querySelector === 'function' ? documentObj.querySelector('.log-panel') : null;
        if (panel) injectDraftHistory(Object.assign({}, input, { logPanel: panel }));
      });
    });
  }

  global.TM_CONTENT_DRAFT_HISTORY = {
    injectDraftHistory: injectDraftHistory,
    refreshStoredDraftLog: refreshStoredDraftLog
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
