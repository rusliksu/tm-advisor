#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_CHOICE_LOG_DIR = path.join(ROOT, 'data', 'game_logs', 'choice_logs');

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    dir: DEFAULT_CHOICE_LOG_DIR,
    last: 10,
    json: false,
    help: false,
    files: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--dir') {
      result.dir = path.resolve(args[i + 1] || result.dir);
      i++;
    } else if (arg === '--last') {
      result.last = Math.max(1, parseInt(args[i + 1], 10) || result.last);
      i++;
    } else {
      result.files.push(path.resolve(arg));
    }
  }

  return result;
}

function formatUsage() {
  return [
    'Usage:',
    '  node tools/bot/analyze-choice-debt.js [choice-log.jsonl ...]',
    '  node tools/bot/analyze-choice-debt.js --last 10',
    '  node tools/bot/analyze-choice-debt.js --dir data/game_logs/choice_logs --last 20',
    '  node tools/bot/analyze-choice-debt.js --json',
  ].join('\n');
}

function listRecentChoiceLogs(dir, last) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^bot-choice-.*\.jsonl$/.test(name))
    .map((name) => {
      const file = path.join(dir, name);
      return {file, mtimeMs: fs.statSync(file).mtimeMs};
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, Math.max(1, last || 10))
    .map((entry) => entry.file);
}

function resolveFiles(options) {
  if (options.files.length > 0) return options.files;
  return listRecentChoiceLogs(options.dir, options.last);
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return [];
  return text.split(/\r?\n/)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean);
}

function normalizeCardName(card) {
  if (!card) return null;
  if (typeof card === 'string') return card;
  return card.name || card.card || null;
}

function normalizePickedCards(picked) {
  if (!picked) return [];
  if (typeof picked === 'string') return [picked];
  if (Array.isArray(picked)) return picked.map(normalizeCardName).filter(Boolean);
  if (typeof picked !== 'object') return [];

  if (picked.responseType === 'projectCard') {
    return normalizePickedCards(picked.picked || picked.card || picked.cards);
  }
  if (picked.responseType === 'card') {
    return normalizePickedCards(picked.picked || picked.cards || picked.card);
  }
  return normalizePickedCards(picked.picked || picked.cards || picked.card);
}

function optionTitle(entry, index) {
  const opt = Array.isArray(entry?.options)
    ? entry.options.find((candidate) => candidate && candidate.index === index)
    : null;
  return String(opt?.title || '').toLowerCase();
}

function optionCards(option) {
  return Array.isArray(option?.cards) ? option.cards.map(normalizeCardName).filter(Boolean) : [];
}

function isBuyEntry(entry) {
  const title = String(entry?.title || '').toLowerCase();
  if (title.includes('select card') && title.includes('buy')) return true;
  if (title.includes('select up to')) return true;
  if (entry?.picked?.responseType === 'card') {
    const pickedOptionTitle = optionTitle(entry, entry.picked.index);
    return pickedOptionTitle.includes('select card') && pickedOptionTitle.includes('buy');
  }
  return false;
}

function isSellEntry(entry) {
  const title = String(entry?.title || '').toLowerCase();
  if (title.includes('sell patents')) return true;
  if (entry?.picked?.responseType === 'card') {
    return optionTitle(entry, entry.picked.index).includes('sell patents');
  }
  return false;
}

function getRecord(records, entry, cardName) {
  const gameId = entry.gameId || '?';
  const color = entry.color || entry.playerName || entry.playerId || '?';
  const key = `${gameId}|${color}|${cardName}`;
  if (!records.has(key)) {
    records.set(key, {
      key,
      gameId,
      color,
      playerName: entry.playerName || null,
      card: cardName,
      buyGen: entry.generation ?? entry.gen ?? null,
      visible: 0,
      firstVisibleGen: null,
      lastVisible: null,
      played: false,
      playedGen: null,
      sold: false,
      soldGen: null,
    });
  }
  return records.get(key);
}

function summarizeReasoning(reasoning) {
  if (!Array.isArray(reasoning)) return [];
  return reasoning
    .filter((line) => {
      const text = String(line);
      return text.includes('hand(') ||
        text.includes('DECISION') ||
        text.includes('late-cleanup sell') ||
        text.includes('late-core') ||
        text.includes('BUY:');
    })
    .slice(-4);
}

