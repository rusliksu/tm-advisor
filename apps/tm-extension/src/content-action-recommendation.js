// TM Tier Overlay - Current action recommendation helpers
(function(global) {
  'use strict';

  var BOX_CLASS = 'tm-action-recommendation';
  var TARGET_CLASS = 'tm-action-recommendation-target';

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : (fallback || 0);
  }

  function lower(value) {
    return String(value || '').toLowerCase();
  }

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeText(value) {
    return compactText(value).toLowerCase();
  }

  function shortText(value, maxLen) {
    var text = compactText(value);
    var limit = maxLen || 72;
    if (text.length <= limit) return text;
    return text.substring(0, limit - 1) + '…';
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

  function getWaitingFor(state) {
    if (!state) return null;
    var player = state.thisPlayer || state.player || {};
    return state._waitingFor ||
      state.waitingFor ||
      player._waitingFor ||
      player.waitingFor ||
      null;
  }

  function isActionPhase(state) {
    var game = state && state.game;
    var phase = (state && state.phase) || (game && game.phase) || '';
    return !phase || phase === 'action';
  }

  function sameColor(a, b) {
    return !!a && !!b && lower(a) === lower(b);
  }

  function colorOf(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value.color || value.playerColor || value.activePlayer || '';
  }

  function activeColorFromState(state) {
    var game = (state && state.game) || {};
    return colorOf(state && (state.activePlayerColor || state.activePlayer || state.currentPlayerColor || state.currentPlayer)) ||
      colorOf(game.activePlayerColor || game.activePlayer || game.currentPlayerColor || game.currentPlayer);
  }

  function myPlayerRow(state) {
    var myColor = colorOf(state && state.thisPlayer);
    var players = asArray((state && state.players) || (state && state.game && state.game.players));
    for (var i = 0; i < players.length; i++) {
      if (sameColor(colorOf(players[i]), myColor)) return players[i];
    }
    return state && state.thisPlayer;
  }

  function activePlayerRow(state) {
    var players = asArray((state && state.players) || (state && state.game && state.game.players));
    for (var i = 0; i < players.length; i++) {
      if (players[i] && players[i].isActive === true) return players[i];
    }
    return null;
  }

  function isMyActionTurn(state) {
    if (!state || !state.thisPlayer) return false;
    var myColor = colorOf(state.thisPlayer);
    var myRow = myPlayerRow(state);
    if (myRow && (myRow.isActive === false || myRow.active === false)) return false;

    var activeRow = activePlayerRow(state);
    if (activeRow) return sameColor(colorOf(activeRow), myColor);

    var activeColor = activeColorFromState(state);
    if (activeColor && myColor) return sameColor(activeColor, myColor);

    return true;
  }

  function isActionChoicePrompt(waitingFor) {
    return !!(waitingFor && waitingFor.type === 'or' && Array.isArray(waitingFor.options) && waitingFor.options.length > 0);
  }

  function cloneStateWithWaitingFor(state, waitingFor) {
    var out = {};
    var key;
    for (key in (state || {})) {
      if (Object.prototype.hasOwnProperty.call(state, key)) out[key] = state[key];
    }
    out._waitingFor = waitingFor;
    out.waitingFor = waitingFor;
    return out;
  }

  function optionTitle(option) {
    return compactText(option && (option.title || option.buttonLabel || option.type || ''));
  }

  function normalizeActionLabel(label) {
    var text = compactText(label);
    if (!text) return '';
    text = text.replace(/\$\{[^}]+\}/g, '').replace(/\s+/g, ' ').trim();
    var low = lower(text);
    if (low.indexOf('sell patents') >= 0 || low.indexOf('sell patent') >= 0) return 'Sell patents';
    if (low.indexOf('standard project') >= 0) return 'Standard project';
    if (low.indexOf('project card') >= 0 || (low.indexOf('play') >= 0 && low.indexOf('card') >= 0)) return 'Play card';
    if (low.indexOf('convert') >= 0 && low.indexOf('heat') >= 0) return 'Convert heat';
    if (low.indexOf('convert') >= 0 && low.indexOf('plant') >= 0) return 'Place greenery';
    if (low.indexOf('fund') >= 0 && low.indexOf('award') >= 0) return 'Fund award';
    if (low.indexOf('claim') >= 0 && low.indexOf('milestone') >= 0) return 'Claim milestone';
    if (low === 'pass' || low.indexOf('pass for this generation') >= 0) return 'Pass';
    return text;
  }

  function visibleCards(cards) {
    var out = [];
    var rows = asArray(cards);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].isDisabled !== true) out.push(rows[i]);
    }
    return out;
  }

  function reasonRowsFromText(text, tone) {
    var raw = compactText(text);
    if (!raw) return [];
    var pieces = raw.split(/\s+[·|]\s+/);
    var rows = [];
    for (var i = 0; i < pieces.length; i++) {
      var piece = compactText(pieces[i]);
      if (piece) rows.push({text: piece, tone: tone || 'positive'});
    }
    return rows;
  }

  function addReasonRows(target, rows) {
    rows = asArray(rows);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row) continue;
      if (typeof row === 'string') {
        target.push({text: row, tone: 'positive'});
      } else if (row.text) {
        target.push({
          text: String(row.text),
          tone: row.tone === 'negative' ? 'negative' : 'positive',
          value: typeof row.value === 'number' && isFinite(row.value) ? row.value : undefined
        });
      }
    }
  }

  function dedupeReasons(rows) {
    var seen = {};
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var text = compactText(rows[i] && rows[i].text);
      if (!text || seen[text]) continue;
      seen[text] = true;
      out.push(rows[i]);
      if (out.length >= 4) break;
    }
    return out;
  }

  function buildFromSignals(signals) {
    var rows = asArray(signals).slice();
    rows.sort(function(a, b) {
      return asNumber(b && b.priority, 0) - asNumber(a && a.priority, 0);
    });
    for (var i = 0; i < rows.length; i++) {
      var s = rows[i];
      if (!s) continue;
      if (s.severity !== 'critical' && s.severity !== 'warning') continue;
      var title = s.label || s.title || '';
      if (!title) continue;
      var reasonRows = [];
      addReasonRows(reasonRows, s.reasons || []);
      if (s.action) reasonRows.push({text: s.action, tone: 'positive'});
      return {
        id: 'signal:' + (s.id || title),
        kind: 'signal',
        title: title,
        subtitle: s.title || '',
        optionTitle: title,
        score: asNumber(s.priority, 0),
        reasonRows: dedupeReasons(reasonRows),
        alt: '',
        anchor: s.anchor || {type: 'fallback'}
      };
    }
    return null;
  }

  function buildFromAdvisor(input) {
    var advisor = input && input.advisor;
    var state = input && input.state;
    var waitingFor = input && input.waitingFor;
    if (!advisor || typeof advisor.analyzeActions !== 'function' || !isActionChoicePrompt(waitingFor)) return null;

    var ranked = advisor.analyzeActions(waitingFor, state) || [];
    if (!ranked.length) return null;

    var best = ranked[0] || {};
    var alt = ranked.length > 1 ? ranked[1] : null;
    var bestIndex = typeof best.index === 'number' ? best.index : 0;
    var opt = waitingFor.options[bestIndex] || null;
    var optTitle = optionTitle(opt) || best.action || '';
    var title = normalizeActionLabel(best.action || optTitle);
    var reasonRows = reasonRowsFromText(best.reason || '', 'positive');

    if (opt && opt.cards && opt.cards.length > 0) {
      var cards = visibleCards(opt.cards);
      var low = lower(best.action || optTitle);
      if (((low.indexOf('play') >= 0 && low.indexOf('card') >= 0) || low.indexOf('project card') >= 0) &&
          typeof advisor.rankHandCards === 'function') {
        var rankedCards = advisor.rankHandCards(cards, state) || [];
        if (rankedCards.length > 0) {
          title = 'Play ' + rankedCards[0].name;
          addReasonRows(reasonRows, reasonRowsFromText(rankedCards[0].reason || '', 'positive'));
        } else if (cards.length === 1 && cards[0].name) {
          title = 'Play ' + cards[0].name;
        }
      } else if ((low.indexOf('action') >= 0 || low.indexOf('use') >= 0) && cards.length === 1 && cards[0].name) {
        title = 'Use ' + cards[0].name;
      }
    }

    return {
      id: 'advisor:' + bestIndex + ':' + title,
      kind: 'advisor',
      title: title || normalizeActionLabel(optTitle) || 'Best action',
      subtitle: optTitle && optTitle !== title ? optTitle : '',
      optionTitle: optTitle,
      optionIndex: bestIndex,
      score: typeof best.score === 'number' ? best.score : undefined,
      reasonRows: dedupeReasons(reasonRows),
      alt: alt ? normalizeActionLabel(alt.action || optionTitle(waitingFor.options[alt.index]) || '') : '',
      anchor: {type: 'actions', key: 'current'}
    };
  }

  function buildFromStandardProjects(input) {
    var standardProjects = input && input.standardProjects;
    var state = input && input.state;
    if (!standardProjects || typeof standardProjects.computeAllSP !== 'function') return null;
    if (!input || typeof input.estimateGensLeft !== 'function' ||
        typeof input.ftnRow !== 'function' || typeof input.isGreeneryTile !== 'function' || !input.sc) {
      return null;
    }
    var result = standardProjects.computeAllSP({
      pv: state,
      gensLeft: input.estimateGensLeft(state),
      myCorp: typeof input.detectMyCorp === 'function' ? input.detectMyCorp() : '',
      ftnRow: input.ftnRow,
      isGreeneryTile: input.isGreeneryTile,
      sc: input.sc
    });
    if (!result || !result.all || !result.all.length) return null;
    var best = result.all[0];
    if (!best || asNumber(best.adj, 0) < 55) return null;
    return {
      id: 'sp:' + (best.type || best.name || ''),
      kind: 'standard-project',
      title: (best.icon ? best.icon + ' ' : '') + (best.name || 'Standard project'),
      subtitle: 'Standard project',
      optionTitle: best.name || '',
      score: best.adj,
      reasonRows: dedupeReasons(best.reasonRows || best.reasons || (best.detail ? [{text: best.detail}] : [])),
      alt: '',
      anchor: {type: 'standard', key: best.type || ''}
    };
  }

  function computeActionRecommendation(input) {
    var rawState = (input && (input.state || input.pv)) || {};
    if (!rawState || !rawState.thisPlayer || !rawState.game || !isActionPhase(rawState) || !isMyActionTurn(rawState)) return null;
    var waitingFor = (input && input.waitingFor) || getWaitingFor(rawState);
    if (!waitingFor) return null;
    var state = cloneStateWithWaitingFor(rawState, waitingFor);

    var rec = buildFromAdvisor({
      advisor: input && input.advisor,
      state: state,
      waitingFor: waitingFor
    });
    if (rec) return rec;

    rec = isActionChoicePrompt(waitingFor) ? buildFromSignals(input && input.signals) : null;
    if (rec) return rec;

    return isActionChoicePrompt(waitingFor) ? buildFromStandardProjects(Object.assign({}, input || {}, {state: state})) : null;
  }

  function queryFirst(documentObj, selectors) {
    if (!documentObj || typeof documentObj.querySelector !== 'function') return null;
    for (var i = 0; i < selectors.length; i++) {
      try {
        var found = documentObj.querySelector(selectors[i]);
        if (found) return found;
      } catch (e) {}
    }
    return null;
  }

  function findActionsAnchor(documentObj) {
    return queryFirst(documentObj, [
      '.player_home_block--actions',
      '[data-tm-game-anchor="actions"]',
      '#actions',
      '.wf-options',
      '.wf-component--select-option',
      '.wf-component'
    ]);
  }

  function isNotYourTurnAnchor(anchor) {
    var text = normalizeText(anchor && anchor.textContent);
    return text.indexOf('not your turn') >= 0 && text.indexOf('take any actions') >= 0;
  }

  function restoreTarget(node) {
    if (!node) return;
    if (node.classList && typeof node.classList.remove === 'function') node.classList.remove(TARGET_CLASS);
    if (node.style) {
      var prevOutline = node.getAttribute && node.getAttribute('data-tm-action-prev-outline');
      var prevShadow = node.getAttribute && node.getAttribute('data-tm-action-prev-box-shadow');
      node.style.outline = prevOutline || '';
      node.style.boxShadow = prevShadow || '';
    }
    if (node.removeAttribute) {
      node.removeAttribute('data-tm-action-prev-outline');
      node.removeAttribute('data-tm-action-prev-box-shadow');
    }
  }

  function clearActionRecommendation(input) {
    var documentObj = (input && input.documentObj) || (typeof document !== 'undefined' ? document : null);
    if (!documentObj || typeof documentObj.querySelectorAll !== 'function') return;
    var boxes = documentObj.querySelectorAll('.' + BOX_CLASS);
    for (var i = 0; i < boxes.length; i++) removeNode(boxes[i]);
    var targets = documentObj.querySelectorAll('.' + TARGET_CLASS);
    for (var ti = 0; ti < targets.length; ti++) restoreTarget(targets[ti]);
  }

  function nodeText(node) {
    return compactText(node && node.textContent);
  }

  function candidateOptionNodes(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    var selectors = [
      'label.form-radio',
      '.wf-action',
      '.wf-component button',
      '.card-standard-project',
      'button'
    ];
    var rows = [];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var found = root.querySelectorAll(selectors[i]);
        for (var j = 0; j < found.length; j++) {
          if (rows.indexOf(found[j]) < 0) rows.push(found[j]);
        }
      } catch (e) {}
    }
    return rows;
  }

  function scoreOptionNode(node, rec, ordinal) {
    var text = normalizeText(nodeText(node));
    if (!text) return 0;
    var optionTitle = normalizeText(rec && rec.optionTitle);
    var title = normalizeText(rec && rec.title);
    var score = 0;
    if (optionTitle && text.indexOf(optionTitle) >= 0) score += 60;
    if (title && text.indexOf(title) >= 0) score += 40;
    if (typeof rec.optionIndex === 'number' && ordinal === rec.optionIndex) score += 20;
    return score;
  }

  function highlightActionTarget(documentObj, anchor, rec) {
    var root = anchor || findActionsAnchor(documentObj);
    var candidates = candidateOptionNodes(root);
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < candidates.length; i++) {
      var score = scoreOptionNode(candidates[i], rec, i);
      if (score > bestScore) {
        best = candidates[i];
        bestScore = score;
      }
    }
    if (!best || bestScore <= 0) return null;
    if (best.classList && typeof best.classList.add === 'function') best.classList.add(TARGET_CLASS);
    if (best.style) {
      if (best.getAttribute && !best.getAttribute('data-tm-action-prev-outline')) {
        best.setAttribute('data-tm-action-prev-outline', best.style.outline || '');
        best.setAttribute('data-tm-action-prev-box-shadow', best.style.boxShadow || '');
      }
      best.style.outline = '2px solid #60d394';
      best.style.boxShadow = '0 0 0 3px rgba(96,211,148,0.24)';
    }
    return best;
  }

  function boxStyle(anchored) {
    var base = 'font-family:Ubuntu,Arial,sans-serif;background:rgba(24,30,38,0.96);'
      + 'color:#f4f7fb;border:1px solid #60d394;border-radius:6px;'
      + 'box-shadow:0 6px 20px rgba(0,0,0,0.36);z-index:2147482998;'
      + 'max-width:360px;pointer-events:auto;';
    if (anchored) return 'position:relative;margin:6px 0 10px 0;padding:7px 9px;' + base;
    return 'position:fixed;left:10px;top:118px;padding:7px 9px;' + base;
  }

  function reasonToneColor(row) {
    if (row && row.tone === 'negative') return '#ffb0a8';
    return '#bdebd0';
  }

  function createBox(documentObj, rec, anchored) {
    var box = documentObj.createElement('div');
    box.className = BOX_CLASS;
    if (box.style) box.style.cssText = boxStyle(anchored);
    box.setAttribute('data-tm-action-rec-id', rec.id || '');

    var head = documentObj.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;color:#9fdcb9;text-transform:uppercase;font-weight:700;letter-spacing:0;';
    head.textContent = 'Best action';
    if (typeof rec.score === 'number') {
      var score = documentObj.createElement('span');
      score.style.cssText = 'margin-left:auto;color:#d8ffe7;font-size:11px;';
      score.textContent = Math.round(rec.score);
      head.appendChild(score);
    }
    box.appendChild(head);

    var title = documentObj.createElement('div');
    title.style.cssText = 'font-size:15px;line-height:1.2;font-weight:800;margin-top:3px;';
    title.textContent = shortText(rec.title || 'Best action', 80);
    box.appendChild(title);

    if (rec.subtitle) {
      var subtitle = documentObj.createElement('div');
      subtitle.style.cssText = 'font-size:11px;line-height:1.25;color:#b8c2d1;margin-top:1px;';
      subtitle.textContent = shortText(rec.subtitle, 90);
      box.appendChild(subtitle);
    }

    var reasons = asArray(rec.reasonRows);
    if (reasons.length > 0) {
      var reasonBox = documentObj.createElement('div');
      reasonBox.style.cssText = 'margin-top:5px;display:flex;flex-direction:column;gap:2px;';
      for (var i = 0; i < Math.min(reasons.length, 3); i++) {
        var row = documentObj.createElement('div');
        row.style.cssText = 'font-size:11px;line-height:1.25;color:' + reasonToneColor(reasons[i]) + ';';
        row.textContent = '• ' + shortText(reasons[i].text, 92);
        reasonBox.appendChild(row);
      }
      box.appendChild(reasonBox);
    }

    if (rec.alt) {
      var alt = documentObj.createElement('div');
      alt.style.cssText = 'font-size:10px;line-height:1.2;color:#aab4c3;margin-top:5px;';
      alt.textContent = 'Alt: ' + shortText(rec.alt, 76);
      box.appendChild(alt);
    }

    return box;
  }

  function renderActionRecommendation(input) {
    var documentObj = (input && input.documentObj) || (typeof document !== 'undefined' ? document : null);
    if (!documentObj || typeof documentObj.createElement !== 'function') return [];
    clearActionRecommendation({documentObj: documentObj});
    var rec = input && input.recommendation;
    if (!rec) return [];

    var anchor = findActionsAnchor(documentObj);
    if (isNotYourTurnAnchor(anchor)) return [];
    var box = createBox(documentObj, rec, !!anchor);
    if (anchor) {
      if (anchor.style && !anchor.style.position) anchor.style.position = 'relative';
      var before = queryFirst(anchor, ['.wf-component', '.wf-options']);
      if (before && anchor.insertBefore) anchor.insertBefore(box, before);
      else anchor.appendChild(box);
    } else {
      var host = documentObj.body || documentObj.documentElement;
      if (host && typeof host.appendChild === 'function') host.appendChild(box);
    }
    var target = highlightActionTarget(documentObj, anchor, rec);
    return target ? [box, target] : [box];
  }

  global.TM_CONTENT_ACTION_RECOMMENDATION = {
    clearActionRecommendation: clearActionRecommendation,
    computeActionRecommendation: computeActionRecommendation,
    renderActionRecommendation: renderActionRecommendation,
    _private: {
      normalizeActionLabel: normalizeActionLabel,
      getWaitingFor: getWaitingFor,
      isMyActionTurn: isMyActionTurn
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
