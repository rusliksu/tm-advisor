#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const GAME_LOG_DIR = path.join(ROOT, 'data', 'game_logs');
const REPORT_DIR = path.join(ROOT, 'data', 'reports');
const JSON_REPORT = path.join(REPORT_DIR, 'game_length_calibration.json');
const MD_REPORT = path.join(REPORT_DIR, 'game_length_calibration.md');

const DEFAULT_RUNTIME_BASELINE = {
  2: 11.5,
  3: 9,
  4: 8.5,
  5: 8,
};

const FEATURE_KEYS = [
  'wgt',
  'prelude',
  'colonies',
  'venus',
  'turmoil',
  'pathfinders',
  'ceo',
  'twoCorps',
];

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(value) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function firstBool(defaultValue, ...values) {
  for (const value of values) {
    const parsed = boolOrNull(value);
    if (parsed !== null) return parsed;
  }
  return defaultValue;
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

function round1(value) {
  return Number(value.toFixed(1));
}

function normalizeRecord(raw) {
  if (!raw) return null;
  const generation = finiteNumber(raw.generation);
  const playerCount = finiteNumber(raw.playerCount);
  if (!generation || !playerCount) return null;
  if (generation < 5 || generation > 20 || playerCount < 1 || playerCount > 6) return null;

  const flags = raw.flags || {};
  return {
    key: raw.key,
    generation,
    playerCount,
    sourceKind: raw.sourceKind,
    sourceLabel: raw.sourceLabel,
    flags: {
      wgt: flags.wgt,
      prelude: flags.prelude,
      colonies: flags.colonies,
      venus: flags.venus,
      turmoil: flags.turmoil,
      pathfinders: flags.pathfinders,
      ceo: flags.ceo,
      twoCorps: flags.twoCorps,
      requiresVenusCompletion: flags.requiresVenusCompletion,
    },
  };
}

function normalizeFlags(expansions, options, defaults = {}) {
  const exp = expansions || {};
  const opt = options || {};
  const optExp = opt.expansions || {};
  return {
    wgt: firstBool(defaults.wgt, opt.wgt, opt.solarPhaseOption, opt.worldGovernmentTerraforming),
    prelude: firstBool(defaults.prelude, exp.prelude, optExp.prelude, opt.preludeExtension),
    colonies: firstBool(defaults.colonies, exp.colonies, optExp.colonies, opt.coloniesExtension),
    venus: firstBool(defaults.venus, exp.venus, optExp.venus, opt.venusNextExtension),
    turmoil: firstBool(defaults.turmoil, exp.turmoil, optExp.turmoil, opt.turmoilExtension),
    pathfinders: firstBool(defaults.pathfinders, exp.pathfinders, optExp.pathfinders, opt.pathfindersExpansion),
    ceo: firstBool(defaults.ceo, exp.ceo, optExp.ceo, opt.ceosExtension, opt.ceoExtension),
    twoCorps: firstBool(defaults.twoCorps, opt.two_corps, opt.twoCorpsVariant),
    requiresVenusCompletion: firstBool(false, opt.requiresVenusTrackCompletion),
  };
}

function profileToken(value, yes, no) {
  if (value === true) return yes;
  if (value === false) return no;
  return 'unknown-' + yes;
}

function profileKey(record) {
  const f = record.flags || {};
  return [
    String(record.playerCount),
    profileToken(f.wgt, 'wgt', 'no-wgt'),
    profileToken(f.prelude, 'prelude', 'no-prelude'),
    profileToken(f.colonies, 'colonies', 'no-colonies'),
    profileToken(f.venus, 'venus', 'no-venus'),
    profileToken(f.turmoil, 'turmoil', 'no-turmoil'),
    profileToken(f.pathfinders, 'pathfinders', 'no-pathfinders'),
    profileToken(f.ceo, 'ceo', 'no-ceo'),
  ].join('|');
}

function stats(recordsOrNumbers) {
  const values = recordsOrNumbers
    .map((value) => typeof value === 'number' ? value : value.generation)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const n = values.length;
  if (!n) return {n: 0};
  const sum = values.reduce((acc, value) => acc + value, 0);
  const mean = sum / n;
  const median = n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2;
  const variance = values.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / n;
  return {
    n,
    mean: round1(mean),
    median: round1(median),
    min: values[0],
    max: values[n - 1],
    stdev: round1(Math.sqrt(variance)),
  };
}

function groupBy(records, keyFn) {
  const out = new Map();
  for (const record of records) {
    const key = keyFn(record);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(record);
  }
  return out;
}

function loadArchiveGames() {
  const out = [];
  const sources = [
    {
      path: path.join(ROOT, 'data', 'game_logs', 'games_db.json'),
      label: 'games_db',
      getGames: (json) => Object.values(json.games || {}),
    },
    {
      path: path.join(ROOT, 'data', 'batch_analysis', 'checkpoint.json'),
      label: 'batch_checkpoint',
      getGames: (json) => Object.values(json.fetched_games || {}),
    },
  ];

  for (const source of sources) {
    const json = readJson(source.path);
    if (!json) continue;
    for (const game of source.getGames(json)) {
      if (game.phase !== 'end') continue;
      const id = game.game_id || game.id;
      const generation = finiteNumber(game.generation);
      const playerCount = finiteNumber(game.player_count || game.players_count);
      const flags = normalizeFlags(game.expansions || {}, game.options || {}, {});
      out.push(normalizeRecord({
        key: 'archive:' + id,
        generation,
        playerCount,
        sourceKind: 'archive',
        sourceLabel: source.label,
        flags,
      }));
    }
  }
  return out.filter(Boolean);
}

function parseJsonLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

function loadLocalGameSnapshots() {
  if (!fs.existsSync(GAME_LOG_DIR)) return [];
  const records = [];
  const seen = new Set();
  const files = fs.readdirSync(GAME_LOG_DIR).filter((name) => /^game_.*\.jsonl$/.test(name));

  for (const fileName of files) {
    const events = parseJsonLines(path.join(GAME_LOG_DIR, fileName));
    let start = null;
    let maxGen = 0;
    let ended = false;
    for (const event of events) {
      if (event.event === 'game_start') start = event;
      const gen = finiteNumber(event.gen);
      if (gen) maxGen = Math.max(maxGen, gen);
      if (event.phase === 'end' || event.event === 'game_end') ended = true;
    }
    if (!start || !ended || !maxGen) continue;

    const rawId = String(start.game_id || fileName);
    const baseId = (rawId.match(/^(g\d+)/) || [rawId])[0];
    const date = String(start.ts || '').slice(0, 10) || 'unknown-date';
    const key = ['local-snapshot', baseId, date, maxGen, start.player_count].join(':');
    if (seen.has(key)) continue;
    seen.add(key);

    records.push(normalizeRecord({
      key,
      generation: maxGen,
      playerCount: start.player_count,
      sourceKind: 'recent_local',
      sourceLabel: 'local_game_snapshot',
      flags: normalizeFlags({}, {}, {
        wgt: boolOrNull(start.wgt),
        prelude: true,
        colonies: boolOrNull(start.colonies),
        venus: boolOrNull(start.venus),
        turmoil: boolOrNull(start.turmoil),
        pathfinders: boolOrNull(start.pathfinders),
        ceo: boolOrNull(start.ceos),
        twoCorps: null,
      }),
    }));
  }
  return records.filter(Boolean);
}

function walkJsonlFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dirPath, {withFileTypes: true})) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkJsonlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      out.push(fullPath);
    }
  }
  return out;
}

