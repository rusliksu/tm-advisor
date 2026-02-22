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

// Fixes based on COTD + RuneDK93 cross-validation
const fixes = [
  // REVERT — RuneDK93 data contradicts our small sample
  ['Windmills', 48, 56, 'Revert: RuneDK93 rank 91/208 (above avg), COTD=C/C+'],
  ["Inventors' Guild", 54, 62, 'Revert: RuneDK93 rank 68/208 (top 33%), COTD="obviously good"'],
  // TOO AGGRESSIVE — soften
  ['Space Station', 50, 56, 'Soften: COTD="overrated", RuneDK93 rank 130 — C-low, not D'],
  ['Morning Star Inc.', 48, 55, 'Revert: 3 games too small for corp downgrade, COTD="alright engine"'],
  // ADJUST — data-backed but tweak
  ['Satellites', 50, 52, 'Tweak: COTD split C/D, RuneDK93 rank 138 — D52 fair'],
  ['Valley Trust', 62, 64, 'Compromise: COTD=A/B but RuneDK93 rank 10/17 corps — C64'],
  // Power Plant stays at C58 — RuneDK93 rank 183 confirms
];

let changed = 0;
fixes.forEach(([card, fromScore, toScore, reason]) => {
  const newTier = tierForScore(toScore);
  const searchStr = '"' + card + '":';
  const idx = text.indexOf(searchStr);
  if (idx === -1) { console.log('NOT FOUND: ' + card); return; }
  const blockStart = text.indexOf('{', idx);
  const blockEnd = text.indexOf('}', blockStart);
  let block = text.substring(blockStart, blockEnd + 1);
  const orig = block;
  block = block.replace(/"s":\s*\d+/, '"s": ' + toScore);
  block = block.replace(/"t":\s*"[A-Z]"/, '"t": "' + newTier + '"');
  if (block !== orig) {
    text = text.substring(0, blockStart) + block + text.substring(blockEnd + 1);
    console.log(tierForScore(fromScore) + fromScore + ' -> ' + newTier + toScore + ' | ' + card + ' — ' + reason);
    changed++;
  }
});

fs.writeFileSync(path, text, 'utf8');
console.log('\n' + changed + ' fixes applied');
