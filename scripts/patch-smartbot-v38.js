/**
 * patch-smartbot-v38.js — Fix trade priority + refine early colony
 *
 * Fix 102: Revert Fix 101 — trade threshold back to tradeCost + 3 at main position
 *          Low-profit trades already handled lower in the chain (line 691 fallback)
 * Fix 103: Refine Fix 99 — early colony only when energy trade available (cheap flights)
 *          User insight: colonies are good if you can fly for energy, otherwise cards > colony
 *
 * Applied AFTER v37. Fix 100 (aggressive sell) is preserved.
 *
 * Usage: node patch-smartbot-v38.js [path-to-smartbot.js]
 */

const fs = require('fs');
const path = process.argv[2] || 'smartbot.js';
const file = fs.readFileSync(path, 'utf8');
let code = file;
let fixes = 0;

// ===== Fix 102: Revert trade threshold to tradeCost + 3 =====
// Fix 101 set tradeMinProfit = gen <= 5 ? 1 : 3, causing marginal trades
// to fire BEFORE colony building. Revert to always net >= 3 at main position.
// The fallback trade at line 691 (after colonies) handles low-profit trades.

const tradeOld = `        const tradeMinProfit = gen <= 5 ? 1 : 3;
        if (bestTradeVal >= tradeCost + tradeMinProfit) return pick(tradeIdx);`;

const tradeNew = `        if (bestTradeVal >= tradeCost + 3) return pick(tradeIdx);`;

if (code.includes(tradeOld)) {
  code = code.replace(tradeOld, tradeNew);
  fixes++;
  console.log('Fix 102 applied: reverted trade threshold to tradeCost + 3');
} else {
  console.log('Fix 102 SKIPPED: trade pattern not found');
}

// ===== Fix 103: Early colony only if energy trade available =====
// Fix 99 built colonies gen 1-5 unconditionally at mc >= 17.
// User insight: colonies compound, but only worth it if you can trade cheaply.
// energy >= 3 means trade costs ~5 MC (vs 9 MC cash), so colony + trade = good ROI.
// Without energy, 17 MC colony + 9 MC trade = 26 MC for first cycle — too expensive early.

const colonyOld = `    // Fix 99: Early colony building — colonies compound, build before wasting MC on marginal trades
    if (colonyIdx >= 0 && mc >= 17 && gen <= 5) {
      console.log('    \\u2192 EARLY colony build (gen=' + gen + ' mc=' + mc + ')');
      return pick(colonyIdx);
    }`;

const colonyNew = `    // Fix 99v2: Early colony — only when energy trade available (cheap flights)
    if (colonyIdx >= 0 && mc >= 17 && gen <= 5 && energy >= 3) {
      console.log('    \\u2192 EARLY colony build (gen=' + gen + ' mc=' + mc + ' energy=' + energy + ')');
      return pick(colonyIdx);
    }`;

if (code.includes(colonyOld)) {
  code = code.replace(colonyOld, colonyNew);
  fixes++;
  console.log('Fix 103 applied: early colony requires energy >= 3');
} else {
  // Try with literal arrow
  const colonyOldAlt = colonyOld.replace(/\\u2192/g, '\u2192');
  const colonyNewAlt = colonyNew.replace(/\\u2192/g, '\u2192');
  if (code.includes(colonyOldAlt)) {
    code = code.replace(colonyOldAlt, colonyNewAlt);
    fixes++;
    console.log('Fix 103 applied (unicode arrow): early colony requires energy >= 3');
  } else {
    console.log('Fix 103 SKIPPED: colony pattern not found');
  }
}

if (fixes > 0) {
  fs.writeFileSync(path, code, 'utf8');
  console.log(`\nDone: ${fixes}/2 fixes applied to ${path}`);
} else {
  console.log('\nNo fixes applied — check patterns');
  process.exit(1);
}
