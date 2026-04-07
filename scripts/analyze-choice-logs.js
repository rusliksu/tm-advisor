#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'data', 'game_logs', 'choice_logs');

const args = process.argv.slice(2);
let limit = 10;
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

function collectFiles() {
  if (!fs.existsSync(LOG_DIR)) return [];
  return fs.readdirSync(LOG_DIR)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => {
      const full = path.join(LOG_DIR, name);
      const stat = fs.statSync(full);
      return {name, full, mtime: stat.mtimeMs};
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}

function pickLabel(label) {
  return String(label || '')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCardNamesFromOption(opt) {
  if (!opt) return [];
  if (Array.isArray(opt.cards)) return opt.cards.filter(Boolean);
  return [];
}

function extractPickedCards(picked) {
  if (!picked) return [];
  if (Array.isArray(picked)) return picked.filter(Boolean);
  if (typeof picked === 'string') return [picked];
  if (picked && typeof picked === 'object') {
    if (Array.isArray(picked.picked)) return picked.picked.filter(Boolean);
    if (typeof picked.picked === 'string' && picked.picked && picked.picked !== 'option') return [picked.picked];
  }
  return [];
}

function extractPickedAction(ev) {
  if (ev.waitingType !== 'or' || !Array.isArray(ev.options) || !ev.picked || typeof ev.picked !== 'object') {
    return null;
  }
  const idx = ev.picked.index;
  if (typeof idx !== 'number') return null;
  const chosen = ev.options[idx];
  if (!chosen) return null;
  const title = pickLabel(chosen.title || chosen.type || '?');
  const cards = extractCardNamesFromOption(chosen);
  return {
    type: chosen.type || '?',
    title,
    cards,
    key: cards.length > 0 ? `${title} :: ${cards.join(' | ')}` : title,
  };
}

function parseJsonl(file) {
  const lines = fs.readFileSync(file.full, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean);
  return lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function summarize(events) {
  const byType = new Map();
  const cardPicked = new Map();
  const cardSeen = new Map();
  const actionPicked = new Map();
  const actionSeen = new Map();
  const projectChoices = [];

  for (const ev of events) {
    inc(byType, ev.waitingType || '?');

    if (Array.isArray(ev.options)) {
      if (ev.waitingType === 'card') {
        for (const name of ev.options) inc(cardSeen, name);
        const picked = extractPickedCards(ev.picked);
        for (const name of picked) inc(cardPicked, name);
        if (picked.length > 0) {
          projectChoices.push({
            gameId: ev.gameId,
            generation: ev.generation,
            player: ev.playerName,
            options: ev.options.slice(0, 10),
            picked,
          });
        }
      }
      if (ev.waitingType === 'or') {
        for (const opt of ev.options) {
          const cards = extractCardNamesFromOption(opt);
          for (const name of cards) inc(cardSeen, name);
          inc(actionSeen, pickLabel(opt?.title || opt?.type || '?'));
        }
        const picked = extractPickedCards(ev.picked);
        for (const name of picked) {
          inc(cardPicked, name);
        }
        const pickedAction = extractPickedAction(ev);
        if (pickedAction) {
          inc(actionPicked, pickedAction.title);
          if (pickedAction.cards.length > 0) {
            projectChoices.push({
              gameId: ev.gameId,
              generation: ev.generation,
              player: ev.playerName,
              options: ev.options.map((opt) => pickLabel(opt?.title || opt?.type || '?')).slice(0, 8),
              picked: pickedAction.cards,
              action: pickedAction.title,
            });
          } else {
            projectChoices.push({
              gameId: ev.gameId,
              generation: ev.generation,
              player: ev.playerName,
              options: ev.options.map((opt) => pickLabel(opt?.title || opt?.type || '?')).slice(0, 8),
              picked: [pickedAction.title],
              action: pickedAction.title,
            });
          }
        }
      }
    }
  }

  const topPicked = [...cardPicked.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([card, picks]) => ({card, picks, seen: cardSeen.get(card) || 0}));

  const topSeen = [...cardSeen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([card, seen]) => ({card, seen, picks: cardPicked.get(card) || 0}));

  const topActions = [...actionPicked.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([action, picks]) => ({action, picks, seen: actionSeen.get(action) || 0}));

  const strongestPickRates = [...cardSeen.entries()]
    .filter(([, seen]) => seen >= 3)
    .map(([card, seen]) => ({card, seen, picks: cardPicked.get(card) || 0}))
    .sort((a, b) => (b.picks / b.seen) - (a.picks / a.seen) || b.seen - a.seen)
    .slice(0, 20)
    .map((row) => ({...row, pickRate: Number((row.picks / row.seen).toFixed(3))}));

  return {
    totalEvents: events.length,
    waitingTypes: Object.fromEntries(byType),
    topPicked,
    topSeen,
    topActions,
    strongestPickRates,
    sampleChoices: projectChoices.slice(0, 10),
  };
}

function main() {
  const files = collectFiles();
  const events = files.flatMap(parseJsonl);
  const summary = summarize(events);

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`Choice log files analyzed: ${files.length}`);
  console.log(`Total choice events: ${summary.totalEvents}`);
  console.log(`Waiting types: ${Object.entries(summary.waitingTypes).map(([k, v]) => `${k}=${v}`).join(', ') || '-'}`);

  console.log('\nTop picked cards:');
  for (const row of summary.topPicked) {
    console.log(`  ${row.card}: picked=${row.picks} seen=${row.seen}`);
  }

  console.log('\nTop seen cards:');
  for (const row of summary.topSeen) {
    console.log(`  ${row.card}: seen=${row.seen} picked=${row.picks}`);
  }

  console.log('\nTop picked actions:');
  for (const row of summary.topActions) {
    console.log(`  ${row.action}: picked=${row.picks} seen=${row.seen}`);
  }

  console.log('\nStrongest pick rates (seen >= 3):');
  for (const row of summary.strongestPickRates) {
    console.log(`  ${row.card}: rate=${row.pickRate} picked=${row.picks}/${row.seen}`);
  }

  console.log('\nSample choices:');
  for (const row of summary.sampleChoices) {
    const suffix = row.action ? ` via ${row.action}` : '';
    console.log(`  ${row.gameId} gen=${row.generation} ${row.player}: picked=${JSON.stringify(row.picked)}${suffix} from ${row.options.slice(0, 5).join(', ')}`);
  }
}

main();
