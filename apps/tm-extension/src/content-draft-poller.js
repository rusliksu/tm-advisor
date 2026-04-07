// TM Tier Overlay — Opponent draft poller helpers
(function(global) {
  'use strict';

  var _oppDraftState = {};
  var _oppDraftInited = false;
  var _oppDraftStartScheduled = false;

  function scheduleNextPoll(input, delay) {
    var setTimeoutFn = input && input.setTimeoutFn;
    if (typeof setTimeoutFn === 'function') {
      setTimeoutFn(function() { pollOppDrafts(input); }, delay);
    }
  }

  function initOppDraftPoller(input) {
    var getPlayerVueData = input && input.getPlayerVueData;
    var fetchFn = input && input.fetchFn;
    if (_oppDraftInited || typeof getPlayerVueData !== 'function' || typeof fetchFn !== 'function') return;

    var pv0 = getPlayerVueData();
    if (!pv0 || !pv0.id) return;
    var myPlayerId = pv0.id;
    var gameId = myPlayerId.replace(/^p/, 'g');
    fetchFn('/api/game?id=' + gameId)
      .then(function(r) { return r && r.ok ? r.json() : null; })
      .then(function(data) {
        if (!data || !data.players) return;
        _oppDraftInited = true;
        data.players.forEach(function(p) {
          if (p.id === myPlayerId) return;
          _oppDraftState[p.id] = { name: p.name, color: p.color, prevDrafted: [], draftLog: [], draftRound: 0 };
        });
        pollOppDrafts(input);
      })
      .catch(function() {});
  }

  function pollOppDrafts(input) {
    var getPlayerVueData = input && input.getPlayerVueData;
    var fetchFn = input && input.fetchFn;
    var localStorageObj = input && input.localStorageObj;
    if (typeof getPlayerVueData !== 'function' || typeof fetchFn !== 'function') return;

    var pids = Object.keys(_oppDraftState);
    if (pids.length === 0) return;

    var pv1 = getPlayerVueData();
    var phase = pv1 && pv1.game ? pv1.game.phase : '';
    if (phase !== 'initial_drafting' && phase !== 'drafting' && phase !== 'research') {
      scheduleNextPoll(input, 10000);
      return;
    }

    Promise.all(pids.map(function(pid) {
      return fetchFn('/api/player?id=' + pid)
        .then(function(r) { return r && r.ok ? r.json() : null; })
        .catch(function() { return null; });
    })).then(function(results) {
      results.forEach(function(data, i) {
        if (!data) return;
        var pid = pids[i];
        var opp = _oppDraftState[pid];
        if (!opp) return;

        var curDrafted = (data.draftedCards || []).map(function(c) { return c.name; });
        if (curDrafted.length > opp.prevDrafted.length) {
          var prevSet = new Set(opp.prevDrafted);
          curDrafted.forEach(function(cn) {
            if (!prevSet.has(cn)) {
              opp.draftRound++;
              opp.draftLog.push({ round: opp.draftRound, taken: cn });
            }
          });
        }
        opp.prevDrafted = curDrafted;
        if (!opp.corp && data.thisPlayer && data.thisPlayer.tableau && data.thisPlayer.tableau.length > 0) {
          opp.corp = data.thisPlayer.tableau[0].name || '';
        }
      });

      var allDrafts = {};
      for (var pid2 in _oppDraftState) {
        var o2 = _oppDraftState[pid2];
        if (o2.draftLog.length > 0) {
          allDrafts[o2.color] = { name: o2.name, corp: o2.corp || '', draftLog: o2.draftLog };
        }
      }
      if (Object.keys(allDrafts).length > 0 && localStorageObj && typeof localStorageObj.setItem === 'function') {
        try { localStorageObj.setItem('tm_watcher_drafts', JSON.stringify(allDrafts)); } catch (e) {}
      }
      scheduleNextPoll(input, 3000);
    });
  }

  function startOpponentDraftPoller(input) {
    var setTimeoutFn = input && input.setTimeoutFn;
    if (_oppDraftStartScheduled || typeof setTimeoutFn !== 'function') return;
    _oppDraftStartScheduled = true;
    setTimeoutFn(function() { initOppDraftPoller(input); }, 5000);
  }

  global.TM_CONTENT_DRAFT_POLLER = {
    initOppDraftPoller: initOppDraftPoller,
    pollOppDrafts: pollOppDrafts,
    startOpponentDraftPoller: startOpponentDraftPoller
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
