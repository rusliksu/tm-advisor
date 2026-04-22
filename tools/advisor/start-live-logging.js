#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');

const {DEFAULT_SERVER_URL, fetchJSON} = require('../../bot/shadow-runtime');

const ROOT = path.resolve(__dirname, '..', '..');
const LIVE_LOG_DIR = path.join(ROOT, 'data', 'game_logs', 'live-logging');

function usage() {
  return [
    'Usage:',
    '  node tools/advisor/start-live-logging.js <gameId|playerId> [options]',
    '',
    'Options:',
    '  --server-url URL      TM server URL (default: TM_BASE_URL or tm.knightbyte.win)',
    '  --watch-interval SEC  watch_live_game.py polling interval (default: 5)',
    '  --shadow-poll SEC     shadow-bot polling interval (default: 2)',
    '  --no-watch            Do not start scripts/watch_live_game.py',
    '  --no-shadow           Do not start bot/shadow-bot.js',
    '  --dry-run             Resolve target and print commands without starting processes',
    '  --force               Allow starting even if the game is already ended',
    '  --help                Show this help',
    '',
    'After game end:',
    '  npm run advisor:finish-live-logging -- <gameId> --server-url <server-url> --json',
  ].join('\n');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    identifier: null,
    serverUrl: (process.env.TM_BASE_URL || DEFAULT_SERVER_URL || 'https://tm.knightbyte.win').replace(/\/$/, ''),
    watchInterval: 5,
    shadowPoll: 2,
    watch: true,
    shadow: true,
    dryRun: false,
    force: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else if (arg === '--server-url' && args[i + 1]) {
      out.serverUrl = args[++i].replace(/\/$/, '');
    } else if (arg === '--watch-interval' && args[i + 1]) {
      out.watchInterval = Number(args[++i]) || out.watchInterval;
    } else if (arg === '--shadow-poll' && args[i + 1]) {
      out.shadowPoll = Number(args[++i]) || out.shadowPoll;
    } else if (arg === '--no-watch') {
      out.watch = false;
    } else if (arg === '--no-shadow') {
      out.shadow = false;
    } else if (arg === '--dry-run') {
      out.dryRun = true;
    } else if (arg === '--force') {
      out.force = true;
    } else if (!arg.startsWith('--') && !out.identifier) {
      out.identifier = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function gameEnded(game) {
  const phase = String(game?.phase || '').toLowerCase();
  return phase === 'end' || phase === 'the_end';
}

async function resolveTarget(identifier, serverUrl) {
  if (!identifier) throw new Error('gameId or playerId is required');

  if (identifier.startsWith('p')) {
    const raw = await fetchJSON(`${serverUrl}/api/player?id=${encodeURIComponent(identifier)}`);
    const view = raw.playerView || raw;
    const game = view.game || {};
    const gameId = game.gameId || game.id;
    if (!gameId) throw new Error(`Cannot resolve game id from player id ${identifier}`);
    const players = safeArray(view.players).map((player) => ({
      id: player.id,
      name: player.name || player.id,
      color: player.color || '?',
    })).filter((player) => player.id);
    return {gameId, game, players, requestedPlayerId: identifier};
  }

  const game = await fetchJSON(`${serverUrl}/api/game?id=${encodeURIComponent(identifier)}`);
  const gameId = game.gameId || game.id || identifier;
  const players = safeArray(game.players).map((player) => ({
    id: player.id,
    name: player.name || player.id,
    color: player.color || '?',
  })).filter((player) => player.id);
  return {gameId, game, players, requestedPlayerId: null};
}

function commandLine(command, args) {
  return [command, ...args].map((part) => {
    const text = String(part);
    return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
  }).join(' ');
}

function openLogFile(file) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  return fs.openSync(file, 'a');
}

function spawnDetachedProcess(spec, stamp) {
  const stdout = path.join(LIVE_LOG_DIR, `${stamp}-${spec.name}.out.log`);
  const stderr = path.join(LIVE_LOG_DIR, `${stamp}-${spec.name}.err.log`);
  const outFd = openLogFile(stdout);
  const errFd = openLogFile(stderr);
  const child = spawn(spec.command, spec.args, {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', outFd, errFd],
    env: {...process.env, TM_BASE_URL: spec.serverUrl},
    windowsHide: true,
  });
  child.unref();
  return {
    name: spec.name,
    pid: child.pid,
    command: spec.command,
    args: spec.args,
    commandLine: commandLine(spec.command, spec.args),
    stdout,
    stderr,
  };
}

function buildProcessSpecs(target, options) {
  const specs = [];
  if (options.watch) {
    specs.push({
      name: 'watch',
      command: process.env.PYTHON || 'python',
      args: [
        'scripts/watch_live_game.py',
        target.gameId,
        '--interval',
        String(options.watchInterval),
        '--server-url',
        options.serverUrl,
      ],
      serverUrl: options.serverUrl,
    });
  }
  if (options.shadow) {
    specs.push({
      name: 'shadow',
      command: process.execPath,
      args: [
        'bot/shadow-bot.js',
        target.gameId,
        '--server',
        options.serverUrl,
        '--poll',
        String(options.shadowPoll),
      ],
      serverUrl: options.serverUrl,
    });
  }
  return specs;
}

function writeManifest(target, options, processes, stamp) {
  fs.mkdirSync(LIVE_LOG_DIR, {recursive: true});
  const manifest = {
    type: 'tm_live_logging_start',
    ts: new Date().toISOString(),
    gameId: target.gameId,
    requestedPlayerId: target.requestedPlayerId,
    serverUrl: options.serverUrl,
    phase: target.game?.phase || null,
    generation: target.game?.generation ?? null,
    players: target.players,
    dryRun: options.dryRun,
    processes,
    expectedOutputs: {
      watch: path.join(ROOT, 'data', 'game_logs', `watch_live_${target.gameId}_<timestamp>.jsonl`),
      shadow: path.join(ROOT, 'data', 'shadow', `shadow-${target.gameId}.jsonl`),
      merged: path.join(ROOT, 'data', 'shadow', 'merged', `merged-${target.gameId}.jsonl`),
    },
  };
  const file = path.join(LIVE_LOG_DIR, `${stamp}-manifest.json`);
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return {file, manifest};
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.watch && !options.shadow) {
    throw new Error('Nothing to start: both --no-watch and --no-shadow were passed');
  }

  const target = await resolveTarget(options.identifier, options.serverUrl);
  const phase = target.game?.phase || '?';
  if (gameEnded(target.game) && !options.force) {
    console.log(`Game ${target.gameId} is already ended (phase=${phase}); no logging processes started.`);
    console.log('Use --force only if you intentionally want a final-state-only log.');
    return;
  }

  const specs = buildProcessSpecs(target, options);
  const stamp = `${target.gameId}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const processes = options.dryRun
    ? specs.map((spec) => ({
        name: spec.name,
        pid: null,
        command: spec.command,
        args: spec.args,
        commandLine: commandLine(spec.command, spec.args),
      }))
    : specs.map((spec) => spawnDetachedProcess(spec, stamp));
  const {file: manifestFile} = writeManifest(target, options, processes, stamp);

  console.log(`${options.dryRun ? 'Prepared' : 'Started'} live logging for ${target.gameId} (${phase}, gen ${target.game?.generation ?? '?'})`);
  console.log(`Server: ${options.serverUrl}`);
  console.log(`Players: ${target.players.map((player) => `${player.name}(${player.color})`).join(', ') || '-'}`);
  console.log(`Manifest: ${manifestFile}`);
  for (const proc of processes) {
    const pid = proc.pid ? ` pid=${proc.pid}` : '';
    console.log(`- ${proc.name}:${pid} ${proc.commandLine}`);
  }
  if (!options.dryRun) {
    const pids = processes.map((proc) => proc.pid).filter(Boolean).join(',');
    if (pids) console.log(`Stop on Windows: Stop-Process -Id ${pids}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
