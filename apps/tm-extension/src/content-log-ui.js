// TM Tier Overlay - Content log UI helpers
(function(global) {
  'use strict';

  var logFilterPlayer = null;
  var logFilterBarEl = null;
  var logFilterText = '';
  var logSearchDebounceTimer = null;
  var prevHandCards = [];
  var logRatingLookup = null;
  var logRatingLookupSource = null;

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

  function getLogRatingLookup(ratings) {
    if (!ratings) return null;
    if (logRatingLookup && logRatingLookupSource === ratings) return logRatingLookup;

    var lookup = Object.create(null);
    Object.keys(ratings).forEach(function(name) {
      lookup[name.toLowerCase()] = { name: name, data: ratings[name] };
    });
    logRatingLookup = lookup;
    logRatingLookupSource = ratings;
    return lookup;
  }

  function getLogCardName(cardEl) {
    if (!cardEl || typeof cardEl.getAttribute !== 'function') return '';
    var stored = cardEl.getAttribute('data-tm-log-card-name');
    if (stored) return stored;

    var rawName = ((cardEl.textContent || '').split(':')[0] || '').trim();
    if (rawName) cardEl.setAttribute('data-tm-log-card-name', rawName);
    return rawName;
  }

  function resolveLogRating(input, rawName) {
    var adjusted = resolveVisibleAdjustedLogRating(input, rawName);
    if (adjusted) return adjusted;

    var ratings = input && input.ratings;
    if (!ratings || !rawName) return null;
    if (ratings[rawName]) return { name: rawName, data: ratings[rawName] };

    var lookup = getLogRatingLookup(ratings);
    return lookup ? (lookup[rawName.toLowerCase()] || null) : null;
  }

  function parseVisibleBadgeRating(badge) {
    if (!badge) return null;
    var text = (badge.textContent || '').trim();
    var match = text.match(/^([SABCDF])\s+(\d+)/);
    if (!match) return null;
    return {
      tier: match[1],
      score: parseInt(match[2], 10),
      adjusted: badge.hasAttribute('data-tm-original')
    };
  }

  function resolveVisibleAdjustedLogRating(input, rawName) {
    var documentObj = input && input.documentObj;
    if (!documentObj || !documentObj.querySelectorAll || !rawName) return null;

    var best = null;
    documentObj.querySelectorAll('.card-container[data-tm-card]').forEach(function(cardEl) {
      if (!cardEl || typeof cardEl.getAttribute !== 'function') return;
      var visibleName = (cardEl.getAttribute('data-tm-card') || '').trim();
      if (!visibleName || visibleName.toLowerCase() !== rawName.toLowerCase()) return;
      if (typeof cardEl.querySelector !== 'function') return;

      var parsed = parseVisibleBadgeRating(cardEl.querySelector('.tm-tier-badge'));
      if (!parsed) return;

      var resolved = {
        name: visibleName,
        data: { t: parsed.tier, s: parsed.score },
        adjusted: parsed.adjusted
      };
      if (parsed.adjusted) {
        best = resolved;
        return;
      }
      if (!best) best = resolved;
    });
    return best;
  }

  function findLogCardScoreBadge(cardEl) {
    if (!cardEl) return null;
    if (typeof cardEl.querySelector === 'function') {
      var childBadge = cardEl.querySelector('.tm-log-card-score');
      if (childBadge) return childBadge;
    }
    var nextNode = cardEl.nextSibling;
    while (nextNode && nextNode.nodeType === 3 && !String(nextNode.textContent || '').trim()) nextNode = nextNode.nextSibling;
    if (nextNode && nextNode.classList && nextNode.classList.contains('tm-log-card-score')) return nextNode;
    return null;
  }

  function decorateLogCardScores(input) {
    var documentObj = input && input.documentObj;
    var enabled = !input || input.enabled !== false;
    if (!documentObj || !documentObj.querySelectorAll) return;
    var logPanel = documentObj.querySelector('.log-panel');
    var scrollablePanel = getScrollablePanel(logPanel);
    var stickToBottom = shouldStickLogToBottom(scrollablePanel);

    if (!enabled) {
      documentObj.querySelectorAll('.tm-log-card-score').forEach(function(el) { el.remove(); });
      restoreLogScroll(scrollablePanel, stickToBottom);
      return;
    }

    var mutated = false;
    documentObj.querySelectorAll('.log-card').forEach(function(cardEl) {
      if (!cardEl || typeof cardEl.getAttribute !== 'function') return;
      var oldBadge = findLogCardScoreBadge(cardEl);
      var rawName = getLogCardName(cardEl);
      var rating = resolveLogRating(input, rawName);
      if (!rating || !rating.data || rating.data.s == null || !rating.data.t) {
        if (oldBadge) {
          oldBadge.remove();
          mutated = true;
        }
        if (cardEl.style && typeof cardEl.style.removeProperty === 'function') {
          cardEl.style.removeProperty('position');
          cardEl.style.removeProperty('display');
          cardEl.style.removeProperty('margin-right');
        }
        return;
      }

      var badge = oldBadge || documentObj.createElement('span');
      badge.className = 'tm-log-card-score tm-log-tier tm-tier-' + rating.data.t;
      badge.textContent = rating.data.t + ' ' + rating.data.s;
      badge.style.cssText = 'display:inline-block;margin-left:4px;padding:2px 6px;font-size:12px;line-height:1.2;vertical-align:middle;white-space:nowrap;';
      if (cardEl.style && typeof cardEl.style.removeProperty === 'function') {
        cardEl.style.removeProperty('position');
        cardEl.style.removeProperty('display');
        cardEl.style.removeProperty('margin-right');
      }
      if (!oldBadge) {
        if (typeof cardEl.insertAdjacentElement === 'function') cardEl.insertAdjacentElement('afterend', badge);
        else if (cardEl.parentNode && typeof cardEl.parentNode.appendChild === 'function') cardEl.parentNode.appendChild(badge);
        mutated = true;
      } else if (oldBadge.textContent !== badge.textContent || oldBadge.className !== badge.className) {
        mutated = true;
      }
    });

    restoreLogScroll(scrollablePanel, stickToBottom && mutated);
  }

  global.TM_CONTENT_LOG_UI = {
    applyLogFilter: applyLogFilter,
    buildLogFilterBar: buildLogFilterBar,
    buildLogSearchBar: buildLogSearchBar,
    decorateLogCardScores: decorateLogCardScores,
    trackHandChoices: trackHandChoices
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
