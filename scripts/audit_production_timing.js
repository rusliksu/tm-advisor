#!/usr/bin/env node
/**
 * Аудит production timing для проектных карт.
 *
 * Проблема: economy использует gen-1 множители для production,
 * но проектные карты играются в разные генерации.
 * Карта с 2 MC-prod за 10 MC — топ в gen 1, мусор в gen 7.
 *
 * Модель:
 * - Игра ~8.5 генераций (3P/WGT)
 * - Production получается ПОСЛЕ генерации в которой сыграл
 * - Gen 1 play → 8 prod phases → множитель 1.0 (baseline)
 * - Gen N play → (9-N) prod phases → множитель (9-N)/8
 *
 * Средний gen игры зависит от:
 * - Стоимости (дорогие = позже)
 * - Requirements (oxygen/temp/ocean = позже)
 * - Max requirements (Max -18°C = только рано)
 * - Space/Building tags (ti/steel payable = дешевле = раньше)
 */

const fs = require('fs');

const cards = JSON.parse(fs.readFileSync('data/all_cards.json', 'utf8'));
const evals = JSON.parse(fs.readFileSync('data/evaluations.json', 'utf8'));

// Gen-1 множители production (из CLAUDE.md)
const PROD_VALUES = {
  'MC': 5.5,       // 5-6 MC
  'steel': 8,
  'ti': 12.5,
  'plant': 8,
  'energy': 7.5,
  'heat': 4,
};

const TOTAL_GENS = 8.5; // средняя длина игры
const PROD_PHASES_FROM_GEN1 = 8; // baseline: play gen 1 → 8 production phases

// --- Оценка среднего gen игры ---

function estimateAvgGen(card, evalData) {
  let avgGen = 1.5; // default: cheap, no req

  // Эффективная стоимость
  let effectiveCost = card.cost || 0;
  const tags = card.tags || [];

  // Space tag → ti-payable (экономия ~5-8 MC)
  if (tags.includes('Space')) effectiveCost -= 6;
  // Building tag → steel-payable (экономия ~3-5 MC)
  if (tags.includes('Building')) effectiveCost -= 4;

  effectiveCost = Math.max(effectiveCost, 0);

  // Базовый gen по стоимости
  if (effectiveCost <= 10) avgGen = 1.5;
  else if (effectiveCost <= 18) avgGen = 2.0;
  else if (effectiveCost <= 25) avgGen = 2.5;
  else if (effectiveCost <= 32) avgGen = 3.0;
  else if (effectiveCost <= 40) avgGen = 3.5;
  else avgGen = 4.5;

  // Requirements сдвигают gen
  const req = (card.requirements || '').toLowerCase();

  // Max requirements = ранняя игра
  if (req.includes('max')) {
    if (req.includes('-18') || req.includes('-20') || req.includes('-24') || req.includes('-30'))
      avgGen = Math.min(avgGen, 1.5);
    else if (req.includes('-12') || req.includes('-14'))
      avgGen = Math.min(avgGen, 2.0);
    else if (req.includes('max 4') || req.includes('max 5') || req.includes('max 6'))
      avgGen = Math.min(avgGen, 2.5); // max oxygen
    return avgGen;
  }

  // Min requirements = поздняя игра
  // Temperature
  if (req.includes('°c') || req.includes('°') || req.includes('temperature')) {
    if (req.includes('-12') || req.includes('-14')) avgGen = Math.max(avgGen, 2.5);
    else if (req.includes('-6') || req.includes('-8')) avgGen = Math.max(avgGen, 3.0);
    else if (req.includes('0°') || req.includes('0 °')) avgGen = Math.max(avgGen, 4.0);
    else if (req.includes('4°') || req.includes('4 °') || req.includes('2°') || req.includes('2 °')) avgGen = Math.max(avgGen, 4.5);
    else if (req.includes('8°') || req.includes('8 °')) avgGen = Math.max(avgGen, 5.5);
  }

  // Oxygen
  if (req.includes('%') || req.includes('oxygen')) {
    const oxyMatch = req.match(/(\d+)%/);
    if (oxyMatch) {
      const oxy = parseInt(oxyMatch[1]);
      if (oxy <= 4) avgGen = Math.max(avgGen, 2.5);
      else if (oxy <= 6) avgGen = Math.max(avgGen, 3.5);
      else if (oxy <= 9) avgGen = Math.max(avgGen, 4.5);
      else if (oxy <= 13) avgGen = Math.max(avgGen, 5.5);
      else avgGen = Math.max(avgGen, 6.0);
    }
  }

  // Oceans
  if (req.includes('ocean')) {
    const oceanMatch = req.match(/(\d+)\s*ocean/);
    if (oceanMatch) {
      const oceans = parseInt(oceanMatch[1]);
      if (oceans <= 3) avgGen = Math.max(avgGen, 2.5);
      else if (oceans <= 5) avgGen = Math.max(avgGen, 3.5);
      else if (oceans <= 7) avgGen = Math.max(avgGen, 5.0);
      else avgGen = Math.max(avgGen, 6.0);
    }
  }

  // Venus
  if (req.includes('venus')) {
    const venusMatch = req.match(/(\d+)%?\s*venus/);
    if (venusMatch) {
      const venus = parseInt(venusMatch[1]);
      if (venus <= 8) avgGen = Math.max(avgGen, 3.0);
      else if (venus <= 14) avgGen = Math.max(avgGen, 4.0);
      else avgGen = Math.max(avgGen, 5.0);
    }
  }

  // Tag requirements (Science, etc.) — обычно gen 3-4
  if (req.includes('tag') || req.includes('science') || req.includes('earth') || req.includes('jovian')) {
    avgGen = Math.max(avgGen, 3.0);
  }

  return Math.min(avgGen, 7.5); // cap
}

