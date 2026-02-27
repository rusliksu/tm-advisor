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
    // Combined watcher export — contains .players array of individual exports
    if (raw._combined && Array.isArray(raw.players)) {
      return raw.players.map(p => parseExtensionExportObj(p));
    }
    return parseExtensionExportObj(raw);
  }
  if (ext === '.jsonl') return parseJSONL(filePath);
  throw new Error(`Неизвестный формат: ${ext}. Ожидается .json или .jsonl`);
}

function parseExtensionExportObj(raw) {
  if (raw.version !== 4) console.warn(`  [!] Ожидается version 4, получено ${raw.version}`);

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
    gameDuration: raw.gameDuration,
    _oneShot: !!raw._oneShot,
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
  const types = round.offered.map(c => cardType(c.name));
  if (types.some(t => t === 'corporation')) return 'corp';
  if (types.every(t => t === 'prelude')) return 'prelude';
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

    const best = round.offered.reduce((a, b) => (a.total > b.total ? a : b));
    const takenCard = round.offered.find(c => c.name === round.taken);
    const takenScore = takenCard?.total ?? 0;
    const bestScore = best.total;
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
  for (const cardName of projects) {
    if (playedSet.has(cardName)) continue;
    const r = getRating(cardName);
    deadCards.push({ name: cardName, score: r?.score || 0, tier: r?.tier || '?' });
  }

  const projectsPlayed = projects.filter(c => playedSet.has(c));

  return {
    drafted: projects.length,
    played: projectsPlayed.length,
    deadCards,
    deadCount: deadCards.length,
    deadCost: deadCards.length * 3,
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
        const offeredCorps = round.offered.filter(c => cardType(c.name) === 'corporation');
        const best = offeredCorps.length > 0
          ? offeredCorps.reduce((a, b) => (a.total > b.total ? a : b))
          : null;
        const chosenCard = round.offered.find(c => c.name === round.taken);
        const isCorpPick = cardType(round.taken) === 'corporation';

        result.corp = {
          chosen: data.corp,
          score: chosenCard?.total || getRating(data.corp)?.score || 0,
          tier: getRating(data.corp)?.tier || '?',
          offered: offeredCorps.map(c => ({ name: c.name, score: Math.round(c.total), tier: c.tier || getRating(c.name)?.tier || '?' })),
          optimal: best && isCorpPick ? round.taken === best.name : null,
          bestName: best?.name || null,
          bestScore: best ? Math.round(best.total) : null,
        };
      }

      if (type === 'prelude' && round.taken) {
        // Прелюд раунды — собираем все пики
        if (!result.preludes) result.preludes = { picks: [], allOffered: [] };
        const best = round.offered.reduce((a, b) => (a.total > b.total ? a : b));
        const takenCard = round.offered.find(c => c.name === round.taken);
        result.preludes.picks.push({
          chosen: round.taken,
          score: takenCard ? Math.round(takenCard.total) : 0,
          best: best.name,
          bestScore: Math.round(best.total),
          optimal: round.taken === best.name,
          offered: round.offered.map(c => ({ name: c.name, score: Math.round(c.total) })),
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

  const { frozenCardScores = {}, myColor, endGen, myTableau, snapshots, playedByGen } = data;
  const issues = [];

  // Собрать карты с gen, когда они были сыграны
  const myCards = {};

  if (Object.keys(frozenCardScores).length > 0) {
    // Extension export — берём из frozenCardScores
    for (const [key, val] of Object.entries(frozenCardScores)) {
      if (key.startsWith(myColor + ':')) {
        myCards[key.slice(myColor.length + 1)] = val;
      }
    }
    for (const [key, val] of Object.entries(frozenCardScores)) {
      if (!key.includes(':') && myTableau.includes(key)) {
        if (!myCards[key]) myCards[key] = val;
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
    let prevTableau = new Set();
    for (const g of genKeys) {
      const player = snapshots[g].players?.[myColor];
      if (!player) continue;
      const curTableau = new Set(player.tableau || []);
      for (const card of curTableau) {
        if (!prevTableau.has(card)) myCards[card] = { gen: g, baseScore: getRating(card)?.score || 0 };
      }
      prevTableau = curTableau;
    }
  }

  for (const [name, info] of Object.entries(myCards)) {
    const fx = getEffects(name);
    if (!fx) continue;
    const gen = info.gen || 0;
    if (gen === 0 || endGen === 0) continue;

    const hasProd = fx.mp || fx.sp || fx.tp || fx.pp || fx.ep || fx.hp;
    const hasAction = fx.actMC || fx.actTR || fx.actCD || fx.actOc;

    // Late production — но не если основная ценность = VP/TR
    if (hasProd && gen >= endGen - 1) {
      const hasDirectVP = fx.vp || fx.vpAcc || fx.tr || fx.tmp || fx.o2 || fx.oc || fx.vn || fx.city || fx.grn;
      const prodTotal = (fx.mp || 0) + (fx.sp || 0) * 1.6 + (fx.tp || 0) * 2.5 +
                        (fx.pp || 0) * 1.6 + (fx.ep || 0) * 1.5 + (fx.hp || 0) * 0.8;
      if (!hasDirectVP || prodTotal >= 8) {
        issues.push({
          card: name, type: 'late_prod', gen,
          message: `(prod) сыгран gen ${gen} — только ${endGen - gen} gen отдачи`,
          severity: gen >= endGen ? 'high' : 'medium',
        });
      }
    }

    // Late blue action
    if (hasAction && gen > 0) {
      const activations = endGen - gen;
      if (activations <= 1) {
        issues.push({
          card: name, type: 'late_action', gen,
          message: `(action) сыгран gen ${gen} — только ${activations} активаций`,
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
      cardsInHand: me.cardsInHand ?? me.cards ?? 0,
      tableauSize: me.tableau?.length ?? 0,
    });
  }

  const vpByGen = finalScores[myColor]?.vpByGen || [];

  // Opponents
  const opponents = {};
  if (Object.keys(finalScores).length > 0) {
    for (const [color, fs] of Object.entries(finalScores)) {
      if (color === myColor) continue;
      const pName = data.players.find(p => p.color === color)?.name || color;
      opponents[pName] = { vp: fs.total, tr: fs.tr, vpByGen: fs.vpByGen || [] };
    }
  } else if (genKeys.length > 0) {
    const lastSnap = snapshots[genKeys[genKeys.length - 1]];
    for (const [pName, pData] of Object.entries(lastSnap.players || {})) {
      if (pName === myColor) continue;
      opponents[pName] = { vp: 0, tr: pData.tr ?? 0, vpByGen: [] };
    }
  }

  return { curve, vpByGen, opponents };
}

// ══════════════════════════════════════════════════════════════
// §8. GRADING
// ══════════════════════════════════════════════════════════════

function calcGrade(draft, buys, timing) {
  let total = 0, count = 0;

  if (draft && draft.totalPicks > 0) {
    total += draft.accuracy * 100 * 0.4;
    count += 0.4;
  }
  if (buys && buys.drafted > 0) {
    total += (buys.played / buys.drafted) * 100 * 0.2;
    count += 0.2;
  }
  if (timing) {
    total += timing.score * 0.25;
    count += 0.25;
  }

  const score = count > 0 ? Math.round(total / count) : 0;
  const letter =
    score >= 93 ? 'S' : score >= 85 ? 'A' : score >= 75 ? 'B+' :
    score >= 65 ? 'B' : score >= 55 ? 'C+' : score >= 45 ? 'C' :
    score >= 35 ? 'D' : 'F';

  return { score, letter };
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

function printReport(data, draft, buys, setup, timing, economy, grade) {
  const { player, corp, endGen, map, result } = data;

  console.log('');
  console.log(`${C.bold}${'═'.repeat(56)}${C.reset}`);
  console.log(`${C.bold}  TM Replay Analysis${C.reset}`);
  console.log(`${'═'.repeat(56)}`);
  console.log(`  Игрок: ${C.bold}${player}${C.reset} (${corp}) | Генераций: ${endGen} | Карта: ${map || '?'}`);

  if (result.vp) {
    const placeStr = result.place === 1 ? `${C.green}1-е место${C.reset}` : `${C.yellow}${result.place}-е место${C.reset}`;
    console.log(`  Итог: ${placeStr} (${C.bold}${result.vp} VP${C.reset}) | Победитель: ${result.winner} (${result.winnerVP} VP)`);
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
    console.log(`  Задрафтено: ${buys.drafted} | Сыграно: ${buys.played} | Мёртвых: ${buys.deadCount} (${buys.deadCost} MC)`);
    for (const dc of buys.deadCards.slice(0, 5)) {
      console.log(`  ${C.gray}  ×${C.reset} ${dc.name} (${dc.tier}${dc.score}) — ${C.dim}не сыграна${C.reset}`);
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
    console.log(`${C.bold}── Economy ──${C.reset}`);
    console.log(`  ${C.dim}Gen | MC-prod |  TR | Cards | Tableau${C.reset}`);
    for (const row of economy.curve) {
      console.log(`  ${C.gray}${pad(row.gen, 3)}${C.reset} | ${pad(row.mcProd, 7)} | ${pad(row.tr, 3)} | ${pad(row.cardsInHand, 5)} | ${pad(row.tableauSize, 7)}`);
    }
    if (economy.vpByGen.length > 0) {
      console.log(`\n  ${C.dim}VP по поколениям:${C.reset} ${economy.vpByGen.join(' → ')}`);
    }
    if (Object.keys(economy.opponents).length > 0) {
      console.log('');
      for (const [name, opp] of Object.entries(economy.opponents)) {
        const vpStr = opp.vpByGen.length > 0 ? opp.vpByGen.join(' → ') : (opp.vp ? `${opp.vp} VP` : `TR ${opp.tr}`);
        console.log(`  ${C.dim}${name}:${C.reset} ${vpStr}`);
      }
    }
    console.log('');
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

  // Overall Grade
  console.log(`${'═'.repeat(56)}`);
  console.log(`${C.bold}  Overall Grade: ${tierColor(grade.letter)}${grade.letter} (${grade.score}/100)${C.reset}`);
  console.log(`${'═'.repeat(56)}`);
  console.log('');
}

function saveJSON(data, draft, buys, setup, timing, economy, grade) {
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
    timing: timing ? { score: timing.score, issues: timing.issues } : null,
    economy: economy?.curve ? {
      mcProdCurve: economy.curve.map(r => ({ gen: r.gen, mcProd: r.mcProd })),
      trCurve: economy.curve.map(r => ({ gen: r.gen, tr: r.tr })),
      vpByGen: economy.vpByGen,
    } : null,
    overallGrade: grade.score,
    overallLetter: grade.letter,
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
  const grade = calcGrade(draft, buys, timing);

  if (!silent) {
    printReport(data, draft, buys, setup, timing, economy, grade);
  }

  const dateMatch = path.basename(filePath).match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : '';

  return { filePath, data, draft, buys, setup, timing, economy, grade, date };
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

function scanAllExports() {
  const downloadsDir = findDownloadsDir();
  if (!downloadsDir) {
    console.error('Не найдена папка Downloads');
    process.exit(1);
  }

  const files = fs.readdirSync(downloadsDir)
    .filter(f => f.startsWith('tm-game-') && f.endsWith('.json'))
    .map(f => path.join(downloadsDir, f))
    .sort();

  if (files.length === 0) {
    console.error('Экспортов не найдено в ' + downloadsDir);
    process.exit(1);
  }

  console.log(`${C.dim}Найдено ${files.length} экспортов в ${downloadsDir}${C.reset}`);
  console.log(`${C.dim}Ratings: ${Object.keys(RATINGS).length} карт | Effects: ${Object.keys(FX).length} карт${C.reset}`);
  console.log('');

  // Анализируем все, но фильтруем — только с draft данными (полные экспорты)
  const results = [];
  const skipped = [];

  for (const f of files) {
    try {
      const r = analyzeOne(f, true);
      if (r.draft && r.draft.totalPicks > 0) {
        results.push(r);
      } else {
        skipped.push(path.basename(f));
      }
    } catch (e) {
      skipped.push(path.basename(f) + ' [ошибка]');
    }
  }

  if (results.length === 0) {
    console.log('Нет полных экспортов (с draft данными).');
    if (skipped.length > 0) {
      console.log(`${C.dim}Пропущено (без draft): ${skipped.join(', ')}${C.reset}`);
    }
    return;
  }

  // Сортировка по дате
  results.sort((a, b) => a.date.localeCompare(b.date));

  // ── Summary Table ──
  console.log(`${C.bold}${'═'.repeat(100)}${C.reset}`);
  console.log(`${C.bold}  TM Replay Summary — ${results.length} игр${C.reset}`);
  console.log(`${'═'.repeat(100)}`);
  console.log('');

  const hdr = [
    pad('Дата', 10), pad('Корп', 18), pad('Карта', 22),
    pad('Gen', 3), pad('VP', 3), pad('Место', 5),
    pad('Draft%', 6), pad('EV Loss', 7), pad('Effic%', 6), pad('Dead', 4),
    pad('Timing', 6), pad('Grade', 5),
  ].join(' │ ');
  console.log(`  ${C.dim}${hdr}${C.reset}`);
  console.log(`  ${'─'.repeat(hdr.length)}`);

  for (const r of results) {
    const d = r.data;
    const draftPct = r.draft ? Math.round(r.draft.accuracy * 100) : '-';
    const evLoss = r.draft ? r.draft.totalEVLoss : '-';
    const efficPct = r.buys && r.buys.drafted > 0 ? Math.round(r.buys.played / r.buys.drafted * 100) : '-';
    const deadCount = r.buys ? r.buys.deadCount : '-';
    const timingPct = r.timing ? r.timing.score : '-';
    const placeIcon = d.result.place === 1 ? `${C.green}  1-е${C.reset}` : `${C.yellow}  ${d.result.place}-е ${C.reset}`;

    const row = [
      pad(r.date, 10),
      pad(d.corp.slice(0, 18), 18),
      pad((d.map || '?').slice(0, 22), 22),
      pad(d.endGen || '-', 3),
      pad(d.result.vp || '-', 3),
      placeIcon,
      pad(draftPct, 6),
      pad(evLoss, 7),
      pad(efficPct, 6),
      pad(deadCount, 4),
      pad(timingPct, 6),
      `${tierColor(r.grade.letter)}${pad(r.grade.letter, 3)}${pad(r.grade.score, 3)}${C.reset}`,
    ].join(' │ ');
    console.log(`  ${row}`);
  }
  console.log('');

  // ── Trends ──
  printTrends(results);

  // ── Skipped ──
  if (skipped.length > 0) {
    console.log(`${C.dim}Пропущено (без draft): ${skipped.length} файлов${C.reset}`);
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
  const grades = results.map(r => r.grade.score);
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

  console.log(`  Win rate: ${C.bold}${winRate}%${C.reset} (${wins}/${results.length})`);
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

  // Per-game grade sparkline
  if (results.length >= 3) {
    const sparkline = results.map(r => {
      const g = r.grade.score;
      return `${tierColor(r.grade.letter)}${r.grade.score}${C.reset}`;
    }).join(' → ');
    console.log(`  Grade trend: ${sparkline}`);
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

  // Most common corps
  const corpFreq = {};
  for (const r of results) {
    const c = r.data.corp;
    if (c) corpFreq[c] = (corpFreq[c] || 0) + 1;
  }
  const topCorps = Object.entries(corpFreq).sort((a, b) => b[1] - a[1]);
  if (topCorps.length > 0) {
    console.log(`  ${C.bold}Корпорации:${C.reset}`);
    for (const [name, count] of topCorps) {
      const r = getRating(name);
      const tier = r ? ` (${r.tier}${r.score})` : '';
      const winsWithCorp = results.filter(r => r.data.corp === name && r.data.result.place === 1).length;
      console.log(`    ${count}× ${name}${tier} — ${winsWithCorp}W`);
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
  const input = process.argv[2];

  if (input === '--all' || input === '-a') {
    scanAllExports();
    return;
  }

  if (input === '--fetch' || input === '-f') {
    scanFetchedGames();
    return;
  }

  if (!input) {
    console.error('Использование:');
    console.error('  node scripts/replay-analyzer.js <path-to-game-log>   — анализ одной игры');
    console.error('  node scripts/replay-analyzer.js --all                — все экспорты из Downloads');
    console.error('  node scripts/replay-analyzer.js --fetch              — все fetched игры из data/game_logs/');
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
      saveJSON(ri.data, ri.draft, ri.buys, ri.setup, ri.timing, ri.economy, ri.grade);
    }
  } else {
    saveJSON(r.data, r.draft, r.buys, r.setup, r.timing, r.economy, r.grade);
  }
}

main();
