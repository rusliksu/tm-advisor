'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const BOT = require('./smartbot');

const DEFAULT_SERVER_URL = 'http://127.0.0.1:8081';
const SHADOW_DIR = path.resolve(__dirname, '..', 'data', 'shadow');
const MANAGER_DIR = path.join(SHADOW_DIR, 'manager');
const SIMULTANEOUS_PHASES = new Set(['initialDrafting', 'initial_drafting', 'research', 'drafting', 'prelude']);
const RESOURCE_FIELDS = ['mc', 'tr', 'heat', 'plants', 'energy', 'steel', 'titanium'];

fs.mkdirSync(SHADOW_DIR, {recursive: true});
fs.mkdirSync(MANAGER_DIR, {recursive: true});

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    mod.get({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`${url} returned ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function appendJsonl(logFile, entry) {
  fs.mkdirSync(path.dirname(logFile), {recursive: true});
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function nameOf(item) {
  if (!item) return null;
  if (typeof item === 'string') return item;
  if (typeof item.name === 'string') return item.name;
  return null;
}

function namesOf(items) {
  return safeArray(items).map(nameOf).filter(Boolean);
}

function normalizeState(state) {
  if (state?.thisPlayer?.megaCredits != null && state?.thisPlayer?.megacredits == null) {
    state.thisPlayer.megacredits = state.thisPlayer.megaCredits;
  }
  for (const player of safeArray(state?.players)) {
    if (player?.megaCredits != null && player?.megacredits == null) {
      player.megacredits = player.megaCredits;
    }
  }
  if (!state.cardsInHand && state.thisPlayer) {
    state.cardsInHand = state.thisPlayer.cardsInHand || [];
  }
  return state;
}

function getTitle(wf) {
  if (!wf) return '';
  if (typeof wf.title === 'string') return wf.title;
  if (wf.title && typeof wf.title === 'object') {
    if (typeof wf.title.message === 'string') return wf.title.message;
    if (typeof wf.title.title === 'string') return wf.title.title;
    if (typeof wf.title.text === 'string') return wf.title.text;
    return wf.type || '';
  }
  return wf.type || '';
}

function hashWf(wf) {
  if (!wf) return 'idle';
  const title = getTitle(wf);
  const cards = namesOf(wf.cards).join(',');
  const options = safeArray(wf.options).map((option) => {
    const optionTitle = getTitle(option);
    const optionCards = namesOf(option.cards).join(',');
    return `${option.type || '?'}:${optionTitle}:${optionCards}`;
  }).join('|');
  return [
    wf.type || '',
    wf.buttonLabel || '',
    title.slice(0, 80),
    cards.slice(0, 160),
    options.slice(0, 240),
  ].join('||');
}

function summarizeAction(input) {
  if (!input) return '?';
  if (input.type === 'or') {
    const inner = input.response;
    if (inner?.type === 'projectCard') return `play ${inner.card}`;
    if (inner?.type === 'card') return `cards: ${(inner.cards || []).join(', ')}`;
    return `option[${input.index}]`;
  }
  if (input.type === 'and') {
    return safeArray(input.responses).map(summarizeAction).join(' + ');
  }
  if (input.type === 'card') return `cards: ${(input.cards || []).join(', ')}`;
  if (input.type === 'projectCard') return `play ${input.card}`;
  if (input.type === 'payment') return 'payment';
  if (input.type === 'space') return `space ${input.spaceId}`;
  if (input.type === 'colony') return `colony ${input.spaceId || input.colonyName || ''}`.trim();
  if (input.type === 'option') return Number.isInteger(input.index) ? `option[${input.index}]` : 'option';
  return input.type;
}

function countByValue(items) {
  const counts = new Map();
  for (const item of safeArray(items)) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return counts;
}

function multisetAdded(currItems, prevItems) {
  const prevCounts = countByValue(prevItems);
  const added = [];
  for (const item of safeArray(currItems)) {
    const left = prevCounts.get(item) || 0;
    if (left > 0) {
      prevCounts.set(item, left - 1);
    } else {
      added.push(item);
    }
  }
  return added;
}

function multisetRemoved(currItems, prevItems) {
  return multisetAdded(prevItems, currItems);
}

function diffResources(prevSummary, currSummary) {
  const diff = {};
  for (const field of RESOURCE_FIELDS) {
    const prev = prevSummary?.[field];
    const curr = currSummary?.[field];
    if (prev !== curr) {
      diff[field] = {from: prev, to: curr};
    }
  }
  return diff;
}

function stateSignature(summary) {
  return JSON.stringify({
    workflowHash: summary.workflowHash,
    promptType: summary.promptType,
    title: summary.title,
    generation: summary.generation,
    phase: summary.phase,
    activePlayer: summary.activePlayer,
    inputSeq: summary.inputSeq,
    actionsTakenThisRound: summary.actionsTakenThisRound,
    actionsTakenThisGame: summary.actionsTakenThisGame,
    mc: summary.mc,
    tr: summary.tr,
    heat: summary.heat,
    plants: summary.plants,
    energy: summary.energy,
    steel: summary.steel,
    titanium: summary.titanium,
    lastCardPlayed: summary.lastCardPlayed,
    tableau: summary.tableau,
    cardsInHand: summary.cardsInHand,
    currentPack: summary.currentPack,
    draftedCards: summary.draftedCards,
    pickedCorpCards: summary.pickedCorpCards,
    preludeCardsInHand: summary.preludeCardsInHand,
    ceoCardsInHand: summary.ceoCardsInHand,
    actionsThisGeneration: summary.actionsThisGeneration,
  });
}

function buildStateSummary(state, meta = {}) {
  normalizeState(state);
  const wf = state.waitingFor || null;
  const game = state.game || {};
  const me = state.thisPlayer || {};
  return {
    gameId: game.gameId || meta.gameId || null,
    playerId: meta.playerId || null,
    player: me.name || meta.player || meta.playerId || '?',
    color: me.color || meta.color || '?',
    generation: game.generation ?? null,
    phase: game.phase || '',
    activePlayer: game.activePlayer || null,
    inputSeq: game.inputSeq ?? null,
    workflowHash: hashWf(wf),
    promptType: wf?.type || null,
    title: getTitle(wf).slice(0, 80),
    mc: me.megacredits ?? me.megaCredits ?? null,
    tr: me.terraformRating ?? null,
    heat: me.heat ?? null,
    plants: me.plants ?? null,
    energy: me.energy ?? null,
    steel: me.steel ?? null,
    titanium: me.titanium ?? null,
    actionsTakenThisRound: me.actionsTakenThisRound ?? null,
    actionsTakenThisGame: me.actionsTakenThisGame ?? null,
    actionsThisGeneration: safeArray(me.actionsThisGeneration),
    tableau: namesOf(me.tableau),
    cardsInHand: namesOf(state.cardsInHand || me.cardsInHand),
    currentPack: namesOf(wf?.cards),
    draftedCards: namesOf(state.draftedCards),
    dealtProjectCards: namesOf(state.dealtProjectCards),
    pickedCorpCards: namesOf(state.pickedCorporationCard),
    preludeCardsInHand: namesOf(state.preludeCardsInHand),
    ceoCardsInHand: namesOf(state.ceoCardsInHand || state.ceoCardsInHand),
    dealtCorporationCards: namesOf(state.dealtCorporationCards),
    dealtPreludeCards: namesOf(state.dealtPreludeCards),
    dealtCeoCards: namesOf(state.dealtCEOCards || state.dealtCeoCards),
    lastCardPlayed: me.lastCardPlayed || null,
  };
}

function deriveObservedChanges(prevSummary, currSummary) {
  return {
    tableauAdded: multisetAdded(currSummary.tableau, prevSummary.tableau),
    tableauRemoved: multisetRemoved(currSummary.tableau, prevSummary.tableau),
    handAdded: multisetAdded(currSummary.cardsInHand, prevSummary.cardsInHand),
    handRemoved: multisetRemoved(currSummary.cardsInHand, prevSummary.cardsInHand),
    draftedAdded: multisetAdded(currSummary.draftedCards, prevSummary.draftedCards),
    currentPackAdded: multisetAdded(currSummary.currentPack, prevSummary.currentPack),
    currentPackRemoved: multisetRemoved(currSummary.currentPack, prevSummary.currentPack),
    corpAdded: multisetAdded(currSummary.pickedCorpCards, prevSummary.pickedCorpCards),
    preludeAdded: multisetAdded(currSummary.preludeCardsInHand, prevSummary.preludeCardsInHand),
    ceoAdded: multisetAdded(currSummary.ceoCardsInHand, prevSummary.ceoCardsInHand),
    actionsAdded: multisetAdded(currSummary.actionsThisGeneration, prevSummary.actionsThisGeneration),
    resources: diffResources(prevSummary, currSummary),
    promptFrom: prevSummary.promptType,
    promptTo: currSummary.promptType,
    phaseFrom: prevSummary.phase,
    phaseTo: currSummary.phase,
    generationFrom: prevSummary.generation,
    generationTo: currSummary.generation,
    lastCardPlayedFrom: prevSummary.lastCardPlayed,
    lastCardPlayedTo: currSummary.lastCardPlayed,
  };
}

function summarizeObservedAction(changes) {
  if (changes.tableauAdded.length > 0) return `play ${changes.tableauAdded.join(', ')}`;
  if (changes.draftedAdded.length > 0) return `draft ${changes.draftedAdded.join(', ')}`;
  if (changes.corpAdded.length > 0) return `corp ${changes.corpAdded.join(', ')}`;
  if (changes.preludeAdded.length > 0) return `prelude ${changes.preludeAdded.join(', ')}`;
  if (changes.ceoAdded.length > 0) return `ceo ${changes.ceoAdded.join(', ')}`;
  if (changes.actionsAdded.length > 0) return `action ${changes.actionsAdded.join(', ')}`;
  if (changes.lastCardPlayedTo && changes.lastCardPlayedTo !== changes.lastCardPlayedFrom) {
    return `lastCard ${changes.lastCardPlayedTo}`;
  }
  const resourceNames = Object.keys(changes.resources);
  if (resourceNames.length > 0) {
    return `resource delta ${resourceNames.join(', ')}`;
  }
  if (changes.promptFrom !== changes.promptTo) {
    return `prompt ${changes.promptFrom || 'idle'} -> ${changes.promptTo || 'idle'}`;
  }
  if (changes.phaseFrom !== changes.phaseTo) {
    return `phase ${changes.phaseFrom || '?'} -> ${changes.phaseTo || '?'}`;
  }
  return 'state changed';
}

function runBotDecisionSilently(waitingFor, rawState) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  console.log = () => {};
  console.warn = () => {};
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  try {
    const botInput = BOT.handleInput(waitingFor, normalizeState(rawState));
    const reasoning = BOT.flushReasoning ? BOT.flushReasoning() : null;
    return {botInput, reasoning};
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

function buildPredictionEntry(session, playerMeta, rawState, summary) {
  let botInput;
  let reasoning;
  try {
    ({botInput, reasoning} = runBotDecisionSilently(rawState.waitingFor, rawState));
  } catch (err) {
    botInput = {type: 'error', message: err.message};
    reasoning = null;
  }
  return {
    ts: new Date().toISOString(),
    gameId: session.gameId,
    gen: summary.generation,
    playerId: playerMeta.id,
    player: summary.player,
    color: summary.color,
    phase: summary.phase || '',
    promptType: summary.promptType,
    title: summary.title,
    promptInputSeq: summary.inputSeq ?? null,
    inputSeq: null,
    mc: summary.mc,
    botAction: summarizeAction(botInput),
    botReasoning: reasoning,
    playerActed: false,
    observedAction: null,
  };
}

function resolvePendingEntry(pendingEntry, prevSummary, currSummary, status = 'resolved') {
  const changes = deriveObservedChanges(prevSummary, currSummary);
  const previousInputSeq = Number.isInteger(prevSummary?.inputSeq) ? prevSummary.inputSeq : null;
  const currentInputSeq = Number.isInteger(currSummary?.inputSeq) ? currSummary.inputSeq : null;
  const playerActed = previousInputSeq !== null && currentInputSeq !== null
    ? currentInputSeq > previousInputSeq
    : true;
  return {
    ...pendingEntry,
    resolvedAt: new Date().toISOString(),
    status,
    gen: currSummary.generation ?? pendingEntry.gen ?? null,
    phase: currSummary.phase || pendingEntry.phase || '',
    promptInputSeq: pendingEntry.promptInputSeq ?? prevSummary.inputSeq ?? null,
    inputSeq: currSummary.inputSeq ?? null,
    playerActed,
    observedAction: summarizeObservedAction(changes),
    observedChanges: changes,
  };
}

function isGameEnded(game) {
  const phase = game?.phase;
  return phase === 'end' || phase === 'the_end' || game?.isTerraformed === true;
}

function phaseNeedsAllPlayers(phase) {
  return SIMULTANEOUS_PHASES.has(phase);
}

function shouldCreatePredictionForSummary(summary) {
  if (!summary || summary.workflowHash === 'idle') return false;
  const phase = String(summary.phase || '').toLowerCase();
  if (phase === 'solar' || phase === 'production') return false;
  return true;
}

function getPlayersToPoll(session, game) {
  const ids = new Set();
  for (const [playerId, state] of session.playerState.entries()) {
    if (state.pendingShadow) ids.add(playerId);
  }
  const phase = game?.phase || '';
  if (phaseNeedsAllPlayers(phase) || (session.inputBurstPollsRemaining || 0) > 0) {
    for (const player of session.players) ids.add(player.id);
    return [...ids];
  }
  const activeColor = game?.activePlayer;
  const activeId = activeColor ? session.colorToPlayerId.get(activeColor) : null;
  if (activeId) {
    ids.add(activeId);
    return [...ids];
  }
  for (const player of session.players) ids.add(player.id);
  return [...ids];
}

async function fetchPlayerState(serverUrl, playerId) {
  return fetchJSON(`${serverUrl}/api/player?id=${encodeURIComponent(playerId)}`);
}

async function discoverPlayers(options) {
  const serverUrl = (options.serverUrl || DEFAULT_SERVER_URL).replace(/\/$/, '');
  const requestedPlayerIds = safeArray(options.playerIds);
  let gameId = options.gameId || null;
  let players = [];
  let initialGame = null;

  if (requestedPlayerIds.length > 0) {
    for (const playerId of requestedPlayerIds) {
      const state = await fetchPlayerState(serverUrl, playerId);
      const discoveredGameId = state?.game?.gameId;
      if (!gameId && discoveredGameId) gameId = discoveredGameId;
      players.push({
        id: playerId,
        name: state?.thisPlayer?.name || playerId,
        color: state?.thisPlayer?.color || '?',
      });
    }
    if (!gameId) {
      throw new Error('Cannot resolve game id from explicit player ids');
    }
    initialGame = await fetchJSON(`${serverUrl}/api/game?id=${encodeURIComponent(gameId)}`);
  } else {
    if (!gameId) throw new Error('game id is required');
    initialGame = await fetchJSON(`${serverUrl}/api/game?id=${encodeURIComponent(gameId)}`);
    players = safeArray(initialGame.players).map((player) => ({
      id: player.id,
      name: player.name || player.id,
      color: player.color || '?',
    }));
  }

  const playerFilter = options.playerFilter;
  if (playerFilter) {
    players = players.filter((player) =>
      player.id === playerFilter || player.color === playerFilter || player.name === playerFilter);
  }
  if (players.length === 0) {
    throw new Error(`No players found for ${gameId}`);
  }

  return {gameId, players, initialGame, serverUrl};
}

async function startShadowSession(options) {
  const {
    gameId,
    players,
    initialGame,
    serverUrl,
  } = await discoverPlayers(options);
  const logDir = options.logDir || SHADOW_DIR;
  const logFile = path.join(logDir, `shadow-${gameId}.jsonl`);
  const colorToPlayerId = new Map(players.map((player) => [player.color, player.id]));
  const session = {
    gameId,
    players,
    serverUrl,
    logFile,
    currentGame: initialGame,
    inputBurstPollsRemaining: 0,
    colorToPlayerId,
    playerState: new Map(players.map((player) => [player.id, {
      lastSummary: null,
      lastSignature: null,
      pendingShadow: null,
      pendingSummary: null,
    }])),
  };

  appendJsonl(logFile, {
    type: 'shadow_start',
    ts: new Date().toISOString(),
    gameId,
    phase: initialGame?.phase || '',
    generation: initialGame?.generation ?? null,
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
    })),
  });

  await primeShadowSession(session);
  return session;
}

async function primeShadowSession(session) {
  if (isGameEnded(session.currentGame)) return;
  const playersToPoll = getPlayersToPoll(session, session.currentGame);
  const states = await Promise.all(playersToPoll.map((playerId) => fetchPlayerState(session.serverUrl, playerId)));
  for (let i = 0; i < playersToPoll.length; i++) {
    const playerId = playersToPoll[i];
    const playerMeta = session.players.find((player) => player.id === playerId);
    if (!playerMeta) continue;
    processObservedState(session, playerMeta, states[i], {appendResolved: false});
  }
}

function processObservedState(session, playerMeta, rawState, options = {}) {
  const appendResolved = options.appendResolved !== false;
  const status = options.status || 'resolved';
  const summary = buildStateSummary(rawState, {
    gameId: session.gameId,
    playerId: playerMeta.id,
    player: playerMeta.name,
    color: playerMeta.color,
  });
  const signature = stateSignature(summary);
  const playerState = session.playerState.get(playerMeta.id);
  if (!playerState) return false;

  const sameState = playerState.lastSignature === signature;
  if (sameState && !options.forceFlush) return false;

  let changed = false;
  if (playerState.pendingShadow && playerState.pendingSummary) {
    if (!sameState || options.forceFlush) {
      const resolved = resolvePendingEntry(
        playerState.pendingShadow,
        playerState.pendingSummary,
        summary,
        status,
      );
      if (appendResolved) appendJsonl(session.logFile, resolved);
      playerState.pendingShadow = null;
      playerState.pendingSummary = null;
      changed = true;
    }
  }

  if (!options.terminal && shouldCreatePredictionForSummary(summary)) {
    playerState.pendingShadow = buildPredictionEntry(session, playerMeta, rawState, summary);
    playerState.pendingSummary = summary;
  }

  playerState.lastSummary = summary;
  playerState.lastSignature = signature;
  return changed;
}

async function flushPendingPlayers(session, status) {
  const pendingPlayers = [...session.playerState.entries()]
    .filter(([, state]) => state.pendingShadow)
    .map(([playerId]) => playerId);

  if (pendingPlayers.length === 0) return false;

  const states = await Promise.all(pendingPlayers.map((playerId) => fetchPlayerState(session.serverUrl, playerId)));
  let changed = false;
  for (let i = 0; i < pendingPlayers.length; i++) {
    const playerId = pendingPlayers[i];
    const playerMeta = session.players.find((player) => player.id === playerId);
    if (!playerMeta) continue;
    changed = processObservedState(session, playerMeta, states[i], {
      appendResolved: true,
      forceFlush: true,
      terminal: true,
      status,
    }) || changed;
  }
  return changed;
}

async function stopShadowSession(session, status = 'stopped') {
  let changed = false;
  let flushError = null;
  try {
    changed = await flushPendingPlayers(session, status);
  } catch (err) {
    flushError = err;
    appendJsonl(session.logFile, {
      type: 'shadow_stop_flush_failed',
      ts: new Date().toISOString(),
      gameId: session.gameId,
      status,
      error: err.message,
    });
  }

  appendJsonl(session.logFile, {
    type: 'shadow_stop',
    ts: new Date().toISOString(),
    gameId: session.gameId,
    status,
  });

  return {changed, flushError, status};
}

async function pollShadowSession(session) {
  let game;
  try {
    game = await fetchJSON(`${session.serverUrl}/api/game?id=${encodeURIComponent(session.gameId)}`);
  } catch (err) {
    appendJsonl(session.logFile, {
      type: 'shadow_game_unavailable',
      ts: new Date().toISOString(),
      gameId: session.gameId,
      error: err.message,
    });
    return {active: true, changed: false, status: 'unavailable'};
  }

  session.currentGame = game;
  if (isGameEnded(game)) {
    const changed = await flushPendingPlayers(session, 'ended');
    appendJsonl(session.logFile, {
      type: 'shadow_end',
      ts: new Date().toISOString(),
      gameId: session.gameId,
      generation: game.generation ?? null,
      phase: game.phase || '',
    });
    return {
      active: false,
      changed,
      status: 'ended',
      phase: game.phase || '',
      generation: game.generation ?? null,
      activePlayer: game.activePlayer || null,
    };
  }

  const playersToPoll = getPlayersToPoll(session, game);
  const states = await Promise.all(playersToPoll.map((playerId) => fetchPlayerState(session.serverUrl, playerId)));

  let changed = false;
  for (let i = 0; i < playersToPoll.length; i++) {
    const playerId = playersToPoll[i];
    const playerMeta = session.players.find((player) => player.id === playerId);
    if (!playerMeta) continue;
    changed = processObservedState(session, playerMeta, states[i]) || changed;
  }
  if ((session.inputBurstPollsRemaining || 0) > 0) {
    session.inputBurstPollsRemaining--;
  }

  return {
    active: true,
    changed,
    status: 'ok',
    phase: game.phase || '',
    generation: game.generation ?? null,
    activePlayer: game.activePlayer || null,
  };
}

function formatPlayers(players) {
  return players.map((player) => `${player.name}(${player.color})`).join(', ');
}

async function runSingleGameCli(options) {
  const session = await startShadowSession(options);
  console.log(`Shadow Bot | Game: ${session.gameId} | ${session.players.length} player(s) | Poll: ${options.poll}s`);
  console.log(`Log: ${session.logFile}`);
  console.log(`Players: ${formatPlayers(session.players)}`);
  console.log('');

  let lastGen = session.currentGame?.generation ?? 0;
  if (lastGen) console.log(`Gen ${lastGen}`);

  while (true) {
    const result = await pollShadowSession(session);
    const gen = result.generation ?? null;
    if (gen && gen !== lastGen) {
      lastGen = gen;
      console.log(`Gen ${lastGen}`);
    }

    if (!result.active) {
      const lines = fs.existsSync(session.logFile)
        ? fs.readFileSync(session.logFile, 'utf8').trim().split('\n').filter(Boolean)
        : [];
      console.log(`\nGame over at gen ${gen ?? '?'}`);
      console.log(`Shadow log: ${lines.length} entries in ${session.logFile}`);
      return session.logFile;
    }

    await new Promise((resolve) => setTimeout(resolve, Math.max(0.1, options.poll) * 1000));
  }
}

function buildManagerLogPath(stamp = null) {
  const actualStamp = stamp || new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(MANAGER_DIR, `shadow-watch-server-${actualStamp}.jsonl`);
}

module.exports = {
  DEFAULT_SERVER_URL,
  MANAGER_DIR,
  SHADOW_DIR,
  appendJsonl,
  buildManagerLogPath,
  buildStateSummary,
  deriveObservedChanges,
  discoverPlayers,
  fetchJSON,
  getPlayersToPoll,
  hashWf,
  isGameEnded,
  multisetAdded,
  pollShadowSession,
  primeShadowSession,
  resolvePendingEntry,
  runSingleGameCli,
  shouldCreatePredictionForSummary,
  stopShadowSession,
  startShadowSession,
  stateSignature,
  summarizeAction,
  summarizeObservedAction,
};
