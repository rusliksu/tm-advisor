#!/usr/bin/env node
/**
 * fetch-game.js — Fetch finished game data from TM API and save as watcher export
 *
 * Usage:
 *   node scripts/fetch-game.js g3624c8c6be9d          — one game
 *   node scripts/fetch-game.js g3624c8c6be9d g77cdd4b140bc  — multiple games
 *   node scripts/fetch-game.js --batch games.txt       — from file (one id per line)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Load TM_RATINGS for scoring
function loadJsonJs(relPath, varName) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return {};
  const raw = fs.readFileSync(full, 'utf8');
  const fn = new Function(raw.replace(/^const /, 'var ').replace(/^var /, 'var ') + `\nreturn ${varName};`);
  return fn();
}

const RATINGS = loadJsonJs('extension/data/ratings.json.js', 'TM_RATINGS');

function getScore(name) {
  const r = RATINGS[name];
  return r ? { total: r.s, tier: r.t, baseScore: r.s } : { total: 50, tier: '?', baseScore: 50 };
}

const API = 'https://terraforming-mars.herokuapp.com';

async function fetchGame(gameId) {
  // 1. Get player list
  const gameResp = await fetch(`${API}/api/game?id=${gameId}`);
  if (gameResp.status !== 200) throw new Error(`Game API returned ${gameResp.status}`);
  const gameData = await gameResp.json();

  if (gameData.phase !== 'end') {
    console.log(`  [!] ${gameId} phase=${gameData.phase} — not finished, skipping`);
    return null;
  }

  const map = gameData.gameOptions?.boardName || '';

  // 2. Fetch each player's data
  const playerExports = [];

  for (const sp of gameData.players) {
    const resp = await fetch(`${API}/api/player?id=${sp.id}`);
    if (resp.status !== 200) {
      console.warn(`  [!] Failed to fetch ${sp.name} (${sp.id})`);
      continue;
    }
    const pd = await resp.json();
    const tp = pd.thisPlayer || {};
    const game = pd.game || {};
    const gen = game.generation || 0;

    // Build snapshot from current (final) state
    const playersSnap = {};
    for (const pl of (pd.players || [])) {
      playersSnap[pl.color] = {
        name: pl.name,
        tr: pl.terraformRating || 0,
        mc: pl.megaCredits || 0,
        mcProd: pl.megaCreditProduction || 0,
        steel: pl.steel || 0,
        steelProd: pl.steelProduction || 0,
        ti: pl.titanium || 0,
        tiProd: pl.titaniumProduction || 0,
        plants: pl.plants || 0,
        plantProd: pl.plantProduction || 0,
        energy: pl.energy || 0,
        energyProd: pl.energyProduction || 0,
        heat: pl.heat || 0,
        heatProd: pl.heatProduction || 0,
        cardsInHand: pl.cardsInHandNbr || 0,
        tableau: (pl.tableau || []).map(c => c.name),
      };
    }

    const snapshot = {
      timestamp: Date.now(),
      gen: gen,
      globalParams: {
        temp: game.temperature,
        oxy: game.oxygenLevel,
        venus: game.venusScaleLevel,
        oceans: game.oceans,
      },
      players: playersSnap,
    };

    // Build finalScores
    const finalScores = {};
    for (const pl of (pd.players || [])) {
      const vp = pl.victoryPointsBreakdown || {};
      finalScores[pl.color] = {
        total: vp.total || 0,
        tr: vp.terraformRating || 0,
        milestones: vp.milestones || 0,
        awards: vp.awards || 0,
        greenery: vp.greenery || 0,
        city: vp.city || 0,
        cards: vp.victoryPoints || 0,
        vpByGen: [],
      };
    }

    // Build frozenCardScores from tableau
    const frozenCardScores = {};
    for (const card of (tp.tableau || [])) {
      const sc = getScore(card.name);
      frozenCardScores[card.name] = { score: sc.total, baseTier: sc.tier, baseScore: sc.baseScore, gen };
    }

    const corp = tp.tableau?.[0]?.name || '';
    const allPlayers = (pd.players || []).map(pl => ({
      name: pl.name,
      color: pl.color,
      corp: (pl.tableau || [])[0]?.name || '',
      isMe: pl.color === tp.color,
    }));

    playerExports.push({
      version: 4,
      exportTime: new Date().toISOString(),
      gameId: gameId,
      myColor: tp.color,
      myCorp: corp,
      players: allPlayers,
      map: map,
      endGen: gen,
      generations: { [gen]: { snapshot } },
      draftLog: [], // Not available for one-shot fetch
      frozenCardScores: frozenCardScores,
      finalScores: finalScores,
      _watchMode: true,
      _oneShot: true,
    });
  }

  if (playerExports.length === 0) return null;

  return {
    version: 4,
    _watchMode: true,
    _combined: true,
    gameId: gameId,
    map: map,
    endGen: playerExports[0].endGen,
    exportTime: new Date().toISOString(),
    players: playerExports,
  };
}

async function main() {
  let gameIds = process.argv.slice(2);

  if (gameIds[0] === '--batch' && gameIds[1]) {
    const content = fs.readFileSync(gameIds[1], 'utf8');
    gameIds = content.trim().split('\n').map(l => l.trim()).filter(Boolean);
  }

  if (gameIds.length === 0) {
    console.error('Usage: node scripts/fetch-game.js <gameId> [gameId2] ...');
    process.exit(1);
  }

  const outDir = path.join(ROOT, 'data', 'game_logs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let fetched = 0, skipped = 0;

  for (const gid of gameIds) {
    const id = gid.startsWith('g') ? gid : 'g' + gid;
    process.stdout.write(`${id}...`);

    try {
      const data = await fetchGame(id);
      if (!data) {
        skipped++;
        continue;
      }

      const names = data.players.map(p => {
        const winner = Object.entries(p.finalScores || {})
          .sort((a, b) => b[1].total - a[1].total)[0];
        return p.players?.find(pl => pl.isMe)?.name || '?';
      }).join('_');

      const filename = `tm-fetch-${id}-gen${data.endGen}.json`;
      const outPath = path.join(outDir, filename);
      fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
      console.log(` saved → ${filename}`);
      fetched++;

      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.log(` error: ${e.message}`);
      skipped++;
    }
  }

  console.log(`\nDone: ${fetched} fetched, ${skipped} skipped`);
}

main();
