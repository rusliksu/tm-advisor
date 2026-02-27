// TM Tier Overlay — Game Event Logger v2
// Captures all player decisions (draft, play, actions) + state snapshots
// Reads action events from vue-bridge (MAIN world) via data-tm-action-log attribute

(function () {
  'use strict';

  let logging = true;
  let currentLog = null;
  let lastProcessedSeq = 0;
  let lastSnapshotKey = '';
  let gameEndDetected = false;

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
    if (currentLog && currentLog.gameId === gameId) return currentLog;

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
      chrome.storage.local.get('gamelog_' + gameId, (data) => {
        const existing = data['gamelog_' + gameId];
        if (existing && existing.version === 2 && existing.gameId === gameId) {
          currentLog = existing;
          lastProcessedSeq = currentLog._lastSeq || 0;
        }
      });
    }

    return currentLog;
  }

  // ── Read bridge data ──

  function readBridgeData() {
    const target = document.getElementById('game') || document.body;
    const raw = target.getAttribute('data-tm-vue-bridge');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
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

  function createSnapshot(bridgeData) {
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
        snap.players[p.color] = {
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
          tableau: p.tableau ? p.tableau.map(c => c.name) : [],
          colonies: p.coloniesCount,
          fleets: p.fleetSize,
          timer: p.timer ? p.timer.sumMs : null,
        };
      }
    }

    // My hand (only visible for own player)
    if (bridgeData.thisPlayer && bridgeData.thisPlayer.cardsInHand) {
      const myColor = bridgeData.thisPlayer.color;
      if (snap.players[myColor]) {
        snap.players[myColor].hand = bridgeData.thisPlayer.cardsInHand.map(c => c.name);
      }
    }

    return snap;
  }

  // ── Fill game metadata ──

  function fillMetadata(bridgeData) {
    if (!currentLog || !bridgeData) return;

    if (!currentLog.gameOptions && bridgeData.game && bridgeData.game.gameOptions) {
      currentLog.gameOptions = bridgeData.game.gameOptions;
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
    const bridgeData = readBridgeData();
    const actionEvents = readActionLog();

    fillMetadata(bridgeData);

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

        // Take a state snapshot after each player decision
        const snap = createSnapshot(bridgeData);
        if (snap) {
          const snapKey = JSON.stringify({ g: snap.globals, p: Object.keys(snap.players).map(c => snap.players[c].mc + ':' + snap.players[c].tr) });
          if (snapKey !== lastSnapshotKey) {
            lastSnapshotKey = snapKey;
            log.events.push({
              id: log.events.length + 1,
              timestamp: Date.now(),
              generation: gen,
              type: 'state_snapshot',
              ...snap,
            });
          }
        }

        lastWaitingFor = null;
      }
    }

    log._lastSeq = lastProcessedSeq;

    // Periodic snapshot even without events (to catch opponent actions visible in state changes)
    if (bridgeData && newEvents.length === 0) {
      const snap = createSnapshot(bridgeData);
      if (snap) {
        const gen = bridgeData.game ? bridgeData.game.generation : null;
        const snapKey = JSON.stringify({
          g: snap.globals,
          p: Object.keys(snap.players).map(c => snap.players[c].mc + ':' + snap.players[c].tr + ':' + snap.players[c].tableau.length),
        });
        if (snapKey !== lastSnapshotKey) {
          lastSnapshotKey = snapKey;
          log.events.push({
            id: log.events.length + 1,
            timestamp: Date.now(),
            generation: gen,
            type: 'state_snapshot',
            ...snap,
          });
        }
      }
    }

    // Detect game end
    if (detectGameEnd()) {
      const gen = bridgeData && bridgeData.game ? bridgeData.game.generation : null;
      log.events.push({
        id: log.events.length + 1,
        timestamp: Date.now(),
        generation: gen,
        type: 'game_end',
      });
      const finalSnap = createSnapshot(bridgeData);
      if (finalSnap) {
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
    var corp = (log.metadata && log.metadata.corp) || 'unknown';
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
    const key = 'gamelog_' + currentLog.gameId;
    const data = {};
    data[key] = currentLog;
    chrome.storage.local.set(data);
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

  setInterval(processEvents, 3000);
  setTimeout(processEvents, 1500);
})();
