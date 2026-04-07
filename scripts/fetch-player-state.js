#!/usr/bin/env node
/**
 * fetch-player-state.js — Fetch live /api/player state and save it locally.
 *
 * Usage:
 *   node scripts/fetch-player-state.js <playerId>
 *   node scripts/fetch-player-state.js <playerId> --server https://tm.knightbyte.win
 *   node scripts/fetch-player-state.js <playerId> --out data/game_logs/my-file.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { server: 'https://tm.knightbyte.win', out: null, playerId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--') && !args.playerId) {
      args.playerId = a;
      continue;
    }
    if (a === '--server') {
      args.server = argv[++i];
      continue;
    }
    if (a === '--out') {
      args.out = argv[++i];
      continue;
    }
    throw new Error(`Unknown argument: ${a}`);
  }
  if (!args.playerId) {
    throw new Error('Usage: node scripts/fetch-player-state.js <playerId> [--server <url>] [--out <path>]');
  }
  return args;
}

async function main() {
  const { playerId, server, out } = parseArgs(process.argv.slice(2));
  const resp = await fetch(`${server}/api/player?id=${encodeURIComponent(playerId)}`);
  if (!resp.ok) {
    throw new Error(`/api/player returned ${resp.status}`);
  }

  const data = await resp.json();
  const gameId = data?.game?.gameId || data?.game?.id || 'unknown';
  const color = data?.thisPlayer?.color || 'unknown';
  const generation = data?.game?.generation ?? 'x';

  const relOut = out || path.join('data', 'game_logs', `tm-player-${gameId}-${color}-gen${generation}.json`);
  const outPath = path.isAbsolute(relOut) ? relOut : path.join(ROOT, relOut);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));

  console.log(`saved ${outPath}`);
  console.log(`gameId=${gameId}`);
  console.log(`color=${color}`);
  console.log(`generation=${generation}`);
  const gameOptions = data?.game?.gameOptions || {};
  console.log(`ares=${!!(gameOptions.aresExtension || gameOptions.expansions?.ares)}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
