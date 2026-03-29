const TAGS = require('../extension/data/card_tags');
const DATA = require('../extension/data/card_data');

const inTags = new Set(Object.keys(TAGS));
const inData = new Set(Object.keys(DATA));
const missing = [...inTags].filter(n => !inData.has(n));
const specialEntities = new Set(['Crew Training', 'Lowell', 'Shara']);
const aliasLike = missing.filter((n) => n.includes(':') || n.includes('\\') || /\([IVX]+\)/.test(n));
const special = missing.filter((n) => specialEntities.has(n));
const excluded = new Set([...aliasLike, ...special]);
const relevant = missing.filter((n) => !excluded.has(n));

const moonCrime = relevant.filter(n => {
  const t = TAGS[n] || [];
  return t.includes('moon') || t.includes('crime');
});
const standard = relevant.filter(n => {
  const t = TAGS[n] || [];
  return !t.includes('moon') && !t.includes('crime');
});

// Key cards from standard sets
const important = [
  'Ocean City', 'Ocean Farm', 'Ocean Sanctuary', 'Whales', 'Thiolava Vents',
  'Iron Extraction Center', 'Titanium Extraction Center', 'Ganymede Trading Company',
  'Habitat Marte', 'Mars Direct', 'Splice', 'Incite', 'Playwrights',
  'Rust Eating Bacteria', 'Deepwater Dome', 'Gaia City', 'Cave City',
  'Underground Habitat', 'Underground Settlement', 'Forest Tunnels',
  'Metallic Asteroid', 'Ringcom', 'Private Military Contractor',
  'Collegium Copernicus', 'Nobel Labs', 'Hyperspace Drive Prototype',
  'Public Spaceline', 'Keplertec', 'Robin Haulings', 'Vital Colony',
  'We Grow As One', 'Voltagon', 'Solar Farm', 'Heliostat Mirror Array',
  'Man-made Volcano', 'Algae Bioreactors', 'Agricola Inc',
  'Bio-Fertilizer Facility', 'Bioengineering Enclosure', 'Aeron Genomics',
];

console.log('=== MISSING CARD SUMMARY ===');
console.log('Total missing from card_data:', relevant.length);
console.log('  Aliases/variants:', aliasLike.length);
console.log('  Special entities:', special.length);
console.log('  Moon/Crime expansion:', moonCrime.length);
console.log('  Standard format:', standard.length);

if (special.length > 0) {
  console.log('\n=== SPECIAL ENTITIES (NOT PROJECT CARDS) ===');
  special.forEach((name) => {
    const tags = TAGS[name] || [];
    console.log('  ' + name + '  [' + tags.join(', ') + ']');
  });
}

console.log('\n=== IMPORTANT STANDARD CARDS MISSING ===');
important.forEach(name => {
  if (!inData.has(name) && inTags.has(name)) {
    const tags = TAGS[name] || [];
    console.log('  ' + name + '  [' + tags.join(', ') + ']');
  }
});

console.log('\n=== ALL STANDARD MISSING (' + standard.length + ') ===');
standard.forEach(n => {
  const tags = TAGS[n] || [];
  console.log('  ' + n + '  [' + tags.join(', ') + ']');
});
