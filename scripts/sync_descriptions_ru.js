/**
 * Синхронизирует русские описания карт из официальной локализации TM.
 *
 * Локализация хранит ВСЕ строки вперемешку (названия + описания + UI).
 * Названия мы уже синхронизировали (card_names_ru.json).
 * Описания — это строки из локалей, которые НЕ являются названиями карт.
 *
 * Стратегия: берём все строки из локалей, исключаем те что == названию карты,
 * и ищем описания через card_index.json.description (EN) → локаль (RU).
 */

const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const LOCALES = path.join(BASE, 'tmp_locales');

// Load data
const index = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'card_index.json'), 'utf8'));
const evals = JSON.parse(fs.readFileSync(path.join(BASE, 'data', 'evaluations.json'), 'utf8'));

// Load all locale strings
const localeFiles = fs.readdirSync(LOCALES).filter(f => f.endsWith('.json'));
const allStrings = {};
for (const file of localeFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(LOCALES, file), 'utf8'));
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      allStrings[key] = value;
    }
  }
}
console.log('Total locale strings:', Object.keys(allStrings).length);

// Match descriptions: card_index[name].description (EN) → locale RU
let matched = 0;
let noMatch = 0;

for (const [name, card] of Object.entries(index)) {
  if (!card.description) continue;

  // The description in card_index is the English effect text
  // Try to find it in locales
  const enDesc = card.description;
  if (allStrings[enDesc]) {
    card.description_ru = allStrings[enDesc];
    matched++;
  } else {
    noMatch++;
  }
}

console.log('Descriptions matched:', matched, '| No match:', noMatch);

// Fix HighTempSuperconductors key issue
if (index['HighTempSuperconductors'] && !index['High Temp. Superconductors']) {
  index['High Temp. Superconductors'] = index['HighTempSuperconductors'];
  delete index['HighTempSuperconductors'];
  console.log('Fixed: HighTempSuperconductors -> High Temp. Superconductors');
}

// Same fix in evaluations.json
if (evals['HighTempSuperconductors'] && !evals['High Temp. Superconductors']) {
  evals['High Temp. Superconductors'] = evals['HighTempSuperconductors'];
  delete evals['HighTempSuperconductors'];
  console.log('Fixed in evaluations.json too');
}

// Check type distribution to debug 506 vs 499
const types = {};
for (const [name, card] of Object.entries(index)) {
  const t = card.type || 'MISSING';
  types[t] = (types[t] || 0) + 1;
}
console.log('\nType distribution in card_index:', JSON.stringify(types, null, 2));

// Fix: cards with type "project" should be "automated" (or proper type)
if (types['project']) {
  console.log('\nCards with type "project":');
  for (const [name, card] of Object.entries(index)) {
    if (card.type === 'project') {
      console.log(' ', name);
    }
  }
}

fs.writeFileSync(path.join(BASE, 'data', 'card_index.json'), JSON.stringify(index, null, 2));
fs.writeFileSync(path.join(BASE, 'data', 'evaluations.json'), JSON.stringify(evals, null, 2));
console.log('\ncard_index.json and evaluations.json saved!');
