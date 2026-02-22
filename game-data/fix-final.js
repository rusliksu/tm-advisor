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

const fixes = [
  ['Giant Solar Shade', 72, 68, 'COTD: "decent but mediocre", 30MC/3TR плохая сделка. B72→C68'],
  ['Insects', 76, 80, 'COTD единогласно: "one of the best cards", "top 5", "S-tier wrongfully passed". B76→A80'],
];

let changed = 0;
fixes.forEach(([card, fromScore, toScore, reason]) => {
  const newTier = tierForScore(toScore);
  const idx = text.indexOf('"' + card + '":');
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
console.log(changed + ' final fixes applied');
