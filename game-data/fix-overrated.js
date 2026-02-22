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

// Rollback overly aggressive upgrades
// [card, currentScore, newScore, reason]
const fixes = [
  ['Venusian Animals', 89, 86, 'Survivorship bias — 10.75 VP когда сыграна, но 12% Venus req сужает окно. A85→A86 компромисс'],
  ['Stratospheric Birds', 83, 79, 'VP-бомба при наличии floater engine, но без него — мёртвый груз. B77→B79'],
  ['Ganymede Colony', 80, 77, 'Нужны Jovian-теги для VP ceiling. Хороша но не A-тир. B75→B77'],
  ['Jovian Lanterns', 76, 73, 'Долго крутить, req Venus 12%. Условная карта. C68→B73'],
  ['Herbivores', 73, 70, 'Скромный апгрейд, 3.8 VP но зависит от plant production. C68→B70'],
  ['Breathing Filters', 70, 66, '2 VP за 11 MC + 7% O2 req — так себе rate. 3x winners может быть шум. C62→C66'],
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
  const origBlock = block;

  block = block.replace(/"s":\s*\d+/, '"s": ' + toScore);
  block = block.replace(/"t":\s*"[A-Z]"/, '"t": "' + newTier + '"');

  if (block !== origBlock) {
    text = text.substring(0, blockStart) + block + text.substring(blockEnd + 1);
    console.log(tierForScore(fromScore) + fromScore + ' → ' + newTier + toScore + ' | ' + card + ' — ' + reason);
    changed++;
  }
});

fs.writeFileSync(path, text, 'utf8');
console.log('\n' + changed + ' cards adjusted');
