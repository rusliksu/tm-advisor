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
    var el = document.getElementById('tm-advisor-timing');
    if (!el) return;

    var timing = TM_ADVISOR.endgameTiming(state);
    var isLastGen = timing.estimatedGens <= 1;

    var dzClass = 'tm-dz-' + timing.dangerZone;
    var dzIcon = timing.dangerZone === 'red' ? '\ud83d\udd34' : (timing.dangerZone === 'yellow' ? '\ud83d\udfe1' : '\ud83d\udfe2');

    var vpClass = timing.vpLead > 0 ? 'positive' : (timing.vpLead < 0 ? 'negative' : 'neutral');
    var vpSign = timing.vpLead > 0 ? '+' : '';

    el.innerHTML =
      '<div class="tm-advisor-timing ' + dzClass + '">' +
        dzIcon + ' ' + timing.steps + ' \u0448\u0430\u0433\u043e\u0432, ~' + timing.estimatedGens + ' \u043f\u043e\u043a.' +
        '<div class="tm-advisor-timing-detail" style="display:none">' +
          (function() {
            var bn = timing.bottleneck;
            var parts = [];
            parts.push((bn === 'temp' ? '<b>T:' : 'T:') + timing.breakdown.temp + '\u00b0(' + timing.breakdown.tempSteps + ')' + (bn === 'temp' ? '</b>' : ''));
            parts.push((bn === 'oxy' ? '<b>O:' : 'O:') + timing.breakdown.oxy + '%(' + timing.breakdown.oxySteps + ')' + (bn === 'oxy' ? '</b>' : ''));
            parts.push((bn === 'oceans' ? '<b>Oc:' : 'Oc:') + timing.breakdown.oceans + '(' + timing.breakdown.oceanSteps + ')' + (bn === 'oceans' ? '</b>' : ''));
            if (timing.breakdown.venusSteps > 0) {
              parts.push((bn === 'venus' ? '<b>V:' : 'V:') + timing.breakdown.venus + '(' + timing.breakdown.venusSteps + ')' + (bn === 'venus' ? '</b>' : ''));
            }
            // WGT prediction — which parameter will World Government raise
            var wgtParam = '';
            var bd = timing.breakdown;
            if (bd) {
              // WGT raises the most-behind parameter (lowest step relative to total)
              var wgtCandidates = [];
              if (bd.tempSteps > 0) wgtCandidates.push({ name: 'Temp', steps: bd.tempSteps });
              if (bd.oxySteps > 0) wgtCandidates.push({ name: 'O\u2082', steps: bd.oxySteps });
              if (bd.oceanSteps > 0) wgtCandidates.push({ name: 'Ocean', steps: bd.oceanSteps });
              if (bd.venusSteps > 0) wgtCandidates.push({ name: 'Venus', steps: bd.venusSteps });
              if (wgtCandidates.length > 0) {
                wgtCandidates.sort(function(a, b) { return b.steps - a.steps; });
                wgtParam = ' | WGT\u2192' + wgtCandidates[0].name;
              }
            }
            // Temperature/Oxygen bonus milestones
            var bonusHints = [];
            var _t = bd ? bd.temp : -30;
            var _o = bd ? bd.oxy : 0;
            // Temp bonuses: ocean at -24°C, +heat prod at -20°C, +1 heat prod at 0°C
            if (_t < -24 && _t >= -28) bonusHints.push('T-24\u00b0\u2192\ud83c\udf0a');
            if (_t < -20 && _t >= -24) bonusHints.push('T-20\u00b0\u2192+\ud83d\udd25prod');
            // Oxygen bonus: +temp at 8%
            if (_o < 8 && _o >= 6) bonusHints.push('O\u20828%\u2192+T');
            var bonusStr = bonusHints.length > 0 ? ' | \u2728' + bonusHints.join(' ') : '';
            return parts.join(' ') + wgtParam + bonusStr;
          })() +
          // Endgame phase advice + VP projection
          (function() {
            if (timing.estimatedGens <= 0) return '';
            var tp = state && state.thisPlayer;
            var handSize = tp ? (tp.cardsInHandNbr || (tp.cardsInHand ? tp.cardsInHand.length : 0)) : 0;
            var tips = [];
            if (timing.estimatedGens <= 1) {
              tips.push('\u203c \u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0433\u0435\u043d!');
              // Total endgame budget
              var _egMC = tp.megaCredits || 0;
              var _egSteel = (tp.steel || 0) * (tp.steelValue || 2);
              var _egTi = (tp.titanium || 0) * (tp.titaniumValue || 3);
              var _egSell = tp.cardsInHand ? tp.cardsInHand.length : (tp.cardsInHandNbr || 0);
              var _egHeat = 0;
              // Helion can spend heat as MC
              if (tp.tableau) {
                for (var _egi = 0; _egi < tp.tableau.length; _egi++) {
                  if (((tp.tableau[_egi].name || '') + '').toLowerCase() === 'helion') { _egHeat = tp.heat || 0; break; }
                }
              }
              var _egTotal = _egMC + _egSteel + _egTi + _egSell + _egHeat;
              var _egParts = [_egMC + 'MC'];
              if (_egSteel > 0) _egParts.push(_egSteel + 'S');
              if (_egTi > 0) _egParts.push(_egTi + 'Ti');
              if (_egSell > 0) _egParts.push(_egSell + '\u043f\u0440\u043e\u0434');
              if (_egHeat > 0) _egParts.push(_egHeat + '\ud83d\udd25');
              tips.push('\ud83d\udcb0 \u0411\u044e\u0434\u0436\u0435\u0442: ' + _egTotal + ' (' + _egParts.join('+') + ')');
              // Sell advisor — identify dead cards in hand
              if (tp && tp.cardsInHand && tp.cardsInHand.length > 0 && typeof TM_RATINGS !== 'undefined') {
                var sellCards = [];
                var keepCards = [];
                var mc = tp.megaCredits || 0;
                var steel = tp.steel || 0;
                var ti = tp.titanium || 0;
                var sv = tp.steelValue || 2;
                var tv = tp.titaniumValue || 3;
                var totalBudget = mc + steel * sv + ti * tv;
                for (var _sei = 0; _sei < tp.cardsInHand.length; _sei++) {
                  var _sn = tp.cardsInHand[_sei].name || tp.cardsInHand[_sei];
                  var _sr = TM_RATINGS[_sn];
                  var _cost = _sr ? (_sr.c || 20) : 20;
                  if (_cost > totalBudget || (_sr && _sr.s < 50)) {
                    sellCards.push(_sn.length > 10 ? _sn.substring(0, 9) + '.' : _sn);
                  } else {
                    keepCards.push({ name: _sn, cost: _cost, score: _sr ? _sr.s : 0 });
                  }
                }
                if (sellCards.length > 0) {
                  tips.push('\ud83d\udcb5\u041f\u0440\u043e\u0434\u0430\u0442\u044c(' + sellCards.length + ')=' + sellCards.length + 'MC: ' + sellCards.join(', '));
                }
                if (keepCards.length > 0) {
                  keepCards.sort(function(a, b) { return b.score - a.score; });
                  var keepStr = keepCards.map(function(k) {
                    var n = k.name.length > 10 ? k.name.substring(0, 9) + '.' : k.name;
                    return n + '(' + k.cost + ')';
                  }).join(', ');
                  tips.push('\u2705\u0418\u0433\u0440\u0430\u0442\u044c: ' + keepStr);
                }
              } else if (handSize > 0) {
                tips.push('\u041f\u0440\u043e\u0434\u0430\u0436\u0430 ' + handSize + ' \u043a\u0430\u0440\u0442 = ' + handSize + ' MC');
              }
              // Endgame turn plan — optimal action sequence
              var _planSteps = [];
              // 1. Blue actions first (VP accumulators)
              if (tp.tableau && typeof TM_CARD_EFFECTS !== 'undefined') {
                var _usedSet = new Set(tp.actionsThisGeneration || []);
                var _vpActions = 0;
                for (var _pi2 = 0; _pi2 < tp.tableau.length; _pi2++) {
                  var _pn2 = tp.tableau[_pi2].name || tp.tableau[_pi2];
                  var _pe2 = TM_CARD_EFFECTS[_pn2];
                  if (_pe2 && _pe2.action && !_usedSet.has(_pn2)) {
                    if (_pe2.vpAcc) _vpActions++;
                  }
                }
                if (_vpActions > 0) _planSteps.push(_vpActions + '\ud83d\udc3e\u043a\u043e\u043f\u0438\u0442\u044c');
              }
              // 2. Conversions
              var _heatConv = (tp.heat || 0) >= 8 && !(state.game && state.game.temperature >= 8);
              var _plantConv = (tp.plants || 0) >= 8 && !(state.game && state.game.oxygenLevel >= 14);
              if (_heatConv) _planSteps.push('\ud83d\udd25TR');
              if (_plantConv) _planSteps.push('\ud83c\udf3f');
              // 3. Cards
              if (keepCards && keepCards.length > 0) _planSteps.push(keepCards.length + '\u043a\u0430\u0440\u0442');
              // 4. SP with remaining budget
              _planSteps.push('SP');
              // 5. Sell remaining
              if (sellCards && sellCards.length > 0) _planSteps.push('\u043f\u0440\u043e\u0434\u0430\u0442\u044c');
              if (_planSteps.length > 1) {
                tips.push('\ud83d\udccb \u041f\u043b\u0430\u043d: ' + _planSteps.join(' \u2192 '));
              }
            } else if (timing.estimatedGens === 2) {
              tips.push('\u26a0 2 \u0433\u0435\u043d\u0430: \u043d\u0435 \u043f\u043e\u043a\u0443\u043f\u0430\u0439 prod, \u0442\u043e\u043b\u044c\u043a\u043e VP/TR');
            } else if (timing.estimatedGens === 3) {
              tips.push('\u26a1 3 \u0433\u0435\u043d\u0430: prod \u043e\u043a\u0443\u043f\u0438\u0442\u0441\u044f \u0442\u043e\u043b\u044c\u043a\u043e \u0434\u0435\u0448\u0451\u0432\u0430\u044f');
            }
            // VP projection: project final VP based on velocity
            var vpByGen = tp && tp.victoryPointsByGeneration;
            var vpb = tp && tp.victoryPointsBreakdown;
            if (vpb && typeof vpb.total === 'number' && timing.estimatedGens > 0) {
              var vpVel = 0;
              if (vpByGen && vpByGen.length >= 2) {
                var span = Math.min(3, vpByGen.length - 1);
                vpVel = (vpByGen[vpByGen.length - 1] - vpByGen[vpByGen.length - 1 - span]) / span;
              }
              var projVP = Math.round(vpb.total + vpVel * timing.estimatedGens);
              if (vpVel > 0) {
                tips.push('\ud83c\udfaf ~' + projVP + ' VP \u043a \u0444\u0438\u043d\u0430\u043b\u0443');
              }
            }
            // Detailed endgame VP forecast: concrete VP sources remaining
            if (tp && timing.estimatedGens > 0 && timing.estimatedGens <= 3) {
              var _fParts = [];
              // Heat → TR conversions remaining
              var _fHeat = (tp.heat || 0) + (tp.energy || 0);
              var _fHProd = (tp.heatProduction || 0) + (tp.energyProduction || 0);
              var _fTempMax = state.game && typeof state.game.temperature === 'number' && state.game.temperature >= 8;
              if (!_fTempMax) {
                var totalHeatByEnd = _fHeat + _fHProd * timing.estimatedGens;
                var heatTRs = Math.floor(totalHeatByEnd / 8);
                if (heatTRs > 0) {
                  // Cap by remaining temp steps (each step = 2°C, max 8°C = 4 steps)
                  var tempSteps = timing.breakdown ? timing.breakdown.tempSteps : 99;
                  heatTRs = Math.min(heatTRs, tempSteps);
                  if (heatTRs > 0) _fParts.push('\ud83d\udd25' + heatTRs + 'TR');
                }
              }
              // Plants → greeneries
              var _fPlants = tp.plants || 0;
              var _fPProd = tp.plantProduction || 0;
              var _fOxyMax = state.game && typeof state.game.oxygenLevel === 'number' && state.game.oxygenLevel >= 14;
              if (!_fOxyMax) {
                var totalPlantsByEnd = _fPlants + _fPProd * timing.estimatedGens;
                var greens = Math.floor(totalPlantsByEnd / 8);
                var oxySteps = timing.breakdown ? timing.breakdown.oxySteps : 99;
                greens = Math.min(greens, oxySteps);
                if (greens > 0) _fParts.push('\ud83c\udf3f' + greens);
              }
              // VP accumulator cards projection
              if (tp.tableau && typeof TM_CARD_EFFECTS !== 'undefined') {
                var accVP = 0;
                for (var _fi = 0; _fi < tp.tableau.length; _fi++) {
                  var _fn = tp.tableau[_fi].name || tp.tableau[_fi];
                  var _fe = TM_CARD_EFFECTS[_fn];
                  if (_fe && _fe.vpAcc && _fe.action) {
                    accVP += _fe.vpAcc * timing.estimatedGens;
                  }
                }
                if (accVP >= 1) _fParts.push('\ud83d\udc3e' + Math.round(accVP) + 'VP');
              }
              if (_fParts.length > 0) {
                tips.push('\ud83d\udcca +' + _fParts.join(' +'));
              }
            }
            if (tips.length === 0) return '';
            return '<div style="color:#f39c12;margin-top:3px">' + tips.join(' ') + '</div>';
          })() +
        '</div>' +
      '</div>' +
      (function() {
        // ═══ VP SOURCE BREAKDOWN ═══
        var tp = state && state.thisPlayer;
        var vpb = tp && tp.victoryPointsBreakdown;
        var lead = timing.vpLead;
        // Recalculate lead if opponent VP hidden — use calcPlayerVP
        if (vpb && vpb.total > 0 && (state.players || []).length > 1) {
          var _bestOppCalc = 0;
          for (var _lci = 0; _lci < state.players.length; _lci++) {
            var _lcp = state.players[_lci];
            if (_lcp.color === tp.color) continue;
            var _lcVpb = _lcp.victoryPointsBreakdown;
            var _lcTotal = (_lcVpb && _lcVpb.total) || 0;
            if (_lcTotal === 0 && (_lcp.terraformRating || 0) > 10) {
              var _lcCalc = calcPlayerVP(_lcp, state);
              if (_lcCalc) _lcTotal = _lcCalc.total;
            }
            if (_lcTotal > _bestOppCalc) _bestOppCalc = _lcTotal;
          }
          if (_bestOppCalc > 0) lead = vpb.total - _bestOppCalc;
        }
        var pushHint = timing.shouldPush ? '' : ' \u2014 \u043d\u0435 \u043f\u0443\u0448\u0438\u0442\u044c';
        var urgency = '';
        if (timing.dangerZone === 'red' && lead < -5) urgency = ' \u26a0\ufe0f \u0420\u0443\u0448 VP!';
        if (timing.dangerZone === 'red' && lead > 10) urgency = ' \u2014 \u043f\u0443\u0448\u0438\u043c \u0444\u0438\u043d\u0438\u0448!';

        if (!vpb || typeof vpb.total !== 'number') {
          // Fallback: simple TR lead
          var vpClass = lead > 0 ? 'positive' : (lead < 0 ? 'negative' : 'neutral');
          var vpSign = lead > 0 ? '+' : '';
          return '<div class="tm-advisor-vp-lead ' + vpClass + '">' +
            'VP Lead: ' + vpSign + lead + pushHint + urgency +
          '</div>';
        }

        var leadSign = lead > 0 ? '+' : '';
        var leadClass = lead > 0 ? 'positive' : (lead < 0 ? 'negative' : 'neutral');

        // ── VP sources with colors ──
        var sources = [
          { key: 'tr', label: 'TR', color: '#3498db', val: vpb.tr || 0 },
          { key: 'greenery', label: 'G', color: '#2ecc71', val: vpb.greenery || 0 },
          { key: 'city', label: 'C', color: '#95a5a6', val: vpb.city || 0 },
          { key: 'cards', label: '\u2663', color: '#e67e22', val: vpb.cards || 0 },
          { key: 'milestones', label: 'M', color: '#f1c40f', val: vpb.milestones || 0 },
          { key: 'awards', label: 'A', color: '#9b59b6', val: vpb.awards || 0 }
        ];
        var total = vpb.total || 1;

        // ── Header: total VP + lead ──
        var headerHtml = '<div class="tm-advisor-vp-lead ' + leadClass + '">' +
          'VP ' + vpb.total + ' ' + leadSign + lead + pushHint + urgency + '</div>';

        // ── Stacked bar ──
        var barSegments = '';
        for (var si = 0; si < sources.length; si++) {
          var s = sources[si];
          if (s.val <= 0) continue;
          var pct = Math.max(Math.round((s.val / total) * 100), 2);
          barSegments += '<div title="' + s.label + ': ' + s.val + ' VP" style="' +
            'width:' + pct + '%;background:' + s.color + ';height:100%;display:inline-block;' +
            'font-size:9px;text-align:center;color:#fff;line-height:14px;overflow:hidden' +
          '">' + (pct >= 8 ? s.label + s.val : '') + '</div>';
        }
        var barHtml = '<div class="tm-detail-row" style="' +
          'height:14px;border-radius:3px;overflow:hidden;margin:3px 0 2px;' +
          'background:#222;display:flex' +
        '">' + barSegments + '</div>';

        // ── Legend (compact) ──
        var legendParts = [];
        for (var li = 0; li < sources.length; li++) {
          if (sources[li].val <= 0) continue;
          legendParts.push('<span style="color:' + sources[li].color + '">' +
            sources[li].label + ':' + sources[li].val + '</span>');
        }
        var legendHtml = '<div class="tm-detail-row" style="font-size:10px;opacity:0.7">' +
          legendParts.join(' ') + '</div>';

        // ── Find closest opponent + all opponent projections ──
        var _players = (state && state.players) || [];
        var closestOpp = null;
        var closestDiff = 999;
        var oppProjs = [];
        if (_players.length > 1) {
          for (var _vi = 0; _vi < _players.length; _vi++) {
            var _vp = _players[_vi];
            if (_vp.color === tp.color) continue;
            var _ovpb = _vp.victoryPointsBreakdown;
            // If VP is hidden (total=0 but player has TR), recalculate from visible data
            var _vpHidden = false;
            if ((!_ovpb || _ovpb.total === 0) && (_vp.terraformRating || 0) > 10) {
              _ovpb = calcPlayerVP(_vp, state);
              _vpHidden = true;
            }
            if (!_ovpb || typeof _ovpb.total !== 'number' || _ovpb.total === 0) continue;
            var _diff = Math.abs(vpb.total - _ovpb.total);
            if (_diff < closestDiff) { closestDiff = _diff; closestOpp = { name: _vp.name || _vp.color, vpb: _ovpb, player: _vp, hidden: _vpHidden }; }
            // Opponent VP projection
            var _oVpByGen = _vp.victoryPointsByGeneration;
            if (_oVpByGen && _oVpByGen.length >= 2 && timing.estimatedGens > 0) {
              var _oSpan = Math.min(3, _oVpByGen.length - 1);
              var _oVel = (_oVpByGen[_oVpByGen.length - 1] - _oVpByGen[_oVpByGen.length - 1 - _oSpan]) / _oSpan;
              var _oProjVP = Math.round(_ovpb.total + _oVel * timing.estimatedGens);
              var _oN = (_vp.name || _vp.color || '?');
              if (_oN.length > 7) _oN = _oN.substring(0, 6) + '.';
              oppProjs.push(_oN + ':~' + _oProjVP);
            }
          }
        }

        // ── Comparison table vs closest opponent ──
        var compHtml = '';
        if (closestOpp) {
          var _oName = closestOpp.name;
          if (_oName.length > 8) _oName = _oName.substring(0, 7) + '.';
          if (closestOpp.hidden) _oName = '~' + _oName;
          // VP gap trend
          var trendIcon = '';
          var myVpByGen = tp.victoryPointsByGeneration;
          var oppVpByGen = closestOpp.player && closestOpp.player.victoryPointsByGeneration;
          if (myVpByGen && oppVpByGen && myVpByGen.length >= 3 && oppVpByGen.length >= 3) {
            var gapNow = vpb.total - closestOpp.vpb.total;
            var gap2ago = myVpByGen[myVpByGen.length - 2] - oppVpByGen[oppVpByGen.length - 2];
            var gapDelta = gapNow - gap2ago;
            if (gapDelta > 1) trendIcon = ' \u2191';
            else if (gapDelta < -1) trendIcon = ' \u2193';
          }

          // Build comparison rows
          var rows = '';
          var hints = [];
          for (var ci = 0; ci < sources.length; ci++) {
            var src = sources[ci];
            var myVal = src.val;
            var oppVal = closestOpp.vpb[src.key] || 0;
            if (myVal === 0 && oppVal === 0) continue;
            var diff = myVal - oppVal;
            var diffStr = diff > 0 ? '+' + diff : (diff < 0 ? '' + diff : '=');
            var diffColor = diff > 0 ? '#2ecc71' : (diff < 0 ? '#e74c3c' : '#666');
            rows += '<tr>' +
              '<td style="color:' + src.color + ';padding:0 4px 0 0">' + src.label + '</td>' +
              '<td style="text-align:right;padding:0 6px">' + myVal + '</td>' +
              '<td style="text-align:right;padding:0 6px;opacity:0.5">' + oppVal + '</td>' +
              '<td style="text-align:right;color:' + diffColor + ';font-weight:bold">' + diffStr + '</td>' +
            '</tr>';

            // Actionable hints for negative gaps
            if (diff < -2) {
              if (src.key === 'greenery') {
                var myPlants = tp.plants || 0;
                var myPProd = tp.plantProduction || 0;
                var plantCost = 8;
                if (myPlants >= plantCost) {
                  hints.push('\u{1f33f} \u0415\u0441\u0442\u044c ' + myPlants + ' \u0440\u0430\u0441\u0442. \u2192 \u0433\u0440\u0438\u043d\u0435\u0440\u0438');
                } else if (myPProd >= 3) {
                  var gensToGreen = Math.ceil((plantCost - myPlants) / myPProd);
                  hints.push('\u{1f33f} \u0413\u0440\u0438\u043d\u0435\u0440\u0438 \u0447\u0435\u0440\u0435\u0437 ' + gensToGreen + ' \u0433\u0435\u043d');
                }
              } else if (src.key === 'city') {
                hints.push('\u{1f3d8}\ufe0f \u0413\u043e\u0440\u043e\u0434 SP = 25 MC');
              } else if (src.key === 'tr') {
                hints.push('\u{1f680} TR: \u043e\u043a\u0435\u0430\u043d 18, temp 14 MC');
              } else if (src.key === 'cards') {
                hints.push('\u2663 \u041d\u0443\u0436\u043d\u044b VP-\u043a\u0430\u0440\u0442\u044b');
              } else if (src.key === 'milestones') {
                hints.push('\u{1f3c5} \u041f\u0440\u043e\u0432\u0435\u0440\u044c \u043c\u0438\u043b\u0435\u0441\u0442\u043e\u0443\u043d\u044b');
              } else if (src.key === 'awards') {
                hints.push('\u{1f3c6} \u041f\u0440\u043e\u0432\u0435\u0440\u044c \u043d\u0430\u0433\u0440\u0430\u0434\u044b');
              }
            }
          }

          compHtml = '<div class="tm-detail-row" style="font-size:10px;margin-top:2px">' +
            '<table style="width:100%;border-collapse:collapse;font-size:10px;line-height:1.5">' +
              '<tr style="opacity:0.4;font-size:9px">' +
                '<td></td><td style="text-align:right;padding:0 6px">\u0422\u044b</td>' +
                '<td style="text-align:right;padding:0 6px">' + _oName + '</td>' +
                '<td style="text-align:right">\u0394' + trendIcon + '</td>' +
              '</tr>' +
              rows +
              '<tr style="border-top:1px solid #333">' +
                '<td style="padding:2px 4px 0 0;opacity:0.6">\u03a3</td>' +
                '<td style="text-align:right;padding:2px 6px 0;font-weight:bold">' + vpb.total + '</td>' +
                '<td style="text-align:right;padding:2px 6px 0;opacity:0.5">' + closestOpp.vpb.total + '</td>' +
                '<td style="text-align:right;padding:2px 0 0;color:' +
                  (lead > 0 ? '#2ecc71' : (lead < 0 ? '#e74c3c' : '#666')) +
                  ';font-weight:bold">' + leadSign + lead + '</td>' +
              '</tr>' +
              // Income comparison row
              (function() {
                var _myInc = (tp.terraformRating || 0) + (tp.megaCreditProduction || 0);
                var _oppInc = (closestOpp.player.terraformRating || 0) + (closestOpp.player.megaCreditProduction || 0);
                var _incDiff = _myInc - _oppInc;
                var _incColor = _incDiff > 0 ? '#2ecc71' : (_incDiff < 0 ? '#e74c3c' : '#666');
                return '<tr style="opacity:0.4;font-size:9px">' +
                  '<td style="padding:1px 4px 0 0">/gen</td>' +
                  '<td style="text-align:right;padding:1px 6px 0">+' + _myInc + '</td>' +
                  '<td style="text-align:right;padding:1px 6px 0">+' + _oppInc + '</td>' +
                  '<td style="text-align:right;padding:1px 0 0;color:' + _incColor + '">' + (_incDiff > 0 ? '+' : '') + _incDiff + '</td>' +
                '</tr>';
              })() +
            '</table>' +
          '</div>';

          // Actionable hints
          if (hints.length > 0) {
            compHtml += '<div class="tm-detail-row" style="font-size:10px;color:#f39c12;margin-top:2px">' +
              hints.join(' \u2502 ') + '</div>';
          }
        }

        // ── Opponent projections ──
        var oppProjHtml = '';
        if (oppProjs.length > 0) {
          oppProjHtml = '<div class="tm-detail-row" style="font-size:10px;opacity:0.5">\ud83c\udfaf ' + oppProjs.join(' \u2502 ') + '</div>';
        }

        // ── Scoreboard — all players sorted by VP ──
        var scoreboardHtml = '';
        if (_players.length > 1) {
          var sbEntries = [];
          // Add self
          var _myName = (tp.name || tp.color || 'Me');
          if (_myName.length > 7) _myName = _myName.substring(0, 6) + '.';
          sbEntries.push({ name: _myName, vp: vpb.total, isSelf: true });
          // Add opponents
          for (var _sbi = 0; _sbi < _players.length; _sbi++) {
            var _sbp = _players[_sbi];
            if (_sbp.color === tp.color) continue;
            var _sbvpb = _sbp.victoryPointsBreakdown;
            var _sbTotal = (_sbvpb && _sbvpb.total) || 0;
            var _sbEst = false;
            if (_sbTotal === 0 && (_sbp.terraformRating || 0) > 10) {
              var _sbCalc = calcPlayerVP(_sbp, state);
              if (_sbCalc) { _sbTotal = _sbCalc.total; _sbEst = true; }
            }
            var _sbName = (_sbp.name || _sbp.color || '?');
            if (_sbName.length > 7) _sbName = _sbName.substring(0, 6) + '.';
            if (_sbEst) _sbName = '~' + _sbName;
            sbEntries.push({ name: _sbName, vp: _sbTotal, isSelf: false });
          }
          sbEntries.sort(function(a, b) { return b.vp - a.vp; });
          var sbParts = sbEntries.map(function(e, idx) {
            var medal = idx === 0 ? '\ud83e\udd47' : (idx === 1 ? '\ud83e\udd48' : '\ud83e\udd49');
            var style = e.isSelf ? 'font-weight:bold;color:#f1c40f' : 'opacity:0.7';
            return '<span style="' + style + '">' + medal + e.name + ' ' + e.vp + '</span>';
          });
          scoreboardHtml = '<div class="tm-detail-row" style="font-size:10px;margin-top:2px">' + sbParts.join(' ') + '</div>';
        }

        // Win target — how many VP to beat best opponent
        var winTargetHtml = '';
        if (closestOpp && timing.estimatedGens > 0) {
          // Project opponent's final VP
          var _oppVpByGen = closestOpp.player && closestOpp.player.victoryPointsByGeneration;
          var _oppVel = 0;
          if (_oppVpByGen && _oppVpByGen.length >= 2) {
            var _ovSpan = Math.min(3, _oppVpByGen.length - 1);
            _oppVel = (_oppVpByGen[_oppVpByGen.length - 1] - _oppVpByGen[_oppVpByGen.length - 1 - _ovSpan]) / _ovSpan;
          }
          // If hidden VP, estimate velocity from TR growth
          if (_oppVel === 0 && closestOpp.hidden) _oppVel = 3; // conservative estimate
          var _oppFinal = Math.round(closestOpp.vpb.total + _oppVel * timing.estimatedGens);
          var _myNeed = _oppFinal - vpb.total;
          if (_myNeed > 0) {
            winTargetHtml = '<div class="tm-detail-row" style="font-size:10px;color:#e67e22">' +
              '\ud83c\udfc1 \u0414\u043e \u043f\u043e\u0431\u0435\u0434\u044b: +' + _myNeed + ' VP (\u0446\u0435\u043b\u044c ~' + (_oppFinal + 1) + ')' +
              '</div>';
          }
          // MC tiebreaker reminder when VP very close (±3)
          if (Math.abs(lead) <= 3 && timing.estimatedGens <= 2) {
            var _myMC = tp.megaCredits || 0;
            var _oppMC = closestOpp.player.megaCredits || 0;
            winTargetHtml += '<div class="tm-detail-row" style="font-size:10px;opacity:0.5">' +
              '\ud83d\udcb0 Tiebreaker: MC \u0442\u044b:' + _myMC + ' vs ' + _oppMC + ' (\u043f\u0440\u0438 \u0440\u0430\u0432\u043d\u044b\u0445 VP)' +
              '</div>';
          }
        }

        return headerHtml + barHtml + legendHtml + compHtml + oppProjHtml + scoreboardHtml + winTargetHtml;
      })() +
      (function() {
        var tp = state && state.thisPlayer;
        if (!tp) return '';
        var gen = (state.game && state.game.generation) || '?';
        var mc = tp.megaCredits || 0;
        var tr = tp.terraformRating || 0;
        var prod = tp.megaCreditProduction != null ? tp.megaCreditProduction : (tp.megaCreditsProduction || 0);
        var steel = tp.steel || 0;
        var ti = tp.titanium || 0;
        var sv = tp.steelValue || 2;
        var tv = tp.titaniumValue || 3;
        // Helion: heat counts as MC
        var isHelion = false;
        if (tp.tableau) {
          for (var _hi = 0; _hi < tp.tableau.length; _hi++) {
            if (((tp.tableau[_hi].name || '') + '').toLowerCase() === 'helion') { isHelion = true; break; }
          }
        }
        var heatMC = isHelion ? (tp.heat || 0) : 0;
        var budget = mc + steel * sv + ti * tv + heatMC;
        var income = tr + prod; // next gen MC income = TR + MC production
        // Add ruling party bonus to income estimate
        var _rulingBonus = 0;
        var _turm = state.game && state.game.turmoil;
        if (_turm && _turm.ruling && tp.tags) {
          var _tgm = Array.isArray(tp.tags) ? {} : tp.tags;
          if (Array.isArray(tp.tags)) { for (var _tbi = 0; _tbi < tp.tags.length; _tbi++) { _tgm[tp.tags[_tbi].tag] = tp.tags[_tbi].count; } }
          if (_turm.ruling === 'Mars') _rulingBonus = _tgm['mars'] || _tgm['building'] || 0;
          else if (_turm.ruling === 'Greens') _rulingBonus = 2 * ((_tgm['plant'] || 0) + (_tgm['microbe'] || 0) + (_tgm['animal'] || 0));
          else if (_turm.ruling === 'Kelvinists') _rulingBonus = tp.heatProduction || 0;
          else if (_turm.ruling === 'Unity') _rulingBonus = (_tgm['venus'] || 0) + (_tgm['earth'] || 0) + (_tgm['jovian'] || 0);
          else if (_turm.ruling === 'Scientists') _rulingBonus = _tgm['science'] || 0;
          if (_rulingBonus > 0) income += _rulingBonus;
        }
        var resStr = mc + ' MC';
        if (steel > 0) resStr += ' +' + steel + 'S';
        if (ti > 0) resStr += ' +' + ti + 'Ti';
        // Production values (used for projections and waste detection, not displayed — visible in game UI)
        var sProd = tp.steelProduction || 0;
        var tiProd = tp.titaniumProduction || 0;
        var pProd = tp.plantProduction || 0;
        var eProd = tp.energyProduction || 0;
        var hProd = tp.heatProduction || 0;
        // Playable cards estimate: budget / avg card cost (~18 MC)
        var handSize = tp.cardsInHandNbr || (tp.cardsInHand ? tp.cardsInHand.length : 0);
        var playable = handSize > 0 ? Math.min(handSize, Math.floor(budget / 18)) : 0;
        var playStr = handSize > 0 ? ' | ~' + playable + '/' + handSize + '\u043a\u0430\u0440\u0442' : '';
        // Hand EV — average score of cards in hand
        var handEvStr = '';
        if (tp.cardsInHand && tp.cardsInHand.length > 0 && typeof TM_RATINGS !== 'undefined') {
          var _hTotal = 0;
          var _hCount = 0;
          var _hBest = null;
          var _hBestScore = 0;
          for (var _hei = 0; _hei < tp.cardsInHand.length; _hei++) {
            var _hn = tp.cardsInHand[_hei].name || tp.cardsInHand[_hei];
            var _hr = TM_RATINGS[_hn];
            if (_hr && typeof _hr.s === 'number') {
              _hTotal += _hr.s;
              _hCount++;
              if (_hr.s > _hBestScore) { _hBestScore = _hr.s; _hBest = _hn; }
            }
          }
          if (_hCount > 0) {
            var _hAvg = Math.round(_hTotal / _hCount);
            var _bestShort = _hBest && _hBest.length > 12 ? _hBest.substring(0, 11) + '.' : _hBest;
            // Hand tag summary — what tags hand cards would add
            var _htTags = {};
            for (var _hti = 0; _hti < tp.cardsInHand.length; _hti++) {
              var _htn = tp.cardsInHand[_hti].name || tp.cardsInHand[_hti];
              var _htr = TM_RATINGS[_htn];
              if (_htr && _htr.g) {
                _htr.g.split(',').forEach(function(t) {
                  var _tk = t.trim().toLowerCase();
                  if (_tk && _tk !== 'wild') _htTags[_tk] = (_htTags[_tk] || 0) + 1;
                });
              }
            }
            var _htParts = [];
            var _htKeys = Object.keys(_htTags).sort(function(a, b) { return _htTags[b] - _htTags[a]; });
            for (var _htki = 0; _htki < Math.min(4, _htKeys.length); _htki++) {
              _htParts.push(_htKeys[_htki].substring(0, 4) + ':' + _htTags[_htKeys[_htki]]);
            }
            var _htStr = _htParts.length > 0 ? ' | ' + _htParts.join(' ') : '';
            handEvStr = '<div class="tm-detail-row" style="font-size:10px;opacity:0.6;padding:1px 0">' +
              '\ud83c\udcb3 \u0420\u0443\u043a\u0430: avg ' + _hAvg + '/100' +
              (_hBest ? ', \u2b50' + _bestShort + '(' + _hBestScore + ')' : '') +
              _htStr + '</div>';
          }
        }
        // Card requirement tracker — cards blocked by global params
        var reqStr = '';
        if (tp.cardsInHand && tp.cardsInHand.length > 0 && typeof TM_CARD_TAG_REQS !== 'undefined') {
          var _gOxy = state.game && typeof state.game.oxygenLevel === 'number' ? state.game.oxygenLevel : 0;
          var _gTemp = state.game && typeof state.game.temperature === 'number' ? state.game.temperature : -30;
          var _gOceans = state.game && typeof state.game.oceans === 'number' ? state.game.oceans : 0;
          var _blocked = [];
          var _unlocking = [];
          for (var _rqi = 0; _rqi < tp.cardsInHand.length; _rqi++) {
            var _rqn = tp.cardsInHand[_rqi].name || tp.cardsInHand[_rqi];
            var _rq = TM_CARD_TAG_REQS[_rqn];
            if (!_rq) continue;
            // Check global requirements
            if (_rq.oxygen && _rq.oxygen.min && _gOxy < _rq.oxygen.min) {
              var _oxyGap = _rq.oxygen.min - _gOxy;
              var _rqShort = _rqn.length > 10 ? _rqn.substring(0, 9) + '.' : _rqn;
              if (_oxyGap <= 3) _unlocking.push(_rqShort + ' O\u2082' + _rq.oxygen.min + '(-' + _oxyGap + ')');
              else _blocked.push(_rqShort);
            }
            if (_rq.oxygen && _rq.oxygen.max && _gOxy > _rq.oxygen.max) {
              _blocked.push((_rqn.length > 10 ? _rqn.substring(0, 9) + '.' : _rqn) + ' O\u2082\u2264' + _rq.oxygen.max);
            }
            if (_rq.temperature && _rq.temperature.min && _gTemp < _rq.temperature.min) {
              var _tempGap = (_rq.temperature.min - _gTemp) / 2; // 2°C per step
              var _rqShort2 = _rqn.length > 10 ? _rqn.substring(0, 9) + '.' : _rqn;
              if (_tempGap <= 3) _unlocking.push(_rqShort2 + ' T' + _rq.temperature.min + '(-' + _tempGap + ')');
              else _blocked.push(_rqShort2);
            }
            if (_rq.temperature && _rq.temperature.max && _gTemp > _rq.temperature.max) {
              _blocked.push((_rqn.length > 10 ? _rqn.substring(0, 9) + '.' : _rqn) + ' T\u2264' + _rq.temperature.max);
            }
            if (_rq.oceans && _rq.oceans.min && _gOceans < _rq.oceans.min) {
              var _ocGap = _rq.oceans.min - _gOceans;
              var _rqShort3 = _rqn.length > 10 ? _rqn.substring(0, 9) + '.' : _rqn;
              if (_ocGap <= 2) _unlocking.push(_rqShort3 + ' Oc' + _rq.oceans.min + '(-' + _ocGap + ')');
              else _blocked.push(_rqShort3);
            }
          }
          var _reqParts = [];
          if (_unlocking.length > 0) _reqParts.push('\ud83d\udd13 ' + _unlocking.join(', '));
          if (_blocked.length > 0 && _blocked.length <= 3) _reqParts.push('\ud83d\udd12 ' + _blocked.join(', '));
          else if (_blocked.length > 3) _reqParts.push('\ud83d\udd12 ' + _blocked.length + ' \u0437\u0430\u0431\u043b\u043e\u043a.');
          if (_reqParts.length > 0) {
            reqStr = '<div class="tm-detail-row" style="font-size:10px;opacity:0.55;padding:1px 0">' + _reqParts.join(' | ') + '</div>';
          }
        }
        // Opponent comparison
        var oppStr = '';
        var players = (state.players || []);
        if (players.length > 1) {
          var maxOppIncome = 0;
          var maxOppName = '';
          for (var oi = 0; oi < players.length; oi++) {
            var opp = players[oi];
            if (opp.color === tp.color) continue;
            var oppTr = opp.terraformRating || 0;
            var oppProd = opp.megaCreditProduction != null ? opp.megaCreditProduction : (opp.megaCreditsProduction || 0);
            var oppInc = oppTr + oppProd;
            if (oppInc > maxOppIncome) {
              maxOppIncome = oppInc;
              maxOppName = opp.name || opp.color || '?';
            }
          }
          if (maxOppIncome > 0) {
            var incomeDiff = income - maxOppIncome;
            var diffSign = incomeDiff > 0 ? '+' : '';
            oppStr = ' vs ' + maxOppName + ' +' + maxOppIncome + ' (' + diffSign + incomeDiff + ')';
          }
        }
        // Income composition: Reds vulnerability
        var redsWarning = '';
        if (income > 0) {
          var trPct = Math.round((tr / income) * 100);
          var isRedsRuling = state.game && state.game.turmoil && state.game.turmoil.ruling === 'Reds';
          var isRedsNext = state.game && state.game.turmoil && (state.game.turmoil.dominant || state.game.turmoil.dominantParty) === 'Reds';
          // Warn if TR is >65% of income AND Reds are relevant
          if (trPct >= 65 && (isRedsRuling || isRedsNext)) {
            redsWarning = '<div class="tm-detail-row" style="font-size:10px;color:#e74c3c;opacity:0.75;padding:1px 0">\u26d4 TR=' + trPct + '% \u0434\u043e\u0445\u043e\u0434\u0430 \u2014 \u0443\u044f\u0437\u0432\u0438\u043c \u043a Reds</div>';
          }
        }
        // Next gen projection
        var nextMc = income; // TR + MC prod (resources reset = earned fresh)
        var energy = tp.energy || 0;
        var heat = tp.heat || 0;
        var plants = tp.plants || 0;
        // Heat/plant projection: assume we don't spend resources this gen (worst case = current stockpile carries over)
        var totalHeat = heat + energy; // energy converts to heat at production
        var heatGainPerGen = hProd + eProd; // steady-state heat per gen
        var projParts = [];
        // Next gen: MC + steel/ti production
        var nextSteel = steel + sProd;
        var nextTi = ti + tiProd;
        var nextBudget = nextMc + nextSteel * sv + nextTi * tv;
        var mcPart = '\u2192' + nextMc + 'MC';
        if (sProd > 0 || nextSteel > 0) mcPart += ' +' + nextSteel + 'S';
        if (tiProd > 0 || nextTi > 0) mcPart += ' +' + nextTi + 'Ti';
        mcPart += ' (' + nextBudget + ')';
        projParts.push(mcPart);
        // Plants/heat projection — resources after production
        var nextPlants = plants + pProd;
        var nextHeat = heat + energy + hProd + eProd; // energy→heat + new production
        var _resParts = [];
        if (nextPlants >= 6) _resParts.push(nextPlants + '\ud83c\udf31');
        if (nextHeat >= 6 && !tempMaxed) _resParts.push(nextHeat + '\ud83d\udd25');
        if (_resParts.length > 0) projParts.push(_resParts.join(' '));
        var tempMaxed = state.game && typeof state.game.temperature === 'number' && state.game.temperature >= 8;
        var oxyMaxed = state.game && typeof state.game.oxygenLevel === 'number' && state.game.oxygenLevel >= 14;
        if (!tempMaxed) {
          if (totalHeat >= 8) {
            projParts.push(Math.floor(totalHeat / 8) + '\u00d7\ud83d\udd25TR');
          } else if (heatGainPerGen > 0) {
            var heatNeeded = 8 - totalHeat;
            var gensToHeatTR = Math.ceil(heatNeeded / heatGainPerGen);
            if (gensToHeatTR <= 3) {
              projParts.push('\ud83d\udd25TR in ' + gensToHeatTR);
            }
          }
        }
        if (!oxyMaxed) {
          if (plants >= 8) {
            projParts.push('\ud83c\udf3f!');
          } else if (pProd > 0) {
            var plantsNeeded = 8 - plants;
            var gensToGreen = Math.ceil(plantsNeeded / pProd);
            if (gensToGreen <= 3) {
              projParts.push('\ud83c\udf3f in ' + gensToGreen);
            }
          }
        }
        var projStr = projParts.length > 1 ? ' | ' + projParts.join(' ') : ' | ' + projParts[0];
        // Production ROI — total remaining income from production
        var prodRoiStr = '';
        if (timing.estimatedGens >= 1 && timing.estimatedGens <= 5) {
          var totalProdIncome = prod * timing.estimatedGens; // MC prod * remaining gens
          var steelIncome = sProd * sv * timing.estimatedGens;
          var tiIncome = tiProd * tv * timing.estimatedGens;
          var totalROI = totalProdIncome + steelIncome + tiIncome;
          if (totalROI > 10 && timing.estimatedGens > 1) { // hide in last gen
            var roiParts = [];
            if (totalProdIncome > 0) roiParts.push(totalProdIncome + 'MC');
            if (steelIncome > 0) roiParts.push(steelIncome + 'S(' + sProd + '\u00d7' + timing.estimatedGens + ')');
            if (tiIncome > 0) roiParts.push(tiIncome + 'Ti(' + tiProd + '\u00d7' + timing.estimatedGens + ')');
            prodRoiStr = '<div class="tm-detail-row" style="font-size:10px;opacity:0.55;padding:1px 0">' +
              '\ud83d\udcca Prod ROI(' + timing.estimatedGens + 'g): ~' + totalROI + ' MC (' + roiParts.join('+') + ')</div>';
          }
        }
        // Active card discounts from tableau (skip in last gen)
        var discountStr = '';
        if (tp.tableau && typeof TM_CARD_DISCOUNTS !== 'undefined' && !isLastGen) {
          var discParts = [];
          for (var _di = 0; _di < tp.tableau.length; _di++) {
            var _dn = tp.tableau[_di].name || tp.tableau[_di];
            var _dd = TM_CARD_DISCOUNTS[_dn];
            if (!_dd) continue;
            for (var _dk in _dd) {
              var _shortDn = _dn.length > 10 ? _dn.substring(0, 9) + '.' : _dn;
              var _label = _dk === '_all' ? 'all' : (_dk === '_req' ? 'req' : _dk);
              discParts.push('-' + _dd[_dk] + ' ' + _label);
              break;
            }
          }
          // Also check steelValue/titaniumValue upgrades
          if (sv > 2) discParts.push('S=' + sv);
          if (tv > 3) discParts.push('Ti=' + tv);
          if (discParts.length > 0) discountStr = '<div class="tm-detail-row" style="font-size:10px;opacity:0.55;padding:1px 0">\ud83d\udcb0 ' + discParts.join(', ') + '</div>';
        }
        // VP velocity with trend (from victoryPointsByGeneration)
        var vpVelStr = '';
        var vpByGen = tp.victoryPointsByGeneration;
        if (vpByGen && vpByGen.length >= 2 && typeof gen === 'number' && gen >= 3) {
          var recentVP = vpByGen[vpByGen.length - 1] - vpByGen[Math.max(0, vpByGen.length - 3)];
          var gensSpan = Math.min(2, vpByGen.length - 1);
          var vpPerGen = gensSpan > 0 ? (recentVP / gensSpan).toFixed(1) : 0;
          // Trend: compare current velocity vs 2 gens ago velocity
          var trendIcon = '';
          if (vpByGen.length >= 5) {
            var olderVP = vpByGen[vpByGen.length - 3] - vpByGen[Math.max(0, vpByGen.length - 5)];
            var olderVel = olderVP / 2;
            if (vpPerGen > olderVel + 1) trendIcon = '\u2197'; // accelerating
            else if (vpPerGen < olderVel - 1) trendIcon = '\u2198'; // decelerating
          }
          vpVelStr = ' | VP/gen:' + vpPerGen + trendIcon;
          // MC/VP efficiency — how much MC per VP gained
          if (vpPerGen > 0) {
            var mcPerVP = Math.round(income / vpPerGen);
            vpVelStr += ' (' + mcPerVP + 'MC/VP)';
          }
        }
        // Card VP counter — total VP from cards on tableau (skip in last gen)
        var cardVpStr = '';
        if (tp.tableau && !isLastGen) {
          var cardVpTotal = 0;
          var vpCards = [];
          for (var _cvi = 0; _cvi < tp.tableau.length; _cvi++) {
            var _cvCard = tp.tableau[_cvi];
            var _cvn = _cvCard.name || _cvCard;
            var _cvVal = 0;
            // Use TM_CARD_VP for accurate VP (includes resource-based)
            if (typeof TM_CARD_VP !== 'undefined' && TM_CARD_VP[_cvn]) {
              var _cvDef = TM_CARD_VP[_cvn];
              if (_cvDef.type === 'static') {
                _cvVal = _cvDef.vp || 0;
              } else if (_cvDef.type === 'per_resource') {
                var _cvRes = _cvCard.resources || 0;
                _cvVal = Math.floor(_cvRes / (_cvDef.per || 1));
              } else if (_cvDef.type === 'per_tag') {
                var _cvTags = Array.isArray(tp.tags) ? {} : (tp.tags || {});
                if (Array.isArray(tp.tags)) { for (var _cti = 0; _cti < tp.tags.length; _cti++) _cvTags[tp.tags[_cti].tag] = tp.tags[_cti].count; }
                _cvVal = Math.floor((_cvTags[_cvDef.tag] || 0) / (_cvDef.per || 1));
              }
            } else if (typeof TM_CARD_EFFECTS !== 'undefined' && TM_CARD_EFFECTS[_cvn] && TM_CARD_EFFECTS[_cvn].vp) {
              _cvVal = typeof TM_CARD_EFFECTS[_cvn].vp === 'number' ? TM_CARD_EFFECTS[_cvn].vp : 0;
            }
            if (_cvVal > 0) {
              cardVpTotal += _cvVal;
              var _cvShort = _cvn.length > 8 ? _cvn.substring(0, 7) + '.' : _cvn;
              vpCards.push(_cvShort + ':' + _cvVal);
            }
          }
          if (cardVpTotal > 0) {
            var cardVpDetail = vpCards.length <= 4 ? ' (' + vpCards.join(', ') + ')' : ' (' + vpCards.length + ' cards)';
            cardVpStr = '<div class="tm-detail-row" style="font-size:10px;opacity:0.55;padding:1px 0">\u2663 Card VP: ' + cardVpTotal + cardVpDetail + '</div>';
          }
        }
        // Wasted production detector — with MC estimate
        var wasteStr = '';
        var wasteItems = [];
        var wasteMC = 0;
        var estGens = timing.estimatedGens || 1;
        // isLastGen already declared at top of function
        // Skip waste detection in last gen (can't fix it anymore)
        if (!isLastGen && tempMaxed && hProd > 0) {
          wasteItems.push('\ud83d\udd25heat ' + hProd + '/gen');
          wasteMC += hProd * estGens; // heat is ~1 MC each
        }
        if (!isLastGen && tempMaxed && eProd > 0) {
          // Check if energy has consumers (blue cards that use energy)
          var hasEnergyConsumer = false;
          if (tp.tableau && typeof TM_CARD_EFFECTS !== 'undefined') {
            for (var _wei = 0; _wei < tp.tableau.length; _wei++) {
              var _wen = tp.tableau[_wei].name || tp.tableau[_wei];
              var _wef = TM_CARD_EFFECTS[_wen];
              if (_wef && _wef.usesEnergy) { hasEnergyConsumer = true; break; }
            }
          }
          if (!hasEnergyConsumer) {
            wasteItems.push('\u26a1energy ' + eProd + '/gen');
            wasteMC += eProd * estGens;
          }
        }
        if (!isLastGen && oxyMaxed && pProd > 0) {
          wasteItems.push('\ud83c\udf3fplants ' + pProd + '/gen');
          wasteMC += pProd * 2 * estGens; // plants ~2 MC each
        }
        // Stockpile waste: energy sitting with no consumers and temp maxed
        if (!isLastGen && tempMaxed && energy > 4 && !tp.actionsThisGeneration) {
          wasteItems.push('\u26a1' + energy + ' energy \u0437\u0430\u0441\u0442\u043e\u0439');
        }
        if (wasteItems.length > 0) {
          var wasteTotalStr = wasteMC > 5 ? ' (~' + wasteMC + ' MC \u0437\u0430 ' + estGens + ' gen)' : '';
          wasteStr = '<div class="tm-detail-row" style="font-size:10px;color:#e74c3c;opacity:0.75;padding:1px 0">\u26a0 \u0412\u043f\u0443\u0441\u0442\u0443\u044e: ' + wasteItems.join(', ') + wasteTotalStr + '</div>';
        }
        // Action tempo — how many actions taken this gen
        var tempoStr = '';
        var actionsUsed = (tp.actionsThisGeneration || []).length;
        if (actionsUsed > 0) {
          // Count total available blue actions
          var totalBlue = 0;
          if (tp.tableau && typeof TM_CARD_EFFECTS !== 'undefined') {
            for (var _ati = 0; _ati < tp.tableau.length; _ati++) {
              var _atn = tp.tableau[_ati].name || tp.tableau[_ati];
              if (TM_CARD_EFFECTS[_atn] && TM_CARD_EFFECTS[_atn].action) totalBlue++;
            }
          }
          tempoStr = '<div class="tm-detail-row" style="font-size:10px;opacity:0.5;padding:1px 0">\ud83c\udfac Actions: ' + actionsUsed + (totalBlue > 0 ? ' (blue: ' + (totalBlue - new Set(tp.actionsThisGeneration || []).size) + '/' + totalBlue + ' left)' : '') + '</div>';
        }
        // Timer display (for Escape Velocity awareness)
        var timerStr = '';
        if (tp.timer && tp.timer.sumMs > 0) {
          var _tMin = Math.floor(tp.timer.sumMs / 60000);
          var _tSec = Math.floor((tp.timer.sumMs % 60000) / 1000);
          timerStr = '<div class="tm-detail-row" style="font-size:10px;opacity:0.4;padding:1px 0">\u23f1 ' + _tMin + ':' + (_tSec < 10 ? '0' : '') + _tSec + '</div>';
        }
        // Ruling bonus in income display
        var incomeStr = '+' + income + '/gen';
        if (_rulingBonus > 0) {
          incomeStr = '+' + income + '/gen (' + (income - _rulingBonus) + '+' + _rulingBonus + '\ud83c\udfdb)';
        }
        // Tag summary (compact — skip in last gen)
        var tagStr = '';
        if (tp.tags && !isLastGen) {
          var _tsMap = Array.isArray(tp.tags) ? {} : tp.tags;
          if (Array.isArray(tp.tags)) { for (var _tsi = 0; _tsi < tp.tags.length; _tsi++) { _tsMap[tp.tags[_tsi].tag] = tp.tags[_tsi].count; } }
          var _tagIcons = { building: '\ud83c\udfed', space: '\ud83d\ude80', science: '\ud83d\udd2c', plant: '\ud83c\udf3f', earth: '\ud83c\udf0d', jovian: '\ud83e\ude90', venus: '\u2640', animal: '\ud83d\udc3e', microbe: '\ud83e\udda0', event: '\u26a1', power: '\u26a1', city: '\ud83c\udfd9' };
          var _topTags = [];
          var _tagKeys = Object.keys(_tsMap).sort(function(a, b) { return (_tsMap[b] || 0) - (_tsMap[a] || 0); });
          for (var _tki = 0; _tki < Math.min(5, _tagKeys.length); _tki++) {
            var _tk = _tagKeys[_tki];
            if (_tsMap[_tk] > 0 && _tk !== 'wild') {
              _topTags.push((_tagIcons[_tk] || _tk) + _tsMap[_tk]);
            }
          }
          // Tableau size + event count (for milestones)
          var _tableauSize = tp.tableau ? tp.tableau.length : 0;
          var _eventCount = _tsMap['event'] || 0;
          var _tabInfo = _tableauSize + '\ud83c\udcb3';
          if (_eventCount > 0) _tabInfo += ' ' + _eventCount + 'ev';
          // Tiles on board
          var _myTiles = state.game && state.game.playerTiles && state.game.playerTiles[tp.color];
          if (_myTiles) {
            if (_myTiles.cities > 0) _tabInfo += ' ' + _myTiles.cities + '\ud83c\udfd9';
            if (_myTiles.greeneries > 0) _tabInfo += ' ' + _myTiles.greeneries + '\ud83c\udf3f';
          }
          // Production summary
          var _prodParts = [];
          if (prod > 0) _prodParts.push(prod + 'MC');
          if (sProd > 0) _prodParts.push(sProd + 'S');
          if (tiProd > 0) _prodParts.push(tiProd + 'Ti');
          if (pProd > 0) _prodParts.push(pProd + '\ud83c\udf31');
          if (eProd > 0) _prodParts.push(eProd + '\u26a1');
          if (hProd > 0) _prodParts.push(hProd + '\ud83d\udd25');
          var _prodStr = _prodParts.length > 0 ? ' | \u2699' + _prodParts.join(' ') : '';
          if (_topTags.length > 0) {
            tagStr = '<div class="tm-detail-row" style="font-size:10px;opacity:0.5;padding:1px 0">' + _tabInfo + ' | ' + _topTags.join(' ') + _prodStr + '</div>';
          }
        }
        return '<div style="font-size:12px;opacity:0.8;padding:2px 0">' +
          'Gen ' + gen + ' | ' + resStr + ' (' + budget + ') | TR ' + tr + ' | ' + incomeStr + vpVelStr + playStr + oppStr +
          '</div><div class="tm-detail-row" style="font-size:11px;opacity:0.65;padding:1px 0">' +
          (isLastGen ? '' : 'Next' + projStr) + '</div>' + handEvStr + reqStr + prodRoiStr + discountStr + cardVpStr + tagStr + wasteStr + redsWarning + tempoStr + timerStr;
      })()
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
