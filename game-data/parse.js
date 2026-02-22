const fs = require('fs');
const files = [
  ['g1d35072e3968', 'Linda'],
  ['g6e3917262e93', 'LFC'],
  ['g79334fcd92b4', 'LFC'],
  ['g984aee0945dc', 'Samesexphone'],
  ['gb745f7c3b2db', 'Unknown Weather']
];
files.forEach(([id, label]) => {
  const raw = JSON.parse(fs.readFileSync('C:/Users/Ruslan/tm-tierlist/game-data/' + id + '.json', 'utf8'));
  const g = raw.game;
  console.log('');
  console.log('=== ' + id + ' (' + label + ') ===');
  console.log('Phase: ' + g.phase + ' | Generation: ' + g.generation);
  console.log('Board: ' + g.gameOptions.boardName);
  
  // Expansions
  const exp = g.gameOptions.expansions;
  const active = Object.entries(exp).filter(([k,v]) => v).map(([k]) => k);
  console.log('Expansions: ' + active.join(', '));
  console.log('2 Corps: ' + g.gameOptions.twoCorpsVariant + ' | Pathfinders: ' + (exp.pathfinders || false) + ' | CEO: ' + (exp.ceo || false));
  
  // Global params
  console.log('Global Parameters:');
  console.log('  Temperature: ' + g.temperature + '/8');
  console.log('  Oxygen: ' + g.oxygenLevel + '/14');
  console.log('  Oceans: ' + g.oceans + '/9');
  if (g.venusScaleLevel !== undefined) {
    console.log('  Venus: ' + g.venusScaleLevel + '/30');
  }
  
  // Players
  console.log('Players:');
  let best = {name: '', score: -999};
  raw.players.forEach(p => {
    // Find corporations in tableau
    const corps = (p.tableau || []).filter(c => {
      // Corps are typically the first 1-2 cards, check by name patterns or just grab first entries
      return true;
    });
    // Actually, in spectator API corps don't have isCorporation flag
    // Let's check what fields tableau entries have
    const corpNames = [];
    const cardNames = [];
    (p.tableau || []).forEach((c, i) => {
      // Corps are usually first, preludes second, then regular cards
      // Check if card has cardType or just use name heuristics
      if (c.cardType !== undefined) {
        if (c.cardType === 'corporation') corpNames.push(c.name);
      }
      cardNames.push(c.name);
    });
    
    const vp = p.victoryPointsBreakdown ? p.victoryPointsBreakdown.total : null;
    const tr = p.terraformRating;
    
    console.log('  ' + p.name + ' (' + p.color + ') - TR: ' + tr + ' | VP: ' + (vp !== null ? vp : 'N/A'));
    console.log('    Cards played: ' + (p.tableau ? p.tableau.length : 0));
    // Show first 5 cards (likely includes corps and preludes)
    console.log('    First 5 cards: ' + cardNames.slice(0, 5).join(', '));
    
    const score = (g.phase === 'end' && vp !== null) ? vp : tr;
    if (score > best.score) {
      best = {name: p.name, score: score};
    }
  });
  
  if (g.phase === 'end') {
    console.log('WINNER: ' + best.name + ' (' + best.score + ' VP)');
  } else {
    console.log('LEADING (by TR): ' + best.name + ' (TR ' + best.score + ')');
  }
  console.log('---');
});
