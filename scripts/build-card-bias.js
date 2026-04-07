#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GAME_LOG_DIR = path.join(ROOT, 'data', 'game_logs');
const CHOICE_LOG_DIR = path.join(GAME_LOG_DIR, 'choice_logs');
const OUT_DIR = path.join(ROOT, 'data', 'analysis');
const OUT_FILE = path.join(OUT_DIR, 'card-bias.generated.json');

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

function collectBotStats(limit) {
  const seen = new Map();
  const picked = new Map();
  const files = collectFiles(CHOICE_LOG_DIR, (name) => name.endsWith('.jsonl'), limit);

  for (const file of files) {
    for (const ev of parseJsonl(file)) {
      if (ev.waitingType === 'card' && Array.isArray(ev.options)) {
        for (const card of ev.options) if (typeof card === 'string' && card) seen.set(card, (seen.get(card) || 0) + 1);
        for (const card of Array.isArray(ev.picked) ? ev.picked : []) if (typeof card === 'string' && card) picked.set(card, (picked.get(card) || 0) + 1);
      } else if (ev.waitingType === 'or' && Array.isArray(ev.options)) {
        for (const opt of ev.options) {
          for (const card of Array.isArray(opt?.cards) ? opt.cards : []) {
            if (typeof card === 'string' && card) seen.set(card, (seen.get(card) || 0) + 1);
          }
        }
        const p = ev.picked?.picked;
        if (Array.isArray(p)) {
          for (const card of p) if (typeof card === 'string' && card && card !== 'option') picked.set(card, (picked.get(card) || 0) + 1);
        } else if (typeof p === 'string' && p && p !== 'option') {
          picked.set(p, (picked.get(p) || 0) + 1);
        }
      }
    }
  }
  return {files: files.length, seen, picked};
}

function collectWinnerStats(limit) {
  const winnerCards = new Map();
  const files = collectFiles(GAME_LOG_DIR, (name) => name.startsWith('tm-fetch-'), limit);
  let games = 0;

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(file.full, 'utf8'));
      const export0 = raw.players?.[0];
      const finalScores = export0?.finalScores || {};
      const players = export0?.players || [];
      const snapshot = export0?.generations?.[String(raw.endGen)]?.snapshot;
      if (!snapshot) continue;
      const winnerEntry = Object.entries(finalScores).sort((a, b) => (b[1]?.total || 0) - (a[1]?.total || 0))[0];
      if (!winnerEntry) continue;
      const [winnerColor] = winnerEntry;
      const winnerMeta = players.find((p) => p.color === winnerColor);
      const winnerSnapshot = snapshot.players?.[winnerColor];
      if (!winnerMeta || !winnerSnapshot) continue;
      games += 1;
      for (const card of new Set(winnerSnapshot.tableau || [])) {
        if (typeof card === 'string' && card) winnerCards.set(card, (winnerCards.get(card) || 0) + 1);
      }
    } catch {
      // skip malformed export
    }
  }
  return {games, winnerCards};
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function buildBias(bot, real) {
  const allCards = new Set([...bot.seen.keys(), ...bot.picked.keys(), ...real.winnerCards.keys()]);
  const result = {};

  for (const card of allCards) {
    const seen = bot.seen.get(card) || 0;
    const picked = bot.picked.get(card) || 0;
    const winnerGames = real.winnerCards.get(card) || 0;
    const botPickRate = seen > 0 ? picked / seen : 0;
    const winnerRate = real.games > 0 ? winnerGames / real.games : 0;
    const gap = winnerRate - botPickRate;

    const enoughWinnerSignal = winnerGames >= 4;
    const enoughBotSignal = seen >= 8;
    if (!enoughWinnerSignal && !enoughBotSignal) continue;
    if (Math.abs(gap) < 0.12) continue;

    const bias = clamp(gap * 8, -4, 4);
    result[card] = {
      bias: Number(bias.toFixed(2)),
      winnerRate: Number(winnerRate.toFixed(3)),
      botPickRate: Number(botPickRate.toFixed(3)),
      winnerGames,
      seen,
      picked,
    };
  }

  return Object.fromEntries(
    Object.entries(result).sort((a, b) => Math.abs(b[1].bias) - Math.abs(a[1].bias) || a[0].localeCompare(b[0]))
  );
}

function main() {
  const bot = collectBotStats(choiceLimit);
  const real = collectWinnerStats(gameLimit);
  const bias = buildBias(bot, real);

  fs.mkdirSync(OUT_DIR, {recursive: true});
  fs.writeFileSync(OUT_FILE, JSON.stringify(bias, null, 2), 'utf8');

  const rows = Object.entries(bias);
  console.log(`Saved ${rows.length} card bias rows to ${OUT_FILE}`);
  console.log(`Choice logs used: ${bot.files}`);
  console.log(`Winner API games used: ${real.games}`);
  console.log('\nTop positive bias:');
  for (const [card, row] of rows.filter(([, r]) => r.bias > 0).slice(0, 12)) {
    console.log(`  ${card}: bias=+${row.bias} winner=${row.winnerRate} bot=${row.botPickRate}`);
  }
  console.log('\nTop negative bias:');
  for (const [card, row] of rows.filter(([, r]) => r.bias < 0).slice(0, 12)) {
    console.log(`  ${card}: bias=${row.bias} winner=${row.winnerRate} bot=${row.botPickRate}`);
  }
}

main();
