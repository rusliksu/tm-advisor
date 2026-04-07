#!/usr/bin/env node
/**
 * auto-join.js — Bot auto-takeover for AFK players in Terraforming Mars (herokuapp)
 *
 * Manual bot takeover for Terraforming Mars — play as a specific player.
 * No auto-detection. You explicitly tell the bot which player to control.
 *
 * The TM server has no auth — knowing a player ID is sufficient to act
 * as that player. Works remotely via the public API.
 *
 * Usage:
 *   node auto-join.js <gameId> --player <playerId>
 *   node auto-join.js <gameId> --all               (control ALL players)
 *
 * Options:
 *   --player <id>       Play as this player (required unless --all)
 *   --server <url>      TM server URL (default: https://terraforming-mars.herokuapp.com)
 *   --poll <seconds>    Poll interval in seconds (default: 10)
 *   --dry-run           Monitor only, don't make moves
 *   --all               Control ALL players (bot-vs-bot testing)
 *   --verbose           Extra logging
 */

'use strict';

const fs = require('fs');
const path = require('path');

// === ARGUMENT PARSING ===

const args = process.argv.slice(2);
const flags = {};
const positional = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--player' && args[i + 1]) { flags.player = args[++i]; }
  // --timeout removed: no AFK detection, manual control only
  else if (args[i] === '--server' && args[i + 1]) { flags.server = args[++i]; }
  else if (args[i] === '--poll' && args[i + 1]) { flags.poll = parseFloat(args[++i]); }
  else if (args[i] === '--dry-run') { flags.dryRun = true; }
  else if (args[i] === '--all') { flags.all = true; }
  else if (args[i] === '--verbose') { flags.verbose = true; }
  else if (!args[i].startsWith('--')) { positional.push(args[i]); }
}

const GAME_ID = positional[0];
if (!GAME_ID || (!flags.player && !flags.all)) {
  console.error('Usage: node auto-join.js <gameId> --player <playerId>');
  console.error('       node auto-join.js <gameId> --all');
  console.error('');
  console.error('Options:');
  console.error('  --player <id>  Play as this player (required)');
  console.error('  --all          Control all players');
  console.error('  --server <url> TM server (default: herokuapp)');
  console.error('  --poll <sec>   Poll interval (default: 10)');
  console.error('  --dry-run      Monitor only');
  process.exit(1);
}

// Manual control only — but keep AFK_TIMEOUT_MS for code compatibility
const AFK_TIMEOUT_MS = 0; // 0 = immediate takeover (manual mode)
const SERVER = (flags.server || 'https://terraforming-mars.herokuapp.com').replace(/\/$/, '');
const POLL_INTERVAL_MS = (flags.poll || 10) * 1000;
const DRY_RUN = !!flags.dryRun;
const CONTROL_ALL = !!flags.all;
const VERBOSE = !!flags.verbose;
const FORCE_PLAYER = flags.player || null;
const CHOICE_LOGGING = process.env.BOT_CHOICE_LOG === '1';
const CHOICE_LOG_DIR = path.join(__dirname, '..', 'data', 'game_logs', 'choice_logs');

// === HTTP CLIENT (works with both http and https) ===

const http = require('http');
const https = require('https');
const { URL } = require('url');

