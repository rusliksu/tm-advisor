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
        '<div id="tm-advisor-deck"></div>' +
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
            // Warn if opponent is close to claiming
            if (!result || !result.canClaim) {
              var players = (state.game && state.game.players) || [];
              for (var _opi = 0; _opi < players.length; _opi++) {
                var _opp = players[_opi];
                if (_opp.color === tp.color) continue;
                var oppResult = null;
                if (TM_ADVISOR.evaluateMilestone) {
                  var origTp = state.thisPlayer;
                  state.thisPlayer = _opp;
                  oppResult = TM_ADVISOR.evaluateMilestone(ms.name, state);
                  state.thisPlayer = origTp;
                }
                if (oppResult && oppResult.canClaim) {
                  maAlert += '<div style="color:#e74c3c;font-size:10px">\u26a0 ' + (_opp.name || _opp.color) + ' \u0431\u043b\u0438\u0437\u043e\u043a \u043a ' + ms.name + '!</div>';
                  break;
                }
              }
            }
          });
        }
      }
      // Award funding recommendation
      if (state.game.awards && mc >= 8) {
        var fundedCount = 0;
        state.game.awards.forEach(function(aw) { if (aw.funder_name || aw.funder_color || aw.playerName) fundedCount++; });
        if (fundedCount < 3) {
          var fundCosts = [8, 14, 20];
          var fundCost = fundCosts[Math.min(fundedCount, 2)];
          if (mc >= fundCost) {
            state.game.awards.forEach(function(aw) {
              if (aw.funder_name || aw.funder_color || aw.playerName) return;
              if (!aw.scores || aw.scores.length === 0) return;
              var myScore = 0, bestOpp = 0;
              for (var si = 0; si < aw.scores.length; si++) {
                if (aw.scores[si].color === tp.color) myScore = aw.scores[si].score;
                else bestOpp = Math.max(bestOpp, aw.scores[si].score);
              }
              var lead = myScore - bestOpp;
              if (lead > 0 && myScore > 0) {
                maAlert += '<div style="color:#f1c40f;font-size:11px">\ud83c\udfc6 ' + aw.name + ' (' + fundCost + ' MC, +' + lead + ' lead)</div>';
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
          return '<span style="color:' + c + '">' + (s.name || '?').substring(0,6) + ':' + s.vp + '</span>';
        });
        var myRank = scores.findIndex(function(s) { return s.isMe; }) + 1;
        var rankIcon = myRank === 1 ? '\ud83e\udd47' : myRank === 2 ? '\ud83e\udd48' : '\ud83e\udd49';
        maAlert += '<div style="font-size:10px;opacity:0.7">' + rankIcon + ' ' + sbParts.join(' ') + '</div>';
      }



      // Resource conversion reminders
      var _heat = tp.heat || 0;
      var _plants = tp.plants || 0;
      var _tempMaxed = state.game && state.game.temperature >= 8;
      var _oxyMaxed = state.game && state.game.oxygenLevel >= 14;
      if (_heat >= 8 && !_tempMaxed) {
        maAlert += '<div style="font-size:10px;color:#ff9800">\ud83d\udd25 ' + _heat + ' heat \u2192 ' + Math.floor(_heat/8) + ' TR</div>';
      }
      var _plantCost = 8;
      if (_plants >= _plantCost) {
        maAlert += '<div style="font-size:10px;color:#4caf50">\ud83c\udf3f ' + _plants + ' plants \u2192 greenery' + (_oxyMaxed ? '' : ' +TR') + '</div>';
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
    el.innerHTML = '<div class="tm-advisor-timing tm-dz-' + timing.dangerZone + '">' +
      dzIcon + ' Gen ' + gen + ' | ' + timing.steps + ' \u0448\u0430\u0433\u043e\u0432, ~' + timing.estimatedGens + ' \u043f\u043e\u043a.' + handCount +
      budgetLine + paramLine + maAlert +
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
    var el = document.getElementById('tm-advisor-actions');
    if (!el) return;

    // Award funding advisor
    var awards = (state.game && state.game.awards) || [];
    var myColor = state.thisPlayer ? state.thisPlayer.color : '';
    var mc = state.thisPlayer ? (state.thisPlayer.megaCredits || 0) : 0;
    if (!myColor || awards.length === 0) { el.innerHTML = ''; return; }

    // Count funded awards
    var fundedCount = awards.filter(function(a) { return a.playerName || a.playerColor; }).length;
    if (fundedCount >= 3) { el.innerHTML = ''; return; } // all funded

    // Cost: 8 (1st), 14 (2nd), 20 (3rd)
    var costs = [8, 14, 20];
    var fundCost = costs[Math.min(fundedCount, 2)];
    if (mc < fundCost) { el.innerHTML = ''; return; } // can't afford

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
    var html = '';
    var good = candidates.filter(function(c) { return c.ev >= 2; });
    if (good.length > 0) {
      html += '<div style="border-top:1px solid rgba(255,255,255,0.1);margin-top:4px;padding-top:3px">';
      html += '<div style="font-size:11px;font-weight:bold;margin-bottom:2px">\uD83C\uDFC6 Awards (' + fundCost + ' MC)</div>';
      for (var gi = 0; gi < Math.min(good.length, 3); gi++) {
        var c = good[gi];
        var leadStr = c.lead > 0 ? '+' + c.lead : '' + c.lead;
        var color = c.lead > 0 ? '#2ecc71' : c.lead === 0 ? '#f1c40f' : '#e74c3c';
        html += '<div style="font-size:12px;padding:1px 0">' +
          '<span style="color:' + color + '">\u25CF</span> ' + c.name +
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
      if (!_compact) {
        try { renderDeck(state); } catch(e) { console.error('[TM-Advisor] renderDeck:', e.message); }
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
    if (wf && wf.cards) {
      for (var w = 0; w < wf.cards.length; w++) {
        var wn = wf.cards[w].name || wf.cards[w];
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
    var shown = Math.min(saCards.length, 8);
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
    for (var s = 0; s < synCards.length && synShown < 5; s++) {
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

    el.innerHTML =
      '<div style="border-top:1px solid rgba(255,255,255,0.1);margin-top:6px;padding-top:4px">' +
        '<div style="font-size:12px;font-weight:bold;margin-bottom:3px">' +
          '\uD83C\uDCCF Deck: ' + analysis.deckSize + ' | Discard: ' + analysis.discardSize +
          ' | P=' + pDeck + '%</div>' +
        '<div style="display:flex;height:18px;border-radius:3px;overflow:hidden;margin-bottom:3px">' +
          barHtml +
        '</div>' +
        draftHtml +
        (keyHtml ? '<div style="margin-top:3px;line-height:20px">' + keyHtml + '</div>' : '') +
        (synHtml ? '<div style="margin-top:3px;border-top:1px solid rgba(255,255,255,0.06);padding-top:2px">' + synHtml + '</div>' : '') +
      '</div>';
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
