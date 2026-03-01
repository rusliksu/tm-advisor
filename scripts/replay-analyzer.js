#!/usr/bin/env node
/**
 * replay-analyzer.js — Анализ качества решений по логам Terraforming Mars
 *
 * Использование:
 *   node scripts/replay-analyzer.js ~/Downloads/tm-game-gen8-2026-02-26.json
 *   node scripts/replay-analyzer.js data/game_logs/game_g738_*.jsonl
 */

const fs = require('fs');
const path = require('path');

// ══════════════════════════════════════════════════════════════
// §1. DATA LOADER — загрузка TM_RATINGS, TM_CARD_EFFECTS, all_cards
// ══════════════════════════════════════════════════════════════

const ROOT = path.resolve(__dirname, '..');

function loadJsonJs(relPath, varName) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) { console.error(`  [!] Не найден: ${full}`); return {}; }
  const raw = fs.readFileSync(full, 'utf8');
  const fn = new Function(raw.replace(/^const /, 'var ').replace(/^var /, 'var ') + `\nreturn ${varName};`);
  return fn();
}

const RATINGS = loadJsonJs('extension/data/ratings.json.js', 'TM_RATINGS');
const FX = loadJsonJs('extension/data/card_effects.json.js', 'TM_CARD_EFFECTS');

let ALL_CARDS = {};
const allCardsPath = path.join(ROOT, 'data', 'all_cards.json');
if (fs.existsSync(allCardsPath)) {
  const arr = JSON.parse(fs.readFileSync(allCardsPath, 'utf8'));
  for (const c of arr) ALL_CARDS[c.name] = c;
}

function getRating(name) {
  const r = RATINGS[name];
  return r ? { score: r.s, tier: r.t } : null;
}

function getEffects(name) { return FX[name] || null; }
function cardType(name) { return ALL_CARDS[name]?.type || null; }

// ══════════════════════════════════════════════════════════════
// §2. LOG PARSER — extension export (v4) или JSONL
// ══════════════════════════════════════════════════════════════

function parseInput(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    // v2 gamelog (from gamelog.js content script)
    if (raw.version === 2 && raw.events) {
      return parseGamelogV2(raw, filePath);
    }
    // Combined watcher export — contains .players array of individual exports
    if (raw._combined && Array.isArray(raw.players)) {
      return raw.players.map(p => parseExtensionExportObj(p));
    }
    return parseExtensionExportObj(raw);
  }
  if (ext === '.jsonl') return parseJSONL(filePath);
  throw new Error(`Неизвестный формат: ${ext}. Ожидается .json или .jsonl`);
}

/**
 * Parse v2 gamelog format (from extension/gamelog.js).
 * Extracts snapshots, card play timing, VP breakdown from event stream.
 */
function parseGamelogV2(raw, filePath) {
  const myColor = raw.myColor;
  const me = raw.players ? raw.players.find(p => p.color === myColor) : null;

  // Build snapshots by generation from state_snapshot events
  const snapsByGen = {};
  for (const e of raw.events) {
    if (e.type !== 'state_snapshot' && e.type !== 'final_state') continue;
    if (!e.players) continue;
    const gen = e.generation || (e.globals && e.globals.generation);
    if (gen == null) continue;
    snapsByGen[gen] = {
      gen,
      globalParams: e.globals ? {
        temp: e.globals.temperature,
        oxy: e.globals.oxygen,
        oceans: e.globals.oceans,
        venus: e.globals.venus,
      } : null,
      players: e.players,
    };
  }

  const genKeys = Object.keys(snapsByGen).map(Number).sort((a, b) => a - b);
  const lastGen = genKeys.length > 0 ? genKeys[genKeys.length - 1] : 0;
  const lastSnap = snapsByGen[lastGen];
  const mySnap = lastSnap?.players?.[myColor];
  const myTableau = mySnap?.tableau || [];

  // Card play timing: detect when each card appeared in tableau
  const cardPlayGen = {};
  let prevCards = new Set();
  for (const gen of genKeys) {
    const snap = snapsByGen[gen];
    const p = snap?.players?.[myColor];
    if (!p || !p.tableau) continue;
    const curCards = new Set(p.tableau);
    for (const c of curCards) {
      if (!prevCards.has(c) && !cardPlayGen[c]) cardPlayGen[c] = gen;
    }
    prevCards = curCards;
  }

  // Build playedByGen
  const myPlayed = {};
  for (const [card, gen] of Object.entries(cardPlayGen)) {
    if (!myPlayed[gen]) myPlayed[gen] = [];
    myPlayed[gen].push(card);
  }

  // Extract VP breakdown from final_state
  const finalEvents = raw.events.filter(e => e.type === 'final_state');
  const finalState = finalEvents.length > 0 ? finalEvents[finalEvents.length - 1] : null;

  const allFinal = {};
  if (finalState && finalState.players) {
    for (const [color, p] of Object.entries(finalState.players)) {
      if (p.vpBreakdown) {
        allFinal[color] = {
          total: p.vpBreakdown.total || 0,
          tr: p.vpBreakdown.terraformRating || 0,
          milestones: p.vpBreakdown.milestones || 0,
          awards: p.vpBreakdown.awards || 0,
          greenery: p.vpBreakdown.greenery || 0,
          city: p.vpBreakdown.city || 0,
          cards: p.vpBreakdown.victoryPoints || 0,
          vpByGen: p.vpByGen || [],
        };
      }
    }
  }

  const myFinal = allFinal[myColor] || null;
  let winner = null, winnerVP = 0;
  for (const [color, fs] of Object.entries(allFinal)) {
    if (fs.total > winnerVP) { winnerVP = fs.total; winner = color; }
  }
  const winnerName = raw.players ? (raw.players.find(p => p.color === winner)?.name || winner) : winner;
  const myPlace = myFinal ? Object.values(allFinal).filter(f => f.total > myFinal.total).length + 1 : 0;

  // Frozen card scores: build from ratings at play time
  const frozenCardScores = {};
  for (const [card, gen] of Object.entries(cardPlayGen)) {
    const r = getRating(card);
    if (r) {
      frozenCardScores[card] = { score: r.score, baseTier: r.tier, baseScore: r.score, gen };
    }
  }

  // Draft data from action events (if captured)
  const draftLog = [];
  const draftEvents = raw.events.filter(e =>
    e.eventType === 'draft_pick' || e.eventType === 'card_buy' ||
    e.eventType === 'corp_select' || e.eventType === 'prelude_select' ||
    e.eventType === 'ceo_select');
  for (const evt of draftEvents) {
    const offered = (evt.offered || []).map(name => {
      const r = getRating(name);
      return { name, score: r ? r.score : 0, tier: r ? r.tier : '?' };
    });
    const taken = evt.picked?.[0] || evt.bought?.[0] || evt.selected?.[0] || null;
    if (taken) {
      draftLog.push({
        round: draftLog.length + 1,
        eventType: evt.eventType,
        offered,
        taken,
        passed: null,
      });
    }
  }

  // Card arrival tracking — when did each card first appear in hand
  const cardArrivalGen = {};
  for (const e of raw.events) {
    if (e.type !== 'hand_change' || !e.added) continue;
    const gen = e.generation;
    if (gen == null) continue;
    for (const card of e.added) {
      if (!cardArrivalGen[card]) cardArrivalGen[card] = gen;
    }
  }

  // Action summary — passes, standard projects, conversions, card plays per gen
  const actionSummary = { passes: 0, passByGen: {}, standardProjects: [], converts: [], cardPlays: 0, cardPlaysByGen: {} };
  for (const e of raw.events) {
    const gen = e.generation;
    if (e.eventType === 'pass') {
      actionSummary.passes++;
      actionSummary.passByGen[gen] = (actionSummary.passByGen[gen] || 0) + 1;
    } else if (e.eventType === 'standard_project') {
      actionSummary.standardProjects.push({ gen, project: e.optionTitle || 'unknown' });
    } else if (e.eventType === 'convert_plants') {
      actionSummary.converts.push({ gen, type: 'plants' });
    } else if (e.eventType === 'convert_heat') {
      actionSummary.converts.push({ gen, type: 'heat' });
    } else if (e.eventType === 'sell_patents') {
      actionSummary.converts.push({ gen, type: 'sell_patents' });
    } else if (e.eventType === 'card_play') {
      actionSummary.cardPlays++;
      actionSummary.cardPlaysByGen[gen] = (actionSummary.cardPlaysByGen[gen] || 0) + 1;
    }
  }

  // Fallback: if no action events, reconstruct card plays from tableau diffs
  if (actionSummary.cardPlays === 0 && Object.keys(myPlayed).length > 0) {
    for (const [gen, cards] of Object.entries(myPlayed)) {
      // Skip corp/prelude/CEO (usually gen 1, indices 0-2 in tableau)
      const playable = cards.filter(c => {
        const info = ALL_CARDS[c];
        if (!info) return true; // unknown card — include
        return info.type !== 'corporation' && info.type !== 'prelude' && info.type !== 'ceo';
      });
      if (playable.length > 0) {
        actionSummary.cardPlays += playable.length;
        actionSummary.cardPlaysByGen[gen] = (actionSummary.cardPlaysByGen[gen] || 0) + playable.length;
      }
    }
  }

  // Map from gameOptions
  const map = raw.gameOptions?.boardName || null;

  return {
    format: 'gamelog_v2',
    gameId: raw.gameId,
    player: me?.name || 'Unknown',
    corp: me?.corp || (myTableau.length > 0 ? myTableau[0] : ''),
    endGen: lastGen,
    map,
    draftLog,
    frozenCardScores,
    cardArrivalGen,
    myPlayed,
    myTableau,
    myColor,
    snapshots: snapsByGen,
    finalScores: allFinal,
    myFinal,
    result: { place: myPlace, vp: myFinal?.total || 0, winner: winnerName, winnerVP },
    players: raw.players || [],
    actionSummary,
    gameOptions: raw.gameOptions || null,
    hasTurmoil: !!(raw.gameOptions && raw.gameOptions.turmoilExtension),
    gameDuration: raw.events.length > 0 ? Math.min(raw.events[raw.events.length - 1].timestamp - raw.startTime, 4 * 3600000) : 0, // cap 4h (async games)
    _oneShot: false,
    _sourceFile: filePath,
  };
}

function parseExtensionExportObj(raw) {
  // Warn only for truly unsupported versions (v2-4 all work)
  if (raw.version && raw.version < 2) console.warn(`  [!] Ожидается version 2+, получено ${raw.version}`);

  const me = raw.players.find(p => p.isMe);
  const myColor = raw.myColor;

  const genKeys = Object.keys(raw.generations || {}).map(Number).sort((a, b) => a - b);
  const lastGen = genKeys[genKeys.length - 1];
  const lastSnap = raw.generations?.[lastGen]?.snapshot;
  const mySnap = lastSnap?.players?.[myColor];
  const myTableau = mySnap?.tableau || [];

  const snapshots = {};
  for (const g of genKeys) {
    const s = raw.generations[g]?.snapshot;
    if (s) snapshots[g] = s;
  }

  const myFinal = raw.finalScores?.[myColor];
  const allFinal = raw.finalScores || {};

  let winner = null, winnerVP = 0;
  for (const [color, fs] of Object.entries(allFinal)) {
    if (fs.total > winnerVP) { winnerVP = fs.total; winner = color; }
  }
  const winnerName = raw.players.find(p => p.color === winner)?.name || winner;
  const myPlace = myFinal ? Object.values(allFinal).filter(f => f.total > myFinal.total).length + 1 : 0;

  // Reconstruct card plays from snapshot tableau diffs
  const actionSummary = { passes: 0, passByGen: {}, standardProjects: [], converts: [], cardPlays: 0, cardPlaysByGen: {} };
  let prevTableau = null; // null = first snapshot (baseline, not counted)
  for (const g of genKeys) {
    const s = snapshots[g];
    const p = s?.players?.[myColor];
    if (!p || !p.tableau) continue;
    const curTableau = new Set(p.tableau);
    if (prevTableau !== null) {
      let newCards = 0;
      for (const c of curTableau) {
        if (!prevTableau.has(c)) {
          const info = ALL_CARDS[c];
          if (info && (info.type === 'corporation' || info.type === 'prelude' || info.type === 'ceo')) continue;
          newCards++;
        }
      }
      if (newCards > 0) {
        actionSummary.cardPlays += newCards;
        actionSummary.cardPlaysByGen[g] = newCards;
      }
    }
    prevTableau = curTableau;
  }

  return {
    format: 'extension',
    gameId: raw.gameId,
    player: me?.name || 'Unknown',
    corp: me?.corp || mySnap?.tableau?.[0] || '',
    endGen: raw.endGen || (genKeys.length > 0 ? genKeys[genKeys.length - 1] : 0),
    map: raw.map,
    draftLog: raw.draftLog || [],
    frozenCardScores: raw.frozenCardScores || {},
    myPlayed: {},
    myTableau,
    myColor,
    snapshots,
    finalScores: allFinal,
    myFinal,
    result: { place: myPlace, vp: myFinal?.total || 0, winner: winnerName, winnerVP },
    players: raw.players,
    actionSummary,
    gameOptions: raw.gameOptions || null,
    hasTurmoil: !!(raw.gameOptions && (raw.gameOptions.turmoilExtension || raw.gameOptions.turmoil)),
    gameDuration: raw.gameDuration,
    milestonesData: lastSnap?.milestones || null,
    awardsData: lastSnap?.awards || null,
    coloniesData: lastSnap?.colonies || null,
    turmoilData: lastSnap?.turmoil || null,
    // Detect one-shot: if only 1 generation snapshot, timing is meaningless
    _oneShot: !!raw._oneShot || genKeys.length <= 1,
  };
}

