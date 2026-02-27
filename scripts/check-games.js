const gameIds = [
  'g3a2f7aa306d3', 'g3624c8c6be9d', 'g77cdd4b140bc', 'g1097253be20a',
  'g56cb2e44040a', 'g153513c38e58', 'g60269e69eecf', 'gbee95fc4b012',
  'gef7e7d1a1d3d', 'ge8d934e4e458', 'ga46e00356df4', 'g8db2720b7505',
  'gccd604d046fc', 'g906f6f1af7d3', 'g9bb3b72cf979', 'g2c99b0ce3172',
  'gbd6a36e79f38', 'g484f4a872172', 'g64ec2c549682', 'gdc2b6a65d20e',
  'gaf682195fc9e', 'g4b0258c48857', 'g8b9b3c11bc5', 'g31d98be380b2',
  'g7f4cfd62c6d6'
];

async function check(id) {
  try {
    const r = await fetch('https://terraforming-mars.herokuapp.com/api/game?id=' + id);
    if (r.status !== 200) return { id, status: 'error_' + r.status };
    const d = await r.json();
    const players = (d.players || []).map(p => p.name).join(', ');
    return { id, phase: d.phase, players, playerIds: (d.players || []).map(p => p.id) };
  } catch(e) { return { id, status: 'fetch_error' }; }
}

(async () => {
  const results = await Promise.all(gameIds.map(check));
  const ended = results.filter(r => r.phase === 'end');
  const active = results.filter(r => r.phase && r.phase !== 'end');
  const dead = results.filter(r => r.status);

  console.log('=== FINISHED (' + ended.length + ') ===');
  for (const r of ended) console.log(r.id + ' | ' + r.players);

  console.log('');
  console.log('=== ACTIVE (' + active.length + ') ===');
  for (const r of active) console.log(r.id + ' | ' + r.phase + ' | ' + r.players);

  console.log('');
  if (dead.length) {
    console.log('=== ERRORS (' + dead.length + ') ===');
    for (const r of dead) console.log(r.id + ' | ' + r.status);
  }

  // Output JSON for finished games
  if (ended.length > 0) {
    console.log('\n=== FINISHED PLAYER IDS ===');
    for (const r of ended) {
      console.log(JSON.stringify({ gameId: r.id, players: r.playerIds }));
    }
  }
})();
