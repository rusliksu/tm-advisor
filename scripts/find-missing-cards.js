const TAGS = require('../extension/data/card_tags');
const DATA = require('../extension/data/card_data');

const inTags = new Set(Object.keys(TAGS));
const inData = new Set(Object.keys(DATA));

const missing = [...inTags].filter(n => !inData.has(n));
const excluded = missing.filter(n => n.includes(':') || /\([IVX]+\)/.test(n));
const relevant = missing.filter(n => !excluded.includes(n));

console.log('Total missing:', missing.length);
console.log('Excluded (variants/SW):', excluded.length);
console.log('Relevant:', relevant.length);
console.log();
relevant.forEach(n => {
  const tags = TAGS[n] || [];
  console.log(' ', n, '  [' + tags.join(', ') + ']');
});
