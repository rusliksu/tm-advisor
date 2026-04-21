#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_TOP = 20;
const DEFAULT_MIN_PLAYED = 5000;
const DEFAULT_MIN_OFFERED = 5000;
const DEFAULT_GAP = 20;

const TIER_SCORE = Object.freeze({
  S: 95,
  A: 82,
  B: 70,
  C: 58,
  D: 45,
  F: 25,
});

function usage() {
  return [
    'Usage: node tools/data/report-tfmstats-disagreements.js [options]',
    '',
    'Builds a markdown report comparing local evaluations.json with imported TFMStats data.',
    '',
    'Options:',
    '  --output PATH        Write report to PATH. Defaults to data/reports/tfmstats_disagreements_<date>.md.',
    '  --stdout             Print the markdown report to stdout as well.',
    `  --top N              Rows per section. Default: ${DEFAULT_TOP}.`,
    `  --min-played N       Minimum played sample for played/option stats. Default: ${DEFAULT_MIN_PLAYED}.`,
    `  --min-offered N      Minimum offered sample for starting-hand stats. Default: ${DEFAULT_MIN_OFFERED}.`,
    `  --gap N              Minimum absolute score gap for underrated/overrated sections. Default: ${DEFAULT_GAP}.`,
    '  --no-write           Do not write a file; useful for quick inspection.',
    '  --help               Show this help.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    output: '',
    stdout: false,
    write: true,
    top: DEFAULT_TOP,
    minPlayed: DEFAULT_MIN_PLAYED,
    minOffered: DEFAULT_MIN_OFFERED,
    gap: DEFAULT_GAP,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--stdout') {
      options.stdout = true;
    } else if (arg === '--no-write') {
      options.write = false;
    } else if (arg === '--output') {
      index += 1;
      if (index >= argv.length) throw new Error('--output requires a path');
      options.output = argv[index];
    } else if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
    } else if (arg === '--top') {
      index += 1;
      if (index >= argv.length) throw new Error('--top requires a number');
      options.top = parsePositiveInteger(argv[index], '--top');
    } else if (arg.startsWith('--top=')) {
      options.top = parsePositiveInteger(arg.slice('--top='.length), '--top');
    } else if (arg === '--min-played') {
      index += 1;
      if (index >= argv.length) throw new Error('--min-played requires a number');
      options.minPlayed = parsePositiveInteger(argv[index], '--min-played');
    } else if (arg.startsWith('--min-played=')) {
      options.minPlayed = parsePositiveInteger(arg.slice('--min-played='.length), '--min-played');
    } else if (arg === '--min-offered') {
      index += 1;
      if (index >= argv.length) throw new Error('--min-offered requires a number');
      options.minOffered = parsePositiveInteger(argv[index], '--min-offered');
    } else if (arg.startsWith('--min-offered=')) {
      options.minOffered = parsePositiveInteger(arg.slice('--min-offered='.length), '--min-offered');
    } else if (arg === '--gap') {
      index += 1;
      if (index >= argv.length) throw new Error('--gap requires a number');
      options.gap = parsePositiveInteger(argv[index], '--gap');
    } else if (arg.startsWith('--gap=')) {
      options.gap = parsePositiveInteger(arg.slice('--gap='.length), '--gap');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function readJson(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readOptionalJson(relativePath, fallback) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildEvaluationLookup(evaluations) {
  const lookup = new Map();
  for (const [key, entry] of Object.entries(evaluations || {})) {
    if (!entry || typeof entry !== 'object') continue;
    const name = entry.name || key;
    const score = typeof entry.score === 'number' ? entry.score : TIER_SCORE[entry.tier];
    if (typeof name !== 'string' || !name.trim() || typeof score !== 'number') continue;
    lookup.set(normalizeName(name), {
      name,
      score,
      tier: entry.tier || scoreToTier(score),
      openingHandBias: typeof entry.opening_hand_bias === 'number' ? entry.opening_hand_bias : null,
      cotdUrl: entry.cotd_url || '',
    });
  }
  return lookup;
}

function scoreToTier(score) {
  if (score >= 90) return 'S';
  if (score >= 78) return 'A';
  if (score >= 66) return 'B';
  if (score >= 54) return 'C';
  if (score >= 42) return 'D';
  return 'F';
}

function withPercentiles(rows, metric) {
  const sorted = [...rows]
    .filter((row) => typeof row[metric] === 'number' && Number.isFinite(row[metric]))
    .sort((a, b) => {
      const delta = b[metric] - a[metric];
      return delta || String(a.card).localeCompare(String(b.card));
    });
  const denominator = Math.max(sorted.length - 1, 1);
  const lookup = new Map();
  sorted.forEach((row, index) => {
    lookup.set(normalizeName(row.card), {
      ...row,
      percentile: 100 - Math.round((index * 100) / denominator),
    });
  });
  return lookup;
}

function avg(values) {
  const numeric = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length);
}

function buildRows(options) {
  const evaluations = readJson('data/evaluations.json');
  const played = readJson('data/tfmstats_card_stats.json');
  const optionStats = readJson('data/tfmstats_card_option_stats.json');
  const startingHands = readJson('data/tfmstats_starting_hand_stats.json');
  const evaluationByName = buildEvaluationLookup(evaluations);

  const playedRows = played
    .filter((row) => row && row.timesPlayed >= options.minPlayed && row.avgEloChange !== null)
    .filter((row) => evaluationByName.has(normalizeName(row.card)));
  const optionRows = optionStats
    .filter((row) => row && row.timesPlayed >= options.minPlayed && row.avgEloChange !== null)
    .filter((row) => evaluationByName.has(normalizeName(row.card)));
  const startingRows = startingHands
    .filter((row) => row && row.offeredGames >= options.minOffered && row.avgEloChangeKept !== null)
    .filter((row) => evaluationByName.has(normalizeName(row.card)));

  const playedPercentiles = withPercentiles(playedRows, 'avgEloChange');
  const optionPercentiles = withPercentiles(optionRows, 'avgEloChange');
  const startingPercentiles = withPercentiles(startingRows, 'avgEloChangeKept');
  const allKeys = new Set([
    ...playedPercentiles.keys(),
    ...optionPercentiles.keys(),
    ...startingPercentiles.keys(),
  ]);

  const rows = [];
  for (const key of allKeys) {
    const playedStat = playedPercentiles.get(key);
    const optionStat = optionPercentiles.get(key);
    const startingStat = startingPercentiles.get(key);
    const evaluation = evaluationByName.get(key);
    if (!evaluation) continue;

    const statScore = avg([
      playedStat?.percentile,
      optionStat?.percentile,
      startingStat?.percentile,
    ]);
    if (statScore === null) continue;

    rows.push({
      card: evaluation.name,
      tier: evaluation.tier,
      evalScore: evaluation.score,
      openingHandBias: evaluation.openingHandBias,
      statScore,
      gap: statScore - evaluation.score,
      cotdUrl: evaluation.cotdUrl,
      playedAvgEloChange: playedStat?.avgEloChange ?? null,
      playedTimes: playedStat?.timesPlayed ?? null,
      optionAvgEloChange: optionStat?.avgEloChange ?? null,
      optionTimes: optionStat?.timesPlayed ?? null,
      keptAvgEloChange: startingStat?.avgEloChangeKept ?? null,
      offeredGames: startingStat?.offeredGames ?? null,
      keepRate: startingStat?.keepRate ?? null,
    });
  }

  rows.sort((a, b) => String(a.card).localeCompare(String(b.card)));
  return {
    rows,
    coverage: {
      evaluations: evaluationByName.size,
      played: playedRows.length,
      optionStats: optionRows.length,
      startingHands: startingRows.length,
      compared: rows.length,
    },
  };
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return Number(value).toFixed(digits);
}

function formatInteger(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return String(Math.round(Number(value)));
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `${Math.round(Number(value) * 100)}%`;
}

function markdownTable(rows) {
  const lines = [
    '| Card | Our | Stat | Gap | Played dElo | Option dElo | Kept dElo | Keep | Sample |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of rows) {
    lines.push([
      escapeCell(row.card),
      `${formatInteger(row.evalScore)} ${row.tier}`,
      formatInteger(row.statScore),
      formatInteger(row.gap),
      formatNumber(row.playedAvgEloChange),
      formatNumber(row.optionAvgEloChange),
      formatNumber(row.keptAvgEloChange),
      formatPercent(row.keepRate),
      formatInteger(row.offeredGames || row.playedTimes || row.optionTimes),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  return lines.join('\n');
}

function manualReviewTable(rows) {
  const lines = [
    '| Card | Signal | Our | Stat | Gap | Played dElo | Option dElo | Kept dElo | Keep | Sample |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of rows) {
    lines.push([
      escapeCell(row.card),
      escapeCell(row.manualSignal || ''),
      `${formatInteger(row.evalScore)} ${row.tier}`,
      formatInteger(row.statScore),
      formatInteger(row.gap),
      formatNumber(row.playedAvgEloChange),
      formatNumber(row.optionAvgEloChange),
      formatNumber(row.keptAvgEloChange),
      formatPercent(row.keepRate),
      formatInteger(row.offeredGames || row.playedTimes || row.optionTimes),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  return lines.join('\n');
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|');
}

function classifyManualSignal(row, options) {
  const keepRate = row.keepRate;
  const kept = row.keptAvgEloChange;
  const played = row.playedAvgEloChange;
  const option = row.optionAvgEloChange;
  const lowKeep = keepRate !== null && keepRate <= 0.1;
  const conditionalKeep = keepRate !== null && keepRate <= 0.4;
  const highKeep = keepRate !== null && keepRate >= 0.65;
  const negativeKept = kept !== null && kept < -0.25;
  const positivePlayed = played !== null && played >= 0.4;
  const positiveOption = option !== null && option >= 0.35;
  const hasLocalOpenerPenalty = typeof row.openingHandBias === 'number' && row.openingHandBias <= -3;
  const hasLocalOpenerBonus = typeof row.openingHandBias === 'number' && row.openingHandBias >= 3;
  const cotdThreshold = Math.max(10, Math.floor(options.gap / 2));
  const cotdPositiveGap = row.cotdUrl && row.gap >= cotdThreshold;
  const cotdNegativeGap = row.cotdUrl && row.gap <= -cotdThreshold;
  const lowOrMidLocalScore = row.evalScore <= 76;
  const lowTier = row.tier === 'D' || row.tier === 'F';
  const lowActionabilityScore =
    (row.evalScore <= TIER_SCORE.C && row.gap <= -options.gap) ||
    (lowTier && row.gap < 0);
  const lowScorePositiveConditional =
    row.evalScore <= TIER_SCORE.D &&
    lowKeep &&
    row.gap >= Math.max(10, Math.floor(options.gap / 2)) &&
    (positivePlayed || positiveOption || (kept !== null && kept > 0));

  if (hasLocalOpenerPenalty && kept !== null && kept < 0) {
    return 'Already has local opener penalty';
  }

  if (cotdPositiveGap && hasLocalOpenerBonus && kept !== null && kept >= 0.3) {
    return 'Already has local opener bonus';
  }

  if (cotdPositiveGap && row.evalScore >= 82 && positiveOption && positivePlayed && kept !== null && kept >= 0.75) {
    return 'Already high local score; positive signal acknowledged';
  }

  if (cotdNegativeGap && lowOrMidLocalScore && !negativeKept && positiveOption && (positivePlayed || (kept !== null && kept >= 0))) {
    return 'COTD percentile gap; absolute results positive';
  }

  if (row.gap <= -options.gap && positiveOption && kept !== null && kept >= 0.1) {
    return 'Positive kept-start signal; percentile gap only';
  }

  if (row.gap <= -options.gap && positiveOption && positivePlayed && kept !== null && kept >= -0.25) {
    return 'Positive play results; opener caution';
  }

  if (lowActionabilityScore) {
    return 'Already low local score; deprioritize score cut';
  }

  if (lowScorePositiveConditional) {
    return 'Low-score conditional hit; selection bias acknowledged';
  }

  if (lowKeep && row.gap >= Math.max(10, Math.floor(options.gap / 2)) && (positivePlayed || positiveOption || (kept !== null && kept > 0))) {
    return 'Low-keep conditional hit; likely selection bias';
  }

  if (lowKeep && negativeKept && (positivePlayed || positiveOption)) {
    return 'Late conditional card; bad opener signal';
  }

  if (conditionalKeep && negativeKept && positiveOption) {
    return 'Requirement/timing card; bad opening keep';
  }

  if (highKeep && negativeKept) {
    return 'Over-kept opener; review opening bias before score';
  }

  if (negativeKept && positivePlayed && positiveOption) {
    return 'Playable later/free draw; bad opening keep';
  }

  return '';
}

function manualSignalPriority(row) {
  const signal = row.manualSignal || '';
  if (
    signal.startsWith('Already ') ||
    signal === 'COTD percentile gap; absolute results positive' ||
    signal === 'Low-score conditional hit; selection bias acknowledged' ||
    signal === 'Positive kept-start signal; percentile gap only' ||
    signal === 'Positive play results; opener caution'
  ) {
    return 1;
  }
  return 0;
}

function selectSections(rows, options) {
  const top = options.top;
  const classified = rows.map((row) => ({
    ...row,
    manualSignal: classifyManualSignal(row, options),
  }));
  const manualRows = classified
    .filter((row) => row.manualSignal)
    .sort((a, b) => {
      const priorityDelta = manualSignalPriority(a) - manualSignalPriority(b);
      const signalOrder = String(a.manualSignal).localeCompare(String(b.manualSignal));
      return priorityDelta || Math.abs(b.gap) - Math.abs(a.gap) || signalOrder || a.card.localeCompare(b.card);
    });
  const manualReview = manualRows
    .filter((row) => manualSignalPriority(row) === 0)
    .slice(0, top);
  const acknowledgedManualReview = manualRows
    .filter((row) => manualSignalPriority(row) > 0)
    .slice(0, top);
  const directReview = classified.filter((row) => !row.manualSignal);

  return {
    manualReview,
    acknowledgedManualReview,
    underrated: directReview
      .filter((row) => row.gap >= options.gap)
      .sort((a, b) => b.gap - a.gap || b.statScore - a.statScore || a.card.localeCompare(b.card))
      .slice(0, top),
    overrated: directReview
      .filter((row) => row.gap <= -options.gap)
      .sort((a, b) => a.gap - b.gap || a.statScore - b.statScore || a.card.localeCompare(b.card))
      .slice(0, top),
    highKeepLowScore: directReview
      .filter((row) => row.evalScore < TIER_SCORE.B && row.keepRate !== null && row.keepRate >= 0.9 && row.keptAvgEloChange >= 0.5)
      .sort((a, b) => b.keptAvgEloChange - a.keptAvgEloChange || b.keepRate - a.keepRate)
      .slice(0, top),
    negativeKeptHighScore: directReview
      .filter((row) => row.evalScore >= 65 && row.keptAvgEloChange !== null && row.keptAvgEloChange < 0)
      .sort((a, b) => a.keptAvgEloChange - b.keptAvgEloChange || b.evalScore - a.evalScore)
      .slice(0, top),
    cotdSensitive: directReview
      .filter((row) => row.cotdUrl && Math.abs(row.gap) >= Math.max(10, Math.floor(options.gap / 2)))
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.card.localeCompare(b.card))
      .slice(0, top),
  };
}

function renderSection(title, rows, fallback) {
  if (!rows.length) {
    return [`## ${title}`, '', fallback || 'No rows matched this section.'].join('\n');
  }
  return [`## ${title}`, '', markdownTable(rows)].join('\n');
}

function renderManualReviewSection(rows) {
  if (!rows.length) {
    return ['## Selection Bias / Timing Review', '', 'No actionable manual-review rows remain.'].join('\n');
  }
  return ['## Selection Bias / Timing Review', '', manualReviewTable(rows)].join('\n');
}

function renderAcknowledgedManualReviewSection(rows) {
  if (!rows.length) {
    return ['## Acknowledged Low-Actionability Signals', '', 'No acknowledged low-actionability rows matched.'].join('\n');
  }
  return ['## Acknowledged Low-Actionability Signals', '', manualReviewTable(rows)].join('\n');
}

function buildReport(options) {
  const manifest = readOptionalJson('data/tfmstats_import_manifest.json', {});
  const {rows, coverage} = buildRows(options);
  const sections = selectSections(rows, options);
  const stats = manifest.global_statistics || {};
  const reportDate = String(manifest.fetched_at || new Date().toISOString()).slice(0, 10);

  const parts = [
    `# TFMStats Disagreement Report - ${reportDate}`,
    '',
    '## Snapshot',
    '',
    `- Imported at: ${manifest.fetched_at || 'unknown'}`,
    `- Indexed games: ${formatInteger(stats.totalIndexedGames)}`,
    `- Players: ${formatInteger(stats.totalPlayers)}`,
    `- Card draws: ${formatInteger(stats.totalCardDraws)}`,
    `- Compared cards: ${coverage.compared}`,
    `- Coverage: evaluations ${coverage.evaluations}, played ${coverage.played}, option ${coverage.optionStats}, starting-hand ${coverage.startingHands}`,
    '',
    '## Method',
    '',
    `- Played and option sections require at least ${options.minPlayed} played samples.`,
    `- Starting-hand section requires at least ${options.minOffered} offered samples.`,
    '- Stat score is the average percentile of played dElo, option dElo, and kept starting-hand dElo when available.',
    '- Gap = stat score - local evaluation score. Positive means the card looks underrated locally; negative means it looks overrated locally.',
    '- Selection Bias / Timing Review removes obvious low-keep conditional hits and opener traps from the direct likely underrated/overrated queues.',
    '- Acknowledged Low-Actionability Signals lists already-penalized, already-low, or otherwise acknowledged rows so they do not masquerade as new action items.',
    '- TFMStats is observational BGA data, so these rows are review candidates, not automatic truth.',
    '',
    renderManualReviewSection(sections.manualReview),
    '',
    renderAcknowledgedManualReviewSection(sections.acknowledgedManualReview),
    '',
    renderSection('Likely Underrated', sections.underrated, 'No cards exceeded the positive gap threshold.'),
    '',
    renderSection('Likely Overrated', sections.overrated, 'No cards exceeded the negative gap threshold.'),
    '',
    renderSection('High Keep / Low Local Score', sections.highKeepLowScore, 'No low-scored cards had both high keep rate and strong kept dElo.'),
    '',
    renderSection('Negative Kept / High Local Score', sections.negativeKeptHighScore, 'No high-scored cards had negative kept dElo.'),
    '',
    renderSection('COTD-Sensitive Review Queue', sections.cotdSensitive, 'No COTD-linked cards crossed the review threshold.'),
    '',
  ];

  return {
    markdown: parts.join('\n'),
    reportDate,
    output: options.output || path.join('data', 'reports', `tfmstats_disagreements_${reportDate}.md`),
    counts: Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, value.length])),
  };
}

function writeReport(output, markdown) {
  const outputPath = path.isAbsolute(output) ? output : path.join(ROOT, output);
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, markdown, 'utf8');
  return outputPath;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error('');
    console.error(usage());
    return 1;
  }

  if (options.help) {
    console.log(usage());
    return 0;
  }

  try {
    const report = buildReport(options);
    if (options.stdout) {
      console.log(report.markdown);
    }
    if (options.write) {
      const outputPath = writeReport(report.output, report.markdown);
      console.log(`Wrote ${path.relative(ROOT, outputPath)}`);
    } else if (!options.stdout) {
      console.log('Report built successfully; no file written.');
    }
    console.log(`Sections: ${Object.entries(report.counts).map(([key, value]) => `${key}=${value}`).join(', ')}`);
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

module.exports = {
  buildReport,
  buildRows,
  main,
  parseArgs,
};

if (require.main === module) {
  process.exit(main());
}
