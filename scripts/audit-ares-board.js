#!/usr/bin/env node
/**
 * audit-ares-board.js — Compare base cards vs :ares replacements on a real player-state fixture.
 *
 * Usage:
 *   node scripts/audit-ares-board.js
 *   node scripts/audit-ares-board.js data/game_logs/tm-player-g2b801b94551c-blue-gen11.json
 */

const fs = require('fs');
const path = require('path');
const {resolveGeneratedExtensionPath} = require('./lib/generated-extension-data');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_FIXTURE = path.join(ROOT, 'data', 'game_logs', 'tm-player-g2b801b94551c-blue-gen11.json');

const TM_BRAIN = require(path.join(ROOT, 'extension', 'tm-brain.js'));
const CARD_TAGS = require(resolveGeneratedExtensionPath('card_tags.js'));
const CARD_VP = require(resolveGeneratedExtensionPath('card_vp.js'));
const CARD_DATA = require(resolveGeneratedExtensionPath('card_data.js'));

function loadBrowserVar(targetPath, varName, fallback = {}) {
  const full = path.isAbsolute(targetPath) ? targetPath : path.join(ROOT, targetPath);
  if (!fs.existsSync(full)) return fallback;
  const raw = fs.readFileSync(full, 'utf8').replace(/\bconst\b/g, 'var');
  return (new Function(raw + `\nreturn typeof ${varName}!=="undefined" ? ${varName} : {};`))();
}

const TM_CARD_DISCOUNTS = loadBrowserVar(resolveGeneratedExtensionPath('synergy_tables.json.js'), 'TM_CARD_DISCOUNTS');
const reqs = loadBrowserVar(resolveGeneratedExtensionPath('card_tag_reqs.js'), 'TM_CARD_TAG_REQS');
const globalReqs = loadBrowserVar(resolveGeneratedExtensionPath('card_tag_reqs.js'), 'TM_CARD_GLOBAL_REQS');
const TM_CARD_EFFECTS = loadBrowserVar(resolveGeneratedExtensionPath('card_effects.json.js'), 'TM_CARD_EFFECTS');
const TM_RATINGS = loadBrowserVar(resolveGeneratedExtensionPath('ratings.json.js'), 'TM_RATINGS');

TM_BRAIN.setCardData(
  CARD_TAGS,
  CARD_VP,
  CARD_DATA,
  globalReqs,
  reqs,
  TM_CARD_EFFECTS,
  TM_RATINGS,
);

const PAIRS = [
  'Capital',
  'Commercial District',
  'Deimos Down',
  'Ecological Zone',
  'Great Dam',
  'Industrial Center',
  'Magnetic Field Generators',
  'Mining Area',
  'Mining Rights',
  'Mohole Area',
  'Natural Preserve',
  'Nuclear Zone',
  'Restricted Area',
];

function score(name, state) {
  const data = CARD_DATA[name] || {};
  const cost = data.cost ?? 0;
  return TM_BRAIN.scoreCard({ name, cost, calculatedCost: cost }, state);
}

function classifyDelta(delta) {
  if (delta >= 6) return 'stronger';
  if (delta >= 2) return 'slightly stronger';
  if (delta <= -6) return 'weaker';
  if (delta <= -2) return 'slightly weaker';
  return 'near-equal';
}

function main() {
  const fixturePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_FIXTURE;
  const state = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  const game = state.game || {};
  const me = state.thisPlayer || {};

  console.log(`Fixture: ${fixturePath}`);
  console.log(`Game: ${game.gameId || game.id || 'unknown'} | Gen ${game.generation ?? '?'} | Ares=${!!game?.gameOptions?.expansions?.ares}`);
  console.log(`Player: ${me.name || 'unknown'} (${me.color || '?'})`);
  console.log('');
  console.log('Card'.padEnd(30) + 'Base'.padStart(8) + 'Ares'.padStart(8) + 'Delta'.padStart(8) + '  Verdict');
  console.log('-'.repeat(70));

  const rows = PAIRS.map((baseName) => {
    const aresName = `${baseName}:ares`;
    const baseScore = score(baseName, state);
    const aresScore = score(aresName, state);
    const delta = Math.round((aresScore - baseScore) * 10) / 10;
    return {
      baseName,
      baseScore: Math.round(baseScore * 10) / 10,
      aresScore: Math.round(aresScore * 10) / 10,
      delta,
      verdict: classifyDelta(delta),
    };
  }).sort((a, b) => b.delta - a.delta);

  for (const row of rows) {
    console.log(
      row.baseName.padEnd(30) +
      String(row.baseScore).padStart(8) +
      String(row.aresScore).padStart(8) +
      String(row.delta).padStart(8) +
      '  ' + row.verdict,
    );
  }
}

main();
