// TM Tier Overlay — contextual game-state overlay renderer
(function(global) {
  'use strict';

  var BADGE_CLASS = 'tm-game-signal-badge';
  var STACK_CLASS = 'tm-game-signal-stack';

  function signalPriority(signal) {
    if (!signal) return 0;
    return typeof signal.priority === 'number' ? signal.priority : 0;
  }

  function selectVisibleSignals(signals) {
    var rows = Array.isArray(signals) ? signals.slice() : [];
    rows.sort(function(a, b) {
      return signalPriority(b) - signalPriority(a);
    });
    var critical = null;
    var hints = [];
    for (var i = 0; i < rows.length; i++) {
      var signal = rows[i];
      if (!signal) continue;
      if (signal.severity === 'critical') {
        if (!critical) critical = signal;
        continue;
      }
      if (hints.length < 2) hints.push(signal);
    }
    return (critical ? [critical] : []).concat(hints);
  }

  function removeNode(node) {
    if (!node) return;
    if (typeof node.remove === 'function') {
      node.remove();
      return;
    }
    if (node.parentNode && typeof node.parentNode.removeChild === 'function') {
      node.parentNode.removeChild(node);
    }
  }

  function clearGameSignals(input) {
    var documentObj = (input && input.documentObj) || (typeof document !== 'undefined' ? document : null);
    if (!documentObj || typeof documentObj.querySelectorAll !== 'function') return;
    var badges = documentObj.querySelectorAll('.' + BADGE_CLASS);
    for (var i = 0; i < badges.length; i++) removeNode(badges[i]);
    var stacks = documentObj.querySelectorAll('.' + STACK_CLASS);
    for (var si = 0; si < stacks.length; si++) removeNode(stacks[si]);
  }

  function queryFirst(documentObj, selectors) {
    if (!documentObj || typeof documentObj.querySelector !== 'function') return null;
    for (var i = 0; i < selectors.length; i++) {
      try {
        var found = documentObj.querySelector(selectors[i]);
        if (found) return found;
      } catch (e) {
        // Ignore selectors unsupported by older browser engines or tests.
      }
    }
    return null;
  }

  function nodeText(node) {
    return String((node && node.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  function classText(node) {
    return String((node && node.className) || '').toLowerCase();
  }

  function cssToken(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function queryTextCandidates(documentObj) {
    if (!documentObj || typeof documentObj.querySelectorAll !== 'function') return [];
    var selectors = [
      'button',
      'td',
      'th',
      'li',
      '[class*="award"]',
      '[class*="milestone"]',
      '.ma-name',
      '.milestone-award-inline',
      '[class*="global"]',
      '[class*="parameter"]',
      '.events-board',
      '.global-event',
      '.global-event-title',
      '.global-event-name',
      '[class*="turmoil"]',
      '[class*="event"]'
    ];
    var rows = [];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var found = documentObj.querySelectorAll(selectors[i]);
        for (var j = 0; j < found.length; j++) {
          if (rows.indexOf(found[j]) < 0) rows.push(found[j]);
        }
      } catch (e) {
        // Ignore selectors unsupported by older browser engines or tests.
      }
    }
    return rows;
  }

  function textAnchorScore(node, anchor) {
    var key = String((anchor && anchor.key) || '').toLowerCase();
    var type = String((anchor && anchor.type) || '').toLowerCase();
    var text = nodeText(node).toLowerCase();
    if (!key || !text || text.indexOf(key) < 0) return 0;
    if (text.length > 180) return 0;

    var classes = classText(node);
    var score = 10;
    if (type && classes.indexOf(type) >= 0) score += 25;
    if (type === 'award' && text.indexOf('award') >= 0) score += 12;
    if (type === 'milestone' && text.indexOf('milestone') >= 0) score += 12;
    score += Math.max(0, 40 - text.length / 4);
    return score;
  }

  function findTextAnchor(documentObj, anchor) {
    if (!anchor || !anchor.key) return null;
    if (anchor.type !== 'award' && anchor.type !== 'milestone') return null;
    var candidates = queryTextCandidates(documentObj);
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < candidates.length; i++) {
      var score = textAnchorScore(candidates[i], anchor);
      if (score > bestScore) {
        best = candidates[i];
        bestScore = score;
      }
    }
    return best;
  }

  function anchorSelectors(anchor) {
    if (!anchor) return [];
    var type = anchor.type || '';
    var key = anchor.key || '';
    var keyToken = cssToken(key);
    var selectors = [];
    if (key) selectors.push('[data-tm-game-anchor="' + String(key).replace(/"/g, '') + '"]');
    if (type && key) selectors.push('[data-tm-game-anchor="' + String(type + ':' + key).replace(/"/g, '') + '"]');

    if (type === 'resource' && key === 'heat') {
      selectors = selectors.concat([
        '.resource_item--heat',
        '.tag-heat',
        '[class*="resource"][class*="heat"]'
      ]);
    }
    if (type === 'resource' && key === 'plants') {
      selectors = selectors.concat([
        '.resource_item--plant',
        '.resource_item--plants',
        '.tag-plant',
        '.tag-plants',
        '[class*="resource"][class*="plant"]'
      ]);
    }
    if (type === 'global') {
      if (key === 'event') {
        selectors = selectors.concat([
          '.global-event--coming',
          '.events-board .global-event--coming',
          '.events-board .global-event',
          '.events-board',
          '.turmoil .events-board'
        ]);
      } else {
        selectors = selectors.concat([
          '.global_params',
          '.global-numbers',
          '.global-parameters',
          '.ma-global-parameters',
          '.global-numbers-temperature',
          '.global-numbers-oxygen',
          '.global-numbers-oceans'
        ]);
      }
    }
    if (type === 'award' && key) {
      selectors = selectors.concat([
        '[data-tm-award-name="' + String(key).replace(/"/g, '') + '"]',
        '.awards .ma-name--' + keyToken,
        '.awards .award-block.ma-name--' + keyToken,
        '.ma-name--awards.ma-name--' + keyToken
      ]);
    }
    if (type === 'milestone' && key) {
      selectors = selectors.concat([
        '[data-tm-milestone-name="' + String(key).replace(/"/g, '') + '"]',
        '.milestones .ma-name--' + keyToken,
        '.ma-name--milestones.ma-name--' + keyToken
      ]);
    }
    if (type === 'standard' && key) {
      selectors.push('[data-tm-standard-project="' + String(key).replace(/"/g, '') + '"]');
    }
    return selectors;
  }

  function findAnchor(documentObj, signal) {
    var anchor = signal && signal.anchor;
    return queryFirst(documentObj, anchorSelectors(anchor)) || findTextAnchor(documentObj, anchor);
  }

  function ensureRelative(anchor) {
    if (!anchor || !anchor.style) return;
    if (!anchor.style.position) anchor.style.position = 'relative';
    if (!anchor.style.overflow) anchor.style.overflow = 'visible';
  }

  function tooltipText(signal) {
    var parts = [];
    if (signal && signal.title) parts.push(signal.title);
    var reasons = (signal && signal.reasons) || [];
    for (var i = 0; i < reasons.length; i++) {
      if (reasons[i]) parts.push('- ' + reasons[i]);
    }
    if (signal && signal.action) parts.push('Action: ' + signal.action);
    return parts.join('\n');
  }

  function badgeStyle(signal, anchored, offset) {
    var severity = (signal && signal.severity) || 'info';
    var bg = 'rgba(43, 52, 69, 0.96)';
    var border = '#6c7893';
    var color = '#e8eefc';
    if (severity === 'critical') {
      bg = 'rgba(120, 22, 22, 0.96)';
      border = '#ff6b6b';
      color = '#fff1f1';
    } else if (severity === 'warning') {
      bg = 'rgba(91, 65, 16, 0.97)';
      border = '#ffbf47';
      color = '#fff4d8';
    } else if (severity === 'positive') {
      bg = 'rgba(20, 84, 49, 0.96)';
      border = '#55d98b';
      color = '#eafff1';
    }

    var base = 'font-size:10px;font-weight:700;line-height:1.15;white-space:nowrap;'
      + 'border-radius:4px;padding:2px 5px;border:1px solid ' + border + ';'
      + 'background:' + bg + ';color:' + color + ';z-index:2147483000;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,0.35);cursor:help;pointer-events:auto;';
    if (anchored) {
      return 'position:absolute;right:2px;top:' + (2 + (offset || 0) * 18) + 'px;' + base;
    }
    return 'position:relative;display:block;margin:0 0 4px 0;' + base;
  }

  function createBadge(documentObj, signal, anchored, offset) {
    var badge = documentObj.createElement('span');
    badge.className = BADGE_CLASS + ' tm-game-signal-' + ((signal && signal.severity) || 'info');
    badge.textContent = (signal && signal.label) || 'Advisor';
    badge.setAttribute('data-tm-game-signal-id', (signal && signal.id) || '');
    badge.setAttribute('title', tooltipText(signal));
    if (badge.style) badge.style.cssText = badgeStyle(signal, anchored, offset);
    return badge;
  }

  function ensureStack(documentObj) {
    var existing = queryFirst(documentObj, ['.' + STACK_CLASS]);
    if (existing) return existing;
    var stack = documentObj.createElement('div');
    stack.className = STACK_CLASS;
    if (stack.style) {
      stack.style.cssText = 'position:fixed;left:10px;top:54px;z-index:2147482999;'
        + 'display:flex;flex-direction:column;align-items:flex-start;max-width:260px;pointer-events:none;';
    }
    var host = documentObj.body || documentObj.documentElement;
    if (host && typeof host.appendChild === 'function') host.appendChild(stack);
    return stack;
  }

  function renderGameSignals(input) {
    var documentObj = (input && input.documentObj) || (typeof document !== 'undefined' ? document : null);
    if (!documentObj || typeof documentObj.createElement !== 'function') return [];
    clearGameSignals({documentObj: documentObj});

    var visible = selectVisibleSignals(input && input.signals);
    var rendered = [];
    var anchorCounts = [];
    function nextAnchorOffset(anchor) {
      for (var ci = 0; ci < anchorCounts.length; ci++) {
        if (anchorCounts[ci].anchor === anchor) {
          var offset = anchorCounts[ci].count;
          anchorCounts[ci].count += 1;
          return offset;
        }
      }
      anchorCounts.push({anchor: anchor, count: 1});
      return 0;
    }
    for (var i = 0; i < visible.length; i++) {
      var signal = visible[i];
      var anchor = findAnchor(documentObj, signal);
      if (anchor) {
        var idx = nextAnchorOffset(anchor);
        ensureRelative(anchor);
        var anchoredBadge = createBadge(documentObj, signal, true, idx);
        anchor.appendChild(anchoredBadge);
        rendered.push(anchoredBadge);
        continue;
      }

      var stack = ensureStack(documentObj);
      if (!stack) continue;
      var fallbackBadge = createBadge(documentObj, signal, false, 0);
      stack.appendChild(fallbackBadge);
      rendered.push(fallbackBadge);
    }
    return rendered;
  }

  global.TM_CONTENT_GAME_OVERLAYS = {
    clearGameSignals: clearGameSignals,
    findAnchor: findAnchor,
    renderGameSignals: renderGameSignals,
    selectVisibleSignals: selectVisibleSignals
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
