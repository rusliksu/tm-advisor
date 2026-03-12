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
        '<span class="tm-advisor-title">\u26a1 TIMING</span>' +
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

    // ── Opponent cards in hand (round length signal) ──
    var players = (state && state.players) || [];
    if (players.length > 1 && tp) {
      var oppParts = [];
      for (var oi = 0; oi < players.length; oi++) {
        var opp = players[oi];
        if (opp.color === tp.color) continue;
        var oppName = (opp.name || opp.color || '?');
        if (oppName.length > 8) oppName = oppName.substring(0, 7) + '.';
        var oppCards = opp.cardsInHandNbr || 0;
        oppParts.push(oppName + ':' + oppCards);
      }
      if (oppParts.length > 0) {
        lines.push('\ud83c\udcb3 ' + oppParts.join(' \u2502 '));
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
