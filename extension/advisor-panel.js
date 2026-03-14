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
      return JSON.parse(raw);
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

    var dzClass = 'tm-dz-' + timing.dangerZone;
    var dzIcon = timing.dangerZone === 'red' ? '\ud83d\udd34' : (timing.dangerZone === 'yellow' ? '\ud83d\udfe1' : '\ud83d\udfe2');

    var vpClass = timing.vpLead > 0 ? 'positive' : (timing.vpLead < 0 ? 'negative' : 'neutral');
    var vpSign = timing.vpLead > 0 ? '+' : '';

    el.innerHTML =
      '<div class="tm-advisor-timing ' + dzClass + '">' +
        dzIcon + ' ' + timing.steps + ' \u0448\u0430\u0433\u043e\u0432, ~' + timing.estimatedGens + ' \u043f\u043e\u043a.' +
        '<div class="tm-advisor-timing-detail">' +
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
            return parts.join(' ') + wgtParam;
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

        return headerHtml + barHtml + legendHtml + compHtml + oppProjHtml + scoreboardHtml;
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
            handEvStr = '<div class="tm-detail-row" style="font-size:10px;opacity:0.6;padding:1px 0">' +
              '\ud83c\udcb3 \u0420\u0443\u043a\u0430: avg ' + _hAvg + '/100' +
              (_hBest ? ', \u2b50' + _bestShort + '(' + _hBestScore + ')' : '') +
              '</div>';
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
          if (totalROI > 10) {
            var roiParts = [];
            if (totalProdIncome > 0) roiParts.push(totalProdIncome + 'MC');
            if (steelIncome > 0) roiParts.push(steelIncome + 'S(' + sProd + '\u00d7' + timing.estimatedGens + ')');
            if (tiIncome > 0) roiParts.push(tiIncome + 'Ti(' + tiProd + '\u00d7' + timing.estimatedGens + ')');
            prodRoiStr = '<div class="tm-detail-row" style="font-size:10px;opacity:0.55;padding:1px 0">' +
              '\ud83d\udcca Prod ROI(' + timing.estimatedGens + 'g): ~' + totalROI + ' MC (' + roiParts.join('+') + ')</div>';
          }
        }
        // Active card discounts from tableau
        var discountStr = '';
        if (tp.tableau && typeof TM_CARD_DISCOUNTS !== 'undefined') {
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
        // VP velocity (from victoryPointsByGeneration)
        var vpVelStr = '';
        var vpByGen = tp.victoryPointsByGeneration;
        if (vpByGen && vpByGen.length >= 2 && typeof gen === 'number' && gen >= 3) {
          var recentVP = vpByGen[vpByGen.length - 1] - vpByGen[Math.max(0, vpByGen.length - 3)];
          var gensSpan = Math.min(2, vpByGen.length - 1);
          var vpPerGen = gensSpan > 0 ? (recentVP / gensSpan).toFixed(1) : 0;
          vpVelStr = ' | VP/gen:' + vpPerGen;
        }
        // Card VP counter — total VP from cards on tableau (static + resource-based)
        var cardVpStr = '';
        if (tp.tableau) {
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
        if (tempMaxed && hProd > 0) {
          wasteItems.push('\ud83d\udd25heat ' + hProd + '/gen');
          wasteMC += hProd * estGens; // heat is ~1 MC each
        }
        if (tempMaxed && eProd > 0) {
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
        if (oxyMaxed && pProd > 0) {
          wasteItems.push('\ud83c\udf3fplants ' + pProd + '/gen');
          wasteMC += pProd * 2 * estGens; // plants ~2 MC each
        }
        // Stockpile waste: energy sitting with no consumers and temp maxed
        if (tempMaxed && energy > 4 && !tp.actionsThisGeneration) {
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
        // Tag summary (compact — only top tags)
        var tagStr = '';
        if (tp.tags) {
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
          'Next' + projStr + '</div>' + handEvStr + reqStr + prodRoiStr + discountStr + cardVpStr + tagStr + wasteStr + redsWarning + tempoStr + timerStr;
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
    var el = document.getElementById('tm-advisor-alerts');
    if (!el) return;

    var lines = [];
    var tp = state && state.thisPlayer;

    // ── Turmoil ──
    var turmoil = state && state.game && state.game.turmoil;
    if (turmoil) {
      var partyIcons = { Mars: '\ud83d\udd34', Scientists: '\ud83d\udd2c', Unity: '\ud83c\udf0d', Greens: '\ud83c\udf3f', Kelvinists: '\ud83d\udd25', Reds: '\u26d4' };
      var partyBonuses = {
        'Mars': 'MC prod +1 per Mars tag',
        'Scientists': '-1 MC per req card',
        'Unity': '-2 MC per space tag card',
        'Greens': '+2 MC per plant/microbe/animal tag',
        'Kelvinists': 'heat prod +1 per heat prod',
        'Reds': '+3 MC \u043a TR/\u0433\u043b\u043e\u0431\u0430\u043b\u043a\u0430\u043c'
      };
      var ruling = turmoil.ruling;
      if (ruling) {
        var rIcon = partyIcons[ruling] || '\ud83c\udfdb';
        var rBonus = partyBonuses[ruling] || '';
        // Calculate personal MC impact from ruling party
        var rulingImpact = '';
        if (tp && tp.tags) {
          var tags = tp.tags;
          var tagMap = Array.isArray(tags) ? {} : tags;
          if (Array.isArray(tags)) { for (var _rti = 0; _rti < tags.length; _rti++) { tagMap[tags[_rti].tag] = tags[_rti].count; } }
          var impactMC = 0;
          if (ruling === 'Mars') impactMC = tagMap['mars'] || 0; // +1 MC prod per Mars tag
          else if (ruling === 'Scientists') {
            // -1 MC per card with requirements; estimate ~60% of hand has reqs
            var handN = tp.cardsInHandNbr || (tp.cardsInHand ? tp.cardsInHand.length : 0);
            impactMC = -Math.round(handN * 0.6);
          }
          else if (ruling === 'Unity') impactMC = -(2 * (tagMap['space'] || 0)); // -2 MC per space tag (NOT per card — it's per tag played this gen... approximate)
          else if (ruling === 'Greens') impactMC = 2 * ((tagMap['plant'] || 0) + (tagMap['microbe'] || 0) + (tagMap['animal'] || 0));
          else if (ruling === 'Kelvinists') impactMC = tp.heatProduction || 0; // +1 heat prod per heat prod
          else if (ruling === 'Reds') impactMC = 3; // +3 MC cost per TR/global raise
          if (impactMC !== 0 && ruling !== 'Reds') {
            rulingImpact = ' (\u0442\u0435\u0431\u0435: ' + (impactMC > 0 ? '+' : '') + impactMC + ')';
          }
        }
        lines.push(rIcon + ' ' + ruling + (rBonus ? ' \u2014 ' + rBonus : '') + rulingImpact);
      }
      // Show dominant party (next ruling) if different, with personal impact
      var dominant = turmoil.dominant || turmoil.dominantParty;
      if (dominant && dominant !== ruling) {
        var dIcon = partyIcons[dominant] || '\ud83c\udfdb';
        var dBonus = partyBonuses[dominant] || '';
        // Calculate personal impact from next ruling
        var nextImpact = '';
        if (tp && tp.tags) {
          var _ntm = Array.isArray(tp.tags) ? {} : tp.tags;
          if (Array.isArray(tp.tags)) { for (var _nti = 0; _nti < tp.tags.length; _nti++) { _ntm[tp.tags[_nti].tag] = tp.tags[_nti].count; } }
          var nImpact = 0;
          if (dominant === 'Mars') nImpact = _ntm['mars'] || _ntm['building'] || 0;
          else if (dominant === 'Greens') nImpact = 2 * ((_ntm['plant'] || 0) + (_ntm['microbe'] || 0) + (_ntm['animal'] || 0));
          else if (dominant === 'Kelvinists') nImpact = tp.heatProduction || 0;
          else if (dominant === 'Unity') nImpact = (_ntm['venus'] || 0) + (_ntm['earth'] || 0) + (_ntm['jovian'] || 0);
          else if (dominant === 'Scientists') nImpact = _ntm['science'] || 0;
          else if (dominant === 'Reds') nImpact = -3;
          if (nImpact !== 0) {
            nextImpact = ' (\u0442\u0435\u0431\u0435: ' + (nImpact > 0 ? '+' : '') + nImpact + ')';
          }
        }
        lines.push(dIcon + ' Next: ' + dominant + (dBonus ? ' \u2014 ' + dBonus : '') + nextImpact);
      }

      // ── Reds Tax Calculator ──
      if (ruling === 'Reds') {
        var _tempMax = state.game && typeof state.game.temperature === 'number' && state.game.temperature >= 8;
        var _oxyMax = state.game && typeof state.game.oxygenLevel === 'number' && state.game.oxygenLevel >= 14;
        var _oceansMax = state.game && typeof state.game.oceans === 'number' && state.game.oceans >= 9;
        var taxItems = [];
        if (!_oceansMax) taxItems.push('\ud83c\udf0a\u043e\u043a\u0435\u0430\u043d 21');
        if (!_tempMax) taxItems.push('\u2604\ufe0f\u0442\u0435\u043c\u043f 17');
        if (!_oxyMax) taxItems.push('\ud83c\udf3f\u0433\u0440\u0438\u043d 26');
        if (!_tempMax) taxItems.push('\ud83d\udd25heat\u2192TR 8H+3MC');
        if (!_oxyMax) taxItems.push('\ud83c\udf3fplants\u2192O\u2082 8P+3MC');
        if (taxItems.length > 0) {
          lines.push('\u26d4 Reds tax: ' + taxItems.join(' | '));
        }
      }

      // ── Delegate Play Advisor ──
      var tParties = turmoil.parties;
      if (tParties && Array.isArray(tParties) && tp) {
        var myColor = tp.color;
        // Check if player has lobby (free delegate available)
        var hasLobby = turmoil.lobby && Array.isArray(turmoil.lobby) && turmoil.lobby.indexOf(myColor) >= 0;
        // Count my reserve delegates
        var myReserve = 0;
        if (turmoil.reserve && Array.isArray(turmoil.reserve)) {
          for (var _dri = 0; _dri < turmoil.reserve.length; _dri++) {
            if (turmoil.reserve[_dri].color === myColor) myReserve = turmoil.reserve[_dri].number || 0;
          }
        }
        // If has lobby or reserve > 0, suggest delegate placement
        if (hasLobby || myReserve > 0) {
          // Build party state: my delegates, leader, total
          var partyStates = [];
          for (var _dpi = 0; _dpi < tParties.length; _dpi++) {
            var _dp = tParties[_dpi];
            var pName = _dp.name;
            var myDels = 0;
            var totalDels = 0;
            var leaderDels = 0;
            if (_dp.delegates) {
              for (var _ddi = 0; _ddi < _dp.delegates.length; _ddi++) {
                totalDels += _dp.delegates[_ddi].number || 0;
                if (_dp.delegates[_ddi].color === myColor) myDels = _dp.delegates[_ddi].number || 0;
                if (_dp.partyLeader && _dp.delegates[_ddi].color === _dp.partyLeader) leaderDels = _dp.delegates[_ddi].number || 0;
              }
            }
            var isLeader = _dp.partyLeader === myColor;
            var isDominant = pName === dominant;
            partyStates.push({ name: pName, myDels: myDels, totalDels: totalDels, leaderDels: leaderDels, isLeader: isLeader, isDominant: isDominant });
          }

          // Scoring: where to place delegate
          var bestAction = null;
          var bestScore = -999;
          for (var _dsi = 0; _dsi < partyStates.length; _dsi++) {
            var ps = partyStates[_dsi];
            var score = 0;
            var reason = '';

            // Become leader of dominant party = chairman next gen (+1 influence)
            if (ps.isDominant && !ps.isLeader && ps.myDels + 1 > ps.leaderDels) {
              score += 15;
              reason = '\u2192 chairman';
            }
            // Become leader of dominant party where already close
            if (ps.isDominant && !ps.isLeader && ps.myDels + 1 === ps.leaderDels) {
              score += 8;
              reason = '\u0431\u043b\u0438\u0437\u043a\u043e \u043a leader';
            }
            // Push beneficial party to dominant
            var isBeneficial = false;
            if (tp.tags) {
              var _tMap = Array.isArray(tp.tags) ? {} : tp.tags;
              if (Array.isArray(tp.tags)) { for (var _tmi = 0; _tmi < tp.tags.length; _tmi++) { _tMap[tp.tags[_tmi].tag] = tp.tags[_tmi].count; } }
              if (ps.name === 'Kelvinists' && (tp.heatProduction || 0) >= 3) isBeneficial = true;
              if (ps.name === 'Mars' && (_tMap['mars'] || _tMap['building'] || 0) >= 4) isBeneficial = true;
              if (ps.name === 'Greens' && ((_tMap['plant'] || 0) + (_tMap['microbe'] || 0) + (_tMap['animal'] || 0)) >= 4) isBeneficial = true;
              if (ps.name === 'Unity' && ((_tMap['space'] || 0) + (_tMap['earth'] || 0)) >= 4) isBeneficial = true;
              if (ps.name === 'Scientists' && (_tMap['science'] || 0) >= 3) isBeneficial = true;
            }
            if (isBeneficial) {
              score += 6;
              if (!reason) reason = '\u0432\u044b\u0433\u043e\u0434\u043d\u0430\u044f \u043f\u0430\u0440\u0442\u0438\u044f';
            }

            // Block opponent rush with Reds
            if (ps.name === 'Reds' && timing.dangerZone !== 'green' && lead > 3) {
              score += 10;
              reason = '\u0437\u0430\u043c\u0435\u0434\u043b\u0438\u0442\u044c \u0440\u0430\u0448';
            }
            // Don't suggest Reds if we're behind
            if (ps.name === 'Reds' && lead < -3) {
              score -= 10;
            }

            if (score > bestScore) {
              bestScore = score;
              bestAction = { party: ps.name, reason: reason, myDels: ps.myDels, totalDels: ps.totalDels };
            }
          }

          // Show delegate status + recommendation
          var delStatus = hasLobby ? 'Lobby \u2714' : ('Reserve: ' + myReserve);
          var delCost = hasLobby ? '\u0431\u0435\u0441\u043f\u043b.' : '5 MC';
          if (bestAction && bestScore > 0) {
            var pIcon = partyIcons[bestAction.party] || '';
            lines.push('\ud83d\uddf3 ' + delStatus + ' \u2192 ' + pIcon + bestAction.party +
              ' (' + delCost + ') ' + (bestAction.reason || ''));
          } else if (hasLobby) {
            lines.push('\ud83d\uddf3 Lobby \u2714 (\u0435\u0441\u0442\u044c \u0431\u0435\u0441\u043f\u043b. \u0434\u0435\u043b\u0435\u0433\u0430\u0442)');
          }
        }
      }

      // ── Influence tracking ──
      var myInfluence = 0;
      if (turmoil.chairman === myColor) myInfluence++;
      // Party leader of dominant party
      if (tParties && dominant) {
        for (var _ipi = 0; _ipi < tParties.length; _ipi++) {
          if (tParties[_ipi].name === dominant && tParties[_ipi].partyLeader === myColor) {
            myInfluence++;
            break;
          }
        }
      }
      // Note: some cards/preludes give influence but we can't easily detect those here
      if (turmoil.coming || turmoil.distant) {
        lines.push('\ud83d\udee1 Influence: ' + myInfluence);
      }

      // ── Global Events with impact preview ──
      var EVENT_EFFECTS = {
        'Pandemic': function(t, inf) { var b = Math.min(5, t['building'] || 0); return { mc: -3 * Math.max(0, b - inf), desc: '-3MC\u00d7(build' + b + '-inf' + inf + ')' }; },
        'Riots': function(t, inf, s) { var c = Math.min(5, (s.game && s.game.playerTiles && s.game.playerTiles[s.thisPlayer.color]) ? s.game.playerTiles[s.thisPlayer.color].cities : 0); return { mc: -4 * Math.max(0, c - inf), desc: '-4MC\u00d7(city' + c + '-inf' + inf + ')' }; },
        'EcoSabotage': function(t, inf, s) { var p = s.thisPlayer.plants || 0; var keep = 3 + inf; return { mc: 0, plants: -Math.max(0, p - keep), desc: '\u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u2264' + keep + ' plants' }; },
        'GlobalDustStorm': function(t, inf) { var b = Math.min(5, t['building'] || 0); return { mc: -2 * Math.max(0, b - inf), desc: 'heat\u21920, -2MC\u00d7(build' + b + '-inf' + inf + ')' }; },
        'SpinoffProducts': function(t, inf) { var sc = Math.min(5, t['science'] || 0); return { mc: 2 * (sc + inf), desc: '+2MC\u00d7(sci' + sc + '+inf' + inf + ')' }; },
        'AsteroidMining': function(t, inf) { var j = Math.min(5, t['jovian'] || 0); return { ti: j + inf, desc: '+' + (j + inf) + ' ti' }; },
        'InterplanetaryTrade': function(t, inf) { var sp = Math.min(5, t['space'] || 0); return { mc: 2 * (sp + inf), desc: '+2MC\u00d7(space' + sp + '+inf' + inf + ')' }; },
        'HomeworldSupport': function(t, inf) { var e = Math.min(5, t['earth'] || 0); return { mc: 2 * (e + inf), desc: '+2MC\u00d7(earth' + e + '+inf' + inf + ')' }; },
        'Sabotage': function(t, inf) { return { desc: '-1 energy prod, -1 steel prod, +' + inf + ' steel' }; },
        'RedInfluence': function(t, inf, s) { var tr = s.thisPlayer.terraformRating || 0; var sets = Math.min(5, Math.max(0, Math.floor((tr - 10) / 5))); return { mc: -3 * sets, desc: '-3MC\u00d7' + sets + '(TR' + tr + '), +' + inf + ' MC prod' }; },
        'GenerousFunding': function(t, inf, s) { var tr = s.thisPlayer.terraformRating || 0; var sets = Math.min(5, Math.max(0, Math.floor((tr - 15) / 5))); return { mc: 2 * (sets + inf), desc: '+2MC\u00d7(TR sets ' + sets + '+inf' + inf + ')' }; },
        'StrongSociety': function(t, inf, s) { var c = Math.min(5, (s.game && s.game.playerTiles && s.game.playerTiles[s.thisPlayer.color]) ? s.game.playerTiles[s.thisPlayer.color].cities : 0); return { mc: 2 * (c + inf), desc: '+2MC\u00d7(city' + c + '+inf' + inf + ')' }; },
        'Revolution': function(t, inf) { return { desc: '\u0432\u044b\u0441\u043e\u043a\u0438\u0439 TR = -2 TR' }; },
        'VolcanicEruptions': function(t, inf) { return { desc: '+2 temp, +' + inf + ' heat prod' }; },
        'SuccessfulOrganisms': function(t, inf, s) { var pp = Math.min(5, s.thisPlayer.plantProduction || 0); return { plants: pp + inf, desc: '+' + (pp + inf) + ' plants' }; },
        'MudSlides': function(t, inf) { return { desc: '-4MC \u043d\u0430 \u0442\u0430\u0439\u043b \u0443 \u043e\u043a\u0435\u0430\u043d\u0430 (inf \u0437\u0430\u0449\u0438\u0449\u0430\u0435\u0442)' }; },
        'CelebrityLeaders': function(t, inf, s) { var ev = Math.min(5, t['event'] || 0); return { mc: 2 * (ev + inf), desc: '+2MC\u00d7(event' + ev + '+inf' + inf + ')' }; },
      };

      // Helper: get tag map
      var _evTagMap = {};
      if (tp && tp.tags) {
        if (Array.isArray(tp.tags)) { for (var _eti = 0; _eti < tp.tags.length; _eti++) { _evTagMap[tp.tags[_eti].tag] = tp.tags[_eti].count; } }
        else { _evTagMap = tp.tags; }
      }

      if (turmoil.coming || turmoil.distant) {
        var evLines = [];
        var showEvent = function(label, evName) {
          if (!evName) return;
          var readable = evName.replace(/([A-Z])/g, ' $1').trim();
          var fn = EVENT_EFFECTS[evName];
          if (fn) {
            var impact = fn(_evTagMap, myInfluence, state);
            var mcColor = (impact.mc || 0) >= 0 ? '#2ecc71' : '#e74c3c';
            var mcStr = impact.mc ? ' <span style="color:' + mcColor + '">' + (impact.mc > 0 ? '+' : '') + impact.mc + 'MC</span>' : '';
            evLines.push(label + readable + mcStr + ' <span style="opacity:0.5">(' + impact.desc + ')</span>');
          } else {
            evLines.push(label + readable);
          }
        };
        showEvent('\u26a1 ', turmoil.coming);
        showEvent('\ud83d\udd2e ', turmoil.distant);
        lines.push(evLines.join('<br>'));
      }
    }

    // ── Turmoil Party Balance (compact) ──
    if (tParties && tParties.length > 0 && tp) {
      var pIcons = { 'Mars First': '\ud83d\udd34', 'Scientists': '\ud83d\udd2c', 'Unity': '\ud83c\udf0d', 'Greens': '\ud83c\udf3f', 'Kelvinists': '\ud83d\udd25', 'Reds': '\u26d4' };
      var partyLine = [];
      for (var _pbi = 0; _pbi < tParties.length; _pbi++) {
        var _pb = tParties[_pbi];
        var _pbTotal = 0;
        var _pbMy = 0;
        if (_pb.delegates) {
          for (var _pbd = 0; _pbd < _pb.delegates.length; _pbd++) {
            _pbTotal += _pb.delegates[_pbd].number || 0;
            if (_pb.delegates[_pbd].color === myColor) _pbMy = _pb.delegates[_pbd].number || 0;
          }
        }
        if (_pbTotal === 0) continue;
        var _pbIcon = pIcons[_pb.name] || '';
        var _pbLeader = _pb.partyLeader === myColor ? '\u2605' : '';
        var _pbDom = (_pb.name === dominant) ? '\u25b8' : '';
        partyLine.push(_pbDom + _pbIcon + _pbMy + '/' + _pbTotal + _pbLeader);
      }
      if (partyLine.length > 0) {
        // Delegate reserve info
        var _delRes = '';
        if (turmoil.reserve && Array.isArray(turmoil.reserve)) {
          var _totalRes = 0;
          var _myRes = 0;
          for (var _dri2 = 0; _dri2 < turmoil.reserve.length; _dri2++) {
            _totalRes += turmoil.reserve[_dri2].number || 0;
            if (turmoil.reserve[_dri2].color === myColor) _myRes = turmoil.reserve[_dri2].number || 0;
          }
          _delRes = ' | res:' + _myRes + '/' + _totalRes;
        }
        lines.push('\ud83d\uddf3 ' + partyLine.join(' ') + _delRes);
      }
    }

    // ── Milestone alerts: close to claiming (distance ≤ 2) ──
    var milestones = (state && state.game && state.game.milestones) || [];
    var claimed = new Set(((state && state.game && state.game.claimedMilestones) || []).map(function(cm) { return cm.name; }));
    var claimedCount = claimed.size;
    var slotsLeft = 3 - claimedCount;
    if (claimedCount < 3 && TM_ADVISOR.evaluateMilestone) {
      // Show slots urgency
      if (slotsLeft <= 1) {
        lines.push('\ud83d\udea8 Milestone: ' + slotsLeft + ' \u0441\u043b\u043e\u0442!');
      }
      for (var mi = 0; mi < milestones.length; mi++) {
        var m = milestones[mi];
        if (claimed.has(m.name)) continue;
        var mEv = TM_ADVISOR.evaluateMilestone(m.name, state);
        if (!mEv) continue;
        var dist = mEv.threshold - mEv.myScore;
        // Progress bar for all milestones
        var _msProgress = Math.min(mEv.myScore, mEv.threshold);
        var _msPct = Math.round((_msProgress / mEv.threshold) * 100);
        var _msBar = '<span style="display:inline-block;width:40px;height:6px;background:#333;border-radius:3px;vertical-align:middle;margin:0 3px">' +
          '<span style="display:block;width:' + _msPct + '%;height:100%;background:' + (dist <= 0 ? '#2ecc71' : (dist <= 2 ? '#f1c40f' : '#555')) + ';border-radius:3px"></span></span>';
        if (dist <= 0) {
          // Show if opponent is also close — urgency to claim first
          var msRival = '';
          var _msPlayers = (state.players || []);
          for (var _mri = 0; _mri < _msPlayers.length; _mri++) {
            if (_msPlayers[_mri].color === tp.color) continue;
            var _mrCheck = MILESTONE_SCORE_FN_CHECK(m.name, _msPlayers[_mri], state);
            if (_mrCheck && _mrCheck.dist <= 0) {
              var _mrName = (_msPlayers[_mri].name || _msPlayers[_mri].color || '?');
              if (_mrName.length > 7) _mrName = _mrName.substring(0, 6) + '.';
              msRival = ' \u26a0' + _mrName + ' \u0442\u043e\u0436\u0435!';
              break;
            }
          }
          var msCost = 8 + claimedCount * 8; // 8, 16, 24
          lines.push('\ud83d\udfe2 ' + m.name + _msBar + ' \u043c\u043e\u0436\u043d\u043e \u0432\u0437\u044f\u0442\u044c! (' + msCost + ' MC)' + msRival);
        } else if (dist <= 2) {
          lines.push('\ud83d\udfe1 ' + m.name + _msBar + ' ' + mEv.myScore + '/' + mEv.threshold + ' (\u2212' + dist + ')');
        } else if (dist <= 4 && _msPct >= 40) {
          // Show milestones we're making progress on (>40% done, within 4)
          lines.push('<span style="opacity:0.5">' + m.name + _msBar + ' ' + mEv.myScore + '/' + mEv.threshold + '</span>');
        }
      }
    }

    // ── Award leaderboard (all awards — funded highlighted, unfunded show fund recommendation) ──
    var funded = (state && state.game && state.game.fundedAwards) || [];
    var awards = (state && state.game && state.game.awards) || [];
    var fundedSet = new Set(funded.map(function(f) { return f.name; }));
    var fundedCount = funded.length;
    // Award slots urgency
    var awardSlotsLeft = 3 - fundedCount;
    if (awardSlotsLeft > 0 && awardSlotsLeft <= 2) {
      var awardCostMap = [8, 14, 20];
      var nextAwardCost = awardCostMap[fundedCount] || 20;
      lines.push('\ud83c\udfc5 Awards: ' + awardSlotsLeft + ' \u0441\u043b\u043e\u0442, \u0441\u043b\u0435\u0434. ' + nextAwardCost + ' MC');
    }
    if (TM_ADVISOR.evaluateAward) {
      // Show all awards: funded first, then unfunded
      var allAwardNames = [];
      for (var _afi = 0; _afi < funded.length; _afi++) allAwardNames.push(funded[_afi].name);
      for (var _aui = 0; _aui < awards.length; _aui++) {
        if (!fundedSet.has(awards[_aui].name)) allAwardNames.push(awards[_aui].name);
      }
      var awardParts = [];
      var bestFundAward = null;
      var bestFundMargin = 0;
      for (var _ai = 0; _ai < allAwardNames.length; _ai++) {
        var _an = allAwardNames[_ai];
        var _aEv = TM_ADVISOR.evaluateAward(_an, state);
        if (!_aEv) continue;
        var _isFunded = fundedSet.has(_an);
        var _shortName = _an.length > 8 ? _an.substring(0, 7) + '.' : _an;
        var _icon = _aEv.winning ? '\u2705' : (_aEv.tied ? '\ud83d\udfe1' : '\u274c');
        if (_isFunded) {
          // Show expected VP: 5 VP first, 2 VP second, 0 otherwise (tied = shared)
          var _vpAward = _aEv.winning ? 5 : (_aEv.tied ? 3 : (_aEv.myScore >= _aEv.bestOppScore * 0.7 ? 2 : 0));
          // Check if we're second place (not winning but close enough to someone who beats us)
          if (!_aEv.winning && !_aEv.tied && _aEv.margin >= -2) _vpAward = 2;
          awardParts.push(_icon + _shortName + ':' + _aEv.myScore + 'v' + _aEv.bestOppScore + '(' + _vpAward + 'VP)');
        } else {
          // Track best unfunded award to fund
          if (_aEv.winning && _aEv.margin > bestFundMargin) {
            bestFundMargin = _aEv.margin;
            bestFundAward = _an;
          }
          // Only show unfunded where we're winning significantly
          if (_aEv.winning && _aEv.margin >= 2) {
            awardParts.push('\u2b50' + _shortName + ':' + _aEv.myScore + 'v' + _aEv.bestOppScore);
          }
        }
      }
      if (awardParts.length > 0) {
        lines.push('\ud83c\udfc5 ' + awardParts.join(' '));
      }
      // Award threat: warn if opponent is close to overtaking you in a funded award
      for (var _ati = 0; _ati < funded.length; _ati++) {
        var _atName = funded[_ati].name;
        var _atEv = TM_ADVISOR.evaluateAward(_atName, state);
        if (!_atEv) continue;
        // If we're winning but margin is thin (1-2), someone could overtake
        if (_atEv.winning && _atEv.margin <= 2 && _atEv.margin > 0) {
          var _threatName = _atEv.bestOppName || '?';
          if (_threatName.length > 8) _threatName = _threatName.substring(0, 7) + '.';
          lines.push('\u26a0 ' + _atName + ': ' + _threatName + ' \u0431\u043b\u0438\u0437\u043a\u043e (\u2212' + _atEv.margin + ')');
        }
        // If we're losing a funded award and it's close, show catchup hint
        if (!_atEv.winning && !_atEv.tied && _atEv.margin >= -2 && _atEv.margin < 0) {
          lines.push('\ud83d\udca1 ' + _atName + ': \u0434\u043e\u0433\u043e\u043d\u044f\u0435\u043c (' + _atEv.myScore + ' vs ' + _atEv.bestOppScore + ')');
        }
      }
      // Fund recommendation
      if (fundedCount < 3 && bestFundAward && bestFundMargin >= 2 && tp) {
        var awardCosts = [8, 14, 20];
        var fundCost = awardCosts[fundedCount] || 20;
        if ((tp.megaCredits || 0) >= fundCost) {
          lines.push('\ud83c\udfc6 Fund ' + bestFundAward + '? (+' + bestFundMargin + ', ' + fundCost + ' MC)');
        }
      }
    }

    // ── Colony trade recommendation (top-2 + track info) ──
    var colonies = (state && state.game && state.game.colonies) || [];
    if (tp && colonies.length > 0) {
      var fleets = tp.fleetSize || 0;
      var tradesUsed = tp.tradesThisGeneration || 0;
      var canTrade = fleets > tradesUsed;
      var fleetsLeft = fleets - tradesUsed;
      if (canTrade && TM_ADVISOR.scoreColonyTrade) {
        var colScores = [];
        for (var ci = 0; ci < colonies.length; ci++) {
          var col = colonies[ci];
          if (!col.isActive && col.isActive !== undefined) continue;
          var cVal = TM_ADVISOR.scoreColonyTrade(col, state);
          // Visitor = who traded last (track will be lower if recently visited)
          var _visitorName = '';
          if (col.visitor) {
            for (var _vni = 0; _vni < players.length; _vni++) {
              if (players[_vni].color === col.visitor) {
                _visitorName = (players[_vni].name || players[_vni].color || '').substring(0, 4);
                break;
              }
            }
          }
          colScores.push({ name: col.name || '?', val: cVal, track: col.trackPosition || 0, visitor: _visitorName });
        }
        colScores.sort(function(a, b) { return b.val - a.val; });
        // Show top-2 (or top-1 if only 1 fleet)
        var showCount = Math.min(fleetsLeft >= 2 ? 2 : 1, colScores.length);
        var tradeParts = [];
        for (var _tci = 0; _tci < showCount; _tci++) {
          var _tc = colScores[_tci];
          if (_tc.val <= 0) break;
          var _tn = _tc.name.length > 8 ? _tc.name.substring(0, 7) + '.' : _tc.name;
          var _visInfo = _tc.visitor ? '\u2190' + _tc.visitor : '';
          tradeParts.push(_tn + '(' + _tc.track + ')=' + Math.round(_tc.val) + _visInfo);
        }
        if (tradeParts.length > 0) {
          // Check for trade competition — opponents with unused fleets
          var tradeRivals = [];
          for (var _tri = 0; _tri < players.length; _tri++) {
            var _trp = players[_tri];
            if (_trp.color === tp.color) continue;
            var _trFleets = _trp.fleetSize || 0;
            var _trUsed = _trp.tradesThisGeneration || 0;
            if (_trFleets > _trUsed) {
              var _trName = (_trp.name || _trp.color || '?');
              if (_trName.length > 7) _trName = _trName.substring(0, 6) + '.';
              tradeRivals.push(_trName);
            }
          }
          var rivalStr = tradeRivals.length > 0 ? ' \u26a0' + tradeRivals.join(',') + ' \u0442\u043e\u0436\u0435' : '';
          lines.push('\ud83d\ude80 Trade' + (fleetsLeft > 1 ? ' \u00d7' + fleetsLeft : '') + ': ' + tradeParts.join(' > ') + rivalStr);
        }
      }
    }

    // ── Colony bonus summary — what you get from opponent trades ──
    if (tp && colonies.length > 0) {
      var myColonies = [];
      for (var _coli = 0; _coli < colonies.length; _coli++) {
        var _colc = colonies[_coli];
        if (_colc.colonies) {
          for (var _cold = 0; _cold < _colc.colonies.length; _cold++) {
            if (_colc.colonies[_cold] === tp.color) {
              myColonies.push(_colc.name || '?');
              break;
            }
          }
        }
      }
      if (myColonies.length > 0) {
        var COLONY_BONUS = {
          'Luna': '+2MC', 'Europa': '+1MC', 'Ganymede': '+1\ud83c\udf31', 'Io': '+2\ud83d\udd25',
          'Callisto': '+3\u26a1', 'Ceres': '+2\u2692', 'Triton': '+1Ti', 'Pluto': '+1\ud83c\udcb3',
          'Enceladus': '+1\ud83e\udda0', 'Miranda': '+1\ud83d\udc3e', 'Titan': '+1\u2601',
          'Leavitt': '+1\ud83c\udcb3', 'Iapetus': '-1MC/card', 'Mercury': '+2MC',
          'Pallas': '+MC/del', 'Titania': '-3MC all', 'Hygiea': ''
        };
        var bonusParts = myColonies.map(function(c) {
          return c + (COLONY_BONUS[c] ? '(' + COLONY_BONUS[c] + ')' : '');
        });
        lines.push('\ud83c\udf0d \u041a\u043e\u043b\u043e\u043d\u0438\u0438: ' + bonusParts.join(', '));
      }
    }

    // ── Colony build recommendation ──
    if (tp && colonies.length > 0) {
      var myColCount = tp.coloniesCount || 0;
      // Max 3 colony builds. Show recommendation if < 3 and MC >= 17
      if (myColCount < 3 && (tp.megaCredits || 0) >= 17) {
        // Find colonies where we haven't built
        var COLONY_BUILD_VALUES = {
          'Luna': 15, 'Europa': 14, 'Leavitt': 13, 'Io': 11, 'Ganymede': 10,
          'Pluto': 10, 'Triton': 9, 'Ceres': 9, 'Miranda': 8, 'Callisto': 7,
          'Enceladus': 7, 'Titan': 6, 'Iapetus': 12, 'Mercury': 10, 'Pallas': 8,
          'Hygiea': 6, 'Titania': 5
        };
        var bestBuild = null;
        var bestBuildVal = 0;
        for (var _cbi = 0; _cbi < colonies.length; _cbi++) {
          var _cbc = colonies[_cbi];
          var _cbName = _cbc.name || '';
          // Check if we already have a colony here (max 1 per player per colony)
          var _alreadyBuilt = false;
          if (_cbc.colonies) {
            for (var _cbd = 0; _cbd < _cbc.colonies.length; _cbd++) {
              if (_cbc.colonies[_cbd] === tp.color) { _alreadyBuilt = true; break; }
            }
          }
          if (_alreadyBuilt) continue;
          // Check max 3 per colony
          if (_cbc.colonies && _cbc.colonies.length >= 3) continue;
          var _cbVal = COLONY_BUILD_VALUES[_cbName] || 5;
          if (_cbVal > bestBuildVal) { bestBuildVal = _cbVal; bestBuild = _cbName; }
        }
        if (bestBuild && bestBuildVal >= 8) {
          lines.push('\ud83c\udf0d Build: ' + bestBuild + ' (17 MC)');
        }
      }
    }

    // ── Global push analysis — who benefits from pushing globals ──
    if (players.length > 1 && tp) {
      var _gTemp = state.game && typeof state.game.temperature === 'number' ? state.game.temperature : -30;
      var _gOxy = state.game && typeof state.game.oxygenLevel === 'number' ? state.game.oxygenLevel : 0;
      if (_gTemp < 8 || _gOxy < 14) {
        var pushWarnings = [];
        for (var _gpi = 0; _gpi < players.length; _gpi++) {
          var _gpp = players[_gpi];
          if (_gpp.color === tp.color) continue;
          var _gpName = (_gpp.name || _gpp.color || '?');
          if (_gpName.length > 8) _gpName = _gpName.substring(0, 7) + '.';
          // Heat engine benefits from temp staying low
          var _gpHeat = (_gpp.heatProduction || 0) + (_gpp.energyProduction || 0);
          if (_gTemp < 8 && _gpHeat >= 5) {
            pushWarnings.push('\u2604\ufe0f\u043d\u0435 \u043f\u0443\u0448 temp: ' + _gpName + ' \ud83d\udd25' + _gpHeat + '/gen');
          }
          // Plant engine benefits from oxy staying low
          var _gpPlants = _gpp.plantProduction || 0;
          if (_gOxy < 14 && _gpPlants >= 5) {
            pushWarnings.push('\ud83c\udf3f\u043d\u0435 \u043f\u0443\u0448 O\u2082: ' + _gpName + ' \ud83c\udf31' + _gpPlants + '/gen');
          }
        }
        // Only show if we're NOT the one with the big engine
        var myHeatEng = (tp.heatProduction || 0) + (tp.energyProduction || 0);
        var myPlantEng = tp.plantProduction || 0;
        for (var _pwi = 0; _pwi < pushWarnings.length; _pwi++) {
          if (pushWarnings[_pwi].includes('temp') && myHeatEng >= 5) continue;
          if (pushWarnings[_pwi].includes('O\u2082') && myPlantEng >= 5) continue;
          lines.push(pushWarnings[_pwi]);
        }
      }
    }

    // ── Resource conversion alerts ──
    if (tp) {
      var _heat = tp.heat || 0;
      var _plants = tp.plants || 0;
      var _tempMaxed = state && state.game && typeof state.game.temperature === 'number' && state.game.temperature >= 8;
      var _oxyMaxed = state && state.game && typeof state.game.oxygenLevel === 'number' && state.game.oxygenLevel >= 14;
      if (_heat >= 8 && !_tempMaxed) {
        lines.push('\ud83d\udd25 ' + _heat + ' heat \u2192 TR!');
      }
      if (_plants >= 8 && !_oxyMaxed) {
        var _plantCost = 8; // default, 7 for EcoLine
        if (tp.tableau) {
          for (var _pi = 0; _pi < tp.tableau.length; _pi++) {
            if ((tp.tableau[_pi].name || tp.tableau[_pi]) === 'Ecoline') _plantCost = 7;
          }
        }
        if (_plants >= _plantCost) {
          lines.push('\ud83c\udf3f ' + _plants + ' plants \u2192 greenery!');
        }
      }
    }

    // ── Opponent pass/action tracker ──
    var players = (state && state.players) || [];
    if (players.length > 1 && tp) {
      var passedNames = [];
      var activeOpps = [];
      for (var _pti = 0; _pti < players.length; _pti++) {
        var _ptp = players[_pti];
        if (_ptp.color === tp.color) continue;
        var _ptName = (_ptp.name || _ptp.color || '?');
        if (_ptName.length > 8) _ptName = _ptName.substring(0, 7) + '.';
        if (_ptp.isActive === false) {
          passedNames.push(_ptName);
        } else {
          var _ptActions = (_ptp.actionsThisGeneration || []).length;
          if (_ptActions > 0) activeOpps.push(_ptName + ':' + _ptActions + 'act');
        }
      }
      var _passLine = [];
      if (passedNames.length > 0) _passLine.push('\u23f8 Passed: ' + passedNames.join(', '));
      if (activeOpps.length > 0) _passLine.push('\ud83c\udfac ' + activeOpps.join(' '));
      if (_passLine.length > 0) lines.push(_passLine.join(' | '));
    }

    // ── Opponent budget threats (can they claim milestone / fund award?) ──
    if (players.length > 1 && tp) {
      var _msClaimed2 = (state.game && state.game.claimedMilestones) || [];
      var _awFunded2 = (state.game && state.game.fundedAwards) || [];
      if (_msClaimed2.length < 3 || _awFunded2.length < 3) {
        var _nextMsCost = 8 + _msClaimed2.length * 8;
        var _nextAwCost = [8, 14, 20][_awFunded2.length] || 20;
        for (var _bti = 0; _bti < players.length; _bti++) {
          var _btp = players[_bti];
          if (_btp.color === tp.color) continue;
          var _btMC = _btp.megaCredits || 0;
          var _btName = (_btp.name || _btp.color || '?');
          if (_btName.length > 7) _btName = _btName.substring(0, 6) + '.';
          var _btThreats = [];
          if (_msClaimed2.length < 3 && _btMC >= _nextMsCost) _btThreats.push('M(' + _nextMsCost + ')');
          if (_awFunded2.length < 3 && _btMC >= _nextAwCost) _btThreats.push('A(' + _nextAwCost + ')');
          if (_btThreats.length > 0 && _btMC >= 30) {
            lines.push('\ud83d\udcb0 ' + _btName + ' ' + _btMC + 'MC \u2014 \u043c\u043e\u0436\u0435\u0442 ' + _btThreats.join('/'));
          }
        }
      }
    }

    // ── VP Velocity comparison ──
    if (players.length > 1 && tp) {
      var myVpByGen = tp.victoryPointsByGeneration;
      var myVel = 0;
      if (myVpByGen && myVpByGen.length >= 3) {
        var _mvSpan = Math.min(3, myVpByGen.length - 1);
        myVel = (myVpByGen[myVpByGen.length - 1] - myVpByGen[myVpByGen.length - 1 - _mvSpan]) / _mvSpan;
      }
      var fastestOpp = null;
      var fastestVel = 0;
      for (var _vvi = 0; _vvi < players.length; _vvi++) {
        var _vvp = players[_vvi];
        if (_vvp.color === tp.color) continue;
        var _vvByGen = _vvp.victoryPointsByGeneration;
        if (_vvByGen && _vvByGen.length >= 3) {
          var _vvSpan = Math.min(3, _vvByGen.length - 1);
          var _vvVel = (_vvByGen[_vvByGen.length - 1] - _vvByGen[_vvByGen.length - 1 - _vvSpan]) / _vvSpan;
          if (_vvVel > fastestVel) {
            fastestVel = _vvVel;
            fastestOpp = (_vvp.name || _vvp.color || '?');
            if (fastestOpp.length > 8) fastestOpp = fastestOpp.substring(0, 7) + '.';
          }
        }
      }
      // Warn if opponent gains VP faster than you
      if (fastestVel > myVel + 1 && fastestVel > 3) {
        lines.push('\ud83d\udca8 ' + fastestOpp + ' \u043d\u0430\u0431\u0438\u0440\u0430\u0435\u0442 ' + fastestVel.toFixed(1) + ' VP/gen (\u0442\u044b: ' + myVel.toFixed(1) + ')');
      }
    }

    // ── Opponent threats ──
    if (players.length > 1 && tp) {
      for (var oi = 0; oi < players.length; oi++) {
        var opp = players[oi];
        if (opp.color === tp.color) continue;
        var oppName = (opp.name || opp.color || '?');
        if (oppName.length > 8) oppName = oppName.substring(0, 7) + '.';

        // Opponent milestone threat (within 1 of claiming)
        if (claimedCount < 3 && TM_ADVISOR.evaluateMilestone) {
          for (var omi = 0; omi < milestones.length; omi++) {
            if (claimed.has(milestones[omi].name)) continue;
            var oMs = MILESTONE_SCORE_FN_CHECK(milestones[omi].name, opp, state);
            if (oMs !== null && oMs.dist <= 1 && oMs.dist >= 0) {
              lines.push('\u26a0 ' + oppName + ' \u2192 ' + milestones[omi].name + ' (' + oMs.score + '/' + oMs.threshold + ')');
            }
          }
        }
      }
      // Opponent engine classification + key cards
      var KEY_OPP_CARDS = {
        'Birds': '\ud83d\udc26', 'Fish': '\ud83d\udc1f', 'Predators': '\ud83e\udd81', 'Livestock': '\ud83d\udc04',
        'Ants': '\ud83d\udc1c', 'Pets': '\ud83d\udc3e', 'Penguins': '\ud83d\udc27',
        'Venusian Animals': '\ud83e\udda0', 'Small Animals': '\ud83d\udc3f',
        'AI Central': '\ud83e\udde0', 'Mars University': '\ud83c\udf93', 'Olympus Conference': '\ud83c\udfdb',
        'Commercial District': '\ud83c\udfe2', 'Capital': '\ud83c\udfd9', 'Luna Metropolis': '\ud83c\udf19',
        'Robotic Workforce': '\ud83e\udd16', 'Earth Catapult': '\ud83d\ude80',
        'Anti-Gravity Technology': '\u2b50',
      };
      // Tag category sets for strategy classification
      var SPACE_TAGS = new Set(['space', 'jovian']);
      var BIO_TAGS = new Set(['plant', 'animal', 'microbe']);
      var SCIENCE_TAGS = new Set(['science']);
      for (var _koi = 0; _koi < players.length; _koi++) {
        var _kopp = players[_koi];
        if (_kopp.color === tp.color) continue;
        var _koppName = (_kopp.name || _kopp.color || '?');
        if (_koppName.length > 8) _koppName = _koppName.substring(0, 7) + '.';

        // Classify strategy from tags + production
        var strats = [];
        if (_kopp.tags) {
          var _otMap = Array.isArray(_kopp.tags) ? {} : _kopp.tags;
          if (Array.isArray(_kopp.tags)) { for (var _oti = 0; _oti < _kopp.tags.length; _oti++) { _otMap[_kopp.tags[_oti].tag] = _kopp.tags[_oti].count; } }
          var spaceCnt = (_otMap['space'] || 0) + (_otMap['jovian'] || 0);
          var bioCnt = (_otMap['plant'] || 0) + (_otMap['animal'] || 0) + (_otMap['microbe'] || 0);
          var sciCnt = _otMap['science'] || 0;
          var buildCnt = _otMap['building'] || 0;
          var earthCnt = _otMap['earth'] || 0;
          if (spaceCnt >= 4) strats.push('space' + spaceCnt);
          if (bioCnt >= 4) strats.push('bio' + bioCnt);
          if (sciCnt >= 3) strats.push('sci' + sciCnt);
          if (buildCnt >= 5) strats.push('build' + buildCnt);
          if (earthCnt >= 3) strats.push('earth' + earthCnt);
        }
        // Production signals
        var _oProd = [];
        var _oTiProd = _kopp.titaniumProduction || 0;
        var _oStProd = _kopp.steelProduction || 0;
        var _oPProd = _kopp.plantProduction || 0;
        var _oHProd = _kopp.heatProduction || 0;
        if (_oTiProd >= 3) _oProd.push('ti' + _oTiProd);
        if (_oStProd >= 4) _oProd.push('st' + _oStProd);
        if (_oPProd >= 4) _oProd.push('pl' + _oPProd);
        if (_oHProd >= 4) _oProd.push('h' + _oHProd);

        // Key cards + VP resource tracking
        var _keyCards = [];
        var _vpResCards = [];
        if (_kopp.tableau) {
          for (var _kci = 0; _kci < _kopp.tableau.length; _kci++) {
            var _kcard = _kopp.tableau[_kci];
            var _kcn = _kcard.name || _kcard;
            if (KEY_OPP_CARDS[_kcn]) _keyCards.push(KEY_OPP_CARDS[_kcn]);
            // Track VP from resources on cards
            if (typeof TM_CARD_VP !== 'undefined' && TM_CARD_VP[_kcn] && TM_CARD_VP[_kcn].type === 'per_resource') {
              var _kRes = _kcard.resources || 0;
              if (_kRes > 0) {
                var _kPer = TM_CARD_VP[_kcn].per || 1;
                var _kVP = Math.floor(_kRes / _kPer);
                if (_kVP > 0) {
                  var _kShort = _kcn.length > 8 ? _kcn.substring(0, 7) + '.' : _kcn;
                  _vpResCards.push(_kShort + ':' + _kVP + 'VP');
                }
              }
            }
          }
        }

        // Detect corporation from tableau
        var _oppCorp = '';
        if (_kopp.tableau) {
          for (var _oci = 0; _oci < _kopp.tableau.length; _oci++) {
            var _ocn = _kopp.tableau[_oci].name || _kopp.tableau[_oci];
            if (typeof TM_RATINGS !== 'undefined' && TM_RATINGS[_ocn] && TM_RATINGS[_ocn].t === 'corp') {
              _oppCorp = _ocn;
              break;
            }
            // Fallback: corp is usually first card, or has cardType
            if (_kopp.tableau[_oci].cardType === 'corp') {
              _oppCorp = _ocn;
              break;
            }
          }
        }
        // Corp short abilities
        var CORP_HINTS = {
          'Ecoline': '\ud83c\udf3f7P=green', 'Helion': '\ud83d\udd25=MC', 'Thorgate': '\u26a1-3',
          'PhoboLog': 'Ti+1', 'Point Luna': 'Earth=draw', 'Credicor': '\u226520=-4',
          'Tharsis Republic': 'city=MC+', 'Interplanetary Cinematics': 'event+2',
          'Inventrix': 'req\u00b12', 'Mining Guild': 'steel+', 'Teractor': 'Earth-3',
          'Saturn Systems': 'Jovian=MC+', 'Aridor': 'tag=MC+', 'Arklight': 'animal+',
          'Splice': '\ud83e\udda0tag=MC', 'Robinson Industries': 'prod+MC', 'Manutech': 'prod=res',
          'Viron': 'blue\u00d72', 'Celestic': 'floater VP', 'Stormcraft': 'floater=heat',
          'Polyphemos': 'buy5 play-5', 'Poseidon': 'col=MC+', 'Lakefront': 'ocean+MC',
          'Pristar': '-TR=MC', 'PhilAres': 'tile\u2192res',
        };

        // Hand size + income
        var _oHand = _kopp.cardsInHandNbr || 0;
        var _oTR = _kopp.terraformRating || 0;
        var _oMCProd = _kopp.megaCreditProduction || 0;
        var _oIncome = _oTR + _oMCProd;

        // Tiles on board
        var _oTiles = state.game && state.game.playerTiles && state.game.playerTiles[_kopp.color];
        var _oTileStr = '';
        if (_oTiles) {
          var _otParts = [];
          if (_oTiles.cities > 0) _otParts.push(_oTiles.cities + '\ud83c\udfd9');
          if (_oTiles.greeneries > 0) _otParts.push(_oTiles.greeneries + '\ud83c\udf3f');
          if (_otParts.length > 0) _oTileStr = _otParts.join('');
        }

        // Calculated VP (for hidden VP games)
        var _oCalcVP = '';
        var _oVpb = _kopp.victoryPointsBreakdown;
        if ((!_oVpb || _oVpb.total === 0) && _oTR > 10) {
          var _oCalc = calcPlayerVP(_kopp, state);
          if (_oCalc) _oCalcVP = '~' + _oCalc.total + 'VP';
        } else if (_oVpb && _oVpb.total > 0) {
          _oCalcVP = _oVpb.total + 'VP';
        }

        // Last card played
        var _lastCard = '';
        if (_kopp.lastCardPlayed) {
          var _lcn = _kopp.lastCardPlayed.length > 12 ? _kopp.lastCardPlayed.substring(0, 11) + '.' : _kopp.lastCardPlayed;
          _lastCard = '\u25b8' + _lcn;
        }

        // Build compact opponent line — 2 lines for clarity
        var oppLine1Parts = [];
        // Corp name (short)
        if (_oppCorp) {
          var _corpShort = _oppCorp.length > 10 ? _oppCorp.substring(0, 9) + '.' : _oppCorp;
          var _corpHint = CORP_HINTS[_oppCorp] || '';
          oppLine1Parts.push(_corpShort + (_corpHint ? '(' + _corpHint + ')' : ''));
        }
        // Core stats
        oppLine1Parts.push(_oCalcVP);
        oppLine1Parts.push(_oIncome + '/g');
        // Resources (compact)
        var _oMC = _kopp.megaCredits || 0;
        var _oSt = _kopp.steel || 0;
        var _oTi2 = _kopp.titanium || 0;
        var _oResStr = _oMC + 'MC';
        if (_oSt > 0) _oResStr += '+' + _oSt + 'S';
        if (_oTi2 > 0) _oResStr += '+' + _oTi2 + 'Ti';
        oppLine1Parts.push(_oResStr);
        oppLine1Parts.push(_oHand + '\ud83c\udcb3');
        if (_oTileStr) oppLine1Parts.push(_oTileStr);

        var oppLine2Parts = [];
        if (strats.length > 0) oppLine2Parts.push(strats.join(' '));
        if (_oProd.length > 0) oppLine2Parts.push(_oProd.join(' '));
        if (_keyCards.length > 0) oppLine2Parts.push(_keyCards.join(''));
        if (_vpResCards.length > 0) oppLine2Parts.push(_vpResCards.join(' '));
        if (_lastCard) oppLine2Parts.push(_lastCard);

        var oppLine = '\ud83d\udd0d ' + _koppName + ': ' + oppLine1Parts.filter(Boolean).join(' ');
        if (oppLine2Parts.length > 0) {
          oppLine += '<br><span style="opacity:0.5;padding-left:16px">' + oppLine2Parts.join(' | ') + '</span>';
        }
        lines.push(oppLine);
      }
    }

    el.innerHTML = lines.length > 0
      ? '<div class="tm-advisor-alerts">' + lines.map(function(l) { return '<div>' + l + '</div>'; }).join('') + '</div>'
      : '';
  }

  function renderActions(state) {
    var el = document.getElementById('tm-advisor-actions');
    if (!el) return;

    var tp = state && state.thisPlayer;
    if (!tp) { el.innerHTML = ''; return; }

    var items = [];
    var mc = tp.megaCredits || 0;
    var heat = tp.heat || 0;
    var plants = tp.plants || 0;
    var energy = tp.energy || 0;
    var tempMaxed = state.game && typeof state.game.temperature === 'number' && state.game.temperature >= 8;
    var oxyMaxed = state.game && typeof state.game.oxygenLevel === 'number' && state.game.oxygenLevel >= 14;
    var steps = TM_ADVISOR.remainingSteps ? TM_ADVISOR.remainingSteps(state) : 99;

    // Conversions (highest priority — free VP/TR)
    // Smart priority: if temp near max (≤2 steps), greenery more valuable
    var tempStepsLeft = timing.breakdown ? timing.breakdown.tempSteps : 99;
    var oxyStepsLeft = timing.breakdown ? timing.breakdown.oxySteps : 99;
    var heatPri = 95;
    var plantPri = 90;
    if (tempStepsLeft <= 2 && oxyStepsLeft > 2) { plantPri = 96; heatPri = 89; } // greenery first when temp almost done
    if (heat >= 8 && !tempMaxed) {
      var heatTRs = Math.floor(heat / 8);
      items.push({ icon: '\ud83d\udd25', text: 'Heat\u2192TR (' + heat + 'H = ' + heatTRs + 'TR)', pri: heatPri });
    }
    var plantCost = 8;
    if (tp.tableau) {
      for (var _ei = 0; _ei < tp.tableau.length; _ei++) {
        if (((tp.tableau[_ei].name || '') + '').toLowerCase() === 'ecoline') plantCost = 7;
      }
    }
    if (plants >= plantCost && !oxyMaxed) {
      var greenCount = Math.floor(plants / plantCost);
      items.push({ icon: '\ud83c\udf3f', text: 'Plants\u2192greenery (' + plants + 'P = ' + greenCount + '\ud83c\udf3f)', pri: plantPri });
    }

    // Colony trade
    var colonies = (state.game && state.game.colonies) || [];
    var fleets = tp.fleetSize || 0;
    var tradesUsed = tp.tradesThisGeneration || 0;
    if (colonies.length > 0 && fleets > tradesUsed) {
      items.push({ icon: '\ud83d\ude80', text: 'Trade (' + (fleets - tradesUsed) + ' fleet)', pri: 80 });
    }

    // Unused blue card actions — prioritized by VP value
    var usedActions = tp.actionsThisGeneration || [];
    var usedSet = new Set(usedActions);
    var unusedActions = [];
    // VP accumulators go first (Birds, Fish, etc.)
    var VP_ACCUM = new Set(['Birds', 'Fish', 'Predators', 'Livestock', 'Ants', 'Pets', 'Penguins',
      'Small Animals', 'Venusian Animals', 'Tardigrades', 'Decomposers', 'Regolith Eaters',
      'GHG Producing Bacteria', 'Nitrite Reducing Bacteria', 'Stratospheric Birds',
      'Dirigibles', 'Jovian Lanterns', 'Caretaker Contract', 'Floater Leasing']);
    if (tp.tableau) {
      for (var _ti = 0; _ti < tp.tableau.length; _ti++) {
        var _cn = tp.tableau[_ti].name || tp.tableau[_ti];
        var _cd = (typeof _cardData !== 'undefined' ? _cardData[_cn] : null) ||
                  (typeof TM_CARD_EFFECTS !== 'undefined' && TM_CARD_EFFECTS[_cn]) || null;
        if (_cd && _cd.action && !usedSet.has(_cn)) {
          var _isVP = VP_ACCUM.has(_cn);
          unusedActions.push({ name: _cn, vpPri: _isVP ? 1 : 0 });
        }
      }
    }
    if (unusedActions.length > 0) {
      // Sort: VP accumulators first, then alphabetical
      unusedActions.sort(function(a, b) { return b.vpPri - a.vpPri || a.name.localeCompare(b.name); });
      var actionNames = unusedActions.length <= 4
        ? unusedActions.map(function(a) {
            var n = a.name.length > 12 ? a.name.substring(0, 11) + '.' : a.name;
            return a.vpPri ? '\ud83d\udc3e' + n : n;
          }).join(', ')
        : unusedActions.filter(function(a) { return a.vpPri; }).map(function(a) { return '\ud83d\udc3e' + (a.name.length > 10 ? a.name.substring(0, 9) + '.' : a.name); }).join(', ') +
          ' +' + unusedActions.filter(function(a) { return !a.vpPri; }).length + ' more';
      items.push({ icon: '\ud83d\udd35', text: actionNames, pri: 70 });
    }

    // MC/VP efficiency: compare all VP-gaining options by cost
    var vpOptions = [];
    var redsTax = (state.game && state.game.turmoil && state.game.turmoil.ruling === 'Reds') ? 3 : 0;
    if (heat >= 8 && !tempMaxed) {
      vpOptions.push({ name: 'Heat\u2192TR', mc: 0, vp: 1 });
    }
    if (plants >= plantCost && !oxyMaxed) {
      vpOptions.push({ name: 'Plants\u2192\ud83c\udf3f', mc: 0, vp: 1.3 }); // greenery = 1 TR + ~0.3 VP adjacency
    }
    if (!oxyMaxed) {
      vpOptions.push({ name: 'SP \ud83c\udf3f', mc: 23 + redsTax, vp: 1.3 });
    }
    if (steps > 0) {
      vpOptions.push({ name: 'SP \ud83c\udf0a', mc: 18 + redsTax, vp: 1 });
      if (!tempMaxed) vpOptions.push({ name: 'SP \u2604', mc: 14 + redsTax, vp: 1 });
    }
    // Venus SP (if Venus not maxed)
    var venusMaxed = state.game && typeof state.game.venusScaleLevel === 'number' && state.game.venusScaleLevel >= 30;
    if (!venusMaxed && state.game && state.game.gameOptions && state.game.gameOptions.venusNextExtension) {
      vpOptions.push({ name: 'SP \u2640\ufe0f', mc: 15 + redsTax, vp: 1 });
    }
    // City SP (always available, ~2 VP from adjacency greeneries + placement bonus)
    vpOptions.push({ name: 'SP \ud83c\udfd9+\u0431\u043e\u043d\u0443\u0441', mc: 25, vp: 2 });
    // Show cheapest VP option with MC/VP rate
    if (vpOptions.length > 0) {
      vpOptions.sort(function(a, b) {
        var ratA = a.mc / (a.vp || 1);
        var ratB = b.mc / (b.vp || 1);
        return ratA - ratB;
      });
      var vpList = vpOptions.filter(function(o) { return o.mc <= mc || o.mc === 0; }).map(function(o) {
        var rate = o.mc > 0 ? Math.round(o.mc / o.vp) : 0;
        return o.name + (o.mc > 0 ? '(' + o.mc + ', ' + rate + '/VP)' : '(\u0431\u0435\u0441\u043f\u043b.)');
      });
      if (vpList.length === 0) {
        vpList = vpOptions.slice(0, 2).map(function(o) {
          return o.name + '(' + o.mc + ')';
        });
      }
      items.push({ icon: '\ud83d\udcb0', text: 'VP: ' + vpList.join(' < '), pri: 50 });
    }

    // Standard projects (when other options thin) — with steel discount
    var _sv = tp.steelValue || 2;
    var _steelMC = (tp.steel || 0) * _sv;
    if (steps > 0 && items.length <= 3) {
      // Greenery SP uses building steel
      var greenCost = 23 + redsTax;
      var greenEffective = Math.max(0, greenCost - _steelMC);
      if ((mc >= greenEffective || mc >= greenCost) && !oxyMaxed) {
        var greenLabel = _steelMC > 0 && _steelMC <= greenCost ? greenCost + ', \u0441 S=' + greenEffective : '' + greenCost;
        items.push({ icon: '\ud83c\udfed', text: 'SP Greenery (' + greenLabel + ' MC)', pri: 40 });
      } else if (mc >= 18 + redsTax) {
        items.push({ icon: '\ud83c\udf0a', text: 'SP Aquifer (' + (18 + redsTax) + ' MC)', pri: 35 });
      } else if (mc >= 14 + redsTax && !tempMaxed) {
        items.push({ icon: '\u2604', text: 'SP Asteroid (' + (14 + redsTax) + ' MC)', pri: 30 });
      }
    }

    // Cards in hand — show playable count with budget context
    var handSize = tp.cardsInHandNbr || (tp.cardsInHand ? tp.cardsInHand.length : 0);
    if (handSize > 0 && tp.cardsInHand && tp.cardsInHand.length > 0 && typeof TM_RATINGS !== 'undefined') {
      var _playable = [];
      var _tooExpensive = 0;
      for (var _hci = 0; _hci < tp.cardsInHand.length; _hci++) {
        var _hcn = tp.cardsInHand[_hci].name || tp.cardsInHand[_hci];
        var _hcr = TM_RATINGS[_hcn];
        var _hcc = _hcr ? (_hcr.c || 20) : 20;
        if (_hcc <= mc) {
          _playable.push({ name: _hcn, cost: _hcc, score: _hcr ? _hcr.s : 50 });
        } else {
          _tooExpensive++;
        }
      }
      _playable.sort(function(a, b) { return b.score - a.score; });
      var _handText = _playable.length + '/' + handSize + ' \u0438\u0433\u0440\u0430\u0431\u0435\u043b\u044c\u043d\u043e';
      if (_playable.length > 0 && _playable.length <= 3) {
        _handText += ': ' + _playable.map(function(p) {
          var n = p.name.length > 10 ? p.name.substring(0, 9) + '.' : p.name;
          return n + '(' + p.cost + ')';
        }).join(', ');
      }
      items.push({ icon: '\ud83c\udcb3', text: _handText, pri: 60 });
    } else if (handSize > 0) {
      items.push({ icon: '\ud83c\udcb3', text: handSize + ' cards', pri: 60 });
    }

    // Milestone claim reminder (high priority action)
    if (state.game) {
      var _msClaimed = new Set(((state.game.claimedMilestones) || []).map(function(cm) { return cm.name; }));
      if (_msClaimed.size < 3 && TM_ADVISOR.evaluateMilestone && (state.game.milestones || []).length > 0) {
        for (var _msi = 0; _msi < state.game.milestones.length; _msi++) {
          var _msn = state.game.milestones[_msi].name;
          if (_msClaimed.has(_msn)) continue;
          var _msEv = TM_ADVISOR.evaluateMilestone(_msn, state);
          if (_msEv && _msEv.threshold - _msEv.myScore <= 0) {
            var _msCost = 8 + _msClaimed.size * 8;
            if (mc >= _msCost) {
              items.push({ icon: '\ud83c\udfc5', text: _msn + ' (' + _msCost + ' MC \u2192 5VP)', pri: 98 });
            }
          }
        }
      }
    }

    // Award funding in action checklist
    var _aFunded = (state.game && state.game.fundedAwards) || [];
    var _aAll = (state.game && state.game.awards) || [];
    if (_aFunded.length < 3 && TM_ADVISOR.evaluateAward) {
      var _aCosts = [8, 14, 20];
      var _aNextCost = _aCosts[_aFunded.length] || 20;
      if (mc >= _aNextCost) {
        var _aFundedSet = new Set(_aFunded.map(function(f) { return f.name; }));
        var _aBestName = null;
        var _aBestMargin = 0;
        for (var _aai = 0; _aai < _aAll.length; _aai++) {
          if (_aFundedSet.has(_aAll[_aai].name)) continue;
          var _aaEv = TM_ADVISOR.evaluateAward(_aAll[_aai].name, state);
          if (_aaEv && _aaEv.winning && _aaEv.margin > _aBestMargin) {
            _aBestMargin = _aaEv.margin;
            _aBestName = _aAll[_aai].name;
          }
        }
        if (_aBestName && _aBestMargin >= 3) {
          items.push({ icon: '\ud83c\udfc6', text: 'Fund ' + _aBestName + ' (+' + _aBestMargin + ', ' + _aNextCost + 'MC \u2192 5VP)', pri: 85 });
        }
      }
    }

    // MC sink alert — too much MC with no plays
    var totalActions = items.filter(function(i) { return i.pri >= 60; }).length;
    if (mc > 30 && totalActions <= 1 && steps > 0) {
      var sinkOptions = [];
      if (mc >= 25) sinkOptions.push('\ud83c\udfd9 city(25)');
      if (mc >= 18 + redsTax && !oxyMaxed) sinkOptions.push('\ud83c\udf0a ocean(' + (18 + redsTax) + ')');
      if (mc >= 14 + redsTax && !tempMaxed) sinkOptions.push('\u2604 temp(' + (14 + redsTax) + ')');
      if (sinkOptions.length > 0) {
        items.push({ icon: '\ud83d\udcb0', text: mc + 'MC \u0437\u0430\u0441\u0442\u043e\u0439 \u2192 ' + sinkOptions.join(' / '), pri: 42 });
      }
    }

    // Best card recommendation — highest score playable card
    if (tp.cardsInHand && tp.cardsInHand.length > 0 && typeof TM_RATINGS !== 'undefined') {
      var _bcBest = null;
      var _bcScore = 0;
      for (var _bci = 0; _bci < tp.cardsInHand.length; _bci++) {
        var _bcn = tp.cardsInHand[_bci].name || tp.cardsInHand[_bci];
        var _bcr = TM_RATINGS[_bcn];
        if (!_bcr) continue;
        var _bcc = _bcr.c || 20;
        if (_bcc <= mc && _bcr.s > _bcScore) {
          _bcScore = _bcr.s;
          _bcBest = { name: _bcn, cost: _bcc, score: _bcr.s };
        }
      }
      if (_bcBest && _bcScore >= 65) {
        var _bcShort = _bcBest.name.length > 14 ? _bcBest.name.substring(0, 13) + '.' : _bcBest.name;
        items.push({ icon: '\u2b50', text: '\u041b\u0443\u0447\u0448\u0430\u044f: ' + _bcShort + ' (' + _bcBest.cost + 'MC, ' + _bcBest.score + '/100)', pri: 65 });
      }
    }

    // Draft buy recommendation based on remaining gens
    var _estGens = (TM_ADVISOR.endgameTiming ? TM_ADVISOR.endgameTiming(state).estimatedGens : 5);
    if (_estGens <= 2 && handSize > 3) {
      items.push({ icon: '\u26a0', text: '\u041d\u0435 \u043f\u043e\u043a\u0443\u043f\u0430\u0439 \u043a\u0430\u0440\u0442\u044b \u0432 \u0434\u0440\u0430\u0444\u0442\u0435!', pri: 45 });
    }

    // Immediate VP summary — total VP available this turn
    var _immVP = 0;
    var _immParts = [];
    if (heat >= 8 && !tempMaxed) { var _hTR = Math.floor(heat / 8); _immVP += _hTR; _immParts.push(_hTR + '\ud83d\udd25TR'); }
    if (plants >= plantCost && !oxyMaxed) { var _pGr = Math.floor(plants / plantCost); _immVP += _pGr * 1.3; _immParts.push(_pGr + '\ud83c\udf3f'); }
    // SP from MC
    if (steps > 0 && mc >= 14 + redsTax) {
      var _spCount = 0;
      var _spMC = mc;
      if (!oxyMaxed && _spMC >= 23 + redsTax) { _spCount++; _spMC -= 23 + redsTax; }
      if (_spMC >= 18 + redsTax) { _spCount++; _spMC -= 18 + redsTax; }
      if (!tempMaxed && _spMC >= 14 + redsTax) { _spCount++; }
      if (_spCount > 0) { _immVP += _spCount; _immParts.push(_spCount + 'SP'); }
    }
    if (_immVP >= 2) {
      items.push({ icon: '\ud83c\udfaf', text: '\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e ~' + Math.round(_immVP) + ' VP: ' + _immParts.join(' + '), pri: 48 });
    }

    // Phase strategy tips
    var _gen = (state.game && state.game.generation) || 1;
    if (_gen <= 3 && timing.estimatedGens >= 5) {
      items.push({ icon: '\ud83d\udce1', text: '\u0420\u0430\u043d\u043d\u0438\u0439: engine > VP, prod > TR', pri: 20 });
    } else if (timing.estimatedGens >= 3 && timing.estimatedGens <= 4) {
      items.push({ icon: '\ud83d\udce1', text: '\u041f\u0435\u0440\u0435\u0445\u043e\u0434: engine\u2192VP, M/A, trade', pri: 20 });
    }

    if (items.length === 0) { el.innerHTML = ''; return; }

    // Sort by priority (highest first)
    items.sort(function(a, b) { return b.pri - a.pri; });

    // Add numbered ordering when multiple high-priority items
    var hasMultiHighPri = items.filter(function(it) { return it.pri >= 70; }).length >= 2;
    el.innerHTML = '<div class="tm-advisor-actions">' +
      (hasMultiHighPri ? '<div style="opacity:0.5;font-size:10px;margin-bottom:2px">\u2193 \u041f\u043e\u0440\u044f\u0434\u043e\u043a:</div>' : '') +
      items.map(function(it, idx) {
        var num = hasMultiHighPri && it.pri >= 50 ? '<span style="opacity:0.4">' + (idx + 1) + '.</span> ' : '';
        return '<div>' + num + it.icon + ' ' + it.text + '</div>';
      }).join('') +
    '</div>';
  }

  function renderCompactAlerts(state) {
    var el = document.getElementById('tm-advisor-alerts');
    if (!el) return;
    var lines = [];
    var tp = state && state.thisPlayer;
    // Only critical: conversions + claimable milestones + Reds
    if (state && state.game && state.game.turmoil && state.game.turmoil.ruling === 'Reds') {
      lines.push('\u26d4 Reds +3');
    }
    var milestones = (state && state.game && state.game.milestones) || [];
    var claimed = new Set(((state && state.game && state.game.claimedMilestones) || []).map(function(cm) { return cm.name; }));
    if (claimed.size < 3 && TM_ADVISOR.evaluateMilestone) {
      for (var mi = 0; mi < milestones.length; mi++) {
        if (claimed.has(milestones[mi].name)) continue;
        var mEv = TM_ADVISOR.evaluateMilestone(milestones[mi].name, state);
        if (mEv && mEv.threshold - mEv.myScore <= 0) {
          lines.push('\ud83d\udfe2 ' + milestones[mi].name + '!');
        }
      }
    }
    if (tp) {
      var _heat = tp.heat || 0;
      var _plants = tp.plants || 0;
      if (_heat >= 8 && !(state.game && state.game.temperature >= 8)) lines.push('\ud83d\udd25' + _heat + 'H\u2192TR');
      if (_plants >= 8 && !(state.game && state.game.oxygenLevel >= 14)) lines.push('\ud83c\udf3f' + _plants + 'P\u2192green');
    }
    el.innerHTML = lines.length > 0
      ? '<div class="tm-advisor-alerts">' + lines.map(function(l) { return '<span style="margin-right:6px">' + l + '</span>'; }).join('') + '</div>'
      : '';
  }

  function renderPass(state) {
    var el = document.getElementById('tm-advisor-pass');
    if (!el) return;

    var pass = TM_ADVISOR.analyzePass(state);
    var cls = pass.shouldPass ? 'tm-advisor-pass-safe' : (pass.confidence === 'high' ? 'tm-advisor-pass-risky' : 'tm-advisor-pass-neutral');
    var icon = pass.shouldPass ? '\u2713' : '\u2717';

    // Stall value: VP per round from VP accumulators (Birds, Fish, etc.)
    var stallStr = '';
    var tp = state && state.thisPlayer;
    if (tp && tp.tableau && typeof TM_CARD_EFFECTS !== 'undefined') {
      var stallVP = 0;
      var stallCards = [];
      var usedSet = new Set(tp.actionsThisGeneration || []);
      for (var _si = 0; _si < tp.tableau.length; _si++) {
        var _sn = tp.tableau[_si].name || tp.tableau[_si];
        var _se = TM_CARD_EFFECTS[_sn];
        if (_se && _se.vpAcc && _se.action && !usedSet.has(_sn)) {
          stallVP += _se.vpAcc;
          stallCards.push(_sn.length > 8 ? _sn.substring(0, 7) + '.' : _sn);
        }
      }
      if (stallVP > 0 && !pass.shouldPass) {
        stallStr = '<div style="font-size:10px;opacity:0.65;margin-top:2px">' +
          '\ud83d\udc0c Stall: +' + stallVP.toFixed(1) + ' VP/round (' + stallCards.join(', ') + ')' +
        '</div>';
      }
    }

    // Sell value: MC from selling unplayable cards at pass
    var sellStr = '';
    if (tp && pass.shouldPass) {
      var handSize = tp.cardsInHandNbr || (tp.cardsInHand ? tp.cardsInHand.length : 0);
      if (handSize > 0) {
        sellStr = '<div style="font-size:10px;opacity:0.55;margin-top:2px">' +
          '\ud83d\udcb5 \u041f\u0440\u0438 pass \u043f\u0440\u043e\u0434\u0430\u0448\u044c ' + handSize + ' \u043a\u0430\u0440\u0442 = ' + handSize + ' MC' +
        '</div>';
      }
    }

    el.innerHTML =
      '<div class="tm-advisor-pass ' + cls + '">' +
        'Pass: ' + (pass.shouldPass ? '\u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e' : '\u043d\u0435 \u0441\u0435\u0439\u0447\u0430\u0441') +
        ' ' + icon +
        ' <span style="font-size:11px;opacity:0.7">(' + escHtml(pass.reason) + ')</span>' +
        stallStr + sellStr +
      '</div>';
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
      renderTiming(state);
      if (!_compact) {
        renderAlerts(state);
        renderActions(state);
      } else {
        // Compact: only critical alerts (conversions + claimable milestones)
        renderCompactAlerts(state);
        document.getElementById('tm-advisor-actions').innerHTML = '';
      }
      renderPass(state);
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
