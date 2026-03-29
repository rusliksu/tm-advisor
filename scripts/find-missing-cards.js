const TAGS = require('../extension/data/card_tags');
const DATA = require('../extension/data/card_data');

const inTags = new Set(Object.keys(TAGS));
const inData = new Set(Object.keys(DATA));

const missing = [...inTags].filter(n => !inData.has(n));
const specialEntities = new Set(['Crew Training', 'Lowell', 'Shara']);
const aliasLike = missing.filter((n) => n.includes(':') || n.includes('\\') || /\([IVX]+\)/.test(n));
const special = missing.filter((n) => specialEntities.has(n));
const excluded = [...new Set([...aliasLike, ...special])];
const relevant = missing.filter((n) => !excluded.includes(n));

console.log('Total missing:', missing.length);
console.log('Excluded aliases/variants:', aliasLike.length);
console.log('Excluded special entities:', special.length);
console.log('Relevant:', relevant.length);
console.log();
if (special.length > 0) {
  console.log('Special entities:');
  special.forEach((n) => {
    const tags = TAGS[n] || [];
    console.log(' ', n, '  [' + tags.join(', ') + ']');
  });
  console.log();
}
relevant.forEach(n => {
  const tags = TAGS[n] || [];
  console.log(' ', n, '  [' + tags.join(', ') + ']');
});
