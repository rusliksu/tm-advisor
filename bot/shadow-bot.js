#!/usr/bin/env node
/**
 * shadow-bot.js — Read-only observer that computes what smartbot WOULD do
 * for each player decision, without making any moves.
 *
 * Usage:
 *   node bot/shadow-bot.js <gameId> [--server URL] [--poll SEC] [--player ID]
 *
 * Outputs JSONL log: data/shadow/shadow-<gameId>.jsonl
 * Each entry: {ts, gen, player, color, title, botAction, botReasoning}
 *
 * When the real player makes their move, the next entry captures the delta.
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const BOT = require('./smartbot');

// === Args ===
const args = process.argv.slice(2);
let GAME_ID = args.find(a => !a.startsWith('--'));
let SERVER = 'http://127.0.0.1:8081';
let POLL = 2;
let PLAYER_FILTER = null; // null = all players
let PLAYER_IDS = []; // explicit player IDs (for observing all players)

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--server' && args[i+1]) SERVER = args[++i];
  if (args[i] === '--poll' && args[i+1]) POLL = parseFloat(args[++i]);
  if (args[i] === '--player' && args[i+1]) PLAYER_FILTER = args[++i];
  if (args[i] === '--players' && args[i+1]) PLAYER_IDS = args[++i].split(',');
}

if (!GAME_ID && PLAYER_IDS.length === 0) {
  console.log('Usage: node bot/shadow-bot.js <gameId|playerId> [--server URL] [--poll SEC]');
  console.log('       node bot/shadow-bot.js --players id1,id2,id3 [--server URL]');
  process.exit(1);
}
if (!GAME_ID && PLAYER_IDS.length > 0) GAME_ID = 'multi';

// === HTTP ===
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    mod.get({ hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

// === Log ===
const LOG_DIR = path.resolve(__dirname, '..', 'data', 'shadow');
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, `shadow-${GAME_ID}.jsonl`);

function appendLog(entry) {
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
}

// === State tracking ===
const playerState = new Map(); // playerId → {lastHash, lastWf, pendingShadow}

function hashWf(wf) {
  if (!wf) return 'idle';
  const title = typeof wf.title === 'string' ? wf.title : (wf.type || '');
  const cards = (wf.cards || []).map(c => c.name || c).join(',');
  const opts = (wf.options || []).length;
  return `${wf.type}|${title.slice(0, 40)}|${cards.slice(0, 60)}|${opts}`;
}

function getTitle(wf) {
  if (!wf) return '';
  if (typeof wf.title === 'string') return wf.title;
  if (wf.title && typeof wf.title === 'object') return wf.title.toString?.() || wf.type || '';
  return wf.type || '';
}

function normalizeState(state) {
  if (state?.thisPlayer?.megaCredits != null && state?.thisPlayer?.megacredits == null) {
    state.thisPlayer.megacredits = state.thisPlayer.megaCredits;
  }
  for (const p of (state?.players || [])) {
    if (p.megaCredits != null && p.megacredits == null) p.megacredits = p.megaCredits;
  }
  if (!state.cardsInHand && state.thisPlayer) {
    state.cardsInHand = state.thisPlayer.cardsInHand || [];
  }
  return state;
}

function summarizeAction(input) {
  if (!input) return '?';
  if (input.type === 'or') {
    const inner = input.response;
    if (inner?.type === 'projectCard') return `play ${inner.card}`;
    return `option[${input.index}]`;
  }
  if (input.type === 'card') return `cards: ${(input.cards || []).join(', ')}`;
  if (input.type === 'projectCard') return `play ${input.card}`;
  if (input.type === 'payment') return 'payment';
  if (input.type === 'space') return `space ${input.spaceId}`;
  return input.type;
}

// === Main loop ===
async function run() {
  // Discover players
  let players;
  let actualGameId = GAME_ID;

  if (PLAYER_IDS.length > 0) {
    // Explicit player IDs — discover names via API
    players = [];
    for (const pid of PLAYER_IDS) {
      try {
        const state = await fetchJSON(`${SERVER}/api/player?id=${pid}`);
        actualGameId = state.game?.gameId || actualGameId;
        players.push({ id: pid, name: state.thisPlayer?.name || pid, color: state.thisPlayer?.color || '?' });
      } catch(e) {
        console.warn(`Cannot fetch player ${pid}: ${e.message}`);
        players.push({ id: pid, name: pid, color: '?' });
      }
    }
    console.log(`Observing ${players.length} players via explicit IDs`);
  } else {
    // Try /api/game first, fallback to treating GAME_ID as player ID
    try {
      const state = await fetchJSON(`${SERVER}/api/game?id=${GAME_ID}`);
      players = state.players || [];
    } catch(e) {
      try {
        const state = await fetchJSON(`${SERVER}/api/player?id=${GAME_ID}`);
        if (state.thisPlayer && state.players) {
          actualGameId = state.game?.gameId || GAME_ID;
          players = [{ id: GAME_ID, name: state.thisPlayer.name, color: state.thisPlayer.color }];
          console.log(`Discovered game ${actualGameId} via player ID`);
        } else {
          console.error(`Cannot discover game from ${GAME_ID}`);
          process.exit(1);
        }
      } catch(e2) {
        console.error(`Cannot fetch game or player ${GAME_ID}: ${e2.message}`);
        process.exit(1);
      }
    }
  }
  GAME_ID = actualGameId;

  if (PLAYER_FILTER) {
    players = players.filter(p => p.id === PLAYER_FILTER || p.color === PLAYER_FILTER || p.name === PLAYER_FILTER);
  }

  console.log(`Shadow Bot | Game: ${GAME_ID} | ${players.length} player(s) | Poll: ${POLL}s`);
  console.log(`Log: ${LOG_FILE}`);
  console.log(`Players: ${players.map(p => `${p.name}(${p.color})`).join(', ')}`);
  console.log('');

  for (const p of players) {
    playerState.set(p.id, { lastHash: null, lastWf: null, pendingShadow: null });
  }

  let lastGen = 0;

  while (true) {
    for (const p of players) {
      let state;
      try {
        state = await fetchJSON(`${SERVER}/api/player?id=${p.id}`);
      } catch(e) {
        continue;
      }

      // Game over?
      if (state.game?.phase === 'end' || state.game?.phase === 'the_end') {
        console.log(`\nGame over at gen ${state.game.generation}`);
        // Final summary
        const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n');
        const total = lines.length;
        console.log(`Shadow log: ${total} entries in ${LOG_FILE}`);
        process.exit(0);
      }

      // Gen marker
      if (state.game?.generation && state.game.generation !== lastGen) {
        lastGen = state.game.generation;
        console.log(`Gen ${lastGen}`);
      }

      const wf = state.waitingFor;
      const hash = hashWf(wf);
      const ps = playerState.get(p.id);

      if (hash === ps.lastHash) continue; // no change

      // Player's prompt changed — means they acted on previous prompt
      if (ps.pendingShadow) {
        // We had a shadow prediction — player made their move, record delta
        // We don't know exactly what player did, but we know the shadow prediction
        const shadow = ps.pendingShadow;
        shadow.playerActed = true;
        // The new state reveals what happened (infer from state changes)
        appendLog(shadow);
        ps.pendingShadow = null;
      }

      if (!wf) {
        ps.lastHash = 'idle';
        continue;
      }

      // New prompt — compute shadow bot decision
      normalizeState(state);
      let botInput, reasoning;
      try {
        botInput = BOT.handleInput(wf, state);
        reasoning = BOT.flushReasoning ? BOT.flushReasoning() : null;
      } catch(e) {
        botInput = { type: 'error', message: e.message };
        reasoning = null;
      }

      const title = getTitle(wf);
      const entry = {
        ts: new Date().toISOString(),
        gameId: GAME_ID,
        gen: state.game?.generation ?? null,
        player: p.name || p.color,
        color: p.color,
        phase: state.game?.phase || '',
        promptType: wf.type,
        title: title.slice(0, 80),
        mc: state.thisPlayer?.megacredits ?? state.thisPlayer?.megaCredits ?? null,
        botAction: summarizeAction(botInput),
        botReasoning: reasoning,
        playerActed: false,
      };

      ps.pendingShadow = entry;
      ps.lastHash = hash;
      ps.lastWf = wf;

      // Console output
      const short = entry.botAction.slice(0, 50);
      const reasonShort = (reasoning || []).find(r => r.includes('DECISION')) || '';
      console.log(`  ${p.name}: "${title.slice(0, 40)}" → 🤖 ${short}${reasonShort ? ' | ' + reasonShort.slice(0, 60) : ''}`);
    }

    await new Promise(r => setTimeout(r, POLL * 1000));
  }
}

run().catch(e => console.error('Fatal:', e));
