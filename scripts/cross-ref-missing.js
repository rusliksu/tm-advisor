const extracted = require('../data/all-card-behaviors.json');
const {resolveGeneratedExtensionPath} = require('./lib/generated-extension-data');
const TAGS = require(resolveGeneratedExtensionPath('card_tags.js'));
const DATA = require(resolveGeneratedExtensionPath('card_data.js'));

const inTags = new Set(Object.keys(TAGS));
const inData = new Set(Object.keys(DATA));
const missing = [...inTags].filter(n => {
  return !inData.has(n) && !n.includes(':') && !/\([IVX]+\)/.test(n);
});

let found = 0, notFound = 0, hasBehavior = 0, emptyBehavior = 0;
const notFoundNames = [];
const emptyNames = [];

for (const name of missing) {
  const card = extracted[name];
  if (card) {
    found++;
    const beh = card.behavior || {};
    const act = card.action || {};
    if (Object.keys(beh).length > 0 || Object.keys(act).length > 0 || card.vp || card.vpPerResource || card.vpPerTag) {
      hasBehavior++;
    } else {
      emptyBehavior++;
      emptyNames.push(name);
    }
  } else {
    notFound++;
    notFoundNames.push(name);
  }
}

console.log('Missing cards:', missing.length);
console.log('Found in extracted:', found);
console.log('  With behavior/action/VP:', hasBehavior);
console.log('  Empty behavior:', emptyBehavior);
console.log('Not found:', notFound);
if (emptyNames.length > 0) {
  console.log('\nEmpty behavior:', emptyNames.join(', '));
}
if (notFoundNames.length > 0) {
  console.log('\nNot found:', notFoundNames.join(', '));
}
