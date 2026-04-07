// TM Tier Overlay - Content VP breakdown helpers
(function(global) {
  'use strict';

  function computeVPBreakdown(input) {
    var player = input && input.player;
    var pv = input && input.pv;
    var isGreeneryTile = input && input.isGreeneryTile;
    var isCityTile = input && input.isCityTile;
    var getPlayerTagCount = input && input.getPlayerTagCount;
    var cardN = input && input.cardN;
    var lookupCardData = input && input.lookupCardData;
    var cardVp = input && input.cardVp;
    var getFx = input && input.getFx;

    var bp = { tr: 0, greenery: 0, city: 0, cards: 0, milestones: 0, awards: 0, total: 0 };
    if (!player) return bp;

    var vb = player.victoryPointsBreakdown;
    if (vb && vb.total > 0) {
      bp.tr = vb.terraformRating || 0;
      bp.greenery = vb.greenery || 0;
      bp.city = vb.city || 0;
      bp.cards = vb.victoryPoints || 0;
      bp.milestones = vb.milestones || 0;
      bp.awards = vb.awards || 0;
      bp.total = vb.total;
      return bp;
    }

    bp.tr = player.terraformRating || 0;
    var pColor = player.color;

    if (pv && pv.game && pv.game.spaces && typeof isGreeneryTile === 'function' && typeof isCityTile === 'function') {
      var coordMap = {};
      for (var i = 0; i < pv.game.spaces.length; i++) {
        var sp = pv.game.spaces[i];
        if (sp.x != null && sp.y != null) coordMap[sp.x + ',' + sp.y] = sp;
      }
      for (var j = 0; j < pv.game.spaces.length; j++) {
        var sp2 = pv.game.spaces[j];
        if (sp2.color === pColor) {
          if (isGreeneryTile(sp2.tileType)) bp.greenery++;
          if (isCityTile(sp2.tileType) && sp2.x != null && sp2.y != null) {
            var deltas = [
              [-1, 0], [1, 0],
              [sp2.y % 2 === 0 ? -1 : 0, -1], [sp2.y % 2 === 0 ? 0 : 1, -1],
              [sp2.y % 2 === 0 ? -1 : 0, 1], [sp2.y % 2 === 0 ? 0 : 1, 1]
            ];
            for (var di = 0; di < deltas.length; di++) {
              var adjKey = (sp2.x + deltas[di][0]) + ',' + (sp2.y + deltas[di][1]);
              var adj = coordMap[adjKey];
              if (adj && isGreeneryTile(adj.tileType)) bp.city++;
            }
          }
        }
      }
    }

    var playerTagCount = function(plr, tag) {
      return typeof getPlayerTagCount === 'function' ? getPlayerTagCount(plr, tag) : 0;
    };
    if (player.tableau) {
      for (var ti = 0; ti < player.tableau.length; ti++) {
        var card = player.tableau[ti];
        var cn = typeof cardN === 'function' ? cardN(card) : (card && (card.name || card));

        var cvp = cardVp && typeof lookupCardData === 'function' ? lookupCardData(cardVp, cn) : null;
        if (cvp) {
          if (cvp.type === 'static') {
            bp.cards += (cvp.vp || 0);
          } else if (cvp.type === 'per_tag') {
            var tagCount = playerTagCount(player, cvp.tag);
            bp.cards += Math.floor(tagCount / (cvp.per || 1));
          } else if (cvp.type === 'per_resource' && card.resources > 0) {
            bp.cards += Math.floor(card.resources / (cvp.per || 1));
          } else if (cvp.type === 'per_city') {
            var totalCities = 0;
            if (pv && pv.players) {
              for (var ci = 0; ci < pv.players.length; ci++) totalCities += (pv.players[ci].citiesCount || 0);
            }
            bp.cards += Math.floor(totalCities / (cvp.per || 3));
          } else if (cvp.type === 'per_colony') {
            var totalColonies = 0;
            if (pv && pv.players) {
              for (var cli = 0; cli < pv.players.length; cli++) totalColonies += (pv.players[cli].coloniesCount || 0);
            }
            bp.cards += Math.floor(totalColonies / (cvp.per || 3));
          }
        }

        if (!cvp && card.resources && card.resources > 0) {
          var fx = typeof getFx === 'function' ? getFx(cn) : null;
          if (fx && fx.vpAcc) bp.cards += Math.floor(card.resources / (fx.vpPer || 1));
        }

        if (!cvp && card.victoryPoints !== undefined && card.victoryPoints !== 0) {
          if (typeof card.victoryPoints === 'number') bp.cards += card.victoryPoints;
          else if (card.victoryPoints && typeof card.victoryPoints.points === 'number') bp.cards += card.victoryPoints.points;
        }
      }
    }

    if (pv && pv.game && pv.game.milestones) {
      for (var mi = 0; mi < pv.game.milestones.length; mi++) {
        var ms = pv.game.milestones[mi];
        if (ms.color === pColor || ms.playerColor === pColor) bp.milestones += 5;
      }
    }

    if (pv && pv.game && pv.game.awards) {
      for (var ai = 0; ai < pv.game.awards.length; ai++) {
        var aw = pv.game.awards[ai];
        if (!(aw.playerName || aw.color)) continue;
        if (!aw.scores || aw.scores.length < 2) continue;
        var sorted = aw.scores.slice().sort(function(a, b) { return b.score - a.score; });
        var myEntry = sorted.find(function(s) { return s.color === pColor; });
        if (!myEntry) continue;
        var myRank = sorted.findIndex(function(s) { return s.color === pColor; });
        if (myRank === 0) bp.awards += 5;
        else if (myRank === 1) bp.awards += 2;
        if (myRank > 0 && sorted[0].score === myEntry.score) bp.awards = bp.awards - 2 + 5;
      }
    }

    bp.escapeVelocity = 0;
    if (pv && pv.game && pv.game.gameOptions && pv.game.gameOptions.escapeVelocityMode) {
      var evGen = pv.game.generation || 0;
      var evThreshold = pv.game.gameOptions.escapeVelocityThreshold || 35;
      var evPeriod = pv.game.gameOptions.escapeVelocityPeriod || 2;
      var evPenalty = pv.game.gameOptions.escapeVelocityPenalty || 1;
      if (evGen > evThreshold) {
        bp.escapeVelocity = -Math.floor((evGen - evThreshold) / evPeriod) * evPenalty;
      }
    }

    bp.total = bp.tr + bp.greenery + bp.city + bp.cards + bp.milestones + bp.awards + bp.escapeVelocity;
    return bp;
  }

  global.TM_CONTENT_VP_BREAKDOWN = {
    computeVPBreakdown: computeVPBreakdown
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
