const https = require('https');
function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}
async function main() {
  // Get spectator ID from a game
  const game = await fetch('https://terraforming-mars.herokuapp.com/api/game?id=g7b9ca008fb0e');
  console.log('spectatorId:', game.spectatorId);

  const spec = await fetch('https://terraforming-mars.herokuapp.com/api/spectator?id=' + game.spectatorId);
  console.log('Spectator top keys:', Object.keys(spec));
  console.log('Has thisPlayer:', 'thisPlayer' in spec);
  console.log('Has players:', 'players' in spec);
  console.log('Has game:', 'game' in spec);

  if (spec.players && spec.players[0]) {
    const p = spec.players[0];
    console.log('\nplayer[0] keys:', Object.keys(p).slice(0, 20));
    console.log('Has victoryPointsBreakdown:', 'victoryPointsBreakdown' in p);
    console.log('Has terraformRating:', 'terraformRating' in p);
    console.log('TR:', p.terraformRating);
  }

  // Compare: player API has playerView = { thisPlayer, players, game }
  // Spectator API has: { color, id, game, players, runId }
  // Key difference: spectator has NO thisPlayer — all players are in players[]

  console.log('\n=== Vue component structure ===');
  console.log('Player page: #game.__vue__ -> playerView = { thisPlayer, players, game }');
  console.log('Spectator page: #game.__vue__ -> spectator = { players, game }');
  console.log('Spectator has NO thisPlayer — need to pick first player or use all');
}
main().catch(console.error);
