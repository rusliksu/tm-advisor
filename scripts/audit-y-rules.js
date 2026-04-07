#!/usr/bin/env node
/**
 * audit-y-rules.js
 *
 * Полный аудит y-entries в ratings.json.js на предмет пересечения
 * с движком SYNERGY_RULES (секция 48 content.js).
 *
 * Классификация:
 *   DUPLICATE   — обе карты имеют res/places аннотации с overlap типов + placesTag/tg совпадают
 *   PARTIAL     — одна из карт имеет аннотацию, вторая нет (потенциально пропущена)
 *   INDEPENDENT — нет перекрывающихся аннотаций (y-entry нужна, движок не покроет)
 *
 * Только анализ, ничего не меняет.
 */

const fs = require('fs');
const path = require('path');
const {
  readGeneratedExtensionFile,
  resolveGeneratedExtensionPath,
} = require('./lib/generated-extension-data');

// ── Load card_effects ──
const effectsRaw = readGeneratedExtensionFile('card_effects.json.js', 'utf8');
const effectsFn = new Function(effectsRaw.replace(/^const /, 'var ') + '\nreturn TM_CARD_EFFECTS;');
const effects = effectsFn();

// ── Load ratings ──
const ratingsPath = resolveGeneratedExtensionPath('ratings.json.js');
const ratingsRaw = fs.readFileSync(ratingsPath, 'utf8');
const ratingsMatch = ratingsRaw.match(/^const TM_RATINGS\s*=\s*/);
if (!ratingsMatch) { console.error('Cannot parse ratings.json.js'); process.exit(1); }
const jsonStr = ratingsRaw.slice(ratingsMatch[0].length).replace(/;\s*$/, '');
const ratings = JSON.parse(jsonStr);

// ── Helpers ──

/** Получить все типы ресурсов карты (res + places + eats) */
function getResInfo(cardName) {
  const fx = effects[cardName];
  if (!fx) return null;

  const info = {
    res: fx.res || null,                                      // accumulator type
    places: fx.places ? (Array.isArray(fx.places) ? fx.places : [fx.places]) : [],  // placer types
    eats: fx.eats || null,                                    // eater type
    placesTag: fx.placesTag || null,                          // tag restriction on placer
    tg: fx.tg ? (Array.isArray(fx.tg) ? fx.tg : [fx.tg]) : [], // card's own tags for matching
  };

  // Хотя бы одна аннотация?
  info.hasAnnotation = !!(info.res || info.places.length > 0 || info.eats);
  return info;
}

/**
 * Проверяет, может ли placer достать до target (с учётом placesTag/tg).
 * placerInfo — карта с places; targetInfo — карта с res.
 * Возвращает true если placer не ограничен тегом ИЛИ target имеет matching тег.
 */
function canReachByTag(placerInfo, targetInfo) {
  if (!placerInfo.placesTag) return true;
  return targetInfo.tg.includes(placerInfo.placesTag);
}

/**
 * Проверяет overlap типов между двумя картами с учётом placesTag/tg.
 * Покрывается ли пара движком секции 48?
 *
 * Движок обрабатывает:
 *   48a: placer(source) → accumulator(target): source.places содержит target.res
 *   48b: accumulator(source) → placer(target): target.places содержит source.res
 *   48c: accumulator competition (same res type) — не пара, а solo
 *   48d: eater(source) → accumulator(target): source.eats === target.res
 *        или eater → opponent targets
 *   48e: placer без targets — solo, не пара
 *
 * y-entry = [targetCard, value] внутри ratings[sourceCard].y
 * Значит source = карта-владелец y, target = карта-цель.
 */
