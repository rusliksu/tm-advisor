const fs = require('fs');
const path = require('path');
const {
  readGeneratedExtensionFile,
  resolveGeneratedExtensionPath,
  writeGeneratedExtensionFile,
} = require('./lib/generated-extension-data');

const ROOT = path.resolve(__dirname, '..');
const RAW_FILE = path.join(ROOT, 'data/tm-all-cards-raw.json');
const TAGS_FILE = resolveGeneratedExtensionPath('card_tags.js');
const DESC_FILE = resolveGeneratedExtensionPath('card_descriptions.js');

const SKIP_MODULES = ['starwars', 'community'];

// Read raw data
const raw = JSON.parse(fs.readFileSync(RAW_FILE, 'utf8'));
const filtered = raw.filter(c => !SKIP_MODULES.includes(c.module));

// ===== TAGS =====
const tagsContent = fs.readFileSync(TAGS_FILE, 'utf8');

// Extract existing card names from tags file
const existingTagNames = new Set();
const tagRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*\[/g;
let m;
while ((m = tagRegex.exec(tagsContent)) !== null) {
  existingTagNames.add(m[1]);
}
console.log('Existing tag entries:', existingTagNames.size);

// Find cards with tags not in the file
const missingTags = filtered.filter(c => c.tags && c.tags.length > 0 && !existingTagNames.has(c.name));
console.log('Missing tag entries:', missingTags.length);

if (missingTags.length > 0) {
  // Build new lines
  const newLines = missingTags.map(c => {
    const name = c.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const tags = c.tags.map(t => `"${t}"`).join(',');
    return `  "${name}": [${tags}]`;
  });

  console.log('\nNew tag entries:');
  newLines.forEach(l => console.log(l));

  // Find the closing "};' line
  // Strategy: find last "};" and insert before it
  const closingIdx = tagsContent.lastIndexOf('};');
  const before = tagsContent.substring(0, closingIdx);
  const after = tagsContent.substring(closingIdx);

  // Check if the last non-whitespace char before closing is a comma
  const trimmedBefore = before.trimEnd();
  const needsComma = !trimmedBefore.endsWith(',');

  const insert = (needsComma ? ',\n' : '\n') + newLines.join(',\n') + ',\n';

  let updated = before + insert + after;

  // Update count in comment
  const newCount = existingTagNames.size + missingTags.length;
  updated = updated.replace(/\/\/ \d+ cards/, `// ${newCount} cards`);

  writeGeneratedExtensionFile('card_tags.js', updated);
  console.log(`\ncard_tags.js: ${existingTagNames.size} -> ${newCount} entries`);
} else {
  console.log('card_tags.js: no changes needed');
}

// ===== DESCRIPTIONS =====
const descContent = readGeneratedExtensionFile('card_descriptions.js', 'utf8');

// Extract existing card names from descriptions file
const existingDescNames = new Set();
const descRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*"/g;
while ((m = descRegex.exec(descContent)) !== null) {
  existingDescNames.add(m[1]);
}
console.log('\nExisting description entries:', existingDescNames.size);

// Find cards with string descriptions not in the file
const missingDescs = filtered.filter(c => {
  return c.metadata && typeof c.metadata.description === 'string' && !existingDescNames.has(c.name);
});
console.log('Missing description entries:', missingDescs.length);

if (missingDescs.length > 0) {
  // Build new lines
  const newDescLines = missingDescs.map(c => {
    const name = c.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const desc = c.metadata.description.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `  "${name}": "${desc}"`;
  });

  console.log('\nNew description entries:');
  newDescLines.forEach(l => console.log(l));

  // Find the closing "};"
  const closingIdx = descContent.lastIndexOf('};');
  const before = descContent.substring(0, closingIdx);
  const after = descContent.substring(closingIdx);

  const trimmedBefore = before.trimEnd();
  const needsComma = !trimmedBefore.endsWith(',');

  const insert = (needsComma ? ',\n' : '\n') + newDescLines.join(',\n') + ',\n';

  let updated = before + insert + after;

  // Update count in comment
  const newCount = existingDescNames.size + missingDescs.length;
  updated = updated.replace(/\/\/ \d+ card descriptions/, `// ${newCount} card descriptions`);

  writeGeneratedExtensionFile('card_descriptions.js', updated);
  console.log(`\ncard_descriptions.js: ${existingDescNames.size} -> ${newCount} entries`);
} else {
  console.log('card_descriptions.js: no changes needed');
}
