// TM Tier Overlay - Draft tracker helpers
(function(global) {
  'use strict';

  var _draftHistory = [];
  var _oppPredictedCards = {};
  var _lastDraftSet = new Set();
  var _lastDraftScores = {};
  var _lastDraftIsDraft = false;
  var _lastClickedDraftCard = null;

  function getDraftHistory() {
    return _draftHistory;
  }

  function getOppPredictedCards() {
    return _oppPredictedCards;
  }

  function getLastDraftScores() {
    return _lastDraftScores;
  }

  function isLastDraftActive() {
    return !!_lastDraftIsDraft;
  }

  function setLastDraftScores(scores) {
    _lastDraftScores = scores || {};
    return _lastDraftScores;
  }

  function registerDraftClick(cardName) {
    if (cardName && _lastDraftIsDraft) _lastClickedDraftCard = cardName;
  }

  function resolvePassedToName(pv) {
    if (!pv || !pv.waitingFor || !pv.waitingFor.title) return '';

    var titleModel = pv.waitingFor.title;
    var titleMessage = typeof titleModel === 'string' ? titleModel : (titleModel.message || '');
    var titleData = typeof titleModel === 'string' ? [] : (titleModel.data || []);

    if (!/pass/i.test(titleMessage)) return '';

    if (Array.isArray(titleData) && titleData.length > 0) {
      var firstArg = titleData[0];
      if (firstArg && typeof firstArg.value === 'string') {
        var players = pv.players || [];
        var byColor = players.find(function(player) { return player.color === firstArg.value; });
        return byColor ? byColor.name : firstArg.value;
      }
    }

    if (typeof titleMessage === 'string') {
      var passMatch = titleMessage.match(/pass.*to\s+(.+)$/i);
      if (passMatch) return passMatch[1].trim();
    }

    return '';
  }

  function buildOfferedWithScores(ratings) {
    return Array.from(_lastDraftSet).map(function(name) {
      var score = _lastDraftScores[name];
      var rating = ratings && ratings[name];
      return {
        name: name,
        total: score ? score.total : (rating ? rating.s : 0),
        tier: score ? score.tier : (rating ? rating.t : '?'),
        baseTier: rating ? rating.t : '?',
        baseScore: rating ? rating.s : 0,
        reasons: score ? score.reasons : []
      };
    }).sort(function(a, b) {
      return b.total - a.total;
    });
  }

  function recordDraftPick(input) {
    var taken = input && input.taken;
    var passed = input && input.passed;
    var ratings = input && input.ratings;
    var getPlayerVueData = input && input.getPlayerVueData;
    var offeredWithScores = buildOfferedWithScores(ratings);
    var pv = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
    var passedTo = resolvePassedToName(pv);

    _draftHistory.push({
      round: _draftHistory.length + 1,
      offered: offeredWithScores,
      taken: taken,
      passed: passed,
      passedTo: passedTo
    });

    if (passedTo && passed && passed.length > 0) {
      if (!_oppPredictedCards[passedTo]) _oppPredictedCards[passedTo] = new Set();
      for (var i = 0; i < passed.length; i++) {
        _oppPredictedCards[passedTo].add(passed[i]);
      }
    }

    return _draftHistory[_draftHistory.length - 1];
  }

  function scheduleFallbackTakenDetection(input, capturedSet) {
    var setTimeoutFn = input && input.setTimeoutFn;
    var getMyHandNames = input && input.getMyHandNames;
    if (typeof setTimeoutFn !== 'function' || typeof getMyHandNames !== 'function') return;

    setTimeoutFn(function() {
      var myHand = new Set(getMyHandNames());
      for (var fname of capturedSet) {
        if (myHand.has(fname)) {
          var lastEntry = _draftHistory[_draftHistory.length - 1];
          if (lastEntry && !lastEntry.taken) {
            lastEntry.taken = fname;
            lastEntry.passed = lastEntry.passed.filter(function(name) { return name !== fname; });
          }
          break;
        }
      }
    }, 500);
  }

  function trackDraftHistory(input) {
    var documentObj = input && input.documentObj;
    var draftSelector = input && input.selectDraftSelector;
    var getMyHandNames = input && input.getMyHandNames;
    var getPlayerVueData = input && input.getPlayerVueData;
    var ratings = input && input.ratings;

    if (!documentObj || typeof documentObj.querySelectorAll !== 'function' || typeof draftSelector !== 'string') return;

    var selectCards = documentObj.querySelectorAll(draftSelector);
    if (selectCards.length === 0) {
      if (_lastDraftSet.size > 0 && _lastDraftIsDraft) {
        var taken = _lastClickedDraftCard && _lastDraftSet.has(_lastClickedDraftCard)
          ? _lastClickedDraftCard : null;
        var passed = [];
        for (var name of _lastDraftSet) {
          if (name !== taken) passed.push(name);
        }
        if (taken || passed.length > 0) {
          recordDraftPick({
            taken: taken,
            passed: passed,
            ratings: ratings,
            getPlayerVueData: getPlayerVueData
          });
        }
        if (!taken && _lastDraftSet.size > 0) {
          scheduleFallbackTakenDetection(input, new Set(_lastDraftSet));
        }
        _lastClickedDraftCard = null;
        _lastDraftSet = new Set();
        _lastDraftScores = {};
        _lastDraftIsDraft = false;
      }
      return;
    }

    var currentSet = new Set();
    selectCards.forEach(function(el) {
      var name = el.getAttribute('data-tm-card');
      if (name) currentSet.add(name);
    });

    var myHand = new Set(typeof getMyHandNames === 'function' ? getMyHandNames() : []);
    var inHandCount = 0;
    for (var cardName of currentSet) {
      if (myHand.has(cardName)) inHandCount++;
    }
    var isDraft = currentSet.size > 0 && inHandCount < currentSet.size / 2;

    if (!isDraft) {
      _lastDraftSet = new Set();
      _lastDraftIsDraft = false;
      return;
    }

    var draftChanged = false;
    if (currentSet.size !== _lastDraftSet.size) {
      draftChanged = true;
    } else {
      for (var prevName of _lastDraftSet) {
        if (!currentSet.has(prevName)) {
          draftChanged = true;
          break;
        }
      }
    }

    if (currentSet.size > 0 && _lastDraftSet.size > 0 && _lastDraftIsDraft && draftChanged) {
      var taken2 = _lastClickedDraftCard && _lastDraftSet.has(_lastClickedDraftCard)
        ? _lastClickedDraftCard : null;
      var passed2 = [];
      for (var previousName of _lastDraftSet) {
        if (!currentSet.has(previousName) && previousName !== taken2) passed2.push(previousName);
      }

      if (!taken2) {
        var myHand2 = new Set(typeof getMyHandNames === 'function' ? getMyHandNames() : []);
        for (var previousName2 of _lastDraftSet) {
          if (!currentSet.has(previousName2) && myHand2.has(previousName2)) {
            taken2 = previousName2;
            break;
          }
        }
        if (taken2) {
          passed2 = passed2.filter(function(name) { return name !== taken2; });
        }
      }

      if (taken2 || passed2.length > 0) {
        recordDraftPick({
          taken: taken2,
          passed: passed2,
          ratings: ratings,
          getPlayerVueData: getPlayerVueData
        });
      }
      _lastClickedDraftCard = null;
    }

    _lastDraftSet = currentSet;
    _lastDraftIsDraft = isDraft;
  }

  global.TM_CONTENT_DRAFT_TRACKER = {
    getDraftHistory: getDraftHistory,
    getOppPredictedCards: getOppPredictedCards,
    getLastDraftScores: getLastDraftScores,
    isLastDraftActive: isLastDraftActive,
    setLastDraftScores: setLastDraftScores,
    registerDraftClick: registerDraftClick,
    recordDraftPick: recordDraftPick,
    trackDraftHistory: trackDraftHistory
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
