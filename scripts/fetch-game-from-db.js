#!/usr/bin/env node
/**
 * fetch-game-from-db.js — fetch compact finished-game export from VPS SQLite.
 *
 * Usage:
 *   node scripts/fetch-game-from-db.js g61b345b82820
 *   node scripts/fetch-game-from-db.js g1 g2 --vps vps
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'game_logs');

let vpsAlias = 'vps';
const gameIds = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--vps' && process.argv[i + 1]) {
    vpsAlias = process.argv[++i];
    continue;
  }
  gameIds.push(a.startsWith('g') ? a : `g${a}`);
}

if (gameIds.length === 0) {
  console.error('Usage: node scripts/fetch-game-from-db.js <gameId> [gameId2] ... [--vps vps]');
  process.exit(1);
}

function remoteFetch(gameId) {
  const py = `
import sqlite3, json, sys
gid = sys.argv[1]
conn = sqlite3.connect('/home/openclaw/terraforming-mars/db/game.db')
cur = conn.cursor()
row = cur.execute('select scores, game_options, generations, players from game_results where game_id=?', (gid,)).fetchone()
if not row:
    print(json.dumps({"ok": False, "error": "not_found", "gameId": gid}, ensure_ascii=False))
    sys.exit(0)
scores, game_options, generations, players = row
print(json.dumps({
    "ok": True,
    "gameId": gid,
    "scores": json.loads(scores) if scores else None,
    "gameOptions": json.loads(game_options) if game_options else None,
    "generations": generations,
    "players": players,
}, ensure_ascii=False))
`;

  const child = spawnSync('ssh', [vpsAlias, 'python3', '-', gameId], {
    input: py,
    encoding: 'utf8',
    windowsHide: true,
  });

  if (child.status !== 0) {
    throw new Error((child.stderr || child.stdout || 'ssh failed').trim());
  }
  return JSON.parse((child.stdout || '').trim());
}

function saveCompactExport(data) {
  fs.mkdirSync(OUT_DIR, {recursive: true});
  const validScores = Array.isArray(data.scores) && data.scores.some((s) => (s.playerScore || 0) > 0);
  const out = {
    version: 1,
    source: 'db_fallback',
    exportTime: new Date().toISOString(),
    gameId: data.gameId,
    generations: data.generations,
    players: data.players,
    gameOptions: data.gameOptions,
    scores: data.scores,
    validScores,
  };
  const file = path.join(OUT_DIR, `tm-db-result-${data.gameId}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
  return {file, validScores};
}

for (const gameId of gameIds) {
  process.stdout.write(`${gameId}...`);
  try {
    const data = remoteFetch(gameId);
    if (!data.ok) {
      console.log(` skipped (${data.error})`);
      continue;
    }
    const result = saveCompactExport(data);
    console.log(` saved → ${path.basename(result.file)}${result.validScores ? '' : ' [invalid-scores]'}`);
  } catch (e) {
    console.log(` error: ${e.message}`);
  }
}