function readWatchSummaryForGame(gameId) {
  let maxGen = 0;
  let playerCount = 0;
  let ended = false;
  const files = walkJsonlFiles(GAME_LOG_DIR).filter((filePath) => path.basename(filePath).includes(gameId));
  for (const filePath of files) {
    for (const event of parseJsonLines(filePath)) {
      if (event.type === 'session_start' && Array.isArray(event.players)) {
        playerCount = event.players.length || playerCount;
      }
      const gen = finiteNumber(
        event.gen ||
        event.generation ||
        (event.decision_context && event.decision_context.game && event.decision_context.game.generation)
      );
      if (gen) maxGen = Math.max(maxGen, gen);
      if (event.ev === 'game_end' || event.type === 'game_end' || event.phase === 'end') ended = true;
    }
  }
  return {maxGen, playerCount, ended};
}

function parsePostgameSummaryJson(stdout) {
  const text = String(stdout || '').trim();
  if (!text.startsWith('postgame-summary-json')) return null;
  const jsonText = text.replace(/^postgame-summary-json\s*/, '');
  try {
    return JSON.parse(jsonText);
  } catch (_error) {
    return null;
  }
}

function loadLiveFinishSummaries() {
  const dir = path.join(GAME_LOG_DIR, 'live-logging');
  if (!fs.existsSync(dir)) return [];
  const byId = new Map();
  const files = fs.readdirSync(dir).filter((name) => name.includes('-finish-') && name.endsWith('.json'));

  for (const fileName of files) {
    const json = readJson(path.join(dir, fileName));
    if (!json) continue;
    const id = json.gameId || fileName.split('-finish-')[0];
    const current = byId.get(id) || {id, options: null, playerCount: 0, phase: null};
    for (const command of json.commands || []) {
      const parsed = parsePostgameSummaryJson(command.stdout);
      if (!parsed || !parsed.game) continue;
      current.options = parsed.game.options || current.options;
      current.playerCount = parsed.game.players_count || current.playerCount;
      current.phase = parsed.game.phase || current.phase;
    }
    byId.set(id, current);
  }

  const records = [];
  for (const summary of byId.values()) {
    const watch = readWatchSummaryForGame(summary.id);
    if (!watch.maxGen) continue;
    if (summary.phase && summary.phase !== 'end' && !watch.ended) continue;
    const options = summary.options || {};
    records.push(normalizeRecord({
      key: 'live-finish:' + summary.id,
      generation: watch.maxGen,
      playerCount: summary.playerCount || watch.playerCount,
      sourceKind: 'recent_local',
      sourceLabel: 'live_finish',
      flags: normalizeFlags({}, options, {
        wgt: true,
        prelude: true,
        colonies: null,
        venus: null,
        turmoil: false,
        pathfinders: false,
        ceo: false,
      }),
    }));
  }
  return records.filter(Boolean);
}