function parseJSONL(filePath) {
  const dir = path.dirname(filePath);

  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
  const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  // game_id из первого ивента (точнее чем filename)
  const gameId = events[0]?.game_id || 'unknown';
  const idParts = gameId.split('_');
  const gameIdBase = idParts[0]; // e.g. g306

  const gameStart = events.find(e => e.event === 'game_start');
  const allPlayers = gameStart?.players || [];

  // Определить игрока по game_id (формат g306_GydRo)
  const playerFromId = idParts.length > 1 ? idParts[1] : null;
  const playerName = (playerFromId && allPlayers.find(p => p.toLowerCase() === playerFromId.toLowerCase())) ||
                     playerFromId || allPlayers[allPlayers.length - 1] || 'Unknown';

  // Снапшоты
  const snapshots = {};
  const stateSnapshots = events.filter(e => e.event === 'state_snapshot');
  for (const s of stateSnapshots) {
    snapshots[s.gen] = {
      gen: s.gen,
      globalParams: { temp: s.temperature, oxy: s.oxygen, oceans: s.oceans, venus: s.venus },
      players: s.players
    };
  }

  // Реконструировать played cards per gen из state_diff
  const playedByGen = {};
  const diffs = events.filter(e => e.event === 'state_diff');
  for (const d of diffs) {
    const played = d.player_changes?.[playerName]?.played;
    if (played) {
      if (!playedByGen[d.gen]) playedByGen[d.gen] = [];
      playedByGen[d.gen].push(...played);
    }
  }

  // offers_log
  const offersPath = path.join(dir, 'offers_log.jsonl');
  let offers = [];
  if (fs.existsSync(offersPath)) {
    offers = fs.readFileSync(offersPath, 'utf8').trim().split('\n')
      .filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }

  const matchesGame = (o) => o.game_id?.startsWith(gameIdBase);
  const gameEnd = offers.find(o => o.phase === 'game_end' && o.player === playerName && matchesGame(o));

  // Последний снапшот
  const lastSnap = stateSnapshots[stateSnapshots.length - 1];
  const lastSnapPlayer = lastSnap?.players?.[playerName];
  const lastSnapTableau = lastSnapPlayer?.tableau || [];
  const lastSnapCorp = lastSnapPlayer?.corp || '';
  const lastSnapGen = lastSnap?.gen || 0;

  // Финальный tableau: из game_end или из diffs
  let finalTableau = gameEnd?.tableau || lastSnapTableau;
  // Дополнить tableau из played cards (если были после последнего снапшота)
  const tableauSet = new Set(finalTableau);
  for (const cards of Object.values(playedByGen)) {
    for (const c of cards) tableauSet.add(c);
  }
  finalTableau = [...tableauSet];

  // Game end — результаты
  const allGameEnds = offers.filter(o => o.phase === 'game_end' && matchesGame(o));
  let winnerName = gameEnd?.winner || '', winnerVP = 0, myPlace = 0;
  if (allGameEnds.length > 0) {
    const sorted = allGameEnds.sort((a, b) => (b.vp || 0) - (a.vp || 0));
    winnerName = sorted[0]?.player || '';
    winnerVP = sorted[0]?.vp || 0;
    myPlace = sorted.findIndex(e => e.player === playerName) + 1;
  }

  return {
    format: 'jsonl',
    gameId,
    player: playerName,
    corp: gameEnd?.corp || lastSnapCorp,
    endGen: gameEnd?.gen || lastSnapGen,
    map: gameStart?.board || '',
    draftLog: [],
    frozenCardScores: {},
    myPlayed: {},
    myTableau: finalTableau,
    myColor: playerName, // JSONL uses player name as key
    snapshots,
    playedByGen,
    finalScores: {},
    myFinal: gameEnd ? { total: gameEnd.vp } : null,
    result: { place: myPlace, vp: gameEnd?.vp || 0, winner: winnerName, winnerVP },
    players: allPlayers.map(n => ({ name: n })),
    gameOptions: {
      boardName: gameStart?.board,
      draft: gameStart?.draft,
      colonies: gameStart?.colonies,
      turmoil: gameStart?.turmoil,
      venusNext: gameStart?.venus,
    }
  };
}

// ══════════════════════════════════════════════════════════════
// §3. DRAFT ANALYZER
// ══════════════════════════════════════════════════════════════

function classifyDraftRound(round) {
  if (!round.offered || round.offered.length === 0) return 'empty';
  // Use eventType hint from gamelog_v2 if available
  if (round.eventType === 'corp_select') return 'corp';
  if (round.eventType === 'prelude_select') return 'prelude';
  if (round.eventType === 'ceo_select') return 'ceo';
  // Fallback to card catalog lookup
  const types = round.offered.map(c => cardType(c.name));
  if (types.some(t => t === 'corporation')) return 'corp';
  if (types.every(t => t === 'prelude')) return 'prelude';
  // Heuristic: corporations usually have 2-5 cards offered, no cost field
  if (round.offered.length <= 5) {
    const corpLike = round.offered.filter(c => {
      const info = ALL_CARDS[c.name];
      return info && (info.type === 'corporation' || info.cardType === 'corporation');
    });
    if (corpLike.length >= 2) return 'corp';
  }
  return 'project';
}

function analyzeDraft(data) {
  const { draftLog, myTableau } = data;
  if (!draftLog || draftLog.length === 0) return null;

  const rounds = [];
  let matches = 0, totalEVLoss = 0, deadPicks = 0;
  const playedSet = new Set(myTableau);
  const alreadyPicked = new Set(); // дедупликация — карта считается только при первом пике

  for (const round of draftLog) {
    if (!round.offered || round.offered.length === 0) continue;
    if (round.taken === null) continue;

    // Пропускаем корп и прелюд раунды — они анализируются в Setup
    const roundType = classifyDraftRound(round);
    if (roundType !== 'project') continue;

    // Если эту карту мы уже "взяли" в предыдущем раунде — пропускаем
    // (draftLog показывает карту повторно когда она циркулирует по кругу)
    if (alreadyPicked.has(round.taken)) continue;
    alreadyPicked.add(round.taken);

    const cardScore = c => c.total ?? c.score ?? 0;
    const best = round.offered.reduce((a, b) => (cardScore(a) > cardScore(b) ? a : b));
    const takenCard = round.offered.find(c => c.name === round.taken);
    const takenScore = takenCard ? cardScore(takenCard) : 0;
    const bestScore = cardScore(best);
    const isMatch = round.taken === best.name;
    const evLoss = isMatch ? 0 : takenScore - bestScore;
    const wasPlayed = playedSet.has(round.taken);

    if (isMatch) matches++;
    totalEVLoss += evLoss;
    if (!wasPlayed) deadPicks++;

    if (!isMatch && Math.abs(evLoss) >= 5) {
      rounds.push({
        round: round.round,
        taken: round.taken,
        takenScore: Math.round(takenScore),
        takenTier: takenCard?.tier || '?',
        best: best.name,
        bestScore: Math.round(bestScore),
        bestTier: best.tier || '?',
        evLoss: Math.round(evLoss),
        wasPlayed,
        reasons: takenCard?.reasons || [],
      });
    }
  }

  const totalPicks = alreadyPicked.size;
  const accuracy = totalPicks > 0 ? matches / totalPicks : 0;

  return {
    accuracy, totalPicks, matches,
    totalEVLoss: Math.round(totalEVLoss),
    deadPicks,
    issues: rounds.sort((a, b) => a.evLoss - b.evLoss),
  };
}

// ══════════════════════════════════════════════════════════════
// §4. BUY ANALYZER
// ══════════════════════════════════════════════════════════════

function analyzeBuys(data) {
  const { draftLog, myTableau } = data;
  if (!draftLog || draftLog.length === 0) return null;

  const playedSet = new Set(myTableau);

  // Дедуплицируем: каждая карта считается один раз (первый пик)
  const seen = new Set();
  const drafted = [];
  for (const r of draftLog) {
    if (r.taken === null || seen.has(r.taken)) continue;
    seen.add(r.taken);
    drafted.push(r.taken);
  }

  // Фильтруем корпы и прелюдии
  const projects = drafted.filter(c => {
    const t = cardType(c);
    return t !== 'corporation' && t !== 'prelude';
  });

  const deadCards = [];
  let deadTotalCost = 0;
  for (const cardName of projects) {
    if (playedSet.has(cardName)) continue;
    const r = getRating(cardName);
    const fx = getEffects(cardName);
    const cardInfo = ALL_CARDS[cardName];
    const printedCost = cardInfo?.cost || 0;
    // Classify dead card type
    const hasAction = fx && (fx.actMC || fx.actTR || fx.actCD || fx.actOc);
    const hasProd = fx && (fx.mp || fx.sp || fx.tp || fx.pp || fx.ep || fx.hp);
    const cardKind = hasAction ? 'action' : hasProd ? 'prod' : (cardInfo?.type === 'event' || cardInfo?.type === 'Event') ? 'event' : 'other';
    deadCards.push({ name: cardName, score: r?.score || 0, tier: r?.tier || '?', printedCost, kind: cardKind });
    deadTotalCost += 3 + printedCost;
  }

  const projectsPlayed = projects.filter(c => playedSet.has(c));

  return {
    drafted: projects.length,
    played: projectsPlayed.length,
    deadCards,
    deadCount: deadCards.length,
    deadCost: deadCards.length * 3, // draft cost only (conservative)
    deadCostFull: deadTotalCost, // draft + printed cost (if cards were bought too)
  };
}

// ══════════════════════════════════════════════════════════════
// §5. SETUP ANALYZER — Corp & Prelude selection
// ══════════════════════════════════════════════════════════════

