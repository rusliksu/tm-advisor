// TM Tier Overlay - Current action recommendation helpers
(function(global) {
  'use strict';

  var BOX_CLASS = 'tm-action-recommendation';
  var TARGET_CLASS = 'tm-action-recommendation-target';
  var CARD_TARGET_CLASS = 'tm-action-recommendation-card-target';

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : (fallback || 0);
  }

  function lower(value) {
    return String(value || '').toLowerCase();
  }

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeText(value) {
    return compactText(value).toLowerCase();
  }

  function shortText(value, maxLen) {
    var text = compactText(value);
    var limit = maxLen || 72;
    if (text.length <= limit) return text;
    return text.substring(0, limit - 1) + '…';
  }

  function removeNode(node) {
    if (!node) return;
    if (typeof node.remove === 'function') {
      node.remove();
      return;
    }
    if (node.parentNode && typeof node.parentNode.removeChild === 'function') {
      node.parentNode.removeChild(node);
    }
  }

  function getWaitingFor(state) {
    if (!state) return null;
    var player = state.thisPlayer || state.player || {};
    return state._waitingFor ||
      state.waitingFor ||
      player._waitingFor ||
      player.waitingFor ||
      null;
  }

  function isActionPhase(state) {
    var game = state && state.game;
    var phase = (state && state.phase) || (game && game.phase) || '';
    return !phase || phase === 'action';
  }

  function sameColor(a, b) {
    return !!a && !!b && lower(a) === lower(b);
  }

  function colorOf(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value.color || value.playerColor || value.activePlayer || '';
  }

  function activeColorFromState(state) {
    var game = (state && state.game) || {};
    return colorOf(state && (state.activePlayerColor || state.activePlayer || state.currentPlayerColor || state.currentPlayer)) ||
      colorOf(game.activePlayerColor || game.activePlayer || game.currentPlayerColor || game.currentPlayer);
  }

  function myPlayerRow(state) {
    var myColor = colorOf(state && state.thisPlayer);
    var players = asArray((state && state.players) || (state && state.game && state.game.players));
    for (var i = 0; i < players.length; i++) {
      if (sameColor(colorOf(players[i]), myColor)) return players[i];
    }
    return state && state.thisPlayer;
  }

  function activePlayerRow(state) {
    var players = asArray((state && state.players) || (state && state.game && state.game.players));
    for (var i = 0; i < players.length; i++) {
      if (players[i] && players[i].isActive === true) return players[i];
    }
    return null;
  }

  function isMyActionTurn(state) {
    if (!state || !state.thisPlayer) return false;
    var myColor = colorOf(state.thisPlayer);
    var myRow = myPlayerRow(state);
    if (myRow && (myRow.isActive === false || myRow.active === false)) return false;

    var activeRow = activePlayerRow(state);
    if (activeRow) return sameColor(colorOf(activeRow), myColor);

    var activeColor = activeColorFromState(state);
    if (activeColor && myColor) return sameColor(activeColor, myColor);

    return true;
  }

  function isActionChoicePrompt(waitingFor) {
    return !!(waitingFor && waitingFor.type === 'or' && Array.isArray(waitingFor.options) && waitingFor.options.length > 0);
  }

  function cloneStateWithWaitingFor(state, waitingFor) {
    var out = {};
    var key;
    for (key in (state || {})) {
      if (Object.prototype.hasOwnProperty.call(state, key)) out[key] = state[key];
    }
    out._waitingFor = waitingFor;
    out.waitingFor = waitingFor;
    return out;
  }

  function renderTitle(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value !== 'object') return String(value);
    if (typeof value.message === 'string') {
      var data = asArray(value.data);
      return value.message.replace(/\$\{(\d+)\}/g, function(match, indexText) {
        var entry = data[Number(indexText)];
        if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')) {
          return String(entry.value);
        }
        return entry == null ? '' : String(entry);
      });
    }
    return renderTitle(value.title || value.buttonLabel || value.label || value.name || '');
  }

  function optionTitle(option) {
    if (!option) return '';
    return compactText(renderTitle(option.title) || renderTitle(option.buttonLabel) || renderTitle(option.type));
  }

  function isPlayedCardActionLabel(label) {
    var low = lower(label);
    return (low.indexOf('played') >= 0 && low.indexOf('action') >= 0) ||
      low.indexOf('perform an action') >= 0;
  }

  function isPlayProjectCardLabel(label) {
    var low = lower(label);
    if (isPlayedCardActionLabel(low)) return false;
    return low.indexOf('project card') >= 0 || (/\bplay\b/.test(low) && low.indexOf('card') >= 0);
  }

  function normalizeActionLabel(label) {
    var text = compactText(label);
    if (!text) return '';
    text = text.replace(/\$\{[^}]+\}/g, '').replace(/\s+/g, ' ').trim();
    var low = lower(text);
    if (low.indexOf('sell patents') >= 0 || low.indexOf('sell patent') >= 0) return 'Sell patents';
    if (low.indexOf('standard project') >= 0) return 'Standard project';
    if (isPlayedCardActionLabel(low) || low.indexOf('action') >= 0 || low.indexOf('use') >= 0) return 'Use played-card action';
    if (isPlayProjectCardLabel(low)) return 'Play card';
    if (low.indexOf('convert') >= 0 && low.indexOf('heat') >= 0) return 'Convert heat';
    if (low.indexOf('convert') >= 0 && low.indexOf('plant') >= 0) return 'Place greenery';
    if (low.indexOf('fund') >= 0 && low.indexOf('award') >= 0) return 'Fund award';
    if (low.indexOf('claim') >= 0 && low.indexOf('milestone') >= 0) return 'Claim milestone';
    if (low === 'pass' || low.indexOf('pass for this generation') >= 0) return 'Pass';
    return text;
  }

  function visibleCards(cards) {
    var out = [];
    var rows = asArray(cards);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].isDisabled !== true) out.push(rows[i]);
    }
    return out;
  }

  function countCitiesInPlay(state) {
    var players = asArray((state && state.players) || (state && state.game && state.game.players));
    var count = 0;
    for (var i = 0; i < players.length; i++) count += Math.max(0, asNumber(players[i] && players[i].citiesCount, 0));

    var spaces = asArray(state && state.game && state.game.spaces);
    var boardCount = 0;
    for (var si = 0; si < spaces.length; si++) {
      var tileType = spaces[si] && spaces[si].tileType;
      if (tileType === 0 || tileType === 'city' || tileType === 5 || tileType === 'capital') boardCount++;
    }
    return Math.max(count, boardCount);
  }

  function hasCorpName(state, corpName) {
    var target = lower(corpName);
    var player = (state && state.thisPlayer) || {};
    if (lower(player.corporation || player.corp) === target) return true;
    var tableau = asArray(player.tableau);
    for (var i = 0; i < tableau.length; i++) {
      if (lower(tableau[i] && (tableau[i].name || tableau[i])) === target) return true;
    }
    return false;
  }

  function estimateGensLeft(state, estimateGensLeftFn) {
    if (typeof estimateGensLeftFn === 'function') {
      var estimated = asNumber(estimateGensLeftFn(state), 0);
      if (estimated > 0) return estimated;
    }
    var explicit = asNumber(state && (state.gensLeft || state.estimatedGensLeft), 0);
    if (explicit > 0) return explicit;
    var gen = asNumber(state && state.game && state.game.generation, 0);
    return gen > 0 ? Math.max(1, 9 - gen + 1) : 3;
  }

  var DEFERRED_SCALING_CASHOUTS = {
    'Terraforming Ganymede': { tag: 'jovian' },
    'Social Events': { tag: 'mars' },
  };

  var DEFERRED_LAST_WINDOW_CASHOUTS = {
    "CEO's Favorite Project": true,
  };

  var FINAL_WINDOW_ENGINE_CARDS = {
    Sponsors: true,
  };

  function cardName(card) {
    return card && (card.name || card.cardName || card);
  }

  function cardTags(card) {
    if (!card) return [];
    if (Array.isArray(card.tags)) return card.tags;
    var name = cardName(card);
    var globalTags = global && global.TM_CARD_TAGS;
    return (globalTags && name && globalTags[name]) || [];
  }

  function cardHasTag(card, targetTag) {
    var tags = cardTags(card);
    var target = String(targetTag || '').toLowerCase();
    for (var i = 0; i < tags.length; i++) {
      if (String(tags[i] || '').toLowerCase() === target) return true;
    }
    return false;
  }

  function countSpaceEventTriggers(cards, selfName) {
    var count = 0;
    cards = asArray(cards);
    for (var i = 0; i < cards.length; i++) {
      var name = cardName(cards[i]);
      if (!name || name === selfName) continue;
      if (cardHasTag(cards[i], 'space') && cardHasTag(cards[i], 'event')) count++;
    }
    return count;
  }

  function shouldDeferTriggerSetup(card, state, rankableCards, estimateGensLeftFn) {
    var name = cardName(card);
    if (name !== 'Optimal Aerobraking') return false;
    var triggers = countSpaceEventTriggers(rankableCards, name);
    var gensLeft = estimateGensLeft(state, estimateGensLeftFn);
    if (triggers >= 2) return false;
    if (triggers >= 1 && gensLeft <= 1) return false;
    return true;
  }

  function shouldDeferGreenhouses(state, estimateGensLeftFn) {
    var cities = countCitiesInPlay(state);
    if (cities <= 0) return false;
    var player = (state && state.thisPlayer) || {};
    var plants = Math.max(0, asNumber(player.plants, 0));
    var plantCost = hasCorpName(state, 'Ecoline') ? 7 : 8;
    var before = Math.floor(plants / plantCost);
    var after = Math.floor((plants + cities) / plantCost);
    if (after > before) return false;
    return estimateGensLeft(state, estimateGensLeftFn) > 1;
  }

  function shouldDeferScalingCashout(card, state, rankableCards, estimateGensLeftFn) {
    var name = cardName(card);
    var def = DEFERRED_SCALING_CASHOUTS[name];
    if (!def) return false;
    var gensLeft = estimateGensLeft(state, estimateGensLeftFn);
    return gensLeft > 1;
  }

  function hasOtherPlayedCardAction(playContext) {
    var waitingFor = playContext && playContext.waitingFor;
    var currentIndex = playContext && playContext.optionIndex;
    var options = asArray(waitingFor && waitingFor.options);
    for (var i = 0; i < options.length; i++) {
      if (i === currentIndex) continue;
      var opt = options[i];
      if (!isPlayedCardActionLabel(optionTitle(opt))) continue;
      if (visibleCards(opt && opt.cards).length > 0) return true;
    }
    return false;
  }

  function shouldDeferLastWindowCashout(card, state, estimateGensLeftFn, playContext) {
    var name = cardName(card);
    if (!DEFERRED_LAST_WINDOW_CASHOUTS[name]) return false;
    if (estimateGensLeft(state, estimateGensLeftFn) > 1) return true;
    return hasOtherPlayedCardAction(playContext);
  }

  function requiresVenusCompletion(game) {
    var opts = (game && (game.gameOptions || game.options)) || {};
    return opts.requiresVenusTrackCompletion === true || opts.requiresVenusTrackCompletion === 'true';
  }

  function isFullyTerraformedFinalWindow(state) {
    var game = (state && state.game) || {};
    if (game.isTerraformed === true) return true;
    var temp = asNumber(game.temperature, -30);
    var oxygen = asNumber(game.oxygenLevel != null ? game.oxygenLevel : game.oxygen, 0);
    var oceans = asNumber(game.oceans, 0);
    if (temp < 8 || oxygen < 14 || oceans < 9) return false;
    if (requiresVenusCompletion(game)) {
      var venus = asNumber(game.venusScaleLevel != null ? game.venusScaleLevel : game.venus, 0);
      if (venus < 30) return false;
    }
    return true;
  }

  function hasFinalWindowScoringSignal(card) {
    var name = cardName(card);
    if (DEFERRED_LAST_WINDOW_CASHOUTS[name]) return true;
    var directVp = asNumber(card && (card.vp != null ? card.vp : card.victoryPoints), 0);
    if (directVp > 0) return true;
    var reason = lower(card && card.reason);
    return /\b(vp|point|points|score|scoring|cashout|animal|jovian|greenery)\b/.test(reason);
  }

  function hasFinalWindowEngineSignal(card) {
    var name = cardName(card);
    if (FINAL_WINDOW_ENGINE_CARDS[name]) return true;
    var reason = lower(card && card.reason);
    return /\b(prod|production|engine|tempo|income|draw|discount|steel|titanium|energy|heat)\b/.test(reason);
  }

  function shouldDeferFinalWindowEngineCard(card, state, estimateGensLeftFn) {
    if (estimateGensLeft(state, estimateGensLeftFn) > 1) return false;
    if (!isFullyTerraformedFinalWindow(state)) return false;
    if (hasFinalWindowScoringSignal(card)) return false;
    return hasFinalWindowEngineSignal(card);
  }

  function shouldDeferPlayCard(card, state, rankableCards, estimateGensLeftFn, playContext) {
    var name = cardName(card);
    if (name === 'Greenhouses') return shouldDeferGreenhouses(state, estimateGensLeftFn);
    if (shouldDeferFinalWindowEngineCard(card, state, estimateGensLeftFn)) return true;
    if (shouldDeferLastWindowCashout(card, state, estimateGensLeftFn, playContext)) return true;
    if (shouldDeferTriggerSetup(card, state, rankableCards, estimateGensLeftFn)) return true;
    return shouldDeferScalingCashout(card, state, rankableCards, estimateGensLeftFn);
  }

  function metalSpendTargetForAdvancedAlloys(card, state) {
    if (!card || cardName(card) === 'Advanced Alloys') return false;
    var player = (state && state.thisPlayer) || {};
    if (cardHasTag(card, 'building') && Math.max(0, asNumber(player.steel, 0)) > 0) return true;
    if (cardHasTag(card, 'space') && Math.max(0, asNumber(player.titanium, 0)) > 0) return true;
    return false;
  }

  function advancedAlloysSetupCard(rankedCards, state, rankableCards) {
    rankableCards = asArray(rankableCards);
    var hasAlloys = false;
    var hasTarget = false;
    var alloysCost = 9;
    for (var i = 0; i < rankableCards.length; i++) {
      if (cardName(rankableCards[i]) === 'Advanced Alloys') {
        hasAlloys = true;
        if (rankableCards[i].calculatedCost != null || rankableCards[i].cost != null) {
          alloysCost = asNumber(rankableCards[i].calculatedCost != null ? rankableCards[i].calculatedCost : rankableCards[i].cost, 9);
        }
      }
      if (metalSpendTargetForAdvancedAlloys(rankableCards[i], state)) hasTarget = true;
    }
    var player = (state && state.thisPlayer) || {};
    if (asNumber(player.megaCredits || player.megacredits, 0) < alloysCost) return null;
    if (!hasAlloys || !hasTarget) return null;
    rankedCards = asArray(rankedCards);
    for (var ri = 0; ri < rankedCards.length; ri++) {
      if (cardName(rankedCards[ri]) === 'Advanced Alloys') return rankedCards[ri];
    }
    return null;
  }

  function bestNonDeferredCard(rankedCards, state, rankableCards, estimateGensLeftFn, playContext) {
    rankedCards = asArray(rankedCards);
    var setupCard = advancedAlloysSetupCard(rankedCards, state, rankableCards);
    if (setupCard && !shouldDeferPlayCard(setupCard, state, rankableCards, estimateGensLeftFn, playContext)) return setupCard;
    for (var i = 0; i < rankedCards.length; i++) {
      if (!shouldDeferPlayCard(rankedCards[i], state, rankableCards, estimateGensLeftFn, playContext)) return rankedCards[i];
    }
    return null;
  }

  function reasonRowsFromText(text, tone) {
    var raw = compactText(text);
    if (!raw) return [];
    var pieces = raw.split(/\s+[·|]\s+/);
    var rows = [];
    for (var i = 0; i < pieces.length; i++) {
      var piece = compactText(pieces[i]);
      if (piece) rows.push({text: piece, tone: tone || 'positive'});
    }
    return rows;
  }

  function addReasonRows(target, rows) {
    rows = asArray(rows);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row) continue;
      if (typeof row === 'string') {
        target.push({text: row, tone: 'positive'});
      } else if (row.text) {
        target.push({
          text: String(row.text),
          tone: row.tone === 'negative' ? 'negative' : 'positive',
          value: typeof row.value === 'number' && isFinite(row.value) ? row.value : undefined
        });
      }
    }
  }

  function dedupeReasons(rows) {
    var seen = {};
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var text = compactText(rows[i] && rows[i].text);
      if (!text || seen[text]) continue;
      seen[text] = true;
      out.push(rows[i]);
      if (out.length >= 4) break;
    }
    return out;
  }

  function buildFromSignals(signals) {
    var rows = asArray(signals).slice();
    rows.sort(function(a, b) {
      return asNumber(b && b.priority, 0) - asNumber(a && a.priority, 0);
    });
    for (var i = 0; i < rows.length; i++) {
      var s = rows[i];
      if (!s) continue;
      if (s.severity !== 'critical' && s.severity !== 'warning') continue;
      var title = s.label || s.title || '';
      if (!title) continue;
      var reasonRows = [];
      addReasonRows(reasonRows, s.reasons || []);
      if (s.action) reasonRows.push({text: s.action, tone: 'positive'});
      return {
        id: 'signal:' + (s.id || title),
        kind: 'signal',
        title: title,
        subtitle: s.title || '',
        optionTitle: title,
        score: asNumber(s.priority, 0),
        reasonRows: dedupeReasons(reasonRows),
        alt: '',
        anchor: s.anchor || {type: 'fallback'}
      };
    }
    return null;
  }

  function optionIndexMatching(waitingFor, matcher) {
    var options = asArray(waitingFor && waitingFor.options);
    for (var i = 0; i < options.length; i++) {
      if (matcher(optionTitle(options[i]), options[i])) return i;
    }
    return -1;
  }

  function ownedResourceType(card) {
    if (!card || !card.name) return '';
    var raw = card.resourceType || card.resource_type || '';
    var data = null;
    var cardData = global && global.TM_CARD_DATA;
    if (cardData) data = cardData[card.name] || cardData[String(card.name).replace(/:ares$/i, '')];
    if (!raw && data) raw = data.resourceType || data.resource_type || data.res || '';
    if (!raw) {
      var known = {
        Psychrophiles: 'microbe',
        'Titan Shuttles': 'floater',
        'Neptunian Power Consultants': 'hydroelectric resource',
      };
      raw = known[card.name] || '';
    }
    return lower(raw).replace(/[_-]+/g, ' ').trim();
  }

  function tableauCard(state, cardName) {
    var tableau = asArray(state && state.thisPlayer && state.thisPlayer.tableau);
    for (var i = 0; i < tableau.length; i++) {
      if (tableau[i] && tableau[i].name === cardName) return tableau[i];
    }
    return null;
  }

  function countNonStandardResourceTypes(state) {
    var tableau = asArray(state && state.thisPlayer && state.thisPlayer.tableau);
    var types = {};
    for (var i = 0; i < tableau.length; i++) {
      var card = tableau[i];
      var resources = asNumber(card && (card.resources || card.resourceCount), 0);
      if (resources <= 0) continue;
      var type = ownedResourceType(card);
      if (type) types[type] = true;
    }
    return Object.keys(types);
  }

  function unclaimedMilestoneCount(game) {
    var milestones = asArray(game && game.milestones);
    var claimed = 0;
    for (var i = 0; i < milestones.length; i++) {
      if (milestones[i] && (milestones[i].playerName || milestones[i].player || milestones[i].playerColor || milestones[i].color)) claimed++;
    }
    return claimed;
  }

  function milestoneScore(ms, color) {
    var scores = asArray(ms && ms.scores);
    for (var i = 0; i < scores.length; i++) {
      if (sameColor(scores[i] && scores[i].color, color)) return asNumber(scores[i].score, 0);
    }
    return 0;
  }

  function hasOpenEuropaColony(state) {
    var game = (state && state.game) || {};
    var myColor = colorOf(state && state.thisPlayer);
    var colonies = asArray(game.colonies);
    for (var i = 0; i < colonies.length; i++) {
      var col = colonies[i];
      if (!col || col.name !== 'Europa' || col.isActive === false) continue;
      var slots = asArray(col.colonies);
      if (slots.length >= 3) return false;
      for (var j = 0; j < slots.length; j++) {
        if (sameColor(colorOf(slots[j]), myColor)) return false;
      }
      return true;
    }
    return false;
  }

  function hasFreeTriplePlantOcean(state) {
    var spaces = asArray(state && state.game && state.game.spaces);
    for (var i = 0; i < spaces.length; i++) {
      var s = spaces[i] || {};
      var bonus = asArray(s.bonus);
      if (s.spaceType !== 'ocean' || s.tile) continue;
      if (bonus.length === 3 && bonus[0] === 2 && bonus[1] === 2 && bonus[2] === 2) return true;
    }
    return false;
  }

  function buildTradesmanChain(input) {
    var state = input && input.state;
    var waitingFor = input && input.waitingFor;
    if (!state || !state.thisPlayer || !state.game || !isActionChoicePrompt(waitingFor)) return null;

    var standardIndex = optionIndexMatching(waitingFor, function(title) {
      var low = lower(title);
      return low.indexOf('standard project') >= 0 || low.indexOf('standard projects') >= 0;
    });
    if (standardIndex < 0) return null;

    var player = state.thisPlayer || {};
    if (asNumber(player.actionsTakenThisRound || player.actionsThisRound, 0) > 0) return null;
    if (asNumber(player.megaCredits || player.megacredits, 0) < 30) return null;
    if (asNumber(state.game.oceans, 0) >= 9) return null;
    if (unclaimedMilestoneCount(state.game) >= 3) return null;
    if (!hasOpenEuropaColony(state)) return null;

    var npc = tableauCard(state, 'Neptunian Power Consultants');
    if (!npc || asNumber(npc.resources || npc.resourceCount, 0) > 0) return null;
    var resourceTypes = countNonStandardResourceTypes(state);
    if (resourceTypes.length !== 2) return null;
    if (resourceTypes.indexOf('hydroelectric resource') >= 0) return null;

    var myColor = colorOf(player);
    var milestones = asArray(state.game.milestones);
    var tradesman = null;
    for (var mi = 0; mi < milestones.length; mi++) {
      if (milestones[mi] && milestones[mi].name === 'Tradesman' && !(milestones[mi].playerName || milestones[mi].player)) {
        tradesman = milestones[mi];
        break;
      }
    }
    if (!tradesman || milestoneScore(tradesman, myColor) !== 2) return null;

    var oppAtTwo = false;
    var scores = asArray(tradesman.scores);
    for (var si = 0; si < scores.length; si++) {
      if (!sameColor(scores[si] && scores[si].color, myColor) && asNumber(scores[si] && scores[si].score, 0) >= 2) {
        oppAtTwo = true;
      }
    }

    var europaText = 'Europa colony places an ocean';
    if (hasFreeTriplePlantOcean(state)) {
      europaText += ' on the free 3-plant tile';
    }
    var reasons = [
      {text: europaText, tone: 'positive'},
      {text: 'Pay Neptunian 5 MC: third resource type', tone: 'positive'},
      {text: 'Then claim Tradesman as the second action', tone: 'positive'},
    ];
    if (oppAtTwo) {
      reasons.push({text: 'Race: opponent is also 2/3', tone: 'negative'});
    }

    return {
      id: 'milestone-chain:tradesman-europa-neptunian',
      kind: 'milestone-chain',
      title: 'SP Colony: Europa -> Tradesman',
      subtitle: 'Standard project chain',
      optionTitle: optionTitle(waitingFor.options[standardIndex]) || 'Standard projects',
      optionIndex: standardIndex,
      score: 100,
      reasonRows: dedupeReasons(reasons),
      alt: '',
      anchor: {type: 'actions', key: 'current'}
    };
  }

  function buildFromRankedAdvisorAction(input, ranked, actionRank) {
    var advisor = input && input.advisor;
    var state = input && input.state;
    var waitingFor = input && input.waitingFor;
    var isPlayableCard = input && input.isPlayableCard;
    var estimateGensLeftFn = input && input.estimateGensLeft;
    var best = ranked[actionRank] || {};
    var alt = ranked.length > actionRank + 1 ? ranked[actionRank + 1] : null;
    var bestIndex = typeof best.index === 'number' ? best.index : 0;
    var opt = waitingFor.options[bestIndex] || null;
    var optTitle = optionTitle(opt) || best.action || '';
    var title = normalizeActionLabel(best.action || optTitle);
    var cardTargetName = '';
    var reasonRows = reasonRowsFromText(best.reason || '', 'positive');

    if (opt && opt.cards && opt.cards.length > 0) {
      var cards = visibleCards(opt.cards);
      var low = lower(best.action || optTitle);
      if (isPlayProjectCardLabel(best.action || optTitle) && typeof advisor.rankHandCards === 'function') {
        var rankableCards = cards;
        if (typeof isPlayableCard === 'function') {
          rankableCards = [];
          for (var rci = 0; rci < cards.length; rci++) {
            if (isPlayableCard(cards[rci], state)) rankableCards.push(cards[rci]);
          }
        }
        var rankedCards = rankableCards.length > 0 ? (advisor.rankHandCards(rankableCards, state) || []) : [];
        if (rankedCards.length > 0) {
          var bestCard = bestNonDeferredCard(rankedCards, state, rankableCards, estimateGensLeftFn, {
            waitingFor: waitingFor,
            optionIndex: bestIndex
          });
          if (!bestCard) return null;
          title = 'Play ' + bestCard.name;
          cardTargetName = bestCard.name || '';
          addReasonRows(reasonRows, reasonRowsFromText(bestCard.reason || '', 'positive'));
        } else if (rankableCards.length === 1 && rankableCards[0].name) {
          title = 'Play ' + rankableCards[0].name;
          cardTargetName = rankableCards[0].name || '';
        }
      } else if ((isPlayedCardActionLabel(best.action || optTitle) || low.indexOf('action') >= 0 || low.indexOf('use') >= 0) && cards.length === 1 && cards[0].name) {
        title = 'Use ' + cards[0].name;
        cardTargetName = cards[0].name || '';
      }
    }

    return {
      id: 'advisor:' + bestIndex + ':' + title,
      kind: 'advisor',
      title: title || normalizeActionLabel(optTitle) || 'Best action',
      subtitle: optTitle && optTitle !== title ? optTitle : '',
      cardName: cardTargetName,
      optionTitle: optTitle,
      optionIndex: bestIndex,
      score: typeof best.score === 'number' ? best.score : undefined,
      reasonRows: dedupeReasons(reasonRows),
      alt: alt ? normalizeActionLabel(alt.action || optionTitle(waitingFor.options[alt.index]) || '') : '',
      anchor: {type: 'actions', key: 'current'}
    };
  }

  function buildFromAdvisor(input) {
    var advisor = input && input.advisor;
    var state = input && input.state;
    var waitingFor = input && input.waitingFor;
    if (!advisor || typeof advisor.analyzeActions !== 'function' || !isActionChoicePrompt(waitingFor)) return null;

    var ranked = advisor.analyzeActions(waitingFor, state) || [];
    if (!ranked.length) return null;

    for (var i = 0; i < ranked.length; i++) {
      var rec = buildFromRankedAdvisorAction(input, ranked, i);
      if (rec) return rec;
    }
    return null;
  }

  function buildFromStandardProjects(input) {
    var standardProjects = input && input.standardProjects;
    var state = input && input.state;
    if (!standardProjects || typeof standardProjects.computeAllSP !== 'function') return null;
    if (!input || typeof input.estimateGensLeft !== 'function' ||
        typeof input.ftnRow !== 'function' || typeof input.isGreeneryTile !== 'function' || !input.sc) {
      return null;
    }
    var result = standardProjects.computeAllSP({
      pv: state,
      gensLeft: input.estimateGensLeft(state),
      myCorp: typeof input.detectMyCorp === 'function' ? input.detectMyCorp() : '',
      ftnRow: input.ftnRow,
      isGreeneryTile: input.isGreeneryTile,
      sc: input.sc
    });
    if (!result || !result.all || !result.all.length) return null;
    var best = result.all[0];
    if (!best || asNumber(best.adj, 0) < 55) return null;
    return {
      id: 'sp:' + (best.type || best.name || ''),
      kind: 'standard-project',
      title: (best.icon ? best.icon + ' ' : '') + (best.name || 'Standard project'),
      subtitle: 'Standard project',
      optionTitle: best.name || '',
      score: best.adj,
      reasonRows: dedupeReasons(best.reasonRows || best.reasons || (best.detail ? [{text: best.detail}] : [])),
      alt: '',
      anchor: {type: 'standard', key: best.type || ''}
    };
  }

  function computeActionRecommendation(input) {
    var rawState = (input && (input.state || input.pv)) || {};
    if (!rawState || !rawState.thisPlayer || !rawState.game || !isActionPhase(rawState) || !isMyActionTurn(rawState)) return null;
    var waitingFor = (input && input.waitingFor) || getWaitingFor(rawState);
    if (!waitingFor) return null;
    var state = cloneStateWithWaitingFor(rawState, waitingFor);

    var rec = buildTradesmanChain({
      state: state,
      waitingFor: waitingFor
    });
    if (rec) return rec;

    rec = buildFromAdvisor({
      advisor: input && input.advisor,
      state: state,
      waitingFor: waitingFor,
      isPlayableCard: input && input.isPlayableCard,
      estimateGensLeft: input && input.estimateGensLeft
    });
    if (rec) return rec;

    rec = isActionChoicePrompt(waitingFor) ? buildFromSignals(input && input.signals) : null;
    if (rec) return rec;

    return isActionChoicePrompt(waitingFor) ? buildFromStandardProjects(Object.assign({}, input || {}, {state: state})) : null;
  }

  function queryFirst(documentObj, selectors) {
    if (!documentObj || typeof documentObj.querySelector !== 'function') return null;
    for (var i = 0; i < selectors.length; i++) {
      try {
        var found = documentObj.querySelector(selectors[i]);
        if (found) return found;
      } catch (e) {}
    }
    return null;
  }

  function findActionsAnchor(documentObj) {
    return queryFirst(documentObj, [
      '.player_home_block--actions',
      '[data-tm-game-anchor="actions"]',
      '#actions',
      '.wf-options',
      '.wf-component--select-option',
      '.wf-component'
    ]);
  }

  function isNotYourTurnAnchor(anchor) {
    var text = normalizeText(anchor && anchor.textContent);
    return text.indexOf('not your turn') >= 0 && text.indexOf('take any actions') >= 0;
  }

  function restoreTarget(node) {
    if (!node) return;
    if (node.classList && typeof node.classList.remove === 'function') node.classList.remove(TARGET_CLASS);
    if (node.classList && typeof node.classList.remove === 'function') node.classList.remove(CARD_TARGET_CLASS);
    if (node.style) {
      var prevOutline = node.getAttribute && node.getAttribute('data-tm-action-prev-outline');
      var prevShadow = node.getAttribute && node.getAttribute('data-tm-action-prev-box-shadow');
      node.style.outline = prevOutline || '';
      node.style.boxShadow = prevShadow || '';
    }
    if (node.removeAttribute) {
      node.removeAttribute('data-tm-action-prev-outline');
      node.removeAttribute('data-tm-action-prev-box-shadow');
    }
  }

  function clearActionRecommendation(input) {
    var documentObj = (input && input.documentObj) || (typeof document !== 'undefined' ? document : null);
    if (!documentObj || typeof documentObj.querySelectorAll !== 'function') return;
    var boxes = documentObj.querySelectorAll('.' + BOX_CLASS);
    for (var i = 0; i < boxes.length; i++) removeNode(boxes[i]);
    var targets = documentObj.querySelectorAll('.' + TARGET_CLASS);
    for (var ti = 0; ti < targets.length; ti++) restoreTarget(targets[ti]);
    var cardTargets = documentObj.querySelectorAll('.' + CARD_TARGET_CLASS);
    for (var ci = 0; ci < cardTargets.length; ci++) restoreTarget(cardTargets[ci]);
  }

  function nodeText(node) {
    return compactText(node && node.textContent);
  }

  function candidateOptionNodes(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    var selectors = [
      'label.form-radio',
      '.wf-action',
      '.wf-component button',
      '.card-standard-project',
      'button'
    ];
    var rows = [];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var found = root.querySelectorAll(selectors[i]);
        for (var j = 0; j < found.length; j++) {
          if (rows.indexOf(found[j]) < 0) rows.push(found[j]);
        }
      } catch (e) {}
    }
    return rows;
  }

  function scoreOptionNode(node, rec, ordinal) {
    var text = normalizeText(nodeText(node));
    if (!text) return 0;
    var optionTitle = normalizeText(rec && rec.optionTitle);
    var title = normalizeText(rec && rec.title);
    var score = 0;
    if (optionTitle && text.indexOf(optionTitle) >= 0) score += 60;
    if (title && text.indexOf(title) >= 0) score += 40;
    if (typeof rec.optionIndex === 'number' && ordinal === rec.optionIndex) score += 20;
    return score;
  }

  function highlightActionTarget(documentObj, anchor, rec) {
    var root = anchor || findActionsAnchor(documentObj);
    var candidates = candidateOptionNodes(root);
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < candidates.length; i++) {
      var score = scoreOptionNode(candidates[i], rec, i);
      if (score > bestScore) {
        best = candidates[i];
        bestScore = score;
      }
    }
    if (!best || bestScore <= 0) return null;
    if (best.classList && typeof best.classList.add === 'function') best.classList.add(TARGET_CLASS);
    if (best.style) {
      if (best.getAttribute && !best.getAttribute('data-tm-action-prev-outline')) {
        best.setAttribute('data-tm-action-prev-outline', best.style.outline || '');
        best.setAttribute('data-tm-action-prev-box-shadow', best.style.boxShadow || '');
      }
      best.style.outline = '2px solid #60d394';
      best.style.boxShadow = '0 0 0 3px rgba(96,211,148,0.24)';
    }
    return best;
  }

  function findCardTarget(documentObj, rec) {
    var wanted = normalizeText(rec && rec.cardName);
    if (!wanted || !documentObj || typeof documentObj.querySelectorAll !== 'function') return null;
    var cards = [];
    try { cards = documentObj.querySelectorAll('[data-tm-card]'); } catch (e) { cards = []; }
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var name = compactText(card && card.getAttribute && card.getAttribute('data-tm-card'));
      if (!name) name = nodeText(card);
      if (normalizeText(name) === wanted) return card;
    }
    try { cards = documentObj.querySelectorAll('.card-container'); } catch (e2) { cards = []; }
    for (var ci = 0; ci < cards.length; ci++) {
      var text = normalizeText(nodeText(cards[ci]));
      if (!text) continue;
      var tailIndex = text.indexOf(' ' + wanted);
      if (text === wanted || text.indexOf(wanted + ' ') === 0 || text.indexOf(' ' + wanted + ' ') >= 0 || (tailIndex >= 0 && tailIndex === text.length - wanted.length - 1)) {
        return cards[ci];
      }
    }
    return null;
  }

  function highlightCardTarget(documentObj, rec) {
    var target = findCardTarget(documentObj, rec);
    if (!target) return null;
    if (target.classList && typeof target.classList.add === 'function') target.classList.add(CARD_TARGET_CLASS);
    if (target.style) {
      if (target.getAttribute && !target.getAttribute('data-tm-action-prev-outline')) {
        target.setAttribute('data-tm-action-prev-outline', target.style.outline || '');
        target.setAttribute('data-tm-action-prev-box-shadow', target.style.boxShadow || '');
      }
      target.style.outline = '3px solid #f1c40f';
      target.style.boxShadow = '0 0 0 4px rgba(241,196,15,0.22), 0 0 18px rgba(241,196,15,0.34)';
    }
    return target;
  }

  function boxStyle(anchored) {
    var base = 'font-family:Ubuntu,Arial,sans-serif;background:rgba(24,30,38,0.96);'
      + 'color:#f4f7fb;border:1px solid #60d394;border-radius:6px;'
      + 'box-shadow:0 6px 20px rgba(0,0,0,0.36);z-index:2147482998;'
      + 'max-width:360px;pointer-events:auto;';
    if (anchored) return 'position:relative;margin:6px 0 10px 0;padding:7px 9px;' + base;
    return 'position:fixed;left:10px;top:118px;padding:7px 9px;' + base;
  }

  function reasonToneColor(row) {
    if (row && row.tone === 'negative') return '#ffb0a8';
    return '#bdebd0';
  }

  function createBox(documentObj, rec, anchored) {
    var box = documentObj.createElement('div');
    box.className = BOX_CLASS;
    if (box.style) box.style.cssText = boxStyle(anchored);
    box.setAttribute('data-tm-action-rec-id', rec.id || '');

    var head = documentObj.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;color:#9fdcb9;text-transform:uppercase;font-weight:700;letter-spacing:0;';
    head.textContent = 'Best action';
    if (typeof rec.score === 'number') {
      var score = documentObj.createElement('span');
      score.style.cssText = 'margin-left:auto;color:#d8ffe7;font-size:11px;';
      score.textContent = Math.round(rec.score);
      head.appendChild(score);
    }
    box.appendChild(head);

    var title = documentObj.createElement('div');
    title.style.cssText = 'font-size:15px;line-height:1.2;font-weight:800;margin-top:3px;';
    title.textContent = shortText(rec.title || 'Best action', 80);
    box.appendChild(title);

    if (rec.subtitle) {
      var subtitle = documentObj.createElement('div');
      subtitle.style.cssText = 'font-size:11px;line-height:1.25;color:#b8c2d1;margin-top:1px;';
      subtitle.textContent = shortText(rec.subtitle, 90);
      box.appendChild(subtitle);
    }

    var reasons = asArray(rec.reasonRows);
    if (reasons.length > 0) {
      var reasonBox = documentObj.createElement('div');
      reasonBox.style.cssText = 'margin-top:5px;display:flex;flex-direction:column;gap:2px;';
      for (var i = 0; i < Math.min(reasons.length, 3); i++) {
        var row = documentObj.createElement('div');
        row.style.cssText = 'font-size:11px;line-height:1.25;color:' + reasonToneColor(reasons[i]) + ';';
        row.textContent = '• ' + shortText(reasons[i].text, 92);
        reasonBox.appendChild(row);
      }
      box.appendChild(reasonBox);
    }

    if (rec.alt) {
      var alt = documentObj.createElement('div');
      alt.style.cssText = 'font-size:10px;line-height:1.2;color:#aab4c3;margin-top:5px;';
      alt.textContent = 'Alt: ' + shortText(rec.alt, 76);
      box.appendChild(alt);
    }

    return box;
  }

  function directChildBefore(anchor, nested) {
    var node = nested;
    while (node && node.parentNode && node.parentNode !== anchor) {
      node = node.parentNode;
    }
    return node && node.parentNode === anchor ? node : null;
  }

  function renderActionRecommendation(input) {
    var documentObj = (input && input.documentObj) || (typeof document !== 'undefined' ? document : null);
    if (!documentObj || typeof documentObj.createElement !== 'function') return [];
    clearActionRecommendation({documentObj: documentObj});
    var rec = input && input.recommendation;
    if (!rec) return [];

    var anchor = findActionsAnchor(documentObj);
    if (isNotYourTurnAnchor(anchor)) return [];
    var box = createBox(documentObj, rec, !!anchor);
    if (anchor) {
      if (anchor.style && !anchor.style.position) anchor.style.position = 'relative';
      var before = queryFirst(anchor, ['.wf-component', '.wf-options']);
      var directBefore = directChildBefore(anchor, before);
      if (directBefore && anchor.insertBefore) anchor.insertBefore(box, directBefore);
      else anchor.appendChild(box);
    } else {
      var host = documentObj.body || documentObj.documentElement;
      if (host && typeof host.appendChild === 'function') host.appendChild(box);
    }
    var target = highlightActionTarget(documentObj, anchor, rec);
    var cardTarget = highlightCardTarget(documentObj, rec);
    var rendered = [box];
    if (target) rendered.push(target);
    if (cardTarget && cardTarget !== target) rendered.push(cardTarget);
    return rendered;
  }

  global.TM_CONTENT_ACTION_RECOMMENDATION = {
    clearActionRecommendation: clearActionRecommendation,
    computeActionRecommendation: computeActionRecommendation,
    renderActionRecommendation: renderActionRecommendation,
    _private: {
      normalizeActionLabel: normalizeActionLabel,
      getWaitingFor: getWaitingFor,
      isMyActionTurn: isMyActionTurn
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
