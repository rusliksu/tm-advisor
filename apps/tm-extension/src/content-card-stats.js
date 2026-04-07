// TM Tier Overlay - Content card stats helpers
(function(global) {
  'use strict';

  var _cardStatsCache = null;

  function loadCardStats(input) {
    var callback = input && input.callback;
    var safeStorage = input && input.safeStorage;
    if (typeof callback !== 'function' || typeof safeStorage !== 'function') return;

    if (_cardStatsCache) {
      callback(_cardStatsCache);
      return;
    }

    safeStorage(function(s) {
      s.local.get({ tm_card_stats: { cards: {} } }, function(r) {
        _cardStatsCache = r.tm_card_stats;
        callback(_cardStatsCache);
      });
    });
  }

  function preloadCardStats(input) {
    loadCardStats({
      callback: function() {},
      safeStorage: input && input.safeStorage
    });
  }

  function saveCardStats(input) {
    var stats = input && input.stats;
    var safeStorage = input && input.safeStorage;
    _cardStatsCache = stats;
    if (typeof safeStorage !== 'function') return;
    safeStorage(function(s) {
      s.local.set({ tm_card_stats: stats });
    });
  }

  function getCardStats(name) {
    return _cardStatsCache && _cardStatsCache.cards ? _cardStatsCache.cards[name] : null;
  }

  function recordGameStats(input) {
    var getPlayerVueData = input && input.getPlayerVueData;
    var computeVPBreakdown = input && input.computeVPBreakdown;
    var getFx = input && input.getFx;
    var safeStorage = input && input.safeStorage;
    var tmLog = input && input.tmLog;
    if (typeof getPlayerVueData !== 'function' || typeof computeVPBreakdown !== 'function') return;

    var pv = getPlayerVueData();
    if (!pv || !pv.thisPlayer || !pv.players) return;

    var myColor = pv.thisPlayer.color;
    var myBP = computeVPBreakdown(pv.thisPlayer, pv);
    var rankedPlayers = [pv.thisPlayer].concat((pv.players || []).filter(function(p) { return p && p.color !== myColor; }))
      .map(function(p) {
        return { color: p.color, total: computeVPBreakdown(p, pv).total };
      })
      .sort(function(a, b) { return b.total - a.total; });
    for (var rp = 0; rp < rankedPlayers.length; rp++) {
      rankedPlayers[rp].place = (rp > 0 && rankedPlayers[rp - 1].total === rankedPlayers[rp].total)
        ? rankedPlayers[rp - 1].place
        : rp + 1;
    }
    var myPlace = rankedPlayers.length;
    for (var mpi = 0; mpi < rankedPlayers.length; mpi++) {
      if (rankedPlayers[mpi].color === myColor) {
        myPlace = rankedPlayers[mpi].place;
        break;
      }
    }
    var playerCount = rankedPlayers.length;
    var myPlaceScore = playerCount > 1 ? Math.max(0, Math.min(1, 1 - ((myPlace - 1) / (playerCount - 1)))) : 1;

    var iWon = true;
    for (var i = 0; i < pv.players.length; i++) {
      if (pv.players[i].color !== myColor) {
        var oppBP = computeVPBreakdown(pv.players[i], pv);
        if (oppBP.total > myBP.total) { iWon = false; break; }
      }
    }

    var hasColonies = !!(pv.game && pv.game.gameOptions && pv.game.gameOptions.coloniesExtension);
    var hasTurmoil = !!(pv.game && pv.game.gameOptions && pv.game.gameOptions.turmoilExtension);
    var hasVenus = !!(pv.game && pv.game.gameOptions && pv.game.gameOptions.venusNextExtension);
    var hasWGT = !!(pv.game && pv.game.gameOptions && (pv.game.gameOptions.solarPhaseOption || pv.game.gameOptions.worldGovernmentTerraforming));

    loadCardStats({
      safeStorage: safeStorage,
      callback: function(stats) {
        if (!stats || !stats.cards) stats = { cards: {} };
        var myTableau = pv.thisPlayer.tableau || [];
        for (var ti = 0; ti < myTableau.length; ti++) {
          var cn = myTableau[ti].name || myTableau[ti];
          if (!cn) continue;

          var cardVP = 0;
          if (myTableau[ti].victoryPoints !== undefined) {
            if (typeof myTableau[ti].victoryPoints === 'number') cardVP = myTableau[ti].victoryPoints;
            else if (myTableau[ti].victoryPoints && typeof myTableau[ti].victoryPoints.points === 'number') cardVP = myTableau[ti].victoryPoints.points;
          }
          if (myTableau[ti].resources && myTableau[ti].resources > 0) {
            var fx = typeof getFx === 'function' ? getFx(cn) : null;
            if (fx && fx.vpAcc) {
              var perVP = fx.vpPer || 1;
              cardVP += Math.floor(myTableau[ti].resources / perVP);
            }
          }

          if (!stats.cards[cn]) {
            stats.cards[cn] = {
              timesPlayed: 0,
              totalVP: 0,
              maxVP: 0,
              wins: 0,
              losses: 0,
              genPlayedSum: 0,
              placeScoreSum: 0,
              avgPlaceScore: 0,
              contexts: {}
            };
          }

          var cs = stats.cards[cn];
          cs.timesPlayed++;
          cs.totalVP += cardVP;
          if (cardVP > cs.maxVP) cs.maxVP = cardVP;
          if (iWon) cs.wins++;
          else cs.losses++;
          cs.placeScoreSum = (cs.placeScoreSum || 0) + myPlaceScore;
          cs.avgPlaceScore = Math.round((cs.placeScoreSum / cs.timesPlayed) * 100) / 100;

          if (hasColonies) {
            if (!cs.contexts.withColonies) cs.contexts.withColonies = { count: 0, totalVP: 0 };
            cs.contexts.withColonies.count++;
            cs.contexts.withColonies.totalVP += cardVP;
          }
          if (hasTurmoil) {
            if (!cs.contexts.withTurmoil) cs.contexts.withTurmoil = { count: 0, totalVP: 0 };
            cs.contexts.withTurmoil.count++;
            cs.contexts.withTurmoil.totalVP += cardVP;
          }
          if (hasVenus) {
            if (!cs.contexts.withVenus) cs.contexts.withVenus = { count: 0, totalVP: 0 };
            cs.contexts.withVenus.count++;
            cs.contexts.withVenus.totalVP += cardVP;
          }
          if (hasWGT) {
            if (!cs.contexts.withWGT) cs.contexts.withWGT = { count: 0, totalVP: 0 };
            cs.contexts.withWGT.count++;
            cs.contexts.withWGT.totalVP += cardVP;
          }
        }

        saveCardStats({ stats: stats, safeStorage: safeStorage });
        if (typeof tmLog === 'function') tmLog('game', 'Card stats recorded for ' + myTableau.length + ' cards');
      }
    });
  }

  global.TM_CONTENT_CARD_STATS = {
    getCardStats: getCardStats,
    loadCardStats: loadCardStats,
    preloadCardStats: preloadCardStats,
    recordGameStats: recordGameStats,
    saveCardStats: saveCardStats
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
