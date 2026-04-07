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

let _origLog = console.log; // will be overridden in main()

async function runGame(gameId, players) {
  const BOT = require('./smartbot');
  const maxMoves = 5000;
  let moves = 0;
  let stuck = 0;
  let lastGen = 0;
  let genStuckCount = 0;
  let lastGenChange = 0;
  let gameLog = [];

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

      // Track last N actions for stuck diagnostics
      if (!gameLog) gameLog = [];
      const _title = typeof wf?.title === 'string' ? wf.title : (wf?.title?.toString?.() || wf?.type || '');
      gameLog.push({ move: moves, player: p.name || p.color, gen: state.game?.generation, wfType: wf?.type, title: _title.slice(0, 50), inputType: input?.type, inputIdx: input?.index });
      if (gameLog.length > 20) gameLog.shift();

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
        // If stuck in same gen for 500+ moves, log what's happening and bail
        if (moves - lastGenChange > 500) {
          const title = wf?.title || wf?.type || '?';
          _origLog(`\n  STUCK at gen ${lastGen}, move ${moves}: player=${p.name||p.color} wf.type=${wf?.type} title="${title.slice(0,60)}" input.type=${input?.type}`);
          return { gen: lastGen || '?', phase: 'GEN_STUCK', players: state.players || players };
        }
        // Log repeated actions within same gen
        if (moves - lastGenChange === 100) {
          const title = wf?.title || wf?.type || '?';
          const opts = wf?.options?.map((o, i) => `[${i}]${typeof o?.title === 'string' ? o.title.slice(0,30) : o?.type || '?'}`).join(', ') || '';
          _origLog(`\n  ⚠ 100 moves in gen ${lastGen}: ${p.name||p.color} wf=${wf?.type} title="${title}"`);
          _origLog(`    options: ${opts}`);
          _origLog(`    picked: type=${input?.type} idx=${input?.index}`);
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
  // Diagnostics: what was bot doing?
  _origLog(`\n  MAX_MOVES (${maxMoves}) at gen ${lastGen}. Last 10 actions:`);
  for (const entry of gameLog.slice(-10)) {
    _origLog(`    move${entry.move} ${entry.player} g${entry.gen} ${entry.wfType}:"${entry.title}" → ${entry.inputType}${entry.inputIdx != null ? '['+entry.inputIdx+']' : ''}`);
  }
  try {
    const st = await httpJSON('GET', `${SERVER}/api/player?id=${players[0].id}`);
    const g = st.game || {};
    _origLog(`  Board: temp=${g.temperature} oxy=${g.oxygenLevel} oceans=${g.oceans} venus=${g.venusScaleLevel} phase=${g.phase}`);
    return { gen: g.generation || '?', phase: 'MAX_MOVES', players: st.players || players };
  } catch(e) {}
  return { gen: lastGen || '?', phase: 'MAX_MOVES' };
}

async function main() {
  // Suppress smartbot console.log during batch
  _origLog = console.log;
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

    const playerResults = (result.players || []).map(p => {
      const bd = p.victoryPointsBreakdown || {};
      return {
        name: p.name || p.color,
        vp: bd.total ?? p.victoryPoints ?? 0,
        tr: bd.terraformRating ?? p.terraformRating ?? 0,
        greenery: bd.greenery ?? 0,
        city: bd.city ?? 0,
        cards: bd.victoryPoints ?? 0,
        milestones: bd.milestones ?? 0,
        awards: bd.awards ?? 0,
      };
    });
    const vpList = playerResults.map(p => `${p.name}=${p.vp}`).join(', ');
    const winner = playerResults.reduce((a, b) => a.vp > b.vp ? a : b, { vp: 0 });

    _origLog(`Game ${i+1}/${NUM_GAMES}: Gen ${result.gen} | ${result.phase} | ${elapsed}s | ${vpList}`);
    if (winner.vp > 0) {
      _origLog(`  Winner ${winner.name}: TR=${winner.tr} green=${winner.greenery} city=${winner.city} cards=${winner.cards} MS=${winner.milestones} AW=${winner.awards}`);
    }
    results.push({ seed, gen: result.gen, phase: result.phase, elapsed: +elapsed, players: playerResults, error: result.error });
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
  // VP analysis
  const allVPs = results.filter(r => r.players).flatMap(r => r.players.map(p => p.vp)).filter(v => v > 0);
  const winnerVPs = results.filter(r => r.players).map(r => Math.max(...r.players.map(p => p.vp))).filter(v => v > 0);
  if (allVPs.length > 0) {
    _origLog(`Avg VP (all): ${(allVPs.reduce((a,b)=>a+b,0)/allVPs.length).toFixed(0)} | Avg winner VP: ${(winnerVPs.reduce((a,b)=>a+b,0)/winnerVPs.length).toFixed(0)}`);
    _origLog(`VP range: ${Math.min(...allVPs)}-${Math.max(...allVPs)}`);
  }
  // VP/Gen efficiency
  const vpPerGen = results.filter(r => typeof r.gen === 'number' && r.players).map(r => {
    const wVP = Math.max(...r.players.map(p => p.vp));
    return wVP / r.gen;
  }).filter(v => v > 0);
  if (vpPerGen.length > 0) {
    _origLog(`Efficiency: ${(vpPerGen.reduce((a,b)=>a+b,0)/vpPerGen.length).toFixed(1)} VP/Gen (target: ~13)`);
  }
  // VP breakdown averages
  const completedResults = results.filter(r => r.players && r.players.length > 0);
  if (completedResults.length > 0) {
    const avgBD = { tr: 0, greenery: 0, city: 0, cards: 0, milestones: 0, awards: 0 };
    let count = 0;
    for (const r of completedResults) {
      for (const p of r.players) {
        if (p.vp <= 0) continue;
        avgBD.tr += p.tr; avgBD.greenery += p.greenery; avgBD.city += p.city;
        avgBD.cards += p.cards; avgBD.milestones += p.milestones; avgBD.awards += p.awards;
        count++;
      }
    }
    if (count > 0) {
      for (const k in avgBD) avgBD[k] = (avgBD[k] / count).toFixed(1);
      _origLog(`Avg breakdown: TR=${avgBD.tr} green=${avgBD.greenery} city=${avgBD.city} cards=${avgBD.cards} MS=${avgBD.milestones} AW=${avgBD.awards}`);
    }
  }
  const times = results.map(r => r.elapsed).filter(t => t > 0);
  if (times.length > 0) _origLog(`Avg time: ${(times.reduce((a,b) => a+b, 0) / times.length).toFixed(0)}s`);
}

main().catch(e => console.error('Fatal:', e));
