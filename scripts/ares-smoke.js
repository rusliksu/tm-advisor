#!/usr/bin/env node
/**
 * ares-smoke.js — create N full-format games and run auto-join bot-vs-bot smoke checks.
 *
 * Usage:
 *   node scripts/ares-smoke.js
 *   node scripts/ares-smoke.js 3
 *   node scripts/ares-smoke.js 2 --server https://tm.knightbyte.win
 */

'use strict';

const path = require('path');
const fs = require('fs');
const {spawn} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const AUTO_JOIN = path.join(ROOT, 'bot', 'auto-join.js');
const LOG_DIR = path.join(ROOT, 'data', 'transcripts', 'ares-smoke');

const args = process.argv.slice(2);
let gamesToRun = 2;
let server = 'https://tm.knightbyte.win';
let saveLogs = process.env.SMOKE_SAVE_LOGS === '1' || process.env.SMARTBOT_DEBUG_ACTIONS === '1' || process.env.SMARTBOT_DEBUG_SPACE === '1';
let saveChoices = process.env.BOT_CHOICE_LOG === '1';
let timeoutMinutes = parseInt(process.env.SMOKE_TIMEOUT_MINUTES || '15', 10);

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (/^\d+$/.test(a)) {
    gamesToRun = parseInt(a, 10);
    continue;
  }
  if (a === '--server' && args[i + 1]) {
    server = args[++i].replace(/\/$/, '');
    continue;
  }
  if (a === '--save-logs') {
    saveLogs = true;
    continue;
  }
  if (a === '--save-choices') {
    saveChoices = true;
    continue;
  }
  if (a === '--timeout-minutes' && args[i + 1]) {
    timeoutMinutes = parseInt(args[++i], 10);
    continue;
  }
  throw new Error(`Unknown argument: ${a}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makePayload(index) {
  const suffix = `${Date.now().toString(36)}-${index}`;
  return {
    players: [
      {name: `SmokeA-${suffix}`, color: 'blue', beginner: false, handicap: 0, first: true},
      {name: `SmokeB-${suffix}`, color: 'red', beginner: false, handicap: 0, first: false},
      {name: `SmokeC-${suffix}`, color: 'green', beginner: false, handicap: 0, first: false},
    ],
    expansions: {
      corpera: true,
      promo: true,
      venus: true,
      colonies: true,
      prelude: true,
      prelude2: true,
      turmoil: true,
      community: true,
      ares: true,
      moon: true,
      pathfinders: true,
      ceo: true,
      starwars: false,
      underworld: true,
    },
    board: 'random all',
    seed: 0,
    randomFirstPlayer: false,
    undoOption: false,
    showTimers: true,
    fastModeOption: false,
    showOtherPlayersVP: false,
    aresExtremeVariant: false,
    politicalAgendasExtension: 'Standard',
    solarPhaseOption: true,
    removeNegativeGlobalEventsOption: false,
    modularMA: false,
    draftVariant: true,
    initialDraft: true,
    preludeDraftVariant: true,
    ceosDraftVariant: true,
    startingCorporations: 4,
    shuffleMapOption: true,
    randomMA: 'Full random',
    includeFanMA: false,
    soloTR: false,
    customCorporationsList: [],
    bannedCards: [],
    includedCards: [],
    customColoniesList: [],
    customPreludes: [],
    requiresMoonTrackCompletion: false,
    requiresVenusTrackCompletion: false,
    moonStandardProjectVariant: false,
    moonStandardProjectVariant1: false,
    altVenusBoard: false,
    twoCorpsVariant: true,
    customCeos: [],
    startingCeos: 3,
    startingPreludes: 4,
  };
}

async function createGame(index) {
  const resp = await fetch(`${server}/api/creategame`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(makePayload(index)),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`/api/creategame ${resp.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

function runAutoJoin(gameId) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      AUTO_JOIN,
      gameId,
      '--all',
      '--server', server,
      '--poll', '0.2',
    ], {
      cwd: ROOT,
      env: {
        ...process.env,
        BOT_CHOICE_LOG: saveChoices ? '1' : (process.env.BOT_CHOICE_LOG || ''),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) return;
      child.kill();
      resolve({ok: false, reason: 'timeout', out, err});
    }, timeoutMinutes * 60 * 1000);

    child.stdout.on('data', (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      err += chunk.toString();
    });
    child.on('close', (code) => {
      finished = true;
      clearTimeout(timeout);
      const combined = `${out}\n${err}`;
      const ok = code === 0 && combined.includes('========== GAME OVER ==========');
      let reason = ok ? 'ok' : `exit=${code}`;
      if (!ok && /ALL RETRIES FAILED|ERR \d+|STUCK|handleInput ERROR/i.test(combined)) {
        reason = 'bot_error';
      }
      resolve({ok, reason, out, err});
    });
  });
}

