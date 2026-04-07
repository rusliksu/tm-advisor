#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GAME_LOG_DIR = path.join(ROOT, 'data', 'game_logs');
const CHOICE_LOG_DIR = path.join(GAME_LOG_DIR, 'choice_logs');

const args = process.argv.slice(2);
let choiceLimit = 20;
let gameLimit = 50;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--choice-limit' && args[i + 1]) {
    choiceLimit = parseInt(args[++i], 10) || choiceLimit;
    continue;
  }
  if (a === '--game-limit' && args[i + 1]) {
    gameLimit = parseInt(args[++i], 10) || gameLimit;
    continue;
  }
  throw new Error(`Unknown argument: ${a}`);
}

function collectFiles(dir, filter, limit) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(filter)
    .map((name) => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return {name, full, mtime: stat.mtimeMs};
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}

function parseJsonl(file) {
  return fs.readFileSync(file.full, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function loadApiWinnerGames(limit) {
  const files = collectFiles(GAME_LOG_DIR, (name) => name.startsWith('tm-fetch-'), limit);
  return files.map((file) => {
    try {
      const raw = JSON.parse(fs.readFileSync(file.full, 'utf8'));
      const export0 = raw.players?.[0];
      const finalScores = export0?.finalScores || {};
      const players = export0?.players || [];
      const snapshot = export0?.generations?.[String(raw.endGen)]?.snapshot;
      if (!snapshot) return null;
      const winnerEntry = Object.entries(finalScores).sort((a, b) => (b[1]?.total || 0) - (a[1]?.total || 0))[0];
      if (!winnerEntry) return null;
      const [winnerColor] = winnerEntry;
      const winnerMeta = players.find((p) => p.color === winnerColor);
      const winnerSnapshot = snapshot.players?.[winnerColor];
      if (!winnerMeta || !winnerSnapshot) return null;
      return {
        gameId: raw.gameId,
        winner: winnerMeta.name,
        corp: String(winnerMeta.corp || '').split('|')[0].trim(),
        tableau: winnerSnapshot.tableau || [],
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function collectBotCardStats(limit) {
  const files = collectFiles(CHOICE_LOG_DIR, (name) => name.endsWith('.jsonl'), limit);
  const seen = new Map();
  const picked = new Map();
  let totalEvents = 0;

  for (const file of files) {
    for (const ev of parseJsonl(file)) {
      totalEvents += 1;
      if (ev.waitingType === 'card' && Array.isArray(ev.options)) {
        for (const card of ev.options) {
          if (typeof card === 'string' && card) seen.set(card, (seen.get(card) || 0) + 1);
        }
        const picks = Array.isArray(ev.picked) ? ev.picked : [];
        for (const card of picks) {
          if (typeof card === 'string' && card) picked.set(card, (picked.get(card) || 0) + 1);
        }
        continue;
      }
      if (ev.waitingType === 'or' && Array.isArray(ev.options)) {
        for (const opt of ev.options) {
          if (Array.isArray(opt?.cards)) {
            for (const card of opt.cards) {
              if (typeof card === 'string' && card) seen.set(card, (seen.get(card) || 0) + 1);
            }
          }
        }
        const chosen = ev.picked?.picked;
        if (Array.isArray(chosen)) {
          for (const card of chosen) {
            if (typeof card === 'string' && card && card !== 'option') picked.set(card, (picked.get(card) || 0) + 1);
          }
        } else if (typeof chosen === 'string' && chosen && chosen !== 'option') {
          picked.set(chosen, (picked.get(chosen) || 0) + 1);
        }
      }
    }
  }

  return {files: files.length, totalEvents, seen, picked};
}

function collectRealWinnerStats(limit) {
  const games = loadApiWinnerGames(limit);
  const winnerCards = new Map();
  for (const game of games) {
    const uniqueCards = new Set(game.tableau || []);
    for (const card of uniqueCards) {
      if (typeof card === 'string' && card) {
        winnerCards.set(card, (winnerCards.get(card) || 0) + 1);
      }
    }
  }
  return {games: games.length, winnerCards};
}

function summarizeGap(bot, real) {
  const allCards = new Set([
    ...bot.seen.keys(),
    ...bot.picked.keys(),
    ...real.winnerCards.keys(),
  ]);

  const rows = [];
  for (const card of allCards) {
    const seen = bot.seen.get(card) || 0;
    const picked = bot.picked.get(card) || 0;
    const winnerGames = real.winnerCards.get(card) || 0;
    const botPickRate = seen > 0 ? picked / seen : 0;
    const winnerRate = real.games > 0 ? winnerGames / real.games : 0;
    rows.push({
      card,
      seen,
      picked,
      winnerGames,
      botPickRate,
      winnerRate,
      gap: botPickRate - winnerRate,
    });
  }

  const overpicked = rows
    .filter((row) => row.seen >= 4)
    .sort((a, b) => b.gap - a.gap || b.seen - a.seen)
    .slice(0, 15)
    .map((row) => ({
      card: row.card,
      botPickRate: Number(row.botPickRate.toFixed(3)),
      winnerRate: Number(row.winnerRate.toFixed(3)),
      picks: `${row.picked}/${row.seen}`,
      winnerGames: row.winnerGames,
    }));

  const underpicked = rows
    .filter((row) => row.winnerGames >= 2)
    .sort((a, b) => a.gap - b.gap || b.winnerGames - a.winnerGames)
    .slice(0, 15)
    .map((row) => ({
      card: row.card,
      botPickRate: Number(row.botPickRate.toFixed(3)),
      winnerRate: Number(row.winnerRate.toFixed(3)),
      picks: `${row.picked}/${row.seen}`,
      winnerGames: row.winnerGames,
    }));

  return {overpicked, underpicked};
}

function main() {
  const bot = collectBotCardStats(choiceLimit);
  const real = collectRealWinnerStats(gameLimit);
  const gap = summarizeGap(bot, real);

  console.log(`Bot choice logs analyzed: ${bot.files}`);
  console.log(`Bot choice events: ${bot.totalEvents}`);
  console.log(`Real winner API games analyzed: ${real.games}`);

  console.log('\nMost overpicked by bot vs real winners:');
  for (const row of gap.overpicked) {
    console.log(`  ${row.card}: bot=${row.botPickRate} (${row.picks}) | winners=${row.winnerRate} (${row.winnerGames})`);
  }

  console.log('\nMost underpicked by bot vs real winners:');
  for (const row of gap.underpicked) {
    console.log(`  ${row.card}: bot=${row.botPickRate} (${row.picks}) | winners=${row.winnerRate} (${row.winnerGames})`);
  }
}

main();
