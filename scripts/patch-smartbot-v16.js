/**
 * patch-smartbot-v16.js — SP city fix + trade priority + colony build
 *
 * Fix 54: Allow city SP even when !pushGlobe — cities don't raise globals
 * Fix 55: SP fallback respects pushGlobe timing
 * Fix 56: Trade colonies with good value before weak card plays
 * Fix 57: Colony build earlier (before SP fallback) when affordable
 */
const fs = require('fs');
const file = process.argv[2] || '/home/openclaw/terraforming-mars/smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let changes = 0;

function replace(label, old, neu) {
  if (code.includes(old)) {
    code = code.replace(old, neu);
    changes++;
    console.log('OK: ' + label);
  } else {
    console.log('SKIP: ' + label + ' (pattern not found)');
  }
}

// Fix 54: Allow city SP when not pushing globe
// City SP (25 MC) gives VP + adjacency without raising any global parameter
// Current code: `if (spAvailable && pushGlobe)` blocks ALL SP including city
// Fix: always calculate city SP EV, only gate terraforming SPs by pushGlobe
replace('city SP always available',
  `    if (spAvailable && pushGlobe) {
      const tempDone = (gm.temperature ?? -30) >= 8;
      const o2Done = (gm.oxygenLevel ?? 0) >= 14;
      const oceansDone = (gm.oceans ?? 0) >= 9;
      // SP EV = TR value + tempo - cost
      if (!tempDone) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow - 14); // asteroid
      if (!oceansDone && mc >= 18 + redsTax) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + 2 - 18); // aquifer
      const venusDone2 = (gm.venusScaleLevel ?? 0) >= 30;
      if (!venusDone2) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow - 15); // air scrapping (Venus)
      if (!o2Done && mc >= 23 + redsTax) {
        const vpNow = gensLeftNow >= 6 ? 3 : gensLeftNow >= 3 ? 5 : 7;
        bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + vpNow - 23); // greenery SP
      }
    }`,
  `    if (spAvailable) {
      const tempDone2 = (gm.temperature ?? -30) >= 8;
      const o2Done2 = (gm.oxygenLevel ?? 0) >= 14;
      const oceansDone2 = (gm.oceans ?? 0) >= 9;
      // Terraforming SPs — only when pushGlobe allows
      if (pushGlobe) {
        if (!tempDone2) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow - 14);
        if (!oceansDone2 && mc >= 18 + redsTax) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + 2 - 18);
        const venusDone2 = (gm.venusScaleLevel ?? 0) >= 30;
        if (!venusDone2) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow - 15);
        if (!o2Done2 && mc >= 23 + redsTax) {
          const vpNow = gensLeftNow >= 6 ? 3 : gensLeftNow >= 3 ? 5 : 7;
          bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + vpNow - 23);
        }
      }
      // City SP — always available (doesn't raise globals)
      if (mc >= 25) {
        const cityVP = gensLeftNow >= 6 ? 3 : (gensLeftNow >= 3 ? 5 : 7);
        bestSpEV = Math.max(bestSpEV, cityVP * 2 + 2 - 25); // ~2 VP adj + positional - 25 MC
      }
    }`
);

// Fix 55: SP fallback respects pushGlobe
// Current: `if (spAvailable && steps > 12) return pick(stdProjIdx);`
// This bypasses all timing logic. Gate by pushGlobe.
replace('SP fallback respects timing',
  `    // SP fallback when globals still far
    if (spAvailable && steps > 12) return pick(stdProjIdx);`,
  `    // SP fallback when globals still far (only if timing allows)
    if (spAvailable && steps > 12 && pushGlobe) return pick(stdProjIdx);`
);

// Fix 56: Trade with good colonies before weak card plays
// Move high-value trade above the "card only" fallback
// A Luna trade at track 5 = 13 MC free. That beats any card with EV < 10
replace('trade before weak cards',
  `    // Card is only option (SP not available/affordable)
    // But skip if EV is very low — blue actions/trade likely better
    if (bestCard && bestCardEV >= 3) {`,
  `    // High-value trade before weak cards
    if (tradeIdx >= 0 && (mc >= 9 || energy >= 3 || titanium >= 3)) {
      const tradeOpt2 = opts[tradeIdx];
      const colonies2 = tradeOpt2?.coloniesModel || tradeOpt2?.colonies || [];
      if (colonies2.length > 0) {
        const bestTradeVal2 = Math.max(...colonies2.map(c => scoreColonyTrade(c, state)));
        const tradeCost2 = (energy >= 3 || titanium >= 3) ? 0 : 9;
        // Trade if net value > 5 (good trade beats weak card)
        if (bestTradeVal2 - tradeCost2 >= 5) return pick(tradeIdx);
      }
    }
    // Card is only option (SP not available/affordable)
    // But skip if EV is very low — blue actions/trade likely better
    if (bestCard && bestCardEV >= 3) {`
);

// Fix 57: Colony build earlier — before SP fallback
// Building a colony gives production bonus + future trade income ≈ 10-15 MC value
// Currently at priority 11 (after SP fallback, low-threshold trade)
// Move it up: build colony when we have spare MC and colonies are available
replace('colony build priority',
  `    // Build colony (production bonus)
    if (colonyIdx >= 0 && mc >= 17) return pick(colonyIdx);`,
  `    // Build colony (production bonus + trade income ≈ 10-15 MC)
    // Build early for max trade value over remaining gens
    if (colonyIdx >= 0 && mc >= 17 && gen <= 10) return pick(colonyIdx);
    // Late game: only build if very affordable
    if (colonyIdx >= 0 && mc >= 25) return pick(colonyIdx);`
);

fs.writeFileSync(file, code);
console.log('\n' + changes + ' fixes applied to ' + file);
