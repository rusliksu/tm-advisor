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

    return _panel;
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
        '</div>' +
      '</div>' +
      '<div class="tm-advisor-vp-lead ' + vpClass + '">' +
        'VP Lead: ' + vpSign + timing.vpLead +
        (timing.shouldPush ? '' : ' \u2014 \u043d\u0435 \u043f\u0443\u0448\u0438\u0442\u044c \u0433\u043b\u043e\u0431\u0430\u043b\u043a\u0438') +
        (timing.dangerZone === 'red' && timing.vpLead < -5 ? ' \u26a0 \u0420\u0443\u0448 VP!' : '') +
        (timing.dangerZone === 'red' && timing.vpLead > 10 ? ' \u2014 \u043f\u0443\u0448\u0438\u043c \u0444\u0438\u043d\u0438\u0448!' : '') +
      '</div>' +
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
        var budget = mc + steel * sv + ti * tv;
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
        return '<div style="font-size:12px;opacity:0.8;padding:2px 0">' +
          'Gen ' + gen + ' | ' + resStr + ' (' + budget + ') | TR ' + tr + ' | +' + income + '/gen' + playStr + oppStr + prodStr + '</div>';
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

    // ── Award alerts: funded awards where we're losing ──
    var funded = (state && state.game && state.game.fundedAwards) || [];
    if (funded.length > 0 && TM_ADVISOR.evaluateAward) {
      for (var ai = 0; ai < funded.length; ai++) {
        var aw = funded[ai];
        var aEv = TM_ADVISOR.evaluateAward(aw.name, state);
        if (!aEv) continue;
        if (aEv.margin < 0) {
          lines.push('\ud83d\udd34 ' + aw.name + ': ' + aEv.myScore + ' vs ' + aEv.bestOppScore + ' (' + escHtml(aEv.bestOppName) + ')');
        } else if (aEv.tied) {
          lines.push('\ud83d\udfe1 ' + aw.name + ': \u043d\u0438\u0447\u044c\u044f ' + aEv.myScore);
        }
      }
    }

    // ── Award funding recommendation ──
    var awards = (state && state.game && state.game.awards) || [];
    var fundedSet = new Set(funded.map(function(f) { return f.name; }));
    var fundedCount = funded.length;
    if (fundedCount < 3 && tp && TM_ADVISOR.evaluateAward) {
      var awardCosts = [8, 14, 20];
      var fundCost = awardCosts[fundedCount] || 20;
      var mc = tp.megaCredits || 0;
      if (mc >= fundCost) {
        var bestAward = null;
        var bestMargin = 0;
        for (var fi = 0; fi < awards.length; fi++) {
          if (fundedSet.has(awards[fi].name)) continue;
          var fEv = TM_ADVISOR.evaluateAward(awards[fi].name, state);
          if (!fEv) continue;
          if (fEv.winning && fEv.margin > bestMargin) {
            bestMargin = fEv.margin;
            bestAward = awards[fi].name;
          }
        }
        if (bestAward && bestMargin >= 2) {
          lines.push('\ud83c\udfc6 Fund ' + bestAward + '? (+' + bestMargin + ', ' + fundCost + ' MC)');
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
    }

    el.innerHTML = lines.length > 0
      ? '<div class="tm-advisor-alerts">' + lines.map(function(l) { return '<div>' + l + '</div>'; }).join('') + '</div>'
      : '';
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
    var hash = (state.game && state.game.generation || 0) + ':' +
               (tp.megaCredits || 0) + ':' +
               (tp.terraformRating || 0) + ':' +
               (tp.heat || 0) + ':' +
               (tp.plants || 0) + ':' +
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
