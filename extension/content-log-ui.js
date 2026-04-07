// TM Tier Overlay - Content log UI helpers
(function(global) {
  'use strict';

  var logFilterPlayer = null;
  var logFilterBarEl = null;
  var logFilterText = '';
  var logSearchDebounceTimer = null;
  var prevHandCards = [];

  function applyLogFilter(logPanel) {
    if (!logPanel || !logPanel.querySelectorAll) return;
    logPanel.querySelectorAll('li').forEach(function(li) {
      var show = true;
      if (logFilterPlayer) {
        show = !!li.querySelector('.log-player.player_bg_color_' + logFilterPlayer);
      }
      if (show && logFilterText) {
        var text = (li.textContent || '').toLowerCase();
        show = text.includes(logFilterText);
      }
      li.style.display = show ? '' : 'none';
    });
  }

  function buildLogSearchBar(input) {
    var logPanel = input && input.logPanel;
    if (!logPanel || typeof logPanel.closest !== 'function') return;
    var logContainer = logPanel.closest('.log-container');
    if (!logContainer || logContainer.querySelector('.tm-log-search')) return;

    var documentObj = input && input.documentObj;
    if (!documentObj || typeof documentObj.createElement !== 'function') return;

    var bar = documentObj.createElement('div');
    bar.className = 'tm-log-search';
    var logWidth = logPanel.offsetWidth;
    bar.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 6px;background:#1a1a2e;border-bottom:1px solid #333;box-sizing:border-box;' + (logWidth ? 'max-width:' + logWidth + 'px;' : '');

    var inputEl = documentObj.createElement('input');
    inputEl.type = 'text';
    inputEl.placeholder = 'Search log... (card, action)';
    inputEl.style.cssText = 'flex:1;background:#2a2a3e;color:#ccc;border:1px solid #444;border-radius:3px;padding:3px 6px;font-size:12px;outline:none;';

    var clearBtn = documentObj.createElement('span');
    clearBtn.textContent = '\u2715';
    clearBtn.title = 'Clear search';
    clearBtn.style.cssText = 'cursor:pointer;color:#888;font-size:14px;padding:0 4px;display:none;user-select:none;';

    var countEl = documentObj.createElement('span');
    countEl.className = 'tm-log-search-count';
    countEl.style.cssText = 'color:#888;font-size:11px;min-width:24px;text-align:right;';

    inputEl.addEventListener('input', function() {
      clearTimeout(logSearchDebounceTimer);
      logSearchDebounceTimer = setTimeout(function() {
        logFilterText = inputEl.value.trim().toLowerCase();
        clearBtn.style.display = logFilterText ? '' : 'none';
        applyLogFilter(logPanel);
        if (logFilterText) {
          var total = logPanel.querySelectorAll('li').length;
          var shown = 0;
          logPanel.querySelectorAll('li').forEach(function(li) { if (li.style.display !== 'none') shown++; });
          countEl.textContent = shown + '/' + total;
        } else {
          countEl.textContent = '';
        }
      }, 300);
    });

    clearBtn.addEventListener('click', function() {
      inputEl.value = '';
      logFilterText = '';
      clearBtn.style.display = 'none';
      countEl.textContent = '';
      applyLogFilter(logPanel);
    });

    bar.appendChild(inputEl);
    bar.appendChild(clearBtn);
    bar.appendChild(countEl);
    logContainer.insertBefore(bar, logPanel);
  }

  function buildLogFilterBar(input) {
    var logPanel = input && input.logPanel;
    if (!logPanel || typeof logPanel.closest !== 'function') return;
    var logContainer = logPanel.closest('.log-container');
    if (!logContainer || logContainer.querySelector('.tm-log-filter')) return;

    var documentObj = input && input.documentObj;
    if (!documentObj || typeof documentObj.createElement !== 'function') return;

    var playerColors = new Set();
    logPanel.querySelectorAll('.log-player').forEach(function(el) {
      var cls = Array.from(el.classList).find(function(c) { return c.startsWith('player_bg_color_'); });
      if (cls) playerColors.add(cls.replace('player_bg_color_', ''));
    });
    if (playerColors.size === 0) return;

    var bar = documentObj.createElement('div');
    bar.className = 'tm-log-filter';

    var allBtn = documentObj.createElement('span');
    allBtn.className = 'tm-log-filter-btn tm-log-filter-active';
    allBtn.textContent = 'Все';
    allBtn.addEventListener('click', function() {
      logFilterPlayer = null;
      bar.querySelectorAll('.tm-log-filter-btn').forEach(function(b) { b.classList.remove('tm-log-filter-active'); });
      allBtn.classList.add('tm-log-filter-active');
      applyLogFilter(logPanel);
    });
    bar.appendChild(allBtn);

    var colorMap = { red: '#d32f2f', blue: '#1976d2', green: '#388e3c', yellow: '#fbc02d', black: '#616161', purple: '#7b1fa2', orange: '#f57c00', pink: '#c2185b' };
    playerColors.forEach(function(color) {
      var btn = documentObj.createElement('span');
      btn.className = 'tm-log-filter-btn';
      btn.style.background = colorMap[color] || '#666';
      var nameEl = logPanel.querySelector('.log-player.player_bg_color_' + color);
      btn.textContent = nameEl ? nameEl.textContent.trim() : color;
      btn.addEventListener('click', function() {
        logFilterPlayer = color;
        bar.querySelectorAll('.tm-log-filter-btn').forEach(function(b) { b.classList.remove('tm-log-filter-active'); });
        btn.classList.add('tm-log-filter-active');
        applyLogFilter(logPanel);
      });
      bar.appendChild(btn);
    });

    logContainer.insertBefore(bar, logPanel);
    logFilterBarEl = bar;
    return logFilterBarEl;
  }

  function trackHandChoices(input) {
    var logPanel = input && input.logPanel;
    var getPlayerVueData = input && input.getPlayerVueData;
    var cardN = input && input.cardN;
    if (!logPanel || typeof getPlayerVueData !== 'function' || typeof cardN !== 'function') return;

    var pv = getPlayerVueData();
    if (!pv) return;

    var curHand = [];
    if (pv.cardsInHand) {
      for (var i = 0; i < pv.cardsInHand.length; i++) curHand.push(cardN(pv.cardsInHand[i]));
    } else if (pv.thisPlayer && pv.thisPlayer.cardsInHand) {
      for (var j = 0; j < pv.thisPlayer.cardsInHand.length; j++) curHand.push(cardN(pv.thisPlayer.cardsInHand[j]));
    }

    if (prevHandCards.length > 0 && curHand.length < prevHandCards.length) {
      var curSet = new Set(curHand);
      var played = prevHandCards.filter(function(c) { return !curSet.has(c); });

      if (played.length > 0 && played.length <= 3 && prevHandCards.length > 1) {
        var recentLis = logPanel.querySelectorAll('li:not([data-tm-choice])');
        for (var liIdx = 0; liIdx < recentLis.length; liIdx++) {
          var li = recentLis[liIdx];
          var text = li.textContent || '';
          var playedCard = played.find(function(c) { return text.toLowerCase().includes(c.toLowerCase()) && /played/i.test(text); });
          if (playedCard) {
            li.setAttribute('data-tm-choice', '1');
            break;
          }
        }
      }
    }

    prevHandCards = curHand;
  }

  global.TM_CONTENT_LOG_UI = {
    applyLogFilter: applyLogFilter,
    buildLogFilterBar: buildLogFilterBar,
    buildLogSearchBar: buildLogSearchBar,
    trackHandChoices: trackHandChoices
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
