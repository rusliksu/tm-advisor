/**
 * Аудит несовпадений ключей между ratings.json.js и card_effects.json.js
 *
 * Логика:
 * 1. Загружаем оба файла (eval JS)
 * 2. Для каждого ключа из ratings ищем его в card_effects
 * 3. Если не нашли — пробуем:
 *    a) Добавить пробелы перед заглавными буквами (CamelCase → "Camel Case")
 *    b) Levenshtein distance к каждому ключу card_effects
 * 4. Выводим несовпадения с предложенными исправлениями
 */

const fs = require('fs');
const path = require('path');

// --- Загрузка файлов ---
const dataDir = path.join(__dirname, '..', 'extension', 'data');

// Загружаем ratings.json.js — формат: const TM_RATINGS={...}
const ratingsRaw = fs.readFileSync(path.join(dataDir, 'ratings.json.js'), 'utf8');
// Убираем "const TM_RATINGS=" и терминальный ";", парсим как выражение
const TM_RATINGS = new Function(ratingsRaw.replace(/^const\s+TM_RATINGS\s*=\s*/, 'return '))();

// Загружаем card_effects.json.js — формат: const TM_CARD_EFFECTS={...}
const effectsRaw = fs.readFileSync(path.join(dataDir, 'card_effects.json.js'), 'utf8');
// Тут есть комментарии сверху, нужно найти начало объекта
const TM_CARD_EFFECTS = new Function(effectsRaw.replace(/^[\s\S]*?const\s+TM_CARD_EFFECTS\s*=\s*/, 'return '))();

const ratingsKeys = Object.keys(TM_RATINGS);
const effectsKeys = Object.keys(TM_CARD_EFFECTS);
const effectsSet = new Set(effectsKeys);

// --- Levenshtein distance ---
function levenshtein(a, b) {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[la][lb];
}

// --- Добавление пробелов перед заглавными ---
// "CO2Reducers" → "CO2 Reducers", "BreedingFarms" → "Breeding Farms"
function splitCamelCase(str) {
  // Вставляем пробел перед заглавной, если перед ней строчная или цифра
  // Также перед заглавной, если за ней строчная, а перед — заглавная (аббревиатуры)
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')  // camelCase → camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'); // ABCDef → ABC Def
}

// --- Нормализация для сравнения ---
function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// --- Поиск лучшего совпадения ---
function findBestMatch(key, candidates) {
  // Сначала пробуем splitCamelCase
  const spaced = splitCamelCase(key);
  if (spaced !== key && effectsSet.has(spaced)) {
    return { match: spaced, method: 'CamelCase split', distance: 0 };
  }

  // Нормализованное сравнение (без пробелов, lowercase)
  const normKey = normalize(key);
  for (const c of candidates) {
    if (normalize(c) === normKey) {
      return { match: c, method: 'normalized match', distance: 0 };
    }
  }

  // Levenshtein по оригиналу
  let bestDist = Infinity;
  let bestMatch = null;
  for (const c of candidates) {
    const d = levenshtein(key, c);
    if (d < bestDist) {
      bestDist = d;
      bestMatch = c;
    }
  }

  // Levenshtein по splitCamelCase → candidates
  const spacedLower = spaced.toLowerCase();
  for (const c of candidates) {
    const d = levenshtein(spaced, c);
    if (d < bestDist) {
      bestDist = d;
      bestMatch = c;
      // помечаем что через split
    }
  }

  return { match: bestMatch, method: `Levenshtein (d=${bestDist})`, distance: bestDist };
}

// --- Основной анализ ---
console.log('=== Аудит ключей: ratings.json.js vs card_effects.json.js ===\n');
console.log(`Ключей в ratings:      ${ratingsKeys.length}`);
console.log(`Ключей в card_effects: ${effectsKeys.length}\n`);

const mismatches = [];
let matchCount = 0;

for (const key of ratingsKeys) {
  if (effectsSet.has(key)) {
    matchCount++;
  } else {
    const best = findBestMatch(key, effectsKeys);
    mismatches.push({ ratingsKey: key, ...best });
  }
}

