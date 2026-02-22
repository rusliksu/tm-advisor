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

// COTD-validated corrections for overinflated upgrades
const fixes = [
  // COTD: "mediocre", "worst multiplier" — Jovian multi but conditional
  ['Water Import From Europa', 76, 67, 'COTD: "mediocre", "worst of multipliers". C58→C67 (+9 вместо +18)'],
  // COTD: "good IF synergy" — niche, not universally strong
  ['Bactoviral Research', 76, 71, 'COTD: "good IF microbe dump". C66→B71 (+5 вместо +10)'],
  // COTD: "situational", "one of the weaker corps" — 3 games is noise
  ['Viron', 72, 65, 'COTD: "situational", "weaker corp". C62→C65 (+3 вместо +10)'],
  // COTD: "so, so bad" top comment — stays D-tier
  ['Venus Magnetizer', 44, 40, 'COTD: "so, so bad". D35→D40 (+5 вместо +9)'],
  // Io Mining Industries: KEEP at B76 ✅ — "beast of a card"
  // Earth Elevator: KEEP at B72 ✅ — "good card", "B-"
  // COTD: "usually not worth it" — event for 1 MC, noise in data
  ['Market Manipulation', 63, 57, 'COTD: "usually not worth it". C55→C57 (+2 вместо +8)'],
  // COTD: "Meh", "Mediocre" — top comment
  ['Tectonic Stress Power', 63, 57, 'COTD: "Meh". C55→C57 (+2 вместо +8)'],
  // COTD: "clearly worse than Fish" — ok to exit D but not to C60
  ['Sub-zero Salt Fish', 60, 56, 'COTD: "clearly worse than Fish". D52→C56 (+4 вместо +8)'],
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
    const oldTier = tierForScore(fromScore);
    console.log(oldTier + fromScore + ' -> ' + newTier + toScore + ' | ' + card + ' — ' + reason);
    changed++;
  }
});

fs.writeFileSync(path, text, 'utf8');
console.log('\n' + changed + ' corrections applied');
