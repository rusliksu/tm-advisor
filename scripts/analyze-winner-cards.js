#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {resolveGeneratedExtensionPath} = require('./lib/generated-extension-data');

const ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'data', 'game_logs');

function loadBrowserVar(targetPath, varName) {
  const full = path.isAbsolute(targetPath) ? targetPath : path.join(ROOT, targetPath);
  const raw = fs.readFileSync(full, 'utf8');
  const fn = new Function(raw.replace(/^const /, 'var ') + `\nreturn ${varName};`);
  return fn();
}

const RATINGS = loadBrowserVar(resolveGeneratedExtensionPath('ratings.json.js'), 'TM_RATINGS');

const args = process.argv.slice(2);
let limit = 20;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--limit' && args[i + 1]) {
    limit = parseInt(args[++i], 10) || limit;
    continue;
  }
  throw new Error(`Unknown argument: ${a}`);
}

function inc(map, key, delta = 1) {
  map.set(key, (map.get(key) || 0) + delta);
}

function collectApiFiles() {
  if (!fs.existsSync(LOG_DIR)) return [];
  return fs.readdirSync(LOG_DIR)
    .filter((name) => name.startsWith('tm-fetch-'))
    .map((name) => {
      const full = path.join(LOG_DIR, name);
      const stat = fs.statSync(full);
      return {name, full, mtime: stat.mtimeMs};
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}

function parseApiWinner(file) {
  const raw = JSON.parse(fs.readFileSync(file.full, 'utf8'));
  const export0 = raw.players?.[0];
  if (!export0) return null;
  const finalScores = export0.finalScores || {};
  const players = export0.players || [];
  const snapshot = export0.generations?.[String(raw.endGen)]?.snapshot;
  if (!snapshot) return null;

  const winnerEntry = Object.entries(finalScores)
    .sort((a, b) => (b[1]?.total || 0) - (a[1]?.total || 0))[0];
  if (!winnerEntry) return null;
  const [winnerColor, winnerScore] = winnerEntry;
  const winnerMeta = players.find((p) => p.color === winnerColor);
  const winnerSnapshot = snapshot.players?.[winnerColor];
  if (!winnerMeta || !winnerSnapshot) return null;

  return {
    gameId: raw.gameId,
    board: raw.map || '?',
    generation: raw.endGen || null,
    winnerName: winnerMeta.name,
    winnerCorp: winnerMeta.corp,
    winnerScore: winnerScore?.total || 0,
    tableau: winnerSnapshot.tableau || [],
  };
}

function summarize(winners) {
  const corpWins = new Map();
  const cardCounts = new Map();
  const lowRatedWinnerCards = [];

  for (const g of winners) {
    inc(corpWins, g.winnerCorp);
    for (const card of g.tableau) {
      inc(cardCounts, card);
      const rating = RATINGS[card];
      if (rating && rating.s <= 55) {
        lowRatedWinnerCards.push({
          gameId: g.gameId,
          card,
          score: rating.s,
          tier: rating.t,
          corp: g.winnerCorp,
          winner: g.winnerName,
        });
      }
    }
  }

  const topCorps = [...corpWins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([corp, wins]) => ({corp, wins}));

  const topCards = [...cardCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
    .map(([card, games]) => {
      const rating = RATINGS[card];
      return {
        card,
        games,
        rating: rating?.s ?? null,
        tier: rating?.t ?? null,
      };
    });

  const suspicious = lowRatedWinnerCards
    .sort((a, b) => a.score - b.score || a.card.localeCompare(b.card))
    .slice(0, 20);

  return {
    totalWinnerGames: winners.length,
    topCorps,
    topCards,
    suspiciousLowRatedWinnerCards: suspicious,
  };
}

function main() {
  const winners = collectApiFiles()
    .map(parseApiWinner)
    .filter(Boolean);
  const summary = summarize(winners);

  console.log(`Winner API games analyzed: ${summary.totalWinnerGames}`);

  console.log('\nTop winner corps:');
  for (const row of summary.topCorps) {
    console.log(`  ${row.corp}: ${row.wins}`);
  }

  console.log('\nTop winner tableau cards:');
  for (const row of summary.topCards) {
    console.log(`  ${row.card}: ${row.games}${row.rating != null ? ` [${row.tier}:${row.rating}]` : ''}`);
  }

  console.log('\nSuspicious low-rated winner cards:');
  for (const row of summary.suspiciousLowRatedWinnerCards) {
    console.log(`  ${row.card}: [${row.tier}:${row.score}] in ${row.gameId} winner=${row.winner} corp=${row.corp}`);
  }
}

main();
