// TM Tier Overlay — Game Event Logger v3
// Captures all player decisions (draft, play, actions) + state snapshots
// Reads action events from vue-bridge (MAIN world) via data-tm-action-log attribute
// v3: API-based draft tracking via draftedCards/waitingFor from vue-bridge

(function () {
  'use strict';

  const RATINGS = (typeof TM_RATINGS !== 'undefined') ? TM_RATINGS : {};
  let logging = true;
  let currentLog = null;
  let logReady = false;
  let lastProcessedSeq = 0;
  let lastSnapshotKey = '';
  let lastSnapshot = null;
  let lastGeneration = null;
  let initialSnapshotTaken = false;
  let gameEndDetected = false;
  let lastSavedEventCount = 0;
  let lastHandCards = null; // null = not yet initialized; Set when first seen

  var safeStorage = TM_UTILS.safeStorage;

  safeStorage((storage) => {
    storage.local.get({ logging: true }, (s) => {
      if (chrome.runtime.lastError) return;
      logging = s.logging;
    });
    storage.onChanged.addListener((changes) => {
      try { if (changes.logging) logging = changes.logging.newValue; }
      catch (e) { /* context invalidated */ }
    });
  });

  // ── Utilities ──

  function logEvent(log, gen, data, ts) {
    log.events.push({
      id: log.events.length + 1,
      timestamp: ts || Date.now(),
      generation: gen,
      ...data,
    });
  }

  var getGameId = TM_UTILS.parseGameId;
  var getPlayerId = TM_UTILS.parsePlayerId;

  function ensureLog(gameId) {
    if (currentLog && currentLog.gameId === gameId && logReady) return currentLog;

    // Already loading — wait for callback
    if (currentLog && currentLog.gameId === gameId && !logReady) return null;

    logReady = false;
    currentLog = {
      version: 3,
      gameId: gameId,
      playerId: getPlayerId(),
      startTime: Date.now(),
      gameOptions: null,
      players: [],
      myColor: null,
      events: [],
      draftLog: [],
      _lastSeq: 0,
      _draftRound: 0,
      _prevDraftedCards: [],
      _prevPendingOffered: null,
      _prevPickedCorp: null,
      _prevPreludesInHand: [],
      _pendingResearchBuy: null,  // deferred research_buy detection (1-cycle delay)
    };

    // Try to load existing log from storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.runtime && chrome.runtime.id) {
      // Timeout fallback: if callback never fires (context invalidated), force logReady
      let storageCallbackFired = false;
      setTimeout(() => {
        if (!storageCallbackFired) {
          console.warn('[TM-Log] Storage callback timed out — starting fresh log');
          logReady = true;
        }
      }, 3000);

      try {
        chrome.storage.local.get('gamelog_' + gameId, (data) => {
          storageCallbackFired = true;
          if (chrome.runtime.lastError) {
            console.warn('[TM-Log] Storage read error:', chrome.runtime.lastError.message);
            logReady = true;
            return;
          }
          const existing = data['gamelog_' + gameId];
          if (existing && (existing.version === 2 || existing.version === 3) && existing.gameId === gameId) {
            // Merge any events added before callback fired
            if (currentLog.events.length > 0) {
              existing.events = existing.events.concat(currentLog.events);
            }
            currentLog = existing;
            lastProcessedSeq = currentLog._lastSeq || 0;

            // Restore in-memory state from saved log to prevent duplicates
            if (existing.events.length > 0) {
              initialSnapshotTaken = true;
              for (var ri = existing.events.length - 1; ri >= 0; ri--) {
                var revt = existing.events[ri];
                if (!lastSnapshot && (revt.type === 'state_snapshot' || revt.type === 'final_state') && revt.players) {
                  lastSnapshot = { globals: revt.globals, players: revt.players };
                  lastSnapshotKey = makeSnapKey(lastSnapshot);
                  // Restore hand from snapshot (my player's hand array)
                  if (lastHandCards === null && existing.myColor && revt.players[existing.myColor] && revt.players[existing.myColor].hand) {
                    lastHandCards = new Set(revt.players[existing.myColor].hand);
                  }
                }
                if (lastGeneration === null && revt.generation != null) {
                  lastGeneration = revt.generation;
                }
                // Also restore from hand_change events
                if (lastHandCards === null && revt.type === 'hand_change') {
                  // Reconstruct hand from the event: it was the result after this change
                  // We can't fully reconstruct, but handSize gives us a hint
                  // Better: just mark as initialized so we start fresh diff from next poll
                  lastHandCards = new Set();
                }
                if (lastSnapshot && lastGeneration !== null && lastHandCards !== null) break;
              }
            }
            // Ensure v3 draft fields exist (upgrade v2 → v3)
            if (!currentLog.draftLog) currentLog.draftLog = [];
            if (!currentLog._draftRound) currentLog._draftRound = currentLog.draftLog.length;
            if (!currentLog._prevDraftedCards) currentLog._prevDraftedCards = [];
            if (currentLog._prevPendingOffered === undefined) currentLog._prevPendingOffered = null;
            if (currentLog._prevPickedCorp === undefined) currentLog._prevPickedCorp = null;
            if (!currentLog._prevPreludesInHand) currentLog._prevPreludesInHand = [];
            currentLog.version = 3;
          }
          logReady = true;
        });
      } catch (e) {
        console.warn('[TM-Log] Storage access failed:', e.message);
        logReady = true;
      }
    } else {
      logReady = true;
    }

    return logReady ? currentLog : null;
  }

  // ── Read bridge data ──

  var _lastBridgeRaw = '';
  var _lastBridgeData = null;

  function readBridgeData() {
    const target = document.getElementById('game') || document.body;
    const raw = target.getAttribute('data-tm-vue-bridge');
    if (!raw) return null;
    if (raw === _lastBridgeRaw) return _lastBridgeData;
    try {
      _lastBridgeRaw = raw;
      _lastBridgeData = JSON.parse(raw);
      return _lastBridgeData;
    } catch (e) { return null; }
  }

  function readActionLog() {
    const target = document.getElementById('game') || document.body;
    const raw = target.getAttribute('data-tm-action-log');
    if (!raw) return [];
    try { return JSON.parse(raw); } catch (e) { return []; }
  }

  // ── Classify player input events ──

  function classifyInput(body, lastWaitingFor) {
    if (!body || !body.type) return { eventType: 'unknown', detail: body };

    const wfTitle = (lastWaitingFor && lastWaitingFor.title) ? lastWaitingFor.title.toLowerCase() : '';

    switch (body.type) {
      case 'card': {
        const offeredCards = lastWaitingFor && lastWaitingFor.cards
          ? lastWaitingFor.cards.map(c => c.name || c) : [];

        if (wfTitle.includes('keep') || wfTitle.includes('draft') || wfTitle.includes('pass the rest')) {
          return { eventType: 'draft_pick', picked: body.cards || [], offered: offeredCards };
        }
        if (wfTitle.includes('buy') || wfTitle.includes('cards to keep')) {
          return { eventType: 'card_buy', bought: body.cards || [], offered: offeredCards };
        }
        if (wfTitle.includes('corporation')) {
          return { eventType: 'corp_select', selected: body.cards || [], offered: offeredCards };
        }
        if (wfTitle.includes('prelude')) {
          return { eventType: 'prelude_select', selected: body.cards || [], offered: offeredCards };
        }
        if (wfTitle.includes('ceo')) {
          return { eventType: 'ceo_select', selected: body.cards || [], offered: offeredCards };
        }
        return { eventType: 'card_select', cards: body.cards || [], context: wfTitle.slice(0, 60), offered: offeredCards };
      }

      case 'projectCard':
        return { eventType: 'card_play', card: body.card, payment: body.payment || null };

      case 'option':
        return { eventType: 'option_select', context: wfTitle.slice(0, 80) };

      case 'or': {
        const idx = body.index != null ? body.index : null;
        let optionTitle = null;
        if (lastWaitingFor && lastWaitingFor.options && idx != null) {
          const opt = lastWaitingFor.options[idx];
          optionTitle = opt && opt.title ? opt.title : null;
        }
        const wfNested = lastWaitingFor && lastWaitingFor.options && idx != null ? lastWaitingFor.options[idx] : null;
        const nested = body.response ? classifyInput(body.response, wfNested) : null;

        // Classify well-known actions from optionTitle
        const ot = (optionTitle || '').toLowerCase();
        if (ot.includes('pass') || ot.includes('skip') || ot === 'do nothing' || ot === 'end turn') {
          return { eventType: 'pass', optionTitle: optionTitle };
        }
        if (ot.includes('convert') && ot.includes('plant')) {
          return { eventType: 'convert_plants', optionTitle: optionTitle, nested: nested };
        }
        if (ot.includes('convert') && ot.includes('heat')) {
          return { eventType: 'convert_heat', optionTitle: optionTitle, nested: nested };
        }
        if (ot.includes('sell') && ot.includes('patent')) {
          return { eventType: 'sell_patents', optionTitle: optionTitle, nested: nested };
        }
        if (ot.includes('power plant') || ot.includes('asteroid') || ot.includes('aquifer') ||
            (ot.includes('greenery') && ot.includes('mc')) || (ot.includes('city') && ot.includes('mc')) ||
            ot.includes('buffer gas') || ot.includes('air scrapping')) {
          return { eventType: 'standard_project', optionTitle: optionTitle, nested: nested };
        }
        if (ot.includes('fund') && (ot.includes('award') || /\d+ mc/i.test(ot))) {
          return { eventType: 'fund_award', optionTitle: optionTitle, nested: nested };
        }
        if (ot.includes('claim') && ot.includes('milestone')) {
          return { eventType: 'claim_milestone', optionTitle: optionTitle, nested: nested };
        }
        return { eventType: 'or_choice', index: idx, optionTitle: optionTitle, nested: nested };
      }

      case 'and': {
        const responses = (body.responses || []).map((r, i) => {
          const wfOpt = lastWaitingFor && lastWaitingFor.options ? lastWaitingFor.options[i] : null;
          return classifyInput(r, wfOpt);
        });
        return { eventType: 'and_choice', responses: responses };
      }

      case 'space':
        return { eventType: 'space_select', spaceId: body.spaceId };
      case 'player':
        return { eventType: 'player_select', player: body.player };
      case 'amount':
        return { eventType: 'amount_select', amount: body.amount };
      case 'colony':
        return { eventType: 'colony_select', colonyName: body.colonyName };
      case 'payment':
        return { eventType: 'payment', payment: body.payment };
      case 'delegate':
        return { eventType: 'delegate_select', player: body.player };
      case 'party':
        return { eventType: 'party_select', partyName: body.partyName };
      default:
        return { eventType: body.type, detail: body };
    }
  }

  // ── State snapshot ──

  /**
   * @param {object} bridgeData
   * @param {boolean} compact - if true, omit tableau/hand arrays (store only counts).
   *   Full snapshots include tableau arrays; compact ones save ~90% size.
   */
  function createLogSnapshot(bridgeData, compact) {
    if (!bridgeData) return null;

    const g = bridgeData.game;
    const snap = {
      globals: g ? {
        generation: g.generation,
        temperature: g.temperature,
        oxygen: g.oxygenLevel,
        oceans: g.oceans,
        venus: g.venusScaleLevel,
        rulingParty: g.turmoil ? g.turmoil.ruling : undefined,
      } : null,
      players: {},
    };

    if (bridgeData.players) {
      for (const p of bridgeData.players) {
        const pd = {
          name: p.name,
          mc: p.megaCredits,
          steel: p.steel,
          titanium: p.titanium,
          heat: p.heat,
          plants: p.plants,
          energy: p.energy,
          tr: p.terraformRating,
          mcProd: p.megaCreditProduction,
          steelProd: p.steelProduction,
          tiProd: p.titaniumProduction,
          plantProd: p.plantProduction,
          energyProd: p.energyProduction,
          heatProd: p.heatProduction,
          handSize: p.cardsInHandNbr,
          colonies: p.coloniesCount,
          fleets: p.fleetSize,
          citiesCount: p.citiesCount || 0,
          lastCardPlayed: p.lastCardPlayed || null,
          actionsCount: p.actionsThisGeneration ? p.actionsThisGeneration.length : 0,
          trades: p.tradesThisGeneration || 0,
          timer: p.timer ? p.timer.sumMs : null,
          steelValue: p.steelValue || 2,
          titaniumValue: p.titaniumValue || 3,
        };
        if (compact) {
          // Compact: only tableau length, no card names
          pd.tableauCount = p.tableau ? p.tableau.length : 0;
        } else {
          // Full: include card name arrays + action names
          pd.tableau = p.tableau ? p.tableau.map(c => c.name) : [];
          if (p.actionsThisGeneration && p.actionsThisGeneration.length > 0) {
            pd.actions = p.actionsThisGeneration.slice();
          }
          if (p.victoryPointsByGeneration) pd.vpByGen = p.victoryPointsByGeneration;
        }
        snap.players[p.color] = pd;
      }
    }

    // Colonies on the board
    if (!compact && bridgeData.game && bridgeData.game.colonies) {
      snap.colonies = bridgeData.game.colonies.map(function(col) {
        return {
          name: col.name,
          colonies: col.colonies || [],
          trackPosition: col.trackPosition,
          visitor: col.visitor,
        };
      });
    }

    // Turmoil details (beyond rulingParty in globals)
    if (!compact && bridgeData.game && bridgeData.game.turmoil) {
      snap.turmoil = {
        ruling: bridgeData.game.turmoil.ruling,
        dominant: bridgeData.game.turmoil.dominant,
        chairman: bridgeData.game.turmoil.chairman,
      };
    }

    // My hand + tags (only visible for own player, full snapshots only)
    if (!compact && bridgeData.thisPlayer) {
      const myColor = bridgeData.thisPlayer.color;
      if (snap.players[myColor]) {
        if (bridgeData.thisPlayer.cardsInHand) {
          snap.players[myColor].hand = bridgeData.thisPlayer.cardsInHand.map(c => c.name);
        }
        if (bridgeData.thisPlayer.tags) {
          snap.players[myColor].tags = bridgeData.thisPlayer.tags;
        }
      }
    }

    return snap;
  }

  function makeSnapKey(snap) {
    if (!snap) return '';
    var parts = [];
    if (snap.globals) {
      parts.push('g:' + snap.globals.temperature + '/' + snap.globals.oxygen + '/' + snap.globals.oceans + '/' + snap.globals.venus + '/' + (snap.globals.rulingParty || '-'));
    }
    for (var c in snap.players) {
      var p = snap.players[c];
      var tabLen = p.tableau ? p.tableau.length : (p.tableauCount || 0);
      parts.push(c + ':' + p.mc + '/' + p.tr + '/' + tabLen + '/' +
        p.steel + '/' + p.titanium + '/' + p.heat + '/' + p.plants + '/' + p.energy + '/' +
        p.mcProd + '/' + p.steelProd + '/' + p.tiProd + '/' +
        p.plantProd + '/' + p.energyProd + '/' + p.heatProd + '/' +
        p.handSize + '/' + (p.colonies || 0) + '/' + (p.fleets || 0) + '/' +
        (p.lastCardPlayed || '-') + '/' + (p.actionsCount || 0) + '/' + (p.trades || 0) + '/' +
        (p.citiesCount || 0));
    }
    return parts.join('|');
  }

  // ── Fill game metadata ──

  function fillMetadata(bridgeData) {
    if (!currentLog || !bridgeData) return;

    if (bridgeData.game && bridgeData.game.gameOptions) {
      var opts = bridgeData.game.gameOptions;
      // Update if we have no options, or if stored options look like defaults (all extensions false)
      if (!currentLog.gameOptions ||
          (!currentLog.gameOptions.venusNextExtension && !currentLog.gameOptions.coloniesExtension &&
           !currentLog.gameOptions.turmoilExtension && opts.venusNextExtension)) {
        currentLog.gameOptions = opts;
      }
    }

    if ((!currentLog.players || currentLog.players.length === 0) && bridgeData.players && bridgeData.players.length > 0) {
      currentLog.players = bridgeData.players.map(p => ({
        name: p.name,
        color: p.color,
      }));
    }

    if (!currentLog.myColor && bridgeData.thisPlayer) {
      currentLog.myColor = bridgeData.thisPlayer.color;
    }

    // Update corp names from tableau (first entry is usually the corp)
    if (currentLog.players && bridgeData.players) {
      for (const p of bridgeData.players) {
        const logP = currentLog.players.find(lp => lp.color === p.color);
        if (logP && !logP.corp && p.tableau && p.tableau.length > 0) {
          logP.corp = typeof resolveCorpName === 'function' ? resolveCorpName(p.tableau[0].name) : p.tableau[0].name;
        }
      }
    }
  }

  // ── Snapshot with opponent diff ──

  /**
   * @param {boolean} full - if true, store full tableau arrays (for gen change, initial, final).
   *   Default false = compact snapshot (numbers only, ~10x smaller).
   */
  function pushSnapshotWithDiff(log, snap, gen, full) {
    var newKey = makeSnapKey(snap);
    if (newKey === lastSnapshotKey) return false;

    if (lastSnapshot) {
      var oppActions = detectOpponentActions(lastSnapshot, snap, currentLog.myColor);
      for (var i = 0; i < oppActions.length; i++) {
        logEvent(log, gen, oppActions[i]);
      }
    }

    // Keep lastSnapshot as full for opponent detection (in-memory only)
    lastSnapshot = snap;
    lastSnapshotKey = newKey;

    // For storage: use compact version unless full requested
    var stored = snap;
    if (!full && snap.players) {
      stored = { globals: snap.globals, players: {} };
      for (var c in snap.players) {
        var p = snap.players[c];
        stored.players[c] = {
          name: p.name,
          mc: p.mc, steel: p.steel, titanium: p.titanium,
          heat: p.heat, plants: p.plants, energy: p.energy,
          tr: p.tr,
          mcProd: p.mcProd, steelProd: p.steelProd, tiProd: p.tiProd,
          plantProd: p.plantProd, energyProd: p.energyProd, heatProd: p.heatProd,
          handSize: p.handSize,
          tableauCount: p.tableau ? p.tableau.length : (p.tableauCount || 0),
          colonies: p.colonies, fleets: p.fleets,
          citiesCount: p.citiesCount,
          lastCardPlayed: p.lastCardPlayed,
          actionsCount: p.actionsCount,
          trades: p.trades,
          steelValue: p.steelValue,
          titaniumValue: p.titaniumValue,
        };
      }
    }

    logEvent(log, gen, { type: 'state_snapshot', ...stored });
    return true;
  }

  // ── Detect opponent actions via state diff ──

  // Diff a single opponent's state between snapshots
  function diffPlayerState(prev, curr, color) {
    var events = [];

    // New cards in tableau
    var newCards = [];
    if (prev.tableau && curr.tableau) {
      var prevCards = new Set(prev.tableau);
      newCards = curr.tableau.filter(function(c) { return !prevCards.has(c); });
      for (var i = 0; i < newCards.length; i++) {
        events.push({ type: 'opp_card_play', player: color, playerName: curr.name, card: newCards[i] });
      }
    }

    // TR change
    if (curr.tr !== prev.tr) {
      events.push({ type: 'opp_tr_change', player: color, playerName: curr.name, from: prev.tr, to: curr.tr, delta: curr.tr - prev.tr });
    }

    // Production changes
    var prods = ['mcProd','steelProd','tiProd','plantProd','energyProd','heatProd'];
    var prodChanges = {};
    for (var j = 0; j < prods.length; j++) {
      if (curr[prods[j]] !== prev[prods[j]]) {
        prodChanges[prods[j]] = { from: prev[prods[j]], to: curr[prods[j]] };
      }
    }
    if (Object.keys(prodChanges).length > 0) {
      events.push({ type: 'opp_prod_change', player: color, playerName: curr.name, changes: prodChanges });
    }

    // Colony count
    if ((curr.colonies || 0) > (prev.colonies || 0)) {
      events.push({ type: 'opp_colony_build', player: color, playerName: curr.name, from: prev.colonies, to: curr.colonies });
    }
    // Colony trade
    if ((curr.trades || 0) > (prev.trades || 0)) {
      events.push({ type: 'opp_colony_trade', player: color, playerName: curr.name, tradeNumber: curr.trades });
    }
    // City placement
    if ((curr.citiesCount || 0) > (prev.citiesCount || 0)) {
      events.push({ type: 'opp_city_place', player: color, playerName: curr.name, from: prev.citiesCount, to: curr.citiesCount });
    }

    // lastCardPlayed — fallback if not in tableau diff
    if (curr.lastCardPlayed && curr.lastCardPlayed !== prev.lastCardPlayed) {
      if (newCards.indexOf(curr.lastCardPlayed) === -1) {
        events.push({ type: 'opp_card_play', player: color, playerName: curr.name, card: curr.lastCardPlayed, source: 'lastCardPlayed' });
      }
    }

    return events;
  }

  // Diff global params between snapshots
  function diffGlobalParams(prevGlobals, currGlobals) {
    var events = [];
    var params = ['temperature','oxygen','oceans','venus'];
    for (var k = 0; k < params.length; k++) {
      if (currGlobals[params[k]] !== prevGlobals[params[k]]) {
        events.push({ type: 'global_change', param: params[k], from: prevGlobals[params[k]], to: currGlobals[params[k]] });
      }
    }
    if (currGlobals.rulingParty && currGlobals.rulingParty !== prevGlobals.rulingParty) {
      events.push({ type: 'ruling_party_change', from: prevGlobals.rulingParty, to: currGlobals.rulingParty });
    }
    return events;
  }

  function detectOpponentActions(prevSnap, currSnap, myColor) {
    var events = [];
    if (!prevSnap || !currSnap) return events;
    for (var color in currSnap.players) {
      if (color === myColor) continue;
      var prev = prevSnap.players[color];
      var curr = currSnap.players[color];
      if (!prev || !curr) continue;
      events.push.apply(events, diffPlayerState(prev, curr, color));
    }
    if (prevSnap.globals && currSnap.globals) {
      events.push.apply(events, diffGlobalParams(prevSnap.globals, currSnap.globals));
    }
    return events;
  }

  // ── Detect game end ──

  function detectGameEnd() {
    // #game-end is the main container in upstream TM (both Vue 2 and Vue 3)
    // .game_end_cont is the wrapper class, [class*="game-end"] catches child elements
    const vpEl = document.querySelector('#game-end, .game_end_cont, .game_end_victory_points, [class*="game-end"]');
    if (vpEl && !gameEndDetected) {
      gameEndDetected = true;
      return true;
    }
    return false;
  }

  // ── Helper: hand tracking ──

  function processHandTracking(log, bridgeData) {
    if (!bridgeData || !bridgeData.thisPlayer || !bridgeData.thisPlayer.cardsInHand) return;
    var names = bridgeData.thisPlayer.cardsInHand.map(function(c) { return c.name; });
    var currentHand = new Set(names);
    var gen = bridgeData.game ? bridgeData.game.generation : null;

    if (lastHandCards !== null) {
      var added = names.filter(function(c) { return !lastHandCards.has(c); });
      var removed = [];
      lastHandCards.forEach(function(c) { if (!currentHand.has(c)) removed.push(c); });
      if (added.length > 0 || removed.length > 0) {
        logEvent(log, gen, { type: 'hand_change', added: added, removed: removed, handSize: currentHand.size });
      }
    }
    lastHandCards = currentHand;
  }

  // ── Helper: game end processing ──

  function processGameEnd(log, bridgeData) {
    if (!detectGameEnd()) return;
    if (log.events.some(function(ev) { return ev.type === 'game_end'; })) return;

    var gen = bridgeData && bridgeData.game ? bridgeData.game.generation : null;
    var summary = { totalEvents: log.events.length, byType: {} };
    for (var si = 0; si < log.events.length; si++) {
      var stype = log.events[si].type || log.events[si].eventType || 'unknown';
      summary.byType[stype] = (summary.byType[stype] || 0) + 1;
    }
    summary.duration = Date.now() - log.startTime;
    summary.generations = gen;
    logEvent(log, gen, { type: 'game_end', summary: summary });
    var finalSnap = createLogSnapshot(bridgeData);
    if (finalSnap) {
      if (bridgeData.game) {
        if (bridgeData.game.turmoil) finalSnap.turmoil = bridgeData.game.turmoil;
        if (bridgeData.game.colonies) finalSnap.colonies = bridgeData.game.colonies;
        if (bridgeData.game.awards) finalSnap.awards = bridgeData.game.awards;
        if (bridgeData.game.milestones) finalSnap.milestones = bridgeData.game.milestones;
        if (bridgeData.game.playerTiles) finalSnap.playerTiles = bridgeData.game.playerTiles;
      }
      if (bridgeData.players) {
        for (var vi = 0; vi < bridgeData.players.length; vi++) {
          var vp = bridgeData.players[vi];
          if (vp.victoryPointsBreakdown && finalSnap.players[vp.color]) {
            finalSnap.players[vp.color].vpBreakdown = vp.victoryPointsBreakdown;
          }
        }
      }
      logEvent(log, gen, { type: 'final_state', ...finalSnap });
    }
    // Post-game draft reconstruction: trace my draft cards → opponent tableaus
    // Also determine draft direction and seating neighbors
    try {
      // Build seating order from log.players (array order = clockwise seating)
      var seating = (log.players || []).map(function(p) { return p.color; });
      var myIdx = seating.indexOf(log.myColor);
      var numPlayers = seating.length;

      // Draft direction: odd gens → left (clockwise), even gens → right (counter-clockwise)
      // "left" = next index in seating array, "right" = previous index
      function getNeighbor(direction) {
        if (numPlayers < 2 || myIdx < 0) return null;
        var idx = direction === 'left'
          ? (myIdx + 1) % numPlayers
          : (myIdx - 1 + numPlayers) % numPlayers;
        return seating[idx];
      }

      function getDraftDirection(generation) {
        // Standard TM: odd gens pass left, even gens pass right
        return generation % 2 === 1 ? 'left' : 'right';
      }

      // Build seating info for the log
      var leftNeighbor = getNeighbor('left');
      var rightNeighbor = getNeighbor('right');
      var seatInfo = {
        seatingOrder: seating,
        myPosition: myIdx,
        leftNeighbor: leftNeighbor,
        rightNeighbor: rightNeighbor,
        leftName: leftNeighbor ? ((log.players.find(function(p) { return p.color === leftNeighbor; }) || {}).name || leftNeighbor) : null,
        rightName: rightNeighbor ? ((log.players.find(function(p) { return p.color === rightNeighbor; }) || {}).name || rightNeighbor) : null
      };

      var oppTableaus = {};
      var myTableau = new Set();
      if (finalSnap && finalSnap.players) {
        for (var rc in finalSnap.players) {
          var rp = finalSnap.players[rc];
          var tabSet = new Set(rp.tableau || []);
          if (rc === log.myColor) {
            myTableau = tabSet;
          } else {
            oppTableaus[rc] = { name: rp.name, cards: tabSet };
          }
        }
      }

      var draftRecon = [];
      for (var dli = 0; dli < log.draftLog.length; dli++) {
        var dle = log.draftLog[dli];
        if (!dle.offered) continue;
        var draftDir = (dle.type === 'research_buy' || dle.type === 'draft') ? getDraftDirection(dle.generation) : null;
        // Who receives my passed cards this gen?
        var passTo = draftDir ? getNeighbor(draftDir) : null;
        var passToName = passTo ? ((log.players.find(function(p) { return p.color === passTo; }) || {}).name || passTo) : null;
        // Who passed cards to me this gen?
        var receiveFrom = draftDir ? getNeighbor(draftDir === 'left' ? 'right' : 'left') : null;
        var receiveFromName = receiveFrom ? ((log.players.find(function(p) { return p.color === receiveFrom; }) || {}).name || receiveFrom) : null;

        for (var doi = 0; doi < dle.offered.length; doi++) {
          var cardName = dle.offered[doi].name;
          var destination = 'unplayed';
          if (myTableau.has(cardName)) {
            destination = log.myColor;
          } else {
            for (var oc in oppTableaus) {
              if (oppTableaus[oc].cards.has(cardName)) {
                destination = oc + ' (' + oppTableaus[oc].name + ')';
                break;
              }
            }
          }
          draftRecon.push({
            card: cardName,
            score: dle.offered[doi].score,
            tier: dle.offered[doi].tier,
            generation: dle.generation,
            draftType: dle.type,
            direction: draftDir,
            passTo: passToName,
            receivedFrom: receiveFromName,
            destination: destination,
            passedByMe: dle.taken !== cardName
          });
        }
      }
      if (draftRecon.length > 0 || seatInfo.seatingOrder.length > 0) {
        logEvent(log, gen, { type: 'draft_reconstruction', seating: seatInfo, cards: draftRecon });
      }
    } catch(e) { console.warn('[TM-Log] draft reconstruction failed:', e); }

    try { autoExportLog(log, gen); } catch(e) { console.warn('[TM-Log] auto-export failed:', e); }
  }

  // ── Draft tracking via vue-bridge data (draftedCards, corps, preludes) ──

  function getCardScore(name) {
    var r = RATINGS[name];
    return r ? { score: r.s, tier: r.t } : { score: 0, tier: '?' };
  }

  function buildOffered(cards) {
    if (!cards || !cards.length) return [];
    return cards.map(function(c) {
      var n = c.name || c;
      var s = getCardScore(n);
      return { name: n, cost: c.cost || null, score: s.score, tier: s.tier };
    });
  }

  function processDraftTracking(log, bridgeData) {
    if (!bridgeData || !log) return;

    // Corp pick detection
    var pickedCorps = (bridgeData.pickedCorporationCard || []).map(function(c) { return c.name; });
    if (pickedCorps.length > 0 && !log._prevPickedCorp) {
      var offeredCorps = buildOffered(bridgeData.dealtCorporationCards);
      if (offeredCorps.length > 0) {
        log._draftRound++;
        log.draftLog.push({
          round: log._draftRound,
          type: 'corp',
          generation: 1,
          offered: offeredCorps,
          taken: pickedCorps[0],
          passed: null
        });
      }
      log._prevPickedCorp = pickedCorps[0];
    }

    // Prelude pick detection
    var preludesInHand = (bridgeData.preludeCardsInHand || []).map(function(c) { return c.name; });
    if (preludesInHand.length > 0 && log._prevPreludesInHand.length === 0) {
      var offeredPreludes = buildOffered(bridgeData.dealtPreludeCards);
      for (var pi = 0; pi < preludesInHand.length; pi++) {
        var pOff = offeredPreludes.length > 0 ? offeredPreludes : [{ name: preludesInHand[pi], cost: null, score: 0, tier: '?' }];
        log._draftRound++;
        log.draftLog.push({
          round: log._draftRound,
          type: 'prelude',
          generation: 1,
          offered: pOff,
          taken: preludesInHand[pi],
          passed: null
        });
      }
    }
    log._prevPreludesInHand = preludesInHand;

    // Draft pick detection via draftedCards diff
    var curDrafted = (bridgeData.draftedCards || []).map(function(c) { return c.name; });
    var gen = bridgeData.game ? bridgeData.game.generation : null;

    if (curDrafted.length > log._prevDraftedCards.length && log._prevPendingOffered) {
      var prevSet = new Set(log._prevDraftedCards);
      var newCards = curDrafted.filter(function(c) { return !prevSet.has(c); });
      for (var ni = 0; ni < newCards.length; ni++) {
        // Track which cards we passed to neighbor
        var passedCards = (log._prevPendingOffered || []).filter(function(c) { return c.name !== newCards[ni]; });
        log._draftRound++;
        log.draftLog.push({
          round: log._draftRound,
          type: 'draft',
          generation: gen,
          offered: log._prevPendingOffered,
          taken: newCards[ni],
          passed: passedCards.length > 0 ? passedCards : null
        });
      }
      log._prevPendingOffered = null;
    }

    // Update pending offered from waitingFor (for next poll cycle)
    // Read from data-tm-vue-wf which has the latest waitingFor
    var wfRaw = (document.getElementById('game') || document.body).getAttribute('data-tm-vue-wf');
    if (wfRaw) {
      try {
        var wf = JSON.parse(wfRaw);
        var phase = bridgeData.game ? (bridgeData.game.phase || '') : '';
        var isDraft = (phase === 'initial_drafting' || phase === 'drafting' || phase === 'research');
        var titleStr = typeof wf.title === 'string' ? wf.title : (wf.title && wf.title.text ? wf.title.text : '');
        var looksDraft = isDraft || /draft|keep|select.*card|pass the rest/i.test(titleStr);
        if (looksDraft && wf.cards && wf.cards.length > 0 && !wf.selectBlueCardAction) {
          log._prevPendingOffered = buildOffered(wf.cards);
        }
      } catch(e) { /* parse error */ }
    }

    // Research buy detection: draftedCards empties when cards move to hand
    // Use 1-cycle delay so cardsInHand has time to update
    if (log._pendingResearchBuy) {
      var pendingCards = log._pendingResearchBuy.cards;
      var pendingGen = log._pendingResearchBuy.gen;
      var hand = (bridgeData.thisPlayer && bridgeData.thisPlayer.cardsInHand || []).map(function(c) { return c.name; });
      var handSet = new Set(hand);
      var bought = pendingCards.filter(function(c) { return handSet.has(c); });
      var skipped = pendingCards.filter(function(c) { return !handSet.has(c); });
      if (bought.length > 0 || skipped.length > 0) {
        log._draftRound++;
        log.draftLog.push({
          round: log._draftRound,
          type: 'research_buy',
          generation: pendingGen,
          offered: buildOffered(pendingCards.map(function(n) { return { name: n }; })),
          bought: bought.map(function(n) { var s = getCardScore(n); return { name: n, score: s.score, tier: s.tier }; }),
          skipped: skipped
        });
      }
      log._pendingResearchBuy = null;
    }

    if (log._prevDraftedCards.length > 0 && curDrafted.length === 0) {
      // Draft→action transition: defer to next cycle for cardsInHand to update
      log._pendingResearchBuy = { cards: log._prevDraftedCards.slice(), gen: gen };
    }

    log._prevDraftedCards = curDrafted;
  }

  // ── Main processing loop ──

  let lastWaitingFor = null;

  function processEvents() {
    if (document.hidden) return;
    if (!logging) return;
    const gameId = getGameId();
    if (!gameId) return;

    const log = ensureLog(gameId);
    if (!log) return; // Still loading from storage
    const bridgeData = readBridgeData();
    const actionEvents = readActionLog();

    fillMetadata(bridgeData);

    processInitialSnapshot(log, bridgeData);
    processGenerationChange(log, bridgeData);
    processHandTracking(log, bridgeData);
    processDraftTracking(log, bridgeData);
    var newCount = processActionEvents(log, bridgeData, actionEvents);

    // Periodic snapshot even without events (to catch opponent actions visible in state changes)
    if (bridgeData && newCount === 0) {
      const snap = createLogSnapshot(bridgeData);
      if (snap) {
        const gen = bridgeData.game ? bridgeData.game.generation : null;
        pushSnapshotWithDiff(log, snap, gen, false);
      }
    }

    processGameEnd(log, bridgeData);
    saveLog();
  }

  function processInitialSnapshot(log, bridgeData) {
    if (initialSnapshotTaken || !bridgeData) return;
    initialSnapshotTaken = true;
    const initSnap = createLogSnapshot(bridgeData);
    if (initSnap) {
      const gen = bridgeData.game ? bridgeData.game.generation : null;
      lastSnapshotKey = makeSnapKey(initSnap);
      lastSnapshot = initSnap;
      if (gen !== null) lastGeneration = gen;
      logEvent(log, gen, { type: 'state_snapshot', trigger: 'initial', ...initSnap });
    }
  }

  function processGenerationChange(log, bridgeData) {
    if (!bridgeData || !bridgeData.game) return;
    const gen = bridgeData.game.generation;
    if (lastGeneration !== null && gen !== lastGeneration) {
      // Track opponent research buys from handSize delta across generation boundary
      if (lastSnapshot && lastSnapshot.players && log.myColor) {
        var preGenSnap = createLogSnapshot(bridgeData);
        if (preGenSnap && preGenSnap.players) {
          for (var orc in preGenSnap.players) {
            if (orc === log.myColor) continue;
            var prevOpp = lastSnapshot.players[orc];
            var currOpp = preGenSnap.players[orc];
            if (!prevOpp || !currOpp) continue;
            // Cards played since last snapshot = tableau growth
            var oppPlayed = 0;
            if (prevOpp.tableau && currOpp.tableau) {
              var prevTabSet = new Set(prevOpp.tableau);
              oppPlayed = currOpp.tableau.filter(function(c) { return !prevTabSet.has(c); }).length;
            }
            // estimatedBought = newHand - oldHand + cardsPlayed
            // (lost cards to plays, gained cards from research buy)
            var estBought = (currOpp.handSize - prevOpp.handSize) + oppPlayed;
            logEvent(log, gen, {
              type: 'opp_research_buy',
              player: orc,
              playerName: currOpp.name,
              prevHandSize: prevOpp.handSize,
              newHandSize: currOpp.handSize,
              cardsPlayed: oppPlayed,
              estimatedBought: Math.max(0, estBought),
            });
          }
        }
      }

      logEvent(log, gen, { type: 'generation_change', from: lastGeneration, to: gen });
      const genSnap = createLogSnapshot(bridgeData);
      if (genSnap) pushSnapshotWithDiff(log, genSnap, gen, true);
    }
    lastGeneration = gen;
  }

  function processActionEvents(log, bridgeData, actionEvents) {
    // Merge any events caught via CustomEvent backup channel
    actionEvents = mergeCustomEvents(actionEvents);
    const newEvents = actionEvents.filter(e => e.seq > lastProcessedSeq);

    for (const evt of newEvents) {
      lastProcessedSeq = evt.seq;

      if (evt.type === 'waitingFor') {
        lastWaitingFor = evt.waitingFor;
        const gen = bridgeData && bridgeData.game ? bridgeData.game.generation : null;
        logEvent(log, gen, {
          type: 'waiting_for',
          inputType: evt.waitingFor ? evt.waitingFor.type : null,
          title: evt.waitingFor ? (evt.waitingFor.title || '').slice(0, 120) : null,
          cardCount: evt.waitingFor && evt.waitingFor.cards ? evt.waitingFor.cards.length : null,
          options: evt.waitingFor && evt.waitingFor.options ? evt.waitingFor.options.map(o => (o.title || '').slice(0, 80)) : null,
        }, evt.timestamp);

      } else if (evt.type === 'playerInput') {
        const classified = classifyInput(evt.body, lastWaitingFor);
        const gen = bridgeData && bridgeData.game ? bridgeData.game.generation : null;
        logEvent(log, gen, classified, evt.timestamp);
        const snap = createLogSnapshot(bridgeData);
        if (snap) pushSnapshotWithDiff(log, snap, gen, true);
        lastWaitingFor = null;
      }
    }

    log._lastSeq = lastProcessedSeq;
    return newEvents.length;
  }

  // ── Auto-export on game end ──

  function autoExportLog(log, gen) {
    if (!log || !log.events || log.events.length < 3) return;
    var date = new Date().toISOString().slice(0, 10);
    var corp = 'unknown';
    if (log.players && log.myColor) {
      var me = log.players.find(function(p) { return p.color === log.myColor; });
      if (me && me.corp) corp = me.corp;
    }
    TM_UTILS.downloadJson(log, 'tm-log-' + corp.replace(/\s+/g, '_') + '-gen' + (gen || '?') + '-' + date + '.json');
    console.log('[TM-Log] Auto-exported game log (' + log.events.length + ' events)');
  }

  // ── Storage ──

  function saveLog() {
    if (!currentLog) return;
    if (currentLog.events.length === lastSavedEventCount) return;
    lastSavedEventCount = currentLog.events.length;
    safeStorage((storage) => {
      const key = 'gamelog_' + currentLog.gameId;
      const data = {};
      data[key] = currentLog;
      storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          console.warn('[TM-Log] Save failed:', chrome.runtime.lastError.message);
        }
      });
    });
  }

  // ── Message listener for popup export ──

  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'getGameLog') {
        const gameId = getGameId();
        if (currentLog && currentLog.gameId === gameId) {
          sendResponse({ log: currentLog });
        } else {
          sendResponse({ log: null });
        }
        return true;
      }
      if (msg.type === 'exportGameLog') {
        safeStorage((storage) => {
          storage.local.get('gamelog_' + msg.gameId, (data) => {
            if (chrome.runtime.lastError) { sendResponse({ log: null }); return; }
            sendResponse({ log: data['gamelog_' + msg.gameId] || null });
          });
        });
        return true; // keep message channel open for async response
      }
    });
  }

  // ── Backup channel: CustomEvent from vue-bridge ──
  // If DOM attribute approach fails (size limits, timing), this catches events directly

  var _customEventQueue = [];

  document.addEventListener('tm-action-event', function(e) {
    if (e.detail && e.detail.seq) {
      _customEventQueue.push(e.detail);
    }
  });

  // Merge custom events into action log if DOM attr missed them
  function mergeCustomEvents(actionEvents) {
    if (_customEventQueue.length === 0) return actionEvents;
    var seqSet = {};
    for (var i = 0; i < actionEvents.length; i++) {
      seqSet[actionEvents[i].seq] = true;
    }
    var merged = actionEvents.slice();
    for (var j = 0; j < _customEventQueue.length; j++) {
      if (!seqSet[_customEventQueue[j].seq]) {
        merged.push(_customEventQueue[j]);
      }
    }
    // Keep queue bounded
    if (_customEventQueue.length > 100) {
      _customEventQueue = _customEventQueue.slice(-50);
    }
    return merged.sort(function(a, b) { return a.seq - b.seq; });
  }

  // ── Main loop ──

  setInterval(processEvents, 2000);
  setTimeout(processEvents, 500);
})();
