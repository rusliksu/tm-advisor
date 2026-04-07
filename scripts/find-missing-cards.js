const {resolveGeneratedExtensionPath} = require('./lib/generated-extension-data');
const TAGS = require(resolveGeneratedExtensionPath('card_tags.js'));
const DATA = require(resolveGeneratedExtensionPath('card_data.js'));
const {SPECIAL_ENTITY_NAMES, getAliasInfo, isAliasLike} = require('./card-name-aliases');

const inTags = new Set(Object.keys(TAGS));
const inData = new Set(Object.keys(DATA));

const missing = [...inTags].filter(n => !inData.has(n));
const aliasLike = missing.filter((n) => isAliasLike(n));
const validVariants = aliasLike.filter((n) => {
  const info = getAliasInfo(n);
  return info && /_variant$/.test(info.kind);
});
const remainingAliases = aliasLike.filter((n) => !validVariants.includes(n));
const special = missing.filter((n) => SPECIAL_ENTITY_NAMES.has(n));
const excluded = [...new Set([...aliasLike, ...special])];
const relevant = missing.filter((n) => !excluded.includes(n));

function canonicalBase(name) {
  const aliasInfo = getAliasInfo(name);
  return aliasInfo ? aliasInfo.base : name.replace(/:.*$/, '').replace(/\\+$/, '');
}

function fmtTags(tags) {
  return '[' + (tags || []).join(', ') + ']';
}

console.log('Total missing:', missing.length);
console.log('Valid expansion variants:', validVariants.length);
console.log('Remaining broken aliases:', remainingAliases.length);
console.log('Excluded special entities:', special.length);
console.log('Relevant:', relevant.length);
console.log();
if (validVariants.length > 0) {
  console.log('Valid expansion variants:');
  validVariants.forEach((n) => {
    const aliasInfo = getAliasInfo(n);
    const base = canonicalBase(n);
    const aliasTags = TAGS[n] || [];
    const hasBaseData = inData.has(base);
    const hasBaseTags = inTags.has(base);
    const baseTags = TAGS[base] || [];
    console.log(
      ' ',
      n,
      '->',
      base,
      ` kind=${aliasInfo.kind}`,
      ` alias=${fmtTags(aliasTags)}`,
      ` baseData=${hasBaseData ? 'yes' : 'no'}`,
      ` baseTags=${hasBaseTags ? fmtTags(baseTags) : 'none'}`,
      ` note=${JSON.stringify(aliasInfo.note)}`
    );
  });
  console.log();
}
if (remainingAliases.length > 0) {
  console.log('Remaining broken aliases:');
  remainingAliases.forEach((n) => {
    const aliasInfo = getAliasInfo(n);
    const base = canonicalBase(n);
    const aliasTags = TAGS[n] || [];
    const hasBaseData = inData.has(base);
    const hasBaseTags = inTags.has(base);
    const baseTags = TAGS[base] || [];
    console.log(
      ' ',
      n,
      '->',
      base,
      aliasInfo ? ` kind=${aliasInfo.kind}` : ' kind=generic_variant',
      ` alias=${fmtTags(aliasTags)}`,
      ` baseData=${hasBaseData ? 'yes' : 'no'}`,
      ` baseTags=${hasBaseTags ? fmtTags(baseTags) : 'none'}`,
      aliasInfo ? ` note=${JSON.stringify(aliasInfo.note)}` : ''
    );
  });
  console.log();
}
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
