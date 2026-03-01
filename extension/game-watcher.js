/**
 * game-watcher.js — Watch any TM game and export v4 logs for all players
 *
 * Activates on /game?id=gXXX pages (spectator).
 * Auto-discovers players via /api/game, polls /api/player for each,
 * records drafts, snapshots, card plays. Exports on game end.
 */
(function() {
  'use strict';

  // ══════════════════════════════════════════════════════════════
  // §1. DETECT GAME PAGE
  // ══════════════════════════════════════════════════════════════

  function detectGameId() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id && id.startsWith('g')) return id;
    const match = window.location.pathname.match(/\/game\/?([a-f0-9]+)/i);
    if (match) return 'g' + match[1];
    return null;
  }

  const GAME_ID = detectGameId();
  if (!GAME_ID) return; // Not a game page — exit silently

  // Also skip if this is a player page (content.js handles those)
  if (window.location.pathname.includes('/player')) return;

  // ══════════════════════════════════════════════════════════════
  // §2. CONSTANTS & GLOBALS
  // ══════════════════════════════════════════════════════════════

  const POLL_FAST = 8000;    // 8s during draft
  const POLL_NORMAL = 20000; // 20s during action/production
  const POLL_BACKOFF = 60000; // 60s after repeated failures
  const STORAGE_KEY = 'tm_watcher_' + GAME_ID;

  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 5;

  // Access TM_RATINGS from data/ratings.json.js (loaded before us)
  const RATINGS = (typeof TM_RATINGS !== 'undefined') ? TM_RATINGS : {};

  function getScore(cardName) {
    const r = RATINGS[cardName];
    return r ? { total: r.s, tier: r.t, baseScore: r.s } : { total: 50, tier: '?', baseScore: 50 };
  }

  // ══════════════════════════════════════════════════════════════
  // §3. STATE
  // ══════════════════════════════════════════════════════════════

  const state = {
    gameId: GAME_ID,
    startTime: Date.now(),
    gamePhase: '',
    currentGen: 0,
    gameEnded: false,
    exportDone: false,
    pollCount: 0,
    snapshotCount: 0,
    gameOptions: null,
    map: null,

    // Per-player stores (keyed by playerId)
    players: {},
  };

  function initPlayerState(playerId, name, color) {
    return {
      playerId,
      name,
      color,
      corp: null,

      // Accumulated log data
      draftLog: [],
      draftRound: 0,
      generations: {},
      playedByGen: {},
      frozenCardScores: {},

      // Previous state for diffing
      prevDraftedCards: [],
      prevCardsInHand: [],
      prevTableau: [],
      prevGen: 0,
      prevWaitingFor: null,
      prevPendingOffered: null, // offered cards from last draft waitingFor
      prevPickedCorp: null,
      prevPreludesInHand: [],

      // Latest raw API data
      lastData: null,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // §4. PLAYER DISCOVERY
  // ══════════════════════════════════════════════════════════════

  async function discoverPlayers() {
    try {
      const resp = await fetch('/api/game?id=' + encodeURIComponent(GAME_ID));
      if (!resp.ok) throw new Error('API returned ' + resp.status);
      const data = await resp.json();

      state.gameOptions = data.gameOptions || null;
      state.map = data.gameOptions?.boardName || null;
      state.gamePhase = data.phase || '';

      for (const p of (data.players || [])) {
        state.players[p.id] = initPlayerState(p.id, p.name, p.color);
      }

      return Object.keys(state.players).length > 0;
    } catch (e) {
      console.warn('[TM Watcher] Failed to discover players:', e.message);
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // §5. POLLING
  // ══════════════════════════════════════════════════════════════

  let pollTimer = null;

  function getPollInterval() {
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      return POLL_BACKOFF;
    }
    const phase = state.gamePhase;
    if (phase === 'initial_drafting' || phase === 'drafting' || phase === 'research') {
      return POLL_FAST;
    }
    return POLL_NORMAL;
  }

  function schedulePoll() {
    if (pollTimer) clearTimeout(pollTimer);
    if (state.gameEnded && state.exportDone) return;
    pollTimer = setTimeout(pollAll, getPollInterval());
  }

  async function pollAll() {
    const playerIds = Object.keys(state.players);
    state.pollCount++;

    try {
      // Poll all players in parallel
      const results = await Promise.allSettled(
        playerIds.map(pid => pollPlayer(pid))
      );

      // Track failures across all players
      const failCount = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value === false)).length;
      if (failCount === playerIds.length) {
        consecutiveFailures++;
        if (consecutiveFailures === MAX_CONSECUTIVE_FAILURES) {
          console.warn('[TM Watcher] All polls failing — switching to backoff interval');
        }
      } else {
        consecutiveFailures = 0;
      }

      // Check game end from any player's data
      for (const pid of playerIds) {
        const p = state.players[pid];
        if (p.lastData && p.lastData.game) {
          state.gamePhase = p.lastData.game.phase || '';
          state.currentGen = p.lastData.game.generation || 0;
          break;
        }
      }

      // Game end
      if (state.gamePhase === 'end' && !state.gameEnded) {
        state.gameEnded = true;
        handleGameEnd();
        return;
      }

      updatePanel();
    } catch (e) {
      console.warn('[TM Watcher] Poll error:', e.message);
    }

    schedulePoll();
  }

  async function pollPlayer(playerId) {
    const p = state.players[playerId];
    if (!p) return false;

    try {
      const resp = await fetch('/api/player?id=' + encodeURIComponent(playerId));
      if (!resp.ok) {
        if (resp.status === 429) {
          console.warn('[TM Watcher] Rate limited polling', p.name);
        } else if (resp.status >= 500) {
          console.warn('[TM Watcher] Server error', resp.status, 'polling', p.name);
        }
        return false;
      }
      const data = await resp.json();

      const prevData = p.lastData;
      p.lastData = data;

      // Extract player info
      const tp = data.thisPlayer || {};
      if (!p.corp && tp.tableau && tp.tableau.length > 0) {
        p.corp = tp.tableau[0]?.name || null; // Corp is first in tableau
      }

      // Detect generation change → snapshot
      const gen = data.game?.generation || 0;
      if (gen > 0 && gen !== p.prevGen) {
        createSnapshot(p, data, gen);
        p.prevGen = gen;
      }

      // Draft detection
      detectDraftChanges(p, data);

      // Corp/Prelude detection
      detectCorpPrelude(p, data);

      // Card play tracking (tableau diff)
      const curTableau = (tp.tableau || []).map(c => c.name);
      trackTableauChanges(p, curTableau, gen);
      p.prevTableau = curTableau;

      return true;
    } catch (e) {
      console.warn('[TM Watcher] Poll failed for', p.name + ':', e.message);
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // §6. DRAFT DETECTION
  // ══════════════════════════════════════════════════════════════

  function detectDraftChanges(p, data) {
    const curDrafted = (data.draftedCards || []).map(c => c.name);
    const wf = data.waitingFor;
    const phase = data.game?.phase || '';

    // FIRST: detect new drafted cards using the PREVIOUS offered set
    // (before we overwrite it with current waitingFor)
    if (curDrafted.length > p.prevDraftedCards.length && p.prevPendingOffered) {
      const prevSet = new Set(p.prevDraftedCards);
      const newCards = curDrafted.filter(c => !prevSet.has(c));

      for (const taken of newCards) {
        p.draftRound++;
        p.draftLog.push({
          round: p.draftRound,
          offered: p.prevPendingOffered,
          taken: taken,
          passed: null,
        });
      }
      p.prevPendingOffered = null;
    }

    // THEN: update pending offered from current waitingFor (for next poll)
    if (wf && wf.type === 'card' && wf.cards && wf.cards.length > 0) {
      const isDraft = (phase === 'initial_drafting' || phase === 'drafting' || phase === 'research');
      const titleStr = typeof wf.title === 'string' ? wf.title : (wf.title?.text || '');
      const looksDraft = isDraft || /draft|keep|select.*card/i.test(titleStr);

      if (looksDraft && !wf.selectBlueCardAction) {
        p.prevPendingOffered = wf.cards.map(c => ({
          name: c.name,
          ...getScore(c.name),
        }));
      }
    }

    // Also detect research phase buys (cards moved from draftedCards to hand)
    const curHand = (data.cardsInHand || []).map(c => c.name);
    // Research → action transition: draftedCards empties, cardsInHand changes
    if (p.prevDraftedCards.length > 0 && curDrafted.length === 0 && phase === 'action') {
      // Draft round ended, cards were kept/discarded
      // The kept cards are in cardsInHand
    }

    p.prevDraftedCards = curDrafted;
    p.prevCardsInHand = curHand;
  }

  // ══════════════════════════════════════════════════════════════
  // §7. CORP & PRELUDE DETECTION
  // ══════════════════════════════════════════════════════════════

  function detectCorpPrelude(p, data) {
    // Corp selection
    const pickedCorp = data.pickedCorporationCard;
    if (pickedCorp && pickedCorp.length > 0 && !p.prevPickedCorp) {
      const chosen = pickedCorp[0].name;
      const offered = (data.dealtCorporationCards || []).map(c => ({
        name: c.name,
        ...getScore(c.name),
      }));

      // Add corp round to draftLog (replay-analyzer classifies it via cardType)
      if (offered.length > 0) {
        p.draftRound++;
        p.draftLog.push({
          round: p.draftRound,
          offered: offered,
          taken: chosen,
          passed: null,
        });
      }
      p.corp = chosen;
      p.prevPickedCorp = chosen;
    }

    // Prelude selection
    const preludesInHand = (data.preludeCardsInHand || []).map(c => c.name);
    if (preludesInHand.length > 0 && p.prevPreludesInHand.length === 0) {
      const offered = (data.dealtPreludeCards || []).map(c => ({
        name: c.name,
        ...getScore(c.name),
      }));

      // Add prelude rounds to draftLog
      for (const chosen of preludesInHand) {
        const roundOffered = offered.length > 0 ? offered : [{ name: chosen, ...getScore(chosen) }];
        p.draftRound++;
        p.draftLog.push({
          round: p.draftRound,
          offered: roundOffered,
          taken: chosen,
          passed: null,
        });
      }
    }
    p.prevPreludesInHand = preludesInHand;
  }

  // ══════════════════════════════════════════════════════════════
  // §8. SNAPSHOTS & CARD TRACKING
  // ══════════════════════════════════════════════════════════════

  function createSnapshot(p, data, gen) {
    const game = data.game || {};
    const allPlayers = data.players || [];

    const playersSnap = {};
    for (const pl of allPlayers) {
      playersSnap[pl.color] = {
        name: pl.name,
        tr: pl.terraformRating || 0,
        mc: pl.megaCredits || 0,
        mcProd: pl.megaCreditProduction || 0,
        steel: pl.steel || 0,
        steelProd: pl.steelProduction || 0,
        ti: pl.titanium || 0,
        tiProd: pl.titaniumProduction || 0,
        plants: pl.plants || 0,
        plantProd: pl.plantProduction || 0,
        energy: pl.energy || 0,
        energyProd: pl.energyProduction || 0,
        heat: pl.heat || 0,
        heatProd: pl.heatProduction || 0,
        cardsInHand: pl.cardsInHandNbr || 0,
        tableau: (pl.tableau || []).map(c => c.name),
        colonies: pl.coloniesCount || 0,
        fleetSize: pl.fleetSize || 1,
        tradesThisGen: pl.tradesThisGeneration || 0,
      };
    }

    const snapshot = {
      timestamp: Date.now(),
      gen: gen,
      globalParams: {
        temp: game.temperature,
        oxy: game.oxygenLevel,
        venus: game.venusScaleLevel,
        oceans: game.oceans,
      },
      players: playersSnap,
    };

    // Colonies
    if (game.colonies) {
      snapshot.colonies = game.colonies.map(function(col) {
        return {
          name: col.name,
          colonies: col.colonies || [],
          isActive: col.isActive,
          trackPosition: col.trackPosition,
          visitor: col.visitor,
        };
      });
    }

    // Turmoil
    if (game.turmoil) {
      snapshot.turmoil = {
        ruling: game.turmoil.ruling,
        dominant: game.turmoil.dominant,
        chairman: game.turmoil.chairman,
      };
    }

    // Awards & Milestones
    if (game.awards) snapshot.awards = game.awards;
    if (game.milestones) snapshot.milestones = game.milestones;

    if (!p.generations[gen]) {
      p.generations[gen] = {};
    }
    p.generations[gen].snapshot = snapshot;
    p.generations[gen].timestamp = Date.now();

    // Freeze card scores for cards in this player's tableau
    const tp = data.thisPlayer || {};
    for (const card of (tp.tableau || [])) {
      if (!p.frozenCardScores[card.name]) {
        const sc = getScore(card.name);
        p.frozenCardScores[card.name] = {
          score: sc.total,
          baseTier: sc.tier,
          baseScore: sc.baseScore,
          gen: gen,
        };
      }
    }

    state.snapshotCount++;
  }

  function trackTableauChanges(p, curTableau, gen) {
    if (gen <= 0) return;
    const prevSet = new Set(p.prevTableau);
    const newCards = curTableau.filter(c => !prevSet.has(c));

    if (newCards.length > 0) {
      if (!p.playedByGen[gen]) p.playedByGen[gen] = [];
      for (const card of newCards) {
        if (!p.playedByGen[gen].includes(card)) {
          p.playedByGen[gen].push(card);
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // §9. GAME END & EXPORT
  // ══════════════════════════════════════════════════════════════

  function handleGameEnd() {
    // Take final snapshots
    for (const pid of Object.keys(state.players)) {
      const p = state.players[pid];
      if (p.lastData) {
        const gen = p.lastData.game?.generation || state.currentGen;
        createSnapshot(p, p.lastData, gen);
      }
    }

    // Build and download single combined export
    setTimeout(() => {
      const playerList = Object.values(state.players);
      const allPlayers = playerList.map(p => ({
        name: p.name,
        color: p.color,
        corp: p.corp || '',
        isMe: false,
      }));

      const combined = {
        version: 4,
        _watchMode: true,
        _combined: true,
        gameId: state.gameId,
        map: state.map || '',
        endGen: state.currentGen,
        exportTime: new Date().toISOString(),
        gameOptions: state.gameOptions,
        players: playerList.map(p => buildExport(p, allPlayers)),
      };

      const gen = state.currentGen || 'X';
      const date = new Date().toISOString().slice(0, 10);
      const names = playerList.map(p => (p.name || '').replace(/[^a-zA-Z0-9_-]/g, '')).join('-');
      const gameIdShort = state.gameId.slice(0, 12);
      downloadJson(combined, `tm-watch-${names}-${gameIdShort}-gen${gen}-${date}.json`);

      state.exportDone = true;
      updatePanel();
      showToast(`Логи ${playerList.length} игроков экспортированы`);
    }, 2000); // Wait for final data to settle
  }

  function buildExport(p, allPlayers) {
    // Build finalScores from last poll data
    const finalScores = {};
    if (p.lastData && p.lastData.players) {
      for (const pl of p.lastData.players) {
        const vp = pl.victoryPointsBreakdown || {};
        finalScores[pl.color] = {
          total: vp.total || 0,
          tr: vp.terraformRating || 0,
          milestones: vp.milestones || 0,
          awards: vp.awards || 0,
          greenery: vp.greenery || 0,
          city: vp.city || 0,
          cards: vp.victoryPoints || 0,
          vpByGen: pl.victoryPointsByGeneration || [],
        };
      }
    }

    const genKeys = Object.keys(p.generations).map(Number).sort((a, b) => a - b);
    const endGen = genKeys.length > 0 ? genKeys[genKeys.length - 1] : state.currentGen;

    return {
      version: 4,
      exportTime: new Date().toISOString(),
      startTime: state.startTime,
      gameId: state.gameId,
      myColor: p.color,
      myCorp: p.corp,
      players: allPlayers.map(pl => ({
        ...pl,
        isMe: pl.color === p.color,
      })),
      map: state.map || '',
      endGen: endGen,
      generations: p.generations,
      draftLog: p.draftLog,
      frozenCardScores: p.frozenCardScores,
      finalScores: finalScores,
      gameDuration: state.startTime ? Date.now() - state.startTime : 0,
      gameOptions: state.gameOptions || {},
      _watchMode: true,
      _pollCount: state.pollCount,
      _snapshotCount: state.snapshotCount,
    };
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function showToast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      background: '#4CAF50', color: '#fff', padding: '12px 24px', borderRadius: '8px',
      fontSize: '14px', fontWeight: 'bold', zIndex: '100000', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  // ══════════════════════════════════════════════════════════════
  // §10. STATUS PANEL
  // ══════════════════════════════════════════════════════════════

  let panelEl = null;

  function createPanel() {
    panelEl = document.createElement('div');
    panelEl.className = 'tm-watcher-panel';
    panelEl.innerHTML = '<div class="tm-watcher-title">TM Watcher</div><div class="tm-watcher-body"></div>';

    // Inline styles as fallback (in case content.css doesn't load for spectator)
    Object.assign(panelEl.style, {
      position: 'fixed', top: '10px', right: '10px', zIndex: '99999',
      background: 'rgba(0, 0, 0, 0.85)', color: '#e0e0e0',
      padding: '10px 14px', borderRadius: '8px', fontSize: '12px',
      fontFamily: 'monospace', minWidth: '200px', maxWidth: '300px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.5)', border: '1px solid #444',
      cursor: 'move', userSelect: 'none',
    });

    // Draggable
    let dragging = false, offsetX, offsetY;
    panelEl.addEventListener('mousedown', (e) => {
      dragging = true;
      offsetX = e.clientX - panelEl.offsetLeft;
      offsetY = e.clientY - panelEl.offsetTop;
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panelEl.style.left = (e.clientX - offsetX) + 'px';
      panelEl.style.right = 'auto';
      panelEl.style.top = (e.clientY - offsetY) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });

    document.body.appendChild(panelEl);
    updatePanel();
  }

  function updatePanel() {
    if (!panelEl) return;
    const body = panelEl.querySelector('.tm-watcher-body');
    if (!body) return;

    const playerList = Object.values(state.players);
    const names = playerList.map(p => {
      const corpStr = p.corp ? ` (${p.corp.slice(0, 12)})` : '';
      return `<span style="color:${colorToHex(p.color)}">${p.name}${corpStr}</span>`;
    }).join(', ');

    const phaseColors = {
      'initial_drafting': '#FFD700', 'drafting': '#FFD700', 'research': '#FFD700',
      'action': '#4CAF50', 'production': '#2196F3', 'end': '#F44336',
    };
    const phaseColor = phaseColors[state.gamePhase] || '#888';

    let statusLine = '';
    if (state.exportDone) {
      statusLine = '<span style="color:#4CAF50">Export complete</span>';
    } else if (state.gameEnded) {
      statusLine = '<span style="color:#FFD700">Exporting...</span>';
    } else {
      statusLine = `Gen <b>${state.currentGen}</b> | ` +
        `<span style="color:${phaseColor}">${state.gamePhase || '...'}</span> | ` +
        `${state.snapshotCount} snaps`;
    }

    body.innerHTML = `<div style="margin-bottom:4px">${names}</div><div>${statusLine}</div>`;
  }

  function colorToHex(color) {
    const map = {
      red: '#E53935', green: '#43A047', yellow: '#FDD835', blue: '#1E88E5',
      black: '#BDBDBD', purple: '#8E24AA', orange: '#FB8C00', pink: '#EC407A',
    };
    return map[color] || '#ccc';
  }

  // ══════════════════════════════════════════════════════════════
  // §11. PERSISTENCE (chrome.storage)
  // ══════════════════════════════════════════════════════════════

  function saveState() {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    try {
      // Save minimal state for resume after reload
      const saveData = {
        gameId: state.gameId,
        startTime: state.startTime,
        gamePhase: state.gamePhase,
        currentGen: state.currentGen,
        snapshotCount: state.snapshotCount,
        pollCount: state.pollCount,
        gameOptions: state.gameOptions,
        map: state.map,
        players: {},
      };

      for (const [pid, p] of Object.entries(state.players)) {
        saveData.players[pid] = {
          playerId: p.playerId,
          name: p.name,
          color: p.color,
          corp: p.corp,
          draftLog: p.draftLog,
          draftRound: p.draftRound,
          generations: p.generations,
          playedByGen: p.playedByGen,
          frozenCardScores: p.frozenCardScores,
          prevDraftedCards: p.prevDraftedCards,
          prevTableau: p.prevTableau,
          prevGen: p.prevGen,
          prevPickedCorp: p.prevPickedCorp,
          prevPreludesInHand: p.prevPreludesInHand,
        };
      }

      const data = {};
      data[STORAGE_KEY] = saveData;
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          console.warn('[TM Watcher] Save failed:', chrome.runtime.lastError.message);
        }
      });
    } catch (e) {
      console.warn('[TM Watcher] Storage write failed:', e.message);
    }
  }

  async function loadState() {
    if (typeof chrome === 'undefined' || !chrome.storage) return false;
    return new Promise((resolve) => {
      try {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        if (chrome.runtime.lastError) {
          console.warn('[TM Watcher] Load state failed:', chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        const saved = result[STORAGE_KEY];
        if (!saved || saved.gameId !== GAME_ID) {
          resolve(false);
          return;
        }

        // Restore state
        state.startTime = saved.startTime || state.startTime;
        state.gamePhase = saved.gamePhase || '';
        state.currentGen = saved.currentGen || 0;
        state.snapshotCount = saved.snapshotCount || 0;
        state.pollCount = saved.pollCount || 0;
        state.gameOptions = saved.gameOptions;
        state.map = saved.map;

        for (const [pid, sp] of Object.entries(saved.players || {})) {
          const p = initPlayerState(sp.playerId, sp.name, sp.color);
          p.corp = sp.corp;
          p.draftLog = sp.draftLog || [];
          p.draftRound = sp.draftRound || 0;
          p.generations = sp.generations || {};
          p.playedByGen = sp.playedByGen || {};
          p.frozenCardScores = sp.frozenCardScores || {};
          p.prevDraftedCards = sp.prevDraftedCards || [];
          p.prevTableau = sp.prevTableau || [];
          p.prevGen = sp.prevGen || 0;
          p.prevPickedCorp = sp.prevPickedCorp || null;
          p.prevPreludesInHand = sp.prevPreludesInHand || [];
          state.players[pid] = p;
        }

        console.log('[TM Watcher] Restored state:', state.snapshotCount, 'snapshots');
        resolve(true);
      });
      } catch (e) {
        console.warn('[TM Watcher] Storage read failed:', e.message);
        resolve(false);
      }
    });
  }

  // Auto-save every 30 seconds
  setInterval(saveState, 30000);

  // ══════════════════════════════════════════════════════════════
  // §12. INIT
  // ══════════════════════════════════════════════════════════════

  let initAttempts = 0;
  const MAX_INIT_ATTEMPTS = 5;

  async function init() {
    initAttempts++;
    console.log('[TM Watcher] Detected game page:', GAME_ID, '(attempt', initAttempts + ')');

    // Try to restore saved state first
    const restored = await loadState();

    if (!restored || Object.keys(state.players).length === 0) {
      // Discover players from API
      const found = await discoverPlayers();
      if (!found) {
        if (initAttempts >= MAX_INIT_ATTEMPTS) {
          console.error('[TM Watcher] Failed to discover players after', MAX_INIT_ATTEMPTS, 'attempts. Giving up.');
          return;
        }
        console.warn('[TM Watcher] No players found. Retrying in 5s... (attempt', initAttempts, '/', MAX_INIT_ATTEMPTS + ')');
        setTimeout(init, 5000);
        return;
      }
    }

    const count = Object.keys(state.players).length;
    console.log(`[TM Watcher] Watching ${count} players:`,
      Object.values(state.players).map(p => `${p.name} (${p.color})`).join(', '));

    createPanel();

    // Start polling
    pollAll();
  }

  // Wait for page to settle before starting
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 2000));
  } else {
    setTimeout(init, 2000);
  }

})();