function httpModule(url) {
  return url.startsWith('https') ? https : http;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = httpModule(url);
    mod.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        return fetchJSON(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${data.slice(0, 200)}`)); }
      });
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const mod = httpModule(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      timeout: 15000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = mod.request(opts, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

// === SMART BOT ENGINE ===
// Import decision logic from smartbot.js (handleInput + supporting functions)

const BOT = require('./smartbot');

// === STATE TRACKING ===

// Per-player tracking for AFK detection
const playerState = new Map(); // playerId -> { name, color, lastActivity, waitingForHash, takenOver, moveCount }

// Game-level state
let gamePhase = '';
let gameGen = 0;
let gameEnded = false;
let totalMoves = 0;
let choiceLogWriteFailed = false;

function summarizeChoiceOptions(wf) {
  if (!wf) return [];
  if (wf.type === 'card' && Array.isArray(wf.cards)) {
    return wf.cards.map((c) => c?.name || c).filter(Boolean);
  }
  if (wf.type === 'projectCard' && Array.isArray(wf.cards)) {
    return wf.cards.map((c) => c?.name || c).filter(Boolean);
  }
  if (wf.type === 'or' && Array.isArray(wf.options)) {
    return wf.options.map((o, idx) => ({
      index: idx,
      type: o?.type || '?',
      title: getTitle(o).slice(0, 80),
      cards: Array.isArray(o?.cards) ? o.cards.map((c) => c?.name || c).filter(Boolean).slice(0, 10) : undefined,
    }));
  }
  if (wf.type === 'space' && Array.isArray(wf.spaces || wf.availableSpaces)) {
    const spaces = wf.spaces || wf.availableSpaces || [];
    return spaces.map((s) => s?.id || s).filter(Boolean).slice(0, 50);
  }
  return [];
}

function summarizeChoicePicked(input) {
  if (!input) return null;
  if (input.type === 'card') return input.cards || [];
  if (input.type === 'projectCard') return input.card || null;
  if (input.type === 'space') return input.spaceId || null;
  if (input.type === 'party') return input.partyName || null;
  if (input.type === 'player') return input.player || null;
  if (input.type === 'amount') return input.amount;
  if (input.type === 'resource') return input.resource || null;
  if (input.type === 'resources') return input.units || null;
  if (input.type === 'productionToLose') return input.units || null;
  if (input.type === 'delegate') return input.player || null;
  if (input.type === 'colony') return input.colonyName || null;
  if (input.type === 'payment') return input.payment || null;
  if (input.type === 'or') {
    return {
      index: input.index,
      responseType: input.response?.type,
      picked: summarizeChoicePicked(input.response),
    };
  }
  return input.type;
}

function appendChoiceLog(playerId, state, wf, input) {
  if (!CHOICE_LOGGING || choiceLogWriteFailed) return;
  try {
    fs.mkdirSync(CHOICE_LOG_DIR, {recursive: true});
    const file = path.join(CHOICE_LOG_DIR, `bot-choice-${GAME_ID}.jsonl`);
    const payload = {
      ts: new Date().toISOString(),
      source: 'smartbot',
      gameId: GAME_ID,
      playerId,
      playerName: state?.thisPlayer?.name || playerState.get(playerId)?.name || '?',
      color: state?.thisPlayer?.color || playerState.get(playerId)?.color || '?',
      generation: state?.game?.generation ?? null,
      phase: state?.game?.phase || '',
      waitingType: wf?.type || '',
      title: getTitle(wf),
      options: summarizeChoiceOptions(wf),
      picked: summarizeChoicePicked(input),
    };
    fs.appendFileSync(file, JSON.stringify(payload) + '\n', 'utf8');
  } catch (e) {
    if (!choiceLogWriteFailed) {
      choiceLogWriteFailed = true;
      log(`choice logging disabled: ${e.message}`);
    }
  }
}

// === LOGGING ===

function ts() {
  return new Date().toISOString().slice(11, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

function logVerbose(msg) {
  if (VERBOSE) console.log(`[${ts()}] [v] ${msg}`);
}

// === AFK DETECTION ===

/**
 * Hash the waitingFor object to detect state changes.
 * If waitingFor changes between polls, the player acted.
 * If it stays the same, the player is idle/AFK.
 */
function hashWaitingFor(wf) {
  if (!wf) return 'idle';
  // Lightweight hash: type + title + option count + card count
  const t = wf.type || '';
  const title = getTitle(wf) || '';
  const optLen = (wf.options || []).length;
  const cardLen = (wf.cards || []).length;
  return `${t}|${title.slice(0, 40)}|${optLen}|${cardLen}`;
}

function getTitle(wf) {
  if (!wf) return '';
  if (typeof wf.title === 'string') return wf.title;
  if (wf.title && wf.title.message) {
    const data = Array.isArray(wf.title.data) ? wf.title.data : [];
    return wf.title.message.replace(/\$\{(\d+)\}/g, (_, idx) => {
      const item = data[Number(idx)];
      if (item && typeof item === 'object' && 'value' in item) return String(item.value);
      if (item != null) return String(item);
      return '';
    });
  }
  if (wf.title && typeof wf.title === 'object') return JSON.stringify(wf.title);
  return wf.buttonLabel || '';
}

// === CORE LOGIC ===

/**
 * Discover all players in the game via /api/game
 */
async function discoverGame() {
  const url = `${SERVER}/api/game?id=${GAME_ID}`;
  logVerbose(`GET ${url}`);
  const game = await fetchJSON(url);

  if (!game || !game.players || game.players.length === 0) {
    throw new Error(`Game ${GAME_ID} not found or has no players`);
  }

  gamePhase = game.phase || '';
  gameGen = game.gameAge || 0;

  log(`Game: ${GAME_ID} | Phase: ${gamePhase} | Players: ${game.players.length}`);

  for (const p of game.players) {
    if (!playerState.has(p.id)) {
      playerState.set(p.id, {
        name: p.name,
        color: p.color,
        id: p.id,
        lastActivity: Date.now(),
        waitingForHash: null,
        takenOver: FORCE_PLAYER === p.id || CONTROL_ALL,
        moveCount: 0,
      });
    }
    log(`  ${p.color} "${p.name}" id=${p.id}${(FORCE_PLAYER === p.id || CONTROL_ALL) ? ' [BOT CONTROL]' : ''}`);
  }

  return game;
}

/**
 * Poll a single player, detect AFK, optionally make a move
 */
async function pollPlayer(playerId) {
  const ps = playerState.get(playerId);
  if (!ps) return;

  let state;
  try {
    state = await fetchJSON(`${SERVER}/api/player?id=${playerId}`);
  } catch (e) {
    logVerbose(`  ${ps.name}: fetch error — ${e.message}`);
    return;
  }

  const wf = state.waitingFor;
  if (!wf) {
    // Player is not waiting for input (not their turn, or between phases)
    if (ps.waitingForHash !== 'idle') {
      // State changed from waiting -> idle: player made their move
      ps.lastActivity = Date.now();
      ps.waitingForHash = 'idle';
      logVerbose(`  ${ps.name}: idle (not their turn)`);
    }
    return;
  }

  // Player has a pending action
  const hash = hashWaitingFor(wf);

  if (hash !== ps.waitingForHash) {
    // New prompt — could be: (a) player made a move and got new prompt, or (b) first detection
    if (ps.waitingForHash && ps.waitingForHash !== 'idle') {
      // Was waiting for something else before — player acted
      ps.lastActivity = Date.now();
      logVerbose(`  ${ps.name}: acted (prompt changed)`);
    } else {
      // First time seeing this prompt — start the AFK timer
      logVerbose(`  ${ps.name}: waiting — "${getTitle(wf).slice(0, 50)}"`);
    }
    ps.waitingForHash = hash;
  }

  // Check if player should be taken over
  const afkMs = Date.now() - ps.lastActivity;

  if (!ps.takenOver && (FORCE_PLAYER || CONTROL_ALL || afkMs >= AFK_TIMEOUT_MS)) {
    // Manual takeover or AFK detected
    const afkMin = (afkMs / 60000).toFixed(1);
    log(`!! AFK DETECTED: ${ps.name} (${ps.color}) — ${afkMin} min idle`);
    log(`   Prompt: "${getTitle(wf).slice(0, 60)}"`);

    if (DRY_RUN) {
      log(`   [DRY RUN] Would take over. Skipping.`);
      return;
    }

    ps.takenOver = true;
    log(`   >>> BOT TAKEOVER: ${ps.name} <<<`);
  }

  // If we control this player, make a move
  if (ps.takenOver && !DRY_RUN) {
    await makeMove(playerId, state, wf);
  }
}

/**
 * Make a move for a player using smartbot's handleInput logic
 */
async function makeMove(playerId, state, wf) {
  const ps = playerState.get(playerId);
  if (!ps) return;

  const title = getTitle(wf).slice(0, 50);

  let input;
  try {
    // handleInput expects state with cardsInHand at top level
    // The /api/player response has thisPlayer.cardsInHand but handleInput reads state.cardsInHand
    if (!state.cardsInHand && state.thisPlayer) {
      state.cardsInHand = state.thisPlayer.cardsInHand || [];
    }
    state._botName = ps.name;
    state._blacklist = BOT.getBlacklist(playerId);
    state._spaceBlacklist = BOT.getSpaceBlacklist ? BOT.getSpaceBlacklist(playerId) : new Set();

    input = BOT.handleInput(wf, state);
    appendChoiceLog(playerId, state, wf, input);
  } catch (e) {
    log(`  ${ps.name}: handleInput ERROR — ${e.message}`);
    // Fallback: try to pass/skip
    input = { type: 'option' };
    appendChoiceLog(playerId, state, wf, input);
  }

  logVerbose(`  ${ps.name}: input=${JSON.stringify(input).slice(0, 200)}`);

  try {
    const resp = await postJSON(`${SERVER}/player/input?id=${playerId}`, input);

    if (resp.status === 200) {
      ps.moveCount++;
      totalMoves++;
      ps.lastActivity = Date.now();
      ps.waitingForHash = null; // reset — will be re-detected next poll
      log(`  ${ps.name}: ${wf.type} "${title}" -> OK (move #${ps.moveCount})`);
    } else {
      const err = resp.body.slice(0, 150);
      log(`  ${ps.name}: ERR ${resp.status} — ${err}`);

      // Retry with blacklist (same logic as smartbot.js)
      if (wf.type === 'or') {
        if (input.response && input.response.card) {
          BOT.getBlacklist(playerId).add(input.response.card);
        }
        state._blacklist = BOT.getBlacklist(playerId);
        state._skipActions = state._skipActions || new Set();
        if (typeof input.index === 'number') state._skipActions.add(input.index);

        for (let retry = 0; retry < 3; retry++) {
          const input2 = BOT.handleInput(wf, state);
          const r2 = await postJSON(`${SERVER}/player/input?id=${playerId}`, input2);
          if (r2.status === 200) {
            ps.moveCount++;
            totalMoves++;
            ps.lastActivity = Date.now();
            ps.waitingForHash = null;
            log(`  ${ps.name}: retry #${retry + 1} -> OK`);
            return;
          }
          if (input2.response && input2.response.card) {
            BOT.getBlacklist(playerId).add(input2.response.card);
          }
          if (typeof input2.index === 'number') state._skipActions.add(input2.index);
          state._blacklist = BOT.getBlacklist(playerId);
        }

        // All retries failed — try to pass
        const opts = wf.options || [];
        for (let i = opts.length - 1; i >= 0; i--) {
          const t = getTitle(opts[i]).toLowerCase();
          if (t.includes('pass') || t.includes('end turn') || t.includes('do nothing') || t.includes('skip')) {
            const fb = { type: 'or', index: i, response: BOT.handleInput(opts[i], state, 1) };
            const r3 = await postJSON(`${SERVER}/player/input?id=${playerId}`, fb);
            if (r3.status === 200) {
              ps.moveCount++;
              totalMoves++;
              ps.lastActivity = Date.now();
              ps.waitingForHash = null;
              log(`  ${ps.name}: pass (fallback)`);
              return;
            }
          }
        }
        log(`  ${ps.name}: ALL RETRIES FAILED`);
      } else if (wf.type === 'card') {
        // Try empty card selection as fallback
        const fb = { type: 'card', cards: [] };
        const r2 = await postJSON(`${SERVER}/player/input?id=${playerId}`, fb);
        if (r2.status === 200) {
          ps.moveCount++;
          totalMoves++;
          ps.lastActivity = Date.now();
          ps.waitingForHash = null;
          log(`  ${ps.name}: card [] (fallback)`);
        }
      } else if (wf.type === 'space') {
        if (input.spaceId && BOT.getSpaceBlacklist) {
          BOT.getSpaceBlacklist(playerId).add(input.spaceId);
        }
        state._spaceBlacklist = BOT.getSpaceBlacklist ? BOT.getSpaceBlacklist(playerId) : new Set();

        for (let retry = 0; retry < 5; retry++) {
          const input2 = BOT.handleInput(wf, state);
          const r2 = await postJSON(`${SERVER}/player/input?id=${playerId}`, input2);
          if (r2.status === 200) {
            ps.moveCount++;
            totalMoves++;
            ps.lastActivity = Date.now();
            ps.waitingForHash = null;
            log(`  ${ps.name}: space retry #${retry + 1} -> OK`);
            return;
          }
          if (input2.spaceId && BOT.getSpaceBlacklist) {
            BOT.getSpaceBlacklist(playerId).add(input2.spaceId);
          }
          state._spaceBlacklist = BOT.getSpaceBlacklist ? BOT.getSpaceBlacklist(playerId) : new Set();
        }

        log(`  ${ps.name}: SPACE RETRIES FAILED`);
      }
    }
  } catch (e) {
    log(`  ${ps.name}: POST error — ${e.message}`);
  }
}

