#!/usr/bin/env node
/**
 * batch-test.js — Run N bot-vs-bot games and collect stats.
 * Usage: node bot/batch-test.js [--games N] [--server URL]
 */
'use strict';

const http = require('http');
const path = require('path');

const args = process.argv.slice(2);
let NUM_GAMES = 5;
let SERVER = 'http://127.0.0.1:8081';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--games' && args[i+1]) NUM_GAMES = parseInt(args[++i]);
  if (args[i] === '--server' && args[i+1]) SERVER = args[++i];
}

function httpJSON(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { reject(new Error(d.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createGame(seed) {
  return httpJSON('POST', `${SERVER}/api/creategame`, {
    players: [
      {name:'A', color:'red', beginner:false, handicap:0, first:true, index:1},
      {name:'B', color:'blue', beginner:false, handicap:0, first:false, index:2},
      {name:'C', color:'green', beginner:false, handicap:0, first:false, index:3},
    ],
    expansions: {corpera:true, promo:true, venus:true, colonies:true, prelude:true, prelude2:true, turmoil:true, community:false, ares:false, moon:false, pathfinders:true, ceo:false, starwars:false, underworld:true},
    draftVariant:true, initialDraft:false, board:'tharsis', seed,
    undoOption:false, showTimers:false, startingCorporations:2, soloTR:false,
    showOtherPlayersVP:false, randomFirstPlayer:false,
    customCorporationsList:[], customColoniesList:[], customPreludes:[], customCeos:[],
    bannedCards:[], includedCards:[], solarPhaseOption:false,
    shuffleMapOption:false, randomMA:'No randomization', includeFanMA:false,
    fastModeOption:false, removeNegativeGlobalEventsOption:false,
    requiresVenusTrackCompletion:false, requiresMoonTrackCompletion:false,
    altVenusBoard:false, escapeVelocityMode:false, twoCorpsVariant:false,
    politicalAgendasExtension:'Standard',
  });
}

async function runGame(gameId, players) {
  const BOT = require('./smartbot');
  const maxMoves = 3000;
  let moves = 0;
  let stuck = 0;
  let lastGen = 0;
  let genStuckCount = 0;
  let lastGenChange = 0;

  while (moves < maxMoves) {
    let anyAction = false;
    for (const p of players) {
      let state;
      try { state = await httpJSON('GET', `${SERVER}/api/player?id=${p.id}`); } catch(e) { continue; }

      if (state.game?.phase === 'end' || state.game?.phase === 'awards' || state.game?.phase === 'the_end') {
        return { gen: state.game.generation, phase: state.game.phase, players: state.players || players };
      }

      const wf = state.waitingFor;
      if (!wf) {
        // Check if game over via generation count
        if (state.game?.generation >= 25) return { gen: state.game.generation, phase: 'timeout', players: state.players || players };
        continue;
      }

      // Normalize MC
      if (state.thisPlayer?.megaCredits != null && state.thisPlayer?.megacredits == null) {
        state.thisPlayer.megacredits = state.thisPlayer.megaCredits;
      }
      for (const pl of (state.players || [])) {
        if (pl.megaCredits != null && pl.megacredits == null) pl.megacredits = pl.megaCredits;
      }

      let input;
      try { input = BOT.handleInput(wf, state); } catch(e) { input = { type: 'option' }; }

      try {
        await httpJSON('POST', `${SERVER}/player/input?id=${p.id}`, input);
        anyAction = true;
        moves++;
        stuck = 0;
        if (state.game?.generation && state.game.generation !== lastGen) {
          lastGen = state.game.generation;
          lastGenChange = moves;
          process.stdout.write(`g${lastGen} `);
        }
        // If stuck in same gen for 500+ moves, bail
        if (moves - lastGenChange > 500) {
          return { gen: lastGen || '?', phase: 'GEN_STUCK', players: state.players || players };
        }
      } catch(e) {
        stuck++;
        if (stuck > 50) return { gen: state.game?.generation || '?', phase: 'STUCK', error: e.message?.slice(0, 80) };
      }
    }
    if (!anyAction) {
      // Check if game ended
      try {
        const st = await httpJSON('GET', `${SERVER}/api/player?id=${players[0].id}`);
        if (st.game?.phase === 'end' || st.game?.phase === 'awards') {
          return { gen: st.game.generation, phase: st.game.phase, players: st.players || players };
        }
      } catch(e) {}
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return { gen: '?', phase: 'MAX_MOVES' };
}

async function main() {
  // Suppress smartbot console.log during batch
  const _origLog = console.log;
  const _suppressed = new Set(['    →', '    [DBG]', 'ML:', '    VP plan:']);
  console.log = (...args) => {
    const s = args[0]?.toString() || '';
    if (_suppressed.has(s.slice(0, s.indexOf(' ', 5) + 1).trimEnd()) || s.startsWith('    →') || s.startsWith('    [DBG]') || s.startsWith('    VP plan:') || s.startsWith('ML:')) return;
    _origLog(...args);
  };
  _origLog(`Batch test: ${NUM_GAMES} games on ${SERVER}\n`);
  const results = [];

  for (let i = 0; i < NUM_GAMES; i++) {
    const seed = 1000 + i * 137;
    let game;
    try { game = await createGame(seed); } catch(e) { console.log(`Game ${i+1}: CREATE FAILED — ${e.message}`); continue; }

    const t0 = Date.now();
    const result = await runGame(game.id, game.players);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);

    const vpList = (result.players || []).map(p => {
      const vp = p.victoryPointsBreakdown?.total ?? p.victoryPoints ?? '?';
      return `${p.name || p.color}=${vp}`;
    }).join(', ');

    console.log(`Game ${i+1}/${NUM_GAMES}: Gen ${result.gen} | ${result.phase} | ${elapsed}s | ${vpList}`);
    results.push({ seed, gen: result.gen, phase: result.phase, elapsed: +elapsed, vp: vpList, error: result.error });
  }

  console.log('\n━━━ SUMMARY ━━━');
  const gens = results.filter(r => typeof r.gen === 'number').map(r => r.gen);
  const completed = results.filter(r => r.phase === 'end' || r.phase === 'awards').length;
  const stuck = results.filter(r => r.phase === 'STUCK').length;
  if (gens.length > 0) {
    console.log(`Avg Gen: ${(gens.reduce((a,b) => a+b, 0) / gens.length).toFixed(1)}`);
    console.log(`Min/Max Gen: ${Math.min(...gens)}/${Math.max(...gens)}`);
  }
  console.log(`Completed: ${completed}/${NUM_GAMES} | Stuck: ${stuck}`);
  const times = results.map(r => r.elapsed).filter(t => t > 0);
  if (times.length > 0) console.log(`Avg time: ${(times.reduce((a,b) => a+b, 0) / times.length).toFixed(0)}s`);
}

main().catch(e => console.error('Fatal:', e));
