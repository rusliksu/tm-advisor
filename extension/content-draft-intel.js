// TM Tier Overlay - Draft intel helpers
(function(global) {
  'use strict';

  function createDraftIntelBanner(input) {
    var intel = input && input.intel;
    var ruName = input && input.ruName;
    var playerColor = input && input.playerColor;
    var documentObj = input && input.documentObj;
    if (!intel || !documentObj || typeof documentObj.createElement !== 'function') return null;

    var html = '<span style="color:#bb86fc">\u2190 </span>';
    html += '<span style="color:#aaa">From </span>';
    var fromColor = typeof playerColor === 'function' ? playerColor(intel.fromColor) : '#e0e0e0';
    html += '<span style="font-weight:bold;color:' + fromColor + '">' + intel.fromName + '</span>';

    if (intel.kept.length > 0) {
      var label = intel.keptNote === 'opponents' ? ' \u2014 opponents kept: ' : ' \u2014 kept: ';
      html += '<span style="color:#888">' + label + '</span>';
      html += intel.keptDetails.map(function(k) {
        var col = k.score >= 70 ? '#2ecc71' : k.score >= 55 ? '#f39c12' : '#e74c3c';
        var displayName = typeof ruName === 'function' ? ruName(k.name) : k.name;
        return '<span style="color:' + col + ';font-weight:bold">' + displayName + '</span>' +
          '<sup style="font-size:9px;color:#888">' + k.score + '/' + k.tier + '</sup>';
      }).join(', ');
    }

    var banner = documentObj.createElement('div');
    banner.className = 'tm-draft-intel';
    banner.style.cssText = 'font-size:11px;padding:4px 10px;margin:2px 0 4px 0;background:rgba(187,134,252,0.08);border-left:3px solid #bb86fc;border-radius:3px;';
    banner.innerHTML = html;
    return banner;
  }

  function getDraftPassTargetName(waitingFor) {
    var title = waitingFor && waitingFor.title;
    if (!title || !Array.isArray(title.data)) return null;

    for (var i = 0; i < title.data.length; i++) {
      var entry = title.data[i];
      if (entry && typeof entry.value === 'string' && entry.value.trim()) {
        return entry.value.trim();
      }
    }

    return null;
  }

  function getDraftIntel(input) {
    var currentCardNames = input && input.currentCardNames;
    var getPlayerVueData = input && input.getPlayerVueData;
    var detectGeneration = input && input.detectGeneration;
    var draftHistory = input && input.draftHistory;
    var ratings = input && input.ratings;

    if (!Array.isArray(currentCardNames) || typeof getPlayerVueData !== 'function') return null;

    var pv = getPlayerVueData();
    if (!pv || !pv.players || !pv.thisPlayer) return null;
    var gen = pv.game ? pv.game.generation : (typeof detectGeneration === 'function' ? detectGeneration() : 0);
    var phase = pv.game ? pv.game.phase : '';

    if (phase !== 'drafting' && phase !== 'initial_drafting') return null;

    var seating = pv.players.map(function(player) { return player.color; });
    var myColor = pv.thisPlayer.color;
    var myIdx = seating.indexOf(myColor);
    var numPlayers = seating.length;
    if (myIdx < 0 || numPlayers < 2) return null;

    var nextIdx = (myIdx + 1) % numPlayers;
    var prevIdx = (myIdx - 1 + numPlayers) % numPlayers;
    var fromIdx = -1;

    var waitingFor = pv.thisPlayer.waitingFor || pv.thisPlayer._waitingFor;
    var passTargetName = getDraftPassTargetName(waitingFor);
    if (passTargetName) {
      var targetPlayers = pv.players.filter(function(player) {
        return player && player.name === passTargetName;
      });
      if (targetPlayers.length === 1) {
        var toIdx = seating.indexOf(targetPlayers[0].color);
        if (toIdx === nextIdx) fromIdx = prevIdx;
        else if (toIdx === prevIdx) fromIdx = nextIdx;
      }
    }

    if (fromIdx < 0) {
      var passDir = gen % 2 === 1 ? 'left' : 'right';
      fromIdx = passDir === 'left' ? nextIdx : prevIdx;
    }

    var fromColor = seating[fromIdx];
    var fromPlayer = pv.players.find(function(player) { return player.color === fromColor; });
    var fromName = fromPlayer ? fromPlayer.name : fromColor;

    var genRounds = [];
    var draftHistoryState = Array.isArray(draftHistory) ? draftHistory : [];
    for (var i = draftHistoryState.length - 1; i >= 0; i--) {
      var draftRound = draftHistoryState[i];
      genRounds.unshift(draftRound);
      if (draftRound.offered && draftRound.offered.length >= 4) break;
    }

    var currentSet = new Set(currentCardNames);
    if (currentCardNames.length >= 4) return null;

    var intel = { fromName: fromName, fromColor: fromColor, kept: [], keptDetails: [] };

    if (numPlayers === 2 && genRounds.length >= 1) {
      var prevRound = genRounds[genRounds.length - 1];
      if (prevRound && prevRound.passed && prevRound.passed.length > 0) {
        var keptByOpp = [];
        prevRound.passed.forEach(function(cardName) {
          if (!currentSet.has(cardName)) keptByOpp.push(cardName);
        });
        intel.kept = keptByOpp;
        intel.keptDetails = keptByOpp.map(function(cardName) {
          var rating = ratings && ratings[cardName];
          return { name: cardName, score: rating ? rating.s : 0, tier: rating ? rating.t : '?' };
        });
      }
    }

    if (numPlayers === 3 && genRounds.length >= 2) {
      var prevPrevRound = genRounds[genRounds.length - 2];
      if (prevPrevRound && prevPrevRound.passed && prevPrevRound.passed.length > 0) {
        var previousPassed = new Set(prevPrevRound.passed);
        var missing = [];
        previousPassed.forEach(function(cardName) {
          if (!currentSet.has(cardName)) missing.push(cardName);
        });
        if (missing.length > 0 && missing.length <= 2) {
          intel.kept = missing;
          intel.keptDetails = missing.map(function(cardName) {
            var rating = ratings && ratings[cardName];
            return { name: cardName, score: rating ? rating.s : 0, tier: rating ? rating.t : '?' };
          });
          intel.keptNote = 'opponents';
        }
      }
    }

    return intel;
  }

  function syncDraftIntelBanner(input) {
    var scored = input && input.scored;
    var getDraftIntelFn = input && input.getDraftIntel;
    var playerColor = input && input.playerColor;
    var ruName = input && input.ruName;
    var documentObj = input && input.documentObj;
    if (!Array.isArray(scored) || typeof getDraftIntelFn !== 'function' || !documentObj) return;

    var old = documentObj.querySelector('.tm-draft-intel');
    if (old) old.remove();

    var currentNames = scored.map(function(item) { return item.name; });
    var intel = getDraftIntelFn(currentNames);
    if (!intel) return;

    var banner = createDraftIntelBanner({
      intel: intel,
      playerColor: playerColor,
      ruName: ruName,
      documentObj: documentObj
    });
    if (!banner) return;

    var wfSelect = documentObj.querySelector('.wf-component--select-card');
    if (wfSelect && wfSelect.parentNode) {
      wfSelect.parentNode.insertBefore(banner, wfSelect);
    }
  }

  function appendDraftInsights(input) {
    var insights = input && input.insights;
    var pv = input && input.pv;
    var draftHistory = input && input.draftHistory;
    var oppPredictedCards = input && input.oppPredictedCards;
    var ratings = input && input.ratings;
    var ruName = input && input.ruName;

    if (!Array.isArray(insights) || !pv) return insights;

    var draftHistoryState = Array.isArray(draftHistory) ? draftHistory : [];
    if (draftHistoryState.length === 0) return insights;

    var tookBest = 0;
    for (var dhi = 0; dhi < draftHistoryState.length; dhi++) {
      var entry = draftHistoryState[dhi];
      if (!entry.taken || !entry.offered || entry.offered.length === 0) continue;
      if (entry.offered[0].name === entry.taken) tookBest++;
    }

    var draftPct = Math.round(tookBest / draftHistoryState.length * 100);
    var draftColor = draftPct >= 70 ? '#2ecc71' : draftPct >= 50 ? '#f39c12' : '#e74c3c';
    insights.push({
      icon: '🎯',
      text: 'Драфт: лучшую в ' + tookBest + '/' + draftHistoryState.length + ' раундов (' + draftPct + '%)',
      color: draftColor
    });

    if (!pv.players || !oppPredictedCards || Object.keys(oppPredictedCards).length === 0) return insights;

    for (var oppColor in oppPredictedCards) {
      var oppPlayer = null;
      for (var i = 0; i < pv.players.length; i++) {
        if (pv.players[i].color === oppColor) {
          oppPlayer = pv.players[i];
          break;
        }
      }
      if (!oppPlayer || !oppPlayer.tableau) continue;

      var oppTableau = new Set();
      for (var ti = 0; ti < oppPlayer.tableau.length; ti++) {
        oppTableau.add(oppPlayer.tableau[ti].name || oppPlayer.tableau[ti]);
      }

      var passedCards = oppPredictedCards[oppColor];
      var oppTook = [];
      var oppSkipped = [];
      passedCards.forEach(function(cardName) {
        var rating = ratings && ratings[cardName];
        var info = { name: cardName, score: rating ? rating.s : 50, tier: rating ? rating.t : '?' };
        if (oppTableau.has(cardName)) oppTook.push(info);
        else oppSkipped.push(info);
      });

      if (oppTook.length === 0 && oppSkipped.length === 0) continue;

      var oppName = oppPlayer.name || oppColor;
      var tookStr = oppTook
        .sort(function(a, b) { return b.score - a.score; })
        .slice(0, 3)
        .map(function(card) { return (typeof ruName === 'function' ? ruName(card.name) : card.name) + '(' + card.score + ')'; })
        .join(', ');
      var skipStr = oppSkipped
        .sort(function(a, b) { return b.score - a.score; })
        .slice(0, 3)
        .map(function(card) { return (typeof ruName === 'function' ? ruName(card.name) : card.name) + '(' + card.score + ')'; })
        .join(', ');

      if (tookStr) insights.push({ icon: '👁', text: oppName + ' взял: ' + tookStr, color: '#e67e22' });
      if (skipStr) insights.push({ icon: '👁', text: oppName + ' пропустил: ' + skipStr, color: '#95a5a6' });
    }

    return insights;
  }

  global.TM_CONTENT_DRAFT_INTEL = {
    appendDraftInsights: appendDraftInsights,
    createDraftIntelBanner: createDraftIntelBanner,
    getDraftIntel: getDraftIntel,
    syncDraftIntelBanner: syncDraftIntelBanner
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
