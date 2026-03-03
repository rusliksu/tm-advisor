/**
 * Собирает русские названия карт из официальной локализации
 * terraforming-mars/terraforming-mars (src/locales/ru/).
 *
 * 1. Парсит CardName.ts enum → список всех английских имён карт
 * 2. Загружает все JSON-файлы локализации
 * 3. Матчит: если ключ JSON == CardName → берём значение как русское название
 * 4. Мержит в card_names_ru.json (приоритет у официальных переводов)
 */

const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const LOCALES = path.join(BASE, 'tmp_locales');
const OUT = path.join(BASE, 'data', 'card_names_ru.json');

// --- 1. Parse CardName enum ---
const enumText = fs.readFileSync(path.join(LOCALES, 'CardName.ts'), 'utf8');
const cardNames = new Set();
// Match: ENUM_KEY = 'Card Name',
const re = /=\s*'([^']+)'/g;
let m;
while ((m = re.exec(enumText)) !== null) {
  cardNames.add(m[1]);
}
console.log('CardName enum entries:', cardNames.size);

// --- 2. Load all locale JSONs ---
const localeFiles = fs.readdirSync(LOCALES).filter(f => f.endsWith('.json'));
const allTranslations = {};

for (const file of localeFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(LOCALES, file), 'utf8'));
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      allTranslations[key] = value;
    }
  }
}
console.log('Total locale entries:', Object.keys(allTranslations).length);

// --- 3. Match card names to translations ---
const officialRu = {};
let matched = 0;
let noTranslation = [];

for (const name of cardNames) {
  if (allTranslations[name]) {
    officialRu[name] = allTranslations[name];
    matched++;
  } else {
    noTranslation.push(name);
  }
}
console.log('Matched:', matched, '| No translation:', noTranslation.length);

// --- 4. Also check our evaluations.json for names not in CardName enum ---
const evals = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'evaluations.json'), 'utf8'));
const evalNames = new Set(Object.keys(evals));

let extraMatched = 0;
for (const name of evalNames) {
  if (!officialRu[name] && allTranslations[name]) {
    officialRu[name] = allTranslations[name];
    extraMatched++;
  }
}
console.log('Extra matched (from evals):', extraMatched);

// --- 5. Merge into existing card_names_ru.json ---
const existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
let updated = 0;
let added = 0;

for (const [en, ru] of Object.entries(officialRu)) {
  if (!existing[en]) {
    existing[en] = ru;
    added++;
  } else if (existing[en] !== ru) {
    // Official translation overrides our manual one
    console.log(`  UPDATE: "${en}": "${existing[en]}" -> "${ru}"`);
    existing[en] = ru;
    updated++;
  }
}

console.log('\nResult: added', added, '| updated', updated, '| total', Object.keys(existing).length);

// Show cards from evaluations.json still missing translations
const stillMissing = [];
for (const name of evalNames) {
  if (!existing[name]) {
    stillMissing.push(name);
  }
}
console.log('Still missing (in evals but no RU):', stillMissing.length);
if (stillMissing.length > 0) {
  console.log(stillMissing.sort().join('\n'));
}

fs.writeFileSync(OUT, JSON.stringify(existing, null, 2));
console.log('\ncard_names_ru.json saved!');
