// TM Advisor Panel — UI layer on top of TM_ADVISOR analytics.
// Reads state from vue-bridge DOM attributes, renders a collapsible panel.

/* eslint-disable */
var _TM_RATINGS_GLOBAL_AP = (typeof TM_RATINGS !== 'undefined') ? TM_RATINGS : {};

(function() {
  'use strict';

  var TM_ADVISOR = (typeof window !== 'undefined' && window.TM_ADVISOR)
    ? window.TM_ADVISOR
    : ((typeof TM_BRAIN !== 'undefined' && TM_BRAIN) ? TM_BRAIN : null);
  if (!TM_ADVISOR) return;

  // HTML escape for dynamic data in innerHTML
  var _escEl = null;
  function _esc(s) {
    if (!s) return '';
    if (!_escEl) _escEl = document.createElement('span');
    _escEl.textContent = s;
    return _escEl.innerHTML;
  }

  // Shared from data/card_variants.js
  var _baseCardName = (typeof tmBaseCardName !== 'undefined') ? tmBaseCardName : function(n) { return n; };
  var _TM_RATINGS_RAW = _TM_RATINGS_GLOBAL_AP;

  function _getRatingKeyByCardName(name) {
    if (!name) return null;
    var raw = _TM_RATINGS_RAW;
    if (!raw) return null;
    if (raw[name]) return name;
    var base = _baseCardName(name);
    return raw[base] ? base : null;
  }
  var TM_RATINGS = new Proxy(_TM_RATINGS_RAW, {
    get: function(target, prop, receiver) {
      if (typeof prop !== 'string') return Reflect.get(target, prop, receiver);
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      var key = _getRatingKeyByCardName(prop);
      return key ? target[key] : undefined;
    }
  });

  var _panel = null;
  var _collapsed = false;
  var _compact = false;
  var _enabled = true;
  var _lastUpdateHash = '';
  function apError() {}
  var _prevGenState = null; // previous generation snapshot for delta tracking
  var _genDelta = null; // { dTR, dMC, dVP, gen } shown after gen change
  var _safeStorage = (typeof TM_UTILS !== 'undefined' && TM_UTILS.safeStorage) ? TM_UTILS.safeStorage : null;
  var _lastGoodState = null;
  var _lastGoodStateTime = 0;
  var _stateGraceMs = 60000;
  var _stateWaitSince = 0;
  var _fallbackApiState = null;
  var _fallbackApiStateTime = 0;
  var _fallbackApiFetchInFlight = false;
  var _fallbackApiLastFetchAt = 0;
  var _fallbackApiCooldownMs = 2000;
  var _fallbackApiLastError = '';
  var _bridgeObserver = null;
  var _pendingFastRetry = 0;

  function hasBridgeData() {
    var targets = [
      document.getElementById('game'),
      document.getElementById('app'),
      document.querySelector('[data-v-app]'),
      document.body
    ];
    for (var i = 0; i < targets.length; i++) {
      if (!targets[i]) continue;
      if (targets[i].getAttribute('data-tm-vue-bridge')) return true;
    }
    return false;
  }

  function getBridgeTargets() {
    return [
      document.getElementById('game'),
      document.getElementById('app'),
      document.querySelector('[data-v-app]'),
      document.body
    ];
  }

  function getBridgeStatusHost() {
    var targets = getBridgeTargets();
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!t) continue;
      if (t.getAttribute('data-tm-vue-bridge') || t.getAttribute('data-tm-bridge-status')) return t;
    }
    for (var j = 0; j < targets.length; j++) {
      if (targets[j]) return targets[j];
    }
    return document.body;
  }

  function normalizePlayerPayload(data) {
    if (!data || typeof data !== 'object') return data;
    if (data.thisPlayer) return data;
    if (data.playerView && data.playerView.thisPlayer) return data.playerView;
    if (data.player && data.player.thisPlayer) return data.player;
    if (data.player && data.player.game && data.player.color && !data.player.thisPlayer) {
      data = data.player;
    }
    if (data.game && data.players && data.color && !data.thisPlayer) {
      var wrapped = {
        thisPlayer: data,
        players: data.players || [],
        game: data.game || null,
        _source: data._source || 'legacy-api'
      };
      if (data.waitingFor) wrapped.waitingFor = data.waitingFor;
      if (data.waitingFor && !wrapped._waitingFor) wrapped._waitingFor = data.waitingFor;
      return wrapped;
    }
    return data;
  }

  function shouldMountPanel() {
    var gameId = (typeof TM_UTILS !== 'undefined' && TM_UTILS.parseGameId) ? TM_UTILS.parseGameId() : null;
    if (gameId) return true;
    if (hasBridgeData()) return true;
    var path = (window.location && window.location.pathname) || '';
    return /\/(player|game|spectator|the-end)(\/|$)/i.test(path);
  }

  // ══════════════════════════════════════════════════════════════
  // PANEL CREATION
  // ══════════════════════════════════════════════════════════════

  function getPanelBodyShellHtml() {
    return '' +
      '<div id="tm-advisor-timing"></div>' +
      '<div id="tm-advisor-variance"></div>' +
      '<div id="tm-advisor-alerts"></div>' +
      '<div id="tm-advisor-actions"></div>' +
      '<div id="tm-advisor-pass"></div>' +
      '<div id="tm-advisor-pace"></div>' +
      '<div id="tm-advisor-turmoil"></div>' +
      '<div id="tm-advisor-opp-strat"></div>' +
      '<div id="tm-advisor-deck"></div>';
  }

  function ensurePanelBodyShell() {
    var bodyEl = document.getElementById('tm-advisor-body');
    if (!bodyEl) return null;
    if (!document.getElementById('tm-advisor-timing')) {
      bodyEl.innerHTML = getPanelBodyShellHtml();
    }
    return bodyEl;
  }

  function createPanel() {
    if (_panel) return _panel;

    _panel = document.createElement('div');
    _panel.className = 'tm-advisor-panel';
    _panel.id = 'tm-advisor-panel';

    _panel.innerHTML =
      '<div class="tm-advisor-header">' +
        '<span class="tm-advisor-title">\u26a1 <span id="tm-advisor-gen"></span></span>' +
        '<button class="tm-advisor-toggle" id="tm-advisor-collapse" title="Свернуть/развернуть">\u25c0</button>' +
      '</div>' +
      '<div class="tm-advisor-body" id="tm-advisor-body">' +
        getPanelBodyShellHtml() +
      '</div>';

    document.body.appendChild(_panel);

    // Collapse toggle
    document.getElementById('tm-advisor-collapse').addEventListener('click', function(e) {
      e.stopPropagation();
      _collapsed = !_collapsed;
      _panel.classList.toggle('tm-advisor-collapsed', _collapsed);
      this.textContent = _collapsed ? '\u25b6' : '\u25c0';
    });

    // Click collapsed panel to expand
    _panel.addEventListener('click', function() {
      if (_collapsed) {
        _collapsed = false;
        _panel.classList.remove('tm-advisor-collapsed');
        document.getElementById('tm-advisor-collapse').textContent = '\u25c0';
      }
    });

    // Compact mode toggle — click title text
    _panel.querySelector('.tm-advisor-title').addEventListener('click', function(e) {
      if (_collapsed) return;
      e.stopPropagation();
      _compact = !_compact;
      _panel.classList.toggle('tm-advisor-compact', _compact);
      try { localStorage.setItem('tm-advisor-compact', _compact ? '1' : '0'); } catch(ex) {}
      _lastUpdateHash = ''; // force re-render
      update();
    });

    // Restore compact mode
    try {
      _compact = localStorage.getItem('tm-advisor-compact') === '1';
      if (_compact) _panel.classList.add('tm-advisor-compact');
    } catch(e) {}

    // ── Keyboard shortcuts ──
    document.addEventListener('keydown', function(e) {
      // Ignore when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === '`' || e.key === '\u0451') { // backtick or ё (same key, Russian layout)
        e.preventDefault();
        _collapsed = !_collapsed;
        _panel.classList.toggle('tm-advisor-collapsed', _collapsed);
        document.getElementById('tm-advisor-collapse').textContent = _collapsed ? '\u25b6' : '\u25c0';
      } else if ((e.key === 'c' || e.key === '\u0441') && !e.ctrlKey && !e.altKey) { // c or с (Russian)
        if (_collapsed) return;
        e.preventDefault();
        _compact = !_compact;
        _panel.classList.toggle('tm-advisor-compact', _compact);
        try { localStorage.setItem('tm-advisor-compact', _compact ? '1' : '0'); } catch(ex) {}
        _lastUpdateHash = '';
        update();
      } else if ((e.key === 'a' || e.key === '\u0444') && !e.ctrlKey && !e.altKey) { // a or ф (Russian)
        if (_collapsed) return;
        // Toggle alerts visibility
        var alertsEl = document.getElementById('tm-advisor-alerts');
        if (alertsEl) {
          var hidden = alertsEl.style.display === 'none';
          alertsEl.style.display = hidden ? '' : 'none';
        }
      }
    });

    // ── Drag to reposition ──
    initDrag(_panel);

    // Restore saved position
    try {
      var saved = localStorage.getItem('tm-advisor-pos');
      if (saved) {
        var pos = JSON.parse(saved);
        var panelWidth = 310;
        var panelHeight = Math.min(Math.round(window.innerHeight * 0.7), 700);
        var maxLeft = Math.max(0, window.innerWidth - panelWidth - 8);
        var maxTop = Math.max(0, window.innerHeight - panelHeight - 8);
        var left = Math.min(Math.max(0, parseInt(pos.left, 10) || 0), maxLeft);
        var top = Math.min(Math.max(0, parseInt(pos.top, 10) || 0), maxTop);
        _panel.style.top = top + 'px';
        _panel.style.right = 'auto';
        _panel.style.left = left + 'px';
        _panel.style.transform = 'none';
      }
    } catch(e) {}

    return _panel;
  }

  function initDrag(panel) {
    var header = panel.querySelector('.tm-advisor-header');
    var isDragging = false;
    var startX, startY, startLeft, startTop;

    // Double-click to reset position
    header.addEventListener('dblclick', function(e) {
      if (e.target.tagName === 'BUTTON') return;
      panel.style.top = '50%';
      panel.style.right = '8px';
      panel.style.left = '';
      panel.style.transform = 'translateY(-50%)';
      try { localStorage.removeItem('tm-advisor-pos'); } catch(e) {}
    });

    header.addEventListener('mousedown', function(e) {
      if (e.target.tagName === 'BUTTON') return; // don't drag on collapse button
      e.preventDefault();
      isDragging = true;
      panel.classList.add('tm-advisor-dragging');

      var rect = panel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      startX = e.clientX;
      startY = e.clientY;

      // Switch from right-based to left-based positioning for drag
      panel.style.right = 'auto';
      panel.style.left = startLeft + 'px';
      panel.style.top = startTop + 'px';
      panel.style.transform = 'none';
    });

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      panel.style.left = (startLeft + dx) + 'px';
      panel.style.top = (startTop + dy) + 'px';
    });

    document.addEventListener('mouseup', function() {
      if (!isDragging) return;
      isDragging = false;
      panel.classList.remove('tm-advisor-dragging');
      // Save position
      try {
        localStorage.setItem('tm-advisor-pos', JSON.stringify({
          left: parseInt(panel.style.left) || 0,
          top: parseInt(panel.style.top) || 0
        }));
      } catch(e) {}
    });
  }

  // ══════════════════════════════════════════════════════════════
  // STATE READING (from vue-bridge DOM attributes)
  // ══════════════════════════════════════════════════════════════

  function readState() {
    var targets = getBridgeTargets();
    var target = null;
    var raw = null;
    for (var ti = 0; ti < targets.length; ti++) {
      if (!targets[ti]) continue;
      raw = targets[ti].getAttribute('data-tm-vue-bridge');
      if (raw) {
        target = targets[ti];
        break;
      }
    }
    if (!raw) {
      requestApiStateFallback();
      if (_fallbackApiState && Date.now() - _fallbackApiStateTime < _stateGraceMs) return _fallbackApiState;
      if (_lastGoodState && Date.now() - _lastGoodStateTime < _stateGraceMs) return _lastGoodState;
      return null;
    }
    try {
      var state = normalizePlayerPayload(JSON.parse(raw));
      if (state._timestamp && Date.now() - state._timestamp > 15000) {
        requestApiStateFallback();
        if (_fallbackApiState && Date.now() - _fallbackApiStateTime < _stateGraceMs) return _fallbackApiState;
        if (_lastGoodState && Date.now() - _lastGoodStateTime < _stateGraceMs) return _lastGoodState;
        return null;
      }
      // Read waitingFor from separate attribute
      var wfRaw = target.getAttribute('data-tm-vue-wf');
      if (wfRaw) {
        try { state._waitingFor = JSON.parse(wfRaw); } catch(e2) {}
      }
      _lastGoodState = state;
      _lastGoodStateTime = Date.now();
      return state;
    } catch(e) {
      requestApiStateFallback();
      if (_fallbackApiState && Date.now() - _fallbackApiStateTime < _stateGraceMs) return _fallbackApiState;
      if (_lastGoodState && Date.now() - _lastGoodStateTime < _stateGraceMs) return _lastGoodState;
      return null;
    }
  }

  function requestApiStateFallback() {
    if (_fallbackApiFetchInFlight) return;
    if (Date.now() - _fallbackApiLastFetchAt < _fallbackApiCooldownMs) return;
    if (typeof fetch === 'undefined') return;
    if (typeof TM_UTILS === 'undefined' || !TM_UTILS.parseGameId) return;

    var gameId = TM_UTILS.parseGameId();
    if (!gameId) return;

    var endpoint = gameId.charAt(0).toLowerCase() === 'p'
      ? '/api/player?id=' + encodeURIComponent(gameId)
      : '/api/spectator?id=' + encodeURIComponent(gameId);
    var endpointUrl = endpoint;
    try {
      endpointUrl = new URL(endpoint, window.location.origin).toString();
    } catch (e0) {}

    _fallbackApiFetchInFlight = true;
    _fallbackApiLastFetchAt = Date.now();

    fetch(endpointUrl, { credentials: 'same-origin' })
      .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function(data) {
        data = normalizePlayerPayload(data);
        if (!data || (!data.thisPlayer && !data.players && !data.game)) return;
        var stamped = Object.assign({}, data);
        stamped._timestamp = Date.now();
        if (stamped.waitingFor && !stamped._waitingFor) stamped._waitingFor = stamped.waitingFor;
        _fallbackApiState = stamped;
        _fallbackApiStateTime = Date.now();
        _fallbackApiLastError = '';
        _lastGoodState = stamped;
        _lastGoodStateTime = Date.now();
        try {
          var targets = getBridgeTargets();
          var seen = [];
          for (var ti = 0; ti < targets.length; ti++) {
            var target = targets[ti];
            if (!target || seen.indexOf(target) >= 0) continue;
            seen.push(target);
            target.setAttribute('data-tm-vue-bridge', JSON.stringify(stamped));
            if (stamped._waitingFor) {
              target.setAttribute('data-tm-vue-wf', JSON.stringify(stamped._waitingFor));
            }
            target.setAttribute('data-tm-bridge-status', 'ok:api-fallback:' + new Date().toLocaleTimeString());
          }
        } catch (e) {}
        setTimeout(update, 0);
      })
      .catch(function(e) {
        _fallbackApiLastError = e && e.message ? e.message : String(e);
        setTimeout(update, 0);
      })
      .then(function() {
        _fallbackApiFetchInFlight = false;
      });
  }

  function scheduleFastRetry(delayMs) {
    if (_pendingFastRetry) return;
    _pendingFastRetry = setTimeout(function() {
      _pendingFastRetry = 0;
      update();
    }, delayMs || 800);
  }

  function bindBridgeObserver() {
    if (_bridgeObserver || typeof MutationObserver === 'undefined') return;
    _bridgeObserver = new MutationObserver(function(mutations) {
      var shouldRefresh = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'attributes') {
          if (m.attributeName === 'data-tm-vue-bridge' || m.attributeName === 'data-tm-vue-wf' || m.attributeName === 'data-tm-bridge-status') {
            shouldRefresh = true;
            break;
          }
        } else if (m.type === 'childList' && (m.addedNodes && m.addedNodes.length)) {
          shouldRefresh = true;
        }
      }
      if (shouldRefresh) setTimeout(update, 0);
    });

    var targets = getBridgeTargets();
    for (var i = 0; i < targets.length; i++) {
      if (!targets[i]) continue;
      _bridgeObserver.observe(targets[i], {
        attributes: true,
        attributeFilter: ['data-tm-vue-bridge', 'data-tm-vue-wf', 'data-tm-bridge-status'],
        childList: true,
        subtree: i === targets.length - 1
      });
    }
  }


  // ══════════════════════════════════════════════════════════════
  // VP CALCULATOR — reconstruct VP from visible data
  // ══════════════════════════════════════════════════════════════

  function calcPlayerVP(player, state) {
    if (!player) return null;
    var vp = { tr: 0, greenery: 0, city: 0, cards: 0, milestones: 0, awards: 0, total: 0 };

    // 1. TR
    vp.tr = player.terraformRating || 0;

    // 2. Greenery + City adjacency from board
    var tiles = state.game && state.game.playerTiles && state.game.playerTiles[player.color];
    if (tiles) {
      vp.greenery = tiles.greeneries || 0;
      // City adjacency: we don't have exact adjacency data, estimate ~1.5 per city
      vp.city = Math.round((tiles.cities || 0) * 1.5);
    }
    // If board spaces available, calculate exact city adjacency
    if (state.game && state.game.spaces) {
      var exactCityVP = 0;
      var exactGreenery = 0;
      for (var si = 0; si < state.game.spaces.length; si++) {
        var sp = state.game.spaces[si];
        if (!sp.color || sp.color !== player.color) continue;
        var tt = sp.tileType;
        // Greenery
        if (tt === 'greenery' || tt === 1) exactGreenery++;
        // City adjacency
        if (tt === 'city' || tt === 0 || tt === 'capital' || tt === 5) {
          // Count adjacent greeneries (any player's)
          if (sp.adjacentSpaces) {
            for (var ai = 0; ai < sp.adjacentSpaces.length; ai++) {
              var adj = sp.adjacentSpaces[ai];
              if (adj && (adj.tileType === 'greenery' || adj.tileType === 1)) exactCityVP++;
            }
          }
        }
      }
      if (exactGreenery > 0) vp.greenery = exactGreenery;
      if (exactCityVP > 0) vp.city = exactCityVP;
    }

    // 3. Card VP from tableau
    if (player.tableau && typeof TM_CARD_VP !== 'undefined') {
      var cardVP = 0;
      var tagMap = {};
      if (player.tags) {
        if (Array.isArray(player.tags)) {
          for (var ti = 0; ti < player.tags.length; ti++) tagMap[player.tags[ti].tag] = player.tags[ti].count;
        } else {
          tagMap = player.tags;
        }
      }
      for (var ci = 0; ci < player.tableau.length; ci++) {
        var card = player.tableau[ci];
        var name = card.name || card;
        var vpDef = TM_CARD_VP[name];
        if (!vpDef) continue;
        if (vpDef.type === 'static') {
          cardVP += vpDef.vp || 0;
        } else if (vpDef.type === 'per_resource') {
          var res = card.resources || 0;
          var per = vpDef.per || 1;
          cardVP += Math.floor(res / per);
        } else if (vpDef.type === 'per_tag') {
          var tagCount = tagMap[vpDef.tag] || 0;
          var perTag = vpDef.per || 1;
          cardVP += Math.floor(tagCount / perTag);
        }
      }
      vp.cards = cardVP;
    }

    // 4. Milestones — 5 VP each
    var claimed = (state.game && state.game.claimedMilestones) || [];
    for (var mi = 0; mi < claimed.length; mi++) {
      if (claimed[mi].playerColor === player.color) vp.milestones += 5;
    }

    // 5. Awards — use evaluateAward if available, else estimate
    var funded = (state.game && state.game.fundedAwards) || [];
    if (funded.length > 0 && TM_ADVISOR.evaluateAward) {
      // Temporarily swap thisPlayer to evaluate awards for this player
      var origTp = state.thisPlayer;
      state.thisPlayer = player;
      for (var awi = 0; awi < funded.length; awi++) {
        var awEv = TM_ADVISOR.evaluateAward(funded[awi].name, state);
        if (awEv) {
          if (awEv.winning) vp.awards += 5;
          else if (awEv.tied) vp.awards += 3;
          else if (awEv.margin >= -2) vp.awards += 2;
        }
      }
      state.thisPlayer = origTp;
    }

    vp.total = vp.tr + vp.greenery + vp.city + vp.cards + vp.milestones + vp.awards;
    return vp;
  }

  // ══════════════════════════════════════════════════════════════
  // RENDERING
  // ══════════════════════════════════════════════════════════════

  function renderTiming(state) {
    var el = document.getElementById("tm-advisor-timing");
    if (!el) return;
    var timing = TM_ADVISOR.endgameTiming(state);
    var displayEstimatedGens = timing.estimatedGens <= 1 ? 0 : timing.estimatedGens;
    var dzIcon = timing.dangerZone === "red" ? "🔴" : (timing.dangerZone === "yellow" ? "🟡" : "🟢");
    // M/A alerts
    var maAlert = '';
    if (state && state.game && state.thisPlayer) {
      var tp = state.thisPlayer;
      var mc = tp.megaCredits || 0;
      var _maData = (typeof TM_MA_DATA !== 'undefined') ? TM_MA_DATA : {};

      // ── Compact M/A progress tracker ──
      var _trackerParts = [];
      var _msParts = [];
      var _awParts = [];
      if (state.game.milestones) {
        state.game.milestones.forEach(function(ms) {
          if (ms.playerName || ms.playerColor || ms.owner_name || ms.owner_color) return; // claimed
          if (!ms.scores || ms.scores.length === 0) return;
          var maDef = _maData[ms.name];
          var thr = (ms.threshold > 0) ? ms.threshold : (maDef && maDef.target > 0 ? maDef.target : 0);
          if (thr <= 0) return;
          var myS = 0;
          for (var i = 0; i < ms.scores.length; i++) {
            if ((ms.scores[i].playerColor || ms.scores[i].color) === tp.color) { myS = ms.scores[i].score || 0; break; }
          }
          if (myS <= 0 || myS < thr * 0.5) return; // skip if < 50% progress
          if (myS >= thr) {
            _msParts.push('<span style="color:#2ecc71;font-weight:bold">' + _esc(ms.name) + ' ' + myS + '/' + thr + '\u2713</span>');
          } else {
            _msParts.push(_esc(ms.name) + ' ' + myS + '/' + thr);
          }
        });
      }
      if (state.game.awards) {
        state.game.awards.forEach(function(aw) {
          if (!(aw.funder_name || aw.funder_color || aw.playerName)) return; // only funded
          if (!aw.scores || aw.scores.length === 0) return;
          var myS = 0, bestOpp = 0;
          var ranked = [];
          for (var i = 0; i < aw.scores.length; i++) {
            var s = aw.scores[i];
            var sc = s.score || 0;
            var isMe = (s.playerColor || s.color) === tp.color;
            ranked.push({ score: sc, isMe: isMe });
            if (isMe) myS = sc;
            else if (sc > bestOpp) bestOpp = sc;
          }
          ranked.sort(function(a, b) { return b.score - a.score; });
          var rank = 0;
          for (var j = 0; j < ranked.length; j++) { if (ranked[j].isMe) { rank = j + 1; break; } }
          var rankStr = '#' + rank;
          var col = rank === 1 ? '#2ecc71' : rank === 2 ? '#f1c40f' : '#e74c3c';
          var detail = myS + (bestOpp > myS ? 'vs' + bestOpp : '');
          _awParts.push('<span style="color:' + col + '">' + _esc(aw.name) + ' ' + rankStr + '(' + detail + ')</span>');
        });
      }
      if (_msParts.length > 0) _trackerParts.push('MS: ' + _msParts.join(' | '));
      if (_awParts.length > 0) _trackerParts.push('AW: ' + _awParts.join(' | '));
      if (_trackerParts.length > 0) {
        maAlert += '<div style="font-size:10px;opacity:0.85;line-height:1.3;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _trackerParts.join(' \u2502 ') + '</div>';
      }

      // Milestone alerts: claimable + opponent proximity
      if (state.game.milestones) {
        var msClaimed = 0;
        state.game.milestones.forEach(function(ms) { if (ms.playerName || ms.playerColor || ms.owner_name || ms.owner_color) msClaimed++; });
        if (msClaimed < 3) {
          state.game.milestones.forEach(function(ms) {
            if (ms.playerName || ms.playerColor || ms.owner_name || ms.owner_color) return;
            if (!ms.scores || ms.scores.length === 0) return;
            var maDef = _maData[ms.name];
            var thr = (ms.threshold > 0) ? ms.threshold : (maDef && maDef.target > 0 ? maDef.target : 0);
            if (thr <= 0) return;
            // My progress
            var myMsS = 0;
            for (var _mi = 0; _mi < ms.scores.length; _mi++) {
              if ((ms.scores[_mi].playerColor || ms.scores[_mi].color) === tp.color) { myMsS = ms.scores[_mi].score || 0; break; }
            }
            if (myMsS >= thr && mc >= 8) {
              maAlert += '<div style="color:#2ecc71;font-size:11px">\ud83c\udfc6 ' + ms.name + ' \u2014 \u0432\u043e\u0437\u044c\u043c\u0438! (' + myMsS + '/' + thr + ', 8 MC)</div>';
            } else if (myMsS === thr - 1) {
              maAlert += '<div style="color:#f39c12;font-size:10px">\ud83c\udfaf ' + ms.name + ': 1 \u0434\u043e (' + myMsS + '/' + thr + ')</div>';
            }
            // Opponent proximity
            for (var _mi2 = 0; _mi2 < ms.scores.length; _mi2++) {
              var _osc = ms.scores[_mi2];
              var _oc = _osc.playerColor || _osc.color;
              if (_oc === tp.color) continue;
              var _os = _osc.score || 0;
              var _on = _osc.playerName || _osc.name || _oc;
              if (_os >= thr) {
                maAlert += '<div style="color:#e74c3c;font-size:10px">\u26a0 ' + _esc(_on) + ' \u043c\u043e\u0436\u0435\u0442 \u0432\u0437\u044f\u0442\u044c ' + ms.name + '! (' + _os + '/' + thr + ')</div>';
              } else if (_os === thr - 1) {
                maAlert += '<div style="color:#e67e22;font-size:10px">\u26a0 ' + _esc(_on) + ' \u0432 1 \u043e\u0442 ' + ms.name + ' (' + _os + '/' + thr + ')</div>';
              }
            }
          });
        }
      }
      // Award alerts: funded standings + funding recommendations
      if (state.game.awards) {
        var awFunded = 0;
        state.game.awards.forEach(function(aw) { if (aw.funder_name || aw.funder_color || aw.playerName) awFunded++; });
        // Show funded award standings
        state.game.awards.forEach(function(aw) {
          if (!(aw.funder_name || aw.funder_color || aw.playerName)) return;
          if (!aw.scores || aw.scores.length === 0) return;
          var myAwS = 0, bOppAw = 0, bOppNm = '';
          for (var _ai = 0; _ai < aw.scores.length; _ai++) {
            var _as = aw.scores[_ai];
            if ((_as.playerColor || _as.color) === tp.color) myAwS = _as.score || 0;
            else if ((_as.score || 0) > bOppAw) { bOppAw = _as.score || 0; bOppNm = _as.playerName || _as.name || _as.playerColor || _as.color; }
          }
          if (myAwS > 0 || bOppAw > 0) {
            var awLd = myAwS - bOppAw;
            var awCol = awLd > 0 ? '#2ecc71' : awLd === 0 ? '#f1c40f' : '#e74c3c';
            var awSt = awLd > 0 ? '\u043b\u0438\u0434\u0435\u0440' : awLd === 0 ? '\u0440\u0430\u0432\u043d\u044b' : '\u2212' + Math.abs(awLd);
            maAlert += '<div style="color:' + awCol + ';font-size:10px">\ud83c\udfaf ' + aw.name + ': ' + myAwS + ' vs ' + bOppAw + ' (' + awSt + ')</div>';
          }
        });
        // Unfunded award funding recommendations
        if (awFunded < 3) {
          var awCosts = [8, 14, 20];
          var awCost = awCosts[Math.min(awFunded, 2)];
          if (mc >= awCost) {
            state.game.awards.forEach(function(aw) {
              if (aw.funder_name || aw.funder_color || aw.playerName) return;
              if (!aw.scores || aw.scores.length === 0) return;
              var myAwS2 = 0, bOppS2 = 0;
              for (var _ai2 = 0; _ai2 < aw.scores.length; _ai2++) {
                var _as2 = aw.scores[_ai2];
                if ((_as2.playerColor || _as2.color) === tp.color) myAwS2 = _as2.score || 0;
                else bOppS2 = Math.max(bOppS2, _as2.score || 0);
              }
              var lead2 = myAwS2 - bOppS2;
              if (lead2 > 0 && myAwS2 > 0) {
                maAlert += '<div style="color:#f1c40f;font-size:11px">\ud83c\udfc6 ' + aw.name + ' (' + awCost + ' MC, +' + lead2 + ' \u043b\u0438\u0434)</div>';
              }
            });
          }
        }
      }

      // VP scoreboard (compact)
      var players = (state.game && state.game.players) || [];
      if (players.length > 1) {
        var scores = [];
        for (var _pi = 0; _pi < players.length; _pi++) {
          var _p = players[_pi];
          var _pvp = _p.victoryPointsBreakdown ? _p.victoryPointsBreakdown.total : (_p.terraformRating || 0);
          var _isMe = _p.color === tp.color;
          scores.push({ name: _p.name || _p.color, vp: _pvp, isMe: _isMe });
        }
        scores.sort(function(a,b) { return b.vp - a.vp; });
        var sbParts = scores.map(function(s) {
          var c = s.isMe ? '#f1c40f' : '#888';
          return '<span style="color:' + c + '">' + _esc((s.name || '?').substring(0,6)) + ':' + s.vp + '</span>';
        });
        var myRank = scores.findIndex(function(s) { return s.isMe; }) + 1;
        var rankIcon = myRank === 1 ? '\ud83e\udd47' : myRank === 2 ? '\ud83e\udd48' : '\ud83e\udd49';
        maAlert += '<div style="font-size:10px;opacity:0.7">' + rankIcon + ' ' + sbParts.join(' ') + '</div>';

        // VP projection
        var gl = timing.estimatedGens;
        if (gl >= 1 && players.length > 1) {
          var projections = [];
          var myProj = 0;
          for (var _vpi = 0; _vpi < players.length; _vpi++) {
            var _vpp = players[_vpi];
            var _isMe2 = _vpp.color === tp.color;
            var _curVP = _vpp.victoryPointsBreakdown ? _vpp.victoryPointsBreakdown.total : (_vpp.terraformRating || 0);
            var _proj = _curVP;

            // Greenery VP: current plants + plant production over remaining gens
            var _pp = _vpp.plants || 0;
            var _pprod = _vpp.plantProduction || 0;
            var _totalPlants = _pp + _pprod * gl;
            var _futureGreeneries = Math.floor(_totalPlants / 8);
            _proj += _futureGreeneries; // 1 VP per greenery
            // Greenery also raises oxygen → TR (if not maxed)
            var _oxyMaxed2 = state.game && state.game.oxygenLevel >= 14;
            if (!_oxyMaxed2) _proj += _futureGreeneries; // +1 TR per greenery

            // Heat → temperature TR (if not maxed)
            var _tempMaxed2 = state.game && state.game.temperature >= 8;
            if (!_tempMaxed2) {
              var _h = _vpp.heat || 0;
              var _hprod = _vpp.heatProduction || 0;
              var _eprod = _vpp.energyProduction || 0; // energy → heat each gen
              var _totalHeat = _h + (_hprod + _eprod) * gl;
              var _tempStepsLeft = Math.max(0, Math.round((8 - (state.game.temperature || -30)) / 2));
              _proj += Math.min(Math.floor(_totalHeat / 8), _tempStepsLeft);
            }

            // VP accumulators: cards with per_resource VP and action that adds resources
            if (_vpp.tableau && typeof TM_CARD_EFFECTS !== 'undefined' && typeof TM_CARD_VP !== 'undefined') {
              for (var _tci = 0; _tci < _vpp.tableau.length; _tci++) {
                var _tc = _vpp.tableau[_tci];
                var _tcn = _tc.name || _tc;
                var _fx = TM_CARD_EFFECTS[_tcn];
                if (_fx && _fx.vpAcc) {
                  var _vpPer = _fx.vpPer || 1;
                  _proj += Math.floor((_fx.vpAcc * gl) / _vpPer);
                }
              }
            }

            // Card play estimate: ~0.6 VP per card in hand played
            var _handSize = _isMe2 ? (_vpp.cardsInHandNbr || 0) : (_vpp.cardsInHandNbr || 0);
            _proj += Math.round(_handSize * 0.6);

            if (_isMe2) myProj = _proj;
            projections.push({ name: _vpp.name || _vpp.color, proj: _proj, cur: _curVP, isMe: _isMe2 });
          }

          projections.sort(function(a, b) { return b.proj - a.proj; });
          var bestOppProj = 0;
          for (var _pri = 0; _pri < projections.length; _pri++) {
            if (!projections[_pri].isMe && projections[_pri].proj > bestOppProj) bestOppProj = projections[_pri].proj;
          }
          var vpProjColor = myProj >= bestOppProj ? '#2ecc71' : '#e74c3c';
          var vpProjParts = projections.map(function(pr) {
            var c2 = pr.isMe ? vpProjColor : '#888';
            return '<span style="color:' + c2 + '">' + _esc((pr.name || '?').substring(0, 6)) + ':' + pr.cur + '\u2192~' + pr.proj + '</span>';
          });
          maAlert += '<div style="font-size:10px;opacity:0.8">\ud83d\udcc8 ' + vpProjParts.join(' ') + '</div>';
        }
      }



      // Resource conversion reminders
      var _heat = tp.heat || 0;
      var _plants = tp.plants || 0;
      var _energy = tp.energy || 0;
      var _tempMaxed = state.game && state.game.temperature >= 8;
      var _oxyMaxed = state.game && state.game.oxygenLevel >= 14;
      // Detect current player's corporation from tableau
      var _myCorp = '';
      if (tp.tableau) {
        for (var _cdi = 0; _cdi < tp.tableau.length; _cdi++) {
          var _cn = tp.tableau[_cdi].name || '';
          if (typeof TM_RATINGS !== 'undefined' && TM_RATINGS[_cn] && TM_RATINGS[_cn].t === 'corp') {
            _myCorp = _cn; break;
          }
        }
      }
      var _isHelion = _myCorp.indexOf('Helion') !== -1;
      var _isEcoline = _myCorp.indexOf('Ecoline') !== -1;
      var _isManutech = _myCorp.indexOf('Manutech') !== -1;
      var _plantCost = _isEcoline ? 7 : 8;

      if (_heat >= 8 && !_tempMaxed) {
        maAlert += '<div style="font-size:10px;color:#ff9800">\ud83d\udd25 ' + _heat + ' heat \u2192 ' + Math.floor(_heat / 8) + ' TR</div>';
      }
      if (_plants >= _plantCost) {
        maAlert += '<div style="font-size:10px;color:#4caf50">\ud83c\udf3f ' + _plants + ' plants \u2192 greenery' + (_oxyMaxed ? '' : ' +TR') + (_isEcoline ? ' (Ecoline: 7)' : '') + '</div>';
      }
      if (_isHelion && _heat >= 1 && _heat < 8) {
        maAlert += '<div style="font-size:10px;color:#ff9800">\ud83d\udcb0 ' + _heat + ' heat \u043a\u0430\u043a MC (Helion)</div>';
      }
      if (_energy >= 6) {
        // Check if player has energy-consuming cards in tableau
        var _hasEnergyConsumer = false;
        if (tp.tableau && typeof TM_CARD_EFFECTS !== 'undefined') {
          for (var _eci = 0; _eci < tp.tableau.length; _eci++) {
            var _ecn = tp.tableau[_eci].name || '';
            var _ecfx = TM_CARD_EFFECTS[_ecn];
            if (_ecfx && _ecfx.usesEnergy) { _hasEnergyConsumer = true; break; }
          }
        }
        if (!_hasEnergyConsumer) {
          maAlert += '<div style="font-size:10px;color:#ffeb3b">\u26a1 ' + _energy + ' energy \u2192 heat \u0432 \u0441\u043b\u0435\u0434. \u0433\u0435\u043d</div>';
        }
      }

      // Trade fleet reminder
      var _fleets = tp.fleetSize || 0;
      var _tradesUsed = tp.tradesThisGeneration || 0;
      var _tradesLeft = _fleets - _tradesUsed;
      if (_tradesLeft > 0 && state.game && state.game.colonies && state.game.colonies.length > 0) {
        // Find best colony to trade
        var _bestCol = '', _bestVal = 0;
        if (typeof TM_BRAIN !== 'undefined' && TM_BRAIN.scoreColonyTrade) {
          for (var _ci = 0; _ci < state.game.colonies.length; _ci++) {
            var _col = state.game.colonies[_ci];
            if (_col.visitor) continue;
            var _val = TM_BRAIN.scoreColonyTrade(_col, state);
            if (_val > _bestVal) { _bestVal = Math.round(_val); _bestCol = _col.name; }
          }
        }
        maAlert += '<div style="font-size:10px;color:#9b59b6">\ud83d\ude80 ' + _tradesLeft + ' trade' + (_bestCol ? ' \u2192 ' + _bestCol + ' ~' + _bestVal + ' MC' : '') + '</div>';
      }
    }
    var gen = (state.game && state.game.generation) || '?';
    var handCount = '';
    if (state && state.thisPlayer) {
      var _hc = state.thisPlayer.cardsInHandNbr || 0;
      var _tab = (state.thisPlayer.tableau || []).length;
      var countParts = [];
      if (_hc > 0) countParts.push(_hc + '\ud83c\udcb3');
      if (_tab > 0) countParts.push(_tab + '\ud83c\udccf');
      if (countParts.length > 0) handCount = ' | ' + countParts.join(' ');
    }
    var budgetLine = '';
    if (state && state.thisPlayer) {
      var _tp = state.thisPlayer;
      var _mc = _tp.megaCredits || 0;
      var _ti = _tp.titanium || 0;
      var _tiVal = _tp.titaniumValue || 3;
      var _st = _tp.steel || 0;
      var _stVal = _tp.steelValue || 2;
      var budget = _mc + _ti * _tiVal + _st * _stVal;
      var parts = [_mc + ' MC'];
      if (_ti > 0) parts.push(_ti + ' Ti');
      if (_st > 0) parts.push(_st + ' St');
      var tr = _tp.terraformRating || 0;
      var mcProd = _tp.megaCreditProduction || _tp.megaCreditsProduction || 0;
      var income = tr + mcProd;
      var isLastGen = timing.estimatedGens <= 1;
      if (isLastGen) {
        budgetLine = '<div style="font-size:11px;color:#e74c3c;font-weight:bold">\u203c \u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0433\u0435\u043d! \ud83d\udcb0 ' + budget + ' MC | TR ' + tr + '</div>';
      } else {
        budgetLine = '<div style="font-size:10px;opacity:0.6">\ud83d\udcb0 ' + parts.join('+') + ' = ' + budget + ' | TR ' + tr + ' | +' + income + '/gen</div>';
      }
    }
    // ── Income summary (effective MC/gen) ──
    var incomeLine = '';
    if (state && state.thisPlayer && !isLastGen) {
      var _tpI = state.thisPlayer;
      var _trI = _tpI.terraformRating || 0;
      var _mcProdI = _tpI.megaCreditProduction || _tpI.megaCreditsProduction || 0;
      var _stProdI = _tpI.steelProduction || 0;
      var _tiProdI = _tpI.titaniumProduction || 0;
      var _eProdI = _tpI.energyProduction || 0;
      var _hProdI = _tpI.heatProduction || 0;
      var _plProdI = _tpI.plantProduction || 0;
      var _stValI = _tpI.steelValue || 2;
      var _tiValI = _tpI.titaniumValue || 3;

      // Effective income = TR + MC-prod + resource prod weighted
      var _myEffIncome = _trI + _mcProdI
        + _stProdI * _stValI
        + _tiProdI * _tiValI
        + _eProdI * 1.5
        + _hProdI * 0.8
        + _plProdI * 1.5;
      _myEffIncome = Math.round(_myEffIncome);

      // Opponent incomes (from state.players = opponents only)
      var _oppIncomes = [];
      if (state.players && state.players.length > 0) {
        for (var _ii = 0; _ii < state.players.length; _ii++) {
          var _op = state.players[_ii];
          var _oTR = _op.terraformRating || 0;
          var _oMcP = _op.megaCreditProduction || _op.megaCreditsProduction || 0;
          var _oStP = _op.steelProduction || 0;
          var _oTiP = _op.titaniumProduction || 0;
          var _oEP = _op.energyProduction || 0;
          var _oHP = _op.heatProduction || 0;
          var _oPlP = _op.plantProduction || 0;
          var _oStV = _op.steelValue || 2;
          var _oTiV = _op.titaniumValue || 3;
          var _oEff = _oTR + _oMcP + _oStP * _oStV + _oTiP * _oTiV + _oEP * 1.5 + _oHP * 0.8 + _oPlP * 1.5;
          _oppIncomes.push(Math.round(_oEff));
        }
      }

      // Trend vs best opponent
      var _bestOpp = _oppIncomes.length > 0 ? Math.max.apply(null, _oppIncomes) : 0;
      var _trend = _myEffIncome > _bestOpp ? '\u2B06' : _myEffIncome < _bestOpp ? '\u2B07' : '\u2194';
      var _trendCol = _myEffIncome > _bestOpp ? '#2ecc71' : _myEffIncome < _bestOpp ? '#e74c3c' : '#f1c40f';

      // Available MC this gen
      var _mcNow = _tpI.megaCredits || 0;
      var _stNow = _tpI.steel || 0;
      var _tiNow = _tpI.titanium || 0;
      var _avail = _mcNow + _stNow * _stValI + _tiNow * _tiValI;

      incomeLine = '<div style="font-size:10px">' +
        '<span style="color:' + _trendCol + '">\uD83D\uDCB0 ' + _myEffIncome + ' MC/gen</span>' +
        (_oppIncomes.length > 0 ? ' vs ' + _oppIncomes.join('/') : '') +
        ' <span style="color:' + _trendCol + '">' + _trend + '</span>' +
        ' | \uD83D\uDCBC ' + _avail + ' MC avail' +
        '</div>';
    }

    // Card volume gap warning
    var cardGapLine = '';
    if (state && state.thisPlayer && state.players && state.players.length > 0) {
      var _myCards = (state.thisPlayer.tableau || []).length;
      var _maxOppCards = 0;
      var _oppCardCounts = [];
      for (var _pi = 0; _pi < state.players.length; _pi++) {
        var _oppTab = (state.players[_pi].tableau || []).length;
        _oppCardCounts.push(_oppTab);
        if (_oppTab > _maxOppCards) _maxOppCards = _oppTab;
      }
      var _cardGap = _maxOppCards - _myCards;
      if (_cardGap > 10) {
        var _estVpGap = Math.round(_cardGap * 0.65);
        cardGapLine = '<div style="font-size:10px;color:#e67e22">\u26a0 Cards: ' + _myCards + ' vs ' + _oppCardCounts.join('/') + ' (\u0394' + _cardGap + ' \u2248 ' + _estVpGap + ' VP)</div>';
      }
    }
    // Param breakdown (compact — hide in last gen)
    var paramLine = '';
    if (timing.breakdown && timing.steps > 0 && timing.estimatedGens > 1) {
      var bd = timing.breakdown;
      var pp = [];
      if (bd.tempSteps > 0) pp.push('T:' + bd.temp + '\u00b0(' + bd.tempSteps + ')');
      if (bd.oxySteps > 0) pp.push('O:' + bd.oxy + '%(' + bd.oxySteps + ')');
      if (bd.oceanSteps > 0) pp.push('Oc:' + bd.oceans + '(' + bd.oceanSteps + ')');
      if (bd.venusSteps > 0) pp.push('V:' + bd.venus + '(' + bd.venusSteps + ')');
      if (pp.length > 0) paramLine = '<div style="font-size:9px;opacity:0.4">' + pp.join(' ') + '</div>';
    }
    // ── Global parameter push recommendations ──
    var pushLine = '';
    if (timing.breakdown && timing.steps > 0 && state && state.thisPlayer) {
      var _bd = timing.breakdown;
      var _tp2 = state.thisPlayer;
      var _myHeat = _tp2.heat || 0;
      var _myHeatProd = _tp2.heatProduction || 0;
      var _myEnergyProd = _tp2.energyProduction || 0;
      var _myPlants = _tp2.plants || 0;
      var _myPlantProd = _tp2.plantProduction || 0;
      var _isEco = false;
      if (_tp2.tableau) {
        for (var _ci2 = 0; _ci2 < _tp2.tableau.length; _ci2++) {
          var _cn2 = (_tp2.tableau[_ci2].name || '');
          if (_cn2.indexOf('Ecoline') !== -1) { _isEco = true; break; }
        }
      }
      var _plCost = _isEco ? 7 : 8;
      var _raises = [];
      // Temperature: free from 8 heat, otherwise SP Asteroid = 14 MC
      if (_bd.tempSteps > 0) {
        if (_myHeat >= 8) {
          _raises.push({ icon: '\uD83C\uDF21', name: 'temp', mc: 0, label: 'free from heat!' });
        } else {
          var _heatPerGen = _myHeatProd + _myEnergyProd;
          var _gensToHeat = _heatPerGen > 0 ? Math.max(0, Math.ceil((8 - _myHeat) / _heatPerGen)) : 99;
          if (_gensToHeat <= 2 && _gensToHeat > 0) {
            var _heatDisplayGens = (isLastGen && _gensToHeat <= 1) ? 0 : _gensToHeat;
            _raises.push({ icon: '\uD83C\uDF21', name: 'temp', mc: 0, label: 'heat in ' + _heatDisplayGens + ' gen' });
          } else {
            _raises.push({ icon: '\uD83C\uDF21', name: 'temp', mc: 14, label: '14 MC' });
          }
        }
      }
      // Oxygen: free from 8 plants (greenery), otherwise SP Greenery = 23 MC
      if (_bd.oxySteps > 0) {
        if (_myPlants >= _plCost) {
          _raises.push({ icon: '\uD83C\uDF3F', name: 'oxy', mc: 0, label: 'free from plants!' });
        } else {
          var _plantsPerGen = _myPlantProd;
          var _gensToPlants = _plantsPerGen > 0 ? Math.max(0, Math.ceil((_plCost - _myPlants) / _plantsPerGen)) : 99;
          if (_gensToPlants <= 2 && _gensToPlants > 0) {
            var _plantDisplayGens = (isLastGen && _gensToPlants <= 1) ? 0 : _gensToPlants;
            _raises.push({ icon: '\uD83C\uDF3F', name: 'oxy', mc: 0, label: 'plants in ' + _plantDisplayGens + ' gen' });
          } else {
            _raises.push({ icon: '\uD83C\uDF3F', name: 'oxy', mc: 23, label: '23 MC' });
          }
        }
      }
      // Oceans: SP Aquifer = 18 MC
      if (_bd.oceanSteps > 0) {
        _raises.push({ icon: '\uD83C\uDF0A', name: 'ocean', mc: 18, label: '18 MC' });
      }
      // Venus: Air Scrapping = 15 MC (only if Venus is in play and not maxed)
      if (_bd.venusSteps > 0) {
        _raises.push({ icon: '\u2640', name: 'venus', mc: 15, label: '15 MC' });
      }
      if (_raises.length > 0) {
        // Sort by MC cost (free first)
        _raises.sort(function(a, b) { return a.mc - b.mc; });
        var _cheapest = _raises[0];
        var _pushParts = _raises.map(function(r) {
          var style = r === _cheapest ? 'color:#2ecc71;font-weight:bold' : 'opacity:0.7';
          return '<span style="' + style + '">' + r.icon + ' ' + r.label + '</span>';
        });
        var _pushAdvice = '';
        if (timing.shouldPush && timing.vpLead >= 0) {
          _pushAdvice = ' <span style="color:#2ecc71">\u2191 Push tempo!</span>';
        } else if (timing.vpLead < -5) {
          _pushAdvice = ' <span style="color:#e74c3c">\u2193 Build, don\'t push</span>';
        }
        pushLine = '<div style="font-size:10px;opacity:0.85">TR: ' + _pushParts.join(' \u2192 ') + _pushAdvice + '</div>';
      }
    }
    var secondaryTiming = incomeLine + cardGapLine + paramLine + maAlert;
    var secondaryTimingHtml = secondaryTiming
      ? '<details class="tm-advisor-more tm-advisor-timing-more"><summary>context</summary>' + secondaryTiming + '</details>'
      : '';

    el.innerHTML = '<div class="tm-advisor-timing tm-dz-' + timing.dangerZone + '">' +
      dzIcon + ' Gen ' + gen + ' | ' + timing.steps + ' \u0448\u0430\u0433\u043e\u0432, ~' + displayEstimatedGens + ' \u043f\u043e\u043a.' + handCount +
      budgetLine + pushLine + secondaryTimingHtml +
      '</div>';
  }


  // Check opponent milestone proximity (lightweight — no full evaluateMilestone for opponents)
  function MILESTONE_SCORE_FN_CHECK(msName, player, state) {
    if (!TM_ADVISOR.evaluateMilestone) return null;
    // Temporarily swap thisPlayer to evaluate milestone for opponent
    var origTp = state.thisPlayer;
    state.thisPlayer = player;
    var result = TM_ADVISOR.evaluateMilestone(msName, state);
    state.thisPlayer = origTp;
    if (!result) return null;
    return { score: result.myScore, threshold: result.threshold, dist: result.threshold - result.myScore };
  }

  function renderAlerts(state) {
    var el = document.getElementById("tm-advisor-" + "alerts");
    if (el) el.innerHTML = '';
  }

  // ── Strategy variance warnings ──
  function renderVarianceWarnings(state) {
    var el = document.getElementById('tm-advisor-variance');
    if (!el) return;
    if (!state || !state.thisPlayer) { el.innerHTML = ''; return; }
    var tp = state.thisPlayer;
    var gen = (state.game && state.game.generation) || 1;
    var tableau = tp.tableau || [];
    var warnings = [];

    // Build card name set from tableau
    var tabSet = {};
    for (var i = 0; i < tableau.length; i++) {
      var n = tableau[i].name || tableau[i];
      if (n) tabSet[n] = true;
    }

    // (a) Event-dependent engine
    var eventEngineCards = ['Media Group', 'Floyd Continuum', 'Media Archives'];
    var eventHits = 0;
    for (var ei = 0; ei < eventEngineCards.length; ei++) {
      if (tabSet[eventEngineCards[ei]]) eventHits++;
    }
    if (eventHits >= 2) warnings.push('\u26A1 Event-heavy engine \u2014 draft dependent');

    // (b) Science-gated cards in hand
    if (tp.cardsInHand && typeof TM_CARD_TAG_REQS !== 'undefined') {
      var sciGated = 0;
      for (var si = 0; si < tp.cardsInHand.length; si++) {
        var cn = tp.cardsInHand[si].name || tp.cardsInHand[si];
        var reqs = TM_CARD_TAG_REQS[cn];
        if (reqs && reqs.science && reqs.science >= 1) sciGated++;
      }
      if (sciGated >= 3) warnings.push('\uD83D\uDD2C Science-gated cards (' + sciGated + ') \u2014 need more Science tags');
    }

    // (c) Single-colony dependent — 1 colony but 2+ trade fleets
    var myColonies = tp.coloniesCount || 0;
    var myFleets = tp.fleetSize || 0;
    if (myColonies <= 1 && myFleets >= 2 && state.game && state.game.colonies && state.game.colonies.length > 0) {
      warnings.push('\uD83D\uDE80 Colony-dependent \u2014 build more colonies (' + myColonies + ' col / ' + myFleets + ' fleets)');
    }

    // (d) Low production after gen 3
    var mcProd = tp.megaCreditProduction || tp.megaCreditsProduction || 0;
    if (gen >= 3 && mcProd < 5) {
      warnings.push('\uD83D\uDCC9 Low production (MC-prod ' + mcProd + ') \u2014 consider engine cards');
    }

    // (e) VP-heavy without discount engine
    if (typeof TM_BRAIN !== 'undefined' && TM_BRAIN.DYNAMIC_VP_CARDS) {
      var vpCount = 0;
      for (var vi = 0; vi < tableau.length; vi++) {
        var vn = tableau[vi].name || tableau[vi];
        if (TM_BRAIN.DYNAMIC_VP_CARDS.has(vn)) vpCount++;
      }
      var hasEngine = false;
      var discountCards = ['Earth Catapult', 'Anti-Gravity Technology', 'Warp Drive', 'Research Outpost', 'Space Station', 'Sky Docks', 'Earth Office'];
      for (var di = 0; di < discountCards.length; di++) {
        if (tabSet[discountCards[di]]) { hasEngine = true; break; }
      }
      if (vpCount >= 5 && !hasEngine) warnings.push('\u26A0 VP cards (' + vpCount + ') without engine \u2014 expensive plays');
    }

    if (warnings.length === 0) { el.innerHTML = ''; return; }
    var maxWarnings = 2;
    var html = '<div class="tm-advisor-warnings">';
    for (var wi = 0; wi < warnings.length && wi < maxWarnings; wi++) {
      html += '<div>' + warnings[wi] + '</div>';
    }
    if (warnings.length > maxWarnings) {
      html += '<div class="tm-advisor-muted">+' + (warnings.length - maxWarnings) + ' more</div>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  // ── Opponent strategy classifier + display ──
  var _OPP_STRAT_DEFS = [
    { id: 'venus',   icon: '\u2640', label: 'Venus',        corps: ['Morning Star', 'Celestic', 'Aphrodite'], tagKey: 'venus',   tagMin: 3 },
    { id: 'plant',   icon: '\uD83C\uDF3F', label: 'Plant engine', corps: ['Ecoline'], tagKey: 'plant',   tagMin: 3, prodKey: 'plantProduction', prodMin: 3 },
    { id: 'heat',    icon: '\uD83D\uDD25', label: 'Heat/Temp',    corps: ['Helion', 'Stormcraft'], prodKey: 'heatProduction', prodMin: 5 },
    { id: 'colony',  icon: '\uD83D\uDE80', label: 'Colony',       corps: ['Poseidon', 'Aridor', 'Polyphemos'], countKey: 'coloniesCount', countMin: 3 },
    { id: 'city',    icon: '\uD83C\uDFD9', label: 'City',         corps: ['Tharsis Republic', 'Philares'], countKey: 'citiesCount', countMin: 3 },
    { id: 'science', icon: '\uD83D\uDD2C', label: 'Science',      corps: [], tagKey: 'science', tagMin: 3, cards: ['Earth Catapult', 'Anti-Gravity Technology', 'Cutting Edge Technology', 'Research Outpost'] },
    { id: 'jovian',  icon: '\uD83E\uDE90', label: 'Jovian VP',    corps: ['Saturn Systems', 'Phobolog'], tagKey: 'jovian',  tagMin: 3 },
    { id: 'animal',  icon: '\uD83D\uDC3E', label: 'Animal VP',    corps: ['Arklight'], tagKey: 'animal', tagMin: 2, cards: ['Birds', 'Fish', 'Livestock', 'Predators', 'Ecological Zone', 'Small Animals'] },
    { id: 'event',   icon: '\u26A1', label: 'Event spam',   corps: ['Interplanetary Cinematics'], tagKey: 'event',  tagMin: 5 }
  ];

  function classifyPlayerStrategy(p) {
    if (!p) return [];
    // Build tag map: {venus: 3, science: 2, ...}
    var tagMap = {};
    var tagArr = p.tags || [];
    for (var ti = 0; ti < tagArr.length; ti++) {
      var tk = (tagArr[ti].tag || '').toLowerCase();
      if (tk) tagMap[tk] = (tagMap[tk] || 0) + (tagArr[ti].count || 0);
    }
    // Find corp name from tableau (first corp-type card)
    var corpName = '';
    if (p.tableau) {
      for (var ci = 0; ci < p.tableau.length; ci++) {
        var cName = p.tableau[ci].name || '';
        if (typeof TM_RATINGS !== 'undefined' && TM_RATINGS[cName] && TM_RATINGS[cName].t === 'corp') {
          corpName = cName;
          break;
        }
      }
    }
    // Build card set for tableau
    var cardSet = {};
    if (p.tableau) {
      for (var ki = 0; ki < p.tableau.length; ki++) {
        if (p.tableau[ki].name) cardSet[p.tableau[ki].name] = true;
      }
    }
    var detected = [];
    for (var di = 0; di < _OPP_STRAT_DEFS.length; di++) {
      var def = _OPP_STRAT_DEFS[di];
      var matched = false;
      // Check corp match (substring for flexibility)
      if (corpName) {
        for (var cri = 0; cri < def.corps.length; cri++) {
          if (corpName.indexOf(def.corps[cri]) !== -1) { matched = true; break; }
        }
      }
      // Check tag threshold
      if (!matched && def.tagKey && def.tagMin > 0) {
        if ((tagMap[def.tagKey] || 0) >= def.tagMin) matched = true;
      }
      // Check production threshold
      if (!matched && def.prodKey && def.prodMin > 0) {
        if ((p[def.prodKey] || 0) >= def.prodMin) matched = true;
      }
      // Check count threshold (cities, colonies)
      if (!matched && def.countKey && def.countMin > 0) {
        if ((p[def.countKey] || 0) >= def.countMin) matched = true;
      }
      // Check specific cards in tableau (need 2+ matches)
      if (!matched && def.cards && def.cards.length > 0) {
        var cardHits = 0;
        for (var sci = 0; sci < def.cards.length; sci++) {
          if (cardSet[def.cards[sci]]) cardHits++;
        }
        if (cardHits >= 2) matched = true;
      }
      if (matched) detected.push({ id: def.id, icon: def.icon, label: def.label });
    }
    return detected;
  }

  function renderOppStrategies(state) {
    var el = document.getElementById('tm-advisor-opp-strat');
    if (!el) return;
    if (!state || !state.players || !state.thisPlayer) { el.innerHTML = ''; return; }
    var myColor = state.thisPlayer.color;
    var lines = [];
    for (var pi = 0; pi < state.players.length; pi++) {
      var p = state.players[pi];
      if (p.color === myColor) continue;
      var strats = classifyPlayerStrategy(p);
      if (!strats.length) continue;
      var pName = (p.name || p.color || '').substring(0, 8);
      var tags = [];
      for (var si = 0; si < strats.length; si++) {
        tags.push(strats[si].icon + ' ' + strats[si].label);
      }
      lines.push('<span class="tm-advisor-chip"><b>' + _esc(pName) + '</b>: ' + tags.join(' + ') + '</span>');
    }
    if (lines.length === 0) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="tm-advisor-minor-section tm-advisor-opp-strat">' +
      '<span class="tm-advisor-section-label">\uD83D\uDD0D Opp</span> ' +
      lines.join(' ') + '</div>';
  }

  function normalizeBotActionLabel(title) {
    var raw = String(title || '');
    var low = raw.toLowerCase();
    if ((low.indexOf('play') >= 0 && low.indexOf('card') >= 0) || low.indexOf('project card') >= 0) return 'Play project card';
    if (low.indexOf('action') >= 0 || low.indexOf('use') >= 0) return 'Use played-card action';
    if (low.indexOf('standard project') >= 0) return 'Standard project';
    if (low.indexOf('trade') >= 0) return 'Trade';
    if (low.indexOf('pass') >= 0 || low.indexOf('end turn') >= 0 || low.indexOf('skip') >= 0 || low.indexOf('do nothing') >= 0) return 'Pass';
    if (low.indexOf('delegate') >= 0) return 'Delegate';
    if (low.indexOf('milestone') >= 0 || low.indexOf('claim') >= 0) return 'Claim milestone';
    if (low.indexOf('award') >= 0 || low.indexOf('fund') >= 0) return 'Fund award';
    if (low.indexOf('colony') >= 0 || low.indexOf('build') >= 0) return 'Build colony';
    return raw || 'Action';
  }

  function advisorDetectMyCorp(state) {
    var tableau = state && state.thisPlayer && Array.isArray(state.thisPlayer.tableau)
      ? state.thisPlayer.tableau
      : [];
    var corpData = (typeof TM_CORPS !== 'undefined' && TM_CORPS) ? TM_CORPS : null;
    for (var i = 0; i < tableau.length; i++) {
      var card = tableau[i];
      var name = '';
      if (typeof card === 'string') name = card;
      else if (card && typeof card === 'object') name = card.name || card.card || card.cardName || card.id || '';
      name = String(name || '').trim();
      if (!name || name === 'Merger') continue;
      if (corpData && corpData[name]) return name;
    }
    var corpCard = state && state.thisPlayer ? (state.thisPlayer.corporationCard || state.thisPlayer.corpCard) : null;
    if (corpCard) {
      var corpName = typeof corpCard === 'string'
        ? corpCard
        : (corpCard.name || corpCard.card || corpCard.cardName || '');
      corpName = String(corpName || '').trim();
      if (corpName && corpName !== 'Merger') return corpName;
    }
    return '';
  }

  function advisorFtnRow(gl) {
    var table = (typeof TM_FTN_TABLE !== 'undefined' && TM_FTN_TABLE) ? TM_FTN_TABLE : null;
    var fallback = [7, 5, 5];
    if (!table || !table.length) return fallback;
    return table[gl] || table[table.length - 1] || fallback;
  }

  function advisorIsGreeneryTile(tileType) {
    return tileType === 1 || tileType === 'greenery';
  }

  function formatSignedInt(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '';
    var rounded = Math.round(value);
    return (rounded > 0 ? '+' : '') + rounded;
  }

  function standardProjectToneClass(adj) {
    if (typeof adj !== 'number' || !isFinite(adj)) return '';
    if (adj >= 70) return ' tm-advisor-sp-row--good';
    if (adj >= 55) return ' tm-advisor-sp-row--ok';
    return ' tm-advisor-sp-row--bad';
  }

  function buildStandardProjectsHint(state) {
    var spModule = (typeof TM_CONTENT_STANDARD_PROJECTS !== 'undefined' && TM_CONTENT_STANDARD_PROJECTS)
      ? TM_CONTENT_STANDARD_PROJECTS
      : null;
    var sc = (typeof TM_SCORING_CONFIG !== 'undefined' && TM_SCORING_CONFIG)
      ? TM_SCORING_CONFIG
      : null;
    if (!state || !state.thisPlayer || !state.game || !spModule || typeof spModule.computeAllSP !== 'function' || !sc) {
      return null;
    }
    var gensLeft = typeof TM_ADVISOR.estimateGensLeft === 'function' ? TM_ADVISOR.estimateGensLeft(state) : 0;
    if (typeof gensLeft !== 'number' || !isFinite(gensLeft)) gensLeft = 0;
    var result = spModule.computeAllSP({
      pv: state,
      gensLeft: gensLeft,
      myCorp: advisorDetectMyCorp(state),
      ftnRow: advisorFtnRow,
      isGreeneryTile: advisorIsGreeneryTile,
      sc: sc
    });
    if (!result || !Array.isArray(result.all) || result.all.length === 0) return null;
    return {
      gensLeft: gensLeft,
      best: result.best || null,
      items: result.all.slice(0, 3)
    };
  }

  function renderStandardProjectHint(hint) {
    if (!hint || !hint.items || hint.items.length === 0) return '';
    var best = hint.best || hint.items[0];
    var html = '<div class="tm-advisor-bot-hint tm-advisor-sp-hint">' +
      '<div class="tm-advisor-bot-title">\u2699 Standard actions' +
      (typeof hint.gensLeft === 'number' && isFinite(hint.gensLeft)
        ? ' <span class="tm-advisor-sp-gl">(GL~' + Math.round(hint.gensLeft) + ')</span>'
        : '') +
      '</div>';
    if (best) {
      html += '<div class="tm-advisor-bot-main"><b>' + _esc(best.name || '') + '</b>' +
        (typeof best.score === 'number' ? ' <span class="tm-advisor-bot-score">(' + Math.round(best.score) + ')</span>' : '') +
        (typeof best.net === 'number' ? ' <span class="tm-advisor-sp-net">' + formatSignedInt(best.net) + ' MC</span>' : '') +
        '</div>';
    }

    var detailItems = [];
    for (var i = 0; i < hint.items.length; i++) {
      var item = hint.items[i];
      if (best && item && best.name && item.name === best.name) continue;
      detailItems.push(item);
    }

    if (detailItems.length > 0) {
      html += '<details class="tm-advisor-more tm-advisor-sp-more"><summary>+' + detailItems.length + ' SP</summary>';
      html += '<div class="tm-advisor-sp-list">';
    }
    for (var di = 0; di < detailItems.length; di++) {
      var item = detailItems[di];
      var reasonRows = Array.isArray(item.reasonRows) ? item.reasonRows : [];
      var reasonJson = '';
      try { reasonJson = JSON.stringify(reasonRows); } catch (e) { reasonJson = ''; }
      html += '<div class="tm-advisor-sp-row' + standardProjectToneClass(item.adj) + '"' +
        (reasonRows.length ? ' data-tm-reason-rows="' + _esc(reasonJson) + '"' : '') +
        (item.reasons && item.reasons.length ? ' data-tm-reasons="' + _esc(item.reasons.join('|')) + '"' : '') +
        '>' +
        '<div class="tm-advisor-sp-head">' +
          '<span class="tm-advisor-sp-name">' + _esc((item.icon ? item.icon + ' ' : '') + (item.name || '')) + '</span>' +
          '<span class="tm-advisor-sp-score">' + (typeof item.adj === 'number' ? Math.round(item.adj) : '') + '</span>' +
        '</div>' +
        '<div class="tm-advisor-sp-meta">' +
          (typeof item.net === 'number' ? '<span class="tm-advisor-sp-net">' + formatSignedInt(item.net) + ' MC</span>' : '') +
          (item.detail ? '<span class="tm-advisor-sp-detail">' + _esc(item.detail) + '</span>' : '') +
        '</div>' +
      '</div>';
    }
    if (detailItems.length > 0) html += '</div></details>';
    html += '</div>';
    return html;
  }

  function buildBotActionHint(state) {
    if (!state || !state._waitingFor || !state.thisPlayer || typeof TM_ADVISOR.analyzeActions !== 'function') return null;
    var wf = state._waitingFor;
    if (wf.type !== 'or' || !wf.options || wf.options.length === 0) return null;

    var rankedActions = TM_ADVISOR.analyzeActions(wf, state) || [];
    if (!rankedActions.length) return null;

    var best = rankedActions[0];
    var alt = rankedActions.length > 1 ? rankedActions[1] : null;
    var opt = wf.options[best.index] || null;
    var title = best.action || '';
    var titleLow = String(title || '').toLowerCase();
    var detail = normalizeBotActionLabel(title);
    var reason = best.reason || '';

    if (opt && opt.cards && opt.cards.length > 0) {
      var visibleCards = opt.cards.filter(function(card) { return card && !card.isDisabled; });
      if (((titleLow.indexOf('play') >= 0 && titleLow.indexOf('card') >= 0) || titleLow.indexOf('project card') >= 0) &&
          typeof TM_ADVISOR.rankHandCards === 'function') {
        var rankedCards = TM_ADVISOR.rankHandCards(visibleCards, state) || [];
        if (rankedCards.length > 0) {
          detail = 'Play ' + rankedCards[0].name;
          if (rankedCards[0].reason) reason = reason ? (reason + ' · ' + rankedCards[0].reason) : rankedCards[0].reason;
        } else if (visibleCards.length === 1 && visibleCards[0].name) {
          detail = 'Play ' + visibleCards[0].name;
        }
      } else if ((titleLow.indexOf('action') >= 0 || titleLow.indexOf('use') >= 0) && visibleCards.length === 1 && visibleCards[0].name) {
        detail = 'Use ' + visibleCards[0].name;
      }
    }

    return {
      title: detail,
      reason: reason || 'Action',
      alt: alt ? normalizeBotActionLabel(alt.action || '') : '',
      score: best.score
    };
  }

  function renderActions(state) {
    var el = document.getElementById('tm-advisor-actions');
    if (!el) return;
    if (!state || !state.thisPlayer) { el.innerHTML = ''; return; }

    var html = '';
    var botHint = buildBotActionHint(state);
    if (botHint) {
      html += '<div class="tm-advisor-bot-hint">' +
        '<div class="tm-advisor-bot-title">\uD83E\uDD16 Bot hint</div>' +
        '<div class="tm-advisor-bot-main"><b>' + _esc(botHint.title) + '</b>' +
        (typeof botHint.score === 'number' ? ' <span class="tm-advisor-bot-score">(' + Math.round(botHint.score) + ')</span>' : '') +
        '</div>' +
        '<div class="tm-advisor-bot-reason">' + _esc(botHint.reason) + '</div>' +
        (botHint.alt ? '<div class="tm-advisor-bot-alt">Alt: ' + _esc(botHint.alt) + '</div>' : '') +
      '</div>';
    }

    var spHint = buildStandardProjectsHint(state);
    if (spHint) {
      html += renderStandardProjectHint(spHint);
    }

    // Award funding advisor
    var awards = (state.game && state.game.awards) || [];
    var myColor = state.thisPlayer ? state.thisPlayer.color : '';
    var mc = state.thisPlayer ? (state.thisPlayer.megaCredits || 0) : 0;
    if (!myColor || awards.length === 0) { el.innerHTML = html; return; }

    // Count funded awards
    var fundedCount = awards.filter(function(a) { return a.playerName || a.playerColor; }).length;
    if (fundedCount >= 3) { el.innerHTML = html; return; } // all funded

    // Cost: 8 (1st), 14 (2nd), 20 (3rd)
    var costs = [8, 14, 20];
    var fundCost = costs[Math.min(fundedCount, 2)];
    if (mc < fundCost) { el.innerHTML = html; return; } // can't afford

    // Evaluate unfunded awards
    var candidates = [];
    for (var ai = 0; ai < awards.length; ai++) {
      var aw = awards[ai];
      if (aw.playerName || aw.playerColor) continue; // already funded
      if (!aw.scores || aw.scores.length === 0) continue;

      var myScore = 0, bestOpp = 0, secondOpp = 0;
      for (var si = 0; si < aw.scores.length; si++) {
        var s = aw.scores[si];
        if (s.color === myColor) {
          myScore = s.score || 0;
        } else {
          if ((s.score || 0) > bestOpp) { secondOpp = bestOpp; bestOpp = s.score || 0; }
          else if ((s.score || 0) > secondOpp) secondOpp = s.score || 0;
        }
      }

      var lead = myScore - bestOpp;
      // VP value: 1st=5VP, 2nd=2VP. If winning: net +3 (5-2) vs opponent
      // Rough EV: leading = good, tied = ok, behind = bad
      var ev = 0;
      if (lead > 0) ev = 5; // winning → 5 VP for us
      else if (lead === 0) ev = 2; // tied → 2-3 VP likely
      else if (lead >= -2) ev = 1; // close, might catch up
      else ev = -2; // behind, opponent gets 5 VP

      candidates.push({
        name: aw.name,
        myScore: myScore,
        bestOpp: bestOpp,
        lead: lead,
        ev: ev,
      });
    }

    // Sort by EV desc
    candidates.sort(function(a, b) { return b.ev - a.ev; });

    // Show top recommendations
    var good = candidates.filter(function(c) { return c.ev >= 2; });
    if (good.length > 0) {
      html += '<div style="border-top:1px solid rgba(255,255,255,0.1);margin-top:4px;padding-top:3px">';
      html += '<div style="font-size:11px;font-weight:bold;margin-bottom:2px">\uD83C\uDFC6 Awards (' + fundCost + ' MC)</div>';
      for (var gi = 0; gi < Math.min(good.length, 3); gi++) {
        var c = good[gi];
        var leadStr = c.lead > 0 ? '+' + c.lead : '' + c.lead;
        var color = c.lead > 0 ? '#2ecc71' : c.lead === 0 ? '#f1c40f' : '#e74c3c';
        html += '<div style="font-size:12px;padding:1px 0">' +
          '<span style="color:' + color + '">\u25CF</span> ' + _esc(c.name) +
          ' <span style="color:#888">' + c.myScore + ' vs ' + c.bestOpp + '</span>' +
          ' <span style="color:' + color + '">(' + leadStr + ')</span>' +
          (c.ev >= 5 ? ' \u2605' : '') +
        '</div>';
      }
      html += '</div>';
    }
    el.innerHTML = html;
  }

  function renderCompactAlerts(state) {
    var el = document.getElementById("tm-advisor-" + "alerts");
    if (el) el.innerHTML = '';
  }

  function renderPass(state) {
    var el = document.getElementById("tm-advisor-" + "pass");
    if (!el) return;
    // Only show when it's our turn (waitingFor exists)
    if (!state || !state._waitingFor || !state.thisPlayer) { el.innerHTML = ''; return; }

    var tp = state.thisPlayer;
    var html = '';
    var warnings = [];

    // Detect corporation
    var myCorp = '';
    if (tp.tableau) {
      for (var i = 0; i < tp.tableau.length; i++) {
        var cn = tp.tableau[i].name || '';
        if (typeof TM_RATINGS !== 'undefined' && TM_RATINGS[cn] && TM_RATINGS[cn].t === 'corp') {
          myCorp = cn; break;
        }
      }
    }
    var isHelion = myCorp.indexOf('Helion') !== -1;
    var isEcoline = myCorp.indexOf('Ecoline') !== -1;
    var plantCost = isEcoline ? 7 : 8;

    var heat = tp.heat || 0;
    var plants = tp.plants || 0;
    var energy = tp.energy || 0;
    var tempMaxed = state.game && state.game.temperature >= 8;
    var oxyMaxed = state.game && state.game.oxygenLevel >= 14;

    // Heat conversion
    if (heat >= 8 && !tempMaxed) {
      warnings.push({
        icon: '\ud83d\udd25',
        text: '\u041a\u043e\u043d\u0432\u0435\u0440\u0442\u0438\u0440\u0443\u0439 heat \u2192 temp (' + heat + ' heat = ' + Math.floor(heat / 8) + ' TR)',
        color: '#ff9800'
      });
    }

    // Plant conversion
    if (plants >= plantCost) {
      var grn = Math.floor(plants / plantCost);
      warnings.push({
        icon: '\ud83c\udf3f',
        text: '\u041a\u043e\u043d\u0432\u0435\u0440\u0442\u0438\u0440\u0443\u0439 plants \u2192 greenery (' + plants + ' plants = ' + grn + ' VP' + (oxyMaxed ? '' : ' + TR') + ')' + (isEcoline ? ' [Ecoline: 7]' : ''),
        color: '#4caf50'
      });
    }

    // Ecoline: remind at 7 plants
    if (isEcoline && plants >= 7 && plants < 8) {
      warnings.push({
        icon: '\ud83c\udf3f',
        text: 'Ecoline: greenery \u0437\u0430 7 plants!',
        color: '#66bb6a'
      });
    }

    // Helion: heat as MC
    if (isHelion && heat > 0) {
      warnings.push({
        icon: '\ud83d\udcb0',
        text: 'Heat \u043a\u0430\u043a MC (Helion): ' + heat + ' heat \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e',
        color: '#ff9800'
      });
    }

    // Energy stockpile warning
    if (energy >= 6) {
      var hasConsumer = false;
      if (tp.tableau && typeof TM_CARD_EFFECTS !== 'undefined') {
        for (var ei = 0; ei < tp.tableau.length; ei++) {
          var ecn = tp.tableau[ei].name || '';
          var fx = TM_CARD_EFFECTS[ecn];
          if (fx && fx.usesEnergy) { hasConsumer = true; break; }
        }
      }
      if (!hasConsumer) {
        warnings.push({
          icon: '\u26a1',
          text: energy + ' energy \u0441\u0442\u0430\u043d\u0435\u0442 heat \u0432 \u0441\u043b\u0435\u0434. \u0433\u0435\u043d' + (!tempMaxed && (energy + heat) >= 8 ? ' (\u0438\u043b\u0438 \u043a\u043e\u043f\u0438 \u043d\u0430 temp!)' : ''),
          color: '#ffeb3b'
        });
      }
    }

    if (warnings.length > 0) {
      html = '<div style="margin-top:4px;padding:3px 5px;background:rgba(255,152,0,0.12);border-left:2px solid #ff9800;border-radius:3px">';
      html += '<div style="font-size:10px;color:#ff9800;font-weight:bold;margin-bottom:2px">\u26a0 \u041d\u0435 \u0437\u0430\u0431\u0443\u0434\u044c \u043f\u0435\u0440\u0435\u0434 \u043f\u0430\u0441\u043e\u043c:</div>';
      for (var w = 0; w < warnings.length; w++) {
        html += '<div style="font-size:10px;color:' + warnings[w].color + '">' + warnings[w].icon + ' ' + warnings[w].text + '</div>';
      }
      html += '</div>';
    }
    el.innerHTML = html;
  }

  function escHtml(s) {
    if (typeof TM_UTILS !== 'undefined' && TM_UTILS.escHtml) return TM_UTILS.escHtml(s);
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ══════════════════════════════════════════════════════════════
  // PACE TRACKING — avg time/action, estimated time remaining
  // ══════════════════════════════════════════════════════════════

  function renderPace(state) {
    var el = document.getElementById('tm-advisor-pace');
    if (!el) return;
    if (!state || !state.thisPlayer || !state.game || !state.game.players) { el.innerHTML = ''; return; }

    var allPlayers = state.game.players;
    var gen = state.game.generation || 1;
    var paces = [];

    for (var i = 0; i < allPlayers.length; i++) {
      var p = allPlayers[i];
      if (!p.timer || !p.timer.sumMs) continue;
      // Estimate total actions: tableau cards + gen count (std projects, blue actions, passes)
      var actions = (p.tableau ? p.tableau.length : 0) + gen;
      if (actions < 1) actions = 1;
      var secPerAct = Math.round(p.timer.sumMs / 1000 / actions);
      var isMe = p.color === state.thisPlayer.color;
      paces.push({ name: p.name || p.color, secPerAct: secPerAct, totalMs: p.timer.sumMs, isMe: isMe });
    }

    if (paces.length === 0) { el.innerHTML = ''; return; }

    // Estimate time remaining: gensLeft * ~6 actions/gen/player * avg sec/action * numPlayers
    var timing = TM_ADVISOR.endgameTiming(state);
    var gensLeft = timing ? timing.gensLeft : 3;
    var avgSecAll = 0;
    for (var j = 0; j < paces.length; j++) avgSecAll += paces[j].secPerAct;
    avgSecAll = Math.round(avgSecAll / paces.length);
    var estMinLeft = Math.round(gensLeft * 6 * avgSecAll * paces.length / 60);

    // Build display: "⏱ ~15min left | You: 45s | Zara: 32s | Giasa: 28s"
    var avgAll = Math.round(paces.reduce(function(s, p) { return s + p.secPerAct; }, 0) / paces.length);
    var maxSec = Math.max.apply(null, paces.map(function(p) { return p.secPerAct; }));
    var parts = paces.map(function(p) {
      var label = p.isMe ? 'Ты' : p.name;
      var slow = p.secPerAct > avgAll * 1.5 ? ' \u26a0' : '';
      return label + ': ' + p.secPerAct + 's' + slow;
    });

    el.innerHTML = '<div style="font-size:11px;opacity:0.8;margin-top:3px">' +
      '\u23f1 ~' + estMinLeft + 'мин | ' + parts.join(' | ') +
      '</div>';
  }

  // ══════════════════════════════════════════════════════════════
  // TURMOIL SECTION
  // ══════════════════════════════════════════════════════════════

  var PARTY_ICONS = {
    'Mars First': '\uD83D\uDD34', 'Scientists': '\uD83D\uDD2C', 'Unity': '\uD83C\uDF0D',
    'Greens': '\uD83C\uDF3F', 'Reds': '\u26D4', 'Kelvinists': '\uD83D\uDD25'
  };
  var PARTY_BONUS_SHORT = {
    'Mars First': 'building/city', 'Scientists': 'science', 'Unity': 'space/venus/earth',
    'Greens': 'plant/microbe/animal', 'Reds': 'TR tax 3MC', 'Kelvinists': 'heat/energy'
  };

  function renderTurmoil(state) {
    var el = document.getElementById('tm-advisor-turmoil');
    if (!el) return;
    var g = state && state.game;
    if (!g || !g.turmoil) { el.innerHTML = ''; return; }

    var t = g.turmoil;
    var ruling = t.ruling || '';
    var dominant = t.dominant || t.dominantParty || '';
    var chairman = t.chairman || '';
    var myColor = state.thisPlayer ? state.thisPlayer.color : '';
    var myInfluence = state.thisPlayer ? (state.thisPlayer.influence || 0) : 0;

    // Count my delegates per party + find if I'm leader in dominant party
    var myDelInDominant = 0;
    var leaderOfDominant = '';
    var maxDelInDominant = 0;
    var totalMyDel = 0;
    if (t.parties) {
      for (var i = 0; i < t.parties.length; i++) {
        var party = t.parties[i];
        if (!party.delegates) continue;
        var myCount = 0;
        var counts = {}; // color -> count
        for (var j = 0; j < party.delegates.length; j++) {
          var d = party.delegates[j];
          var dc = (typeof d === 'string') ? d : (d && d.color ? d.color : '');
          if (!dc) continue;
          counts[dc] = (counts[dc] || 0) + 1;
          if (dc === myColor) myCount++;
        }
        totalMyDel += myCount;
        var pName = party.name || party.partyName || '';
        if (pName === dominant) {
          myDelInDominant = myCount;
          // Find current leader (most delegates; ties broken by first placed — we just check max)
          var maxC = 0;
          var leadColor = '';
          for (var c in counts) {
            if (counts[c] > maxC) { maxC = counts[c]; leadColor = c; }
          }
          maxDelInDominant = maxC;
          leaderOfDominant = leadColor;
        }
      }
    }

    // Lobby reserve (delegates I can still send)
    var myReserve = 0;
    var reserve = t.delegateReserve || t.reserve || [];
    for (var ri = 0; ri < reserve.length; ri++) {
      var rd = reserve[ri];
      var rc = (typeof rd === 'string') ? rd : (rd && rd.color ? rd.color : '');
      if (rc === myColor) myReserve++;
    }
    // Also count lobby
    var lobby = t.lobby || [];
    for (var li = 0; li < lobby.length; li++) {
      var ld = lobby[li];
      var lc = (typeof ld === 'string') ? ld : (ld && ld.color ? ld.color : '');
      if (lc === myColor) myReserve++;
    }

    // Build lines
    var lines = [];

    // Line 1: Ruling + Dominant
    var rulingIcon = PARTY_ICONS[ruling] || '';
    var domIcon = PARTY_ICONS[dominant] || '';
    var line1 = rulingIcon + ' ' + ruling;
    if (ruling === 'Reds') line1 += ' \u26a0';
    if (dominant && dominant !== ruling) {
      line1 += ' \u2192 ' + domIcon + ' ' + dominant;
    }
    lines.push(line1);

    // Line 2: Recommendation
    var rec = '';
    if (ruling === 'Reds') {
      // Check if we're terraforming (have TR actions planned)
      rec = '\u26a0 Reds: +3MC/TR. ';
      if (dominant === 'Reds') {
        rec += 'Push delegates away from Reds!';
      } else {
        rec += 'Good: ' + dominant + ' next.';
      }
    } else if (dominant === 'Reds') {
      rec = '\u26a0 Reds dominant \u2014 send delegate to block!';
    }

    // Chairman check: can I become chairman?
    var chairmanNote = '';
    if (dominant && leaderOfDominant === myColor && myDelInDominant > 0) {
      chairmanNote = '\uD83D\uDC51 Chairman next phase!';
    } else if (dominant && myDelInDominant > 0 && myDelInDominant === maxDelInDominant) {
      chairmanNote = '\uD83D\uDC51 Tied for chairman';
    } else if (dominant && myReserve > 0 && (myDelInDominant + 1) > maxDelInDominant) {
      chairmanNote = '\uD83D\uDC51 1 delegate \u2192 chairman';
    }

    if (!rec && !chairmanNote) {
      // Generic tip based on dominant party
      var domBonus = PARTY_BONUS_SHORT[dominant] || '';
      if (domBonus && dominant !== 'Reds') {
        rec = dominant + ' next (' + domBonus + ')';
      }
    }

    if (rec) lines.push(rec);
    if (chairmanNote) lines.push(chairmanNote);

    // Compact: my delegates + reserve info
    var delInfo = '\uD83C\uDFDB ' + totalMyDel + ' del';
    if (myReserve > 0) delInfo += ' (' + myReserve + ' res)';
    if (myInfluence > 0) delInfo += ' infl:' + myInfluence;
    lines.push(delInfo);

    var primaryTurmoil = lines.shift() || '';
    var actionTurmoil = lines.shift() || '';
    var moreTurmoil = lines.length
      ? '<details class="tm-advisor-more tm-advisor-turmoil-more"><summary>details</summary>' + lines.join('<br>') + '</details>'
      : '';
    el.innerHTML = '<div class="tm-advisor-minor-section tm-advisor-turmoil-line">' +
      '<div>' + primaryTurmoil + '</div>' +
      (actionTurmoil ? '<div class="tm-advisor-turmoil-action">' + actionTurmoil + '</div>' : '') +
      moreTurmoil +
      '</div>';
  }

  // ══════════════════════════════════════════════════════════════
  // UPDATE LOOP
  // ══════════════════════════════════════════════════════════════

  function update() {
    if (!_enabled || document.hidden) return;
    if (!shouldMountPanel()) {
      if (_panel) _panel.classList.add('tm-advisor-hidden');
      return;
    }

    createPanel();
    _panel.classList.remove('tm-advisor-hidden');

    var state = readState();
    if (!state || !state.thisPlayer) {
      if (!_stateWaitSince) _stateWaitSince = Date.now();
      var genPlaceholderEl = document.getElementById('tm-advisor-gen');
      if (genPlaceholderEl) genPlaceholderEl.textContent = 'Advisor';
      var bodyPlaceholderEl = document.getElementById('tm-advisor-body');
      if (bodyPlaceholderEl) {
        var waitMs = Math.max(0, Date.now() - _stateWaitSince);
        var bridgeHost = getBridgeStatusHost();
        var bridgeStatus = bridgeHost ? (bridgeHost.getAttribute('data-tm-bridge-status') || 'none') : 'no-host';
        var gameId = (typeof TM_UTILS !== 'undefined' && TM_UTILS.parseGameId) ? (TM_UTILS.parseGameId() || 'none') : 'no-parser';
        var apiStateAge = _fallbackApiStateTime ? Math.max(0, Math.round((Date.now() - _fallbackApiStateTime) / 1000)) + 's' : 'none';
        var apiError = _fallbackApiLastError || 'none';
        var showDiagnostics = !!_fallbackApiLastError || waitMs >= 5000;
        bodyPlaceholderEl.innerHTML =
          '<div style="font-size:12px;opacity:0.75">' + (showDiagnostics ? 'Ожидание состояния игры...' : 'Подключение к состоянию игры...') + '</div>' +
          (showDiagnostics
            ? '<div style="font-size:10px;opacity:0.6;line-height:1.45;margin-top:6px">' +
                'bridge: ' + bridgeStatus + '<br>' +
                'gameId: ' + gameId + '<br>' +
                'apiState: ' + apiStateAge + '<br>' +
                'apiError: ' + apiError +
              '</div>'
            : '');
      }
      if (waitMs >= 5000) requestApiStateFallback();
      scheduleFastRetry(waitMs >= 5000 ? 1200 : 700);
      return;
    }
    _stateWaitSince = 0;
    ensurePanelBodyShell();

    // Deduplicate: only update if state changed
    var tp = state.thisPlayer;
    var _usedLen = (tp.actionsThisGeneration || []).length;
    var hash = (state.game && state.game.generation || 0) + ':' +
               (tp.megaCredits || 0) + ':' +
               (tp.terraformRating || 0) + ':' +
               (tp.heat || 0) + ':' +
               (tp.plants || 0) + ':' +
               (tp.energy || 0) + ':' +
               (tp.steel || 0) + ':' +
               (tp.titanium || 0) + ':' +
               _usedLen + ':' +
               ((state.game && state.game.turmoil && state.game.turmoil.ruling) || '') + ':' +
               ((state.game && state.game.turmoil && (state.game.turmoil.dominant || state.game.turmoil.dominantParty)) || '') + ':' +
               (state._timestamp || 0);
    if (hash === _lastUpdateHash) return;
    _lastUpdateHash = hash;

    // Generation change detection — compute delta
    var curGen = (state.game && state.game.generation) || 0;
    if (_prevGenState && _prevGenState.gen !== curGen && curGen > _prevGenState.gen) {
      var dTR = (tp.terraformRating || 0) - (_prevGenState.tr || 0);
      var vpbNow = tp.victoryPointsBreakdown;
      var dVP = (vpbNow && typeof vpbNow.total === 'number') ? vpbNow.total - (_prevGenState.vp || 0) : dTR;
      // Count milestones/awards gained
      var dMilestones = 0;
      var dAwards = 0;
      var clMs = (state.game && state.game.claimedMilestones) || [];
      var fdAw = (state.game && state.game.fundedAwards) || [];
      for (var _gmi = 0; _gmi < clMs.length; _gmi++) {
        if (clMs[_gmi].playerColor === tp.color) dMilestones++;
      }
      for (var _gai = 0; _gai < fdAw.length; _gai++) {
        if (fdAw[_gai].playerColor === tp.color) dAwards++;
      }
      dMilestones -= (_prevGenState.milestones || 0);
      dAwards -= (_prevGenState.awards || 0);

      _genDelta = {
        gen: _prevGenState.gen,
        dTR: dTR,
        dVP: dVP,
        dCards: (tp.tableau ? tp.tableau.length : 0) - (_prevGenState.tableauLen || 0),
        dMilestones: dMilestones,
        dAwards: dAwards,
        ts: Date.now()
      };
      // Flash panel border on gen change
      if (_panel) {
        _panel.style.borderColor = '#f1c40f';
        setTimeout(function() { if (_panel) _panel.style.borderColor = ''; }, 3000);
      }
    }
    // Save current state for next gen comparison
    var _myMs = 0;
    var _myAw = 0;
    var _clMs2 = (state.game && state.game.claimedMilestones) || [];
    var _fdAw2 = (state.game && state.game.fundedAwards) || [];
    for (var _gm2 = 0; _gm2 < _clMs2.length; _gm2++) { if (_clMs2[_gm2].playerColor === tp.color) _myMs++; }
    for (var _ga2 = 0; _ga2 < _fdAw2.length; _ga2++) { if (_fdAw2[_ga2].playerColor === tp.color) _myAw++; }
    _prevGenState = {
      gen: curGen,
      tr: tp.terraformRating || 0,
      vp: (tp.victoryPointsBreakdown && typeof tp.victoryPointsBreakdown.total === 'number') ? tp.victoryPointsBreakdown.total : (tp.terraformRating || 0),
      tableauLen: tp.tableau ? tp.tableau.length : 0,
      milestones: _myMs,
      awards: _myAw
    };
    // Clear gen delta after 15 seconds
    if (_genDelta && Date.now() - _genDelta.ts > 15000) _genDelta = null;

    // Always update gen in header (visible even collapsed)
    var genEl = document.getElementById('tm-advisor-gen');
    var genNum = (state.game && state.game.generation) || '?';
    var deltaHint = '';
    if (_genDelta) {
      var parts = [];
      if (_genDelta.dTR !== 0) parts.push('TR' + (_genDelta.dTR > 0 ? '+' : '') + _genDelta.dTR);
      if (_genDelta.dVP !== _genDelta.dTR && _genDelta.dVP !== 0) parts.push('VP' + (_genDelta.dVP > 0 ? '+' : '') + _genDelta.dVP);
      if (_genDelta.dCards > 0) parts.push('+' + _genDelta.dCards + '\ud83c\udcb3');
      if (_genDelta.dMilestones > 0) parts.push('+M');
      if (_genDelta.dAwards > 0) parts.push('+A');
      if (parts.length > 0) deltaHint = ' (\u0437\u0430 Gen' + _genDelta.gen + ': ' + parts.join(' ') + ')';
    }
    if (genEl) genEl.textContent = 'Gen ' + genNum + (_compact ? ' \u25aa' : '') + deltaHint;

    if (!_collapsed) {
      try { renderTiming(state); } catch(e) { apError('[TM-Advisor] renderTiming:', e.message); }
      try { renderVarianceWarnings(state); } catch(e) { apError('[TM-Advisor] renderVariance:', e.message); }
      if (!_compact) {
        try { renderAlerts(state); } catch(e) { apError('[TM-Advisor] renderAlerts:', e.message); }
        try { renderActions(state); } catch(e) { apError('[TM-Advisor] renderActions:', e.message); }
      } else {
        try { renderCompactAlerts(state); } catch(e) {}
        var actionsEl = document.getElementById('tm-advisor-actions');
        if (actionsEl) actionsEl.innerHTML = '';
      }
      try { renderPass(state); } catch(e) { apError('[TM-Advisor] renderPass:', e.message); }
      try { renderPace(state); } catch(e) { apError('[TM-Advisor] renderPace:', e.message); }
      try { renderTurmoil(state); } catch(e) { apError('[TM-Advisor] renderTurmoil:', e.message); }
      if (!_compact) {
        try { renderOppStrategies(state); } catch(e) { apError('[TM-Advisor] renderOppStrategies:', e.message); }
      } else {
        var oppStratEl = document.getElementById('tm-advisor-opp-strat');
        if (oppStratEl) oppStratEl.innerHTML = '';
      }
      if (!_compact) {
        try { renderDeck(state); } catch(e) { apError('[TM-Advisor] renderDeck:', e.message); }
      } else {
        // Compact mode: show minimal deck/discard line
        var deckEl = document.getElementById('tm-advisor-deck');
        if (deckEl) {
          var g = state && state.game;
          var ds = g ? (g.deckSize || 0) : 0;
          var dp = g ? (g.discardPileSize || 0) : 0;
          if (ds > 0 || dp > 0) {
            deckEl.innerHTML = '<div style="font-size:11px;opacity:0.7;margin-top:4px">' +
              '\uD83C\uDCCF ' + ds + ' / \uD83D\uDDD1 ' + dp + '</div>';
          } else {
            deckEl.innerHTML = '';
          }
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // DECK ANALYZER SECTION
  // ══════════════════════════════════════════════════════════════

  // ── Draft memory: track cards seen in draft offers ──
  var _DRAFT_MEM_KEY = 'tm-advisor-draft-memory';
  var _draftMemGameId = '';

  function getDraftMemory(gameId) {
    if (_draftMemGameId !== gameId) {
      _draftMemGameId = gameId;
    }
    try {
      var raw = localStorage.getItem(_DRAFT_MEM_KEY);
      if (raw) {
        var mem = JSON.parse(raw);
        if (mem.gameId === gameId) return mem.seen || [];
      }
    } catch(e) {}
    return [];
  }

  function saveDraftMemory(gameId, seen) {
    try {
      localStorage.setItem(_DRAFT_MEM_KEY, JSON.stringify({ gameId: gameId, seen: seen }));
    } catch(e) {}
  }

  function trackDraftCards(state) {
    var gameId = (state.game && state.game.id) || '';
    // Fallback: use board+players+color as stable ID if game.id is empty
    if (!gameId && state.game) {
      var opts = state.game.gameOptions || {};
      var playerNames = (state.players || []).map(function(p) { return p.name || ''; }).sort().join(',');
      gameId = 'g_' + (opts.boardName || 'x') + '_' + playerNames + '_' +
        ((state.thisPlayer && state.thisPlayer.color) || '');
    }
    if (!gameId) return;
    var seen = getDraftMemory(gameId);
    var seenSet = {};
    for (var i = 0; i < seen.length; i++) seenSet[seen[i]] = true;
    var added = false;

    // Cards in current draft offer (draftedCards from vue-bridge)
    var drafted = state.draftedCards || (state.thisPlayer && state.thisPlayer.draftedCards) || [];
    for (var d = 0; d < drafted.length; d++) {
      var dn = drafted[d].name || drafted[d];
      if (dn && !seenSet[dn]) { seen.push(dn); seenSet[dn] = true; added = true; }
    }

    // Cards in waitingFor (select-card prompts during draft)
    var wf = state._waitingFor;
    if (wf && typeof TM_ADVISOR_WORKFLOW !== 'undefined' && TM_ADVISOR_WORKFLOW.collectWorkflowCardNames) {
      var wfNames = TM_ADVISOR_WORKFLOW.collectWorkflowCardNames(wf);
      for (var w = 0; w < wfNames.length; w++) {
        var wn = wfNames[w];
        if (wn && !seenSet[wn]) { seen.push(wn); seenSet[wn] = true; added = true; }
      }
    }

    if (added) saveDraftMemory(gameId, seen);
    return seen;
  }

  function renderDeck(state) {
    var el = document.getElementById('tm-advisor-deck');
    if (!el) return;

    var ratings = (typeof TM_RATINGS !== 'undefined') ? TM_RATINGS : null;
    var cardData = (typeof TM_CARD_DATA !== 'undefined') ? TM_CARD_DATA : null;
    if (!ratings || !cardData) { el.innerHTML = ''; return; }

    // Track draft-seen cards and pass to analyzer
    var draftSeen = trackDraftCards(state);
    var analysis = TM_ADVISOR.analyzeDeck(state, ratings, cardData, draftSeen);
    if (!analysis || analysis.deckSize === 0) { el.innerHTML = ''; return; }

    var tc = analysis.tierCounts;
    var totalUnknown = analysis.unknownCount || 1;
    var pDeck = (analysis.pInDeck * 100).toFixed(0);
    var deckSize = analysis.deckSize || 0;

    // Scale tier counts to deck size (unknown includes deck+discard+opp hands)
    var scaleFactor = totalUnknown > 0 ? deckSize / totalUnknown : 1;
    var tcScaled = {};
    var tiers = ['S','A','B','C','D','F'];
    for (var si = 0; si < tiers.length; si++) {
      tcScaled[tiers[si]] = Math.round((tc[tiers[si]] || 0) * scaleFactor);
    }

    // Tier bar (use scaled counts = estimated cards in deck per tier)
    var tierColors = {S:'#FF7F7F', A:'#FFBF7F', B:'#FFDF7F', C:'#BFFF7F', D:'#7FFF7F', F:'#CCCCCC'};
    var barHtml = '';
    for (var i = 0; i < tiers.length; i++) {
      var t = tiers[i];
      var count = tcScaled[t] || 0;
      var pct = deckSize > 0 ? (count / deckSize * 100) : 0;
      if (pct < 1) continue;
      barHtml += '<div style="width:' + pct.toFixed(1) + '%;background:' + tierColors[t] +
        ';text-align:center;font-size:11px;line-height:18px;color:#333" title="' +
        t + ': ' + count + ' (' + pct.toFixed(0) + '%)">' + (pct >= 5 ? t + count : '') + '</div>';
    }

    // Key S/A cards (top 8)
    var keyHtml = '';
    var saCards = (analysis.tierCards.S || []).concat(analysis.tierCards.A || []);
    var shown = Math.min(saCards.length, 3);
    for (var k = 0; k < shown; k++) {
      var c = saCards[k];
      keyHtml += '<span style="display:inline-block;margin:1px 3px;padding:1px 5px;' +
        'background:' + (c.score >= 90 ? '#FF7F7F' : '#FFBF7F') + ';border-radius:3px;font-size:11px;color:#333" ' +
        'title="' + c.name + ' (' + c.score + ')">' + c.name + '</span>';
    }
    if (saCards.length > shown) {
      keyHtml += '<span style="font-size:11px;opacity:0.7"> +' + (saCards.length - shown) + '</span>';
    }

    // Synergy cards (top 5, deduplicated by match source)
    var synHtml = '';
    var synCards = analysis.synCards || [];
    var usedSources = {};  // track which tableau cards already shown as source
    var synShown = 0;
    for (var s = 0; s < synCards.length && synShown < 2; s++) {
      var sc = synCards[s];
      // Filter out matches whose sources are all already used
      var newMatches = [];
      for (var mi = 0; mi < sc.matches.length; mi++) {
        if (!usedSources[sc.matches[mi]]) newMatches.push(sc.matches[mi]);
      }
      if (newMatches.length === 0) continue;
      // Mark sources as used
      for (var mj = 0; mj < newMatches.length; mj++) usedSources[newMatches[mj]] = true;
      synHtml += '<div style="font-size:12px;padding:1px 0">' +
        '<span style="color:#FFD700">\u2605</span> ' + sc.name + ' (' + sc.score + ') \u2190 ' +
        newMatches.join(', ') + '</div>';
      synShown++;
    }

    // Draft probability
    var draftHtml = '<span style="font-size:12px;opacity:0.8">' +
      'Draft 4: S+A ' + (analysis.draftP.sa * 100).toFixed(0) + '% | ' +
      'B+ ' + (analysis.draftP.bPlus * 100).toFixed(0) + '%</span>';

    var deckDetails = draftHtml +
      (keyHtml ? '<div class="tm-advisor-deck-keys">' + keyHtml + '</div>' : '') +
      (synHtml ? '<div class="tm-advisor-deck-synergy">' + synHtml + '</div>' : '');

    el.innerHTML =
      '<div class="tm-advisor-deck-section">' +
        '<div class="tm-advisor-deck-head">' +
          '\uD83C\uDCCF Deck: ' + analysis.deckSize +
          ' <span style="opacity:0.7;font-weight:normal">(' +
          '<span style="color:#FFBF7F">SA ' + (deckSize > 0 ? ((tcScaled.S + tcScaled.A) / deckSize * 100).toFixed(0) : 0) + '%</span>' +
          ' <span style="color:#999">DF ' + (deckSize > 0 ? ((tcScaled.D + tcScaled.F) / deckSize * 100).toFixed(0) : 0) + '%</span>' +
          ')</span>' +
          ' | Discard: ' + analysis.discardSize +
          ' | P=' + pDeck + '%</div>' +
        '<div style="display:flex;height:18px;border-radius:3px;overflow:hidden;margin-bottom:3px">' +
          barHtml +
        '</div>' +
        '<details class="tm-advisor-more tm-advisor-deck-more"><summary>details</summary>' + deckDetails + '</details>' +
      '</div>';
  }

  // ══════════════════════════════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════════════════════════════

  function loadSettings() {
    if (_safeStorage) {
      _safeStorage(function(storage) {
        storage.local.get({ advisor_enabled: true }, function(s) {
          _enabled = s.advisor_enabled;
          if (!_enabled && _panel) _panel.classList.add('tm-advisor-hidden');
        });
      });
    } else if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        chrome.storage.local.get({ advisor_enabled: true }, function(s) {
          _enabled = s.advisor_enabled;
          if (!_enabled && _panel) _panel.classList.add('tm-advisor-hidden');
        });
      } catch (e) {}
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      try {
        chrome.storage.onChanged.addListener(function(changes) {
          if (changes.advisor_enabled) {
            _enabled = changes.advisor_enabled.newValue;
            if (_enabled) {
              update();
            } else if (_panel) {
              _panel.classList.add('tm-advisor-hidden');
            }
          }
        });
      } catch (e) {}
    }
  }

  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════

  loadSettings();
  if (shouldMountPanel()) {
    createPanel();
    bindBridgeObserver();
    if (!hasBridgeData()) requestApiStateFallback();
  }
  window.addEventListener('pageshow', function() { setTimeout(update, 0); });
  window.addEventListener('focus', function() { setTimeout(update, 0); });
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) setTimeout(update, 0);
  });
  setInterval(update, 3000);
  setTimeout(update, 250);
  setTimeout(update, 2000);
  setTimeout(update, 5000);
})();
