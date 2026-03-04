/**
 * _fix_types.js
 *
 * Проставляет поле "type" для записей в evaluations.json,
 * у которых оно отсутствует/пустое/null.
 *
 * Источник типов:
 *   1. card_index.json (active/automated/event → "project", остальные 1:1)
 *   2. Эвристика по тексту evaluation (CEO/OPG, prelude, corporation)
 *   3. Дефолт → "project"
 *
 * Запуск: node scripts/_fix_types.js
 * Для dry-run (без записи): node scripts/_fix_types.js --dry-run
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const EVAL_PATH = path.join(__dirname, '..', 'data', 'evaluations.json');
const INDEX_PATH = path.join(__dirname, '..', 'data', 'card_index.json');

// --- Загрузка данных ---
const evaluations = JSON.parse(fs.readFileSync(EVAL_PATH, 'utf-8'));
const cardIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));

// --- Нормализация ключей card_index для fuzzy lookup ---
// Строим map: lowercase name → entry
const indexByLower = new Map();
for (const key of Object.keys(cardIndex)) {
  indexByLower.set(key.toLowerCase(), cardIndex[key]);
}

// --- Маппинг типов card_index → evaluations ---
function mapType(indexType) {
  switch (indexType) {
    case 'active':
    case 'automated':
    case 'event':
      return 'project';
    case 'corporation':
      return 'corporation';
    case 'prelude':
      return 'prelude';
    case 'ceo':
      return 'ceo';
    default:
      return null; // неизвестный тип
  }
}

// --- Эвристика по тексту evaluation ---
function inferTypeFromText(entry) {
  const text = [
    entry.economy || '',
    entry.reasoning || '',
    entry.when_to_pick || '',
  ].join(' ').toLowerCase();

  // CEO: упоминания OPG (Once Per Game), "ceo", "лидер"
  if (/\bceo\b/.test(text) || /\bonce per game\b/.test(text) || /\bopg\b/.test(text)) {
    return 'ceo';
  }

  // Prelude: "prelude value", "prelude", "прелюдия"
  if (/\bprelude\b/.test(text) && /\bprelude value\b|\bprelude card\b|\bas a prelude\b|\bfor a prelude\b|\bсредн\w* прелюд\b|\bprелюдия\b/.test(text)) {
    return 'prelude';
  }
  // Сильный сигнал: "средняя прелюдия", "prelude value", "prelude benchmark"
  if (/prelude value|prelude benchmark|средн\w+ прелюди/i.test(text)) {
    return 'prelude';
  }

  // Corporation: "стартовый капитал", "starting MC", "corp ability", "корпорация"
  if (/\bstarting mc\b|\bстартов\w+ капитал\b|\bcorp ability\b|\bcorp\b.*\bstart\b|\bкорпорац\b/i.test(text)) {
    // Но project карты тоже могут упоминать "corp" в синергиях — нужен более строгий матч
    // Считаем corporation если есть явные маркеры стартового капитала
    if (/\bstarting mc\b|\bстартов\w+ капитал\b|\bcorp ability\b|\bfirst action\b/i.test(text)) {
      return 'corporation';
    }
  }

  return null; // не удалось определить
}

// --- Основной цикл ---
const stats = {
  alreadyHasType: 0,
  matchedFromIndex: 0,
  inferredCeo: 0,
  inferredPrelude: 0,
  inferredCorporation: 0,
  defaultProject: 0,
  unknown: [],
};

const result = {};

for (const key of Object.keys(evaluations)) {
  const entry = evaluations[key];

  // Проверяем, есть ли уже type
  if (entry.type && entry.type.trim() !== '') {
    stats.alreadyHasType++;
    result[key] = entry;
    continue;
  }

  // 1. Поиск в card_index (exact match по ключу, потом по lowercase)
  let mappedType = null;
  const indexEntry = cardIndex[key] || indexByLower.get(key.toLowerCase());

  if (indexEntry && indexEntry.type) {
    mappedType = mapType(indexEntry.type);
    if (mappedType) {
      stats.matchedFromIndex++;
    }
  }

  // 2. Эвристика по тексту, если card_index не помог
  if (!mappedType) {
    const inferred = inferTypeFromText(entry);
    if (inferred) {
      mappedType = inferred;
      switch (inferred) {
        case 'ceo': stats.inferredCeo++; break;
        case 'prelude': stats.inferredPrelude++; break;
        case 'corporation': stats.inferredCorporation++; break;
      }
    }
  }

  // 3. Дефолт → "project"
  if (!mappedType) {
    // Запоминаем для отчёта, но ставим "project"
    stats.unknown.push(key);
    mappedType = 'project';
    stats.defaultProject++;
  }

  // Вставляем type после tier (сохраняя порядок полей)
  const newEntry = {};
  for (const field of Object.keys(entry)) {
    newEntry[field] = entry[field];
    if (field === 'tier') {
      newEntry.type = mappedType;
    }
  }
  // Если поля tier нет (на всякий случай), добавляем type в конец
  if (!('type' in newEntry)) {
    newEntry.type = mappedType;
  }

  result[key] = newEntry;
}

// --- Статистика ---
console.log('\n=== STATS ===');
console.log(`Всего записей:             ${Object.keys(evaluations).length}`);
console.log(`Уже с type:                ${stats.alreadyHasType}`);
console.log(`Назначено из card_index:   ${stats.matchedFromIndex}`);
console.log(`Inferred CEO:              ${stats.inferredCeo}`);
console.log(`Inferred Prelude:          ${stats.inferredPrelude}`);
console.log(`Inferred Corporation:      ${stats.inferredCorporation}`);
console.log(`Default → project:         ${stats.defaultProject}`);
console.log(`-----`);
const totalAssigned = stats.matchedFromIndex + stats.inferredCeo + stats.inferredPrelude + stats.inferredCorporation + stats.defaultProject;
console.log(`Итого назначено type:      ${totalAssigned}`);

if (stats.unknown.length > 0) {
  console.log(`\n=== Карты без match в card_index (получили default "project") ===`);
  console.log(`Количество: ${stats.unknown.length}`);
  for (const name of stats.unknown) {
    console.log(`  - ${name}`);
  }
}

// --- Проверка распределения типов ---
const typeCounts = {};
for (const key of Object.keys(result)) {
  const t = result[key].type || 'MISSING';
  typeCounts[t] = (typeCounts[t] || 0) + 1;
}
console.log('\n=== Распределение типов в результате ===');
for (const [t, c] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t}: ${c}`);
}

// --- Запись ---
if (DRY_RUN) {
  console.log('\n[DRY RUN] Файл НЕ записан.');
} else {
  fs.writeFileSync(EVAL_PATH, JSON.stringify(result, null, 2) + '\n', 'utf-8');
  console.log(`\nФайл записан: ${EVAL_PATH}`);
}
