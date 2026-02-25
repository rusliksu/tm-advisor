#!/usr/bin/env node
/**
 * clean-y-rules.js
 *
 * Удаляет y-записи в ratings.json.js, которые теперь покрываются
 * движком SYNERGY_RULES (секция 48 content.js).
 *
 * Условие удаления: обе карты (card и y-target) имеют res/places
 * аннотации в card_effects.json.js с пересекающимся типом ресурса.
 *
 * Пример: Birds (res:'animal') ↔ Large Convoy (places:'animal')
 *   → тип 'animal' пересекается → убираем из y, engine обработает.
 */

const fs = require('fs');
const path = require('path');

// ── Load card_effects ──
const effectsPath = path.join(__dirname, '..', 'extension', 'data', 'card_effects.json.js');
const effectsRaw = fs.readFileSync(effectsPath, 'utf8');
// Execute to get the object (const → wrap in function)
const effectsFn = new Function(effectsRaw.replace(/^const /, 'var ') + '\nreturn TM_CARD_EFFECTS;');
const effects = effectsFn();

// ── Load ratings ──
const ratingsPath = path.join(__dirname, '..', 'extension', 'data', 'ratings.json.js');
const ratingsRaw = fs.readFileSync(ratingsPath, 'utf8');
const ratingsMatch = ratingsRaw.match(/^const TM_RATINGS\s*=\s*/);
if (!ratingsMatch) { console.error('Cannot parse ratings.json.js'); process.exit(1); }
const jsonStr = ratingsRaw.slice(ratingsMatch[0].length).replace(/;\s*$/, '');
const ratings = JSON.parse(jsonStr);

// ── Helper: get all resource types for a card ──
function getResTypes(cardName) {
  const fx = effects[cardName];
  if (!fx) return new Set();
  const types = new Set();
  if (fx.res) types.add(fx.res);
  if (fx.places) {
    const p = Array.isArray(fx.places) ? fx.places : [fx.places];
    p.forEach(t => types.add(t));
  }
  return types;
}

// ── Helper: check if two type-sets overlap ──
function hasOverlap(setA, setB) {
  for (const t of setA) {
    if (setB.has(t)) return true;
  }
  return false;
}

// ── Process ──
let totalRemoved = 0;
let totalKept = 0;
let cardsModified = 0;
const removedLog = [];

for (const [cardName, data] of Object.entries(ratings)) {
  if (!data.y || !Array.isArray(data.y) || data.y.length === 0) continue;
  // Skip "None significant"
  if (data.y.length === 1 && typeof data.y[0] === 'string') continue;

  const myTypes = getResTypes(cardName);
  if (myTypes.size === 0) {
    // This card has no annotations — can't match, keep all
    totalKept += data.y.length;
    continue;
  }

  const original = data.y.slice();
  const cleaned = [];
  const removed = [];

  for (const entry of data.y) {
    // entry is either ["CardName", value] or just "string"
    const targetName = Array.isArray(entry) ? entry[0] : entry;

    if (typeof targetName !== 'string') {
      cleaned.push(entry);
      totalKept++;
      continue;
    }

    const targetTypes = getResTypes(targetName);
    if (targetTypes.size > 0 && hasOverlap(myTypes, targetTypes)) {
      // Both have overlapping resource types → covered by SYNERGY_RULES
      removed.push(entry);
      totalRemoved++;
    } else {
      cleaned.push(entry);
      totalKept++;
    }
  }

  if (removed.length > 0) {
    cardsModified++;
    removedLog.push({
      card: cardName,
      removed: removed.map(e => Array.isArray(e) ? e[0] + ' (' + e[1] + ')' : e),
      kept: cleaned.map(e => Array.isArray(e) ? e[0] + ' (' + e[1] + ')' : e),
    });

    if (cleaned.length === 0) {
      data.y = ['None significant'];
    } else {
      data.y = cleaned;
    }
  }
}

// ── Write back ──
const output = 'const TM_RATINGS=' + JSON.stringify(ratings) + ';';
fs.writeFileSync(ratingsPath, output, 'utf8');

// ── Report ──
console.log('\n=== SYNERGY_RULES Y-CLEANUP REPORT ===');
console.log(`Cards modified: ${cardsModified}`);
console.log(`Entries removed: ${totalRemoved}`);
console.log(`Entries kept: ${totalKept}`);
console.log('');

for (const entry of removedLog) {
  console.log(`${entry.card}:`);
  console.log(`  REMOVED: ${entry.removed.join(', ')}`);
  console.log(`  KEPT:    ${entry.kept.length > 0 ? entry.kept.join(', ') : '(none → "None significant")'}`);
}

// Save log
const logPath = path.join(__dirname, 'y-rules-cleanup-log.json');
fs.writeFileSync(logPath, JSON.stringify(removedLog, null, 2), 'utf8');
console.log(`\nFull log: ${logPath}`);
