// TM Advisor Panel — UI layer on top of TM_ADVISOR analytics.
// Reads state from vue-bridge DOM attributes, renders a collapsible panel.

/* eslint-disable */
(function() {
  'use strict';

  if (typeof TM_ADVISOR === 'undefined') return;

  var _panel = null;
  var _collapsed = false;
  var _compact = false;
  var _enabled = true;
  var _lastUpdateHash = '';
  var _prevGenState = null; // previous generation snapshot for delta tracking
  var _genDelta = null; // { dTR, dMC, dVP, gen } shown after gen change

  // ══════════════════════════════════════════════════════════════
  // PANEL CREATION
  // ══════════════════════════════════════════════════════════════

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
        '<div id="tm-advisor-timing"></div>' +
        '<div id="tm-advisor-alerts"></div>' +
        '<div id="tm-advisor-actions"></div>' +
        '<div id="tm-advisor-pass"></div>' +
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
        _panel.style.top = pos.top + 'px';
        _panel.style.right = 'auto';
        _panel.style.left = pos.left + 'px';
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
    var target = document.getElementById('game') || document.body;
    var raw = target.getAttribute('data-tm-vue-bridge');
    if (!raw) return null;
    try {
      var state = JSON.parse(raw);
      // Read waitingFor from separate attribute
      var wfRaw = target.getAttribute('data-tm-vue-wf');
      if (wfRaw) {
        try { state._waitingFor = JSON.parse(wfRaw); } catch(e2) {}
      }
      return state;
    } catch(e) {
      return null;
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
    var dzIcon = timing.dangerZone === "red" ? "🔴" : (timing.dangerZone === "yellow" ? "🟡" : "🟢");
    // M/A alerts
    var maAlert = '';
    if (state && state.game && state.thisPlayer) {
      var tp = state.thisPlayer;
      var mc = tp.megaCredits || 0;
      // Claimable milestones
      if (state.game.milestones && mc >= 8) {
        var claimed = 0;
        state.game.milestones.forEach(function(ms) { if (ms.playerName || ms.playerColor || ms.owner_name || ms.owner_color) claimed++; });
        if (claimed < 3) {
          state.game.milestones.forEach(function(ms) {
            if (ms.playerName || ms.playerColor || ms.owner_name || ms.owner_color) return;
            var result = TM_ADVISOR.evaluateMilestone ? TM_ADVISOR.evaluateMilestone(ms.name, state) : null;
            if (result && result.canClaim) {
              maAlert += '<div style="color:#2ecc71;font-size:11px">\u2b50 ' + ms.name + ' \u2014 \u0432\u043e\u0437\u044c\u043c\u0438! (8 MC)</div>';
            }
          });
        }
      }
      // VP lead
      if (timing.vpLead !== 0) {
        var vpColor = timing.vpLead > 0 ? '#2ecc71' : '#e74c3c';
        var vpSign = timing.vpLead > 0 ? '+' : '';
        maAlert += '<div style="color:' + vpColor + ';font-size:10px;opacity:0.7">VP ' + vpSign + timing.vpLead + '</div>';
      }
    }
    el.innerHTML = '<div class="tm-advisor-timing tm-dz-' + timing.dangerZone + '">' +
      dzIcon + ' ' + timing.steps + ' \u0448\u0430\u0433\u043e\u0432, ~' + timing.estimatedGens + ' \u043f\u043e\u043a.' +
      maAlert +
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

  function renderActions(state) {
    var el = document.getElementById("tm-advisor-" + "actions");
    if (el) el.innerHTML = '';
  }

  function renderCompactAlerts(state) {
    var el = document.getElementById("tm-advisor-" + "alerts");
    if (el) el.innerHTML = '';
  }

  function renderPass(state) {
    var el = document.getElementById("tm-advisor-" + "pass");
    if (el) el.innerHTML = '';
  }

  function escHtml(s) {
    if (typeof TM_UTILS !== 'undefined' && TM_UTILS.escHtml) return TM_UTILS.escHtml(s);
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ══════════════════════════════════════════════════════════════
  // UPDATE LOOP
  // ══════════════════════════════════════════════════════════════

  function update() {
    if (!_enabled || document.hidden) return;

    var state = readState();
    if (!state || !state.thisPlayer) {
      if (_panel) _panel.classList.add('tm-advisor-hidden');
      return;
    }

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

    createPanel();
    _panel.classList.remove('tm-advisor-hidden');

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
      try { renderTiming(state); } catch(e) { console.error('[TM-Advisor] renderTiming:', e.message); }
      if (!_compact) {
        try { renderAlerts(state); } catch(e) { console.error('[TM-Advisor] renderAlerts:', e.message); }
        try { renderActions(state); } catch(e) { console.error('[TM-Advisor] renderActions:', e.message); }
      } else {
        try { renderCompactAlerts(state); } catch(e) {}
        document.getElementById('tm-advisor-actions').innerHTML = '';
      }
      try { renderPass(state); } catch(e) { console.error('[TM-Advisor] renderPass:', e.message); }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════════════════════════════

  function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get({ advisor_enabled: true }, function(s) {
        _enabled = s.advisor_enabled;
        if (!_enabled && _panel) _panel.classList.add('tm-advisor-hidden');
      });
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
    }
  }

  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════

  loadSettings();
  setInterval(update, 3000);
  setTimeout(update, 2000);
  setTimeout(update, 5000);
})();
