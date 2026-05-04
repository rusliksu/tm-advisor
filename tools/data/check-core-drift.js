#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const defaultLocalFile = path.join(repoRoot, 'data', 'evaluations.json');
const defaultCoreFile = path.resolve(repoRoot, '..', 'tm-tierlist-core', 'data', 'evaluations.json');

const tierRank = {
  F: 0,
  D: 1,
  C: 2,
  B: 3,
  A: 4,
  S: 5,
};

function parseArgs(argv) {
  const args = {
    localFile: defaultLocalFile,
    coreFile: defaultCoreFile,
    allowDrift: false,
    maxExamples: 25,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--local') {
      args.localFile = readArgValue(argv, ++i, arg);
    } else if (arg === '--core') {
      args.coreFile = readArgValue(argv, ++i, arg);
    } else if (arg === '--allow-drift') {
      args.allowDrift = true;
    } else if (arg === '--max-examples') {
      const value = Number(readArgValue(argv, ++i, arg));
      if (!Number.isInteger(value) || value < 1) {
        throw new Error('--max-examples must be a positive integer');
      }
      args.maxExamples = value;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  args.localFile = path.resolve(process.cwd(), args.localFile);
  args.coreFile = path.resolve(process.cwd(), args.coreFile);
  return args;
}

function readArgValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function usage() {
  return [
    'Usage: node tools/data/check-core-drift.js [options]',
    '',
    'Options:',
    `  --local <file>        Local evaluations file (default: ${path.relative(repoRoot, defaultLocalFile)})`,
    `  --core <file>         Core evaluations file (default: ${path.relative(repoRoot, defaultCoreFile)})`,
    '  --allow-drift        Report drift but exit 0',
    '  --max-examples <n>   Maximum examples per section (default: 25)',
    '',
    'Env:',
    '  TM_ALLOW_LOCAL_EVAL_DRIFT=1  Same as --allow-drift',
  ].join('\n');
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function scoredEntries(evaluations) {
  const rows = Array.isArray(evaluations)
    ? evaluations.map((entry, index) => [entry && entry.name ? entry.name : String(index), entry])
    : Object.entries(evaluations || {});
  const result = new Map();

  for (const [key, entry] of rows) {
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.score !== 'number' || typeof entry.tier !== 'string') continue;

    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name : key;
    result.set(name, {
      name,
      score: entry.score,
      tier: entry.tier,
      type: typeof entry.type === 'string' ? entry.type : '',
    });
  }

  return result;
}

function compareEvaluations(coreEvaluations, localEvaluations) {
  const core = scoredEntries(coreEvaluations);
  const local = scoredEntries(localEvaluations);
  const missingInLocal = [];
  const extraInLocal = [];
  const mismatches = [];

  for (const [name, coreEntry] of core.entries()) {
    const localEntry = local.get(name);
    if (!localEntry) {
      missingInLocal.push({name, core: coreEntry});
      continue;
    }
    if (coreEntry.score !== localEntry.score || coreEntry.tier !== localEntry.tier) {
      mismatches.push({
        name,
        core: coreEntry,
        local: localEntry,
        scoreDelta: localEntry.score - coreEntry.score,
        tierDelta: rankOf(localEntry.tier) - rankOf(coreEntry.tier),
      });
    }
  }

  for (const [name, localEntry] of local.entries()) {
    if (!core.has(name)) {
      extraInLocal.push({name, local: localEntry});
    }
  }

  mismatches.sort(compareMismatchRows);
  missingInLocal.sort(compareNamedRows);
  extraInLocal.sort(compareNamedRows);

  return {
    coreCount: core.size,
    localCount: local.size,
    mismatches,
    missingInLocal,
    extraInLocal,
    totalDrift: mismatches.length + missingInLocal.length + extraInLocal.length,
  };
}

function rankOf(tier) {
  return Object.prototype.hasOwnProperty.call(tierRank, tier) ? tierRank[tier] : -100;
}

function compareNamedRows(left, right) {
  return left.name.localeCompare(right.name);
}

function compareMismatchRows(left, right) {
  const scoreDelta = Math.abs(right.scoreDelta) - Math.abs(left.scoreDelta);
  if (scoreDelta !== 0) return scoreDelta;
  const tierDelta = Math.abs(right.tierDelta) - Math.abs(left.tierDelta);
  if (tierDelta !== 0) return tierDelta;
  return left.name.localeCompare(right.name);
}

function formatScore(entry) {
  return `${entry.score}/${entry.tier}`;
}

function formatDelta(value) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function formatReport(report, options) {
  const lines = [];
  const label = options.allowDrift ? 'WARNING' : 'FAILED';
  lines.push(`core drift check: ${label}`);
  lines.push(`core file: ${options.coreFile}`);
  lines.push(`local file: ${options.localFile}`);
  lines.push(`core scored entries: ${report.coreCount}`);
  lines.push(`local scored entries: ${report.localCount}`);
  lines.push(`score/tier mismatches: ${report.mismatches.length}`);
  lines.push(`missing in local: ${report.missingInLocal.length}`);
  lines.push(`extra in local: ${report.extraInLocal.length}`);

  if (report.mismatches.length > 0) {
    lines.push('');
    lines.push(`mismatch examples (max ${options.maxExamples}):`);
    for (const row of report.mismatches.slice(0, options.maxExamples)) {
      lines.push(
        `  - ${row.name}: core=${formatScore(row.core)} local=${formatScore(row.local)} ` +
        `scoreDelta=${formatDelta(row.scoreDelta)} tierDelta=${formatDelta(row.tierDelta)}`
      );
    }
  }

  if (report.missingInLocal.length > 0) {
    lines.push('');
    lines.push(`missing examples (max ${options.maxExamples}):`);
    for (const row of report.missingInLocal.slice(0, options.maxExamples)) {
      lines.push(`  - ${row.name}: core=${formatScore(row.core)} local=<missing>`);
    }
  }

  if (report.extraInLocal.length > 0) {
    lines.push('');
    lines.push(`extra examples (max ${options.maxExamples}):`);
    for (const row of report.extraInLocal.slice(0, options.maxExamples)) {
      lines.push(`  - ${row.name}: core=<missing> local=${formatScore(row.local)}`);
    }
  }

  if (options.allowDrift) {
    lines.push('');
    lines.push('drift allowed by --allow-drift or TM_ALLOW_LOCAL_EVAL_DRIFT=1');
  }

  return lines.join('\n');
}

function isAllowDriftEnv(env) {
  const value = String(env.TM_ALLOW_LOCAL_EVAL_DRIFT || '').toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function run(options, env = process.env, io = console) {
  if (options.help) {
    io.log(usage());
    return 0;
  }

  const localEvaluations = readJsonFile(options.localFile);
  const coreEvaluations = readJsonFile(options.coreFile);
  const allowDrift = options.allowDrift || isAllowDriftEnv(env);
  const report = compareEvaluations(coreEvaluations, localEvaluations);

  if (report.totalDrift === 0) {
    io.log(`core drift check: OK (${report.coreCount} scored entries)`);
    return 0;
  }

  io.error(formatReport(report, {...options, allowDrift}));
  return allowDrift ? 0 : 1;
}

function main(argv = process.argv.slice(2), env = process.env, io = console) {
  try {
    const options = parseArgs(argv);
    return run(options, env, io);
  } catch (error) {
    io.error(`core drift check: ERROR: ${error.message}`);
    io.error('');
    io.error(usage());
    return 2;
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  compareEvaluations,
  formatReport,
  main,
  parseArgs,
  run,
  scoredEntries,
};
