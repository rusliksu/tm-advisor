// TM Advisor Panel — UI layer on top of TM_ADVISOR analytics.
// Reads state from vue-bridge DOM attributes, renders a collapsible panel.

/* eslint-disable */
(function() {
  'use strict';

  if (typeof TM_ADVISOR === 'undefined') return;

  var ruName = (typeof TM_UTILS !== 'undefined' && TM_UTILS.ruName) ? TM_UTILS.ruName : function(n) { return n; };

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
        '<span class="tm-advisor-title">\u26a1 ADVISOR</span>' +
        '<button class="tm-advisor-toggle" id="tm-advisor-collapse" title="Свернуть/развернуть">\u25c0</button>' +
      '</div>' +
      '<div class="tm-advisor-body" id="tm-advisor-body">' +
        '<div id="tm-advisor-timing"></div>' +
        '<div id="tm-advisor-turmoil"></div>' +
        '<div id="tm-advisor-awards"></div>' +
        '<div id="tm-advisor-actions"></div>' +
        '<div id="tm-advisor-hand"></div>' +
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

  function readWaitingFor() {
    var target = document.getElementById('game') || document.body;
    var raw = target.getAttribute('data-tm-vue-wf');
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
          'T:' + timing.breakdown.temp + '\u00b0(' + timing.breakdown.tempSteps + ') ' +
          'O:' + timing.breakdown.oxy + '%(' + timing.breakdown.oxySteps + ') ' +
          'Oc:' + timing.breakdown.oceans + '(' + timing.breakdown.oceanSteps + ')' +
          (timing.breakdown.venusSteps > 0 ? ' V:' + timing.breakdown.venus + '(' + timing.breakdown.venusSteps + ')' : '') +
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
        return '<div style="font-size:10px;opacity:0.7;padding:1px 0">' +
          'Gen ' + gen + ' | ' + resStr + ' (' + budget + ') | TR ' + tr + ' | +' + income + '/gen' + oppStr + prodStr + '</div>';
      })()
  }

  function renderActions(state) {
    var el = document.getElementById('tm-advisor-actions');
    if (!el) return;

    var wf = readWaitingFor();
    if (!wf) { el.innerHTML = ''; return; }

    // Draft mode: selectCard with cards array
    if (wf.cards && wf.cards.length > 0 && !wf.options) {
      var ranked = TM_ADVISOR.rankHandCards(wf.cards, state);
      if (ranked.length === 0) { el.innerHTML = ''; return; }
      var draftHtml = '<div class="tm-advisor-section">\u0414\u0440\u0430\u0444\u0442 (' + wf.cards.length + ')</div>';
      var draftShown = Math.min(ranked.length, 8);
      for (var di = 0; di < draftShown; di++) {
        var dc = ranked[di];
        var dStars = '';
        for (var ds = 0; ds < dc.stars; ds++) dStars += '\u2605';
        for (var ds2 = dc.stars; ds2 < 3; ds2++) dStars += '\u2606';
        draftHtml +=
          '<div class="tm-advisor-hand-card">' +
            '<span class="tm-advisor-hand-stars">' + dStars + '</span>' +
            '<span class="tm-advisor-hand-name" title="' + escHtml(dc.name) + '">' + escHtml(ruName(dc.name)) + '</span>' +
            '<span class="tm-advisor-hand-score">' + dc.score + '</span>' +
          '</div>';
      }
      el.innerHTML = draftHtml;
      return;
    }

    if (!wf.options) { el.innerHTML = ''; return; }

    var actions = TM_ADVISOR.analyzeActions(wf, state);
    if (actions.length === 0) {
      el.innerHTML = '';
      return;
    }

    var html = '<div class="tm-advisor-section">\u0420\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u0438</div>';
    var shown = Math.min(actions.length, 5);
    for (var i = 0; i < shown; i++) {
      var a = actions[i];
      var actionName = a.action.length > 25 ? a.action.substring(0, 23) + '..' : a.action;
      html +=
        '<div class="tm-advisor-rec">' +
          '<span class="tm-advisor-rec-emoji">' + a.emoji + '</span>' +
          '<div class="tm-advisor-rec-text">' +
            '<div class="tm-advisor-rec-action">' + (i + 1) + '. ' + escHtml(actionName) + '</div>' +
            '<div class="tm-advisor-rec-reason">' + escHtml(a.reason) + '</div>' +
          '</div>' +
          '<span class="tm-advisor-rec-score">' + a.score + '</span>' +
        '</div>';
    }
    el.innerHTML = html;
  }

  function renderHand(state) {
    var el = document.getElementById('tm-advisor-hand');
    if (!el) return;

    var tp = state && state.thisPlayer;
    if (!tp || !tp.cardsInHand || tp.cardsInHand.length === 0) {
      el.innerHTML = '';
      return;
    }

    var ranked = TM_ADVISOR.rankHandCards(tp.cardsInHand, state);
    if (ranked.length === 0) {
      el.innerHTML = '';
      return;
    }

    var html = '<div class="tm-advisor-section">\u0420\u0443\u043a\u0430 (' + ranked.length + ')</div>';
    var shown = Math.min(ranked.length, 6);
    for (var i = 0; i < shown; i++) {
      var c = ranked[i];
      var stars = '';
      for (var s = 0; s < c.stars; s++) stars += '\u2605';
      for (var s2 = c.stars; s2 < 3; s2++) stars += '\u2606';

      html +=
        '<div class="tm-advisor-hand-card">' +
          '<span class="tm-advisor-hand-stars">' + stars + '</span>' +
          '<span class="tm-advisor-hand-name" title="' + escHtml(c.name) + '">' + escHtml(ruName(c.name)) + '</span>' +
          '<span class="tm-advisor-hand-score">' + c.score + '</span>' +
        '</div>';
    }
    el.innerHTML = html;
  }

  function renderAwards(state) {
    var el = document.getElementById('tm-advisor-awards');
    if (!el) return;

    var html = '';

    // Milestones
    var milestones = (state && state.game && state.game.milestones) || [];
    var claimed = new Set(((state && state.game && state.game.claimedMilestones) || []).map(function(cm) { return cm.name; }));
    if (milestones.length > 0 && TM_ADVISOR.evaluateMilestone) {
      var mItems = [];
      for (var mi = 0; mi < milestones.length; mi++) {
        var m = milestones[mi];
        var isClaimed = claimed.has(m.name);
        var mEv = TM_ADVISOR.evaluateMilestone(m.name, state);
        if (!mEv) continue;
        var mIcon = isClaimed ? '\u2705' : (mEv.canClaim ? '\ud83d\udfe2' : '\u26aa');
        var mLabel = m.name + ' ' + mEv.myScore + '/' + mEv.threshold;
        mItems.push(mIcon + ' ' + escHtml(mLabel));
      }
      if (mItems.length > 0) {
        html += '<div style="font-size:10px;opacity:0.8;padding:1px 0">M: ' + mItems.join(' \u2022 ') + '</div>';
      }
    }

    // Awards
    var awards = (state && state.game && state.game.awards) || [];
    var funded = new Set(((state && state.game && state.game.fundedAwards) || []).map(function(fa) { return fa.name; }));
    if (awards.length > 0 && TM_ADVISOR.evaluateAward) {
      var aItems = [];
      for (var i = 0; i < awards.length; i++) {
        var a = awards[i];
        var isFunded = funded.has(a.name);
        var ev = TM_ADVISOR.evaluateAward(a.name, state);
        if (!ev) continue;
        var icon = isFunded ? '\u2705' : (ev.winning ? '\ud83d\udfe2' : (ev.tied ? '\ud83d\udfe1' : '\ud83d\udd34'));
        var label = a.name + ' ' + ev.myScore;
        if (!isFunded) label += '/' + ev.bestOppScore;
        aItems.push(icon + ' ' + escHtml(label));
      }
      if (aItems.length > 0) {
        html += '<div style="font-size:10px;opacity:0.8;padding:1px 0">A: ' + aItems.join(' \u2022 ') + '</div>';
      }
    }

    el.innerHTML = html;
  }

  function renderTurmoil(state) {
    var el = document.getElementById('tm-advisor-turmoil');
    if (!el) return;

    var turmoil = state && state.game && state.game.turmoil;
    if (!turmoil) { el.innerHTML = ''; return; }

    var partyIcons = {
      'Mars First': '\ud83d\udd34', 'Scientists': '\ud83d\udd2c', 'Unity': '\ud83c\udf0d',
      'Greens': '\ud83c\udf3f', 'Reds': '\u26d4', 'Kelvinists': '\ud83d\udd25'
    };

    var ruling = turmoil.ruling || '?';
    var dominant = turmoil.dominant || '?';
    var rulingIcon = partyIcons[ruling] || '\ud83c\udfe6';
    var dominantIcon = partyIcons[dominant] || '\ud83c\udfe6';

    var parts = [rulingIcon + ' ' + ruling];
    if (dominant !== ruling) {
      parts.push(dominantIcon + ' ' + dominant + ' (next)');
    }

    el.innerHTML = '<div style="font-size:10px;opacity:0.8;padding:1px 0">' +
      parts.join(' \u2502 ') + '</div>';
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
        ' <span style="font-size:10px;opacity:0.7">(' + escHtml(pass.reason) + ')</span>' +
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
    var wfRaw = (document.getElementById('game') || document.body).getAttribute('data-tm-vue-wf') || '';
    var wfHash = wfRaw.length > 0 ? wfRaw.length + ':' + wfRaw.charCodeAt(10) : '0';
    var hash = (state.game && state.game.generation || 0) + ':' +
               (tp.megaCredits || 0) + ':' +
               (tp.terraformRating || 0) + ':' +
               (tp.heat || 0) + ':' +
               (tp.plants || 0) + ':' +
               (tp.cardsInHandNbr || (tp.cardsInHand ? tp.cardsInHand.length : 0)) + ':' +
               wfHash + ':' +
               (state._timestamp || 0);
    if (hash === _lastUpdateHash) return;
    _lastUpdateHash = hash;

    createPanel();
    _panel.classList.remove('tm-advisor-hidden');

    if (!_collapsed) {
      renderTiming(state);
      renderTurmoil(state);
      renderAwards(state);
      renderActions(state);
      renderHand(state);
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