console.log(`Точных совпадений:     ${matchCount}`);
console.log(`Несовпадений:          ${mismatches.length}\n`);

if (mismatches.length === 0) {
  console.log('Все ключи совпадают!');
} else {
  // Разделим: уверенные исправления (d=0 или d<=3) и сомнительные
  const confident = mismatches.filter(m => m.distance <= 3);
  const uncertain = mismatches.filter(m => m.distance > 3);

  console.log('--- Уверенные исправления (distance <= 3) ---\n');
  console.log(String('ratings ключ').padEnd(40) + ' → ' + String('card_effects ключ').padEnd(40) + '  метод');
  console.log('─'.repeat(110));

  for (const m of confident.sort((a, b) => a.distance - b.distance)) {
    const arrow = m.distance === 0 ? '→' : '~>';
    console.log(
      `"${m.ratingsKey}"`.padEnd(40) + ` ${arrow} ` +
      `"${m.match}"`.padEnd(40) + `  ${m.method}`
    );
  }

  if (uncertain.length > 0) {
    console.log(`\n--- Сомнительные (distance > 3, нужна ручная проверка) ---\n`);
    console.log(String('ratings ключ').padEnd(40) + ' → ' + String('ближайший в card_effects').padEnd(40) + '  метод');
    console.log('─'.repeat(110));

    for (const m of uncertain.sort((a, b) => a.distance - b.distance)) {
      console.log(
        `"${m.ratingsKey}"`.padEnd(40) + ` ~> ` +
        `"${m.match}"`.padEnd(40) + `  ${m.method}`
      );
    }
  }

  // Обратная проверка: ключи в card_effects, которых нет в ratings
  const ratingsSet = new Set(ratingsKeys);
  const ratingsNormSet = new Set(ratingsKeys.map(normalize));
  const missingInRatings = effectsKeys.filter(k => !ratingsSet.has(k) && !ratingsNormSet.has(normalize(k)));

  // Фильтруем те, что уже нашлись через mismatches
  const matchedEffectsKeys = new Set(mismatches.map(m => m.match));
  const trulyMissing = missingInRatings.filter(k => !matchedEffectsKeys.has(k));

  console.log(`\n--- card_effects ключи без пары в ratings: ${trulyMissing.length} ---`);
  if (trulyMissing.length > 0 && trulyMissing.length <= 50) {
    for (const k of trulyMissing) {
      console.log(`  "${k}"`);
    }
  } else if (trulyMissing.length > 50) {
    console.log(`  (слишком много — ${trulyMissing.length} штук, показываю первые 50)`);
    for (const k of trulyMissing.slice(0, 50)) {
      console.log(`  "${k}"`);
    }
  }
}

// --- Специально проверим подозрительные из аудита ---
console.log('\n\n=== Проверка конкретных подозрительных ключей ===\n');
const suspects = ['CO2Reducers', 'BreedingFarms', 'CeresSpaceport', 'ControlledBloom', 'NobelLabs'];

for (const s of suspects) {
  const inRatings = ratingsKeys.includes(s);
  const inEffects = effectsKeys.includes(s);
  const spaced = splitCamelCase(s);
  const spacedInEffects = effectsKeys.includes(spaced);

  console.log(`"${s}":`);
  console.log(`  В ratings:      ${inRatings ? 'ДА' : 'НЕТ'}`);
  console.log(`  В card_effects: ${inEffects ? 'ДА' : 'НЕТ'}`);
  console.log(`  CamelCase split: "${spaced}" → в card_effects: ${spacedInEffects ? 'ДА' : 'НЕТ'}`);

  if (!inEffects && !spacedInEffects) {
    // Levenshtein
    let bestD = Infinity, bestM = '';
    for (const k of effectsKeys) {
      const d = levenshtein(spaced, k);
      if (d < bestD) { bestD = d; bestM = k; }
    }
    console.log(`  Ближайший: "${bestM}" (Levenshtein=${bestD})`);
  }
  console.log('');
}