/**
 * Check if the game has ended
 */
async function checkGameEnd() {
  try {
    const game = await fetchJSON(`${SERVER}/api/game?id=${GAME_ID}`);
    gamePhase = game.phase || '';

    if (game.phase === 'end') {
      return true;
    }

    // Also check via player API (has isTerraformed flag)
    const firstPlayer = [...playerState.values()][0];
    if (firstPlayer) {
      const state = await fetchJSON(`${SERVER}/api/player?id=${firstPlayer.id}`);
      if (state && state.game && state.game.isTerraformed) {
        return true;
      }
      // Update gen
      gameGen = (state.game && state.game.generation) || gameGen;
    }
  } catch (e) {
    logVerbose(`checkGameEnd error: ${e.message}`);
  }
  return false;
}

/**
 * Print final scores
 */
async function printScores() {
  log('');
  log('========== GAME OVER ==========');
  log(`Final generation: ${gameGen || '?'}`);

  for (const [pid, ps] of playerState) {
    try {
      const state = await fetchJSON(`${SERVER}/api/player?id=${pid}`);
      const tp = state.thisPlayer || {};
      const vp = tp.victoryPointsBreakdown || {};
      const corp = (tp.tableau || [])[0] && (tp.tableau[0].name || '?');
      log(`  ${ps.name} (${corp}): ${vp.total || '?'} VP | TR=${vp.terraformRating || '?'}`);
      if (ps.takenOver) {
        log(`    Bot moves: ${ps.moveCount}`);
      }
    } catch (e) {
      log(`  ${ps.name}: score fetch error — ${e.message}`);
    }
  }

  log(`Total bot moves: ${totalMoves}`);
}