function checkOverlap(sourceName, targetName) {
  const sourceInfo = getResInfo(sourceName);
  const targetInfo = getResInfo(targetName);

  const result = {
    source: sourceName,
    target: targetName,
    sourceHasAnnotation: sourceInfo ? sourceInfo.hasAnnotation : false,
    targetHasAnnotation: targetInfo ? targetInfo.hasAnnotation : false,
    overlaps: [],
    category: 'INDEPENDENT',
    details: '',
  };

  const sourceExists = sourceInfo && sourceInfo.hasAnnotation;
  const targetExists = targetInfo && targetInfo.hasAnnotation;

  // Ни у одной карты нет аннотаций
  if (!sourceExists && !targetExists) {
    result.category = 'INDEPENDENT';
    result.details = 'Обе карты без res/places/eats аннотаций';
    return result;
  }

  // Одна есть, другой нет
  if (sourceExists && !targetExists) {
    result.category = 'PARTIAL';
    const types = [];
    if (sourceInfo.res) types.push(`res:'${sourceInfo.res}'`);
    if (sourceInfo.places.length) types.push(`places:'${sourceInfo.places.join("','")}'`);
    if (sourceInfo.eats) types.push(`eats:'${sourceInfo.eats}'`);
    result.details = `Source [${sourceName}] имеет (${types.join(', ')}), target [${targetName}] — без аннотации`;
    return result;
  }

  if (!sourceExists && targetExists) {
    result.category = 'PARTIAL';
    const types = [];
    if (targetInfo.res) types.push(`res:'${targetInfo.res}'`);
    if (targetInfo.places.length) types.push(`places:'${targetInfo.places.join("','")}'`);
    if (targetInfo.eats) types.push(`eats:'${targetInfo.eats}'`);
    result.details = `Target [${targetName}] имеет (${types.join(', ')}), source [${sourceName}] — без аннотации`;
    return result;
  }

  // Обе карты имеют аннотации — проверяем overlap
  // 48a: source.places содержит target.res (source = placer, target = accumulator)
  if (sourceInfo.places.length > 0 && targetInfo.res) {
    if (sourceInfo.places.includes(targetInfo.res)) {
      if (canReachByTag(sourceInfo, targetInfo)) {
        result.overlaps.push(`48a: source places '${targetInfo.res}' → target res '${targetInfo.res}'`);
      } else {
        // placesTag не совпадает — не покрывается движком
        result.overlaps.push(`48a-BLOCKED: source placesTag='${sourceInfo.placesTag}' но target tg=[${targetInfo.tg.join(',')}] — НЕ совпадает`);
      }
    }
  }

  // 48b: target.places содержит source.res (target = placer, source = accumulator)
  if (targetInfo.places.length > 0 && sourceInfo.res) {
    if (targetInfo.places.includes(sourceInfo.res)) {
      if (canReachByTag(targetInfo, sourceInfo)) {
        result.overlaps.push(`48b: target places '${sourceInfo.res}' → source res '${sourceInfo.res}'`);
      } else {
        result.overlaps.push(`48b-BLOCKED: target placesTag='${targetInfo.placesTag}' но source tg=[${sourceInfo.tg.join(',')}] — НЕ совпадает`);
      }
    }
  }

  // 48d: source.eats === target.res (source = eater, target = accumulator)
  if (sourceInfo.eats && targetInfo.res && sourceInfo.eats === targetInfo.res) {
    result.overlaps.push(`48d: source eats '${sourceInfo.eats}' → target res '${targetInfo.res}'`);
  }

  // 48d reverse: target.eats === source.res
  if (targetInfo.eats && sourceInfo.res && targetInfo.eats === sourceInfo.res) {
    result.overlaps.push(`48d-rev: target eats '${targetInfo.eats}' → source res '${sourceInfo.res}'`);
  }

  // 48c: оба accumulator одного типа (competition)
  if (sourceInfo.res && targetInfo.res && sourceInfo.res === targetInfo.res) {
    result.overlaps.push(`48c: оба res '${sourceInfo.res}' — competition handled by engine`);
  }

  // Определяем категорию
  if (result.overlaps.length > 0) {
    // Проверяем есть ли хотя бы один настоящий overlap (не BLOCKED)
    const realOverlaps = result.overlaps.filter(o => !o.includes('-BLOCKED'));
    if (realOverlaps.length > 0) {
      result.category = 'DUPLICATE';
      result.details = realOverlaps.join(' | ');
    } else {
      // Только BLOCKED overlaps — типы совпадают, но placesTag не пускает
      result.category = 'INDEPENDENT';
      result.details = result.overlaps.join(' | ') + ' → tag mismatch, движок не покроет';
    }
  } else {
    // Обе имеют аннотации, но типы не пересекаются
    result.category = 'INDEPENDENT';
    const srcTypes = [];
    if (sourceInfo.res) srcTypes.push(`res:'${sourceInfo.res}'`);
    if (sourceInfo.places.length) srcTypes.push(`places:[${sourceInfo.places.map(t => `'${t}'`).join(',')}]`);
    if (sourceInfo.eats) srcTypes.push(`eats:'${sourceInfo.eats}'`);
    const tgtTypes = [];
    if (targetInfo.res) tgtTypes.push(`res:'${targetInfo.res}'`);
    if (targetInfo.places.length) tgtTypes.push(`places:[${targetInfo.places.map(t => `'${t}'`).join(',')}]`);
    if (targetInfo.eats) tgtTypes.push(`eats:'${targetInfo.eats}'`);
    result.details = `Обе аннотированы но без overlap: src=(${srcTypes.join(', ')}), tgt=(${tgtTypes.join(', ')})`;
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// MAIN — процессинг
// ══════════════════════════════════════════════════════════════

const duplicates = [];
const partials = [];
const independents = [];
let totalYEntries = 0;

for (const [cardName, data] of Object.entries(ratings)) {
  if (!data.y || !Array.isArray(data.y) || data.y.length === 0) continue;
  // Пропускаем "None significant"
  if (data.y.length === 1 && typeof data.y[0] === 'string') continue;

  for (const entry of data.y) {
    if (!Array.isArray(entry)) continue; // skip string entries
    const [targetCard, value] = entry;
    totalYEntries++;

    const result = checkOverlap(cardName, targetCard);
    result.value = value;

    switch (result.category) {
      case 'DUPLICATE':   duplicates.push(result);   break;
      case 'PARTIAL':     partials.push(result);      break;
      case 'INDEPENDENT': independents.push(result);  break;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// ОТЧЁТ
// ══════════════════════════════════════════════════════════════

console.log('');
console.log('══════════════════════════════════════════════════════════');
console.log('  АУДИТ Y-ENTRIES vs SYNERGY_RULES (секция 48)');
console.log('══════════════════════════════════════════════════════════');
console.log('');
console.log(`Всего y-entries (array-формат):  ${totalYEntries}`);
console.log(`  DUPLICATE   (покрыто движком): ${duplicates.length}`);
console.log(`  PARTIAL     (одна без аннот.): ${partials.length}`);
console.log(`  INDEPENDENT (движок не покроет): ${independents.length}`);
console.log('');

// ── DUPLICATE ──
if (duplicates.length > 0) {
  console.log('──────────────────────────────────────────────────────────');
  console.log('  DUPLICATE — уже покрываются движком SYNERGY_RULES');
  console.log('  (эти y-entries потенциально избыточны)');
  console.log('──────────────────────────────────────────────────────────');
  for (const d of duplicates) {
    console.log(`  [${d.source}] → [${d.target}] (val=${d.value})`);
    console.log(`    ${d.details}`);
  }
  console.log('');
}

// ── PARTIAL ──
if (partials.length > 0) {
  console.log('──────────────────────────────────────────────────────────');
  console.log('  PARTIAL — одна карта аннотирована, вторая нет');
  console.log('  (потенциально пропущена аннотация в card_effects)');
  console.log('──────────────────────────────────────────────────────────');

  // Группируем по пропущенной карте
  const missingAnnotations = {};
  for (const p of partials) {
    const missingCard = p.sourceHasAnnotation ? p.target : p.source;
    const annotatedCard = p.sourceHasAnnotation ? p.source : p.target;
    if (!missingAnnotations[missingCard]) {
      missingAnnotations[missingCard] = [];
    }
    missingAnnotations[missingCard].push({
      partner: annotatedCard,
      value: p.value,
      details: p.details,
      sourceIsAnnotated: p.sourceHasAnnotation,
    });
  }

  console.log('');
  console.log(`  Карт без аннотации, упомянутых в PARTIAL: ${Object.keys(missingAnnotations).length}`);
  console.log('');

  for (const [missingCard, refs] of Object.entries(missingAnnotations)) {
    // Проверим есть ли эта карта в effects вообще (может есть, но без res/places/eats)
    const fx = effects[missingCard];
    const hasEntry = !!fx;
    const marker = hasEntry ? '(есть в effects, но без res/places/eats)' : '(ОТСУТСТВУЕТ в effects)';

    console.log(`  ${missingCard} ${marker}`);
    for (const ref of refs) {
      const annotatedFx = effects[ref.partner];
      const annTypes = [];
      if (annotatedFx.res) annTypes.push(`res:'${annotatedFx.res}'`);
      if (annotatedFx.places) {
        const p = Array.isArray(annotatedFx.places) ? annotatedFx.places : [annotatedFx.places];
        annTypes.push(`places:'${p.join("','")}'`);
      }
      if (annotatedFx.eats) annTypes.push(`eats:'${annotatedFx.eats}'`);

      const direction = ref.sourceIsAnnotated ? '←' : '→';
      console.log(`    ${direction} ${ref.partner} (${annTypes.join(', ')}) val=${ref.value}`);
    }
    console.log('');
  }
}

// ── INDEPENDENT ──
if (independents.length > 0) {
  console.log('──────────────────────────────────────────────────────────');
  console.log('  INDEPENDENT — движок не покроет (y-entry нужна)');
  console.log('──────────────────────────────────────────────────────────');
  for (const ind of independents) {
    console.log(`  [${ind.source}] → [${ind.target}] (val=${ind.value})`);
    console.log(`    ${ind.details}`);
  }
  console.log('');
}

// ── Сводка ──
console.log('══════════════════════════════════════════════════════════');
console.log('  СВОДКА');
console.log('══════════════════════════════════════════════════════════');
console.log(`  Всего y-entries:       ${totalYEntries}`);
console.log(`  DUPLICATE:             ${duplicates.length} (${(duplicates.length / totalYEntries * 100).toFixed(1)}%)`);
console.log(`  PARTIAL:               ${partials.length} (${(partials.length / totalYEntries * 100).toFixed(1)}%)`);
console.log(`  INDEPENDENT:           ${independents.length} (${(independents.length / totalYEntries * 100).toFixed(1)}%)`);
console.log('');
if (duplicates.length > 0) {
  console.log(`  РЕКОМЕНДАЦИЯ: ${duplicates.length} y-entries можно удалить как дублирующие SYNERGY_RULES.`);
}
if (partials.length > 0) {
  console.log(`  РЕКОМЕНДАЦИЯ: Проверить ${Object.keys(partials.reduce((acc, p) => { acc[p.sourceHasAnnotation ? p.target : p.source] = 1; return acc; }, {})).length} карт — возможно нужно добавить res/places/eats аннотации.`);
}
console.log('');