function analyzeSetup(data) {
  const result = { corp: null, preludes: null };
  const { draftLog } = data;

  // Ищем корп раунд и прелюд раунды в draftLog
  if (draftLog && draftLog.length > 0) {
    for (const round of draftLog) {
      const type = classifyDraftRound(round);

      if (type === 'corp' && !result.corp) {
        // Корп раунд — offered содержит корпы среди прочих карт
        const cs = c => c.total ?? c.score ?? 0;
        const offeredCorps = round.offered.filter(c => cardType(c.name) === 'corporation');
        const best = offeredCorps.length > 0
          ? offeredCorps.reduce((a, b) => (cs(a) > cs(b) ? a : b))
          : null;
        const chosenCard = round.offered.find(c => c.name === round.taken);
        const isCorpPick = cardType(round.taken) === 'corporation';

        result.corp = {
          chosen: data.corp,
          score: (chosenCard ? cs(chosenCard) : 0) || getRating(data.corp)?.score || 0,
          tier: getRating(data.corp)?.tier || '?',
          offered: offeredCorps.map(c => ({ name: c.name, score: Math.round(cs(c)), tier: c.tier || getRating(c.name)?.tier || '?' })),
          optimal: best && isCorpPick ? round.taken === best.name : null,
          bestName: best?.name || null,
          bestScore: best ? Math.round(cs(best)) : null,
        };
      }

      if (type === 'prelude' && round.taken) {
        // Прелюд раунды — собираем все пики
        const cs = c => c.total ?? c.score ?? 0;
        if (!result.preludes) result.preludes = { picks: [], allOffered: [] };
        const best = round.offered.reduce((a, b) => (cs(a) > cs(b) ? a : b));
        const takenCard = round.offered.find(c => c.name === round.taken);
        result.preludes.picks.push({
          chosen: round.taken,
          score: takenCard ? Math.round(cs(takenCard)) : 0,
          best: best.name,
          bestScore: Math.round(cs(best)),
          optimal: round.taken === best.name,
          offered: round.offered.map(c => ({ name: c.name, score: Math.round(cs(c)) })),
        });
      }
    }
  }

  // Фоллбэк — если в draftLog нет корп раунда, берём из данных игры
  if (!result.corp && data.corp) {
    const r = getRating(data.corp);
    result.corp = { chosen: data.corp, score: r?.score || 0, tier: r?.tier || '?', offered: [], optimal: null };
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// §6. TIMING ANALYZER
// ══════════════════════════════════════════════════════════════

function analyzeTiming(data) {
  // One-shot fetch: все карты показаны на endGen — timing бессмысленен
  if (data._oneShot) return null;

  const { frozenCardScores = {}, cardArrivalGen = {}, myColor, endGen, myTableau, snapshots, playedByGen } = data;
  const issues = [];

  // Собрать карты с gen, когда они были сыграны
  const myCards = {};

  // Determine the first observed gen (baseline — cards there before tracking started)
  const snapGenKeys = Object.keys(snapshots || {}).map(Number).sort((a, b) => a - b);
  const firstObservedGen = snapGenKeys.length > 0 ? snapGenKeys[0] : 0;

  if (Object.keys(frozenCardScores).length > 0) {
    // Extension export — берём из frozenCardScores
    for (const [key, val] of Object.entries(frozenCardScores)) {
      if (key.startsWith(myColor + ':')) {
        const cardName = key.slice(myColor.length + 1);
        myCards[cardName] = { ...val, firstObserved: val.gen === firstObservedGen };
      }
    }
    for (const [key, val] of Object.entries(frozenCardScores)) {
      if (!key.includes(':') && myTableau.includes(key)) {
        if (!myCards[key]) myCards[key] = { ...val, firstObserved: val.gen === firstObservedGen };
      }
    }
  } else if (playedByGen && Object.keys(playedByGen).length > 0) {
    // JSONL — используем played events из state_diff
    for (const [gen, cards] of Object.entries(playedByGen)) {
      for (const card of cards) {
        myCards[card] = { gen: Number(gen), baseScore: getRating(card)?.score || 0 };
      }
    }
  } else if (snapshots && Object.keys(snapshots).length > 0) {
    // Фоллбэк — реконструируем из снапшотов tableau diffs
    const genKeys = Object.keys(snapshots).map(Number).sort((a, b) => a - b);
    let prevTableau = null; // null = first snapshot (baseline)
    for (const g of genKeys) {
      const player = snapshots[g].players?.[myColor];
      if (!player) continue;
      const curTableau = new Set(player.tableau || []);
      if (prevTableau !== null) {
        for (const card of curTableau) {
          if (!prevTableau.has(card)) myCards[card] = { gen: g, baseScore: getRating(card)?.score || 0 };
        }
      } else {
        // First observed snapshot — cards existed before tracking started
        for (const card of curTableau) {
          myCards[card] = { gen: g, baseScore: getRating(card)?.score || 0, firstObserved: true };
        }
      }
      prevTableau = curTableau;
    }
  }

  // Late thresholds: relative to game length (last ~20% of game)
  const lateGenThreshold = Math.max(endGen - 1, Math.ceil(endGen * 0.8));

  for (const [name, info] of Object.entries(myCards)) {
    const fx = getEffects(name);
    if (!fx) continue;
    const gen = info.gen || 0;
    if (gen === 0 || endGen === 0) continue;

    // Skip cards from the first observed snapshot — we don't know when they were actually played
    if (info.firstObserved) continue;

    // Check if card arrived on hand the same gen it was played (= just drafted, no timing fault)
    const arrivalGen = cardArrivalGen[name];
    const justArrived = arrivalGen != null && arrivalGen === gen;

    const hasProd = fx.mp || fx.sp || fx.tp || fx.pp || fx.ep || fx.hp;
    const hasAction = fx.actMC || fx.actTR || fx.actCD || fx.actOc;

    // Late production — но не если основная ценность = VP/TR
    // Skip if card just arrived this gen (couldn't have played it earlier)
    const heldSince = arrivalGen != null && arrivalGen < gen ? ` (на руке с gen ${arrivalGen})` : '';
    if (hasProd && gen >= lateGenThreshold && !justArrived) {
      const hasDirectVP = fx.vp || fx.vpAcc || fx.tr || fx.tmp || fx.o2 || fx.oc || fx.vn || fx.city || fx.grn;
      const prodTotal = (fx.mp || 0) + (fx.sp || 0) * 1.6 + (fx.tp || 0) * 2.5 +
                        (fx.pp || 0) * 1.6 + (fx.ep || 0) * 1.5 + (fx.hp || 0) * 0.8;
      if (!hasDirectVP || prodTotal >= 8) {
        issues.push({
          card: name, type: 'late_prod', gen,
          message: `(prod) сыгран gen ${gen} — только ${endGen - gen} gen отдачи${heldSince}`,
          severity: gen >= endGen ? 'high' : 'medium',
        });
      }
    }

    // Late blue action — skip if card just arrived
    if (hasAction && gen > 0 && !justArrived) {
      const activations = endGen - gen;
      if (activations <= 1) {
        issues.push({
          card: name, type: 'late_action', gen,
          message: `(action) сыгран gen ${gen} — только ${activations} активаций${heldSince}`,
          severity: 'medium',
        });
      }
    }

    // Weak card plays
    const r = getRating(name);
    if (r && r.score <= 45) {
      issues.push({
        card: name, type: 'weak_play', gen,
        message: `(${r.tier}-tier, ${r.score}) — сомнительный розыгрыш`,
        severity: 'low',
      });
    }
  }

  const penalties = issues.reduce((sum, i) => {
    if (i.severity === 'high') return sum + 10;
    if (i.severity === 'medium') return sum + 5;
    return sum + 2;
  }, 0);

  return {
    score: Math.max(0, 100 - penalties),
    issues: issues.sort((a, b) => {
      const sev = { high: 0, medium: 1, low: 2 };
      return (sev[a.severity] || 3) - (sev[b.severity] || 3);
    }),
  };
}

// ══════════════════════════════════════════════════════════════
// §6b. ACTION SUMMARY ANALYZER
// ══════════════════════════════════════════════════════════════

function analyzeActions(data) {
  const { actionSummary, endGen } = data;
  if (!actionSummary) return null;

  const insights = [];

  // Early passes (gen 1-3) might indicate frozen start
  const earlyPasses = Object.entries(actionSummary.passByGen)
    .filter(([g]) => Number(g) <= 3)
    .reduce((s, [, c]) => s + c, 0);
  if (earlyPasses >= 2) {
    insights.push({ type: 'early_passes', message: `${earlyPasses} пасов в gen 1-3 — медленный старт?`, severity: 'medium' });
  }

  // Standard projects usage
  const spCounts = {};
  for (const sp of actionSummary.standardProjects) {
    const name = sp.project.replace(/\s*\(.*?\)/g, '').trim();
    spCounts[name] = (spCounts[name] || 0) + 1;
  }

  // Card plays per gen — detect burst gens and tempo
  const playGens = Object.entries(actionSummary.cardPlaysByGen);
  const maxPlaysGen = playGens.sort((a, b) => b[1] - a[1])[0];
  if (maxPlaysGen && maxPlaysGen[1] >= 8) {
    insights.push({ type: 'burst_gen', message: `Gen ${maxPlaysGen[0]}: ${maxPlaysGen[1]} карт сыграно — burst generation`, severity: 'info' });
  }

  // Cards per gen average
  const activeGens = playGens.length;
  const avgPerGen = activeGens > 0 ? actionSummary.cardPlays / activeGens : 0;

  // Average card quality from played cards
  let totalScore = 0, ratedCount = 0;
  const { myPlayed, myTableau } = data;
  const playedList = myTableau || [];
  for (const card of playedList) {
    const info = ALL_CARDS[card];
    if (info && (info.type === 'corporation' || info.type === 'prelude' || info.type === 'ceo')) continue;
    const r = getRating(card);
    if (r) { totalScore += r.score; ratedCount++; }
  }
  const avgCardScore = ratedCount > 0 ? Math.round(totalScore / ratedCount * 10) / 10 : null;

  // Tempo: low card play rate in early gens
  if (endGen >= 6 && activeGens > 0) {
    const earlyPlays = Object.entries(actionSummary.cardPlaysByGen)
      .filter(([g]) => Number(g) <= Math.ceil(endGen / 2))
      .reduce((s, [, c]) => s + c, 0);
    const latePlays = actionSummary.cardPlays - earlyPlays;
    if (earlyPlays > 0 && latePlays > earlyPlays * 2.5) {
      insights.push({ type: 'back_loaded', message: `Задняя загрузка: ${earlyPlays} карт в 1-й половине, ${latePlays} во 2-й — engine набрал обороты поздно`, severity: 'info' });
    }
  }

  return {
    passes: actionSummary.passes,
    passByGen: actionSummary.passByGen,
    cardPlays: actionSummary.cardPlays,
    cardPlaysByGen: actionSummary.cardPlaysByGen,
    standardProjects: spCounts,
    converts: actionSummary.converts.length,
    avgPerGen: Math.round(avgPerGen * 10) / 10,
    avgCardScore,
    insights,
  };
}

// ══════════════════════════════════════════════════════════════
// §7. ECONOMY ANALYZER
// ══════════════════════════════════════════════════════════════

function analyzeEconomy(data) {
  const { snapshots, myColor, finalScores, endGen } = data;
  const genKeys = Object.keys(snapshots).map(Number).sort((a, b) => a - b);
  if (genKeys.length === 0) return null;

  const curve = [];
  for (const g of genKeys) {
    const snap = snapshots[g];
    const me = snap.players?.[myColor];
    if (!me) continue;
    curve.push({
      gen: g,
      mcProd: me.mcProd ?? me.mc_prod ?? 0,
      tr: me.tr ?? 0,
      mc: me.mc ?? 0,
      steelProd: me.steelProd ?? me.steel_prod ?? 0,
      tiProd: me.tiProd ?? me.ti_prod ?? 0,
      plantProd: me.plantProd ?? me.plant_prod ?? 0,
      energyProd: me.energyProd ?? me.energy_prod ?? 0,
      heatProd: me.heatProd ?? me.heat_prod ?? 0,
      cardsInHand: me.cardsInHand ?? me.handSize ?? me.cards ?? 0,
      tableauSize: me.tableau?.length ?? me.tableauCount ?? 0,
    });
  }

  const vpByGen = finalScores[myColor]?.vpByGen || [];

  // Opponents — per-gen data from snapshots
  const opponents = {};
  const oppColors = {};

  // First collect per-gen TR/prod for opponents
  for (const g of genKeys) {
    const snap = snapshots[g];
    if (!snap.players) continue;
    for (const [color, p] of Object.entries(snap.players)) {
      if (color === myColor) continue;
      if (!oppColors[color]) {
        const pName = data.players.find(pl => pl.color === color)?.name || color;
        oppColors[color] = pName;
        opponents[pName] = { vp: 0, tr: 0, vpByGen: [], curve: [] };
      }
      const name = oppColors[color];
      opponents[name].curve.push({
        gen: g, tr: p.tr ?? 0,
        mcProd: p.mcProd ?? 0,
        tableauSize: p.tableau?.length ?? p.tableauCount ?? 0,
      });
    }
  }

  // Overlay finalScores
  if (Object.keys(finalScores).length > 0) {
    for (const [color, fs] of Object.entries(finalScores)) {
      if (color === myColor) continue;
      const pName = oppColors[color] || data.players.find(p => p.color === color)?.name || color;
      if (!opponents[pName]) opponents[pName] = { vp: 0, tr: 0, vpByGen: [], curve: [] };
      opponents[pName].vp = fs.total;
      opponents[pName].tr = fs.tr;
      opponents[pName].vpByGen = fs.vpByGen || [];
    }
  }

  // Final state comparison — if we have end-of-game snapshot data
  const endComparison = {};
  const lastSnap = genKeys.length > 0 ? snapshots[genKeys[genKeys.length - 1]] : null;
  if (lastSnap?.players) {
    for (const [color, p] of Object.entries(lastSnap.players)) {
      const pName = color === myColor ? '(me)'
        : (data.players.find(pl => pl.color === color)?.name || color);
      const fs = finalScores[color];
      endComparison[pName] = {
        vp: fs?.total ?? 0,
        tr: p.tr ?? 0,
        mcProd: p.mcProd ?? 0,
        tableau: p.tableau?.length ?? p.tableauCount ?? 0,
        colonies: p.colonies ?? 0,
        steelProd: p.steelProd ?? 0,
        tiProd: p.tiProd ?? 0,
        vpCards: fs?.cards ?? null,
      };
    }
  }

  return { curve, vpByGen, opponents, endComparison, hasTurmoil: !!data.hasTurmoil };
}

// ══════════════════════════════════════════════════════════════
// §7b. VP SOURCE ANALYSIS — milestones, awards, win condition
// ══════════════════════════════════════════════════════════════

function analyzeVPSources(data) {
  const { myColor, finalScores, result, player } = data;
  if (!finalScores || Object.keys(finalScores).length === 0) return null;

  const myFS = finalScores[myColor];
  if (!myFS || !myFS.total) return null;

  // VP breakdown per source
  // Note: game's "cards" field may only count positive VP; recalculate as remainder
  const sources = { tr: 0, greenery: 0, city: 0, cards: 0, milestones: 0, awards: 0 };
  for (const key of Object.keys(sources)) {
    sources[key] = myFS[key] || 0;
  }
  // Fix cards VP: total - other sources = net cards VP (includes negative card VP)
  const nonCardVP = sources.tr + sources.greenery + sources.city + sources.milestones + sources.awards;
  if (myFS.total && nonCardVP + sources.cards !== myFS.total) {
    sources.cards = myFS.total - nonCardVP;
  }

  // Percentage of total VP from each source
  const pct = {};
  for (const [k, v] of Object.entries(sources)) {
    pct[k] = myFS.total > 0 ? Math.round(v / myFS.total * 100) : 0;
  }

  // Win condition: compare VP sources with winner
  let winCondition = null;
  if (result.place === 1) {
    // I won — find my strongest source
    const sorted = Object.entries(sources).sort((a, b) => b[1] - a[1]);
    winCondition = { type: 'won', topSource: sorted[0][0], topVP: sorted[0][1] };
  } else {
    // Lost — find what the winner had that I didn't
    const winnerColor = Object.entries(finalScores)
      .sort((a, b) => (b[1].total || 0) - (a[1].total || 0))[0]?.[0];
    const winnerFS = winnerColor ? finalScores[winnerColor] : null;

    if (winnerFS && winnerFS.total) {
      const gaps = {};
      for (const key of Object.keys(sources)) {
        gaps[key] = (winnerFS[key] || 0) - (myFS[key] || 0);
      }
      const biggestGap = Object.entries(gaps).sort((a, b) => b[1] - a[1])[0];
      const winnerName = data.players.find(p => p.color === winnerColor)?.name || winnerColor;
      winCondition = {
        type: 'lost',
        gap: myFS.total ? (winnerFS.total - myFS.total) : 0,
        biggestSource: biggestGap[0],
        biggestGapVP: biggestGap[1],
        winnerName,
        comparison: gaps,
      };
    }
  }

  // Milestone/Award efficiency
  const milestonesInvested = (sources.milestones > 0); // 8 MC per milestone
  const awardsInvested = (sources.awards > 0); // 8-14 MC per award

  // VP gap timeline — when did the winner pull ahead?
  let vpTimeline = null;
  if (result.place > 1 && myFS.vpByGen && myFS.vpByGen.length > 0) {
    // Find winner's vpByGen
    const winnerColor = Object.entries(finalScores)
      .sort((a, b) => (b[1].total || 0) - (a[1].total || 0))[0]?.[0];
    const winnerVPByGen = winnerColor ? finalScores[winnerColor]?.vpByGen : null;
    if (winnerVPByGen && winnerVPByGen.length > 0) {
      const minLen = Math.min(myFS.vpByGen.length, winnerVPByGen.length);
      let firstBehind = -1;
      let maxGap = 0, maxGapGen = -1;
      for (let i = 0; i < minLen; i++) {
        const gap = winnerVPByGen[i] - myFS.vpByGen[i];
        if (firstBehind < 0 && gap > 0) firstBehind = i;
        if (gap > maxGap) { maxGap = gap; maxGapGen = i; }
      }
      if (maxGap > 0) {
        vpTimeline = { firstBehindIdx: firstBehind, maxGap, maxGapIdx: maxGapGen, totalGens: minLen };
      }
    }
  }

  return { sources, pct, winCondition, milestonesInvested, awardsInvested, vpTimeline };
}

// ══════════════════════════════════════════════════════════════
// §7c. COLONY ANALYSIS
// ══════════════════════════════════════════════════════════════

function analyzeColonies(data) {
  const { coloniesData, myColor, snapshots, endGen } = data;

  // Try to get colony data from snapshots (new format) or last snapshot
  let colonyInfo = coloniesData;
  if (!colonyInfo) {
    // Try from snapshots
    const genKeys = Object.keys(snapshots || {}).map(Number).sort((a, b) => a - b);
    for (let i = genKeys.length - 1; i >= 0; i--) {
      const snap = snapshots[genKeys[i]];
      if (snap?.colonies) { colonyInfo = snap.colonies; break; }
    }
  }
  if (!colonyInfo || colonyInfo.length === 0) return null;

  // Analyze colony ownership
  const myColonies = [];
  const oppColonies = {};
  for (const col of colonyInfo) {
    const owners = col.colonies || [];
    const myCount = owners.filter(c => c === myColor).length;
    if (myCount > 0) myColonies.push({ name: col.name, count: myCount, trackPos: col.trackPosition });

    for (const owner of owners) {
      if (owner === myColor) continue;
      if (!oppColonies[owner]) oppColonies[owner] = 0;
      oppColonies[owner]++;
    }
  }

  // Colony count comparison from endComparison
  const genKeys = Object.keys(snapshots || {}).map(Number).sort((a, b) => a - b);
  const lastSnap = genKeys.length > 0 ? snapshots[genKeys[genKeys.length - 1]] : null;
  const colonyLeader = { color: null, count: 0 };
  let myCount = 0;
  if (lastSnap?.players) {
    for (const [color, p] of Object.entries(lastSnap.players)) {
      const cnt = p.colonies || 0;
      if (color === myColor) myCount = cnt;
      if (cnt > colonyLeader.count) { colonyLeader.color = color; colonyLeader.count = cnt; }
    }
  }

  const insights = [];
  if (myCount === 0 && colonyLeader.count >= 2) {
    const leaderName = data.players.find(p => p.color === colonyLeader.color)?.name || colonyLeader.color;
    insights.push({
      type: 'no_colonies',
      message: `0 колоний — ${leaderName} имеет ${colonyLeader.count}`,
      severity: 'medium',
    });
  } else if (myCount >= colonyLeader.count && myCount >= 3) {
    insights.push({
      type: 'colony_leader',
      message: `Лидер по колониям (${myCount})`,
      severity: 'info',
    });
  }

  // Active colonies (high track position = good trade target)
  const activeColonies = colonyInfo
    .filter(c => c.isActive !== false && (c.trackPosition || 0) >= 2)
    .map(c => ({ name: c.name, trackPos: c.trackPosition }));

  return { myColonies, myCount, colonyLeader, activeColonies, insights };
}

// ══════════════════════════════════════════════════════════════
// §7d. MILESTONE & AWARD ANALYSIS
// ══════════════════════════════════════════════════════════════

function analyzeMilestonesAwards(data) {
  const { milestonesData, awardsData, myColor, player } = data;
  if (!milestonesData && !awardsData) return null;

  const playerName = player || 'Unknown';
  const result = { milestones: [], awards: [], insights: [] };

  // --- Milestones ---
  if (milestonesData) {
    for (const m of milestonesData) {
      const mine = m.claimant === playerName;
      result.milestones.push({
        name: m.name,
        claimed: m.claimed,
        claimant: m.claimant,
        mine,
      });
    }
    const myClaimed = result.milestones.filter(m => m.mine).length;
    const totalClaimed = result.milestones.filter(m => m.claimed).length;
    if (myClaimed === 0 && totalClaimed > 0) {
      result.insights.push({ type: 'no_milestones', message: 'Ни одного milestone не взято', severity: 'medium' });
    }
  }

  // --- Awards ---
  if (awardsData) {
    for (const a of awardsData) {
      const scores = a.scores || {};
      const myScore = scores[myColor] ?? 0;

      // Determine placement: who wins this award?
      const sorted = Object.entries(scores).sort((x, y) => y[1] - x[1]);
      const topScore = sorted[0]?.[1] || 0;
      const secondScore = sorted[1]?.[1] || 0;
      let myPlace = 0;
      if (myScore === topScore && topScore > 0) myPlace = 1;
      else if (myScore === secondScore && secondScore > 0) myPlace = 2;
      else if (myScore > 0) {
        myPlace = sorted.findIndex(([c]) => c === myColor) + 1;
      }

      const isMine = a.funder === playerName;
      const vp = myPlace === 1 ? 5 : myPlace === 2 ? 2 : 0;

      result.awards.push({
        name: a.name,
        funded: a.funded,
        funder: a.funder,
        fundedByMe: isMine,
        myScore,
        topScore,
        myPlace,
        vp,
        scores,
      });
    }

    // Detect missed award opportunities
    const unfunded = result.awards.filter(a => !a.funded && a.myPlace === 1 && a.topScore > 0);
    for (const a of unfunded) {
      result.insights.push({
        type: 'missed_award',
        message: `${a.name}: лидер (${a.myScore}), но не профинансирован → −5 VP`,
        severity: 'high',
      });
    }

    // Detect bad award investments
    const badFunds = result.awards.filter(a => a.fundedByMe && a.vp === 0);
    for (const a of badFunds) {
      result.insights.push({
        type: 'bad_award_fund',
        message: `${a.name}: профинансировал (8+ MC), но 0 VP (${a.myPlace === 0 ? 'нет очков' : `${a.myPlace}-е место`})`,
        severity: 'high',
      });
    }

    // Could awards have changed the outcome?
    const missedVP = unfunded.reduce((sum, a) => sum + a.vp, 0);
    const vpGap = (data.result?.winnerVP || 0) - (data.result?.vp || 0);
    if (missedVP > 0 && data.result?.place > 1 && missedVP >= vpGap) {
      result.insights.push({
        type: 'award_game_changer',
        message: `${missedVP} потерянных VP от awards ≥ отставание ${vpGap} VP — awards могли изменить исход!`,
        severity: 'high',
      });
    }
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// §8. GRADING
// ══════════════════════════════════════════════════════════════

function calcGrade(draft, buys, timing, economy, result) {
  let total = 0, count = 0;
  const breakdown = {};

  if (draft && draft.totalPicks > 0) {
    const draftScore = Math.round(draft.accuracy * 100);
    total += draftScore * 0.35;
    count += 0.35;
    breakdown.draft = { score: draftScore, weight: 35 };
  }
  if (buys && buys.drafted > 0) {
    const buyScore = Math.round(buys.played / buys.drafted * 100);
    total += buyScore * 0.15;
    count += 0.15;
    breakdown.buys = { score: buyScore, weight: 15 };
  }
  if (timing) {
    total += timing.score * 0.25;
    count += 0.25;
    breakdown.timing = { score: timing.score, weight: 25 };
  }

  // Economy score: compare TR growth rate
  // Turmoil drains ~1 TR/gen (non-chairman), so benchmark is lower
  let econScore = null;
  if (economy && economy.curve && economy.curve.length >= 2) {
    const first = economy.curve[0];
    const last = economy.curve[economy.curve.length - 1];
    const gens = last.gen - first.gen;
    if (gens > 0) {
      const trGrowth = (last.tr - first.tr) / gens; // net TR per gen
      const hasTurmoil = !!(economy.hasTurmoil);
      const trBenchmark = hasTurmoil ? 1.5 : 2.0;
      econScore = Math.min(100, Math.round(trGrowth / trBenchmark * 100));
      // Reduce weight if very few data points (1-2 gen span = low confidence)
      const econWeight = gens >= 3 ? 0.15 : gens >= 2 ? 0.10 : 0.05;
      total += Math.max(0, econScore) * econWeight;
      count += econWeight;
      breakdown.economy = { score: econScore, weight: Math.round(econWeight * 100), trPerGen: Math.round(trGrowth * 10) / 10, turmoil: hasTurmoil };
    }
  }

  // Result bonus/penalty: 1st place = +5, 2nd = 0, 3rd = -5
  let placeBonus = 0;
  if (result && result.place > 0) {
    placeBonus = result.place === 1 ? 5 : result.place === 2 ? 0 : -5;
    total += placeBonus;
    breakdown.result = { place: result.place, bonus: placeBonus };
  }

  // Not enough data to grade
  if (count === 0) return { score: null, letter: 'N/A', breakdown };

  let score = Math.min(100, Math.max(0, Math.round(total / count)));
  // Cap grade when major categories are missing (draft = 0.35, buys = 0.15)
  // Without draft data, grade is unreliable — cap at B+ (78)
  if (count < 0.50) score = Math.min(score, 78);
  const letter =
    score >= 93 ? 'S' : score >= 85 ? 'A' : score >= 75 ? 'B+' :
    score >= 65 ? 'B' : score >= 55 ? 'C+' : score >= 45 ? 'C' :
    score >= 35 ? 'D' : 'F';

  return { score, letter, breakdown };
}

// ══════════════════════════════════════════════════════════════
// §9. REPORT GENERATOR — console + JSON
// ══════════════════════════════════════════════════════════════

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  white: '\x1b[37m', gray: '\x1b[90m',
};

function tierColor(tier) {
  if (tier === 'S') return C.magenta;
  if (tier === 'A') return C.red;
  if (tier === 'B' || tier === 'B+') return C.yellow;
  if (tier === 'C' || tier === 'C+') return C.green;
  if (tier === 'D') return C.cyan;
  return C.gray;
}

function severityIcon(sev) {
  if (sev === 'high') return `${C.red}!!!${C.reset}`;
  if (sev === 'medium') return `${C.yellow} !! ${C.reset}`;
  return `${C.gray}  ! ${C.reset}`;
}

function pad(s, n) { return String(s).padStart(n); }

function printReport(data, draft, buys, setup, timing, economy, grade, actions, vpSources, ma, colonies) {
  const { player, corp, endGen, map, result } = data;

  console.log('');
  console.log(`${C.bold}${'═'.repeat(56)}${C.reset}`);
  console.log(`${C.bold}  TM Replay Analysis${C.reset}`);
  console.log(`${'═'.repeat(56)}`);
  console.log(`  Игрок: ${C.bold}${player}${C.reset} (${corp}) | Генераций: ${endGen} | Карта: ${map || '?'}`);

  if (result.vp) {
    const placeStr = result.place === 1 ? `${C.green}1-е место${C.reset}` : `${C.yellow}${result.place}-е место${C.reset}`;
    let durationStr = '';
    if (data.gameDuration && data.gameDuration > 0) {
      const mins = Math.round(data.gameDuration / 60000);
      durationStr = mins >= 60 ? ` | ${Math.floor(mins/60)}ч ${mins%60}мин` : ` | ${mins}мин`;
    }
    console.log(`  Итог: ${placeStr} (${C.bold}${result.vp} VP${C.reset}) | Победитель: ${result.winner} (${result.winnerVP} VP)${durationStr}`);
    // VP breakdown if available
    const myFS = data.myFinal;
    if (myFS && myFS.tr != null) {
      const parts = [];
      if (myFS.tr) parts.push(`TR ${myFS.tr}`);
      if (myFS.greenery) parts.push(`Green ${myFS.greenery}`);
      if (myFS.city) parts.push(`City ${myFS.city}`);
      if (myFS.cards) parts.push(`Cards ${myFS.cards}`);
      if (myFS.milestones) parts.push(`Miles ${myFS.milestones}`);
      if (myFS.awards) parts.push(`Awards ${myFS.awards}`);
      if (parts.length > 0) console.log(`  ${C.dim}VP: ${parts.join(' | ')}${C.reset}`);
    }
  }
  console.log('');

  // Draft
  if (draft && draft.totalPicks > 0) {
    const draftGrade = draft.accuracy >= 0.85 ? 'A' : draft.accuracy >= 0.75 ? 'B' : draft.accuracy >= 0.6 ? 'C' : 'D';
    const draftPct = Math.round(draft.accuracy * 100);
    console.log(`${C.bold}── Draft Quality: ${tierColor(draftGrade)}${draftPct}% (${draftGrade})${C.reset} ──${C.reset}`);
    console.log(`  Пиков: ${draft.totalPicks} | Совпадений с лучшим: ${draft.matches} | EV Loss: ${C.red}${draft.totalEVLoss}${C.reset} | Dead picks: ${draft.deadPicks}`);
    for (const issue of draft.issues.slice(0, 8)) {
      const icon = issue.wasPlayed ? '' : ` ${C.red}[dead]${C.reset}`;
      console.log(`  ${C.gray}R${pad(issue.round, 2)}:${C.reset} взял ${issue.taken} (${issue.takenScore}) вместо ${C.green}${issue.best} (${issue.bestScore})${C.reset} → ${C.red}${issue.evLoss}${C.reset}${icon}`);
    }
    if (draft.issues.length > 8) console.log(`  ${C.gray}  ...и ещё ${draft.issues.length - 8} расхождений${C.reset}`);
    console.log('');
  }

  // Buy quality
  if (buys && buys.drafted > 0) {
    const buyAcc = Math.round(buys.played / buys.drafted * 100);
    const buyGrade = buyAcc >= 90 ? 'A' : buyAcc >= 80 ? 'B' : buyAcc >= 65 ? 'C' : 'D';
    console.log(`${C.bold}── Card Efficiency: ${tierColor(buyGrade)}${buyAcc}% (${buyGrade})${C.reset} ──${C.reset}`);
    console.log(`  Задрафтено: ${buys.drafted} | Сыграно: ${buys.played} | Мёртвых: ${buys.deadCount} (${buys.deadCost} MC draft)`);
    for (const dc of buys.deadCards.slice(0, 5)) {
      const kindLabel = dc.kind === 'action' ? `${C.red}action${C.reset}` : dc.kind === 'prod' ? 'prod' : dc.kind === 'event' ? 'event' : '';
      const kindStr = kindLabel ? ` [${kindLabel}]` : '';
      console.log(`  ${C.gray}  ×${C.reset} ${dc.name} (${dc.tier}${dc.score})${kindStr} — ${C.dim}не сыграна${C.reset}`);
    }
    console.log('');
  }

  // Corp
  if (setup?.corp) {
    const sc = setup.corp;
    const optStr = sc.optimal === true ? `${C.green} — оптимально${C.reset}`
      : sc.optimal === false ? `${C.yellow} — не оптимально (лучший: ${sc.bestName}, ${sc.bestScore})${C.reset}`
      : '';
    console.log(`${C.bold}── Corp Selection${optStr} ──${C.reset}`);
    if (sc.offered && sc.offered.length > 0) {
      const offStr = sc.offered.map(c => {
        const mark = c.name === sc.chosen ? `${C.bold}[${c.name}]${C.reset}` : c.name;
        return `${mark} (${c.tier}${c.score})`;
      }).join(', ');
      console.log(`  Offered: ${offStr}`);
    }
    console.log(`  Выбрана: ${C.bold}${sc.chosen}${C.reset} (${tierColor(sc.tier)}${sc.tier}${Math.round(sc.score)}${C.reset})`);
    console.log('');
  }

  // Preludes
  if (setup?.preludes && setup.preludes.picks.length > 0) {
    const allOptimal = setup.preludes.picks.every(p => p.optimal);
    const preludeLabel = allOptimal ? `${C.green}оптимально${C.reset}` : `${C.yellow}есть расхождения${C.reset}`;
    console.log(`${C.bold}── Prelude Selection — ${preludeLabel} ──${C.reset}`);
    for (const pick of setup.preludes.picks) {
      const offStr = pick.offered.map(c => {
        const mark = c.name === pick.chosen ? `${C.bold}[${c.name}]${C.reset}` : c.name;
        return `${mark} (${c.score})`;
      }).join(', ');
      if (pick.optimal) {
        console.log(`  ${C.green}✓${C.reset} ${pick.chosen} (${pick.score}) — лучший из [${offStr}]`);
      } else {
        console.log(`  ${C.yellow}✗${C.reset} ${pick.chosen} (${pick.score}) вместо ${C.green}${pick.best} (${pick.bestScore})${C.reset} из [${offStr}]`);
      }
    }
    console.log('');
  }

  // Timing
  if (data._oneShot) {
    console.log(`${C.bold}── Play Timing: ${C.gray}N/A (one-shot fetch)${C.reset} ──${C.reset}`);
    console.log('');
  } else if (timing && timing.issues.length > 0) {
    const tGrade = timing.score >= 85 ? 'A' : timing.score >= 70 ? 'B' : timing.score >= 55 ? 'C' : 'D';
    console.log(`${C.bold}── Play Timing: ${tierColor(tGrade)}${timing.score}% (${tGrade})${C.reset} ──${C.reset}`);
    for (const issue of timing.issues.slice(0, 8)) {
      console.log(`  ${severityIcon(issue.severity)} ${issue.card} ${issue.message}`);
    }
    console.log('');
  } else if (timing) {
    console.log(`${C.bold}── Play Timing: ${C.green}100% (A)${C.reset} ── без замечаний${C.reset}`);
    console.log('');
  }

  // Economy
  if (economy && economy.curve.length > 0) {
    // Check if any non-MC production is present
    const hasExtraProd = economy.curve.some(r => r.plantProd || r.energyProd || r.heatProd || r.steelProd || r.tiProd);
    console.log(`${C.bold}── Economy ──${C.reset}`);
    if (hasExtraProd) {
      console.log(`  ${C.dim}Gen | MC-prod |  TR | Steel | Ti  | Plant | Energy | Heat | Tableau${C.reset}`);
      for (const row of economy.curve) {
        console.log(`  ${C.gray}${pad(row.gen, 3)}${C.reset} | ${pad(row.mcProd, 7)} | ${pad(row.tr, 3)} | ${pad(row.steelProd || 0, 5)} | ${pad(row.tiProd || 0, 3)} | ${pad(row.plantProd || 0, 5)} | ${pad(row.energyProd || 0, 6)} | ${pad(row.heatProd || 0, 4)} | ${pad(row.tableauSize, 7)}`);
      }
    } else {
      console.log(`  ${C.dim}Gen | MC-prod |  TR | Cards | Tableau${C.reset}`);
      for (const row of economy.curve) {
        console.log(`  ${C.gray}${pad(row.gen, 3)}${C.reset} | ${pad(row.mcProd, 7)} | ${pad(row.tr, 3)} | ${pad(row.cardsInHand, 5)} | ${pad(row.tableauSize, 7)}`);
      }
    }
    if (economy.vpByGen.length > 0) {
      console.log(`\n  ${C.dim}VP по поколениям:${C.reset} ${economy.vpByGen.join(' → ')}`);
    }
    if (Object.keys(economy.opponents).length > 0) {
      console.log('');
      for (const [name, opp] of Object.entries(economy.opponents)) {
        // Show per-gen TR curve if available
        if (opp.curve && opp.curve.length > 0) {
          const trStr = opp.curve.map(r => `${r.tr}`).join('→');
          const vpStr = opp.vp ? ` | ${opp.vp} VP` : '';
          console.log(`  ${C.dim}${name}:${C.reset} TR ${trStr}${vpStr}`);
        } else {
          const vpStr = opp.vp ? `${opp.vp} VP` : `TR ${opp.tr}`;
          console.log(`  ${C.dim}${name}:${C.reset} ${vpStr}`);
        }
      }
    }
    // End-game comparison table
    if (economy.endComparison && Object.keys(economy.endComparison).length > 1) {
      console.log('');
      const hasVP = Object.values(economy.endComparison).some(ec => ec.vp > 0);
      const vpCol = hasVP ? `${pad('VP', 3)} │ ` : '';
      const vpHdr = hasVP ? `${pad('VP', 3)} │ ` : '';
      console.log(`  ${C.dim}${pad('Player', 14)} │ ${vpHdr}TR │ MC-prod │ Cards │ Col │ Steel │ Ti${C.reset}`);
      // Sort by VP desc (or TR desc if no VP)
      const sorted = Object.entries(economy.endComparison)
        .sort((a, b) => (b[1].vp || b[1].tr) - (a[1].vp || a[1].tr));
      for (const [name, ec] of sorted) {
        const isMe = name === '(me)';
        const labelPad = isMe ? pad(data.player, 14) : pad(name, 14);
        const style = isMe ? C.bold : C.dim;
        const vpStr = hasVP ? `${pad(ec.vp, 3)} │ ` : '';
        console.log(`  ${style}${labelPad}${C.reset} │ ${vpStr}${pad(ec.tr, 2)} │ ${pad(ec.mcProd, 7)} │ ${pad(ec.tableau, 5)} │ ${pad(ec.colonies, 3)} │ ${pad(ec.steelProd, 5)} │ ${pad(ec.tiProd, 2)}`);
      }
    }

    // Engine speed comparison vs winner (need 3+ snapshots for reliable rate)
    if (economy.opponents && data.result.place > 1) {
      const myCurve = economy.curve;
      if (myCurve && myCurve.length >= 3) {
        const myGens = myCurve[myCurve.length - 1].gen - myCurve[0].gen;
        const myTRRate = myGens > 0 ? (myCurve[myCurve.length - 1].tr - myCurve[0].tr) / myGens : 0;
        const winnerName = data.result.winner;
        const winnerOpp = economy.opponents[winnerName];
        if (winnerOpp?.curve?.length >= 3) {
          const wCurve = winnerOpp.curve;
          const wGens = wCurve[wCurve.length - 1].gen - wCurve[0].gen;
          const wTRRate = wGens > 0 ? (wCurve[wCurve.length - 1].tr - wCurve[0].tr) / wGens : 0;
          const diff = Math.round((wTRRate - myTRRate) * 10) / 10;
          if (diff > 0.5) {
            console.log(`  ${C.dim}Engine: ${winnerName} рос ${Math.round(wTRRate * 10) / 10} TR/gen vs ${Math.round(myTRRate * 10) / 10} — отставание ${diff}/gen${C.reset}`);
          }
        }
      }
    }
    console.log('');
  }

  // Actions
  if (actions) {
    console.log(`${C.bold}── Actions ──${C.reset}`);
    // Card plays and passes by gen — with card names if available
    const allGens = new Set([
      ...Object.keys(actions.cardPlaysByGen || {}),
      ...Object.keys(actions.passByGen || {}),
    ]);
    if (allGens.size > 0) {
      const gensSorted = [...allGens].map(Number).sort((a, b) => a - b);
      for (const g of gensSorted) {
        const plays = actions.cardPlaysByGen[g] || 0;
        const passes = actions.passByGen[g] || 0;
        const passStr = passes > 0 ? `, ${passes} пас${passes > 1 ? 'ов' : ''}` : '';
        // Show card names if myPlayed is available
        const playedCards = data.myPlayed?.[g];
        if (playedCards && playedCards.length > 0) {
          // Filter out corps/preludes/CEOs
          const projectCards = playedCards.filter(c => {
            const info = ALL_CARDS[c];
            if (!info) return true;
            return info.type !== 'corporation' && info.type !== 'prelude' && info.type !== 'ceo';
          });
          if (projectCards.length > 0) {
            const names = projectCards.map(c => {
              const r = getRating(c);
              return r ? `${c} (${r.tier}${r.score})` : c;
            });
            console.log(`  ${C.gray}Gen ${pad(g, 2)}:${C.reset} ${names.join(', ')}${passStr}`);
          } else if (plays > 0) {
            console.log(`  ${C.gray}Gen ${pad(g, 2)}:${C.reset} ${plays} карт${passStr}`);
          }
        } else {
          console.log(`  ${C.gray}Gen ${pad(g, 2)}:${C.reset} ${plays} карт${passStr}`);
        }
      }
    }
    const avgQStr = actions.avgCardScore != null ? ` | avg score ${actions.avgCardScore}` : '';
    // VP per card played
    const vpPerCard = actions.cardPlays > 0 && data.result.vp > 0
      ? ` | ${Math.round(data.result.vp / actions.cardPlays * 10) / 10} VP/card`
      : '';
    console.log(`  Итого: ${C.bold}${actions.cardPlays}${C.reset} карт (${actions.avgPerGen}/gen${avgQStr}${vpPerCard}), ${actions.passes} пасов, ${actions.converts} конверсий`);
    // Standard projects
    const spEntries = Object.entries(actions.standardProjects || {});
    if (spEntries.length > 0) {
      console.log(`  Стандартные проекты: ${spEntries.map(([n, c]) => `${n}×${c}`).join(', ')}`);
    }
    // Insights
    for (const ins of (actions.insights || [])) {
      const icon = ins.severity === 'medium' ? `${C.yellow}⚠${C.reset}` : `${C.dim}ℹ${C.reset}`;
      console.log(`  ${icon} ${ins.message}`);
    }
    console.log('');
  }

  // Tag distribution from tableau
  if (data.myTableau && data.myTableau.length > 5) {
    const tagCounts = {};
    let noTagCount = 0;
    for (const card of data.myTableau) {
      const info = ALL_CARDS[card];
      if (!info) continue;
      if (info.type === 'corporation' || info.type === 'prelude' || info.type === 'ceo') continue;
      const tags = info.tags || [];
      if (tags.length === 0) { noTagCount++; continue; }
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const topTags = sorted.slice(0, 8).map(([t, c]) => `${t} ${c}`).join(', ');
      const noTagStr = noTagCount > 0 ? ` | no-tag: ${noTagCount}` : '';
      console.log(`${C.bold}── Tags ──${C.reset}`);
      console.log(`  ${topTags}${noTagStr}`);
      console.log('');
    }
  }

  // Played cards (JSONL — показать tableau)
  if (data.playedByGen && Object.keys(data.playedByGen).length > 0) {
    console.log(`${C.bold}── Cards Played ──${C.reset}`);
    for (const [gen, cards] of Object.entries(data.playedByGen).sort((a, b) => a[0] - b[0])) {
      const rated = cards.map(c => {
        const r = getRating(c);
        return r ? `${c} (${r.tier}${r.score})` : c;
      });
      console.log(`  ${C.gray}Gen ${pad(gen, 2)}:${C.reset} ${rated.join(', ')}`);
    }
    console.log('');
  }

  // VP Sources / Win condition
  if (vpSources) {
    const s = vpSources.sources;
    const p = vpSources.pct;
    // Show VP source bar
    const bar = Object.entries(s).filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v} (${p[k]}%)`)
      .join(' | ');
    if (bar) {
      console.log(`${C.bold}── VP Sources ──${C.reset}`);
      console.log(`  ${bar}`);
    }
    // Win condition
    if (vpSources.winCondition) {
      const wc = vpSources.winCondition;
      if (wc.type === 'won') {
        console.log(`  ${C.green}Победа${C.reset} — основной источник: ${wc.topSource} (${wc.topVP} VP)`);
      } else if (wc.gap > 0) {
        const gaps = Object.entries(wc.comparison)
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, v]) => `${k} -${v}`)
          .join(', ');
        console.log(`  ${C.yellow}Проигрыш${C.reset} (-${wc.gap} VP vs ${wc.winnerName}) — отставание: ${gaps}`);
      }
    }
    // VP gap timeline
    if (vpSources.vpTimeline) {
      const vt = vpSources.vpTimeline;
      // vpByGen is 0-indexed (gen index from first observed gen)
      const startGen = data.endGen - vt.totalGens + 1;
      const behindGen = vt.firstBehindIdx >= 0 ? startGen + vt.firstBehindIdx : null;
      const maxGapGen = startGen + vt.maxGapIdx;
      const parts = [];
      if (behindGen != null) parts.push(`отстал с gen ${behindGen}`);
      parts.push(`макс. разрыв ${vt.maxGap} VP (gen ${maxGapGen})`);
      console.log(`  ${C.dim}Board VP: ${parts.join(', ')}${C.reset}`);
    }
    console.log('');
  }

  // Milestones & Awards
  if (ma) {
    const mParts = [];
    for (const m of ma.milestones) {
      if (m.mine) mParts.push(`${C.green}✓ ${m.name}${C.reset}`);
      else if (m.claimed) mParts.push(`${C.dim}${m.name} (${m.claimant})${C.reset}`);
    }
    const aParts = [];
    for (const a of ma.awards) {
      if (!a.funded) continue;
      const vpStr = a.vp > 0 ? `${C.green}+${a.vp} VP${C.reset}` : `${C.red}0 VP${C.reset}`;
      const myLabel = a.fundedByMe ? `${C.bold}${a.name}${C.reset}` : a.name;
      aParts.push(`${myLabel} (${vpStr}, ${a.myScore}/${a.topScore})`);
    }
    if (mParts.length > 0 || aParts.length > 0 || ma.insights.length > 0) {
      console.log(`${C.bold}── Milestones & Awards ──${C.reset}`);
      if (mParts.length > 0) console.log(`  Miles: ${mParts.join(' | ')}`);
      if (aParts.length > 0) console.log(`  Awards: ${aParts.join(' | ')}`);
      for (const ins of ma.insights) {
        const icon = ins.severity === 'high' ? `${C.yellow} !! ${C.reset}` : `${C.dim}  ! ${C.reset}`;
        console.log(`  ${icon}${ins.message}`);
      }
      console.log('');
    }
  }

  // Colonies
  if (colonies) {
    const parts = [];
    if (colonies.myColonies.length > 0) {
      parts.push(colonies.myColonies.map(c => `${c.name}${c.count > 1 ? '×' + c.count : ''}`).join(', '));
    }
    if (parts.length > 0 || colonies.insights.length > 0) {
      console.log(`${C.bold}── Colonies (${colonies.myCount}) ──${C.reset}`);
      if (parts.length > 0) console.log(`  Мои: ${parts.join('')}`);
      for (const ins of colonies.insights) {
        const icon = ins.severity === 'medium' ? `${C.yellow} !! ${C.reset}` : `${C.dim}  ℹ ${C.reset}`;
        console.log(`  ${icon}${ins.message}`);
      }
      console.log('');
    }
  }

  // Turmoil (if available)
  if (data.turmoilData || data.hasTurmoil) {
    const td = data.turmoilData;
    if (td) {
      const chairName = td.chairman ? (data.players.find(p => p.color === td.chairman)?.name || td.chairman) : 'neutral';
      console.log(`${C.bold}── Turmoil ──${C.reset}`);
      console.log(`  Ruling: ${td.ruling || '?'} | Dominant: ${td.dominant || '?'} | Chairman: ${chairName}`);
      console.log('');
    }
  }

  // Overall Grade with breakdown
  console.log(`${'═'.repeat(56)}`);
  if (grade.score === null) {
    console.log(`${C.bold}  Overall Grade: ${C.gray}N/A (недостаточно данных)${C.reset}`);
  } else {
    console.log(`${C.bold}  Overall Grade: ${tierColor(grade.letter)}${grade.letter} (${grade.score}/100)${C.reset}`);
  }
  if (grade.breakdown) {
    const parts = [];
    const bd = grade.breakdown;
    if (bd.draft) parts.push(`Draft ${bd.draft.score}%`);
    if (bd.buys) parts.push(`Cards ${bd.buys.score}%`);
    if (bd.timing) parts.push(`Timing ${bd.timing.score}%`);
    if (bd.economy) {
      const turmoilMark = bd.economy.turmoil ? ', turmoil' : '';
      parts.push(`Econ ${bd.economy.score}% (${bd.economy.trPerGen} TR/gen${turmoilMark})`);
    }
    if (bd.result) {
      const placeStr = bd.result.place === 1 ? '1st' : bd.result.place === 2 ? '2nd' : bd.result.place === 3 ? '3rd' : bd.result.place + 'th';
      parts.push(`${placeStr} ${bd.result.bonus >= 0 ? '+' : ''}${bd.result.bonus}`);
    }
    console.log(`  ${C.dim}${parts.join(' | ')}${C.reset}`);
  }
  console.log(`${'═'.repeat(56)}`);
  console.log('');
}

function saveJSON(data, draft, buys, setup, timing, economy, grade, actions, vpSources, ma, colonies) {
  const outDir = path.join(ROOT, 'data', 'game_logs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = path.join(outDir, `analysis_${ts}.json`);

  const report = {
    gameId: data.gameId,
    player: data.player,
    corp: data.corp,
    endGen: data.endGen,
    map: data.map,
    result: data.result,
    draft: draft && draft.totalPicks > 0 ? {
      accuracy: Math.round(draft.accuracy * 100) / 100,
      evLoss: draft.totalEVLoss,
      totalPicks: draft.totalPicks,
      matches: draft.matches,
      deadPicks: draft.deadPicks,
      issues: draft.issues,
    } : null,
    buys: buys && buys.drafted > 0 ? {
      drafted: buys.drafted,
      played: buys.played,
      deadCards: buys.deadCount,
      deadCost: buys.deadCost,
    } : null,
    corp_selection: setup?.corp || null,
    timing: timing ? {
      score: timing.score,
      note: timing.note || null,
      issues: timing.issues,
      hasHandData: Object.keys(data.cardArrivalGen || {}).length > 0,
    } : null,
    economy: economy?.curve ? {
      mcProdCurve: economy.curve.map(r => ({ gen: r.gen, mcProd: r.mcProd })),
      trCurve: economy.curve.map(r => ({ gen: r.gen, tr: r.tr })),
      prodCurve: economy.curve.map(r => ({
        gen: r.gen, steel: r.steelProd || 0, ti: r.tiProd || 0,
        plant: r.plantProd || 0, energy: r.energyProd || 0, heat: r.heatProd || 0,
      })),
      vpByGen: economy.vpByGen,
    } : null,
    actions: actions ? {
      cardPlays: actions.cardPlays,
      cardPlaysByGen: actions.cardPlaysByGen,
      passes: actions.passes,
      passByGen: actions.passByGen,
      standardProjects: actions.standardProjects,
      converts: actions.converts,
      insights: actions.insights,
    } : null,
    vpSources: vpSources || null,
    milestonesAwards: ma ? {
      milestones: ma.milestones,
      awards: ma.awards.map(a => ({ name: a.name, funded: a.funded, funder: a.funder, myPlace: a.myPlace, vp: a.vp, myScore: a.myScore, topScore: a.topScore })),
      insights: ma.insights,
    } : null,
    colonies: colonies ? { myCount: colonies.myCount, myColonies: colonies.myColonies, insights: colonies.insights } : null,
    overallGrade: grade.score,
    overallLetter: grade.letter,
    gradeBreakdown: grade.breakdown || null,
    analyzedAt: new Date().toISOString(),
    sourceFile: process.argv[2],
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`${C.dim}Отчёт сохранён: ${outPath}${C.reset}`);
}

// ══════════════════════════════════════════════════════════════
// §10. ANALYZE ONE GAME (reusable)
// ══════════════════════════════════════════════════════════════

function analyzeOneData(data, filePath, silent) {
  const draft = analyzeDraft(data);
  const buys = analyzeBuys(data);
  const setup = analyzeSetup(data);
  const timing = analyzeTiming(data);
  const economy = analyzeEconomy(data);
  const actions = analyzeActions(data);
  const vpSources = analyzeVPSources(data);
  const ma = analyzeMilestonesAwards(data);
  const colonies = analyzeColonies(data);
  const grade = calcGrade(draft, buys, timing, economy, data.result);

  if (!silent) {
    printReport(data, draft, buys, setup, timing, economy, grade, actions, vpSources, ma, colonies);
  }

  const dateMatch = path.basename(filePath).match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : '';

  return { filePath, data, draft, buys, setup, timing, economy, grade, actions, vpSources, ma, colonies, date };
}

function analyzeOne(filePath, silent) {
  const parsed = parseInput(filePath);

  // Combined watcher export → array of player data objects
  if (Array.isArray(parsed)) {
    const results = [];
    for (const data of parsed) {
      if (!silent) {
        console.log(`\n${C.cyan}━━━ ${data.player} (${data.corp}) ━━━${C.reset}`);
      }
      results.push(analyzeOneData(data, filePath, silent));
    }
    return results;
  }

  return analyzeOneData(parsed, filePath, silent);
}

// ══════════════════════════════════════════════════════════════
// §11. --all MODE — scan Downloads, summary table, trends
// ══════════════════════════════════════════════════════════════

function findDownloadsDir() {
  // Windows Downloads
  const candidates = [
    path.join(process.env.USERPROFILE || '', 'Downloads'),
    path.join(process.env.HOME || '', 'Downloads'),
    '/c/Users/Ruslan/Downloads',
  ];
  for (const d of candidates) {
    if (d && fs.existsSync(d)) return d;
  }
  return null;
}

function scanAllExports(flags) {
  flags = flags || {};
  const downloadsDir = findDownloadsDir();
  if (!downloadsDir) {
    console.error('Не найдена папка Downloads');
    process.exit(1);
  }

  const dlFiles = fs.readdirSync(downloadsDir)
    .filter(f => f.startsWith('tm-game-') && f.endsWith('.json'))
    .map(f => path.join(downloadsDir, f));

  // Also scan data/game_logs for gamelog_v2 exports
  const logsDir = path.join(ROOT, 'data', 'game_logs');
  const logFiles = fs.existsSync(logsDir)
    ? fs.readdirSync(logsDir)
      .filter(f => f.startsWith('tm-log-') && f.endsWith('.json'))
      .map(f => path.join(logsDir, f))
    : [];

  const files = [...dlFiles, ...logFiles].sort();

  if (files.length === 0) {
    console.error('Экспортов не найдено');
    process.exit(1);
  }

  console.log(`${C.dim}Найдено ${files.length} экспортов (Downloads: ${dlFiles.length}, Logs: ${logFiles.length})${C.reset}`);
  console.log(`${C.dim}Ratings: ${Object.keys(RATINGS).length} карт | Effects: ${Object.keys(FX).length} карт${C.reset}`);
  console.log('');

  // Анализируем все — включаем и с draft, и без (gamelog_v2)
  const results = [];
  const skipped = [];

  for (const f of files) {
    try {
      const r = analyzeOne(f, true);
      // Accept games with draft data OR with economy/actions data (gamelog_v2)
      if (Array.isArray(r)) {
        for (const ri of r) {
          if (ri.draft?.totalPicks > 0 || ri.economy?.curve?.length > 0 || ri.actions) {
            results.push(ri);
          }
        }
      } else if (r.draft?.totalPicks > 0 || r.economy?.curve?.length > 0 || r.actions) {
        results.push(r);
      } else {
        skipped.push(path.basename(f));
      }
    } catch (e) {
      skipped.push(path.basename(f) + ' [ошибка]');
    }
  }

  // Apply filters
  const vsFilter = typeof flags['--vs'] === 'string' ? flags['--vs'].toLowerCase() : null;
  const corpFilter = typeof flags['--corp'] === 'string' ? flags['--corp'].toLowerCase() : null;

  if (vsFilter) {
    const before = results.length;
    const filtered = results.filter(r => {
      const opponents = (r.data.players || []).filter(p => p.color !== r.data.myColor);
      return opponents.some(p => (p.name || '').toLowerCase().includes(vsFilter));
    });
    results.length = 0;
    results.push(...filtered);
    console.log(`${C.dim}Фильтр --vs=${flags['--vs']}: ${results.length}/${before} игр${C.reset}`);
  }
  if (corpFilter) {
    const before = results.length;
    const filtered = results.filter(r => (r.data.corp || '').toLowerCase().includes(corpFilter));
    results.length = 0;
    results.push(...filtered);
    console.log(`${C.dim}Фильтр --corp=${flags['--corp']}: ${results.length}/${before} игр${C.reset}`);
  }

  // Dedup by game signature (corp + endGen + VP + map + date)
  const seen = new Set();
  const deduped = [];
  for (const r of results) {
    const key = `${r.data.corp}|${r.data.endGen}|${r.data.result.vp}|${r.data.map}|${r.date}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }
  const dupCount = results.length - deduped.length;
  results.length = 0;
  results.push(...deduped);

  if (results.length === 0) {
    console.log('Нет данных для анализа.');
    if (skipped.length > 0) {
      console.log(`${C.dim}Пропущено: ${skipped.join(', ')}${C.reset}`);
    }
    return;
  }

  // Сортировка по дате
  results.sort((a, b) => a.date.localeCompare(b.date));

  // ── Summary Table ──
  console.log(`${C.bold}${'═'.repeat(100)}${C.reset}`);
  console.log(`${C.bold}  TM Replay Summary — ${results.length} игр${C.reset}${dupCount > 0 ? ` ${C.dim}(${dupCount} дубликатов убрано)${C.reset}` : ''}`);
  console.log(`${'═'.repeat(100)}`);
  console.log('');

  const hdr = [
    pad('Дата', 10), pad('Корп', 18), pad('Карта', 12),
    pad('Gen', 3), pad('VP', 3), pad('Место', 5),
    pad('Draft%', 6), pad('Effic%', 6), pad('Dead', 4),
    pad('Cards', 5), pad('Timing', 6), pad('Grade', 5),
  ].join(' │ ');
  console.log(`  ${C.dim}${hdr}${C.reset}`);
  console.log(`  ${'─'.repeat(hdr.length)}`);

  for (const r of results) {
    const d = r.data;
    const draftPct = r.draft && r.draft.totalPicks > 0 ? Math.round(r.draft.accuracy * 100) : '-';
    const efficPct = r.buys && r.buys.drafted > 0 ? Math.round(r.buys.played / r.buys.drafted * 100) : '-';
    const deadCount = r.buys ? r.buys.deadCount : '-';
    const timingPct = r.timing && !d._oneShot ? r.timing.score : '-';
    const cardsPlayed = r.actions ? r.actions.cardPlays : '-';
    const placeIcon = d.result.place === 1 ? `${C.green}  1-е${C.reset}` : d.result.place > 0 ? `${C.yellow}  ${d.result.place}-е ${C.reset}` : `${C.gray}  ?  ${C.reset}`;

    const row = [
      pad(r.date, 10),
      pad(d.corp.slice(0, 18), 18),
      pad((d.map || '?').slice(0, 12), 12),
      pad(d.endGen || '-', 3),
      pad(d.result.vp || '-', 3),
      placeIcon,
      pad(draftPct, 6),
      pad(efficPct, 6),
      pad(deadCount, 4),
      pad(cardsPlayed, 5),
      pad(timingPct, 6),
      `${tierColor(r.grade.letter)}${pad(r.grade.letter, 3)}${pad(r.grade.score != null ? r.grade.score : '-', 3)}${C.reset}`,
    ].join(' │ ');
    console.log(`  ${row}`);
  }
  console.log('');

  // ── Trends ──
  printTrends(results);

  // ── Skipped ──
  if (skipped.length > 0) {
    console.log(`${C.dim}Пропущено: ${skipped.length} файлов${C.reset}`);
  }
  console.log('');
}

function printTrends(results) {
  console.log(`${C.bold}── Тренды (${results.length} игр) ──${C.reset}`);

  // Averages
  const draftAccs = results.filter(r => r.draft?.totalPicks > 0).map(r => r.draft.accuracy);
  const evLosses = results.filter(r => r.draft?.totalPicks > 0).map(r => r.draft.totalEVLoss);
  const effics = results.filter(r => r.buys?.drafted > 0).map(r => r.buys.played / r.buys.drafted);
  const timings = results.filter(r => r.timing).map(r => r.timing.score);
  const grades = results.filter(r => r.grade.score !== null).map(r => r.grade.score);
  const deadCounts = results.filter(r => r.buys).map(r => r.buys.deadCount);
  const deadCosts = results.filter(r => r.buys).map(r => r.buys.deadCost);

  const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const trend = arr => {
    if (arr.length < 2) return '─';
    const first = avg(arr.slice(0, Math.ceil(arr.length / 2)));
    const second = avg(arr.slice(Math.floor(arr.length / 2)));
    const delta = second - first;
    if (Math.abs(delta) < 1) return '─';
    return delta > 0 ? `${C.green}▲${C.reset}` : `${C.red}▼${C.reset}`;
  };

  // Win rate
  const wins = results.filter(r => r.data.result.place === 1).length;
  const winRate = Math.round(wins / results.length * 100);

  // Place distribution
  const places = [0, 0, 0, 0]; // idx 0 unused, 1=1st, 2=2nd, 3=3rd
  for (const r of results) {
    const p = r.data.result.place;
    if (p >= 1 && p <= 3) places[p]++;
  }
  const avgVP = Math.round(avg(results.map(r => r.data.result.vp || 0)));
  const avgGen = Math.round(avg(results.map(r => r.data.endGen || 0)) * 10) / 10;

  console.log(`  Win rate: ${C.bold}${winRate}%${C.reset} (${wins}/${results.length}) | 1st: ${places[1]}  2nd: ${places[2]}  3rd: ${places[3]}`);
  console.log(`  Avg VP: ${C.bold}${avgVP}${C.reset} | Avg gens: ${C.bold}${avgGen}${C.reset}`);
  console.log('');

  const metrics = [
    ['Draft Accuracy', draftAccs.map(a => Math.round(a * 100)), '%'],
    ['EV Loss / game', evLosses.map(Math.round), ''],
    ['Card Efficiency', effics.map(e => Math.round(e * 100)), '%'],
    ['Dead cards / game', deadCounts, ''],
    ['Dead MC / game', deadCosts, ' MC'],
    ['Timing', timings, '%'],
    ['Overall Grade', grades, ''],
  ];

  console.log(`  ${C.dim}${pad('Метрика', 20)} │ ${pad('Средн.', 7)} │ ${pad('Мин', 5)} │ ${pad('Макс', 5)} │ Тренд${C.reset}`);
  console.log(`  ${'─'.repeat(55)}`);

  for (const [name, values, suffix] of metrics) {
    if (values.length === 0) continue;
    const a = Math.round(avg(values));
    const mn = Math.round(Math.min(...values));
    const mx = Math.round(Math.max(...values));
    const t = trend(values);
    console.log(`  ${pad(name, 20)} │ ${pad(a + suffix, 7)} │ ${pad(mn, 5)} │ ${pad(mx, 5)} │ ${t}`);
  }
  console.log('');

  // Per-game grade sparkline (only scored games)
  const scored = results.filter(r => r.grade.score != null);
  if (scored.length >= 3) {
    const sparkline = scored.map(r =>
      `${tierColor(r.grade.letter)}${r.grade.score}${C.reset}`
    ).join(' → ');
    console.log(`  Grade trend (${scored.length} игр): ${sparkline}`);
    console.log('');
  }

  // Most common dead cards (across all games)
  const deadCardFreq = {};
  for (const r of results) {
    if (!r.buys) continue;
    for (const dc of r.buys.deadCards) {
      deadCardFreq[dc.name] = (deadCardFreq[dc.name] || 0) + 1;
    }
  }
  const topDead = Object.entries(deadCardFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (topDead.length > 0) {
    console.log(`  ${C.bold}Чаще всего не сыграны:${C.reset}`);
    for (const [name, count] of topDead) {
      const r = getRating(name);
      const tier = r ? `${r.tier}${r.score}` : '?';
      console.log(`    ${count}× ${name} (${tier})`);
    }
    console.log('');
  }

  // Most common corps with win rate
  const corpFreq = {};
  for (const r of results) {
    const c = r.data.corp;
    if (c) {
      if (!corpFreq[c]) corpFreq[c] = { count: 0, wins: 0, vpSum: 0 };
      corpFreq[c].count++;
      if (r.data.result.place === 1) corpFreq[c].wins++;
      corpFreq[c].vpSum += r.data.result.vp || 0;
    }
  }
  const topCorps = Object.entries(corpFreq).sort((a, b) => b[1].count - a[1].count);
  if (topCorps.length > 0) {
    console.log(`  ${C.bold}Корпорации:${C.reset}`);
    for (const [name, info] of topCorps) {
      const r = getRating(name);
      const tier = r ? ` (${r.tier}${r.score})` : '';
      const wr = info.count > 0 ? Math.round(info.wins / info.count * 100) : 0;
      const avgVP = Math.round(info.vpSum / info.count);
      console.log(`    ${info.count}× ${name}${tier} — ${info.wins}W/${info.count} (${wr}%) | avg ${avgVP} VP`);
    }
    console.log('');
  }

  // Most played cards across games (from tableau)
  const cardFreq = {};
  for (const r of results) {
    const tableau = r.data.myTableau || [];
    for (const card of tableau) {
      const info = ALL_CARDS[card];
      if (info && (info.type === 'corporation' || info.type === 'prelude' || info.type === 'ceo')) continue;
      cardFreq[card] = (cardFreq[card] || 0) + 1;
    }
  }
  const topPlayed = Object.entries(cardFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (topPlayed.length > 0 && results.length >= 3) {
    console.log(`  ${C.bold}Топ карты (сыграны):${C.reset}`);
    for (const [name, count] of topPlayed) {
      const r = getRating(name);
      const tier = r ? ` (${r.tier}${r.score})` : '';
      console.log(`    ${count}× ${name}${tier}`);
    }
    console.log('');
  }
}

// ══════════════════════════════════════════════════════════════
// §12. FETCH BATCH MODE — анализ скачанных через fetch-game.js
// ══════════════════════════════════════════════════════════════

function scanFetchedGames() {
  const logsDir = path.join(ROOT, 'data', 'game_logs');
  if (!fs.existsSync(logsDir)) {
    console.error('Нет директории data/game_logs');
    process.exit(1);
  }

  const files = fs.readdirSync(logsDir)
    .filter(f => f.startsWith('tm-fetch-') && f.endsWith('.json'))
    .map(f => path.join(logsDir, f))
    .sort();

  if (files.length === 0) {
    console.error('Нет fetched игр в data/game_logs/');
    process.exit(1);
  }

  console.log(`${C.dim}Найдено ${files.length} fetched игр в data/game_logs/${C.reset}`);
  console.log(`${C.dim}Ratings: ${Object.keys(RATINGS).length} карт | Catalog: ${Object.keys(ALL_CARDS).length} карт${C.reset}`);
  console.log('');

  // Собираем все игры, каждая игра → массив игроков (combined format)
  const games = [];

  for (const f of files) {
    try {
      const parsed = parseInput(f);
      const players = Array.isArray(parsed) ? parsed : [parsed];
      const fname = path.basename(f);
      const gameIdMatch = fname.match(/tm-fetch-(g[a-f0-9]+)-gen(\d+)/);
      const gameId = gameIdMatch ? gameIdMatch[1] : '?';
      const endGen = gameIdMatch ? parseInt(gameIdMatch[2]) : 0;

      games.push({ gameId, endGen, players, file: fname });
    } catch (e) {
      console.log(`  ${C.red}Ошибка:${C.reset} ${path.basename(f)}: ${e.message}`);
    }
  }

  // ── Summary Table ──
  console.log(`${C.bold}${'═'.repeat(90)}${C.reset}`);
  console.log(`${C.bold}  Fetched Games Summary — ${games.length} игр, ${games.reduce((s, g) => s + g.players.length, 0)} игроков${C.reset}`);
  console.log(`${'═'.repeat(90)}`);
  console.log('');

  // Таблица по играм
  const hdr = [
    pad('Game', 16), pad('Map', 10), pad('Gen', 3),
    pad('1st', 20), pad('VP', 3),
    pad('2nd', 20), pad('VP', 3),
    pad('3rd', 20), pad('VP', 3),
  ].join(' │ ');
  console.log(`  ${C.dim}${hdr}${C.reset}`);
  console.log(`  ${'─'.repeat(hdr.length)}`);

  const allPlayers = []; // flat list for stats

  for (const g of games) {
    // Сортировать по VP
    const sorted = g.players
      .map(p => ({
        name: p.player,
        corp: p.corp,
        vp: p.result.vp || 0,
        place: p.result.place,
        map: p.map || '?',
        endGen: p.endGen,
        myTableau: p.myTableau,
      }))
      .sort((a, b) => b.vp - a.vp);

    for (const p of sorted) {
      allPlayers.push({ ...p, gameId: g.gameId });
    }

    const p1 = sorted[0] || {};
    const p2 = sorted[1] || {};
    const p3 = sorted[2] || {};

    const fmt = (p) => p.name ? `${(p.name || '').slice(0, 12)}/${(p.corp || '').slice(0, 7)}` : '';

    const row = [
      pad(g.gameId.slice(0, 16), 16),
      pad((p1.map || '?').slice(0, 10), 10),
      pad(g.endGen, 3),
      pad(fmt(p1), 20), pad(p1.vp || '-', 3),
      pad(fmt(p2), 20), pad(p2.vp || '-', 3),
      pad(fmt(p3), 20), pad(p3.vp || '-', 3),
    ].join(' │ ');
    console.log(`  ${row}`);
  }
  console.log('');

  // ── Stats ──
  printFetchStats(games, allPlayers);
}

function printFetchStats(games, allPlayers) {
  console.log(`${C.bold}── Статистика (${games.length} игр) ──${C.reset}`);
  console.log('');

  // Map distribution
  const mapFreq = {};
  for (const g of games) {
    const m = g.players[0]?.map || '?';
    mapFreq[m] = (mapFreq[m] || 0) + 1;
  }
  console.log(`  ${C.bold}Карты:${C.reset} ${Object.entries(mapFreq).map(([m, c]) => `${m} (${c})`).join(', ')}`);

  // Gen distribution
  const gens = games.map(g => g.endGen).filter(Boolean);
  const avgGen = gens.length > 0 ? (gens.reduce((a, b) => a + b, 0) / gens.length).toFixed(1) : '?';
  console.log(`  ${C.bold}Поколений:${C.reset} среднее ${avgGen} (мин ${Math.min(...gens)}, макс ${Math.max(...gens)})`);

  // VP stats
  const vps = allPlayers.filter(p => p.vp > 0).map(p => p.vp);
  const avgVP = vps.length > 0 ? Math.round(vps.reduce((a, b) => a + b, 0) / vps.length) : 0;
  const winnerVPs = allPlayers.filter(p => p.place === 1).map(p => p.vp);
  const avgWinVP = winnerVPs.length > 0 ? Math.round(winnerVPs.reduce((a, b) => a + b, 0) / winnerVPs.length) : 0;
  console.log(`  ${C.bold}VP:${C.reset} средний ${avgVP} | средний победитель ${avgWinVP}`);
  console.log('');

  // Corp win rates
  const corpStats = {};
  for (const p of allPlayers) {
    if (!p.corp) continue;
    if (!corpStats[p.corp]) corpStats[p.corp] = { games: 0, wins: 0, totalVP: 0 };
    corpStats[p.corp].games++;
    corpStats[p.corp].totalVP += p.vp || 0;
    if (p.place === 1) corpStats[p.corp].wins++;
  }

  const corpList = Object.entries(corpStats)
    .sort((a, b) => b[1].games - a[1].games);

  console.log(`  ${C.bold}Корпорации (${corpList.length} уникальных):${C.reset}`);
  console.log(`  ${C.dim}${pad('Корпорация', 28)} │ ${pad('Игр', 3)} │ ${pad('Побед', 5)} │ ${pad('WR%', 4)} │ ${pad('Avg VP', 6)} │ Tier${C.reset}`);
  console.log(`  ${'─'.repeat(65)}`);

  for (const [corp, s] of corpList.slice(0, 20)) {
    const wr = s.games > 0 ? Math.round(s.wins / s.games * 100) : 0;
    const avgV = s.games > 0 ? Math.round(s.totalVP / s.games) : 0;
    const r = getRating(corp);
    const tier = r ? `${r.tier}${r.score}` : '?';
    const wrColor = wr >= 50 ? C.green : wr >= 30 ? C.yellow : C.gray;
    console.log(`  ${pad(corp.slice(0, 28), 28)} │ ${pad(s.games, 3)} │ ${pad(s.wins, 5)} │ ${wrColor}${pad(wr, 3)}%${C.reset} │ ${pad(avgV, 6)} │ ${tier}`);
  }
  console.log('');

  // Player stats (unique players across all games)
  const playerStats = {};
  for (const p of allPlayers) {
    if (!p.name) continue;
    if (!playerStats[p.name]) playerStats[p.name] = { games: 0, wins: 0, totalVP: 0 };
    playerStats[p.name].games++;
    playerStats[p.name].totalVP += p.vp || 0;
    if (p.place === 1) playerStats[p.name].wins++;
  }

  const playerList = Object.entries(playerStats)
    .sort((a, b) => b[1].games - a[1].games);

  console.log(`  ${C.bold}Игроки (${playerList.length} уникальных):${C.reset}`);
  console.log(`  ${C.dim}${pad('Игрок', 16)} │ ${pad('Игр', 3)} │ ${pad('Побед', 5)} │ ${pad('WR%', 4)} │ ${pad('Avg VP', 6)}${C.reset}`);
  console.log(`  ${'─'.repeat(45)}`);

  for (const [name, s] of playerList) {
    const wr = s.games > 0 ? Math.round(s.wins / s.games * 100) : 0;
    const avgV = s.games > 0 ? Math.round(s.totalVP / s.games) : 0;
    const wrColor = wr >= 50 ? C.green : wr >= 30 ? C.yellow : C.gray;
    console.log(`  ${pad(name.slice(0, 16), 16)} │ ${pad(s.games, 3)} │ ${pad(s.wins, 5)} │ ${wrColor}${pad(wr, 3)}%${C.reset} │ ${pad(avgV, 6)}`);
  }
  console.log('');

  // Tableau analysis — most played cards across all players
  const cardFreq = {};
  for (const p of allPlayers) {
    if (!p.myTableau) continue;
    for (const c of p.myTableau) {
      if (!cardFreq[c]) cardFreq[c] = { count: 0, wins: 0 };
      cardFreq[c].count++;
      if (p.place === 1) cardFreq[c].wins++;
    }
  }

  const topCards = Object.entries(cardFreq)
    .filter(([_, s]) => s.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15);

  if (topCards.length > 0) {
    console.log(`  ${C.bold}Популярные карты (3+ игр):${C.reset}`);
    console.log(`  ${C.dim}${pad('Карта', 28)} │ ${pad('Раз', 3)} │ ${pad('Win', 3)} │ ${pad('WR%', 4)} │ Tier${C.reset}`);
    console.log(`  ${'─'.repeat(52)}`);
    for (const [card, s] of topCards) {
      const wr = s.count > 0 ? Math.round(s.wins / s.count * 100) : 0;
      const r = getRating(card);
      const tier = r ? `${r.tier}${r.score}` : '?';
      console.log(`  ${pad(card.slice(0, 28), 28)} │ ${pad(s.count, 3)} │ ${pad(s.wins, 3)} │ ${pad(wr, 3)}% │ ${tier}`);
    }
    console.log('');
  }
}

// ══════════════════════════════════════════════════════════════
// §13. MAIN
// ══════════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);
  const flags = {};
  const positional = [];
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, val] = arg.includes('=') ? arg.split('=', 2) : [arg, true];
      flags[key] = val;
    } else if (arg === '-a') flags['--all'] = true;
    else if (arg === '-f') flags['--fetch'] = true;
    else positional.push(arg);
  }

  if (flags['--help'] || flags['-h']) {
    console.log(`${C.bold}TM Replay Analyzer${C.reset} — анализ решений по логам Terraforming Mars\n`);
    console.log('Использование:');
    console.log('  node scripts/replay-analyzer.js <file>              — анализ одной игры');
    console.log('  node scripts/replay-analyzer.js --all               — все экспорты');
    console.log('  node scripts/replay-analyzer.js --all --vs=Simon    — только игры против Simon');
    console.log('  node scripts/replay-analyzer.js --fetch             — fetched игры');
    console.log('');
    console.log('Флаги:');
    console.log('  --all, -a       Все экспорты из Downloads + data/game_logs');
    console.log('  --fetch, -f     Fetched игры из data/game_logs/tm-fetch-*');
    console.log('  --vs=NAME       Фильтр: только игры с оппонентом NAME');
    console.log('  --corp=NAME     Фильтр: только игры с корпорацией NAME');
    console.log('  --help          Показать эту справку');
    process.exit(0);
  }

  const input = positional[0] || (flags['--all'] ? '--all' : flags['--fetch'] ? '--fetch' : null);

  if (input === '--all' || flags['--all']) {
    scanAllExports(flags);
    return;
  }

  if (input === '--fetch' || flags['--fetch']) {
    scanFetchedGames();
    return;
  }

  if (!input) {
    console.error('Использование:');
    console.error('  node scripts/replay-analyzer.js <path-to-game-log>   — анализ одной игры');
    console.error('  node scripts/replay-analyzer.js --all                — все экспорты');
    console.error('  node scripts/replay-analyzer.js --help               — справка');
    process.exit(1);
  }

  const filePath = path.resolve(input);
  if (!fs.existsSync(filePath)) {
    console.error(`Файл не найден: ${filePath}`);
    process.exit(1);
  }

  console.log(`${C.dim}Загрузка: ${filePath}${C.reset}`);
  console.log(`${C.dim}Ratings: ${Object.keys(RATINGS).length} карт | Effects: ${Object.keys(FX).length} карт | Catalog: ${Object.keys(ALL_CARDS).length} карт${C.reset}`);

  const r = analyzeOne(filePath, false);
  // Combined watcher → array of results
  if (Array.isArray(r)) {
    for (const ri of r) {
      saveJSON(ri.data, ri.draft, ri.buys, ri.setup, ri.timing, ri.economy, ri.grade, ri.actions, ri.vpSources, ri.ma, ri.colonies);
    }
  } else {
    saveJSON(r.data, r.draft, r.buys, r.setup, r.timing, r.economy, r.grade, r.actions, r.vpSources, r.ma, r.colonies);
  }
}

main();
