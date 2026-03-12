// TM Advisor Panel — UI layer on top of TM_ADVISOR analytics.
// Reads state from vue-bridge DOM attributes, renders a collapsible panel.

/* eslint-disable */
(function() {
  'use strict';

  if (typeof TM_ADVISOR === 'undefined') return;

  var _panel = null;
  var _collapsed = false;
  var _enabled = true;
  var _lastUpdateHash = '';

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
            return parts.join(' ');
          })() +
          // Endgame phase advice
          (function() {
            if (timing.estimatedGens <= 0) return '';
            var tips = [];
            if (timing.estimatedGens <= 1) {
              tips.push('\u203c \u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u0433\u0435\u043d! \u041f\u0440\u043e\u0434\u0430\u0439 \u043a\u0430\u0440\u0442\u044b, \u043a\u043e\u043d\u0432\u0435\u0440\u0442\u0438\u0440\u0443\u0439 \u0440\u0435\u0441\u0443\u0440\u0441\u044b');
            } else if (timing.estimatedGens === 2) {
              tips.push('\u26a0 2 \u0433\u0435\u043d\u0430: \u043d\u0435 \u043f\u043e\u043a\u0443\u043f\u0430\u0439 prod, \u0442\u043e\u043b\u044c\u043a\u043e VP/TR');
            } else if (timing.estimatedGens === 3) {
              tips.push('\u26a1 3 \u0433\u0435\u043d\u0430: prod \u043e\u043a\u0443\u043f\u0438\u0442\u0441\u044f \u0442\u043e\u043b\u044c\u043a\u043e \u0434\u0435\u0448\u0451\u0432\u0430\u044f');
            }
            if (tips.length === 0) return '';
            return '<div style="color:#f39c12;margin-top:3px">' + tips.join(' ') + '</div>';
          })() +
        '</div>' +
      '</div>' +
      (function() {
        // Use full VP breakdown if available, else fall back to TR-based lead
        var tp = state && state.thisPlayer;
        var vpb = tp && tp.victoryPointsBreakdown;
        var lead = timing.vpLead;
        var pushHint = timing.shouldPush ? '' : ' \u2014 \u043d\u0435 \u043f\u0443\u0448\u0438\u0442\u044c';
        var urgency = '';
        if (timing.dangerZone === 'red' && lead < -5) urgency = ' \u26a0 \u0420\u0443\u0448 VP!';
        if (timing.dangerZone === 'red' && lead > 10) urgency = ' \u2014 \u043f\u0443\u0448\u0438\u043c \u0444\u0438\u043d\u0438\u0448!';
        if (vpb && typeof vpb.total === 'number') {
          // Full VP breakdown available
          var parts = [];
          parts.push('TR:' + (vpb.tr || 0));
          if ((vpb.greenery || 0) > 0) parts.push('G:' + vpb.greenery);
          if ((vpb.city || 0) > 0) parts.push('C:' + vpb.city);
          if ((vpb.cards || 0) > 0) parts.push('\u2663:' + vpb.cards);
          var ma = (vpb.milestones || 0) + (vpb.awards || 0);
          if (ma > 0) parts.push('MA:' + ma);
          var leadSign = lead > 0 ? '+' : '';
          var leadClass = lead > 0 ? 'positive' : (lead < 0 ? 'negative' : 'neutral');
          return '<div class="tm-advisor-vp-lead ' + leadClass + '">' +
            'VP ' + vpb.total + ' (' + parts.join(' ') + ') ' + leadSign + lead + pushHint + urgency +
          '</div>';
        }
        // Fallback: simple TR lead
        var vpClass = lead > 0 ? 'positive' : (lead < 0 ? 'negative' : 'neutral');
        var vpSign = lead > 0 ? '+' : '';
        return '<div class="tm-advisor-vp-lead ' + vpClass + '">' +
          'VP Lead: ' + vpSign + lead + pushHint + urgency +
        '</div>';
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
        var resStr = mc + ' MC';
        if (steel > 0) resStr += ' +' + steel + 'S';
        if (ti > 0) resStr += ' +' + ti + 'Ti';
        // Compact production line
        var prodParts = [];
        var sProd = tp.steelProduction || 0;
        var tiProd = tp.titaniumProduction || 0;
        var pProd = tp.plantProduction || 0;
        var eProd = tp.energyProduction || 0;
        var hProd = tp.heatProduction || 0;
        if (sProd > 0) prodParts.push(sProd + 'S');
        if (tiProd > 0) prodParts.push(tiProd + 'Ti');
        if (pProd > 0) prodParts.push(pProd + 'P');
        if (eProd > 0) prodParts.push(eProd + 'E');
        if (hProd > 0) prodParts.push(hProd + 'H');
        var prodStr = prodParts.length > 0 ? ' | ' + prodParts.join('/') : '';
        // Playable cards estimate: budget / avg card cost (~18 MC)
        var handSize = tp.cardsInHandNbr || (tp.cardsInHand ? tp.cardsInHand.length : 0);
        var playable = handSize > 0 ? Math.min(handSize, Math.floor(budget / 18)) : 0;
        var playStr = handSize > 0 ? ' | ~' + playable + '/' + handSize + '\u043a\u0430\u0440\u0442' : '';
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
        // Next gen projection
        var nextMc = income; // TR + MC prod (resources reset = earned fresh)
        var energy = tp.energy || 0;
        var heat = tp.heat || 0;
        var plants = tp.plants || 0;
        // Heat/plant projection: assume we don't spend resources this gen (worst case = current stockpile carries over)
        var totalHeat = heat + energy; // energy converts to heat at production
        var heatGainPerGen = hProd + eProd; // steady-state heat per gen
        var projParts = [];
        projParts.push('\u2192' + nextMc + ' MC');
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
          if (discParts.length > 0) discountStr = '<div style="font-size:10px;opacity:0.55;padding:1px 0">\ud83d\udcb0 ' + discParts.join(', ') + '</div>';
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
        return '<div style="font-size:12px;opacity:0.8;padding:2px 0">' +
          'Gen ' + gen + ' | ' + resStr + ' (' + budget + ') | TR ' + tr + ' | +' + income + '/gen' + vpVelStr + playStr + oppStr + prodStr +
          '</div><div style="font-size:11px;opacity:0.65;padding:1px 0">' +
          'Next' + projStr + '</div>' + discountStr;
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
      if (turmoil.ruling === 'Reds') {
        lines.push('\ud83d\udd34 Reds \u043f\u0440\u0430\u0432\u044f\u0442 \u2014 +3 MC \u043a TR/\u0433\u043b\u043e\u0431\u0430\u043b\u043a\u0430\u043c');
      }
      // Show dominant party (next ruling) if different from current
      var dominant = turmoil.dominant || turmoil.dominantParty;
      if (dominant && dominant !== turmoil.ruling) {
        var partyIcons = { Mars: '\ud83d\udd34', Scientists: '\ud83d\udd2c', Unity: '\ud83c\udf0d', Greens: '\ud83c\udf3f', Kelvinists: '\ud83d\udd25', Reds: '\u26d4' };
        var pIcon = partyIcons[dominant] || '\ud83c\udfdb';
        lines.push(pIcon + ' Next: ' + dominant);
      }
    }

    // ── Milestone alerts: close to claiming (distance ≤ 2) ──
    var milestones = (state && state.game && state.game.milestones) || [];
    var claimed = new Set(((state && state.game && state.game.claimedMilestones) || []).map(function(cm) { return cm.name; }));
    var claimedCount = claimed.size;
    if (claimedCount < 3 && TM_ADVISOR.evaluateMilestone) {
      for (var mi = 0; mi < milestones.length; mi++) {
        var m = milestones[mi];
        if (claimed.has(m.name)) continue;
        var mEv = TM_ADVISOR.evaluateMilestone(m.name, state);
        if (!mEv) continue;
        var dist = mEv.threshold - mEv.myScore;
        if (dist <= 0) {
          lines.push('\ud83d\udfe2 ' + m.name + ' \u2014 \u043c\u043e\u0436\u043d\u043e \u0432\u0437\u044f\u0442\u044c!');
        } else if (dist <= 2) {
          lines.push('\ud83d\udfe1 ' + m.name + ' ' + mEv.myScore + '/' + mEv.threshold + ' (\u2212' + dist + ')');
        }
      }
    }

    // ── Award leaderboard (all awards — funded highlighted, unfunded show fund recommendation) ──
    var funded = (state && state.game && state.game.fundedAwards) || [];
    var awards = (state && state.game && state.game.awards) || [];
    var fundedSet = new Set(funded.map(function(f) { return f.name; }));
    var fundedCount = funded.length;
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
          awardParts.push(_icon + _shortName + ':' + _aEv.myScore + 'v' + _aEv.bestOppScore);
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
      // Fund recommendation
      if (fundedCount < 3 && bestFundAward && bestFundMargin >= 2 && tp) {
        var awardCosts = [8, 14, 20];
        var fundCost = awardCosts[fundedCount] || 20;
        if ((tp.megaCredits || 0) >= fundCost) {
          lines.push('\ud83c\udfc6 Fund ' + bestFundAward + '? (+' + bestFundMargin + ', ' + fundCost + ' MC)');
        }
      }
    }

    // ── Colony trade recommendation ──
    var colonies = (state && state.game && state.game.colonies) || [];
    if (tp && colonies.length > 0 && TM_ADVISOR.scoreColonyTrade) {
      var fleets = tp.fleetSize || 0;
      var tradesUsed = tp.tradesThisGeneration || 0;
      if (fleets > tradesUsed) {
        var bestCol = null;
        var bestVal = 0;
        for (var ci = 0; ci < colonies.length; ci++) {
          var cVal = TM_ADVISOR.scoreColonyTrade(colonies[ci], state);
          if (cVal > bestVal) {
            bestVal = cVal;
            bestCol = colonies[ci].name || '?';
          }
        }
        if (bestCol) {
          lines.push('\ud83d\ude80 Trade: ' + bestCol + ' (' + Math.round(bestVal) + ' MC)');
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

    // ── TR race + opponent cards ──
    var players = (state && state.players) || [];
    if (players.length > 1 && tp) {
      var trParts = [];
      var cardParts = [];
      var myTr = tp.terraformRating || 0;
      trParts.push('TR:' + myTr);
      for (var oi = 0; oi < players.length; oi++) {
        var opp = players[oi];
        if (opp.color === tp.color) continue;
        var oppName = (opp.name || opp.color || '?');
        if (oppName.length > 8) oppName = oppName.substring(0, 7) + '.';
        trParts.push(oppName + ':' + (opp.terraformRating || 0));
        cardParts.push(oppName + ':' + (opp.cardsInHandNbr || 0));

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
      lines.push('\ud83c\udfc1 ' + trParts.join(' \u2502 '));
      if (cardParts.length > 0) {
        lines.push('\ud83c\udcb3 ' + cardParts.join(' \u2502 '));
      }
      // Opponent production comparison (who's ahead in key productions)
      var myPP = tp.plantProduction || 0;
      var myHP = (tp.heatProduction || 0) + (tp.energyProduction || 0);
      var oppProdParts = [];
      for (var _opi = 0; _opi < players.length; _opi++) {
        var _opp = players[_opi];
        if (_opp.color === tp.color) continue;
        var _oppName = (_opp.name || _opp.color || '?');
        if (_oppName.length > 8) _oppName = _oppName.substring(0, 7) + '.';
        var _oppPP = _opp.plantProduction || 0;
        var _oppHP = (_opp.heatProduction || 0) + (_opp.energyProduction || 0);
        var _parts = [];
        if (_oppPP > myPP) _parts.push('P' + _oppPP);
        if (_oppHP > myHP) _parts.push('H' + _oppHP);
        if (_parts.length > 0) oppProdParts.push(_oppName + ':' + _parts.join('/'));
      }
      if (oppProdParts.length > 0) {
        lines.push('\u26a0 \u041e\u043f\u043f prod: ' + oppProdParts.join(' '));
      }
      // Opponent engine highlights — key VP/draw cards in their tableau
      var KEY_OPP_CARDS = {
        // VP accumulators (animals/microbes)
        'Birds': '\ud83d\udc26', 'Fish': '\ud83d\udc1f', 'Predators': '\ud83e\udd81', 'Livestock': '\ud83d\udc04',
        'Ants': '\ud83d\udc1c', 'Pets': '\ud83d\udc3e', 'Penguins': '\ud83d\udc27',
        'Venusian Animals': '\ud83e\udda0', 'Small Animals': '\ud83d\udc3f',
        // Draw engines
        'AI Central': '\ud83e\udde0', 'Mars University': '\ud83c\udf93', 'Olympus Conference': '\ud83c\udfdb',
        // Big VP
        'Commercial District': '\ud83c\udfe2', 'Capital': '\ud83c\udfd9', 'Luna Metropolis': '\ud83c\udf19',
        // Key production
        'Robotic Workforce': '\ud83e\udd16', 'Earth Catapult': '\ud83d\ude80',
        'Anti-Gravity Technology': '\u2b50',
      };
      for (var _koi = 0; _koi < players.length; _koi++) {
        var _kopp = players[_koi];
        if (_kopp.color === tp.color || !_kopp.tableau) continue;
        var _koppName = (_kopp.name || _kopp.color || '?');
        if (_koppName.length > 8) _koppName = _koppName.substring(0, 7) + '.';
        var _keyCards = [];
        for (var _kci = 0; _kci < _kopp.tableau.length; _kci++) {
          var _kcn = _kopp.tableau[_kci].name || _kopp.tableau[_kci];
          if (KEY_OPP_CARDS[_kcn]) _keyCards.push(KEY_OPP_CARDS[_kcn]);
        }
        if (_keyCards.length > 0) {
          lines.push('\ud83d\udd0d ' + _koppName + ': ' + _keyCards.join(''));
        }
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
    if (heat >= 8 && !tempMaxed) {
      items.push({ icon: '\ud83d\udd25', text: 'Heat\u2192TR (' + heat + 'H)', pri: 95 });
    }
    var plantCost = 8;
    if (tp.tableau) {
      for (var _ei = 0; _ei < tp.tableau.length; _ei++) {
        if (((tp.tableau[_ei].name || '') + '').toLowerCase() === 'ecoline') plantCost = 7;
      }
    }
    if (plants >= plantCost && !oxyMaxed) {
      items.push({ icon: '\ud83c\udf3f', text: 'Plants\u2192greenery (' + plants + 'P)', pri: 90 });
    }

    // Colony trade
    var colonies = (state.game && state.game.colonies) || [];
    var fleets = tp.fleetSize || 0;
    var tradesUsed = tp.tradesThisGeneration || 0;
    if (colonies.length > 0 && fleets > tradesUsed) {
      items.push({ icon: '\ud83d\ude80', text: 'Trade (' + (fleets - tradesUsed) + ' fleet)', pri: 80 });
    }

    // Unused blue card actions
    var usedActions = tp.actionsThisGeneration || [];
    var usedSet = new Set(usedActions);
    var unusedActions = [];
    if (tp.tableau) {
      for (var _ti = 0; _ti < tp.tableau.length; _ti++) {
        var _cn = tp.tableau[_ti].name || tp.tableau[_ti];
        var _cd = (typeof _cardData !== 'undefined' ? _cardData[_cn] : null) ||
                  (typeof TM_CARD_EFFECTS !== 'undefined' && TM_CARD_EFFECTS[_cn]) || null;
        if (_cd && _cd.action && !usedSet.has(_cn)) {
          unusedActions.push(_cn);
        }
      }
    }
    if (unusedActions.length > 0) {
      var actionNames = unusedActions.length <= 3
        ? unusedActions.map(function(n) { return n.length > 12 ? n.substring(0, 11) + '.' : n; }).join(', ')
        : unusedActions.length + ' actions';
      items.push({ icon: '\ud83d\udd35', text: actionNames, pri: 70 });
    }

    // Standard projects (when other options thin)
    if (steps > 0 && items.length <= 2) {
      var redsTax = (state.game && state.game.turmoil && state.game.turmoil.ruling === 'Reds') ? 3 : 0;
      if (mc >= 23 + redsTax && !oxyMaxed) {
        items.push({ icon: '\ud83c\udfed', text: 'SP Greenery (23 MC)', pri: 40 });
      } else if (mc >= 18 + redsTax) {
        items.push({ icon: '\ud83c\udf0a', text: 'SP Aquifer (18 MC)', pri: 35 });
      } else if (mc >= 14 + redsTax && !tempMaxed) {
        items.push({ icon: '\u2604', text: 'SP Asteroid (14 MC)', pri: 30 });
      }
    }

    // Cards in hand
    var handSize = tp.cardsInHandNbr || (tp.cardsInHand ? tp.cardsInHand.length : 0);
    if (handSize > 0) {
      items.push({ icon: '\ud83c\udcb3', text: handSize + ' cards in hand', pri: 60 });
    }

    if (items.length === 0) { el.innerHTML = ''; return; }

    // Sort by priority (highest first)
    items.sort(function(a, b) { return b.pri - a.pri; });

    el.innerHTML = '<div class="tm-advisor-actions">' +
      items.map(function(it) { return '<div>' + it.icon + ' ' + it.text + '</div>'; }).join('') +
    '</div>';
  }

  function renderPass(state) {
    var el = document.getElementById('tm-advisor-pass');
    if (!el) return;

    var pass = TM_ADVISOR.analyzePass(state);
    var cls = pass.shouldPass ? 'tm-advisor-pass-safe' : (pass.confidence === 'high' ? 'tm-advisor-pass-risky' : 'tm-advisor-pass-neutral');
    var icon = pass.shouldPass ? '\u2713' : '\u2717';

    el.innerHTML =
      '<div class="tm-advisor-pass ' + cls + '">' +
        'Pass: ' + (pass.shouldPass ? '\u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e' : '\u043d\u0435 \u0441\u0435\u0439\u0447\u0430\u0441') +
        ' ' + icon +
        ' <span style="font-size:11px;opacity:0.7">(' + escHtml(pass.reason) + ')</span>' +
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

    createPanel();
    _panel.classList.remove('tm-advisor-hidden');

    // Always update gen in header (visible even collapsed)
    var genEl = document.getElementById('tm-advisor-gen');
    if (genEl) genEl.textContent = 'Gen ' + ((state.game && state.game.generation) || '?');

    if (!_collapsed) {
      renderTiming(state);
      renderAlerts(state);
      renderActions(state);
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