/**
 * Print status summary
 */
function printStatus() {
  const now = Date.now();
  const lines = [];
  for (const [pid, ps] of playerState) {
    const afk = ((now - ps.lastActivity) / 1000).toFixed(0);
    const status = ps.takenOver ? 'BOT' : (ps.waitingForHash === 'idle' ? 'idle' : `wait ${afk}s`);
    lines.push(`${ps.name}[${status}${ps.takenOver ? ':' + ps.moveCount : ''}]`);
  }
  log(`Gen ${gameGen} | ${gamePhase} | ${lines.join(' | ')}`);
}

// === MAIN LOOP ===

async function main() {
  log(`auto-join v1.0 | Game: ${GAME_ID}`);
  log(`Server: ${SERVER}`);
  log(`AFK timeout: ${AFK_TIMEOUT_MS / 60000} min | Poll: ${POLL_INTERVAL_MS / 1000}s`);
  if (DRY_RUN) log('MODE: DRY RUN (monitoring only)');
  if (CONTROL_ALL) log('MODE: ALL PLAYERS (bot-vs-bot)');
  if (FORCE_PLAYER) log(`MODE: FORCE TAKEOVER player ${FORCE_PLAYER}`);
  log('');

  // Discover game and players
  try {
    await discoverGame();
  } catch (e) {
    console.error(`Failed to connect to game: ${e.message}`);
    console.error(`Tried: ${SERVER}/api/game?id=${GAME_ID}`);
    process.exit(1);
  }

  log('');
  log('Monitoring started. Ctrl+C to stop.');
  log('');

  let statusCounter = 0;

  // Poll loop
  while (!gameEnded) {
    // Check game end
    const ended = await checkGameEnd();
    if (ended) {
      gameEnded = true;
      await printScores();
      break;
    }

    // Poll all players
    const playerIds = [...playerState.keys()];
    for (const pid of playerIds) {
      await pollPlayer(pid);
    }

    // Status print every ~60s
    statusCounter++;
    if (statusCounter % Math.max(1, Math.round(60000 / POLL_INTERVAL_MS)) === 0) {
      printStatus();
    }

    // Wait before next poll
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  log('');
  log('auto-join exiting.');
}

// === GRACEFUL SHUTDOWN ===

process.on('SIGINT', () => {
  log('');
  log('Interrupted. Releasing control.');
  printStatus();
  process.exit(0);
});

process.on('uncaughtException', (e) => {
  console.error(`[${ts()}] Uncaught: ${e.message}`);
  console.error(e.stack);
});

// === RUN ===

main().catch(e => {
  console.error(`Fatal: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
