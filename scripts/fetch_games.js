const https = require('https');
const fs = require('fs');

const GAME_IDS = [
  'g7b9ca008fb0e','g16681b61e88c','gc79a9d630bba','g41e7ddb7739c',
  'g2fc69a4ba020','gf66cf2194f65','g4f3e6fa1a2ff','g658f9bff1a56',
  'gba33f149f0a2','ga40536632a37','g15a208863f64','ga20dc0d3dcec',
  'gfe963f54f395','g74705449941a','ga7afda6d3acb','g30e112efc5e3',
  'ga582819efbec','gf63338406761','gaef9ceaa5c23','g89484a946ed9',
  'g9fe553d4fb0d','gebd833f33d75','gaf3f66d61d44','gd5c695f424da',
  'g961e456acd25','g5eb063bfaad2','g4e6e87375a45','g7a1a264cc2e1',
  'g6228f06233f5','gaccd3ebf8829','g1ee00856cf85','gc68c190ab433',
  'g8212354c937e','gcb6b8929f769','gcc8d4c72c55b','g6e7b7fcaa4cd',
  'g317074b95487','ge48b91d3e2c6','g58097f3c9992','gf2640f899fca',
  'gc69caad41e42','g5c513f66c1d0','g706bd53727e3','g4f16d8e513c4',
  'gb2f5a2bb3b51','g1e6d4a1fd28f','g36d439ac2a6a','gdb592222f1c0',
  'gbe85f15a1205'
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function processGame(gameId) {
  // Step 1: get spectator ID
  const lobby = await fetch(`https://terraforming-mars.herokuapp.com/api/game?id=${gameId}`);
  const specId = lobby.spectatorId;
  if (!specId) return { gameId, error: 'no spectator ID' };

  await sleep(300);

  // Step 2: get spectator data
  const spec = await fetch(`https://terraforming-mars.herokuapp.com/api/spectator?id=${specId}`);
  const g = spec.game;

  const result = {
    gameId,
    phase: g.phase,
    generation: g.generation,
    isTerraformed: g.isTerraformed,
    temperature: g.temperature,
    oxygenLevel: g.oxygenLevel,
    oceans: g.oceans,
    venusScale: g.venusScaleLevel,
    expansions: g.gameOptions?.expansions || {},
    playerCount: spec.players.length,
    colonies: (g.colonies || []).map(c => c.name),
    milestones: (g.milestones || []).filter(m => m.scores.some(s => s.claimable === undefined || s.claimable)).map(m => m.name),
    players: spec.players.map(p => ({
      name: p.name,
      color: p.color,
      tr: p.terraformRating,
      tableau: (p.tableau || []).map(c => c.name),
      vp: p.victoryPointsBreakdown,
      mc: p.megaCredits,
      mcProd: p.megaCreditProduction,
      steel: p.steel, steelProd: p.steelProduction,
      titanium: p.titanium, titaniumProd: p.titaniumProduction,
      plants: p.plants, plantProd: p.plantProduction,
      energy: p.energy, energyProd: p.energyProduction,
      heat: p.heat, heatProd: p.heatProduction,
      cardsInHand: p.cardsInHandNbr,
      tags: p.tags,
      citiesCount: p.citiesCount,
      coloniesCount: p.coloniesCount,
    })),
  };

  // Determine winner (highest total VP)
  if (result.players.length > 0) {
    const sorted = [...result.players].sort((a, b) => (b.vp?.total || 0) - (a.vp?.total || 0));
    result.winner = sorted[0].name;
    result.winnerScore = sorted[0].vp?.total || 0;
  }

  return result;
}

async function main() {
  const results = [];
  const errors = [];

  for (let i = 0; i < GAME_IDS.length; i++) {
    const gid = GAME_IDS[i];
    process.stderr.write(`[${i+1}/${GAME_IDS.length}] ${gid}...`);
    try {
      const r = await processGame(gid);
      results.push(r);
      process.stderr.write(` OK (gen ${r.generation}, ${r.phase})\n`);
    } catch(e) {
      errors.push({ gameId: gid, error: e.message });
      process.stderr.write(` ERROR: ${e.message}\n`);
    }
    // Save intermediate results every 10 games
    if ((i + 1) % 10 === 0) {
      fs.writeFileSync('scripts/games_partial.json', JSON.stringify({ results, errors }, null, 2));
    }
    await sleep(500);
  }

  fs.writeFileSync('scripts/games_data.json', JSON.stringify({ results, errors, fetchedAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ total: GAME_IDS.length, fetched: results.length, errors: errors.length }));
}

main().catch(e => { console.error(e); process.exit(1); });
