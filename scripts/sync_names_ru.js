const fs = require('fs');
const {readGeneratedExtensionFile} = require('./lib/generated-extension-data');
const ru = JSON.parse(fs.readFileSync('data/card_names_ru.json', 'utf8'));
const t = readGeneratedExtensionFile('ratings.json.js', 'utf8');
const rObj = Function('return ' + t.replace('const TM_RATINGS=', '').replace(/;\s*$/, ''))();

function norm(s) { return s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(); }

const rByNorm = {};
for (const k of Object.keys(rObj)) rByNorm[norm(k)] = k;

const newRu = {};
let renamed = 0;
for (const [k, v] of Object.entries(ru)) {
  const n = norm(k);
  const displayName = rByNorm[n];
  if (displayName && displayName !== k) {
    newRu[displayName] = v;
    renamed++;
  } else {
    newRu[k] = v;
  }
}

const newNames = {
  'Curiosity II': 'Кьюриосити II',
  'Playwrights': 'Драматурги',
  'Midas': 'Мидас',
  'CO² Reducers': 'CO² Редукторы',
  'Project Workshop': 'Проектная Мастерская',
  'Trade Advance': 'Торговый Аванс',
  'Agricola Inc': 'Агрикола Инк.',
  'Athena': 'Афина',
  'Eris': 'Эрис',
  'Incite': 'Инсайт',
  'Junk Ventures': 'Джанк Венчурс',
  'United Nations Mission One': 'Миссия ООН Один',
  'Archimedes Hydroponics Station': 'Гидропонная Станция Архимеда',
  'Luna Trade Federation': 'Лунная Торговая Федерация',
  'Nanotech Industries': 'Нанотех Индастриз',
  'High Temp. Superconductors': 'Высокотемп. Сверхпроводники',
};

let addedRu = 0;
for (const [k, v] of Object.entries(newNames)) {
  if (!newRu[k]) { newRu[k] = v; addedRu++; }
}

console.log('Renamed:', renamed, '| Added:', addedRu, '| Total:', Object.keys(newRu).length);
fs.writeFileSync('data/card_names_ru.json', JSON.stringify(newRu, null, 2));
console.log('card_names_ru.json updated!');
