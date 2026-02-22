const fs = require('fs');
const path = 'C:/Users/Ruslan/tm-tierlist/extension/data/ratings.json.js';
let text = fs.readFileSync(path, 'utf8');
function tierForScore(s) { if(s>=90)return'S';if(s>=80)return'A';if(s>=70)return'B';if(s>=55)return'C';if(s>=35)return'D';return'F'; }
const fixes = [
  ['Space Station', 56, 60, 'RuneDK93 нерелевантен (basegame only), colonies-мета ценит space. C66→C60'],
  ['Power Plant', 58, 64, 'COTD: "solid, reliable". RuneDK93 basegame-only. Откат к C64'],
];
let changed = 0;
fixes.forEach(([card, from, to, reason]) => {
  const idx = text.indexOf('"' + card + '":');
  if (idx === -1) return;
  const bs = text.indexOf('{', idx), be = text.indexOf('}', bs);
  let b = text.substring(bs, be + 1), o = b;
  b = b.replace(/"s":\s*\d+/, '"s": ' + to).replace(/"t":\s*"[A-Z]"/, '"t": "' + tierForScore(to) + '"');
  if (b !== o) { text = text.substring(0, bs) + b + text.substring(be + 1); console.log(tierForScore(from)+from+' -> '+tierForScore(to)+to+' | '+card+' — '+reason); changed++; }
});
fs.writeFileSync(path, text, 'utf8');
console.log(changed + ' fixes');
