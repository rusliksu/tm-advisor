#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const LIVE_LOG_DIR = path.join(ROOT, 'data', 'game_logs', 'live-logging');
const DEFAULT_BASE_URL = process.env.TM_BASE_URL || 'https://tm.knightbyte.win';

function usage() {
  return [
    'Usage:',
    '  node tools/advisor/finish-live-logging.js <gameId> [options]',
    '',
    'Options:',
    '  --server-url URL  TM server URL for postgame summary (default: TM_BASE_URL or tm.knightbyte.win)',
    '  --manifest FILE   Use a specific start-live-logging manifest',
    '  --no-stop         Do not stop PIDs from the manifest',
    '  --dry-run         Print actions without stopping processes or writing reports',
    '  --json            Also save postgame summary JSON',
    '  --help            Show this help',
  ].join('\n');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    gameId: null,
    serverUrl: DEFAULT_BASE_URL.replace(/\/$/, ''),
    manifest: null,
    stop: true,
    dryRun: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else if (arg === '--server-url' && args[i + 1]) {
      out.serverUrl = args[++i].replace(/\/$/, '');
    } else if (arg === '--manifest' && args[i + 1]) {
      out.manifest = path.resolve(args[++i]);
    } else if (arg === '--no-stop') {
      out.stop = false;
    } else if (arg === '--dry-run') {
      out.dryRun = true;
    } else if (arg === '--json') {
      out.json = true;
    } else if (!arg.startsWith('--') && !out.gameId) {
      out.gameId = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function listManifestFiles(gameId) {
  if (!fs.existsSync(LIVE_LOG_DIR)) return [];
  return fs.readdirSync(LIVE_LOG_DIR)
    .filter((name) => name.endsWith('-manifest.json'))
    .filter((name) => !gameId || name.startsWith(`${gameId}-`))
    .map((name) => {
      const file = path.join(LIVE_LOG_DIR, name);
      return {file, mtimeMs: fs.statSync(file).mtimeMs};
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((entry) => entry.file);
}

function readManifest(options) {
  const file = options.manifest || listManifestFiles(options.gameId)[0] || null;
  if (!file) return {file: null, data: null};
  return {file, data: JSON.parse(fs.readFileSync(file, 'utf8'))};
}

function commandLine(command, args) {
  return [command, ...args].map((part) => {
    const text = String(part);
    return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
  }).join(' ');
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_err) {
    return false;
  }
}

function stopProcess(pid) {
  if (!pid) return {pid, aliveBefore: false, stopped: false};
  const aliveBefore = isProcessAlive(pid);
  if (!aliveBefore) return {pid, aliveBefore, stopped: false};
  try {
    process.kill(pid, 'SIGTERM');
    return {pid, aliveBefore, stopped: true};
  } catch (err) {
    return {pid, aliveBefore, stopped: false, error: err.message};
  }
}

function runCommand(label, command, args, options) {
  const rendered = commandLine(command, args);
  if (options.dryRun) {
    return {label, command, args, commandLine: rendered, skipped: true, status: null, stdout: '', stderr: ''};
  }
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: {...process.env, TM_BASE_URL: options.serverUrl},
    shell: false,
  });
  return {
    label,
    command,
    args,
    commandLine: rendered,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : null,
  };
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text || '', 'utf8');
}

function countJsonlEntries(file) {
  if (!fs.existsSync(file)) return 0;
  const text = fs.readFileSync(file, 'utf8').trim();
  return text ? text.split('\n').filter(Boolean).length : 0;
}

