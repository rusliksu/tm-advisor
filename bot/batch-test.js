#!/usr/bin/env node
/**
 * batch-test.js — Run N bot-vs-bot games and collect stats.
 * Usage: node bot/batch-test.js [--games N] [--server URL]
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let NUM_GAMES = 5;
let SERVER = 'http://127.0.0.1:8081';
const CHOICE_LOGGING = process.env.BOT_CHOICE_LOG === '1';
const CHOICE_LOG_DIR = path.join(__dirname, '..', 'data', 'game_logs', 'choice_logs');
const HTTP_TIMEOUT_MS = Math.max(1000, parseInt(process.env.BATCH_HTTP_TIMEOUT_MS || '15000', 10) || 15000);
const MAX_IDLE_CYCLES = Math.max(5, parseInt(process.env.BATCH_MAX_IDLE_CYCLES || '40', 10) || 40);
const WARN_MOVES_PER_GEN = Math.max(100, parseInt(process.env.BATCH_WARN_MOVES_PER_GEN || '200', 10) || 200);

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--games' && args[i+1]) NUM_GAMES = parseInt(args[++i]);
  if (args[i] === '--server' && args[i+1]) SERVER = args[++i];
}

function httpJSON(method, url, body, timeoutMs = HTTP_TIMEOUT_MS) {
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
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    req.on('error', (err) => reject(new Error(`${method} ${u.pathname}${u.search} failed: ${err.message}`)));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
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
  return String(wf.title || '');
}

function summarizeCardsDetailed(cards, limit = 10) {
  if (!Array.isArray(cards)) return [];
  return cards.slice(0, limit).map((card) => ({
    name: card?.name || card || '?',
    cost: card?.calculatedCost ?? card?.cost ?? null,
    disabled: !!card?.isDisabled,
  }));
}

function summarizeColonies(colonies, limit = 20) {
  if (!Array.isArray(colonies)) return [];
  return colonies.slice(0, limit).map((colony) => ({
    name: colony?.name || colony || '?',
    colonies: Array.isArray(colony?.colonies) ? colony.colonies.length : null,
    isActive: colony?.isActive ?? null,
  }));
}

function getMegaCredits(player) {
  return player?.megacredits ?? player?.megaCredits ?? null;
}

function getMegaCreditProduction(player) {
  return player?.megacreditProduction ?? player?.megaCreditProduction ?? null;
}

function normalizePlayerMoneyFields(player) {
  if (!player) return;
  if (player.megaCredits != null && player.megacredits == null) player.megacredits = player.megaCredits;
  if (player.megacredits != null && player.megaCredits == null) player.megaCredits = player.megacredits;
  if (player.megaCreditProduction != null && player.megacreditProduction == null) player.megacreditProduction = player.megaCreditProduction;
  if (player.megacreditProduction != null && player.megaCreditProduction == null) player.megaCreditProduction = player.megacreditProduction;
}

function summarizeChoiceOptions(wf) {
  if (!wf) return [];
  if (wf.type === 'card' && Array.isArray(wf.cards)) {
    return wf.cards.map((c) => c?.name || c).filter(Boolean);
  }
  if (wf.type === 'projectCard' && Array.isArray(wf.cards)) {
    return wf.cards.map((c) => c?.name || c).filter(Boolean);
  }
  if (wf.type === 'colony') {
    return summarizeColonies(wf.coloniesModel || wf.colonies || []);
  }
  if (wf.type === 'or' && Array.isArray(wf.options)) {
    return wf.options.map((o, idx) => ({
      index: idx,
      type: o?.type || '?',
      title: getTitle(o).slice(0, 80),
      cards: Array.isArray(o?.cards) ? o.cards.map((c) => c?.name || c).filter(Boolean).slice(0, 10) : undefined,
      cardsDetailed: Array.isArray(o?.cards) ? summarizeCardsDetailed(o.cards) : undefined,
      colonies: o?.type === 'colony' ? summarizeColonies(o.coloniesModel || o.colonies || []) : undefined,
      disabledCards: Array.isArray(o?.cards) ? o.cards.filter((c) => c?.isDisabled).length : undefined,
    }));
  }
  if (wf.type === 'space' && Array.isArray(wf.spaces || wf.availableSpaces)) {
    const spaces = wf.spaces || wf.availableSpaces || [];
    return spaces.map((s) => s?.id || s).filter(Boolean).slice(0, 50);
  }
  return [];
}

function summarizeStateForChoiceLog(state) {
  const tp = state?.thisPlayer || {};
  const gm = state?.game || {};
  const temp = typeof gm.temperature === 'number' ? gm.temperature : null;
  const oxygen = typeof gm.oxygenLevel === 'number' ? gm.oxygenLevel : null;
  const oceans = typeof gm.oceans === 'number' ? gm.oceans : null;
  const venus = typeof gm.venusScaleLevel === 'number' ? gm.venusScaleLevel : null;
  const tempSteps = temp == null ? null : Math.max(0, Math.round((8 - temp) / 2));
  const oxygenSteps = oxygen == null ? null : Math.max(0, 14 - oxygen);
  const oceanSteps = oceans == null ? null : Math.max(0, 9 - oceans);
  const venusSteps = venus == null ? null : Math.max(0, Math.round((30 - venus) / 2));
  const remainingSteps = [tempSteps, oxygenSteps, oceanSteps, venusSteps].every((v) => typeof v === 'number')
    ? tempSteps + oxygenSteps + oceanSteps + Math.round(venusSteps * 0.5)
    : null;
  const mc = getMegaCredits(tp);
  const mcProd = getMegaCreditProduction(tp);
  return {
    mc,
    steel: tp.steel ?? null,
    titanium: tp.titanium ?? null,
    mcProd,
    steelProd: tp.steelProduction ?? null,
    titaniumProd: tp.titaniumProduction ?? null,
    plantProd: tp.plantProduction ?? tp.plantsProduction ?? null,
    energyProd: tp.energyProduction ?? null,
    heatProd: tp.heatProduction ?? null,
    plants: tp.plants ?? null,
    heat: tp.heat ?? null,
    energy: tp.energy ?? null,
    tr: tp.terraformRating ?? null,
    income: (mcProd ?? 0) + (tp.terraformRating ?? 0),
    handCount: Array.isArray(state?.cardsInHand) ? state.cardsInHand.length : (Array.isArray(tp.cardsInHand) ? tp.cardsInHand.length : null),
    temperature: temp,
    oxygen,
    oceans,
    venus,
    remainingSteps,
    coreGlobalsOpen: !!((temp != null && temp < 8) || (oxygen != null && oxygen < 14) || (oceans != null && oceans < 9)),
    venusOpen: !!(venus != null && venus < 30),
  };
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

function isPlacementWorkflow(wf) {
  const t = wf?.type || '';
  return t === 'space' || t === 'amount';
}

function appendChoiceLog(gameId, state, wf, input, reasoning) {
  if (!CHOICE_LOGGING) return;
  fs.mkdirSync(CHOICE_LOG_DIR, {recursive: true});
  const file = path.join(CHOICE_LOG_DIR, `bot-choice-${gameId}.jsonl`);
  const payload = {
    ts: new Date().toISOString(),
    source: 'smartbot-batch',
    gameId,
    playerId: state?.thisPlayer?.id || null,
    playerName: state?.thisPlayer?.name || '?',
    color: state?.thisPlayer?.color || '?',
    generation: state?.game?.generation ?? null,
    phase: state?.game?.phase || '',
    waitingType: wf?.type || '',
    title: getTitle(wf),
    stateSummary: summarizeStateForChoiceLog(state),
    options: summarizeChoiceOptions(wf),
    picked: summarizeChoicePicked(input),
  };
  if (Array.isArray(reasoning) && reasoning.length > 0) payload.reasoning = reasoning;
  fs.appendFileSync(file, JSON.stringify(payload) + '\n', 'utf8');
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
  let idleCycles = 0;
  let lastGen = 0;
  let lastGenChange = 0;
  let meaningfulMovesThisGen = 0;
  let gameLog = [];
  let lastError = '';

  while (moves < maxMoves) {
    let anyAction = false;
    for (const p of players) {
      let state;
      try {
        state = await httpJSON('GET', `${SERVER}/api/player?id=${p.id}`);
      } catch(e) {
        lastError = e.message?.slice(0, 160) || String(e);
        continue;
      }

      if (state.game?.phase === 'end' || state.game?.phase === 'awards' || state.game?.phase === 'the_end') {
        return { gen: state.game.generation, phase: state.game.phase, players: state.players || players };
      }

      const wf = state.waitingFor;
      if (!wf) {
        // Check if game over via generation count
        if (state.game?.generation >= 25) return { gen: state.game.generation, phase: 'timeout', players: state.players || players };
        continue;
      }

      // Normalize MC aliases for smartbot compatibility across fork/live API shapes.
      normalizePlayerMoneyFields(state.thisPlayer);
      for (const pl of (state.players || [])) normalizePlayerMoneyFields(pl);

      let input;
      let reasoning = [];
      try {
        input = BOT.handleInput(wf, state);
        reasoning = BOT.flushReasoning() || [];
      } catch(e) {
        BOT.flushReasoning();
        input = { type: 'option' };
        reasoning = [`ERROR: ${e.message}`];
      }
      appendChoiceLog(gameId, state, wf, input, reasoning);

      // Track last N actions for stuck diagnostics
      if (!gameLog) gameLog = [];
      const _title = getTitle(wf) || wf?.type || '';
      gameLog.push({ move: moves, player: p.name || p.color, gen: state.game?.generation, wfType: wf?.type, title: _title.slice(0, 50), inputType: input?.type, inputIdx: input?.index });
      if (gameLog.length > 20) gameLog.shift();

      try {
        await httpJSON('POST', `${SERVER}/player/input?id=${p.id}`, input);
        anyAction = true;
        idleCycles = 0;
        moves++;
        stuck = 0;
        lastError = '';
        if (state.game?.generation && state.game.generation !== lastGen) {
          lastGen = state.game.generation;
          lastGenChange = moves;
          meaningfulMovesThisGen = 0;
          process.stdout.write(`g${lastGen} `);
        }
        if (!isPlacementWorkflow(wf)) meaningfulMovesThisGen++;
        // If stuck in same gen for 500+ moves, log what's happening and bail
        if (moves - lastGenChange > 500) {
          const title = getTitle(wf) || wf?.type || '?';
          const opts = JSON.stringify(summarizeChoiceOptions(wf)).slice(0, 240);
          const picked = JSON.stringify(summarizeChoicePicked(input));
          _origLog(`\n  STUCK at gen ${lastGen}, move ${moves}: player=${p.name||p.color} wf.type=${wf?.type} title="${title.slice(0,60)}" input.type=${input?.type}`);
          _origLog(`    options: ${opts}`);
          _origLog(`    picked: ${picked}`);
          return { gen: lastGen || '?', phase: 'GEN_STUCK', players: state.players || players };
        }
        // Log repeated meaningful actions within same gen, but ignore placement sub-choices.
        if (meaningfulMovesThisGen === WARN_MOVES_PER_GEN) {
          const title = getTitle(wf) || wf?.type || '?';
          const opts = JSON.stringify(summarizeChoiceOptions(wf)).slice(0, 240);
          const picked = JSON.stringify(summarizeChoicePicked(input));
          _origLog(`\n  ⚠ ${WARN_MOVES_PER_GEN} moves in gen ${lastGen}: ${p.name||p.color} wf=${wf?.type} title="${title}"`);
          _origLog(`    options: ${opts}`);
          _origLog(`    picked: ${picked}`);
        }
      } catch(e) {
        stuck++;
        lastError = e.message?.slice(0, 160) || String(e);
        if (stuck > 50) return { gen: state.game?.generation || '?', phase: 'STUCK', error: e.message?.slice(0, 80) };
      }
    }
    if (!anyAction) {
      idleCycles++;
      // Check if game ended
      try {
        const st = await httpJSON('GET', `${SERVER}/api/player?id=${players[0].id}`);
        if (st.game?.phase === 'end' || st.game?.phase === 'awards') {
          return { gen: st.game.generation, phase: st.game.phase, players: st.players || players };
        }
      } catch(e) {
        lastError = e.message?.slice(0, 160) || String(e);
      }
      if (idleCycles >= MAX_IDLE_CYCLES) {
        _origLog(`\n  IDLE_TIMEOUT after ${idleCycles} idle cycles at gen ${lastGen || '?'} (lastError=${lastError || 'none'})`);
        for (const entry of gameLog.slice(-10)) {
          _origLog(`    move${entry.move} ${entry.player} g${entry.gen} ${entry.wfType}:"${entry.title}" → ${entry.inputType}${entry.inputIdx != null ? '['+entry.inputIdx+']' : ''}`);
        }
        return { gen: lastGen || '?', phase: 'IDLE_TIMEOUT', error: (lastError || 'idle without actions').slice(0, 80) };
      }
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

  // Cleanup: delete game saves from TM server db
  const dbPaths = [
    path.resolve(__dirname, '..', '..', 'terraforming-mars', 'db', 'files'),
    '/d/tm-db/files',
  ];
  for (const dbPath of dbPaths) {
    if (fs.existsSync(dbPath)) {
      try {
        const files = fs.readdirSync(dbPath);
        let cleaned = 0;
        for (const f of files) {
          if (f.endsWith('.json')) {
            fs.unlinkSync(path.join(dbPath, f));
            cleaned++;
          }
        }
        // Clean history dir
        const histDir = path.join(dbPath, 'history');
        if (fs.existsSync(histDir)) {
          fs.rmSync(histDir, { recursive: true, force: true });
          fs.mkdirSync(histDir, { recursive: true });
        }
        if (cleaned > 0) _origLog(`Cleaned ${cleaned} game saves from ${dbPath}`);
      } catch(e) { /* ignore cleanup errors */ }
    }
  }
}

main().catch(e => console.error('Fatal:', e));
