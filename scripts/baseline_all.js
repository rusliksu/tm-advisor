const fs = require('fs'), vm = require('vm');
const ctx = vm.createContext({ console, Math, Set, Object, Array, JSON, parseInt, parseFloat, isNaN, undefined, NaN, Infinity });
ctx.window = ctx; ctx.global = ctx;

function loadJS(file) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/^const /gm, 'var ');
  vm.runInContext(code, ctx);
}

['extension/data/card_data.js','extension/data/card_tags.js',
 'extension/data/card_effects.json.js','extension/data/card_vp.js',
 'extension/data/card_tag_reqs.js','extension/tm-brain.js',
 'extension/ratings.json.js'
].forEach(loadJS);

ctx.TM_BRAIN.setCardData(ctx.TM_CARD_TAGS, ctx.TM_CARD_VP, ctx.TM_CARD_DATA, ctx.TM_CARD_GLOBAL_REQS, ctx.TM_CARD_TAG_REQS);

const ratings = ctx.TM_RATINGS;
const eff = ctx.TM_CARD_EFFECTS;
const cardData = ctx.TM_CARD_DATA;

// Project cards: cost > 0 in effects (corps/preludes/CEOs all have c=0 or no c)
// No real project card in TM costs 0 MC (minimum is 1)
const projectNames = Object.keys(eff).filter(n => eff[n] && eff[n].c > 0);

const results = projectNames.map(name => {
  try {
    const r = ctx.TM_BRAIN.scoreCardBaseline(name);
    const rat = ratings[name];
    r.tier = rat ? rat.t + rat.s : '--';
    r.cost = eff[name].c;
    return r;
  } catch(e) { return { name, score: -999, tier: '??', cost: 0 }; }
}).sort((a, b) => b.score - a.score);

console.log('Project cards scored:', results.length);
console.log('\n=== TOP 30 ===');
console.log('#  | Card                                | Cost | Baseline EV | Rating');
results.slice(0, 30).forEach((r, i) =>
  console.log(`${String(i+1).padStart(2)}. ${r.name.padEnd(37)} ${String(r.cost).padStart(2)} | ${String(r.score).padStart(7)} | ${r.tier}`)
);
console.log('\n=== BOTTOM 15 ===');
results.slice(-15).forEach(r =>
  console.log(`    ${r.name.padEnd(37)} ${String(r.cost).padStart(2)} | ${String(r.score).padStart(7)} | ${r.tier}`)
);

// === DIVERGENCE ANALYSIS ===
const evMin = results[results.length - 1].score;
const evMax = results[0].score;
const evRange = evMax - evMin || 1;

const divergences = results
  .filter(r => r.tier !== '--' && r.tier !== '??')
  .map(r => {
    const manualScore = parseInt(r.tier.slice(1));
    const normalizedEV = ((r.score - evMin) / evRange) * 100;
    const delta = normalizedEV - manualScore;
    return { name: r.name, ev: r.score, normEV: Math.round(normalizedEV), manual: manualScore, manualTier: r.tier[0], delta: Math.round(delta), cost: r.cost };
  })
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

console.log('\n=== BIGGEST DIVERGENCES (baseline overrates) ===');
console.log('#  | Card                                | Cost | EV→norm | Manual | Delta');
divergences.filter(d => d.delta > 0).slice(0, 20).forEach((d, i) =>
  console.log(`${String(i+1).padStart(2)}. ${d.name.padEnd(37)} ${String(d.cost).padStart(2)} | ${String(d.normEV).padStart(5)} | ${d.manualTier}${d.manual} | +${d.delta}`)
);

console.log('\n=== BIGGEST DIVERGENCES (baseline underrates) ===');
divergences.filter(d => d.delta < 0).slice(0, 20).forEach((d, i) =>
  console.log(`${String(i+1).padStart(2)}. ${d.name.padEnd(37)} ${String(d.cost).padStart(2)} | ${String(d.normEV).padStart(5)} | ${d.manualTier}${d.manual} | ${d.delta}`)
);

// Stats
const withRating = divergences.length;
const avgAbsDelta = divergences.reduce((s, d) => s + Math.abs(d.delta), 0) / withRating;
const within10 = divergences.filter(d => Math.abs(d.delta) <= 10).length;
console.log(`\n=== STATS ===`);
console.log(`Cards with rating: ${withRating}`);
console.log(`Avg |delta|: ${avgAbsDelta.toFixed(1)}`);
console.log(`Within ±10: ${within10}/${withRating} (${(within10/withRating*100).toFixed(0)}%)`);