function parseDecisionCount(shadowAnalyzeOutput) {
  const match = String(shadowAnalyzeOutput || '').match(/Total decisions:\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function buildWarnings(summary, startManifest) {
  const warnings = [];
  const decisionTraces = summary.outputs.decisionTraces;
  if (decisionTraces === 0) {
    warnings.push(
      'No decision traces: logger likely started after game end, no decision prompts occurred, or server-input/shadow logs were not captured.'
    );
  }
  if (!startManifest) {
    warnings.push(
      'No start manifest found: finish could still merge/analyze existing logs, but cannot verify or stop start-live-logging processes.'
    );
  }
  return warnings;
}

function buildPaths(gameId) {
  return {
    shadow: path.join(ROOT, 'data', 'shadow', `shadow-${gameId}.jsonl`),
    merged: path.join(ROOT, 'data', 'shadow', 'merged', `merged-${gameId}.jsonl`),
    analyzeReport: path.join(LIVE_LOG_DIR, `${gameId}-shadow-analyze.txt`),
    postgameReport: path.join(LIVE_LOG_DIR, `${gameId}-postgame-summary.txt`),
    postgameJson: path.join(LIVE_LOG_DIR, `${gameId}-postgame-summary.json`),
    loggerQualityReport: path.join(LIVE_LOG_DIR, `${gameId}-logger-quality.txt`),
    loggerQualityJson: path.join(LIVE_LOG_DIR, `${gameId}-logger-quality.json`),
    finishManifest: path.join(LIVE_LOG_DIR, `${gameId}-finish-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
  };
}

function collectProcesses(manifest) {
  return Array.isArray(manifest?.processes) ? manifest.processes : [];
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.gameId) throw new Error('gameId is required');

  const {file: startManifestFile, data: startManifest} = readManifest(options);
  const gameId = options.gameId;
  const paths = buildPaths(gameId);

  const processStops = [];
  if (options.stop) {
    for (const proc of collectProcesses(startManifest)) {
      if (!proc.pid) continue;
      processStops.push(options.dryRun
        ? {pid: proc.pid, name: proc.name, dryRun: true, aliveBefore: isProcessAlive(proc.pid)}
        : {name: proc.name, ...stopProcess(proc.pid)});
    }
  }

  const commands = [];
  commands.push(runCommand('shadow-merge', process.execPath, ['bot/shadow-merge.js', gameId], options));
  const analyze = runCommand('shadow-analyze', process.execPath, ['bot/shadow-analyze.js', paths.merged], options);
  commands.push(analyze);
  const postgame = runCommand('postgame-summary', process.env.PYTHON || 'python', [
    'tools/advisor/postgame-summary.py',
    gameId,
    '--base-url',
    options.serverUrl,
  ], options);
  commands.push(postgame);
  const loggerQuality = runCommand('logger-quality', process.env.PYTHON || 'python', [
    'tools/advisor/logger-quality.py',
    gameId,
  ], options);
  commands.push(loggerQuality);
  const loggerQualityJson = runCommand('logger-quality-json', process.env.PYTHON || 'python', [
    'tools/advisor/logger-quality.py',
    gameId,
    '--json',
  ], options);
  commands.push(loggerQualityJson);

  let postgameJson = null;
  if (options.json) {
    postgameJson = runCommand('postgame-summary-json', process.env.PYTHON || 'python', [
      'tools/advisor/postgame-summary.py',
      gameId,
      '--base-url',
      options.serverUrl,
      '--json',
    ], options);
    commands.push(postgameJson);
  }

  if (!options.dryRun) {
    writeText(paths.analyzeReport, analyze.stdout + (analyze.stderr ? `\n[stderr]\n${analyze.stderr}` : ''));
    writeText(paths.postgameReport, postgame.stdout + (postgame.stderr ? `\n[stderr]\n${postgame.stderr}` : ''));
    writeText(paths.loggerQualityReport, loggerQuality.stdout + (loggerQuality.stderr ? `\n[stderr]\n${loggerQuality.stderr}` : ''));
    writeText(paths.loggerQualityJson, loggerQualityJson.stdout);
    if (postgameJson) writeText(paths.postgameJson, postgameJson.stdout);
  }

  const summary = {
    type: 'tm_live_logging_finish',
    ts: new Date().toISOString(),
    gameId,
    serverUrl: options.serverUrl,
    dryRun: options.dryRun,
    startManifest: startManifestFile,
    stopped: processStops,
    commands,
    outputs: {
      shadow: paths.shadow,
      shadowEntries: options.dryRun ? null : countJsonlEntries(paths.shadow),
      merged: paths.merged,
      mergedEntries: options.dryRun ? null : countJsonlEntries(paths.merged),
      analyzeReport: paths.analyzeReport,
      postgameReport: paths.postgameReport,
      postgameJson: options.json ? paths.postgameJson : null,
      loggerQualityReport: paths.loggerQualityReport,
      loggerQualityJson: paths.loggerQualityJson,
      decisionTraces: parseDecisionCount(analyze.stdout),
    },
  };
  summary.warnings = buildWarnings(summary, startManifest);

  if (!options.dryRun) {
    fs.mkdirSync(LIVE_LOG_DIR, {recursive: true});
    fs.writeFileSync(paths.finishManifest, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  }

  console.log(`${options.dryRun ? 'Prepared finish' : 'Finished live logging'} for ${gameId}`);
  console.log(`Start manifest: ${startManifestFile || '-'}`);
  if (processStops.length > 0) {
    for (const row of processStops) {
      const state = row.dryRun
        ? `dry-run alive=${row.aliveBefore}`
        : (row.stopped ? 'stopped' : `not stopped alive=${row.aliveBefore}`);
      console.log(`- process ${row.name || ''} pid=${row.pid}: ${state}${row.error ? ` (${row.error})` : ''}`);
    }
  } else {
    console.log('- process stop: no PIDs found');
  }
  for (const cmd of commands) {
    const status = cmd.skipped ? 'dry-run' : `exit ${cmd.status}`;
    console.log(`- ${cmd.label}: ${status} | ${cmd.commandLine}`);
  }
  console.log(`Shadow log: ${paths.shadow}${options.dryRun ? '' : ` (${summary.outputs.shadowEntries} entries)`}`);
  console.log(`Merged log: ${paths.merged}${options.dryRun ? '' : ` (${summary.outputs.mergedEntries} entries)`}`);
  console.log(`Decision traces: ${summary.outputs.decisionTraces ?? '?'}`);
  for (const warning of summary.warnings) {
    console.log(`WARNING: ${warning}`);
  }
  if (!options.dryRun) {
    console.log(`Shadow report: ${paths.analyzeReport}`);
    console.log(`Postgame report: ${paths.postgameReport}`);
    console.log(`Logger quality: ${paths.loggerQualityReport}`);
    console.log(`Finish manifest: ${paths.finishManifest}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
