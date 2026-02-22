const fs = require('fs');
const path = 'C:/Users/Ruslan/tm-tierlist/extension/data/ratings.json.js';
let text = fs.readFileSync(path, 'utf8');

function tierForScore(s) {
  if (s >= 90) return 'S';
  if (s >= 80) return 'A';
  if (s >= 70) return 'B';
  if (s >= 55) return 'C';
  if (s >= 35) return 'D';
  return 'F';
}

// [cardName, oldScore, newScore, reason]
const updates = [
  // === STRONG UPGRADES (game data: high winner freq, 0 losers, high avg VP) ===
  ['Bactoviral Research', 66, 76, '5x winners 0 losers (38% winner rate)'],
  ['Water Import From Europa', 58, 76, '4x winners 0 losers, 7.3 avg VP'],
  ['Stratospheric Birds', 77, 83, '8.5 avg VP (#3 overall), 4 appearances'],
  ['Ganymede Colony', 75, 80, '7.0 avg VP, 8 appearances — most consistent VP card'],
  ['Jovian Lanterns', 68, 76, '7.5 avg VP, 4 appearances'],
  ['Io Mining Industries', 68, 76, '9.0 avg VP (#2 overall)'],
  ['Viron', 62, 72, '67% winrate (2/3 games)'],
  ['Earth Elevator', 64, 72, '4.0 avg VP, 5 appearances'],

  // === MODERATE UPGRADES ===
  ['Venusian Animals', 85, 89, '10.75 avg VP — #1 VP card across 13 games'],
  ['Breathing Filters', 62, 70, '3x winners 0 losers'],
  ['Cultivation of Venus', 66, 73, '6.5 avg VP'],
  ['Greenhouses', 68, 73, '4x winners'],
  ['Tectonic Stress Power', 55, 63, '4x winners'],
  ['Market Manipulation', 55, 63, '3x winners 0 losers'],
  ['Sub-zero Salt Fish', 52, 60, '2x winners 0 losers'],
  ['Botanical Experience', 60, 66, '2x winners 0 losers'],
  ['Insects', 72, 76, '3x winners 0 losers'],
  ['Herbivores', 68, 73, '3.8 avg VP, 4 appearances'],
  ['Cloud Tourism', 56, 62, '3.3 avg VP, 4 appearances'],
  ['Cassini Station', 55, 62, '2x winners 0 losers'],
  ['Immigration Shuttles', 50, 57, '3.5 avg VP'],
  ['Venus Magnetizer', 35, 44, '2x winners 0 losers'],
  ['Giant Solar Shade', 67, 72, '2x winners 0 losers'],
  ['Breeding Farms', 68, 73, '2x winners 0 losers'],

  // === DOWNGRADES (loser traps) ===
  ['Space Station', 66, 50, '9x losers 0 winners — biggest trap signal'],
  ["Inventors' Guild", 62, 54, '5x losers only'],
  ['Satellites', 58, 50, '6x losers only'],
  ['Windmills', 56, 48, '5x losers only'],
  ['Power Plant', 64, 58, '6x losers only'],

  // === CORP DOWNGRADES (0% winrate) ===
  ['Valley Trust', 68, 62, '0/4 wins — consistent loser'],
  ['Morning Star Inc.', 55, 48, '0/3 wins'],
];

let changed = 0;
let failed = [];

updates.forEach(([card, oldScore, newScore, reason]) => {
  const oldTier = tierForScore(oldScore);
  const newTier = tierForScore(newScore);

  // Find the card entry and replace score + tier
  // Pattern: "CardName": { ... "s": XX, "t": "X" ...
  // We need to find "s": oldScore and "t": "oldTier" within the card's block

  // Strategy: find the card name, then replace s and t values in the next few lines
  const cardEscaped = card.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "'");

  // Find card entry start
  const searchStr = '"' + card + '":';
  const idx = text.indexOf(searchStr);
  if (idx === -1) {
    failed.push(card + ' — NOT FOUND');
    return;
  }

  // Find the block boundaries (next opening/closing braces)
  const blockStart = text.indexOf('{', idx);
  const blockEnd = text.indexOf('}', blockStart);
  if (blockStart === -1 || blockEnd === -1) {
    failed.push(card + ' — BLOCK NOT FOUND');
    return;
  }

  let block = text.substring(blockStart, blockEnd + 1);
  const origBlock = block;

  // Replace score
  const scoreRegex = /"s":\s*\d+/;
  if (!scoreRegex.test(block)) {
    failed.push(card + ' — SCORE NOT FOUND');
    return;
  }
  block = block.replace(scoreRegex, '"s": ' + newScore);

  // Replace tier
  const tierRegex = /"t":\s*"[A-Z]"/;
  if (tierRegex.test(block)) {
    block = block.replace(tierRegex, '"t": "' + newTier + '"');
  }

  if (block !== origBlock) {
    text = text.substring(0, blockStart) + block + text.substring(blockEnd + 1);
    console.log((newScore > oldScore ? '↑' : '↓') + ' ' +
      oldTier + oldScore + ' → ' + newTier + newScore + ' | ' + card + ' — ' + reason);
    changed++;
  } else {
    failed.push(card + ' — NO CHANGE');
  }
});

fs.writeFileSync(path, text, 'utf8');
console.log('\n' + changed + ' cards updated, ' + failed.length + ' failed');
if (failed.length > 0) console.log('Failed:', failed);
