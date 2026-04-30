// TM Tier Overlay — contextual game-state signal helpers
(function(global) {
  'use strict';

  function asNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : (fallback || 0);
  }

  function lower(value) {
    return String(value || '').toLowerCase();
  }

  function cardName(entry) {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    return entry.name || '';
  }

  function playerTableauNames(player) {
    var rows = (player && player.tableau) || [];
    var names = [];
    for (var i = 0; i < rows.length; i++) {
      var name = cardName(rows[i]);
      if (name) names.push(name);
    }
    return names;
  }

  function hasTableauCard(player, name) {
    var names = playerTableauNames(player);
    for (var i = 0; i < names.length; i++) {
      if (names[i] === name) return true;
    }
    return false;
  }

  function getPlayerColor(player) {
    return (player && player.color) || '';
  }

  function getPlayerVp(player) {
    var bp = player && player.victoryPointsBreakdown;
    return asNumber(bp && bp.total, 0);
  }

  function getPlayerTr(player) {
    return asNumber(player && player.terraformRating, 0);
  }

  function isActionPhase(state) {
    var game = state && state.game;
    var phase = (state && state.phase) || (game && game.phase) || '';
    return !phase || phase === 'action';
  }

  function tempStepsRemaining(game) {
    return Math.max(0, Math.ceil((8 - asNumber(game && game.temperature, -30)) / 2));
  }

  function oxygenStepsRemaining(game) {
    return Math.max(0, 14 - asNumber(game && game.oxygenLevel, 0));
  }

  function oceanStepsRemaining(game) {
    return Math.max(0, 9 - asNumber(game && game.oceans, 0));
  }

  function remainingTerraformingSteps(game) {
    return tempStepsRemaining(game) + oxygenStepsRemaining(game) + oceanStepsRemaining(game);
  }

  function eventTextParts(eventLike) {
    if (!eventLike) return [];
    if (typeof eventLike === 'string') return [eventLike];
    var parts = [];
    ['name', 'title', 'description', 'text'].forEach(function(key) {
      if (eventLike[key]) parts.push(eventLike[key]);
    });
    return parts;
  }

  function collectTurmoilEventText(game) {
    var turmoil = game && game.turmoil;
    var parts = [];
    if (turmoil) {
      parts = parts.concat(eventTextParts(turmoil.coming));
      parts = parts.concat(eventTextParts(turmoil.distant));
      parts = parts.concat(eventTextParts(turmoil.current));
    }
    parts = parts.concat(eventTextParts(game && game.comingGlobalEvent));
    parts = parts.concat(eventTextParts(game && game.distantGlobalEvent));
    return parts.join(' ');
  }

  function isHeatLossEvent(game) {
    var text = lower(collectTurmoilEventText(game));
    if (!text) return false;
    if (text.indexOf('corrosive rain') >= 0) return true;
    var mentionsHeat = text.indexOf('heat') >= 0 || text.indexOf('тепл') >= 0;
    if (!mentionsHeat) return false;
    return text.indexOf('lose') >= 0 ||
      text.indexOf('remove') >= 0 ||
      text.indexOf('all heat') >= 0 ||
      text.indexOf('теря') >= 0 ||
      text.indexOf('потер') >= 0 ||
      text.indexOf('сброс') >= 0 ||
      text.indexOf('убер') >= 0;
  }

  function signal(id, severity, label, anchor, title, reasons, action, priority) {
    return {
      id: id,
      severity: severity,
      label: label,
      anchor: anchor || {type: 'fallback'},
      title: title || label,
      reasons: reasons || [],
      action: action || '',
      priority: priority || 0
    };
  }

  function addHeatEventRisk(out, game, player) {
    var heat = asNumber(player && player.heat, 0);
    if (heat < 8 || !isHeatLossEvent(game)) return;
    var raises = Math.min(Math.floor(heat / 8), tempStepsRemaining(game));
    if (raises <= 0) return;
    out.push(signal(
      'heat-event-risk',
      'critical',
      'Heat event',
      {type: 'global', key: 'event'},
      'Incoming heat loss',
      [
        'Incoming event may remove heat.',
        'Current heat can raise temperature ' + raises + ' time' + (raises === 1 ? '' : 's') + '.'
      ],
      'Check the event before passing; spend heat only if it changes temperature, Thermalist, or finish timing.',
      88
    ));
  }

  function addPlantSpendRisk(out, game, player) {
    var oxygen = asNumber(game && game.oxygenLevel, 0);
    if (oxygen >= 14) return;
    var threshold = hasTableauCard(player, 'Ecoline') ? 7 : 8;
    var plants = asNumber(player && player.plants, 0);
    if (plants < threshold) return;
    var nearEnd = remainingTerraformingSteps(game) <= 5 || asNumber(game && game.generation, 1) >= 7;
    out.push(signal(
      'spend-plants',
      nearEnd ? 'warning' : 'info',
      'Greenery ready',
      {type: 'resource', key: 'plants'},
      'Spend plants',
      [
        'Plants are enough for greenery' + (threshold === 7 ? ' with Ecoline.' : '.'),
        nearEnd ? 'Endgame plant attacks and oxygen closure make waiting risky.' : 'Do not leave easy plant tempo exposed.'
      ],
      'Place greenery when it does not give away the finish.',
      nearEnd ? 80 : 35
    ));
  }

  function addFinishNowSignal(out, game, player, players) {
    var remaining = remainingTerraformingSteps(game);
    if (remaining > 5) return;
    var myColor = getPlayerColor(player);
    var myVp = getPlayerVp(player);
    var myTr = getPlayerTr(player);
    var bestOppVp = 0;
    var bestOppTr = 0;
    for (var i = 0; i < (players || []).length; i++) {
      var opp = players[i];
      if (!opp || getPlayerColor(opp) === myColor) continue;
      bestOppVp = Math.max(bestOppVp, getPlayerVp(opp));
      bestOppTr = Math.max(bestOppTr, getPlayerTr(opp));
    }
    var vpLead = myVp - bestOppVp;
    var trLead = myTr - bestOppTr;
    if (vpLead < 0 && trLead < 8) return;
    out.push(signal(
      'finish-now',
      'info',
      'Finish now',
      {type: 'global', key: 'terraforming'},
      'Endgame tempo',
      [
        remaining + ' terraforming step' + (remaining === 1 ? '' : 's') + ' remain.',
        'You are ahead or have a large TR lead; another generation can favor card engines.'
      ],
      'Prefer actions that close parameters this generation.',
      70
    ));
  }

  function awardFundCost(game, awardIndex) {
    var awards = (game && game.awards) || [];
    var funded = 0;
    for (var i = 0; i < awards.length; i++) {
      if (isClaimed(awards[i])) funded++;
    }
    if (funded <= 0) return 8;
    if (funded === 1) return 14;
    return 20;
  }

  function isClaimed(item) {
    return !!(item && (item.playerName || item.player || item.color || item.playerColor));
  }

  function slug(value) {
    return lower(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function addAwardSignals(out, game, player) {
    var awards = (game && game.awards) || [];
    var myColor = getPlayerColor(player);
    var mc = asNumber(player && (player.megacredits != null ? player.megacredits : player.megaCredits), 0);
    for (var i = 0; i < awards.length; i++) {
      var award = awards[i];
      if (!award || isClaimed(award) || !Array.isArray(award.scores)) continue;
      var myScore = 0;
      var bestOpp = 0;
      for (var si = 0; si < award.scores.length; si++) {
        var row = award.scores[si] || {};
        var score = asNumber(row.score, 0);
        if (row.color === myColor) myScore = score;
        else bestOpp = Math.max(bestOpp, score);
      }
      if (myScore <= 0 || myScore < bestOpp) continue;
      var cost = awardFundCost(game, i);
      if (mc < cost) continue;
      out.push(signal(
        'fund-' + slug(award.name),
        'warning',
        'Fund ' + award.name,
        {type: 'award', key: award.name},
        'Fund ' + award.name,
        [
          'Current lead: ' + myScore + ' vs ' + bestOpp + '.',
          'Funding now likely locks 5 VP before the table can react.'
        ],
        'Fund this award if no higher swing is available.',
        award.name === 'Thermalist' ? 85 : 65
      ));
    }
  }

  function addMilestoneSignals(out, game, player) {
    var milestones = (game && game.milestones) || [];
    var tags = (player && player.tags) || {};
    var mc = asNumber(player && (player.megacredits != null ? player.megacredits : player.megaCredits), 0);
    var events = asNumber(tags.event, 0);
    if (events < 5 || mc < 8) return;
    for (var i = 0; i < milestones.length; i++) {
      var ms = milestones[i];
      if (!ms || isClaimed(ms) || ms.name !== 'Legend') continue;
      out.push(signal(
        'claim-legend',
        'warning',
        'Claim Legend',
        {type: 'milestone', key: 'Legend'},
        'Claim Legend',
        [
          'You have ' + events + ' event tags.',
          'Milestone claim is a clean 5 VP before another player reaches it.'
        ],
        'Claim Legend now unless the action slot must close the game.',
        82
      ));
      return;
    }
  }

  function addEndgameClosureSignal(out, game) {
    var remaining = remainingTerraformingSteps(game);
    if (remaining > 2) return;
    out.push(signal(
      'endgame-close',
      'warning',
      'Ends game',
      {type: 'global', key: 'terraforming'},
      'Game can end immediately',
      [
        'Only ' + remaining + ' terraforming step' + (remaining === 1 ? '' : 's') + ' remain.',
        'Check whether ending now is better than another generation.'
      ],
      'Count final VP before moving a global parameter.',
      75
    ));
  }

  function uniqueById(signals) {
    var seen = {};
    var out = [];
    for (var i = 0; i < signals.length; i++) {
      var s = signals[i];
      if (!s || !s.id || seen[s.id]) continue;
      seen[s.id] = true;
      out.push(s);
    }
    out.sort(function(a, b) {
      return (b.priority || 0) - (a.priority || 0);
    });
    return out;
  }

  function computeGameSignals(state) {
    if (!state || !isActionPhase(state)) return [];
    var game = state.game || {};
    var player = state.thisPlayer || state.player || {};
    if (!player || !game) return [];
    var out = [];
    addHeatEventRisk(out, game, player);
    addPlantSpendRisk(out, game, player);
    addFinishNowSignal(out, game, player, state.players || []);
    addAwardSignals(out, game, player);
    addMilestoneSignals(out, game, player);
    addEndgameClosureSignal(out, game);
    return uniqueById(out);
  }

  global.TM_CONTENT_GAME_SIGNALS = {
    computeGameSignals: computeGameSignals,
    remainingTerraformingSteps: remainingTerraformingSteps,
    isHeatLossEvent: isHeatLossEvent
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
