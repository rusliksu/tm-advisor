#!/usr/bin/env node
'use strict';

const {spawnSync} = require('child_process');

const BOT = require('./smartbot');

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    gameId: null,
    vps: 'vps',
    window: 4,
    limit: null,
    player: null,
    genFrom: null,
    genTo: null,
    all: false,
    minBeforeScore: 24,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--') && result.gameId === null) {
      result.gameId = arg.startsWith('g') ? arg : `g${arg}`;
      continue;
    }
    if (arg === '--vps' && args[i + 1]) result.vps = args[++i];
    else if (arg === '--window' && args[i + 1]) result.window = parseInt(args[++i], 10) || result.window;
    else if (arg === '--limit' && args[i + 1]) result.limit = parseInt(args[++i], 10) || null;
    else if (arg === '--player' && args[i + 1]) result.player = args[++i];
    else if (arg === '--gen-from' && args[i + 1]) result.genFrom = parseInt(args[++i], 10) || null;
    else if (arg === '--gen-to' && args[i + 1]) result.genTo = parseInt(args[++i], 10) || null;
    else if (arg === '--all') result.all = true;
    else if (arg === '--min-before-score' && args[i + 1]) result.minBeforeScore = parseInt(args[++i], 10) || result.minBeforeScore;
  }

  if (!result.gameId) {
    throw new Error('Usage: node bot/retrospective-compare-vps.js <gameId> [--vps vps] [--player nameOrId] [--gen-from N] [--gen-to N] [--limit N] [--all]');
  }
  return result;
}

function runSsh(vpsAlias, command, input = undefined) {
  const child = spawnSync('ssh', [vpsAlias, command], {
    input,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 128,
  });
  if (child.status !== 0) {
    throw new Error((child.stderr || child.stdout || 'ssh failed').trim());
  }
  return child.stdout || '';
}

function readRemoteActionLog(gameId, vpsAlias) {
  const python = [
    'python3 - <<\'PY\'',
    'import json, sys',
    `path='/home/openclaw/terraforming-mars/logs/actions/${gameId}.jsonl'`,
    'with open(path, \'r\', encoding=\'utf-8\') as f:',
    '    sys.stdout.write(f.read())',
    'PY',
  ].join('\n');

  const text = runSsh(vpsAlias, python);
  return text.trim().split('\n').filter(Boolean).map((line, index) => {
    const entry = JSON.parse(line);
    entry._line = index + 1;
    return entry;
  });
}