function dedupe(records) {
  const byKey = new Map();
  for (const record of records) {
    if (!record || !record.key) continue;
    const existing = byKey.get(record.key);
    if (!existing) {
      byKey.set(record.key, record);
      continue;
    }
    existing.sourceLabel += ',' + record.sourceLabel;
    for (const key of FEATURE_KEYS) {
      if (existing.flags[key] === null || existing.flags[key] === undefined) {
        existing.flags[key] = record.flags[key];
      }
    }
  }
  return Array.from(byKey.values());
}

function objectFromGroupedStats(grouped) {
  const out = {};
  for (const [key, records] of grouped.entries()) {
    out[key] = stats(records);
  }
  return out;
}

function computeFeatureDeltas(records) {
  const deltas = {};
  for (const feature of FEATURE_KEYS) {
    const perPlayer = {};
    let weightedDelta = 0;
    let weightTotal = 0;
    for (const [playerCount, group] of groupBy(records, (record) => String(record.playerCount)).entries()) {
      const yes = group.filter((record) => record.flags[feature] === true);
      const no = group.filter((record) => record.flags[feature] === false);
      if (yes.length < 5 || no.length < 5) continue;
      const yesStats = stats(yes);
      const noStats = stats(no);
      const delta = round1(yesStats.mean - noStats.mean);
      const weight = Math.min(yes.length, no.length);
      perPlayer[playerCount] = {
        yes: yesStats,
        no: noStats,
        delta,
      };
      weightedDelta += delta * weight;
      weightTotal += weight;
    }
    if (weightTotal > 0) {
      deltas[feature] = {
        weightedDelta: round1(weightedDelta / weightTotal),
        support: weightTotal,
        byPlayerCount: perPlayer,
      };
    }
  }
  return deltas;
}

