const fs = require('fs');
let content = fs.readFileSync('ratings.json.js', 'utf8');
content = content.replace(/^const /, 'var ');
eval(content);

const cardNames = new Set(Object.keys(TM_RATINGS));
const hasCyrillic = /[\u0400-\u04FF]/;

const yValues = new Map();
for (const [key, val] of Object.entries(TM_RATINGS)) {
  if (val.y) {
    for (const item of val.y) {
      if (cardNames.has(item) === false && hasCyrillic.test(item) === false) {
        yValues.set(item, (yValues.get(item) || 0) + 1);
      }
    }
  }
}

const sorted = [...yValues.entries()].sort((a, b) => b[1] - a[1]);
console.log('=== REMAINING ENGLISH Y VALUES (should be proper names only) ===');
sorted.forEach(([v, c]) => console.log(c + 'x ' + JSON.stringify(v)));
console.log('\nTotal unique:', sorted.length);
console.log('Total occurrences:', sorted.reduce((s, [, c]) => s + c, 0));
