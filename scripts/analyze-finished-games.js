#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'data', 'game_logs');

const args = process.argv.slice(2);
let limit = 20;
let json = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--limit' && args[i + 1]) {
    limit = parseInt(args[++i], 10) || limit;
    continue;
  }
  if (a === '--json') {
    json = true;
    continue;
  }
  throw new Error(`Unknown argument: ${a}`);
}

function inc(map, key, delta = 1) {
  map.set(key, (map.get(key) || 0) + delta);
}

function normCorpName(name) {
  if (!name) return '?';
  return String(name).split('|')[0].trim();
}

function collectFiles() {
  if (!fs.existsSync(LOG_DIR)) return [];
  const files = fs.readdirSync(LOG_DIR)
    .filter((name) => name.startsWith('tm-fetch-') || name.startsWith('tm-db-result-'))
    .map((name) => {
      const full = path.join(LOG_DIR, name);
      const stat = fs.statSync(full);
      return {name, full, mtime: stat.mtimeMs};
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
  return files;
}

function parseFetchExport(raw, fileName) {
  const players = raw.players?.[0]?.players || [];
  const finalScores = raw.players?.[0]?.finalScores || {};
  const snapshot = raw.players?.[0]?.generations?.[String(raw.endGen)]?.snapshot;
  const rows = players.map((p) => ({
    name: p.name,
    color: p.color,
    corp: normCorpName(p.corp),
    total: finalScores[p.color]?.total ?? null,
  })).filter((p) => p.total !== null);
  rows.sort((a, b) => b.total - a.total);
  return {
    source: 'api',
    fileName,
    gameId: raw.gameId,
    board: raw.map || '?',
    generations: raw.endGen || null,
    expansions: {},
    players: rows,
    winner: rows[0] || null,
  };
}

function parseDbExport(raw, fileName) {
  const opts = raw.gameOptions || {};
  const scores = (raw.scores || []).map((s) => ({
    name: s.playerName,
    color: s.playerColor,
    corp: normCorpName(s.corporation),
    total: s.playerScore ?? 0,
  })).sort((a, b) => b.total - a.total);
  const validScores = scores.some((s) => (s.total || 0) > 0);
  return {
    source: 'db',
    fileName,
    gameId: raw.gameId,
    board: opts.boardName || '?',
    generations: raw.generations || null,
    expansions: {
      ares: !!opts.aresExtension,
      colonies: !!opts.coloniesExtension,
      prelude: !!opts.preludeExtension,
      venus: !!opts.venusNextExtension,
      turmoil: !!opts.turmoilExtension,
      moon: !!opts.moonExpansion,
      pathfinders: !!opts.pathfindersExpansion,
      underworld: !!opts.underworldExpansion,
      ceo: !!opts.ceoExtension,
    },
    players: scores,
    winner: validScores ? (scores[0] || null) : null,
    validScores,
  };
}

function parseFile(file) {
  const raw = JSON.parse(fs.readFileSync(file.full, 'utf8'));
  if (file.name.startsWith('tm-fetch-')) return parseFetchExport(raw, file.name);
  if (file.name.startsWith('tm-db-result-')) return parseDbExport(raw, file.name);
  return null;
}

function summarize(games) {
  const winsByCorp = new Map();
  const boardCounts = new Map();
  const sourceCounts = new Map();
  const allCorps = new Map();
  const expansionWins = new Map();
  let invalidScoreGames = 0;
  let gensTotal = 0;
  let gensCount = 0;

  for (const g of games) {
    inc(sourceCounts, g.source);
    inc(boardCounts, g.board || '?');
    if (g.generations != null) {
      gensTotal += g.generations;
      gensCount += 1;
    }
    for (const p of g.players) {
      inc(allCorps, p.corp);
    }
    if (g.validScores === false) {
      invalidScoreGames += 1;
      continue;
    }
    for (const [exp, enabled] of Object.entries(g.expansions || {})) {
      if (enabled) inc(expansionWins, exp);
    }
    if (g.winner?.corp) inc(winsByCorp, g.winner.corp);
  }

  const topWins = [...winsByCorp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topSeen = [...allCorps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const recent = games.slice(0, 10).map((g) => ({
    gameId: g.gameId,
    source: g.source,
    board: g.board,
    generations: g.generations,
    winner: g.winner ? `${g.winner.name} (${g.winner.corp}) ${g.winner.total}` : (g.validScores === false ? 'invalid-scores' : '?'),
  }));

  return {
    totalGames: games.length,
    validScoreGames: games.length - invalidScoreGames,
    invalidScoreGames,
    avgGenerations: gensCount ? Number((gensTotal / gensCount).toFixed(2)) : null,
    sources: Object.fromEntries(sourceCounts),
    boards: Object.fromEntries(boardCounts),
    enabledExpansionsInValidGames: Object.fromEntries([...expansionWins.entries()].sort((a, b) => b[1] - a[1])),
    topWinnerCorps: topWins.map(([corp, wins]) => ({corp, wins})),
    mostSeenCorps: topSeen.map(([corp, games]) => ({corp, games})),
    recent,
  };
}

function main() {
  const files = collectFiles();
  const games = files.map(parseFile).filter(Boolean);
  const summary = summarize(games);

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`Completed games analyzed: ${summary.totalGames}`);
  console.log(`Valid score games: ${summary.validScoreGames}`);
  console.log(`Invalid score games: ${summary.invalidScoreGames}`);
  console.log(`Average generations: ${summary.avgGenerations ?? '?'}`);
  console.log(`Sources: ${Object.entries(summary.sources).map(([k, v]) => `${k}=${v}`).join(', ') || '-'}`);
  console.log(`Boards: ${Object.entries(summary.boards).map(([k, v]) => `${k}=${v}`).join(', ') || '-'}`);
  console.log(`Enabled expansions in valid games: ${Object.entries(summary.enabledExpansionsInValidGames).map(([k, v]) => `${k}=${v}`).join(', ') || '-'}`);

  console.log('\nTop winner corps:');
  for (const row of summary.topWinnerCorps) {
    console.log(`  ${row.corp}: ${row.wins}`);
  }

  console.log('\nMost seen corps:');
  for (const row of summary.mostSeenCorps) {
    console.log(`  ${row.corp}: ${row.games}`);
  }

  console.log('\nRecent games:');
  for (const row of summary.recent) {
    console.log(`  ${row.gameId} | ${row.source} | ${row.board} | gen=${row.generations ?? '?'} | ${row.winner}`);
  }
}

main();