// --- Парсинг production из economy текста ---

function parseProduction(economyText) {
  const prods = [];
  // Match patterns like: 2 MC-prod, 1 plant-prod, 3 ti-prod, etc.
  const regex = /(\d+)\s*(MC|steel|ti|titanium|plant|energy|heat)-prod/gi;
  let match;
  while ((match = regex.exec(economyText)) !== null) {
    let type = match[2].toLowerCase();
    if (type === 'titanium') type = 'ti';
    prods.push({
      amount: parseInt(match[1]),
      type: type,
      gen1Value: parseInt(match[1]) * (PROD_VALUES[type] || 5),
    });
  }
  return prods;
}

// --- Расчёт timing discount ---

function calcTimingDiscount(avgGen) {
  const prodPhases = Math.max(0, TOTAL_GENS - avgGen);
  const multiplier = prodPhases / PROD_PHASES_FROM_GEN1;
  return multiplier;
}

// --- Основной анализ ---

const projectCards = cards.filter(c =>
  c.type !== 'corporation' && c.type !== 'prelude' &&
  c.type !== 'Corporation' && c.type !== 'Prelude'
);

const results = [];

for (const card of projectCards) {
  const ev = evals[card.name];
  if (!ev || !ev.economy) continue;

  const prods = parseProduction(ev.economy);
  if (prods.length === 0) continue;

  const avgGen = estimateAvgGen(card, ev);
  const discount = calcTimingDiscount(avgGen);

  const totalGen1ProdValue = prods.reduce((sum, p) => sum + p.gen1Value, 0);
  const adjustedProdValue = totalGen1ProdValue * discount;
  const overestimate = totalGen1ProdValue - adjustedProdValue;

  // Прикинем сколько это в score points
  // Грубо: 1 MC value ≈ 0.8-1.2 score points в нашей шкале
  // (Donation = 21 MC = C60, Biosphere Support = 13 MC = D38 → ~22 MC range = 22 score points → 1 MC ≈ 1 point)
  const estimatedScoreOverestimate = Math.round(overestimate * 1.0);

  results.push({
    name: card.name,
    cost: card.cost,
    requirements: card.requirements || 'none',
    tags: (card.tags || []).join(', '),
    score: ev.score,
    tier: ev.tier,
    avgGen: avgGen.toFixed(1),
    discount: (discount * 100).toFixed(0) + '%',
    gen1ProdValue: Math.round(totalGen1ProdValue),
    adjustedProdValue: Math.round(adjustedProdValue),
    overestimate: Math.round(overestimate),
    scoreImpact: estimatedScoreOverestimate,
    prods: prods.map(p => `${p.amount} ${p.type}-prod`).join(' + '),
  });
}

// Сортируем по overestimate (наиболее завышенные сверху)
results.sort((a, b) => b.overestimate - a.overestimate);

// --- Вывод ---

