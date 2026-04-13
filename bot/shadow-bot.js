#!/usr/bin/env node
/**
 * shadow-bot.js — Read-only observer that computes what smartbot WOULD do
 * for each player decision, without making any moves.
 *
 * Usage:
 *   node bot/shadow-bot.js <gameId> [--server URL] [--poll SEC] [--player ID]
 *   node bot/shadow-bot.js --players id1,id2,id3 [--server URL]
 */
'use strict';

const {DEFAULT_SERVER_URL, runSingleGameCli} = require('./shadow-runtime');

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    gameId: args.find((arg) => !arg.startsWith('--')) || null,
    serverUrl: DEFAULT_SERVER_URL,
    poll: 2,
    playerFilter: null,
    playerIds: [],
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--server' && args[i + 1]) result.serverUrl = args[++i];
    if (args[i] === '--poll' && args[i + 1]) result.poll = parseFloat(args[++i]);
    if (args[i] === '--player' && args[i + 1]) result.playerFilter = args[++i];
    if (args[i] === '--players' && args[i + 1]) {
      result.playerIds = args[++i].split(',').map((item) => item.trim()).filter(Boolean);
    }
  }

  return result;
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.gameId && options.playerIds.length === 0) {
    console.log('Usage: node bot/shadow-bot.js <gameId|playerId> [--server URL] [--poll SEC]');
    console.log('       node bot/shadow-bot.js --players id1,id2,id3 [--server URL]');
    process.exit(1);
  }

  await runSingleGameCli(options);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