function remotePromptState(vpsAlias, gameId, entry, window) {
  const requestLiteral = JSON.stringify({
    gameId,
    saveId: entry.saveId,
    before: entry.before,
    activePlayer: entry.activePlayer,
    activePlayerColor: entry.activePlayerColor,
    window,
  });
  const remoteScript = `
const {spawnSync} = require('child_process');
const req = ${requestLiteral};
const {globalInitialize} = require('/home/openclaw/terraforming-mars/build/src/server/globalInitialize.js');
globalInitialize();
const {Game} = require('/home/openclaw/terraforming-mars/build/src/server/Game.js');
Game.prototype.save = function() { this.saveGamePromise = Promise.resolve(); };
const {Server} = require('/home/openclaw/terraforming-mars/build/src/server/models/ServerModel.js');

function fetchSave(gameId, saveId) {
  const py = "import sqlite3, sys; conn=sqlite3.connect('/home/openclaw/terraforming-mars/db/game.db'); row=conn.execute('select game from games where game_id=? and save_id=?',(sys.argv[1], int(sys.argv[2]))).fetchone(); print(row[0] if row else '')";
  const r = spawnSync('python3', ['-c', py, gameId, String(saveId)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'python fetch failed');
  const text = (r.stdout || '').trim();
  if (!text) return null;
  return JSON.parse(text);
}

function buildSummary(game) {
  const players = game.players.map((p) => ({
    id: p.id,
    color: p.color,
    name: p.name,
    tr: p.terraformRating,
    mc: p.megaCredits,
    steel: p.steel,
    titanium: p.titanium,
    plants: p.plants,
    energy: p.energy,
    heat: p.heat,
    prodMc: p.production.megacredits,
    prodSteel: p.production.steel,
    prodTi: p.production.titanium,
    prodPlants: p.production.plants,
    prodEnergy: p.production.energy,
    prodHeat: p.production.heat,
    cardsInHand: p.cardsInHand.length,
    tableau: p.tableau.asArray().length,
    actionsTakenThisRound: p.actionsTakenThisRound,
    actionsTakenThisGame: p.actionsTakenThisGame,
  }));
  return {
    generation: game.generation,
    temperature: game.temperature,
    oxygen: game.oxygenLevel,
    oceans: game.board.getOceanSpaces().length,
    venus: game.venusScaleLevel,
    gameAge: game.gameAge,
    players,
  };
}

function scoreBefore(expected, actual, actorId) {
  let score = 0;
  for (const field of ['generation', 'temperature', 'oxygen', 'oceans', 'venus']) {
    if (expected[field] === actual[field]) score += 6;
  }
  for (const exp of expected.players || []) {
    const act = actual.players.find((p) => p.id === exp.id) ||
      actual.players.find((p) => p.color === exp.color && p.name === exp.name);
    if (!act) continue;
    const weight = act.id === actorId ? 3 : 1;
    for (const field of ['tr', 'mc', 'steel', 'titanium', 'plants', 'energy', 'heat', 'prodMc', 'prodSteel', 'prodTi', 'prodPlants', 'prodEnergy', 'prodHeat', 'cardsInHand', 'tableau', 'actionsTakenThisRound', 'actionsTakenThisGame']) {
      if (exp[field] === act[field]) score += weight;
    }
  }
  return score;
}

const start = Number(req.saveId) || 0;
let best = null;
for (let saveId = start; saveId >= Math.max(0, start - (req.window || 4)); saveId--) {
  const serialized = fetchSave(req.gameId, saveId);
  if (!serialized) continue;
  let game;
  try {
    game = Game.deserialize(serialized);
  } catch (_err) {
    continue;
  }
  const player = game.players.find((p) => p.name === req.activePlayer && p.color === req.activePlayerColor) ||
    game.players.find((p) => p.name === req.activePlayer) ||
    game.activePlayer;
  if (!player) continue;
  const vm = Server.getPlayerModel(player);
  if (!vm.waitingFor) continue;
  const summary = buildSummary(game);
  const score = scoreBefore(req.before, summary, player.id);
  if (!best || score > best.beforeScore) {
    best = {
      matchedSaveId: saveId,
      beforeScore: score,
      state: vm,
      promptType: vm.waitingFor.type,
      promptTitle: vm.waitingFor?.title?.message || vm.waitingFor?.title || vm.waitingFor?.buttonLabel || '',
    };
  }
}
process.stdout.write(JSON.stringify(best || {matchedSaveId: null, beforeScore: 0, state: null}));
`;

  const out = spawnSync('ssh', [vpsAlias, 'node', '-'], {
    input: remoteScript,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64,
  });
  if (out.status !== 0) {
    throw new Error((out.stderr || out.stdout || 'remote prompt state failed').trim());
  }
  return JSON.parse((out.stdout || '').trim() || 'null');
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getPromptTitle(wf) {
  if (!wf) return '';
  if (typeof wf.title === 'string') return wf.title;
  if (wf.title && typeof wf.title.message === 'string') return wf.title.message;
  return wf.buttonLabel || '';
}

function nameOf(item) {
  if (!item) return null;
  if (typeof item === 'string') return item;
  return item.name || null;
}

function describeInput(input, prompt) {
  if (!input) return '?';
  if (!prompt) return fallbackDescribe(input);

  if (input.type === 'or') {
    const option = safeArray(prompt.options)[input.index];
    if (!option) return fallbackDescribe(input);
    const optionTitle = getPromptTitle(option);
    const inner = input.response ? describeInput(input.response, option) : normalizeOptionTitle(optionTitle);
    const normalizedTitle = normalizeOptionTitle(optionTitle);
    if (inner && inner !== '?' && inner !== normalizedTitle) return inner;
    return normalizedTitle;
  }

  if (input.type === 'projectCard') return `play ${input.card}`;
  if (input.type === 'card') {
    const cards = safeArray(input.cards);
    if (cards.length === 1) {
      const title = getPromptTitle(prompt).toLowerCase();
      if (title.includes('keep')) return `keep ${cards[0]}`;
      if (title.includes('play')) return `play ${cards[0]}`;
      if (title.includes('action')) return `action ${cards[0]}`;
      return `cards: ${cards[0]}`;
    }
    return `cards: ${cards.join(', ')}`;
  }
  if (input.type === 'option') return normalizeOptionTitle(getPromptTitle(prompt));
  if (input.type === 'space') return `space ${input.spaceId}`;
  if (input.type === 'colony') return `colony ${input.colonyName || input.spaceId || ''}`.trim();
  if (input.type === 'and') {
    return safeArray(input.responses).map((response, idx) => describeInput(response, safeArray(prompt.options)[idx])).join(' + ');
  }
  return fallbackDescribe(input);
}

function normalizeOptionTitle(title) {
  const text = String(title || '').trim();
  if (!text) return '?';
  if (/pass for this generation/i.test(text)) return 'pass';
  if (/claim .* milestone/i.test(text)) return text.replace(/^claim\s+/i, '').replace(/\s+milestone$/i, '').trim();
  if (/fund .* award/i.test(text)) return text.replace(/^fund\s+/i, '').replace(/\s+award$/i, '').trim();
  return text;
}

function fallbackDescribe(input) {
  if (!input) return '?';
  if (input.type === 'projectCard') return `play ${input.card}`;
  if (input.type === 'card') return `cards: ${safeArray(input.cards).join(', ')}`;
  if (input.type === 'space') return `space ${input.spaceId}`;
  if (input.type === 'colony') return `colony ${input.colonyName || input.spaceId || ''}`.trim();
  if (input.type === 'option') return 'option';
  if (input.type === 'and') return safeArray(input.responses).map(fallbackDescribe).join(' + ');
  if (input.type === 'or') return 'or';
  return input.type || '?';
}

function inferActualAction(entry) {
  const logs = safeArray(entry.newLogs).map((line) => String(line));
  for (const line of logs) {
    let match = line.match(/sent 1 delegate\(s\) in (.+) area$/i);
    if (match) return {summary: 'party', evidence: line};
    match = line.match(/used (sell patents) standard project$/i);
    if (match) return {summary: 'cards: Sell Patents', evidence: line};
    match = line.match(/acted as world government and increased temperature$/i);
    if (match) return {summary: 'Increase temperature', evidence: line};
    match = line.match(/acted as world government and placed an ocean$/i);
    if (match) return {summary: 'Place ocean', evidence: line};
  }
  for (const line of logs) {
    let match = line.match(/played (.+)$/i);
    if (match) return {summary: `play ${match[1]}`, evidence: line};
    match = line.match(/used (.+) standard project$/i);
    if (match) return {summary: `cards: ${match[1]}`, evidence: line};
    match = line.match(/claimed (.+) milestone$/i);
    if (match) return {summary: `claim ${match[1]}`, evidence: line};
    match = line.match(/funded (.+) award$/i);
    if (match) return {summary: `fund ${match[1]}`, evidence: line};
    match = line.match(/^(?:.+ )?passed$/i);
    if (match) return {summary: 'pass', evidence: line};
  }
  return null;
}

function inferFromPrompt(prompt, inputType) {
  if (!prompt || !inputType) return null;
  const title = getPromptTitle(prompt).toLowerCase();
  if (inputType === 'card') {
    const cards = safeArray(prompt.cards).map(nameOf).filter(Boolean);
    if (cards.length === 1) {
      if (title.includes('play')) return `play ${cards[0]}`;
      if (title.includes('keep')) return `keep ${cards[0]}`;
      if (title.includes('action')) return `action ${cards[0]}`;
      return `cards: ${cards[0]}`;
    }
  }
  if (inputType === 'projectCard') {
    const cards = safeArray(prompt.cards).map(nameOf).filter(Boolean);
    if (cards.length === 1) return `play ${cards[0]}`;
  }
  if (inputType === 'or') {
    const optionTitles = safeArray(prompt.options).map((option) => normalizeOptionTitle(getPromptTitle(option)));
    if (optionTitles.length === 1) return optionTitles[0];
  }
  return null;
}

function inferActualAction(entry, prompt) {
  const logs = safeArray(entry.newLogs).map((line) => String(line));
  const fromLogs = inferActualActionFromLogs(entry);
  if (fromLogs) return fromLogs;
  const fromPrompt = inferFromPrompt(prompt, entry.inputType);
  if (fromPrompt) return {summary: fromPrompt, evidence: logs[0] || ''};
  return {
    summary: entry.inputType ? `input:${entry.inputType}` : '?',
    evidence: logs[0] || '',
  };
}

function inferActualActionFromLogs(entry) {
  const logs = safeArray(entry.newLogs).map((line) => String(line));
  for (const line of logs) {
    let match = line.match(/sent 1 delegate\(s\) in (.+) area$/i);
    if (match) return {summary: 'party', evidence: line};
    match = line.match(/used (sell patents) standard project$/i);
    if (match) return {summary: 'cards: Sell Patents', evidence: line};
    match = line.match(/acted as world government and increased temperature$/i);
    if (match) return {summary: 'Increase temperature', evidence: line};
    match = line.match(/acted as world government and placed an ocean$/i);
    if (match) return {summary: 'Place ocean', evidence: line};
  }
  for (const line of logs) {
    let match = line.match(/played (.+)$/i);
    if (match) return {summary: `play ${match[1]}`, evidence: line};
    match = line.match(/used (.+) standard project$/i);
    if (match) return {summary: `cards: ${match[1]}`, evidence: line};
    match = line.match(/claimed (.+) milestone$/i);
    if (match) return {summary: `claim ${match[1]}`, evidence: line};
    match = line.match(/funded (.+) award$/i);
    if (match) return {summary: `fund ${match[1]}`, evidence: line};
    match = line.match(/^(?:.+ )?passed$/i);
    if (match) return {summary: 'pass', evidence: line};
  }
  return null;
}

function canonicalizeAction(action) {
  let value = String(action || '').trim().toLowerCase();
  if (!value || value === '?') return null;
  value = value.replace(/\s+/g, ' ');
  value = value.replace(/^input:/, '');
  value = value.replace(/^fund\s+/, 'fund ');
  value = value.replace(/^claim\s+/, 'claim ');
  value = value.replace(/^play\s+/, 'play ');
  value = value.replace(/^cards:\s+/, 'cards: ');
  return value;
}

function selectEntries(entries, options) {
  let filtered = entries.filter((entry) => {
    if (options.player) {
      const target = options.player.toLowerCase();
      const beforePlayers = safeArray(entry.before?.players);
      const hasPlayer = entry.activePlayer?.toLowerCase().includes(target) ||
        beforePlayers.some((player) => String(player.id || '').toLowerCase() === target || String(player.name || '').toLowerCase().includes(target));
      if (!hasPlayer) return false;
    }
    if (options.genFrom != null && Number(entry.generation) < options.genFrom) return false;
    if (options.genTo != null && Number(entry.generation) > options.genTo) return false;
    if (!options.all) {
      if (safeArray(entry.newLogs).length === 0) return false;
      if (!['or', 'card', 'projectCard'].includes(entry.inputType)) return false;
    }
    return true;
  });
  if (options.limit != null) filtered = filtered.slice(0, options.limit);
  return filtered;
}

function main() {
  const options = parseArgs(process.argv);
  const actionLog = readRemoteActionLog(options.gameId, options.vps);
  const entries = selectEntries(actionLog, options);

  const results = [];
  let skipped = 0;

  for (const entry of entries) {
    const remote = remotePromptState(options.vps, options.gameId, entry, options.window);
    if (!remote || !remote.state || !remote.state.waitingFor || remote.beforeScore < options.minBeforeScore) {
      skipped++;
      continue;
    }

    const botDecision = runBotSilently(remote.state.waitingFor, remote.state);
    const botInput = botDecision.botInput;
    const botReasoning = botDecision.reasoning;
    const botAction = describeInput(botInput, remote.state.waitingFor);
    const actual = inferActualAction(entry, remote.state.waitingFor);

    results.push({
      line: entry._line,
      generation: entry.generation,
      player: entry.activePlayer,
      color: entry.activePlayerColor,
      saveId: entry.saveId,
      matchedSaveId: remote.matchedSaveId,
      beforeScore: remote.beforeScore,
      promptType: remote.promptType || remote.state.waitingFor.type,
      promptTitle: remote.promptTitle || getPromptTitle(remote.state.waitingFor),
      botAction,
      botActionRaw: fallbackDescribe(botInput),
      actualAction: actual.summary,
      actualEvidence: actual.evidence,
      inputType: entry.inputType,
      newLogs: safeArray(entry.newLogs),
      matched: canonicalizeAction(botAction) === canonicalizeAction(actual.summary),
      reasoningTail: botReasoning.slice(-8),
    });
  }

  const comparable = results.filter((item) => canonicalizeAction(item.actualAction));
  const matched = comparable.filter((item) => item.matched);
  const mismatches = comparable.filter((item) => !item.matched);

  console.log(`Game ${options.gameId}`);
  console.log(`Entries scanned: ${entries.length} | compared: ${comparable.length} | matched: ${matched.length} | mismatched: ${mismatches.length} | skipped: ${skipped}`);
  console.log('');

  for (const item of mismatches.slice(0, 20)) {
    console.log(`[gen ${item.generation}] ${item.player} | ${item.promptTitle}`);
    console.log(`  bot:    ${item.botAction}`);
    console.log(`  player: ${item.actualAction}`);
    if (item.actualEvidence) console.log(`  evidence: ${item.actualEvidence}`);
    console.log(`  save: ${item.matchedSaveId} -> action log ${item.saveId} | score ${item.beforeScore}`);
    if (item.reasoningTail.length > 0) console.log(`  reasoning: ${item.reasoningTail.join(' | ')}`);
    console.log('');
  }

  if (mismatches.length === 0) {
    console.log('No clear mismatches found in the compared subset.');
  }
}

function runBotSilently(waitingFor, state) {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  console.log = () => {};
  console.warn = () => {};
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  try {
    const botInput = BOT.handleInput(waitingFor, state);
    const reasoning = BOT.flushReasoning ? (BOT.flushReasoning() || []) : [];
    return {botInput, reasoning};
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

main();
