// TM Tier Overlay - Content generation timer helpers
(function(global) {
  'use strict';

  var genStartTime = Date.now();
  var lastTrackedGen = 0;
  var genTimes = [];

  function getMegaCredits(player) {
    if (!player) return 0;
    var raw = player.megaCredits;
    if (raw == null) raw = player.megacredits;
    return Math.max(0, Number(raw) || 0);
  }

  function updateGenTimer(input) {
    var detectGeneration = input && input.detectGeneration;
    var canShowToast = input && input.canShowToast;
    var getPlayerVueData = input && input.getPlayerVueData;
    var showToast = input && input.showToast;
    var resetToastKeys = input && input.resetToastKeys;
    var estimateGensLeft = input && input.estimateGensLeft;
    var tmBrain = input && input.tmBrain;
    var dateNow = input && input.dateNow;

    if (typeof detectGeneration !== 'function') return;
    var gen = detectGeneration();
    var now = typeof dateNow === 'function' ? dateNow() : Date.now();

    if (gen !== lastTrackedGen && gen > 0) {
      if (lastTrackedGen > 0) {
        genTimes.push({ gen: lastTrackedGen, duration: now - genStartTime });
      }
      if (lastTrackedGen > 0 && typeof canShowToast === 'function' && canShowToast('gen', gen)) {
        var pvGen = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
        if (pvGen && pvGen.thisPlayer && typeof showToast === 'function') {
          var p = pvGen.thisPlayer;
          var tr = p.terraformRating || 0;
          var cards = p.playedCards ? p.playedCards.length : 0;
          var mc = getMegaCredits(p);
          showToast('Gen ' + gen + ' | TR ' + tr + ' | ' + cards + ' карт | ' + mc + ' MC', 'gen');
        }
      }
      genStartTime = now;
      lastTrackedGen = gen;
      if (typeof resetToastKeys === 'function') resetToastKeys();

      var pvLead = typeof getPlayerVueData === 'function' ? getPlayerVueData() : null;
      if (pvLead && pvLead.thisPlayer) {
        var leadInfo = null;
        if (tmBrain && typeof tmBrain.vpLead === 'function') {
          leadInfo = tmBrain.vpLead({ game: pvLead.game, thisPlayer: pvLead.thisPlayer, players: (pvLead.game && pvLead.game.players) || [] });
        }
        if (leadInfo && !leadInfo.winning && leadInfo.margin > 5) {
          if (typeof showToast === 'function') {
            showToast(leadInfo.bestOppName + ' лидирует: VP ' + leadInfo.bestOppScore + ' (ты ' + leadInfo.myScore + ', −' + leadInfo.margin + ')', 'info');
          }
        } else if (!leadInfo && pvLead.game && pvLead.game.players) {
          var myTR = pvLead.thisPlayer.terraformRating || 0;
          var oppLeader = null;
          var oppMaxTR = 0;
          for (var oli = 0; oli < pvLead.game.players.length; oli++) {
            var opl = pvLead.game.players[oli];
            if (opl.color === pvLead.thisPlayer.color) continue;
            var oplTR = opl.terraformRating || 0;
            if (oplTR > oppMaxTR) {
              oppMaxTR = oplTR;
              oppLeader = opl.name;
            }
          }
          if (oppLeader && oppMaxTR > myTR + 5 && typeof showToast === 'function') {
            showToast(oppLeader + ' лидирует: TR ' + oppMaxTR + ' (ты ' + myTR + ', −' + (oppMaxTR - myTR) + ')', 'info');
          }
        }
      }

      var pvHand = pvLead || (typeof getPlayerVueData === 'function' ? getPlayerVueData() : null);
      if (pvHand && pvHand.thisPlayer && typeof estimateGensLeft === 'function' && typeof showToast === 'function') {
        var handSize = pvHand.thisPlayer.cardsInHandNbr || 0;
        var gl = estimateGensLeft(pvHand);
        if (handSize > gl * 4 + 2 && gl <= 3) {
          showToast(handSize + ' карт в руке, ~' + gl + ' ген(ов) — не успеешь сыграть все', 'info');
        }
      }
    }
  }

  global.TM_CONTENT_GEN_TIMER = {
    updateGenTimer: updateGenTimer
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