function computeProfileStats(records, minN) {
  return Array.from(groupBy(records, profileKey).entries())
    .map(([key, group]) => ({key, ...stats(group)}))
    .filter((row) => row.n >= minN)
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

function buildRuntimeRecommendation(records) {
  const recent = records.filter((record) => record.sourceKind === 'recent_local');
  const archive = records.filter((record) => record.sourceKind === 'archive');
  const baselineByPlayerCount = {};
  const baselineSources = {};

  for (const playerCount of [2, 3, 4, 5]) {
    const pc = String(playerCount);
    const recentStats = stats(recent.filter((record) => record.playerCount === playerCount));
    const archiveStats = stats(archive.filter((record) => record.playerCount === playerCount));
    if (recentStats.n >= 8) {
      baselineByPlayerCount[pc] = roundTo(recentStats.mean, 0.5);
      baselineSources[pc] = {source: 'recent_local', ...recentStats};
    } else if (archiveStats.n >= 10) {
      baselineByPlayerCount[pc] = roundTo(archiveStats.mean, 0.5);
      baselineSources[pc] = {source: 'archive', ...archiveStats};
    } else {
      baselineByPlayerCount[pc] = DEFAULT_RUNTIME_BASELINE[playerCount] || DEFAULT_RUNTIME_BASELINE[5];
      baselineSources[pc] = {source: 'fallback', ...stats([])};
    }
  }

  const profileBaselines = {};
  for (const row of computeProfileStats(archive, 7)) {
    profileBaselines[row.key] = {
      value: roundTo(row.mean, 0.5),
      source: 'archive_profile',
      n: row.n,
      mean: row.mean,
    };
  }
  for (const row of computeProfileStats(recent, 5)) {
    profileBaselines[row.key] = {
      value: roundTo(row.mean, 0.5),
      source: 'recent_local_profile',
      n: row.n,
      mean: row.mean,
    };
  }

  return {
    baselineByPlayerCount,
    baselineSources,
    profileBaselines,
    notes: [
      'Prefer recent_local when n >= 8 for a player count; otherwise use archive if n >= 10.',
      'Exact profile baselines override player-count baselines when enough finished games share the same option profile.',
      'Local game_start logs do not store Prelude explicitly; current local server profiles are treated as Prelude-enabled.',
    ],
  };
}

function buildReport(records) {
  const bySource = objectFromGroupedStats(groupBy(records, (record) => record.sourceKind));
  const byPlayerCount = objectFromGroupedStats(groupBy(records, (record) => String(record.playerCount)));
  const recentByPlayerCount = objectFromGroupedStats(groupBy(
    records.filter((record) => record.sourceKind === 'recent_local'),
    (record) => String(record.playerCount)
  ));
  const archiveByPlayerCount = objectFromGroupedStats(groupBy(
    records.filter((record) => record.sourceKind === 'archive'),
    (record) => String(record.playerCount)
  ));

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      gamesDb: 'data/game_logs/games_db.json',
      batchCheckpoint: 'data/batch_analysis/checkpoint.json',
      liveLogging: 'data/game_logs/live-logging/*finish*.json',
      localSnapshots: 'data/game_logs/game_*.jsonl',
    },
    recordCount: records.length,
    overall: stats(records),
    bySource,
    byPlayerCount,
    recentByPlayerCount,
    archiveByPlayerCount,
    featureDeltas: computeFeatureDeltas(records),
    topProfiles: computeProfileStats(records, 5).slice(0, 30),
    runtimeRecommendation: buildRuntimeRecommendation(records),
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Game Length Calibration');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Finished games used: ${report.recordCount}`);
  lines.push('');
  lines.push('## Overall');
  lines.push('');
  lines.push(`Mean ${report.overall.mean}, median ${report.overall.median}, range ${report.overall.min}-${report.overall.max}, n=${report.overall.n}.`);
  lines.push('');
  lines.push('## By source');
  lines.push('');
  lines.push('| Source | n | mean | median | range |');
  lines.push('| --- | ---: | ---: | ---: | --- |');
  for (const [source, s] of Object.entries(report.bySource)) {
    lines.push(`| ${source} | ${s.n} | ${s.mean || ''} | ${s.median || ''} | ${s.min || ''}-${s.max || ''} |`);
  }
  lines.push('');
  lines.push('## By player count');
  lines.push('');
  lines.push('| Players | all n/mean | archive n/mean | recent local n/mean | runtime baseline | runtime source |');
  lines.push('| ---: | --- | --- | --- | ---: | --- |');
  for (const playerCount of Object.keys(report.runtimeRecommendation.baselineByPlayerCount).sort((a, b) => Number(a) - Number(b))) {
    const all = report.byPlayerCount[playerCount] || {};
    const archive = report.archiveByPlayerCount[playerCount] || {};
    const recent = report.recentByPlayerCount[playerCount] || {};
    const runtime = report.runtimeRecommendation.baselineByPlayerCount[playerCount];
    const source = report.runtimeRecommendation.baselineSources[playerCount] || {};
    lines.push(`| ${playerCount} | ${all.n || 0}/${all.mean || ''} | ${archive.n || 0}/${archive.mean || ''} | ${recent.n || 0}/${recent.mean || ''} | ${runtime} | ${source.source || ''} |`);
  }
  lines.push('');
  lines.push('## Main option deltas');
  lines.push('');
  lines.push('| Feature | weighted delta | support | comment |');
  lines.push('| --- | ---: | ---: | --- |');
  for (const [feature, delta] of Object.entries(report.featureDeltas)) {
    const comment = delta.weightedDelta < 0 ? 'shorter games when enabled' : 'longer games when enabled';
    lines.push(`| ${feature} | ${delta.weightedDelta} | ${delta.support} | ${comment} |`);
  }
  lines.push('');
  lines.push('## Frequent profiles');
  lines.push('');
  lines.push('| n | mean | median | profile |');
  lines.push('| ---: | ---: | ---: | --- |');
  for (const row of report.topProfiles.slice(0, 20)) {
    lines.push(`| ${row.n} | ${row.mean} | ${row.median} | ${row.key} |`);
  }
  lines.push('');
  lines.push('## Runtime recommendation');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.runtimeRecommendation, null, 2));
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const records = dedupe([
    ...loadArchiveGames(),
    ...loadLocalGameSnapshots(),
    ...loadLiveFinishSummaries(),
  ]);
  const report = buildReport(records);
  fs.mkdirSync(REPORT_DIR, {recursive: true});
  fs.writeFileSync(JSON_REPORT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(MD_REPORT, renderMarkdown(report), 'utf8');

  console.log(`Wrote ${path.relative(ROOT, JSON_REPORT)}`);
  console.log(`Wrote ${path.relative(ROOT, MD_REPORT)}`);
  console.log(`Finished games: ${report.recordCount}; overall mean ${report.overall.mean}, median ${report.overall.median}`);
  for (const [players, value] of Object.entries(report.runtimeRecommendation.baselineByPlayerCount)) {
    const source = report.runtimeRecommendation.baselineSources[players];
    console.log(`${players}p runtime baseline: ${value} (${source.source}, n=${source.n || 0}, mean=${source.mean || 'n/a'})`);
  }
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  buildReport,
  loadArchiveGames,
  loadLocalGameSnapshots,
  loadLiveFinishSummaries,
  normalizeFlags,
  profileKey,
  stats,
};
