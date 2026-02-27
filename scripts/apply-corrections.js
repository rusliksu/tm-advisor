#!/usr/bin/env node
/**
 * apply-corrections.js — Применить корректировки рейтингов на основе мета-анализа
 *
 * Usage: node scripts/apply-corrections.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RATINGS_PATH = path.join(ROOT, 'extension/data/ratings.json.js');

const raw = fs.readFileSync(RATINGS_PATH, 'utf8');
const fn = new Function(raw.replace(/^const /, 'var ') + '\nreturn TM_RATINGS;');
const R = fn();

const dryRun = process.argv.includes('--dry-run');

function tier(score) {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

function apply(name, newScore, reason) {
  if (!R[name]) {
    console.log(`  [!] ${name} — не найден в рейтингах`);
    return;
  }
  const old = R[name];
  const oldTier = old.t;
  const oldScore = old.s;
  const newTier = tier(newScore);

  if (oldScore === newScore) return;

  const arrow = newScore > oldScore ? '▲' : '▼';
  const delta = newScore - oldScore;
  const sign = delta > 0 ? '+' : '';
  console.log(`  ${arrow} ${name}: ${oldTier}${oldScore} → ${newTier}${newScore} (${sign}${delta}) — ${reason}`);

  old.s = newScore;
  old.t = newTier;
}

console.log('');
console.log('══════════════════════════════════════════════════════════');
console.log('  Rating Corrections — based on meta-analysis (21 games)');
console.log('══════════════════════════════════════════════════════════');

// ═══════════════════════════════════════
// CORPORATIONS
// ═══════════════════════════════════════
console.log('\n── Corporations ──');

apply('Ringcom', 85, '2/2 WR, avg 187 VP — два разгрома (163, 211 VP). Доминирующая corp с колониями');
apply('Viron', 65, '1/2 WR, avg 107 VP. C62 заниженo — action doubling сильнее чем оценка');
apply('Tycho Magnetics', 72, '1/2 WR, avg 131 VP. Energy+science combo. С animal VP картами — очень силён');

// ═══════════════════════════════════════
// PROJECT CARDS — overperformers (raise)
// ═══════════════════════════════════════
console.log('\n── Project Cards — overperformers (raise) ──');

apply('Water Import From Europa', 72, '8/8=100% WR. Jovian multiplier + ocean action. Ti-payable. Сильнее чем C64');
apply('Extremophiles', 73, '8/10=80% WR. Cheap Venus+Microbe engine. Placement target для Decomposers/Ants');
apply('Bushes', 73, '6/7=86% WR. Эффективный plant-prod (16 MC за 13 MC). Greenery enabler');
apply('Public Plans', 58, '7/9=78% WR. D50 заниженo — дешёвый VP + card refund. Legend milestone help');
apply('Callisto Penal Mines', 52, '6/8=75% WR. Jovian tag + ti dump. D46 заниженo для Jovian стратегий');
apply('Floating Refinery', 66, '5/6=83% WR. Venus floater engine лучше чем C62 — масштабируется с Venus тегами');
apply('Fusion Power', 66, '5/6=83% WR. Energy efficiency при выполненном req. C63 заниженo');
apply('Crash Site Cleanup', 66, '4/5=80% WR. Cheap VP + titanium/steel. C63→C66');
apply('Bribed Committee', 67, '4/5=80% WR. 2 TR за 10 MC total — cheap tempo. C64→C67');
apply('Martian Lumber Corp', 63, '5/5=100% WR. Building+Plant tags для NRA. C58 заниженo');
apply('Ceres Tech Market', 73, '6/7=86% WR. Science+Space combo + colony rebate + card cycling. B71→B73');
apply('Venusian Animals', 78, '4/5=80% WR. VP per science tag — scales well. B76→B78');

// ═══════════════════════════════════════
// PROJECT CARDS — underperformers (lower)
// ═══════════════════════════════════════
console.log('\n── Project Cards — underperformers (lower) ──');

apply('Spin-off Department', 85, '1/9=11% WR при S92. 9 игр — значимая выборка. Дорогой, медленный card draw');
apply('Large Convoy', 78, '2/10=20% WR. Дорогой animal placer, но 39 MC за ~2-4 VP + ocean — слабая конверсия');
apply('Nuclear Zone', 76, '2/9=22% WR. A80 завышено — дорогой temp raise, -2 VP больно');
apply('Arctic Algae', 80, '1/5=20% WR. Req -12C ограничивает timing. A84→A80');
apply('Giant Ice Asteroid', 80, '1/5=20% WR. 39 MC ti-payable, но часто too expensive. A84→A80');
apply('Venus Orbital Survey', 73, '0/5=0% WR. Action card draw — медленная без Venus focus');
apply('Ice Moon Colony', 73, '0/5=0% WR. 26 MC за ocean+colony — дорого для value');
apply('Meat Industry', 74, '2/10=20% WR. Needs animal cards which aren\'t guaranteed');
apply('Electro Catapult', 73, '1/6=17% WR. Req 8% O2 limit + energy cost. B77 завышено');
apply('Energy Market', 68, '0/5=0% WR. Conversion action слишком slow');

// ═══════════════════════════════════════
// CEO — mechanical analysis corrections
// ═══════════════════════════════════════
console.log('\n── CEOs — mechanical analysis ──');

apply('Greta', 85, 'Описание говорит "лучший или 2й CEO", но рейтинг B72. 4 MC/TR raise за gen = 16-32 MC. A85');
apply('Gordon', 76, 'Ongoing +2 MC/tile на Mars (12-16 MC total) + ignore placement = надёжный ongoing. B76');
apply('HAL9000', 55, 'Late-game burst: 43 MC ресурсов за 1-2 gen production loss. D45 заниженo для closer');
apply('Floyd', 63, 'One-shot discount 19-25 MC. Нужна дорогая карта-target. C68 завышено без target');
apply('Ingrid', 63, 'One-gen card draw per Mars tile. 4-5 tiles = 12-15 MC value. C60→C63');
apply('Clarke', 60, 'Plant+heat burst + prod. Decent greenery push. C55→C60');

// ═══════════════════════════════════════
// PRELUDES — based on game data
// ═══════════════════════════════════════
console.log('\n── Preludes ──');

apply('Nobel Prize', 52, '4/7=57% WR при D45. Чаще приносит победу чем D-tier suggests. Cheap VP enabler');
apply('Io Research Outpost', 48, '2/5=40% WR при D43. Jovian tag + card draw ongoing. Slight bump');
apply('Allied Bank', 75, '0/3=0% WR при A80. 3 games мало, но avg 73 VP — underperforming. A80→B75');
apply('Research Network', 70, '0/3=0% WR при B73. Avg 61 VP — lowest VP of any prelude. B73→B70');
apply('Smelting Plant', 68, '0/2=0% WR при B72. Avg 63 VP. Building prod менее ценен. B72→C68');
apply('Polar Industries', 70, '0/2=0% WR при B74. Avg 73 VP. B74→B70');

// ═══════════════════════════════════════
// Save
// ═══════════════════════════════════════

if (dryRun) {
  console.log('\n[DRY RUN] Не сохраняю. Уберите --dry-run для записи.');
} else {
  // Rebuild the file
  const header = raw.match(/^.*?=\s*/)?.[0] || 'const TM_RATINGS = ';
  const newContent = header + JSON.stringify(R, null, 2) + ';\n';
  fs.writeFileSync(RATINGS_PATH, newContent);
  console.log(`\nСохранено в ${RATINGS_PATH}`);
  console.log(`Всего записей: ${Object.keys(R).length}`);
}