console.log('=== PRODUCTION TIMING AUDIT ===');
console.log(`Всего проектных карт: ${projectCards.length}`);
console.log(`С production в economy: ${results.length}`);
console.log();

// Карты с значительным overestimate (>= 5 MC)
const flagged = results.filter(r => r.overestimate >= 5);
console.log(`ФЛАГНУТО (overestimate >= 5 MC): ${flagged.length} карт`);
console.log();

// Группировка по severity
const critical = flagged.filter(r => r.overestimate >= 10); // >= 10 MC overestimate
const warning = flagged.filter(r => r.overestimate >= 5 && r.overestimate < 10);

console.log(`🔴 CRITICAL (>=10 MC overestimate): ${critical.length} карт`);
console.log('─'.repeat(120));
console.log(
  'Card'.padEnd(35) +
  'Score'.padStart(6) +
  'Cost'.padStart(6) +
  'Requirements'.padEnd(20) +
  'AvgGen'.padStart(7) +
  'Gen1Val'.padStart(8) +
  'AdjVal'.padStart(8) +
  'Over'.padStart(6) +
  '  Production'
);
console.log('─'.repeat(120));

for (const r of critical) {
  console.log(
    r.name.padEnd(35) +
    `${r.tier}${r.score}`.padStart(6) +
    `${r.cost}`.padStart(6) +
    `  ${r.requirements}`.padEnd(20) +
    r.avgGen.padStart(7) +
    `${r.gen1ProdValue}`.padStart(8) +
    `${r.adjustedProdValue}`.padStart(8) +
    `${r.overestimate}`.padStart(6) +
    `  ${r.prods}`
  );
}

console.log();
console.log(`🟡 WARNING (5-9 MC overestimate): ${warning.length} карт`);
console.log('─'.repeat(120));
for (const r of warning) {
  console.log(
    r.name.padEnd(35) +
    `${r.tier}${r.score}`.padStart(6) +
    `${r.cost}`.padStart(6) +
    `  ${r.requirements}`.padEnd(20) +
    r.avgGen.padStart(7) +
    `${r.gen1ProdValue}`.padStart(8) +
    `${r.adjustedProdValue}`.padStart(8) +
    `${r.overestimate}`.padStart(6) +
    `  ${r.prods}`
  );
}

// Статистика по тирам
console.log();
console.log('=== СТАТИСТИКА ПО ТИРАМ ===');
const tierStats = {};
for (const r of results) {
  if (!tierStats[r.tier]) tierStats[r.tier] = { total: 0, flagged: 0, totalOver: 0 };
  tierStats[r.tier].total++;
  if (r.overestimate >= 5) {
    tierStats[r.tier].flagged++;
    tierStats[r.tier].totalOver += r.overestimate;
  }
}
for (const tier of ['S', 'A', 'B', 'C', 'D', 'F']) {
  const s = tierStats[tier];
  if (!s) continue;
  console.log(`${tier}: ${s.total} production cards, ${s.flagged} flagged (avg overest: ${s.flagged ? Math.round(s.totalOver / s.flagged) : 0} MC)`);
}

// Карты где timing correction может изменить tier
console.log();
console.log('=== ПОТЕНЦИАЛЬНЫЕ ИЗМЕНЕНИЯ ТИРА ===');
const TIER_THRESHOLDS = { S: 90, A: 80, B: 70, C: 55, D: 35, F: 0 };
function getTier(score) {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

const tierChanges = [];
for (const r of results) {
  const correctedScore = r.score - r.scoreImpact;
  const currentTier = getTier(r.score);
  const newTier = getTier(correctedScore);
  if (currentTier !== newTier && r.overestimate >= 3) {
    tierChanges.push({
      ...r,
      correctedScore: correctedScore,
      oldTier: currentTier,
      newTier: newTier,
    });
  }
}

tierChanges.sort((a, b) => b.overestimate - a.overestimate);
console.log(`Карт с потенциальной сменой тира: ${tierChanges.length}`);
for (const r of tierChanges) {
  console.log(
    `  ${r.name.padEnd(35)} ${r.oldTier}${r.score} → ${r.newTier}${r.correctedScore}` +
    `  (gen ${r.avgGen}, -${r.overestimate} MC from ${r.prods})`
  );
}

// Сохраняем результат
fs.writeFileSync('data/production_timing_audit.json', JSON.stringify(results, null, 2));
console.log();
console.log('Полные результаты → data/production_timing_audit.json');
