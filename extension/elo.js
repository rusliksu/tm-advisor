// TM Elo Rating System — FFA multiplayer Elo for Terraforming Mars
// Stored in chrome.storage.local under 'tm_elo_data'
//
// Elo formula for FFA:
// - Each player compared pairwise vs every other player
// - Place determines win/draw/loss per pair
// - K-factor scales down as Elo increases (harder to climb at top)
// - Player count affects expected score distribution

/* eslint-disable */
(function() {
  'use strict';

  var STORAGE_KEY = 'tm_elo_data';
  var DEFAULT_ELO = 1500;
  var BASE_K = 32;

  // K-factor decreases as Elo increases
  function getK(elo) {
    if (elo < 1400) return BASE_K * 1.2;  // faster climb for newbies
    if (elo < 1600) return BASE_K;
    if (elo < 1800) return BASE_K * 0.8;
    if (elo < 2000) return BASE_K * 0.6;
    return BASE_K * 0.4;  // very slow at top
  }

  // Expected score (probability of beating opponent)
  function expectedScore(myElo, oppElo) {
    return 1 / (1 + Math.pow(10, (oppElo - myElo) / 400));
  }

  // Calculate Elo changes for a FFA game
  // players: [{name, place, corp}] — sorted or unsorted, place = 1,2,3...
  // Returns [{name, oldElo, newElo, delta, place, corp}]
  function calculateFFA(players, eloDb) {
    var n = players.length;
    if (n < 2) return [];

    var results = [];
    for (var i = 0; i < n; i++) {
      var p = players[i];
      var name = normalizeName(p.name);
      var myElo = (eloDb[name] && eloDb[name].elo) || DEFAULT_ELO;
      var k = getK(myElo);

      // Pairwise comparison: compare with every other player
      var totalExpected = 0;
      var totalActual = 0;

      for (var j = 0; j < n; j++) {
        if (i === j) continue;
        var oppName = normalizeName(players[j].name);
        var oppElo = (eloDb[oppName] && eloDb[oppName].elo) || DEFAULT_ELO;

        totalExpected += expectedScore(myElo, oppElo);

        // Actual score based on placement
        if (p.place < players[j].place) {
          totalActual += 1.0;  // beat them
        } else if (p.place === players[j].place) {
          totalActual += 0.5;  // tied
        }
        // else 0 (lost to them)
      }

      // Scale K by player count (more opponents = divide impact)
      var scaledK = k / (n - 1) * 1.5; // 1.5 multiplier to keep meaningful changes
      var delta = Math.round(scaledK * (totalActual - totalExpected));

      results.push({
        name: name,
        displayName: p.name,
        oldElo: myElo,
        newElo: myElo + delta,
        delta: delta,
        place: p.place,
        corp: p.corp || '',
      });
    }

    return results;
  }

  // Player aliases — map alternate names to canonical name
  var PLAYER_ALIASES = {
    'лёха': 'алексей',
    'леха': 'алексей',
    'genuinegold': 'илья',
  };

  function normalizeName(name) {
    var n = (name || '').trim().toLowerCase();
    return PLAYER_ALIASES[n] || n;
  }

  // ── Storage ──

  var _eloBootstrapped = false;

  function loadData(callback) {
    function onData(data) {
      // Auto-bootstrap: if no games recorded yet, try to fetch historical Elo from server
      if (!_eloBootstrapped && (!data.games || data.games.length === 0)) {
        _eloBootstrapped = true;
        try {
          fetch('/elo/elo-data.json').catch(function() { return fetch('https://rusliksu.github.io/tm-tierlist/elo-data.json'); })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(imported) {
              if (imported && imported.players && Object.keys(imported.players).length > 0) {
                saveData(imported, function() {
                  console.log('[TM Elo] Bootstrapped from server: ' + Object.keys(imported.players).length + ' players, ' + (imported.games || []).length + ' games');
                  callback(imported);
                });
              } else {
                callback(data);
              }
            })
            .catch(function() { callback(data); });
        } catch(e) {
          callback(data);
        }
        return;
      }
      callback(data);
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(STORAGE_KEY, function(result) {
        onData(result[STORAGE_KEY] || { players: {}, games: [] });
      });
    } else {
      // Fallback: localStorage
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        onData(raw ? JSON.parse(raw) : { players: {}, games: [] });
      } catch(e) {
        onData({ players: {}, games: [] });
      }
    }
  }

  function saveData(data, callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      var obj = {};
      obj[STORAGE_KEY] = data;
      chrome.storage.local.set(obj, callback || function(){});
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch(e) {}
      if (callback) callback();
    }
  }

  // ── Record a game ──

  // gameInfo: {
  //   server: 'knightbyte' | 'herokuapp' | 'bga',
  //   date: ISO string,
  //   generation: number,
  //   map: string,
  //   playerCount: number,
  //   players: [{name, place, vp, corp, tr}]
  // }
  function recordGame(gameInfo, callback) {
    loadData(function(data) {
      // Check for duplicate (same date + same players)
      var gameKey = gameInfo.date + '_' + gameInfo.players.map(function(p) {
        return normalizeName(p.name);
      }).sort().join(',');

      for (var gi = 0; gi < data.games.length; gi++) {
        if (data.games[gi]._key === gameKey) {
          if (callback) callback(null, 'duplicate');
          return;
        }
      }

      // Calculate Elo changes
      var results = calculateFFA(gameInfo.players, data.players);

      // Update player records
      for (var ri = 0; ri < results.length; ri++) {
        var r = results[ri];
        var key = r.name;
        if (!data.players[key]) {
          data.players[key] = {
            elo: DEFAULT_ELO,
            displayName: r.displayName,
            games: 0,
            wins: 0,
            top3: 0,
            totalVP: 0,
            corps: {},
          };
        }
        var player = data.players[key];
        player.elo = r.newElo;
        player.displayName = r.displayName;
        player.games++;
        if (r.place === 1) player.wins++;
        if (r.place <= 3) player.top3++;
        player.totalVP = (player.totalVP || 0) + (gameInfo.players[ri] ? (gameInfo.players[ri].vp || 0) : 0);

        // Track corps played
        if (r.corp) {
          player.corps[r.corp] = (player.corps[r.corp] || 0) + 1;
        }
      }

      // Store game record
      data.games.push({
        _key: gameKey,
        date: gameInfo.date,
        server: gameInfo.server || 'unknown',
        map: gameInfo.map || '',
        generation: gameInfo.generation || 0,
        playerCount: gameInfo.playerCount || gameInfo.players.length,
        results: results.map(function(r) {
          return {
            name: r.name, displayName: r.displayName,
            place: r.place, delta: r.delta,
            oldElo: r.oldElo, newElo: r.newElo,
            corp: r.corp,
          };
        }),
      });

      // Keep max 200 games
      if (data.games.length > 200) {
        data.games = data.games.slice(data.games.length - 200);
      }

      saveData(data, function() {
        if (callback) callback(results);
      });
    });
  }

  // ── Leaderboard ──

  function getLeaderboard(callback) {
    loadData(function(data) {
      var list = [];
      for (var key in data.players) {
        var p = data.players[key];
        if (p.games < 1) continue;
        var favCorp = '';
        var maxPlayed = 0;
        for (var corp in p.corps) {
          if (p.corps[corp] > maxPlayed) {
            maxPlayed = p.corps[corp];
            favCorp = corp;
          }
        }
        list.push({
          name: p.displayName || key,
          elo: p.elo,
          games: p.games,
          wins: p.wins,
          winRate: p.games > 0 ? Math.round(p.wins / p.games * 100) : 0,
          top3Rate: p.games > 0 ? Math.round(p.top3 / p.games * 100) : 0,
          avgVP: p.games > 0 ? Math.round(p.totalVP / p.games) : 0,
          favCorp: favCorp,
          favCorpCount: maxPlayed,
        });
      }
      list.sort(function(a, b) { return b.elo - a.elo; });
      callback(list, data.games);
    });
  }

  // ── Auto-record from game end ──

  function autoRecordFromBridge(bridgeData) {
    if (!bridgeData || !bridgeData.players) return;

    // Determine server from URL
    var server = 'unknown';
    var url = window.location.hostname || '';
    if (url.includes('knightbyte')) server = 'knightbyte';
    else if (url.includes('herokuapp')) server = 'herokuapp';
    else if (url.includes('boardgamearena')) server = 'bga';

    // Extract player results with VP and place
    var playerResults = [];
    var allPlayers = bridgeData.players || [];
    // Include self
    if (bridgeData.thisPlayer) {
      allPlayers = allPlayers.slice(); // copy
      var found = false;
      for (var ci = 0; ci < allPlayers.length; ci++) {
        if (allPlayers[ci].color === bridgeData.thisPlayer.color) { found = true; break; }
      }
      if (!found) allPlayers.push(bridgeData.thisPlayer);
    }

    // Sort by VP (descending) to determine place
    var sorted = allPlayers.slice().sort(function(a, b) {
      var vpA = 0, vpB = 0;
      if (a.victoryPointsBreakdown) vpA = a.victoryPointsBreakdown.total || 0;
      else vpA = a.terraformRating || 0;
      if (b.victoryPointsBreakdown) vpB = b.victoryPointsBreakdown.total || 0;
      else vpB = b.terraformRating || 0;
      return vpB - vpA;
    });

    // Deduplicate by normalized name (keep highest VP version)
    var seenNames = {};
    var deduped = [];
    for (var di = 0; di < sorted.length; di++) {
      var dp = sorted[di];
      var dName = normalizeName(dp.name);
      if (seenNames[dName]) continue;
      seenNames[dName] = true;
      deduped.push(dp);
    }
    sorted = deduped;

    for (var pi = 0; pi < sorted.length; pi++) {
      var p = sorted[pi];
      var vp = 0;
      if (p.victoryPointsBreakdown) vp = p.victoryPointsBreakdown.total || 0;
      else vp = p.terraformRating || 0;

      // Determine corp from tableau
      var corp = '';
      if (p.tableau && p.tableau.length > 0) {
        corp = p.tableau[0].name || p.tableau[0] || '';
      }

      // Handle ties: same VP = same place
      var place = pi + 1;
      if (pi > 0) {
        var prevVP = 0;
        var prev = sorted[pi - 1];
        if (prev.victoryPointsBreakdown) prevVP = prev.victoryPointsBreakdown.total || 0;
        else prevVP = prev.terraformRating || 0;
        if (vp === prevVP) place = playerResults[pi - 1].place; // same place as prev
      }

      playerResults.push({
        name: p.name || ('Player ' + (pi + 1)),
        place: place,
        vp: vp,
        corp: corp,
        tr: p.terraformRating || 0,
      });
    }

    if (playerResults.length < 2) return;

    var gameInfo = {
      server: server,
      date: new Date().toISOString(),
      generation: bridgeData.game ? bridgeData.game.generation : 0,
      map: bridgeData.game && bridgeData.game.gameOptions ? bridgeData.game.gameOptions.boardName : '',
      playerCount: playerResults.length,
      players: playerResults,
    };

    recordGame(gameInfo, function(results) {
      if (results && results.length > 0) {
        console.log('[TM-Elo] Game recorded:', results.map(function(r) {
          return r.displayName + ' ' + (r.delta >= 0 ? '+' : '') + r.delta + ' (' + r.newElo + ')';
        }).join(', '));
      }
    });
  }

  // ── Export ──

  // ── VP Margin Elo (alternative mode) ──

  function calculateFFA_VP(players, eloDb) {
    var n = players.length;
    if (n < 2) return [];

    var results = [];
    for (var i = 0; i < n; i++) {
      var p = players[i];
      var name = normalizeName(p.name);
      var myElo = (eloDb[name] && eloDb[name].elo_vp) || DEFAULT_ELO;
      var myVP = p.vp || 0;
      var k = getK(myElo);

      var totalExpected = 0;
      var totalActual = 0;

      for (var j = 0; j < n; j++) {
        if (i === j) continue;
        var oppName = normalizeName(players[j].name);
        var oppElo = (eloDb[oppName] && eloDb[oppName].elo_vp) || DEFAULT_ELO;
        var oppVP = players[j].vp || 0;

        totalExpected += expectedScore(myElo, oppElo);

        if (myVP > oppVP) {
          var margin = Math.min((myVP - oppVP) / 20.0, 1.0);
          totalActual += 0.5 + margin * 0.5;
        } else if (myVP === oppVP) {
          totalActual += 0.5;
        } else {
          var lossMargin = Math.min((oppVP - myVP) / 20.0, 1.0);
          totalActual += 0.5 - lossMargin * 0.5;
        }
      }

      var scaledK = k / (n - 1) * 1.5;
      var delta = Math.round(scaledK * (totalActual - totalExpected));

      results.push({
        name: name, displayName: p.name,
        oldElo: myElo, newElo: myElo + delta, delta: delta,
        place: p.place, corp: p.corp || '', vp: myVP,
      });
    }
    return results;
  }

  // ── Import historical data ──

  function importData(importJson, callback) {
    loadData(function(existing) {
      // Merge: imported data overwrites existing
      var data = importJson;
      // Keep existing games that aren't in import (by _key)
      var importKeys = new Set((data.games || []).map(function(g) { return g._key; }));
      for (var ei = 0; ei < (existing.games || []).length; ei++) {
        var eg = existing.games[ei];
        if (!importKeys.has(eg._key)) {
          data.games.push(eg);
        }
      }
      saveData(data, function() {
        if (callback) callback(data);
      });
    });
  }

  window.TM_ELO = {
    calculateFFA: calculateFFA,
    calculateFFA_VP: calculateFFA_VP,
    recordGame: recordGame,
    getLeaderboard: getLeaderboard,
    autoRecordFromBridge: autoRecordFromBridge,
    importData: importData,
    loadData: loadData,
    saveData: saveData,
    DEFAULT_ELO: DEFAULT_ELO,
  };

})();