function parseGameSummary(output) {
  const summary = {
    generation: null,
    totalMoves: null,
    scores: [],
  };

  const genMatch = output.match(/Final generation: (\d+|\?)/);
  if (genMatch && genMatch[1] !== '?') {
    summary.generation = parseInt(genMatch[1], 10);
  }

  const movesMatch = output.match(/Total bot moves: (\d+)/);
  if (movesMatch) {
    summary.totalMoves = parseInt(movesMatch[1], 10);
  }

  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\[[^\]]+\]\s+([^(]+)\s+\(([^)]+)\):\s+(\d+|\?) VP \| TR=(\d+|\?)/);
    if (!m) continue;
    summary.scores.push({
      player: m[1].trim(),
      corp: m[2].trim(),
      vp: m[3] === '?' ? null : parseInt(m[3], 10),
      tr: m[4] === '?' ? null : parseInt(m[4], 10),
    });
  }

  return summary;
}

function persistLog(gameId, result) {
  if (!saveLogs) return;
  fs.mkdirSync(LOG_DIR, {recursive: true});
  const stamp = new Date().toISOString().replace(/[:]/g, '-');
  const file = path.join(LOG_DIR, `ares-smoke-${gameId}-${stamp}.log`);
  const body = [
    `gameId=${gameId}`,
    `ok=${result.ok}`,
    `reason=${result.reason}`,
    '',
    '--- STDOUT ---',
    result.out || '',
    '',
    '--- STDERR ---',
    result.err || '',
    '',
  ].join('\n');
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

async function main() {
  console.log(`Ares smoke: ${gamesToRun} game(s) | server=${server}`);
  const results = [];

  for (let i = 1; i <= gamesToRun; i++) {
    console.log(`\n=== Smoke ${i}/${gamesToRun} ===`);
    const game = await createGame(i);
    console.log(`gameId=${game.id}`);
    const result = await runAutoJoin(game.id);
    const logFile = persistLog(game.id, result);
    const summary = parseGameSummary(result.out || '');
    results.push({gameId: game.id, ...result, summary});
    if (result.ok) {
      const bits = [];
      if (summary.generation != null) bits.push(`gen=${summary.generation}`);
      if (summary.totalMoves != null) bits.push(`moves=${summary.totalMoves}`);
      if (summary.scores.length) {
        bits.push(`vp=${summary.scores.map((s) => `${s.player}:${s.vp ?? '?'}`).join(',')}`);
      }
      console.log(`OK${bits.length ? ` | ${bits.join(' | ')}` : ''}`);
      if (logFile) console.log(`log=${logFile}`);
    } else {
      console.log(`FAIL | ${result.reason}`);
      if (logFile) console.log(`log=${logFile}`);
      const tail = `${result.out}\n${result.err}`.trim().split(/\r?\n/).slice(-20).join('\n');
      console.log(tail);
      break;
    }
    await sleep(1000);
  }

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\nDone: ${okCount}/${results.length} passed`);
  if (okCount !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
