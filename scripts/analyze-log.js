const log = JSON.parse(require('fs').readFileSync('C:/Users/Ruslan/Downloads/tm-log-Manutech-gen8-2026-03-08.json','utf8'));
const fs2 = log.events.find(e => e.type === 'final_state');

console.log('=== MILESTONES ===');
for (const m of fs2.milestones) {
  console.log('  ' + m.name + ': ' + (m.claimedBy || 'unclaimed'));
}

console.log('\n=== AWARDS ===');
for (const a of fs2.awards) {
  console.log('  ' + a.name + ': funded by ' + (a.fundedBy || '?'));
  if (a.scores) {
    for (const [p, s] of Object.entries(a.scores)) {
      console.log('    ' + p + ': ' + s);
    }
  }
}

console.log('\n=== PLAYER TILES ===');
for (const [color, tiles] of Object.entries(fs2.playerTiles)) {
  console.log(color + ': ' + JSON.stringify(tiles));
}

console.log('\n=== GYDRO TABLEAU (35 cards) ===');
console.log(fs2.players.red.tableau.join(', '));

console.log('\n=== GYDRO VP CARDS ===');
const vp = fs2.players.red.vpBreakdown;
if (vp && vp.detailsCards) {
  const sorted = vp.detailsCards.sort((a, b) => b.victoryPoint - a.victoryPoint);
  for (const c of sorted) {
    if (c.victoryPoint !== 0) console.log('  ' + c.cardName + ': ' + c.victoryPoint + ' VP');
  }
}

// Also show all 3 players' VP breakdowns side by side
console.log('\n=== ALL PLAYERS VP COMPARISON ===');
for (const color of ['red', 'green', 'blue']) {
  const p = fs2.players[color];
  const v = p.vpBreakdown;
  console.log(color + ' (' + p.name + '): ' + v.total + ' VP');
  console.log('  TR:' + v.terraformRating + ' Miles:' + v.milestones + ' Awards:' + v.awards + ' Green:' + v.greenery + ' City:' + v.city + ' Cards:' + v.victoryPoints);
}

// Colonies
console.log('\n=== COLONIES ===');
for (const col of fs2.colonies) {
  console.log('  ' + col.name + ' (track:' + col.trackPosition + '): ' + (col.colonies.length ? col.colonies.join(', ') : 'empty'));
}
