// TM Tier Overlay — Game Event Logger v2
// Captures all player decisions (draft, play, actions) + state snapshots
// Reads action events from vue-bridge (MAIN world) via data-tm-action-log attribute

(function () {
  'use strict';

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

  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get({ logging: true }, (s) => {
      logging = s.logging;
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.logging) logging = changes.logging.newValue;
    });
  }

  // ── Utilities ──

  function getGameId() {
    // Support both /player/pXXX and /player?id=pXXX formats
    const m = window.location.pathname.match(/\/(player|game)\/([pg][a-f0-9]+)/i);
    if (m) return m[2];
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    if (id && /^[pg][a-f0-9]+$/i.test(id)) return id;
    return null;
  }

  function getPlayerId() {
    const m = window.location.pathname.match(/\/player\/([a-f0-9]+)/i);
    if (m) return m[1];
    // Query param format: /player?id=pXXX
    if (window.location.pathname.includes('/player')) {
      var params = new URLSearchParams(window.location.search);
      var id = params.get('id');
      if (id && /^p[a-f0-9]+$/i.test(id)) return id;
    }
    return null;
  }

  function ensureLog(gameId) {
    if (currentLog && currentLog.gameId === gameId && logReady) return currentLog;

    // Already loading — wait for callback
    if (currentLog && currentLog.gameId === gameId && !logReady) return null;

    logReady = false;
    currentLog = {
      version: 2,
      gameId: gameId,
      playerId: getPlayerId(),
      startTime: Date.now(),
      gameOptions: null,
      players: [],
      myColor: null,
      events: [],
      _lastSeq: 0,
    };

    // Try to load existing log from storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
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
          if (existing && existing.version === 2 && existing.gameId === gameId) {
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
                }
                if (lastGeneration === null && revt.generation != null) {
                  lastGeneration = revt.generation;
                }
                if (lastSnapshot && lastGeneration !== null) break;
              }
            }
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
  function createSnapshot(bridgeData, compact) {
    if (!bridgeData) return null;

    const snap = {
      globals: bridgeData.game ? {
        generation: bridgeData.game.generation,
        temperature: bridgeData.game.temperature,
        oxygen: bridgeData.game.oxygenLevel,
        oceans: bridgeData.game.oceans,
        venus: bridgeData.game.venusScaleLevel,
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
        };
        if (compact) {
          // Compact: only tableau length, no card names
          pd.tableauCount = p.tableau ? p.tableau.length : 0;
        } else {
          // Full: include card name arrays
          pd.tableau = p.tableau ? p.tableau.map(c => c.name) : [];
        }
        snap.players[p.color] = pd;
      }
    }

    // My hand (only visible for own player)
    if (!compact && bridgeData.thisPlayer && bridgeData.thisPlayer.cardsInHand) {
      const myColor = bridgeData.thisPlayer.color;
      if (snap.players[myColor]) {
        snap.players[myColor].hand = bridgeData.thisPlayer.cardsInHand.map(c => c.name);
      }
    }

    return snap;
  }

  function makeSnapKey(snap) {
    if (!snap) return '';
    var parts = [];
    if (snap.globals) {
      parts.push('g:' + snap.globals.temperature + '/' + snap.globals.oxygen + '/' + snap.globals.oceans + '/' + snap.globals.venus);
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
          logP.corp = p.tableau[0].name;
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
        log.events.push({
          id: log.events.length + 1,
          timestamp: Date.now(),
          generation: gen,
          ...oppActions[i],
        });
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
        };
      }
    }

    log.events.push({
      id: log.events.length + 1,
      timestamp: Date.now(),
      generation: gen,
      type: 'state_snapshot',
      ...stored,
    });
    return true;
  }

  // ── Detect opponent actions via state diff ──

  function detectOpponentActions(prevSnap, currSnap, myColor) {
    var events = [];
    if (!prevSnap || !currSnap) return events;

    for (var color in currSnap.players) {
      if (color === myColor) continue;
      var prev = prevSnap.players[color];
      var curr = currSnap.players[color];
      if (!prev || !curr) continue;

      // New cards in tableau (only when full snapshots available)
      var newCards = [];
      if (prev.tableau && curr.tableau) {
        var prevCards = new Set(prev.tableau);
        newCards = curr.tableau.filter(function(c) { return !prevCards.has(c); });
        for (var i = 0; i < newCards.length; i++) {
          events.push({
            type: 'opp_card_play',
            player: color,
            playerName: curr.name,
            card: newCards[i],
          });
        }
      }

      // TR change
      if (curr.tr !== prev.tr) {
        events.push({
          type: 'opp_tr_change',
          player: color,
          playerName: curr.name,
          from: prev.tr, to: curr.tr, delta: curr.tr - prev.tr,
        });
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
        events.push({
          type: 'opp_prod_change',
          player: color, playerName: curr.name,
          changes: prodChanges,
        });
      }

      // Colony count
      if ((curr.colonies || 0) > (prev.colonies || 0)) {
        events.push({
          type: 'opp_colony_build',
          player: color, playerName: curr.name,
          from: prev.colonies, to: curr.colonies,
        });
      }

      // Colony trade
      if ((curr.trades || 0) > (prev.trades || 0)) {
        events.push({
          type: 'opp_colony_trade',
          player: color, playerName: curr.name,
          tradeNumber: curr.trades,
        });
      }

      // City placement (via citiesCount)
      if ((curr.citiesCount || 0) > (prev.citiesCount || 0)) {
        events.push({
          type: 'opp_city_place',
          player: color, playerName: curr.name,
          from: prev.citiesCount, to: curr.citiesCount,
        });
      }

      // lastCardPlayed change — more reliable than tableau diff for detection timing
      if (curr.lastCardPlayed && curr.lastCardPlayed !== prev.lastCardPlayed) {
        // Only emit if not already captured via tableau diff (avoid duplicates)
        var alreadyCaptured = newCards.indexOf(curr.lastCardPlayed) !== -1;
        if (!alreadyCaptured) {
          events.push({
            type: 'opp_card_play',
            player: color,
            playerName: curr.name,
            card: curr.lastCardPlayed,
            source: 'lastCardPlayed',
          });
        }
      }
    }

    // Global parameter changes
    if (prevSnap.globals && currSnap.globals) {
      var params = ['temperature','oxygen','oceans','venus'];
      for (var k = 0; k < params.length; k++) {
        if (currSnap.globals[params[k]] !== prevSnap.globals[params[k]]) {
          events.push({
            type: 'global_change',
            param: params[k],
            from: prevSnap.globals[params[k]],
            to: currSnap.globals[params[k]],
          });
        }
      }
    }

    return events;
  }

  // ── Detect game end ──

  function detectGameEnd() {
    const vpEl = document.querySelector('.game_end_block, .player_home_block--victory-points, [class*="game-end"]');
    if (vpEl && !gameEndDetected) {
      gameEndDetected = true;
      return true;
    }
    return false;
  }

  // ── Main processing loop ──

  let lastWaitingFor = null;

  function processEvents() {
    if (!logging) return;
    const gameId = getGameId();
    if (!gameId) return;

    const log = ensureLog(gameId);
    if (!log) return; // Still loading from storage
    const bridgeData = readBridgeData();
    const actionEvents = readActionLog();

    fillMetadata(bridgeData);

    // Initial snapshot on first run
    if (!initialSnapshotTaken && bridgeData) {
      initialSnapshotTaken = true;
      const initSnap = createSnapshot(bridgeData);
      if (initSnap) {
        const gen = bridgeData.game ? bridgeData.game.generation : null;
        lastSnapshotKey = makeSnapKey(initSnap);
        lastSnapshot = initSnap;
        if (gen !== null) lastGeneration = gen;
        log.events.push({
          id: log.events.length + 1,
          timestamp: Date.now(),
          generation: gen,
          type: 'state_snapshot',
          trigger: 'initial',
          ...initSnap,
        });
      }
    }

    // Generation change detection — take full snapshot on gen change
    if (bridgeData && bridgeData.game) {
      const gen = bridgeData.game.generation;
      if (lastGeneration !== null && gen !== lastGeneration) {
        log.events.push({
          id: log.events.length + 1,
          timestamp: Date.now(),
          generation: gen,
          type: 'generation_change',
          from: lastGeneration, to: gen,
        });
        // Full snapshot at generation boundary (includes tableau)
        const genSnap = createSnapshot(bridgeData);
        if (genSnap) pushSnapshotWithDiff(log, genSnap, gen, true);
      }
      lastGeneration = gen;
    }

    // Process new action events from vue-bridge
    const newEvents = actionEvents.filter(e => e.seq > lastProcessedSeq);

    for (const evt of newEvents) {
      lastProcessedSeq = evt.seq;

      if (evt.type === 'waitingFor') {
        lastWaitingFor = evt.waitingFor;
        const gen = bridgeData && bridgeData.game ? bridgeData.game.generation : null;
        log.events.push({
          id: log.events.length + 1,
          timestamp: evt.timestamp,
          generation: gen,
          type: 'waiting_for',
          inputType: evt.waitingFor ? evt.waitingFor.type : null,
          title: evt.waitingFor ? (evt.waitingFor.title || '').slice(0, 120) : null,
          cardCount: evt.waitingFor && evt.waitingFor.cards ? evt.waitingFor.cards.length : null,
          options: evt.waitingFor && evt.waitingFor.options ? evt.waitingFor.options.map(o => (o.title || '').slice(0, 80)) : null,
        });

      } else if (evt.type === 'playerInput') {
        const classified = classifyInput(evt.body, lastWaitingFor);
        const gen = bridgeData && bridgeData.game ? bridgeData.game.generation : null;

        log.events.push({
          id: log.events.length + 1,
          timestamp: evt.timestamp,
          generation: gen,
          ...classified,
        });

        // Take a full state snapshot after each player decision
        const snap = createSnapshot(bridgeData);
        if (snap) pushSnapshotWithDiff(log, snap, gen, true);

        lastWaitingFor = null;
      }
    }

    log._lastSeq = lastProcessedSeq;

    // Periodic snapshot even without events (to catch opponent actions visible in state changes)
    // Uses compact format (no tableau arrays) to minimize log size
    if (bridgeData && newEvents.length === 0) {
      const snap = createSnapshot(bridgeData);
      if (snap) {
        const gen = bridgeData.game ? bridgeData.game.generation : null;
        pushSnapshotWithDiff(log, snap, gen, false); // compact
      }
    }

    // Detect game end
    if (detectGameEnd()) {
      const gen = bridgeData && bridgeData.game ? bridgeData.game.generation : null;
      // Build game summary from event history
      var summary = { totalEvents: log.events.length, byType: {} };
      for (var si = 0; si < log.events.length; si++) {
        var stype = log.events[si].type || log.events[si].eventType || 'unknown';
        summary.byType[stype] = (summary.byType[stype] || 0) + 1;
      }
      summary.duration = Date.now() - log.startTime;
      summary.generations = gen;
      log.events.push({
        id: log.events.length + 1,
        timestamp: Date.now(),
        generation: gen,
        type: 'game_end',
        summary: summary,
      });
      const finalSnap = createSnapshot(bridgeData);
      if (finalSnap) {
        // Enrich final state with heavy data only available at game end
        if (bridgeData.game) {
          if (bridgeData.game.turmoil) finalSnap.turmoil = bridgeData.game.turmoil;
          if (bridgeData.game.colonies) finalSnap.colonies = bridgeData.game.colonies;
          if (bridgeData.game.awards) finalSnap.awards = bridgeData.game.awards;
          if (bridgeData.game.milestones) finalSnap.milestones = bridgeData.game.milestones;
          if (bridgeData.game.playerTiles) finalSnap.playerTiles = bridgeData.game.playerTiles;
        }
        // VP breakdown per player
        if (bridgeData.players) {
          for (var vi = 0; vi < bridgeData.players.length; vi++) {
            var vp = bridgeData.players[vi];
            if (vp.victoryPointsBreakdown && finalSnap.players[vp.color]) {
              finalSnap.players[vp.color].vpBreakdown = vp.victoryPointsBreakdown;
            }
          }
        }
        log.events.push({
          id: log.events.length + 1,
          timestamp: Date.now(),
          generation: gen,
          type: 'final_state',
          ...finalSnap,
        });
      }
      // Auto-download game log on game end
      try { autoExportLog(log, gen); } catch(e) { console.warn('[TM-Log] auto-export failed:', e); }
    }

    saveLog();
  }

  // ── Auto-export on game end ──

  function autoExportLog(log, gen) {
    if (!log || !log.events || log.events.length < 3) return;
    var json = JSON.stringify(log, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var date = new Date().toISOString().slice(0, 10);
    var corp = 'unknown';
    if (log.players && log.myColor) {
      var me = log.players.find(function(p) { return p.color === log.myColor; });
      if (me && me.corp) corp = me.corp;
    }
    a.href = url;
    a.download = 'tm-log-' + corp.replace(/\s+/g, '_') + '-gen' + (gen || '?') + '-' + date + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('[TM-Log] Auto-exported game log: ' + a.download + ' (' + log.events.length + ' events)');
  }

  // ── Storage ──

  function saveLog() {
    if (!currentLog || typeof chrome === 'undefined' || !chrome.storage) return;
    if (currentLog.events.length === lastSavedEventCount) return;
    lastSavedEventCount = currentLog.events.length;
    const key = 'gamelog_' + currentLog.gameId;
    const data = {};
    data[key] = currentLog;
    try {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          console.warn('[TM-Log] Save failed:', chrome.runtime.lastError.message);
        }
      });
    } catch (e) {
      console.warn('[TM-Log] Storage write failed:', e.message);
    }
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
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.get('gamelog_' + msg.gameId, (data) => {
            sendResponse({ log: data['gamelog_' + msg.gameId] || null });
          });
          return true;
        }
      }
    });
  }

  // ── Main loop ──

  setInterval(processEvents, 2000);
  setTimeout(processEvents, 500);
})();
