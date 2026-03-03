const fs = require('fs');
const path = require('path');

const imgMap = JSON.parse(fs.readFileSync('data/image_mapping.json', 'utf8'));
const index = JSON.parse(fs.readFileSync('data/card_index.json', 'utf8'));
const evals = JSON.parse(fs.readFileSync('data/evaluations.json', 'utf8'));

const missing = Object.keys(evals).filter(n => !imgMap[n]);
console.log('Missing from image_mapping:', missing.length);

// Try to find on disk with various name patterns
let foundOnDisk = 0;
const newMappings = {};

for (const name of missing) {
  const type = (index[name] && index[name].type) || '?';
  let dir = 'images/project_cards';
  if (type === 'corporation') dir = 'images/corporations';
  else if (type === 'prelude') dir = 'images/preludes';
  else if (type === 'ceo') dir = 'images/ceos';

  // Try different filename patterns
  const patterns = [
    name.replace(/ /g, '_') + '.png',
    name.replace(/ /g, '_').replace(/[^a-zA-Z0-9_]/g, '') + '.png',
    name.replace(/[^a-zA-Z0-9]/g, '_') + '.png',
    name.replace(/[^a-zA-Z0-9]/g, '') + '.png',
  ];

  let found = false;
  for (const filename of patterns) {
    const filepath = path.join(dir, filename);
    if (fs.existsSync(filepath)) {
      newMappings[name] = filepath;
      foundOnDisk++;
      found = true;
      break;
    }
  }

  if (!found) {
    // Also try scanning the directory for partial matches
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      const nameNorm = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const match = files.find(f => f.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().replace('.png', '') === nameNorm);
      if (match) {
        newMappings[name] = path.join(dir, match);
        foundOnDisk++;
        found = true;
      }
    }
  }
}

console.log('Found on disk but unmapped:', foundOnDisk);

if (foundOnDisk > 0) {
  Object.assign(imgMap, newMappings);
  fs.writeFileSync('data/image_mapping.json', JSON.stringify(imgMap, null, 2));
  console.log('image_mapping.json updated! Total:', Object.keys(imgMap).length);
}

// Still missing
const stillMissing = Object.keys(evals).filter(n => !imgMap[n] && !newMappings[n]);
console.log('\nStill missing images:', stillMissing.length);

// Group by type
const byType = {};
for (const n of stillMissing) {
  const t = (index[n] && index[n].type) || '?';
  if (!byType[t]) byType[t] = [];
  byType[t].push(n);
}
for (const [type, names] of Object.entries(byType)) {
  console.log(`\n=== ${type} (${names.length}) ===`);
  names.forEach(n => console.log(' ', n));
}