function analyzeEntries(entries, meta = {}) {
  const records = new Map();
  let buyEvents = 0;
  let playEvents = 0;
  let sellActions = 0;
  let lateCleanupSells = 0;

  for (const entry of entries || []) {
    const pickedCards = normalizePickedCards(entry?.picked);

    if (isBuyEntry(entry)) {
      buyEvents++;
      for (const cardName of pickedCards) getRecord(records, entry, cardName);
    }

    for (const option of (Array.isArray(entry?.options) ? entry.options : [])) {
      const title = String(option?.title || '').toLowerCase();
      if (!title.includes('play project card')) continue;
      for (const cardName of optionCards(option)) {
        const record = records.get(`${entry.gameId || '?'}|${entry.color || entry.playerName || entry.playerId || '?'}|${cardName}`);
        if (!record) continue;
        record.visible++;
        if (record.firstVisibleGen == null) record.firstVisibleGen = entry.generation ?? entry.gen ?? null;
        record.lastVisible = {
          gen: entry.generation ?? entry.gen ?? null,
          mc: entry.stateSummary?.mc ?? null,
          hand: entry.stateSummary?.handCount ?? null,
          picked: entry.picked?.picked ?? entry.picked ?? null,
          reasoning: summarizeReasoning(entry.reasoning),
        };
      }
    }

    if (entry?.picked?.responseType === 'projectCard') {
      playEvents++;
      for (const cardName of pickedCards) {
        const record = records.get(`${entry.gameId || '?'}|${entry.color || entry.playerName || entry.playerId || '?'}|${cardName}`);
        if (record) {
          record.played = true;
          record.playedGen = entry.generation ?? entry.gen ?? null;
        }
      }
    }

    if (isSellEntry(entry)) {
      const soldCards = pickedCards;
      if (soldCards.length > 0) {
        sellActions++;
        if ((entry.reasoning || []).some((line) => String(line).includes('late-cleanup sell'))) {
          lateCleanupSells++;
        }
      }
      for (const cardName of soldCards) {
        const record = records.get(`${entry.gameId || '?'}|${entry.color || entry.playerName || entry.playerId || '?'}|${cardName}`);
        if (record) {
          record.sold = true;
          record.soldGen = entry.generation ?? entry.gen ?? null;
        }
      }
    }
  }

  const rows = Array.from(records.values());
  const summary = {
    files: meta.files || [],
    entries: entries.length,
    buyEvents,
    playEvents,
    sellActions,
    lateCleanupSells,
    bought: rows.length,
    played: rows.filter((record) => record.played).length,
    sold: rows.filter((record) => !record.played && record.sold).length,
    dead: rows.filter((record) => !record.played && !record.sold).length,
    visibleDead: rows.filter((record) => !record.played && !record.sold && record.visible > 0).length,
    neverVisibleDead: rows.filter((record) => !record.played && !record.sold && record.visible === 0).length,
  };

  const cards = {};
  for (const record of rows) {
    if (!cards[record.card]) {
      cards[record.card] = {
        card: record.card,
        bought: 0,
        played: 0,
        sold: 0,
        dead: 0,
        visibleDead: 0,
        neverVisibleDead: 0,
        visibleTotal: 0,
        examples: [],
      };
    }
    const stat = cards[record.card];
    stat.bought++;
    stat.visibleTotal += record.visible;
    if (record.played) stat.played++;
    else if (record.sold) stat.sold++;
    else {
      stat.dead++;
      if (record.visible > 0) stat.visibleDead++;
      else stat.neverVisibleDead++;
      if (stat.examples.length < 3) stat.examples.push(record);
    }
  }

  const topDeadCards = Object.values(cards)
    .filter((stat) => stat.dead > 0)
    .sort((a, b) =>
      b.dead - a.dead ||
      b.visibleDead - a.visibleDead ||
      b.neverVisibleDead - a.neverVisibleDead ||
      a.card.localeCompare(b.card))
    .slice(0, 20);

  const visibleDeadExamples = rows
    .filter((record) => !record.played && !record.sold && record.visible > 0)
    .sort((a, b) => b.visible - a.visible)
    .slice(0, 12);
  const neverVisibleExamples = rows
    .filter((record) => !record.played && !record.sold && record.visible === 0)
    .slice(0, 12);

  return {summary, cards, topDeadCards, visibleDeadExamples, neverVisibleExamples};
}

function formatRecord(record) {
  const last = record.lastVisible || {};
  const reason = (last.reasoning || []).join(' | ');
  const suffix = reason ? ` :: ${reason}` : '';
  return `- ${record.card} ${record.gameId}/${record.color} buyG${record.buyGen ?? '?'} visible=${record.visible} lastG${last.gen ?? '?'} mc=${last.mc ?? '?'} hand=${last.hand ?? '?'}${suffix}`;
}

function formatReport(stats) {
  const s = stats.summary;
  const lines = [];
  lines.push('Choice Debt Report');
  lines.push(`Files: ${s.files.length || 0} | Entries: ${s.entries}`);
  lines.push(`Bought: ${s.bought} | Played: ${s.played} | Sold: ${s.sold} | Dead: ${s.dead}`);
  lines.push(`Visible-dead: ${s.visibleDead} | Never-visible-dead: ${s.neverVisibleDead}`);
  lines.push(`Sell actions: ${s.sellActions} | Late-cleanup sells: ${s.lateCleanupSells}`);
  lines.push('');
  lines.push('Top Dead Cards');
  if (stats.topDeadCards.length === 0) {
    lines.push('- none');
  } else {
    for (const stat of stats.topDeadCards.slice(0, 12)) {
      lines.push(`- ${stat.card}: dead=${stat.dead}, visibleDead=${stat.visibleDead}, neverVisible=${stat.neverVisibleDead}, bought=${stat.bought}, sold=${stat.sold}, played=${stat.played}`);
    }
  }
  lines.push('');
  lines.push('Visible-Dead Examples');
  if (stats.visibleDeadExamples.length === 0) lines.push('- none');
  else stats.visibleDeadExamples.slice(0, 8).forEach((record) => lines.push(formatRecord(record)));
  lines.push('');
  lines.push('Never-Visible Examples');
  if (stats.neverVisibleExamples.length === 0) lines.push('- none');
  else stats.neverVisibleExamples.slice(0, 8).forEach((record) => lines.push(`- ${record.card} ${record.gameId}/${record.color} buyG${record.buyGen ?? '?'}`));
  return lines.join('\n');
}

function analyzeFiles(files) {
  const entries = files.flatMap(readJsonl);
  return analyzeEntries(entries, {files});
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(formatUsage());
    return;
  }
  const files = resolveFiles(options);
  const stats = analyzeFiles(files);
  if (options.json) console.log(JSON.stringify(stats, null, 2));
  else console.log(formatReport(stats));
}

if (require.main === module) main();

module.exports = {
  DEFAULT_CHOICE_LOG_DIR,
  analyzeEntries,
  analyzeFiles,
  formatReport,
  normalizePickedCards,
  parseArgs,
  readJsonl,
  resolveFiles,
};
