// TM Tier Overlay — Game Logging
// Tracks cards drafted, played, opponents' tableau, and game state

(function () {
  'use strict';

  let logging = true;
  let currentLog = null;
  let lastSnapshot = '';

  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get({ logging: true }, (s) => {
      logging = s.logging;
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.logging) logging = changes.logging.newValue;
    });
  }

  /**
   * Get game ID from URL (e.g. /player/pXXXXX or /game/gXXXXX)
   */
  function getGameId() {
    const m = window.location.pathname.match(/\/(player|game)\/([pg][a-f0-9]+)/i);
    return m ? m[2] : null;
  }

  /**
   * Try to access Vue instance data from a DOM element
   */
  function getVueData(el) {
    if (!el) return null;
    // Vue 2 stores data in __vue__
    return el.__vue__ || null;
  }

  /**
   * Extract current game state snapshot from the DOM / Vue data
   */
  function extractGameState() {
    const state = {
      timestamp: Date.now(),
      generation: null,
      phase: null,
      myCards: { hand: [], tableau: [], drafted: [] },
      opponents: [],
      globals: {},
    };

    // Try to get data from the player-home Vue component
    const playerHome = document.querySelector('#game');
    const vue = getVueData(playerHome);

    if (vue && vue.$children) {
      // Navigate Vue component tree to find playerView
      const playerView = findPlayerView(vue);
      if (playerView) {
        // Game info
        const game = playerView.game;
        if (game) {
          state.generation = game.generation;
          state.phase = game.phase;
          state.globals = {
            temperature: game.temperature,
            oxygen: game.oxygenLevel,
            oceans: game.oceans,
            venus: game.venusScaleLevel,
          };
        }

        // My cards
        if (playerView.cardsInHand) {
          state.myCards.hand = playerView.cardsInHand.map((c) => c.name);
        }
        if (playerView.thisPlayer && playerView.thisPlayer.tableau) {
          state.myCards.tableau = playerView.thisPlayer.tableau.map((c) => c.name);
        }
        if (playerView.draftedCards) {
          state.myCards.drafted = playerView.draftedCards.map((c) => c.name);
        }

        // Opponents
        if (playerView.players) {
          for (const p of playerView.players) {
            if (playerView.thisPlayer && p.color === playerView.thisPlayer.color) continue;
            state.opponents.push({
              name: p.name,
              color: p.color,
              tableau: p.tableau ? p.tableau.map((c) => c.name) : [],
              tr: p.terraformRating,
              mc: p.megaCredits,
              handSize: p.cardsInHandNbr,
              lastCard: p.lastCardPlayed || null,
            });
          }
        }
        return state;
      }
    }

    // Fallback: extract from DOM
    return extractFromDOM(state);
  }

  /**
   * Walk Vue component tree to find playerView data
   */
  function findPlayerView(vue) {
    // Check current component
    if (vue.playerView) return vue.playerView;
    if (vue.$data && vue.$data.playerView) return vue.$data.playerView;

    // Check children
    if (vue.$children) {
      for (const child of vue.$children) {
        const found = findPlayerView(child);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Fallback: extract visible data from DOM elements
   */
  function extractFromDOM(state) {
    // My hand
    const handCards = document.querySelectorAll(
      '.player_home_block--hand .card-container[data-tm-card]'
    );
    handCards.forEach((el) => {
      const name = el.getAttribute('data-tm-card');
      if (name) state.myCards.hand.push(name);
    });

    // My tableau
    const playedCards = document.querySelectorAll(
      '.player_home_block--cards .card-container[data-tm-card]'
    );
    playedCards.forEach((el) => {
      const name = el.getAttribute('data-tm-card');
      if (name) state.myCards.tableau.push(name);
    });

    // Generation from log panel
    const genEl = document.querySelector('.log-gen-title');
    if (genEl) {
      const genNum = document.querySelector('.log-gen-num.active, .gen_marker.active');
      if (genNum) state.generation = parseInt(genNum.textContent);
    }

    return state;
  }

  /**
   * Record a snapshot if state changed
   */
  function recordSnapshot() {
    if (!logging) return;

    const gameId = getGameId();
    if (!gameId) return;

    const state = extractGameState();
    const stateKey = JSON.stringify({
      gen: state.generation,
      hand: state.myCards.hand,
      tableau: state.myCards.tableau,
      opps: state.opponents.map((o) => o.tableau),
    });

    // Skip if nothing changed
    if (stateKey === lastSnapshot) return;
    lastSnapshot = stateKey;

    // Initialize log for this game
    if (!currentLog || currentLog.gameId !== gameId) {
      currentLog = {
        gameId: gameId,
        startTime: Date.now(),
        snapshots: [],
        events: [],
      };
    }

    currentLog.snapshots.push(state);

    // Keep only last 50 snapshots to avoid storage bloat
    if (currentLog.snapshots.length > 50) {
      currentLog.snapshots = currentLog.snapshots.slice(-50);
    }

    // Save to storage
    saveLog();
  }

  /**
   * Track card selection events (draft, buy)
   */
  function trackCardEvents() {
    // Watch for card selection changes
    document.addEventListener('click', (e) => {
      if (!logging) return;
      const gameId = getGameId();
      if (!gameId) return;

      const cardbox = e.target.closest('.cardbox');
      if (!cardbox) return;

      const card = cardbox.querySelector('.card-container[data-tm-card]');
      if (!card) return;

      const cardName = card.getAttribute('data-tm-card');
      if (!cardName) return;

      // Check if this is in a selection context
      const selectCard = cardbox.closest('.wf-component--select-card');
      if (!selectCard) return;

      if (!currentLog) {
        currentLog = { gameId, startTime: Date.now(), snapshots: [], events: [] };
      }

      currentLog.events.push({
        time: Date.now(),
        type: 'card_click',
        card: cardName,
        context: getSelectionContext(selectCard),
      });

      // Keep events bounded
      if (currentLog.events.length > 200) {
        currentLog.events = currentLog.events.slice(-200);
      }

      saveLog();
    }, true);
  }

  /**
   * Determine selection context (draft, buy, play)
   */
  function getSelectionContext(selectEl) {
    const title = selectEl.querySelector('.wf-component-title');
    if (title) {
      const text = title.textContent.toLowerCase();
      if (text.includes('draft')) return 'draft';
      if (text.includes('buy')) return 'buy';
      if (text.includes('play')) return 'play';
      if (text.includes('corporation')) return 'corp_select';
      if (text.includes('prelude')) return 'prelude_select';
      return text.slice(0, 30);
    }
    return 'unknown';
  }

  /**
   * Save current log to chrome.storage
   */
  function saveLog() {
    if (!currentLog || typeof chrome === 'undefined' || !chrome.storage) return;

    const key = 'gamelog_' + currentLog.gameId;
    const data = {};
    data[key] = currentLog;
    chrome.storage.local.set(data);
  }

  // ── Periodic snapshot ──

  setInterval(recordSnapshot, 5000); // Every 5 seconds

  // ── Event tracking ──

  trackCardEvents();

  // ── Initial snapshot ──

  setTimeout(recordSnapshot, 2000);
})();
